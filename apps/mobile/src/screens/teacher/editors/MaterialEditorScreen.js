// Edit a class material — web: features/materials/MaterialEditorPage.tsx and
// AttachmentList.tsx (FR-3.12.1, FR-3.12.4, FR-3.12.8). Title, description,
// lesson and live class; files (several at once, one upload each) and https
// links, up to 10 in all; Save draft / Publish, or Save / Unpublish.
// Route params: { classId, materialId }.
import { useEffect, useState } from "react";
import { View, Text, ScrollView, Linking, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError, errorMessage, uploadFile } from "../../../lib/api";
import { canPreview, downloadTicket, openTicket } from "../../../lib/files";
import { urlHost } from "../../../lib/url";
import { formatBytes, formatDateTime } from "../../../lib/format";
import { LIMITS, MATERIAL_FILE_TYPES } from "../../../shared/constants";
import { Loading, ErrorState } from "../../../components/QueryState";
import { useToast } from "../../../components/Toast";
import { isReadOnly, materialKeys, useClass, useClassSessions, useLessons, useMaterial } from "../classHooks";
import { Badge, Button, Field, Header, InlineAlert, Panel, Picker, SectionTitle, ui } from "../ui";
import { colors, spacing, text } from "../../../styles/theme";

const PICK_TYPES = [...new Set(MATERIAL_FILE_TYPES.map((t) => t.mime))];

function fileMeta(a) {
  if (a.kind === "link") return urlHost(a.url) || a.url;
  return `${a.mimeType?.split("/")[1]?.toUpperCase().replace("VND.OPENXMLFORMATS-OFFICEDOCUMENT.", "") ?? "File"}, ${formatBytes(a.sizeBytes)}`;
}

function AttachmentRow({ materialId, a, removable, onRemove }) {
  const [busy, setBusy] = useState(null);
  const toast = useToast();
  const ticket = `/materials/${materialId}/attachments/${a.id}/ticket`;
  async function run(kind, fn) {
    setBusy(kind);
    try {
      await fn();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }
  return (
    <View style={s.att}>
      <Text style={s.attIcon}>{a.kind === "link" ? "🔗" : "📄"}</Text>
      <View style={{ flex: 1 }}>
        <Text style={text.body} numberOfLines={2}>{a.name}</Text>
        <Text style={text.small}>{fileMeta(a)}</Text>
        <View style={[ui.rowWrap, { marginTop: spacing.xs }]}>
          {a.kind === "link" ? (
            <Button small variant="secondary" onPress={() => run("link", () => Linking.openURL(a.url))}>Open link</Button>
          ) : (
            <>
              {canPreview(a.mimeType) ? (
                <Button small variant="secondary" loading={busy === "inline"} onPress={() => run("inline", () => openTicket(ticket, a.mimeType, a.name))}>Preview</Button>
              ) : null}
              <Button small variant="secondary" loading={busy === "attachment"} onPress={() => run("attachment", () => downloadTicket(ticket))}>Download</Button>
            </>
          )}
          {removable ? (
            <Button small variant="dangerGhost" onPress={() => onRemove(a)} accessibilityLabel={`Remove ${a.name}`}>Remove</Button>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export function MaterialEditorScreen({ route, navigation }) {
  const { classId, materialId } = route.params ?? {};
  const cls = useClass(classId);
  const q = useMaterial(materialId);
  const lessons = useLessons(classId);
  const sessions = useClassSessions(classId);
  const qc = useQueryClient();
  const toast = useToast();
  const [values, setValues] = useState({ title: "", description: "", lessonId: "", sessionId: "" });
  const [queue, setQueue] = useState([]);
  const [link, setLink] = useState({ name: "", url: "" });
  const [linkError, setLinkError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Fill the form once per material. (Web refills it whenever the material
  // changes, so adding a file there wipes unsaved title/description edits.)
  const [filledFor, setFilledFor] = useState(null);
  useEffect(() => {
    if (!q.data || filledFor === q.data.id) return;
    setValues({ title: q.data.title, description: q.data.description ?? "", lessonId: q.data.lessonId ?? "", sessionId: q.data.sessionId ?? "" });
    setFilledFor(q.data.id);
  }, [q.data, filledFor]);

  const back = () => navigation.goBack();
  const failed = [cls, q].find((x) => x.isError);
  if (cls.isPending || q.isPending || failed) {
    return (
      <SafeAreaView style={ui.root} edges={["top"]}>
        <Header title="Edit material" onBack={back} backLabel="Materials" />
        {failed ? <ErrorState error={failed.error} retry={() => failed.refetch()} /> : <Loading />}
      </SafeAreaView>
    );
  }
  const m = q.data;
  const readOnly = isReadOnly(cls.data);
  const setMaterial = (next) => qc.setQueryData(materialKeys.one(materialId), next);
  const room = LIMITS.materialMaxAttachments - m.attachments.length - queue.filter((f) => f.state !== "error").length;
  const setField = (k) => (v) => setValues((s0) => ({ ...s0, [k]: v }));

  async function pickFiles() {
    let picked;
    try {
      picked = await DocumentPicker.getDocumentAsync({ type: PICK_TYPES, multiple: true, copyToCacheDirectory: true });
    } catch (err) {
      toast.error(errorMessage(err));
      return;
    }
    if (picked.canceled || !picked.assets?.length) return;
    const files = picked.assets;
    const accepted = files.slice(0, Math.max(0, room));
    if (files.length > accepted.length) toast.error(`A material can have up to ${LIMITS.materialMaxAttachments} files and links.`);
    const items = accepted.map((file) => ({ key: `${file.name}-${file.size}-${Math.random()}`, file, state: "queued" }));
    setQueue((q0) => [...q0, ...items]);
    for (const item of items) {
      setQueue((q0) => q0.map((x) => (x.key === item.key ? { ...x, state: "uploading" } : x)));
      try {
        const next = await uploadFile(`/materials/${materialId}/attachments`, item.file);
        setMaterial(next);
        setQueue((q0) => q0.filter((x) => x.key !== item.key));
      } catch (err) {
        setQueue((q0) => q0.map((x) => (x.key === item.key ? { ...x, state: "error", error: errorMessage(err) } : x)));
      }
    }
    void qc.invalidateQueries({ queryKey: materialKeys.list(classId) });
  }

  async function addLink() {
    setLinkError(null);
    if (!link.name.trim()) return setLinkError("Name the link, for example Lesson video.");
    if (!/^https:\/\//.test(link.url.trim())) return setLinkError("Links must start with https://");
    try {
      setMaterial(await api(`/materials/${materialId}/attachments`, { body: { kind: "link", name: link.name.trim(), url: link.url.trim() } }));
      setLink({ name: "", url: "" });
      void qc.invalidateQueries({ queryKey: materialKeys.list(classId) });
    } catch (err) {
      setLinkError(errorMessage(err));
    }
  }

  async function removeAttachment(a) {
    try {
      setMaterial(await api(`/materials/${materialId}/attachments/${a.id}`, { method: "DELETE" }));
      void qc.invalidateQueries({ queryKey: materialKeys.list(classId) });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function save(status) {
    if (!values.title.trim()) return setFormError("Enter a title.");
    setSaving(true);
    setFormError(null);
    try {
      const next = await api(`/materials/${materialId}`, {
        method: "PATCH",
        body: { title: values.title, description: values.description, lessonId: values.lessonId || null, sessionId: values.sessionId || null, ...(status ? { status } : {}) },
      });
      setMaterial(next);
      void qc.invalidateQueries({ queryKey: materialKeys.list(classId) });
      toast.success(status === "published" && m.status !== "published" ? "Published" : status === "draft" && m.status === "published" ? "Unpublished" : "Saved");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const uploading = queue.some((f) => f.state === "uploading");
  const lessonOptions = [{ value: "", label: "No lesson" }, ...(lessons.data ?? []).map((l) => ({ value: l.id, label: l.title }))];
  const sessionOptions = [
    { value: "", label: "None" },
    ...(sessions.data ?? []).filter((x) => x.status !== "cancelled").map((x) => ({ value: x.id, label: `${x.title}, ${formatDateTime(x.startAt)}` })),
  ];

  return (
    <SafeAreaView style={ui.root} edges={["top"]}>
      <Header title="Edit material" onBack={back} backLabel="Materials" right={m.status === "published" ? <Badge tone="success">Published</Badge> : <Badge>Draft</Badge>} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={ui.scroll} keyboardShouldPersistTaps="handled">
          {formError ? <InlineAlert tone="danger">{formError}</InlineAlert> : null}
          <Panel>
            <Field label="Title" value={values.title} onChangeText={setField("title")} editable={!readOnly} style={{ marginTop: 0 }} />
            <Field label="Description" value={values.description} onChangeText={setField("description")} multiline editable={!readOnly} />
            {lessons.isPending ? (
              <Loading label="Loading lessons" />
            ) : lessons.isError ? (
              <ErrorState error={lessons.error} retry={() => lessons.refetch()} />
            ) : (
              <Picker label="Lesson" value={values.lessonId} onChange={setField("lessonId")} options={lessonOptions} disabled={readOnly} />
            )}
            {sessions.isPending ? (
              <Loading label="Loading live classes" />
            ) : sessions.isError ? (
              <ErrorState error={sessions.error} retry={() => sessions.refetch()} />
            ) : (
              <Picker label="Live class" hint="For example, slides for Tuesday's class." value={values.sessionId} onChange={setField("sessionId")} options={sessionOptions} disabled={readOnly} />
            )}
          </Panel>

          <Panel>
            <SectionTitle>Files and links ({m.attachments.length} of {LIMITS.materialMaxAttachments})</SectionTitle>
            {m.attachments.map((a) => (
              <AttachmentRow key={a.id} materialId={m.id} a={a} removable={!readOnly} onRemove={removeAttachment} />
            ))}
            {queue.map((f) => (
              <View key={f.key} style={s.queued}>
                <View style={s.queuedTop}>
                  <Text style={[text.body, { flex: 1 }]} numberOfLines={1}>
                    {f.file.name} <Text style={text.small}>{formatBytes(f.file.size)}</Text>
                  </Text>
                  {f.state === "error" ? (
                    <Button small variant="ghost" onPress={() => setQueue((q0) => q0.filter((x) => x.key !== f.key))}>Dismiss</Button>
                  ) : (
                    <Text style={text.small}>{f.state === "queued" ? "Waiting" : "Uploading…"}</Text>
                  )}
                </View>
                {f.state === "error" ? <Text style={s.err}>{f.error}</Text> : null}
              </View>
            ))}
            {!readOnly && room > 0 ? (
              <>
                <Button variant="secondary" onPress={pickFiles} style={{ marginTop: spacing.sm }}>Choose files</Button>
                <Text style={[text.small, { marginTop: spacing.xs }]}>PDF, Word, PowerPoint, Excel, text, JPG, PNG, or WebP. No audio or video; share videos as links.</Text>
                <Field label="Link name" value={link.name} onChangeText={(v) => setLink((l) => ({ ...l, name: v }))} />
                <Field label="Link (https)" placeholder="https://" value={link.url} onChangeText={(v) => setLink((l) => ({ ...l, url: v }))} keyboardType="url" autoCapitalize="none" autoCorrect={false} />
                <Button variant="secondary" onPress={addLink} style={{ marginTop: spacing.sm, alignSelf: "flex-start" }}>🔗 Add link</Button>
                {linkError ? <Text style={s.err}>{linkError}</Text> : null}
              </>
            ) : null}
          </Panel>
        </ScrollView>
        {!readOnly ? (
          <View style={s.bar}>
            {m.status === "draft" ? (
              <>
                <Button variant="secondary" onPress={() => save()} loading={saving}>Save draft</Button>
                <Button onPress={() => save("published")} disabled={saving || uploading}>Publish</Button>
              </>
            ) : (
              <>
                <Button onPress={() => save()} loading={saving}>Save</Button>
                <Button variant="secondary" onPress={() => save("draft")} disabled={saving}>Unpublish</Button>
              </>
            )}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  att: { flexDirection: "row", gap: spacing.sm, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line },
  attIcon: { fontSize: 18, marginTop: 2 },
  queued: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: spacing.sm, marginTop: spacing.sm },
  queuedTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  err: { color: colors.shu, fontSize: 13, marginTop: spacing.xs },
  bar: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.kasumi },
});
