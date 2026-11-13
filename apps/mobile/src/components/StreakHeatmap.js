// Mobile extra on Progress (type "All"): a 5×7 grid of the last 35 days, oldest
// column on the left. A square is filled when the student has at least one
// graded attempt that day (device time zone). The caller only renders it when
// the attempts it passes reach back past heatmapStart(), so an empty square
// always means "no attempt that day", never "not loaded".
import { View, Text, StyleSheet } from "react-native";
import { colors, spacing, text } from "../styles/theme";

const WEEKS = 5;
const DAYS = 7;
export const HEATMAP_DAYS = WEEKS * DAYS;

/** Local midnight of the oldest day in the grid. */
export function heatmapStart(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (HEATMAP_DAYS - 1));
  return d;
}

function dayKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

export function StreakHeatmap({ attempts }) {
  const studyDays = new Set((attempts ?? []).map((a) => dayKey(new Date(a.submittedAt))));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = heatmapStart(today);
  const cells = [];
  for (let w = 0; w < WEEKS; w++) {
    const col = [];
    for (let d = 0; d < DAYS; d++) {
      const date = new Date(start);
      date.setDate(start.getDate() + w * DAYS + d);
      col.push({ date, studied: studyDays.has(dayKey(date)) });
    }
    cells.push(col);
  }
  const studied = cells.flat().filter((c) => c.studied).length;

  return (
    <View style={styles.wrap} accessible accessibilityLabel={`Study activity: you studied on ${studied} of the last ${HEATMAP_DAYS} days.`}>
      <View style={styles.head}>
        <Text style={styles.label}>Study activity</Text>
        <Text style={text.small}>last {HEATMAP_DAYS} days</Text>
      </View>
      <View style={styles.grid}>
        {cells.map((col, wi) => (
          <View key={wi} style={styles.col}>
            {col.map((cell, di) => (
              <View key={di} style={[styles.cell, cell.studied ? styles.cellOn : styles.cellOff, cell.date.getTime() === today.getTime() && styles.cellToday]} />
            ))}
          </View>
        ))}
      </View>
      <View style={styles.legendRow}>
        <View style={[styles.cell, styles.cellOff]} />
        <Text style={styles.legendText}>No attempt</Text>
        <View style={[styles.cell, styles.cellOn, { marginLeft: spacing.sm }]} />
        <Text style={styles.legendText}>Studied</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.paper, borderRadius: 10, borderWidth: 1, borderColor: colors.line, padding: spacing.md, marginBottom: spacing.md },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xs },
  label: { ...text.small, color: colors.ink2, fontWeight: "700", textTransform: "uppercase" },
  grid: { flexDirection: "row", gap: 4 },
  col: { gap: 4 },
  cell: { width: 14, height: 14, borderRadius: 3 },
  cellOff: { backgroundColor: colors.kasumi, borderWidth: 1, borderColor: colors.line },
  cellOn: { backgroundColor: colors.matcha },
  cellToday: { borderWidth: 2, borderColor: colors.ai },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: spacing.sm },
  legendText: { ...text.small, color: colors.ink2 },
});
