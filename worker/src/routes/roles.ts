import { Hono } from "hono";
import type { Context } from "hono";
import { recordAudit } from "../db/audit";
import {
  getCriticalPermissionKeys,
  getPermissionsByKeys,
  getPermissionsForRole,
  getRoleById,
  getRoleByName,
  listRoles,
  toSafePermission,
  toSafeRole
} from "../db/roles";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { publishAccessEvent } from "../realtime/publisher";
import type { AppBindings } from "../types";
import { fail, getClientIp, ok } from "../utils/http";
import { readJsonBody, readString } from "../utils/validation";

export const roleRoutes = new Hono<AppBindings>();

roleRoutes.use("*", requireAuth);

async function auditBlocked(c: Context<AppBindings>, roleId: string | null, reason: string) {
  const actor = c.get("currentUser");
  await recordAudit(c.env.DB, {
    actorUserId: actor.id,
    action: "roles.protected_action_blocked",
    module: "roles",
    entityType: "role",
    entityId: roleId,
    reason,
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent") ?? null
  });
}

roleRoutes.get("/", requirePermission("roles.view"), async (c) => {
  const roles = await Promise.all(
    (await listRoles(c.env.DB)).map(async (role) => {
      const permissions = (await getPermissionsForRole(c.env.DB, role.id)).map((permission) => permission.key);
      return toSafeRole(role, permissions);
    })
  );

  return ok(c, { roles });
});

roleRoutes.get("/:id", requirePermission("roles.view"), async (c) => {
  const role = await getRoleById(c.env.DB, c.req.param("id"));
  if (!role) {
    return fail(c, 404, "NOT_FOUND", "Role was not found.");
  }

  const permissions = (await getPermissionsForRole(c.env.DB, role.id)).map(toSafePermission);
  return ok(c, { role: toSafeRole(role, permissions.map((permission) => permission.key)), permissions });
});

roleRoutes.post("/", requirePermission("roles.create"), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const name = readString(body.name);
  const description = readString(body.description);

  if (!name) {
    return fail(c, 400, "VALIDATION_ERROR", "Role name is required.");
  }

  const existing = await getRoleByName(c.env.DB, name);
  if (existing) {
    return fail(c, 409, "ROLE_NAME_EXISTS", "A role with this name already exists.");
  }

  const roleId = crypto.randomUUID();
  await c.env.DB
    .prepare(
      `INSERT INTO roles (id, name, description, is_system_role, is_protected, is_active)
       VALUES (?, ?, ?, 0, 0, 1)`
    )
    .bind(roleId, name, description || null)
    .run();

  const actor = c.get("currentUser");
  await recordAudit(c.env.DB, {
    actorUserId: actor.id,
    action: "roles.created",
    module: "roles",
    entityType: "role",
    entityId: roleId,
    newValue: { name, description: description || null },
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent") ?? null
  });
  await publishAccessEvent(c.env, "roles.changed", { actor_user_id: actor.id, entity_type: "role", entity_id: roleId, action: "created" });

  const created = await getRoleById(c.env.DB, roleId);
  return ok(c, { role: created ? toSafeRole(created) : null }, 201);
});

roleRoutes.patch("/:id", requirePermission("roles.update"), async (c) => {
  const role = await getRoleById(c.env.DB, c.req.param("id"));
  if (!role) {
    return fail(c, 404, "NOT_FOUND", "Role was not found.");
  }

  const body = await readJsonBody(c.req.raw);
  const name = readString(body.name);
  const description = readString(body.description);
  const isActive = typeof body.is_active === "boolean" ? body.is_active : undefined;

  if (!name) {
    return fail(c, 400, "VALIDATION_ERROR", "Role name is required.");
  }

  const duplicate = await getRoleByName(c.env.DB, name);
  if (duplicate && duplicate.id !== role.id) {
    return fail(c, 409, "ROLE_NAME_EXISTS", "A role with this name already exists.");
  }

  if (role.is_protected === 1 && isActive === false) {
    await auditBlocked(c, role.id, "Protected Owner/Super Admin role cannot be disabled.");
    return fail(c, 409, "PROTECTED_ROLE", "Protected Owner/Super Admin role cannot be disabled.");
  }

  await c.env.DB
    .prepare(
      `UPDATE roles
       SET name = ?, description = ?, is_active = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(name, description || null, isActive === undefined ? role.is_active : isActive ? 1 : 0, new Date().toISOString(), role.id)
    .run();

  const actor = c.get("currentUser");
  await recordAudit(c.env.DB, {
    actorUserId: actor.id,
    action: "roles.updated",
    module: "roles",
    entityType: "role",
    entityId: role.id,
    oldValue: { name: role.name, description: role.description, is_active: role.is_active === 1 },
    newValue: { name, description: description || null, is_active: isActive === undefined ? role.is_active === 1 : isActive },
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent") ?? null
  });
  await publishAccessEvent(c.env, "roles.changed", { actor_user_id: actor.id, entity_type: "role", entity_id: role.id, action: "updated" });

  const updated = await getRoleById(c.env.DB, role.id);
  return ok(c, { role: updated ? toSafeRole(updated, (await getPermissionsForRole(c.env.DB, role.id)).map((permission) => permission.key)) : null });
});

async function updateRolePermissions(c: Context<AppBindings>) {
  const roleId = c.req.param("id");
  if (!roleId) {
    return fail(c, 400, "VALIDATION_ERROR", "Role id is required.");
  }
  const role = await getRoleById(c.env.DB, roleId);
  if (!role) {
    return fail(c, 404, "NOT_FOUND", "Role was not found.");
  }

  const body = await readJsonBody(c.req.raw);
  const permissionKeys = Array.isArray(body.permissions)
    ? Array.from(new Set(body.permissions.filter((key): key is string => typeof key === "string")))
    : [];
  const permissions = await getPermissionsByKeys(c.env.DB, permissionKeys);
  const knownKeys = new Set(permissions.map((permission) => permission.key));
  const unknownKeys = permissionKeys.filter((key) => !knownKeys.has(key));

  if (unknownKeys.length > 0) {
    return fail(c, 400, "UNKNOWN_PERMISSIONS", `Unknown permission keys: ${unknownKeys.join(", ")}`);
  }

  if (role.is_protected === 1) {
    const criticalKeys = await getCriticalPermissionKeys(c.env.DB);
    const missingCritical = criticalKeys.filter((key) => !permissionKeys.includes(key));
    if (missingCritical.length > 0) {
      await auditBlocked(c, role.id, "Critical Owner permissions cannot be removed.");
      return fail(c, 409, "CRITICAL_OWNER_PERMISSIONS", "Critical Owner permissions cannot be removed.");
    }
  }

  const oldPermissions = (await getPermissionsForRole(c.env.DB, role.id)).map((permission) => permission.key);
  await c.env.DB.prepare("DELETE FROM role_permissions WHERE role_id = ?").bind(role.id).run();

  if (permissions.length > 0) {
    await c.env.DB.batch(
      permissions.map((permission) =>
        c.env.DB.prepare("INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)").bind(role.id, permission.id)
      )
    );
  }

  const actor = c.get("currentUser");
  await recordAudit(c.env.DB, {
    actorUserId: actor.id,
    action: "roles.permissions_changed",
    module: "roles",
    entityType: "role",
    entityId: role.id,
    oldValue: { permissions: oldPermissions },
    newValue: { permissions: permissionKeys },
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent") ?? null
  });
  await publishAccessEvent(c.env, "permissions.changed", { actor_user_id: actor.id, entity_type: "role", entity_id: role.id, action: "permissions_changed" });
  await publishAccessEvent(c.env, "access.changed", { actor_user_id: actor.id, entity_type: "role", entity_id: role.id, action: "permissions_changed" });

  return ok(c, { role: toSafeRole(role, permissionKeys) });
}

roleRoutes.patch("/:id/permissions", requirePermission("roles.assign_permissions"), updateRolePermissions);

roleRoutes.post("/:id/permissions", requirePermission("roles.assign_permissions"), updateRolePermissions);

roleRoutes.post("/:id/disable", requirePermission("roles.update"), async (c) => {
  const role = await getRoleById(c.env.DB, c.req.param("id"));
  if (!role) {
    return fail(c, 404, "NOT_FOUND", "Role was not found.");
  }
  if (role.is_protected === 1) {
    await auditBlocked(c, role.id, "Protected Owner/Super Admin role cannot be disabled.");
    return fail(c, 409, "PROTECTED_ROLE", "Protected Owner/Super Admin role cannot be disabled.");
  }

  await c.env.DB.prepare("UPDATE roles SET is_active = 0, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), role.id).run();
  const actor = c.get("currentUser");
  await recordAudit(c.env.DB, {
    actorUserId: actor.id,
    action: "roles.disabled",
    module: "roles",
    entityType: "role",
    entityId: role.id,
    oldValue: { is_active: role.is_active === 1 },
    newValue: { is_active: false },
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent") ?? null
  });
  await publishAccessEvent(c.env, "roles.changed", { actor_user_id: actor.id, entity_type: "role", entity_id: role.id, action: "disabled" });
  const updated = await getRoleById(c.env.DB, role.id);
  return ok(c, { role: updated ? toSafeRole(updated, (await getPermissionsForRole(c.env.DB, role.id)).map((permission) => permission.key)) : null });
});

roleRoutes.post("/:id/enable", requirePermission("roles.update"), async (c) => {
  const role = await getRoleById(c.env.DB, c.req.param("id"));
  if (!role) {
    return fail(c, 404, "NOT_FOUND", "Role was not found.");
  }

  await c.env.DB.prepare("UPDATE roles SET is_active = 1, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), role.id).run();
  const actor = c.get("currentUser");
  await recordAudit(c.env.DB, {
    actorUserId: actor.id,
    action: "roles.enabled",
    module: "roles",
    entityType: "role",
    entityId: role.id,
    oldValue: { is_active: role.is_active === 1 },
    newValue: { is_active: true },
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent") ?? null
  });
  await publishAccessEvent(c.env, "roles.changed", { actor_user_id: actor.id, entity_type: "role", entity_id: role.id, action: "enabled" });
  const updated = await getRoleById(c.env.DB, role.id);
  return ok(c, { role: updated ? toSafeRole(updated, (await getPermissionsForRole(c.env.DB, role.id)).map((permission) => permission.key)) : null });
});
