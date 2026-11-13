// Small building blocks for the School Admin screens, mirroring the web app's
// StatTile / LevelTag / Badge / SectionTitle / ProgressBar (apps/web/src/components/ui).
import { View, Text, Pressable, StyleSheet } from "react-native";
import { LEVEL_ACCENTS } from "../../shared/constants";
import { colors, spacing, text } from "../../styles/theme";

export function PageHeader({ title, description, action }) {
  return (
    <View style={styles.pageHeader}>
      <View style={{ flex: 1 }}>
        <Text style={styles.pageTitle}>{title}</Text>
        {description ? <Text style={styles.pageDesc}>{description}</Text> : null}
      </View>
      {action ?? null}
    </View>
  );
}

export function StatTile({ label, value, hint, onHintPress }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileValue}>{String(value)}</Text>
      {hint ? (
        onHintPress ? (
          <Pressable onPress={onHintPress} accessibilityRole="link" hitSlop={6}>
            <Text style={[styles.tileHint, styles.tileLink]}>{hint}</Text>
          </Pressable>
        ) : (
          <Text style={styles.tileHint}>{hint}</Text>
        )
      ) : null}
    </View>
  );
}

export function TileGrid({ children }) {
  return <View style={styles.grid}>{children}</View>;
}

export function LevelTag({ level }) {
  return (
    <View style={[styles.level, { borderColor: LEVEL_ACCENTS[level] ?? colors.line }]}>
      <View style={[styles.levelDot, { backgroundColor: LEVEL_ACCENTS[level] ?? colors.line }]} />
      <Text style={styles.levelText}>{level}</Text>
    </View>
  );
}

const BADGE = {
  neutral: { bg: colors.kasumi, fg: colors.ink2 },
  success: { bg: "#dcfce7", fg: colors.matcha },
  danger: { bg: "#fee2e2", fg: colors.shu },
  info: { bg: "#e0e7ff", fg: colors.ai },
};

export function Badge({ tone = "neutral", children }) {
  return (
    <View style={[styles.badge, { backgroundColor: BADGE[tone].bg }]}>
      <Text style={[styles.badgeText, { color: BADGE[tone].fg }]}>{children}</Text>
    </View>
  );
}

export function SectionTitle({ children, action }) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.section}>{children}</Text>
      {action ?? null}
    </View>
  );
}

export function ProgressBar({ value, label }) {
  const pct = Math.max(0, Math.min(1, value || 0));
  return (
    <View accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}>
      {label ? <Text style={[text.small, { marginBottom: spacing.xs }]}>{label}</Text> : null}
      <View style={styles.bar}><View style={[styles.barFill, { width: `${pct * 100}%` }]} /></View>
    </View>
  );
}

export function LinkText({ children, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" hitSlop={8} style={{ minHeight: 32, justifyContent: "center" }}>
      <Text style={styles.link}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pageHeader: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, marginBottom: spacing.md },
  pageTitle: { ...text.h1, color: colors.ai },
  pageDesc: { ...text.small, marginTop: spacing.xs },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  tile: { flexGrow: 1, flexBasis: "45%", backgroundColor: colors.paper, borderRadius: 10, padding: spacing.md, borderWidth: 1, borderColor: colors.line },
  tileLabel: { ...text.small },
  tileValue: { fontSize: 24, fontWeight: "600", color: colors.ink, marginTop: 2 },
  tileHint: { fontSize: 13, color: colors.ink2, marginTop: 2 },
  tileLink: { color: colors.ai, textDecorationLine: "underline" },
  level: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  levelDot: { width: 6, height: 6, borderRadius: 3 },
  levelText: { fontSize: 12, fontWeight: "600", color: colors.ink },
  badge: { alignSelf: "flex-start", paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: "600" },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md, marginBottom: spacing.sm },
  section: { ...text.h2, fontSize: 18 },
  bar: { height: 8, backgroundColor: colors.line, borderRadius: 4, overflow: "hidden" },
  barFill: { height: 8, backgroundColor: colors.ai },
  link: { color: colors.ai, fontWeight: "600" },
});
