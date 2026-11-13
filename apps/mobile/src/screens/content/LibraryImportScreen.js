// Import built-in flashcards or a quiz from Excel (mirror of
// apps/web/src/roles/content/LibraryImportDialog.tsx + components/ImportResult.tsx).
// The level (and quiz title) come from the form (decision 10); every row lands as
// a draft in one batch, reviewed on the next screen.
//
// Phone equivalents: the web dialog downloads the template and the .xlsx error
// report; the app can't save files, so it lists the template's exact columns and
// shows every skipped row with its reason.
import { useState } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { errorMessage, uploadFile } from "../../lib/api";
import { formatBytes } from "../../lib/format";
import { AUDIO_FILE_HEADER, FLASHCARD_HEADERS, JLPT_LEVELS, LIMITS, QUIZ_HEADERS } from "../../shared/constants";
import { Btn, Field, Header, LevelSwitcher, Notice, s as ui } from "./ui";
import { colors, spacing, text } from "../../styles/theme";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function LibraryImportScreen({ route, navigation }) {
  const type = route.params?.type === "quizzes" ? "quizzes" : "flashcards";
  const [level, setLevel] = useState(JLPT_LEVELS.includes(route.params?.level) ? route.params.level : "N5");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const qc = useQueryClient();
  const columns = [...(type === "quizzes" ? QUIZ_HEADERS : FLASHCARD_HEADERS), AUDIO_FILE_HEADER];

  async function choose() {
    setError(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: [XLSX], multiple: false, copyToCacheDirectory: true });
      if (res.canceled) return;
      const a = res.assets?.[0];
      if (!a) return;
      if (!a.name.toLowerCase().endsWith(".xlsx")) return setError("Choose an .xlsx file.");
      if (a.size != null && a.size > LIMITS.importMaxBytes) return setError("This file is larger than 5 MB.");
      setFile(a);
    } catch (err) {
      setError(err?.message ?? "Couldn't open the file picker.");
    }
  }

  async function submit() {
    if (type === "quizzes" && !title.trim()) return setError("Enter a quiz title.");
    if (!file) return setError("Choose the filled template to upload.");
    setError(null);
    setBusy(true);
    try {
      const fields = { level, ...(type === "quizzes" ? { title: title.trim() } : {}) };
      setResult(await uploadFile(`/library/${type}/import`, { uri: file.uri, name: file.name, type: file.mimeType || XLSX, file: file.file }, { fields }));
      void qc.invalidateQueries({ queryKey: ["library"] });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const noun = type === "quizzes" ? "question" : "flashcard";

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <Header title={type === "quizzes" ? "Import a quiz from Excel" : "Import flashcards from Excel"} onBack={() => navigation.goBack()} backLabel={type === "quizzes" ? "Quizzes" : "Flashcards"} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {result ? (
          <View accessibilityLiveRegion="polite">
            {result.imported > 0 ? (
              <Notice tone="success" title={`Imported ${result.imported} ${noun}${result.imported === 1 ? "" : "s"}`}>
                {result.errors.length ? `${result.errors.length} row${result.errors.length === 1 ? " was" : "s were"} skipped. Fix them and upload those rows again.` : "Every row was imported."}
              </Notice>
            ) : (
              <Notice tone="danger" title="Nothing was imported">Every row has a problem. Fix the rows below and upload the file again.</Notice>
            )}
            {result.errors.length ? (
              <View style={[ui.panel, { marginTop: spacing.md }]}>
                <Text style={ui.label}>Rows that weren't imported</Text>
                {result.errors.map((e) => (
                  <View key={e.row} style={styles.errRow}>
                    <Text style={styles.errRowNum}>Row {e.row}</Text>
                    <Text style={[text.small, { color: colors.shu, flex: 1 }]}>{e.reason.replace(/^Row \d+: /, "")}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            <View style={styles.actions}>
              <Btn variant="secondary" label="Close" onPress={() => navigation.goBack()} style={{ flex: 1 }} />
              {result.imported && result.batchId ? (
                <Btn label="Review and add audio" onPress={() => navigation.replace("LibraryImportReview", { type, batchId: result.batchId })} style={{ flex: 1 }} />
              ) : null}
            </View>
          </View>
        ) : (
          <View>
            <View style={ui.panel}>
              <Text style={text.body}>1. Fill a sheet whose first row has these columns, one {type === "quizzes" ? "question" : "flashcard"} per row:</Text>
              <Text style={styles.columns}>{columns.join(" · ")}</Text>
              <Text style={[text.small, { marginTop: spacing.xs }]}>The library template from the web app has these columns. Up to {LIMITS.importMaxRows} rows and 5 MB.</Text>
              <Text style={[text.body, { marginTop: spacing.sm }]}>2. Upload it here. Everything is imported as a draft.</Text>
              <Text style={[text.body, { marginTop: spacing.sm }]}>3. On the review screen, add the audio files; they're matched to rows by file name.</Text>
            </View>
            {error ? <Notice tone="danger">{error}</Notice> : null}
            <View style={[ui.panel, { marginTop: spacing.md }]}>
              <Text style={ui.label}>JLPT level for every row</Text>
              <LevelSwitcher value={level} onChange={setLevel} />
              {type === "quizzes" ? <Field label="Quiz title" value={title} onChangeText={setTitle} /> : null}
              <View style={{ marginTop: spacing.md }}>
                {file ? (
                  <View style={styles.fileRow}>
                    <Text style={[text.body, { flex: 1 }]} numberOfLines={1}>{file.name}{file.size != null ? ` · ${formatBytes(file.size)}` : ""}</Text>
                    <Btn small variant="ghost" label="Remove" onPress={() => setFile(null)} disabled={busy} />
                  </View>
                ) : (
                  <Btn variant="secondary" label="Choose an .xlsx file" onPress={choose} />
                )}
              </View>
            </View>
            <View style={styles.actions}>
              <Btn variant="secondary" label="Cancel" onPress={() => navigation.goBack()} disabled={busy} style={{ flex: 1 }} />
              <Btn label="Upload" loading={busy} onPress={submit} style={{ flex: 1 }} />
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.kasumi },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  columns: { ...text.body, fontWeight: "600", marginTop: spacing.xs },
  fileRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingLeft: spacing.md },
  errRow: { flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.line },
  errRowNum: { ...text.small, fontWeight: "600", color: colors.ink, width: 64 },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
});
