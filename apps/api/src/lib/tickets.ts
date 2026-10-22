import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env";

export interface TicketPayload {
  /** User the ticket is bound to. */
  u: string;
  /** What it opens: a class material attachment, or a file in the owner's My Drive. */
  k: "material" | "drive";
  /** materialId or drive item id. */
  m: string;
  /** attachmentId (materials only). */
  a?: string;
  d: "inline" | "attachment";
  /** Expiry, epoch seconds. */
  e: number;
}

export const TICKET_TTL_SECONDS = 5 * 60;
const key = () => Buffer.from(env.FILE_TICKET_SECRET, "base64");
const sign = (body: string) => createHmac("sha256", key()).update(body).digest("base64url");

/** FR-3.12.9: an HMAC-signed ticket bound to the user and the file, valid for 5 minutes. */
export function issueTicket(p: Omit<TicketPayload, "e">, ttlSeconds = TICKET_TTL_SECONDS): { ticket: string; expiresAt: string } {
  const e = Math.floor(Date.now() / 1000) + ttlSeconds;
  const body = Buffer.from(JSON.stringify({ ...p, e })).toString("base64url");
  return { ticket: `${body}.${sign(body)}`, expiresAt: new Date(e * 1000).toISOString() };
}

export type TicketCheck = { ok: true; payload: TicketPayload } | { ok: false; reason: "malformed" | "bad_signature" | "expired" };

export function verifyTicket(ticket: string): TicketCheck {
  const [body, sig, extra] = ticket.split(".");
  if (!body || !sig || extra !== undefined) return { ok: false, reason: "malformed" };
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: "bad_signature" };
  let payload: TicketPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof payload.e !== "number" || payload.e < Math.floor(Date.now() / 1000)) return { ok: false, reason: "expired" };
  return { ok: true, payload };
}
