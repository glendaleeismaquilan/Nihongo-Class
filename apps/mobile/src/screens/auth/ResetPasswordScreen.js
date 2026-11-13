import { useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../config/firebase";
import { clearFailures } from "../../lib/loginLockout";
import { colors, spacing, text } from "../../styles/theme";

export function ResetPasswordScreen({ navigation }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      // Asking for a reset clears any client-side lockout on this email.
      await clearFailures(email);
    } catch (err) {
      // Same as the web page: the message is identical whether or not the account
      // exists (FR-3.1.2), but a network failure is reported, not hidden.
      if (err?.code === "auth/network-request-failed") {
        setError("Couldn't reach the sign-in service. Check your connection and try again.");
        setBusy(false);
        return;
      }
    }
    setBusy(false);
    setSent(email.trim());
  }

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.title}>Reset your password</Text>
        {sent ? (
          <>
            <View style={styles.success}>
              <Text style={styles.successText}>If an account exists for {sent}, we sent it a link to set a new password. Check your inbox.</Text>
            </View>
            <Pressable style={styles.linkBtn} onPress={() => navigation.navigate("Login")}><Text style={styles.link}>Back to sign in</Text></Pressable>
          </>
        ) : (
          <>
            <Text style={styles.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              style={[styles.input, error && styles.inputError]}
              placeholder="you@example.com"
              editable={!busy}
            />
            {error ? <Text style={styles.err}>{error}</Text> : null}
            <Pressable style={[styles.button, busy && styles.buttonBusy]} onPress={submit} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send reset link</Text>}
            </Pressable>
            <Pressable style={styles.linkBtn} onPress={() => navigation.navigate("Login")} disabled={busy}>
              <Text style={styles.link}>Back to sign in</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.kasumi, justifyContent: "center", padding: spacing.lg },
  card: { backgroundColor: colors.paper, borderRadius: 16, padding: spacing.xl },
  title: { ...text.h1, color: colors.ai, textAlign: "center", marginBottom: spacing.lg },
  label: { ...text.small, color: colors.ink, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: spacing.md, fontSize: 16 },
  inputError: { borderColor: colors.shu },
  err: { color: colors.shu, marginTop: spacing.xs, fontSize: 13 },
  button: { marginTop: spacing.lg, backgroundColor: colors.ai, paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  buttonBusy: { opacity: 0.6 },
  buttonText: { ...text.button },
  linkBtn: { marginTop: spacing.md, alignItems: "center" },
  link: { color: colors.ai },
  success: { backgroundColor: "#f0fdf4", borderWidth: 1, borderColor: "#bbf7d0", borderRadius: 10, padding: spacing.md },
  successText: { color: "#166534" },
});
