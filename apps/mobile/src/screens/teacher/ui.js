// Small building blocks for the teacher and class-workspace screens, matching the
// web app's components/ui (Button, Badge, LevelTag, Dialog, SelectField, TextField).
// Confirmations and pickers use an in-app Modal — like the web app's dialogs —
// so they work the same on Android and in a browser.
import { useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, Modal, ScrollView, StyleSheet, Platform } from "react-native";
import { LEVEL_ACCENTS } from "../../shared/constants";
import { colors, spacing, text } from "../../styles/theme";

/** Fixed-width font for class codes (iOS has no "monospace" family). */
export const MONO = Platform.select({ ios: "Menlo", default: "monospace" });

export function Header({ title, subtitle, onBack, backLabel = "Back", right }) {
  return (
    <View style={s.header}>
      <View style={s.headerTop}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={8} accessibilityRole="button" style={s.back}>
            <Text style={s.backText}>‹ {backLabel}</Text>
          </Pressable>
        ) : <View />}
        {right ?? null}
      </View>
      {title ? <Text style={s.title} numberOfLines={3}>{title}</Text> : null}
      {subtitle ? <Text style={text.small}>{subtitle}</Text> : null}
    </View>
  );
}

const BADGE = {
  neutral: { bg: colors.kasumi, fg: colors.ink2 },
  success: { bg: "#dcfce7", fg: colors.matcha },
  danger: { bg: "#fee2e2", fg: colors.shu },
  info: { bg: "#e0e7ff", fg: colors.ai },
  warning: { bg: "#fef3c7", fg: "#92400e" },
};

export function Badge({ tone = "neutral", children }) {
  return (
    <View style={[s.badge, { backgroundColor: BADGE[tone].bg }]}>
      <Text style={[s.badgeText, { color: BADGE[tone].fg }]}>{children}</Text>
    </View>
  );
}

export function LevelTag({ level }) {
  return (
    <View style={s.levelTag}>
      <View style={[s.levelMark, { backgroundColor: LEVEL_ACCENTS[level] ?? colors.ink2 }]} />
      <Text style={s.levelText}>{level}</Text>
    </View>
  );
}

export function SectionTitle({ children, right }) {
  return (
    <View style={s.sectionRow}>
      <Text style={s.section}>{children}</Text>
      {right ?? null}
    </View>
  );
}

export function Button({ children, onPress, variant = "primary", loading, disabled, small, style, accessibilityLabel }) {
  const v = VARIANT[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={[s.btn, small && s.btnSmall, v.box, (disabled || loading) && s.btnDisabled, style]}
    >
      {loading ? <ActivityIndicator color={v.spinner} /> : <Text style={[s.btnText, small && s.btnTextSmall, v.text]}>{children}</Text>}
    </Pressable>
  );
}

const VARIANT = {
  primary: { box: { backgroundColor: colors.ai, borderColor: colors.ai }, text: { color: colors.paper }, spinner: colors.paper },
  secondary: { box: { backgroundColor: colors.paper, borderColor: colors.line }, text: { color: colors.ai }, spinner: colors.ai },
  ghost: { box: { backgroundColor: "transparent", borderColor: "transparent" }, text: { color: colors.ai }, spinner: colors.ai },
  danger: { box: { backgroundColor: colors.shu, borderColor: colors.shu }, text: { color: colors.paper }, spinner: colors.paper },
  dangerGhost: { box: { backgroundColor: "transparent", borderColor: "transparent" }, text: { color: colors.shu }, spinner: colors.shu },
  dangerSecondary: { box: { backgroundColor: colors.paper, borderColor: colors.line }, text: { color: colors.shu }, spinner: colors.shu },
};

export function Field({ label, error, hint, multiline, style, ...rest }) {
  return (
    <View style={[s.field, style]}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TextInput
        accessibilityLabel={label}
        style={[s.input, multiline && s.multiline, error && s.inputError]}
        multiline={multiline}
        placeholderTextColor="#9ca3af"
        {...rest}
      />
      {error ? <Text style={s.error}>{error}</Text> : hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

export function InlineAlert({ tone = "neutral", title, children }) {
  const t = BADGE[tone === "neutral" ? "neutral" : tone];
  return (
    <View style={[s.alert, { borderColor: tone === "neutral" ? colors.line : t.fg }]} accessibilityRole={tone === "danger" ? "alert" : undefined}>
      {title ? <Text style={[s.alertTitle, { color: tone === "neutral" ? colors.ink : t.fg }]}>{title}</Text> : null}
      {typeof children === "string" ? <Text style={{ color: tone === "neutral" ? colors.ink : t.fg }}>{children}</Text> : children}
    </View>
  );
}

export function Panel({ children, style }) {
  return <View style={[s.panel, style]}>{children}</View>;
}

/** A checkbox row (web Checkbox). */
export function Check({ label, hint, checked, onChange, disabled }) {
  return (
    <Pressable onPress={() => onChange(!checked)} disabled={disabled} accessibilityRole="checkbox" accessibilityState={{ checked, disabled }} style={s.checkRow}>
      <View style={[s.checkbox, checked && s.checkboxOn]}>{checked ? <Text style={s.checkmark}>✓</Text> : null}</View>
      <View style={{ flex: 1 }}>
        <Text style={text.body}>{label}</Text>
        {hint ? <Text style={text.small}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

/** A radio row. */
export function Radio({ label, selected, onPress, disabled }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="radio" accessibilityState={{ selected, disabled }} style={s.checkRow}>
      <View style={[s.radio, selected && s.radioOn]}>{selected ? <View style={s.radioDot} /> : null}</View>
      <Text style={[text.body, { flex: 1 }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * A select field (web SelectField): shows the chosen option and opens a list of
 * `options` ({ value, label }) in a modal.
 */
export function Picker({ label, value, options, onChange, disabled, hint, error }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <View style={s.field}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label ? `${label}: ${current?.label ?? "Choose"}` : current?.label}
        style={[s.input, s.pickerBox, disabled && s.btnDisabled, error && s.inputError]}
      >
        <Text style={[text.body, { flex: 1 }]} numberOfLines={1}>{current?.label ?? "Choose…"}</Text>
        <Text style={{ color: colors.ink2 }}>▾</Text>
      </Pressable>
      {error ? <Text style={s.error}>{error}</Text> : hint ? <Text style={s.hint}>{hint}</Text> : null}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.modalBg} onPress={() => setOpen(false)}>
          <View style={s.modal}>
            {label ? <Text style={s.modalTitle}>{label}</Text> : null}
            <ScrollView style={{ maxHeight: 420 }}>
              {options.map((o) => (
                <Pressable
                  key={String(o.value)}
                  onPress={() => { onChange(o.value); setOpen(false); }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: o.value === value }}
                  style={[s.option, o.value === value && s.optionOn]}
                >
                  <Text style={[text.body, o.value === value && { color: colors.ai, fontWeight: "600" }]}>{o.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

/** A dialog (web Dialog): title, body, and footer buttons. */
export function Dialog({ open, title, children, onClose, footer }) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.modalBg}>
        <View style={s.modal} accessibilityViewIsModal>
          {title ? <Text style={s.modalTitle}>{title}</Text> : null}
          <ScrollView style={{ maxHeight: 520 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
          {footer ? <View style={s.modalFooter}>{footer}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

/** A confirmation dialog with Cancel and a (usually destructive) confirm button. */
export function ConfirmDialog({ open, title, body, confirmLabel, cancelLabel = "Cancel", onConfirm, onCancel, busy, destructive = true }) {
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" small onPress={onCancel} disabled={busy}>{cancelLabel}</Button>
          <Button variant={destructive ? "danger" : "primary"} small onPress={onConfirm} loading={busy}>{confirmLabel}</Button>
        </>
      }
    >
      {typeof body === "string" ? <Text style={text.body}>{body}</Text> : body}
    </Dialog>
  );
}

/** A one-field dialog (web NameDialog / LessonDialog-style prompts). */
export function PromptDialog({ open, title, label, initial = "", onClose, onSave, saveLabel = "Save", validate }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  async function save() {
    const msg = validate ? validate(value) : null;
    if (msg) return setError(msg);
    setBusy(true);
    setError(null);
    try {
      await onSave(value.trim());
      onClose();
    } catch (err) {
      setError(err?.message ?? "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" small onPress={onClose} disabled={busy}>Cancel</Button>
          <Button small onPress={save} loading={busy}>{saveLabel}</Button>
        </>
      }
    >
      <Field label={label} value={value} onChangeText={setValue} error={error} autoFocus />
    </Dialog>
  );
}

export function StatTile({ label, value, hint }) {
  return (
    <View style={s.stat}>
      <Text style={text.small}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
      {hint ? <Text style={[text.small, { marginTop: 2 }]}>{hint}</Text> : null}
    </View>
  );
}

export const ui = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.kasumi },
  scroll: { padding: spacing.md, paddingBottom: spacing.xxl },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowWrap: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.xs },
  card: { backgroundColor: colors.paper, borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.line },
  cardTitle: { ...text.body, fontWeight: "600" },
  muted: { ...text.small },
});

const s = StyleSheet.create({
  header: { padding: spacing.lg, paddingTop: spacing.md, backgroundColor: colors.paper, borderBottomWidth: 1, borderBottomColor: colors.line },
  headerTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  back: { minHeight: 36, justifyContent: "center" },
  backText: { color: colors.ai, fontSize: 15 },
  title: { ...text.h1, fontSize: 22, color: colors.ink, marginTop: spacing.xs },
  badge: { alignSelf: "flex-start", paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: 999 },
  badgeText: { fontSize: 12, fontWeight: "600" },
  levelTag: { flexDirection: "row", alignItems: "center", gap: 4 },
  levelMark: { width: 4, height: 16, borderRadius: 2 },
  levelText: { fontSize: 14, fontWeight: "600", color: colors.ink },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.md, marginBottom: spacing.sm },
  section: { ...text.h2, fontSize: 17 },
  btn: { minHeight: 44, borderRadius: 10, borderWidth: 1, paddingHorizontal: spacing.lg, alignItems: "center", justifyContent: "center" },
  btnSmall: { minHeight: 40, paddingHorizontal: spacing.md, borderRadius: 8 },
  btnDisabled: { opacity: 0.5 },
  btnText: { fontSize: 16, fontWeight: "600" },
  btnTextSmall: { fontSize: 14 },
  field: { marginTop: spacing.md },
  label: { fontSize: 14, fontWeight: "500", color: colors.ink, marginBottom: spacing.xs },
  input: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 8, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 16, color: colors.ink, minHeight: 44 },
  multiline: { minHeight: 88, textAlignVertical: "top" },
  inputError: { borderColor: colors.shu },
  error: { color: colors.shu, fontSize: 13, marginTop: spacing.xs },
  hint: { color: colors.ink2, fontSize: 13, marginTop: spacing.xs },
  pickerBox: { flexDirection: "row", alignItems: "center" },
  alert: { borderWidth: 1, borderRadius: 10, padding: spacing.md, backgroundColor: colors.paper, marginVertical: spacing.sm },
  alertTitle: { fontWeight: "600", marginBottom: 2 },
  panel: { backgroundColor: colors.paper, borderRadius: 12, padding: spacing.lg, borderWidth: 1, borderColor: colors.line, marginBottom: spacing.md },
  checkRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 44, paddingVertical: spacing.xs },
  checkbox: { width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: colors.line, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper },
  checkboxOn: { backgroundColor: colors.ai, borderColor: colors.ai },
  checkmark: { color: colors.paper, fontWeight: "700" },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.line, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper },
  radioOn: { borderColor: colors.ai },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.ai },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: spacing.lg },
  modal: { backgroundColor: colors.paper, borderRadius: 12, padding: spacing.lg },
  modalTitle: { ...text.h2, fontSize: 19, marginBottom: spacing.md },
  modalFooter: { flexDirection: "row", justifyContent: "flex-end", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.lg },
  option: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: 8 },
  optionOn: { backgroundColor: colors.kasumi },
  stat: { flex: 1, minWidth: 100, backgroundColor: colors.paper, borderRadius: 10, padding: spacing.md, borderWidth: 1, borderColor: colors.line },
  statValue: { ...text.h2, fontSize: 24, marginTop: 2 },
});
