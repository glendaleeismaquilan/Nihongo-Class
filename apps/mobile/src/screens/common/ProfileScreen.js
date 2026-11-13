// View and edit the signed-in user's name, time zone, and (students) study level.
// Mirrors apps/web/src/pages/common/ProfilePage.tsx; teachers and School Admins
// also get the Google Calendar connection (web: /t/settings and /a/settings),
// and School Admins the school settings.
import { useState, useEffect } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../config/firebase";
import { useAuth } from "../../context/AuthContext";
import { api, ApiError } from "../../lib/api";
import { viewerTimeZone } from "../../lib/format";
import { JLPT_LEVELS } from "../../shared/constants";
import { useToast } from "../../components/Toast";
import { colors, spacing, text } from "../../styles/theme";

// Same labels as ROLE_LABEL in apps/web/src/lib/auth.tsx.
const ROLE_LABEL = { student: "Student", teacher: "Teacher", content_admin: "Content admin", school_admin: "School admin" };
const COMMON_TZS = ["Asia/Manila", "Asia/Tokyo", "Asia/Singapore", "Asia/Seoul", "Asia/Hong_Kong", "America/Los_Angeles", "America/New_York", "Europe/London", "Australia/Sydney", "UTC"];

export function ProfileScreen({ navigation }) {
  const { me, signOut } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(me?.name ?? "");
  const [timeZone, setTimeZone] = useState(me?.timeZone ?? "");
  const [studyLevel, setStudyLevel] = useState(me?.studyLevel ?? null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(me?.name ?? "");
    setTimeZone(me?.timeZone ?? "");
    setStudyLevel(me?.studyLevel ?? null);
  }, [me?.name, me?.timeZone, me?.studyLevel]);

  if (!me) return null;

  async function save() {
    setBusy(true);
    setErrors({});
    try {
      await api("/me", { method: "PATCH", body: { name, timeZone, ...(me.role === "student" && studyLevel ? { studyLevel } : {}) } });
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Saved");
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      toast.error(err instanceof ApiError ? err.message : "Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function changePassword() {
    try {
      await sendPasswordResetEmail(auth, me.email);
      toast.info("We sent you a link to change your password.");
    } catch {
      toast.error("Couldn't send the link. Try again.");
    }
  }

  const staff = me.role === "teacher" || me.role === "school_admin";

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.titleRow}>
          <Text style={styles.title}>Profile</Text>
          {me.plan?.premium ? <View style={styles.premiumBadge}><Text style={styles.premiumBadgeText}>⭐ Premium</Text></View> : null}
        </View>
        <Text style={styles.sub}>{ROLE_LABEL[me.role]}{me.school ? ` at ${me.school.name}` : ""}. Signed in as {me.email}.</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Name</Text>
          <TextInput value={name} onChangeText={setName} style={[styles.input, errors.name && styles.inputError]} editable={!busy} accessibilityLabel="Name" />
          {errors.name ? <Text style={styles.err}>{errors.name}</Text> : null}

          {me.role === "student" ? (
            <>
              <Text style={[styles.label, { marginTop: spacing.md }]}>Self-study level</Text>
              <View style={styles.chipRow} accessibilityRole="radiogroup">
                {JLPT_LEVELS.map((l) => (
                  <Pressable key={l} onPress={() => setStudyLevel(l)} style={[styles.chip, studyLevel === l && styles.chipOn]} accessibilityRole="radio" accessibilityState={{ selected: studyLevel === l }}>
                    <Text style={[styles.chipText, studyLevel === l && styles.chipTextOn]}>{l}</Text>
                  </Pressable>
                ))}
              </View>
              {errors.studyLevel ? <Text style={styles.err}>{errors.studyLevel}</Text> : <Text style={styles.hint}>Self-Study shows built-in lessons for this JLPT level. Change it anytime.</Text>}
            </>
          ) : null}

          <Text style={[styles.label, { marginTop: spacing.md }]}>Time zone</Text>
          <TextInput value={timeZone} onChangeText={setTimeZone} style={[styles.input, errors.timeZone && styles.inputError]} autoCapitalize="none" autoCorrect={false} editable={!busy} accessibilityLabel="Time zone" />
          <View style={styles.chipRow}>
            {COMMON_TZS.map((t) => (
              <Pressable key={t} onPress={() => setTimeZone(t)} style={[styles.chip, timeZone === t && styles.chipOn]}>
                <Text style={[styles.chipText, timeZone === t && styles.chipTextOn]}>{t.replace(/_/g, " ")}</Text>
              </Pressable>
            ))}
          </View>
          {errors.timeZone ? (
            <Text style={styles.err}>{errors.timeZone}</Text>
          ) : (
            <Text style={styles.hint}>Your device is set to {viewerTimeZone().replace(/_/g, " ")}. Study streaks count days in this zone.</Text>
          )}

          <View style={styles.row}>
            <Pressable style={[styles.button, busy && styles.buttonBusy]} onPress={save} disabled={busy} accessibilityRole="button">
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save</Text>}
            </Pressable>
            <Pressable style={[styles.button, styles.buttonSecondary]} onPress={changePassword} accessibilityRole="button">
              <Text style={[styles.buttonText, styles.buttonTextSecondary]}>Change password</Text>
            </Pressable>
          </View>
        </View>

        {me.role === "school_admin" ? (
          <LinkCard title="School settings" body="Your school's name and time zone." onPress={() => navigation.navigate("SchoolSettings")} />
        ) : null}
        {staff ? (
          <LinkCard
            title="Google Calendar"
            body={me.google?.status === "connected" ? `Connected as ${me.google.googleEmail}` : me.google?.status === "needs_reconnect" ? "Needs reconnecting" : "Connect to create Meet links and calendar invites."}
            onPress={() => navigation.navigate("GoogleSettings")}
          />
        ) : null}
        <LinkCard title="About this app" body="Version, server, and the privacy notice." onPress={() => navigation.navigate("About")} />

        <Pressable style={[styles.button, styles.buttonDanger, { marginTop: spacing.xl }]} onPress={() => void signOut()} accessibilityRole="button">
          <Text style={styles.buttonText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function LinkCard({ title, body, onPress }) {
  return (
    <Pressable style={[styles.card, styles.linkCard]} onPress={onPress} accessibilityRole="button">
      <View style={{ flex: 1 }}>
        <Text style={{ ...text.body, fontWeight: "600" }}>{title}</Text>
        <Text style={text.small}>{body}</Text>
      </View>
      <Text style={{ fontSize: 24, color: colors.ink2 }}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.kasumi },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  title: { ...text.h1, color: colors.ai },
  sub: { ...text.bodyMuted, marginTop: spacing.xs, marginBottom: spacing.lg },
  premiumBadge: { backgroundColor: "#fef3c7", borderWidth: 1, borderColor: "#f59e0b", borderRadius: 999, paddingHorizontal: spacing.sm, paddingVertical: 2 },
  premiumBadgeText: { color: "#92400e", fontSize: 12, fontWeight: "700" },
  card: { backgroundColor: colors.paper, borderRadius: 10, padding: spacing.lg },
  linkCard: { marginTop: spacing.md, flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 56 },
  label: { ...text.small, color: colors.ink, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: spacing.md, backgroundColor: colors.paper, fontSize: 16, minHeight: 48 },
  inputError: { borderColor: colors.shu },
  err: { color: colors.shu, marginTop: spacing.xs, fontSize: 13 },
  hint: { color: colors.ink2, marginTop: spacing.xs, fontSize: 13 },
  row: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  button: { flex: 1, backgroundColor: colors.ai, paddingVertical: 12, borderRadius: 10, alignItems: "center", justifyContent: "center", minHeight: 44 },
  buttonBusy: { opacity: 0.6 },
  buttonText: { ...text.button },
  buttonSecondary: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  buttonTextSecondary: { color: colors.ink },
  buttonDanger: { backgroundColor: colors.shu, flex: 0 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.xs },
  chip: { paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.kasumi, borderWidth: 1, borderColor: colors.line, minHeight: 32, justifyContent: "center" },
  chipOn: { backgroundColor: colors.ai, borderColor: colors.ai },
  chipText: { color: colors.ink2, fontSize: 12, fontWeight: "600" },
  chipTextOn: { color: colors.paper },
});
