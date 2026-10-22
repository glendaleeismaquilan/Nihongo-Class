import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ATTENDANCE_STATUSES, type AttendanceRowDto, type AttendanceStatus, type LiveSessionDto } from "@nihongo/shared";
import { api, errorMessage } from "../../lib/api";
import { formatDateTime, formatTime } from "../../lib/format";
import { Alert, Button, DataTable, ErrorState, Icon, Loading, useToast } from "../../components/ui";
import { useWorkspace } from "../classes/ClassWorkspace";

const LABEL: Record<AttendanceStatus, string> = { present: "Present", late: "Late", absent: "Absent", excused: "Excused" };
const SOURCE: Record<string, string> = { join_click: "Joined from the app", teacher: "Set by staff", system: "No check-in" };

/** FR-3.11.8: review and edit attendance. */
export function AttendancePage() {
  const { cls, basePath, readOnly } = useWorkspace();
  const { sessionId = "" } = useParams();
  const q = useQuery({ queryKey: ["session", sessionId, "attendance"], queryFn: () => api<{ session: LiveSessionDto; items: AttendanceRowDto[] }>(`/sessions/${sessionId}/attendance`) });
  const [draft, setDraft] = useState<Record<string, AttendanceStatus>>({});
  const qc = useQueryClient();
  const toast = useToast();
  useEffect(() => setDraft({}), [q.data]);
  const save = useMutation({
    mutationFn: () => api(`/sessions/${sessionId}/attendance`, { method: "PUT", body: { records: Object.entries(draft).map(([uid, status]) => ({ uid, status })) } }),
    onSuccess: () => {
      toast("Attendance saved");
      void qc.invalidateQueries({ queryKey: ["session", sessionId, "attendance"] });
      void qc.invalidateQueries({ queryKey: ["class", cls.id, "reports"] });
    },
    onError: (err) => toast(errorMessage(err), "danger"),
  });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const { session, items } = q.data;
  const changed = Object.keys(draft).length;
  return (
    <>
      <Link to={`${basePath}/live`} className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm no-underline">
        <Icon name="chevron-left" size={16} />
        Live classes
      </Link>
      <h2 className="text-xl">{session.title}</h2>
      <p className="mb-4 text-ink-2">
        {formatDateTime(session.startAt, { withZone: false })} to {formatTime(session.endAt, { withZone: true })}
      </p>
      {session.status === "scheduled" ? (
        <div className="mb-4">
          <Alert>Students who press Join are checked in automatically; more than 10 minutes after the start counts as late. When the class ends, anyone without a check-in is marked absent.</Alert>
        </div>
      ) : null}
      <DataTable label="Attendance">
        <thead>
          <tr>
            <th scope="col">Student</th>
            <th scope="col">Status</th>
            <th scope="col">Joined</th>
            <th scope="col">Recorded</th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => {
            const value = draft[r.uid] ?? r.status ?? "";
            return (
              <tr key={r.uid}>
                <td className="font-medium">{r.name}</td>
                <td>
                  <label className="sr-only" htmlFor={`att-${r.uid}`}>
                    Attendance for {r.name}
                  </label>
                  <select
                    id={`att-${r.uid}`}
                    className="min-h-11 rounded-control border border-line bg-paper px-2"
                    value={value}
                    disabled={readOnly}
                    onChange={(e) => setDraft((d) => ({ ...d, [r.uid]: e.target.value as AttendanceStatus }))}
                  >
                    {!r.status && !draft[r.uid] ? <option value="">Not recorded yet</option> : null}
                    {ATTENDANCE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {LABEL[s]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="whitespace-nowrap text-ink-2">{r.joinedAt ? formatTime(r.joinedAt, { withZone: true }) : "Didn't join"}</td>
                <td className="text-ink-2">{r.source ? SOURCE[r.source] : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
      <div className="mt-4 flex gap-2">
        <Button onClick={() => save.mutate()} disabled={!changed} loading={save.isPending}>
          Save attendance{changed ? ` (${changed})` : ""}
        </Button>
        {changed ? (
          <Button variant="secondary" onClick={() => setDraft({})}>
            Discard changes
          </Button>
        ) : null}
      </div>
    </>
  );
}
