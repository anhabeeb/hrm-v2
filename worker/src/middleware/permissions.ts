import { createMiddleware } from "hono/factory";
import type { AppBindings } from "../types";
import { fail } from "../utils/http";

export function requirePermission(permission: string) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const user = c.get("currentUser");
    if (!user.permissions.includes(permission)) {
      return fail(c, 403, "FORBIDDEN", "You do not have permission to perform this action.");
    }
    await next();
  });
}
