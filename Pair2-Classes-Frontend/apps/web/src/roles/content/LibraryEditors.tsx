import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { JLPT_LEVELS, type ContentStatus, type JlptLevel, type LibraryType } from "@nihongo/shared";
import { api, ApiError, errorMessage, upload } from "../../lib/api";
import { Alert, Badge, Button, ErrorState, Icon, Loading, Panel, SelectField, TextArea, TextField, useToast } from "../../components/ui";
import { AudioField, audioForm, type AudioChoice } from "../../components/audio";
import { emptyQuestion, QuestionEditor, toApiQuestions, validateQuestions, type EditableQuestion } from "../../components/QuestionEditor";
import { TYPE_LABEL, useLibraryItem } from "./libraryApi";

function useLevelParam(): JlptLevel {
  const [params] = useSearchParams();
  const l = params.get("level");
  return (JLPT_LEVELS as readonly string[]).includes(l ?? "") ? (l as JlptLevel) : "N5";
}

function EditorShell({ type, isNew, status, children, footer }: { type: LibraryType; isNew: boolean; status?: ContentStatus; children: ReactNode; footer: ReactNode }) {
  const label = TYPE_LABEL[type];
  return (
    <div className="max-w-3xl">
      <Link to={`/c/${type}`} className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm no-underline">
        <Icon name="chevron-left" size={16} />
        {label.plural}
      </Link>
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-2xl">{isNew ? `New ${label.singular}` : `Edit ${label.singular}`}</h1>
        {status ? status === "published" ? <Badge tone="success">Published</Badge> : <Badge>Draft</Badge> : null}
      </div>
      {children}
      <div className="sticky bottom-16 mt-6 flex flex-wrap gap-2 border-t border-line bg-kasumi py-3 md:bottom-0">{footer}</div>
    </div>
  );
}

function LevelSelect({ value, onChange }: { value: JlptLevel; onChange: (l: JlptLevel) => void }) {
  return (
    <SelectField label="JLPT level" value={value} onChange={(e) => onChange(e.target.value as JlptLevel)} required>
      {JLPT_LEVELS.map((l) => (
        <option key={l}>{l}</option>
      ))}
    </SelectField>
  );
}

/**
 * Save as draft or publish (FR-3.5.7). New items are created first; audio is
 * attached once the item exists.
 */
function useSaver(type: LibraryType, id: string | undefined) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  async function save(body: Record<string, unknown>, status: ContentStatus, current?: ContentStatus) {
    setBusy(true);
    setError(null);
    try {
      let savedId = id;
      if (!id) {
        const created = await api<{ id: string }>(`/library/${type}`, { body: { ...body, ...(type === "listening-tests" ? {} : { status }) } });
        savedId = created.id;
      } else {
        await api(`/library/${type}/${id}`, { method: "PATCH", body });
        if (status !== current) await api(`/library/${type}/${id}/publish`, { body: { status } });
      }
      await qc.invalidateQueries({ queryKey: ["library"] });
      toast(status === "published" && current !== "published" ? "Published" : "Saved");
      if (!id) navigate(`/c/${type}/${savedId}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === "validation_error") setFieldErrors(err.fieldErrors());
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return { save, busy, error, fieldErrors, setFieldErrors };
}

function useAudioUploader(type: LibraryType, id: string | undefined) {
  const qc = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function attach(choice: AudioChoice, extra: Record<string, string> = {}) {
    if (!id) return;
    setBusy(true);
    try {
      await upload(`/library/${type}/${id}/audio`, audioForm(choice, extra));
      await qc.invalidateQueries({ queryKey: ["library", type, "item", id] });
      toast("Audio attached");
    } catch (err) {
      toast(errorMessage(err), "danger");
    } finally {
      setBusy(false);
    }
  }
  async function remove(query: Record<string, string> = {}) {
    if (!id) return;
    setBusy(true);
    try {
      await api(`/library/${type}/${id}/audio`, { method: "DELETE", query });
      await qc.invalidateQueries({ queryKey: ["library", type, "item", id] });
      toast("Audio removed");
    } catch (err) {
      toast(errorMessage(err), "danger");
    } finally {
      setBusy(false);
    }
  }
  return { attach, remove, busy };
}

function SaveButtons({ status, onSave, busy, isNew, publishBlocked }: { status?: ContentStatus; onSave: (s: ContentStatus) => void; busy: boolean; isNew: boolean; publishBlocked?: string }) {
  if (status === "published") {
    return (
      <>
        <Button onClick={() => onSave("published")} loading={busy}>
          Save
        </Button>
        <Button variant="secondary" onClick={() => onSave("draft")} disabled={busy}>
          Unpublish
        </Button>
      </>
    );
  }
  return (
    <>
      <Button variant="secondary" onClick={() => onSave("draft")} loading={busy}>
        Save draft
      </Button>
      <Button onClick={() => onSave("published")} disabled={busy || !!publishBlocked} title={publishBlocked}>
        {isNew ? "Publish" : "Save and publish"}
      </Button>
      {publishBlocked ? <p className="self-center text-sm text-ink-2">{publishBlocked}</p> : null}
    </>
  );
}

// ---------- Flashcards (FR-3.5.1) ----------

export function BuiltinFlashcardEditor() {
  const { id } = useParams();
  const defaultLevel = useLevelParam();
  const item = useLibraryItem("flashcards", id);
  const [v, setV] = useState({ level: defaultLevel, term: "", reading: "", meaning: "", exampleSentence: "" });
  const saver = useSaver("flashcards", id);
  const audio = useAudioUploader("flashcards", id);
  useEffect(() => {
    if (item.data) setV({ level: item.data.level ?? "N5", term: item.data.term, reading: item.data.reading, meaning: item.data.meaning, exampleSentence: item.data.exampleSentence ?? "" });
  }, [item.data]);
  if (id && item.isPending) return <Loading />;
  if (item.isError) return <ErrorState error={item.error} />;
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  function onSave(status: ContentStatus) {
    const errs: Record<string, string> = {};
    if (!v.term.trim()) errs.term = "Enter the term.";
    if (!v.reading.trim()) errs.reading = "Enter the reading.";
    if (!v.meaning.trim()) errs.meaning = "Enter the meaning.";
    saver.setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    void saver.save(v, status, item.data?.status);
  }

  return (
    <EditorShell type="flashcards" isNew={!id} status={item.data?.status} footer={<SaveButtons status={item.data?.status} isNew={!id} onSave={onSave} busy={saver.busy} />}>
      {saver.error ? (
        <div className="mb-4">
          <Alert tone="danger">{saver.error}</Alert>
        </div>
      ) : null}
      <Panel className="flex flex-col gap-4 px-4 py-4">
        <LevelSelect value={v.level} onChange={(level) => setV((s) => ({ ...s, level }))} />
        <TextField label="Term" lang="ja" value={v.term} onChange={set("term")} error={saver.fieldErrors.term} required />
        <TextField label="Reading" lang="ja" value={v.reading} onChange={set("reading")} error={saver.fieldErrors.reading} required />
        <TextField label="Meaning" value={v.meaning} onChange={set("meaning")} error={saver.fieldErrors.meaning} required />
        <TextField label="Example sentence" lang="ja" value={v.exampleSentence} onChange={set("exampleSentence")} />
        {id ? (
          <AudioField
            label="Pronunciation"
            currentUrl={item.data?.audioUrl}
            currentName={item.data?.audioFileName}
            busy={audio.busy}
            onSelect={(c) => audio.attach(c)}
            onRemove={() => void audio.remove()}
          />
        ) : (
          <p className="text-sm text-ink-2">Save the flashcard, then add its pronunciation clip.</p>
        )}
        {item.data?.expectedAudioName && !item.data.audioUrl ? <p className="text-sm text-ink-2">The import expected a file named {item.data.expectedAudioName}.</p> : null}
      </Panel>
    </EditorShell>
  );
}

// ---------- Questions shared by quizzes and tests ----------

function toEditable(qs: { text: string; choices: string[]; correctIndex: number; audioUrl?: string | null; audioFileName?: string | null }[]): EditableQuestion[] {
  return qs.map((q) => ({ text: q.text, choices: [...q.choices] as EditableQuestion["choices"], correctIndex: q.correctIndex, audioUrl: q.audioUrl ?? null, audioFileName: q.audioFileName ?? null }));
}

// ---------- Quizzes (FR-3.5.2) ----------

export function BuiltinQuizEditor() {
  const { id } = useParams();
  const defaultLevel = useLevelParam();
  const item = useLibraryItem("quizzes", id);
  const [level, setLevel] = useState<JlptLevel>(defaultLevel);
  const [title, setTitle] = useState("");
  const [passing, setPassing] = useState("60");
  const [questions, setQuestions] = useState<EditableQuestion[]>([emptyQuestion()]);
  const [dirty, setDirty] = useState(false);
  const saver = useSaver("quizzes", id);
  const audio = useAudioUploader("quizzes", id);
  useEffect(() => {
    if (item.data) {
      setLevel(item.data.level ?? "N5");
      setTitle(item.data.title);
      setPassing(String(item.data.passingScorePct));
      setQuestions(toEditable(item.data.questions));
      setDirty(false);
    }
  }, [item.data]);
  if (id && item.isPending) return <Loading />;
  if (item.isError) return <ErrorState error={item.error} />;

  function onSave(status: ContentStatus) {
    const errs = validateQuestions(questions);
    if (!title.trim()) errs.title = "Enter a quiz title.";
    saver.setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    void saver.save({ level, title: title.trim(), passingScorePct: Number(passing) || 60, questions: toApiQuestions(questions, true) }, status, item.data?.status).then(() => setDirty(false));
  }

  return (
    <EditorShell type="quizzes" isNew={!id} status={item.data?.status} footer={<SaveButtons status={item.data?.status} isNew={!id} onSave={onSave} busy={saver.busy} />}>
      {saver.error ? (
        <div className="mb-4">
          <Alert tone="danger">{saver.error}</Alert>
        </div>
      ) : null}
      <Panel className="mb-4 grid gap-4 px-4 py-4 sm:grid-cols-2">
        <TextField className="sm:col-span-2" label="Quiz title" lang="ja" value={title} onChange={(e) => (setTitle(e.target.value), setDirty(true))} error={saver.fieldErrors.title} required />
        <LevelSelect value={level} onChange={(l) => (setLevel(l), setDirty(true))} />
        <TextField label="Passing score (%)" inputMode="numeric" value={passing} onChange={(e) => (setPassing(e.target.value), setDirty(true))} />
      </Panel>
      <p className="mb-3 text-sm text-ink-2">Audio on the correct answer is played to students only on the results screen, after they submit.</p>
      <QuestionEditor
        questions={questions}
        onChange={(qs) => {
          setQuestions(qs);
          setDirty(true);
        }}
        errors={saver.fieldErrors}
        extra={(i) =>
          id && !dirty && item.data?.questions[i] ? (
            <AudioField
              label="Correct answer audio"
              currentUrl={item.data.questions[i].audioUrl}
              currentName={item.data.questions[i].audioFileName}
              busy={audio.busy}
              onSelect={(c) => audio.attach(c, { questionIndex: String(i) })}
              onRemove={() => void audio.remove({ questionIndex: String(i) })}
            />
          ) : (
            <p className="text-sm text-ink-2">Save the quiz to add audio to this question's correct answer.</p>
          )
        }
      />
    </EditorShell>
  );
}

// ---------- Reading tests (FR-3.5.4) ----------

export function ReadingTestEditor() {
  const { id } = useParams();
  const defaultLevel = useLevelParam();
  const item = useLibraryItem("reading-tests", id);
  const [level, setLevel] = useState<JlptLevel>(defaultLevel);
  const [title, setTitle] = useState("");
  const [passage, setPassage] = useState("");
  const [passing, setPassing] = useState("60");
  const [questions, setQuestions] = useState<EditableQuestion[]>([emptyQuestion()]);
  const saver = useSaver("reading-tests", id);
  useEffect(() => {
    if (item.data) {
      setLevel(item.data.level);
      setTitle(item.data.title);
      setPassage(item.data.passage);
      setPassing(String(item.data.passingScorePct));
      setQuestions(toEditable(item.data.questions));
    }
  }, [item.data]);
  if (id && item.isPending) return <Loading />;
  if (item.isError) return <ErrorState error={item.error} />;

  function onSave(status: ContentStatus) {
    const errs = validateQuestions(questions);
    if (!title.trim()) errs.title = "Enter a title.";
    if (!passage.trim()) errs.passage = "Enter the reading passage.";
    saver.setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    void saver.save({ level, title: title.trim(), passage: passage.trim(), passingScorePct: Number(passing) || 60, questions: toApiQuestions(questions) }, status, item.data?.status);
  }

  return (
    <EditorShell type="reading-tests" isNew={!id} status={item.data?.status} footer={<SaveButtons status={item.data?.status} isNew={!id} onSave={onSave} busy={saver.busy} />}>
      {saver.error ? (
        <div className="mb-4">
          <Alert tone="danger">{saver.error}</Alert>
        </div>
      ) : null}
      <Panel className="mb-4 grid gap-4 px-4 py-4 sm:grid-cols-2">
        <TextField className="sm:col-span-2" label="Title" lang="ja" value={title} onChange={(e) => setTitle(e.target.value)} error={saver.fieldErrors.title} required />
        <LevelSelect value={level} onChange={setLevel} />
        <TextField label="Passing score (%)" inputMode="numeric" value={passing} onChange={(e) => setPassing(e.target.value)} />
        <TextArea className="sm:col-span-2" label="Passage" lang="ja" rows={10} value={passage} onChange={(e) => setPassage(e.target.value)} error={saver.fieldErrors.passage} required />
      </Panel>
      <QuestionEditor questions={questions} onChange={setQuestions} errors={saver.fieldErrors} />
    </EditorShell>
  );
}

// ---------- Listening tests (FR-3.5.5) ----------

export function ListeningTestEditor() {
  const { id } = useParams();
  const defaultLevel = useLevelParam();
  const item = useLibraryItem("listening-tests", id);
  const [level, setLevel] = useState<JlptLevel>(defaultLevel);
  const [title, setTitle] = useState("");
  const [passing, setPassing] = useState("60");
  const [questions, setQuestions] = useState<EditableQuestion[]>([emptyQuestion()]);
  const saver = useSaver("listening-tests", id);
  const audio = useAudioUploader("listening-tests", id);
  useEffect(() => {
    if (item.data) {
      setLevel(item.data.level);
      setTitle(item.data.title);
      setPassing(String(item.data.passingScorePct));
      setQuestions(toEditable(item.data.questions));
    }
  }, [item.data]);
  if (id && item.isPending) return <Loading />;
  if (item.isError) return <ErrorState error={item.error} />;

  function onSave(status: ContentStatus) {
    const errs = validateQuestions(questions);
    if (!title.trim()) errs.title = "Enter a title.";
    saver.setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    void saver.save({ level, title: title.trim(), passingScorePct: Number(passing) || 60, questions: toApiQuestions(questions) }, status, item.data?.status ?? "draft");
  }

  const blocked = !id ? "Save the draft, then add the clip to publish." : !item.data?.audioUrl ? "Add the listening clip to publish." : undefined;
  return (
    <EditorShell
      type="listening-tests"
      isNew={!id}
      status={item.data?.status}
      footer={<SaveButtons status={item.data?.status} isNew={!id} onSave={onSave} busy={saver.busy} publishBlocked={item.data?.status === "published" ? undefined : blocked} />}
    >
      {saver.error ? (
        <div className="mb-4">
          <Alert tone="danger">{saver.error}</Alert>
        </div>
      ) : null}
      <Panel className="mb-4 grid gap-4 px-4 py-4 sm:grid-cols-2">
        <TextField className="sm:col-span-2" label="Title" lang="ja" value={title} onChange={(e) => setTitle(e.target.value)} error={saver.fieldErrors.title} required />
        <LevelSelect value={level} onChange={setLevel} />
        <TextField label="Passing score (%)" inputMode="numeric" value={passing} onChange={(e) => setPassing(e.target.value)} />
        <div className="sm:col-span-2">
          {id ? (
            <AudioField
              label="Listening clip"
              currentUrl={item.data?.audioUrl}
              currentName={item.data?.audioFileName}
              busy={audio.busy}
              onSelect={(c) => audio.attach(c)}
              onRemove={item.data?.status === "published" ? undefined : () => void audio.remove()}
            />
          ) : (
            <p className="text-sm text-ink-2">Save the draft, then upload or record the listening clip.</p>
          )}
        </div>
      </Panel>
      <QuestionEditor questions={questions} onChange={setQuestions} errors={saver.fieldErrors} />
    </EditorShell>
  );
}
