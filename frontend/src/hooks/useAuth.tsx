import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { authApi } from "../lib/authApi";
import { clearCacheOnPermissionChange, clearSensitiveIndexedDbCaches, permissionScopeHash } from "../lib/cache/hrmCache";
import { broadcastSessionEvent, subscribeCrossTabSessionEvents } from "../lib/crossTabSync";
import { clearQueryCacheForSessionChange, queryClient } from "../lib/queryClient";
import { createPinVault, unlockPinVault, type PinVault } from "../lib/pinVault";
import { createQueryScope, queryKeys, queryScopeSignature } from "../lib/queryKeys";
import { invalidateReferenceDataCache } from "../lib/referenceDataCache";
import type { AuthUser, BootstrapStatus } from "../types/auth";

const TOKEN_KEY = "hrm_v2_token";
const USER_SECURITY_SIGNATURE_KEY = "hrm_v2_user_security_signature";
const USER_QUERY_SCOPE_SIGNATURE_KEY = "hrm_v2_query_scope_signature";
const PIN_VAULT_KEY = "hrm_v2_pin_vault";

export type PinUnlockResult = "unlocked" | "wrong-pin" | "expired";

function readPinVault(): PinVault | null {
  const raw = localStorage.getItem(PIN_VAULT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PinVault;
  } catch {
    return null;
  }
}

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  bootstrap: BootstrapStatus | null;
  loading: boolean;
  locked: boolean;
  pinVaultEmail: string | null;
  pinSetupPending: boolean;
  refreshBootstrap: () => Promise<BootstrapStatus>;
  login: (input: { email: string; password: string; rememberMe?: boolean }) => Promise<AuthUser>;
  setupOwner: (input: { name: string; email: string; password: string }) => Promise<void>;
  refreshCurrentUser: () => Promise<AuthUser | null>;
  logout: () => Promise<void>;
  setupPin: (pin: string) => Promise<void>;
  dismissPinSetup: () => void;
  unlockWithPin: (pin: string) => Promise<{ status: PinUnlockResult; user?: AuthUser }>;
  lock: () => void;
  clearPinVault: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [bootstrap, setBootstrap] = useState<BootstrapStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [pinVault, setPinVaultState] = useState<PinVault | null>(() => readPinVault());
  const [locked, setLocked] = useState(() => Boolean(readPinVault()) && !localStorage.getItem(TOKEN_KEY));
  const [pinSetupPending, setPinSetupPending] = useState(false);
  const bootstrapInflightRef = useRef<Promise<BootstrapStatus> | null>(null);
  const meInflightRef = useRef<{ token: string; promise: Promise<{ user: AuthUser }> } | null>(null);

  const persistVault = useCallback((vault: PinVault | null) => {
    if (vault) localStorage.setItem(PIN_VAULT_KEY, JSON.stringify(vault));
    else localStorage.removeItem(PIN_VAULT_KEY);
    setPinVaultState(vault);
  }, []);

  const persistSession = useCallback((nextToken: string, nextUser: AuthUser, options: { keepPlaintext?: boolean } = {}) => {
    const nextSignature = permissionScopeHash({ permissions: nextUser.permissions, roles: nextUser.roles, employeeId: nextUser.employee_id });
    const previousSignature = localStorage.getItem(USER_SECURITY_SIGNATURE_KEY);
    const nextQueryScopeSignature = queryScopeSignature(nextToken, nextUser);
    const previousQueryScopeSignature = localStorage.getItem(USER_QUERY_SCOPE_SIGNATURE_KEY);
    if (previousSignature && previousSignature !== nextSignature) {
      void clearCacheOnPermissionChange(nextUser.id);
      clearQueryCacheForSessionChange("permission-change");
      invalidateReferenceDataCache();
    }
    if (previousQueryScopeSignature && previousQueryScopeSignature !== nextQueryScopeSignature) {
      clearQueryCacheForSessionChange("scope-change");
      invalidateReferenceDataCache();
      broadcastSessionEvent("scope-change", nextQueryScopeSignature);
    }
    const keepPlaintext = options.keepPlaintext ?? true;
    if (keepPlaintext) localStorage.setItem(TOKEN_KEY, nextToken);
    else localStorage.removeItem(TOKEN_KEY);
    localStorage.setItem(USER_SECURITY_SIGNATURE_KEY, nextSignature);
    localStorage.setItem(USER_QUERY_SCOPE_SIGNATURE_KEY, nextQueryScopeSignature);
    setToken(nextToken);
    setUser(nextUser);
    setLocked(false);
    const scope = createQueryScope(nextToken, nextUser);
    queryClient.setQueryData(queryKeys.auth.currentUser(scope), { user: nextUser });
    void import("../lib/preloadReferenceData").then(({ preloadGlobalReferenceData }) => {
      preloadGlobalReferenceData({ token: nextToken, user: nextUser });
    });
  }, []);

  const clearSession = useCallback((options: { broadcast?: boolean } = {}) => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_SECURITY_SIGNATURE_KEY);
    localStorage.removeItem(USER_QUERY_SCOPE_SIGNATURE_KEY);
    persistVault(null);
    setLocked(false);
    void clearSensitiveIndexedDbCaches();
    clearQueryCacheForSessionChange("logout");
    invalidateReferenceDataCache();
    setToken(null);
    setUser(null);
    if (options.broadcast !== false) broadcastSessionEvent("logout");
  }, []);

  useEffect(() => subscribeCrossTabSessionEvents((message) => {
    if (message.type === "logout") {
      clearSession({ broadcast: false });
      return;
    }
    if (message.type === "scope-change") {
      clearQueryCacheForSessionChange("scope-change");
      invalidateReferenceDataCache();
    }
  }), [clearSession]);

  const refreshBootstrap = useCallback(async () => {
    bootstrapInflightRef.current ??= authApi.getBootstrapStatus().finally(() => {
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
        promise: authApi.me(savedToken).finally(() => {
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
              persistSession(savedToken, result.user);
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
  }, [clearSession, loadCurrentUser, persistSession, refreshBootstrap]);

  const login = useCallback(
    async (input: { email: string; password: string; rememberMe?: boolean }) => {
      const result = await authApi.login(input);
      const staleVault = pinVault && pinVault.email !== result.user.email;
      if (staleVault) persistVault(null);
      persistSession(result.token, result.user);
      if (input.rememberMe && (staleVault || !pinVault)) setPinSetupPending(true);
      return result.user;
    },
    [persistSession, persistVault, pinVault]
  );

  const setupOwner = useCallback(
    async (input: { name: string; email: string; password: string }) => {
      const result = await authApi.createOwner(input);
      persistSession(result.token, result.user);
      await refreshBootstrap();
    },
    [persistSession, refreshBootstrap]
  );

  const refreshCurrentUser = useCallback(async () => {
    const currentToken = token ?? localStorage.getItem(TOKEN_KEY);
    if (!currentToken) {
      clearSession();
      return null;
    }
    try {
      const result = await loadCurrentUser(currentToken);
      persistSession(currentToken, result.user, { keepPlaintext: !pinVault });
      return result.user;
    } catch {
      clearSession();
      return null;
    }
  }, [clearSession, loadCurrentUser, persistSession, pinVault, token]);

  const logout = useCallback(async () => {
    const currentToken = token ?? localStorage.getItem(TOKEN_KEY);
    clearSession();
    if (currentToken) {
      try {
        await authApi.logout(currentToken);
      } catch {
        // Local cleanup is enough for the stateless token flow.
      }
    }
  }, [clearSession, token]);

  const setupPin = useCallback(
    async (pin: string) => {
      if (!token || !user) throw new Error("You must be signed in to set up a PIN.");
      const vault = await createPinVault(pin, user.email, token);
      persistVault(vault);
      localStorage.removeItem(TOKEN_KEY);
      setPinSetupPending(false);
    },
    [persistVault, token, user]
  );

  const dismissPinSetup = useCallback(() => {
    setPinSetupPending(false);
  }, []);

  const unlockWithPin = useCallback(
    async (pin: string): Promise<{ status: PinUnlockResult; user?: AuthUser }> => {
      if (!pinVault) return { status: "wrong-pin" };
      const recoveredToken = await unlockPinVault(pinVault, pin);
      if (!recoveredToken) return { status: "wrong-pin" };
      try {
        const result = await loadCurrentUser(recoveredToken);
        persistSession(recoveredToken, result.user, { keepPlaintext: false });
        return { status: "unlocked", user: result.user };
      } catch {
        persistVault(null);
        setLocked(false);
        return { status: "expired" };
      }
    },
    [loadCurrentUser, persistSession, persistVault, pinVault]
  );

  const lock = useCallback(() => {
    if (!pinVault) return;
    setToken(null);
    setUser(null);
    setLocked(true);
  }, [pinVault]);

  const clearPinVault = useCallback(() => {
    persistVault(null);
  }, [persistVault]);

  const value = useMemo(
    () => ({
      token,
      user,
      bootstrap,
      loading,
      locked,
      pinVaultEmail: pinVault?.email ?? null,
      pinSetupPending,
      refreshBootstrap,
      login,
      setupOwner,
      refreshCurrentUser,
      logout,
      setupPin,
      dismissPinSetup,
      unlockWithPin,
      lock,
      clearPinVault
    }),
    [token, user, bootstrap, loading, locked, pinVault, pinSetupPending, refreshBootstrap, login, setupOwner, refreshCurrentUser, logout, setupPin, dismissPinSetup, unlockWithPin, lock, clearPinVault]
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
