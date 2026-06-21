import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import type { AuthUser, BootstrapStatus } from "../types/auth";

const TOKEN_KEY = "hrm_v2_token";

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  bootstrap: BootstrapStatus | null;
  loading: boolean;
  refreshBootstrap: () => Promise<BootstrapStatus>;
  login: (input: { email: string; password: string }) => Promise<void>;
  setupOwner: (input: { name: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [bootstrap, setBootstrap] = useState<BootstrapStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const persistSession = useCallback((nextToken: string, nextUser: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, nextToken);
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const refreshBootstrap = useCallback(async () => {
    const status = await api.getBootstrapStatus();
    setBootstrap(status);
    return status;
  }, []);

  useEffect(() => {
    let mounted = true;

    async function boot() {
      try {
        const status = await api.getBootstrapStatus();
        if (!mounted) {
          return;
        }
        setBootstrap(status);

        const savedToken = localStorage.getItem(TOKEN_KEY);
        if (savedToken && status.setup_completed) {
          try {
            const result = await api.me(savedToken);
            if (mounted) {
              setToken(savedToken);
              setUser(result.user);
            }
          } catch {
            if (mounted) {
              clearSession();
            }
          }
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void boot();
    return () => {
      mounted = false;
    };
  }, [clearSession]);

  const login = useCallback(
    async (input: { email: string; password: string }) => {
      const result = await api.login(input);
      persistSession(result.token, result.user);
    },
    [persistSession]
  );

  const setupOwner = useCallback(
    async (input: { name: string; email: string; password: string }) => {
      const result = await api.createOwner(input);
      persistSession(result.token, result.user);
      await refreshBootstrap();
    },
    [persistSession, refreshBootstrap]
  );

  const logout = useCallback(async () => {
    const currentToken = localStorage.getItem(TOKEN_KEY);
    clearSession();
    if (currentToken) {
      try {
        await api.logout(currentToken);
      } catch {
        // Local cleanup is enough for the stateless token flow.
      }
    }
  }, [clearSession]);

  const value = useMemo(
    () => ({ token, user, bootstrap, loading, refreshBootstrap, login, setupOwner, logout }),
    [token, user, bootstrap, loading, refreshBootstrap, login, setupOwner, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }
  return context;
}
