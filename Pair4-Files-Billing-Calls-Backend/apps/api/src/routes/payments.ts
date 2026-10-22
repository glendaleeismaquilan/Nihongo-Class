import { randomUUID } from "node:crypto";
import express, { Router } from "express";
import { seatsCheckoutSchema, type PaymentDto, type PaymentPurpose, type ReceiptDto, type SchoolBillingDto, type TeacherBillingDto } from "@nihongo/shared";
import { env } from "../env";
import { col, type PaymentDoc, type UserDoc } from "../db";
import { currentUser, requireRole, type AuthedUser } from "../lib/auth";
import { badRequest, conflict, forbidden, notFound, unavailable } from "../lib/errors";
import { limiter } from "../lib/rateLimit";
import { iso, isoOrNull, now } from "../lib/time";
import { params, parse } from "../lib/validate";
import { logger } from "../logger";
import { handlePaymongoWebhook, paidEvent, reconcilePayment, signPaymongo } from "../services/paymentFlow";
import { newReferenceNumber, priceFor } from "../services/payments";
import { paymongo, PaymongoUnavailable } from "../services/paymongo";
import { isPremium, planDto, seatsFor } from "../services/plan";
import { peopleRefs } from "./classes";

/**
 * Billing (replaces class tuition, which is gone: classes are free).
 * - A School Admin buys teacher slots: 5 more for ₱299, one-time.
 * - A teacher buys Premium: ₱299 once, for 15-minute video calls
 *   and 1 GB of storage.
 * Both go through PayMongo Hosted Checkout (or mock mode) and the same webhook.
 */
export const paymentsRouter = Router();

export function paymentDto(id: string, p: PaymentDoc, people?: Map<string, UserDoc>): PaymentDto {
  return {
    id,
    referenceNumber: p.referenceNumber,
    uid: p.uid,
    ...(people?.get(p.uid) ? { payerName: people.get(p.uid)!.name } : {}),
    schoolId: p.schoolId ?? null,
    purpose: p.purpose,
    quantity: p.quantity,
    description: p.description,
    amountCentavos: p.amountCentavos,
    currency: p.currency,
    provider: p.provider,
    status: p.status,
    checkoutUrl: p.status === "pending" ? (p.checkoutUrl ?? null) : null,
    method: p.method ?? null,
    reviewNote: p.reviewNote ?? null,
    paidAt: isoOrNull(p.paidAt),
    createdAt: iso(p.createdAt),
    updatedAt: iso(p.updatedAt),
  };
}

/** The payer, or (for teacher slots) any School Admin of that school. */
export async function assertPaymentAccess(u: AuthedUser, paymentId: string): Promise<PaymentDoc> {
  const p = (await col.payments().doc(paymentId).get()).data();
  if (!p) throw notFound("Payment not found.");
  const own = p.uid === u.uid;
  const sameSchoolAdmin = p.purpose === "teacher_seats" && u.role === "school_admin" && !!u.schoolId && u.schoolId === p.schoolId;
  if (!own && !sameSchoolAdmin) throw forbidden("You don't have access to this payment.");
  return p;
}

const backPage = (purpose: PaymentPurpose) => (purpose === "teacher_seats" ? "/a/billing" : "/t/premium");

/** Creates (or reuses within the hour) a pending payment and its PayMongo checkout. */
async function startCheckout(u: AuthedUser, purpose: PaymentPurpose, quantity: number) {
  const { amountCentavos, description } = priceFor(purpose, quantity);
  const schoolId = u.schoolId ?? null;
  const recent = await col.payments().where("uid", "==", u.uid).where("status", "==", "pending").get();
  const hourAgo = Date.now() - 60 * 60_000;
  const reusable = recent.docs.find((d) => {
    const p = d.data();
    return p.purpose === purpose && p.quantity === quantity && p.amountCentavos === amountCentavos && p.createdAt.toMillis() >= hourAgo && !!p.checkoutUrl;
  });
  if (reusable) return { paymentId: reusable.id, checkoutUrl: reusable.data().checkoutUrl!, reused: true };

  const ref = col.payments().doc();
  const payment: PaymentDoc = {
    referenceNumber: newReferenceNumber(),
    uid: u.uid,
    schoolId,
    purpose,
    quantity,
    description,
    amountCentavos,
    currency: "PHP",
    provider: "paymongo",
    status: "pending",
    createdAt: now(),
    updatedAt: now(),
  };
  await ref.set(payment);
  try {
    const session = await paymongo().createCheckout({
      paymentId: ref.id,
      referenceNumber: payment.referenceNumber,
      amountCentavos,
      itemName: purpose === "teacher_seats" ? "Teacher slots (5 per pack)" : "Nihongo Class Teacher Premium",
      description,
      successUrl: `${env.APP_URL}/payments/${ref.id}/return`,
      cancelUrl: `${env.APP_URL}${backPage(purpose)}`,
      billing: { name: u.name, email: u.email },
    });
    await ref.update({ checkoutSessionId: session.id, checkoutUrl: session.checkoutUrl, updatedAt: now() });
    return { paymentId: ref.id, checkoutUrl: session.checkoutUrl, reused: false };
  } catch (err) {
    logger.warn({ err: (err as Error).message, paymentId: ref.id }, "checkout creation failed");
    await ref.delete();
    if (err instanceof PaymongoUnavailable) throw unavailable("Online payment isn't available right now. Try again in a few minutes.", "provider_unavailable");
    throw err;
  }
}

// ---------- School Admin: teacher slots ----------

paymentsRouter.get("/billing/school", requireRole("school_admin"), async (req, res) => {
  const u = currentUser(req);
  if (!u.schoolId) throw forbidden("Your account isn't linked to a school.");
  const [seats, snap] = await Promise.all([seatsFor(u.schoolId), col.payments().where("schoolId", "==", u.schoolId).where("purpose", "==", "teacher_seats").orderBy("createdAt", "desc").limit(100).get()]);
  const people = await peopleRefs(snap.docs.map((d) => d.data().uid));
  res.json({ seats, payments: snap.docs.map((d) => paymentDto(d.id, d.data(), people)) } satisfies SchoolBillingDto);
});

/** 5 more teacher slots for ₱299 per pack (one-time). Only the pack count is read. */
paymentsRouter.post("/billing/teacher-seats/checkout", requireRole("school_admin"), limiter("checkout", 20), async (req, res) => {
  const u = currentUser(req);
  if (!u.schoolId) throw forbidden("Your account isn't linked to a school.");
  const { packs } = parse(seatsCheckoutSchema, req.body ?? {});
  res.status(201).json(await startCheckout(u, "teacher_seats", packs));
});

// ---------- Teacher: Premium ----------

paymentsRouter.get("/billing/premium", requireRole("teacher"), async (req, res) => {
  const u = currentUser(req);
  const snap = await col.payments().where("uid", "==", u.uid).where("purpose", "==", "premium").orderBy("createdAt", "desc").limit(100).get();
  res.json({ plan: planDto(u.doc), payments: snap.docs.map((d) => paymentDto(d.id, d.data())) } satisfies TeacherBillingDto);
});

/** ₱299 once for Premium, which never expires. A teacher who has it can't buy it again. */
paymentsRouter.post("/billing/premium/checkout", requireRole("teacher"), limiter("checkout", 20), async (req, res) => {
  const u = currentUser(req);
  if (isPremium(u.doc)) throw conflict("You already have Premium. It never expires, so there's nothing more to pay.", "already_premium");
  res.status(201).json(await startCheckout(u, "premium", 1));
});

// ---------- Payment status and receipts ----------

/** Also reconciles with PayMongo at most once every 10 seconds while the return page polls. */
paymentsRouter.get("/payments/:id", requireRole("teacher", "school_admin"), async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  let p = await assertPaymentAccess(u, id);
  if (p.status === "pending") {
    const last = p.lastReconciledAt?.toMillis() ?? 0;
    if (Date.now() - last >= 10_000) {
      try {
        const r = await reconcilePayment(id, p);
        if (r !== "pending") p = (await col.payments().doc(id).get()).data()!;
      } catch (err) {
        logger.warn({ err: (err as Error).message, paymentId: id }, "reconciliation on poll failed");
      }
    }
  }
  res.json(paymentDto(id, p));
});

export function methodLabel(method: string | null | undefined) {
  const names: Record<string, string> = { gcash: "GCash", paymaya: "Maya", maya: "Maya", card: "Card", qrph: "QR Ph", grab_pay: "GrabPay", shopee_pay: "ShopeePay", dob: "Online banking", billease: "BillEase" };
  return `${names[(method ?? "").toLowerCase()] ?? "Online"} via PayMongo`;
}

/** A printable payment acknowledgment (not a BIR official receipt). */
paymentsRouter.get("/payments/:id/receipt", requireRole("teacher", "school_admin"), async (req, res) => {
  const u = currentUser(req);
  const { id } = params(req);
  const p = await assertPaymentAccess(u, id);
  if (p.status !== "paid" && p.status !== "refunded") throw conflict("A receipt is available once the payment is confirmed.", "not_paid");
  const [payer, school] = await Promise.all([col.users().doc(p.uid).get(), p.schoolId ? col.schools().doc(p.schoolId).get() : null]);
  const receipt: ReceiptDto = {
    paymentId: id,
    referenceNumber: p.referenceNumber,
    payerName: payer.data()?.name ?? "",
    payerEmail: payer.data()?.email ?? "",
    schoolName: school?.data()?.name ?? null,
    description: p.description,
    amountCentavos: p.amountCentavos,
    method: methodLabel(p.method),
    paidAt: iso(p.paidAt ?? p.updatedAt),
  };
  res.json({ ...receipt, status: p.status });
});

// ---------- Webhook and mock mode ----------

/**
 * POST /api/webhooks/paymongo, mounted with express.raw before the JSON
 * parser because signature verification needs the raw body.
 */
export const paymongoWebhook = [
  express.raw({ type: "application/json", limit: "1mb" }),
  async (req: express.Request, res: express.Response) => {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
    const result = await handlePaymongoWebhook(raw, req.header("paymongo-signature"));
    res.status(result.status).json(result.body);
  },
];

/**
 * Development only (PAYMONGO_MODE=mock): builds a checkout_session.payment.paid
 * event with livemode false, signs it with PAYMONGO_WEBHOOK_SECRET exactly as
 * PayMongo does, and runs it through the same webhook handler.
 */
export const devRouter = Router();
devRouter.post("/dev/mock-paymongo/:paymentId/pay", requireRole("teacher", "school_admin"), async (req, res) => {
  const u = currentUser(req);
  const { paymentId } = params(req);
  const p = (await col.payments().doc(paymentId).get()).data();
  if (!p || p.uid !== u.uid) throw notFound("Payment not found.");
  if (!p.checkoutSessionId) throw badRequest("This isn't an online checkout.");
  const raw = JSON.stringify(paidEvent(p, { eventId: `evt_mock_${randomUUID().replace(/-/g, "").slice(0, 20)}`, method: typeof req.body?.method === "string" ? req.body.method : "gcash" }));
  const result = await handlePaymongoWebhook(Buffer.from(raw), signPaymongo(raw, false));
  if (result.status !== 200) throw new Error(`mock webhook failed with ${result.status}`);
  res.json({ successUrl: `${env.APP_URL}/payments/${paymentId}/return`, webhook: result.body });
});
devRouter.get("/dev/mock-paymongo/:paymentId", requireRole("teacher", "school_admin"), async (req, res) => {
  const u = currentUser(req);
  const { paymentId } = params(req);
  const p = (await col.payments().doc(paymentId).get()).data();
  if (!p || p.uid !== u.uid) throw notFound("Payment not found.");
  res.json({ ...paymentDto(paymentId, p), cancelUrl: `${env.APP_URL}${backPage(p.purpose)}` });
});
