// FR-3.12.4 (mirror of apps/web/src/roles/student/ClassMaterialsTab.tsx and
// features/materials/AttachmentList.tsx): published materials grouped by lesson,
// pinned first then newest, "New" until opened. PDFs and images open for
// viewing; other files download; links open in the browser. Opening a material
// records the view (FR-3.12.6).
import { useRef } from "react";
import { View, Text, ScrollView, Linking, StyleSheet, RefreshControl } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "../../../lib/api";
import { canPreview, downloadTicket, openTicket } from "../../../lib/files";
import { urlHost } from "../../../lib/url";
import { formatBytes, formatDate } from "../../../lib/format";
import { useToast } from "../../../components/Toast";
import { Loading, ErrorState, EmptyState } from "../../../components/QueryState";
import { colors, spacing, text } from "../../../styles/theme";
import { groupByLesson, useLessons, useMaterials } from "../hooks";
import { Badge, Button, Panel, SectionTitle } from "../ui";

function fileLabel(a) {
  if (a.kind === "link") return urlHost(a.url) || (a.url ?? "");
  const sub = a.mimeType?.split("/")[1]?.toUpperCase().replace("VND.OPENXMLFORMATS-OFFICEDOCUMENT.", "") ?? "File";
  return `${sub}, ${formatBytes(a.sizeBytes)}`;
}

export function MaterialsTab({ classId }) {
  const q = useMaterials(classId);
  const lessons = useLessons(classId);
  const qc = useQueryClient();
  const toast = useToast();
  const recorded = useRef(new Set());

  function opened(m) {
    if (m.viewed || recorded.current.has(m.id)) return;
    recorded.current.add(m.id);
    api(`/materials/${m.id}/view`, { method: "POST" })
      .then(() => qc.setQueryData(["class", classId, "materials"], (items) => items?.map((x) => (x.id === m.id ? { ...x, viewed: true } : x))))
      .catch((err) => {
        recorded.current.delete(m.id);
        toast.error(errorMessage(err));
      });
  }

  async function openFile(m, a, preview) {
    try {
      const ticket = `/materials/${m.id}/attachments/${a.id}/ticket`;
      await (preview ? openTicket(ticket, a.mimeType) : downloadTicket(ticket));
      opened(m);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  function openLink(m, a) {
    opened(m);
    Linking.openURL(a.url).catch((err) => toast.error(errorMessage(err)));
  }

  if (q.isPending || lessons.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={q.refetch} />;
  if (lessons.isError) return <ErrorState error={lessons.error} retry={lessons.refetch} />;
  if (!q.data.length) return <EmptyState>No materials yet. Your teacher's slides, worksheets, and charts will appear here.</EmptyState>;

  const refresh = () => {
    void q.refetch();
    void lessons.refetch();
  };

  return (
    <ScrollView contentContainerStyle={{ padding: spacing.md }} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={refresh} />}>
      {groupByLesson(q.data, lessons.data).map((g) => (
        <View key={g.key} style={{ marginBottom: spacing.lg }}>
          <SectionTitle>{g.title}</SectionTitle>
          {g.items.map((m) => (
            <Panel key={m.id} style={styles.material}>
              <View style={styles.titleRow}>
                {m.pinned ? <Text accessibilityLabel="Pinned" style={styles.pin}>📌</Text> : null}
                <Text style={styles.materialTitle}>{m.title}</Text>
                {!m.viewed ? <Badge tone="info">New</Badge> : null}
                <Text style={text.small}>{m.publishedAt ? formatDate(m.publishedAt) : ""}</Text>
              </View>
              {m.description ? <Text style={[text.bodyMuted, { marginTop: spacing.xs }]}>{m.description}</Text> : null}
              {m.attachments.length ? (
                <View style={styles.attachments}>
                  {m.attachments.map((a) => (
                    <View key={a.id} style={styles.attachment}>
                      <Text style={styles.attIcon}>{a.kind === "link" ? "🔗" : "📄"}</Text>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={text.body} numberOfLines={1}>{a.name}</Text>
                        <Text style={text.small} numberOfLines={1}>{fileLabel(a)}</Text>
                      </View>
                      <View style={styles.attActions}>
                        {a.kind === "link" ? (
                          <Button size="sm" variant="secondary" onPress={() => openLink(m, a)}>Open link</Button>
                        ) : (
                          <>
                            {canPreview(a.mimeType) ? <Button size="sm" variant="secondary" onPress={() => openFile(m, a, true)}>Preview</Button> : null}
                            <Button size="sm" variant="secondary" onPress={() => openFile(m, a, false)}>Download</Button>
                          </>
                        )}
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}
            </Panel>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  material: { marginBottom: spacing.sm, padding: spacing.lg },
  titleRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  pin: { fontSize: 14 },
  materialTitle: { ...text.body, fontWeight: "600" },
  attachments: { marginTop: spacing.md, borderWidth: 1, borderColor: colors.line, borderRadius: 10 },
  attachment: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.line },
  attIcon: { fontSize: 18 },
  attActions: { gap: spacing.xs },
});
