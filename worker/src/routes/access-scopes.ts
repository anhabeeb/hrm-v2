import { Hono } from "hono";
import type { Context } from "hono";
import { ACCESS_SCOPE_TYPES, accessScopeToApi, stringifyIdList, type AccessScopeRuleRow, type AccessScopeType, type ScopeOwnerType } from "../auth/access-scopes";
import { recordAudit } from "../db/audit";
import { getRoleById } from "../db/roles";
import { getUserById } from "../db/users";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { hasValidationErrors, validateAccessScope, validationResponse } from "../lib/moduleValidation";
import { publishAccessEvent } from "../realtime/publisher";
import type { AppBindings } from "../types";
import { fail, getClientIp, ok } from "../utils/http";
import { readJsonBody, readString } from "../utils/validation";

export const accessScopeRoutes = new Hono<AppBindings>();

accessScopeRoutes.use("*", requireAuth);

const OWNER_TYPES = new Set<ScopeOwnerType>(["ROLE", "USER", "ROLE_MAPPING_RULE"]);
const SCOPE_TYPES = new Set<AccessScopeType>(ACCESS_SCOPE_TYPES);

function bool(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return value === "true" || value === "1";
  return fallback;
}

function optional(value: unknown) {
  const text = readString(value);
  return text || null;
}

function parseIds(value: string | null) {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

async function listScopes(db: AppBindings["Bindings"]["DB"]) {
  const rows = await db.prepare(
    `SELECT asr.*, r.name AS role_name, u.name AS user_name, u.email AS user_email,
      rm.name AS role_mapping_name, rr.name AS role_mapping_role_name
     FROM access_scope_rules asr
     LEFT JOIN roles r ON r.id = asr.role_id
     LEFT JOIN users u ON u.id = asr.user_id
     LEFT JOIN role_mapping_rules rm ON rm.id = asr.role_mapping_rule_id
     LEFT JOIN roles rr ON rr.id = rm.default_role_id
     ORDER BY asr.is_active DESC, asr.scope_owner_type, asr.name`
  ).all<AccessScopeRuleRow>();
  return rows.results;
}

async function getScope(db: AppBindings["Bindings"]["DB"], id: string) {
  return db.prepare(
    `SELECT asr.*, r.name AS role_name, u.name AS user_name, u.email AS user_email,
      rm.name AS role_mapping_name, rr.name AS role_mapping_role_name
     FROM access_scope_rules asr
     LEFT JOIN roles r ON r.id = asr.role_id
     LEFT JOIN users u ON u.id = asr.user_id
     LEFT JOIN role_mapping_rules rm ON rm.id = asr.role_mapping_rule_id
     LEFT JOIN roles rr ON rr.id = rm.default_role_id
     WHERE asr.id = ?`
  ).bind(id).first<AccessScopeRuleRow>();
}

async function auditScope(c: Context<AppBindings>, input: { action: string; entityId?: string | null; oldValue?: unknown; newValue?: unknown; reason?: string | null }) {
  await recordAudit(c.env.DB, {
    actorUserId: c.get("currentUser").id,
    action: input.action,
    module: "access_scopes",
    entityType: "access_scope",
    entityId: input.entityId ?? null,
    oldValue: input.oldValue,
    newValue: input.newValue,
    reason: input.reason ?? null,
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent") ?? null
  });
}

async function readScopeInput(c: Context<AppBindings>, body: Record<string, unknown>, existing?: AccessScopeRuleRow) {
  const scopeOwnerType = (readString(body.scope_owner_type ?? existing?.scope_owner_type) || "ROLE") as ScopeOwnerType;
  const scopeType = (readString(body.scope_type ?? existing?.scope_type) || "OWN_DEPARTMENT") as AccessScopeType;
  if (!OWNER_TYPES.has(scopeOwnerType)) return { error: fail(c, 400, "VALIDATION_ERROR", "Invalid scope owner type.") };
  if (!SCOPE_TYPES.has(scopeType)) return { error: fail(c, 400, "VALIDATION_ERROR", "Invalid access scope type.") };

  const name = readString(body.name ?? existing?.name);
  if (!name) return { error: fail(c, 400, "VALIDATION_ERROR", "Scope name is required.") };

  const roleId = optional(body.role_id ?? existing?.role_id);
  const userId = optional(body.user_id ?? existing?.user_id);
  const roleMappingRuleId = optional(body.role_mapping_rule_id ?? existing?.role_mapping_rule_id);

  if (scopeOwnerType === "ROLE") {
    if (!roleId) return { error: fail(c, 400, "VALIDATION_ERROR", "Role owner is required.") };
    const role = await getRoleById(c.env.DB, roleId);
    if (!role || role.is_active !== 1) return { error: fail(c, 400, "VALIDATION_ERROR", "An active role owner is required.") };
    if (role.is_protected === 1 && scopeType !== "WHOLE_COMPANY") return { error: fail(c, 409, "PROTECTED_OWNER_SCOPE", "Protected Owner/Super Admin role must keep whole-company access.") };
  }
  if (scopeOwnerType === "USER") {
    if (!userId) return { error: fail(c, 400, "VALIDATION_ERROR", "User owner is required.") };
    const user = await getUserById(c.env.DB, userId);
    if (!user) return { error: fail(c, 400, "VALIDATION_ERROR", "User owner was not found.") };
  }
  if (scopeOwnerType === "ROLE_MAPPING_RULE") {
    if (!roleMappingRuleId) return { error: fail(c, 400, "VALIDATION_ERROR", "Role mapping rule is required.") };
    const mapping = await c.env.DB.prepare("SELECT id, is_active FROM role_mapping_rules WHERE id = ?").bind(roleMappingRuleId).first<{ id: string; is_active: number }>();
    if (!mapping || mapping.is_active !== 1) return { error: fail(c, 400, "VALIDATION_ERROR", "An active role mapping rule is required.") };
  }

  const allowedDepartmentIdsJson = stringifyIdList(body.allowed_department_ids) ?? existing?.allowed_department_ids_json ?? null;
  const allowedLocationIdsJson = stringifyIdList(body.allowed_location_ids) ?? existing?.allowed_location_ids_json ?? null;

  const input = {
    name,
    description: optional(body.description ?? existing?.description),
    scope_owner_type: scopeOwnerType,
    role_id: scopeOwnerType === "ROLE" ? roleId : null,
    user_id: scopeOwnerType === "USER" ? userId : null,
    role_mapping_rule_id: scopeOwnerType === "ROLE_MAPPING_RULE" ? roleMappingRuleId : null,
    module_key: optional(body.module_key ?? existing?.module_key),
    scope_type: scopeType,
    allowed_department_ids_json: allowedDepartmentIdsJson,
    allowed_location_ids_json: allowedLocationIdsJson,
    include_sub_departments: bool(body.include_sub_departments, existing?.include_sub_departments === 1),
    include_reporting_chain: bool(body.include_reporting_chain, existing?.include_reporting_chain === 1),
    can_view: bool(body.can_view, existing?.can_view !== 0),
    can_manage: bool(body.can_manage, existing?.can_manage === 1),
    is_active: bool(body.is_active, existing?.is_active !== 0)
  };
  const accessIssues = await validateAccessScope(c.env.DB, c.get("currentUser"), {
    departmentIds: parseIds(input.allowed_department_ids_json),
    locationIds: parseIds(input.allowed_location_ids_json),
    requestedScopeType: input.scope_type
  });
  if (hasValidationErrors(accessIssues)) return { error: validationResponse(c, accessIssues) };

  return { input };
}

accessScopeRoutes.get("/", requirePermission("access_scopes.view"), async (c) => ok(c, { access_scopes: (await listScopes(c.env.DB)).map(accessScopeToApi) }));

accessScopeRoutes.get("/:id", requirePermission("access_scopes.view"), async (c) => {
  const scope = await getScope(c.env.DB, c.req.param("id"));
  if (!scope) return fail(c, 404, "NOT_FOUND", "Access scope was not found.");
  return ok(c, { access_scope: accessScopeToApi(scope) });
});

accessScopeRoutes.post("/", requirePermission("access_scopes.manage"), async (c) => {
  const parsed = await readScopeInput(c, await readJsonBody(c.req.raw));
  if (parsed.error) return parsed.error;
  const input = parsed.input;
  const id = crypto.randomUUID();
  const actor = c.get("currentUser").id;
  await c.env.DB.prepare(
    `INSERT INTO access_scope_rules (
      id, name, description, scope_owner_type, role_id, user_id, role_mapping_rule_id, module_key, scope_type,
      allowed_department_ids_json, allowed_location_ids_json, include_sub_departments, include_reporting_chain,
      can_view, can_manage, is_active, created_by_user_id, updated_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, input.name, input.description, input.scope_owner_type, input.role_id, input.user_id, input.role_mapping_rule_id, input.module_key, input.scope_type, input.allowed_department_ids_json, input.allowed_location_ids_json, input.include_sub_departments ? 1 : 0, input.include_reporting_chain ? 1 : 0, input.can_view ? 1 : 0, input.can_manage ? 1 : 0, input.is_active ? 1 : 0, actor, actor).run();
  await auditScope(c, { action: "access_scope.created", entityId: id, newValue: input });
  await publishAccessEvent(c.env, "access.changed", { actor_user_id: actor, entity_type: "access_scope", entity_id: id, action: "created" });
  const saved = await getScope(c.env.DB, id);
  return ok(c, { access_scope: saved ? accessScopeToApi(saved) : null }, 201);
});

accessScopeRoutes.patch("/:id", requirePermission("access_scopes.manage"), async (c) => {
  const old = await getScope(c.env.DB, c.req.param("id"));
  if (!old) return fail(c, 404, "NOT_FOUND", "Access scope was not found.");
  const parsed = await readScopeInput(c, await readJsonBody(c.req.raw), old);
  if (parsed.error) return parsed.error;
  const input = parsed.input;
  await c.env.DB.prepare(
    `UPDATE access_scope_rules
     SET name = ?, description = ?, scope_owner_type = ?, role_id = ?, user_id = ?, role_mapping_rule_id = ?,
      module_key = ?, scope_type = ?, allowed_department_ids_json = ?, allowed_location_ids_json = ?,
      include_sub_departments = ?, include_reporting_chain = ?, can_view = ?, can_manage = ?, is_active = ?,
      updated_by_user_id = ?, updated_at = ?
     WHERE id = ?`
  ).bind(input.name, input.description, input.scope_owner_type, input.role_id, input.user_id, input.role_mapping_rule_id, input.module_key, input.scope_type, input.allowed_department_ids_json, input.allowed_location_ids_json, input.include_sub_departments ? 1 : 0, input.include_reporting_chain ? 1 : 0, input.can_view ? 1 : 0, input.can_manage ? 1 : 0, input.is_active ? 1 : 0, c.get("currentUser").id, new Date().toISOString(), old.id).run();
  await auditScope(c, { action: "access_scope.updated", entityId: old.id, oldValue: accessScopeToApi(old), newValue: input });
  const saved = await getScope(c.env.DB, old.id);
  return ok(c, { access_scope: saved ? accessScopeToApi(saved) : null });
});

async function setScopeActive(c: Context<AppBindings>, active: 0 | 1) {
  const id = c.req.param("id");
  if (!id) return fail(c, 400, "VALIDATION_ERROR", "Access scope id is required.");
  const scope = await getScope(c.env.DB, id);
  if (!scope) return fail(c, 404, "NOT_FOUND", "Access scope was not found.");
  if (scope.role_id) {
    const role = await getRoleById(c.env.DB, scope.role_id);
    if (role?.is_protected === 1 && active === 0) return fail(c, 409, "PROTECTED_OWNER_SCOPE", "Protected Owner/Super Admin access scope cannot be disabled.");
  }
  await c.env.DB.prepare("UPDATE access_scope_rules SET is_active = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?").bind(active, c.get("currentUser").id, new Date().toISOString(), scope.id).run();
  await auditScope(c, { action: active ? "access_scope.enabled" : "access_scope.disabled", entityId: scope.id, oldValue: { is_active: scope.is_active === 1 }, newValue: { is_active: active === 1 } });
  const saved = await getScope(c.env.DB, scope.id);
  return ok(c, { access_scope: saved ? accessScopeToApi(saved) : null });
}

accessScopeRoutes.post("/:id/enable", requirePermission("access_scopes.manage"), (c) => setScopeActive(c, 1));
accessScopeRoutes.post("/:id/disable", requirePermission("access_scopes.manage"), (c) => setScopeActive(c, 0));
