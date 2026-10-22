import type { Transaction } from "firebase-admin/firestore";
import { col, type AuditLogDoc } from "../db";
import { now } from "./time";

type AuditInput = Omit<AuditLogDoc, "createdAt">;

/** Audit fee, role, payment-status, and attendance changes (§6 auditLogs). */
export async function audit(entry: AuditInput, tx?: Transaction) {
  const ref = col.auditLogs().doc();
  const data = { ...entry, createdAt: now() } as AuditLogDoc;
  if (tx) tx.set(ref, data);
  else await ref.set(data);
}
