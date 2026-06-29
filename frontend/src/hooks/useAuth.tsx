import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { clearCacheOnPermissionChange, clearSensitiveIndexedDbCaches, permissionScopeHash } from "../lib/cache/hrmCache";
import { invalidateReferenceDataCache } from "../lib/referenceDataCache";
import type { AuthUser, BootstrapStatus } from "../types/auth";

const TOKEN_KEY = "hrm_v2_token";
const USER_SECURITY_SIGNATURE_KEY = "hrm_v2_user_security_signature";

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  bootstrap: BootstrapStatus | null;
  loading: boolean;
  refreshBootstrap: () => Promise<BootstrapStatus>;
  login: (input: { email: string; password: string }) => Promise<AuthUser>;
  setupOwner: (input: { name: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [bootstrap, setBootstrap] = useState<BootstrapStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const bootstrapInflightRef = useRef<Promise<BootstrapStatus> | null>(null);
  const meInflightRef = useRef<{ token: string; promise: Promise<{ user: AuthUser }> } | null>(null);

  const persistSession = useCallback((nextToken: string, nextUser: AuthUser) => {
    const nextSignature = permissionScopeHash({ permissions: nextUser.permissions, roles: nextUser.roles, employeeId: nextUser.employee_id });
    const previousSignature = localStorage.getItem(USER_SECURITY_SIGNATURE_KEY);
    if (previousSignature && previousSignature !== nextSignature) {
      void clearCacheOnPermissionChange(nextUser.id);
      invalidateReferenceDataCache();
    }
    localStorage.setItem(TOKEN_KEY, nextToken);
    localStorage.setItem(USER_SECURITY_SIGNATURE_KEY, nextSignature);
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  const clearSession = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_SECURITY_SIGNATURE_KEY);
    void clearSensitiveIndexedDbCaches();
    invalidateReferenceDataCache();
    setToken(null);
    setUser(null);
  }, []);

  const refreshBootstrap = useCallback(async () => {
    bootstrapInflightRef.current ??= api.getBootstrapStatus().finally(() => {
      bootstrapInflightRef.current = null;
    });
    const status = await bootstrapInflightRef.current;
    setBootstrap(status);
    return status;
  }, []);

  const loadCurrentUser = useCallback((savedToken: string) => {
    if (meInflightRef.current?.token !== savedToken) {
      meInflightRef.current = {
        token: savedToken,
        promise: api.me(savedToken).finally(() => {
          if (meInflightRef.current?.token === savedToken) meInflightRef.current = null;
        })
      };
    }
    return meInflightRef.current.promise;
  }, []);

  useEffect(() => {
    let mounted = true;

    async function boot() {
      try {
        const status = await refreshBootstrap();
        if (!mounted) {
          return;
        }

        const savedToken = localStorage.getItem(TOKEN_KEY);
        if (savedToken && status.setup_completed) {
          try {
            const result = await loadCurrentUser(savedToken);
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
  }, [clearSession, loadCurrentUser, refreshBootstrap]);

  const login = useCallback(
    async (input: { email: string; password: string }) => {
      const result = await api.login(input);
      persistSession(result.token, result.user);
      return result.user;
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
