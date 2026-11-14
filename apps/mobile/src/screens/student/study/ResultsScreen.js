// The score, then the answer review, after a quiz, reading or listening test
// (mirror of apps/web/src/roles/student/study/Results.tsx). Route params come
// from QuizPlayerScreen: { result: AttemptResultDto, activityType, activityId,
// back: "class" | "study", title }.
// Mobile extra: "Practice N wrong questions" opens PracticeWrong with the missed
// questions from result.review (practice only, nothing is submitted).
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ListenButton } from "../../../components/audio";
import { colors, spacing, text } from "../../../styles/theme";
import { Button, Panel } from "../ui";

const LETTERS = ["A", "B", "C", "D"];

/** ○ and × review marks, always paired with words (web: ReviewMark). */
function ReviewMark({ correct }) {
  return (
    <Text style={styles.mark} importantForAccessibility="no" accessibilityElementsHidden>
      {correct ? "○" : "×"}
    </Text>
  );
}

export function ResultsScreen({ route, navigation }) {
  const { result, activityType, activityId, back = "study", title } = route.params;
  const backLabel = back === "class" ? "Back to class" : "Back to Self-Study";
  const heading = title ?? result.title;
  const wrong = result.review.filter((r) => !r.correct);
  const answer = (r, i) => `${LETTERS[i]}. ${r.choices[i]}`;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityRole="button" style={styles.exit}>
          <Text style={styles.exitText}>✕ Exit</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={2}>{heading}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Panel style={styles.hero}>
          <View
            accessible
            accessibilityLiveRegion="polite"
            accessibilityLabel={`You scored ${result.correctCount} out of ${result.total}, ${result.score} percent. ${result.passed ? "Passed." : `Passing score is ${result.passingScorePct} percent.`}`}
            style={[styles.ring, result.passed && styles.ringPass]}
          >
            <Text style={styles.count}>{result.correctCount} / {result.total}</Text>
            <Text style={styles.pct}>{result.score}%</Text>
          </View>
          {result.passed ? (
            <View style={styles.passRow}>
              <View style={styles.seal} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                <Text style={styles.sealText}>合格</Text>
              </View>
              <Text style={styles.passText}>Passed</Text>
            </View>
          ) : (
            <Text style={styles.failText}>Passing score is {result.passingScorePct}%. Review the answers below, then try again.</Text>
          )}
          <Text style={[text.small, styles.best]}>
            Best score {result.bestScore}%, attempt {result.attemptCount}
          </Text>
          <View style={styles.actions}>
            <Button variant="secondary" onPress={() => navigation.replace("Quiz", { activityType, activityId, back })}>↻ Try again</Button>
            <Button onPress={() => navigation.goBack()}>{backLabel}</Button>
          </View>
          {wrong.length ? (
            <View style={styles.practice}>
              <Button
                variant="ghost"
                onPress={() =>
                  navigation.navigate("PracticeWrong", {
                    title: heading,
                    items: wrong.map((r) => ({ text: r.text, choices: r.choices, correctIndex: r.correctIndex })),
                  })
                }
              >
                Practice {wrong.length} wrong question{wrong.length === 1 ? "" : "s"}
              </Button>
            </View>
          ) : null}
        </Panel>

        <Text style={styles.reviewHeading} accessibilityRole="header">Review</Text>
        {result.review.map((r, i) => (
          <Panel key={i} style={styles.item}>
            <View style={styles.itemHead}>
              <ReviewMark correct={r.correct} />
              <View style={{ flex: 1 }}>
                <Text style={styles.itemStatus}>
                  Question {i + 1}: {r.correct ? "Correct" : r.yourAnswer === null ? "Not answered" : "Incorrect"}
                </Text>
                <Text style={styles.itemText}>{r.text}</Text>
              </View>
            </View>
            <View style={styles.answers}>
              {r.correct ? (
                <Text style={styles.answerLine}>
                  <Text style={styles.dt}>Correct: </Text>
                  {answer(r, r.correctIndex)}
                </Text>
              ) : (
                <>
                  <Text style={styles.answerLine}>
                    <Text style={styles.dt}>× Your answer: </Text>
                    {r.yourAnswer === null ? "No answer" : answer(r, r.yourAnswer)}
                  </Text>
                  <Text style={styles.answerLine}>
                    <Text style={styles.dt}>○ Correct answer: </Text>
                    {answer(r, r.correctIndex)}
                  </Text>
                </>
              )}
            </View>
            {/* Decision 7: answer audio appears only here, after submission. */}
            {r.audioUrl ? (
              <View style={styles.audio}>
                <ListenButton src={r.audioUrl} label={`Play the answer to question ${i + 1}`} />
              </View>
            ) : null}
          </Panel>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.kasumi },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, backgroundColor: colors.paper, borderBottomWidth: 1, borderBottomColor: colors.line },
  exit: { minHeight: 40, justifyContent: "center", alignSelf: "flex-start" },
  exitText: { color: colors.ai, fontSize: 15, fontWeight: "500" },
  headerTitle: { ...text.body, fontWeight: "600" },
  scroll: { padding: spacing.md, paddingBottom: spacing.xxl },
  hero: { alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: spacing.xl },
  ring: { width: 200, height: 200, borderRadius: 100, borderWidth: 5, borderColor: "transparent", alignItems: "center", justifyContent: "center" },
  ringPass: { borderColor: colors.shu, borderStyle: "dashed" },
  count: { fontSize: 40, fontWeight: "600", color: colors.ink },
  pct: { fontSize: 22, color: colors.ink2 },
  passRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.sm },
  seal: { width: 48, height: 48, borderWidth: 3, borderColor: colors.shu, borderRadius: 6, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-8deg" }] },
  sealText: { color: colors.shu, fontSize: 17, fontWeight: "600" },
  passText: { fontSize: 20, fontWeight: "600", color: colors.ink },
  failText: { ...text.bodyMuted, textAlign: "center", marginTop: spacing.sm },
  best: { marginTop: spacing.md, textAlign: "center" },
  actions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.sm, marginTop: spacing.lg },
  practice: { marginTop: spacing.sm },
  reviewHeading: { ...text.h2, fontSize: 18, marginTop: spacing.xl, marginBottom: spacing.sm },
  item: { marginBottom: spacing.sm, paddingVertical: spacing.md },
  itemHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  mark: { width: 28, textAlign: "center", fontSize: 24, lineHeight: 28, color: colors.shu },
  itemStatus: { ...text.small, fontWeight: "500" },
  itemText: { fontSize: 18, color: colors.ink, marginTop: 2 },
  answers: { marginLeft: 36, marginTop: spacing.sm, gap: spacing.xs },
  answerLine: { ...text.body },
  dt: { color: colors.ink2 },
  audio: { marginLeft: 36, marginTop: spacing.sm, alignSelf: "flex-start" },
});
