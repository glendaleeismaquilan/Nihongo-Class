// The class list for teachers (their classes) and School Admins (every class in
// the school) — web: features/classes/ClassListPage.tsx. Both roles' Classes
// tab opens on this screen; archived classes stay listed with their status.
import { useState } from "react";
import { View, Text, FlatList, Pressable, RefreshControl, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../context/AuthContext";
import { Loading, ErrorState, EmptyState } from "../../components/QueryState";
import { useClasses } from "./classHooks";
import { Badge, Button, LevelTag, MONO, ui } from "./ui";
import { colors, spacing, text } from "../../styles/theme";

export function TeacherClassesScreen({ navigation }) {
  const { me } = useAuth();
  const isAdmin = me?.role === "school_admin";
  const q = useClasses();
  const [refreshing, setRefreshing] = useState(false);
  const items = q.data ?? [];
  const create = () => navigation.navigate("CreateClass");

  async function refresh() {
    setRefreshing(true);
    try {
      await q.refetch();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <SafeAreaView style={ui.root} edges={["top"]}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.title} accessibilityRole="header">Classes</Text>
          <Text style={text.small}>{isAdmin ? "Every class in your school." : "The classes you teach."}</Text>
        </View>
        <Button small onPress={create}>Create class</Button>
      </View>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState action={<Button onPress={create}>Create class</Button>}>No classes yet. Create one, then share its code with your students.</EmptyState>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.id}
          contentContainerStyle={ui.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          renderItem={({ item: c }) => (
            <Pressable
              style={({ pressed }) => [ui.card, pressed && s.pressed]}
              onPress={() => navigation.navigate("TeacherClassDetail", { classId: c.id })}
              accessibilityRole="button"
              accessibilityLabel={`${c.name}, ${c.level}, ${c.status === "archived" ? "archived" : "active"}`}
            >
              <View style={s.rowTop}>
                <Text style={s.name} numberOfLines={2}>{c.name}</Text>
                {c.status === "archived" ? <Badge>Archived</Badge> : <Badge tone="success">Active</Badge>}
              </View>
              <View style={[ui.rowWrap, { marginTop: spacing.xs, gap: spacing.md }]}>
                <LevelTag level={c.level} />
                <Text style={text.small}>{c.studentCount ?? 0} students</Text>
                <Text style={text.small}>
                  Code <Text style={s.code}>{c.code}</Text>
                </Text>
              </View>
              {isAdmin ? (
                <Text style={[text.small, { marginTop: spacing.xs }]} numberOfLines={2}>
                  {c.teachers.map((t) => t.name).join(", ") || "No teacher yet"}
                </Text>
              ) : null}
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  title: { ...text.h1, color: colors.ai },
  rowTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm },
  name: { ...text.body, fontSize: 17, fontWeight: "600", flex: 1 },
  code: { fontFamily: MONO, letterSpacing: 2, color: colors.ink, fontWeight: "600" },
  pressed: { opacity: 0.85 },
});
