import { useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ActivityDto, ActivityType, AttemptResultDto } from "@nihongo/shared";
import { api, errorMessage } from "../../../lib/api";
import { Alert, Button, ErrorState, Loading, Panel } from "../../../components/ui";
import { FocusLayout } from "./FocusLayout";
import { ListeningPlayer } from "./ListeningPlayer";
import { Results } from "./Results";

const LETTERS = ["A", "B", "C", "D"];

/** Quiz and test choices are a native radio group (§13 Accessibility). */
function ChoiceGroup({ q, index, value, onChange }: { q: ActivityDto["questions"][number]; index: number; value: number | null; onChange: (v: number) => void }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-3">
        <span className="block text-sm font-medium text-ink-2">Question {index + 1}</span>
        <span lang="ja" className="study-text block text-xl">
          {q.text}
        </span>
      </legend>
      {q.choices.map((c, j) => (
        <label
          key={j}
          className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-control border px-4 py-2 ${value === j ? "border-ai bg-kasumi" : "border-line bg-paper hover:border-ai"}`}
        >
          <input type="radio" name={`q-${index}`} value={j} checked={value === j} onChange={() => onChange(j)} className="h-5 w-5 shrink-0 accent-[var(--ai)]" />
          <span className="w-5 font-semibold text-ink-2">{LETTERS[j]}</span>
          <span lang="ja" className="study-text text-lg">
            {c}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function ActivityPage() {
  const { type = "quiz", id = "" } = useParams() as { type: ActivityType; id: string };
  const [params] = useSearchParams();
  const back = params.get("back") ?? "/s/study";
  const backLabel = back.startsWith("/s/classes") ? "Back to class" : "Back to Self-Study";
  const [answers, setAnswers] = useState<(number | null)[] | null>(null);
  const [current, setCurrent] = useState(0);
  const [result, setResult] = useState<AttemptResultDto | null>(null);
  const [warn, setWarn] = useState(false);
  const qc = useQueryClient();

  const q = useQuery({ queryKey: ["activity", type, id], queryFn: () => api<ActivityDto>(`/activities/${type}/${id}`), staleTime: Infinity });
  const submit = useMutation({
    mutationFn: (a: (number | null)[]) => api<AttemptResultDto>(`/activities/${type}/${id}/submit`, { body: { answers: a } }),
    onSuccess: (r) => {
      setResult(r);
      window.scrollTo({ top: 0 });
      void qc.invalidateQueries({ queryKey: ["progress"] });
      void qc.invalidateQueries({ queryKey: ["study"] });
    },
  });

  if (q.isPending) return <FocusLayout exitTo={back} title="Loading">{<Loading />}</FocusLayout>;
  if (q.isError) return <FocusLayout exitTo={back} title="Couldn't open">{<ErrorState error={q.error} retry={() => q.refetch()} />}</FocusLayout>;
  const act = q.data;
  const ans = answers ?? act.questions.map(() => null);
  const setAnswer = (i: number, v: number) => setAnswers(ans.map((x, j) => (j === i ? v : x)));
  const unanswered = ans.filter((a) => a === null).length;

  function trySubmit() {
    if (unanswered && !warn) {
      setWarn(true);
      return;
    }
    submit.mutate(ans);
  }

  function retry() {
    setAnswers(null);
    setCurrent(0);
    setResult(null);
    setWarn(false);
    submit.reset();
    window.scrollTo({ top: 0 });
  }

  const submitBar = (
    <div className="flex flex-col gap-3">
      {warn && unanswered ? (
        <Alert>
          {unanswered} question{unanswered === 1 ? " is" : "s are"} unanswered and will count as wrong. Submit anyway, or go back and answer {unanswered === 1 ? "it" : "them"}.
        </Alert>
      ) : null}
      {submit.isError ? <Alert tone="danger">{errorMessage(submit.error)}</Alert> : null}
      <div>
        <Button onClick={trySubmit} loading={submit.isPending}>
          {warn && unanswered ? "Submit anyway" : "Submit answers"}
        </Button>
      </div>
    </div>
  );

  if (result) {
    return (
      <FocusLayout exitTo={back} title={act.title}>
        <Results result={result} onRetry={retry} backTo={back} backLabel={backLabel} />
      </FocusLayout>
    );
  }

  if (type === "quiz") {
    const question = act.questions[current];
    const last = current === act.questions.length - 1;
    return (
      <FocusLayout exitTo={back} title={act.title} progress={{ current: current + 1, total: act.questions.length }}>
        <Panel className="px-5 py-6">
          <ChoiceGroup key={current} q={question} index={current} value={ans[current]} onChange={(v) => setAnswer(current, v)} />
        </Panel>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <Button variant="secondary" icon="chevron-left" onClick={() => setCurrent((c) => c - 1)} disabled={current === 0}>
            Previous
          </Button>
          {last ? (
            submitBar
          ) : (
            <Button onClick={() => setCurrent((c) => c + 1)}>Next question</Button>
          )}
        </div>
      </FocusLayout>
    );
  }

  const questions = (
    <div className="flex flex-col gap-4">
      {act.questions.map((qq, i) => (
        <Panel key={i} className="px-5 py-5">
          <ChoiceGroup q={qq} index={i} value={ans[i]} onChange={(v) => setAnswer(i, v)} />
        </Panel>
      ))}
      {submitBar}
    </div>
  );
  const answered = act.questions.length - unanswered;

  if (type === "reading") {
    // FR-3.7.1: side by side on desktop; collapsible passage above questions on mobile.
    return (
      <FocusLayout exitTo={back} title={act.title} wide progress={{ current: answered, total: act.questions.length, noun: "Answered" }}>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="lg:sticky lg:top-20 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto">
            <details open className="rounded-paper border border-line bg-paper lg:[&>summary]:hidden">
              <summary className="min-h-11 cursor-pointer px-5 py-3 font-medium">Reading passage</summary>
              <div className="px-5 pb-6 pt-2 lg:pt-6">
                <h1 lang="ja" className="study-text mb-4 text-xl">
                  {act.title}
                </h1>
                <div lang="ja" className="study-text max-w-[40ch] whitespace-pre-line text-lg">
                  {act.passage}
                </div>
              </div>
            </details>
          </div>
          {questions}
        </div>
      </FocusLayout>
    );
  }

  // FR-3.8.2: the questions sit beside the player.
  return (
    <FocusLayout exitTo={back} title={act.title} wide progress={{ current: answered, total: act.questions.length, noun: "Answered" }}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="lg:sticky lg:top-20 lg:self-start">{act.audioUrl ? <ListeningPlayer src={act.audioUrl} title={act.title} /> : <Alert tone="danger">This test's clip is missing.</Alert>}</div>
        {questions}
      </div>
    </FocusLayout>
  );
}
