import { Timestamp } from "firebase-admin/firestore";
import { addDaysToKey, dateKey, zonedTimeToUtc } from "@nihongo/shared";
import { attendanceId, col, type LiveSessionDoc } from "../src/db";
import { now } from "../src/lib/time";
import type { SeedContext } from "./seed";

/** The next Saturday (or today if it's Saturday) as YYYY-MM-DD in Manila. */
function nextSaturday(): string {
  const today = dateKey(new Date(), "Asia/Manila");
  const [y, m, d] = today.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDaysToKey(today, (6 - dow + 7) % 7 || 7);
}

export async function seedLive(ctx: SeedContext, classes: { n5: { id: string }; n4: { id: string } }) {
  const [tanaka, sato] = ctx.teacherUids;
  const [juan, ana, , , carlo] = ctx.studentUids;
  const sat = nextSaturday();
  const base = { schoolId: ctx.schoolId, provider: "manual" as const, calendarEventId: null, inviteStudents: false, invitedEmails: [], reminderSentAt: null, createdAt: now(), updatedAt: now() };
  const at = (date: string, time: string, minutes: number) => {
    const start = zonedTimeToUtc(date, time, "Asia/Manila");
    return { startAt: Timestamp.fromDate(start), endAt: Timestamp.fromMillis(start.getTime() + minutes * 60_000) };
  };

  const upcoming: LiveSessionDoc = {
    ...base,
    classId: classes.n5.id,
    hostUid: tanaka,
    title: "Saturday class: Lesson 2, 家族",
    description: "We'll practice introducing our families. Have the Lesson 1 handout ready.",
    ...at(sat, "09:00", 90),
    meetUrl: "https://meet.google.com/nhg-demo-sat",
    status: "scheduled",
  };
  await col.liveSessions().doc("n5-live-1").set(upcoming);

  const past: LiveSessionDoc = {
    ...base,
    classId: classes.n5.id,
    hostUid: tanaka,
    title: "Saturday class: Lesson 1, あいさつ",
    description: null,
    ...at(addDaysToKey(sat, -7), "09:00", 90),
    meetUrl: "https://meet.google.com/nhg-demo-sat",
    status: "completed",
  };
  await col.liveSessions().doc("n5-live-0").set(past);
  const records: [string, "present" | "late" | "absent"][] = [
    [juan, "present"],
    [ana, "late"],
    [carlo, "absent"],
  ];
  for (const [uid, status] of records) {
    await col.attendance().doc(attendanceId("n5-live-0", uid)).set({
      sessionId: "n5-live-0",
      classId: classes.n5.id,
      uid,
      status,
      joinedAt: status === "absent" ? null : Timestamp.fromMillis(past.startAt.toMillis() + (status === "late" ? 14 : 2) * 60_000),
      source: status === "absent" ? "system" : "join_click",
      updatedBy: null,
      updatedAt: now(),
    });
  }

  await col.liveSessions().doc("n4-live-1").set({
    ...base,
    classId: classes.n4.id,
    hostUid: sato,
    title: "Tuesday evening: 〜てもいいです",
    description: null,
    ...at(addDaysToKey(sat, 3), "19:00", 60),
    meetUrl: "https://meet.google.com/nhg-demo-tue",
    status: "scheduled",
  });
}
