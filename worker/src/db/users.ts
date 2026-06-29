import type { AuthUser, DbUser, Env, SafeUser, UserStatus } from "../types";
import { getModuleVisibilityForUser } from "../utils/module-enforcement";

interface RoleRow {
  name: string;
}

interface PermissionRow {
  key: string;
}

export function toSafeUser(user: DbUser): SafeUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    username: user.username,
    status: user.status,
    is_owner: user.is_owner === 1,
    employee_id: user.employee_id,
    last_login_at: user.last_login_at,
    created_at: user.created_at,
    updated_at: user.updated_at
  };
}

export async function getUserById(db: Env["DB"], id: string) {
  return db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first<DbUser>();
}

export async function getUserByEmail(db: Env["DB"], email: string) {
  return db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").bind(email).first<DbUser>();
}

export async function getActiveOwnerCount(db: Env["DB"]) {
  const row = await db
    .prepare("SELECT COUNT(*) AS count FROM users WHERE is_owner = 1 AND status = 'ACTIVE'")
    .first<{ count: number }>();
  return row?.count ?? 0;
}

export async function getAnyOwnerCount(db: Env["DB"]) {
  const row = await db.prepare("SELECT COUNT(*) AS count FROM users WHERE is_owner = 1").first<{ count: number }>();
  return row?.count ?? 0;
}

export async function getRolesForUser(db: Env["DB"], userId: string) {
  const rows = await db
    .prepare(
      `SELECT r.name
       FROM roles r
       INNER JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = ? AND r.is_active = 1
       ORDER BY r.name`
    )
    .bind(userId)
    .all<RoleRow>();
  return rows.results.map((row) => row.name);
}

export async function getPermissionsForUser(db: Env["DB"], userId: string) {
  const rows = await db
    .prepare(
      `SELECT DISTINCT p.key
       FROM permissions p
       INNER JOIN role_permissions rp ON rp.permission_id = p.id
       INNER JOIN roles r ON r.id = rp.role_id
       INNER JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = ? AND r.is_active = 1
       ORDER BY p.key`
    )
    .bind(userId)
    .all<PermissionRow>();
  return rows.results.map((row) => row.key);
}

export async function toAuthUser(db: Env["DB"], user: DbUser): Promise<AuthUser> {
  const roles = await getRolesForUser(db, user.id);
  const permissions = await getPermissionsForUser(db, user.id);
  return {
    ...toSafeUser(user),
    roles,
    permissions,
    module_visibility: await getModuleVisibilityForUser(db, { permissions, is_owner: user.is_owner === 1 })
  };
}

export async function setUserStatus(db: Env["DB"], userId: string, status: UserStatus) {
  await db.prepare("UPDATE users SET status = ?, updated_at = ? WHERE id = ?").bind(status, new Date().toISOString(), userId).run();
}
