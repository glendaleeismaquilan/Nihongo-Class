import { useState } from "react";
import { sendEmailVerification, type User } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { useAuth } from "../../lib/auth";
import { Alert, Button } from "../../components/ui";
import { AuthLayout } from "./AuthLayout";

/** Email-and-password accounts must verify their email before using the app. Google sign-ins come verified. */
export function needsEmailVerification(user: User | null): boolean {
  return !!user && !user.emailVerified && user.providerData.some((p) => p.providerId === "password");
}

/** Shown by the route guards instead of the app until the signed-in email is verified. */
export function VerifyEmailPage() {
  const { firebaseUser, reloadUser, signOut } = useAuth();
  const [busy, setBusy] = useState<"check" | "send" | null>(null);
  const [note, setNote] = useState<{ tone: "danger" | "success"; text: string } | null>(null);
  const email = firebaseUser?.email ?? "your email";

  async function check() {
    setBusy("check");
    setNote(null);
    try {
      await reloadUser();
      if (!auth.currentUser?.emailVerified) {
        setNote({ tone: "danger", text: "Your email isn't verified yet. Open the link we sent, then try again." });
      }
    } catch {
      setNote({ tone: "danger", text: "Couldn't check right now. Check your connection and try again." });
    } finally {
      setBusy(null);
    }
  }

  async function resend() {
    if (!auth.currentUser) return;
    setBusy("send");
    setNote(null);
    try {
      await sendEmailVerification(auth.currentUser);
      setNote({ tone: "success", text: `We sent a new link to ${email}.` });
    } catch (err: any) {
      setNote({
        tone: "danger",
        text: err?.code === "auth/too-many-requests" ? "You've asked for too many links. Wait a few minutes." : "Couldn't send the email. Try again.",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <AuthLayout title="Verify your email">
      <div className="flex flex-col gap-4">
        {note ? <Alert tone={note.tone}>{note.text}</Alert> : null}
        <p>
          We sent a verification link to <strong>{email}</strong>. Open it to confirm this is your email, then come back here.
        </p>
        <Button onClick={check} loading={busy === "check"} disabled={busy === "send"} className="w-full">
          I've verified my email
        </Button>
        <Button variant="secondary" onClick={resend} loading={busy === "send"} disabled={busy === "check"} className="w-full">
          Resend link
        </Button>
        <Button variant="ghost" onClick={() => void signOut()} className="w-full">
          Sign out
        </Button>
      </div>
    </AuthLayout>
  );
}
