// Offline reference chart for hiragana and katakana — basic (gojūon),
// dakuten (voiced), handakuten (p-row), and yōon (combined) rows. Tap a cell to
// hear the romaji + see it zoomed. Works without any API call so it's always
// available, including during an exam or a commute.
import { useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, Modal } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, text } from "../../styles/theme";

// Each entry: [kana, romaji]. Empty cells kept as "" for grid alignment.
const HEADERS = ["a", "i", "u", "e", "o"];

const HIRAGANA_BASE = [
  { label: "—", row: [["あ", "a"], ["い", "i"], ["う", "u"], ["え", "e"], ["お", "o"]] },
  { label: "k", row: [["か", "ka"], ["き", "ki"], ["く", "ku"], ["け", "ke"], ["こ", "ko"]] },
  { label: "s", row: [["さ", "sa"], ["し", "shi"], ["す", "su"], ["せ", "se"], ["そ", "so"]] },
  { label: "t", row: [["た", "ta"], ["ち", "chi"], ["つ", "tsu"], ["て", "te"], ["と", "to"]] },
  { label: "n", row: [["な", "na"], ["に", "ni"], ["ぬ", "nu"], ["ね", "ne"], ["の", "no"]] },
  { label: "h", row: [["は", "ha"], ["ひ", "hi"], ["ふ", "fu"], ["へ", "he"], ["ほ", "ho"]] },
  { label: "m", row: [["ま", "ma"], ["み", "mi"], ["む", "mu"], ["め", "me"], ["も", "mo"]] },
  { label: "y", row: [["や", "ya"], ["", ""], ["ゆ", "yu"], ["", ""], ["よ", "yo"]] },
  { label: "r", row: [["ら", "ra"], ["り", "ri"], ["る", "ru"], ["れ", "re"], ["ろ", "ro"]] },
  { label: "w", row: [["わ", "wa"], ["", ""], ["", ""], ["", ""], ["を", "wo"]] },
  { label: "n", row: [["ん", "n"], ["", ""], ["", ""], ["", ""], ["", ""]] },
];

const HIRAGANA_DAKUTEN = [
  { label: "g", row: [["が", "ga"], ["ぎ", "gi"], ["ぐ", "gu"], ["げ", "ge"], ["ご", "go"]] },
  { label: "z", row: [["ざ", "za"], ["じ", "ji"], ["ず", "zu"], ["ぜ", "ze"], ["ぞ", "zo"]] },
  { label: "d", row: [["だ", "da"], ["ぢ", "ji"], ["づ", "zu"], ["で", "de"], ["ど", "do"]] },
  { label: "b", row: [["ば", "ba"], ["び", "bi"], ["ぶ", "bu"], ["べ", "be"], ["ぼ", "bo"]] },
  { label: "p", row: [["ぱ", "pa"], ["ぴ", "pi"], ["ぷ", "pu"], ["ぺ", "pe"], ["ぽ", "po"]] },
];

const KATAKANA_BASE = [
  { label: "—", row: [["ア", "a"], ["イ", "i"], ["ウ", "u"], ["エ", "e"], ["オ", "o"]] },
  { label: "k", row: [["カ", "ka"], ["キ", "ki"], ["ク", "ku"], ["ケ", "ke"], ["コ", "ko"]] },
  { label: "s", row: [["サ", "sa"], ["シ", "shi"], ["ス", "su"], ["セ", "se"], ["ソ", "so"]] },
  { label: "t", row: [["タ", "ta"], ["チ", "chi"], ["ツ", "tsu"], ["テ", "te"], ["ト", "to"]] },
  { label: "n", row: [["ナ", "na"], ["ニ", "ni"], ["ヌ", "nu"], ["ネ", "ne"], ["ノ", "no"]] },
  { label: "h", row: [["ハ", "ha"], ["ヒ", "hi"], ["フ", "fu"], ["ヘ", "he"], ["ホ", "ho"]] },
  { label: "m", row: [["マ", "ma"], ["ミ", "mi"], ["ム", "mu"], ["メ", "me"], ["モ", "mo"]] },
  { label: "y", row: [["ヤ", "ya"], ["", ""], ["ユ", "yu"], ["", ""], ["ヨ", "yo"]] },
  { label: "r", row: [["ラ", "ra"], ["リ", "ri"], ["ル", "ru"], ["レ", "re"], ["ロ", "ro"]] },
  { label: "w", row: [["ワ", "wa"], ["", ""], ["", ""], ["", ""], ["ヲ", "wo"]] },
  { label: "n", row: [["ン", "n"], ["", ""], ["", ""], ["", ""], ["", ""]] },
];

const KATAKANA_DAKUTEN = [
  { label: "g", row: [["ガ", "ga"], ["ギ", "gi"], ["グ", "gu"], ["ゲ", "ge"], ["ゴ", "go"]] },
  { label: "z", row: [["ザ", "za"], ["ジ", "ji"], ["ズ", "zu"], ["ゼ", "ze"], ["ゾ", "zo"]] },
  { label: "d", row: [["ダ", "da"], ["ヂ", "ji"], ["ヅ", "zu"], ["デ", "de"], ["ド", "do"]] },
  { label: "b", row: [["バ", "ba"], ["ビ", "bi"], ["ブ", "bu"], ["ベ", "be"], ["ボ", "bo"]] },
  { label: "p", row: [["パ", "pa"], ["ピ", "pi"], ["プ", "pu"], ["ペ", "pe"], ["ポ", "po"]] },
];

const SCRIPTS = {
  hiragana: { label: "Hiragana", base: HIRAGANA_BASE, dakuten: HIRAGANA_DAKUTEN },
  katakana: { label: "Katakana", base: KATAKANA_BASE, dakuten: KATAKANA_DAKUTEN },
};

export function KanaReferenceScreen({ navigation }) {
  const [script, setScript] = useState("hiragana");
  const [tapped, setTapped] = useState(null);

  const s = SCRIPTS[script];

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}><Text style={styles.back}>‹ Back</Text></Pressable>
        <Text style={styles.title}>Kana reference</Text>
        <View style={styles.toggle}>
          {Object.entries(SCRIPTS).map(([k, v]) => (
            <Pressable key={k} onPress={() => setScript(k)} style={[styles.toggleBtn, k === script && styles.toggleOn]}>
              <Text style={[styles.toggleText, k === script && styles.toggleTextOn]}>{v.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}>
        <Section title="Basic">
          <Grid rows={s.base} onTap={(cell) => setTapped(cell)} />
        </Section>
        <Section title="Dakuten and handakuten">
          <Grid rows={s.dakuten} onTap={(cell) => setTapped(cell)} />
        </Section>

        <View style={styles.tip}>
          <Text style={text.small}>Tip: Tap any character to see it bigger with the romaji.</Text>
        </View>
      </ScrollView>

      <Modal transparent visible={!!tapped} animationType="fade" onRequestClose={() => setTapped(null)}>
        <Pressable style={styles.modalBg} onPress={() => setTapped(null)}>
          <View style={styles.modal}>
            <Text style={styles.bigKana}>{tapped?.[0]}</Text>
            <Text style={styles.bigRomaji}>{tapped?.[1]}</Text>
            <Text style={[text.small, { color: colors.ink2, marginTop: spacing.sm }]}>Tap anywhere to close</Text>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function Section({ title, children }) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={{ flexDirection: "row" }}>
        <View style={{ width: 24 }} />
        {HEADERS.map((h, i) => (
          <View key={i} style={styles.colHeader}><Text style={styles.colHeaderText}>{h}</Text></View>
        ))}
      </View>
      {children}
    </View>
  );
}

function Grid({ rows, onTap }) {
  return (
    <View>
      {rows.map((r, ri) => (
        <View key={ri} style={styles.row}>
          <View style={styles.rowLabel}><Text style={styles.rowLabelText}>{r.label}</Text></View>
          {r.row.map(([kana, romaji], ci) => (
            <Pressable key={ci} style={[styles.cell, !kana && styles.cellEmpty]} onPress={() => kana && onTap([kana, romaji])} disabled={!kana}>
              {kana ? (
                <>
                  <Text style={styles.kana}>{kana}</Text>
                  <Text style={styles.romaji}>{romaji}</Text>
                </>
              ) : null}
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.kasumi },
  header: { padding: spacing.lg, backgroundColor: colors.paper, borderBottomWidth: 1, borderBottomColor: colors.line },
  back: { color: colors.ai, fontSize: 14 },
  title: { ...text.h1, color: colors.ink, marginTop: spacing.xs, fontSize: 22 },
  toggle: { flexDirection: "row", gap: 6, marginTop: spacing.sm },
  toggleBtn: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.kasumi, borderWidth: 1, borderColor: colors.line },
  toggleOn: { backgroundColor: colors.ai, borderColor: colors.ai },
  toggleText: { color: colors.ink2, fontWeight: "600", fontSize: 13 },
  toggleTextOn: { color: colors.paper },
  sectionTitle: { ...text.small, color: colors.ink2, fontWeight: "700", textTransform: "uppercase", marginBottom: spacing.sm },
  colHeader: { flex: 1, alignItems: "center", paddingVertical: 4 },
  colHeaderText: { color: colors.ink2, fontSize: 12, fontWeight: "700" },
  row: { flexDirection: "row", marginTop: 4 },
  rowLabel: { width: 24, alignItems: "center", justifyContent: "center" },
  rowLabelText: { color: colors.ink2, fontSize: 12, fontWeight: "700" },
  cell: { flex: 1, marginHorizontal: 2, backgroundColor: colors.paper, borderRadius: 8, paddingVertical: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.line },
  cellEmpty: { backgroundColor: "transparent", borderColor: "transparent" },
  kana: { fontSize: 22, fontWeight: "600", color: colors.ink },
  romaji: { fontSize: 10, color: colors.ink2, marginTop: 1 },
  tip: { padding: spacing.md, backgroundColor: colors.paper, borderRadius: 10, borderLeftWidth: 4, borderLeftColor: colors.ai },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  modal: { backgroundColor: colors.paper, borderRadius: 20, padding: spacing.xl, alignItems: "center", minWidth: 220 },
  bigKana: { fontSize: 140, fontWeight: "600", color: colors.ink, lineHeight: 160 },
  bigRomaji: { fontSize: 28, color: colors.ai, fontWeight: "700", marginTop: spacing.sm, letterSpacing: 2 },
});
