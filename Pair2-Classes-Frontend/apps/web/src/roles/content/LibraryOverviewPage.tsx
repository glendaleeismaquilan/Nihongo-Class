import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { JLPT_LEVELS, type LibraryOverviewDto } from "@nihongo/shared";
import { api } from "../../lib/api";
import { DataTable, ErrorState, LevelTag, Loading, PageHeader } from "../../components/ui";

export function LibraryOverviewPage() {
  const q = useQuery({ queryKey: ["library", "overview"], queryFn: () => api<LibraryOverviewDto>("/library/overview") });
  return (
    <>
      <PageHeader title="Built-in library" description="Flashcards, quizzes, reading tests, and listening tests for every JLPT level. Self-Study shows published items only." />
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <DataTable label="Library counts by level">
          <thead>
            <tr>
              <th scope="col">Level</th>
              <th scope="col">Flashcards</th>
              <th scope="col">Quizzes</th>
              <th scope="col">Reading tests</th>
              <th scope="col">Listening tests</th>
              <th scope="col">Drafts</th>
            </tr>
          </thead>
          <tbody>
            {JLPT_LEVELS.map((l) => {
              const c = q.data.levels[l];
              return (
                <tr key={l}>
                  <td>
                    <LevelTag level={l} />
                  </td>
                  <td>
                    <Link to={`/c/flashcards?level=${l}`}>{c.flashcards}</Link>
                  </td>
                  <td>
                    <Link to={`/c/quizzes?level=${l}`}>{c.quizzes}</Link>
                  </td>
                  <td>
                    <Link to={`/c/reading-tests?level=${l}`}>{c.readingTests}</Link>
                  </td>
                  <td>
                    <Link to={`/c/listening-tests?level=${l}`}>{c.listeningTests}</Link>
                  </td>
                  <td className={c.drafts ? "font-medium" : "text-ink-2"}>{c.drafts}</td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}
    </>
  );
}
