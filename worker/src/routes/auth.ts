import { Hono } from "hono";
import { signJwt, requireJwtSecret } from "../auth/jwt";
import { verifyPassword } from "../auth/password";
import { recordAudit } from "../db/audit";
import { getUserByEmail, toAuthUser } from "../db/users";
import { requireAuth } from "../middleware/auth";
import type { AppBindings } from "../types";
import { fail, getClientIp, ok } from "../utils/http";
import { isEmail, normalizeEmail, readJsonBody, readString } from "../utils/validation";

const GENERIC_LOGIN_ERROR = "Invalid email or password.";

export const authRoutes = new Hono<AppBindings>();

authRoutes.post("/login", async (c) => {
  const body = await readJsonBody(c.req.raw);
  const email = normalizeEmail(body.email);
  const password = readString(body.password);

  if (!isEmail(email) || !password) {
    return fail(c, 401, "INVALID_CREDENTIALS", GENERIC_LOGIN_ERROR);
  }

  const user = await getUserByEmail(c.env.DB, email);
  if (!user) {
    return fail(c, 401, "INVALID_CREDENTIALS", GENERIC_LOGIN_ERROR);
  }

  if (user.status === "DISABLED" || user.status === "LOCKED") {
    return fail(c, 401, "INVALID_CREDENTIALS", GENERIC_LOGIN_ERROR);
  }

  const passwordMatches = await verifyPassword(password, user.password_hash);
  if (!passwordMatches) {
    return fail(c, 401, "INVALID_CREDENTIALS", GENERIC_LOGIN_ERROR);
  }

  await c.env.DB.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), new Date().toISOString(), user.id)
    .run();

  await recordAudit(c.env.DB, {
    actorUserId: user.id,
    action: "auth.login",
    module: "auth",
    entityType: "user",
    entityId: user.id,
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent") ?? null
  });

  const authUser = await toAuthUser(c.env.DB, { ...user, last_login_at: new Date().toISOString() });
  const token = await signJwt(requireJwtSecret(c.env.JWT_SECRET), user.id, user.email);
  return ok(c, { token, user: authUser });
});

authRoutes.get("/me", requireAuth, async (c) => {
  return ok(c, { user: c.get("currentUser") });
});

authRoutes.post("/logout", requireAuth, async (c) => {
  const user = c.get("currentUser");
  await recordAudit(c.env.DB, {
    actorUserId: user.id,
    action: "auth.logout",
    module: "auth",
    entityType: "user",
    entityId: user.id,
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent") ?? null
  });
  return ok(c, { logged_out: true });
});
