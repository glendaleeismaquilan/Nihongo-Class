// Small building blocks for the student screens, matching the web app's
// components/ui (LevelTag, Badge, Panel, SectionTitle, Button, StatTile, Segmented).
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { LEVEL_ACCENTS } from "../../shared/constants";
import { colors, spacing, text } from "../../styles/theme";

export function LevelTag({ level }) {
  if (!level) return null;
  return (
    <View style={styles.levelTag} accessibilityLabel={`Level ${level}`}>
      <View style={[styles.levelMark, { backgroundColor: LEVEL_ACCENTS[level] ?? colors.line }]} />
      <Text style={styles.levelText}>{level}</Text>
    </View>
  );
}

const BADGE = {
  success: { bg: "#dcfce7", fg: colors.matcha },
  danger: { bg: "#fee2e2", fg: colors.shu },
  info: { bg: "#e0e7ff", fg: colors.ai },
  warning: { bg: "#fef3c7", fg: "#92400e" },
  neutral: { bg: colors.kasumi, fg: colors.ink2 },
};

export function Badge({ tone = "neutral", children }) {
  const t = BADGE[tone] ?? BADGE.neutral;
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <Text style={[styles.badgeText, { color: t.fg }]}>{children}</Text>
    </View>
  );
}

/** A card. `level` adds the 4px level stripe on the left edge (web: levelStripe). */
export function Panel({ level, style, children }) {
  return <View style={[styles.panel, level ? { borderLeftWidth: 4, borderLeftColor: LEVEL_ACCENTS[level] ?? colors.line } : null, style]}>{children}</View>;
}

export function SectionTitle({ children }) {
  return <Text style={styles.sectionTitle} accessibilityRole="header">{children}</Text>;
}

export function Button({ variant = "primary", size = "md", loading, disabled, onPress, children, accessibilityLabel }) {
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      accessibilityLabel={accessibilityLabel}
      style={[styles.btn, size === "sm" && styles.btnSm, styles[`btn_${variant}`], off && styles.btnOff]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? colors.paper : colors.ai} />
      ) : (
        <Text style={[styles.btnText, size === "sm" && styles.btnTextSm, styles[`btnText_${variant}`]]}>{children}</Text>
      )}
    </Pressable>
  );
}

export function StatTile({ label, value, hint }) {
  return (
    <View style={styles.stat}>
      <Text style={text.small}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {hint ? <Text style={[text.small, { marginTop: 2 }]}>{hint}</Text> : null}
    </View>
  );
}

/** A row of mutually exclusive options (web: Segmented). */
export function Segmented({ label, value, onChange, options }) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist" accessibilityLabel={label}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="tab" accessibilityState={{ selected }} style={[styles.segment, selected && styles.segmentOn]}>
            <Text style={[styles.segmentText, selected && styles.segmentTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  levelTag: { flexDirection: "row", alignItems: "center", gap: 6 },
  levelMark: { width: 4, height: 12, borderRadius: 2 },
  levelText: { fontSize: 14, fontWeight: "600", color: colors.ink },
  badge: { alignSelf: "flex-start", paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: "600" },
  panel: { backgroundColor: colors.paper, borderRadius: 10, borderWidth: 1, borderColor: colors.line, padding: spacing.md },
  sectionTitle: { ...text.h2, fontSize: 17, marginBottom: spacing.sm },
  btn: { minHeight: 44, paddingHorizontal: spacing.lg, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  btnSm: { minHeight: 40, paddingHorizontal: spacing.md },
  btn_primary: { backgroundColor: colors.ai, borderColor: colors.ai },
  btn_secondary: { backgroundColor: colors.paper, borderColor: colors.line },
  btn_ghost: { backgroundColor: "transparent", borderColor: "transparent" },
  btnOff: { opacity: 0.55 },
  btnText: { fontSize: 15, fontWeight: "600" },
  btnTextSm: { fontSize: 14 },
  btnText_primary: { color: colors.paper },
  btnText_secondary: { color: colors.ink },
  btnText_ghost: { color: colors.ai },
  stat: { flex: 1, backgroundColor: colors.paper, borderRadius: 10, borderWidth: 1, borderColor: colors.line, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  statValue: { fontSize: 20, fontWeight: "600", color: colors.ink, marginTop: 2 },
  segmented: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  segment: { minHeight: 40, paddingHorizontal: spacing.md, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper, justifyContent: "center" },
  segmentOn: { backgroundColor: colors.ai, borderColor: colors.ai },
  segmentText: { fontSize: 14, fontWeight: "600", color: colors.ink2 },
  segmentTextOn: { color: colors.paper },
});
