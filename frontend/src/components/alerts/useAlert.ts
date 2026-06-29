import { createContext, useContext } from "react";
import type { ButtonVariant } from "../ui/button";
import type { ValidationIssue } from "../../lib/validation";

export type PopupAlertType =
  | "success"
  | "error"
  | "warning"
  | "info"
  | "loading"
  | "validation"
  | "permission"
  | "module-disabled"
  | "session-expired";

export interface PopupAlertAction {
  label: string;
  onClick: () => void;
  variant?: ButtonVariant;
}

export interface PopupAlertInput {
  type: PopupAlertType;
  title: string;
  message?: string;
  action?: PopupAlertAction;
  autoDismissMs?: number | null;
  dismissible?: boolean;
  dedupeKey?: string;
}

export interface PopupAlert extends PopupAlertInput {
  id: string;
  createdAt: number;
}

export interface AlertContextValue {
  showAlert: (input: PopupAlertInput) => string;
  updateAlert: (id: string, input: Partial<PopupAlertInput>) => void;
  dismissAlert: (id: string) => void;
  clearAlerts: () => void;
  showSuccess: (title: string, message?: string, action?: PopupAlertAction) => string;
  showError: (title: string, message?: string, action?: PopupAlertAction) => string;
  showWarning: (title: string, message?: string, action?: PopupAlertAction) => string;
  showInfo: (title: string, message?: string, action?: PopupAlertAction) => string;
  showLoading: (title: string, message?: string) => string;
  showValidationError: (issuesOrMessage?: ValidationIssue[] | string, title?: string) => string;
  showPermissionDenied: (message?: string) => string;
  showModuleDisabled: (moduleName?: string) => string;
  showSessionExpired: (message?: string, action?: PopupAlertAction) => string;
  showApiError: (error: unknown, fallbackTitle?: string) => string;
}

export const AlertContext = createContext<AlertContextValue | null>(null);

export function useAlert() {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error("useAlert must be used within AlertProvider.");
  }
  return context;
}
