import { Hono } from "hono";
import { canAccessEmployee } from "../auth/access-scopes";
import { getSecuritySessionSettings } from "../auth/session";
import { getChangesSinceVersion, getCurrentSyncVersion, pullChangedEntitiesForUser, type SyncChangeRow } from "../db/sync";
import { requireAuth } from "../middleware/auth";
import type { AppBindings } from "../types";
import { fail, ok } from "../utils/http";
import { getModuleVisibilityForUser } from "../utils/module-enforcement";
import { readJsonBody, readString } from "../utils/validation";

export const syncRoutes = new Hono<AppBindings>();

syncRoutes.use("*", requireAuth);

const CACHE_SCHEMA_VERSION = 1;

async function visibleModules(db: AppBindings["Bindings"]["DB"], user: AppBindings["Variables"]["currentUser"]) {
  return getModuleVisibilityForUser(db, user);
}

async function canOpenModule(db: AppBindings["Bindings"]["DB"], moduleKey: string, user: AppBindings["Variables"]["currentUser"]) {
  const visibility = await visibleModules(db, user);
  return Boolean(visibility[moduleKey]);
}

function parseModules(value: string | undefined) {
  return (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

syncRoutes.get("/bootstrap", async (c) => {
  const user = c.get("currentUser");
  const settings = await getSecuritySessionSettings(c.env.DB);
  const moduleVisibility = await visibleModules(c.env.DB, user);
  return ok(c, {
    user: { ...user, module_visibility: moduleVisibility },
    module_visibility: moduleVisibility,
    settings_summary: {
      idle_timeout_enabled: settings.idle_timeout_enabled,
      idle_timeout_minutes: settings.idle_timeout_minutes,
      warn_before_logout_seconds: settings.warn_before_logout_seconds,
      cache_mode: "server_authoritative_indexeddb_assisted"
    },
    current_version: await getCurrentSyncVersion(c.env.DB),
    cache_schema_version: CACHE_SCHEMA_VERSION,
    rule: "OmniCore - HR frontend cache is server-authoritative and IndexedDB-assisted."
  });
});

syncRoutes.get("/module/:moduleKey", async (c) => {
  const user = c.get("currentUser");
  const moduleKey = c.req.param("moduleKey");
  if (!(await canOpenModule(c.env.DB, moduleKey, user))) {
    return fail(c, 404, "SYNC_MODULE_NOT_FOUND", "Module data was not found.");
  }
  return ok(c, {
    module_key: moduleKey,
    current_version: await getCurrentSyncVersion(c.env.DB),
    data: {},
    note: "Use the canonical module API for server-authoritative data. This endpoint provides targeted cache cursor metadata."
  });
});

syncRoutes.get("/entity/:entityType/:entityId", async (c) => {
  const user = c.get("currentUser");
  const entityType = c.req.param("entityType");
  const entityId = c.req.param("entityId");
  if (entityType === "employee") {
    const allowed = await canAccessEmployee(c.env.DB, user, entityId, "employees", "view");
    if (!allowed) return fail(c, 404, "SYNC_ENTITY_NOT_FOUND", "Entity was not found.");
  }
  return ok(c, {
    entity_type: entityType,
    entity_id: entityId,
    current_version: await getCurrentSyncVersion(c.env.DB),
    data: {},
    note: "Use the canonical entity API for record data. This endpoint is for targeted cache refresh metadata."
  });
});

syncRoutes.get("/changes", async (c) => {
  const sinceVersion = Math.max(Number(c.req.query("sinceVersion") ?? 0), 0);
  const modules = parseModules(c.req.query("modules"));
  const changes = await getChangesSinceVersion(c.env.DB, c.get("currentUser"), sinceVersion, modules);
  return ok(c, { current_version: await getCurrentSyncVersion(c.env.DB), changes });
});

syncRoutes.post("/pull", async (c) => {
  const body = await readJsonBody(c.req.raw);
  const moduleKey = readString(body.module_key) || readString(body.moduleKey);
  const entityType = readString(body.entity_type) || readString(body.entityType);
  const entityId = readString(body.entity_id) || readString(body.entityId);
  if (!moduleKey && !entityType) return fail(c, 400, "SYNC_PULL_INVALID", "Module or entity type is required.");
  if (moduleKey && !(await canOpenModule(c.env.DB, moduleKey, c.get("currentUser")))) {
    return fail(c, 404, "SYNC_MODULE_NOT_FOUND", "Module data was not found.");
  }
  return ok(c, {
    current_version: await getCurrentSyncVersion(c.env.DB),
    data: { module_key: moduleKey, entity_type: entityType, entity_id: entityId },
    note: "Targeted pull acknowledged. Use canonical APIs for server-authoritative row data."
  });
});

syncRoutes.post("/pull-entities", async (c) => {
  const body = await readJsonBody(c.req.raw);
  const changes = Array.isArray(body.changes) ? body.changes as SyncChangeRow[] : [];
  const records = await pullChangedEntitiesForUser(c.env.DB, c.get("currentUser"), changes);
  return ok(c, { records, current_version: await getCurrentSyncVersion(c.env.DB) });
});
