// The class workspace shared by teachers and School Admins — web:
// features/classes/ClassWorkspace.tsx and its tabs (staffRoutes.tsx).
// Header: name, level, teachers, student count, class code (share it or make a
// new one); the video call banner, or the archived notice; then the tabs.
// Route params: { classId, tab? } — tab is lessons | live | materials | roster
// | reports | settings (notification links and the admin Reports screen send it).
import { useEffect, useRef, useState } from "react";
import { View, Text, ScrollView, Pressable, RefreshControl, Share, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../components/Toast";
import { Loading, ErrorState } from "../../components/QueryState";
import { CallBanner } from "../../components/CallBanner";
import { classKeys, isReadOnly, useClass } from "./classHooks";
import { Badge, Button, ConfirmDialog, Header, InlineAlert, LevelTag, MONO, ui } from "./ui";
import { LessonsTab } from "./workspace/LessonsTab";
import { LiveTab } from "./workspace/LiveTab";
import { MaterialsTab } from "./workspace/MaterialsTab";
import { RosterTab } from "./workspace/RosterTab";
import { ReportsTab } from "./workspace/ReportsTab";
import { SettingsTab, backToClasses } from "./workspace/SettingsTab";
import { colors, spacing, text } from "../../styles/theme";

const TABS = [
  { key: "lessons", label: "Lessons and content", Component: LessonsTab },
  { key: "live", label: "Live classes", Component: LiveTab },
  { key: "materials", label: "Materials", Component: MaterialsTab },
  { key: "roster", label: "Roster", Component: RosterTab },
  { key: "reports", label: "Reports", Component: ReportsTab },
  { key: "settings", label: "Class settings", Component: SettingsTab },
];
const TAB_KEYS = TABS.map((t) => t.key);
const validTab = (t) => (TAB_KEYS.includes(t) ? t : "lessons");

function CodeBox({ cls }) {
  const [confirm, setConfirm] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();
  const regen = useMutation({
    mutationFn: () => api(`/classes/${cls.id}/code`, { method: "POST" }),
    onSuccess: () => {
      setConfirm(false);
      toast.success("New code created");
      void qc.invalidateQueries({ queryKey: classKeys.one(cls.id) });
      void qc.invalidateQueries({ queryKey: classKeys.all });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  // Web copies a join link built from its own address; the app has no web
  // address to build one from, so it shares the code students type in Join class.
  async function share() {
    try {
      await Share.share({ message: `Join ${cls.name} on Nihongo Class with the class code ${cls.code}.` });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <View style={s.codeBox}>
      <View style={s.codeRow}>
        <Text style={text.small}>Class code</Text>
        <Text style={s.code} accessibilityLabel={`Class code ${cls.code?.split("").join(" ")}`}>{cls.code}</Text>
      </View>
      <View style={ui.rowWrap}>
        <Button small variant="ghost" onPress={share}>Share class code</Button>
        {cls.status === "active" ? <Button small variant="ghost" onPress={() => setConfirm(true)}>New code</Button> : null}
      </View>
      <ConfirmDialog
        open={confirm}
        title="Create a new class code?"
        body={`The current code ${cls.code} stops working. Students already in the class stay enrolled.`}
        confirmLabel="Create new code"
        destructive={false}
        busy={regen.isPending}
        onCancel={() => setConfirm(false)}
        onConfirm={() => regen.mutate()}
      />
    </View>
  );
}

export function TeacherClassDetailScreen({ route, navigation }) {
  const classId = route.params?.classId;
  const tabParam = route.params?.tab;
  const { me } = useAuth();
  const q = useClass(classId);
  const qc = useQueryClient();
  const [tab, setTab] = useState(() => validTab(tabParam));
  const [refreshing, setRefreshing] = useState(false);
  const lastClass = useRef(classId);

  // A link can open this screen again with another tab (or class): follow it,
  // then clear the param so the same link works the next time too.
  useEffect(() => {
    if (!tabParam) return;
    setTab(validTab(tabParam));
    navigation.setParams({ tab: undefined });
  }, [tabParam, navigation]);
  useEffect(() => {
    if (lastClass.current === classId) return;
    lastClass.current = classId;
    if (!route.params?.tab) setTab("lessons");
  }, [classId, route.params?.tab]);

  async function refresh() {
    setRefreshing(true);
    try {
      await qc.invalidateQueries({ queryKey: ["class", classId] });
    } finally {
      setRefreshing(false);
    }
  }

  const back = <Header onBack={() => backToClasses(navigation)} backLabel="Classes" />;
  if (q.isPending) {
    return (
      <SafeAreaView style={ui.root} edges={["top"]}>
        {back}
        <Loading />
      </SafeAreaView>
    );
  }
  if (q.isError) {
    return (
      <SafeAreaView style={ui.root} edges={["top"]}>
        {back}
        <ErrorState error={q.error} retry={() => q.refetch()} />
      </SafeAreaView>
    );
  }

  const cls = q.data;
  const readOnly = isReadOnly(cls);
  const tabs = TABS.filter((t) => t.key !== "settings" || me?.role === "school_admin" || !readOnly);
  const current = tabs.find((t) => t.key === tab) ?? tabs[0];
  const Body = current.Component;

  return (
    <SafeAreaView style={ui.root} edges={["top"]}>
      <ScrollView
        stickyHeaderIndices={[1]}
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <View style={s.head}>
          <Pressable onPress={() => backToClasses(navigation)} accessibilityRole="button" style={s.back} hitSlop={8}>
            <Text style={s.backText}>‹ Classes</Text>
          </Pressable>
          <Text style={s.title} accessibilityRole="header">{cls.name}</Text>
          <View style={[ui.rowWrap, { gap: spacing.md, marginTop: spacing.xs }]}>
            <LevelTag level={cls.level} />
            <Text style={text.small}>{cls.teachers.map((t) => t.name).join(", ") || "No teacher assigned"}</Text>
            <Text style={text.small}>{cls.studentCount ?? 0} students</Text>
            {readOnly ? <Badge>Archived</Badge> : null}
          </View>
          <CodeBox cls={cls} />
          {readOnly ? (
            <InlineAlert>This class is archived. Students can still open it, but it accepts no new students, live classes, content, or materials.</InlineAlert>
          ) : (
            <CallBanner classId={cls.id} navigation={navigation} />
          )}
        </View>
        <View style={s.tabsWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs} accessibilityRole="tablist">
            {tabs.map((t) => {
              const on = t.key === current.key;
              return (
                <Pressable key={t.key} onPress={() => setTab(t.key)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={[s.tab, on && s.tabOn]}>
                  <Text style={[s.tabText, on && s.tabTextOn]}>{t.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
        <View style={s.body}>
          <Body key={`${cls.id}-${current.key}`} cls={cls} readOnly={readOnly} navigation={navigation} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  head: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  back: { minHeight: 36, justifyContent: "center", alignSelf: "flex-start" },
  backText: { color: colors.ai, fontSize: 15 },
  title: { ...text.h1, fontSize: 24 },
  codeBox: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginTop: spacing.md, marginBottom: spacing.md },
  codeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  code: { fontFamily: MONO, fontSize: 20, fontWeight: "700", letterSpacing: 4, color: colors.ink },
  tabsWrap: { backgroundColor: colors.kasumi, borderBottomWidth: 1, borderBottomColor: colors.line },
  tabs: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.xs },
  tab: { minHeight: 40, paddingHorizontal: spacing.md, borderRadius: 999, justifyContent: "center", borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  tabOn: { backgroundColor: colors.ai, borderColor: colors.ai },
  tabText: { fontSize: 14, color: colors.ink, fontWeight: "500" },
  tabTextOn: { color: colors.paper, fontWeight: "600" },
  body: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
});
