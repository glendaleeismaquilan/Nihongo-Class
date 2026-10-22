import { useCallback, useEffect, useState } from "react";
import type { StudyCardDto } from "@nihongo/shared";
import { Button, EmptyState } from "../../../components/ui";
import { ListenButton, PreloadAudio } from "../../../components/audio";

/** Each character of the term in its own genkō yōshi square (§13 Layout). */
function GenkoTerm({ term }: { term: string }) {
  return (
    <span className="genko-cells" aria-hidden="true">
      {[...term].map((c, i) => (
        <span key={i} className="genko-cell">
          {c}
        </span>
      ))}
    </span>
  );
}

/** Ruby reading over the term, skipped when the reading equals the term (§13 Type). */
export function TermWithReading({ term, reading }: { term: string; reading: string }) {
  if (term === reading) {
    return (
      <span lang="ja" className="study-text">
        {term}
      </span>
    );
  }
  return (
    <ruby lang="ja" className="study-text">
      {term}
      <rt className="text-[0.45em] text-ink-2">{reading}</rt>
    </ruby>
  );
}

function shuffled<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const cardShadow = "shadow-[0_6px_20px_rgb(28_36_51/0.12)]";

/**
 * §7.6 flashcard study: a flip card with next, previous, and shuffle. Tap,
 * Space, or Enter flips; ← and → move between cards. Remount with a new key
 * for a different deck; more cards appended to `cards` are added at the end.
 */
export function FlashcardPlayer({
  cards,
  onIndexChange,
  onNeedMore,
}: {
  cards: StudyCardDto[];
  onIndexChange?: (current: number, total: number) => void;
  onNeedMore?: () => void;
}) {
  const [order, setOrder] = useState(cards);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    setOrder((prev) => [...prev, ...cards.filter((c) => !prev.some((p) => p.id === c.id))]);
  }, [cards]);

  useEffect(() => onIndexChange?.(index + 1, order.length), [index, order.length, onIndexChange]);

  const go = useCallback(
    (d: number) => {
      setFlipped(false);
      setIndex((i) => {
        const next = Math.min(Math.max(i + d, 0), Math.max(order.length - 1, 0));
        if (next >= order.length - 3) onNeedMore?.();
        return next;
      });
    },
    [order.length, onNeedMore],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement).closest("input, textarea, select")) return;
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (!order.length) return <EmptyState>No flashcards here yet.</EmptyState>;
  const card = order[index];
  const next = order[index + 1];

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative w-full max-w-[56rem]">
        <button
          type="button"
          onClick={() => setFlipped((f) => !f)}
          aria-live="polite"
          aria-label={flipped ? undefined : `Card ${index + 1} of ${order.length}. Press to flip.`}
          className="flip-card block w-full text-left"
          style={{ containerType: "inline-size" }}
        >
          <span className={`flip-inner block ${flipped ? "is-flipped" : ""}`}>
            <span
              className={`flip-face flip-front flex min-h-[22rem] w-full flex-col items-center justify-center rounded-paper border border-line bg-paper px-4 py-10 ${cardShadow}`}
              style={{ ["--cell-size" as string]: "min(calc(clamp(3rem, 12vw, 6rem) * 1.25), calc((100cqi - 3rem) / 8))" }}
              aria-hidden={flipped}
            >
              <span lang="ja" className="sr-only">
                {card.term}
              </span>
              <GenkoTerm term={card.term} />
              <span className="mt-6 text-sm text-ink-2">Tap, or press Space, to flip</span>
            </span>
            <span
              className={`flip-face flip-back flex min-h-[22rem] w-full flex-col items-center justify-center gap-4 rounded-paper border border-line bg-paper px-6 pb-20 pt-8 text-center ${cardShadow}`}
              aria-hidden={!flipped}
            >
              <span className="text-[clamp(2.25rem,8vw,4rem)] leading-[1.9]">
                <TermWithReading term={card.term} reading={card.reading} />
              </span>
              <span className="text-xl">{card.meaning}</span>
              {card.exampleSentence ? (
                <span lang="ja" className="study-text max-w-[40ch] text-lg text-ink-2">
                  {card.exampleSentence}
                </span>
              ) : null}
            </span>
          </span>
        </button>
        {flipped && card.audioUrl ? (
          <div className="absolute inset-x-0 bottom-6 flex justify-center">
            <ListenButton src={card.audioUrl} label={`Play pronunciation of ${card.term}`} />
          </div>
        ) : null}
      </div>
      {/* Preload the current and next clips (§14 Performance). */}
      <PreloadAudio src={card.audioUrl} />
      <PreloadAudio src={next?.audioUrl} />
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button variant="secondary" icon="chevron-left" onClick={() => go(-1)} disabled={index === 0}>
          Previous
        </Button>
        <Button variant="secondary" onClick={() => go(1)} disabled={index >= order.length - 1}>
          Next
        </Button>
        <Button
          variant="ghost"
          icon="shuffle"
          onClick={() => {
            setOrder((o) => shuffled(o));
            setIndex(0);
            setFlipped(false);
          }}
        >
          Shuffle
        </Button>
      </div>
      <p className="text-sm text-ink-2">Use the left and right arrow keys to move between cards.</p>
    </div>
  );
}
