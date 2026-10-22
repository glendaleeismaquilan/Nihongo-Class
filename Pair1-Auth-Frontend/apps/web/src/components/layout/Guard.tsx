import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import type { Role } from "@nihongo/shared";
import { ROLE_HOME, useAuth } from "../../lib/auth";
import { Button, ErrorState, Spinner } from "../ui";

export function FullPageLoading() {
  return (
    <div role="status" className="flex min-h-dvh items-center justify-center gap-2 text-ink-2">
      <Spinner size={20} />
      <span>Loading…</span>
    </div>
  );
}

/**
 * FR-3.1.3: client-side route guard for UX. The API enforces roles on every
 * request regardless (decision 16).
 */
export function RequireRole({ role, children }: { role?: Role; children: ReactNode }) {
  const { firebaseUser, initializing, me, meError, meLoading, signOut, refreshMe } = useAuth();
  const location = useLocation();
  const here = location.pathname + location.search;

  if (initializing || meLoading) return <FullPageLoading />;
  if (!firebaseUser) return <Navigate to={`/login?next=${encodeURIComponent(here)}`} replace />;
  if (meError?.code === "profile_missing") return <Navigate to="/signup/finish" replace />;
  if (meError || !me) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <ErrorState error={meError ?? new Error("Couldn't load your account.")} retry={() => void refreshMe()} />
        <Button variant="ghost" className="mt-4" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    );
  }
  if (!me.privacyConsentAt) return <Navigate to="/consent" state={{ next: here }} replace />;
  if (role && me.role !== role) return <Navigate to={ROLE_HOME[me.role]} replace />;
  return <>{children}</>;
}

export function HomeRedirect() {
  const { firebaseUser, initializing, me, meLoading, meError } = useAuth();
  if (initializing || meLoading) return <FullPageLoading />;
  if (!firebaseUser) return <Navigate to="/login" replace />;
  if (meError?.code === "profile_missing") return <Navigate to="/signup/finish" replace />;
  if (!me) return <RequireRole>{null}</RequireRole>;
  if (me.role === "student" && !me.studyLevel) return <Navigate to="/s/choose-level" replace />;
  return <Navigate to={ROLE_HOME[me.role]} replace />;
}
