import { Hono } from "hono";
import { signJwt, requireJwtSecret } from "../auth/jwt";
import { hashPassword } from "../auth/password";
import { recordAudit } from "../db/audit";
import { ensureOwnerRole, seedSystemPermissions } from "../db/permissions";
import { getActiveOwnerCount, getAnyOwnerCount, getUserByEmail, toAuthUser } from "../db/users";
import type { AppBindings, DbUser } from "../types";
import { fail, getClientIp, ok } from "../utils/http";
import { isEmail, normalizeEmail, readJsonBody, readString } from "../utils/validation";

export const bootstrapRoutes = new Hono<AppBindings>();

bootstrapRoutes.get("/status", async (c) => {
  const activeOwnerCount = await getActiveOwnerCount(c.env.DB);
  const anyOwnerCount = await getAnyOwnerCount(c.env.DB);
  const setupRequired = activeOwnerCount === 0;

  return ok(c, {
    setup_required: setupRequired,
    setup_completed: !setupRequired,
    owner_exists: anyOwnerCount > 0
  });
});

bootstrapRoutes.post("/owner", async (c) => {
  const jwtSecret = requireJwtSecret(c.env.JWT_SECRET);
  const activeOwnerCount = await getActiveOwnerCount(c.env.DB);
  if (activeOwnerCount > 0) {
    return fail(c, 409, "SETUP_ALREADY_COMPLETE", "Initial setup has already been completed.");
  }

  const body = await readJsonBody(c.req.raw);
  const name = readString(body.name);
  const email = normalizeEmail(body.email);
  const password = readString(body.password);

  if (!name || name.length < 2) {
    return fail(c, 400, "VALIDATION_ERROR", "Name is required.");
  }

  if (!isEmail(email)) {
    return fail(c, 400, "VALIDATION_ERROR", "A valid email address is required.");
  }

  if (password.length < 12) {
    return fail(c, 400, "VALIDATION_ERROR", "Password must be at least 12 characters.");
  }

  const existingUser = await getUserByEmail(c.env.DB, email);
  if (existingUser) {
    return fail(c, 409, "EMAIL_UNAVAILABLE", "This email address cannot be used.");
  }

  await seedSystemPermissions(c.env.DB);
  const ownerRoleId = await ensureOwnerRole(c.env.DB);
  const userId = crypto.randomUUID();
  const passwordHash = await hashPassword(password);

  await c.env.DB.batch([
    c.env.DB
      .prepare(
        `INSERT INTO users (id, name, email, password_hash, status, is_owner, employee_id)
         VALUES (?, ?, ?, ?, 'ACTIVE', 1, NULL)`
      )
      .bind(userId, name, email, passwordHash),
    c.env.DB.prepare("INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)").bind(userId, ownerRoleId),
    c.env.DB
      .prepare(
        `INSERT OR REPLACE INTO system_settings (key, value_json, is_protected, updated_at)
         VALUES ('bootstrap.completed', ?, 1, ?)`
      )
      .bind(JSON.stringify({ completed: true, owner_user_id: userId }), new Date().toISOString())
  ]);

  const createdUser = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first<DbUser>();
  if (!createdUser) {
    return fail(c, 500, "SETUP_FAILED", "Owner account could not be created.");
  }

  await recordAudit(c.env.DB, {
    actorUserId: userId,
    action: "bootstrap.owner_created",
    module: "settings",
    entityType: "user",
    entityId: userId,
    newValue: { email, is_owner: true },
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent") ?? null
  });

  const authUser = await toAuthUser(c.env.DB, createdUser);
  const token = await signJwt(jwtSecret, authUser.id, authUser.email);

  return ok(c, {
    token,
    user: authUser
  }, 201);
});
