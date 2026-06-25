import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ConfirmDialog } from "../components/ui/dialogs";
import { ApiError, api } from "../lib/api";
import { clearSensitiveIndexedDbCaches } from "../lib/cache/hrmCache";
import { useAuth } from "./useAuth";

interface IdleTimeoutSettings {
  idle_timeout_enabled: boolean;
  idle_timeout_minutes: number;
  warn_before_logout_seconds: number;
  extend_session_on_activity: boolean;
  apply_idle_timeout_to_admin: boolean;
  apply_idle_timeout_to_self_service: boolean;
  stricter_timeout_for_sensitive_pages: boolean;
  sensitive_page_idle_timeout_minutes: number;
  audit_timeout_logout: boolean;
}

interface IdleTimeoutContextValue {
  settings: IdleTimeoutSettings;
  warningOpen: boolean;
  remainingSeconds: number;
  resetIdleTimer: () => void;
  clearSensitiveCacheAndLogout: () => Promise<void>;
}

const DEFAULT_IDLE_TIMEOUT_SETTINGS: IdleTimeoutSettings = {
  idle_timeout_enabled: true,
  idle_timeout_minutes: 15,
  warn_before_logout_seconds: 60,
  extend_session_on_activity: true,
  apply_idle_timeout_to_admin: true,
  apply_idle_timeout_to_self_service: true,
  stricter_timeout_for_sensitive_pages: true,
  sensitive_page_idle_timeout_minutes: 10,
  audit_timeout_logout: true
};

const IdleTimeoutContext = createContext<IdleTimeoutContextValue | null>(null);

function bool(value: unknown, fallback: boolean) {
  if (value === undefined || value === null || value === "") return fallback;
  return value === true || value === 1 || value === "1" || value === "true";
}

function numberSetting(value: unknown, fallback: number, minimum = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}

function normalizeSettings(value: Record<string, unknown> | null | undefined): IdleTimeoutSettings {
  return {
    idle_timeout_enabled: bool(value?.idle_timeout_enabled, DEFAULT_IDLE_TIMEOUT_SETTINGS.idle_timeout_enabled),
    idle_timeout_minutes: numberSetting(value?.idle_timeout_minutes, DEFAULT_IDLE_TIMEOUT_SETTINGS.idle_timeout_minutes),
    warn_before_logout_seconds: numberSetting(value?.warn_before_logout_seconds, DEFAULT_IDLE_TIMEOUT_SETTINGS.warn_before_logout_seconds),
    extend_session_on_activity: bool(value?.extend_session_on_activity, DEFAULT_IDLE_TIMEOUT_SETTINGS.extend_session_on_activity),
    apply_idle_timeout_to_admin: bool(value?.apply_idle_timeout_to_admin, DEFAULT_IDLE_TIMEOUT_SETTINGS.apply_idle_timeout_to_admin),
    apply_idle_timeout_to_self_service: bool(value?.apply_idle_timeout_to_self_service, DEFAULT_IDLE_TIMEOUT_SETTINGS.apply_idle_timeout_to_self_service),
    stricter_timeout_for_sensitive_pages: bool(value?.stricter_timeout_for_sensitive_pages, DEFAULT_IDLE_TIMEOUT_SETTINGS.stricter_timeout_for_sensitive_pages),
    sensitive_page_idle_timeout_minutes: numberSetting(value?.sensitive_page_idle_timeout_minutes, DEFAULT_IDLE_TIMEOUT_SETTINGS.sensitive_page_idle_timeout_minutes),
    audit_timeout_logout: bool(value?.audit_timeout_logout, DEFAULT_IDLE_TIMEOUT_SETTINGS.audit_timeout_logout)
  };
}

function isSensitivePath(pathname: string) {
  return [
    "/payroll",
    "/final-settlement",
    "/settings/admin",
    "/users-access",
    "/reports/audit",
    "/audit",
    "/approvals"
  ].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isAdminUser(permissions: string[], isOwner?: boolean) {
  return Boolean(isOwner || permissions.some((permission) => permission.startsWith("admin.") || permission === "settings.manage" || permission === "users.view"));
}

export function IdleTimeoutProvider({ children }: { children: ReactNode }) {
  const { token, user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<IdleTimeoutSettings>(DEFAULT_IDLE_TIMEOUT_SETTINGS);
  const [warningOpen, setWarningOpen] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const lastActivityRef = useRef(Date.now());
  const timedOutRef = useRef(false);

  const effectiveTimeoutMinutes = useMemo(() => {
    if (settings.stricter_timeout_for_sensitive_pages && isSensitivePath(location.pathname)) {
      return Math.min(settings.idle_timeout_minutes, settings.sensitive_page_idle_timeout_minutes);
    }
    return settings.idle_timeout_minutes;
  }, [location.pathname, settings.idle_timeout_minutes, settings.sensitive_page_idle_timeout_minutes, settings.stricter_timeout_for_sensitive_pages]);

  const idleApplies = useMemo(() => {
    if (!token || !user || !settings.idle_timeout_enabled) return false;
    if (location.pathname.startsWith("/self-service")) return settings.apply_idle_timeout_to_self_service;
    if (isAdminUser(user.permissions, user.is_owner)) return settings.apply_idle_timeout_to_admin;
    return true;
  }, [location.pathname, settings.apply_idle_timeout_to_admin, settings.apply_idle_timeout_to_self_service, settings.idle_timeout_enabled, token, user]);

  const resetIdleTimer = useCallback(() => {
    if (!settings.extend_session_on_activity) return;
    lastActivityRef.current = Date.now();
    timedOutRef.current = false;
    setWarningOpen(false);
    setRemainingSeconds(0);
  }, [settings.extend_session_on_activity]);

  const clearSensitiveCacheAndLogout = useCallback(async () => {
    if (timedOutRef.current) return;
    timedOutRef.current = true;
    const currentToken = token;
    try {
      await clearSensitiveIndexedDbCaches();
      if (currentToken && settings.audit_timeout_logout) {
        await api.recordSessionTimeout(currentToken);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status !== 401) {
        // Logout must continue even if the audit marker fails.
      }
    } finally {
      sessionStorage.setItem("hrm_v2_login_message", "You were logged out due to inactivity.");
      await logout();
      navigate("/login", { replace: true });
    }
  }, [logout, navigate, settings.audit_timeout_logout, token]);

  useEffect(() => {
    let mounted = true;
    async function loadSettings() {
      if (!token) {
        setSettings(DEFAULT_IDLE_TIMEOUT_SETTINGS);
        return;
      }
      try {
        const result = await api.getAuthSessionSettings(token);
        if (mounted) setSettings(normalizeSettings(result.settings));
      } catch {
        if (mounted) setSettings(DEFAULT_IDLE_TIMEOUT_SETTINGS);
      }
    }
    void loadSettings();
    return () => {
      mounted = false;
    };
  }, [token]);

  useEffect(() => {
    resetIdleTimer();
  }, [location.key, resetIdleTimer]);

  useEffect(() => {
    if (!idleApplies) return;
    const events = ["mousemove", "mousedown", "click", "keydown", "touchstart", "scroll"] as const;
    const onActivity = () => resetIdleTimer();
    events.forEach((eventName) => window.addEventListener(eventName, onActivity, { passive: true }));
    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, onActivity));
    };
  }, [idleApplies, resetIdleTimer]);

  useEffect(() => {
    if (!token) return;
    const onSessionExpired = () => {
      void clearSensitiveCacheAndLogout();
    };
    window.addEventListener("hrm-v2-session-expired", onSessionExpired);
    return () => window.removeEventListener("hrm-v2-session-expired", onSessionExpired);
  }, [clearSensitiveCacheAndLogout, token]);

  useEffect(() => {
    if (!idleApplies) {
      setWarningOpen(false);
      return;
    }
    const timeoutMs = effectiveTimeoutMinutes * 60 * 1000;
    const warningMs = Math.min(settings.warn_before_logout_seconds * 1000, Math.max(timeoutMs - 1000, 0));
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      const remaining = Math.max(0, Math.ceil((timeoutMs - elapsed) / 1000));
      setRemainingSeconds(remaining);
      if (elapsed >= timeoutMs) {
        void clearSensitiveCacheAndLogout();
      } else if (elapsed >= timeoutMs - warningMs) {
        setWarningOpen(true);
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [clearSensitiveCacheAndLogout, effectiveTimeoutMinutes, idleApplies, settings.warn_before_logout_seconds]);

  const value = useMemo(
    () => ({ settings, warningOpen, remainingSeconds, resetIdleTimer, clearSensitiveCacheAndLogout }),
    [clearSensitiveCacheAndLogout, remainingSeconds, resetIdleTimer, settings, warningOpen]
  );

  return (
    <IdleTimeoutContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={warningOpen}
        title="Session timeout warning"
        description={`You will be logged out in ${remainingSeconds} seconds due to inactivity. Sensitive local cache will be cleared.`}
        confirmLabel="Stay logged in"
        cancelLabel="Logout now"
        onConfirm={resetIdleTimer}
        onCancel={() => void clearSensitiveCacheAndLogout()}
      />
    </IdleTimeoutContext.Provider>
  );
}

export function useIdleTimeout() {
  const context = useContext(IdleTimeoutContext);
  if (!context) {
    throw new Error("useIdleTimeout must be used within IdleTimeoutProvider.");
  }
  return context;
}
