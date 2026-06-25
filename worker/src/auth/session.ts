import { recordAudit } from "../db/audit";
import type { AuthUser, Env, JwtPayload } from "../types";

export interface SecuritySessionSettings {
  session_timeout_minutes: number;
  idle_timeout_enabled: number;
  idle_timeout_minutes: number;
  warn_before_logout_seconds: number;
  extend_session_on_activity: number;
  apply_idle_timeout_to_admin: number;
  apply_idle_timeout_to_self_service: number;
  stricter_timeout_for_sensitive_pages: number;
  sensitive_page_idle_timeout_minutes: number;
  audit_timeout_logout: number;
}

const DEFAULT_SECURITY_SESSION_SETTINGS: SecuritySessionSettings = {
  session_timeout_minutes: 480,
  idle_timeout_enabled: 1,
  idle_timeout_minutes: 15,
  warn_before_logout_seconds: 60,
  extend_session_on_activity: 1,
  apply_idle_timeout_to_admin: 1,
  apply_idle_timeout_to_self_service: 1,
  stricter_timeout_for_sensitive_pages: 1,
  sensitive_page_idle_timeout_minutes: 10,
  audit_timeout_logout: 1
};

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function flagValue(value: unknown, fallback: number) {
  if (value === undefined || value === null || value === "") return fallback;
  return value === true || value === 1 || value === "1" || value === "true" ? 1 : 0;
}

export async function getSecuritySessionSettings(db: Env["DB"]): Promise<SecuritySessionSettings> {
  const row = await db.prepare("SELECT * FROM security_settings LIMIT 1").first<Record<string, unknown>>();
  return {
    session_timeout_minutes: numberValue(row?.session_timeout_minutes, DEFAULT_SECURITY_SESSION_SETTINGS.session_timeout_minutes),
    idle_timeout_enabled: flagValue(row?.idle_timeout_enabled, DEFAULT_SECURITY_SESSION_SETTINGS.idle_timeout_enabled),
    idle_timeout_minutes: numberValue(row?.idle_timeout_minutes, DEFAULT_SECURITY_SESSION_SETTINGS.idle_timeout_minutes),
    warn_before_logout_seconds: numberValue(row?.warn_before_logout_seconds, DEFAULT_SECURITY_SESSION_SETTINGS.warn_before_logout_seconds),
    extend_session_on_activity: flagValue(row?.extend_session_on_activity, DEFAULT_SECURITY_SESSION_SETTINGS.extend_session_on_activity),
    apply_idle_timeout_to_admin: flagValue(row?.apply_idle_timeout_to_admin, DEFAULT_SECURITY_SESSION_SETTINGS.apply_idle_timeout_to_admin),
    apply_idle_timeout_to_self_service: flagValue(row?.apply_idle_timeout_to_self_service, DEFAULT_SECURITY_SESSION_SETTINGS.apply_idle_timeout_to_self_service),
    stricter_timeout_for_sensitive_pages: flagValue(row?.stricter_timeout_for_sensitive_pages, DEFAULT_SECURITY_SESSION_SETTINGS.stricter_timeout_for_sensitive_pages),
    sensitive_page_idle_timeout_minutes: numberValue(row?.sensitive_page_idle_timeout_minutes, DEFAULT_SECURITY_SESSION_SETTINGS.sensitive_page_idle_timeout_minutes),
    audit_timeout_logout: flagValue(row?.audit_timeout_logout, DEFAULT_SECURITY_SESSION_SETTINGS.audit_timeout_logout)
  };
}

export function validateSessionExpiry(payload: JwtPayload, settings: SecuritySessionSettings) {
  const issuedAt = Number(payload.iat ?? 0);
  if (!issuedAt) return false;
  const absoluteExpiry = issuedAt + settings.session_timeout_minutes * 60;
  return absoluteExpiry > Math.floor(Date.now() / 1000);
}

export async function updateSessionLastSeen(_db: Env["DB"], _userId: string) {
  // Stateless JWT auth has no server session row. This marker documents the fallback until server sessions are introduced.
  return { updated: false, reason: "stateless_jwt_session" };
}

export async function createSessionTimeoutSecurityEvent(db: Env["DB"], input: {
  user: AuthUser;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  try {
    await db.prepare(
      `INSERT INTO security_event_logs
       (id, event_type, severity, actor_user_id, actor_email_snapshot, module_key, action_key, entity_type, entity_id, result, ip_address_placeholder, user_agent_placeholder, message, metadata_json)
       VALUES (?, 'IDLE_TIMEOUT_LOGOUT', 'WARNING', ?, ?, 'auth', 'idle_timeout', 'user', ?, 'SUCCESS', ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(),
      input.user.id,
      input.user.email,
      input.user.id,
      input.ipAddress ?? null,
      input.userAgent ?? null,
      "User was logged out due to inactivity.",
      JSON.stringify({ server_session_expiry_supported: false, cache_action: "sensitive_indexeddb_cache_clear" })
    ).run();
  } catch {
    // Security event table may be unavailable in older local databases. Audit log still records the event.
  }
}

export async function expireSessionForIdleTimeout(db: Env["DB"], input: {
  user: AuthUser;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  await recordAudit(db, {
    actorUserId: input.user.id,
    action: "auth.idle_timeout_logout",
    module: "auth",
    entityType: "user",
    entityId: input.user.id,
    reason: "Timed idle logout",
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null
  });
  await createSessionTimeoutSecurityEvent(db, input);
}
