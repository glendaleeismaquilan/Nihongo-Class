// Four-choice question editor — web: components/QuestionEditor.tsx (Decision 11).
// Each question: text, choices A to D, and the correct one marked; questions can
// be moved up or down and deleted (at least one stays).
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Button, Field, Panel } from "../ui";
import { colors, spacing, text } from "../../../styles/theme";

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

export function toApiQuestions(qs) {
  return qs.map((q) => ({ text: q.text.trim(), choices: q.choices.map((c) => c.trim()), correctIndex: q.correctIndex ?? 0 }));
}

function IconBtn({ glyph, label, disabled, onPress, danger }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} style={[s.icon, disabled && { opacity: 0.3 }]} hitSlop={4}>
      <Text style={[s.iconText, danger && { color: colors.shu }]}>{glyph}</Text>
    </Pressable>
  );
}

export function QuestionEditor({ questions, onChange, errors, disabled }) {
  const update = (i, patch) => onChange(questions.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i, d) => {
    const next = [...questions];
    const [q] = next.splice(i, 1);
    next.splice(i + d, 0, q);
    onChange(next);
  };
  return (
    <View>
      {errors.questions ? <Text style={s.error}>{errors.questions}</Text> : null}
      {questions.map((q, i) => (
        <Panel key={i}>
          <View style={s.head}>
            <Text style={s.h}>Question {i + 1}</Text>
            {!disabled ? (
              <View style={s.row}>
                <IconBtn glyph="↑" label={`Move question ${i + 1} up`} disabled={i === 0} onPress={() => move(i, -1)} />
                <IconBtn glyph="↓" label={`Move question ${i + 1} down`} disabled={i === questions.length - 1} onPress={() => move(i, 1)} />
                <IconBtn glyph="🗑" label={`Delete question ${i + 1}`} danger disabled={questions.length === 1} onPress={() => onChange(questions.filter((_, j) => j !== i))} />
              </View>
            ) : null}
          </View>
          <Field label="Question" value={q.text} onChangeText={(v) => update(i, { text: v })} error={errors[`questions.${i}.text`]} multiline editable={!disabled} style={{ marginTop: 0 }} />
          <Text style={[s.legend, { marginTop: spacing.md }]}>Choices (mark the correct one)</Text>
          {q.choices.map((c, j) => {
            const on = q.correctIndex === j;
            return (
              <View key={j} style={s.choice}>
                <Pressable
                  onPress={() => update(i, { correctIndex: j })}
                  disabled={disabled}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on, disabled }}
                  accessibilityLabel={`Choice ${LETTERS[j]} is correct`}
                  style={s.radioHit}
                  hitSlop={4}
                >
                  <View style={[s.radio, on && s.radioOn]}>{on ? <View style={s.radioDot} /> : null}</View>
                </Pressable>
                <Field
                  label={`Choice ${LETTERS[j]}`}
                  value={c}
                  onChangeText={(v) => {
                    const choices = [...q.choices];
                    choices[j] = v;
                    update(i, { choices });
                  }}
                  error={errors[`questions.${i}.choices.${j}`]}
                  editable={!disabled}
                  style={{ flex: 1, marginTop: spacing.sm }}
                />
              </View>
            );
          })}
          {errors[`questions.${i}.correctIndex`] ? <Text style={s.error}>{errors[`questions.${i}.correctIndex`]}</Text> : null}
        </Panel>
      ))}
      {!disabled ? (
        <Button variant="secondary" style={{ alignSelf: "flex-start" }} onPress={() => onChange([...questions, emptyQuestion()])}>
          + Add question
        </Button>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  h: { ...text.body, fontWeight: "700" },
  row: { flexDirection: "row" },
  icon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  iconText: { fontSize: 18, color: colors.ai, fontWeight: "700" },
  legend: { fontSize: 14, fontWeight: "500", color: colors.ink },
  choice: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  radioHit: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.line, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper },
  radioOn: { borderColor: colors.ai },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.ai },
  error: { color: colors.shu, fontSize: 13, marginTop: spacing.sm },
});
