import { Hono } from "hono";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { buildEmployeeScopeWhereClause, canAccessEmployee } from "../auth/access-scopes";
import { recordAudit } from "../db/audit";
import { hasValidationErrors, validateAttendanceRosterRules, validateDuplicateConflict, validateLockedState, validationResponse } from "../lib/moduleValidation";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { publishAccessEvent } from "../realtime/publisher";
import type { AppBindings } from "../types";
import { fail, getClientIp, ok } from "../utils/http";
import { disabledModuleResponse, requireOperationalModuleEnabled } from "../utils/module-enforcement";
import { readJsonBody, readString } from "../utils/validation";

type BindValue = string | number | null;
type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EARLY_LEAVE" | "HALF_DAY" | "LEAVE" | "SICK_LEAVE" | "LONG_LEAVE" | "DAY_OFF" | "PUBLIC_HOLIDAY" | "MISSING_PUNCH" | "PENDING_CORRECTION" | "CORRECTED" | "SICK" | "OFF_DAY" | "HOLIDAY";
type AttendanceSource = "DEVICE" | "MANUAL" | "CORRECTION" | "LEAVE" | "ROSTER" | "SYSTEM";
type LogSource = "DEVICE" | "MANUAL" | "MANUAL_IMPORT" | "API" | "BRIDGE";
type RawSource = "DEVICE" | "MANUAL_IMPORT" | "CSV_IMPORT" | "API" | "BRIDGE" | "PUSH_ADMS";

const STATUSES = new Set(["PRESENT", "ABSENT", "LATE", "EARLY_LEAVE", "HALF_DAY", "LEAVE", "SICK_LEAVE", "LONG_LEAVE", "DAY_OFF", "PUBLIC_HOLIDAY", "MISSING_PUNCH", "PENDING_CORRECTION", "CORRECTED", "SICK", "OFF_DAY", "HOLIDAY"]);
const RECORD_SOURCES = new Set(["DEVICE", "MANUAL", "CORRECTION", "LEAVE", "ROSTER", "SYSTEM"]);
const LOG_SOURCES = new Set(["DEVICE", "MANUAL", "MANUAL_IMPORT", "API", "BRIDGE"]);
const RAW_SOURCES = new Set(["DEVICE", "MANUAL_IMPORT", "CSV_IMPORT", "API", "BRIDGE", "PUSH_ADMS"]);
const PUNCH_TYPES = new Set(["IN", "OUT", "BREAK_IN", "BREAK_OUT", "UNKNOWN"]);
const DEVICE_TYPES = new Set(["BIOMETRIC", "MANUAL_IMPORT", "API", "BRIDGE", "PUSH_ADMS", "OTHER"]);
const DEVICE_STATUSES = new Set(["ACTIVE", "INACTIVE", "DISABLED", "ARCHIVED"]);

export const attendanceRoutes = new Hono<AppBindings>();
export const employeeAttendanceRoutes = new Hono<AppBindings>();

attendanceRoutes.use("*", requireAuth);
employeeAttendanceRoutes.use("*", requireAuth);

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

function normalizeAttendanceStatus(value: unknown, fallback: AttendanceStatus = "PRESENT") {
  const status = readString(value).toUpperCase();
  if (status === "SICK") return "SICK_LEAVE";
  if (status === "OFF_DAY") return "DAY_OFF";
  if (status === "HOLIDAY") return "PUBLIC_HOLIDAY";
  return (STATUSES.has(status) ? status : fallback) as AttendanceStatus;
}

function isPendingCorrection(status: unknown) {
  return status === "PENDING" || status === "SUBMITTED";
}

function canOverrideAttendanceLock(c: Context<AppBindings>) {
  return hasAny(c, ["attendance.lock.override", "attendance.manage"]);
}

function requireAnyPermission(permissions: string[]) {
  return createMiddleware<AppBindings>(async (c, next) => {
    if (!hasAny(c, permissions)) return fail(c, 403, "FORBIDDEN", "You do not have permission to perform this action.");
    await next();
  });
}

async function auditAttendance(c: Context<AppBindings>, input: { action: string; entityType: string; entityId: string; oldValue?: unknown; newValue?: unknown; reason?: string | null }) {
  await recordAudit(c.env.DB, {
    actorUserId: c.get("currentUser").id,
    action: input.action,
    module: "attendance",
    entityType: input.entityType,
    entityId: input.entityId,
    oldValue: input.oldValue,
    newValue: input.newValue,
    reason: input.reason,
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent") ?? null
  });
}

async function requireAttendanceModuleEnabled(c: Context<AppBindings>, next: () => Promise<void>) {
  const path = c.req.path;
  if (path.includes("/attendance/settings")) {
    await next();
    return;
  }
  const moduleDisabled = await requireOperationalModuleEnabled(c, "attendance", "Attendance");
  if (moduleDisabled) return moduleDisabled;
  const settings = await getAttendanceSettings(c);
  if (Number(settings.module_enabled ?? 1) !== 1) {
    return disabledModuleResponse(c, "attendance", "Attendance");
  }
  await next();
}

attendanceRoutes.use("*", requireAttendanceModuleEnabled);
employeeAttendanceRoutes.use("*", requireAttendanceModuleEnabled);

async function publishAttendance(c: Context<AppBindings>, event: "attendance.changed" | "attendance.record.created" | "attendance.record.updated" | "attendance.raw_logs.imported" | "attendance.correction.created" | "attendance.correction.approved" | "attendance.correction.rejected" | "attendance.correction.cancelled" | "attendance.device.changed" | "employee.attendance.changed" | "dashboard.attendance.changed", entityId: string, action: string, entityType: "attendance_record" | "attendance_raw_log" | "attendance_correction" | "attendance_device" | "attendance_settings" | "attendance_report" = "attendance_record") {
  await publishAccessEvent(c.env, event, { actor_user_id: c.get("currentUser").id, entity_type: entityType, entity_id: entityId, action });
  if (event !== "attendance.changed") await publishAccessEvent(c.env, "attendance.changed", { actor_user_id: c.get("currentUser").id, entity_type: entityType, entity_id: entityId, action });
}

function recordColumns() {
  return `adr.*, e.employee_no, e.full_name AS employee_name,
    e.primary_department_id AS department_id, d.name AS department_name,
    e.primary_position_id AS position_id, p.title AS position_title,
    e.primary_location_id AS location_id, l.name AS location_name`;
}

function leaveStatusExpression() {
  return "CASE WHEN lower(lt.code) LIKE '%long%' OR lower(lt.name) LIKE '%long%' THEN 'LONG_LEAVE' WHEN lower(lt.code) LIKE '%sick%' OR lower(lt.name) LIKE '%sick%' THEN 'SICK_LEAVE' ELSE 'LEAVE' END";
}

async function leaveCalendarRows(c: Context<AppBindings>, input: { employeeId?: string; from?: string; to?: string }) {
  const params: BindValue[] = [];
  const conditions = [
    "lr.status = 'APPROVED'",
    "NOT EXISTS (SELECT 1 FROM attendance_daily_records adr WHERE adr.employee_id = lr.employee_id AND adr.attendance_date = lrd.leave_date)"
  ];
  const source = readString(c.req.query("source"));
  if (source && source !== "LEAVE") return [];
  const status = readString(c.req.query("status"));
  if (status && status !== "LEAVE" && status !== "SICK") return [];
  if (input.employeeId) {
    conditions.push("lr.employee_id = ?");
    params.push(input.employeeId);
  }
  const search = readString(c.req.query("search"));
  if (search) {
    conditions.push("(e.employee_no LIKE ? OR e.full_name LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }
  for (const [query, column] of [["department_id", "e.primary_department_id"], ["position_id", "e.primary_position_id"], ["location_id", "e.primary_location_id"]] as const) {
    const value = readString(c.req.query(query));
    if (value) {
      conditions.push(`${column} = ?`);
      params.push(value);
    }
  }
  if (input.from) {
    conditions.push("lrd.leave_date >= ?");
    params.push(input.from);
  }
  if (input.to) {
    conditions.push("lrd.leave_date <= ?");
    params.push(input.to);
  }
  if (status) conditions.push(`${leaveStatusExpression()} = '${status}'`);
  const rows = await c.env.DB.prepare(
    `SELECT 'leave_' || lrd.id AS id, lr.employee_id, e.employee_no, e.full_name AS employee_name,
       e.primary_department_id AS department_id, d.name AS department_name,
       e.primary_position_id AS position_id, p.title AS position_title,
       e.primary_location_id AS location_id, l.name AS location_name,
       lrd.leave_date AS attendance_date, ${leaveStatusExpression()} AS status,
       NULL AS first_clock_in, NULL AS last_clock_out, NULL AS total_work_minutes,
       0 AS late_minutes, 0 AS early_checkout_minutes, 0 AS missed_punch,
       'LEAVE' AS source, NULL AS payroll_impact_json, lr.id AS leave_request_id,
       lt.name AS notes, lr.created_at AS created_at, lr.updated_at AS updated_at
     FROM leave_request_days lrd
     INNER JOIN leave_requests lr ON lr.id = lrd.leave_request_id
     INNER JOIN leave_types lt ON lt.id = lr.leave_type_id
     INNER JOIN employees e ON e.id = lr.employee_id
     LEFT JOIN departments d ON d.id = e.primary_department_id
     LEFT JOIN positions p ON p.id = e.primary_position_id
     LEFT JOIN locations l ON l.id = e.primary_location_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY e.employee_no, lrd.leave_date`
  ).bind(...params).all<Record<string, unknown>>();
  return rows.results;
}

async function getEmployee(c: Context<AppBindings>, employeeId: string) {
  return c.env.DB.prepare("SELECT * FROM employees WHERE id = ? AND archived_at IS NULL").bind(employeeId).first<Record<string, unknown>>();
}

async function canViewAttendanceForEmployee(c: Context<AppBindings>, employeeId: string) {
  return canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "attendance", "view");
}

async function canManageAttendanceForEmployee(c: Context<AppBindings>, employeeId: string) {
  return canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "attendance", "manage");
}

async function getRecord(c: Context<AppBindings>, id: string) {
  return c.env.DB
    .prepare(
      `SELECT ${recordColumns()}
       FROM attendance_daily_records adr
       INNER JOIN employees e ON e.id = adr.employee_id
       LEFT JOIN departments d ON d.id = e.primary_department_id
       LEFT JOIN positions p ON p.id = e.primary_position_id
       LEFT JOIN locations l ON l.id = e.primary_location_id
       WHERE adr.id = ?`
    )
    .bind(id)
    .first<Record<string, unknown>>();
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime());
}

function minutesOfDay(time: string | null) {
  if (!time) return null;
  const match = /^(\d{2}):(\d{2})/.exec(time);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesBetween(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) return null;
  return Math.round((endDate.getTime() - startDate.getTime()) / 60000);
}

function clockOutBeforeIn(clockIn: string | null, clockOut: string | null) {
  if (!clockIn || !clockOut) return false;
  const a = new Date(clockIn);
  const b = new Date(clockOut);
  return !Number.isNaN(a.getTime()) && !Number.isNaN(b.getTime()) && b < a;
}

function payrollImpact(input: { status: string; late_minutes?: number | null; early_checkout_minutes?: number | null; missed_punch?: boolean; source: string; notes?: string | null }) {
  return JSON.stringify({
    absent_deduction_candidate: input.status === "ABSENT",
    late_deduction_candidate: Number(input.late_minutes ?? 0) > 0,
    early_checkout_deduction_candidate: Number(input.early_checkout_minutes ?? 0) > 0,
    missed_punch_requires_review: Boolean(input.missed_punch),
    source: input.source,
    notes: input.notes ?? null
  });
}

function dailyDerived(input: { status: AttendanceStatus; first_clock_in?: string | null; last_clock_out?: string | null; late_minutes?: number | null; early_checkout_minutes?: number | null; missed_punch?: boolean; payroll_impact_json?: string | null }) {
  const status = normalizeAttendanceStatus(input.status);
  const missingClockIn = !input.first_clock_in && !["LEAVE", "SICK_LEAVE", "LONG_LEAVE", "DAY_OFF", "PUBLIC_HOLIDAY"].includes(status);
  const missingClockOut = !input.last_clock_out && !["ABSENT", "LEAVE", "SICK_LEAVE", "LONG_LEAVE", "DAY_OFF", "PUBLIC_HOLIDAY"].includes(status);
  return {
    calculated_status: status,
    final_status: status,
    missing_clock_in: missingClockIn ? 1 : 0,
    missing_clock_out: missingClockOut ? 1 : 0,
    is_absent: status === "ABSENT" ? 1 : 0,
    is_late: status === "LATE" || Number(input.late_minutes ?? 0) > 0 ? 1 : 0,
    is_early_leave: status === "EARLY_LEAVE" || Number(input.early_checkout_minutes ?? 0) > 0 ? 1 : 0,
    is_half_day: status === "HALF_DAY" ? 1 : 0,
    is_leave_day: ["LEAVE", "SICK_LEAVE", "LONG_LEAVE"].includes(status) ? 1 : 0,
    is_public_holiday: status === "PUBLIC_HOLIDAY" ? 1 : 0,
    is_day_off: status === "DAY_OFF" ? 1 : 0,
    payroll_impact_status: input.payroll_impact_json ? "PENDING_REVIEW" : "NONE",
    payroll_impact_minutes: Number(input.late_minutes ?? 0) + Number(input.early_checkout_minutes ?? 0),
    payroll_impact_days: status === "ABSENT" ? 1 : status === "HALF_DAY" ? 0.5 : 0,
    payroll_impact_reason: input.payroll_impact_json ? "Generated from attendance status." : null
  };
}

async function requireAttendanceRecordUnlocked(c: Context<AppBindings>, record: Record<string, unknown>) {
  const issues = validateLockedState({
    locked: Number(record.locked_for_payroll ?? 0) === 1 && !canOverrideAttendanceLock(c),
    field: "locked_for_payroll",
    message: "This attendance record is locked for payroll. Override permission is required."
  });
  if (hasValidationErrors(issues)) return validationResponse(c, issues, 423);
  return null;
}

function parseJsonObject(value: unknown) {
  if (!value) return {};
  if (typeof value === "object") return value as Record<string, unknown>;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function attendanceSnapshot(record: Record<string, unknown> | null | undefined) {
  return {
    record_id: record?.id ?? null,
    status: record?.status ?? null,
    calculated_status: record?.calculated_status ?? null,
    final_status: record?.final_status ?? null,
    first_clock_in: record?.first_clock_in ?? null,
    last_clock_out: record?.last_clock_out ?? null,
    total_work_minutes: record?.total_work_minutes ?? null,
    late_minutes: record?.late_minutes ?? null,
    early_checkout_minutes: record?.early_checkout_minutes ?? null,
    missed_punch: record?.missed_punch ?? null,
    source: record?.source ?? null,
    locked_for_payroll: record?.locked_for_payroll ?? 0
  };
}

async function getSettings(c: Context<AppBindings>) {
  let settings = await c.env.DB.prepare("SELECT * FROM attendance_settings WHERE id = 'attendance_settings_default'").first<Record<string, unknown>>();
  if (!settings) {
    await c.env.DB.prepare(
      `INSERT INTO attendance_settings (
        id, module_enabled, default_workday_mode, standard_work_minutes_per_day,
        default_shift_start_time, default_shift_end_time, late_grace_minutes, early_checkout_grace_minutes,
        weekly_off_days_json, mark_absent_if_no_punch, missed_punch_requires_correction,
        allow_manual_entries, require_reason_for_manual_entries, allow_employee_correction_requests,
        manual_entry_requires_approval, correction_requires_approval, payroll_impact_enabled,
        default_attendance_source, allow_manager_team_corrections, require_reason_for_correction_review,
        overtime_tracking_enabled, lock_after_payroll_finalized, monthly_attendance_lock_day,
        default_absent_status, attendance_source_options_json, payroll_deduction_enabled
      ) VALUES ('attendance_settings_default', 1, 'FIXED_SHIFT', 480, '09:00', '18:00', 10, 10, '["FRIDAY"]', 1, 1, 1, 1, 1, 0, 1, 1, 'DEVICE', 0, 1, 0, 1, NULL, 'ABSENT', '["DEVICE","MANUAL","MANUAL_IMPORT","API","BRIDGE"]', 1)`
    ).run();
    settings = await c.env.DB.prepare("SELECT * FROM attendance_settings WHERE id = 'attendance_settings_default'").first<Record<string, unknown>>();
  }
  return settings!;
}

async function getAttendanceSettings(c: Context<AppBindings>) {
  return getSettings(c);
}

function calculateDailyAttendanceStatus(input: { missed: boolean; late: number; early: number; settings: Record<string, unknown>; leaveStatus?: AttendanceStatus | null; dayOverrideStatus?: AttendanceStatus | null }) {
  if (input.leaveStatus) return input.leaveStatus;
  if (input.dayOverrideStatus) return input.dayOverrideStatus;
  if (input.missed) return Number(input.settings.missed_punch_requires_correction ?? 1) === 1 ? "PENDING_CORRECTION" : "MISSING_PUNCH";
  if (input.early > 0) return "EARLY_LEAVE";
  if (input.late > 0) return "LATE";
  return "PRESENT";
}

function readRecordInput(body: Record<string, unknown>, existing?: Record<string, unknown>) {
  const status = normalizeAttendanceStatus(body.status || existing?.status || "PRESENT");
  const source = readString(body.source || existing?.source || "MANUAL").toUpperCase();
  return {
    employee_id: readString(body.employee_id || existing?.employee_id),
    attendance_date: readString(body.attendance_date || existing?.attendance_date),
    status,
    first_clock_in: optionalString(body.first_clock_in ?? existing?.first_clock_in),
    last_clock_out: optionalString(body.last_clock_out ?? existing?.last_clock_out),
    total_work_minutes: num(body.total_work_minutes, existing?.total_work_minutes == null ? null : Number(existing.total_work_minutes)),
    late_minutes: num(body.late_minutes, existing?.late_minutes == null ? null : Number(existing.late_minutes)),
    early_checkout_minutes: num(body.early_checkout_minutes, existing?.early_checkout_minutes == null ? null : Number(existing.early_checkout_minutes)),
    missed_punch: bool(body.missed_punch, Boolean(existing?.missed_punch)),
    source: (RECORD_SOURCES.has(source) ? source : "MANUAL") as AttendanceSource,
    leave_request_id: optionalString(body.leave_request_id ?? existing?.leave_request_id),
    notes: optionalString(body.notes ?? existing?.notes)
  };
}

function validateRecord(input: ReturnType<typeof readRecordInput>) {
  if (!input.employee_id || !input.attendance_date || !validDate(input.attendance_date)) return "Employee and valid attendance date are required.";
  if (clockOutBeforeIn(input.first_clock_in, input.last_clock_out)) return "Clock-out cannot be before clock-in.";
  if (Number(input.total_work_minutes ?? 0) < 0 || Number(input.late_minutes ?? 0) < 0 || Number(input.early_checkout_minutes ?? 0) < 0) return "Attendance minutes cannot be negative.";
  return null;
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

function buildRecordFilters(c: Context<AppBindings>) {
  const conditions: string[] = [];
  const params: BindValue[] = [];
  const search = readString(c.req.query("search"));
  if (search) {
    conditions.push("(e.employee_no LIKE ? OR e.full_name LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }
  const filters = [
    ["employee_id", "adr.employee_id"],
    ["department_id", "e.primary_department_id"],
    ["position_id", "e.primary_position_id"],
    ["location_id", "e.primary_location_id"],
    ["status", "adr.status"],
    ["source", "adr.source"]
  ] as const;
  for (const [query, column] of filters) {
    const value = readString(c.req.query(query));
    if (value) {
      conditions.push(`${column} = ?`);
      params.push(value);
    }
  }
  addRange(c, conditions, params, "date", "adr.attendance_date");
  const missed = readString(c.req.query("missed_punch"));
  if (missed === "true" || missed === "false") {
    conditions.push("adr.missed_punch = ?");
    params.push(missed === "true" ? 1 : 0);
  }
  if (readString(c.req.query("late_only")) === "true") conditions.push("COALESCE(adr.late_minutes, 0) > 0");
  if (readString(c.req.query("early_checkout_only")) === "true") conditions.push("COALESCE(adr.early_checkout_minutes, 0) > 0");
  if (readString(c.req.query("payroll_impact")) === "true") conditions.push("adr.payroll_impact_json IS NOT NULL");
  return { conditions, params };
}

attendanceRoutes.get("/records", requirePermission("attendance.view"), async (c) => {
  const { conditions, params } = buildRecordFilters(c);
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "attendance", "view", "e");
  conditions.push(scope.sql);
  params.push(...scope.params);
  const rows = await c.env.DB
    .prepare(
      `SELECT ${recordColumns()}
       FROM attendance_daily_records adr
       INNER JOIN employees e ON e.id = adr.employee_id
       LEFT JOIN departments d ON d.id = e.primary_department_id
       LEFT JOIN positions p ON p.id = e.primary_position_id
       LEFT JOIN locations l ON l.id = e.primary_location_id
       ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY adr.attendance_date DESC, e.employee_no`
    )
    .bind(...params)
    .all();
  return ok(c, { records: rows.results });
});

attendanceRoutes.get("/daily", requireAnyPermission(["attendance.view", "attendance.logs.view"]), async (c) => {
  const { conditions, params } = buildRecordFilters(c);
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "attendance", "view", "e");
  conditions.push(scope.sql);
  params.push(...scope.params);
  const rows = await c.env.DB
    .prepare(
      `SELECT ${recordColumns()}
       FROM attendance_daily_records adr
       INNER JOIN employees e ON e.id = adr.employee_id
       LEFT JOIN departments d ON d.id = e.primary_department_id
       LEFT JOIN positions p ON p.id = e.primary_position_id
       LEFT JOIN locations l ON l.id = e.primary_location_id
       ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY adr.attendance_date DESC, e.employee_no`
    )
    .bind(...params)
    .all();
  return ok(c, { records: rows.results, daily_records: rows.results });
});

attendanceRoutes.post("/daily/refresh", requireAnyPermission(["attendance.daily.refresh", "attendance.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const employeeId = readString(body.employee_id);
  const from = readString(body.date_from ?? body.attendance_date);
  const to = readString(body.date_to ?? body.attendance_date ?? from);
  if (!employeeId || !validDate(from) || !validDate(to)) return fail(c, 400, "VALIDATION_ERROR", "Employee and valid date range are required.");
  if (!(await canManageAttendanceForEmployee(c, employeeId))) return fail(c, 403, "FORBIDDEN", "You do not have access to this employee.");
  const refreshed = await refreshAttendanceRange(c, employeeId, from, to);
  await auditAttendance(c, { action: "attendance.daily.refreshed", entityType: "attendance_record", entityId: employeeId, newValue: { date_from: from, date_to: to, refreshed } });
  return ok(c, { refreshed });
});

attendanceRoutes.get("/payroll-impact", requireAnyPermission(["attendance.payroll_impact.view", "payroll.attendance_impacts.view", "attendance.view"]), async (c) => {
  const impacts = await getAttendancePayrollImpact(c);
  return ok(c, impacts);
});

async function getAttendancePayrollImpact(c: Context<AppBindings>) {
  const { conditions, params } = buildRecordFilters(c);
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "attendance", "view", "e");
  conditions.push(scope.sql);
  params.push(...scope.params);
  conditions.push("(adr.payroll_impact_json IS NOT NULL OR adr.payroll_impact_status IS NOT NULL OR adr.status IN ('ABSENT','LATE','EARLY_LEAVE','HALF_DAY','MISSING_PUNCH'))");
  const rows = await c.env.DB.prepare(
    `SELECT ${recordColumns()}
     FROM attendance_daily_records adr
     INNER JOIN employees e ON e.id = adr.employee_id
     LEFT JOIN departments d ON d.id = e.primary_department_id
     LEFT JOIN positions p ON p.id = e.primary_position_id
     LEFT JOIN locations l ON l.id = e.primary_location_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY adr.attendance_date DESC LIMIT 1000`
  ).bind(...params).all<Record<string, unknown>>();
  const impacts = rows.results.map((row) => ({ ...row, payroll_impact: parseJsonObject(row.payroll_impact_json) }));
  return { impacts, records: impacts };
}

attendanceRoutes.get("/records/:id", requirePermission("attendance.view"), async (c) => {
  const record = await getRecord(c, routeParam(c, "id"));
  if (!record) return fail(c, 404, "NOT_FOUND", "Attendance record was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(record.employee_id), "attendance", "view"))) return fail(c, 404, "NOT_FOUND", "Attendance record was not found.");
  return ok(c, { record });
});

attendanceRoutes.post("/records", requirePermission("attendance.manage"), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const input = readRecordInput(body);
  const validation = validateRecord(input);
  if (validation) return fail(c, 400, "VALIDATION_ERROR", validation);
  const ruleIssues = validateAttendanceRosterRules({ date: input.attendance_date, startTime: input.first_clock_in, endTime: input.last_clock_out });
  if (hasValidationErrors(ruleIssues)) return validationResponse(c, ruleIssues);
  if (!(await getEmployee(c, input.employee_id))) return fail(c, 400, "INVALID_EMPLOYEE", "Employee was not found or is archived.");
  if (!(await canManageAttendanceForEmployee(c, input.employee_id))) return fail(c, 403, "FORBIDDEN", "You do not have access to this employee.");
  const duplicate = await c.env.DB.prepare("SELECT id FROM attendance_daily_records WHERE employee_id = ? AND attendance_date = ?").bind(input.employee_id, input.attendance_date).first();
  const duplicateIssues = validateDuplicateConflict(duplicate, "attendance_date", "A daily attendance record already exists. Update the existing record instead.");
  if (hasValidationErrors(duplicateIssues)) return validationResponse(c, duplicateIssues, 409);
  const id = crypto.randomUUID();
  const total = input.total_work_minutes ?? minutesBetween(input.first_clock_in, input.last_clock_out);
  const impact = payrollImpact({ ...input, source: input.source });
  const derived = dailyDerived({ ...input, payroll_impact_json: impact });
  await c.env.DB
    .prepare(
      `INSERT INTO attendance_daily_records
       (id, employee_id, attendance_date, status, calculated_status, final_status, first_clock_in, last_clock_out, total_work_minutes, late_minutes, early_checkout_minutes, missed_punch,
        missing_clock_in, missing_clock_out, is_absent, is_late, is_early_leave, is_half_day, is_leave_day, is_public_holiday, is_day_off,
        source, payroll_impact_json, payroll_impact_status, payroll_impact_minutes, payroll_impact_days, payroll_impact_reason, leave_request_id, notes, created_by_user_id, updated_by_user_id, generated_by, generated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id, input.employee_id, input.attendance_date, input.status, derived.calculated_status, derived.final_status, input.first_clock_in, input.last_clock_out, total, input.late_minutes, input.early_checkout_minutes, input.missed_punch ? 1 : 0,
      derived.missing_clock_in, derived.missing_clock_out, derived.is_absent, derived.is_late, derived.is_early_leave, derived.is_half_day, derived.is_leave_day, derived.is_public_holiday, derived.is_day_off,
      input.source, impact, derived.payroll_impact_status, derived.payroll_impact_minutes, derived.payroll_impact_days, derived.payroll_impact_reason, input.leave_request_id, input.notes, c.get("currentUser").id, c.get("currentUser").id, "MANUAL", new Date().toISOString()
    )
    .run();
  await auditAttendance(c, { action: "attendance.record.created", entityType: "attendance_record", entityId: id, newValue: input });
  await publishAttendance(c, "attendance.record.created", id, "created");
  await publishAttendance(c, "employee.attendance.changed", input.employee_id, "record_created", "attendance_record");
  return ok(c, { record: await getRecord(c, id) }, 201);
});

attendanceRoutes.patch("/records/:id", requirePermission("attendance.manage"), async (c) => {
  const id = routeParam(c, "id");
  const old = await getRecord(c, id);
  if (!old) return fail(c, 404, "NOT_FOUND", "Attendance record was not found.");
  const locked = await requireAttendanceRecordUnlocked(c, old);
  if (locked) return locked;
  if (!(await canManageAttendanceForEmployee(c, String(old.employee_id)))) return fail(c, 404, "NOT_FOUND", "Attendance record was not found.");
  const body = await readJsonBody(c.req.raw);
  const reason = optionalString(body.reason);
  const input = readRecordInput(body, old);
  const validation = validateRecord(input);
  if (validation) return fail(c, 400, "VALIDATION_ERROR", validation);
  const ruleIssues = validateAttendanceRosterRules({ date: input.attendance_date, startTime: input.first_clock_in, endTime: input.last_clock_out });
  if (hasValidationErrors(ruleIssues)) return validationResponse(c, ruleIssues);
  const changedImportant = ["status", "first_clock_in", "last_clock_out", "late_minutes", "early_checkout_minutes", "missed_punch"].some((key) => String(old[key] ?? "") !== String((input as Record<string, unknown>)[key] ?? ""));
  if (changedImportant && !reason) return fail(c, 400, "REASON_REQUIRED", "Manual attendance updates require a reason.");
  const total = input.total_work_minutes ?? minutesBetween(input.first_clock_in, input.last_clock_out);
  const impact = payrollImpact({ ...input, source: input.source });
  const derived = dailyDerived({ ...input, payroll_impact_json: impact });
  await c.env.DB
    .prepare(
      `UPDATE attendance_daily_records
       SET status = ?, calculated_status = ?, final_status = ?, first_clock_in = ?, last_clock_out = ?, total_work_minutes = ?, late_minutes = ?, early_checkout_minutes = ?,
         missed_punch = ?, missing_clock_in = ?, missing_clock_out = ?, is_absent = ?, is_late = ?, is_early_leave = ?, is_half_day = ?, is_leave_day = ?,
         is_public_holiday = ?, is_day_off = ?, source = ?, payroll_impact_json = ?, payroll_impact_status = ?, payroll_impact_minutes = ?,
         payroll_impact_days = ?, payroll_impact_reason = ?, correction_status = NULL, leave_request_id = ?, notes = ?, updated_by_user_id = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(
      input.status, derived.calculated_status, derived.final_status, input.first_clock_in, input.last_clock_out, total, input.late_minutes, input.early_checkout_minutes,
      input.missed_punch ? 1 : 0, derived.missing_clock_in, derived.missing_clock_out, derived.is_absent, derived.is_late, derived.is_early_leave, derived.is_half_day, derived.is_leave_day,
      derived.is_public_holiday, derived.is_day_off, input.source, impact, derived.payroll_impact_status, derived.payroll_impact_minutes,
      derived.payroll_impact_days, derived.payroll_impact_reason, input.leave_request_id, input.notes, c.get("currentUser").id, new Date().toISOString(), id
    )
    .run();
  await auditAttendance(c, { action: "attendance.record.updated", entityType: "attendance_record", entityId: id, oldValue: old, newValue: input, reason });
  await publishAttendance(c, "attendance.record.updated", id, "updated");
  await publishAttendance(c, "employee.attendance.changed", String(old.employee_id), "record_updated", "attendance_record");
  return ok(c, { record: await getRecord(c, id) });
});

async function reconcileEmployeeDate(c: Context<AppBindings>, employeeId: string, attendanceDate: string) {
  return refreshDailyAttendanceRecord(c, employeeId, attendanceDate);
}

async function refreshDailyAttendanceRecord(c: Context<AppBindings>, employeeId: string, attendanceDate: string) {
  const settings = await getAttendanceSettings(c);
  const dayStart = `${attendanceDate}T00:00:00.000Z`;
  const dayEnd = `${attendanceDate}T23:59:59.999Z`;
  const logs = (await c.env.DB.prepare(
    `SELECT punch_time, punch_type, source FROM attendance_raw_logs WHERE employee_id = ? AND punch_time BETWEEN ? AND ?
     UNION ALL
     SELECT log_time AS punch_time, log_type AS punch_type, source FROM attendance_logs WHERE employee_id = ? AND is_archived = 0 AND log_time BETWEEN ? AND ?
     ORDER BY punch_time`
  ).bind(employeeId, dayStart, dayEnd, employeeId, dayStart, dayEnd).all<Record<string, unknown>>()).results;
  if (!logs.length) return null;
  const inLogs = logs.filter((row) => row.punch_type === "IN" || row.punch_type === "UNKNOWN");
  const outLogs = logs.filter((row) => row.punch_type === "OUT" || row.punch_type === "UNKNOWN");
  const first = String((inLogs[0] ?? logs[0]).punch_time);
  const last = String((outLogs[outLogs.length - 1] ?? logs[logs.length - 1]).punch_time);
  const missed = logs.length === 1 || !inLogs.length || !outLogs.length;
  const shiftStart = minutesOfDay(String(settings.default_shift_start_time ?? ""));
  const shiftEnd = minutesOfDay(String(settings.default_shift_end_time ?? ""));
  const clockInMinutes = minutesOfDay(first.slice(11, 16));
  const clockOutMinutes = minutesOfDay(last.slice(11, 16));
  const late = shiftStart != null && clockInMinutes != null ? Math.max(0, clockInMinutes - shiftStart - Number(settings.late_grace_minutes ?? 0)) : 0;
  const early = shiftEnd != null && clockOutMinutes != null ? Math.max(0, shiftEnd - clockOutMinutes - Number(settings.early_checkout_grace_minutes ?? 0)) : 0;
  const status = calculateDailyAttendanceStatus({ missed, late, early, settings });
  const existing = await c.env.DB.prepare("SELECT * FROM attendance_daily_records WHERE employee_id = ? AND attendance_date = ?").bind(employeeId, attendanceDate).first<Record<string, unknown>>();
  if (existing && Number(existing.locked_for_payroll ?? 0) === 1) return String(existing.id);
  const id = existing?.id ? String(existing.id) : crypto.randomUUID();
  const impact = payrollImpact({ status, late_minutes: late, early_checkout_minutes: early, missed_punch: missed, source: "DEVICE", notes: "Generated from raw attendance logs." });
  const derived = dailyDerived({ status, first_clock_in: first, last_clock_out: missed ? null : last, late_minutes: late, early_checkout_minutes: early, missed_punch: missed, payroll_impact_json: impact });
  if (existing) {
    await c.env.DB.prepare(
      `UPDATE attendance_daily_records SET status = ?, calculated_status = ?, final_status = ?, first_clock_in = ?, last_clock_out = ?, total_work_minutes = ?, late_minutes = ?, early_checkout_minutes = ?,
       missed_punch = ?, missing_clock_in = ?, missing_clock_out = ?, is_absent = ?, is_late = ?, is_early_leave = ?, is_half_day = ?, is_leave_day = ?, is_public_holiday = ?, is_day_off = ?,
       source = 'DEVICE', payroll_impact_json = ?, payroll_impact_status = ?, payroll_impact_minutes = ?, payroll_impact_days = ?, payroll_impact_reason = ?, generated_by = 'SYSTEM', generated_at = ?, updated_at = ? WHERE id = ?`
    ).bind(status, derived.calculated_status, derived.final_status, first, missed ? null : last, missed ? null : minutesBetween(first, last), late, early, missed ? 1 : 0, derived.missing_clock_in, derived.missing_clock_out, derived.is_absent, derived.is_late, derived.is_early_leave, derived.is_half_day, derived.is_leave_day, derived.is_public_holiday, derived.is_day_off, impact, derived.payroll_impact_status, derived.payroll_impact_minutes, derived.payroll_impact_days, derived.payroll_impact_reason, new Date().toISOString(), new Date().toISOString(), id).run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO attendance_daily_records (id, employee_id, attendance_date, status, calculated_status, final_status, first_clock_in, last_clock_out, total_work_minutes, late_minutes, early_checkout_minutes, missed_punch,
       missing_clock_in, missing_clock_out, is_absent, is_late, is_early_leave, is_half_day, is_leave_day, is_public_holiday, is_day_off, source, payroll_impact_json, payroll_impact_status, payroll_impact_minutes, payroll_impact_days, payroll_impact_reason, generated_by, generated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DEVICE', ?, ?, ?, ?, ?, 'SYSTEM', ?)`
    ).bind(id, employeeId, attendanceDate, status, derived.calculated_status, derived.final_status, first, missed ? null : last, missed ? null : minutesBetween(first, last), late, early, missed ? 1 : 0, derived.missing_clock_in, derived.missing_clock_out, derived.is_absent, derived.is_late, derived.is_early_leave, derived.is_half_day, derived.is_leave_day, derived.is_public_holiday, derived.is_day_off, impact, derived.payroll_impact_status, derived.payroll_impact_minutes, derived.payroll_impact_days, derived.payroll_impact_reason, new Date().toISOString()).run();
  }
  return id;
}

async function refreshAttendanceRange(c: Context<AppBindings>, employeeId: string, from: string, to: string) {
  const refreshed: string[] = [];
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  for (let day = start; day <= end; day = new Date(day.getTime() + 86400000)) {
    const recordId = await refreshDailyAttendanceRecord(c, employeeId, day.toISOString().slice(0, 10));
    if (recordId) refreshed.push(recordId);
  }
  return refreshed;
}

attendanceRoutes.post("/records/:id/recalculate-placeholder", requirePermission("attendance.manage"), async (c) => {
  const record = await getRecord(c, routeParam(c, "id"));
  if (!record) return fail(c, 404, "NOT_FOUND", "Attendance record was not found.");
  const id = await reconcileEmployeeDate(c, String(record.employee_id), String(record.attendance_date));
  await auditAttendance(c, { action: "attendance.record.recalculated", entityType: "attendance_record", entityId: routeParam(c, "id"), newValue: { recalculated_record_id: id } });
  return ok(c, { record: id ? await getRecord(c, id) : record });
});

attendanceRoutes.get("/calendar", requirePermission("attendance.view"), async (c) => {
  const { conditions, params } = buildRecordFilters(c);
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "attendance", "view", "e");
  conditions.push(scope.sql);
  params.push(...scope.params);
  const month = readString(c.req.query("month"));
  let overlayFrom = readString(c.req.query("date_from"));
  let overlayTo = readString(c.req.query("date_to"));
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    conditions.push("adr.attendance_date BETWEEN ? AND ?");
    params.push(`${month}-01`, `${month}-31`);
    overlayFrom = `${month}-01`;
    overlayTo = `${month}-31`;
  }
  const rows = await c.env.DB.prepare(`SELECT ${recordColumns()} FROM attendance_daily_records adr INNER JOIN employees e ON e.id = adr.employee_id LEFT JOIN departments d ON d.id = e.primary_department_id LEFT JOIN positions p ON p.id = e.primary_position_id LEFT JOIN locations l ON l.id = e.primary_location_id ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY e.employee_no, adr.attendance_date`).bind(...params).all();
  const leaveRows = await leaveCalendarRows(c, { from: overlayFrom, to: overlayTo });
  return ok(c, { calendar: [...rows.results, ...leaveRows].sort((a, b) => String(a.employee_no ?? "").localeCompare(String(b.employee_no ?? "")) || String(a.attendance_date ?? "").localeCompare(String(b.attendance_date ?? ""))) });
});

function readDeviceInput(body: Record<string, unknown>, existing?: Record<string, unknown>) {
  const type = readString(body.type || existing?.type || "BIOMETRIC").toUpperCase();
  const status = readString(body.status || existing?.status || "ACTIVE").toUpperCase();
  const vendor = readString(body.vendor || existing?.vendor || "ZKTECO").toUpperCase();
  const deviceMode = readString(body.device_mode || existing?.device_mode || "CSV_IMPORT").toUpperCase();
  const directionMode = readString(body.direction_mode || existing?.direction_mode || "IN_OUT").toUpperCase();
  return {
    name: readString(body.name || existing?.name),
    device_code: readString(body.device_code || existing?.device_code),
    location_id: optionalString(body.location_id ?? existing?.location_id),
    vendor: ["ZKTECO", "ZKTIME", "ZKBIO_TIME", "MANUAL_IMPORT", "GENERIC_API", "OTHER"].includes(vendor) ? vendor : "ZKTECO",
    model: optionalString(body.model ?? existing?.model),
    type: DEVICE_TYPES.has(type) ? type : "BIOMETRIC",
    ip_address: optionalString(body.ip_address ?? existing?.ip_address),
    port: num(body.port ?? existing?.port, null),
    serial_number: optionalString(body.serial_number ?? existing?.serial_number),
    timezone: optionalString(body.timezone ?? existing?.timezone),
    device_mode: ["CSV_IMPORT", "LOCAL_BRIDGE", "PUSH_ADMS", "API_PLACEHOLDER", "MANUAL"].includes(deviceMode) ? deviceMode : "CSV_IMPORT",
    direction_mode: ["IN_OUT", "AUTO_PAIR", "PUNCH_STATE", "UNKNOWN"].includes(directionMode) ? directionMode : "IN_OUT",
    external_device_id: optionalString(body.external_device_id ?? existing?.external_device_id),
    adms_device_key: optionalString(body.adms_device_key ?? existing?.adms_device_key),
    sync_enabled: bool(body.sync_enabled, Boolean(existing?.sync_enabled ?? 0)),
    allow_csv_import: bool(body.allow_csv_import, Boolean(existing?.allow_csv_import ?? 1)),
    allow_bridge_import: bool(body.allow_bridge_import, Boolean(existing?.allow_bridge_import ?? 0)),
    allow_push_adms: bool(body.allow_push_adms, Boolean(existing?.allow_push_adms ?? 0)),
    status: DEVICE_STATUSES.has(status) ? status : "ACTIVE",
    notes: optionalString(body.notes ?? existing?.notes)
  };
}

attendanceRoutes.get("/devices", requireAnyPermission(["attendance.devices.view", "attendance.devices.manage", "attendance.view"]), async (c) => {
  const rows = await c.env.DB.prepare("SELECT ad.*, l.name AS location_name FROM attendance_devices ad LEFT JOIN locations l ON l.id = ad.location_id ORDER BY ad.status, ad.name").all();
  return ok(c, { devices: rows.results });
});

attendanceRoutes.get("/devices/:id", requireAnyPermission(["attendance.devices.view", "attendance.devices.manage", "attendance.view"]), async (c) => {
  const device = await c.env.DB.prepare("SELECT ad.*, l.name AS location_name FROM attendance_devices ad LEFT JOIN locations l ON l.id = ad.location_id WHERE ad.id = ?").bind(routeParam(c, "id")).first();
  if (!device) return fail(c, 404, "NOT_FOUND", "Attendance device was not found.");
  return ok(c, { device });
});

attendanceRoutes.post("/devices", requireAnyPermission(["attendance.devices.create", "attendance.devices.manage"]), async (c) => {
  const input = readDeviceInput(await readJsonBody(c.req.raw));
  if (!input.name || !input.device_code) return fail(c, 400, "VALIDATION_ERROR", "Device name and code are required.");
  const id = crypto.randomUUID();
  try {
    await c.env.DB.prepare(
      `INSERT INTO attendance_devices
        (id, name, device_code, location_id, vendor, model, type, ip_address, port, serial_number, timezone,
         device_mode, direction_mode, external_device_id, adms_device_key, sync_enabled, allow_csv_import,
         allow_bridge_import, allow_push_adms, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, input.name, input.device_code, input.location_id, input.vendor, input.model, input.type, input.ip_address, input.port, input.serial_number, input.timezone, input.device_mode, input.direction_mode, input.external_device_id, input.adms_device_key, input.sync_enabled ? 1 : 0, input.allow_csv_import ? 1 : 0, input.allow_bridge_import ? 1 : 0, input.allow_push_adms ? 1 : 0, input.status, input.notes).run();
  } catch {
    return fail(c, 409, "DUPLICATE_DEVICE", "Device code must be unique.");
  }
  await auditAttendance(c, { action: "attendance.device.created", entityType: "attendance_device", entityId: id, newValue: input });
  await publishAttendance(c, "attendance.device.changed", id, "created", "attendance_device");
  return ok(c, { device: await c.env.DB.prepare("SELECT * FROM attendance_devices WHERE id = ?").bind(id).first() }, 201);
});

attendanceRoutes.patch("/devices/:id", requireAnyPermission(["attendance.devices.update", "attendance.devices.manage"]), async (c) => {
  const id = routeParam(c, "id");
  const old = await c.env.DB.prepare("SELECT * FROM attendance_devices WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!old) return fail(c, 404, "NOT_FOUND", "Attendance device was not found.");
  const input = readDeviceInput(await readJsonBody(c.req.raw), old);
  if (!input.name || !input.device_code) return fail(c, 400, "VALIDATION_ERROR", "Device name and code are required.");
  await c.env.DB.prepare(
    `UPDATE attendance_devices
     SET name = ?, device_code = ?, location_id = ?, vendor = ?, model = ?, type = ?, ip_address = ?, port = ?,
       serial_number = ?, timezone = ?, device_mode = ?, direction_mode = ?, external_device_id = ?, adms_device_key = ?,
       sync_enabled = ?, allow_csv_import = ?, allow_bridge_import = ?, allow_push_adms = ?, status = ?, notes = ?, updated_at = ?
     WHERE id = ?`
  ).bind(input.name, input.device_code, input.location_id, input.vendor, input.model, input.type, input.ip_address, input.port, input.serial_number, input.timezone, input.device_mode, input.direction_mode, input.external_device_id, input.adms_device_key, input.sync_enabled ? 1 : 0, input.allow_csv_import ? 1 : 0, input.allow_bridge_import ? 1 : 0, input.allow_push_adms ? 1 : 0, input.status, input.notes, new Date().toISOString(), id).run();
  await auditAttendance(c, { action: "attendance.device.updated", entityType: "attendance_device", entityId: id, oldValue: old, newValue: input });
  await publishAttendance(c, "attendance.device.changed", id, "updated", "attendance_device");
  return ok(c, { device: await c.env.DB.prepare("SELECT * FROM attendance_devices WHERE id = ?").bind(id).first() });
});

async function deviceStatus(c: Context<AppBindings>, status: "ACTIVE" | "DISABLED") {
  const id = routeParam(c, "id");
  const old = await c.env.DB.prepare("SELECT * FROM attendance_devices WHERE id = ?").bind(id).first();
  if (!old) return fail(c, 404, "NOT_FOUND", "Attendance device was not found.");
  await c.env.DB.prepare("UPDATE attendance_devices SET status = ?, updated_at = ? WHERE id = ?").bind(status, new Date().toISOString(), id).run();
  await auditAttendance(c, { action: status === "ACTIVE" ? "attendance.device.enabled" : "attendance.device.disabled", entityType: "attendance_device", entityId: id, oldValue: old, newValue: { status } });
  await publishAttendance(c, "attendance.device.changed", id, status.toLowerCase(), "attendance_device");
  return ok(c, { enabled: status === "ACTIVE" });
}

attendanceRoutes.post("/devices/:id/enable", requirePermission("attendance.devices.manage"), (c) => deviceStatus(c, "ACTIVE"));
attendanceRoutes.post("/devices/:id/disable", requirePermission("attendance.devices.manage"), (c) => deviceStatus(c, "DISABLED"));

attendanceRoutes.get("/raw-logs", requirePermission("attendance.view"), async (c) => {
  const conditions: string[] = [];
  const params: BindValue[] = [];
  for (const [query, column] of [["employee_id", "arl.employee_id"], ["device_id", "arl.device_id"], ["source", "arl.source"], ["punch_type", "arl.punch_type"]] as const) {
    const value = readString(c.req.query(query));
    if (value) {
      conditions.push(`${column} = ?`);
      params.push(value);
    }
  }
  addRange(c, conditions, params, "punch", "arl.punch_time");
  const rows = await c.env.DB.prepare(`SELECT arl.*, e.employee_no, e.full_name AS employee_name, ad.name AS device_name, ad.device_code FROM attendance_raw_logs arl LEFT JOIN employees e ON e.id = arl.employee_id LEFT JOIN attendance_devices ad ON ad.id = arl.device_id ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY arl.punch_time DESC LIMIT 500`).bind(...params).all();
  return ok(c, { logs: rows.results, raw_logs: rows.results });
});

attendanceRoutes.post("/raw-logs/import", requirePermission("attendance.devices.manage"), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const logs = Array.isArray(body.logs) ? body.logs as Record<string, unknown>[] : [body];
  let inserted = 0;
  let skipped = 0;
  const touched = new Set<string>();
  for (const log of logs) {
    const deviceId = optionalString(log.device_id);
    if (deviceId) {
      const device = await c.env.DB.prepare("SELECT * FROM attendance_devices WHERE id = ?").bind(deviceId).first<Record<string, unknown>>();
      if (!device || device.status !== "ACTIVE") {
        skipped += 1;
        continue;
      }
      touched.add(deviceId);
    }
    const punchTime = readString(log.punch_time);
    if (!punchTime || Number.isNaN(new Date(punchTime).getTime())) {
      skipped += 1;
      continue;
    }
    const external = optionalString(log.external_employee_code);
    let employeeId = optionalString(log.employee_id);
    if (!employeeId && external) {
      const employee = await c.env.DB.prepare("SELECT id FROM employees WHERE employee_no = ? AND archived_at IS NULL").bind(external).first<{ id: string }>();
      employeeId = employee?.id ?? null;
    }
    const punchType = readString(log.punch_type).toUpperCase();
    const source = readString(log.source).toUpperCase();
    const result = await c.env.DB.prepare("INSERT OR IGNORE INTO attendance_raw_logs (id, device_id, employee_id, external_employee_code, punch_time, punch_type, source, raw_payload_json, imported_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), deviceId, employeeId, external, punchTime, PUNCH_TYPES.has(punchType) ? punchType : "UNKNOWN", RAW_SOURCES.has(source) ? source : "DEVICE", log.raw_payload_json ? JSON.stringify(log.raw_payload_json) : null, c.get("currentUser").id).run();
    if (result.meta.changes > 0) {
      inserted += 1;
      if (employeeId) await reconcileEmployeeDate(c, employeeId, punchTime.slice(0, 10));
    } else {
      skipped += 1;
    }
  }
  const now = new Date().toISOString();
  for (const deviceId of touched) await c.env.DB.prepare("UPDATE attendance_devices SET last_sync_at = ?, last_seen_at = ?, updated_at = ? WHERE id = ?").bind(now, now, now, deviceId).run();
  await auditAttendance(c, { action: "attendance.raw_logs.imported", entityType: "attendance_raw_log", entityId: "bulk_import", newValue: { inserted, skipped } });
  await publishAttendance(c, "attendance.raw_logs.imported", "bulk_import", "imported", "attendance_raw_log");
  return ok(c, { inserted, skipped });
});

attendanceRoutes.post("/raw-logs/reconcile-placeholder", requirePermission("attendance.devices.manage"), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const employeeId = readString(body.employee_id);
  const attendanceDate = readString(body.attendance_date);
  if (!employeeId || !validDate(attendanceDate)) return fail(c, 400, "VALIDATION_ERROR", "Employee and attendance date are required.");
  const recordId = await reconcileEmployeeDate(c, employeeId, attendanceDate);
  return ok(c, { record_id: recordId });
});

function logColumns() {
  return `al.*, e.employee_no, e.full_name AS employee_name,
    e.primary_department_id AS department_id, d.name AS department_name,
    e.primary_position_id AS position_id, p.title AS position_title,
    e.primary_location_id AS location_id, l.name AS location_name,
    ad.name AS device_name, ad.device_code`;
}

async function getAttendanceLog(c: Context<AppBindings>, id: string) {
  return c.env.DB.prepare(
    `SELECT ${logColumns()}
     FROM attendance_logs al
     LEFT JOIN employees e ON e.id = al.employee_id
     LEFT JOIN departments d ON d.id = e.primary_department_id
     LEFT JOIN positions p ON p.id = e.primary_position_id
     LEFT JOIN locations l ON l.id = e.primary_location_id
     LEFT JOIN attendance_devices ad ON ad.id = al.device_id
     WHERE al.id = ?`
  ).bind(id).first<Record<string, unknown>>();
}

function readAttendanceLogInput(body: Record<string, unknown>, existing?: Record<string, unknown>) {
  const logType = readString(body.log_type ?? existing?.log_type ?? "UNKNOWN").toUpperCase();
  const source = readString(body.source ?? existing?.source ?? "MANUAL").toUpperCase();
  const logTime = readString(body.log_time ?? existing?.log_time);
  return {
    employee_id: optionalString(body.employee_id ?? existing?.employee_id),
    device_id: optionalString(body.device_id ?? existing?.device_id),
    external_employee_code: optionalString(body.external_employee_code ?? existing?.external_employee_code),
    log_time: logTime,
    attendance_date: readString(body.attendance_date ?? existing?.attendance_date) || (logTime ? logTime.slice(0, 10) : ""),
    log_type: PUNCH_TYPES.has(logType) ? logType : "UNKNOWN",
    source: (LOG_SOURCES.has(source) ? source : "MANUAL") as LogSource,
    notes: optionalString(body.notes ?? existing?.notes),
    raw_payload_json: body.raw_payload_json ? JSON.stringify(body.raw_payload_json) : optionalString(existing?.raw_payload_json)
  };
}

attendanceRoutes.get("/logs", requireAnyPermission(["attendance.logs.view", "attendance.view"]), async (c) => {
  const conditions = ["COALESCE(al.is_archived, 0) = 0"];
  const params: BindValue[] = [];
  const search = readString(c.req.query("search"));
  if (search) {
    conditions.push("(e.employee_no LIKE ? OR e.full_name LIKE ? OR al.external_employee_code LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  for (const [query, column] of [["employee_id", "al.employee_id"], ["department_id", "e.primary_department_id"], ["location_id", "e.primary_location_id"], ["source", "al.source"], ["log_type", "al.log_type"]] as const) {
    const value = readString(c.req.query(query));
    if (value) {
      conditions.push(`${column} = ?`);
      params.push(value);
    }
  }
  addRange(c, conditions, params, "log", "al.log_time");
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "attendance", "view", "e");
  conditions.push(scope.sql);
  params.push(...scope.params);
  const rows = await c.env.DB.prepare(
    `SELECT ${logColumns()}
     FROM attendance_logs al
     LEFT JOIN employees e ON e.id = al.employee_id
     LEFT JOIN departments d ON d.id = e.primary_department_id
     LEFT JOIN positions p ON p.id = e.primary_position_id
     LEFT JOIN locations l ON l.id = e.primary_location_id
     LEFT JOIN attendance_devices ad ON ad.id = al.device_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY al.log_time DESC LIMIT 500`
  ).bind(...params).all();
  return ok(c, { logs: rows.results });
});

attendanceRoutes.post("/logs/manual", requireAnyPermission(["attendance.logs.manage", "attendance.manual_entries.manage", "attendance.manage"]), async (c) => {
  const settings = await getSettings(c);
  if (Number(settings.allow_manual_entries ?? 1) !== 1) return fail(c, 403, "MANUAL_ENTRIES_DISABLED", "Manual attendance entries are disabled.");
  const input = readAttendanceLogInput(await readJsonBody(c.req.raw));
  if (!input.employee_id || !input.log_time || Number.isNaN(new Date(input.log_time).getTime())) return fail(c, 400, "VALIDATION_ERROR", "Employee and valid log time are required.");
  if (Number(settings.require_reason_for_manual_entries ?? 1) === 1 && !input.notes) return fail(c, 400, "REASON_REQUIRED", "Manual attendance entries require a reason.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), input.employee_id, "attendance", "manage"))) return fail(c, 403, "FORBIDDEN", "You do not have access to this employee.");
  const existingRecord = await c.env.DB.prepare("SELECT locked_for_payroll FROM attendance_daily_records WHERE employee_id = ? AND attendance_date = ?").bind(input.employee_id, input.attendance_date).first<Record<string, unknown>>();
  const ruleIssues = validateAttendanceRosterRules({ date: input.attendance_date, locked: Number(existingRecord?.locked_for_payroll ?? 0) === 1 && !canOverrideAttendanceLock(c) });
  if (hasValidationErrors(ruleIssues)) return validationResponse(c, ruleIssues, 423);
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO attendance_logs (id, employee_id, device_id, external_employee_code, log_time, log_type, source, attendance_date, notes, raw_payload_json, created_by_user_id, updated_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, input.employee_id, input.device_id, input.external_employee_code, input.log_time, input.log_type, input.source, input.attendance_date, input.notes, input.raw_payload_json, c.get("currentUser").id, c.get("currentUser").id).run();
  await reconcileEmployeeDate(c, input.employee_id, input.attendance_date);
  await auditAttendance(c, { action: "attendance.log.created", entityType: "attendance_log", entityId: id, newValue: input, reason: input.notes });
  await publishAttendance(c, "attendance.changed", id, "log_created", "attendance_raw_log");
  return ok(c, { log: await getAttendanceLog(c, id) }, 201);
});

attendanceRoutes.patch("/logs/:id", requireAnyPermission(["attendance.logs.manage", "attendance.manual_entries.manage", "attendance.manage"]), async (c) => {
  const old = await getAttendanceLog(c, routeParam(c, "id"));
  if (!old) return fail(c, 404, "NOT_FOUND", "Attendance log was not found.");
  if (old.employee_id && !(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(old.employee_id), "attendance", "manage"))) return fail(c, 404, "NOT_FOUND", "Attendance log was not found.");
  const input = readAttendanceLogInput(await readJsonBody(c.req.raw), old);
  if (!input.log_time || Number.isNaN(new Date(input.log_time).getTime())) return fail(c, 400, "VALIDATION_ERROR", "Valid log time is required.");
  const existingRecord = input.employee_id ? await c.env.DB.prepare("SELECT locked_for_payroll FROM attendance_daily_records WHERE employee_id = ? AND attendance_date = ?").bind(input.employee_id, input.attendance_date).first<Record<string, unknown>>() : null;
  const ruleIssues = validateAttendanceRosterRules({ date: input.attendance_date, locked: Number(existingRecord?.locked_for_payroll ?? 0) === 1 && !canOverrideAttendanceLock(c) });
  if (hasValidationErrors(ruleIssues)) return validationResponse(c, ruleIssues, 423);
  await c.env.DB.prepare("UPDATE attendance_logs SET employee_id = ?, device_id = ?, external_employee_code = ?, log_time = ?, log_type = ?, source = ?, attendance_date = ?, notes = ?, raw_payload_json = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?")
    .bind(input.employee_id, input.device_id, input.external_employee_code, input.log_time, input.log_type, input.source, input.attendance_date, input.notes, input.raw_payload_json, c.get("currentUser").id, new Date().toISOString(), routeParam(c, "id")).run();
  if (input.employee_id) await reconcileEmployeeDate(c, input.employee_id, input.attendance_date);
  await auditAttendance(c, { action: "attendance.log.updated", entityType: "attendance_log", entityId: routeParam(c, "id"), oldValue: old, newValue: input, reason: input.notes });
  return ok(c, { log: await getAttendanceLog(c, routeParam(c, "id")) });
});

attendanceRoutes.post("/logs/:id/archive", requireAnyPermission(["attendance.logs.manage", "attendance.manage"]), async (c) => {
  const old = await getAttendanceLog(c, routeParam(c, "id"));
  if (!old) return fail(c, 404, "NOT_FOUND", "Attendance log was not found.");
  if (old.employee_id && !(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(old.employee_id), "attendance", "manage"))) return fail(c, 404, "NOT_FOUND", "Attendance log was not found.");
  const body = await readJsonBody(c.req.raw);
  const reason = optionalString(body.reason);
  await c.env.DB.prepare("UPDATE attendance_logs SET is_archived = 1, archived_at = ?, archived_by_user_id = ?, notes = COALESCE(?, notes), updated_at = ? WHERE id = ?").bind(new Date().toISOString(), c.get("currentUser").id, reason, new Date().toISOString(), routeParam(c, "id")).run();
  await auditAttendance(c, { action: "attendance.log.archived", entityType: "attendance_log", entityId: routeParam(c, "id"), oldValue: old, reason });
  return ok(c, { archived: true });
});

function correctionColumns() {
  return `acr.*, e.employee_no, e.full_name AS employee_name, d.name AS department_name, p.title AS position_title, l.name AS location_name, requester.name AS requested_by_name, reviewer.name AS reviewed_by_name`;
}

async function getCorrection(c: Context<AppBindings>, id: string) {
  return c.env.DB.prepare(`SELECT ${correctionColumns()} FROM attendance_correction_requests acr INNER JOIN employees e ON e.id = acr.employee_id LEFT JOIN departments d ON d.id = e.primary_department_id LEFT JOIN positions p ON p.id = e.primary_position_id LEFT JOIN locations l ON l.id = e.primary_location_id LEFT JOIN users requester ON requester.id = acr.requested_by_user_id LEFT JOIN users reviewer ON reviewer.id = acr.reviewed_by_user_id WHERE acr.id = ?`).bind(id).first<Record<string, unknown>>();
}

attendanceRoutes.get("/corrections", requireAnyPermission(["attendance.corrections.view", "attendance.corrections.review", "attendance.view", "attendance.corrections.manage", "attendance.manage"]), async (c) => {
  const conditions: string[] = [];
  const params: BindValue[] = [];
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "attendance", "view", "e");
  conditions.push(scope.sql);
  params.push(...scope.params);
  const search = readString(c.req.query("search"));
  if (search) {
    conditions.push("(e.employee_no LIKE ? OR e.full_name LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }
  for (const [query, column] of [["status", "acr.status"], ["employee_id", "acr.employee_id"], ["department_id", "e.primary_department_id"], ["location_id", "e.primary_location_id"]] as const) {
    const value = readString(c.req.query(query));
    if (value) {
      if (query === "status" && value === "PENDING") {
        conditions.push(`${column} IN ('PENDING','SUBMITTED')`);
      } else {
        conditions.push(`${column} = ?`);
        params.push(value);
      }
    }
  }
  addRange(c, conditions, params, "date", "acr.attendance_date");
  const rows = await c.env.DB.prepare(`SELECT ${correctionColumns()} FROM attendance_correction_requests acr INNER JOIN employees e ON e.id = acr.employee_id LEFT JOIN departments d ON d.id = e.primary_department_id LEFT JOIN positions p ON p.id = e.primary_position_id LEFT JOIN locations l ON l.id = e.primary_location_id LEFT JOIN users requester ON requester.id = acr.requested_by_user_id LEFT JOIN users reviewer ON reviewer.id = acr.reviewed_by_user_id ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY acr.created_at DESC`).bind(...params).all();
  return ok(c, { corrections: rows.results });
});

attendanceRoutes.get("/corrections/:id", requireAnyPermission(["attendance.corrections.view", "attendance.corrections.review", "attendance.view", "attendance.corrections.manage", "attendance.manage"]), async (c) => {
  const correction = await getCorrection(c, routeParam(c, "id"));
  if (!correction) return fail(c, 404, "NOT_FOUND", "Correction request was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(correction.employee_id), "attendance", "view"))) return fail(c, 404, "NOT_FOUND", "Correction request was not found.");
  return ok(c, { correction });
});

attendanceRoutes.post("/corrections", async (c) => {
  if (!hasAny(c, ["attendance.corrections.create", "attendance.correct", "attendance.corrections.manage", "attendance.manage"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to request attendance corrections.");
  const body = await readJsonBody(c.req.raw);
  const employeeId = readString(body.employee_id);
  const attendanceDate = readString(body.attendance_date);
  const reason = optionalString(body.reason);
  if (!employeeId || !validDate(attendanceDate) || !reason) return fail(c, 400, "VALIDATION_ERROR", "Employee, date, and reason are required.");
  const employee = await getEmployee(c, employeeId);
  if (!employee) return fail(c, 404, "EMPLOYEE_NOT_FOUND", "Employee was not found or is archived.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "attendance", hasAny(c, ["attendance.corrections.manage", "attendance.manage"]) ? "manage" : "view"))) return fail(c, 403, "FORBIDDEN", "You do not have access to this employee.");
  if (!body.requested_clock_in && !body.requested_clock_out && !body.requested_status) return fail(c, 400, "VALIDATION_ERROR", "At least one requested correction field is required.");
  const current = await c.env.DB.prepare("SELECT * FROM attendance_daily_records WHERE employee_id = ? AND attendance_date = ?").bind(employeeId, attendanceDate).first<Record<string, unknown>>();
  if (clockOutBeforeIn(optionalString(body.requested_clock_in), optionalString(body.requested_clock_out))) return fail(c, 400, "VALIDATION_ERROR", "Requested clock-out cannot be before clock-in.");
  const correctionIssues = validateAttendanceRosterRules({
    date: attendanceDate,
    locked: Number(current?.locked_for_payroll ?? 0) === 1 && !canOverrideAttendanceLock(c),
    startTime: optionalString(body.requested_clock_in),
    endTime: optionalString(body.requested_clock_out)
  });
  if (hasValidationErrors(correctionIssues)) return validationResponse(c, correctionIssues, Number(current?.locked_for_payroll ?? 0) === 1 ? 423 : 400);
  const status = body.requested_status ? normalizeAttendanceStatus(body.requested_status) : null;
  const id = crypto.randomUUID();
  const requested = {
    requested_clock_in: optionalString(body.requested_clock_in),
    requested_clock_out: optionalString(body.requested_clock_out),
    requested_status: status
  };
  await c.env.DB.prepare(
    `INSERT INTO attendance_correction_requests
     (id, employee_id, attendance_date, current_record_id, request_type, current_values_json, requested_values_json, requested_clock_in, requested_clock_out, requested_status, reason, status, requested_by_user_id, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`
  ).bind(id, employeeId, attendanceDate, current?.id ?? null, readString(body.request_type) || "OTHER", JSON.stringify(attendanceSnapshot(current)), JSON.stringify(requested), requested.requested_clock_in, requested.requested_clock_out, requested.requested_status, reason, c.get("currentUser").id, JSON.stringify({ source: "admin" })).run();
  if (current) await c.env.DB.prepare("UPDATE attendance_daily_records SET status = 'PENDING_CORRECTION', correction_status = 'PENDING', updated_at = ? WHERE id = ?").bind(new Date().toISOString(), current.id).run();
  await auditAttendance(c, { action: "attendance.correction.created", entityType: "attendance_correction", entityId: id, newValue: { employeeId, attendanceDate, current_values: attendanceSnapshot(current), requested_values: requested, reason } });
  await publishAttendance(c, "attendance.correction.created", id, "created", "attendance_correction");
  await publishAttendance(c, "employee.attendance.changed", employeeId, "correction_created", "attendance_correction");
  return ok(c, { correction: await getCorrection(c, id) }, 201);
});

async function applyAttendanceCorrection(c: Context<AppBindings>, correction: Record<string, unknown>) {
  const existing = correction.current_record_id ? await getRecord(c, String(correction.current_record_id)) : null;
  if (existing && Number(existing.locked_for_payroll ?? 0) === 1 && !canOverrideAttendanceLock(c)) throw new Error("This attendance record is locked for payroll. Override permission is required.");
  const requested = parseJsonObject(correction.requested_values_json);
  const employeeId = String(correction.employee_id);
  const attendanceDate = String(correction.attendance_date);
  const status = normalizeAttendanceStatus(requested.requested_status ?? correction.requested_status ?? existing?.status ?? "PRESENT");
  const first = optionalString(requested.requested_clock_in ?? correction.requested_clock_in ?? existing?.first_clock_in);
  const last = optionalString(requested.requested_clock_out ?? correction.requested_clock_out ?? existing?.last_clock_out);
  if (clockOutBeforeIn(first, last)) throw new Error("Requested clock-out cannot be before clock-in.");
  const total = minutesBetween(first, last);
  const id = existing?.id ? String(existing.id) : crypto.randomUUID();
  const impact = payrollImpact({ status, late_minutes: Number(existing?.late_minutes ?? 0), early_checkout_minutes: Number(existing?.early_checkout_minutes ?? 0), missed_punch: false, source: "CORRECTION", notes: String(correction.reason ?? "") });
  const derived = dailyDerived({ status, first_clock_in: first, last_clock_out: last, late_minutes: Number(existing?.late_minutes ?? 0), early_checkout_minutes: Number(existing?.early_checkout_minutes ?? 0), missed_punch: false, payroll_impact_json: impact });
  if (existing) {
    await c.env.DB.prepare(
      `UPDATE attendance_daily_records SET status = ?, calculated_status = ?, final_status = ?, first_clock_in = ?, last_clock_out = ?, total_work_minutes = ?, missed_punch = 0,
       missing_clock_in = ?, missing_clock_out = ?, is_absent = ?, is_late = ?, is_early_leave = ?, is_half_day = ?, is_leave_day = ?, is_public_holiday = ?, is_day_off = ?,
       correction_status = 'APPROVED', source = 'CORRECTION', payroll_impact_json = ?, payroll_impact_status = ?, payroll_impact_minutes = ?, payroll_impact_days = ?, payroll_impact_reason = ?,
       notes = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?`
    ).bind(status, derived.calculated_status, derived.final_status, first, last, total, derived.missing_clock_in, derived.missing_clock_out, derived.is_absent, derived.is_late, derived.is_early_leave, derived.is_half_day, derived.is_leave_day, derived.is_public_holiday, derived.is_day_off, impact, derived.payroll_impact_status, derived.payroll_impact_minutes, derived.payroll_impact_days, derived.payroll_impact_reason, correction.reason ?? null, c.get("currentUser").id, new Date().toISOString(), id).run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO attendance_daily_records (id, employee_id, attendance_date, status, calculated_status, final_status, first_clock_in, last_clock_out, total_work_minutes, missed_punch,
       missing_clock_in, missing_clock_out, is_absent, is_late, is_early_leave, is_half_day, is_leave_day, is_public_holiday, is_day_off,
       correction_status, source, payroll_impact_json, payroll_impact_status, payroll_impact_minutes, payroll_impact_days, payroll_impact_reason, notes, created_by_user_id, updated_by_user_id, generated_by, generated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', 'CORRECTION', ?, ?, ?, ?, ?, ?, ?, ?, 'CORRECTION', ?)`
    ).bind(id, employeeId, attendanceDate, status, derived.calculated_status, derived.final_status, first, last, total, derived.missing_clock_in, derived.missing_clock_out, derived.is_absent, derived.is_late, derived.is_early_leave, derived.is_half_day, derived.is_leave_day, derived.is_public_holiday, derived.is_day_off, impact, derived.payroll_impact_status, derived.payroll_impact_minutes, derived.payroll_impact_days, derived.payroll_impact_reason, correction.reason ?? null, c.get("currentUser").id, c.get("currentUser").id, new Date().toISOString()).run();
  }
  return id;
}

async function applyCorrection(c: Context<AppBindings>, correction: Record<string, unknown>) {
  return applyAttendanceCorrection(c, correction);
}

attendanceRoutes.post("/corrections/:id/approve", requireAnyPermission(["attendance.corrections.approve", "attendance.approve_correction", "attendance.corrections.manage", "attendance.manage"]), async (c) => {
  const id = routeParam(c, "id");
  const correction = await getCorrection(c, id);
  if (!correction) return fail(c, 404, "NOT_FOUND", "Correction request was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(correction.employee_id), "attendance", "manage"))) return fail(c, 404, "NOT_FOUND", "Correction request was not found.");
  if (!isPendingCorrection(correction.status)) return fail(c, 409, "INVALID_STATUS", "Only pending correction requests can be approved.");
  const body = await readJsonBody(c.req.raw);
  const reviewNote = optionalString(body.review_note ?? body.note ?? body.reason);
  let recordId: string;
  try {
    recordId = await applyCorrection(c, correction);
  } catch (error) {
    return fail(c, 400, "VALIDATION_ERROR", error instanceof Error ? error.message : "Unable to apply correction.");
  }
  await c.env.DB.prepare("UPDATE attendance_correction_requests SET status = 'APPROVED', reviewed_by_user_id = ?, reviewer_user_id = ?, reviewed_at = ?, review_note = ?, reviewer_note = ?, current_record_id = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, c.get("currentUser").id, new Date().toISOString(), reviewNote, reviewNote, recordId, new Date().toISOString(), id).run();
  await auditAttendance(c, { action: "attendance.correction.approved", entityType: "attendance_correction", entityId: id, oldValue: correction, newValue: { recordId }, reason: reviewNote });
  await publishAttendance(c, "attendance.correction.approved", id, "approved", "attendance_correction");
  await publishAttendance(c, "attendance.record.updated", recordId, "correction_applied");
  return ok(c, { correction: await getCorrection(c, id), record: await getRecord(c, recordId) });
});

attendanceRoutes.post("/corrections/:id/reject", requireAnyPermission(["attendance.corrections.reject", "attendance.approve_correction", "attendance.corrections.manage", "attendance.manage"]), async (c) => {
  const id = routeParam(c, "id");
  const correction = await getCorrection(c, id);
  if (!correction) return fail(c, 404, "NOT_FOUND", "Correction request was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(correction.employee_id), "attendance", "manage"))) return fail(c, 404, "NOT_FOUND", "Correction request was not found.");
  if (!isPendingCorrection(correction.status)) return fail(c, 409, "INVALID_STATUS", "Only pending correction requests can be rejected.");
  const body = await readJsonBody(c.req.raw);
  const note = optionalString(body.review_note ?? body.note ?? body.reason);
  if (!note) return fail(c, 400, "REVIEW_NOTE_REQUIRED", "Rejecting a correction requires a review note.");
  await c.env.DB.prepare("UPDATE attendance_correction_requests SET status = 'REJECTED', reviewed_by_user_id = ?, reviewer_user_id = ?, reviewed_at = ?, review_note = ?, reviewer_note = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, c.get("currentUser").id, new Date().toISOString(), note, note, new Date().toISOString(), id).run();
  await auditAttendance(c, { action: "attendance.correction.rejected", entityType: "attendance_correction", entityId: id, oldValue: correction, reason: note });
  await publishAttendance(c, "attendance.correction.rejected", id, "rejected", "attendance_correction");
  return ok(c, { correction: await getCorrection(c, id) });
});

attendanceRoutes.post("/corrections/:id/cancel", async (c) => {
  const id = routeParam(c, "id");
  const correction = await getCorrection(c, id);
  if (!correction) return fail(c, 404, "NOT_FOUND", "Correction request was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(correction.employee_id), "attendance", hasAny(c, ["attendance.corrections.manage", "attendance.manage"]) ? "manage" : "view"))) return fail(c, 404, "NOT_FOUND", "Correction request was not found.");
  if (!isPendingCorrection(correction.status)) return fail(c, 409, "INVALID_STATUS", "Only pending correction requests can be cancelled.");
  if (correction.requested_by_user_id !== c.get("currentUser").id && !hasAny(c, ["attendance.corrections.cancel", "attendance.corrections.manage", "attendance.manage"])) return fail(c, 403, "FORBIDDEN", "Only the requester or an attendance manager can cancel this correction.");
  const body = await readJsonBody(c.req.raw);
  const reason = optionalString(body.reason);
  await c.env.DB.prepare("UPDATE attendance_correction_requests SET status = 'CANCELLED', review_note = ?, updated_at = ? WHERE id = ?").bind(reason, new Date().toISOString(), id).run();
  await auditAttendance(c, { action: "attendance.correction.cancelled", entityType: "attendance_correction", entityId: id, oldValue: correction, reason });
  await publishAttendance(c, "attendance.correction.cancelled", id, "cancelled", "attendance_correction");
  return ok(c, { correction: await getCorrection(c, id) });
});

attendanceRoutes.get("/settings", requirePermission("attendance.view"), async (c) => ok(c, { settings: await getSettings(c) }));

attendanceRoutes.patch("/settings", requirePermission("attendance.settings.manage"), async (c) => {
  const old = await getSettings(c);
  const body = await readJsonBody(c.req.raw);
  const input = {
    module_enabled: bool(body.module_enabled, Boolean(old.module_enabled ?? 1)),
    default_workday_mode: readString(body.default_workday_mode ?? old.default_workday_mode) || "FIXED_SHIFT",
    standard_work_minutes_per_day: num(body.standard_work_minutes_per_day, Number(old.standard_work_minutes_per_day ?? 480)) ?? 480,
    default_shift_start_time: optionalString(body.default_shift_start_time ?? old.default_shift_start_time),
    default_shift_end_time: optionalString(body.default_shift_end_time ?? old.default_shift_end_time),
    late_grace_minutes: num(body.late_grace_minutes, Number(old.late_grace_minutes ?? 10)) ?? 10,
    early_checkout_grace_minutes: num(body.early_checkout_grace_minutes, Number(old.early_checkout_grace_minutes ?? 10)) ?? 10,
    weekly_off_days_json: readString(body.weekly_off_days_json ?? old.weekly_off_days_json) || "[]",
    mark_absent_if_no_punch: bool(body.mark_absent_if_no_punch, Boolean(old.mark_absent_if_no_punch)),
    missed_punch_requires_correction: bool(body.missed_punch_requires_correction, Boolean(old.missed_punch_requires_correction)),
    allow_manual_entries: bool(body.allow_manual_entries, Boolean(old.allow_manual_entries ?? 1)),
    require_reason_for_manual_entries: bool(body.require_reason_for_manual_entries, Boolean(old.require_reason_for_manual_entries ?? 1)),
    allow_employee_correction_requests: bool(body.allow_employee_correction_requests, Boolean(old.allow_employee_correction_requests ?? 1)),
    manual_entry_requires_approval: bool(body.manual_entry_requires_approval, Boolean(old.manual_entry_requires_approval ?? 0)),
    correction_requires_approval: bool(body.correction_requires_approval, Boolean(old.correction_requires_approval ?? 1)),
    payroll_impact_enabled: bool(body.payroll_impact_enabled, Boolean(old.payroll_impact_enabled ?? 1)),
    default_attendance_source: readString(body.default_attendance_source ?? old.default_attendance_source) || "DEVICE",
    allow_manager_team_corrections: bool(body.allow_manager_team_corrections, Boolean(old.allow_manager_team_corrections ?? 0)),
    require_reason_for_correction_review: bool(body.require_reason_for_correction_review, Boolean(old.require_reason_for_correction_review ?? 1)),
    overtime_tracking_enabled: bool(body.overtime_tracking_enabled, Boolean(old.overtime_tracking_enabled ?? 0)),
    lock_after_payroll_finalized: bool(body.lock_after_payroll_finalized, Boolean(old.lock_after_payroll_finalized ?? 1)),
    monthly_attendance_lock_day: num(body.monthly_attendance_lock_day, old.monthly_attendance_lock_day == null ? null : Number(old.monthly_attendance_lock_day)),
    default_absent_status: normalizeAttendanceStatus(body.default_absent_status ?? old.default_absent_status ?? "ABSENT", "ABSENT"),
    attendance_source_options_json: readString(body.attendance_source_options_json ?? old.attendance_source_options_json) || '["DEVICE","MANUAL","MANUAL_IMPORT","API","BRIDGE"]',
    payroll_deduction_enabled: bool(body.payroll_deduction_enabled, Boolean(old.payroll_deduction_enabled))
  };
  if (input.standard_work_minutes_per_day < 0 || input.late_grace_minutes < 0 || input.early_checkout_grace_minutes < 0) return fail(c, 400, "VALIDATION_ERROR", "Attendance setting minute values cannot be negative.");
  if (!["FIXED_SHIFT", "ROSTER_BASED", "FLEXIBLE"].includes(input.default_workday_mode)) return fail(c, 400, "VALIDATION_ERROR", "Default workday mode is invalid.");
  if (!LOG_SOURCES.has(input.default_attendance_source)) return fail(c, 400, "VALIDATION_ERROR", "Default attendance source is invalid.");
  if (input.monthly_attendance_lock_day != null && (input.monthly_attendance_lock_day < 1 || input.monthly_attendance_lock_day > 31)) return fail(c, 400, "VALIDATION_ERROR", "Monthly attendance lock day must be between 1 and 31.");
  await c.env.DB.prepare(
    `UPDATE attendance_settings SET module_enabled = ?, default_workday_mode = ?, standard_work_minutes_per_day = ?, default_shift_start_time = ?, default_shift_end_time = ?,
     late_grace_minutes = ?, early_checkout_grace_minutes = ?, weekly_off_days_json = ?, mark_absent_if_no_punch = ?, missed_punch_requires_correction = ?,
     allow_manual_entries = ?, require_reason_for_manual_entries = ?, allow_employee_correction_requests = ?, manual_entry_requires_approval = ?, correction_requires_approval = ?,
     payroll_impact_enabled = ?, default_attendance_source = ?, allow_manager_team_corrections = ?, require_reason_for_correction_review = ?, overtime_tracking_enabled = ?,
     lock_after_payroll_finalized = ?, monthly_attendance_lock_day = ?, default_absent_status = ?, attendance_source_options_json = ?, payroll_deduction_enabled = ?, updated_at = ?
     WHERE id = 'attendance_settings_default'`
  ).bind(
    input.module_enabled ? 1 : 0, input.default_workday_mode, input.standard_work_minutes_per_day, input.default_shift_start_time, input.default_shift_end_time,
    input.late_grace_minutes, input.early_checkout_grace_minutes, input.weekly_off_days_json, input.mark_absent_if_no_punch ? 1 : 0, input.missed_punch_requires_correction ? 1 : 0,
    input.allow_manual_entries ? 1 : 0, input.require_reason_for_manual_entries ? 1 : 0, input.allow_employee_correction_requests ? 1 : 0, input.manual_entry_requires_approval ? 1 : 0, input.correction_requires_approval ? 1 : 0,
    input.payroll_impact_enabled ? 1 : 0, input.default_attendance_source, input.allow_manager_team_corrections ? 1 : 0, input.require_reason_for_correction_review ? 1 : 0, input.overtime_tracking_enabled ? 1 : 0,
    input.lock_after_payroll_finalized ? 1 : 0, input.monthly_attendance_lock_day, input.default_absent_status, input.attendance_source_options_json, input.payroll_deduction_enabled ? 1 : 0, new Date().toISOString()
  ).run();
  await auditAttendance(c, { action: "attendance.settings.updated", entityType: "attendance_settings", entityId: "attendance_settings_default", oldValue: old, newValue: input });
  await publishAttendance(c, "attendance.changed", "attendance_settings_default", "settings_updated", "attendance_settings");
  return ok(c, { settings: await getSettings(c) });
});

attendanceRoutes.get("/dashboard", requirePermission("attendance.view"), async (c) => {
  const today = new Date().toISOString().slice(0, 10);
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "attendance", "view", "e");
  const scopedEmployeeSql = `SELECT e.id FROM employees e WHERE ${scope.sql}`;
  const row = await c.env.DB.prepare(`SELECT
    (SELECT COUNT(*) FROM attendance_daily_records WHERE employee_id IN (${scopedEmployeeSql}) AND attendance_date = ? AND status IN ('PRESENT','LATE','HALF_DAY')) AS present_today,
    (SELECT COUNT(*) FROM attendance_daily_records WHERE employee_id IN (${scopedEmployeeSql}) AND attendance_date = ? AND status = 'ABSENT') AS absent_today,
    (SELECT COUNT(*) FROM attendance_daily_records WHERE employee_id IN (${scopedEmployeeSql}) AND attendance_date = ? AND COALESCE(late_minutes,0) > 0) AS late_today,
    (SELECT COUNT(*) FROM attendance_daily_records WHERE employee_id IN (${scopedEmployeeSql}) AND attendance_date = ? AND missed_punch = 1) AS missed_punch_today,
    (SELECT COUNT(*) FROM attendance_correction_requests WHERE employee_id IN (${scopedEmployeeSql}) AND status IN ('PENDING','SUBMITTED')) AS pending_corrections,
    (SELECT COUNT(*) FROM attendance_devices WHERE status = 'ACTIVE') AS active_devices`).bind(...scope.params, today, ...scope.params, today, ...scope.params, today, ...scope.params, today, ...scope.params).first();
  return ok(c, row ?? {});
});

attendanceRoutes.get("/reports", requirePermission("attendance.reports.view"), async (c) => {
  const { conditions, params } = buildRecordFilters(c);
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "attendance", "view", "e");
  conditions.push(scope.sql);
  params.push(...scope.params);
  const rows = await c.env.DB.prepare(
    `SELECT e.id AS employee_id, e.employee_no, e.full_name AS employee_name,
       d.name AS department_name, l.name AS location_name,
       SUM(CASE WHEN adr.status IN ('PRESENT','LATE','HALF_DAY') THEN 1 ELSE 0 END) AS present_days,
       SUM(CASE WHEN adr.status = 'ABSENT' THEN 1 ELSE 0 END) AS absent_days,
       SUM(CASE WHEN COALESCE(adr.late_minutes,0) > 0 THEN 1 ELSE 0 END) AS late_days,
       SUM(CASE WHEN adr.missed_punch = 1 THEN 1 ELSE 0 END) AS missed_punch_days,
       SUM(COALESCE(adr.total_work_minutes,0)) AS total_work_minutes
     FROM attendance_daily_records adr
     INNER JOIN employees e ON e.id = adr.employee_id
     LEFT JOIN departments d ON d.id = e.primary_department_id
     LEFT JOIN locations l ON l.id = e.primary_location_id
     ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
     GROUP BY e.id, e.employee_no, e.full_name, d.name, l.name
     ORDER BY e.employee_no`
  ).bind(...params).all();
  return ok(c, { reports: rows.results });
});

attendanceRoutes.get("/reports/export.csv", requirePermission("attendance.reports.export"), async (c) => {
  const { conditions, params } = buildRecordFilters(c);
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "attendance", "view", "e");
  conditions.push(scope.sql);
  params.push(...scope.params);
  const rows = (await c.env.DB.prepare(`SELECT ${recordColumns()} FROM attendance_daily_records adr INNER JOIN employees e ON e.id = adr.employee_id LEFT JOIN departments d ON d.id = e.primary_department_id LEFT JOIN positions p ON p.id = e.primary_position_id LEFT JOIN locations l ON l.id = e.primary_location_id ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY adr.attendance_date DESC LIMIT 5000`).bind(...params).all<Record<string, unknown>>()).results;
  await auditAttendance(c, { action: "attendance.report_exported", entityType: "attendance_report", entityId: "attendance_records_csv", newValue: { rows: rows.length } });
  const header = ["attendance_date", "employee_no", "employee_name", "department_name", "position_title", "location_name", "status", "first_clock_in", "last_clock_out", "total_work_minutes", "late_minutes", "early_checkout_minutes", "missed_punch", "source"];
  const csv = [header.join(","), ...rows.map((row) => header.map((key) => `"${String(row[key] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=attendance-records.csv" } });
});

employeeAttendanceRoutes.get("/:employeeId/attendance/records", requireAnyPermission(["employees.attendance.view", "attendance.view"]), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), routeParam(c, "employeeId"), "attendance", "view"))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const rows = await c.env.DB.prepare(`SELECT ${recordColumns()} FROM attendance_daily_records adr INNER JOIN employees e ON e.id = adr.employee_id LEFT JOIN departments d ON d.id = e.primary_department_id LEFT JOIN positions p ON p.id = e.primary_position_id LEFT JOIN locations l ON l.id = e.primary_location_id WHERE adr.employee_id = ? ORDER BY adr.attendance_date DESC`).bind(routeParam(c, "employeeId")).all();
  return ok(c, { records: rows.results });
});

employeeAttendanceRoutes.get("/:employeeId/attendance/raw-logs", requireAnyPermission(["employees.attendance.view", "attendance.view"]), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), routeParam(c, "employeeId"), "attendance", "view"))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const rows = await c.env.DB.prepare("SELECT arl.*, ad.name AS device_name, ad.device_code FROM attendance_raw_logs arl LEFT JOIN attendance_devices ad ON ad.id = arl.device_id WHERE arl.employee_id = ? ORDER BY arl.punch_time DESC LIMIT 100").bind(routeParam(c, "employeeId")).all();
  return ok(c, { logs: rows.results, raw_logs: rows.results });
});

employeeAttendanceRoutes.get("/:employeeId/attendance/calendar", requireAnyPermission(["employees.attendance.view", "attendance.view"]), async (c) => {
  const employeeId = routeParam(c, "employeeId");
  if (!(await canViewAttendanceForEmployee(c, employeeId))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  return ok(c, { calendar: await getEmployeeAttendanceCalendar(c, employeeId) });
});

async function getEmployeeAttendanceCalendar(c: Context<AppBindings>, employeeId: string) {
  const month = readString(c.req.query("month"));
  const from = readString(c.req.query("date_from")) || (month && /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : "");
  const to = readString(c.req.query("date_to")) || (month && /^\d{4}-\d{2}$/.test(month) ? `${month}-31` : "");
  const conditions = ["adr.employee_id = ?"];
  const params: BindValue[] = [employeeId];
  if (from) { conditions.push("adr.attendance_date >= ?"); params.push(from); }
  if (to) { conditions.push("adr.attendance_date <= ?"); params.push(to); }
  const rows = await c.env.DB.prepare(`SELECT ${recordColumns()} FROM attendance_daily_records adr INNER JOIN employees e ON e.id = adr.employee_id LEFT JOIN departments d ON d.id = e.primary_department_id LEFT JOIN positions p ON p.id = e.primary_position_id LEFT JOIN locations l ON l.id = e.primary_location_id WHERE ${conditions.join(" AND ")} ORDER BY adr.attendance_date`).bind(...params).all();
  const leaveRows = await leaveCalendarRows(c, { employeeId, from, to });
  return [...rows.results, ...leaveRows].sort((a, b) => String(a.attendance_date ?? "").localeCompare(String(b.attendance_date ?? "")));
}

employeeAttendanceRoutes.get("/:employeeId/attendance/summary", requireAnyPermission(["employees.attendance.view", "attendance.view"]), async (c) => {
  const employeeId = routeParam(c, "employeeId");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "attendance", "view"))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const [records, rawLogs, corrections, counts] = await Promise.all([
    c.env.DB.prepare(`SELECT ${recordColumns()} FROM attendance_daily_records adr INNER JOIN employees e ON e.id = adr.employee_id LEFT JOIN departments d ON d.id = e.primary_department_id LEFT JOIN positions p ON p.id = e.primary_position_id LEFT JOIN locations l ON l.id = e.primary_location_id WHERE adr.employee_id = ? ORDER BY adr.attendance_date DESC LIMIT 60`).bind(employeeId).all(),
    c.env.DB.prepare("SELECT arl.*, ad.name AS device_name FROM attendance_raw_logs arl LEFT JOIN attendance_devices ad ON ad.id = arl.device_id WHERE arl.employee_id = ? ORDER BY arl.punch_time DESC LIMIT 50").bind(employeeId).all(),
    c.env.DB.prepare(`SELECT ${correctionColumns()} FROM attendance_correction_requests acr INNER JOIN employees e ON e.id = acr.employee_id LEFT JOIN departments d ON d.id = e.primary_department_id LEFT JOIN positions p ON p.id = e.primary_position_id LEFT JOIN locations l ON l.id = e.primary_location_id LEFT JOIN users requester ON requester.id = acr.requested_by_user_id LEFT JOIN users reviewer ON reviewer.id = acr.reviewed_by_user_id WHERE acr.employee_id = ? ORDER BY acr.created_at DESC LIMIT 50`).bind(employeeId).all(),
    c.env.DB.prepare("SELECT status, COUNT(*) AS count FROM attendance_daily_records WHERE employee_id = ? GROUP BY status").bind(employeeId).all()
  ]);
  const summary = { present: 0, absent: 0, late: 0, missed_punch: 0, pending_corrections: 0 };
  for (const row of counts.results as Record<string, unknown>[]) {
    const status = String(row.status ?? "");
    const count = Number(row.count ?? 0);
    if (["PRESENT", "LATE", "HALF_DAY"].includes(status)) summary.present += count;
    if (status === "ABSENT") summary.absent += count;
    if (status === "LATE") summary.late += count;
    if (status === "PENDING_CORRECTION") summary.pending_corrections += count;
  }
  summary.missed_punch = (records.results as Record<string, unknown>[]).filter((record) => Number(record.missed_punch ?? 0) === 1).length;
  return ok(c, { summary, records: records.results, calendar: records.results, logs: rawLogs.results, raw_logs: rawLogs.results, corrections: corrections.results, status_counts: counts.results });
});
