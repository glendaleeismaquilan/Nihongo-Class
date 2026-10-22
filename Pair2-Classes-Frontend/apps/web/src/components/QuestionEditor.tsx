import type { ReactNode } from "react";
import { Button, IconButton, Panel, TextArea, TextField } from "./ui";

export interface EditableQuestion {
  text: string;
  choices: [string, string, string, string];
  correctIndex: number | null;
  audioUrl?: string | null;
  audioFileName?: string | null;
}

export const emptyQuestion = (): EditableQuestion => ({ text: "", choices: ["", "", "", ""], correctIndex: null });

const LETTERS = ["A", "B", "C", "D"];

export function validateQuestions(qs: EditableQuestion[]): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!qs.length) errors.questions = "Add at least one question.";
  qs.forEach((q, i) => {
    if (!q.text.trim()) errors[`questions.${i}.text`] = "Enter the question.";
    q.choices.forEach((c, j) => {
      if (!c.trim()) errors[`questions.${i}.choices.${j}`] = `Enter choice ${LETTERS[j]}.`;
    });
    if (q.correctIndex === null) errors[`questions.${i}.correctIndex`] = "Mark the correct choice.";
  });
  return errors;
}

/**
 * Decision 11: one four-choice question editor for teacher quizzes, built-in
 * quizzes, reading tests, and listening tests.
 */
export function QuestionEditor({
  questions,
  onChange,
  errors,
  extra,
}: {
  questions: EditableQuestion[];
  onChange: (qs: EditableQuestion[]) => void;
  errors: Record<string, string>;
  extra?: (index: number) => ReactNode;
}) {
  const update = (i: number, patch: Partial<EditableQuestion>) => onChange(questions.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, d: number) => {
    const next = [...questions];
    const [q] = next.splice(i, 1);
    next.splice(i + d, 0, q);
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-4">
      {errors.questions ? <p className="text-shu">{errors.questions}</p> : null}
      {questions.map((q, i) => (
        <Panel key={i} as="div" className="px-4 py-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="font-semibold">Question {i + 1}</h3>
            <div className="flex">
              <IconButton icon="arrowUp" label={`Move question ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)} />
              <IconButton icon="arrowDown" label={`Move question ${i + 1} down`} disabled={i === questions.length - 1} onClick={() => move(i, 1)} />
              <IconButton icon="trash" label={`Delete question ${i + 1}`} disabled={questions.length === 1} onClick={() => onChange(questions.filter((_, j) => j !== i))} />
            </div>
          </div>
          <TextArea label="Question" rows={2} lang="ja" value={q.text} onChange={(e) => update(i, { text: e.target.value })} error={errors[`questions.${i}.text`]} />
          <fieldset className="mt-3">
            <legend className="mb-1 text-sm font-medium">Choices (mark the correct one)</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {q.choices.map((c, j) => (
                <div key={j} className="flex items-end gap-2">
                  <label className="flex min-h-11 items-center gap-1.5 text-sm" title={`Choice ${LETTERS[j]} is correct`}>
                    <input
                      type="radio"
                      name={`correct-${i}`}
                      className="h-5 w-5 accent-[var(--ai)]"
                      checked={q.correctIndex === j}
                      onChange={() => update(i, { correctIndex: j })}
                      aria-label={`Choice ${LETTERS[j]} is correct`}
                    />
                  </label>
                  <TextField
                    className="flex-1"
                    label={`Choice ${LETTERS[j]}`}
                    value={c}
                    onChange={(e) => {
                      const choices = [...q.choices] as EditableQuestion["choices"];
                      choices[j] = e.target.value;
                      update(i, { choices });
                    }}
                    error={errors[`questions.${i}.choices.${j}`]}
                  />
                </div>
              ))}
            </div>
            {errors[`questions.${i}.correctIndex`] ? <p className="mt-2 text-sm text-shu">{errors[`questions.${i}.correctIndex`]}</p> : null}
          </fieldset>
          {extra ? <div className="mt-3">{extra(i)}</div> : null}
        </Panel>
      ))}
      <div>
        <Button variant="secondary" icon="plus" onClick={() => onChange([...questions, emptyQuestion()])}>
          Add question
        </Button>
      </div>
    </div>
  );
}

export function toApiQuestions(qs: EditableQuestion[], withAudio = false) {
  return qs.map((q) => ({
    text: q.text.trim(),
    choices: q.choices.map((c) => c.trim()),
    correctIndex: q.correctIndex ?? 0,
    ...(withAudio && q.audioUrl ? { audioUrl: q.audioUrl } : {}),
  }));
}
