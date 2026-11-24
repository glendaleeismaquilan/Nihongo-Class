import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { api, errorMessage } from "../lib/api";
import { FullPageLoading } from "../components/layout/Guard";

/**
 * Google sends the person here after "Connect Google" when GOOGLE_OAUTH_REDIRECT_URI
 * points at the website (the hosted site, whose API sits behind the ngrok tunnel).
 * The page hands Google's answer to the API, then opens the settings page it names.
 */
export function GoogleCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // The state is single-use, so send it once even when React runs effects twice.
    if (started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    const body: Record<string, string> = {};
    for (const key of ["state", "code", "error"]) {
      const value = params.get(key);
      if (value) body[key] = value;
    }
    api<{ redirect: string }>("/integrations/google/complete", { body })
      .then(({ redirect }) => {
        const to = new URL(redirect);
        navigate(to.pathname + to.search, { replace: true });
      })
      .catch((err) => setError(errorMessage(err)));
  }, [navigate]);

  if (!error) return <FullPageLoading />;
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-xl font-semibold">Couldn't finish connecting Google</h1>
      <p className="mt-2 text-ink-2">{error}</p>
      <Link className="mt-4 inline-block underline" to="/">
        Back to Nihongo Class
      </Link>
    </main>
  );
}
