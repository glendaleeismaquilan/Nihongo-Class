// Small UI pieces for the Content Admin screens. Dialogs are in-app modals
// (not Alert.alert) so confirmations and forms also work when the app runs in a
// browser for testing.
import { View, Text, TextInput, Pressable, Modal, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { JLPT_LEVELS, LEVEL_ACCENTS } from "../../shared/constants";
import { colors, spacing, text } from "../../styles/theme";

export function Field({ label, error, hint, multiline, style, inputStyle, ...rest }) {
  return (
    <View style={[{ marginTop: spacing.md }, style]}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TextInput
        style={[s.input, multiline && s.multiline, error && s.inputError, inputStyle]}
        multiline={multiline}
        textAlignVertical={multiline ? "top" : "center"}
        accessibilityLabel={label}
        placeholderTextColor={colors.ink2}
        {...rest}
      />
      {error ? <Text style={s.err}>{error}</Text> : hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

const BTN = {
  primary: { box: { backgroundColor: colors.ai, borderColor: colors.ai }, text: { color: colors.paper } },
  secondary: { box: { backgroundColor: colors.paper, borderColor: colors.line }, text: { color: colors.ink } },
  ghost: { box: { backgroundColor: "transparent", borderColor: "transparent" }, text: { color: colors.ai } },
  danger: { box: { backgroundColor: colors.shu, borderColor: colors.shu }, text: { color: colors.paper } },
  dangerGhost: { box: { backgroundColor: "transparent", borderColor: "transparent" }, text: { color: colors.shu } },
};

export function Btn({ label, onPress, variant = "primary", loading, disabled, small, style, accessibilityLabel }) {
  const v = BTN[variant] ?? BTN.primary;
  const off = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={[s.btn, small && s.btnSmall, v.box, off && s.btnOff, style]}
    >
      {loading ? <ActivityIndicator color={v.text.color} /> : <Text style={[s.btnText, small && s.btnTextSmall, v.text]}>{label}</Text>}
    </Pressable>
  );
}

/** N5–N1 switcher; the selected level is underlined in its accent (§13). */
export function LevelSwitcher({ value, onChange, label = "JLPT level" }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={s.levels}>
      {JLPT_LEVELS.map((l) => {
        const on = value === l;
        return (
          <Pressable
            key={l}
            onPress={() => onChange(l)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={[s.level, on && { borderBottomColor: LEVEL_ACCENTS[l] }]}
          >
            <Text style={[s.levelText, on && s.levelTextOn]}>{l}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Segmented({ value, onChange, options, label }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={s.seg}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={[s.segItem, on && s.segOn]}>
            <Text style={[s.segText, on && s.segTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const BADGE = {
  success: { bg: "#dcfce7", fg: colors.matcha },
  danger: { bg: "#fee2e2", fg: colors.shu },
  info: { bg: "#e0e7ff", fg: colors.ai },
  neutral: { bg: colors.kasumi, fg: colors.ink2 },
};

export function Badge({ tone = "neutral", children }) {
  const t = BADGE[tone] ?? BADGE.neutral;
  return (
    <View style={[s.badge, { backgroundColor: t.bg }]}>
      <Text style={[s.badgeText, { color: t.fg }]}>{children}</Text>
    </View>
  );
}

export function LevelTag({ level }) {
  return (
    <View style={[s.levelTag, { borderLeftColor: LEVEL_ACCENTS[level] ?? colors.line }]}>
      <Text style={s.levelTagText}>{level}</Text>
    </View>
  );
}

export function Notice({ tone = "danger", title, children }) {
  const t = BADGE[tone] ?? BADGE.danger;
  return (
    <View style={[s.notice, { borderColor: t.fg }]} accessibilityRole={tone === "danger" ? "alert" : undefined}>
      {title ? <Text style={[s.noticeTitle, { color: t.fg }]}>{title}</Text> : null}
      {typeof children === "string" ? <Text style={{ color: tone === "danger" ? colors.shu : colors.ink }}>{children}</Text> : children}
    </View>
  );
}

/** A modal dialog with a title, body, and footer buttons (web: components/ui Dialog). */
export function Dialog({ open, title, onClose, children, footer }) {
  return (
    <Modal visible={!!open} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.backdrop} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={s.dialog} accessibilityViewIsModal>
          <Text style={s.dialogTitle} accessibilityRole="header">{title}</Text>
          <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
          {footer ? <View style={s.dialogFooter}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function Header({ title, onBack, backLabel = "Back", right }) {
  return (
    <View style={s.header}>
      {onBack ? (
        <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" style={{ minHeight: 32, justifyContent: "center" }}>
          <Text style={s.back}>‹ {backLabel}</Text>
        </Pressable>
      ) : null}
      <View style={s.headerRow}>
        <Text style={s.headerTitle} accessibilityRole="header">{title}</Text>
        {right}
      </View>
    </View>
  );
}

export const s = StyleSheet.create({
  label: { ...text.small, color: colors.ink, fontWeight: "600", marginBottom: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: 10, backgroundColor: colors.paper, fontSize: 16, color: colors.ink, minHeight: 44 },
  multiline: { minHeight: 88 },
  inputError: { borderColor: colors.shu },
  err: { color: colors.shu, marginTop: spacing.xs, fontSize: 13 },
  hint: { color: colors.ink2, marginTop: spacing.xs, fontSize: 13 },
  btn: { minHeight: 44, borderRadius: 10, borderWidth: 1, paddingHorizontal: spacing.lg, alignItems: "center", justifyContent: "center" },
  btnSmall: { minHeight: 36, paddingHorizontal: spacing.md },
  btnOff: { opacity: 0.55 },
  btnText: { fontSize: 15, fontWeight: "600" },
  btnTextSmall: { fontSize: 13 },
  levels: { flexDirection: "row", gap: 4, borderBottomWidth: 1, borderBottomColor: colors.line },
  level: { minHeight: 44, minWidth: 52, paddingHorizontal: spacing.md, alignItems: "center", justifyContent: "center", borderBottomWidth: 4, borderBottomColor: "transparent", marginBottom: -1 },
  levelText: { fontWeight: "700", color: colors.ink2, fontSize: 15 },
  levelTextOn: { color: colors.ink },
  seg: { flexDirection: "row", borderWidth: 1, borderColor: colors.line, borderRadius: 10, overflow: "hidden", alignSelf: "flex-start" },
  segItem: { minHeight: 40, paddingHorizontal: spacing.md, justifyContent: "center", backgroundColor: colors.paper },
  segOn: { backgroundColor: colors.ai },
  segText: { color: colors.ink2, fontWeight: "600", fontSize: 13 },
  segTextOn: { color: colors.paper },
  badge: { alignSelf: "flex-start", paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: "600" },
  levelTag: { borderLeftWidth: 4, paddingLeft: spacing.sm, alignSelf: "flex-start" },
  levelTagText: { fontWeight: "700", color: colors.ink, fontSize: 16 },
  notice: { borderWidth: 1, borderRadius: 10, padding: spacing.md, backgroundColor: colors.paper, marginTop: spacing.sm },
  noticeTitle: { fontWeight: "700", marginBottom: spacing.xs },
  backdrop: { flex: 1, backgroundColor: "rgba(17,24,39,0.45)", justifyContent: "center", padding: spacing.lg },
  dialog: { backgroundColor: colors.paper, borderRadius: 14, padding: spacing.lg, maxWidth: 560, width: "100%", alignSelf: "center" },
  dialogTitle: { ...text.h2, marginBottom: spacing.sm },
  dialogFooter: { flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.lg },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
  back: { color: colors.ai, fontSize: 15 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, marginTop: spacing.xs },
  headerTitle: { ...text.h1, color: colors.ai, flexShrink: 1 },
  panel: { backgroundColor: colors.paper, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: spacing.md, marginBottom: spacing.md },
});
