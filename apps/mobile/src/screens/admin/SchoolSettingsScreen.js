// School details and scheduling time zone, plus the Google connection
// (mirror of apps/web/src/roles/admin/SchoolSettingsPage.tsx with GoogleConnectionCard).
// Reads me.school like the web page; saving refreshes /me.
import { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../components/Toast";
import { ErrorState } from "../../components/QueryState";
import { PageHeader, Badge } from "./adminUi";
import { colors, spacing, text } from "../../styles/theme";

// The phone's JS engine can't list every IANA zone (web uses Intl.supportedValuesOf),
// so the field takes any zone name — the API validates it — with common picks below.
const COMMON_TZS = ["Asia/Manila", "Asia/Tokyo", "Asia/Singapore", "Asia/Seoul", "Asia/Hong_Kong", "America/Los_Angeles", "America/New_York", "Europe/London", "Australia/Sydney", "UTC"];

export function SchoolSettingsScreen({ navigation }) {
  const { me, refreshMe } = useAuth();
  const school = me?.school;
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(school?.name ?? "");
  const [timeZone, setTimeZone] = useState(school?.timeZone ?? "");
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setErrors({});
    try {
      await api(`/schools/${school.id}`, { method: "PATCH", body: { name, timeZone } });
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Saved");
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      toast.error(err instanceof ApiError ? err.message : "Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const g = me?.google;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} accessibilityRole="button" style={{ minHeight: 32 }}>
          <Text style={styles.back}>‹ Profile</Text>
        </Pressable>
        <PageHeader title="Settings" description="School details and scheduling time zone." />

        {!school ? (
          <ErrorState error={new Error("Your account isn't linked to a school.")} retry={refreshMe} />
        ) : (
          <>
            <Pressable style={styles.panel} onPress={() => navigation.navigate("GoogleSettings")} accessibilityRole="button" accessibilityLabel="Google Calendar and Meet">
              <Text style={styles.panelTitle}>Google Calendar and Meet</Text>
              {g ? (
                <>
                  <View style={styles.googleRow}>
                    <Text style={text.body}>Connected as <Text style={{ fontWeight: "600" }}>{g.googleEmail}</Text></Text>
                    {g.status === "connected" ? <Badge tone="success">Connected</Badge> : <Badge tone="danger">Needs reconnect</Badge>}
                  </View>
                  <Text style={[text.small, { marginTop: spacing.xs }]}>
                    {g.status === "needs_reconnect"
                      ? "Google stopped accepting the app's access. Reconnect so new live classes get Meet links automatically; until then, paste a link when you schedule."
                      : "Live classes you schedule create a Google Calendar event with a Meet link, and can send invites to your students."}
                  </Text>
                </>
              ) : (
                <Text style={text.small}>Connect your Google account to create Meet links and calendar invites automatically. Without it, you paste a Meet link when you schedule.</Text>
              )}
              <Text style={styles.manage}>{g ? (g.status === "needs_reconnect" ? "Reconnect or disconnect ›" : "Manage ›") : "Connect Google ›"}</Text>
            </Pressable>

            <View style={styles.panel}>
              <Text style={styles.panelTitle}>School</Text>
              <Text style={styles.label}>School name</Text>
              <TextInput style={[styles.input, errors.name && styles.inputError]} value={name} onChangeText={setName} editable={!busy} accessibilityLabel="School name" />
              {errors.name ? <Text style={styles.err}>{errors.name}</Text> : null}

              <Text style={styles.label}>Time zone</Text>
              <TextInput
                style={[styles.input, errors.timeZone && styles.inputError]}
                value={timeZone}
                onChangeText={setTimeZone}
                editable={!busy}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Time zone"
              />
              {errors.timeZone ? (
                <Text style={styles.err}>{errors.timeZone}</Text>
              ) : (
                <Text style={styles.hint}>Live classes are scheduled in this time zone. Students see times in their own zone.</Text>
              )}
              <View style={styles.chips}>
                {COMMON_TZS.map((tz) => (
                  <Pressable key={tz} onPress={() => setTimeZone(tz)} style={[styles.chip, timeZone === tz && styles.chipOn]} accessibilityRole="button" accessibilityState={{ selected: timeZone === tz }}>
                    <Text style={[styles.chipText, timeZone === tz && styles.chipTextOn]}>{tz}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <Pressable style={[styles.save, busy && styles.busy]} onPress={save} disabled={busy} accessibilityRole="button">
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save settings</Text>}
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.kasumi },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  back: { color: colors.ai, fontSize: 15 },
  panel: { backgroundColor: colors.paper, borderRadius: 12, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.line },
  panelTitle: { ...text.h2, fontSize: 18, marginBottom: spacing.sm },
  googleRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  manage: { color: colors.ai, fontWeight: "600", marginTop: spacing.sm },
  label: { ...text.small, color: colors.ink, marginTop: spacing.md, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: spacing.md, fontSize: 16, backgroundColor: colors.paper, color: colors.ink },
  inputError: { borderColor: colors.shu },
  err: { color: colors.shu, marginTop: spacing.xs, fontSize: 13 },
  hint: { ...text.small, marginTop: spacing.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.sm },
  chip: { paddingHorizontal: spacing.sm, minHeight: 36, justifyContent: "center", borderRadius: 999, backgroundColor: colors.kasumi, borderWidth: 1, borderColor: colors.line },
  chipOn: { backgroundColor: colors.ai, borderColor: colors.ai },
  chipText: { color: colors.ink2, fontSize: 12 },
  chipTextOn: { color: colors.paper, fontWeight: "600" },
  save: { backgroundColor: colors.ai, minHeight: 48, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  busy: { opacity: 0.6 },
  saveText: { ...text.button },
});
