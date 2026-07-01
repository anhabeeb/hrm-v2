import type { ApiError } from "./api";
import type { ValidationIssue } from "./validation";
import type { PopupAlertInput, PopupAlertType } from "../components/alerts/useAlert";

const internalErrorTokens = [
  ["D1", "ERROR"].join("_"),
  ["SQLITE", "ERROR"].join("_"),
  "SQL error",
  "stack trace",
  ["no", "such", "table"].join(" "),
  ["no", "such", "column"].join(" ")
];
const INTERNAL_ERROR_PATTERN = new RegExp(`\\b(${internalErrorTokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i");

export function sanitizeAlertMessage(message?: string | null, fallback = "Something went wrong. Please try again or contact your administrator.") {
  const safe = String(message ?? "").trim();
  if (!safe || INTERNAL_ERROR_PATTERN.test(safe)) return fallback;
  return safe;
}

export function validationAlertMessage(issuesOrMessage?: ValidationIssue[] | string) {
  if (typeof issuesOrMessage === "string") return sanitizeAlertMessage(issuesOrMessage, "Please fix the highlighted fields.");
  const errorIssues = (issuesOrMessage ?? []).filter((issue) => issue.severity !== "info");
  if (!errorIssues.length) return "Please fix the highlighted fields.";
  const fieldCount = new Set(errorIssues.map((issue) => issue.field).filter(Boolean)).size;
  if (fieldCount > 1) return `Please fix ${fieldCount} highlighted fields.`;
  return sanitizeAlertMessage(errorIssues[0]?.message, "Please fix the highlighted field.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function getErrorStatus(error: unknown) {
  return isRecord(error) && typeof error.status === "number" ? error.status : 0;
}

function getErrorCode(error: unknown) {
  return isRecord(error) && typeof error.code === "string" ? error.code : "";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "";
}

export function isModuleDisabledError(error: unknown) {
  const code = getErrorCode(error).toUpperCase();
  return code.includes("MODULE_DISABLED") || code.includes("SUBMODULE_DISABLED") || code.includes("NOT_AVAILABLE") || /module.+disabled/i.test(getErrorMessage(error));
}

export function mapApiErrorToAlert(error: unknown, fallbackTitle = "Request failed"): PopupAlertInput {
  const status = getErrorStatus(error);
  const code = getErrorCode(error).toUpperCase();
  const rawMessage = getErrorMessage(error);
  const fieldErrors = isRecord(error) ? error.fieldErrors : undefined;
  const validationErrors = isRecord(error) ? error.validationErrors : undefined;
  const hasValidationDetails =
    (Array.isArray(validationErrors) && validationErrors.length > 0) ||
    Boolean(fieldErrors && typeof fieldErrors === "object" && Object.keys(fieldErrors).length > 0);

  if (status === 401 || code.includes("UNAUTHENTICATED") || code.includes("SESSION")) {
    return {
      type: "session-expired",
      title: "Session expired",
      message: "Please sign in again to continue.",
      autoDismissMs: 9000,
      dedupeKey: "session-expired"
    };
  }

  if (status === 403 || code.includes("FORBIDDEN") || code.includes("PERMISSION")) {
    return {
      type: "permission",
      title: "Permission denied",
      message: sanitizeAlertMessage(rawMessage, "Your account does not have permission to perform this action."),
      autoDismissMs: 9000,
      dedupeKey: `permission:${code || rawMessage}`
    };
  }

  if (isModuleDisabledError(error)) {
    return {
      type: "module-disabled",
      title: "Module disabled",
      message: sanitizeAlertMessage(rawMessage, "This module is currently disabled or unavailable."),
      autoDismissMs: 9000,
      dedupeKey: `module-disabled:${code || rawMessage}`
    };
  }

  if (status === 400 || status === 422 || hasValidationDetails || code.includes("VALIDATION")) {
    return {
      type: "validation",
      title: "Validation needed",
      message: sanitizeAlertMessage(rawMessage, "Please fix the highlighted fields."),
      autoDismissMs: 8000,
      dedupeKey: `validation:${code || rawMessage}`
    };
  }

  if (status === 409 || code.includes("CONFLICT") || code.includes("LOCKED")) {
    return {
      type: "warning",
      title: "Action cannot continue",
      message: sanitizeAlertMessage(rawMessage, "This record changed or is locked. Refresh and try again."),
      autoDismissMs: 9000,
      dedupeKey: `conflict:${code || rawMessage}`
    };
  }

  if (status === 404) {
    return {
      type: "warning",
      title: "Not found",
      message: sanitizeAlertMessage(rawMessage, "The requested record could not be found."),
      autoDismissMs: 8000,
      dedupeKey: `not-found:${code || rawMessage}`
    };
  }

  if (status === 429) {
    return {
      type: "warning",
      title: "Too many requests",
      message: "Please wait a moment before trying again.",
      autoDismissMs: 9000,
      dedupeKey: "rate-limit"
    };
  }

  if (status >= 500) {
    return {
      type: "error",
      title: "Server error",
      message: "The server could not complete the request. Please try again or contact your administrator.",
      autoDismissMs: 10000,
      dedupeKey: `server:${status}:${code}`
    };
  }

  return {
    type: "error",
    title: fallbackTitle,
    message: sanitizeAlertMessage(rawMessage),
    autoDismissMs: 9000,
    dedupeKey: `error:${status}:${code}:${rawMessage}`
  };
}

export function defaultAutoDismissMs(type: PopupAlertType) {
  if (type === "success") return 3500;
  if (type === "info") return 4000;
  if (type === "warning" || type === "validation") return 6000;
  if (type === "error" || type === "permission" || type === "module-disabled" || type === "session-expired") return 7000;
  return 4000;
}

export function getAlertDuration(alert: Pick<PopupAlertInput, "type" | "autoDismissMs" | "durationMs" | "duration" | "persistent">) {
  if (alert.persistent === true) return null;

  const explicit = Number(alert.durationMs ?? alert.duration ?? alert.autoDismissMs);
  if (Number.isFinite(explicit) && explicit > 0) {
    return Math.min(Math.max(explicit, 1000), 30000);
  }

  return defaultAutoDismissMs(alert.type);
}

export function alertDedupeKey(input: PopupAlertInput) {
  return input.dedupeKey ?? `${input.type}:${input.title}:${input.message ?? ""}`;
}

export function isApiErrorLike(error: unknown): error is ApiError {
  return isRecord(error) && typeof error.status === "number" && typeof error.code === "string";
}
