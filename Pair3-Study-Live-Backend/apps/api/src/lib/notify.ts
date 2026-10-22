import type { Transaction } from "firebase-admin/firestore";
import { db } from "../firebase";
import { col } from "../db";
import { now } from "./time";

export interface NotificationInput {
  type: string;
  title: string;
  body: string;
  link?: string | null;
}

/** Decision 18: in-app notifications only. */
export async function notify(uids: string[], n: NotificationInput, tx?: Transaction) {
  const unique = [...new Set(uids)];
  if (!unique.length) return;
  const doc = (uid: string) => ({ uid, ...n, link: n.link ?? null, read: false, createdAt: now() });
  if (tx) {
    for (const uid of unique) tx.set(col.notifications().doc(), doc(uid));
    return;
  }
  for (let i = 0; i < unique.length; i += 450) {
    const batch = db.batch();
    for (const uid of unique.slice(i, i + 450)) batch.set(col.notifications().doc(), doc(uid));
    await batch.commit();
  }
}

export async function schoolAdminUids(schoolId: string): Promise<string[]> {
  const snap = await col.users().where("schoolId", "==", schoolId).where("role", "==", "school_admin").get();
  return snap.docs.filter((d) => !d.data().disabled).map((d) => d.id);
}
