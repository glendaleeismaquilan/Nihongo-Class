import { useState, type FormEvent } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { useAuth } from "../../lib/auth";
import { Alert, Button, TextField } from "../../components/ui";
import { AuthLayout } from "./AuthLayout";

export function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export function LoginPage() {
  const { firebaseUser, initializing } = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!initializing && firebaseUser) return <Navigate to={next} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err: any) {
      // FR-3.1.2: stay on the login screen; never reveal whether the email exists.
      const code = err?.code ?? "";
      if (code === "auth/too-many-requests") setError("Too many sign-in attempts. Wait a few minutes, or reset your password.");
      else if (code === "auth/network-request-failed") setError("Couldn't reach the sign-in service. Check your connection and try again.");
      else if (code === "auth/user-disabled") setError("This account is disabled. Contact your school.");
      else setError("Email or password is incorrect.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Sign in">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <TextField label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <Button type="submit" loading={busy} className="mt-2 w-full">
          Sign in
        </Button>
      </form>
      <div className="mt-6 flex flex-col gap-2 text-sm">
        <Link to="/reset-password" className="min-h-11 py-2">
          Forgot your password?
        </Link>
        <p className="text-ink-2">
          New student?{" "}
          <Link to={`/signup${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`}>Create an account</Link>
        </p>
      </div>
    </AuthLayout>
  );
}
