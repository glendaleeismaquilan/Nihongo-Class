import { useSearchParams } from "react-router";
import { useInfiniteQuery } from "@tanstack/react-query";
import type { ActivityType, ProgressMeDto } from "@nihongo/shared";
import { api } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { Badge, Button, DataTable, EmptyState, ErrorState, Loading, PageHeader, Segmented, StatTile } from "../../components/ui";

const TYPE_LABEL: Record<ActivityType, string> = { quiz: "Quiz", reading: "Reading", listening: "Listening" };

/** FR-3.9.2: streak, average score, and full history, filterable by type. */
export function ProgressPage() {
  const [params, setParams] = useSearchParams();
  const type = (["quiz", "reading", "listening"].includes(params.get("type") ?? "") ? params.get("type") : "all") as ActivityType | "all";
  const q = useInfiniteQuery({
    queryKey: ["progress", type],
    queryFn: ({ pageParam }) => api<ProgressMeDto>("/progress/me", { query: { type: type === "all" ? undefined : type, cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const first = q.data?.pages[0];
  const history = q.data?.pages.flatMap((p) => p.history) ?? [];
  return (
    <>
      <PageHeader title="Progress" />
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-3">
            <StatTile label="Study streak" value={`${first!.streak} day${first!.streak === 1 ? "" : "s"}`} hint="Days in a row with a graded quiz or test" />
            <StatTile label={type === "all" ? "Average score" : `Average ${TYPE_LABEL[type].toLowerCase()} score`} value={first!.averageScore === null ? "No scores yet" : `${first!.averageScore}%`} />
            <StatTile label="Attempts" value={first!.attemptCount} />
          </div>
          <div className="mb-4">
            <Segmented
              label="Activity type"
              value={type}
              onChange={(v) => setParams(v === "all" ? {} : { type: v }, { replace: true })}
              options={[
                { value: "all", label: "All" },
                { value: "quiz", label: "Quizzes" },
                { value: "reading", label: "Reading" },
                { value: "listening", label: "Listening" },
              ]}
            />
          </div>
          {history.length === 0 ? (
            <EmptyState>No attempts yet. Take a quiz or test, and your scores will show up here.</EmptyState>
          ) : (
            <DataTable label="Attempt history">
              <thead>
                <tr>
                  <th scope="col">Activity</th>
                  <th scope="col">Type</th>
                  <th scope="col">Score</th>
                  <th scope="col">Result</th>
                  <th scope="col">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td lang="ja" className="study-text">
                      {h.title}
                    </td>
                    <td>{TYPE_LABEL[h.activityType]}</td>
                    <td className="whitespace-nowrap">
                      {h.correctCount} / {h.total} ({h.score}%)
                    </td>
                    <td>{h.passed ? <Badge tone="success">Passed</Badge> : <Badge>Not yet</Badge>}</td>
                    <td className="whitespace-nowrap text-ink-2">{formatDateTime(h.submittedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
          {q.hasNextPage ? (
            <Button variant="secondary" className="mt-4" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>
              Show older attempts
            </Button>
          ) : null}
        </>
      )}
    </>
  );
}
