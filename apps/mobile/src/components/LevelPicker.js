// Mirror of LevelPicker / LEVEL_INFO in apps/web/src/roles/student/ChooseLevelPage.tsx.
import { View, Text, Pressable, StyleSheet } from "react-native";
import { JLPT_LEVELS, LEVEL_ACCENTS } from "../shared/constants";
import { colors, spacing, text } from "../styles/theme";

export const LEVEL_INFO = {
  N5: { name: "Beginner", description: "Hiragana, katakana, about 100 kanji, and everyday phrases." },
  N4: { name: "Elementary", description: "Basic grammar and about 300 kanji for daily conversation." },
  N3: { name: "Intermediate", description: "Everyday Japanese at natural speed, about 650 kanji." },
  N2: { name: "Upper intermediate", description: "Newspapers, work conversations, about 1,000 kanji." },
  N1: { name: "Advanced", description: "Complex texts and nuanced speech, about 2,000 kanji." },
};

/** FR-3.6.2: the student chooses a study level for Self-Study. */
export function LevelPicker({ value, onChange, disabled }) {
  return (
    <View accessibilityRole="radiogroup">
      {JLPT_LEVELS.map((l) => {
        const selected = value === l;
        return (
          <Pressable
            key={l}
            onPress={() => onChange(l)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            style={[styles.card, { borderLeftColor: LEVEL_ACCENTS[l] }, selected && styles.cardActive]}
          >
            <View style={styles.radioOuter}>{selected ? <View style={styles.radioInner} /> : null}</View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{l} {LEVEL_INFO[l].name}</Text>
              <Text style={text.small}>{LEVEL_INFO[l].description}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "flex-start", backgroundColor: colors.paper, borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.line, borderLeftWidth: 4, minHeight: 44 },
  cardActive: { borderColor: colors.ai, borderWidth: 2, borderLeftWidth: 4 },
  cardTitle: { ...text.body, fontWeight: "600", marginBottom: spacing.xs },
  radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.line, marginRight: spacing.md, marginTop: 2, alignItems: "center", justifyContent: "center" },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.ai },
});
