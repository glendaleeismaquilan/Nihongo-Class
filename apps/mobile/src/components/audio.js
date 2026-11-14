// In-app audio: clips play inside the app instead of opening the browser.
// Mirrors apps/web/src/components/audio.tsx (ListenButton) and
// apps/web/src/roles/student/study/ListeningPlayer.tsx (FR-3.8.1: play, pause, replay,
// a 5-second rewind and a position bar, with the clip preloaded so playback starts quickly).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { Audio } from "expo-av";
import { colors, spacing, text } from "../styles/theme";

export const fmt = (s) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");

// Like the web app, clips play even when an iPhone's silent switch is on; on Android other
// apps' sound is lowered while a clip plays.
let audioMode = null;
function ensureAudioMode() {
  audioMode ??= Audio.setAudioModeAsync({ playsInSilentModeIOS: true, shouldDuckAndroid: true, staysActiveInBackground: false }).catch((err) => {
    audioMode = null;
    throw err;
  });
  return audioMode;
}

const IDLE = { ready: false, playing: false, position: 0, duration: 0, error: null };

/**
 * Loads a clip as soon as it is given (web: preload="auto") and tracks it.
 * Returns { ready, playing, position, duration (seconds), error } and the controls
 * play, pause, seek(seconds), replay and retry. A null src loads nothing.
 */
export function useClip(src) {
  const soundRef = useRef(null);
  const [state, setState] = useState(IDLE);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setState(IDLE);
    if (!src) return undefined;
    let cancelled = false;
    let sound = null;
    const onStatus = (s) => {
      if (cancelled) return;
      if (!s.isLoaded) {
        if (s.error) setState((p) => ({ ...p, ready: false, playing: false, error: String(s.error) }));
        return;
      }
      const secs = (ms) => (Number.isFinite(ms) ? ms / 1000 : 0);
      setState({ ready: true, playing: s.isPlaying, position: secs(s.positionMillis), duration: secs(s.durationMillis), error: null });
    };
    (async () => {
      try {
        await ensureAudioMode();
        if (cancelled) return;
        // The player exists before it loads: expo-av reports "loaded" during loadAsync, and the
        // controls (a press waiting for the clip, say) must find the player by then.
        sound = new Audio.Sound();
        sound.setOnPlaybackStatusUpdate(onStatus);
        soundRef.current = sound;
        await sound.loadAsync({ uri: src }, { shouldPlay: false, progressUpdateIntervalMillis: 250 });
        if (cancelled) {
          await sound.unloadAsync();
          return;
        }
        // A phone knows the clip's length once it has loaded; the browser build only reports it
        // after playback starts. Ask until it is known, so the player shows it before Play.
        for (let i = 0; i < 40 && !cancelled; i++) {
          const st = await sound.getStatusAsync();
          if (!st.isLoaded) break;
          if (Number.isFinite(st.durationMillis)) {
            onStatus(st);
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      } catch (err) {
        if (!cancelled) setState((p) => ({ ...p, ready: false, playing: false, error: err?.message ?? String(err) }));
      }
    })();
    return () => {
      cancelled = true;
      soundRef.current = null;
      sound?.unloadAsync().catch((err) => console.warn("Couldn't unload the clip", err));
    };
  }, [src, attempt]);

  const run = useCallback(async (fn) => {
    const sound = soundRef.current;
    if (!sound) return;
    try {
      await fn(sound);
    } catch (err) {
      setState((p) => ({ ...p, error: err?.message ?? String(err) }));
    }
  }, []);

  const controls = useMemo(
    () => ({
      // Like the web <audio>, Play at the end of the clip starts it again.
      play: () =>
        run(async (s) => {
          const st = await s.getStatusAsync();
          if (st.isLoaded && st.durationMillis && st.positionMillis >= st.durationMillis - 50) await s.setPositionAsync(0);
          await s.playAsync();
        }),
      pause: () => run((s) => s.pauseAsync()),
      seek: (seconds) => run((s) => s.setPositionAsync(Math.max(0, seconds) * 1000)),
      replay: () => run((s) => s.replayAsync()),
      retry: () => setAttempt((n) => n + 1),
    }),
    [run],
  );

  return { ...state, ...controls };
}

/**
 * FR-3.6.3: a listen control wherever audio exists (web: ListenButton). Plays the clip from
 * the start; pressing it while playing stops it. Pass `clip` (from useClip) to share one
 * already-loading clip, or `lazy` in long lists so a clip loads on its first press.
 */
export function ListenButton({ src, clip: shared, label, compact = false, lazy = false }) {
  const [armed, setArmed] = useState(!lazy);
  const [playWhenReady, setPlayWhenReady] = useState(false);
  const own = useClip(shared ? null : armed ? src : null);
  const clip = shared ?? own;
  const { ready, replay } = clip;

  useEffect(() => {
    if (playWhenReady && ready) {
      setPlayWhenReady(false);
      void replay();
    }
  }, [playWhenReady, ready, replay]);

  const loading = (shared || armed) && !clip.ready && !clip.error;
  function onPress() {
    if (!shared && !armed) {
      setArmed(true);
      setPlayWhenReady(true);
    } else if (clip.error) {
      setPlayWhenReady(true);
      clip.retry();
    } else if (clip.playing) void clip.pause();
    else void clip.replay();
  }

  return (
    <View style={styles.listenWrap}>
      <Pressable
        onPress={onPress}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: clip.playing, busy: loading, disabled: loading }}
        style={[styles.btn, compact && styles.btnCompact, styles.btnSecondary, loading && styles.btnOff]}
      >
        {loading ? (
          <ActivityIndicator color={colors.ai} />
        ) : (
          <Text style={[styles.btnText, compact && styles.btnTextCompact]}>{clip.error ? "↻ Try again" : clip.playing ? "⏸ Stop" : "🔊 Listen"}</Text>
        )}
      </Pressable>
      {clip.error ? <Text style={styles.error}>Couldn't play the clip: {clip.error}</Text> : null}
    </View>
  );
}

/** Position bar: drag or tap to move through the clip; screen readers step it 5 s at a time. */
function SeekBar({ position, duration, disabled, onDrag, onSeek }) {
  const width = useRef(0);
  const origin = useRef(0);
  const latest = useRef({ duration, disabled, onDrag, onSeek });
  latest.current = { duration, disabled, onDrag, onSeek };
  const at = (x) => Math.max(0, Math.min(latest.current.duration, (x / (width.current || 1)) * latest.current.duration));
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !latest.current.disabled && latest.current.duration > 0,
      onMoveShouldSetPanResponder: () => !latest.current.disabled && latest.current.duration > 0,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        origin.current = e.nativeEvent.pageX - e.nativeEvent.locationX;
        latest.current.onDrag(at(e.nativeEvent.locationX));
      },
      onPanResponderMove: (_e, g) => latest.current.onDrag(at(g.moveX - origin.current)),
      onPanResponderRelease: (e, g) => latest.current.onSeek(at((g.moveX || e.nativeEvent.pageX) - origin.current)),
      onPanResponderTerminate: () => latest.current.onDrag(null),
    }),
  ).current;
  const pct = duration > 0 ? Math.min(1, position / duration) * 100 : 0;
  const step = (d) => onSeek(Math.max(0, Math.min(duration, position + d)));

  return (
    <View
      style={styles.track}
      onLayout={(e) => {
        width.current = e.nativeEvent.layout.width;
      }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Position in the clip"
      accessibilityValue={{ min: 0, max: Math.round(duration), now: Math.round(position), text: `${fmt(position)} of ${fmt(duration)}` }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => step(e.nativeEvent.actionName === "increment" ? 5 : -5)}
      {...responder.panHandlers}
    >
      <View pointerEvents="none" style={styles.rail}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
      <View pointerEvents="none" style={[styles.thumb, { left: `${pct}%` }, disabled && styles.btnOff]} />
    </View>
  );
}

/** FR-3.8.1 (web: ListeningPlayer): play, pause, replay, a 5-second rewind and a position bar. */
export function ListeningPlayer({ src, title }) {
  const clip = useClip(src);
  const [drag, setDrag] = useState(null); // seconds, while the bar is being dragged
  const shown = drag ?? clip.position;
  const off = !clip.ready;

  return (
    <View style={styles.panel} accessibilityLabel="Listening clip">
      <Text style={styles.heading}>Listen to the clip</Text>
      <View style={styles.row}>
        <Pressable
          onPress={() => void (clip.playing ? clip.pause() : clip.play())}
          disabled={off}
          accessibilityRole="button"
          accessibilityLabel={clip.playing ? `Pause ${title}` : `Play ${title}`}
          accessibilityState={{ disabled: off }}
          style={[styles.btn, styles.btnPrimary, off && styles.btnOff]}
        >
          <Text style={[styles.btnText, styles.btnTextPrimary]}>{clip.playing ? "⏸ Pause" : "▶ Play"}</Text>
        </Pressable>
        <Pressable
          onPress={() => void clip.seek(Math.max(0, clip.position - 5))}
          disabled={off}
          accessibilityRole="button"
          accessibilityLabel="Rewind 5 seconds"
          accessibilityState={{ disabled: off }}
          style={[styles.btn, styles.btnSecondary, off && styles.btnOff]}
        >
          <Text style={styles.btnText}>⏪ 5 s</Text>
        </Pressable>
        <Pressable
          onPress={() => void clip.replay()}
          disabled={off}
          accessibilityRole="button"
          accessibilityState={{ disabled: off }}
          style={[styles.btn, styles.btnSecondary, off && styles.btnOff]}
        >
          <Text style={styles.btnText}>↺ Replay</Text>
        </Pressable>
      </View>
      <View style={styles.seekRow}>
        <SeekBar
          position={shown}
          duration={clip.duration}
          disabled={off}
          onDrag={setDrag}
          onSeek={(s) => {
            setDrag(null);
            void clip.seek(s);
          }}
        />
        <Text style={styles.time}>
          {fmt(shown)} / {fmt(clip.duration)}
        </Text>
      </View>
      {clip.error ? (
        <View style={styles.errorRow}>
          <Text style={[styles.error, { flex: 1 }]}>Couldn't load the clip: {clip.error}</Text>
          <Pressable onPress={clip.retry} accessibilityRole="button" style={[styles.btn, styles.btnCompact, styles.btnSecondary]}>
            <Text style={[styles.btnText, styles.btnTextCompact]}>↻ Try again</Text>
          </Pressable>
        </View>
      ) : off ? (
        <Text style={[text.small, { marginTop: spacing.xs }]}>Loading the clip…</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  listenWrap: { alignSelf: "flex-start" },
  btn: { minHeight: 40, paddingHorizontal: spacing.md, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  btnCompact: { minHeight: 36 },
  btnPrimary: { backgroundColor: colors.ai, borderColor: colors.ai },
  btnSecondary: { backgroundColor: colors.paper, borderColor: colors.line },
  btnOff: { opacity: 0.55 },
  btnText: { fontSize: 14, fontWeight: "600", color: colors.ink },
  btnTextCompact: { fontSize: 13 },
  btnTextPrimary: { color: colors.paper },
  panel: { backgroundColor: colors.paper, borderRadius: 10, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, marginBottom: spacing.md },
  heading: { ...text.body, fontWeight: "600", marginBottom: spacing.md },
  row: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  seekRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.sm },
  track: { flex: 1, height: 44, justifyContent: "center" },
  rail: { height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: "hidden" },
  fill: { height: 6, backgroundColor: colors.ai },
  thumb: { position: "absolute", top: 13, width: 18, height: 18, borderRadius: 9, marginLeft: -9, backgroundColor: colors.ai },
  time: { ...text.small, minWidth: 84, textAlign: "right", fontVariant: ["tabular-nums"] },
  errorRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  error: { color: colors.shu, fontSize: 14, marginTop: spacing.xs },
});
