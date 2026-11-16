// The "or" divider and Google button under the sign-in and sign-up forms (web: the
// Google button in LoginPage.tsx and SignupPage.tsx).
import { View, Text, Pressable, StyleSheet } from "react-native";
import { colors, spacing } from "../styles/theme";

export function GoogleButton({ label, onPress, disabled }) {
  return (
    <>
      <View style={styles.orRow}>
        <View style={styles.hr} />
        <Text style={styles.orText}>or</Text>
        <View style={styles.hr} />
      </View>
      <Pressable style={[styles.button, disabled && styles.disabled]} onPress={onPress} disabled={disabled} accessibilityRole="button">
        <Text style={styles.icon}>G</Text>
        <Text style={styles.label}>{label}</Text>
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  orRow: { flexDirection: "row", alignItems: "center", marginVertical: spacing.lg, gap: spacing.sm },
  hr: { flex: 1, height: 1, backgroundColor: colors.line },
  orText: { color: colors.ink2, fontSize: 12 },
  button: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, paddingVertical: 12, borderRadius: 10, gap: spacing.sm },
  disabled: { opacity: 0.6 },
  icon: { width: 20, height: 20, textAlign: "center", lineHeight: 20, borderRadius: 10, backgroundColor: "#4285F4", color: "#fff", fontWeight: "900" },
  label: { color: colors.ink, fontWeight: "600", fontSize: 15 },
});
