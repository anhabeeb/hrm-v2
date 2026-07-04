import type { AuthUser, DbUser, Env, SafeUser, UserStatus } from "../types";
import { getModuleVisibilityForUser } from "../utils/module-enforcement";

interface RoleRow {
  name: string;
}

interface PermissionRow {
  key: string;
}

interface UserDisplayProfileRow {
  full_name: string | null;
  display_name: string | null;
  position_title: string | null;
  job_level_name: string | null;
}

const AUTH_USER_CACHE_TTL_MS = 5000;
const authUserCache = new Map<string, { expiresAt: number; value: AuthUser }>();

function authUserCacheKey(user: DbUser) {
  return `${user.id}:${user.updated_at}:${user.employee_id ?? "none"}:${user.status}:${user.is_owner}`;
}

function cloneAuthUser(user: AuthUser): AuthUser {
  return {
    ...user,
    roles: [...user.roles],
    permissions: [...user.permissions],
    module_visibility: user.module_visibility ? { ...user.module_visibility } : undefined
  };
}

function cleanDisplayText(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  if (!text || /^(undefined|null|\[object object\])$/i.test(text)) return null;
  return text;
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

async function getLinkedEmployeeDisplayProfile(db: Env["DB"], user: DbUser) {
  const profile = await db
    .prepare(
      `SELECT e.full_name, e.display_name, p.title AS position_title, jl.name AS job_level_name
       FROM employees e
       LEFT JOIN positions p ON p.id = e.primary_position_id
       LEFT JOIN job_levels jl ON jl.id = e.job_level_id
       WHERE e.archived_at IS NULL
         AND ((? IS NOT NULL AND e.id = ?) OR e.user_id = ?)
       ORDER BY CASE WHEN e.id = ? THEN 0 ELSE 1 END
       LIMIT 1`
    )
    .bind(user.employee_id, user.employee_id, user.id, user.employee_id)
    .first<UserDisplayProfileRow>();

  if (!profile) return null;
  const positionTitle = cleanDisplayText(profile.position_title);
  const jobLevelName = cleanDisplayText(profile.job_level_name);
  return {
    employee_full_name: cleanDisplayText(profile.full_name),
    employee_display_name: cleanDisplayText(profile.display_name),
    employee_position_title: positionTitle,
    employee_job_title: positionTitle,
    employee_designation: positionTitle,
    employee_role_title: jobLevelName
  };
}

export async function toAuthUser(db: Env["DB"], user: DbUser): Promise<AuthUser> {
  const cacheKey = authUserCacheKey(user);
  const cached = authUserCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cloneAuthUser(cached.value);
  }
  const [roles, permissions, employeeDisplayProfile] = await Promise.all([
    getRolesForUser(db, user.id),
    getPermissionsForUser(db, user.id),
    getLinkedEmployeeDisplayProfile(db, user)
  ]);
  const authUser = {
    ...toSafeUser(user),
    ...employeeDisplayProfile,
    roles,
    permissions,
    module_visibility: await getModuleVisibilityForUser(db, { permissions, is_owner: user.is_owner === 1 })
  };
  authUserCache.set(cacheKey, { expiresAt: now + AUTH_USER_CACHE_TTL_MS, value: cloneAuthUser(authUser) });
  return authUser;
}

export async function setUserStatus(db: Env["DB"], userId: string, status: UserStatus) {
  await db.prepare("UPDATE users SET status = ?, updated_at = ? WHERE id = ?").bind(status, new Date().toISOString(), userId).run();
}
