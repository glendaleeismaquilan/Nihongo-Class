import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import type { NotificationDto, Page } from "@nihongo/shared";
import { api } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { Button, EmptyState, ErrorState, Loading, PageHeader, Panel } from "../../components/ui";

export function NotificationsPage() {
  const qc = useQueryClient();
  const q = useInfiniteQuery({
    queryKey: ["notifications", "list"],
    queryFn: ({ pageParam }) => api<Page<NotificationDto>>("/notifications", { query: { cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const markRead = useMutation({
    mutationFn: (body: { ids?: string[]; all?: boolean }) => api("/notifications/read", { body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const hasUnread = items.some((i) => !i.read);

  return (
    <>
      <PageHeader
        title="Notifications"
        actions={
          hasUnread ? (
            <Button variant="secondary" onClick={() => markRead.mutate({ all: true })} loading={markRead.isPending}>
              Mark all as read
            </Button>
          ) : null
        }
      />
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState>No notifications yet. Class updates, payment confirmations, and live class reminders will show up here.</EmptyState>
      ) : (
        <Panel as="div">
          <ul className="divide-y divide-line">
            {items.map((n) => (
              <li key={n.id} className="flex items-start gap-3 px-4 py-3">
                <span aria-hidden="true" className={`mt-2 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-ai"}`} />
                <div className="min-w-0 flex-1">
                  <p className={n.read ? "" : "font-medium"}>
                    {n.link ? (
                      <Link to={n.link} onClick={() => !n.read && markRead.mutate({ ids: [n.id] })}>
                        {n.title}
                      </Link>
                    ) : (
                      n.title
                    )}
                    {!n.read ? <span className="sr-only"> (unread)</span> : null}
                  </p>
                  {n.body ? <p className="text-ink-2">{n.body}</p> : null}
                  <p className="mt-0.5 text-sm text-ink-2">{formatDateTime(n.createdAt)}</p>
                </div>
                {!n.read ? (
                  <Button size="sm" variant="ghost" onClick={() => markRead.mutate({ ids: [n.id] })}>
                    Mark as read
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {q.hasNextPage ? (
        <Button variant="secondary" className="mt-4" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>
          Show older notifications
        </Button>
      ) : null}
    </>
  );
}
