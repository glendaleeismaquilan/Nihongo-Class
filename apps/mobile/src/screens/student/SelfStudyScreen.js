// FR-3.6.2 Self-Study (mirror of apps/web/src/roles/student/study/SelfStudyPage.tsx):
// built-in content for the student's level, which they can change anytime
// (saved to their profile with PATCH /me). Kana reference and the Pomodoro
// timer are mobile extras.
import { useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../components/Toast";
import { LevelPicker, LEVEL_INFO } from "../../components/LevelPicker";
import { Loading, ErrorState, EmptyState } from "../../components/QueryState";
import { colors, spacing, text } from "../../styles/theme";
import { Button, Panel, Segmented } from "./ui";
import { ItemRow } from "./ItemRow";

const TYPES = [
  { value: "flashcards", label: "Flashcards" },
  { value: "quizzes", label: "Quizzes" },
  { value: "reading-tests", label: "Reading" },
  { value: "listening-tests", label: "Listening" },
];

export function SelfStudyScreen({ navigation }) {
  const { me } = useAuth();
  const level = me?.studyLevel ?? "N5";
  const [type, setType] = useState("flashcards");
  const [picking, setPicking] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();

  async function changeLevel(l) {
    setPicking(false);
    qc.setQueryData(["me", me.uid], { ...me, studyLevel: l });
    try {
      await api("/me", { method: "PATCH", body: { studyLevel: l } });
    } catch {
      toast.error("Couldn't save your level. Try again.");
    }
    void qc.invalidateQueries({ queryKey: ["me"] });
  }

  // Pull to refresh refetches the lists on screen (errors show in their ErrorState).
  const [refreshing, setRefreshing] = useState(false);
  async function refresh() {
    setRefreshing(true);
    await qc.invalidateQueries({ queryKey: ["study"] });
    setRefreshing(false);
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}>
        <View style={styles.headRow}>
          <Text style={styles.title} accessibilityRole="header">Self-Study</Text>
          <View style={styles.extras}>
            <Pressable onPress={() => navigation.navigate("KanaReference")} style={styles.extraBtn} accessibilityRole="button" accessibilityLabel="Kana reference">
              <Text style={styles.extraText}>かな</Text>
            </Pressable>
            <Pressable onPress={() => navigation.navigate("Pomodoro")} style={styles.extraBtn} accessibilityRole="button" accessibilityLabel="Study timer">
              <Text style={styles.extraText}>🍅 Timer</Text>
            </Pressable>
          </View>
        </View>
        <Text style={[text.bodyMuted, { marginBottom: spacing.md }]}>Built-in lessons with audio, free for every student. Pick your JLPT level.</Text>

        <View style={styles.levelRow}>
          <Text style={text.body}>Study level: <Text style={{ fontWeight: "600" }}>{level}</Text></Text>
          <Button size="sm" variant="secondary" onPress={() => setPicking((v) => !v)}>{picking ? "Close" : "Change"}</Button>
        </View>
        {picking ? <View style={{ marginBottom: spacing.sm }}><LevelPicker value={level} onChange={(l) => void changeLevel(l)} /></View> : null}
        <Text style={[text.small, { marginBottom: spacing.lg }]}>{level} {LEVEL_INFO[level].name}: {LEVEL_INFO[level].description}</Text>

        <View style={{ marginBottom: spacing.md }}>
          <Segmented label="What to study" value={type} onChange={setType} options={TYPES} />
        </View>
        {type === "flashcards" ? (
          <FlashcardsSection level={level} navigation={navigation} />
        ) : (
          <ItemsSection key={`${type}-${level}`} level={level} type={type} navigation={navigation} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function FlashcardsSection({ level, navigation }) {
  const q = useQuery({
    queryKey: ["study", "flashcards", level, "first"],
    queryFn: () => api("/study/library", { query: { level, type: "flashcards" } }),
  });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={q.refetch} />;
  if (!q.data.total) return <EmptyState>No {level} flashcards yet. Try another level, or check back soon.</EmptyState>;
  return (
    <Panel level={level} style={{ padding: spacing.lg }}>
      <Text style={text.h2}>{level} flashcards</Text>
      <Text style={[text.bodyMuted, { marginTop: spacing.xs }]}>
        {q.data.total} cards with pronunciation. Flip each card to see the reading, meaning, and an example sentence.
      </Text>
      <View style={styles.deckActions}>
        <Button onPress={() => navigation.navigate("Flashcards", { level })}>Study in order</Button>
        <Button variant="secondary" onPress={() => navigation.navigate("Flashcards", { level, shuffle: true })}>Random deck</Button>
      </View>
      <View style={styles.terms} accessibilityLabel="First cards">
        {q.data.cards.slice(0, 12).map((c) => (
          <View key={c.id} style={styles.term}><Text style={styles.termText}>{c.term}</Text></View>
        ))}
      </View>
    </Panel>
  );
}

function ItemsSection({ level, type, navigation }) {
  const q = useInfiniteQuery({
    queryKey: ["study", type, level],
    queryFn: ({ pageParam }) => api("/study/library", { query: { level, type, cursor: pageParam } }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={q.refetch} />;
  const items = q.data.pages.flatMap((p) => p.items ?? []);
  const noun = TYPES.find((t) => t.value === type).label.toLowerCase();
  if (!items.length) return <EmptyState>No {level} {noun === "reading" || noun === "listening" ? `${noun} tests` : noun} yet. Try another level.</EmptyState>;
  return (
    <View>
      {items.map((i) => <ItemRow key={i.id} item={i} back="study" navigation={navigation} />)}
      {q.hasNextPage ? (
        <View style={{ marginTop: spacing.sm }}>
          <Button variant="secondary" onPress={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>Show more</Button>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.kasumi },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  headRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xs },
  title: { ...text.h1, color: colors.ai },
  extras: { flexDirection: "row", gap: 6 },
  extraBtn: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 999, minHeight: 40, justifyContent: "center", paddingHorizontal: spacing.md },
  extraText: { color: colors.ai, fontWeight: "600" },
  levelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  deckActions: { marginTop: spacing.md, gap: spacing.sm },
  terms: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.lg },
  term: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  termText: { fontSize: 18, color: colors.ink },
});
