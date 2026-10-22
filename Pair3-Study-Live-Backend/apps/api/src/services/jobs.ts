import { Timestamp } from "firebase-admin/firestore";
import { JOIN_OPENS_MINUTES_BEFORE } from "@nihongo/shared";
import { env } from "../env";
import { db } from "../firebase";
import { attendanceId, col, type AttendanceDoc } from "../db";
import { notify } from "../lib/notify";
import { toDate } from "../lib/time";
import { expirePayments } from "./paymentFlow";

/** "Sat, Oct 3, 9:00 AM GMT+8" in the school's zone, for notifications. */
export function formatSessionTime(t: Timestamp, timeZone: string) {
  return new Intl.DateTimeFormat("en-PH", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone, timeZoneName: "short" }).format(toDate(t));
}

async function tzOf(schoolId: string) {
  return (await col.schools().doc(schoolId).get()).data()?.timeZone || env.DEFAULT_TIME_ZONE;
}

/**
 * FR-3.11.8: after endAt, mark sessions completed and give every active
 * student without a check-in an `absent` record (source system).
 */
export async function completeSessions(at = new Date()) {
  const due = await col.liveSessions().where("status", "==", "scheduled").where("endAt", "<=", Timestamp.fromDate(at)).limit(200).get();
  let absences = 0;
  for (const s of due.docs) {
    const d = s.data();
    const enr = await col.enrollments().where("classId", "==", d.classId).where("status", "==", "active").get();
    const refs = enr.docs.map((e) => col.attendance().doc(attendanceId(s.id, e.data().uid)));
    const existing = refs.length ? await db.getAll(...refs) : [];
    const batch = db.batch();
    existing.forEach((snap, i) => {
      if (snap.exists) return;
      absences++;
      batch.set(refs[i], { sessionId: s.id, classId: d.classId, uid: enr.docs[i].data().uid, status: "absent", joinedAt: null, source: "system", updatedBy: null, updatedAt: Timestamp.now() } satisfies AttendanceDoc);
    });
    batch.update(s.ref, { status: "completed", updatedAt: Timestamp.now() });
    await batch.commit();
  }
  return { completed: due.size, absences };
}

/** "Starts in 15 minutes" notifications, once per session. */
export async function sessionReminders(at = new Date()) {
  const soon = await col
    .liveSessions()
    .where("status", "==", "scheduled")
    .where("startAt", ">", Timestamp.fromDate(at))
    .where("startAt", "<=", Timestamp.fromMillis(at.getTime() + JOIN_OPENS_MINUTES_BEFORE * 60_000))
    .get();
  let sent = 0;
  for (const s of soon.docs) {
    const d = s.data();
    if (d.reminderSentAt) continue;
    // Claim the reminder first so overlapping runs don't double-send.
    const claimed = await db.runTransaction(async (tx) => {
      const fresh = (await tx.get(s.ref)).data();
      if (!fresh || fresh.reminderSentAt) return false;
      tx.update(s.ref, { reminderSentAt: Timestamp.now() });
      return true;
    });
    if (!claimed) continue;
    const [enr, cls, tz] = await Promise.all([col.enrollments().where("classId", "==", d.classId).where("status", "==", "active").get(), col.classes().doc(d.classId).get(), tzOf(d.schoolId)]);
    const className = cls.data()?.name ?? "your class";
    await notify(
      enr.docs.map((e) => e.data().uid),
      { type: "session.reminder", title: `${d.title} starts in 15 minutes`, body: `${className}, ${formatSessionTime(d.startAt, tz)}. Join from the class page.`, link: `/s/classes/${d.classId}/live` },
    );
    await notify([d.hostUid], { type: "session.reminder", title: `${d.title} starts in 15 minutes`, body: className, link: null });
    sent++;
  }
  return { sent };
}

export const JOBS = {
  "complete-sessions": () => completeSessions(),
  "session-reminders": () => sessionReminders(),
  "expire-payments": () => expirePayments(),
} as const;

export type JobName = keyof typeof JOBS;
