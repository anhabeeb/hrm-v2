import { Hono } from "hono";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { buildEmployeeScopeWhereClause, canAccessEmployee } from "../auth/access-scopes";
import { recordAudit } from "../db/audit";
import { hasValidationErrors, validateDateRange, validateLockedState, validationResponse } from "../lib/moduleValidation";
import { requireAuth } from "../middleware/auth";
import { publishAccessEvent } from "../realtime/publisher";
import type { AppBindings, AuthUser, Env } from "../types";
import { fail, getClientIp, ok } from "../utils/http";
import { disabledModuleResponse, requireOperationalModuleEnabled } from "../utils/module-enforcement";
import { readJsonBody, readString } from "../utils/validation";
import { getActivePaymentMethodSnapshot, getEmployeePaymentMethods, getFinalSettlementCustomDeductionImpact } from "./payroll-foundations";

type BindValue = string | number | null;
type SettlementStatus =
  | "DRAFT"
  | "CALCULATING"
  | "READY_FOR_REVIEW"
  | "SUBMITTED_FOR_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "SENT_BACK"
  | "FINALIZED"
  | "LOCKED"
  | "CANCELLED";
type SettlementLineType = "EARNING" | "DEDUCTION" | "WARNING" | "INFO";
type FinalSettlementLineType = SettlementLineType | "EMPLOYER_COST";

const EXIT_TYPES = new Set(["RESIGNED", "TERMINATED", "END_OF_CONTRACT", "ABSCONDED", "RETIRED", "DECEASED", "OTHER"]);
const CASE_STATUSES = new Set(["DRAFT", "CALCULATING", "READY_FOR_REVIEW", "SUBMITTED_FOR_APPROVAL", "APPROVED", "REJECTED", "SENT_BACK", "FINALIZED", "LOCKED", "CANCELLED"]);
const LOCKED_CASE_STATUSES = new Set(["FINALIZED", "LOCKED"]);
const PAYMENT_STATUSES = new Set(["PENDING", "PREPARED", "MANUALLY_CONFIRMED_PAID", "RECEIVED_FROM_EMPLOYEE_PLACEHOLDER", "WAIVED", "CANCELLED"]);
const SETTING_BOOLEAN_COLUMNS = [
  "module_enabled",
  "final_settlement_enabled",
  "allow_case_creation_from_exit_status",
  "allow_settlement_case_creation_from_exit_status",
  "auto_create_case_on_exit_status",
  "auto_create_settlement_case_on_exit_status",
  "require_approval_before_finalization",
  "require_settlement_approval_before_finalization",
  "require_clearance_before_finalization",
  "require_document_checklist_before_finalization",
  "require_document_checklist_before_finalization_placeholder",
  "include_unpaid_salary",
  "include_pending_payroll",
  "include_unused_leave_payout",
  "include_negative_leave_balance_deduction",
  "include_unpaid_leave_deduction",
  "include_attendance_deduction",
  "include_bank_loan_deductions",
  "include_bank_loan_shortfall_warnings",
  "include_bank_loan_direct_collection_warnings",
  "include_pension_contribution",
  "include_pension_remittance_warnings",
  "include_custom_deduction_remaining_balances",
  "include_custom_deduction_shortfall_warnings",
  "include_advance_balance_deduction",
  "include_one_time_deductions",
  "include_asset_deductions",
  "include_uniform_deductions",
  "include_notice_period_deduction",
  "include_gratuity_placeholder",
  "include_contract_end_placeholder",
  "include_manual_earning_adjustments",
  "include_manual_deduction_adjustments",
  "settlement_payment_register_enabled",
  "final_settlement_document_placeholder_enabled",
  "final_settlement_document_pdf_placeholder_enabled",
  "allow_recalculation_while_draft",
  "allow_recalculation_after_approval",
  "allow_unlock_after_finalization",
  "require_reason_for_recalculation",
  "require_reason_for_unlock"
] as const;
const SETTING_TEXT_COLUMNS = [
  "default_daily_rate_calculation_mode",
  "default_unused_leave_payout_calculation_mode",
  "default_notice_period_deduction_calculation_mode",
  "default_settlement_currency"
] as const;

export const finalSettlementRoutes = new Hono<AppBindings>();
export const employeeFinalSettlementRoutes = new Hono<AppBindings>();

finalSettlementRoutes.use("*", requireAuth);
employeeFinalSettlementRoutes.use("*", requireAuth);
employeeFinalSettlementRoutes.use("*", async (c, next) => {
  const disabled = await requireFinalSettlementModuleEnabled(c);
  if (disabled) return disabled;
  await next();
});

function routeParam(c: Context<AppBindings>, name: string) {
  return c.req.param(name) ?? "";
}

function isoNow() {
  return new Date().toISOString();
}

function optionalString(value: unknown) {
  const text = readString(value);
  return text || null;
}

function bool(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return value === "true" || value === "1";
  return fallback;
}

function num(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function daysBetween(startDate: string | null | undefined, endDate: string | null | undefined) {
  if (!startDate || !endDate || !isDate(startDate) || !isDate(endDate)) return 0;
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (end < start) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

function firstOfMonth(value: string | null | undefined) {
  if (!value || !isDate(value)) return null;
  return `${value.slice(0, 7)}-01`;
}

function has(c: Context<AppBindings>, permission: string) {
  return c.get("currentUser").permissions.includes(permission);
}

function hasAny(c: Context<AppBindings>, permissions: string[]) {
  return permissions.some((permission) => has(c, permission));
}

function requireAnyPermission(permissions: string[]) {
  return createMiddleware<AppBindings>(async (c, next) => {
    if (!hasAny(c, permissions)) return fail(c, 403, "PERMISSION_DENIED", "You do not have permission to perform this final settlement action.");
    await next();
  });
}

function canSeeSensitive(c: Context<AppBindings>) {
  return hasAny(c, [
    "final_settlement.manage",
    "final_settlement.reports.sensitive.view",
    "final_settlement.payment_register.sensitive.view",
    "employees.final_settlement.sensitive.view",
    "employees.payroll.view",
    "payroll.results.sensitive.view"
  ]);
}

function safeParseJson(value: unknown, fallback: unknown = null) {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function maskAccount(value: unknown) {
  const text = readString(value);
  if (!text) return null;
  const suffix = text.slice(-4);
  return suffix ? `****${suffix}` : "Restricted";
}

function maskSettlementCase(row: Record<string, unknown>, canSensitive: boolean) {
  const copy = { ...row };
  copy.calculation_warnings = safeParseJson(copy.calculation_warnings_json, []);
  copy.calculation_breakdown = safeParseJson(copy.calculation_breakdown_json, {});
  delete copy.calculation_warnings_json;
  delete copy.calculation_breakdown_json;
  if (!canSensitive) {
    copy.total_earnings = null;
    copy.total_deductions = null;
    copy.net_settlement_amount = null;
    copy.company_owes_employee_amount = null;
    copy.employee_owes_company_amount = null;
    copy.sensitive_restricted = true;
  }
  return copy;
}

function maskPayment(row: Record<string, unknown>, canSensitive: boolean) {
  const copy = { ...row };
  if (!canSensitive) {
    copy.bank_name_snapshot = null;
    copy.bank_account_name_snapshot = null;
    copy.bank_account_number_masked = copy.bank_account_number_masked ? "Restricted" : null;
    copy.net_settlement_amount = null;
    copy.sensitive_restricted = true;
  }
  return copy;
}

async function auditFinalSettlement(
  c: Context<AppBindings>,
  input: { action: string; entityType: string; entityId?: string | null; employeeId?: string | null; oldValue?: unknown; newValue?: unknown; reason?: string | null }
) {
  await recordAudit(c.env.DB, {
    actorUserId: c.get("currentUser").id,
    action: input.action,
    module: "final_settlement",
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    oldValue: input.oldValue,
    newValue: { ...(typeof input.newValue === "object" && input.newValue ? input.newValue as Record<string, unknown> : { value: input.newValue }), employee_id: input.employeeId ?? null },
    reason: input.reason,
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent") ?? null
  });
}

async function publishFinalSettlement(c: Context<AppBindings>, action: string, caseId: string, employeeId?: string | null) {
  const payload = { actor_user_id: c.get("currentUser").id, entity_type: "final_settlement" as const, entity_id: caseId, action };
  await publishAccessEvent(c.env, "payroll.changed", payload);
  await publishAccessEvent(c.env, "employee.payroll.changed", payload);
  if (employeeId) {
    await publishAccessEvent(c.env, "employees.changed", { ...payload, entity_type: "employee", entity_id: employeeId });
  }
}

async function createSettlementEvent(
  c: Context<AppBindings>,
  settlementCase: Record<string, unknown>,
  action: string,
  previousStatus: string | null,
  newStatus: string | null,
  reason?: string | null,
  note?: string | null,
  metadata?: unknown
) {
  const user = c.get("currentUser");
  await c.env.DB
    .prepare(
      `INSERT INTO final_settlement_events
       (id, settlement_case_id, employee_id, action, previous_status, new_status, actor_user_id, actor_name_snapshot, reason, note, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      settlementCase.id,
      settlementCase.employee_id,
      action,
      previousStatus,
      newStatus,
      user.id,
      user.name,
      reason ?? null,
      note ?? null,
      metadata === undefined ? null : JSON.stringify(metadata)
    )
    .run();
}

export async function getFinalSettlementSettings(db: Env["DB"]) {
  let settings = await db.prepare("SELECT * FROM final_settlement_settings WHERE id = 'final_settlement_settings_default'").first<Record<string, unknown>>();
  if (!settings) {
    await db.prepare("INSERT OR IGNORE INTO final_settlement_settings (id) VALUES ('final_settlement_settings_default')").run();
    settings = await db.prepare("SELECT * FROM final_settlement_settings WHERE id = 'final_settlement_settings_default'").first<Record<string, unknown>>();
  }
  return settings!;
}

async function getPayrollSettingsForSettlement(c: Context<AppBindings>) {
  return c.env.DB.prepare("SELECT * FROM payroll_settings WHERE id = 'payroll_settings_default'").first<Record<string, unknown>>();
}

function settlementPayrollSubmoduleEnabled(settings: Record<string, unknown> | null | undefined, key: string) {
  return bool(settings?.module_enabled, true) && bool(settings?.[key], true);
}

export async function requireFinalSettlementModuleEnabled(c: Context<AppBindings>) {
  const moduleDisabled = await requireOperationalModuleEnabled(c, "final_settlement", "Final settlement");
  if (moduleDisabled) return moduleDisabled;
  const settings = await getFinalSettlementSettings(c.env.DB);
  if (Number(settings.final_settlement_enabled ?? settings.module_enabled ?? 1) !== 1) return disabledModuleResponse(c, "final_settlement", "Final settlement");
  return null;
}

export async function canViewFinalSettlementForEmployee(c: Context<AppBindings>, employeeId: string) {
  if (!hasAny(c, ["final_settlement.view", "final_settlement.cases.view", "employees.final_settlement.view", "final_settlement.line_items.view", "final_settlement.payment_register.view", "final_settlement.manage"])) return false;
  return canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "final_settlement", "view");
}

export async function canManageFinalSettlementForEmployee(c: Context<AppBindings>, employeeId: string) {
  if (!hasAny(c, [
    "final_settlement.manage",
    "final_settlement.cases.manage",
    "final_settlement.cases.create",
    "final_settlement.cases.update",
    "final_settlement.calculate",
    "final_settlement.recalculate",
    "final_settlement.clearance.update",
    "final_settlement.approvals.manage",
    "final_settlement.finalization.manage"
  ])) return false;
  return canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "final_settlement", "manage");
}

export async function getSettlementEmployeeSnapshot(c: Context<AppBindings>, employeeId: string) {
  return c.env.DB
    .prepare(
      `SELECT e.*, s.key AS status_key, s.name AS status_name,
        d.name AS department_name, p.title AS position_title, l.name AS location_name, jl.name AS job_level_name,
        pr.basic_salary, pr.currency, pr.payment_method, pr.bank_name, pr.bank_account_no, pr.bank_account_name, pr.daily_rate_mode, pr.payroll_included AS payroll_profile_included
       FROM employees e
       LEFT JOIN employee_statuses s ON s.id = e.status_id
       LEFT JOIN departments d ON d.id = e.primary_department_id
       LEFT JOIN positions p ON p.id = e.primary_position_id
       LEFT JOIN locations l ON l.id = e.primary_location_id
       LEFT JOIN job_levels jl ON jl.id = e.job_level_id
       LEFT JOIN employee_payroll_profiles pr ON pr.employee_id = e.id
       WHERE e.id = ? AND e.archived_at IS NULL`
    )
    .bind(employeeId)
    .first<Record<string, unknown>>();
}

async function getScopedCase(c: Context<AppBindings>, caseId: string, action: "view" | "manage" = "view") {
  const row = await c.env.DB.prepare("SELECT * FROM final_settlement_cases WHERE id = ?").bind(caseId).first<Record<string, unknown>>();
  if (!row) return null;
  const allowed = action === "manage"
    ? await canManageFinalSettlementForEmployee(c, String(row.employee_id))
    : await canViewFinalSettlementForEmployee(c, String(row.employee_id));
  return allowed ? row : null;
}

async function listCases(c: Context<AppBindings>) {
  const conditions = ["1 = 1"];
  const params: BindValue[] = [];
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "final_settlement", "view", "e");
  conditions.push(`fsc.employee_id IN (SELECT e.id FROM employees e WHERE ${scope.sql})`);
  params.push(...scope.params);

  const search = readString(c.req.query("search"));
  if (search) {
    conditions.push("(fsc.employee_name_snapshot LIKE ? OR fsc.employee_number_snapshot LIKE ? OR fsc.settlement_number LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  const status = readString(c.req.query("status")).toUpperCase();
  if (status && CASE_STATUSES.has(status)) {
    conditions.push("fsc.status = ?");
    params.push(status);
  }
  const exitType = readString(c.req.query("exit_type")).toUpperCase();
  if (exitType && EXIT_TYPES.has(exitType)) {
    conditions.push("fsc.exit_type = ?");
    params.push(exitType);
  }
  const departmentId = readString(c.req.query("department_id"));
  if (departmentId) {
    conditions.push("fsc.department_id = ?");
    params.push(departmentId);
  }
  const locationId = readString(c.req.query("location_id"));
  if (locationId) {
    conditions.push("fsc.worksite_id = ?");
    params.push(locationId);
  }

  const rows = await c.env.DB
    .prepare(
      `SELECT fsc.*, fspr.payment_status
       , fsc.employee_number_snapshot AS employee_no, fsc.employee_name_snapshot AS employee_name
       FROM final_settlement_cases fsc
       LEFT JOIN final_settlement_payment_register fspr ON fspr.settlement_case_id = fsc.id
       WHERE ${conditions.join(" AND ")}
       ORDER BY fsc.created_at DESC
       LIMIT 200`
    )
    .bind(...params)
    .all<Record<string, unknown>>();
  return rows.results;
}

function dailyRateFromProfile(profile: Record<string, unknown> | null | undefined, settings: Record<string, unknown>) {
  const basicSalary = num(profile?.basic_salary, 0);
  const mode = readString(profile?.daily_rate_mode ?? settings.default_daily_rate_calculation_mode).toUpperCase();
  if (mode === "CALENDAR_DAYS") return basicSalary / 365 * 12;
  if (mode === "WORKING_DAYS") return basicSalary / 26;
  return basicSalary / 30;
}

export async function getFinalSettlementLeaveBalanceSummary(c: Context<AppBindings>, employeeId: string) {
  const cycles = await c.env.DB
    .prepare(
      `SELECT lbc.*, lt.name AS leave_type_name, lt.code AS leave_type_code
       FROM leave_balance_cycles lbc
       LEFT JOIN leave_types lt ON lt.id = lbc.leave_type_id
       WHERE lbc.employee_id = ?
       ORDER BY lbc.cycle_year DESC, lt.sort_order ASC`
    )
    .bind(employeeId)
    .all<Record<string, unknown>>();
  const ledger = await c.env.DB
    .prepare(
      `SELECT *
       FROM leave_balance_ledger_entries
       WHERE employee_id = ?
       ORDER BY created_at DESC
       LIMIT 25`
    )
    .bind(employeeId)
    .all<Record<string, unknown>>();
  const pendingRequests = await c.env.DB
    .prepare("SELECT COUNT(*) AS count FROM leave_requests WHERE employee_id = ? AND status IN ('DRAFT', 'SUBMITTED', 'PENDING_APPROVAL')")
    .bind(employeeId)
    .first<{ count: number }>();
  const unusedDays = cycles.results.reduce((sum, row) => sum + Math.max(0, num(row.closing_balance, 0)), 0);
  const negativeDays = cycles.results.reduce((sum, row) => sum + Math.max(0, -num(row.closing_balance, 0)), 0);
  return { cycles: cycles.results, ledger_recent: ledger.results, unused_days: unusedDays, negative_days: negativeDays, pending_leave_requests: pendingRequests?.count ?? 0 };
}

export function calculateUnusedLeavePayout(summary: { unused_days: number }, dailyRate: number) {
  return roundMoney(Math.max(0, summary.unused_days) * dailyRate);
}

export function calculateNegativeLeaveBalanceDeduction(summary: { negative_days: number }, dailyRate: number) {
  return roundMoney(Math.max(0, summary.negative_days) * dailyRate);
}

export async function createLeaveSettlementLedgerEntry() {
  return { created: false, note: "Leave settlement ledger entries are not written during draft calculation." };
}

export async function getSettlementLeaveImpact(c: Context<AppBindings>, settlementCase: Record<string, unknown>, profile: Record<string, unknown> | null, settings: Record<string, unknown>) {
  const employeeId = String(settlementCase.employee_id);
  const dailyRate = dailyRateFromProfile(profile, settings);
  const balanceSummary = await getFinalSettlementLeaveBalanceSummary(c, employeeId);
  const impacts = await c.env.DB
    .prepare(
      `SELECT lpi.*, lr.start_date, lr.end_date, lr.status AS request_status, lt.name AS leave_type_name
       FROM leave_payroll_impacts lpi
       LEFT JOIN leave_requests lr ON lr.id = lpi.leave_request_id
       LEFT JOIN leave_types lt ON lt.id = lpi.leave_type_id
       WHERE lpi.employee_id = ? AND lpi.status IN ('ESTIMATED', 'IGNORED')`
    )
    .bind(employeeId)
    .all<Record<string, unknown>>();
  const unpaidDeduction = impacts.results.reduce((sum, row) => sum + Math.max(0, num(row.estimated_amount, 0)), 0);
  return {
    balance_summary: balanceSummary,
    unused_leave_payout: calculateUnusedLeavePayout(balanceSummary, dailyRate),
    negative_leave_balance_deduction: calculateNegativeLeaveBalanceDeduction(balanceSummary, dailyRate),
    unpaid_leave_deduction: roundMoney(unpaidDeduction),
    payroll_impacts: impacts.results,
    warnings: balanceSummary.pending_leave_requests ? [`${balanceSummary.pending_leave_requests} leave request(s) are still pending.`] : []
  };
}

export async function getFinalSettlementPayrollHistory(c: Context<AppBindings>, employeeId: string) {
  const rows = await c.env.DB
    .prepare(
      `SELECT pre.*, pr.run_no, pp.period_month, pp.period_year, pp.start_date, pp.end_date
       FROM payroll_employee_results pre
       INNER JOIN payroll_runs pr ON pr.id = pre.payroll_run_id
       INNER JOIN payroll_periods pp ON pp.id = pr.payroll_period_id
       WHERE pre.employee_id = ? AND pre.status IN ('FINALIZED', 'FINALIZED_PLACEHOLDER')
       ORDER BY pp.period_year DESC, pp.period_month DESC
       LIMIT 12`
    )
    .bind(employeeId)
    .all<Record<string, unknown>>();
  if (rows.results.length === 0) return [];
  const ids = rows.results.map((row) => String(row.id));
  const placeholders = ids.map(() => "?").join(", ");
  const lineItems = await c.env.DB
    .prepare(
      `SELECT *
       FROM payroll_result_line_items
       WHERE payroll_run_employee_id IN (${placeholders})
       ORDER BY payroll_run_employee_id, line_type, category, description`
    )
    .bind(...ids)
    .all<Record<string, unknown>>();
  return rows.results.map((row) => ({
    ...row,
    line_items: lineItems.results.filter((line) => String(line.payroll_run_employee_id) === String(row.id))
  }));
}

export async function getPendingPayrollForSettlement(c: Context<AppBindings>, employeeId: string) {
  const rows = await c.env.DB
    .prepare(
      `SELECT pre.*, pr.status AS run_status, pr.run_no, pp.period_month, pp.period_year
       FROM payroll_employee_results pre
       INNER JOIN payroll_runs pr ON pr.id = pre.payroll_run_id
       INNER JOIN payroll_periods pp ON pp.id = pr.payroll_period_id
       WHERE pre.employee_id = ? AND pre.status NOT IN ('FINALIZED', 'FINALIZED_PLACEHOLDER', 'CANCELLED', 'EXCLUDED')
       ORDER BY pp.period_year DESC, pp.period_month DESC`
    )
    .bind(employeeId)
    .all<Record<string, unknown>>();
  return {
    rows: rows.results,
    net_amount: roundMoney(rows.results.reduce((sum, row) => sum + num(row.net_salary, 0), 0))
  };
}

export function calculateUnpaidSalaryForSettlement(settlementCase: Record<string, unknown>, profile: Record<string, unknown> | null, settings: Record<string, unknown>) {
  const start = optionalString(settlementCase.settlement_period_start_date) ?? firstOfMonth(optionalString(settlementCase.last_working_day));
  const end = optionalString(settlementCase.settlement_period_end_date) ?? optionalString(settlementCase.last_working_day);
  const days = daysBetween(start, end);
  const dailyRate = dailyRateFromProfile(profile, settings);
  return { days, daily_rate: roundMoney(dailyRate), amount: roundMoney(days * dailyRate), period_start: start, period_end: end };
}

export async function getAdvanceBalanceForSettlement(c: Context<AppBindings>, employeeId: string) {
  const rows = await c.env.DB
    .prepare("SELECT * FROM payroll_advance_payments WHERE employee_id = ? AND status IN ('REQUESTED', 'APPROVED', 'PAID') ORDER BY payment_date DESC")
    .bind(employeeId)
    .all<Record<string, unknown>>();
  return { rows: rows.results, amount: roundMoney(rows.results.reduce((sum, row) => sum + num(row.amount, 0), 0)) };
}

export async function getOneTimeDeductionsForSettlement(c: Context<AppBindings>, employeeId: string) {
  const rows = await c.env.DB
    .prepare("SELECT * FROM payroll_deductions WHERE employee_id = ? AND deduction_type = 'ONE_TIME' AND status = 'ACTIVE'")
    .bind(employeeId)
    .all<Record<string, unknown>>();
  return { rows: rows.results, amount: roundMoney(rows.results.reduce((sum, row) => sum + num(row.amount, 0), 0)) };
}

export async function getPayrollPaymentRegisterStatusForSettlement(c: Context<AppBindings>, employeeId: string) {
  const rows = await c.env.DB
    .prepare(
      `SELECT ppr.*, pp.period_month, pp.period_year
       FROM payroll_payment_register ppr
       LEFT JOIN payroll_periods pp ON pp.id = ppr.payroll_period_id
       WHERE ppr.employee_id = ? AND ppr.payment_status IN ('PENDING', 'PREPARED')
       ORDER BY ppr.created_at DESC`
    )
    .bind(employeeId)
    .all<Record<string, unknown>>();
  return rows.results;
}

export async function getSettlementPayrollImpact(c: Context<AppBindings>, settlementCase: Record<string, unknown>, profile: Record<string, unknown> | null, settings: Record<string, unknown>) {
  const employeeId = String(settlementCase.employee_id);
  const payrollSettings = await getPayrollSettingsForSettlement(c);
  const payrollSubmodules = {
    payslips_enabled: settlementPayrollSubmoduleEnabled(payrollSettings, "payslips_enabled"),
    payment_register_enabled: settlementPayrollSubmoduleEnabled(payrollSettings, "payment_register_enabled"),
    payment_methods_enabled: settlementPayrollSubmoduleEnabled(payrollSettings, "payment_methods_enabled"),
    bank_loan_deductions_enabled: settlementPayrollSubmoduleEnabled(payrollSettings, "bank_loan_deductions_enabled"),
    pension_enabled: settlementPayrollSubmoduleEnabled(payrollSettings, "pension_enabled"),
    employee_advances_enabled: settlementPayrollSubmoduleEnabled(payrollSettings, "employee_advances_enabled"),
    custom_deductions_enabled: settlementPayrollSubmoduleEnabled(payrollSettings, "custom_deductions_enabled")
  };
  const [history, pending, advances, oneTimeDeductions, paymentWarnings, payslips, paymentMethods, bankLoans, bankLoanPayments, pensionProfile, pensionContributions, customDeductionImpact] = await Promise.all([
    getFinalSettlementPayrollHistory(c, employeeId),
    getPendingPayrollForSettlement(c, employeeId),
    payrollSubmodules.employee_advances_enabled ? getAdvanceBalanceForSettlement(c, employeeId) : Promise.resolve({ rows: [], amount: 0, skipped_due_to_submodule_disabled: true }),
    getOneTimeDeductionsForSettlement(c, employeeId),
    payrollSubmodules.payment_register_enabled ? getPayrollPaymentRegisterStatusForSettlement(c, employeeId) : Promise.resolve([]),
    payrollSubmodules.payslips_enabled ? c.env.DB.prepare("SELECT id, payslip_number, status, generated_at, version_number FROM payroll_payslips WHERE employee_id = ? ORDER BY generated_at DESC LIMIT 12").bind(employeeId).all<Record<string, unknown>>() : Promise.resolve({ results: [] }),
    payrollSubmodules.payment_methods_enabled ? getEmployeePaymentMethods(c.env.DB, employeeId, false) : Promise.resolve([]),
    payrollSubmodules.bank_loan_deductions_enabled ? c.env.DB.prepare("SELECT ebl.*, pi.name AS payment_institution_name FROM employee_bank_loans ebl LEFT JOIN payment_institutions pi ON pi.id = ebl.payment_institution_id WHERE ebl.employee_id = ? AND ebl.status IN ('ACTIVE', 'PAUSED') ORDER BY COALESCE(ebl.priority_number, 999), ebl.created_at").bind(employeeId).all<Record<string, unknown>>() : Promise.resolve({ results: [] }),
    payrollSubmodules.bank_loan_deductions_enabled ? c.env.DB.prepare("SELECT * FROM employee_bank_loan_payments WHERE employee_id = ? AND payment_status IN ('PENDING', 'DEDUCTED_IN_PAYROLL', 'PARTIAL', 'PREPARED_FOR_BANK') ORDER BY created_at DESC LIMIT 50").bind(employeeId).all<Record<string, unknown>>() : Promise.resolve({ results: [] }),
    payrollSubmodules.pension_enabled ? c.env.DB.prepare("SELECT epp.*, ps.scheme_name, ps.scheme_code FROM employee_pension_profiles epp LEFT JOIN pension_schemes ps ON ps.id = epp.pension_scheme_id WHERE epp.employee_id = ? AND epp.status != 'ARCHIVED' ORDER BY epp.effective_date DESC LIMIT 1").bind(employeeId).first<Record<string, unknown>>() : Promise.resolve(null),
    payrollSubmodules.pension_enabled ? c.env.DB.prepare("SELECT ppc.*, ps.scheme_name FROM payroll_pension_contributions ppc LEFT JOIN pension_schemes ps ON ps.id = ppc.pension_scheme_id WHERE ppc.employee_id = ? AND ppc.contribution_status IN ('CALCULATED', 'INCLUDED_IN_PAYROLL', 'PREPARED_FOR_REMITTANCE') ORDER BY ppc.created_at DESC LIMIT 50").bind(employeeId).all<Record<string, unknown>>() : Promise.resolve({ results: [] }),
    payrollSubmodules.custom_deductions_enabled ? getFinalSettlementCustomDeductionImpact(c.env.DB, employeeId) : Promise.resolve({ deductions: [], applications: [], outstanding_balance: 0, warnings: [] })
  ]);
  const paymentMethodSummary = payrollSubmodules.payment_methods_enabled
    ? await getFinalSettlementPaymentMethodSummary(c, settlementCase, settings)
    : { method: null, warnings: [], source: "payment_methods_disabled" };
  const bankLoanSummary = getFinalSettlementBankLoanSummary(bankLoans.results, bankLoanPayments.results);
  const pensionSummary = getFinalSettlementPensionSummary(pensionProfile, pensionContributions.results);
  const customDeductionSummary = getFinalSettlementCustomDeductionSummary(customDeductionImpact);
  const bankLoanWarnings = bankLoans.results.length ? [`${bankLoans.results.length} active/paused bank loan record(s) should be reviewed before final settlement.`] : [];
  const pensionWarnings = pensionContributions.results.some((row) => readString(row.contribution_status) !== "MANUALLY_CONFIRMED_REMITTED") ? ["Pension contribution/remittance status should be reviewed before final settlement."] : [];
  return {
    history,
    payroll_submodules: payrollSubmodules,
    payslips: payslips.results,
    pending_payroll: pending,
    unpaid_salary: calculateUnpaidSalaryForSettlement(settlementCase, profile, settings),
    advance_balance: advances,
    one_time_deductions: oneTimeDeductions,
    payment_register_warnings: paymentWarnings,
    payment_methods: paymentMethods,
    bank_loans: bankLoans.results,
    bank_loan_payments: bankLoanPayments.results,
    bank_loan_summary: bankLoanSummary,
    pension_profile: pensionProfile,
    pension_contributions: pensionContributions.results,
    pension_summary: pensionSummary,
    custom_deduction_summary: customDeductionSummary,
    payment_method_summary: paymentMethodSummary,
    warnings: [
      ...(paymentWarnings.length ? [`${paymentWarnings.length} payroll payment register row(s) are pending/manual-prepared.`] : []),
      ...bankLoanWarnings,
      ...bankLoanSummary.warnings,
      ...pensionWarnings,
      ...customDeductionSummary.warnings,
      ...paymentMethodSummary.warnings
    ]
  };
}

export async function getFinalSettlementPaymentMethodSummary(c: Context<AppBindings>, settlementCase: Record<string, unknown>, settings: Record<string, unknown>) {
  const amount = Math.abs(num(settlementCase.net_settlement_amount, 0));
  const snapshot = await getActivePaymentMethodSnapshot(c.env.DB, String(settlementCase.employee_id), amount);
  return getSettlementPaymentMethodImpact(snapshot, settings);
}

export function getSettlementPaymentMethodImpact(snapshot: Record<string, unknown>, _settings: Record<string, unknown>) {
  return {
    primary: snapshot.primary ?? null,
    split: Array.isArray(snapshot.split) ? snapshot.split : [],
    warnings: snapshot.warning ? [String(snapshot.warning)] : [],
    snapshot_json: snapshot.snapshot_json ?? null
  };
}

export function getFinalSettlementBankLoanSummary(bankLoans: Record<string, unknown>[], bankLoanPayments: Record<string, unknown>[]) {
  const directStatuses = new Set(["SKIPPED_MINIMUM_NET_PROTECTION", "BANK_TO_COLLECT_DIRECTLY_FROM_EMPLOYEE", "BANK_NOTIFICATION_PENDING", "BANK_NOTIFIED"]);
  const payablePayments = bankLoanPayments.filter((row) => !directStatuses.has(readString(row.payment_status)) && !bool(row.skipped_due_to_minimum_net_salary, false) && !bool(row.bank_direct_collection_required, false));
  const dueFromPayments = payablePayments.reduce((sum, row) => sum + Math.max(0, num(row.deducted_amount, num(row.scheduled_installment_amount, 0))), 0);
  const dueFromLoans = bankLoanPayments.length ? 0 : bankLoans.reduce((sum, row) => sum + Math.min(Math.max(0, num(row.outstanding_balance, num(row.monthly_installment_amount, 0))), Math.max(0, num(row.monthly_installment_amount, 0))), 0);
  const directCollection = bankLoanPayments.filter((row) => directStatuses.has(readString(row.payment_status)) || bool(row.skipped_due_to_minimum_net_salary, false) || bool(row.bank_direct_collection_required, false));
  const shortfalls = bankLoanPayments.filter((row) => num(row.shortfall_amount, 0) > 0);
  return {
    deduction_amount: roundMoney(dueFromPayments + dueFromLoans),
    active_loans: bankLoans,
    payments: bankLoanPayments,
    direct_collection_payments: directCollection,
    shortfall_payments: shortfalls,
    warnings: [
      ...(shortfalls.length ? [`${shortfalls.length} bank loan payment(s) have shortfalls.`] : []),
      ...(directCollection.length ? [`${directCollection.length} bank loan payment(s) are marked for direct bank collection or notification.`] : [])
    ]
  };
}

export function getSettlementBankLoanImpact(bankLoans: Record<string, unknown>[], bankLoanPayments: Record<string, unknown>[]) {
  return getFinalSettlementBankLoanSummary(bankLoans, bankLoanPayments);
}

export function getFinalSettlementPensionSummary(pensionProfile: Record<string, unknown> | null, pensionContributions: Record<string, unknown>[]) {
  const employeeContribution = pensionContributions.reduce((sum, row) => sum + Math.max(0, num(row.employee_contribution_amount, 0)), 0);
  const employerContribution = pensionContributions.reduce((sum, row) => sum + Math.max(0, num(row.employer_contribution_amount, 0)), 0);
  const pending = pensionContributions.filter((row) => !["MANUALLY_CONFIRMED_REMITTED", "REMITTED"].includes(readString(row.contribution_status)));
  return {
    profile: pensionProfile,
    contributions: pensionContributions,
    employee_contribution_amount: roundMoney(employeeContribution),
    employer_contribution_amount: roundMoney(employerContribution),
    warnings: pending.length ? [`${pending.length} pension contribution row(s) are not confirmed remitted.`] : []
  };
}

export function getSettlementPensionImpact(pensionProfile: Record<string, unknown> | null, pensionContributions: Record<string, unknown>[]) {
  return getFinalSettlementPensionSummary(pensionProfile, pensionContributions);
}

export function getFinalSettlementCustomDeductionSummary(impact: Record<string, unknown>) {
  const warnings = Array.isArray(impact.warnings) ? impact.warnings.map((item) => String(item)) : [];
  return {
    ...impact,
    source_table: "employee_custom_deductions",
    outstanding_balance: roundMoney(num(impact.outstanding_balance, 0)),
    warnings
  };
}

export function getSettlementCustomDeductionImpact(impact: Record<string, unknown>) {
  return getFinalSettlementCustomDeductionSummary(impact);
}

export async function getFinalSettlementAttendanceImpact(c: Context<AppBindings>, settlementCase: Record<string, unknown>, profile: Record<string, unknown> | null, settings: Record<string, unknown>) {
  const employeeId = String(settlementCase.employee_id);
  const start = optionalString(settlementCase.settlement_period_start_date) ?? firstOfMonth(optionalString(settlementCase.last_working_day));
  const end = optionalString(settlementCase.last_working_day);
  const rows = await c.env.DB
    .prepare(
      `SELECT * FROM attendance_daily_records
       WHERE employee_id = ? AND (? IS NULL OR attendance_date >= ?) AND (? IS NULL OR attendance_date <= ?)
       ORDER BY attendance_date ASC`
    )
    .bind(employeeId, start, start, end, end)
    .all<Record<string, unknown>>();
  const dailyRate = dailyRateFromProfile(profile, settings);
  const impactDays = rows.results.reduce((sum, row) => sum + num(row.payroll_impact_days, row.is_absent ? 1 : 0), 0);
  const pendingCorrections = rows.results.filter((row) => readString(row.correction_status) === "PENDING");
  return {
    rows: rows.results,
    payroll_impact_days: impactDays,
    payroll_impact_minutes: rows.results.reduce((sum, row) => sum + num(row.payroll_impact_minutes, 0), 0),
    attendance_deduction: roundMoney(impactDays * dailyRate),
    pending_corrections: pendingCorrections.length,
    warnings: pendingCorrections.length ? [`${pendingCorrections.length} attendance correction(s) are still pending.`] : []
  };
}

export async function getSettlementAttendanceImpact(c: Context<AppBindings>, settlementCase: Record<string, unknown>, profile: Record<string, unknown> | null, settings: Record<string, unknown>) {
  return getFinalSettlementAttendanceImpact(c, settlementCase, profile, settings);
}

export async function getFinalSettlementRosterExpectedWork(c: Context<AppBindings>, settlementCase: Record<string, unknown>) {
  const employeeId = String(settlementCase.employee_id);
  const start = optionalString(settlementCase.settlement_period_start_date) ?? firstOfMonth(optionalString(settlementCase.last_working_day));
  const end = optionalString(settlementCase.last_working_day);
  const rows = await c.env.DB
    .prepare(
      `SELECT * FROM roster_assignments
       WHERE employee_id = ? AND (? IS NULL OR roster_date >= ?) AND (? IS NULL OR roster_date <= ?)
       AND status IN ('SCHEDULED', 'PUBLISHED', 'CHANGED_AFTER_PUBLISH', 'DAY_OFF', 'PUBLIC_HOLIDAY', 'LEAVE', 'SICK_LEAVE', 'LONG_LEAVE')
       ORDER BY roster_date ASC`
    )
    .bind(employeeId, start, start, end, end)
    .all<Record<string, unknown>>();
  return {
    rows: rows.results,
    expected_work_minutes: rows.results.reduce((sum, row) => sum + num(row.expected_work_minutes, 0), 0),
    scheduled_days: rows.results.filter((row) => !["DAY_OFF", "PUBLIC_HOLIDAY", "LEAVE", "SICK_LEAVE", "LONG_LEAVE"].includes(readString(row.status))).length,
    warnings: rows.results.length ? [] : ["No roster assignments were found for the settlement period."]
  };
}

export async function getSettlementRosterImpact(c: Context<AppBindings>, settlementCase: Record<string, unknown>) {
  return getFinalSettlementRosterExpectedWork(c, settlementCase);
}

export async function getAssetClearanceForSettlement(c: Context<AppBindings>, employeeId: string, type: "ASSET" | "UNIFORM") {
  const rows = await c.env.DB
    .prepare(
      `SELECT eaa.*, ai.name AS asset_name, ai.code AS asset_code, ai.replacement_cost, ac.type AS category_type, ac.name AS category_name
       FROM employee_asset_assignments eaa
       INNER JOIN asset_items ai ON ai.id = eaa.asset_item_id
       INNER JOIN asset_categories ac ON ac.id = ai.category_id
       WHERE eaa.employee_id = ? AND eaa.status IN ('ISSUED', 'DAMAGED', 'LOST') AND ac.type = ?
       ORDER BY eaa.issued_date DESC`
    )
    .bind(employeeId, type)
    .all<Record<string, unknown>>();
  return {
    rows: rows.results,
    deduction_amount: roundMoney(rows.results.reduce((sum, row) => sum + Math.max(0, num(row.deduction_amount, num(row.replacement_cost, 0))), 0))
  };
}

export async function getUniformClearanceForSettlement(c: Context<AppBindings>, employeeId: string) {
  return getAssetClearanceForSettlement(c, employeeId, "UNIFORM");
}

export async function getSettlementAssetClearanceImpact(c: Context<AppBindings>, employeeId: string) {
  return getAssetClearanceForSettlement(c, employeeId, "ASSET");
}

export async function getSettlementUniformClearanceImpact(c: Context<AppBindings>, employeeId: string) {
  return getUniformClearanceForSettlement(c, employeeId);
}

export async function calculateAssetDeductionsForSettlement(c: Context<AppBindings>, employeeId: string) {
  return getSettlementAssetClearanceImpact(c, employeeId);
}

export async function calculateUniformDeductionsForSettlement(c: Context<AppBindings>, employeeId: string) {
  return getSettlementUniformClearanceImpact(c, employeeId);
}

export async function getFinalSettlementWorkRequirementSummary(c: Context<AppBindings>, settlementCase: Record<string, unknown>) {
  return getFinalSettlementRosterExpectedWork(c, settlementCase);
}

async function createDefaultClearanceItems(c: Context<AppBindings>, settlementCase: Record<string, unknown>) {
  const employeeId = String(settlementCase.employee_id);
  const [asset, uniform] = await Promise.all([
    getSettlementAssetClearanceImpact(c, employeeId),
    getSettlementUniformClearanceImpact(c, employeeId)
  ]);
  for (const row of [...asset.rows, ...uniform.rows]) {
    const clearanceType = row.category_type === "UNIFORM" ? "UNIFORM" : "ASSET";
    await c.env.DB
      .prepare(
        `INSERT OR IGNORE INTO final_settlement_clearance_items
         (id, settlement_case_id, employee_id, clearance_type, source_reference_type, source_reference_id, title, description, status, deduction_amount, metadata_json)
         VALUES (?, ?, ?, ?, 'employee_asset_assignment', ?, ?, ?, 'PENDING', ?, ?)`
      )
      .bind(
        crypto.randomUUID(),
        settlementCase.id,
        employeeId,
        clearanceType,
        row.id,
        `${row.asset_name ?? row.asset_code ?? "Asset"} return/clearance`,
        `${clearanceType.toLowerCase()} issued on ${row.issued_date ?? "-"}`,
        Math.max(0, num(row.deduction_amount, num(row.replacement_cost, 0))),
        JSON.stringify({ asset_item_id: row.asset_item_id, status: row.status })
      )
      .run();
  }
}

export async function createSettlementLineItem(
  c: Context<AppBindings>,
  input: {
    settlement_case_id: string;
    employee_id: string;
    line_type: FinalSettlementLineType;
    component_code: string;
    component_name: string;
    component_source: string;
    amount?: number;
    quantity?: number | null;
    rate?: number | null;
    source_reference_type?: string | null;
    source_reference_id?: string | null;
    notes?: string | null;
    metadata?: unknown;
  }
) {
  const id = crypto.randomUUID();
  await c.env.DB
    .prepare(
      `INSERT INTO final_settlement_line_items
       (id, settlement_case_id, employee_id, line_type, component_code, component_name, component_source, amount, quantity, rate, source_reference_type, source_reference_id, notes, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      input.settlement_case_id,
      input.employee_id,
      input.line_type,
      input.component_code,
      input.component_name,
      input.component_source,
      roundMoney(input.amount ?? 0),
      input.quantity ?? null,
      input.rate ?? null,
      input.source_reference_type ?? null,
      input.source_reference_id ?? null,
      input.notes ?? null,
      input.metadata === undefined ? null : JSON.stringify(input.metadata)
    )
    .run();
  return c.env.DB.prepare("SELECT * FROM final_settlement_line_items WHERE id = ?").bind(id).first<Record<string, unknown>>();
}

export async function summarizeFinalSettlement(c: Context<AppBindings>, caseId: string) {
  const rows = await c.env.DB.prepare("SELECT * FROM final_settlement_line_items WHERE settlement_case_id = ?").bind(caseId).all<Record<string, unknown>>();
  const totalEarnings = rows.results.filter((row) => row.line_type === "EARNING").reduce((sum, row) => sum + num(row.amount, 0), 0);
  const totalDeductions = rows.results.filter((row) => row.line_type === "DEDUCTION").reduce((sum, row) => sum + num(row.amount, 0), 0);
  const net = roundMoney(totalEarnings - totalDeductions);
  const paymentDirection = net > 0 ? "COMPANY_TO_EMPLOYEE" : net < 0 ? "EMPLOYEE_TO_COMPANY" : "ZERO_BALANCE";
  return {
    total_earnings: roundMoney(totalEarnings),
    total_deductions: roundMoney(totalDeductions),
    net_settlement_amount: net,
    payment_direction: paymentDirection,
    company_owes_employee_amount: Math.max(0, net),
    employee_owes_company_amount: Math.max(0, -net),
    warnings: rows.results.filter((row) => row.line_type === "WARNING")
  };
}

async function summarizeClearanceStatus(c: Context<AppBindings>, caseId: string) {
  const rows = await c.env.DB.prepare("SELECT status FROM final_settlement_clearance_items WHERE settlement_case_id = ?").bind(caseId).all<Record<string, unknown>>();
  if (!rows.results.length) return "NOT_REQUIRED";
  if (rows.results.some((row) => readString(row.status) === "BLOCKED")) return "BLOCKED";
  if (rows.results.some((row) => readString(row.status) === "PENDING")) return "PENDING";
  if (rows.results.some((row) => readString(row.status) === "DEDUCTION_APPLIED")) return "DEDUCTION_APPLIED";
  if (rows.results.every((row) => readString(row.status) === "WAIVED")) return "WAIVED";
  return "CLEARED";
}

export async function calculateFinalSettlementForEmployee(c: Context<AppBindings>, employeeId: string, input: Record<string, unknown>) {
  const settlementCase = await createFinalSettlementCase(c, { ...input, employee_id: employeeId });
  return calculateFinalSettlement(c, String(settlementCase.id));
}

export async function calculateFinalSettlement(c: Context<AppBindings>, caseId: string, reason?: string | null) {
  const settlementCase = await getScopedCase(c, caseId, "manage");
  if (!settlementCase) return null;
  const settings = await getFinalSettlementSettings(c.env.DB);
  const employee = await getSettlementEmployeeSnapshot(c, String(settlementCase.employee_id));
  if (!employee) return null;
  const profile = employee;
  const now = isoNow();

  await c.env.DB.prepare("UPDATE final_settlement_cases SET status = 'CALCULATING', updated_at = ? WHERE id = ?").bind(now, caseId).run();
  await c.env.DB
    .prepare("DELETE FROM final_settlement_line_items WHERE settlement_case_id = ? AND component_source NOT IN ('MANUAL_EARNING_ADJUSTMENT', 'MANUAL_DEDUCTION_ADJUSTMENT')")
    .bind(caseId)
    .run();

  const warnings: string[] = [];
  const [payroll, leave, attendance, roster, assets, uniforms] = await Promise.all([
    getSettlementPayrollImpact(c, settlementCase, profile, settings),
    getSettlementLeaveImpact(c, settlementCase, profile, settings),
    getSettlementAttendanceImpact(c, settlementCase, profile, settings),
    getSettlementRosterImpact(c, settlementCase),
    getSettlementAssetClearanceImpact(c, String(settlementCase.employee_id)),
    getSettlementUniformClearanceImpact(c, String(settlementCase.employee_id))
  ]);
  warnings.push(...payroll.warnings, ...leave.warnings, ...attendance.warnings, ...roster.warnings);

  if (bool(settings.include_unpaid_salary, true) && payroll.unpaid_salary.amount > 0) {
    await createSettlementLineItem(c, {
      settlement_case_id: caseId,
      employee_id: String(settlementCase.employee_id),
      line_type: "EARNING",
      component_code: "UNPAID_SALARY",
      component_name: "Unpaid salary",
      component_source: "UNPAID_SALARY",
      amount: payroll.unpaid_salary.amount,
      quantity: payroll.unpaid_salary.days,
      rate: payroll.unpaid_salary.daily_rate,
      notes: "Calculated through last working day.",
      metadata: payroll.unpaid_salary
    });
  }

  if (bool(settings.include_pending_payroll, true) && payroll.pending_payroll.net_amount !== 0) {
    await createSettlementLineItem(c, {
      settlement_case_id: caseId,
      employee_id: String(settlementCase.employee_id),
      line_type: payroll.pending_payroll.net_amount >= 0 ? "EARNING" : "DEDUCTION",
      component_code: "PENDING_PAYROLL",
      component_name: "Pending payroll",
      component_source: "PENDING_PAYROLL",
      amount: Math.abs(payroll.pending_payroll.net_amount),
      notes: "Pending payroll rows are read only; payroll records are not mutated.",
      metadata: payroll.pending_payroll
    });
  }

  if (bool(settings.include_unused_leave_payout, true) && leave.unused_leave_payout > 0) {
    await createSettlementLineItem(c, { settlement_case_id: caseId, employee_id: String(settlementCase.employee_id), line_type: "EARNING", component_code: "UNUSED_LEAVE_PAYOUT", component_name: "Unused leave payout", component_source: "UNUSED_LEAVE_PAYOUT", amount: leave.unused_leave_payout, metadata: leave.balance_summary });
  }
  if (bool(settings.include_negative_leave_balance_deduction, true) && leave.negative_leave_balance_deduction > 0) {
    await createSettlementLineItem(c, { settlement_case_id: caseId, employee_id: String(settlementCase.employee_id), line_type: "DEDUCTION", component_code: "NEGATIVE_LEAVE_BALANCE", component_name: "Negative leave balance deduction", component_source: "NEGATIVE_LEAVE_BALANCE_DEDUCTION", amount: leave.negative_leave_balance_deduction, metadata: leave.balance_summary });
  }
  if (bool(settings.include_unpaid_leave_deduction, true) && leave.unpaid_leave_deduction > 0) {
    await createSettlementLineItem(c, { settlement_case_id: caseId, employee_id: String(settlementCase.employee_id), line_type: "DEDUCTION", component_code: "UNPAID_LEAVE", component_name: "Unpaid leave deduction", component_source: "UNPAID_LEAVE_DEDUCTION", amount: leave.unpaid_leave_deduction, metadata: leave.payroll_impacts });
  }
  if (bool(settings.include_attendance_deduction, true) && attendance.attendance_deduction > 0) {
    await createSettlementLineItem(c, { settlement_case_id: caseId, employee_id: String(settlementCase.employee_id), line_type: "DEDUCTION", component_code: "ATTENDANCE_DEDUCTION", component_name: "Attendance deduction", component_source: "ATTENDANCE_DEDUCTION", amount: attendance.attendance_deduction, quantity: attendance.payroll_impact_days, metadata: attendance });
  }
  if (bool(settings.include_bank_loan_deductions, true) && payroll.bank_loan_summary.deduction_amount > 0) {
    await createSettlementLineItem(c, { settlement_case_id: caseId, employee_id: String(settlementCase.employee_id), line_type: "DEDUCTION", component_code: "BANK_LOAN_DEDUCTION", component_name: "Bank loan settlement deduction", component_source: "BANK_LOAN_DEDUCTION", amount: payroll.bank_loan_summary.deduction_amount, metadata: payroll.bank_loan_summary });
  }
  if (bool(settings.include_bank_loan_shortfall_warnings, true)) {
    for (const row of payroll.bank_loan_summary.shortfall_payments) {
      await createSettlementLineItem(c, { settlement_case_id: caseId, employee_id: String(settlementCase.employee_id), line_type: "WARNING", component_code: "BANK_LOAN_SHORTFALL_WARNING", component_name: "Bank loan shortfall warning", component_source: "BANK_LOAN_SHORTFALL_WARNING", amount: 0, notes: `Bank loan ${row.loan_reference_number_snapshot ?? row.loan_reference_number ?? "-"} has a shortfall of ${num(row.shortfall_amount, 0).toFixed(2)}.`, metadata: row });
    }
  }
  if (bool(settings.include_bank_loan_direct_collection_warnings, true)) {
    for (const row of payroll.bank_loan_summary.direct_collection_payments) {
      await createSettlementLineItem(c, { settlement_case_id: caseId, employee_id: String(settlementCase.employee_id), line_type: "WARNING", component_code: "BANK_LOAN_DIRECT_COLLECTION_WARNING", component_name: "Direct bank collection warning", component_source: "BANK_LOAN_DIRECT_COLLECTION_WARNING", amount: 0, notes: "Skipped/direct-collection bank loan installment is not included in company settlement remittance.", metadata: row });
    }
  }
  if (bool(settings.include_pension_contribution, true) && payroll.pension_summary.employee_contribution_amount > 0) {
    await createSettlementLineItem(c, { settlement_case_id: caseId, employee_id: String(settlementCase.employee_id), line_type: "DEDUCTION", component_code: "PENSION_EMPLOYEE_CONTRIBUTION", component_name: "Pension employee contribution", component_source: "PENSION_EMPLOYEE_CONTRIBUTION", amount: payroll.pension_summary.employee_contribution_amount, metadata: payroll.pension_summary });
  }
  if (bool(settings.include_pension_contribution, true) && payroll.pension_summary.employer_contribution_amount > 0) {
    await createSettlementLineItem(c, { settlement_case_id: caseId, employee_id: String(settlementCase.employee_id), line_type: "EMPLOYER_COST", component_code: "PENSION_EMPLOYER_CONTRIBUTION", component_name: "Pension employer contribution", component_source: "PENSION_EMPLOYER_CONTRIBUTION", amount: payroll.pension_summary.employer_contribution_amount, notes: "Employer cost only; not deducted from employee settlement.", metadata: { ...payroll.pension_summary, employer_cost_only: true } });
  }
  if (bool(settings.include_pension_remittance_warnings, true)) {
    for (const warning of payroll.pension_summary.warnings) {
      await createSettlementLineItem(c, { settlement_case_id: caseId, employee_id: String(settlementCase.employee_id), line_type: "WARNING", component_code: "PENSION_REMITTANCE_WARNING", component_name: "Pension remittance warning", component_source: "PENSION_REMITTANCE_WARNING", amount: 0, notes: warning, metadata: payroll.pension_summary });
    }
  }
  if (bool(settings.include_custom_deduction_remaining_balances, true) && payroll.custom_deduction_summary.outstanding_balance > 0) {
    await createSettlementLineItem(c, { settlement_case_id: caseId, employee_id: String(settlementCase.employee_id), line_type: "DEDUCTION", component_code: "CUSTOM_DEDUCTION_BALANCE", component_name: "Custom deduction remaining balance", component_source: "CUSTOM_DEDUCTION_BALANCE", amount: payroll.custom_deduction_summary.outstanding_balance, metadata: payroll.custom_deduction_summary });
  }
  if (bool(settings.include_custom_deduction_shortfall_warnings, true)) {
    for (const warning of payroll.custom_deduction_summary.warnings) {
      await createSettlementLineItem(c, { settlement_case_id: caseId, employee_id: String(settlementCase.employee_id), line_type: "WARNING", component_code: "CUSTOM_DEDUCTION_SHORTFALL_WARNING", component_name: "Custom deduction warning", component_source: "CUSTOM_DEDUCTION_SHORTFALL_WARNING", amount: 0, notes: warning, metadata: payroll.custom_deduction_summary });
    }
  }
  if (bool(settings.include_advance_balance_deduction, true) && payroll.advance_balance.amount > 0) {
    await createSettlementLineItem(c, { settlement_case_id: caseId, employee_id: String(settlementCase.employee_id), line_type: "DEDUCTION", component_code: "ADVANCE_BALANCE", component_name: "Advance balance deduction", component_source: "ADVANCE_BALANCE_DEDUCTION", amount: payroll.advance_balance.amount, metadata: payroll.advance_balance.rows });
  }
  if (bool(settings.include_one_time_deductions, true) && payroll.one_time_deductions.amount > 0) {
    await createSettlementLineItem(c, { settlement_case_id: caseId, employee_id: String(settlementCase.employee_id), line_type: "DEDUCTION", component_code: "ONE_TIME_DEDUCTION", component_name: "One-time deductions", component_source: "ONE_TIME_DEDUCTION", amount: payroll.one_time_deductions.amount, metadata: payroll.one_time_deductions.rows });
  }
  if (bool(settings.include_asset_deductions, true) && assets.deduction_amount > 0) {
    await createSettlementLineItem(c, { settlement_case_id: caseId, employee_id: String(settlementCase.employee_id), line_type: "DEDUCTION", component_code: "ASSET_DEDUCTION", component_name: "Asset clearance deduction", component_source: "ASSET_DEDUCTION", amount: assets.deduction_amount, metadata: assets.rows });
  }
  if (bool(settings.include_uniform_deductions, true) && uniforms.deduction_amount > 0) {
    await createSettlementLineItem(c, { settlement_case_id: caseId, employee_id: String(settlementCase.employee_id), line_type: "DEDUCTION", component_code: "UNIFORM_DEDUCTION", component_name: "Uniform clearance deduction", component_source: "UNIFORM_DEDUCTION", amount: uniforms.deduction_amount, metadata: uniforms.rows });
  }
  if (bool(settings.include_gratuity_placeholder, false)) {
    await createSettlementLineItem(c, { settlement_case_id: caseId, employee_id: String(settlementCase.employee_id), line_type: "INFO", component_code: "GRATUITY_PLACEHOLDER", component_name: "Gratuity placeholder", component_source: "GRATUITY_PLACEHOLDER", amount: 0, notes: "Configure and enter any lawful end-of-service amount manually." });
  }
  if (bool(settings.include_contract_end_placeholder, false)) {
    await createSettlementLineItem(c, { settlement_case_id: caseId, employee_id: String(settlementCase.employee_id), line_type: "INFO", component_code: "CONTRACT_END_PLACEHOLDER", component_name: "Contract-end placeholder", component_source: "CONTRACT_END_PLACEHOLDER", amount: 0, notes: "Contract-end amounts are placeholders in this phase." });
  }
  for (const warning of warnings) {
    await createSettlementLineItem(c, { settlement_case_id: caseId, employee_id: String(settlementCase.employee_id), line_type: "WARNING", component_code: "SETTLEMENT_WARNING", component_name: warning, component_source: "CLEARANCE_WARNING", amount: 0, notes: warning });
  }

  await createDefaultClearanceItems(c, settlementCase);
  const summary = await summarizeFinalSettlement(c, caseId);
  const clearanceStatus = await summarizeClearanceStatus(c, caseId);
  const breakdown = { payroll, leave, attendance, roster, assets, uniforms };
  await c.env.DB
    .prepare(
      `UPDATE final_settlement_cases
       SET status = 'READY_FOR_REVIEW', total_earnings = ?, total_deductions = ?, net_settlement_amount = ?,
        payment_direction = ?, company_owes_employee_amount = ?, employee_owes_company_amount = ?, clearance_status = ?, approval_status = 'NOT_SUBMITTED', calculation_warnings_json = ?,
        calculation_breakdown_json = ?, calculated_by_user_id = ?, calculated_at = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(
      summary.total_earnings,
      summary.total_deductions,
      summary.net_settlement_amount,
      summary.payment_direction,
      summary.company_owes_employee_amount,
      summary.employee_owes_company_amount,
      clearanceStatus,
      JSON.stringify(warnings),
      JSON.stringify(breakdown),
      c.get("currentUser").id,
      now,
      now,
      caseId
    )
    .run();

  const updated = await getScopedCase(c, caseId, "view");
  if (updated) {
    await createSettlementEvent(c, updated, reason ? "RECALCULATED" : "CALCULATED", readString(settlementCase.status), "READY_FOR_REVIEW", reason ?? null, null, summary);
    await auditFinalSettlement(c, { action: reason ? "final_settlement.recalculated" : "final_settlement.calculated", entityType: "final_settlement_case", entityId: caseId, employeeId: String(updated.employee_id), oldValue: settlementCase, newValue: updated, reason });
    await publishFinalSettlement(c, "final_settlement.calculated", caseId, String(updated.employee_id));
  }
  return updated;
}

export async function createFinalSettlementCase(c: Context<AppBindings>, input: Record<string, unknown>) {
  const employeeId = readString(input.employee_id);
  if (!employeeId) throw new Error("EMPLOYEE_NOT_FOUND");
  if (!(await canManageFinalSettlementForEmployee(c, employeeId))) throw new Error("EMPLOYEE_NOT_FOUND");
  const employee = await getSettlementEmployeeSnapshot(c, employeeId);
  if (!employee) throw new Error("EMPLOYEE_NOT_FOUND");

  const exitType = readString(input.exit_type ?? employee.status_key ?? "OTHER").toUpperCase();
  if (!EXIT_TYPES.has(exitType)) throw new Error("INVALID_EXIT_TYPE");
  const exitDate = readString(input.exit_date ?? employee.exit_date);
  const lastWorkingDay = readString(input.last_working_day ?? employee.exit_date ?? input.exit_date);
  if (!isDate(exitDate)) throw new Error("INVALID_EXIT_DATE");
  if (!isDate(lastWorkingDay) || lastWorkingDay > exitDate) throw new Error("INVALID_LAST_WORKING_DAY");
  if (hasValidationErrors(validateDateRange({ start: lastWorkingDay, end: exitDate, startField: "last_working_day", endField: "exit_date", label: "Exit date" }))) throw new Error("INVALID_LAST_WORKING_DAY");

  const duplicate = await c.env.DB
    .prepare("SELECT id FROM final_settlement_cases WHERE employee_id = ? AND status NOT IN ('CANCELLED', 'FINALIZED', 'LOCKED') LIMIT 1")
    .bind(employeeId)
    .first<{ id: string }>();
  if (duplicate) throw new Error("DUPLICATE_SETTLEMENT_CASE");

  const id = crypto.randomUUID();
  const settlementNumber = `FS-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${id.slice(0, 8).toUpperCase()}`;
  const now = isoNow();
  await c.env.DB
    .prepare(
      `INSERT INTO final_settlement_cases
       (id, settlement_number, employee_id, employee_number_snapshot, employee_name_snapshot, department_id, department_snapshot,
        worksite_id, worksite_snapshot, location_snapshot, position_id, position_snapshot, employment_type_snapshot, exit_type, exit_status, exit_date,
        last_working_day, settlement_period_start_date, settlement_period_end_date, reason, status, created_by_user_id, notes, metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      settlementNumber,
      employeeId,
      employee.employee_no,
      employee.full_name,
      employee.primary_department_id ?? null,
      employee.department_name ?? null,
      employee.primary_location_id ?? null,
      employee.location_name ?? null,
      employee.location_name ?? null,
      employee.primary_position_id ?? null,
      employee.position_title ?? null,
      employee.employment_type ?? null,
      exitType,
      employee.status_key ?? null,
      exitDate,
      lastWorkingDay,
      optionalString(input.settlement_period_start_date),
      optionalString(input.settlement_period_end_date),
      optionalString(input.reason),
      c.get("currentUser").id,
      optionalString(input.notes),
      JSON.stringify({ employee_snapshot: employee }),
      now,
      now
    )
    .run();
  const row = await c.env.DB.prepare("SELECT * FROM final_settlement_cases WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (row) {
    await createDefaultClearanceItems(c, row);
    await createSettlementEvent(c, row, "CREATED", null, "DRAFT", optionalString(input.reason), null, { employee_id: employeeId });
    await auditFinalSettlement(c, { action: "final_settlement.case.created", entityType: "final_settlement_case", entityId: id, employeeId, newValue: row, reason: optionalString(input.reason) });
    await publishFinalSettlement(c, "final_settlement.case.created", id, employeeId);
  }
  return row!;
}

function caseError(c: Context<AppBindings>, error: unknown) {
  const code = error instanceof Error ? error.message : "SETTLEMENT_ERROR";
  if (code === "EMPLOYEE_NOT_FOUND") return fail(c, 404, "EMPLOYEE_NOT_FOUND", "Employee not found or outside your access scope.");
  if (code === "DUPLICATE_SETTLEMENT_CASE") return fail(c, 409, "DUPLICATE_SETTLEMENT_CASE", "An active settlement case already exists for this employee.");
  if (code === "INVALID_EXIT_DATE") return fail(c, 400, "INVALID_EXIT_DATE", "Please select a valid exit date.");
  if (code === "INVALID_LAST_WORKING_DAY") return fail(c, 400, "INVALID_LAST_WORKING_DAY", "Please select a valid last working day.");
  if (code === "INVALID_EXIT_TYPE") return fail(c, 400, "INVALID_EXIT_TYPE", "Please select a valid exit type.");
  return fail(c, 400, "SETTLEMENT_ERROR", "Final settlement action could not be completed.");
}

async function updateCaseStatus(c: Context<AppBindings>, settlementCase: Record<string, unknown>, status: SettlementStatus, action: string, reason?: string | null, note?: string | null) {
  const now = isoNow();
  const previousStatus = readString(settlementCase.status);
  const updates: Record<string, unknown> = { status, updated_at: now };
  if (status === "SUBMITTED_FOR_APPROVAL") {
    updates.submitted_by_user_id = c.get("currentUser").id;
    updates.submitted_at = now;
    updates.approval_status = "SUBMITTED_FOR_APPROVAL";
  } else if (status === "APPROVED") {
    updates.approved_by_user_id = c.get("currentUser").id;
    updates.approved_at = now;
    updates.approval_status = "APPROVED";
  } else if (status === "REJECTED") {
    updates.rejected_by_user_id = c.get("currentUser").id;
    updates.rejected_at = now;
    updates.rejection_reason = reason ?? null;
    updates.approval_status = "REJECTED";
  } else if (status === "FINALIZED") {
    updates.finalized_by_user_id = c.get("currentUser").id;
    updates.finalized_at = now;
    updates.locked_by_user_id = c.get("currentUser").id;
    updates.locked_at = now;
    updates.payment_status = "PENDING";
  } else if (status === "CANCELLED") {
    updates.cancelled_by_user_id = c.get("currentUser").id;
    updates.cancelled_at = now;
    updates.cancellation_reason = reason ?? null;
    updates.payment_status = "CANCELLED";
  } else if (status === "SENT_BACK") {
    updates.approval_status = "SENT_BACK";
  }
  const keys = Object.keys(updates);
  await c.env.DB.prepare(`UPDATE final_settlement_cases SET ${keys.map((key) => `${key} = ?`).join(", ")} WHERE id = ?`).bind(...keys.map((key) => updates[key] as BindValue), settlementCase.id as string).run();
  const updated = await getScopedCase(c, String(settlementCase.id), "view");
  if (updated) {
    await createSettlementEvent(c, updated, action, previousStatus, status, reason, note);
    await auditFinalSettlement(c, { action: `final_settlement.${action.toLowerCase()}`, entityType: "final_settlement_case", entityId: String(updated.id), employeeId: String(updated.employee_id), oldValue: settlementCase, newValue: updated, reason });
    await publishFinalSettlement(c, `final_settlement.${action.toLowerCase()}`, String(updated.id), String(updated.employee_id));
  }
  return updated;
}

export async function submitFinalSettlementForApproval(c: Context<AppBindings>, caseId: string) {
  const settlementCase = await getScopedCase(c, caseId, "manage");
  if (!settlementCase) return null;
  if (readString(settlementCase.status) !== "READY_FOR_REVIEW") throw new Error("SETTLEMENT_NOT_CALCULATED");
  return updateCaseStatus(c, settlementCase, "SUBMITTED_FOR_APPROVAL", "SUBMITTED_FOR_APPROVAL");
}

export async function approveFinalSettlement(c: Context<AppBindings>, caseId: string, note?: string | null) {
  const settlementCase = await getScopedCase(c, caseId, "manage");
  if (!settlementCase) return null;
  if (readString(settlementCase.status) !== "SUBMITTED_FOR_APPROVAL") throw new Error("SETTLEMENT_NOT_APPROVABLE");
  return updateCaseStatus(c, settlementCase, "APPROVED", "APPROVED", null, note);
}

export async function rejectFinalSettlement(c: Context<AppBindings>, caseId: string, reason: string) {
  const settlementCase = await getScopedCase(c, caseId, "manage");
  if (!settlementCase) return null;
  if (!reason.trim()) throw new Error("REASON_REQUIRED");
  return updateCaseStatus(c, settlementCase, "REJECTED", "REJECTED", reason);
}

export async function finalizeFinalSettlement(c: Context<AppBindings>, caseId: string, reason?: string | null) {
  const settlementCase = await getScopedCase(c, caseId, "manage");
  if (!settlementCase) return null;
  const settings = await getFinalSettlementSettings(c.env.DB);
  const status = readString(settlementCase.status);
  const hasOverride = hasAny(c, ["final_settlement.override_finalized", "final_settlement.finalization.manage"]);
  if (bool(settings.require_settlement_approval_before_finalization ?? settings.require_approval_before_finalization, true) && status !== "APPROVED" && !hasOverride) throw new Error("SETTLEMENT_NOT_FINALIZABLE");
  if (bool(settings.require_clearance_before_finalization, true)) {
    const blockers = await c.env.DB.prepare("SELECT COUNT(*) AS count FROM final_settlement_clearance_items WHERE settlement_case_id = ? AND status IN ('PENDING', 'BLOCKED')").bind(caseId).first<{ count: number }>();
    if ((blockers?.count ?? 0) > 0 && !hasOverride) throw new Error("SETTLEMENT_CLEARANCE_REQUIRED");
  }
  await c.env.DB
    .prepare("INSERT INTO final_settlement_history_snapshots (id, settlement_case_id, employee_id, snapshot_type, snapshot_json, created_by_user_id) VALUES (?, ?, ?, 'FINALIZATION', ?, ?)")
    .bind(crypto.randomUUID(), caseId, settlementCase.employee_id, JSON.stringify(settlementCase), c.get("currentUser").id)
    .run();
  return updateCaseStatus(c, settlementCase, "FINALIZED", "FINALIZED", reason);
}

export async function prepareFinalSettlementPaymentRegister(c: Context<AppBindings>, caseId: string) {
  const settlementCase = await getScopedCase(c, caseId, "manage");
  if (!settlementCase) return null;
  const settings = await getFinalSettlementSettings(c.env.DB);
  if (!bool(settings.settlement_payment_register_enabled, true)) throw new Error("PAYMENT_REGISTER_DISABLED");
  if (!["FINALIZED", "LOCKED"].includes(readString(settlementCase.status))) throw new Error("SETTLEMENT_NOT_FINALIZABLE");
  const employee = await getSettlementEmployeeSnapshot(c, String(settlementCase.employee_id));
  const net = num(settlementCase.net_settlement_amount, 0);
  const direction = net > 0 ? "COMPANY_TO_EMPLOYEE" : net < 0 ? "EMPLOYEE_TO_COMPANY" : "ZERO_BALANCE";
  const paymentSnapshot = await getActivePaymentMethodSnapshot(c.env.DB, String(settlementCase.employee_id), Math.abs(net));
  const primary = paymentSnapshot.primary as Record<string, unknown> | null;
  const paymentMethod = direction === "EMPLOYEE_TO_COMPANY" ? "MANUAL_FROM_EMPLOYEE" : readString(primary?.payment_method_type || employee?.payment_method || "CASH");
  const paymentMetadata = {
    payment_methods_source: primary ? "employee_payment_methods" : "employee_payroll_profiles_fallback",
    payment_method_warning: paymentSnapshot.warning || null,
    split_payment: paymentSnapshot.split,
    payment_direction: direction,
    direct_bank_integration: false,
    official_bank_export_generated: false
  };
  const now = isoNow();
  await c.env.DB
    .prepare(
      `INSERT INTO final_settlement_payment_register
       (id, settlement_case_id, employee_id, employee_number_snapshot, employee_name_snapshot, payment_method_snapshot_json, payment_method_type_snapshot, payment_institution_snapshot, payment_method_snapshot,
        bank_name_snapshot, bank_account_name_snapshot, bank_account_number_masked, net_settlement_amount, payment_direction,
        payment_status, prepared_by_user_id, prepared_at, created_at, updated_at, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PREPARED', ?, ?, ?, ?, ?)
       ON CONFLICT(settlement_case_id) DO UPDATE SET
        payment_status = 'PREPARED', prepared_by_user_id = excluded.prepared_by_user_id, prepared_at = excluded.prepared_at,
        net_settlement_amount = excluded.net_settlement_amount, payment_direction = excluded.payment_direction,
        payment_method_snapshot_json = excluded.payment_method_snapshot_json, payment_method_type_snapshot = excluded.payment_method_type_snapshot,
        payment_institution_snapshot = excluded.payment_institution_snapshot,
        payment_method_snapshot = excluded.payment_method_snapshot, bank_name_snapshot = excluded.bank_name_snapshot,
        bank_account_name_snapshot = excluded.bank_account_name_snapshot, bank_account_number_masked = excluded.bank_account_number_masked,
        metadata_json = excluded.metadata_json, updated_at = excluded.updated_at`
    )
    .bind(
      crypto.randomUUID(),
      caseId,
      settlementCase.employee_id,
      settlementCase.employee_number_snapshot,
      settlementCase.employee_name_snapshot,
      paymentSnapshot.snapshot_json ?? null,
      paymentMethod,
      primary?.payment_institution_name ?? primary?.bank_name_snapshot ?? employee?.bank_name ?? null,
      paymentMethod,
      primary?.payment_institution_name ?? primary?.bank_name_snapshot ?? employee?.bank_name ?? null,
      primary?.bank_account_name ?? employee?.bank_account_name ?? null,
      primary?.bank_account_number_masked ?? maskAccount(employee?.bank_account_no),
      net,
      direction,
      c.get("currentUser").id,
      now,
      now,
      now,
      JSON.stringify(paymentMetadata)
    )
    .run();
  await c.env.DB.prepare("UPDATE final_settlement_cases SET payment_status = 'PREPARED', updated_at = ? WHERE id = ?").bind(now, caseId).run();
  const payment = await c.env.DB.prepare("SELECT * FROM final_settlement_payment_register WHERE settlement_case_id = ?").bind(caseId).first<Record<string, unknown>>();
  await createSettlementEvent(c, settlementCase, "PAYMENT_REGISTER_PREPARED", readString(settlementCase.status), readString(settlementCase.status), null, null, payment);
  await auditFinalSettlement(c, { action: "final_settlement.payment_register.prepared", entityType: "final_settlement_payment_register", entityId: String(payment?.id ?? caseId), employeeId: String(settlementCase.employee_id), newValue: payment });
  return payment;
}

export async function confirmManualFinalSettlementPayment(c: Context<AppBindings>, paymentId: string, input: Record<string, unknown>) {
  const payment = await c.env.DB.prepare("SELECT * FROM final_settlement_payment_register WHERE id = ?").bind(paymentId).first<Record<string, unknown>>();
  if (!payment) return null;
  if (!(await canManageFinalSettlementForEmployee(c, String(payment.employee_id)))) return null;
  const reference = readString(input.confirmation_reference);
  const note = readString(input.confirmation_note);
  if (!reference || !note) throw new Error("PAYMENT_CONFIRMATION_REQUIRED");
  const status = payment.payment_direction === "EMPLOYEE_TO_COMPANY" ? "RECEIVED_FROM_EMPLOYEE_PLACEHOLDER" : "MANUALLY_CONFIRMED_PAID";
  const now = isoNow();
  await c.env.DB
    .prepare("UPDATE final_settlement_payment_register SET payment_status = ?, confirmed_by_user_id = ?, confirmed_at = ?, confirmation_reference = ?, confirmation_note = ?, updated_at = ? WHERE id = ?")
    .bind(status, c.get("currentUser").id, now, reference, note, now, paymentId)
    .run();
  await c.env.DB.prepare("UPDATE final_settlement_cases SET payment_status = ?, updated_at = ? WHERE id = ?").bind(status, now, payment.settlement_case_id).run();
  const updated = await c.env.DB.prepare("SELECT * FROM final_settlement_payment_register WHERE id = ?").bind(paymentId).first<Record<string, unknown>>();
  await auditFinalSettlement(c, { action: "final_settlement.payment_register.confirmed_manual", entityType: "final_settlement_payment_register", entityId: paymentId, employeeId: String(payment.employee_id), oldValue: payment, newValue: updated, reason: note });
  return updated;
}

async function routeActionError(c: Context<AppBindings>, error: unknown) {
  const code = error instanceof Error ? error.message : "FINAL_SETTLEMENT_ERROR";
  if (code === "SETTLEMENT_NOT_CALCULATED") return fail(c, 400, "SETTLEMENT_NOT_CALCULATED", "Settlement must be calculated before submission.");
  if (code === "SETTLEMENT_NOT_APPROVABLE") return fail(c, 400, "SETTLEMENT_NOT_APPROVABLE", "This settlement is not ready for approval.");
  if (code === "SETTLEMENT_NOT_FINALIZABLE") return fail(c, 400, "SETTLEMENT_NOT_FINALIZABLE", "This settlement must be approved before finalization.");
  if (code === "SETTLEMENT_CLEARANCE_REQUIRED") return fail(c, 400, "SETTLEMENT_CLEARANCE_REQUIRED", "Settlement clearance must be completed before finalization.");
  if (code === "REASON_REQUIRED") return fail(c, 400, "REASON_REQUIRED", "Reason is required.");
  if (code === "PAYMENT_CONFIRMATION_REQUIRED") return fail(c, 400, "PAYMENT_CONFIRMATION_REQUIRED", "Payment reference and note are required.");
  if (code === "PAYMENT_REGISTER_DISABLED") return fail(c, 409, "PAYMENT_REGISTER_DISABLED", "Final settlement payment register is disabled.");
  return fail(c, 400, "FINAL_SETTLEMENT_ERROR", "Final settlement action could not be completed.");
}

finalSettlementRoutes.get("/settings", requireAnyPermission(["final_settlement.settings.view", "final_settlement.settings.manage", "final_settlement.view"]), async (c) => ok(c, { settings: await getFinalSettlementSettings(c.env.DB) }));

finalSettlementRoutes.patch("/settings", requireAnyPermission(["final_settlement.settings.update", "final_settlement.settings.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const oldSettings = await getFinalSettlementSettings(c.env.DB);
  const assignments: string[] = [];
  const values: BindValue[] = [];
  for (const key of SETTING_BOOLEAN_COLUMNS) {
    if (key in body) {
      assignments.push(`${key} = ?`);
      values.push(bool(body[key]) ? 1 : 0);
    }
  }
  for (const key of SETTING_TEXT_COLUMNS) {
    if (key in body) {
      assignments.push(`${key} = ?`);
      values.push(readString(body[key]) || String(oldSettings[key] ?? ""));
    }
  }
  if (!assignments.length) return ok(c, { settings: oldSettings });
  assignments.push("updated_at = ?");
  values.push(isoNow());
  await c.env.DB.prepare(`UPDATE final_settlement_settings SET ${assignments.join(", ")} WHERE id = 'final_settlement_settings_default'`).bind(...values).run();
  const settings = await getFinalSettlementSettings(c.env.DB);
  await auditFinalSettlement(c, { action: "final_settlement.settings.updated", entityType: "final_settlement_settings", entityId: "final_settlement_settings_default", oldValue: oldSettings, newValue: settings });
  return ok(c, { settings });
});

finalSettlementRoutes.use("*", async (c, next) => {
  const disabled = await requireFinalSettlementModuleEnabled(c);
  if (disabled) return disabled;
  await next();
});

finalSettlementRoutes.get("/cases", requireAnyPermission(["final_settlement.view", "final_settlement.cases.view", "final_settlement.manage"]), async (c) => {
  const disabled = await requireFinalSettlementModuleEnabled(c);
  if (disabled) return disabled;
  const rows = await listCases(c);
  return ok(c, { cases: rows.map((row) => maskSettlementCase(row, canSeeSensitive(c))) });
});

finalSettlementRoutes.post("/cases", requireAnyPermission(["final_settlement.cases.create", "final_settlement.cases.manage", "final_settlement.manage"]), async (c) => {
  const disabled = await requireFinalSettlementModuleEnabled(c);
  if (disabled) return disabled;
  try {
    const settlementCase = await createFinalSettlementCase(c, await readJsonBody(c.req.raw));
    return ok(c, { case: maskSettlementCase(settlementCase, canSeeSensitive(c)) }, 201);
  } catch (error) {
    return caseError(c, error);
  }
});

finalSettlementRoutes.get("/reports/summary", requireAnyPermission(["final_settlement.reports.view", "final_settlement.view", "final_settlement.manage"]), async (c) => {
  const disabled = await requireFinalSettlementModuleEnabled(c);
  if (disabled) return disabled;
  const rows = await listCases(c);
  const canSensitive = canSeeSensitive(c);
  const summary = {
    total_cases: rows.length,
    pending_settlements: rows.filter((row) => ["DRAFT", "READY_FOR_REVIEW", "SUBMITTED_FOR_APPROVAL"].includes(readString(row.status))).length,
    ready_for_approval: rows.filter((row) => row.status === "READY_FOR_REVIEW").length,
    finalized_settlements: rows.filter((row) => ["FINALIZED", "LOCKED"].includes(readString(row.status))).length,
    total_earnings: canSensitive ? roundMoney(rows.reduce((sum, row) => sum + num(row.total_earnings, 0), 0)) : null,
    total_deductions: canSensitive ? roundMoney(rows.reduce((sum, row) => sum + num(row.total_deductions, 0), 0)) : null,
    net_settlement_amount: canSensitive ? roundMoney(rows.reduce((sum, row) => sum + num(row.net_settlement_amount, 0), 0)) : null
  };
  await auditFinalSettlement(c, { action: "final_settlement.report.summary.viewed", entityType: "final_settlement_report", entityId: "summary" });
  return ok(c, { summary });
});

for (const [path, groupBy, label] of [
  ["/reports/department-totals", "department_snapshot", "department"],
  ["/reports/worksite-totals", "location_snapshot", "worksite"]
] as const) {
  finalSettlementRoutes.get(path, requireAnyPermission(["final_settlement.reports.view", "final_settlement.view", "final_settlement.manage"]), async (c) => {
    const rows = await listCases(c);
    const canSensitive = canSeeSensitive(c);
    const grouped = new Map<string, { name: string; cases: number; earnings: number; deductions: number; net: number }>();
    for (const row of rows) {
      const key = readString(row[groupBy]) || "Unassigned";
      const entry = grouped.get(key) ?? { name: key, cases: 0, earnings: 0, deductions: 0, net: 0 };
      entry.cases += 1;
      entry.earnings += num(row.total_earnings, 0);
      entry.deductions += num(row.total_deductions, 0);
      entry.net += num(row.net_settlement_amount, 0);
      grouped.set(key, entry);
    }
    return ok(c, { [label]: Array.from(grouped.values()).map((row) => canSensitive ? row : { ...row, earnings: null, deductions: null, net: null }) });
  });
}

finalSettlementRoutes.get("/reports/asset-uniform-deductions", requireAnyPermission(["final_settlement.reports.view", "final_settlement.view", "final_settlement.manage"]), async (c) => {
  const rows = await c.env.DB.prepare("SELECT component_source, SUM(amount) AS amount, COUNT(*) AS count FROM final_settlement_line_items WHERE component_source IN ('ASSET_DEDUCTION', 'UNIFORM_DEDUCTION') GROUP BY component_source").all<Record<string, unknown>>();
  return ok(c, { deductions: canSeeSensitive(c) ? rows.results : rows.results.map((row) => ({ ...row, amount: null })) });
});

finalSettlementRoutes.get("/reports/leave-settlement", requireAnyPermission(["final_settlement.reports.view", "final_settlement.view", "final_settlement.manage"]), async (c) => {
  const rows = await c.env.DB.prepare("SELECT component_source, SUM(amount) AS amount, COUNT(*) AS count FROM final_settlement_line_items WHERE component_source IN ('UNUSED_LEAVE_PAYOUT', 'NEGATIVE_LEAVE_BALANCE_DEDUCTION', 'UNPAID_LEAVE_DEDUCTION') GROUP BY component_source").all<Record<string, unknown>>();
  return ok(c, { leave_settlement: canSeeSensitive(c) ? rows.results : rows.results.map((row) => ({ ...row, amount: null })) });
});

finalSettlementRoutes.get("/reports/advance-deductions", requireAnyPermission(["final_settlement.reports.view", "final_settlement.view", "final_settlement.manage"]), async (c) => {
  const rows = await c.env.DB.prepare("SELECT component_source, SUM(amount) AS amount, COUNT(*) AS count FROM final_settlement_line_items WHERE component_source = 'ADVANCE_BALANCE_DEDUCTION' GROUP BY component_source").all<Record<string, unknown>>();
  return ok(c, { advances: canSeeSensitive(c) ? rows.results : rows.results.map((row) => ({ ...row, amount: null })) });
});

async function settlementLineSourceReport(c: Context<AppBindings>, sources: string[], key: string) {
  const placeholders = sources.map(() => "?").join(", ");
  const rows = await c.env.DB.prepare(`SELECT component_source, line_type, SUM(amount) AS amount, COUNT(*) AS count FROM final_settlement_line_items WHERE component_source IN (${placeholders}) GROUP BY component_source, line_type ORDER BY component_source`).bind(...sources).all<Record<string, unknown>>();
  return ok(c, { [key]: canSeeSensitive(c) ? rows.results : rows.results.map((row) => ({ ...row, amount: null })) });
}

finalSettlementRoutes.get("/reports/bank-loan-settlement", requireAnyPermission(["final_settlement.reports.view", "final_settlement.view", "final_settlement.manage"]), (c) => {
  return settlementLineSourceReport(c, ["BANK_LOAN_DEDUCTION", "BANK_LOAN_SHORTFALL_WARNING", "BANK_LOAN_DIRECT_COLLECTION_WARNING"], "bank_loan_settlement");
});

finalSettlementRoutes.get("/reports/pension-settlement", requireAnyPermission(["final_settlement.reports.view", "final_settlement.view", "final_settlement.manage"]), (c) => {
  return settlementLineSourceReport(c, ["PENSION_EMPLOYEE_CONTRIBUTION", "PENSION_EMPLOYER_CONTRIBUTION", "PENSION_REMITTANCE_WARNING"], "pension_settlement");
});

finalSettlementRoutes.get("/reports/custom-deduction-settlement", requireAnyPermission(["final_settlement.reports.view", "final_settlement.view", "final_settlement.manage"]), (c) => {
  return settlementLineSourceReport(c, ["CUSTOM_DEDUCTION_BALANCE", "CUSTOM_DEDUCTION_SHORTFALL_WARNING"], "custom_deduction_settlement");
});

finalSettlementRoutes.get("/reports/net-settlement-summary", requireAnyPermission(["final_settlement.reports.view", "final_settlement.view", "final_settlement.manage"]), async (c) => {
  const rows = await listCases(c);
  const canSensitive = canSeeSensitive(c);
  const summary = {
    company_to_employee: rows.filter((row) => readString(row.payment_direction) === "COMPANY_TO_EMPLOYEE").length,
    employee_to_company: rows.filter((row) => readString(row.payment_direction) === "EMPLOYEE_TO_COMPANY").length,
    zero_balance: rows.filter((row) => readString(row.payment_direction) === "ZERO_BALANCE").length,
    net_total: canSensitive ? roundMoney(rows.reduce((sum, row) => sum + num(row.net_settlement_amount, 0), 0)) : null
  };
  return ok(c, { summary });
});

finalSettlementRoutes.get("/payment-register", requireAnyPermission(["final_settlement.payment_register.view", "final_settlement.payment_register.manage", "final_settlement.view"]), async (c) => {
  const rows = await c.env.DB
    .prepare(
      `SELECT fspr.*
       FROM final_settlement_payment_register fspr
       INNER JOIN final_settlement_cases fsc ON fsc.id = fspr.settlement_case_id
       ORDER BY fspr.created_at DESC`
    )
    .all<Record<string, unknown>>();
  const visible: Record<string, unknown>[] = [];
  for (const row of rows.results) {
    if (await canViewFinalSettlementForEmployee(c, String(row.employee_id))) visible.push(maskPayment(row, canSeeSensitive(c)));
  }
  return ok(c, { payments: visible });
});

finalSettlementRoutes.post("/payment-register/:paymentId/confirm-manual-paid", requireAnyPermission(["final_settlement.payment_register.confirm_manual_paid", "final_settlement.payment_register.manage"]), async (c) => {
  try {
    const payment = await confirmManualFinalSettlementPayment(c, routeParam(c, "paymentId"), await readJsonBody(c.req.raw));
    if (!payment) return fail(c, 404, "SETTLEMENT_CASE_NOT_FOUND", "Final settlement case not found.");
    return ok(c, { payment: maskPayment(payment, canSeeSensitive(c)) });
  } catch (error) {
    return routeActionError(c, error);
  }
});

finalSettlementRoutes.post("/payment-register/:paymentId/cancel", requireAnyPermission(["final_settlement.payment_register.cancel", "final_settlement.payment_register.manage"]), async (c) => {
  const paymentId = routeParam(c, "paymentId");
  const body = await readJsonBody(c.req.raw);
  const reason = readString(body.reason);
  if (!reason) return fail(c, 400, "REASON_REQUIRED", "Reason is required.");
  const payment = await c.env.DB.prepare("SELECT * FROM final_settlement_payment_register WHERE id = ?").bind(paymentId).first<Record<string, unknown>>();
  if (!payment || !(await canManageFinalSettlementForEmployee(c, String(payment.employee_id)))) return fail(c, 404, "SETTLEMENT_CASE_NOT_FOUND", "Final settlement case not found.");
  const now = isoNow();
  await c.env.DB.prepare("UPDATE final_settlement_payment_register SET payment_status = 'CANCELLED', cancelled_by_user_id = ?, cancelled_at = ?, cancellation_reason = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, now, reason, now, paymentId).run();
  await c.env.DB.prepare("UPDATE final_settlement_cases SET payment_status = 'CANCELLED', updated_at = ? WHERE id = ?").bind(now, payment.settlement_case_id).run();
  const updated = await c.env.DB.prepare("SELECT * FROM final_settlement_payment_register WHERE id = ?").bind(paymentId).first<Record<string, unknown>>();
  await auditFinalSettlement(c, { action: "final_settlement.payment_register.cancelled", entityType: "final_settlement_payment_register", entityId: paymentId, employeeId: String(payment.employee_id), oldValue: payment, newValue: updated, reason });
  return ok(c, { payment: maskPayment(updated!, canSeeSensitive(c)) });
});

finalSettlementRoutes.get("/cases/:caseId", requireAnyPermission(["final_settlement.view", "final_settlement.cases.view", "final_settlement.manage"]), async (c) => {
  const settlementCase = await getScopedCase(c, routeParam(c, "caseId"), "view");
  if (!settlementCase) return fail(c, 404, "SETTLEMENT_CASE_NOT_FOUND", "Final settlement case not found.");
  return ok(c, { case: maskSettlementCase(settlementCase, canSeeSensitive(c)) });
});

finalSettlementRoutes.patch("/cases/:caseId", requireAnyPermission(["final_settlement.cases.update", "final_settlement.cases.manage", "final_settlement.manage"]), async (c) => {
  const settlementCase = await getScopedCase(c, routeParam(c, "caseId"), "manage");
  if (!settlementCase) return fail(c, 404, "SETTLEMENT_CASE_NOT_FOUND", "Final settlement case not found.");
  if (LOCKED_CASE_STATUSES.has(readString(settlementCase.status)) && !has(c, "final_settlement.override_finalized")) return fail(c, 409, "SETTLEMENT_FINALIZED", "This settlement is finalized and locked.");
  const body = await readJsonBody(c.req.raw);
  const lockedIssues = validateLockedState({ status: readString(settlementCase.status), field: "status", message: "This settlement is locked/finalized. Use the authorized unlock or adjustment flow." });
  if (hasValidationErrors(lockedIssues) && !has(c, "final_settlement.override_finalized")) return validationResponse(c, lockedIssues, 423);
  const periodStart = readString(body.settlement_period_start_date ?? settlementCase.settlement_period_start_date);
  const periodEnd = readString(body.settlement_period_end_date ?? settlementCase.settlement_period_end_date);
  const dateIssues = validateDateRange({ start: periodStart || null, end: periodEnd || null, startField: "settlement_period_start_date", endField: "settlement_period_end_date", label: "Settlement period end date" });
  if (hasValidationErrors(dateIssues)) return validationResponse(c, dateIssues);
  const fields = ["exit_date", "last_working_day", "settlement_period_start_date", "settlement_period_end_date", "reason", "notes"] as const;
  const assignments: string[] = [];
  const values: BindValue[] = [];
  for (const field of fields) {
    if (field in body) {
      assignments.push(`${field} = ?`);
      values.push(optionalString(body[field]));
    }
  }
  if ("exit_type" in body) {
    const exitType = readString(body.exit_type).toUpperCase();
    if (!EXIT_TYPES.has(exitType)) return fail(c, 400, "INVALID_EXIT_TYPE", "Please select a valid exit type.");
    assignments.push("exit_type = ?");
    values.push(exitType);
  }
  if (!assignments.length) return ok(c, { case: maskSettlementCase(settlementCase, canSeeSensitive(c)) });
  assignments.push("updated_at = ?");
  values.push(isoNow(), String(settlementCase.id));
  await c.env.DB.prepare(`UPDATE final_settlement_cases SET ${assignments.join(", ")} WHERE id = ?`).bind(...values).run();
  const updated = await getScopedCase(c, String(settlementCase.id), "view");
  await auditFinalSettlement(c, { action: "final_settlement.case.updated", entityType: "final_settlement_case", entityId: String(settlementCase.id), employeeId: String(settlementCase.employee_id), oldValue: settlementCase, newValue: updated });
  return ok(c, { case: maskSettlementCase(updated!, canSeeSensitive(c)) });
});

finalSettlementRoutes.post("/cases/:caseId/cancel", requireAnyPermission(["final_settlement.cases.cancel", "final_settlement.cases.manage", "final_settlement.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const reason = readString(body.reason);
  if (!reason) return fail(c, 400, "REASON_REQUIRED", "Reason is required.");
  const settlementCase = await getScopedCase(c, routeParam(c, "caseId"), "manage");
  if (!settlementCase) return fail(c, 404, "SETTLEMENT_CASE_NOT_FOUND", "Final settlement case not found.");
  const updated = await updateCaseStatus(c, settlementCase, "CANCELLED", "CANCELLED", reason);
  return ok(c, { case: maskSettlementCase(updated!, canSeeSensitive(c)) });
});

for (const route of ["/cases/:caseId/calculate", "/cases/:caseId/recalculate"]) {
  finalSettlementRoutes.post(route, requireAnyPermission(["final_settlement.calculate", "final_settlement.recalculate", "final_settlement.manage"]), async (c) => {
    const disabled = await requireFinalSettlementModuleEnabled(c);
    if (disabled) return disabled;
    const caseId = routeParam(c, "caseId");
    const body = await readJsonBody(c.req.raw);
    const settlementCase = await getScopedCase(c, caseId, "manage");
    if (!settlementCase) return fail(c, 404, "SETTLEMENT_CASE_NOT_FOUND", "Final settlement case not found.");
    if (LOCKED_CASE_STATUSES.has(readString(settlementCase.status)) && !has(c, "final_settlement.override_finalized")) return fail(c, 409, "SETTLEMENT_FINALIZED", "This settlement is finalized and locked.");
    if (route.includes("recalculate")) {
      const settings = await getFinalSettlementSettings(c.env.DB);
      const reason = readString(body.reason);
      if (bool(settings.require_reason_for_recalculation, true) && !reason) return fail(c, 400, "REASON_REQUIRED", "Recalculation reason is required.");
    }
    try {
      const calculated = await calculateFinalSettlement(c, caseId, route.includes("recalculate") ? readString(body.reason) : null);
      return ok(c, { case: maskSettlementCase(calculated!, canSeeSensitive(c)) });
    } catch (error) {
      return routeActionError(c, error);
    }
  });
}

finalSettlementRoutes.get("/cases/:caseId/line-items", requireAnyPermission(["final_settlement.line_items.view", "final_settlement.view", "final_settlement.manage"]), async (c) => {
  const settlementCase = await getScopedCase(c, routeParam(c, "caseId"), "view");
  if (!settlementCase) return fail(c, 404, "SETTLEMENT_CASE_NOT_FOUND", "Final settlement case not found.");
  const rows = await c.env.DB.prepare("SELECT * FROM final_settlement_line_items WHERE settlement_case_id = ? ORDER BY created_at ASC").bind(settlementCase.id).all<Record<string, unknown>>();
  return ok(c, { line_items: canSeeSensitive(c) ? rows.results : rows.results.map((row) => ({ ...row, amount: row.line_type === "WARNING" || row.line_type === "INFO" ? row.amount : null, sensitive_restricted: true })) });
});

finalSettlementRoutes.post("/cases/:caseId/manual-adjustments", requireAnyPermission(["final_settlement.manual_adjustments.create", "final_settlement.line_items.manage", "final_settlement.manage"]), async (c) => {
  const settlementCase = await getScopedCase(c, routeParam(c, "caseId"), "manage");
  if (!settlementCase) return fail(c, 404, "SETTLEMENT_CASE_NOT_FOUND", "Final settlement case not found.");
  if (LOCKED_CASE_STATUSES.has(readString(settlementCase.status))) return fail(c, 409, "SETTLEMENT_FINALIZED", "This settlement is finalized and locked.");
  const body = await readJsonBody(c.req.raw);
  const adjustmentType = readString(body.adjustment_type).toUpperCase() === "DEDUCTION" ? "DEDUCTION" : "EARNING";
  const amount = num(body.amount, -1);
  const reason = readString(body.reason);
  if (amount < 0) return fail(c, 400, "INVALID_AMOUNT", "Line item amount must be numeric and non-negative.");
  if (!reason) return fail(c, 400, "REASON_REQUIRED", "Reason is required.");
  const line = await createSettlementLineItem(c, { settlement_case_id: String(settlementCase.id), employee_id: String(settlementCase.employee_id), line_type: adjustmentType, component_code: adjustmentType === "EARNING" ? "MANUAL_EARNING" : "MANUAL_DEDUCTION", component_name: adjustmentType === "EARNING" ? "Manual earning adjustment" : "Manual deduction adjustment", component_source: adjustmentType === "EARNING" ? "MANUAL_EARNING_ADJUSTMENT" : "MANUAL_DEDUCTION_ADJUSTMENT", amount, notes: reason });
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO final_settlement_manual_adjustments (id, settlement_case_id, employee_id, line_item_id, adjustment_type, amount, reason, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, settlementCase.id, settlementCase.employee_id, line?.id ?? null, adjustmentType, amount, reason, c.get("currentUser").id).run();
  await calculateFinalSettlement(c, String(settlementCase.id), "Manual adjustment added");
  return ok(c, { adjustment: await c.env.DB.prepare("SELECT * FROM final_settlement_manual_adjustments WHERE id = ?").bind(id).first<Record<string, unknown>>() }, 201);
});

finalSettlementRoutes.post("/manual-adjustments/:adjustmentId/cancel", requireAnyPermission(["final_settlement.manual_adjustments.cancel", "final_settlement.line_items.manage", "final_settlement.manage"]), async (c) => {
  const adjustment = await c.env.DB.prepare("SELECT * FROM final_settlement_manual_adjustments WHERE id = ?").bind(routeParam(c, "adjustmentId")).first<Record<string, unknown>>();
  if (!adjustment) return fail(c, 404, "NOT_FOUND", "Manual adjustment not found.");
  if (!(await canManageFinalSettlementForEmployee(c, String(adjustment.employee_id)))) return fail(c, 404, "NOT_FOUND", "Manual adjustment not found.");
  const body = await readJsonBody(c.req.raw);
  const reason = readString(body.reason);
  if (!reason) return fail(c, 400, "REASON_REQUIRED", "Reason is required.");
  const now = isoNow();
  await c.env.DB.prepare("UPDATE final_settlement_manual_adjustments SET status = 'CANCELLED', cancelled_by_user_id = ?, cancelled_at = ?, cancellation_reason = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, now, reason, now, adjustment.id).run();
  if (adjustment.line_item_id) await c.env.DB.prepare("DELETE FROM final_settlement_line_items WHERE id = ?").bind(adjustment.line_item_id).run();
  await calculateFinalSettlement(c, String(adjustment.settlement_case_id), "Manual adjustment cancelled");
  return ok(c, { cancelled: true });
});

finalSettlementRoutes.get("/cases/:caseId/clearance", requireAnyPermission(["final_settlement.clearance.view", "final_settlement.view", "final_settlement.manage"]), async (c) => {
  const settlementCase = await getScopedCase(c, routeParam(c, "caseId"), "view");
  if (!settlementCase) return fail(c, 404, "SETTLEMENT_CASE_NOT_FOUND", "Final settlement case not found.");
  const rows = await c.env.DB.prepare("SELECT * FROM final_settlement_clearance_items WHERE settlement_case_id = ? ORDER BY clearance_type, created_at").bind(settlementCase.id).all<Record<string, unknown>>();
  return ok(c, { clearance: rows.results });
});

finalSettlementRoutes.patch("/cases/:caseId/clearance/:itemId", requireAnyPermission(["final_settlement.clearance.update", "final_settlement.clearance.manage", "final_settlement.manage"]), async (c) => {
  const settlementCase = await getScopedCase(c, routeParam(c, "caseId"), "manage");
  if (!settlementCase) return fail(c, 404, "SETTLEMENT_CASE_NOT_FOUND", "Final settlement case not found.");
  const body = await readJsonBody(c.req.raw);
  const status = readString(body.status).toUpperCase();
  if (!["PENDING", "CLEARED", "WAIVED", "BLOCKED"].includes(status)) return fail(c, 400, "INVALID_STATUS", "Invalid clearance status.");
  const now = isoNow();
  await c.env.DB.prepare("UPDATE final_settlement_clearance_items SET status = ?, reason = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ? AND settlement_case_id = ?").bind(status, optionalString(body.reason), c.get("currentUser").id, now, routeParam(c, "itemId"), settlementCase.id).run();
  await c.env.DB.prepare("UPDATE final_settlement_cases SET clearance_status = ?, updated_at = ? WHERE id = ?").bind(await summarizeClearanceStatus(c, String(settlementCase.id)), now, settlementCase.id).run();
  await auditFinalSettlement(c, { action: "final_settlement.clearance.updated", entityType: "final_settlement_clearance_item", entityId: routeParam(c, "itemId"), employeeId: String(settlementCase.employee_id), reason: optionalString(body.reason), newValue: { status } });
  return ok(c, { item: await c.env.DB.prepare("SELECT * FROM final_settlement_clearance_items WHERE id = ?").bind(routeParam(c, "itemId")).first<Record<string, unknown>>() });
});

finalSettlementRoutes.post("/cases/:caseId/clearance/:itemId/waive", requireAnyPermission(["final_settlement.clearance.waive", "final_settlement.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const reason = readString(body.reason);
  if (!reason) return fail(c, 400, "REASON_REQUIRED", "Reason is required.");
  const settlementCase = await getScopedCase(c, routeParam(c, "caseId"), "manage");
  if (!settlementCase) return fail(c, 404, "SETTLEMENT_CASE_NOT_FOUND", "Final settlement case not found.");
  const now = isoNow();
  await c.env.DB
    .prepare("UPDATE final_settlement_clearance_items SET status = 'WAIVED', reason = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ? AND settlement_case_id = ?")
    .bind(reason, c.get("currentUser").id, now, routeParam(c, "itemId"), settlementCase.id)
    .run();
  await c.env.DB.prepare("UPDATE final_settlement_cases SET clearance_status = ?, updated_at = ? WHERE id = ?").bind(await summarizeClearanceStatus(c, String(settlementCase.id)), now, settlementCase.id).run();
  await auditFinalSettlement(c, { action: "final_settlement.clearance.waived", entityType: "final_settlement_clearance_item", entityId: routeParam(c, "itemId"), employeeId: String(settlementCase.employee_id), reason, newValue: { status: "WAIVED" } });
  return ok(c, { item: await c.env.DB.prepare("SELECT * FROM final_settlement_clearance_items WHERE id = ?").bind(routeParam(c, "itemId")).first<Record<string, unknown>>() });
});

finalSettlementRoutes.get("/cases/:caseId/events", requireAnyPermission(["final_settlement.approvals.view", "final_settlement.history.view", "final_settlement.view", "final_settlement.manage"]), async (c) => {
  const settlementCase = await getScopedCase(c, routeParam(c, "caseId"), "view");
  if (!settlementCase) return fail(c, 404, "SETTLEMENT_CASE_NOT_FOUND", "Final settlement case not found.");
  const rows = await c.env.DB.prepare("SELECT * FROM final_settlement_events WHERE settlement_case_id = ? ORDER BY created_at ASC").bind(settlementCase.id).all<Record<string, unknown>>();
  return ok(c, { events: rows.results });
});

finalSettlementRoutes.post("/cases/:caseId/submit-for-approval", requireAnyPermission(["final_settlement.approvals.submit", "final_settlement.approvals.manage", "final_settlement.manage"]), async (c) => {
  try {
    const settlementCase = await submitFinalSettlementForApproval(c, routeParam(c, "caseId"));
    if (!settlementCase) return fail(c, 404, "SETTLEMENT_CASE_NOT_FOUND", "Final settlement case not found.");
    return ok(c, { case: maskSettlementCase(settlementCase, canSeeSensitive(c)) });
  } catch (error) {
    return routeActionError(c, error);
  }
});

finalSettlementRoutes.post("/cases/:caseId/approve", requireAnyPermission(["final_settlement.approvals.approve", "final_settlement.approvals.manage", "final_settlement.manage"]), async (c) => {
  try {
    const body = await readJsonBody(c.req.raw);
    const settlementCase = await approveFinalSettlement(c, routeParam(c, "caseId"), optionalString(body.note));
    if (!settlementCase) return fail(c, 404, "SETTLEMENT_CASE_NOT_FOUND", "Final settlement case not found.");
    return ok(c, { case: maskSettlementCase(settlementCase, canSeeSensitive(c)) });
  } catch (error) {
    return routeActionError(c, error);
  }
});

finalSettlementRoutes.post("/cases/:caseId/reject", requireAnyPermission(["final_settlement.approvals.reject", "final_settlement.approvals.manage", "final_settlement.manage"]), async (c) => {
  try {
    const body = await readJsonBody(c.req.raw);
    const settlementCase = await rejectFinalSettlement(c, routeParam(c, "caseId"), readString(body.reason));
    if (!settlementCase) return fail(c, 404, "SETTLEMENT_CASE_NOT_FOUND", "Final settlement case not found.");
    return ok(c, { case: maskSettlementCase(settlementCase, canSeeSensitive(c)) });
  } catch (error) {
    return routeActionError(c, error);
  }
});

finalSettlementRoutes.post("/cases/:caseId/send-back", requireAnyPermission(["final_settlement.approvals.send_back", "final_settlement.approvals.manage", "final_settlement.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const reason = readString(body.reason);
  if (!reason) return fail(c, 400, "REASON_REQUIRED", "Reason is required.");
  const settlementCase = await getScopedCase(c, routeParam(c, "caseId"), "manage");
  if (!settlementCase) return fail(c, 404, "SETTLEMENT_CASE_NOT_FOUND", "Final settlement case not found.");
  const updated = await updateCaseStatus(c, settlementCase, "SENT_BACK", "SENT_BACK", reason);
  return ok(c, { case: maskSettlementCase(updated!, canSeeSensitive(c)) });
});

finalSettlementRoutes.post("/cases/:caseId/finalize", requireAnyPermission(["final_settlement.finalization.finalize", "final_settlement.finalization.manage", "final_settlement.manage"]), async (c) => {
  try {
    const body = await readJsonBody(c.req.raw);
    const settlementCase = await finalizeFinalSettlement(c, routeParam(c, "caseId"), optionalString(body.reason));
    if (!settlementCase) return fail(c, 404, "SETTLEMENT_CASE_NOT_FOUND", "Final settlement case not found.");
    return ok(c, { case: maskSettlementCase(settlementCase, canSeeSensitive(c)) });
  } catch (error) {
    return routeActionError(c, error);
  }
});

finalSettlementRoutes.post("/cases/:caseId/unlock-finalized", requireAnyPermission(["final_settlement.finalization.unlock", "final_settlement.finalization.manage", "final_settlement.override_finalized"]), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const reason = readString(body.reason);
  if (!reason) return fail(c, 400, "REASON_REQUIRED", "Reason is required.");
  const settlementCase = await getScopedCase(c, routeParam(c, "caseId"), "manage");
  if (!settlementCase) return fail(c, 404, "SETTLEMENT_CASE_NOT_FOUND", "Final settlement case not found.");
  const settings = await getFinalSettlementSettings(c.env.DB);
  if (!bool(settings.allow_unlock_after_finalization, false) && !has(c, "final_settlement.override_finalized")) return fail(c, 409, "SETTLEMENT_FINALIZED", "This settlement is finalized and locked.");
  const updated = await updateCaseStatus(c, settlementCase, "READY_FOR_REVIEW", "UNLOCKED", reason);
  return ok(c, { case: maskSettlementCase(updated!, canSeeSensitive(c)) });
});

finalSettlementRoutes.get("/cases/:caseId/payment-register", requireAnyPermission(["final_settlement.payment_register.view", "final_settlement.payment_register.manage", "final_settlement.view"]), async (c) => {
  const settlementCase = await getScopedCase(c, routeParam(c, "caseId"), "view");
  if (!settlementCase) return fail(c, 404, "SETTLEMENT_CASE_NOT_FOUND", "Final settlement case not found.");
  const payment = await c.env.DB.prepare("SELECT * FROM final_settlement_payment_register WHERE settlement_case_id = ?").bind(settlementCase.id).first<Record<string, unknown>>();
  return ok(c, { payment: payment ? maskPayment(payment, canSeeSensitive(c)) : null });
});

finalSettlementRoutes.post("/cases/:caseId/prepare-payment-register", requireAnyPermission(["final_settlement.payment_register.prepare", "final_settlement.payment_register.manage"]), async (c) => {
  try {
    const payment = await prepareFinalSettlementPaymentRegister(c, routeParam(c, "caseId"));
    if (!payment) return fail(c, 404, "SETTLEMENT_CASE_NOT_FOUND", "Final settlement case not found.");
    return ok(c, { payment: maskPayment(payment, canSeeSensitive(c)) });
  } catch (error) {
    return routeActionError(c, error);
  }
});

employeeFinalSettlementRoutes.get("/:employeeId/final-settlements", requireAnyPermission(["employees.final_settlement.view", "final_settlement.view", "final_settlement.cases.view", "final_settlement.manage"]), async (c) => {
  const employeeId = routeParam(c, "employeeId");
  if (!(await canViewFinalSettlementForEmployee(c, employeeId))) return fail(c, 404, "EMPLOYEE_NOT_FOUND", "Employee not found or outside your access scope.");
  const rows = await c.env.DB.prepare("SELECT * FROM final_settlement_cases WHERE employee_id = ? ORDER BY created_at DESC").bind(employeeId).all<Record<string, unknown>>();
  return ok(c, { cases: rows.results.map((row) => maskSettlementCase(row, canSeeSensitive(c))) });
});

employeeFinalSettlementRoutes.get("/:employeeId/final-settlement/summary", requireAnyPermission(["employees.final_settlement.view", "final_settlement.view", "final_settlement.cases.view", "final_settlement.manage"]), async (c) => {
  const employeeId = routeParam(c, "employeeId");
  if (!(await canViewFinalSettlementForEmployee(c, employeeId))) return fail(c, 404, "EMPLOYEE_NOT_FOUND", "Employee not found or outside your access scope.");
  const settlementCase = await c.env.DB.prepare("SELECT * FROM final_settlement_cases WHERE employee_id = ? ORDER BY created_at DESC LIMIT 1").bind(employeeId).first<Record<string, unknown>>();
  if (!settlementCase) return ok(c, { summary: null });
  const [lineItems, clearance, events, payment] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM final_settlement_line_items WHERE settlement_case_id = ? ORDER BY created_at ASC").bind(settlementCase.id).all<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT * FROM final_settlement_clearance_items WHERE settlement_case_id = ? ORDER BY clearance_type, created_at").bind(settlementCase.id).all<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT * FROM final_settlement_events WHERE settlement_case_id = ? ORDER BY created_at ASC").bind(settlementCase.id).all<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT * FROM final_settlement_payment_register WHERE settlement_case_id = ?").bind(settlementCase.id).first<Record<string, unknown>>()
  ]);
  return ok(c, {
    summary: {
      case: maskSettlementCase(settlementCase, canSeeSensitive(c)),
      line_items: canSeeSensitive(c) ? lineItems.results : [],
      clearance: clearance.results,
      events: events.results,
      payment: payment ? maskPayment(payment, canSeeSensitive(c)) : null
    }
  });
});
