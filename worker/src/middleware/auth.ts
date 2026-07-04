import { createMiddleware } from "hono/factory";
import { verifyJwt, requireJwtSecret } from "../auth/jwt";
import { getSecuritySessionSettings, updateSessionLastSeen, validateSessionExpiry } from "../auth/session";
import { getUserById, toAuthUser } from "../db/users";
import type { AppBindings } from "../types";
import { fail } from "../utils/http";
import { timeStage } from "../utils/performance";

export const requireAuth = createMiddleware<AppBindings>(async (c, next) => {
  const authResult = await timeStage(c, "auth", async () => {
    const header = c.req.header("Authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
    if (!token) return { error: fail(c, 401, "UNAUTHENTICATED", "Authentication is required.") };

    const payload = await verifyJwt(requireJwtSecret(c.env.JWT_SECRET), token);
    if (!payload) return { error: fail(c, 401, "UNAUTHENTICATED", "Authentication is required.") };

    const [sessionSettings, user] = await Promise.all([
      getSecuritySessionSettings(c.env.DB),
      getUserById(c.env.DB, payload.sub)
    ]);
    if (!validateSessionExpiry(payload, sessionSettings)) {
      return { error: fail(c, 401, "SESSION_EXPIRED", "Your session has expired. Please sign in again.") };
    }
    if (!user || user.status !== "ACTIVE") {
      return { error: fail(c, 401, "UNAUTHENTICATED", "Authentication is required.") };
    }

    return { user };
  });
  if ("error" in authResult) return authResult.error;

  const authUser = await timeStage(c, "session", () => toAuthUser(c.env.DB, authResult.user));
  const sessionTouch = updateSessionLastSeen(c.env.DB, authUser.id).catch((error) => {
    console.warn(JSON.stringify({
      level: "warn",
      event: "auth.session_last_seen_deferred_failed",
      message: error instanceof Error ? error.message.slice(0, 180) : "Session touch failed"
    }));
  });
  (c as unknown as { executionCtx?: ExecutionContext }).executionCtx?.waitUntil(sessionTouch);
  c.set("currentUser", authUser);
  await next();
});
