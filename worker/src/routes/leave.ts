import { Hono } from "hono";
import type { Context } from "hono";
import { buildEmployeeScopeWhereClause, canAccessEmployee } from "../auth/access-scopes";
import { recordAudit } from "../db/audit";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { publishAccessEvent } from "../realtime/publisher";
import type { AppBindings } from "../types";
import { fail, getClientIp, ok } from "../utils/http";
import { readJsonBody, readString } from "../utils/validation";

type BindValue = string | number | null;
type LeaveStatus = "DRAFT" | "SUBMITTED" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "CANCELLED";
type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "SKIPPED";
type DeductionMode = "NONE" | "FULL_DAY" | "WORKED_DAYS_ONLY" | "CUSTOM" | "NO_DEDUCTION" | "DEDUCT_FROM_BASIC_SALARY" | "DEDUCT_FROM_GROSS_SALARY" | "DEDUCT_FROM_SELECTED_ALLOWANCE" | "FIXED_AMOUNT_PER_DAY" | "DAILY_RATE_FORMULA" | "DEDUCT_AFTER_ENTITLEMENT_EXHAUSTED" | "PAY_ONLY_WORKED_DAYS";

const EMPLOYEE_TYPES = new Set(["LOCAL", "FOREIGN", "OTHER"]);
const EMPLOYMENT_TYPES = new Set(["FULL_TIME", "PART_TIME", "INTERN", "TEMPORARY", "CONTRACT"]);
const DEDUCTION_MODES = new Set(["NONE", "FULL_DAY", "WORKED_DAYS_ONLY", "CUSTOM", "NO_DEDUCTION", "DEDUCT_FROM_BASIC_SALARY", "DEDUCT_FROM_GROSS_SALARY", "DEDUCT_FROM_SELECTED_ALLOWANCE", "FIXED_AMOUNT_PER_DAY", "DAILY_RATE_FORMULA", "DEDUCT_AFTER_ENTITLEMENT_EXHAUSTED", "PAY_ONLY_WORKED_DAYS"]);
const APPROVER_TYPES = new Set(["ROLE", "USER", "REPORTING_MANAGER", "DEPARTMENT_MANAGER", "DEPARTMENT_SENIOR", "DIRECTOR", "HR_ROLE", "PERMISSION", "DEPARTMENT_HEAD", "LOCATION_MANAGER", "HR_MANAGER", "FINANCE_MANAGER", "OWNER"]);

export const leaveRoutes = new Hono<AppBindings>();
export const employeeLeaveRoutes = new Hono<AppBindings>();

leaveRoutes.use("*", requireAuth);
employeeLeaveRoutes.use("*", requireAuth);

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
  return typeof value === "boolean" ? value : typeof value === "number" ? value === 1 : fallback;
}

function has(c: Context<AppBindings>, permission: string) {
  return c.get("currentUser").permissions.includes(permission);
}

function hasAny(c: Context<AppBindings>, permissions: string[]) {
  return permissions.some((permission) => has(c, permission));
}

export function permissionMatchesLegacyOrGranularLeaveKey(userPermissions: string[], legacy: string, granular: string | string[]) {
  const granularKeys = Array.isArray(granular) ? granular : [granular];
  return userPermissions.includes(legacy) || granularKeys.some((permission) => userPermissions.includes(permission));
}

function hasLeavePermission(c: Context<AppBindings>, legacy: string, granular: string | string[]) {
  return permissionMatchesLegacyOrGranularLeaveKey(c.get("currentUser").permissions, legacy, granular);
}

async function auditLeave(c: Context<AppBindings>, input: { action: string; entityType: string; entityId: string; oldValue?: unknown; newValue?: unknown; reason?: string | null }) {
  await recordAudit(c.env.DB, {
    actorUserId: c.get("currentUser").id,
    action: input.action,
    module: "leave",
    entityType: input.entityType,
    entityId: input.entityId,
    oldValue: input.oldValue,
    newValue: input.newValue,
    reason: input.reason,
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent") ?? null
  });
}

async function publishLeave(c: Context<AppBindings>, event: "leave.changed" | "leave.request.created" | "leave.request.submitted" | "leave.request.approved" | "leave.request.rejected" | "leave.request.cancelled" | "leave.approval.pending" | "leave.balance.updated" | "employee.leave.changed", entityId: string, action: string, entityType: "leave_request" | "leave_balance" = "leave_request") {
  await publishAccessEvent(c.env, event, { actor_user_id: c.get("currentUser").id, entity_type: entityType, entity_id: entityId, action });
  if (event !== "leave.changed") await publishAccessEvent(c.env, "leave.changed", { actor_user_id: c.get("currentUser").id, entity_type: entityType, entity_id: entityId, action });
}

function selectColumns() {
  return `lr.*, e.employee_no, e.full_name AS employee_name, e.employee_type, e.employment_type,
    e.user_id AS employee_user_id, e.reporting_manager_employee_id,
    e.primary_department_id AS department_id, d.name AS department_name,
    e.primary_position_id AS position_id, p.title AS position_title,
    e.primary_location_id AS location_id, l.name AS location_name,
    lt.code AS leave_type_code, lt.name AS leave_type_name,
    lp.name AS policy_name,
    pending.step_name AS current_approval_step,
    pending.approver_user_id AS current_approver_user_id`;
}

async function getRequest(db: AppBindings["Bindings"]["DB"], id: string) {
  return db
    .prepare(
      `SELECT ${selectColumns()}
       FROM leave_requests lr
       INNER JOIN employees e ON e.id = lr.employee_id
       INNER JOIN leave_types lt ON lt.id = lr.leave_type_id
       LEFT JOIN leave_policies lp ON lp.id = lr.policy_id
       LEFT JOIN departments d ON d.id = e.primary_department_id
       LEFT JOIN positions p ON p.id = e.primary_position_id
       LEFT JOIN locations l ON l.id = e.primary_location_id
       LEFT JOIN leave_request_approvals pending ON pending.id = (
         SELECT id FROM leave_request_approvals
         WHERE leave_request_id = lr.id AND status = 'PENDING'
         ORDER BY step_order LIMIT 1
       )
       WHERE lr.id = ?`
    )
    .bind(id)
    .first<Record<string, unknown>>();
}

async function getEmployee(db: AppBindings["Bindings"]["DB"], id: string) {
  return db
    .prepare(
      `SELECT e.*, d.name AS department_name, p.title AS position_title, l.name AS location_name
       FROM employees e
       LEFT JOIN departments d ON d.id = e.primary_department_id
       LEFT JOIN positions p ON p.id = e.primary_position_id
       LEFT JOIN locations l ON l.id = e.primary_location_id
       WHERE e.id = ? AND e.archived_at IS NULL`
    )
    .bind(id)
    .first<Record<string, string | null>>();
}

function addRange(c: Context<AppBindings>, conditions: string[], params: BindValue[], prefix: string, column: string) {
  const from = readString(c.req.query(`${prefix}_from`));
  const to = readString(c.req.query(`${prefix}_to`));
  if (from) {
    conditions.push(`${column} >= ?`);
    params.push(from);
  }
  if (to) {
    conditions.push(`${column} <= ?`);
    params.push(to);
  }
}

function daysBetween(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end.getTime() < start.getTime()) return null;
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function findPolicy(db: AppBindings["Bindings"]["DB"], employee: Record<string, string | null>, leaveTypeId: string) {
  return db
    .prepare(
      `SELECT lp.*, lt.name AS leave_type_name, lt.code AS leave_type_code
       FROM leave_policies lp
       INNER JOIN leave_types lt ON lt.id = lp.leave_type_id
       WHERE lp.leave_type_id = ? AND lp.is_active = 1
         AND (lp.applies_to_employee_type IS NULL OR lp.applies_to_employee_type = ?)
         AND (lp.applies_to_employment_type IS NULL OR lp.applies_to_employment_type = ?)
         AND (lp.department_id IS NULL OR lp.department_id = ?)
         AND (lp.position_id IS NULL OR lp.position_id = ?)
         AND (lp.location_id IS NULL OR lp.location_id = ?)
       ORDER BY lp.priority ASC, lp.created_at ASC
       LIMIT 1`
    )
    .bind(leaveTypeId, employee.employee_type, employee.employment_type, employee.primary_department_id, employee.primary_position_id, employee.primary_location_id)
    .first<Record<string, unknown>>();
}

async function ensureBalance(c: Context<AppBindings>, employeeId: string, leaveTypeId: string, year: number, entitlement: number) {
  const existing = await c.env.DB.prepare("SELECT * FROM leave_balances WHERE employee_id = ? AND leave_type_id = ? AND period_year = ?").bind(employeeId, leaveTypeId, year).first<Record<string, number | string>>();
  if (existing) return existing;
  const id = crypto.randomUUID();
  await c.env.DB
    .prepare(
      `INSERT INTO leave_balances
       (id, employee_id, leave_type_id, period_year, accrued_days, closing_balance)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(id, employeeId, leaveTypeId, year, entitlement, entitlement)
    .run();
  return c.env.DB.prepare("SELECT * FROM leave_balances WHERE id = ?").bind(id).first<Record<string, number | string>>();
}

async function updateBalance(c: Context<AppBindings>, request: Record<string, unknown>, mode: "pending_add" | "pending_release" | "approve" | "cancel_approved") {
  await applyLeaveBalanceChange(c, request, mode);
  const employeeId = String(request.employee_id);
  const leaveTypeId = String(request.leave_type_id);
  const year = Number(String(request.start_date).slice(0, 4));
  const requested = Number(request.requested_days ?? 0);
  const policy = request.policy_id ? await c.env.DB.prepare("SELECT annual_entitlement_days FROM leave_policies WHERE id = ?").bind(String(request.policy_id)).first<{ annual_entitlement_days: number | null }>() : null;
  await ensureBalance(c, employeeId, leaveTypeId, year, Number(policy?.annual_entitlement_days ?? 0));
  let clause = "";
  if (mode === "pending_add") clause = "pending_days = pending_days + ?";
  if (mode === "pending_release") clause = "pending_days = MAX(0, pending_days - ?)";
  if (mode === "approve") clause = "pending_days = MAX(0, pending_days - ?), used_days = used_days + ?";
  if (mode === "cancel_approved") clause = "used_days = MAX(0, used_days - ?)";
  const params: BindValue[] = mode === "approve" ? [requested, requested] : [requested];
  await c.env.DB
    .prepare(`UPDATE leave_balances SET ${clause}, closing_balance = opening_balance + accrued_days + adjusted_days + carried_forward_days - used_days - pending_days - expired_days, updated_at = ? WHERE employee_id = ? AND leave_type_id = ? AND period_year = ?`)
    .bind(...params, new Date().toISOString(), employeeId, leaveTypeId, year)
    .run();
  await c.env.DB
    .prepare("UPDATE leave_balances SET closing_balance = opening_balance + accrued_days + adjusted_days + carried_forward_days - used_days - pending_days - expired_days, updated_at = ? WHERE employee_id = ? AND leave_type_id = ? AND period_year = ?")
    .bind(new Date().toISOString(), employeeId, leaveTypeId, year)
    .run();
  await auditLeave(c, { action: "leave.balance.updated", entityType: "leave_balance", entityId: `${employeeId}:${leaveTypeId}:${year}`, newValue: { mode, requested } });
  await publishLeave(c, "leave.balance.updated", employeeId, "balance_updated", "leave_balance");
}

async function generateDays(c: Context<AppBindings>, requestId: string, employeeId: string, startDate: string, endDate: string, halfDayType: string | null, includeWeeklyOff: boolean) {
  await c.env.DB.prepare("DELETE FROM leave_request_days WHERE leave_request_id = ?").bind(requestId).run();
  const calculated = await calculateLeaveDays(c, { employeeId, startDate, endDate, halfDayType, includeWeeklyOff });
  const statements = [];
  for (const day of calculated?.days ?? []) {
    statements.push(
      c.env.DB
        .prepare("INSERT INTO leave_request_days (id, leave_request_id, leave_date, day_type, counted_as_leave, payroll_impact_json) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), requestId, day.leave_date, day.day_type, day.counted_as_leave, JSON.stringify({ leave_count: day.leave_count, foundation: "attendance/payroll integration later" }))
    );
  }
  if (statements.length) await c.env.DB.batch(statements);
}

async function calculateRequestedDays(c: Context<AppBindings>, startDate: string, endDate: string, halfDayType: string | null, includeWeeklyOff: boolean) {
  const total = daysBetween(startDate, endDate);
  if (!total) return null;
  let counted = 0;
  const start = new Date(`${startDate}T00:00:00Z`);
  for (let index = 0; index < total; index += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const weekend = date.getUTCDay() === 5 || date.getUTCDay() === 6;
    if (!weekend || includeWeeklyOff) counted += 1;
  }
  if (total === 1 && halfDayType && halfDayType !== "NONE") counted = 0.5;
  return { total, counted };
}

export async function getAttendanceDayOverridesForRange(c: Context<AppBindings>, employeeId: string, startDate: string, endDate: string) {
  const rows = await c.env.DB
    .prepare(
      `SELECT * FROM attendance_day_overrides
       WHERE employee_id = ? AND affects_leave_calculation = 1
         AND override_date BETWEEN ? AND ?
       ORDER BY override_date`
    )
    .bind(employeeId, startDate, endDate)
    .all<Record<string, unknown>>();
  return rows.results;
}

export async function applyLeaveDayCountingPolicy(input: {
  startDate: string;
  endDate: string;
  halfDayType: string | null;
  includeWeeklyOff: boolean;
  attendanceOverrides: Record<string, unknown>[];
}) {
  const total = daysBetween(input.startDate, input.endDate);
  if (!total) return null;
  const overrideByDate = new Map(input.attendanceOverrides.map((row) => [String(row.override_date), row]));
  const start = new Date(`${input.startDate}T00:00:00Z`);
  let counted = 0;
  const days: Array<{ leave_date: string; day_type: string; counted_as_leave: number; leave_count: number }> = [];
  for (let index = 0; index < total; index += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const leaveDate = isoDate(date);
    const override = overrideByDate.get(leaveDate);
    const weekend = date.getUTCDay() === 5 || date.getUTCDay() === 6;
    const singleHalf = total === 1 && input.halfDayType && input.halfDayType !== "NONE";
    const dayType = singleHalf ? "HALF_DAY" : override ? String(override.day_type) : weekend ? "WEEKLY_OFF" : "FULL_DAY";
    let leaveCount = singleHalf ? 0.5 : dayType === "WEEKLY_OFF" ? (input.includeWeeklyOff ? 1 : 0) : dayType === "PUBLIC_HOLIDAY" ? 0 : 1;
    if (override?.leave_count_multiplier !== undefined && override.leave_count_multiplier !== null) leaveCount = Number(override.leave_count_multiplier);
    counted += leaveCount;
    days.push({ leave_date: leaveDate, day_type: dayType, counted_as_leave: leaveCount > 0 ? 1 : 0, leave_count: leaveCount });
  }
  return { total, counted, chargeable_days: counted, calendar_days: total, days };
}

export async function calculateLeaveDays(c: Context<AppBindings>, input: { employeeId: string; startDate: string; endDate: string; halfDayType: string | null; includeWeeklyOff: boolean }) {
  const overrides = await getAttendanceDayOverridesForRange(c, input.employeeId, input.startDate, input.endDate);
  return applyLeaveDayCountingPolicy({ startDate: input.startDate, endDate: input.endDate, halfDayType: input.halfDayType, includeWeeklyOff: input.includeWeeklyOff, attendanceOverrides: overrides });
}

export async function getCurrentLeaveCycle(c: Context<AppBindings>, employeeId: string, leaveTypeId: string, year: number, entitlement = 0) {
  const existing = await c.env.DB.prepare("SELECT * FROM leave_balance_cycles WHERE employee_id = ? AND leave_type_id = ? AND cycle_year = ?").bind(employeeId, leaveTypeId, year).first<Record<string, unknown>>();
  if (existing) return existing;
  const id = crypto.randomUUID();
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  await c.env.DB
    .prepare(
      `INSERT INTO leave_balance_cycles
       (id, employee_id, leave_type_id, cycle_year, cycle_start_date, cycle_end_date, accrued_days, closing_balance)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, employeeId, leaveTypeId, year, start, end, entitlement, entitlement)
    .run();
  return c.env.DB.prepare("SELECT * FROM leave_balance_cycles WHERE id = ?").bind(id).first<Record<string, unknown>>();
}

function cycleSnapshot(row: Record<string, unknown> | null | undefined) {
  if (!row) return null;
  return {
    opening_balance: Number(row.opening_balance ?? 0),
    accrued_days: Number(row.accrued_days ?? 0),
    used_days: Number(row.used_days ?? 0),
    pending_days: Number(row.pending_days ?? 0),
    adjusted_days: Number(row.adjusted_days ?? 0),
    carried_forward_days: Number(row.carried_forward_days ?? 0),
    expired_days: Number(row.expired_days ?? 0),
    closing_balance: Number(row.closing_balance ?? 0)
  };
}

export async function refreshLeaveBalanceCycle(c: Context<AppBindings>, cycleId: string) {
  await c.env.DB
    .prepare(
      `UPDATE leave_balance_cycles
       SET closing_balance = opening_balance + accrued_days + adjusted_days + carried_forward_days - used_days - pending_days - expired_days,
           updated_at = ?
       WHERE id = ?`
    )
    .bind(new Date().toISOString(), cycleId)
    .run();
  return c.env.DB.prepare("SELECT * FROM leave_balance_cycles WHERE id = ?").bind(cycleId).first<Record<string, unknown>>();
}

export async function createLeaveLedgerEntry(c: Context<AppBindings>, input: { cycleId: string; employeeId: string; leaveTypeId: string; leaveRequestId?: string | null; entryType: string; days: number; before?: unknown; after?: unknown; reason?: string | null }) {
  const id = crypto.randomUUID();
  await c.env.DB
    .prepare(
      `INSERT INTO leave_balance_ledger_entries
       (id, cycle_id, employee_id, leave_type_id, leave_request_id, entry_type, days, balance_before_json, balance_after_json, reason, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, input.cycleId, input.employeeId, input.leaveTypeId, input.leaveRequestId ?? null, input.entryType, input.days, input.before ? JSON.stringify(input.before) : null, input.after ? JSON.stringify(input.after) : null, input.reason ?? null, c.get("currentUser").id)
    .run();
  return id;
}

export async function applyLeaveBalanceChange(c: Context<AppBindings>, request: Record<string, unknown>, mode: "pending_add" | "pending_release" | "approve" | "cancel_approved") {
  const employeeId = String(request.employee_id);
  const leaveTypeId = String(request.leave_type_id);
  const year = Number(String(request.start_date).slice(0, 4));
  const requested = Number(request.requested_days ?? 0);
  const policy = request.policy_id ? await c.env.DB.prepare("SELECT annual_entitlement_days FROM leave_policies WHERE id = ?").bind(String(request.policy_id)).first<{ annual_entitlement_days: number | null }>() : null;
  const cycle = await getCurrentLeaveCycle(c, employeeId, leaveTypeId, year, Number(policy?.annual_entitlement_days ?? 0));
  if (!cycle) return;
  const before = cycleSnapshot(cycle);
  let clause = "";
  let params: BindValue[] = [];
  let entryType = "ADJUSTMENT";
  if (mode === "pending_add") {
    clause = "pending_days = pending_days + ?";
    params = [requested];
    entryType = "PENDING_HOLD";
  }
  if (mode === "pending_release") {
    clause = "pending_days = MAX(0, pending_days - ?)";
    params = [requested];
    entryType = "PENDING_RELEASE";
  }
  if (mode === "approve") {
    clause = "pending_days = MAX(0, pending_days - ?), used_days = used_days + ?";
    params = [requested, requested];
    entryType = "USED";
  }
  if (mode === "cancel_approved") {
    clause = "used_days = MAX(0, used_days - ?)";
    params = [requested];
    entryType = "USED_REVERSAL";
  }
  await c.env.DB.prepare(`UPDATE leave_balance_cycles SET ${clause}, updated_at = ? WHERE id = ?`).bind(...params, new Date().toISOString(), String(cycle.id)).run();
  const after = await refreshLeaveBalanceCycle(c, String(cycle.id));
  await createLeaveLedgerEntry(c, { cycleId: String(cycle.id), employeeId, leaveTypeId, leaveRequestId: String(request.id ?? ""), entryType, days: requested, before, after: cycleSnapshot(after), reason: mode });
}

export async function calculateLeavePayrollImpact(policy: Record<string, unknown> | null, requestedDays: number) {
  return salaryEstimate(policy, requestedDays);
}

export async function getSelfServiceLeaveCycles(c: Context<AppBindings>, employeeId: string) {
  const rows = await c.env.DB
    .prepare(
      `SELECT lbc.*, lt.name AS leave_type_name, lt.code AS leave_type_code
       FROM leave_balance_cycles lbc
       INNER JOIN leave_types lt ON lt.id = lbc.leave_type_id
       WHERE lbc.employee_id = ?
       ORDER BY lbc.cycle_year DESC, lt.sort_order, lt.name`
    )
    .bind(employeeId)
    .all<Record<string, unknown>>();
  const ledger = await c.env.DB
    .prepare(
      `SELECT lle.*, lt.name AS leave_type_name, lt.code AS leave_type_code
       FROM leave_balance_ledger_entries lle
       INNER JOIN leave_types lt ON lt.id = lle.leave_type_id
       WHERE lle.employee_id = ?
       ORDER BY lle.created_at DESC
       LIMIT 20`
    )
    .bind(employeeId)
    .all<Record<string, unknown>>();
  return { balance_cycles: rows.results, ledger_recent: ledger.results };
}

export async function getEmployeeLeaveCycleSummary(c: Context<AppBindings>, employeeId: string) {
  return getSelfServiceLeaveCycles(c, employeeId);
}

async function hasOverlap(c: Context<AppBindings>, employeeId: string, startDate: string, endDate: string, exceptId?: string) {
  const row = await c.env.DB
    .prepare(
      `SELECT id FROM leave_requests
       WHERE employee_id = ? AND status NOT IN ('REJECTED', 'CANCELLED')
         AND (? <= end_date AND ? >= start_date)
         ${exceptId ? "AND id != ?" : ""}
       LIMIT 1`
    )
    .bind(...(exceptId ? [employeeId, startDate, endDate, exceptId] : [employeeId, startDate, endDate]))
    .first<{ id: string }>();
  return Boolean(row);
}

function documentRequired(policy: Record<string, unknown> | null, requestedDays: number) {
  if (!policy) return false;
  if (Number(policy.requires_document) === 1) return true;
  const consecutive = Number(policy.document_required_after_consecutive_days ?? 0);
  return consecutive > 0 && requestedDays > consecutive;
}

function salaryEstimate(policy: Record<string, unknown> | null, requestedDays: number) {
  const mode = (String(policy?.salary_deduction_mode ?? "NONE") as DeductionMode);
  return {
    mode,
    estimated_days: mode === "NONE" ? 0 : requestedDays,
    pay_component: policy?.deduction_pay_component ?? null,
    foundation: "Final payroll calculation is deferred to Payroll module."
  };
}

function readTypeBody(body: Record<string, unknown>) {
  return {
    code: readString(body.code).toUpperCase().replace(/[^A-Z0-9_]/g, "_"),
    name: readString(body.name),
    description: optionalString(body.description),
    is_paid_default: bool(body.is_paid_default, true),
    is_statutory: bool(body.is_statutory, false),
    sort_order: num(body.sort_order, 100) ?? 100
  };
}

leaveRoutes.get("/types", requirePermission("leave.view"), async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM leave_types ORDER BY is_active DESC, sort_order, name").all();
  return ok(c, { leave_types: rows.results });
});

leaveRoutes.get("/types/:id", requirePermission("leave.view"), async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM leave_types WHERE id = ?").bind(routeParam(c, "id")).first();
  if (!row) return fail(c, 404, "NOT_FOUND", "Leave type was not found.");
  return ok(c, { leave_type: row });
});

leaveRoutes.post("/types", requirePermission("leave.settings.manage"), async (c) => {
  const input = readTypeBody(await readJsonBody(c.req.raw));
  if (!input.code || !input.name) return fail(c, 400, "VALIDATION_ERROR", "Code and name are required.");
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO leave_types (id, code, name, description, is_paid_default, is_statutory, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, input.code, input.name, input.description, input.is_paid_default ? 1 : 0, input.is_statutory ? 1 : 0, input.sort_order).run();
  await auditLeave(c, { action: "leave.type.created", entityType: "leave_type", entityId: id, newValue: input });
  return ok(c, { leave_type: { id, ...input, is_active: true } }, 201);
});

leaveRoutes.patch("/types/:id", requirePermission("leave.settings.manage"), async (c) => {
  const id = routeParam(c, "id");
  const old = await c.env.DB.prepare("SELECT * FROM leave_types WHERE id = ?").bind(id).first();
  if (!old) return fail(c, 404, "NOT_FOUND", "Leave type was not found.");
  const input = readTypeBody(await readJsonBody(c.req.raw));
  if (!input.code || !input.name) return fail(c, 400, "VALIDATION_ERROR", "Code and name are required.");
  await c.env.DB.prepare("UPDATE leave_types SET code = ?, name = ?, description = ?, is_paid_default = ?, is_statutory = ?, sort_order = ?, updated_at = ? WHERE id = ?").bind(input.code, input.name, input.description, input.is_paid_default ? 1 : 0, input.is_statutory ? 1 : 0, input.sort_order, new Date().toISOString(), id).run();
  const updated = await c.env.DB.prepare("SELECT * FROM leave_types WHERE id = ?").bind(id).first();
  await auditLeave(c, { action: "leave.type.updated", entityType: "leave_type", entityId: id, oldValue: old, newValue: updated });
  return ok(c, { leave_type: updated });
});

async function leaveTypeActive(c: Context<AppBindings>, active: 0 | 1) {
  const id = routeParam(c, "id");
  const old = await c.env.DB.prepare("SELECT * FROM leave_types WHERE id = ?").bind(id).first();
  if (!old) return fail(c, 404, "NOT_FOUND", "Leave type was not found.");
  await c.env.DB.prepare("UPDATE leave_types SET is_active = ?, updated_at = ? WHERE id = ?").bind(active, new Date().toISOString(), id).run();
  await auditLeave(c, { action: active ? "leave.type.enabled" : "leave.type.disabled", entityType: "leave_type", entityId: id, oldValue: old, newValue: { is_active: active === 1 } });
  return ok(c, { enabled: active === 1 });
}

leaveRoutes.post("/types/:id/enable", requirePermission("leave.settings.manage"), (c) => leaveTypeActive(c, 1));
leaveRoutes.post("/types/:id/disable", requirePermission("leave.settings.manage"), (c) => leaveTypeActive(c, 0));

function readPolicyBody(body: Record<string, unknown>) {
  const employeeType = optionalString(body.applies_to_employee_type);
  const employmentType = optionalString(body.applies_to_employment_type);
  const mode = readString(body.salary_deduction_mode) || "NONE";
  return {
    leave_type_id: readString(body.leave_type_id),
    name: readString(body.name),
    applies_to_employee_type: employeeType && EMPLOYEE_TYPES.has(employeeType) ? employeeType : null,
    applies_to_employment_type: employmentType && EMPLOYMENT_TYPES.has(employmentType) ? employmentType : null,
    department_id: optionalString(body.department_id),
    position_id: optionalString(body.position_id),
    location_id: optionalString(body.location_id),
    annual_entitlement_days: num(body.annual_entitlement_days),
    allow_half_day: bool(body.allow_half_day, true),
    allow_carry_forward: bool(body.allow_carry_forward),
    carry_forward_limit_days: num(body.carry_forward_limit_days),
    carry_forward_expiry_month: num(body.carry_forward_expiry_month),
    include_public_holidays: bool(body.include_public_holidays),
    include_weekly_off_days: bool(body.include_weekly_off_days),
    salary_deduction_mode: DEDUCTION_MODES.has(mode) ? mode : "NONE",
    deduction_pay_component: optionalString(body.deduction_pay_component),
    requires_document: bool(body.requires_document),
    document_required_after_consecutive_days: num(body.document_required_after_consecutive_days),
    document_required_after_used_days: num(body.document_required_after_used_days),
    max_consecutive_days: num(body.max_consecutive_days),
    min_notice_days: num(body.min_notice_days),
    long_leave_threshold_days: num(body.long_leave_threshold_days),
    priority: num(body.priority, 100) ?? 100
  };
}

leaveRoutes.get("/policies", requirePermission("leave.view"), async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT lp.*, lt.name AS leave_type_name, lt.code AS leave_type_code,
      d.name AS department_name, p.title AS position_title, l.name AS location_name
     FROM leave_policies lp
     INNER JOIN leave_types lt ON lt.id = lp.leave_type_id
     LEFT JOIN departments d ON d.id = lp.department_id
     LEFT JOIN positions p ON p.id = lp.position_id
     LEFT JOIN locations l ON l.id = lp.location_id
     ORDER BY lp.is_active DESC, lp.priority, lp.name`
  ).all();
  return ok(c, { policies: rows.results });
});

leaveRoutes.get("/policies/:id", requirePermission("leave.view"), async (c) => {
  const policy = await c.env.DB.prepare("SELECT * FROM leave_policies WHERE id = ?").bind(routeParam(c, "id")).first();
  if (!policy) return fail(c, 404, "NOT_FOUND", "Leave policy was not found.");
  return ok(c, { policy });
});

leaveRoutes.post("/policies", requirePermission("leave.settings.manage"), async (c) => {
  const input = readPolicyBody(await readJsonBody(c.req.raw));
  if (!input.leave_type_id || !input.name) return fail(c, 400, "VALIDATION_ERROR", "Leave type and policy name are required.");
  const type = await c.env.DB.prepare("SELECT id FROM leave_types WHERE id = ?").bind(input.leave_type_id).first();
  if (!type) return fail(c, 400, "INVALID_LEAVE_TYPE", "Leave type was not found.");
  const id = crypto.randomUUID();
  await c.env.DB
    .prepare(
      `INSERT INTO leave_policies
       (id, leave_type_id, name, applies_to_employee_type, applies_to_employment_type, department_id, position_id, location_id,
        annual_entitlement_days, allow_half_day, allow_carry_forward, carry_forward_limit_days, carry_forward_expiry_month,
        include_public_holidays, include_weekly_off_days, salary_deduction_mode, deduction_pay_component, requires_document,
        document_required_after_consecutive_days, document_required_after_used_days, max_consecutive_days, min_notice_days, long_leave_threshold_days, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, input.leave_type_id, input.name, input.applies_to_employee_type, input.applies_to_employment_type, input.department_id, input.position_id, input.location_id, input.annual_entitlement_days, input.allow_half_day ? 1 : 0, input.allow_carry_forward ? 1 : 0, input.carry_forward_limit_days, input.carry_forward_expiry_month, input.include_public_holidays ? 1 : 0, input.include_weekly_off_days ? 1 : 0, input.salary_deduction_mode, input.deduction_pay_component, input.requires_document ? 1 : 0, input.document_required_after_consecutive_days, input.document_required_after_used_days, input.max_consecutive_days, input.min_notice_days, input.long_leave_threshold_days, input.priority)
    .run();
  await auditLeave(c, { action: "leave.policy.created", entityType: "leave_policy", entityId: id, newValue: input });
  return ok(c, { policy: { id, ...input, is_active: true } }, 201);
});

leaveRoutes.patch("/policies/:id", requirePermission("leave.settings.manage"), async (c) => {
  const id = routeParam(c, "id");
  const old = await c.env.DB.prepare("SELECT * FROM leave_policies WHERE id = ?").bind(id).first();
  if (!old) return fail(c, 404, "NOT_FOUND", "Leave policy was not found.");
  const input = readPolicyBody(await readJsonBody(c.req.raw));
  if (!input.leave_type_id || !input.name) return fail(c, 400, "VALIDATION_ERROR", "Leave type and policy name are required.");
  await c.env.DB
    .prepare(
      `UPDATE leave_policies SET leave_type_id = ?, name = ?, applies_to_employee_type = ?, applies_to_employment_type = ?,
       department_id = ?, position_id = ?, location_id = ?, annual_entitlement_days = ?, allow_half_day = ?, allow_carry_forward = ?,
       carry_forward_limit_days = ?, carry_forward_expiry_month = ?, include_public_holidays = ?, include_weekly_off_days = ?,
       salary_deduction_mode = ?, deduction_pay_component = ?, requires_document = ?, document_required_after_consecutive_days = ?,
       document_required_after_used_days = ?, max_consecutive_days = ?, min_notice_days = ?, long_leave_threshold_days = ?,
       priority = ?, updated_at = ? WHERE id = ?`
    )
    .bind(input.leave_type_id, input.name, input.applies_to_employee_type, input.applies_to_employment_type, input.department_id, input.position_id, input.location_id, input.annual_entitlement_days, input.allow_half_day ? 1 : 0, input.allow_carry_forward ? 1 : 0, input.carry_forward_limit_days, input.carry_forward_expiry_month, input.include_public_holidays ? 1 : 0, input.include_weekly_off_days ? 1 : 0, input.salary_deduction_mode, input.deduction_pay_component, input.requires_document ? 1 : 0, input.document_required_after_consecutive_days, input.document_required_after_used_days, input.max_consecutive_days, input.min_notice_days, input.long_leave_threshold_days, input.priority, new Date().toISOString(), id)
    .run();
  const updated = await c.env.DB.prepare("SELECT * FROM leave_policies WHERE id = ?").bind(id).first();
  await auditLeave(c, { action: "leave.policy.updated", entityType: "leave_policy", entityId: id, oldValue: old, newValue: updated });
  return ok(c, { policy: updated });
});

async function policyActive(c: Context<AppBindings>, active: 0 | 1) {
  const id = routeParam(c, "id");
  const old = await c.env.DB.prepare("SELECT * FROM leave_policies WHERE id = ?").bind(id).first();
  if (!old) return fail(c, 404, "NOT_FOUND", "Leave policy was not found.");
  await c.env.DB.prepare("UPDATE leave_policies SET is_active = ?, updated_at = ? WHERE id = ?").bind(active, new Date().toISOString(), id).run();
  await auditLeave(c, { action: active ? "leave.policy.enabled" : "leave.policy.disabled", entityType: "leave_policy", entityId: id, oldValue: old, newValue: { is_active: active === 1 } });
  return ok(c, { enabled: active === 1 });
}

leaveRoutes.post("/policies/:id/enable", requirePermission("leave.settings.manage"), (c) => policyActive(c, 1));
leaveRoutes.post("/policies/:id/disable", requirePermission("leave.settings.manage"), (c) => policyActive(c, 0));

function readDocumentRule(body: Record<string, unknown>) {
  return {
    document_type_id: optionalString(body.document_type_id),
    requires_document: bool(body.requires_document, true),
    required_after_consecutive_days: num(body.required_after_consecutive_days),
    required_after_used_days: num(body.required_after_used_days),
    notes: optionalString(body.notes)
  };
}

leaveRoutes.get("/policies/:id/document-rules", requirePermission("leave.view"), async (c) => {
  const rows = await c.env.DB.prepare("SELECT ldr.*, dt.name AS document_type_name FROM leave_policy_document_rules ldr LEFT JOIN document_types dt ON dt.id = ldr.document_type_id WHERE ldr.leave_policy_id = ? ORDER BY ldr.is_active DESC, ldr.created_at").bind(routeParam(c, "id")).all();
  return ok(c, { document_rules: rows.results });
});

leaveRoutes.post("/policies/:id/document-rules", requirePermission("leave.settings.manage"), async (c) => {
  const id = crypto.randomUUID();
  const policyId = routeParam(c, "id");
  const input = readDocumentRule(await readJsonBody(c.req.raw));
  await c.env.DB.prepare("INSERT INTO leave_policy_document_rules (id, leave_policy_id, document_type_id, requires_document, required_after_consecutive_days, required_after_used_days, notes) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, policyId, input.document_type_id, input.requires_document ? 1 : 0, input.required_after_consecutive_days, input.required_after_used_days, input.notes).run();
  await auditLeave(c, { action: "leave.policy.updated", entityType: "leave_policy", entityId: policyId, newValue: { document_rule: input } });
  return ok(c, { document_rule: { id, leave_policy_id: policyId, ...input } }, 201);
});

leaveRoutes.patch("/policies/:id/document-rules/:ruleId", requirePermission("leave.settings.manage"), async (c) => {
  const ruleId = routeParam(c, "ruleId");
  const input = readDocumentRule(await readJsonBody(c.req.raw));
  await c.env.DB.prepare("UPDATE leave_policy_document_rules SET document_type_id = ?, requires_document = ?, required_after_consecutive_days = ?, required_after_used_days = ?, notes = ?, updated_at = ? WHERE id = ? AND leave_policy_id = ?").bind(input.document_type_id, input.requires_document ? 1 : 0, input.required_after_consecutive_days, input.required_after_used_days, input.notes, new Date().toISOString(), ruleId, routeParam(c, "id")).run();
  return ok(c, { updated: true });
});

async function ruleActive(c: Context<AppBindings>, table: "leave_policy_document_rules" | "leave_policy_deduction_rules", active: 0 | 1) {
  await c.env.DB.prepare(`UPDATE ${table} SET is_active = ?, updated_at = ? WHERE id = ? AND leave_policy_id = ?`).bind(active, new Date().toISOString(), routeParam(c, "ruleId"), routeParam(c, "id")).run();
  return ok(c, { enabled: active === 1 });
}

leaveRoutes.post("/policies/:id/document-rules/:ruleId/enable", requirePermission("leave.settings.manage"), (c) => ruleActive(c, "leave_policy_document_rules", 1));
leaveRoutes.post("/policies/:id/document-rules/:ruleId/disable", requirePermission("leave.settings.manage"), (c) => ruleActive(c, "leave_policy_document_rules", 0));

function readDeductionRule(body: Record<string, unknown>) {
  const mode = readString(body.deduction_mode) || "NONE";
  return {
    deduction_mode: DEDUCTION_MODES.has(mode) ? mode : "NONE",
    deduction_pay_component: optionalString(body.deduction_pay_component),
    deduction_after_days: num(body.deduction_after_days),
    long_leave_threshold_days: num(body.long_leave_threshold_days),
    custom_rule_json: optionalString(body.custom_rule_json)
  };
}

leaveRoutes.get("/policies/:id/deduction-rules", requirePermission("leave.view"), async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM leave_policy_deduction_rules WHERE leave_policy_id = ? ORDER BY is_active DESC, created_at").bind(routeParam(c, "id")).all();
  return ok(c, { deduction_rules: rows.results });
});

leaveRoutes.post("/policies/:id/deduction-rules", requirePermission("leave.settings.manage"), async (c) => {
  const id = crypto.randomUUID();
  const policyId = routeParam(c, "id");
  const input = readDeductionRule(await readJsonBody(c.req.raw));
  await c.env.DB.prepare("INSERT INTO leave_policy_deduction_rules (id, leave_policy_id, deduction_mode, deduction_pay_component, deduction_after_days, long_leave_threshold_days, custom_rule_json) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, policyId, input.deduction_mode, input.deduction_pay_component, input.deduction_after_days, input.long_leave_threshold_days, input.custom_rule_json).run();
  await auditLeave(c, { action: "leave.policy.updated", entityType: "leave_policy", entityId: policyId, newValue: { deduction_rule: input } });
  return ok(c, { deduction_rule: { id, leave_policy_id: policyId, ...input } }, 201);
});

leaveRoutes.patch("/policies/:id/deduction-rules/:ruleId", requirePermission("leave.settings.manage"), async (c) => {
  const input = readDeductionRule(await readJsonBody(c.req.raw));
  await c.env.DB.prepare("UPDATE leave_policy_deduction_rules SET deduction_mode = ?, deduction_pay_component = ?, deduction_after_days = ?, long_leave_threshold_days = ?, custom_rule_json = ?, updated_at = ? WHERE id = ? AND leave_policy_id = ?").bind(input.deduction_mode, input.deduction_pay_component, input.deduction_after_days, input.long_leave_threshold_days, input.custom_rule_json, new Date().toISOString(), routeParam(c, "ruleId"), routeParam(c, "id")).run();
  return ok(c, { updated: true });
});

leaveRoutes.post("/policies/:id/deduction-rules/:ruleId/enable", requirePermission("leave.settings.manage"), (c) => ruleActive(c, "leave_policy_deduction_rules", 1));
leaveRoutes.post("/policies/:id/deduction-rules/:ruleId/disable", requirePermission("leave.settings.manage"), (c) => ruleActive(c, "leave_policy_deduction_rules", 0));

function readWorkflowBody(body: Record<string, unknown>) {
  const employeeType = optionalString(body.applies_to_employee_type);
  const employmentType = optionalString(body.applies_to_employment_type);
  return {
    name: readString(body.name),
    description: optionalString(body.description),
    applies_to_leave_type_id: optionalString(body.applies_to_leave_type_id),
    applies_to_employee_type: employeeType && EMPLOYEE_TYPES.has(employeeType) ? employeeType : null,
    applies_to_employment_type: employmentType && EMPLOYMENT_TYPES.has(employmentType) ? employmentType : null,
    department_id: optionalString(body.department_id),
    location_id: optionalString(body.location_id),
    position_id: optionalString(body.position_id),
    job_level_id: optionalString(body.job_level_id),
    min_duration_days: num(body.min_duration_days),
    max_duration_days: num(body.max_duration_days),
    payroll_impact_only: bool(body.payroll_impact_only),
    is_default: bool(body.is_default),
    priority: num(body.priority, 100) ?? 100
  };
}

leaveRoutes.get("/workflows", requirePermission("leave.view"), async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT w.*, lt.name AS leave_type_name, d.name AS department_name, l.name AS location_name,
      p.title AS position_title, jl.name AS job_level_name,
      (SELECT COUNT(*) FROM leave_approval_steps s WHERE s.workflow_id = w.id) AS steps_count
     FROM leave_approval_workflows w
     LEFT JOIN leave_types lt ON lt.id = w.applies_to_leave_type_id
     LEFT JOIN departments d ON d.id = w.department_id
     LEFT JOIN locations l ON l.id = w.location_id
     LEFT JOIN positions p ON p.id = w.position_id
     LEFT JOIN job_levels jl ON jl.id = w.job_level_id
     ORDER BY w.is_active DESC, w.priority, w.name`
  ).all();
  return ok(c, { workflows: rows.results });
});

leaveRoutes.get("/workflows/:id", requirePermission("leave.view"), async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM leave_approval_workflows WHERE id = ?").bind(routeParam(c, "id")).first();
  if (!row) return fail(c, 404, "NOT_FOUND", "Workflow was not found.");
  return ok(c, { workflow: row });
});

leaveRoutes.post("/workflows", requirePermission("leave.workflow.manage"), async (c) => {
  const input = readWorkflowBody(await readJsonBody(c.req.raw));
  if (!input.name) return fail(c, 400, "VALIDATION_ERROR", "Workflow name is required.");
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO leave_approval_workflows (id, name, description, applies_to_leave_type_id, applies_to_employee_type, applies_to_employment_type, department_id, location_id, position_id, job_level_id, min_duration_days, max_duration_days, payroll_impact_only, is_default, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, input.name, input.description, input.applies_to_leave_type_id, input.applies_to_employee_type, input.applies_to_employment_type, input.department_id, input.location_id, input.position_id, input.job_level_id, input.min_duration_days, input.max_duration_days, input.payroll_impact_only ? 1 : 0, input.is_default ? 1 : 0, input.priority).run();
  await auditLeave(c, { action: "leave.workflow.created", entityType: "leave_workflow", entityId: id, newValue: input });
  return ok(c, { workflow: { id, ...input, is_active: true } }, 201);
});

leaveRoutes.patch("/workflows/:id", requirePermission("leave.workflow.manage"), async (c) => {
  const id = routeParam(c, "id");
  const old = await c.env.DB.prepare("SELECT * FROM leave_approval_workflows WHERE id = ?").bind(id).first();
  if (!old) return fail(c, 404, "NOT_FOUND", "Workflow was not found.");
  const input = readWorkflowBody(await readJsonBody(c.req.raw));
  if (!input.name) return fail(c, 400, "VALIDATION_ERROR", "Workflow name is required.");
  await c.env.DB.prepare("UPDATE leave_approval_workflows SET name = ?, description = ?, applies_to_leave_type_id = ?, applies_to_employee_type = ?, applies_to_employment_type = ?, department_id = ?, location_id = ?, position_id = ?, job_level_id = ?, min_duration_days = ?, max_duration_days = ?, payroll_impact_only = ?, is_default = ?, priority = ?, updated_at = ? WHERE id = ?").bind(input.name, input.description, input.applies_to_leave_type_id, input.applies_to_employee_type, input.applies_to_employment_type, input.department_id, input.location_id, input.position_id, input.job_level_id, input.min_duration_days, input.max_duration_days, input.payroll_impact_only ? 1 : 0, input.is_default ? 1 : 0, input.priority, new Date().toISOString(), id).run();
  await auditLeave(c, { action: "leave.workflow.updated", entityType: "leave_workflow", entityId: id, oldValue: old, newValue: input });
  return ok(c, { updated: true });
});

async function workflowActive(c: Context<AppBindings>, active: 0 | 1) {
  const id = routeParam(c, "id");
  await c.env.DB.prepare("UPDATE leave_approval_workflows SET is_active = ?, updated_at = ? WHERE id = ?").bind(active, new Date().toISOString(), id).run();
  await auditLeave(c, { action: active ? "leave.workflow.enabled" : "leave.workflow.disabled", entityType: "leave_workflow", entityId: id, newValue: { is_active: active === 1 } });
  return ok(c, { enabled: active === 1 });
}

leaveRoutes.post("/workflows/:id/enable", requirePermission("leave.workflow.manage"), (c) => workflowActive(c, 1));
leaveRoutes.post("/workflows/:id/disable", requirePermission("leave.workflow.manage"), (c) => workflowActive(c, 0));

function readStepBody(body: Record<string, unknown>) {
  const type = readString(body.approver_type) || "PERMISSION";
  return {
    step_order: num(body.step_order, 1) ?? 1,
    step_name: readString(body.step_name),
    approver_type: APPROVER_TYPES.has(type) ? type : "PERMISSION",
    role_id: optionalString(body.role_id),
    user_id: optionalString(body.user_id),
    permission_key: optionalString(body.permission_key),
    is_required: bool(body.is_required, true),
    skip_if_no_approver: bool(body.skip_if_no_approver, true),
    allow_self_approval: bool(body.allow_self_approval, false)
  };
}

leaveRoutes.get("/workflows/:id/steps", requirePermission("leave.view"), async (c) => {
  const rows = await c.env.DB.prepare("SELECT s.*, r.name AS role_name, u.name AS user_name FROM leave_approval_steps s LEFT JOIN roles r ON r.id = s.role_id LEFT JOIN users u ON u.id = s.user_id WHERE s.workflow_id = ? ORDER BY s.step_order").bind(routeParam(c, "id")).all();
  return ok(c, { steps: rows.results });
});

leaveRoutes.post("/workflows/:id/steps", requirePermission("leave.workflow.manage"), async (c) => {
  const id = crypto.randomUUID();
  const workflowId = routeParam(c, "id");
  const input = readStepBody(await readJsonBody(c.req.raw));
  if (!input.step_name) return fail(c, 400, "VALIDATION_ERROR", "Step name is required.");
  await c.env.DB.prepare("INSERT INTO leave_approval_steps (id, workflow_id, step_order, step_name, approver_type, role_id, user_id, permission_key, is_required, skip_if_no_approver, allow_self_approval) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, workflowId, input.step_order, input.step_name, input.approver_type, input.role_id, input.user_id, input.permission_key, input.is_required ? 1 : 0, input.skip_if_no_approver ? 1 : 0, input.allow_self_approval ? 1 : 0).run();
  await auditLeave(c, { action: "leave.workflow_step.created", entityType: "leave_workflow_step", entityId: id, newValue: input });
  return ok(c, { step: { id, workflow_id: workflowId, ...input } }, 201);
});

leaveRoutes.patch("/workflows/:id/steps/:stepId", requirePermission("leave.workflow.manage"), async (c) => {
  const input = readStepBody(await readJsonBody(c.req.raw));
  await c.env.DB.prepare("UPDATE leave_approval_steps SET step_order = ?, step_name = ?, approver_type = ?, role_id = ?, user_id = ?, permission_key = ?, is_required = ?, skip_if_no_approver = ?, allow_self_approval = ?, updated_at = ? WHERE id = ? AND workflow_id = ?").bind(input.step_order, input.step_name, input.approver_type, input.role_id, input.user_id, input.permission_key, input.is_required ? 1 : 0, input.skip_if_no_approver ? 1 : 0, input.allow_self_approval ? 1 : 0, new Date().toISOString(), routeParam(c, "stepId"), routeParam(c, "id")).run();
  await auditLeave(c, { action: "leave.workflow_step.updated", entityType: "leave_workflow_step", entityId: routeParam(c, "stepId"), newValue: input });
  return ok(c, { updated: true });
});

leaveRoutes.delete("/workflows/:id/steps/:stepId", requirePermission("leave.workflow.manage"), async (c) => {
  await c.env.DB.prepare("DELETE FROM leave_approval_steps WHERE id = ? AND workflow_id = ?").bind(routeParam(c, "stepId"), routeParam(c, "id")).run();
  await auditLeave(c, { action: "leave.workflow_step.deleted_or_disabled", entityType: "leave_workflow_step", entityId: routeParam(c, "stepId") });
  return ok(c, { deleted: true });
});

leaveRoutes.get("/requests", requirePermission("leave.view"), async (c) => {
  const conditions: string[] = [];
  const params: BindValue[] = [];
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "leave", "view", "e");
  conditions.push(scope.sql);
  params.push(...scope.params);
  const search = readString(c.req.query("search"));
  if (search) {
    conditions.push("(e.employee_no LIKE ? OR e.full_name LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }
  const filters = [
    ["employee_id", "lr.employee_id"],
    ["leave_type_id", "lr.leave_type_id"],
    ["status", "lr.status"],
    ["department_id", "e.primary_department_id"],
    ["location_id", "e.primary_location_id"],
    ["position_id", "e.primary_position_id"]
  ] as const;
  for (const [query, column] of filters) {
    const value = readString(c.req.query(query));
    if (value) {
      conditions.push(`${column} = ?`);
      params.push(value);
    }
  }
  addRange(c, conditions, params, "start_date", "lr.start_date");
  addRange(c, conditions, params, "end_date", "lr.end_date");
  addRange(c, conditions, params, "submitted", "lr.submitted_at");
  if (readString(c.req.query("pending_my_approval")) === "true") {
    conditions.push("pending.approver_user_id = ?");
    params.push(c.get("currentUser").id);
  }
  const rows = await c.env.DB
    .prepare(
      `SELECT ${selectColumns()}
       FROM leave_requests lr
       INNER JOIN employees e ON e.id = lr.employee_id
       INNER JOIN leave_types lt ON lt.id = lr.leave_type_id
       LEFT JOIN leave_policies lp ON lp.id = lr.policy_id
       LEFT JOIN departments d ON d.id = e.primary_department_id
       LEFT JOIN positions p ON p.id = e.primary_position_id
       LEFT JOIN locations l ON l.id = e.primary_location_id
       LEFT JOIN leave_request_approvals pending ON pending.id = (
         SELECT id FROM leave_request_approvals
         WHERE leave_request_id = lr.id AND status = 'PENDING'
         ORDER BY step_order LIMIT 1
       )
       ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY lr.created_at DESC`
    )
    .bind(...params)
    .all();
  return ok(c, { requests: rows.results });
});

leaveRoutes.get("/requests/:id", requirePermission("leave.view"), async (c) => {
  const request = await getRequest(c.env.DB, routeParam(c, "id"));
  if (!request) return fail(c, 404, "NOT_FOUND", "Leave request was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(request.employee_id), "leave", "view"))) return fail(c, 404, "NOT_FOUND", "Leave request was not found.");
  return ok(c, { request });
});

async function validateLeaveCalculationAccess(c: Context<AppBindings>, employeeId: string) {
  const user = c.get("currentUser");
  const canCreate = hasAny(c, ["leave.view", "leave.request", "leave.requests.create", "leave.manage", "leave.requests.manage", "self_service.leave_request"]);
  if (!canCreate) return false;
  if (has(c, "self_service.leave_request") && !hasAny(c, ["leave.view", "leave.request", "leave.requests.create", "leave.manage", "leave.requests.manage"])) {
    const linked = await c.env.DB.prepare("SELECT id FROM employees WHERE user_id = ? AND archived_at IS NULL").bind(user.id).first<{ id: string }>();
    return linked?.id === employeeId;
  }
  return canAccessEmployee(c.env.DB, user, employeeId, "leave", hasAny(c, ["leave.manage", "leave.requests.manage"]) ? "manage" : "view");
}

async function buildLeaveCalculation(c: Context<AppBindings>, body: Record<string, unknown>) {
  const employeeId = readString(body.employee_id);
  const leaveTypeId = readString(body.leave_type_id);
  const startDate = readString(body.start_date);
  const endDate = readString(body.end_date);
  const halfDayType = readString(body.half_day_type) || "NONE";
  if (!employeeId || !leaveTypeId || !startDate || !endDate) return { error: fail(c, 400, "VALIDATION_ERROR", "Employee, leave type, start date, and end date are required.") };
  if (!(await validateLeaveCalculationAccess(c, employeeId))) return { error: fail(c, 404, "NOT_FOUND", "Employee was not found.") };
  const employee = await getEmployee(c.env.DB, employeeId);
  if (!employee) return { error: fail(c, 404, "NOT_FOUND", "Employee was not found.") };
  const type = await c.env.DB.prepare("SELECT * FROM leave_types WHERE id = ? AND is_active = 1").bind(leaveTypeId).first<Record<string, unknown>>();
  if (!type) return { error: fail(c, 400, "INVALID_LEAVE_TYPE", "Leave type was not found or is disabled.") };
  const policy = await findPolicy(c.env.DB, employee, leaveTypeId);
  const calculation = await calculateLeaveDays(c, { employeeId, startDate, endDate, halfDayType, includeWeeklyOff: Number(policy?.include_weekly_off_days ?? 0) === 1 });
  if (!calculation) return { error: fail(c, 400, "INVALID_DATES", "Leave dates are invalid.") };
  const document_required = documentRequired(policy, calculation.counted);
  const payroll_impact = await calculateLeavePayrollImpact(policy, calculation.counted);
  const cycle = await getCurrentLeaveCycle(c, employeeId, leaveTypeId, Number(startDate.slice(0, 4)), Number(policy?.annual_entitlement_days ?? 0));
  const requestPreview = {
    id: "preview",
    employee_id: employeeId,
    leave_type_id: leaveTypeId,
    policy_id: policy?.id ?? null,
    start_date: startDate,
    end_date: endDate,
    requested_days: calculation.counted,
    salary_deduction_mode: payroll_impact.mode,
    employee_type: employee.employee_type,
    employment_type: employee.employment_type,
    department_id: employee.primary_department_id,
    position_id: employee.primary_position_id,
    location_id: employee.primary_location_id,
    job_level_id: employee.job_level_id,
    reporting_manager_employee_id: employee.reporting_manager_employee_id
  };
  const approval_chain_preview = await getLeaveApprovalChainPreview(c, requestPreview);
  return {
    result: {
      calendar_days: calculation.calendar_days,
      chargeable_days: calculation.chargeable_days,
      total_days: calculation.total,
      requested_days: calculation.counted,
      days: calculation.days,
      balance_impact: {
        cycle,
        requested_days: calculation.counted,
        projected_pending_days: Number(cycle?.pending_days ?? 0) + calculation.counted,
        projected_closing_balance: Number(cycle?.closing_balance ?? 0) - calculation.counted
      },
      document_required,
      document_requirements: { required: document_required, status: document_required ? "REQUIRED_PENDING" : "NOT_REQUIRED" },
      payroll_impact,
      approval_chain_preview
    }
  };
}

leaveRoutes.post("/calculate", async (c) => {
  const built = await buildLeaveCalculation(c, await readJsonBody(c.req.raw));
  if (built.error) return built.error;
  return ok(c, built.result);
});

leaveRoutes.post("/validate-request", async (c) => {
  const body = await readJsonBody(c.req.raw);
  const built = await buildLeaveCalculation(c, body);
  if (built.error) return built.error;
  const employeeId = readString(body.employee_id);
  const startDate = readString(body.start_date);
  const endDate = readString(body.end_date);
  const overlap = employeeId && startDate && endDate ? await hasOverlap(c, employeeId, startDate, endDate, optionalString(body.except_request_id) ?? undefined) : false;
  return ok(c, {
    ...built.result,
    valid: !overlap,
    blockers: overlap ? ["An active leave request already overlaps this date range."] : [],
    warnings: (built.result?.approval_chain_preview?.steps ?? []).filter((step: Record<string, unknown>) => step.warning).map((step: Record<string, unknown>) => step.warning)
  });
});

leaveRoutes.post("/requests", async (c) => {
  if (!hasAny(c, ["leave.request", "leave.requests.create", "leave.manage", "leave.requests.manage"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to create leave requests.");
  const body = await readJsonBody(c.req.raw);
  const employeeId = readString(body.employee_id);
  const leaveTypeId = readString(body.leave_type_id);
  const startDate = readString(body.start_date);
  const endDate = readString(body.end_date);
  const halfDayType = readString(body.half_day_type) || "NONE";
  if (!employeeId || !leaveTypeId || !startDate || !endDate) return fail(c, 400, "VALIDATION_ERROR", "Employee, leave type, start date, and end date are required.");
  const employee = await getEmployee(c.env.DB, employeeId);
  if (!employee) return fail(c, 400, "INVALID_EMPLOYEE", "Employee was not found or is archived.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "leave", has(c, "leave.manage") ? "manage" : "view"))) return fail(c, 403, "FORBIDDEN", "You do not have access to this employee.");
  const type = await c.env.DB.prepare("SELECT * FROM leave_types WHERE id = ? AND is_active = 1").bind(leaveTypeId).first<Record<string, unknown>>();
  if (!type) return fail(c, 400, "INVALID_LEAVE_TYPE", "Leave type was not found or is disabled.");
  if (await hasOverlap(c, employeeId, startDate, endDate)) return fail(c, 409, "OVERLAPPING_LEAVE", "An active leave request already overlaps this date range.");
  const policy = await findPolicy(c.env.DB, employee, leaveTypeId);
  if (halfDayType !== "NONE" && policy && Number(policy.allow_half_day) !== 1) return fail(c, 400, "HALF_DAY_NOT_ALLOWED", "Selected policy does not allow half-day leave.");
  const calculated = await calculateLeaveDays(c, { employeeId, startDate, endDate, halfDayType, includeWeeklyOff: Number(policy?.include_weekly_off_days ?? 0) === 1 });
  if (!calculated || calculated.counted <= 0) return fail(c, 400, "INVALID_DATES", "Leave dates must produce at least one counted leave day.");
  if (policy?.max_consecutive_days && calculated.counted > Number(policy.max_consecutive_days)) return fail(c, 400, "MAX_CONSECUTIVE_DAYS", "Requested leave exceeds the policy maximum consecutive days.");
  const docRequired = documentRequired(policy, calculated.counted);
  const estimate = await calculateLeavePayrollImpact(policy, calculated.counted);
  const id = crypto.randomUUID();
  await c.env.DB
    .prepare(
      `INSERT INTO leave_requests
       (id, employee_id, leave_type_id, policy_id, start_date, end_date, total_days, requested_days, half_day_type,
        reason, status, document_required, document_status, salary_deduction_mode, salary_deduction_estimate_json,
        public_holiday_handling_json, submitted_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, employeeId, leaveTypeId, policy?.id ?? null, startDate, endDate, calculated.total, calculated.counted, halfDayType, optionalString(body.reason), docRequired ? 1 : 0, docRequired ? "REQUIRED_PENDING" : "NOT_REQUIRED", estimate.mode, JSON.stringify(estimate), JSON.stringify({ include_public_holidays: Number(policy?.include_public_holidays ?? 0) === 1, include_weekly_off_days: Number(policy?.include_weekly_off_days ?? 0) === 1 }), c.get("currentUser").id)
    .run();
  await generateDays(c, id, employeeId, startDate, endDate, halfDayType, Number(policy?.include_weekly_off_days ?? 0) === 1);
  await auditLeave(c, { action: "leave.request.created", entityType: "leave_request", entityId: id, newValue: { employeeId, leaveTypeId, startDate, endDate } });
  await publishLeave(c, "leave.request.created", id, "created");
  const request = await getRequest(c.env.DB, id);
  const approvalChain = request ? await getLeaveApprovalChainPreview(c, request) : null;
  return ok(c, { request, approval_chain_preview: approvalChain }, 201);
});

async function findWorkflow(c: Context<AppBindings>, request: Record<string, unknown>) {
  const duration = Number(request.requested_days ?? 0);
  const hasPayrollImpact = String(request.salary_deduction_mode ?? "NONE") !== "NONE" && String(request.salary_deduction_mode ?? "NONE") !== "NO_DEDUCTION";
  const row = await c.env.DB
    .prepare(
      `SELECT * FROM leave_approval_workflows
       WHERE is_active = 1
         AND (applies_to_leave_type_id IS NULL OR applies_to_leave_type_id = ?)
         AND (applies_to_employee_type IS NULL OR applies_to_employee_type = ?)
         AND (applies_to_employment_type IS NULL OR applies_to_employment_type = ?)
         AND (department_id IS NULL OR department_id = ?)
         AND (location_id IS NULL OR location_id = ?)
         AND (position_id IS NULL OR position_id = ?)
         AND (job_level_id IS NULL OR job_level_id = ?)
         AND (min_duration_days IS NULL OR min_duration_days <= ?)
         AND (max_duration_days IS NULL OR max_duration_days >= ?)
         AND (payroll_impact_only = 0 OR ? = 1)
       ORDER BY priority ASC, CASE WHEN is_default = 1 THEN 1 ELSE 0 END ASC, created_at ASC
       LIMIT 1`
    )
    .bind(request.leave_type_id, request.employee_type, request.employment_type, request.department_id, request.location_id, request.position_id, request.job_level_id, duration, duration, hasPayrollImpact ? 1 : 0)
    .first<Record<string, unknown>>();
  if (row) return row;
  return c.env.DB.prepare("SELECT * FROM leave_approval_workflows WHERE is_active = 1 AND is_default = 1 ORDER BY priority LIMIT 1").first<Record<string, unknown>>();
}

async function firstUserWithPermission(c: Context<AppBindings>, permission: string) {
  return c.env.DB
    .prepare(
      `SELECT u.id FROM users u
       INNER JOIN user_roles ur ON ur.user_id = u.id
       INNER JOIN role_permissions rp ON rp.role_id = ur.role_id
       INNER JOIN permissions p ON p.id = rp.permission_id
       WHERE u.status = 'ACTIVE' AND p.key = ?
       LIMIT 1`
    )
    .bind(permission)
    .first<{ id: string }>();
}

async function resolveApprover(c: Context<AppBindings>, step: Record<string, unknown>, request: Record<string, unknown>) {
  const type = String(step.approver_type);
  if (type === "USER") return step.user_id ? String(step.user_id) : null;
  if (type === "REPORTING_MANAGER" && request.reporting_manager_employee_id) {
    const manager = await c.env.DB.prepare("SELECT user_id FROM employees WHERE id = ?").bind(String(request.reporting_manager_employee_id)).first<{ user_id: string | null }>();
    return manager?.user_id ?? null;
  }
  if ((type === "ROLE" || type === "HR_ROLE") && step.role_id) {
    const row = await c.env.DB.prepare("SELECT u.id FROM users u INNER JOIN user_roles ur ON ur.user_id = u.id WHERE u.status = 'ACTIVE' AND ur.role_id = ? LIMIT 1").bind(String(step.role_id)).first<{ id: string }>();
    return row?.id ?? null;
  }
  if (type === "DEPARTMENT_HEAD" || type === "DEPARTMENT_MANAGER" || type === "DEPARTMENT_SENIOR") {
    const manager = await c.env.DB
      .prepare(
        `SELECT e.user_id FROM departments d
         LEFT JOIN employees e ON e.id = COALESCE(d.head_employee_id, d.manager_employee_id)
         WHERE d.id = ? AND e.archived_at IS NULL`
      )
      .bind(String(request.department_id ?? ""))
      .first<{ user_id: string | null }>();
    if (manager?.user_id) return manager.user_id;
    const row = await firstUserWithPermission(c, "leave.approve");
    return row?.id ?? null;
  }
  if (type === "LOCATION_MANAGER" || type === "DIRECTOR") {
    const manager = await c.env.DB
      .prepare(
        `SELECT e.user_id FROM locations l
         LEFT JOIN employees e ON e.id = l.manager_employee_id
         WHERE l.id = ? AND e.archived_at IS NULL`
      )
      .bind(String(request.location_id ?? ""))
      .first<{ user_id: string | null }>();
    if (manager?.user_id) return manager.user_id;
    const row = await firstUserWithPermission(c, type === "DIRECTOR" ? "leave.manage" : "leave.approve");
    return row?.id ?? null;
  }
  if (type === "HR_MANAGER") {
    const row = await firstUserWithPermission(c, "leave.approve");
    return row?.id ?? null;
  }
  if (type === "FINANCE_MANAGER") {
    const row = await firstUserWithPermission(c, "payroll.approve");
    return row?.id ?? null;
  }
  if (type === "OWNER") {
    const row = await c.env.DB.prepare("SELECT id FROM users WHERE is_owner = 1 AND status = 'ACTIVE' ORDER BY created_at LIMIT 1").first<{ id: string }>();
    return row?.id ?? null;
  }
  if (type === "PERMISSION") {
    const row = await firstUserWithPermission(c, String(step.permission_key ?? "leave.approve"));
    return row?.id ?? null;
  }
  return null;
}

export async function getLeaveApprovalChainPreview(c: Context<AppBindings>, request: Record<string, unknown>) {
  const workflow = await findWorkflow(c, request);
  let steps: Record<string, unknown>[] = [];
  if (workflow) {
    steps = (await c.env.DB.prepare("SELECT s.*, r.name AS role_name, u.name AS user_name FROM leave_approval_steps s LEFT JOIN roles r ON r.id = s.role_id LEFT JOIN users u ON u.id = s.user_id WHERE s.workflow_id = ? ORDER BY s.step_order").bind(String(workflow.id)).all<Record<string, unknown>>()).results;
  }
  if (!steps.length) {
    steps = [{ id: null, step_order: 1, step_name: "HR review required", approver_type: "PERMISSION", permission_key: "leave.approve", is_required: 1, skip_if_no_approver: 0, allow_self_approval: 0 }];
  }
  const preview = [];
  let includesFinance = false;
  let includesHr = false;
  for (const step of steps) {
    const approver = await resolveApprover(c, step, request);
    const type = String(step.approver_type);
    includesFinance = includesFinance || type === "FINANCE_MANAGER" || String(step.permission_key ?? "").startsWith("payroll.");
    includesHr = includesHr || type === "HR_MANAGER" || type === "HR_ROLE" || String(step.permission_key ?? "").startsWith("leave.");
    preview.push({
      step_order: Number(step.step_order),
      step_name: String(step.step_name),
      approver_type: type,
      approver_user_id: approver,
      role_id: step.role_id ?? null,
      role_name: step.role_name ?? null,
      permission_key: step.permission_key ?? null,
      is_required: Number(step.is_required ?? 1) === 1,
      skip_if_no_approver: Number(step.skip_if_no_approver ?? 0) === 1,
      allow_self_approval: Number(step.allow_self_approval ?? 0) === 1,
      warning: approver ? null : Number(step.skip_if_no_approver ?? 0) === 1 ? "Approver not resolved; this step will be skipped." : "Approver not resolved; HR/admin action is required."
    });
  }
  return {
    matched_workflow: workflow ? { id: workflow.id, name: workflow.name, priority: workflow.priority } : null,
    steps: preview,
    includes_finance_approval: includesFinance,
    includes_hr_approval: includesHr
  };
}

async function generateTimeline(c: Context<AppBindings>, request: Record<string, unknown>) {
  await c.env.DB.prepare("DELETE FROM leave_request_approvals WHERE leave_request_id = ?").bind(String(request.id)).run();
  const workflow = await findWorkflow(c, request);
  let steps: Record<string, unknown>[] = [];
  if (workflow) {
    steps = (await c.env.DB.prepare("SELECT * FROM leave_approval_steps WHERE workflow_id = ? ORDER BY step_order").bind(String(workflow.id)).all<Record<string, unknown>>()).results;
  }
  if (!steps.length) {
    steps = [{ id: null, step_order: 1, step_name: "HR review required", approver_type: "PERMISSION", permission_key: "leave.approve", is_required: 1, skip_if_no_approver: 0, allow_self_approval: 0 }];
  }
  for (const step of steps) {
    const approver = await resolveApprover(c, step, request);
    const skipped = !approver && Number(step.skip_if_no_approver ?? 0) === 1;
    const blocked = !approver && !skipped;
    await c.env.DB.prepare("INSERT INTO leave_request_approvals (id, leave_request_id, workflow_id, step_id, step_order, step_name, approver_user_id, approver_type, status, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), String(request.id), workflow?.id ?? null, step.id ?? null, Number(step.step_order), String(step.step_name), approver, String(step.approver_type), skipped ? "SKIPPED" : "PENDING", skipped ? "Skipped because no approver was resolved." : blocked ? "No approver resolved; HR/admin action required." : null).run();
  }
}

async function submitRequest(c: Context<AppBindings>, id: string) {
  if (!hasAny(c, ["leave.request", "leave.requests.create", "leave.manage", "leave.requests.manage"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to submit leave requests.");
  const request = await getRequest(c.env.DB, id);
  if (!request) return fail(c, 404, "NOT_FOUND", "Leave request was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(request.employee_id), "leave", has(c, "leave.manage") ? "manage" : "view"))) return fail(c, 404, "NOT_FOUND", "Leave request was not found.");
  if (request.status !== "DRAFT") return fail(c, 409, "INVALID_STATUS", "Only draft leave requests can be submitted.");
  if (request.document_status === "REQUIRED_PENDING") return fail(c, 400, "DOCUMENT_REQUIRED", "Required supporting document must be attached before submission.");
  await generateTimeline(c, request);
  const pending = await c.env.DB.prepare("SELECT id FROM leave_request_approvals WHERE leave_request_id = ? AND status = 'PENDING' ORDER BY step_order LIMIT 1").bind(id).first();
  const now = new Date().toISOString();
  await auditLeave(c, { action: "leave.request.submitted", entityType: "leave_request", entityId: id });
  await publishLeave(c, "leave.request.submitted", id, "submitted");
  if (pending) {
    await c.env.DB.prepare("UPDATE leave_requests SET status = 'PENDING_APPROVAL', submitted_at = ?, updated_at = ? WHERE id = ?").bind(now, now, id).run();
    await updateBalance(c, request, "pending_add");
    await publishLeave(c, "leave.approval.pending", id, "approval_pending");
  } else {
    await c.env.DB.prepare("UPDATE leave_requests SET status = 'APPROVED', submitted_at = ?, approved_at = ?, updated_at = ? WHERE id = ?").bind(now, now, now, id).run();
    await updateBalance(c, request, "approve");
    await auditLeave(c, { action: "leave.request.approved", entityType: "leave_request", entityId: id, reason: "All approval steps were approved or skipped." });
    await publishLeave(c, "leave.request.approved", id, "approved");
  }
  return ok(c, { request: await getRequest(c.env.DB, id) });
}

leaveRoutes.post("/requests/:id/submit", (c) => submitRequest(c, routeParam(c, "id")));

async function currentApproval(c: Context<AppBindings>, requestId: string) {
  return c.env.DB.prepare("SELECT * FROM leave_request_approvals WHERE leave_request_id = ? AND status = 'PENDING' ORDER BY step_order LIMIT 1").bind(requestId).first<Record<string, unknown>>();
}

async function canActOnApproval(c: Context<AppBindings>, approval: Record<string, unknown>, request: Record<string, unknown>) {
  const actorId = c.get("currentUser").id;
  if (!hasAny(c, ["leave.approve", "leave.requests.approve", "leave.requests.reject"])) return false;
  if (approval.approver_user_id && approval.approver_user_id !== actorId && !hasAny(c, ["leave.manage", "leave.requests.manage"])) return false;
  const step = approval.step_id ? await c.env.DB.prepare("SELECT allow_self_approval FROM leave_approval_steps WHERE id = ?").bind(String(approval.step_id)).first<{ allow_self_approval: number }>() : null;
  if (Number(step?.allow_self_approval ?? 0) !== 1 && request.employee_user_id === actorId) return false;
  return true;
}

leaveRoutes.post("/requests/:id/approve", async (c) => {
  const id = routeParam(c, "id");
  const request = await getRequest(c.env.DB, id);
  if (!request) return fail(c, 404, "NOT_FOUND", "Leave request was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(request.employee_id), "leave", "view"))) return fail(c, 404, "NOT_FOUND", "Leave request was not found.");
  const approval = await currentApproval(c, id);
  if (!approval) return fail(c, 409, "NO_PENDING_APPROVAL", "No approval step is pending.");
  if (!(await canActOnApproval(c, approval, request))) return fail(c, 403, "FORBIDDEN", "You are not the current approver for this step.");
  const body = await readJsonBody(c.req.raw);
  await c.env.DB.prepare("UPDATE leave_request_approvals SET status = 'APPROVED', action_by_user_id = ?, action_at = ?, note = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, new Date().toISOString(), optionalString(body.note), new Date().toISOString(), String(approval.id)).run();
  const next = await currentApproval(c, id);
  if (!next) {
    await c.env.DB.prepare("UPDATE leave_requests SET status = 'APPROVED', approved_at = ?, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), new Date().toISOString(), id).run();
    await updateBalance(c, request, "approve");
    await publishLeave(c, "leave.request.approved", id, "approved");
  }
  await auditLeave(c, { action: "leave.request.approved", entityType: "leave_request", entityId: id, reason: optionalString(body.note) });
  return ok(c, { request: await getRequest(c.env.DB, id) });
});

leaveRoutes.post("/requests/:id/reject", async (c) => {
  if (!hasAny(c, ["leave.approve", "leave.requests.reject"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to reject leave requests.");
  const id = routeParam(c, "id");
  const body = await readJsonBody(c.req.raw);
  const note = optionalString(body.note ?? body.reason);
  if (!note) return fail(c, 400, "REASON_REQUIRED", "Reject reason is required.");
  const request = await getRequest(c.env.DB, id);
  if (!request) return fail(c, 404, "NOT_FOUND", "Leave request was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(request.employee_id), "leave", "view"))) return fail(c, 404, "NOT_FOUND", "Leave request was not found.");
  const approval = await currentApproval(c, id);
  if (!approval) return fail(c, 409, "NO_PENDING_APPROVAL", "No approval step is pending.");
  if (!(await canActOnApproval(c, approval, request))) return fail(c, 403, "FORBIDDEN", "You are not the current approver for this step.");
  await c.env.DB.prepare("UPDATE leave_request_approvals SET status = 'REJECTED', action_by_user_id = ?, action_at = ?, note = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, new Date().toISOString(), note, new Date().toISOString(), String(approval.id)).run();
  await c.env.DB.prepare("UPDATE leave_requests SET status = 'REJECTED', rejected_at = ?, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), new Date().toISOString(), id).run();
  await updateBalance(c, request, "pending_release");
  await auditLeave(c, { action: "leave.request.rejected", entityType: "leave_request", entityId: id, reason: note });
  await publishLeave(c, "leave.request.rejected", id, "rejected");
  return ok(c, { request: await getRequest(c.env.DB, id) });
});

leaveRoutes.post("/requests/:id/cancel", async (c) => {
  if (!hasAny(c, ["leave.cancel", "leave.requests.cancel", "leave.manage", "leave.requests.manage"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to cancel leave requests.");
  const id = routeParam(c, "id");
  const body = await readJsonBody(c.req.raw);
  const reason = optionalString(body.reason);
  if (!reason) return fail(c, 400, "REASON_REQUIRED", "Cancellation reason is required.");
  const request = await getRequest(c.env.DB, id);
  if (!request) return fail(c, 404, "NOT_FOUND", "Leave request was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(request.employee_id), "leave", has(c, "leave.manage") ? "manage" : "view"))) return fail(c, 404, "NOT_FOUND", "Leave request was not found.");
  if (request.status === "CANCELLED" || request.status === "REJECTED") return fail(c, 409, "INVALID_STATUS", "This leave request cannot be cancelled.");
  if (request.status === "APPROVED") await updateBalance(c, request, "cancel_approved");
  if (request.status === "PENDING_APPROVAL" || request.status === "SUBMITTED") await updateBalance(c, request, "pending_release");
  await c.env.DB.prepare("UPDATE leave_requests SET status = 'CANCELLED', cancelled_at = ?, cancellation_reason = ?, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), reason, new Date().toISOString(), id).run();
  await auditLeave(c, { action: "leave.request.cancelled", entityType: "leave_request", entityId: id, reason });
  await publishLeave(c, "leave.request.cancelled", id, "cancelled");
  return ok(c, { request: await getRequest(c.env.DB, id) });
});

leaveRoutes.patch("/requests/:id", async (c) => {
  if (!hasAny(c, ["leave.request", "leave.requests.create", "leave.manage", "leave.requests.manage"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to update leave requests.");
  const id = routeParam(c, "id");
  const request = await getRequest(c.env.DB, id);
  if (!request) return fail(c, 404, "NOT_FOUND", "Leave request was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(request.employee_id), "leave", has(c, "leave.manage") ? "manage" : "view"))) return fail(c, 404, "NOT_FOUND", "Leave request was not found.");
  if (request.status !== "DRAFT") return fail(c, 409, "INVALID_STATUS", "Only draft requests can be edited.");
  const body = await readJsonBody(c.req.raw);
  await c.env.DB.prepare("UPDATE leave_requests SET reason = ?, updated_at = ? WHERE id = ?").bind(optionalString(body.reason), new Date().toISOString(), id).run();
  await auditLeave(c, { action: "leave.request.updated", entityType: "leave_request", entityId: id, newValue: { reason: optionalString(body.reason) } });
  return ok(c, { request: await getRequest(c.env.DB, id) });
});

leaveRoutes.get("/requests/:id/timeline", requirePermission("leave.view"), async (c) => {
  const request = await getRequest(c.env.DB, routeParam(c, "id"));
  if (!request || !(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(request.employee_id), "leave", "view"))) return fail(c, 404, "NOT_FOUND", "Leave request was not found.");
  const rows = await c.env.DB.prepare("SELECT a.*, u.name AS approver_name, actor.name AS action_by_name FROM leave_request_approvals a LEFT JOIN users u ON u.id = a.approver_user_id LEFT JOIN users actor ON actor.id = a.action_by_user_id WHERE a.leave_request_id = ? ORDER BY a.step_order").bind(routeParam(c, "id")).all();
  return ok(c, { timeline: rows.results });
});

leaveRoutes.get("/requests/:id/days", requirePermission("leave.view"), async (c) => {
  const request = await getRequest(c.env.DB, routeParam(c, "id"));
  if (!request || !(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(request.employee_id), "leave", "view"))) return fail(c, 404, "NOT_FOUND", "Leave request was not found.");
  const rows = await c.env.DB.prepare("SELECT * FROM leave_request_days WHERE leave_request_id = ? ORDER BY leave_date").bind(routeParam(c, "id")).all();
  return ok(c, { days: rows.results });
});

async function recalculateDocumentStatus(c: Context<AppBindings>, request: Record<string, unknown>) {
  const valid = await c.env.DB
    .prepare(
      `SELECT COUNT(*) AS count
       FROM leave_request_documents lrd
       INNER JOIN employee_documents ed ON ed.id = lrd.employee_document_id
       WHERE lrd.leave_request_id = ? AND ed.employee_id = ? AND ed.status = 'ACTIVE'`
    )
    .bind(String(request.id), String(request.employee_id))
    .first<{ count: number }>();
  const status = Number(valid?.count ?? 0) > 0 ? "PROVIDED" : Number(request.document_required ?? 0) === 1 ? "REQUIRED_PENDING" : "NOT_REQUIRED";
  await c.env.DB.prepare("UPDATE leave_requests SET document_status = ?, updated_at = ? WHERE id = ?").bind(status, new Date().toISOString(), String(request.id)).run();
  return status;
}

leaveRoutes.get("/requests/:id/documents", requirePermission("leave.view"), async (c) => {
  const request = await getRequest(c.env.DB, routeParam(c, "id"));
  if (!request) return fail(c, 404, "NOT_FOUND", "Leave request was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(request.employee_id), "leave", "view"))) return fail(c, 404, "NOT_FOUND", "Leave request was not found.");
  const rows = await c.env.DB
    .prepare(
      `SELECT lrd.*, ed.employee_id, ed.document_number, ed.issue_date, ed.expiry_date, ed.status AS employee_document_status,
        ed.is_sensitive, dt.name AS document_type_name, dt.code AS document_type_code
       FROM leave_request_documents lrd
       INNER JOIN employee_documents ed ON ed.id = lrd.employee_document_id
       LEFT JOIN document_types dt ON dt.id = lrd.document_type_id
       WHERE lrd.leave_request_id = ?
       ORDER BY lrd.attached_at DESC`
    )
    .bind(routeParam(c, "id"))
    .all<Record<string, unknown>>();
  const canSensitive = has(c, "documents.sensitive.view");
  return ok(c, {
    documents: rows.results.map((row) => ({
      ...row,
      document_number: Number(row.is_sensitive ?? 0) === 1 && !canSensitive ? "Restricted" : row.document_number
    }))
  });
});

leaveRoutes.post("/requests/:id/documents/attach", async (c) => {
  if (!hasAny(c, ["leave.request", "leave.manage"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to attach leave documents.");
  const id = routeParam(c, "id");
  const request = await getRequest(c.env.DB, id);
  if (!request) return fail(c, 404, "NOT_FOUND", "Leave request was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(request.employee_id), "leave", has(c, "leave.manage") ? "manage" : "view"))) return fail(c, 404, "NOT_FOUND", "Leave request was not found.");
  const body = await readJsonBody(c.req.raw);
  const employeeDocumentId = readString(body.employee_document_id);
  if (!employeeDocumentId) return fail(c, 400, "VALIDATION_ERROR", "Employee document is required.");
  const doc = await c.env.DB.prepare("SELECT * FROM employee_documents WHERE id = ?").bind(employeeDocumentId).first<Record<string, unknown>>();
  if (!doc) return fail(c, 404, "NOT_FOUND", "Employee document was not found.");
  if (doc.employee_id !== request.employee_id) return fail(c, 403, "FORBIDDEN", "This document does not belong to the leave request employee.");
  if (doc.status !== "ACTIVE") return fail(c, 409, "DOCUMENT_NOT_ACTIVE", "Only active employee documents can be attached to leave requests.");
  if (Number(doc.is_sensitive ?? 0) === 1 && !has(c, "documents.sensitive.view")) return fail(c, 403, "FORBIDDEN", "Sensitive document permission is required.");
  await c.env.DB.prepare("INSERT OR IGNORE INTO leave_request_documents (id, leave_request_id, employee_document_id, document_type_id, attached_by_user_id) VALUES (?, ?, ?, ?, ?)").bind(crypto.randomUUID(), id, employeeDocumentId, doc.document_type_id ?? null, c.get("currentUser").id).run();
  await recalculateDocumentStatus(c, request);
  await auditLeave(c, { action: "leave.document.attached", entityType: "leave_request", entityId: id, newValue: { employee_document_id: employeeDocumentId } });
  return ok(c, { attached: true });
});

leaveRoutes.delete("/requests/:id/documents/:documentId", async (c) => {
  if (!hasAny(c, ["leave.request", "leave.manage"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to detach leave documents.");
  const id = routeParam(c, "id");
  const request = await getRequest(c.env.DB, id);
  if (!request) return fail(c, 404, "NOT_FOUND", "Leave request was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(request.employee_id), "leave", has(c, "leave.manage") ? "manage" : "view"))) return fail(c, 404, "NOT_FOUND", "Leave request was not found.");
  const attachment = await c.env.DB.prepare("SELECT * FROM leave_request_documents WHERE leave_request_id = ? AND employee_document_id = ?").bind(id, routeParam(c, "documentId")).first();
  if (!attachment) return fail(c, 404, "NOT_FOUND", "Leave document attachment was not found.");
  await c.env.DB.prepare("DELETE FROM leave_request_documents WHERE leave_request_id = ? AND employee_document_id = ?").bind(id, routeParam(c, "documentId")).run();
  await recalculateDocumentStatus(c, request);
  await auditLeave(c, { action: "leave.document.detached", entityType: "leave_request", entityId: id, newValue: { employee_document_id: routeParam(c, "documentId") } });
  return ok(c, { detached: true });
});

leaveRoutes.get("/dashboard", requirePermission("leave.view"), async (c) => {
  const now = new Date();
  const monthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "leave", "view", "e");
  const scopedEmployeeSql = `SELECT e.id FROM employees e WHERE ${scope.sql}`;
  const rows = await c.env.DB.prepare(
    `SELECT
      (SELECT COUNT(*) FROM leave_request_approvals WHERE status = 'PENDING' AND approver_user_id = ?) AS pending_approvals,
      (SELECT COUNT(*) FROM leave_requests WHERE employee_id IN (${scopedEmployeeSql}) AND created_at >= ?) AS requests_this_month,
      (SELECT COUNT(*) FROM leave_requests WHERE employee_id IN (${scopedEmployeeSql}) AND status = 'APPROVED' AND approved_at >= ?) AS approved_this_month,
      (SELECT COUNT(*) FROM leave_requests WHERE employee_id IN (${scopedEmployeeSql}) AND status = 'APPROVED' AND start_date <= date('now') AND end_date >= date('now')) AS employees_currently_on_leave,
      (SELECT COUNT(*) FROM leave_requests WHERE employee_id IN (${scopedEmployeeSql}) AND status IN ('PENDING_APPROVAL','APPROVED') AND start_date > date('now')) AS upcoming_leave,
      (SELECT COUNT(*) FROM leave_requests WHERE employee_id IN (${scopedEmployeeSql}) AND document_status = 'REQUIRED_PENDING') AS missing_required_documents`
  ).bind(c.get("currentUser").id, ...scope.params, monthStart, ...scope.params, monthStart, ...scope.params, ...scope.params, ...scope.params).first();
  return ok(c, rows ?? {});
});

leaveRoutes.get("/reports", requirePermission("leave.reports.view"), async (c) => {
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "leave", "view", "e");
  const rows = await c.env.DB.prepare("SELECT lr.status, COUNT(*) AS count, SUM(lr.requested_days) AS days FROM leave_requests lr INNER JOIN employees e ON e.id = lr.employee_id WHERE " + scope.sql + " GROUP BY lr.status").bind(...scope.params).all();
  return ok(c, { reports: rows.results });
});

leaveRoutes.get("/reports/export.csv", requirePermission("leave.reports.export"), async (c) => {
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "leave", "view", "e");
  const rows = (await c.env.DB.prepare(`SELECT ${selectColumns()} FROM leave_requests lr INNER JOIN employees e ON e.id = lr.employee_id INNER JOIN leave_types lt ON lt.id = lr.leave_type_id LEFT JOIN leave_policies lp ON lp.id = lr.policy_id LEFT JOIN departments d ON d.id = e.primary_department_id LEFT JOIN positions p ON p.id = e.primary_position_id LEFT JOIN locations l ON l.id = e.primary_location_id LEFT JOIN leave_request_approvals pending ON pending.id = (SELECT id FROM leave_request_approvals WHERE leave_request_id = lr.id AND status = 'PENDING' ORDER BY step_order LIMIT 1) WHERE ${scope.sql} ORDER BY lr.created_at DESC`).bind(...scope.params).all<Record<string, unknown>>()).results;
  const csv = [["Employee No", "Employee Name", "Leave Type", "Start", "End", "Days", "Status", "Document Status"].join(","), ...rows.map((row) => [row.employee_no, row.employee_name, row.leave_type_name, row.start_date, row.end_date, row.requested_days, row.status, row.document_status].map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  await auditLeave(c, { action: "leave.report_exported", entityType: "leave_report", entityId: "requests", newValue: { rows: rows.length } });
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="leave-requests.csv"' } });
});

async function employeeRequests(c: Context<AppBindings>, employeeId: string) {
  const rows = await c.env.DB.prepare(`SELECT ${selectColumns()} FROM leave_requests lr INNER JOIN employees e ON e.id = lr.employee_id INNER JOIN leave_types lt ON lt.id = lr.leave_type_id LEFT JOIN leave_policies lp ON lp.id = lr.policy_id LEFT JOIN departments d ON d.id = e.primary_department_id LEFT JOIN positions p ON p.id = e.primary_position_id LEFT JOIN locations l ON l.id = e.primary_location_id LEFT JOIN leave_request_approvals pending ON pending.id = (SELECT id FROM leave_request_approvals WHERE leave_request_id = lr.id AND status = 'PENDING' ORDER BY step_order LIMIT 1) WHERE lr.employee_id = ? ORDER BY lr.created_at DESC`).bind(employeeId).all();
  return rows.results;
}

employeeLeaveRoutes.get("/:employeeId/leave/requests", requirePermission("employees.leave.view"), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), routeParam(c, "employeeId"), "leave", "view"))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  return ok(c, { requests: await employeeRequests(c, routeParam(c, "employeeId")) });
});

employeeLeaveRoutes.get("/:employeeId/leave/balances", requirePermission("employees.leave.view"), async (c) => {
  const employeeId = routeParam(c, "employeeId");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "leave", "view"))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const year = Number(c.req.query("period_year") ?? new Date().getUTCFullYear());
  const rows = await c.env.DB.prepare("SELECT lb.*, lt.name AS leave_type_name, lt.code AS leave_type_code FROM leave_balances lb INNER JOIN leave_types lt ON lt.id = lb.leave_type_id WHERE lb.employee_id = ? AND lb.period_year = ? ORDER BY lt.sort_order, lt.name").bind(employeeId, year).all();
  const cycles = await getEmployeeLeaveCycleSummary(c, employeeId);
  return ok(c, { balances: rows.results, balance_cycles: cycles.balance_cycles, ledger_recent: cycles.ledger_recent });
});

employeeLeaveRoutes.get("/:employeeId/leave/calendar", requirePermission("employees.leave.view"), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), routeParam(c, "employeeId"), "leave", "view"))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const rows = await c.env.DB.prepare("SELECT lrd.*, lr.status, lt.name AS leave_type_name FROM leave_request_days lrd INNER JOIN leave_requests lr ON lr.id = lrd.leave_request_id INNER JOIN leave_types lt ON lt.id = lr.leave_type_id WHERE lr.employee_id = ? AND lr.status IN ('PENDING_APPROVAL','APPROVED') ORDER BY lrd.leave_date").bind(routeParam(c, "employeeId")).all();
  return ok(c, { calendar: rows.results });
});

employeeLeaveRoutes.get("/:employeeId/leave/summary", requirePermission("employees.leave.view"), async (c) => {
  const employeeId = routeParam(c, "employeeId");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "leave", "view"))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const [requests, balances, calendar] = await Promise.all([
    employeeRequests(c, employeeId),
    c.env.DB.prepare("SELECT lb.*, lt.name AS leave_type_name, lt.code AS leave_type_code FROM leave_balances lb INNER JOIN leave_types lt ON lt.id = lb.leave_type_id WHERE lb.employee_id = ? ORDER BY lb.period_year DESC, lt.sort_order").bind(employeeId).all(),
    c.env.DB.prepare("SELECT lrd.*, lr.status, lt.name AS leave_type_name FROM leave_request_days lrd INNER JOIN leave_requests lr ON lr.id = lrd.leave_request_id INNER JOIN leave_types lt ON lt.id = lr.leave_type_id WHERE lr.employee_id = ? AND lr.status IN ('PENDING_APPROVAL','APPROVED') ORDER BY lrd.leave_date").bind(employeeId).all()
  ]);
  const cycles = await getEmployeeLeaveCycleSummary(c, employeeId);
  return ok(c, { requests, balances: balances.results, balance_cycles: cycles.balance_cycles, ledger_recent: cycles.ledger_recent, calendar: calendar.results });
});
