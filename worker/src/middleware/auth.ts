import { createMiddleware } from "hono/factory";
import { verifyJwt, requireJwtSecret } from "../auth/jwt";
import { getSecuritySessionSettings, updateSessionLastSeen, validateSessionExpiry } from "../auth/session";
import { getUserById, toAuthUser } from "../db/users";
import type { AppBindings } from "../types";
import { fail } from "../utils/http";

export const requireAuth = createMiddleware<AppBindings>(async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token) {
    return fail(c, 401, "UNAUTHENTICATED", "Authentication is required.");
  }

  const payload = await verifyJwt(requireJwtSecret(c.env.JWT_SECRET), token);
  if (!payload) {
    return fail(c, 401, "UNAUTHENTICATED", "Authentication is required.");
  }

  const sessionSettings = await getSecuritySessionSettings(c.env.DB);
  if (!validateSessionExpiry(payload, sessionSettings)) {
    return fail(c, 401, "SESSION_EXPIRED", "Your session has expired. Please sign in again.");
  }

  const user = await getUserById(c.env.DB, payload.sub);
  if (!user || user.status !== "ACTIVE") {
    return fail(c, 401, "UNAUTHENTICATED", "Authentication is required.");
  }

  const authUser = await toAuthUser(c.env.DB, user);
  await updateSessionLastSeen(c.env.DB, authUser.id);
  c.set("currentUser", authUser);
  await next();
});
