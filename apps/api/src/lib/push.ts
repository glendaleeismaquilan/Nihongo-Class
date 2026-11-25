import { createHash } from "node:crypto";
import type { DocumentReference } from "firebase-admin/firestore";
import { env } from "../env";
import { messaging } from "../firebase";
import { col } from "../db";
import { logger } from "../logger";

/**
 * Phone push notifications through Firebase Cloud Messaging. Every in-app
 * notification (lib/notify.ts) is also pushed to the recipient's registered
 * phones, so it shows in the phone's notification tray even when the app is closed.
 */
export interface PushMessage {
  type: string;
  title: string;
  body: string;
  link: string | null;
}

/** Sends one message to many device tokens; returns the tokens FCM says are gone. */
export type PushSender = (tokens: string[], message: PushMessage) => Promise<{ invalid: string[] }>;

const fcmSender: PushSender = async (tokens, m) => {
  const res = await messaging().sendEachForMulticast({
    tokens,
    notification: { title: m.title, body: m.body },
    data: { type: m.type, link: m.link ?? "" },
    android: { priority: "high", notification: { channelId: "default", sound: "default" } },
  });
  const invalid: string[] = [];
  res.responses.forEach((r, i) => {
    const code = r.error?.code ?? "";
    if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token" || code === "messaging/invalid-argument") invalid.push(tokens[i]);
  });
  return { invalid };
};

// The emulators have no messaging service, and tests inject a fake sender.
let sender: PushSender | null = env.NODE_ENV === "test" || process.env.FIRESTORE_EMULATOR_HOST ? null : fcmSender;

export function setPushSender(s: PushSender | null) {
  sender = s;
}

export const pushTokenId = (token: string) => createHash("sha256").update(token).digest("hex");

/** Best effort: a failed push never fails the request that made the notification. */
export async function pushToUsers(uids: string[], message: PushMessage): Promise<void> {
  const send = sender;
  if (!send || !uids.length) return;
  try {
    const tokens: string[] = [];
    for (let i = 0; i < uids.length; i += 30) {
      const snap = await col.pushTokens().where("uid", "in", uids.slice(i, i + 30)).get();
      for (const d of snap.docs) tokens.push(d.data().token);
    }
    for (let i = 0; i < tokens.length; i += 500) {
      const { invalid } = await send(tokens.slice(i, i + 500), message);
      await Promise.all(invalid.map((t) => col.pushTokens().doc(pushTokenId(t)).delete()));
    }
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : "unknown" }, "push notification failed");
  }
}

/**
 * For notifications written inside a transaction: waits for the commit, then
 * pushes only the notifications that were really saved (a retried or failed
 * transaction leaves none behind).
 */
export function pushAfterCommit(refs: DocumentReference[], message: PushMessage, delayMs = 1500) {
  if (!sender || !refs.length) return;
  setTimeout(() => {
    void (async () => {
      try {
        const snaps = await Promise.all(refs.map((r) => r.get()));
        const uids = snaps.filter((s) => s.exists).map((s) => s.get("uid") as string);
        await pushToUsers([...new Set(uids)], message);
      } catch (err) {
        logger.warn({ err: err instanceof Error ? err.message : "unknown" }, "push after commit failed");
      }
    })();
  }, delayMs).unref();
}
