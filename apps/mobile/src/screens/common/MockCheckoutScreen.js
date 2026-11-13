// §15 mock checkout (mirror of MockCheckoutPage in apps/web/src/features/billing/billing.tsx).
// Only reachable when the API runs with PAYMONGO_MODE=mock: it stands in for
// PayMongo's hosted page, and Pay sends a signed payment event to the API's
// webhook exactly as PayMongo would. The web page lives on the laptop, so the
// phone gets this in-app copy.
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, errorMessage } from "../../lib/api";
import { formatPeso } from "../../lib/format";
import { Loading, ErrorState } from "../../components/QueryState";
import { colors, spacing, text } from "../../styles/theme";

export function MockCheckoutScreen({ route, navigation }) {
  const { paymentId } = route.params;
  const q = useQuery({ queryKey: ["mock-checkout", paymentId], queryFn: () => api(`/dev/mock-paymongo/${paymentId}`) });
  const pay = useMutation({
    mutationFn: () => api(`/dev/mock-paymongo/${paymentId}/pay`, { method: "POST", body: { method: "gcash" } }),
    onSuccess: () => navigation.replace("PaymentPending", { paymentId }),
  });

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}><Text style={styles.title}>Test checkout</Text></View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>
        {q.isPending ? (
          <Loading />
        ) : q.isError ? (
          <ErrorState error={q.error} retry={q.refetch} />
        ) : (
          <View style={styles.panel}>
            <Text style={text.small}>Test checkout (PAYMONGO_MODE=mock)</Text>
            <Text style={styles.desc}>{q.data.description}</Text>
            <Text style={styles.amount}>{formatPeso(q.data.amountCentavos)}</Text>
            <Text style={text.small}>Reference {q.data.referenceNumber}</Text>
            <Text style={[text.bodyMuted, { marginTop: spacing.md }]}>
              This page stands in for PayMongo's hosted checkout. Pay sends a signed payment event to the API's webhook, exactly as PayMongo would.
            </Text>
            {pay.isError ? <View style={styles.alert}><Text style={styles.alertText}>{errorMessage(pay.error)}</Text></View> : null}
            <Pressable style={[styles.primary, pay.isPending && styles.busy]} onPress={() => pay.mutate()} disabled={pay.isPending} accessibilityRole="button">
              {pay.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Pay {formatPeso(q.data.amountCentavos)}</Text>}
            </Pressable>
            <Pressable style={styles.secondary} onPress={() => navigation.goBack()} disabled={pay.isPending} accessibilityRole="button">
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.kasumi },
  header: { padding: spacing.lg, backgroundColor: colors.paper, borderBottomWidth: 1, borderBottomColor: colors.line },
  title: { ...text.h1, color: colors.ink, fontSize: 22 },
  panel: { backgroundColor: colors.paper, borderRadius: 12, padding: spacing.xl, borderWidth: 1, borderColor: colors.line },
  desc: { ...text.h2, marginTop: spacing.xs },
  amount: { fontSize: 32, fontWeight: "600", color: colors.ink, marginTop: spacing.md },
  alert: { marginTop: spacing.md, backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca", borderRadius: 10, padding: spacing.md },
  alertText: { color: colors.shu },
  primary: { marginTop: spacing.lg, backgroundColor: colors.ai, paddingVertical: 14, borderRadius: 10, alignItems: "center", minHeight: 48, justifyContent: "center" },
  busy: { opacity: 0.6 },
  primaryText: { ...text.button },
  secondary: { marginTop: spacing.sm, paddingVertical: 12, alignItems: "center", minHeight: 44, justifyContent: "center" },
  secondaryText: { color: colors.ai, fontWeight: "600" },
});
