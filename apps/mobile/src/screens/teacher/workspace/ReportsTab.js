// Class reports: results by quiz and by student, attendance by live class, and
// materials opened — web: features/classes/ReportsTab.tsx (GET /classes/:id/reports).
// The web tables become one card per row on a phone; every column is kept.
import { View, Text, StyleSheet } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";
import { formatDateTime, pct } from "../../../lib/format";
import { Loading, ErrorState, EmptyState } from "../../../components/QueryState";
import { classKeys } from "../classHooks";
import { SectionTitle, StatTile, ui } from "../ui";
import { spacing, text } from "../../../styles/theme";

function Line({ label, value }) {
  return (
    <View style={s.line}>
      <Text style={[text.small, { flex: 1 }]}>{label}</Text>
      <Text style={s.value}>{value}</Text>
    </View>
  );
}

export function ReportsTab({ cls }) {
  const q = useQuery({ queryKey: classKeys.reports(cls.id), queryFn: () => api(`/classes/${cls.id}/reports`) });
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const r = q.data;
  const attempts = r.quizzes.reduce((n, x) => n + x.attempts, 0);
  const completed = r.sessions.filter((x) => x.status === "completed");
  const classRate = completed.length ? completed.reduce((n, x) => n + (x.attendanceRate ?? 0), 0) / completed.length : null;

  return (
    <View>
      <View style={s.tiles}>
        <StatTile label="Students" value={r.studentCount} />
        <StatTile label="Quiz attempts" value={attempts} />
      </View>
      <View style={[s.tiles, { marginTop: spacing.sm }]}>
        <StatTile label="Attendance rate" value={pct(classRate)} hint={completed.length ? `Across ${completed.length} finished live classes` : "No finished live classes yet"} />
      </View>

      <SectionTitle>By quiz</SectionTitle>
      {r.quizzes.length === 0 ? (
        <EmptyState>No quizzes yet.</EmptyState>
      ) : (
        r.quizzes.map((x) => (
          <View key={x.activityId} style={ui.card}>
            <Text style={ui.cardTitle}>{x.title}</Text>
            <Line label="Students who tried it" value={`${x.students} of ${r.studentCount}`} />
            <Line label="Attempts" value={x.attempts} />
            <Line label="Average score" value={pct(x.averageScore)} />
            <Line label="Students who passed" value={pct(x.passRate)} />
          </View>
        ))
      )}

      <SectionTitle>By student</SectionTitle>
      {r.students.length === 0 ? (
        <EmptyState>No enrolled students yet.</EmptyState>
      ) : (
        r.students.map((st) => (
          <View key={st.uid} style={ui.card}>
            <Text style={ui.cardTitle}>{st.name}</Text>
            <Line label="Attempts" value={st.attempts} />
            <Line label="Average score" value={pct(st.averageScore)} />
            {r.quizzes.map((x) => (
              <Line key={x.activityId} label={`Best: ${x.title}`} value={st.bestScores[x.activityId] !== undefined ? `${st.bestScores[x.activityId]}%` : "Not tried"} />
            ))}
            <Line label="Attendance" value={pct(st.attendanceRate)} />
            <Line label="Materials opened" value={`${st.materialsOpened} of ${r.materials.length}`} />
          </View>
        ))
      )}

      <SectionTitle>Attendance by live class</SectionTitle>
      {r.sessions.length === 0 ? (
        <EmptyState>No live classes yet.</EmptyState>
      ) : (
        r.sessions.map((x) => (
          <View key={x.sessionId} style={ui.card}>
            <Text style={ui.cardTitle}>{x.title}</Text>
            <Text style={text.small}>{formatDateTime(x.startAt)}</Text>
            <Line label="Present" value={x.present} />
            <Line label="Late" value={x.late} />
            <Line label="Absent" value={x.absent} />
            <Line label="Excused" value={x.excused} />
            <Line label="Rate" value={x.status === "completed" ? pct(x.attendanceRate) : "Upcoming"} />
          </View>
        ))
      )}

      <SectionTitle>Materials</SectionTitle>
      {r.materials.length === 0 ? (
        <EmptyState>No published materials yet.</EmptyState>
      ) : (
        r.materials.map((m) => (
          <View key={m.materialId} style={ui.card}>
            <Text style={ui.cardTitle}>{m.title}</Text>
            <Line label="Opened by" value={`${m.opened} of ${m.total}`} />
          </View>
        ))
      )}
    </View>
  );
}

const s = StyleSheet.create({
  tiles: { flexDirection: "row", gap: spacing.sm },
  line: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 3 },
  value: { ...text.body, fontWeight: "600" },
});
