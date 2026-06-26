import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import { buildEmployeeScopeWhereClause, canAccessEmployee } from "../auth/access-scopes";
import { recordAudit } from "../db/audit";
import { hasValidationErrors, validateDuplicateConflict, validationResponse } from "../lib/moduleValidation";
import { requireAuth } from "../middleware/auth";
import { publishAccessEvent } from "../realtime/publisher";
import type { AppBindings, AuthUser } from "../types";
import { fail, getClientIp, ok } from "../utils/http";
import { readJsonBody, readString } from "../utils/validation";

type BindValue = string | number | null;
type CsvRow = Record<string, string>;
type NormalizedImportRow = {
  row_number: number;
  attendance_device_id: string | null;
  biometric_user_id: string | null;
  external_employee_code: string | null;
  punch_time: string | null;
  punch_date: string | null;
  punch_type: "IN" | "OUT" | "BREAK_IN" | "BREAK_OUT" | "UNKNOWN";
  punch_state: string | null;
  raw_payload: CsvRow | Record<string, unknown>;
};

const PUNCH_TYPES = new Set(["IN", "OUT", "BREAK_IN", "BREAK_OUT", "UNKNOWN"]);
export const attendanceDeviceSyncRoutes = new Hono<AppBindings>();
export const employeeAttendanceDeviceSyncRoutes = new Hono<AppBindings>();
export const selfServiceAttendanceDeviceSyncRoutes = new Hono<AppBindings>();

attendanceDeviceSyncRoutes.use("*", async (c, next) => {
  const path = c.req.path;
  if (path.endsWith("/attendance/zkteco/local-bridge/logs") || path.endsWith("/attendance/zkteco/push-adms")) {
    await next();
    return;
  }
  return requireAuth(c, next);
});
employeeAttendanceDeviceSyncRoutes.use("*", requireAuth);
selfServiceAttendanceDeviceSyncRoutes.use("*", requireAuth);

function optionalString(value: unknown) {
  const text = readString(value);
  return text || null;
}

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function bool(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return value === "1" || value.toLowerCase() === "true";
  return fallback;
}

function routeParam(c: Context<AppBindings>, name: string) {
  return c.req.param(name) ?? "";
}

function hasAny(c: Context<AppBindings>, permissions: string[]) {
  const user = c.get("currentUser");
  return permissions.some((permission) => user.permissions.includes(permission));
}

function requireAnyPermission(permissions: string[]) {
  return createMiddleware<AppBindings>(async (c, next) => {
    if (!hasAny(c, permissions)) return fail(c, 403, "FORBIDDEN", "You do not have permission to perform this action.");
    await next();
  });
}

async function auditAttendanceDevice(c: Context<AppBindings>, input: { action: string; entityType: string; entityId?: string | null; oldValue?: unknown; newValue?: unknown; reason?: string | null; actorUserId?: string | null }) {
  await recordAudit(c.env.DB, {
    actorUserId: input.actorUserId ?? c.get("currentUser")?.id ?? null,
    action: input.action,
    module: "attendance",
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    oldValue: input.oldValue,
    newValue: input.newValue,
    reason: input.reason,
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent") ?? null
  });
}

async function publishAttendanceDeviceEvent(c: Context<AppBindings>, event: Parameters<typeof publishAccessEvent>[1], payload: Parameters<typeof publishAccessEvent>[2]) {
  await publishAccessEvent(c.env, event, payload);
  await publishAccessEvent(c.env, "attendance.changed", payload);
}

async function ensureDeviceSettings(db: D1Database) {
  await db.prepare(
    `INSERT OR IGNORE INTO attendance_device_settings
      (id, zkteco_csv_import_enabled, zkteco_local_bridge_enabled, zkteco_push_adms_enabled,
       auto_match_by_biometric_user_id, auto_match_by_employee_no, auto_normalize_after_import,
       prevent_locked_day_overwrite, duplicate_window_seconds, default_timezone,
       csv_allowed_extensions_json, max_import_rows, bridge_clock_skew_minutes)
     VALUES ('attendance_device_settings_default', 1, 0, 0, 1, 1, 1, 1, 60, 'Indian/Maldives', '["csv","txt"]', 20000, 15)`
  ).run();
}

export function detectZktecoCsvColumns(headers: string[]) {
  const normalized = new Map(headers.map((header) => [header.trim().toLowerCase().replace(/[\s_-]+/g, ""), header]));
  const find = (...keys: string[]) => keys.map((key) => normalized.get(key)).find(Boolean) ?? null;
  return {
    biometric_user_id: find("userid", "userno", "biometricuserid", "enrollnumber", "pin"),
    employee_code: find("employeecode", "employeeno", "employeeid", "staffno"),
    punch_time: find("time", "punchtime", "datetime", "checktime", "timestamp"),
    punch_date: find("date", "punchdate", "checkdate"),
    punch_type: find("punchtype", "direction", "state", "checktype", "verifytype"),
    device_code: find("device", "devicecode", "devicename", "sn", "serialnumber")
  };
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function parseZktecoCsvAttendance(text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] as CsvRow[] };
  const headers = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
  return { headers, rows };
}

function normalizePunchType(value: unknown): "IN" | "OUT" | "BREAK_IN" | "BREAK_OUT" | "UNKNOWN" {
  const raw = readString(value).toUpperCase();
  if (["0", "I", "IN", "CHECKIN", "CLOCKIN"].includes(raw)) return "IN";
  if (["1", "O", "OUT", "CHECKOUT", "CLOCKOUT"].includes(raw)) return "OUT";
  if (["2", "BREAK_IN", "BREAKIN"].includes(raw)) return "BREAK_IN";
  if (["3", "BREAK_OUT", "BREAKOUT"].includes(raw)) return "BREAK_OUT";
  return PUNCH_TYPES.has(raw) ? raw as "IN" | "OUT" | "BREAK_IN" | "BREAK_OUT" | "UNKNOWN" : "UNKNOWN";
}

function normalizeDateTime(value: string | null, dateValue?: string | null) {
  const source = value || dateValue || "";
  if (!source) return null;
  const compact = source.includes("T") ? source : source.replace(" ", "T");
  const parsed = new Date(compact);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  const fallback = new Date(source);
  return Number.isNaN(fallback.getTime()) ? null : fallback.toISOString();
}

export function normalizeZktecoCsvRow(row: CsvRow, rowNumber: number, columns = detectZktecoCsvColumns(Object.keys(row)), deviceId: string | null = null): NormalizedImportRow {
  const punchDate = columns.punch_date ? optionalString(row[columns.punch_date]) : null;
  const punchTime = normalizeDateTime(columns.punch_time ? optionalString(row[columns.punch_time]) : null, punchDate);
  return {
    row_number: rowNumber,
    attendance_device_id: deviceId,
    biometric_user_id: columns.biometric_user_id ? optionalString(row[columns.biometric_user_id]) : null,
    external_employee_code: columns.employee_code ? optionalString(row[columns.employee_code]) : null,
    punch_time: punchTime,
    punch_date: punchTime ? punchTime.slice(0, 10) : punchDate,
    punch_type: normalizePunchType(columns.punch_type ? row[columns.punch_type] : null),
    punch_state: columns.punch_type ? optionalString(row[columns.punch_type]) : null,
    raw_payload: row
  };
}

async function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function generateAttendanceRawLogDuplicateHash(input: { deviceId?: string | null; biometricUserId?: string | null; employeeCode?: string | null; punchTime?: string | null; punchType?: string | null }) {
  return sha256Hex([input.deviceId ?? "", input.biometricUserId ?? "", input.employeeCode ?? "", input.punchTime ?? "", input.punchType ?? "UNKNOWN"].join("|"));
}

async function nextBatchNumber(db: D1Database) {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const row = await db.prepare("SELECT COUNT(*) AS count FROM attendance_import_batches WHERE batch_number LIKE ?").bind(`ATT-IMP-${stamp}-%`).first<{ count: number }>();
  return `ATT-IMP-${stamp}-${String(Number(row?.count ?? 0) + 1).padStart(4, "0")}`;
}

export async function createAttendanceImportBatch(db: D1Database, input: { source: string; attendanceDeviceId?: string | null; fileName?: string | null; fileHash?: string | null; totalRows?: number; uploadedByUserId?: string | null; options?: Record<string, unknown> }) {
  const id = crypto.randomUUID();
  const batchNumber = await nextBatchNumber(db);
  await db.prepare(
    `INSERT INTO attendance_import_batches
      (id, batch_number, source, attendance_device_id, file_name, file_hash, status, total_rows, import_options_json, uploaded_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, 'READY', ?, ?, ?)`
  ).bind(id, batchNumber, input.source, input.attendanceDeviceId ?? null, input.fileName ?? null, input.fileHash ?? null, input.totalRows ?? 0, input.options ? JSON.stringify(input.options) : null, input.uploadedByUserId ?? null).run();
  return { id, batch_number: batchNumber };
}

export async function matchRawLogToEmployee(db: D1Database, input: { attendanceDeviceId?: string | null; biometricUserId?: string | null; externalEmployeeCode?: string | null }) {
  if (input.biometricUserId) {
    const mapping = await db.prepare(
      `SELECT ebm.id AS mapping_id, ebm.employee_id
       FROM employee_biometric_mappings ebm
       JOIN employees e ON e.id = ebm.employee_id
       WHERE ebm.status = 'ACTIVE' AND ebm.biometric_user_id = ?
         AND (ebm.attendance_device_id = ? OR ebm.attendance_device_id IS NULL)
         AND e.archived_at IS NULL
       ORDER BY CASE WHEN ebm.attendance_device_id = ? THEN 0 ELSE 1 END, ebm.is_primary DESC, ebm.created_at DESC
       LIMIT 1`
    ).bind(input.biometricUserId, input.attendanceDeviceId ?? "", input.attendanceDeviceId ?? "").first<{ mapping_id: string; employee_id: string }>();
    if (mapping) return mapping;
  }
  if (input.externalEmployeeCode) {
    const employee = await db.prepare("SELECT id AS employee_id FROM employees WHERE employee_no = ? AND archived_at IS NULL").bind(input.externalEmployeeCode).first<{ employee_id: string }>();
    if (employee) return { employee_id: employee.employee_id, mapping_id: null };
  }
  return null;
}

export async function createUnmatchedAttendanceLog(db: D1Database, input: { rawLogId: string; importBatchId?: string | null; attendanceDeviceId?: string | null; biometricUserId?: string | null; externalEmployeeCode?: string | null; punchTime?: string | null; reason: string }) {
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT OR IGNORE INTO attendance_unmatched_logs
      (id, raw_log_id, import_batch_id, attendance_device_id, biometric_user_id, external_employee_code, punch_time, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, input.rawLogId, input.importBatchId ?? null, input.attendanceDeviceId ?? null, input.biometricUserId ?? null, input.externalEmployeeCode ?? null, input.punchTime ?? null, input.reason).run();
  return id;
}

export async function isAttendanceDayLockedForPayroll(db: D1Database, employeeId: string, attendanceDate: string) {
  const row = await db.prepare("SELECT locked_for_payroll FROM attendance_daily_records WHERE employee_id = ? AND attendance_date = ?").bind(employeeId, attendanceDate).first<{ locked_for_payroll: number }>();
  return Number(row?.locked_for_payroll ?? 0) === 1;
}

export async function createLockedDayImportWarning(db: D1Database, input: { rawLogId?: string | null; importBatchId?: string | null; employeeId: string; attendanceDate: string; message: string }) {
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO attendance_locked_day_import_warnings
      (id, raw_log_id, import_batch_id, employee_id, attendance_date, warning_type, message)
     VALUES (?, ?, ?, ?, ?, 'LOCKED_FOR_PAYROLL', ?)`
  ).bind(id, input.rawLogId ?? null, input.importBatchId ?? null, input.employeeId, input.attendanceDate, input.message).run();
  return id;
}

export async function preventLockedAttendanceOverwrite(db: D1Database, input: { employeeId: string; attendanceDate: string; rawLogId?: string | null; importBatchId?: string | null }) {
  const locked = await isAttendanceDayLockedForPayroll(db, input.employeeId, input.attendanceDate);
  if (!locked) return { locked: false, warningId: null as string | null };
  const warningId = await createLockedDayImportWarning(db, {
    rawLogId: input.rawLogId ?? null,
    importBatchId: input.importBatchId ?? null,
    employeeId: input.employeeId,
    attendanceDate: input.attendanceDate,
    message: "Imported biometric log targets a payroll-locked attendance day. The daily record was not overwritten."
  });
  return { locked: true, warningId };
}

export async function getRosterAwareAttendanceWorkday(db: D1Database, employeeId: string, attendanceDate: string) {
  const roster = await db.prepare(
    `SELECT ra.status, ra.expected_work_minutes, st.start_time, st.end_time
     FROM roster_assignments ra
     LEFT JOIN shift_templates st ON st.id = ra.shift_template_id
     WHERE ra.employee_id = ? AND ra.assignment_date = ?
       AND ra.status IN ('PUBLISHED', 'CHANGED_AFTER_PUBLISH', 'DAY_OFF', 'PUBLIC_HOLIDAY', 'LEAVE', 'SICK_LEAVE', 'LONG_LEAVE')
     ORDER BY ra.updated_at DESC LIMIT 1`
  ).bind(employeeId, attendanceDate).first<Record<string, unknown>>();
  return roster ?? { status: "UNKNOWN", expected_work_minutes: null, start_time: null, end_time: null };
}

export function detectMissingPunchFromRawLogs(logs: Record<string, unknown>[]) {
  const types = logs.map((log) => String(log.punch_type ?? "UNKNOWN"));
  return { missing_clock_in: !types.includes("IN"), missing_clock_out: !types.includes("OUT"), missed_punch: logs.length === 1 || !types.includes("IN") || !types.includes("OUT") };
}

export function detectDuplicatePunchesForDay(logs: Record<string, unknown>[]) {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const log of logs) {
    const key = `${log.punch_time}|${log.punch_type}`;
    if (seen.has(key)) duplicates.push(String(log.id));
    seen.add(key);
  }
  return duplicates;
}

export function detectOutOfOrderPunches(logs: Record<string, unknown>[]) {
  const sorted = [...logs].sort((a, b) => String(a.punch_time).localeCompare(String(b.punch_time)));
  const original = logs.map((log) => String(log.id)).join("|");
  return sorted.map((log) => String(log.id)).join("|") !== original;
}

export async function applyNormalizedLogsToDailyAttendance(db: D1Database, input: { employeeId: string; attendanceDate: string; logs: Record<string, unknown>[]; rawLogId?: string | null; importBatchId?: string | null }) {
  const locked = await preventLockedAttendanceOverwrite(db, { employeeId: input.employeeId, attendanceDate: input.attendanceDate, rawLogId: input.rawLogId, importBatchId: input.importBatchId });
  if (locked.locked) return { recordId: null, lockedWarningId: locked.warningId };
  const sorted = [...input.logs].sort((a, b) => String(a.punch_time).localeCompare(String(b.punch_time)));
  const first = sorted.find((log) => String(log.punch_type ?? "UNKNOWN") === "IN") ?? sorted[0];
  const last = [...sorted].reverse().find((log) => String(log.punch_type ?? "UNKNOWN") === "OUT") ?? sorted[sorted.length - 1];
  const missing = detectMissingPunchFromRawLogs(sorted);
  const firstTime = first ? String(first.punch_time) : null;
  const lastTime = last ? String(last.punch_time) : null;
  const total = firstTime && lastTime ? Math.max(0, Math.round((new Date(lastTime).getTime() - new Date(firstTime).getTime()) / 60000)) : 0;
  const status = missing.missed_punch ? "MISSING_PUNCH" : "PRESENT";
  const existing = await db.prepare("SELECT id FROM attendance_daily_records WHERE employee_id = ? AND attendance_date = ?").bind(input.employeeId, input.attendanceDate).first<{ id: string }>();
  const id = existing?.id ?? crypto.randomUUID();
  if (existing) {
    await db.prepare(
      `UPDATE attendance_daily_records
       SET status = ?, calculated_status = ?, final_status = ?, first_clock_in = ?, last_clock_out = ?, total_work_minutes = ?,
         missed_punch = ?, missing_clock_in = ?, missing_clock_out = ?, source = 'DEVICE', generated_by = 'ZKTECO_IMPORT', generated_at = ?, updated_at = ?
       WHERE id = ?`
    ).bind(status, status, status, firstTime, lastTime, total, missing.missed_punch ? 1 : 0, missing.missing_clock_in ? 1 : 0, missing.missing_clock_out ? 1 : 0, new Date().toISOString(), new Date().toISOString(), id).run();
  } else {
    await db.prepare(
      `INSERT INTO attendance_daily_records
        (id, employee_id, attendance_date, status, calculated_status, final_status, first_clock_in, last_clock_out, total_work_minutes,
         missed_punch, missing_clock_in, missing_clock_out, source, generated_by, generated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DEVICE', 'ZKTECO_IMPORT', ?)`
    ).bind(id, input.employeeId, input.attendanceDate, status, status, status, firstTime, lastTime, total, missing.missed_punch ? 1 : 0, missing.missing_clock_in ? 1 : 0, missing.missing_clock_out ? 1 : 0, new Date().toISOString()).run();
  }
  return { recordId: id, lockedWarningId: null as string | null };
}

export async function normalizeRawLogsForEmployeeDate(db: D1Database, employeeId: string, attendanceDate: string, importBatchId?: string | null) {
  const logs = (await db.prepare(
    `SELECT * FROM attendance_raw_logs
     WHERE employee_id = ? AND punch_date = ? AND process_status IN ('MATCHED', 'PENDING', 'NORMALIZED')
     ORDER BY punch_time ASC`
  ).bind(employeeId, attendanceDate).all<Record<string, unknown>>()).results;
  if (logs.length === 0) return { normalized: 0, recordId: null as string | null };
  const applied = await applyNormalizedLogsToDailyAttendance(db, { employeeId, attendanceDate, logs, rawLogId: String(logs[0].id), importBatchId: importBatchId ?? null });
  if (applied.lockedWarningId) {
    await db.prepare("UPDATE attendance_raw_logs SET process_status = 'LOCKED_WARNING', locked_day_warning_id = ? WHERE employee_id = ? AND punch_date = ?").bind(applied.lockedWarningId, employeeId, attendanceDate).run();
    return { normalized: 0, recordId: null, lockedWarningId: applied.lockedWarningId };
  }
  await db.prepare("UPDATE attendance_raw_logs SET process_status = 'NORMALIZED', normalized_at = ? WHERE employee_id = ? AND punch_date = ?").bind(new Date().toISOString(), employeeId, attendanceDate).run();
  return { normalized: logs.length, recordId: applied.recordId };
}

export async function refreshAttendanceDailyRecordFromRawLogs(db: D1Database, employeeId: string, attendanceDate: string) {
  return normalizeRawLogsForEmployeeDate(db, employeeId, attendanceDate);
}

export async function normalizeAttendanceRawLogs(db: D1Database, input: { importBatchId?: string | null; employeeId?: string | null } = {}) {
  const conditions = ["employee_id IS NOT NULL", "punch_date IS NOT NULL", "process_status IN ('MATCHED', 'PENDING')"];
  const params: BindValue[] = [];
  if (input.importBatchId) { conditions.push("import_batch_id = ?"); params.push(input.importBatchId); }
  if (input.employeeId) { conditions.push("employee_id = ?"); params.push(input.employeeId); }
  const groups = (await db.prepare(`SELECT employee_id, punch_date FROM attendance_raw_logs WHERE ${conditions.join(" AND ")} GROUP BY employee_id, punch_date LIMIT 1000`).bind(...params).all<{ employee_id: string; punch_date: string }>()).results;
  let normalized = 0;
  let lockedWarnings = 0;
  for (const group of groups) {
    const result = await normalizeRawLogsForEmployeeDate(db, group.employee_id, group.punch_date, input.importBatchId);
    normalized += result.normalized ?? 0;
    if (result.lockedWarningId) lockedWarnings += 1;
  }
  return { normalized, locked_warnings: lockedWarnings };
}

export async function createAttendanceRawLogFromImportRow(db: D1Database, row: NormalizedImportRow, input: { importBatchId: string; source: string; importedByUserId?: string | null }) {
  if (!row.punch_time) return { status: "ERROR", error: "Punch time is required.", rawLogId: null as string | null };
  const duplicateHash = await generateAttendanceRawLogDuplicateHash({ deviceId: row.attendance_device_id, biometricUserId: row.biometric_user_id, employeeCode: row.external_employee_code, punchTime: row.punch_time, punchType: row.punch_type });
  const existing = await db.prepare("SELECT id FROM attendance_raw_logs WHERE duplicate_hash = ?").bind(duplicateHash).first<{ id: string }>();
  if (existing) return { status: "DUPLICATE", rawLogId: existing.id };
  const match = await matchRawLogToEmployee(db, { attendanceDeviceId: row.attendance_device_id, biometricUserId: row.biometric_user_id, externalEmployeeCode: row.external_employee_code });
  const id = crypto.randomUUID();
  const processStatus = match ? "MATCHED" : "UNMATCHED";
  await db.prepare(
    `INSERT INTO attendance_raw_logs
      (id, device_id, attendance_device_id, import_batch_id, employee_id, biometric_mapping_id, external_employee_code,
       biometric_user_id, punch_time, punch_date, punch_type, punch_state, source, origin, process_status,
       duplicate_hash, raw_payload_json, imported_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, row.attendance_device_id, row.attendance_device_id, input.importBatchId, match?.employee_id ?? null, match?.mapping_id ?? null, row.external_employee_code, row.biometric_user_id, row.punch_time, row.punch_date, row.punch_type, row.punch_state, input.source === "ZKTECO_CSV" ? "CSV_IMPORT" : input.source === "PUSH_ADMS" ? "PUSH_ADMS" : "BRIDGE", input.source === "ZKTECO_CSV" ? "CSV_IMPORT" : input.source, processStatus, duplicateHash, JSON.stringify(row.raw_payload), input.importedByUserId ?? null).run();
  if (!match) await createUnmatchedAttendanceLog(db, { rawLogId: id, importBatchId: input.importBatchId, attendanceDeviceId: row.attendance_device_id, biometricUserId: row.biometric_user_id, externalEmployeeCode: row.external_employee_code, punchTime: row.punch_time, reason: "No active employee biometric mapping matched this log." });
  return { status: processStatus, rawLogId: id, employeeId: match?.employee_id ?? null };
}

export async function resolveUnmatchedAttendanceLog(db: D1Database, input: { unmatchedId: string; employeeId: string; resolvedByUserId: string; note?: string | null }) {
  const row = await db.prepare("SELECT * FROM attendance_unmatched_logs WHERE id = ? AND status = 'OPEN'").bind(input.unmatchedId).first<Record<string, unknown>>();
  if (!row) return null;
  await db.prepare("UPDATE attendance_unmatched_logs SET status = 'RESOLVED', resolved_employee_id = ?, resolved_by_user_id = ?, resolved_at = ?, resolution_note = ?, updated_at = ? WHERE id = ?").bind(input.employeeId, input.resolvedByUserId, new Date().toISOString(), input.note ?? null, new Date().toISOString(), input.unmatchedId).run();
  await db.prepare("UPDATE attendance_raw_logs SET employee_id = ?, process_status = 'MATCHED' WHERE id = ?").bind(input.employeeId, row.raw_log_id).run();
  return row;
}

export async function reprocessResolvedUnmatchedLogs(db: D1Database) {
  const rows = (await db.prepare("SELECT raw_log_id, resolved_employee_id FROM attendance_unmatched_logs WHERE status = 'RESOLVED' AND resolved_employee_id IS NOT NULL").all<Record<string, unknown>>()).results;
  for (const row of rows) await db.prepare("UPDATE attendance_raw_logs SET employee_id = ?, process_status = 'MATCHED' WHERE id = ? AND employee_id IS NULL").bind(row.resolved_employee_id, row.raw_log_id).run();
  return { reprocessed: rows.length };
}

export async function resolveLockedDayImportWarning(db: D1Database, input: { warningId: string; userId: string; status: "RESOLVED" | "DISMISSED"; note?: string | null }) {
  await db.prepare("UPDATE attendance_locked_day_import_warnings SET status = ?, resolution_note = ?, resolved_by_user_id = ?, resolved_at = ?, updated_at = ? WHERE id = ?").bind(input.status, input.note ?? null, input.userId, new Date().toISOString(), new Date().toISOString(), input.warningId).run();
}

export async function validateZktecoBridgePayload(payload: Record<string, unknown>) {
  const logs = Array.isArray(payload.logs) ? payload.logs as Record<string, unknown>[] : [];
  if (logs.length === 0) throw new Error("Bridge payload must include at least one log.");
  return logs;
}

export async function authenticateZktecoBridgeRequest(c: Context<AppBindings>, payload: Record<string, unknown>, mode: "LOCAL_BRIDGE" | "PUSH_ADMS" = "LOCAL_BRIDGE") {
  const deviceCode = readString(payload.device_code ?? payload.deviceCode);
  const deviceId = optionalString(payload.device_id ?? payload.deviceId);
  const token = readString(c.req.header("X-HRM-Bridge-Token") ?? c.req.header("X-ZKTeco-Token") ?? c.req.header("Authorization")?.replace(/^Bearer\s+/i, ""));
  const device = await c.env.DB.prepare(
    `SELECT * FROM attendance_devices
     WHERE (id = ? OR device_code = ? OR external_device_id = ?)
       AND status = 'ACTIVE'
       AND ((? = 'LOCAL_BRIDGE' AND allow_bridge_import = 1) OR (? = 'PUSH_ADMS' AND allow_push_adms = 1))
     LIMIT 1`
  ).bind(deviceId ?? "", deviceCode, deviceCode, mode, mode).first<Record<string, unknown>>();
  if (!device) return null;
  const stored = readString(mode === "PUSH_ADMS" ? device.adms_device_key : device.bridge_token_hash);
  if (stored && token && stored === token) return device;
  if (!stored && token && token.length >= 16) return device;
  return null;
}

export async function ingestZktecoBridgeLogs(c: Context<AppBindings>, device: Record<string, unknown>, logs: Record<string, unknown>[]) {
  const batch = await createAttendanceImportBatch(c.env.DB, { source: "LOCAL_BRIDGE", attendanceDeviceId: String(device.id), totalRows: logs.length, options: { bridge: true } });
  let inserted = 0;
  let unmatched = 0;
  let duplicates = 0;
  for (const [index, log] of logs.entries()) {
    const row: NormalizedImportRow = {
      row_number: index + 1,
      attendance_device_id: String(device.id),
      biometric_user_id: optionalString(log.biometric_user_id ?? log.user_id ?? log.pin),
      external_employee_code: optionalString(log.employee_no ?? log.employee_code),
      punch_time: normalizeDateTime(optionalString(log.punch_time ?? log.time ?? log.timestamp)),
      punch_date: null,
      punch_type: normalizePunchType(log.punch_type ?? log.state),
      punch_state: optionalString(log.state ?? log.punch_state),
      raw_payload: log
    };
    row.punch_date = row.punch_time ? row.punch_time.slice(0, 10) : null;
    const result = await createAttendanceRawLogFromImportRow(c.env.DB, row, { importBatchId: batch.id, source: "LOCAL_BRIDGE" });
    if (result.status === "MATCHED") inserted += 1;
    if (result.status === "UNMATCHED") unmatched += 1;
    if (result.status === "DUPLICATE") duplicates += 1;
  }
  await c.env.DB.prepare("UPDATE attendance_import_batches SET status = ?, processed_rows = ?, inserted_rows = ?, duplicate_rows = ?, unmatched_rows = ?, processed_at = ?, updated_at = ? WHERE id = ?").bind(unmatched > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED", logs.length, inserted, duplicates, unmatched, new Date().toISOString(), new Date().toISOString(), batch.id).run();
  await normalizeAttendanceRawLogs(c.env.DB, { importBatchId: batch.id });
  return { batch_id: batch.id, inserted, unmatched, duplicates };
}

export async function validateZktecoPushAdmsDevice(c: Context<AppBindings>, payload: Record<string, unknown>) {
  return authenticateZktecoBridgeRequest(c, payload, "PUSH_ADMS");
}

export function parseZktecoPushAdmsLogsPlaceholder(payload: Record<string, unknown>) {
  return Array.isArray(payload.logs) ? payload.logs as Record<string, unknown>[] : [];
}

export async function ingestZktecoPushAdmsPayload(c: Context<AppBindings>, device: Record<string, unknown>, payload: Record<string, unknown>) {
  return ingestZktecoBridgeLogs(c, device, parseZktecoPushAdmsLogsPlaceholder(payload));
}

function scopedRawLogJoin() {
  return `attendance_raw_logs arl
    LEFT JOIN employees e ON e.id = arl.employee_id
    LEFT JOIN departments d ON d.id = e.primary_department_id
    LEFT JOIN locations l ON l.id = e.primary_location_id
    LEFT JOIN attendance_devices ad ON ad.id = COALESCE(arl.attendance_device_id, arl.device_id)`;
}

async function applyAttendanceScope(c: Context<AppBindings>, conditions: string[], params: BindValue[], action: "view" | "manage" = "view") {
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "attendance", action, "e");
  conditions.push("(arl.employee_id IS NULL OR " + scope.sql + ")");
  params.push(...(scope.params as BindValue[]));
}

async function ensureCanAccessEmployee(c: Context<AppBindings>, employeeId: string, action: "view" | "manage" = "view") {
  return canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "attendance", action);
}

attendanceDeviceSyncRoutes.get("/devices/settings", requireAnyPermission(["attendance.devices.settings.view", "attendance.devices.settings.manage", "attendance.devices.manage"]), async (c) => {
  await ensureDeviceSettings(c.env.DB);
  const settings = await c.env.DB.prepare("SELECT * FROM attendance_device_settings WHERE id = 'attendance_device_settings_default'").first();
  return ok(c, { settings });
});

attendanceDeviceSyncRoutes.patch("/devices/settings", requireAnyPermission(["attendance.devices.settings.update", "attendance.devices.settings.manage", "attendance.devices.manage"]), async (c) => {
  await ensureDeviceSettings(c.env.DB);
  const old = await c.env.DB.prepare("SELECT * FROM attendance_device_settings WHERE id = 'attendance_device_settings_default'").first<Record<string, unknown>>();
  const body = await readJsonBody(c.req.raw);
  await c.env.DB.prepare(
    `UPDATE attendance_device_settings
     SET zkteco_csv_import_enabled = ?, zkteco_local_bridge_enabled = ?, zkteco_push_adms_enabled = ?,
       auto_match_by_biometric_user_id = ?, auto_match_by_employee_no = ?, auto_normalize_after_import = ?,
       prevent_locked_day_overwrite = ?, duplicate_window_seconds = ?, default_timezone = ?,
       csv_allowed_extensions_json = ?, max_import_rows = ?, bridge_clock_skew_minutes = ?,
       updated_by_user_id = ?, updated_at = ?
     WHERE id = 'attendance_device_settings_default'`
  ).bind(
    bool(body.zkteco_csv_import_enabled, Boolean(old?.zkteco_csv_import_enabled ?? 1)) ? 1 : 0,
    bool(body.zkteco_local_bridge_enabled, Boolean(old?.zkteco_local_bridge_enabled ?? 0)) ? 1 : 0,
    bool(body.zkteco_push_adms_enabled, Boolean(old?.zkteco_push_adms_enabled ?? 0)) ? 1 : 0,
    bool(body.auto_match_by_biometric_user_id, Boolean(old?.auto_match_by_biometric_user_id ?? 1)) ? 1 : 0,
    bool(body.auto_match_by_employee_no, Boolean(old?.auto_match_by_employee_no ?? 1)) ? 1 : 0,
    bool(body.auto_normalize_after_import, Boolean(old?.auto_normalize_after_import ?? 1)) ? 1 : 0,
    bool(body.prevent_locked_day_overwrite, Boolean(old?.prevent_locked_day_overwrite ?? 1)) ? 1 : 0,
    numberOrNull(body.duplicate_window_seconds ?? old?.duplicate_window_seconds) ?? 60,
    optionalString(body.default_timezone ?? old?.default_timezone),
    readString(body.csv_allowed_extensions_json ?? old?.csv_allowed_extensions_json) || '["csv","txt"]',
    numberOrNull(body.max_import_rows ?? old?.max_import_rows) ?? 20000,
    numberOrNull(body.bridge_clock_skew_minutes ?? old?.bridge_clock_skew_minutes) ?? 15,
    c.get("currentUser").id,
    new Date().toISOString()
  ).run();
  await auditAttendanceDevice(c, { action: "attendance.device_settings.updated", entityType: "attendance_device_settings", entityId: "attendance_device_settings_default", oldValue: old, newValue: body });
  return ok(c, { settings: await c.env.DB.prepare("SELECT * FROM attendance_device_settings WHERE id = 'attendance_device_settings_default'").first() });
});

attendanceDeviceSyncRoutes.post("/devices/:deviceId/archive", requireAnyPermission(["attendance.devices.archive", "attendance.devices.manage"]), async (c) => {
  const id = routeParam(c, "deviceId");
  const old = await c.env.DB.prepare("SELECT * FROM attendance_devices WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!old) return fail(c, 404, "NOT_FOUND", "Attendance device was not found.");
  await c.env.DB.prepare("UPDATE attendance_devices SET status = 'ARCHIVED', archived_at = ?, archived_by_user_id = ?, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), c.get("currentUser").id, new Date().toISOString(), id).run();
  await auditAttendanceDevice(c, { action: "attendance.device.archived", entityType: "attendance_device", entityId: id, oldValue: old });
  await publishAttendanceDeviceEvent(c, "attendance.device.changed", { actor_user_id: c.get("currentUser").id, entity_type: "attendance_device", entity_id: id, action: "archived" });
  return ok(c, { archived: true });
});

attendanceDeviceSyncRoutes.post("/devices/:deviceId/test-connection-placeholder", requireAnyPermission(["attendance.devices.technical", "attendance.devices.manage"]), async (c) => {
  const id = routeParam(c, "deviceId");
  const device = await c.env.DB.prepare("SELECT * FROM attendance_devices WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!device) return fail(c, 404, "NOT_FOUND", "Attendance device was not found.");
  await c.env.DB.prepare("UPDATE attendance_devices SET last_error_message = NULL, health_status = 'UNKNOWN', updated_at = ? WHERE id = ?").bind(new Date().toISOString(), id).run();
  return ok(c, { status: "PLACEHOLDER", message: "Direct device connection testing will be implemented by a future bridge/SDK phase.", device_id: id });
});

attendanceDeviceSyncRoutes.get("/devices/:deviceId/diagnostics", requireAnyPermission(["attendance.device_diagnostics.view", "attendance.devices.technical", "attendance.devices.manage"]), async (c) => {
  const id = routeParam(c, "deviceId");
  const [device, counts] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM attendance_devices WHERE id = ?").bind(id).first<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT process_status, COUNT(*) AS count FROM attendance_raw_logs WHERE COALESCE(attendance_device_id, device_id) = ? GROUP BY process_status").bind(id).all()
  ]);
  if (!device) return fail(c, 404, "NOT_FOUND", "Attendance device was not found.");
  return ok(c, { device, status_counts: counts.results, diagnostics: { connection: "PLACEHOLDER", sdk_polling: "NOT_IMPLEMENTED", adms_push: Boolean(device.allow_push_adms) } });
});

attendanceDeviceSyncRoutes.get("/biometric-mappings", requireAnyPermission(["attendance.biometric_mappings.view", "attendance.biometric_mappings.manage", "attendance.view"]), async (c) => {
  const conditions = ["ebm.status != 'ARCHIVED'"];
  const params: BindValue[] = [];
  const search = readString(c.req.query("search"));
  if (search) {
    conditions.push("(e.employee_no LIKE ? OR e.full_name LIKE ? OR ebm.biometric_user_id LIKE ? OR ebm.external_employee_code LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  const rows = await c.env.DB.prepare(
    `SELECT ebm.*, e.employee_no, e.full_name AS employee_name, ad.name AS device_name, ad.device_code
     FROM employee_biometric_mappings ebm
     JOIN employees e ON e.id = ebm.employee_id
     LEFT JOIN attendance_devices ad ON ad.id = ebm.attendance_device_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY e.employee_no, ebm.created_at DESC LIMIT 500`
  ).bind(...params).all();
  return ok(c, { mappings: rows.results });
});

async function upsertBiometricMapping(c: Context<AppBindings>, employeeId: string, existing?: Record<string, unknown>) {
  if (!(await ensureCanAccessEmployee(c, employeeId, "manage"))) return fail(c, 403, "FORBIDDEN", "You do not have access to manage this employee.");
  const body = await readJsonBody(c.req.raw);
  const input = {
    attendance_device_id: optionalString(body.attendance_device_id ?? existing?.attendance_device_id),
    biometric_user_id: readString(body.biometric_user_id ?? existing?.biometric_user_id),
    biometric_user_name: optionalString(body.biometric_user_name ?? existing?.biometric_user_name),
    external_employee_code: optionalString(body.external_employee_code ?? existing?.external_employee_code),
    mapping_source: readString(body.mapping_source ?? existing?.mapping_source ?? "MANUAL").toUpperCase(),
    status: readString(body.status ?? existing?.status ?? "ACTIVE").toUpperCase(),
    is_primary: bool(body.is_primary, Boolean(existing?.is_primary ?? 0)),
    notes: optionalString(body.notes ?? existing?.notes)
  };
  if (!input.biometric_user_id) return fail(c, 400, "VALIDATION_ERROR", "Biometric user ID is required.");
  return { input };
}

async function validateBiometricMappingUniqueness(c: Context<AppBindings>, input: { biometricUserId: string; attendanceDeviceId?: string | null; excludeMappingId?: string | null }) {
  const existing = await c.env.DB
    .prepare(
      `SELECT id FROM employee_biometric_mappings
       WHERE status = 'ACTIVE'
         AND biometric_user_id = ?
         AND COALESCE(attendance_device_id, '') = COALESCE(?, '')
         AND (? IS NULL OR id != ?)
       LIMIT 1`
    )
    .bind(input.biometricUserId, input.attendanceDeviceId ?? null, input.excludeMappingId ?? null, input.excludeMappingId ?? null)
    .first<{ id: string }>();
  return validateDuplicateConflict(existing, "biometric_user_id", "An active mapping already exists for this device and biometric user ID.");
}

attendanceDeviceSyncRoutes.post("/biometric-mappings", requireAnyPermission(["attendance.biometric_mappings.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const employeeId = readString(body.employee_id);
  if (!employeeId) return fail(c, 400, "VALIDATION_ERROR", "Employee is required.");
  const prepared = await upsertBiometricMapping(c, employeeId);
  if ("status" in prepared) return prepared;
  const duplicateIssues = await validateBiometricMappingUniqueness(c, { biometricUserId: prepared.input.biometric_user_id, attendanceDeviceId: prepared.input.attendance_device_id });
  if (hasValidationErrors(duplicateIssues)) return validationResponse(c, duplicateIssues, 409);
  const id = crypto.randomUUID();
  try {
    await c.env.DB.prepare(
      `INSERT INTO employee_biometric_mappings
        (id, employee_id, attendance_device_id, biometric_user_id, biometric_user_name, external_employee_code, mapping_source, status, is_primary, notes, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, employeeId, prepared.input.attendance_device_id, prepared.input.biometric_user_id, prepared.input.biometric_user_name, prepared.input.external_employee_code, prepared.input.mapping_source, prepared.input.status, prepared.input.is_primary ? 1 : 0, prepared.input.notes, c.get("currentUser").id, c.get("currentUser").id).run();
  } catch {
    return fail(c, 409, "DUPLICATE_MAPPING", "An active mapping already exists for this device and biometric user ID.");
  }
  await auditAttendanceDevice(c, { action: "attendance.biometric_mapping.created", entityType: "employee_biometric_mapping", entityId: id, newValue: prepared.input });
  return ok(c, { mapping: await c.env.DB.prepare("SELECT * FROM employee_biometric_mappings WHERE id = ?").bind(id).first() }, 201);
});

attendanceDeviceSyncRoutes.patch("/biometric-mappings/:mappingId", requireAnyPermission(["attendance.biometric_mappings.manage"]), async (c) => {
  const id = routeParam(c, "mappingId");
  const old = await c.env.DB.prepare("SELECT * FROM employee_biometric_mappings WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!old) return fail(c, 404, "NOT_FOUND", "Biometric mapping was not found.");
  const prepared = await upsertBiometricMapping(c, String(old.employee_id), old);
  if ("status" in prepared) return prepared;
  const duplicateIssues = await validateBiometricMappingUniqueness(c, { biometricUserId: prepared.input.biometric_user_id, attendanceDeviceId: prepared.input.attendance_device_id, excludeMappingId: id });
  if (hasValidationErrors(duplicateIssues)) return validationResponse(c, duplicateIssues, 409);
  await c.env.DB.prepare(
    `UPDATE employee_biometric_mappings SET attendance_device_id = ?, biometric_user_id = ?, biometric_user_name = ?,
       external_employee_code = ?, mapping_source = ?, status = ?, is_primary = ?, notes = ?, updated_by_user_id = ?, updated_at = ?
     WHERE id = ?`
  ).bind(prepared.input.attendance_device_id, prepared.input.biometric_user_id, prepared.input.biometric_user_name, prepared.input.external_employee_code, prepared.input.mapping_source, prepared.input.status, prepared.input.is_primary ? 1 : 0, prepared.input.notes, c.get("currentUser").id, new Date().toISOString(), id).run();
  await auditAttendanceDevice(c, { action: "attendance.biometric_mapping.updated", entityType: "employee_biometric_mapping", entityId: id, oldValue: old, newValue: prepared.input });
  return ok(c, { mapping: await c.env.DB.prepare("SELECT * FROM employee_biometric_mappings WHERE id = ?").bind(id).first() });
});

attendanceDeviceSyncRoutes.post("/biometric-mappings/:mappingId/archive", requireAnyPermission(["attendance.biometric_mappings.manage"]), async (c) => {
  const id = routeParam(c, "mappingId");
  const old = await c.env.DB.prepare("SELECT * FROM employee_biometric_mappings WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!old) return fail(c, 404, "NOT_FOUND", "Biometric mapping was not found.");
  await c.env.DB.prepare("UPDATE employee_biometric_mappings SET status = 'ARCHIVED', archived_at = ?, archived_by_user_id = ?, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), c.get("currentUser").id, new Date().toISOString(), id).run();
  await auditAttendanceDevice(c, { action: "attendance.biometric_mapping.archived", entityType: "employee_biometric_mapping", entityId: id, oldValue: old });
  return ok(c, { archived: true });
});

attendanceDeviceSyncRoutes.get("/import-batches", requireAnyPermission(["attendance.import_batches.view", "attendance.import_batches.manage", "attendance.devices.manage"]), async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT aib.*, ad.name AS device_name, ad.device_code, u.name AS uploaded_by_name
     FROM attendance_import_batches aib
     LEFT JOIN attendance_devices ad ON ad.id = aib.attendance_device_id
     LEFT JOIN users u ON u.id = aib.uploaded_by_user_id
     ORDER BY aib.uploaded_at DESC LIMIT 500`
  ).all();
  return ok(c, { batches: rows.results });
});

attendanceDeviceSyncRoutes.get("/import-batches/:batchId", requireAnyPermission(["attendance.import_batches.view", "attendance.import_batches.manage", "attendance.devices.manage"]), async (c) => {
  const batch = await c.env.DB.prepare("SELECT * FROM attendance_import_batches WHERE id = ?").bind(routeParam(c, "batchId")).first();
  if (!batch) return fail(c, 404, "NOT_FOUND", "Import batch was not found.");
  const [logs, errors] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM attendance_raw_logs WHERE import_batch_id = ? ORDER BY punch_time DESC LIMIT 200").bind(routeParam(c, "batchId")).all(),
    c.env.DB.prepare("SELECT * FROM attendance_import_row_errors WHERE import_batch_id = ? ORDER BY row_number LIMIT 200").bind(routeParam(c, "batchId")).all()
  ]);
  return ok(c, { batch, logs: logs.results, errors: errors.results });
});

attendanceDeviceSyncRoutes.get("/import-batches/:batchId/errors", requireAnyPermission(["attendance.import_errors.view", "attendance.import_batches.view", "attendance.import_batches.manage"]), async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM attendance_import_row_errors WHERE import_batch_id = ? ORDER BY row_number, created_at").bind(routeParam(c, "batchId")).all();
  return ok(c, { errors: rows.results });
});

attendanceDeviceSyncRoutes.post("/import-batches/zkteco-csv", requireAnyPermission(["attendance.import_batches.upload", "attendance.import_batches.manage", "attendance.devices.manage"]), async (c) => {
  await ensureDeviceSettings(c.env.DB);
  const settings = await c.env.DB.prepare("SELECT * FROM attendance_device_settings WHERE id = 'attendance_device_settings_default'").first<Record<string, unknown>>();
  if (Number(settings?.zkteco_csv_import_enabled ?? 1) !== 1) return fail(c, 403, "CSV_IMPORT_DISABLED", "ZKTeco CSV import is disabled.");
  const form = await c.req.formData();
  const file = form.get("file");
  const deviceId = optionalString(form.get("attendance_device_id") ?? form.get("device_id"));
  if (!(file instanceof File)) return fail(c, 400, "VALIDATION_ERROR", "CSV file is required.");
  const text = await file.text();
  const parsed = parseZktecoCsvAttendance(text);
  const maxRows = Number(settings?.max_import_rows ?? 20000);
  if (parsed.rows.length > maxRows) return fail(c, 400, "IMPORT_TOO_LARGE", `Import file has more than ${maxRows} rows.`);
  const batch = await createAttendanceImportBatch(c.env.DB, { source: "ZKTECO_CSV", attendanceDeviceId: deviceId, fileName: file.name, fileHash: await sha256Hex(text), totalRows: parsed.rows.length, uploadedByUserId: c.get("currentUser").id, options: { columns: detectZktecoCsvColumns(parsed.headers) } });
  const columns = detectZktecoCsvColumns(parsed.headers);
  let inserted = 0, duplicates = 0, unmatched = 0, errors = 0;
  for (const [index, row] of parsed.rows.entries()) {
    const normalized = normalizeZktecoCsvRow(row, index + 2, columns, deviceId);
    const result = await createAttendanceRawLogFromImportRow(c.env.DB, normalized, { importBatchId: batch.id, source: "ZKTECO_CSV", importedByUserId: c.get("currentUser").id });
    if (result.status === "ERROR") {
      errors += 1;
      await c.env.DB.prepare("INSERT INTO attendance_import_row_errors (id, import_batch_id, row_number, error_code, error_message, row_payload_json) VALUES (?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), batch.id, normalized.row_number, "ROW_VALIDATION_ERROR", result.error ?? "Row could not be imported.", JSON.stringify(row)).run();
    } else if (result.status === "DUPLICATE") duplicates += 1;
    else if (result.status === "UNMATCHED") unmatched += 1;
    else inserted += 1;
  }
  const normalized = Number(settings?.auto_normalize_after_import ?? 1) === 1 ? await normalizeAttendanceRawLogs(c.env.DB, { importBatchId: batch.id }) : { normalized: 0, locked_warnings: 0 };
  const status = errors > 0 || unmatched > 0 || normalized.locked_warnings > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED";
  await c.env.DB.prepare(
    `UPDATE attendance_import_batches
     SET status = ?, processed_rows = ?, inserted_rows = ?, duplicate_rows = ?, unmatched_rows = ?, error_rows = ?, locked_warning_rows = ?,
       summary_json = ?, processed_by_user_id = ?, processed_at = ?, updated_at = ?
     WHERE id = ?`
  ).bind(status, parsed.rows.length, inserted, duplicates, unmatched, errors, normalized.locked_warnings, JSON.stringify({ normalized }), c.get("currentUser").id, new Date().toISOString(), new Date().toISOString(), batch.id).run();
  await auditAttendanceDevice(c, { action: "attendance.import_batch.uploaded", entityType: "attendance_import_batch", entityId: batch.id, newValue: { file: file.name, inserted, duplicates, unmatched, errors } });
  await publishAttendanceDeviceEvent(c, "attendance.raw_logs.imported", { actor_user_id: c.get("currentUser").id, entity_type: "attendance_import_batch", entity_id: batch.id, action: "zkteco_csv_imported" });
  return ok(c, { batch_id: batch.id, batch_number: batch.batch_number, inserted, duplicates, unmatched, errors, normalized }, 201);
});

attendanceDeviceSyncRoutes.post("/import-batches/:batchId/process", requireAnyPermission(["attendance.import_batches.process", "attendance.import_batches.manage", "attendance.devices.manage"]), async (c) => {
  const batchId = routeParam(c, "batchId");
  const normalized = await normalizeAttendanceRawLogs(c.env.DB, { importBatchId: batchId });
  await c.env.DB.prepare("UPDATE attendance_import_batches SET status = CASE WHEN ? > 0 THEN 'COMPLETED_WITH_ERRORS' ELSE 'COMPLETED' END, locked_warning_rows = locked_warning_rows + ?, processed_by_user_id = ?, processed_at = ?, updated_at = ? WHERE id = ?").bind(normalized.locked_warnings, normalized.locked_warnings, c.get("currentUser").id, new Date().toISOString(), new Date().toISOString(), batchId).run();
  await auditAttendanceDevice(c, { action: "attendance.import_batch.processed", entityType: "attendance_import_batch", entityId: batchId, newValue: normalized });
  return ok(c, normalized);
});

attendanceDeviceSyncRoutes.post("/import-batches/:batchId/cancel", requireAnyPermission(["attendance.import_batches.cancel", "attendance.import_batches.manage", "attendance.devices.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const reason = readString(body.reason);
  if (!reason) return fail(c, 400, "VALIDATION_ERROR", "Cancel reason is required.");
  await c.env.DB.prepare("UPDATE attendance_import_batches SET status = 'CANCELLED', cancelled_at = ?, cancel_reason = ?, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), reason, new Date().toISOString(), routeParam(c, "batchId")).run();
  await auditAttendanceDevice(c, { action: "attendance.import_batch.cancelled", entityType: "attendance_import_batch", entityId: routeParam(c, "batchId"), reason });
  return ok(c, { cancelled: true });
});

attendanceDeviceSyncRoutes.get("/raw-logs", requireAnyPermission(["attendance.raw_logs.view", "attendance.raw_logs.manage", "attendance.view"]), async (c) => {
  const conditions: string[] = [];
  const params: BindValue[] = [];
  const search = readString(c.req.query("search"));
  if (search) {
    conditions.push("(e.employee_no LIKE ? OR e.full_name LIKE ? OR arl.biometric_user_id LIKE ? OR arl.external_employee_code LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  for (const [queryName, column] of [["device_id", "COALESCE(arl.attendance_device_id, arl.device_id)"], ["process_status", "arl.process_status"], ["source", "arl.source"], ["employee_id", "arl.employee_id"]] as const) {
    const value = readString(c.req.query(queryName));
    if (value) {
      conditions.push(`${column} = ?`);
      params.push(value);
    }
  }
  const from = readString(c.req.query("date_from"));
  const to = readString(c.req.query("date_to"));
  if (from) { conditions.push("arl.punch_date >= ?"); params.push(from); }
  if (to) { conditions.push("arl.punch_date <= ?"); params.push(to); }
  await applyAttendanceScope(c, conditions, params, "view");
  const rows = await c.env.DB.prepare(
    `SELECT arl.*, e.employee_no, e.full_name AS employee_name, d.name AS department_name, l.name AS location_name,
       ad.name AS device_name, ad.device_code
     FROM ${scopedRawLogJoin()}
     ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
     ORDER BY arl.punch_time DESC LIMIT 1000`
  ).bind(...params).all();
  return ok(c, { logs: rows.results, raw_logs: rows.results });
});

attendanceDeviceSyncRoutes.get("/raw-logs/:rawLogId", requireAnyPermission(["attendance.raw_logs.view", "attendance.raw_logs.manage", "attendance.view"]), async (c) => {
  const rawLogId = routeParam(c, "rawLogId");
  const row = await c.env.DB.prepare(`SELECT arl.*, e.employee_no, e.full_name AS employee_name, ad.name AS device_name FROM ${scopedRawLogJoin()} WHERE arl.id = ?`).bind(rawLogId).first<Record<string, unknown>>();
  if (!row) return fail(c, 404, "NOT_FOUND", "Raw attendance log was not found.");
  if (row.employee_id && !(await ensureCanAccessEmployee(c, String(row.employee_id), "view"))) return fail(c, 404, "NOT_FOUND", "Raw attendance log was not found.");
  return ok(c, { log: row });
});

attendanceDeviceSyncRoutes.post("/raw-logs/:rawLogId/reprocess", requireAnyPermission(["attendance.raw_logs.reprocess", "attendance.raw_logs.manage", "attendance.devices.manage"]), async (c) => {
  const rawLogId = routeParam(c, "rawLogId");
  const row = await c.env.DB.prepare("SELECT * FROM attendance_raw_logs WHERE id = ?").bind(rawLogId).first<Record<string, unknown>>();
  if (!row) return fail(c, 404, "NOT_FOUND", "Raw attendance log was not found.");
  const match = await matchRawLogToEmployee(c.env.DB, { attendanceDeviceId: optionalString(row.attendance_device_id ?? row.device_id), biometricUserId: optionalString(row.biometric_user_id), externalEmployeeCode: optionalString(row.external_employee_code) });
  if (!match) return fail(c, 400, "UNMATCHED_LOG", "No employee mapping exists for this raw log.");
  await c.env.DB.prepare("UPDATE attendance_raw_logs SET employee_id = ?, biometric_mapping_id = ?, process_status = 'MATCHED' WHERE id = ?").bind(match.employee_id, match.mapping_id, rawLogId).run();
  const normalized = row.punch_date ? await normalizeRawLogsForEmployeeDate(c.env.DB, match.employee_id, String(row.punch_date), optionalString(row.import_batch_id)) : { normalized: 0 };
  await auditAttendanceDevice(c, { action: "attendance.raw_log.reprocessed", entityType: "attendance_raw_log", entityId: rawLogId, newValue: normalized });
  return ok(c, { reprocessed: true, normalized });
});

attendanceDeviceSyncRoutes.post("/raw-logs/manual", requireAnyPermission(["attendance.raw_logs.manual", "attendance.raw_logs.manage", "attendance.manual_entries.manage", "attendance.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const employeeId = readString(body.employee_id);
  const punchTime = normalizeDateTime(readString(body.punch_time));
  const reason = readString(body.reason);
  if (!employeeId || !punchTime || !reason) return fail(c, 400, "VALIDATION_ERROR", "Employee, punch time, and reason are required.");
  if (!(await ensureCanAccessEmployee(c, employeeId, "manage"))) return fail(c, 403, "FORBIDDEN", "You do not have access to manage this employee.");
  const attendanceDeviceId = optionalString(body.attendance_device_id ?? body.device_id);
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO attendance_raw_logs
      (id, device_id, attendance_device_id, employee_id, external_employee_code, biometric_user_id, punch_time, punch_date, punch_type, source, origin, process_status, is_manual_entry, raw_payload_json, imported_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL_IMPORT', 'MANUAL', 'MATCHED', 1, ?, ?)`
  ).bind(id, attendanceDeviceId, attendanceDeviceId, employeeId, optionalString(body.external_employee_code), optionalString(body.biometric_user_id), punchTime, punchTime.slice(0, 10), normalizePunchType(body.punch_type), JSON.stringify({ reason }), c.get("currentUser").id).run();
  const normalized = await normalizeRawLogsForEmployeeDate(c.env.DB, employeeId, punchTime.slice(0, 10));
  await auditAttendanceDevice(c, { action: "attendance.raw_log.manual_created", entityType: "attendance_raw_log", entityId: id, reason, newValue: body });
  return ok(c, { log_id: id, normalized }, 201);
});

attendanceDeviceSyncRoutes.get("/unmatched-logs", requireAnyPermission(["attendance.unmatched_logs.view", "attendance.unmatched_logs.manage", "attendance.devices.manage"]), async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT aul.*, ad.name AS device_name, ad.device_code, e.employee_no AS resolved_employee_no, e.full_name AS resolved_employee_name
     FROM attendance_unmatched_logs aul
     LEFT JOIN attendance_devices ad ON ad.id = aul.attendance_device_id
     LEFT JOIN employees e ON e.id = aul.resolved_employee_id
     ORDER BY aul.created_at DESC LIMIT 500`
  ).all();
  return ok(c, { unmatched_logs: rows.results });
});

attendanceDeviceSyncRoutes.post("/unmatched-logs/:unmatchedId/map-employee", requireAnyPermission(["attendance.unmatched_logs.resolve", "attendance.unmatched_logs.manage", "attendance.biometric_mappings.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const employeeId = readString(body.employee_id);
  if (!employeeId) return fail(c, 400, "VALIDATION_ERROR", "Employee is required.");
  if (!(await ensureCanAccessEmployee(c, employeeId, "manage"))) return fail(c, 403, "FORBIDDEN", "You do not have access to manage this employee.");
  const old = await resolveUnmatchedAttendanceLog(c.env.DB, { unmatchedId: routeParam(c, "unmatchedId"), employeeId, resolvedByUserId: c.get("currentUser").id, note: optionalString(body.note) });
  if (!old) return fail(c, 404, "NOT_FOUND", "Open unmatched log was not found.");
  await auditAttendanceDevice(c, { action: "attendance.unmatched_log.resolved", entityType: "attendance_unmatched_log", entityId: routeParam(c, "unmatchedId"), oldValue: old, newValue: { employeeId } });
  return ok(c, { resolved: true });
});

attendanceDeviceSyncRoutes.post("/unmatched-logs/:unmatchedId/ignore", requireAnyPermission(["attendance.unmatched_logs.resolve", "attendance.unmatched_logs.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const note = readString(body.note || body.reason);
  if (!note) return fail(c, 400, "VALIDATION_ERROR", "Ignore reason is required.");
  await c.env.DB.prepare("UPDATE attendance_unmatched_logs SET status = 'IGNORED', resolution_note = ?, resolved_by_user_id = ?, resolved_at = ?, updated_at = ? WHERE id = ?").bind(note, c.get("currentUser").id, new Date().toISOString(), new Date().toISOString(), routeParam(c, "unmatchedId")).run();
  await auditAttendanceDevice(c, { action: "attendance.unmatched_log.ignored", entityType: "attendance_unmatched_log", entityId: routeParam(c, "unmatchedId"), reason: note });
  return ok(c, { ignored: true });
});

attendanceDeviceSyncRoutes.post("/unmatched-logs/reprocess-resolved", requireAnyPermission(["attendance.unmatched_logs.manage", "attendance.raw_logs.reprocess"]), async (c) => {
  const result = await reprocessResolvedUnmatchedLogs(c.env.DB);
  await normalizeAttendanceRawLogs(c.env.DB);
  return ok(c, result);
});

attendanceDeviceSyncRoutes.get("/locked-day-import-warnings", requireAnyPermission(["attendance.locked_warnings.view", "attendance.locked_warnings.manage", "attendance.devices.manage"]), async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT w.*, e.employee_no, e.full_name AS employee_name
     FROM attendance_locked_day_import_warnings w
     LEFT JOIN employees e ON e.id = w.employee_id
     ORDER BY w.created_at DESC LIMIT 500`
  ).all();
  return ok(c, { warnings: rows.results });
});

attendanceDeviceSyncRoutes.post("/locked-day-import-warnings/:warningId/resolve", requireAnyPermission(["attendance.locked_warnings.resolve", "attendance.locked_warnings.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw);
  await resolveLockedDayImportWarning(c.env.DB, { warningId: routeParam(c, "warningId"), userId: c.get("currentUser").id, status: "RESOLVED", note: optionalString(body.note) });
  await auditAttendanceDevice(c, { action: "attendance.locked_day_warning.resolved", entityType: "attendance_locked_day_import_warning", entityId: routeParam(c, "warningId"), reason: optionalString(body.note) });
  return ok(c, { resolved: true });
});

attendanceDeviceSyncRoutes.post("/locked-day-import-warnings/:warningId/dismiss", requireAnyPermission(["attendance.locked_warnings.resolve", "attendance.locked_warnings.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const note = readString(body.note || body.reason);
  if (!note) return fail(c, 400, "VALIDATION_ERROR", "Dismiss reason is required.");
  await resolveLockedDayImportWarning(c.env.DB, { warningId: routeParam(c, "warningId"), userId: c.get("currentUser").id, status: "DISMISSED", note });
  await auditAttendanceDevice(c, { action: "attendance.locked_day_warning.dismissed", entityType: "attendance_locked_day_import_warning", entityId: routeParam(c, "warningId"), reason: note });
  return ok(c, { dismissed: true });
});

attendanceDeviceSyncRoutes.get("/import-errors", requireAnyPermission(["attendance.import_errors.view", "attendance.import_errors.manage", "attendance.import_batches.view"]), async (c) => {
  const conditions: string[] = [];
  const params: BindValue[] = [];
  const status = readString(c.req.query("status"));
  const batchId = readString(c.req.query("batch_id"));
  if (status) { conditions.push("aire.status = ?"); params.push(status); }
  if (batchId) { conditions.push("aire.import_batch_id = ?"); params.push(batchId); }
  const rows = await c.env.DB.prepare(
    `SELECT aire.*, aib.batch_number, aib.file_name
     FROM attendance_import_row_errors aire
     LEFT JOIN attendance_import_batches aib ON aib.id = aire.import_batch_id
     ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
     ORDER BY aire.created_at DESC LIMIT 500`
  ).bind(...params).all();
  return ok(c, { errors: rows.results });
});

attendanceDeviceSyncRoutes.get("/import-errors/:errorId", requireAnyPermission(["attendance.import_errors.view", "attendance.import_errors.manage", "attendance.import_batches.view"]), async (c) => {
  const error = await c.env.DB.prepare("SELECT * FROM attendance_import_row_errors WHERE id = ?").bind(routeParam(c, "errorId")).first();
  if (!error) return fail(c, 404, "NOT_FOUND", "Import row error was not found.");
  return ok(c, { error });
});

attendanceDeviceSyncRoutes.post("/import-errors/:errorId/resolve", requireAnyPermission(["attendance.import_errors.manage", "attendance.import_batches.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw);
  await c.env.DB.prepare("UPDATE attendance_import_row_errors SET status = 'RESOLVED', resolution_note = ?, resolved_by_user_id = ?, resolved_at = ?, updated_at = ? WHERE id = ?").bind(optionalString(body.note), c.get("currentUser").id, new Date().toISOString(), new Date().toISOString(), routeParam(c, "errorId")).run();
  return ok(c, { resolved: true });
});

attendanceDeviceSyncRoutes.post("/import-errors/:errorId/ignore", requireAnyPermission(["attendance.import_errors.manage", "attendance.import_batches.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const note = readString(body.note || body.reason);
  if (!note) return fail(c, 400, "VALIDATION_ERROR", "Ignore reason is required.");
  await c.env.DB.prepare("UPDATE attendance_import_row_errors SET status = 'IGNORED', resolution_note = ?, resolved_by_user_id = ?, resolved_at = ?, updated_at = ? WHERE id = ?").bind(note, c.get("currentUser").id, new Date().toISOString(), new Date().toISOString(), routeParam(c, "errorId")).run();
  return ok(c, { ignored: true });
});

attendanceDeviceSyncRoutes.get("/device-diagnostics", requireAnyPermission(["attendance.device_diagnostics.view", "attendance.devices.technical", "attendance.devices.manage"]), async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT ad.id, ad.name, ad.device_code, ad.vendor, ad.device_mode, ad.status, ad.health_status, ad.last_seen_at, ad.last_sync_at,
       (SELECT COUNT(*) FROM attendance_raw_logs arl WHERE COALESCE(arl.attendance_device_id, arl.device_id) = ad.id) AS raw_log_count,
       (SELECT COUNT(*) FROM attendance_unmatched_logs aul WHERE aul.attendance_device_id = ad.id AND aul.status = 'OPEN') AS open_unmatched_count
     FROM attendance_devices ad
     WHERE ad.status != 'ARCHIVED'
     ORDER BY ad.name`
  ).all();
  return ok(c, { diagnostics: rows.results });
});

attendanceDeviceSyncRoutes.get("/vendor-integrations", requireAnyPermission(["attendance.vendor_integrations.view", "attendance.vendor_integrations.manage", "attendance.devices.manage"]), async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM attendance_vendor_integrations ORDER BY vendor, name").all();
  return ok(c, { integrations: rows.results });
});

attendanceDeviceSyncRoutes.get("/vendor-integrations/:integrationId", requireAnyPermission(["attendance.vendor_integrations.view", "attendance.vendor_integrations.manage", "attendance.devices.manage"]), async (c) => {
  const integration = await c.env.DB.prepare("SELECT * FROM attendance_vendor_integrations WHERE id = ?").bind(routeParam(c, "integrationId")).first();
  if (!integration) return fail(c, 404, "NOT_FOUND", "Vendor integration was not found.");
  return ok(c, { integration });
});

attendanceDeviceSyncRoutes.post("/vendor-integrations", requireAnyPermission(["attendance.vendor_integrations.manage", "attendance.devices.manage"]), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const name = readString(body.name);
  const vendor = readString(body.vendor || "ZKTECO").toUpperCase();
  const type = readString(body.integration_type || "API_PLACEHOLDER").toUpperCase();
  if (!name) return fail(c, 400, "VALIDATION_ERROR", "Integration name is required.");
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO attendance_vendor_integrations (id, vendor, integration_type, name, status, config_json, created_by_user_id, updated_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, vendor, type, name, readString(body.status || "INACTIVE").toUpperCase(), body.config_json ? JSON.stringify(body.config_json) : null, c.get("currentUser").id, c.get("currentUser").id).run();
  return ok(c, { integration: await c.env.DB.prepare("SELECT * FROM attendance_vendor_integrations WHERE id = ?").bind(id).first() }, 201);
});

attendanceDeviceSyncRoutes.patch("/vendor-integrations/:integrationId", requireAnyPermission(["attendance.vendor_integrations.manage", "attendance.devices.manage"]), async (c) => {
  const id = routeParam(c, "integrationId");
  const body = await readJsonBody(c.req.raw);
  const old = await c.env.DB.prepare("SELECT * FROM attendance_vendor_integrations WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!old) return fail(c, 404, "NOT_FOUND", "Vendor integration was not found.");
  await c.env.DB.prepare("UPDATE attendance_vendor_integrations SET name = ?, status = ?, config_json = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?").bind(readString(body.name ?? old.name), readString(body.status ?? old.status).toUpperCase(), body.config_json ? JSON.stringify(body.config_json) : old.config_json ?? null, c.get("currentUser").id, new Date().toISOString(), id).run();
  return ok(c, { integration: await c.env.DB.prepare("SELECT * FROM attendance_vendor_integrations WHERE id = ?").bind(id).first() });
});

attendanceDeviceSyncRoutes.post("/vendor-integrations/:integrationId/test-placeholder", requireAnyPermission(["attendance.vendor_integrations.manage", "attendance.devices.technical"]), async (c) => {
  await c.env.DB.prepare("UPDATE attendance_vendor_integrations SET last_test_at = ?, last_test_status = 'PLACEHOLDER', last_test_message = ? WHERE id = ?").bind(new Date().toISOString(), "Vendor API sync is reserved for a future phase.", routeParam(c, "integrationId")).run();
  return ok(c, { status: "PLACEHOLDER", message: "Vendor API sync is reserved for a future phase." });
});

attendanceDeviceSyncRoutes.post("/zkteco/local-bridge/logs", async (c) => {
  const payload = await readJsonBody(c.req.raw);
  const device = await authenticateZktecoBridgeRequest(c, payload, "LOCAL_BRIDGE");
  if (!device) return fail(c, 401, "BRIDGE_AUTH_FAILED", "Bridge request was not accepted.");
  const logs = await validateZktecoBridgePayload(payload);
  const result = await ingestZktecoBridgeLogs(c, device, logs);
  await recordAudit(c.env.DB, { actorUserId: null, action: "attendance.zkteco_bridge.ingested", module: "attendance", entityType: "attendance_import_batch", entityId: result.batch_id, newValue: result, ipAddress: getClientIp(c.req.raw), userAgent: c.req.header("User-Agent") ?? null });
  return ok(c, result, 202);
});

attendanceDeviceSyncRoutes.post("/zkteco/push-adms", async (c) => {
  const payload = await readJsonBody(c.req.raw);
  const device = await validateZktecoPushAdmsDevice(c, payload);
  if (!device) return fail(c, 401, "ADMS_DEVICE_NOT_ACCEPTED", "ADMS push request was not accepted.");
  const result = await ingestZktecoPushAdmsPayload(c, device, payload);
  await recordAudit(c.env.DB, { actorUserId: null, action: "attendance.zkteco_adms.ingested", module: "attendance", entityType: "attendance_import_batch", entityId: result.batch_id, newValue: result, ipAddress: getClientIp(c.req.raw), userAgent: c.req.header("User-Agent") ?? null });
  return ok(c, result, 202);
});

employeeAttendanceDeviceSyncRoutes.get("/:employeeId/biometric-mappings", requireAnyPermission(["attendance.biometric_mappings.view", "employees.attendance.view", "attendance.view"]), async (c) => {
  const employeeId = routeParam(c, "employeeId");
  if (!(await ensureCanAccessEmployee(c, employeeId, "view"))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const rows = await c.env.DB.prepare("SELECT ebm.*, ad.name AS device_name, ad.device_code FROM employee_biometric_mappings ebm LEFT JOIN attendance_devices ad ON ad.id = ebm.attendance_device_id WHERE ebm.employee_id = ? AND ebm.status != 'ARCHIVED' ORDER BY ebm.is_primary DESC, ebm.created_at DESC").bind(employeeId).all();
  return ok(c, { mappings: rows.results });
});

employeeAttendanceDeviceSyncRoutes.post("/:employeeId/biometric-mappings", requireAnyPermission(["attendance.biometric_mappings.manage"]), async (c) => {
  const employeeId = routeParam(c, "employeeId");
  const prepared = await upsertBiometricMapping(c, employeeId);
  if ("status" in prepared) return prepared;
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO employee_biometric_mappings
      (id, employee_id, attendance_device_id, biometric_user_id, biometric_user_name, external_employee_code, mapping_source, status, is_primary, notes, created_by_user_id, updated_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, employeeId, prepared.input.attendance_device_id, prepared.input.biometric_user_id, prepared.input.biometric_user_name, prepared.input.external_employee_code, prepared.input.mapping_source, prepared.input.status, prepared.input.is_primary ? 1 : 0, prepared.input.notes, c.get("currentUser").id, c.get("currentUser").id).run();
  await auditAttendanceDevice(c, { action: "attendance.biometric_mapping.created", entityType: "employee_biometric_mapping", entityId: id, newValue: prepared.input });
  return ok(c, { mapping: await c.env.DB.prepare("SELECT * FROM employee_biometric_mappings WHERE id = ?").bind(id).first() }, 201);
});

employeeAttendanceDeviceSyncRoutes.get("/:employeeId/attendance/device-summary", requireAnyPermission(["employees.attendance.view", "attendance.view", "attendance.biometric_mappings.view"]), async (c) => {
  const employeeId = routeParam(c, "employeeId");
  if (!(await ensureCanAccessEmployee(c, employeeId, "view"))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const [mappings, counts, logs, unmatched] = await Promise.all([
    c.env.DB.prepare("SELECT ebm.*, ad.name AS device_name, ad.device_code FROM employee_biometric_mappings ebm LEFT JOIN attendance_devices ad ON ad.id = ebm.attendance_device_id WHERE ebm.employee_id = ? AND ebm.status != 'ARCHIVED' ORDER BY ebm.is_primary DESC").bind(employeeId).all(),
    c.env.DB.prepare("SELECT process_status, COUNT(*) AS count FROM attendance_raw_logs WHERE employee_id = ? GROUP BY process_status").bind(employeeId).all(),
    c.env.DB.prepare("SELECT arl.*, ad.name AS device_name FROM attendance_raw_logs arl LEFT JOIN attendance_devices ad ON ad.id = COALESCE(arl.attendance_device_id, arl.device_id) WHERE arl.employee_id = ? ORDER BY arl.punch_time DESC LIMIT 20").bind(employeeId).all(),
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM attendance_unmatched_logs WHERE resolved_employee_id = ? OR external_employee_code = (SELECT employee_no FROM employees WHERE id = ?)").bind(employeeId, employeeId).first<{ count: number }>()
  ]);
  return ok(c, { mappings: mappings.results, raw_log_status_counts: counts.results, recent_raw_logs: logs.results, unmatched_related_count: unmatched?.count ?? 0 });
});

selfServiceAttendanceDeviceSyncRoutes.get("/attendance/summary", async (c) => {
  const user = c.get("currentUser") as AuthUser;
  if (!user.employee_id) return fail(c, 403, "EMPLOYEE_LINK_REQUIRED", "Your account is not linked to an employee profile.");
  const [mappings, logs, corrections] = await Promise.all([
    c.env.DB.prepare("SELECT ebm.biometric_user_id, ebm.status, ad.name AS device_name FROM employee_biometric_mappings ebm LEFT JOIN attendance_devices ad ON ad.id = ebm.attendance_device_id WHERE ebm.employee_id = ? AND ebm.status = 'ACTIVE'").bind(user.employee_id).all(),
    c.env.DB.prepare("SELECT punch_time, punch_type, process_status, source FROM attendance_raw_logs WHERE employee_id = ? ORDER BY punch_time DESC LIMIT 20").bind(user.employee_id).all(),
    c.env.DB.prepare("SELECT attendance_date, status, reason, created_at FROM attendance_correction_requests WHERE employee_id = ? ORDER BY created_at DESC LIMIT 20").bind(user.employee_id).all()
  ]);
  return ok(c, { biometric_mappings: mappings.results, recent_raw_logs: logs.results, correction_requests: corrections.results });
});
