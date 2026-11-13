// FR-3.11.7 / FR-3.11.8 (mirror of apps/web/src/features/live/JoinButton.tsx):
// enabled from 15 minutes before the start until the end. Joining records the
// check-in (present, or late after 10 minutes), then opens Google Meet. The
// check-in goes first on a phone because opening Meet sends the app to the
// background. If it can't be recorded, the student sees why under the button
// and can still open Meet (inline, so it works on every runtime).
import { useState } from "react";
import { View, Text, Linking, StyleSheet } from "react-native";
import { api, errorMessage } from "../../lib/api";
import { formatTime } from "../../lib/format";
import { JOIN_OPENS_MINUTES_BEFORE } from "../../shared/constants";
import { useToast } from "../../components/Toast";
import { colors, spacing } from "../../styles/theme";
import { joinState, useNow } from "./hooks";
import { Button } from "./ui";

export function JoinButton({ session, size = "md" }) {
  const now = useNow(15_000);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(null);
  const state = joinState(session, now);
  if (state === "over" || state === "cancelled" || !session.meetUrl) return null;
  if (state === "early") {
    const opens = new Date(new Date(session.startAt).getTime() - JOIN_OPENS_MINUTES_BEFORE * 60_000).toISOString();
    return (
      <Button size={size} variant="secondary" disabled>
        Join opens at {formatTime(opens)}
      </Button>
    );
  }

  const openMeet = () => Linking.openURL(session.meetUrl).catch((err) => toast.error(errorMessage(err)));

  async function join() {
    setBusy(true);
    setFailed(null);
    try {
      await api(`/sessions/${session.id}/check-in`, { method: "POST" });
    } catch (err) {
      setFailed(errorMessage(err));
      return;
    } finally {
      setBusy(false);
    }
    openMeet();
  }

  return (
    <View style={styles.wrap}>
      <Button size={size} onPress={() => void join()} loading={busy}>
        Join on Google Meet
      </Button>
      {failed ? (
        <View style={styles.alert} accessibilityRole="alert">
          <Text style={styles.alertText}>Attendance not recorded. {failed} Your teacher can still mark your attendance.</Text>
          <View style={styles.alertAction}>
            <Button size="sm" variant="secondary" onPress={openMeet}>
              Open Google Meet
            </Button>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  alert: { backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca", borderRadius: 10, padding: spacing.sm },
  alertText: { color: colors.shu, fontSize: 14 },
  alertAction: { marginTop: spacing.xs, alignSelf: "flex-start" },
});
