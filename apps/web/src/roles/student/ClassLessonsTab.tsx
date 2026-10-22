import { useQuery } from "@tanstack/react-query";
import type { ClassStudyDto } from "@nihongo/shared";
import { api } from "../../lib/api";
import { ButtonLink, EmptyState, ErrorState, Loading, Panel } from "../../components/ui";
import { useStudentClass } from "./ClassPage";
import { ItemRow } from "./study/SelfStudyPage";

/** FR-3.6.1: the class view shows only this class's teacher content. */
export function ClassLessonsTab() {
  const { cls } = useStudentClass();
  const q = useQuery({ queryKey: ["class-study", cls.id], queryFn: () => api<ClassStudyDto>(`/classes/${cls.id}/study`) });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!q.data.lessons.length) return <EmptyState>Your teacher hasn't added lessons yet.</EmptyState>;
  const back = `/s/classes/${cls.id}`;
  return (
    <ol className="flex flex-col gap-4">
      {q.data.lessons.map((l) => (
        <Panel as="li" key={l.id} className="px-4 py-4">
          <h2 className="text-lg">{l.title}</h2>
          {l.description ? <p className="mt-1 text-ink-2">{l.description}</p> : null}
          <div className="mt-3 flex flex-col gap-2">
            {l.flashcards.length ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-paper border border-line px-4 py-3">
                <p>
                  {l.flashcards.length} flashcard{l.flashcards.length === 1 ? "" : "s"}
                </p>
                <ButtonLink size="sm" to={`/s/classes/${cls.id}/lessons/${l.id}/flashcards`}>
                  Study flashcards
                </ButtonLink>
              </div>
            ) : null}
            {l.quizzes.length ? (
              <ul className="flex flex-col gap-2">
                {l.quizzes.map((q) => (
                  <ItemRow key={q.id} item={q} back={back} />
                ))}
              </ul>
            ) : null}
            {!l.flashcards.length && !l.quizzes.length ? <p className="text-ink-2">Nothing in this lesson yet.</p> : null}
          </div>
        </Panel>
      ))}
    </ol>
  );
}
