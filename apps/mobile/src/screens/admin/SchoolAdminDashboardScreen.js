// School Admin home (mirror of apps/web/src/roles/admin/AdminDashboard.tsx):
// the school report's totals, teacher slots from billing, and the active classes.
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { pct } from "../../lib/format";
import { useAuth } from "../../context/AuthContext";
import { EmailVerificationBanner } from "../../components/EmailVerificationBanner";
import { Loading, ErrorState } from "../../components/QueryState";
import { PageHeader, StatTile, TileGrid, LevelTag, SectionTitle, LinkText } from "./adminUi";
import { colors, spacing, text } from "../../styles/theme";

/** Same query as the web app's useSchoolReport (shared with the Reports screen). */
export function useSchoolReport() {
  const { me } = useAuth();
  return useQuery({ queryKey: ["school-report", me?.schoolId], queryFn: () => api(`/schools/${me.schoolId}/reports`) });
}

export function SchoolAdminDashboardScreen({ navigation }) {
  const { me } = useAuth();
  const report = useSchoolReport();
  const billing = useQuery({ queryKey: ["billing", "school"], queryFn: () => api("/billing/school") });
  const seats = billing.data?.seats;

  const openClass = (classId) => navigation.navigate("Classes", { screen: "TeacherClassDetail", params: { classId }, initial: false });

  let seatValue = "…";
  let seatHint;
  let seatHintPress;
  if (billing.isError) {
    seatValue = "—";
    seatHint = "Couldn't load. Tap to try again.";
    seatHintPress = () => billing.refetch();
  } else if (seats) {
    seatValue = `${seats.used} of ${seats.total}`;
    if (seats.available) seatHint = `${seats.available} free`;
    else {
      seatHint = "All in use: buy 5 more";
      seatHintPress = () => navigation.navigate("Billing", { screen: "SchoolBillingHome" });
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={report.isRefetching || billing.isRefetching} onRefresh={() => { void report.refetch(); void billing.refetch(); }} />}
      >
        <EmailVerificationBanner />
        <PageHeader
          title={me?.school?.name ?? "School"}
          description="Your school at a glance."
          action={
            <Pressable style={styles.headerBtn} onPress={() => navigation.navigate("Classes")} accessibilityRole="button">
              <Text style={styles.headerBtnText}>Classes</Text>
            </Pressable>
          }
        />
        {report.isPending ? (
          <Loading />
        ) : report.isError ? (
          <ErrorState error={report.error} retry={report.refetch} />
        ) : (
          <>
            <TileGrid>
              <StatTile label="Active students" value={report.data.totals.activeEnrollments} hint={`in ${report.data.totals.activeClasses} active classes`} />
              <StatTile label="Teacher slots" value={seatValue} hint={seatHint} onHintPress={seatHintPress} />
              <StatTile label="Classes" value={report.data.totals.activeClasses} hint="Free for students" />
              <StatTile label="Attendance rate" value={pct(report.data.totals.attendanceRate)} hint="Finished live classes" />
            </TileGrid>

            <SectionTitle action={<LinkText onPress={() => navigation.navigate("Reports")}>All reports</LinkText>}>Classes</SectionTitle>
            {report.data.classes
              .filter((c) => c.status === "active")
              .map((c) => (
                <Pressable key={c.classId} style={styles.row} onPress={() => openClass(c.classId)} accessibilityRole="button" accessibilityLabel={`Open ${c.name}`}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowTitle}>{c.name}</Text>
                    <LevelTag level={c.level} />
                  </View>
                  <View style={styles.metrics}>
                    <Metric label="Students" value={c.students} />
                    <Metric label="Average score" value={pct(c.averageScore)} />
                    <Metric label="Attendance" value={pct(c.attendanceRate)} />
                  </View>
                </Pressable>
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
  headerBtn: { backgroundColor: colors.ai, paddingHorizontal: spacing.md, borderRadius: 8, minHeight: 40, justifyContent: "center" },
  headerBtnText: { ...text.button, fontSize: 14 },
  row: { backgroundColor: colors.paper, borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.line },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  rowTitle: { ...text.body, fontWeight: "600", color: colors.ai, flex: 1 },
  metrics: { flexDirection: "row", marginTop: spacing.sm, gap: spacing.sm },
  metricValue: { ...text.body, fontWeight: "600" },
});
