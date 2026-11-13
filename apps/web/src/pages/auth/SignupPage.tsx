import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { useQueryClient } from "@tanstack/react-query";
import type { MeDto } from "@nihongo/shared";
import { auth } from "../../lib/firebase";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { viewerTimeZone } from "../../lib/format";
import { Alert, Button, Checkbox, TextField } from "../../components/ui";
import { PasswordStrength, scorePassword } from "../../components/PasswordStrength";
import { AuthLayout, PrivacyNotice } from "./AuthLayout";
import { safeNext } from "./LoginPage";

/** FR-3.1.1: students sign themselves up. */
export function SignupPage() {
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showPassword, setShowPassword] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Enter your name.";
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) errs.email = "Enter a valid email address.";
    if (password.length < 8) errs.password = "Use at least 8 characters.";
    else if (scorePassword(password).score < 2) errs.password = "Make it stronger — mix in upper/lowercase, numbers, or symbols.";
    if (!consent) errs.consent = "Accept the privacy notice to create an account.";
    setErrors(errs);
    setFormError(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await api("/auth/register", { body: { name: name.trim(), privacyConsent: true, timeZone: viewerTimeZone() } });
      // The auth listener may already have asked for /me before the profile existed.
      // Cancel that request and load /me again, so "profile missing" isn't cached.
      await qc.cancelQueries({ queryKey: ["me", user.uid] });
      await qc.fetchQuery({ queryKey: ["me", user.uid], queryFn: () => api<MeDto>("/me"), staleTime: 0 });
      navigate(next === "/" ? "/s/choose-level" : next, { replace: true });
    } catch (err: any) {
      if (err instanceof ApiError) setFormError(err.message);
      else if (err?.code === "auth/email-already-in-use") setErrors({ email: "An account with this email already exists. Sign in instead." });
      else if (err?.code === "auth/weak-password") setErrors({ password: "Choose a stronger password." });
      else if (err?.code === "auth/invalid-email") setErrors({ email: "Enter a valid email address." });
      else setFormError("Couldn't create the account. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function signUpWithGoogle() {
    if (!consent) { setErrors({ consent: "Accept the privacy notice to continue with Google." }); return; }
    setFormError(null);
    setBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const { user } = await signInWithPopup(auth, provider);
      // Register the student profile; the server accepts the Google displayName when name is blank.
      try {
        await api("/auth/register", { body: { name: (user.displayName ?? name).trim() || "Student", privacyConsent: true, timeZone: viewerTimeZone() } });
      } catch (err) {
        // 409 "already registered" is fine when the user had signed up before.
        if (!(err instanceof ApiError) || err.code !== "already_registered") throw err;
      }
      await qc.cancelQueries({ queryKey: ["me", user.uid] });
      await qc.fetchQuery({ queryKey: ["me", user.uid], queryFn: () => api<MeDto>("/me"), staleTime: 0 });
      navigate(next === "/" ? "/s/choose-level" : next, { replace: true });
    } catch (err: any) {
      const code = err?.code ?? "";
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        // User closed — stay silent.
      } else {
        setFormError("Couldn't sign up with Google. Try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Create a student account" wide>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {formError ? <Alert tone="danger">{formError}</Alert> : null}
        <TextField label="Your name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} required />
        <TextField label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} required />
        <div className="relative">
          <TextField
            label="Password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            hint="At least 8 characters."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            required
          />
          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-9 text-sm text-ink-2 hover:text-ink"
          >
            {showPassword ? "Hide" : "Show"}
          </button>
          <PasswordStrength password={password} />
        </div>
        <PrivacyNotice />
        <Checkbox label="I have read the privacy notice and agree to it." checked={consent} onChange={(e) => setConsent(e.target.checked)} error={errors.consent} />
        <Button type="submit" loading={busy} className="w-full">
          Create account
        </Button>
      </form>

      <div className="my-4 flex items-center gap-3 text-sm text-ink-2">
        <div className="h-px flex-1 bg-line" />
        <span>or</span>
        <div className="h-px flex-1 bg-line" />
      </div>

      <button
        type="button"
        onClick={signUpWithGoogle}
        disabled={busy}
        className="flex min-h-11 w-full items-center justify-center gap-3 rounded-paper border border-line bg-paper px-4 py-2 text-ink hover:bg-kasumi disabled:opacity-60"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#4285F4] text-xs font-black text-white">G</span>
        <span className="font-semibold">Sign up with Google</span>
      </button>

      <p className="mt-6 text-sm text-ink-2">
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </AuthLayout>
  );
}

/** For a Firebase account whose profile wasn't created (register call failed). */
export function FinishSignupPage() {
  const { refreshMe, signOut, firebaseUser } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(firebaseUser?.displayName ?? "");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !consent) {
      setError(!name.trim() ? "Enter your name." : "Accept the privacy notice to continue.");
      return;
    }
    setBusy(true);
    try {
      await api("/auth/register", { body: { name: name.trim(), privacyConsent: true, timeZone: viewerTimeZone() } });
      await refreshMe();
      navigate("/s/choose-level", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't finish sign-up. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Finish creating your account" wide>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <TextField label="Your name" value={name} onChange={(e) => setName(e.target.value)} required />
        <PrivacyNotice />
        <Checkbox label="I have read the privacy notice and agree to it." checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <Button type="submit" loading={busy}>
          Continue
        </Button>
        <Button variant="ghost" onClick={() => void signOut()}>
          Sign out
        </Button>
      </form>
    </AuthLayout>
  );
}
