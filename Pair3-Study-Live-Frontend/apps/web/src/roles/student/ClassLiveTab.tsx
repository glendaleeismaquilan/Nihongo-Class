import type { AttendanceStatus, LiveSessionDto } from "@nihongo/shared";
import { formatDateTime, formatTime, zoneLongName } from "../../lib/format";
import { useNow } from "../../lib/useNow";
import { Badge, ButtonAnchor, EmptyState, ErrorState, Loading, Panel, SectionTitle } from "../../components/ui";
import { useClassSessions } from "../../features/materials/materialsApi";
import { JoinButton, joinState } from "../../features/live/JoinButton";
import { useStudentClass } from "./ClassPage";

const ATT_LABEL: Record<AttendanceStatus, string> = { present: "Present", late: "Late", absent: "Absent", excused: "Excused" };

export function SessionCard({ s, showClass }: { s: LiveSessionDto; showClass?: boolean }) {
  const now = useNow();
  const state = joinState(s, now);
  return (
    <Panel as="li" className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
      <div className="min-w-0">
        <p className="font-semibold">
          {s.title}
          {showClass && s.className ? <span className="font-normal text-ink-2"> in {s.className}</span> : null}
        </p>
        <p className="text-ink-2">
          {formatDateTime(s.startAt, { withZone: false })} to {formatTime(s.endAt, { withZone: true })}
        </p>
        {s.description ? <p className="mt-1 max-w-[70ch] text-sm text-ink-2">{s.description}</p> : null}
        {state === "open" ? <p className="mt-1 text-sm font-medium text-matcha">Open now</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {s.status === "cancelled" ? <Badge>Cancelled</Badge> : null}
        {state === "over" && s.status !== "cancelled" ? <Badge tone={s.myAttendance === "absent" ? "danger" : s.myAttendance ? "success" : "neutral"}>{s.myAttendance ? ATT_LABEL[s.myAttendance] : "Finished"}</Badge> : null}
        {s.addToCalendarUrl && state === "early" ? (
          <ButtonAnchor size="sm" variant="secondary" href={s.addToCalendarUrl} target="_blank" rel="noopener noreferrer" icon="calendar">
            Add to Google Calendar
          </ButtonAnchor>
        ) : null}
        <JoinButton session={s} />
      </div>
    </Panel>
  );
}

/** FR-3.11.7: upcoming sessions in the student's local time, with the zone shown. */
export function ClassLiveTab() {
  const { cls } = useStudentClass();
  const q = useClassSessions(cls.id);
  const now = useNow();
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const upcoming = q.data.filter((s) => s.status === "scheduled" && new Date(s.endAt).getTime() > now);
  const past = q.data.filter((s) => !upcoming.includes(s)).reverse();
  return (
    <>
      <p className="mb-4 text-sm text-ink-2">Times are shown in your time zone, {zoneLongName()}. Join opens 15 minutes before each class starts.</p>
      <section className="mb-8">
        <SectionTitle>Upcoming</SectionTitle>
        {upcoming.length ? (
          <ul className="flex flex-col gap-3">
            {upcoming.map((s) => (
              <SessionCard key={s.id} s={s} />
            ))}
          </ul>
        ) : (
          <EmptyState>No live classes scheduled yet. Your teacher's live classes will show up here with a Join button.</EmptyState>
        )}
      </section>
      {past.length ? (
        <section>
          <SectionTitle>Past</SectionTitle>
          <ul className="flex flex-col gap-3">
            {past.map((s) => (
              <SessionCard key={s.id} s={s} />
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
