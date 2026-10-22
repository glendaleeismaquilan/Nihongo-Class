import { useQuery } from "@tanstack/react-query";
import type { ClassReportDto } from "@nihongo/shared";
import { api } from "../../lib/api";
import { formatDateTime, pct } from "../../lib/format";
import { DataTable, EmptyState, ErrorState, Loading, SectionTitle, StatTile } from "../../components/ui";
import { useWorkspace } from "./ClassWorkspace";

/** FR-3.9.3: results per quiz and per student, attendance rate (FR-3.11.9), and materials opened (FR-3.12.6). */
export function ReportsTab() {
  const { cls } = useWorkspace();
  const q = useQuery({ queryKey: ["class", cls.id, "reports"], queryFn: () => api<ClassReportDto>(`/classes/${cls.id}/reports`) });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const r = q.data;
  const attempts = r.quizzes.reduce((n, x) => n + x.attempts, 0);
  const completed = r.sessions.filter((s) => s.status === "completed");
  const classRate = completed.length ? completed.reduce((n, s) => n + (s.attendanceRate ?? 0), 0) / completed.length : null;
  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Students" value={r.studentCount} />
        <StatTile label="Quiz attempts" value={attempts} />
        <StatTile label="Attendance rate" value={pct(classRate)} hint={completed.length ? `Across ${completed.length} finished live classes` : "No finished live classes yet"} />
      </div>

      <section>
        <SectionTitle>By quiz</SectionTitle>
        {r.quizzes.length === 0 ? (
          <EmptyState>No quizzes yet.</EmptyState>
        ) : (
          <DataTable label="Results by quiz">
            <thead>
              <tr>
                <th scope="col">Quiz</th>
                <th scope="col">Students who tried it</th>
                <th scope="col">Attempts</th>
                <th scope="col">Average score</th>
                <th scope="col">Students who passed</th>
              </tr>
            </thead>
            <tbody>
              {r.quizzes.map((x) => (
                <tr key={x.activityId}>
                  <td lang="ja">{x.title}</td>
                  <td>
                    {x.students} of {r.studentCount}
                  </td>
                  <td>{x.attempts}</td>
                  <td>{pct(x.averageScore)}</td>
                  <td>{pct(x.passRate)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </section>

      <section>
        <SectionTitle>By student</SectionTitle>
        {r.students.length === 0 ? (
          <EmptyState>No enrolled students yet.</EmptyState>
        ) : (
          <DataTable label="Results by student">
            <thead>
              <tr>
                <th scope="col">Student</th>
                <th scope="col">Attempts</th>
                <th scope="col">Average score</th>
                {r.quizzes.map((x) => (
                  <th scope="col" key={x.activityId} lang="ja">
                    Best: {x.title}
                  </th>
                ))}
                <th scope="col">Attendance</th>
                <th scope="col">Materials opened</th>
              </tr>
            </thead>
            <tbody>
              {r.students.map((s) => (
                <tr key={s.uid}>
                  <td className="font-medium">{s.name}</td>
                  <td>{s.attempts}</td>
                  <td>{pct(s.averageScore)}</td>
                  {r.quizzes.map((x) => (
                    <td key={x.activityId}>{s.bestScores[x.activityId] !== undefined ? `${s.bestScores[x.activityId]}%` : "Not tried"}</td>
                  ))}
                  <td>{pct(s.attendanceRate)}</td>
                  <td>
                    {s.materialsOpened} of {r.materials.length}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </section>

      <section>
        <SectionTitle>Attendance by live class</SectionTitle>
        {r.sessions.length === 0 ? (
          <EmptyState>No live classes yet.</EmptyState>
        ) : (
          <DataTable label="Attendance by live class">
            <thead>
              <tr>
                <th scope="col">Live class</th>
                <th scope="col">Date</th>
                <th scope="col">Present</th>
                <th scope="col">Late</th>
                <th scope="col">Absent</th>
                <th scope="col">Excused</th>
                <th scope="col">Rate</th>
              </tr>
            </thead>
            <tbody>
              {r.sessions.map((s) => (
                <tr key={s.sessionId}>
                  <td>{s.title}</td>
                  <td className="whitespace-nowrap">{formatDateTime(s.startAt)}</td>
                  <td>{s.present}</td>
                  <td>{s.late}</td>
                  <td>{s.absent}</td>
                  <td>{s.excused}</td>
                  <td>{s.status === "completed" ? pct(s.attendanceRate) : "Upcoming"}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </section>

      <section>
        <SectionTitle>Materials</SectionTitle>
        {r.materials.length === 0 ? (
          <EmptyState>No published materials yet.</EmptyState>
        ) : (
          <DataTable label="Materials opened">
            <thead>
              <tr>
                <th scope="col">Material</th>
                <th scope="col">Opened by</th>
              </tr>
            </thead>
            <tbody>
              {r.materials.map((m) => (
                <tr key={m.materialId}>
                  <td>{m.title}</td>
                  <td>
                    {m.opened} of {m.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </section>
    </div>
  );
}
