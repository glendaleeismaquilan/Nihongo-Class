// Add or edit one flashcard — web: FlashcardDialog in features/classes/ContentDialogs.tsx
// (FR-3.3.1: term, reading, meaning, optional example sentence; no audio).
// "Save and add another" keeps the lesson and clears the card.
// Route params: { classId, lessonId, card? }.
import { useState } from "react";
import { View, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError, errorMessage } from "../../../lib/api";
import { Loading, ErrorState } from "../../../components/QueryState";
import { useToast } from "../../../components/Toast";
import { useLessons } from "../classHooks";
import { Button, Field, Header, InlineAlert, Picker, ui } from "../ui";
import { spacing } from "../../../styles/theme";

export function FlashcardEditorScreen({ route, navigation }) {
  const { classId, lessonId, card } = route.params ?? {};
  const lessons = useLessons(classId);
  const [values, setValues] = useState({
    lessonId: card?.lessonId ?? lessonId,
    term: card?.term ?? "",
    reading: card?.reading ?? "",
    meaning: card?.meaning ?? "",
    exampleSentence: card?.exampleSentence ?? "",
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const set = (k) => (v) => setValues((s) => ({ ...s, [k]: v }));

  async function submit(again = false) {
    const errs = {};
    if (!values.term.trim()) errs.term = "Enter the term.";
    if (!values.reading.trim()) errs.reading = "Enter the reading.";
    if (!values.meaning.trim()) errs.meaning = "Enter the meaning.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setFormError(null);
    try {
      if (card) await api(`/flashcards/${card.id}`, { method: "PATCH", body: values });
      else await api(`/classes/${classId}/flashcards`, { body: values });
      await qc.invalidateQueries({ queryKey: ["class", classId] });
      toast.success(card ? "Saved" : "Flashcard added");
      if (again) setValues((v) => ({ ...v, term: "", reading: "", meaning: "", exampleSentence: "" }));
      else navigation.goBack();
    } catch (err) {
      if (err instanceof ApiError && err.code === "validation_error") setErrors(err.fieldErrors());
      else setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const title = card ? "Edit flashcard" : "Add flashcard";
  return (
    <SafeAreaView style={ui.root} edges={["top"]}>
      <Header title={title} onBack={() => navigation.goBack()} backLabel="Lesson" />
      {lessons.isPending ? (
        <Loading />
      ) : lessons.isError ? (
        <ErrorState error={lessons.error} retry={() => lessons.refetch()} />
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView contentContainerStyle={ui.scroll} keyboardShouldPersistTaps="handled">
            {formError ? <InlineAlert tone="danger">{formError}</InlineAlert> : null}
            <Picker label="Lesson" value={values.lessonId} onChange={set("lessonId")} options={lessons.data.map((l) => ({ value: l.id, label: l.title }))} error={errors.lessonId} />
            <Field label="Term" placeholder="食べる" value={values.term} onChangeText={set("term")} error={errors.term} />
            <Field label="Reading" placeholder="たべる" value={values.reading} onChangeText={set("reading")} error={errors.reading} />
            <Field label="Meaning" placeholder="to eat" value={values.meaning} onChangeText={set("meaning")} error={errors.meaning} />
            <Field label="Example sentence" placeholder="ご飯を食べる" value={values.exampleSentence} onChangeText={set("exampleSentence")} error={errors.exampleSentence} />
            <View style={s.actions}>
              <Button variant="secondary" onPress={() => navigation.goBack()} disabled={busy}>Cancel</Button>
              {!card ? <Button variant="secondary" onPress={() => submit(true)} loading={busy}>Save and add another</Button> : null}
              <Button onPress={() => submit(false)} loading={busy}>Save</Button>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  actions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: spacing.sm, marginTop: spacing.xl },
});
