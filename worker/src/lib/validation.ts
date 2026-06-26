import type { Context } from "hono";
import { getUserAccessScopes } from "../auth/access-scopes";
import type { AppBindings, AuthUser, Env } from "../types";

export type ValidationSeverity = "error" | "warning" | "info";

export interface ValidationIssue {
  code: string;
  field?: string;
  message: string;
  severity: ValidationSeverity;
  details?: Record<string, unknown>;
}

export function validationIssue(code: string, field: string | undefined, message: string, severity: ValidationSeverity = "error", details?: Record<string, unknown>): ValidationIssue {
  return { code, field, message, severity, details };
}

export function validationResponse(c: Context<AppBindings>, issues: ValidationIssue[], status: 400 | 409 | 423 = 400) {
  return c.json({
    ok: false,
    error: {
      code: "VALIDATION_ERROR",
      message: issues.find((issue) => issue.severity === "error")?.message ?? "Please review the highlighted validation messages.",
      validation_errors: issues
    }
  }, status);
}

export function hasValidationErrors(issues: ValidationIssue[]) {
  return issues.some((issue) => issue.severity === "error");
}

export function validateDateRange(input: { start?: string | null; end?: string | null; startField?: string; endField?: string; label?: string }) {
  if (input.start && input.end && input.end < input.start) {
    return [validationIssue("INVALID_DATE_RANGE", input.endField ?? "end_date", `${input.label ?? "End date"} cannot be before the start date.`, "error", input as Record<string, unknown>)];
  }
  return [];
}

export function validateDuplicateConflict(existing: unknown, field: string, message: string) {
  return existing ? [validationIssue("DUPLICATE_CONFLICT", field, message)] : [];
}

export function validateLockedState(input: { status?: string | null; locked?: boolean; finalized?: boolean; field?: string; message?: string }) {
  if (input.locked || input.finalized || ["LOCKED", "FINALIZED", "FINALIZED_PLACEHOLDER", "CLOSED"].includes(String(input.status ?? ""))) {
    return [validationIssue("LOCKED_STATE", input.field, input.message ?? "This record is locked or finalized. Use the authorized adjustment flow.")];
  }
  return [];
}

function parseIdList(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
  } catch {
    return [];
  }
}

async function getActorSelectableScope(db: Env["DB"], user: AuthUser) {
  if (user.is_owner) return { unrestrictedDepartments: true, unrestrictedLocations: true, departmentIds: new Set<string>(), locationIds: new Set<string>() };
  const scopes = await getUserAccessScopes(db, user.id, null);
  const linked = user.employee_id
    ? await db.prepare("SELECT primary_department_id, primary_location_id FROM employees WHERE id = ? AND archived_at IS NULL").bind(user.employee_id).first<{ primary_department_id: string | null; primary_location_id: string | null }>()
    : null;
  const departmentIds = new Set<string>();
  const locationIds = new Set<string>();
  let unrestrictedDepartments = false;
  let unrestrictedLocations = false;

  for (const scope of scopes) {
    if (scope.scope_type === "WHOLE_COMPANY") {
      unrestrictedDepartments = true;
      unrestrictedLocations = true;
    } else if (scope.scope_type === "ALL_LOCATIONS") {
      unrestrictedLocations = true;
    } else if (scope.scope_type === "SELECTED_DEPARTMENTS") {
      parseIdList(scope.allowed_department_ids_json).forEach((id) => departmentIds.add(id));
    } else if (scope.scope_type === "SELECTED_LOCATIONS") {
      parseIdList(scope.allowed_location_ids_json).forEach((id) => locationIds.add(id));
    } else if (scope.scope_type === "OWN_DEPARTMENT" && linked?.primary_department_id) {
      departmentIds.add(linked.primary_department_id);
    } else if (scope.scope_type === "OWN_LOCATION" && linked?.primary_location_id) {
      locationIds.add(linked.primary_location_id);
    } else if (scope.scope_type === "OWN_TEAM" || scope.scope_type === "SELF_ONLY") {
      if (linked?.primary_department_id) departmentIds.add(linked.primary_department_id);
      if (linked?.primary_location_id) locationIds.add(linked.primary_location_id);
    }
  }

  return { unrestrictedDepartments, unrestrictedLocations, departmentIds, locationIds };
}

export async function validateAccessScope(db: Env["DB"], user: AuthUser, input: { departmentIds?: string[]; locationIds?: string[]; requestedScopeType?: string | null }) {
  const issues: ValidationIssue[] = [];
  const departmentIds = Array.from(new Set((input.departmentIds ?? []).filter(Boolean)));
  const locationIds = Array.from(new Set((input.locationIds ?? []).filter(Boolean)));

  if (departmentIds.length) {
    const rows = await db.prepare(`SELECT id FROM departments WHERE id IN (${departmentIds.map(() => "?").join(",")}) AND is_active = 1`).bind(...departmentIds).all<{ id: string }>();
    const found = new Set(rows.results.map((row) => row.id));
    for (const id of departmentIds) if (!found.has(id)) issues.push(validationIssue("INVALID_ACCESS_SCOPE", "allowed_department_ids", "Selected department is not active or does not exist.", "error", { departmentId: id }));
  }
  if (locationIds.length) {
    const rows = await db.prepare(`SELECT id FROM locations WHERE id IN (${locationIds.map(() => "?").join(",")}) AND is_active = 1`).bind(...locationIds).all<{ id: string }>();
    const found = new Set(rows.results.map((row) => row.id));
    for (const id of locationIds) if (!found.has(id)) issues.push(validationIssue("INVALID_ACCESS_SCOPE", "allowed_location_ids", "Selected location is not active or does not exist.", "error", { locationId: id }));
  }
  const actorScope = await getActorSelectableScope(db, user);
  const requestedScopeType = input.requestedScopeType ?? null;
  if (!user.is_owner && (requestedScopeType === "WHOLE_COMPANY" || requestedScopeType === "ALL_LOCATIONS")) {
    if (requestedScopeType === "WHOLE_COMPANY" && (!actorScope.unrestrictedDepartments || !actorScope.unrestrictedLocations)) {
      issues.push(validationIssue("ACCESS_SCOPE_TOO_BROAD", "scope_type", "You cannot assign whole-company access beyond your own access scope."));
    }
    if (requestedScopeType === "ALL_LOCATIONS" && !actorScope.unrestrictedLocations) {
      issues.push(validationIssue("ACCESS_SCOPE_TOO_BROAD", "scope_type", "You cannot assign all-location access beyond your own access scope."));
    }
  }
  if (!user.is_owner && !actorScope.unrestrictedDepartments) {
    for (const id of departmentIds) {
      if (!actorScope.departmentIds.has(id)) issues.push(validationIssue("ACCESS_SCOPE_OUTSIDE_ACTOR_SCOPE", "allowed_department_ids", "This department is outside your allowed access scope.", "error", { departmentId: id }));
    }
  }
  if (!user.is_owner && !actorScope.unrestrictedLocations) {
    for (const id of locationIds) {
      if (!actorScope.locationIds.has(id)) issues.push(validationIssue("ACCESS_SCOPE_OUTSIDE_ACTOR_SCOPE", "allowed_location_ids", "This location is outside your allowed access scope.", "error", { locationId: id }));
    }
  }
  if (!user.is_owner && input.departmentIds?.length === 0 && input.locationIds?.length === 0) {
    issues.push(validationIssue("ACCESS_SCOPE_REVIEW_REQUIRED", "scope_type", "Scoped access must include a valid data boundary unless whole-company access is intentionally granted.", "warning"));
  }
  return issues;
}

export function validatePayrollRules(input: { amount?: number | null; status?: string | null; periodStart?: string | null; periodEnd?: string | null }) {
  const issues = validateDateRange({ start: input.periodStart, end: input.periodEnd, startField: "start_date", endField: "end_date", label: "Payroll period end date" });
  if (input.amount !== null && input.amount !== undefined && input.amount < 0) issues.push(validationIssue("INVALID_PAYROLL_AMOUNT", "amount", "Payroll amounts cannot be negative."));
  issues.push(...validateLockedState({ status: input.status, field: "status", message: "Finalized payroll cannot be modified directly." }).filter((issue) => issue.severity === "error"));
  return issues;
}

export function validateLeaveRules(input: { startDate?: string | null; endDate?: string | null; hasApprover?: boolean }) {
  const issues = validateDateRange({ start: input.startDate, end: input.endDate, startField: "start_date", endField: "end_date", label: "Leave end date" });
  if (input.hasApprover === false) issues.push(validationIssue("APPROVAL_WORKFLOW_UNRESOLVED", "approval_workflow", "Leave approval workflow must resolve at least one valid approver."));
  return issues;
}

export function validateAttendanceRosterRules(input: { date?: string | null; locked?: boolean; startTime?: string | null; endTime?: string | null }) {
  const issues = validateLockedState({ locked: input.locked, field: "date", message: "Locked attendance or roster records require an adjustment or revision flow." });
  if (input.startTime && input.endTime && input.startTime === input.endTime) issues.push(validationIssue("INVALID_SHIFT_RANGE", "end_time", "Roster shift start and end times cannot be identical."));
  return issues;
}

export function validateApprovalWorkflowRules(input: { hasActiveStep?: boolean; allowAutoApprove?: boolean; allowSelfApproval?: boolean }) {
  const issues: ValidationIssue[] = [];
  if (!input.hasActiveStep && !input.allowAutoApprove) issues.push(validationIssue("APPROVAL_WORKFLOW_STEPS_REQUIRED", "steps", "Approval workflow must have at least one active step or an explicit auto-approve policy."));
  if (input.allowSelfApproval) issues.push(validationIssue("SELF_APPROVAL_REVIEW", "allow_self_approval", "Self-approval is high risk and should stay disabled unless explicitly required.", "warning"));
  return issues;
}

export function validateDocumentRules(input: { issueDate?: string | null; expiryDate?: string | null; documentTypeId?: string | null }) {
  const issues = validateDateRange({ start: input.issueDate, end: input.expiryDate, startField: "issue_date", endField: "expiry_date", label: "Document expiry date" });
  if (!input.documentTypeId) issues.push(validationIssue("DOCUMENT_TYPE_REQUIRED", "document_type_id", "Document type is required."));
  return issues;
}

export function validateContractRules(input: { startDate?: string | null; endDate?: string | null; renewalDate?: string | null }) {
  const issues = validateDateRange({ start: input.startDate, end: input.endDate, startField: "start_date", endField: "end_date", label: "Contract end date" });
  if (input.renewalDate && input.endDate && input.renewalDate > input.endDate) issues.push(validationIssue("INVALID_RENEWAL_DATE", "renewal_date", "Renewal date cannot be after contract end date."));
  return issues;
}

export function validateAssetUniformRules(input: { issueDate?: string | null; returnDate?: string | null; quantity?: number | null; reason?: string | null; status?: string | null }) {
  const issues = validateDateRange({ start: input.issueDate, end: input.returnDate, startField: "issue_date", endField: "return_date", label: "Asset return date" });
  if (input.quantity !== null && input.quantity !== undefined && input.quantity < 0) issues.push(validationIssue("INVALID_QUANTITY", "quantity", "Quantity cannot be negative."));
  if (["LOST", "DAMAGED", "WRITE_OFF"].includes(String(input.status ?? "")) && !input.reason) issues.push(validationIssue("REASON_REQUIRED", "reason", "Lost, damaged, or write-off actions require a reason."));
  return issues;
}

export function validateImportRows(rows: Array<{ row_number?: number; errors?: unknown[] }>) {
  return rows.flatMap((row) => (row.errors?.length ? [validationIssue("IMPORT_ROW_INVALID", "rows", `Row ${row.row_number ?? "unknown"} has validation errors.`, "error", { row_number: row.row_number })] : []));
}
