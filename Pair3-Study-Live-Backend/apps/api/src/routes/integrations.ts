import { randomBytes } from "node:crypto";
import { Router } from "express";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { env } from "../env";
import { db } from "../firebase";
import { col } from "../db";
import { currentUser, requireRole } from "../lib/auth";
import { encryptSecret, decryptSecret } from "../lib/crypto";
import { unavailable } from "../lib/errors";
import { limiter } from "../lib/rateLimit";
import { now } from "../lib/time";
import { parse } from "../lib/validate";
import { logger } from "../logger";
import { calendar } from "../services/calendar";

/** Authenticated half: start and end the connection (FR-3.11.1). */
export const integrationsRouter = Router();
/** Public half: Google redirects here; the state check authenticates it. */
export const integrationsCallbackRouter = Router();

const hosts = requireRole("teacher", "school_admin");

integrationsRouter.get("/integrations/google/connect", hosts, limiter("google-connect", 20), async (req, res) => {
  const u = currentUser(req);
  const provider = calendar();
  if (!provider) throw unavailable("Google isn't configured for this app. Live classes use pasted Meet links.", "google_not_configured");
  const state = randomBytes(24).toString("base64url");
  // CSRF state, 10-minute expiry.
  await col.oauthStates().doc(state).set({ uid: u.uid, expiresAt: Timestamp.fromMillis(Date.now() + 10 * 60_000) });
  res.json({ url: await provider.authUrl(state) });
});

integrationsRouter.delete("/integrations/google", hosts, async (req, res) => {
  const u = currentUser(req);
  const ref = col.integrations().doc(u.uid);
  const existing = (await ref.get()).data();
  if (existing) {
    await calendar()
      ?.revoke(decryptSecret(existing.refreshTokenEncrypted))
      .catch(() => undefined);
    await ref.delete();
  }
  res.status(204).end();
});

const callbackQuery = z.object({ state: z.string().max(200).optional(), code: z.string().max(2000).optional(), error: z.string().max(200).optional() });

integrationsCallbackRouter.get("/integrations/google/callback", limiter("google-callback", 30), async (req, res) => {
  const q = parse(callbackQuery, req.query);
  const settingsFor = async (uid: string | null) => {
    const role = uid ? (await col.users().doc(uid).get()).data()?.role : null;
    return `${env.APP_URL}${role === "school_admin" ? "/a/settings" : "/t/settings"}`;
  };
  if (!q.state) {
    res.redirect(`${await settingsFor(null)}?google=error`);
    return;
  }
  const stateRef = col.oauthStates().doc(q.state);
  // Single use: read and delete the state together.
  const state = await db.runTransaction(async (tx) => {
    const snap = await tx.get(stateRef);
    if (snap.exists) tx.delete(stateRef);
    return snap.data() ?? null;
  });
  if (!state || state.expiresAt.toMillis() < Date.now()) {
    res.redirect(`${await settingsFor(state?.uid ?? null)}?google=expired`);
    return;
  }
  const back = await settingsFor(state.uid);
  if (q.error || !q.code) {
    res.redirect(`${back}?google=${q.error === "access_denied" ? "denied" : "error"}`);
    return;
  }
  try {
    const provider = calendar();
    if (!provider) throw new Error("Google isn't configured");
    const result = await provider.exchangeCode(q.code);
    await col.integrations().doc(state.uid).set({
      provider: "google",
      googleEmail: result.email,
      refreshTokenEncrypted: encryptSecret(result.refreshToken),
      scopes: result.scopes,
      status: "connected",
      connectedAt: now(),
    });
    res.redirect(`${back}?google=connected`);
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : "unknown" }, "google oauth exchange failed");
    res.redirect(`${back}?google=error`);
  }
});
