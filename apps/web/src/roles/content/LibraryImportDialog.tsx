import { useState } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { JLPT_LEVELS, type ImportResultDto, type JlptLevel } from "@nihongo/shared";
import { errorMessage, upload } from "../../lib/api";
import { Alert, Button, Dialog, ProgressBar, SelectField, TextField } from "../../components/ui";
import { FileDrop } from "../../components/FileDrop";
import { ImportResultView } from "../../components/ImportResult";
import { downloadTemplate } from "../../features/classes/ContentDialogs";

/** FR-3.5.3 / decision 10: the level (and quiz title) come from the form. */
export function LibraryImportDialog({ type, defaultLevel, onClose }: { type: "flashcards" | "quizzes"; defaultLevel: JlptLevel; onClose: () => void }) {
  const [level, setLevel] = useState<JlptLevel>(defaultLevel);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<ImportResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const kind = type === "quizzes" ? "quiz" : "flashcards";

  async function submit() {
    if (type === "quizzes" && !title.trim()) return setError("Enter a quiz title.");
    if (!file) return setError("Choose the filled template to upload.");
    setError(null);
    setProgress(0);
    const form = new FormData();
    form.set("level", level);
    if (type === "quizzes") form.set("title", title.trim());
    form.set("file", file);
    try {
      setResult(await upload<ImportResultDto>(`/library/${type}/import`, form, setProgress));
      void qc.invalidateQueries({ queryKey: ["library"] });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setProgress(null);
    }
  }

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={type === "quizzes" ? "Import a quiz from Excel" : "Import flashcards from Excel"}
      footer={
        result ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            {result.imported && result.batchId ? <Button onClick={() => navigate(`/c/imports/${type}/${result.batchId}`)}>Review and add audio</Button> : null}
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button icon="upload" onClick={submit} loading={progress !== null}>
              Upload
            </Button>
          </>
        )
      }
    >
      {result ? (
        <ImportResultView result={result} noun={type === "quizzes" ? "question" : "flashcard"} />
      ) : (
        <div className="flex flex-col gap-4">
          <ol className="list-decimal pl-5 text-ink-2">
            <li>
              <button type="button" className="min-h-11 text-ai underline" onClick={() => void downloadTemplate(kind)}>
                Download the library {type === "quizzes" ? "quiz" : "flashcard"} template
              </button>{" "}
              (it adds an Audio File Name column).
            </li>
            <li>Fill it and upload it here. Everything is imported as a draft.</li>
            <li>On the review screen, drop the audio files; they're matched to rows by file name.</li>
          </ol>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <SelectField label="JLPT level for every row" value={level} onChange={(e) => setLevel(e.target.value as JlptLevel)}>
            {JLPT_LEVELS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </SelectField>
          {type === "quizzes" ? <TextField label="Quiz title" lang="ja" value={title} onChange={(e) => setTitle(e.target.value)} required /> : null}
          {file ? (
            <div className="flex items-center justify-between gap-3 rounded-paper border border-line px-3 py-2">
              <span className="truncate">{file.name}</span>
              <Button size="sm" variant="ghost" onClick={() => setFile(null)}>
                Remove
              </Button>
            </div>
          ) : (
            <FileDrop accept=".xlsx" label="Choose an .xlsx file" hint="Or drag it here. Up to 500 rows and 5 MB." onFiles={(f) => setFile(f[0])} />
          )}
          {progress !== null ? <ProgressBar value={progress} label="Upload progress" /> : null}
        </div>
      )}
    </Dialog>
  );
}
