// Tiny password strength indicator. Four bars that fill based on score (0-4) + a label.
// Heuristic: length + character-class diversity. Not perfect but gives useful feedback.
import { View, Text, StyleSheet } from "react-native";
import { colors, spacing, text as T } from "../styles/theme";

export function scorePassword(pw) {
  if (!pw) return { score: 0, label: "" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((r) => r.test(pw)).length;
  if (classes >= 2) score++;
  if (classes >= 3) score++;
  if (pw.length < 8) score = Math.min(score, 1);
  const labels = ["Too short", "Weak", "Fair", "Strong", "Very strong"];
  return { score: Math.min(score, 4), label: labels[Math.min(score, 4)] };
}

export function PasswordStrength({ password }) {
  const { score, label } = scorePassword(password);
  if (!password) return null;
  const colorsByScore = ["#9ca3af", colors.shu, "#b45309", "#15803d", "#059669"];
  const barColor = colorsByScore[score];
  return (
    <View style={{ marginTop: 6 }}>
      <View style={styles.barsRow}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.bar, { backgroundColor: i < Math.max(1, score) ? barColor : colors.line }]} />
        ))}
      </View>
      <Text style={[T.small, { color: barColor, marginTop: 4 }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  barsRow: { flexDirection: "row", gap: spacing.xs },
  bar: { flex: 1, height: 4, borderRadius: 2 },
});
