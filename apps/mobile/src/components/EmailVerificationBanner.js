// Nagging banner: when the user signed up with email/password and hasn't clicked
// the verification link yet, show this on top of dashboards with a resend button.
import { useState } from "react";
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { sendEmailVerification } from "firebase/auth";
import { useAuth } from "../context/AuthContext";
import { useToast } from "./Toast";
import { colors, spacing, text } from "../styles/theme";

export function EmailVerificationBanner() {
  const { firebaseUser } = useAuth();
  const toast = useToast();
  const [sending, setSending] = useState(false);

  if (!firebaseUser || firebaseUser.emailVerified) return null;
  // Google sign-ins carry an already-verified email, so this only hits password accounts.
  const isPassword = firebaseUser.providerData?.some((p) => p.providerId === "password");
  if (!isPassword) return null;

  async function resend() {
    setSending(true);
    try {
      await sendEmailVerification(firebaseUser);
      toast.success("Verification email sent. Check your inbox.");
    } catch (e) {
      const code = e?.code ?? "";
      if (code === "auth/too-many-requests") toast.error("You've asked for too many. Wait a few minutes.");
      else toast.error("Couldn't send the email. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={{ fontSize: 20 }}>✉️</Text>
      <View style={{ flex: 1, marginLeft: spacing.sm }}>
        <Text style={styles.title}>Verify your email</Text>
        <Text style={text.small}>We sent a verification link to {firebaseUser.email}. Click it to confirm you own this address.</Text>
      </View>
      <Pressable style={[styles.btn, sending && { opacity: 0.6 }]} onPress={resend} disabled={sending}>
        {sending ? <ActivityIndicator color={colors.ai} /> : <Text style={styles.btnText}>Resend</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", backgroundColor: "#fef3c7", borderWidth: 1, borderColor: "#fde68a", borderRadius: 10, padding: spacing.md, marginBottom: spacing.md, gap: spacing.sm },
  title: { ...text.body, fontWeight: "600", color: "#92400e" },
  btn: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.ai, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: 8 },
  btnText: { color: colors.ai, fontWeight: "600", fontSize: 13 },
});
