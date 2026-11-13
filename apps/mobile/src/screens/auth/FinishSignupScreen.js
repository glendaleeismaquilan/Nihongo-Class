// For a Firebase account whose profile wasn't created (sign-up interrupted, or a
// first Google sign-in). Mirrors FinishSignupPage in apps/web/src/pages/auth/SignupPage.tsx.
import { useState } from "react";
import { View, Text, TextInput, Pressable, Switch, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { auth } from "../../config/firebase";
import { useAuth } from "../../context/AuthContext";
import { ApiError } from "../../lib/api";
import { viewerTimeZone } from "../../lib/format";
import { PrivacyNotice } from "../../components/PrivacyNotice";
import { colors, spacing, text } from "../../styles/theme";

export function FinishSignupScreen() {
  const { firebaseUser, registerProfile, signOut } = useAuth();
  const [name, setName] = useState(firebaseUser?.displayName ?? "");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim() || !consent) {
      setError(!name.trim() ? "Enter your name." : "Accept the privacy notice to continue.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await registerProfile(async () => auth.currentUser.uid, { name: name.trim(), privacyConsent: true, timeZone: viewerTimeZone() });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't finish sign-up. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Finish creating your account</Text>
        {error ? <View style={styles.alert}><Text style={styles.alertText}>{error}</Text></View> : null}
        <Text style={styles.label}>Your name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} editable={!busy} accessibilityLabel="Your name" autoComplete="name" />
        <PrivacyNotice />
        <View style={styles.consentRow}>
          <Switch value={consent} onValueChange={setConsent} disabled={busy} trackColor={{ true: colors.ai }} accessibilityLabel="I have read the privacy notice and agree to it." />
          <Text style={[text.body, { flex: 1, marginLeft: spacing.sm }]}>I have read the privacy notice and agree to it.</Text>
        </View>
        <Pressable style={[styles.button, busy && styles.buttonBusy]} onPress={submit} disabled={busy} accessibilityRole="button">
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Continue</Text>}
        </Pressable>
        <Pressable style={styles.ghost} onPress={() => void signOut()} disabled={busy} accessibilityRole="button">
          <Text style={styles.ghostText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.kasumi },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { ...text.h1, color: colors.ai, textAlign: "center", marginTop: spacing.lg, marginBottom: spacing.md },
  label: { ...text.small, color: colors.ink, marginTop: spacing.md, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: spacing.md, backgroundColor: colors.paper, fontSize: 16 },
  consentRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.md },
  button: { marginTop: spacing.lg, backgroundColor: colors.ai, paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  buttonBusy: { opacity: 0.6 },
  buttonText: { ...text.button },
  ghost: { marginTop: spacing.sm, minHeight: 44, alignItems: "center", justifyContent: "center" },
  ghostText: { color: colors.ai, fontWeight: "600" },
  alert: { backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca", borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm },
  alertText: { color: colors.shu },
});
