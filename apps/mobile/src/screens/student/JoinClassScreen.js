// FR-3.2.3 / FR-3.13.2 (mirror of apps/web/src/roles/student/JoinClassPage.tsx):
// enter a code, see a preview, then join. Classes are free. Accepts a `code`
// route param so a shared join code opens straight to the preview.
import { useEffect, useState } from "react";
import { View, Text, TextInput, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, errorMessage } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { CLASS_CODE_ALPHABET, CLASS_CODE_LENGTH } from "../../shared/constants";
import { useToast } from "../../components/Toast";
import { Loading, ErrorState } from "../../components/QueryState";
import { colors, spacing, text } from "../../styles/theme";
import { Button, LevelTag, Panel } from "./ui";

export function JoinClassScreen({ route, navigation }) {
  const codeParam = route.params?.code?.toUpperCase() ?? null;
  const [code, setCode] = useState(codeParam ?? "");
  const [lookup, setLookup] = useState(codeParam);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (codeParam) {
      setCode(codeParam);
      setLookup(codeParam);
    }
  }, [codeParam]);

  function submit() {
    const normalized = code.trim().toUpperCase();
    if (normalized.length !== CLASS_CODE_LENGTH || ![...normalized].every((c) => CLASS_CODE_ALPHABET.includes(c))) {
      setError("Class codes are 6 letters and numbers, like K7M2QX.");
      return;
    }
    setError(null);
    setLookup(normalized);
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title} accessibilityRole="header">Join a class</Text>
        <Text style={[text.bodyMuted, { marginBottom: spacing.lg }]}>Enter the 6-character code your teacher gave you.</Text>

        <Text style={styles.label}>Class code</Text>
        <TextInput
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase().replace(/\s/g, "").slice(0, CLASS_CODE_LENGTH))}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          spellCheck={false}
          maxLength={CLASS_CODE_LENGTH}
          onSubmitEditing={submit}
          returnKeyType="search"
          accessibilityLabel="Class code"
          style={[styles.input, error && styles.inputError]}
        />
        {error ? <Text style={styles.err} accessibilityRole="alert">{error}</Text> : null}
        <View style={{ marginTop: spacing.md }}><Button onPress={submit}>Find class</Button></View>

        {lookup ? <ClassPreview key={lookup} code={lookup} navigation={navigation} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function ClassPreview({ code, navigation }) {
  const q = useQuery({ queryKey: ["class-preview", code], queryFn: () => api("/classes/preview", { query: { code } }), retry: false });
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState(null);
  const qc = useQueryClient();
  const toast = useToast();

  if (q.isPending) return <Loading label="Looking up the class" />;
  if (q.isError) {
    if (q.error instanceof ApiError && q.error.status === 404) {
      return <View style={[styles.alert, styles.alertDanger]}><Text style={styles.alertDangerText}>No class uses the code {code}. Check it with your teacher.</Text></View>;
    }
    return <ErrorState error={q.error} retry={q.refetch} />;
  }
  const p = q.data;
  const enrolled = p.enrollment?.status === "active";
  const openClass = () => navigation.replace("ClassDetail", { classId: p.id });

  async function join() {
    setJoining(true);
    setError(null);
    try {
      await api("/classes/join", { body: { code } });
      await qc.invalidateQueries({ queryKey: ["classes"] });
      toast.success("You're enrolled");
      openClass();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setJoining(false);
    }
  }

  return (
    <Panel level={p.level} style={styles.preview}>
      <View style={styles.previewTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.previewTitle}>{p.name}</Text>
          <Text style={text.bodyMuted}>{p.schoolName}</Text>
        </View>
        <LevelTag level={p.level} />
      </View>
      <Text style={styles.dt}>Teacher</Text>
      <Text style={text.body}>{p.teachers.join(", ") || "To be announced"}</Text>
      <Text style={styles.dt}>Upcoming live classes</Text>
      {p.upcomingSessions.length ? (
        p.upcomingSessions.map((s) => <Text key={s.startAt} style={text.body}>{s.title}: {formatDateTime(s.startAt)}</Text>)
      ) : (
        <Text style={text.body}>None scheduled yet</Text>
      )}
      {error ? <View style={[styles.alert, styles.alertDanger]}><Text style={styles.alertDangerText}>{error}</Text></View> : null}
      <View style={{ marginTop: spacing.lg }}>
        {p.status === "archived" ? (
          <View style={styles.alert}><Text style={text.body}>This class is archived and isn't accepting students.</Text></View>
        ) : enrolled ? (
          <Button onPress={openClass}>Open class</Button>
        ) : p.enrollment?.status === "removed" ? (
          <View style={styles.alert}><Text style={text.body}>Your teacher removed you from this class. Ask them to add you back.</Text></View>
        ) : (
          <Button onPress={join} loading={joining}>Join class</Button>
        )}
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.kasumi },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { ...text.h1, color: colors.ai },
  label: { ...text.small, color: colors.ink, marginBottom: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: spacing.md, backgroundColor: colors.paper, fontSize: 22, letterSpacing: 4, fontFamily: "monospace" },
  inputError: { borderColor: colors.shu },
  err: { color: colors.shu, marginTop: spacing.xs, fontSize: 14 },
  preview: { marginTop: spacing.lg, padding: spacing.lg },
  previewTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  previewTitle: { ...text.h2 },
  dt: { ...text.small, marginTop: spacing.md },
  alert: { marginTop: spacing.md, borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: spacing.md, backgroundColor: colors.kasumi },
  alertDanger: { backgroundColor: "#fef2f2", borderColor: "#fecaca" },
  alertDangerText: { color: colors.shu },
});
