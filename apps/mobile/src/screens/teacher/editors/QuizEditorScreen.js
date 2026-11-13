// Create or edit a class quiz — web: features/classes/QuizEditorPage.tsx
// (FR-3.4.1: title, lesson, passing score, then four-choice questions with
// exactly one correct). Route params: { classId, quizId? , lessonId? }.
import { useEffect, useState } from "react";
import { View, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, errorMessage } from "../../../lib/api";
import { Loading, ErrorState } from "../../../components/QueryState";
import { useToast } from "../../../components/Toast";
import { isReadOnly, useClass, useLessons } from "../classHooks";
import { Button, Field, Header, InlineAlert, Panel, Picker, ui } from "../ui";
import { QuestionEditor, emptyQuestion, toApiQuestions, validateQuestions } from "./QuestionEditor";
import { colors, spacing } from "../../../styles/theme";

export function QuizEditorScreen({ route, navigation }) {
  const { classId, quizId, lessonId: lessonParam } = route.params ?? {};
  const cls = useClass(classId);
  const lessons = useLessons(classId);
  const existing = useQuery({ queryKey: ["quiz", quizId], queryFn: () => api(`/quizzes/${quizId}`), enabled: !!quizId });
  const [title, setTitle] = useState("");
  const [lessonId, setLessonId] = useState(lessonParam ?? "");
  const [passing, setPassing] = useState("60");
  const [questions, setQuestions] = useState([emptyQuestion()]);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();

  useEffect(() => {
    if (existing.data) {
      setTitle(existing.data.title);
      setLessonId(existing.data.lessonId ?? "");
      setPassing(String(existing.data.passingScorePct));
      setQuestions(existing.data.questions.map((q) => ({ text: q.text, choices: [...q.choices], correctIndex: q.correctIndex })));
    }
  }, [existing.data]);
  useEffect(() => {
    if (!lessonId && lessons.data?.[0]) setLessonId(lessons.data[0].id);
  }, [lessons.data, lessonId]);

  const heading = quizId ? "Edit quiz" : "New quiz";
  const back = () => navigation.goBack();
  const pending = cls.isPending || lessons.isPending || (quizId && existing.isPending);
  const failed = [cls, lessons, existing].find((x) => x.isError);
  if (pending || failed) {
    return (
      <SafeAreaView style={ui.root} edges={["top"]}>
        <Header title={heading} onBack={back} backLabel="Lessons and content" />
        {failed ? <ErrorState error={failed.error} retry={() => failed.refetch()} /> : <Loading />}
      </SafeAreaView>
    );
  }
  const readOnly = isReadOnly(cls.data);

  async function save() {
    const errs = validateQuestions(questions);
    if (!title.trim()) errs.title = "Enter a quiz title.";
    const pct = Number(passing);
    if (!Number.isInteger(pct) || pct < 1 || pct > 100) errs.passingScorePct = "Use a whole number from 1 to 100.";
    setErrors(errs);
    if (Object.keys(errs).length) {
      setFormError("Some fields need attention.");
      return;
    }
    setBusy(true);
    setFormError(null);
    const body = { lessonId, title: title.trim(), passingScorePct: pct, questions: toApiQuestions(questions) };
    try {
      if (quizId) await api(`/quizzes/${quizId}`, { method: "PATCH", body });
      else await api(`/classes/${classId}/quizzes`, { body });
      await qc.invalidateQueries({ queryKey: ["class", classId] });
      if (quizId) await qc.invalidateQueries({ queryKey: ["quiz", quizId] });
      toast.success(quizId ? "Saved" : "Quiz created");
      // Back to the lesson the quiz is in (web: the workspace with ?lesson=).
      navigation.navigate("LessonDetail", { classId, lessonId });
    } catch (err) {
      if (err instanceof ApiError && err.code === "validation_error") setErrors(err.fieldErrors());
      setFormError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={ui.root} edges={["top"]}>
      <Header title={heading} onBack={back} backLabel="Lessons and content" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={ui.scroll} keyboardShouldPersistTaps="handled">
          {formError ? <InlineAlert tone="danger">{formError}</InlineAlert> : null}
          <Panel>
            <Field label="Quiz title" value={title} onChangeText={setTitle} error={errors.title} editable={!readOnly} style={{ marginTop: 0 }} />
            <Picker label="Lesson" value={lessonId} onChange={setLessonId} options={lessons.data.map((l) => ({ value: l.id, label: l.title }))} error={errors.lessonId} disabled={readOnly} />
            <Field
              label="Passing score (%)"
              keyboardType="number-pad"
              value={passing}
              onChangeText={setPassing}
              error={errors.passingScorePct}
              hint="Students at or above this score see Passed."
              editable={!readOnly}
            />
          </Panel>
          <QuestionEditor questions={questions} onChange={setQuestions} errors={errors} disabled={readOnly} />
        </ScrollView>
        {!readOnly ? (
          <View style={s.bar}>
            <Button onPress={save} loading={busy}>{quizId ? "Save quiz" : "Create quiz"}</Button>
            <Button variant="secondary" onPress={back} disabled={busy}>Cancel</Button>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: "row", gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.kasumi },
});
