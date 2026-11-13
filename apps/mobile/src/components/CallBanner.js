// The class's in-app video call — web: features/calls/ActiveCallBanner.tsx.
// Everyone in the class sees "Join call" while a call is running; teachers and
// School Admins can start one when there isn't. Calls last 5 minutes, or 15
// when the host has Premium (me.plan.callLimitSeconds).
// A failed check shows the error with "Try again" — never a silent blank.
// Props: { classId, navigation? } — navigation defaults to the screen's own; it
// must belong to a stack with a "Call" screen (the student and staff Classes
// stacks both have one).
import { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, errorMessage } from "../lib/api";
import { PLANS } from "../shared/constants";
import { useAuth } from "../context/AuthContext";
import { useToast } from "./Toast";
import { ErrorState } from "./QueryState";
import { colors, spacing } from "../styles/theme";

export const useActiveCall = (classId) =>
  useQuery({
    queryKey: ["class", classId, "call"],
    queryFn: () => api(`/classes/${classId}/calls/active`).then((r) => r.call),
    refetchInterval: 15_000,
    enabled: !!classId,
  });

export function formatCountdown(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function CallBanner({ classId, navigation: navigationProp }) {
  const screenNavigation = useNavigation();
  const navigation = navigationProp ?? screenNavigation;
  const { me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useActiveCall(classId);
  const call = q.data;
  const [now, setNow] = useState(Date.now());
  const staff = me?.role === "teacher" || me?.role === "school_admin";

  useEffect(() => {
    if (!call) return undefined;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [call]);

  const start = useMutation({
    mutationFn: () => api(`/classes/${classId}/calls`, { body: {} }),
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: ["class", classId, "call"] });
      navigation.navigate("Call", { callId: c.id });
    },
    onError: (err) => {
      // Someone else started one a moment ago: show it so this person can join.
      if (err instanceof ApiError && err.code === "call_active") {
        void q.refetch();
        return;
      }
      toast.error(errorMessage(err));
    },
  });

  if (call) {
    const left = new Date(call.endsAt).getTime() - now;
    return (
      <View style={[s.panel, s.live]} accessibilityRole="summary" accessibilityLabel="Video call">
        <View style={s.row}>
          <View style={s.dot} />
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{call.hostName ?? "Your teacher"} is in a video call</Text>
            <Text style={s.sub}>
              {call.participantCount} in the call · {left > 0 ? `${formatCountdown(left)} left` : "ending"}
            </Text>
          </View>
        </View>
        <Pressable style={[s.btn, s.btnPrimary]} onPress={() => navigation.navigate("Call", { callId: call.id })} accessibilityRole="button">
          <Text style={s.btnPrimaryText}>📹 Join call</Text>
        </Pressable>
      </View>
    );
  }
  if (q.isPending) return null;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!staff) return null;

  const minutes = Math.round((me?.plan?.callLimitSeconds ?? PLANS.freeCallSeconds) / 60);
  return (
    <View style={s.panel} accessibilityRole="summary" accessibilityLabel="Video call">
      <View style={s.row}>
        <Text style={s.icon}>📹</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Quick video call</Text>
          <Text style={s.sub}>
            Up to {PLANS.callMaxParticipants} people, {minutes} minutes.
            {me?.role === "teacher" && !me?.plan?.premium ? " Premium gives you 15 minutes." : ""}
          </Text>
        </View>
      </View>
      <Pressable
        style={[s.btn, s.btnSecondary, start.isPending && { opacity: 0.6 }]}
        onPress={() => start.mutate()}
        disabled={start.isPending}
        accessibilityRole="button"
        accessibilityState={{ busy: start.isPending }}
      >
        {start.isPending ? <ActivityIndicator color={colors.ai} /> : <Text style={s.btnSecondaryText}>Start call</Text>}
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  panel: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: spacing.md, marginBottom: spacing.md, gap: spacing.md },
  live: { borderColor: colors.ai },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: colors.matcha },
  icon: { fontSize: 20 },
  title: { fontSize: 16, fontWeight: "600", color: colors.ink },
  sub: { fontSize: 14, color: colors.ink2, marginTop: 2 },
  btn: { minHeight: 44, borderRadius: 10, paddingHorizontal: spacing.lg, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  btnPrimary: { backgroundColor: colors.ai, borderColor: colors.ai },
  btnPrimaryText: { color: colors.paper, fontWeight: "600", fontSize: 16 },
  btnSecondary: { backgroundColor: colors.paper, borderColor: colors.line },
  btnSecondaryText: { color: colors.ai, fontWeight: "600", fontSize: 16 },
});
