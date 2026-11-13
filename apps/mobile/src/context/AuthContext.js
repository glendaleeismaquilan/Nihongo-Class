// Mirrors apps/web/src/lib/auth.tsx: Firebase handles sign-in, the profile comes
// from GET /me (keyed by uid), and signing out — or the signed-in account
// changing any other way — clears every cached query so the next account never
// sees the previous one's data.
import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { AppState } from "react-native";
import { onIdTokenChanged, signOut as fbSignOut } from "firebase/auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { auth } from "../config/firebase";
import { api, ApiError, setOnUnauthorized } from "../lib/api";
import { useToast } from "../components/Toast";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(auth.currentUser);
  const [initializing, setInitializing] = useState(true);
  // True while sign-up creates the Firebase account and registers the profile:
  // /me waits, so it can't cache "profile missing" in between.
  const [registering, setRegistering] = useState(false);
  const qc = useQueryClient();
  const uidRef = useRef(auth.currentUser?.uid ?? null);

  useEffect(
    () =>
      onIdTokenChanged(auth, (u) => {
        const uid = u?.uid ?? null;
        if (uidRef.current !== uid) qc.clear();
        uidRef.current = uid;
        setFirebaseUser(u);
        setInitializing(false);
      }),
    [qc],
  );

  const meQuery = useQuery({
    queryKey: ["me", firebaseUser?.uid],
    queryFn: () => api("/me"),
    enabled: !!firebaseUser && !registering,
    retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    staleTime: 60_000,
  });

  // Re-read the profile (role, Premium) and billing whenever the app comes back
  // to the foreground — a payment may have finished in the browser meanwhile.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && auth.currentUser) {
        qc.invalidateQueries({ queryKey: ["me"] });
        qc.invalidateQueries({ queryKey: ["billing"] });
      }
    });
    return () => sub.remove();
  }, [qc]);

  const signOut = useCallback(async () => {
    await fbSignOut(auth);
    qc.clear();
  }, [qc]);

  /**
   * Runs `create` (which creates or signs in the Firebase account and returns its
   * uid), then POST /auth/register, then loads /me fresh — mirroring
   * SignupPage.tsx. The sign-up screen stays up until the profile exists.
   */
  const registerProfile = useCallback(
    async (create, body) => {
      setRegistering(true);
      try {
        const uid = await create();
        await api("/auth/register", { body });
        await qc.cancelQueries({ queryKey: ["me", uid] });
        await qc.fetchQuery({ queryKey: ["me", uid], queryFn: () => api("/me"), staleTime: 0 });
      } finally {
        setRegistering(false);
      }
    },
    [qc],
  );

  // Sign the user out when any API call answers 401. Debounced with a ref so a
  // page of parallel queries doesn't raise a flood of toasts.
  const toast = useToast();
  const kickedRef = useRef(false);
  useEffect(() => {
    setOnUnauthorized(() => {
      if (kickedRef.current || !auth.currentUser) return;
      kickedRef.current = true;
      toast.error("Your session expired. Please sign in again.");
      signOut().finally(() => { kickedRef.current = false; });
    });
    return () => setOnUnauthorized(null);
  }, [signOut, toast]);

  // A server answer (disabled account, profile missing) always counts. A network
  // failure while refreshing a profile we already have doesn't eject the user —
  // each screen shows its own "couldn't reach the server" state instead.
  const rawError = meQuery.error ? (meQuery.error instanceof ApiError ? meQuery.error : new ApiError(0, "unknown", meQuery.error.message)) : null;
  const meError = rawError && !(rawError.code === "network" && meQuery.data) ? rawError : null;

  const value = useMemo(
    () => ({
      firebaseUser,
      initializing,
      me: firebaseUser ? (meQuery.data ?? null) : null,
      meError,
      meLoading: !!firebaseUser && !registering && meQuery.isPending,
      registering,
      refreshMe: () => meQuery.refetch(),
      registerProfile,
      signOut,
    }),
    [firebaseUser, initializing, registering, meQuery, meError, registerProfile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth must be used inside an AuthProvider");
  return v;
}
