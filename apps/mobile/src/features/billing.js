// Mirror of apps/web/src/features/billing/billing.tsx: payment labels, the
// checkout starter, and the payment history list shared by Premium (teacher)
// and Billing (School Admin).
import { View, Text, Pressable, Linking, StyleSheet } from "react-native";
import { useMutation } from "@tanstack/react-query";
import { api } from "../lib/api";
import { urlPath } from "../lib/url";
import { formatDateTime, formatPeso } from "../lib/format";
import { EmptyState } from "../components/QueryState";
import { colors, spacing, text } from "../styles/theme";

export const PAYMENT_STATUS_LABEL = {
  pending: "Waiting for payment",
  paid: "Paid",
  needs_review: "Being reviewed",
  expired: "Expired",
  refunded: "Refunded",
};

const BADGE = {
  success: { bg: "#dcfce7", fg: colors.matcha },
  danger: { bg: "#fee2e2", fg: colors.shu },
  neutral: { bg: colors.kasumi, fg: colors.ink2 },
  info: { bg: "#e0e7ff", fg: colors.ai },
};

export function PaymentBadge({ status }) {
  const tone = status === "paid" ? "success" : status === "expired" ? "danger" : status === "refunded" ? "neutral" : "info";
  return (
    <View style={[styles.badge, { backgroundColor: BADGE[tone].bg }]}>
      <Text style={[styles.badgeText, { color: BADGE[tone].fg }]}>{PAYMENT_STATUS_LABEL[status] ?? status}</Text>
    </View>
  );
}

/** Where each purchase is managed in the app (web: billingHome). */
export const billingHome = (p) => (p.purpose === "teacher_seats" ? "SchoolBillingHome" : "PremiumHome");

/** True when the checkout URL is the development stand-in for PayMongo (PAYMONGO_MODE=mock). */
export function isMockCheckout(url) {
  return urlPath(url).startsWith("/dev/mock-checkout/");
}

/**
 * Sends the payer to the checkout: PayMongo's hosted page in the phone's browser,
 * or — in development — the in-app copy of the web app's mock checkout page,
 * because the mock page lives on the laptop. The payment screen then waits for
 * the server to confirm; it never grants anything itself.
 */
export async function openCheckout(navigation, { paymentId, checkoutUrl }) {
  if (isMockCheckout(checkoutUrl)) {
    navigation.navigate("MockCheckout", { paymentId });
    return;
  }
  navigation.navigate("PaymentPending", { paymentId });
  await Linking.openURL(checkoutUrl);
}

/** Starts a PayMongo checkout. The amount is set by the server (web: useCheckout). */
export function useCheckout(path, navigation) {
  return useMutation({
    mutationFn: (body = {}) => api(path, { body }),
    onSuccess: (r) => openCheckout(navigation, r),
  });
}

/**
 * Payment history (web: PaymentHistory). "Continue payment" is offered for a
 * pending checkout only when `canContinue(p)` says so — a teacher who already
 * has Premium is never sent to pay for it again.
 */
export function PaymentHistory({ items, showPayer, navigation, canContinue = () => true }) {
  if (!items.length) return <EmptyState>No payments yet.</EmptyState>;
  return (
    <View>
      {items.map((p) => (
        <View key={p.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>{p.description}</Text>
            {showPayer && p.payerName ? <Text style={text.small}>Paid by {p.payerName}</Text> : null}
            <Text style={text.small}>Ref {p.referenceNumber} · {formatDateTime(p.paidAt ?? p.createdAt)}</Text>
            <View style={{ marginTop: spacing.xs }}><PaymentBadge status={p.status} /></View>
          </View>
          <View style={styles.rowRight}>
            <Text style={styles.amount}>{formatPeso(p.amountCentavos)}</Text>
            {p.status === "paid" || p.status === "refunded" ? (
              <Pressable style={styles.action} onPress={() => navigation.navigate("Receipt", { paymentId: p.id })} accessibilityRole="button">
                <Text style={styles.actionText}>Receipt</Text>
              </Pressable>
            ) : p.status === "pending" && p.checkoutUrl && canContinue(p) ? (
              <Pressable style={styles.action} onPress={() => openCheckout(navigation, { paymentId: p.id, checkoutUrl: p.checkoutUrl })} accessibilityRole="button">
                <Text style={styles.actionText}>Continue payment</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: "flex-start", paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: "600" },
  row: { flexDirection: "row", gap: spacing.sm, backgroundColor: colors.paper, borderRadius: 10, padding: spacing.md, marginBottom: spacing.xs, borderWidth: 1, borderColor: colors.line },
  rowTitle: { ...text.body, fontWeight: "600" },
  rowRight: { alignItems: "flex-end", justifyContent: "space-between" },
  amount: { ...text.body, fontWeight: "600" },
  action: { minHeight: 44, justifyContent: "center" },
  actionText: { color: colors.ai, fontWeight: "600" },
});
