// Live classes: upcoming, then past and cancelled — web: features/live/StaffLiveTab.tsx.
// Scheduling and editing open SessionEditor; attendance opens Attendance.
import { useState } from "react";
import { View, Text, Linking, StyleSheet } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "../../../lib/api";
import { formatDateTime, formatTime } from "../../../lib/format";
import { Loading, ErrorState, EmptyState } from "../../../components/QueryState";
import { useToast } from "../../../components/Toast";
import { classKeys, useClassSessions } from "../classHooks";
import { Badge, Button, ConfirmDialog, SectionTitle, ui } from "../ui";
import { spacing, text } from "../../../styles/theme";

function StatusBadge({ s }) {
  if (s.status === "cancelled") return <Badge>Cancelled</Badge>;
  if (s.status === "completed") return <Badge tone="success">Finished</Badge>;
  return <Badge tone="info">Scheduled</Badge>;
}

export function LiveTab({ cls, readOnly, navigation }) {
  const q = useClassSessions(cls.id);
  const [cancelling, setCancelling] = useState(null);
  const qc = useQueryClient();
  const toast = useToast();
  const schedule = () => navigation.navigate("SessionEditor", { classId: cls.id });

  const cancel = useMutation({
    mutationFn: (id) => api(`/sessions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setCancelling(null);
      toast.success("Live class cancelled. Students were notified.");
      void qc.invalidateQueries({ queryKey: classKeys.sessions(cls.id) });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const nowMs = Date.now();
  const upcoming = q.data.filter((s) => s.status === "scheduled" && new Date(s.endAt).getTime() > nowMs);
  const past = q.data.filter((s) => !upcoming.includes(s)).reverse();

  async function openMeet(url) {
    try {
      await Linking.openURL(url);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const rows = (list) =>
    list.map((s) => (
      <View key={s.id} style={ui.card}>
        <View style={st.top}>
          <Text style={[ui.cardTitle, { flex: 1 }]}>{s.title}</Text>
          <StatusBadge s={s} />
        </View>
        <Text style={st.when}>
          {formatDateTime(s.startAt, { withZone: false })} to {formatTime(s.endAt, { withZone: true })}
        </Text>
        {s.hostName ? <Text style={text.small}>{s.hostName}</Text> : null}
        <Text style={text.small}>
          {s.provider === "google" ? "Automatic Meet link" : "Pasted link"}
          {s.inviteStudents ? ", invites sent" : ""}
        </Text>
        <View style={[ui.rowWrap, { marginTop: spacing.sm }]}>
          {s.status === "scheduled" && s.meetUrl ? (
            <Button small variant="secondary" onPress={() => openMeet(s.meetUrl)}>📹 Open Meet</Button>
          ) : null}
          {s.status !== "cancelled" && new Date(s.startAt).getTime() - 15 * 60_000 < nowMs ? (
            <Button small variant="ghost" onPress={() => navigation.navigate("Attendance", { classId: cls.id, sessionId: s.id })}>Attendance</Button>
          ) : null}
          {!readOnly && s.status === "scheduled" ? (
            <>
              <Button small variant="ghost" onPress={() => navigation.navigate("SessionEditor", { classId: cls.id, session: s })}>Edit</Button>
              <Button small variant="dangerGhost" onPress={() => setCancelling(s)}>Cancel</Button>
            </>
          ) : null}
        </View>
      </View>
    ));

  return (
    <View>
      {!readOnly ? (
        <View style={st.actions}>
          <Button small onPress={schedule}>+ Schedule live class</Button>
        </View>
      ) : null}
      <SectionTitle>Upcoming</SectionTitle>
      {upcoming.length ? (
        rows(upcoming)
      ) : (
        <EmptyState action={!readOnly ? <Button onPress={schedule}>Schedule live class</Button> : null}>
          No live classes scheduled. Schedule one and every enrolled student gets a Join button.
        </EmptyState>
      )}
      {past.length ? (
        <>
          <SectionTitle>Past and cancelled</SectionTitle>
          {rows(past)}
        </>
      ) : null}
      <ConfirmDialog
        open={!!cancelling}
        title={`Cancel ${cancelling?.title ?? "live class"}?`}
        body={`Students get a notification${cancelling?.inviteStudents ? " and the calendar invite is removed" : ""}. It stays in the list as cancelled.`}
        cancelLabel="Keep it"
        confirmLabel="Cancel live class"
        busy={cancel.isPending}
        onCancel={() => setCancelling(null)}
        onConfirm={() => cancelling && cancel.mutate(cancelling.id)}
      />
    </View>
  );
}

const st = StyleSheet.create({
  actions: { flexDirection: "row", justifyContent: "flex-end", marginBottom: spacing.xs },
  top: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  when: { ...text.body, marginTop: spacing.xs },
});
