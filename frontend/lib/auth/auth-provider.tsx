"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { UserProfile } from "../../types/api";
import { api, ApiError } from "../api/client";

export type AuthState =
  | { readonly status: "loading" }
  | { readonly status: "anonymous" }
  | { readonly status: "authenticated"; readonly user: UserProfile }
  | { readonly status: "error"; readonly error: ApiError };

export interface AuthContextValue {
  readonly status: AuthState["status"];
  readonly user: UserProfile | null;
  readonly error: ApiError | null;
  readonly refresh: () => Promise<void>;
  readonly logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizeUnexpectedError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError({
    status: null,
    code: "UNEXPECTED_RESPONSE",
    message: "Unable to update authentication state.",
    category: "unexpected"
  });
}

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const [actionError, setActionError] = useState<ApiError | null>(null);

  const refresh = useCallback(async () => {
    setState({ status: "loading" });
    setActionError(null);

    try {
      const user = await api.users.getCurrent();
      setState({ status: "authenticated", user });
    } catch (error) {
      const apiError = normalizeUnexpectedError(error);
      setState(apiError.status === 401 ? { status: "anonymous" } : { status: "error", error: apiError });
    }
  }, []);

  const logout = useCallback(async () => {
    setActionError(null);
    try {
      await api.auth.logout();
      setState({ status: "anonymous" });
    } catch (error) {
      setActionError(normalizeUnexpectedError(error));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status,
      user: state.status === "authenticated" ? state.user : null,
      error: actionError ?? (state.status === "error" ? state.error : null),
      refresh,
      logout
    }),
    [actionError, logout, refresh, state]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider.");
  return context;
}
