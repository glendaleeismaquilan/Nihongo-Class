import { randomUUID } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { env } from "../env";
import { db } from "../firebase";
import { col, type LiveSessionDoc } from "../db";
import { decryptSecret } from "../lib/crypto";
import { notify } from "../lib/notify";
import { toDate } from "../lib/time";
import { logger } from "../logger";
import { calendar, GoogleReconnectError, type CalendarProvider, type EventInput } from "./calendar";
import { onEnrollmentActivated } from "./enrollment";

export type GoogleUnavailable = "not_configured" | "not_connected" | "needs_reconnect";

export const UNAVAILABLE_MESSAGE: Record<GoogleUnavailable | "google_error", string> = {
  not_configured: "Automatic Meet links aren't set up for this app. Paste a Google Meet link instead.",
  not_connected: "Your Google account isn't connected, so no Meet link was created. Connect it in Settings, or paste a Google Meet link.",
  needs_reconnect: "Your Google connection has expired. Reconnect it in Settings, or paste a Google Meet link.",
  google_error: "Google Calendar didn't respond, so no Meet link was created. Paste a Google Meet link, or try again.",
};

export async function hostCalendar(uid: string): Promise<{ provider: CalendarProvider; refreshToken: string } | { unavailable: GoogleUnavailable }> {
  const provider = calendar();
  if (!provider) return { unavailable: "not_configured" };
  const integration = (await col.integrations().doc(uid).get()).data();
  if (!integration) return { unavailable: "not_connected" };
  if (integration.status !== "connected") return { unavailable: "needs_reconnect" };
  return { provider, refreshToken: decryptSecret(integration.refreshTokenEncrypted) };
}

/** FR-3.11.4: invalid_grant marks the integration needs_reconnect and notifies the teacher. */
export async function markNeedsReconnect(uid: string) {
  await col.integrations().doc(uid).update({ status: "needs_reconnect" });

  const role = (await col.users().doc(uid).get()).data()?.role;
  await notify([uid], {
    type: "google.needs_reconnect",
    title: "Reconnect your Google account",
    body: "Google stopped accepting the app's access, so live classes can't get automatic Meet links until you reconnect.",
    link: role === "school_admin" ? "/a/settings" : "/t/settings",
  });
}

export async function activeStudentEmails(classId: string): Promise<string[]> {
  const enr = await col.enrollments().where("classId", "==", classId).where("status", "==", "active").get();
  if (enr.empty) return [];
  const users = await db.getAll(...enr.docs.map((e) => col.users().doc(e.data().uid)));
  return users.map((u) => u.data()?.email as string | undefined).filter((e): e is string => !!e);
}

export function eventBody(s: { title: string; description?: string | null; startAt: Date; endAt: Date; classId: string }, timeZone: string, attendees?: string[]): EventInput {
  const link = `${env.APP_URL}/s/classes/${s.classId}/live`;
  return {
    summary: s.title,
    description: `${s.description ? `${s.description}\n\n` : ""}Class page: ${link}`,
    start: { dateTime: s.startAt.toISOString(), timeZone },
    end: { dateTime: s.endAt.toISOString(), timeZone },
    ...(attendees ? { attendees: attendees.map((email) => ({ email })) } : {}),
  };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * FR-3.11.3: a Calendar event with an auto-generated Meet link. If the
 * conference is still pending, fetch the event again after a short delay.
 */
export async function createMeetEvent(provider: CalendarProvider, refreshToken: string, body: EventInput, invite: boolean) {
  const id = randomUUID().replace(/-/g, "");
  let created = await provider.insert(refreshToken, { ...body, id }, invite ? "all" : "none");
  for (let i = 0; i < 3 && created.pending && !created.meetUrl; i++) {
    await wait(env.NODE_ENV === "test" ? 10 : 1500);
    created = await provider.get(refreshToken, created.id || id);
  }
  if (!created.meetUrl) throw new Error("Google didn't return a Meet link");
  return { id: created.id || id, meetUrl: created.meetUrl };
}

/** Runs a Calendar call for the session's host; failures never block the app (§14 Reliability). */
export async function withHostCalendar(hostUid: string, fn: (p: CalendarProvider, token: string) => Promise<void>) {
  const cal = await hostCalendar(hostUid);
  if ("unavailable" in cal) return;
  try {
    await fn(cal.provider, cal.refreshToken);
  } catch (err) {
    if (err instanceof GoogleReconnectError) await markNeedsReconnect(hostUid);
    else logger.warn({ err, hostUid }, "calendar update failed");
  }
}

/** "Add to Google Calendar" template link for students when invites are off. */
export function addToCalendarUrl(s: Pick<LiveSessionDoc, "title" | "description" | "startAt" | "endAt" | "meetUrl" | "classId">) {
  const fmt = (t: Timestamp) => toDate(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: s.title,
    dates: `${fmt(s.startAt)}/${fmt(s.endAt)}`,
    details: `${s.description ? `${s.description}\n\n` : ""}Join: ${s.meetUrl}\nClass page: ${env.APP_URL}/s/classes/${s.classId}/live`,
    location: s.meetUrl,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * FR-3.11.5: when an enrollment becomes active, add the student to the
 * class's upcoming sessions that send invites.
 */
onEnrollmentActivated(async (classId, uid) => {
  const email = (await col.users().doc(uid).get()).data()?.email;
  if (!email) return;
  const sessions = await col
    .liveSessions()
    .where("classId", "==", classId)
    .where("status", "==", "scheduled")
    .where("startAt", ">=", Timestamp.now())
    .get();
  for (const s of sessions.docs) {
    const d = s.data();
    if (!d.inviteStudents || !d.calendarEventId) continue;
    const invited = new Set(d.invitedEmails ?? []);
    if (invited.has(email)) continue;
    invited.add(email);
    await withHostCalendar(d.hostUid, async (p, token) => {
      await p.patch(token, d.calendarEventId!, { attendees: [...invited].map((e) => ({ email: e })) }, "all");
      await s.ref.update({ invitedEmails: [...invited] });
    });
  }
});
