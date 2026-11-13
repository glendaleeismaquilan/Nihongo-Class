// FR-3.9.4 / FR-3.10.3 school-wide reports (mirror of apps/web/src/roles/admin/SchoolReportsPage.tsx):
// totals, then results by class and by teacher. A class opens its Reports tab.
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { pct } from "../../lib/format";
import { Loading, ErrorState } from "../../components/QueryState";
import { useSchoolReport } from "./SchoolAdminDashboardScreen";
import { PageHeader, StatTile, TileGrid, LevelTag, Badge, SectionTitle } from "./adminUi";
import { colors, spacing, text } from "../../styles/theme";

export function ReportsScreen({ navigation }) {
  const q = useSchoolReport();

  const openClassReports = (classId) =>
    navigation.navigate("Classes", { screen: "TeacherClassDetail", params: { classId, tab: "reports" }, initial: false });

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
        {navigation.canGoBack() ? (
          <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityRole="button" style={{ minHeight: 32 }}>
            <Text style={styles.back}>‹ Home</Text>
          </Pressable>
        ) : null}
        <PageHeader title="Reports" description="Results and attendance across every class and teacher in your school." />
        {q.isPending ? (
          <Loading />
        ) : q.isError ? (
          <ErrorState error={q.error} retry={q.refetch} />
        ) : (
          <>
            <TileGrid>
              <StatTile label="Active classes" value={q.data.totals.activeClasses} hint={`${q.data.totals.classes} in total`} />
              <StatTile label="Enrolled students" value={q.data.totals.activeEnrollments} hint={`${q.data.totals.students} student accounts, ${q.data.totals.teachers} teachers`} />
              <StatTile label="Average score" value={pct(q.data.totals.averageScore)} hint={`${q.data.totals.attempts} attempts`} />
              <StatTile label="Attendance rate" value={pct(q.data.totals.attendanceRate)} />
            </TileGrid>

            <SectionTitle>By class</SectionTitle>
            {q.data.classes.map((c) => (
              <Pressable key={c.classId} style={styles.card} onPress={() => openClassReports(c.classId)} accessibilityRole="button" accessibilityLabel={`${c.name} reports`}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle}>{c.name}</Text>
                  {c.status === "archived" ? <Badge>Archived</Badge> : null}
                  <LevelTag level={c.level} />
                </View>
                <Text style={text.small}>Teachers: {c.teachers.join(", ")}</Text>
                <View style={styles.metrics}>
                  <Metric label="Students" value={c.students} />
                  <Metric label="Attempts" value={c.attempts} />
                  <Metric label="Average score" value={pct(c.averageScore)} />
                </View>
                <View style={styles.metrics}>
                  <Metric label="Passing attempts" value={pct(c.passRate)} />
                  <Metric label="Attendance" value={pct(c.attendanceRate)} />
                  <View style={{ flex: 1 }} />
                </View>
              </Pressable>
            ))}

            <SectionTitle>By teacher</SectionTitle>
            {q.data.teachers.map((t) => (
              <View key={t.uid} style={styles.card}>
                <Text style={styles.cardTitle}>{t.name}</Text>
                <View style={styles.metrics}>
                  <Metric label="Classes" value={t.classes} />
                  <Metric label="Students" value={t.students} />
                  <Metric label="Average score" value={pct(t.averageScore)} />
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={text.small}>{label}</Text>
      <Text style={styles.metricValue}>{String(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.kasumi },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  back: { color: colors.ai, fontSize: 15 },
  card: { backgroundColor: colors.paper, borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.line },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.xs },
  cardTitle: { ...text.body, fontWeight: "600", flexShrink: 1 },
  metrics: { flexDirection: "row", marginTop: spacing.sm, gap: spacing.sm },
  metricValue: { ...text.body, fontWeight: "600" },
});
