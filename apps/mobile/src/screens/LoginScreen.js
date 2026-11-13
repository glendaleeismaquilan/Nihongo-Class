import { useState, useEffect, useRef } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, Alert, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithCredential } from "firebase/auth";
import Constants from "expo-constants";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { auth } from "../config/firebase";
import { checkLockout, recordFailure, clearFailures, formatCountdown } from "../lib/loginLockout";
import { colors, spacing, text } from "../styles/theme";
import { useNavigation } from "@react-navigation/native";

const LAST_EMAIL_KEY = "login:lastEmail";

WebBrowser.maybeCompleteAuthSession();

const ERROR_MESSAGE = {
  "auth/invalid-email": "Enter a valid email address.",
  "auth/user-disabled": "This account is disabled. Contact your school.",
  "auth/too-many-requests": "Too many sign-in attempts. Wait a few minutes, or reset your password.",
  "auth/network-request-failed": "Couldn't reach the sign-in service. Check your connection and try again.",
};
const FALLBACK = "Email or password is incorrect.";

export function LoginScreen() {
  const nav = useNavigation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [lockedUntil, setLockedUntil] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [showPassword, setShowPassword] = useState(false);

  // Auto-fill the last-used email (convenience, not a session).
  useEffect(() => {
    AsyncStorage.getItem(LAST_EMAIL_KEY).then((v) => { if (v) setEmail(v); }).catch(() => {});
  }, []);

  const extra = Constants.expoConfig?.extra ?? {};
  const [, googleResponse, promptGoogle] = Google.useIdTokenAuthRequest({
    clientId: extra.googleWebClientId ?? "",
    androidClientId: extra.googleAndroidClientId,
    iosClientId: extra.googleIosClientId,
  });

  useEffect(() => {
    if (googleResponse?.type === "success") {
      const idToken = googleResponse.params?.id_token ?? googleResponse.authentication?.idToken;
      if (idToken) {
        const credential = GoogleAuthProvider.credential(idToken);
        signInWithCredential(auth, credential).catch((e) => setError(ERROR_MESSAGE[e?.code] ?? "Couldn't sign in with Google."));
      }
    } else if (googleResponse?.type === "error") {
      setError("Couldn't sign in with Google. Try again.");
    }
  }, [googleResponse]);

  // Countdown ticker when locked.
  useEffect(() => {
    if (!lockedUntil) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [lockedUntil]);
  useEffect(() => {
    if (lockedUntil && Date.now() >= lockedUntil) setLockedUntil(null);
  }, [now, lockedUntil]);

  async function checkEmail() {
    const lock = await checkLockout(email);
    if (lock) {
      setLockedUntil(lock.until);
      return true;
    }
    return false;
  }

  async function submit() {
    setError(null);
    if (await checkEmail()) return;
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      await clearFailures(email);
      AsyncStorage.setItem(LAST_EMAIL_KEY, email.trim()).catch(() => {});
    } catch (e) {
      const lock = await recordFailure(email);
      if (lock) {
        setLockedUntil(lock.until);
        setError(`Too many wrong attempts. Try again in ${formatCountdown(lock.msLeft)}.`);
      } else {
        setError(ERROR_MESSAGE[e?.code] ?? FALLBACK);
      }
    } finally {
      setBusy(false);
    }
  }

  async function doGoogle() {
    setError(null);
    if (!extra.googleWebClientId) {
      Alert.alert("Google sign-in not configured", "Ask your app admin to add googleWebClientId / googleAndroidClientId to app.json → extra.");
      return;
    }
    try { await promptGoogle(); } catch (e) { setError("Couldn't start Google sign-in."); }
  }

  const locked = lockedUntil && Date.now() < lockedUntil;
  const msLeft = lockedUntil ? Math.max(0, lockedUntil - now) : 0;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.card}>
        <Text style={styles.title}>Sign in</Text>
        <Text style={styles.sub}>Nihongo Class — Japanese learning platform</Text>

        {error ? (
          <View style={styles.alert}>
            <Text style={styles.alertText}>{error}</Text>
          </View>
        ) : null}
        {locked ? (
          <View style={[styles.alert, { backgroundColor: "#fef3c7", borderColor: "#fde68a" }]}>
            <Text style={[styles.alertText, { color: "#92400e" }]}>Account temporarily locked. Try again in {formatCountdown(msLeft)}.</Text>
          </View>
        ) : null}

        <Text style={styles.label}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          placeholder="you@example.com"
          style={styles.input}
          editable={!busy && !locked}
        />

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.md, marginBottom: spacing.xs }}>
          <Text style={[styles.label, { marginTop: 0, marginBottom: 0 }]}>Password</Text>
          <Pressable onPress={() => setShowPassword((v) => !v)} disabled={busy || locked} hitSlop={8}>
            <Text style={styles.linkSmall}>{showPassword ? "Hide" : "Show"}</Text>
          </Pressable>
        </View>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          placeholder="Your password"
          style={styles.input}
          editable={!busy && !locked}
          onSubmitEditing={submit}
        />

        <Pressable style={[styles.button, (busy || locked) && styles.buttonBusy]} onPress={submit} disabled={busy || locked}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
        </Pressable>

        <View style={styles.orRow}>
          <View style={styles.hr} />
          <Text style={styles.orText}>or</Text>
          <View style={styles.hr} />
        </View>

        <Pressable style={[styles.googleBtn, locked && styles.buttonBusy]} onPress={doGoogle} disabled={locked}>
          <Text style={styles.googleIcon}>G</Text>
          <Text style={styles.googleText}>Sign in with Google</Text>
        </Pressable>

        <View style={styles.linkRow}>
          <Pressable onPress={() => nav.navigate("ResetPassword")} disabled={busy}>
            <Text style={styles.link}>Forgot your password?</Text>
          </Pressable>
          <Pressable onPress={() => nav.navigate("Signup")} disabled={busy}>
            <Text style={styles.link}>Create an account</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.kasumi, justifyContent: "center", padding: spacing.lg },
  card: { backgroundColor: colors.paper, borderRadius: 16, padding: spacing.xl, elevation: 2 },
  title: { ...text.h1, textAlign: "center", color: colors.ai, marginBottom: spacing.xs },
  sub: { ...text.small, textAlign: "center", marginBottom: spacing.lg },
  label: { ...text.small, color: colors.ink, marginTop: spacing.md, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: spacing.md, fontSize: 16, backgroundColor: colors.paper },
  button: { marginTop: spacing.xl, backgroundColor: colors.ai, paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  buttonBusy: { opacity: 0.6 },
  buttonText: { ...text.button },
  alert: { backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca", borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm },
  alertText: { color: colors.shu },
  orRow: { flexDirection: "row", alignItems: "center", marginVertical: spacing.lg, gap: spacing.sm },
  hr: { flex: 1, height: 1, backgroundColor: colors.line },
  orText: { color: colors.ink2, fontSize: 12 },
  googleBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, paddingVertical: 12, borderRadius: 10, gap: spacing.sm },
  googleIcon: { width: 20, height: 20, textAlign: "center", lineHeight: 20, borderRadius: 10, backgroundColor: "#4285F4", color: "#fff", fontWeight: "900" },
  googleText: { color: colors.ink, fontWeight: "600", fontSize: 15 },
  linkRow: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.md },
  link: { color: colors.ai, fontSize: 14 },
  linkSmall: { color: colors.ai, fontSize: 13, fontWeight: "600" },
});
