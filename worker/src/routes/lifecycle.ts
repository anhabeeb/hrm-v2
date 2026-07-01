import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import { buildEmployeeScopeWhereClause, canAccessEmployee, type AccessScopeType } from "../auth/access-scopes";
import { hashPassword } from "../auth/password";
import { recordAudit } from "../db/audit";
import { getActiveOwnerCount, getUserByEmail, getUserById } from "../db/users";
import { hasValidationErrors, validateAccessScope, validateDateRange, validateDuplicateConflict, validationResponse } from "../lib/moduleValidation";
import { requireAuth } from "../middleware/auth";
import { publishAccessEvent } from "../realtime/publisher";
import type { AppBindings, AuthUser, DbUser, UserStatus } from "../types";
import { fail, getClientIp, nowIso, ok } from "../utils/http";
import { requireOperationalModuleMiddleware } from "../utils/module-enforcement";
import { isEmail, normalizeEmail, readString } from "../utils/validation";
import { calculateEmployeeDocumentCompliance } from "./document-compliance";
import { uploadEmployeeDocument } from "./documents";

type BindValue = string | number | null;
type LifecycleCaseType = "ONBOARDING" | "OFFBOARDING";
type TaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "WAIVED" | "BLOCKED" | "NOT_REQUIRED" | "CANCELLED";
type OnboardingDashboardQuery = Record<string, string>;
type OnboardingDashboardCase = Record<string, unknown> & {
  blocker_types: string[];
  setup_statuses: Record<string, string>;
  has_started_setup: boolean;
  ready_for_activation: boolean;
  is_blocked: boolean;
  is_overdue: boolean;
  starting_this_week: boolean;
};

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
employeeLifecycleRoutes.use("/:employeeId/onboarding/*", requireOperationalModuleMiddleware("onboarding", "Onboarding"));
employeeLifecycleRoutes.use("/:employeeId/offboarding/*", requireOperationalModuleMiddleware("offboarding", "Offboarding"));
selfServiceLifecycleRoutes.use("/onboarding", requireOperationalModuleMiddleware("onboarding", "Onboarding"));
selfServiceLifecycleRoutes.use("/offboarding", requireOperationalModuleMiddleware("offboarding", "Offboarding"));

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

function arrayOfStrings(value: unknown) {
  return Array.isArray(value) ? Array.from(new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0))) : [];
}

function isStrongPassword(password: string) {
  return password.length >= 12 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

function slugForUsername(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, ".")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 48);
}

async function lifecycleUniqueUsernameSuggestion(db: D1Database, employee: Record<string, unknown>, email: string | null) {
  const candidates = [email ? email.split("@")[0] : null, employee.employee_no, employee.full_name]
    .map((value) => value ? slugForUsername(String(value)) : "")
    .filter(Boolean);
  const base = candidates[0] || `employee.${String(employee.id).slice(0, 8)}`;
  for (const candidate of Array.from(new Set([base, ...candidates, `${base}.${String(employee.id).slice(0, 6)}`]))) {
    const existing = await db.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE").bind(candidate).first<{ id: string }>();
    if (!existing) return candidate;
  }
  return `${base}.${crypto.randomUUID().slice(0, 6)}`;
}

async function lifecycleEmployeeEmailSuggestion(db: D1Database, employee: Record<string, unknown>) {
  const contacts = await db
    .prepare(
      `SELECT value, contact_type, is_primary
       FROM employee_contacts
       WHERE employee_id = ? AND archived_at IS NULL AND contact_type IN ('WORK_EMAIL', 'PERSONAL_EMAIL')
       ORDER BY is_primary DESC, CASE contact_type WHEN 'WORK_EMAIL' THEN 0 ELSE 1 END, created_at DESC
       LIMIT 3`
    )
    .bind(String(employee.id))
    .all<{ value: string; contact_type: string; is_primary: number }>();
  const raw = contacts.results.map((contact) => contact.value).find(Boolean) ?? null;
  const email = raw ? normalizeEmail(raw) : "";
  const valid = Boolean(email && isEmail(email));
  const matchingUser = valid ? await getUserByEmail(db, email) : null;
  return {
    email: valid ? email : null,
    raw_email: raw,
    is_valid: valid,
    source: raw ? "employee_contact" : "manual_required",
    message: raw
      ? valid
        ? "Using employee email from profile."
        : "Employee email is invalid. Update employee email or enter a valid account email."
      : "Employee has no email on file. Enter an account email to continue.",
    matching_user: matchingUser ? { id: matchingUser.id, name: matchingUser.name, email: matchingUser.email, username: matchingUser.username, status: matchingUser.status, employee_id: matchingUser.employee_id } : null,
    recommendation: matchingUser
      ? matchingUser.employee_id && matchingUser.employee_id !== String(employee.id)
        ? "BLOCK_DUPLICATE_LINKED_EMPLOYEE"
        : matchingUser.employee_id === String(employee.id) || employee.user_id === matchingUser.id
          ? "ALREADY_LINKED"
          : "LINK_EXISTING_USER"
      : valid ? "PROVISION_WITH_EMPLOYEE_EMAIL" : "ENTER_EMAIL"
  };
}

function oldTaskStatus(status: TaskStatus) {
  if (status === "COMPLETED") return "COMPLETED";
  if (status === "BLOCKED") return "BLOCKED";
  if (status === "WAIVED" || status === "NOT_REQUIRED" || status === "CANCELLED") return "SKIPPED";
  return "PENDING";
}

const onboardingWorkspaceViewPermissions = ["onboarding.workspace.view", "onboarding.cases.view", "onboarding.cases.manage", "employees.lifecycle.view", "employees.view"];
const onboardingWorkspaceUpdatePermissions = ["onboarding.workspace.update", "onboarding.cases.update", "onboarding.cases.manage", "employees.lifecycle.manage"];

type WorkspaceOptionalSectionStatus = "COMPLETE" | "MISSING" | "NOT_REQUIRED" | "DISABLED" | "NO_PERMISSION" | "WARNING";
type WorkspaceOptionalSectionState = {
  status: WorkspaceOptionalSectionStatus;
  label: string;
  message: string;
  module_key?: string | null;
  permission_keys?: string[];
};

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

async function validateLifecycleRoleAssignments(c: Context<AppBindings>, targetUser: DbUser | null, roleIds: string[]) {
  if (!roleIds.length) return null;
  if (!hasAny(c, ["users.assign_roles", "roles.assign_permissions", "users.update", "employee.user_account.manage", "onboarding.workspace.user_access.update"])) {
    return fail(c, 403, "LIFECYCLE_ROLE_ASSIGNMENT_DENIED", "You do not have permission to assign roles.");
  }
  const roles: Array<{ id: string; name: string; is_active: number; is_protected: number }> = [];
  for (const roleId of Array.from(new Set(roleIds))) {
    const role = await c.env.DB.prepare("SELECT id, name, is_active, is_protected FROM roles WHERE id = ?").bind(roleId).first<{ id: string; name: string; is_active: number; is_protected: number }>();
    if (!role) return fail(c, 400, "UNKNOWN_ROLE", "One or more selected roles do not exist.");
    if (role.is_active !== 1) return fail(c, 409, "INACTIVE_ROLE", "Inactive roles cannot be assigned.");
    if (role.is_protected === 1 && !hasAny(c, ["roles.assign_permissions"])) return fail(c, 403, "PROTECTED_ROLE_REQUIRES_PERMISSION", "Protected roles require elevated permission.");
    roles.push(role);
  }
  if (targetUser) {
    const ownerRole = await c.env.DB.prepare("SELECT id FROM roles WHERE is_protected = 1 AND name = 'Owner/Super Admin' LIMIT 1").first<{ id: string }>();
    const willOwn = ownerRole ? roles.some((role) => role.id === ownerRole.id) : false;
    if (targetUser.is_owner === 1 && !willOwn && targetUser.status === "ACTIVE" && (await getActiveOwnerCount(c.env.DB)) <= 1) {
      return fail(c, 409, "LAST_ACTIVE_OWNER", "The last active Owner user cannot lose the Owner role.");
    }
  }
  return null;
}

async function assignLifecycleRoles(c: Context<AppBindings>, user: DbUser, roleIds: string[]) {
  const error = await validateLifecycleRoleAssignments(c, user, roleIds);
  if (error) return error;
  const ownerRole = await c.env.DB.prepare("SELECT id FROM roles WHERE is_protected = 1 AND name = 'Owner/Super Admin' LIMIT 1").first<{ id: string }>();
  const willOwn = ownerRole ? roleIds.includes(ownerRole.id) : false;
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM user_roles WHERE user_id = ?").bind(user.id),
    ...Array.from(new Set(roleIds)).map((roleId) => c.env.DB.prepare("INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)").bind(user.id, roleId)),
    c.env.DB.prepare("UPDATE users SET is_owner = ?, updated_at = ? WHERE id = ?").bind(willOwn ? 1 : 0, nowIso(), user.id)
  ]);
  await auditLifecycle(c, "employee.user_account.roles_updated", "user", user.id, null, { role_ids: roleIds });
  return null;
}

function normalizedScopeJson(value: unknown) {
  const ids = arrayOfStrings(value).sort();
  return ids.length ? JSON.stringify(ids) : null;
}

function normalizeScopeConfigs(value: unknown) {
  if (!value) return [] as Record<string, unknown>[];
  return (Array.isArray(value) ? value : [value]).filter((item): item is Record<string, unknown> => item !== null && typeof item === "object");
}

async function prepareLifecycleAccessScopes(c: Context<AppBindings>, body: Record<string, unknown>) {
  const selectedIds = arrayOfStrings(body.access_scope_ids);
  const configs = [...normalizeScopeConfigs(body.access_scope_config), ...normalizeScopeConfigs(body.access_scope_configs)];
  if (!selectedIds.length && !configs.length) return { scopes: [] as Record<string, unknown>[] };
  if (!hasAny(c, ["users.assign_scopes", "access_scopes.apply", "access_scopes.manage", "employee.user_account.manage", "onboarding.workspace.user_access.update"])) {
    return { error: fail(c, 403, "LIFECYCLE_SCOPE_ASSIGNMENT_DENIED", "You do not have permission to assign access scopes.") };
  }
  const scopes: Record<string, unknown>[] = [];
  for (const scopeId of selectedIds) {
    const scope = await c.env.DB.prepare("SELECT * FROM access_scope_rules WHERE id = ? AND is_active = 1").bind(scopeId).first<Record<string, unknown>>();
    if (!scope) return { error: fail(c, 400, "UNKNOWN_ACCESS_SCOPE", "One or more selected access scopes do not exist or are inactive.") };
    if (!(await isModuleEnabled(c.env.DB, optionalText(scope.module_key)))) return { error: fail(c, 409, "ACCESS_SCOPE_MODULE_DISABLED", "A selected access scope belongs to a disabled module.") };
    const departments = JSON.parse(String(scope.allowed_department_ids_json ?? "[]"));
    const locations = JSON.parse(String(scope.allowed_location_ids_json ?? "[]"));
    const issues = await validateAccessScope(c.env.DB, c.get("currentUser"), { departmentIds: departments, locationIds: locations, requestedScopeType: String(scope.scope_type) as AccessScopeType });
    if (hasValidationErrors(issues)) return { error: validationResponse(c, issues) };
    scopes.push({
      name: `Assigned ${String(scope.name)}`,
      description: `Copied from access scope ${scopeId} during onboarding user setup.`,
      module_key: optionalText(scope.module_key),
      scope_type: String(scope.scope_type),
      allowed_department_ids_json: optionalText(scope.allowed_department_ids_json),
      allowed_location_ids_json: optionalText(scope.allowed_location_ids_json),
      include_sub_departments: Number(scope.include_sub_departments ?? 0) === 1,
      include_reporting_chain: Number(scope.include_reporting_chain ?? 0) === 1,
      can_view: Number(scope.can_view ?? 1) !== 0,
      can_manage: Number(scope.can_manage ?? 0) === 1,
      source_scope_id: scopeId
    });
  }
  for (const config of configs) {
    const scopeType = String(config.scope_type ?? "SELF_ONLY") as AccessScopeType;
    const moduleKey = optionalText(config.module_key);
    if (!(await isModuleEnabled(c.env.DB, moduleKey))) return { error: fail(c, 409, "ACCESS_SCOPE_MODULE_DISABLED", "Selected access scope module is disabled.") };
    const departmentJson = normalizedScopeJson(config.allowed_department_ids);
    const locationJson = normalizedScopeJson(config.allowed_location_ids);
    const issues = await validateAccessScope(c.env.DB, c.get("currentUser"), {
      departmentIds: departmentJson ? JSON.parse(departmentJson) : [],
      locationIds: locationJson ? JSON.parse(locationJson) : [],
      requestedScopeType: scopeType
    });
    if (hasValidationErrors(issues)) return { error: validationResponse(c, issues) };
    scopes.push({
      name: optionalText(config.name) ?? "Onboarding User Access Scope",
      description: optionalText(config.description) ?? "User-specific scope assigned from onboarding.",
      module_key: moduleKey,
      scope_type: scopeType,
      allowed_department_ids_json: departmentJson,
      allowed_location_ids_json: locationJson,
      include_sub_departments: asBool(config.include_sub_departments),
      include_reporting_chain: asBool(config.include_reporting_chain),
      can_view: asBool(config.can_view, true),
      can_manage: asBool(config.can_manage)
    });
  }
  return { scopes };
}

async function applyLifecycleAccessScopes(c: Context<AppBindings>, userId: string, scopes: Record<string, unknown>[]) {
  if (!scopes.length) return [];
  const actor = c.get("currentUser").id;
  const now = nowIso();
  const applied: string[] = [];
  for (const scope of scopes) {
    const existing = await c.env.DB.prepare(
      `SELECT id FROM access_scope_rules
       WHERE scope_owner_type = 'USER' AND user_id = ?
         AND COALESCE(module_key, '') = COALESCE(?, '')
         AND scope_type = ?
         AND COALESCE(allowed_department_ids_json, '') = COALESCE(?, '')
         AND COALESCE(allowed_location_ids_json, '') = COALESCE(?, '')
       LIMIT 1`
    ).bind(userId, scope.module_key ?? null, scope.scope_type, scope.allowed_department_ids_json ?? null, scope.allowed_location_ids_json ?? null).first<{ id: string }>();
    if (existing) {
      applied.push(existing.id);
      await c.env.DB.prepare("UPDATE access_scope_rules SET name = ?, description = ?, can_view = ?, can_manage = ?, is_active = 1, updated_by_user_id = ?, updated_at = ? WHERE id = ?")
        .bind(scope.name, scope.description ?? null, asBool(scope.can_view, true) ? 1 : 0, asBool(scope.can_manage) ? 1 : 0, actor, now, existing.id)
        .run();
    } else {
      const id = crypto.randomUUID();
      applied.push(id);
      await c.env.DB.prepare(
        `INSERT INTO access_scope_rules
         (id, name, description, scope_owner_type, user_id, module_key, scope_type, allowed_department_ids_json,
          allowed_location_ids_json, include_sub_departments, include_reporting_chain, can_view, can_manage, is_active,
          created_by_user_id, updated_by_user_id)
         VALUES (?, ?, ?, 'USER', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
      ).bind(id, scope.name, scope.description ?? null, userId, scope.module_key ?? null, scope.scope_type, scope.allowed_department_ids_json ?? null, scope.allowed_location_ids_json ?? null, asBool(scope.include_sub_departments) ? 1 : 0, asBool(scope.include_reporting_chain) ? 1 : 0, asBool(scope.can_view, true) ? 1 : 0, asBool(scope.can_manage) ? 1 : 0, actor, actor).run();
    }
  }
  await auditLifecycle(c, "employee.user_account.scopes_updated", "user", userId, null, { access_scope_ids: applied });
  return applied;
}

async function optionalSettingEnabled(db: D1Database, sql: string, fallback = true) {
  try {
    const row = await db.prepare(sql).first<{ enabled: number | null }>();
    return Number(row?.enabled ?? (fallback ? 1 : 0)) === 1;
  } catch {
    return fallback;
  }
}

async function getOnboardingWorkspaceModuleStatuses(c: Context<AppBindings>) {
  const moduleKeys = [
    "contracts",
    "documents",
    "document_compliance",
    "payroll",
    "payment_methods",
    "payment_institutions",
    "bank_loans",
    "custom_deductions",
    "pension",
    "attendance",
    "zkteco_attendance",
    "roster",
    "assets_uniforms",
    "final_settlement",
    "self_service",
    "approvals"
  ];
  const moduleStatuses: Record<string, boolean> = {};
  for (const key of moduleKeys) moduleStatuses[key] = await isModuleEnabled(c.env.DB, key);

  const payrollEnabled = moduleStatuses.payroll && await optionalSettingEnabled(c.env.DB, "SELECT module_enabled AS enabled FROM payroll_settings WHERE id = 'payroll_settings_default'");
  moduleStatuses.payroll = payrollEnabled;
  moduleStatuses.payment_methods = moduleStatuses.payment_methods && payrollEnabled && await optionalSettingEnabled(c.env.DB, "SELECT payment_methods_enabled AS enabled FROM payroll_settings WHERE id = 'payroll_settings_default'");
  moduleStatuses.payment_institutions = moduleStatuses.payment_institutions && payrollEnabled && await optionalSettingEnabled(c.env.DB, "SELECT payment_institutions_enabled AS enabled FROM payroll_settings WHERE id = 'payroll_settings_default'");
  moduleStatuses.bank_loans = moduleStatuses.bank_loans && payrollEnabled && await optionalSettingEnabled(c.env.DB, "SELECT bank_loan_deductions_enabled AS enabled FROM payroll_settings WHERE id = 'payroll_settings_default'");
  moduleStatuses.custom_deductions = moduleStatuses.custom_deductions && payrollEnabled && await optionalSettingEnabled(c.env.DB, "SELECT custom_deductions_enabled AS enabled FROM payroll_settings WHERE id = 'payroll_settings_default'");
  moduleStatuses.pension = moduleStatuses.pension && payrollEnabled && await optionalSettingEnabled(c.env.DB, "SELECT pension_enabled AS enabled FROM payroll_settings WHERE id = 'payroll_settings_default'");
  moduleStatuses.contracts = moduleStatuses.contracts && await optionalSettingEnabled(c.env.DB, "SELECT contracts_enabled AS enabled FROM contract_settings ORDER BY created_at LIMIT 1");
  moduleStatuses.final_settlement = moduleStatuses.final_settlement && await optionalSettingEnabled(c.env.DB, "SELECT COALESCE(final_settlement_enabled, module_enabled, 1) AS enabled FROM final_settlement_settings WHERE id = 'final_settlement_settings_default'");

  return moduleStatuses;
}

function workspaceSectionState(status: WorkspaceOptionalSectionStatus, label: string, message: string, moduleKey?: string | null, permissionKeys?: string[]): WorkspaceOptionalSectionState {
  return {
    status,
    label,
    message,
    module_key: moduleKey ?? null,
    permission_keys: permissionKeys
  };
}

function emptyD1Result<T = Record<string, unknown>>() {
  return { results: [] as T[], success: true, meta: {} } as D1Result<T>;
}

function emptyOnboardingDocumentChecklist(status: string, message: string) {
  return {
    rows: [],
    required_documents: [],
    missing_documents: [],
    status,
    compliance_status: status,
    message,
    warnings: []
  } as Awaited<ReturnType<typeof getOnboardingDocumentChecklist>>;
}

async function loadOptionalOnboardingWorkspaceSection<T>(
  c: Context<AppBindings>,
  options: {
    key: string;
    label: string;
    moduleKey?: string | null;
    moduleStatuses: Record<string, boolean>;
    permissions?: string[];
    fallback: T;
    run: () => Promise<T>;
  }
) {
  const permissions = options.permissions ?? [];
  if (options.moduleKey && options.moduleStatuses[options.moduleKey] === false) {
    return {
      value: options.fallback,
      state: workspaceSectionState("DISABLED", options.label, `This setup is not required because the module is disabled. ${options.label} will not block onboarding activation.`, options.moduleKey, permissions)
    };
  }
  if (permissions.length > 0 && !hasAny(c, permissions)) {
    return {
      value: options.fallback,
      state: workspaceSectionState("NO_PERMISSION", options.label, `No permission to load ${options.label.toLowerCase()} for this onboarding workspace.`, options.moduleKey, permissions)
    };
  }
  try {
    return {
      value: await options.run(),
      state: workspaceSectionState("COMPLETE", options.label, `${options.label} is available.`, options.moduleKey, permissions)
    };
  } catch (error) {
    console.warn("Optional onboarding workspace section unavailable", { section: options.key, error: error instanceof Error ? error.message : String(error) });
    return {
      value: options.fallback,
      state: workspaceSectionState("WARNING", options.label, `${options.label} is temporarily unavailable. Other onboarding workspace sections remain available.`, options.moduleKey, permissions)
    };
  }
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

async function ensureLifecycleSelfOnlyScope(db: D1Database, userId: string, actorUserId: string) {
  const existing = await db
    .prepare(
      `SELECT id FROM access_scope_rules
       WHERE scope_owner_type = 'USER' AND user_id = ? AND scope_type = 'SELF_ONLY'
         AND COALESCE(module_key, '') IN ('', 'self_service')
       ORDER BY CASE WHEN module_key = 'self_service' THEN 0 ELSE 1 END, created_at
       LIMIT 1`
    )
    .bind(userId)
    .first<{ id: string }>();
  if (existing) {
    await db.prepare("UPDATE access_scope_rules SET is_active = 1, can_view = 1, can_manage = 0, updated_by_user_id = ?, updated_at = ? WHERE id = ?").bind(actorUserId, nowIso(), existing.id).run();
    return existing.id;
  }
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO access_scope_rules
       (id, name, description, scope_owner_type, user_id, module_key, scope_type, can_view, can_manage, is_active, created_by_user_id, updated_by_user_id)
       VALUES (?, 'Employee Self-Service Scope', 'Self-only scope created during onboarding account setup.', 'USER', ?, 'self_service', 'SELF_ONLY', 1, 0, 1, ?, ?)`
    )
    .bind(id, userId, actorUserId, actorUserId)
    .run();
  return id;
}

async function upsertLifecycleUserAccountLink(c: Context<AppBindings>, input: {
  employeeId: string;
  userId: string;
  selfServiceEnabled: boolean;
  inviteStatus: "PASSWORD_SET" | "INVITE_RESET_PENDING" | "RESET_REQUIRED" | "DISABLED";
  resetRequired: boolean;
  employeeEmailUsed?: string | null;
  accountEmailCreated?: string | null;
  emailSource?: string | null;
  emailOverrideReason?: string | null;
}) {
  const now = nowIso();
  await c.env.DB.prepare("UPDATE employee_user_account_links SET status = 'UNLINKED', unlinked_at = COALESCE(unlinked_at, ?), unlinked_by_user_id = COALESCE(unlinked_by_user_id, ?), unlink_reason = COALESCE(unlink_reason, 'Replaced by onboarding user setup.'), updated_at = ? WHERE employee_id = ? AND status = 'ACTIVE' AND user_id != ?")
    .bind(now, c.get("currentUser").id, now, input.employeeId, input.userId)
    .run();
  const existing = await c.env.DB.prepare("SELECT id FROM employee_user_account_links WHERE employee_id = ? AND user_id = ? AND status = 'ACTIVE'").bind(input.employeeId, input.userId).first<{ id: string }>();
  if (existing) {
    await c.env.DB.prepare("UPDATE employee_user_account_links SET self_service_enabled_snapshot = ?, invite_status = ?, reset_required = ?, employee_email_used = ?, account_email_created = ?, email_source = ?, email_override_reason = ?, updated_at = ? WHERE id = ?")
      .bind(input.selfServiceEnabled ? 1 : 0, input.inviteStatus, input.resetRequired ? 1 : 0, input.employeeEmailUsed ?? null, input.accountEmailCreated ?? null, input.emailSource ?? null, input.emailOverrideReason ?? null, now, existing.id)
      .run();
    return existing.id;
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO employee_user_account_links
     (id, employee_id, user_id, status, linked_at, linked_by_user_id, self_service_enabled_snapshot,
      invite_status, reset_required, employee_email_used, account_email_created, email_source, email_override_reason)
     VALUES (?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, input.employeeId, input.userId, now, c.get("currentUser").id, input.selfServiceEnabled ? 1 : 0, input.inviteStatus, input.resetRequired ? 1 : 0, input.employeeEmailUsed ?? null, input.accountEmailCreated ?? null, input.emailSource ?? null, input.emailOverrideReason ?? null).run();
  return id;
}

async function markLifecycleUserAccountDeactivated(c: Context<AppBindings>, employeeId: string, userId: string, reason: string) {
  const now = nowIso();
  await c.env.DB.prepare("UPDATE employee_user_account_links SET status = 'DEACTIVATED', deactivated_at = ?, deactivated_by_user_id = ?, deactivation_reason = ?, invite_status = 'DISABLED', reset_required = 0, updated_at = ? WHERE employee_id = ? AND user_id = ? AND status = 'ACTIVE'")
    .bind(now, c.get("currentUser").id, reason, now, employeeId, userId)
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
      `SELECT e.*, d.name AS department_name, l.name AS location_name, p.title AS position_name, jl.name AS job_level_name, es.key AS status_key, es.name AS status_name
       FROM employees e
       LEFT JOIN departments d ON d.id = e.primary_department_id
       LEFT JOIN locations l ON l.id = e.primary_location_id
       LEFT JOIN positions p ON p.id = e.primary_position_id
       LEFT JOIN job_levels jl ON jl.id = e.job_level_id
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

async function getActiveBankPaymentInstitution(db: D1Database, institutionId: string | null) {
  if (!institutionId) return null;
  return db
    .prepare("SELECT id, code, name, type, is_active, status FROM payment_institutions WHERE id = ? AND is_active = 1 AND status = 'ACTIVE' AND type = 'BANK'")
    .bind(institutionId)
    .first<Record<string, unknown>>();
}

function normalizeDetailedPaymentMethodType(value: unknown) {
  const methodType = (optionalText(value) ?? "CASH").toUpperCase();
  return methodType === "CHEQUE" ? "CHEQUE_PLACEHOLDER" : methodType;
}

async function getOnboardingWorkspaceUserAccount(c: Context<AppBindings>, employee: Record<string, unknown>) {
  const employeeId = String(employee.id);
  const linkedUser = employee.user_id
    ? await c.env.DB.prepare("SELECT id, name, email, username, status, last_login_at, employee_id FROM users WHERE id = ?").bind(String(employee.user_id)).first<Record<string, unknown>>()
    : null;
  const roles = linkedUser
    ? (await c.env.DB.prepare("SELECT r.id, r.name, r.is_active, r.is_protected FROM roles r INNER JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ? ORDER BY r.name").bind(String(linkedUser.id)).all<Record<string, unknown>>()).results
    : [];
  const scopes = linkedUser
    ? (await c.env.DB.prepare("SELECT * FROM access_scope_rules WHERE scope_owner_type = 'USER' AND user_id = ? ORDER BY COALESCE(module_key, 'all'), name").bind(String(linkedUser.id)).all<Record<string, unknown>>()).results
    : [];
  const link = await c.env.DB.prepare("SELECT * FROM employee_user_account_links WHERE employee_id = ? AND status = 'ACTIVE' ORDER BY linked_at DESC LIMIT 1").bind(employeeId).first<Record<string, unknown>>();
  const history = (await c.env.DB.prepare("SELECT * FROM employee_user_account_links WHERE employee_id = ? ORDER BY linked_at DESC LIMIT 10").bind(employeeId).all<Record<string, unknown>>()).results;
  const employeeEmail = await lifecycleEmployeeEmailSuggestion(c.env.DB, employee);
  return {
    linked_user: linkedUser,
    roles,
    role_ids: roles.map((role) => String(role.id)),
    scopes,
    access_scope_ids: scopes.map((scope) => String(scope.id)),
    self_service_enabled: scopes.some((scope) => scope.scope_type === "SELF_ONLY" && (!scope.module_key || scope.module_key === "self_service") && Number(scope.is_active ?? 1) === 1),
    invite_status: link?.invite_status ?? (linkedUser ? "PASSWORD_SET" : null),
    reset_required: Number(link?.reset_required ?? 0) === 1,
    link,
    link_history: history,
    employee_email: employeeEmail,
    suggested_username: await lifecycleUniqueUsernameSuggestion(c.env.DB, employee, employeeEmail.email),
    available_users: (await c.env.DB.prepare(
      `SELECT u.id, u.name, u.email, u.username, u.status, u.employee_id, e.employee_no, e.full_name AS employee_name
       FROM users u
       LEFT JOIN employees e ON e.id = u.employee_id
       WHERE u.status != 'DISABLED' AND (u.employee_id IS NULL OR u.employee_id = ?)
       ORDER BY u.name`
    ).bind(employeeId).all<Record<string, unknown>>()).results,
    available_roles: (await c.env.DB.prepare("SELECT id, name, is_active, is_protected FROM roles WHERE is_active = 1 ORDER BY name").all<Record<string, unknown>>()).results,
    available_access_scopes: (await c.env.DB.prepare("SELECT * FROM access_scope_rules WHERE is_active = 1 AND scope_owner_type IN ('ROLE', 'ROLE_MAPPING_RULE') ORDER BY scope_owner_type, COALESCE(module_key, 'all'), name").all<Record<string, unknown>>()).results
  };
}

async function loadOnboardingWorkspace(c: Context<AppBindings>, caseId: string) {
  const gate = await getCaseEmployee(c, "ONBOARDING", caseId, "view");
  if (!gate) return null;
  const employeeId = String(gate.row.employee_id);
  const moduleStatuses = await getOnboardingWorkspaceModuleStatuses(c);
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
    userAccount,
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
    loadOptionalOnboardingWorkspaceSection(c, { key: "documents", label: "Documents", moduleKey: "documents", moduleStatuses, permissions: ["documents.view", "documents.checklist.view", "documents.upload", "onboarding.workspace.documents.upload", "onboarding.cases.manage"], fallback: emptyOnboardingDocumentChecklist("NO_PERMISSION", "No permission to load documents."), run: () => getOnboardingDocumentChecklist(c, caseId) }),
    loadOptionalOnboardingWorkspaceSection(c, { key: "document_types", label: "Document upload types", moduleKey: "documents", moduleStatuses, permissions: ["documents.view", "documents.upload", "onboarding.workspace.documents.upload", "onboarding.cases.manage"], fallback: { ...emptyD1Result<Record<string, unknown>>(), warning: "No permission to load document upload types." }, run: () => getOnboardingWorkspaceDocumentTypes(c) }),
    loadOptionalOnboardingWorkspaceSection(c, { key: "contracts", label: "Contracts", moduleKey: "contracts", moduleStatuses, permissions: ["contracts.view", "employees.contracts.view", "onboarding.workspace.contracts.create", "onboarding.cases.manage"], fallback: emptyD1Result<Record<string, unknown>>(), run: () => c.env.DB.prepare("SELECT ec.*, ct.name AS contract_type_name, ct.requires_end_date, ct.requires_probation FROM employee_contracts ec LEFT JOIN contract_types ct ON ct.id = ec.contract_type_id WHERE ec.employee_id = ? ORDER BY ec.created_at DESC").bind(employeeId).all<Record<string, unknown>>() }),
    loadOptionalOnboardingWorkspaceSection(c, { key: "contract_types", label: "Contract types", moduleKey: "contracts", moduleStatuses, permissions: ["contracts.types.view", "contracts.view", "onboarding.workspace.contracts.create", "onboarding.cases.manage"], fallback: emptyD1Result<Record<string, unknown>>(), run: () => c.env.DB.prepare("SELECT * FROM contract_types WHERE is_active = 1 AND status = 'ACTIVE' ORDER BY display_order, name").all<Record<string, unknown>>() }),
    loadOptionalOnboardingWorkspaceSection(c, { key: "contract_settings", label: "Contract settings", moduleKey: "contracts", moduleStatuses, permissions: ["contracts.settings.view", "contracts.view", "onboarding.workspace.contracts.create", "onboarding.cases.manage"], fallback: null as Record<string, unknown> | null, run: () => c.env.DB.prepare("SELECT * FROM contract_settings ORDER BY created_at LIMIT 1").first<Record<string, unknown>>() }),
    loadOptionalOnboardingWorkspaceSection(c, { key: "payroll_profile", label: "Payroll profile", moduleKey: "payroll", moduleStatuses, permissions: ["employees.payroll.view", "employees.payroll.update", "onboarding.workspace.payroll.update", "payroll.view", "payroll.manage", "onboarding.cases.manage"], fallback: null as Record<string, unknown> | null, run: () => c.env.DB.prepare("SELECT * FROM employee_payroll_profiles WHERE employee_id = ?").bind(employeeId).first<Record<string, unknown>>() }),
    loadOptionalOnboardingWorkspaceSection(c, { key: "payment_methods", label: "Payment methods", moduleKey: "payment_methods", moduleStatuses, permissions: ["employees.payment_methods.view", "employees.payment_methods.manage", "onboarding.workspace.payment_methods.update", "payroll.payment_methods.view", "payroll.payment_methods.manage", "onboarding.cases.manage"], fallback: emptyD1Result<Record<string, unknown>>(), run: () => c.env.DB.prepare("SELECT * FROM employee_payment_methods WHERE employee_id = ? AND status != 'ARCHIVED' ORDER BY is_primary DESC, created_at DESC").bind(employeeId).all<Record<string, unknown>>() }),
    loadOptionalOnboardingWorkspaceSection(c, { key: "payment_institutions", label: "Payroll payment institutions", moduleKey: "payment_institutions", moduleStatuses, permissions: ["payroll.payment_institutions.view", "payroll.payment_institutions.manage", "onboarding.workspace.payment_methods.update", "onboarding.cases.manage"], fallback: emptyD1Result<Record<string, unknown>>(), run: () => c.env.DB.prepare("SELECT id, code, name, type, is_active, status FROM payment_institutions WHERE is_active = 1 AND status = 'ACTIVE' AND type = 'BANK' ORDER BY display_order, name").all<Record<string, unknown>>() }),
    loadOptionalOnboardingWorkspaceSection(c, { key: "pension_profile", label: "Pension profile", moduleKey: "pension", moduleStatuses, permissions: ["employees.pension_profiles.view", "employees.pension_profiles.update", "employees.pension_profiles.manage", "onboarding.workspace.pension.update", "onboarding.cases.manage"], fallback: null as Record<string, unknown> | null, run: () => c.env.DB.prepare("SELECT epp.*, ps.scheme_name, ps.scheme_code FROM employee_pension_profiles epp LEFT JOIN pension_schemes ps ON ps.id = epp.pension_scheme_id WHERE epp.employee_id = ? AND epp.status != 'ARCHIVED' ORDER BY epp.effective_date DESC LIMIT 1").bind(employeeId).first<Record<string, unknown>>() }),
    loadOptionalOnboardingWorkspaceSection(c, { key: "pension_schemes", label: "Pension schemes", moduleKey: "pension", moduleStatuses, permissions: ["payroll.pension_schemes.view", "payroll.pension_schemes.manage", "onboarding.workspace.pension.update", "onboarding.cases.manage"], fallback: emptyD1Result<Record<string, unknown>>(), run: () => c.env.DB.prepare("SELECT * FROM pension_schemes WHERE status = 'ACTIVE' ORDER BY scheme_name").all<Record<string, unknown>>() }),
    loadOptionalOnboardingWorkspaceSection(c, { key: "biometric_mappings", label: "ZKTeco / biometric attendance", moduleKey: "zkteco_attendance", moduleStatuses, permissions: ["attendance.devices.view", "attendance.devices.manage", "attendance.manage", "onboarding.workspace.attendance.update", "onboarding.cases.manage"], fallback: emptyD1Result<Record<string, unknown>>(), run: () => c.env.DB.prepare("SELECT * FROM employee_biometric_mappings WHERE employee_id = ? AND status != 'ARCHIVED' ORDER BY is_primary DESC, created_at DESC").bind(employeeId).all<Record<string, unknown>>() }),
    loadOptionalOnboardingWorkspaceSection(c, { key: "asset_assignments", label: "Assets and uniforms", moduleKey: "assets_uniforms", moduleStatuses, permissions: ["assets.view", "employees.assets_uniforms.view", "employees.assets.view", "assets.issue", "assets.manage", "onboarding.workspace.assets.update", "onboarding.cases.manage"], fallback: emptyD1Result<Record<string, unknown>>(), run: () => c.env.DB.prepare("SELECT ea.*, ai.code AS asset_code, ai.name AS asset_name FROM employee_asset_assignments ea LEFT JOIN asset_items ai ON ai.id = ea.asset_item_id WHERE ea.employee_id = ? ORDER BY ea.created_at DESC").bind(employeeId).all<Record<string, unknown>>() }),
    loadOptionalOnboardingWorkspaceSection(c, { key: "available_assets", label: "Available assets and uniforms", moduleKey: "assets_uniforms", moduleStatuses, permissions: ["assets.view", "assets.issue", "assets.manage", "onboarding.workspace.assets.update", "onboarding.cases.manage"], fallback: emptyD1Result<Record<string, unknown>>(), run: () => c.env.DB.prepare("SELECT id, code, name, status, lifecycle_status FROM asset_items WHERE status = 'AVAILABLE' ORDER BY name LIMIT 200").all<Record<string, unknown>>() }),
    getOnboardingWorkspaceUserAccount(c, gate.employee),
    c.env.DB.prepare("SELECT * FROM employee_lifecycle_events WHERE case_type = 'ONBOARDING' AND case_id = ? ORDER BY created_at DESC LIMIT 50").bind(caseId).all<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT id, code, name, parent_department_id, is_active FROM departments WHERE is_active = 1 ORDER BY name").all<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT id, code, name, type, island_city, is_active FROM locations WHERE is_active = 1 ORDER BY name").all<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT id, code, title, department_id, level_id, is_active FROM positions WHERE is_active = 1 ORDER BY title").all<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT id, code, name, rank_order, is_active FROM job_levels WHERE is_active = 1 ORDER BY rank_order, name").all<Record<string, unknown>>(),
    c.env.DB.prepare("SELECT id, employee_no, full_name, primary_department_id, primary_location_id, primary_position_id FROM employees WHERE archived_at IS NULL AND id != ? ORDER BY full_name").bind(employeeId).all<Record<string, unknown>>()
  ]);
  const optionalSectionStates = {
    documents: documents.state,
    document_types: documentTypes.state,
    contracts: contracts.state,
    contract_types: contractTypes.state,
    contract_settings: contractSettings.state,
    payroll_profile: payrollProfile.state,
    payment_methods: paymentMethods.state,
    payment_institutions: paymentInstitutions.state,
    pension_profile: pensionProfile.state,
    pension_schemes: pensionSchemes.state,
    biometric_mappings: biometricMappings.state,
    asset_assignments: assetAssignments.state,
    available_assets: availableAssets.state,
    bank_loans: workspaceSectionState(moduleStatuses.bank_loans ? "MISSING" : "DISABLED", "Bank loans", moduleStatuses.bank_loans ? "Bank loan setup is handled by payroll after onboarding." : "Bank loans are disabled or not required for onboarding.", "bank_loans"),
    custom_deductions: workspaceSectionState(moduleStatuses.custom_deductions ? "MISSING" : "DISABLED", "Custom deductions", moduleStatuses.custom_deductions ? "Custom deductions are handled by payroll after onboarding." : "Custom deductions are disabled or not required for onboarding.", "custom_deductions"),
    final_settlement: workspaceSectionState(moduleStatuses.final_settlement ? "NOT_REQUIRED" : "DISABLED", "Final settlement", moduleStatuses.final_settlement ? "Final settlement is an offboarding-only section and is not required for onboarding." : "Final settlement is disabled or not required for onboarding.", "final_settlement")
  };
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
      document_types: documentTypes.value.results,
      contract_types: contractTypes.value.results,
      payment_institutions: paymentInstitutions.value.results,
      pension_schemes: pensionSchemes.value.results,
      available_assets: availableAssets.value.results
    },
    sections: {
      contacts: contacts.results,
      addresses: addresses.results,
      documents: documents.value,
      document_type_warning: documentTypes.value.warning,
      optional_section_states: optionalSectionStates,
      contracts: contracts.value.results,
      contract_settings: contractSettings.value,
      payroll_profile: payrollProfile.value,
      payment_methods: paymentMethods.value.results,
      pension_profile: pensionProfile.value,
      biometric_mappings: biometricMappings.value.results,
      asset_assignments: assetAssignments.value.results,
      linked_user: userAccount.linked_user,
      user_account: userAccount
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
    ...(await getOffboardingLeaveBlockers(c, caseId)),
    ...(await getOffboardingUserAccessBlockers(c, caseId))
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
  const documentsEnabled = await isModuleEnabled(c.env.DB, "documents");
  const complianceModuleEnabled = await isModuleEnabled(c.env.DB, "document_compliance");
  if (!documentsEnabled || !complianceModuleEnabled) {
    return {
      rows: [],
      required_documents: [],
      missing_documents: [],
      status: "DISABLED",
      compliance_status: "DISABLED",
      message: !documentsEnabled ? "Documents module is disabled." : "Document Compliance module is disabled.",
      warnings: []
    };
  }
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
        matched_employee_type_rule: item.matched_employee_type_rule ?? null,
        matched_employee_type_label: item.matched_employee_type_rule ?? "ANY",
        matched_employment_type_rule: item.matched_employment_type_rule ?? null,
        matched_department_id: item.matched_department_id ?? null,
        matched_department_name: item.matched_department_name ?? null,
        matched_position_id: item.matched_position_id ?? null,
        matched_position_title: item.matched_position_title ?? null,
        matched_location_id: item.matched_location_id ?? null,
        matched_location_name: item.matched_location_name ?? null,
        matched_scope: {
          employee_type: item.matched_employee_type_rule ?? "ANY",
          employment_type: item.matched_employment_type_rule ?? "ANY",
          department: item.matched_department_name ?? "Any",
          position: item.matched_position_title ?? "Any",
          location: item.matched_location_name ?? "Any"
        },
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
  const rows = gate ? await c.env.DB.prepare(
    `SELECT epm.*, pi.id AS active_bank_id
       FROM employee_payment_methods epm
       LEFT JOIN payment_institutions pi ON pi.id = epm.payment_institution_id AND pi.is_active = 1 AND pi.status = 'ACTIVE' AND pi.type = 'BANK'
      WHERE epm.employee_id = ? AND epm.status = 'ACTIVE'
      ORDER BY epm.is_primary DESC, epm.created_at DESC`
  ).bind(String(gate.row.employee_id)).all<Record<string, unknown>>() : { results: [] };
  const active = rows.results;
  const complete = active.some((method) => {
    const methodType = String(method.payment_method_type ?? "");
    if (methodType === "CASH") return true;
    if (methodType === "BANK_TRANSFER") return Boolean(method.active_bank_id && optionalText(method.bank_account_name) && optionalText(method.bank_account_number_encrypted_or_plain_placeholder));
    return true;
  });
  return { ready: complete, active_payment_methods: active.length };
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
  const settings = await ensureOffboardingSettings(c.env.DB);
  const required = Number(settings?.require_user_account_deactivation ?? 1) === 1;
  const autoDeactivationEnabled = Number(settings?.scheduled_access_deactivation_placeholder_enabled ?? 1) === 1;
  if (!gate?.employee.user_id) {
    return {
      ready: true,
      user_id: null,
      required,
      auto_deactivation_enabled: autoDeactivationEnabled,
      deactivation_status: "NO_LINKED_USER",
      message: required ? "No linked user access was found." : "User access deactivation is not required."
    };
  }
  const user = await c.env.DB
    .prepare("SELECT id, name, email, status, is_owner FROM users WHERE id = ?")
    .bind(String(gate.employee.user_id))
    .first<Record<string, unknown>>();
  const link = await c.env.DB
    .prepare("SELECT * FROM employee_user_account_links WHERE employee_id = ? AND user_id = ? ORDER BY linked_at DESC LIMIT 1")
    .bind(String(gate.row.employee_id), String(gate.employee.user_id))
    .first<Record<string, unknown>>();
  const activeLogin = user?.status === "ACTIVE";
  const protectedOwner = user?.is_owner === 1;
  return {
    ready: !required || !activeLogin || (autoDeactivationEnabled && !protectedOwner),
    required,
    auto_deactivation_enabled: autoDeactivationEnabled,
    user_id: user?.id ?? null,
    name: user?.name ?? null,
    email: user?.email ?? null,
    status: user?.status ?? null,
    protected_owner: protectedOwner,
    link_status: link?.status ?? null,
    invite_status: link?.invite_status ?? null,
    reset_required: Number(link?.reset_required ?? 0) === 1,
    deactivation_required: required && activeLogin,
    deactivation_status: activeLogin ? (autoDeactivationEnabled ? "AUTO_DEACTIVATION_READY" : "MANUAL_DEACTIVATION_REQUIRED") : "DEACTIVATED",
    message: activeLogin
      ? autoDeactivationEnabled
        ? "Linked login will be disabled automatically during exit finalization."
        : "Linked login must be disabled before exit finalization."
      : "Linked login is already disabled, locked, or unavailable."
  };
}

export async function getOffboardingUserAccessBlockers(c: Context<AppBindings>, caseId: string) {
  const settings = await ensureOffboardingSettings(c.env.DB);
  if (Number(settings?.require_user_account_deactivation ?? 1) !== 1) return [];
  const status = await getOffboardingUserAccessStatus(c, caseId);
  if (status.ready) return [];
  return [{
    type: "USER_ACCESS",
    task_key: "user_access",
    message: status.protected_owner
      ? "Protected Owner/Super Admin login cannot be automatically disabled during offboarding."
      : "Linked user access must be deactivated before exit finalization."
  }];
}

export async function deactivateEmployeeUserAccessForOffboarding(c: Context<AppBindings>, employeeId: string, reason = "Offboarding finalization") {
  const employee = await getScopedEmployee(c, employeeId, "manage");
  if (!employee?.user_id) return { status: "NO_LINKED_USER" };
  const user = await c.env.DB.prepare("SELECT id, is_owner, status FROM users WHERE id = ?").bind(String(employee.user_id)).first<Record<string, unknown>>();
  if (!user) return { status: "NO_LINKED_USER" };
  if (user.is_owner === 1) return { status: "PROTECTED_USER_DEACTIVATION_BLOCKED" };
  const now = nowIso();
  await c.env.DB.prepare("UPDATE users SET status = 'DISABLED', updated_at = ? WHERE id = ?").bind(now, String(user.id)).run();
  await markLifecycleUserAccountDeactivated(c, employeeId, String(user.id), reason);
  await c.env.DB.prepare(
    `UPDATE employee_offboarding_tasks
     SET task_status = 'COMPLETED', completed_by_user_id = ?, completed_at = ?, notes = ?, updated_at = ?
     WHERE employee_id = ? AND task_key = 'user_access' AND task_status NOT IN ('COMPLETED', 'WAIVED')`
  ).bind(c.get("currentUser").id, now, reason, now, employeeId).run();
  await auditLifecycle(c, "employee.user_account.deactivated_for_exit", "user", String(user.id), { status: user.status }, { status: "DISABLED", employee_id: employeeId }, reason);
  await publishAccessEvent(c.env, "employee.access.changed", { actor_user_id: c.get("currentUser").id, entity_type: "employee", entity_id: employeeId, action: "employee.user_account.deactivated_for_exit" });
  await publishAccessEvent(c.env, "users.roles.changed", { actor_user_id: c.get("currentUser").id, entity_type: "user", entity_id: String(user.id), action: "employee.user_account.deactivated_for_exit" });
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
  const accessResult = await deactivateEmployeeUserAccessForOffboarding(c, String(gate.row.employee_id), "Exit finalized from offboarding case.");
  if (accessResult.status === "PROTECTED_USER_DEACTIVATION_BLOCKED") return { blocked: true, readiness, access_result: accessResult };
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
  const accessResult = await deactivateEmployeeUserAccessForOffboarding(c, String(gate.row.employee_id), reason);
  if (accessResult.status === "PROTECTED_USER_DEACTIVATION_BLOCKED") return { blocked: true, reason: "Protected Owner/Super Admin login cannot be disabled automatically." };
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
    `SELECT oc.*, e.employee_no, e.full_name AS employee_name, e.joining_date AS planned_start_date,
       e.primary_department_id, e.primary_location_id, e.primary_position_id, e.job_level_id,
       d.name AS department_name, l.name AS location_name, p.title AS position_name, jl.name AS job_level_name,
       owner.name AS assigned_owner_name
     FROM employee_onboarding_cases oc
     INNER JOIN employees e ON e.id = oc.employee_id
     LEFT JOIN departments d ON d.id = e.primary_department_id
     LEFT JOIN locations l ON l.id = e.primary_location_id
     LEFT JOIN positions p ON p.id = e.primary_position_id
     LEFT JOIN job_levels jl ON jl.id = e.job_level_id
     LEFT JOIN users owner ON owner.id = oc.assigned_owner_user_id
     ${where(conditions)}
     ORDER BY oc.created_at DESC`
  ).bind(...binds).all<Record<string, unknown>>();
  return rows.results;
}

function parseJsonArrayField(value: unknown) {
  if (!value || typeof value !== "string") return [] as Record<string, unknown>[];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is Record<string, unknown> => item && typeof item === "object" && !Array.isArray(item)) : [];
  } catch {
    return [];
  }
}

function onboardingActionErrorMessage(item: unknown) {
  if (typeof item === "string") return item;
  if (item && typeof item === "object" && !Array.isArray(item)) {
    const row = item as Record<string, unknown>;
    return String(row.message ?? row.title ?? row.label ?? row.task_name ?? row.task_key ?? row.type ?? "Onboarding requirement is incomplete.");
  }
  return item == null ? "Onboarding requirement is incomplete." : String(item);
}

function dashboardDate(value: unknown) {
  return value ? String(value).slice(0, 10) : "";
}

function onboardingCaseIsClosed(row: Record<string, unknown>) {
  return ["ACTIVATED", "CANCELLED"].includes(String(row.onboarding_status ?? ""));
}

function taskIsComplete(task: Record<string, unknown>) {
  return ["COMPLETED", "WAIVED", "NOT_REQUIRED"].includes(String(task.task_status ?? task.status ?? ""));
}

function taskIsRequired(task: Record<string, unknown>) {
  return Number(task.is_required ?? task.required ?? 0) === 1;
}

function caseSetupStatus(tasks: Record<string, unknown>[], keys: string[]) {
  const relevant = tasks.filter((task) => keys.includes(String(task.task_key ?? "")));
  if (!relevant.length) return "NOT_REQUIRED";
  if (relevant.every(taskIsComplete)) return "COMPLETE";
  if (relevant.some((task) => String(task.task_status ?? task.status ?? "") === "BLOCKED")) return "BLOCKED";
  if (relevant.some(taskIsRequired)) return "MISSING";
  return "WARNING";
}

async function getOnboardingDashboardTasks(db: D1Database, caseIds: string[]) {
  if (!caseIds.length) return [] as Record<string, unknown>[];
  const placeholders = caseIds.map(() => "?").join(", ");
  const rows = await db
    .prepare(`SELECT * FROM employee_onboarding_tasks WHERE onboarding_case_id IN (${placeholders})`)
    .bind(...caseIds)
    .all<Record<string, unknown>>();
  return rows.results;
}

function buildOnboardingDashboardKpi(input: {
  id: string;
  title: string;
  value: number;
  description: string;
  tone: string;
  iconKey: string;
  query: OnboardingDashboardQuery;
  enabled?: boolean;
  permissionRequired?: string | null;
}) {
  return {
    id: input.id,
    title: input.title,
    value: input.value,
    description: input.description,
    tone: input.tone,
    icon_key: input.iconKey,
    route: "/onboarding/cases",
    query: input.query,
    enabled: input.enabled !== false,
    permission_required: input.permissionRequired ?? null
  };
}

function buildOnboardingDashboardBlocker(input: {
  id: string;
  title: string;
  count: number;
  explanation: string;
  query: OnboardingDashboardQuery;
  enabled?: boolean;
}) {
  return {
    id: input.id,
    title: input.title,
    count: input.count,
    explanation: input.explanation,
    route: "/onboarding/cases",
    query: input.query,
    enabled: input.enabled !== false
  };
}

export async function getOnboardingDashboardSummary(c: Context<AppBindings>) {
  const warnings: Array<{ group: string; message: string }> = [];
  const cases = await listOnboardingCases(c);
  const activeCases = cases.filter((row) => !onboardingCaseIsClosed(row));
  const today = new Date().toISOString().slice(0, 10);
  const current = new Date();
  const day = current.getUTCDay();
  const weekStartDate = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() - (day === 0 ? 6 : day - 1)));
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setUTCDate(weekStartDate.getUTCDate() + 6);
  const weekStart = weekStartDate.toISOString().slice(0, 10);
  const weekEnd = weekEndDate.toISOString().slice(0, 10);

  let moduleStatuses: Record<string, boolean> = {};
  let settings: Record<string, unknown> | null = null;
  let tasks: Record<string, unknown>[] = [];
  try {
    moduleStatuses = await getOnboardingWorkspaceModuleStatuses(c);
  } catch {
    warnings.push({ group: "enabled_modules", message: "Enabled module summary could not be loaded." });
  }
  try {
    settings = await ensureOnboardingSettings(c.env.DB);
  } catch {
    warnings.push({ group: "settings", message: "Onboarding settings summary could not be loaded." });
  }
  try {
    tasks = await getOnboardingDashboardTasks(c.env.DB, cases.map((row) => String(row.id)));
  } catch {
    warnings.push({ group: "tasks", message: "Task readiness summary could not be loaded." });
  }

  const tasksByCase = new Map<string, Record<string, unknown>[]>();
  for (const task of tasks) {
    const caseId = String(task.onboarding_case_id ?? "");
    if (!caseId) continue;
    const existing = tasksByCase.get(caseId) ?? [];
    existing.push(task);
    tasksByCase.set(caseId, existing);
  }

  const enrichedCases: OnboardingDashboardCase[] = cases.map((row): OnboardingDashboardCase => {
    const rowTasks = tasksByCase.get(String(row.id)) ?? [];
    const blockers = parseJsonArrayField(row.blockers_json);
    const blockerTypes = Array.from(new Set([
      ...blockers.map((blocker) => String(blocker.task_key ?? blocker.type ?? "SETUP").toUpperCase()),
      ...rowTasks.filter((task) => taskIsRequired(task) && !taskIsComplete(task)).map((task) => String(task.task_key ?? "SETUP").toUpperCase())
    ]));
    const setupStatuses = {
      employee_data: caseSetupStatus(rowTasks, ["personal_info", "contact_info", "job_assignment"]),
      documents: caseSetupStatus(rowTasks, ["documents"]),
      contract: caseSetupStatus(rowTasks, ["contract"]),
      payroll: caseSetupStatus(rowTasks, ["payroll_profile", "payment_method", "pension_profile"]),
      user_account: caseSetupStatus(rowTasks, ["user_access"]),
      approvals: caseSetupStatus(rowTasks, ["activation_approval"]),
      assets_uniforms: caseSetupStatus(rowTasks, ["assets_uniforms"])
    };
    const started = rowTasks.some((task) => !["NOT_STARTED", "PENDING"].includes(String(task.task_status ?? task.status ?? "")));
    const requiredMissing = rowTasks.some((task) => taskIsRequired(task) && !taskIsComplete(task));
    const ready = !onboardingCaseIsClosed(row) && (String(row.activation_status ?? "") === "READY" || String(row.onboarding_status ?? "") === "READY_FOR_APPROVAL") && !requiredMissing;
    return {
      ...row,
      blocker_types: blockerTypes,
      setup_statuses: setupStatuses,
      has_started_setup: started,
      ready_for_activation: ready,
      is_blocked: !onboardingCaseIsClosed(row) && (String(row.onboarding_status ?? "") === "BLOCKED" || requiredMissing || blockers.length > 0),
      is_overdue: !onboardingCaseIsClosed(row) && Boolean(row.due_date) && dashboardDate(row.due_date) < today,
      starting_this_week: Boolean(row.planned_start_date) && dashboardDate(row.planned_start_date) >= weekStart && dashboardDate(row.planned_start_date) <= weekEnd
    };
  });

  const countSetup = (key: string) => enrichedCases.filter((row) => activeCases.some((active) => String(active["id"]) === String(row["id"])) && (row.setup_statuses as Record<string, unknown>)?.[key] && !["COMPLETE", "NOT_REQUIRED"].includes(String((row.setup_statuses as Record<string, unknown>)[key]))).length;
  const hasContracts = moduleStatuses.contracts !== false && Number(settings?.require_contract_before_activation ?? 0) === 1 && hasAny(c, ["contracts.view", "employees.contracts.view", "onboarding.cases.view", "onboarding.dashboard.view"]);
  const hasPayroll = moduleStatuses.payroll !== false && Number(settings?.require_payroll_profile_before_activation ?? 1) === 1 && hasAny(c, ["payroll.view", "employees.payroll.view", "onboarding.cases.view", "onboarding.dashboard.view"]);
  const hasDocuments = moduleStatuses.document_compliance !== false && Number(settings?.require_documents_before_activation ?? 1) === 1 && hasAny(c, ["documents.view", "documents.checklist.view", "onboarding.cases.view", "onboarding.dashboard.view"]);
  const hasUserAccount = moduleStatuses.self_service !== false && Number(settings?.require_user_account_before_activation ?? 0) === 1 && hasAny(c, ["users.view", "self_service.manage_access", "onboarding.cases.view", "onboarding.dashboard.view"]);
  const hasApprovals = moduleStatuses.approvals !== false && Number(settings?.require_approval_before_activation ?? 0) === 1;
  const hasAssets = moduleStatuses.assets_uniforms !== false && Number(settings?.require_asset_uniform_issue_before_activation ?? 0) === 1 && hasAny(c, ["assets.view", "onboarding.cases.view", "onboarding.dashboard.view"]);

  const readyCount = enrichedCases.filter((row) => row.ready_for_activation).length;
  const blockedCount = enrichedCases.filter((row) => row.is_blocked).length;
  const draftCount = enrichedCases.filter((row) => !onboardingCaseIsClosed(row) && !row.has_started_setup).length;
  const inProgressCount = enrichedCases.filter((row) => !onboardingCaseIsClosed(row) && row.has_started_setup && !row.ready_for_activation && !row.is_blocked).length;
  const overdueCount = enrichedCases.filter((row) => row.is_overdue).length;
  const startingThisWeek = enrichedCases.filter((row) => row.starting_this_week).length;
  const pendingDocuments = hasDocuments ? countSetup("documents") : 0;
  const pendingContract = hasContracts ? countSetup("contract") : 0;
  const pendingUser = hasUserAccount ? countSetup("user_account") : 0;
  const pendingPayroll = hasPayroll ? countSetup("payroll") : 0;
  const pendingApprovals = hasApprovals ? countSetup("approvals") : 0;

  const kpis = [
    buildOnboardingDashboardKpi({ id: "total_active_cases", title: "Total Onboarding Cases", value: activeCases.length, description: "Active onboarding cases in your access scope.", tone: "info", iconKey: "users", query: { filter: "all" }, permissionRequired: "onboarding.dashboard.view" }),
    buildOnboardingDashboardKpi({ id: "draft_not_started_cases", title: "Draft / Not Started Cases", value: draftCount, description: "Cases created but not started.", tone: "neutral", iconKey: "circle", query: { filter: "draft" } }),
    buildOnboardingDashboardKpi({ id: "in_progress_cases", title: "In Progress Cases", value: inProgressCount, description: "Cases with setup activity underway.", tone: "info", iconKey: "progress", query: { filter: "in_progress" } }),
    buildOnboardingDashboardKpi({ id: "ready_for_activation", title: "Ready for Activation", value: readyCount, description: "All required readiness checks pass.", tone: "success", iconKey: "check", query: { filter: "ready" } }),
    buildOnboardingDashboardKpi({ id: "blocked_cases", title: "Blocked Cases", value: blockedCount, description: "Cases blocked by missing required setup.", tone: "danger", iconKey: "alert", query: { filter: "blocked" } }),
    buildOnboardingDashboardKpi({ id: "overdue_cases", title: "Overdue Cases", value: overdueCount, description: "Cases past expected onboarding due date.", tone: "warning", iconKey: "calendar", query: { filter: "overdue" } }),
    buildOnboardingDashboardKpi({ id: "starting_this_week", title: "Starting This Week", value: startingThisWeek, description: "Planned start dates in the current week.", tone: "info", iconKey: "calendar", query: { planned_start_from: weekStart, planned_start_to: weekEnd } }),
    buildOnboardingDashboardKpi({ id: "pending_documents", title: "Pending Documents", value: pendingDocuments, description: "Required documents missing or unresolved.", tone: "warning", iconKey: "documents", query: { blocker_type: "documents" }, enabled: hasDocuments, permissionRequired: "documents.view" }),
    buildOnboardingDashboardKpi({ id: "pending_contract_setup", title: "Pending Contract Setup", value: pendingContract, description: "Contract setup is required and incomplete.", tone: "warning", iconKey: "contract", query: { blocker_type: "contract" }, enabled: hasContracts, permissionRequired: "contracts.view" }),
    buildOnboardingDashboardKpi({ id: "pending_user_account_setup", title: "Pending User Account Setup", value: pendingUser, description: "Login provisioning/linking is required.", tone: "warning", iconKey: "user_account", query: { blocker_type: "user_account" }, enabled: hasUserAccount, permissionRequired: "users.view" }),
    buildOnboardingDashboardKpi({ id: "pending_payroll_setup", title: "Pending Payroll Setup", value: pendingPayroll, description: "Payroll, payment, or pension setup is incomplete.", tone: "warning", iconKey: "payroll", query: { blocker_type: "payroll" }, enabled: hasPayroll, permissionRequired: "payroll.view" }),
    buildOnboardingDashboardKpi({ id: "pending_approvals", title: "Pending Approvals", value: pendingApprovals, description: "Activation approval workflow is still pending.", tone: "warning", iconKey: "approval", query: { blocker_type: "approvals" }, enabled: hasApprovals, permissionRequired: "onboarding.activation.view" })
  ];

  const blockerSummary = [
    buildOnboardingDashboardBlocker({ id: "employee_data", title: "Missing required employee data", count: countSetup("employee_data"), explanation: "Core employee, contact, or job setup is incomplete.", query: { blocker_type: "employee_data" } }),
    buildOnboardingDashboardBlocker({ id: "invalid_org_mapping", title: "Invalid Department / Job Level / Position mapping", count: enrichedCases.filter((row) => !row["primary_department_id"] || !row["primary_position_id"] || !row["job_level_id"]).length, explanation: "Organization cascade data is missing or invalid.", query: { blocker_type: "organization" } }),
    buildOnboardingDashboardBlocker({ id: "documents", title: "Missing required documents", count: pendingDocuments, explanation: "Document compliance is required before activation.", query: { blocker_type: "documents" }, enabled: hasDocuments }),
    buildOnboardingDashboardBlocker({ id: "contract", title: "Pending contract setup", count: pendingContract, explanation: "Contract setup is required by policy.", query: { blocker_type: "contract" }, enabled: hasContracts }),
    buildOnboardingDashboardBlocker({ id: "payroll", title: "Pending payroll setup", count: pendingPayroll, explanation: "Payroll setup is required by policy.", query: { blocker_type: "payroll" }, enabled: hasPayroll }),
    buildOnboardingDashboardBlocker({ id: "user_account", title: "Pending user account setup", count: pendingUser, explanation: "Login access must be provisioned, linked, or reviewed.", query: { blocker_type: "user_account" }, enabled: hasUserAccount }),
    buildOnboardingDashboardBlocker({ id: "approvals", title: "Pending approvals", count: pendingApprovals, explanation: "Activation approval is required.", query: { blocker_type: "approvals" }, enabled: hasApprovals }),
    buildOnboardingDashboardBlocker({ id: "assets_uniforms", title: "Pending asset/uniform setup", count: hasAssets ? countSetup("assets_uniforms") : 0, explanation: "Required assets or uniforms are not issued/reviewed.", query: { blocker_type: "assets_uniforms" }, enabled: hasAssets }),
    buildOnboardingDashboardBlocker({ id: "policy_module", title: "Policy/module not available", count: warnings.length, explanation: "A configured onboarding summary group is unavailable.", query: { blocker_type: "policy" }, enabled: warnings.length > 0 }),
    buildOnboardingDashboardBlocker({ id: "owner_permission", title: "No permission / assigned owner issue", count: 0, explanation: "Cases assigned outside your permissions are hidden by backend scope.", query: { blocker_type: "permission" }, enabled: true })
  ].filter((item) => item.enabled && (item.count > 0 || ["employee_data", "owner_permission"].includes(item.id)));

  const priorityActions = [
    { id: "complete_blocked_cases", title: "Complete blocked cases", description: "Work through cases with unresolved blockers.", query: { filter: "blocked" }, tone: "danger", enabled: blockedCount > 0 },
    { id: "review_ready_activation", title: "Review cases ready for activation", description: "Activate employees whose setup is complete.", query: { filter: "ready" }, tone: "success", enabled: readyCount > 0 },
    { id: "upload_missing_documents", title: "Upload missing documents", description: "Resolve document blockers.", query: { blocker_type: "documents" }, tone: "warning", enabled: hasDocuments && pendingDocuments > 0 },
    { id: "complete_contract_setup", title: "Complete contract setup", description: "Create or activate missing contracts.", query: { blocker_type: "contract" }, tone: "warning", enabled: hasContracts && pendingContract > 0 },
    { id: "complete_user_account_setup", title: "Complete user account setup", description: "Provision or link login accounts.", query: { blocker_type: "user_account" }, tone: "warning", enabled: hasUserAccount && pendingUser > 0 },
    { id: "complete_payroll_setup", title: "Complete payroll setup", description: "Finish payroll profile and payment setup.", query: { blocker_type: "payroll" }, tone: "warning", enabled: hasPayroll && pendingPayroll > 0 },
    { id: "review_overdue_cases", title: "Review overdue cases", description: "Clear onboarding cases past their due date.", query: { filter: "overdue" }, tone: "warning", enabled: overdueCount > 0 },
    { id: "activate_ready_employees", title: "Activate ready employees", description: "Open ready cases and complete activation.", query: { filter: "ready" }, tone: "success", enabled: readyCount > 0 }
  ].filter((item) => item.enabled);

  return {
    kpis,
    blocker_summary: blockerSummary,
    readiness_summary: {
      total_active: activeCases.length,
      draft_not_started: draftCount,
      in_progress: inProgressCount,
      blocked: blockedCount,
      ready_for_activation: readyCount,
      activated: cases.filter((row) => row.onboarding_status === "ACTIVATED").length,
      cancelled: cases.filter((row) => row.onboarding_status === "CANCELLED").length
    },
    upcoming_starts: { count: startingThisWeek, from: weekStart, to: weekEnd },
    overdue_summary: { count: overdueCount, today },
    enabled_modules: moduleStatuses,
    permissions: {
      documents: hasDocuments,
      contracts: hasContracts,
      payroll: hasPayroll,
      user_account: hasUserAccount,
      approvals: hasApprovals,
      assets_uniforms: hasAssets
    },
    priority_actions: priorityActions,
    warnings,
    rows: enrichedCases.slice(0, 50),
    cases: enrichedCases
  };
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
onboardingRoutes.use("*", requireOperationalModuleMiddleware("onboarding", "Onboarding"));
onboardingRoutes.get("/cases", requireAnyPermission(["onboarding.cases.view", "onboarding.cases.manage", "employees.view"]), async (c) => ok(c, { cases: await listOnboardingCases(c) }));
onboardingRoutes.get("/dashboard-summary", requireAnyPermission(["onboarding.dashboard.view", "onboarding.cases.view", "dashboard.view"]), async (c) => {
  try {
    return ok(c, { summary: await getOnboardingDashboardSummary(c) });
  } catch (error) {
    console.warn("Onboarding dashboard summary failed", error);
    return fail(c, 500, "ONBOARDING_DASHBOARD_SUMMARY_FAILED", "Onboarding dashboard summary could not be loaded.");
  }
});
onboardingRoutes.get("/dashboard", requireAnyPermission(["onboarding.dashboard.view", "onboarding.cases.view", "dashboard.view"]), async (c) => {
  const summary = await getOnboardingDashboardSummary(c);
  const cases = summary.cases as Record<string, unknown>[];
  return ok(c, {
    dashboard: {
      total_cases: cases.length,
      blocked_onboarding: cases.filter((row) => row.onboarding_status === "BLOCKED").length,
      ready_for_approval: cases.filter((row) => row.onboarding_status === "READY_FOR_APPROVAL").length,
      pending_documents: cases.filter((row) => row.onboarding_status === "WAITING_FOR_DOCUMENTS").length,
      activated_this_month: cases.filter((row) => row.activated_at && String(row.activated_at).slice(0, 7) === new Date().toISOString().slice(0, 7)).length,
      overdue_tasks: cases.filter((row) => row.due_date && String(row.due_date) < new Date().toISOString().slice(0, 10)).length,
      ...summary,
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
  const profilePaymentMethod = (optionalText(body.payment_method) ?? "CASH").toUpperCase();
  const normalizedProfilePaymentMethod = ["CASH", "BANK_TRANSFER", "CHEQUE", "OTHER"].includes(profilePaymentMethod) ? profilePaymentMethod : "CASH";
  const profileStoresBankDetails = normalizedProfilePaymentMethod === "BANK_TRANSFER";
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
  ).bind(profileId, employeeId, salary, optionalText(body.currency) ?? "MVR", normalizedProfilePaymentMethod, profileStoresBankDetails ? optionalText(body.bank_name) : null, profileStoresBankDetails ? optionalText(body.bank_account_no) : null, profileStoresBankDetails ? optionalText(body.bank_account_name) : null, asSqlBool(body.payroll_included ?? true), asSqlBool(body.overtime_eligible), asSqlBool(body.benefits_eligible), asSqlBool(body.advance_eligible), asSqlBool(body.missed_day_deduction_enabled ?? true), asSqlBool(body.leave_deduction_enabled ?? true), optionalText(body.daily_rate_mode) ?? "FIXED_30_DAYS", optionalText(body.effective_from) ?? new Date().toISOString().slice(0, 10)).run();
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
  const methodType = normalizeDetailedPaymentMethodType(body.payment_method_type);
  if (!["BANK_TRANSFER", "CASH", "CHEQUE_PLACEHOLDER", "MOBILE_WALLET_PLACEHOLDER", "OTHER"].includes(methodType)) return fail(c, 400, "PAYMENT_METHOD_INVALID", "A valid payment method type is required.");
  const bankTransfer = methodType === "BANK_TRANSFER";
  const institutionId = bankTransfer ? optionalText(body.payment_institution_id) : null;
  const institution = bankTransfer ? await getActiveBankPaymentInstitution(c.env.DB, institutionId) : null;
  if (bankTransfer && !institution) return fail(c, 400, "PAYMENT_INSTITUTION_INVALID", "Bank transfer requires an active bank institution.");
  const accountName = bankTransfer ? optionalText(body.bank_account_name) : null;
  const accountNumber = bankTransfer ? optionalText(body.bank_account_number) : null;
  if (bankTransfer && (!accountName || !accountNumber)) return fail(c, 400, "PAYMENT_METHOD_INVALID", "Bank transfer requires bank, account name, and account number.");
  await c.env.DB.prepare("UPDATE employee_payment_methods SET is_primary = 0 WHERE employee_id = ? AND status = 'ACTIVE'").bind(employeeId).run();
  const methodId = id("employee_payment_method");
  await c.env.DB.prepare(
    `INSERT INTO employee_payment_methods
     (id, employee_id, payment_method_type, payment_institution_id, bank_name_snapshot, bank_account_name,
      bank_account_number_encrypted_or_plain_placeholder, bank_account_number_masked, is_primary, allocation_type,
      allocation_percentage, allocation_amount, currency, effective_date, notes, created_by_user_id, updated_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(methodId, employeeId, methodType, institutionId, institution ? `${String(institution.code)} - ${String(institution.name)}` : null, accountName, accountNumber, maskAccount(accountNumber), optionalText(body.allocation_type) ?? "FULL", numberOrNull(body.allocation_percentage), numberOrNull(body.allocation_amount), optionalText(body.currency) ?? "MVR", optionalText(body.effective_date) ?? new Date().toISOString().slice(0, 10), optionalText(body.notes), c.get("currentUser").id, c.get("currentUser").id).run();
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

onboardingRoutes.post("/cases/:caseId/user-account", requireAnyPermission(["onboarding.workspace.user_access.update", "users.create", "users.update", "users.link_employee", "users.assign_roles", "users.assign_scopes", "role_mappings.apply", "onboarding.cases.manage"]), async (c) => {
  const gate = await getCaseEmployee(c, "ONBOARDING", c.req.param("caseId"), "manage");
  if (!gate) return fail(c, 404, "ONBOARDING_CASE_NOT_FOUND", "Onboarding case was not found.");
  const body = await readBody(c);
  const action = optionalText(body.action) ?? (asBool(body.not_required) ? "not_required" : asBool(body.deferred) ? "defer" : gate.employee.user_id ? "complete_existing" : "defer");
  const employeeId = String(gate.row.employee_id);
  if (action === "defer" || action === "not_required") {
    const reason = optionalText(body.reason);
    if (!reason) return fail(c, 400, "USER_ACCOUNT_REASON_REQUIRED", "Reason is required to defer or mark user account setup not required.");
    await setOnboardingTaskState(c, c.req.param("caseId"), "user_access", action === "not_required" ? "NOT_REQUIRED" : "IN_PROGRESS", reason);
    await auditLifecycle(c, "onboarding.workspace.user_access_saved", "employee", employeeId, null, { action, reason }, reason);
    return ok(c, { workspace: await loadOnboardingWorkspace(c, c.req.param("caseId")) });
  }

  if (action === "link_existing") {
    const userId = optionalText(body.user_id);
    if (!userId) return fail(c, 400, "USER_REQUIRED", "Select a user account to link.");
    const targetUser = await getUserById(c.env.DB, userId);
    if (!targetUser) return fail(c, 404, "USER_NOT_FOUND", "Selected user account was not found.");
    if (targetUser.employee_id && targetUser.employee_id !== employeeId) return fail(c, 409, "USER_ALREADY_LINKED", "This user is already linked to another employee.");
    if (gate.employee.user_id && gate.employee.user_id !== targetUser.id && !asBool(body.replace_existing)) return fail(c, 409, "EMPLOYEE_ALREADY_LINKED", "This employee already has a linked user account.");
    const roleIds = arrayOfStrings(body.role_ids);
    const roleError = await validateLifecycleRoleAssignments(c, targetUser, roleIds);
    if (roleError) return roleError;
    const preparedScopes = await prepareLifecycleAccessScopes(c, body);
    if (preparedScopes.error) return preparedScopes.error;
    const now = nowIso();
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE employees SET user_id = ?, updated_at = ? WHERE id = ?").bind(targetUser.id, now, employeeId),
      c.env.DB.prepare("UPDATE users SET employee_id = ?, updated_at = ? WHERE id = ?").bind(employeeId, now, targetUser.id),
      ...(gate.employee.user_id && gate.employee.user_id !== targetUser.id ? [c.env.DB.prepare("UPDATE users SET employee_id = NULL, updated_at = ? WHERE id = ?").bind(now, String(gate.employee.user_id))] : [])
    ]);
    if (roleIds.length) {
      const assignError = await assignLifecycleRoles(c, targetUser, roleIds);
      if (assignError) return assignError;
    }
    if (asBool(body.self_service_enabled)) await ensureLifecycleSelfOnlyScope(c.env.DB, targetUser.id, c.get("currentUser").id);
    await applyLifecycleAccessScopes(c, targetUser.id, preparedScopes.scopes);
    const employeeEmail = await lifecycleEmployeeEmailSuggestion(c.env.DB, gate.employee);
    await upsertLifecycleUserAccountLink(c, { employeeId, userId: targetUser.id, selfServiceEnabled: asBool(body.self_service_enabled), inviteStatus: "PASSWORD_SET", resetRequired: false, employeeEmailUsed: employeeEmail.email, accountEmailCreated: targetUser.email, emailSource: "linked_existing_user" });
    await setOnboardingTaskState(c, c.req.param("caseId"), "user_access", "COMPLETED", "Linked existing user account from onboarding workspace.");
    await auditLifecycle(c, "onboarding.workspace.user_account_linked", "employee", employeeId, { user_id: gate.employee.user_id ?? null }, { user_id: targetUser.id, role_ids: roleIds, access_scope_ids: arrayOfStrings(body.access_scope_ids) }, optionalText(body.reason));
    return ok(c, { workspace: await loadOnboardingWorkspace(c, c.req.param("caseId")) });
  }

  if (action === "provision_new") {
    if (!hasAny(c, ["users.create", "employee.user_account.manage", "onboarding.workspace.user_access.update", "onboarding.cases.manage"])) return fail(c, 403, "USER_PROVISION_DENIED", "You do not have permission to provision user accounts.");
    if (gate.employee.user_id && !asBool(body.replace_existing)) return fail(c, 409, "EMPLOYEE_ALREADY_LINKED", "This employee already has a linked user account.");
    const employeeEmail = await lifecycleEmployeeEmailSuggestion(c.env.DB, gate.employee);
    const requestedEmail = normalizeEmail(body.email);
    const email = requestedEmail || employeeEmail.email || "";
    if (!email) return fail(c, 400, "EMAIL_REQUIRED", employeeEmail.message);
    if (!isEmail(email)) return fail(c, 400, "VALIDATION_ERROR", "A valid email address is required.");
    const existingEmail = await getUserByEmail(c.env.DB, email);
    if (existingEmail) {
      if (!existingEmail.employee_id) return fail(c, 409, "EMAIL_EXISTS_LINK_EXISTING", "A standalone user already uses this employee email. Link the existing user instead.");
      if (existingEmail.employee_id === employeeId || gate.employee.user_id === existingEmail.id) return fail(c, 409, "EMAIL_ALREADY_LINKED_TO_EMPLOYEE", "This employee email already belongs to the linked user account.");
      return fail(c, 409, "EMAIL_LINKED_TO_ANOTHER_EMPLOYEE", "This employee email is already linked to another employee.");
    }
    const name = optionalText(body.name) ?? String(gate.employee.display_name ?? gate.employee.full_name ?? "");
    if (!name) return fail(c, 400, "USER_NAME_REQUIRED", "User name is required.");
    const username = optionalText(body.username) ?? await lifecycleUniqueUsernameSuggestion(c.env.DB, gate.employee, email);
    const existingUsername = username ? await c.env.DB.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE").bind(username).first<{ id: string }>() : null;
    if (existingUsername) return fail(c, 409, "USERNAME_EXISTS", "A user with this username already exists.");
    const password = readString(body.password);
    const generatedPassword = password || `${crypto.randomUUID()}Aa1!`;
    if (!isStrongPassword(generatedPassword)) return fail(c, 400, "VALIDATION_ERROR", "Password must be at least 12 characters and include letters and numbers.");
    const status = typeof body.status === "string" && ["ACTIVE", "DISABLED", "LOCKED"].includes(body.status) ? body.status as UserStatus : "ACTIVE";
    const selfServiceEnabled = asBool(body.self_service_enabled, true);
    let roleIds = arrayOfStrings(body.role_ids);
    if (selfServiceEnabled && roleIds.length === 0) {
      const role = await c.env.DB.prepare("SELECT id FROM roles WHERE name = 'Employee Self-Service' AND is_active = 1 LIMIT 1").first<{ id: string }>();
      if (role) roleIds = [role.id];
    }
    const roleError = await validateLifecycleRoleAssignments(c, null, roleIds);
    if (roleError) return roleError;
    const preparedScopes = await prepareLifecycleAccessScopes(c, body);
    if (preparedScopes.error) return preparedScopes.error;
    const userId = crypto.randomUUID();
    const now = nowIso();
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO users (id, name, email, username, password_hash, status, is_owner, employee_id) VALUES (?, ?, ?, ?, ?, ?, 0, ?)").bind(userId, name, email, username || null, await hashPassword(generatedPassword), status, employeeId),
      c.env.DB.prepare("UPDATE employees SET user_id = ?, updated_at = ? WHERE id = ?").bind(userId, now, employeeId),
      ...(gate.employee.user_id ? [c.env.DB.prepare("UPDATE users SET employee_id = NULL, updated_at = ? WHERE id = ?").bind(now, String(gate.employee.user_id))] : [])
    ]);
    const created = await getUserById(c.env.DB, userId);
    if (created && roleIds.length) {
      const assignError = await assignLifecycleRoles(c, created, roleIds);
      if (assignError) return assignError;
    }
    if (selfServiceEnabled) await ensureLifecycleSelfOnlyScope(c.env.DB, userId, c.get("currentUser").id);
    await applyLifecycleAccessScopes(c, userId, preparedScopes.scopes);
    const inviteStatus = password ? "PASSWORD_SET" : "INVITE_RESET_PENDING";
    await upsertLifecycleUserAccountLink(c, {
      employeeId,
      userId,
      selfServiceEnabled,
      inviteStatus,
      resetRequired: !password || asBool(body.reset_required, Boolean(password)),
      employeeEmailUsed: employeeEmail.email,
      accountEmailCreated: email,
      emailSource: requestedEmail ? (requestedEmail === employeeEmail.email ? "employee_email_prefilled" : "manual_override") : "employee_email_fallback",
      emailOverrideReason: requestedEmail && requestedEmail !== employeeEmail.email ? optionalText(body.email_override_reason ?? body.reason) : null
    });
    await setOnboardingTaskState(c, c.req.param("caseId"), "user_access", "COMPLETED", "Provisioned linked user account from onboarding workspace.");
    await auditLifecycle(c, "onboarding.workspace.user_account_provisioned", "employee", employeeId, { user_id: gate.employee.user_id ?? null }, { user_id: userId, employee_email_used: employeeEmail.email, account_email_created: email, invite_status: inviteStatus, reset_required: !password || asBool(body.reset_required, Boolean(password)), role_ids: roleIds, access_scope_ids: arrayOfStrings(body.access_scope_ids) }, optionalText(body.reason));
    return ok(c, { workspace: await loadOnboardingWorkspace(c, c.req.param("caseId")) }, 201);
  }

  if (gate.employee.user_id) {
    await setOnboardingTaskState(c, c.req.param("caseId"), "user_access", "COMPLETED", "Employee already has a linked user account.");
    await auditLifecycle(c, "onboarding.workspace.user_access_saved", "employee", employeeId, null, { action: "complete_existing", user_id: gate.employee.user_id });
    return ok(c, { workspace: await loadOnboardingWorkspace(c, c.req.param("caseId")) });
  }
  return fail(c, 400, "USER_ACCOUNT_ACTION_INVALID", "Choose provision, link existing, defer, or not required.");
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
  if ("blocked" in result) {
    return c.json({
      ok: false,
      error: {
        code: "EMPLOYEE_ACTIVATION_NOT_READY",
        message: "Employee activation is blocked by onboarding requirements.",
        fields: { activation: "Complete all required onboarding setup before activating this employee." },
        action_errors: (result.readiness?.blocking_items ?? result.readiness?.blockers ?? []).map((item: unknown) => onboardingActionErrorMessage(item)),
        readiness: result.readiness
      }
    }, 409);
  }
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
offboardingRoutes.use("*", requireOperationalModuleMiddleware("offboarding", "Offboarding"));
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
  const result = await finalizeEmployeeExitWithOverride(c, c.req.param("caseId"), reason);
  if (!result) return fail(c, 404, "OFFBOARDING_CASE_NOT_FOUND", "Offboarding case was not found.");
  if ("blocked" in result) return fail(c, 409, "EMPLOYEE_EXIT_ACCESS_BLOCKED", "Protected user access prevents automatic exit finalization.");
  return ok(c, result);
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
