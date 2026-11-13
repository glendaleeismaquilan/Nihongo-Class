// FR-3.11.7 (mirror of apps/web/src/roles/student/ClassLiveTab.tsx): upcoming
// sessions in the student's local time with the zone shown, then past sessions
// with the student's attendance.
import { View, Text, ScrollView, Linking, StyleSheet, RefreshControl } from "react-native";
import { errorMessage } from "../../../lib/api";
import { formatDateTime, formatTime, zoneLongName } from "../../../lib/format";
import { useToast } from "../../../components/Toast";
import { Loading, ErrorState, EmptyState } from "../../../components/QueryState";
import { colors, spacing, text } from "../../../styles/theme";
import { joinState, useClassSessions, useNow } from "../hooks";
import { JoinButton } from "../JoinButton";
import { Badge, Button, Panel, SectionTitle } from "../ui";

const ATT_LABEL = { present: "Present", late: "Late", absent: "Absent", excused: "Excused" };

export function SessionCard({ s }) {
  const now = useNow();
  const toast = useToast();
  const state = joinState(s, now);
  return (
    <Panel style={styles.card}>
      <Text style={styles.cardTitle}>{s.title}</Text>
      <Text style={text.bodyMuted}>{formatDateTime(s.startAt, { withZone: false })} to {formatTime(s.endAt, { withZone: true })}</Text>
      {s.description ? <Text style={[text.small, { marginTop: spacing.xs }]}>{s.description}</Text> : null}
      {state === "open" ? <Text style={styles.openNow}>Open now</Text> : null}
      <View style={styles.actions}>
        {s.status === "cancelled" ? <Badge>Cancelled</Badge> : null}
        {state === "over" && s.status !== "cancelled" ? (
          <Badge tone={s.myAttendance === "absent" ? "danger" : s.myAttendance ? "success" : "neutral"}>{s.myAttendance ? ATT_LABEL[s.myAttendance] : "Finished"}</Badge>
        ) : null}
        {s.addToCalendarUrl && state === "early" ? (
          <Button size="sm" variant="secondary" onPress={() => Linking.openURL(s.addToCalendarUrl).catch((err) => toast.error(errorMessage(err)))}>
            Add to Google Calendar
          </Button>
        ) : null}
        <JoinButton session={s} />
      </View>
    </Panel>
  );
}

export function LiveTab({ classId }) {
  const q = useClassSessions(classId);
  const now = useNow();
  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={q.refetch} />;
  const upcoming = q.data.filter((s) => s.status === "scheduled" && new Date(s.endAt).getTime() > now);
  const past = q.data.filter((s) => !upcoming.includes(s)).reverse();

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.md }} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} />}>
      <Text style={[text.small, { marginBottom: spacing.md }]}>Times are shown in your time zone, {zoneLongName()}. Join opens 15 minutes before each class starts.</Text>
      <View style={{ marginBottom: spacing.lg }}>
        <SectionTitle>Upcoming</SectionTitle>
        {upcoming.length ? (
          upcoming.map((s) => <SessionCard key={s.id} s={s} />)
        ) : (
          <EmptyState>No live classes scheduled yet. Your teacher's live classes will show up here with a Join button.</EmptyState>
        )}
      </View>
      {past.length ? (
        <View>
          <SectionTitle>Past</SectionTitle>
          {past.map((s) => <SessionCard key={s.id} s={s} />)}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.sm, padding: spacing.lg },
  cardTitle: { ...text.body, fontWeight: "600" },
  openNow: { color: colors.matcha, fontWeight: "600", marginTop: spacing.xs, fontSize: 14 },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
});
