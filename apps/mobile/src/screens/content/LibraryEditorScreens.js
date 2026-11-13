// Built-in library editors (mirror of apps/web/src/roles/content/LibraryEditors.tsx):
// flashcards (FR-3.5.1), quizzes (FR-3.5.2), reading tests (FR-3.5.4), and
// listening tests (FR-3.5.5). Save as draft or publish (FR-3.5.7); new items are
// created first and audio is attached once the item exists.
import { useEffect, useState } from "react";
import { View, Text, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError, errorMessage, uploadFile } from "../../lib/api";
import { JLPT_LEVELS, DEFAULT_PASSING_SCORE_PCT } from "../../shared/constants";
import { useToast } from "../../components/Toast";
import { Loading, ErrorState } from "../../components/QueryState";
import { TYPE_LABEL, useLibraryItem } from "./libraryApi";
import { AudioField } from "./AudioField";
import { QuestionEditor, emptyQuestion, toApiQuestions, toEditable, validateQuestions } from "./QuestionEditor";
import { Badge, Btn, Field, Header, LevelSwitcher, Notice, s as ui } from "./ui";
import { colors, spacing, text } from "../../styles/theme";

const levelParam = (route) => (JLPT_LEVELS.includes(route.params?.level) ? route.params.level : "N5");

function EditorShell({ type, isNew, status, navigation, error, children, footer }) {
  const label = TYPE_LABEL[type];
  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Header
          title={isNew ? `New ${label.singular}` : `Edit ${label.singular}`}
          onBack={() => navigation.goBack()}
          backLabel={label.plural}
          right={status ? status === "published" ? <Badge tone="success">Published</Badge> : <Badge>Draft</Badge> : null}
        />
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {error ? <Notice tone="danger">{error}</Notice> : null}
          {children}
        </ScrollView>
        <View style={styles.footer}>{footer}</View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function LevelSelect({ value, onChange }) {
  return (
    <View style={{ marginTop: spacing.md }}>
      <Text style={ui.label}>JLPT level</Text>
      <LevelSwitcher value={value} onChange={onChange} />
    </View>
  );
}

function useSaver(type, id, navigation) {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  async function save(body, status, current) {
    setBusy(true);
    setError(null);
    try {
      let savedId = id;
      if (!id) {
        const created = await api(`/library/${type}`, { body: { ...body, ...(type === "listening-tests" ? {} : { status }) } });
        savedId = created.id;
      } else {
        await api(`/library/${type}/${id}`, { method: "PATCH", body });
        if (status !== current) await api(`/library/${type}/${id}/publish`, { body: { status } });
      }
      await qc.invalidateQueries({ queryKey: ["library"] });
      toast.success(status === "published" && current !== "published" ? "Published" : "Saved");
      if (!id) navigation.setParams({ id: savedId });
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.code === "validation_error") setFieldErrors(err.fieldErrors());
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { save, busy, error, fieldErrors, setFieldErrors };
}

function useAudioUploader(type, id) {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function attach(file, extra = {}) {
    if (!id) return;
    setBusy(true);
    try {
      await uploadFile(`/library/${type}/${id}/audio`, { uri: file.uri, name: file.name, type: file.mimeType, file: file.file }, { fields: { ...extra, fileName: file.name, mimeType: file.mimeType } });
      await qc.invalidateQueries({ queryKey: ["library", type] });
      toast.success("Audio attached");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  async function remove(query = {}) {
    if (!id) return;
    setBusy(true);
    try {
      await api(`/library/${type}/${id}/audio`, { method: "DELETE", query });
      await qc.invalidateQueries({ queryKey: ["library", type] });
      toast.success("Audio removed");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return { attach, remove, busy };
}

function SaveButtons({ status, onSave, busy, isNew, publishBlocked }) {
  if (status === "published") {
    return (
      <View style={styles.buttons}>
        <Btn label="Save" loading={busy} onPress={() => onSave("published")} style={{ flex: 1 }} />
        <Btn variant="secondary" label="Unpublish" disabled={busy} onPress={() => onSave("draft")} style={{ flex: 1 }} />
      </View>
    );
  }
  return (
    <View>
      <View style={styles.buttons}>
        <Btn variant="secondary" label="Save draft" loading={busy} onPress={() => onSave("draft")} style={{ flex: 1 }} />
        <Btn label={isNew ? "Publish" : "Save and publish"} disabled={busy || !!publishBlocked} onPress={() => onSave("published")} style={{ flex: 1 }} />
      </View>
      {publishBlocked ? <Text style={[text.small, { marginTop: spacing.xs }]}>{publishBlocked}</Text> : null}
    </View>
  );
}

function PassingField({ value, onChange, error }) {
  return <Field label="Passing score (%)" keyboardType="number-pad" value={value} onChangeText={onChange} error={error} maxLength={3} />;
}

// ---------- Flashcards (FR-3.5.1) ----------

export function LibraryFlashcardEditorScreen({ route, navigation }) {
  const id = route.params?.id;
  const item = useLibraryItem("flashcards", id);
  const [v, setV] = useState({ level: levelParam(route), term: "", reading: "", meaning: "", exampleSentence: "" });
  const saver = useSaver("flashcards", id, navigation);
  const audio = useAudioUploader("flashcards", id);
  useEffect(() => {
    if (item.data) setV({ level: item.data.level ?? "N5", term: item.data.term, reading: item.data.reading, meaning: item.data.meaning, exampleSentence: item.data.exampleSentence ?? "" });
  }, [item.data]);
  if (id && item.isPending) return <SafeAreaView style={styles.root}><Loading /></SafeAreaView>;
  if (item.isError) return <SafeAreaView style={styles.root}><ErrorState error={item.error} retry={item.refetch} /></SafeAreaView>;
  const set = (k) => (val) => setV((st) => ({ ...st, [k]: val }));

  function onSave(status) {
    const errs = {};
    if (!v.term.trim()) errs.term = "Enter the term.";
    if (!v.reading.trim()) errs.reading = "Enter the reading.";
    if (!v.meaning.trim()) errs.meaning = "Enter the meaning.";
    saver.setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    void saver.save(v, status, item.data?.status);
  }

  return (
    <EditorShell
      type="flashcards"
      isNew={!id}
      status={item.data?.status}
      navigation={navigation}
      error={saver.error}
      footer={<SaveButtons status={item.data?.status} isNew={!id} onSave={onSave} busy={saver.busy} />}
    >
      <View style={ui.panel}>
        <LevelSelect value={v.level} onChange={(level) => setV((st) => ({ ...st, level }))} />
        <Field label="Term" value={v.term} onChangeText={set("term")} error={saver.fieldErrors.term} />
        <Field label="Reading" value={v.reading} onChangeText={set("reading")} error={saver.fieldErrors.reading} />
        <Field label="Meaning" value={v.meaning} onChangeText={set("meaning")} error={saver.fieldErrors.meaning} />
        <Field label="Example sentence" value={v.exampleSentence} onChangeText={set("exampleSentence")} error={saver.fieldErrors.exampleSentence} />
        {id ? (
          <AudioField
            label="Pronunciation"
            currentUrl={item.data?.audioUrl}
            currentName={item.data?.audioFileName}
            busy={audio.busy}
            onSelect={(f) => audio.attach(f)}
            onRemove={() => void audio.remove()}
          />
        ) : (
          <Text style={[text.small, { marginTop: spacing.md }]}>Save the flashcard, then add its pronunciation clip.</Text>
        )}
        {item.data?.expectedAudioName && !item.data.audioUrl ? <Text style={[text.small, { marginTop: spacing.sm }]}>The import expected a file named {item.data.expectedAudioName}.</Text> : null}
      </View>
    </EditorShell>
  );
}

// ---------- Quizzes (FR-3.5.2) ----------

export function LibraryQuizEditorScreen({ route, navigation }) {
  const id = route.params?.id;
  const item = useLibraryItem("quizzes", id);
  const [level, setLevel] = useState(levelParam(route));
  const [title, setTitle] = useState("");
  const [passing, setPassing] = useState(String(DEFAULT_PASSING_SCORE_PCT));
  const [questions, setQuestions] = useState([emptyQuestion()]);
  const [dirty, setDirty] = useState(false);
  const saver = useSaver("quizzes", id, navigation);
  const audio = useAudioUploader("quizzes", id);
  useEffect(() => {
    if (item.data) {
      setLevel(item.data.level ?? "N5");
      setTitle(item.data.title);
      setPassing(String(item.data.passingScorePct));
      setQuestions(toEditable(item.data.questions));
      setDirty(false);
    }
  }, [item.data]);
  if (id && item.isPending) return <SafeAreaView style={styles.root}><Loading /></SafeAreaView>;
  if (item.isError) return <SafeAreaView style={styles.root}><ErrorState error={item.error} retry={item.refetch} /></SafeAreaView>;

  async function onSave(status) {
    const errs = validateQuestions(questions);
    if (!title.trim()) errs.title = "Enter a quiz title.";
    saver.setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    const ok = await saver.save(
      { level, title: title.trim(), passingScorePct: Number(passing) || DEFAULT_PASSING_SCORE_PCT, questions: toApiQuestions(questions, true) },
      status,
      item.data?.status,
    );
    if (ok) setDirty(false);
  }

  return (
    <EditorShell
      type="quizzes"
      isNew={!id}
      status={item.data?.status}
      navigation={navigation}
      error={saver.error}
      footer={<SaveButtons status={item.data?.status} isNew={!id} onSave={onSave} busy={saver.busy} />}
    >
      <View style={ui.panel}>
        <Field label="Quiz title" value={title} onChangeText={(t) => (setTitle(t), setDirty(true))} error={saver.fieldErrors.title} />
        <LevelSelect value={level} onChange={(l) => (setLevel(l), setDirty(true))} />
        <PassingField value={passing} onChange={(t) => (setPassing(t), setDirty(true))} error={saver.fieldErrors.passingScorePct} />
      </View>
      <Text style={[text.small, { marginBottom: spacing.sm }]}>Audio on the correct answer is played to students only on the results screen, after they submit.</Text>
      <QuestionEditor
        questions={questions}
        onChange={(qs) => {
          setQuestions(qs);
          setDirty(true);
        }}
        errors={saver.fieldErrors}
        extra={(i) =>
          id && !dirty && item.data?.questions[i] ? (
            <AudioField
              label="Correct answer audio"
              currentUrl={item.data.questions[i].audioUrl}
              currentName={item.data.questions[i].audioFileName}
              busy={audio.busy}
              onSelect={(f) => audio.attach(f, { questionIndex: String(i) })}
              onRemove={() => void audio.remove({ questionIndex: String(i) })}
            />
          ) : (
            <Text style={text.small}>Save the quiz to add audio to this question's correct answer.</Text>
          )
        }
      />
    </EditorShell>
  );
}

// ---------- Reading tests (FR-3.5.4) ----------

export function LibraryReadingEditorScreen({ route, navigation }) {
  const id = route.params?.id;
  const item = useLibraryItem("reading-tests", id);
  const [level, setLevel] = useState(levelParam(route));
  const [title, setTitle] = useState("");
  const [passage, setPassage] = useState("");
  const [passing, setPassing] = useState(String(DEFAULT_PASSING_SCORE_PCT));
  const [questions, setQuestions] = useState([emptyQuestion()]);
  const saver = useSaver("reading-tests", id, navigation);
  useEffect(() => {
    if (item.data) {
      setLevel(item.data.level);
      setTitle(item.data.title);
      setPassage(item.data.passage);
      setPassing(String(item.data.passingScorePct));
      setQuestions(toEditable(item.data.questions));
    }
  }, [item.data]);
  if (id && item.isPending) return <SafeAreaView style={styles.root}><Loading /></SafeAreaView>;
  if (item.isError) return <SafeAreaView style={styles.root}><ErrorState error={item.error} retry={item.refetch} /></SafeAreaView>;

  function onSave(status) {
    const errs = validateQuestions(questions);
    if (!title.trim()) errs.title = "Enter a title.";
    if (!passage.trim()) errs.passage = "Enter the reading passage.";
    saver.setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    void saver.save(
      { level, title: title.trim(), passage: passage.trim(), passingScorePct: Number(passing) || DEFAULT_PASSING_SCORE_PCT, questions: toApiQuestions(questions) },
      status,
      item.data?.status,
    );
  }

  return (
    <EditorShell
      type="reading-tests"
      isNew={!id}
      status={item.data?.status}
      navigation={navigation}
      error={saver.error}
      footer={<SaveButtons status={item.data?.status} isNew={!id} onSave={onSave} busy={saver.busy} />}
    >
      <View style={ui.panel}>
        <Field label="Title" value={title} onChangeText={setTitle} error={saver.fieldErrors.title} />
        <LevelSelect value={level} onChange={setLevel} />
        <PassingField value={passing} onChange={setPassing} error={saver.fieldErrors.passingScorePct} />
        <Field label="Passage" multiline value={passage} onChangeText={setPassage} error={saver.fieldErrors.passage} inputStyle={{ minHeight: 200 }} />
      </View>
      <QuestionEditor questions={questions} onChange={setQuestions} errors={saver.fieldErrors} />
    </EditorShell>
  );
}

// ---------- Listening tests (FR-3.5.5) ----------

export function LibraryListeningEditorScreen({ route, navigation }) {
  const id = route.params?.id;
  const item = useLibraryItem("listening-tests", id);
  const [level, setLevel] = useState(levelParam(route));
  const [title, setTitle] = useState("");
  const [passing, setPassing] = useState(String(DEFAULT_PASSING_SCORE_PCT));
  const [questions, setQuestions] = useState([emptyQuestion()]);
  const saver = useSaver("listening-tests", id, navigation);
  const audio = useAudioUploader("listening-tests", id);
  useEffect(() => {
    if (item.data) {
      setLevel(item.data.level);
      setTitle(item.data.title);
      setPassing(String(item.data.passingScorePct));
      setQuestions(toEditable(item.data.questions));
    }
  }, [item.data]);
  if (id && item.isPending) return <SafeAreaView style={styles.root}><Loading /></SafeAreaView>;
  if (item.isError) return <SafeAreaView style={styles.root}><ErrorState error={item.error} retry={item.refetch} /></SafeAreaView>;

  function onSave(status) {
    const errs = validateQuestions(questions);
    if (!title.trim()) errs.title = "Enter a title.";
    saver.setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    void saver.save(
      { level, title: title.trim(), passingScorePct: Number(passing) || DEFAULT_PASSING_SCORE_PCT, questions: toApiQuestions(questions) },
      status,
      item.data?.status ?? "draft",
    );
  }

  const blocked = !id ? "Save the draft, then add the clip to publish." : !item.data?.audioUrl ? "Add the listening clip to publish." : undefined;
  return (
    <EditorShell
      type="listening-tests"
      isNew={!id}
      status={item.data?.status}
      navigation={navigation}
      error={saver.error}
      footer={<SaveButtons status={item.data?.status} isNew={!id} onSave={onSave} busy={saver.busy} publishBlocked={item.data?.status === "published" ? undefined : blocked} />}
    >
      <View style={ui.panel}>
        <Field label="Title" value={title} onChangeText={setTitle} error={saver.fieldErrors.title} />
        <LevelSelect value={level} onChange={setLevel} />
        <PassingField value={passing} onChange={setPassing} error={saver.fieldErrors.passingScorePct} />
        {id ? (
          <AudioField
            label="Listening clip"
            currentUrl={item.data?.audioUrl}
            currentName={item.data?.audioFileName}
            busy={audio.busy}
            onSelect={(f) => audio.attach(f)}
            onRemove={item.data?.status === "published" ? undefined : () => void audio.remove()}
          />
        ) : (
          <Text style={[text.small, { marginTop: spacing.md }]}>Save the draft, then upload the listening clip.</Text>
        )}
      </View>
      <QuestionEditor questions={questions} onChange={setQuestions} errors={saver.fieldErrors} />
    </EditorShell>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.kasumi },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  footer: { padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.kasumi },
  buttons: { flexDirection: "row", gap: spacing.sm },
});
