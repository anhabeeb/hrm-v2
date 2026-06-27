import { Hono } from "hono";
import type { Context } from "hono";
import { canAccessEmployee } from "../auth/access-scopes";
import { recordAudit } from "../db/audit";
import { requireAuth } from "../middleware/auth";
import type { AppBindings, AuthUser, Env } from "../types";
import { fail, getClientIp, ok } from "../utils/http";
import { readJsonBody } from "../utils/validation";

type Row = Record<string, unknown>;

export const notificationRoutes = new Hono<AppBindings>();
notificationRoutes.use("*", requireAuth);

const NOTIFICATION_LIMIT_DEFAULT = 20;
const NOTIFICATION_LIMIT_MAX = 100;

function hasAny(user: AuthUser, permissions: string[]) {
  return user.is_owner || permissions.some((permission) => user.permissions.includes(permission));
}

function boundedLimit(value: unknown) {
  const parsed = Number(value ?? NOTIFICATION_LIMIT_DEFAULT);
  if (!Number.isFinite(parsed)) return NOTIFICATION_LIMIT_DEFAULT;
  return Math.max(1, Math.min(NOTIFICATION_LIMIT_MAX, Math.trunc(parsed)));
}

function safeNotificationRoute(route: unknown) {
  const text = String(route ?? "").trim();
  if (!text || !text.startsWith("/") || text.startsWith("//") || /^\/?https?:/i.test(text)) return null;
  return text;
}

function runtimeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 220);
  return String(error ?? "Unknown runtime error").slice(0, 220);
}

function logNotificationRuntimeError(input: { area: string; error: unknown; userId?: string | null }) {
  console.warn(JSON.stringify({
    level: "warn",
    endpoint: "/api/v1/notifications",
    area: input.area,
    error_message: runtimeErrorMessage(input.error),
    user_id: input.userId ?? null,
    timestamp: new Date().toISOString()
  }));
}

async function withNotificationRuntimeError(c: Context<AppBindings>, area: string, action: () => Promise<Response> | Response) {
  try {
    return await action();
  } catch (error) {
    logNotificationRuntimeError({ area, error, userId: c.get("currentUser")?.id ?? null });
    return fail(c, 503, "NOTIFICATIONS_RUNTIME_ERROR", "Notifications are temporarily unavailable.");
  }
}

async function isModuleEnabled(db: Env["DB"], moduleKey: string) {
  try {
    const row = await db.prepare("SELECT is_enabled, status FROM module_control_settings WHERE module_key = ?").bind(moduleKey).first<{ is_enabled: number; status: string }>();
    if (!row) return true;
    return Number(row.is_enabled ?? 1) === 1 && String(row.status ?? "ACTIVE") !== "DISABLED";
  } catch (error) {
    logNotificationRuntimeError({ area: `module:${moduleKey}`, error });
    return true;
  }
}

function notificationToApi(row: Row) {
  return {
    id: String(row.id),
    recipient_user_id: row.recipient_user_id ? String(row.recipient_user_id) : null,
    recipient_employee_id: row.recipient_employee_id ? String(row.recipient_employee_id) : null,
    employee_id: row.employee_id ? String(row.employee_id) : null,
    module_key: String(row.module_key ?? "general"),
    entity_type: row.entity_type ? String(row.entity_type) : null,
    entity_id: row.entity_id ? String(row.entity_id) : null,
    title: String(row.title ?? "Notification"),
    message: String(row.message ?? ""),
    severity: String(row.severity ?? "INFO"),
    notification_type: String(row.notification_type ?? "GENERAL"),
    route: safeNotificationRoute(row.route),
    is_read: Number(row.is_read ?? 0) === 1,
    read_at: row.read_at ? String(row.read_at) : null,
    created_at: String(row.created_at ?? ""),
    metadata: parseMetadata(row.metadata_json)
  };
}

function parseMetadata(value: unknown) {
  if (!value) return null;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

export function getNotificationRouteForEntity(input: { module_key?: string | null; entity_type?: string | null; entity_id?: string | null; route?: string | null }) {
  const explicit = safeNotificationRoute(input.route);
  if (explicit) return explicit;
  const type = String(input.entity_type ?? "");
  const id = String(input.entity_id ?? "");
  if (type === "employee" && id) return `/employees/${id}`;
  if (type === "payroll_run" && id) return `/payroll/runs/${id}`;
  if (type === "approval") return "/approvals";
  if (type === "onboarding_case") return "/onboarding/cases";
  if (type === "offboarding_case") return "/offboarding/cases";
  if (type === "document") return "/documents/registry";
  if (type === "contract") return "/contracts";
  if (type === "asset") return "/assets/assignments";
  return `/${String(input.module_key ?? "").replace(/_/g, "-")}` || "/";
}

export async function filterNotificationsByUserScope(db: Env["DB"], user: AuthUser, rows: Row[]) {
  const filtered: Row[] = [];
  const adminView = hasAny(user, ["notifications.admin.view", "notifications.manage"]);
  for (const row of rows) {
    const recipientUserId = row.recipient_user_id ? String(row.recipient_user_id) : null;
    const recipientEmployeeId = row.recipient_employee_id ? String(row.recipient_employee_id) : null;
    const employeeId = row.employee_id ? String(row.employee_id) : recipientEmployeeId;
    const ownNotification = recipientUserId === user.id || (user.employee_id && recipientEmployeeId === user.employee_id);
    if (ownNotification || user.is_owner) {
      filtered.push(row);
      continue;
    }
    if (!adminView) continue;
    try {
      if (!employeeId || await canAccessEmployee(db, user, employeeId, String(row.module_key ?? "employees"), "view")) {
        filtered.push(row);
      }
    } catch (error) {
      logNotificationRuntimeError({ area: "scope-filter", error, userId: user.id });
    }
  }
  return filtered;
}

async function baseNotificationRows(c: Context<AppBindings>, limit: number, filters: Record<string, string | undefined> = {}) {
  const user = c.get("currentUser");
  const conditions: string[] = [];
  const bindings: unknown[] = [];
  const adminView = hasAny(user, ["notifications.admin.view", "notifications.manage"]);
  if (!adminView) {
    conditions.push("(recipient_user_id = ? OR recipient_employee_id = ?)");
    bindings.push(user.id, user.employee_id ?? "__no_employee__");
  } else if (!user.is_owner) {
    conditions.push("(recipient_user_id = ? OR recipient_employee_id = ? OR recipient_user_id IS NULL)");
    bindings.push(user.id, user.employee_id ?? "__no_employee__");
  }
  if (filters.read === "read") conditions.push("is_read = 1");
  if (filters.read === "unread") conditions.push("is_read = 0");
  if (filters.module) {
    conditions.push("module_key = ?");
    bindings.push(filters.module);
  }
  if (filters.severity) {
    conditions.push("severity = ?");
    bindings.push(filters.severity);
  }
  if (filters.date_from) {
    conditions.push("date(created_at) >= date(?)");
    bindings.push(filters.date_from);
  }
  if (filters.date_to) {
    conditions.push("date(created_at) <= date(?)");
    bindings.push(filters.date_to);
  }
  bindings.push(limit);
  const rows = await c.env.DB
    .prepare(`SELECT * FROM notifications ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY created_at DESC LIMIT ?`)
    .bind(...bindings)
    .all<Row>();
  const enabledRows = [];
  for (const row of rows.results) {
    if (await isModuleEnabled(c.env.DB, String(row.module_key ?? "")) || hasAny(user, ["settings.view", "settings.manage", "admin.modules.view", "notifications.manage"])) {
      enabledRows.push(row);
    }
  }
  return filterNotificationsByUserScope(c.env.DB, user, enabledRows);
}

export async function getNotificationsForUser(c: Context<AppBindings>) {
  const limit = boundedLimit(c.req.query("limit"));
  const rows = await baseNotificationRows(c, limit, {
    read: c.req.query("read"),
    module: c.req.query("module"),
    severity: c.req.query("severity"),
    date_from: c.req.query("date_from"),
    date_to: c.req.query("date_to")
  });
  return rows.map(notificationToApi);
}

export async function getUnreadNotificationCount(c: Context<AppBindings>) {
  const rows = await baseNotificationRows(c, NOTIFICATION_LIMIT_MAX, { read: "unread" });
  return rows.length;
}

async function ensureCanUpdateNotification(c: Context<AppBindings>, notificationId: string) {
  const row = await c.env.DB.prepare("SELECT * FROM notifications WHERE id = ?").bind(notificationId).first<Row>();
  if (!row) return { row: null, response: fail(c, 404, "NOTIFICATION_NOT_FOUND", "Notification was not found.") };
  const scoped = await filterNotificationsByUserScope(c.env.DB, c.get("currentUser"), [row]);
  if (!scoped.length) return { row: null, response: fail(c, 404, "NOTIFICATION_NOT_FOUND", "Notification was not found.") };
  return { row, response: null };
}

export async function markNotificationRead(c: Context<AppBindings>, notificationId: string) {
  if (!hasAny(c.get("currentUser"), ["notifications.view", "notifications.manage", "self_service.notifications.update", "self_service.view"])) {
    return fail(c, 403, "NOTIFICATION_PERMISSION_DENIED", "You do not have permission to update notifications.");
  }
  const gate = await ensureCanUpdateNotification(c, notificationId);
  if (gate.response) return gate.response;
  await c.env.DB.prepare("UPDATE notifications SET is_read = 1, read_at = COALESCE(read_at, ?) WHERE id = ?").bind(new Date().toISOString(), notificationId).run();
  await recordAudit(c.env.DB, {
    actorUserId: c.get("currentUser").id,
    action: "notification.read",
    module: "notifications",
    entityType: "notification",
    entityId: notificationId,
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent")
  });
  return ok(c, { read: true });
}

export async function markAllNotificationsRead(c: Context<AppBindings>) {
  if (!hasAny(c.get("currentUser"), ["notifications.view", "notifications.manage", "self_service.notifications.update", "self_service.view"])) {
    return fail(c, 403, "NOTIFICATION_PERMISSION_DENIED", "You do not have permission to update notifications.");
  }
  const rows = await baseNotificationRows(c, NOTIFICATION_LIMIT_MAX, { read: "unread" });
  const ids = rows.map((row) => String(row.id));
  if (ids.length) {
    const placeholders = ids.map(() => "?").join(", ");
    await c.env.DB.prepare(`UPDATE notifications SET is_read = 1, read_at = COALESCE(read_at, ?) WHERE id IN (${placeholders})`).bind(new Date().toISOString(), ...ids).run();
  }
  await recordAudit(c.env.DB, {
    actorUserId: c.get("currentUser").id,
    action: "notifications.mark_all_read",
    module: "notifications",
    entityType: "notification",
    entityId: "bulk",
    newValue: { count: ids.length },
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent")
  });
  return ok(c, { read: true, count: ids.length });
}

export async function createNotificationForUser(db: Env["DB"], input: {
  userId: string;
  moduleKey: string;
  title: string;
  message: string;
  severity?: string;
  notificationType?: string;
  route?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  employeeId?: string | null;
  metadata?: unknown;
}) {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO notifications
       (id, recipient_user_id, module_key, entity_type, entity_id, employee_id, title, message, severity, notification_type, route, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, input.userId, input.moduleKey, input.entityType ?? null, input.entityId ?? null, input.employeeId ?? null, input.title, input.message, input.severity ?? "INFO", input.notificationType ?? "GENERAL", getNotificationRouteForEntity({ module_key: input.moduleKey, entity_type: input.entityType, entity_id: input.entityId, route: input.route }), input.metadata === undefined ? null : JSON.stringify(input.metadata))
    .run();
  return id;
}

export async function createNotificationForEmployee(db: Env["DB"], input: {
  employeeId: string;
  moduleKey: string;
  title: string;
  message: string;
  severity?: string;
  notificationType?: string;
  route?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: unknown;
}) {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO notifications
       (id, recipient_employee_id, employee_id, module_key, entity_type, entity_id, title, message, severity, notification_type, route, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, input.employeeId, input.employeeId, input.moduleKey, input.entityType ?? null, input.entityId ?? null, input.title, input.message, input.severity ?? "INFO", input.notificationType ?? "GENERAL", getNotificationRouteForEntity({ module_key: input.moduleKey, entity_type: input.entityType, entity_id: input.entityId, route: input.route }), input.metadata === undefined ? null : JSON.stringify(input.metadata))
    .run();
  return id;
}

notificationRoutes.get("/", (c) => withNotificationRuntimeError(c, "list", async () => {
  if (!hasAny(c.get("currentUser"), ["notifications.view", "notifications.admin.view", "notifications.manage", "self_service.notifications.view", "self_service.view"])) {
    return fail(c, 403, "NOTIFICATION_PERMISSION_DENIED", "You do not have permission to view notifications.");
  }
  return ok(c, { notifications: await getNotificationsForUser(c), unread_count: await getUnreadNotificationCount(c) });
}));

notificationRoutes.get("/unread-count", (c) => withNotificationRuntimeError(c, "unread-count", async () => {
  if (!hasAny(c.get("currentUser"), ["notifications.view", "notifications.admin.view", "notifications.manage", "self_service.notifications.view", "self_service.view"])) {
    return fail(c, 403, "NOTIFICATION_PERMISSION_DENIED", "You do not have permission to view notifications.");
  }
  return ok(c, { unread_count: await getUnreadNotificationCount(c) });
}));

notificationRoutes.post("/:notificationId/mark-read", (c) => withNotificationRuntimeError(c, "mark-read", () => markNotificationRead(c, c.req.param("notificationId"))));
notificationRoutes.post("/mark-all-read", (c) => withNotificationRuntimeError(c, "mark-all-read", () => markAllNotificationsRead(c)));

notificationRoutes.get("/preferences", (c) => withNotificationRuntimeError(c, "preferences", async () => {
  if (!hasAny(c.get("currentUser"), ["notifications.preferences.view", "notifications.view", "self_service.notifications.view"])) {
    return fail(c, 403, "NOTIFICATION_PERMISSION_DENIED", "You do not have permission to view notification preferences.");
  }
  const rows = await c.env.DB.prepare("SELECT * FROM notification_preferences WHERE user_id = ? ORDER BY module_key").bind(c.get("currentUser").id).all<Row>();
  return ok(c, { preferences: rows.results });
}));

notificationRoutes.patch("/preferences", (c) => withNotificationRuntimeError(c, "preferences-update", async () => {
  const user = c.get("currentUser");
  if (!hasAny(user, ["notifications.preferences.update", "notifications.manage", "self_service.notifications.update"])) {
    return fail(c, 403, "NOTIFICATION_PERMISSION_DENIED", "You do not have permission to update notification preferences.");
  }
  const body = await readJsonBody(c.req.raw);
  const moduleKey = String(body.module_key ?? "").trim();
  if (!moduleKey) return fail(c, 400, "VALIDATION_ERROR", "Module key is required.");
  const inAppEnabled = body.in_app_enabled === false || body.in_app_enabled === 0 ? 0 : 1;
  const emailPlaceholderEnabled = body.email_placeholder_enabled === true || body.email_placeholder_enabled === 1 ? 1 : 0;
  await c.env.DB
    .prepare(
      `INSERT INTO notification_preferences (id, user_id, module_key, in_app_enabled, email_placeholder_enabled, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, module_key) DO UPDATE SET in_app_enabled = excluded.in_app_enabled,
         email_placeholder_enabled = excluded.email_placeholder_enabled, updated_at = excluded.updated_at`
    )
    .bind(crypto.randomUUID(), user.id, moduleKey, inAppEnabled, emailPlaceholderEnabled, new Date().toISOString())
    .run();
  await recordAudit(c.env.DB, {
    actorUserId: user.id,
    action: "notification.preference.updated",
    module: "notifications",
    entityType: "notification_preference",
    entityId: `${user.id}:${moduleKey}`,
    newValue: { module_key: moduleKey, in_app_enabled: inAppEnabled, email_placeholder_enabled: emailPlaceholderEnabled },
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent")
  });
  return ok(c, { updated: true });
}));
