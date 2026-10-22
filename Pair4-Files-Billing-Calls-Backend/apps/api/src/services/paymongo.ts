import { env } from "../env";

const BASE = "https://api.paymongo.com";
const TIMEOUT_MS = 10_000;

export interface CheckoutParams {
  paymentId: string;
  referenceNumber: string;
  amountCentavos: number;
  itemName: string;
  description: string;
  cancelUrl: string;
  successUrl: string;
  billing?: { name: string; email: string };
}

export interface CheckoutSummary {
  id: string;
  checkoutUrl: string | null;
  referenceNumber: string | null;
  /** Present when the session shows a completed payment. */
  paid: { amountCentavos: number; method: string | null; providerPaymentId: string | null; paidAt: Date } | null;
}

export class PaymongoUnavailable extends Error {}

interface PaymentLike {
  id?: string;
  attributes?: { amount?: number; status?: string; paid_at?: number; source?: { type?: string } | null };
}

interface SessionLike {
  id?: string;
  attributes?: {
    checkout_url?: string;
    reference_number?: string;
    payments?: PaymentLike[];
    payment_intent?: { attributes?: { status?: string; amount?: number } } | null;
  };
}

/**
 * Reads a checkout session (from the retrieve endpoint or the
 * checkout_session.payment.paid event's data.attributes.data): it's paid when
 * a payment in `payments` has status "paid", or the payment intent succeeded.
 */
export function summarizeSession(s: SessionLike): CheckoutSummary {
  const payments = s.attributes?.payments ?? [];
  const paid = payments.find((p) => p.attributes?.status === "paid");
  const intent = s.attributes?.payment_intent?.attributes;
  const succeeded = !paid && intent?.status === "succeeded";
  return {
    id: s.id ?? "",
    checkoutUrl: s.attributes?.checkout_url ?? null,
    referenceNumber: s.attributes?.reference_number ?? null,
    paid: paid
      ? {
          amountCentavos: paid.attributes?.amount ?? 0,
          method: paid.attributes?.source?.type ?? null,
          providerPaymentId: paid.id ?? null,
          paidAt: paid.attributes?.paid_at ? new Date(paid.attributes.paid_at * 1000) : new Date(),
        }
      : succeeded
        ? { amountCentavos: intent?.amount ?? 0, method: null, providerPaymentId: null, paidAt: new Date() }
        : null,
  };
}

export interface PaymongoClient {
  createCheckout(p: CheckoutParams): Promise<{ id: string; checkoutUrl: string }>;
  retrieveCheckout(id: string): Promise<CheckoutSummary>;
}

async function call(path: string, init: RequestInit = {}) {
  const auth = Buffer.from(`${env.PAYMONGO_SECRET_KEY}:`).toString("base64");
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json", Accept: "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new PaymongoUnavailable(`PayMongo request failed: ${(err as Error).message}`);
  }
  const body = (await res.json().catch(() => null)) as { data?: SessionLike; errors?: { detail?: string }[] } | null;
  if (!res.ok) throw new PaymongoUnavailable(`PayMongo ${res.status}: ${body?.errors?.map((e) => e.detail).join("; ") ?? "no detail"}`);
  return body!;
}

/** Hosted Checkout over native fetch with HTTP Basic auth (secret key, empty password). */
const liveClient: PaymongoClient = {
  async createCheckout(p) {
    const body = await call("/v2/checkout_sessions", {
      method: "POST",
      body: JSON.stringify({
        data: {
          attributes: {
            line_items: [{ name: p.itemName, amount: p.amountCentavos, currency: "PHP", quantity: 1 }],
            payment_method_types: env.PAYMONGO_PAYMENT_METHODS,
            success_url: p.successUrl,
            cancel_url: p.cancelUrl,
            reference_number: p.referenceNumber,
            description: p.description,
            ...(p.billing ? { billing: p.billing } : {}),
            metadata: { payment_id: p.paymentId },
          },
        },
      }),
    });
    const id = body.data?.id;
    const checkoutUrl = body.data?.attributes?.checkout_url;
    if (!id || !checkoutUrl) throw new PaymongoUnavailable("PayMongo returned no checkout URL");
    return { id, checkoutUrl };
  },
  async retrieveCheckout(id) {
    return summarizeSession((await call(`/v2/checkout_sessions/${encodeURIComponent(id)}`)).data ?? {});
  },
};

/**
 * PAYMONGO_MODE=mock (decision 20): checkout sends the student to the web
 * app's mock page; its Pay button signs a real webhook event. Retrieval never
 * reports a payment, so confirmation always goes through the webhook code.
 */
const mockClient: PaymongoClient = {
  async createCheckout(p) {
    return { id: `cs_mock_${p.paymentId}`, checkoutUrl: `${env.APP_URL}/dev/mock-checkout/${p.paymentId}` };
  },
  async retrieveCheckout(id) {
    return { id, checkoutUrl: null, referenceNumber: null, paid: null };
  },
};

let override: PaymongoClient | null = null;

export function paymongo(): PaymongoClient {
  return override ?? (env.PAYMONGO_MODE === "mock" ? mockClient : liveClient);
}

/** Tests inject a fake PayMongo. */
export function setPaymongoClient(c: PaymongoClient | null) {
  override = c;
}
