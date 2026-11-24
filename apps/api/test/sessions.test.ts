import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { attendanceId, col, enrollmentId, type AttendanceDoc } from "../src/db";
import { encryptSecret } from "../src/lib/crypto";
import { now } from "../src/lib/time";
import { GoogleReconnectError, setCalendarProvider, type CalendarProvider, type EventInput } from "../src/services/calendar";
import { afterEnrollmentActivated } from "../src/services/enrollment";
import { completeSessions } from "../src/services/jobs";
import { api, bearer, createUser, createWorld, findKeys, seedClass, seedEnrollment, type TestUser, type World } from "./helpers";

interface FakeCall {
  op: string;
  eventId?: string;
  event?: Partial<EventInput>;
  sendUpdates?: string;
}

class FakeCalendar implements CalendarProvider {
  calls: FakeCall[] = [];
  failWith: Error | null = null;
  pendingFirst = false;
  failAfter: number | null = null;
  inserted = 0;
  async authUrl(state: string) {
    return `https://accounts.google.com/o/oauth2/v2/auth?state=${state}&access_type=offline&prompt=consent`;
  }
  async exchangeCode(code: string) {
    if (code === "bad") throw new Error("bad code");
    return { refreshToken: `refresh-${code}`, email: "sensei@gmail.com", scopes: ["openid", "email", "https://www.googleapis.com/auth/calendar.events"] };
  }
  async revoke() {}
  async insert(_t: string, event: EventInput, sendUpdates: "all" | "none") {
    this.calls.push({ op: "insert", eventId: event.id, event, sendUpdates });
    if (this.failWith) throw this.failWith;
    if (this.failAfter !== null && this.inserted >= this.failAfter) throw new Error("Google 500");
    this.inserted++;
    if (this.pendingFirst) return { id: event.id!, meetUrl: null, pending: true };
    return { id: event.id!, meetUrl: `https://meet.google.com/abc-${event.id!.slice(0, 4)}-xyz`, pending: false };
  }
  async get(_t: string, eventId: string) {
    this.calls.push({ op: "get", eventId });
    return { id: eventId, meetUrl: `https://meet.google.com/pen-${eventId.slice(0, 4)}-ing`, pending: false };
  }
  async patch(_t: string, eventId: string, event: Partial<EventInput>, sendUpdates: "all" | "none") {
    this.calls.push({ op: "patch", eventId, event, sendUpdates });
    if (this.failWith) throw this.failWith;
  }
  async remove(_t: string, eventId: string, sendUpdates: "all" | "none") {
    this.calls.push({ op: "remove", eventId, sendUpdates });
  }
}

const fake = new FakeCalendar();
let w: World;
let classId: string;

const futureDate = (days: number) => {
  const d = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
};

async function connectGoogle(u: TestUser, status: "connected" | "needs_reconnect" = "connected") {
  await col.integrations().doc(u.uid).set({ provider: "google", googleEmail: "sensei@gmail.com", refreshTokenEncrypted: encryptSecret("refresh-token"), scopes: [], status, connectedAt: now() });
}

async function seedSession(minutesFromNow: number, durationMinutes = 60, overrides: Record<string, unknown> = {}) {
  const ref = col.liveSessions().doc();
  const start = Date.now() + minutesFromNow * 60_000;
  await ref.set({
    classId,
    schoolId: w.schoolId,
    hostUid: w.teacher.uid,
    title: "Seeded session",
    description: null,
    startAt: Timestamp.fromMillis(start),
    endAt: Timestamp.fromMillis(start + durationMinutes * 60_000),
    provider: "manual",
    meetUrl: "https://meet.google.com/aaa-bbbb-ccc",
    calendarEventId: null,
    inviteStudents: false,
    invitedEmails: [],
    status: "scheduled",
    reminderSentAt: null,
    createdAt: now(),
    updatedAt: now(),
    ...overrides,
  });
  return ref.id;
}

beforeAll(async () => {
  setCalendarProvider(fake);
  w = await createWorld();
  ({ classId } = await seedClass(w.schoolId, [w.teacher.uid], { name: "Live class" }));
  await seedEnrollment(classId, w.student.uid, w.schoolId);
});
afterAll(() => setCalendarProvider(null));
beforeEach(() => {
  fake.calls = [];
  fake.failWith = null;
  fake.pendingFirst = false;
  fake.failAfter = null;
  fake.inserted = 0;
});

const schedule = (who: TestUser, body: Record<string, unknown>) =>
  api().post(`/api/classes/${classId}/sessions`).set(bearer(who)).send({ title: "Saturday class", date: futureDate(3), startTime: "09:00", durationMinutes: 90, ...body });

describe("FR-3.11.1 Google connection", () => {
  it("FR-3.11.1 connect returns a consent URL with a stored 10-minute state; the callback saves an encrypted token", async () => {
    const t = await createUser("teacher", { schoolId: w.schoolId });
    const res = await api().get("/api/integrations/google/connect").set(bearer(t));
    expect(res.status).toBe(200);
    const state = new URL(res.body.url).searchParams.get("state")!;
    const stored = (await col.oauthStates().doc(state).get()).data()!;
    expect(stored.uid).toBe(t.uid);
    expect(stored.expiresAt.toMillis() - Date.now()).toBeGreaterThan(9 * 60_000);
    const cb = await api().get(`/api/integrations/google/callback?state=${state}&code=good`);
    expect(cb.status).toBe(302);
    expect(cb.headers.location).toBe("http://localhost:5173/t/settings?google=connected");
    const integ = (await col.integrations().doc(t.uid).get()).data()!;
    expect(integ).toMatchObject({ status: "connected", googleEmail: "sensei@gmail.com" });
    expect(integ.refreshTokenEncrypted).not.toContain("refresh-good");
    const me = await api().get("/api/me").set(bearer(t));
    expect(me.body.google).toEqual({ status: "connected", googleEmail: "sensei@gmail.com" });
    // State is single use.
    const replay = await api().get(`/api/integrations/google/callback?state=${state}&code=good`);
    expect(replay.headers.location).toContain("google=expired");
    expect((await api().delete("/api/integrations/google").set(bearer(t))).status).toBe(204);
    expect((await col.integrations().doc(t.uid).get()).exists).toBe(false);
  });

  it("FR-3.11.1 the website's /google/callback page can finish the connection through POST /integrations/google/complete", async () => {
    const t = await createUser("teacher", { schoolId: w.schoolId });
    const res = await api().get("/api/integrations/google/connect").set(bearer(t));
    const state = new URL(res.body.url).searchParams.get("state")!;
    const done = await api().post("/api/integrations/google/complete").send({ state, code: "good" });
    expect(done.status).toBe(200);
    expect(done.body.redirect).toBe("http://localhost:5173/t/settings?google=connected");
    expect((await col.integrations().doc(t.uid).get()).data()).toMatchObject({ status: "connected", googleEmail: "sensei@gmail.com" });
    const replay = await api().post("/api/integrations/google/complete").send({ state, code: "good" });
    expect(replay.body.redirect).toContain("google=expired");
    const denied = await api().post("/api/integrations/google/complete").send({ state: "nope", error: "access_denied" });
    expect(denied.body.redirect).toContain("google=expired");
  });

  it("FR-3.11.1 an unknown state is rejected", async () => {
    const cb = await api().get("/api/integrations/google/callback?state=nope&code=good");
    expect(cb.headers.location).toContain("google=expired");
  });
});

describe("FR-3.11.2 / FR-3.11.4 scheduling with a pasted link", () => {
  it("FR-3.11.4 without Google the API explains why and asks for a pasted link", async () => {
    const res = await schedule(w.otherTeacher, {});
    expect(res.status).toBe(403);
    const r2 = await schedule(w.admin, {});
    expect(r2.status).toBe(409);
    expect(r2.body.error.code).toBe("meet_link_required");
    expect(r2.body.error.details.reason).toBe("not_connected");
    expect(r2.body.error.message).toMatch(/isn't connected/);
  });

  it("FR-3.11.2 repeat weekly for N weeks creates N sessions a week apart in the school's time zone", async () => {
    const res = await schedule(w.admin, { repeatWeeks: 3, meetUrl: "https://meet.google.com/xyz-abcd-efg", useGoogle: false });
    expect(res.status).toBe(201);
    expect(res.body.items).toHaveLength(3);
    const starts = res.body.items.map((s: { startAt: string }) => new Date(s.startAt).getTime());
    expect(starts[1] - starts[0]).toBe(7 * 86_400_000);
    // 09:00 in Manila is 01:00 UTC.
    expect(new Date(res.body.items[0].startAt).getUTCHours()).toBe(1);
    expect(new Date(res.body.items[0].endAt).getTime() - starts[0]).toBe(90 * 60_000);
    expect(res.body.items[0].provider).toBe("manual");
  });

  it("FR-3.11.4 rejects links that aren't Google Meet", async () => {
    const res = await schedule(w.admin, { meetUrl: "https://zoom.us/j/123", useGoogle: false });
    expect(res.status).toBe(400);
  });
});

describe("FR-3.11.3 / FR-3.11.5 Google Calendar events", () => {
  beforeAll(async () => {
    await connectGoogle(w.teacher);
  });

  it("FR-3.11.3 creates an event with our own id, conference data, and the Meet link", async () => {
    const res = await schedule(w.teacher, { inviteStudents: true });
    expect(res.status).toBe(201);
    const s = res.body.items[0];
    expect(s.provider).toBe("google");
    expect(s.meetUrl).toMatch(/^https:\/\/meet\.google\.com\//);
    const insert = fake.calls.find((c) => c.op === "insert")!;
    expect(insert.eventId).toMatch(/^[0-9a-f]{32}$/);
    expect(insert.sendUpdates).toBe("all");
    expect(insert.event!.attendees).toEqual([{ email: w.student.email }]);
    expect(insert.event!.start!.timeZone).toBe("Asia/Manila");
    expect(insert.event!.description).toContain(`/s/classes/${classId}/live`);
    expect(s.calendarEventId).toBe(insert.eventId);
  });

  it("FR-3.11.3 fetches the event again while the conference is pending", async () => {
    fake.pendingFirst = true;
    const res = await schedule(w.teacher, {});
    expect(res.status).toBe(201);
    expect(res.body.items[0].meetUrl).toContain("pen-");
    expect(fake.calls.some((c) => c.op === "get")).toBe(true);
  });

  it("FR-3.11.4 when Google returns invalid_grant the integration becomes needs_reconnect and scheduling asks for a pasted link", async () => {
    const t = await createUser("teacher", { schoolId: w.schoolId });
    await col.classes().doc(classId).update({ teacherIds: [w.teacher.uid, t.uid] });
    await connectGoogle(t);
    fake.failWith = new GoogleReconnectError();
    const res = await schedule(t, {});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("meet_link_required");
    expect(res.body.error.details.reason).toBe("needs_reconnect");
    expect((await col.integrations().doc(t.uid).get()).data()!.status).toBe("needs_reconnect");
    const note = await col.notifications().where("uid", "==", t.uid).where("type", "==", "google.needs_reconnect").get();
    expect(note.size).toBe(1);
    // With a pasted link it goes through as a manual session.
    fake.failWith = null;
    const retry = await schedule(t, { meetUrl: "https://meet.google.com/man-ualx-lnk" });
    expect(retry.status).toBe(201);
    expect(retry.body.items[0].provider).toBe("manual");
    await col.classes().doc(classId).update({ teacherIds: [w.teacher.uid] });
  });

  it("§14 a failure partway through a weekly series rolls back the events created so far", async () => {
    fake.failAfter = 1;
    const res = await schedule(w.teacher, { repeatWeeks: 3 });
    expect(res.status).toBe(409);
    expect(res.body.error.details.reason).toBe("google_error");
    expect(fake.calls.filter((c) => c.op === "remove")).toHaveLength(1);
  });

  it("FR-3.11.5 a student whose enrollment becomes active later is added to upcoming invited sessions", async () => {
    const res = await schedule(w.teacher, { inviteStudents: true });
    const sessionId = res.body.items[0].id;
    const late = await createUser("student", { schoolId: w.schoolId });
    await seedEnrollment(classId, late.uid, w.schoolId);
    fake.calls = [];
    await afterEnrollmentActivated(classId, late.uid);
    const patch = fake.calls.find((c) => c.op === "patch" && c.eventId === res.body.items[0].calendarEventId)!;
    expect(patch.sendUpdates).toBe("all");
    expect(patch.event!.attendees!.map((a) => a.email)).toContain(late.email);
    expect((await col.liveSessions().doc(sessionId).get()).data()!.invitedEmails).toContain(late.email);
  });

  it("FR-3.11.6 editing patches the event and cancelling deletes it; students are notified; cancelled stays listed", async () => {
    const res = await schedule(w.teacher, { inviteStudents: true, title: "To change" });
    const s = res.body.items[0];
    const patched = await api().patch(`/api/sessions/${s.id}`).set(bearer(w.teacher)).send({ startTime: "10:30", title: "Changed" });
    expect(patched.status).toBe(200);
    expect(new Date(patched.body.startAt).getUTCHours()).toBe(2);
    expect(fake.calls.find((c) => c.op === "patch")!.event!.summary).toBe("Changed");
    const del = await api().delete(`/api/sessions/${s.id}`).set(bearer(w.teacher));
    expect(del.status).toBe(204);
    expect(fake.calls.find((c) => c.op === "remove")).toMatchObject({ eventId: s.calendarEventId, sendUpdates: "all" });
    const list = await api().get(`/api/classes/${classId}/sessions`).set(bearer(w.student));
    const row = list.body.items.find((x: { id: string }) => x.id === s.id);
    expect(row.status).toBe("cancelled");
    expect(row.meetUrl).toBeUndefined();
    const notes = await col.notifications().where("uid", "==", w.student.uid).where("type", "in", ["session.updated", "session.cancelled"]).get();
    expect(notes.size).toBeGreaterThanOrEqual(2);
  });
});

describe("FR-3.11.7 / FR-3.11.8 joining and attendance", () => {
  it("FR-3.11.7 students see the Meet link and an Add to Google Calendar link when invites are off", async () => {
    const id = await seedSession(60 * 24);
    const res = await api().get(`/api/classes/${classId}/sessions`).set(bearer(w.student));
    const s = res.body.items.find((x: { id: string }) => x.id === id);
    expect(s.meetUrl).toBe("https://meet.google.com/aaa-bbbb-ccc");
    expect(s.addToCalendarUrl).toMatch(/^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE/);
    expect(s.myAttendance).toBeNull();
  });

  it("FR-3.11.7 check-in works from 15 minutes before the start until the end", async () => {
    const early = await seedSession(30);
    expect((await api().post(`/api/sessions/${early}/check-in`).set(bearer(w.student))).status).toBe(409);
    const open = await seedSession(10);
    const ok = await api().post(`/api/sessions/${open}/check-in`).set(bearer(w.student));
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe("present");
    const over = await seedSession(-120, 60);
    expect((await api().post(`/api/sessions/${over}/check-in`).set(bearer(w.student))).status).toBe(409);
  });

  it("FR-3.11.8 a check-in more than 10 minutes after the start counts as late", async () => {
    const id = await seedSession(-11, 60);
    const res = await api().post(`/api/sessions/${id}/check-in`).set(bearer(w.student));
    expect(res.body.status).toBe("late");
    const again = await api().post(`/api/sessions/${id}/check-in`).set(bearer(w.student));
    expect(again.body.joinedAt).toBe(res.body.joinedAt);
  });

  it("FR-3.11.8 when a session ends, students without a check-in get absent; the teacher can then set each status", async () => {
    const absentee = await createUser("student", { schoolId: w.schoolId });
    await seedEnrollment(classId, absentee.uid, w.schoolId);
    const id = await seedSession(-90, 60);
    await api().post(`/api/sessions/${id}/check-in`).set(bearer(w.student)).expect(409);
    await col.attendance().doc(attendanceId(id, w.student.uid)).set({ sessionId: id, classId, uid: w.student.uid, status: "present", joinedAt: now(), source: "join_click", updatedBy: null, updatedAt: now() });
    const result = await completeSessions();
    expect(result.completed).toBeGreaterThanOrEqual(1);
    expect((await col.liveSessions().doc(id).get()).data()!.status).toBe("completed");
    const rec = (await col.attendance().doc(attendanceId(id, absentee.uid)).get()).data()!;
    expect(rec).toMatchObject({ status: "absent", source: "system" });
    expect((await col.attendance().doc(attendanceId(id, w.student.uid)).get()).data()!.status).toBe("present");

    const put = await api().put(`/api/sessions/${id}/attendance`).set(bearer(w.teacher)).send({ records: [{ uid: absentee.uid, status: "excused" }] });
    expect(put.status).toBe(200);
    expect(put.body.items.find((r: { uid: string }) => r.uid === absentee.uid)).toMatchObject({ status: "excused", source: "teacher" });
    const logs = await col.auditLogs().where("action", "==", "attendance.changed").where("targetId", "==", attendanceId(id, absentee.uid)).get();
    expect(logs.size).toBe(1);
  });

  it("FR-3.11.9 reports show the attendance rate per student and per session", async () => {
    const res = await api().get(`/api/classes/${classId}/reports`).set(bearer(w.teacher));
    const completed = res.body.sessions.filter((s: { status: string }) => s.status === "completed");
    expect(completed.length).toBeGreaterThanOrEqual(1);
    expect(completed[0].attendanceRate).not.toBeNull();
    const me = res.body.students.find((s: { uid: string }) => s.uid === w.student.uid);
    expect(me.attendanceRate).toBeGreaterThan(0);
    expect(me.attendanceRate).toBeLessThanOrEqual(100);
  });

  it("FR-3.11.9 FR-3.9.4 class and school reports count only finished live classes", async () => {
    // A school of its own, so the school totals are this test's alone.
    const s = await createWorld();
    const students = [s.student, ...(await Promise.all([1, 2, 3].map(() => createUser("student", { schoolId: s.schoolId }))))];
    const { classId: main } = await seedClass(s.schoolId, [s.teacher.uid], { name: "Attendance class" });
    const { classId: fresh } = await seedClass(s.schoolId, [s.teacher.uid], { name: "No finished class yet" });
    for (const st of students) await seedEnrollment(main, st.uid, s.schoolId);
    await seedEnrollment(fresh, students[0].uid, s.schoolId);
    const session = (cls: string, minutesFromNow: number, status: string) => seedSession(minutesFromNow, 60, { classId: cls, schoolId: s.schoolId, hostUid: s.teacher.uid, status });
    const mark = (sessionId: string, cls: string, statuses: AttendanceDoc["status"][]) =>
      Promise.all(
        statuses.map((status, i) =>
          col.attendance().doc(attendanceId(sessionId, students[i].uid)).set({ sessionId, classId: cls, uid: students[i].uid, status, joinedAt: null, source: "teacher", updatedBy: null, updatedAt: now() }),
        ),
      );

    // Finished: excused doesn't count, so 2 of 3 attended.
    await mark(await session(main, -7 * 24 * 60, "completed"), main, ["present", "late", "absent", "excused"]);
    // Rows on live classes that haven't finished: an upcoming one (moved after check-ins),
    // a cancelled one, and one still in progress that the job hasn't marked finished.
    await mark(await session(main, 5 * 24 * 60, "scheduled"), main, ["absent", "absent", "absent", "absent"]);
    await mark(await session(main, -2 * 24 * 60, "cancelled"), main, ["absent", "absent", "absent", "absent"]);
    await mark(await session(main, -10, "scheduled"), main, ["present", "absent", "absent", "absent"]);
    await mark(await session(fresh, 3 * 24 * 60, "scheduled"), fresh, ["absent"]);

    const cls = await api().get(`/api/classes/${main}/reports`).set(bearer(s.teacher));
    expect(cls.status).toBe(200);
    // The Reports tab's "Across 1 finished live classes".
    const finished = cls.body.sessions.filter((x: { status: string }) => x.status === "completed");
    expect(finished.map((x: { attendanceRate: number | null }) => x.attendanceRate)).toEqual([66.7]);
    const byStudent = new Map(cls.body.students.map((x: { uid: string; attendanceRate: number | null }) => [x.uid, x.attendanceRate]));
    expect(students.map((st) => byStudent.get(st.uid))).toEqual([100, 100, 0, null]);

    const school = await api().get(`/api/schools/${s.schoolId}/reports`).set(bearer(s.admin));
    expect(school.status).toBe(200);
    const row = (id: string) => school.body.classes.find((c: { classId: string }) => c.classId === id);
    expect(row(main).attendanceRate).toBe(66.7);
    expect(row(fresh).attendanceRate).toBeNull();
    expect(school.body.totals.attendanceRate).toBe(66.7);
  });
});

describe("FR-3.11.10 meetUrl never reaches users without class access", () => {
  it("FR-3.11.10 pending, removed, and non-enrolled students get 403 and no meetUrl", async () => {
    const id = await seedSession(5);
    const pending = await createUser("student", { schoolId: w.schoolId });
    await seedEnrollment(classId, pending.uid, w.schoolId, { status: "removed" });
    const removed = await createUser("student", { schoolId: w.schoolId });
    await seedEnrollment(classId, removed.uid, w.schoolId);
    await col.enrollments().doc(enrollmentId(classId, removed.uid)).update({ status: "removed" });
    const outsider = await createUser("student");
    const code = (await col.classes().doc(classId).get()).data()!.code;
    for (const who of [pending, removed, outsider]) {
      const list = await api().get(`/api/classes/${classId}/sessions`).set(bearer(who));
      expect(list.status).toBe(403);
      expect(findKeys(list.body, ["meetUrl"])).toEqual([]);
      const check = await api().post(`/api/sessions/${id}/check-in`).set(bearer(who));
      expect(check.status).toBe(403);
      expect(findKeys(check.body, ["meetUrl"])).toEqual([]);
      const preview = await api().get(`/api/classes/preview?code=${code}`).set(bearer(who));
      expect(findKeys(preview.body, ["meetUrl"])).toEqual([]);
      expect(JSON.stringify(preview.body)).not.toContain("meet.google.com");
      const notes = await api().get("/api/notifications").set(bearer(who));
      expect(JSON.stringify(notes.body)).not.toContain("meet.google.com");
    }
  });
});

describe("Jobs", () => {
  it("jobs require the X-Job-Secret header", async () => {
    expect((await api().post("/api/jobs/complete-sessions")).status).toBe(401);
    expect((await api().post("/api/jobs/complete-sessions").set("X-Job-Secret", "wrong")).status).toBe(401);
    const ok = await api().post("/api/jobs/session-reminders").set("X-Job-Secret", "test-job-secret-0123456789");
    expect(ok.status).toBe(200);
    expect((await api().post("/api/jobs/unknown").set("X-Job-Secret", "test-job-secret-0123456789")).status).toBe(400);
  });

  it("session-reminders notifies students once, 15 minutes before", async () => {
    const id = await seedSession(10);
    await api().post("/api/jobs/session-reminders").set("X-Job-Secret", "test-job-secret-0123456789");
    await api().post("/api/jobs/session-reminders").set("X-Job-Secret", "test-job-secret-0123456789");
    const notes = await col.notifications().where("uid", "==", w.student.uid).where("type", "==", "session.reminder").get();
    expect(notes.docs.filter((n) => n.data().link === `/s/classes/${classId}/live`).length).toBeGreaterThanOrEqual(1);
    expect((await col.liveSessions().doc(id).get()).data()!.reminderSentAt).toBeTruthy();
  });
});
