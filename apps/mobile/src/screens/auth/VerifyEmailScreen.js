// Email-and-password accounts must verify their email before using the app (web: VerifyEmailPage).
// Google sign-ins come verified, so they never see this.
import { useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import { sendEmailVerification } from "firebase/auth";
import { auth } from "../../config/firebase";
import { useAuth } from "../../context/AuthContext";
import { colors, spacing, text } from "../../styles/theme";

export function needsEmailVerification(user) {
  return !!user && !user.emailVerified && !!user.providerData?.some((p) => p.providerId === "password");
}

export function VerifyEmailScreen() {
  const { firebaseUser, reloadUser, signOut } = useAuth();
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState(null);
  const email = firebaseUser?.email ?? "your email";

  async function check() {
    setBusy("check");
    setNote(null);
    try {
      await reloadUser();
      if (!auth.currentUser?.emailVerified) setNote({ ok: false, text: "Your email isn't verified yet. Open the link we sent, then try again." });
    } catch {
      setNote({ ok: false, text: "Couldn't check right now. Check your connection and try again." });
    } finally {
      setBusy(null);
    }
  }

  async function resend() {
    if (!auth.currentUser) return;
    setBusy("send");
    setNote(null);
    try {
      await sendEmailVerification(auth.currentUser);
      setNote({ ok: true, text: `We sent a new link to ${email}.` });
    } catch (e) {
      setNote({ ok: false, text: e?.code === "auth/too-many-requests" ? "You've asked for too many links. Wait a few minutes." : "Couldn't send the email. Try again." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>Verify your email</Text>
      {note ? (
        <View style={[styles.alert, note.ok && styles.alertOk]}>
          <Text style={{ color: note.ok ? colors.matcha : colors.shu }}>{note.text}</Text>
        </View>
      ) : null}
      <Text style={text.body}>
        We sent a verification link to <Text style={{ fontWeight: "700" }}>{email}</Text>. Open it to confirm this is your email, then come back here.
      </Text>
      <Pressable style={[styles.button, busy && styles.busy]} onPress={check} disabled={!!busy} accessibilityRole="button">
        {busy === "check" ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>I've verified my email</Text>}
      </Pressable>
      <Pressable style={[styles.secondary, busy && styles.busy]} onPress={resend} disabled={!!busy} accessibilityRole="button">
        {busy === "send" ? <ActivityIndicator color={colors.ai} /> : <Text style={styles.secondaryText}>Resend link</Text>}
      </Pressable>
      <Pressable style={styles.ghost} onPress={() => void signOut()} disabled={!!busy} accessibilityRole="button">
        <Text style={styles.ghostText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.kasumi },
  scroll: { padding: spacing.lg, paddingTop: spacing.xxl },
  title: { ...text.h1, color: colors.ai, textAlign: "center", marginBottom: spacing.md },
  alert: { backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca", borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm },
  alertOk: { backgroundColor: "#f0fdf4", borderColor: "#bbf7d0" },
  button: { marginTop: spacing.lg, backgroundColor: colors.ai, paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  buttonText: { ...text.button },
  secondary: { marginTop: spacing.sm, borderWidth: 1, borderColor: colors.ai, paddingVertical: 13, borderRadius: 10, alignItems: "center", backgroundColor: colors.paper },
  secondaryText: { color: colors.ai, fontWeight: "600", fontSize: 15 },
  busy: { opacity: 0.6 },
  ghost: { marginTop: spacing.sm, minHeight: 44, alignItems: "center", justifyContent: "center" },
  ghostText: { color: colors.ai, fontWeight: "600" },
});
