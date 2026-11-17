import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { onIdTokenChanged, signOut as fbSignOut, type User } from "firebase/auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { MeDto, Role } from "@nihongo/shared";
import { auth } from "./firebase";
import { api, ApiError } from "./api";

interface AuthState {
  firebaseUser: User | null;
  initializing: boolean;
  me: MeDto | null;
  meError: ApiError | null;
  meLoading: boolean;
  refreshMe: () => Promise<unknown>;
  /** Re-reads the Firebase user, so a newly verified email is seen without signing in again. */
  reloadUser: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(auth.currentUser);
  const [initializing, setInitializing] = useState(true);
  // Firebase keeps the same User object when it reloads it, so this bumps the context instead.
  const [userVersion, setUserVersion] = useState(0);
  const qc = useQueryClient();

  useEffect(
    () =>
      onIdTokenChanged(auth, (u) => {
        setFirebaseUser(u);
        setInitializing(false);
      }),
    [],
  );

  const meQuery = useQuery({
    queryKey: ["me", firebaseUser?.uid],
    queryFn: () => api<MeDto>("/me"),
    enabled: !!firebaseUser,
    retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    staleTime: 60_000,
  });

  const value = useMemo<AuthState>(
    () => ({
      firebaseUser,
      initializing,
      me: firebaseUser ? (meQuery.data ?? null) : null,
      meError: meQuery.error instanceof ApiError ? meQuery.error : null,
      meLoading: !!firebaseUser && meQuery.isPending,
      refreshMe: () => meQuery.refetch(),
      reloadUser: async () => {
        await auth.currentUser?.reload();
        await auth.currentUser?.getIdToken(true);
        setUserVersion((v) => v + 1);
      },
      signOut: async () => {
        await fbSignOut(auth);
        qc.clear();
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- userVersion re-renders after reloadUser()
    [firebaseUser, initializing, meQuery, qc, userVersion],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}

/** The signed-in user's profile. Only use under a route guard. */
export function useMe(): MeDto {
  const { me } = useAuth();
  if (!me) throw new Error("useMe without a signed-in user");
  return me;
}

export const ROLE_HOME: Record<Role, string> = {
  student: "/s",
  teacher: "/t",
  content_admin: "/c",
  school_admin: "/a",
};

export const ROLE_LABEL: Record<Role, string> = {
  student: "Student",
  teacher: "Teacher",
  content_admin: "Content admin",
  school_admin: "School admin",
};
