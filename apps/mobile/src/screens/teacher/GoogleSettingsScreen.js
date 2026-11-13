// Google Calendar and Meet for teachers and School Admins — web:
// features/live/GoogleConnectionCard.tsx (FR-3.11.1): connect, see which
// account is connected, reconnect when Google stops accepting the app's
// access, disconnect.
// Google's sign-in runs in the browser and returns to the web app's settings
// page, so the app reads the result from /me when the browser closes (and
// whenever the app comes back to the front).
import { useState } from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError, errorMessage } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../components/Toast";
import { Badge, Button, Header, InlineAlert, Panel, ui } from "./ui";
import { spacing, text } from "../../styles/theme";

export function GoogleSettingsScreen({ navigation }) {
  const { me } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await api("/integrations/google/connect");
      await WebBrowser.openBrowserAsync(url);
      await qc.invalidateQueries({ queryKey: ["me"] });
    } catch (err) {
      setError(err instanceof ApiError && err.code === "google_not_configured" ? "Automatic Meet links aren't set up for this app yet. You can still schedule live classes with a pasted Meet link." : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await api("/integrations/google", { method: "DELETE" });
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast.success("Google disconnected");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    setRefreshing(true);
    try {
      await qc.invalidateQueries({ queryKey: ["me"] });
    } finally {
      setRefreshing(false);
    }
  }

  const g = me?.google;
  return (
    <SafeAreaView style={ui.root} edges={["top"]}>
      <Header title="Google Calendar and Meet" onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined} />
      <ScrollView contentContainerStyle={ui.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
        {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
        <Panel>
          {g ? (
            <>
              <View style={[ui.rowWrap, { gap: spacing.sm }]}>
                <Text style={text.body}>
                  Connected as <Text style={{ fontWeight: "600" }}>{g.googleEmail}</Text>
                </Text>
                {g.status === "connected" ? <Badge tone="success">Connected</Badge> : <Badge tone="danger">Needs reconnect</Badge>}
              </View>
              <Text style={[text.bodyMuted, { marginTop: spacing.sm }]}>
                {g.status === "needs_reconnect"
                  ? "Google stopped accepting the app's access. Reconnect so new live classes get Meet links automatically; until then, paste a link when you schedule."
                  : "Live classes you schedule create a Google Calendar event with a Meet link, and can send invites to your students."}
              </Text>
              <View style={[ui.rowWrap, { marginTop: spacing.lg, gap: spacing.sm }]}>
                {g.status === "needs_reconnect" ? <Button onPress={connect} loading={busy}>Reconnect Google</Button> : null}
                <Button variant="secondary" onPress={disconnect} disabled={busy}>Disconnect</Button>
              </View>
            </>
          ) : (
            <>
              <Text style={text.bodyMuted}>
                Connect your Google account to create Meet links and calendar invites automatically. Without it, you paste a Meet link when you schedule.
              </Text>
              <Button style={{ marginTop: spacing.lg, alignSelf: "flex-start" }} onPress={connect} loading={busy}>Connect Google</Button>
            </>
          )}
          <Text style={[text.small, { marginTop: spacing.lg }]}>Google's sign-in opens in the browser. When you're done there, close it to come back; this page shows the result.</Text>
        </Panel>
      </ScrollView>
    </SafeAreaView>
  );
}

