import { Router } from "express";
import { Timestamp } from "firebase-admin/firestore";
import { PLANS } from "@nihongo/shared";
import { z } from "zod";
import { col, type CallDoc } from "../db";
import { assertClassAccess, isClassStaff, loadClass } from "../lib/access";
import { currentUser, requireRole } from "../lib/auth";
import { ApiError, conflict, forbidden, notFound } from "../lib/errors";
import { notify } from "../lib/notify";
import { limiter } from "../lib/rateLimit";
import { params, parse } from "../lib/validate";
import { callDto, endCall, extendRoom, iceServers, openRoom, settleExpired } from "../services/calls";
import { callLimitSeconds, isPremium } from "../services/plan";

/**
 * In-app video calls for a class (decision 31). A teacher or School Admin
 * starts one; enrolled students join. 5 minutes free; a host with Premium gets
 * 15 minutes, and can extend a call they started before buying Premium.
 */
export const callsRouter = Router();
const staff = requireRole("teacher", "school_admin");
const member = requireRole("teacher", "school_admin", "student");

const startSchema = z.object({ title: z.string().trim().min(1).max(120).optional() });

async function activeCall(classId: string) {
  const snap = await col.calls().where("classId", "==", classId).where("status", "==", "active").limit(5).get();
  for (const d of snap.docs) {
    const settled = await settleExpired(d.id, d.data());
    if (settled.status === "active") return { id: d.id, doc: settled };
  }
  return null;
}

callsRouter.get("/calls/ice", member, (_req, res) => {
  res.json({ iceServers: iceServers() });
});

callsRouter.get("/classes/:classId/calls/active", member, async (req, res) => {
  const u = currentUser(req);
  const { classId } = params(req);
  await assertClassAccess(u, classId, "member");
  const call = await activeCall(classId);
  res.json({ call: call ? await callDto(call.id, call.doc) : null });
});

callsRouter.post("/classes/:classId/calls", staff, limiter("call-start", 30), async (req, res) => {
  const u = currentUser(req);
  const { classId } = params(req);
  const body = parse(startSchema, req.body ?? {});
  const { cls } = await assertClassAccess(u, classId, "staff", { write: true });
  const existing = await activeCall(classId);
  if (existing) throw conflict("A call is already running in this class. Join it instead.", "call_active", { call: await callDto(existing.id, existing.doc) });
  const limitSeconds = callLimitSeconds(u.doc);
  const startedAt = Timestamp.now();
  const ref = col.calls().doc();
  const doc: CallDoc = {
    classId,
    schoolId: cls.schoolId,
    hostUid: u.uid,
    title: body.title ?? `${cls.name} call`,
    status: "active",
    startedAt,
    endsAt: Timestamp.fromMillis(startedAt.toMillis() + limitSeconds * 1000),
    limitSeconds,
    endedAt: null,
    endedReason: null,
  };
  await ref.set(doc);
  openRoom(ref.id, doc.endsAt);
  const enr = await col.enrollments().where("classId", "==", classId).where("status", "==", "active").get();
  await notify(
    enr.docs.map((e) => e.data().uid).concat(cls.teacherIds.filter((t) => t !== u.uid)),
    { type: "call.started", title: `${u.name} started a call`, body: `${cls.name}: join now.`, link: `/call/${ref.id}` },
  );
  res.status(201).json(await callDto(ref.id, doc));
});

async function loadCall(id: string) {
  const snap = await col.calls().doc(id).get();
  if (!snap.exists) throw notFound("This call doesn't exist.");
  return settleExpired(id, snap.data()!);
}

callsRouter.get("/calls/:callId", member, async (req, res) => {
  const u = currentUser(req);
  const { callId } = params(req);
  const call = await loadCall(callId);
  await assertClassAccess(u, call.classId, "member");
  res.json(await callDto(callId, call));
});

/** The host or any staff member of the class can end the call for everyone. */
callsRouter.post("/calls/:callId/end", staff, async (req, res) => {
  const u = currentUser(req);
  const { callId } = params(req);
  const call = await loadCall(callId);
  if (call.hostUid !== u.uid && !isClassStaff(u, await loadClass(call.classId))) throw forbidden("Only the class's teachers can end this call.");
  await endCall(callId, "host");
  res.json(await callDto(callId, { ...call, status: "ended", endedReason: "host" }));
});

/** A Premium host extends a 5-minute call to 15 minutes from its start. */
callsRouter.post("/calls/:callId/extend", requireRole("teacher"), async (req, res) => {
  const u = currentUser(req);
  const { callId } = params(req);
  const call = await loadCall(callId);
  if (call.hostUid !== u.uid) throw forbidden("Only the teacher who started this call can extend it.");
  if (call.status !== "active") throw new ApiError(410, "call_ended", "This call has ended.");
  if (!isPremium(u.doc)) {
    throw new ApiError(402, "premium_required", "Calls longer than 5 minutes need Premium (₱299.00, one-time).");
  }
  if (call.limitSeconds >= PLANS.premiumCallSeconds) throw conflict("This call already has the full 15 minutes.", "already_extended");
  const endsAt = Timestamp.fromMillis(call.startedAt.toMillis() + PLANS.premiumCallSeconds * 1000);
  await col.calls().doc(callId).update({ endsAt, limitSeconds: PLANS.premiumCallSeconds });
  extendRoom(callId, endsAt);
  res.json(await callDto(callId, { ...call, endsAt, limitSeconds: PLANS.premiumCallSeconds }));
});
