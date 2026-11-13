// Add or rename a lesson — web: LessonDialog in features/classes/LessonsTab.tsx.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "../../../lib/api";
import { classKeys } from "../classHooks";
import { Button, Dialog, Field } from "../ui";

export function LessonDialog({ classId, lesson, onClose }) {
  const [title, setTitle] = useState(lesson?.title ?? "");
  const [description, setDescription] = useState(lesson?.description ?? "");
  const [error, setError] = useState(null);
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: () =>
      lesson
        ? api(`/lessons/${lesson.id}`, { method: "PATCH", body: { title, description } })
        : api(`/classes/${classId}/lessons`, { body: { title, description } }),
    onSuccess: (l) => {
      void qc.invalidateQueries({ queryKey: classKeys.lessons(classId) });
      onClose(lesson ? undefined : l);
    },
    onError: (err) => setError(errorMessage(err)),
  });

  function submit() {
    if (!title.trim()) return setError("Enter a lesson title.");
    setError(null);
    save.mutate();
  }

  return (
    <Dialog
      open
      onClose={() => onClose()}
      title={lesson ? "Rename lesson" : "Add lesson"}
      footer={
        <>
          <Button variant="secondary" small onPress={() => onClose()} disabled={save.isPending}>Cancel</Button>
          <Button small onPress={submit} loading={save.isPending}>Save</Button>
        </>
      }
    >
      <Field label="Title" placeholder="Lesson 3: 家族" value={title} onChangeText={setTitle} error={error} autoFocus />
      <Field label="Description" value={description} onChangeText={setDescription} multiline numberOfLines={3} />
    </Dialog>
  );
}
