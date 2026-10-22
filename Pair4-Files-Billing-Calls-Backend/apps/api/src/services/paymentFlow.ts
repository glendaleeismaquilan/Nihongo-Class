import { createHmac, timingSafeEqual } from "node:crypto";
import { Timestamp } from "firebase-admin/firestore";
import { PLANS, formatPeso } from "@nihongo/shared";
import { env } from "../env";
import { db } from "../firebase";
import { col, type PaymentDoc } from "../db";
import { audit } from "../lib/audit";
import { notify } from "../lib/notify";
import { now } from "../lib/time";
import { logger } from "../logger";
import { paymongo, summarizeSession } from "./paymongo";

export interface ProviderPaid {
  amountCentavos: number;
  method: string | null;
  providerPaymentId: string | null;
  paidAt: Date;
}

export type ApplyResult = "paid" | "already_paid" | "needs_review" | "not_found" | "skipped";

/**
 * The single money-changing path used by the webhook, reconciliation, and
 * mock mode. Checks the amount (a mismatch sets needs_review and changes
 * nothing else), does nothing if already paid, and otherwise, in one
 * transaction, marks the payment paid and applies what it bought:
 * - teacher_seats: adds 5 teacher slots per pack to the school (one-time);
 * - premium: turns on the teacher's Premium for good (one-time).
 */
export async function applyPaidPayment(paymentId: string, provider: ProviderPaid): Promise<ApplyResult> {
  const paymentRef = col.payments().doc(paymentId);
  const outcome = await db.runTransaction(async (tx) => {
    const p = (await tx.get(paymentRef)).data();
    if (!p) return { result: "not_found" as const };
    // Reads first (transaction rule), then writes.
    const userRef = col.users().doc(p.uid);
    const schoolRef = p.schoolId ? col.schools().doc(p.schoolId) : null;
    const [user, school] = await Promise.all([tx.get(userRef), schoolRef ? tx.get(schoolRef) : null]);
    if (p.status === "paid") return { result: "already_paid" as const, p };
    // A refund is final; a late event for it changes nothing.
    if (p.status === "refunded") return { result: "skipped" as const, p };
    if (provider.amountCentavos !== p.amountCentavos) {
      if (p.status !== "needs_review") {
        tx.update(paymentRef, {
          status: "needs_review",
          providerPaymentId: provider.providerPaymentId,
          method: provider.method,
          reviewNote: `PayMongo reported ${formatPeso(provider.amountCentavos)}, but the price is ${formatPeso(p.amountCentavos)}.`,
          updatedAt: now(),
        });
      }
      return { result: "needs_review" as const, p };
    }
    // Never ignore money that was received: an expired payment still counts.
    tx.update(paymentRef, { status: "paid", paidAt: Timestamp.fromDate(provider.paidAt), method: provider.method, providerPaymentId: provider.providerPaymentId, updatedAt: now() });
    if (p.purpose === "teacher_seats" && schoolRef) {
      tx.update(schoolRef, { extraTeacherSeats: (school?.data()?.extraTeacherSeats ?? 0) + p.quantity * PLANS.seatPackSize });
    } else if (p.purpose === "premium" && !user.data()?.premiumSince) {
      // A second payment for Premium (two checkouts paid at once) keeps the first date.
      tx.update(userRef, { premiumSince: Timestamp.fromDate(provider.paidAt) });
    }
    await audit({ actorUid: p.uid, action: `billing.${p.purpose}_paid`, targetType: "payment", targetId: paymentId, schoolId: p.schoolId, after: { quantity: p.quantity, amountCentavos: p.amountCentavos } }, tx);
    return { result: "paid" as const, p };
  });

  if (outcome.result === "needs_review") {
    await notify([outcome.p.uid], {
      type: "payment.needs_review",
      title: "Your payment needs a quick check",
      body: `${outcome.p.referenceNumber}: the amount PayMongo reported doesn't match the price, so nothing was changed yet. Contact us with this reference.`,
      link: outcome.p.purpose === "teacher_seats" ? "/a/billing" : "/t/premium",
    });
  }
  if (outcome.result === "paid") {
    const p = outcome.p;
    await notify([p.uid], {
      type: "payment.paid",
      title: p.purpose === "teacher_seats" ? `${p.quantity * PLANS.seatPackSize} teacher slots added` : "You're on Premium",
      body:
        p.purpose === "teacher_seats"
          ? `${formatPeso(p.amountCentavos)} received, reference ${p.referenceNumber}. You can add more teachers now.`
          : `${formatPeso(p.amountCentavos)} received, reference ${p.referenceNumber}. You now have 15-minute video calls and 1 GB of storage, for good.`,
      link: p.purpose === "teacher_seats" ? "/a/billing" : "/t/premium",
    });
  }
  return outcome.result;
}

/** Checks a pending online payment with PayMongo and applies it if paid. */
export async function reconcilePayment(paymentId: string, p: PaymentDoc): Promise<ApplyResult | "pending"> {
  if (p.provider !== "paymongo" || !p.checkoutSessionId) return "pending";
  await col.payments().doc(paymentId).update({ lastReconciledAt: now() });
  const summary = await paymongo().retrieveCheckout(p.checkoutSessionId);
  if (!summary.paid) return "pending";
  return applyPaidPayment(paymentId, summary.paid);
}

/**
 * Hourly job: reconcile pending online payments older than 10 minutes, and
 * expire those still unpaid after 24 hours.
 */
export async function expirePayments(at = new Date()) {
  const older = Timestamp.fromMillis(at.getTime() - 10 * 60_000);
  const cutoff = at.getTime() - 24 * 60 * 60_000;
  const snap = await col.payments().where("status", "==", "pending").where("provider", "==", "paymongo").where("createdAt", "<=", older).limit(500).get();
  let reconciled = 0;
  let expired = 0;
  for (const d of snap.docs) {
    let result: ApplyResult | "pending" = "pending";
    try {
      result = await reconcilePayment(d.id, d.data());
    } catch (err) {
      logger.warn({ err, paymentId: d.id }, "reconciliation failed");
    }
    if (result === "paid" || result === "needs_review") reconciled++;
    else if (result === "pending" && d.data().createdAt.toMillis() <= cutoff) {
      await d.ref.update({ status: "expired", updatedAt: now() });
      expired++;
    }
  }
  return { reconciled, expired };
}

// ---------- Webhook (FR-3.13.4) ----------

/** Signs a payload exactly as PayMongo does (mock mode and tests). */
export function signPaymongo(raw: string, livemode: boolean, t = Math.floor(Date.now() / 1000)) {
  const sig = createHmac("sha256", env.PAYMONGO_WEBHOOK_SECRET).update(`${t}.${raw}`).digest("hex");
  return `t=${t},te=${livemode ? "" : sig},li=${livemode ? sig : ""}`;
}

function verifySignature(raw: Buffer, header: string | undefined): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.trim().split("=") as [string, string]));
  if (!parts.t) return false;
  const expected = createHmac("sha256", env.PAYMONGO_WEBHOOK_SECRET).update(`${parts.t}.`).update(raw).digest("hex");
  // Live events are signed in li, test (and mock) events in te.
  const given = env.PAYMONGO_MODE === "live" ? parts.li : parts.te;
  if (!given || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

export interface WebhookResult {
  status: number;
  body: Record<string, unknown>;
}

export async function handlePaymongoWebhook(raw: Buffer, signature: string | undefined): Promise<WebhookResult> {
  if (!verifySignature(raw, signature)) return { status: 401, body: { error: { code: "invalid_signature", message: "Signature mismatch." } } };
  let event: { data?: { id?: string; attributes?: { type?: string; livemode?: boolean; data?: unknown } } };
  try {
    event = JSON.parse(raw.toString("utf8"));
  } catch {
    return { status: 400, body: { error: { code: "invalid_json", message: "Body isn't JSON." } } };
  }
  const eventId = event.data?.id;
  const type = event.data?.attributes?.type ?? "";
  const livemode = !!event.data?.attributes?.livemode;
  if (env.NODE_ENV === "development" && env.PAYMONGO_MODE !== "live") logger.info({ event }, "paymongo webhook payload");
  if (!eventId) return { status: 400, body: { error: { code: "invalid_event", message: "Missing event id." } } };
  // Mock mode counts as test mode for the livemode check.
  if (livemode !== (env.PAYMONGO_MODE === "live")) return { status: 200, body: { ignored: "other_mode" } };

  // De-duplicate: PayMongo retries failed deliveries up to 12 times.
  const eventRef = col.paymentEvents().doc(eventId);
  const fresh = await db.runTransaction(async (tx) => {
    if ((await tx.get(eventRef)).exists) return false;
    tx.create(eventRef, { type, livemode, receivedAt: now() });
    return true;
  });
  if (!fresh) return { status: 200, body: { duplicate: true } };
  if (type !== "checkout_session.payment.paid") return { status: 200, body: { ignored: type } };

  try {
    const session = summarizeSession((event.data?.attributes?.data ?? {}) as Parameters<typeof summarizeSession>[0]);
    let match = session.id ? await col.payments().where("checkoutSessionId", "==", session.id).limit(1).get() : null;
    if ((!match || match.empty) && session.referenceNumber) match = await col.payments().where("referenceNumber", "==", session.referenceNumber).limit(1).get();
    if (!match || match.empty) {
      logger.warn({ eventId, sessionId: session.id }, "paid event for an unknown checkout session");
      return { status: 200, body: { ignored: "unknown_session" } };
    }
    if (!session.paid) return { status: 200, body: { ignored: "no_paid_payment" } };
    const result = await applyPaidPayment(match.docs[0].id, session.paid);
    return { status: 200, body: { result } };
  } catch (err) {
    // Let PayMongo retry: forget the event so the retry is processed.
    await eventRef.delete().catch(() => undefined);
    logger.error({ err, eventId }, "webhook processing failed");
    return { status: 500, body: { error: { code: "internal", message: "Processing failed." } } };
  }
}

/** Builds the event PayMongo sends for a paid checkout session (mock mode, tests). */
export function paidEvent(p: PaymentDoc & { id?: string }, opts: { eventId: string; amountCentavos?: number; livemode?: boolean; method?: string }) {
  const at = Math.floor(Date.now() / 1000);
  return {
    data: {
      id: opts.eventId,
      type: "event",
      attributes: {
        type: "checkout_session.payment.paid",
        livemode: opts.livemode ?? false,
        data: {
          id: p.checkoutSessionId,
          type: "checkout_session",
          attributes: {
            reference_number: p.referenceNumber,
            status: "active",
            payments: [
              {
                id: `pay_mock_${opts.eventId.slice(-10)}`,
                type: "payment",
                attributes: { amount: opts.amountCentavos ?? p.amountCentavos, currency: "PHP", status: "paid", paid_at: at, source: { type: opts.method ?? "gcash" } },
              },
            ],
          },
        },
        created_at: at,
        updated_at: at,
      },
    },
  };
}
