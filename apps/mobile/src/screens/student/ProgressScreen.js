// FR-3.9.2 progress (mirror of apps/web/src/roles/student/ProgressPage.tsx):
// streak, average score and the full attempt history, filterable by type and
// paged with "Show older attempts". The type lives in the route params, like
// the web's ?type= search param.
// Mobile extra: under "All", the 35-day study heatmap, shown once the loaded
// history reaches back over the whole window (so it never shows a gap that is
// only an unloaded page).
import { View, Text, FlatList, RefreshControl, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { Loading, ErrorState, EmptyState } from "../../components/QueryState";
import { StreakHeatmap, heatmapStart } from "../../components/StreakHeatmap";
import { colors, spacing, text } from "../../styles/theme";
import { Badge, Button, Panel, Segmented, StatTile } from "./ui";

const TYPE_LABEL = { quiz: "Quiz", reading: "Reading", listening: "Listening" };

export function ProgressScreen({ route, navigation }) {
  const param = route.params?.type;
  const type = ["quiz", "reading", "listening"].includes(param) ? param : "all";
  const q = useInfiniteQuery({
    queryKey: ["progress", type],
    queryFn: ({ pageParam }) => api("/progress/me", { query: { type: type === "all" ? undefined : type, cursor: pageParam } }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const first = q.data?.pages[0];
  const history = q.data?.pages.flatMap((p) => p.history) ?? [];
  const oldest = history.length ? new Date(history[history.length - 1].submittedAt) : null;
  const heatmapComplete = !q.hasNextPage || (oldest !== null && oldest < heatmapStart());

  const header = <Text style={styles.title} accessibilityRole="header">Progress</Text>;

  if (q.isPending) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.pad}>{header}</View>
        <Loading />
      </SafeAreaView>
    );
  }
  if (q.isError) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        <View style={styles.pad}>{header}</View>
        <ErrorState error={q.error} retry={() => q.refetch()} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <FlatList
        data={history}
        keyExtractor={(h) => h.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={() => q.refetch()} />}
        ListHeaderComponent={
          <View>
            {header}
            <View style={styles.stats}>
              <StatTile label="Study streak" value={`${first.streak} day${first.streak === 1 ? "" : "s"}`} hint="Days in a row with a graded quiz or test" />
              <StatTile label={type === "all" ? "Average score" : `Average ${TYPE_LABEL[type].toLowerCase()} score`} value={first.averageScore === null ? "No scores yet" : `${first.averageScore}%`} />
              <StatTile label="Attempts" value={String(first.attemptCount)} />
            </View>
            <View style={styles.filter}>
              <Segmented
                label="Activity type"
                value={type}
                onChange={(v) => navigation.setParams({ type: v === "all" ? undefined : v })}
                options={[
                  { value: "all", label: "All" },
                  { value: "quiz", label: "Quizzes" },
                  { value: "reading", label: "Reading" },
                  { value: "listening", label: "Listening" },
                ]}
              />
            </View>
            {type === "all" && history.length > 0 && heatmapComplete ? <StreakHeatmap attempts={history} /> : null}
          </View>
        }
        ListEmptyComponent={<EmptyState>No attempts yet. Take a quiz or test, and your scores will show up here.</EmptyState>}
        renderItem={({ item: h }) => (
          <Panel style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{h.title}</Text>
              <Text style={text.small}>{TYPE_LABEL[h.activityType]}</Text>
              <Text style={text.small}>{formatDateTime(h.submittedAt)}</Text>
            </View>
            <View style={styles.scoreCol}>
              <Text style={styles.score}>
                {h.correctCount} / {h.total} ({h.score}%)
              </Text>
              {h.passed ? <Badge tone="success">Passed</Badge> : <Badge>Not yet</Badge>}
            </View>
          </Panel>
        )}
        ListFooterComponent={
          q.hasNextPage ? (
            <View style={styles.more}>
              <Button variant="secondary" onPress={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>
                Show older attempts
              </Button>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.kasumi },
  pad: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  list: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { ...text.h1, color: colors.ai, marginBottom: spacing.md },
  stats: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  filter: { marginBottom: spacing.md },
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, marginBottom: spacing.sm },
  rowTitle: { ...text.body, fontWeight: "600", marginBottom: 2 },
  scoreCol: { alignItems: "flex-end", gap: spacing.xs },
  score: { ...text.body, fontWeight: "600" },
  more: { marginTop: spacing.sm, alignItems: "flex-start" },
});
