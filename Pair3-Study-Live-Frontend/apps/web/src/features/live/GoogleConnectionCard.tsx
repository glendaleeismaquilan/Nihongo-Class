import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError, errorMessage } from "../../lib/api";
import { useMe } from "../../lib/auth";
import { Alert, Badge, Button, Panel, SectionTitle, useToast } from "../../components/ui";

const RESULT_MESSAGE: Record<string, { tone: "success" | "danger" | "info"; text: string }> = {
  connected: { tone: "success", text: "Google is connected. New live classes get a Meet link automatically." },
  denied: { tone: "info", text: "You didn't allow access, so Google isn't connected." },
  expired: { tone: "danger", text: "That sign-in took too long. Try connecting again." },
  error: { tone: "danger", text: "Google didn't finish connecting. Try again." },
};

/** FR-3.11.1: connect and disconnect Google, and see which account is connected. */
export function GoogleConnectionCard() {
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const result = params.get("google");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();
  const toast = useToast();

  useEffect(() => {
    if (result) void qc.invalidateQueries({ queryKey: ["me"] });
  }, [result, qc]);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await api<{ url: string }>("/integrations/google/connect");
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof ApiError && err.code === "google_not_configured" ? "Automatic Meet links aren't set up for this app yet. You can still schedule live classes with a pasted Meet link." : errorMessage(err));
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await api("/integrations/google", { method: "DELETE" });
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast("Google disconnected");
    } catch (err) {
      toast(errorMessage(err), "danger");
    } finally {
      setBusy(false);
    }
  }

  const g = me.google;
  return (
    <Panel className="mb-6 max-w-xl px-5 py-5">
      <SectionTitle>Google Calendar and Meet</SectionTitle>
      {result && RESULT_MESSAGE[result] ? (
        <div className="mb-3">
          <Alert tone={RESULT_MESSAGE[result].tone}>
            {RESULT_MESSAGE[result].text}{" "}
            <button type="button" className="underline" onClick={() => setParams({}, { replace: true })}>
              Dismiss
            </button>
          </Alert>
        </div>
      ) : null}
      {error ? (
        <div className="mb-3">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}
      {g ? (
        <>
          <p className="flex flex-wrap items-center gap-2">
            Connected as <span className="font-medium">{g.googleEmail}</span>
            {g.status === "connected" ? <Badge tone="success">Connected</Badge> : <Badge tone="danger">Needs reconnect</Badge>}
          </p>
          {g.status === "needs_reconnect" ? (
            <p className="mt-2 text-ink-2">Google stopped accepting the app's access. Reconnect so new live classes get Meet links automatically; until then, paste a link when you schedule.</p>
          ) : (
            <p className="mt-2 text-ink-2">Live classes you schedule create a Google Calendar event with a Meet link, and can send invites to your students.</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {g.status === "needs_reconnect" ? (
              <Button onClick={connect} loading={busy}>
                Reconnect Google
              </Button>
            ) : null}
            <Button variant="secondary" onClick={disconnect} disabled={busy}>
              Disconnect
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-ink-2">Connect your Google account to create Meet links and calendar invites automatically. Without it, you paste a Meet link when you schedule.</p>
          <Button className="mt-4" onClick={connect} loading={busy}>
            Connect Google
          </Button>
        </>
      )}
    </Panel>
  );
}
