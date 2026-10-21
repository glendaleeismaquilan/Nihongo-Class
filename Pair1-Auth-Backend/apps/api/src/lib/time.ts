import { Timestamp } from "firebase-admin/firestore";

export const now = () => Timestamp.now();

/** Firestore Timestamp (or Date) to ISO string. */
export function iso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date(0).toISOString();
}

export function isoOrNull(value: unknown): string | null {
  return value == null ? null : iso(value);
}

export function toDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date(String(value));
}
