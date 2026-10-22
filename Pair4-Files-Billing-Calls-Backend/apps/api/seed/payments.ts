import { Timestamp } from "firebase-admin/firestore";
import { col, type PaymentDoc } from "../src/db";
import { newReferenceNumber, priceFor } from "../src/services/payments";
import type { SeedContext } from "./seed";

/** Classes are free. The app charges only for teacher slots and teacher Premium. */
export async function seedBilling(ctx: SeedContext) {
  const [tanaka] = ctx.teacherUids;
  const daysAgo = (d: number) => Timestamp.fromMillis(Date.now() - d * 86_400_000);
  const price = priceFor("premium", 1);
  const premium: PaymentDoc = {
    referenceNumber: newReferenceNumber(),
    uid: tanaka,
    schoolId: ctx.schoolId,
    purpose: "premium",
    quantity: 1,
    description: price.description,
    amountCentavos: price.amountCentavos,
    currency: "PHP",
    provider: "paymongo",
    status: "paid",
    checkoutSessionId: "cs_seed_premium",
    method: "gcash",
    providerPaymentId: "pay_seed_premium",
    paidAt: daysAgo(10),
    createdAt: daysAgo(10),
    updatedAt: daysAgo(10),
  };
  await col.payments().doc("seed-payment-premium").set(premium);
}
