// A class for a student (mirror of apps/web/src/roles/student/ClassPage.tsx):
// header, archived notice, the active-call banner, and Lessons / Live classes /
// Materials tabs. `route.params.tab` ("live" | "materials") opens a tab directly
// (notification links like /s/classes/:id/live).
import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Loading, ErrorState } from "../../components/QueryState";
import { CallBanner } from "../../components/CallBanner";
import { colors, spacing, text } from "../../styles/theme";
import { useClass } from "./hooks";
import { LevelTag } from "./ui";
import { LessonsTab } from "./class/LessonsTab";
import { MaterialsTab } from "./class/MaterialsTab";
import { LiveTab } from "./class/LiveTab";

const TABS = [
  { key: "lessons", label: "Lessons" },
  { key: "live", label: "Live classes" },
  { key: "materials", label: "Materials" },
];
const tabFrom = (t) => (TABS.some((x) => x.key === t) ? t : "lessons");

export function ClassDetailScreen({ route, navigation }) {
  const { classId } = route.params;
  const [tab, setTab] = useState(tabFrom(route.params?.tab));
  useEffect(() => setTab(tabFrom(route.params?.tab)), [route.params?.tab]);
  const q = useClass(classId);

  const back = (
    <Pressable onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate("ClassesList"))} style={styles.back} accessibilityRole="link">
      <Text style={styles.backText}>‹ My classes</Text>
    </Pressable>
  );

  if (q.isPending) return <SafeAreaView style={styles.root} edges={["top"]}>{back}<Loading /></SafeAreaView>;
  if (q.isError) return <SafeAreaView style={styles.root} edges={["top"]}>{back}<ErrorState error={q.error} retry={q.refetch} /></SafeAreaView>;
  const cls = q.data;

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        {back}
        <Text style={styles.title} accessibilityRole="header">{cls.name}</Text>
        <View style={styles.meta}>
          <LevelTag level={cls.level} />
          <Text style={text.bodyMuted}>{cls.teachers.map((t) => t.name).join(", ")}</Text>
        </View>
      </View>
      {cls.status === "archived" ? (
        <View style={styles.archived}><Text style={text.body}>This class is archived. You can still review its lessons and materials.</Text></View>
      ) : null}

      <View style={styles.tabs} accessibilityRole="tablist" accessibilityLabel="Class sections">
        {TABS.map((t) => (
          <Pressable key={t.key} onPress={() => { setTab(t.key); navigation.setParams({ tab: t.key }); }} style={[styles.tab, tab === t.key && styles.tabActive]} accessibilityRole="tab" accessibilityState={{ selected: tab === t.key }}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
      {cls.status !== "archived" ? (
        <View style={styles.banner}><CallBanner classId={cls.id} canStart={false} navigation={navigation} /></View>
      ) : null}

      <View style={{ flex: 1 }}>
        {tab === "lessons" ? <LessonsTab classId={cls.id} navigation={navigation} /> : null}
        {tab === "live" ? <LiveTab classId={cls.id} /> : null}
        {tab === "materials" ? <MaterialsTab classId={cls.id} /> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.kasumi },
  back: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.lg },
  backText: { color: colors.ai, fontSize: 15 },
  header: { backgroundColor: colors.paper, paddingBottom: spacing.md },
  title: { ...text.h1, fontSize: 24, color: colors.ink, paddingHorizontal: spacing.lg },
  meta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.md, paddingHorizontal: spacing.lg, marginTop: spacing.xs },
  archived: { margin: spacing.md, marginBottom: 0, padding: spacing.md, borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  tabs: { flexDirection: "row", backgroundColor: colors.paper, borderBottomWidth: 1, borderBottomColor: colors.line },
  tab: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center" },
  tabActive: { borderBottomWidth: 2, borderBottomColor: colors.ai },
  tabText: { ...text.body, fontSize: 15, color: colors.ink2 },
  tabTextActive: { color: colors.ai, fontWeight: "600" },
  banner: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
});
