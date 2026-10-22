import { Link } from "react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { LiveSessionDto, MaterialDto, ProgressMeDto } from "@nihongo/shared";
import { api } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { formatDateTime, formatTime } from "../../lib/format";
import { useNow } from "../../lib/useNow";
import { ButtonLink, Loading, PageHeader, Panel, SectionTitle, StatTile, levelStripe } from "../../components/ui";
import { useClasses } from "../../features/classes/hooks";
import { JoinButton, joinState } from "../../features/live/JoinButton";

/** §13: lead with the one thing to do next: a live class to join, or study. */
export function StudentDashboard() {
  const me = useMe();
  const now = useNow();
  const classes = useClasses();
  const active = (classes.data ?? []).filter((c) => c.enrollment?.status === "active");
  const sessions = useQueries({
    queries: active.map((c) => ({
      queryKey: ["class", c.id, "sessions"],
      queryFn: () => api<{ items: LiveSessionDto[] }>(`/classes/${c.id}/sessions`).then((r) => r.items),
    })),
  });
  const materials = useQueries({
    queries: active.map((c) => ({
      queryKey: ["class", c.id, "materials"],
      queryFn: () => api<{ items: MaterialDto[] }>(`/classes/${c.id}/materials`).then((r) => r.items),
    })),
  });
  const progress = useQuery({ queryKey: ["progress", "all"], queryFn: () => api<ProgressMeDto>("/progress/me") });

  if (classes.isPending) return <Loading />;
  const upcoming = sessions
    .flatMap((q, i) => (q.data ?? []).map((s) => ({ ...s, className: active[i].name })))
    .filter((s) => s.status === "scheduled" && new Date(s.endAt).getTime() > now)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const joinable = upcoming.find((s) => joinState(s, now) === "open");
  const fresh = materials.flatMap((q, i) => (q.data ?? []).filter((m) => !m.viewed).map((m) => ({ ...m, className: active[i].name })));

  return (
    <>
      <PageHeader title={`Welcome back, ${me.name}`} />
      {joinable ? (
        <Panel className="mb-6 border-ai px-5 py-5">
          <p className="text-sm font-medium text-matcha">Live now</p>
          <h2 className="mt-1 text-xl">{joinable.title}</h2>
          <p className="text-ink-2">
            {joinable.className}, {formatTime(joinable.startAt)} to {formatTime(joinable.endAt, { withZone: true })}
          </p>
          <div className="mt-4">
            <JoinButton session={joinable} />
          </div>
        </Panel>
      ) : (
        <Panel className={`mb-6 px-5 py-5 ${levelStripe(me.studyLevel)}`}>
          <h2 className="text-lg">Continue studying</h2>
          <p className="mt-1 text-ink-2">
            {active.length ? `Review your class lessons, or practice ${me.studyLevel} in Self-Study.` : `Practice ${me.studyLevel} flashcards and quizzes, or join your teacher's class with a class code.`}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {active[0] ? <ButtonLink to={`/s/classes/${active[0].id}`}>Open {active[0].name}</ButtonLink> : null}
            <ButtonLink to="/s/study" variant={active[0] ? "secondary" : "primary"}>
              Open Self-Study
            </ButtonLink>
            {!active.length ? (
              <ButtonLink to="/s/join" variant="secondary">
                Join a class
              </ButtonLink>
            ) : null}
          </div>
        </Panel>
      )}

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <StatTile label="Study streak" value={progress.data ? `${progress.data.streak} day${progress.data.streak === 1 ? "" : "s"}` : "…"} hint="Days in a row with a graded quiz or test" />
        <StatTile label="Average score" value={progress.data?.averageScore != null ? `${progress.data.averageScore}%` : "No scores yet"} />
        <StatTile label="Classes" value={active.length} hint="All classes are free" />
      </div>

      {upcoming.length ? (
        <section className="mb-8">
          <SectionTitle>Upcoming live classes</SectionTitle>
          <ul className="flex flex-col gap-2">
            {upcoming.slice(0, 3).map((s) => (
              <Panel as="li" key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <p className="font-medium">{s.title}</p>
                  <p className="text-sm text-ink-2">
                    {s.className}, {formatDateTime(s.startAt)}
                  </p>
                </div>
                <JoinButton session={s} size="sm" />
              </Panel>
            ))}
          </ul>
        </section>
      ) : null}

      {fresh.length ? (
        <section>
          <SectionTitle>New materials</SectionTitle>
          <ul className="flex flex-col gap-2">
            {fresh.slice(0, 5).map((m) => (
              <Panel as="li" key={m.id} className="px-4 py-3">
                <Link to={`/s/classes/${m.classId}/materials`} className="font-medium">
                  {m.title}
                </Link>
                <p className="text-sm text-ink-2">{m.className}</p>
              </Panel>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
