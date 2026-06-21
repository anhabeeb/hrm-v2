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

type BindValue = string | number | null;
type ComponentType = "EARNING" | "DEDUCTION";
type RunStatus = "DRAFT" | "PROCESSING" | "REVIEW" | "APPROVED" | "PAID" | "CANCELLED";

const COMPONENT_TYPES = new Set(["EARNING", "DEDUCTION"]);
const COMPONENT_CATEGORIES = new Set(["BASIC", "ALLOWANCE", "BENEFIT", "OVERTIME", "ADVANCE", "ATTENDANCE", "LEAVE", "OTHER"]);
const CALCULATION_TYPES = new Set(["FIXED", "VARIABLE", "PERCENTAGE"]);
const PAYMENT_METHODS = new Set(["CASH", "BANK_TRANSFER", "CHEQUE", "OTHER"]);
const DAILY_RATE_MODES = new Set(["CALENDAR_DAYS", "WORKING_DAYS", "FIXED_30_DAYS"]);
const PERIOD_STATUSES = new Set(["OPEN", "PROCESSING", "REVIEW", "APPROVED", "PAID", "CLOSED", "CANCELLED"]);
const RUN_STATUSES = new Set(["DRAFT", "PROCESSING", "REVIEW", "APPROVED", "PAID", "CANCELLED"]);
const ADVANCE_STATUSES = new Set(["REQUESTED", "APPROVED", "PAID", "DEDUCTED", "CANCELLED"]);
const DEDUCTION_TYPES = new Set(["FIXED", "VARIABLE", "ONE_TIME", "RECURRING"]);
const DEDUCTION_STATUSES = new Set(["ACTIVE", "INACTIVE", "APPLIED", "CANCELLED"]);
const ADJUSTMENT_TYPES = new Set(["EARNING", "DEDUCTION"]);
const ADJUSTMENT_STATUSES = new Set(["DRAFT", "APPROVED", "APPLIED", "CANCELLED"]);
const RUN_EMPLOYEE_STATUSES = new Set(["DRAFT", "REVIEW", "APPROVED", "PAID", "HELD", "EXCLUDED"]);
const FINAL_SETTLEMENT_STATUSES = new Set(["DRAFT", "REVIEW", "APPROVED", "PAID", "CANCELLED"]);

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

async function publishPayroll(c: Context<AppBindings>, event: Parameters<typeof publishAccessEvent>[1], entityType: "payroll_component" | "payroll_settings" | "payroll_profile" | "salary_history" | "payroll_increment" | "payroll_period" | "payroll_run" | "payroll_run_employee" | "payroll_advance" | "payroll_deduction" | "payroll_adjustment" | "final_settlement" | "payroll_report", entityId: string, action: string) {
  await publishAccessEvent(c.env, event, { actor_user_id: c.get("currentUser").id, entity_type: entityType, entity_id: entityId, action });
  if (event !== "payroll.changed") await publishAccessEvent(c.env, "payroll.changed", { actor_user_id: c.get("currentUser").id, entity_type: entityType, entity_id: entityId, action });
}

async function getSettings(c: Context<AppBindings>) {
  let settings = await c.env.DB.prepare("SELECT * FROM payroll_settings WHERE id = 'payroll_settings_default'").first<Record<string, unknown>>();
  if (!settings) {
    await c.env.DB.prepare("INSERT INTO payroll_settings (id, default_currency, default_daily_rate_mode, allow_negative_net_salary, require_approval_before_paid, include_attendance_deductions, include_leave_deductions, include_advance_deductions, include_roster_scheduled_days, default_salary_payment_day) VALUES ('payroll_settings_default', 'MVR', 'FIXED_30_DAYS', 0, 1, 1, 1, 1, 1, 28)").run();
    settings = await c.env.DB.prepare("SELECT * FROM payroll_settings WHERE id = 'payroll_settings_default'").first<Record<string, unknown>>();
  }
  return settings!;
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

async function componentByCode(c: Context<AppBindings>, code: string) {
  return c.env.DB.prepare("SELECT id FROM payroll_components WHERE code = ?").bind(code).first<{ id: string }>();
}

function readComponent(body: Record<string, unknown>, existing?: Record<string, unknown>) {
  const type = readString(body.type ?? existing?.type).toUpperCase();
  const category = readString(body.category ?? existing?.category).toUpperCase();
  const calculationType = readString(body.calculation_type ?? existing?.calculation_type).toUpperCase();
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
        (SELECT COUNT(*) FROM payroll_run_employees pre WHERE pre.payroll_run_id = pr.id) AS employee_count,
        (SELECT COALESCE(SUM(total_earnings), 0) FROM payroll_run_employees pre WHERE pre.payroll_run_id = pr.id) AS total_earnings,
        (SELECT COALESCE(SUM(total_deductions), 0) FROM payroll_run_employees pre WHERE pre.payroll_run_id = pr.id) AS total_deductions,
        (SELECT COALESCE(SUM(net_salary), 0) FROM payroll_run_employees pre WHERE pre.payroll_run_id = pr.id) AS net_salary_total
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
       INNER JOIN payroll_run_employees pre ON pre.payroll_run_id = pr.id
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
  await c.env.DB.prepare("DELETE FROM payroll_run_lines WHERE payroll_run_employee_id IN (SELECT id FROM payroll_run_employees WHERE payroll_run_id = ?)").bind(runId).run();
  await c.env.DB.prepare("DELETE FROM payroll_run_employees WHERE payroll_run_id = ? AND status != 'HELD'").bind(runId).run();

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
          GROUP_CONCAT(CASE WHEN status = 'ABSENT' OR missed_punch = 1 THEN attendance_date ELSE NULL END) AS missed_dates
         FROM attendance_daily_records
         WHERE employee_id = ? AND attendance_date BETWEEN ? AND ?`
      )
      .bind(employee.id, startDate, endDate)
      .first<Record<string, unknown>>();
    const leave = await c.env.DB
      .prepare(
        `SELECT COUNT(*) AS leave_days,
          SUM(CASE WHEN lp.salary_deduction_mode IS NOT NULL AND lp.salary_deduction_mode != 'NONE' THEN 1 ELSE 0 END) AS unpaid_leave_days
         FROM leave_request_days lrd
         INNER JOIN leave_requests lr ON lr.id = lrd.leave_request_id
         LEFT JOIN leave_policies lp ON lp.id = lr.policy_id
         WHERE lr.employee_id = ? AND lr.status = 'APPROVED' AND lrd.leave_date BETWEEN ? AND ?`
      )
      .bind(employee.id, startDate, endDate)
      .first<Record<string, unknown>>();
    const roster = await c.env.DB.prepare("SELECT COUNT(*) AS scheduled_work_days FROM roster_assignments WHERE employee_id = ? AND roster_date BETWEEN ? AND ? AND status = 'SCHEDULED'").bind(employee.id, startDate, endDate).first<Record<string, unknown>>();
    const advances = bool(settings.include_advance_deductions, true)
      ? (await c.env.DB.prepare("SELECT * FROM payroll_advance_payments WHERE employee_id = ? AND payment_date BETWEEN ? AND ? AND status IN ('APPROVED', 'PAID')").bind(employee.id, startDate, endDate).all<Record<string, unknown>>()).results
      : [];
    const deductions = (await c.env.DB.prepare("SELECT * FROM payroll_deductions WHERE employee_id = ? AND status = 'ACTIVE' AND (payroll_period_id IS NULL OR payroll_period_id = ?)").bind(employee.id, period.id).all<Record<string, unknown>>()).results;
    const adjustments = (await c.env.DB.prepare("SELECT * FROM payroll_adjustments WHERE employee_id = ? AND status = 'APPROVED' AND (payroll_period_id IS NULL OR payroll_period_id = ?)").bind(employee.id, period.id).all<Record<string, unknown>>()).results;

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
    const totalDeductions = excluded ? 0 : Number((advanceDeductions + attendanceDeductions + leaveDeductions + fixedDeductions + adjustmentDeductions).toFixed(2));
    let netSalary = totalEarnings - totalDeductions;
    const clamped = netSalary < 0 && !bool(settings.allow_negative_net_salary, false);
    if (clamped) netSalary = 0;
    const missedDates = readString(attendance?.missed_dates).split(",").filter(Boolean);
    const calculation = {
      foundation: true,
      mode,
      daily_rate: dailyRate,
      daily_rate_divisor: dailyRateDivisor,
      attendance,
      leave,
      roster,
      advances: advances.map((advance) => ({ id: advance.id, amount: advance.amount, payment_date: advance.payment_date })),
      deductions: deductions.map((deduction) => ({ id: deduction.id, amount: deduction.amount, reason: deduction.reason })),
      adjustments: adjustments.map((adjustment) => ({ id: adjustment.id, amount: adjustment.amount, type: adjustment.adjustment_type, reason: adjustment.reason })),
      negative_net_salary_clamped: clamped
    };

    await c.env.DB
      .prepare(
        `INSERT INTO payroll_run_employees
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
        excluded ? "EXCLUDED" : "DRAFT",
        excluded ? "Employee or employee status is excluded from payroll." : null
      )
      .run();

    if (excluded) continue;
    await insertLine(c, runEmployeeId, basicComponent?.id ?? null, "EARNING", "BASIC", "Basic salary", basicSalary, "PROFILE", "employee_payroll_profile", String(employee.id), { daily_rate: dailyRate });
    if (advanceDeductions > 0) await insertLine(c, runEmployeeId, advanceComponent?.id ?? null, "DEDUCTION", "ADVANCE", "Advance payments", advanceDeductions, "ADVANCE", null, null, advances);
    if (attendanceDeductions > 0) await insertLine(c, runEmployeeId, absenceComponent?.id ?? null, "DEDUCTION", "ATTENDANCE", "Attendance absence deduction", attendanceDeductions, "ATTENDANCE", null, null, attendance);
    if (leaveDeductions > 0) await insertLine(c, runEmployeeId, leaveComponent?.id ?? null, "DEDUCTION", "LEAVE", "Unpaid leave deduction", leaveDeductions, "LEAVE", null, null, leave);
    for (const deduction of deductions) await insertLine(c, runEmployeeId, deduction.payroll_component_id ? String(deduction.payroll_component_id) : otherComponent?.id ?? null, "DEDUCTION", "OTHER", String(deduction.reason), Number(deduction.amount), "MANUAL", "payroll_deduction", String(deduction.id), deduction);
    for (const adjustment of adjustments) await insertLine(c, runEmployeeId, null, adjustment.adjustment_type as ComponentType, "OTHER", String(adjustment.reason), Number(adjustment.amount), "MANUAL", "payroll_adjustment", String(adjustment.id), adjustment);
  }
  await c.env.DB.prepare("UPDATE payroll_runs SET status = 'REVIEW', updated_at = ? WHERE id = ?").bind(isoNow(), runId).run();
  await c.env.DB.prepare("UPDATE payroll_periods SET status = 'REVIEW', updated_at = ? WHERE id = ?").bind(isoNow(), period.id).run();
  return { ok: true };
}

async function insertLine(c: Context<AppBindings>, runEmployeeId: string, componentId: string | null, lineType: ComponentType, category: string | null, description: string, amount: number, source: string, sourceType: string | null, sourceId: string | null, calculation: unknown) {
  await c.env.DB
    .prepare("INSERT INTO payroll_run_lines (id, payroll_run_employee_id, payroll_component_id, line_type, category, description, amount, source, source_entity_type, source_entity_id, calculation_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), runEmployeeId, componentId, lineType, category, description, Math.max(0, Number(amount.toFixed(2))), source, sourceType, sourceId, JSON.stringify(calculation))
    .run();
}

async function getRunEmployee(c: Context<AppBindings>, id: string) {
  return c.env.DB.prepare("SELECT pre.*, d.name AS department_name, p.title AS position_title, l.name AS location_name FROM payroll_run_employees pre LEFT JOIN departments d ON d.id = pre.department_id LEFT JOIN positions p ON p.id = pre.position_id LEFT JOIN locations l ON l.id = pre.location_id WHERE pre.id = ?").bind(id).first<Record<string, unknown>>();
}

payrollRoutes.get("/components", requirePermission("payroll.view"), async (c) => ok(c, { components: (await c.env.DB.prepare("SELECT * FROM payroll_components ORDER BY is_active DESC, sort_order, name").all()).results }));

payrollRoutes.get("/components/:id", requirePermission("payroll.view"), async (c) => {
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

payrollRoutes.get("/settings", requirePermission("payroll.view"), async (c) => ok(c, { settings: await getSettings(c) }));

payrollRoutes.patch("/settings", requirePermission("payroll.settings.manage"), async (c) => {
  const old = await getSettings(c);
  const body = await readJsonBody(c.req.raw);
  const mode = readString(body.default_daily_rate_mode ?? old.default_daily_rate_mode).toUpperCase();
  await c.env.DB.prepare("UPDATE payroll_settings SET default_currency = ?, default_daily_rate_mode = ?, allow_negative_net_salary = ?, require_approval_before_paid = ?, include_attendance_deductions = ?, include_leave_deductions = ?, include_advance_deductions = ?, include_roster_scheduled_days = ?, default_salary_payment_day = ?, updated_at = ? WHERE id = 'payroll_settings_default'").bind(readString(body.default_currency ?? old.default_currency) || "MVR", DAILY_RATE_MODES.has(mode) ? mode : old.default_daily_rate_mode, bool(body.allow_negative_net_salary, Boolean(old.allow_negative_net_salary)) ? 1 : 0, bool(body.require_approval_before_paid, Boolean(old.require_approval_before_paid)) ? 1 : 0, bool(body.include_attendance_deductions, Boolean(old.include_attendance_deductions)) ? 1 : 0, bool(body.include_leave_deductions, Boolean(old.include_leave_deductions)) ? 1 : 0, bool(body.include_advance_deductions, Boolean(old.include_advance_deductions)) ? 1 : 0, bool(body.include_roster_scheduled_days, Boolean(old.include_roster_scheduled_days)) ? 1 : 0, num(body.default_salary_payment_day, old.default_salary_payment_day == null ? null : Number(old.default_salary_payment_day)), isoNow()).run();
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
  const [profile, salary, increments, advances, deductions, runs, settlements, audit] = await Promise.all([
    ensureProfile(c, employeeId),
    c.env.DB.prepare("SELECT * FROM employee_salary_history WHERE employee_id = ? ORDER BY effective_date DESC LIMIT 20").bind(employeeId).all(),
    c.env.DB.prepare("SELECT * FROM employee_increments WHERE employee_id = ? ORDER BY effective_date DESC LIMIT 20").bind(employeeId).all(),
    c.env.DB.prepare("SELECT * FROM payroll_advance_payments WHERE employee_id = ? ORDER BY payment_date DESC LIMIT 20").bind(employeeId).all(),
    c.env.DB.prepare("SELECT * FROM payroll_deductions WHERE employee_id = ? ORDER BY created_at DESC LIMIT 20").bind(employeeId).all(),
    c.env.DB.prepare("SELECT pre.*, pr.run_no, pr.status AS run_status, pp.period_month, pp.period_year FROM payroll_run_employees pre INNER JOIN payroll_runs pr ON pr.id = pre.payroll_run_id INNER JOIN payroll_periods pp ON pp.id = pr.payroll_period_id WHERE pre.employee_id = ? ORDER BY pp.period_year DESC, pp.period_month DESC, pr.run_no DESC LIMIT 20").bind(employeeId).all(),
    c.env.DB.prepare("SELECT * FROM final_settlements WHERE employee_id = ? ORDER BY created_at DESC LIMIT 20").bind(employeeId).all(),
    c.env.DB.prepare(
      `SELECT * FROM audit_logs
       WHERE module = 'payroll' AND (
         entity_id IN (SELECT id FROM employee_payroll_profiles WHERE employee_id = ?)
         OR entity_id IN (SELECT id FROM employee_salary_history WHERE employee_id = ?)
         OR entity_id IN (SELECT id FROM employee_increments WHERE employee_id = ?)
         OR entity_id IN (SELECT id FROM payroll_advance_payments WHERE employee_id = ?)
         OR entity_id IN (SELECT id FROM payroll_deductions WHERE employee_id = ?)
         OR entity_id IN (SELECT id FROM payroll_adjustments WHERE employee_id = ?)
         OR entity_id IN (SELECT id FROM payroll_run_employees WHERE employee_id = ?)
         OR entity_id IN (SELECT id FROM final_settlements WHERE employee_id = ?)
       )
       ORDER BY created_at DESC LIMIT 50`
    ).bind(employeeId, employeeId, employeeId, employeeId, employeeId, employeeId, employeeId, employeeId).all()
  ]);
  return ok(c, {
    profile: profile ? safeProfile(profile, true) : null,
    salary_history: salary.results,
    increments: increments.results,
    advances: advances.results,
    deductions: deductions.results,
    run_history: runs.results,
    runs: runs.results,
    final_settlements: settlements.results,
    settlements: settlements.results,
    audit: audit.results
  });
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
  await c.env.DB.prepare("UPDATE payroll_advance_payments SET amount = ?, payment_date = ?, repayment_period_id = ?, notes = ?, updated_at = ? WHERE id = ?").bind(amount, readString(body.payment_date ?? old.payment_date), optionalString(body.repayment_period_id ?? old.repayment_period_id), optionalString(body.notes ?? old.notes), isoNow(), id).run();
  const saved = await c.env.DB.prepare("SELECT * FROM payroll_advance_payments WHERE id = ?").bind(id).first();
  await auditPayroll(c, { action: "payroll.advance.updated", entityType: "payroll_advance", entityId: id, oldValue: old, newValue: saved });
  await publishPayroll(c, "payroll.advance.updated", "payroll_advance", id, "updated");
  return ok(c, { advance: saved });
});

async function advanceStatus(c: Context<AppBindings>, status: "APPROVED" | "PAID" | "CANCELLED") {
  const id = routeParam(c, "id");
  const old = await c.env.DB.prepare("SELECT * FROM payroll_advance_payments WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!old) return fail(c, 404, "NOT_FOUND", "Advance payment was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(old.employee_id), "payroll", "manage"))) return fail(c, 404, "NOT_FOUND", "Advance payment was not found.");
  const body: Record<string, unknown> = await readJsonBody(c.req.raw).catch(() => ({}));
  if (status === "CANCELLED" && !optionalString(body.reason)) return fail(c, 400, "VALIDATION_ERROR", "Cancellation reason is required.");
  const now = isoNow();
  if (status === "APPROVED") await c.env.DB.prepare("UPDATE payroll_advance_payments SET status = 'APPROVED', approved_by_user_id = ?, approved_at = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, now, now, id).run();
  if (status === "PAID") await c.env.DB.prepare("UPDATE payroll_advance_payments SET status = 'PAID', paid_by_user_id = ?, paid_at = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, now, now, id).run();
  if (status === "CANCELLED") await c.env.DB.prepare("UPDATE payroll_advance_payments SET status = 'CANCELLED', notes = COALESCE(notes, '') || ?, updated_at = ? WHERE id = ?").bind(`\nCancelled: ${optionalString(body.reason)}`, now, id).run();
  const saved = await c.env.DB.prepare("SELECT * FROM payroll_advance_payments WHERE id = ?").bind(id).first();
  const action = status === "APPROVED" ? "payroll.advance.approved" : status === "PAID" ? "payroll.advance.paid" : "payroll.advance.cancelled";
  await auditPayroll(c, { action, entityType: "payroll_advance", entityId: id, oldValue: old, newValue: saved, reason: optionalString(body.reason) });
  await publishPayroll(c, status === "APPROVED" ? "payroll.advance.approved" : status === "PAID" ? "payroll.advance.paid" : "payroll.advance.updated", "payroll_advance", id, status.toLowerCase());
  return ok(c, { advance: saved });
}

payrollRoutes.post("/advances/:id/approve", requireAnyPermission(["payroll.advances.manage", "payroll.approve"]), (c) => advanceStatus(c, "APPROVED"));
payrollRoutes.post("/advances/:id/mark-paid", requireAnyPermission(["payroll.advances.manage", "payroll.pay"]), (c) => advanceStatus(c, "PAID"));
payrollRoutes.post("/advances/:id/cancel", requirePermission("payroll.advances.manage"), (c) => advanceStatus(c, "CANCELLED"));

payrollRoutes.get("/deductions", requirePermission("payroll.view"), async (c) => {
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

payrollRoutes.post("/deductions", requirePermission("payroll.adjustments.manage"), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const amount = num(body.amount, null);
  const type = readString(body.deduction_type).toUpperCase();
  const reason = readString(body.reason);
  if (!readString(body.employee_id) || amount == null || amount <= 0 || !DEDUCTION_TYPES.has(type) || !reason) return fail(c, 400, "VALIDATION_ERROR", "Employee, deduction type, amount, and reason are required.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), readString(body.employee_id), "payroll", "manage"))) return fail(c, 403, "FORBIDDEN", "You do not have payroll access to this employee.");
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO payroll_deductions (id, employee_id, payroll_component_id, deduction_type, amount, start_date, end_date, payroll_period_id, reason, status, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)").bind(id, readString(body.employee_id), optionalString(body.payroll_component_id), type, amount, optionalString(body.start_date), optionalString(body.end_date), optionalString(body.payroll_period_id), reason, c.get("currentUser").id).run();
  const saved = await c.env.DB.prepare("SELECT * FROM payroll_deductions WHERE id = ?").bind(id).first();
  await auditPayroll(c, { action: "payroll.deduction.created", entityType: "payroll_deduction", entityId: id, newValue: saved, reason });
  return ok(c, { deduction: saved }, 201);
});

payrollRoutes.patch("/deductions/:id", requirePermission("payroll.adjustments.manage"), async (c) => {
  const id = routeParam(c, "id");
  const old = await c.env.DB.prepare("SELECT * FROM payroll_deductions WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!old) return fail(c, 404, "NOT_FOUND", "Deduction was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(old.employee_id), "payroll", "manage"))) return fail(c, 404, "NOT_FOUND", "Deduction was not found.");
  const body = await readJsonBody(c.req.raw);
  const amount = num(body.amount, Number(old.amount)) ?? Number(old.amount);
  const type = readString(body.deduction_type ?? old.deduction_type).toUpperCase();
  const status = readString(body.status ?? old.status).toUpperCase();
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

payrollRoutes.post("/deductions/:id/enable", requirePermission("payroll.adjustments.manage"), (c) => deductionAction(c, "ACTIVE"));
payrollRoutes.post("/deductions/:id/disable", requirePermission("payroll.adjustments.manage"), (c) => deductionAction(c, "INACTIVE"));
payrollRoutes.post("/deductions/:id/cancel", requirePermission("payroll.adjustments.manage"), (c) => deductionAction(c, "CANCELLED"));

payrollRoutes.get("/adjustments", requirePermission("payroll.view"), async (c) => {
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
  await c.env.DB.prepare("UPDATE payroll_adjustments SET payroll_period_id = ?, amount = ?, reason = ?, status = ?, updated_at = ? WHERE id = ?").bind(optionalString(body.payroll_period_id ?? old.payroll_period_id), num(body.amount, Number(old.amount)), readString(body.reason ?? old.reason), ADJUSTMENT_STATUSES.has(status) ? status : old.status, isoNow(), id).run();
  const saved = await c.env.DB.prepare("SELECT * FROM payroll_adjustments WHERE id = ?").bind(id).first();
  await auditPayroll(c, { action: "payroll.adjustment.updated", entityType: "payroll_adjustment", entityId: id, oldValue: old, newValue: saved });
  return ok(c, { adjustment: saved });
});

async function adjustmentAction(c: Context<AppBindings>, status: "APPROVED" | "CANCELLED") {
  const id = routeParam(c, "id");
  const old = await c.env.DB.prepare("SELECT * FROM payroll_adjustments WHERE id = ?").bind(id).first();
  if (!old) return fail(c, 404, "NOT_FOUND", "Adjustment was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String((old as Record<string, unknown>).employee_id), "payroll", "manage"))) return fail(c, 404, "NOT_FOUND", "Adjustment was not found.");
  const body: Record<string, unknown> = await readJsonBody(c.req.raw).catch(() => ({}));
  if (status === "CANCELLED" && !optionalString(body.reason)) return fail(c, 400, "VALIDATION_ERROR", "Cancellation reason is required.");
  await c.env.DB.prepare("UPDATE payroll_adjustments SET status = ?, approved_by_user_id = ?, approved_at = ?, updated_at = ? WHERE id = ?").bind(status, status === "APPROVED" ? c.get("currentUser").id : null, status === "APPROVED" ? isoNow() : null, isoNow(), id).run();
  await auditPayroll(c, { action: status === "APPROVED" ? "payroll.adjustment.approved" : "payroll.adjustment.cancelled", entityType: "payroll_adjustment", entityId: id, oldValue: old, newValue: { status }, reason: optionalString(body.reason) });
  return ok(c, { status });
}

payrollRoutes.post("/adjustments/:id/approve", requireAnyPermission(["payroll.adjustments.manage", "payroll.approve"]), (c) => adjustmentAction(c, "APPROVED"));
payrollRoutes.post("/adjustments/:id/cancel", requirePermission("payroll.adjustments.manage"), (c) => adjustmentAction(c, "CANCELLED"));

payrollRoutes.get("/periods", requirePermission("payroll.view"), async (c) => {
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

payrollRoutes.get("/periods/:id", requirePermission("payroll.view"), async (c) => {
  const period = await getPeriod(c, routeParam(c, "id"));
  if (!period) return fail(c, 404, "NOT_FOUND", "Payroll period was not found.");
  return ok(c, { period });
});

payrollRoutes.post("/periods", requirePermission("payroll.manage"), async (c) => {
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
    await c.env.DB.prepare("INSERT INTO payroll_periods (id, period_month, period_year, start_date, end_date, salary_payment_date, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, month, year, startDate, endDate, salaryPaymentDate, c.get("currentUser").id).run();
  } catch {
    return fail(c, 409, "DUPLICATE_PERIOD", "A payroll period already exists for this month and year.");
  }
  const saved = await getPeriod(c, id);
  await auditPayroll(c, { action: "payroll.period.created", entityType: "payroll_period", entityId: id, newValue: saved });
  await publishPayroll(c, "payroll.period.created", "payroll_period", id, "created");
  return ok(c, { period: saved }, 201);
});

payrollRoutes.patch("/periods/:id", requirePermission("payroll.manage"), async (c) => {
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

payrollRoutes.post("/periods/:id/close", requirePermission("payroll.manage"), async (c) => {
  const id = routeParam(c, "id");
  const old = await getPeriod(c, id);
  if (!old) return fail(c, 404, "NOT_FOUND", "Payroll period was not found.");
  await c.env.DB.prepare("UPDATE payroll_periods SET status = 'CLOSED', closed_by_user_id = ?, closed_at = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, isoNow(), isoNow(), id).run();
  await auditPayroll(c, { action: "payroll.period.closed", entityType: "payroll_period", entityId: id, oldValue: old });
  return ok(c, { closed: true });
});

payrollRoutes.post("/periods/:id/cancel", requirePermission("payroll.manage"), async (c) => {
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

payrollRoutes.get("/runs", requirePermission("payroll.view"), async (c) => {
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
    ? await c.env.DB.prepare(`SELECT pr.*, pp.period_month, pp.period_year, (SELECT COUNT(*) FROM payroll_run_employees pre WHERE pre.payroll_run_id = pr.id) AS employee_count, (SELECT COALESCE(SUM(total_earnings),0) FROM payroll_run_employees pre WHERE pre.payroll_run_id = pr.id) AS total_earnings, (SELECT COALESCE(SUM(total_deductions),0) FROM payroll_run_employees pre WHERE pre.payroll_run_id = pr.id) AS total_deductions, (SELECT COALESCE(SUM(net_salary),0) FROM payroll_run_employees pre WHERE pre.payroll_run_id = pr.id) AS net_salary_total FROM payroll_runs pr INNER JOIN payroll_periods pp ON pp.id = pr.payroll_period_id WHERE ${conditions.join(" AND ")} ORDER BY pp.period_year DESC, pp.period_month DESC, pr.run_no DESC`).bind(...params).all()
    : await c.env.DB.prepare(
      `SELECT pr.*, pp.period_month, pp.period_year,
        COUNT(pre.id) AS employee_count,
        COALESCE(SUM(pre.total_earnings),0) AS total_earnings,
        COALESCE(SUM(pre.total_deductions),0) AS total_deductions,
        COALESCE(SUM(pre.net_salary),0) AS net_salary_total
       FROM payroll_runs pr
       INNER JOIN payroll_periods pp ON pp.id = pr.payroll_period_id
       INNER JOIN payroll_run_employees pre ON pre.payroll_run_id = pr.id
       WHERE ${conditions.join(" AND ")} AND pre.employee_id IN (${scopedEmployeeSql})
       GROUP BY pr.id
       ORDER BY pp.period_year DESC, pp.period_month DESC, pr.run_no DESC`
    ).bind(...params, ...scope.params).all();
  return ok(c, { runs: rows.results });
});

payrollRoutes.get("/runs/:id", requirePermission("payroll.view"), async (c) => {
  const run = await getScopedRun(c, routeParam(c, "id"));
  if (!run) return fail(c, 404, "NOT_FOUND", "Payroll run was not found.");
  return ok(c, { run });
});

payrollRoutes.post("/runs/generate", requirePermission("payroll.manage"), async (c) => {
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

payrollRoutes.post("/runs/:id/recalculate", requirePermission("payroll.manage"), async (c) => {
  const run = await getRun(c, routeParam(c, "id"));
  if (!run) return fail(c, 404, "NOT_FOUND", "Payroll run was not found.");
  if (!["DRAFT", "REVIEW"].includes(String(run.status))) return fail(c, 400, "INVALID_STATUS", "Only draft or review payroll runs can be recalculated.");
  const result = await recalculateRun(c, run, "recalculate");
  if (result.error) return fail(c, 400, "VALIDATION_ERROR", result.error);
  const saved = await getRun(c, String(run.id));
  await auditPayroll(c, { action: "payroll.run.recalculated", entityType: "payroll_run", entityId: String(run.id), oldValue: run, newValue: saved });
  await publishPayroll(c, "payroll.run.recalculated", "payroll_run", String(run.id), "recalculated");
  return ok(c, { run: saved });
});

payrollRoutes.post("/runs/:id/approve", requirePermission("payroll.approve"), async (c) => {
  const run = await getRun(c, routeParam(c, "id"));
  if (!run) return fail(c, 404, "NOT_FOUND", "Payroll run was not found.");
  if (!["DRAFT", "REVIEW"].includes(String(run.status))) return fail(c, 400, "INVALID_STATUS", "Only draft or review payroll runs can be approved.");
  await c.env.DB.prepare("UPDATE payroll_runs SET status = 'APPROVED', approved_by_user_id = ?, approved_at = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, isoNow(), isoNow(), run.id).run();
  await c.env.DB.prepare("UPDATE payroll_run_employees SET status = 'APPROVED', updated_at = ? WHERE payroll_run_id = ? AND status != 'HELD'").bind(isoNow(), run.id).run();
  await auditPayroll(c, { action: "payroll.run.approved", entityType: "payroll_run", entityId: String(run.id), oldValue: run });
  await publishPayroll(c, "payroll.run.approved", "payroll_run", String(run.id), "approved");
  return ok(c, { run: await getRun(c, String(run.id)) });
});

payrollRoutes.post("/runs/:id/mark-paid", requirePermission("payroll.pay"), async (c) => {
  const run = await getRun(c, routeParam(c, "id"));
  if (!run) return fail(c, 404, "NOT_FOUND", "Payroll run was not found.");
  const settings = await getSettings(c);
  if (bool(settings.require_approval_before_paid, true) && run.status !== "APPROVED") return fail(c, 400, "APPROVAL_REQUIRED", "Payroll run must be approved before payment.");
  await c.env.DB.prepare("UPDATE payroll_runs SET status = 'PAID', paid_by_user_id = ?, paid_at = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, isoNow(), isoNow(), run.id).run();
  await c.env.DB.prepare("UPDATE payroll_run_employees SET status = 'PAID', updated_at = ? WHERE payroll_run_id = ? AND status != 'HELD'").bind(isoNow(), run.id).run();
  await c.env.DB.prepare("UPDATE payroll_periods SET status = 'PAID', paid_by_user_id = ?, paid_at = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, isoNow(), isoNow(), run.payroll_period_id).run();
  await c.env.DB.prepare("UPDATE payroll_advance_payments SET status = 'DEDUCTED', deduction_payroll_run_employee_id = (SELECT pre.id FROM payroll_run_employees pre WHERE pre.employee_id = payroll_advance_payments.employee_id AND pre.payroll_run_id = ? LIMIT 1), updated_at = ? WHERE status IN ('APPROVED', 'PAID') AND payment_date BETWEEN ? AND ?").bind(run.id, isoNow(), run.start_date, run.end_date).run();
  await auditPayroll(c, { action: "payroll.run.paid", entityType: "payroll_run", entityId: String(run.id), oldValue: run });
  await publishPayroll(c, "payroll.run.paid", "payroll_run", String(run.id), "paid");
  return ok(c, { run: await getRun(c, String(run.id)) });
});

payrollRoutes.post("/runs/:id/cancel", requirePermission("payroll.manage"), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const reason = optionalString(body.reason);
  if (!reason) return fail(c, 400, "VALIDATION_ERROR", "Cancellation reason is required.");
  const run = await getRun(c, routeParam(c, "id"));
  if (!run) return fail(c, 404, "NOT_FOUND", "Payroll run was not found.");
  await c.env.DB.prepare("UPDATE payroll_runs SET status = 'CANCELLED', updated_at = ? WHERE id = ?").bind(isoNow(), run.id).run();
  await auditPayroll(c, { action: "payroll.run.cancelled", entityType: "payroll_run", entityId: String(run.id), oldValue: run, reason });
  return ok(c, { cancelled: true });
});

payrollRoutes.get("/runs/:id/employees", requirePermission("payroll.view"), async (c) => {
  const conditions = ["pre.payroll_run_id = ?"];
  const params: BindValue[] = [routeParam(c, "id")];
  await addEmployeeScope(c, conditions, params, "view", "pre.employee_id");
  return ok(c, { employees: (await c.env.DB.prepare(`SELECT pre.*, d.name AS department_name, l.name AS location_name FROM payroll_run_employees pre LEFT JOIN departments d ON d.id = pre.department_id LEFT JOIN locations l ON l.id = pre.location_id WHERE ${conditions.join(" AND ")} ORDER BY pre.employee_no_snapshot`).bind(...params).all()).results });
});

payrollRoutes.get("/runs/:id/employees/:runEmployeeId", requirePermission("payroll.view"), async (c) => {
  const row = await getRunEmployee(c, routeParam(c, "runEmployeeId"));
  if (!row) return fail(c, 404, "NOT_FOUND", "Payroll employee row was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(row.employee_id), "payroll", "view"))) return fail(c, 404, "NOT_FOUND", "Payroll employee row was not found.");
  return ok(c, { employee: row });
});

payrollRoutes.patch("/runs/:id/employees/:runEmployeeId", requirePermission("payroll.manage"), async (c) => {
  const id = routeParam(c, "runEmployeeId");
  const old = await getRunEmployee(c, id);
  if (!old) return fail(c, 404, "NOT_FOUND", "Payroll employee row was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(old.employee_id), "payroll", "manage"))) return fail(c, 404, "NOT_FOUND", "Payroll employee row was not found.");
  const body = await readJsonBody(c.req.raw);
  const status = readString(body.status ?? old.status).toUpperCase();
  await c.env.DB.prepare("UPDATE payroll_run_employees SET status = ?, hold_reason = ?, updated_at = ? WHERE id = ?").bind(RUN_EMPLOYEE_STATUSES.has(status) ? status : old.status, optionalString(body.hold_reason ?? old.hold_reason), isoNow(), id).run();
  const saved = await getRunEmployee(c, id);
  await auditPayroll(c, { action: "payroll.run_employee.updated", entityType: "payroll_run_employee", entityId: id, oldValue: old, newValue: saved });
  return ok(c, { employee: saved });
});

payrollRoutes.post("/runs/:id/employees/:runEmployeeId/hold", requirePermission("payroll.manage"), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const reason = optionalString(body.reason);
  if (!reason) return fail(c, 400, "VALIDATION_ERROR", "Hold reason is required.");
  const id = routeParam(c, "runEmployeeId");
  const old = await getRunEmployee(c, id);
  if (!old) return fail(c, 404, "NOT_FOUND", "Payroll employee row was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(old.employee_id), "payroll", "manage"))) return fail(c, 404, "NOT_FOUND", "Payroll employee row was not found.");
  await c.env.DB.prepare("UPDATE payroll_run_employees SET status = 'HELD', hold_reason = ?, updated_at = ? WHERE id = ?").bind(reason, isoNow(), id).run();
  await auditPayroll(c, { action: "payroll.run_employee.held", entityType: "payroll_run_employee", entityId: id, oldValue: old, reason });
  return ok(c, { employee: await getRunEmployee(c, id) });
});

payrollRoutes.post("/runs/:id/employees/:runEmployeeId/release-hold", requirePermission("payroll.manage"), async (c) => {
  const id = routeParam(c, "runEmployeeId");
  const old = await getRunEmployee(c, id);
  if (!old) return fail(c, 404, "NOT_FOUND", "Payroll employee row was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(old.employee_id), "payroll", "manage"))) return fail(c, 404, "NOT_FOUND", "Payroll employee row was not found.");
  await c.env.DB.prepare("UPDATE payroll_run_employees SET status = 'REVIEW', hold_reason = NULL, updated_at = ? WHERE id = ?").bind(isoNow(), id).run();
  await auditPayroll(c, { action: "payroll.run_employee.released", entityType: "payroll_run_employee", entityId: id, oldValue: old });
  return ok(c, { employee: await getRunEmployee(c, id) });
});

payrollRoutes.get("/runs/:id/employees/:runEmployeeId/lines", requirePermission("payroll.view"), async (c) => {
  const row = await getRunEmployee(c, routeParam(c, "runEmployeeId"));
  if (!row || !(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(row.employee_id), "payroll", "view"))) return fail(c, 404, "NOT_FOUND", "Payroll employee row was not found.");
  return ok(c, { lines: (await c.env.DB.prepare("SELECT prl.*, pc.code AS component_code, pc.name AS component_name FROM payroll_run_lines prl LEFT JOIN payroll_components pc ON pc.id = prl.payroll_component_id WHERE payroll_run_employee_id = ? ORDER BY line_type, category, description").bind(routeParam(c, "runEmployeeId")).all()).results });
});

payrollRoutes.get("/dashboard", requirePermission("payroll.view"), async (c) => {
  const currentPeriod = await c.env.DB.prepare("SELECT * FROM payroll_periods ORDER BY CASE status WHEN 'OPEN' THEN 0 WHEN 'PROCESSING' THEN 1 WHEN 'REVIEW' THEN 2 ELSE 3 END, period_year DESC, period_month DESC LIMIT 1").first();
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "payroll", "view", "e");
  const globalSummary = canUseGlobalPayrollRunSummary(c, scope);
  const scopedEmployeeSql = `SELECT e.id FROM employees e WHERE ${scope.sql}`;
  const draftRunsSql = globalSummary
    ? "(SELECT COUNT(*) FROM payroll_runs WHERE status = 'DRAFT')"
    : "(SELECT COUNT(DISTINCT pr.id) FROM payroll_runs pr INNER JOIN payroll_run_employees pre ON pre.payroll_run_id = pr.id WHERE pr.status = 'DRAFT' AND pre.employee_id IN (SELECT id FROM scoped_employees))";
  const approvedRunsSql = globalSummary
    ? "(SELECT COUNT(*) FROM payroll_runs WHERE status = 'APPROVED')"
    : "(SELECT COUNT(DISTINCT pr.id) FROM payroll_runs pr INNER JOIN payroll_run_employees pre ON pre.payroll_run_id = pr.id WHERE pr.status = 'APPROVED' AND pre.employee_id IN (SELECT id FROM scoped_employees))";
  const paidRunsSql = globalSummary
    ? "(SELECT COUNT(*) FROM payroll_runs WHERE status = 'PAID')"
    : "(SELECT COUNT(DISTINCT pr.id) FROM payroll_runs pr INNER JOIN payroll_run_employees pre ON pre.payroll_run_id = pr.id WHERE pr.status = 'PAID' AND pre.employee_id IN (SELECT id FROM scoped_employees))";
  const row = await c.env.DB.prepare(`WITH scoped_employees AS (${scopedEmployeeSql}) SELECT
    (SELECT status FROM payroll_periods ORDER BY period_year DESC, period_month DESC LIMIT 1) AS current_payroll_period_status,
    ${draftRunsSql} AS draft_payroll_runs,
    ${approvedRunsSql} AS approved_payroll_runs,
    ${paidRunsSql} AS paid_payroll_runs,
    (SELECT COALESCE(SUM(pre.net_salary), 0) FROM payroll_run_employees pre INNER JOIN payroll_runs pr ON pr.id = pre.payroll_run_id INNER JOIN payroll_periods pp ON pp.id = pr.payroll_period_id WHERE pre.employee_id IN (SELECT id FROM scoped_employees) AND pp.id = (SELECT id FROM payroll_periods ORDER BY period_year DESC, period_month DESC LIMIT 1)) AS total_payroll_amount_current_period,
    (SELECT COUNT(*) FROM payroll_advance_payments WHERE employee_id IN (SELECT id FROM scoped_employees) AND status IN ('REQUESTED', 'APPROVED')) AS advance_payments_pending,
    (SELECT COUNT(*) FROM employee_payroll_profiles WHERE employee_id IN (SELECT id FROM scoped_employees) AND payroll_included = 0) AS employees_excluded_from_payroll,
    (SELECT COUNT(*) FROM attendance_daily_records WHERE employee_id IN (SELECT id FROM scoped_employees) AND status = 'ABSENT') AS attendance_deduction_candidates,
    (SELECT COUNT(*) FROM leave_request_days lrd INNER JOIN leave_requests lr ON lr.id = lrd.leave_request_id LEFT JOIN leave_policies lp ON lp.id = lr.policy_id WHERE lr.employee_id IN (SELECT id FROM scoped_employees) AND lr.status = 'APPROVED' AND lp.salary_deduction_mode != 'NONE') AS leave_deduction_candidates,
    (SELECT COUNT(*) FROM payroll_run_employees WHERE employee_id IN (SELECT id FROM scoped_employees) AND status = 'HELD') AS payroll_holds`).bind(...scope.params).first();
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

payrollRoutes.get("/reports", requirePermission("payroll.reports.view"), async (c) => {
  const { conditions, params } = await payrollReportFilters(c);
  const rows = await c.env.DB.prepare(`SELECT pp.period_month, pp.period_year, pre.employee_id, pre.employee_no_snapshot, pre.employee_name_snapshot, d.name AS department_name, l.name AS location_name, pre.basic_salary, pre.advance_deductions, pre.days_worked, pre.missed_date_ranges_json, pre.total_deductions, pre.net_salary, pre.status FROM payroll_run_employees pre INNER JOIN payroll_runs pr ON pr.id = pre.payroll_run_id INNER JOIN payroll_periods pp ON pp.id = pr.payroll_period_id LEFT JOIN departments d ON d.id = pre.department_id LEFT JOIN locations l ON l.id = pre.location_id WHERE ${conditions.join(" AND ")} ORDER BY pp.period_year DESC, pp.period_month DESC, pre.employee_no_snapshot LIMIT 1000`).bind(...params).all();
  return ok(c, { reports: rows.results });
});

async function payrollReportCsv(c: Context<AppBindings>, runId?: string) {
  const { conditions, params } = await payrollReportFilters(c, runId);
  const rows = (await c.env.DB.prepare(`SELECT pp.period_month, pp.period_year, pre.employee_no_snapshot, pre.employee_name_snapshot, d.name AS department_name, l.name AS location_name, pre.basic_salary, pre.advance_deductions, pre.days_worked, pre.missed_date_ranges_json, pre.total_deductions, pre.net_salary, pre.status FROM payroll_run_employees pre INNER JOIN payroll_runs pr ON pr.id = pre.payroll_run_id INNER JOIN payroll_periods pp ON pp.id = pr.payroll_period_id LEFT JOIN departments d ON d.id = pre.department_id LEFT JOIN locations l ON l.id = pre.location_id WHERE ${conditions.join(" AND ")} ORDER BY pre.employee_no_snapshot`).bind(...params).all<Record<string, unknown>>()).results;
  await auditPayroll(c, { action: "payroll.report_exported", entityType: "payroll_report", entityId: runId ?? "payroll_summary", newValue: { rows: rows.length } });
  const header = ["period_month", "period_year", "employee_no_snapshot", "employee_name_snapshot", "department_name", "location_name", "basic_salary", "advance_deductions", "days_worked", "missed_date_ranges_json", "total_deductions", "net_salary", "status"];
  const csv = [header.join(","), ...rows.map((row) => header.map((key) => csvEscape(row[key])).join(","))].join("\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename=${runId ? "payroll-run" : "payroll-report"}.csv` } });
}

payrollRoutes.get("/reports/export.csv", requirePermission("payroll.reports.export"), (c) => payrollReportCsv(c));
payrollRoutes.get("/runs/:id/export.csv", requirePermission("payroll.reports.export"), (c) => payrollReportCsv(c, routeParam(c, "id")));

payrollRoutes.get("/final-settlements", requirePermission("payroll.view"), async (c) => {
  const conditions = ["1 = 1"];
  const params: BindValue[] = [];
  await scopedEmployeeFilter(c, conditions, params);
  const rows = (await c.env.DB.prepare(`SELECT fs.*, e.employee_no, e.full_name AS employee_name FROM final_settlements fs INNER JOIN employees e ON e.id = fs.employee_id WHERE ${conditions.join(" AND ")} ORDER BY fs.created_at DESC LIMIT 500`).bind(...params).all()).results;
  return ok(c, { final_settlements: rows, settlements: rows });
});

payrollRoutes.post("/final-settlements", requirePermission("payroll.manage"), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const employeeId = readString(body.employee_id);
  if (!employeeId) return fail(c, 400, "VALIDATION_ERROR", "Employee is required.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "payroll", "manage"))) return fail(c, 403, "FORBIDDEN", "You do not have payroll access to this employee.");
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO final_settlements (id, employee_id, payroll_period_id, final_salary_amount, pending_advance_amount, pending_deduction_amount, leave_encashment_amount, asset_recovery_amount, net_settlement_amount, status, reason, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, employeeId, optionalString(body.payroll_period_id), num(body.final_salary_amount), num(body.pending_advance_amount), num(body.pending_deduction_amount), num(body.leave_encashment_amount), num(body.asset_recovery_amount), num(body.net_settlement_amount), FINAL_SETTLEMENT_STATUSES.has(readString(body.status).toUpperCase()) ? readString(body.status).toUpperCase() : "DRAFT", optionalString(body.reason), c.get("currentUser").id).run();
  const saved = await c.env.DB.prepare("SELECT * FROM final_settlements WHERE id = ?").bind(id).first();
  await auditPayroll(c, { action: "payroll.final_settlement.created", entityType: "final_settlement", entityId: id, newValue: saved });
  return ok(c, { final_settlement: saved }, 201);
});

payrollRoutes.patch("/final-settlements/:id", requirePermission("payroll.manage"), async (c) => {
  const id = routeParam(c, "id");
  const old = await c.env.DB.prepare("SELECT * FROM final_settlements WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!old) return fail(c, 404, "NOT_FOUND", "Final settlement was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(old.employee_id), "payroll", "manage"))) return fail(c, 404, "NOT_FOUND", "Final settlement was not found.");
  const body = await readJsonBody(c.req.raw);
  const status = readString(body.status ?? old.status).toUpperCase();
  await c.env.DB.prepare("UPDATE final_settlements SET payroll_period_id = ?, final_salary_amount = ?, pending_advance_amount = ?, pending_deduction_amount = ?, leave_encashment_amount = ?, asset_recovery_amount = ?, net_settlement_amount = ?, status = ?, reason = ?, updated_at = ? WHERE id = ?").bind(optionalString(body.payroll_period_id ?? old.payroll_period_id), num(body.final_salary_amount, old.final_salary_amount == null ? null : Number(old.final_salary_amount)), num(body.pending_advance_amount, old.pending_advance_amount == null ? null : Number(old.pending_advance_amount)), num(body.pending_deduction_amount, old.pending_deduction_amount == null ? null : Number(old.pending_deduction_amount)), num(body.leave_encashment_amount, old.leave_encashment_amount == null ? null : Number(old.leave_encashment_amount)), num(body.asset_recovery_amount, old.asset_recovery_amount == null ? null : Number(old.asset_recovery_amount)), num(body.net_settlement_amount, old.net_settlement_amount == null ? null : Number(old.net_settlement_amount)), FINAL_SETTLEMENT_STATUSES.has(status) ? status : old.status, optionalString(body.reason ?? old.reason), isoNow(), id).run();
  const saved = await c.env.DB.prepare("SELECT * FROM final_settlements WHERE id = ?").bind(id).first();
  await auditPayroll(c, { action: "payroll.final_settlement.updated", entityType: "final_settlement", entityId: id, oldValue: old, newValue: saved });
  return ok(c, { final_settlement: saved });
});
