// Shown in the app shell when the current user hasn't verified their email yet.
// Google sign-ins come pre-verified so this stays hidden for them.
import { useState } from "react";
import { sendEmailVerification } from "firebase/auth";
import { useAuth } from "../lib/auth";
import { useToast } from "./ui";

export function EmailVerificationBanner() {
  const { firebaseUser } = useAuth();
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  if (!firebaseUser || firebaseUser.emailVerified) return null;
  const isPassword = firebaseUser.providerData?.some((p) => p.providerId === "password");
  if (!isPassword) return null;

  async function resend() {
    if (!firebaseUser) return;
    setSending(true);
    try {
      await sendEmailVerification(firebaseUser);
      setSent(true);
      toast("Verification email sent. Check your inbox.");
    } catch (err: any) {
      const code = err?.code ?? "";
      if (code === "auth/too-many-requests") toast("You've asked for too many. Wait a few minutes.", "danger");
      else toast("Couldn't send the email. Try again.", "danger");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-4 mt-4 flex items-center gap-3 rounded-paper border border-amber-300 bg-amber-100 px-4 py-3 text-sm text-amber-900">
      <span aria-hidden>✉️</span>
      <div className="flex-1">
        <p className="font-semibold">Verify your email</p>
        <p className="text-amber-800">We sent a verification link to {firebaseUser.email}. Click it to confirm you own this address.</p>
      </div>
      <button
        type="button"
        onClick={resend}
        disabled={sending || sent}
        className="rounded-control border border-amber-600 bg-white px-3 py-1 font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-60"
      >
        {sending ? "Sending…" : sent ? "Sent ✓" : "Resend"}
      </button>
    </div>
  );
}
