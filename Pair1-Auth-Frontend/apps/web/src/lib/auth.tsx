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
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(auth.currentUser);
  const [initializing, setInitializing] = useState(true);
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
      signOut: async () => {
        await fbSignOut(auth);
        qc.clear();
      },
    }),
    [firebaseUser, initializing, meQuery, qc],
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
