import { db } from "../firebase";
import { col } from "../db";
import { notify } from "../lib/notify";
import { now } from "../lib/time";
import { logger } from "../logger";

/**
 * Tells a class's active students about new teaching content — a lesson,
 * flashcards, a quiz — in-app on the web and the phone, and as a phone push.
 * Materials notify on publish in routes/materials.ts.
 */
const BURST_MS = 10 * 60_000;

/** A burst of single additions (a teacher typing cards one by one) sends one notification per 10 minutes. */
async function firstInBurst(key: string, record: boolean): Promise<boolean> {
  const ref = col.notifyBursts().doc(key);
  return db.runTransaction(async (tx) => {
    const last = (await tx.get(ref)).data()?.lastAt?.toMillis() ?? 0;
    const fresh = Date.now() - last >= BURST_MS;
    if (fresh || record) tx.set(ref, { lastAt: now() });
    return fresh;
  });
}

export async function notifyNewContent(
  classId: string,
  content: { type: string; heading: string; body: string },
  burst?: { key: string; always?: boolean },
): Promise<void> {
  try {
    if (burst) {
      const fresh = await firstInBurst(burst.key, !!burst.always);
      if (!fresh && !burst.always) return;
    }
    const cls = (await col.classes().doc(classId).get()).data();
    if (!cls || cls.status !== "active") return;
    const enrolled = await col.enrollments().where("classId", "==", classId).where("status", "==", "active").get();
    await notify(
      enrolled.docs.map((d) => d.data().uid),
      { type: content.type, title: `${content.heading} in ${cls.name}`, body: content.body, link: `/s/classes/${classId}` },
    );
  } catch (err) {
    // The content is saved either way; a missed notification shouldn't fail the teacher's request.
    logger.warn({ err: err instanceof Error ? err.message : "unknown", classId }, "content notification failed");
  }
}
