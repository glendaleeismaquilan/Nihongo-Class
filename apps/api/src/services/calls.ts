import type { IncomingMessage, Server } from "node:http";
import { Timestamp } from "firebase-admin/firestore";
import { WebSocketServer, type WebSocket } from "ws";
import { PLANS, type CallDto } from "@nihongo/shared";
import { env } from "../env";
import { adminAuth } from "../firebase";
import { col, type CallDoc } from "../db";
import { assertClassAccess } from "../lib/access";
import { toAuthedUser } from "../lib/auth";
import { ApiError } from "../lib/errors";
import { iso } from "../lib/time";
import { logger } from "../logger";
import { isPremium } from "./plan";

/**
 * In-app group video calls (decision 31): browsers connect peer to peer with
 * WebRTC (a small mesh, up to 8 people). This server only relays the signaling
 * messages and enforces the time limit: 5 minutes free, 15 with the host's
 * Premium. Rooms live in this process's memory, so the API must run as a
 * single instance while calls are in use.
 */

interface Peer {
  peerId: string;
  uid: string;
  name: string;
  ws: WebSocket;
}

interface Room {
  callId: string;
  peers: Map<string, Peer>;
  timer: NodeJS.Timeout | null;
  emptyTimer: NodeJS.Timeout | null;
}

const rooms = new Map<string, Room>();
/** A call nobody has been in for this long ends by itself. */
const EMPTY_GRACE_MS = 2 * 60 * 1000;

export const participantCount = (callId: string) => rooms.get(callId)?.peers.size ?? 0;

export function iceServers() {
  const servers: { urls: string | string[]; username?: string; credential?: string }[] = [{ urls: "stun:stun.l.google.com:19302" }];
  if (env.TURN_URLS.length) servers.push({ urls: env.TURN_URLS, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL });
  return servers;
}

export async function callDto(id: string, d: CallDoc): Promise<CallDto> {
  const host = (await col.users().doc(d.hostUid).get()).data();
  return {
    id,
    classId: d.classId,
    hostUid: d.hostUid,
    hostName: host?.name ?? null,
    title: d.title,
    status: d.status,
    startedAt: iso(d.startedAt),
    endsAt: iso(d.endsAt),
    limitSeconds: d.limitSeconds,
    canExtend: d.status === "active" && d.limitSeconds < PLANS.premiumCallSeconds && isPremium(host),
    participantCount: participantCount(id),
  };
}

function send(ws: WebSocket, msg: unknown) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(room: Room, msg: unknown, exceptPeerId?: string) {
  for (const p of room.peers.values()) if (p.peerId !== exceptPeerId) send(p.ws, msg);
}

/** Marks the call ended (once) and disconnects everyone in it. */
export async function endCall(callId: string, reason: NonNullable<CallDoc["endedReason"]>) {
  const ref = col.calls().doc(callId);
  const snap = await ref.get();
  if (snap.data()?.status === "active") await ref.update({ status: "ended", endedAt: Timestamp.now(), endedReason: reason });
  const room = rooms.get(callId);
  if (!room) return;
  rooms.delete(callId);
  if (room.timer) clearTimeout(room.timer);
  if (room.emptyTimer) clearTimeout(room.emptyTimer);
  for (const p of room.peers.values()) {
    send(p.ws, { type: "ended", reason });
    p.ws.close(1000, "call ended");
  }
}

/** An active call whose time is up is ended on read, in case the server restarted. */
export async function settleExpired(id: string, d: CallDoc): Promise<CallDoc> {
  if (d.status === "active" && d.endsAt.toMillis() <= Date.now()) {
    await endCall(id, "time_limit");
    return { ...d, status: "ended", endedReason: "time_limit" };
  }
  return d;
}

function schedule(room: Room, endsAt: Timestamp) {
  if (room.timer) clearTimeout(room.timer);
  const ms = Math.max(0, endsAt.toMillis() - Date.now());
  room.timer = setTimeout(() => void endCall(room.callId, "time_limit").catch((err) => logger.error({ err }, "ending call failed")), ms);
  room.timer.unref?.();
}

function scheduleEmpty(room: Room) {
  if (room.emptyTimer) clearTimeout(room.emptyTimer);
  room.emptyTimer = setTimeout(() => {
    if (room.peers.size === 0) void endCall(room.callId, "empty").catch((err) => logger.error({ err }, "ending call failed"));
  }, EMPTY_GRACE_MS);
  room.emptyTimer.unref?.();
}

/** Called by the REST route after a call starts, so an unused call still ends. */
export function openRoom(callId: string, endsAt: Timestamp) {
  const room: Room = { callId, peers: new Map(), timer: null, emptyTimer: null };
  rooms.set(callId, room);
  schedule(room, endsAt);
  scheduleEmpty(room);
}

/** Called after the host extends a call to the Premium length. */
export function extendRoom(callId: string, endsAt: Timestamp) {
  const room = rooms.get(callId);
  if (!room) return;
  schedule(room, endsAt);
  broadcast(room, { type: "extended", endsAt: endsAt.toDate().toISOString(), limitSeconds: PLANS.premiumCallSeconds });
}

async function authenticate(token: string, callId: string) {
  const decoded = await adminAuth.verifyIdToken(token).catch(() => {
    throw new ApiError(401, "unauthorized", "Your session has expired. Sign in again.");
  });
  const userDoc = (await col.users().doc(decoded.uid).get()).data();
  if (!userDoc || userDoc.disabled) throw new ApiError(403, "forbidden", "This account can't join calls.");
  const u = toAuthedUser(decoded.uid, userDoc);
  const snap = await col.calls().doc(callId).get();
  if (!snap.exists) throw new ApiError(404, "not_found", "This call doesn't exist.");
  const call = await settleExpired(callId, snap.data()!);
  if (call.status !== "active") throw new ApiError(410, "call_ended", "This call has ended.");
  await assertClassAccess(u, call.classId, "member");
  return { u, call };
}

function handleConnection(ws: WebSocket) {
  let joined: { room: Room; peer: Peer } | null = null;
  // The first message must be { type: "join", callId, token } within 10 seconds.
  const authTimeout = setTimeout(() => ws.close(4001, "join timeout"), 10_000);

  ws.on("message", async (raw) => {
    let msg: any;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (!joined) {
      if (msg?.type !== "join" || typeof msg.callId !== "string" || typeof msg.token !== "string") return;
      clearTimeout(authTimeout);
      try {
        const { u, call } = await authenticate(msg.token, msg.callId);
        let room = rooms.get(msg.callId);
        if (!room) {
          room = { callId: msg.callId, peers: new Map(), timer: null, emptyTimer: null };
          rooms.set(msg.callId, room);
          schedule(room, call.endsAt);
        }
        // The same person rejoining (new tab, reconnect) replaces their old connection.
        for (const p of room.peers.values()) {
          if (p.uid === u.uid) {
            room.peers.delete(p.peerId);
            broadcast(room, { type: "peer-left", peerId: p.peerId });
            p.ws.close(4002, "joined elsewhere");
          }
        }
        if (room.peers.size >= PLANS.callMaxParticipants) {
          send(ws, { type: "error", code: "call_full", message: `This call is full (${PLANS.callMaxParticipants} people).` });
          ws.close(4003, "call full");
          return;
        }
        const peer: Peer = { peerId: crypto.randomUUID(), uid: u.uid, name: u.name, ws };
        const others = [...room.peers.values()].map((p) => ({ peerId: p.peerId, uid: p.uid, name: p.name }));
        room.peers.set(peer.peerId, peer);
        if (room.emptyTimer) clearTimeout(room.emptyTimer);
        joined = { room, peer };
        send(ws, {
          type: "joined",
          peerId: peer.peerId,
          peers: others,
          endsAt: iso(call.endsAt),
          limitSeconds: call.limitSeconds,
          hostUid: call.hostUid,
          iceServers: iceServers(),
        });
        broadcast(room, { type: "peer-joined", peer: { peerId: peer.peerId, uid: u.uid, name: u.name } }, peer.peerId);
      } catch (err) {
        const e = err instanceof ApiError ? err : new ApiError(500, "server_error", "Couldn't join the call.");
        if (!(err instanceof ApiError)) logger.error({ err }, "call join failed");
        send(ws, { type: "error", code: e.code, message: e.message });
        ws.close(4000, e.code);
      }
      return;
    }
    // Relay offers, answers, and ICE candidates to one peer in the same room.
    if (msg?.type === "signal" && typeof msg.to === "string") {
      const target = joined.room.peers.get(msg.to);
      if (target) send(target.ws, { type: "signal", from: joined.peer.peerId, data: msg.data });
    } else if (msg?.type === "media") {
      broadcast(joined.room, { type: "media", peerId: joined.peer.peerId, audio: !!msg.audio, video: !!msg.video }, joined.peer.peerId);
    }
  });

  ws.on("close", () => {
    clearTimeout(authTimeout);
    if (!joined) return;
    const { room, peer } = joined;
    if (room.peers.get(peer.peerId) !== peer) return;
    room.peers.delete(peer.peerId);
    broadcast(room, { type: "peer-left", peerId: peer.peerId });
    if (room.peers.size === 0) scheduleEmpty(room);
  });
}

/** Attaches the signaling WebSocket at /api/calls/ws to the HTTP server. */
export function attachCallSignaling(server: Server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  server.on("upgrade", (req: IncomingMessage, socket, head) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname !== "/api/calls/ws") return;
    const origin = req.headers.origin;
    if (origin && origin !== env.APP_URL && env.NODE_ENV === "production") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => handleConnection(ws));
  });
  return wss;
}

/** Test helper: forget every room and its timers. */
export function resetRooms() {
  for (const room of rooms.values()) {
    if (room.timer) clearTimeout(room.timer);
    if (room.emptyTimer) clearTimeout(room.emptyTimer);
    for (const p of room.peers.values()) p.ws.terminate();
  }
  rooms.clear();
}
