import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import type { SchoolBillingDto } from "@nihongo/shared";
import { api } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { pct } from "../../lib/format";
import { ButtonLink, DataTable, ErrorState, LevelTag, Loading, PageHeader, SectionTitle, StatTile } from "../../components/ui";
import { useSchoolReport } from "./SchoolReportsPage";

export function AdminDashboard() {
  const me = useMe();
  const report = useSchoolReport();
  const billing = useQuery({ queryKey: ["billing", "school"], queryFn: () => api<SchoolBillingDto>("/billing/school") });
  const seats = billing.data?.seats;
  return (
    <>
      <PageHeader title={me.school?.name ?? "School"} description="Your school at a glance." actions={<ButtonLink to="/a/classes">Classes</ButtonLink>} />
      {report.isPending ? (
        <Loading />
      ) : report.isError ? (
        <ErrorState error={report.error} retry={() => report.refetch()} />
      ) : (
        <>
          <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Active students" value={report.data.totals.activeEnrollments} hint={`in ${report.data.totals.activeClasses} active classes`} />
            <StatTile
              label="Teacher slots"
              value={seats ? `${seats.used} of ${seats.total}` : "…"}
              hint={seats ? (seats.available ? `${seats.available} free` : <Link to="/a/billing">All in use: buy 5 more</Link>) : undefined}
            />
            <StatTile label="Classes" value={report.data.totals.activeClasses} hint="Free for students" />
            <StatTile label="Attendance rate" value={pct(report.data.totals.attendanceRate)} hint="Finished live classes" />
          </div>
          <section>
            <SectionTitle actions={<Link to="/a/reports">All reports</Link>}>Classes</SectionTitle>
            <DataTable label="Classes summary">
              <thead>
                <tr>
                  <th scope="col">Class</th>
                  <th scope="col">Level</th>
                  <th scope="col">Students</th>
                  <th scope="col">Average score</th>
                  <th scope="col">Attendance</th>
                </tr>
              </thead>
              <tbody>
                {report.data.classes
                  .filter((c) => c.status === "active")
                  .map((c) => (
                    <tr key={c.classId}>
                      <td className="font-medium">
                        <Link to={`/a/classes/${c.classId}`}>{c.name}</Link>
                      </td>
                      <td>
                        <LevelTag level={c.level} />
                      </td>
                      <td>{c.students}</td>
                      <td>{pct(c.averageScore)}</td>
                      <td>{pct(c.attendanceRate)}</td>
                    </tr>
                  ))}
              </tbody>
            </DataTable>
          </section>
        </>
      )}
    </>
  );
}
