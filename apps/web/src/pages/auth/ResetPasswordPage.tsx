import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { Alert, Button, TextField } from "../../components/ui";
import { AuthLayout } from "./AuthLayout";
import { clearFailures } from "../../lib/loginLockout";

/** FR-3.1.1 password reset. The message is the same whether or not the email exists (FR-3.1.2). */
export function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await sendPasswordResetEmail(auth, email.trim(), { url: `${window.location.origin}/login` });
      // Asking for a reset clears any client-side lockout on this email — a locked
      // user often reaches this page to recover.
      clearFailures(email);
    } catch (err: any) {
      if (err?.code === "auth/network-request-failed") {
        setError("Couldn't reach the sign-in service. Check your connection and try again.");
        setBusy(false);
        return;
      }
    }
    setBusy(false);
    setSent(true);
  }

  return (
    <AuthLayout title="Reset your password">
      {sent ? (
        <Alert tone="success">If an account exists for {email.trim()}, we sent it a link to set a new password. Check your inbox.</Alert>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <TextField label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error} required />
          <Button type="submit" loading={busy}>
            Send reset link
          </Button>
        </form>
      )}
      <p className="mt-6 text-sm">
        <Link to="/login">Back to sign in</Link>
      </p>
    </AuthLayout>
  );
}
