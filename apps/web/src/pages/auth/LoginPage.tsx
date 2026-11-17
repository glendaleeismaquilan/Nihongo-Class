import { useState, useEffect, type FormEvent } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { useAuth } from "../../lib/auth";
import { Alert, Button, TextField } from "../../components/ui";
import { AuthLayout } from "./AuthLayout";
import { checkLockout, recordFailure, clearFailures, formatCountdown } from "../../lib/loginLockout";

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
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [showPassword, setShowPassword] = useState(false);
  const [capsOn, setCapsOn] = useState(false);

  // Countdown ticker when locked.
  useEffect(() => {
    if (!lockedUntil) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [lockedUntil]);
  useEffect(() => {
    if (lockedUntil && Date.now() >= lockedUntil) setLockedUntil(null);
  }, [now, lockedUntil]);

  if (!initializing && firebaseUser) return <Navigate to={next} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const existing = checkLockout(email);
    if (existing) { setLockedUntil(existing.until); return; }
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      clearFailures(email);
    } catch (err: any) {
      // FR-3.1.2: stay on the login screen; never reveal whether the email exists.
      const code = err?.code ?? "";
      const lock = recordFailure(email);
      if (lock) {
        setLockedUntil(lock.until);
        // The "Account temporarily locked" notice below counts down, so no second message here.
        setError(null);
      } else if (code === "auth/too-many-requests") setError("Too many sign-in attempts. Wait a few minutes, or reset your password.");
      else if (code === "auth/network-request-failed") setError("Couldn't reach the sign-in service. Check your connection and try again.");
      else if (code === "auth/user-disabled") setError("This account is disabled. Contact your school.");
      else setError("Email or password is incorrect.");
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    setError(null);
    setBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      const code = err?.code ?? "";
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        // User closed the popup — stay silent.
      } else if (code === "auth/account-exists-with-different-credential") {
        setError("This email is already registered with a password. Sign in with your password first.");
      } else if (code === "auth/user-disabled") {
        setError("This account is disabled. Contact your school.");
      } else {
        setError("Couldn't sign in with Google. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  const locked = lockedUntil && Date.now() < lockedUntil;
  const msLeft = lockedUntil ? Math.max(0, lockedUntil - now) : 0;

  return (
    <AuthLayout title="Sign in">
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {locked ? (
          <Alert tone="danger">Account temporarily locked. Try again in {formatCountdown(msLeft)}.</Alert>
        ) : null}
        <TextField label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={!!locked} />
        <div className="relative">
          <TextField
            label="Password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyUp={(e: any) => setCapsOn(e.getModifierState?.("CapsLock") ?? false)}
            required
            disabled={!!locked}
          />
          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-9 text-sm text-ink-2 hover:text-ink"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
          {capsOn ? (
            <p className="mt-1 text-xs text-amber-700" role="status">⚠ Caps Lock is on.</p>
          ) : null}
        </div>
        <Button type="submit" loading={busy} disabled={!!locked} className="mt-2 w-full">
          Sign in
        </Button>
      </form>

      <div className="my-4 flex items-center gap-3 text-sm text-ink-2">
        <div className="h-px flex-1 bg-line" />
        <span>or</span>
        <div className="h-px flex-1 bg-line" />
      </div>

      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={busy || !!locked}
        className="flex min-h-11 w-full items-center justify-center gap-3 rounded-paper border border-line bg-paper px-4 py-2 text-ink hover:bg-kasumi disabled:opacity-60"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#4285F4] text-xs font-black text-white">G</span>
        <span className="font-semibold">Sign in with Google</span>
      </button>

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
