// Review and edit a live class's attendance — web: features/live/AttendancePage.tsx
// (FR-3.11.8). Changes are kept as a draft until "Save attendance".
// Route params: { classId, sessionId }.
import { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "../../lib/api";
import { formatDateTime, formatTime } from "../../lib/format";
import { ATTENDANCE_STATUSES } from "../../shared/constants";
import { Loading, ErrorState, EmptyState } from "../../components/QueryState";
import { useToast } from "../../components/Toast";
import { classKeys, isReadOnly, useClass } from "./classHooks";
import { Button, Header, InlineAlert, ui } from "./ui";
import { colors, spacing, text } from "../../styles/theme";

const LABEL = { present: "Present", late: "Late", absent: "Absent", excused: "Excused" };
const SOURCE = { join_click: "Joined from the app", teacher: "Set by staff", system: "No check-in" };

export function AttendanceScreen({ route, navigation }) {
  const { classId, sessionId } = route.params ?? {};
  const cls = useClass(classId);
  const q = useQuery({ queryKey: ["session", sessionId, "attendance"], queryFn: () => api(`/sessions/${sessionId}/attendance`) });
  const [draft, setDraft] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  useEffect(() => setDraft({}), [q.data]);

  const save = useMutation({
    mutationFn: () => api(`/sessions/${sessionId}/attendance`, { method: "PUT", body: { records: Object.entries(draft).map(([uid, status]) => ({ uid, status })) } }),
    onSuccess: () => {
      toast.success("Attendance saved");
      void qc.invalidateQueries({ queryKey: ["session", sessionId, "attendance"] });
      void qc.invalidateQueries({ queryKey: classKeys.reports(classId) });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  async function refresh() {
    setRefreshing(true);
    try {
      await q.refetch();
    } finally {
      setRefreshing(false);
    }
  }

  const back = () => navigation.goBack();
  const failed = [cls, q].find((x) => x.isError);
  if (cls.isPending || q.isPending || failed) {
    return (
      <SafeAreaView style={ui.root} edges={["top"]}>
        <Header title="Attendance" onBack={back} backLabel="Live classes" />
        {failed ? <ErrorState error={failed.error} retry={() => failed.refetch()} /> : <Loading />}
      </SafeAreaView>
    );
  }
  const readOnly = isReadOnly(cls.data);
  const { session, items } = q.data;
  const changed = Object.keys(draft).length;

  return (
    <SafeAreaView style={ui.root} edges={["top"]}>
      <Header
        title={session.title}
        subtitle={`${formatDateTime(session.startAt, { withZone: false })} to ${formatTime(session.endAt, { withZone: true })}`}
        onBack={back}
        backLabel="Live classes"
      />
      <ScrollView contentContainerStyle={ui.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        {session.status === "scheduled" ? (
          <InlineAlert>Students who press Join are checked in automatically; more than 10 minutes after the start counts as late. When the class ends, anyone without a check-in is marked absent.</InlineAlert>
        ) : null}
        {items.length === 0 ? <EmptyState>No students in this class.</EmptyState> : null}
        {items.map((r) => {
          const value = draft[r.uid] ?? r.status ?? "";
          return (
            <View key={r.uid} style={ui.card}>
              <Text style={ui.cardTitle}>{r.name}</Text>
              <Text style={text.small}>
                {r.joinedAt ? `Joined ${formatTime(r.joinedAt, { withZone: true })}` : "Didn't join"}
                {r.source ? ` · ${SOURCE[r.source] ?? r.source}` : ""}
              </Text>
              {!value ? <Text style={[text.small, { marginTop: spacing.xs }]}>Not recorded yet</Text> : null}
              <View style={s.chips} accessibilityRole="radiogroup" accessibilityLabel={`Attendance for ${r.name}`}>
                {ATTENDANCE_STATUSES.map((st) => {
                  const on = value === st;
                  return (
                    <Pressable
                      key={st}
                      onPress={() => setDraft((d) => ({ ...d, [r.uid]: st }))}
                      disabled={readOnly}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on, disabled: readOnly }}
                      style={[s.chip, on && s.chipOn, readOnly && !on && { opacity: 0.5 }]}
                    >
                      <Text style={[s.chipText, on && s.chipTextOn]}>{LABEL[st]}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>
      <View style={s.bar}>
        <Button onPress={() => save.mutate()} disabled={!changed} loading={save.isPending}>
          {`Save attendance${changed ? ` (${changed})` : ""}`}
        </Button>
        {changed ? <Button variant="secondary" onPress={() => setDraft({})}>Discard changes</Button> : null}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.sm },
  chip: { minHeight: 40, paddingHorizontal: spacing.md, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper, justifyContent: "center" },
  chipOn: { backgroundColor: colors.ai, borderColor: colors.ai },
  chipText: { fontSize: 14, color: colors.ink },
  chipTextOn: { color: colors.paper, fontWeight: "600" },
  bar: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.kasumi },
});
