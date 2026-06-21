import { OWNER_ROLE_NAME } from "./permissions";
import type { Env } from "../types";

export interface DbRole {
  id: string;
  name: string;
  description: string | null;
  is_system_role: number;
  is_protected: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface PermissionRow {
  id: string;
  key: string;
  module: string;
  description: string | null;
  is_critical: number;
  created_at: string;
}

export interface RoleSummary extends DbRole {
  permission_count: number;
  user_count: number;
}

export function toSafeRole(role: DbRole | RoleSummary, permissions: string[] = []) {
  const summary = role as RoleSummary;
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    is_system_role: role.is_system_role === 1,
    is_protected: role.is_protected === 1,
    is_active: role.is_active === 1,
    is_owner_role: role.name === OWNER_ROLE_NAME || role.is_protected === 1,
    permission_count: summary.permission_count ?? permissions.length,
    user_count: summary.user_count ?? 0,
    permissions,
    created_at: role.created_at,
    updated_at: role.updated_at
  };
}

export function toSafePermission(permission: PermissionRow) {
  return {
    id: permission.id,
    key: permission.key,
    module: permission.module,
    description: permission.description,
    is_critical: permission.is_critical === 1,
    created_at: permission.created_at
  };
}

export async function getRoleById(db: Env["DB"], id: string) {
  return db.prepare("SELECT * FROM roles WHERE id = ?").bind(id).first<DbRole>();
}

export async function getRoleByName(db: Env["DB"], name: string) {
  return db.prepare("SELECT * FROM roles WHERE name = ? COLLATE NOCASE").bind(name).first<DbRole>();
}

export async function getOwnerRole(db: Env["DB"]) {
  return db.prepare("SELECT * FROM roles WHERE is_protected = 1 OR name = ? LIMIT 1").bind(OWNER_ROLE_NAME).first<DbRole>();
}

export async function getPermissionsForRole(db: Env["DB"], roleId: string) {
  const rows = await db
    .prepare(
      `SELECT p.*
       FROM permissions p
       INNER JOIN role_permissions rp ON rp.permission_id = p.id
       WHERE rp.role_id = ?
       ORDER BY p.module, p.key`
    )
    .bind(roleId)
    .all<PermissionRow>();
  return rows.results;
}

export async function getPermissionsByKeys(db: Env["DB"], keys: string[]) {
  if (keys.length === 0) {
    return [];
  }

  const placeholders = keys.map(() => "?").join(", ");
  const rows = await db
    .prepare(`SELECT * FROM permissions WHERE key IN (${placeholders}) ORDER BY module, key`)
    .bind(...keys)
    .all<PermissionRow>();
  return rows.results;
}

export async function getCriticalPermissionKeys(db: Env["DB"]) {
  const rows = await db.prepare("SELECT key FROM permissions WHERE is_critical = 1 ORDER BY key").all<{ key: string }>();
  return rows.results.map((row) => row.key);
}

export async function listRoles(db: Env["DB"]) {
  const rows = await db
    .prepare(
      `SELECT r.*,
        COUNT(DISTINCT rp.permission_id) AS permission_count,
        COUNT(DISTINCT ur.user_id) AS user_count
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN user_roles ur ON ur.role_id = r.id
       GROUP BY r.id
       ORDER BY r.is_protected DESC, r.name`
    )
    .all<RoleSummary>();
  return rows.results;
}

export async function listPermissions(db: Env["DB"]) {
  const rows = await db.prepare("SELECT * FROM permissions ORDER BY module, key").all<PermissionRow>();
  return rows.results;
}
