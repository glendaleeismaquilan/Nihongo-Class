import { Router } from "express";
import { mePatchSchema, registerSchema, type MeDto } from "@nihongo/shared";
import { env } from "../env";
import { db } from "../firebase";
import { col, type UserDoc } from "../db";
import { currentUser, verifyToken } from "../lib/auth";
import { userDto, schoolDto } from "../lib/dto";
import { limiter } from "../lib/rateLimit";
import { now } from "../lib/time";
import { parse } from "../lib/validate";
import { planDto } from "../services/plan";

export const registerRouter = Router();
export const meRouter = Router();

/**
 * FR-3.1.1: called right after Firebase sign-up. Always creates a student;
 * the role is never read from the client. Idempotent for retries.
 */
registerRouter.post("/auth/register", limiter("register", 20), verifyToken, async (req, res) => {
  const body = parse(registerSchema, req.body);
  const fb = req.firebase!;
  const ref = col.users().doc(fb.uid);
  const { doc, created } = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return { doc: snap.data()!, created: false };
    const fresh: UserDoc = {
      role: "student",
      name: body.name,
      email: (fb.email ?? "").toLowerCase(),
      schoolId: null,
      studyLevel: body.studyLevel ?? null,
      timeZone: body.timeZone ?? env.DEFAULT_TIME_ZONE,
      privacyConsentAt: now(),
      disabled: false,
      createdAt: now(),
    };
    tx.set(ref, fresh);
    return { doc: fresh, created: true };
  });
  res.status(created ? 201 : 200).json(userDto(fb.uid, doc));
});

meRouter.get("/me", async (req, res) => {
  const u = currentUser(req);
  const [schoolSnap, integrationSnap] = await Promise.all([
    u.schoolId ? col.schools().doc(u.schoolId).get() : null,
    u.role === "teacher" || u.role === "school_admin" ? col.integrations().doc(u.uid).get() : null,
  ]);
  const integration = integrationSnap?.exists ? integrationSnap.data()! : null;
  const me: MeDto = {
    ...userDto(u.uid, u.doc),
    school: schoolSnap?.exists ? schoolDto(schoolSnap.id, schoolSnap.data()!) : null,
    google: integration ? { status: integration.status, googleEmail: integration.googleEmail } : null,
    plan: u.role === "teacher" ? planDto(u.doc) : null,
  };
  res.json(me);
});

meRouter.patch("/me", async (req, res) => {
  const u = currentUser(req);
  const body = parse(mePatchSchema, req.body);
  const update: Partial<UserDoc> = {};
  if (body.name !== undefined) update.name = body.name;
  if (body.studyLevel !== undefined) update.studyLevel = body.studyLevel;
  if (body.timeZone !== undefined) update.timeZone = body.timeZone;
  // RA 10173: first login of an admin-created account records consent here.
  if (body.privacyConsent && !u.doc.privacyConsentAt) update.privacyConsentAt = now();
  if (Object.keys(update).length) await col.users().doc(u.uid).update(update);
  const snap = await col.users().doc(u.uid).get();
  res.json(userDto(u.uid, snap.data()!));
});
