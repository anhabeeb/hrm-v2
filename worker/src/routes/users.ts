import { Hono } from "hono";
import type { Context } from "hono";
import { hashPassword } from "../auth/password";
import { recordAudit } from "../db/audit";
import { getOwnerRole, getRoleById, type DbRole } from "../db/roles";
import { getActiveOwnerCount, getUserByEmail, getUserById, setUserStatus, toSafeUser } from "../db/users";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { publishAccessEvent } from "../realtime/publisher";
import { hasValidationErrors, validateDuplicateConflict, validationResponse } from "../lib/moduleValidation";
import type { AppBindings, DbUser, UserStatus } from "../types";
import { fail, getClientIp, ok } from "../utils/http";
import { isEmail, normalizeEmail, readJsonBody, readString } from "../utils/validation";

interface UserListRow extends Omit<DbUser, "password_hash"> {
  role_names: string | null;
  role_ids: string | null;
  employee_no: string | null;
  employee_name: string | null;
}

interface UserRoleRow {
  id: string;
  name: string;
  is_protected: number;
  is_active: number;
}

const VALID_STATUSES = new Set<UserStatus>(["ACTIVE", "DISABLED", "LOCKED"]);

export const userRoutes = new Hono<AppBindings>();

userRoutes.use("*", requireAuth);

function hasPermission(c: Context<AppBindings>, permission: string) {
  return c.get("currentUser").permissions.includes(permission);
}

function isStrongPassword(password: string) {
  return password.length >= 12 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

function toSafeUserRow(row: UserListRow) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    username: row.username,
    status: row.status,
    is_owner: row.is_owner === 1,
    employee_id: row.employee_id,
    employee_no: row.employee_no,
    employee_name: row.employee_name,
    last_login_at: row.last_login_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    roles: row.role_names ? row.role_names.split(", ") : [],
    role_ids: row.role_ids ? row.role_ids.split(",") : []
  };
}

async function getUserRoles(db: AppBindings["Bindings"]["DB"], userId: string) {
  const rows = await db
    .prepare(
      `SELECT r.id, r.name, r.is_protected, r.is_active
       FROM roles r
       INNER JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = ?
       ORDER BY r.name`
    )
    .bind(userId)
    .all<UserRoleRow>();
  return rows.results;
}

async function getSafeUserWithRoles(db: AppBindings["Bindings"]["DB"], userId: string) {
  const user = await getUserById(db, userId);
  if (!user) {
    return null;
  }
  const roles = await getUserRoles(db, user.id);
  return {
    ...toSafeUser(user),
    roles: roles.map((role) => role.name),
    role_ids: roles.map((role) => role.id)
  };
}

async function getRolesForAssignment(c: Context<AppBindings>, roleIds: string[]) {
  const roles: DbRole[] = [];
  const uniqueRoleIds = Array.from(new Set(roleIds));
  for (const roleId of uniqueRoleIds) {
    const role = await getRoleById(c.env.DB, roleId);
    if (!role) {
      return { error: fail(c, 400, "UNKNOWN_ROLE", "One or more selected roles do not exist."), roles: [] };
    }
    if (role.is_active !== 1) {
      return { error: fail(c, 409, "INACTIVE_ROLE", "Inactive roles cannot be assigned to users."), roles: [] };
    }
    if (role.is_protected === 1 && !hasPermission(c, "roles.assign_permissions")) {
      return { error: fail(c, 403, "FORBIDDEN", "Assigning the protected Owner role requires role permission access."), roles: [] };
    }
    roles.push(role);
  }
  return { roles };
}

async function auditBlocked(c: Context<AppBindings>, userId: string | null, reason: string) {
  const actor = c.get("currentUser");
  await recordAudit(c.env.DB, {
    actorUserId: actor.id,
    action: "users.protected_action_blocked",
    module: "users",
    entityType: "user",
    entityId: userId,
    reason,
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent") ?? null
  });
}

async function applyRoleAssignments(c: Context<AppBindings>, targetUser: DbUser, roleIds: string[]) {
  const assignment = await getRolesForAssignment(c, roleIds);
  if (assignment.error) {
    return assignment.error;
  }

  const ownerRole = await getOwnerRole(c.env.DB);
  const currentlyOwner = targetUser.is_owner === 1;
  const willOwn = ownerRole ? assignment.roles.some((role) => role.id === ownerRole.id) : false;
  if (currentlyOwner && !willOwn && targetUser.status === "ACTIVE" && (await getActiveOwnerCount(c.env.DB)) <= 1) {
    await auditBlocked(c, targetUser.id, "Last active Owner user cannot lose the Owner role.");
    return fail(c, 409, "LAST_ACTIVE_OWNER", "The last active Owner user cannot lose the Owner role.");
  }

  const oldRoles = await getUserRoles(c.env.DB, targetUser.id);
  await c.env.DB.prepare("DELETE FROM user_roles WHERE user_id = ?").bind(targetUser.id).run();
  if (assignment.roles.length > 0) {
    await c.env.DB.batch(
      assignment.roles.map((role) =>
        c.env.DB.prepare("INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)").bind(targetUser.id, role.id)
      )
    );
  }
  await c.env.DB.prepare("UPDATE users SET is_owner = ?, updated_at = ? WHERE id = ?").bind(willOwn ? 1 : 0, new Date().toISOString(), targetUser.id).run();

  const actor = c.get("currentUser");
  await recordAudit(c.env.DB, {
    actorUserId: actor.id,
    action: "users.roles_changed",
    module: "users",
    entityType: "user",
    entityId: targetUser.id,
    oldValue: { role_ids: oldRoles.map((role) => role.id), roles: oldRoles.map((role) => role.name), is_owner: currentlyOwner },
    newValue: { role_ids: assignment.roles.map((role) => role.id), roles: assignment.roles.map((role) => role.name), is_owner: willOwn },
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent") ?? null
  });
  await publishAccessEvent(c.env, "access.changed", {
    actor_user_id: actor.id,
    entity_type: "user",
    entity_id: targetUser.id,
    action: "roles_changed"
  });

  return null;
}

userRoutes.get("/", requirePermission("users.view"), async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT u.id, u.name, u.email, u.username, u.status, u.is_owner, u.employee_id,
      e.employee_no, e.full_name AS employee_name,
      u.last_login_at, u.created_at, u.updated_at,
      group_concat(r.name, ', ') AS role_names,
      group_concat(r.id, ',') AS role_ids
     FROM users u
     LEFT JOIN employees e ON e.id = u.employee_id
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     GROUP BY u.id
     ORDER BY u.created_at DESC`
  ).all<UserListRow>();

  return ok(c, { users: rows.results.map(toSafeUserRow) });
});

userRoutes.get("/:id", requirePermission("users.view"), async (c) => {
  const user = await getSafeUserWithRoles(c.env.DB, c.req.param("id"));
  if (!user) {
    return fail(c, 404, "NOT_FOUND", "User was not found.");
  }
  return ok(c, { user });
});

userRoutes.post("/", requirePermission("users.create"), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const name = readString(body.name);
  const email = normalizeEmail(body.email);
  const username = readString(body.username);
  const password = readString(body.password);
  const status = typeof body.status === "string" && VALID_STATUSES.has(body.status as UserStatus) ? (body.status as UserStatus) : "ACTIVE";
  const roleIds = Array.isArray(body.role_ids) ? body.role_ids.filter((id): id is string => typeof id === "string") : [];

  if (!name) {
    return fail(c, 400, "VALIDATION_ERROR", "Name is required.");
  }
  if (!isEmail(email)) {
    return fail(c, 400, "VALIDATION_ERROR", "A valid email address is required.");
  }
  if (!isStrongPassword(password)) {
    return fail(c, 400, "VALIDATION_ERROR", "Password must be at least 12 characters and include letters and numbers.");
  }
  const existingEmailForCreate = await getUserByEmail(c.env.DB, email);
  const emailIssues = validateDuplicateConflict(existingEmailForCreate, "email", "A user with this email already exists.");
  if (hasValidationErrors(emailIssues)) return validationResponse(c, emailIssues, 409);
  if (username) {
    const existingUsername = await c.env.DB.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE").bind(username).first<{ id: string }>();
    const usernameIssues = validateDuplicateConflict(existingUsername, "username", "A user with this username already exists.");
    if (hasValidationErrors(usernameIssues)) return validationResponse(c, usernameIssues, 409);
  }

  const assignment = await getRolesForAssignment(c, roleIds);
  if (assignment.error) {
    return assignment.error;
  }

  const ownerRole = await getOwnerRole(c.env.DB);
  const isOwner = ownerRole ? assignment.roles.some((role) => role.id === ownerRole.id) : false;
  const userId = crypto.randomUUID();
  await c.env.DB
    .prepare(
      `INSERT INTO users (id, name, email, username, password_hash, status, is_owner, employee_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`
    )
    .bind(userId, name, email, username || null, await hashPassword(password), status, isOwner ? 1 : 0)
    .run();

  if (assignment.roles.length > 0) {
    await c.env.DB.batch(
      assignment.roles.map((role) =>
        c.env.DB.prepare("INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)").bind(userId, role.id)
      )
    );
  }

  const actor = c.get("currentUser");
  await recordAudit(c.env.DB, {
    actorUserId: actor.id,
    action: "users.created",
    module: "users",
    entityType: "user",
    entityId: userId,
    newValue: { name, email, username: username || null, status, role_ids: assignment.roles.map((role) => role.id), is_owner: isOwner },
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent") ?? null
  });
  await publishAccessEvent(c.env, "users.changed", { actor_user_id: actor.id, entity_type: "user", entity_id: userId, action: "created" });

  return ok(c, { user: await getSafeUserWithRoles(c.env.DB, userId) }, 201);
});

userRoutes.patch("/:id", requirePermission("users.update"), async (c) => {
  const user = await getUserById(c.env.DB, c.req.param("id"));
  if (!user) {
    return fail(c, 404, "NOT_FOUND", "User was not found.");
  }

  const body = await readJsonBody(c.req.raw);
  const name = readString(body.name);
  const email = normalizeEmail(body.email);
  const username = readString(body.username);
  if (typeof body.status === "string" && body.status !== user.status) {
    return fail(c, 400, "STATUS_ENDPOINT_REQUIRED", "Use the dedicated status action endpoints to enable, disable, or lock users.");
  }

  if (!name) {
    return fail(c, 400, "VALIDATION_ERROR", "Name is required.");
  }
  if (!isEmail(email)) {
    return fail(c, 400, "VALIDATION_ERROR", "A valid email address is required.");
  }

  const existingEmail = await getUserByEmail(c.env.DB, email);
  const emailIssues = validateDuplicateConflict(existingEmail && existingEmail.id !== user.id ? existingEmail : null, "email", "A user with this email already exists.");
  if (hasValidationErrors(emailIssues)) return validationResponse(c, emailIssues, 409);
  if (username) {
    const existingUsername = await c.env.DB.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE").bind(username).first<{ id: string }>();
    const usernameIssues = validateDuplicateConflict(existingUsername && existingUsername.id !== user.id ? existingUsername : null, "username", "A user with this username already exists.");
    if (hasValidationErrors(usernameIssues)) return validationResponse(c, usernameIssues, 409);
  }

  await c.env.DB
    .prepare("UPDATE users SET name = ?, email = ?, username = ?, updated_at = ? WHERE id = ?")
    .bind(name, email, username || null, new Date().toISOString(), user.id)
    .run();

  if (Array.isArray(body.role_ids)) {
    const roleIds = body.role_ids.filter((id): id is string => typeof id === "string");
    const assignmentError = await applyRoleAssignments(c, user, roleIds);
    if (assignmentError) {
      return assignmentError;
    }
  }

  const actor = c.get("currentUser");
  await recordAudit(c.env.DB, {
    actorUserId: actor.id,
    action: "users.updated",
    module: "users",
    entityType: "user",
    entityId: user.id,
    oldValue: { name: user.name, email: user.email, username: user.username },
    newValue: { name, email, username: username || null },
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent") ?? null
  });
  await publishAccessEvent(c.env, "users.changed", { actor_user_id: actor.id, entity_type: "user", entity_id: user.id, action: "updated" });

  return ok(c, { user: await getSafeUserWithRoles(c.env.DB, user.id) });
});

userRoutes.post("/:id/assign-roles", requirePermission("users.update"), async (c) => {
  const user = await getUserById(c.env.DB, c.req.param("id"));
  if (!user) {
    return fail(c, 404, "NOT_FOUND", "User was not found.");
  }
  const body = await readJsonBody(c.req.raw);
  const roleIds = Array.isArray(body.role_ids) ? body.role_ids.filter((id): id is string => typeof id === "string") : [];
  const assignmentError = await applyRoleAssignments(c, user, roleIds);
  if (assignmentError) {
    return assignmentError;
  }
  return ok(c, { user: await getSafeUserWithRoles(c.env.DB, user.id) });
});

async function changeStatus(c: Context<AppBindings>, status: UserStatus, action: string) {
  const userId = c.req.param("id");
  if (!userId) {
    return fail(c, 400, "VALIDATION_ERROR", "User id is required.");
  }
  const targetUser = await getUserById(c.env.DB, userId);
  if (!targetUser) {
    return fail(c, 404, "NOT_FOUND", "User was not found.");
  }
  if (targetUser.is_owner === 1 && status !== "ACTIVE" && targetUser.status === "ACTIVE" && (await getActiveOwnerCount(c.env.DB)) <= 1) {
    await auditBlocked(c, targetUser.id, status === "LOCKED" ? "Last active Owner user cannot be locked." : "Last active Owner user cannot be disabled.");
    return fail(c, 409, "LAST_ACTIVE_OWNER", status === "LOCKED" ? "The last active Owner user cannot be locked." : "The last active Owner user cannot be disabled.");
  }

  await setUserStatus(c.env.DB, targetUser.id, status);
  const actor = c.get("currentUser");
  await recordAudit(c.env.DB, {
    actorUserId: actor.id,
    action,
    module: "users",
    entityType: "user",
    entityId: targetUser.id,
    oldValue: { status: targetUser.status },
    newValue: { status },
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent") ?? null
  });
  await publishAccessEvent(c.env, "users.changed", { actor_user_id: actor.id, entity_type: "user", entity_id: targetUser.id, action });
  return ok(c, { user: await getSafeUserWithRoles(c.env.DB, targetUser.id) });
}

userRoutes.patch("/:id/status", requirePermission("users.disable"), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const status = body.status;
  if (typeof status !== "string" || !VALID_STATUSES.has(status as UserStatus)) {
    return fail(c, 400, "VALIDATION_ERROR", "Status must be ACTIVE, DISABLED, or LOCKED.");
  }
  return changeStatus(c, status as UserStatus, "users.status_updated");
});

userRoutes.post("/:id/disable", requirePermission("users.disable"), (c) => changeStatus(c, "DISABLED", "users.disabled"));
userRoutes.post("/:id/enable", requirePermission("users.disable"), (c) => changeStatus(c, "ACTIVE", "users.enabled"));
userRoutes.post("/:id/lock", requirePermission("users.disable"), (c) => changeStatus(c, "LOCKED", "users.locked"));
userRoutes.post("/:id/unlock", requirePermission("users.disable"), (c) => changeStatus(c, "ACTIVE", "users.unlocked"));

userRoutes.post("/:id/reset-password", requirePermission("users.update"), async (c) => {
  const user = await getUserById(c.env.DB, c.req.param("id"));
  if (!user) {
    return fail(c, 404, "NOT_FOUND", "User was not found.");
  }

  const body = await readJsonBody(c.req.raw);
  const password = readString(body.password);
  const changed = Boolean(password);
  if (password && !isStrongPassword(password)) {
    return fail(c, 400, "VALIDATION_ERROR", "Password must be at least 12 characters and include letters and numbers.");
  }

  if (password) {
    await c.env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").bind(await hashPassword(password), new Date().toISOString(), user.id).run();
  }

  const actor = c.get("currentUser");
  await recordAudit(c.env.DB, {
    actorUserId: actor.id,
    action: "users.password_reset_requested",
    module: "users",
    entityType: "user",
    entityId: user.id,
    newValue: { password_changed: changed, placeholder_only: !changed },
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent") ?? null
  });
  await publishAccessEvent(c.env, "users.changed", { actor_user_id: actor.id, entity_type: "user", entity_id: user.id, action: "password_reset_requested" });

  return ok(c, { reset_requested: true, password_changed: changed });
});
