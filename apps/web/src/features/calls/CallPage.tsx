import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PLANS, type CallDto } from "@nihongo/shared";
import { API_URL, api, errorMessage } from "../../lib/api";
import { auth } from "../../lib/firebase";
import { useMe } from "../../lib/auth";
import { useNow } from "../../lib/useNow";
import { Alert, Button, ButtonLink, ErrorState, Icon, Loading, useToast } from "../../components/ui";
import { formatCountdown } from "./ActiveCallBanner";

interface Remote {
  peerId: string;
  uid: string;
  name: string;
  stream: MediaStream | null;
  audio: boolean;
  video: boolean;
}

type Action =
  | { type: "add"; peer: { peerId: string; uid: string; name: string } }
  | { type: "stream"; peerId: string; stream: MediaStream }
  | { type: "media"; peerId: string; audio: boolean; video: boolean }
  | { type: "remove"; peerId: string }
  | { type: "clear" };

function peersReducer(state: Remote[], a: Action): Remote[] {
  switch (a.type) {
    case "add":
      return state.some((p) => p.peerId === a.peer.peerId) ? state : [...state, { ...a.peer, stream: null, audio: true, video: true }];
    case "stream":
      return state.map((p) => (p.peerId === a.peerId ? { ...p, stream: a.stream } : p));
    case "media":
      return state.map((p) => (p.peerId === a.peerId ? { ...p, audio: a.audio, video: a.video } : p));
    case "remove":
      return state.filter((p) => p.peerId !== a.peerId);
    case "clear":
      return [];
  }
}

const wsUrl = () => `${API_URL.replace(/^http/, "ws")}/api/calls/ws`;

function classPath(role: string, classId: string) {
  if (role === "student") return `/s/classes/${classId}`;
  return `${role === "teacher" ? "/t" : "/a"}/classes/${classId}`;
}

/**
 * Focus-mode group video call (WebRTC mesh, up to 8 people). The server relays
 * signaling and ends the call at its time limit: 5 minutes, or 15 when the
 * host has Premium.
 */
export function CallPage() {
  const { callId = "" } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const now = useNow(1000);
  const callQ = useQuery({ queryKey: ["call", callId], queryFn: () => api<CallDto>(`/calls/${callId}`), refetchInterval: 20_000 });

  const [peers, dispatch] = useReducer(peersReducer, []);
  const [phase, setPhase] = useState<"connecting" | "in" | "ended" | "error">("connecting");
  const [endedReason, setEndedReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [endsAt, setEndsAt] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [audioOn, setAudioOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const localRef = useRef<MediaStream | null>(null);
  const localVideo = useRef<HTMLVideoElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pcs = useRef(new Map<string, RTCPeerConnection>());
  const pendingIce = useRef(new Map<string, RTCIceCandidateInit[]>());
  const iceServers = useRef<RTCIceServer[]>([]);

  const send = (m: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(m));
  };

  const closePeer = useCallback((peerId: string) => {
    pcs.current.get(peerId)?.close();
    pcs.current.delete(peerId);
    pendingIce.current.delete(peerId);
    dispatch({ type: "remove", peerId });
  }, []);

  const createPc = useCallback((peerId: string) => {
    const pc = new RTCPeerConnection({ iceServers: iceServers.current });
    const local = localRef.current;
    if (local && local.getTracks().length) {
      for (const t of local.getTracks()) pc.addTrack(t, local);
    } else {
      pc.addTransceiver("audio", { direction: "recvonly" });
      pc.addTransceiver("video", { direction: "recvonly" });
    }
    pc.onicecandidate = (e) => {
      if (e.candidate) send({ type: "signal", to: peerId, data: { candidate: e.candidate.toJSON() } });
    };
    pc.ontrack = (e) => dispatch({ type: "stream", peerId, stream: e.streams[0] ?? new MediaStream([e.track]) });
    pcs.current.set(peerId, pc);
    return pc;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const peerConnections = pcs.current;
    async function run() {
      try {
        localRef.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: { width: { ideal: 640 }, height: { ideal: 360 } } });
      } catch {
        try {
          localRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
          setVideoOn(false);
          setMediaError("Your camera isn't available, so you've joined with audio only.");
        } catch {
          localRef.current = null;
          setAudioOn(false);
          setVideoOn(false);
          setMediaError("The browser didn't allow your camera or microphone. You can still see and hear others. Allow access in the address bar, then rejoin.");
        }
      }
      if (cancelled) return localRef.current?.getTracks().forEach((t) => t.stop());
      if (localVideo.current && localRef.current) localVideo.current.srcObject = localRef.current;
      const token = await auth.currentUser?.getIdToken();
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;
      ws.onopen = () => ws.send(JSON.stringify({ type: "join", callId, token }));
      ws.onmessage = async (ev) => {
        const msg = JSON.parse(String(ev.data));
        if (msg.type === "joined") {
          iceServers.current = msg.iceServers;
          setEndsAt(msg.endsAt);
          setPhase("in");
          for (const p of msg.peers) {
            dispatch({ type: "add", peer: p });
            const pc = createPc(p.peerId);
            await pc.setLocalDescription(await pc.createOffer());
            send({ type: "signal", to: p.peerId, data: { sdp: pc.localDescription } });
          }
        } else if (msg.type === "peer-joined") {
          dispatch({ type: "add", peer: msg.peer });
        } else if (msg.type === "signal") {
          const from: string = msg.from;
          const pc = pcs.current.get(from) ?? createPc(from);
          const data = msg.data ?? {};
          if (data.sdp) {
            await pc.setRemoteDescription(data.sdp);
            for (const c of pendingIce.current.get(from) ?? []) await pc.addIceCandidate(c).catch(() => undefined);
            pendingIce.current.delete(from);
            if (data.sdp.type === "offer") {
              await pc.setLocalDescription(await pc.createAnswer());
              send({ type: "signal", to: from, data: { sdp: pc.localDescription } });
            }
          } else if (data.candidate) {
            if (pc.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => undefined);
            else pendingIce.current.set(from, [...(pendingIce.current.get(from) ?? []), data.candidate]);
          }
        } else if (msg.type === "media") {
          dispatch({ type: "media", peerId: msg.peerId, audio: msg.audio, video: msg.video });
        } else if (msg.type === "peer-left") {
          closePeer(msg.peerId);
        } else if (msg.type === "extended") {
          setEndsAt(msg.endsAt);
          void qc.invalidateQueries({ queryKey: ["call", callId] });
        } else if (msg.type === "ended") {
          setEndedReason(msg.reason);
          setPhase("ended");
        } else if (msg.type === "error") {
          setError(msg.message);
          setPhase(msg.code === "call_ended" ? "ended" : "error");
        }
      };
      ws.onclose = (ev) => {
        if (cancelled) return;
        if (ev.code === 4002) {
          setError("You joined this call from another tab or device.");
          setPhase("error");
        } else setPhase((p) => (p === "in" || p === "connecting" ? (p === "connecting" ? "error" : "ended") : p));
      };
    }
    void run();
    return () => {
      cancelled = true;
      wsRef.current?.close();
      for (const pc of peerConnections.values()) pc.close();
      peerConnections.clear();
      localRef.current?.getTracks().forEach((t) => t.stop());
      dispatch({ type: "clear" });
    };
  }, [callId, createPc, closePeer, qc]);

  // Stop the camera as soon as the call ends.
  useEffect(() => {
    if (phase !== "ended" && phase !== "error") return;
    wsRef.current?.close();
    for (const pc of pcs.current.values()) pc.close();
    pcs.current.clear();
    localRef.current?.getTracks().forEach((t) => t.stop());
  }, [phase]);

  function toggle(kind: "audio" | "video") {
    const next = kind === "audio" ? !audioOn : !videoOn;
    localRef.current?.getTracks().forEach((t) => {
      if (t.kind === kind) t.enabled = next;
    });
    if (kind === "audio") setAudioOn(next);
    else setVideoOn(next);
    send({ type: "media", audio: kind === "audio" ? next : audioOn, video: kind === "video" ? next : videoOn });
  }

  const end = useMutation({
    mutationFn: () => api(`/calls/${callId}/end`, { body: {} }),
    onError: (err) => toast(errorMessage(err), "danger"),
  });
  const extend = useMutation({
    mutationFn: () => api<CallDto>(`/calls/${callId}/extend`, { body: {} }),
    onSuccess: (c) => {
      setEndsAt(c.endsAt);
      toast("Extended to 15 minutes");
      void qc.invalidateQueries({ queryKey: ["call", callId] });
    },
    onError: (err) => toast(errorMessage(err), "danger"),
  });

  if (callQ.isPending) return <Loading />;
  if (callQ.isError) return <ErrorState error={callQ.error} />;
  const call = callQ.data;
  const back = classPath(me.role, call.classId);
  const isHost = call.hostUid === me.uid;
  const staff = me.role !== "student";
  const leftMs = endsAt ? new Date(endsAt).getTime() - now : null;
  const lastMinute = leftMs !== null && leftMs <= 60_000;
  const short = call.limitSeconds < PLANS.premiumCallSeconds;

  if (phase === "ended" || phase === "error" || call.status === "ended") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-kasumi px-4">
        <div className="max-w-md rounded-paper border border-line bg-paper px-6 py-8 text-center">
          <Icon name="phone-off" size={36} className="mx-auto text-ink-2" />
          <h1 className="mt-3 text-2xl">{phase === "error" ? "Couldn't join the call" : "The call has ended"}</h1>
          <p className="mt-2 text-ink-2">
            {error ??
              (endedReason === "time_limit"
                ? short
                  ? "Free calls last 5 minutes. With Premium, calls last 15 minutes."
                  : "Calls last up to 15 minutes."
                : endedReason === "host"
                  ? "The teacher ended the call."
                  : "Everyone left the call.")}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <ButtonLink to={back}>Back to class</ButtonLink>
            {me.role === "teacher" && !me.plan?.premium && short ? (
              <ButtonLink variant="secondary" to="/t/premium" icon="star">
                See Premium
              </ButtonLink>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const tiles = peers.length + 1;
  const grid = tiles <= 1 ? "grid-cols-1" : tiles <= 4 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 lg:grid-cols-3";

  return (
    <div className="flex min-h-dvh flex-col bg-ink text-white">
      <header className="flex items-center gap-3 px-4 py-2">
        <Link to={back} className="inline-flex min-h-11 items-center gap-1 rounded-control px-2 font-medium text-white no-underline hover:bg-white/10">
          <Icon name="chevron-left" size={18} />
          Class
        </Link>
        <p className="min-w-0 flex-1 truncate text-center text-sm">{call.title}</p>
        <p className={`min-w-16 text-right font-mono text-sm ${lastMinute ? "font-semibold text-[#ffb4a8]" : ""}`} aria-live={lastMinute ? "polite" : "off"}>
          {leftMs === null ? "" : formatCountdown(leftMs)}
        </p>
      </header>
      {mediaError ? (
        <div className="px-4 pb-2">
          <Alert>{mediaError}</Alert>
        </div>
      ) : null}
      {lastMinute && isHost && short ? (
        <div className="px-4 pb-2" role="status">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-paper bg-paper px-4 py-3 text-ink">
            <span>Less than a minute left.{me.plan?.premium || call.canExtend ? " Extend to 15 minutes?" : " Premium calls last 15 minutes."}</span>
            {call.canExtend || me.plan?.premium ? (
              <Button size="sm" onClick={() => extend.mutate()} loading={extend.isPending}>
                Extend to 15 minutes
              </Button>
            ) : me.role === "teacher" ? (
              <ButtonLink size="sm" to="/t/premium" target="_blank" icon="star">
                Go Premium
              </ButtonLink>
            ) : null}
          </div>
        </div>
      ) : null}
      <main className={`grid flex-1 content-center gap-2 px-2 pb-2 ${grid}`}>
        <Tile name={`${me.name} (you)`} muted={!audioOn} cameraOff={!videoOn}>
          <video ref={localVideo} autoPlay playsInline muted className="size-full -scale-x-100 object-cover" />
        </Tile>
        {peers.map((p) => (
          <Tile key={p.peerId} name={p.name} muted={!p.audio} cameraOff={!p.video || !p.stream}>
            <RemoteVideo stream={p.stream} />
          </Tile>
        ))}
      </main>
      {phase === "connecting" ? <p className="pb-2 text-center text-sm">Connecting…</p> : peers.length === 0 ? <p className="pb-2 text-center text-sm">Waiting for others to join…</p> : null}
      <footer className="flex flex-wrap items-center justify-center gap-2 border-t border-white/15 px-4 py-3">
        <ControlButton on={audioOn} icon={audioOn ? "mic" : "mic-off"} label={audioOn ? "Mute" : "Unmute"} onClick={() => toggle("audio")} disabled={!localRef.current?.getAudioTracks().length} />
        <ControlButton on={videoOn} icon={videoOn ? "video" : "video-off"} label={videoOn ? "Stop camera" : "Start camera"} onClick={() => toggle("video")} disabled={!localRef.current?.getVideoTracks().length} />
        {isHost && short && (call.canExtend || me.plan?.premium) && !lastMinute ? (
          <Button variant="secondary" onClick={() => extend.mutate()} loading={extend.isPending}>
            Extend to 15 min
          </Button>
        ) : null}
        <Button variant="secondary" icon="phone-off" onClick={() => navigate(back)}>
          Leave
        </Button>
        {staff ? (
          <Button variant="danger" onClick={() => end.mutate()} loading={end.isPending}>
            End for everyone
          </Button>
        ) : null}
      </footer>
    </div>
  );
}

function Tile({ name, muted, cameraOff, children }: { name: string; muted: boolean; cameraOff: boolean; children: ReactNode }) {
  return (
    <div className="relative aspect-video overflow-hidden rounded-paper bg-white/5">
      <div className={cameraOff ? "invisible size-full" : "size-full"}>{children}</div>
      {cameraOff ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-white/15 text-2xl font-semibold" aria-hidden>
            {name.slice(0, 1).toUpperCase()}
          </span>
        </div>
      ) : null}
      <p className="absolute bottom-2 left-2 flex items-center gap-1 rounded-control bg-ink/70 px-2 py-0.5 text-sm">
        {muted ? <Icon name="mic-off" size={14} aria-label="Muted" /> : null}
        {name}
      </p>
    </div>
  );
}

function RemoteVideo({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline className="size-full object-cover" />;
}

function ControlButton({ on, icon, label, onClick, disabled }: { on: boolean; icon: "mic" | "mic-off" | "video" | "video-off"; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={!on}
      aria-label={label}
      title={label}
      className={`flex size-12 items-center justify-center rounded-full disabled:opacity-40 ${on ? "bg-white/15 hover:bg-white/25" : "bg-shu hover:bg-shu-hover"}`}
    >
      <Icon name={icon} />
    </button>
  );
}
