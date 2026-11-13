// Notifications for every role (mirror of apps/web/src/pages/common/NotificationsPage.tsx):
// paged 30 at a time with "Show older", mark one or all as read, and links open
// the matching screen for the signed-in role.
import { View, Text, FlatList, Pressable, ActivityIndicator, StyleSheet, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { useAuth } from "../../context/AuthContext";
import { navigateFromNotificationLink } from "../../lib/notificationLink";
import { useToast } from "../../components/Toast";
import { Loading, ErrorState, EmptyState } from "../../components/QueryState";
import { colors, spacing, text } from "../../styles/theme";

export function NotificationsScreen({ navigation }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { me } = useAuth();
  const q = useInfiniteQuery({
    queryKey: ["notifications", "list"],
    queryFn: ({ pageParam }) => api("/notifications", { query: { cursor: pageParam } }),
    initialPageParam: undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const markRead = useMutation({
    mutationFn: (body) => api("/notifications/read", { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
    onError: (err) => toast.error(errorMessage(err)),
  });

  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const hasUnread = items.some((n) => !n.read);

  function open(n) {
    if (!n.read) markRead.mutate({ ids: [n.id] });
    // Navigate from the tab navigator so the right tab's stack opens the screen.
    navigateFromNotificationLink(navigation?.getParent?.() ?? navigation, n.link, me?.role);
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Notifications</Text>
        {hasUnread ? (
          <Pressable style={styles.headerBtn} onPress={() => markRead.mutate({ all: true })} disabled={markRead.isPending} accessibilityRole="button">
            {markRead.isPending ? <ActivityIndicator color={colors.ai} /> : <Text style={styles.link}>Mark all as read</Text>}
          </Pressable>
        ) : null}
      </View>

      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={q.refetch} />
      ) : items.length === 0 ? (
        <EmptyState>No notifications yet. Class updates, payment confirmations, and live class reminders will show up here.</EmptyState>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={q.refetch} />}
          contentContainerStyle={{ padding: spacing.md }}
          renderItem={({ item: n }) => (
            <View style={[styles.row, !n.read && styles.rowUnread]}>
              <View style={[styles.dot, n.read && styles.dotRead]} />
              <View style={{ flex: 1 }}>
                {n.link ? (
                  <Pressable onPress={() => open(n)} accessibilityRole="link" hitSlop={4}>
                    <Text style={[styles.rowTitle, styles.linkTitle, !n.read && styles.unreadTitle]}>{n.title}{!n.read ? " (unread)" : ""}</Text>
                  </Pressable>
                ) : (
                  <Text style={[styles.rowTitle, !n.read && styles.unreadTitle]}>{n.title}</Text>
                )}
                {n.body ? <Text style={text.small}>{n.body}</Text> : null}
                <Text style={styles.rowTime}>{formatDateTime(n.createdAt)}</Text>
              </View>
              {!n.read ? (
                <Pressable style={styles.markBtn} onPress={() => markRead.mutate({ ids: [n.id] })} accessibilityRole="button">
                  <Text style={styles.markText}>Mark as read</Text>
                </Pressable>
              ) : null}
            </View>
          )}
          ListFooterComponent={
            q.hasNextPage ? (
              <Pressable style={styles.older} onPress={() => q.fetchNextPage()} disabled={q.isFetchingNextPage} accessibilityRole="button">
                {q.isFetchingNextPage ? <ActivityIndicator color={colors.ai} /> : <Text style={styles.link}>Show older notifications</Text>}
              </Pressable>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.kasumi },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.lg, paddingBottom: spacing.sm },
  title: { ...text.h1, color: colors.ai },
  headerBtn: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.sm },
  link: { color: colors.ai, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, backgroundColor: colors.paper, borderRadius: 10, padding: spacing.md, marginBottom: spacing.sm },
  rowUnread: { backgroundColor: "#eff6ff" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.ai, marginTop: 8 },
  dotRead: { backgroundColor: "transparent" },
  rowTitle: { ...text.body },
  linkTitle: { color: colors.ai, textDecorationLine: "underline" },
  unreadTitle: { fontWeight: "600" },
  rowTime: { ...text.small, marginTop: 2 },
  markBtn: { minHeight: 44, justifyContent: "center" },
  markText: { color: colors.ai, fontSize: 13 },
  older: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: spacing.sm, borderWidth: 1, borderColor: colors.line, borderRadius: 10, backgroundColor: colors.paper },
});
