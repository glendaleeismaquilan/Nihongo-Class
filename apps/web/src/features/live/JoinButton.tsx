import { JOIN_OPENS_MINUTES_BEFORE, type LiveSessionDto } from "@nihongo/shared";
import { apiUrl } from "../../lib/api";
import { auth } from "../../lib/firebase";
import { formatTime } from "../../lib/format";
import { useNow } from "../../lib/useNow";
import { Button } from "../../components/ui";

export function joinState(s: LiveSessionDto, now: number): "open" | "early" | "over" | "cancelled" {
  if (s.status === "cancelled") return "cancelled";
  const start = new Date(s.startAt).getTime();
  const end = new Date(s.endAt).getTime();
  if (s.status === "completed" || now > end) return "over";
  return now >= start - JOIN_OPENS_MINUTES_BEFORE * 60_000 ? "open" : "early";
}

/**
 * FR-3.11.7 / FR-3.11.8: enabled from 15 minutes before the start until the
 * end. Opens Meet synchronously (so popup blockers allow it), then records
 * the check-in with fetch keepalive.
 */
export function JoinButton({ session, size = "md" }: { session: LiveSessionDto; size?: "md" | "sm" }) {
  const now = useNow(15_000);
  const state = joinState(session, now);
  if (state === "over" || state === "cancelled" || !session.meetUrl) return null;
  if (state === "early") {
    return (
      <Button size={size} variant="secondary" disabled>
        Join opens at {formatTime(new Date(new Date(session.startAt).getTime() - JOIN_OPENS_MINUTES_BEFORE * 60_000).toISOString())}
      </Button>
    );
  }
  return (
    <Button
      size={size}
      icon="video"
      onClick={() => {
        window.open(session.meetUrl, "_blank", "noopener,noreferrer");
        void auth.currentUser?.getIdToken().then((token) =>
          fetch(apiUrl(`/sessions/${session.id}/check-in`), { method: "POST", keepalive: true, headers: { Authorization: `Bearer ${token}` } }).catch(() => undefined),
        );
      }}
    >
      Join on Google Meet
    </Button>
  );
}
