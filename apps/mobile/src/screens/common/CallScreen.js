// Live in-app video call. Full mesh WebRTC — every peer connects to every other peer
// (API caps at 8 total). Signaling runs over the API's WebSocket at /api/calls/ws.
// Protocol mirrors apps/web/src/features/calls/CallPage.tsx.
import { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, Pressable, ActivityIndicator, Alert, StyleSheet, PermissionsAndroid, Platform, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
  RTCView,
} from "react-native-webrtc";
import { useQuery } from "@tanstack/react-query";
import { auth } from "../../config/firebase";
import { api, API_URL, errorMessage } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { PLANS } from "../../shared/constants";
import { colors, spacing, text } from "../../styles/theme";

// http → ws, https → wss: same host the rest of the app's API calls use.
const wsUrl = API_URL.replace(/^http/i, "ws") + "/api/calls/ws";

async function requestMediaPermissions() {
  if (Platform.OS !== "android") return true;
  const results = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.CAMERA,
    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
  ]);
  return Object.values(results).every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
}

function fmt(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function CallScreen({ route, navigation }) {
  const { callId } = route.params;
  const [status, setStatus] = useState("connecting"); // connecting | live | ended
  const [endedMsg, setEndedMsg] = useState("");
  const [peers, setPeers] = useState({}); // peerId -> { name, stream, mediaAudio, mediaVideo }
  const [myPeerId, setMyPeerId] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [endsAt, setEndsAt] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [endedReason, setEndedReason] = useState(null);
  // Premium comes from the signed-in profile (GET /me), the same source as everywhere else.
  const { me } = useAuth();

  const wsRef = useRef(null);
  const localStreamRef = useRef(null);
  const connections = useRef(new Map()); // peerId -> RTCPeerConnection
  const iceServersRef = useRef([]);
  const myIdRef = useRef(null);

  const call = useQuery({ queryKey: ["call", callId], queryFn: () => api(`/calls/${callId}`) });

  // Countdown ticker
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secondsLeft = endsAt ? Math.max(0, (new Date(endsAt).getTime() - now) / 1000) : null;

  const cleanup = useCallback(() => {
    for (const pc of connections.current.values()) {
      try { pc.close(); } catch {}
    }
    connections.current.clear();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);
    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }
  }, []);

  // Build a new RTCPeerConnection for a remote peer, hook it into the mesh.
  const buildPeer = useCallback((peerId, peerName, isInitiator) => {
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current));
    }

    pc.onicecandidate = (e) => {
      if (e.candidate && wsRef.current?.readyState === 1) {
        wsRef.current.send(JSON.stringify({ type: "signal", to: peerId, data: { kind: "ice", candidate: e.candidate } }));
      }
    };

    pc.ontrack = (e) => {
      const stream = e.streams?.[0];
      if (stream) setPeers((prev) => ({ ...prev, [peerId]: { ...(prev[peerId] ?? { name: peerName, mediaAudio: true, mediaVideo: true }), stream } }));
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") {
        try { pc.close(); } catch {}
        connections.current.delete(peerId);
      }
    };

    connections.current.set(peerId, pc);
    setPeers((prev) => ({ ...prev, [peerId]: prev[peerId] ?? { name: peerName, stream: null, mediaAudio: true, mediaVideo: true } }));

    if (isInitiator) {
      (async () => {
        try {
          const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
          await pc.setLocalDescription(offer);
          if (wsRef.current?.readyState === 1) {
            wsRef.current.send(JSON.stringify({ type: "signal", to: peerId, data: { kind: "offer", sdp: pc.localDescription } }));
          }
        } catch (err) {
          console.warn("offer failed", err);
        }
      })();
    }
    return pc;
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const ok = await requestMediaPermissions();
      if (!ok) {
        setEndedMsg("Camera and microphone are needed for calls. Enable them in Settings and try again.");
        setStatus("ended");
        return;
      }

      let stream;
      try {
        stream = await mediaDevices.getUserMedia({
          audio: true,
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } },
        });
      } catch (err) {
        setEndedMsg("Couldn't open the camera.");
        setStatus("ended");
        return;
      }
      if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
      localStreamRef.current = stream;
      setLocalStream(stream);

      const token = await auth.currentUser?.getIdToken().catch(() => null);
      if (!token) {
        setEndedMsg("You need to sign in again before joining.");
        setStatus("ended");
        return;
      }

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "join", callId, token }));
      };

      ws.onmessage = async (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }

        if (msg.type === "joined") {
          myIdRef.current = msg.peerId;
          setMyPeerId(msg.peerId);
          iceServersRef.current = msg.iceServers ?? [];
          setEndsAt(msg.endsAt);
          setIsHost(msg.hostUid === auth.currentUser?.uid);
          setStatus("live");
          // Outbound offers to everyone already in the room.
          for (const p of msg.peers ?? []) buildPeer(p.peerId, p.name, true);
        } else if (msg.type === "peer-joined") {
          // Wait for their offer — they're the initiator.
          buildPeer(msg.peer.peerId, msg.peer.name, false);
        } else if (msg.type === "peer-left") {
          const pc = connections.current.get(msg.peerId);
          if (pc) { try { pc.close(); } catch {} connections.current.delete(msg.peerId); }
          setPeers((prev) => { const next = { ...prev }; delete next[msg.peerId]; return next; });
        } else if (msg.type === "signal") {
          const pc = connections.current.get(msg.from);
          if (!pc) return;
          const { kind, sdp, candidate } = msg.data ?? {};
          try {
            if (kind === "offer") {
              await pc.setRemoteDescription(new RTCSessionDescription(sdp));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              ws.send(JSON.stringify({ type: "signal", to: msg.from, data: { kind: "answer", sdp: pc.localDescription } }));
            } else if (kind === "answer") {
              await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            } else if (kind === "ice") {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            }
          } catch (err) {
            console.warn("signal handling failed", err);
          }
        } else if (msg.type === "media") {
          setPeers((prev) => ({ ...prev, [msg.peerId]: { ...(prev[msg.peerId] ?? { name: "" }), mediaAudio: msg.audio, mediaVideo: msg.video } }));
        } else if (msg.type === "extended") {
          setEndsAt(msg.endsAt);
        } else if (msg.type === "ended") {
          setEndedReason(msg.reason ?? null);
          setStatus("ended");
        } else if (msg.type === "error") {
          setEndedMsg(msg.message ?? "The call couldn't be joined.");
          setStatus("ended");
        }
      };

      ws.onclose = () => {
        setStatus((s) => (s === "ended" ? s : "ended"));
        setEndedMsg((m) => m || "Lost connection to the call.");
      };

      ws.onerror = () => {
        // onclose will fire right after and handle UI.
      };
    })();

    return () => { cancelled = true; cleanup(); };
  // Only re-run when callId changes. buildPeer/cleanup capture refs that are stable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId]);

  function toggleMic() {
    const next = !micOn;
    localStreamRef.current?.getAudioTracks().forEach((t) => (t.enabled = next));
    setMicOn(next);
    if (wsRef.current?.readyState === 1) wsRef.current.send(JSON.stringify({ type: "media", audio: next, video: camOn }));
  }

  function toggleCam() {
    const next = !camOn;
    localStreamRef.current?.getVideoTracks().forEach((t) => (t.enabled = next));
    setCamOn(next);
    if (wsRef.current?.readyState === 1) wsRef.current.send(JSON.stringify({ type: "media", audio: micOn, video: next }));
  }

  async function leave() { cleanup(); navigation.goBack(); }
  async function endForEveryone() {
    try {
      await api(`/calls/${callId}/end`, { body: {} });
    } catch (e) {
      // The call is still running — say so instead of pretending it ended.
      Alert.alert("Couldn't end the call", errorMessage(e));
      return;
    }
    cleanup();
    navigation.goBack();
  }

  async function extend() {
    try {
      await api(`/calls/${callId}/extend`, { body: {} });
    } catch (e) {
      Alert.alert("Couldn't extend", errorMessage(e));
    }
  }

  const goPremium = () => navigation.navigate("Premium", { screen: "PremiumHome" });

  const callData = call.data;
  const title = callData?.title ?? "Call";
  const participantList = Object.entries(peers);
  // Same rules as apps/web/src/features/calls/CallPage.tsx.
  const short = (callData?.limitSeconds ?? 0) < PLANS.premiumCallSeconds;
  const premium = !!me?.plan?.premium;
  const isTeacher = me?.role === "teacher";
  const staff = me?.role === "teacher" || me?.role === "school_admin";
  const lastMinute = secondsLeft != null && secondsLeft <= 60;
  const mayExtend = isHost && short && (callData?.canExtend || premium);
  const endedText =
    endedMsg ||
    (endedReason === "time_limit"
      ? short
        ? "Free calls last 5 minutes. With Premium, calls last 15 minutes."
        : "Calls last up to 15 minutes."
      : endedReason === "host"
        ? "The teacher ended the call."
        : "Everyone left the call.");

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={text.small}>
            {status === "live" ? `${1 + participantList.length} in call` : status === "connecting" ? "Connecting…" : "Ended"}
            {secondsLeft != null && status === "live" ? ` · ${fmt(secondsLeft)} left` : ""}
          </Text>
        </View>
      </View>

      {status === "connecting" ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.ai} size="large" />
          <Text style={[text.body, { marginTop: spacing.md }]}>Getting camera ready…</Text>
        </View>
      ) : status === "ended" ? (
        <View style={styles.center}>
          <Text style={styles.endedTitle}>{endedMsg && !endedReason ? "Couldn't join the call" : "The call has ended"}</Text>
          <Text style={styles.endedBody}>{endedText}</Text>
          <Pressable style={styles.primary} onPress={() => navigation.goBack()} accessibilityRole="button"><Text style={styles.primaryText}>Back to class</Text></Pressable>
          {isTeacher && !premium && short ? (
            <Pressable style={styles.primary} onPress={goPremium} accessibilityRole="button"><Text style={styles.primaryText}>★ See Premium</Text></Pressable>
          ) : null}
        </View>
      ) : (
        <>
          {lastMinute && isHost && short ? (
            <View style={styles.lastMinute} accessibilityRole="alert">
              <Text style={[text.body, { flex: 1 }]}>Less than a minute left.{mayExtend ? " Extend to 15 minutes?" : " Premium calls last 15 minutes."}</Text>
              {mayExtend ? (
                <Pressable style={styles.smallBtn} onPress={extend} accessibilityRole="button"><Text style={styles.smallBtnText}>Extend to 15 minutes</Text></Pressable>
              ) : isTeacher ? (
                <Pressable style={styles.smallBtn} onPress={goPremium} accessibilityRole="button"><Text style={styles.smallBtnText}>★ Go Premium</Text></Pressable>
              ) : null}
            </View>
          ) : null}
          <ScrollView contentContainerStyle={styles.grid}>
            {localStream ? (
              <Tile name="You" stream={localStream} mirror muted={!micOn} videoOff={!camOn} />
            ) : null}
            {participantList.map(([pid, p]) => (
              <Tile key={pid} name={p.name} stream={p.stream} muted={!p.mediaAudio} videoOff={!p.mediaVideo} />
            ))}
          </ScrollView>
          <View style={styles.controls}>
            <ControlBtn label={micOn ? "Mute" : "Unmute"} icon={micOn ? "🎤" : "🔇"} on={micOn} onPress={toggleMic} />
            <ControlBtn label={camOn ? "Cam off" : "Cam on"} icon={camOn ? "📹" : "🚫"} on={camOn} onPress={toggleCam} />
            {mayExtend && !lastMinute ? <ControlBtn label="Extend to 15 min" icon="⏱️" on onPress={extend} /> : null}
            <ControlBtn label="Leave" icon="📴" on onPress={leave} />
            {staff ? <ControlBtn label="End for everyone" icon="🛑" on danger onPress={endForEveryone} /> : null}
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

function Tile({ name, stream, muted, videoOff, mirror }) {
  return (
    <View style={styles.tile}>
      {stream && !videoOff ? (
        <RTCView streamURL={stream.toURL()} style={styles.video} objectFit="cover" mirror={mirror} />
      ) : (
        <View style={[styles.video, styles.noVideo]}>
          <Text style={styles.noVideoText}>{videoOff ? "📷 off" : "connecting…"}</Text>
        </View>
      )}
      <View style={styles.tileName}>
        <Text style={styles.tileNameText} numberOfLines={1}>{name}{muted ? " 🔇" : ""}</Text>
      </View>
    </View>
  );
}

function ControlBtn({ label, icon, on, danger, onPress }) {
  return (
    <Pressable style={[styles.ctrl, !on && styles.ctrlOff, danger && styles.ctrlDanger]} onPress={onPress}>
      <Text style={styles.ctrlIcon}>{icon}</Text>
      <Text style={styles.ctrlLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b1220" },
  header: { padding: spacing.md, backgroundColor: "#0b1220", borderBottomWidth: 1, borderBottomColor: "#1f2937", flexDirection: "row", alignItems: "center" },
  title: { color: "#fff", fontSize: 16, fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  endedTitle: { color: "#fff", fontSize: 28, fontWeight: "700", textAlign: "center" },
  endedBody: { color: "#e5e7eb", fontSize: 16, textAlign: "center", marginTop: spacing.md },
  primary: { marginTop: spacing.lg, backgroundColor: colors.ai, paddingVertical: 12, paddingHorizontal: spacing.xl, borderRadius: 10, minHeight: 44, justifyContent: "center" },
  lastMinute: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap", backgroundColor: colors.paper, margin: spacing.sm, borderRadius: 10, padding: spacing.md },
  smallBtn: { backgroundColor: colors.ai, paddingVertical: 8, paddingHorizontal: spacing.md, borderRadius: 8, minHeight: 40, justifyContent: "center" },
  smallBtnText: { ...text.button, fontSize: 14 },
  primaryText: { ...text.button },
  grid: { padding: spacing.sm, flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, justifyContent: "center" },
  tile: { width: "48%", aspectRatio: 3 / 4, backgroundColor: "#111827", borderRadius: 10, overflow: "hidden", position: "relative" },
  video: { flex: 1, backgroundColor: "#000" },
  noVideo: { alignItems: "center", justifyContent: "center" },
  noVideoText: { color: "#6b7280", fontSize: 14 },
  tileName: { position: "absolute", left: 6, bottom: 6, backgroundColor: "rgba(0,0,0,0.6)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tileNameText: { color: "#fff", fontSize: 12, fontWeight: "500" },
  controls: { flexDirection: "row", justifyContent: "space-around", alignItems: "center", padding: spacing.md, backgroundColor: "#0b1220", borderTopWidth: 1, borderTopColor: "#1f2937" },
  ctrl: { alignItems: "center", paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: 999, backgroundColor: "#1f2937", minWidth: 68 },
  ctrlOff: { backgroundColor: "#374151" },
  ctrlDanger: { backgroundColor: colors.shu },
  ctrlIcon: { fontSize: 22 },
  ctrlLabel: { color: "#fff", fontSize: 11, marginTop: 2 },
});
