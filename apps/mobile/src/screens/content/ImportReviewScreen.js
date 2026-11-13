// FR-3.5.3 review screen (mirror of apps/web/src/roles/content/ImportReviewPage.tsx):
// choose many audio files, match them to the imported rows by file name
// (ignoring case), attach the matches, then publish the whole batch. The web
// page takes dropped files; the phone picks several files at once.
import { useMemo, useState } from "react";
import { View, Text, FlatList, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage, uploadFile } from "../../lib/api";
import { useToast } from "../../components/Toast";
import { Loading, ErrorState } from "../../components/QueryState";
import { matchAudio } from "./matchAudio";
import { pickAudioFiles } from "./AudioField";
import { Badge, Btn, Header, Notice, s as ui } from "./ui";
import { colors, spacing, text } from "../../styles/theme";

export function ImportReviewScreen({ route, navigation }) {
  const type = route.params?.type === "quizzes" ? "quizzes" : "flashcards";
  const batchId = route.params?.batchId ?? "";
  const qc = useQueryClient();
  const toast = useToast();
  const [files, setFiles] = useState([]);
  const [problems, setProblems] = useState([]);
  const [rowState, setRowState] = useState({});
  const [busy, setBusy] = useState(false);

  const q = useQuery({
    queryKey: ["library", type, "batch", batchId],
    queryFn: () => api(`/library/${type}`, { query: { batch: batchId } }),
  });

  const targets = useMemo(() => {
    const items = q.data?.items ?? [];
    if (type === "flashcards") {
      return items.map((c) => ({ key: c.id, itemId: c.id, label: c.term, expected: c.expectedAudioName ?? null, hasAudio: !!c.audioUrl, status: c.status }));
    }
    return items.flatMap((quiz) =>
      quiz.questions.map((qq, i) => ({ key: `${quiz.id}:${i}`, itemId: quiz.id, questionIndex: i, label: qq.text, expected: qq.expectedAudioName ?? null, hasAudio: !!qq.audioUrl, status: quiz.status })),
    );
  }, [q.data, type]);

  const match = matchAudio(targets, files);
  const drafts = (q.data?.items ?? []).filter((i) => i.status === "draft").length;

  const publishAll = useMutation({
    mutationFn: () => api(`/library/${type}/batch/${batchId}/publish`, { method: "POST" }),
    onSuccess: (r) => {
      toast.success(`Published ${r.published}`);
      void qc.invalidateQueries({ queryKey: ["library"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  async function addFiles() {
    try {
      const picked = await pickAudioFiles({ multiple: true });
      setProblems(picked.problems);
      if (picked.files.length) setFiles((prev) => [...prev, ...picked.files]);
    } catch (err) {
      setProblems([err?.message ?? "Couldn't open the file picker."]);
    }
  }

  async function uploadMatched() {
    setBusy(true);
    for (const { target, file } of match.matched) {
      const t = targets.find((x) => x.key === target.key);
      setRowState((st) => ({ ...st, [t.key]: { state: "uploading" } }));
      try {
        await uploadFile(`/library/${type}/${t.itemId}/audio`, { uri: file.uri, name: file.name, type: file.mimeType, file: file.file }, {
          fields: { ...(t.questionIndex !== undefined ? { questionIndex: String(t.questionIndex) } : {}), fileName: file.name, mimeType: file.mimeType },
        });
        setRowState((st) => ({ ...st, [t.key]: { state: "done" } }));
      } catch (err) {
        setRowState((st) => ({ ...st, [t.key]: { state: "error", message: errorMessage(err) } }));
      }
    }
    setFiles((fs) => fs.filter((f) => !match.matched.some((m) => m.file === f)));
    await qc.invalidateQueries({ queryKey: ["library", type, "batch", batchId] });
    setBusy(false);
  }

  if (q.isPending) return <SafeAreaView style={styles.root}><Loading /></SafeAreaView>;
  if (q.isError) return <SafeAreaView style={styles.root}><ErrorState error={q.error} retry={q.refetch} /></SafeAreaView>;

  const header = (
    <View>
      <Header
        title="Review import"
        onBack={() => navigation.goBack()}
        backLabel={type === "quizzes" ? "Quizzes" : "Flashcards"}
        right={drafts ? <Btn small label={`Publish all ${drafts}`} loading={publishAll.isPending} onPress={() => publishAll.mutate()} /> : <Badge tone="success">Published</Badge>}
      />
      <View style={{ paddingHorizontal: spacing.lg }}>
        <Text style={[text.small, { marginBottom: spacing.md }]}>
          Add the audio files named in the Audio File Name column. They're matched to rows by file name, ignoring upper and lower case.
        </Text>
        <View style={ui.panel}>
          <Btn variant="secondary" label="Choose audio files" onPress={addFiles} disabled={busy} />
          <Text style={[text.small, { marginTop: spacing.xs }]}>Pick many files at once. MP3, M4A, WAV, OGG, or WebM, up to 10 MB each.</Text>
          {problems.length ? <Notice tone="danger">{problems.join(" ")}</Notice> : null}
          <Text style={[ui.label, { marginTop: spacing.md }]}>Matching</Text>
          <Text style={text.body}>
            {match.matched.length} matched, {match.unmatchedTargets.length} rows still missing a file.
          </Text>
          {match.unmatchedFiles.length ? (
            <Notice tone="danger" title="Files that match no row">
              <View>
                {match.unmatchedFiles.map((f) => (
                  <Text key={f.name} style={{ color: colors.shu }}>• {f.name}</Text>
                ))}
              </View>
            </Notice>
          ) : null}
          {match.unmatchedTargets.length ? (
            <View style={{ marginTop: spacing.sm }}>
              <Text style={[text.small, { fontWeight: "600", color: colors.ink }]}>Rows without a file</Text>
              {match.unmatchedTargets.map((t) => (
                <Text key={t.key} style={text.small}>• {t.label}: {t.expected}</Text>
              ))}
            </View>
          ) : null}
          <Btn
            label={`Attach ${match.matched.length} matched file${match.matched.length === 1 ? "" : "s"}`}
            disabled={!match.matched.length}
            loading={busy}
            onPress={uploadMatched}
            style={{ marginTop: spacing.md }}
          />
        </View>
        <Text style={[ui.label, { marginTop: spacing.sm }]}>Imported rows</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <FlatList
        data={targets}
        keyExtractor={(t) => t.key}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        renderItem={({ item: t }) => {
          const m = match.matched.find((x) => x.target.key === t.key);
          const rs = rowState[t.key];
          return (
            <View style={[styles.row, { marginHorizontal: spacing.lg }]}>
              <Text style={[text.body, { fontWeight: "600" }]}>{t.label}</Text>
              <Text style={text.small}>{t.expected ?? "None"}</Text>
              <View style={{ marginTop: spacing.xs }}>
                {rs?.state === "uploading" ? (
                  <Text style={text.small} accessibilityRole="progressbar">Uploading…</Text>
                ) : rs?.state === "error" ? (
                  <Text style={{ color: colors.shu }}>{rs.message}</Text>
                ) : t.hasAudio || rs?.state === "done" ? (
                  <Badge tone="success">Attached</Badge>
                ) : m ? (
                  <Badge tone="info">Matched {m.file.name}</Badge>
                ) : t.expected ? (
                  <Badge tone="danger">No file yet</Badge>
                ) : (
                  <Text style={text.small}>Not needed</Text>
                )}
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.kasumi },
  row: { backgroundColor: colors.paper, borderRadius: 10, borderWidth: 1, borderColor: colors.line, padding: spacing.md, marginBottom: spacing.xs },
});
