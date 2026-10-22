import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { WebSocket } from "ws";
import { PLANS } from "@nihongo/shared";
import { col } from "../src/db";
import { attachCallSignaling, resetRooms } from "../src/services/calls";
import { api, app, bearer, createUser, createWorld, seedClass, seedEnrollment, type TestUser, type World } from "./helpers";

let w: World;
let server: Server;
let wsUrl: string;

beforeAll(async () => {
  w = await createWorld();
  server = app.listen(0);
  attachCallSignaling(server);
  wsUrl = `ws://127.0.0.1:${(server.address() as AddressInfo).port}/api/calls/ws`;
});
afterEach(() => resetRooms());
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const makePremium = (uid: string) => col.users().doc(uid).update({ premiumSince: Timestamp.now() });

async function classWithStudent(teacher: TestUser) {
  const { classId } = await seedClass(w.schoolId, [teacher.uid]);
  const student = await createUser("student", { schoolId: w.schoolId });
  await seedEnrollment(classId, student.uid, w.schoolId);
  return { classId, student };
}

/** A signaling client that collects messages. */
function connect(user: TestUser, callId: string) {
  const ws = new WebSocket(wsUrl);
  const messages: any[] = [];
  const waiters: { pred: (m: any) => boolean; resolve: (m: any) => void }[] = [];
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw));
    messages.push(m);
    for (const wtr of [...waiters]) if (wtr.pred(m)) {
      waiters.splice(waiters.indexOf(wtr), 1);
      wtr.resolve(m);
    }
  });
  const next = (type: string, timeout = 5000) =>
    new Promise<any>((resolve, reject) => {
      const hit = messages.find((m) => m.type === type && !m._seen);
      if (hit) {
        hit._seen = true;
        return resolve(hit);
      }
      const t = setTimeout(() => reject(new Error(`no ${type} message; got ${JSON.stringify(messages)}`)), timeout);
      waiters.push({ pred: (m) => m.type === type && !m._seen, resolve: (m) => ((m._seen = true), clearTimeout(t), resolve(m)) });
    });
  const closed = new Promise<number>((resolve) => ws.on("close", (code) => resolve(code)));
  const opened = new Promise<void>((resolve) => ws.on("open", () => resolve()));
  const join = async () => {
    await opened;
    ws.send(JSON.stringify({ type: "join", callId, token: user.token }));
  };
  return { ws, messages, next, closed, join, send: (m: unknown) => ws.send(JSON.stringify(m)) };
}

describe("In-app video calls", () => {
  it("a free host gets 5 minutes; enrolled students are notified and can see the call", async () => {
    const t = await createUser("teacher", { schoolId: w.schoolId });
    const { classId, student } = await classWithStudent(t);
    const res = await api().post(`/api/classes/${classId}/calls`).set(bearer(t)).send({});
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({ status: "active", limitSeconds: PLANS.freeCallSeconds, canExtend: false, hostUid: t.uid });
    expect(new Date(res.body.endsAt).getTime() - new Date(res.body.startedAt).getTime()).toBe(300_000);

    const active = await api().get(`/api/classes/${classId}/calls/active`).set(bearer(student));
    expect(active.body.call.id).toBe(res.body.id);
    const notes = await col.notifications().where("uid", "==", student.uid).where("type", "==", "call.started").get();
    expect(notes.size).toBe(1);

    const again = await api().post(`/api/classes/${classId}/calls`).set(bearer(t)).send({});
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("call_active");
  });

  it("a Premium host gets 15 minutes", async () => {
    const t = await createUser("teacher", { schoolId: w.schoolId });
    await makePremium(t.uid);
    const { classId } = await classWithStudent(t);
    const res = await api().post(`/api/classes/${classId}/calls`).set(bearer(t)).send({});
    expect(res.body.limitSeconds).toBe(PLANS.premiumCallSeconds);
  });

  it("extending to 15 minutes needs Premium; after buying Premium the host can extend", async () => {
    const t = await createUser("teacher", { schoolId: w.schoolId });
    const { classId, student } = await classWithStudent(t);
    const call = (await api().post(`/api/classes/${classId}/calls`).set(bearer(t)).send({})).body;
    const denied = await api().post(`/api/calls/${call.id}/extend`).set(bearer(t));
    expect(denied.status).toBe(402);
    expect(denied.body.error.code).toBe("premium_required");
    expect((await api().post(`/api/calls/${call.id}/extend`).set(bearer(student))).status).toBe(403);

    await makePremium(t.uid);
    expect((await api().get(`/api/calls/${call.id}`).set(bearer(t))).body.canExtend).toBe(true);
    const ext = await api().post(`/api/calls/${call.id}/extend`).set(bearer(t));
    expect(ext.status).toBe(200);
    expect(ext.body).toMatchObject({ limitSeconds: 900, canExtend: false });
    expect(new Date(ext.body.endsAt).getTime() - new Date(call.startedAt).getTime()).toBe(900_000);
    expect((await api().post(`/api/calls/${call.id}/extend`).set(bearer(t))).status).toBe(409);
  });

  it("only class members see or join a call", async () => {
    const t = await createUser("teacher", { schoolId: w.schoolId });
    const { classId } = await classWithStudent(t);
    const call = (await api().post(`/api/classes/${classId}/calls`).set(bearer(t)).send({})).body;
    const outsider = await createUser("student", { schoolId: w.schoolId });
    expect((await api().get(`/api/calls/${call.id}`).set(bearer(outsider))).status).toBe(403);
    expect((await api().post(`/api/classes/${classId}/calls`).set(bearer(w.otherTeacher)).send({})).status).toBe(403);
    const c = connect(outsider, call.id);
    await c.join();
    expect((await c.next("error")).code).toBe("not_enrolled");
    await c.closed;
  });

  it("signaling: peers see each other, relay offers, and hear when someone leaves", async () => {
    const t = await createUser("teacher", { schoolId: w.schoolId });
    const { classId, student } = await classWithStudent(t);
    const call = (await api().post(`/api/classes/${classId}/calls`).set(bearer(t)).send({})).body;

    const host = connect(t, call.id);
    await host.join();
    const hostJoined = await host.next("joined");
    expect(hostJoined).toMatchObject({ peers: [], limitSeconds: 300, hostUid: t.uid });
    expect(hostJoined.iceServers[0].urls).toContain("stun:");

    const guest = connect(student, call.id);
    await guest.join();
    const guestJoined = await guest.next("joined");
    expect(guestJoined.peers).toEqual([expect.objectContaining({ peerId: hostJoined.peerId, uid: t.uid })]);
    expect((await host.next("peer-joined")).peer.uid).toBe(student.uid);

    guest.send({ type: "signal", to: hostJoined.peerId, data: { sdp: "offer" } });
    expect(await host.next("signal")).toMatchObject({ from: guestJoined.peerId, data: { sdp: "offer" } });
    expect((await api().get(`/api/calls/${call.id}`).set(bearer(t))).body.participantCount).toBe(2);

    guest.ws.close();
    expect((await host.next("peer-left")).peerId).toBe(guestJoined.peerId);
    host.ws.close();
  });

  it("the call ends for everyone when its time is up", async () => {
    const t = await createUser("teacher", { schoolId: w.schoolId });
    const { classId, student } = await classWithStudent(t);
    const call = (await api().post(`/api/classes/${classId}/calls`).set(bearer(t)).send({})).body;
    // Pretend the call is about to hit its limit.
    await col.calls().doc(call.id).update({ endsAt: Timestamp.fromMillis(Date.now() + 1500) });
    resetRooms();
    const guest = connect(student, call.id);
    await guest.join();
    await guest.next("joined");
    expect((await guest.next("ended", 6000)).reason).toBe("time_limit");
    await guest.closed;
    expect((await col.calls().doc(call.id).get()).data()).toMatchObject({ status: "ended", endedReason: "time_limit" });
    // Joining afterwards is refused.
    const late = connect(student, call.id);
    await late.join();
    expect((await late.next("error")).code).toBe("call_ended");
  });

  it("an expired call is ended on read, so a new one can start", async () => {
    const t = await createUser("teacher", { schoolId: w.schoolId });
    const { classId } = await classWithStudent(t);
    const call = (await api().post(`/api/classes/${classId}/calls`).set(bearer(t)).send({})).body;
    await col.calls().doc(call.id).update({ endsAt: Timestamp.fromMillis(Date.now() - 1000) });
    expect((await api().get(`/api/classes/${classId}/calls/active`).set(bearer(t))).body.call).toBeNull();
    expect((await api().post(`/api/classes/${classId}/calls`).set(bearer(t)).send({})).status).toBe(201);
  });

  it("the host ends the call for everyone", async () => {
    const t = await createUser("teacher", { schoolId: w.schoolId });
    const { classId, student } = await classWithStudent(t);
    const call = (await api().post(`/api/classes/${classId}/calls`).set(bearer(t)).send({})).body;
    const guest = connect(student, call.id);
    await guest.join();
    await guest.next("joined");
    expect((await api().post(`/api/calls/${call.id}/end`).set(bearer(student))).status).toBe(403);
    const end = await api().post(`/api/calls/${call.id}/end`).set(bearer(t));
    expect(end.body.status).toBe("ended");
    expect((await guest.next("ended")).reason).toBe("host");
  });
});
