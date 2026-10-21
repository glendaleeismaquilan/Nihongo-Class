import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { FlashcardDto, LessonDto, QuizDto } from "@nihongo/shared";
import { api, errorMessage } from "../../lib/api";
import { Button, Dialog, EmptyState, ErrorState, Icon, IconButton, Loading, Panel, SectionTitle, TextArea, TextField, useToast } from "../../components/ui";
import { classKeys, useFlashcards, useLessons, useQuizzes } from "./hooks";
import { useWorkspace } from "./ClassWorkspace";
import { FlashcardDialog, TeacherImportDialog } from "./ContentDialogs";

export const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

function LessonDialog({ classId, lesson, onClose }: { classId: string; lesson?: LessonDto | null; onClose: (created?: LessonDto) => void }) {
  const [title, setTitle] = useState(lesson?.title ?? "");
  const [description, setDescription] = useState(lesson?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: () =>
      lesson ? api<LessonDto>(`/lessons/${lesson.id}`, { method: "PATCH", body: { title, description } }) : api<LessonDto>(`/classes/${classId}/lessons`, { body: { title, description } }),
    onSuccess: (l) => {
      void qc.invalidateQueries({ queryKey: classKeys.lessons(classId) });
      onClose(lesson ? undefined : l);
    },
    onError: (err) => setError(errorMessage(err)),
  });
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("Enter a lesson title.");
    save.mutate();
  }
  return (
    <Dialog
      open
      onClose={() => onClose()}
      title={lesson ? "Rename lesson" : "Add lesson"}
      footer={
        <>
          <Button variant="secondary" onClick={() => onClose()}>
            Cancel
          </Button>
          <Button type="submit" form="lesson-form" loading={save.isPending}>
            Save
          </Button>
        </>
      }
    >
      <form id="lesson-form" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <TextField label="Title" placeholder="Lesson 3: 家族" value={title} onChange={(e) => setTitle(e.target.value)} error={error} required />
        <TextArea label="Description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </form>
    </Dialog>
  );
}

/** SRS 5.3: "Enter manually" and "Upload Excel" as two labeled options side by side. */
function CreateOptions({ manualHint, excelHint, onManual, onExcel, disabled }: { manualHint: string; excelHint: string; onManual: () => void; onExcel: () => void; disabled?: boolean }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <button type="button" disabled={disabled} onClick={onManual} className="flex min-h-14 items-center gap-3 rounded-paper border border-line bg-paper px-4 py-3 text-left hover:border-ai disabled:opacity-50">
        <Icon name="edit" className="text-ai" />
        <span>
          <span className="block font-medium">Enter manually</span>
          <span className="block text-sm text-ink-2">{manualHint}</span>
        </span>
      </button>
      <button type="button" disabled={disabled} onClick={onExcel} className="flex min-h-14 items-center gap-3 rounded-paper border border-line bg-paper px-4 py-3 text-left hover:border-ai disabled:opacity-50">
        <Icon name="upload" className="text-ai" />
        <span>
          <span className="block font-medium">Upload Excel</span>
          <span className="block text-sm text-ink-2">{excelHint}</span>
        </span>
      </button>
    </div>
  );
}

export function LessonsTab() {
  const { cls, basePath, readOnly } = useWorkspace();
  const lessons = useLessons(cls.id);
  const [params, setParams] = useSearchParams();
  const [lessonDialog, setLessonDialog] = useState<LessonDto | null | "new">(null);
  const [deleting, setDeleting] = useState<LessonDto | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const items = lessons.data ?? [];
  const selectedId = params.get("lesson") ?? items[0]?.id;
  const selected = items.find((l) => l.id === selectedId) ?? items[0];

  const reorder = useMutation({
    mutationFn: ({ id, order }: { id: string; order: number }) => api(`/lessons/${id}`, { method: "PATCH", body: { order } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: classKeys.lessons(cls.id) }),
    onError: (err) => toast(errorMessage(err), "danger"),
  });
  const del = useMutation({
    mutationFn: (id: string) => api(`/lessons/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setDeleting(null);
      toast("Lesson deleted");
      setParams({});
      void qc.invalidateQueries({ queryKey: classKeys.lessons(cls.id) });
    },
    onError: (err) => {
      setDeleting(null);
      toast(errorMessage(err), "danger");
    },
  });

  if (lessons.isPending) return <Loading />;
  if (lessons.isError) return <ErrorState error={lessons.error} retry={() => lessons.refetch()} />;

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <div>
        <SectionTitle
          actions={
            !readOnly ? (
              <Button size="sm" variant="secondary" icon="plus" onClick={() => setLessonDialog("new")}>
                Add lesson
              </Button>
            ) : null
          }
        >
          Lessons
        </SectionTitle>
        {items.length === 0 ? (
          <EmptyState action={!readOnly ? <Button onClick={() => setLessonDialog("new")}>Add lesson</Button> : null}>No lessons yet. Add a lesson, then put flashcards and quizzes in it.</EmptyState>
        ) : (
          <Panel as="div">
            <ol className="divide-y divide-line">
              {items.map((l, i) => (
                <li key={l.id} className={`flex items-center gap-1 pl-3 ${selected?.id === l.id ? "bg-kasumi" : ""}`}>
                  <button
                    type="button"
                    onClick={() => setParams({ lesson: l.id })}
                    aria-current={selected?.id === l.id ? "true" : undefined}
                    className={`min-h-11 flex-1 py-2 text-left ${selected?.id === l.id ? "font-medium text-ai" : ""}`}
                  >
                    {l.title}
                    <span className="block text-sm font-normal text-ink-2">
                      {plural(l.counts?.flashcards ?? 0, "flashcard")}, {plural(l.counts?.quizzes ?? 0, "quiz", "quizzes")}
                    </span>
                  </button>
                  {!readOnly ? (
                    <div className="flex shrink-0">
                      <IconButton icon="arrowUp" label={`Move ${l.title} up`} disabled={i === 0 || reorder.isPending} onClick={() => reorder.mutate({ id: l.id, order: i - 1 })} />
                      <IconButton icon="arrowDown" label={`Move ${l.title} down`} disabled={i === items.length - 1 || reorder.isPending} onClick={() => reorder.mutate({ id: l.id, order: i + 1 })} />
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          </Panel>
        )}
      </div>
      <div className="min-w-0">
        {selected ? (
          <LessonContent
            key={selected.id}
            lesson={selected}
            lessons={items}
            readOnly={readOnly}
            basePath={basePath}
            onRename={() => setLessonDialog(selected)}
            onDelete={() => setDeleting(selected)}
          />
        ) : null}
      </div>
      {lessonDialog ? (
        <LessonDialog
          classId={cls.id}
          lesson={lessonDialog === "new" ? null : lessonDialog}
          onClose={(created) => {
            setLessonDialog(null);
            if (created) setParams({ lesson: created.id });
          }}
        />
      ) : null}
      <Dialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.title ?? "lesson"}?`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={del.isPending} onClick={() => deleting && del.mutate(deleting.id)}>
              Delete lesson
            </Button>
          </>
        }
      >
        <p>Only empty lessons can be deleted. Move or delete its flashcards, quizzes, and materials first.</p>
      </Dialog>
    </div>
  );
}

function LessonContent({
  lesson,
  lessons,
  readOnly,
  basePath,
  onRename,
  onDelete,
}: {
  lesson: LessonDto;
  lessons: LessonDto[];
  readOnly: boolean;
  basePath: string;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { cls } = useWorkspace();
  const cards = useFlashcards(cls.id, lesson.id);
  const quizzes = useQuizzes(cls.id, lesson.id);
  const [cardDialog, setCardDialog] = useState<FlashcardDto | null | "new">(null);
  const [importing, setImporting] = useState<"flashcards" | "quiz" | null>(null);
  const [removing, setRemoving] = useState<{ kind: "flashcard" | "quiz"; item: FlashcardDto | QuizDto } | null>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const remove = useMutation({
    mutationFn: (r: NonNullable<typeof removing>) => api(`/${r.kind === "quiz" ? "quizzes" : "flashcards"}/${r.item.id}`, { method: "DELETE" }),
    onSuccess: () => {
      setRemoving(null);
      toast("Deleted");
      void qc.invalidateQueries({ queryKey: ["class", cls.id] });
    },
    onError: (err) => toast(errorMessage(err), "danger"),
  });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-xl">{lesson.title}</h2>
          {lesson.description ? <p className="mt-1 max-w-[70ch] text-ink-2">{lesson.description}</p> : null}
        </div>
        {!readOnly ? (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={onRename}>
              Rename
            </Button>
            <Button size="sm" variant="ghost" className="text-shu" onClick={onDelete}>
              Delete
            </Button>
          </div>
        ) : null}
      </div>

      <section aria-labelledby="fc-heading" className="mb-8">
        <SectionTitle id="fc-heading">Flashcards{cards.data ? ` (${cards.data.length})` : ""}</SectionTitle>
        {!readOnly ? <CreateOptions manualHint="Type flashcards one at a time." excelHint="Fill the template and import many flashcards at once." onManual={() => setCardDialog("new")} onExcel={() => setImporting("flashcards")} /> : null}
        <div className="mt-3">
          {cards.isPending ? (
            <Loading />
          ) : cards.isError ? (
            <ErrorState error={cards.error} retry={() => cards.refetch()} />
          ) : cards.data.length === 0 ? (
            <EmptyState>No flashcards in this lesson yet.</EmptyState>
          ) : (
            <div className="data-table-wrap max-h-[60vh]" role="region" aria-label="Flashcards" tabIndex={0}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Term</th>
                    <th scope="col">Reading</th>
                    <th scope="col">Meaning</th>
                    <th scope="col">Example sentence</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {cards.data.map((c) => (
                    <tr key={c.id}>
                      <td lang="ja" className="study-text text-lg whitespace-nowrap">
                        {c.term}
                      </td>
                      <td lang="ja" className="whitespace-nowrap">{c.reading}</td>
                      <td>{c.meaning}</td>
                      <td lang="ja" className="text-ink-2">
                        {c.exampleSentence}
                      </td>
                      <td className="whitespace-nowrap text-right">
                        {!readOnly ? (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => setCardDialog(c)}>
                              Edit
                            </Button>
                            <Button size="sm" variant="ghost" className="text-shu" onClick={() => setRemoving({ kind: "flashcard", item: c })}>
                              Delete
                            </Button>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="quiz-heading">
        <SectionTitle id="quiz-heading">Quizzes{quizzes.data ? ` (${quizzes.data.length})` : ""}</SectionTitle>
        {!readOnly ? <CreateOptions manualHint="Write the questions and mark each correct choice." excelHint="Fill the template; one file makes one quiz." onManual={() => navigate(`${basePath}/quizzes/new?lesson=${lesson.id}`)} onExcel={() => setImporting("quiz")} /> : null}
        <div className="mt-3">
          {quizzes.isPending ? (
            <Loading />
          ) : quizzes.isError ? (
            <ErrorState error={quizzes.error} retry={() => quizzes.refetch()} />
          ) : quizzes.data.length === 0 ? (
            <EmptyState>No quizzes in this lesson yet.</EmptyState>
          ) : (
            <Panel as="div">
              <ul className="divide-y divide-line">
                {quizzes.data.map((q) => (
                  <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div>
                      <p className="font-medium" lang="ja">
                        {readOnly ? q.title : <Link to={`${basePath}/quizzes/${q.id}`}>{q.title}</Link>}
                      </p>
                      <p className="text-sm text-ink-2">
                        {q.questions.length} questions, passing score {q.passingScorePct}%
                      </p>
                    </div>
                    {!readOnly ? (
                      <div className="flex">
                        <Button size="sm" variant="ghost" onClick={() => navigate(`${basePath}/quizzes/${q.id}`)}>
                          Edit
                        </Button>
                        <Button size="sm" variant="ghost" className="text-shu" onClick={() => setRemoving({ kind: "quiz", item: q })}>
                          Delete
                        </Button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </section>

      {cardDialog ? <FlashcardDialog classId={cls.id} lessons={lessons} lessonId={lesson.id} card={cardDialog === "new" ? null : cardDialog} onClose={() => setCardDialog(null)} /> : null}
      {importing ? <TeacherImportDialog kind={importing} classId={cls.id} lessons={lessons} lessonId={lesson.id} onClose={() => setImporting(null)} /> : null}
      <Dialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title={removing?.kind === "quiz" ? "Delete this quiz?" : "Delete this flashcard?"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => removing && remove.mutate(removing)}>
              Delete
            </Button>
          </>
        }
      >
        <p>{removing?.kind === "quiz" ? "Students' past scores on it stay in their history." : "This can't be undone."}</p>
      </Dialog>
    </>
  );
}
