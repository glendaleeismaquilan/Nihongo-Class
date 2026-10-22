import type { Transaction } from "firebase-admin/firestore";
import { PLANS, type PlanDto, type SeatsDto } from "@nihongo/shared";
import { db } from "../firebase";
import { col, type UserDoc } from "../db";
import { ApiError } from "../lib/errors";
import { isoOrNull } from "../lib/time";

/** Premium is a one-time purchase: once bought, it never expires. */
export function isPremium(u: Pick<UserDoc, "premiumSince"> | undefined | null): boolean {
  return !!u?.premiumSince;
}

export const callLimitSeconds = (u: Pick<UserDoc, "premiumSince"> | undefined | null) => (isPremium(u) ? PLANS.premiumCallSeconds : PLANS.freeCallSeconds);
export const storageLimitBytes = (u: Pick<UserDoc, "premiumSince"> | undefined | null) => (isPremium(u) ? PLANS.premiumStorageBytes : PLANS.freeStorageBytes);

export function planDto(u: UserDoc): PlanDto {
  return {
    premium: isPremium(u),
    premiumSince: isoOrNull(u.premiumSince),
    callLimitSeconds: callLimitSeconds(u),
    storageLimitBytes: storageLimitBytes(u),
    storageUsedBytes: Math.max(0, u.storageUsedBytes ?? 0),
  };
}

// ---------- Teacher slots ----------

export async function seatsFor(schoolId: string): Promise<SeatsDto> {
  const [school, used] = await Promise.all([
    col.schools().doc(schoolId).get(),
    col.users().where("schoolId", "==", schoolId).where("role", "==", "teacher").where("disabled", "==", false).count().get(),
  ]);
  const purchased = school.data()?.extraTeacherSeats ?? 0;
  const total = PLANS.freeTeacherSeats + purchased;
  const n = used.data().count;
  return { free: PLANS.freeTeacherSeats, purchased, total, used: n, available: Math.max(0, total - n) };
}

/** Throws 402 seat_limit_reached when the school has no free teacher slot. */
export async function assertTeacherSeat(schoolId: string) {
  const seats = await seatsFor(schoolId);
  if (seats.available <= 0) {
    throw new ApiError(
      402,
      "seat_limit_reached",
      `All ${seats.total} teacher slots are in use. Buy 5 more teacher slots for ₱299.00, or remove a teacher first.`,
      { seats },
    );
  }
}

// ---------- Storage quota (My Drive plus class materials) ----------

/**
 * Reserves `bytes` against a teacher's quota before an upload is stored.
 * Other roles have no quota. Throws 413 storage_full when it doesn't fit.
 */
export async function reserveStorage(uid: string, bytes: number, tx?: Transaction): Promise<boolean> {
  const run = async (t: Transaction) => {
    const ref = col.users().doc(uid);
    const u = (await t.get(ref)).data();
    if (!u || u.role !== "teacher") return false;
    const used = Math.max(0, u.storageUsedBytes ?? 0);
    const limit = storageLimitBytes(u);
    if (used + bytes > limit) {
      const mb = (n: number) => `${Math.round(n / 1024 / 1024)} MB`;
      throw new ApiError(
        413,
        "storage_full",
        isPremium(u)
          ? `This file doesn't fit: you've used ${mb(used)} of your ${mb(limit)}. Delete some files to make room.`
          : `This file doesn't fit: you've used ${mb(used)} of your free ${mb(limit)}. Delete some files, or go Premium for 1 GB.`,
        { usedBytes: used, limitBytes: limit, premium: isPremium(u) },
      );
    }
    t.update(ref, { storageUsedBytes: used + bytes });
    return true;
  };
  return tx ? run(tx) : db.runTransaction(run);
}

/** Gives back quota when a counted file is deleted (or an upload fails after reserving). */
export async function releaseStorage(uid: string | null | undefined, bytes: number | null | undefined) {
  if (!uid || !bytes) return;
  const ref = col.users().doc(uid);
  await db.runTransaction(async (t) => {
    const u = (await t.get(ref)).data();
    if (!u || u.role !== "teacher") return;
    t.update(ref, { storageUsedBytes: Math.max(0, (u.storageUsedBytes ?? 0) - bytes) });
  });
}

