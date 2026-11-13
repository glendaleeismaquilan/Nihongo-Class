// Mobile extra (no web equivalent): retry the questions missed in the attempt
// just submitted. Nothing is submitted; feedback shows after each answer.
// Reached from Results → "Practice N wrong questions". Route params:
// { title, items: [{ text, choices, correctIndex }] } taken from result.review.
import { useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { h } from "../../../lib/haptics";
import { colors, spacing, text } from "../../../styles/theme";

export function PracticeWrongScreen({ route, navigation }) {
  const { items = [], title } = route.params;

  const [i, setI] = useState(0);
  const [picked, setPicked] = useState(null);
  const [right, setRight] = useState(0);

  if (items.length === 0) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <Header title={title} onBack={() => navigation.goBack()} />
        <View style={styles.center}><Text style={text.body}>No wrong questions to practice.</Text></View>
      </SafeAreaView>
    );
  }

  if (i >= items.length) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <Header title={title} onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          <Text style={styles.done}>はなまる 🌸</Text>
          <Text style={[text.body, { textAlign: "center", marginTop: spacing.md }]}>Practice complete — you got {right} / {items.length} right this time.</Text>
          <Pressable style={styles.primary} onPress={() => { setI(0); setPicked(null); setRight(0); }}><Text style={styles.primaryText}>Try these again</Text></Pressable>
          <Pressable style={styles.secondary} onPress={() => navigation.goBack()}><Text style={styles.secondaryText}>Back to results</Text></Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const q = items[i];
  const done = picked !== null;

  function choose(ci) {
    if (done) return;
    setPicked(ci);
    const correct = ci === q.correctIndex;
    if (correct) { setRight((r) => r + 1); h.success(); } else { h.tap(); }
  }

  function next() {
    setPicked(null);
    setI((x) => x + 1);
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Header title={title} onBack={() => navigation.goBack()} />
      <View style={styles.progressRow}>
        <View style={styles.progressBar}><View style={[styles.progressFill, { width: `${Math.round(((i + 1) / items.length) * 100)}%` }]} /></View>
        <Text style={styles.progressText}>{i + 1} / {items.length}</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: 120 }}>
        <View style={styles.card}>
          <Text style={styles.qNum}>Practice</Text>
          <Text style={styles.qText}>{q.text}</Text>
          {(q.choices ?? []).map((opt, ci) => {
            const letter = String.fromCharCode(65 + ci);
            let state = "idle";
            if (done) {
              if (ci === q.correctIndex) state = "correct";
              else if (ci === picked) state = "wrong";
            } else if (picked === ci) state = "picked";
            return (
              <Pressable
                key={ci}
                style={[styles.opt, STYLES[state]]}
                onPress={() => choose(ci)}
                disabled={done}
              >
                <View style={[styles.optLetter, state === "correct" && { backgroundColor: colors.matcha, borderColor: colors.matcha }, state === "wrong" && { backgroundColor: colors.shu, borderColor: colors.shu }]}>
                  <Text style={[styles.optLetterText, (state === "correct" || state === "wrong") && { color: colors.paper }]}>{letter}</Text>
                </View>
                <Text style={[text.body, { flex: 1 }]}>{opt}</Text>
                {state === "correct" ? <Text style={styles.markCorrect}>✓</Text> : null}
                {state === "wrong" ? <Text style={styles.markWrong}>✗</Text> : null}
              </Pressable>
            );
          })}
          {done ? (
            <Text style={[text.small, { marginTop: spacing.md, color: picked === q.correctIndex ? colors.matcha : colors.shu, fontWeight: "600" }]}>
              {picked === q.correctIndex ? "Correct!" : `The correct answer was ${String.fromCharCode(65 + q.correctIndex)}.`}
            </Text>
          ) : null}
        </View>
      </ScrollView>

      {done ? (
        <View style={styles.footer}>
          <Pressable style={styles.nextBtn} onPress={next}>
            <Text style={styles.nextText}>{i + 1 === items.length ? "See summary" : "Next"}</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function Header({ title, onBack }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack}><Text style={styles.back}>‹ Back</Text></Pressable>
      <Text style={styles.title} numberOfLines={1}>Practice wrong — {title}</Text>
    </View>
  );
}

const STYLES = {
  idle: {},
  picked: { backgroundColor: "#eff6ff", borderColor: colors.ai },
  correct: { backgroundColor: "#dcfce7", borderColor: colors.matcha },
  wrong: { backgroundColor: "#fef2f2", borderColor: colors.shu },
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.kasumi },
  header: { padding: spacing.lg, backgroundColor: colors.paper, borderBottomWidth: 1, borderBottomColor: colors.line },
  back: { color: colors.ai, fontSize: 14 },
  title: { ...text.h2, color: colors.ink, marginTop: spacing.xs, fontSize: 16 },
  progressRow: { flexDirection: "row", alignItems: "center", padding: spacing.md, gap: spacing.sm },
  progressBar: { flex: 1, height: 6, backgroundColor: colors.line, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, backgroundColor: colors.matcha },
  progressText: { ...text.small, color: colors.ink2, minWidth: 50, textAlign: "right" },
  card: { backgroundColor: colors.paper, borderRadius: 10, padding: spacing.md },
  qNum: { ...text.small, color: colors.ai, fontWeight: "600", marginBottom: spacing.xs, textTransform: "uppercase" },
  qText: { ...text.body, fontWeight: "500", marginBottom: spacing.md },
  opt: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: 8, marginBottom: spacing.xs, borderWidth: 1, borderColor: colors.line },
  optLetter: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center", marginRight: spacing.sm },
  optLetterText: { fontSize: 14, fontWeight: "600", color: colors.ink },
  markCorrect: { color: colors.matcha, fontSize: 20, fontWeight: "900", marginLeft: spacing.sm },
  markWrong: { color: colors.shu, fontSize: 20, fontWeight: "900", marginLeft: spacing.sm },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.lg, backgroundColor: colors.paper, borderTopWidth: 1, borderTopColor: colors.line },
  nextBtn: { backgroundColor: colors.ai, paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  nextText: { ...text.button },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl },
  done: { fontSize: 48, fontWeight: "700", color: colors.ai, textAlign: "center" },
  primary: { marginTop: spacing.lg, backgroundColor: colors.ai, paddingVertical: 12, paddingHorizontal: spacing.xl, borderRadius: 10 },
  primaryText: { ...text.button },
  secondary: { marginTop: spacing.md, paddingVertical: 12 },
  secondaryText: { color: colors.ai },
});
