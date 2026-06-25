import { Hono } from "hono";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { buildEmployeeScopeWhereClause, canAccessEmployee } from "../auth/access-scopes";
import { recordAudit } from "../db/audit";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { publishAccessEvent } from "../realtime/publisher";
import type { AppBindings } from "../types";
import { fail, getClientIp, ok } from "../utils/http";
import { readJsonBody, readString } from "../utils/validation";
import {
  calculatePayrollPensionContribution,
  applyCustomDeductionsToPayroll,
  getActiveApprovedBankLoansForPayroll,
  getActivePaymentMethodSnapshot,
  getEmployeePaymentMethods,
  recordBankLoanPayrollPayments,
  recordCustomDeductionPayrollApplications,
  updateCustomDeductionAfterPayrollFinalized,
  recordPayrollPensionContribution
} from "./payroll-foundations";

type BindValue = string | number | null;
type ComponentType = "EARNING" | "DEDUCTION" | "INFO" | "EMPLOYER_COST";
type Prompt10PeriodStatus = "DRAFT" | "CALCULATING" | "READY_FOR_REVIEW" | "APPROVED_PLACEHOLDER" | "FINALIZED_PLACEHOLDER" | "LOCKED" | "CANCELLED";
type Prompt11PayrollStatus = Prompt10PeriodStatus | "SUBMITTED_FOR_APPROVAL" | "APPROVED" | "REJECTED" | "SENT_BACK" | "FINALIZED";
type Prompt10RunStatus = Prompt10PeriodStatus;
type PayrollRunLifecycleStatus = Prompt11PayrollStatus;
type Prompt10ResultStatus = "DRAFT" | "READY_FOR_REVIEW" | "APPROVED_PLACEHOLDER" | "FINALIZED_PLACEHOLDER" | "HELD" | "EXCLUDED" | "CANCELLED";
type PayrollResultLifecycleStatus = Prompt10ResultStatus | "SUBMITTED_FOR_APPROVAL" | "APPROVED" | "FINALIZED";

const PROMPT10_PERIOD_STATUSES = new Set(["DRAFT", "CALCULATING", "READY_FOR_REVIEW", "APPROVED_PLACEHOLDER", "FINALIZED_PLACEHOLDER", "LOCKED", "CANCELLED"]);
const PROMPT10_RUN_STATUSES = new Set(["DRAFT", "CALCULATING", "READY_FOR_REVIEW", "APPROVED_PLACEHOLDER", "FINALIZED_PLACEHOLDER", "LOCKED", "CANCELLED"]);
const PROMPT10_RESULT_STATUSES = new Set(["DRAFT", "READY_FOR_REVIEW", "APPROVED_PLACEHOLDER", "FINALIZED_PLACEHOLDER", "HELD", "EXCLUDED", "CANCELLED"]);
const PROMPT11_PERIOD_STATUSES = new Set([...PROMPT10_PERIOD_STATUSES, "SUBMITTED_FOR_APPROVAL", "APPROVED", "REJECTED", "SENT_BACK", "FINALIZED"]);
const PROMPT11_RUN_STATUSES = new Set([...PROMPT10_RUN_STATUSES, "SUBMITTED_FOR_APPROVAL", "APPROVED", "REJECTED", "SENT_BACK", "FINALIZED"]);
const PROMPT11_RESULT_STATUSES = new Set([...PROMPT10_RESULT_STATUSES, "SUBMITTED_FOR_APPROVAL", "APPROVED", "FINALIZED"]);
const FINALIZED_PAYROLL_STATUSES = new Set(["FINALIZED", "LOCKED", "FINALIZED_PLACEHOLDER"]);
const LEGACY_PERIOD_STATUSES = new Set(["OPEN", "PROCESSING", "REVIEW", "APPROVED", "PAID", "CLOSED"]);
const LEGACY_RUN_STATUSES = new Set(["PROCESSING", "REVIEW", "APPROVED", "PAID"]);
const LEGACY_RESULT_STATUSES = new Set(["REVIEW", "APPROVED", "PAID"]);

const COMPONENT_TYPES = new Set(["EARNING", "DEDUCTION", "INFO", "EMPLOYER_COST", "BASIC_SALARY", "ALLOWANCE", "FIXED_DEDUCTION", "VARIABLE_DEDUCTION", "ATTENDANCE_DEDUCTION", "LEAVE_DEDUCTION", "ADVANCE_DEDUCTION", "ONE_TIME_DEDUCTION", "OVERTIME_PLACEHOLDER", "BENEFIT_PLACEHOLDER", "ADJUSTMENT"]);
const COMPONENT_CATEGORIES = new Set(["BASIC", "ALLOWANCE", "BENEFIT", "OVERTIME", "ADVANCE", "ATTENDANCE", "LEAVE", "OTHER", "SALARY", "DEDUCTION", "ADJUSTMENT"]);
const CALCULATION_TYPES = new Set(["FIXED", "VARIABLE", "PERCENTAGE", "FIXED_AMOUNT", "PERCENTAGE_OF_BASIC", "PERCENTAGE_OF_GROSS", "DAILY_RATE", "HOURLY_RATE", "FORMULA_PLACEHOLDER", "MANUAL"]);
const PAYMENT_METHODS = new Set(["CASH", "BANK_TRANSFER", "CHEQUE", "OTHER"]);
const DAILY_RATE_MODES = new Set(["CALENDAR_DAYS", "WORKING_DAYS", "FIXED_30_DAYS"]);
const BANK_LOAN_INSUFFICIENT_SALARY_MODES = new Set(["WARN_ONLY", "PARTIAL_DEDUCTION", "SKIP_AND_MARK_FAILED", "BLOCK_PAYROLL", "REQUIRE_OVERRIDE"]);
const BANK_LOAN_MINIMUM_NET_THRESHOLD_TYPES = new Set(["PERCENTAGE_OF_NET_SALARY", "FIXED_AMOUNT"]);
const CUSTOM_DEDUCTION_INSUFFICIENT_SALARY_MODES = new Set(["WARN_ONLY", "PARTIAL_DEDUCTION", "SKIP_AND_MARK_FAILED", "BLOCK_PAYROLL", "REQUIRE_OVERRIDE"]);
const PENSION_BASIS_MODES = new Set(["BASIC_SALARY_ONLY", "GROSS_SALARY", "CUSTOM_FORMULA_PLACEHOLDER"]);
const PERIOD_STATUSES = new Set([...PROMPT11_PERIOD_STATUSES, ...LEGACY_PERIOD_STATUSES]);
const RUN_STATUSES = new Set([...PROMPT11_RUN_STATUSES, ...LEGACY_RUN_STATUSES]);
const ADVANCE_STATUSES = new Set(["REQUESTED", "APPROVED", "PAID", "DEDUCTED", "CANCELLED"]);
const DEDUCTION_TYPES = new Set(["FIXED", "VARIABLE", "ONE_TIME", "RECURRING"]);
const DEDUCTION_STATUSES = new Set(["ACTIVE", "INACTIVE", "APPLIED", "CANCELLED"]);
const ADJUSTMENT_TYPES = new Set(["EARNING", "DEDUCTION"]);
const ADJUSTMENT_STATUSES = new Set(["DRAFT", "APPROVED_PLACEHOLDER", "APPROVED", "APPLIED", "CANCELLED"]);
const RUN_EMPLOYEE_STATUSES = new Set([...PROMPT11_RESULT_STATUSES, ...LEGACY_RESULT_STATUSES]);

export const payrollRoutes = new Hono<AppBindings>();
export const employeePayrollRoutes = new Hono<AppBindings>();

payrollRoutes.use("*", requireAuth);
employeePayrollRoutes.use("*", requireAuth);

function routeParam(c: Context<AppBindings>, name: string) {
  return c.req.param(name) ?? "";
}

function optionalString(value: unknown) {
  const text = readString(value);
  return text || null;
}

function num(value: unknown, fallback: number | null = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return value === "true" || value === "1";
  return fallback;
}

function has(c: Context<AppBindings>, permission: string) {
  return c.get("currentUser").permissions.includes(permission);
}

function hasAny(c: Context<AppBindings>, permissions: string[]) {
  return permissions.some((permission) => has(c, permission));
}

function prompt10Status(value: unknown, fallback: Prompt10RunStatus = "DRAFT") {
  const status = readString(value).toUpperCase();
  return PROMPT10_RUN_STATUSES.has(status) ? status : fallback;
}

function mapLegacyPayrollPeriodStatus(value: unknown): PayrollRunLifecycleStatus {
  const status = readString(value).toUpperCase();
  if (PROMPT11_PERIOD_STATUSES.has(status)) return status as PayrollRunLifecycleStatus;
  if (status === "OPEN") return "DRAFT";
  if (status === "PROCESSING") return "CALCULATING";
  if (status === "REVIEW") return "READY_FOR_REVIEW";
  if (status === "APPROVED") return "APPROVED_PLACEHOLDER";
  if (status === "CLOSED" || status === "PAID") return "FINALIZED_PLACEHOLDER";
  return "DRAFT";
}

function mapLegacyPayrollRunStatus(value: unknown): PayrollRunLifecycleStatus {
  const status = readString(value).toUpperCase();
  if (PROMPT11_RUN_STATUSES.has(status)) return status as PayrollRunLifecycleStatus;
  if (status === "PROCESSING") return "CALCULATING";
  if (status === "REVIEW") return "READY_FOR_REVIEW";
  if (status === "APPROVED") return "APPROVED_PLACEHOLDER";
  if (status === "PAID") return "FINALIZED_PLACEHOLDER";
  return "DRAFT";
}

function mapLegacyPayrollResultStatus(value: unknown): PayrollResultLifecycleStatus {
  const status = readString(value).toUpperCase();
  if (PROMPT11_RESULT_STATUSES.has(status)) return status as PayrollResultLifecycleStatus;
  if (status === "REVIEW") return "READY_FOR_REVIEW";
  if (status === "APPROVED") return "APPROVED_PLACEHOLDER";
  if (status === "PAID") return "FINALIZED_PLACEHOLDER";
  return "DRAFT";
}

function mapLegacyPayrollComponentType(value: unknown) {
  const type = readString(value).toUpperCase();
  if (type === "EARNING") return "ALLOWANCE";
  if (type === "DEDUCTION") return "VARIABLE_DEDUCTION";
  return type;
}

function getPayrollComponentType(value: unknown, code?: unknown) {
  const type = readString(value).toUpperCase();
  if (COMPONENT_TYPES.has(type)) return type;
  const componentCode = readString(code).toUpperCase();
  if (componentCode === "BASIC_SALARY") return "BASIC_SALARY";
  if (componentCode.includes("ADVANCE")) return "ADVANCE_DEDUCTION";
  if (componentCode.includes("ATTENDANCE") || componentCode.includes("ABSENCE") || componentCode.includes("LATE")) return "ATTENDANCE_DEDUCTION";
  if (componentCode.includes("LEAVE")) return "LEAVE_DEDUCTION";
  if (componentCode.includes("OVERTIME")) return "OVERTIME_PLACEHOLDER";
  if (componentCode.includes("BENEFIT")) return "BENEFIT_PLACEHOLDER";
  return mapLegacyPayrollComponentType(type || "ALLOWANCE");
}

function getPayrollComponentCalculationMode(value: unknown) {
  const mode = readString(value).toUpperCase();
  if (CALCULATION_TYPES.has(mode)) return mode;
  if (mode === "FIXED") return "FIXED_AMOUNT";
  if (mode === "PERCENTAGE") return "PERCENTAGE_OF_BASIC";
  if (mode === "VARIABLE") return "MANUAL";
  return "MANUAL";
}

function disabledPayrollCoreFeature(c: Context<AppBindings>, code: string, message: string) {
  return fail(c, 409, code, message);
}

function requireAnyPermission(permissions: string[]) {
  return createMiddleware<AppBindings>(async (c, next) => {
    if (!hasAny(c, permissions)) return fail(c, 403, "FORBIDDEN", "You do not have permission to perform this action.");
    await next();
  });
}

function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function isoNow() {
  return new Date().toISOString();
}

function monthEnd(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function daysBetween(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

function nextMonthCutoffDate(period: Record<string, unknown>, day: number) {
  const year = Number(period.period_year);
  const month = Number(period.period_month);
  const date = new Date(Date.UTC(year, month, day));
  return date.toISOString().slice(0, 10);
}

function getPayrollCutoffSchedule(period: Record<string, unknown>) {
  return {
    period_start: period.start_date,
    period_end: period.end_date,
    employee_submission_cutoff: nextMonthCutoffDate(period, 3),
    manager_approval_cutoff: nextMonthCutoffDate(period, 5),
    hr_attendance_review_lock_cutoff: nextMonthCutoffDate(period, 6),
    payroll_draft_calculation_cutoff: nextMonthCutoffDate(period, 7),
    final_payroll_lock_cutoff: nextMonthCutoffDate(period, 8),
    salary_payment_date: period.salary_payment_date ?? nextMonthCutoffDate(period, 10)
  };
}

function getPayrollCutoffStatus(period: Record<string, unknown>, nowDate = new Date().toISOString().slice(0, 10)) {
  const schedule = getPayrollCutoffSchedule(period);
  return {
    schedule,
    submission_open: nowDate <= String(schedule.employee_submission_cutoff),
    approval_open: nowDate <= String(schedule.manager_approval_cutoff),
    attendance_review_open: nowDate <= String(schedule.hr_attendance_review_lock_cutoff),
    calculation_due: nowDate >= String(schedule.payroll_draft_calculation_cutoff),
    lock_due: nowDate >= String(schedule.final_payroll_lock_cutoff)
  };
}

function isPayrollSubmissionOpen(period: Record<string, unknown>) {
  return getPayrollCutoffStatus(period).submission_open;
}

function isPayrollApprovalOpen(period: Record<string, unknown>) {
  return getPayrollCutoffStatus(period).approval_open;
}

function isPayrollAttendanceReviewOpen(period: Record<string, unknown>) {
  return getPayrollCutoffStatus(period).attendance_review_open;
}

function enforcePayrollCutoffForSubmission(c: Context<AppBindings>, period: Record<string, unknown> | null, reason?: string | null) {
  if (!period || isPayrollSubmissionOpen(period)) return null;
  if (has(c, "payroll.cutoff.override") && reason) return null;
  return fail(c, 400, "PAYROLL_SUBMISSION_CUTOFF_PASSED", "Payroll-impacting submissions after cutoff require override permission and a reason.");
}

function enforcePayrollCutoffForApproval(c: Context<AppBindings>, period: Record<string, unknown> | null, reason?: string | null) {
  if (!period || isPayrollApprovalOpen(period)) return null;
  if (has(c, "payroll.cutoff.override") && reason) return null;
  return fail(c, 400, "PAYROLL_APPROVAL_CUTOFF_PASSED", "Payroll-impacting approvals after cutoff require override permission and a reason.");
}

function markLatePayrollAdjustmentCandidate(period: Record<string, unknown> | null, reason?: string | null) {
  if (!period) return { late_payroll_adjustment_candidate: false, reason: reason ?? null };
  return {
    late_payroll_adjustment_candidate: !isPayrollSubmissionOpen(period) || !isPayrollApprovalOpen(period),
    cutoff_status: getPayrollCutoffStatus(period),
    reason: reason ?? null
  };
}

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

async function addEmployeeScope(c: Context<AppBindings>, conditions: string[], params: BindValue[], action: "view" | "manage" = "view", employeeColumn = "e.id") {
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "payroll", action, "e");
  conditions.push(`${employeeColumn} IN (SELECT e.id FROM employees e WHERE ${scope.sql})`);
  params.push(...scope.params);
}

async function payrollReportFilters(c: Context<AppBindings>, runId?: string) {
  const conditions = runId ? ["pre.payroll_run_id = ?"] : ["1 = 1"];
  const params: BindValue[] = runId ? [runId] : [];
  await addEmployeeScope(c, conditions, params, "view", "pre.employee_id");
  const periodId = readString(c.req.query("payroll_period_id") ?? c.req.query("period_id"));
  if (periodId) { conditions.push("pp.id = ?"); params.push(periodId); }
  const departmentId = readString(c.req.query("department_id"));
  if (departmentId) { conditions.push("pre.department_id = ?"); params.push(departmentId); }
  const locationId = readString(c.req.query("location_id"));
  if (locationId) { conditions.push("pre.location_id = ?"); params.push(locationId); }
  const search = readString(c.req.query("search"));
  if (search) { conditions.push("(pre.employee_no_snapshot LIKE ? OR pre.employee_name_snapshot LIKE ?)"); params.push(`%${search}%`, `%${search}%`); }
  return { conditions, params };
}

async function customDeductionReportFilters(c: Context<AppBindings>) {
  const conditions = ["1 = 1"];
  const params: BindValue[] = [];
  await addEmployeeScope(c, conditions, params, "view", "ecda.employee_id");
  const periodId = readString(c.req.query("payroll_period_id") ?? c.req.query("period_id"));
  if (periodId) { conditions.push("ecda.payroll_period_id = ?"); params.push(periodId); }
  const departmentId = readString(c.req.query("department_id"));
  if (departmentId) { conditions.push("e.primary_department_id = ?"); params.push(departmentId); }
  const locationId = readString(c.req.query("location_id"));
  if (locationId) { conditions.push("e.primary_location_id = ?"); params.push(locationId); }
  const search = readString(c.req.query("search"));
  if (search) { conditions.push("(e.employee_no LIKE ? OR e.full_name LIKE ? OR ecd.template_name_snapshot LIKE ?)"); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  return { conditions, params };
}

async function auditPayroll(c: Context<AppBindings>, input: { action: string; entityType: string; entityId?: string | null; oldValue?: unknown; newValue?: unknown; reason?: string | null }) {
  await recordAudit(c.env.DB, {
    actorUserId: c.get("currentUser").id,
    action: input.action,
    module: "payroll",
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    oldValue: input.oldValue,
    newValue: input.newValue,
    reason: input.reason,
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent") ?? null
  });
}

async function publishPayroll(c: Context<AppBindings>, event: Parameters<typeof publishAccessEvent>[1], entityType: "payroll_component" | "payroll_settings" | "payroll_profile" | "salary_history" | "payroll_increment" | "payroll_period" | "payroll_run" | "payroll_run_employee" | "payroll_advance" | "payroll_deduction" | "payroll_adjustment" | "final_settlement" | "payroll_report" | "payroll_approval_event" | "payroll_payslip" | "payroll_payment_register", entityId: string, action: string) {
  await publishAccessEvent(c.env, event, { actor_user_id: c.get("currentUser").id, entity_type: entityType as "payroll_run", entity_id: entityId, action });
  if (event !== "payroll.changed") await publishAccessEvent(c.env, "payroll.changed", { actor_user_id: c.get("currentUser").id, entity_type: entityType as "payroll_run", entity_id: entityId, action });
}

async function getSettings(c: Context<AppBindings>) {
  let settings = await c.env.DB.prepare("SELECT * FROM payroll_settings WHERE id = 'payroll_settings_default'").first<Record<string, unknown>>();
  if (!settings) {
    await c.env.DB.prepare("INSERT INTO payroll_settings (id, default_currency, default_daily_rate_mode, allow_negative_net_salary, require_approval_before_paid, include_attendance_deductions, include_leave_deductions, include_advance_deductions, include_roster_scheduled_days, default_salary_payment_day) VALUES ('payroll_settings_default', 'MVR', 'FIXED_30_DAYS', 0, 1, 1, 1, 1, 1, 28)").run();
    settings = await c.env.DB.prepare("SELECT * FROM payroll_settings WHERE id = 'payroll_settings_default'").first<Record<string, unknown>>();
  }
  return settings!;
}

async function requirePayrollModuleEnabled(c: Context<AppBindings>) {
  const settings = await getSettings(c);
  if (Number(settings.module_enabled ?? 1) !== 1) return fail(c, 503, "PAYROLL_MODULE_DISABLED", "Payroll module is disabled.");
  return null;
}

async function getEmployee(c: Context<AppBindings>, employeeId: string) {
  return c.env.DB
    .prepare(
      `SELECT e.*, s.include_in_payroll, d.name AS department_name, p.title AS position_title, l.name AS location_name
       FROM employees e
       INNER JOIN employee_statuses s ON s.id = e.status_id
       LEFT JOIN departments d ON d.id = e.primary_department_id
       LEFT JOIN positions p ON p.id = e.primary_position_id
       LEFT JOIN locations l ON l.id = e.primary_location_id
       WHERE e.id = ? AND e.archived_at IS NULL`
    )
    .bind(employeeId)
    .first<Record<string, unknown>>();
}

async function getProfile(c: Context<AppBindings>, employeeId: string) {
  return c.env.DB.prepare("SELECT * FROM employee_payroll_profiles WHERE employee_id = ?").bind(employeeId).first<Record<string, unknown>>();
}

async function ensureProfile(c: Context<AppBindings>, employeeId: string) {
  const existing = await getProfile(c, employeeId);
  if (existing) return existing;
  const employee = await getEmployee(c, employeeId);
  if (!employee) return null;
  const settings = await getSettings(c);
  const id = crypto.randomUUID();
  await c.env.DB
    .prepare(
      `INSERT INTO employee_payroll_profiles
       (id, employee_id, basic_salary, currency, payment_method, payroll_included, daily_rate_mode, effective_from)
       VALUES (?, ?, 0, ?, 'CASH', ?, ?, ?)`
    )
    .bind(id, employeeId, settings.default_currency ?? "MVR", bool(employee.payroll_included, true) ? 1 : 0, settings.default_daily_rate_mode ?? "FIXED_30_DAYS", employee.joining_date ?? null)
    .run();
  return getProfile(c, employeeId);
}

function safeProfile(profile: Record<string, unknown>, canSensitive: boolean) {
  if (canSensitive) return profile;
  const copy = { ...profile };
  copy.bank_name = null;
  copy.bank_account_no = null;
  copy.bank_account_name = null;
  return copy;
}

function safeBankLoan(row: Record<string, unknown>, canSensitive: boolean) {
  if (canSensitive) return row;
  const copy = { ...row };
  copy.loan_reference_number = "Restricted";
  copy.employer_undertaking_reference = null;
  copy.eligibility_reason = null;
  copy.notes = null;
  copy.sensitive_values_restricted = true;
  return copy;
}

function safeBankLoanPayment(row: Record<string, unknown>, canSensitive: boolean) {
  if (canSensitive) return row;
  const copy = { ...row };
  copy.loan_reference_number_snapshot = "Restricted";
  copy.remittance_reference = null;
  copy.notes = null;
  copy.sensitive_values_restricted = true;
  return copy;
}

function safePensionProfile(row: Record<string, unknown> | null, canSensitive: boolean) {
  if (!row || canSensitive) return row;
  const copy = { ...row };
  copy.pension_member_id = "Restricted";
  copy.registration_number = "Restricted";
  copy.exemption_reason = null;
  copy.notes = null;
  copy.sensitive_values_restricted = true;
  return copy;
}

function parseJsonRecord(value: unknown) {
  if (typeof value !== "string" || !value) return {} as Record<string, unknown>;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function canViewPayrollResultSensitive(c: Context<AppBindings>) {
  return hasAny(c, ["payroll.results.sensitive.view", "payroll.reports.sensitive.view", "payroll.payment_register.sensitive.view", "payroll.results.update", "payroll.runs.manage", "payroll.manage", "employees.payroll.update"]);
}

function safePayrollResult(row: Record<string, unknown>, canSensitive: boolean) {
  if (canSensitive) return row;
  const copy = { ...row };
  for (const key of [
    "basic_salary",
    "total_earnings",
    "total_deductions",
    "advance_deductions",
    "attendance_deductions",
    "leave_deductions",
    "other_deductions",
    "net_salary",
  ]) {
    copy[key] = null;
  }
  copy.sensitive_values_restricted = true;
  return copy;
}

function safePayrollLineItem(row: Record<string, unknown>, canSensitive: boolean) {
  if (canSensitive) return row;
  const copy = { ...row };
  copy.amount = null;
  copy.calculation_json = null;
  copy.sensitive_values_restricted = true;
  return copy;
}

async function componentByCode(c: Context<AppBindings>, code: string) {
  return c.env.DB.prepare("SELECT id FROM payroll_components WHERE code = ?").bind(code).first<{ id: string }>();
}

function readComponent(body: Record<string, unknown>, existing?: Record<string, unknown>) {
  const type = getPayrollComponentType(body.type ?? existing?.type, body.code ?? existing?.code);
  const category = readString(body.category ?? existing?.category).toUpperCase();
  const calculationType = getPayrollComponentCalculationMode(body.calculation_type ?? existing?.calculation_type);
  return {
    code: readString(body.code ?? existing?.code).toUpperCase(),
    name: readString(body.name ?? existing?.name),
    type: COMPONENT_TYPES.has(type) ? type : "",
    category: category && COMPONENT_CATEGORIES.has(category) ? category : null,
    calculation_type: CALCULATION_TYPES.has(calculationType) ? calculationType : "",
    default_amount: num(body.default_amount, existing?.default_amount == null ? null : Number(existing.default_amount)),
    default_percentage: num(body.default_percentage, existing?.default_percentage == null ? null : Number(existing.default_percentage)),
    applies_to_basic_salary: bool(body.applies_to_basic_salary, existing ? Boolean(existing.applies_to_basic_salary) : false),
    is_taxable: body.is_taxable == null && existing?.is_taxable == null ? null : bool(body.is_taxable ?? existing?.is_taxable, false),
    is_active: bool(body.is_active, existing ? Boolean(existing.is_active) : true),
    sort_order: num(body.sort_order, existing?.sort_order == null ? 100 : Number(existing.sort_order)) ?? 100
  };
}

function employeeFilter(c: Context<AppBindings>, conditions: string[], params: BindValue[]) {
  const search = readString(c.req.query("search"));
  if (search) { conditions.push("(e.employee_no LIKE ? OR e.full_name LIKE ?)"); params.push(`%${search}%`, `%${search}%`); }
  const status = readString(c.req.query("status"));
  if (status) { conditions.push("x.status = ?"); params.push(status); }
  const departmentId = readString(c.req.query("department_id"));
  if (departmentId) { conditions.push("e.primary_department_id = ?"); params.push(departmentId); }
  const locationId = readString(c.req.query("location_id"));
  if (locationId) { conditions.push("e.primary_location_id = ?"); params.push(locationId); }
}

async function scopedEmployeeFilter(c: Context<AppBindings>, conditions: string[], params: BindValue[], action: "view" | "manage" = "view") {
  await addEmployeeScope(c, conditions, params, action, "e.id");
  employeeFilter(c, conditions, params);
}

async function getPeriod(c: Context<AppBindings>, id: string) {
  return c.env.DB.prepare("SELECT pp.*, u.name AS created_by_name FROM payroll_periods pp LEFT JOIN users u ON u.id = pp.created_by_user_id WHERE pp.id = ?").bind(id).first<Record<string, unknown>>();
}

async function getRun(c: Context<AppBindings>, id: string) {
  return c.env.DB
    .prepare(
      `SELECT pr.*, pp.period_month, pp.period_year, pp.start_date, pp.end_date,
        (SELECT COUNT(*) FROM payroll_employee_results pre WHERE pre.payroll_run_id = pr.id) AS employee_count,
        (SELECT COALESCE(SUM(total_earnings), 0) FROM payroll_employee_results pre WHERE pre.payroll_run_id = pr.id) AS total_earnings,
        (SELECT COALESCE(SUM(total_deductions), 0) FROM payroll_employee_results pre WHERE pre.payroll_run_id = pr.id) AS total_deductions,
        (SELECT COALESCE(SUM(net_salary), 0) FROM payroll_employee_results pre WHERE pre.payroll_run_id = pr.id) AS net_salary_total
       FROM payroll_runs pr
       INNER JOIN payroll_periods pp ON pp.id = pr.payroll_period_id
       WHERE pr.id = ?`
    )
    .bind(id)
    .first<Record<string, unknown>>();
}

function canUseGlobalPayrollRunSummary(c: Context<AppBindings>, scope: Awaited<ReturnType<typeof buildEmployeeScopeWhereClause>>) {
  return c.get("currentUser").is_owner || scope.summary.scope_type === "WHOLE_COMPANY";
}

async function getScopedRun(c: Context<AppBindings>, id: string, action: "view" | "manage" = "view") {
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "payroll", action, "e");
  if (canUseGlobalPayrollRunSummary(c, scope)) return getRun(c, id);
  const scopedEmployeeSql = `SELECT e.id FROM employees e WHERE ${scope.sql}`;
  return c.env.DB
    .prepare(
      `SELECT pr.*, pp.period_month, pp.period_year, pp.start_date, pp.end_date,
        COUNT(pre.id) AS employee_count,
        COALESCE(SUM(pre.total_earnings), 0) AS total_earnings,
        COALESCE(SUM(pre.total_deductions), 0) AS total_deductions,
        COALESCE(SUM(pre.net_salary), 0) AS net_salary_total
       FROM payroll_runs pr
       INNER JOIN payroll_periods pp ON pp.id = pr.payroll_period_id
       INNER JOIN payroll_employee_results pre ON pre.payroll_run_id = pr.id
       WHERE pr.id = ? AND pre.employee_id IN (${scopedEmployeeSql})
       GROUP BY pr.id`
    )
    .bind(id, ...scope.params)
    .first<Record<string, unknown>>();
}

async function recalculateRun(c: Context<AppBindings>, run: Record<string, unknown>, mode: "generate" | "recalculate") {
  const period = await getPeriod(c, String(run.payroll_period_id));
  if (!period) return { error: "Payroll period was not found." };
  const settings = await getSettings(c);
  const runId = String(run.id);
  await c.env.DB.prepare("UPDATE payroll_runs SET status = 'CALCULATING', updated_at = ? WHERE id = ?").bind(isoNow(), runId).run();
  await c.env.DB.prepare("UPDATE payroll_periods SET status = 'CALCULATING', updated_at = ? WHERE id = ?").bind(isoNow(), period.id).run();
  await c.env.DB.prepare("DELETE FROM payroll_result_line_items WHERE payroll_run_employee_id IN (SELECT id FROM payroll_employee_results WHERE payroll_run_id = ?)").bind(runId).run();
  await c.env.DB.prepare("DELETE FROM employee_custom_deduction_applications WHERE payroll_run_id = ? AND application_status IN ('SCHEDULED', 'APPLIED_IN_PAYROLL', 'PARTIAL', 'SKIPPED', 'FAILED')").bind(runId).run();
  await c.env.DB.prepare("DELETE FROM payroll_employee_results WHERE payroll_run_id = ? AND status != 'HELD'").bind(runId).run();

  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "payroll", "manage", "e");
  const employees = (await c.env.DB
    .prepare(
      `SELECT e.id, e.employee_no, e.full_name, e.primary_department_id, e.primary_position_id, e.primary_location_id,
        e.payroll_included AS employee_payroll_included, s.include_in_payroll, p.*
       FROM employees e
       INNER JOIN employee_statuses s ON s.id = e.status_id
       LEFT JOIN employee_payroll_profiles p ON p.employee_id = e.id
       WHERE e.archived_at IS NULL AND ${scope.sql}
       ORDER BY e.employee_no`
    )
    .bind(...scope.params)
    .all<Record<string, unknown>>()).results;

  const basicComponent = await componentByCode(c, "BASIC_SALARY");
  const advanceComponent = await componentByCode(c, "ADVANCE_DEDUCTION");
  const absenceComponent = await componentByCode(c, "ABSENCE_DEDUCTION");
  const leaveComponent = await componentByCode(c, "LEAVE_DEDUCTION");
  const otherComponent = await componentByCode(c, "OTHER_DEDUCTION");
  const bankLoanComponent = await componentByCode(c, "BANK_LOAN_DEDUCTION");
  const pensionEmployeeComponent = await componentByCode(c, "PENSION_EMPLOYEE_CONTRIBUTION");
  const pensionEmployerComponent = await componentByCode(c, "PENSION_EMPLOYER_CONTRIBUTION");
  const customDeductionComponent = await componentByCode(c, "OTHER_DEDUCTION");
  const startDate = String(period.start_date);
  const endDate = String(period.end_date);
  const daysInPeriod = daysBetween(startDate, endDate);

  for (const employee of employees) {
    const profileIncluded = employee.payroll_included == null ? bool(employee.employee_payroll_included, true) : bool(employee.payroll_included, true);
    const statusIncluded = bool(employee.include_in_payroll, true);
    const runEmployeeId = crypto.randomUUID();
    const basicSalary = Number(employee.basic_salary ?? 0);
    const excluded = !profileIncluded || !statusIncluded;

    const attendance = await c.env.DB
      .prepare(
        `SELECT
          SUM(CASE WHEN status = 'PRESENT' THEN 1 ELSE 0 END) AS days_worked,
          SUM(CASE WHEN status = 'ABSENT' THEN 1 ELSE 0 END) AS absent_days,
          SUM(CASE WHEN status = 'LATE' THEN 1 ELSE 0 END) AS late_days,
          SUM(CASE WHEN missed_punch = 1 THEN 1 ELSE 0 END) AS missed_punch_days,
          SUM(COALESCE(payroll_impact_days, 0)) AS payroll_impact_days,
          SUM(COALESCE(payroll_impact_minutes, 0)) AS payroll_impact_minutes,
          GROUP_CONCAT(CASE WHEN payroll_impact_status IS NOT NULL THEN payroll_impact_reason ELSE NULL END) AS payroll_impact_reason,
          GROUP_CONCAT(CASE WHEN correction_status IS NOT NULL THEN correction_status ELSE NULL END) AS correction_statuses,
          SUM(CASE WHEN locked_for_payroll = 1 THEN 1 ELSE 0 END) AS locked_for_payroll_days,
          GROUP_CONCAT(CASE WHEN status = 'ABSENT' OR missed_punch = 1 THEN attendance_date ELSE NULL END) AS missed_dates
         FROM attendance_daily_records
         WHERE employee_id = ? AND attendance_date BETWEEN ? AND ?`
      )
      .bind(employee.id, startDate, endDate)
      .first<Record<string, unknown>>();
    const leave = await c.env.DB
      .prepare(
        `SELECT COUNT(*) AS leave_days,
          SUM(CASE WHEN lp.salary_deduction_mode IS NOT NULL AND lp.salary_deduction_mode NOT IN ('NONE', 'NO_DEDUCTION') THEN 1 ELSE 0 END) AS unpaid_leave_days,
          COALESCE(SUM(lpi.chargeable_days), 0) AS payroll_impact_days,
          COALESCE(SUM(lpi.estimated_amount), 0) AS payroll_impact_amount
         FROM leave_request_days lrd
         INNER JOIN leave_requests lr ON lr.id = lrd.leave_request_id
         LEFT JOIN leave_policies lp ON lp.id = lr.policy_id
         LEFT JOIN leave_payroll_impacts lpi ON lpi.leave_request_id = lr.id AND lpi.status != 'IGNORED'
         WHERE lr.employee_id = ? AND lr.status = 'APPROVED' AND lrd.leave_date BETWEEN ? AND ?`
      )
      .bind(employee.id, startDate, endDate)
      .first<Record<string, unknown>>();
    const roster = await c.env.DB.prepare(
      `SELECT
         SUM(CASE WHEN status IN ('SCHEDULED', 'PUBLISHED', 'CHANGED_AFTER_PUBLISH') THEN 1 ELSE 0 END) AS scheduled_work_days,
         SUM(CASE WHEN status IN ('DAY_OFF', 'PUBLIC_HOLIDAY') THEN 1 ELSE 0 END) AS roster_non_work_days,
         SUM(CASE WHEN status IN ('LEAVE', 'SICK_LEAVE', 'LONG_LEAVE') THEN 1 ELSE 0 END) AS roster_leave_days
       FROM roster_assignments
       WHERE employee_id = ? AND roster_date BETWEEN ? AND ?`
    ).bind(employee.id, startDate, endDate).first<Record<string, unknown>>();
    const advances = bool(settings.include_advance_deductions, true)
      ? (await c.env.DB.prepare("SELECT * FROM payroll_advance_payments WHERE employee_id = ? AND payment_date BETWEEN ? AND ? AND status IN ('APPROVED', 'PAID')").bind(employee.id, startDate, endDate).all<Record<string, unknown>>()).results
      : [];
    const deductions = (await c.env.DB.prepare("SELECT * FROM payroll_deductions WHERE employee_id = ? AND status = 'ACTIVE' AND (payroll_period_id IS NULL OR payroll_period_id = ?)").bind(employee.id, period.id).all<Record<string, unknown>>()).results;
    const adjustments = (await c.env.DB.prepare("SELECT * FROM payroll_adjustments WHERE employee_id = ? AND status IN ('APPROVED_PLACEHOLDER', 'APPROVED') AND (payroll_period_id IS NULL OR payroll_period_id = ?)").bind(employee.id, period.id).all<Record<string, unknown>>()).results;

    const absentDays = Number(attendance?.absent_days ?? 0);
    const lateDays = Number(attendance?.late_days ?? 0);
    const missedPunchDays = Number(attendance?.missed_punch_days ?? 0);
    const unpaidLeaveDays = Number(leave?.unpaid_leave_days ?? 0);
    const dailyRateDivisor = employee.daily_rate_mode === "CALENDAR_DAYS" ? daysInPeriod : employee.daily_rate_mode === "WORKING_DAYS" ? Math.max(1, Number(roster?.scheduled_work_days ?? daysInPeriod)) : 30;
    const dailyRate = dailyRateDivisor > 0 ? basicSalary / dailyRateDivisor : 0;
    const attendanceDeductions = bool(settings.include_attendance_deductions, true) && bool(employee.missed_day_deduction_enabled, true) ? Number((dailyRate * absentDays).toFixed(2)) : 0;
    const leaveDeductions = bool(settings.include_leave_deductions, true) && bool(employee.leave_deduction_enabled, true) ? Number((dailyRate * unpaidLeaveDays).toFixed(2)) : 0;
    const advanceDeductions = advances.reduce((sum, advance) => sum + Number(advance.amount ?? 0), 0);
    const fixedDeductions = deductions.reduce((sum, deduction) => sum + Number(deduction.amount ?? 0), 0);
    const adjustmentEarnings = adjustments.filter((row) => row.adjustment_type === "EARNING").reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    const adjustmentDeductions = adjustments.filter((row) => row.adjustment_type === "DEDUCTION").reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
    const totalEarnings = excluded ? 0 : Number((basicSalary + adjustmentEarnings).toFixed(2));
    const pensionImpact = excluded ? null : await calculatePayrollPensionContribution(c, employee, period, basicSalary, settings);
    const pensionEmployeeDeduction = Number(pensionImpact?.employee_contribution_amount ?? 0);
    const bankLoanImpact = excluded ? { loans: [], total: 0, warnings: [] as string[], insufficient_salary_mode: readString(settings.bank_loan_insufficient_salary_mode) || "REQUIRE_OVERRIDE", requires_resolution: false } : await getActiveApprovedBankLoansForPayroll(c, String(employee.id), period, totalEarnings - pensionEmployeeDeduction, settings);
    const bankLoanDeductions = Number(bankLoanImpact.total ?? 0);
    const customDeductionImpact = excluded ? { deductions: [], applications: [], total: 0, warnings: [] as string[], requires_resolution: false } : await applyCustomDeductionsToPayroll(c, String(employee.id), period, basicSalary, totalEarnings, totalEarnings - pensionEmployeeDeduction - bankLoanDeductions, settings);
    const customDeductions = Number(customDeductionImpact.total ?? 0);
    const totalDeductions = excluded ? 0 : Number((pensionEmployeeDeduction + bankLoanDeductions + customDeductions + advanceDeductions + attendanceDeductions + leaveDeductions + fixedDeductions + adjustmentDeductions).toFixed(2));
    let netSalary = totalEarnings - totalDeductions;
    const clamped = netSalary < 0 && !bool(settings.allow_negative_net_salary, false);
    if (clamped) netSalary = 0;
    const bankLoanRequiresResolution = bool(bankLoanImpact.requires_resolution, false);
    const customDeductionRequiresResolution = bool(customDeductionImpact.requires_resolution, false);
    const bankLoanHoldReason = bankLoanRequiresResolution ? `Bank loan deduction requires payroll review: ${(bankLoanImpact.warnings ?? []).join(" ")}` : null;
    const customDeductionHoldReason = customDeductionRequiresResolution ? `Custom deduction requires payroll review: ${(customDeductionImpact.warnings ?? []).join(" ")}` : null;
    const missedDates = readString(attendance?.missed_dates).split(",").filter(Boolean);
    const calculation = {
      foundation: true,
      mode,
      daily_rate: dailyRate,
      daily_rate_divisor: dailyRateDivisor,
      attendance,
      leave,
      roster,
      pension: pensionImpact,
      bank_loans: bankLoanImpact.loans,
      bank_loan_deduction: bankLoanDeductions,
      bank_loan_warnings: bankLoanImpact.warnings,
      bank_loan_insufficient_salary_mode: bankLoanImpact.insufficient_salary_mode ?? settings.bank_loan_insufficient_salary_mode,
      bank_loan_requires_resolution: bankLoanRequiresResolution,
      custom_deductions: customDeductionImpact.applications,
      custom_deduction_total: customDeductions,
      custom_deduction_warnings: customDeductionImpact.warnings,
      custom_deduction_requires_resolution: customDeductionRequiresResolution,
      payroll_deduction_priority_json: settings.payroll_deduction_priority_json,
      advances: advances.map((advance) => ({ id: advance.id, amount: advance.amount, payment_date: advance.payment_date })),
      deductions: deductions.map((deduction) => ({ id: deduction.id, amount: deduction.amount, reason: deduction.reason })),
      adjustments: adjustments.map((adjustment) => ({ id: adjustment.id, amount: adjustment.amount, type: adjustment.adjustment_type, reason: adjustment.reason })),
      cutoff: markLatePayrollAdjustmentCandidate(period),
      negative_net_salary_clamped: clamped
    };

    await c.env.DB
      .prepare(
        `INSERT INTO payroll_employee_results
         (id, payroll_run_id, employee_id, employee_no_snapshot, employee_name_snapshot, department_id, position_id, location_id,
          basic_salary, total_earnings, total_deductions, advance_deductions, attendance_deductions, leave_deductions, other_deductions, net_salary,
          days_in_period, scheduled_work_days, days_worked, absent_days, leave_days, unpaid_leave_days, late_days, missed_punch_days,
          missed_date_ranges_json, calculation_json, status, hold_reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        runEmployeeId,
        runId,
        employee.id,
        employee.employee_no,
        employee.full_name,
        employee.primary_department_id,
        employee.primary_position_id,
        employee.primary_location_id,
        basicSalary,
        totalEarnings,
        totalDeductions,
        advanceDeductions,
        attendanceDeductions,
        leaveDeductions,
        fixedDeductions + adjustmentDeductions,
        // Prompt 12B custom deductions are included in total_deductions and line items; keep legacy other_deductions as manual deductions only for compatibility.
        netSalary,
        daysInPeriod,
        bool(settings.include_roster_scheduled_days, true) ? Number(roster?.scheduled_work_days ?? 0) : null,
        Number(attendance?.days_worked ?? 0),
        absentDays,
        Number(leave?.leave_days ?? 0),
        unpaidLeaveDays,
        lateDays,
        missedPunchDays,
        JSON.stringify(missedDates),
        JSON.stringify(calculation),
        excluded ? "EXCLUDED" : bankLoanRequiresResolution || customDeductionRequiresResolution ? "HELD" : "READY_FOR_REVIEW",
        excluded ? "Employee or employee status is excluded from payroll." : bankLoanHoldReason ?? customDeductionHoldReason
      )
      .run();

    if (excluded) continue;
    await insertLine(c, runEmployeeId, basicComponent?.id ?? null, "EARNING", "BASIC", "Basic salary", basicSalary, "PROFILE", "employee_payroll_profile", String(employee.id), { daily_rate: dailyRate });
    if (pensionEmployeeDeduction > 0 && pensionImpact) await insertLine(c, runEmployeeId, pensionEmployeeComponent?.id ?? null, "DEDUCTION", "PENSION", "Pension employee contribution", pensionEmployeeDeduction, "SYSTEM", "payroll_pension_contribution", String(employee.id), pensionImpact);
    if (Number(pensionImpact?.employer_contribution_amount ?? 0) > 0 && pensionImpact) await insertLine(c, runEmployeeId, pensionEmployerComponent?.id ?? null, "EMPLOYER_COST", "PENSION_EMPLOYER_COST", "Pension employer contribution (company cost)", Number(pensionImpact.employer_contribution_amount), "SYSTEM", "payroll_pension_contribution", String(employee.id), { ...pensionImpact, company_cost_only: true, not_employee_earning: true });
    if (bankLoanDeductions > 0) await insertLine(c, runEmployeeId, bankLoanComponent?.id ?? null, "DEDUCTION", "BANK_LOAN", "Bank loan salary deduction", bankLoanDeductions, "SYSTEM", "employee_bank_loan", String(employee.id), bankLoanImpact.loans);
    const customDeductionApplications = customDeductionImpact.applications as Record<string, unknown>[];
    for (const customDeduction of customDeductionApplications) {
      if (Number(customDeduction.deducted_amount ?? 0) > 0) {
        await insertLine(c, runEmployeeId, customDeductionComponent?.id ?? null, "DEDUCTION", "CUSTOM_DEDUCTION", String(customDeduction.template_name_snapshot ?? "Custom deduction"), Number(customDeduction.deducted_amount), "CUSTOM_DEDUCTION", "employee_custom_deduction", String(customDeduction.id), customDeduction);
      }
    }
    if (advanceDeductions > 0) await insertLine(c, runEmployeeId, advanceComponent?.id ?? null, "DEDUCTION", "ADVANCE", "Advance payments", advanceDeductions, "ADVANCE", null, null, advances);
    if (attendanceDeductions > 0) await insertLine(c, runEmployeeId, absenceComponent?.id ?? null, "DEDUCTION", "ATTENDANCE", "Attendance absence deduction", attendanceDeductions, "ATTENDANCE", null, null, attendance);
    if (leaveDeductions > 0) await insertLine(c, runEmployeeId, leaveComponent?.id ?? null, "DEDUCTION", "LEAVE", "Unpaid leave deduction", leaveDeductions, "LEAVE", null, null, leave);
    for (const deduction of deductions) await insertLine(c, runEmployeeId, deduction.payroll_component_id ? String(deduction.payroll_component_id) : otherComponent?.id ?? null, "DEDUCTION", "OTHER", String(deduction.reason), Number(deduction.amount), "MANUAL", "payroll_deduction", String(deduction.id), deduction);
    for (const adjustment of adjustments) await insertLine(c, runEmployeeId, null, adjustment.adjustment_type as ComponentType, "OTHER", String(adjustment.reason), Number(adjustment.amount), "MANUAL", "payroll_adjustment", String(adjustment.id), adjustment);
    await recordPayrollPensionContribution(c, period, run, runEmployeeId, String(employee.id), pensionImpact);
    await recordBankLoanPayrollPayments(c, period, run, runEmployeeId, String(employee.id), bankLoanImpact.loans);
    await recordCustomDeductionPayrollApplications(c, period, run, runEmployeeId, String(employee.id), customDeductionApplications);
  }
  await c.env.DB.prepare("UPDATE payroll_runs SET status = 'READY_FOR_REVIEW', updated_at = ? WHERE id = ?").bind(isoNow(), runId).run();
  await c.env.DB.prepare("UPDATE payroll_periods SET status = 'READY_FOR_REVIEW', updated_at = ? WHERE id = ?").bind(isoNow(), period.id).run();
  await syncLegacyPayrollRunTablesForCompatibility(c, runId);
  return { ok: true };
}

async function insertLine(c: Context<AppBindings>, runEmployeeId: string, componentId: string | null, lineType: ComponentType, category: string | null, description: string, amount: number, source: string, sourceType: string | null, sourceId: string | null, calculation: unknown) {
  await c.env.DB
    .prepare("INSERT INTO payroll_result_line_items (id, payroll_run_employee_id, payroll_component_id, line_type, category, description, amount, source, source_entity_type, source_entity_id, calculation_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), runEmployeeId, componentId, lineType, category, description, Math.max(0, Number(amount.toFixed(2))), source, sourceType, sourceId, JSON.stringify(calculation))
    .run();
}

async function syncLegacyPayrollRunTablesForCompatibility(c: Context<AppBindings>, runId: string) {
  await c.env.DB.prepare("DELETE FROM payroll_run_lines WHERE payroll_run_employee_id IN (SELECT id FROM payroll_run_employees WHERE payroll_run_id = ?)").bind(runId).run();
  await c.env.DB.prepare("DELETE FROM payroll_run_employees WHERE payroll_run_id = ?").bind(runId).run();
  await c.env.DB.prepare(
    `INSERT INTO payroll_run_employees
     (id, payroll_run_id, employee_id, employee_no_snapshot, employee_name_snapshot, department_id, position_id, location_id,
      basic_salary, total_earnings, total_deductions, advance_deductions, attendance_deductions, leave_deductions, other_deductions, net_salary,
      days_in_period, scheduled_work_days, days_worked, absent_days, leave_days, unpaid_leave_days, late_days, missed_punch_days,
      missed_date_ranges_json, calculation_json, status, hold_reason, created_at, updated_at)
     SELECT id, payroll_run_id, employee_id, employee_no_snapshot, employee_name_snapshot, department_id, position_id, location_id,
      basic_salary, total_earnings, total_deductions, advance_deductions, attendance_deductions, leave_deductions, other_deductions, net_salary,
      days_in_period, scheduled_work_days, days_worked, absent_days, leave_days, unpaid_leave_days, late_days, missed_punch_days,
      missed_date_ranges_json, calculation_json,
      CASE status
        WHEN 'READY_FOR_REVIEW' THEN 'REVIEW'
        WHEN 'SUBMITTED_FOR_APPROVAL' THEN 'REVIEW'
        WHEN 'APPROVED' THEN 'APPROVED'
        WHEN 'FINALIZED' THEN 'APPROVED'
        WHEN 'APPROVED_PLACEHOLDER' THEN 'APPROVED'
        WHEN 'FINALIZED_PLACEHOLDER' THEN 'APPROVED'
        WHEN 'HELD' THEN 'HELD'
        WHEN 'EXCLUDED' THEN 'EXCLUDED'
        ELSE 'DRAFT'
      END,
      hold_reason, created_at, updated_at
     FROM payroll_employee_results
     WHERE payroll_run_id = ?`
  ).bind(runId).run();
  await c.env.DB.prepare(
    `INSERT INTO payroll_run_lines
     (id, payroll_run_employee_id, payroll_component_id, line_type, category, description, amount, source, source_entity_type, source_entity_id, calculation_json, created_at)
     SELECT id, payroll_run_employee_id, payroll_component_id, line_type, category, description, amount, source, source_entity_type, source_entity_id, calculation_json, created_at
     FROM payroll_result_line_items
     WHERE payroll_run_employee_id IN (SELECT id FROM payroll_employee_results WHERE payroll_run_id = ?)`
  ).bind(runId).run();
}

async function getRunEmployee(c: Context<AppBindings>, id: string) {
  return c.env.DB.prepare("SELECT pre.*, d.name AS department_name, p.title AS position_title, l.name AS location_name FROM payroll_employee_results pre LEFT JOIN departments d ON d.id = pre.department_id LEFT JOIN positions p ON p.id = pre.position_id LEFT JOIN locations l ON l.id = pre.location_id WHERE pre.id = ?").bind(id).first<Record<string, unknown>>();
}

async function canManagePayrollFinalization(c: Context<AppBindings>) {
  return hasAny(c, ["payroll.finalization.manage", "payroll.finalization.finalize", "payroll.manage"]);
}

async function ensureRunAccess(c: Context<AppBindings>, runId: string, action: "view" | "manage" = "view") {
  const run = await getScopedRun(c, runId, action);
  if (!run) return { run: null, response: fail(c, 404, "PAYROLL_RUN_NOT_FOUND", "Payroll run not found.") };
  return { run, response: null };
}

async function recordPayrollApprovalEvent(c: Context<AppBindings>, run: Record<string, unknown>, action: string, previousStatus: string, newStatus: string, input: { note?: string | null; reason?: string | null; metadata?: unknown } = {}) {
  const id = crypto.randomUUID();
  const user = c.get("currentUser");
  await c.env.DB
    .prepare(
      `INSERT INTO payroll_approval_events
       (id, payroll_period_id, payroll_run_id, action, previous_status, new_status, actor_user_id, actor_name_snapshot, note, reason, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, run.payroll_period_id, run.id, action, previousStatus, newStatus, user.id, user.name ?? user.email ?? "User", input.note ?? null, input.reason ?? null, input.metadata ? JSON.stringify(input.metadata) : null)
    .run();
  await auditPayroll(c, {
    action,
    entityType: "payroll_run",
    entityId: String(run.id),
    oldValue: { status: previousStatus },
    newValue: { status: newStatus, note: input.note ?? null },
    reason: input.reason ?? null
  });
  await publishPayroll(c, "payroll.changed", "payroll_approval_event", id, action);
  return id;
}

async function transitionPayrollRun(c: Context<AppBindings>, run: Record<string, unknown>, nextStatus: PayrollRunLifecycleStatus, input: { note?: string | null; reason?: string | null; action: string; resultStatus?: PayrollResultLifecycleStatus; extraRunSet?: string; extraRunParams?: BindValue[] } = { action: "payroll.run.status_changed" }) {
  const previousStatus = readString(run.status);
  const now = isoNow();
  const extraSet = input.extraRunSet ? `, ${input.extraRunSet}` : "";
  const extraParams = input.extraRunParams ?? [];
  await c.env.DB.prepare(`UPDATE payroll_runs SET status = ?, updated_at = ?${extraSet} WHERE id = ?`).bind(nextStatus, now, ...extraParams, run.id).run();
  await c.env.DB.prepare("UPDATE payroll_periods SET status = ?, updated_at = ? WHERE id = ?").bind(nextStatus, now, run.payroll_period_id).run();
  if (input.resultStatus) {
    await c.env.DB
      .prepare("UPDATE payroll_employee_results SET status = ?, updated_at = ? WHERE payroll_run_id = ? AND status NOT IN ('HELD', 'EXCLUDED', 'CANCELLED')")
      .bind(input.resultStatus, now, run.id)
      .run();
  }
  await syncLegacyPayrollRunTablesForCompatibility(c, String(run.id));
  await recordPayrollApprovalEvent(c, run, input.action, previousStatus, nextStatus, { note: input.note, reason: input.reason });
  await publishPayroll(c, "payroll.changed", "payroll_run", String(run.id), input.action);
  return getRun(c, String(run.id));
}

async function submitPayrollRunForApproval(c: Context<AppBindings>, runId: string, note?: string | null) {
  const disabled = await requirePayrollModuleEnabled(c);
  if (disabled) return { response: disabled };
  const { run, response } = await ensureRunAccess(c, runId, "manage");
  if (!run) return { response };
  const status = mapLegacyPayrollRunStatus(run.status);
  if (!["READY_FOR_REVIEW", "SENT_BACK"].includes(status)) return { response: fail(c, 400, "PAYROLL_RUN_NOT_APPROVABLE", "This payroll run is not ready for approval.") };
  const saved = await transitionPayrollRun(c, run, "SUBMITTED_FOR_APPROVAL", { action: "payroll.run.submitted_for_approval", note: note ?? null, resultStatus: "SUBMITTED_FOR_APPROVAL" });
  return { run: saved };
}

async function approvePayrollRun(c: Context<AppBindings>, runId: string, note?: string | null) {
  const disabled = await requirePayrollModuleEnabled(c);
  if (disabled) return { response: disabled };
  const { run, response } = await ensureRunAccess(c, runId, "manage");
  if (!run) return { response };
  const status = mapLegacyPayrollRunStatus(run.status);
  if (status !== "SUBMITTED_FOR_APPROVAL" && !hasAny(c, ["payroll.approvals.manage", "payroll.manage"])) {
    return { response: fail(c, 400, "PAYROLL_RUN_NOT_APPROVABLE", "Only submitted payroll runs can be approved.") };
  }
  const now = isoNow();
  const saved = await transitionPayrollRun(c, run, "APPROVED", {
    action: "payroll.run.approved",
    note: note ?? null,
    resultStatus: "APPROVED",
    extraRunSet: "approved_by_user_id = ?, approved_at = ?",
    extraRunParams: [c.get("currentUser").id, now]
  });
  return { run: saved };
}

async function rejectPayrollRun(c: Context<AppBindings>, runId: string, action: "reject" | "send_back", reason: string, note?: string | null) {
  const disabled = await requirePayrollModuleEnabled(c);
  if (disabled) return { response: disabled };
  if (!reason) return { response: fail(c, 400, "REASON_REQUIRED", "Reason is required.") };
  const { run, response } = await ensureRunAccess(c, runId, "manage");
  if (!run) return { response };
  const status = mapLegacyPayrollRunStatus(run.status);
  if (status !== "SUBMITTED_FOR_APPROVAL" && !hasAny(c, ["payroll.approvals.manage", "payroll.manage"])) {
    return { response: fail(c, 400, "INVALID_STATUS", "Only submitted payroll runs can be rejected or sent back.") };
  }
  const now = isoNow();
  const nextStatus = action === "reject" ? "REJECTED" : "SENT_BACK";
  const saved = await transitionPayrollRun(c, run, nextStatus, {
    action: action === "reject" ? "payroll.run.rejected" : "payroll.run.sent_back",
    note: note ?? null,
    reason,
    resultStatus: "READY_FOR_REVIEW",
    extraRunSet: "rejected_by_user_id = ?, rejected_at = ?, rejection_reason = ?",
    extraRunParams: [c.get("currentUser").id, now, reason]
  });
  return { run: saved };
}

async function getFinalizationSnapshot(c: Context<AppBindings>, run: Record<string, unknown>) {
  const results = (await c.env.DB.prepare("SELECT * FROM payroll_employee_results WHERE payroll_run_id = ? ORDER BY employee_no_snapshot").bind(run.id).all()).results;
  const lines = (await c.env.DB.prepare("SELECT * FROM payroll_result_line_items WHERE payroll_run_employee_id IN (SELECT id FROM payroll_employee_results WHERE payroll_run_id = ?) ORDER BY payroll_run_employee_id, line_type, category").bind(run.id).all()).results;
  return { run, results, lines, frozen_at: isoNow(), source: "payroll_employee_results/payroll_result_line_items" };
}

async function finalizePayrollRun(c: Context<AppBindings>, runId: string, note?: string | null, override = false) {
  const disabled = await requirePayrollModuleEnabled(c);
  if (disabled) return { response: disabled };
  const { run, response } = await ensureRunAccess(c, runId, "manage");
  if (!run) return { response };
  const status = mapLegacyPayrollRunStatus(run.status);
  const canOverride = override && hasAny(c, ["payroll.override_finalized", "payroll.finalization.manage", "payroll.manage"]);
  if (status !== "APPROVED" && status !== "APPROVED_PLACEHOLDER" && !canOverride) {
    return { response: fail(c, 400, "PAYROLL_RUN_NOT_FINALIZABLE", "This payroll run must be approved before finalization.") };
  }
  const snapshot = await getFinalizationSnapshot(c, run);
  const now = isoNow();
  await c.env.DB
    .prepare("UPDATE payroll_runs SET status = ?, finalized_by_user_id = ?, finalized_at = ?, locked_by_user_id = ?, locked_at = ?, finalization_note = ?, finalization_snapshot_json = ?, updated_at = ? WHERE id = ?")
    .bind("FINALIZED", c.get("currentUser").id, now, c.get("currentUser").id, now, note ?? null, JSON.stringify(snapshot), now, run.id)
    .run();
  await c.env.DB
    .prepare("UPDATE payroll_periods SET status = ?, finalized_by_user_id = ?, finalized_at = ?, locked_by_user_id = ?, locked_at = ?, finalization_note = ?, finalization_snapshot_json = ?, updated_at = ? WHERE id = ?")
    .bind("FINALIZED", c.get("currentUser").id, now, c.get("currentUser").id, now, note ?? null, JSON.stringify(snapshot), now, run.payroll_period_id)
    .run();
  await c.env.DB.prepare("UPDATE payroll_employee_results SET status = ?, finalized_at = ?, updated_at = ? WHERE payroll_run_id = ? AND status NOT IN ('HELD', 'EXCLUDED', 'CANCELLED')").bind("FINALIZED", now, now, run.id).run();
  await updateCustomDeductionAfterPayrollFinalized(c, String(run.id));
  await syncLegacyPayrollRunTablesForCompatibility(c, String(run.id));
  await recordPayrollApprovalEvent(c, run, "payroll.run.finalized", readString(run.status), "FINALIZED", { note });
  await publishPayroll(c, "payroll.changed", "payroll_run", String(run.id), "finalized");
  return { run: await getRun(c, String(run.id)) };
}

async function unlockFinalizedPayrollRun(c: Context<AppBindings>, runId: string, reason: string) {
  const disabled = await requirePayrollModuleEnabled(c);
  if (disabled) return { response: disabled };
  if (!reason) return { response: fail(c, 400, "REASON_REQUIRED", "Reason is required.") };
  const { run, response } = await ensureRunAccess(c, runId, "manage");
  if (!run) return { response };
  if (!FINALIZED_PAYROLL_STATUSES.has(mapLegacyPayrollRunStatus(run.status))) return { response: fail(c, 400, "INVALID_STATUS", "Only finalized payroll runs can be unlocked.") };
  const now = isoNow();
  await c.env.DB.prepare("UPDATE payroll_runs SET status = ?, unlocked_by_user_id = ?, unlocked_at = ?, unlock_reason = ?, updated_at = ? WHERE id = ?").bind("READY_FOR_REVIEW", c.get("currentUser").id, now, reason, now, run.id).run();
  await c.env.DB.prepare("UPDATE payroll_periods SET status = ?, unlocked_by_user_id = ?, unlocked_at = ?, unlock_reason = ?, updated_at = ? WHERE id = ?").bind("READY_FOR_REVIEW", c.get("currentUser").id, now, reason, now, run.payroll_period_id).run();
  await c.env.DB.prepare("UPDATE payroll_employee_results SET status = ?, updated_at = ? WHERE payroll_run_id = ? AND status = ?").bind("READY_FOR_REVIEW", now, run.id, "FINALIZED").run();
  await syncLegacyPayrollRunTablesForCompatibility(c, String(run.id));
  await recordPayrollApprovalEvent(c, run, "payroll.run.unlocked_after_finalization", readString(run.status), "READY_FOR_REVIEW", { reason });
  await publishPayroll(c, "payroll.changed", "payroll_run", String(run.id), "unlocked_after_finalization");
  return { run: await getRun(c, String(run.id)) };
}

function payslipNumber(run: Record<string, unknown>, result: Record<string, unknown>, version: number) {
  return `PS-${run.period_year}${String(run.period_month).padStart(2, "0")}-${readString(result.employee_no_snapshot) || String(result.employee_id).slice(0, 8)}-V${version}`;
}

async function getPayslipSnapshotData(c: Context<AppBindings>, resultId: string) {
  const result = await c.env.DB
    .prepare(
      `SELECT pre.*, pr.run_no, pr.status AS run_status, pr.finalized_at, pp.period_month, pp.period_year, pp.start_date, pp.end_date, pp.salary_payment_date,
        d.name AS department_name, l.name AS location_name, p.title AS position_title
       FROM payroll_employee_results pre
       INNER JOIN payroll_runs pr ON pr.id = pre.payroll_run_id
       INNER JOIN payroll_periods pp ON pp.id = pr.payroll_period_id
       LEFT JOIN departments d ON d.id = pre.department_id
       LEFT JOIN locations l ON l.id = pre.location_id
       LEFT JOIN positions p ON p.id = pre.position_id
       WHERE pre.id = ?`
    )
    .bind(resultId)
    .first<Record<string, unknown>>();
  if (!result) return null;
  const lines = (await c.env.DB
    .prepare("SELECT * FROM payroll_result_line_items WHERE payroll_run_employee_id = ? ORDER BY line_type, category, description")
    .bind(resultId)
    .all<Record<string, unknown>>()).results;
  const calculation = parseJsonRecord(result.calculation_json);
  return {
    company: { name: "Cafe Asiana", footer: "Confidential payroll document" },
    employee: {
      id: result.employee_id,
      employee_no: result.employee_no_snapshot,
      name: result.employee_name_snapshot,
      department: result.department_name,
      location: result.location_name,
      position: result.position_title
    },
    period: {
      month: result.period_month,
      year: result.period_year,
      start_date: result.start_date,
      end_date: result.end_date,
      salary_payment_date: result.salary_payment_date,
      run_no: result.run_no
    },
    totals: {
      basic_salary: result.basic_salary,
      gross_salary: result.total_earnings,
      total_deductions: result.total_deductions,
      attendance_deductions: result.attendance_deductions,
      leave_deductions: result.leave_deductions,
      advance_deductions: result.advance_deductions,
      net_salary: result.net_salary,
      payable_days: result.days_worked,
      unpaid_days: result.unpaid_leave_days,
      absent_days: result.absent_days,
      late_days: result.late_days,
      missed_punch_days: result.missed_punch_days
    },
    lines,
    payment_method_snapshot: await getActivePaymentMethodSnapshot(c.env.DB, String(result.employee_id), Number(result.net_salary ?? 0)),
    bank_loan_lines: lines.filter((line) => line.source === "BANK_LOAN" || line.category === "BANK_LOAN" || line.source_entity_type === "employee_bank_loan"),
    bank_loan_warnings: calculation.bank_loan_warnings ?? [],
    bank_loan_requires_resolution: calculation.bank_loan_requires_resolution ?? false,
    custom_deduction_lines: lines.filter((line) => line.source === "CUSTOM_DEDUCTION" || line.category === "CUSTOM_DEDUCTION" || line.source_entity_type === "employee_custom_deduction"),
    custom_deduction_warnings: calculation.custom_deduction_warnings ?? [],
    pension_lines: lines.filter((line) => line.category === "PENSION" || line.category === "PENSION_EMPLOYER_COST"),
    generated_at: isoNow(),
    source: "frozen_payroll_result"
  };
}

function renderPayslipHtml(snapshot: Record<string, unknown>, payslipNumberValue: string) {
  const employee = snapshot.employee as Record<string, unknown>;
  const period = snapshot.period as Record<string, unknown>;
  const totals = snapshot.totals as Record<string, unknown>;
  const lines = (snapshot.lines as Record<string, unknown>[]) ?? [];
  const warnings = Array.isArray(snapshot.bank_loan_warnings) ? snapshot.bank_loan_warnings as unknown[] : [];
  const warningHtml = warnings.length ? `<div class="warning"><strong>Payroll warning:</strong> ${warnings.map((warning) => String(warning)).join(" ")}</div>` : "";
  const rowHtml = lines.map((line) => `<tr><td>${line.line_type ?? ""}</td><td>${line.category ?? ""}</td><td>${line.description ?? ""}</td><td style="text-align:right">${Number(line.amount ?? 0).toFixed(2)}</td></tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${payslipNumberValue}</title><style>body{font-family:Arial,sans-serif;color:#0f172a;margin:32px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:16px 0}.warning{border:1px solid #f59e0b;background:#fffbeb;color:#92400e;padding:8px;margin:12px 0;font-size:12px}table{width:100%;border-collapse:collapse;margin-top:16px}td,th{border:1px solid #cbd5e1;padding:8px;font-size:12px}th{background:#f8fafc;text-align:left}.total{font-weight:700}.note{margin-top:24px;font-size:11px;color:#64748b}</style></head><body><h1>Payslip</h1><p>${payslipNumberValue}</p><div class="meta"><div>Employee: <strong>${employee.name ?? ""}</strong></div><div>Employee No: ${employee.employee_no ?? ""}</div><div>Department: ${employee.department ?? ""}</div><div>Location: ${employee.location ?? ""}</div><div>Period: ${period.month}/${period.year}</div><div>Payment date: ${period.salary_payment_date ?? "-"}</div></div>${warningHtml}<table><thead><tr><th>Type</th><th>Category</th><th>Description</th><th>Amount</th></tr></thead><tbody>${rowHtml}</tbody><tfoot><tr><td colspan="3" class="total">Net salary</td><td class="total" style="text-align:right">${Number(totals.net_salary ?? 0).toFixed(2)}</td></tr></tfoot></table><p class="note">Confidential payroll document. Print-ready HTML foundation; PDF generation can be added later.</p></body></html>`;
}

async function generatePayslipForEmployeeResult(c: Context<AppBindings>, result: Record<string, unknown>, run: Record<string, unknown>) {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(result.employee_id), "payroll", "manage"))) return null;
  const snapshot = await getPayslipSnapshotData(c, String(result.id));
  if (!snapshot) return null;
  const existing = await c.env.DB.prepare("SELECT * FROM payroll_payslips WHERE payroll_employee_result_id = ? ORDER BY version_number DESC LIMIT 1").bind(result.id).first<Record<string, unknown>>();
  const version = Number(existing?.version_number ?? 0) + 1;
  const numberValue = payslipNumber(run, result, version);
  const html = renderPayslipHtml(snapshot as Record<string, unknown>, numberValue);
  const now = isoNow();
  if (existing) {
    await c.env.DB
      .prepare("UPDATE payroll_payslips SET payslip_number = ?, status = ?, regenerated_by_user_id = ?, regenerated_at = ?, version_number = ?, payslip_data_json = ?, html_snapshot = ?, updated_at = ? WHERE id = ?")
      .bind(numberValue, "REGENERATED", c.get("currentUser").id, now, version, JSON.stringify(snapshot), html, now, existing.id)
      .run();
    return c.env.DB.prepare("SELECT * FROM payroll_payslips WHERE id = ?").bind(existing.id).first<Record<string, unknown>>();
  }
  const id = crypto.randomUUID();
  await c.env.DB
    .prepare(
      `INSERT INTO payroll_payslips
       (id, payslip_number, payroll_period_id, payroll_run_id, payroll_employee_result_id, employee_id, status, generated_by_user_id, generated_at, version_number, payslip_data_json, html_snapshot)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, numberValue, run.payroll_period_id, run.id, result.id, result.employee_id, "GENERATED", c.get("currentUser").id, now, version, JSON.stringify(snapshot), html)
    .run();
  return c.env.DB.prepare("SELECT * FROM payroll_payslips WHERE id = ?").bind(id).first<Record<string, unknown>>();
}

async function generatePayslipsForPayrollRun(c: Context<AppBindings>, runId: string) {
  const disabled = await requirePayrollModuleEnabled(c);
  if (disabled) return { response: disabled };
  const { run, response } = await ensureRunAccess(c, runId, "manage");
  if (!run) return { response };
  if (!FINALIZED_PAYROLL_STATUSES.has(mapLegacyPayrollRunStatus(run.status))) return { response: fail(c, 400, "PAYSIP_NOT_AVAILABLE", "Payslip is not available.") };
  const conditions = ["pre.payroll_run_id = ?", "pre.status NOT IN ('EXCLUDED', 'CANCELLED')"];
  const params: BindValue[] = [runId];
  await addEmployeeScope(c, conditions, params, "manage", "pre.employee_id");
  const results = (await c.env.DB.prepare(`SELECT pre.* FROM payroll_employee_results pre WHERE ${conditions.join(" AND ")} ORDER BY pre.employee_no_snapshot`).bind(...params).all<Record<string, unknown>>()).results;
  const payslips: Record<string, unknown>[] = [];
  for (const result of results) {
    const payslip = await generatePayslipForEmployeeResult(c, result, run);
    if (payslip) payslips.push(payslip);
  }
  await auditPayroll(c, { action: "payroll.payslips.generated", entityType: "payroll_run", entityId: runId, newValue: { count: payslips.length } });
  await publishPayroll(c, "payroll.changed", "payroll_payslip", runId, "generated");
  return { payslips };
}

async function canViewPayslipForEmployee(c: Context<AppBindings>, employeeId: string, selfService = false) {
  if (selfService) {
    const user = c.get("currentUser");
    if (!hasAny(c, ["self_service.payslips.view", "self_service.payroll.view", "self_service.view"])) return false;
    if (user.employee_id === employeeId) return true;
    const linked = await c.env.DB.prepare("SELECT id FROM employees WHERE user_id = ? AND id = ? LIMIT 1").bind(user.id, employeeId).first();
    return Boolean(linked);
  }
  if (!hasAny(c, ["payroll.payslips.view", "payroll.payslips.manage", "payroll.view", "employees.payroll.view"])) return false;
  return canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "payroll", "view");
}

async function listPayslips(c: Context<AppBindings>, employeeId?: string | null) {
  const conditions = ["1 = 1"];
  const params: BindValue[] = [];
  if (employeeId) { conditions.push("ps.employee_id = ?"); params.push(employeeId); }
  const runId = readString(c.req.query("payroll_run_id") ?? c.req.query("run_id"));
  if (runId) { conditions.push("ps.payroll_run_id = ?"); params.push(runId); }
  await addEmployeeScope(c, conditions, params, "view", "ps.employee_id");
  return (await c.env.DB
    .prepare(
      `SELECT ps.*, pre.employee_no_snapshot, pre.employee_name_snapshot, pp.period_month, pp.period_year, pr.run_no
       FROM payroll_payslips ps
       INNER JOIN payroll_employee_results pre ON pre.id = ps.payroll_employee_result_id
       INNER JOIN payroll_runs pr ON pr.id = ps.payroll_run_id
       INNER JOIN payroll_periods pp ON pp.id = ps.payroll_period_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY pp.period_year DESC, pp.period_month DESC, ps.generated_at DESC`
    )
    .bind(...params)
    .all<Record<string, unknown>>()).results;
}

async function getSelfServicePayslips(c: Context<AppBindings>) {
  const user = c.get("currentUser");
  const employeeId = user.employee_id ?? (await c.env.DB.prepare("SELECT id FROM employees WHERE user_id = ? LIMIT 1").bind(user.id).first<{ id: string }>())?.id;
  if (!employeeId) return { response: fail(c, 403, "SELF_SERVICE_UNAVAILABLE", "This account is not linked to an employee profile.") };
  if (!(await canViewPayslipForEmployee(c, employeeId, true))) return { response: fail(c, 403, "PAYSIP_ACCESS_DENIED", "You can only view your own payslips.") };
  const payslips = await listPayslips(c, employeeId);
  return { payslips };
}

function maskBankAccount(account: unknown) {
  const text = readString(account);
  if (!text) return null;
  return text.length <= 4 ? "****" : `${"*".repeat(Math.max(4, text.length - 4))}${text.slice(-4)}`;
}

function safePaymentRegister(row: Record<string, unknown>, canSensitive: boolean) {
  if (canSensitive) return row;
  return { ...row, bank_name_snapshot: row.bank_name_snapshot ? "Restricted" : null, bank_account_name_snapshot: row.bank_account_name_snapshot ? "Restricted" : null };
}

async function preparePaymentRegisterForPayrollRun(c: Context<AppBindings>, runId: string) {
  const disabled = await requirePayrollModuleEnabled(c);
  if (disabled) return { response: disabled };
  const { run, response } = await ensureRunAccess(c, runId, "manage");
  if (!run) return { response };
  if (!FINALIZED_PAYROLL_STATUSES.has(mapLegacyPayrollRunStatus(run.status))) return { response: fail(c, 400, "PAYMENT_REGISTER_NOT_AVAILABLE", "Payment register is not available for this payroll run.") };
  const conditions = ["pre.payroll_run_id = ?", "pre.status NOT IN ('EXCLUDED', 'CANCELLED')"];
  const params: BindValue[] = [runId];
  await addEmployeeScope(c, conditions, params, "manage", "pre.employee_id");
  const results = (await c.env.DB
    .prepare(
      `SELECT pre.*, epp.payment_method, epp.bank_name, epp.bank_account_name, epp.bank_account_no
       FROM payroll_employee_results pre
       LEFT JOIN employee_payroll_profiles epp ON epp.employee_id = pre.employee_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY pre.employee_no_snapshot`
    )
    .bind(...params)
    .all<Record<string, unknown>>()).results;
  for (const result of results) {
    const existing = await c.env.DB.prepare("SELECT id FROM payroll_payment_register WHERE payroll_employee_result_id = ?").bind(result.id).first();
    if (existing) continue;
    const methodSnapshot = await getActivePaymentMethodSnapshot(c.env.DB, String(result.employee_id), Number(result.net_salary ?? 0));
    const primary = methodSnapshot.primary as Record<string, unknown> | null;
    const paymentMethod = readString(primary?.payment_method_type || result.payment_method || "CASH");
    const institutionName = primary?.payment_institution_name ?? primary?.bank_name_snapshot ?? result.bank_name ?? null;
    const accountName = primary?.bank_account_name ?? result.bank_account_name ?? null;
    const maskedAccount = primary?.bank_account_number_masked ?? maskBankAccount(result.bank_account_no);
    const metadata = {
      payment_methods_source: primary ? "employee_payment_methods" : "employee_payroll_profiles_fallback",
      payment_method_warning: methodSnapshot.warning || null,
      split_payment: methodSnapshot.split,
      cash_salary_acknowledgement_placeholder: paymentMethod === "CASH",
      direct_bank_integration: false,
      official_bank_export_generated: false
    };
    await c.env.DB
      .prepare(
        `INSERT INTO payroll_payment_register
         (id, payroll_period_id, payroll_run_id, payroll_employee_result_id, employee_id, employee_number_snapshot, employee_name_snapshot,
          payment_method_snapshot, bank_name_snapshot, bank_account_name_snapshot, bank_account_number_masked, net_salary_amount,
          payment_status, prepared_by_user_id, prepared_at, metadata_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(crypto.randomUUID(), run.payroll_period_id, run.id, result.id, result.employee_id, result.employee_no_snapshot, result.employee_name_snapshot, paymentMethod, institutionName, accountName, maskedAccount, result.net_salary, "PREPARED", c.get("currentUser").id, isoNow(), JSON.stringify(metadata))
      .run();
  }
  await auditPayroll(c, { action: "payroll.payment_register.prepared", entityType: "payroll_run", entityId: runId, newValue: { count: results.length } });
  return { payments: await listPaymentRegisters(c, runId) };
}

async function listPaymentRegisters(c: Context<AppBindings>, runId?: string | null) {
  const conditions = ["1 = 1"];
  const params: BindValue[] = [];
  if (runId) { conditions.push("ppr.payroll_run_id = ?"); params.push(runId); }
  await addEmployeeScope(c, conditions, params, "view", "ppr.employee_id");
  const rows = (await c.env.DB.prepare(`SELECT ppr.*, pp.period_month, pp.period_year, pr.run_no FROM payroll_payment_register ppr INNER JOIN payroll_periods pp ON pp.id = ppr.payroll_period_id INNER JOIN payroll_runs pr ON pr.id = ppr.payroll_run_id WHERE ${conditions.join(" AND ")} ORDER BY pp.period_year DESC, pp.period_month DESC, ppr.employee_number_snapshot`).bind(...params).all<Record<string, unknown>>()).results;
  return rows.map((row) => safePaymentRegister(row, hasAny(c, ["payroll.payment_register.sensitive.view", "payroll.payment_register.manage", "payroll.manage"])));
}

async function confirmManualPayrollPayment(c: Context<AppBindings>, paymentId: string, reference: string, note: string) {
  const disabled = await requirePayrollModuleEnabled(c);
  if (disabled) return { response: disabled };
  if (!reference || !note) return { response: fail(c, 400, "REASON_REQUIRED", "Payment confirmation reference and note are required.") };
  const payment = await c.env.DB.prepare("SELECT * FROM payroll_payment_register WHERE id = ?").bind(paymentId).first<Record<string, unknown>>();
  if (!payment || !(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(payment.employee_id), "payroll", "manage"))) return { response: fail(c, 404, "NOT_FOUND", "Payment register row was not found.") };
  if (!["PENDING", "PREPARED"].includes(readString(payment.payment_status))) return { response: fail(c, 400, "INVALID_STATUS", "Only prepared payment rows can be manually confirmed.") };
  const now = isoNow();
  await c.env.DB.prepare("UPDATE payroll_payment_register SET payment_status = ?, confirmed_paid_by_user_id = ?, confirmed_paid_at = ?, confirmation_reference = ?, confirmation_note = ?, updated_at = ? WHERE id = ?").bind("MANUALLY_CONFIRMED_PAID", c.get("currentUser").id, now, reference, note, now, paymentId).run();
  await auditPayroll(c, { action: "payroll.payment_register.manually_confirmed_paid", entityType: "payroll_payment_register", entityId: paymentId, oldValue: payment, reason: note });
  return { payment: await c.env.DB.prepare("SELECT * FROM payroll_payment_register WHERE id = ?").bind(paymentId).first<Record<string, unknown>>() };
}

async function getPayrollHistorySummary(c: Context<AppBindings>, employeeId?: string | null) {
  const conditions = ["pr.status IN ('FINALIZED', 'LOCKED', 'FINALIZED_PLACEHOLDER')"];
  const params: BindValue[] = [];
  if (employeeId) { conditions.push("pre.employee_id = ?"); params.push(employeeId); }
  await addEmployeeScope(c, conditions, params, "view", "pre.employee_id");
  return (await c.env.DB
    .prepare(
      `SELECT pp.period_month, pp.period_year, pr.id AS payroll_run_id, pr.run_no, pr.status AS run_status,
        pre.employee_id, pre.employee_no_snapshot, pre.employee_name_snapshot, pre.department_id, pre.location_id,
        d.name AS department_name, l.name AS location_name,
        pre.basic_salary, pre.total_earnings, pre.total_deductions, pre.advance_deductions, pre.attendance_deductions, pre.leave_deductions, pre.net_salary, pre.status
       FROM payroll_employee_results pre
       INNER JOIN payroll_runs pr ON pr.id = pre.payroll_run_id
       INNER JOIN payroll_periods pp ON pp.id = pr.payroll_period_id
       LEFT JOIN departments d ON d.id = pre.department_id
       LEFT JOIN locations l ON l.id = pre.location_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY pp.period_year DESC, pp.period_month DESC, pre.employee_no_snapshot`
    )
    .bind(...params)
    .all<Record<string, unknown>>()).results;
}

payrollRoutes.get("/components", requireAnyPermission(["payroll.components.view", "payroll.view"]), async (c) => ok(c, { components: (await c.env.DB.prepare("SELECT * FROM payroll_components ORDER BY is_active DESC, sort_order, name").all()).results }));

payrollRoutes.get("/components/:id", requireAnyPermission(["payroll.components.view", "payroll.view"]), async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM payroll_components WHERE id = ?").bind(routeParam(c, "id")).first();
  if (!row) return fail(c, 404, "NOT_FOUND", "Payroll component was not found.");
  return ok(c, { component: row });
});

payrollRoutes.post("/components", requireAnyPermission(["payroll.components.manage", "payroll.settings.manage"]), async (c) => {
  const input = readComponent(await readJsonBody(c.req.raw));
  if (!input.code || !input.name || !input.type || !input.calculation_type) return fail(c, 400, "VALIDATION_ERROR", "Code, name, type, and calculation type are required.");
  const id = crypto.randomUUID();
  try {
    await c.env.DB.prepare("INSERT INTO payroll_components (id, code, name, type, category, calculation_type, default_amount, default_percentage, applies_to_basic_salary, is_taxable, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, input.code, input.name, input.type, input.category, input.calculation_type, input.default_amount, input.default_percentage, input.applies_to_basic_salary ? 1 : 0, input.is_taxable == null ? null : input.is_taxable ? 1 : 0, input.is_active ? 1 : 0, input.sort_order).run();
  } catch {
    return fail(c, 409, "DUPLICATE_COMPONENT", "Payroll component code must be unique.");
  }
  const saved = await c.env.DB.prepare("SELECT * FROM payroll_components WHERE id = ?").bind(id).first();
  await auditPayroll(c, { action: "payroll.component.created", entityType: "payroll_component", entityId: id, newValue: saved });
  await publishPayroll(c, "payroll.changed", "payroll_component", id, "created");
  return ok(c, { component: saved }, 201);
});

payrollRoutes.patch("/components/:id", requireAnyPermission(["payroll.components.manage", "payroll.settings.manage"]), async (c) => {
  const id = routeParam(c, "id");
  const old = await c.env.DB.prepare("SELECT * FROM payroll_components WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!old) return fail(c, 404, "NOT_FOUND", "Payroll component was not found.");
  const input = readComponent(await readJsonBody(c.req.raw), old);
  await c.env.DB.prepare("UPDATE payroll_components SET code = ?, name = ?, type = ?, category = ?, calculation_type = ?, default_amount = ?, default_percentage = ?, applies_to_basic_salary = ?, is_taxable = ?, is_active = ?, sort_order = ?, updated_at = ? WHERE id = ?").bind(input.code, input.name, input.type, input.category, input.calculation_type, input.default_amount, input.default_percentage, input.applies_to_basic_salary ? 1 : 0, input.is_taxable == null ? null : input.is_taxable ? 1 : 0, input.is_active ? 1 : 0, input.sort_order, isoNow(), id).run();
  const saved = await c.env.DB.prepare("SELECT * FROM payroll_components WHERE id = ?").bind(id).first();
  await auditPayroll(c, { action: "payroll.component.updated", entityType: "payroll_component", entityId: id, oldValue: old, newValue: saved });
  return ok(c, { component: saved });
});

async function componentAction(c: Context<AppBindings>, active: boolean) {
  const id = routeParam(c, "id");
  const old = await c.env.DB.prepare("SELECT * FROM payroll_components WHERE id = ?").bind(id).first();
  if (!old) return fail(c, 404, "NOT_FOUND", "Payroll component was not found.");
  await c.env.DB.prepare("UPDATE payroll_components SET is_active = ?, updated_at = ? WHERE id = ?").bind(active ? 1 : 0, isoNow(), id).run();
  await auditPayroll(c, { action: active ? "payroll.component.enabled" : "payroll.component.disabled", entityType: "payroll_component", entityId: id, oldValue: old, newValue: { is_active: active } });
  return ok(c, { enabled: active });
}

payrollRoutes.post("/components/:id/enable", requireAnyPermission(["payroll.components.manage", "payroll.settings.manage"]), (c) => componentAction(c, true));
payrollRoutes.post("/components/:id/disable", requireAnyPermission(["payroll.components.manage", "payroll.settings.manage"]), (c) => componentAction(c, false));

payrollRoutes.get("/settings", requireAnyPermission(["payroll.settings.view", "payroll.custom_deduction_settings.view", "payroll.custom_deduction_settings.manage", "payroll.view"]), async (c) => ok(c, { settings: await getSettings(c) }));

payrollRoutes.patch("/settings", requireAnyPermission(["payroll.settings.manage", "payroll.custom_deduction_settings.update", "payroll.custom_deduction_settings.manage"]), async (c) => {
  const old = await getSettings(c);
  const body = await readJsonBody(c.req.raw);
  const mode = readString(body.default_daily_rate_mode ?? old.default_daily_rate_mode).toUpperCase();
  const bankLoanMode = readString(body.bank_loan_insufficient_salary_mode ?? old.bank_loan_insufficient_salary_mode ?? "REQUIRE_OVERRIDE").toUpperCase();
  const bankLoanMinimumNetThresholdType = readString(body.bank_loan_minimum_net_salary_threshold_type ?? old.bank_loan_minimum_net_salary_threshold_type ?? "FIXED_AMOUNT").toUpperCase();
  const customDeductionMode = readString(body.custom_deduction_insufficient_salary_mode ?? old.custom_deduction_insufficient_salary_mode ?? "WARN_ONLY").toUpperCase();
  const pensionBasis = readString(body.pension_basis_default ?? old.pension_basis_default ?? "BASIC_SALARY_ONLY").toUpperCase();
  const deductionPriority = Array.isArray(body.payroll_deduction_priority_json)
    ? JSON.stringify(body.payroll_deduction_priority_json)
    : readString(body.payroll_deduction_priority_json ?? old.payroll_deduction_priority_json) || '["PENSION_EMPLOYEE_CONTRIBUTION","BANK_LOAN_DEDUCTION","CUSTOM_DEDUCTION","PAYROLL_DEDUCTION","ADVANCE_DEDUCTION","MANUAL_DEDUCTION"]';
  const defaultPensionSchemeId = body.default_pension_scheme_id === null ? null : optionalString(body.default_pension_scheme_id ?? old.default_pension_scheme_id);
  await c.env.DB
    .prepare(
      `UPDATE payroll_settings SET
        default_currency = ?, default_daily_rate_mode = ?, allow_negative_net_salary = ?, require_approval_before_paid = ?,
        include_attendance_deductions = ?, include_leave_deductions = ?, include_advance_deductions = ?, include_roster_scheduled_days = ?,
        default_salary_payment_day = ?,
        bank_loan_deductions_enabled = ?, allow_multiple_bank_loans_per_employee = ?, require_loan_approval_before_payroll_deduction = ?,
        loan_deduction_priority = ?, allow_partial_loan_deduction = ?, block_payroll_if_loan_exceeds_net_salary = ?,
        show_loan_details_in_self_service = ?, show_loan_details_on_payslip = ?,
        bank_loan_requires_bank_salary_route_default = ?, bank_loan_cash_salary_default_ineligible = ?,
        bank_loan_statement_months_required_min = ?, bank_loan_statement_months_required_default = ?,
        bank_loan_salary_slips_months_required_default = ?, bank_loan_allow_cash_employee_override = ?,
        bank_loan_override_requires_reason = ?, bank_loan_override_requires_document = ?, bank_loan_insufficient_salary_mode = ?,
        bank_loan_minimum_net_salary_protection_enabled = ?, bank_loan_minimum_net_salary_threshold_type = ?,
        bank_loan_minimum_net_salary_threshold_percentage = ?, bank_loan_minimum_net_salary_threshold_amount = ?,
        bank_loan_skip_if_below_threshold_enabled = ?, bank_loan_bank_notification_required_on_skip = ?,
        bank_loan_employee_direct_collection_status_enabled = ?,
        custom_deductions_enabled = ?, require_custom_deduction_approval = ?,
        custom_deduction_show_on_payslip_default = ?, custom_deduction_show_in_self_service_default = ?,
        custom_deduction_include_in_final_settlement_default = ?, custom_deduction_insufficient_salary_mode = ?,
        custom_deduction_allow_partial_deduction = ?, custom_deduction_shortfall_carry_forward_enabled = ?,
        custom_deduction_priority_default = ?, custom_deduction_require_reason_for_cancel = ?,
        custom_deduction_require_document_for_sensitive_categories = ?,
        pension_enabled = ?, default_pension_scheme_id = ?, pension_auto_calculation_enabled = ?,
        pension_employee_contribution_default_percent = ?, pension_employer_contribution_default_percent = ?, pension_basis_default = ?,
        pension_show_on_payslip = ?, pension_show_in_self_service = ?, pension_remittance_enabled = ?,
        pension_employer_can_pay_employee_share = ?, foreign_employee_pension_default_enabled = ?,
        foreign_employee_voluntary_enrollment_enabled = ?, payroll_deduction_priority_json = ?,
        cash_salary_acknowledgement_enabled = ?, cash_salary_acknowledgement_required_before_finalize = ?,
        cash_salary_signature_capture_placeholder_enabled = ?, updated_at = ?
       WHERE id = 'payroll_settings_default'`
    )
    .bind(
      readString(body.default_currency ?? old.default_currency) || "MVR",
      DAILY_RATE_MODES.has(mode) ? mode : old.default_daily_rate_mode,
      bool(body.allow_negative_net_salary, Boolean(old.allow_negative_net_salary)) ? 1 : 0,
      bool(body.require_approval_before_paid, Boolean(old.require_approval_before_paid)) ? 1 : 0,
      bool(body.include_attendance_deductions, Boolean(old.include_attendance_deductions)) ? 1 : 0,
      bool(body.include_leave_deductions, Boolean(old.include_leave_deductions)) ? 1 : 0,
      bool(body.include_advance_deductions, Boolean(old.include_advance_deductions)) ? 1 : 0,
      bool(body.include_roster_scheduled_days, Boolean(old.include_roster_scheduled_days)) ? 1 : 0,
      num(body.default_salary_payment_day, old.default_salary_payment_day == null ? null : Number(old.default_salary_payment_day)),
      bool(body.bank_loan_deductions_enabled, Boolean(old.bank_loan_deductions_enabled ?? true)) ? 1 : 0,
      bool(body.allow_multiple_bank_loans_per_employee, Boolean(old.allow_multiple_bank_loans_per_employee ?? true)) ? 1 : 0,
      bool(body.require_loan_approval_before_payroll_deduction, Boolean(old.require_loan_approval_before_payroll_deduction ?? true)) ? 1 : 0,
      num(body.loan_deduction_priority, Number(old.loan_deduction_priority ?? 2)),
      bool(body.allow_partial_loan_deduction, Boolean(old.allow_partial_loan_deduction ?? true)) ? 1 : 0,
      bool(body.block_payroll_if_loan_exceeds_net_salary, Boolean(old.block_payroll_if_loan_exceeds_net_salary ?? false)) ? 1 : 0,
      bool(body.show_loan_details_in_self_service, Boolean(old.show_loan_details_in_self_service ?? true)) ? 1 : 0,
      bool(body.show_loan_details_on_payslip, Boolean(old.show_loan_details_on_payslip ?? true)) ? 1 : 0,
      bool(body.bank_loan_requires_bank_salary_route_default, Boolean(old.bank_loan_requires_bank_salary_route_default ?? true)) ? 1 : 0,
      bool(body.bank_loan_cash_salary_default_ineligible, Boolean(old.bank_loan_cash_salary_default_ineligible ?? true)) ? 1 : 0,
      num(body.bank_loan_statement_months_required_min, Number(old.bank_loan_statement_months_required_min ?? 6)),
      num(body.bank_loan_statement_months_required_default, Number(old.bank_loan_statement_months_required_default ?? 12)),
      num(body.bank_loan_salary_slips_months_required_default, Number(old.bank_loan_salary_slips_months_required_default ?? 6)),
      bool(body.bank_loan_allow_cash_employee_override, Boolean(old.bank_loan_allow_cash_employee_override ?? true)) ? 1 : 0,
      bool(body.bank_loan_override_requires_reason, Boolean(old.bank_loan_override_requires_reason ?? true)) ? 1 : 0,
      bool(body.bank_loan_override_requires_document, Boolean(old.bank_loan_override_requires_document ?? true)) ? 1 : 0,
      BANK_LOAN_INSUFFICIENT_SALARY_MODES.has(bankLoanMode) ? bankLoanMode : "REQUIRE_OVERRIDE",
      bool(body.bank_loan_minimum_net_salary_protection_enabled, Boolean(old.bank_loan_minimum_net_salary_protection_enabled ?? false)) ? 1 : 0,
      BANK_LOAN_MINIMUM_NET_THRESHOLD_TYPES.has(bankLoanMinimumNetThresholdType) ? bankLoanMinimumNetThresholdType : "FIXED_AMOUNT",
      num(body.bank_loan_minimum_net_salary_threshold_percentage, Number(old.bank_loan_minimum_net_salary_threshold_percentage ?? 0)),
      num(body.bank_loan_minimum_net_salary_threshold_amount, Number(old.bank_loan_minimum_net_salary_threshold_amount ?? 0)),
      bool(body.bank_loan_skip_if_below_threshold_enabled, Boolean(old.bank_loan_skip_if_below_threshold_enabled ?? true)) ? 1 : 0,
      bool(body.bank_loan_bank_notification_required_on_skip, Boolean(old.bank_loan_bank_notification_required_on_skip ?? true)) ? 1 : 0,
      bool(body.bank_loan_employee_direct_collection_status_enabled, Boolean(old.bank_loan_employee_direct_collection_status_enabled ?? true)) ? 1 : 0,
      bool(body.custom_deductions_enabled, Boolean(old.custom_deductions_enabled ?? true)) ? 1 : 0,
      bool(body.require_custom_deduction_approval, Boolean(old.require_custom_deduction_approval ?? true)) ? 1 : 0,
      bool(body.custom_deduction_show_on_payslip_default, Boolean(old.custom_deduction_show_on_payslip_default ?? true)) ? 1 : 0,
      bool(body.custom_deduction_show_in_self_service_default, Boolean(old.custom_deduction_show_in_self_service_default ?? true)) ? 1 : 0,
      bool(body.custom_deduction_include_in_final_settlement_default, Boolean(old.custom_deduction_include_in_final_settlement_default ?? true)) ? 1 : 0,
      CUSTOM_DEDUCTION_INSUFFICIENT_SALARY_MODES.has(customDeductionMode) ? customDeductionMode : "WARN_ONLY",
      bool(body.custom_deduction_allow_partial_deduction, Boolean(old.custom_deduction_allow_partial_deduction ?? true)) ? 1 : 0,
      bool(body.custom_deduction_shortfall_carry_forward_enabled, Boolean(old.custom_deduction_shortfall_carry_forward_enabled ?? false)) ? 1 : 0,
      num(body.custom_deduction_priority_default, Number(old.custom_deduction_priority_default ?? 3)),
      bool(body.custom_deduction_require_reason_for_cancel, Boolean(old.custom_deduction_require_reason_for_cancel ?? true)) ? 1 : 0,
      bool(body.custom_deduction_require_document_for_sensitive_categories, Boolean(old.custom_deduction_require_document_for_sensitive_categories ?? false)) ? 1 : 0,
      bool(body.pension_enabled, Boolean(old.pension_enabled ?? true)) ? 1 : 0,
      defaultPensionSchemeId,
      bool(body.pension_auto_calculation_enabled, Boolean(old.pension_auto_calculation_enabled ?? true)) ? 1 : 0,
      num(body.pension_employee_contribution_default_percent, Number(old.pension_employee_contribution_default_percent ?? 7)),
      num(body.pension_employer_contribution_default_percent, Number(old.pension_employer_contribution_default_percent ?? 7)),
      PENSION_BASIS_MODES.has(pensionBasis) ? pensionBasis : "BASIC_SALARY_ONLY",
      bool(body.pension_show_on_payslip, Boolean(old.pension_show_on_payslip ?? true)) ? 1 : 0,
      bool(body.pension_show_in_self_service, Boolean(old.pension_show_in_self_service ?? true)) ? 1 : 0,
      bool(body.pension_remittance_enabled, Boolean(old.pension_remittance_enabled ?? true)) ? 1 : 0,
      bool(body.pension_employer_can_pay_employee_share, Boolean(old.pension_employer_can_pay_employee_share ?? true)) ? 1 : 0,
      bool(body.foreign_employee_pension_default_enabled, Boolean(old.foreign_employee_pension_default_enabled ?? false)) ? 1 : 0,
      bool(body.foreign_employee_voluntary_enrollment_enabled, Boolean(old.foreign_employee_voluntary_enrollment_enabled ?? true)) ? 1 : 0,
      deductionPriority,
      bool(body.cash_salary_acknowledgement_enabled, Boolean(old.cash_salary_acknowledgement_enabled ?? false)) ? 1 : 0,
      bool(body.cash_salary_acknowledgement_required_before_finalize, Boolean(old.cash_salary_acknowledgement_required_before_finalize ?? false)) ? 1 : 0,
      bool(body.cash_salary_signature_capture_placeholder_enabled, Boolean(old.cash_salary_signature_capture_placeholder_enabled ?? false)) ? 1 : 0,
      isoNow()
    )
    .run();
  const saved = await getSettings(c);
  await auditPayroll(c, { action: "payroll.settings.updated", entityType: "payroll_settings", entityId: "payroll_settings_default", oldValue: old, newValue: saved });
  return ok(c, { settings: saved });
});

employeePayrollRoutes.get("/:employeeId/payroll/profile", requireAnyPermission(["employees.payroll.view", "payroll.view"]), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), routeParam(c, "employeeId"), "payroll", "view"))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const employee = await getEmployee(c, routeParam(c, "employeeId"));
  if (!employee) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const profile = await ensureProfile(c, routeParam(c, "employeeId"));
  return ok(c, { profile: profile ? safeProfile(profile, hasAny(c, ["employees.payroll.view", "employees.payroll.update", "payroll.view"])) : null });
});

employeePayrollRoutes.patch("/:employeeId/payroll/profile", requirePermission("employees.payroll.update"), async (c) => {
  const employeeId = routeParam(c, "employeeId");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "payroll", "manage"))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const employee = await getEmployee(c, employeeId);
  if (!employee) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const old = await ensureProfile(c, employeeId);
  if (!old) return fail(c, 404, "NOT_FOUND", "Payroll profile was not found.");
  const body = await readJsonBody(c.req.raw);
  const salary = num(body.basic_salary, Number(old.basic_salary ?? 0)) ?? 0;
  if (salary < 0) return fail(c, 400, "VALIDATION_ERROR", "Basic salary cannot be negative.");
  const reason = optionalString(body.reason);
  if (salary !== Number(old.basic_salary ?? 0) && !reason) return fail(c, 400, "VALIDATION_ERROR", "Salary changes require a reason.");
  const method = readString(body.payment_method ?? old.payment_method).toUpperCase();
  const mode = readString(body.daily_rate_mode ?? old.daily_rate_mode).toUpperCase();
  await c.env.DB.prepare("UPDATE employee_payroll_profiles SET basic_salary = ?, currency = ?, payment_method = ?, bank_name = ?, bank_account_no = ?, bank_account_name = ?, payroll_included = ?, overtime_eligible = ?, benefits_eligible = ?, advance_eligible = ?, advance_limit_amount = ?, advance_limit_percent = ?, missed_day_deduction_enabled = ?, leave_deduction_enabled = ?, daily_rate_mode = ?, effective_from = ?, updated_at = ? WHERE employee_id = ?").bind(salary, readString(body.currency ?? old.currency) || "MVR", PAYMENT_METHODS.has(method) ? method : old.payment_method, optionalString(body.bank_name ?? old.bank_name), optionalString(body.bank_account_no ?? old.bank_account_no), optionalString(body.bank_account_name ?? old.bank_account_name), bool(body.payroll_included, Boolean(old.payroll_included)) ? 1 : 0, bool(body.overtime_eligible, Boolean(old.overtime_eligible)) ? 1 : 0, bool(body.benefits_eligible, Boolean(old.benefits_eligible)) ? 1 : 0, bool(body.advance_eligible, Boolean(old.advance_eligible)) ? 1 : 0, num(body.advance_limit_amount, old.advance_limit_amount == null ? null : Number(old.advance_limit_amount)), num(body.advance_limit_percent, old.advance_limit_percent == null ? null : Number(old.advance_limit_percent)), bool(body.missed_day_deduction_enabled, Boolean(old.missed_day_deduction_enabled)) ? 1 : 0, bool(body.leave_deduction_enabled, Boolean(old.leave_deduction_enabled)) ? 1 : 0, DAILY_RATE_MODES.has(mode) ? mode : old.daily_rate_mode, optionalString(body.effective_from ?? old.effective_from), isoNow(), employeeId).run();
  const saved = await getProfile(c, employeeId);
  if (salary !== Number(old.basic_salary ?? 0)) {
    await c.env.DB.prepare("INSERT INTO employee_salary_history (id, employee_id, old_basic_salary, new_basic_salary, effective_date, reason, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), employeeId, old.basic_salary, salary, optionalString(body.effective_from) ?? new Date().toISOString().slice(0, 10), reason, c.get("currentUser").id).run();
    await auditPayroll(c, { action: "payroll.salary_changed", entityType: "salary_history", entityId: employeeId, oldValue: { basic_salary: old.basic_salary }, newValue: { basic_salary: salary }, reason });
  }
  await auditPayroll(c, { action: "payroll.profile.updated", entityType: "payroll_profile", entityId: employeeId, oldValue: old, newValue: saved, reason });
  await publishPayroll(c, "employee.payroll.changed", "payroll_profile", employeeId, "updated");
  return ok(c, { profile: saved });
});

employeePayrollRoutes.get("/:employeeId/payroll/salary-history", requireAnyPermission(["employees.payroll.view", "payroll.view"]), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), routeParam(c, "employeeId"), "payroll", "view"))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  return ok(c, { salary_history: (await c.env.DB.prepare("SELECT * FROM employee_salary_history WHERE employee_id = ? ORDER BY effective_date DESC, created_at DESC").bind(routeParam(c, "employeeId")).all()).results });
});

employeePayrollRoutes.post("/:employeeId/payroll/salary-history", requirePermission("employees.payroll.update"), async (c) => {
  const employeeId = routeParam(c, "employeeId");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "payroll", "manage"))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const profile = await ensureProfile(c, employeeId);
  if (!profile) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const body = await readJsonBody(c.req.raw);
  const salary = num(body.new_basic_salary, null);
  const effectiveDate = readString(body.effective_date);
  const reason = readString(body.reason);
  if (salary == null || salary < 0 || !isDate(effectiveDate) || !reason) return fail(c, 400, "VALIDATION_ERROR", "New salary, effective date, and reason are required.");
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO employee_salary_history (id, employee_id, old_basic_salary, new_basic_salary, effective_date, reason, approved_by_user_id, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, employeeId, profile.basic_salary, salary, effectiveDate, reason, optionalString(body.approved_by_user_id), c.get("currentUser").id).run();
  if (effectiveDate <= new Date().toISOString().slice(0, 10)) await c.env.DB.prepare("UPDATE employee_payroll_profiles SET basic_salary = ?, effective_from = ?, updated_at = ? WHERE employee_id = ?").bind(salary, effectiveDate, isoNow(), employeeId).run();
  const saved = await c.env.DB.prepare("SELECT * FROM employee_salary_history WHERE id = ?").bind(id).first();
  await auditPayroll(c, { action: "payroll.salary_changed", entityType: "salary_history", entityId: id, newValue: saved, reason });
  await publishPayroll(c, "employee.payroll.changed", "salary_history", id, "salary_changed");
  return ok(c, { salary_history: saved }, 201);
});

employeePayrollRoutes.get("/:employeeId/payroll/increments", requireAnyPermission(["employees.payroll.view", "payroll.view"]), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), routeParam(c, "employeeId"), "payroll", "view"))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  return ok(c, { increments: (await c.env.DB.prepare("SELECT * FROM employee_increments WHERE employee_id = ? ORDER BY effective_date DESC, created_at DESC").bind(routeParam(c, "employeeId")).all()).results });
});

employeePayrollRoutes.post("/:employeeId/payroll/increments", requirePermission("employees.payroll.update"), async (c) => {
  const employeeId = routeParam(c, "employeeId");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "payroll", "manage"))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const profile = await ensureProfile(c, employeeId);
  if (!profile) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const body = await readJsonBody(c.req.raw);
  const amount = num(body.increment_amount, null);
  const reason = readString(body.reason);
  const effectiveDate = readString(body.effective_date);
  if (amount == null || amount <= 0 || !reason || !isDate(effectiveDate)) return fail(c, 400, "VALIDATION_ERROR", "Positive increment amount, effective date, and reason are required.");
  const oldSalary = Number(profile.basic_salary ?? 0);
  const newSalary = oldSalary + amount;
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO employee_increments (id, employee_id, increment_amount, increment_percentage, old_salary, new_salary, effective_date, reason, approved_by_user_id, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, employeeId, amount, num(body.increment_percentage), oldSalary, newSalary, effectiveDate, reason, optionalString(body.approved_by_user_id), c.get("currentUser").id).run();
  if (effectiveDate <= new Date().toISOString().slice(0, 10)) await c.env.DB.prepare("UPDATE employee_payroll_profiles SET basic_salary = ?, effective_from = ?, updated_at = ? WHERE employee_id = ?").bind(newSalary, effectiveDate, isoNow(), employeeId).run();
  const saved = await c.env.DB.prepare("SELECT * FROM employee_increments WHERE id = ?").bind(id).first();
  await auditPayroll(c, { action: "payroll.increment.created", entityType: "payroll_increment", entityId: id, newValue: saved, reason });
  await publishPayroll(c, "employee.payroll.changed", "payroll_increment", id, "increment_created");
  return ok(c, { increment: saved }, 201);
});

employeePayrollRoutes.get("/:employeeId/payroll/advances", requireAnyPermission(["employees.payroll.view", "payroll.view", "payroll.advances.view"]), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), routeParam(c, "employeeId"), "payroll", "view"))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  return ok(c, { advances: (await c.env.DB.prepare("SELECT * FROM payroll_advance_payments WHERE employee_id = ? ORDER BY payment_date DESC, created_at DESC").bind(routeParam(c, "employeeId")).all()).results });
});

employeePayrollRoutes.get("/:employeeId/payroll/summary", requireAnyPermission(["employees.payroll.view", "payroll.view"]), async (c) => {
  const employeeId = routeParam(c, "employeeId");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "payroll", "view"))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const canSensitivePayment = hasAny(c, ["employees.payment_methods.sensitive.view", "employees.payment_methods.manage", "payroll.payment_methods.manage", "payroll.manage"]);
  const canViewBankLoans = hasAny(c, ["payroll.bank_loans.view", "payroll.bank_loans.sensitive.view", "payroll.bank_loans.manage"]);
  const canSensitiveBankLoans = hasAny(c, ["payroll.bank_loans.sensitive.view", "payroll.bank_loans.manage"]);
  const canViewPension = hasAny(c, ["employees.pension_profiles.view", "employees.pension_profiles.manage", "payroll.pension_contributions.view"]);
  const canSensitivePension = hasAny(c, ["employees.pension_profiles.sensitive.view", "employees.pension_profiles.manage"]);
  const canViewCustomDeductions = hasAny(c, ["payroll.employee_custom_deductions.view", "payroll.employee_custom_deductions.manage", "employees.custom_deductions.view", "employees.custom_deductions.manage", "payroll.view", "employees.payroll.view"]);
  const [profile, salary, increments, advances, deductions, runs, payslips, settlements, paymentMethods, bankLoans, bankLoanPayments, pensionProfile, pensionContributions, customDeductions, customDeductionApplications, audit] = await Promise.all([
    ensureProfile(c, employeeId),
    c.env.DB.prepare("SELECT * FROM employee_salary_history WHERE employee_id = ? ORDER BY effective_date DESC LIMIT 20").bind(employeeId).all(),
    c.env.DB.prepare("SELECT * FROM employee_increments WHERE employee_id = ? ORDER BY effective_date DESC LIMIT 20").bind(employeeId).all(),
    c.env.DB.prepare("SELECT * FROM payroll_advance_payments WHERE employee_id = ? ORDER BY payment_date DESC LIMIT 20").bind(employeeId).all(),
    c.env.DB.prepare("SELECT * FROM payroll_deductions WHERE employee_id = ? ORDER BY created_at DESC LIMIT 20").bind(employeeId).all(),
    c.env.DB.prepare("SELECT pre.*, pr.run_no, pr.status AS run_status, pp.period_month, pp.period_year FROM payroll_employee_results pre INNER JOIN payroll_runs pr ON pr.id = pre.payroll_run_id INNER JOIN payroll_periods pp ON pp.id = pr.payroll_period_id WHERE pre.employee_id = ? ORDER BY pp.period_year DESC, pp.period_month DESC, pr.run_no DESC LIMIT 20").bind(employeeId).all(),
    c.env.DB.prepare("SELECT ps.*, pp.period_month, pp.period_year, pr.run_no FROM payroll_payslips ps INNER JOIN payroll_periods pp ON pp.id = ps.payroll_period_id INNER JOIN payroll_runs pr ON pr.id = ps.payroll_run_id WHERE ps.employee_id = ? ORDER BY pp.period_year DESC, pp.period_month DESC, ps.generated_at DESC LIMIT 20").bind(employeeId).all(),
    c.env.DB.prepare("SELECT * FROM final_settlements WHERE employee_id = ? ORDER BY created_at DESC LIMIT 20").bind(employeeId).all(),
    getEmployeePaymentMethods(c.env.DB, employeeId, canSensitivePayment),
    canViewBankLoans ? c.env.DB.prepare("SELECT ebl.*, pi.name AS payment_institution_name FROM employee_bank_loans ebl LEFT JOIN payment_institutions pi ON pi.id = ebl.payment_institution_id WHERE ebl.employee_id = ? ORDER BY ebl.created_at DESC LIMIT 20").bind(employeeId).all() : Promise.resolve({ results: [] }),
    canViewBankLoans ? c.env.DB.prepare("SELECT * FROM employee_bank_loan_payments WHERE employee_id = ? ORDER BY created_at DESC LIMIT 50").bind(employeeId).all() : Promise.resolve({ results: [] }),
    canViewPension ? c.env.DB.prepare("SELECT epp.*, ps.scheme_name, ps.scheme_code FROM employee_pension_profiles epp LEFT JOIN pension_schemes ps ON ps.id = epp.pension_scheme_id WHERE epp.employee_id = ? AND epp.status != 'ARCHIVED' ORDER BY epp.effective_date DESC LIMIT 1").bind(employeeId).first<Record<string, unknown>>() : Promise.resolve(null),
    canViewPension ? c.env.DB.prepare("SELECT ppc.*, ps.scheme_name FROM payroll_pension_contributions ppc LEFT JOIN pension_schemes ps ON ps.id = ppc.pension_scheme_id WHERE ppc.employee_id = ? ORDER BY ppc.created_at DESC LIMIT 50").bind(employeeId).all() : Promise.resolve({ results: [] }),
    canViewCustomDeductions ? c.env.DB.prepare("SELECT * FROM employee_custom_deductions WHERE employee_id = ? AND status != 'ARCHIVED' ORDER BY created_at DESC LIMIT 50").bind(employeeId).all() : Promise.resolve({ results: [] }),
    canViewCustomDeductions ? c.env.DB.prepare("SELECT ecda.*, ecd.template_name_snapshot, ecd.category_snapshot FROM employee_custom_deduction_applications ecda INNER JOIN employee_custom_deductions ecd ON ecd.id = ecda.employee_custom_deduction_id WHERE ecda.employee_id = ? ORDER BY ecda.created_at DESC LIMIT 100").bind(employeeId).all() : Promise.resolve({ results: [] }),
    c.env.DB.prepare(
      `SELECT * FROM audit_logs
       WHERE module = 'payroll' AND (
         entity_id IN (SELECT id FROM employee_payroll_profiles WHERE employee_id = ?)
         OR entity_id IN (SELECT id FROM employee_salary_history WHERE employee_id = ?)
         OR entity_id IN (SELECT id FROM employee_increments WHERE employee_id = ?)
         OR entity_id IN (SELECT id FROM payroll_advance_payments WHERE employee_id = ?)
         OR entity_id IN (SELECT id FROM payroll_deductions WHERE employee_id = ?)
         OR entity_id IN (SELECT id FROM payroll_adjustments WHERE employee_id = ?)
         OR entity_id IN (SELECT id FROM payroll_employee_results WHERE employee_id = ?)
         OR entity_id IN (SELECT id FROM employee_payment_methods WHERE employee_id = ?)
         OR entity_id IN (SELECT id FROM employee_bank_loans WHERE employee_id = ?)
         OR entity_id IN (SELECT id FROM employee_bank_loan_payments WHERE employee_id = ?)
         OR entity_id IN (SELECT id FROM employee_pension_profiles WHERE employee_id = ?)
         OR entity_id IN (SELECT id FROM payroll_pension_contributions WHERE employee_id = ?)
         OR entity_id IN (SELECT id FROM employee_custom_deductions WHERE employee_id = ?)
         OR entity_id IN (SELECT id FROM employee_custom_deduction_applications WHERE employee_id = ?)
         OR entity_id IN (SELECT id FROM final_settlements WHERE employee_id = ?)
       )
       ORDER BY created_at DESC LIMIT 50`
    ).bind(employeeId, employeeId, employeeId, employeeId, employeeId, employeeId, employeeId, employeeId, employeeId, employeeId, employeeId, employeeId, employeeId, employeeId, employeeId).all()
  ]);
  return ok(c, {
    profile: profile ? safeProfile(profile, true) : null,
    salary_history: salary.results,
    increments: increments.results,
    advances: advances.results,
    deductions: deductions.results,
    run_history: runs.results,
    runs: runs.results,
    payslips: payslips.results,
    final_settlements: settlements.results,
    settlements: settlements.results,
    payment_methods: paymentMethods,
    bank_loans: (bankLoans.results as Record<string, unknown>[]).map((row) => safeBankLoan(row, canSensitiveBankLoans)),
    bank_loan_payments: (bankLoanPayments.results as Record<string, unknown>[]).map((row) => safeBankLoanPayment(row, canSensitiveBankLoans)),
    pension_profile: safePensionProfile(pensionProfile as Record<string, unknown> | null, canSensitivePension),
    pension_contributions: pensionContributions.results,
    custom_deductions: customDeductions.results,
    custom_deduction_applications: customDeductionApplications.results,
    audit: audit.results
  });
});

employeePayrollRoutes.get("/:employeeId/payslips", requireAnyPermission(["payroll.payslips.view", "payroll.payslips.manage", "employees.payroll.view", "payroll.view"]), async (c) => {
  const employeeId = routeParam(c, "employeeId");
  if (!(await canViewPayslipForEmployee(c, employeeId))) return fail(c, 404, "PAYSIP_ACCESS_DENIED", "You can only view your own payslips.");
  return ok(c, { payslips: await listPayslips(c, employeeId) });
});

payrollRoutes.get("/advances", requireAnyPermission(["payroll.advances.view", "payroll.view"]), async (c) => {
  const conditions = ["1 = 1"];
  const params: BindValue[] = [];
  await scopedEmployeeFilter(c, conditions, params);
  const departmentId = readString(c.req.query("department_id"));
  if (departmentId) { conditions.push("e.primary_department_id = ?"); params.push(departmentId); }
  const locationId = readString(c.req.query("location_id"));
  if (locationId) { conditions.push("e.primary_location_id = ?"); params.push(locationId); }
  const status = readString(c.req.query("status")).toUpperCase();
  if (status && ADVANCE_STATUSES.has(status)) { conditions.push("x.status = ?"); params.push(status); }
  const paymentDateFrom = readString(c.req.query("payment_date_from"));
  if (paymentDateFrom) { conditions.push("x.payment_date >= ?"); params.push(paymentDateFrom); }
  const paymentDateTo = readString(c.req.query("payment_date_to"));
  if (paymentDateTo) { conditions.push("x.payment_date <= ?"); params.push(paymentDateTo); }
  const rows = await c.env.DB.prepare(`SELECT x.*, e.employee_no, e.full_name AS employee_name, d.name AS department_name, l.name AS location_name FROM payroll_advance_payments x INNER JOIN employees e ON e.id = x.employee_id LEFT JOIN departments d ON d.id = e.primary_department_id LEFT JOIN locations l ON l.id = e.primary_location_id WHERE ${conditions.join(" AND ")} ORDER BY x.payment_date DESC LIMIT 500`).bind(...params).all();
  return ok(c, { advances: rows.results });
});

payrollRoutes.get("/advances/:id", requireAnyPermission(["payroll.advances.view", "payroll.view"]), async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM payroll_advance_payments WHERE id = ?").bind(routeParam(c, "id")).first();
  if (!row) return fail(c, 404, "NOT_FOUND", "Advance payment was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String((row as Record<string, unknown>).employee_id), "payroll", "view"))) return fail(c, 404, "NOT_FOUND", "Advance payment was not found.");
  return ok(c, { advance: row });
});

payrollRoutes.post("/advances", requirePermission("payroll.advances.manage"), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const employeeId = readString(body.employee_id);
  const employee = await getEmployee(c, employeeId);
  if (!employee) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "payroll", "manage"))) return fail(c, 403, "FORBIDDEN", "You do not have payroll access to this employee.");
  const profile = await ensureProfile(c, employeeId);
  const amount = num(body.amount, null);
  const paymentDate = readString(body.payment_date);
  if (amount == null || amount <= 0 || !isDate(paymentDate)) return fail(c, 400, "VALIDATION_ERROR", "Positive amount and payment date are required.");
  if (!bool(profile?.advance_eligible, false)) return fail(c, 400, "ADVANCE_NOT_ALLOWED", "Employee is not eligible for advance payments.");
  if (profile?.advance_limit_amount != null && amount > Number(profile.advance_limit_amount)) return fail(c, 400, "ADVANCE_LIMIT_EXCEEDED", "Advance amount exceeds employee limit.");
  if (profile?.advance_limit_percent != null && Number(profile.basic_salary ?? 0) > 0 && amount > Number(profile.basic_salary) * Number(profile.advance_limit_percent) / 100) return fail(c, 400, "ADVANCE_LIMIT_EXCEEDED", "Advance amount exceeds employee percentage limit.");
  const repaymentPeriod = optionalString(body.repayment_period_id) ? await getPeriod(c, String(body.repayment_period_id)) : null;
  const cutoffError = enforcePayrollCutoffForSubmission(c, repaymentPeriod, optionalString(body.reason ?? body.notes));
  if (cutoffError) return cutoffError;
  const id = crypto.randomUUID();
  const status = ADVANCE_STATUSES.has(readString(body.status).toUpperCase()) ? readString(body.status).toUpperCase() : "REQUESTED";
  await c.env.DB.prepare("INSERT INTO payroll_advance_payments (id, employee_id, amount, payment_date, repayment_period_id, status, notes, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, employeeId, amount, paymentDate, optionalString(body.repayment_period_id), status, optionalString(body.notes), c.get("currentUser").id).run();
  const saved = await c.env.DB.prepare("SELECT * FROM payroll_advance_payments WHERE id = ?").bind(id).first();
  await auditPayroll(c, { action: "payroll.advance.created", entityType: "payroll_advance", entityId: id, newValue: saved });
  await publishPayroll(c, "payroll.advance.created", "payroll_advance", id, "created");
  return ok(c, { advance: saved }, 201);
});

payrollRoutes.patch("/advances/:id", requirePermission("payroll.advances.manage"), async (c) => {
  const id = routeParam(c, "id");
  const old = await c.env.DB.prepare("SELECT * FROM payroll_advance_payments WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!old) return fail(c, 404, "NOT_FOUND", "Advance payment was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(old.employee_id), "payroll", "manage"))) return fail(c, 404, "NOT_FOUND", "Advance payment was not found.");
  const body = await readJsonBody(c.req.raw);
  const amount = num(body.amount, Number(old.amount)) ?? Number(old.amount);
  if (amount <= 0) return fail(c, 400, "VALIDATION_ERROR", "Advance amount must be positive.");
  const repaymentPeriod = optionalString(body.repayment_period_id ?? old.repayment_period_id) ? await getPeriod(c, String(body.repayment_period_id ?? old.repayment_period_id)) : null;
  const cutoffError = enforcePayrollCutoffForSubmission(c, repaymentPeriod, optionalString(body.reason ?? body.notes ?? old.notes));
  if (cutoffError) return cutoffError;
  await c.env.DB.prepare("UPDATE payroll_advance_payments SET amount = ?, payment_date = ?, repayment_period_id = ?, notes = ?, updated_at = ? WHERE id = ?").bind(amount, readString(body.payment_date ?? old.payment_date), optionalString(body.repayment_period_id ?? old.repayment_period_id), optionalString(body.notes ?? old.notes), isoNow(), id).run();
  const saved = await c.env.DB.prepare("SELECT * FROM payroll_advance_payments WHERE id = ?").bind(id).first();
  await auditPayroll(c, { action: "payroll.advance.updated", entityType: "payroll_advance", entityId: id, oldValue: old, newValue: saved });
  await publishPayroll(c, "payroll.advance.updated", "payroll_advance", id, "updated");
  return ok(c, { advance: saved });
});

async function advanceStatus(c: Context<AppBindings>, status: "APPROVED" | "CANCELLED") {
  const id = routeParam(c, "id");
  const old = await c.env.DB.prepare("SELECT * FROM payroll_advance_payments WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!old) return fail(c, 404, "NOT_FOUND", "Advance payment was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(old.employee_id), "payroll", "manage"))) return fail(c, 404, "NOT_FOUND", "Advance payment was not found.");
  const body: Record<string, unknown> = await readJsonBody(c.req.raw).catch(() => ({}));
  if (status === "CANCELLED" && !optionalString(body.reason)) return fail(c, 400, "VALIDATION_ERROR", "Cancellation reason is required.");
  const repaymentPeriod = old.repayment_period_id ? await getPeriod(c, String(old.repayment_period_id)) : null;
  if (status === "APPROVED") {
    const cutoffError = enforcePayrollCutoffForApproval(c, repaymentPeriod, optionalString(body.reason));
    if (cutoffError) return cutoffError;
  }
  const now = isoNow();
  if (status === "APPROVED") await c.env.DB.prepare("UPDATE payroll_advance_payments SET status = 'APPROVED', approved_by_user_id = ?, approved_at = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, now, now, id).run();
  if (status === "CANCELLED") await c.env.DB.prepare("UPDATE payroll_advance_payments SET status = 'CANCELLED', notes = COALESCE(notes, '') || ?, updated_at = ? WHERE id = ?").bind(`\nCancelled: ${optionalString(body.reason)}`, now, id).run();
  const saved = await c.env.DB.prepare("SELECT * FROM payroll_advance_payments WHERE id = ?").bind(id).first();
  const action = status === "APPROVED" ? "payroll.advance.approved" : "payroll.advance.cancelled";
  await auditPayroll(c, { action, entityType: "payroll_advance", entityId: id, oldValue: old, newValue: saved, reason: optionalString(body.reason) });
  await publishPayroll(c, status === "APPROVED" ? "payroll.advance.approved" : "payroll.advance.updated", "payroll_advance", id, status.toLowerCase());
  return ok(c, { advance: saved });
}

payrollRoutes.post("/advances/:id/approve", requireAnyPermission(["payroll.advances.approve", "payroll.advances.manage"]), (c) => advanceStatus(c, "APPROVED"));
payrollRoutes.post("/advances/:id/mark-paid", requireAnyPermission(["payroll.advances.manage", "payroll.manage"]), (c) => disabledPayrollCoreFeature(c, "PAYROLL_PAYMENT_NOT_AVAILABLE", "Payment processing is not available in Payroll Core."));
payrollRoutes.post("/advances/:id/cancel", requireAnyPermission(["payroll.advances.cancel", "payroll.advances.manage"]), (c) => advanceStatus(c, "CANCELLED"));

payrollRoutes.get("/deductions", requireAnyPermission(["payroll.deductions.view", "payroll.view"]), async (c) => {
  const conditions = ["1 = 1"];
  const params: BindValue[] = [];
  await scopedEmployeeFilter(c, conditions, params);
  const departmentId = readString(c.req.query("department_id"));
  if (departmentId) { conditions.push("e.primary_department_id = ?"); params.push(departmentId); }
  const locationId = readString(c.req.query("location_id"));
  if (locationId) { conditions.push("e.primary_location_id = ?"); params.push(locationId); }
  const status = readString(c.req.query("status")).toUpperCase();
  if (status && DEDUCTION_STATUSES.has(status)) { conditions.push("x.status = ?"); params.push(status); }
  const type = readString(c.req.query("deduction_type")).toUpperCase();
  if (type && DEDUCTION_TYPES.has(type)) { conditions.push("x.deduction_type = ?"); params.push(type); }
  const rows = await c.env.DB.prepare(`SELECT x.*, e.employee_no, e.full_name AS employee_name, d.name AS department_name, l.name AS location_name, pc.code AS component_code, pc.name AS component_name FROM payroll_deductions x INNER JOIN employees e ON e.id = x.employee_id LEFT JOIN departments d ON d.id = e.primary_department_id LEFT JOIN locations l ON l.id = e.primary_location_id LEFT JOIN payroll_components pc ON pc.id = x.payroll_component_id WHERE ${conditions.join(" AND ")} ORDER BY x.created_at DESC LIMIT 500`).bind(...params).all();
  return ok(c, { deductions: rows.results });
});

payrollRoutes.post("/deductions", requireAnyPermission(["payroll.deductions.manage", "payroll.adjustments.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const amount = num(body.amount, null);
  const type = readString(body.deduction_type).toUpperCase();
  const reason = readString(body.reason);
  if (!readString(body.employee_id) || amount == null || amount <= 0 || !DEDUCTION_TYPES.has(type) || !reason) return fail(c, 400, "VALIDATION_ERROR", "Employee, deduction type, amount, and reason are required.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), readString(body.employee_id), "payroll", "manage"))) return fail(c, 403, "FORBIDDEN", "You do not have payroll access to this employee.");
  const period = optionalString(body.payroll_period_id) ? await getPeriod(c, String(body.payroll_period_id)) : null;
  const cutoffError = enforcePayrollCutoffForSubmission(c, period, reason);
  if (cutoffError) return cutoffError;
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO payroll_deductions (id, employee_id, payroll_component_id, deduction_type, amount, start_date, end_date, payroll_period_id, reason, status, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)").bind(id, readString(body.employee_id), optionalString(body.payroll_component_id), type, amount, optionalString(body.start_date), optionalString(body.end_date), optionalString(body.payroll_period_id), reason, c.get("currentUser").id).run();
  const saved = await c.env.DB.prepare("SELECT * FROM payroll_deductions WHERE id = ?").bind(id).first();
  await auditPayroll(c, { action: "payroll.deduction.created", entityType: "payroll_deduction", entityId: id, newValue: saved, reason });
  return ok(c, { deduction: saved }, 201);
});

payrollRoutes.patch("/deductions/:id", requireAnyPermission(["payroll.deductions.manage", "payroll.adjustments.manage"]), async (c) => {
  const id = routeParam(c, "id");
  const old = await c.env.DB.prepare("SELECT * FROM payroll_deductions WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!old) return fail(c, 404, "NOT_FOUND", "Deduction was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(old.employee_id), "payroll", "manage"))) return fail(c, 404, "NOT_FOUND", "Deduction was not found.");
  const body = await readJsonBody(c.req.raw);
  const amount = num(body.amount, Number(old.amount)) ?? Number(old.amount);
  const type = readString(body.deduction_type ?? old.deduction_type).toUpperCase();
  const status = readString(body.status ?? old.status).toUpperCase();
  const period = optionalString(body.payroll_period_id ?? old.payroll_period_id) ? await getPeriod(c, String(body.payroll_period_id ?? old.payroll_period_id)) : null;
  const cutoffError = enforcePayrollCutoffForSubmission(c, period, readString(body.reason ?? old.reason));
  if (cutoffError) return cutoffError;
  await c.env.DB.prepare("UPDATE payroll_deductions SET payroll_component_id = ?, deduction_type = ?, amount = ?, start_date = ?, end_date = ?, payroll_period_id = ?, reason = ?, status = ?, updated_at = ? WHERE id = ?").bind(optionalString(body.payroll_component_id ?? old.payroll_component_id), DEDUCTION_TYPES.has(type) ? type : old.deduction_type, Math.max(0.01, amount), optionalString(body.start_date ?? old.start_date), optionalString(body.end_date ?? old.end_date), optionalString(body.payroll_period_id ?? old.payroll_period_id), readString(body.reason ?? old.reason), DEDUCTION_STATUSES.has(status) ? status : old.status, isoNow(), id).run();
  const saved = await c.env.DB.prepare("SELECT * FROM payroll_deductions WHERE id = ?").bind(id).first();
  await auditPayroll(c, { action: "payroll.deduction.updated", entityType: "payroll_deduction", entityId: id, oldValue: old, newValue: saved });
  return ok(c, { deduction: saved });
});

async function deductionAction(c: Context<AppBindings>, status: "ACTIVE" | "INACTIVE" | "CANCELLED") {
  const id = routeParam(c, "id");
  const old = await c.env.DB.prepare("SELECT * FROM payroll_deductions WHERE id = ?").bind(id).first();
  if (!old) return fail(c, 404, "NOT_FOUND", "Deduction was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String((old as Record<string, unknown>).employee_id), "payroll", "manage"))) return fail(c, 404, "NOT_FOUND", "Deduction was not found.");
  const body: Record<string, unknown> = await readJsonBody(c.req.raw).catch(() => ({}));
  if (status === "CANCELLED" && !optionalString(body.reason)) return fail(c, 400, "VALIDATION_ERROR", "Cancellation reason is required.");
  await c.env.DB.prepare("UPDATE payroll_deductions SET status = ?, updated_at = ? WHERE id = ?").bind(status, isoNow(), id).run();
  const action = status === "ACTIVE" ? "payroll.deduction.enabled" : status === "INACTIVE" ? "payroll.deduction.disabled" : "payroll.deduction.cancelled";
  await auditPayroll(c, { action, entityType: "payroll_deduction", entityId: id, oldValue: old, newValue: { status }, reason: optionalString(body.reason) });
  return ok(c, { status });
}

payrollRoutes.post("/deductions/:id/enable", requireAnyPermission(["payroll.deductions.manage", "payroll.adjustments.manage"]), (c) => deductionAction(c, "ACTIVE"));
payrollRoutes.post("/deductions/:id/disable", requireAnyPermission(["payroll.deductions.manage", "payroll.adjustments.manage"]), (c) => deductionAction(c, "INACTIVE"));
payrollRoutes.post("/deductions/:id/cancel", requireAnyPermission(["payroll.deductions.manage", "payroll.adjustments.manage"]), (c) => deductionAction(c, "CANCELLED"));

payrollRoutes.get("/adjustments", requireAnyPermission(["payroll.adjustments.view", "payroll.view"]), async (c) => {
  const conditions = ["1 = 1"];
  const params: BindValue[] = [];
  await scopedEmployeeFilter(c, conditions, params);
  const rows = await c.env.DB.prepare(`SELECT x.*, e.employee_no, e.full_name AS employee_name FROM payroll_adjustments x INNER JOIN employees e ON e.id = x.employee_id WHERE ${conditions.join(" AND ")} ORDER BY x.created_at DESC LIMIT 500`).bind(...params).all();
  return ok(c, { adjustments: rows.results });
});

payrollRoutes.post("/adjustments", requirePermission("payroll.adjustments.manage"), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const type = readString(body.adjustment_type).toUpperCase();
  const amount = num(body.amount, null);
  const reason = readString(body.reason);
  if (!readString(body.employee_id) || !ADJUSTMENT_TYPES.has(type) || amount == null || amount <= 0 || !reason) return fail(c, 400, "VALIDATION_ERROR", "Employee, adjustment type, amount, and reason are required.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), readString(body.employee_id), "payroll", "manage"))) return fail(c, 403, "FORBIDDEN", "You do not have payroll access to this employee.");
  const period = optionalString(body.payroll_period_id) ? await getPeriod(c, String(body.payroll_period_id)) : null;
  const cutoffError = enforcePayrollCutoffForSubmission(c, period, reason);
  if (cutoffError) return cutoffError;
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO payroll_adjustments (id, employee_id, payroll_period_id, adjustment_type, amount, reason, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, readString(body.employee_id), optionalString(body.payroll_period_id), type, amount, reason, c.get("currentUser").id).run();
  const saved = await c.env.DB.prepare("SELECT * FROM payroll_adjustments WHERE id = ?").bind(id).first();
  await auditPayroll(c, { action: "payroll.adjustment.created", entityType: "payroll_adjustment", entityId: id, newValue: saved, reason });
  return ok(c, { adjustment: saved }, 201);
});

payrollRoutes.patch("/adjustments/:id", requirePermission("payroll.adjustments.manage"), async (c) => {
  const id = routeParam(c, "id");
  const old = await c.env.DB.prepare("SELECT * FROM payroll_adjustments WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!old) return fail(c, 404, "NOT_FOUND", "Adjustment was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(old.employee_id), "payroll", "manage"))) return fail(c, 404, "NOT_FOUND", "Adjustment was not found.");
  const body = await readJsonBody(c.req.raw);
  const status = readString(body.status ?? old.status).toUpperCase();
  const period = optionalString(body.payroll_period_id ?? old.payroll_period_id) ? await getPeriod(c, String(body.payroll_period_id ?? old.payroll_period_id)) : null;
  const cutoffError = enforcePayrollCutoffForSubmission(c, period, readString(body.reason ?? old.reason));
  if (cutoffError) return cutoffError;
  await c.env.DB.prepare("UPDATE payroll_adjustments SET payroll_period_id = ?, amount = ?, reason = ?, status = ?, updated_at = ? WHERE id = ?").bind(optionalString(body.payroll_period_id ?? old.payroll_period_id), num(body.amount, Number(old.amount)), readString(body.reason ?? old.reason), ADJUSTMENT_STATUSES.has(status) ? status : old.status, isoNow(), id).run();
  const saved = await c.env.DB.prepare("SELECT * FROM payroll_adjustments WHERE id = ?").bind(id).first();
  await auditPayroll(c, { action: "payroll.adjustment.updated", entityType: "payroll_adjustment", entityId: id, oldValue: old, newValue: saved });
  return ok(c, { adjustment: saved });
});

async function adjustmentAction(c: Context<AppBindings>, status: "APPROVED_PLACEHOLDER" | "CANCELLED") {
  const id = routeParam(c, "id");
  const old = await c.env.DB.prepare("SELECT * FROM payroll_adjustments WHERE id = ?").bind(id).first();
  if (!old) return fail(c, 404, "NOT_FOUND", "Adjustment was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String((old as Record<string, unknown>).employee_id), "payroll", "manage"))) return fail(c, 404, "NOT_FOUND", "Adjustment was not found.");
  const body: Record<string, unknown> = await readJsonBody(c.req.raw).catch(() => ({}));
  if (status === "CANCELLED" && !optionalString(body.reason)) return fail(c, 400, "VALIDATION_ERROR", "Cancellation reason is required.");
  const period = (old as Record<string, unknown>).payroll_period_id ? await getPeriod(c, String((old as Record<string, unknown>).payroll_period_id)) : null;
  if (status === "APPROVED_PLACEHOLDER") {
    const cutoffError = enforcePayrollCutoffForApproval(c, period, optionalString(body.reason));
    if (cutoffError) return cutoffError;
  }
  await c.env.DB.prepare("UPDATE payroll_adjustments SET status = ?, approved_by_user_id = ?, approved_at = ?, updated_at = ? WHERE id = ?").bind(status, status === "APPROVED_PLACEHOLDER" ? c.get("currentUser").id : null, status === "APPROVED_PLACEHOLDER" ? isoNow() : null, isoNow(), id).run();
  await auditPayroll(c, { action: status === "APPROVED_PLACEHOLDER" ? "payroll.adjustment.approved_placeholder" : "payroll.adjustment.cancelled", entityType: "payroll_adjustment", entityId: id, oldValue: old, newValue: { status }, reason: optionalString(body.reason) });
  return ok(c, { status });
}

payrollRoutes.post("/adjustments/:id/approve", requireAnyPermission(["payroll.adjustments.approve_placeholder", "payroll.adjustments.manage"]), (c) => adjustmentAction(c, "APPROVED_PLACEHOLDER"));
payrollRoutes.post("/adjustments/:id/cancel", requirePermission("payroll.adjustments.manage"), (c) => adjustmentAction(c, "CANCELLED"));

payrollRoutes.get("/periods", requireAnyPermission(["payroll.periods.view", "payroll.view"]), async (c) => {
  const conditions = ["1 = 1"];
  const params: BindValue[] = [];
  const year = readString(c.req.query("year"));
  if (year) { conditions.push("period_year = ?"); params.push(Number(year)); }
  const month = readString(c.req.query("month"));
  if (month) { conditions.push("period_month = ?"); params.push(Number(month)); }
  const status = readString(c.req.query("status")).toUpperCase();
  if (PERIOD_STATUSES.has(status)) { conditions.push("status = ?"); params.push(status); }
  const rows = await c.env.DB.prepare(`SELECT * FROM payroll_periods WHERE ${conditions.join(" AND ")} ORDER BY period_year DESC, period_month DESC`).bind(...params).all();
  return ok(c, { periods: rows.results });
});

payrollRoutes.get("/periods/:id", requireAnyPermission(["payroll.periods.view", "payroll.view"]), async (c) => {
  const period = await getPeriod(c, routeParam(c, "id"));
  if (!period) return fail(c, 404, "NOT_FOUND", "Payroll period was not found.");
  return ok(c, { period });
});

payrollRoutes.post("/periods", requireAnyPermission(["payroll.periods.create", "payroll.periods.manage", "payroll.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const month = num(body.period_month, null);
  const year = num(body.period_year, null);
  if (!month || month < 1 || month > 12 || !year) return fail(c, 400, "VALIDATION_ERROR", "Valid payroll month and year are required.");
  const startDate = readString(body.start_date) || `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = readString(body.end_date) || monthEnd(year, month);
  if (!isDate(startDate) || !isDate(endDate) || endDate < startDate) return fail(c, 400, "VALIDATION_ERROR", "Valid start and end dates are required.");
  const settings = await getSettings(c);
  const payDay = num(body.salary_payment_day, num(settings.default_salary_payment_day, null));
  const salaryPaymentDate = readString(body.salary_payment_date) || (payDay ? `${year}-${String(month).padStart(2, "0")}-${String(Math.min(payDay, Number(endDate.slice(8, 10)))).padStart(2, "0")}` : null);
  const id = crypto.randomUUID();
  try {
    await c.env.DB.prepare("INSERT INTO payroll_periods (id, period_month, period_year, start_date, end_date, salary_payment_date, status, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', ?)").bind(id, month, year, startDate, endDate, salaryPaymentDate, c.get("currentUser").id).run();
  } catch {
    return fail(c, 409, "DUPLICATE_PERIOD", "A payroll period already exists for this month and year.");
  }
  const saved = await getPeriod(c, id);
  await auditPayroll(c, { action: "payroll.period.created", entityType: "payroll_period", entityId: id, newValue: saved });
  await publishPayroll(c, "payroll.period.created", "payroll_period", id, "created");
  return ok(c, { period: saved }, 201);
});

payrollRoutes.patch("/periods/:id", requireAnyPermission(["payroll.periods.update", "payroll.periods.manage", "payroll.manage"]), async (c) => {
  const id = routeParam(c, "id");
  const old = await getPeriod(c, id);
  if (!old) return fail(c, 404, "NOT_FOUND", "Payroll period was not found.");
  const body = await readJsonBody(c.req.raw);
  if (Object.prototype.hasOwnProperty.call(body, "status")) return fail(c, 400, "VALIDATION_ERROR", "Payroll period status changes must use dedicated action endpoints.");
  await c.env.DB.prepare("UPDATE payroll_periods SET start_date = ?, end_date = ?, salary_payment_date = ?, updated_at = ? WHERE id = ?").bind(readString(body.start_date ?? old.start_date), readString(body.end_date ?? old.end_date), optionalString(body.salary_payment_date ?? old.salary_payment_date), isoNow(), id).run();
  const saved = await getPeriod(c, id);
  await auditPayroll(c, { action: "payroll.period.updated", entityType: "payroll_period", entityId: id, oldValue: old, newValue: saved });
  await publishPayroll(c, "payroll.period.updated", "payroll_period", id, "updated");
  return ok(c, { period: saved });
});

payrollRoutes.post("/periods/:id/close", requireAnyPermission(["payroll.periods.lock", "payroll.periods.manage", "payroll.lock", "payroll.manage"]), async (c) => {
  const id = routeParam(c, "id");
  const old = await getPeriod(c, id);
  if (!old) return fail(c, 404, "NOT_FOUND", "Payroll period was not found.");
  await c.env.DB.prepare("UPDATE payroll_periods SET status = 'LOCKED', closed_by_user_id = ?, closed_at = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, isoNow(), isoNow(), id).run();
  await auditPayroll(c, { action: "payroll.period.locked", entityType: "payroll_period", entityId: id, oldValue: old });
  return ok(c, { locked: true, period: await getPeriod(c, id) });
});

payrollRoutes.post("/periods/:id/lock", requireAnyPermission(["payroll.periods.lock", "payroll.periods.manage", "payroll.lock", "payroll.manage"]), async (c) => {
  const id = routeParam(c, "id");
  const old = await getPeriod(c, id);
  if (!old) return fail(c, 404, "NOT_FOUND", "Payroll period was not found.");
  await c.env.DB.prepare("UPDATE payroll_periods SET status = 'LOCKED', closed_by_user_id = ?, closed_at = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, isoNow(), isoNow(), id).run();
  await auditPayroll(c, { action: "payroll.period.locked", entityType: "payroll_period", entityId: id, oldValue: old });
  return ok(c, { period: await getPeriod(c, id) });
});

payrollRoutes.post("/periods/:id/unlock", requireAnyPermission(["payroll.periods.unlock", "payroll.periods.manage", "payroll.unlock", "payroll.manage"]), async (c) => {
  const id = routeParam(c, "id");
  const old = await getPeriod(c, id);
  if (!old) return fail(c, 404, "NOT_FOUND", "Payroll period was not found.");
  await c.env.DB.prepare("UPDATE payroll_periods SET status = 'READY_FOR_REVIEW', closed_by_user_id = NULL, closed_at = NULL, updated_at = ? WHERE id = ?").bind(isoNow(), id).run();
  await auditPayroll(c, { action: "payroll.period.unlocked", entityType: "payroll_period", entityId: id, oldValue: old });
  return ok(c, { period: await getPeriod(c, id) });
});

payrollRoutes.post("/periods/:id/finalize-placeholder", requireAnyPermission(["payroll.periods.finalize_placeholder", "payroll.finalize_placeholder", "payroll.periods.manage", "payroll.manage"]), async (c) => {
  const id = routeParam(c, "id");
  const old = await getPeriod(c, id);
  if (!old) return fail(c, 404, "NOT_FOUND", "Payroll period was not found.");
  await c.env.DB.prepare("UPDATE payroll_periods SET status = 'FINALIZED_PLACEHOLDER', closed_by_user_id = ?, closed_at = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, isoNow(), isoNow(), id).run();
  await auditPayroll(c, { action: "payroll.period.finalized_placeholder", entityType: "payroll_period", entityId: id, oldValue: old });
  return ok(c, { period: await getPeriod(c, id) });
});

payrollRoutes.post("/periods/:id/cancel", requireAnyPermission(["payroll.periods.cancel", "payroll.periods.manage", "payroll.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const reason = optionalString(body.reason);
  if (!reason) return fail(c, 400, "VALIDATION_ERROR", "Cancellation reason is required.");
  const id = routeParam(c, "id");
  const old = await getPeriod(c, id);
  if (!old) return fail(c, 404, "NOT_FOUND", "Payroll period was not found.");
  await c.env.DB.prepare("UPDATE payroll_periods SET status = 'CANCELLED', updated_at = ? WHERE id = ?").bind(isoNow(), id).run();
  await auditPayroll(c, { action: "payroll.period.cancelled", entityType: "payroll_period", entityId: id, oldValue: old, reason });
  return ok(c, { cancelled: true });
});

payrollRoutes.get("/runs", requireAnyPermission(["payroll.runs.view", "payroll.view"]), async (c) => {
  const conditions = ["1 = 1"];
  const params: BindValue[] = [];
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "payroll", "view", "e");
  const globalSummary = canUseGlobalPayrollRunSummary(c, scope);
  const scopedEmployeeSql = `SELECT e.id FROM employees e WHERE ${scope.sql}`;
  const periodId = readString(c.req.query("period_id") ?? c.req.query("payroll_period_id"));
  if (periodId) { conditions.push("pr.payroll_period_id = ?"); params.push(periodId); }
  const status = readString(c.req.query("status")).toUpperCase();
  if (status && RUN_STATUSES.has(status)) { conditions.push("pr.status = ?"); params.push(status); }
  const search = readString(c.req.query("search"));
  if (search) { conditions.push("(CAST(pr.run_no AS TEXT) LIKE ? OR pp.period_year LIKE ? OR pp.period_month LIKE ?)"); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  const rows = globalSummary
    ? await c.env.DB.prepare(`SELECT pr.*, pp.period_month, pp.period_year, (SELECT COUNT(*) FROM payroll_employee_results pre WHERE pre.payroll_run_id = pr.id) AS employee_count, (SELECT COALESCE(SUM(total_earnings),0) FROM payroll_employee_results pre WHERE pre.payroll_run_id = pr.id) AS total_earnings, (SELECT COALESCE(SUM(total_deductions),0) FROM payroll_employee_results pre WHERE pre.payroll_run_id = pr.id) AS total_deductions, (SELECT COALESCE(SUM(net_salary),0) FROM payroll_employee_results pre WHERE pre.payroll_run_id = pr.id) AS net_salary_total FROM payroll_runs pr INNER JOIN payroll_periods pp ON pp.id = pr.payroll_period_id WHERE ${conditions.join(" AND ")} ORDER BY pp.period_year DESC, pp.period_month DESC, pr.run_no DESC`).bind(...params).all()
    : await c.env.DB.prepare(
      `SELECT pr.*, pp.period_month, pp.period_year,
        COUNT(pre.id) AS employee_count,
        COALESCE(SUM(pre.total_earnings),0) AS total_earnings,
        COALESCE(SUM(pre.total_deductions),0) AS total_deductions,
        COALESCE(SUM(pre.net_salary),0) AS net_salary_total
       FROM payroll_runs pr
       INNER JOIN payroll_periods pp ON pp.id = pr.payroll_period_id
       INNER JOIN payroll_employee_results pre ON pre.payroll_run_id = pr.id
       WHERE ${conditions.join(" AND ")} AND pre.employee_id IN (${scopedEmployeeSql})
       GROUP BY pr.id
       ORDER BY pp.period_year DESC, pp.period_month DESC, pr.run_no DESC`
    ).bind(...params, ...scope.params).all();
  return ok(c, { runs: rows.results });
});

payrollRoutes.get("/runs/:id", requireAnyPermission(["payroll.runs.view", "payroll.view"]), async (c) => {
  const run = await getScopedRun(c, routeParam(c, "id"));
  if (!run) return fail(c, 404, "NOT_FOUND", "Payroll run was not found.");
  return ok(c, { run });
});

payrollRoutes.post("/runs/generate", requireAnyPermission(["payroll.runs.calculate", "payroll.periods.calculate", "payroll.runs.manage", "payroll.periods.manage", "payroll.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const period = await getPeriod(c, readString(body.payroll_period_id));
  if (!period) return fail(c, 404, "NOT_FOUND", "Payroll period was not found.");
  const runNoRow = await c.env.DB.prepare("SELECT COALESCE(MAX(run_no), 0) + 1 AS run_no FROM payroll_runs WHERE payroll_period_id = ?").bind(period.id).first<{ run_no: number }>();
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO payroll_runs (id, payroll_period_id, run_no, calculation_mode, generated_by_user_id, notes) VALUES (?, ?, ?, ?, ?, ?)").bind(id, period.id, runNoRow?.run_no ?? 1, readString(body.calculation_mode) || "STANDARD", c.get("currentUser").id, optionalString(body.notes)).run();
  const run = (await getRun(c, id))!;
  const result = await recalculateRun(c, run, "generate");
  if (result.error) return fail(c, 400, "VALIDATION_ERROR", result.error);
  const saved = await getRun(c, id);
  await auditPayroll(c, { action: "payroll.run.generated", entityType: "payroll_run", entityId: id, newValue: saved });
  await publishPayroll(c, "payroll.run.generated", "payroll_run", id, "generated");
  return ok(c, { run: saved }, 201);
});

payrollRoutes.post("/runs/:id/recalculate", requireAnyPermission(["payroll.runs.recalculate", "payroll.periods.recalculate", "payroll.runs.manage", "payroll.periods.manage", "payroll.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const run = await getRun(c, routeParam(c, "id"));
  if (!run) return fail(c, 404, "NOT_FOUND", "Payroll run was not found.");
  const status = mapLegacyPayrollRunStatus(run.status);
  if (FINALIZED_PAYROLL_STATUSES.has(status) && !hasAny(c, ["payroll.override_finalized", "payroll.manage"])) return fail(c, 423, "PAYROLL_FINALIZED", "This payroll run is finalized and locked.");
  if (FINALIZED_PAYROLL_STATUSES.has(status) && !optionalString(body.reason)) return fail(c, 400, "REASON_REQUIRED", "Reason is required.");
  if (!["DRAFT", "READY_FOR_REVIEW"].includes(status) && !hasAny(c, ["payroll.override_finalized", "payroll.manage"])) return fail(c, 400, "INVALID_STATUS", "Only draft or ready-for-review payroll runs can be recalculated.");
  const result = await recalculateRun(c, run, "recalculate");
  if (result.error) return fail(c, 400, "VALIDATION_ERROR", result.error);
  const saved = await getRun(c, String(run.id));
  await auditPayroll(c, { action: "payroll.run.recalculated", entityType: "payroll_run", entityId: String(run.id), oldValue: run, newValue: saved, reason: optionalString(body.reason) });
  await publishPayroll(c, "payroll.run.recalculated", "payroll_run", String(run.id), "recalculated");
  return ok(c, { run: saved });
});

payrollRoutes.get("/runs/:id/approvals", requireAnyPermission(["payroll.approvals.view", "payroll.approvals.manage", "payroll.runs.view", "payroll.view"]), async (c) => {
  const { run, response } = await ensureRunAccess(c, routeParam(c, "id"), "view");
  if (!run) return response!;
  const events = (await c.env.DB.prepare("SELECT * FROM payroll_approval_events WHERE payroll_run_id = ? ORDER BY created_at ASC").bind(run.id).all()).results;
  return ok(c, { approvals: events });
});

payrollRoutes.post("/runs/:id/submit-for-approval", requireAnyPermission(["payroll.approvals.submit", "payroll.approvals.manage", "payroll.runs.manage", "payroll.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const result = await submitPayrollRunForApproval(c, routeParam(c, "id"), optionalString(body.note));
  if (result.response) return result.response;
  return ok(c, { run: result.run });
});

payrollRoutes.post("/runs/:id/approve", requireAnyPermission(["payroll.approvals.approve", "payroll.approvals.manage", "payroll.runs.approve_placeholder", "payroll.periods.approve_placeholder", "payroll.approve_placeholder", "payroll.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const result = await approvePayrollRun(c, routeParam(c, "id"), optionalString(body.note));
  if (result.response) return result.response;
  return ok(c, { run: result.run });
});

payrollRoutes.post("/runs/:id/reject", requireAnyPermission(["payroll.approvals.reject", "payroll.approvals.manage", "payroll.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const result = await rejectPayrollRun(c, routeParam(c, "id"), "reject", readString(body.reason), optionalString(body.note));
  if (result.response) return result.response;
  return ok(c, { run: result.run });
});

payrollRoutes.post("/runs/:id/send-back", requireAnyPermission(["payroll.approvals.send_back", "payroll.approvals.manage", "payroll.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const result = await rejectPayrollRun(c, routeParam(c, "id"), "send_back", readString(body.reason), optionalString(body.note));
  if (result.response) return result.response;
  return ok(c, { run: result.run });
});

payrollRoutes.post("/runs/:id/finalize-placeholder", requireAnyPermission(["payroll.runs.finalize_placeholder", "payroll.periods.finalize_placeholder", "payroll.finalize_placeholder"]), async (c) => {
  const run = await getRun(c, routeParam(c, "id"));
  if (!run) return fail(c, 404, "NOT_FOUND", "Payroll run was not found.");
  if (mapLegacyPayrollRunStatus(run.status) !== "APPROVED_PLACEHOLDER") return fail(c, 400, "INVALID_STATUS", "Only approved-placeholder payroll runs can be finalized as placeholders.");
  await c.env.DB.prepare("UPDATE payroll_runs SET status = 'FINALIZED_PLACEHOLDER', updated_at = ? WHERE id = ?").bind(isoNow(), run.id).run();
  await c.env.DB.prepare("UPDATE payroll_employee_results SET status = 'FINALIZED_PLACEHOLDER', updated_at = ? WHERE payroll_run_id = ? AND status NOT IN ('HELD', 'EXCLUDED')").bind(isoNow(), run.id).run();
  await c.env.DB.prepare("UPDATE payroll_periods SET status = 'FINALIZED_PLACEHOLDER', updated_at = ? WHERE id = ?").bind(isoNow(), run.payroll_period_id).run();
  await updateCustomDeductionAfterPayrollFinalized(c, String(run.id));
  await syncLegacyPayrollRunTablesForCompatibility(c, String(run.id));
  await auditPayroll(c, { action: "payroll.run.finalized_placeholder", entityType: "payroll_run", entityId: String(run.id), oldValue: run });
  await publishPayroll(c, "payroll.run.finalized_placeholder", "payroll_run", String(run.id), "finalized_placeholder");
  return ok(c, { run: await getRun(c, String(run.id)) });
});

payrollRoutes.post("/runs/:id/finalize", requireAnyPermission(["payroll.finalization.finalize", "payroll.finalization.manage", "payroll.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const result = await finalizePayrollRun(c, routeParam(c, "id"), optionalString(body.note ?? body.reason), bool(body.override, false));
  if (result.response) return result.response;
  return ok(c, { run: result.run });
});

payrollRoutes.post("/runs/:id/unlock-finalized", requireAnyPermission(["payroll.finalization.unlock", "payroll.unlock_after_finalization", "payroll.finalization.manage", "payroll.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const result = await unlockFinalizedPayrollRun(c, routeParam(c, "id"), readString(body.reason));
  if (result.response) return result.response;
  return ok(c, { run: result.run });
});

payrollRoutes.get("/runs/:id/finalization-status", requireAnyPermission(["payroll.finalization.view", "payroll.finalization.manage", "payroll.runs.view", "payroll.view"]), async (c) => {
  const { run, response } = await ensureRunAccess(c, routeParam(c, "id"), "view");
  if (!run) return response!;
  return ok(c, { finalization: { status: run.status, finalized_at: run.finalized_at ?? null, finalized_by_user_id: run.finalized_by_user_id ?? null, locked_at: run.locked_at ?? null, locked_by_user_id: run.locked_by_user_id ?? null, finalization_note: run.finalization_note ?? null, unlocked_at: run.unlocked_at ?? null, unlock_reason: run.unlock_reason ?? null } });
});

payrollRoutes.post("/runs/:id/generate-payslips", requireAnyPermission(["payroll.payslips.generate", "payroll.payslips.manage", "payroll.manage"]), async (c) => {
  const result = await generatePayslipsForPayrollRun(c, routeParam(c, "id"));
  if (result.response) return result.response;
  return ok(c, { payslips: result.payslips });
});

payrollRoutes.get("/runs/:id/payment-register", requireAnyPermission(["payroll.payment_register.view", "payroll.payment_register.manage", "payroll.view"]), async (c) => {
  const { run, response } = await ensureRunAccess(c, routeParam(c, "id"), "view");
  if (!run) return response!;
  return ok(c, { payments: await listPaymentRegisters(c, String(run.id)) });
});

payrollRoutes.post("/runs/:id/prepare-payment-register", requireAnyPermission(["payroll.payment_register.prepare", "payroll.payment_register.manage", "payroll.manage"]), async (c) => {
  const result = await preparePaymentRegisterForPayrollRun(c, routeParam(c, "id"));
  if (result.response) return result.response;
  return ok(c, { payments: result.payments });
});

payrollRoutes.post("/runs/:id/mark-paid", requireAnyPermission(["payroll.runs.manage", "payroll.manage"]), (c) => disabledPayrollCoreFeature(c, "PAYROLL_PAYMENT_NOT_AVAILABLE", "Payment processing is not available in Payroll Core."));

payrollRoutes.post("/runs/:id/cancel", requireAnyPermission(["payroll.runs.cancel", "payroll.runs.manage", "payroll.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const reason = optionalString(body.reason);
  if (!reason) return fail(c, 400, "VALIDATION_ERROR", "Cancellation reason is required.");
  const run = await getRun(c, routeParam(c, "id"));
  if (!run) return fail(c, 404, "NOT_FOUND", "Payroll run was not found.");
  await c.env.DB.prepare("UPDATE payroll_runs SET status = 'CANCELLED', updated_at = ? WHERE id = ?").bind(isoNow(), run.id).run();
  await c.env.DB.prepare("UPDATE payroll_employee_results SET status = 'CANCELLED', updated_at = ? WHERE payroll_run_id = ? AND status != 'HELD'").bind(isoNow(), run.id).run();
  await syncLegacyPayrollRunTablesForCompatibility(c, String(run.id));
  await auditPayroll(c, { action: "payroll.run.cancelled", entityType: "payroll_run", entityId: String(run.id), oldValue: run, reason });
  return ok(c, { cancelled: true });
});

payrollRoutes.get("/runs/:id/employees", requireAnyPermission(["payroll.results.view", "payroll.runs.view", "payroll.view"]), async (c) => {
  const conditions = ["pre.payroll_run_id = ?"];
  const params: BindValue[] = [routeParam(c, "id")];
  await addEmployeeScope(c, conditions, params, "view", "pre.employee_id");
  const rows = (await c.env.DB.prepare(`SELECT pre.*, d.name AS department_name, l.name AS location_name FROM payroll_employee_results pre LEFT JOIN departments d ON d.id = pre.department_id LEFT JOIN locations l ON l.id = pre.location_id WHERE ${conditions.join(" AND ")} ORDER BY pre.employee_no_snapshot`).bind(...params).all<Record<string, unknown>>()).results;
  return ok(c, { employees: rows.map((row) => safePayrollResult(row, canViewPayrollResultSensitive(c))) });
});

payrollRoutes.get("/runs/:id/employees/:runEmployeeId", requireAnyPermission(["payroll.results.detail.view", "payroll.results.view", "payroll.view"]), async (c) => {
  const row = await getRunEmployee(c, routeParam(c, "runEmployeeId"));
  if (!row) return fail(c, 404, "NOT_FOUND", "Payroll employee row was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(row.employee_id), "payroll", "view"))) return fail(c, 404, "NOT_FOUND", "Payroll employee row was not found.");
  return ok(c, { employee: safePayrollResult(row, canViewPayrollResultSensitive(c)) });
});

payrollRoutes.patch("/runs/:id/employees/:runEmployeeId", requireAnyPermission(["payroll.results.update", "payroll.runs.manage", "payroll.manage"]), async (c) => {
  const id = routeParam(c, "runEmployeeId");
  const old = await getRunEmployee(c, id);
  if (!old) return fail(c, 404, "NOT_FOUND", "Payroll employee row was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(old.employee_id), "payroll", "manage"))) return fail(c, 404, "NOT_FOUND", "Payroll employee row was not found.");
  const body = await readJsonBody(c.req.raw);
  const status = readString(body.status ?? old.status).toUpperCase();
  const nextStatus = RUN_EMPLOYEE_STATUSES.has(status) ? mapLegacyPayrollResultStatus(status) : mapLegacyPayrollResultStatus(old.status);
  await c.env.DB.prepare("UPDATE payroll_employee_results SET status = ?, hold_reason = ?, updated_at = ? WHERE id = ?").bind(nextStatus, optionalString(body.hold_reason ?? old.hold_reason), isoNow(), id).run();
  await syncLegacyPayrollRunTablesForCompatibility(c, String(old.payroll_run_id));
  const saved = await getRunEmployee(c, id);
  await auditPayroll(c, { action: "payroll.run_employee.updated", entityType: "payroll_run_employee", entityId: id, oldValue: old, newValue: saved });
  return ok(c, { employee: saved });
});

payrollRoutes.post("/runs/:id/employees/:runEmployeeId/hold", requireAnyPermission(["payroll.results.update", "payroll.runs.manage", "payroll.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const reason = optionalString(body.reason);
  if (!reason) return fail(c, 400, "VALIDATION_ERROR", "Hold reason is required.");
  const id = routeParam(c, "runEmployeeId");
  const old = await getRunEmployee(c, id);
  if (!old) return fail(c, 404, "NOT_FOUND", "Payroll employee row was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(old.employee_id), "payroll", "manage"))) return fail(c, 404, "NOT_FOUND", "Payroll employee row was not found.");
  await c.env.DB.prepare("UPDATE payroll_employee_results SET status = 'HELD', hold_reason = ?, updated_at = ? WHERE id = ?").bind(reason, isoNow(), id).run();
  await syncLegacyPayrollRunTablesForCompatibility(c, String(old.payroll_run_id));
  await auditPayroll(c, { action: "payroll.run_employee.held", entityType: "payroll_run_employee", entityId: id, oldValue: old, reason });
  return ok(c, { employee: await getRunEmployee(c, id) });
});

payrollRoutes.post("/runs/:id/employees/:runEmployeeId/release-hold", requireAnyPermission(["payroll.results.update", "payroll.runs.manage", "payroll.manage"]), async (c) => {
  const id = routeParam(c, "runEmployeeId");
  const old = await getRunEmployee(c, id);
  if (!old) return fail(c, 404, "NOT_FOUND", "Payroll employee row was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(old.employee_id), "payroll", "manage"))) return fail(c, 404, "NOT_FOUND", "Payroll employee row was not found.");
  await c.env.DB.prepare("UPDATE payroll_employee_results SET status = 'READY_FOR_REVIEW', hold_reason = NULL, updated_at = ? WHERE id = ?").bind(isoNow(), id).run();
  await syncLegacyPayrollRunTablesForCompatibility(c, String(old.payroll_run_id));
  await auditPayroll(c, { action: "payroll.run_employee.released", entityType: "payroll_run_employee", entityId: id, oldValue: old });
  return ok(c, { employee: await getRunEmployee(c, id) });
});

payrollRoutes.get("/runs/:id/employees/:runEmployeeId/lines", requireAnyPermission(["payroll.results.detail.view", "payroll.results.view", "payroll.view"]), async (c) => {
  const row = await getRunEmployee(c, routeParam(c, "runEmployeeId"));
  if (!row || !(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(row.employee_id), "payroll", "view"))) return fail(c, 404, "NOT_FOUND", "Payroll employee row was not found.");
  const lines = (await c.env.DB.prepare("SELECT prl.*, pc.code AS component_code, pc.name AS component_name FROM payroll_result_line_items prl LEFT JOIN payroll_components pc ON pc.id = prl.payroll_component_id WHERE payroll_run_employee_id = ? ORDER BY line_type, category, description").bind(routeParam(c, "runEmployeeId")).all<Record<string, unknown>>()).results;
  return ok(c, { lines: lines.map((line) => safePayrollLineItem(line, canViewPayrollResultSensitive(c))) });
});

payrollRoutes.get("/payslips", requireAnyPermission(["payroll.payslips.view", "payroll.payslips.manage", "payroll.view"]), async (c) => {
  const disabled = await requirePayrollModuleEnabled(c);
  if (disabled) return disabled;
  return ok(c, { payslips: await listPayslips(c, readString(c.req.query("employee_id")) || null) });
});

payrollRoutes.get("/payslips/:payslipId", requireAnyPermission(["payroll.payslips.view", "payroll.payslips.manage", "payroll.view"]), async (c) => {
  const payslip = await c.env.DB.prepare("SELECT * FROM payroll_payslips WHERE id = ?").bind(routeParam(c, "payslipId")).first<Record<string, unknown>>();
  if (!payslip || !(await canViewPayslipForEmployee(c, String(payslip.employee_id)))) return fail(c, 404, "PAYSIP_NOT_AVAILABLE", "Payslip is not available.");
  await auditPayroll(c, { action: "payroll.payslip.viewed", entityType: "payroll_payslip", entityId: String(payslip.id) });
  return ok(c, { payslip });
});

payrollRoutes.post("/payslips/:payslipId/regenerate", requireAnyPermission(["payroll.payslips.regenerate", "payroll.payslips.manage", "payroll.manage"]), async (c) => {
  const payslip = await c.env.DB.prepare("SELECT ps.*, pre.employee_id AS result_employee_id FROM payroll_payslips ps INNER JOIN payroll_employee_results pre ON pre.id = ps.payroll_employee_result_id WHERE ps.id = ?").bind(routeParam(c, "payslipId")).first<Record<string, unknown>>();
  if (!payslip || !(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(payslip.employee_id), "payroll", "manage"))) return fail(c, 404, "PAYSIP_NOT_AVAILABLE", "Payslip is not available.");
  const run = await getRun(c, String(payslip.payroll_run_id));
  const result = await getRunEmployee(c, String(payslip.payroll_employee_result_id));
  if (!run || !result) return fail(c, 404, "PAYSIP_NOT_AVAILABLE", "Payslip is not available.");
  const saved = await generatePayslipForEmployeeResult(c, result, run);
  await auditPayroll(c, { action: "payroll.payslip.regenerated", entityType: "payroll_payslip", entityId: String(payslip.id), oldValue: payslip, newValue: saved });
  return ok(c, { payslip: saved });
});

payrollRoutes.get("/payslips/:payslipId/preview", requireAnyPermission(["payroll.payslips.view", "payroll.payslips.manage", "payroll.view"]), async (c) => {
  const payslip = await c.env.DB.prepare("SELECT * FROM payroll_payslips WHERE id = ?").bind(routeParam(c, "payslipId")).first<Record<string, unknown>>();
  if (!payslip || !(await canViewPayslipForEmployee(c, String(payslip.employee_id)))) return fail(c, 404, "PAYSIP_NOT_AVAILABLE", "Payslip is not available.");
  return new Response(String(payslip.html_snapshot ?? ""), { headers: { "Content-Type": "text/html; charset=utf-8" } });
});

payrollRoutes.get("/payslips/:payslipId/download", requireAnyPermission(["payroll.payslips.download", "payroll.payslips.manage"]), async (c) => {
  const payslip = await c.env.DB.prepare("SELECT * FROM payroll_payslips WHERE id = ?").bind(routeParam(c, "payslipId")).first<Record<string, unknown>>();
  if (!payslip || !(await canViewPayslipForEmployee(c, String(payslip.employee_id)))) return fail(c, 404, "PAYSIP_ACCESS_DENIED", "You can only view your own payslips.");
  await c.env.DB.prepare("UPDATE payroll_payslips SET download_count = COALESCE(download_count, 0) + 1, last_downloaded_at = ?, updated_at = ? WHERE id = ?").bind(isoNow(), isoNow(), payslip.id).run();
  await auditPayroll(c, { action: "payroll.payslip.downloaded", entityType: "payroll_payslip", entityId: String(payslip.id) });
  return new Response(String(payslip.html_snapshot ?? ""), { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Disposition": `attachment; filename=${payslip.payslip_number ?? "payslip"}.html` } });
});

payrollRoutes.get("/payment-registers", requireAnyPermission(["payroll.payment_register.view", "payroll.payment_register.manage", "payroll.view"]), async (c) => {
  const disabled = await requirePayrollModuleEnabled(c);
  if (disabled) return disabled;
  return ok(c, { payments: await listPaymentRegisters(c) });
});

payrollRoutes.post("/payment-register/:paymentId/confirm-manual-paid", requireAnyPermission(["payroll.payment_register.confirm_manual_paid", "payroll.payment_register.manage", "payroll.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const result = await confirmManualPayrollPayment(c, routeParam(c, "paymentId"), readString(body.confirmation_reference ?? body.reference), readString(body.confirmation_note ?? body.note));
  if (result.response) return result.response;
  return ok(c, { payment: result.payment });
});

payrollRoutes.post("/payment-register/:paymentId/cancel", requireAnyPermission(["payroll.payment_register.cancel", "payroll.payment_register.manage", "payroll.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const reason = readString(body.reason);
  if (!reason) return fail(c, 400, "REASON_REQUIRED", "Reason is required.");
  const payment = await c.env.DB.prepare("SELECT * FROM payroll_payment_register WHERE id = ?").bind(routeParam(c, "paymentId")).first<Record<string, unknown>>();
  if (!payment || !(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(payment.employee_id), "payroll", "manage"))) return fail(c, 404, "NOT_FOUND", "Payment register row was not found.");
  await c.env.DB.prepare("UPDATE payroll_payment_register SET payment_status = ?, confirmation_note = ?, updated_at = ? WHERE id = ?").bind("CANCELLED", reason, isoNow(), payment.id).run();
  await auditPayroll(c, { action: "payroll.payment_register.cancelled", entityType: "payroll_payment_register", entityId: String(payment.id), oldValue: payment, reason });
  return ok(c, { payment: await c.env.DB.prepare("SELECT * FROM payroll_payment_register WHERE id = ?").bind(payment.id).first() });
});

payrollRoutes.get("/history", requireAnyPermission(["payroll.history.view", "payroll.reports.view", "payroll.view"]), async (c) => {
  const disabled = await requirePayrollModuleEnabled(c);
  if (disabled) return disabled;
  return ok(c, { history: await getPayrollHistorySummary(c) });
});

payrollRoutes.get("/employees/:employeeId/history", requireAnyPermission(["payroll.history.employee.view", "payroll.history.view", "employees.payroll.view", "payroll.view"]), async (c) => {
  const employeeId = routeParam(c, "employeeId");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "payroll", "view"))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  return ok(c, { history: await getPayrollHistorySummary(c, employeeId) });
});

payrollRoutes.get("/reports/summary", requireAnyPermission(["payroll.reports.view", "payroll.history.view", "payroll.view"]), async (c) => ok(c, { summary: await getPayrollHistorySummary(c) }));
payrollRoutes.get("/reports/department-totals", requireAnyPermission(["payroll.reports.view", "payroll.history.view", "payroll.view"]), async (c) => {
  const rows = await getPayrollHistorySummary(c);
  const totals = Object.values(rows.reduce<Record<string, Record<string, unknown>>>((acc, row) => {
    const key = String(row.department_id ?? "unassigned");
    acc[key] ??= { department_id: row.department_id, department_name: row.department_name ?? "Unassigned", employees: 0, total_earnings: 0, total_deductions: 0, net_salary: 0 };
    acc[key].employees = Number(acc[key].employees) + 1;
    acc[key].total_earnings = Number(acc[key].total_earnings) + Number(row.total_earnings ?? 0);
    acc[key].total_deductions = Number(acc[key].total_deductions) + Number(row.total_deductions ?? 0);
    acc[key].net_salary = Number(acc[key].net_salary) + Number(row.net_salary ?? 0);
    return acc;
  }, {}));
  return ok(c, { totals });
});
payrollRoutes.get("/reports/worksite-totals", requireAnyPermission(["payroll.reports.view", "payroll.history.view", "payroll.view"]), async (c) => {
  const rows = await getPayrollHistorySummary(c);
  const totals = Object.values(rows.reduce<Record<string, Record<string, unknown>>>((acc, row) => {
    const key = String(row.location_id ?? "unassigned");
    acc[key] ??= { location_id: row.location_id, location_name: row.location_name ?? "Unassigned", employees: 0, net_salary: 0 };
    acc[key].employees = Number(acc[key].employees) + 1;
    acc[key].net_salary = Number(acc[key].net_salary) + Number(row.net_salary ?? 0);
    return acc;
  }, {}));
  return ok(c, { totals });
});
payrollRoutes.get("/reports/allowances-deductions", requireAnyPermission(["payroll.reports.view", "payroll.history.view", "payroll.view"]), async (c) => {
  const { conditions, params } = await payrollReportFilters(c);
  conditions.push("pr.status IN ('FINALIZED', 'LOCKED', 'FINALIZED_PLACEHOLDER')");
  const rows = (await c.env.DB.prepare(`SELECT prli.line_type, prli.category, prli.description, SUM(prli.amount) AS amount FROM payroll_result_line_items prli INNER JOIN payroll_employee_results pre ON pre.id = prli.payroll_run_employee_id INNER JOIN payroll_runs pr ON pr.id = pre.payroll_run_id INNER JOIN payroll_periods pp ON pp.id = pr.payroll_period_id WHERE ${conditions.join(" AND ")} GROUP BY prli.line_type, prli.category, prli.description ORDER BY prli.line_type, prli.category`).bind(...params).all()).results;
  return ok(c, { reports: rows });
});
payrollRoutes.get("/reports/attendance-deductions", requireAnyPermission(["payroll.reports.view", "payroll.history.view", "payroll.view"]), async (c) => ok(c, { reports: (await getPayrollHistorySummary(c)).filter((row) => Number(row.attendance_deductions ?? 0) > 0) }));
payrollRoutes.get("/reports/leave-deductions", requireAnyPermission(["payroll.reports.view", "payroll.history.view", "payroll.view"]), async (c) => ok(c, { reports: (await getPayrollHistorySummary(c)).filter((row) => Number(row.leave_deductions ?? 0) > 0) }));
payrollRoutes.get("/reports/advance-deductions", requireAnyPermission(["payroll.reports.view", "payroll.history.view", "payroll.view"]), async (c) => ok(c, { reports: (await getPayrollHistorySummary(c)).filter((row) => Number(row.advance_deductions ?? 0) > 0) }));

payrollRoutes.get("/dashboard", requireAnyPermission(["payroll.view", "payroll.periods.view", "payroll.runs.view"]), async (c) => {
  const currentPeriod = await c.env.DB.prepare("SELECT * FROM payroll_periods ORDER BY CASE status WHEN 'DRAFT' THEN 0 WHEN 'CALCULATING' THEN 1 WHEN 'READY_FOR_REVIEW' THEN 2 WHEN 'APPROVED_PLACEHOLDER' THEN 3 ELSE 4 END, period_year DESC, period_month DESC LIMIT 1").first();
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "payroll", "view", "e");
  const globalSummary = canUseGlobalPayrollRunSummary(c, scope);
  const scopedEmployeeSql = `SELECT e.id FROM employees e WHERE ${scope.sql}`;
  const draftRunsSql = globalSummary
    ? "(SELECT COUNT(*) FROM payroll_runs WHERE status = 'DRAFT')"
    : "(SELECT COUNT(DISTINCT pr.id) FROM payroll_runs pr INNER JOIN payroll_employee_results pre ON pre.payroll_run_id = pr.id WHERE pr.status = 'DRAFT' AND pre.employee_id IN (SELECT id FROM scoped_employees))";
  const approvedRunsSql = globalSummary
    ? "(SELECT COUNT(*) FROM payroll_runs WHERE status = 'APPROVED_PLACEHOLDER')"
    : "(SELECT COUNT(DISTINCT pr.id) FROM payroll_runs pr INNER JOIN payroll_employee_results pre ON pre.payroll_run_id = pr.id WHERE pr.status = 'APPROVED_PLACEHOLDER' AND pre.employee_id IN (SELECT id FROM scoped_employees))";
  const paidRunsSql = globalSummary
    ? "(SELECT COUNT(*) FROM payroll_runs WHERE status = 'FINALIZED_PLACEHOLDER')"
    : "(SELECT COUNT(DISTINCT pr.id) FROM payroll_runs pr INNER JOIN payroll_employee_results pre ON pre.payroll_run_id = pr.id WHERE pr.status = 'FINALIZED_PLACEHOLDER' AND pre.employee_id IN (SELECT id FROM scoped_employees))";
  const row = await c.env.DB.prepare(`WITH scoped_employees AS (${scopedEmployeeSql}) SELECT
    (SELECT status FROM payroll_periods ORDER BY period_year DESC, period_month DESC LIMIT 1) AS current_payroll_period_status,
    ${draftRunsSql} AS draft_payroll_runs,
    ${approvedRunsSql} AS approved_payroll_runs,
    ${paidRunsSql} AS paid_payroll_runs,
    (SELECT COALESCE(SUM(pre.net_salary), 0) FROM payroll_employee_results pre INNER JOIN payroll_runs pr ON pr.id = pre.payroll_run_id INNER JOIN payroll_periods pp ON pp.id = pr.payroll_period_id WHERE pre.employee_id IN (SELECT id FROM scoped_employees) AND pp.id = (SELECT id FROM payroll_periods ORDER BY period_year DESC, period_month DESC LIMIT 1)) AS total_payroll_amount_current_period,
    (SELECT COUNT(*) FROM payroll_advance_payments WHERE employee_id IN (SELECT id FROM scoped_employees) AND status IN ('REQUESTED', 'APPROVED')) AS advance_payments_pending,
    (SELECT COUNT(*) FROM employee_payroll_profiles WHERE employee_id IN (SELECT id FROM scoped_employees) AND payroll_included = 0) AS employees_excluded_from_payroll,
    (SELECT COUNT(*) FROM attendance_daily_records WHERE employee_id IN (SELECT id FROM scoped_employees) AND status = 'ABSENT') AS attendance_deduction_candidates,
    (SELECT COUNT(*) FROM leave_request_days lrd INNER JOIN leave_requests lr ON lr.id = lrd.leave_request_id LEFT JOIN leave_policies lp ON lp.id = lr.policy_id WHERE lr.employee_id IN (SELECT id FROM scoped_employees) AND lr.status = 'APPROVED' AND lp.salary_deduction_mode != 'NONE') AS leave_deduction_candidates,
    (SELECT COUNT(*) FROM payroll_employee_results WHERE employee_id IN (SELECT id FROM scoped_employees) AND status = 'HELD') AS payroll_holds`).bind(...scope.params).first();
  return ok(c, {
    ...(row ?? {}),
    current_period: currentPeriod ?? null,
    draft_runs: Number(row?.draft_payroll_runs ?? 0),
    approved_runs: Number(row?.approved_payroll_runs ?? 0),
    paid_runs: Number(row?.paid_payroll_runs ?? 0),
    current_period_net_total: Number(row?.total_payroll_amount_current_period ?? 0),
    pending_advances: Number(row?.advance_payments_pending ?? 0),
    employees_excluded_from_payroll: Number(row?.employees_excluded_from_payroll ?? 0),
    attendance_deduction_candidates: Number(row?.attendance_deduction_candidates ?? 0),
    leave_deduction_candidates: Number(row?.leave_deduction_candidates ?? 0),
    payroll_holds: Number(row?.payroll_holds ?? 0)
  });
});

payrollRoutes.get("/reports", requireAnyPermission(["payroll.reports.view", "payroll.view"]), async (c) => {
  const reportType = readString(c.req.query("report"));
  if (reportType === "custom-deductions" || reportType === "custom-deduction-shortfalls") {
    if (!hasAny(c, ["payroll.custom_deduction_reports.view", "payroll.employee_custom_deductions.view", "payroll.employee_custom_deductions.manage", "payroll.reports.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to view custom deduction reports.");
    const { conditions, params } = await customDeductionReportFilters(c);
    if (reportType === "custom-deduction-shortfalls") conditions.push("ecda.shortfall_amount > 0");
    const rows = await c.env.DB
      .prepare(
        `SELECT pp.period_month, pp.period_year, e.employee_no, e.full_name AS employee_name,
          d.name AS department_name, l.name AS location_name, ecd.template_name_snapshot, ecd.category_snapshot,
          ecda.scheduled_amount, ecda.deducted_amount, ecda.shortfall_amount, ecda.remaining_balance_after,
          ecda.application_status, ecda.reason, ecda.created_at
         FROM employee_custom_deduction_applications ecda
         INNER JOIN employee_custom_deductions ecd ON ecd.id = ecda.employee_custom_deduction_id
         INNER JOIN employees e ON e.id = ecda.employee_id
         LEFT JOIN departments d ON d.id = e.primary_department_id
         LEFT JOIN locations l ON l.id = e.primary_location_id
         LEFT JOIN payroll_periods pp ON pp.id = ecda.payroll_period_id
         WHERE ${conditions.join(" AND ")}
         ORDER BY ecda.created_at DESC LIMIT 1000`
      )
      .bind(...params)
      .all();
    return ok(c, { reports: rows.results });
  }
  const { conditions, params } = await payrollReportFilters(c);
  const rows = await c.env.DB.prepare(`SELECT pp.period_month, pp.period_year, pre.employee_id, pre.employee_no_snapshot, pre.employee_name_snapshot, d.name AS department_name, l.name AS location_name, pre.basic_salary, pre.advance_deductions, pre.days_worked, pre.missed_date_ranges_json, pre.total_deductions, pre.net_salary, pre.status FROM payroll_employee_results pre INNER JOIN payroll_runs pr ON pr.id = pre.payroll_run_id INNER JOIN payroll_periods pp ON pp.id = pr.payroll_period_id LEFT JOIN departments d ON d.id = pre.department_id LEFT JOIN locations l ON l.id = pre.location_id WHERE ${conditions.join(" AND ")} ORDER BY pp.period_year DESC, pp.period_month DESC, pre.employee_no_snapshot LIMIT 1000`).bind(...params).all();
  return ok(c, { reports: rows.results });
});

async function payrollReportCsv(c: Context<AppBindings>, runId?: string) {
  const reportType = readString(c.req.query("report"));
  if (!runId && (reportType === "custom-deductions" || reportType === "custom-deduction-shortfalls")) {
    if (!hasAny(c, ["payroll.custom_deduction_reports.view", "payroll.employee_custom_deductions.view", "payroll.employee_custom_deductions.manage", "payroll.reports.view"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to export custom deduction reports.");
    const { conditions, params } = await customDeductionReportFilters(c);
    if (reportType === "custom-deduction-shortfalls") conditions.push("ecda.shortfall_amount > 0");
    const rows = (await c.env.DB
      .prepare(
        `SELECT pp.period_month, pp.period_year, e.employee_no, e.full_name AS employee_name,
          d.name AS department_name, l.name AS location_name, ecd.template_name_snapshot, ecd.category_snapshot,
          ecda.scheduled_amount, ecda.deducted_amount, ecda.shortfall_amount, ecda.remaining_balance_after,
          ecda.application_status, ecda.reason, ecda.created_at
         FROM employee_custom_deduction_applications ecda
         INNER JOIN employee_custom_deductions ecd ON ecd.id = ecda.employee_custom_deduction_id
         INNER JOIN employees e ON e.id = ecda.employee_id
         LEFT JOIN departments d ON d.id = e.primary_department_id
         LEFT JOIN locations l ON l.id = e.primary_location_id
         LEFT JOIN payroll_periods pp ON pp.id = ecda.payroll_period_id
         WHERE ${conditions.join(" AND ")}
         ORDER BY ecda.created_at DESC LIMIT 1000`
      )
      .bind(...params)
      .all<Record<string, unknown>>()).results;
    await auditPayroll(c, { action: "payroll.custom_deduction_report_exported", entityType: "payroll_report", entityId: reportType, newValue: { rows: rows.length } });
    const header = ["period_month", "period_year", "employee_no", "employee_name", "department_name", "location_name", "template_name_snapshot", "category_snapshot", "scheduled_amount", "deducted_amount", "shortfall_amount", "remaining_balance_after", "application_status", "reason", "created_at"];
    const csv = [header.join(","), ...rows.map((row) => header.map((key) => csvEscape(row[key])).join(","))].join("\n");
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename=${reportType}.csv` } });
  }
  const { conditions, params } = await payrollReportFilters(c, runId);
  const rows = (await c.env.DB.prepare(`SELECT pp.period_month, pp.period_year, pre.employee_no_snapshot, pre.employee_name_snapshot, d.name AS department_name, l.name AS location_name, pre.basic_salary, pre.advance_deductions, pre.days_worked, pre.missed_date_ranges_json, pre.total_deductions, pre.net_salary, pre.status FROM payroll_employee_results pre INNER JOIN payroll_runs pr ON pr.id = pre.payroll_run_id INNER JOIN payroll_periods pp ON pp.id = pr.payroll_period_id LEFT JOIN departments d ON d.id = pre.department_id LEFT JOIN locations l ON l.id = pre.location_id WHERE ${conditions.join(" AND ")} ORDER BY pre.employee_no_snapshot`).bind(...params).all<Record<string, unknown>>()).results;
  await auditPayroll(c, { action: "payroll.report_exported", entityType: "payroll_report", entityId: runId ?? "payroll_summary", newValue: { rows: rows.length } });
  const header = ["period_month", "period_year", "employee_no_snapshot", "employee_name_snapshot", "department_name", "location_name", "basic_salary", "advance_deductions", "days_worked", "missed_date_ranges_json", "total_deductions", "net_salary", "status"];
  const csv = [header.join(","), ...rows.map((row) => header.map((key) => csvEscape(row[key])).join(","))].join("\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename=${runId ? "payroll-run" : "payroll-report"}.csv` } });
}

payrollRoutes.get("/reports/export.csv", requirePermission("payroll.reports.export"), (c) => payrollReportCsv(c));
payrollRoutes.get("/runs/:id/export.csv", requirePermission("payroll.reports.export"), (c) => payrollReportCsv(c, routeParam(c, "id")));

payrollRoutes.get("/final-settlements", requireAnyPermission(["payroll.view", "payroll.reports.view"]), (c) => ok(c, { final_settlements: [], settlements: [], unavailable: true, code: "FINAL_SETTLEMENT_NOT_AVAILABLE", message: "Final settlement will be implemented in a later phase." }));

payrollRoutes.post("/final-settlements", requireAnyPermission(["payroll.manage", "payroll.runs.manage"]), (c) => disabledPayrollCoreFeature(c, "FINAL_SETTLEMENT_NOT_AVAILABLE", "Final settlement will be implemented in a later phase."));

payrollRoutes.patch("/final-settlements/:id", requireAnyPermission(["payroll.manage", "payroll.runs.manage"]), (c) => disabledPayrollCoreFeature(c, "FINAL_SETTLEMENT_NOT_AVAILABLE", "Final settlement will be implemented in a later phase."));
