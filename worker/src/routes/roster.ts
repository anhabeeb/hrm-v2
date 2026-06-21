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
type AssignmentStatus = "SCHEDULED" | "OFF" | "LEAVE" | "ABSENT_PLACEHOLDER" | "UNASSIGNED";

const ASSIGNMENT_STATUSES = new Set(["SCHEDULED", "OFF", "LEAVE", "ABSENT_PLACEHOLDER", "UNASSIGNED"]);
const SOURCES = new Set(["MANUAL", "COPIED", "LEAVE_SYNC", "SYSTEM"]);
const WEEK_DAYS = new Set(["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"]);

export const rosterRoutes = new Hono<AppBindings>();
export const employeeRosterRoutes = new Hono<AppBindings>();

rosterRoutes.use("*", requireAuth);
employeeRosterRoutes.use("*", requireAuth);

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

async function getSettings(c: Context<AppBindings>) {
  let settings = await c.env.DB.prepare("SELECT * FROM roster_settings WHERE id = 'roster_settings_default'").first<Record<string, unknown>>();
  if (!settings) {
    await c.env.DB.prepare("INSERT INTO roster_settings (id, default_week_start_day, allow_published_roster_edits, require_reason_for_published_edits, show_leave_on_roster, show_attendance_on_roster, default_shift_template_id) VALUES ('roster_settings_default', 'MONDAY', 1, 1, 1, 1, (SELECT id FROM shift_templates WHERE code = 'GENERAL' LIMIT 1))").run();
    settings = await c.env.DB.prepare("SELECT * FROM roster_settings WHERE id = 'roster_settings_default'").first<Record<string, unknown>>();
  }
  return settings!;
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
  if (period.status !== "PUBLISHED") return null;
  if (!has(c, "roster.publish")) return "Published rosters require roster.publish permission to edit.";
  const settings = await getSettings(c);
  if (!bool(settings.allow_published_roster_edits, true)) return "Published roster edits are disabled in roster settings.";
  if (bool(settings.require_reason_for_published_edits, true) && !reason) return "Published roster edits require a reason.";
  return null;
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
    total_work_minutes: num(body.total_work_minutes, scheduledMinutes(start, end, breakMinutes, overnight)),
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

async function readAssignmentInput(c: Context<AppBindings>, body: Record<string, unknown>, period: Record<string, unknown>, existing?: Record<string, unknown>, sourceOverride?: string) {
  const status = readString(body.status ?? existing?.status ?? "UNASSIGNED").toUpperCase();
  const source = readString(sourceOverride ?? body.source ?? existing?.source ?? "MANUAL").toUpperCase();
  const input = {
    employee_id: readString(body.employee_id ?? existing?.employee_id),
    roster_date: readString(body.roster_date ?? existing?.roster_date),
    shift_template_id: optionalString(body.shift_template_id ?? existing?.shift_template_id),
    custom_start_time: optionalString(body.custom_start_time ?? existing?.custom_start_time),
    custom_end_time: optionalString(body.custom_end_time ?? existing?.custom_end_time),
    break_minutes: num(body.break_minutes, existing?.break_minutes == null ? null : Number(existing.break_minutes)),
    status: (ASSIGNMENT_STATUSES.has(status) ? status : "UNASSIGNED") as AssignmentStatus,
    notes: optionalString(body.notes ?? existing?.notes),
    source: SOURCES.has(source) ? source : "MANUAL",
    reason: optionalString(body.reason)
  };
  if (!input.employee_id || !isDate(input.roster_date)) return { input, error: "Employee and valid roster date are required." };
  if (!inWeek(input.roster_date, String(period.week_start_date))) return { input, error: "Roster date must be inside the selected roster week." };
  const employee = await c.env.DB.prepare("SELECT e.*, s.include_in_roster FROM employees e INNER JOIN employee_statuses s ON s.id = e.status_id WHERE e.id = ? AND e.archived_at IS NULL").bind(input.employee_id).first<Record<string, unknown>>();
  if (!employee) return { input, error: "Employee was not found or is archived." };
  if (!bool(employee.roster_eligible, true) || !bool(employee.include_in_roster, true)) return { input, error: "Employee is not roster eligible." };
  if (input.status === "SCHEDULED" && !input.shift_template_id && (!input.custom_start_time || !input.custom_end_time)) return { input, error: "Scheduled assignments require a shift template or custom start/end times." };
  if (input.shift_template_id && (!existing || input.shift_template_id !== existing.shift_template_id)) {
    const template = await c.env.DB.prepare("SELECT * FROM shift_templates WHERE id = ?").bind(input.shift_template_id).first<Record<string, unknown>>();
    if (!template) return { input, error: "Shift template was not found." };
    if (!bool(template.is_active, true)) return { input, error: "Inactive shift templates cannot be newly assigned." };
  }
  if (input.custom_start_time && input.custom_end_time && input.custom_end_time < input.custom_start_time) return { input, error: "Custom end time cannot be before custom start time for non-overnight custom shifts." };
  const leave = await approvedLeave(c, input.employee_id, input.roster_date);
  if (leave && input.status === "UNASSIGNED") input.status = "LEAVE";
  return { input, leave };
}

async function saveAssignment(c: Context<AppBindings>, period: Record<string, unknown>, body: Record<string, unknown>, sourceOverride?: string) {
  const existing = await c.env.DB.prepare("SELECT * FROM roster_assignments WHERE employee_id = ? AND roster_date = ?").bind(readString(body.employee_id), readString(body.roster_date)).first<Record<string, unknown>>();
  const { input, error, leave } = await readAssignmentInput(c, body, period, existing ?? undefined, sourceOverride);
  if (error) return { error };
  const id = existing?.id ? String(existing.id) : crypto.randomUUID();
  const now = new Date().toISOString();
  if (existing) {
    await c.env.DB
      .prepare("UPDATE roster_assignments SET roster_period_id = ?, shift_template_id = ?, custom_start_time = ?, custom_end_time = ?, break_minutes = ?, status = ?, notes = ?, source = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?")
      .bind(period.id, input.shift_template_id, input.custom_start_time, input.custom_end_time, input.break_minutes, input.status, input.notes, input.source, c.get("currentUser").id, now, id)
      .run();
  } else {
    await c.env.DB
      .prepare("INSERT INTO roster_assignments (id, roster_period_id, employee_id, roster_date, shift_template_id, custom_start_time, custom_end_time, break_minutes, status, notes, source, created_by_user_id, updated_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, period.id, input.employee_id, input.roster_date, input.shift_template_id, input.custom_start_time, input.custom_end_time, input.break_minutes, input.status, input.notes, input.source, c.get("currentUser").id, c.get("currentUser").id)
      .run();
  }
  await c.env.DB.prepare("INSERT INTO roster_assignment_history (id, roster_assignment_id, employee_id, roster_date, old_value_json, new_value_json, change_reason, changed_by_user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), id, input.employee_id, input.roster_date, existing ? JSON.stringify(existing) : null, JSON.stringify(input), input.reason, c.get("currentUser").id).run();
  const saved = await getAssignment(c, id);
  await auditRoster(c, { action: existing ? "roster.assignment.updated" : "roster.assignment.created", entityType: "roster_assignment", entityId: id, oldValue: existing, newValue: saved, reason: input.reason });
  await publishRoster(c, existing ? "roster.assignment.updated" : "roster.assignment.created", "roster_assignment", id, existing ? "updated" : "created");
  await publishAccessEvent(c.env, "employee.roster.changed", { actor_user_id: c.get("currentUser").id, entity_type: "roster_assignment", entity_id: id, action: "changed" });
  return { assignment: saved, warning: leave && input.status === "SCHEDULED" ? `Approved leave exists: ${leave.leave_type_name}` : null };
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

rosterRoutes.get("/shift-templates", requirePermission("roster.view"), async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM shift_templates ORDER BY is_active DESC, sort_order, name").all();
  return ok(c, { shift_templates: rows.results });
});

rosterRoutes.get("/shift-templates/:id", requirePermission("roster.view"), async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM shift_templates WHERE id = ?").bind(routeParam(c, "id")).first();
  if (!row) return fail(c, 404, "NOT_FOUND", "Shift template was not found.");
  return ok(c, { shift_template: row });
});

rosterRoutes.post("/shift-templates", requirePermission("roster.settings.manage"), async (c) => {
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

rosterRoutes.patch("/shift-templates/:id", requirePermission("roster.settings.manage"), async (c) => {
  const id = routeParam(c, "id");
  const old = await c.env.DB.prepare("SELECT * FROM shift_templates WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!old) return fail(c, 404, "NOT_FOUND", "Shift template was not found.");
  const input = readShiftTemplateInput(await readJsonBody(c.req.raw), old);
  await c.env.DB.prepare("UPDATE shift_templates SET code = ?, name = ?, description = ?, start_time = ?, end_time = ?, break_minutes = ?, total_work_minutes = ?, color_label = ?, is_overnight = ?, is_active = ?, sort_order = ?, updated_at = ? WHERE id = ?").bind(input.code, input.name, input.description, input.start_time, input.end_time, input.break_minutes, input.total_work_minutes, input.color_label, input.is_overnight ? 1 : 0, input.is_active ? 1 : 0, input.sort_order, new Date().toISOString(), id).run();
  const saved = await c.env.DB.prepare("SELECT * FROM shift_templates WHERE id = ?").bind(id).first();
  await auditRoster(c, { action: "roster.shift_template.updated", entityType: "shift_template", entityId: id, oldValue: old, newValue: saved });
  return ok(c, { shift_template: saved });
});

async function shiftTemplateAction(c: Context<AppBindings>, active: boolean) {
  const id = routeParam(c, "id");
  const old = await c.env.DB.prepare("SELECT * FROM shift_templates WHERE id = ?").bind(id).first();
  if (!old) return fail(c, 404, "NOT_FOUND", "Shift template was not found.");
  await c.env.DB.prepare("UPDATE shift_templates SET is_active = ?, updated_at = ? WHERE id = ?").bind(active ? 1 : 0, new Date().toISOString(), id).run();
  await auditRoster(c, { action: active ? "roster.shift_template.enabled" : "roster.shift_template.disabled", entityType: "shift_template", entityId: id, oldValue: old, newValue: { is_active: active } });
  return ok(c, { enabled: active });
}

rosterRoutes.post("/shift-templates/:id/enable", requirePermission("roster.settings.manage"), (c) => shiftTemplateAction(c, true));
rosterRoutes.post("/shift-templates/:id/disable", requirePermission("roster.settings.manage"), (c) => shiftTemplateAction(c, false));

rosterRoutes.get("/settings", requirePermission("roster.view"), async (c) => ok(c, { settings: await getSettings(c) }));

rosterRoutes.patch("/settings", requirePermission("roster.settings.manage"), async (c) => {
  const old = await getSettings(c);
  const body = await readJsonBody(c.req.raw);
  const input = {
    default_week_start_day: ["MONDAY", "SUNDAY"].includes(readString(body.default_week_start_day)) ? readString(body.default_week_start_day) : String(old.default_week_start_day),
    allow_published_roster_edits: bool(body.allow_published_roster_edits, Boolean(old.allow_published_roster_edits)),
    require_reason_for_published_edits: bool(body.require_reason_for_published_edits, Boolean(old.require_reason_for_published_edits)),
    show_leave_on_roster: bool(body.show_leave_on_roster, Boolean(old.show_leave_on_roster)),
    show_attendance_on_roster: bool(body.show_attendance_on_roster, Boolean(old.show_attendance_on_roster)),
    default_shift_template_id: optionalString(body.default_shift_template_id ?? old.default_shift_template_id)
  };
  await c.env.DB.prepare("UPDATE roster_settings SET default_week_start_day = ?, allow_published_roster_edits = ?, require_reason_for_published_edits = ?, show_leave_on_roster = ?, show_attendance_on_roster = ?, default_shift_template_id = ?, updated_at = ? WHERE id = 'roster_settings_default'").bind(input.default_week_start_day, input.allow_published_roster_edits ? 1 : 0, input.require_reason_for_published_edits ? 1 : 0, input.show_leave_on_roster ? 1 : 0, input.show_attendance_on_roster ? 1 : 0, input.default_shift_template_id, new Date().toISOString()).run();
  const saved = await getSettings(c);
  await auditRoster(c, { action: "roster.settings.updated", entityType: "roster_settings", entityId: "roster_settings_default", oldValue: old, newValue: saved });
  return ok(c, { settings: saved });
});

rosterRoutes.get("/periods", requirePermission("roster.view"), async (c) => {
  const rows = await c.env.DB.prepare("SELECT rp.*, l.name AS location_name, d.name AS department_name FROM roster_periods rp LEFT JOIN locations l ON l.id = rp.location_id LEFT JOIN departments d ON d.id = rp.department_id ORDER BY rp.week_start_date DESC, rp.created_at DESC LIMIT 200").all();
  return ok(c, { periods: rows.results });
});

rosterRoutes.get("/periods/:id", requirePermission("roster.view"), async (c) => {
  const period = await getPeriod(c, routeParam(c, "id"));
  if (!period) return fail(c, 404, "NOT_FOUND", "Roster period was not found.");
  return ok(c, { period });
});

rosterRoutes.post("/periods", requirePermission("roster.manage"), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const weekStart = readString(body.week_start_date);
  if (!isDate(weekStart)) return fail(c, 400, "VALIDATION_ERROR", "A valid week start date is required.");
  const period = await ensurePeriod(c, weekStart, optionalString(body.location_id), optionalString(body.department_id));
  return ok(c, { period }, 201);
});

rosterRoutes.patch("/periods/:id", requirePermission("roster.manage"), async (c) => {
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

rosterRoutes.post("/periods/:id/publish", requirePermission("roster.publish"), async (c) => {
  const id = routeParam(c, "id");
  const old = await getPeriod(c, id);
  if (!old) return fail(c, 404, "NOT_FOUND", "Roster period was not found.");
  await c.env.DB.prepare("UPDATE roster_periods SET status = 'PUBLISHED', published_by_user_id = ?, published_at = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, new Date().toISOString(), new Date().toISOString(), id).run();
  const period = await getPeriod(c, id);
  await auditRoster(c, { action: "roster.period.published", entityType: "roster_period", entityId: id, oldValue: old, newValue: period });
  await publishRoster(c, "roster.period.published", "roster_period", id, "published");
  return ok(c, { period });
});

rosterRoutes.post("/periods/:id/archive", requirePermission("roster.manage"), async (c) => {
  const id = routeParam(c, "id");
  const old = await getPeriod(c, id);
  if (!old) return fail(c, 404, "NOT_FOUND", "Roster period was not found.");
  await c.env.DB.prepare("UPDATE roster_periods SET status = 'ARCHIVED', archived_by_user_id = ?, archived_at = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, new Date().toISOString(), new Date().toISOString(), id).run();
  await auditRoster(c, { action: "roster.period.archived", entityType: "roster_period", entityId: id, oldValue: old });
  await publishRoster(c, "roster.period.archived", "roster_period", id, "archived");
  return ok(c, { archived: true });
});

rosterRoutes.get("/weekly", requirePermission("roster.view"), async (c) => {
  const data = await getWeeklyData(c);
  if ("error" in data) return fail(c, 400, "VALIDATION_ERROR", data.error ?? "Unable to load weekly roster.");
  return ok(c, data);
});

rosterRoutes.post("/weekly/save", requirePermission("roster.manage"), async (c) => {
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
    if (result.error) return fail(c, 400, "VALIDATION_ERROR", result.error);
    saved.push(result.assignment);
    if (result.warning) warnings.push({ employee_id: assignment.employee_id, roster_date: assignment.roster_date, warning: result.warning });
  }
  await auditRoster(c, { action: "roster.assignment.batch_saved", entityType: "roster_period", entityId: String(period.id), newValue: { count: saved.length }, reason });
  await publishRoster(c, "roster.week.saved", "roster_period", String(period.id), "saved");
  return ok(c, { period: await getPeriod(c, String(period.id)), assignments: saved, warnings });
});

rosterRoutes.post("/weekly/copy-previous", requirePermission("roster.manage"), async (c) => {
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

rosterRoutes.post("/weekly/clear", requirePermission("roster.manage"), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const weekStart = readString(body.week_start_date);
  const reason = optionalString(body.reason);
  if (!isDate(weekStart) || !reason) return fail(c, 400, "VALIDATION_ERROR", "Week start date and reason are required.");
  const period = await findPeriod(c, weekStart, optionalString(body.location_id), optionalString(body.department_id));
  if (!period) return fail(c, 404, "NOT_FOUND", "Roster period was not found.");
  const editError = await canEditPeriod(c, period, reason);
  if (editError) return fail(c, 403, "PUBLISHED_ROSTER_LOCKED", editError);
  await c.env.DB.prepare("UPDATE roster_assignments SET status = 'UNASSIGNED', shift_template_id = NULL, custom_start_time = NULL, custom_end_time = NULL, notes = NULL, source = 'SYSTEM', updated_by_user_id = ?, updated_at = ? WHERE roster_period_id = ?").bind(c.get("currentUser").id, new Date().toISOString(), period.id).run();
  await auditRoster(c, { action: "roster.week.cleared", entityType: "roster_period", entityId: String(period.id), reason });
  await publishRoster(c, "roster.week.cleared", "roster_period", String(period.id), "cleared");
  return ok(c, { cleared: true });
});

rosterRoutes.get("/weekly-off-rules", requirePermission("roster.view"), async (c) => {
  const rows = await c.env.DB.prepare("SELECT wor.*, l.name AS location_name, d.name AS department_name FROM weekly_off_rules wor LEFT JOIN locations l ON l.id = wor.location_id LEFT JOIN departments d ON d.id = wor.department_id ORDER BY wor.is_active DESC, wor.day_of_week, l.name, d.name").all();
  return ok(c, { rules: rows.results });
});

rosterRoutes.post("/weekly-off-rules", requirePermission("roster.settings.manage"), async (c) => {
  const input = readWeeklyOffRuleInput(await readJsonBody(c.req.raw));
  if (!input.day_of_week) return fail(c, 400, "VALIDATION_ERROR", "A valid day of week is required.");
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO weekly_off_rules (id, location_id, department_id, day_of_week, is_active) VALUES (?, ?, ?, ?, ?)").bind(id, input.location_id, input.department_id, input.day_of_week, input.is_active ? 1 : 0).run();
  const saved = await getWeeklyOffRule(c, id);
  await auditRoster(c, { action: "roster.weekly_off_rule.created", entityType: "weekly_off_rule", entityId: id, newValue: saved });
  await publishRoster(c, "roster.weekly_off_rule.changed", "weekly_off_rule", id, "created");
  return ok(c, { rule: saved }, 201);
});

rosterRoutes.patch("/weekly-off-rules/:id", requirePermission("roster.settings.manage"), async (c) => {
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

rosterRoutes.post("/weekly-off-rules/:id/enable", requirePermission("roster.settings.manage"), (c) => weeklyOffRuleAction(c, true));
rosterRoutes.post("/weekly-off-rules/:id/disable", requirePermission("roster.settings.manage"), (c) => weeklyOffRuleAction(c, false));

rosterRoutes.get("/assignments", requirePermission("roster.view"), async (c) => {
  const weekStart = readString(c.req.query("week_start_date"));
  const conditions: string[] = [];
  const params: BindValue[] = [];
  if (weekStart && isDate(weekStart)) { conditions.push("ra.roster_date BETWEEN ? AND ?"); params.push(weekStart, weekEnd(weekStart)); }
  const employeeId = readString(c.req.query("employee_id"));
  if (employeeId) { conditions.push("ra.employee_id = ?"); params.push(employeeId); }
  const rows = await c.env.DB.prepare(`SELECT ra.*, st.code AS shift_code, st.name AS shift_name, e.employee_no, e.full_name AS employee_name FROM roster_assignments ra INNER JOIN employees e ON e.id = ra.employee_id LEFT JOIN shift_templates st ON st.id = ra.shift_template_id ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY ra.roster_date DESC LIMIT 500`).bind(...params).all();
  return ok(c, { assignments: rows.results });
});

rosterRoutes.get("/assignments/:id", requirePermission("roster.view"), async (c) => {
  const assignment = await getAssignment(c, routeParam(c, "id"));
  if (!assignment) return fail(c, 404, "NOT_FOUND", "Roster assignment was not found.");
  return ok(c, { assignment });
});

rosterRoutes.patch("/assignments/:id", requirePermission("roster.manage"), async (c) => {
  const old = await getAssignment(c, routeParam(c, "id"));
  if (!old) return fail(c, 404, "NOT_FOUND", "Roster assignment was not found.");
  const period = await getPeriod(c, String(old.roster_period_id));
  if (!period) return fail(c, 404, "NOT_FOUND", "Roster period was not found.");
  const body = await readJsonBody(c.req.raw);
  const editError = await canEditPeriod(c, period, optionalString(body.reason));
  if (editError) return fail(c, 403, "PUBLISHED_ROSTER_LOCKED", editError);
  const result = await saveAssignment(c, period, { ...old, ...body });
  if (result.error) return fail(c, 400, "VALIDATION_ERROR", result.error);
  return ok(c, { assignment: result.assignment, warning: result.warning });
});

rosterRoutes.post("/assignments/batch", requirePermission("roster.manage"), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const period = await getPeriod(c, readString(body.roster_period_id));
  if (!period) return fail(c, 404, "NOT_FOUND", "Roster period was not found.");
  const editError = await canEditPeriod(c, period, optionalString(body.reason));
  if (editError) return fail(c, 403, "PUBLISHED_ROSTER_LOCKED", editError);
  const assignments = Array.isArray(body.assignments) ? body.assignments as Record<string, unknown>[] : [];
  const saved = [];
  for (const assignment of assignments) {
    const result = await saveAssignment(c, period, { ...assignment, reason: body.reason });
    if (result.error) return fail(c, 400, "VALIDATION_ERROR", result.error);
    saved.push(result.assignment);
  }
  return ok(c, { assignments: saved });
});

rosterRoutes.get("/dashboard", requirePermission("roster.view"), async (c) => {
  const today = new Date().toISOString().slice(0, 10);
  const day = new Date(`${today}T00:00:00Z`).getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = addDays(today, mondayOffset);
  const row = await c.env.DB.prepare(
    `SELECT
      (SELECT status FROM roster_periods WHERE week_start_date = ? AND status != 'ARCHIVED' ORDER BY updated_at DESC LIMIT 1) AS current_week_status,
      (SELECT COUNT(DISTINCT employee_id) FROM roster_assignments WHERE roster_date BETWEEN ? AND ? AND status = 'SCHEDULED') AS employees_scheduled_this_week,
      (SELECT COUNT(*) FROM roster_assignments WHERE roster_date BETWEEN ? AND ? AND status = 'UNASSIGNED') AS unassigned_assignments_this_week,
      (SELECT COUNT(*) FROM roster_assignments WHERE roster_date BETWEEN ? AND ? AND status = 'LEAVE') AS employees_on_leave_this_week,
      (SELECT COUNT(*) FROM roster_assignments WHERE roster_date BETWEEN ? AND ? AND status = 'OFF') AS off_day_count,
      (SELECT published_at FROM roster_periods WHERE status = 'PUBLISHED' ORDER BY published_at DESC LIMIT 1) AS recently_published_at`
  ).bind(monday, monday, weekEnd(monday), monday, weekEnd(monday), monday, weekEnd(monday), monday, weekEnd(monday)).first();
  return ok(c, { ...(row ?? {}), roster_conflicts: 0 });
});

rosterRoutes.get("/reports", requirePermission("roster.reports.view"), async (c) => {
  const weekStart = readString(c.req.query("week_start_date"));
  const from = weekStart && isDate(weekStart) ? weekStart : addDays(new Date().toISOString().slice(0, 10), -7);
  const to = weekStart && isDate(weekStart) ? weekEnd(weekStart) : new Date().toISOString().slice(0, 10);
  const status = readString(c.req.query("status")).toUpperCase();
  const statusFilter = ASSIGNMENT_STATUSES.has(status) ? status : "";
  const conditions = ["e.archived_at IS NULL"];
  const params: BindValue[] = [from, to];
  if (statusFilter) params.push(statusFilter);
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

rosterRoutes.get("/reports/export.csv", requirePermission("roster.reports.export"), async (c) => {
  const weekStart = readString(c.req.query("week_start_date"));
  const from = weekStart && isDate(weekStart) ? weekStart : addDays(new Date().toISOString().slice(0, 10), -7);
  const to = weekStart && isDate(weekStart) ? weekEnd(weekStart) : new Date().toISOString().slice(0, 10);
  const conditions = ["ra.roster_date BETWEEN ? AND ?"];
  const params: BindValue[] = [from, to];
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
  const rows = await c.env.DB.prepare(`${rosterAssignmentSelect("WHERE ra.employee_id = ?")} ORDER BY ra.roster_date DESC LIMIT 120`).bind(routeParam(c, "employeeId")).all();
  return ok(c, { assignments: rows.results });
});

employeeRosterRoutes.get("/:employeeId/roster/current-week", requireAnyPermission(["employees.roster.view", "roster.view"]), async (c) => {
  const today = new Date().toISOString().slice(0, 10);
  const day = new Date(`${today}T00:00:00Z`).getUTCDay();
  const monday = addDays(today, day === 0 ? -6 : 1 - day);
  const rows = await c.env.DB.prepare(`${rosterAssignmentSelect("WHERE ra.employee_id = ? AND ra.roster_date BETWEEN ? AND ?")} ORDER BY ra.roster_date`).bind(routeParam(c, "employeeId"), monday, weekEnd(monday)).all();
  return ok(c, { week_start_date: monday, week_end_date: weekEnd(monday), assignments: rows.results });
});

employeeRosterRoutes.get("/:employeeId/roster/history", requireAnyPermission(["employees.roster.view", "roster.view"]), async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM roster_assignment_history WHERE employee_id = ? ORDER BY created_at DESC LIMIT 100").bind(routeParam(c, "employeeId")).all();
  return ok(c, { history: rows.results });
});

employeeRosterRoutes.get("/:employeeId/roster/summary", requireAnyPermission(["employees.roster.view", "roster.view"]), async (c) => {
  const employeeId = routeParam(c, "employeeId");
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
