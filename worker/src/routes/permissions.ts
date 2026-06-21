import { Hono } from "hono";
import { listPermissions, toSafePermission } from "../db/roles";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import type { AppBindings } from "../types";
import { ok } from "../utils/http";

export const permissionRoutes = new Hono<AppBindings>();

permissionRoutes.use("*", requireAuth);

permissionRoutes.get("/", requirePermission("roles.view"), async (c) => {
  const permissions = (await listPermissions(c.env.DB)).map(toSafePermission);
  const modules = permissions.reduce<Record<string, typeof permissions>>((groups, permission) => {
    groups[permission.module] = groups[permission.module] ?? [];
    groups[permission.module].push(permission);
    return groups;
  }, {});

  return ok(c, { permissions, modules });
});
