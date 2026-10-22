import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { PLANS } from "@nihongo/shared";
import { col, type PaymentDoc } from "../src/db";
import { expirePayments, paidEvent, signPaymongo } from "../src/services/paymentFlow";
import { PaymongoUnavailable, setPaymongoClient } from "../src/services/paymongo";
import { api, bearer, createSchool, createUser, createWorld, type TestUser, type World } from "./helpers";

let w: World;
beforeAll(async () => {
  w = await createWorld();
});
afterEach(() => setPaymongoClient(null));

const payment = async (id: string) => (await col.payments().doc(id).get()).data()! as PaymentDoc;
const user = async (uid: string) => (await col.users().doc(uid).get()).data()!;

function webhook(raw: string, signature = signPaymongo(raw, false)) {
  return api().post("/api/webhooks/paymongo").set("Content-Type", "application/json").set("Paymongo-Signature", signature).send(raw);
}

async function premiumCheckout(t: TestUser, body: Record<string, unknown> = {}) {
  const res = await api().post("/api/billing/premium/checkout").set(bearer(t)).send(body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { paymentId: string; checkoutUrl: string; reused: boolean };
}

async function seatsCheckout(a: TestUser, packs = 1) {
  const res = await api().post("/api/billing/teacher-seats/checkout").set(bearer(a)).send({ packs });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { paymentId: string; checkoutUrl: string; reused: boolean };
}

async function pay(paymentId: string, eventId: string, extra: { amountCentavos?: number } = {}) {
  return webhook(JSON.stringify(paidEvent(await payment(paymentId), { eventId, ...extra })));
}

describe("Teacher slots: 5 free, then ₱299 for 5 more (one-time)", () => {
  it("a school starts with 5 free teacher slots", async () => {
    const res = await api().get("/api/billing/school").set(bearer(w.admin));
    expect(res.status).toBe(200);
    expect(res.body.seats).toMatchObject({ free: 5, purchased: 0, total: 5, used: 2, available: 3 });
  });

  it("the 6th teacher is refused with seat_limit_reached until slots are bought", async () => {
    const schoolId = await createSchool();
    const admin = await createUser("school_admin", { schoolId });
    for (let i = 0; i < PLANS.freeTeacherSeats; i++) {
      const res = await api().post(`/api/schools/${schoolId}/users`).set(bearer(admin)).send({ name: `Teacher ${i}`, email: `slot-${schoolId}-${i}@test.nihongo`.toLowerCase() });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
    }
    const sixthEmail = `slot-${schoolId}-6@test.nihongo`.toLowerCase();
    const sixth = await api().post(`/api/schools/${schoolId}/users`).set(bearer(admin)).send({ name: "Teacher 6", email: sixthEmail });
    expect(sixth.status).toBe(402);
    expect(sixth.body.error.code).toBe("seat_limit_reached");
    expect(sixth.body.error.message).toContain("₱299.00");

    const r = await seatsCheckout(admin);
    const p = await payment(r.paymentId);
    expect(p).toMatchObject({ purpose: "teacher_seats", quantity: 1, amountCentavos: 29_900, status: "pending", schoolId });
    expect((await pay(r.paymentId, `evt_seats_${schoolId}`)).body.result).toBe("paid");
    expect((await col.schools().doc(schoolId).get()).data()!.extraTeacherSeats).toBe(5);

    const again = await api().post(`/api/schools/${schoolId}/users`).set(bearer(admin)).send({ name: "Teacher 6", email: sixthEmail });
    expect(again.status, JSON.stringify(again.body)).toBe(201);
    expect(again.body.seats).toMatchObject({ total: 10, used: 6, available: 4 });
  });

  it("buying 2 packs costs ₱598 and adds 10 slots; an amount in the body is ignored", async () => {
    const schoolId = await createSchool();
    const admin = await createUser("school_admin", { schoolId });
    const res = await api().post("/api/billing/teacher-seats/checkout").set(bearer(admin)).send({ packs: 2, amountCentavos: 1 });
    expect(res.status).toBe(201);
    expect((await payment(res.body.paymentId)).amountCentavos).toBe(59_800);
    await pay(res.body.paymentId, `evt_seats2_${schoolId}`);
    expect((await api().get("/api/billing/school").set(bearer(admin))).body.seats).toMatchObject({ purchased: 10, total: 15 });
  });

  it("removing a teacher frees a slot; turning one back on needs a free slot", async () => {
    const schoolId = await createSchool();
    const admin = await createUser("school_admin", { schoolId });
    const teachers = await Promise.all(Array.from({ length: 5 }, () => createUser("teacher", { schoolId })));
    expect((await api().get("/api/billing/school").set(bearer(admin))).body.seats.available).toBe(0);
    expect((await api().delete(`/api/users/${teachers[0].uid}`).set(bearer(admin))).status).toBe(204);
    expect((await api().get("/api/billing/school").set(bearer(admin))).body.seats.available).toBe(1);
    expect((await api().patch(`/api/users/${teachers[0].uid}`).set(bearer(admin)).send({ disabled: false })).status).toBe(200);
    expect((await api().get("/api/billing/school").set(bearer(admin))).body.seats.available).toBe(0);
    await api().delete(`/api/users/${teachers[1].uid}`).set(bearer(admin));
    await createUser("teacher", { schoolId });
    const blocked = await api().patch(`/api/users/${teachers[1].uid}`).set(bearer(admin)).send({ disabled: false });
    expect(blocked.status).toBe(402);
  });

  it("only School Admins buy slots; other schools' admins can't see the payment", async () => {
    expect((await api().post("/api/billing/teacher-seats/checkout").set(bearer(w.teacher)).send({ packs: 1 })).status).toBe(403);
    expect((await api().post("/api/billing/teacher-seats/checkout").set(bearer(w.student)).send({ packs: 1 })).status).toBe(403);
    const r = await seatsCheckout(w.admin);
    const other = await createUser("school_admin", { schoolId: await createSchool() });
    expect((await api().get(`/api/payments/${r.paymentId}`).set(bearer(other))).status).toBe(403);
    expect((await api().post("/api/billing/teacher-seats/checkout").set(bearer(w.admin)).send({ packs: 0 })).status).toBe(400);
    expect((await api().post("/api/billing/teacher-seats/checkout").set(bearer(w.admin)).send({ packs: 21 })).status).toBe(400);
  });
});

describe("Teacher Premium: ₱299, one-time", () => {
  it("a free teacher has 5-minute calls and 500 MB; students have no plan", async () => {
    const t = await createUser("teacher", { schoolId: w.schoolId });
    const me = await api().get("/api/me").set(bearer(t));
    expect(me.body.plan).toMatchObject({ premium: false, premiumSince: null, callLimitSeconds: 300, storageLimitBytes: 500 * 1024 * 1024 });
    expect((await api().get("/api/me").set(bearer(w.student))).body.plan).toBeNull();
  });

  it("paying once gives Premium for good; it can't be bought twice", async () => {
    const t = await createUser("teacher", { schoolId: w.schoolId });
    const r = await premiumCheckout(t, { amountCentavos: 100, quantity: 12 });
    expect(await payment(r.paymentId)).toMatchObject({ purpose: "premium", amountCentavos: 29_900, quantity: 1, description: "Teacher Premium (one-time)" });
    expect(r.checkoutUrl).toBe(`http://localhost:5173/dev/mock-checkout/${r.paymentId}`);
    expect((await pay(r.paymentId, `evt_premium_${t.uid}`)).body.result).toBe("paid");
    expect((await user(t.uid)).premiumSince).toBeTruthy();
    const plan = (await api().get("/api/me").set(bearer(t))).body.plan;
    expect(plan).toMatchObject({ premium: true, callLimitSeconds: 900, storageLimitBytes: 1024 * 1024 * 1024 });
    expect(plan.premiumSince).toEqual(expect.any(String));
    expect(plan).not.toHaveProperty("premiumUntil");

    const again = await api().post("/api/billing/premium/checkout").set(bearer(t)).send({});
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("already_premium");
    const notes = await col.notifications().where("uid", "==", t.uid).where("type", "==", "payment.paid").get();
    expect(notes.size).toBe(1);
  });

  it("Premium doesn't expire", async () => {
    const t = await createUser("teacher", { schoolId: w.schoolId });
    await col.users().doc(t.uid).update({ premiumSince: Timestamp.fromMillis(Date.now() - 400 * 86_400_000) });
    expect((await api().get("/api/me").set(bearer(t))).body.plan).toMatchObject({ premium: true, callLimitSeconds: 900 });
  });

  it("two checkouts paid at once keep the first Premium date", async () => {
    const t = await createUser("teacher", { schoolId: w.schoolId });
    const first = await premiumCheckout(t);
    // A second pending checkout, as if started from another tab before the first was paid.
    await col.payments().doc(first.paymentId).update({ createdAt: Timestamp.fromMillis(Date.now() - 2 * 3_600_000) });
    const second = await premiumCheckout(t);
    expect(second.paymentId).not.toBe(first.paymentId);
    await pay(first.paymentId, `evt_twice1_${t.uid}`);
    const since = (await user(t.uid)).premiumSince!.toMillis();
    expect((await pay(second.paymentId, `evt_twice2_${t.uid}`)).body.result).toBe("paid");
    expect((await user(t.uid)).premiumSince!.toMillis()).toBe(since);
  });

  it("only teachers buy Premium", async () => {
    expect((await api().post("/api/billing/premium/checkout").set(bearer(w.admin))).status).toBe(403);
    expect((await api().post("/api/billing/premium/checkout").set(bearer(w.student))).status).toBe(403);
  });

  it("a pending checkout from the last hour is reused", async () => {
    const t = await createUser("teacher", { schoolId: w.schoolId });
    const a = await premiumCheckout(t);
    const b = await premiumCheckout(t);
    expect(b).toMatchObject({ reused: true, paymentId: a.paymentId });
  });

  it("when PayMongo is down, checkout says online payment isn't available", async () => {
    setPaymongoClient({
      createCheckout: async () => {
        throw new PaymongoUnavailable("down");
      },
      retrieveCheckout: async () => ({ id: "", checkoutUrl: null, referenceNumber: null, paid: null }),
    });
    const t = await createUser("teacher", { schoolId: w.schoolId });
    const res = await api().post("/api/billing/premium/checkout").set(bearer(t));
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("provider_unavailable");
  });
});

describe("PayMongo webhook", () => {
  it("a bad signature gets 401", async () => {
    const t = await createUser("teacher", { schoolId: w.schoolId });
    const r = await premiumCheckout(t);
    const raw = JSON.stringify(paidEvent(await payment(r.paymentId), { eventId: "evt_badsig_b1" }));
    expect((await webhook(raw, "t=1,te=deadbeef,li=")).status).toBe(401);
    expect((await webhook(raw, "")).status).toBe(401);
    expect((await webhook(raw.replace("29900", "1"), signPaymongo(raw, false))).status).toBe(401);
    expect((await payment(r.paymentId)).status).toBe("pending");
  });

  it("the same event twice is applied once", async () => {
    const t = await createUser("teacher", { schoolId: w.schoolId });
    const r = await premiumCheckout(t);
    const raw = JSON.stringify(paidEvent(await payment(r.paymentId), { eventId: "evt_dup_b1" }));
    expect((await webhook(raw)).body.result).toBe("paid");
    const since = (await user(t.uid)).premiumSince!.toMillis();
    expect((await webhook(raw)).body.duplicate).toBe(true);
    expect((await user(t.uid)).premiumSince!.toMillis()).toBe(since);
  });

  it("an amount mismatch sets needs_review and grants nothing", async () => {
    const t = await createUser("teacher", { schoolId: w.schoolId });
    const r = await premiumCheckout(t);
    expect((await pay(r.paymentId, "evt_short_b1", { amountCentavos: 100 })).body.result).toBe("needs_review");
    expect((await payment(r.paymentId)).status).toBe("needs_review");
    expect((await user(t.uid)).premiumSince ?? null).toBeNull();
    const notes = await col.notifications().where("uid", "==", t.uid).where("type", "==", "payment.needs_review").get();
    expect(notes.size).toBe(1);
  });

  it("unknown event types and other-mode events change nothing", async () => {
    const t = await createUser("teacher", { schoolId: w.schoolId });
    const r = await premiumCheckout(t);
    const event = paidEvent(await payment(r.paymentId), { eventId: "evt_other_b1" });
    event.data.attributes.type = "payment.refunded";
    expect((await webhook(JSON.stringify(event))).status).toBe(200);
    const live = JSON.stringify(paidEvent(await payment(r.paymentId), { eventId: "evt_live_b1", livemode: true }));
    expect((await webhook(live)).body.ignored).toBe("other_mode");
    expect((await payment(r.paymentId)).status).toBe("pending");
  });

  it("a paid webhook after expiry still applies; money received is never ignored", async () => {
    const t = await createUser("teacher", { schoolId: w.schoolId });
    const r = await premiumCheckout(t);
    await col.payments().doc(r.paymentId).update({ status: "expired" });
    expect((await pay(r.paymentId, "evt_late_b1")).body.result).toBe("paid");
    expect((await api().get("/api/me").set(bearer(t))).body.plan.premium).toBe(true);
  });
});

describe("Mock mode, reconciliation, receipts", () => {
  it("the mock Pay button runs the real webhook code end to end", async () => {
    const t = await createUser("teacher", { schoolId: w.schoolId });
    const r = await premiumCheckout(t);
    const info = await api().get(`/api/dev/mock-paymongo/${r.paymentId}`).set(bearer(t));
    expect(info.body).toMatchObject({ amountCentavos: 29_900, description: "Teacher Premium (one-time)", cancelUrl: "http://localhost:5173/t/premium" });
    const payRes = await api().post(`/api/dev/mock-paymongo/${r.paymentId}/pay`).set(bearer(t));
    expect(payRes.body.successUrl).toBe(`http://localhost:5173/payments/${r.paymentId}/return`);
    expect((await api().get(`/api/payments/${r.paymentId}`).set(bearer(t))).body.status).toBe("paid");
    const receipt = await api().get(`/api/payments/${r.paymentId}/receipt`).set(bearer(t));
    expect(receipt.body).toMatchObject({ amountCentavos: 29_900, description: "Teacher Premium (one-time)", method: "GCash via PayMongo", schoolName: "Test School" });
    const history = await api().get("/api/billing/premium").set(bearer(t));
    expect(history.body.payments).toHaveLength(1);
    expect(history.body.plan.premium).toBe(true);
  });

  it("polling the payment reconciles with PayMongo when the webhook was missed", async () => {
    const a = await createUser("school_admin", { schoolId: await createSchool() });
    const r = await seatsCheckout(a);
    setPaymongoClient({
      createCheckout: async () => ({ id: "x", checkoutUrl: "x" }),
      retrieveCheckout: async (id) => ({ id, checkoutUrl: null, referenceNumber: null, paid: { amountCentavos: 29_900, method: "card", providerPaymentId: "pay_b1", paidAt: new Date() } }),
    });
    expect((await api().get(`/api/payments/${r.paymentId}`).set(bearer(a))).body).toMatchObject({ status: "paid", method: "card" });
    expect((await api().get("/api/billing/school").set(bearer(a))).body.seats.purchased).toBe(5);
  });

  it("expire-payments expires unpaid checkouts after 24 hours", async () => {
    const t = await createUser("teacher", { schoolId: w.schoolId });
    const r = await premiumCheckout(t);
    await col.payments().doc(r.paymentId).update({ createdAt: Timestamp.fromMillis(Date.now() - 25 * 3_600_000) });
    setPaymongoClient({
      createCheckout: async () => ({ id: "x", checkoutUrl: "x" }),
      retrieveCheckout: async (id) => ({ id, checkoutUrl: null, referenceNumber: null, paid: null }),
    });
    expect((await expirePayments()).expired).toBeGreaterThanOrEqual(1);
    expect((await payment(r.paymentId)).status).toBe("expired");
  });

  it("students have no billing, and the class tuition routes are gone", async () => {
    expect((await api().get("/api/billing/premium").set(bearer(w.student))).status).toBe(403);
    expect((await api().post("/api/payments/checkout").set(bearer(w.student)).send({ classId: "x" })).status).toBe(404);
    expect((await api().get("/api/me/payments").set(bearer(w.student))).status).toBe(404);
  });
});
