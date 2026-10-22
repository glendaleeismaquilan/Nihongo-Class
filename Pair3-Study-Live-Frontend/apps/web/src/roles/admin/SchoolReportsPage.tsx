import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import type { SchoolReportDto } from "@nihongo/shared";
import { api } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { pct } from "../../lib/format";
import { Badge, DataTable, ErrorState, LevelTag, Loading, PageHeader, SectionTitle, StatTile } from "../../components/ui";

export function useSchoolReport() {
  const me = useMe();
  return useQuery({ queryKey: ["school-report", me.schoolId], queryFn: () => api<SchoolReportDto>(`/schools/${me.schoolId}/reports`) });
}

/** FR-3.9.4 / FR-3.10.3: school-wide activity and performance. */
export function SchoolReportsPage() {
  const q = useSchoolReport();
  return (
    <>
      <PageHeader title="Reports" description="Results and attendance across every class and teacher in your school." />
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <div className="flex flex-col gap-8">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Active classes" value={q.data.totals.activeClasses} hint={`${q.data.totals.classes} in total`} />
            <StatTile label="Enrolled students" value={q.data.totals.activeEnrollments} hint={`${q.data.totals.students} student accounts, ${q.data.totals.teachers} teachers`} />
            <StatTile label="Average score" value={pct(q.data.totals.averageScore)} hint={`${q.data.totals.attempts} attempts`} />
            <StatTile label="Attendance rate" value={pct(q.data.totals.attendanceRate)} />
          </div>
          <section>
            <SectionTitle>By class</SectionTitle>
            <DataTable label="Results by class">
              <thead>
                <tr>
                  <th scope="col">Class</th>
                  <th scope="col">Level</th>
                  <th scope="col">Teachers</th>
                  <th scope="col">Students</th>
                  <th scope="col">Attempts</th>
                  <th scope="col">Average score</th>
                  <th scope="col">Passing attempts</th>
                  <th scope="col">Attendance</th>
                </tr>
              </thead>
              <tbody>
                {q.data.classes.map((c) => (
                  <tr key={c.classId}>
                    <td className="font-medium">
                      <Link to={`/a/classes/${c.classId}/reports`}>{c.name}</Link> {c.status === "archived" ? <Badge>Archived</Badge> : null}
                    </td>
                    <td>
                      <LevelTag level={c.level} />
                    </td>
                    <td className="text-ink-2">{c.teachers.join(", ")}</td>
                    <td>{c.students}</td>
                    <td>{c.attempts}</td>
                    <td>{pct(c.averageScore)}</td>
                    <td>{pct(c.passRate)}</td>
                    <td>{pct(c.attendanceRate)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </section>
          <section>
            <SectionTitle>By teacher</SectionTitle>
            <DataTable label="Results by teacher">
              <thead>
                <tr>
                  <th scope="col">Teacher</th>
                  <th scope="col">Classes</th>
                  <th scope="col">Students</th>
                  <th scope="col">Average score</th>
                </tr>
              </thead>
              <tbody>
                {q.data.teachers.map((t) => (
                  <tr key={t.uid}>
                    <td className="font-medium">{t.name}</td>
                    <td>{t.classes}</td>
                    <td>{t.students}</td>
                    <td>{pct(t.averageScore)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </section>
        </div>
      )}
    </>
  );
}
