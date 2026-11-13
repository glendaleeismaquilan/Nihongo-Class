// Mirror of apps/web/src/components/QuestionEditor.tsx (Decision 11): one
// four-choice question editor for built-in quizzes, reading tests, and
// listening tests.
import { View, Text, Pressable } from "react-native";
import { Btn, Field, s as ui } from "./ui";
import { colors, spacing, text } from "../../styles/theme";

export const emptyQuestion = () => ({ text: "", choices: ["", "", "", ""], correctIndex: null });

const LETTERS = ["A", "B", "C", "D"];

export function validateQuestions(qs) {
  const errors = {};
  if (!qs.length) errors.questions = "Add at least one question.";
  qs.forEach((q, i) => {
    if (!q.text.trim()) errors[`questions.${i}.text`] = "Enter the question.";
    q.choices.forEach((c, j) => {
      if (!c.trim()) errors[`questions.${i}.choices.${j}`] = `Enter choice ${LETTERS[j]}.`;
    });
    if (q.correctIndex === null) errors[`questions.${i}.correctIndex`] = "Mark the correct choice.";
  });
  return errors;
}

export function toApiQuestions(qs, withAudio = false) {
  return qs.map((q) => ({
    text: q.text.trim(),
    choices: q.choices.map((c) => c.trim()),
    correctIndex: q.correctIndex ?? 0,
    ...(withAudio && q.audioUrl ? { audioUrl: q.audioUrl } : {}),
  }));
}

export function toEditable(qs) {
  return qs.map((q) => ({ text: q.text, choices: [...q.choices], correctIndex: q.correctIndex, audioUrl: q.audioUrl ?? null, audioFileName: q.audioFileName ?? null }));
}

export function QuestionEditor({ questions, onChange, errors, extra }) {
  const update = (i, patch) => onChange(questions.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i, d) => {
    const next = [...questions];
    const [q] = next.splice(i, 1);
    next.splice(i + d, 0, q);
    onChange(next);
  };
  return (
    <View>
      {errors.questions ? <Text style={[ui.err, { marginBottom: spacing.sm }]}>{errors.questions}</Text> : null}
      {questions.map((q, i) => (
        <View key={i} style={ui.panel}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={[text.body, { fontWeight: "700" }]}>Question {i + 1}</Text>
            <View style={{ flexDirection: "row" }}>
              <Btn small variant="ghost" label="↑" accessibilityLabel={`Move question ${i + 1} up`} disabled={i === 0} onPress={() => move(i, -1)} />
              <Btn small variant="ghost" label="↓" accessibilityLabel={`Move question ${i + 1} down`} disabled={i === questions.length - 1} onPress={() => move(i, 1)} />
              <Btn small variant="dangerGhost" label="Delete" accessibilityLabel={`Delete question ${i + 1}`} disabled={questions.length === 1} onPress={() => onChange(questions.filter((_, j) => j !== i))} />
            </View>
          </View>
          <Field label="Question" multiline value={q.text} onChangeText={(v) => update(i, { text: v })} error={errors[`questions.${i}.text`]} style={{ marginTop: spacing.xs }} />
          <Text style={[ui.label, { marginTop: spacing.md }]}>Choices (mark the correct one)</Text>
          {q.choices.map((c, j) => {
            const correct = q.correctIndex === j;
            return (
              <View key={j} style={{ flexDirection: "row", alignItems: "flex-start", gap: spacing.sm }}>
                <Pressable
                  onPress={() => update(i, { correctIndex: j })}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: correct }}
                  accessibilityLabel={`Choice ${LETTERS[j]} is correct`}
                  hitSlop={6}
                  style={{ width: 44, minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: spacing.md + 18 }}
                >
                  <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: correct ? colors.ai : colors.line, alignItems: "center", justifyContent: "center" }}>
                    {correct ? <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: colors.ai }} /> : null}
                  </View>
                </Pressable>
                <Field
                  style={{ flex: 1 }}
                  label={`Choice ${LETTERS[j]}`}
                  value={c}
                  onChangeText={(v) => {
                    const choices = [...q.choices];
                    choices[j] = v;
                    update(i, { choices });
                  }}
                  error={errors[`questions.${i}.choices.${j}`]}
                />
              </View>
            );
          })}
          {errors[`questions.${i}.correctIndex`] ? <Text style={ui.err}>{errors[`questions.${i}.correctIndex`]}</Text> : null}
          {extra ? <View style={{ marginTop: spacing.sm }}>{extra(i)}</View> : null}
        </View>
      ))}
      <Btn variant="secondary" label="+ Add question" onPress={() => onChange([...questions, emptyQuestion()])} style={{ alignSelf: "flex-start" }} />
    </View>
  );
}
