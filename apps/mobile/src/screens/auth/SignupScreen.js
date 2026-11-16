// Student sign-up mirroring apps/web/src/pages/auth/SignupPage.tsx: validate,
// create the Firebase account, then POST /auth/register — the server creates the
// profile (always a student) exactly as it does for the web app.
import { useState } from "react";
import { View, Text, TextInput, Pressable, Switch, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../config/firebase";
import { useAuth } from "../../context/AuthContext";
import { ApiError } from "../../lib/api";
import { viewerTimeZone } from "../../lib/format";
import { googleSignInSupported, signInWithGoogle, isGoogleSignInCancel, googleSignInProblem } from "../../lib/googleSignIn";
import { GoogleButton } from "../../components/GoogleButton";
import { PasswordStrength, scorePassword } from "../../components/PasswordStrength";
import { PrivacyNotice } from "../../components/PrivacyNotice";
import { colors, spacing, text } from "../../styles/theme";

export function SignupScreen({ navigation }) {
  const { registerProfile } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit() {
    const errs = {};
    if (!name.trim()) errs.name = "Enter your name.";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) errs.email = "Enter a valid email address.";
    if (password.length < 8) errs.password = "Use at least 8 characters.";
    else if (scorePassword(password).score < 2) errs.password = "Make it stronger — mix in upper/lowercase, numbers, or symbols.";
    if (!consent) errs.consent = "Accept the privacy notice to create an account.";
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      await registerProfile(
        async () => (await createUserWithEmailAndPassword(auth, email.trim(), password)).user,
        { name: name.trim(), privacyConsent: true, timeZone: viewerTimeZone() },
      );
      // The navigator moves on to Choose Level once /me has the new profile.
    } catch (err) {
      if (err instanceof ApiError) setFormError(err.message);
      else if (err?.code === "auth/email-already-in-use") setErrors({ email: "An account with this email already exists. Sign in instead." });
      else if (err?.code === "auth/weak-password") setErrors({ password: "Choose a stronger password." });
      else if (err?.code === "auth/invalid-email") setErrors({ email: "Enter a valid email address." });
      else setFormError("Couldn't create the account. Try again.");
    } finally {
      setBusy(false);
    }
  }

  // Mirrors signUpWithGoogle in SignupPage.tsx: consent first, then Google, then the
  // student profile, named from the Google account. Registering is idempotent, so an
  // account that signed up before just signs in.
  async function signUpWithGoogle() {
    if (!consent) {
      setErrors({ consent: "Accept the privacy notice to continue with Google." });
      return;
    }
    setErrors({});
    setFormError(null);
    setBusy(true);
    try {
      await registerProfile(signInWithGoogle, (user) => ({
        name: (user.displayName ?? name).trim() || "Student",
        privacyConsent: true,
        timeZone: viewerTimeZone(),
      }));
    } catch (err) {
      if (!isGoogleSignInCancel(err)) setFormError(googleSignInProblem(err) ?? "Couldn't sign up with Google. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Create a student account</Text>
        {formError ? <View style={styles.alert}><Text style={styles.alertText}>{formError}</Text></View> : null}
        <Field label="Your name" value={name} onChangeText={setName} error={errors.name} editable={!busy} autoComplete="name" />
        <Field label="Email" value={email} onChangeText={setEmail} error={errors.email} editable={!busy} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <View style={{ marginTop: spacing.md }}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Password</Text>
            <Pressable onPress={() => setShowPassword((v) => !v)} disabled={busy} hitSlop={8} accessibilityLabel={showPassword ? "Hide password" : "Show password"}>
              <Text style={styles.linkSmall}>{showPassword ? "Hide" : "Show"}</Text>
            </Pressable>
          </View>
          <TextInput style={[styles.input, errors.password && styles.inputError]} value={password} onChangeText={setPassword} editable={!busy} secureTextEntry={!showPassword} autoComplete="new-password" />
          <PasswordStrength password={password} />
          {errors.password ? <Text style={styles.errText}>{errors.password}</Text> : <Text style={styles.hintText}>At least 8 characters.</Text>}
        </View>

        <PrivacyNotice />

        <View style={styles.consentRow}>
          <Switch value={consent} onValueChange={setConsent} disabled={busy} trackColor={{ true: colors.ai }} accessibilityLabel="I have read the privacy notice and agree to it." />
          <Text style={[text.body, { flex: 1, marginLeft: spacing.sm }]}>I have read the privacy notice and agree to it.</Text>
        </View>
        {errors.consent ? <Text style={styles.errText}>{errors.consent}</Text> : null}

        <Pressable style={[styles.button, busy && styles.buttonBusy]} onPress={submit} disabled={busy} accessibilityRole="button">
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create account</Text>}
        </Pressable>
        {googleSignInSupported ? <GoogleButton label="Sign up with Google" onPress={signUpWithGoogle} disabled={busy} /> : null}
        <Pressable style={styles.linkBtn} onPress={() => navigation.navigate("Login")} disabled={busy}>
          <Text style={styles.link}>Already have an account? Sign in</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, error, hint, ...rest }) {
  return (
    <View style={{ marginTop: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={[styles.input, error && styles.inputError]} accessibilityLabel={label} {...rest} />
      {error ? <Text style={styles.errText}>{error}</Text> : hint ? <Text style={styles.hintText}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.kasumi },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { ...text.h1, color: colors.ai, textAlign: "center", marginTop: spacing.lg, marginBottom: spacing.md },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.xs },
  label: { ...text.small, color: colors.ink, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: spacing.md, backgroundColor: colors.paper, fontSize: 16 },
  inputError: { borderColor: colors.shu },
  errText: { color: colors.shu, marginTop: spacing.xs, fontSize: 13 },
  hintText: { color: colors.ink2, marginTop: spacing.xs, fontSize: 13 },
  consentRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.md },
  button: { marginTop: spacing.lg, backgroundColor: colors.ai, paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  buttonBusy: { opacity: 0.6 },
  buttonText: { ...text.button },
  linkBtn: { marginTop: spacing.md, alignItems: "center", minHeight: 44, justifyContent: "center" },
  link: { color: colors.ai },
  linkSmall: { color: colors.ai, fontSize: 13, fontWeight: "600" },
  alert: { backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca", borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm },
  alertText: { color: colors.shu },
});
