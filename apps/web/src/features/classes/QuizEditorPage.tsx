import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { QuizDto } from "@nihongo/shared";
import { api, ApiError, errorMessage } from "../../lib/api";
import { Alert, Button, ErrorState, Icon, Loading, Panel, TextField, useToast } from "../../components/ui";
import { emptyQuestion, QuestionEditor, toApiQuestions, validateQuestions, type EditableQuestion } from "../../components/QuestionEditor";
import { useLessons } from "./hooks";
import { useWorkspace } from "./ClassWorkspace";
import { LessonSelect } from "./ContentDialogs";

/** FR-3.4.1: title, then questions with four choices and exactly one correct. */
export function QuizEditorPage() {
  const { cls, basePath, readOnly } = useWorkspace();
  const { quizId } = useParams();
  const [params] = useSearchParams();
  const lessons = useLessons(cls.id);
  const existing = useQuery({ queryKey: ["quiz", quizId], queryFn: () => api<QuizDto>(`/quizzes/${quizId}`), enabled: !!quizId });
  const [title, setTitle] = useState("");
  const [lessonId, setLessonId] = useState(params.get("lesson") ?? "");
  const [passing, setPassing] = useState("60");
  const [questions, setQuestions] = useState<EditableQuestion[]>([emptyQuestion()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();

  useEffect(() => {
    if (existing.data) {
      setTitle(existing.data.title);
      setLessonId(existing.data.lessonId ?? "");
      setPassing(String(existing.data.passingScorePct));
      setQuestions(existing.data.questions.map((q) => ({ text: q.text, choices: [...q.choices] as EditableQuestion["choices"], correctIndex: q.correctIndex })));
    }
  }, [existing.data]);
  useEffect(() => {
    if (!lessonId && lessons.data?.[0]) setLessonId(lessons.data[0].id);
  }, [lessons.data, lessonId]);

  if (lessons.isPending || (quizId && existing.isPending)) return <Loading />;
  if (existing.isError) return <ErrorState error={existing.error} />;

  async function save() {
    const errs = validateQuestions(questions);
    if (!title.trim()) errs.title = "Enter a quiz title.";
    const pct = Number(passing);
    if (!Number.isInteger(pct) || pct < 1 || pct > 100) errs.passingScorePct = "Use a whole number from 1 to 100.";
    setErrors(errs);
    if (Object.keys(errs).length) {
      setFormError("Some fields need attention.");
      return;
    }
    setBusy(true);
    setFormError(null);
    const body = { lessonId, title: title.trim(), passingScorePct: pct, questions: toApiQuestions(questions) };
    try {
      if (quizId) await api(`/quizzes/${quizId}`, { method: "PATCH", body });
      else await api(`/classes/${cls.id}/quizzes`, { body });
      await qc.invalidateQueries({ queryKey: ["class", cls.id] });
      await qc.invalidateQueries({ queryKey: ["quiz", quizId] });
      toast(quizId ? "Saved" : "Quiz created");
      navigate(`${basePath}?lesson=${lessonId}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "validation_error") setErrors(err.fieldErrors());
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <Link to={`${basePath}${lessonId ? `?lesson=${lessonId}` : ""}`} className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm no-underline">
        <Icon name="chevron-left" size={16} />
        Lessons and content
      </Link>
      <h2 className="mb-4 text-xl">{quizId ? "Edit quiz" : "New quiz"}</h2>
      {formError ? (
        <div className="mb-4">
          <Alert tone="danger">{formError}</Alert>
        </div>
      ) : null}
      <Panel className="mb-4 grid gap-4 px-4 py-4 sm:grid-cols-2">
        <TextField className="sm:col-span-2" label="Quiz title" lang="ja" value={title} onChange={(e) => setTitle(e.target.value)} error={errors.title} required />
        <LessonSelect lessons={lessons.data ?? []} value={lessonId} onChange={setLessonId} />
        <TextField
          label="Passing score (%)"
          inputMode="numeric"
          value={passing}
          onChange={(e) => setPassing(e.target.value)}
          error={errors.passingScorePct}
          hint="Students at or above this score see Passed."
        />
      </Panel>
      <QuestionEditor questions={questions} onChange={setQuestions} errors={errors} />
      {!readOnly ? (
        <div className="sticky bottom-16 mt-6 flex gap-2 border-t border-line bg-kasumi py-3 md:bottom-0">
          <Button onClick={save} loading={busy}>
            {quizId ? "Save quiz" : "Create quiz"}
          </Button>
          <Button variant="secondary" onClick={() => navigate(basePath)}>
            Cancel
          </Button>
        </div>
      ) : null}
    </div>
  );
}
