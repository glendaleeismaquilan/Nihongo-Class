// Student home (mirror of apps/web/src/roles/student/StudentDashboard.tsx, §13):
// lead with the one thing to do next — a live class to join, or study — then the
// streak, average score and class count, upcoming live classes, and new materials.
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueries, useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { formatDateTime, formatTime } from "../../lib/format";
import { EmailVerificationBanner } from "../../components/EmailVerificationBanner";
import { Loading, ErrorState } from "../../components/QueryState";
import { colors, spacing, text } from "../../styles/theme";
import { useMyClasses, useNow, joinState } from "./hooks";
import { JoinButton } from "./JoinButton";
import { Button, Panel, SectionTitle, StatTile } from "./ui";

export function StudentDashboardScreen({ navigation }) {
  const { me } = useAuth();
  const now = useNow();
  const classes = useMyClasses();
  const active = (classes.data ?? []).filter((c) => c.enrollment?.status === "active");
  const sessions = useQueries({
    queries: active.map((c) => ({
      queryKey: ["class", c.id, "sessions"],
      queryFn: () => api(`/classes/${c.id}/sessions`).then((r) => r.items),
    })),
  });
  const materials = useQueries({
    queries: active.map((c) => ({
      queryKey: ["class", c.id, "materials"],
      queryFn: () => api(`/classes/${c.id}/materials`).then((r) => r.items),
    })),
  });
  // A separate key from Progress's infinite query (["progress", <type>]): same endpoint, different shapes.
  const progress = useQuery({ queryKey: ["progress", "dashboard"], queryFn: () => api("/progress/me") });

  if (!me) return null;
  if (classes.isPending) return <SafeAreaView style={styles.root} edges={["top"]}><Loading /></SafeAreaView>;
  if (classes.isError) return <SafeAreaView style={styles.root} edges={["top"]}><ErrorState error={classes.error} retry={classes.refetch} /></SafeAreaView>;

  const upcoming = sessions
    .flatMap((q, i) => (q.data ?? []).map((s) => ({ ...s, className: active[i].name })))
    .filter((s) => s.status === "scheduled" && new Date(s.endAt).getTime() > now)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const joinable = upcoming.find((s) => joinState(s, now) === "open");
  const fresh = materials.flatMap((q, i) => (q.data ?? []).filter((m) => !m.viewed).map((m) => ({ ...m, className: active[i].name })));
  const sessionsError = sessions.find((q) => q.isError);
  const materialsError = materials.find((q) => q.isError);

  const openClass = (classId, tab) => navigation.navigate("Classes", { screen: "ClassDetail", params: { classId, tab }, initial: false });
  const refreshing = classes.isRefetching || progress.isRefetching;
  const refresh = () => {
    void classes.refetch();
    void progress.refetch();
    sessions.forEach((q) => void q.refetch());
    materials.forEach((q) => void q.refetch());
  };

  const streak = progress.data?.streak;
  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        <EmailVerificationBanner />
        <Text style={styles.title} accessibilityRole="header">Welcome back, {me.name}</Text>

        {joinable ? (
          <Panel style={[styles.lead, { borderColor: colors.ai }]}>
            <Text style={styles.liveNow}>Live now</Text>
            <Text style={styles.leadTitle}>{joinable.title}</Text>
            <Text style={text.bodyMuted}>{joinable.className}, {formatTime(joinable.startAt)} to {formatTime(joinable.endAt, { withZone: true })}</Text>
            <View style={{ marginTop: spacing.md }}><JoinButton session={joinable} /></View>
          </Panel>
        ) : (
          <Panel level={me.studyLevel} style={styles.lead}>
            <Text style={styles.leadTitle}>Continue studying</Text>
            <Text style={text.bodyMuted}>
              {active.length
                ? `Review your class lessons, or practice ${me.studyLevel} in Self-Study.`
                : `Practice ${me.studyLevel} flashcards and quizzes, or join your teacher's class with a class code.`}
            </Text>
            <View style={styles.actions}>
              {active[0] ? <Button onPress={() => openClass(active[0].id)}>Open {active[0].name}</Button> : null}
              <Button variant={active[0] ? "secondary" : "primary"} onPress={() => navigation.navigate("Study")}>Open Self-Study</Button>
              {!active.length ? (
                <Button variant="secondary" onPress={() => navigation.navigate("Classes", { screen: "JoinClass", initial: false })}>Join a class</Button>
              ) : null}
            </View>
          </Panel>
        )}

        <View style={styles.stats}>
          <StatTile
            label="Study streak"
            value={progress.data ? `${streak} day${streak === 1 ? "" : "s"}` : "…"}
            hint="Days in a row with a graded quiz or test"
          />
          <StatTile label="Average score" value={progress.data ? (progress.data.averageScore != null ? `${progress.data.averageScore}%` : "No scores yet") : "…"} />
          <StatTile label="Classes" value={String(active.length)} hint="All classes are free" />
        </View>
        {progress.isError ? <ErrorState error={progress.error} retry={progress.refetch} /> : null}

        {sessionsError ? (
          <ErrorState error={sessionsError.error} retry={() => sessions.forEach((q) => q.isError && void q.refetch())} />
        ) : upcoming.length ? (
          <View style={styles.section}>
            <SectionTitle>Upcoming live classes</SectionTitle>
            {upcoming.slice(0, 3).map((s) => (
              <Panel key={s.id} style={styles.item}>
                <Text style={styles.itemTitle}>{s.title}</Text>
                <Text style={text.small}>{s.className}, {formatDateTime(s.startAt)}</Text>
                <View style={{ marginTop: spacing.sm }}><JoinButton session={s} size="sm" /></View>
              </Panel>
            ))}
          </View>
        ) : null}

        {materialsError ? (
          <ErrorState error={materialsError.error} retry={() => materials.forEach((q) => q.isError && void q.refetch())} />
        ) : fresh.length ? (
          <View style={styles.section}>
            <SectionTitle>New materials</SectionTitle>
            {fresh.slice(0, 5).map((m) => (
              <Pressable key={m.id} onPress={() => openClass(m.classId, "materials")} accessibilityRole="link">
                <Panel style={styles.item}>
                  <Text style={[styles.itemTitle, styles.link]}>{m.title}</Text>
                  <Text style={text.small}>{m.className}</Text>
                </Panel>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.kasumi },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { ...text.h1, fontSize: 26, color: colors.ai, marginBottom: spacing.lg },
  lead: { padding: spacing.lg, marginBottom: spacing.lg },
  liveNow: { color: colors.matcha, fontWeight: "600", fontSize: 14 },
  leadTitle: { ...text.h2, marginTop: spacing.xs, marginBottom: spacing.xs },
  actions: { marginTop: spacing.md, gap: spacing.sm },
  stats: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  section: { marginBottom: spacing.lg },
  item: { marginBottom: spacing.sm },
  itemTitle: { ...text.body, fontWeight: "600" },
  link: { color: colors.ai, textDecorationLine: "underline" },
});
