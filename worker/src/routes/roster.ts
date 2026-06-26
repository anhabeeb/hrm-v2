import { Hono } from "hono";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { buildEmployeeScopeWhereClause, canAccessEmployee } from "../auth/access-scopes";
import { recordAudit } from "../db/audit";
import { hasValidationErrors, validateAttendanceRosterRules, validateOrganizationCascade } from "../lib/moduleValidation";
import { requireAuth } from "../middleware/auth";
import { publishAccessEvent } from "../realtime/publisher";
import type { AppBindings } from "../types";
import { fail, getClientIp, ok } from "../utils/http";
import { readJsonBody, readString } from "../utils/validation";

type BindValue = string | number | null;
type AssignmentStatus =
  | "SCHEDULED" | "OFF" | "LEAVE" | "ABSENT_PLACEHOLDER" | "UNASSIGNED"
  | "DRAFT" | "PUBLISHED" | "CHANGED_AFTER_PUBLISH" | "CANCELLED" | "DAY_OFF"
  | "SICK_LEAVE" | "LONG_LEAVE" | "PUBLIC_HOLIDAY" | "CONFLICT";

const ASSIGNMENT_STATUSES = new Set([
  "SCHEDULED", "OFF", "LEAVE", "ABSENT_PLACEHOLDER", "UNASSIGNED",
  "DRAFT", "PUBLISHED", "CHANGED_AFTER_PUBLISH", "CANCELLED", "DAY_OFF",
  "SICK_LEAVE", "LONG_LEAVE", "PUBLIC_HOLIDAY", "CONFLICT"
]);
const SETTINGS_READ_PERMISSIONS = ["roster.settings.view", "roster.settings.update", "roster.settings.manage", "roster.view"];
const SETTINGS_WRITE_PERMISSIONS = ["roster.settings.update", "roster.settings.manage"];
const TEMPLATE_READ_PERMISSIONS = ["roster.shift_templates.view", "roster.shift_templates.manage", "roster.settings.manage", "roster.view"];
const TEMPLATE_CREATE_PERMISSIONS = ["roster.shift_templates.create", "roster.shift_templates.manage", "roster.settings.manage"];
const TEMPLATE_UPDATE_PERMISSIONS = ["roster.shift_templates.update", "roster.shift_templates.manage", "roster.settings.manage"];
const TEMPLATE_ARCHIVE_PERMISSIONS = ["roster.shift_templates.archive", "roster.shift_templates.manage", "roster.settings.manage"];
const TEMPLATE_RESTORE_PERMISSIONS = ["roster.shift_templates.restore", "roster.shift_templates.manage", "roster.settings.manage"];
const PERIOD_READ_PERMISSIONS = ["roster.periods.view", "roster.periods.manage", "roster.view"];
const PERIOD_WRITE_PERMISSIONS = ["roster.periods.update", "roster.periods.manage", "roster.manage"];
const PERIOD_CREATE_PERMISSIONS = ["roster.periods.create", "roster.periods.manage", "roster.manage"];
const PERIOD_PUBLISH_PERMISSIONS = ["roster.periods.publish", "roster.publish", "roster.periods.manage"];
const PERIOD_UNPUBLISH_PERMISSIONS = ["roster.periods.unpublish", "roster.periods.manage", "roster.manage"];
const PERIOD_LOCK_PERMISSIONS = ["roster.periods.lock", "roster.periods.manage"];
const PERIOD_UNLOCK_PERMISSIONS = ["roster.periods.unlock", "roster.periods.manage"];
const PERIOD_ARCHIVE_PERMISSIONS = ["roster.periods.archive", "roster.periods.manage", "roster.manage"];
const ASSIGNMENT_READ_PERMISSIONS = ["roster.assignments.view", "roster.assignments.manage", "roster.view"];
const ASSIGNMENT_WRITE_PERMISSIONS = ["roster.assignments.update", "roster.assignments.create", "roster.assignments.manage", "roster.manage"];
const ASSIGNMENT_CREATE_PERMISSIONS = ["roster.assignments.create", "roster.assignments.manage", "roster.manage"];
const ASSIGNMENT_CANCEL_PERMISSIONS = ["roster.assignments.cancel", "roster.assignments.manage", "roster.manage"];
const ASSIGNMENT_BULK_PERMISSIONS = ["roster.assignments.bulk_update", "roster.assignments.manage", "roster.manage"];
const ASSIGNMENT_COPY_PERMISSIONS = ["roster.assignments.copy_week", "roster.assignments.bulk_update", "roster.assignments.manage", "roster.manage"];
const SOURCES = new Set(["MANUAL", "COPIED", "LEAVE_SYNC", "SYSTEM"]);
const WEEK_DAYS = new Set(["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"]);

export const rosterRoutes = new Hono<AppBindings>();
export const employeeRosterRoutes = new Hono<AppBindings>();

rosterRoutes.use("*", requireAuth);
employeeRosterRoutes.use("*", requireAuth);
rosterRoutes.use("*", requireRosterModuleEnabled);
employeeRosterRoutes.use("*", requireRosterModuleEnabled);

function routeParam(c: Context<AppBindings>, name: string) {
  return c.req.param(name) ?? "";
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

function num(value: unknown, fallback: number | null = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bindValue(value: unknown): BindValue {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  return String(value);
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

function addDays(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function daysOfWeek(weekStart: string) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    return { date, label: new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short" }) };
  });
}

function minutesOfDay(time: string | null) {
  if (!time) return null;
  const match = /^(\d{2}):(\d{2})/.exec(time);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function scheduledMinutes(start: string | null, end: string | null, breakMinutes: number | null, overnight: boolean) {
  const startMinutes = minutesOfDay(start);
  const endMinutes = minutesOfDay(end);
  if (startMinutes === null || endMinutes === null) return null;
  let diff = endMinutes - startMinutes;
  if (diff < 0 && overnight) diff += 24 * 60;
  if (diff < 0) return null;
  return Math.max(0, diff - Number(breakMinutes ?? 0));
}

function calculateShiftExpectedMinutes(start: string | null, end: string | null, breakMinutes: number | null, overnight: boolean) {
  return scheduledMinutes(start, end, breakMinutes, overnight);
}

function weekEnd(weekStart: string) {
  return addDays(weekStart, 6);
}

function inWeek(date: string, weekStart: string) {
  return date >= weekStart && date <= weekEnd(weekStart);
}

async function auditRoster(c: Context<AppBindings>, input: { action: string; entityType: string; entityId?: string | null; oldValue?: unknown; newValue?: unknown; reason?: string | null }) {
  await recordAudit(c.env.DB, {
    actorUserId: c.get("currentUser").id,
    action: input.action,
    module: "roster",
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    oldValue: input.oldValue,
    newValue: input.newValue,
    reason: input.reason,
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent") ?? null
  });
}

async function publishRoster(c: Context<AppBindings>, event: Parameters<typeof publishAccessEvent>[1], entityType: "shift_template" | "roster_period" | "roster_assignment" | "weekly_off_rule" | "roster_settings" | "roster_report", entityId: string, action: string) {
  await publishAccessEvent(c.env, event, { actor_user_id: c.get("currentUser").id, entity_type: entityType, entity_id: entityId, action });
  if (event !== "roster.changed") await publishAccessEvent(c.env, "roster.changed", { actor_user_id: c.get("currentUser").id, entity_type: entityType, entity_id: entityId, action });
}

function rosterAssignmentSelect(where: string) {
  return `SELECT ra.*, rp.status AS period_status, rp.week_start_date, rp.week_end_date,
    st.code AS shift_code, st.name AS shift_name, st.start_time AS shift_start_time, st.end_time AS shift_end_time,
    st.color_label AS shift_color_label, st.total_work_minutes,
    (SELECT lt.name FROM leave_request_days lrd INNER JOIN leave_requests lr ON lr.id = lrd.leave_request_id INNER JOIN leave_types lt ON lt.id = lr.leave_type_id WHERE lr.employee_id = ra.employee_id AND lrd.leave_date = ra.roster_date AND lr.status = 'APPROVED' LIMIT 1) AS leave_indicator,
    (SELECT adr.status FROM attendance_daily_records adr WHERE adr.employee_id = ra.employee_id AND adr.attendance_date = ra.roster_date LIMIT 1) AS attendance_indicator
   FROM roster_assignments ra
   INNER JOIN roster_periods rp ON rp.id = ra.roster_period_id
   LEFT JOIN shift_templates st ON st.id = ra.shift_template_id
   ${where}`;
}

async function getWeeklyOffRule(c: Context<AppBindings>, id: string) {
  return c.env.DB.prepare("SELECT wor.*, l.name AS location_name, d.name AS department_name FROM weekly_off_rules wor LEFT JOIN locations l ON l.id = wor.location_id LEFT JOIN departments d ON d.id = wor.department_id WHERE wor.id = ?").bind(id).first<Record<string, unknown>>();
}

function readWeeklyOffRuleInput(body: Record<string, unknown>, existing?: Record<string, unknown>) {
  const day = readString(body.day_of_week ?? existing?.day_of_week).toUpperCase();
  return {
    location_id: optionalString(body.location_id ?? existing?.location_id),
    department_id: optionalString(body.department_id ?? existing?.department_id),
    day_of_week: WEEK_DAYS.has(day) ? day : "",
    is_active: bool(body.is_active, existing ? Boolean(existing.is_active) : true)
  };
}

async function getSettings(c: Context<AppBindings>): Promise<Record<string, unknown>> {
  let settings = await c.env.DB.prepare("SELECT * FROM roster_settings WHERE id = 'roster_settings_default'").first<Record<string, unknown>>();
  if (!settings) {
    await c.env.DB.prepare("INSERT INTO roster_settings (id, default_week_start_day, allow_published_roster_edits, require_reason_for_published_edits, show_leave_on_roster, show_attendance_on_roster, default_shift_template_id) VALUES ('roster_settings_default', 'MONDAY', 1, 1, 1, 1, (SELECT id FROM shift_templates WHERE code = 'GENERAL' LIMIT 1))").run();
    settings = await c.env.DB.prepare("SELECT * FROM roster_settings WHERE id = 'roster_settings_default'").first<Record<string, unknown>>();
  }
  return {
    module_enabled: 1,
    roster_period_mode: "WEEKLY",
    allow_draft_roster_editing: 1,
    require_publish_before_employee_visibility: 1,
    allow_unpublish_before_lock: 1,
    allow_changes_after_publish: settings?.allow_published_roster_edits ?? 1,
    require_reason_for_changes_after_publish: settings?.require_reason_for_published_edits ?? 1,
    allow_roster_lock: 1,
    lock_roster_after_attendance_payroll_placeholder: 0,
    allow_shift_overlap_warnings: 1,
    block_overlapping_shifts_by_default: 1,
    allow_cross_worksite_assignment_with_permission: 1,
    roster_aware_attendance_enabled: 1,
    roster_aware_leave_counting_enabled: 1,
    default_off_day_handling_mode: "EXPLICIT_ONLY",
    public_holiday_work_assignment_mode: "ALLOW_EXPLICIT_SHIFT",
    employee_self_service_roster_visibility_enabled: 1,
    manager_team_roster_visibility_enabled: 1,
    copy_previous_week_enabled: 1,
    bulk_assignment_enabled: 1,
    default_break_minutes: 60,
    default_expected_work_minutes: 480,
    ...settings
  };
}

async function getRosterSettings(c: Context<AppBindings>): Promise<Record<string, unknown>> {
  return getSettings(c);
}

async function requireRosterModuleEnabled(c: Context<AppBindings>, next: () => Promise<void>) {
  if (c.req.path.endsWith("/settings") || c.req.path.includes("/settings/")) {
    await next();
    return;
  }
  const settings = await getRosterSettings(c);
  if (!bool(settings.module_enabled, true)) return fail(c, 503, "ROSTER_MODULE_DISABLED", "Roster module is disabled.");
  await next();
}

async function tableColumns(c: Context<AppBindings>, table: string) {
  const rows = (await c.env.DB.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>()).results;
  return new Set(rows.map((row) => row.name));
}

async function getPeriod(c: Context<AppBindings>, id: string) {
  return c.env.DB.prepare("SELECT rp.*, l.name AS location_name, d.name AS department_name FROM roster_periods rp LEFT JOIN locations l ON l.id = rp.location_id LEFT JOIN departments d ON d.id = rp.department_id WHERE rp.id = ?").bind(id).first<Record<string, unknown>>();
}

async function findPeriod(c: Context<AppBindings>, weekStart: string, locationId: string | null, departmentId: string | null) {
  return c.env.DB
    .prepare("SELECT * FROM roster_periods WHERE week_start_date = ? AND COALESCE(location_id, '') = COALESCE(?, '') AND COALESCE(department_id, '') = COALESCE(?, '') AND status != 'ARCHIVED'")
    .bind(weekStart, locationId, departmentId)
    .first<Record<string, unknown>>();
}

async function ensurePeriod(c: Context<AppBindings>, weekStart: string, locationId: string | null, departmentId: string | null) {
  const existing = await findPeriod(c, weekStart, locationId, departmentId);
  if (existing) return existing;
  const id = crypto.randomUUID();
  await c.env.DB
    .prepare("INSERT INTO roster_periods (id, location_id, department_id, week_start_date, week_end_date, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, locationId, departmentId, weekStart, weekEnd(weekStart), c.get("currentUser").id)
    .run();
  const period = (await getPeriod(c, id))!;
  await auditRoster(c, { action: "roster.period.created", entityType: "roster_period", entityId: id, newValue: period });
  await publishRoster(c, "roster.period.created", "roster_period", id, "created");
  return period;
}

async function canEditPeriod(c: Context<AppBindings>, period: Record<string, unknown>, reason: string | null) {
  if (period.status === "LOCKED" && !hasAny(c, ["roster.assignments.override_lock", "roster.periods.unlock", "roster.periods.manage"])) return "This roster is locked.";
  if (period.status !== "PUBLISHED" && period.status !== "LOCKED") return null;
  if (!hasAny(c, ["roster.assignments.edit_after_publish", "roster.publish", "roster.periods.manage", "roster.assignments.manage"])) return "Published rosters require edit-after-publish permission to edit.";
  const settings = await getRosterSettings(c);
  if (!bool(settings.allow_changes_after_publish ?? settings.allow_published_roster_edits, true)) return "Published roster edits are disabled in roster settings.";
  if (bool(settings.require_reason_for_changes_after_publish ?? settings.require_reason_for_published_edits, true) && !reason) return "Published roster edits require a reason.";
  return null;
}

async function canEditRosterPeriod(c: Context<AppBindings>, period: Record<string, unknown>, reason: string | null) {
  return canEditPeriod(c, period, reason);
}

function readShiftTemplateInput(body: Record<string, unknown>, existing?: Record<string, unknown>) {
  const start = readString(body.start_time ?? existing?.start_time);
  const end = readString(body.end_time ?? existing?.end_time);
  const breakMinutes = num(body.break_minutes, existing?.break_minutes == null ? 0 : Number(existing.break_minutes)) ?? 0;
  const overnight = bool(body.is_overnight, existing ? Boolean(existing.is_overnight) : (end < start && Boolean(start && end)));
  return {
    code: readString(body.code ?? existing?.code).toUpperCase(),
    name: readString(body.name ?? existing?.name),
    description: optionalString(body.description ?? existing?.description),
    start_time: start,
    end_time: end,
    break_minutes: breakMinutes,
    total_work_minutes: num(body.total_work_minutes, calculateShiftExpectedMinutes(start, end, breakMinutes, overnight)),
    color_label: optionalString(body.color_label ?? existing?.color_label),
    is_overnight: overnight,
    is_active: bool(body.is_active, existing ? Boolean(existing.is_active) : true),
    sort_order: num(body.sort_order, existing?.sort_order == null ? 100 : Number(existing.sort_order)) ?? 100
  };
}

async function getAssignment(c: Context<AppBindings>, id: string) {
  return c.env.DB
    .prepare(
      `SELECT ra.*, st.code AS shift_code, st.name AS shift_name, st.start_time AS shift_start_time, st.end_time AS shift_end_time,
       st.color_label AS shift_color_label, e.employee_no, e.full_name AS employee_name
       FROM roster_assignments ra
       INNER JOIN employees e ON e.id = ra.employee_id
       LEFT JOIN shift_templates st ON st.id = ra.shift_template_id
       WHERE ra.id = ?`
    )
    .bind(id)
    .first<Record<string, unknown>>();
}

async function approvedLeave(c: Context<AppBindings>, employeeId: string, date: string) {
  return c.env.DB
    .prepare(
      `SELECT lr.id AS leave_request_id, lt.name AS leave_type_name, lt.code AS leave_type_code
       FROM leave_request_days lrd
       INNER JOIN leave_requests lr ON lr.id = lrd.leave_request_id
       INNER JOIN leave_types lt ON lt.id = lr.leave_type_id
       WHERE lr.employee_id = ? AND lrd.leave_date = ? AND lr.status = 'APPROVED'
       LIMIT 1`
    )
    .bind(employeeId, date)
    .first<Record<string, unknown>>();
}

function normalizeAssignmentStatus(status: string) {
  return status;
}

function isShiftLikeStatus(status: string) {
  return ["SCHEDULED", "DRAFT", "PUBLISHED", "CHANGED_AFTER_PUBLISH", "CONFLICT"].includes(status);
}

function assignmentTypeFor(input: { status: string; shift_template_id: string | null; custom_start_time: string | null; custom_end_time: string | null }) {
  if (["DAY_OFF", "OFF"].includes(input.status)) return "DAY_OFF";
  if (["LEAVE", "SICK_LEAVE", "LONG_LEAVE"].includes(input.status)) return "LEAVE_PLACEHOLDER";
  if (input.status === "PUBLIC_HOLIDAY") return "PUBLIC_HOLIDAY_WORK";
  if (!input.shift_template_id && input.custom_start_time && input.custom_end_time) return "CUSTOM_SHIFT";
  return "SHIFT";
}

async function canAssignEmployeeToRoster(c: Context<AppBindings>, employeeId: string, action: "view" | "manage" = "manage") {
  return canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "roster", action);
}

async function detectRosterConflicts(c: Context<AppBindings>, input: { employee_id: string; roster_date: string; shift_template_id: string | null; custom_start_time: string | null; custom_end_time: string | null; status: string }, existingId?: string | null) {
  const warnings: string[] = [];
  const blockers: string[] = [];
  const existing = await c.env.DB
    .prepare("SELECT id, status FROM roster_assignments WHERE employee_id = ? AND roster_date = ? AND id != COALESCE(?, '') AND status IN ('SCHEDULED', 'DRAFT', 'PUBLISHED', 'CHANGED_AFTER_PUBLISH', 'PUBLIC_HOLIDAY', 'CONFLICT') LIMIT 1")
    .bind(input.employee_id, input.roster_date, existingId ?? "")
    .first<Record<string, unknown>>();
  if (existing && (isShiftLikeStatus(input.status) || input.status === "PUBLIC_HOLIDAY")) {
    blockers.push("This employee already has an assignment on this roster date.");
  }
  const leave = await approvedLeave(c, input.employee_id, input.roster_date);
  if (leave && (isShiftLikeStatus(input.status) || input.status === "PUBLIC_HOLIDAY")) warnings.push(`Approved leave exists: ${leave.leave_type_name}`);
  return { warnings, blockers, leave };
}

async function validateRosterAssignment(c: Context<AppBindings>, body: Record<string, unknown>, period: Record<string, unknown>, existing?: Record<string, unknown>, sourceOverride?: string) {
  return readAssignmentInput(c, body, period, existing, sourceOverride);
}

async function readAssignmentInput(c: Context<AppBindings>, body: Record<string, unknown>, period: Record<string, unknown>, existing?: Record<string, unknown>, sourceOverride?: string) {
  const status = normalizeAssignmentStatus(readString(body.status ?? existing?.status ?? "UNASSIGNED").toUpperCase());
  const source = readString(sourceOverride ?? body.source ?? existing?.source ?? "MANUAL").toUpperCase();
  const input = {
    employee_id: readString(body.employee_id ?? existing?.employee_id),
    roster_date: readString(body.roster_date ?? existing?.roster_date),
    shift_template_id: optionalString(body.shift_template_id ?? existing?.shift_template_id),
    custom_start_time: optionalString(body.custom_start_time ?? existing?.custom_start_time),
    custom_end_time: optionalString(body.custom_end_time ?? existing?.custom_end_time),
    break_minutes: num(body.custom_break_minutes ?? body.break_minutes, existing?.custom_break_minutes == null && existing?.break_minutes == null ? null : Number(existing.custom_break_minutes ?? existing.break_minutes)),
    location_id: optionalString(body.location_id ?? existing?.location_id),
    department_id: optionalString(body.department_id ?? existing?.department_id),
    status: (ASSIGNMENT_STATUSES.has(status) ? status : "UNASSIGNED") as AssignmentStatus,
    notes: optionalString(body.notes ?? existing?.notes),
    source: SOURCES.has(source) ? source : "MANUAL",
    reason: optionalString(body.reason)
  };
  if (!input.employee_id || !isDate(input.roster_date)) return { input, error: "Employee and valid roster date are required." };
  if (!inWeek(input.roster_date, String(period.week_start_date))) return { input, error: "Roster date must be inside the selected roster week." };
  const employee = await c.env.DB.prepare("SELECT e.*, s.include_in_roster FROM employees e INNER JOIN employee_statuses s ON s.id = e.status_id WHERE e.id = ? AND e.archived_at IS NULL").bind(input.employee_id).first<Record<string, unknown>>();
  if (!employee) return { input, error: "Employee was not found or is archived." };
  if (!(await canAssignEmployeeToRoster(c, input.employee_id, "manage"))) return { input, error: "You do not have roster access to this employee." };
  if (!bool(employee.roster_eligible, true) || !bool(employee.include_in_roster, true)) return { input, error: "Employee is not roster eligible." };
  const targetLocationId = input.location_id ?? optionalString(period.location_id) ?? optionalString(employee.primary_location_id);
  const targetDepartmentId = input.department_id ?? optionalString(period.department_id) ?? optionalString(employee.primary_department_id);
  const cascadeIssues = await validateOrganizationCascade(c.env.DB, {
    employee_id: input.employee_id,
    department_id: targetDepartmentId,
    location_id: targetLocationId,
    position_id: optionalString(employee.primary_position_id),
    job_level_id: optionalString(employee.job_level_id)
  });
  const rosterIssues = validateAttendanceRosterRules({ date: input.roster_date, locked: String(period.status) === "LOCKED", startTime: input.custom_start_time, endTime: input.custom_end_time });
  const issues = [...cascadeIssues, ...rosterIssues];
  if (hasValidationErrors(issues)) return { input, error: issues[0].message, errorCode: issues[0].code, validationIssues: issues };
  if (targetLocationId && employee.primary_location_id && targetLocationId !== employee.primary_location_id && !hasAny(c, ["roster.assignments.cross_worksite", "roster.assignments.manage", "roster.manage"])) {
    return { input, error: "You do not have permission to assign employees across worksites.", errorCode: "CROSS_WORKSITE_PERMISSION_REQUIRED" };
  }
  if (isShiftLikeStatus(input.status) && !input.shift_template_id && (!input.custom_start_time || !input.custom_end_time)) return { input, error: "Scheduled assignments require a shift template or custom start/end times." };
  if (input.shift_template_id && (!existing || input.shift_template_id !== existing.shift_template_id)) {
    const template = await c.env.DB.prepare("SELECT * FROM shift_templates WHERE id = ?").bind(input.shift_template_id).first<Record<string, unknown>>();
    if (!template) return { input, error: "Shift template was not found." };
    if (!bool(template.is_active, true)) return { input, error: "Inactive shift templates cannot be newly assigned." };
  }
  if (input.custom_start_time && input.custom_end_time && input.custom_end_time < input.custom_start_time) return { input, error: "Custom end time cannot be before custom start time for non-overnight custom shifts." };
  const conflict = await detectRosterConflicts(c, input, existing?.id ? String(existing.id) : null);
  if (conflict.blockers.length) return { input, error: conflict.blockers[0] };
  const leave = conflict.leave ?? await approvedLeave(c, input.employee_id, input.roster_date);
  if (leave && input.status === "UNASSIGNED") input.status = "LEAVE";
  return { input, employee, leave, warnings: conflict.warnings };
}

async function saveAssignment(c: Context<AppBindings>, period: Record<string, unknown>, body: Record<string, unknown>, sourceOverride?: string) {
  const existing = await c.env.DB.prepare("SELECT * FROM roster_assignments WHERE employee_id = ? AND roster_date = ?").bind(readString(body.employee_id), readString(body.roster_date)).first<Record<string, unknown>>();
  const { input, employee, error, errorCode, leave, warnings } = await validateRosterAssignment(c, body, period, existing ?? undefined, sourceOverride);
  if (error) return { error, errorCode };
  const id = existing?.id ? String(existing.id) : crypto.randomUUID();
  const now = new Date().toISOString();
  const columns = await tableColumns(c, "roster_assignments");
  const template = input.shift_template_id ? await c.env.DB.prepare("SELECT * FROM shift_templates WHERE id = ?").bind(input.shift_template_id).first<Record<string, unknown>>() : null;
  const settings = await getRosterSettings(c);
  const breakMinutes = input.break_minutes ?? Number(template?.break_minutes ?? settings.default_break_minutes ?? 0);
  const expectedWorkMinutes = Number(template?.expected_work_minutes ?? template?.total_work_minutes ?? calculateShiftExpectedMinutes(input.custom_start_time, input.custom_end_time, breakMinutes, Boolean(template?.is_overnight)) ?? settings.default_expected_work_minutes ?? 0);
  const targetLocationId = input.location_id ?? optionalString(period.location_id) ?? optionalString(employee?.primary_location_id);
  const targetDepartmentId = input.department_id ?? optionalString(period.department_id) ?? optionalString(employee?.primary_department_id);
  const editingPublished = period.status === "PUBLISHED" || period.status === "LOCKED";
  const changedAfterPublish = editingPublished;
  const statusToSave = changedAfterPublish && isShiftLikeStatus(input.status) ? "CHANGED_AFTER_PUBLISH" : input.status;
  const assignmentType = assignmentTypeFor({ ...input, status: statusToSave });
  const metadata = { source: input.source, cross_worksite: targetLocationId && employee?.primary_location_id ? targetLocationId !== employee.primary_location_id : false };
  const values: Record<string, unknown> = {
    id,
    roster_period_id: period.id,
    employee_id: input.employee_id,
    roster_date: input.roster_date,
    assignment_date: input.roster_date,
    shift_template_id: input.shift_template_id,
    custom_start_time: input.custom_start_time,
    custom_end_time: input.custom_end_time,
    custom_break_minutes: breakMinutes,
    break_minutes: breakMinutes,
    expected_work_minutes: expectedWorkMinutes,
    location_id: targetLocationId,
    department_id: targetDepartmentId,
    status: statusToSave,
    assignment_type: assignmentType,
    notes: input.notes,
    conflict_status: warnings?.length ? "WARNING" : null,
    conflict_reason: warnings?.join("; ") ?? null,
    changed_after_publish: changedAfterPublish ? 1 : 0,
    change_reason: changedAfterPublish ? input.reason : null,
    source: input.source,
    updated_by_user_id: c.get("currentUser").id,
    updated_at: now,
    metadata_json: JSON.stringify(metadata)
  };
  if (existing) {
    const entries = Object.entries(values).filter(([key]) => key !== "id" && key !== "employee_id" && columns.has(key));
    await c.env.DB.prepare(`UPDATE roster_assignments SET ${entries.map(([key]) => `${key} = ?`).join(", ")} WHERE id = ?`).bind(...entries.map(([, value]) => bindValue(value)), id).run();
  } else {
    values.created_by_user_id = c.get("currentUser").id;
    values.created_at = now;
    const entries = Object.entries(values).filter(([key]) => columns.has(key));
    await c.env.DB.prepare(`INSERT INTO roster_assignments (${entries.map(([key]) => key).join(", ")}) VALUES (${entries.map(() => "?").join(", ")})`).bind(...entries.map(([, value]) => bindValue(value))).run();
  }
  await c.env.DB.prepare("INSERT INTO roster_assignment_history (id, roster_assignment_id, employee_id, roster_date, old_value_json, new_value_json, change_reason, changed_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), id, input.employee_id, input.roster_date, existing ? JSON.stringify(existing) : null, JSON.stringify(input), input.reason, c.get("currentUser").id).run();
  const saved = await getAssignment(c, id);
  await auditRoster(c, { action: existing ? "roster.assignment.updated" : "roster.assignment.created", entityType: "roster_assignment", entityId: id, oldValue: existing, newValue: saved, reason: input.reason });
  await publishRoster(c, existing ? "roster.assignment.updated" : "roster.assignment.created", "roster_assignment", id, existing ? "updated" : "created");
  await publishAccessEvent(c.env, "employee.roster.changed", { actor_user_id: c.get("currentUser").id, entity_type: "roster_assignment", entity_id: id, action: "changed" });
  return { assignment: saved, warning: leave && isShiftLikeStatus(input.status) ? `Approved leave exists: ${leave.leave_type_name}` : null, warnings: warnings ?? [] };
}

async function getRosterAssignmentForEmployeeDate(c: Context<AppBindings>, employeeId: string, date: string) {
  return c.env.DB
    .prepare(`${rosterAssignmentSelect("WHERE ra.employee_id = ? AND ra.roster_date = ? AND rp.status IN ('PUBLISHED', 'LOCKED')")} ORDER BY ra.updated_at DESC LIMIT 1`)
    .bind(employeeId, date)
    .first<Record<string, unknown>>();
}

async function getRosterScheduleForAttendance(c: Context<AppBindings>, employeeId: string, date: string) {
  const assignment = await getRosterAssignmentForEmployeeDate(c, employeeId, date);
  if (!assignment) return null;
  return {
    assignment_id: assignment.id,
    employee_id: employeeId,
    roster_date: date,
    status: assignment.status,
    scheduled_start_time: assignment.custom_start_time ?? assignment.shift_start_time ?? null,
    scheduled_end_time: assignment.custom_end_time ?? assignment.shift_end_time ?? null,
    expected_work_minutes: assignment.total_work_minutes ?? null,
    is_day_off: assignment.status === "OFF" || assignment.status === "DAY_OFF",
    is_public_holiday_work: assignment.status === "PUBLIC_HOLIDAY"
  };
}

async function isEmployeeScheduledToWork(c: Context<AppBindings>, employeeId: string, date: string) {
  const schedule = await getRosterScheduleForAttendance(c, employeeId, date);
  const nonWorkingStatuses = ["OFF", "DAY_OFF", "LEAVE", "SICK_LEAVE", "LONG_LEAVE", "UNASSIGNED", "CANCELLED", "ABSENT_PLACEHOLDER"];
  return Boolean(schedule && !schedule.is_day_off && !nonWorkingStatuses.includes(String(schedule.status)));
}

async function refreshAttendanceFromRosterChange(c: Context<AppBindings>, assignment: Record<string, unknown>) {
  await publishAccessEvent(c.env, "roster.changed", {
    actor_user_id: c.get("currentUser").id,
    entity_type: "roster_assignment",
    entity_id: String(assignment.id ?? ""),
    action: "attendance_roster_context_changed"
  });
  return { queued: true };
}

async function getRosterWorkRequirementForLeaveDate(c: Context<AppBindings>, employeeId: string, date: string) {
  const assignment = await getRosterAssignmentForEmployeeDate(c, employeeId, date);
  return {
    employee_id: employeeId,
    date,
    has_roster_assignment: Boolean(assignment),
    scheduled_to_work: assignment ? !["OFF", "DAY_OFF", "LEAVE", "SICK_LEAVE", "LONG_LEAVE", "UNASSIGNED", "CANCELLED", "ABSENT_PLACEHOLDER"].includes(String(assignment.status)) : null,
    is_day_off: assignment ? ["OFF", "DAY_OFF"].includes(String(assignment.status)) : null,
    is_public_holiday_work: assignment?.status === "PUBLIC_HOLIDAY",
    conflict_status: assignment?.conflict_status ?? null,
    assignment
  };
}

async function getRosterAssignmentsForLeaveRange(c: Context<AppBindings>, employeeId: string, startDate: string, endDate: string) {
  const rows = await c.env.DB
    .prepare(`${rosterAssignmentSelect("WHERE ra.employee_id = ? AND ra.roster_date BETWEEN ? AND ?")} ORDER BY ra.roster_date`)
    .bind(employeeId, startDate, endDate)
    .all<Record<string, unknown>>();
  return rows.results;
}

async function applyRosterAwareLeaveDayContext(c: Context<AppBindings>, employeeId: string, startDate: string, endDate: string) {
  const assignments = await getRosterAssignmentsForLeaveRange(c, employeeId, startDate, endDate);
  return assignments.map((assignment) => ({
    date: assignment.roster_date,
    scheduled_to_work: !["OFF", "DAY_OFF", "LEAVE", "SICK_LEAVE", "LONG_LEAVE", "UNASSIGNED", "CANCELLED", "ABSENT_PLACEHOLDER"].includes(String(assignment.status)),
    is_day_off: ["OFF", "DAY_OFF"].includes(String(assignment.status)),
    is_public_holiday_work: assignment.status === "PUBLIC_HOLIDAY",
    assignment
  }));
}

async function getEmployeeSelfServiceRoster(c: Context<AppBindings>, employeeId: string, weekStart?: string) {
  const start = weekStart && isDate(weekStart) ? weekStart : new Date().toISOString().slice(0, 10);
  const end = weekEnd(start);
  const rows = await c.env.DB
    .prepare(`${rosterAssignmentSelect("WHERE ra.employee_id = ? AND ra.roster_date BETWEEN ? AND ? AND rp.status IN ('PUBLISHED', 'LOCKED')")} ORDER BY ra.roster_date`)
    .bind(employeeId, start, end)
    .all<Record<string, unknown>>();
  return { week_start_date: start, week_end_date: end, assignments: rows.results };
}

function employeeFilters(c: Context<AppBindings>) {
  const conditions = ["e.archived_at IS NULL", "e.roster_eligible = 1", "s.include_in_roster = 1"];
  const params: BindValue[] = [];
  const search = readString(c.req.query("search"));
  if (search) {
    conditions.push("(e.employee_no LIKE ? OR e.full_name LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }
  for (const [query, column] of [["department_id", "e.primary_department_id"], ["location_id", "e.primary_location_id"]] as const) {
    const value = readString(c.req.query(query));
    if (value) {
      conditions.push(`${column} = ?`);
      params.push(value);
    }
  }
  return { conditions, params };
}

async function getWeeklyData(c: Context<AppBindings>) {
  const weekStart = readString(c.req.query("week_start_date")) || new Date().toISOString().slice(0, 10);
  if (!isDate(weekStart)) return { error: "A valid week_start_date is required." };
  const locationId = optionalString(c.req.query("location_id"));
  const departmentId = optionalString(c.req.query("department_id"));
  const period = await findPeriod(c, weekStart, locationId, departmentId);
  const { conditions, params } = employeeFilters(c);
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "roster", "view", "e");
  conditions.push(scope.sql);
  params.push(...scope.params);
  const employees = (await c.env.DB.prepare(
    `SELECT e.id AS employee_id, e.employee_no, e.full_name, d.name AS department_name, p.title AS position_title,
      l.name AS location_name, jl.name AS job_level_name, e.roster_eligible
     FROM employees e
     INNER JOIN employee_statuses s ON s.id = e.status_id
     LEFT JOIN departments d ON d.id = e.primary_department_id
     LEFT JOIN positions p ON p.id = e.primary_position_id
     LEFT JOIN locations l ON l.id = e.primary_location_id
     LEFT JOIN job_levels jl ON jl.id = e.job_level_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY e.employee_no`
  ).bind(...params).all<Record<string, unknown>>()).results;
  const employeeIds = employees.map((employee) => String(employee.employee_id));
  const assignments = employeeIds.length
    ? (await c.env.DB.prepare(
        `SELECT ra.*, st.code AS shift_code, st.name AS shift_name, st.start_time AS shift_start_time, st.end_time AS shift_end_time,
          st.color_label AS shift_color_label
         FROM roster_assignments ra
         LEFT JOIN shift_templates st ON st.id = ra.shift_template_id
         WHERE ra.roster_date BETWEEN ? AND ? AND ra.employee_id IN (${employeeIds.map(() => "?").join(",")})
         ORDER BY ra.roster_date`
      ).bind(weekStart, weekEnd(weekStart), ...employeeIds).all<Record<string, unknown>>()).results
    : [];
  const leave = employeeIds.length
    ? (await c.env.DB.prepare(
        `SELECT lr.employee_id, lrd.leave_date AS roster_date, lt.name AS leave_type_name, lt.code AS leave_type_code
         FROM leave_request_days lrd
         INNER JOIN leave_requests lr ON lr.id = lrd.leave_request_id
         INNER JOIN leave_types lt ON lt.id = lr.leave_type_id
         WHERE lr.status = 'APPROVED' AND lrd.leave_date BETWEEN ? AND ? AND lr.employee_id IN (${employeeIds.map(() => "?").join(",")})`
      ).bind(weekStart, weekEnd(weekStart), ...employeeIds).all<Record<string, unknown>>()).results
    : [];
  const attendance = employeeIds.length
    ? (await c.env.DB.prepare(
        `SELECT employee_id, attendance_date AS roster_date, status AS attendance_status, first_clock_in, last_clock_out
         FROM attendance_daily_records
         WHERE attendance_date BETWEEN ? AND ? AND employee_id IN (${employeeIds.map(() => "?").join(",")})`
      ).bind(weekStart, weekEnd(weekStart), ...employeeIds).all<Record<string, unknown>>()).results
    : [];
  const byKey: Record<string, Record<string, unknown>> = {};
  for (const assignment of assignments) byKey[`${assignment.employee_id}:${assignment.roster_date}`] = { ...assignment };
  for (const item of leave) {
    const key = `${item.employee_id}:${item.roster_date}`;
    byKey[key] = { employee_id: item.employee_id, roster_date: item.roster_date, status: "LEAVE", source: "LEAVE_SYNC", ...byKey[key], leave_indicator: item.leave_type_name };
  }
  for (const item of attendance) {
    const key = `${item.employee_id}:${item.roster_date}`;
    byKey[key] = { employee_id: item.employee_id, roster_date: item.roster_date, status: byKey[key]?.status ?? "UNASSIGNED", ...byKey[key], attendance_indicator: item.attendance_status };
  }
  const shiftTemplates = (await c.env.DB.prepare("SELECT * FROM shift_templates WHERE is_active = 1 ORDER BY sort_order, name").all()).results;
  return { weekStart, weekEnd: weekEnd(weekStart), locationId, departmentId, period, days: daysOfWeek(weekStart), employees, assignments, assignment_map: byKey, shift_templates: shiftTemplates };
}

rosterRoutes.get("/shift-templates", requireAnyPermission(TEMPLATE_READ_PERMISSIONS), async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM shift_templates ORDER BY is_active DESC, sort_order, name").all();
  return ok(c, { shift_templates: rows.results });
});

rosterRoutes.get("/shift-templates/:id", requireAnyPermission(TEMPLATE_READ_PERMISSIONS), async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM shift_templates WHERE id = ?").bind(routeParam(c, "id")).first();
  if (!row) return fail(c, 404, "NOT_FOUND", "Shift template was not found.");
  return ok(c, { shift_template: row });
});

rosterRoutes.post("/shift-templates", requireAnyPermission(TEMPLATE_CREATE_PERMISSIONS), async (c) => {
  const input = readShiftTemplateInput(await readJsonBody(c.req.raw));
  if (!input.code || !input.name || !input.start_time || !input.end_time) return fail(c, 400, "VALIDATION_ERROR", "Code, name, start time, and end time are required.");
  const id = crypto.randomUUID();
  try {
    await c.env.DB.prepare("INSERT INTO shift_templates (id, code, name, description, start_time, end_time, break_minutes, total_work_minutes, color_label, is_overnight, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, input.code, input.name, input.description, input.start_time, input.end_time, input.break_minutes, input.total_work_minutes, input.color_label, input.is_overnight ? 1 : 0, input.is_active ? 1 : 0, input.sort_order).run();
  } catch {
    return fail(c, 409, "DUPLICATE_SHIFT_TEMPLATE", "Shift template code must be unique.");
  }
  const saved = await c.env.DB.prepare("SELECT * FROM shift_templates WHERE id = ?").bind(id).first();
  await auditRoster(c, { action: "roster.shift_template.created", entityType: "shift_template", entityId: id, newValue: saved });
  return ok(c, { shift_template: saved }, 201);
});

rosterRoutes.patch("/shift-templates/:id", requireAnyPermission(TEMPLATE_UPDATE_PERMISSIONS), async (c) => {
  const id = routeParam(c, "id");
  const old = await c.env.DB.prepare("SELECT * FROM shift_templates WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!old) return fail(c, 404, "NOT_FOUND", "Shift template was not found.");
  const input = readShiftTemplateInput(await readJsonBody(c.req.raw), old);
  await c.env.DB.prepare("UPDATE shift_templates SET code = ?, name = ?, description = ?, start_time = ?, end_time = ?, break_minutes = ?, total_work_minutes = ?, color_label = ?, is_overnight = ?, is_active = ?, sort_order = ?, updated_at = ? WHERE id = ?").bind(input.code, input.name, input.description, input.start_time, input.end_time, input.break_minutes, input.total_work_minutes, input.color_label, input.is_overnight ? 1 : 0, input.is_active ? 1 : 0, input.sort_order, new Date().toISOString(), id).run();
  const saved = await c.env.DB.prepare("SELECT * FROM shift_templates WHERE id = ?").bind(id).first();
  await auditRoster(c, { action: "roster.shift_template.updated", entityType: "shift_template", entityId: id, oldValue: old, newValue: saved });
  return ok(c, { shift_template: saved });
});

async function shiftTemplateAction(c: Context<AppBindings>, active: boolean, mode: "enable" | "disable" | "archive" | "restore" = active ? "enable" : "disable") {
  const id = routeParam(c, "id");
  const old = await c.env.DB.prepare("SELECT * FROM shift_templates WHERE id = ?").bind(id).first();
  if (!old) return fail(c, 404, "NOT_FOUND", "Shift template was not found.");
  const columns = await tableColumns(c, "shift_templates");
  const now = new Date().toISOString();
  const values: Record<string, unknown> = {
    is_active: active ? 1 : 0,
    status: mode === "archive" ? "ARCHIVED" : active ? "ACTIVE" : "INACTIVE",
    archived_by_user_id: mode === "archive" ? c.get("currentUser").id : null,
    archived_at: mode === "archive" ? now : null,
    updated_at: now
  };
  const entries = Object.entries(values).filter(([key]) => columns.has(key));
  await c.env.DB.prepare(`UPDATE shift_templates SET ${entries.map(([key]) => `${key} = ?`).join(", ")} WHERE id = ?`).bind(...entries.map(([, value]) => bindValue(value)), id).run();
  await auditRoster(c, { action: mode === "archive" ? "roster.shift_template.archived" : mode === "restore" ? "roster.shift_template.restored" : active ? "roster.shift_template.enabled" : "roster.shift_template.disabled", entityType: "shift_template", entityId: id, oldValue: old, newValue: values });
  await publishRoster(c, "roster.changed", "shift_template", id, mode);
  return ok(c, { enabled: active, archived: mode === "archive" });
}

rosterRoutes.post("/shift-templates/:id/enable", requireAnyPermission(TEMPLATE_RESTORE_PERMISSIONS), (c) => shiftTemplateAction(c, true));
rosterRoutes.post("/shift-templates/:id/disable", requireAnyPermission(TEMPLATE_ARCHIVE_PERMISSIONS), (c) => shiftTemplateAction(c, false));
rosterRoutes.post("/shift-templates/:id/archive", requireAnyPermission(TEMPLATE_ARCHIVE_PERMISSIONS), (c) => shiftTemplateAction(c, false, "archive"));
rosterRoutes.post("/shift-templates/:id/restore", requireAnyPermission(TEMPLATE_RESTORE_PERMISSIONS), (c) => shiftTemplateAction(c, true, "restore"));

rosterRoutes.get("/settings", requireAnyPermission(SETTINGS_READ_PERMISSIONS), async (c) => ok(c, { settings: await getRosterSettings(c) }));

rosterRoutes.patch("/settings", requireAnyPermission(SETTINGS_WRITE_PERMISSIONS), async (c) => {
  const old = await getRosterSettings(c);
  const body = await readJsonBody(c.req.raw);
  const requested: Record<string, unknown> = {
    module_enabled: bool(body.module_enabled, Boolean(old.module_enabled)),
    default_week_start_day: ["MONDAY", "SUNDAY"].includes(readString(body.default_week_start_day)) ? readString(body.default_week_start_day) : String(old.default_week_start_day),
    roster_period_mode: "WEEKLY",
    allow_draft_roster_editing: bool(body.allow_draft_roster_editing, Boolean(old.allow_draft_roster_editing)),
    require_publish_before_employee_visibility: bool(body.require_publish_before_employee_visibility, Boolean(old.require_publish_before_employee_visibility)),
    allow_unpublish_before_lock: bool(body.allow_unpublish_before_lock, Boolean(old.allow_unpublish_before_lock)),
    allow_changes_after_publish: bool(body.allow_changes_after_publish, Boolean(old.allow_changes_after_publish)),
    require_reason_for_changes_after_publish: bool(body.require_reason_for_changes_after_publish, Boolean(old.require_reason_for_changes_after_publish)),
    allow_roster_lock: bool(body.allow_roster_lock, Boolean(old.allow_roster_lock)),
    lock_roster_after_attendance_payroll_placeholder: bool(body.lock_roster_after_attendance_payroll_placeholder, Boolean(old.lock_roster_after_attendance_payroll_placeholder)),
    allow_shift_overlap_warnings: bool(body.allow_shift_overlap_warnings, Boolean(old.allow_shift_overlap_warnings)),
    block_overlapping_shifts_by_default: bool(body.block_overlapping_shifts_by_default, Boolean(old.block_overlapping_shifts_by_default)),
    allow_cross_worksite_assignment_with_permission: bool(body.allow_cross_worksite_assignment_with_permission, Boolean(old.allow_cross_worksite_assignment_with_permission)),
    roster_aware_attendance_enabled: bool(body.roster_aware_attendance_enabled, Boolean(old.roster_aware_attendance_enabled)),
    roster_aware_leave_counting_enabled: bool(body.roster_aware_leave_counting_enabled, Boolean(old.roster_aware_leave_counting_enabled)),
    default_off_day_handling_mode: readString(body.default_off_day_handling_mode ?? old.default_off_day_handling_mode) || "EXPLICIT_ONLY",
    public_holiday_work_assignment_mode: readString(body.public_holiday_work_assignment_mode ?? old.public_holiday_work_assignment_mode) || "ALLOW_EXPLICIT_SHIFT",
    employee_self_service_roster_visibility_enabled: bool(body.employee_self_service_roster_visibility_enabled, Boolean(old.employee_self_service_roster_visibility_enabled)),
    manager_team_roster_visibility_enabled: bool(body.manager_team_roster_visibility_enabled, Boolean(old.manager_team_roster_visibility_enabled)),
    copy_previous_week_enabled: bool(body.copy_previous_week_enabled, Boolean(old.copy_previous_week_enabled)),
    bulk_assignment_enabled: bool(body.bulk_assignment_enabled, Boolean(old.bulk_assignment_enabled)),
    default_break_minutes: num(body.default_break_minutes, Number(old.default_break_minutes ?? 60)) ?? 60,
    default_expected_work_minutes: num(body.default_expected_work_minutes, Number(old.default_expected_work_minutes ?? 480)) ?? 480,
    allow_published_roster_edits: bool(body.allow_published_roster_edits ?? body.allow_changes_after_publish, Boolean(old.allow_published_roster_edits)),
    require_reason_for_published_edits: bool(body.require_reason_for_published_edits ?? body.require_reason_for_changes_after_publish, Boolean(old.require_reason_for_published_edits)),
    show_leave_on_roster: bool(body.show_leave_on_roster, Boolean(old.show_leave_on_roster)),
    show_attendance_on_roster: bool(body.show_attendance_on_roster, Boolean(old.show_attendance_on_roster)),
    default_shift_template_id: optionalString(body.default_shift_template_id ?? old.default_shift_template_id),
    updated_at: new Date().toISOString()
  };
  const columns = await tableColumns(c, "roster_settings");
  const entries = Object.entries(requested).filter(([key]) => columns.has(key));
  const assignments = entries.map(([key]) => `${key} = ?`).join(", ");
  await c.env.DB.prepare(`UPDATE roster_settings SET ${assignments} WHERE id = 'roster_settings_default'`).bind(...entries.map(([, value]) => bindValue(value))).run();
  const saved = await getRosterSettings(c);
  await auditRoster(c, { action: "roster.settings.updated", entityType: "roster_settings", entityId: "roster_settings_default", oldValue: old, newValue: saved });
  return ok(c, { settings: saved });
});

rosterRoutes.get("/periods", requireAnyPermission(PERIOD_READ_PERMISSIONS), async (c) => {
  const rows = await c.env.DB.prepare("SELECT rp.*, l.name AS location_name, d.name AS department_name FROM roster_periods rp LEFT JOIN locations l ON l.id = rp.location_id LEFT JOIN departments d ON d.id = rp.department_id ORDER BY rp.week_start_date DESC, rp.created_at DESC LIMIT 200").all();
  return ok(c, { periods: rows.results });
});

rosterRoutes.get("/periods/:id", requireAnyPermission(PERIOD_READ_PERMISSIONS), async (c) => {
  const period = await getPeriod(c, routeParam(c, "id"));
  if (!period) return fail(c, 404, "NOT_FOUND", "Roster period was not found.");
  return ok(c, { period });
});

rosterRoutes.post("/periods", requireAnyPermission(PERIOD_CREATE_PERMISSIONS), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const weekStart = readString(body.week_start_date);
  if (!isDate(weekStart)) return fail(c, 400, "VALIDATION_ERROR", "A valid week start date is required.");
  const period = await ensurePeriod(c, weekStart, optionalString(body.location_id), optionalString(body.department_id));
  return ok(c, { period }, 201);
});

rosterRoutes.patch("/periods/:id", requireAnyPermission(PERIOD_WRITE_PERMISSIONS), async (c) => {
  const id = routeParam(c, "id");
  const old = await getPeriod(c, id);
  if (!old) return fail(c, 404, "NOT_FOUND", "Roster period was not found.");
  const body = await readJsonBody(c.req.raw);
  if (Object.prototype.hasOwnProperty.call(body, "status")) return fail(c, 400, "VALIDATION_ERROR", "Roster status changes must use the publish/archive actions.");
  await c.env.DB.prepare("UPDATE roster_periods SET location_id = ?, department_id = ?, updated_at = ? WHERE id = ?").bind(optionalString(body.location_id ?? old.location_id), optionalString(body.department_id ?? old.department_id), new Date().toISOString(), id).run();
  const period = await getPeriod(c, id);
  await auditRoster(c, { action: "roster.period.updated", entityType: "roster_period", entityId: id, oldValue: old, newValue: period, reason: optionalString(body.reason) });
  await publishRoster(c, "roster.period.updated", "roster_period", id, "updated");
  return ok(c, { period });
});

rosterRoutes.post("/periods/:id/publish", requireAnyPermission(PERIOD_PUBLISH_PERMISSIONS), async (c) => {
  const id = routeParam(c, "id");
  const old = await getPeriod(c, id);
  if (!old) return fail(c, 404, "NOT_FOUND", "Roster period was not found.");
  if (old.status === "ARCHIVED") return fail(c, 400, "INVALID_ROSTER_PERIOD", "Archived roster periods cannot be published.");
  const now = new Date().toISOString();
  await c.env.DB.prepare("UPDATE roster_periods SET status = 'PUBLISHED', published_by_user_id = ?, published_at = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, now, now, id).run();
  const assignmentColumns = await tableColumns(c, "roster_assignments");
  const assignmentRows = (await c.env.DB.prepare("SELECT * FROM roster_assignments WHERE roster_period_id = ?").bind(id).all<Record<string, unknown>>()).results;
  let affectedAssignments = 0;
  for (const row of assignmentRows) {
    const nextStatus = ["DRAFT", "SCHEDULED", "CHANGED_AFTER_PUBLISH"].includes(String(row.status)) ? "PUBLISHED" : row.status;
    const values: Record<string, unknown> = {
      status: nextStatus,
      published_snapshot_json: JSON.stringify(row),
      changed_after_publish: 0,
      change_reason: null,
      updated_at: now
    };
    const entries = Object.entries(values).filter(([key]) => assignmentColumns.has(key));
    if (entries.length) {
      await c.env.DB.prepare(`UPDATE roster_assignments SET ${entries.map(([key]) => `${key} = ?`).join(", ")} WHERE id = ?`).bind(...entries.map(([, value]) => bindValue(value)), String(row.id)).run();
      affectedAssignments += 1;
    }
  }
  const period = await getPeriod(c, id);
  await auditRoster(c, { action: "roster.period.published", entityType: "roster_period", entityId: id, oldValue: old, newValue: { period, affected_assignments: affectedAssignments } });
  await publishRoster(c, "roster.period.published", "roster_period", id, "published");
  return ok(c, { period, affected_assignments: affectedAssignments });
});

rosterRoutes.post("/periods/:id/unpublish", requireAnyPermission(PERIOD_UNPUBLISH_PERMISSIONS), async (c) => {
  const id = routeParam(c, "id");
  const body = await readJsonBody(c.req.raw);
  const reason = optionalString(body.reason);
  if (!reason) return fail(c, 400, "REASON_REQUIRED", "Reason is required for this roster action.");
  const old = await getPeriod(c, id);
  if (!old) return fail(c, 404, "NOT_FOUND", "Roster period was not found.");
  if (old.status === "LOCKED" && !hasAny(c, PERIOD_UNLOCK_PERMISSIONS)) return fail(c, 403, "ROSTER_LOCKED", "This roster is locked.");
  await c.env.DB.prepare("UPDATE roster_periods SET status = 'DRAFT', updated_at = ? WHERE id = ?").bind(new Date().toISOString(), id).run();
  const period = await getPeriod(c, id);
  await auditRoster(c, { action: "roster.period.unpublished", entityType: "roster_period", entityId: id, oldValue: old, newValue: period, reason });
  await publishRoster(c, "roster.changed", "roster_period", id, "unpublished");
  return ok(c, { period });
});

rosterRoutes.post("/periods/:id/lock", requireAnyPermission(PERIOD_LOCK_PERMISSIONS), async (c) => {
  const id = routeParam(c, "id");
  const body = await readJsonBody(c.req.raw);
  const reason = optionalString(body.reason);
  const settings = await getRosterSettings(c);
  if (!bool(settings.allow_roster_lock, true)) return fail(c, 400, "ROSTER_LOCK_DISABLED", "Roster locking is disabled in settings.");
  const old = await getPeriod(c, id);
  if (!old) return fail(c, 404, "NOT_FOUND", "Roster period was not found.");
  await c.env.DB.prepare("UPDATE roster_periods SET status = 'LOCKED', updated_at = ? WHERE id = ?").bind(new Date().toISOString(), id).run();
  const period = await getPeriod(c, id);
  await auditRoster(c, { action: "roster.period.locked", entityType: "roster_period", entityId: id, oldValue: old, newValue: period, reason });
  await publishRoster(c, "roster.changed", "roster_period", id, "locked");
  return ok(c, { period });
});

rosterRoutes.post("/periods/:id/unlock", requireAnyPermission(PERIOD_UNLOCK_PERMISSIONS), async (c) => {
  const id = routeParam(c, "id");
  const body = await readJsonBody(c.req.raw);
  const reason = optionalString(body.reason);
  if (!reason) return fail(c, 400, "REASON_REQUIRED", "Reason is required for this roster action.");
  const old = await getPeriod(c, id);
  if (!old) return fail(c, 404, "NOT_FOUND", "Roster period was not found.");
  await c.env.DB.prepare("UPDATE roster_periods SET status = 'PUBLISHED', updated_at = ? WHERE id = ?").bind(new Date().toISOString(), id).run();
  const period = await getPeriod(c, id);
  await auditRoster(c, { action: "roster.period.unlocked", entityType: "roster_period", entityId: id, oldValue: old, newValue: period, reason });
  await publishRoster(c, "roster.changed", "roster_period", id, "unlocked");
  return ok(c, { period });
});

rosterRoutes.post("/periods/:id/archive", requireAnyPermission(PERIOD_ARCHIVE_PERMISSIONS), async (c) => {
  const id = routeParam(c, "id");
  const old = await getPeriod(c, id);
  if (!old) return fail(c, 404, "NOT_FOUND", "Roster period was not found.");
  await c.env.DB.prepare("UPDATE roster_periods SET status = 'ARCHIVED', archived_by_user_id = ?, archived_at = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, new Date().toISOString(), new Date().toISOString(), id).run();
  await auditRoster(c, { action: "roster.period.archived", entityType: "roster_period", entityId: id, oldValue: old });
  await publishRoster(c, "roster.period.archived", "roster_period", id, "archived");
  return ok(c, { archived: true });
});

rosterRoutes.get("/weekly", requireAnyPermission(["roster.view", "roster.team.view", "roster.assignments.view"]), async (c) => {
  const data = await getWeeklyData(c);
  if ("error" in data) return fail(c, 400, "VALIDATION_ERROR", data.error ?? "Unable to load weekly roster.");
  return ok(c, data);
});

rosterRoutes.post("/weekly/save", requireAnyPermission(ASSIGNMENT_BULK_PERMISSIONS), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const weekStart = readString(body.week_start_date);
  if (!isDate(weekStart)) return fail(c, 400, "VALIDATION_ERROR", "A valid week_start_date is required.");
  const period = await ensurePeriod(c, weekStart, optionalString(body.location_id), optionalString(body.department_id));
  const reason = optionalString(body.reason);
  const editError = await canEditPeriod(c, period, reason);
  if (editError) return fail(c, 403, "PUBLISHED_ROSTER_LOCKED", editError);
  const assignments = Array.isArray(body.assignments) ? body.assignments as Record<string, unknown>[] : [];
  const saved: unknown[] = [];
  const warnings: unknown[] = [];
  for (const assignment of assignments) {
    const result = await saveAssignment(c, period, { ...assignment, reason });
    if (result.error) return fail(c, 400, result.errorCode ?? "VALIDATION_ERROR", result.error);
    saved.push(result.assignment);
    if (result.warning) warnings.push({ employee_id: assignment.employee_id, roster_date: assignment.roster_date, warning: result.warning });
  }
  await auditRoster(c, { action: "roster.assignment.batch_saved", entityType: "roster_period", entityId: String(period.id), newValue: { count: saved.length }, reason });
  await publishRoster(c, "roster.week.saved", "roster_period", String(period.id), "saved");
  return ok(c, { period: await getPeriod(c, String(period.id)), assignments: saved, warnings });
});

rosterRoutes.post("/weekly/copy-previous", requireAnyPermission(ASSIGNMENT_COPY_PERMISSIONS), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const targetWeek = readString(body.target_week_start_date);
  if (!isDate(targetWeek)) return fail(c, 400, "VALIDATION_ERROR", "A valid target_week_start_date is required.");
  const locationId = optionalString(body.location_id);
  const departmentId = optionalString(body.department_id);
  const previous = await findPeriod(c, addDays(targetWeek, -7), locationId, departmentId);
  if (!previous) return fail(c, 404, "PREVIOUS_WEEK_NOT_FOUND", "No previous roster period was found for this scope.");
  const target = await ensurePeriod(c, targetWeek, locationId, departmentId);
  const overwrite = bool(body.overwrite_existing, false);
  const rows = (await c.env.DB.prepare("SELECT * FROM roster_assignments WHERE roster_period_id = ? ORDER BY roster_date").bind(previous.id).all<Record<string, unknown>>()).results;
  let copied = 0;
  for (const row of rows) {
    const targetDate = addDays(String(row.roster_date), 7);
    if (!overwrite) {
      const existing = await c.env.DB.prepare("SELECT id FROM roster_assignments WHERE employee_id = ? AND roster_date = ?").bind(row.employee_id, targetDate).first();
      if (existing) continue;
    }
    const leave = await approvedLeave(c, String(row.employee_id), targetDate);
    const result = await saveAssignment(c, target, { ...row, roster_date: targetDate, status: leave ? "LEAVE" : row.status, reason: "Copied from previous week" }, "COPIED");
    if (!result.error) copied += 1;
  }
  await auditRoster(c, { action: "roster.week.copied", entityType: "roster_period", entityId: String(target.id), newValue: { copied, source_period_id: previous.id } });
  await publishRoster(c, "roster.week.copied", "roster_period", String(target.id), "copied");
  return ok(c, { period: await getPeriod(c, String(target.id)), copied });
});

rosterRoutes.post("/weekly/clear", requireAnyPermission(ASSIGNMENT_BULK_PERMISSIONS), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const weekStart = readString(body.week_start_date);
  const reason = optionalString(body.reason);
  if (!isDate(weekStart) || !reason) return fail(c, 400, "VALIDATION_ERROR", "Week start date and reason are required.");
  const period = await findPeriod(c, weekStart, optionalString(body.location_id), optionalString(body.department_id));
  if (!period) return fail(c, 404, "NOT_FOUND", "Roster period was not found.");
  const editError = await canEditPeriod(c, period, reason);
  if (editError) return fail(c, 403, "PUBLISHED_ROSTER_LOCKED", editError);
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "roster", "manage", "e");
  await c.env.DB.prepare(`UPDATE roster_assignments SET status = 'UNASSIGNED', shift_template_id = NULL, custom_start_time = NULL, custom_end_time = NULL, notes = NULL, source = 'SYSTEM', updated_by_user_id = ?, updated_at = ? WHERE roster_period_id = ? AND employee_id IN (SELECT e.id FROM employees e WHERE ${scope.sql})`).bind(c.get("currentUser").id, new Date().toISOString(), period.id, ...scope.params).run();
  await auditRoster(c, { action: "roster.week.cleared", entityType: "roster_period", entityId: String(period.id), reason });
  await publishRoster(c, "roster.week.cleared", "roster_period", String(period.id), "cleared");
  return ok(c, { cleared: true });
});

rosterRoutes.get("/weekly-off-rules", requireAnyPermission(SETTINGS_READ_PERMISSIONS), async (c) => {
  const rows = await c.env.DB.prepare("SELECT wor.*, l.name AS location_name, d.name AS department_name FROM weekly_off_rules wor LEFT JOIN locations l ON l.id = wor.location_id LEFT JOIN departments d ON d.id = wor.department_id ORDER BY wor.is_active DESC, wor.day_of_week, l.name, d.name").all();
  return ok(c, { rules: rows.results });
});

rosterRoutes.post("/weekly-off-rules", requireAnyPermission(SETTINGS_WRITE_PERMISSIONS), async (c) => {
  const input = readWeeklyOffRuleInput(await readJsonBody(c.req.raw));
  if (!input.day_of_week) return fail(c, 400, "VALIDATION_ERROR", "A valid day of week is required.");
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO weekly_off_rules (id, location_id, department_id, day_of_week, is_active) VALUES (?, ?, ?, ?, ?)").bind(id, input.location_id, input.department_id, input.day_of_week, input.is_active ? 1 : 0).run();
  const saved = await getWeeklyOffRule(c, id);
  await auditRoster(c, { action: "roster.weekly_off_rule.created", entityType: "weekly_off_rule", entityId: id, newValue: saved });
  await publishRoster(c, "roster.weekly_off_rule.changed", "weekly_off_rule", id, "created");
  return ok(c, { rule: saved }, 201);
});

rosterRoutes.patch("/weekly-off-rules/:id", requireAnyPermission(SETTINGS_WRITE_PERMISSIONS), async (c) => {
  const id = routeParam(c, "id");
  const old = await getWeeklyOffRule(c, id);
  if (!old) return fail(c, 404, "NOT_FOUND", "Weekly off rule was not found.");
  const input = readWeeklyOffRuleInput(await readJsonBody(c.req.raw), old);
  if (!input.day_of_week) return fail(c, 400, "VALIDATION_ERROR", "A valid day of week is required.");
  await c.env.DB.prepare("UPDATE weekly_off_rules SET location_id = ?, department_id = ?, day_of_week = ?, is_active = ?, updated_at = ? WHERE id = ?").bind(input.location_id, input.department_id, input.day_of_week, input.is_active ? 1 : 0, new Date().toISOString(), id).run();
  const saved = await getWeeklyOffRule(c, id);
  await auditRoster(c, { action: "roster.weekly_off_rule.updated", entityType: "weekly_off_rule", entityId: id, oldValue: old, newValue: saved });
  await publishRoster(c, "roster.weekly_off_rule.changed", "weekly_off_rule", id, "updated");
  return ok(c, { rule: saved });
});

async function weeklyOffRuleAction(c: Context<AppBindings>, active: boolean) {
  const id = routeParam(c, "id");
  const old = await getWeeklyOffRule(c, id);
  if (!old) return fail(c, 404, "NOT_FOUND", "Weekly off rule was not found.");
  await c.env.DB.prepare("UPDATE weekly_off_rules SET is_active = ?, updated_at = ? WHERE id = ?").bind(active ? 1 : 0, new Date().toISOString(), id).run();
  const saved = await getWeeklyOffRule(c, id);
  await auditRoster(c, { action: active ? "roster.weekly_off_rule.enabled" : "roster.weekly_off_rule.disabled", entityType: "weekly_off_rule", entityId: id, oldValue: old, newValue: saved });
  await publishRoster(c, "roster.weekly_off_rule.changed", "weekly_off_rule", id, active ? "enabled" : "disabled");
  return ok(c, { rule: saved });
}

rosterRoutes.post("/weekly-off-rules/:id/enable", requireAnyPermission(SETTINGS_WRITE_PERMISSIONS), (c) => weeklyOffRuleAction(c, true));
rosterRoutes.post("/weekly-off-rules/:id/disable", requireAnyPermission(SETTINGS_WRITE_PERMISSIONS), (c) => weeklyOffRuleAction(c, false));

rosterRoutes.get("/assignments", requireAnyPermission(ASSIGNMENT_READ_PERMISSIONS), async (c) => {
  const weekStart = readString(c.req.query("week_start_date"));
  const conditions: string[] = [];
  const params: BindValue[] = [];
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "roster", "view", "e");
  conditions.push(scope.sql);
  params.push(...scope.params);
  if (weekStart && isDate(weekStart)) { conditions.push("ra.roster_date BETWEEN ? AND ?"); params.push(weekStart, weekEnd(weekStart)); }
  const employeeId = readString(c.req.query("employee_id"));
  if (employeeId) { conditions.push("ra.employee_id = ?"); params.push(employeeId); }
  const rows = await c.env.DB.prepare(`SELECT ra.*, st.code AS shift_code, st.name AS shift_name, e.employee_no, e.full_name AS employee_name FROM roster_assignments ra INNER JOIN employees e ON e.id = ra.employee_id LEFT JOIN shift_templates st ON st.id = ra.shift_template_id ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY ra.roster_date DESC LIMIT 500`).bind(...params).all();
  return ok(c, { assignments: rows.results });
});

rosterRoutes.post("/assignments", requireAnyPermission(ASSIGNMENT_CREATE_PERMISSIONS), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const period = await getPeriod(c, readString(body.roster_period_id));
  if (!period) return fail(c, 404, "NOT_FOUND", "Roster period was not found.");
  const editError = await canEditRosterPeriod(c, period, optionalString(body.reason));
  if (editError) return fail(c, 403, "ROSTER_LOCKED", editError);
  const result = await saveAssignment(c, period, body);
  if (result.error) return fail(c, 400, result.errorCode ?? "VALIDATION_ERROR", result.error);
  if (result.assignment) await refreshAttendanceFromRosterChange(c, result.assignment);
  return ok(c, { assignment: result.assignment, warning: result.warning, warnings: result.warnings ?? [] }, 201);
});

rosterRoutes.get("/assignments/:id", requireAnyPermission(ASSIGNMENT_READ_PERMISSIONS), async (c) => {
  const assignment = await getAssignment(c, routeParam(c, "id"));
  if (!assignment) return fail(c, 404, "NOT_FOUND", "Roster assignment was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(assignment.employee_id), "roster", "view"))) return fail(c, 404, "NOT_FOUND", "Roster assignment was not found.");
  return ok(c, { assignment });
});

rosterRoutes.patch("/assignments/:id", requireAnyPermission(ASSIGNMENT_WRITE_PERMISSIONS), async (c) => {
  const old = await getAssignment(c, routeParam(c, "id"));
  if (!old) return fail(c, 404, "NOT_FOUND", "Roster assignment was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(old.employee_id), "roster", "manage"))) return fail(c, 404, "NOT_FOUND", "Roster assignment was not found.");
  const period = await getPeriod(c, String(old.roster_period_id));
  if (!period) return fail(c, 404, "NOT_FOUND", "Roster period was not found.");
  const body = await readJsonBody(c.req.raw);
  const editError = await canEditPeriod(c, period, optionalString(body.reason));
  if (editError) return fail(c, 403, "PUBLISHED_ROSTER_LOCKED", editError);
  const result = await saveAssignment(c, period, { ...old, ...body });
  if (result.error) return fail(c, 400, result.errorCode ?? "VALIDATION_ERROR", result.error);
  if (result.assignment) await refreshAttendanceFromRosterChange(c, result.assignment);
  return ok(c, { assignment: result.assignment, warning: result.warning, warnings: result.warnings ?? [] });
});

rosterRoutes.post("/assignments/:id/cancel", requireAnyPermission(ASSIGNMENT_CANCEL_PERMISSIONS), async (c) => {
  const id = routeParam(c, "id");
  const old = await getAssignment(c, id);
  if (!old) return fail(c, 404, "NOT_FOUND", "Roster assignment was not found.");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), String(old.employee_id), "roster", "manage"))) return fail(c, 404, "NOT_FOUND", "Roster assignment was not found.");
  const period = await getPeriod(c, String(old.roster_period_id));
  if (!period) return fail(c, 404, "NOT_FOUND", "Roster period was not found.");
  const body = await readJsonBody(c.req.raw);
  const reason = optionalString(body.reason);
  if (!reason) return fail(c, 400, "REASON_REQUIRED", "Reason is required for this roster action.");
  const editError = await canEditRosterPeriod(c, period, reason);
  if (editError) return fail(c, 403, "ROSTER_LOCKED", editError);
  const columns = await tableColumns(c, "roster_assignments");
  const now = new Date().toISOString();
  const values: Record<string, unknown> = {
    status: "CANCELLED",
    cancelled_by_user_id: c.get("currentUser").id,
    cancelled_at: now,
    change_reason: reason,
    source: "SYSTEM",
    updated_by_user_id: c.get("currentUser").id,
    updated_at: now
  };
  const entries = Object.entries(values).filter(([key]) => columns.has(key));
  await c.env.DB.prepare(`UPDATE roster_assignments SET ${entries.map(([key]) => `${key} = ?`).join(", ")} WHERE id = ?`).bind(...entries.map(([, value]) => bindValue(value)), id).run();
  const saved = await getAssignment(c, id);
  await auditRoster(c, { action: "roster.assignment.cancelled", entityType: "roster_assignment", entityId: id, oldValue: old, newValue: saved, reason });
  await publishRoster(c, "roster.changed", "roster_assignment", id, "cancelled");
  if (saved) await refreshAttendanceFromRosterChange(c, saved);
  return ok(c, { assignment: saved });
});

rosterRoutes.post("/assignments/batch", requireAnyPermission(ASSIGNMENT_BULK_PERMISSIONS), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const period = await getPeriod(c, readString(body.roster_period_id));
  if (!period) return fail(c, 404, "NOT_FOUND", "Roster period was not found.");
  const editError = await canEditPeriod(c, period, optionalString(body.reason));
  if (editError) return fail(c, 403, "PUBLISHED_ROSTER_LOCKED", editError);
  const assignments = Array.isArray(body.assignments) ? body.assignments as Record<string, unknown>[] : [];
  const saved = [];
  for (const assignment of assignments) {
    const result = await saveAssignment(c, period, { ...assignment, reason: body.reason });
    if (result.error) return fail(c, 400, result.errorCode ?? "VALIDATION_ERROR", result.error);
    saved.push(result.assignment);
  }
  return ok(c, { assignments: saved });
});

rosterRoutes.post("/assignments/bulk", requireAnyPermission(ASSIGNMENT_BULK_PERMISSIONS), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const period = await getPeriod(c, readString(body.roster_period_id));
  if (!period) return fail(c, 404, "NOT_FOUND", "Roster period was not found.");
  const editError = await canEditRosterPeriod(c, period, optionalString(body.reason));
  if (editError) return fail(c, 403, "ROSTER_LOCKED", editError);
  const assignments = Array.isArray(body.assignments) ? body.assignments as Record<string, unknown>[] : [];
  const saved = [];
  for (const assignment of assignments) {
    const result = await saveAssignment(c, period, { ...assignment, reason: body.reason });
    if (result.error) return fail(c, 400, result.errorCode ?? "VALIDATION_ERROR", result.error);
    saved.push(result.assignment);
  }
  return ok(c, { assignments: saved });
});

rosterRoutes.post("/assignments/copy-week", requireAnyPermission(ASSIGNMENT_COPY_PERMISSIONS), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const targetWeek = readString(body.target_week_start_date ?? body.week_start_date);
  const previous = await findPeriod(c, addDays(targetWeek, -7), optionalString(body.location_id), optionalString(body.department_id));
  if (!isDate(targetWeek)) return fail(c, 400, "VALIDATION_ERROR", "A valid target week is required.");
  if (!previous) return fail(c, 404, "PREVIOUS_WEEK_NOT_FOUND", "No previous roster period was found for this scope.");
  const target = await ensurePeriod(c, targetWeek, optionalString(body.location_id), optionalString(body.department_id));
  const rows = (await c.env.DB.prepare("SELECT * FROM roster_assignments WHERE roster_period_id = ? ORDER BY roster_date").bind(previous.id).all<Record<string, unknown>>()).results;
  let copied = 0;
  for (const row of rows) {
    const targetDate = addDays(String(row.roster_date), 7);
    const result = await saveAssignment(c, target, { ...row, roster_date: targetDate, reason: optionalString(body.reason) ?? "Copied from previous week" }, "COPIED");
    if (!result.error) copied += 1;
  }
  await auditRoster(c, { action: "roster.week.copied", entityType: "roster_period", entityId: String(target.id), newValue: { copied, source_period_id: previous.id }, reason: optionalString(body.reason) });
  await publishRoster(c, "roster.week.copied", "roster_period", String(target.id), "copied");
  return ok(c, { period: await getPeriod(c, String(target.id)), copied });
});

rosterRoutes.get("/dashboard", requireAnyPermission(["roster.view", "roster.team.view"]), async (c) => {
  const today = new Date().toISOString().slice(0, 10);
  const day = new Date(`${today}T00:00:00Z`).getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = addDays(today, mondayOffset);
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "roster", "view", "e");
  const scopedEmployeeSql = `SELECT e.id FROM employees e WHERE ${scope.sql}`;
  const row = await c.env.DB.prepare(
    `SELECT
      (SELECT status FROM roster_periods WHERE week_start_date = ? AND status != 'ARCHIVED' ORDER BY updated_at DESC LIMIT 1) AS current_week_status,
      (SELECT COUNT(DISTINCT employee_id) FROM roster_assignments WHERE employee_id IN (${scopedEmployeeSql}) AND roster_date BETWEEN ? AND ? AND status = 'SCHEDULED') AS employees_scheduled_this_week,
      (SELECT COUNT(*) FROM roster_assignments WHERE employee_id IN (${scopedEmployeeSql}) AND roster_date BETWEEN ? AND ? AND status = 'UNASSIGNED') AS unassigned_assignments_this_week,
      (SELECT COUNT(*) FROM roster_assignments WHERE employee_id IN (${scopedEmployeeSql}) AND roster_date BETWEEN ? AND ? AND status = 'LEAVE') AS employees_on_leave_this_week,
      (SELECT COUNT(*) FROM roster_assignments WHERE employee_id IN (${scopedEmployeeSql}) AND roster_date BETWEEN ? AND ? AND status = 'OFF') AS off_day_count,
      (SELECT published_at FROM roster_periods WHERE status = 'PUBLISHED' ORDER BY published_at DESC LIMIT 1) AS recently_published_at`
  ).bind(monday, ...scope.params, monday, weekEnd(monday), ...scope.params, monday, weekEnd(monday), ...scope.params, monday, weekEnd(monday), ...scope.params, monday, weekEnd(monday)).first();
  return ok(c, { ...(row ?? {}), roster_conflicts: 0 });
});

rosterRoutes.get("/reports", requireAnyPermission(["roster.reports.view", "roster.view"]), async (c) => {
  const weekStart = readString(c.req.query("week_start_date"));
  const from = weekStart && isDate(weekStart) ? weekStart : addDays(new Date().toISOString().slice(0, 10), -7);
  const to = weekStart && isDate(weekStart) ? weekEnd(weekStart) : new Date().toISOString().slice(0, 10);
  const status = readString(c.req.query("status")).toUpperCase();
  const statusFilter = ASSIGNMENT_STATUSES.has(status) ? status : "";
  const conditions = ["e.archived_at IS NULL"];
  const params: BindValue[] = [from, to];
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "roster", "view", "e");
  conditions.push(scope.sql);
  if (statusFilter) params.push(statusFilter);
  params.push(...scope.params);
  const search = readString(c.req.query("search"));
  if (search) { conditions.push("(e.employee_no LIKE ? OR e.full_name LIKE ?)"); params.push(`%${search}%`, `%${search}%`); }
  const departmentId = readString(c.req.query("department_id"));
  if (departmentId) { conditions.push("e.primary_department_id = ?"); params.push(departmentId); }
  const locationId = readString(c.req.query("location_id"));
  if (locationId) { conditions.push("e.primary_location_id = ?"); params.push(locationId); }
  const rows = await c.env.DB.prepare(
    `SELECT e.id AS employee_id, e.employee_no, e.full_name AS employee_name, d.name AS department_name, l.name AS location_name,
      SUM(CASE WHEN ra.status = 'SCHEDULED' THEN 1 ELSE 0 END) AS scheduled_days,
      SUM(CASE WHEN ra.status = 'OFF' THEN 1 ELSE 0 END) AS off_days,
      SUM(CASE WHEN ra.status = 'LEAVE' THEN 1 ELSE 0 END) AS leave_days,
      SUM(CASE WHEN ra.status = 'UNASSIGNED' THEN 1 ELSE 0 END) AS unassigned_days,
      SUM(CASE WHEN ra.status = 'SCHEDULED' THEN COALESCE(st.total_work_minutes, 0) ELSE 0 END) AS scheduled_minutes
     FROM employees e
     LEFT JOIN departments d ON d.id = e.primary_department_id
     LEFT JOIN locations l ON l.id = e.primary_location_id
     LEFT JOIN roster_assignments ra ON ra.employee_id = e.id AND ra.roster_date BETWEEN ? AND ? ${statusFilter ? "AND ra.status = ?" : ""}
     LEFT JOIN shift_templates st ON st.id = ra.shift_template_id
     WHERE ${conditions.join(" AND ")}
     GROUP BY e.id, e.employee_no, e.full_name, d.name, l.name
     ORDER BY e.employee_no`
  ).bind(...params).all();
  return ok(c, { reports: rows.results });
});

rosterRoutes.get("/reports/export.csv", requireAnyPermission(["roster.reports.export"]), async (c) => {
  const weekStart = readString(c.req.query("week_start_date"));
  const from = weekStart && isDate(weekStart) ? weekStart : addDays(new Date().toISOString().slice(0, 10), -7);
  const to = weekStart && isDate(weekStart) ? weekEnd(weekStart) : new Date().toISOString().slice(0, 10);
  const conditions = ["ra.roster_date BETWEEN ? AND ?"];
  const params: BindValue[] = [from, to];
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "roster", "view", "e");
  conditions.push(scope.sql);
  params.push(...scope.params);
  const status = readString(c.req.query("status")).toUpperCase();
  if (ASSIGNMENT_STATUSES.has(status)) { conditions.push("ra.status = ?"); params.push(status); }
  const search = readString(c.req.query("search"));
  if (search) { conditions.push("(e.employee_no LIKE ? OR e.full_name LIKE ?)"); params.push(`%${search}%`, `%${search}%`); }
  const departmentId = readString(c.req.query("department_id"));
  if (departmentId) { conditions.push("e.primary_department_id = ?"); params.push(departmentId); }
  const locationId = readString(c.req.query("location_id"));
  if (locationId) { conditions.push("e.primary_location_id = ?"); params.push(locationId); }
  const rows = (await c.env.DB.prepare(`SELECT ra.roster_date, e.employee_no, e.full_name AS employee_name, d.name AS department_name, l.name AS location_name, ra.status, st.code AS shift_code, st.name AS shift_name, ra.custom_start_time, ra.custom_end_time, ra.notes FROM roster_assignments ra INNER JOIN employees e ON e.id = ra.employee_id LEFT JOIN departments d ON d.id = e.primary_department_id LEFT JOIN locations l ON l.id = e.primary_location_id LEFT JOIN shift_templates st ON st.id = ra.shift_template_id WHERE ${conditions.join(" AND ")} ORDER BY ra.roster_date DESC, e.employee_no LIMIT 5000`).bind(...params).all<Record<string, unknown>>()).results;
  await auditRoster(c, { action: "roster.report_exported", entityType: "roster_report", entityId: "roster_assignments_csv", newValue: { rows: rows.length } });
  const header = ["roster_date", "employee_no", "employee_name", "department_name", "location_name", "status", "shift_code", "shift_name", "custom_start_time", "custom_end_time", "notes"];
  const csv = [header.join(","), ...rows.map((row) => header.map((key) => `"${String(row[key] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=roster-report.csv" } });
});

employeeRosterRoutes.get("/:employeeId/roster/assignments", requireAnyPermission(["employees.roster.view", "roster.view"]), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), routeParam(c, "employeeId"), "roster", "view"))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const rows = await c.env.DB.prepare(`${rosterAssignmentSelect("WHERE ra.employee_id = ?")} ORDER BY ra.roster_date DESC LIMIT 120`).bind(routeParam(c, "employeeId")).all();
  return ok(c, { assignments: rows.results });
});

employeeRosterRoutes.get("/:employeeId/roster/current-week", requireAnyPermission(["employees.roster.view", "roster.view"]), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), routeParam(c, "employeeId"), "roster", "view"))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const today = new Date().toISOString().slice(0, 10);
  const day = new Date(`${today}T00:00:00Z`).getUTCDay();
  const monday = addDays(today, day === 0 ? -6 : 1 - day);
  const rows = await c.env.DB.prepare(`${rosterAssignmentSelect("WHERE ra.employee_id = ? AND ra.roster_date BETWEEN ? AND ?")} ORDER BY ra.roster_date`).bind(routeParam(c, "employeeId"), monday, weekEnd(monday)).all();
  return ok(c, { week_start_date: monday, week_end_date: weekEnd(monday), assignments: rows.results });
});

employeeRosterRoutes.get("/:employeeId/roster/history", requireAnyPermission(["employees.roster.view", "roster.view"]), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), routeParam(c, "employeeId"), "roster", "view"))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const rows = await c.env.DB.prepare("SELECT * FROM roster_assignment_history WHERE employee_id = ? ORDER BY created_at DESC LIMIT 100").bind(routeParam(c, "employeeId")).all();
  return ok(c, { history: rows.results });
});

employeeRosterRoutes.get("/:employeeId/roster/summary", requireAnyPermission(["employees.roster.view", "roster.view"]), async (c) => {
  const employeeId = routeParam(c, "employeeId");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "roster", "view"))) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  const [assignments, history] = await Promise.all([
    c.env.DB.prepare(`${rosterAssignmentSelect("WHERE ra.employee_id = ?")} ORDER BY ra.roster_date DESC LIMIT 120`).bind(employeeId).all<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT * FROM roster_assignment_history WHERE employee_id = ? ORDER BY created_at DESC LIMIT 50").bind(employeeId).all()
  ]);
  const summary = { scheduled_days: 0, off_days: 0, leave_days: 0, unassigned_days: 0, scheduled_minutes: 0 };
  for (const row of assignments.results) {
    if (row.status === "SCHEDULED") { summary.scheduled_days += 1; summary.scheduled_minutes += Number(row.total_work_minutes ?? 0); }
    if (row.status === "OFF") summary.off_days += 1;
    if (row.status === "LEAVE") summary.leave_days += 1;
    if (row.status === "UNASSIGNED") summary.unassigned_days += 1;
  }
  return ok(c, { summary, assignments: assignments.results, history: history.results });
});
