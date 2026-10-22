import type { AttemptResultDto } from "@nihongo/shared";
import { Button, ButtonLink, Panel } from "../../../components/ui";
import { ListenButton } from "../../../components/audio";
import { Hanamaru, PassSeal, ReviewMark } from "./Hanamaru";

const LETTERS = ["A", "B", "C", "D"];

/**
 * FR-3.6.4: the score immediately, then the review. §13 Results: the score in
 * Klee One; on a pass the hanamaru draws around it with the 合格 seal.
 */
export function Results({ result, onRetry, backTo, backLabel }: { result: AttemptResultDto; onRetry: () => void; backTo: string; backLabel: string }) {
  return (
    <div className="flex flex-col gap-6">
      <Panel className="flex flex-col items-center px-6 py-8 text-center">
        <p role="status" aria-live="polite" className="sr-only">
          You scored {result.correctCount} out of {result.total}, {result.score} percent. {result.passed ? "Passed." : `Passing score is ${result.passingScorePct} percent.`}
        </p>
        <div className="relative flex h-60 w-60 items-center justify-center" aria-hidden="true">
          {result.passed ? <Hanamaru className="absolute inset-0 h-full w-full" /> : null}
          <div className="study-text relative flex flex-col items-center leading-tight">
            <span className="text-[2.75rem] font-semibold">
              {result.correctCount} / {result.total}
            </span>
            <span className="text-2xl text-ink-2">{result.score}%</span>
          </div>
        </div>
        {result.passed ? (
          <p className="mt-2 flex items-center gap-3 text-xl font-semibold">
            <PassSeal />
            Passed
          </p>
        ) : (
          <p className="mt-2 max-w-[48ch] text-ink-2">Passing score is {result.passingScorePct}%. Review the answers below, then try again.</p>
        )}
        <p className="mt-3 text-sm text-ink-2">
          Best score {result.bestScore}%, attempt {result.attemptCount}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button variant="secondary" icon="replay" onClick={onRetry}>
            Try again
          </Button>
          <ButtonLink to={backTo}>{backLabel}</ButtonLink>
        </div>
      </Panel>

      <section aria-labelledby="review-heading">
        <h2 id="review-heading" className="mb-3 text-lg">
          Review
        </h2>
        <ol className="flex flex-col gap-3">
          {result.review.map((r, i) => (
            <Panel as="li" key={i} className="px-4 py-4">
              <p className="mb-2 flex items-start gap-2">
                <ReviewMark correct={r.correct} />
                <span>
                  <span className="text-sm font-medium text-ink-2">
                    Question {i + 1}: {r.correct ? "Correct" : r.yourAnswer === null ? "Not answered" : "Incorrect"}
                  </span>
                  <span lang="ja" className="study-text block text-lg">
                    {r.text}
                  </span>
                </span>
              </p>
              <dl className="ml-9 flex flex-col gap-1">
                {r.correct ? (
                  <div className="flex gap-2">
                    <dt className="text-ink-2">Correct:</dt>
                    <dd lang="ja">
                      {LETTERS[r.correctIndex]}. {r.choices[r.correctIndex]}
                    </dd>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <dt className="flex items-center gap-1 text-ink-2">
                        <ReviewMark correct={false} />
                        Your answer:
                      </dt>
                      <dd lang="ja">{r.yourAnswer === null ? "No answer" : `${LETTERS[r.yourAnswer]}. ${r.choices[r.yourAnswer]}`}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="flex items-center gap-1 text-ink-2">
                        <ReviewMark correct />
                        Correct answer:
                      </dt>
                      <dd lang="ja">
                        {LETTERS[r.correctIndex]}. {r.choices[r.correctIndex]}
                      </dd>
                    </div>
                  </>
                )}
              </dl>
              {/* Decision 7: answer audio appears only here, after submission. */}
              {r.audioUrl ? (
                <div className="ml-9 mt-2">
                  <ListenButton src={r.audioUrl} label={`Play the answer to question ${i + 1}`} />
                </div>
              ) : null}
            </Panel>
          ))}
        </ol>
      </section>
    </div>
  );
}
