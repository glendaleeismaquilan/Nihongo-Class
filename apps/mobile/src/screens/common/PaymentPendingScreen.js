// The payment screen (mirror of PaymentReturnPage in
// apps/web/src/features/billing/billing.tsx). Polls GET /payments/:id every 2 s
// for a minute — restarting the minute whenever the app comes back from the
// browser — and, once paid, refreshes /me and billing. Slots and Premium are
// granted by the server (webhook or reconciliation), never by this screen.
import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, AppState, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { formatPeso } from "../../lib/format";
import { useAuth } from "../../context/AuthContext";
import { Loading, ErrorState } from "../../components/QueryState";
import { PaymentBadge, billingHome, openCheckout } from "../../features/billing";
import { colors, spacing, text } from "../../styles/theme";

export function PaymentPendingScreen({ route, navigation }) {
  const { paymentId } = route.params;
  const { me } = useAuth();
  const qc = useQueryClient();
  const [windowStart, setWindowStart] = useState(() => Date.now());
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        setWindowStart(Date.now());
        setTimedOut(false);
      }
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), Math.max(0, 60_000 - (Date.now() - windowStart)));
    return () => clearTimeout(t);
  }, [windowStart]);

  const q = useQuery({
    queryKey: ["payment", paymentId],
    queryFn: () => api(`/payments/${paymentId}`),
    refetchInterval: (query) => (query.state.data?.status === "paid" || timedOut ? false : 2000),
    gcTime: 0,
  });
  const p = q.data;
  const paid = p?.status === "paid";

  useEffect(() => {
    if (!paid) return;
    void qc.invalidateQueries({ queryKey: ["me"] });
    void qc.invalidateQueries({ queryKey: ["billing"] });
  }, [paid, qc]);

  const home = p ? billingHome(p) : me?.role === "school_admin" ? "SchoolBillingHome" : "PremiumHome";
  // A teacher who already has Premium is never sent back to pay for it.
  const mayContinue = p?.status === "pending" && p.checkoutUrl && !(p.purpose === "premium" && me?.plan?.premium);

  let body;
  if (q.isPending) body = <Loading />;
  else if (q.isError) body = <ErrorState error={q.error} retry={q.refetch} />;
  else if (paid) {
    body = (
      <View style={styles.panel} accessibilityLiveRegion="polite">
        <Text style={styles.check}>✓</Text>
        <Text style={styles.heading}>{p.purpose === "teacher_seats" ? `${p.quantity * 5} teacher slots added` : "You're on Premium"}</Text>
        <Text style={styles.para}>We received {formatPeso(p.amountCentavos)} for {p.description}. Reference {p.referenceNumber}.</Text>
        {p.purpose === "premium" ? <Text style={styles.para}>Premium is yours for good. There's nothing to renew.</Text> : null}
        <Pressable style={styles.primary} onPress={() => (p.purpose === "teacher_seats" ? navigation.getParent()?.navigate("People") : navigation.navigate("PremiumHome"))} accessibilityRole="button">
          <Text style={styles.primaryText}>{p.purpose === "teacher_seats" ? "Add teachers" : "See my plan"}</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => navigation.navigate("Receipt", { paymentId: p.id })} accessibilityRole="button">
          <Text style={styles.secondaryText}>View receipt</Text>
        </Pressable>
      </View>
    );
  } else if (p.status === "needs_review" || p.status === "expired" || p.status === "refunded" || timedOut) {
    const still = p.status === "needs_review" || (p.status === "pending" && timedOut);
    body = (
      <View style={styles.panel}>
        <PaymentBadge status={p.status} />
        <Text style={styles.heading}>{still ? "Still processing" : p.status === "expired" ? "This checkout expired" : "This payment was refunded"}</Text>
        <Text style={styles.para}>
          {still
            ? "We'll notify you when it's confirmed. You don't need to pay again."
            : p.status === "expired"
              ? "Nothing was charged. Start a new checkout from billing if you still want it."
              : `${formatPeso(p.amountCentavos)} for ${p.description} was refunded.`}
        </Text>
        {p.status === "pending" ? (
          <Pressable style={styles.secondary} onPress={() => { setWindowStart(Date.now()); setTimedOut(false); void q.refetch(); }} accessibilityRole="button">
            <Text style={styles.secondaryText}>Check again</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.secondary} onPress={() => navigation.navigate(home)} accessibilityRole="button">
          <Text style={styles.secondaryText}>Back to billing</Text>
        </Pressable>
      </View>
    );
  } else {
    body = (
      <View style={styles.panel} accessibilityLiveRegion="polite">
        <Loading label="Confirming your payment" />
        <Text style={styles.para}>Finish paying on the checkout page. This screen updates by itself once the payment is confirmed.</Text>
        <Text style={[text.small, { textAlign: "center", marginTop: spacing.xs }]}>{p.description} · {formatPeso(p.amountCentavos)} · Ref {p.referenceNumber}</Text>
        {mayContinue ? (
          <Pressable style={styles.primary} onPress={() => openCheckout(navigation, { paymentId: p.id, checkoutUrl: p.checkoutUrl })} accessibilityRole="button">
            <Text style={styles.primaryText}>Continue payment</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.navigate(home)} hitSlop={8} accessibilityRole="button"><Text style={styles.back}>‹ Billing</Text></Pressable>
        <Text style={styles.title}>Payment</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.lg }}>{body}</ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.kasumi },
  header: { padding: spacing.lg, backgroundColor: colors.paper, borderBottomWidth: 1, borderBottomColor: colors.line },
  back: { color: colors.ai, fontSize: 15, minHeight: 32 },
  title: { ...text.h1, color: colors.ink, marginTop: spacing.xs, fontSize: 22 },
  panel: { backgroundColor: colors.paper, borderRadius: 12, padding: spacing.xl, alignItems: "center", borderWidth: 1, borderColor: colors.line },
  check: { fontSize: 40, color: colors.matcha },
  heading: { ...text.h2, fontSize: 22, textAlign: "center", marginTop: spacing.sm },
  para: { ...text.bodyMuted, textAlign: "center", marginTop: spacing.sm },
  primary: { marginTop: spacing.lg, backgroundColor: colors.ai, paddingVertical: 12, paddingHorizontal: spacing.xl, borderRadius: 10, alignItems: "center", minHeight: 44, alignSelf: "stretch", justifyContent: "center" },
  primaryText: { ...text.button },
  secondary: { marginTop: spacing.sm, paddingVertical: 12, alignItems: "center", minHeight: 44, alignSelf: "stretch", justifyContent: "center" },
  secondaryText: { color: colors.ai, fontWeight: "600" },
});
