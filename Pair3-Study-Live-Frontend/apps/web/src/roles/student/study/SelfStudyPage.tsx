import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router";
import type { JlptLevel, LibraryType, StudyItemDto, StudyLibraryDto } from "@nihongo/shared";
import { api } from "../../../lib/api";
import { useMe } from "../../../lib/auth";
import { Badge, Button, ButtonLink, EmptyState, ErrorState, Loading, PageHeader, Panel, Segmented, levelStripe, useToast } from "../../../components/ui";
import { LevelSwitcher } from "../../../components/LevelSwitcher";
import { LEVEL_INFO } from "../ChooseLevelPage";

const TYPES: { value: LibraryType; label: string }[] = [
  { value: "flashcards", label: "Flashcards" },
  { value: "quizzes", label: "Quizzes" },
  { value: "reading-tests", label: "Reading" },
  { value: "listening-tests", label: "Listening" },
];

export function ItemRow({ item, back }: { item: StudyItemDto; back: string }) {
  return (
    <Panel as="li" className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p lang="ja" className="study-text text-lg">
          {item.title}
        </p>
        <p className="text-sm text-ink-2">
          {item.questionCount} questions, pass at {item.passingScorePct}%
          {item.attemptCount ? `, best ${item.bestScore}%` : ""}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {item.bestScore !== null && item.bestScore >= item.passingScorePct ? <Badge tone="success">Passed</Badge> : null}
        <ButtonLink size="sm" variant={item.attemptCount ? "secondary" : "primary"} to={`/s/activities/${item.type}/${item.id}?back=${encodeURIComponent(back)}`}>
          {item.attemptCount ? "Try again" : "Start"}
        </ButtonLink>
      </div>
    </Panel>
  );
}

/** FR-3.6.2: built-in content for the chosen level, which the student can change anytime. */
export function SelfStudyPage() {
  const me = useMe();
  const level: JlptLevel = me.studyLevel ?? "N5";
  const [params, setParams] = useSearchParams();
  const type = (TYPES.some((t) => t.value === params.get("type")) ? params.get("type") : "flashcards") as LibraryType;
  const qc = useQueryClient();
  const toast = useToast();

  async function changeLevel(l: JlptLevel) {
    qc.setQueryData(["me", me.uid], { ...me, studyLevel: l });
    try {
      await api("/me", { method: "PATCH", body: { studyLevel: l } });
    } catch {
      toast("Couldn't save your level. Try again.", "danger");
    }
    void qc.invalidateQueries({ queryKey: ["me"] });
  }

  return (
    <>
      <PageHeader title="Self-Study" description="Built-in lessons with audio, free for every student. Pick your JLPT level." />
      <div className="mb-2">
        <LevelSwitcher value={level} onChange={(l) => void changeLevel(l)} label="Study level" />
      </div>
      <p className="mb-6 text-sm text-ink-2">
        {level} {LEVEL_INFO[level].name}: {LEVEL_INFO[level].description}
      </p>
      <div className="mb-4">
        <Segmented label="What to study" value={type} onChange={(v) => setParams({ type: v }, { replace: true })} options={TYPES} />
      </div>
      {type === "flashcards" ? <FlashcardsSection level={level} /> : <ItemsSection key={`${type}-${level}`} level={level} type={type} />}
    </>
  );
}

function FlashcardsSection({ level }: { level: JlptLevel }) {
  const q = useQuery({
    queryKey: ["study", "flashcards", level, "first"],
    queryFn: () => api<StudyLibraryDto>("/study/library", { query: { level, type: "flashcards" } }),
  });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!q.data.total) return <EmptyState>No {level} flashcards yet. Try another level, or check back soon.</EmptyState>;
  return (
    <Panel className={`px-5 py-5 ${levelStripe(level)}`}>
      <h2 className="text-lg">{level} flashcards</h2>
      <p className="mt-1 text-ink-2">
        {q.data.total} cards with pronunciation. Flip each card to see the reading, meaning, and an example sentence.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <ButtonLink to={`/s/study/flashcards?level=${level}`}>Study in order</ButtonLink>
        <ButtonLink variant="secondary" icon="shuffle" to={`/s/study/flashcards?level=${level}&shuffle=1`}>
          Random deck
        </ButtonLink>
      </div>
      <ul className="mt-5 flex flex-wrap gap-2" aria-label="First cards">
        {q.data.cards!.slice(0, 12).map((c) => (
          <li key={c.id} lang="ja" className="study-text rounded-paper border border-line px-3 py-1 text-lg">
            {c.term}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function ItemsSection({ level, type }: { level: JlptLevel; type: LibraryType }) {
  const q = useInfiniteQuery({
    queryKey: ["study", type, level],
    queryFn: ({ pageParam }) => api<StudyLibraryDto>("/study/library", { query: { level, type, cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const items = q.data.pages.flatMap((p) => p.items ?? []);
  const noun = TYPES.find((t) => t.value === type)!.label.toLowerCase();
  if (!items.length) return <EmptyState>No {level} {noun === "reading" || noun === "listening" ? `${noun} tests` : noun} yet. Try another level.</EmptyState>;
  return (
    <>
      <ul className="flex flex-col gap-2">
        {items.map((i) => (
          <ItemRow key={i.id} item={i} back={`/s/study?type=${type}`} />
        ))}
      </ul>
      {q.hasNextPage ? (
        <Button variant="secondary" className="mt-4" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>
          Show more
        </Button>
      ) : null}
    </>
  );
}
