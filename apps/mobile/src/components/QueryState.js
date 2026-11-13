// Mirror of the web app's Loading / ErrorState / EmptyState
// (apps/web/src/components/ui/misc.tsx). A failed request always shows its
// message with "Try again" — it never renders as an empty list.
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { colors, spacing } from "../styles/theme";
import { errorMessage } from "../lib/api";

export function Loading({ label = "Loading" }) {
  return (
    <View style={styles.loading} accessibilityRole="progressbar">
      <ActivityIndicator color={colors.ai} />
      <Text style={styles.loadingText}>{label}…</Text>
    </View>
  );
}

export function ErrorState({ error, retry }) {
  return (
    <View style={styles.error} accessibilityRole="alert">
      <Text style={styles.errorText}>{errorMessage(error)}</Text>
      {retry ? (
        <Pressable onPress={() => retry()} hitSlop={8} style={styles.retry} accessibilityRole="button">
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({ children, action }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{children}</Text>
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingVertical: spacing.xxl },
  loadingText: { color: colors.ink2, fontSize: 15 },
  error: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: spacing.md, margin: spacing.md },
  errorText: { color: colors.shu, fontSize: 15 },
  retry: { marginTop: spacing.sm, minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  retryText: { color: colors.ai, textDecorationLine: "underline", fontSize: 15 },
  empty: { backgroundColor: colors.paper, borderWidth: 1, borderStyle: "dashed", borderColor: colors.line, borderRadius: 10, paddingHorizontal: spacing.xl, paddingVertical: 40, margin: spacing.md, alignItems: "center" },
  emptyText: { color: colors.ink2, fontSize: 15, textAlign: "center" },
  emptyAction: { marginTop: spacing.md, flexDirection: "row", gap: spacing.sm },
});
