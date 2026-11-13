// A payment acknowledgment for teacher slots or Premium — not a BIR official
// receipt. Mirror of apps/web/src/features/payments/ReceiptPage.tsx; the web
// page's Print button becomes Share on the phone.
import { View, Text, Pressable, ScrollView, Share, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { formatDateTime, formatPeso } from "../../lib/format";
import { Loading, ErrorState } from "../../components/QueryState";
import { colors, spacing, text } from "../../styles/theme";

const FOOTER = "This acknowledges a payment received by Nihongo Class through PayMongo. It is not a BIR official receipt.";

export function ReceiptScreen({ route, navigation }) {
  const { paymentId } = route.params;
  const q = useQuery({ queryKey: ["receipt", paymentId], queryFn: () => api(`/payments/${paymentId}/receipt`) });

  let body;
  if (q.isPending) body = <Loading />;
  else if (q.isError) body = <ErrorState error={q.error} retry={q.refetch} />;
  else {
    const r = q.data;
    const rows = [
      ...(r.schoolName ? [["School", r.schoolName]] : []),
      ["Paid by", `${r.payerName} (${r.payerEmail})`],
      ["For", r.description],
      ["Amount", formatPeso(r.amountCentavos)],
      ["Method", r.method],
      ["Reference number", r.referenceNumber],
      ["Date paid", formatDateTime(r.paidAt)],
    ];
    const share = () =>
      Share.share({
        message: ["Nihongo Class — Payment acknowledgment", ...(r.status === "refunded" ? ["This payment was later refunded."] : []), ...rows.map(([k, v]) => `${k}: ${v}`), FOOTER].join("\n"),
      });
    body = (
      <>
        <Pressable style={styles.share} onPress={share} accessibilityRole="button"><Text style={styles.shareText}>Share</Text></Pressable>
        <View style={styles.article}>
          <Text style={text.small}>Nihongo Class</Text>
          <Text style={styles.heading}>Payment acknowledgment</Text>
          {r.status === "refunded" ? <Text style={styles.refunded}>This payment was later refunded.</Text> : null}
          <View style={styles.dl}>
            {rows.map(([k, v]) => (
              <View key={k} style={styles.dlRow}>
                <Text style={styles.dt}>{k}</Text>
                <Text style={[styles.dd, k === "Amount" && styles.ddAmount, k === "Reference number" && styles.ddMono]}>{v}</Text>
              </View>
            ))}
          </View>
          <Text style={[text.small, { marginTop: spacing.lg }]}>{FOOTER}</Text>
        </View>
      </>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityRole="button"><Text style={styles.back}>‹ Back</Text></Pressable>
        <Text style={styles.title}>Receipt</Text>
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
  share: { alignSelf: "flex-end", minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.line, borderRadius: 10, backgroundColor: colors.paper },
  shareText: { color: colors.ai, fontWeight: "600" },
  article: { backgroundColor: colors.paper, borderRadius: 12, padding: spacing.xl, borderWidth: 1, borderColor: colors.line },
  heading: { ...text.h2, fontSize: 22, marginTop: spacing.xs },
  refunded: { color: colors.shu, fontWeight: "600", marginTop: spacing.sm },
  dl: { marginTop: spacing.lg, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line },
  dlRow: { paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line },
  dt: { ...text.small },
  dd: { ...text.body, marginTop: 2 },
  ddAmount: { fontSize: 18, fontWeight: "600" },
  ddMono: { fontFamily: "monospace" },
});
