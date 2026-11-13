// One lesson's flashcards and quizzes — web: LessonContent in
// features/classes/LessonsTab.tsx (the right-hand pane of "Lessons and content").
// Rename or delete the lesson; add flashcards and quizzes by hand or from Excel;
// edit or delete each one. Route params: { classId, lessonId }.
import { useState } from "react";
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "../../lib/api";
import { Loading, ErrorState, EmptyState } from "../../components/QueryState";
import { useToast } from "../../components/Toast";
import { classKeys, isReadOnly, useClass, useFlashcards, useLessons, useQuizzes } from "./classHooks";
import { Button, ConfirmDialog, Header, SectionTitle, ui } from "./ui";
import { LessonDialog } from "./workspace/LessonDialog";
import { colors, spacing, text } from "../../styles/theme";

/** SRS 5.3: "Enter manually" and "Upload Excel" as two labeled options. */
function CreateOptions({ manualHint, excelHint, onManual, onExcel }) {
  return (
    <View style={s.options}>
      <Pressable style={s.option} onPress={onManual} accessibilityRole="button">
        <Text style={s.optionIcon}>✎</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.optionTitle}>Enter manually</Text>
          <Text style={text.small}>{manualHint}</Text>
        </View>
      </Pressable>
      <Pressable style={s.option} onPress={onExcel} accessibilityRole="button">
        <Text style={s.optionIcon}>⇪</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.optionTitle}>Upload Excel</Text>
          <Text style={text.small}>{excelHint}</Text>
        </View>
      </Pressable>
    </View>
  );
}

export function LessonDetailScreen({ route, navigation }) {
  const { classId, lessonId } = route.params ?? {};
  const cls = useClass(classId);
  const lessons = useLessons(classId);
  const cards = useFlashcards(classId, lessonId);
  const quizzes = useQuizzes(classId, lessonId);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();

  const del = useMutation({
    mutationFn: () => api(`/lessons/${lessonId}`, { method: "DELETE" }),
    onSuccess: () => {
      setDeleting(false);
      toast.success("Lesson deleted");
      void qc.invalidateQueries({ queryKey: classKeys.lessons(classId) });
      navigation.goBack();
    },
    onError: (err) => {
      setDeleting(false);
      toast.error(errorMessage(err));
    },
  });
  const remove = useMutation({
    mutationFn: (r) => api(`/${r.kind === "quiz" ? "quizzes" : "flashcards"}/${r.item.id}`, { method: "DELETE" }),
    onSuccess: () => {
      setRemoving(null);
      toast.success("Deleted");
      void qc.invalidateQueries({ queryKey: ["class", classId] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  async function refresh() {
    setRefreshing(true);
    try {
      await qc.invalidateQueries({ queryKey: ["class", classId] });
    } finally {
      setRefreshing(false);
    }
  }

  const back = () => navigation.goBack();
  if (cls.isPending || lessons.isPending) {
    return (
      <SafeAreaView style={ui.root} edges={["top"]}>
        <Header onBack={back} backLabel="Lessons and content" />
        <Loading />
      </SafeAreaView>
    );
  }
  if (cls.isError || lessons.isError) {
    const failed = cls.isError ? cls : lessons;
    return (
      <SafeAreaView style={ui.root} edges={["top"]}>
        <Header onBack={back} backLabel="Lessons and content" />
        <ErrorState error={failed.error} retry={() => failed.refetch()} />
      </SafeAreaView>
    );
  }
  const lesson = lessons.data.find((l) => l.id === lessonId);
  if (!lesson) {
    return (
      <SafeAreaView style={ui.root} edges={["top"]}>
        <Header onBack={back} backLabel="Lessons and content" />
        <EmptyState action={<Button onPress={back}>Back to lessons</Button>}>This lesson isn't in the class anymore.</EmptyState>
      </SafeAreaView>
    );
  }
  const readOnly = isReadOnly(cls.data);

  return (
    <SafeAreaView style={ui.root} edges={["top"]}>
      <Header
        onBack={back}
        backLabel="Lessons and content"
        title={lesson.title}
        subtitle={lesson.description || undefined}
        right={
          !readOnly ? (
            <View style={ui.row}>
              <Button small variant="ghost" onPress={() => setRenaming(true)}>Rename</Button>
              <Button small variant="dangerGhost" onPress={() => setDeleting(true)}>Delete</Button>
            </View>
          ) : null
        }
      />
      <ScrollView contentContainerStyle={ui.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <SectionTitle>Flashcards{cards.data ? ` (${cards.data.length})` : ""}</SectionTitle>
        {!readOnly ? (
          <CreateOptions
            manualHint="Type flashcards one at a time."
            excelHint="Fill the template and import many flashcards at once."
            onManual={() => navigation.navigate("FlashcardEditor", { classId, lessonId })}
            onExcel={() => navigation.navigate("ContentImport", { classId, lessonId, kind: "flashcards" })}
          />
        ) : null}
        {cards.isPending ? (
          <Loading />
        ) : cards.isError ? (
          <ErrorState error={cards.error} retry={() => cards.refetch()} />
        ) : cards.data.length === 0 ? (
          <EmptyState>No flashcards in this lesson yet.</EmptyState>
        ) : (
          cards.data.map((c) => (
            <View key={c.id} style={ui.card}>
              <Text style={s.term}>{c.term}</Text>
              <Text style={text.body}>{c.reading}</Text>
              <Text style={text.body}>{c.meaning}</Text>
              {c.exampleSentence ? <Text style={[text.small, { marginTop: 2 }]}>{c.exampleSentence}</Text> : null}
              {!readOnly ? (
                <View style={[ui.rowWrap, { marginTop: spacing.xs }]}>
                  <Button small variant="ghost" onPress={() => navigation.navigate("FlashcardEditor", { classId, lessonId, card: c })}>Edit</Button>
                  <Button small variant="dangerGhost" onPress={() => setRemoving({ kind: "flashcard", item: c })}>Delete</Button>
                </View>
              ) : null}
            </View>
          ))
        )}

        <SectionTitle>Quizzes{quizzes.data ? ` (${quizzes.data.length})` : ""}</SectionTitle>
        {!readOnly ? (
          <CreateOptions
            manualHint="Write the questions and mark each correct choice."
            excelHint="Fill the template; one file makes one quiz."
            onManual={() => navigation.navigate("QuizEditor", { classId, lessonId })}
            onExcel={() => navigation.navigate("ContentImport", { classId, lessonId, kind: "quiz" })}
          />
        ) : null}
        {quizzes.isPending ? (
          <Loading />
        ) : quizzes.isError ? (
          <ErrorState error={quizzes.error} retry={() => quizzes.refetch()} />
        ) : quizzes.data.length === 0 ? (
          <EmptyState>No quizzes in this lesson yet.</EmptyState>
        ) : (
          quizzes.data.map((qz) => (
            <View key={qz.id} style={ui.card}>
              {readOnly ? (
                <Text style={ui.cardTitle}>{qz.title}</Text>
              ) : (
                <Pressable onPress={() => navigation.navigate("QuizEditor", { classId, quizId: qz.id })} accessibilityRole="link">
                  <Text style={[ui.cardTitle, { color: colors.ai }]}>{qz.title}</Text>
                </Pressable>
              )}
              <Text style={text.small}>
                {qz.questions.length} questions, passing score {qz.passingScorePct}%
              </Text>
              {!readOnly ? (
                <View style={[ui.rowWrap, { marginTop: spacing.xs }]}>
                  <Button small variant="ghost" onPress={() => navigation.navigate("QuizEditor", { classId, quizId: qz.id })}>Edit</Button>
                  <Button small variant="dangerGhost" onPress={() => setRemoving({ kind: "quiz", item: qz })}>Delete</Button>
                </View>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>

      {renaming ? <LessonDialog classId={classId} lesson={lesson} onClose={() => setRenaming(false)} /> : null}
      <ConfirmDialog
        open={deleting}
        title={`Delete ${lesson.title}?`}
        body="Only empty lessons can be deleted. Move or delete its flashcards, quizzes, and materials first."
        confirmLabel="Delete lesson"
        busy={del.isPending}
        onCancel={() => setDeleting(false)}
        onConfirm={() => del.mutate()}
      />
      <ConfirmDialog
        open={!!removing}
        title={removing?.kind === "quiz" ? "Delete this quiz?" : "Delete this flashcard?"}
        body={removing?.kind === "quiz" ? "Students' past scores on it stay in their history." : "This can't be undone."}
        confirmLabel="Delete"
        busy={remove.isPending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing)}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  options: { gap: spacing.sm, marginBottom: spacing.sm },
  option: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 56, borderWidth: 1, borderColor: colors.line, borderRadius: 10, backgroundColor: colors.paper, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  optionIcon: { fontSize: 20, color: colors.ai, width: 24, textAlign: "center" },
  optionTitle: { ...text.body, fontWeight: "600" },
  term: { fontSize: 22, color: colors.ink, fontWeight: "500" },
});
