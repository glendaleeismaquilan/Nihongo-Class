import { Link } from "react-router";
import { useQueries } from "@tanstack/react-query";
import type { ClassReportDto, LiveSessionDto } from "@nihongo/shared";
import { api } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { formatTime, pct, relativeDay } from "../../lib/format";
import { ButtonAnchor, ButtonLink, EmptyState, Loading, PageHeader, Panel, SectionTitle } from "../../components/ui";
import { useClasses } from "../../features/classes/hooks";

/** §12 Teacher dashboard: today's live classes, recent results, materials not yet opened. */
export function TeacherDashboard() {
  const me = useMe();
  const classes = useClasses();
  const active = (classes.data ?? []).filter((c) => c.status === "active");
  const sessions = useQueries({
    queries: active.map((c) => ({ queryKey: ["class", c.id, "sessions"], queryFn: () => api<{ items: LiveSessionDto[] }>(`/classes/${c.id}/sessions`).then((r) => r.items) })),
  });
  const reports = useQueries({
    queries: active.map((c) => ({ queryKey: ["class", c.id, "reports"], queryFn: () => api<ClassReportDto>(`/classes/${c.id}/reports`) })),
  });
  if (classes.isPending) return <Loading />;
  const now = Date.now();
  const soon = sessions
    .flatMap((q, i) => (q.data ?? []).map((s) => ({ ...s, className: active[i].name })))
    .filter((s) => s.status === "scheduled" && new Date(s.endAt).getTime() > now && new Date(s.startAt).getTime() < now + 2 * 86_400_000)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const unopened = reports.flatMap((q, i) => (q.data?.materials ?? []).filter((m) => m.opened < m.total).map((m) => ({ ...m, classId: active[i].id, className: active[i].name })));

  return (
    <>
      <PageHeader title={`Welcome, ${me.name}`} actions={<ButtonLink to="/t/classes">My classes</ButtonLink>} />
      {!active.length ? (
        <EmptyState action={<ButtonLink to="/t/classes">Create a class</ButtonLink>}>You don't have a class yet. Create one, then share its code with your students.</EmptyState>
      ) : (
        <div className="flex flex-col gap-8">
          <section>
            <SectionTitle>Today and tomorrow</SectionTitle>
            {soon.length ? (
              <ul className="flex flex-col gap-2">
                {soon.map((s) => (
                  <Panel as="li" key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div>
                      <p className="font-medium">{s.title}</p>
                      <p className="text-sm text-ink-2">
                        {s.className}, {relativeDay(s.startAt)} {formatTime(s.startAt)} to {formatTime(s.endAt, { withZone: true })}
                      </p>
                    </div>
                    {s.meetUrl ? (
                      <ButtonAnchor size="sm" href={s.meetUrl} target="_blank" rel="noopener noreferrer" icon="video">
                        Open Meet
                      </ButtonAnchor>
                    ) : null}
                  </Panel>
                ))}
              </ul>
            ) : (
              <p className="text-ink-2">No live classes today or tomorrow.</p>
            )}
          </section>
          <section>
            <SectionTitle>Recent results</SectionTitle>
            <ul className="grid gap-3 sm:grid-cols-2">
              {active.map((c, i) => {
                const r = reports[i].data;
                const attempts = r?.quizzes.reduce((n, q) => n + q.attempts, 0) ?? 0;
                const scores = r?.quizzes.filter((q) => q.averageScore !== null).map((q) => q.averageScore!) ?? [];
                return (
                  <Panel as="li" key={c.id} className="px-4 py-3">
                    <Link to={`/t/classes/${c.id}/reports`} className="font-medium">
                      {c.name}
                    </Link>
                    <p className="text-sm text-ink-2">
                      {r ? `${attempts} quiz attempts, average ${pct(scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null)}` : "Loading…"}
                    </p>
                  </Panel>
                );
              })}
            </ul>
          </section>
          <section>
            <SectionTitle>Materials not opened by everyone</SectionTitle>
            {unopened.length ? (
              <ul className="flex flex-col gap-2">
                {unopened.map((m) => (
                  <Panel as="li" key={m.materialId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div>
                      <Link to={`/t/classes/${m.classId}/materials`} className="font-medium">
                        {m.title}
                      </Link>
                      <p className="text-sm text-ink-2">{m.className}</p>
                    </div>
                    <span className="text-sm">
                      Opened by {m.opened} of {m.total}
                    </span>
                  </Panel>
                ))}
              </ul>
            ) : (
              <p className="text-ink-2">Every student has opened every published material.</p>
            )}
          </section>
        </div>
      )}
    </>
  );
}
