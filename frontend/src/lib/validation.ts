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
  const maybe = error as { validation_errors?: unknown; error?: { validation_errors?: unknown; message?: string; code?: string } };
  const raw = maybe.validation_errors ?? maybe.error?.validation_errors;
  if (Array.isArray(raw)) {
    return raw
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((item) => ({
        code: typeof item.code === "string" ? item.code : "VALIDATION_ERROR",
        field: typeof item.field === "string" ? item.field : undefined,
        message: typeof item.message === "string" ? item.message : "Please review this field.",
        severity: item.severity === "warning" || item.severity === "info" ? item.severity : "error",
        details: item.details && typeof item.details === "object" ? item.details as Record<string, unknown> : undefined
      }));
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
