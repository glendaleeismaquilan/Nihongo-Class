import { randomInt } from "node:crypto";
import { CLASS_CODE_ALPHABET, PLANS, dateKey, formatPeso, type PaymentPurpose } from "@nihongo/shared";
import { env } from "../env";

/** Reference numbers like NC-20260925-8F3K2Q. */
export function newReferenceNumber(at = new Date()): string {
  const day = dateKey(at, env.DEFAULT_TIME_ZONE).replace(/-/g, "");
  const suffix = Array.from({ length: 6 }, () => CLASS_CODE_ALPHABET[randomInt(CLASS_CODE_ALPHABET.length)]).join("");
  return `NC-${day}-${suffix}`;
}

/**
 * The price list. The amount always comes from here, never from the request:
 * ₱299 for each pack of 5 teacher slots, ₱299 for Premium. Both are one-time payments.
 */
export function priceFor(purpose: PaymentPurpose, quantity: number): { amountCentavos: number; description: string } {
  if (purpose === "teacher_seats") {
    const slots = quantity * PLANS.seatPackSize;
    return { amountCentavos: quantity * PLANS.seatPackPriceCentavos, description: `${slots} more teacher slots (${quantity} × ${formatPeso(PLANS.seatPackPriceCentavos)})` };
  }
  return { amountCentavos: PLANS.premiumPriceCentavos, description: "Teacher Premium (one-time)" };
}
