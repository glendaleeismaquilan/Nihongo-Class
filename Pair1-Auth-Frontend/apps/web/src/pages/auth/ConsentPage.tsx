import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { api, errorMessage } from "../../lib/api";
import { ROLE_HOME, useAuth } from "../../lib/auth";
import { Alert, Button, Checkbox } from "../../components/ui";
import { AuthLayout, PrivacyNotice } from "./AuthLayout";

/** RA 10173: first login of an admin-created account shows the notice with a required checkbox. */
export function ConsentPage() {
  const { me, refreshMe, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!me) return <Navigate to="/login" replace />;
  if (me.privacyConsentAt) return <Navigate to={ROLE_HOME[me.role]} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!consent) {
      setError("Accept the privacy notice to continue.");
      return;
    }
    setBusy(true);
    try {
      await api("/me", { method: "PATCH", body: { privacyConsent: true } });
      await refreshMe();
      const next = (location.state as { next?: string } | null)?.next;
      navigate(next ?? ROLE_HOME[me!.role], { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout title={`Welcome, ${me.name}`} wide>
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <p className="text-ink-2">{me.school ? `${me.school.name} created your account.` : "Before you continue:"} Read how we use your information.</p>
        <PrivacyNotice />
        <Checkbox label="I have read the privacy notice and agree to it." checked={consent} onChange={(e) => setConsent(e.target.checked)} error={error} />
        <Button type="submit" loading={busy}>
          Continue
        </Button>
        <Button variant="ghost" onClick={() => void signOut()}>
          Sign out
        </Button>
        {error && consent ? <Alert tone="danger">{error}</Alert> : null}
      </form>
    </AuthLayout>
  );
}
