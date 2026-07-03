import { canAccessEmployee } from "../auth/access-scopes";
import type { AuthUser, Env } from "../types";
import { nowIso } from "./http";
import { isOperationalModuleEnabled } from "./module-enforcement";

export type AppEventVisibility = "USER" | "ROLE" | "COMPANY" | "SYSTEM";

export type AppEventInput = {
  eventType: string;
  moduleKey?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  companyScopeId?: string | null;
  userScopeId?: string | null;
  roleScopeKey?: string | null;
  visibility?: AppEventVisibility | null;
  payload?: Record<string, unknown> | null;
  queryKeys?: string[] | null;
  dedupeKey?: string | null;
  createdByUserId?: string | null;
  expiresAt?: string | null;
  isSensitive?: boolean;
};

export type AppEventDeliveryMode = "sse" | "fetch_stream" | "polling_fallback";

export type LiveEventStreamConfig = {
  enabled: boolean;
  requestedMode: string;
  activeMode: AppEventDeliveryMode;
  heartbeatSeconds: number;
  heartbeatMs: number;
  maxDurationSeconds: number;
  maxDurationMs: number;
  pollIntervalMs: number;
  reconnectBaseMs: number;
  reconnectMaxMs: number;
  batchLimit: number;
};

export type AppEventRow = {
  id: string;
  event_type: string;
  module_key: string | null;
  entity_type: string | null;
  entity_id: string | null;
  company_scope_id: string | null;
  user_scope_id: string | null;
  role_scope_key: string | null;
  visibility: AppEventVisibility;
  payload_json: string | null;
  query_keys_json: string | null;
  dedupe_key: string | null;
  created_by_user_id: string | null;
  created_at: string;
  expires_at: string | null;
  delivered_at: string | null;
  is_sensitive: number | null;
};

const DEFAULT_COMPANY_SCOPE_ID = "default-company";
const DEFAULT_EVENT_TTL_MS = 48 * 60 * 60 * 1000;
const DEDUPE_WINDOW_MS = 10 * 1000;
const MAX_EVENTS_PER_FETCH = 100;
const MAX_STRING_LENGTH = 160;
const SENSITIVE_EVENT_KEY = /(password|token|secret|credential|document_number|file|raw|account|iban|swift|salary|amount|payload|contents|private|hash|r2_key|storage_key|bank|net_salary|gross_salary|deduction|allowance)/i;
const DEFAULT_LIVE_EVENT_POLL_INTERVAL_MS = 10000;
const DEFAULT_LIVE_EVENT_HEARTBEAT_SECONDS = 20;
const DEFAULT_LIVE_EVENT_MAX_DURATION_SECONDS = 300;
const DEFAULT_RECONNECT_BASE_MS = 2000;
const DEFAULT_RECONNECT_MAX_MS = 30000;
const APP_EVENT_SELECT_COLUMNS = `
  id, event_type, module_key, entity_type, entity_id, company_scope_id,
  user_scope_id, role_scope_key, visibility, payload_json, query_keys_json,
  dedupe_key, created_by_user_id, created_at, expires_at, delivered_at, is_sensitive
`;

const MODULE_PERMISSIONS: Record<string, string[]> = {
  notifications: ["notifications.view", "self_service.notifications.view", "notifications.manage"],
  background_jobs: ["background_jobs.view", "background_jobs.manage", "admin.system_health.view"],
  onboarding: ["onboarding.cases.view", "onboarding.workspace.view", "employees.lifecycle.view"],
  documents: ["documents.view", "documents.checklist.view", "documents.compliance.view", "self_service.documents.compliance.view"],
  document_compliance: ["documents.compliance.view", "self_service.documents.compliance.view"],
  employees: ["employees.view"],
  employee_360: ["employees.view"],
  attendance: ["attendance.view", "employees.attendance.view", "self_service.attendance.view"],
  payroll: ["payroll.view", "employees.payroll.view", "self_service.payroll.view"],
  reports: ["reports.view"],
  reports_exports: ["reports.view"],
  data_import: ["data_import.view", "data_transfer.settings.view"],
  data_export: ["data_export.view", "data_transfer.settings.view"],
  data_transfer: ["data_import.view", "data_export.view", "data_transfer.settings.view"],
  dashboard: ["dashboard.view", "employees.view"],
  admin: ["admin.settings_hub.view", "admin.modules.view", "settings.view"],
  settings: ["settings.view", "admin.settings_hub.view", "admin.modules.view"],
  module_visibility: ["admin.modules.view", "admin.settings_hub.view", "settings.view"],
  system: ["admin.system_health.view", "settings.view"]
};

function normalizeModuleKey(value: string | null | undefined) {
  const key = String(value ?? "").trim();
  if (!key) return "general";
  if (key === "data_export" || key === "data_import") return key;
  if (key === "report") return "reports";
  if (key === "assets") return "assets_uniforms";
  return key;
}

function boolEnv(value: string | undefined, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on", "enabled"].includes(String(value).trim().toLowerCase());
}

function boundedNumber(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

export function getLiveEventStreamConfig(env: Env): LiveEventStreamConfig {
  const requestedMode = String(env.HRM_LIVE_EVENTS_MODE ?? "auto").trim().toLowerCase();
  const enabled = boolEnv(env.HRM_LIVE_EVENTS_ENABLED, true);
  const heartbeatSeconds = boundedNumber(env.HRM_LIVE_EVENTS_HEARTBEAT_SECONDS, DEFAULT_LIVE_EVENT_HEARTBEAT_SECONDS, 10, 60);
  const maxDurationSeconds = boundedNumber(env.HRM_LIVE_EVENTS_MAX_DURATION_SECONDS, DEFAULT_LIVE_EVENT_MAX_DURATION_SECONDS, 60, 900);
  const pollIntervalMs = boundedNumber(env.HRM_LIVE_EVENTS_POLL_INTERVAL_MS, DEFAULT_LIVE_EVENT_POLL_INTERVAL_MS, 5000, 60000);
  const reconnectBaseMs = boundedNumber(env.HRM_LIVE_EVENTS_RECONNECT_BASE_MS, DEFAULT_RECONNECT_BASE_MS, 500, 30000);
  const reconnectMaxMs = boundedNumber(env.HRM_LIVE_EVENTS_RECONNECT_MAX_MS, DEFAULT_RECONNECT_MAX_MS, reconnectBaseMs, 120000);
  let activeMode: AppEventDeliveryMode = "polling_fallback";
  if (enabled) {
    if (requestedMode === "sse") activeMode = "sse";
    else if (requestedMode === "fetch_stream" || requestedMode === "stream" || requestedMode === "auto") activeMode = "fetch_stream";
  }
  return {
    enabled,
    requestedMode,
    activeMode,
    heartbeatSeconds,
    heartbeatMs: heartbeatSeconds * 1000,
    maxDurationSeconds,
    maxDurationMs: maxDurationSeconds * 1000,
    pollIntervalMs,
    reconnectBaseMs,
    reconnectMaxMs,
    batchLimit: 50
  };
}

function truncate(value: string, max = MAX_STRING_LENGTH) {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function safeJsonParse(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean))).slice(0, 24);
}

export function sanitizeEventPayload(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return null;
  if (depth > 3) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeEventPayload(item, depth + 1));
  if (typeof value === "string") return truncate(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value !== "object") return null;

  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_EVENT_KEY.test(key)) {
      output[key] = "[redacted]";
      continue;
    }
    output[key] = sanitizeEventPayload(nested, depth + 1);
  }
  return output;
}

function jsonOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
  return JSON.stringify(value);
}

function futureIso(milliseconds: number) {
  return new Date(Date.now() + milliseconds).toISOString();
}

export function buildEventScope(input: AppEventInput) {
  const userScopeId = input.userScopeId?.trim() || null;
  const roleScopeKey = input.roleScopeKey?.trim() || null;
  const visibility: AppEventVisibility = input.visibility
    ?? (userScopeId ? "USER" : roleScopeKey ? "ROLE" : "COMPANY");
  return {
    visibility,
    userScopeId,
    roleScopeKey,
    companyScopeId: input.companyScopeId?.trim() || DEFAULT_COMPANY_SCOPE_ID
  };
}

export function eventQueryFamilies(input: Pick<AppEventInput, "eventType" | "moduleKey" | "entityType" | "entityId" | "payload">) {
  const eventType = input.eventType;
  const moduleKey = normalizeModuleKey(input.moduleKey);
  const payload = input.payload ?? {};
  const families = new Set<string>(["background-jobs"]);

  if (eventType.startsWith("notification.")) {
    families.add("notifications");
    families.add("notifications.unread");
  }
  if (eventType.startsWith("document.") || moduleKey === "documents" || moduleKey === "document_compliance") {
    families.add("documents");
    families.add("document-checklist");
    families.add("employee-document-summary");
  }
  if (eventType.startsWith("onboarding.") || moduleKey === "onboarding" || payload.onboarding_case_id) {
    families.add("onboarding.workspace");
    families.add("onboarding.readiness");
  }
  if (eventType.startsWith("employee.") || moduleKey === "employees" || input.entityType === "employee" || payload.employee_id) {
    families.add("employees");
    families.add("employee.profile");
  }
  if (eventType.startsWith("report.") || moduleKey === "reports") families.add("reports");
  if (eventType.startsWith("import.") || moduleKey === "data_import") families.add("data_import");
  if (moduleKey === "data_export") families.add("data_export");
  if (eventType.startsWith("dashboard.") || moduleKey === "dashboard") families.add("dashboard.command-center");
  if (eventType.startsWith("attendance.") || moduleKey === "attendance") families.add("attendance");
  if (eventType.startsWith("payroll.") || moduleKey === "payroll") families.add("payroll");
  if (eventType.startsWith("module.") || eventType.includes("settings") || moduleKey === "module_visibility" || moduleKey === "settings" || moduleKey === "admin") {
    families.add("module-visibility");
    families.add("auth.me");
    families.add("dashboard.command-center");
  }

  return [...families];
}

export async function dedupeAppEvent(db: Env["DB"], dedupeKey: string | null | undefined) {
  const key = String(dedupeKey ?? "").trim();
  if (!key) return null;
  const since = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();
  return db.prepare(
    `SELECT id FROM app_events
     WHERE dedupe_key = ? AND created_at >= ?
     ORDER BY created_at DESC
     LIMIT 1`
  ).bind(key, since).first<{ id: string }>();
}

export async function emitAppEvent(db: Env["DB"], input: AppEventInput) {
  const eventType = String(input.eventType ?? "").trim();
  if (!eventType) return null;
  const moduleKey = normalizeModuleKey(input.moduleKey ?? input.eventType.split(".")[0]);
  const scope = buildEventScope(input);
  const dedupeKey = input.dedupeKey?.trim() || `${eventType}:${input.entityType ?? "none"}:${input.entityId ?? "none"}:${scope.userScopeId ?? scope.roleScopeKey ?? scope.companyScopeId}`;
  const duplicate = await dedupeAppEvent(db, dedupeKey);
  if (duplicate) return duplicate.id;

  const payload = sanitizeEventPayload({
    ...(input.payload ?? {}),
    event_type: eventType,
    module_key: moduleKey,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null
  });
  const queryKeys = safeStringArray(input.queryKeys?.length ? input.queryKeys : eventQueryFamilies({ ...input, moduleKey }));
  const id = `app_event_${crypto.randomUUID()}`;
  await db.prepare(
    `INSERT INTO app_events
      (id, event_type, module_key, entity_type, entity_id, company_scope_id, user_scope_id, role_scope_key,
       visibility, payload_json, query_keys_json, dedupe_key, created_by_user_id, created_at, expires_at, is_sensitive)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    eventType,
    moduleKey,
    input.entityType ?? null,
    input.entityId ?? null,
    scope.companyScopeId,
    scope.userScopeId,
    scope.roleScopeKey,
    scope.visibility,
    jsonOrNull(payload),
    jsonOrNull(queryKeys),
    dedupeKey,
    input.createdByUserId ?? null,
    nowIso(),
    input.expiresAt ?? futureIso(DEFAULT_EVENT_TTL_MS),
    input.isSensitive ? 1 : 0
  ).run();
  return id;
}

export async function safeEmitAppEvent(db: Env["DB"], input: AppEventInput) {
  try {
    return await emitAppEvent(db, input);
  } catch (error) {
    console.warn(JSON.stringify({
      level: "warn",
      event: "app_event.emit_failed",
      event_type: input.eventType,
      module_key: input.moduleKey ?? null,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      message: error instanceof Error ? error.message.slice(0, 180) : "Unknown app-event error"
    }));
    return null;
  }
}

export function emitQueryInvalidationEvent(db: Env["DB"], input: AppEventInput) {
  return safeEmitAppEvent(db, {
    ...input,
    queryKeys: input.queryKeys?.length ? input.queryKeys : eventQueryFamilies(input)
  });
}

function hasAny(user: AuthUser, permissions: string[]) {
  return Boolean(user.is_owner || permissions.some((permission) => user.permissions.includes(permission)));
}

function eventEmployeeId(row: AppEventRow, payload: Record<string, unknown>) {
  if (row.entity_type === "employee" && row.entity_id) return row.entity_id;
  const employeeId = payload.employee_id ?? payload.employeeId;
  return typeof employeeId === "string" && employeeId ? employeeId : null;
}

export async function canUserReceiveEvent(db: Env["DB"], user: AuthUser, row: AppEventRow) {
  if (user.is_owner) return true;
  const moduleKey = normalizeModuleKey(row.module_key);
  if (!(await isOperationalModuleEnabled(db, moduleKey))) return false;

  if (row.visibility === "USER") {
    return row.user_scope_id === user.id || (Boolean(user.employee_id) && row.user_scope_id === user.employee_id);
  }
  if (row.visibility === "ROLE") {
    return Boolean(row.role_scope_key && user.roles.includes(row.role_scope_key));
  }

  const modulePermissions = MODULE_PERMISSIONS[moduleKey] ?? MODULE_PERMISSIONS[row.event_type.split(".")[0]] ?? [];
  if (modulePermissions.length && !hasAny(user, modulePermissions)) return false;

  const payload = (sanitizeEventPayload(safeJsonParse(row.payload_json)) ?? {}) as Record<string, unknown>;
  const employeeId = eventEmployeeId(row, payload);
  if (employeeId) {
    try {
      return await canAccessEmployee(db, user, employeeId, moduleKey === "general" ? "employees" : moduleKey, "view");
    } catch {
      return false;
    }
  }

  return row.visibility === "COMPANY" || row.visibility === "SYSTEM";
}

export function sanitizeEventForUser(row: AppEventRow) {
  const payload = row.is_sensitive === 1 ? {} : sanitizeEventPayload(safeJsonParse(row.payload_json)) ?? {};
  return {
    id: row.id,
    event_type: row.event_type,
    module_key: row.module_key ?? "general",
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    visibility: row.visibility,
    payload,
    query_keys: safeStringArray(safeJsonParse(row.query_keys_json)),
    created_at: row.created_at,
    cursor: row.created_at
  };
}

export async function listAppEventsSince(db: Env["DB"], user: AuthUser, input: { cursor?: string | null; limit?: number | null }) {
  const parsedLimit = Math.trunc(Number(input.limit ?? 50));
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), MAX_EVENTS_PER_FETCH) : 50;
  const cursor = input.cursor && /^\d{4}-\d{2}-\d{2}T/.test(input.cursor)
    ? input.cursor
    : new Date(Date.now() - 30 * 1000).toISOString();
  const rows = await db.prepare(
    `SELECT ${APP_EVENT_SELECT_COLUMNS}
     FROM app_events
     WHERE company_scope_id = ?
       AND created_at > ?
       AND (expires_at IS NULL OR expires_at > ?)
       AND (
         visibility IN ('COMPANY', 'SYSTEM')
         OR (visibility = 'USER' AND user_scope_id = ?)
         OR (visibility = 'ROLE' AND role_scope_key IN (${user.roles.length ? user.roles.map(() => "?").join(", ") : "?"}))
       )
     ORDER BY created_at ASC
     LIMIT ?`
  ).bind(
    DEFAULT_COMPANY_SCOPE_ID,
    cursor,
    nowIso(),
    user.id,
    ...(user.roles.length ? user.roles : ["__no_role__"]),
    limit * 2
  ).all<AppEventRow>();

  const events = [];
  for (const row of rows.results) {
    if (!(await canUserReceiveEvent(db, user, row))) continue;
    events.push(sanitizeEventForUser(row));
    if (events.length >= limit) break;
  }
  const nextCursor = events.at(-1)?.created_at ?? cursor;
  return { events, nextCursor };
}

export async function cleanupExpiredEvents(db: Env["DB"]) {
  try {
    await db.prepare("DELETE FROM app_events WHERE expires_at IS NOT NULL AND expires_at < ?").bind(nowIso()).run();
  } catch (error) {
    console.warn(JSON.stringify({
      level: "warn",
      event: "app_event.cleanup_failed",
      message: error instanceof Error ? error.message.slice(0, 180) : "Unknown cleanup error"
    }));
  }
}

export async function getAppEventStreamHealth(db: Env["DB"], env: Env) {
  const config = getLiveEventStreamConfig(env);
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const now = nowIso();
  const [recent, backlog, modules] = await Promise.all([
    db.prepare(
      `SELECT COUNT(*) AS count, MAX(created_at) AS last_event_at
       FROM app_events
       WHERE created_at >= ?
         AND (expires_at IS NULL OR expires_at > ?)`
    ).bind(since, now).first<{ count: number | null; last_event_at: string | null }>(),
    db.prepare(
      `SELECT COUNT(*) AS count
       FROM app_events
       WHERE (expires_at IS NULL OR expires_at > ?)`
    ).bind(now).first<{ count: number | null }>(),
    db.prepare(
      `SELECT module_key, COUNT(*) AS count, MAX(created_at) AS last_event_at
       FROM app_events
       WHERE created_at >= ?
         AND (expires_at IS NULL OR expires_at > ?)
       GROUP BY module_key
       ORDER BY count DESC
       LIMIT 12`
    ).bind(since, now).all<{ module_key: string | null; count: number; last_event_at: string | null }>()
  ]);

  return {
    enabled: config.enabled,
    requested_mode: config.requestedMode,
    active_mode: config.activeMode,
    stream_endpoint_enabled: config.activeMode !== "polling_fallback",
    heartbeat_seconds: config.heartbeatSeconds,
    max_duration_seconds: config.maxDurationSeconds,
    poll_interval_ms: config.pollIntervalMs,
    reconnect_base_ms: config.reconnectBaseMs,
    reconnect_max_ms: config.reconnectMaxMs,
    recent_event_count: Number(recent?.count ?? 0),
    last_event_at: recent?.last_event_at ?? null,
    d1_event_backlog_count: Number(backlog?.count ?? 0),
    recent_event_modules: modules.results.map((row) => ({
      module_key: row.module_key ?? "general",
      count: row.count,
      last_event_at: row.last_event_at
    })),
    recent_event_errors: [] as Array<Record<string, unknown>>,
    expired_app_event_cleanup_status: "scheduled_by_poll_and_stream",
    payload_privacy: "sanitized_payloads_only"
  };
}
