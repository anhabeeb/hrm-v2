import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import { buildEmployeeScopeWhereClause, canAccessEmployee } from "../auth/access-scopes";
import { recordAudit } from "../db/audit";
import { hasValidationErrors, validateDateRange, validateDuplicateConflict, validationResponse } from "../lib/moduleValidation";
import { requireAuth } from "../middleware/auth";
import { publishAccessEvent } from "../realtime/publisher";
import type { AppBindings, AuthUser } from "../types";
import { fail, getClientIp, nowIso, ok } from "../utils/http";
import { readString } from "../utils/validation";
import { calculateEmployeeDocumentCompliance } from "./document-compliance";
import { uploadEmployeeDocument } from "./documents";

type BindValue = string | number | null;
type LifecycleCaseType = "ONBOARDING" | "OFFBOARDING";
type TaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "WAIVED" | "BLOCKED" | "NOT_REQUIRED" | "CANCELLED";

export const onboardingRoutes = new Hono<AppBindings>();
export const offboardingRoutes = new Hono<AppBindings>();
export const employeeLifecycleRoutes = new Hono<AppBindings>();
export const selfServiceLifecycleRoutes = new Hono<AppBindings>();
export const lifecycleRoutes = new Hono<AppBindings>();

onboardingRoutes.use("*", requireAuth);
offboardingRoutes.use("*", requireAuth);
employeeLifecycleRoutes.use("*", requireAuth);
selfServiceLifecycleRoutes.use("*", requireAuth);
lifecycleRoutes.use("*", requireAuth);

const onboardingSettingsFields = [
  "onboarding_enabled",
  "require_onboarding_before_activation",
  "allow_draft_employee_records",
  "auto_create_onboarding_case_on_employee_create",
  "allow_partial_onboarding",
  "require_personal_info_before_activation",
  "require_contact_info_before_activation",
  "require_emergency_contact_before_activation",
  "require_job_assignment_before_activation",
  "require_department_before_activation",
  "require_worksite_location_before_activation",
  "require_reporting_manager_before_activation",
  "require_documents_before_activation",
  "require_contract_before_activation",
  "require_payroll_profile_before_activation",
  "require_payment_method_before_activation",
  "require_pension_profile_if_eligible_before_activation",
  "require_roster_eligibility_before_activation",
  "require_biometric_mapping_before_activation",
  "require_asset_uniform_issue_before_activation",
  "require_user_account_before_activation",
  "require_approval_before_activation",
  "allow_activation_override_with_reason",
  "use_central_approval_workflow",
  "default_onboarding_due_days",
  "default_task_due_days",
  "overdue_alerts_enabled",
  "employee_self_service_onboarding_view_enabled",
  "invite_email_placeholder_enabled",
  "metadata_json"
] as const;

const offboardingSettingsFields = [
  "offboarding_enabled",
  "require_offboarding_case_before_exit",
  "auto_create_offboarding_case_on_exit_status",
  "require_final_settlement_before_archive",
  "require_asset_uniform_clearance",
  "require_document_checklist",
  "require_payroll_final_check",
  "require_attendance_final_check",
  "require_roster_future_assignment_check",
  "require_user_account_deactivation",
  "require_access_revocation",
  "require_approval_before_exit_finalization",
  "allow_offboarding_override_with_reason",
  "use_central_approval_workflow",
  "default_offboarding_due_days",
  "default_task_due_days",
  "overdue_alerts_enabled",
  "employee_self_service_offboarding_view_enabled",
  "scheduled_access_deactivation_placeholder_enabled",
  "metadata_json"
] as const;

const onboardingTemplates = [
  ["personal_info", "Personal information complete", "PERSONAL_INFO", "employees", "Core profile fields are complete.", 1],
  ["contact_info", "Contact information reviewed", "CONTACT_INFO", "employees", "Contact and emergency contact data has been reviewed.", 0],
  ["job_assignment", "Job and organization assigned", "JOB_ASSIGNMENT", "employees", "Department, position, location, and reporting structure are ready.", 1],
  ["documents", "Required documents complete", "DOCUMENTS", "documents", "Required document compliance is complete or waived.", 1],
  ["contract", "Contract ready", "CONTRACT", "contracts", "Employment contract is active or marked not required.", 0],
  ["payroll_profile", "Payroll profile ready", "PAYROLL_PROFILE", "payroll", "Payroll profile and salary foundation are ready.", 1],
  ["payment_method", "Payment method reviewed", "PAYMENT_METHOD", "payroll", "Payment method is available if required.", 0],
  ["pension_profile", "Pension profile reviewed", "PENSION_PROFILE", "payroll", "Pension enrollment, exemption, or voluntary setup is reviewed.", 0],
  ["user_access", "User access setup reviewed", "USER_ACCESS", "users", "Login/access setup is created, linked, or deferred.", 0],
  ["attendance_biometric", "Attendance and biometric readiness", "ATTENDANCE_BIOMETRIC", "attendance", "Roster eligibility, attendance start, and biometric mapping are ready if required.", 0],
  ["assets_uniforms", "Assets and uniforms reviewed", "ASSETS_UNIFORMS", "assets", "Required assets/uniform issue is complete or waived.", 0],
  ["activation_approval", "Final activation approval", "ACTIVATION_APPROVAL", "approvals", "Activation approval is complete or not required.", 1]
] as const;

const offboardingTemplates = [
  ["final_settlement", "Final settlement readiness", "FINAL_SETTLEMENT", "final_settlement", "Final settlement is complete or not required.", 1],
  ["leave", "Leave balances and pending requests reviewed", "LEAVE", "leave", "Leave requests and balance impact are reviewed.", 0],
  ["payroll", "Payroll final check", "PAYROLL", "payroll", "Payroll, advances, bank loans, deductions, and pension are checked.", 1],
  ["attendance_biometric", "Attendance and biometric warnings reviewed", "ATTENDANCE_BIOMETRIC", "attendance", "Attendance corrections and biometric import warnings are reviewed.", 1],
  ["roster", "Future roster assignments reviewed", "ROSTER", "roster", "Future roster assignments after exit date are reviewed.", 1],
  ["assets_uniforms", "Asset and uniform clearance", "ASSETS_UNIFORMS", "assets", "Issued assets/uniforms are cleared, waived, or charged.", 1],
  ["documents", "Document return/compliance reviewed", "DOCUMENTS", "documents", "Document checklist and compliance is reviewed.", 0],
  ["user_access", "User access deactivated/revoked", "USER_ACCESS", "users", "Login and access revocation is complete or scheduled.", 1],
  ["final_approval", "Exit final approval", "APPROVAL", "approvals", "Exit finalization approval is complete or not required.", 1]
] as const;

function hasAny(c: Context<AppBindings>, permissions: string[]) {
  const user = c.get("currentUser");
  return user.is_owner || permissions.some((permission) => user.permissions.includes(permission));
}

function requireAnyPermission(permissions: string[]) {
  return createMiddleware<AppBindings>(async (c, next) => {
    if (!hasAny(c, permissions)) return fail(c, 403, "LIFECYCLE_PERMISSION_DENIED", "You do not have permission for this lifecycle action.");
    await next();
  });
}

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function caseNumber(prefix: string) {
  return `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

async function readBody(c: Context<AppBindings>) {
  return (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
}

function asBool(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") return value === "1" || value.toLowerCase() === "true";
  return fallback;
}

function asSqlBool(value: unknown) {
  return asBool(value) ? 1 : 0;
}

function optionalText(value: unknown) {
  return readString(value) || null;
}

function oldTaskStatus(status: TaskStatus) {
  if (status === "COMPLETED") return "COMPLETED";
  if (status === "BLOCKED") return "BLOCKED";
  if (status === "WAIVED" || status === "NOT_REQUIRED" || status === "CANCELLED") return "SKIPPED";
  return "PENDING";
}

const onboardingWorkspaceViewPermissions = ["onboarding.workspace.view", "onboarding.cases.view", "onboarding.cases.manage", "employees.lifecycle.view", "employees.view"];
const onboardingWorkspaceUpdatePermissions = ["onboarding.workspace.update", "onboarding.cases.update", "onboarding.cases.manage", "employees.lifecycle.manage"];

const onboardingTaskModuleKeys: Record<string, string | null> = {
  personal_info: "employees",
  contact_info: "employees",
  job_assignment: "employees",
  documents: "document_compliance",
  contract: "contracts",
  payroll_profile: "payroll",
  payment_method: "payment_methods",
  pension_profile: "pension",
  user_access: "self_service",
  attendance_biometric: "attendance",
  assets_uniforms: "assets_uniforms",
  activation_approval: "approvals"
};

async function isModuleEnabled(db: D1Database, moduleKey: string | null | undefined) {
  if (!moduleKey) return true;
  const row = await db.prepare("SELECT is_enabled FROM module_control_settings WHERE module_key = ?").bind(moduleKey).first<{ is_enabled: number }>();
  return !row || row.is_enabled === 1;
}

async function ensureOnboardingModuleEnabled(c: Context<AppBindings>, taskKey: string, moduleKey: string | null | undefined) {
  const enabled = await isModuleEnabled(c.env.DB, moduleKey);
  if (enabled) return true;
  await setOnboardingTaskState(c, String(c.req.param("caseId")), taskKey, "NOT_REQUIRED", `${moduleKey ?? "Module"} is disabled.`);
  return false;
}

async function setOnboardingTaskState(c: Context<AppBindings>, caseId: string, taskKey: string, taskStatus: TaskStatus, reason?: string | null) {
  const now = nowIso();
  await c.env.DB
    .prepare(
      `UPDATE employee_onboarding_tasks
       SET task_status = ?, status = ?, completed_by_user_id = CASE WHEN ? = 'COMPLETED' THEN ? ELSE completed_by_user_id END,
           completed_at = CASE WHEN ? = 'COMPLETED' THEN ? ELSE completed_at END,
           waived_by_user_id = CASE WHEN ? = 'WAIVED' THEN ? ELSE waived_by_user_id END,
           waived_at = CASE WHEN ? = 'WAIVED' THEN ? ELSE waived_at END,
           waiver_reason = COALESCE(?, waiver_reason),
           notes = COALESCE(?, notes),
           updated_at = ?
       WHERE onboarding_case_id = ? AND task_key = ?`
    )
    .bind(taskStatus, oldTaskStatus(taskStatus), taskStatus, c.get("currentUser").id, taskStatus, now, taskStatus, c.get("currentUser").id, taskStatus, now, reason ?? null, reason ?? null, now, caseId, taskKey)
    .run();
}

async function refreshWorkspaceReadiness(c: Context<AppBindings>, caseId: string, taskKey?: string, action?: string) {
  if (taskKey && action) {
    const gate = await getCaseEmployee(c, "ONBOARDING", caseId, "view");
    if (gate) await createLifecycleEvent(c, { employeeId: String(gate.row.employee_id), caseType: "ONBOARDING", caseId, action, previousStatus: String(gate.row.onboarding_status), newStatus: String(gate.row.onboarding_status), metadata: { source_of_truth: "source_module", task_key: taskKey } });
  }
  return getEmployeeOnboardingReadiness(c, caseId);
}

function where(conditions: string[]) {
  return conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function maskAccount(value: string | null) {
  if (!value) return null;
  return value.length <= 4 ? "****" : `${"*".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

async function auditLifecycle(c: Context<AppBindings>, action: string, entityType: string, entityId: string | null, oldValue?: unknown, newValue?: unknown, reason?: string | null) {
  await recordAudit(c.env.DB, {
    actorUserId: c.get("currentUser").id,
    action,
    module: "lifecycle",
    entityType,
    entityId,
    oldValue,
    newValue,
    reason,
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent") ?? null
  });
}

async function publishLifecycle(c: Context<AppBindings>, employeeId: string, action: string) {
  await publishAccessEvent(c.env, "employees.changed", { actor_user_id: c.get("currentUser").id, entity_type: "employee", entity_id: employeeId, action });
}

async function ensureOnboardingSettings(db: D1Database) {
  await db.prepare("INSERT OR IGNORE INTO onboarding_settings (id, metadata_json) VALUES ('onboarding_settings_default', ?)").bind(JSON.stringify({ seeded_prompt: "19" })).run();
  return db.prepare("SELECT * FROM onboarding_settings WHERE id = 'onboarding_settings_default'").first<Record<string, unknown>>();
}

async function ensureOffboardingSettings(db: D1Database) {
  await db.prepare("INSERT OR IGNORE INTO offboarding_settings (id, metadata_json) VALUES ('offboarding_settings_default', ?)").bind(JSON.stringify({ seeded_prompt: "19" })).run();
  return db.prepare("SELECT * FROM offboarding_settings WHERE id = 'offboarding_settings_default'").first<Record<string, unknown>>();
}

async function getScopedEmployee(c: Context<AppBindings>, employeeId: string, action: "view" | "manage" = "view") {
  const user = c.get("currentUser");
  const allowed = await canAccessEmployee(c.env.DB, user, employeeId, "employees", action);
  if (!allowed) return null;
  return c.env.DB
    .prepare(
      `SELECT e.*, d.name AS department_name, l.name AS location_name, p.title AS position_name, es.key AS status_key, es.name AS status_name
       FROM employees e
       LEFT JOIN departments d ON d.id = e.primary_department_id
       LEFT JOIN locations l ON l.id = e.primary_location_id
       LEFT JOIN positions p ON p.id = e.primary_position_id
       LEFT JOIN employee_statuses es ON es.id = e.status_id
       WHERE e.id = ? AND e.archived_at IS NULL`
    )
    .bind(employeeId)
    .first<Record<string, unknown>>();
}

async function activeEntityExists(db: D1Database, table: "departments" | "positions" | "locations" | "job_levels", id: string | null) {
  if (!id) return true;
  const row = await db.prepare(`SELECT id FROM ${table} WHERE id = ? AND is_active = 1`).bind(id).first<{ id: string }>();
  return Boolean(row);
}

async function activeEmployeeExists(db: D1Database, id: string | null) {
  if (!id) return true;
  const row = await db.prepare("SELECT id FROM employees WHERE id = ? AND archived_at IS NULL").bind(id).first<{ id: string }>();
  return Boolean(row);
}

async function createsReportingCycle(db: D1Database, employeeId: string, managerId: string | null) {
  let current = managerId;
  const visited = new Set<string>();
  while (current) {
    if (current === employeeId || visited.has(current)) return true;
    visited.add(current);
    const row = await db.prepare("SELECT reporting_manager_employee_id FROM employees WHERE id = ? AND archived_at IS NULL").bind(current).first<{ reporting_manager_employee_id: string | null }>();
    current = row?.reporting_manager_employee_id ?? null;
  }
  return false;
}

async function validateWorkspaceJobAssignment(c: Context<AppBindings>, employeeId: string, body: Record<string, unknown>) {
  const departmentId = optionalText(body.primary_department_id);
  const locationId = optionalText(body.primary_location_id);
  const jobLevelId = optionalText(body.job_level_id);
  const positionId = optionalText(body.primary_position_id);
  const managerId = optionalText(body.reporting_manager_employee_id);
  if (!(await activeEntityExists(c.env.DB, "departments", departmentId))) return fail(c, 400, "ONBOARDING_DEPARTMENT_INVALID", "Selected department is inactive or was not found.");
  if (!(await activeEntityExists(c.env.DB, "locations", locationId))) return fail(c, 400, "ONBOARDING_LOCATION_INVALID", "Selected outlet/location is inactive or was not found.");
  if (!(await activeEntityExists(c.env.DB, "job_levels", jobLevelId))) return fail(c, 400, "ONBOARDING_JOB_LEVEL_INVALID", "Selected job level is inactive or was not found.");
  if (!(await activeEntityExists(c.env.DB, "positions", positionId))) return fail(c, 400, "ONBOARDING_POSITION_INVALID", "Selected position is inactive or was not found.");
  if (positionId) {
    const position = await c.env.DB.prepare("SELECT department_id, level_id FROM positions WHERE id = ?").bind(positionId).first<{ department_id: string | null; level_id: string | null }>();
    if (departmentId && position?.department_id && position.department_id !== departmentId) return fail(c, 400, "ONBOARDING_POSITION_DEPARTMENT_MISMATCH", "Selected position does not belong to the selected department.");
    if (jobLevelId && position?.level_id && position.level_id !== jobLevelId) return fail(c, 400, "ONBOARDING_POSITION_LEVEL_MISMATCH", "Selected position does not match the selected job level.");
  }
  if (managerId) {
    if (managerId === employeeId) return fail(c, 400, "REPORTING_MANAGER_SELF", "Employee cannot be their own reporting manager.");
    if (!(await activeEmployeeExists(c.env.DB, managerId))) return fail(c, 400, "REPORTING_MANAGER_INVALID", "Reporting manager must be an active employee.");
    if (await createsReportingCycle(c.env.DB, employeeId, managerId)) return fail(c, 400, "REPORTING_MANAGER_CYCLE", "Reporting manager creates a circular reporting chain.");
  }
  return null;
}

async function getOnboardingWorkspaceDocumentTypes(c: Context<AppBindings>) {
  const richQuery = `
    SELECT id,
           code,
           name,
           COALESCE(is_sensitive, 0) AS is_sensitive,
           COALESCE(allowed_mime_types, allowed_file_types_json, '["application/pdf","image/jpeg","image/png"]') AS allowed_mime_types,
           COALESCE(max_file_size_mb, 10) AS max_file_size_mb,
           COALESCE(allow_multiple_files, 0) AS allow_multiple_files,
           COALESCE(requires_expiry_date, 0) AS requires_expiry_date,
           COALESCE(requires_issue_date, 0) AS requires_issue_date,
           COALESCE(requires_document_number, 0) AS requires_document_number,
           COALESCE(expiry_required, 0) AS expiry_required,
           COALESCE(issue_date_required, 0) AS issue_date_required,
           COALESCE(document_number_required, 0) AS document_number_required
      FROM document_types
     WHERE is_active = 1
     ORDER BY sort_order, name`;
  try {
    const rows = await c.env.DB.prepare(richQuery).all<Record<string, unknown>>();
    return { results: rows.results, warning: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/no such column/i.test(message)) throw error;
    try {
      const rows = await c.env.DB.prepare(
        `SELECT id,
                code,
                name,
                COALESCE(is_sensitive, 0) AS is_sensitive,
                COALESCE(allowed_file_types_json, '["application/pdf","image/jpeg","image/png"]') AS allowed_mime_types,
                10 AS max_file_size_mb,
                0 AS allow_multiple_files,
                0 AS requires_expiry_date,
                0 AS requires_issue_date,
                0 AS requires_document_number,
                0 AS expiry_required,
                0 AS issue_date_required,
                0 AS document_number_required
           FROM document_types
          WHERE is_active = 1
          ORDER BY sort_order, name`
      ).all<Record<string, unknown>>();
      return {
        results: rows.results,
        warning: "Document upload configuration is incomplete. Default file rules are shown until the schema repair is applied."
      };
    } catch {
      return {
        results: [],
        warning: "Document type upload configuration could not be loaded. Other onboarding workspace sections remain available."
      };
    }
  }
}

async function loadOnboardingWorkspace(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "ONBOARDING", caseId, "view");
  if (!gate) return null;
  const employeeId = String(gate.row.employee_id);
  const [
    checklist,
    readiness,
    contacts,
    addresses,
    documents,
    documentTypes,
    contracts,
    contractTypes,
    contractSettings,
    payrollProfile,
    paymentMethods,
    paymentInstitutions,
    pensionProfile,
    pensionSchemes,
    biometricMappings,
    assetAssignments,
    availableAssets,
    linkedUser,
    events,
    departments,
    locations,
    positions,
    jobLevels,
    reportingManagers
  ] = await Promise.all([
    getOnboardingChecklistStatus(c, caseId),
    getEmployeeOnboardingReadiness(c, caseId),
    c.env.DB.prepare("SELECT * FROM employee_contacts WHERE employee_id = ? AND archived_at IS NULL ORDER BY is_primary DESC, contact_type").bind(employeeId).all<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT * FROM employee_addresses WHERE employee_id = ? ORDER BY is_primary DESC, address_type").bind(employeeId).all<Record<string, unknown>>(),
    getOnboardingDocumentChecklist(c, caseId),
    getOnboardingWorkspaceDocumentTypes(c),
    c.env.DB.prepare("SELECT ec.*, ct.name AS contract_type_name, ct.requires_end_date, ct.requires_probation FROM employee_contracts ec LEFT JOIN contract_types ct ON ct.id = ec.contract_type_id WHERE ec.employee_id = ? ORDER BY ec.created_at DESC").bind(employeeId).all<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT * FROM contract_types WHERE is_active = 1 AND status = 'ACTIVE' ORDER BY display_order, name").all<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT * FROM contract_settings ORDER BY created_at LIMIT 1").first<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT * FROM employee_payroll_profiles WHERE employee_id = ?").bind(employeeId).first<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT * FROM employee_payment_methods WHERE employee_id = ? AND status != 'ARCHIVED' ORDER BY is_primary DESC, created_at DESC").bind(employeeId).all<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT id, code, name, type, is_active, status FROM payment_institutions WHERE is_active = 1 AND status = 'ACTIVE' ORDER BY display_order, name").all<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT epp.*, ps.scheme_name, ps.scheme_code FROM employee_pension_profiles epp LEFT JOIN pension_schemes ps ON ps.id = epp.pension_scheme_id WHERE epp.employee_id = ? AND epp.status != 'ARCHIVED' ORDER BY epp.effective_date DESC LIMIT 1").bind(employeeId).first<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT * FROM pension_schemes WHERE status = 'ACTIVE' ORDER BY scheme_name").all<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT * FROM employee_biometric_mappings WHERE employee_id = ? AND status != 'ARCHIVED' ORDER BY is_primary DESC, created_at DESC").bind(employeeId).all<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT ea.*, ai.code AS asset_code, ai.name AS asset_name FROM employee_asset_assignments ea LEFT JOIN asset_items ai ON ai.id = ea.asset_item_id WHERE ea.employee_id = ? ORDER BY ea.created_at DESC").bind(employeeId).all<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT id, code, name, status, lifecycle_status FROM asset_items WHERE status = 'AVAILABLE' ORDER BY name LIMIT 200").all<Record<string, unknown>>(),
    gate.employee.user_id ? c.env.DB.prepare("SELECT id, email, name, status, last_login_at FROM users WHERE id = ?").bind(String(gate.employee.user_id)).first<Record<string, unknown>>() : Promise.resolve(null),
    c.env.DB.prepare("SELECT * FROM employee_lifecycle_events WHERE case_type = 'ONBOARDING' AND case_id = ? ORDER BY created_at DESC LIMIT 50").bind(caseId).all<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT id, code, name, parent_department_id, is_active FROM departments WHERE is_active = 1 ORDER BY name").all<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT id, code, name, type, island_city, is_active FROM locations WHERE is_active = 1 ORDER BY name").all<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT id, code, title, department_id, level_id, is_active FROM positions WHERE is_active = 1 ORDER BY title").all<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT id, code, name, rank_order, is_active FROM job_levels WHERE is_active = 1 ORDER BY rank_order, name").all<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT id, employee_no, full_name, primary_department_id, primary_location_id, primary_position_id FROM employees WHERE archived_at IS NULL AND id != ? ORDER BY full_name").bind(employeeId).all<Record<string, unknown>>()
  ]);
  const moduleKeys = ["contracts", "document_compliance", "payroll", "payment_methods", "pension", "attendance", "zkteco_attendance", "roster", "assets_uniforms", "self_service", "approvals"];
  const moduleStatuses: Record<string, boolean> = {};
  for (const key of moduleKeys) moduleStatuses[key] = await isModuleEnabled(c.env.DB, key);
  return {
    case: gate.row,
    employee: gate.employee,
    checklist,
    readiness,
    module_statuses: moduleStatuses,
    refs: {
      departments: departments.results,
      locations: locations.results,
      positions: positions.results,
      job_levels: jobLevels.results,
      reporting_managers: reportingManagers.results,
      document_types: documentTypes.results,
      contract_types: contractTypes.results,
      payment_institutions: paymentInstitutions.results,
      pension_schemes: pensionSchemes.results,
      available_assets: availableAssets.results
    },
    sections: {
      contacts: contacts.results,
      addresses: addresses.results,
      documents,
      document_type_warning: documentTypes.warning,
      contracts: contracts.results,
      contract_settings: contractSettings,
      payroll_profile: payrollProfile,
      payment_methods: paymentMethods.results,
      pension_profile: pensionProfile,
      biometric_mappings: biometricMappings.results,
      asset_assignments: assetAssignments.results,
      linked_user: linkedUser
    },
    events: events.results
  };
}

async function getCaseEmployee(c: Context<AppBindings>, caseType: LifecycleCaseType, caseId: string, action: "view" | "manage" = "view") {
  const table = caseType === "ONBOARDING" ? "employee_onboarding_cases" : "employee_offboarding_cases";
  const row = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(caseId).first<Record<string, unknown>>();
  if (!row) return null;
  const employee = await getScopedEmployee(c, String(row.employee_id), action);
  return employee ? { row, employee } : null;
}

export async function createLifecycleEvent(c: Context<AppBindings>, input: { employeeId: string; caseType: LifecycleCaseType; caseId: string; action: string; previousStatus?: string | null; newStatus?: string | null; reason?: string | null; note?: string | null; metadata?: unknown }) {
  const eventId = id("lifecycle_event");
  const user = c.get("currentUser");
  await c.env.DB
    .prepare(
      `INSERT INTO employee_lifecycle_events
       (id, employee_id, case_type, case_id, action, previous_status, new_status, actor_user_id, actor_name_snapshot, reason, note, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(eventId, input.employeeId, input.caseType, input.caseId, input.action, input.previousStatus ?? null, input.newStatus ?? null, user.id, user.name, input.reason ?? null, input.note ?? null, input.metadata ? JSON.stringify(input.metadata) : null)
    .run();
  await auditLifecycle(c, input.action, "employee_lifecycle_event", eventId, { previous_status: input.previousStatus }, { new_status: input.newStatus, metadata: input.metadata }, input.reason);
  return eventId;
}

export async function createOnboardingTaskIfMissing(c: Context<AppBindings>, caseId: string, employeeId: string, template: (typeof onboardingTemplates)[number], requiredOverride?: boolean) {
  const [taskKey, taskName, taskGroup, sourceModule, description, defaultRequired] = template;
  const taskId = id("onboarding_task");
  const required = requiredOverride ?? defaultRequired === 1;
  await c.env.DB
    .prepare(
      `INSERT OR IGNORE INTO employee_onboarding_tasks
       (id, onboarding_case_id, employee_id, task_key, title, task_name, description, module, task_group, source_module, status, task_status, required, is_required)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', 'NOT_STARTED', ?, ?)`
    )
    .bind(taskId, caseId, employeeId, taskKey, taskName, taskName, description, sourceModule, taskGroup, sourceModule, required ? 1 : 0, required ? 1 : 0)
    .run();
}

async function createOffboardingTaskIfMissing(c: Context<AppBindings>, caseId: string, employeeId: string, template: (typeof offboardingTemplates)[number]) {
  const [taskKey, taskName, taskGroup, sourceModule, notes, required] = template;
  await c.env.DB
    .prepare(
      `INSERT OR IGNORE INTO employee_offboarding_tasks
       (id, offboarding_case_id, employee_id, task_key, task_name, task_group, source_module, is_required, task_status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'NOT_STARTED', ?)`
    )
    .bind(id("offboarding_task"), caseId, employeeId, taskKey, taskName, taskGroup, sourceModule, required, notes)
    .run();
}

export async function refreshOnboardingChecklist(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "ONBOARDING", caseId, "view");
  if (!gate) return null;
  const settings = await ensureOnboardingSettings(c.env.DB);
  await seedOnboardingChecklistForEmployee(c, caseId, String(gate.row.employee_id), settings);
  return getOnboardingChecklistStatus(c, caseId);
}

function isOnboardingTemplateRequired(template: (typeof onboardingTemplates)[number], settings: Record<string, unknown> | null | undefined) {
  return template[0] === "documents" ? Number(settings?.require_documents_before_activation ?? 1) === 1
    : template[0] === "contract" ? Number(settings?.require_contract_before_activation ?? 0) === 1
    : template[0] === "payroll_profile" ? Number(settings?.require_payroll_profile_before_activation ?? 1) === 1
    : template[0] === "payment_method" ? Number(settings?.require_payment_method_before_activation ?? 0) === 1
    : template[0] === "pension_profile" ? Number(settings?.require_pension_profile_if_eligible_before_activation ?? 0) === 1
    : template[0] === "user_access" ? Number(settings?.require_user_account_before_activation ?? 0) === 1
    : template[0] === "attendance_biometric" ? Number(settings?.require_biometric_mapping_before_activation ?? 0) === 1
    : template[0] === "assets_uniforms" ? Number(settings?.require_asset_uniform_issue_before_activation ?? 0) === 1
    : template[5] === 1;
}

async function seedOnboardingChecklistForEmployee(c: Context<AppBindings>, caseId: string, employeeId: string, settings: Record<string, unknown> | null | undefined) {
  for (const template of onboardingTemplates) {
    const taskKey = template[0];
    const moduleEnabled = await isModuleEnabled(c.env.DB, onboardingTaskModuleKeys[taskKey]);
    const required = moduleEnabled && isOnboardingTemplateRequired(template, settings);
    await createOnboardingTaskIfMissing(c, caseId, employeeId, template, required);
    await c.env.DB
      .prepare(
        `UPDATE employee_onboarding_tasks
         SET is_required = ?, required = ?,
             task_status = CASE
               WHEN ? = 0 THEN 'NOT_REQUIRED'
               WHEN task_status = 'NOT_REQUIRED' THEN 'NOT_STARTED'
               ELSE task_status
             END,
             status = CASE
               WHEN ? = 0 THEN 'SKIPPED'
               WHEN status = 'SKIPPED' AND task_status = 'NOT_REQUIRED' THEN 'PENDING'
               ELSE status
             END,
             notes = CASE WHEN ? = 0 THEN 'Disabled module: not required for onboarding.' ELSE notes END,
             updated_at = ?
         WHERE onboarding_case_id = ? AND task_key = ?`
      )
      .bind(required ? 1 : 0, required ? 1 : 0, moduleEnabled ? 1 : 0, moduleEnabled ? 1 : 0, moduleEnabled ? 1 : 0, nowIso(), caseId, taskKey)
      .run();
  }
}

async function refreshOffboardingChecklist(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "OFFBOARDING", caseId, "view");
  if (!gate) return null;
  const settings = await ensureOffboardingSettings(c.env.DB);
  for (const template of offboardingTemplates) {
    if (template[0] === "final_settlement" && Number(settings?.require_final_settlement_before_archive ?? 1) !== 1) continue;
    if (template[0] === "assets_uniforms" && Number(settings?.require_asset_uniform_clearance ?? 1) !== 1) continue;
    if (template[0] === "documents" && Number(settings?.require_document_checklist ?? 0) !== 1) continue;
    if (template[0] === "user_access" && Number(settings?.require_user_account_deactivation ?? 1) !== 1) continue;
    await createOffboardingTaskIfMissing(c, caseId, String(gate.row.employee_id), template);
  }
  return getOffboardingChecklistStatus(c, caseId);
}

export async function getOnboardingChecklistStatus(c: Context<AppBindings>, caseId: string) {
  const rows = await c.env.DB.prepare("SELECT * FROM employee_onboarding_tasks WHERE onboarding_case_id = ? ORDER BY is_required DESC, task_group, created_at").bind(caseId).all<Record<string, unknown>>();
  const tasks = rows.results;
  const blockers = tasks.filter((task) => Number(task.is_required ?? task.required ?? 1) === 1 && !["COMPLETED", "WAIVED", "NOT_REQUIRED"].includes(String(task.task_status ?? "")));
  return { tasks, total: tasks.length, completed: tasks.filter((task) => task.task_status === "COMPLETED").length, blockers };
}

async function getOffboardingChecklistStatus(c: Context<AppBindings>, caseId: string) {
  const rows = await c.env.DB.prepare("SELECT * FROM employee_offboarding_tasks WHERE offboarding_case_id = ? ORDER BY is_required DESC, task_group, created_at").bind(caseId).all<Record<string, unknown>>();
  const tasks = rows.results;
  const blockers = tasks.filter((task) => Number(task.is_required ?? 1) === 1 && !["COMPLETED", "WAIVED", "NOT_REQUIRED"].includes(String(task.task_status ?? "")));
  return { tasks, total: tasks.length, completed: tasks.filter((task) => task.task_status === "COMPLETED").length, blockers };
}

export async function getOnboardingBlockers(c: Context<AppBindings>, caseId: string) {
  const checklist = await getOnboardingChecklistStatus(c, caseId);
  const moduleBlockers = [
    ...(await getOnboardingDocumentBlockers(c, caseId)),
    ...(await getOnboardingContractBlockers(c, caseId)),
    ...(await getOnboardingAssetUniformBlockers(c, caseId))
  ];
  return [...checklist.blockers.map((task) => ({ type: "TASK", task_key: task.task_key, message: `${String(task.task_name ?? task.title)} is not complete.` })), ...moduleBlockers];
}

async function getOffboardingBlockers(c: Context<AppBindings>, caseId: string) {
  const checklist = await getOffboardingChecklistStatus(c, caseId);
  const moduleBlockers = [
    ...(await getOffboardingFinalSettlementBlockers(c, caseId)),
    ...(await getOffboardingLeaveBlockers(c, caseId))
  ];
  return [...checklist.blockers.map((task) => ({ type: "TASK", task_key: task.task_key, message: `${String(task.task_name)} is not complete.` })), ...moduleBlockers];
}

export async function completeOnboardingTask(c: Context<AppBindings>, taskId: string) {
  const now = nowIso();
  await c.env.DB.prepare("UPDATE employee_onboarding_tasks SET status = 'COMPLETED', task_status = 'COMPLETED', completed_by_user_id = ?, completed_at = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, now, now, taskId).run();
}

export async function waiveOnboardingTask(c: Context<AppBindings>, taskId: string, reason: string) {
  const now = nowIso();
  await c.env.DB.prepare("UPDATE employee_onboarding_tasks SET status = 'SKIPPED', task_status = 'WAIVED', waived_by_user_id = ?, waived_at = ?, waiver_reason = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, now, reason, now, taskId).run();
}

async function completeOffboardingTask(c: Context<AppBindings>, taskId: string) {
  const now = nowIso();
  await c.env.DB.prepare("UPDATE employee_offboarding_tasks SET task_status = 'COMPLETED', completed_by_user_id = ?, completed_at = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, now, now, taskId).run();
}

async function waiveOffboardingTask(c: Context<AppBindings>, taskId: string, reason: string) {
  const now = nowIso();
  await c.env.DB.prepare("UPDATE employee_offboarding_tasks SET task_status = 'WAIVED', waived_by_user_id = ?, waived_at = ?, waiver_reason = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, now, reason, now, taskId).run();
}

export async function getOnboardingDocumentChecklist(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "ONBOARDING", caseId, "view");
  if (!gate) return { rows: [], status: "NOT_FOUND", message: "Onboarding case was not found.", warnings: [] };
  try {
    const compliance = await calculateEmployeeDocumentCompliance(c.env.DB, String(gate.row.employee_id));
    if (!compliance) return { rows: [], status: "NOT_FOUND", message: "Employee document compliance could not be loaded.", warnings: [{ type: "DOCUMENT", message: "Document compliance could not be loaded." }] };
    if (compliance.settings?.document_compliance_enabled === false) {
      return {
        rows: [],
        required_documents: [],
        missing_documents: [],
        status: "DISABLED",
        compliance_status: "DISABLED",
        message: "Document compliance is disabled.",
        warnings: []
      };
    }
    const canSensitive = c.get("currentUser").is_owner || c.get("currentUser").permissions.includes("documents.sensitive.view");
    const rows = compliance.required_documents.map((item) => {
      const sensitive = Boolean(item.is_sensitive);
      const restricted = sensitive && !canSensitive;
      const document = item.document ? {
        id: item.document.id,
        expiry_date: restricted ? null : item.document.expiry_date,
        issue_date: restricted ? null : item.document.issue_date,
        document_number: restricted ? null : item.document.document_number,
        original_filename: restricted ? null : item.document.original_filename,
        status: item.document.status
      } : null;
      return {
        document_type_id: item.document_type_id,
        document_type_name: restricted ? "Restricted document" : item.document_type_name,
        document_type_code: restricted ? null : item.document_type_code,
        requirement_status: item.waived ? "WAIVED" : "REQUIRED",
        current_employee_document_id: item.document?.id ?? null,
        matched_required_rule_id: item.matched_rule_id,
        status: item.status,
        missing: item.missing,
        waived: item.waived,
        expired: item.status === "EXPIRED",
        expiring: item.status === "EXPIRING_SOON" || item.status === "URGENT_EXPIRING",
        days_until_expiry: item.days_until_expiry,
        blocks_employee_activation: item.blocks_employee_activation,
        is_sensitive: sensitive,
        restricted,
        waiver: item.waiver ? {
          id: item.waiver.id,
          status: item.waiver.status,
          waiver_start_date: item.waiver.waiver_start_date,
          waiver_end_date: item.waiver.waiver_end_date
        } : null,
        document
      };
    });
    return {
      rows,
      required_documents: rows,
      missing_documents: rows.filter((row) => row.missing),
      expiring_documents: rows.filter((row) => row.expiring),
      expired_documents: rows.filter((row) => row.expired),
      waivers: compliance.waivers,
      status: compliance.compliance_status,
      compliance_status: compliance.compliance_status,
      compliance_percent: compliance.compliance_percent,
      warning_summary: compliance.warning_summary,
      warnings: []
    };
  } catch (error) {
    console.warn("Onboarding document compliance checklist could not be loaded", error);
    return {
      rows: [],
      required_documents: [],
      missing_documents: [],
      status: "WARNING",
      compliance_status: "WARNING",
      message: "Document compliance checklist could not be loaded.",
      warnings: [{ type: "DOCUMENT", message: "Document compliance checklist could not be loaded." }]
    };
  }
}

export async function getOnboardingDocumentBlockers(c: Context<AppBindings>, caseId: string) {
  const checklist = await getOnboardingDocumentChecklist(c, caseId);
  if (checklist.status === "DISABLED" || checklist.status === "NOT_FOUND" || checklist.status === "WARNING") return [];
  return checklist.rows.filter((row) => row.requirement_status === "REQUIRED" && row.missing).map((row) => ({
    type: "DOCUMENT",
    message: "A required employee document is missing.",
    document_type_id: row.document_type_id,
    document_type_name: row.document_type_name
  }));
}

export async function getOnboardingContractStatus(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "ONBOARDING", caseId, "view");
  const contractsEnabled = await isModuleEnabled(c.env.DB, "contracts");
  if (!contractsEnabled) {
    return {
      ready: true,
      required: false,
      status: "NOT_REQUIRED",
      status_label: "Contract not required",
      active_contracts: 0,
      contract: null,
      display: {
        contract: "Not required",
        contract_type: "Not selected",
        contract_start_date: "Not set",
        contract_end_date: "Not required",
        probation: "Not applicable",
        confirmation_due: "Not set"
      },
      blockers: [],
      warnings: [{ type: "CONTRACT", message: "Contracts module is disabled, so contract setup is not required for onboarding." }]
    };
  }
  const onboardingSettings = await ensureOnboardingSettings(c.env.DB);
  const contractSettings = await c.env.DB.prepare("SELECT * FROM contract_settings ORDER BY created_at LIMIT 1").first<Record<string, unknown>>();
  const requiredByOnboarding = Number(onboardingSettings?.require_contract_before_activation ?? 0) === 1;
  const requiredByContractSettings = Number(contractSettings?.require_contract_for_active_employee ?? 0) === 1;
  const required = requiredByOnboarding || requiredByContractSettings;

  if (!gate) {
    return {
      ready: !required,
      required,
      status: required ? "MISSING" : "NOT_REQUIRED",
      status_label: required ? "Contract missing" : "Not required",
      active_contracts: 0,
      contract: null,
      display: {
        contract: required ? "Contract missing" : "Not required",
        contract_type: "Not selected",
        contract_start_date: "Not set",
        contract_end_date: "Not required",
        probation: "Not applicable",
        confirmation_due: "Not set"
      },
      blockers: required ? [{ type: "CONTRACT", message: "Required employment contract is missing." }] : [],
      warnings: []
    };
  }

  const contract = await c.env.DB
    .prepare(
      `SELECT ec.*,
        ct.name AS current_contract_type_name,
        ct.code AS current_contract_type_code,
        ct.requires_end_date AS current_contract_type_requires_end_date,
        ct.requires_probation AS current_contract_type_requires_probation,
        ct.status AS current_contract_type_status,
        ct.archived_at AS current_contract_type_archived_at
       FROM employee_contracts ec
       LEFT JOIN contract_types ct ON ct.id = ec.contract_type_id
       WHERE ec.employee_id = ? AND ec.status IN ('ACTIVE', 'EXPIRING_SOON', 'PENDING_APPROVAL', 'DRAFT')
       ORDER BY CASE ec.status WHEN 'ACTIVE' THEN 0 WHEN 'EXPIRING_SOON' THEN 1 WHEN 'PENDING_APPROVAL' THEN 2 ELSE 3 END, ec.effective_date DESC, ec.created_at DESC
       LIMIT 1`
    )
    .bind(String(gate.row.employee_id))
    .first<Record<string, unknown>>();

  const activeCount = await c.env.DB
    .prepare("SELECT COUNT(*) AS total FROM employee_contracts WHERE employee_id = ? AND status IN ('ACTIVE', 'EXPIRING_SOON')")
    .bind(String(gate.row.employee_id))
    .first<{ total: number }>();

  if (!contract) {
    return {
      ready: !required,
      required,
      status: required ? "MISSING" : "NOT_REQUIRED",
      status_label: required ? "Contract missing" : "Not required",
      active_contracts: Number(activeCount?.total ?? 0),
      contract: null,
      display: {
        contract: required ? "Contract missing" : "Not required",
        contract_type: "Not selected",
        contract_start_date: "Not set",
        contract_end_date: "Not required",
        probation: "Not applicable",
        confirmation_due: "Not set"
      },
      blockers: required ? [{ type: "CONTRACT", message: "Required employment contract is missing or not active." }] : [],
      warnings: []
    };
  }

  const contractTypeRequiresEndDate = Number(contract.current_contract_type_requires_end_date ?? 0) === 1;
  const contractTypeRequiresProbation = Number(contract.current_contract_type_requires_probation ?? 0) === 1;
  const contractTypeMissingOrArchived = !contract.current_contract_type_name || contract.current_contract_type_status === "ARCHIVED" || Boolean(contract.current_contract_type_archived_at);
  const blockers = [
    required && (!contract.contract_type_id || !contract.current_contract_type_name) ? { type: "CONTRACT", field: "contract_type_id", message: "Please select a contract type." } : null,
    !contract.contract_start_date ? { type: "CONTRACT", field: "contract_start_date", message: "Contract start date is missing." } : null,
    contractTypeRequiresEndDate && !contract.contract_end_date ? { type: "CONTRACT", field: "contract_end_date", message: "This contract type requires a contract end date." } : null,
    contractTypeRequiresProbation && !contract.probation_end_date ? { type: "CONTRACT", field: "probation_end_date", message: "This contract type requires probation details." } : null
  ].filter(Boolean);
  const warnings = contractTypeMissingOrArchived ? [{ type: "CONTRACT", message: "Contract type is not selected or is archived." }] : [];
  const ready = blockers.length === 0 && (!required || ["ACTIVE", "EXPIRING_SOON"].includes(String(contract.status)));

  return {
    ready,
    required,
    status: ready ? "READY" : "INCOMPLETE",
    status_label: ready ? "Contract ready" : "Contract incomplete",
    active_contracts: Number(activeCount?.total ?? 0),
    contract,
    display: {
      contract: contract.contract_number ? String(contract.contract_number) : "Contract missing",
      contract_type: contract.current_contract_type_name ?? contract.contract_type_name_snapshot ?? "Not selected",
      contract_start_date: contract.contract_start_date ?? "Not set",
      contract_end_date: contract.contract_end_date ?? (contractTypeRequiresEndDate ? "Not set" : "Not required"),
      probation: contractTypeRequiresProbation ? (contract.probation_end_date ?? "Not set") : "Not applicable",
      confirmation_due: contract.confirmation_due_date ?? "Not set"
    },
    blockers,
    warnings
  };
}

export async function getOnboardingContractBlockers(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "ONBOARDING", caseId, "view");
  if (!gate) return [];
  const status = await getOnboardingContractStatus(c, caseId);
  return status.ready ? [] : status.blockers;
}

export async function getOnboardingPayrollReadiness(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "ONBOARDING", caseId, "view");
  const count = gate ? await c.env.DB.prepare("SELECT COUNT(*) AS total FROM employee_payroll_profiles WHERE employee_id = ?").bind(String(gate.row.employee_id)).first<{ total: number }>() : { total: 0 };
  return { ready: Number(count?.total ?? 0) > 0, payroll_profiles: Number(count?.total ?? 0) };
}

export async function getOnboardingPaymentMethodStatus(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "ONBOARDING", caseId, "view");
  const count = gate ? await c.env.DB.prepare("SELECT COUNT(*) AS total FROM employee_payment_methods WHERE employee_id = ? AND status = 'ACTIVE'").bind(String(gate.row.employee_id)).first<{ total: number }>() : { total: 0 };
  return { ready: Number(count?.total ?? 0) > 0, active_payment_methods: Number(count?.total ?? 0) };
}

export async function getOnboardingPensionStatus(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "ONBOARDING", caseId, "view");
  const count = gate ? await c.env.DB.prepare("SELECT COUNT(*) AS total FROM employee_pension_profiles WHERE employee_id = ?").bind(String(gate.row.employee_id)).first<{ total: number }>() : { total: 0 };
  return { ready: Number(count?.total ?? 0) > 0, pension_profiles: Number(count?.total ?? 0) };
}

export async function getOnboardingRosterReadiness(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "ONBOARDING", caseId, "view");
  return { ready: Boolean(gate?.employee.primary_location_id), roster_eligible: Boolean(gate?.employee.roster_eligible) };
}

export async function getOnboardingAttendanceReadiness(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "ONBOARDING", caseId, "view");
  return { ready: Boolean(gate?.employee.joining_date), attendance_start_date: gate?.employee.joining_date ?? null };
}

export async function getOnboardingBiometricMappingStatus(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "ONBOARDING", caseId, "view");
  const count = gate ? await c.env.DB.prepare("SELECT COUNT(*) AS total FROM employee_biometric_mappings WHERE employee_id = ? AND status = 'ACTIVE'").bind(String(gate.row.employee_id)).first<{ total: number }>() : { total: 0 };
  return { ready: Number(count?.total ?? 0) > 0, active_mappings: Number(count?.total ?? 0) };
}

export async function getOnboardingUserAccessStatus(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "ONBOARDING", caseId, "view");
  return { ready: Boolean(gate?.employee.user_id), user_id: gate?.employee.user_id ?? null, invite_placeholder_available: true };
}

export async function provisionEmployeeUserAccessPlaceholder(_c: Context<AppBindings>, employeeId: string) {
  return { employee_id: employeeId, status: "PLACEHOLDER", message: "Login invitation sending will be connected when an email service is configured." };
}

export async function applyOnboardingAccessTemplate(_c: Context<AppBindings>, employeeId: string) {
  return { employee_id: employeeId, status: "PLACEHOLDER", message: "Role mapping and access scope templates remain the source of truth." };
}

export async function getOnboardingAssetUniformStatus(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "ONBOARDING", caseId, "view");
  const count = gate ? await c.env.DB.prepare("SELECT COUNT(*) AS total FROM employee_asset_assignments WHERE employee_id = ? AND status = 'ISSUED'").bind(String(gate.row.employee_id)).first<{ total: number }>() : { total: 0 };
  return { ready: true, issued_items: Number(count?.total ?? 0) };
}

export async function getOnboardingAssetUniformBlockers(_c: Context<AppBindings>, _caseId: string) {
  return [];
}

export async function getEmployeeOnboardingReadiness(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "ONBOARDING", caseId, "view");
  if (!gate) return null;
  await refreshOnboardingChecklist(c, caseId);
  const blockers = await getOnboardingBlockers(c, caseId);
  const checklist = await getOnboardingChecklistStatus(c, caseId);
  const documents = await getOnboardingDocumentChecklist(c, caseId);
  const warningItems = Array.isArray(documents.warnings) ? documents.warnings : [];
  const readiness = {
    can_activate: blockers.length === 0,
    blockers,
    blocking_items: blockers,
    warning_items: warningItems,
    checklist,
    documents,
    contract: await getOnboardingContractStatus(c, caseId),
    payroll: await getOnboardingPayrollReadiness(c, caseId),
    payment_method: await getOnboardingPaymentMethodStatus(c, caseId),
    pension: await getOnboardingPensionStatus(c, caseId),
    roster: await getOnboardingRosterReadiness(c, caseId),
    attendance: await getOnboardingAttendanceReadiness(c, caseId),
    biometric: await getOnboardingBiometricMappingStatus(c, caseId),
    user_access: await getOnboardingUserAccessStatus(c, caseId),
    assets_uniforms: await getOnboardingAssetUniformStatus(c, caseId)
  };
  await c.env.DB.prepare("UPDATE employee_onboarding_cases SET checklist_summary_json = ?, blockers_json = ?, onboarding_status = ?, activation_status = ?, updated_at = ? WHERE id = ?")
    .bind(JSON.stringify(readiness.checklist), JSON.stringify(blockers), readiness.can_activate ? "READY_FOR_APPROVAL" : "BLOCKED", readiness.can_activate ? "READY" : "NOT_READY", nowIso(), caseId)
    .run();
  return readiness;
}

export async function submitEmployeeActivationForApproval(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "ONBOARDING", caseId, "manage");
  if (!gate) return null;
  const previous = String(gate.row.activation_status);
  await c.env.DB.prepare("UPDATE employee_onboarding_cases SET onboarding_status = 'PENDING_APPROVAL', activation_status = 'SUBMITTED', updated_by_user_id = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, nowIso(), caseId).run();
  await createLifecycleEvent(c, { employeeId: String(gate.row.employee_id), caseType: "ONBOARDING", caseId, action: "employee.activation.submitted", previousStatus: previous, newStatus: "SUBMITTED" });
  await publishLifecycle(c, String(gate.row.employee_id), "onboarding.activation.submitted");
  return true;
}

export async function approveEmployeeActivation(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "ONBOARDING", caseId, "manage");
  if (!gate) return null;
  const previous = String(gate.row.activation_status);
  await c.env.DB.prepare("UPDATE employee_onboarding_cases SET onboarding_status = 'APPROVED', activation_status = 'APPROVED', updated_by_user_id = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, nowIso(), caseId).run();
  await createLifecycleEvent(c, { employeeId: String(gate.row.employee_id), caseType: "ONBOARDING", caseId, action: "employee.activation.approved", previousStatus: previous, newStatus: "APPROVED" });
  await publishLifecycle(c, String(gate.row.employee_id), "onboarding.activation.approved");
  return true;
}

export async function syncEmployeeStatusAfterOnboarding(c: Context<AppBindings>, employeeId: string) {
  const active = await c.env.DB.prepare("SELECT id FROM employee_statuses WHERE key = 'ACTIVE' AND is_active = 1").first<{ id: string }>();
  if (!active) return false;
  await c.env.DB.prepare("UPDATE employees SET status_id = ?, updated_at = ? WHERE id = ?").bind(active.id, nowIso(), employeeId).run();
  return true;
}

export async function activateEmployeeFromOnboarding(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "ONBOARDING", caseId, "manage");
  if (!gate) return null;
  const readiness = await getEmployeeOnboardingReadiness(c, caseId);
  if (!readiness?.can_activate) return { blocked: true, readiness };
  await syncEmployeeStatusAfterOnboarding(c, String(gate.row.employee_id));
  const now = nowIso();
  await c.env.DB.prepare("UPDATE employee_onboarding_cases SET onboarding_status = 'ACTIVATED', activation_status = 'ACTIVATED', completed_at = ?, activated_by_user_id = ?, activated_at = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?")
    .bind(now, c.get("currentUser").id, now, c.get("currentUser").id, now, caseId)
    .run();
  await createLifecycleEvent(c, { employeeId: String(gate.row.employee_id), caseType: "ONBOARDING", caseId, action: "employee.activated", previousStatus: String(gate.row.activation_status), newStatus: "ACTIVATED" });
  await publishLifecycle(c, String(gate.row.employee_id), "employee.activated");
  return { activated: true, readiness };
}

export async function activateEmployeeWithOnboardingOverride(c: Context<AppBindings>, caseId: string, reason: string) {
  const gate = await getCaseEmployee(c, "ONBOARDING", caseId, "manage");
  if (!gate) return null;
  await syncEmployeeStatusAfterOnboarding(c, String(gate.row.employee_id));
  const now = nowIso();
  await c.env.DB.prepare("UPDATE employee_onboarding_cases SET onboarding_status = 'ACTIVATED', activation_status = 'OVERRIDDEN', completed_at = ?, activated_by_user_id = ?, activated_at = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?")
    .bind(now, c.get("currentUser").id, now, c.get("currentUser").id, now, caseId)
    .run();
  await createLifecycleEvent(c, { employeeId: String(gate.row.employee_id), caseType: "ONBOARDING", caseId, action: "employee.activated_with_onboarding_override", previousStatus: String(gate.row.activation_status), newStatus: "OVERRIDDEN", reason });
  await publishLifecycle(c, String(gate.row.employee_id), "employee.activated_with_onboarding_override");
  return { activated: true, override: true };
}

export async function createOnboardingApprovalInstance(_c: Context<AppBindings>, caseId: string) {
  return { case_id: caseId, status: "PLACEHOLDER", message: "Central approval workflow integration is prepared; approval instances are created when matching workflows are configured." };
}

export async function getOnboardingApprovalSummary(_c: Context<AppBindings>, caseId: string) {
  return { case_id: caseId, status: "NOT_CONFIGURED", timeline: [] };
}

export async function syncOnboardingApprovalStatus(_c: Context<AppBindings>, caseId: string) {
  return { case_id: caseId, synced: true };
}

export async function getOffboardingFinalSettlementStatus(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "OFFBOARDING", caseId, "view");
  const count = gate ? await c.env.DB.prepare("SELECT COUNT(*) AS total FROM final_settlement_cases WHERE employee_id = ? AND status IN ('COMPLETED', 'FINALIZED', 'APPROVED')").bind(String(gate.row.employee_id)).first<{ total: number }>() : { total: 0 };
  return { ready: Number(count?.total ?? 0) > 0, completed_settlements: Number(count?.total ?? 0) };
}

export async function getOffboardingFinalSettlementBlockers(c: Context<AppBindings>, caseId: string) {
  const settings = await ensureOffboardingSettings(c.env.DB);
  if (Number(settings?.require_final_settlement_before_archive ?? 1) !== 1) return [];
  const status = await getOffboardingFinalSettlementStatus(c, caseId);
  return status.ready ? [] : [{ type: "FINAL_SETTLEMENT", message: "Final settlement is required before exit finalization." }];
}

export async function getOffboardingLeaveStatus(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "OFFBOARDING", caseId, "view");
  const pending = gate ? await c.env.DB.prepare("SELECT COUNT(*) AS total FROM leave_requests WHERE employee_id = ? AND status IN ('DRAFT', 'PENDING_APPROVAL')").bind(String(gate.row.employee_id)).first<{ total: number }>() : { total: 0 };
  return { ready: Number(pending?.total ?? 0) === 0, pending_leave_requests: Number(pending?.total ?? 0) };
}

export async function getOffboardingLeaveBlockers(c: Context<AppBindings>, caseId: string) {
  const status = await getOffboardingLeaveStatus(c, caseId);
  return status.ready ? [] : [{ type: "LEAVE", message: "Pending leave requests should be resolved before exit." }];
}

export async function getOffboardingPayrollStatus(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "OFFBOARDING", caseId, "view");
  const pending = gate ? await c.env.DB.prepare("SELECT COUNT(*) AS total FROM payroll_employee_results WHERE employee_id = ? AND status IN ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED_PLACEHOLDER', 'HELD')").bind(String(gate.row.employee_id)).first<{ total: number }>() : { total: 0 };
  return { ready: Number(pending?.total ?? 0) === 0, pending_payroll_results: Number(pending?.total ?? 0) };
}

export async function getOffboardingBankLoanStatus(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "OFFBOARDING", caseId, "view");
  const active = gate ? await c.env.DB.prepare("SELECT COUNT(*) AS total FROM employee_bank_loans WHERE employee_id = ? AND status = 'ACTIVE'").bind(String(gate.row.employee_id)).first<{ total: number }>() : { total: 0 };
  return { ready: Number(active?.total ?? 0) === 0, active_loans: Number(active?.total ?? 0) };
}

export async function getOffboardingPensionStatus(c: Context<AppBindings>, _caseId: string) {
  return { ready: true, note: "Pension final check remains in payroll foundation." };
}

export async function getOffboardingCustomDeductionStatus(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "OFFBOARDING", caseId, "view");
  const active = gate ? await c.env.DB.prepare("SELECT COUNT(*) AS total FROM employee_custom_deductions WHERE employee_id = ? AND status = 'ACTIVE'").bind(String(gate.row.employee_id)).first<{ total: number }>() : { total: 0 };
  return { ready: Number(active?.total ?? 0) === 0, active_deductions: Number(active?.total ?? 0) };
}

export async function getOffboardingAttendanceStatus(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "OFFBOARDING", caseId, "view");
  const pending = gate ? await c.env.DB.prepare("SELECT COUNT(*) AS total FROM attendance_correction_requests WHERE employee_id = ? AND status IN ('PENDING', 'PENDING_APPROVAL')").bind(String(gate.row.employee_id)).first<{ total: number }>() : { total: 0 };
  return { ready: Number(pending?.total ?? 0) === 0, pending_corrections: Number(pending?.total ?? 0) };
}

export async function getOffboardingBiometricImportWarnings(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "OFFBOARDING", caseId, "view");
  const count = gate ? await c.env.DB.prepare("SELECT COUNT(*) AS total FROM attendance_locked_day_import_warnings WHERE employee_id = ? AND status = 'OPEN'").bind(String(gate.row.employee_id)).first<{ total: number }>() : { total: 0 };
  return { open_warnings: Number(count?.total ?? 0) };
}

export async function getOffboardingRosterFutureAssignmentWarnings(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "OFFBOARDING", caseId, "view");
  const count = gate ? await c.env.DB.prepare("SELECT COUNT(*) AS total FROM roster_assignments WHERE employee_id = ? AND assignment_date > ? AND status IN ('PUBLISHED', 'CHANGED_AFTER_PUBLISH', 'SCHEDULED')").bind(String(gate.row.employee_id), String(gate.row.last_working_day)).first<{ total: number }>() : { total: 0 };
  return { future_assignments: Number(count?.total ?? 0), warning: Number(count?.total ?? 0) > 0 };
}

export async function getOffboardingAssetUniformClearanceStatus(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "OFFBOARDING", caseId, "view");
  const issued = gate ? await c.env.DB.prepare("SELECT COUNT(*) AS total FROM employee_asset_assignments WHERE employee_id = ? AND status = 'ISSUED'").bind(String(gate.row.employee_id)).first<{ total: number }>() : { total: 0 };
  return { ready: Number(issued?.total ?? 0) === 0, issued_items: Number(issued?.total ?? 0) };
}

export async function getOffboardingDocumentChecklistStatus(_c: Context<AppBindings>, _caseId: string) {
  return { ready: true, note: "Document return checklist is optional and uses document compliance records." };
}

export async function getOffboardingUserAccessStatus(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "OFFBOARDING", caseId, "view");
  if (!gate?.employee.user_id) return { ready: true, user_id: null };
  const user = await c.env.DB.prepare("SELECT id, status, is_owner FROM users WHERE id = ?").bind(String(gate.employee.user_id)).first<Record<string, unknown>>();
  return { ready: user?.status !== "ACTIVE", user_id: user?.id ?? null, status: user?.status ?? null, protected_owner: user?.is_owner === 1 };
}

export async function deactivateEmployeeUserAccessForOffboarding(c: Context<AppBindings>, employeeId: string) {
  const employee = await getScopedEmployee(c, employeeId, "manage");
  if (!employee?.user_id) return { status: "NO_LINKED_USER" };
  const user = await c.env.DB.prepare("SELECT id, is_owner, status FROM users WHERE id = ?").bind(String(employee.user_id)).first<Record<string, unknown>>();
  if (!user) return { status: "NO_LINKED_USER" };
  if (user.is_owner === 1) return { status: "PROTECTED_USER_DEACTIVATION_BLOCKED" };
  await c.env.DB.prepare("UPDATE users SET status = 'DISABLED', updated_at = ? WHERE id = ?").bind(nowIso(), String(user.id)).run();
  return { status: "DISABLED", user_id: user.id };
}

export async function revokeEmployeeAccessForOffboarding(c: Context<AppBindings>, employeeId: string) {
  const result = await deactivateEmployeeUserAccessForOffboarding(c, employeeId);
  return { ...result, roles_revocation: "PLACEHOLDER" };
}

export async function getEmployeeOffboardingReadiness(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "OFFBOARDING", caseId, "view");
  if (!gate) return null;
  await refreshOffboardingChecklist(c, caseId);
  const blockers = await getOffboardingBlockers(c, caseId);
  const readiness = {
    can_finalize: blockers.length === 0,
    blockers,
    warning_items: [],
    checklist: await getOffboardingChecklistStatus(c, caseId),
    final_settlement: await getOffboardingFinalSettlementStatus(c, caseId),
    leave: await getOffboardingLeaveStatus(c, caseId),
    payroll: await getOffboardingPayrollStatus(c, caseId),
    bank_loan: await getOffboardingBankLoanStatus(c, caseId),
    pension: await getOffboardingPensionStatus(c, caseId),
    custom_deductions: await getOffboardingCustomDeductionStatus(c, caseId),
    attendance: await getOffboardingAttendanceStatus(c, caseId),
    biometric_warnings: await getOffboardingBiometricImportWarnings(c, caseId),
    roster: await getOffboardingRosterFutureAssignmentWarnings(c, caseId),
    assets_uniforms: await getOffboardingAssetUniformClearanceStatus(c, caseId),
    documents: await getOffboardingDocumentChecklistStatus(c, caseId),
    user_access: await getOffboardingUserAccessStatus(c, caseId)
  };
  await c.env.DB.prepare("UPDATE employee_offboarding_cases SET checklist_summary_json = ?, blockers_json = ?, offboarding_status = ?, finalization_status = ?, updated_at = ? WHERE id = ?")
    .bind(JSON.stringify(readiness.checklist), JSON.stringify(blockers), readiness.can_finalize ? "READY_FOR_FINAL_APPROVAL" : "WAITING_FOR_CLEARANCE", readiness.can_finalize ? "READY" : "NOT_READY", nowIso(), caseId)
    .run();
  return readiness;
}

export async function submitEmployeeExitForApproval(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "OFFBOARDING", caseId, "manage");
  if (!gate) return null;
  await c.env.DB.prepare("UPDATE employee_offboarding_cases SET offboarding_status = 'PENDING_APPROVAL', finalization_status = 'SUBMITTED', updated_by_user_id = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, nowIso(), caseId).run();
  await createLifecycleEvent(c, { employeeId: String(gate.row.employee_id), caseType: "OFFBOARDING", caseId, action: "employee.exit.submitted", previousStatus: String(gate.row.finalization_status), newStatus: "SUBMITTED" });
  return true;
}

export async function approveEmployeeExitFinalization(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "OFFBOARDING", caseId, "manage");
  if (!gate) return null;
  await c.env.DB.prepare("UPDATE employee_offboarding_cases SET offboarding_status = 'APPROVED', finalization_status = 'APPROVED', updated_by_user_id = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, nowIso(), caseId).run();
  await createLifecycleEvent(c, { employeeId: String(gate.row.employee_id), caseType: "OFFBOARDING", caseId, action: "employee.exit.approved", previousStatus: String(gate.row.finalization_status), newStatus: "APPROVED" });
  return true;
}

export async function syncEmployeeStatusAfterOffboarding(c: Context<AppBindings>, employeeId: string, exitType: string, lastWorkingDay: string, reason: string | null) {
  const key = exitType === "END_OF_CONTRACT" ? "END_OF_CONTRACT" : exitType === "ABSCONDED" ? "ABSCONDED" : exitType === "DECEASED" ? "DECEASED" : exitType === "TERMINATED" ? "TERMINATED" : exitType === "RETIRED" ? "RESIGNED" : "RESIGNED";
  const status = await c.env.DB.prepare("SELECT id FROM employee_statuses WHERE key = ? AND is_active = 1").bind(key).first<{ id: string }>();
  if (!status) return false;
  await c.env.DB.prepare("UPDATE employees SET status_id = ?, exit_date = ?, exit_reason = ?, updated_at = ? WHERE id = ?").bind(status.id, lastWorkingDay, reason, nowIso(), employeeId).run();
  return true;
}

export async function finalizeEmployeeExitFromOffboarding(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "OFFBOARDING", caseId, "manage");
  if (!gate) return null;
  const readiness = await getEmployeeOffboardingReadiness(c, caseId);
  if (!readiness?.can_finalize) return { blocked: true, readiness };
  await syncEmployeeStatusAfterOffboarding(c, String(gate.row.employee_id), String(gate.row.exit_type), String(gate.row.last_working_day), optionalText(gate.row.exit_reason));
  await deactivateEmployeeUserAccessForOffboarding(c, String(gate.row.employee_id));
  const now = nowIso();
  await c.env.DB.prepare("UPDATE employee_offboarding_cases SET offboarding_status = 'COMPLETED', finalization_status = 'FINALIZED', completed_at = ?, finalized_by_user_id = ?, finalized_at = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?")
    .bind(now, c.get("currentUser").id, now, c.get("currentUser").id, now, caseId)
    .run();
  await createLifecycleEvent(c, { employeeId: String(gate.row.employee_id), caseType: "OFFBOARDING", caseId, action: "employee.exit.finalized", previousStatus: String(gate.row.finalization_status), newStatus: "FINALIZED" });
  await publishLifecycle(c, String(gate.row.employee_id), "employee.exit.finalized");
  return { finalized: true, readiness };
}

export async function finalizeEmployeeExitWithOverride(c: Context<AppBindings>, caseId: string, reason: string) {
  const gate = await getCaseEmployee(c, "OFFBOARDING", caseId, "manage");
  if (!gate) return null;
  await syncEmployeeStatusAfterOffboarding(c, String(gate.row.employee_id), String(gate.row.exit_type), String(gate.row.last_working_day), reason);
  await deactivateEmployeeUserAccessForOffboarding(c, String(gate.row.employee_id));
  const now = nowIso();
  await c.env.DB.prepare("UPDATE employee_offboarding_cases SET offboarding_status = 'COMPLETED', finalization_status = 'OVERRIDDEN', completed_at = ?, finalized_by_user_id = ?, finalized_at = ?, updated_by_user_id = ?, updated_at = ? WHERE id = ?")
    .bind(now, c.get("currentUser").id, now, c.get("currentUser").id, now, caseId)
    .run();
  await createLifecycleEvent(c, { employeeId: String(gate.row.employee_id), caseType: "OFFBOARDING", caseId, action: "employee.exit.finalized_with_override", previousStatus: String(gate.row.finalization_status), newStatus: "OVERRIDDEN", reason });
  await publishLifecycle(c, String(gate.row.employee_id), "employee.exit.finalized_with_override");
  return { finalized: true, override: true };
}

export async function createOffboardingApprovalInstance(_c: Context<AppBindings>, caseId: string) {
  return { case_id: caseId, status: "PLACEHOLDER", message: "Central approval workflow integration is prepared for exit finalization." };
}

export async function getOffboardingApprovalSummary(_c: Context<AppBindings>, caseId: string) {
  return { case_id: caseId, status: "NOT_CONFIGURED", timeline: [] };
}

export async function syncOffboardingApprovalStatus(_c: Context<AppBindings>, caseId: string) {
  return { case_id: caseId, synced: true };
}

async function updateSettings(c: Context<AppBindings>, table: "onboarding_settings" | "offboarding_settings", fields: readonly string[]) {
  const body = await readBody(c);
  const updates: string[] = [];
  const binds: BindValue[] = [];
  for (const field of fields) {
    if (field in body) {
      updates.push(`${field} = ?`);
      binds.push(field === "metadata_json" ? (typeof body[field] === "string" ? String(body[field]) : JSON.stringify(body[field] ?? null)) : Number.isFinite(Number(body[field])) || typeof body[field] === "boolean" ? asSqlBool(body[field]) : optionalText(body[field]));
    }
  }
  if (!updates.length) return table === "onboarding_settings" ? ensureOnboardingSettings(c.env.DB) : ensureOffboardingSettings(c.env.DB);
  updates.push("updated_at = ?");
  binds.push(nowIso());
  binds.push(table === "onboarding_settings" ? "onboarding_settings_default" : "offboarding_settings_default");
  await c.env.DB.prepare(`UPDATE ${table} SET ${updates.join(", ")} WHERE id = ?`).bind(...binds).run();
  const row = table === "onboarding_settings" ? await ensureOnboardingSettings(c.env.DB) : await ensureOffboardingSettings(c.env.DB);
  await auditLifecycle(c, `${table}.updated`, table, String(row?.id ?? ""), null, row);
  return row;
}

async function listOnboardingCases(c: Context<AppBindings>) {
  const user = c.get("currentUser");
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, user, "employees", "view", "e");
  const conditions = [scope.sql];
  const binds: BindValue[] = [...scope.params];
  const status = c.req.query("status");
  if (status) {
    conditions.push("oc.onboarding_status = ?");
    binds.push(status);
  }
  if (c.req.query("overdue") === "1") conditions.push("oc.due_date IS NOT NULL AND date(oc.due_date) < date('now') AND oc.onboarding_status NOT IN ('ACTIVATED', 'CANCELLED')");
  const rows = await c.env.DB.prepare(
    `SELECT oc.*, e.employee_no, e.full_name AS employee_name, d.name AS department_name, l.name AS location_name, p.title AS position_name
     FROM employee_onboarding_cases oc
     INNER JOIN employees e ON e.id = oc.employee_id
     LEFT JOIN departments d ON d.id = e.primary_department_id
     LEFT JOIN locations l ON l.id = e.primary_location_id
     LEFT JOIN positions p ON p.id = e.primary_position_id
     ${where(conditions)}
     ORDER BY oc.created_at DESC`
  ).bind(...binds).all<Record<string, unknown>>();
  return rows.results;
}

async function listOffboardingCases(c: Context<AppBindings>) {
  const user = c.get("currentUser");
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, user, "employees", "view", "e");
  const conditions = [scope.sql];
  const binds: BindValue[] = [...scope.params];
  const status = c.req.query("status");
  if (status) {
    conditions.push("oc.offboarding_status = ?");
    binds.push(status);
  }
  if (c.req.query("overdue") === "1") conditions.push("oc.due_date IS NOT NULL AND date(oc.due_date) < date('now') AND oc.offboarding_status NOT IN ('COMPLETED', 'CANCELLED')");
  const rows = await c.env.DB.prepare(
    `SELECT oc.*, e.employee_no, e.full_name AS employee_name, d.name AS department_name, l.name AS location_name, p.title AS position_name
     FROM employee_offboarding_cases oc
     INNER JOIN employees e ON e.id = oc.employee_id
     LEFT JOIN departments d ON d.id = e.primary_department_id
     LEFT JOIN locations l ON l.id = e.primary_location_id
     LEFT JOIN positions p ON p.id = e.primary_position_id
     ${where(conditions)}
     ORDER BY oc.created_at DESC`
  ).bind(...binds).all<Record<string, unknown>>();
  return rows.results;
}

async function loadOnboardingCaseEmployeeSnapshot(db: D1Database, employeeId: string) {
  return db
    .prepare(
      `SELECT e.*, d.name AS department_name, l.name AS location_name, p.title AS position_name, es.key AS status_key, es.name AS status_name
       FROM employees e
       LEFT JOIN departments d ON d.id = e.primary_department_id
       LEFT JOIN locations l ON l.id = e.primary_location_id
       LEFT JOIN positions p ON p.id = e.primary_position_id
       LEFT JOIN employee_statuses es ON es.id = e.status_id
       WHERE e.id = ? AND e.archived_at IS NULL`
    )
    .bind(employeeId)
    .first<Record<string, unknown>>();
}

async function insertOnboardingCaseForEmployee(c: Context<AppBindings>, employee: Record<string, unknown>, settings: Record<string, unknown> | null | undefined, metadata: Record<string, unknown> = {}) {
  const employeeId = String(employee.id);
  const existing = await c.env.DB.prepare("SELECT id FROM employee_onboarding_cases WHERE employee_id = ? AND onboarding_status != 'CANCELLED' AND activation_status != 'ACTIVATED'").bind(employeeId).first<{ id: string }>();
  if (existing) return { duplicate: true, id: existing.id };
  if (settings?.onboarding_enabled === 0) return { disabled: true };
  const now = nowIso();
  const dueDate = new Date(Date.now() + Number(settings?.default_onboarding_due_days ?? 7) * 86400000).toISOString().slice(0, 10);
  const caseId = id("onboarding_case");
  await c.env.DB.prepare(
    `INSERT INTO employee_onboarding_cases
     (id, case_number, employee_id, employee_number_snapshot, employee_name_snapshot, department_snapshot, location_snapshot, position_snapshot, employment_type_snapshot, employee_type_snapshot, onboarding_status, activation_status, due_date, created_by_user_id, updated_by_user_id, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'IN_PROGRESS', 'NOT_READY', ?, ?, ?, ?)`
  ).bind(
    caseId,
    caseNumber("ONB"),
    employeeId,
    employee.employee_no ?? null,
    employee.full_name ?? null,
    employee.department_name ?? null,
    employee.location_name ?? null,
    employee.position_name ?? null,
    employee.employment_type ?? null,
    employee.employee_type ?? null,
    dueDate,
    c.get("currentUser").id,
    c.get("currentUser").id,
    JSON.stringify(metadata)
  ).run();
  await seedOnboardingChecklistForEmployee(c, caseId, employeeId, settings);
  await createLifecycleEvent(c, { employeeId, caseType: "ONBOARDING", caseId, action: "onboarding.case.created", newStatus: "IN_PROGRESS", metadata: { created_at: now, ...metadata } });
  return { id: caseId };
}

export async function autoCreateOnboardingCaseAfterEmployeeCreate(c: Context<AppBindings>, employeeId: string) {
  const settings = await ensureOnboardingSettings(c.env.DB);
  if (settings?.onboarding_enabled === 0 || Number(settings?.auto_create_onboarding_case_on_employee_create ?? 1) !== 1) return { skipped: true };
  const employee = await loadOnboardingCaseEmployeeSnapshot(c.env.DB, employeeId);
  if (!employee) return null;
  return insertOnboardingCaseForEmployee(c, employee, settings, { auto_created: true, source: "employee_create" });
}

export async function createOnboardingCase(c: Context<AppBindings>, employeeId: string) {
  const employee = await getScopedEmployee(c, employeeId, "manage");
  if (!employee) return null;
  const settings = await ensureOnboardingSettings(c.env.DB);
  return insertOnboardingCaseForEmployee(c, employee, settings);
}

async function createOffboardingCase(c: Context<AppBindings>, employeeId: string, body: Record<string, unknown>) {
  const employee = await getScopedEmployee(c, employeeId, "manage");
  if (!employee) return null;
  const existing = await c.env.DB.prepare("SELECT id FROM employee_offboarding_cases WHERE employee_id = ? AND offboarding_status != 'CANCELLED' AND finalization_status != 'FINALIZED'").bind(employeeId).first<{ id: string }>();
  if (existing) return { duplicate: true, id: existing.id };
  const settings = await ensureOffboardingSettings(c.env.DB);
  if (settings?.offboarding_enabled === 0) return { disabled: true };
  const exitType = String(body.exit_type ?? "RESIGNED").toUpperCase();
  if (!["RESIGNED", "TERMINATED", "END_OF_CONTRACT", "ABSCONDED", "RETIRED", "DECEASED", "OTHER"].includes(exitType)) return { invalid: true };
  const lastWorkingDay = optionalText(body.last_working_day) ?? new Date().toISOString().slice(0, 10);
  const dueDate = new Date(Date.now() + Number(settings?.default_offboarding_due_days ?? 7) * 86400000).toISOString().slice(0, 10);
  const caseId = id("offboarding_case");
  await c.env.DB.prepare(
    `INSERT INTO employee_offboarding_cases
     (id, case_number, employee_id, employee_number_snapshot, employee_name_snapshot, department_snapshot, location_snapshot, position_snapshot, employment_type_snapshot, employee_type_snapshot, exit_type, exit_reason, exit_notice_date, last_working_day, offboarding_status, finalization_status, due_date, created_by_user_id, updated_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'IN_PROGRESS', 'NOT_READY', ?, ?, ?)`
  ).bind(caseId, caseNumber("OFF"), employeeId, employee.employee_no ?? null, employee.full_name ?? null, employee.department_name ?? null, employee.location_name ?? null, employee.position_name ?? null, employee.employment_type ?? null, employee.employee_type ?? null, exitType, optionalText(body.exit_reason), optionalText(body.exit_notice_date), lastWorkingDay, dueDate, c.get("currentUser").id, c.get("currentUser").id).run();
  await refreshOffboardingChecklist(c, caseId);
  await createLifecycleEvent(c, { employeeId, caseType: "OFFBOARDING", caseId, action: "offboarding.case.created", newStatus: "IN_PROGRESS" });
  return { id: caseId };
}

async function lifecycleSummary(c: Context<AppBindings>, employeeId: string) {
  const employee = await getScopedEmployee(c, employeeId, "view");
  if (!employee) return null;
  const [onboarding, offboarding, events] = await Promise.all([
    c.env.DB.prepare("SELECT * FROM employee_onboarding_cases WHERE employee_id = ? ORDER BY created_at DESC LIMIT 1").bind(employeeId).first<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT * FROM employee_offboarding_cases WHERE employee_id = ? ORDER BY created_at DESC LIMIT 1").bind(employeeId).first<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT * FROM employee_lifecycle_events WHERE employee_id = ? ORDER BY created_at DESC LIMIT 25").bind(employeeId).all<Record<string, unknown>>()
  ]);
  const onboardingTasks = onboarding ? (await c.env.DB.prepare("SELECT * FROM employee_onboarding_tasks WHERE onboarding_case_id = ? ORDER BY is_required DESC, task_group").bind(String(onboarding.id)).all()).results : [];
  const offboardingTasks = offboarding ? (await c.env.DB.prepare("SELECT * FROM employee_offboarding_tasks WHERE offboarding_case_id = ? ORDER BY is_required DESC, task_group").bind(String(offboarding.id)).all()).results : [];
  return { employee, onboarding, onboarding_tasks: onboardingTasks, offboarding, offboarding_tasks: offboardingTasks, events: events.results };
}

onboardingRoutes.get("/settings", requireAnyPermission(["onboarding.settings.view", "onboarding.settings.manage", "settings.view"]), async (c) => ok(c, { settings: await ensureOnboardingSettings(c.env.DB) }));
onboardingRoutes.patch("/settings", requireAnyPermission(["onboarding.settings.update", "onboarding.settings.manage", "settings.manage"]), async (c) => ok(c, { settings: await updateSettings(c, "onboarding_settings", onboardingSettingsFields) }));
onboardingRoutes.get("/cases", requireAnyPermission(["onboarding.cases.view", "onboarding.cases.manage", "employees.view"]), async (c) => ok(c, { cases: await listOnboardingCases(c) }));
onboardingRoutes.get("/dashboard", requireAnyPermission(["onboarding.dashboard.view", "onboarding.cases.view", "dashboard.view"]), async (c) => {
  const cases = await listOnboardingCases(c);
  return ok(c, {
    dashboard: {
      total_cases: cases.length,
      blocked_onboarding: cases.filter((row) => row.onboarding_status === "BLOCKED").length,
      ready_for_approval: cases.filter((row) => row.onboarding_status === "READY_FOR_APPROVAL").length,
      pending_documents: cases.filter((row) => row.onboarding_status === "WAITING_FOR_DOCUMENTS").length,
      activated_this_month: cases.filter((row) => row.activated_at && String(row.activated_at).slice(0, 7) === new Date().toISOString().slice(0, 7)).length,
      overdue_tasks: cases.filter((row) => row.due_date && String(row.due_date) < new Date().toISOString().slice(0, 10)).length,
      rows: cases.slice(0, 20)
    }
  });
});
onboardingRoutes.get("/alerts", requireAnyPermission(["onboarding.alerts.view", "onboarding.alerts.manage"]), async (c) => {
  const rows = await c.env.DB.prepare("SELECT oa.*, e.employee_no, e.full_name AS employee_name FROM onboarding_alerts oa LEFT JOIN employees e ON e.id = oa.employee_id ORDER BY oa.created_at DESC").all();
  return ok(c, { alerts: rows.results });
});
onboardingRoutes.post("/alerts/refresh", requireAnyPermission(["onboarding.alerts.manage"]), async (c) => {
  const cases = await listOnboardingCases(c);
  for (const row of cases.filter((item) => item.onboarding_status === "BLOCKED")) {
    await c.env.DB.prepare("INSERT OR IGNORE INTO onboarding_alerts (id, onboarding_case_id, employee_id, alert_type, severity, metadata_json) VALUES (?, ?, ?, 'ONBOARDING_BLOCKED', 'WARNING', ?)").bind(id("onboarding_alert"), row.id, row.employee_id, JSON.stringify({ refreshed: true })).run();
  }
  return ok(c, { refreshed: true });
});

onboardingRoutes.get("/cases/:caseId/workspace", requireAnyPermission(onboardingWorkspaceViewPermissions), async (c) => {
  const workspace = await loadOnboardingWorkspace(c, c.req.param("caseId"));
  if (!workspace) return fail(c, 404, "ONBOARDING_CASE_NOT_FOUND", "Onboarding case was not found.");
  return ok(c, { workspace });
});

onboardingRoutes.patch("/cases/:caseId/employee-info", requireAnyPermission([...onboardingWorkspaceUpdatePermissions, "employees.update"]), async (c) => {
  const gate = await getCaseEmployee(c, "ONBOARDING", c.req.param("caseId"), "manage");
  if (!gate) return fail(c, 404, "ONBOARDING_CASE_NOT_FOUND", "Onboarding case was not found.");
  const body = await readBody(c);
  const fullName = optionalText(body.full_name) ?? String(gate.employee.full_name ?? "");
  if (!fullName) return fail(c, 400, "ONBOARDING_EMPLOYEE_NAME_REQUIRED", "Employee name is required.");
  const employeeType = (optionalText(body.employee_type) ?? String(gate.employee.employee_type)).toUpperCase();
  const employmentType = (optionalText(body.employment_type) ?? String(gate.employee.employment_type)).toUpperCase();
  if (!["LOCAL", "FOREIGN", "OTHER"].includes(employeeType)) return fail(c, 400, "ONBOARDING_EMPLOYEE_TYPE_INVALID", "Employee type is invalid.");
  if (!["FULL_TIME", "PART_TIME", "INTERN", "TEMPORARY", "CONTRACT"].includes(employmentType)) return fail(c, 400, "ONBOARDING_EMPLOYMENT_TYPE_INVALID", "Employment type is invalid.");
  await c.env.DB.prepare(
    `UPDATE employees SET full_name = ?, display_name = ?, gender = ?, date_of_birth = ?, nationality = ?,
       employee_type = ?, employment_type = ?, joining_date = ?, confirmation_date = ?, notes_summary = ?,
       payroll_included = ?, roster_eligible = ?, updated_at = ? WHERE id = ?`
  ).bind(
    fullName,
    optionalText(body.display_name),
    optionalText(body.gender),
    optionalText(body.date_of_birth),
    optionalText(body.nationality),
    employeeType,
    employmentType,
    optionalText(body.joining_date),
    optionalText(body.confirmation_date),
    optionalText(body.notes_summary),
    asSqlBool(body.payroll_included ?? gate.employee.payroll_included),
    asSqlBool(body.roster_eligible ?? gate.employee.roster_eligible),
    nowIso(),
    gate.row.employee_id
  ).run();
  await setOnboardingTaskState(c, c.req.param("caseId"), "personal_info", "COMPLETED", "Employee information saved from onboarding workspace.");
  await auditLifecycle(c, "onboarding.workspace.employee_info_saved", "employee", String(gate.row.employee_id), gate.employee, body);
  return ok(c, { workspace: await loadOnboardingWorkspace(c, c.req.param("caseId")) });
});

onboardingRoutes.patch("/cases/:caseId/contact-info", requireAnyPermission([...onboardingWorkspaceUpdatePermissions, "employees.contacts.manage"]), async (c) => {
  const gate = await getCaseEmployee(c, "ONBOARDING", c.req.param("caseId"), "manage");
  if (!gate) return fail(c, 404, "ONBOARDING_CASE_NOT_FOUND", "Onboarding case was not found.");
  const body = await readBody(c);
  const employeeId = String(gate.row.employee_id);
  async function upsertContact(type: string, value: string | null, extra: Record<string, unknown> = {}) {
    if (!value) return;
    const existing = await c.env.DB.prepare("SELECT id FROM employee_contacts WHERE employee_id = ? AND contact_type = ? AND is_primary = 1 AND archived_at IS NULL").bind(employeeId, type).first<{ id: string }>();
    if (existing) {
      await c.env.DB.prepare("UPDATE employee_contacts SET value = ?, country_code = ?, relationship = ?, emergency_priority = ?, notes = ?, updated_at = ? WHERE id = ?")
        .bind(value, optionalText(extra.country_code), optionalText(extra.relationship), numberOrNull(extra.emergency_priority), optionalText(extra.notes), nowIso(), existing.id).run();
    } else {
      await c.env.DB.prepare("INSERT INTO employee_contacts (id, employee_id, contact_type, value, country_code, relationship, is_primary, emergency_priority, is_sensitive, notes) VALUES (?, ?, ?, ?, ?, ?, 1, ?, 0, ?)")
        .bind(id("employee_contact"), employeeId, type, value, optionalText(extra.country_code), optionalText(extra.relationship), numberOrNull(extra.emergency_priority), optionalText(extra.notes)).run();
    }
  }
  await upsertContact("PERSONAL_PHONE", optionalText(body.phone ?? body.personal_phone), { country_code: body.country_code });
  await upsertContact("PERSONAL_EMAIL", optionalText(body.personal_email));
  await upsertContact("EMERGENCY", optionalText(body.emergency_contact_value), { relationship: body.emergency_relationship, emergency_priority: 1, notes: body.emergency_notes });
  const address = optionalText(body.address_line);
  if (address) {
    const existingAddress = await c.env.DB.prepare("SELECT id FROM employee_addresses WHERE employee_id = ? AND address_type = 'CURRENT' AND is_primary = 1").bind(employeeId).first<{ id: string }>();
    if (existingAddress) {
      await c.env.DB.prepare("UPDATE employee_addresses SET address_line = ?, island_city = ?, country = ?, updated_at = ? WHERE id = ?").bind(address, optionalText(body.island_city), optionalText(body.country), nowIso(), existingAddress.id).run();
    } else {
      await c.env.DB.prepare("INSERT INTO employee_addresses (id, employee_id, address_type, address_line, island_city, country, is_primary) VALUES (?, ?, 'CURRENT', ?, ?, ?, 1)")
        .bind(id("employee_address"), employeeId, address, optionalText(body.island_city), optionalText(body.country)).run();
    }
  }
  await setOnboardingTaskState(c, c.req.param("caseId"), "contact_info", "COMPLETED", "Contact information saved from onboarding workspace.");
  await auditLifecycle(c, "onboarding.workspace.contact_info_saved", "employee", employeeId, null, body);
  return ok(c, { workspace: await loadOnboardingWorkspace(c, c.req.param("caseId")) });
});

onboardingRoutes.patch("/cases/:caseId/job-assignment", requireAnyPermission([...onboardingWorkspaceUpdatePermissions, "employees.update", "employees.job_history.manage"]), async (c) => {
  const gate = await getCaseEmployee(c, "ONBOARDING", c.req.param("caseId"), "manage");
  if (!gate) return fail(c, 404, "ONBOARDING_CASE_NOT_FOUND", "Onboarding case was not found.");
  const body = await readBody(c);
  const validation = await validateWorkspaceJobAssignment(c, String(gate.row.employee_id), body);
  if (validation) return validation;
  const employeeId = String(gate.row.employee_id);
  const previous = gate.employee;
  const next = {
    primary_department_id: optionalText(body.primary_department_id),
    primary_position_id: optionalText(body.primary_position_id),
    primary_location_id: optionalText(body.primary_location_id),
    job_level_id: optionalText(body.job_level_id),
    reporting_manager_employee_id: optionalText(body.reporting_manager_employee_id),
    employment_type: optionalText(body.employment_type) ?? String(previous.employment_type),
    employee_type: optionalText(body.employee_type) ?? String(previous.employee_type)
  };
  await c.env.DB.prepare("UPDATE employees SET primary_department_id = ?, primary_position_id = ?, primary_location_id = ?, job_level_id = ?, reporting_manager_employee_id = ?, employment_type = ?, employee_type = ?, updated_at = ? WHERE id = ?")
    .bind(next.primary_department_id, next.primary_position_id, next.primary_location_id, next.job_level_id, next.reporting_manager_employee_id, next.employment_type, next.employee_type, nowIso(), employeeId).run();
  await c.env.DB.prepare(
    `INSERT INTO employee_job_history
     (id, employee_id, previous_department_id, new_department_id, previous_position_id, new_position_id,
      previous_location_id, new_location_id, previous_job_level_id, new_job_level_id,
      previous_reporting_manager_employee_id, new_reporting_manager_employee_id, effective_date, reason, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id("employee_job_history"), employeeId, previous.primary_department_id ?? null, next.primary_department_id, previous.primary_position_id ?? null, next.primary_position_id, previous.primary_location_id ?? null, next.primary_location_id, previous.job_level_id ?? null, next.job_level_id, previous.reporting_manager_employee_id ?? null, next.reporting_manager_employee_id, optionalText(body.effective_date) ?? new Date().toISOString().slice(0, 10), optionalText(body.reason) ?? "Saved from onboarding workspace", c.get("currentUser").id).run();
  await setOnboardingTaskState(c, c.req.param("caseId"), "job_assignment", "COMPLETED", "Job assignment saved from onboarding workspace.");
  await auditLifecycle(c, "onboarding.workspace.job_assignment_saved", "employee", employeeId, previous, next, optionalText(body.reason));
  return ok(c, { workspace: await loadOnboardingWorkspace(c, c.req.param("caseId")) });
});

onboardingRoutes.post("/cases/:caseId/documents", requireAnyPermission(["onboarding.workspace.documents.upload", "documents.upload", "onboarding.cases.manage"]), async (c) => {
  const gate = await getCaseEmployee(c, "ONBOARDING", c.req.param("caseId"), "manage");
  if (!gate) return fail(c, 404, "ONBOARDING_CASE_NOT_FOUND", "Onboarding case was not found.");
  if (!(await ensureOnboardingModuleEnabled(c, "documents", "document_compliance"))) return ok(c, { not_required: true, workspace: await loadOnboardingWorkspace(c, c.req.param("caseId")) });
  const response = await uploadEmployeeDocument(c, undefined, undefined, "Uploaded from onboarding workspace", String(gate.row.employee_id));
  if (response.status < 400) {
    const blockers = await getOnboardingDocumentBlockers(c, c.req.param("caseId"));
    await setOnboardingTaskState(c, c.req.param("caseId"), "documents", blockers.length ? "IN_PROGRESS" : "COMPLETED", "Document uploaded from onboarding workspace.");
    await auditLifecycle(c, "onboarding.workspace.document_uploaded", "employee", String(gate.row.employee_id), null, { case_id: c.req.param("caseId") });
    await refreshWorkspaceReadiness(c, c.req.param("caseId"), "documents", "onboarding.workspace.document_uploaded");
  }
  return response;
});

onboardingRoutes.post("/cases/:caseId/contracts", requireAnyPermission(["onboarding.workspace.contracts.create", "contracts.create", "contracts.manage", "onboarding.cases.manage"]), async (c) => {
  const gate = await getCaseEmployee(c, "ONBOARDING", c.req.param("caseId"), "manage");
  if (!gate) return fail(c, 404, "ONBOARDING_CASE_NOT_FOUND", "Onboarding case was not found.");
  if (!(await ensureOnboardingModuleEnabled(c, "contract", "contracts"))) return ok(c, { not_required: true, workspace: await loadOnboardingWorkspace(c, c.req.param("caseId")) });
  const body = await readBody(c);
  const contractTypeId = optionalText(body.contract_type_id);
  if (!contractTypeId) return fail(c, 400, "CONTRACT_TYPE_REQUIRED", "Please select a contract type.");
  const type = await c.env.DB.prepare("SELECT * FROM contract_types WHERE id = ?").bind(contractTypeId).first<Record<string, unknown>>();
  if (!type) return fail(c, 400, "CONTRACT_TYPE_NOT_FOUND", "Selected contract type was not found.");
  if (Number(type.is_active ?? 0) !== 1 || type.status !== "ACTIVE" || type.archived_at) return fail(c, 400, "CONTRACT_TYPE_INACTIVE", "Selected contract type is inactive or archived and cannot be used for a new contract.");
  const startDate = optionalText(body.contract_start_date);
  if (!startDate) return fail(c, 400, "CONTRACT_START_DATE_REQUIRED", "Contract start date is required.");
  const endDate = optionalText(body.contract_end_date);
  if (Number(type.requires_end_date ?? 0) === 1 && !endDate) return fail(c, 400, "CONTRACT_END_DATE_REQUIRED", "Contract end date is required for this contract type.");
  if (endDate && endDate < startDate) return fail(c, 400, "CONTRACT_DATE_INVALID", "Contract end date cannot be before contract start date.");
  const probationStart = optionalText(body.probation_start_date);
  const probationEnd = optionalText(body.probation_end_date);
  if (Number(type.requires_probation ?? 0) === 1 && (!probationStart || !probationEnd)) return fail(c, 400, "CONTRACT_PROBATION_DATES_REQUIRED", "Probation dates are required for this contract type.");
  const contractId = id("employee_contract");
  const contractNumber = optionalText(body.contract_number) ?? `CTR-${gate.employee.employee_no}-${Date.now().toString(36).toUpperCase()}`;
  await c.env.DB.prepare(
    `INSERT INTO employee_contracts
     (id, employee_id, contract_number, contract_type_id, contract_type_code_snapshot, contract_type_name_snapshot, contract_title,
      contract_start_date, contract_end_date, probation_start_date, probation_end_date, confirmation_due_date, effective_date,
      status, approval_status, probation_status, renewal_status, employee_number_snapshot, employee_name_snapshot, department_snapshot,
      worksite_snapshot, location_snapshot, position_snapshot, employment_type_snapshot, job_level_snapshot, notes, created_by_user_id,
      updated_by_user_id, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', 'NOT_REQUIRED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(contractId, gate.row.employee_id, contractNumber, contractTypeId, type.code ?? null, type.name ?? null, optionalText(body.contract_title) ?? `${type.name ?? "Employment"} Contract`, startDate, endDate, probationStart, probationEnd, optionalText(body.confirmation_due_date), optionalText(body.effective_date) ?? startDate, probationStart || probationEnd || Number(type.requires_probation ?? 0) === 1 ? "IN_PROBATION" : "NOT_APPLICABLE", Number(type.allows_renewal ?? 0) === 1 ? "NOT_DUE" : "NOT_APPLICABLE", gate.employee.employee_no ?? null, gate.employee.full_name ?? null, gate.employee.department_name ?? null, gate.employee.location_name ?? null, gate.employee.location_name ?? null, gate.employee.position_name ?? gate.employee.position_title ?? null, gate.employee.employment_type ?? null, gate.employee.job_level_name ?? null, optionalText(body.notes), c.get("currentUser").id, c.get("currentUser").id, JSON.stringify({ created_from: "onboarding_workspace" })).run();
  const status = await getOnboardingContractStatus(c, c.req.param("caseId"));
  await setOnboardingTaskState(c, c.req.param("caseId"), "contract", status.ready ? "COMPLETED" : "IN_PROGRESS", "Contract draft created from onboarding workspace.");
  await auditLifecycle(c, "onboarding.workspace.contract_created", "employee_contract", contractId, null, body);
  return ok(c, { workspace: await loadOnboardingWorkspace(c, c.req.param("caseId")) }, 201);
});

onboardingRoutes.patch("/cases/:caseId/payroll-profile", requireAnyPermission(["onboarding.workspace.payroll.update", "employees.payroll.update", "payroll.manage", "onboarding.cases.manage"]), async (c) => {
  const gate = await getCaseEmployee(c, "ONBOARDING", c.req.param("caseId"), "manage");
  if (!gate) return fail(c, 404, "ONBOARDING_CASE_NOT_FOUND", "Onboarding case was not found.");
  if (!(await ensureOnboardingModuleEnabled(c, "payroll_profile", "payroll"))) return ok(c, { not_required: true, workspace: await loadOnboardingWorkspace(c, c.req.param("caseId")) });
  const body = await readBody(c);
  const employeeId = String(gate.row.employee_id);
  const salary = numberOrNull(body.basic_salary) ?? 0;
  if (salary < 0) return fail(c, 400, "PAYROLL_PROFILE_INVALID", "Basic salary cannot be negative.");
  const existing = await c.env.DB.prepare("SELECT id FROM employee_payroll_profiles WHERE employee_id = ?").bind(employeeId).first<{ id: string }>();
  const profileId = existing?.id ?? id("employee_payroll_profile");
  await c.env.DB.prepare(
    `INSERT INTO employee_payroll_profiles
     (id, employee_id, basic_salary, currency, payment_method, bank_name, bank_account_no, bank_account_name, payroll_included,
      overtime_eligible, benefits_eligible, advance_eligible, missed_day_deduction_enabled, leave_deduction_enabled, daily_rate_mode, effective_from)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(employee_id) DO UPDATE SET basic_salary = excluded.basic_salary, currency = excluded.currency,
       payment_method = excluded.payment_method, bank_name = excluded.bank_name, bank_account_no = excluded.bank_account_no,
       bank_account_name = excluded.bank_account_name, payroll_included = excluded.payroll_included, overtime_eligible = excluded.overtime_eligible,
       benefits_eligible = excluded.benefits_eligible, advance_eligible = excluded.advance_eligible,
       missed_day_deduction_enabled = excluded.missed_day_deduction_enabled, leave_deduction_enabled = excluded.leave_deduction_enabled,
       daily_rate_mode = excluded.daily_rate_mode, effective_from = excluded.effective_from, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
  ).bind(profileId, employeeId, salary, optionalText(body.currency) ?? "MVR", optionalText(body.payment_method) ?? "CASH", optionalText(body.bank_name), optionalText(body.bank_account_no), optionalText(body.bank_account_name), asSqlBool(body.payroll_included ?? true), asSqlBool(body.overtime_eligible), asSqlBool(body.benefits_eligible), asSqlBool(body.advance_eligible), asSqlBool(body.missed_day_deduction_enabled ?? true), asSqlBool(body.leave_deduction_enabled ?? true), optionalText(body.daily_rate_mode) ?? "FIXED_30_DAYS", optionalText(body.effective_from) ?? new Date().toISOString().slice(0, 10)).run();
  await setOnboardingTaskState(c, c.req.param("caseId"), "payroll_profile", "COMPLETED", "Payroll profile saved from onboarding workspace.");
  await auditLifecycle(c, "onboarding.workspace.payroll_profile_saved", "employee_payroll_profile", profileId, null, body);
  return ok(c, { workspace: await loadOnboardingWorkspace(c, c.req.param("caseId")) });
});

onboardingRoutes.post("/cases/:caseId/payment-methods", requireAnyPermission(["onboarding.workspace.payment_methods.update", "employees.payment_methods.create", "employees.payment_methods.manage", "payroll.payment_methods.manage", "onboarding.cases.manage"]), async (c) => {
  const gate = await getCaseEmployee(c, "ONBOARDING", c.req.param("caseId"), "manage");
  if (!gate) return fail(c, 404, "ONBOARDING_CASE_NOT_FOUND", "Onboarding case was not found.");
  if (!(await ensureOnboardingModuleEnabled(c, "payment_method", "payment_methods"))) return ok(c, { not_required: true, workspace: await loadOnboardingWorkspace(c, c.req.param("caseId")) });
  const body = await readBody(c);
  const employeeId = String(gate.row.employee_id);
  const methodType = (optionalText(body.payment_method_type) ?? "CASH").toUpperCase();
  if (!["BANK_TRANSFER", "CASH", "CHEQUE_PLACEHOLDER", "MOBILE_WALLET_PLACEHOLDER", "OTHER"].includes(methodType)) return fail(c, 400, "PAYMENT_METHOD_INVALID", "A valid payment method type is required.");
  const institutionId = optionalText(body.payment_institution_id);
  const institution = institutionId ? await c.env.DB.prepare("SELECT * FROM payment_institutions WHERE id = ? AND is_active = 1 AND status = 'ACTIVE'").bind(institutionId).first<Record<string, unknown>>() : null;
  if (institutionId && !institution) return fail(c, 400, "PAYMENT_INSTITUTION_INVALID", "Selected payment institution is not active.");
  const accountNumber = optionalText(body.bank_account_number);
  if (methodType === "BANK_TRANSFER" && (!institutionId || !optionalText(body.bank_account_name) || !accountNumber)) return fail(c, 400, "PAYMENT_METHOD_INVALID", "Bank transfer requires institution, account name, and account number.");
  await c.env.DB.prepare("UPDATE employee_payment_methods SET is_primary = 0 WHERE employee_id = ? AND status = 'ACTIVE'").bind(employeeId).run();
  const methodId = id("employee_payment_method");
  await c.env.DB.prepare(
    `INSERT INTO employee_payment_methods
     (id, employee_id, payment_method_type, payment_institution_id, bank_name_snapshot, bank_account_name,
      bank_account_number_encrypted_or_plain_placeholder, bank_account_number_masked, is_primary, allocation_type,
      allocation_percentage, allocation_amount, currency, effective_date, notes, created_by_user_id, updated_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(methodId, employeeId, methodType, institutionId, institution?.name ?? optionalText(body.bank_name_snapshot), optionalText(body.bank_account_name), accountNumber, maskAccount(accountNumber), optionalText(body.allocation_type) ?? "FULL", numberOrNull(body.allocation_percentage), numberOrNull(body.allocation_amount), optionalText(body.currency) ?? "MVR", optionalText(body.effective_date) ?? new Date().toISOString().slice(0, 10), optionalText(body.notes), c.get("currentUser").id, c.get("currentUser").id).run();
  await setOnboardingTaskState(c, c.req.param("caseId"), "payment_method", "COMPLETED", "Payment method saved from onboarding workspace.");
  await auditLifecycle(c, "onboarding.workspace.payment_method_saved", "employee_payment_method", methodId, null, body);
  return ok(c, { workspace: await loadOnboardingWorkspace(c, c.req.param("caseId")) }, 201);
});

onboardingRoutes.post("/cases/:caseId/pension-profile", requireAnyPermission(["onboarding.workspace.pension.update", "employees.pension_profiles.update", "employees.pension_profiles.manage", "onboarding.cases.manage"]), async (c) => {
  const gate = await getCaseEmployee(c, "ONBOARDING", c.req.param("caseId"), "manage");
  if (!gate) return fail(c, 404, "ONBOARDING_CASE_NOT_FOUND", "Onboarding case was not found.");
  if (!(await ensureOnboardingModuleEnabled(c, "pension_profile", "pension"))) return ok(c, { not_required: true, workspace: await loadOnboardingWorkspace(c, c.req.param("caseId")) });
  const body = await readBody(c);
  const employeeId = String(gate.row.employee_id);
  const existing = await c.env.DB.prepare("SELECT id FROM employee_pension_profiles WHERE employee_id = ? AND status = 'ACTIVE' ORDER BY effective_date DESC LIMIT 1").bind(employeeId).first<{ id: string }>();
  const profileId = existing?.id ?? id("employee_pension_profile");
  await c.env.DB.prepare(
    `INSERT INTO employee_pension_profiles
     (id, employee_id, pension_scheme_id, pension_member_id, registration_number, enrollment_status,
      employee_contribution_percent_override, employer_contribution_percent_override, employer_pays_employee_share,
      employee_extra_voluntary_contribution_amount, contribution_basis_override, effective_date, exemption_reason, notes,
      created_by_user_id, updated_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET pension_scheme_id = excluded.pension_scheme_id, pension_member_id = excluded.pension_member_id,
      registration_number = excluded.registration_number, enrollment_status = excluded.enrollment_status,
      employee_contribution_percent_override = excluded.employee_contribution_percent_override,
      employer_contribution_percent_override = excluded.employer_contribution_percent_override,
      employer_pays_employee_share = excluded.employer_pays_employee_share,
      employee_extra_voluntary_contribution_amount = excluded.employee_extra_voluntary_contribution_amount,
      contribution_basis_override = excluded.contribution_basis_override, effective_date = excluded.effective_date,
      exemption_reason = excluded.exemption_reason, notes = excluded.notes, updated_by_user_id = excluded.updated_by_user_id,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
  ).bind(profileId, employeeId, optionalText(body.pension_scheme_id), optionalText(body.pension_member_id), optionalText(body.registration_number), optionalText(body.enrollment_status) ?? "ENROLLED", numberOrNull(body.employee_contribution_percent_override), numberOrNull(body.employer_contribution_percent_override), asSqlBool(body.employer_pays_employee_share), numberOrNull(body.employee_extra_voluntary_contribution_amount) ?? 0, optionalText(body.contribution_basis_override), optionalText(body.effective_date) ?? new Date().toISOString().slice(0, 10), optionalText(body.exemption_reason), optionalText(body.notes), c.get("currentUser").id, c.get("currentUser").id).run();
  await setOnboardingTaskState(c, c.req.param("caseId"), "pension_profile", "COMPLETED", "Pension profile saved from onboarding workspace.");
  await auditLifecycle(c, "onboarding.workspace.pension_profile_saved", "employee_pension_profile", profileId, null, body);
  return ok(c, { workspace: await loadOnboardingWorkspace(c, c.req.param("caseId")) });
});

onboardingRoutes.post("/cases/:caseId/biometric-mapping", requireAnyPermission(["onboarding.workspace.attendance.update", "attendance.devices.manage", "attendance.manage", "onboarding.cases.manage"]), async (c) => {
  const gate = await getCaseEmployee(c, "ONBOARDING", c.req.param("caseId"), "manage");
  if (!gate) return fail(c, 404, "ONBOARDING_CASE_NOT_FOUND", "Onboarding case was not found.");
  if (!(await ensureOnboardingModuleEnabled(c, "attendance_biometric", "attendance"))) return ok(c, { not_required: true, workspace: await loadOnboardingWorkspace(c, c.req.param("caseId")) });
  const body = await readBody(c);
  if (asBool(body.not_required)) {
    await setOnboardingTaskState(c, c.req.param("caseId"), "attendance_biometric", "NOT_REQUIRED", optionalText(body.reason) ?? "Attendance/biometric setup marked not required.");
    return ok(c, { workspace: await loadOnboardingWorkspace(c, c.req.param("caseId")) });
  }
  const biometricUserId = optionalText(body.biometric_user_id);
  if (!biometricUserId) return fail(c, 400, "BIOMETRIC_USER_ID_REQUIRED", "Biometric user ID is required.");
  const mappingId = id("employee_biometric_mapping");
  await c.env.DB.prepare("INSERT INTO employee_biometric_mappings (id, employee_id, attendance_device_id, biometric_user_id, biometric_user_name, external_employee_code, mapping_source, status, is_primary, notes, created_by_user_id, updated_by_user_id) VALUES (?, ?, ?, ?, ?, ?, 'MANUAL', 'ACTIVE', 1, ?, ?, ?)")
    .bind(mappingId, gate.row.employee_id, optionalText(body.attendance_device_id), biometricUserId, optionalText(body.biometric_user_name), optionalText(body.external_employee_code), optionalText(body.notes), c.get("currentUser").id, c.get("currentUser").id).run();
  await setOnboardingTaskState(c, c.req.param("caseId"), "attendance_biometric", "COMPLETED", "Biometric mapping saved from onboarding workspace.");
  await auditLifecycle(c, "onboarding.workspace.biometric_mapping_saved", "employee_biometric_mapping", mappingId, null, body);
  return ok(c, { workspace: await loadOnboardingWorkspace(c, c.req.param("caseId")) }, 201);
});

onboardingRoutes.post("/cases/:caseId/assets-uniforms", requireAnyPermission(["onboarding.workspace.assets.update", "assets.issue", "assets.manage", "onboarding.cases.manage"]), async (c) => {
  const gate = await getCaseEmployee(c, "ONBOARDING", c.req.param("caseId"), "manage");
  if (!gate) return fail(c, 404, "ONBOARDING_CASE_NOT_FOUND", "Onboarding case was not found.");
  if (!(await ensureOnboardingModuleEnabled(c, "assets_uniforms", "assets_uniforms"))) return ok(c, { not_required: true, workspace: await loadOnboardingWorkspace(c, c.req.param("caseId")) });
  const body = await readBody(c);
  if (asBool(body.not_required) || asBool(body.waived)) {
    await setOnboardingTaskState(c, c.req.param("caseId"), "assets_uniforms", asBool(body.waived) ? "WAIVED" : "NOT_REQUIRED", optionalText(body.reason) ?? "Asset/uniform issue marked not required.");
    return ok(c, { workspace: await loadOnboardingWorkspace(c, c.req.param("caseId")) });
  }
  const assetItemId = optionalText(body.asset_item_id);
  if (!assetItemId) return fail(c, 400, "ASSET_ITEM_REQUIRED", "Select an available asset or mark assets/uniforms not required.");
  const asset = await c.env.DB.prepare("SELECT id FROM asset_items WHERE id = ? AND status = 'AVAILABLE'").bind(assetItemId).first<{ id: string }>();
  if (!asset) return fail(c, 400, "ASSET_ITEM_INVALID", "Selected asset is not available.");
  const assignmentId = id("employee_asset_assignment");
  await c.env.DB.prepare("INSERT INTO employee_asset_assignments (id, employee_id, asset_item_id, assignment_number, assigned_date, issued_date, issued_by_user_id, expected_return_date, status, assignment_status, clearance_status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ISSUED', 'ASSIGNED', 'PENDING', ?)")
    .bind(assignmentId, gate.row.employee_id, assetItemId, `ASG-${Date.now().toString(36).toUpperCase()}`, optionalText(body.issued_date) ?? new Date().toISOString().slice(0, 10), optionalText(body.issued_date) ?? new Date().toISOString().slice(0, 10), c.get("currentUser").id, optionalText(body.expected_return_date), optionalText(body.notes)).run();
  await c.env.DB.prepare("UPDATE asset_items SET status = 'ISSUED', lifecycle_status = 'ASSIGNED', assigned_employee_id = ?, updated_at = ? WHERE id = ?").bind(gate.row.employee_id, nowIso(), assetItemId).run();
  await setOnboardingTaskState(c, c.req.param("caseId"), "assets_uniforms", "COMPLETED", "Asset/uniform issued from onboarding workspace.");
  await auditLifecycle(c, "onboarding.workspace.asset_uniform_saved", "employee_asset_assignment", assignmentId, null, body);
  return ok(c, { workspace: await loadOnboardingWorkspace(c, c.req.param("caseId")) }, 201);
});

onboardingRoutes.post("/cases/:caseId/user-account", requireAnyPermission(["onboarding.workspace.user_access.update", "users.create", "users.update", "role_mappings.apply", "onboarding.cases.manage"]), async (c) => {
  const gate = await getCaseEmployee(c, "ONBOARDING", c.req.param("caseId"), "manage");
  if (!gate) return fail(c, 404, "ONBOARDING_CASE_NOT_FOUND", "Onboarding case was not found.");
  const body = await readBody(c);
  if (gate.employee.user_id) {
    await setOnboardingTaskState(c, c.req.param("caseId"), "user_access", "COMPLETED", "Employee already has a linked user account.");
  } else {
    await setOnboardingTaskState(c, c.req.param("caseId"), "user_access", asBool(body.deferred) || asBool(body.not_required) ? "NOT_REQUIRED" : "IN_PROGRESS", optionalText(body.reason) ?? "User account setup deferred from onboarding workspace.");
  }
  await auditLifecycle(c, "onboarding.workspace.user_access_saved", "employee", String(gate.row.employee_id), null, { deferred: asBool(body.deferred), not_required: asBool(body.not_required) });
  return ok(c, { workspace: await loadOnboardingWorkspace(c, c.req.param("caseId")) });
});

onboardingRoutes.post("/cases/:caseId/refresh-checklist", requireAnyPermission(["onboarding.workspace.update", "onboarding.tasks.manage", "onboarding.cases.manage"]), async (c) => {
  await refreshOnboardingChecklist(c, c.req.param("caseId"));
  return ok(c, { workspace: await loadOnboardingWorkspace(c, c.req.param("caseId")) });
});

onboardingRoutes.post("/cases/:caseId/complete", requireAnyPermission(["onboarding.workspace.complete", "onboarding.activation.submit", "onboarding.activation.manage"]), async (c) => {
  const readiness = await getEmployeeOnboardingReadiness(c, c.req.param("caseId"));
  if (!readiness?.can_activate) return fail(c, 409, "ONBOARDING_WORKSPACE_NOT_READY", "Onboarding setup is not ready for activation.");
  return ok(c, { submitted: await submitEmployeeActivationForApproval(c, c.req.param("caseId")), approval: await createOnboardingApprovalInstance(c, c.req.param("caseId")), workspace: await loadOnboardingWorkspace(c, c.req.param("caseId")) });
});

onboardingRoutes.get("/cases/:caseId", requireAnyPermission(["onboarding.cases.view", "onboarding.cases.manage", "employees.lifecycle.view", "employees.view"]), async (c) => {
  const gate = await getCaseEmployee(c, "ONBOARDING", c.req.param("caseId"), "view");
  if (!gate) return fail(c, 404, "ONBOARDING_CASE_NOT_FOUND", "Onboarding case was not found.");
  return ok(c, { case: gate.row, employee: gate.employee, checklist: await getOnboardingChecklistStatus(c, c.req.param("caseId")), approval: await getOnboardingApprovalSummary(c, c.req.param("caseId")) });
});
onboardingRoutes.patch("/cases/:caseId", requireAnyPermission(["onboarding.cases.update", "onboarding.cases.manage"]), async (c) => {
  const gate = await getCaseEmployee(c, "ONBOARDING", c.req.param("caseId"), "manage");
  if (!gate) return fail(c, 404, "ONBOARDING_CASE_NOT_FOUND", "Onboarding case was not found.");
  const body = await readBody(c);
  await c.env.DB.prepare("UPDATE employee_onboarding_cases SET assigned_owner_user_id = COALESCE(?, assigned_owner_user_id), due_date = COALESCE(?, due_date), notes = COALESCE(?, notes), updated_by_user_id = ?, updated_at = ? WHERE id = ?")
    .bind(optionalText(body.assigned_owner_user_id), optionalText(body.due_date), optionalText(body.notes), c.get("currentUser").id, nowIso(), c.req.param("caseId")).run();
  await createLifecycleEvent(c, { employeeId: String(gate.row.employee_id), caseType: "ONBOARDING", caseId: c.req.param("caseId"), action: "onboarding.case.updated", previousStatus: String(gate.row.onboarding_status), newStatus: String(gate.row.onboarding_status) });
  return ok(c, { case: (await getCaseEmployee(c, "ONBOARDING", c.req.param("caseId"), "view"))?.row });
});
onboardingRoutes.post("/cases/:caseId/cancel", requireAnyPermission(["onboarding.cases.cancel", "onboarding.cases.manage"]), async (c) => {
  const gate = await getCaseEmployee(c, "ONBOARDING", c.req.param("caseId"), "manage");
  if (!gate) return fail(c, 404, "ONBOARDING_CASE_NOT_FOUND", "Onboarding case was not found.");
  const reason = optionalText((await readBody(c)).reason);
  if (!reason) return fail(c, 400, "ONBOARDING_OVERRIDE_REASON_REQUIRED", "Cancellation reason is required.");
  await c.env.DB.prepare("UPDATE employee_onboarding_cases SET onboarding_status = 'CANCELLED', cancelled_by_user_id = ?, cancelled_at = ?, cancellation_reason = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, nowIso(), reason, nowIso(), c.req.param("caseId")).run();
  await createLifecycleEvent(c, { employeeId: String(gate.row.employee_id), caseType: "ONBOARDING", caseId: c.req.param("caseId"), action: "onboarding.case.cancelled", previousStatus: String(gate.row.onboarding_status), newStatus: "CANCELLED", reason });
  return ok(c, { cancelled: true });
});
onboardingRoutes.get("/cases/:caseId/tasks", requireAnyPermission(["onboarding.tasks.view", "onboarding.tasks.manage", "employees.lifecycle.view", "employees.view"]), async (c) => {
  const gate = await getCaseEmployee(c, "ONBOARDING", c.req.param("caseId"), "view");
  if (!gate) return fail(c, 404, "ONBOARDING_CASE_NOT_FOUND", "Onboarding case was not found.");
  return ok(c, { checklist: await getOnboardingChecklistStatus(c, c.req.param("caseId")) });
});
onboardingRoutes.post("/cases/:caseId/tasks/refresh", requireAnyPermission(["onboarding.tasks.manage"]), async (c) => ok(c, { checklist: await refreshOnboardingChecklist(c, c.req.param("caseId")) }));
onboardingRoutes.get("/cases/:caseId/readiness", requireAnyPermission(["onboarding.activation.view", "onboarding.cases.view", "employees.lifecycle.view", "employees.view"]), async (c) => ok(c, { readiness: await getEmployeeOnboardingReadiness(c, c.req.param("caseId")) }));
onboardingRoutes.post("/cases/:caseId/submit-activation", requireAnyPermission(["onboarding.activation.submit", "onboarding.activation.manage"]), async (c) => ok(c, { submitted: await submitEmployeeActivationForApproval(c, c.req.param("caseId")), approval: await createOnboardingApprovalInstance(c, c.req.param("caseId")) }));
onboardingRoutes.post("/cases/:caseId/approve-activation", requireAnyPermission(["onboarding.activation.approve", "onboarding.activation.manage"]), async (c) => ok(c, { approved: await approveEmployeeActivation(c, c.req.param("caseId")), approval: await syncOnboardingApprovalStatus(c, c.req.param("caseId")) }));
onboardingRoutes.post("/cases/:caseId/activate", requireAnyPermission(["onboarding.activation.activate", "onboarding.activation.manage", "onboarding.workspace.activate"]), async (c) => {
  const result = await activateEmployeeFromOnboarding(c, c.req.param("caseId"));
  if (!result) return fail(c, 404, "ONBOARDING_CASE_NOT_FOUND", "Onboarding case was not found.");
  if ("blocked" in result) return fail(c, 409, "EMPLOYEE_ACTIVATION_NOT_READY", "Employee activation is blocked by onboarding requirements.");
  return ok(c, result);
});
onboardingRoutes.post("/cases/:caseId/activate-with-override", requireAnyPermission(["onboarding.activation.override", "onboarding.activation.manage"]), async (c) => {
  const reason = optionalText((await readBody(c)).reason);
  if (!reason) return fail(c, 400, "ONBOARDING_OVERRIDE_REASON_REQUIRED", "Override reason is required.");
  return ok(c, await activateEmployeeWithOnboardingOverride(c, c.req.param("caseId"), reason));
});
onboardingRoutes.get("/cases/:caseId/events", requireAnyPermission(["lifecycle.events.view", "onboarding.cases.view", "employees.lifecycle.view"]), async (c) => {
  const gate = await getCaseEmployee(c, "ONBOARDING", c.req.param("caseId"), "view");
  if (!gate) return fail(c, 404, "ONBOARDING_CASE_NOT_FOUND", "Onboarding case was not found.");
  const rows = await c.env.DB.prepare("SELECT * FROM employee_lifecycle_events WHERE case_type = 'ONBOARDING' AND case_id = ? ORDER BY created_at DESC").bind(c.req.param("caseId")).all();
  return ok(c, { events: rows.results });
});
onboardingRoutes.patch("/tasks/:taskId", requireAnyPermission(["onboarding.tasks.manage", "onboarding.tasks.assign"]), async (c) => {
  const body = await readBody(c);
  const status = optionalText(body.task_status) as TaskStatus | null;
  await c.env.DB.prepare("UPDATE employee_onboarding_tasks SET task_status = COALESCE(?, task_status), status = COALESCE(?, status), assigned_to_user_id = COALESCE(?, assigned_to_user_id), due_date = COALESCE(?, due_date), notes = COALESCE(?, notes), updated_at = ? WHERE id = ?")
    .bind(status, status ? oldTaskStatus(status) : null, optionalText(body.assigned_to_user_id), optionalText(body.due_date), optionalText(body.notes), nowIso(), c.req.param("taskId")).run();
  return ok(c, { updated: true });
});
onboardingRoutes.post("/tasks/:taskId/complete", requireAnyPermission(["onboarding.tasks.complete", "onboarding.tasks.manage"]), async (c) => { await completeOnboardingTask(c, c.req.param("taskId")); return ok(c, { completed: true }); });
onboardingRoutes.post("/tasks/:taskId/waive", requireAnyPermission(["onboarding.tasks.waive", "onboarding.tasks.manage"]), async (c) => {
  const reason = optionalText((await readBody(c)).reason);
  if (!reason) return fail(c, 400, "ONBOARDING_OVERRIDE_REASON_REQUIRED", "Waiver reason is required.");
  await waiveOnboardingTask(c, c.req.param("taskId"), reason);
  return ok(c, { waived: true });
});
onboardingRoutes.post("/tasks/:taskId/reopen", requireAnyPermission(["onboarding.tasks.reopen", "onboarding.tasks.manage"]), async (c) => {
  await c.env.DB.prepare("UPDATE employee_onboarding_tasks SET status = 'PENDING', task_status = 'NOT_STARTED', completed_at = NULL, waived_at = NULL, updated_at = ? WHERE id = ?").bind(nowIso(), c.req.param("taskId")).run();
  return ok(c, { reopened: true });
});
onboardingRoutes.post("/tasks/:taskId/assign", requireAnyPermission(["onboarding.tasks.assign", "onboarding.tasks.manage"]), async (c) => {
  const body = await readBody(c);
  await c.env.DB.prepare("UPDATE employee_onboarding_tasks SET assigned_to_user_id = ?, assigned_role_id = ?, updated_at = ? WHERE id = ?").bind(optionalText(body.assigned_to_user_id), optionalText(body.assigned_role_id), nowIso(), c.req.param("taskId")).run();
  return ok(c, { assigned: true });
});

offboardingRoutes.get("/settings", requireAnyPermission(["offboarding.settings.view", "offboarding.settings.manage", "settings.view"]), async (c) => ok(c, { settings: await ensureOffboardingSettings(c.env.DB) }));
offboardingRoutes.patch("/settings", requireAnyPermission(["offboarding.settings.update", "offboarding.settings.manage", "settings.manage"]), async (c) => ok(c, { settings: await updateSettings(c, "offboarding_settings", offboardingSettingsFields) }));
offboardingRoutes.get("/cases", requireAnyPermission(["offboarding.cases.view", "offboarding.cases.manage", "employees.view"]), async (c) => ok(c, { cases: await listOffboardingCases(c) }));
offboardingRoutes.get("/dashboard", requireAnyPermission(["offboarding.dashboard.view", "offboarding.cases.view", "dashboard.view"]), async (c) => {
  const cases = await listOffboardingCases(c);
  return ok(c, { dashboard: { total_cases: cases.length, pending_clearance: cases.filter((row) => row.offboarding_status === "WAITING_FOR_CLEARANCE").length, pending_final_settlement: cases.filter((row) => row.offboarding_status === "WAITING_FOR_FINAL_SETTLEMENT").length, pending_access_revocation: cases.filter((row) => row.offboarding_status === "WAITING_FOR_ACCESS_REVOCATION").length, completed_exits: cases.filter((row) => row.offboarding_status === "COMPLETED").length, overdue_cases: cases.filter((row) => row.due_date && String(row.due_date) < new Date().toISOString().slice(0, 10)).length, rows: cases.slice(0, 20) } });
});
offboardingRoutes.get("/cases/:caseId", requireAnyPermission(["offboarding.cases.view", "offboarding.cases.manage"]), async (c) => {
  const gate = await getCaseEmployee(c, "OFFBOARDING", c.req.param("caseId"), "view");
  if (!gate) return fail(c, 404, "OFFBOARDING_CASE_NOT_FOUND", "Offboarding case was not found.");
  return ok(c, { case: gate.row, employee: gate.employee, checklist: await getOffboardingChecklistStatus(c, c.req.param("caseId")), approval: await getOffboardingApprovalSummary(c, c.req.param("caseId")) });
});
offboardingRoutes.patch("/cases/:caseId", requireAnyPermission(["offboarding.cases.update", "offboarding.cases.manage"]), async (c) => {
  const gate = await getCaseEmployee(c, "OFFBOARDING", c.req.param("caseId"), "manage");
  if (!gate) return fail(c, 404, "OFFBOARDING_CASE_NOT_FOUND", "Offboarding case was not found.");
  const body = await readBody(c);
  await c.env.DB.prepare("UPDATE employee_offboarding_cases SET assigned_owner_user_id = COALESCE(?, assigned_owner_user_id), due_date = COALESCE(?, due_date), exit_reason = COALESCE(?, exit_reason), notes = COALESCE(?, notes), updated_by_user_id = ?, updated_at = ? WHERE id = ?")
    .bind(optionalText(body.assigned_owner_user_id), optionalText(body.due_date), optionalText(body.exit_reason), optionalText(body.notes), c.get("currentUser").id, nowIso(), c.req.param("caseId")).run();
  await createLifecycleEvent(c, { employeeId: String(gate.row.employee_id), caseType: "OFFBOARDING", caseId: c.req.param("caseId"), action: "offboarding.case.updated", previousStatus: String(gate.row.offboarding_status), newStatus: String(gate.row.offboarding_status) });
  return ok(c, { case: (await getCaseEmployee(c, "OFFBOARDING", c.req.param("caseId"), "view"))?.row });
});
offboardingRoutes.post("/cases/:caseId/cancel", requireAnyPermission(["offboarding.cases.cancel", "offboarding.cases.manage"]), async (c) => {
  const gate = await getCaseEmployee(c, "OFFBOARDING", c.req.param("caseId"), "manage");
  if (!gate) return fail(c, 404, "OFFBOARDING_CASE_NOT_FOUND", "Offboarding case was not found.");
  const reason = optionalText((await readBody(c)).reason);
  if (!reason) return fail(c, 400, "OFFBOARDING_OVERRIDE_REASON_REQUIRED", "Cancellation reason is required.");
  await c.env.DB.prepare("UPDATE employee_offboarding_cases SET offboarding_status = 'CANCELLED', cancelled_by_user_id = ?, cancelled_at = ?, cancellation_reason = ?, updated_at = ? WHERE id = ?").bind(c.get("currentUser").id, nowIso(), reason, nowIso(), c.req.param("caseId")).run();
  await createLifecycleEvent(c, { employeeId: String(gate.row.employee_id), caseType: "OFFBOARDING", caseId: c.req.param("caseId"), action: "offboarding.case.cancelled", previousStatus: String(gate.row.offboarding_status), newStatus: "CANCELLED", reason });
  return ok(c, { cancelled: true });
});
offboardingRoutes.get("/cases/:caseId/tasks", requireAnyPermission(["offboarding.tasks.view", "offboarding.tasks.manage"]), async (c) => ok(c, { checklist: await getOffboardingChecklistStatus(c, c.req.param("caseId")) }));
offboardingRoutes.post("/cases/:caseId/tasks/refresh", requireAnyPermission(["offboarding.tasks.manage"]), async (c) => ok(c, { checklist: await refreshOffboardingChecklist(c, c.req.param("caseId")) }));
offboardingRoutes.get("/cases/:caseId/readiness", requireAnyPermission(["offboarding.finalization.view", "offboarding.cases.view"]), async (c) => ok(c, { readiness: await getEmployeeOffboardingReadiness(c, c.req.param("caseId")) }));
offboardingRoutes.post("/cases/:caseId/submit-finalization", requireAnyPermission(["offboarding.finalization.submit", "offboarding.finalization.manage"]), async (c) => ok(c, { submitted: await submitEmployeeExitForApproval(c, c.req.param("caseId")), approval: await createOffboardingApprovalInstance(c, c.req.param("caseId")) }));
offboardingRoutes.post("/cases/:caseId/approve-finalization", requireAnyPermission(["offboarding.finalization.approve", "offboarding.finalization.manage"]), async (c) => ok(c, { approved: await approveEmployeeExitFinalization(c, c.req.param("caseId")), approval: await syncOffboardingApprovalStatus(c, c.req.param("caseId")) }));
offboardingRoutes.post("/cases/:caseId/finalize-exit", requireAnyPermission(["offboarding.finalization.finalize", "offboarding.finalization.manage"]), async (c) => {
  const result = await finalizeEmployeeExitFromOffboarding(c, c.req.param("caseId"));
  if (!result) return fail(c, 404, "OFFBOARDING_CASE_NOT_FOUND", "Offboarding case was not found.");
  if ("blocked" in result) return fail(c, 409, "EMPLOYEE_EXIT_NOT_READY", "Employee exit is blocked by offboarding requirements.");
  return ok(c, result);
});
offboardingRoutes.post("/cases/:caseId/finalize-with-override", requireAnyPermission(["offboarding.finalization.override", "offboarding.finalization.manage"]), async (c) => {
  const reason = optionalText((await readBody(c)).reason);
  if (!reason) return fail(c, 400, "OFFBOARDING_OVERRIDE_REASON_REQUIRED", "Override reason is required.");
  return ok(c, await finalizeEmployeeExitWithOverride(c, c.req.param("caseId"), reason));
});
offboardingRoutes.get("/cases/:caseId/events", requireAnyPermission(["lifecycle.events.view", "offboarding.cases.view"]), async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM employee_lifecycle_events WHERE case_type = 'OFFBOARDING' AND case_id = ? ORDER BY created_at DESC").bind(c.req.param("caseId")).all();
  return ok(c, { events: rows.results });
});
offboardingRoutes.patch("/tasks/:taskId", requireAnyPermission(["offboarding.tasks.manage", "offboarding.tasks.assign"]), async (c) => {
  const body = await readBody(c);
  await c.env.DB.prepare("UPDATE employee_offboarding_tasks SET task_status = COALESCE(?, task_status), assigned_to_user_id = COALESCE(?, assigned_to_user_id), due_date = COALESCE(?, due_date), notes = COALESCE(?, notes), updated_at = ? WHERE id = ?")
    .bind(optionalText(body.task_status), optionalText(body.assigned_to_user_id), optionalText(body.due_date), optionalText(body.notes), nowIso(), c.req.param("taskId")).run();
  return ok(c, { updated: true });
});
offboardingRoutes.post("/tasks/:taskId/complete", requireAnyPermission(["offboarding.tasks.complete", "offboarding.tasks.manage"]), async (c) => { await completeOffboardingTask(c, c.req.param("taskId")); return ok(c, { completed: true }); });
offboardingRoutes.post("/tasks/:taskId/waive", requireAnyPermission(["offboarding.tasks.waive", "offboarding.tasks.manage"]), async (c) => {
  const reason = optionalText((await readBody(c)).reason);
  if (!reason) return fail(c, 400, "OFFBOARDING_OVERRIDE_REASON_REQUIRED", "Waiver reason is required.");
  await waiveOffboardingTask(c, c.req.param("taskId"), reason);
  return ok(c, { waived: true });
});
offboardingRoutes.post("/tasks/:taskId/reopen", requireAnyPermission(["offboarding.tasks.reopen", "offboarding.tasks.manage"]), async (c) => {
  await c.env.DB.prepare("UPDATE employee_offboarding_tasks SET task_status = 'NOT_STARTED', completed_at = NULL, waived_at = NULL, updated_at = ? WHERE id = ?").bind(nowIso(), c.req.param("taskId")).run();
  return ok(c, { reopened: true });
});
offboardingRoutes.post("/tasks/:taskId/assign", requireAnyPermission(["offboarding.tasks.assign", "offboarding.tasks.manage"]), async (c) => {
  const body = await readBody(c);
  await c.env.DB.prepare("UPDATE employee_offboarding_tasks SET assigned_to_user_id = ?, assigned_role_id = ?, updated_at = ? WHERE id = ?").bind(optionalText(body.assigned_to_user_id), optionalText(body.assigned_role_id), nowIso(), c.req.param("taskId")).run();
  return ok(c, { assigned: true });
});

employeeLifecycleRoutes.post("/:employeeId/onboarding/cases", requireAnyPermission(["onboarding.cases.create", "onboarding.cases.manage", "employees.lifecycle.manage"]), async (c) => {
  const result = await createOnboardingCase(c, c.req.param("employeeId"));
  if (!result) return fail(c, 404, "LIFECYCLE_SCOPE_DENIED", "Employee was not found or is outside your access scope.");
  if ("disabled" in result) return fail(c, 403, "ONBOARDING_DISABLED", "Onboarding workflow is disabled.");
  if ("duplicate" in result) {
    const duplicateIssues = validateDuplicateConflict(result, "employee_id", "This employee already has an active onboarding case.");
    if (hasValidationErrors(duplicateIssues)) return validationResponse(c, duplicateIssues, 409);
  }
  return ok(c, { case_id: result.id }, 201);
});
employeeLifecycleRoutes.get("/:employeeId/onboarding", requireAnyPermission(["onboarding.cases.view", "employees.lifecycle.view", "employees.view"]), async (c) => {
  const summary = await lifecycleSummary(c, c.req.param("employeeId"));
  if (!summary) return fail(c, 404, "LIFECYCLE_SCOPE_DENIED", "Employee was not found or is outside your access scope.");
  return ok(c, { onboarding: summary.onboarding, tasks: summary.onboarding_tasks });
});
employeeLifecycleRoutes.post("/:employeeId/offboarding/cases", requireAnyPermission(["offboarding.cases.create", "offboarding.cases.manage", "employees.lifecycle.manage"]), async (c) => {
  const body = await readBody(c);
  const dateIssues = validateDateRange({
    start: optionalText(body.exit_notice_date),
    end: optionalText(body.last_working_day) ?? new Date().toISOString().slice(0, 10),
    startField: "exit_notice_date",
    endField: "last_working_day",
    label: "Last working day"
  });
  if (hasValidationErrors(dateIssues)) return validationResponse(c, dateIssues);
  const result = await createOffboardingCase(c, c.req.param("employeeId"), body);
  if (!result) return fail(c, 404, "LIFECYCLE_SCOPE_DENIED", "Employee was not found or is outside your access scope.");
  if ("disabled" in result) return fail(c, 403, "OFFBOARDING_DISABLED", "Offboarding workflow is disabled.");
  if ("duplicate" in result) {
    const duplicateIssues = validateDuplicateConflict(result, "employee_id", "This employee already has an active offboarding case.");
    if (hasValidationErrors(duplicateIssues)) return validationResponse(c, duplicateIssues, 409);
  }
  if ("invalid" in result) return fail(c, 400, "EMPLOYEE_EXIT_NOT_READY", "Exit type is invalid.");
  return ok(c, { case_id: result.id }, 201);
});
employeeLifecycleRoutes.get("/:employeeId/lifecycle-events", requireAnyPermission(["lifecycle.events.view", "employees.lifecycle.view"]), async (c) => {
  const summary = await lifecycleSummary(c, c.req.param("employeeId"));
  if (!summary) return fail(c, 404, "LIFECYCLE_SCOPE_DENIED", "Employee was not found or is outside your access scope.");
  return ok(c, { events: summary.events });
});
employeeLifecycleRoutes.get("/:employeeId/lifecycle-summary", requireAnyPermission(["employees.lifecycle.view", "employees.view"]), async (c) => {
  const summary = await lifecycleSummary(c, c.req.param("employeeId"));
  if (!summary) return fail(c, 404, "LIFECYCLE_SCOPE_DENIED", "Employee was not found or is outside your access scope.");
  return ok(c, { summary });
});

selfServiceLifecycleRoutes.get("/onboarding", requireAnyPermission(["self_service.onboarding.view", "self_service.view"]), async (c) => {
  const user: AuthUser = c.get("currentUser");
  if (!user.employee_id) return ok(c, { onboarding: null, tasks: [], events: [] });
  const settings = await ensureOnboardingSettings(c.env.DB);
  if (settings?.employee_self_service_onboarding_view_enabled === 0) return fail(c, 403, "LIFECYCLE_PERMISSION_DENIED", "Self-service onboarding view is disabled.");
  const summary = await lifecycleSummary(c, user.employee_id);
  return ok(c, { onboarding: summary?.onboarding ?? null, tasks: summary?.onboarding_tasks ?? [], events: summary?.events ?? [] });
});
selfServiceLifecycleRoutes.get("/offboarding", requireAnyPermission(["self_service.offboarding.view", "self_service.view"]), async (c) => {
  const user: AuthUser = c.get("currentUser");
  if (!user.employee_id) return ok(c, { offboarding: null, tasks: [], events: [] });
  const settings = await ensureOffboardingSettings(c.env.DB);
  if (settings?.employee_self_service_offboarding_view_enabled === 0) return fail(c, 403, "LIFECYCLE_PERMISSION_DENIED", "Self-service offboarding view is disabled.");
  const summary = await lifecycleSummary(c, user.employee_id);
  return ok(c, { offboarding: summary?.offboarding ?? null, tasks: summary?.offboarding_tasks ?? [], events: summary?.events ?? [] });
});

lifecycleRoutes.get("/dashboard", requireAnyPermission(["onboarding.dashboard.view", "offboarding.dashboard.view", "employees.lifecycle.view", "dashboard.view"]), async (c) => {
  const [onboardingCases, offboardingCases] = await Promise.all([listOnboardingCases(c), listOffboardingCases(c)]);
  return ok(c, {
    dashboard: {
      onboarding_total: onboardingCases.length,
      onboarding_blocked: onboardingCases.filter((row) => row.onboarding_status === "BLOCKED").length,
      onboarding_ready_for_activation: onboardingCases.filter((row) => row.activation_status === "READY" || row.activation_status === "APPROVED").length,
      offboarding_total: offboardingCases.length,
      offboarding_pending_clearance: offboardingCases.filter((row) => row.offboarding_status === "WAITING_FOR_CLEARANCE").length,
      offboarding_pending_finalization: offboardingCases.filter((row) => row.finalization_status === "READY" || row.finalization_status === "APPROVED").length,
      recent_onboarding: onboardingCases.slice(0, 10),
      recent_offboarding: offboardingCases.slice(0, 10)
    }
  });
});

lifecycleRoutes.get("/events", requireAnyPermission(["lifecycle.events.view", "employees.lifecycle.view"]), async (c) => {
  const scope = await buildEmployeeScopeWhereClause(c.env.DB, c.get("currentUser"), "employees", "view", "e");
  const rows = await c.env.DB.prepare(
    `SELECT ev.*, e.employee_no, e.full_name AS employee_name
     FROM employee_lifecycle_events ev
     JOIN employees e ON e.id = ev.employee_id
     ${where([scope.sql])}
     ORDER BY ev.created_at DESC
     LIMIT 100`
  ).bind(...scope.params).all();
  return ok(c, { events: rows.results });
});
