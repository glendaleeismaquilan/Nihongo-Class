// Import flashcards or a quiz from an Excel file — web: TeacherImportDialog in
// features/classes/ContentDialogs.tsx and components/ImportResult.tsx
// (FR-3.3.2 to FR-3.4.4). Pick the filled .xlsx, upload it to
// POST /classes/:id/{flashcards|quizzes}/import, then see what was imported
// and every row that was skipped with its reason.
// Route params: { classId, lessonId, kind: "flashcards" | "quiz" }.
//
// The web dialog downloads the template (GET /templates/:kind, which needs the
// sign-in header) and an .xlsx error report. The app has no file-saving module,
// so it shows the template's columns, example row and rules here instead, and
// lists the skipped rows on screen (the same rows the error report holds).
import { useState } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import { useQueryClient } from "@tanstack/react-query";
import { errorMessage, uploadFile } from "../../../lib/api";
import { formatBytes } from "../../../lib/format";
import { FLASHCARD_HEADERS, LIMITS, QUIZ_HEADERS } from "../../../shared/constants";
import { Loading, ErrorState } from "../../../components/QueryState";
import { useLessons } from "../classHooks";
import { Button, Field, Header, InlineAlert, Panel, Picker, ui } from "../ui";
import { colors, spacing, text } from "../../../styles/theme";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// The teacher template the API builds (apps/api/src/lib/excel.ts buildTemplate).
const TEMPLATE = {
  flashcards: {
    headers: FLASHCARD_HEADERS,
    example: ["食べる", "たべる", "to eat", "ご飯を食べる"],
    rules: [
      "Fill one flashcard per row on the first sheet, under the header row. Keep the header row as it is.",
      "Term (required): the word or phrase, for example 食べる.",
      "Reading (required): the reading in kana, for example たべる.",
      "Meaning (required): the English meaning, for example to eat.",
      "Example Sentence (optional): a short sentence that uses the term.",
      "You choose the lesson in the upload form. Teacher flashcards have no audio.",
    ],
  },
  quiz: {
    headers: QUIZ_HEADERS,
    example: ["「食べる」の意味は？", "to eat", "to drink", "to sleep", "to walk", "A"],
    rules: [
      "Fill one question per row on the first sheet, under the header row. Keep the header row as it is.",
      "Question (required): the question text.",
      "Option A to Option D (all required): the four choices.",
      "Correct Option (required): exactly one letter, A, B, C, or D.",
      "You type the quiz title and choose the lesson in the upload form. Teacher quizzes have no audio.",
    ],
  },
};

function ImportResultView({ result, noun }) {
  return (
    <View accessibilityLiveRegion="polite">
      {result.imported > 0 ? (
        <InlineAlert tone="success" title={`Imported ${result.imported} ${noun}${result.imported === 1 ? "" : "s"}`}>
          {result.errors.length ? `${result.errors.length} row${result.errors.length === 1 ? " was" : "s were"} skipped. Fix them and upload those rows again.` : "Every row was imported."}
        </InlineAlert>
      ) : (
        <InlineAlert tone="danger" title="Nothing was imported">
          Every row has a problem. Fix the rows below and upload the file again.
        </InlineAlert>
      )}
      {result.errors.length ? (
        <Panel>
          <Text style={s.h}>Rows that weren't imported</Text>
          {result.errors.map((e) => (
            <View key={e.row} style={s.errRow}>
              <Text style={s.errNum}>Row {e.row}</Text>
              <Text style={s.errReason}>{e.reason.replace(/^Row \d+: /, "")}</Text>
            </View>
          ))}
        </Panel>
      ) : null}
    </View>
  );
}

export function ContentImportScreen({ route, navigation }) {
  const { classId, lessonId, kind = "flashcards" } = route.params ?? {};
  const lessons = useLessons(classId);
  const [lesson, setLesson] = useState(lessonId);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [titleError, setTitleError] = useState(null);
  const qc = useQueryClient();
  const noun = kind === "quiz" ? "question" : "flashcard";
  const tpl = TEMPLATE[kind] ?? TEMPLATE.flashcards;
  const heading = kind === "quiz" ? "Upload a quiz from Excel" : "Upload flashcards from Excel";

  async function choose() {
    setError(null);
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: [XLSX_MIME], copyToCacheDirectory: true, multiple: false });
      if (picked.canceled || !picked.assets?.length) return;
      setFile(picked.assets[0]);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function submit() {
    if (kind === "quiz" && !title.trim()) {
      setTitleError("Enter a quiz title.");
      return;
    }
    if (!file) {
      setError("Choose the filled template to upload.");
      return;
    }
    setTitleError(null);
    setError(null);
    setUploading(true);
    try {
      const res = await uploadFile(`/classes/${classId}/${kind === "quiz" ? "quizzes" : "flashcards"}/import`, file, {
        fields: { lessonId: lesson, ...(kind === "quiz" ? { title: title.trim() } : {}) },
      });
      setResult(res);
      await qc.invalidateQueries({ queryKey: ["class", classId] });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <SafeAreaView style={ui.root} edges={["top"]}>
      <Header title={heading} onBack={() => navigation.goBack()} backLabel="Lesson" />
      {lessons.isPending ? (
        <Loading />
      ) : lessons.isError ? (
        <ErrorState error={lessons.error} retry={() => lessons.refetch()} />
      ) : (
        <ScrollView contentContainerStyle={ui.scroll} keyboardShouldPersistTaps="handled">
          {result ? (
            <>
              <ImportResultView result={result} noun={noun} />
              <View style={s.actions}>
                <Button variant="secondary" onPress={() => { setResult(null); setFile(null); }}>Upload another file</Button>
                <Button onPress={() => navigation.goBack()}>Done</Button>
              </View>
            </>
          ) : (
            <>
              <Panel>
                <Text style={s.h}>1. Make the sheet</Text>
                <Text style={[text.small, { marginTop: spacing.xs }]}>
                  Use this header row ({kind === "quiz" ? "Question, Option A to D, Correct Option" : "Term, Reading, Meaning, Example Sentence"}) on the first sheet, in this order:
                </Text>
                <View style={s.table}>
                  <View style={[s.tr, s.thRow]}>
                    <Text style={[s.col, s.th]}>Column</Text>
                    <Text style={[s.head, s.th]}>Header (row 1)</Text>
                    <Text style={[s.ex, s.th]}>Example (row 2)</Text>
                  </View>
                  {tpl.headers.map((h, i) => (
                    <View key={h} style={s.tr}>
                      <Text style={s.col}>{String.fromCharCode(65 + i)}</Text>
                      <Text style={s.head}>{h}</Text>
                      <Text style={s.ex}>{tpl.example[i]}</Text>
                    </View>
                  ))}
                </View>
                {tpl.rules.map((r) => (
                  <Text key={r} style={s.rule}>• {r}</Text>
                ))}
                <Text style={s.rule}>• Up to {LIMITS.importMaxRows} rows and 5 MB per file. Delete the example row before uploading, or it will be imported too.</Text>
                <Text style={[text.small, { marginTop: spacing.sm }]}>The ready-made template file, with these rules on a second sheet, downloads from the web app.</Text>
              </Panel>
              <Panel>
                <Text style={s.h}>2. Fill one {noun} per row and save it as .xlsx.</Text>
                <Text style={[s.h, { marginTop: spacing.md }]}>3. Upload it here.</Text>
                <Text style={text.small}>Rows with problems are skipped and listed; the rest are imported.</Text>
                {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
                <Picker label="Lesson" value={lesson} onChange={setLesson} options={lessons.data.map((l) => ({ value: l.id, label: l.title }))} />
                {kind === "quiz" ? <Field label="Quiz title" value={title} onChangeText={setTitle} error={titleError} /> : null}
                {file ? (
                  <View style={s.file}>
                    <View style={{ flex: 1 }}>
                      <Text style={text.body} numberOfLines={2}>{file.name}</Text>
                      {file.size ? <Text style={text.small}>{formatBytes(file.size)}</Text> : null}
                    </View>
                    <Button small variant="ghost" onPress={() => setFile(null)} disabled={uploading}>Remove</Button>
                  </View>
                ) : (
                  <View style={{ marginTop: spacing.md }}>
                    <Button variant="secondary" onPress={choose}>Choose an .xlsx file</Button>
                    <Text style={[text.small, { marginTop: spacing.xs }]}>Up to {LIMITS.importMaxRows} rows and 5 MB.</Text>
                  </View>
                )}
                {uploading ? <Loading label="Uploading" /> : null}
              </Panel>
              <View style={s.actions}>
                <Button variant="secondary" onPress={() => navigation.goBack()} disabled={uploading}>Cancel</Button>
                <Button onPress={submit} loading={uploading}>Upload</Button>
              </View>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  h: { ...text.body, fontWeight: "700" },
  table: { marginTop: spacing.sm, borderWidth: 1, borderColor: colors.line, borderRadius: 6, overflow: "hidden" },
  tr: { flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.line },
  thRow: { borderTopWidth: 0, backgroundColor: colors.kasumi },
  col: { width: 64, padding: 6, fontSize: 13, color: colors.ink2 },
  head: { flex: 1, padding: 6, fontSize: 13, color: colors.ink, fontWeight: "600" },
  ex: { flex: 1, padding: 6, fontSize: 13, color: colors.ink },
  th: { fontWeight: "700", color: colors.ink },
  rule: { fontSize: 13, color: colors.ink2, marginTop: spacing.xs },
  file: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: spacing.md, marginTop: spacing.md },
  errRow: { flexDirection: "row", gap: spacing.md, paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.line },
  errNum: { width: 64, fontWeight: "600", color: colors.ink },
  errReason: { flex: 1, color: colors.shu },
  actions: { flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
});
