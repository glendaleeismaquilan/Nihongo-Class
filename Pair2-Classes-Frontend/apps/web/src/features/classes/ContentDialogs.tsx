import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { FlashcardDto, ImportResultDto, LessonDto } from "@nihongo/shared";
import { api, apiBlob, ApiError, errorMessage, saveBlob, upload } from "../../lib/api";
import { Alert, Button, Dialog, ProgressBar, SelectField, TextField, useToast } from "../../components/ui";
import { FileDrop } from "../../components/FileDrop";
import { ImportResultView } from "../../components/ImportResult";

export function LessonSelect({ lessons, value, onChange, error }: { lessons: LessonDto[]; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <SelectField label="Lesson" value={value} onChange={(e) => onChange(e.target.value)} error={error} required>
      {lessons.map((l) => (
        <option key={l.id} value={l.id}>
          {l.title}
        </option>
      ))}
    </SelectField>
  );
}

/** FR-3.3.1: term, reading, meaning, optional example sentence. No audio (FR-3.3.5). */
export function FlashcardDialog({
  classId,
  lessons,
  lessonId,
  card,
  onClose,
}: {
  classId: string;
  lessons: LessonDto[];
  lessonId: string;
  card?: FlashcardDto | null;
  onClose: () => void;
}) {
  const [values, setValues] = useState({
    lessonId: card?.lessonId ?? lessonId,
    term: card?.term ?? "",
    reading: card?.reading ?? "",
    meaning: card?.meaning ?? "",
    exampleSentence: card?.exampleSentence ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const set = (k: keyof typeof values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [k]: e.target.value }));

  async function submit(e: FormEvent, again = false) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!values.term.trim()) errs.term = "Enter the term.";
    if (!values.reading.trim()) errs.reading = "Enter the reading.";
    if (!values.meaning.trim()) errs.meaning = "Enter the meaning.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setFormError(null);
    try {
      if (card) await api(`/flashcards/${card.id}`, { method: "PATCH", body: values });
      else await api(`/classes/${classId}/flashcards`, { body: values });
      await qc.invalidateQueries({ queryKey: ["class", classId] });
      toast(card ? "Saved" : "Flashcard added");
      if (again) setValues((v) => ({ ...v, term: "", reading: "", meaning: "", exampleSentence: "" }));
      else onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === "validation_error") setErrors(err.fieldErrors());
      else setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={card ? "Edit flashcard" : "Add flashcard"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          {!card ? (
            <Button variant="secondary" loading={busy} onClick={(e) => void submit(e as unknown as FormEvent, true)}>
              Save and add another
            </Button>
          ) : null}
          <Button type="submit" form="flashcard-form" loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <form id="flashcard-form" onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <LessonSelect lessons={lessons} value={values.lessonId} onChange={(v) => setValues((s) => ({ ...s, lessonId: v }))} />
        <TextField label="Term" lang="ja" placeholder="食べる" value={values.term} onChange={set("term")} error={errors.term} required />
        <TextField label="Reading" lang="ja" placeholder="たべる" value={values.reading} onChange={set("reading")} error={errors.reading} required />
        <TextField label="Meaning" placeholder="to eat" value={values.meaning} onChange={set("meaning")} error={errors.meaning} required />
        <TextField label="Example sentence" lang="ja" placeholder="ご飯を食べる" value={values.exampleSentence} onChange={set("exampleSentence")} error={errors.exampleSentence} />
      </form>
    </Dialog>
  );
}

export async function downloadTemplate(kind: "flashcards" | "quiz") {
  const { blob, filename } = await apiBlob(`/templates/${kind}`);
  saveBlob(blob, filename ?? `${kind}-template.xlsx`);
}

/** FR-3.3.2 to FR-3.4.4: download the template, upload the filled file, see results. */
export function TeacherImportDialog({
  kind,
  classId,
  lessons,
  lessonId,
  onClose,
}: {
  kind: "flashcards" | "quiz";
  classId: string;
  lessons: LessonDto[];
  lessonId: string;
  onClose: () => void;
}) {
  const [lesson, setLesson] = useState(lessonId);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<ImportResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const qc = useQueryClient();

  async function submit() {
    if (kind === "quiz" && !title.trim()) {
      setTitleError("Enter a quiz title.");
      return;
    }
    if (!file) {
      setError("Choose the filled template to upload.");
      return;
    }
    setTitleError(null);
    setError(null);
    setProgress(0);
    const form = new FormData();
    form.set("lessonId", lesson);
    if (kind === "quiz") form.set("title", title.trim());
    form.set("file", file);
    try {
      const res = await upload<ImportResultDto>(`/classes/${classId}/${kind === "quiz" ? "quizzes" : "flashcards"}/import`, form, setProgress);
      setResult(res);
      await qc.invalidateQueries({ queryKey: ["class", classId] });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setProgress(null);
    }
  }

  const noun = kind === "quiz" ? "question" : "flashcard";
  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={kind === "quiz" ? "Upload a quiz from Excel" : "Upload flashcards from Excel"}
      footer={
        result ? (
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setResult(null);
                setFile(null);
              }}
            >
              Upload another file
            </Button>
            <Button onClick={onClose}>Done</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit} loading={progress !== null} icon="upload">
              Upload
            </Button>
          </>
        )
      }
    >
      {result ? (
        <ImportResultView result={result} noun={noun} />
      ) : (
        <div className="flex flex-col gap-4">
          <ol className="list-decimal pl-5 text-ink-2">
            <li>
              <button type="button" className="min-h-11 text-ai underline" onClick={() => void downloadTemplate(kind)}>
                Download the {kind === "quiz" ? "quiz" : "flashcard"} template
              </button>
              {kind === "quiz" ? " (Question, Option A to D, Correct Option)." : " (Term, Reading, Meaning, Example Sentence)."}
            </li>
            <li>Fill one {noun} per row and save it as .xlsx.</li>
            <li>Upload it here. Rows with problems are skipped and listed; the rest are imported.</li>
          </ol>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <LessonSelect lessons={lessons} value={lesson} onChange={setLesson} />
          {kind === "quiz" ? <TextField label="Quiz title" lang="ja" value={title} onChange={(e) => setTitle(e.target.value)} error={titleError} required /> : null}
          {file ? (
            <div className="flex items-center justify-between gap-3 rounded-paper border border-line px-3 py-2">
              <span className="truncate">{file.name}</span>
              <Button size="sm" variant="ghost" onClick={() => setFile(null)}>
                Remove
              </Button>
            </div>
          ) : (
            <FileDrop
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              label="Choose an .xlsx file"
              hint="Or drag it here. Up to 500 rows and 5 MB."
              onFiles={(f) => setFile(f[0])}
            />
          )}
          {progress !== null ? <ProgressBar value={progress} label="Upload progress" /> : null}
        </div>
      )}
    </Dialog>
  );
}
