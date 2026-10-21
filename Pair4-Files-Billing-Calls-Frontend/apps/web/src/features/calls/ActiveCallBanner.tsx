import { useNavigate } from "react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PLANS, type CallDto } from "@nihongo/shared";
import { api, ApiError, errorMessage } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { useNow } from "../../lib/useNow";
import { Button, ButtonLink, Icon, Panel, useToast } from "../../components/ui";

export const useActiveCall = (classId: string) =>
  useQuery({
    queryKey: ["class", classId, "call"],
    queryFn: () => api<{ call: CallDto | null }>(`/classes/${classId}/calls/active`).then((r) => r.call),
    refetchInterval: 15_000,
  });

export function formatCountdown(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The class's in-app video call: join it when one is running, or (staff)
 * start one. Calls last 5 minutes, or 15 when the host has Premium.
 */
export function ActiveCallBanner({ classId }: { classId: string }) {
  const me = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const now = useNow(1000);
  const q = useActiveCall(classId);
  const staff = me.role === "teacher" || me.role === "school_admin";
  const start = useMutation({
    mutationFn: () => api<CallDto>(`/classes/${classId}/calls`, { body: {} }),
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: ["class", classId, "call"] });
      navigate(`/call/${c.id}`);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "call_active") {
        void q.refetch();
        return;
      }
      toast(errorMessage(err), "danger");
    },
  });
  const call = q.data;
  if (call) {
    const left = new Date(call.endsAt).getTime() - now;
    return (
      <Panel className="mb-4 flex flex-col gap-3 border-ai px-4 py-3 sm:flex-row sm:items-center sm:justify-between" role="region" aria-label="Video call">
        <div className="flex items-center gap-3">
          <span className="relative flex size-3">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-matcha opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex size-3 rounded-full bg-matcha" />
          </span>
          <div>
            <p className="font-medium">
              {call.hostName ?? "Your teacher"} is in a video call
            </p>
            <p className="text-sm text-ink-2">
              {call.participantCount} in the call · {left > 0 ? `${formatCountdown(left)} left` : "ending"}
            </p>
          </div>
        </div>
        <ButtonLink to={`/call/${call.id}`} icon="video">
          Join call
        </ButtonLink>
      </Panel>
    );
  }
  if (!staff || q.isPending) return null;
  const minutes = Math.round((me.plan?.callLimitSeconds ?? PLANS.freeCallSeconds) / 60);
  return (
    <Panel className="mb-4 flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" role="region" aria-label="Video call">
      <div className="flex items-center gap-3">
        <Icon name="video" className="text-ink-2" />
        <div>
          <p className="font-medium">Quick video call</p>
          <p className="text-sm text-ink-2">
            Up to {PLANS.callMaxParticipants} people, {minutes} minutes.{" "}
            {me.role === "teacher" && !me.plan?.premium ? "Premium gives you 15 minutes." : ""}
          </p>
        </div>
      </div>
      <Button variant="secondary" icon="video" onClick={() => start.mutate()} loading={start.isPending}>
        Start call
      </Button>
    </Panel>
  );
}
