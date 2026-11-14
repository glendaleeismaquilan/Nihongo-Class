// A quiz, reading test, or listening test (mirror of
// apps/web/src/roles/student/study/ActivityPage.tsx). Quizzes show one question
// at a time; reading shows the passage above the questions; listening plays the
// clip. Unanswered questions are sent as null and count as wrong, after a
// warning. Route params: { activityType, activityId, back: "class" | "study" }.
import { useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "../../../lib/api";
import { ListeningPlayer } from "../../../components/audio";
import { Loading, ErrorState } from "../../../components/QueryState";
import { colors, spacing, text } from "../../../styles/theme";
import { Button, Panel } from "../ui";

const LETTERS = ["A", "B", "C", "D"];

function ChoiceGroup({ q, index, value, onChange }) {
  return (
    <View accessibilityRole="radiogroup">
      <Text style={styles.qLabel}>Question {index + 1}</Text>
      <Text style={styles.qText}>{q.text}</Text>
      {q.choices.map((c, j) => {
        const selected = value === j;
        return (
          <Pressable key={j} onPress={() => onChange(j)} style={[styles.choice, selected && styles.choiceOn]} accessibilityRole="radio" accessibilityState={{ selected }}>
            <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <View style={styles.radioDot} /> : null}</View>
            <Text style={styles.letter}>{LETTERS[j]}</Text>
            <Text style={styles.choiceText}>{c}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function QuizPlayerScreen({ route, navigation }) {
  const { activityType: type = "quiz", activityId: id, back = "study" } = route.params;
  const [answers, setAnswers] = useState(null);
  const [current, setCurrent] = useState(0);
  const [warn, setWarn] = useState(false);
  const [showPassage, setShowPassage] = useState(true);
  const qc = useQueryClient();

  const q = useQuery({ queryKey: ["activity", type, id], queryFn: () => api(`/activities/${type}/${id}`), staleTime: Infinity });
  const submit = useMutation({
    mutationFn: (a) => api(`/activities/${type}/${id}/submit`, { body: { answers: a } }),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ["progress"] });
      void qc.invalidateQueries({ queryKey: ["study"] });
      void qc.invalidateQueries({ queryKey: ["class-study"] });
      navigation.replace("Results", { result, activityType: type, activityId: id, back, title: q.data.title });
    },
  });

  const header = (title, progress) => (
    <View style={styles.header}>
      <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityRole="button" style={styles.back}><Text style={styles.backText}>✕ Exit</Text></Pressable>
      <Text style={styles.headerTitle} numberOfLines={2}>{title}</Text>
      {progress ? <Text style={text.small}>{progress}</Text> : null}
    </View>
  );

  if (q.isPending) return <SafeAreaView style={styles.root} edges={["top"]}>{header("Loading")}<Loading /></SafeAreaView>;
  if (q.isError) return <SafeAreaView style={styles.root} edges={["top"]}>{header("Couldn't open")}<ErrorState error={q.error} retry={q.refetch} /></SafeAreaView>;
  const act = q.data;
  const ans = answers ?? act.questions.map(() => null);
  const setAnswer = (i, v) => setAnswers(ans.map((x, j) => (j === i ? v : x)));
  const unanswered = ans.filter((a) => a === null).length;

  function trySubmit() {
    if (unanswered && !warn) {
      setWarn(true);
      return;
    }
    submit.mutate(ans);
  }

  const submitBar = (
    <View style={{ gap: spacing.sm }}>
      {warn && unanswered ? (
        <View style={styles.warn}>
          <Text style={styles.warnText}>
            {unanswered} question{unanswered === 1 ? " is" : "s are"} unanswered and will count as wrong. Submit anyway, or go back and answer {unanswered === 1 ? "it" : "them"}.
          </Text>
        </View>
      ) : null}
      {submit.isError ? <View style={styles.error}><Text style={styles.errorText}>{errorMessage(submit.error)}</Text></View> : null}
      <Button onPress={trySubmit} loading={submit.isPending}>{warn && unanswered ? "Submit anyway" : "Submit answers"}</Button>
    </View>
  );

  if (type === "quiz") {
    const question = act.questions[current];
    const last = current === act.questions.length - 1;
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        {header(act.title, `Question ${current + 1} of ${act.questions.length}`)}
        <ScrollView contentContainerStyle={styles.scroll}>
          <Panel style={styles.panel}>
            <ChoiceGroup key={current} q={question} index={current} value={ans[current]} onChange={(v) => setAnswer(current, v)} />
          </Panel>
          <View style={styles.nav}>
            <Button variant="secondary" onPress={() => setCurrent((c) => c - 1)} disabled={current === 0}>‹ Previous</Button>
            {last ? null : <Button onPress={() => setCurrent((c) => c + 1)}>Next question</Button>}
          </View>
          {last ? <View style={{ marginTop: spacing.md }}>{submitBar}</View> : null}
        </ScrollView>
      </SafeAreaView>
    );
  }

  const answered = act.questions.length - unanswered;
  const questions = (
    <View style={{ gap: spacing.md }}>
      {act.questions.map((qq, i) => (
        <Panel key={i} style={styles.panel}>
          <ChoiceGroup q={qq} index={i} value={ans[i]} onChange={(v) => setAnswer(i, v)} />
        </Panel>
      ))}
      {submitBar}
    </View>
  );

  if (type === "reading") {
    // FR-3.7.1: on a phone the passage sits above the questions and can be collapsed.
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        {header(act.title, `Answered ${answered} of ${act.questions.length}`)}
        <ScrollView contentContainerStyle={styles.scroll}>
          <Panel style={[styles.panel, { marginBottom: spacing.md }]}>
            <Pressable onPress={() => setShowPassage((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: showPassage }} style={styles.summary}>
              <Text style={styles.summaryText}>{showPassage ? "▾" : "▸"} Reading passage</Text>
            </Pressable>
            {showPassage ? (
              <>
                <Text style={styles.passageTitle}>{act.title}</Text>
                <Text style={styles.passage}>{act.passage}</Text>
              </>
            ) : null}
          </Panel>
          {questions}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // FR-3.8.2: listening — the clip, then the questions. The clip plays in the app with
  // the same controls as the web's in-page player (components/audio.js).
  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      {header(act.title, `Answered ${answered} of ${act.questions.length}`)}
      <ScrollView contentContainerStyle={styles.scroll}>
        {act.audioUrl ? (
          <ListeningPlayer src={act.audioUrl} title={act.title} />
        ) : (
          <View style={[styles.error, { marginBottom: spacing.md }]}><Text style={styles.errorText}>This test's clip is missing.</Text></View>
        )}
        {questions}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.kasumi },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, backgroundColor: colors.paper, borderBottomWidth: 1, borderBottomColor: colors.line },
  back: { minHeight: 40, justifyContent: "center" },
  backText: { color: colors.ai, fontSize: 15 },
  headerTitle: { ...text.h2, fontSize: 18 },
  scroll: { padding: spacing.md, paddingBottom: spacing.xxl },
  panel: { padding: spacing.lg },
  qLabel: { ...text.small, fontWeight: "500" },
  qText: { fontSize: 20, color: colors.ink, marginTop: spacing.xs, marginBottom: spacing.md },
  choice: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 48, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.sm, backgroundColor: colors.paper },
  choiceOn: { borderColor: colors.ai, backgroundColor: colors.kasumi },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.line, alignItems: "center", justifyContent: "center" },
  radioOn: { borderColor: colors.ai },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.ai },
  letter: { width: 18, fontWeight: "600", color: colors.ink2 },
  choiceText: { flex: 1, fontSize: 18, color: colors.ink },
  nav: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm, marginTop: spacing.md },
  warn: { backgroundColor: "#fffbeb", borderWidth: 1, borderColor: "#fde68a", borderRadius: 10, padding: spacing.md },
  warnText: { color: "#92400e" },
  error: { backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca", borderRadius: 10, padding: spacing.md },
  errorText: { color: colors.shu },
  summary: { minHeight: 40, justifyContent: "center" },
  summaryText: { fontWeight: "600", color: colors.ink },
  passageTitle: { fontSize: 20, color: colors.ink, marginTop: spacing.sm, marginBottom: spacing.sm },
  passage: { fontSize: 18, color: colors.ink, lineHeight: 30 },
});
