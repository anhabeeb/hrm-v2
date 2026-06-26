import { Hono } from "hono";
import type { Context } from "hono";
import { ACCESS_SCOPE_TYPES, accessScopeToApi, stringifyIdList, type AccessScopeRuleRow, type AccessScopeType } from "../auth/access-scopes";
import { recordAudit } from "../db/audit";
import { getRoleById } from "../db/roles";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { hasValidationErrors, validateAccessScope, validateOrganizationCascade, validationIssue, validationResponse } from "../lib/moduleValidation";
import { publishAccessEvent } from "../realtime/publisher";
import type { AppBindings } from "../types";
import { fail, getClientIp, ok } from "../utils/http";
import { readJsonBody, readString } from "../utils/validation";

export const roleMappingRoutes = new Hono<AppBindings>();

roleMappingRoutes.use("*", requireAuth);

const EMPLOYEE_TYPES = new Set(["LOCAL", "FOREIGN", "OTHER"]);
const EMPLOYMENT_TYPES = new Set(["FULL_TIME", "PART_TIME", "INTERN", "TEMPORARY", "CONTRACT"]);
const SCOPE_TYPES = new Set<AccessScopeType>(ACCESS_SCOPE_TYPES);

interface RoleMappingRuleRow {
  id: string;
  name: string;
  description: string | null;
  default_role_id: string;
  role_name?: string | null;
  employee_type: string | null;
  employment_type: string | null;
  department_id: string | null;
  department_name?: string | null;
  position_id: string | null;
  position_title?: string | null;
  location_id: string | null;
  location_name?: string | null;
  job_level_id: string | null;
  job_level_name?: string | null;
  default_scope_type: AccessScopeType;
  allowed_department_ids_json: string | null;
  allowed_location_ids_json: string | null;
  include_sub_departments: number;
  include_reporting_chain: number;
  can_view: number;
  can_manage: number;
  priority: number;
  is_active: number;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

interface MappingEmployeeRow {
  id: string;
  employee_no: string;
  full_name: string;
  employee_type: string;
  employment_type: string;
  primary_department_id: string | null;
  primary_position_id: string | null;
  primary_location_id: string | null;
  job_level_id: string | null;
  user_id: string | null;
  linked_user_email: string | null;
}

function bool(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return value === "true" || value === "1";
  return fallback;
}

function num(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

function toMappingApi(row: RoleMappingRuleRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    default_role_id: row.default_role_id,
    role_name: row.role_name ?? null,
    employee_type: row.employee_type,
    employment_type: row.employment_type,
    department_id: row.department_id,
    department_name: row.department_name ?? null,
    position_id: row.position_id,
    position_title: row.position_title ?? null,
    location_id: row.location_id,
    location_name: row.location_name ?? null,
    job_level_id: row.job_level_id,
    job_level_name: row.job_level_name ?? null,
    default_scope_type: row.default_scope_type,
    allowed_department_ids: parseIds(row.allowed_department_ids_json),
    allowed_location_ids: parseIds(row.allowed_location_ids_json),
    include_sub_departments: row.include_sub_departments === 1,
    include_reporting_chain: row.include_reporting_chain === 1,
    can_view: row.can_view === 1,
    can_manage: row.can_manage === 1,
    priority: row.priority,
    is_active: row.is_active === 1,
    created_by_user_id: row.created_by_user_id,
    updated_by_user_id: row.updated_by_user_id,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function listMappings(db: AppBindings["Bindings"]["DB"]) {
  const rows = await db.prepare(
    `SELECT rm.*, r.name AS role_name, d.name AS department_name, p.title AS position_title,
      l.name AS location_name, jl.name AS job_level_name
     FROM role_mapping_rules rm
     INNER JOIN roles r ON r.id = rm.default_role_id
     LEFT JOIN departments d ON d.id = rm.department_id
     LEFT JOIN positions p ON p.id = rm.position_id
     LEFT JOIN locations l ON l.id = rm.location_id
     LEFT JOIN job_levels jl ON jl.id = rm.job_level_id
     ORDER BY rm.is_active DESC, rm.priority DESC, rm.name`
  ).all<RoleMappingRuleRow>();
  return rows.results;
}

async function getMapping(db: AppBindings["Bindings"]["DB"], id: string) {
  return db.prepare(
    `SELECT rm.*, r.name AS role_name, d.name AS department_name, p.title AS position_title,
      l.name AS location_name, jl.name AS job_level_name
     FROM role_mapping_rules rm
     INNER JOIN roles r ON r.id = rm.default_role_id
     LEFT JOIN departments d ON d.id = rm.department_id
     LEFT JOIN positions p ON p.id = rm.position_id
     LEFT JOIN locations l ON l.id = rm.location_id
     LEFT JOIN job_levels jl ON jl.id = rm.job_level_id
     WHERE rm.id = ?`
  ).bind(id).first<RoleMappingRuleRow>();
}

async function getEmployee(db: AppBindings["Bindings"]["DB"], employeeId: string) {
  return db.prepare(
    `SELECT e.id, e.employee_no, e.full_name, e.employee_type, e.employment_type,
      e.primary_department_id, e.primary_position_id, e.primary_location_id, e.job_level_id,
      e.user_id, u.email AS linked_user_email
     FROM employees e
     LEFT JOIN users u ON u.id = e.user_id
     WHERE e.id = ? AND e.archived_at IS NULL`
  ).bind(employeeId).first<MappingEmployeeRow>();
}

function matches(row: RoleMappingRuleRow, employee: MappingEmployeeRow) {
  return (!row.employee_type || row.employee_type === employee.employee_type)
    && (!row.employment_type || row.employment_type === employee.employment_type)
    && (!row.department_id || row.department_id === employee.primary_department_id)
    && (!row.position_id || row.position_id === employee.primary_position_id)
    && (!row.location_id || row.location_id === employee.primary_location_id)
    && (!row.job_level_id || row.job_level_id === employee.job_level_id);
}

async function findSuggestedMapping(db: AppBindings["Bindings"]["DB"], employee: MappingEmployeeRow) {
  const rows = (await listMappings(db)).filter((row) => row.is_active === 1);
  return rows.find((row) => matches(row, employee)) ?? null;
}

async function currentUserAccess(db: AppBindings["Bindings"]["DB"], userId: string | null) {
  if (!userId) return { roles: [], scopes: [] };
  const roles = await db.prepare(
    `SELECT r.id, r.name
     FROM roles r INNER JOIN user_roles ur ON ur.role_id = r.id
     WHERE ur.user_id = ?
     ORDER BY r.name`
  ).bind(userId).all<{ id: string; name: string }>();
  const scopes = await db.prepare(
    `SELECT asr.*, r.name AS role_name, u.name AS user_name, u.email AS user_email,
      rm.name AS role_mapping_name, rr.name AS role_mapping_role_name
     FROM access_scope_rules asr
     LEFT JOIN roles r ON r.id = asr.role_id
     LEFT JOIN users u ON u.id = asr.user_id
     LEFT JOIN role_mapping_rules rm ON rm.id = asr.role_mapping_rule_id
     LEFT JOIN roles rr ON rr.id = rm.default_role_id
     WHERE asr.scope_owner_type = 'USER' AND asr.user_id = ?
     ORDER BY asr.is_active DESC, asr.created_at DESC`
  ).bind(userId).all<AccessScopeRuleRow>();
  return { roles: roles.results, scopes: scopes.results.map(accessScopeToApi) };
}

async function auditMapping(c: Context<AppBindings>, input: { action: string; entityId?: string | null; oldValue?: unknown; newValue?: unknown; reason?: string | null }) {
  await recordAudit(c.env.DB, {
    actorUserId: c.get("currentUser").id,
    action: input.action,
    module: "role_mappings",
    entityType: "role_mapping_rule",
    entityId: input.entityId ?? null,
    oldValue: input.oldValue,
    newValue: input.newValue,
    reason: input.reason ?? null,
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent") ?? null
  });
}

async function readMappingInput(c: Context<AppBindings>, body: Record<string, unknown>, existing?: RoleMappingRuleRow) {
  const roleId = readString(body.default_role_id ?? existing?.default_role_id);
  const role = roleId ? await getRoleById(c.env.DB, roleId) : null;
  if (!role || role.is_active !== 1) return { error: fail(c, 400, "VALIDATION_ERROR", "An active default role is required.") };
  if (role.is_protected === 1) return { error: fail(c, 409, "PROTECTED_ROLE", "Protected Owner/Super Admin role cannot be used in role mapping.") };

  const employeeType = optional(body.employee_type ?? existing?.employee_type);
  const employmentType = optional(body.employment_type ?? existing?.employment_type);
  const scopeType = (readString(body.default_scope_type ?? existing?.default_scope_type) || "SELF_ONLY") as AccessScopeType;
  if (employeeType && !EMPLOYEE_TYPES.has(employeeType)) return { error: fail(c, 400, "VALIDATION_ERROR", "Invalid employee type.") };
  if (employmentType && !EMPLOYMENT_TYPES.has(employmentType)) return { error: fail(c, 400, "VALIDATION_ERROR", "Invalid employment type.") };
  if (!SCOPE_TYPES.has(scopeType)) return { error: fail(c, 400, "VALIDATION_ERROR", "Invalid default scope type.") };

  const name = readString(body.name ?? existing?.name);
  if (!name) return { error: fail(c, 400, "VALIDATION_ERROR", "Mapping name is required.") };

  const input = {
    name,
    description: optional(body.description ?? existing?.description),
    default_role_id: roleId,
    employee_type: employeeType,
    employment_type: employmentType,
    department_id: optional(body.department_id ?? existing?.department_id),
    position_id: optional(body.position_id ?? existing?.position_id),
    location_id: optional(body.location_id ?? existing?.location_id),
    job_level_id: optional(body.job_level_id ?? existing?.job_level_id),
    default_scope_type: scopeType,
    allowed_department_ids_json: stringifyIdList(body.allowed_department_ids) ?? existing?.allowed_department_ids_json ?? null,
    allowed_location_ids_json: stringifyIdList(body.allowed_location_ids) ?? existing?.allowed_location_ids_json ?? null,
    include_sub_departments: bool(body.include_sub_departments, existing?.include_sub_departments === 1),
    include_reporting_chain: bool(body.include_reporting_chain, existing?.include_reporting_chain === 1),
    can_view: bool(body.can_view, existing?.can_view !== 0),
    can_manage: bool(body.can_manage, existing?.can_manage === 1),
    priority: num(body.priority, existing?.priority ?? 100),
    is_active: bool(body.is_active, existing?.is_active !== 0)
  };
  const scopeIssues = await validateAccessScope(c.env.DB, c.get("currentUser"), {
    departmentIds: parseIds(input.allowed_department_ids_json),
    locationIds: parseIds(input.allowed_location_ids_json),
    requestedScopeType: input.default_scope_type
  });
  const allowedDepartmentIds = parseIds(input.allowed_department_ids_json);
  const allowedLocationIds = parseIds(input.allowed_location_ids_json);
  const mappingScopeIssues = [
    ...(scopeType === "SELECTED_DEPARTMENTS" && input.department_id && !allowedDepartmentIds.includes(input.department_id)
      ? [validationIssue("ROLE_MAPPING_DEPARTMENT_OUTSIDE_SCOPE", "department_id", "Selected mapping department is outside the allowed department scope.", "error", { departmentId: input.department_id, allowedDepartmentIds })]
      : []),
    ...(scopeType === "SELECTED_LOCATIONS" && input.location_id && !allowedLocationIds.includes(input.location_id)
      ? [validationIssue("ROLE_MAPPING_LOCATION_OUTSIDE_SCOPE", "location_id", "Selected mapping location is outside the allowed location scope.", "error", { locationId: input.location_id, allowedLocationIds })]
      : [])
  ];
  const cascadeIssues = await validateOrganizationCascade(c.env.DB, input);
  const issues = [...cascadeIssues, ...scopeIssues, ...mappingScopeIssues];
  if (hasValidationErrors(issues)) return { error: validationResponse(c, issues) };

  return { input };
}

roleMappingRoutes.get("/", requirePermission("role_mappings.view"), async (c) => ok(c, { role_mappings: (await listMappings(c.env.DB)).map(toMappingApi) }));

roleMappingRoutes.get("/preview/:employeeId", requirePermission("role_mappings.view"), async (c) => {
  const preview = await roleMappingPreviewForEmployee(c, c.req.param("employeeId"));
  if (!preview) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  return ok(c, { preview });
});

roleMappingRoutes.get("/:id", requirePermission("role_mappings.view"), async (c) => {
  const mapping = await getMapping(c.env.DB, c.req.param("id"));
  if (!mapping) return fail(c, 404, "NOT_FOUND", "Role mapping rule was not found.");
  return ok(c, { role_mapping: toMappingApi(mapping) });
});

roleMappingRoutes.post("/", requirePermission("role_mappings.manage"), async (c) => {
  const parsed = await readMappingInput(c, await readJsonBody(c.req.raw));
  if (parsed.error) return parsed.error;
  const input = parsed.input;
  const id = crypto.randomUUID();
  const actor = c.get("currentUser").id;
  await c.env.DB.prepare(
    `INSERT INTO role_mapping_rules (
      id, name, description, default_role_id, employee_type, employment_type, department_id,
      position_id, location_id, job_level_id, default_scope_type, allowed_department_ids_json,
      allowed_location_ids_json, include_sub_departments, include_reporting_chain, can_view,
      can_manage, priority, is_active, created_by_user_id, updated_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, input.name, input.description, input.default_role_id, input.employee_type, input.employment_type, input.department_id, input.position_id, input.location_id, input.job_level_id, input.default_scope_type, input.allowed_department_ids_json, input.allowed_location_ids_json, input.include_sub_departments ? 1 : 0, input.include_reporting_chain ? 1 : 0, input.can_view ? 1 : 0, input.can_manage ? 1 : 0, input.priority, input.is_active ? 1 : 0, actor, actor).run();
  await auditMapping(c, { action: "role_mapping.created", entityId: id, newValue: input });
  await publishAccessEvent(c.env, "access.changed", { actor_user_id: actor, entity_type: "role_mapping_rule", entity_id: id, action: "created" });
  const saved = await getMapping(c.env.DB, id);
  return ok(c, { role_mapping: saved ? toMappingApi(saved) : null }, 201);
});

roleMappingRoutes.patch("/:id", requirePermission("role_mappings.manage"), async (c) => {
  const old = await getMapping(c.env.DB, c.req.param("id"));
  if (!old) return fail(c, 404, "NOT_FOUND", "Role mapping rule was not found.");
  const parsed = await readMappingInput(c, await readJsonBody(c.req.raw), old);
  if (parsed.error) return parsed.error;
  const input = parsed.input;
  await c.env.DB.prepare(
    `UPDATE role_mapping_rules
     SET name = ?, description = ?, default_role_id = ?, employee_type = ?, employment_type = ?,
      department_id = ?, position_id = ?, location_id = ?, job_level_id = ?, default_scope_type = ?,
      allowed_department_ids_json = ?, allowed_location_ids_json = ?, include_sub_departments = ?,
      include_reporting_chain = ?, can_view = ?, can_manage = ?, priority = ?, is_active = ?,
      updated_by_user_id = ?, updated_at = ?
     WHERE id = ?`
  ).bind(input.name, input.description, input.default_role_id, input.employee_type, input.employment_type, input.department_id, input.position_id, input.location_id, input.job_level_id, input.default_scope_type, input.allowed_department_ids_json, input.allowed_location_ids_json, input.include_sub_departments ? 1 : 0, input.include_reporting_chain ? 1 : 0, input.can_view ? 1 : 0, input.can_manage ? 1 : 0, input.priority, input.is_active ? 1 : 0, c.get("currentUser").id, new Date().toISOString(), old.id).run();
  await auditMapping(c, { action: "role_mapping.updated", entityId: old.id, oldValue: toMappingApi(old), newValue: input });
  const saved = await getMapping(c.env.DB, old.id);
  return ok(c, { role_mapping: saved ? toMappingApi(saved) : null });
});

async function mappingActive(c: Context<AppBindings>, active: 0 | 1) {
  const id = c.req.param("id");
  if (!id) return fail(c, 400, "VALIDATION_ERROR", "Role mapping id is required.");
  const mapping = await getMapping(c.env.DB, id);
  if (!mapping) return fail(c, 404, "NOT_FOUND", "Role mapping rule was not found.");
  await c.env.DB.prepare("UPDATE role_mapping_rules SET is_active = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?").bind(active, c.get("currentUser").id, new Date().toISOString(), mapping.id).run();
  await auditMapping(c, { action: active ? "role_mapping.enabled" : "role_mapping.disabled", entityId: mapping.id, oldValue: { is_active: mapping.is_active === 1 }, newValue: { is_active: active === 1 } });
  const saved = await getMapping(c.env.DB, mapping.id);
  return ok(c, { role_mapping: saved ? toMappingApi(saved) : null });
}

roleMappingRoutes.post("/:id/enable", requirePermission("role_mappings.manage"), (c) => mappingActive(c, 1));
roleMappingRoutes.post("/:id/disable", requirePermission("role_mappings.manage"), (c) => mappingActive(c, 0));

export async function roleMappingPreviewForEmployee(c: Context<AppBindings>, employeeId: string) {
  const employee = await getEmployee(c.env.DB, employeeId);
  if (!employee) return null;
  const suggested = await findSuggestedMapping(c.env.DB, employee);
  const current = await currentUserAccess(c.env.DB, employee.user_id);
  return {
    employee,
    linked_user: employee.user_id ? { id: employee.user_id, email: employee.linked_user_email } : null,
    assigned_roles: current.roles,
    assigned_scopes: current.scopes,
    suggested_role_mapping: suggested ? toMappingApi(suggested) : null,
    suggested_role: suggested ? { id: suggested.default_role_id, name: suggested.role_name ?? "Suggested role" } : null,
    suggested_scope: suggested ? {
      scope_type: suggested.default_scope_type,
      allowed_department_ids: parseIds(suggested.allowed_department_ids_json),
      allowed_location_ids: parseIds(suggested.allowed_location_ids_json),
      include_sub_departments: suggested.include_sub_departments === 1,
      include_reporting_chain: suggested.include_reporting_chain === 1,
      can_view: suggested.can_view === 1,
      can_manage: suggested.can_manage === 1
    } : null
  };
}

export async function applyRoleMappingToEmployee(c: Context<AppBindings>, employeeId: string, mappingId?: string | null) {
  const employee = await getEmployee(c.env.DB, employeeId);
  if (!employee) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  if (!employee.user_id) return fail(c, 409, "NO_LINKED_USER", "Employee does not have a linked user account.");
  const mapping = mappingId ? await getMapping(c.env.DB, mappingId) : await findSuggestedMapping(c.env.DB, employee);
  if (!mapping || mapping.is_active !== 1) return fail(c, 404, "NOT_FOUND", "No active role mapping matched this employee.");

  const templateScopes = (await c.env.DB.prepare(
    `SELECT * FROM access_scope_rules
     WHERE scope_owner_type = 'ROLE_MAPPING_RULE' AND role_mapping_rule_id = ? AND is_active = 1
     ORDER BY module_key`
  ).bind(mapping.id).all<AccessScopeRuleRow>()).results;
  const actor = c.get("currentUser").id;
  const scopes = templateScopes.length
    ? templateScopes.map((scope) => ({
        name: scope.name,
        description: scope.description ?? `Applied from role mapping ${mapping.name}.`,
        module_key: scope.module_key,
        scope_type: scope.scope_type,
        allowed_department_ids_json: scope.allowed_department_ids_json,
        allowed_location_ids_json: scope.allowed_location_ids_json,
        include_sub_departments: scope.include_sub_departments,
        include_reporting_chain: scope.include_reporting_chain,
        can_view: scope.can_view,
        can_manage: scope.can_manage
      }))
    : [{
        name: `Scope from ${mapping.name}`,
        description: "Applied from role mapping.",
        module_key: null,
        scope_type: mapping.default_scope_type,
        allowed_department_ids_json: mapping.allowed_department_ids_json,
        allowed_location_ids_json: mapping.allowed_location_ids_json,
        include_sub_departments: mapping.include_sub_departments,
        include_reporting_chain: mapping.include_reporting_chain,
        can_view: mapping.can_view,
        can_manage: mapping.can_manage
      }];

  const appliedScopeIds: string[] = [];
  const existingRole = await c.env.DB.prepare(
    "SELECT role_id FROM user_roles WHERE user_id = ? AND role_id = ? LIMIT 1"
  ).bind(employee.user_id, mapping.default_role_id).first<{ role_id: string }>();
  try {
    const writes: D1PreparedStatement[] = [];
    for (const scope of scopes) {
      const existing = await c.env.DB.prepare(
        `SELECT id FROM access_scope_rules
         WHERE scope_owner_type = 'USER' AND user_id = ? AND role_mapping_rule_id = ?
           AND COALESCE(module_key, '') = COALESCE(?, '')
         ORDER BY created_at LIMIT 1`
      ).bind(employee.user_id, mapping.id, scope.module_key).first<{ id: string }>();
      if (existing) {
        writes.push(c.env.DB.prepare(
          `UPDATE access_scope_rules
           SET name = ?, description = ?, module_key = ?, scope_type = ?, allowed_department_ids_json = ?,
            allowed_location_ids_json = ?, include_sub_departments = ?, include_reporting_chain = ?,
            can_view = ?, can_manage = ?, is_active = 1, updated_by_user_id = ?, updated_at = ?
           WHERE id = ?`
        ).bind(scope.name, scope.description, scope.module_key, scope.scope_type, scope.allowed_department_ids_json, scope.allowed_location_ids_json, scope.include_sub_departments, scope.include_reporting_chain, scope.can_view, scope.can_manage, actor, new Date().toISOString(), existing.id));
        appliedScopeIds.push(existing.id);
      } else {
        const scopeId = crypto.randomUUID();
        writes.push(c.env.DB.prepare(
          `INSERT INTO access_scope_rules (
            id, name, description, scope_owner_type, user_id, role_mapping_rule_id, module_key, scope_type,
            allowed_department_ids_json, allowed_location_ids_json, include_sub_departments, include_reporting_chain,
            can_view, can_manage, is_active, created_by_user_id, updated_by_user_id
          ) VALUES (?, ?, ?, 'USER', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
        ).bind(scopeId, scope.name, scope.description, employee.user_id, mapping.id, scope.module_key, scope.scope_type, scope.allowed_department_ids_json, scope.allowed_location_ids_json, scope.include_sub_departments, scope.include_reporting_chain, scope.can_view, scope.can_manage, actor, actor));
        appliedScopeIds.push(scopeId);
      }
    }
    writes.push(c.env.DB.prepare("INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)").bind(employee.user_id, mapping.default_role_id));
    await c.env.DB.batch(writes);
  } catch {
    if (!existingRole) {
      await c.env.DB.prepare("DELETE FROM user_roles WHERE user_id = ? AND role_id = ?").bind(employee.user_id, mapping.default_role_id).run().catch(() => undefined);
    }
    return fail(c, 500, "ROLE_MAPPING_APPLY_FAILED", "Role mapping could not be applied safely. No partial role assignment was kept.");
  }

  await auditMapping(c, { action: "role_mapping.applied_to_user", entityId: mapping.id, newValue: { employee_id: employee.id, user_id: employee.user_id, role_id: mapping.default_role_id, scope_ids: appliedScopeIds } });
  await publishAccessEvent(c.env, "access.changed", { actor_user_id: actor, entity_type: "role_mapping_rule", entity_id: mapping.id, action: "applied_to_user" });
  return ok(c, { applied: true, preview: await roleMappingPreviewForEmployee(c, employee.id) });
}

roleMappingRoutes.post("/apply/:employeeId", requirePermission("role_mappings.apply"), async (c) => {
  const body = await readJsonBody(c.req.raw).catch(() => ({} as Record<string, unknown>));
  return applyRoleMappingToEmployee(c, c.req.param("employeeId"), optional(body.role_mapping_rule_id));
});
