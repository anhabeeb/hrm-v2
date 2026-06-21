import type { Env } from "../types";

interface AuditInput {
  actorUserId?: string | null;
  action: string;
  module: string;
  entityType: string;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function recordAudit(db: Env["DB"], input: AuditInput) {
  await db
    .prepare(
      `INSERT INTO audit_logs (
        id, actor_user_id, action, module, entity_type, entity_id,
        old_value_json, new_value_json, reason, ip_address, user_agent
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      input.actorUserId ?? null,
      input.action,
      input.module,
      input.entityType,
      input.entityId ?? null,
      input.oldValue === undefined ? null : JSON.stringify(input.oldValue),
      input.newValue === undefined ? null : JSON.stringify(input.newValue),
      input.reason ?? null,
      input.ipAddress ?? null,
      input.userAgent ?? null
    )
    .run();
}
