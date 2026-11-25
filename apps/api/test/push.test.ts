import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, bearer, createUser, db, type TestUser } from "./helpers";
import { col } from "../src/db";
import { notify } from "../src/lib/notify";
import { pushTokenId, setPushSender, type PushMessage } from "../src/lib/push";

const sent: { tokens: string[]; message: PushMessage }[] = [];
let goneTokens: string[] = [];
let student: TestUser;
let other: TestUser;

beforeAll(async () => {
  setPushSender(async (tokens, message) => {
    sent.push({ tokens, message });
    return { invalid: tokens.filter((t) => goneTokens.includes(t)) };
  });
  [student, other] = await Promise.all([createUser("student"), createUser("student")]);
});
afterAll(() => setPushSender(null));

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const register = (u: TestUser, token: string) => api().post("/api/me/push-tokens").set(bearer(u)).send({ token, platform: "android" });

describe("Phone push notifications", () => {
  it("a registered phone gets every new notification, with its link", async () => {
    expect((await register(student, "fcm-token-phone-aaaa")).status).toBe(204);
    sent.length = 0;
    await notify([student.uid], { type: "material_published", title: "New material in N5 Saturday Class", body: "Lesson 2 slides", link: "/s/classes/c1/materials" });
    await wait(100);
    expect(sent).toHaveLength(1);
    expect(sent[0].tokens).toEqual(["fcm-token-phone-aaaa"]);
    expect(sent[0].message).toEqual({ type: "material_published", title: "New material in N5 Saturday Class", body: "Lesson 2 slides", link: "/s/classes/c1/materials" });
  });

  it("notifications written in a transaction are pushed only after the commit", async () => {
    sent.length = 0;
    await db.runTransaction(async (tx) => {
      await notify([student.uid], { type: "call_started", title: "Yuki Tanaka started a call", body: "N5 Saturday Class" }, tx);
    });
    expect(sent).toHaveLength(0);
    await wait(2000);
    expect(sent.map((s) => s.message.title)).toEqual(["Yuki Tanaka started a call"]);
  });

  it("a phone FCM no longer knows is forgotten", async () => {
    await register(student, "fcm-token-phone-gone");
    goneTokens = ["fcm-token-phone-gone"];
    await notify([student.uid], { type: "x", title: "Hello", body: "There" });
    await wait(200);
    expect((await col.pushTokens().doc(pushTokenId("fcm-token-phone-gone")).get()).exists).toBe(false);
    expect((await col.pushTokens().doc(pushTokenId("fcm-token-phone-aaaa")).get()).exists).toBe(true);
  });

  it("a phone moves to whoever signs in on it last, and signing out stops pushes", async () => {
    await register(other, "fcm-token-phone-aaaa");
    expect((await col.pushTokens().doc(pushTokenId("fcm-token-phone-aaaa")).get()).data()!.uid).toBe(other.uid);
    // Someone else can't remove it.
    await api().delete("/api/me/push-tokens").set(bearer(student)).send({ token: "fcm-token-phone-aaaa" });
    expect((await col.pushTokens().doc(pushTokenId("fcm-token-phone-aaaa")).get()).exists).toBe(true);
    expect((await api().delete("/api/me/push-tokens").set(bearer(other)).send({ token: "fcm-token-phone-aaaa" })).status).toBe(204);
    expect((await col.pushTokens().doc(pushTokenId("fcm-token-phone-aaaa")).get()).exists).toBe(false);
    sent.length = 0;
    await notify([other.uid], { type: "x", title: "After sign-out", body: "-" });
    await wait(100);
    expect(sent).toHaveLength(0);
  });

  it("registering needs a signed-in user", async () => {
    expect((await api().post("/api/me/push-tokens").send({ token: "fcm-token-phone-anon" })).status).toBe(401);
  });
});
