import { Hono } from "hono";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { recordAudit } from "../db/audit";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { publishAccessEvent } from "../realtime/publisher";
import type { AppBindings } from "../types";
import { fail, getClientIp, ok } from "../utils/http";
import { readJsonBody, readString } from "../utils/validation";

type BindValue = string | number | null;
type AttendanceStatus = "PRESENT" | "ABSENT" | "LEAVE" | "SICK" | "LATE" | "HALF_DAY" | "OFF_DAY" | "HOLIDAY" | "PENDING_CORRECTION";
type AttendanceSource = "DEVICE" | "MANUAL" | "CORRECTION" | "LEAVE" | "ROSTER" | "SYSTEM";
type RawSource = "DEVICE" | "MANUAL_IMPORT" | "API" | "BRIDGE";

const STATUSES = new Set(["PRESENT", "ABSENT", "LEAVE", "SICK", "LATE", "HALF_DAY", "OFF_DAY", "HOLIDAY", "PENDING_CORRECTION"]);
const RECORD_SOURCES = new Set(["DEVICE", "MANUAL", "CORRECTION", "LEAVE", "ROSTER", "SYSTEM"]);
const RAW_SOURCES = new Set(["DEVICE", "MANUAL_IMPORT", "API", "BRIDGE"]);
const PUNCH_TYPES = new Set(["IN", "OUT", "BREAK_IN", "BREAK_OUT", "UNKNOWN"]);
const DEVICE_TYPES = new Set(["BIOMETRIC", "MANUAL_IMPORT", "API", "BRIDGE", "OTHER"]);
const DEVICE_STATUSES = new Set(["ACTIVE", "INACTIVE", "DISABLED"]);

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
  return "CASE WHEN lower(lt.code) LIKE '%sick%' OR lower(lt.name) LIKE '%sick%' THEN 'SICK' ELSE 'LEAVE' END";
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

async function getSettings(c: Context<AppBindings>) {
  let settings = await c.env.DB.prepare("SELECT * FROM attendance_settings WHERE id = 'attendance_settings_default'").first<Record<string, unknown>>();
  if (!settings) {
    await c.env.DB.prepare("INSERT INTO attendance_settings (id, standard_work_minutes_per_day, default_shift_start_time, default_shift_end_time, late_grace_minutes, early_checkout_grace_minutes, weekly_off_days_json) VALUES ('attendance_settings_default', 480, '09:00', '18:00', 10, 10, '[\"FRIDAY\"]')").run();
    settings = await c.env.DB.prepare("SELECT * FROM attendance_settings WHERE id = 'attendance_settings_default'").first<Record<string, unknown>>();
  }
  return settings!;
}

function readRecordInput(body: Record<string, unknown>, existing?: Record<string, unknown>) {
  const status = readString(body.status || existing?.status || "PRESENT").toUpperCase();
  const source = readString(body.source || existing?.source || "MANUAL").toUpperCase();
  return {
    employee_id: readString(body.employee_id || existing?.employee_id),
    attendance_date: readString(body.attendance_date || existing?.attendance_date),
    status: (STATUSES.has(status) ? status : "PRESENT") as AttendanceStatus,
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

attendanceRoutes.get("/records/:id", requirePermission("attendance.view"), async (c) => {
  const record = await getRecord(c, routeParam(c, "id"));
  if (!record) return fail(c, 404, "NOT_FOUND", "Attendance record was not found.");
  return ok(c, { record });
});

attendanceRoutes.post("/records", requirePermission("attendance.manage"), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const input = readRecordInput(body);
  const validation = validateRecord(input);
  if (validation) return fail(c, 400, "VALIDATION_ERROR", validation);
  if (!(await getEmployee(c, input.employee_id))) return fail(c, 400, "INVALID_EMPLOYEE", "Employee was not found or is archived.");
  const duplicate = await c.env.DB.prepare("SELECT id FROM attendance_daily_records WHERE employee_id = ? AND attendance_date = ?").bind(input.employee_id, input.attendance_date).first();
  if (duplicate) return fail(c, 409, "DUPLICATE_RECORD", "A daily attendance record already exists. Update the existing record instead.");
  const id = crypto.randomUUID();
  const total = input.total_work_minutes ?? minutesBetween(input.first_clock_in, input.last_clock_out);
  await c.env.DB
    .prepare(
      `INSERT INTO attendance_daily_records
       (id, employee_id, attendance_date, status, first_clock_in, last_clock_out, total_work_minutes, late_minutes, early_checkout_minutes, missed_punch, source, payroll_impact_json, leave_request_id, notes, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, input.employee_id, input.attendance_date, input.status, input.first_clock_in, input.last_clock_out, total, input.late_minutes, input.early_checkout_minutes, input.missed_punch ? 1 : 0, input.source, payrollImpact({ ...input, source: input.source }), input.leave_request_id, input.notes, c.get("currentUser").id, c.get("currentUser").id)
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
  const body = await readJsonBody(c.req.raw);
  const reason = optionalString(body.reason);
  const input = readRecordInput(body, old);
  const validation = validateRecord(input);
  if (validation) return fail(c, 400, "VALIDATION_ERROR", validation);
  const changedImportant = ["status", "first_clock_in", "last_clock_out", "late_minutes", "early_checkout_minutes", "missed_punch"].some((key) => String(old[key] ?? "") !== String((input as Record<string, unknown>)[key] ?? ""));
  if (changedImportant && !reason) return fail(c, 400, "REASON_REQUIRED", "Manual attendance updates require a reason.");
  const total = input.total_work_minutes ?? minutesBetween(input.first_clock_in, input.last_clock_out);
  await c.env.DB
    .prepare(
      `UPDATE attendance_daily_records
       SET status = ?, first_clock_in = ?, last_clock_out = ?, total_work_minutes = ?, late_minutes = ?, early_checkout_minutes = ?,
         missed_punch = ?, source = ?, payroll_impact_json = ?, leave_request_id = ?, notes = ?, updated_by_user_id = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(input.status, input.first_clock_in, input.last_clock_out, total, input.late_minutes, input.early_checkout_minutes, input.missed_punch ? 1 : 0, input.source, payrollImpact({ ...input, source: input.source }), input.leave_request_id, input.notes, c.get("currentUser").id, new Date().toISOString(), id)
    .run();
  await auditAttendance(c, { action: "attendance.record.updated", entityType: "attendance_record", entityId: id, oldValue: old, newValue: input, reason });
  await publishAttendance(c, "attendance.record.updated", id, "updated");
  await publishAttendance(c, "employee.attendance.changed", String(old.employee_id), "record_updated", "attendance_record");
  return ok(c, { record: await getRecord(c, id) });
});

async function reconcileEmployeeDate(c: Context<AppBindings>, employeeId: string, attendanceDate: string) {
  const settings = await getSettings(c);
  const dayStart = `${attendanceDate}T00:00:00.000Z`;
  const dayEnd = `${attendanceDate}T23:59:59.999Z`;
  const logs = (await c.env.DB.prepare("SELECT * FROM attendance_raw_logs WHERE employee_id = ? AND punch_time BETWEEN ? AND ? ORDER BY punch_time").bind(employeeId, dayStart, dayEnd).all<Record<string, unknown>>()).results;
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
  const status: AttendanceStatus = missed && Number(settings.missed_punch_requires_correction ?? 1) === 1 ? "PENDING_CORRECTION" : late > 0 ? "LATE" : "PRESENT";
  const existing = await c.env.DB.prepare("SELECT * FROM attendance_daily_records WHERE employee_id = ? AND attendance_date = ?").bind(employeeId, attendanceDate).first<Record<string, unknown>>();
  const id = existing?.id ? String(existing.id) : crypto.randomUUID();
  const impact = payrollImpact({ status, late_minutes: late, early_checkout_minutes: early, missed_punch: missed, source: "DEVICE", notes: "Generated from raw attendance logs." });
  if (existing) {
    await c.env.DB.prepare("UPDATE attendance_daily_records SET status = ?, first_clock_in = ?, last_clock_out = ?, total_work_minutes = ?, late_minutes = ?, early_checkout_minutes = ?, missed_punch = ?, source = 'DEVICE', payroll_impact_json = ?, updated_at = ? WHERE id = ?").bind(status, first, missed ? null : last, missed ? null : minutesBetween(first, last), late, early, missed ? 1 : 0, impact, new Date().toISOString(), id).run();
  } else {
    await c.env.DB.prepare("INSERT INTO attendance_daily_records (id, employee_id, attendance_date, status, first_clock_in, last_clock_out, total_work_minutes, late_minutes, early_checkout_minutes, missed_punch, source, payroll_impact_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DEVICE', ?)").bind(id, employeeId, attendanceDate, status, first, missed ? null : last, missed ? null : minutesBetween(first, last), late, early, missed ? 1 : 0, impact).run();
  }
  return id;
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
  return {
    name: readString(body.name || existing?.name),
    device_code: readString(body.device_code || existing?.device_code),
    location_id: optionalString(body.location_id ?? existing?.location_id),
    type: DEVICE_TYPES.has(type) ? type : "BIOMETRIC",
    ip_address: optionalString(body.ip_address ?? existing?.ip_address),
    serial_number: optionalString(body.serial_number ?? existing?.serial_number),
    status: DEVICE_STATUSES.has(status) ? status : "ACTIVE",
    notes: optionalString(body.notes ?? existing?.notes)
  };
}

attendanceRoutes.get("/devices", requirePermission("attendance.view"), async (c) => {
  const rows = await c.env.DB.prepare("SELECT ad.*, l.name AS location_name FROM attendance_devices ad LEFT JOIN locations l ON l.id = ad.location_id ORDER BY ad.status, ad.name").all();
  return ok(c, { devices: rows.results });
});

attendanceRoutes.get("/devices/:id", requirePermission("attendance.view"), async (c) => {
  const device = await c.env.DB.prepare("SELECT ad.*, l.name AS location_name FROM attendance_devices ad LEFT JOIN locations l ON l.id = ad.location_id WHERE ad.id = ?").bind(routeParam(c, "id")).first();
  if (!device) return fail(c, 404, "NOT_FOUND", "Attendance device was not found.");
  return ok(c, { device });
});

attendanceRoutes.post("/devices", requirePermission("attendance.devices.manage"), async (c) => {
  const input = readDeviceInput(await readJsonBody(c.req.raw));
  if (!input.name || !input.device_code) return fail(c, 400, "VALIDATION_ERROR", "Device name and code are required.");
  const id = crypto.randomUUID();
  try {
    await c.env.DB.prepare("INSERT INTO attendance_devices (id, name, device_code, location_id, type, ip_address, serial_number, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, input.name, input.device_code, input.location_id, input.type, input.ip_address, input.serial_number, input.status, input.notes).run();
  } catch {
    return fail(c, 409, "DUPLICATE_DEVICE", "Device code must be unique.");
  }
  await auditAttendance(c, { action: "attendance.device.created", entityType: "attendance_device", entityId: id, newValue: input });
  await publishAttendance(c, "attendance.device.changed", id, "created", "attendance_device");
  return ok(c, { device: await c.env.DB.prepare("SELECT * FROM attendance_devices WHERE id = ?").bind(id).first() }, 201);
});

attendanceRoutes.patch("/devices/:id", requirePermission("attendance.devices.manage"), async (c) => {
  const id = routeParam(c, "id");
  const old = await c.env.DB.prepare("SELECT * FROM attendance_devices WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!old) return fail(c, 404, "NOT_FOUND", "Attendance device was not found.");
  const input = readDeviceInput(await readJsonBody(c.req.raw), old);
  if (!input.name || !input.device_code) return fail(c, 400, "VALIDATION_ERROR", "Device name and code are required.");
  await c.env.DB.prepare("UPDATE attendance_devices SET name = ?, device_code = ?, location_id = ?, type = ?, ip_address = ?, serial_number = ?, status = ?, notes = ?, updated_at = ? WHERE id = ?").bind(input.name, input.device_code, input.location_id, input.type, input.ip_address, input.serial_number, input.status, input.notes, new Date().toISOString(), id).run();
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

function correctionColumns() {
  return `acr.*, e.employee_no, e.full_name AS employee_name, d.name AS department_name, p.title AS position_title, l.name AS location_name, requester.name AS requested_by_name, reviewer.name AS reviewed_by_name`;
}

async function getCorrection(c: Context<AppBindings>, id: string) {
  return c.env.DB.prepare(`SELECT ${correctionColumns()} FROM attendance_correction_requests acr INNER JOIN employees e ON e.id = acr.employee_id LEFT JOIN departments d ON d.id = e.primary_department_id LEFT JOIN positions p ON p.id = e.primary_position_id LEFT JOIN locations l ON l.id = e.primary_location_id LEFT JOIN users requester ON requester.id = acr.requested_by_user_id LEFT JOIN users reviewer ON reviewer.id = acr.reviewed_by_user_id WHERE acr.id = ?`).bind(id).first<Record<string, unknown>>();
}

attendanceRoutes.get("/corrections", requirePermission("attendance.view"), async (c) => {
  const conditions: string[] = [];
  const params: BindValue[] = [];
  const search = readString(c.req.query("search"));
  if (search) {
    conditions.push("(e.employee_no LIKE ? OR e.full_name LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }
  for (const [query, column] of [["status", "acr.status"], ["employee_id", "acr.employee_id"], ["department_id", "e.primary_department_id"], ["location_id", "e.primary_location_id"]] as const) {
    const value = readString(c.req.query(query));
    if (value) {
      conditions.push(`${column} = ?`);
      params.push(value);
    }
  }
  addRange(c, conditions, params, "date", "acr.attendance_date");
  const rows = await c.env.DB.prepare(`SELECT ${correctionColumns()} FROM attendance_correction_requests acr INNER JOIN employees e ON e.id = acr.employee_id LEFT JOIN departments d ON d.id = e.primary_department_id LEFT JOIN positions p ON p.id = e.primary_position_id LEFT JOIN locations l ON l.id = e.primary_location_id LEFT JOIN users requester ON requester.id = acr.requested_by_user_id LEFT JOIN users reviewer ON reviewer.id = acr.reviewed_by_user_id ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY acr.created_at DESC`).bind(...params).all();
  return ok(c, { corrections: rows.results });
});

attendanceRoutes.get("/corrections/:id", requirePermission("attendance.view"), async (c) => {
  const correction = await getCorrection(c, routeParam(c, "id"));
  if (!correction) return fail(c, 404, "NOT_FOUND", "Correction request was not found.");
  return ok(c, { correction });
});

attendanceRoutes.post("/corrections", async (c) => {
  if (!hasAny(c, ["attendance.correct", "attendance.manage"])) return fail(c, 403, "FORBIDDEN", "You do not have permission to request attendance corrections.");
  const body = await readJsonBody(c.req.raw);
  const employeeId = readString(body.employee_id);
  const attendanceDate = readString(body.attendance_date);
  const reason = optionalString(body.reason);
  if (!employeeId || !validDate(attendanceDate) || !reason) return fail(c, 400, "VALIDATION_ERROR", "Employee, date, and reason are required.");
  const employee = await getEmployee(c, employeeId);
  if (!employee) return fail(c, 404, "EMPLOYEE_NOT_FOUND", "Employee was not found or is archived.");
  if (!body.requested_clock_in && !body.requested_clock_out && !body.requested_status) return fail(c, 400, "VALIDATION_ERROR", "At least one requested correction field is required.");
  const current = await c.env.DB.prepare("SELECT * FROM attendance_daily_records WHERE employee_id = ? AND attendance_date = ?").bind(employeeId, attendanceDate).first<Record<string, unknown>>();
  if (clockOutBeforeIn(optionalString(body.requested_clock_in), optionalString(body.requested_clock_out))) return fail(c, 400, "VALIDATION_ERROR", "Requested clock-out cannot be before clock-in.");
  const status = readString(body.requested_status).toUpperCase();
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO attendance_correction_requests (id, employee_id, attendance_date, current_record_id, requested_clock_in, requested_clock_out, requested_status, reason, requested_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, employeeId, attendanceDate, current?.id ?? null, optionalString(body.requested_clock_in), optionalString(body.requested_clock_out), STATUSES.has(status) ? status : null, reason, c.get("currentUser").id).run();
  if (current) await c.env.DB.prepare("UPDATE attendance_daily_records SET status = 'PENDING_CORRECTION', updated_at = ? WHERE id = ?").bind(new Date().toISOString(), current.id).run();
  await auditAttendance(c, { action: "attendance.correction.created", entityType: "attendance_correction", entityId: id, newValue: { employeeId, attendanceDate, reason } });
  await publishAttendance(c, "attendance.correction.created", id, "created", "attendance_correction");
  await publishAttendance(c, "employee.attendance.changed", employeeId, "correction_created", "attendance_correction");
  return ok(c, { correction: await getCorrection(c, id) }, 201);
});

async function applyCorrection(c: Context<AppBindings>, correction: Record<string, unknown>) {
  const existing = correction.current_record_id ? await getRecord(c, String(correction.current_record_id)) : null;
  const employeeId = String(correction.employee_id);
  const attendanceDate = String(correction.attendance_date);
  const status = String(correction.requested_status ?? existing?.status ?? "PRESENT") as AttendanceStatus;
  const first = optionalString(correction.requested_clock_in ?? existing?.first_clock_in);
  const last = optionalString(correction.requested_clock_out ?? existing?.last_clock_out);
  if (clockOutBeforeIn(first, last)) throw new Error("Requested clock-out cannot be before clock-in.");
  const total = minutesBetween(first, last);
  const id = existing?.id ? String(existing.id) : crypto.randomUUID();
  const impact = payrollImpact({ status, late_minutes: Number(existing?.late_minutes ?? 0), early_checkout_minutes: Number(existing?.early_checkout_minutes ?? 0), missed_punch: false, source: "CORRECTION", notes: String(correction.reason ?? "") });
  if (existing) {
    await c.env.DB.prepare("UPDATE attendance_daily_records SET status = ?, first_clock_in = ?, last_clock_out = ?, total_work_minutes = ?, missed_punch = 0, source = 'CORRECTION', payroll_impact_json = ?, notes = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?").bind(status, first, last, total, impact, correction.reason ?? null, c.get("currentUser").id, new Date().toISOString(), id).run();
  } else {
    await c.env.DB.prepare("INSERT INTO attendance_daily_records (id, employee_id, attendance_date, status, first_clock_in, last_clock_out, total_work_minutes, missed_punch, source, payroll_impact_json, notes, created_by_user_id, updated_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'CORRECTION', ?, ?, ?, ?)").bind(id, employeeId, attendanceDate, status, first, last, total, impact, correction.reason ?? null, c.get("currentUser").id, c.get("currentUser").id).run();
  }
  return id;
}

attendanceRoutes.post("/corrections/:id/approve", requirePermission("attendance.approve_correction"), async (c) => {
  const id = routeParam(c, "id");
  const correction = await getCorrection(c, id);
  if (!correction) return fail(c, 404, "NOT_FOUND", "Correction request was not found.");
  if (correction.status !== "SUBMITTED") return fail(c, 409, "INVALID_STATUS", "Only submitted correction requests can be approved.");
  const body = await readJsonBody(c.req.raw);
  const reviewNote = optionalString(body.review_note ?? body.note ?? body.reason);
  let recordId: string;
  try {
    recordId = await applyCorrection(c, correction);
  } catch (error) {
    return fail(c, 400, "VALIDATION_ERROR", error instanceof Error ? error.message : "Unable to apply correction.");
  }
  await c.env.DB.prepare("UPDATE attendance_correction_requests SET status = 'APPROVED', reviewed_by_user_id = ?, reviewed_at = ?, review_note = ?, current_record_id = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, new Date().toISOString(), reviewNote, recordId, new Date().toISOString(), id).run();
  await auditAttendance(c, { action: "attendance.correction.approved", entityType: "attendance_correction", entityId: id, oldValue: correction, newValue: { recordId }, reason: reviewNote });
  await publishAttendance(c, "attendance.correction.approved", id, "approved", "attendance_correction");
  await publishAttendance(c, "attendance.record.updated", recordId, "correction_applied");
  return ok(c, { correction: await getCorrection(c, id), record: await getRecord(c, recordId) });
});

attendanceRoutes.post("/corrections/:id/reject", requirePermission("attendance.approve_correction"), async (c) => {
  const id = routeParam(c, "id");
  const correction = await getCorrection(c, id);
  if (!correction) return fail(c, 404, "NOT_FOUND", "Correction request was not found.");
  if (correction.status !== "SUBMITTED") return fail(c, 409, "INVALID_STATUS", "Only submitted correction requests can be rejected.");
  const body = await readJsonBody(c.req.raw);
  const note = optionalString(body.review_note ?? body.note ?? body.reason);
  if (!note) return fail(c, 400, "REVIEW_NOTE_REQUIRED", "Rejecting a correction requires a review note.");
  await c.env.DB.prepare("UPDATE attendance_correction_requests SET status = 'REJECTED', reviewed_by_user_id = ?, reviewed_at = ?, review_note = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, new Date().toISOString(), note, new Date().toISOString(), id).run();
  await auditAttendance(c, { action: "attendance.correction.rejected", entityType: "attendance_correction", entityId: id, oldValue: correction, reason: note });
  await publishAttendance(c, "attendance.correction.rejected", id, "rejected", "attendance_correction");
  return ok(c, { correction: await getCorrection(c, id) });
});

attendanceRoutes.post("/corrections/:id/cancel", async (c) => {
  const id = routeParam(c, "id");
  const correction = await getCorrection(c, id);
  if (!correction) return fail(c, 404, "NOT_FOUND", "Correction request was not found.");
  if (correction.status !== "SUBMITTED") return fail(c, 409, "INVALID_STATUS", "Only submitted correction requests can be cancelled.");
  if (correction.requested_by_user_id !== c.get("currentUser").id && !has(c, "attendance.manage")) return fail(c, 403, "FORBIDDEN", "Only the requester or an attendance manager can cancel this correction.");
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
    standard_work_minutes_per_day: num(body.standard_work_minutes_per_day, Number(old.standard_work_minutes_per_day ?? 480)) ?? 480,
    default_shift_start_time: optionalString(body.default_shift_start_time ?? old.default_shift_start_time),
    default_shift_end_time: optionalString(body.default_shift_end_time ?? old.default_shift_end_time),
    late_grace_minutes: num(body.late_grace_minutes, Number(old.late_grace_minutes ?? 10)) ?? 10,
    early_checkout_grace_minutes: num(body.early_checkout_grace_minutes, Number(old.early_checkout_grace_minutes ?? 10)) ?? 10,
    weekly_off_days_json: readString(body.weekly_off_days_json ?? old.weekly_off_days_json) || "[]",
    mark_absent_if_no_punch: bool(body.mark_absent_if_no_punch, Boolean(old.mark_absent_if_no_punch)),
    missed_punch_requires_correction: bool(body.missed_punch_requires_correction, Boolean(old.missed_punch_requires_correction)),
    payroll_deduction_enabled: bool(body.payroll_deduction_enabled, Boolean(old.payroll_deduction_enabled))
  };
  if (input.standard_work_minutes_per_day < 0 || input.late_grace_minutes < 0 || input.early_checkout_grace_minutes < 0) return fail(c, 400, "VALIDATION_ERROR", "Attendance setting minute values cannot be negative.");
  await c.env.DB.prepare("UPDATE attendance_settings SET standard_work_minutes_per_day = ?, default_shift_start_time = ?, default_shift_end_time = ?, late_grace_minutes = ?, early_checkout_grace_minutes = ?, weekly_off_days_json = ?, mark_absent_if_no_punch = ?, missed_punch_requires_correction = ?, payroll_deduction_enabled = ?, updated_at = ? WHERE id = 'attendance_settings_default'").bind(input.standard_work_minutes_per_day, input.default_shift_start_time, input.default_shift_end_time, input.late_grace_minutes, input.early_checkout_grace_minutes, input.weekly_off_days_json, input.mark_absent_if_no_punch ? 1 : 0, input.missed_punch_requires_correction ? 1 : 0, input.payroll_deduction_enabled ? 1 : 0, new Date().toISOString()).run();
  await auditAttendance(c, { action: "attendance.settings.updated", entityType: "attendance_settings", entityId: "attendance_settings_default", oldValue: old, newValue: input });
  await publishAttendance(c, "attendance.changed", "attendance_settings_default", "settings_updated", "attendance_settings");
  return ok(c, { settings: await getSettings(c) });
});

attendanceRoutes.get("/dashboard", requirePermission("attendance.view"), async (c) => {
  const today = new Date().toISOString().slice(0, 10);
  const row = await c.env.DB.prepare(`SELECT
    (SELECT COUNT(*) FROM attendance_daily_records WHERE attendance_date = ? AND status IN ('PRESENT','LATE','HALF_DAY')) AS present_today,
    (SELECT COUNT(*) FROM attendance_daily_records WHERE attendance_date = ? AND status = 'ABSENT') AS absent_today,
    (SELECT COUNT(*) FROM attendance_daily_records WHERE attendance_date = ? AND COALESCE(late_minutes,0) > 0) AS late_today,
    (SELECT COUNT(*) FROM attendance_daily_records WHERE attendance_date = ? AND missed_punch = 1) AS missed_punch_today,
    (SELECT COUNT(*) FROM attendance_correction_requests WHERE status = 'SUBMITTED') AS pending_corrections,
    (SELECT COUNT(*) FROM attendance_devices WHERE status = 'ACTIVE') AS active_devices`).bind(today, today, today, today).first();
  return ok(c, row ?? {});
});

attendanceRoutes.get("/reports", requirePermission("attendance.reports.view"), async (c) => {
  const { conditions, params } = buildRecordFilters(c);
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
  const rows = (await c.env.DB.prepare(`SELECT ${recordColumns()} FROM attendance_daily_records adr INNER JOIN employees e ON e.id = adr.employee_id LEFT JOIN departments d ON d.id = e.primary_department_id LEFT JOIN positions p ON p.id = e.primary_position_id LEFT JOIN locations l ON l.id = e.primary_location_id ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY adr.attendance_date DESC LIMIT 5000`).bind(...params).all<Record<string, unknown>>()).results;
  await auditAttendance(c, { action: "attendance.report_exported", entityType: "attendance_report", entityId: "attendance_records_csv", newValue: { rows: rows.length } });
  const header = ["attendance_date", "employee_no", "employee_name", "department_name", "position_title", "location_name", "status", "first_clock_in", "last_clock_out", "total_work_minutes", "late_minutes", "early_checkout_minutes", "missed_punch", "source"];
  const csv = [header.join(","), ...rows.map((row) => header.map((key) => `"${String(row[key] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=attendance-records.csv" } });
});

employeeAttendanceRoutes.get("/:employeeId/attendance/records", requireAnyPermission(["employees.attendance.view", "attendance.view"]), async (c) => {
  const rows = await c.env.DB.prepare(`SELECT ${recordColumns()} FROM attendance_daily_records adr INNER JOIN employees e ON e.id = adr.employee_id LEFT JOIN departments d ON d.id = e.primary_department_id LEFT JOIN positions p ON p.id = e.primary_position_id LEFT JOIN locations l ON l.id = e.primary_location_id WHERE adr.employee_id = ? ORDER BY adr.attendance_date DESC`).bind(routeParam(c, "employeeId")).all();
  return ok(c, { records: rows.results });
});

employeeAttendanceRoutes.get("/:employeeId/attendance/raw-logs", requireAnyPermission(["employees.attendance.view", "attendance.view"]), async (c) => {
  const rows = await c.env.DB.prepare("SELECT arl.*, ad.name AS device_name, ad.device_code FROM attendance_raw_logs arl LEFT JOIN attendance_devices ad ON ad.id = arl.device_id WHERE arl.employee_id = ? ORDER BY arl.punch_time DESC LIMIT 100").bind(routeParam(c, "employeeId")).all();
  return ok(c, { logs: rows.results, raw_logs: rows.results });
});

employeeAttendanceRoutes.get("/:employeeId/attendance/calendar", requireAnyPermission(["employees.attendance.view", "attendance.view"]), async (c) => {
  const employeeId = routeParam(c, "employeeId");
  const month = readString(c.req.query("month"));
  const from = readString(c.req.query("date_from")) || (month && /^\d{4}-\d{2}$/.test(month) ? `${month}-01` : "");
  const to = readString(c.req.query("date_to")) || (month && /^\d{4}-\d{2}$/.test(month) ? `${month}-31` : "");
  const conditions = ["adr.employee_id = ?"];
  const params: BindValue[] = [employeeId];
  if (from) { conditions.push("adr.attendance_date >= ?"); params.push(from); }
  if (to) { conditions.push("adr.attendance_date <= ?"); params.push(to); }
  const rows = await c.env.DB.prepare(`SELECT ${recordColumns()} FROM attendance_daily_records adr INNER JOIN employees e ON e.id = adr.employee_id LEFT JOIN departments d ON d.id = e.primary_department_id LEFT JOIN positions p ON p.id = e.primary_position_id LEFT JOIN locations l ON l.id = e.primary_location_id WHERE ${conditions.join(" AND ")} ORDER BY adr.attendance_date`).bind(...params).all();
  const leaveRows = await leaveCalendarRows(c, { employeeId, from, to });
  return ok(c, { calendar: [...rows.results, ...leaveRows].sort((a, b) => String(a.attendance_date ?? "").localeCompare(String(b.attendance_date ?? ""))) });
});

employeeAttendanceRoutes.get("/:employeeId/attendance/summary", requireAnyPermission(["employees.attendance.view", "attendance.view"]), async (c) => {
  const employeeId = routeParam(c, "employeeId");
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
