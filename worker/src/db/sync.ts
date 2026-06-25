import { canAccessEmployee } from "../auth/access-scopes";
import type { AuthUser, Env } from "../types";

export interface SyncChangeInput {
  tableName: string;
  entityType: string;
  rowId: string;
  action: "INSERT" | "UPDATE" | "DELETE" | "ARCHIVE";
  moduleKey?: string | null;
  employeeId?: string | null;
  companyId?: string | null;
  worksiteId?: string | null;
  departmentId?: string | null;
  changedByUserId?: string | null;
  metadata?: unknown;
}

export interface SyncChangeRow {
  id: string;
  version: number;
  table_name: string;
  entity_type: string;
  row_id: string;
  action: string;
  module_key: string | null;
  employee_id: string | null;
  company_id: string | null;
  worksite_id: string | null;
  department_id: string | null;
  changed_by_user_id: string | null;
  changed_at: string;
  metadata_json: string | null;
}

export async function getCurrentSyncVersion(db: Env["DB"]) {
  try {
    const row = await db.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM sync_change_log").first<{ version: number }>();
    return Number(row?.version ?? 0);
  } catch {
    return 0;
  }
}

export async function createSyncChangeLogEntry(db: Env["DB"], input: SyncChangeInput) {
  const currentVersion = await getCurrentSyncVersion(db);
  const nextVersion = currentVersion + 1;
  const changedAt = new Date().toISOString();
  try {
    await db.prepare(
      `INSERT INTO sync_change_log (
        id, version, table_name, entity_type, row_id, action, module_key, employee_id,
        company_id, worksite_id, department_id, changed_by_user_id, changed_at, metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(),
      nextVersion,
      input.tableName,
      input.entityType,
      input.rowId,
      input.action,
      input.moduleKey ?? null,
      input.employeeId ?? null,
      input.companyId ?? null,
      input.worksiteId ?? null,
      input.departmentId ?? null,
      input.changedByUserId ?? null,
      changedAt,
      input.metadata === undefined ? null : JSON.stringify(input.metadata)
    ).run();
  } catch {
    // Older deployed databases may not have the table until schema repair is applied.
  }
  return {
    module: input.moduleKey ?? null,
    entityType: input.entityType,
    table: input.tableName,
    id: input.rowId,
    action: input.action,
    version: nextVersion,
    updatedAt: changedAt
  };
}

export function createSyncTombstone(change: SyncChangeRow) {
  return {
    entity_type: change.entity_type,
    id: change.row_id,
    action: change.action,
    version: change.version,
    deleted_or_archived: change.action === "DELETE" || change.action === "ARCHIVE",
    changed_at: change.changed_at
  };
}

const MODULE_PERMISSION_MAP: Record<string, string[]> = {
  employees: ["employees.view"],
  employee_360: ["employees.view"],
  leave: ["leave.view", "employees.leave.view", "self_service.leave.view"],
  attendance: ["attendance.view", "employees.attendance.view", "self_service.attendance.view"],
  roster: ["roster.view", "employees.roster.view", "self_service.roster.view"],
  payroll: ["payroll.view", "employees.payroll.view", "self_service.payroll.view"],
  documents: ["documents.view", "self_service.documents.compliance.view"],
  contracts: ["contracts.view", "employees.contracts.view", "self_service.contracts.view"],
  assets_uniforms: ["assets.view", "employees.assets.view", "self_service.assets.view"],
  final_settlement: ["final_settlement.view", "employees.final_settlement.view"],
  approvals: ["approvals.view", "approvals.inbox.view", "self_service.approvals.view"],
  reports: ["reports.view"],
  self_service: ["self_service.view"],
  admin_settings: ["admin.settings_hub.view", "settings.view"]
};

function userCanSeeModule(user: AuthUser, moduleKey: string | null) {
  if (user.is_owner || !moduleKey) return true;
  const required = MODULE_PERMISSION_MAP[moduleKey] ?? [`${moduleKey}.view`];
  return required.some((permission) => user.permissions.includes(permission));
}

export async function filterSyncChangesForUserScope(db: Env["DB"], user: AuthUser, changes: SyncChangeRow[]) {
  const visible: SyncChangeRow[] = [];
  for (const change of changes) {
    if (!userCanSeeModule(user, change.module_key)) continue;
    if (change.employee_id && !user.is_owner) {
      const allowed = await canAccessEmployee(db, user, change.employee_id, change.module_key ?? "employees", "view");
      if (!allowed) continue;
    }
    visible.push(change);
  }
  return visible;
}

export async function getChangesSinceVersion(db: Env["DB"], user: AuthUser, sinceVersion: number, modules: string[] = []) {
  try {
    const conditions = ["version > ?"];
    const params: Array<string | number> = [sinceVersion];
    if (modules.length) {
      conditions.push(`module_key IN (${modules.map(() => "?").join(", ")})`);
      params.push(...modules);
    }
    const rows = await db.prepare(
      `SELECT * FROM sync_change_log
       WHERE ${conditions.join(" AND ")}
       ORDER BY version ASC
       LIMIT 500`
    ).bind(...params).all<SyncChangeRow>();
    return filterSyncChangesForUserScope(db, user, rows.results);
  } catch {
    return [];
  }
}

export async function pullChangedEntitiesForUser(db: Env["DB"], user: AuthUser, changes: SyncChangeRow[]) {
  const visible = await filterSyncChangesForUserScope(db, user, changes);
  return visible.map((change) => createSyncTombstone(change));
}

export function syncWriteMetadata(input: SyncChangeInput, version: number | string = Date.now()) {
  return {
    changed: [
      {
        module: input.moduleKey ?? null,
        entityType: input.entityType,
        table: input.tableName,
        id: input.rowId,
        action: input.action,
        version,
        updatedAt: new Date().toISOString()
      }
    ],
    invalidate: [
      {
        module: input.moduleKey ?? null,
        employee_id: input.employeeId ?? null,
        reason: `${input.entityType}_${input.action.toLowerCase()}`
      }
    ]
  };
}
