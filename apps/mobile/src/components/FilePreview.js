// In-app preview for PDFs and images (class materials, My Drive), so Preview no
// longer leaves the app for the browser. A full-screen viewer draws the file in a
// WebView: images directly, PDFs page by page with pdf.js, with pinch-to-zoom.
//
// The viewer page runs on the API's own origin (WebView baseUrl), so it can fetch
// the short-lived ticket URL without CORS, and it sends ngrok's skip header so the
// tunnel answers with the file instead of its browser warning page.
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing } from "../styles/theme";
import { originOf, viewerHtml } from "./filePreviewHtml";

let showListener = null;

/** True once the viewer is mounted (App.js); callers fall back to the browser otherwise. */
export const filePreviewAvailable = () => !!showListener;

/** Opens the viewer: `{ url, mimeType, name }` with a fresh inline ticket URL. */
export function showFilePreview(file) {
  showListener?.(file);
}

/** Mounted once in App.js; shows the viewer when showFilePreview() is called. */
export function FilePreviewHost() {
  const [file, setFile] = useState(null);
  const [state, setState] = useState("loading");
  const [error, setError] = useState(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    showListener = (f) => {
      setError(null);
      setState("loading");
      setFile(f);
    };
    return () => {
      showListener = null;
    };
  }, []);

  if (!file) return null;
  const close = () => setFile(null);

  return (
    <Modal visible animationType="slide" onRequestClose={close}>
      <View style={[styles.wrap, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.bar}>
          <Pressable onPress={close} style={styles.close} accessibilityRole="button" accessibilityLabel="Close preview" hitSlop={8}>
            <Text style={styles.closeText}>✕</Text>
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>
            {file.name || "Preview"}
          </Text>
          {state === "loading" && !error ? <ActivityIndicator color="#fff" /> : null}
        </View>
        <WebView
          source={{ html: viewerHtml(file), baseUrl: originOf(file.url) }}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled
          mixedContentMode="compatibility"
          setSupportMultipleWindows={false}
          setBuiltInZoomControls
          setDisplayZoomControls={false}
          style={styles.web}
          onMessage={(e) => {
            try {
              const m = JSON.parse(e.nativeEvent.data);
              if (m.type === "ready") setState("ready");
              if (m.type === "error") setError(m.message || "error");
            } catch {
              // not ours
            }
          }}
          onError={(e) => setError(e.nativeEvent?.description || "error")}
        />
        {error ? (
          <View style={styles.errorBar}>
            <Text style={styles.errorText}>Couldn't show this file here.</Text>
            <Pressable onPress={() => Linking.openURL(file.url).catch(() => undefined)} accessibilityRole="button">
              <Text style={styles.link}>Open in browser</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#2b2f36" },
  bar: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.ai },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  closeText: { color: "#fff", fontSize: 22, fontWeight: "600" },
  title: { flex: 1, color: "#fff", fontSize: 16, fontWeight: "600" },
  web: { flex: 1, backgroundColor: "#2b2f36" },
  errorBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md, backgroundColor: "#fff" },
  errorText: { color: colors.ink, fontSize: 14 },
  link: { color: colors.ai, fontSize: 15, fontWeight: "600" },
});
