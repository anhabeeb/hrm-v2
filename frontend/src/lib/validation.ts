import { useMemo, useState } from "react";

export type ValidationSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  code: string;
  field?: string;
  message: string;
  severity: ValidationSeverity;
  details?: Record<string, unknown>;
}

export interface DateRangeInput {
  start?: string | null;
  end?: string | null;
  startField?: string;
  endField?: string;
  label?: string;
}

export interface AmountValidationInput {
  value: string | number | null | undefined;
  field: string;
  label: string;
  min?: number;
  max?: number;
}

export function normalizeValidationIssues(error: unknown): ValidationIssue[] {
  if (!error || typeof error !== "object") return [];
  const maybe = error as {
    validationErrors?: unknown;
    fieldErrors?: unknown;
    actionErrors?: unknown;
    validation_errors?: unknown;
    field_errors?: unknown;
    action_errors?: unknown;
    error?: {
      validation_errors?: unknown;
      field_errors?: unknown;
      action_errors?: unknown;
      message?: string;
      code?: string;
    };
  };
  const raw = maybe.validationErrors ?? maybe.validation_errors ?? maybe.error?.validation_errors;
  if (Array.isArray(raw)) {
    const normalized = raw
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((item) => {
        const severity: ValidationSeverity = item.severity === "warning" || item.severity === "info" ? item.severity : "error";
        return {
          code: typeof item.code === "string" ? item.code : "VALIDATION_ERROR",
          field: typeof item.field === "string" ? item.field : undefined,
          message: typeof item.message === "string" ? item.message : "Please review this field.",
          severity,
          details: item.details && typeof item.details === "object" ? item.details as Record<string, unknown> : undefined
        };
      });
    if (normalized.length) return normalized;
  }
  const fieldErrors = maybe.fieldErrors ?? maybe.field_errors ?? maybe.error?.field_errors;
  if (fieldErrors && typeof fieldErrors === "object") {
    return Object.entries(fieldErrors as Record<string, unknown>).flatMap(([field, messages]) => {
      const list = Array.isArray(messages) ? messages : [messages];
      return list
        .filter((message): message is string => typeof message === "string" && message.trim().length > 0)
        .map((message) => ({ code: "FIELD_VALIDATION_ERROR", field, message, severity: "error" as const }));
    });
  }
  const actionErrors = maybe.actionErrors ?? maybe.action_errors ?? maybe.error?.action_errors;
  if (Array.isArray(actionErrors)) {
    return actionErrors
      .filter((message): message is string => typeof message === "string" && message.trim().length > 0)
      .map((message) => ({ code: "ACTION_VALIDATION_ERROR", message, severity: "error" as const }));
  }
  if (maybe.error?.message) {
    return [{ code: maybe.error.code ?? "VALIDATION_ERROR", message: maybe.error.message, severity: "error" }];
  }
  return [];
}

export function hasBlockingIssues(issues: ValidationIssue[]) {
  return issues.some((issue) => issue.severity === "error");
}

export function issuesForField(issues: ValidationIssue[], field: string) {
  return issues.filter((issue) => issue.field === field);
}

export function validateDateRange(input: DateRangeInput): ValidationIssue[] {
  const start = input.start || "";
  const end = input.end || "";
  if (start && end && end < start) {
    return [{
      code: "INVALID_DATE_RANGE",
      field: input.endField ?? "end_date",
      message: `${input.label ?? "End date"} cannot be before the start date.`,
      severity: "error",
      details: { start, end, startField: input.startField, endField: input.endField }
    }];
  }
  return [];
}

export function validateAmount(input: AmountValidationInput): ValidationIssue[] {
  if (input.value === "" || input.value === null || input.value === undefined) return [];
  const amount = Number(input.value);
  if (!Number.isFinite(amount)) {
    return [{ code: "INVALID_AMOUNT", field: input.field, message: `${input.label} must be a valid number.`, severity: "error" }];
  }
  if (input.min !== undefined && amount < input.min) {
    return [{ code: "AMOUNT_BELOW_MINIMUM", field: input.field, message: `${input.label} cannot be below ${input.min}.`, severity: "error" }];
  }
  if (input.max !== undefined && amount > input.max) {
    return [{ code: "AMOUNT_ABOVE_MAXIMUM", field: input.field, message: `${input.label} cannot be above ${input.max}.`, severity: "error" }];
  }
  return [];
}

export function validateRequiredField(value: unknown, field: string, label: string): ValidationIssue[] {
  if (value === null || value === undefined || String(value).trim() === "") {
    return [{ code: "REQUIRED_FIELD", field, message: `${label} is required.`, severity: "error" }];
  }
  return [];
}

export function validateRequiredFields(input: Record<string, unknown>, labels: Record<string, string>): ValidationIssue[] {
  return Object.entries(labels).flatMap(([field, label]) => validateRequiredField(input[field], field, label));
}

export function validateMaxLength(value: unknown, field: string, label: string, max: number): ValidationIssue[] {
  if (value !== null && value !== undefined && String(value).length > max) {
    return [{ code: "STRING_TOO_LONG", field, message: `${label} must be ${max} characters or fewer.`, severity: "error", details: { max } }];
  }
  return [];
}

export function validateEmail(value: unknown, field: string, label = "Email"): ValidationIssue[] {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return [];
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return [{ code: "INVALID_EMAIL", field, message: `${label} must be a valid email address.`, severity: "error" }];
  return [];
}

export function validatePhone(value: unknown, field: string, label = "Phone"): ValidationIssue[] {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return [];
  if (!/^[+()0-9\s.-]{6,30}$/.test(text)) return [{ code: "INVALID_PHONE", field, message: `${label} must be a valid phone number.`, severity: "error" }];
  return [];
}

export function validateDateField(value: unknown, field: string, label: string, options: { required?: boolean; allowFuture?: boolean } = {}): ValidationIssue[] {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return options.required ? [{ code: "REQUIRED_FIELD", field, message: `${label} is required.`, severity: "error" }] : [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) return [{ code: "INVALID_DATE", field, message: `${label} must be a valid date.`, severity: "error" }];
  if (options.allowFuture === false && text > new Date().toISOString().slice(0, 10)) return [{ code: "DATE_IN_FUTURE", field, message: `${label} cannot be in the future.`, severity: "error" }];
  return [];
}

export function validateEnumValue(value: unknown, field: string, label: string, allowed: readonly string[]): ValidationIssue[] {
  if (!allowed.includes(String(value ?? ""))) return [{ code: "INVALID_ENUM", field, message: `${label} is not a valid option.`, severity: "error", details: { allowed } }];
  return [];
}

export function firstInvalidField(issues: ValidationIssue[]) {
  return issues.find((issue) => issue.severity === "error" && issue.field)?.field;
}

export function focusFirstInvalidField(issues: ValidationIssue[], root: ParentNode = document) {
  const field = firstInvalidField(issues);
  if (!field) return;
  const selector = `[name="${CSS.escape(field)}"], [data-validation-field="${CSS.escape(field)}"]`;
  const target = root.querySelector<HTMLElement>(selector);
  target?.focus();
}

export function useFormValidation(initialIssues: ValidationIssue[] = []) {
  const [issues, setIssues] = useState<ValidationIssue[]>(initialIssues);
  const errors = useMemo(() => issues.filter((issue) => issue.severity === "error"), [issues]);
  const warnings = useMemo(() => issues.filter((issue) => issue.severity === "warning"), [issues]);
  return {
    issues,
    errors,
    warnings,
    hasErrors: errors.length > 0,
    setIssues,
    clearIssues: () => setIssues([]),
    setFieldError: (field: string, message: string, code = "VALIDATION_ERROR") =>
      setIssues((current) => [...current.filter((issue) => issue.field !== field), { code, field, message, severity: "error" }]),
    fieldIssues: (field: string) => issuesForField(issues, field)
  };
}
