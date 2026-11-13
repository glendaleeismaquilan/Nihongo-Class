// Teacher home — web: roles/teacher/TeacherDashboard.tsx (§12): live classes
// today and tomorrow, recent results per active class, and materials not yet
// opened by every student. Data: GET /classes, then each active class's
// sessions and report (the same queries the class workspace uses).
import { useState } from "react";
import { View, Text, ScrollView, Pressable, RefreshControl, Linking, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "../../lib/api";
import { formatTime, pct, relativeDay } from "../../lib/format";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../components/Toast";
import { Loading, ErrorState, EmptyState } from "../../components/QueryState";
import { classKeys, useClasses } from "./classHooks";
import { Button, SectionTitle, ui } from "./ui";
import { colors, spacing, text } from "../../styles/theme";

export function TeacherDashboardScreen({ navigation }) {
  const { me } = useAuth();
  const classes = useClasses();
  const qc = useQueryClient();
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const active = (classes.data ?? []).filter((c) => c.status === "active");
  const sessions = useQueries({
    queries: active.map((c) => ({ queryKey: classKeys.sessions(c.id), queryFn: () => api(`/classes/${c.id}/sessions`).then((r) => r.items) })),
  });
  const reports = useQueries({
    queries: active.map((c) => ({ queryKey: classKeys.reports(c.id), queryFn: () => api(`/classes/${c.id}/reports`) })),
  });
  const premium = !!me?.plan?.premium;

  const openClasses = () => navigation.navigate("Classes", { screen: "TeacherClassesList" });
  const openClass = (classId, tab) => navigation.navigate("Classes", { screen: "TeacherClassDetail", params: { classId, tab }, initial: false });

  async function refresh() {
    setRefreshing(true);
    try {
      await Promise.all([qc.invalidateQueries({ queryKey: classKeys.all }), ...active.map((c) => qc.invalidateQueries({ queryKey: ["class", c.id] }))]);
    } finally {
      setRefreshing(false);
    }
  }

  async function openMeet(url) {
    try {
      await Linking.openURL(url);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const header = (
    <View style={s.header}>
      <View style={{ flex: 1 }}>
        <Text style={[s.title, premium && s.titlePremium]} accessibilityRole="header">Welcome, {me?.name}</Text>
        {premium ? (
          <View style={s.pill}>
            <Text style={s.pillText}>⭐ Premium</Text>
          </View>
        ) : null}
      </View>
      <Button small onPress={openClasses}>My classes</Button>
    </View>
  );

  if (classes.isPending) {
    return (
      <SafeAreaView style={ui.root} edges={["top"]}>
        {header}
        <Loading />
      </SafeAreaView>
    );
  }
  if (classes.isError) {
    return (
      <SafeAreaView style={ui.root} edges={["top"]}>
        {header}
        <ErrorState error={classes.error} retry={() => classes.refetch()} />
      </SafeAreaView>
    );
  }

  const now = Date.now();
  const soon = sessions
    .flatMap((q, i) => (q.data ?? []).map((x) => ({ ...x, className: active[i].name })))
    .filter((x) => x.status === "scheduled" && new Date(x.endAt).getTime() > now && new Date(x.startAt).getTime() < now + 2 * 86_400_000)
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
  const unopened = reports.flatMap((q, i) => (q.data?.materials ?? []).filter((m) => m.opened < m.total).map((m) => ({ ...m, classId: active[i].id, className: active[i].name })));
  const sessionsFailed = sessions.findIndex((q) => q.isError);
  const reportsFailed = reports.findIndex((q) => q.isError);

  return (
    <SafeAreaView style={ui.root} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        {header}
        {!active.length ? (
          <EmptyState action={<Button onPress={() => navigation.navigate("Classes", { screen: "CreateClass", initial: false })}>Create a class</Button>}>
            You don't have a class yet. Create one, then share its code with your students.
          </EmptyState>
        ) : (
          <View style={{ paddingHorizontal: spacing.md }}>
            <SectionTitle>Today and tomorrow</SectionTitle>
            {sessionsFailed >= 0 ? (
              <ErrorState error={sessions[sessionsFailed].error} retry={() => sessions.forEach((q) => q.isError && q.refetch())} />
            ) : null}
            {sessions.some((q) => q.isPending) ? (
              <Loading />
            ) : soon.length ? (
              soon.map((x) => (
                <View key={x.id} style={[ui.card, s.rowCard]}>
                  <View style={{ flex: 1 }}>
                    <Text style={ui.cardTitle}>{x.title}</Text>
                    <Text style={text.small}>
                      {x.className}, {relativeDay(x.startAt)} {formatTime(x.startAt)} to {formatTime(x.endAt, { withZone: true })}
                    </Text>
                  </View>
                  {x.meetUrl ? <Button small onPress={() => openMeet(x.meetUrl)}>📹 Open Meet</Button> : null}
                </View>
              ))
            ) : sessionsFailed < 0 ? (
              <Text style={text.bodyMuted}>No live classes today or tomorrow.</Text>
            ) : null}

            <SectionTitle>Recent results</SectionTitle>
            {active.map((c, i) => {
              const q = reports[i];
              const r = q?.data;
              const attempts = r?.quizzes.reduce((n, x) => n + x.attempts, 0) ?? 0;
              const scores = r?.quizzes.filter((x) => x.averageScore !== null).map((x) => x.averageScore) ?? [];
              return (
                <Pressable key={c.id} style={ui.card} onPress={() => openClass(c.id, "reports")} accessibilityRole="link">
                  <Text style={[ui.cardTitle, { color: colors.ai }]}>{c.name}</Text>
                  <Text style={text.small}>
                    {r
                      ? `${attempts} quiz attempts, average ${pct(scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null)}`
                      : q?.isError
                        ? errorMessage(q.error)
                        : "Loading…"}
                  </Text>
                </Pressable>
              );
            })}

            <SectionTitle>Materials not opened by everyone</SectionTitle>
            {reportsFailed >= 0 ? (
              <ErrorState error={reports[reportsFailed].error} retry={() => reports.forEach((q) => q.isError && q.refetch())} />
            ) : null}
            {reports.some((q) => q.isPending) ? (
              <Loading />
            ) : unopened.length ? (
              unopened.map((m) => (
                <Pressable key={m.materialId} style={[ui.card, s.rowCard]} onPress={() => openClass(m.classId, "materials")} accessibilityRole="link">
                  <View style={{ flex: 1 }}>
                    <Text style={[ui.cardTitle, { color: colors.ai }]}>{m.title}</Text>
                    <Text style={text.small}>{m.className}</Text>
                  </View>
                  <Text style={text.body}>
                    Opened by {m.opened} of {m.total}
                  </Text>
                </Pressable>
              ))
            ) : reportsFailed < 0 ? (
              <Text style={text.bodyMuted}>Every student has opened every published material.</Text>
            ) : null}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  title: { ...text.h1, fontSize: 24, color: colors.ai },
  titlePremium: { color: "#b45309" },
  pill: { alignSelf: "flex-start", marginTop: spacing.xs, borderWidth: 1, borderColor: "#f59e0b", backgroundColor: "#fef3c7", borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  pillText: { fontSize: 12, fontWeight: "700", color: "#92400e" },
  rowCard: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
});
