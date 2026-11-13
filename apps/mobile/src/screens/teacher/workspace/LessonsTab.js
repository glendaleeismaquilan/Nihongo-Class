// Lessons in order, with move up / move down and Add lesson — web: LessonsTab
// in features/classes/LessonsTab.tsx. The web page shows the selected lesson's
// flashcards and quizzes beside the list; on a phone a lesson opens its own
// screen (LessonDetail) with the same content.
import { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "../../../lib/api";
import { Loading, ErrorState, EmptyState } from "../../../components/QueryState";
import { useToast } from "../../../components/Toast";
import { classKeys, plural, useLessons } from "../classHooks";
import { Button, SectionTitle } from "../ui";
import { LessonDialog } from "./LessonDialog";
import { colors, spacing, text } from "../../../styles/theme";

export function LessonsTab({ cls, readOnly, navigation }) {
  const lessons = useLessons(cls.id);
  const [adding, setAdding] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const open = (lessonId) => navigation.navigate("LessonDetail", { classId: cls.id, lessonId });

  const reorder = useMutation({
    mutationFn: ({ id, order }) => api(`/lessons/${id}`, { method: "PATCH", body: { order } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: classKeys.lessons(cls.id) }),
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (lessons.isPending) return <Loading />;
  if (lessons.isError) return <ErrorState error={lessons.error} retry={() => lessons.refetch()} />;
  const items = lessons.data;

  return (
    <View>
      <SectionTitle right={!readOnly ? <Button small variant="secondary" onPress={() => setAdding(true)}>+ Add lesson</Button> : null}>Lessons</SectionTitle>
      {items.length === 0 ? (
        <EmptyState action={!readOnly ? <Button onPress={() => setAdding(true)}>Add lesson</Button> : null}>
          No lessons yet. Add a lesson, then put flashcards and quizzes in it.
        </EmptyState>
      ) : (
        <View style={s.list}>
          {items.map((l, i) => (
            <View key={l.id} style={[s.row, i > 0 && s.divider]}>
              <Pressable style={s.main} onPress={() => open(l.id)} accessibilityRole="button" accessibilityHint="Opens the lesson's flashcards and quizzes">
                <Text style={s.title}>{l.title}</Text>
                <Text style={text.small}>
                  {plural(l.counts?.flashcards ?? 0, "flashcard")}, {plural(l.counts?.quizzes ?? 0, "quiz", "quizzes")}
                </Text>
              </Pressable>
              {!readOnly ? (
                <View style={s.moves}>
                  <MoveButton label={`Move ${l.title} up`} glyph="↑" disabled={i === 0 || reorder.isPending} onPress={() => reorder.mutate({ id: l.id, order: i - 1 })} />
                  <MoveButton label={`Move ${l.title} down`} glyph="↓" disabled={i === items.length - 1 || reorder.isPending} onPress={() => reorder.mutate({ id: l.id, order: i + 1 })} />
                </View>
              ) : null}
              <Text style={s.chev}>›</Text>
            </View>
          ))}
        </View>
      )}
      {adding ? (
        <LessonDialog
          classId={cls.id}
          onClose={(created) => {
            setAdding(false);
            if (created) open(created.id);
          }}
        />
      ) : null}
    </View>
  );
}

function MoveButton({ label, glyph, disabled, onPress }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} style={[s.move, disabled && { opacity: 0.3 }]} hitSlop={4}>
      <Text style={s.moveText}>{glyph}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  list: { backgroundColor: colors.paper, borderRadius: 12, borderWidth: 1, borderColor: colors.line },
  row: { flexDirection: "row", alignItems: "center", paddingLeft: spacing.md, paddingRight: spacing.sm },
  divider: { borderTopWidth: 1, borderTopColor: colors.line },
  main: { flex: 1, paddingVertical: spacing.md, minHeight: 56, justifyContent: "center" },
  title: { ...text.body, fontWeight: "600" },
  moves: { flexDirection: "row" },
  move: { width: 40, height: 44, alignItems: "center", justifyContent: "center" },
  moveText: { fontSize: 20, color: colors.ai, fontWeight: "700" },
  chev: { fontSize: 22, color: colors.ink2, paddingHorizontal: spacing.xs },
});
