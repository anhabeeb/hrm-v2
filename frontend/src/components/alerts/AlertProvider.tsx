import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { alertDedupeKey, defaultAutoDismissMs, mapApiErrorToAlert, validationAlertMessage } from "../../lib/alert-utils";
import type { ValidationIssue } from "../../lib/validation";
import { AlertViewport } from "./AlertViewport";
import { AlertContext, type AlertContextValue, type PopupAlert, type PopupAlertAction, type PopupAlertInput } from "./useAlert";

const MAX_VISIBLE_ALERTS = 5;
const DEDUPE_WINDOW_MS = 2500;

function nextAlertId() {
  return `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function AlertProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<PopupAlert[]>([]);
  const recentAlerts = useRef<Map<string, number>>(new Map());

  const dismissAlert = useCallback((id: string) => {
    setAlerts((current) => current.filter((alert) => alert.id !== id));
  }, []);

  const clearAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  const showAlert = useCallback((input: PopupAlertInput) => {
    const now = Date.now();
    const dedupeKey = alertDedupeKey(input);
    const previous = recentAlerts.current.get(dedupeKey);
    if (previous && now - previous < DEDUPE_WINDOW_MS) {
      return dedupeKey;
    }
    recentAlerts.current.set(dedupeKey, now);

    const id = nextAlertId();
    const alert: PopupAlert = {
      ...input,
      id,
      createdAt: now,
      dedupeKey,
      dismissible: input.dismissible ?? true,
      autoDismissMs: input.autoDismissMs === undefined ? defaultAutoDismissMs(input.type) : input.autoDismissMs
    };
    setAlerts((current) => [alert, ...current].slice(0, MAX_VISIBLE_ALERTS));
    return id;
  }, []);

  const updateAlert = useCallback((id: string, input: Partial<PopupAlertInput>) => {
    setAlerts((current) => current.map((alert) => alert.id === id ? {
      ...alert,
      ...input,
      autoDismissMs: input.autoDismissMs === undefined ? alert.autoDismissMs : input.autoDismissMs
    } : alert));
  }, []);

  const showSuccess = useCallback((title: string, message?: string, action?: PopupAlertAction) => showAlert({ type: "success", title, message, action }), [showAlert]);
  const showError = useCallback((title: string, message?: string, action?: PopupAlertAction) => showAlert({ type: "error", title, message, action }), [showAlert]);
  const showWarning = useCallback((title: string, message?: string, action?: PopupAlertAction) => showAlert({ type: "warning", title, message, action }), [showAlert]);
  const showInfo = useCallback((title: string, message?: string, action?: PopupAlertAction) => showAlert({ type: "info", title, message, action }), [showAlert]);
  const showLoading = useCallback((title: string, message?: string) => showAlert({ type: "loading", title, message, autoDismissMs: null, dismissible: false }), [showAlert]);
  const showValidationError = useCallback((issuesOrMessage?: ValidationIssue[] | string, title = "Please review the form") => showAlert({
    type: "validation",
    title,
    message: validationAlertMessage(issuesOrMessage),
    dedupeKey: `validation-summary:${typeof issuesOrMessage === "string" ? issuesOrMessage : validationAlertMessage(issuesOrMessage)}`
  }), [showAlert]);
  const showPermissionDenied = useCallback((message?: string) => showAlert({
    type: "permission",
    title: "Permission denied",
    message: message ?? "Your account does not have permission to perform this action.",
    dedupeKey: `permission:${message ?? "default"}`
  }), [showAlert]);
  const showModuleDisabled = useCallback((moduleName?: string) => showAlert({
    type: "module-disabled",
    title: "Module disabled",
    message: moduleName ? `${moduleName} is currently disabled or unavailable.` : "This module is currently disabled or unavailable.",
    dedupeKey: `module-disabled:${moduleName ?? "default"}`
  }), [showAlert]);
  const showSessionExpired = useCallback((message?: string, action?: PopupAlertAction) => showAlert({
    type: "session-expired",
    title: "Session expired",
    message: message ?? "Please sign in again to continue.",
    action,
    dedupeKey: "session-expired"
  }), [showAlert]);
  const showApiError = useCallback((error: unknown, fallbackTitle = "Request failed") => {
    const mapped = mapApiErrorToAlert(error, fallbackTitle);
    return showAlert(mapped);
  }, [showAlert]);

  useEffect(() => {
    function handleSessionExpired() {
      showSessionExpired("Please sign in again to continue.");
    }
    window.addEventListener("hrm-v2-session-expired", handleSessionExpired);
    return () => window.removeEventListener("hrm-v2-session-expired", handleSessionExpired);
  }, [showSessionExpired]);

  const value = useMemo<AlertContextValue>(() => ({
    showAlert,
    updateAlert,
    dismissAlert,
    clearAlerts,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showLoading,
    showValidationError,
    showPermissionDenied,
    showModuleDisabled,
    showSessionExpired,
    showApiError
  }), [showAlert, updateAlert, dismissAlert, clearAlerts, showSuccess, showError, showWarning, showInfo, showLoading, showValidationError, showPermissionDenied, showModuleDisabled, showSessionExpired, showApiError]);

  return (
    <AlertContext.Provider value={value}>
      {children}
      <AlertViewport alerts={alerts} onDismiss={dismissAlert} />
    </AlertContext.Provider>
  );
}
