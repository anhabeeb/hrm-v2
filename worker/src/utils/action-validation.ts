import type { Context } from "hono";
import { canAccessEmployee } from "../auth/access-scopes";
import {
  hasValidationErrors,
  validateAccessScope,
  validateDateField,
  validateDateRange,
  validateEmailField,
  validateEnumValue,
  validatePhoneField,
  validateRequiredField,
  validateRequiredFields,
  validationIssue,
  validationResponse,
  type ValidationIssue
} from "../lib/moduleValidation";
import type { AppBindings } from "../types";
import { fail } from "./http";
import { disabledModuleResponse, isOperationalModuleEnabled } from "./module-enforcement";

export {
  hasValidationErrors,
  validateAccessScope,
  validateDateField,
  validateDateRange,
  validateEmailField,
  validateEnumValue,
  validatePhoneField,
  validateRequiredField,
  validateRequiredFields,
  validationIssue,
  validationResponse,
  type ValidationIssue
};

export function validateActionReason(reason: unknown, actionLabel: string, required = true) {
  if (!required) return [];
  return validateRequiredField(reason, "reason", `${actionLabel} reason`);
}

export function validateAmountField(value: unknown, field: string, label: string, options: { min?: number; max?: number } = {}) {
  if (value === null || value === undefined || value === "") return [];
  const amount = Number(value);
  const issues: ValidationIssue[] = [];
  if (!Number.isFinite(amount)) issues.push(validationIssue("INVALID_AMOUNT", field, `${label} must be a valid number.`));
  if (options.min !== undefined && amount < options.min) issues.push(validationIssue("AMOUNT_BELOW_MINIMUM", field, `${label} cannot be below ${options.min}.`));
  if (options.max !== undefined && amount > options.max) issues.push(validationIssue("AMOUNT_ABOVE_MAXIMUM", field, `${label} cannot be above ${options.max}.`));
  return issues;
}

export function validateIdReference(value: unknown, field: string, label: string) {
  return validateRequiredField(value, field, label);
}

export async function validateModuleEnabledForAction(c: Context<AppBindings>, moduleKey: string) {
  const enabled = await isOperationalModuleEnabled(c.env.DB, moduleKey);
  return enabled ? null : disabledModuleResponse(c, moduleKey);
}

export async function validateEmployeeActionScope(c: Context<AppBindings>, employeeId: string, moduleKey: string, action: "view" | "manage" = "manage") {
  const allowed = await canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, moduleKey, action);
  return allowed ? null : fail(c, 404, "NOT_FOUND", "The employee was not found in your access scope.");
}

export function validationResult(c: Context<AppBindings>, issues: ValidationIssue[]) {
  return hasValidationErrors(issues) ? validationResponse(c, issues) : null;
}
