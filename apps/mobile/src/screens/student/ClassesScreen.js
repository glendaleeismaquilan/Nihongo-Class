// The student's classes (mirror of apps/web/src/roles/student/ClassesPage.tsx).
// GET /classes returns the classes the student is actively enrolled in, with
// teacher names; archived classes carry a badge.
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Loading, ErrorState, EmptyState } from "../../components/QueryState";
import { colors, spacing, text } from "../../styles/theme";
import { useMyClasses } from "./hooks";
import { Badge, Button, LevelTag, Panel } from "./ui";

export function ClassesScreen({ navigation }) {
  const q = useMyClasses();
  const join = () => navigation.navigate("JoinClass");

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">My classes</Text>
        <Button size="sm" onPress={join}>+ Join a class</Button>
      </View>

      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={q.refetch} />
      ) : q.data.length === 0 ? (
        <EmptyState action={<Button onPress={join}>Join a class</Button>}>
          You aren't in a class yet. Enter the code from your teacher to join one, or keep studying in Self-Study.
        </EmptyState>
      ) : (
        <FlatList
          data={q.data}
          keyExtractor={(c) => c.id}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} />}
          contentContainerStyle={{ padding: spacing.md }}
          renderItem={({ item: c }) => (
            <Pressable onPress={() => navigation.navigate("ClassDetail", { classId: c.id })} accessibilityRole="link" accessibilityLabel={c.name}>
              <Panel level={c.level} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle}>{c.name}</Text>
                  <LevelTag level={c.level} />
                </View>
                <Text style={text.bodyMuted}>{c.teachers.map((t) => t.name).join(", ")}</Text>
                {c.status === "archived" ? <View style={{ marginTop: spacing.sm }}><Badge>Archived</Badge></View> : null}
              </Panel>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.kasumi },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.lg, paddingBottom: spacing.sm },
  title: { ...text.h1, color: colors.ai },
  card: { marginBottom: spacing.sm, padding: spacing.lg },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.sm, marginBottom: spacing.xs },
  cardTitle: { flex: 1, fontSize: 18, fontWeight: "600", color: colors.ai },
});
