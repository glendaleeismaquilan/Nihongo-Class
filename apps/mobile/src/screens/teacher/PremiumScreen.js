// Teacher Premium (mirror of apps/web/src/roles/teacher/PremiumPage.tsx).
// The plan comes from GET /billing/premium, computed by the server from the one
// source of truth, users/{uid}.premiumSince. A failed request shows an error —
// it is never read as "not premium" — and the pay button only renders after a
// successful read says the teacher doesn't have Premium yet.
import { useCallback } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, RefreshControl, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { api, errorMessage } from "../../lib/api";
import { formatBytes, formatDate, formatPeso } from "../../lib/format";
import { PLANS } from "../../shared/constants";
import { Loading, ErrorState } from "../../components/QueryState";
import { PaymentHistory, useCheckout } from "../../features/billing";
import { colors, spacing, text } from "../../styles/theme";

const minutes = (s) => `${Math.round(s / 60)} minutes`;

const FEATURES = [
  { label: "In-app video calls", free: minutes(PLANS.freeCallSeconds), premium: minutes(PLANS.premiumCallSeconds) },
  { label: "My Drive and class materials", free: formatBytes(PLANS.freeStorageBytes), premium: formatBytes(PLANS.premiumStorageBytes) },
];

export function PremiumScreen({ navigation }) {
  const q = useQuery({ queryKey: ["billing", "premium"], queryFn: () => api("/billing/premium") });
  const checkout = useCheckout("/billing/premium/checkout", navigation);
  // Web leaves the page on success; here the user can come back from a
  // cancelled checkout, so start fresh whenever this screen is shown again.
  const resetCheckout = checkout.reset;
  useFocusEffect(useCallback(() => { resetCheckout(); }, [resetCheckout]));

  if (q.isPending) return <SafeAreaView style={styles.root} edges={["top"]}><Loading /></SafeAreaView>;
  if (q.isError) return <SafeAreaView style={styles.root} edges={["top"]}><ErrorState error={q.error} retry={q.refetch} /></SafeAreaView>;

  const { plan, payments } = q.data;
  const used = plan.storageLimitBytes ? Math.min(1, plan.storageUsedBytes / plan.storageLimitBytes) : 0;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={q.refetch} />}>
        <Text style={styles.title}>Premium</Text>
        <Text style={styles.sub}>{formatPeso(PLANS.premiumPriceCentavos)}, paid once. Premium never expires, and there's nothing to renew.</Text>

        <View style={[styles.panel, plan.premium && styles.panelPremium]}>
          <Text style={text.small}>Your plan</Text>
          <View style={styles.planRow}>
            {plan.premium ? <Text style={styles.star}>★</Text> : null}
            <Text style={styles.planName}>{plan.premium ? "Premium" : "Free"}</Text>
            {plan.premium ? <View style={styles.lifetime}><Text style={styles.lifetimeText}>Lifetime</Text></View> : null}
          </View>
          {plan.premium && plan.premiumSince ? <Text style={[text.small, { marginTop: spacing.xs }]}>Yours since {formatDate(plan.premiumSince)}. It never expires.</Text> : null}

          {!plan.premium ? (
            <Pressable
              style={[styles.buy, (checkout.isPending || checkout.isSuccess) && styles.busy]}
              onPress={() => checkout.mutate({})}
              disabled={checkout.isPending || checkout.isSuccess}
              accessibilityRole="button"
            >
              {checkout.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.buyText}>★ Go Premium for {formatPeso(PLANS.premiumPriceCentavos)}</Text>}
            </Pressable>
          ) : null}
          {checkout.isError ? <View style={styles.alert}><Text style={styles.alertText}>{errorMessage(checkout.error)}</Text></View> : null}

          <Text style={[text.small, { marginTop: spacing.lg }]}>Storage: {formatBytes(plan.storageUsedBytes)} of {formatBytes(plan.storageLimitBytes)}</Text>
          <View style={styles.bar} accessibilityLabel="Storage used" accessibilityValue={{ min: 0, max: 100, now: Math.round(used * 100) }}>
            <View style={[styles.barFill, { width: `${used * 100}%` }]} />
          </View>
        </View>

        <View style={styles.panel}>
          <Text style={styles.section}>What Premium adds</Text>
          <View style={styles.tableHead}>
            <Text style={[styles.cellLabel, text.small]} />
            <Text style={[styles.cell, text.small]}>Free</Text>
            <Text style={[styles.cell, text.small]}>Premium</Text>
          </View>
          {FEATURES.map((f) => (
            <View key={f.label} style={styles.tableRow}>
              <Text style={[styles.cellLabel, { fontWeight: "600", color: colors.ink }]}>{f.label}</Text>
              <Text style={[styles.cell, { color: colors.ink2 }]}>{f.free}</Text>
              <Text style={[styles.cell, { fontWeight: "600", color: colors.ink }]}>{f.premium}</Text>
            </View>
          ))}
          <Text style={[text.small, { marginTop: spacing.sm }]}>Live classes with Google Meet stay free and unlimited. Your classes are always free for students.</Text>
        </View>

        <Text style={styles.section}>Payment history</Text>
        <PaymentHistory items={payments} navigation={navigation} canContinue={(p) => !(p.purpose === "premium" && plan.premium)} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.kasumi },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { ...text.h1, color: colors.ai },
  sub: { ...text.small, marginTop: spacing.xs, marginBottom: spacing.md },
  panel: { backgroundColor: colors.paper, borderRadius: 12, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.line },
  panelPremium: { borderColor: colors.matcha },
  planRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.xs },
  star: { color: colors.ai, fontSize: 20 },
  planName: { fontSize: 22, fontWeight: "600", color: colors.ink },
  lifetime: { backgroundColor: "#dcfce7", paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: 999 },
  lifetimeText: { color: colors.matcha, fontSize: 12, fontWeight: "600" },
  buy: { marginTop: spacing.md, backgroundColor: colors.ai, paddingVertical: 14, borderRadius: 10, alignItems: "center", minHeight: 48, justifyContent: "center" },
  busy: { opacity: 0.6 },
  buyText: { ...text.button },
  alert: { marginTop: spacing.md, backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca", borderRadius: 10, padding: spacing.md },
  alertText: { color: colors.shu },
  bar: { height: 8, backgroundColor: colors.kasumi, borderRadius: 4, marginTop: spacing.xs, overflow: "hidden" },
  barFill: { height: 8, backgroundColor: colors.ai },
  section: { ...text.h2, fontSize: 17, marginBottom: spacing.sm },
  tableHead: { flexDirection: "row", paddingVertical: spacing.xs },
  tableRow: { flexDirection: "row", paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line },
  cellLabel: { flex: 1.4, fontSize: 14 },
  cell: { flex: 1, fontSize: 14 },
});
