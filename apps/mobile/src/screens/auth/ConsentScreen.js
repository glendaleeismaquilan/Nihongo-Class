// RA 10173: the first sign-in of an account a School Admin or Content Admin
// created shows the privacy notice with a required checkbox.
// Mirrors apps/web/src/pages/auth/ConsentPage.tsx (PATCH /me {privacyConsent:true}).
import { useState } from "react";
import { View, Text, Pressable, Switch, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { api, errorMessage } from "../../lib/api";
import { PrivacyNotice } from "../../components/PrivacyNotice";
import { colors, spacing, text } from "../../styles/theme";

export function ConsentScreen() {
  const { me, signOut } = useAuth();
  const qc = useQueryClient();
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!consent) {
      setError("Accept the privacy notice to continue.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api("/me", { method: "PATCH", body: { privacyConsent: true } });
      await qc.invalidateQueries({ queryKey: ["me"] });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Welcome, {me?.name}</Text>
        <Text style={text.bodyMuted}>{me?.school ? `${me.school.name} created your account.` : "Before you continue:"} Read how we use your information.</Text>
        <PrivacyNotice />
        <View style={styles.consentRow}>
          <Switch value={consent} onValueChange={setConsent} disabled={busy} trackColor={{ true: colors.ai }} accessibilityLabel="I have read the privacy notice and agree to it." />
          <Text style={[text.body, { flex: 1, marginLeft: spacing.sm }]}>I have read the privacy notice and agree to it.</Text>
        </View>
        {error ? <Text style={styles.errText}>{error}</Text> : null}
        <Pressable style={[styles.button, busy && styles.buttonBusy]} onPress={submit} disabled={busy} accessibilityRole="button">
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Continue</Text>}
        </Pressable>
        <Pressable style={styles.ghost} onPress={() => void signOut()} disabled={busy} accessibilityRole="button">
          <Text style={styles.ghostText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.kasumi },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { ...text.h1, color: colors.ai, marginBottom: spacing.sm },
  consentRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.md },
  errText: { color: colors.shu, marginTop: spacing.xs, fontSize: 14 },
  button: { marginTop: spacing.lg, backgroundColor: colors.ai, paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  buttonBusy: { opacity: 0.6 },
  buttonText: { ...text.button },
  ghost: { marginTop: spacing.sm, minHeight: 44, alignItems: "center", justifyContent: "center" },
  ghostText: { color: colors.ai, fontWeight: "600" },
});
