import { useCallback, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { JLPT_LEVELS, type ClassStudyDto, type JlptLevel, type StudyLibraryDto } from "@nihongo/shared";
import { api } from "../../../lib/api";
import { ErrorState, Loading } from "../../../components/ui";
import { FocusLayout } from "./FocusLayout";
import { FlashcardPlayer } from "./FlashcardPlayer";

/** Self-Study deck: pages of 50 load as the student nears the end (§14 Scalability). */
export function LibraryDeckPage() {
  const [params] = useSearchParams();
  const level = ((JLPT_LEVELS as readonly string[]).includes(params.get("level") ?? "") ? params.get("level") : "N5") as JlptLevel;
  const shuffle = params.get("shuffle") === "1";
  const [progress, setProgress] = useState({ current: 1, total: 0 });
  const q = useInfiniteQuery({
    queryKey: ["study", "deck", level, shuffle],
    queryFn: ({ pageParam }) => api<StudyLibraryDto>("/study/library", { query: { level, type: "flashcards", cursor: pageParam, shuffle: shuffle || undefined } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: Infinity,
  });
  const onIndex = useCallback((current: number, total: number) => setProgress({ current, total }), []);
  const cards = q.data?.pages.flatMap((p) => p.cards ?? []) ?? [];
  const total = shuffle ? cards.length : (q.data?.pages[0]?.total ?? cards.length);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;
  const more = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  return (
    <FocusLayout exitTo="/s/study" title={`${level} flashcards${shuffle ? ", random deck" : ""}`} progress={cards.length ? { current: progress.current, total, noun: "Card" } : null} background="genko">
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : <FlashcardPlayer cards={cards} onIndexChange={onIndex} onNeedMore={more} />}
    </FocusLayout>
  );
}

/** A class lesson's teacher flashcards: text only, no audio (FR-3.6.1). */
export function ClassDeckPage() {
  const { classId = "", lessonId = "" } = useParams();
  const [progress, setProgress] = useState({ current: 1, total: 0 });
  const q = useQuery({ queryKey: ["class-study", classId], queryFn: () => api<ClassStudyDto>(`/classes/${classId}/study`) });
  const lesson = q.data?.lessons.find((l) => l.id === lessonId);
  const onIndex = useCallback((current: number, total: number) => setProgress({ current, total }), []);
  return (
    <FocusLayout exitTo={`/s/classes/${classId}`} title={lesson?.title ?? "Flashcards"} progress={lesson?.flashcards.length ? { ...progress, noun: "Card" } : null} background="genko">
      {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> : <FlashcardPlayer cards={lesson?.flashcards ?? []} onIndexChange={onIndex} />}
    </FocusLayout>
  );
}
