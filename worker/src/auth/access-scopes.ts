import type { AuthUser, Env } from "../types";

export const ACCESS_SCOPE_TYPES = [
  "SELF_ONLY",
  "OWN_TEAM",
  "OWN_DEPARTMENT",
  "SELECTED_DEPARTMENTS",
  "OWN_LOCATION",
  "SELECTED_LOCATIONS",
  "ALL_LOCATIONS",
  "WHOLE_COMPANY"
] as const;

export type AccessScopeType = (typeof ACCESS_SCOPE_TYPES)[number];
export type ScopeOwnerType = "ROLE" | "USER" | "ROLE_MAPPING_RULE";

export interface AccessScopeRuleRow {
  id: string;
  name: string;
  description: string | null;
  scope_owner_type: ScopeOwnerType;
  role_id: string | null;
  role_name?: string | null;
  user_id: string | null;
  user_name?: string | null;
  user_email?: string | null;
  role_mapping_rule_id: string | null;
  role_mapping_name?: string | null;
  role_mapping_role_name?: string | null;
  module_key: string | null;
  scope_type: AccessScopeType;
  allowed_department_ids_json: string | null;
  allowed_location_ids_json: string | null;
  include_sub_departments: number;
  include_reporting_chain: number;
  can_view: number;
  can_manage: number;
  is_active: number;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

function parseIds(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
  } catch {
    return [];
  }
}

export function stringifyIdList(value: unknown) {
  if (!Array.isArray(value)) return null;
  const ids = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
  return JSON.stringify(Array.from(new Set(ids)));
}

export function accessScopeToApi(row: AccessScopeRuleRow) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    scope_owner_type: row.scope_owner_type,
    role_id: row.role_id,
    role_name: row.role_name ?? null,
    user_id: row.user_id,
    user_name: row.user_name ?? null,
    user_email: row.user_email ?? null,
    role_mapping_rule_id: row.role_mapping_rule_id,
    role_mapping_name: row.role_mapping_name ?? null,
    role_mapping_role_name: row.role_mapping_role_name ?? null,
    module_key: row.module_key,
    scope_type: row.scope_type,
    allowed_department_ids: parseIds(row.allowed_department_ids_json),
    allowed_location_ids: parseIds(row.allowed_location_ids_json),
    include_sub_departments: row.include_sub_departments === 1,
    include_reporting_chain: row.include_reporting_chain === 1,
    can_view: row.can_view === 1,
    can_manage: row.can_manage === 1,
    is_active: row.is_active === 1,
    created_by_user_id: row.created_by_user_id,
    updated_by_user_id: row.updated_by_user_id,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

export async function getUserAccessScopes(db: Env["DB"], userId: string, moduleKey?: string | null) {
  const moduleClause = moduleKey ? "AND (asr.module_key IS NULL OR asr.module_key = ?)" : "";
  const rows = await db.prepare(
    `SELECT DISTINCT asr.*, r.name AS role_name, u.name AS user_name, u.email AS user_email,
      rm.name AS role_mapping_name, rr.name AS role_mapping_role_name
     FROM access_scope_rules asr
     LEFT JOIN roles r ON r.id = asr.role_id
     LEFT JOIN users u ON u.id = asr.user_id
     LEFT JOIN role_mapping_rules rm ON rm.id = asr.role_mapping_rule_id
     LEFT JOIN roles rr ON rr.id = rm.default_role_id
     LEFT JOIN user_roles ur ON ur.role_id = asr.role_id
     WHERE asr.is_active = 1
       AND (asr.scope_owner_type = 'USER' AND asr.user_id = ?
         OR asr.scope_owner_type = 'ROLE' AND ur.user_id = ?)
       ${moduleClause}
     ORDER BY CASE asr.scope_owner_type WHEN 'USER' THEN 0 ELSE 1 END, asr.created_at DESC`
  ).bind(...(moduleKey ? [userId, userId, moduleKey] : [userId, userId])).all<AccessScopeRuleRow>();
  return rows.results;
}

export function scopeEnforcementSummary(scopes: AccessScopeRuleRow[]) {
  if (scopes.some((scope) => scope.scope_type === "WHOLE_COMPANY")) return { scope_type: "WHOLE_COMPANY" as AccessScopeType };
  return {
    scope_type: scopes[0]?.scope_type ?? "SELF_ONLY",
    allowed_department_ids: Array.from(new Set(scopes.flatMap((scope) => parseIds(scope.allowed_department_ids_json)))),
    allowed_location_ids: Array.from(new Set(scopes.flatMap((scope) => parseIds(scope.allowed_location_ids_json))))
  };
}

export type ScopeAction = "view" | "manage";

export interface EmployeeScopeFilter {
  sql: string;
  params: Array<string | number | null>;
  unrestricted: boolean;
  summary: ReturnType<typeof scopeEnforcementSummary> & { note?: string };
}

interface LinkedEmployeeScopeRow {
  id: string;
  primary_department_id: string | null;
  primary_location_id: string | null;
}

async function getLinkedEmployee(db: Env["DB"], user: AuthUser) {
  if (!user.employee_id) return null;
  return db
    .prepare("SELECT id, primary_department_id, primary_location_id FROM employees WHERE id = ? AND archived_at IS NULL")
    .bind(user.employee_id)
    .first<LinkedEmployeeScopeRow>();
}

function placeholders(values: unknown[]) {
  return values.map(() => "?").join(", ");
}

export async function buildEmployeeScopeWhereClause(
  db: Env["DB"],
  user: AuthUser,
  moduleKey: string,
  action: ScopeAction = "view",
  employeeAlias = "e"
): Promise<EmployeeScopeFilter> {
  if (user.is_owner) {
    return { sql: "1 = 1", params: [], unrestricted: true, summary: { scope_type: "WHOLE_COMPANY" } };
  }

  const allScopes = await getUserAccessScopes(db, user.id, moduleKey);
  const scopes = allScopes.filter((scope) => (action === "manage" ? scope.can_manage === 1 : scope.can_view === 1 || scope.can_manage === 1));
  if (scopes.some((scope) => scope.scope_type === "WHOLE_COMPANY" || scope.scope_type === "ALL_LOCATIONS")) {
    return { sql: "1 = 1", params: [], unrestricted: true, summary: scopeEnforcementSummary(scopes) };
  }

  const linkedEmployee = await getLinkedEmployee(db, user);
  const clauses: string[] = [];
  const params: Array<string | number | null> = [];

  for (const scope of scopes) {
    if (scope.scope_type === "SELECTED_DEPARTMENTS") {
      const ids = parseIds(scope.allowed_department_ids_json);
      if (ids.length) {
        clauses.push(`${employeeAlias}.primary_department_id IN (${placeholders(ids)})`);
        params.push(...ids);
      }
    } else if (scope.scope_type === "SELECTED_LOCATIONS") {
      const ids = parseIds(scope.allowed_location_ids_json);
      if (ids.length) {
        clauses.push(`${employeeAlias}.primary_location_id IN (${placeholders(ids)})`);
        params.push(...ids);
      }
    } else if (scope.scope_type === "OWN_DEPARTMENT" && linkedEmployee?.primary_department_id) {
      clauses.push(`${employeeAlias}.primary_department_id = ?`);
      params.push(linkedEmployee.primary_department_id);
    } else if (scope.scope_type === "OWN_LOCATION" && linkedEmployee?.primary_location_id) {
      clauses.push(`${employeeAlias}.primary_location_id = ?`);
      params.push(linkedEmployee.primary_location_id);
    } else if (scope.scope_type === "SELF_ONLY" && linkedEmployee?.id) {
      clauses.push(`${employeeAlias}.id = ?`);
      params.push(linkedEmployee.id);
    } else if (scope.scope_type === "OWN_TEAM" && linkedEmployee?.id) {
      clauses.push(`(${employeeAlias}.reporting_manager_employee_id = ? OR ${employeeAlias}.id = ?)`);
      params.push(linkedEmployee.id, linkedEmployee.id);
    }
  }

  if (!scopes.length && linkedEmployee?.id) {
    clauses.push(`${employeeAlias}.id = ?`);
    params.push(linkedEmployee.id);
  }

  if (!clauses.length) {
    return {
      sql: "1 = 0",
      params: [],
      unrestricted: false,
      summary: { scope_type: "SELF_ONLY", note: "No matching access scope or linked employee was available." }
    };
  }

  return { sql: `(${clauses.join(" OR ")})`, params, unrestricted: false, summary: scopeEnforcementSummary(scopes) };
}

export async function canAccessEmployee(
  db: Env["DB"],
  user: AuthUser,
  employeeId: string,
  moduleKey: string,
  action: ScopeAction = "view"
) {
  const filter = await buildEmployeeScopeWhereClause(db, user, moduleKey, action, "e");
  if (filter.unrestricted) return true;
  const row = await db.prepare(`SELECT e.id FROM employees e WHERE e.id = ? AND ${filter.sql} LIMIT 1`).bind(employeeId, ...filter.params).first<{ id: string }>();
  return Boolean(row);
}
