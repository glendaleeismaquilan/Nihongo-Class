// Built-in library home (mirror of apps/web/src/roles/content/LibraryOverviewPage.tsx):
// counts per JLPT level, each linking to that type's list filtered by level.
// The four type shortcuts stand in for the web app's Flashcards / Quizzes /
// Reading tests / Listening tests nav items.
import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { JLPT_LEVELS, LIBRARY_TYPES } from "../../shared/constants";
import { Loading, ErrorState } from "../../components/QueryState";
import { TYPE_LABEL } from "./libraryApi";
import { LevelTag, s as ui } from "./ui";
import { colors, spacing, text } from "../../styles/theme";

const COUNT_KEY = { flashcards: "flashcards", quizzes: "quizzes", "reading-tests": "readingTests", "listening-tests": "listeningTests" };

export function LibraryOverviewScreen({ navigation }) {
  const q = useQuery({ queryKey: ["library", "overview"], queryFn: () => api("/library/overview") });
  const openList = (type, level) => navigation.navigate({ name: "LibraryList", key: `list-${type}`, params: { type, level } });

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} />}>
        <Text style={styles.title}>Built-in library</Text>
        <Text style={styles.sub}>Flashcards, quizzes, reading tests, and listening tests for every JLPT level. Self-Study shows published items only.</Text>

        <View style={styles.types}>
          {LIBRARY_TYPES.map((t) => (
            <Pressable key={t} style={styles.typeBtn} onPress={() => openList(t, "N5")} accessibilityRole="button">
              <Text style={styles.typeText}>{TYPE_LABEL[t].plural}</Text>
            </Pressable>
          ))}
        </View>

        {q.isPending ? (
          <Loading />
        ) : q.isError ? (
          <ErrorState error={q.error} retry={q.refetch} />
        ) : (
          JLPT_LEVELS.map((l) => {
            const c = q.data.levels[l];
            return (
              <View key={l} style={ui.panel} accessibilityLabel={`Library counts for ${l}`}>
                <LevelTag level={l} />
                {LIBRARY_TYPES.map((t) => (
                  <Pressable key={t} style={styles.row} onPress={() => openList(t, l)} accessibilityRole="link" accessibilityLabel={`${c[COUNT_KEY[t]]} ${TYPE_LABEL[t].plural.toLowerCase()} at ${l}`}>
                    <Text style={[text.body, { flex: 1 }]}>{TYPE_LABEL[t].plural}</Text>
                    <Text style={styles.count}>{c[COUNT_KEY[t]]}</Text>
                    <Text style={styles.chev}>›</Text>
                  </Pressable>
                ))}
                <View style={styles.row}>
                  <Text style={[text.body, { flex: 1 }]}>Drafts</Text>
                  <Text style={[styles.count, c.drafts ? styles.countStrong : null]}>{c.drafts}</Text>
                  <View style={{ width: 18 }} />
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.kasumi },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { ...text.h1, color: colors.ai },
  sub: { ...text.small, marginTop: spacing.xs, marginBottom: spacing.md },
  types: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  typeBtn: { flexGrow: 1, minWidth: "45%", minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.md },
  typeText: { color: colors.ai, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", minHeight: 44, borderTopWidth: 1, borderTopColor: colors.line, marginTop: spacing.xs },
  count: { ...text.body, color: colors.ai, fontWeight: "600", marginRight: spacing.sm },
  countStrong: { color: colors.ink, fontWeight: "700" },
  chev: { fontSize: 20, color: colors.ink2, width: 18, textAlign: "center" },
});
