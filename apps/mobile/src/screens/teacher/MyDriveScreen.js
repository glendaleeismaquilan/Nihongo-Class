// My Drive: a teacher's private files in folders — web: roles/teacher/DrivePage.tsx.
// 500 MB free, 1 GB with Premium; class materials they upload share the space.
// Open or download a file through a ticket, upload several files, make, rename,
// move and delete folders and files. Android's back button goes up a folder.
import { useCallback, useState } from "react";
import { View, Text, ScrollView, Pressable, RefreshControl, BackHandler, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { api, ApiError, errorMessage, uploadFile } from "../../lib/api";
import { downloadTicket, openTicket } from "../../lib/files";
import { formatBytes, formatDate } from "../../lib/format";
import { MATERIAL_FILE_TYPES } from "../../shared/constants";
import { Loading, ErrorState, EmptyState } from "../../components/QueryState";
import { useToast } from "../../components/Toast";
import { Button, ConfirmDialog, Dialog, Field, InlineAlert, Panel, Picker, ui } from "./ui";
import { colors, spacing, text } from "../../styles/theme";

const PICK_TYPES = [...new Set(MATERIAL_FILE_TYPES.map((t) => t.mime))];

export function MyDriveScreen({ navigation }) {
  const [folderId, setFolderId] = useState("");
  const [uploads, setUploads] = useState([]);
  const [newFolder, setNewFolder] = useState(false);
  const [actionsFor, setActionsFor] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [moving, setMoving] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();

  const q = useQuery({ queryKey: ["drive", folderId], queryFn: () => api("/drive", { query: { folderId } }) });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["drive"] });
    void qc.invalidateQueries({ queryKey: ["me"] });
  };
  const parentOf = () => {
    const path = q.data?.path ?? [];
    return path.length > 1 ? path[path.length - 2].id : "";
  };

  // Android back: up one folder before leaving My Drive.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (!folderId) return false;
        setFolderId(parentOf());
        return true;
      });
      return () => sub.remove();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [folderId, q.data]),
  );

  const remove = useMutation({
    mutationFn: (id) => api(`/drive/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setDeleting(null);
      toast.success("Deleted");
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  async function openFile(item, download = false) {
    try {
      if (download) await downloadTicket(`/drive/${item.id}/ticket`);
      else await openTicket(`/drive/${item.id}/ticket`, item.mimeType);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function uploadFiles() {
    let picked;
    try {
      picked = await DocumentPicker.getDocumentAsync({ type: PICK_TYPES, multiple: true, copyToCacheDirectory: true });
    } catch (err) {
      toast.error(errorMessage(err));
      return;
    }
    if (picked.canceled || !picked.assets?.length) return;
    for (const file of picked.assets) {
      const id = Math.random();
      setUploads((u) => [...u, { id, name: file.name }]);
      try {
        await uploadFile("/drive/files", file, { fields: folderId ? { parentId: folderId } : {} });
        setUploads((u) => u.filter((x) => x.id !== id));
        refresh();
      } catch (err) {
        setUploads((u) => u.map((x) => (x.id === id ? { ...x, error: errorMessage(err) } : x)));
      }
    }
  }

  async function pullRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([qc.invalidateQueries({ queryKey: ["drive"] }), qc.invalidateQueries({ queryKey: ["me"] })]);
    } finally {
      setRefreshing(false);
    }
  }

  const goPremium = () => navigation.navigate("Premium", { screen: "PremiumHome" });
  const header = (
    <View style={s.header}>
      <View style={{ flex: 1 }}>
        <Text style={s.title} accessibilityRole="header">My Drive</Text>
        <Text style={text.small}>Your private files for lesson planning. Only you can see them.</Text>
      </View>
      <Button small variant="secondary" onPress={() => setNewFolder(true)}>New folder</Button>
    </View>
  );

  if (q.isPending || q.isError) {
    return (
      <SafeAreaView style={ui.root} edges={["top"]}>
        {header}
        {q.isPending ? <Loading /> : <ErrorState error={q.error} retry={() => q.refetch()} />}
        {newFolder ? <NameDialog title="New folder" label="Folder name" onClose={() => setNewFolder(false)} onSave={(name) => api("/drive/folders", { body: { name, parentId: folderId || undefined } }).then(refresh)} /> : null}
      </SafeAreaView>
    );
  }
  const { usage, items, path } = q.data;
  const full = usage.usedBytes >= usage.limitBytes;
  const ratio = usage.limitBytes ? Math.min(1, usage.usedBytes / usage.limitBytes) : 0;

  return (
    <SafeAreaView style={ui.root} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pullRefresh} />}>
        {header}
        <View style={{ paddingHorizontal: spacing.md }}>
          <Panel>
            <View style={s.usageTop}>
              <Text style={text.body}>
                <Text style={{ fontWeight: "700" }}>{formatBytes(usage.usedBytes)}</Text> of {formatBytes(usage.limitBytes)} used
              </Text>
              {usage.premium ? (
                <Text style={text.small}>⭐ Premium</Text>
              ) : (
                <Pressable onPress={goPremium} accessibilityRole="link" hitSlop={6}>
                  <Text style={s.link}>Get 1 GB with Premium</Text>
                </Pressable>
              )}
            </View>
            <View style={s.bar} accessibilityRole="progressbar" accessibilityLabel="Storage used" accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }}>
              <View style={[s.barFill, { width: `${ratio * 100}%` }, full && { backgroundColor: colors.shu }]} />
            </View>
            <Text style={[text.small, { marginTop: spacing.sm }]}>Files here and class materials you upload share this space.</Text>
          </Panel>
          {full ? (
            <InlineAlert tone="danger" title="Your storage is full">
              <Text style={{ color: colors.shu }}>Delete files to make room{usage.premium ? "." : ", or go Premium for 1 GB."}</Text>
              {!usage.premium ? <Button small style={{ marginTop: spacing.sm, alignSelf: "flex-start" }} onPress={goPremium}>See Premium</Button> : null}
            </InlineAlert>
          ) : null}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.crumbs} accessibilityLabel="Folder path">
            <Pressable onPress={() => setFolderId("")} style={s.crumb} accessibilityRole="button">
              <Text style={[s.crumbText, !path.length && s.crumbCurrent]}>My Drive</Text>
            </Pressable>
            {path.map((p, i) => (
              <View key={p.id} style={s.crumbRow}>
                <Text style={text.small}>›</Text>
                {i === path.length - 1 ? (
                  <Text style={[s.crumbText, s.crumbCurrent, s.crumb]}>{p.name}</Text>
                ) : (
                  <Pressable onPress={() => setFolderId(p.id)} style={s.crumb} accessibilityRole="button">
                    <Text style={s.crumbText}>{p.name}</Text>
                  </Pressable>
                )}
              </View>
            ))}
          </ScrollView>

          <Button variant="secondary" onPress={uploadFiles} disabled={full}>⇪ Upload files</Button>
          <Text style={[text.small, { marginTop: spacing.xs, marginBottom: spacing.sm }]}>PDF, Word, PowerPoint, Excel, text, JPG, PNG, or WebP.</Text>
          {uploads.map((u) => (
            <View key={u.id} style={s.upload}>
              <View style={s.uploadTop}>
                <Text style={[text.body, { flex: 1 }]} numberOfLines={1}>{u.name}</Text>
                {u.error ? (
                  <Button small variant="ghost" onPress={() => setUploads((all) => all.filter((x) => x.id !== u.id))} accessibilityLabel={`Dismiss ${u.name}`}>Dismiss</Button>
                ) : (
                  <Text style={text.small}>Uploading…</Text>
                )}
              </View>
              {u.error ? <Text style={s.err}>{u.error}</Text> : null}
            </View>
          ))}

          {items.length === 0 ? (
            <EmptyState>{folderId ? "This folder is empty." : "No files yet. Upload files above, or make a folder for each class."}</EmptyState>
          ) : (
            <View style={s.list}>
              {items.map((i, idx) => (
                <View key={i.id} style={[s.item, idx > 0 && s.divider]}>
                  <Pressable
                    style={s.itemMain}
                    onPress={() => (i.kind === "folder" ? setFolderId(i.id) : openFile(i))}
                    accessibilityRole="button"
                    accessibilityLabel={i.kind === "folder" ? `Folder ${i.name}` : i.name}
                  >
                    <Text style={s.itemIcon}>{i.kind === "folder" ? "📁" : "📄"}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[text.body, i.kind === "folder" && { color: colors.ai, fontWeight: "600" }]}>{i.name}</Text>
                      <Text style={text.small}>
                        {i.kind === "file" ? `${formatBytes(i.sizeBytes)} · ` : ""}
                        {formatDate(i.updatedAt)}
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable onPress={() => setActionsFor(i)} style={s.more} accessibilityRole="button" accessibilityLabel={`Actions for ${i.name}`} hitSlop={4}>
                    <Text style={s.moreText}>⋯</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <Dialog
        open={!!actionsFor}
        title={actionsFor?.name}
        onClose={() => setActionsFor(null)}
        footer={<Button small variant="secondary" onPress={() => setActionsFor(null)}>Close</Button>}
      >
        {actionsFor?.kind === "file" ? (
          <>
            <ActionRow label="Open" onPress={() => { const it = actionsFor; setActionsFor(null); void openFile(it); }} />
            <ActionRow label="Download" onPress={() => { const it = actionsFor; setActionsFor(null); void openFile(it, true); }} />
          </>
        ) : null}
        <ActionRow label="Rename" onPress={() => { setRenaming(actionsFor); setActionsFor(null); }} />
        <ActionRow label="Move" onPress={() => { setMoving(actionsFor); setActionsFor(null); }} />
        <ActionRow label="Delete" danger onPress={() => { setDeleting(actionsFor); setActionsFor(null); }} />
      </Dialog>

      {newFolder ? <NameDialog title="New folder" label="Folder name" onClose={() => setNewFolder(false)} onSave={(name) => api("/drive/folders", { body: { name, parentId: folderId || undefined } }).then(refresh)} /> : null}
      {renaming ? (
        <NameDialog
          title={`Rename ${renaming.kind}`}
          label="Name"
          initial={renaming.name}
          onClose={() => setRenaming(null)}
          onSave={(name) => api(`/drive/${renaming.id}`, { method: "PATCH", body: { name } }).then(refresh)}
        />
      ) : null}
      {moving ? <MoveDialog item={moving} onClose={() => setMoving(null)} onMoved={refresh} /> : null}
      <ConfirmDialog
        open={!!deleting}
        title={`Delete ${deleting?.name ?? ""}?`}
        body={deleting?.kind === "folder" ? "Everything inside this folder is deleted too. This can't be undone." : "This can't be undone."}
        confirmLabel="Delete"
        busy={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </SafeAreaView>
  );
}

function ActionRow({ label, onPress, danger }) {
  return (
    <Pressable onPress={onPress} style={s.action} accessibilityRole="button">
      <Text style={[text.body, danger && { color: colors.shu }]}>{label}</Text>
    </Pressable>
  );
}

function NameDialog({ title, label, initial = "", onClose, onSave }) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (!name.trim()) return setError("Enter a name.");
    setBusy(true);
    try {
      await onSave(name.trim());
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? (Object.values(err.fieldErrors())[0] ?? err.message) : errorMessage(err));
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button small variant="secondary" onPress={onClose} disabled={busy}>Cancel</Button>
          <Button small onPress={submit} loading={busy}>Save</Button>
        </>
      }
    >
      <Field label={label} value={name} onChangeText={setName} error={error} autoFocus returnKeyType="done" onSubmitEditing={submit} />
    </Dialog>
  );
}

/** Every folder, walked one level at a time (web: allFolders in DrivePage). */
async function allFolders() {
  const out = [];
  const walk = async (folderId, prefix, depth) => {
    if (depth > 6 || out.length > 300) return;
    const listing = await api("/drive", { query: { folderId } });
    for (const f of listing.items.filter((i) => i.kind === "folder")) {
      const label = prefix ? `${prefix} / ${f.name}` : f.name;
      out.push({ id: f.id, label });
      await walk(f.id, label, depth + 1);
    }
  };
  await walk("", "", 0);
  return out;
}

function MoveDialog({ item, onClose, onMoved }) {
  const [target, setTarget] = useState("");
  const [error, setError] = useState(null);
  const folders = useQuery({ queryKey: ["drive", "all-folders"], queryFn: allFolders, gcTime: 0 });
  const move = useMutation({
    mutationFn: () => api(`/drive/${item.id}`, { method: "PATCH", body: { parentId: target || null } }),
    onSuccess: () => {
      onMoved();
      onClose();
    },
    onError: (err) => setError(errorMessage(err)),
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Move ${item.name}`}
      footer={
        <>
          <Button small variant="secondary" onPress={onClose} disabled={move.isPending}>Cancel</Button>
          <Button small onPress={() => move.mutate()} loading={move.isPending} disabled={folders.isPending || target === (item.parentId ?? "")}>Move here</Button>
        </>
      }
    >
      {error ? <InlineAlert tone="danger">{error}</InlineAlert> : null}
      {folders.isPending ? (
        <Loading />
      ) : folders.isError ? (
        <ErrorState error={folders.error} retry={() => folders.refetch()} />
      ) : (
        <Picker
          label="Destination"
          value={target}
          onChange={setTarget}
          options={[{ value: "", label: "My Drive (top level)" }, ...folders.data.filter((f) => f.id !== item.id).map((f) => ({ value: f.id, label: f.label }))]}
        />
      )}
    </Dialog>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  title: { ...text.h1, color: colors.ai },
  usageTop: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: spacing.sm, marginBottom: spacing.sm },
  link: { color: colors.ai, fontSize: 14, textDecorationLine: "underline" },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.kasumi, overflow: "hidden" },
  barFill: { height: 8, backgroundColor: colors.ai },
  crumbs: { alignItems: "center", gap: spacing.xs, paddingVertical: spacing.sm },
  crumbRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  crumb: { minHeight: 40, justifyContent: "center", paddingHorizontal: spacing.xs },
  crumbText: { fontSize: 14, color: colors.ai },
  crumbCurrent: { color: colors.ink, fontWeight: "600" },
  upload: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: spacing.sm, marginBottom: spacing.sm, backgroundColor: colors.paper },
  uploadTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  err: { color: colors.shu, fontSize: 13, marginTop: spacing.xs },
  list: { backgroundColor: colors.paper, borderRadius: 12, borderWidth: 1, borderColor: colors.line, marginTop: spacing.sm },
  item: { flexDirection: "row", alignItems: "center" },
  divider: { borderTopWidth: 1, borderTopColor: colors.line },
  itemMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.md, paddingLeft: spacing.md, minHeight: 56 },
  itemIcon: { fontSize: 20 },
  more: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  moreText: { fontSize: 22, color: colors.ink2, fontWeight: "700" },
  action: { minHeight: 48, justifyContent: "center", borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: spacing.xs },
});
