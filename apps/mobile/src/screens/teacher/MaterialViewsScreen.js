// Who opened a published material — web: ViewsDialog in
// features/materials/StaffMaterialsTab.tsx (FR-3.12.6, GET /materials/:id/views).
// Route params: { materialId, title }.
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { Loading, ErrorState } from "../../components/QueryState";
import { materialKeys } from "./classHooks";
import { Header, Panel, ui } from "./ui";
import { colors, spacing, text } from "../../styles/theme";

export function MaterialViewsScreen({ route, navigation }) {
  const { materialId, title } = route.params ?? {};
  const q = useQuery({ queryKey: materialKeys.views(materialId), queryFn: () => api(`/materials/${materialId}/views`) });
  return (
    <SafeAreaView style={ui.root} edges={["top"]}>
      <Header title={title} onBack={() => navigation.goBack()} backLabel="Materials" />
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <ScrollView contentContainerStyle={ui.scroll}>
          <Text style={[text.body, { marginBottom: spacing.md }]}>
            Opened by {q.data.opened.length} of {q.data.total} students.
          </Text>
          <Panel>
            <Text style={s.h}>Not opened yet</Text>
            {q.data.notOpened.length ? (
              q.data.notOpened.map((p) => (
                <Text key={p.uid} style={s.item}>• {p.name}</Text>
              ))
            ) : (
              <Text style={text.bodyMuted}>Everyone has opened it.</Text>
            )}
          </Panel>
          {q.data.opened.length ? (
            <Panel>
              <Text style={s.h}>Opened</Text>
              {q.data.opened.map((p) => (
                <View key={p.uid} style={s.row}>
                  <Text style={text.body}>{p.name}</Text>
                  <Text style={text.small}>last {formatDateTime(p.lastViewedAt)}</Text>
                </View>
              ))}
            </Panel>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  h: { ...text.body, fontWeight: "700", marginBottom: spacing.xs },
  item: { ...text.body, paddingVertical: 2 },
  row: { paddingVertical: spacing.xs, borderTopWidth: 1, borderTopColor: colors.line },
});
