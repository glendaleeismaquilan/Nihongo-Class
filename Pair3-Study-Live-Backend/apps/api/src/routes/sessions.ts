import { Router } from "express";
import { Timestamp } from "firebase-admin/firestore";
import {
  JOIN_OPENS_MINUTES_BEFORE,
  LATE_AFTER_MINUTES,
  addDaysToKey,
  attendancePutSchema,
  dateKey,
  sessionCreateSchema,
  sessionPatchSchema,
  timeKey,
  zonedTimeToUtc,
  type AttendanceRowDto,
  type AttendanceStatus,
  type LiveSessionDto,
} from "@nihongo/shared";
import { env } from "../env";
import { db } from "../firebase";
import { attendanceId, col, type AttendanceDoc, type LiveSessionDoc, type UserDoc } from "../db";
import { assertClassAccess } from "../lib/access";
import { currentUser, requireRole } from "../lib/auth";
import { badRequest, conflict, notFound } from "../lib/errors";
import { notify } from "../lib/notify";
import { iso, isoOrNull, now, toDate } from "../lib/time";
import { params, parse } from "../lib/validate";
import { formatSessionTime } from "../services/jobs";
import { GoogleReconnectError } from "../services/calendar";
import {
  UNAVAILABLE_MESSAGE,
  activeStudentEmails,
  addToCalendarUrl,
  createMeetEvent,
  eventBody,
  hostCalendar,
  markNeedsReconnect,
  withHostCalendar,
  type GoogleUnavailable,
} from "../services/liveSessions";
import { peopleRefs } from "./classes";

export const sessionsRouter = Router();
const staff = requireRole("teacher", "school_admin");

export function sessionDto(id: string, d: LiveSessionDoc, opts: { withMeet: boolean; people?: Map<string, UserDoc>; myAttendance?: AttendanceStatus | null; forStudent?: boolean; className?: string }): LiveSessionDto {
  const dto: LiveSessionDto = {
    id,
    classId: d.classId,
    ...(opts.className ? { className: opts.className } : {}),
    hostUid: d.hostUid,
    hostName: opts.people?.get(d.hostUid)?.name ?? null,
    title: d.title,
    description: d.description ?? null,
    startAt: iso(d.startAt),
    endAt: iso(d.endAt),
    provider: d.provider,
    inviteStudents: d.inviteStudents,
    status: d.status,
  };
  // FR-3.11.10: meetUrl only for users with access to the class.
  if (opts.withMeet && d.status !== "cancelled") dto.meetUrl = d.meetUrl;
  if (!opts.forStudent) dto.calendarEventId = d.calendarEventId ?? null;
  if (opts.myAttendance !== undefined) dto.myAttendance = opts.myAttendance;
  if (opts.forStudent && opts.withMeet && !d.inviteStudents && d.status === "scheduled") dto.addToCalendarUrl = addToCalendarUrl(d);
  return dto;
}

async function schoolTimeZone(schoolId: string) {
  return (await col.schools().doc(schoolId).get()).data()?.timeZone || env.DEFAULT_TIME_ZONE;
}

async function activeStudentUids(classId: string) {
  const snap = await col.enrollments().where("classId", "==", classId).where("status", "==", "active").get();
  return snap.docs.map((d) => d.data().uid);
}

async function loadSession(id: string) {
  const snap = await col.liveSessions().doc(id).get();
  if (!snap.exists) throw notFound("Live class not found.");
  return snap.data()!;
}

// ---------- List (FR-3.11.7) ----------

sessionsRouter.get("/classes/:id/sessions", requireRole("teacher", "school_admin", "student"), async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const { isStaff } = await assertClassAccess(u, id, "member");
  const snap = await col.liveSessions().where("classId", "==", id).orderBy("startAt").limit(500).get();
  const people = await peopleRefs(snap.docs.map((d) => d.data().hostUid));
  let mine = new Map<string, AttendanceStatus>();
  if (!isStaff && !snap.empty) {
    const att = await db.getAll(...snap.docs.map((d) => col.attendance().doc(attendanceId(d.id, u.uid))));
    mine = new Map(att.filter((a) => a.exists).map((a) => [(a.data() as AttendanceDoc).sessionId, (a.data() as AttendanceDoc).status]));
  }
  res.json({
    items: snap.docs.map((d) => sessionDto(d.id, d.data(), { withMeet: true, people, forStudent: !isStaff, ...(isStaff ? {} : { myAttendance: mine.get(d.id) ?? null }) })),
  });
});

// ---------- Schedule (FR-3.11.2 to FR-3.11.5) ----------

sessionsRouter.post("/classes/:id/sessions", staff, async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const body = parse(sessionCreateSchema, req.body);
  const { cls } = await assertClassAccess(u, id, "staff", { write: true });
  const tz = await schoolTimeZone(cls.schoolId);
  const slots = Array.from({ length: body.repeatWeeks }, (_, i) => {
    const startAt = zonedTimeToUtc(addDaysToKey(body.date, 7 * i), body.startTime, tz);
    return { startAt, endAt: new Date(startAt.getTime() + body.durationMinutes * 60_000) };
  });
  if (slots[0].endAt.getTime() <= Date.now()) throw badRequest("Choose a time in the future.", { issues: [{ path: "date", message: "This time has already passed." }] }, "validation_error");

  const attendees = body.inviteStudents ? await activeStudentEmails(id) : undefined;
  const events: { id: string; meetUrl: string }[] = [];
  let fallback: GoogleUnavailable | "google_error" | null = null;
  if (body.useGoogle) {
    const cal = await hostCalendar(u.uid);
    if ("unavailable" in cal) fallback = cal.unavailable;
    else {
      try {
        for (const s of slots) events.push(await createMeetEvent(cal.provider, cal.refreshToken, eventBody({ ...body, ...s, classId: id }, tz, attendees), body.inviteStudents));
      } catch (err) {
        // All or nothing: a series never mixes automatic and missing links.
        for (const e of events) await cal.provider.remove(cal.refreshToken, e.id, "none").catch(() => undefined);
        events.length = 0;
        if (err instanceof GoogleReconnectError) {
          await markNeedsReconnect(u.uid);
          fallback = "needs_reconnect";
        } else fallback = "google_error";
      }
    }
  }
  if (!events.length && !body.meetUrl) {
    // FR-3.11.4: the form explains why and asks for a pasted link.
    const reason = body.useGoogle ? (fallback ?? "not_connected") : null;
    throw conflict(reason ? UNAVAILABLE_MESSAGE[reason] : "Paste a Google Meet link for this live class.", "meet_link_required", { reason });
  }

  const batch = db.batch();
  const created: { id: string; doc: LiveSessionDoc }[] = [];
  slots.forEach((s, i) => {
    const ref = col.liveSessions().doc();
    const doc: LiveSessionDoc = {
      classId: id,
      schoolId: cls.schoolId,
      hostUid: u.uid,
      title: body.title,
      description: body.description ?? null,
      startAt: Timestamp.fromDate(s.startAt),
      endAt: Timestamp.fromDate(s.endAt),
      provider: events[i] ? "google" : "manual",
      meetUrl: events[i]?.meetUrl ?? body.meetUrl!,
      calendarEventId: events[i]?.id ?? null,
      inviteStudents: body.inviteStudents && !!events[i],
      invitedEmails: events[i] ? (attendees ?? []) : [],
      status: "scheduled",
      reminderSentAt: null,
      createdAt: now(),
      updatedAt: now(),
    };
    batch.set(ref, doc);
    created.push({ id: ref.id, doc });
  });
  await batch.commit();
  await notify(await activeStudentUids(id), {
    type: "session.scheduled",
    title: `Live class scheduled: ${body.title}`,
    body: `${cls.name}, ${formatSessionTime(created[0].doc.startAt, tz)}${created.length > 1 ? `, weekly for ${created.length} weeks` : ""}`,
    link: `/s/classes/${id}/live`,
  });
  res.status(201).json({
    items: created.map((c) => sessionDto(c.id, c.doc, { withMeet: true })),
    fallbackReason: events.length ? null : fallback,
    notice: !events.length && fallback ? UNAVAILABLE_MESSAGE[fallback].replace(/ Paste a Google Meet link.*$/, " Your pasted link was used instead.") : null,
  });
});

// ---------- Edit and cancel (FR-3.11.6) ----------

sessionsRouter.patch("/sessions/:id", staff, async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const body = parse(sessionPatchSchema, req.body);
  const s = await loadSession(id);
  const { cls } = await assertClassAccess(u, s.classId, "staff", { write: true });
  if (s.status !== "scheduled") throw conflict("Only upcoming live classes can be edited.", "session_not_editable");
  const tz = await schoolTimeZone(cls.schoolId);
  const date = body.date ?? dateKey(toDate(s.startAt), tz);
  const time = body.startTime ?? timeKey(toDate(s.startAt), tz);
  const duration = body.durationMinutes ?? Math.round((toDate(s.endAt).getTime() - toDate(s.startAt).getTime()) / 60_000);
  const startAt = zonedTimeToUtc(date, time, tz);
  const endAt = new Date(startAt.getTime() + duration * 60_000);
  const update: Partial<LiveSessionDoc> = { startAt: Timestamp.fromDate(startAt), endAt: Timestamp.fromDate(endAt), updatedAt: now() };
  if (body.title) update.title = body.title;
  if (body.description !== undefined) update.description = body.description || null;
  if (body.meetUrl && s.provider === "manual") update.meetUrl = body.meetUrl;
  const invite = body.inviteStudents ?? s.inviteStudents;
  if (s.calendarEventId) {
    update.inviteStudents = invite;
    const attendees = invite ? await activeStudentEmails(s.classId) : [];
    update.invitedEmails = attendees;
    await withHostCalendar(s.hostUid, (p, token) =>
      p.patch(token, s.calendarEventId!, eventBody({ title: update.title ?? s.title, description: update.description ?? s.description, startAt, endAt, classId: s.classId }, tz, attendees), invite ? "all" : "none"),
    );
  }
  await col.liveSessions().doc(id).update(update);
  const next = { ...s, ...update } as LiveSessionDoc;
  await notify(await activeStudentUids(s.classId), {
    type: "session.updated",
    title: `Live class updated: ${next.title}`,
    body: `${cls.name}, now ${formatSessionTime(next.startAt, tz)}`,
    link: `/s/classes/${s.classId}/live`,
  });
  res.json(sessionDto(id, next, { withMeet: true }));
});

/** Cancelled sessions stay listed as cancelled. */
sessionsRouter.delete("/sessions/:id", staff, async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const s = await loadSession(id);
  const { cls } = await assertClassAccess(u, s.classId, "staff");
  if (s.status === "cancelled") {
    res.status(204).end();
    return;
  }
  if (s.status === "completed") throw conflict("This live class has already happened.", "session_completed");
  if (s.calendarEventId) await withHostCalendar(s.hostUid, (p, token) => p.remove(token, s.calendarEventId!, s.inviteStudents ? "all" : "none"));
  await col.liveSessions().doc(id).update({ status: "cancelled", updatedAt: now() });
  const tz = await schoolTimeZone(cls.schoolId);
  await notify(await activeStudentUids(s.classId), {
    type: "session.cancelled",
    title: `Live class cancelled: ${s.title}`,
    body: `${cls.name}, ${formatSessionTime(s.startAt, tz)}`,
    link: `/s/classes/${s.classId}/live`,
  });
  res.status(204).end();
});

// ---------- Attendance (FR-3.11.8) ----------

/** Join records a check-in; more than 10 minutes after the start counts as late. */
sessionsRouter.post("/sessions/:id/check-in", requireRole("student"), async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const s = await loadSession(id);
  await assertClassAccess(u, s.classId, "student");
  const t = Date.now();
  const start = toDate(s.startAt).getTime();
  if (s.status !== "scheduled" || t < start - JOIN_OPENS_MINUTES_BEFORE * 60_000 || t > toDate(s.endAt).getTime()) {
    throw conflict("This live class isn't open to join right now.", "join_window_closed");
  }
  const ref = col.attendance().doc(attendanceId(id, u.uid));
  const record = await db.runTransaction(async (tx) => {
    const prev = (await tx.get(ref)).data();
    // Keep the first check-in and anything the teacher already set.
    if (prev && (prev.source === "teacher" || prev.joinedAt)) return prev;
    const doc: AttendanceDoc = {
      sessionId: id,
      classId: s.classId,
      uid: u.uid,
      status: t > start + LATE_AFTER_MINUTES * 60_000 ? "late" : "present",
      joinedAt: Timestamp.fromMillis(t),
      source: "join_click",
      updatedBy: null,
      updatedAt: now(),
    };
    tx.set(ref, doc);
    return doc;
  });
  res.json({ status: record.status, joinedAt: isoOrNull(record.joinedAt) });
});

async function attendanceRows(sessionId: string, classId: string): Promise<AttendanceRowDto[]> {
  const [uids, att] = await Promise.all([activeStudentUids(classId), col.attendance().where("sessionId", "==", sessionId).get()]);
  const byUid = new Map(att.docs.map((a) => [a.data().uid, a.data()]));
  const all = [...new Set([...uids, ...byUid.keys()])];
  const people = await peopleRefs(all);
  return all
    .map((uid) => {
      const a = byUid.get(uid);
      return { uid, name: people.get(uid)?.name ?? "Student", status: a?.status ?? null, joinedAt: isoOrNull(a?.joinedAt), source: a?.source ?? null };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

sessionsRouter.get("/sessions/:id/attendance", staff, async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const s = await loadSession(id);
  await assertClassAccess(u, s.classId, "staff");
  res.json({ session: sessionDto(id, s, { withMeet: true }), items: await attendanceRows(id, s.classId) });
});

/** After a session, the teacher sets each student to present, late, absent, or excused. */
sessionsRouter.put("/sessions/:id/attendance", staff, async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const body = parse(attendancePutSchema, req.body);
  const s = await loadSession(id);
  const { cls } = await assertClassAccess(u, s.classId, "staff");
  if (s.status === "cancelled") throw conflict("This live class was cancelled.", "session_cancelled");
  if (toDate(s.startAt).getTime() > Date.now() + JOIN_OPENS_MINUTES_BEFORE * 60_000) throw conflict("Attendance opens when the live class starts.", "session_not_started");
  const refs = body.records.map((r) => col.attendance().doc(attendanceId(id, r.uid)));
  const prev = await db.getAll(...refs);
  const batch = db.batch();
  body.records.forEach((r, i) => {
    const before = prev[i].data() as AttendanceDoc | undefined;
    if (before?.status === r.status) return;
    batch.set(refs[i], { sessionId: id, classId: s.classId, uid: r.uid, status: r.status, joinedAt: before?.joinedAt ?? null, source: "teacher", updatedBy: u.uid, updatedAt: now() } satisfies AttendanceDoc);
    batch.set(col.auditLogs().doc(), { actorUid: u.uid, action: "attendance.changed", targetType: "attendance", targetId: refs[i].id, schoolId: cls.schoolId, before: before ? { status: before.status } : null, after: { status: r.status }, createdAt: now() });
  });
  await batch.commit();
  res.json({ items: await attendanceRows(id, s.classId) });
});

