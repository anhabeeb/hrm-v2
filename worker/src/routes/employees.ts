import { Hono } from "hono";
import type { Context } from "hono";
import { buildEmployeeScopeWhereClause, canAccessEmployee } from "../auth/access-scopes";
import { recordAudit } from "../db/audit";
import { getUserById } from "../db/users";
import { requireAuth } from "../middleware/auth";
import { requirePermission } from "../middleware/permissions";
import { hasValidationErrors, validateOrganizationCascadeWithScope, validationResponse } from "../lib/moduleValidation";
import { publishAccessEvent } from "../realtime/publisher";
import { autoCreateOnboardingCaseAfterEmployeeCreate } from "./lifecycle";
import { applyRoleMappingToEmployee, roleMappingPreviewForEmployee } from "./role-mappings";
import type { AppBindings } from "../types";
import { fail, getClientIp, ok, okCached } from "../utils/http";
import { readJsonBody, readString } from "../utils/validation";

type EmployeeType = "LOCAL" | "FOREIGN" | "OTHER";
type EmploymentType = "FULL_TIME" | "PART_TIME" | "INTERN" | "TEMPORARY" | "CONTRACT";
type ContactType = "PERSONAL_PHONE" | "WORK_PHONE" | "PERSONAL_EMAIL" | "WORK_EMAIL" | "EMERGENCY" | "GUARDIAN" | "SPOUSE" | "PARENT" | "OTHER";
type OnboardingStatus = "PENDING" | "COMPLETED" | "SKIPPED" | "BLOCKED";
type BindValue = string | number | null;

const EMPLOYEE_TYPES = new Set<EmployeeType>(["LOCAL", "FOREIGN", "OTHER"]);
const EMPLOYMENT_TYPES = new Set<EmploymentType>(["FULL_TIME", "PART_TIME", "INTERN", "TEMPORARY", "CONTRACT"]);
const CONTACT_TYPES = new Set<ContactType>(["PERSONAL_PHONE", "WORK_PHONE", "PERSONAL_EMAIL", "WORK_EMAIL", "EMERGENCY", "GUARDIAN", "SPOUSE", "PARENT", "OTHER"]);
const ONBOARDING_STATUSES = new Set<OnboardingStatus>(["PENDING", "COMPLETED", "SKIPPED", "BLOCKED"]);
const EMPLOYEE_LIST_DEFAULT_LIMIT = 250;
const EMPLOYEE_LIST_MAX_LIMIT = 500;

function boundedEmployeeListLimit(value: unknown) {
  const parsed = Number(value ?? EMPLOYEE_LIST_DEFAULT_LIMIT);
  if (!Number.isFinite(parsed)) return EMPLOYEE_LIST_DEFAULT_LIMIT;
  return Math.max(1, Math.min(EMPLOYEE_LIST_MAX_LIMIT, Math.trunc(parsed)));
}

function boundedOffset(value: unknown) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.trunc(parsed));
}

interface EmployeeStatusRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  is_protected: number;
  is_active: number;
  can_login: number;
  include_in_payroll: number;
  include_in_roster: number;
  show_in_active_lists: number;
  requires_exit_date: number;
  requires_exit_reason: number;
  requires_final_settlement: number;
  requires_document_clearance: number;
  requires_asset_clearance: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface NumberSettingsRow {
  id: string;
  prefix: string;
  include_year: number;
  include_location_code: number;
  include_department_code: number;
  sequence_padding: number;
  next_sequence: number;
  allow_manual_override: number;
  separator: string;
  created_at: string;
  updated_at: string;
}

interface EmployeeRow {
  id: string;
  employee_no: string;
  profile_photo_document_id: string | null;
  full_name: string;
  display_name: string | null;
  gender: string | null;
  date_of_birth: string | null;
  nationality: string | null;
  employee_type: EmployeeType;
  employment_type: EmploymentType;
  status_id: string;
  status_key?: string;
  status_name?: string;
  primary_department_id: string | null;
  department_name?: string | null;
  primary_position_id: string | null;
  position_title?: string | null;
  primary_location_id: string | null;
  location_name?: string | null;
  location_code?: string | null;
  job_level_id: string | null;
  job_level_name?: string | null;
  joining_date: string | null;
  confirmation_date: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  probation_end_date: string | null;
  reporting_manager_employee_id: string | null;
  reporting_manager_name?: string | null;
  payroll_included: number;
  roster_eligible: number;
  user_id: string | null;
  linked_user_email?: string | null;
  exit_date: string | null;
  exit_reason: string | null;
  notes_summary: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

interface ContactRow {
  id: string;
  employee_id: string;
  contact_type: ContactType;
  value: string;
  country_code: string | null;
  relationship: string | null;
  is_primary: number;
  emergency_priority: number | null;
  is_sensitive: number;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

const onboardingTemplates = [
  ["basic_profile_completed", "Basic profile completed", "employees", "Verify employee identity and core profile fields.", 1],
  ["required_documents_checklist", "Required documents checklist", "documents", "Prepare required employee document tracking.", 1],
  ["payroll_setup_checklist", "Payroll setup checklist", "payroll", "Prepare payroll profile details.", 1],
  ["department_outlet_assignment", "Department/outlet assignment", "organization", "Confirm organization assignment.", 1],
  ["roster_eligibility_setup", "Roster eligibility setup", "roster", "Confirm roster eligibility.", 0],
  ["asset_uniform_issue", "Asset/uniform issue checklist", "assets", "Prepare asset and uniform issue tracking.", 0],
  ["user_access_setup", "User/account access setup if needed", "users", "Prepare linked user account if required.", 0],
  ["final_activation_approval", "Final activation approval", "employees", "Review onboarding before activation.", 1]
] as const;

export const employeeRoutes = new Hono<AppBindings>();

employeeRoutes.use("*", requireAuth);

function hasPermission(c: Context<AppBindings>, permission: string) {
  return c.get("currentUser").permissions.includes(permission);
}

function optionalString(value: unknown) {
  const text = readString(value);
  return text || null;
}

function boolValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function numericValue(value: unknown, fallback: number) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function booleanize(value: number) {
  return value === 1;
}

function toStatus(row: EmployeeStatusRow) {
  return {
    ...row,
    is_protected: booleanize(row.is_protected),
    is_active: booleanize(row.is_active),
    can_login: booleanize(row.can_login),
    include_in_payroll: booleanize(row.include_in_payroll),
    include_in_roster: booleanize(row.include_in_roster),
    show_in_active_lists: booleanize(row.show_in_active_lists),
    requires_exit_date: booleanize(row.requires_exit_date),
    requires_exit_reason: booleanize(row.requires_exit_reason),
    requires_final_settlement: booleanize(row.requires_final_settlement),
    requires_document_clearance: booleanize(row.requires_document_clearance),
    requires_asset_clearance: booleanize(row.requires_asset_clearance)
  };
}

function toNumberSettings(row: NumberSettingsRow) {
  return {
    ...row,
    include_year: booleanize(row.include_year),
    include_location_code: booleanize(row.include_location_code),
    include_department_code: booleanize(row.include_department_code),
    allow_manual_override: booleanize(row.allow_manual_override)
  };
}

function toEmployee(row: EmployeeRow, canViewSensitive: boolean) {
  return {
    ...row,
    gender: canViewSensitive ? row.gender : null,
    date_of_birth: canViewSensitive ? row.date_of_birth : null,
    nationality: canViewSensitive ? row.nationality : row.nationality,
    payroll_included: booleanize(row.payroll_included),
    roster_eligible: booleanize(row.roster_eligible),
    user_linked: Boolean(row.user_id)
  };
}

function toContact(row: ContactRow, canViewSensitive: boolean) {
  const sensitive = booleanize(row.is_sensitive);
  return {
    ...row,
    value: sensitive && !canViewSensitive ? "Restricted" : row.value,
    notes: sensitive && !canViewSensitive ? null : row.notes,
    is_primary: booleanize(row.is_primary),
    is_sensitive: sensitive
  };
}

async function auditEmployee(
  c: Context<AppBindings>,
  input: {
    action: string;
    entityType: string;
    entityId: string;
    oldValue?: unknown;
    newValue?: unknown;
    reason?: string | null;
  }
) {
  const actor = c.get("currentUser");
  await recordAudit(c.env.DB, {
    actorUserId: actor.id,
    action: input.action,
    module: "employees",
    entityType: input.entityType,
    entityId: input.entityId,
    oldValue: input.oldValue,
    newValue: input.newValue,
    reason: input.reason,
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent") ?? null
  });
}

async function publishEmployee(c: Context<AppBindings>, event: "employees.changed" | "employee.created" | "employee.updated" | "employee.status_changed" | "employee.archived" | "employee.onboarding_changed", entityId: string, action: string) {
  const actor = c.get("currentUser");
  await publishAccessEvent(c.env, event, { actor_user_id: actor.id, entity_type: "employee", entity_id: entityId, action });
  if (event !== "employees.changed") {
    await publishAccessEvent(c.env, "employees.changed", { actor_user_id: actor.id, entity_type: "employee", entity_id: entityId, action });
  }
}

async function getStatusById(db: AppBindings["Bindings"]["DB"], id: string) {
  return db.prepare("SELECT * FROM employee_statuses WHERE id = ?").bind(id).first<EmployeeStatusRow>();
}

async function getStatusByKey(db: AppBindings["Bindings"]["DB"], key: string) {
  return db.prepare("SELECT * FROM employee_statuses WHERE key = ?").bind(key).first<EmployeeStatusRow>();
}

async function getNumberSettings(db: AppBindings["Bindings"]["DB"]) {
  let row = await db.prepare("SELECT * FROM employee_number_settings ORDER BY created_at LIMIT 1").first<NumberSettingsRow>();
  if (!row) {
    await db
      .prepare(
        `INSERT INTO employee_number_settings
         (id, prefix, include_year, include_location_code, include_department_code, sequence_padding, next_sequence, allow_manual_override, separator)
         VALUES ('employee_number_default', 'EMP', 0, 0, 0, 4, 1, 0, '-')`
      )
      .run();
    row = await db.prepare("SELECT * FROM employee_number_settings ORDER BY created_at LIMIT 1").first<NumberSettingsRow>();
  }
  return row!;
}

async function entityExists(db: AppBindings["Bindings"]["DB"], table: "departments" | "positions" | "locations" | "job_levels" | "employees" | "users", id: string) {
  return db.prepare(`SELECT id FROM ${table} WHERE id = ?`).bind(id).first<{ id: string }>();
}

async function activeEntityExists(db: AppBindings["Bindings"]["DB"], table: "departments" | "positions" | "locations" | "job_levels", id: string) {
  return db.prepare(`SELECT id FROM ${table} WHERE id = ? AND is_active = 1`).bind(id).first<{ id: string }>();
}

async function activeEmployeeExists(db: AppBindings["Bindings"]["DB"], id: string) {
  return db.prepare("SELECT id FROM employees WHERE id = ? AND archived_at IS NULL").bind(id).first<{ id: string }>();
}

async function createsReportingCycle(db: AppBindings["Bindings"]["DB"], employeeId: string, managerId: string) {
  let current: string | null = managerId;
  const visited = new Set<string>();
  while (current) {
    if (current === employeeId) return true;
    if (visited.has(current)) return true;
    visited.add(current);
    const row: { reporting_manager_employee_id: string | null } | null = await db.prepare("SELECT reporting_manager_employee_id FROM employees WHERE id = ? AND archived_at IS NULL").bind(current).first<{ reporting_manager_employee_id: string | null }>();
    current = row?.reporting_manager_employee_id ?? null;
  }
  return false;
}

async function readOrgCode(db: AppBindings["Bindings"]["DB"], table: "departments" | "locations", id: string | null) {
  if (!id) {
    return null;
  }
  const row = await db.prepare(`SELECT code FROM ${table} WHERE id = ?`).bind(id).first<{ code: string }>();
  return row?.code ?? null;
}

async function buildEmployeeNumber(db: AppBindings["Bindings"]["DB"], settings: NumberSettingsRow, input: { locationId?: string | null; departmentId?: string | null; sequence?: number }) {
  const separator = settings.separator || "-";
  const parts: string[] = [];
  if (settings.include_location_code === 1) {
    const code = await readOrgCode(db, "locations", input.locationId ?? null);
    if (code) {
      parts.push(code);
    }
  }
  if (settings.include_year === 1) {
    parts.push(String(new Date().getUTCFullYear()));
  }
  if (settings.prefix) {
    parts.push(settings.prefix);
  }
  if (settings.include_department_code === 1) {
    const code = await readOrgCode(db, "departments", input.departmentId ?? null);
    if (code) {
      parts.push(code);
    }
  }
  parts.push(String(input.sequence ?? settings.next_sequence).padStart(settings.sequence_padding, "0"));
  return parts.join(separator);
}

async function employeeNumberExists(db: AppBindings["Bindings"]["DB"], employeeNo: string, excludeId?: string) {
  let sql = "SELECT id FROM employees WHERE employee_no = ? COLLATE NOCASE";
  const params: BindValue[] = [employeeNo];
  if (excludeId) {
    sql += " AND id != ?";
    params.push(excludeId);
  }
  return db.prepare(sql).bind(...params).first<{ id: string }>();
}

async function getEmployeeById(db: AppBindings["Bindings"]["DB"], id: string) {
  return db
    .prepare(
      `SELECT e.*, s.key AS status_key, s.name AS status_name,
        d.name AS department_name, p.title AS position_title, l.name AS location_name, l.code AS location_code,
        jl.name AS job_level_name, m.full_name AS reporting_manager_name, u.email AS linked_user_email
       FROM employees e
       INNER JOIN employee_statuses s ON s.id = e.status_id
       LEFT JOIN departments d ON d.id = e.primary_department_id
       LEFT JOIN positions p ON p.id = e.primary_position_id
       LEFT JOIN locations l ON l.id = e.primary_location_id
       LEFT JOIN job_levels jl ON jl.id = e.job_level_id
       LEFT JOIN employees m ON m.id = e.reporting_manager_employee_id
       LEFT JOIN users u ON u.id = e.user_id
       WHERE e.id = ?`
    )
    .bind(id)
    .first<EmployeeRow>();
}

async function validateEmployeeRefs(
  c: Context<AppBindings>,
  input: {
    primary_department_id?: string | null;
    primary_position_id?: string | null;
    primary_location_id?: string | null;
    job_level_id?: string | null;
    reporting_manager_employee_id?: string | null;
    user_id?: string | null;
  },
  employeeId?: string
) {
  const refs = [
    ["departments", input.primary_department_id, "Selected department was not found or is inactive."],
    ["positions", input.primary_position_id, "Selected position was not found or is inactive."],
    ["locations", input.primary_location_id, "Selected location was not found or is inactive."],
    ["job_levels", input.job_level_id, "Selected job level was not found or is inactive."]
  ] as const;
  for (const [table, id, message] of refs) {
    if (id && !(await activeEntityExists(c.env.DB, table, id))) {
      return fail(c, 400, "INVALID_REFERENCE", message);
    }
  }
  const cascadeIssues = await validateOrganizationCascadeWithScope(c.env.DB, c.get("currentUser"), {
    department_id: input.primary_department_id,
    location_id: input.primary_location_id,
    position_id: input.primary_position_id,
    job_level_id: input.job_level_id
  });
  if (hasValidationErrors(cascadeIssues)) {
    return validationResponse(c, cascadeIssues);
  }
  if (input.reporting_manager_employee_id) {
    if (input.reporting_manager_employee_id === employeeId) {
      return fail(c, 400, "INVALID_MANAGER", "Reporting manager cannot be the employee.");
    }
    if (!(await activeEmployeeExists(c.env.DB, input.reporting_manager_employee_id))) {
      return fail(c, 400, "INVALID_MANAGER", "Reporting manager was not found or is inactive.");
    }
    if (employeeId && await createsReportingCycle(c.env.DB, employeeId, input.reporting_manager_employee_id)) {
      return fail(c, 400, "INVALID_MANAGER", "Reporting manager assignment would create a reporting cycle.");
    }
  }
  if (input.user_id) {
    if (!(await getUserById(c.env.DB, input.user_id))) {
      return fail(c, 400, "INVALID_USER", "Linked user was not found.");
    }
  }
  return null;
}

function readEmployeeInput(body: Record<string, unknown>) {
  const employeeType = typeof body.employee_type === "string" && EMPLOYEE_TYPES.has(body.employee_type as EmployeeType) ? (body.employee_type as EmployeeType) : null;
  const employmentType = typeof body.employment_type === "string" && EMPLOYMENT_TYPES.has(body.employment_type as EmploymentType) ? (body.employment_type as EmploymentType) : null;
  return {
    employee_no: optionalString(body.employee_no),
    full_name: readString(body.full_name),
    display_name: optionalString(body.display_name),
    gender: optionalString(body.gender),
    date_of_birth: optionalString(body.date_of_birth),
    nationality: optionalString(body.nationality),
    employee_type: employeeType,
    employment_type: employmentType,
    status_id: optionalString(body.status_id),
    primary_department_id: optionalString(body.primary_department_id),
    primary_position_id: optionalString(body.primary_position_id),
    primary_location_id: optionalString(body.primary_location_id),
    job_level_id: optionalString(body.job_level_id),
    joining_date: optionalString(body.joining_date),
    confirmation_date: optionalString(body.confirmation_date),
    contract_start_date: optionalString(body.contract_start_date),
    contract_end_date: optionalString(body.contract_end_date),
    probation_end_date: optionalString(body.probation_end_date),
    reporting_manager_employee_id: optionalString(body.reporting_manager_employee_id),
    payroll_included: boolValue(body.payroll_included, true),
    roster_eligible: boolValue(body.roster_eligible, true),
    user_id: optionalString(body.user_id),
    notes_summary: optionalString(body.notes_summary),
    effective_date: optionalString(body.effective_date),
    reason: optionalString(body.reason)
  };
}

function hasJobAssignment(input: ReturnType<typeof readEmployeeInput>) {
  return Boolean(input.primary_department_id || input.primary_position_id || input.primary_location_id || input.job_level_id || input.reporting_manager_employee_id);
}

async function createJobHistory(c: Context<AppBindings>, input: { employeeId: string; previous?: Partial<EmployeeRow>; next: ReturnType<typeof readEmployeeInput>; effectiveDate?: string | null; reason?: string | null }) {
  await c.env.DB
    .prepare(
      `INSERT INTO employee_job_history (
        id, employee_id, previous_department_id, new_department_id, previous_position_id, new_position_id,
        previous_location_id, new_location_id, previous_job_level_id, new_job_level_id,
        previous_reporting_manager_employee_id, new_reporting_manager_employee_id,
        effective_date, reason, created_by_user_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      crypto.randomUUID(),
      input.employeeId,
      input.previous?.primary_department_id ?? null,
      input.next.primary_department_id,
      input.previous?.primary_position_id ?? null,
      input.next.primary_position_id,
      input.previous?.primary_location_id ?? null,
      input.next.primary_location_id,
      input.previous?.job_level_id ?? null,
      input.next.job_level_id,
      input.previous?.reporting_manager_employee_id ?? null,
      input.next.reporting_manager_employee_id,
      input.effectiveDate ?? input.next.joining_date ?? new Date().toISOString().slice(0, 10),
      input.reason ?? null,
      c.get("currentUser").id
    )
    .run();
}

async function createOnboardingTasks(db: AppBindings["Bindings"]["DB"], employeeId: string) {
  await db.batch(
    onboardingTemplates.map(([key, title, module, description, required]) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO employee_onboarding_tasks
           (id, employee_id, task_key, title, description, module, status, required)
           VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)`
        )
        .bind(crypto.randomUUID(), employeeId, key, title, description, module, required)
    )
  );
}

employeeRoutes.get("/settings/statuses", requirePermission("employees.view"), async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM employee_statuses ORDER BY sort_order, name").all<EmployeeStatusRow>();
  return okCached(c, { statuses: rows.results.map(toStatus) }, 60, `employee-statuses-${rows.results.length}`);
});

employeeRoutes.post("/settings/statuses", requirePermission("employees.status.manage"), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const key = readString(body.key).toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  const name = readString(body.name);
  if (!key || !name) {
    return fail(c, 400, "VALIDATION_ERROR", "Status key and name are required.");
  }
  const existing = await getStatusByKey(c.env.DB, key);
  if (existing) {
    return fail(c, 409, "STATUS_KEY_EXISTS", "A status with this key already exists.");
  }
  const id = crypto.randomUUID();
  const input = readStatusInput(body);
  await c.env.DB
    .prepare(
      `INSERT INTO employee_statuses (
        id, key, name, description, is_protected, is_active, can_login, include_in_payroll,
        include_in_roster, show_in_active_lists, requires_exit_date, requires_exit_reason,
        requires_final_settlement, requires_document_clearance, requires_asset_clearance, sort_order
      ) VALUES (?, ?, ?, ?, 0, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, key, name, input.description, input.can_login ? 1 : 0, input.include_in_payroll ? 1 : 0, input.include_in_roster ? 1 : 0, input.show_in_active_lists ? 1 : 0, input.requires_exit_date ? 1 : 0, input.requires_exit_reason ? 1 : 0, input.requires_final_settlement ? 1 : 0, input.requires_document_clearance ? 1 : 0, input.requires_asset_clearance ? 1 : 0, input.sort_order)
    .run();
  const row = await getStatusById(c.env.DB, id);
  await auditEmployee(c, { action: "employee.status_setting.created", entityType: "employee_status", entityId: id, newValue: row });
  return ok(c, { status: row ? toStatus(row) : null }, 201);
});

employeeRoutes.patch("/settings/statuses/:id", requirePermission("employees.status.manage"), async (c) => {
  const status = await getStatusById(c.env.DB, c.req.param("id"));
  if (!status) {
    return fail(c, 404, "NOT_FOUND", "Employee status was not found.");
  }
  const body = await readJsonBody(c.req.raw);
  const name = readString(body.name);
  if (!name) {
    return fail(c, 400, "VALIDATION_ERROR", "Status name is required.");
  }
  const input = readStatusInput(body);
  await c.env.DB
    .prepare(
      `UPDATE employee_statuses SET name = ?, description = ?, can_login = ?, include_in_payroll = ?,
        include_in_roster = ?, show_in_active_lists = ?, requires_exit_date = ?, requires_exit_reason = ?,
        requires_final_settlement = ?, requires_document_clearance = ?, requires_asset_clearance = ?, sort_order = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(name, input.description, input.can_login ? 1 : 0, input.include_in_payroll ? 1 : 0, input.include_in_roster ? 1 : 0, input.show_in_active_lists ? 1 : 0, input.requires_exit_date ? 1 : 0, input.requires_exit_reason ? 1 : 0, input.requires_final_settlement ? 1 : 0, input.requires_document_clearance ? 1 : 0, input.requires_asset_clearance ? 1 : 0, input.sort_order, new Date().toISOString(), status.id)
    .run();
  const row = await getStatusById(c.env.DB, status.id);
  await auditEmployee(c, { action: "employee.status_setting.updated", entityType: "employee_status", entityId: status.id, oldValue: status, newValue: row });
  return ok(c, { status: row ? toStatus(row) : null });
});

employeeRoutes.post("/settings/statuses/:id/enable", requirePermission("employees.status.manage"), (c) => setStatusActive(c, 1));
employeeRoutes.post("/settings/statuses/:id/disable", requirePermission("employees.status.manage"), (c) => setStatusActive(c, 0));

employeeRoutes.get("/settings/numbering", requirePermission("employees.view"), async (c) => {
  return ok(c, { settings: toNumberSettings(await getNumberSettings(c.env.DB)) });
});

employeeRoutes.patch("/settings/numbering", requirePermission("employees.numbering.manage"), async (c) => {
  const oldSettings = await getNumberSettings(c.env.DB);
  const body = await readJsonBody(c.req.raw);
  const prefix = readString(body.prefix) || "EMP";
  const sequencePadding = Math.max(1, Math.min(12, numericValue(body.sequence_padding, oldSettings.sequence_padding)));
  const nextSequence = Math.max(1, numericValue(body.next_sequence, oldSettings.next_sequence));
  const separator = readString(body.separator) || "-";
  await c.env.DB
    .prepare(
      `UPDATE employee_number_settings
       SET prefix = ?, include_year = ?, include_location_code = ?, include_department_code = ?,
        sequence_padding = ?, next_sequence = ?, allow_manual_override = ?, separator = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(prefix, boolValue(body.include_year, false) ? 1 : 0, boolValue(body.include_location_code, false) ? 1 : 0, boolValue(body.include_department_code, false) ? 1 : 0, sequencePadding, nextSequence, boolValue(body.allow_manual_override, false) ? 1 : 0, separator, new Date().toISOString(), oldSettings.id)
    .run();
  const settings = await getNumberSettings(c.env.DB);
  await auditEmployee(c, { action: "employee.numbering_settings.updated", entityType: "employee_numbering", entityId: settings.id, oldValue: oldSettings, newValue: settings });
  return ok(c, { settings: toNumberSettings(settings) });
});

employeeRoutes.get("/settings/numbering/preview", requirePermission("employees.view"), async (c) => {
  const settings = await getNumberSettings(c.env.DB);
  const employee_no = await buildEmployeeNumber(c.env.DB, settings, {
    locationId: optionalString(c.req.query("location_id")),
    departmentId: optionalString(c.req.query("department_id"))
  });
  return ok(c, { employee_no });
});

employeeRoutes.get("/", requirePermission("employees.view"), async (c) => {
  const conditions: string[] = [];
  const params: BindValue[] = [];
  const limit = boundedEmployeeListLimit(c.req.query("limit"));
  const offset = boundedOffset(c.req.query("offset"));
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "employees", "view", "e");
  conditions.push(scope.sql);
  params.push(...scope.params);
  const search = readString(c.req.query("search"));
  if (search) {
    conditions.push("(e.employee_no LIKE ? OR e.full_name LIKE ? OR e.display_name LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  const filterMap = [
    ["status_id", "e.status_id"],
    ["employee_type", "e.employee_type"],
    ["employment_type", "e.employment_type"],
    ["department_id", "e.primary_department_id"],
    ["position_id", "e.primary_position_id"],
    ["location_id", "e.primary_location_id"],
    ["job_level_id", "e.job_level_id"]
  ] as const;
  for (const [queryKey, column] of filterMap) {
    const value = readString(c.req.query(queryKey));
    if (value) {
      conditions.push(`${column} = ?`);
      params.push(value);
    }
  }
  if (c.req.query("show_archived") !== "true") {
    conditions.push("e.archived_at IS NULL");
  }
  const rows = await c.env.DB
    .prepare(
      `SELECT e.*, s.key AS status_key, s.name AS status_name,
        d.name AS department_name, p.title AS position_title, l.name AS location_name, l.code AS location_code,
        jl.name AS job_level_name, m.full_name AS reporting_manager_name, u.email AS linked_user_email,
        oc.id AS active_onboarding_case_id, oc.case_number AS active_onboarding_case_number,
        oc.onboarding_status AS active_onboarding_status, oc.activation_status AS active_activation_status
       FROM employees e
       INNER JOIN employee_statuses s ON s.id = e.status_id
       LEFT JOIN departments d ON d.id = e.primary_department_id
       LEFT JOIN positions p ON p.id = e.primary_position_id
       LEFT JOIN locations l ON l.id = e.primary_location_id
       LEFT JOIN job_levels jl ON jl.id = e.job_level_id
       LEFT JOIN employees m ON m.id = e.reporting_manager_employee_id
       LEFT JOIN users u ON u.id = e.user_id
       LEFT JOIN employee_onboarding_cases oc ON oc.employee_id = e.id AND oc.onboarding_status != 'CANCELLED' AND oc.activation_status != 'ACTIVATED'
       ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY e.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .bind(...params, limit, offset)
    .all<EmployeeRow>();
  return ok(c, {
    employees: rows.results.map((row) => toEmployee(row, hasPermission(c, "employees.sensitive.view"))),
    pagination: { limit, offset, has_more: rows.results.length === limit }
  });
});

employeeRoutes.get("/assignment-options", requirePermission("employees.view"), async (c) => {
  const [departments, locations, positions, jobLevels, managers] = await Promise.all([
    c.env.DB.prepare("SELECT id, code, name, parent_department_id, head_employee_id, manager_employee_id, is_active FROM departments WHERE is_active = 1 ORDER BY name").all(),
    c.env.DB.prepare("SELECT id, code, name, type, island_city, manager_employee_id, is_active FROM locations WHERE is_active = 1 ORDER BY name").all(),
    c.env.DB.prepare("SELECT id, code, title, department_id, level_id, is_active FROM positions WHERE is_active = 1 ORDER BY title").all(),
    c.env.DB.prepare("SELECT id, code, name, rank_order, is_active FROM job_levels WHERE is_active = 1 ORDER BY rank_order, name").all(),
    c.env.DB.prepare("SELECT e.id, e.employee_no, e.full_name, e.primary_department_id, e.primary_location_id, e.primary_position_id FROM employees e WHERE e.archived_at IS NULL ORDER BY e.full_name").all()
  ]);
  return okCached(c, {
    departments: departments.results,
    locations: locations.results,
    positions: positions.results,
    job_levels: jobLevels.results,
    reporting_managers: managers.results
  }, 60, `assignment-options-${departments.results.length}-${locations.results.length}-${positions.results.length}-${jobLevels.results.length}`);
});

employeeRoutes.post("/", requirePermission("employees.create"), async (c) => {
  const body = await readJsonBody(c.req.raw);
  const input = readEmployeeInput(body);
  if (!input.full_name || !input.employee_type || !input.employment_type) {
    return fail(c, 400, "VALIDATION_ERROR", "Full name, employee type, and employment type are required.");
  }
  const settings = await getNumberSettings(c.env.DB);
  let employeeNo = input.employee_no;
  if (employeeNo) {
    if (settings.allow_manual_override !== 1 || !hasPermission(c, "employees.numbering.manage")) {
      return fail(c, 403, "MANUAL_NUMBER_FORBIDDEN", "Manual employee number override is not allowed.");
    }
  } else {
    employeeNo = await buildEmployeeNumber(c.env.DB, settings, { locationId: input.primary_location_id, departmentId: input.primary_department_id });
  }
  if (await employeeNumberExists(c.env.DB, employeeNo)) {
    return fail(c, 409, "EMPLOYEE_NO_EXISTS", "Employee number already exists.");
  }
  const status = input.status_id ? await getStatusById(c.env.DB, input.status_id) : await getStatusByKey(c.env.DB, "DRAFT_ONBOARDING");
  if (!status || status.is_active !== 1) {
    return fail(c, 400, "INVALID_STATUS", "Selected employee status was not found or is inactive.");
  }
  const refError = await validateEmployeeRefs(c, input);
  if (refError) {
    return refError;
  }
  const id = crypto.randomUUID();
  await c.env.DB
    .prepare(
      `INSERT INTO employees (
        id, employee_no, full_name, display_name, gender, date_of_birth, nationality,
        employee_type, employment_type, status_id, primary_department_id, primary_position_id,
        primary_location_id, job_level_id, joining_date, confirmation_date, contract_start_date,
        contract_end_date, probation_end_date, reporting_manager_employee_id, payroll_included,
        roster_eligible, user_id, notes_summary
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, employeeNo, input.full_name, input.display_name, input.gender, input.date_of_birth, input.nationality, input.employee_type, input.employment_type, status.id, input.primary_department_id, input.primary_position_id, input.primary_location_id, input.job_level_id, input.joining_date, input.confirmation_date, input.contract_start_date, input.contract_end_date, input.probation_end_date, input.reporting_manager_employee_id, input.payroll_included ? 1 : 0, input.roster_eligible ? 1 : 0, input.user_id, input.notes_summary)
    .run();
  if (!input.employee_no) {
    await c.env.DB.prepare("UPDATE employee_number_settings SET next_sequence = next_sequence + 1, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), settings.id).run();
  }
  await createOnboardingTasks(c.env.DB, id);
  await autoCreateOnboardingCaseAfterEmployeeCreate(c, id);
  if (hasJobAssignment(input)) {
    await createJobHistory(c, { employeeId: id, next: input, effectiveDate: input.joining_date, reason: "Initial assignment" });
  }
  const employee = await getEmployeeById(c.env.DB, id);
  await auditEmployee(c, { action: "employee.created", entityType: "employee", entityId: id, newValue: employee });
  await publishEmployee(c, "employee.created", id, "created");
  return ok(c, { employee: employee ? toEmployee(employee, true) : null }, 201);
});

employeeRoutes.get("/:id", requirePermission("employees.view"), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), c.req.param("id"), "employees", "view"))) {
    return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  }
  const employee = await getEmployeeById(c.env.DB, c.req.param("id"));
  if (!employee) {
    return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  }
  return ok(c, { employee: toEmployee(employee, hasPermission(c, "employees.sensitive.view")) });
});

employeeRoutes.patch("/:id", requirePermission("employees.update"), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), c.req.param("id"), "employees", "manage"))) {
    return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  }
  const existing = await getEmployeeById(c.env.DB, c.req.param("id"));
  if (!existing) {
    return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  }
  const body = await readJsonBody(c.req.raw);
  const input = readEmployeeInput(body);
  if (!input.full_name || !input.employee_type || !input.employment_type) {
    return fail(c, 400, "VALIDATION_ERROR", "Full name, employee type, and employment type are required.");
  }
  if (input.status_id && input.status_id !== existing.status_id) {
    return fail(c, 400, "STATUS_ENDPOINT_REQUIRED", "Use the employee status endpoint to change employee status.");
  }
  if ((input.gender !== existing.gender || input.date_of_birth !== existing.date_of_birth) && !hasPermission(c, "employees.sensitive.update")) {
    return fail(c, 403, "FORBIDDEN", "Sensitive employee fields require sensitive update permission.");
  }
  const settings = await getNumberSettings(c.env.DB);
  let employeeNo = existing.employee_no;
  if (input.employee_no && input.employee_no !== existing.employee_no) {
    if (settings.allow_manual_override !== 1 || !hasPermission(c, "employees.numbering.manage")) {
      return fail(c, 403, "MANUAL_NUMBER_FORBIDDEN", "Manual employee number override is not allowed.");
    }
    if (await employeeNumberExists(c.env.DB, input.employee_no, existing.id)) {
      return fail(c, 409, "EMPLOYEE_NO_EXISTS", "Employee number already exists.");
    }
    employeeNo = input.employee_no;
  }
  const refError = await validateEmployeeRefs(c, input, existing.id);
  if (refError) {
    return refError;
  }
  const jobChanged =
    input.primary_department_id !== existing.primary_department_id ||
    input.primary_position_id !== existing.primary_position_id ||
    input.primary_location_id !== existing.primary_location_id ||
    input.job_level_id !== existing.job_level_id ||
    input.reporting_manager_employee_id !== existing.reporting_manager_employee_id;
  await c.env.DB
    .prepare(
      `UPDATE employees SET employee_no = ?, full_name = ?, display_name = ?, gender = ?, date_of_birth = ?,
        nationality = ?, employee_type = ?, employment_type = ?, primary_department_id = ?, primary_position_id = ?,
        primary_location_id = ?, job_level_id = ?, joining_date = ?, confirmation_date = ?, contract_start_date = ?,
        contract_end_date = ?, probation_end_date = ?, reporting_manager_employee_id = ?, payroll_included = ?,
        roster_eligible = ?, user_id = ?, notes_summary = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(employeeNo, input.full_name, input.display_name, input.gender, input.date_of_birth, input.nationality, input.employee_type, input.employment_type, input.primary_department_id, input.primary_position_id, input.primary_location_id, input.job_level_id, input.joining_date, input.confirmation_date, input.contract_start_date, input.contract_end_date, input.probation_end_date, input.reporting_manager_employee_id, input.payroll_included ? 1 : 0, input.roster_eligible ? 1 : 0, input.user_id, input.notes_summary, new Date().toISOString(), existing.id)
    .run();
  if (jobChanged) {
    await createJobHistory(c, { employeeId: existing.id, previous: existing, next: input, effectiveDate: input.effective_date, reason: input.reason ?? "Profile job assignment updated" });
    await auditEmployee(c, { action: "employee.job_changed", entityType: "employee", entityId: existing.id, oldValue: existing, newValue: input, reason: input.reason });
  }
  const employee = await getEmployeeById(c.env.DB, existing.id);
  await auditEmployee(c, { action: "employee.updated", entityType: "employee", entityId: existing.id, oldValue: existing, newValue: employee });
  await publishEmployee(c, "employee.updated", existing.id, "updated");
  return ok(c, { employee: employee ? toEmployee(employee, hasPermission(c, "employees.sensitive.view")) : null });
});

employeeRoutes.post("/:id/status", requirePermission("employees.status.manage"), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), c.req.param("id"), "employees", "manage"))) {
    return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  }
  const employee = await getEmployeeById(c.env.DB, c.req.param("id"));
  if (!employee) {
    return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  }
  const body = await readJsonBody(c.req.raw);
  const statusId = readString(body.status_id);
  const status = statusId ? await getStatusById(c.env.DB, statusId) : null;
  if (!status || status.is_active !== 1) {
    return fail(c, 400, "INVALID_STATUS", "Selected employee status was not found or is inactive.");
  }
  const exitDate = optionalString(body.exit_date);
  const exitReason = optionalString(body.exit_reason) ?? optionalString(body.reason);
  if (status.requires_exit_date === 1 && !exitDate) {
    return fail(c, 400, "EXIT_DATE_REQUIRED", "Exit date is required for this status.");
  }
  if (status.requires_exit_reason === 1 && !exitReason) {
    return fail(c, 400, "EXIT_REASON_REQUIRED", "Exit reason is required for this status.");
  }
  await c.env.DB
    .prepare("UPDATE employees SET status_id = ?, exit_date = ?, exit_reason = ?, updated_at = ? WHERE id = ?")
    .bind(status.id, exitDate ?? employee.exit_date, exitReason ?? employee.exit_reason, new Date().toISOString(), employee.id)
    .run();
  const updated = await getEmployeeById(c.env.DB, employee.id);
  await auditEmployee(c, { action: "employee.status_changed", entityType: "employee", entityId: employee.id, oldValue: { status_id: employee.status_id }, newValue: { status_id: status.id, exit_date: exitDate, exit_reason: exitReason }, reason: exitReason });
  await publishEmployee(c, "employee.status_changed", employee.id, "status_changed");
  return ok(c, { employee: updated ? toEmployee(updated, hasPermission(c, "employees.sensitive.view")) : null });
});

employeeRoutes.post("/:id/archive", requirePermission("employees.archive"), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), c.req.param("id"), "employees", "manage"))) {
    return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  }
  const employee = await getEmployeeById(c.env.DB, c.req.param("id"));
  if (!employee) {
    return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  }
  const body = await readJsonBody(c.req.raw);
  const reason = optionalString(body.reason);
  if (!reason) {
    return fail(c, 400, "REASON_REQUIRED", "Archive reason is required.");
  }
  const archivedStatus = await getStatusByKey(c.env.DB, "ARCHIVED");
  await c.env.DB
    .prepare("UPDATE employees SET status_id = ?, archived_at = ?, updated_at = ? WHERE id = ?")
    .bind(archivedStatus?.id ?? employee.status_id, new Date().toISOString(), new Date().toISOString(), employee.id)
    .run();
  const updated = await getEmployeeById(c.env.DB, employee.id);
  await auditEmployee(c, { action: "employee.archived", entityType: "employee", entityId: employee.id, oldValue: employee, newValue: updated, reason });
  await publishEmployee(c, "employee.archived", employee.id, "archived");
  return ok(c, { employee: updated ? toEmployee(updated, hasPermission(c, "employees.sensitive.view")) : null });
});

employeeRoutes.get("/:id/overview", requirePermission("employees.view"), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), c.req.param("id"), "employees", "view"))) {
    return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  }
  const employee = await getEmployeeById(c.env.DB, c.req.param("id"));
  if (!employee) {
    return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  }
  const [tasks, contacts, audit] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM employee_onboarding_tasks WHERE employee_id = ? ORDER BY required DESC, created_at").bind(employee.id).all(),
    c.env.DB.prepare("SELECT * FROM employee_contacts WHERE employee_id = ? AND archived_at IS NULL ORDER BY contact_type, emergency_priority").bind(employee.id).all<ContactRow>(),
    c.env.DB.prepare(
      `SELECT * FROM audit_logs
       WHERE (module = 'employees' AND entity_id = ?)
           OR (module = 'leave' AND entity_id IN (SELECT id FROM leave_requests WHERE employee_id = ?))
            OR (module = 'attendance' AND (
              entity_id IN (SELECT id FROM attendance_daily_records WHERE employee_id = ?)
              OR entity_id IN (SELECT id FROM attendance_correction_requests WHERE employee_id = ?)
              OR entity_id IN (SELECT id FROM attendance_raw_logs WHERE employee_id = ?)
            ))
            OR (module = 'roster' AND (
              entity_id IN (SELECT id FROM roster_assignments WHERE employee_id = ?)
              OR entity_id IN (SELECT roster_assignment_id FROM roster_assignment_history WHERE employee_id = ?)
            ))
            OR (module = 'payroll' AND (
              entity_id IN (SELECT id FROM employee_payroll_profiles WHERE employee_id = ?)
              OR entity_id IN (SELECT id FROM employee_salary_history WHERE employee_id = ?)
              OR entity_id IN (SELECT id FROM employee_increments WHERE employee_id = ?)
              OR entity_id IN (SELECT id FROM payroll_advance_payments WHERE employee_id = ?)
              OR entity_id IN (SELECT id FROM payroll_deductions WHERE employee_id = ?)
              OR entity_id IN (SELECT id FROM payroll_adjustments WHERE employee_id = ?)
              OR entity_id IN (SELECT id FROM payroll_run_employees WHERE employee_id = ?)
              OR entity_id IN (SELECT id FROM final_settlements WHERE employee_id = ?)
            ))
         ORDER BY created_at DESC LIMIT 8`
    ).bind(employee.id, employee.id, employee.id, employee.id, employee.id, employee.id, employee.id, employee.id, employee.id, employee.id, employee.id, employee.id, employee.id, employee.id, employee.id).all()
  ]);
  return ok(c, {
    employee: toEmployee(employee, hasPermission(c, "employees.sensitive.view")),
    onboarding: tasks.results,
    contacts: contacts.results.map((contact) => toContact(contact, hasPermission(c, "employees.sensitive.view"))),
    audit: audit.results
  });
});

employeeRoutes.get("/:id/user-access", requirePermission("role_mappings.view"), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), c.req.param("id"), "employees", "view"))) {
    return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  }
  const preview = await roleMappingPreviewForEmployee(c, c.req.param("id"));
  if (!preview) return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  return ok(c, { preview });
});

employeeRoutes.post("/:id/user-access/apply", requirePermission("role_mappings.apply"), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), c.req.param("id"), "employees", "manage"))) {
    return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  }
  const body = await readJsonBody(c.req.raw).catch(() => ({} as Record<string, unknown>));
  return applyRoleMappingToEmployee(c, c.req.param("id"), optionalString(body.role_mapping_rule_id));
});

employeeRoutes.get("/:id/contacts", requirePermission("employees.contacts.view"), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), c.req.param("id"), "employees", "view"))) {
    return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  }
  const employee = await getEmployeeById(c.env.DB, c.req.param("id"));
  if (!employee) {
    return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  }
  const rows = await c.env.DB.prepare("SELECT * FROM employee_contacts WHERE employee_id = ? AND archived_at IS NULL ORDER BY contact_type, emergency_priority, created_at").bind(employee.id).all<ContactRow>();
  return ok(c, { contacts: rows.results.map((contact) => toContact(contact, hasPermission(c, "employees.sensitive.view"))) });
});

employeeRoutes.post("/:id/contacts", requirePermission("employees.contacts.manage"), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), c.req.param("id"), "employees", "manage"))) {
    return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  }
  const employee = await getEmployeeById(c.env.DB, c.req.param("id"));
  if (!employee) {
    return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  }
  return saveContact(c, employee.id);
});

employeeRoutes.patch("/:id/contacts/:contactId", requirePermission("employees.contacts.manage"), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), c.req.param("id"), "employees", "manage"))) {
    return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  }
  const employee = await getEmployeeById(c.env.DB, c.req.param("id"));
  if (!employee) {
    return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  }
  return saveContact(c, employee.id, c.req.param("contactId"));
});

employeeRoutes.post("/:id/contacts/:contactId/archive", requirePermission("employees.contacts.manage"), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), c.req.param("id"), "employees", "manage"))) {
    return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  }
  const contact = await c.env.DB.prepare("SELECT * FROM employee_contacts WHERE id = ? AND employee_id = ?").bind(c.req.param("contactId"), c.req.param("id")).first<ContactRow>();
  if (!contact) {
    return fail(c, 404, "NOT_FOUND", "Contact was not found.");
  }
  await c.env.DB.prepare("UPDATE employee_contacts SET archived_at = ?, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), new Date().toISOString(), contact.id).run();
  await auditEmployee(c, { action: "employee.contact.archived", entityType: "employee_contact", entityId: contact.id, oldValue: contact, reason: optionalString((await readJsonBody(c.req.raw)).reason) });
  await publishEmployee(c, "employee.updated", contact.employee_id, "contact_archived");
  return ok(c, { archived: true });
});

employeeRoutes.get("/:id/job-history", requirePermission("employees.job_history.view"), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), c.req.param("id"), "employees", "view"))) {
    return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  }
  const rows = await c.env.DB
    .prepare(
      `SELECT h.*,
        pd.name AS previous_department_name, nd.name AS new_department_name,
        pp.title AS previous_position_title, np.title AS new_position_title,
        pl.name AS previous_location_name, nl.name AS new_location_name,
        pjl.name AS previous_job_level_name, njl.name AS new_job_level_name,
        cb.name AS created_by_name, ab.name AS approved_by_name
       FROM employee_job_history h
       LEFT JOIN departments pd ON pd.id = h.previous_department_id
       LEFT JOIN departments nd ON nd.id = h.new_department_id
       LEFT JOIN positions pp ON pp.id = h.previous_position_id
       LEFT JOIN positions np ON np.id = h.new_position_id
       LEFT JOIN locations pl ON pl.id = h.previous_location_id
       LEFT JOIN locations nl ON nl.id = h.new_location_id
       LEFT JOIN job_levels pjl ON pjl.id = h.previous_job_level_id
       LEFT JOIN job_levels njl ON njl.id = h.new_job_level_id
       LEFT JOIN users cb ON cb.id = h.created_by_user_id
       LEFT JOIN users ab ON ab.id = h.approved_by_user_id
       WHERE h.employee_id = ?
       ORDER BY h.effective_date DESC, h.created_at DESC`
    )
    .bind(c.req.param("id"))
    .all();
  return ok(c, { job_history: rows.results });
});

employeeRoutes.post("/:id/job-history", requirePermission("employees.job_history.manage"), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), c.req.param("id"), "employees", "manage"))) {
    return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  }
  const employee = await getEmployeeById(c.env.DB, c.req.param("id"));
  if (!employee) {
    return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  }
  const body = await readJsonBody(c.req.raw);
  const input = readEmployeeInput({ ...employee, ...body });
  const effectiveDate = optionalString(body.effective_date);
  if (!effectiveDate) {
    return fail(c, 400, "VALIDATION_ERROR", "Effective date is required for job history changes.");
  }
  const refError = await validateEmployeeRefs(c, input, employee.id);
  if (refError) {
    return refError;
  }
  await createJobHistory(c, { employeeId: employee.id, previous: employee, next: input, effectiveDate, reason: optionalString(body.reason) });
  await c.env.DB
    .prepare("UPDATE employees SET primary_department_id = ?, primary_position_id = ?, primary_location_id = ?, job_level_id = ?, reporting_manager_employee_id = ?, updated_at = ? WHERE id = ?")
    .bind(input.primary_department_id, input.primary_position_id, input.primary_location_id, input.job_level_id, input.reporting_manager_employee_id, new Date().toISOString(), employee.id)
    .run();
  await auditEmployee(c, { action: "employee.job_changed", entityType: "employee", entityId: employee.id, oldValue: employee, newValue: input, reason: optionalString(body.reason) });
  await publishEmployee(c, "employee.updated", employee.id, "job_changed");
  return ok(c, { employee: toEmployee((await getEmployeeById(c.env.DB, employee.id))!, hasPermission(c, "employees.sensitive.view")) });
});

employeeRoutes.get("/:id/onboarding", requirePermission("employees.view"), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), c.req.param("id"), "employees", "view"))) {
    return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  }
  const rows = await c.env.DB.prepare("SELECT * FROM employee_onboarding_tasks WHERE employee_id = ? ORDER BY required DESC, created_at").bind(c.req.param("id")).all();
  return ok(c, { onboarding: rows.results });
});

employeeRoutes.patch("/:id/onboarding/:taskId", requirePermission("employees.onboarding.manage"), async (c) => {
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), c.req.param("id"), "employees", "manage"))) {
    return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  }
  const body = await readJsonBody(c.req.raw);
  const status = body.status;
  if (typeof status !== "string" || !ONBOARDING_STATUSES.has(status as OnboardingStatus)) {
    return fail(c, 400, "VALIDATION_ERROR", "Onboarding status must be PENDING, COMPLETED, SKIPPED, or BLOCKED.");
  }
  const task = await c.env.DB.prepare("SELECT * FROM employee_onboarding_tasks WHERE id = ? AND employee_id = ?").bind(c.req.param("taskId"), c.req.param("id")).first();
  if (!task) {
    return fail(c, 404, "NOT_FOUND", "Onboarding task was not found.");
  }
  const completedAt = status === "COMPLETED" ? new Date().toISOString() : null;
  const completedBy = status === "COMPLETED" ? c.get("currentUser").id : null;
  await c.env.DB
    .prepare("UPDATE employee_onboarding_tasks SET status = ?, completed_at = ?, completed_by_user_id = ?, updated_at = ? WHERE id = ?")
    .bind(status, completedAt, completedBy, new Date().toISOString(), c.req.param("taskId"))
    .run();
  const updated = await c.env.DB.prepare("SELECT * FROM employee_onboarding_tasks WHERE id = ?").bind(c.req.param("taskId")).first();
  await auditEmployee(c, { action: "employee.onboarding_task.updated", entityType: "employee_onboarding_task", entityId: c.req.param("taskId"), oldValue: task, newValue: updated });
  await publishEmployee(c, "employee.onboarding_changed", c.req.param("id"), "onboarding_changed");
  return ok(c, { task: updated });
});

employeeRoutes.get("/:id/audit", requirePermission("employees.view"), async (c) => {
  const employeeId = c.req.param("id");
  if (!(await canAccessEmployee(c.env.DB, c.get("currentUser"), employeeId, "employees", "view"))) {
    return fail(c, 404, "NOT_FOUND", "Employee was not found.");
  }
  const rows = await c.env.DB.prepare(
    `SELECT * FROM audit_logs
     WHERE (module = 'employees' AND (entity_id = ? OR new_value_json LIKE ?))
        OR (module = 'payroll' AND (
          entity_id IN (SELECT id FROM employee_payroll_profiles WHERE employee_id = ?)
          OR entity_id IN (SELECT id FROM employee_salary_history WHERE employee_id = ?)
          OR entity_id IN (SELECT id FROM employee_increments WHERE employee_id = ?)
          OR entity_id IN (SELECT id FROM payroll_advance_payments WHERE employee_id = ?)
          OR entity_id IN (SELECT id FROM payroll_deductions WHERE employee_id = ?)
          OR entity_id IN (SELECT id FROM payroll_adjustments WHERE employee_id = ?)
          OR entity_id IN (SELECT id FROM payroll_run_employees WHERE employee_id = ?)
          OR entity_id IN (SELECT id FROM final_settlements WHERE employee_id = ?)
        ))
     ORDER BY created_at DESC LIMIT 100`
  ).bind(employeeId, `%${employeeId}%`, employeeId, employeeId, employeeId, employeeId, employeeId, employeeId, employeeId, employeeId).all();
  return ok(c, { audit: rows.results });
});

function readStatusInput(body: Record<string, unknown>) {
  return {
    description: optionalString(body.description),
    can_login: boolValue(body.can_login, false),
    include_in_payroll: boolValue(body.include_in_payroll, false),
    include_in_roster: boolValue(body.include_in_roster, false),
    show_in_active_lists: boolValue(body.show_in_active_lists, false),
    requires_exit_date: boolValue(body.requires_exit_date, false),
    requires_exit_reason: boolValue(body.requires_exit_reason, false),
    requires_final_settlement: boolValue(body.requires_final_settlement, false),
    requires_document_clearance: boolValue(body.requires_document_clearance, false),
    requires_asset_clearance: boolValue(body.requires_asset_clearance, false),
    sort_order: numericValue(body.sort_order, 100)
  };
}

async function setStatusActive(c: Context<AppBindings>, active: 0 | 1) {
  const id = c.req.param("id");
  if (!id) {
    return fail(c, 400, "VALIDATION_ERROR", "Status id is required.");
  }
  const status = await getStatusById(c.env.DB, id);
  if (!status) {
    return fail(c, 404, "NOT_FOUND", "Employee status was not found.");
  }
  if (active === 0) {
    const used = await c.env.DB.prepare("SELECT COUNT(*) AS count FROM employees WHERE status_id = ?").bind(status.id).first<{ count: number }>();
    if ((used?.count ?? 0) > 0) {
      return fail(c, 409, "STATUS_IN_USE", "This status is currently used by employees and cannot be disabled.");
    }
  }
  await c.env.DB.prepare("UPDATE employee_statuses SET is_active = ?, updated_at = ? WHERE id = ?").bind(active, new Date().toISOString(), status.id).run();
  const updated = await getStatusById(c.env.DB, status.id);
  await auditEmployee(c, {
    action: active === 1 ? "employee.status_setting.enabled" : "employee.status_setting.disabled",
    entityType: "employee_status",
    entityId: status.id,
    oldValue: status,
    newValue: updated
  });
  return ok(c, { status: updated ? toStatus(updated) : null });
}

async function saveContact(c: Context<AppBindings>, employeeId: string, contactId?: string) {
  const body = await readJsonBody(c.req.raw);
  const contactType = typeof body.contact_type === "string" && CONTACT_TYPES.has(body.contact_type as ContactType) ? (body.contact_type as ContactType) : null;
  const value = readString(body.value);
  const isSensitive = boolValue(body.is_sensitive, false);
  if (!contactType || !value) {
    return fail(c, 400, "VALIDATION_ERROR", "Contact type and value are required.");
  }
  if (isSensitive && !hasPermission(c, "employees.sensitive.update")) {
    return fail(c, 403, "FORBIDDEN", "Sensitive contacts require sensitive update permission.");
  }
  const old = contactId ? await c.env.DB.prepare("SELECT * FROM employee_contacts WHERE id = ? AND employee_id = ?").bind(contactId, employeeId).first<ContactRow>() : null;
  if (contactId && !old) {
    return fail(c, 404, "NOT_FOUND", "Contact was not found.");
  }
  if (boolValue(body.is_primary, false)) {
    await c.env.DB.prepare("UPDATE employee_contacts SET is_primary = 0, updated_at = ? WHERE employee_id = ? AND contact_type = ?").bind(new Date().toISOString(), employeeId, contactType).run();
  }
  const id = contactId ?? crypto.randomUUID();
  if (old) {
    await c.env.DB
      .prepare(
        `UPDATE employee_contacts SET contact_type = ?, value = ?, country_code = ?, relationship = ?, is_primary = ?,
          emergency_priority = ?, is_sensitive = ?, notes = ?, updated_at = ? WHERE id = ?`
      )
      .bind(contactType, value, optionalString(body.country_code), optionalString(body.relationship), boolValue(body.is_primary, false) ? 1 : 0, body.emergency_priority === null || body.emergency_priority === undefined ? null : numericValue(body.emergency_priority, 0), isSensitive ? 1 : 0, optionalString(body.notes), new Date().toISOString(), id)
      .run();
  } else {
    await c.env.DB
      .prepare(
        `INSERT INTO employee_contacts
         (id, employee_id, contact_type, value, country_code, relationship, is_primary, emergency_priority, is_sensitive, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, employeeId, contactType, value, optionalString(body.country_code), optionalString(body.relationship), boolValue(body.is_primary, false) ? 1 : 0, body.emergency_priority === null || body.emergency_priority === undefined ? null : numericValue(body.emergency_priority, 0), isSensitive ? 1 : 0, optionalString(body.notes))
      .run();
  }
  const contact = await c.env.DB.prepare("SELECT * FROM employee_contacts WHERE id = ?").bind(id).first<ContactRow>();
  await auditEmployee(c, {
    action: old ? "employee.contact.updated" : "employee.contact.created",
    entityType: "employee_contact",
    entityId: id,
    oldValue: old,
    newValue: contact
  });
  await publishEmployee(c, "employee.updated", employeeId, old ? "contact_updated" : "contact_created");
  return ok(c, { contact: contact ? toContact(contact, hasPermission(c, "employees.sensitive.view")) : null }, old ? 200 : 201);
}
