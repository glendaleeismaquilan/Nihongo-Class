// Pomodoro timer for focused Japanese study. Student picks study / break lengths and
// how many rounds, then a classic study → break → study rotation runs with a circular
// progress ring. Haptics fire at each phase transition. Nothing is sent to the server.
import { useState, useEffect, useRef } from "react";
import { View, Text, Pressable, Vibration, StyleSheet, StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { h } from "../../lib/haptics";
import { colors, spacing, text } from "../../styles/theme";

const PRESETS = [
  { label: "25 / 5", study: 25 * 60, brk: 5 * 60, rounds: 4 },
  { label: "50 / 10", study: 50 * 60, brk: 10 * 60, rounds: 3 },
  { label: "15 / 3", study: 15 * 60, brk: 3 * 60, rounds: 6 },
];

function fmt(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function PomodoroScreen({ navigation }) {
  const [presetIndex, setPresetIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState("study"); // "study" | "break" | "done"
  const [round, setRound] = useState(1);
  const [remaining, setRemaining] = useState(PRESETS[0].study);
  const tickRef = useRef(null);
  const preset = PRESETS[presetIndex];
  const total = phase === "study" ? preset.study : preset.brk;

  useEffect(() => {
    if (!running) return;
    tickRef.current = setInterval(() => setRemaining((r) => r - 1), 1000);
    return () => clearInterval(tickRef.current);
  }, [running]);

  useEffect(() => {
    if (remaining > 0 || !running) return;
    // Phase done — advance to next.
    clearInterval(tickRef.current);
    Vibration.vibrate([0, 80, 60, 80, 60, 180]);
    if (phase === "study") {
      if (round >= preset.rounds) {
        setPhase("done");
        setRunning(false);
        h.success();
      } else {
        setPhase("break");
        setRemaining(preset.brk);
      }
    } else {
      setPhase("study");
      setRound((r) => r + 1);
      setRemaining(preset.study);
    }
  }, [remaining, running, phase, round, preset]);

  function choosePreset(idx) {
    if (running) return;
    setPresetIndex(idx);
    setPhase("study");
    setRound(1);
    setRemaining(PRESETS[idx].study);
  }

  function start() { h.tap(); setRunning(true); }
  function pause() { h.tap(); setRunning(false); }
  function reset() {
    setRunning(false);
    setPhase("study");
    setRound(1);
    setRemaining(preset.study);
  }
  function skip() {
    h.tap();
    setRemaining(0);
  }

  const pct = total > 0 ? (total - Math.max(0, remaining)) / total : 0;

  return (
    <SafeAreaView style={[styles.root, phase === "break" && styles.rootBreak, phase === "done" && styles.rootDone]} edges={["top"]}>
      <StatusBar barStyle={phase === "break" ? "dark-content" : "light-content"} />
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}><Text style={styles.back}>‹ Back</Text></Pressable>
        <Text style={styles.title}>Pomodoro</Text>
      </View>

      <View style={styles.center}>
        <Text style={styles.phaseLabel}>
          {phase === "study" ? "Study" : phase === "break" ? "Break" : "All done 🌸"}
        </Text>
        {phase !== "done" ? <Text style={styles.round}>Round {round} of {preset.rounds}</Text> : null}

        <View style={styles.timeCard}>
          <Text style={styles.time}>{phase === "done" ? "🌸" : fmt(remaining)}</Text>
          <View style={styles.pctBar}>
            <View style={[styles.pctFill, { width: `${pct * 100}%`, backgroundColor: phase === "study" ? colors.ai : phase === "break" ? "#f59e0b" : colors.matcha }]} />
          </View>
        </View>

        {phase !== "done" ? (
          <View style={styles.controls}>
            {!running ? (
              <Pressable style={styles.primaryBtn} onPress={start}><Text style={styles.primaryText}>Start</Text></Pressable>
            ) : (
              <Pressable style={styles.primaryBtn} onPress={pause}><Text style={styles.primaryText}>Pause</Text></Pressable>
            )}
            <Pressable style={styles.secondaryBtn} onPress={skip}><Text style={styles.secondaryText}>Skip</Text></Pressable>
            <Pressable style={styles.secondaryBtn} onPress={reset}><Text style={styles.secondaryText}>Reset</Text></Pressable>
          </View>
        ) : (
          <Pressable style={styles.primaryBtn} onPress={reset}><Text style={styles.primaryText}>Run another set</Text></Pressable>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerLabel}>Preset</Text>
        <View style={styles.presetRow}>
          {PRESETS.map((p, i) => (
            <Pressable key={i} onPress={() => choosePreset(i)} style={[styles.preset, i === presetIndex && styles.presetOn, running && { opacity: 0.6 }]} disabled={running}>
              <Text style={[styles.presetText, i === presetIndex && styles.presetTextOn]}>{p.label}</Text>
              <Text style={[styles.presetSub, i === presetIndex && styles.presetTextOn]}>{p.rounds} rounds</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b1220" },
  rootBreak: { backgroundColor: "#fef3c7" },
  rootDone: { backgroundColor: "#0b1220" },
  header: { padding: spacing.lg },
  back: { color: colors.paper, fontSize: 14, fontWeight: "600" },
  title: { fontSize: 22, fontWeight: "700", color: colors.paper, marginTop: spacing.xs },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg },
  phaseLabel: { color: colors.paper, fontSize: 40, fontWeight: "700" },
  round: { color: colors.paper, opacity: 0.8, marginTop: spacing.xs },
  timeCard: { alignItems: "center", marginTop: spacing.xl, width: "90%" },
  time: { color: colors.paper, fontSize: 88, fontWeight: "700", letterSpacing: 2 },
  pctBar: { marginTop: spacing.lg, height: 8, width: "100%", backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 4, overflow: "hidden" },
  pctFill: { height: 8 },
  controls: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xl },
  primaryBtn: { backgroundColor: colors.paper, paddingHorizontal: spacing.xl, paddingVertical: 14, borderRadius: 999 },
  primaryText: { color: "#0b1220", fontSize: 16, fontWeight: "700" },
  secondaryBtn: { backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: spacing.lg, paddingVertical: 14, borderRadius: 999 },
  secondaryText: { color: colors.paper, fontSize: 14, fontWeight: "600" },
  footer: { padding: spacing.lg, backgroundColor: "rgba(0,0,0,0.3)" },
  footerLabel: { color: colors.paper, opacity: 0.7, fontSize: 11, fontWeight: "700", textTransform: "uppercase", marginBottom: spacing.xs },
  presetRow: { flexDirection: "row", gap: spacing.sm },
  preset: { flex: 1, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 10, padding: spacing.sm, alignItems: "center" },
  presetOn: { backgroundColor: colors.paper },
  presetText: { color: colors.paper, fontWeight: "700", fontSize: 14 },
  presetTextOn: { color: "#0b1220" },
  presetSub: { color: colors.paper, opacity: 0.7, fontSize: 11, marginTop: 2 },
});
