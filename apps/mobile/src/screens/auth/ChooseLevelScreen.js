// New students pick their JLPT self-study level.
// Mirrors apps/web/src/roles/student/ChooseLevelPage.tsx (PATCH /me {studyLevel}).
import { useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { api, errorMessage } from "../../lib/api";
import { LevelPicker } from "../../components/LevelPicker";
import { colors, spacing, text } from "../../styles/theme";

export function ChooseLevelScreen() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const [level, setLevel] = useState(me?.studyLevel ?? null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!level) {
      setError("Choose a level to continue.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api("/me", { method: "PATCH", body: { studyLevel: level } });
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
        <Text style={styles.title}>Choose your study level</Text>
        <Text style={styles.sub}>Self-Study shows built-in flashcards, quizzes, and tests for this JLPT level. You can change it anytime.</Text>
        {error ? <View style={styles.alert}><Text style={styles.alertText}>{error}</Text></View> : null}
        <LevelPicker value={level} onChange={setLevel} disabled={busy} />
        <Pressable style={[styles.button, busy && styles.buttonBusy]} onPress={save} disabled={busy} accessibilityRole="button">
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save level</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.kasumi },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { ...text.h1, color: colors.ai, marginBottom: spacing.xs },
  sub: { ...text.bodyMuted, marginBottom: spacing.lg },
  button: { marginTop: spacing.lg, backgroundColor: colors.ai, paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  buttonBusy: { opacity: 0.6 },
  buttonText: { ...text.button },
  alert: { backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca", borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm },
  alertText: { color: colors.shu },
});
