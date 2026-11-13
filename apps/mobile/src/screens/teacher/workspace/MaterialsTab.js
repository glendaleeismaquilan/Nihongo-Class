// Class materials grouped by lesson: post, see who opened them, pin, publish
// or unpublish, delete — web: features/materials/StaffMaterialsTab.tsx.
// "Post material" asks for a title, then opens the editor (MaterialEditor) for
// files and links; "Opened by X of Y" opens MaterialViews.
import { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "../../../lib/api";
import { formatDate } from "../../../lib/format";
import { Loading, ErrorState, EmptyState } from "../../../components/QueryState";
import { useToast } from "../../../components/Toast";
import { groupByLesson, materialKeys, useLessons, useMaterials } from "../classHooks";
import { Badge, Button, ConfirmDialog, Dialog, Field, SectionTitle, ui } from "../ui";
import { colors, spacing, text } from "../../../styles/theme";

function NewMaterialDialog({ cls, navigation, onClose }) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState(null);
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: () => api(`/classes/${cls.id}/materials`, { body: { title } }),
    onSuccess: (m) => {
      void qc.invalidateQueries({ queryKey: materialKeys.list(cls.id) });
      onClose();
      navigation.navigate("MaterialEditor", { classId: cls.id, materialId: m.id });
    },
    onError: (err) => setError(errorMessage(err)),
  });
  function submit() {
    if (!title.trim()) return setError("Enter a title.");
    setError(null);
    create.mutate();
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title="Post material"
      footer={
        <>
          <Button variant="secondary" small onPress={onClose} disabled={create.isPending}>Cancel</Button>
          <Button small onPress={submit} loading={create.isPending}>Continue</Button>
        </>
      }
    >
      <Field label="Title" placeholder="Lesson 3 slides" value={title} onChangeText={setTitle} error={error} autoFocus />
      <Text style={[text.small, { marginTop: spacing.sm }]}>Next you'll add files and links. It stays a draft until you publish it.</Text>
    </Dialog>
  );
}

export function MaterialsTab({ cls, readOnly, navigation }) {
  const q = useMaterials(cls.id);
  const lessons = useLessons(cls.id);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const qc = useQueryClient();
  const toast = useToast();
  const refresh = () => qc.invalidateQueries({ queryKey: materialKeys.list(cls.id) });

  const patch = useMutation({
    mutationFn: ({ id, body }) => api(`/materials/${id}`, { method: "PATCH", body }),
    onSuccess: (m, v) => {
      toast.success(v.body.status === "published" ? "Published" : v.body.status === "draft" ? "Unpublished" : v.body.pinned ? "Pinned" : "Unpinned");
      qc.setQueryData(materialKeys.one(v.id), m);
      void refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const del = useMutation({
    mutationFn: (id) => api(`/materials/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setDeleting(null);
      toast.success("Deleted");
      void refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (q.isPending || lessons.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (lessons.isError) return <ErrorState error={lessons.error} retry={() => lessons.refetch()} />;
  const groups = groupByLesson(q.data, lessons.data);
  const edit = (m) => navigation.navigate("MaterialEditor", { classId: cls.id, materialId: m.id });

  return (
    <View>
      {!readOnly ? (
        <View style={s.actions}>
          <Button small onPress={() => setCreating(true)}>+ Post material</Button>
        </View>
      ) : null}
      {q.data.length === 0 ? (
        <EmptyState action={!readOnly ? <Button onPress={() => setCreating(true)}>Post material</Button> : null}>
          No materials yet. Post slides, worksheets, or a kana chart for your class.
        </EmptyState>
      ) : (
        groups.map((g) => (
          <View key={g.key}>
            <SectionTitle>{g.title}</SectionTitle>
            {g.items.map((m) => (
              <View key={m.id} style={ui.card}>
                <Pressable onPress={() => edit(m)} accessibilityRole="button" accessibilityLabel={`${m.pinned ? "Pinned. " : ""}${m.title}, ${m.status === "draft" ? "draft" : "published"}`}>
                  <View style={[ui.rowWrap, { gap: spacing.sm }]}>
                    {m.pinned ? <Text style={s.pin}>📌</Text> : null}
                    <Text style={s.title}>{m.title}</Text>
                    {m.status === "draft" ? <Badge>Draft</Badge> : <Badge tone="success">Published</Badge>}
                  </View>
                  <Text style={[text.small, { marginTop: 2 }]}>
                    {m.attachments.length} file{m.attachments.length === 1 ? "" : "s"} and links, {m.publishedAt ? `published ${formatDate(m.publishedAt)}` : `created ${formatDate(m.createdAt)}`}
                  </Text>
                </Pressable>
                <View style={[ui.rowWrap, { marginTop: spacing.sm }]}>
                  {m.status === "published" ? (
                    <Button small variant="ghost" onPress={() => navigation.navigate("MaterialViews", { materialId: m.id, title: m.title })}>
                      Opened by {m.openedCount ?? 0} of {m.studentCount ?? 0}
                    </Button>
                  ) : null}
                  {!readOnly ? (
                    <>
                      <Button small variant="ghost" disabled={patch.isPending} onPress={() => patch.mutate({ id: m.id, body: { pinned: !m.pinned } })}>
                        {m.pinned ? "Unpin" : "Pin"}
                      </Button>
                      <Button small variant="ghost" disabled={patch.isPending} onPress={() => patch.mutate({ id: m.id, body: { status: m.status === "published" ? "draft" : "published" } })}>
                        {m.status === "published" ? "Unpublish" : "Publish"}
                      </Button>
                      <Button small variant="dangerGhost" onPress={() => setDeleting(m)}>Delete</Button>
                    </>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ))
      )}
      {creating ? <NewMaterialDialog cls={cls} navigation={navigation} onClose={() => setCreating(false)} /> : null}
      <ConfirmDialog
        open={!!deleting}
        title={`Delete ${deleting?.title ?? "material"}?`}
        body="Its files are deleted from storage and students lose access. This can't be undone."
        confirmLabel="Delete"
        busy={del.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting.id)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  actions: { flexDirection: "row", justifyContent: "flex-end", marginBottom: spacing.xs },
  pin: { fontSize: 14 },
  title: { ...text.body, fontWeight: "600", color: colors.ai, flexShrink: 1 },
});
