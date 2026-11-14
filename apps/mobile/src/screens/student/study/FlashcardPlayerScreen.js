// §7.6 flashcards (mirror of apps/web/src/roles/student/study/DeckPages.tsx and
// FlashcardPlayer.tsx). Two decks:
//   { level, shuffle? }       — Self-Study: pages of 50 load as the student nears the end.
//   { classId, lessonId }     — a class lesson's teacher cards (text only, no audio).
// Tap flips; Previous / Next / Shuffle move through the deck (swipe left/right too).
import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, Pressable, PanResponder, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { JLPT_LEVELS } from "../../../shared/constants";
import { ListenButton, useClip } from "../../../components/audio";
import { Loading, ErrorState, EmptyState } from "../../../components/QueryState";
import { colors, spacing, text } from "../../../styles/theme";
import { Button } from "../ui";

export function FlashcardPlayerScreen({ route, navigation }) {
  return route.params?.classId ? <ClassDeck {...route.params} navigation={navigation} /> : <LibraryDeck {...route.params} navigation={navigation} />;
}

function LibraryDeck({ level: levelParam, shuffle, navigation }) {
  const level = JLPT_LEVELS.includes(levelParam) ? levelParam : "N5";
  const [progress, setProgress] = useState({ current: 1, total: 0 });
  const q = useInfiniteQuery({
    queryKey: ["study", "deck", level, !!shuffle],
    // The API takes shuffle=true|false (studyLibraryQuerySchema), like the web's `shuffle || undefined`.
    queryFn: ({ pageParam }) => api("/study/library", { query: { level, type: "flashcards", cursor: pageParam, shuffle: shuffle ? true : undefined } }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: Infinity,
  });
  const onIndex = useCallback((current, total) => setProgress({ current, total }), []);
  const cards = q.data?.pages.flatMap((p) => p.cards ?? []) ?? [];
  const total = shuffle ? cards.length : (q.data?.pages[0]?.total ?? cards.length);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;
  const more = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <Shell title={`${level} flashcards${shuffle ? ", random deck" : ""}`} progress={cards.length ? `Card ${progress.current} of ${total}` : null} navigation={navigation}>
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} retry={q.refetch} /> : <FlashcardPlayer cards={cards} onIndexChange={onIndex} onNeedMore={more} />}
    </Shell>
  );
}

function ClassDeck({ classId, lessonId, navigation }) {
  const [progress, setProgress] = useState({ current: 1, total: 0 });
  const q = useQuery({ queryKey: ["class-study", classId], queryFn: () => api(`/classes/${classId}/study`) });
  const lesson = q.data?.lessons.find((l) => l.id === lessonId);
  const onIndex = useCallback((current, total) => setProgress({ current, total }), []);
  return (
    <Shell title={lesson?.title ?? "Flashcards"} progress={lesson?.flashcards.length ? `Card ${progress.current} of ${progress.total}` : null} navigation={navigation}>
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} retry={q.refetch} /> : <FlashcardPlayer cards={lesson?.flashcards ?? []} onIndexChange={onIndex} />}
    </Shell>
  );
}

function Shell({ title, progress, navigation, children }) {
  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityRole="button" style={styles.back}><Text style={styles.backText}>✕ Exit</Text></Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        {progress ? <Text style={text.small}>{progress}</Text> : null}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </SafeAreaView>
  );
}

function shuffled(xs) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function FlashcardPlayer({ cards, onIndexChange, onNeedMore }) {
  const [order, setOrder] = useState(cards);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  // The card's clip loads as soon as the card shows, so Listen plays at once after the flip.
  const clip = useClip(order[index]?.audioUrl ?? null);

  // More cards appended to `cards` (next page) are added at the end of the deck.
  // Same state back when nothing is new, so a re-render with an equal list is a no-op.
  useEffect(() => {
    setOrder((prev) => {
      const add = cards.filter((c) => !prev.some((p) => p.id === c.id));
      return add.length ? [...prev, ...add] : prev;
    });
  }, [cards]);

  useEffect(() => {
    onIndexChange?.(index + 1, order.length);
  }, [index, order.length, onIndexChange]);

  const go = useCallback(
    (d) => {
      const next = Math.min(Math.max(index + d, 0), Math.max(order.length - 1, 0));
      setFlipped(false);
      setIndex(next);
      if (next >= order.length - 3) onNeedMore?.();
    },
    [index, order.length, onNeedMore],
  );
  const goRef = useRef(go);
  goRef.current = go;
  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderRelease: (_e, g) => {
        if (g.dx < -60) goRef.current(1);
        else if (g.dx > 60) goRef.current(-1);
      },
    }),
  ).current;

  if (!order.length) return <EmptyState>No flashcards here yet.</EmptyState>;
  const card = order[index];

  return (
    <View style={styles.player}>
      <View style={{ flex: 1 }} {...swipe.panHandlers}>
        <Pressable
          style={styles.card}
          onPress={() => setFlipped((f) => !f)}
          accessibilityRole="button"
          accessibilityLabel={flipped ? `${card.term}, ${card.reading}, ${card.meaning}` : `Card ${index + 1} of ${order.length}: ${card.term}. Press to flip.`}
        >
          {!flipped ? (
            <>
              <Text style={styles.term}>{card.term}</Text>
              <Text style={styles.hint}>Tap to flip</Text>
            </>
          ) : (
            <>
              <Text style={styles.backTerm}>{card.term}</Text>
              {card.reading !== card.term ? <Text style={styles.reading}>{card.reading}</Text> : null}
              <Text style={styles.meaning}>{card.meaning}</Text>
              {card.exampleSentence ? <Text style={styles.example}>{card.exampleSentence}</Text> : null}
              {card.audioUrl ? (
                <View style={{ marginTop: spacing.lg }}>
                  <ListenButton clip={clip} label={`Play pronunciation of ${card.term}`} />
                </View>
              ) : null}
            </>
          )}
        </Pressable>
      </View>
      <View style={styles.controls}>
        <Button variant="secondary" onPress={() => go(-1)} disabled={index === 0}>‹ Previous</Button>
        <Button variant="secondary" onPress={() => go(1)} disabled={index >= order.length - 1}>Next ›</Button>
        <Button
          variant="ghost"
          onPress={() => {
            setOrder((o) => shuffled(o));
            setIndex(0);
            setFlipped(false);
          }}
        >
          Shuffle
        </Button>
      </View>
      <Text style={[text.small, { textAlign: "center" }]}>Swipe left or right to move between cards.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.kasumi },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, backgroundColor: colors.paper, borderBottomWidth: 1, borderBottomColor: colors.line },
  back: { minHeight: 40, justifyContent: "center" },
  backText: { color: colors.ai, fontSize: 15 },
  headerTitle: { ...text.body, fontWeight: "600" },
  player: { flex: 1, padding: spacing.lg, gap: spacing.md },
  card: { flex: 1, backgroundColor: colors.paper, borderRadius: 16, borderWidth: 1, borderColor: colors.line, alignItems: "center", justifyContent: "center", padding: spacing.xl, minHeight: 300, shadowColor: "#1c2433", shadowOpacity: 0.12, shadowRadius: 10, elevation: 3 },
  term: { fontSize: 56, color: colors.ink, textAlign: "center" },
  hint: { position: "absolute", bottom: spacing.lg, ...text.small },
  backTerm: { fontSize: 44, color: colors.ink, textAlign: "center" },
  reading: { fontSize: 20, color: colors.ink2, marginTop: spacing.xs, textAlign: "center" },
  meaning: { fontSize: 22, color: colors.ink, marginTop: spacing.md, textAlign: "center" },
  example: { fontSize: 18, color: colors.ink2, marginTop: spacing.md, textAlign: "center" },
  controls: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.sm },
});
