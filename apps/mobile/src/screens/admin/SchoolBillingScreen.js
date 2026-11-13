// Teacher slots: 5 free per school, then 5 more per one-time pack (mirror of
// apps/web/src/roles/admin/BillingPage.tsx). The amount is set by the server;
// a failed load shows an error — seats are never made up.
import { useCallback, useState } from "react";
import { View, Text, ScrollView, Pressable, ActivityIndicator, StyleSheet, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { api, errorMessage } from "../../lib/api";
import { formatPeso } from "../../lib/format";
import { PLANS } from "../../shared/constants";
import { Loading, ErrorState } from "../../components/QueryState";
import { PaymentHistory, useCheckout } from "../../features/billing";
import { PageHeader, StatTile, TileGrid, ProgressBar, SectionTitle } from "./adminUi";
import { colors, spacing, text } from "../../styles/theme";

/** Same query as the web app's useSchoolBilling. */
export const useSchoolBilling = () => useQuery({ queryKey: ["billing", "school"], queryFn: () => api("/billing/school") });

export function SchoolBillingScreen({ navigation }) {
  const q = useSchoolBilling();
  const checkout = useCheckout("/billing/teacher-seats/checkout", navigation);
  const [packs, setPacks] = useState(1);
  // The checkout moves to another screen; coming back (paid or cancelled) must
  // re-enable Pay, which web gets for free by leaving the page.
  const { reset } = checkout;
  useFocusEffect(useCallback(() => { reset(); }, [reset]));

  if (q.isPending) return <SafeAreaView style={styles.root} edges={["top"]}><Loading /></SafeAreaView>;
  if (q.isError) return <SafeAreaView style={styles.root} edges={["top"]}><ErrorState error={q.error} retry={q.refetch} /></SafeAreaView>;

  const { seats, payments } = q.data;
  const busy = checkout.isPending || checkout.isSuccess;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => void q.refetch()} />}>
        <PageHeader title="Billing" description="Classes are free for students. Your school pays only for teacher slots beyond the first 5." />

        <TileGrid>
          <StatTile label="Teachers" value={`${seats.used} of ${seats.total}`} hint={seats.available ? `${seats.available} slots free` : "All slots in use"} />
          <StatTile label="Free slots" value={seats.free} hint="Included with every school" />
          <StatTile label="Bought slots" value={seats.purchased} hint="One-time, never expire" />
        </TileGrid>
        <ProgressBar value={seats.total ? seats.used / seats.total : 0} label={`${seats.used} of ${seats.total} teacher slots in use`} />

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Add teacher slots</Text>
          <Text style={text.bodyMuted}>
            Each pack adds {PLANS.seatPackSize} teacher slots for {formatPeso(PLANS.seatPackPriceCentavos)}, paid once. Pay with GCash, Maya, QR Ph, or card through PayMongo.
          </Text>
          {checkout.isError ? <View style={styles.alert}><Text style={styles.alertText}>{errorMessage(checkout.error)}</Text></View> : null}

          <Text style={styles.label}>Packs</Text>
          <View style={styles.stepper}>
            <Pressable
              style={[styles.stepBtn, packs <= 1 && styles.stepOff]}
              onPress={() => setPacks((n) => Math.max(1, n - 1))}
              disabled={packs <= 1 || busy}
              accessibilityRole="button"
              accessibilityLabel="Fewer packs"
            >
              <Text style={styles.stepText}>−</Text>
            </Pressable>
            <View style={styles.packBox} accessibilityLiveRegion="polite">
              <Text style={styles.packText}>{packs} {packs === 1 ? "pack" : "packs"} ({packs * PLANS.seatPackSize} slots)</Text>
            </View>
            <Pressable
              style={[styles.stepBtn, packs >= PLANS.maxSeatPacksPerPurchase && styles.stepOff]}
              onPress={() => setPacks((n) => Math.min(PLANS.maxSeatPacksPerPurchase, n + 1))}
              disabled={packs >= PLANS.maxSeatPacksPerPurchase || busy}
              accessibilityRole="button"
              accessibilityLabel="More packs"
            >
              <Text style={styles.stepText}>+</Text>
            </Pressable>
          </View>

          <Pressable style={[styles.pay, busy && styles.payBusy]} onPress={() => checkout.mutate({ packs })} disabled={busy} accessibilityRole="button">
            {checkout.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.payText}>Pay {formatPeso(packs * PLANS.seatPackPriceCentavos)}</Text>}
          </Pressable>
        </View>

        <SectionTitle>Payment history</SectionTitle>
        <PaymentHistory items={payments} showPayer navigation={navigation} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.kasumi },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  panel: { backgroundColor: colors.paper, borderRadius: 12, padding: spacing.lg, marginTop: spacing.lg, borderWidth: 1, borderColor: colors.line },
  panelTitle: { ...text.h2, fontSize: 18, marginBottom: spacing.xs },
  alert: { marginTop: spacing.md, backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca", borderRadius: 10, padding: spacing.md },
  alertText: { color: colors.shu },
  label: { ...text.small, color: colors.ink, marginTop: spacing.md, marginBottom: spacing.xs },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stepBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.kasumi, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.line },
  stepOff: { opacity: 0.4 },
  stepText: { fontSize: 22, color: colors.ai, fontWeight: "600" },
  packBox: { flex: 1, alignItems: "center" },
  packText: { ...text.body, fontWeight: "600" },
  pay: { marginTop: spacing.lg, backgroundColor: colors.ai, paddingVertical: 14, borderRadius: 10, alignItems: "center", minHeight: 48, justifyContent: "center" },
  payBusy: { opacity: 0.6 },
  payText: { ...text.button },
});
