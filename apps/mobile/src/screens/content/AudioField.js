// Mobile counterpart of AudioField in apps/web/src/components/audio.tsx.
// The web page can upload a file or record in the browser; on the phone the
// equivalent is picking an audio file (MP3, M4A, WAV, OGG, or WebM up to 10 MB,
// the same types and limit the API accepts). "Listen" opens the clip's public
// URL in the phone's player, like the student quiz player does.
import { useState } from "react";
import { View, Text, Linking } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { AUDIO_FILE_TYPES, LIMITS } from "../../shared/constants";
import { Btn, s as ui } from "./ui";
import { colors, spacing, text } from "../../styles/theme";

const ACCEPT = [...new Set([...AUDIO_FILE_TYPES.map((t) => t.mime), "audio/x-m4a", "audio/x-wav", "audio/webm"])];
const MIME_BY_EXT = Object.fromEntries(AUDIO_FILE_TYPES.map((t) => [t.ext, t.mime]));
export const AUDIO_HINT = "MP3, M4A, WAV, OGG, or WebM, up to 10 MB.";

/** Picks audio files and checks them against the API's rules. Returns { files, problems }. */
export async function pickAudioFiles({ multiple = false } = {}) {
  const res = await DocumentPicker.getDocumentAsync({ type: ACCEPT, multiple, copyToCacheDirectory: true });
  if (res.canceled) return { files: [], problems: [] };
  const files = [];
  const problems = [];
  for (const a of res.assets ?? []) {
    const ext = (a.name.split(".").pop() ?? "").toLowerCase();
    if (!MIME_BY_EXT[ext]) problems.push(`${a.name}: use ${AUDIO_HINT.replace(", up to 10 MB.", "")}.`);
    else if (a.size != null && a.size > LIMITS.audioMaxBytes) problems.push(`${a.name} is larger than 10 MB.`);
    // `file` is the browser File when the app runs on web (absent on the phone).
    else files.push({ uri: a.uri, name: a.name, mimeType: a.mimeType || MIME_BY_EXT[ext], size: a.size ?? null, file: a.file });
  }
  return { files, problems };
}

export function openClip(url) {
  return Linking.openURL(url);
}

export function AudioField({ label, currentUrl, currentName, busy, onSelect, onRemove }) {
  const [error, setError] = useState(null);

  async function choose() {
    setError(null);
    try {
      const { files, problems } = await pickAudioFiles();
      if (problems.length) return setError(problems.join(" "));
      if (files[0]) await onSelect(files[0]);
    } catch (err) {
      setError(err?.message ?? "Couldn't open the file picker.");
    }
  }

  return (
    <View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: spacing.md, marginTop: spacing.md }}>
      <Text style={ui.label}>{label}</Text>
      {currentUrl ? (
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm }}>
          <Btn small variant="secondary" label="Listen" accessibilityLabel={`Play ${label.toLowerCase()}`} onPress={() => openClip(currentUrl).catch((e) => setError(e?.message ?? "Couldn't play the clip."))} />
          <Text style={[text.small, { flexShrink: 1 }]}>{currentName ?? "Audio attached"}</Text>
          {onRemove ? <Btn small variant="dangerGhost" label="Remove" onPress={onRemove} disabled={busy} /> : null}
        </View>
      ) : null}
      <Btn small variant="secondary" label={currentUrl ? "Replace with a file" : "Upload a file"} onPress={choose} loading={busy} style={{ alignSelf: "flex-start" }} />
      <Text style={[ui.hint, { marginTop: spacing.sm }]}>{AUDIO_HINT}</Text>
      {error ? <Text style={ui.err}>{error}</Text> : null}
    </View>
  );
}
