// FR-3.6.1: the class view shows only this class's teacher content (mirror of
// apps/web/src/roles/student/ClassLessonsTab.tsx).
import { View, Text, FlatList, StyleSheet, RefreshControl } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { Loading, ErrorState, EmptyState } from "../../../components/QueryState";
import { colors, spacing, text } from "../../../styles/theme";
import { Button, Panel } from "../ui";
import { ItemRow } from "../ItemRow";

export function LessonsTab({ classId, navigation }) {
  const q = useQuery({ queryKey: ["class-study", classId], queryFn: () => api(`/classes/${classId}/study`) });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={q.refetch} />;
  if (!q.data.lessons.length) return <EmptyState>Your teacher hasn't added lessons yet.</EmptyState>;

  return (
    <FlatList
      data={q.data.lessons}
      keyExtractor={(l) => l.id}
      contentContainerStyle={{ padding: spacing.md }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} />}
      renderItem={({ item: l }) => (
        <Panel style={styles.lesson}>
          <Text style={styles.lessonTitle}>{l.title}</Text>
          {l.description ? <Text style={[text.bodyMuted, { marginTop: spacing.xs }]}>{l.description}</Text> : null}
          <View style={{ marginTop: spacing.md }}>
            {l.flashcards.length ? (
              <View style={styles.cards}>
                <Text style={text.body}>{l.flashcards.length} flashcard{l.flashcards.length === 1 ? "" : "s"}</Text>
                <Button size="sm" onPress={() => navigation.navigate("Flashcards", { classId, lessonId: l.id })}>Study flashcards</Button>
              </View>
            ) : null}
            {l.quizzes.map((qz) => <ItemRow key={qz.id} item={qz} back="class" navigation={navigation} />)}
            {!l.flashcards.length && !l.quizzes.length ? <Text style={text.bodyMuted}>Nothing in this lesson yet.</Text> : null}
          </View>
        </Panel>
      )}
    />
  );
}

const styles = StyleSheet.create({
  lesson: { marginBottom: spacing.md, padding: spacing.lg },
  lessonTitle: { ...text.h2, fontSize: 18 },
  cards: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: spacing.sm, borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm },
});
