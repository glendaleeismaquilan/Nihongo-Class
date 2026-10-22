
import { col } from "../db";
import { notify } from "../lib/notify";
import { logger } from "../logger";

type ActivationHook = (classId: string, uid: string) => Promise<void>;
const hooks: ActivationHook[] = [];

/** Other modules (live classes) register work to run when an enrollment becomes active. */
export function onEnrollmentActivated(hook: ActivationHook) {
  hooks.push(hook);
}

/**
 * Runs after an enrollment becomes active (free join, payment, approval,
 * waiver, or staff add): notifies the student and runs registered hooks, such
 * as adding them to upcoming invited live classes (FR-3.11.5).
 */
export async function afterEnrollmentActivated(classId: string, uid: string, opts: { notifyStudent?: boolean } = {}) {
  const cls = (await col.classes().doc(classId).get()).data();
  if (!cls) return;
  if (opts.notifyStudent !== false) {
    await notify([uid], {
      type: "enrollment.active",
      title: `You're enrolled in ${cls.name}`,
      body: "Lessons, live classes, and materials are open.",
      link: `/s/classes/${classId}`,
    });
  }
  for (const hook of hooks) {
    await hook(classId, uid).catch((err) => logger.warn({ err, classId, uid }, "enrollment activation hook failed"));
  }
}

/** A student without a school joins the school of the first class they enter. */
export async function linkStudentToSchool(uid: string, schoolId: string) {
  const ref = col.users().doc(uid);
  const snap = await ref.get();
  if (snap.exists && !snap.data()!.schoolId) await ref.update({ schoolId });
}


