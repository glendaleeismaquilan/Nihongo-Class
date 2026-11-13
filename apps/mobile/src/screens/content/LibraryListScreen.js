// One built-in library type (mirror of apps/web/src/roles/content/LibraryListPage.tsx):
// level + status filters, paged list, publish/unpublish, delete, and for
// flashcards and quizzes "Enter manually" or "Upload Excel".
import { useEffect, useState } from "react";
import { View, Text, FlatList, Pressable, RefreshControl, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "../../lib/api";
import { formatDate } from "../../lib/format";
import { JLPT_LEVELS } from "../../shared/constants";
import { useToast } from "../../components/Toast";
import { Loading, ErrorState, EmptyState } from "../../components/QueryState";
import { EDITOR_ROUTE, TYPE_LABEL } from "./libraryApi";
import { openClip } from "./AudioField";
import { Badge, Btn, Dialog, Header, LevelSwitcher, Segmented, s as ui } from "./ui";
import { colors, spacing, text } from "../../styles/theme";

function titleOf(type, item) {
  return type === "flashcards" ? item.term : item.title;
}

function audioSummary(type, item) {
  if (type === "flashcards") return item.audioUrl ? "Audio" : item.expectedAudioName ? `Needs ${item.expectedAudioName}` : "No audio";
  if (type === "quizzes") return `${item.questions.filter((q) => q.audioUrl).length} of ${item.questions.length} with answer audio`;
  if (type === "listening-tests") return item.audioUrl ? "Clip attached" : "Needs a clip";
  return `${item.questions.length} questions`;
}

export function LibraryListScreen({ route, navigation }) {
  const type = route.params?.type ?? "flashcards";
  const [level, setLevel] = useState(JLPT_LEVELS.includes(route.params?.level) ? route.params.level : "N5");
  const [status, setStatus] = useState("all");
  const [deleting, setDeleting] = useState(null);
  const qc = useQueryClient();
  const toast = useToast();
  const label = TYPE_LABEL[type];

  // Opening the list again from the overview with another level switches to it.
  useEffect(() => {
    if (JLPT_LEVELS.includes(route.params?.level)) setLevel(route.params.level);
  }, [route.params?.level]);

  const q = useInfiniteQuery({
    queryKey: ["library", type, "list", level, status],
    queryFn: ({ pageParam }) => api(`/library/${type}`, { query: { level, status: status === "all" ? undefined : status, cursor: pageParam } }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const publish = useMutation({
    mutationFn: ({ id, next }) => api(`/library/${type}/${id}/publish`, { body: { status: next } }),
    onSuccess: (_d, v) => {
      toast.success(v.next === "published" ? "Published" : "Moved to drafts");
      void qc.invalidateQueries({ queryKey: ["library", type] });
      void qc.invalidateQueries({ queryKey: ["library", "overview"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const del = useMutation({
    mutationFn: (id) => api(`/library/${type}/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setDeleting(null);
      toast.success("Deleted");
      void qc.invalidateQueries({ queryKey: ["library"] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const importable = type === "flashcards" || type === "quizzes";
  const openEditor = (id) => navigation.navigate(EDITOR_ROUTE[type], { id, level });

  const header = (
    <View>
      <Header
        title={label.plural}
        onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
        backLabel="Library"
        right={!importable ? <Btn small label={`New ${label.singular}`} onPress={() => openEditor(undefined)} /> : null}
      />
      <View style={{ paddingHorizontal: spacing.lg }}>
        <Text style={[text.small, { marginBottom: spacing.md }]}>Built-in {label.plural.toLowerCase()} for Self-Study. Students see published items only.</Text>
        {importable ? (
          <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
            <Pressable style={styles.choice} onPress={() => openEditor(undefined)} accessibilityRole="button">
              <Text style={styles.choiceTitle}>Enter manually</Text>
              <Text style={text.small}>Create one {label.singular} with its audio.</Text>
            </Pressable>
            <Pressable style={styles.choice} onPress={() => navigation.navigate("LibraryImport", { type, level })} accessibilityRole="button">
              <Text style={styles.choiceTitle}>Upload Excel</Text>
              <Text style={text.small}>Import rows as drafts, then match the audio files.</Text>
            </Pressable>
          </View>
        ) : null}
        <LevelSwitcher value={level} onChange={setLevel} />
        <View style={{ marginTop: spacing.md, marginBottom: spacing.sm }}>
          <Segmented
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: "All" },
              { value: "draft", label: "Drafts" },
              { value: "published", label: "Published" },
            ]}
          />
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <FlatList
        data={q.isSuccess ? items : []}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={q.refetch} />}
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        ListEmptyComponent={
          q.isPending ? (
            <Loading />
          ) : q.isError ? (
            <ErrorState error={q.error} retry={q.refetch} />
          ) : (
            <EmptyState>
              No {status === "all" ? "" : `${status} `}
              {label.plural.toLowerCase()} for {level} yet.
            </EmptyState>
          )
        }
        renderItem={({ item }) => (
          <View style={[ui.panel, { marginHorizontal: spacing.lg }]}>
            <Pressable onPress={() => openEditor(item.id)} accessibilityRole="link" accessibilityLabel={`Edit ${titleOf(type, item)}`}>
              <Text style={[styles.itemTitle, type === "flashcards" && styles.itemTitleJa]}>{titleOf(type, item)}</Text>
            </Pressable>
            <Text style={text.small}>{type === "flashcards" ? item.meaning : `${item.questions.length} question${item.questions.length === 1 ? "" : "s"}`}</Text>
            <View style={styles.metaRow}>
              {item.status === "published" ? <Badge tone="success">Published</Badge> : <Badge>Draft</Badge>}
              {type === "flashcards" && item.audioUrl ? (
                <Btn small variant="secondary" label="Listen" accessibilityLabel={`Play pronunciation of ${item.term}`} onPress={() => openClip(item.audioUrl).catch((e) => toast.error(e?.message ?? "Couldn't play the clip."))} />
              ) : (
                <Text style={text.small}>{audioSummary(type, item)}</Text>
              )}
              <Text style={text.small}>Updated {formatDate(item.updatedAt)}</Text>
            </View>
            <View style={styles.actions}>
              <Btn
                small
                variant="ghost"
                label={item.status === "published" ? "Unpublish" : "Publish"}
                loading={publish.isPending && publish.variables?.id === item.id}
                onPress={() => publish.mutate({ id: item.id, next: item.status === "published" ? "draft" : "published" })}
              />
              <Btn small variant="dangerGhost" label="Delete" onPress={() => setDeleting(item)} />
            </View>
          </View>
        )}
        ListFooterComponent={
          q.hasNextPage ? (
            <Btn variant="secondary" label="Show more" loading={q.isFetchingNextPage} onPress={() => q.fetchNextPage()} style={{ marginHorizontal: spacing.lg }} />
          ) : null
        }
      />
      <Dialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete this ${label.singular}?`}
        footer={
          <>
            <Btn variant="secondary" label="Cancel" onPress={() => setDeleting(null)} />
            <Btn variant="danger" label="Delete" loading={del.isPending} onPress={() => deleting && del.mutate(deleting.id)} />
          </>
        }
      >
        <Text style={text.body}>Its audio is deleted too. Students' past scores stay in their history.</Text>
      </Dialog>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.kasumi },
  choice: { minHeight: 56, borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper, padding: spacing.md },
  choiceTitle: { ...text.body, fontWeight: "600" },
  itemTitle: { ...text.body, fontWeight: "600", color: colors.ai, textDecorationLine: "underline" },
  itemTitleJa: { fontSize: 20 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: spacing.sm, marginTop: spacing.xs },
});
