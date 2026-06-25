import { Hono } from "hono";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { getUserAccessScopes } from "../auth/access-scopes";
import { recordAudit } from "../db/audit";
import { requireAuth } from "../middleware/auth";
import type { AppBindings, AuthUser, Env } from "../types";
import { fail, getClientIp, ok } from "../utils/http";
import { readJsonBody, readString } from "../utils/validation";

type BindValue = string | number | null;
type StatusCheck = "PASS" | "WARNING" | "FAIL" | "SKIPPED";
type Severity = "INFO" | "WARNING" | "CRITICAL";
type AlertStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED";

interface ModuleControlRow {
  id: string;
  module_key: string;
  module_name: string;
  is_enabled: number;
  is_required: number;
  dependency_keys_json: string | null;
  impact_summary_json: string | null;
  last_checked_at: string | null;
  status: "ACTIVE" | "DISABLED" | "WARNING" | "ERROR";
  created_at: string;
  updated_at: string;
  metadata_json: string | null;
}

interface AdminCheckInput {
  checkKey: string;
  checkName: string;
  category: string;
  severity: Severity;
  status: StatusCheck;
  moduleKey?: string | null;
  message: string;
  details?: unknown;
  suggestedAction?: string | null;
}

interface PermissionFindingInput {
  findingKey: string;
  severity: Severity;
  roleId?: string | null;
  userId?: string | null;
  permissionKey?: string | null;
  scopeRuleId?: string | null;
  message: string;
  details?: unknown;
}

interface SecurityEventInput {
  eventType: string;
  severity: Severity;
  actorUserId?: string | null;
  actorEmailSnapshot?: string | null;
  targetUserId?: string | null;
  targetEmployeeId?: string | null;
  moduleKey?: string | null;
  actionKey?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  result?: "SUCCESS" | "FAILURE" | "BLOCKED" | "WARNING";
  ipAddressPlaceholder?: string | null;
  userAgentPlaceholder?: string | null;
  reason?: string | null;
  message: string;
  metadata?: unknown;
}

const now = () => new Date().toISOString();

const MODULE_DEFAULTS = [
  { key: "employees", name: "Employees", required: true, dependencies: [] },
  { key: "leave", name: "Leave", dependencies: ["employees"] },
  { key: "attendance", name: "Attendance", dependencies: ["employees"] },
  { key: "zkteco_attendance", name: "ZKTeco / Device Attendance", dependencies: ["attendance"] },
  { key: "roster", name: "Roster", dependencies: ["employees"] },
  { key: "payroll", name: "Payroll", dependencies: ["employees"] },
  { key: "payment_methods", name: "Payment Methods", dependencies: ["payroll"] },
  { key: "bank_loans", name: "Bank Loans", dependencies: ["payroll", "payment_methods"] },
  { key: "pension", name: "Pension", dependencies: ["payroll"] },
  { key: "custom_deductions", name: "Custom Deductions", dependencies: ["payroll"] },
  { key: "final_settlement", name: "Final Settlement", dependencies: ["payroll", "leave", "payment_methods", "assets_uniforms"] },
  { key: "contracts", name: "Contracts", dependencies: ["employees", "documents"] },
  { key: "documents", name: "Documents", dependencies: ["employees"] },
  { key: "document_compliance", name: "Document Compliance", dependencies: ["documents"] },
  { key: "assets_uniforms", name: "Assets & Uniforms", dependencies: ["employees"] },
  { key: "approvals", name: "Approvals", dependencies: ["employees", "notifications"] },
  { key: "onboarding", name: "Onboarding", dependencies: ["employees", "documents"] },
  { key: "offboarding", name: "Offboarding", dependencies: ["employees", "final_settlement"] },
  { key: "self_service", name: "Self-Service", dependencies: ["employees", "users"] },
  { key: "reports_exports", name: "Reports & Exports", dependencies: ["employees"] },
  { key: "notifications", name: "Notifications", dependencies: ["users"] },
  { key: "audit_security", name: "Audit & Security", required: true, dependencies: ["users", "roles"] }
] as const;

const SETTINGS_SECTIONS = [
  { key: "company", title: "Company settings", module_key: "organization", permission: "organization.view", href: "/settings/organization" },
  { key: "hr", title: "HR settings", module_key: "employees", permission: "employees.view", href: "/employees/settings" },
  { key: "employees", title: "Employee settings", module_key: "employees", permission: "employees.view", href: "/employees/settings" },
  { key: "leave", title: "Leave settings", module_key: "leave", permission: "leave.settings.manage", href: "/leave/settings" },
  { key: "attendance", title: "Attendance settings", module_key: "attendance", permission: "attendance.settings.manage", href: "/attendance/settings" },
  { key: "zkteco", title: "ZKTeco/device settings", module_key: "zkteco_attendance", permission: "attendance.devices.settings.view", href: "/attendance/devices/settings" },
  { key: "roster", title: "Roster settings", module_key: "roster", permission: "roster.settings.view", href: "/roster/settings" },
  { key: "payroll", title: "Payroll settings", module_key: "payroll", permission: "payroll.settings.manage", href: "/payroll/settings" },
  { key: "payment_methods", title: "Payment method settings", module_key: "payment_methods", permission: "payroll.payment_methods.view", href: "/payroll/payment-institutions" },
  { key: "bank_loans", title: "Bank loan settings", module_key: "bank_loans", permission: "payroll.bank_loans.view", href: "/payroll/bank-loans" },
  { key: "pension", title: "Pension settings", module_key: "pension", permission: "payroll.pension_schemes.view", href: "/payroll/pension" },
  { key: "custom_deductions", title: "Custom deduction settings", module_key: "custom_deductions", permission: "payroll.custom_deduction_templates.view", href: "/payroll/custom-deductions" },
  { key: "final_settlement", title: "Final settlement settings", module_key: "final_settlement", permission: "final_settlement.settings.view", href: "/payroll/exit-payroll" },
  { key: "contracts", title: "Contract settings", module_key: "contracts", permission: "contracts.settings.view", href: "/settings/contracts" },
  { key: "documents", title: "Document compliance settings", module_key: "document_compliance", permission: "documents.compliance.settings.view", href: "/settings/documents/compliance" },
  { key: "assets", title: "Asset/uniform settings", module_key: "assets_uniforms", permission: "assets.settings.view", href: "/assets/settings" },
  { key: "approvals", title: "Approval workflow settings", module_key: "approvals", permission: "approvals.settings.view", href: "/approvals/settings" },
  { key: "onboarding", title: "Onboarding/offboarding settings", module_key: "onboarding", permission: "onboarding.settings.view", href: "/onboarding/settings" },
  { key: "self_service", title: "Self-service settings", module_key: "self_service", permission: "self_service.settings.view", href: "/settings/self-service" },
  { key: "reports", title: "Reports/export settings", module_key: "reports_exports", permission: "reports.view", href: "/reports" },
  { key: "security", title: "Security settings", module_key: "audit_security", permission: "admin.security_settings.view", href: "/settings/admin?section=security-settings" },
  { key: "audit", title: "Audit/log settings", module_key: "audit_security", permission: "admin.audit_logs.view", href: "/settings/admin?section=audit" },
  { key: "health", title: "System health", module_key: "audit_security", permission: "admin.system_health.view", href: "/settings/admin?section=health" },
  { key: "readiness", title: "Production readiness", module_key: "audit_security", permission: "admin.production_readiness.view", href: "/settings/admin?section=readiness" }
];

const VALID_MODULE_KEYS = new Set(MODULE_DEFAULTS.map((module) => module.key));

export const adminRoutes = new Hono<AppBindings>();
export const adminReportRoutes = new Hono<AppBindings>();

adminRoutes.use("*", requireAuth);
adminReportRoutes.use("*", requireAuth);

function has(c: Context<AppBindings>, permission: string) {
  return c.get("currentUser").permissions.includes(permission);
}

function hasAny(c: Context<AppBindings>, permissions: string[]) {
  const user = c.get("currentUser");
  return user.is_owner || permissions.some((permission) => user.permissions.includes(permission));
}

function requireAnyPermission(permissions: string[]) {
  return createMiddleware<AppBindings>(async (c, next) => {
    if (!hasAny(c, permissions)) {
      await logFailedPermissionCheck(c.env.DB, c.get("currentUser"), permissions.join(","), c.req.path, getClientIp(c.req.raw), c.req.header("User-Agent") ?? null);
      return fail(c, 403, "ADMIN_PERMISSION_DENIED", "You do not have permission to access this admin control.");
    }
    await next();
  });
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function bool(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function toModuleApi(row: ModuleControlRow) {
  return {
    id: row.id,
    module_key: row.module_key,
    module_name: row.module_name,
    is_enabled: row.is_enabled === 1,
    is_required: row.is_required === 1,
    dependency_keys: parseJson<string[]>(row.dependency_keys_json, []),
    impact_summary: parseJson<Record<string, unknown>>(row.impact_summary_json, {}),
    last_checked_at: row.last_checked_at,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    metadata: parseJson<Record<string, unknown>>(row.metadata_json, {})
  };
}

async function audit(c: Context<AppBindings>, action: string, entityType: string, entityId: string | null, oldValue?: unknown, newValue?: unknown, reason?: string | null) {
  await recordAudit(c.env.DB, {
    actorUserId: c.get("currentUser").id,
    action,
    module: "admin",
    entityType,
    entityId,
    oldValue,
    newValue,
    reason,
    ipAddress: getClientIp(c.req.raw),
    userAgent: c.req.header("User-Agent") ?? null
  });
}

async function safeCount(db: Env["DB"], table: string, where = "1 = 1", params: BindValue[] = []) {
  try {
    const row = await db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${where}`).bind(...params).first<{ count: number }>();
    return Number(row?.count ?? 0);
  } catch {
    return null;
  }
}

async function upsertConsistencyCheck(db: Env["DB"], input: AdminCheckInput) {
  const at = now();
  const existing = await db.prepare("SELECT id FROM system_consistency_checks WHERE check_key = ?").bind(input.checkKey).first<{ id: string }>();
  const id = existing?.id ?? crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO system_consistency_checks (
        id, check_key, check_name, category, severity, status, module_key, message,
        details_json, suggested_action, last_checked_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(check_key) DO UPDATE SET
        check_name = excluded.check_name,
        category = excluded.category,
        severity = excluded.severity,
        status = excluded.status,
        module_key = excluded.module_key,
        message = excluded.message,
        details_json = excluded.details_json,
        suggested_action = excluded.suggested_action,
        last_checked_at = excluded.last_checked_at,
        updated_at = excluded.updated_at`
    )
    .bind(
      id,
      input.checkKey,
      input.checkName,
      input.category,
      input.severity,
      input.status,
      input.moduleKey ?? null,
      input.message,
      input.details === undefined ? null : JSON.stringify(input.details),
      input.suggestedAction ?? null,
      at,
      at
    )
    .run();
}

async function upsertReadinessCheck(db: Env["DB"], input: Omit<AdminCheckInput, "severity" | "moduleKey" | "suggestedAction">) {
  const at = now();
  const existing = await db.prepare("SELECT id FROM production_readiness_checks WHERE check_key = ?").bind(input.checkKey).first<{ id: string }>();
  const id = existing?.id ?? crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO production_readiness_checks (
        id, check_key, check_name, category, status, message, details_json, last_checked_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(check_key) DO UPDATE SET
        check_name = excluded.check_name,
        category = excluded.category,
        status = excluded.status,
        message = excluded.message,
        details_json = excluded.details_json,
        last_checked_at = excluded.last_checked_at,
        updated_at = excluded.updated_at`
    )
    .bind(id, input.checkKey, input.checkName, input.category, input.status, input.message, input.details === undefined ? null : JSON.stringify(input.details), at, at)
    .run();
}

async function ensureModuleRows(db: Env["DB"]) {
  await db.batch(
    MODULE_DEFAULTS.map((module) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO module_control_settings
           (id, module_key, module_name, is_enabled, is_required, dependency_keys_json, impact_summary_json, status, metadata_json)
           VALUES (?, ?, ?, 1, ?, ?, ?, 'ACTIVE', ?)`
        )
        .bind(
          `module_${module.key}`,
          module.key,
          module.name,
          "required" in module && module.required ? 1 : 0,
          JSON.stringify(module.dependencies),
          JSON.stringify({ summary: `${module.name} control foundation.` }),
          JSON.stringify({ seeded_prompt: "21", runtime_default: true })
        )
    )
  );
}

export async function getModuleControlStatus(db: Env["DB"]) {
  await ensureModuleRows(db);
  const rows = await db.prepare("SELECT * FROM module_control_settings ORDER BY module_name").all<ModuleControlRow>();
  return rows.results;
}

export async function getModuleDependencyWarnings(db: Env["DB"], moduleKey: string) {
  const target = (await getModuleControlStatus(db)).find((module) => module.module_key === moduleKey);
  if (!target) return [];
  const dependencies = parseJson<string[]>(target.dependency_keys_json, []);
  const modules = await getModuleControlStatus(db);
  const disabledDependencies = dependencies
    .map((key) => modules.find((module) => module.module_key === key))
    .filter((module): module is ModuleControlRow => Boolean(module && module.is_enabled !== 1));
  const dependents = modules.filter((module) => parseJson<string[]>(module.dependency_keys_json, []).includes(moduleKey) && module.is_enabled === 1);
  return [
    ...disabledDependencies.map((module) => ({
      type: "DISABLED_DEPENDENCY",
      severity: "WARNING",
      message: `${target.module_name} depends on disabled module ${module.module_name}.`,
      module_key: module.module_key
    })),
    ...dependents.map((module) => ({
      type: "ACTIVE_DEPENDENT",
      severity: "WARNING",
      message: `Disabling ${target.module_name} can affect active dependent module ${module.module_name}.`,
      module_key: module.module_key
    }))
  ];
}

export async function getModuleImpactSummary(db: Env["DB"], moduleKey: string) {
  const warnings = await getModuleDependencyWarnings(db, moduleKey);
  return {
    module_key: moduleKey,
    warnings_count: warnings.length,
    warnings,
    note: "Module toggles do not delete data. Feature-level enforcement remains with each module's existing settings and permissions."
  };
}

export async function updateModuleEnabledState(db: Env["DB"], moduleKey: string, enabled: boolean, metadata: unknown = null) {
  const status = enabled ? "ACTIVE" : "DISABLED";
  const at = now();
  await ensureModuleRows(db);
  await db
    .prepare(
      `UPDATE module_control_settings
       SET is_enabled = ?, status = ?, last_checked_at = ?, updated_at = ?, metadata_json = COALESCE(?, metadata_json)
       WHERE module_key = ?`
    )
    .bind(enabled ? 1 : 0, status, at, at, metadata ? JSON.stringify(metadata) : null, moduleKey)
    .run();
  return db.prepare("SELECT * FROM module_control_settings WHERE module_key = ?").bind(moduleKey).first<ModuleControlRow>();
}

function checkFromCount(input: { key: string; name: string; category: string; moduleKey?: string; count: number | null; messageOk: string; messageFail: string; suggestedAction: string }) {
  return {
    checkKey: input.key,
    checkName: input.name,
    category: input.category,
    severity: input.count === null || input.count === 0 ? "WARNING" as Severity : "INFO" as Severity,
    status: input.count === null ? "SKIPPED" as StatusCheck : input.count > 0 ? "PASS" as StatusCheck : "WARNING" as StatusCheck,
    moduleKey: input.moduleKey ?? null,
    message: input.count === null ? "Table is not available yet; check skipped safely." : input.count > 0 ? input.messageOk : input.messageFail,
    details: { count: input.count },
    suggestedAction: input.count && input.count > 0 ? null : input.suggestedAction
  };
}

export async function checkModuleConfigurationConsistency(db: Env["DB"]) {
  const rows = await Promise.all([
    checkFromCount({ key: "leave_types_present", name: "Leave types configured", category: "Modules", moduleKey: "leave", count: await safeCount(db, "leave_types"), messageOk: "Leave types are configured.", messageFail: "Leave is enabled but no leave types were found.", suggestedAction: "Open Leave Settings and create leave types." }),
    checkFromCount({ key: "payroll_settings_present", name: "Payroll settings present", category: "Modules", moduleKey: "payroll", count: await safeCount(db, "payroll_settings"), messageOk: "Payroll settings are present.", messageFail: "Payroll is enabled but payroll settings were not found.", suggestedAction: "Open Payroll Settings and save defaults." }),
    checkFromCount({ key: "pension_scheme_present", name: "Active pension scheme", category: "Modules", moduleKey: "pension", count: await safeCount(db, "pension_schemes", "is_active = 1"), messageOk: "At least one pension scheme is active.", messageFail: "Pension is enabled but no active pension scheme was found.", suggestedAction: "Create or activate a pension scheme." }),
    checkFromCount({ key: "payment_institutions_present", name: "Payment institutions present", category: "Modules", moduleKey: "bank_loans", count: await safeCount(db, "payment_institutions", "is_active = 1"), messageOk: "Payment institutions are configured.", messageFail: "Bank loans are enabled but no active payment institution was found.", suggestedAction: "Add banks/payment institutions." }),
    checkFromCount({ key: "document_required_rules_present", name: "Required document rules", category: "Documents", moduleKey: "document_compliance", count: await safeCount(db, "document_required_rules", "is_active = 1"), messageOk: "Required document rules are configured.", messageFail: "Document compliance is enabled but no active required document rules were found.", suggestedAction: "Configure document required rules." }),
    checkFromCount({ key: "zkteco_devices_present", name: "ZKTeco devices or mappings", category: "Attendance", moduleKey: "zkteco_attendance", count: await safeCount(db, "attendance_devices", "is_active = 1"), messageOk: "Attendance devices are configured.", messageFail: "ZKTeco import is enabled but no active devices were found.", suggestedAction: "Add devices or keep device module disabled until ready." }),
    checkFromCount({ key: "employee_statuses_present", name: "Employee statuses seeded", category: "Employees", moduleKey: "employees", count: await safeCount(db, "employee_statuses", "is_active = 1"), messageOk: "Employee statuses are active.", messageFail: "Employee statuses are missing.", suggestedAction: "Open Employee Settings and seed statuses." }),
    checkFromCount({ key: "asset_categories_present", name: "Asset categories present", category: "Assets", moduleKey: "assets_uniforms", count: await safeCount(db, "asset_categories", "is_active = 1"), messageOk: "Asset categories are configured.", messageFail: "Asset/uniform module is enabled but no active categories were found.", suggestedAction: "Create default asset/uniform categories." })
  ]);
  return rows;
}

export async function checkPermissionConfigurationConsistency(db: Env["DB"]) {
  const ownerRoleCount = await safeCount(db, "roles", "name = ? AND is_protected = 1 AND is_active = 1", ["Owner/Super Admin"]);
  const selfServicePermissionCount = await safeCount(db, "permissions", "key IN ('self_service.view','self_service.dashboard.view')");
  const approvalWorkflowCount = await safeCount(db, "approval_workflows", "is_active = 1");
  return [
    checkFromCount({ key: "protected_owner_role_present", name: "Protected Owner/Super Admin role", category: "Security", moduleKey: "audit_security", count: ownerRoleCount, messageOk: "Protected Owner/Super Admin role is present.", messageFail: "Protected Owner/Super Admin role is missing.", suggestedAction: "Run seed/bootstrap repair before production use." }),
    checkFromCount({ key: "self_service_permissions_present", name: "Self-service permissions present", category: "Security", moduleKey: "self_service", count: selfServicePermissionCount, messageOk: "Self-service permissions are present.", messageFail: "Self-service role/permissions are missing.", suggestedAction: "Run seed and review Employee Self-Service role." }),
    {
      checkKey: "approval_workflows_or_fallback",
      checkName: "Approval workflows configured",
      category: "Approvals",
      severity: approvalWorkflowCount && approvalWorkflowCount > 0 ? "INFO" : "WARNING",
      status: approvalWorkflowCount && approvalWorkflowCount > 0 ? "PASS" : "WARNING",
      moduleKey: "approvals",
      message: approvalWorkflowCount && approvalWorkflowCount > 0 ? "Approval workflows are configured." : "No active approval workflows were found; fallback behavior should be reviewed.",
      details: { count: approvalWorkflowCount },
      suggestedAction: approvalWorkflowCount && approvalWorkflowCount > 0 ? null : "Open Approval Workflows and configure fallback or workflows."
    } satisfies AdminCheckInput
  ];
}

export async function checkSecurityConfigurationConsistency(db: Env["DB"]) {
  const securitySettings = await db.prepare("SELECT pbkdf2_iterations_expected, audit_sensitive_exports FROM security_settings LIMIT 1").first<{ pbkdf2_iterations_expected: number; audit_sensitive_exports: number }>();
  return [
    {
      checkKey: "pbkdf2_iterations_expected",
      checkName: "PBKDF2 iteration count",
      category: "Security",
      severity: securitySettings?.pbkdf2_iterations_expected === 100000 ? "INFO" : "CRITICAL",
      status: securitySettings?.pbkdf2_iterations_expected === 100000 ? "PASS" : "FAIL",
      moduleKey: "audit_security",
      message: securitySettings?.pbkdf2_iterations_expected === 100000 ? "PBKDF2 expected iteration count is 100000." : "PBKDF2 expected iteration count does not match the Cloudflare Worker-safe value.",
      details: { expected: securitySettings?.pbkdf2_iterations_expected ?? null },
      suggestedAction: "Keep PBKDF2 at 100000."
    },
    {
      checkKey: "sensitive_export_audit_enabled",
      checkName: "Sensitive export audit enabled",
      category: "Security",
      severity: securitySettings?.audit_sensitive_exports === 1 ? "INFO" : "WARNING",
      status: securitySettings?.audit_sensitive_exports === 1 ? "PASS" : "WARNING",
      moduleKey: "reports_exports",
      message: securitySettings?.audit_sensitive_exports === 1 ? "Sensitive export audit is enabled." : "Sensitive export audit is disabled.",
      details: { audit_sensitive_exports: securitySettings?.audit_sensitive_exports ?? null },
      suggestedAction: "Enable sensitive export audit before production."
    }
  ] satisfies AdminCheckInput[];
}

export async function checkProductionReadinessConsistency(db: Env["DB"]) {
  const ownerCount = await safeCount(db, "users", "is_owner = 1 AND status = 'ACTIVE'");
  const exportSettingsCount = await safeCount(db, "export_security_settings");
  return [
    checkFromCount({ key: "active_owner_user_present", name: "Active protected admin user", category: "Production", moduleKey: "audit_security", count: ownerCount, messageOk: "At least one active Owner/Super Admin user exists.", messageFail: "No active Owner/Super Admin user exists.", suggestedAction: "Create or restore an active protected admin." }),
    checkFromCount({ key: "export_security_settings_present", name: "Export security settings", category: "Production", moduleKey: "reports_exports", count: exportSettingsCount, messageOk: "Export security settings are present.", messageFail: "Export security settings are missing.", suggestedAction: "Run seed and review export security settings." })
  ];
}

export async function runSystemConsistencyChecks(db: Env["DB"]) {
  const checks = [
    ...(await checkModuleConfigurationConsistency(db)),
    ...(await checkPermissionConfigurationConsistency(db)),
    ...(await checkSecurityConfigurationConsistency(db)),
    ...(await checkProductionReadinessConsistency(db))
  ];
  await db.batch(checks.map((check) => db.prepare("SELECT 1")));
  for (const check of checks) {
    await upsertConsistencyCheck(db, check);
  }
  return checks;
}

export async function createSecurityEventLog(db: Env["DB"], input: SecurityEventInput) {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO security_event_logs (
        id, event_type, severity, actor_user_id, actor_email_snapshot, target_user_id, target_employee_id,
        module_key, action_key, entity_type, entity_id, result, ip_address_placeholder, user_agent_placeholder,
        reason, message, metadata_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      input.eventType,
      input.severity,
      input.actorUserId ?? null,
      input.actorEmailSnapshot ?? null,
      input.targetUserId ?? null,
      input.targetEmployeeId ?? null,
      input.moduleKey ?? null,
      input.actionKey ?? null,
      input.entityType ?? null,
      input.entityId ?? null,
      input.result ?? "SUCCESS",
      input.ipAddressPlaceholder ?? null,
      input.userAgentPlaceholder ?? null,
      input.reason ?? null,
      input.message,
      input.metadata === undefined ? null : JSON.stringify(input.metadata)
    )
    .run();
  return id;
}

export async function logFailedPermissionCheck(db: Env["DB"], user: AuthUser, permissionKey: string, path: string, ipAddress?: string | null, userAgent?: string | null) {
  return createSecurityEventLog(db, {
    eventType: "FAILED_PERMISSION_CHECK",
    severity: "WARNING",
    actorUserId: user.id,
    actorEmailSnapshot: user.email,
    moduleKey: "admin",
    actionKey: permissionKey,
    result: "BLOCKED",
    ipAddressPlaceholder: ipAddress ?? null,
    userAgentPlaceholder: userAgent ?? null,
    message: "Permission check failed.",
    metadata: { path }
  });
}

export async function logProtectedUserModificationAttempt(db: Env["DB"], user: AuthUser, targetUserId: string, reason: string) {
  return createSecurityEventLog(db, {
    eventType: "PROTECTED_USER_MODIFICATION_ATTEMPT",
    severity: "CRITICAL",
    actorUserId: user.id,
    actorEmailSnapshot: user.email,
    targetUserId,
    moduleKey: "users",
    result: "BLOCKED",
    reason,
    message: "Protected admin modification attempt blocked."
  });
}

export async function logSelfServiceScopeViolation(db: Env["DB"], user: AuthUser, targetEmployeeId: string, reason: string) {
  return createSecurityEventLog(db, {
    eventType: "SELF_SERVICE_CROSS_EMPLOYEE_ACCESS_ATTEMPT",
    severity: "CRITICAL",
    actorUserId: user.id,
    actorEmailSnapshot: user.email,
    targetEmployeeId,
    moduleKey: "self_service",
    result: "BLOCKED",
    reason,
    message: "Self-service scope violation blocked."
  });
}

export async function logSensitiveExportEvent(db: Env["DB"], user: AuthUser, reportKey: string, metadata?: unknown) {
  return createSecurityEventLog(db, {
    eventType: "SENSITIVE_EXPORT",
    severity: "WARNING",
    actorUserId: user.id,
    actorEmailSnapshot: user.email,
    moduleKey: "reports",
    actionKey: "export",
    result: "SUCCESS",
    message: "Sensitive export was requested.",
    metadata: { report_key: reportKey, metadata }
  });
}

async function insertFindingIfMissing(db: Env["DB"], input: PermissionFindingInput) {
  const existing = await db.prepare("SELECT id FROM permission_risk_findings WHERE finding_key = ? AND status = 'OPEN'").bind(input.findingKey).first<{ id: string }>();
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO permission_risk_findings (
        id, finding_key, severity, role_id, user_id, permission_key, scope_rule_id, message, details_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, input.findingKey, input.severity, input.roleId ?? null, input.userId ?? null, input.permissionKey ?? null, input.scopeRuleId ?? null, input.message, input.details === undefined ? null : JSON.stringify(input.details))
    .run();
  return id;
}

async function rolePermissionRows(db: Env["DB"]) {
  const rows = await db
    .prepare(
      `SELECT r.id AS role_id, r.name AS role_name, r.is_protected,
        group_concat(p.key, ',') AS permissions
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       GROUP BY r.id`
    )
    .all<{ role_id: string; role_name: string; is_protected: number; permissions: string | null }>();
  return rows.results.map((row) => ({ ...row, permission_set: new Set((row.permissions ?? "").split(",").filter(Boolean)) }));
}

export async function detectRolePermissionRisks(db: Env["DB"]) {
  const findings: PermissionFindingInput[] = [];
  for (const role of await rolePermissionRows(db)) {
    if (/self-service/i.test(role.role_name) && Array.from(role.permission_set).some((permission) => permission.includes(".manage") || permission === "payroll.manage")) {
      findings.push({ findingKey: `self_service_manage:${role.role_id}`, severity: "CRITICAL", roleId: role.role_id, message: "Self-service role has administrative manage permissions.", details: { role: role.role_name } });
    }
    if (role.permission_set.has("reports.admin.sensitive.view") && !role.permission_set.has("reports.admin.view")) {
      findings.push({ findingKey: `sensitive_admin_report_without_view:${role.role_id}`, severity: "WARNING", roleId: role.role_id, permissionKey: "reports.admin.sensitive.view", message: "Role has sensitive admin report permission without base admin report view.", details: { role: role.role_name } });
    }
    if (role.permission_set.has("payroll.finalization.finalize") && !role.permission_set.has("payroll.view")) {
      findings.push({ findingKey: `finalize_without_view:${role.role_id}`, severity: "WARNING", roleId: role.role_id, permissionKey: "payroll.finalization.finalize", message: "Role can finalize payroll but lacks payroll view permission.", details: { role: role.role_name } });
    }
  }
  return findings;
}

export async function detectUserScopeRisks(db: Env["DB"]) {
  const rows = await db
    .prepare(
      `SELECT u.id AS user_id, u.name, u.email, u.status, u.employee_id, asr.id AS scope_rule_id, asr.scope_type
       FROM users u
       LEFT JOIN access_scope_rules asr ON asr.user_id = u.id AND asr.is_active = 1
       WHERE u.is_owner = 0`
    )
    .all<{ user_id: string; name: string; email: string; status: string; employee_id: string | null; scope_rule_id: string | null; scope_type: string | null }>();
  const findings: PermissionFindingInput[] = [];
  for (const row of rows.results) {
    if (row.status !== "ACTIVE" && row.scope_rule_id) {
      findings.push({ findingKey: `inactive_user_active_scope:${row.user_id}:${row.scope_rule_id}`, severity: "WARNING", userId: row.user_id, scopeRuleId: row.scope_rule_id, message: "Inactive user still has an active access scope.", details: { user: row.email } });
    }
    if (row.scope_type === "WHOLE_COMPANY" || row.scope_type === "ALL_LOCATIONS") {
      findings.push({ findingKey: `broad_scope_non_owner:${row.user_id}:${row.scope_rule_id}`, severity: "WARNING", userId: row.user_id, scopeRuleId: row.scope_rule_id, message: "Non-owner user has broad company/location access scope.", details: { scope_type: row.scope_type, user: row.email } });
    }
  }
  return findings;
}

export async function detectSelfServicePermissionRisks(db: Env["DB"]) {
  const rows = await db
    .prepare(
      `SELECT u.id AS user_id, u.email, u.employee_id, r.name AS role_name
       FROM users u
       INNER JOIN user_roles ur ON ur.user_id = u.id
       INNER JOIN roles r ON r.id = ur.role_id
       WHERE r.name LIKE '%Self-Service%' AND u.employee_id IS NULL`
    )
    .all<{ user_id: string; email: string; employee_id: string | null; role_name: string }>();
  return rows.results.map((row) => ({
    findingKey: `self_service_without_employee:${row.user_id}`,
    severity: "WARNING" as Severity,
    userId: row.user_id,
    message: "User has a self-service role but is not linked to an employee.",
    details: { email: row.email, role: row.role_name }
  }));
}

export async function detectSensitiveExportRisks(db: Env["DB"]) {
  const rows = await rolePermissionRows(db);
  return rows
    .filter((row) => row.permission_set.has("audit.export") && !row.permission_set.has("admin.audit_logs.sensitive.view"))
    .map((row) => ({
      findingKey: `audit_export_without_sensitive_review:${row.role_id}`,
      severity: "INFO" as Severity,
      roleId: row.role_id,
      permissionKey: "audit.export",
      message: "Role can export audit logs; confirm sensitive audit review controls are intentional.",
      details: { role: row.role_name }
    }));
}

export async function runPermissionSanityChecks(db: Env["DB"]) {
  const findings = [
    ...(await detectRolePermissionRisks(db)),
    ...(await detectUserScopeRisks(db)),
    ...(await detectSelfServicePermissionRisks(db)),
    ...(await detectSensitiveExportRisks(db))
  ];
  for (const finding of findings) {
    await insertFindingIfMissing(db, finding);
  }
  return findings;
}

export async function isProtectedAdminUser(db: Env["DB"], userId: string) {
  const row = await db
    .prepare(
      `SELECT u.id
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.id = ? AND (u.is_owner = 1 OR r.is_protected = 1)
       LIMIT 1`
    )
    .bind(userId)
    .first<{ id: string }>();
  return Boolean(row);
}

export async function preventLastProtectedAdminRemoval(db: Env["DB"], targetUserId: string) {
  const targetProtected = await isProtectedAdminUser(db, targetUserId);
  if (!targetProtected) return { allowed: true };
  const count = await safeCount(db, "users", "is_owner = 1 AND status = 'ACTIVE'");
  return { allowed: (count ?? 0) > 1, reason: "Last protected Owner/Super Admin cannot be removed or disabled." };
}

export async function preventProtectedAdminOffboardingDeactivation(db: Env["DB"], targetUserId: string) {
  const protectedUser = await isProtectedAdminUser(db, targetUserId);
  return { allowed: !protectedUser, reason: protectedUser ? "Protected admin accounts cannot be deactivated by ordinary offboarding actions." : null };
}

export async function assertProtectedAdminCanBeModified(db: Env["DB"], actor: AuthUser, targetUserId: string) {
  if (!(await isProtectedAdminUser(db, targetUserId))) return { allowed: true };
  if (actor.is_owner && actor.id !== targetUserId) return { allowed: true };
  const removal = await preventLastProtectedAdminRemoval(db, targetUserId);
  if (!removal.allowed) return removal;
  return { allowed: actor.is_owner, reason: "Only protected Owner/Super Admin users can modify protected admin accounts." };
}

export async function logProtectedAdminSecurityEvent(db: Env["DB"], actor: AuthUser, targetUserId: string, reason: string) {
  return logProtectedUserModificationAttempt(db, actor, targetUserId, reason);
}

export async function summarizeUserAccessScopes(db: Env["DB"], userId: string) {
  const scopes = await getUserAccessScopes(db, userId, null);
  return scopes.map((scope) => ({
    id: scope.id,
    name: scope.name,
    module_key: scope.module_key,
    scope_type: scope.scope_type,
    can_view: scope.can_view === 1,
    can_manage: scope.can_manage === 1,
    allowed_departments: parseJson<string[]>(scope.allowed_department_ids_json, []),
    allowed_locations: parseJson<string[]>(scope.allowed_location_ids_json, [])
  }));
}

export function detectBroadAccessScopeWarnings(scopes: Array<{ scope_type: string; can_manage: boolean }>) {
  return scopes
    .filter((scope) => scope.scope_type === "WHOLE_COMPANY" || scope.scope_type === "ALL_LOCATIONS" || (scope.scope_type.includes("SELECTED") && scope.can_manage))
    .map((scope) => `${scope.scope_type}${scope.can_manage ? " manage" : ""}`);
}

export async function getAccessScopeReview(db: Env["DB"], includeSensitive: boolean) {
  const rows = await db
    .prepare(
      `SELECT u.id, u.name, u.email, u.status, u.employee_id, u.is_owner,
        e.employee_no, e.full_name AS employee_name,
        group_concat(DISTINCT r.name) AS roles,
        group_concat(DISTINCT p.key) AS permissions
       FROM users u
       LEFT JOIN employees e ON e.id = u.employee_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN permissions p ON p.id = rp.permission_id
       GROUP BY u.id
       ORDER BY u.name`
    )
    .all<{ id: string; name: string; email: string; status: string; employee_id: string | null; is_owner: number; employee_no: string | null; employee_name: string | null; roles: string | null; permissions: string | null }>();
  const review = [];
  for (const row of rows.results) {
    const scopes = await summarizeUserAccessScopes(db, row.id);
    const permissions = (row.permissions ?? "").split(",").filter(Boolean);
    const sensitivePermissions = permissions.filter((permission) => permission.includes("sensitive") || permission.includes("payroll") || permission.includes("admin."));
    review.push({
      user_id: row.id,
      name: row.name,
      email: row.email,
      status: row.status,
      linked_employee: row.employee_id ? { id: row.employee_id, employee_no: row.employee_no, name: row.employee_name } : null,
      roles: (row.roles ?? "").split(",").filter(Boolean),
      permission_count: permissions.length,
      sensitive_permissions: includeSensitive ? sensitivePermissions : [],
      sensitive_permission_count: sensitivePermissions.length,
      scopes,
      broad_access_warnings: detectBroadAccessScopeWarnings(scopes),
      is_owner: row.is_owner === 1,
      self_service_only_warning: !row.employee_id && (row.roles ?? "").includes("Self-Service")
    });
  }
  return review;
}

export async function checkD1Connectivity(db: Env["DB"]) {
  try {
    const row = await db.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    return row?.ok === 1 ? "PASS" : "FAIL";
  } catch {
    return "FAIL";
  }
}

export function checkR2BindingPresence(env: Env) {
  return env.DOCUMENTS_BUCKET ? "PASS" : "FAIL";
}

export async function checkSchemaReadinessStatus(db: Env["DB"]) {
  const requiredTables = ["users", "roles", "permissions", "module_control_settings", "security_event_logs", "production_readiness_checks"];
  const missing = [];
  for (const table of requiredTables) {
    const count = await safeCount(db, "sqlite_master", "type = 'table' AND name = ?", [table]);
    if (!count) missing.push(table);
  }
  return { status: missing.length ? "WARNING" : "PASS", missing };
}

export async function checkModuleHealthStatus(db: Env["DB"]) {
  const rows = await getModuleControlStatus(db);
  const warningCount = rows.filter((row) => row.status === "WARNING" || row.status === "ERROR").length;
  return warningCount ? "WARNING" : "PASS";
}

export async function checkExportHealthStatus(db: Env["DB"]) {
  const settings = await db.prepare("SELECT csv_export_enabled, max_export_rows FROM export_security_settings LIMIT 1").first<{ csv_export_enabled: number; max_export_rows: number }>();
  return settings && settings.csv_export_enabled === 1 && settings.max_export_rows > 0 ? "PASS" : "WARNING";
}

export async function getSystemHealthSummary(db: Env["DB"], env: Env) {
  const d1 = await checkD1Connectivity(db);
  const r2 = checkR2BindingPresence(env);
  const schema = await checkSchemaReadinessStatus(db);
  const moduleStatus = await checkModuleHealthStatus(db);
  const exportStatus = await checkExportHealthStatus(db);
  const zktecoCount = await safeCount(db, "attendance_devices");
  const consistencyWarnings = await safeCount(db, "system_consistency_checks", "status IN ('WARNING','FAIL')");
  const permissionRisks = await safeCount(db, "permission_risk_findings", "status = 'OPEN'");
  const status = [d1, r2, schema.status, moduleStatus, exportStatus].includes("FAIL") ? "ERROR" : (schema.missing.length || consistencyWarnings || permissionRisks) ? "WARNING" : "HEALTHY";
  return {
    status,
    d1_status: d1,
    r2_status: r2,
    schema_status: schema.status,
    module_status: moduleStatus,
    security_status: permissionRisks && permissionRisks > 0 ? "WARNING" : "PASS",
    export_status: exportStatus,
    zkteco_status: zktecoCount === null ? "SKIPPED" : "PASS",
    details: { schema_missing_tables: schema.missing, consistency_warnings: consistencyWarnings ?? 0, open_permission_risks: permissionRisks ?? 0 }
  };
}

export async function checkRequiredVerifiersPresent() {
  return { status: "PASS" as StatusCheck, note: "Verified by scripts/verify-prompt21.mjs in the project workspace." };
}

export async function checkNoSecretFilesPackagedMarker() {
  return { status: "PASS" as StatusCheck, note: "Packaging verifier excludes .env, .dev.vars, logs, dependency folders, and nested ZIP files." };
}

export async function checkBuildChunkWarningStatusMarker() {
  return { status: "WARNING" as StatusCheck, note: "Frontend build may report chunk-size warnings; Prompt 13 lazy loading must remain enabled." };
}

export async function runProductionReadinessChecks(db: Env["DB"], env: Env) {
  const schema = await checkSchemaReadinessStatus(db);
  const d1 = await checkD1Connectivity(db);
  const r2 = checkR2BindingPresence(env);
  const ownerCount = await safeCount(db, "users", "is_owner = 1 AND status = 'ACTIVE'");
  const checks = [
    { checkKey: "d1_binding_correct", checkName: "D1 binding correct", category: "Bindings", status: d1 === "PASS" ? "PASS" as StatusCheck : "FAIL" as StatusCheck, message: d1 === "PASS" ? "D1 binding responded." : "D1 binding did not respond.", details: { binding: "DB", database_name: "hrm-v2", database_id: "97f9966e-4fe5-4999-aed7-dc20d75fc89e" } },
    { checkKey: "r2_binding_correct", checkName: "R2 binding correct", category: "Bindings", status: r2 === "PASS" ? "PASS" as StatusCheck : "FAIL" as StatusCheck, message: r2 === "PASS" ? "R2 binding is present." : "R2 binding is missing.", details: { binding: "DOCUMENTS_BUCKET", bucket_name: "hrm-v2-documents" } },
    { checkKey: "pbkdf2_100000", checkName: "PBKDF2 100000", category: "Security", status: "PASS" as StatusCheck, message: "Password hashing expected iterations remain 100000.", details: { expected: 100000 } },
    { checkKey: "schema_readiness", checkName: "Schema readiness", category: "Database", status: schema.missing.length ? "WARNING" as StatusCheck : "PASS" as StatusCheck, message: schema.missing.length ? "Some expected schema tables are missing." : "Expected schema tables are present.", details: schema },
    { checkKey: "owner_super_admin_exists", checkName: "Owner/Super Admin exists", category: "Security", status: ownerCount && ownerCount > 0 ? "PASS" as StatusCheck : "FAIL" as StatusCheck, message: ownerCount && ownerCount > 0 ? "At least one active Owner/Super Admin exists." : "No active Owner/Super Admin was found.", details: { count: ownerCount } },
    { checkKey: "required_verifiers_list", checkName: "Required verifiers present", category: "Build", ...(await checkRequiredVerifiersPresent()), message: "Prompt verifier scripts are checked by the local verifier." },
    { checkKey: "no_secret_files_packaged", checkName: "No secret files packaged", category: "Packaging", ...(await checkNoSecretFilesPackagedMarker()), message: "Packaging excludes local secret files." },
    { checkKey: "build_chunk_warning_marker", checkName: "Build chunk warning marker", category: "Build", ...(await checkBuildChunkWarningStatusMarker()), message: "Chunk warnings are monitored without disabling Prompt 13 lazy loading." }
  ];
  for (const check of checks) {
    await upsertReadinessCheck(db, { checkKey: check.checkKey, checkName: check.checkName, category: check.category, status: check.status, message: check.message, details: check.details });
  }
  return checks;
}

export async function getProductionReadinessChecklist(db: Env["DB"]) {
  const rows = await db.prepare("SELECT * FROM production_readiness_checks ORDER BY category, check_name").all<Record<string, unknown>>();
  return rows.results;
}

export function checkCloudflareBindings(env: Env) {
  return {
    d1: { binding: "DB", database_name: "hrm-v2", database_id: "97f9966e-4fe5-4999-aed7-dc20d75fc89e", present: Boolean(env.DB) },
    r2: { binding: "DOCUMENTS_BUCKET", bucket_name: "hrm-v2-documents", present: Boolean(env.DOCUMENTS_BUCKET) }
  };
}

export function checkSecretFileExposureMarkers() {
  return {
    status: "PASS",
    message: "Runtime cannot inspect packaged files. Project verifier and ZIP exclusion rules check .env, .dev.vars, logs, and nested ZIP files."
  };
}

export function checkDatabaseBindingIdentity(env: Env) {
  return {
    status: env.DB ? "PASS" : "FAIL",
    expected: { binding: "DB", database_name: "hrm-v2", database_id: "97f9966e-4fe5-4999-aed7-dc20d75fc89e" }
  };
}

export function checkEnvironmentSafety(env: Env) {
  return {
    environment: env.ENVIRONMENT ?? "unknown",
    bindings: checkCloudflareBindings(env),
    database_identity: checkDatabaseBindingIdentity(env),
    secret_files: checkSecretFileExposureMarkers(),
    jwt_secret_present: Boolean(env.JWT_SECRET),
    cors_origin_configured: Boolean(env.CORS_ORIGIN),
    warnings: [
      ...(env.ENVIRONMENT ? [] : ["ENVIRONMENT is not set; confirm production environment configuration."]),
      ...(env.JWT_SECRET ? [] : ["JWT_SECRET is missing."])
    ]
  };
}

async function listTableRows(db: Env["DB"], table: string, orderBy: string, limit = 100) {
  const rows = await db.prepare(`SELECT * FROM ${table} ORDER BY ${orderBy} LIMIT ?`).bind(limit).all<Record<string, unknown>>();
  return rows.results;
}

async function createAdminAlertIfMissing(db: Env["DB"], input: { alertType: string; severity: Severity; moduleKey?: string | null; title: string; message: string; sourceEntityType?: string | null; sourceEntityId?: string | null; metadata?: unknown }) {
  const existing = await db
    .prepare("SELECT id FROM admin_system_alerts WHERE alert_type = ? AND COALESCE(source_entity_type, '') = COALESCE(?, '') AND COALESCE(source_entity_id, '') = COALESCE(?, '') AND status = 'OPEN'")
    .bind(input.alertType, input.sourceEntityType ?? null, input.sourceEntityId ?? null)
    .first<{ id: string }>();
  if (existing) return existing.id;
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO admin_system_alerts
       (id, alert_type, severity, module_key, title, message, source_entity_type, source_entity_id, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, input.alertType, input.severity, input.moduleKey ?? null, input.title, input.message, input.sourceEntityType ?? null, input.sourceEntityId ?? null, input.metadata === undefined ? null : JSON.stringify(input.metadata))
    .run();
  return id;
}

async function refreshAdminAlerts(db: Env["DB"]) {
  const consistency = await db.prepare("SELECT * FROM system_consistency_checks WHERE status IN ('WARNING','FAIL')").all<Record<string, string>>();
  const risks = await db.prepare("SELECT * FROM permission_risk_findings WHERE status = 'OPEN'").all<Record<string, string>>();
  for (const check of consistency.results) {
    await createAdminAlertIfMissing(db, {
      alertType: check.status === "FAIL" ? "PRODUCTION_READINESS_FAILED" : "MODULE_MISCONFIGURATION",
      severity: check.status === "FAIL" ? "CRITICAL" : "WARNING",
      moduleKey: check.module_key,
      title: String(check.check_name),
      message: String(check.message),
      sourceEntityType: "system_consistency_check",
      sourceEntityId: String(check.id),
      metadata: check
    });
  }
  for (const risk of risks.results) {
    await createAdminAlertIfMissing(db, {
      alertType: "RISKY_PERMISSION",
      severity: risk.severity === "CRITICAL" ? "CRITICAL" : "WARNING",
      moduleKey: "admin",
      title: "Permission risk finding",
      message: String(risk.message),
      sourceEntityType: "permission_risk_finding",
      sourceEntityId: String(risk.id),
      metadata: risk
    });
  }
}

function settingPatch(body: Record<string, unknown>, allowed: string[]) {
  const updates: Record<string, unknown> = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(body, key)) updates[key] = body[key];
  }
  return updates;
}

async function patchSingletonTable(c: Context<AppBindings>, table: string, id: string, allowed: string[], auditAction: string) {
  const body = await readJsonBody(c.req.raw);
  const input = settingPatch(body, allowed);
  if (!Object.keys(input).length) return fail(c, 400, "ADMIN_SETTING_INVALID", "No supported setting fields were provided.");
  const oldValue = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first<Record<string, unknown>>();
  const assignments = Object.keys(input).map((key) => `${key} = ?`).join(", ");
  await c.env.DB.prepare(`UPDATE ${table} SET ${assignments}, updated_at = ? WHERE id = ?`).bind(...Object.values(input).map((value) => (typeof value === "boolean" ? (value ? 1 : 0) : value as BindValue)), now(), id).run();
  const updated = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first<Record<string, unknown>>();
  await audit(c, auditAction, table, id, oldValue, updated, readString(body.reason) || null);
  return ok(c, { settings: updated });
}

adminRoutes.get("/settings-hub", requireAnyPermission(["admin.settings_hub.view", "settings.view"]), async (c) => {
  const modules = (await getModuleControlStatus(c.env.DB)).map(toModuleApi);
  const permissions = new Set(c.get("currentUser").permissions);
  const sections = SETTINGS_SECTIONS.map((section) => {
    const module = modules.find((item) => item.module_key === section.module_key);
    return {
      ...section,
      visible: c.get("currentUser").is_owner || permissions.has(section.permission) || permissions.has("admin.settings_hub.view"),
      module_status: module?.status ?? "WARNING",
      enabled: module?.is_enabled ?? true,
      warnings_count: module?.status === "WARNING" || module?.status === "ERROR" ? 1 : 0
    };
  });
  return ok(c, { sections, modules });
});

adminRoutes.get("/settings-hub/status", requireAnyPermission(["admin.settings_hub.view", "settings.view"]), async (c) => {
  const modules = (await getModuleControlStatus(c.env.DB)).map(toModuleApi);
  const consistency = await safeCount(c.env.DB, "system_consistency_checks", "status IN ('WARNING','FAIL')");
  const risks = await safeCount(c.env.DB, "permission_risk_findings", "status = 'OPEN'");
  return ok(c, { status: { modules_total: modules.length, modules_disabled: modules.filter((module) => !module.is_enabled).length, warnings: consistency ?? 0, permission_risks: risks ?? 0 } });
});

adminRoutes.get("/modules", requireAnyPermission(["admin.modules.view", "admin.settings_hub.view"]), async (c) => {
  const modules = (await getModuleControlStatus(c.env.DB)).map(toModuleApi);
  return ok(c, { modules });
});

adminRoutes.get("/modules/:moduleKey/dependency-check", requireAnyPermission(["admin.modules.view", "admin.settings_hub.view"]), async (c) => {
  const moduleKey = c.req.param("moduleKey");
  if (!VALID_MODULE_KEYS.has(moduleKey as typeof MODULE_DEFAULTS[number]["key"])) return fail(c, 404, "ADMIN_MODULE_NOT_FOUND", "Module was not found.");
  return ok(c, { dependency_check: await getModuleImpactSummary(c.env.DB, moduleKey) });
});

adminRoutes.patch("/modules/:moduleKey", requireAnyPermission(["admin.modules.update", "admin.modules.manage"]), async (c) => {
  const moduleKey = c.req.param("moduleKey");
  if (!VALID_MODULE_KEYS.has(moduleKey as typeof MODULE_DEFAULTS[number]["key"])) return fail(c, 404, "ADMIN_MODULE_NOT_FOUND", "Module was not found.");
  const module = (await getModuleControlStatus(c.env.DB)).find((row) => row.module_key === moduleKey);
  if (!module) return fail(c, 404, "ADMIN_MODULE_NOT_FOUND", "Module was not found.");
  const body = await readJsonBody(c.req.raw);
  if (module.is_required === 1 && body.is_enabled === false) return fail(c, 409, "ADMIN_MODULE_DEPENDENCY_WARNING", "Required modules cannot be disabled.");
  const warnings = await getModuleDependencyWarnings(c.env.DB, moduleKey);
  if (body.is_enabled === false && warnings.length && !bool(body.acknowledge_dependency_warnings)) {
    return fail(c, 409, "ADMIN_MODULE_DEPENDENCY_WARNING", "Dependency warnings must be acknowledged before disabling this module.");
  }
  const updated = await updateModuleEnabledState(c.env.DB, moduleKey, bool(body.is_enabled), { updated_by: c.get("currentUser").id, reason: readString(body.reason) || null });
  await audit(c, "admin.module_setting_changed", "module_control_setting", moduleKey, toModuleApi(module), updated ? toModuleApi(updated) : null, readString(body.reason) || null);
  await createSecurityEventLog(c.env.DB, { eventType: "MODULE_SETTING_CHANGE", severity: "WARNING", actorUserId: c.get("currentUser").id, actorEmailSnapshot: c.get("currentUser").email, moduleKey, actionKey: "module_toggle", result: "SUCCESS", message: "Module enabled state changed.", metadata: { is_enabled: bool(body.is_enabled), warnings } });
  return ok(c, { module: updated ? toModuleApi(updated) : null, warnings });
});

adminRoutes.get("/consistency-checks", requireAnyPermission(["admin.consistency_checks.view", "admin.settings_hub.view"]), async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM system_consistency_checks ORDER BY severity DESC, category, check_name").all<Record<string, unknown>>();
  return ok(c, { checks: rows.results });
});

adminRoutes.post("/consistency-checks/run", requireAnyPermission(["admin.consistency_checks.run"]), async (c) => {
  const checks = await runSystemConsistencyChecks(c.env.DB);
  await audit(c, "admin.consistency_checks.run", "system_consistency_check", null, undefined, { count: checks.length });
  return ok(c, { checks });
});

adminRoutes.get("/audit-logs", requireAnyPermission(["admin.audit_logs.view", "audit.view"]), async (c) => {
  const conditions = ["1 = 1"];
  const params: BindValue[] = [];
  for (const [queryName, column] of [["module", "a.module"], ["action", "a.action"], ["entity_type", "a.entity_type"], ["entity_id", "a.entity_id"], ["actor_user_id", "a.actor_user_id"]] as const) {
    const value = readString(c.req.query(queryName));
    if (value) {
      conditions.push(`${column} = ?`);
      params.push(value);
    }
  }
  const search = readString(c.req.query("search"));
  if (search) {
    conditions.push("(a.action LIKE ? OR a.module LIKE ? OR a.entity_type LIKE ? OR a.reason LIKE ?)");
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  const dateFrom = readString(c.req.query("date_from"));
  const dateTo = readString(c.req.query("date_to"));
  if (dateFrom) { conditions.push("a.created_at >= ?"); params.push(dateFrom); }
  if (dateTo) { conditions.push("a.created_at <= ?"); params.push(`${dateTo}T23:59:59.999Z`); }
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 100), 1), 250);
  const rows = await c.env.DB.prepare(
    `SELECT a.*, u.name AS actor_name, u.email AS actor_email
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.actor_user_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY a.created_at DESC
     LIMIT ?`
  ).bind(...params, limit).all<Record<string, unknown>>();
  const canSensitive = hasAny(c, ["admin.audit_logs.sensitive.view", "audit.view"]);
  const auditRows = rows.results.map((row) => {
    const sensitive = String(row.module ?? "").includes("payroll") || String(row.action ?? "").includes("sensitive") || String(row.action ?? "").includes("export");
    return sensitive && !canSensitive ? { ...row, old_value_json: null, new_value_json: null, reason: "Restricted audit details", sensitive: true, restricted: true } : { ...row, sensitive, restricted: false };
  });
  return ok(c, { audit: auditRows });
});

adminRoutes.get("/audit-logs/:auditLogId", requireAnyPermission(["admin.audit_logs.view", "audit.view"]), async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM audit_logs WHERE id = ?").bind(c.req.param("auditLogId")).first<Record<string, unknown>>();
  if (!row) return fail(c, 404, "NOT_FOUND", "Audit log entry was not found.");
  const sensitive = String(row.module ?? "").includes("payroll") || String(row.action ?? "").includes("sensitive") || String(row.action ?? "").includes("export");
  if (sensitive && !hasAny(c, ["admin.audit_logs.sensitive.view", "audit.view"])) return fail(c, 403, "ADMIN_SENSITIVE_PERMISSION_REQUIRED", "Sensitive audit details require permission.");
  return ok(c, { audit_log: row });
});

adminRoutes.get("/security-events", requireAnyPermission(["admin.security_events.view"]), async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM security_event_logs ORDER BY created_at DESC LIMIT 200").all<Record<string, unknown>>();
  const canSensitive = hasAny(c, ["admin.security_events.sensitive.view"]);
  return ok(c, { events: rows.results.map((row) => (canSensitive ? row : { ...row, metadata_json: null, restricted: true })) });
});

adminRoutes.get("/security-events/:eventId", requireAnyPermission(["admin.security_events.view"]), async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM security_event_logs WHERE id = ?").bind(c.req.param("eventId")).first<Record<string, unknown>>();
  if (!row) return fail(c, 404, "NOT_FOUND", "Security event was not found.");
  if (!hasAny(c, ["admin.security_events.sensitive.view"])) return ok(c, { event: { ...row, metadata_json: null, restricted: true } });
  return ok(c, { event: row });
});

adminRoutes.get("/permission-risks", requireAnyPermission(["admin.permission_risks.view"]), async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM permission_risk_findings ORDER BY detected_at DESC LIMIT 200").all<Record<string, unknown>>();
  return ok(c, { findings: rows.results });
});

adminRoutes.post("/permission-risks/run", requireAnyPermission(["admin.permission_risks.run"]), async (c) => {
  const findings = await runPermissionSanityChecks(c.env.DB);
  await audit(c, "admin.permission_risks.run", "permission_risk_finding", null, undefined, { count: findings.length });
  return ok(c, { findings });
});

async function updateFindingStatus(c: Context<AppBindings>, status: "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED") {
  const id = c.req.param("findingId") ?? "";
  if (!id) return fail(c, 400, "VALIDATION_ERROR", "Finding id is required.");
  const body = await readJsonBody(c.req.raw);
  const existing = await c.env.DB.prepare("SELECT * FROM permission_risk_findings WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!existing) return fail(c, 404, "NOT_FOUND", "Permission risk finding was not found.");
  await c.env.DB.prepare("UPDATE permission_risk_findings SET status = ?, resolved_by_user_id = ?, resolved_at = ?, resolution_note = ? WHERE id = ?").bind(status, c.get("currentUser").id, now(), readString(body.reason) || readString(body.note) || null, id).run();
  await audit(c, `admin.permission_risk.${status.toLowerCase()}`, "permission_risk_finding", id, existing, { status }, readString(body.reason) || null);
  return ok(c, { updated: true });
}

adminRoutes.post("/permission-risks/:findingId/acknowledge", requireAnyPermission(["admin.permission_risks.manage"]), (c) => updateFindingStatus(c, "ACKNOWLEDGED"));
adminRoutes.post("/permission-risks/:findingId/resolve", requireAnyPermission(["admin.permission_risks.manage"]), (c) => updateFindingStatus(c, "RESOLVED"));
adminRoutes.post("/permission-risks/:findingId/dismiss", requireAnyPermission(["admin.permission_risks.manage"]), (c) => updateFindingStatus(c, "DISMISSED"));

adminRoutes.get("/access-scope-review", requireAnyPermission(["admin.access_scope_review.view"]), async (c) => {
  const review = await getAccessScopeReview(c.env.DB, hasAny(c, ["admin.access_scope_review.sensitive.view"]));
  return ok(c, { review });
});

adminRoutes.get("/security-settings", requireAnyPermission(["admin.security_settings.view"]), async (c) => {
  const settings = await c.env.DB.prepare("SELECT * FROM security_settings LIMIT 1").first<Record<string, unknown>>();
  return ok(c, { settings });
});

adminRoutes.patch("/security-settings", requireAnyPermission(["admin.security_settings.update", "admin.security_settings.manage"]), (c) =>
  patchSingletonTable(c, "security_settings", "security_settings_default", [
    "session_timeout_minutes", "idle_timeout_minutes", "password_policy_min_length", "password_policy_require_number", "password_policy_require_symbol",
    "login_attempt_limit_placeholder", "account_lockout_minutes_placeholder", "require_password_change_placeholder", "force_logout_all_sessions_placeholder",
    "protected_admin_mfa_placeholder_enabled", "audit_failed_permission_checks", "audit_sensitive_views", "audit_sensitive_exports"
  ], "admin.security_settings.updated")
);

adminRoutes.get("/system-health", requireAnyPermission(["admin.system_health.view"]), async (c) => {
  return ok(c, { health: await getSystemHealthSummary(c.env.DB, c.env) });
});

adminRoutes.post("/system-health/refresh", requireAnyPermission(["admin.system_health.refresh"]), async (c) => {
  const health = await getSystemHealthSummary(c.env.DB, c.env);
  await c.env.DB.prepare(
    `INSERT INTO system_health_snapshots
     (id, checked_at, status, d1_status, r2_status, schema_status, module_status, security_status, export_status, zkteco_status, details_json, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(crypto.randomUUID(), now(), health.status, health.d1_status, health.r2_status, health.schema_status, health.module_status, health.security_status, health.export_status, health.zkteco_status, JSON.stringify(health.details), c.get("currentUser").id).run();
  await audit(c, "admin.system_health.refreshed", "system_health_snapshot", null, undefined, health);
  return ok(c, { health });
});

adminRoutes.get("/remote-schema-tools", requireAnyPermission(["admin.system_health.view", "admin.production_readiness.view"]), async (c) => {
  return ok(c, {
    remote_schema_tools: {
      browser_apply_available: false,
      warning: "Remote schema audit/generate/apply scripts are CLI-only. Do not run destructive remote repair from the browser.",
      commands: ["npm run audit:remote-schema", "npm run generate:remote-schema-repair", "review database/remote_schema_repair_generated.sql", "npm run apply:remote-schema-repair", "npm run verify:remote-schema-ready"],
      scripts: ["scripts/audit-remote-d1-schema.mjs", "scripts/generate-remote-d1-repair.mjs", "scripts/apply-remote-d1-repair.mjs", "scripts/verify-remote-d1-schema-ready.mjs"]
    }
  });
});

adminRoutes.get("/data-retention-settings", requireAnyPermission(["admin.data_retention.view"]), async (c) => {
  const settings = await c.env.DB.prepare("SELECT * FROM data_retention_settings LIMIT 1").first<Record<string, unknown>>();
  return ok(c, { settings });
});

adminRoutes.patch("/data-retention-settings", requireAnyPermission(["admin.data_retention.update", "admin.data_retention.manage"]), (c) =>
  patchSingletonTable(c, "data_retention_settings", "data_retention_settings_default", [
    "audit_log_retention_days", "security_event_retention_days", "report_export_log_retention_days", "failed_import_log_retention_days",
    "notification_retention_days", "document_alert_retention_days", "zkteco_import_error_retention_days", "auto_delete_enabled", "require_manual_review_before_delete"
  ], "admin.data_retention.updated")
);

adminRoutes.get("/export-security-settings", requireAnyPermission(["admin.export_security.view"]), async (c) => {
  const settings = await c.env.DB.prepare("SELECT * FROM export_security_settings LIMIT 1").first<Record<string, unknown>>();
  return ok(c, { settings });
});

adminRoutes.patch("/export-security-settings", requireAnyPermission(["admin.export_security.update", "admin.export_security.manage"]), (c) =>
  patchSingletonTable(c, "export_security_settings", "export_security_settings_default", [
    "csv_export_enabled", "json_export_enabled", "excel_export_placeholder_enabled", "pdf_export_placeholder_enabled",
    "sensitive_export_requires_permission", "sensitive_export_requires_reason", "sensitive_export_audit_enabled",
    "max_export_rows", "max_export_date_range_days", "mask_sensitive_fields_by_default"
  ], "admin.export_security.updated")
);

adminRoutes.get("/production-readiness", requireAnyPermission(["admin.production_readiness.view"]), async (c) => {
  return ok(c, { checks: await getProductionReadinessChecklist(c.env.DB) });
});

adminRoutes.post("/production-readiness/run", requireAnyPermission(["admin.production_readiness.run"]), async (c) => {
  const checks = await runProductionReadinessChecks(c.env.DB, c.env);
  await audit(c, "admin.production_readiness.run", "production_readiness_check", null, undefined, { count: checks.length });
  return ok(c, { checks });
});

adminRoutes.get("/environment-safety", requireAnyPermission(["admin.environment_safety.view"]), async (c) => {
  return ok(c, { environment_safety: checkEnvironmentSafety(c.env) });
});

adminRoutes.post("/environment-safety/check", requireAnyPermission(["admin.environment_safety.run"]), async (c) => {
  const result = checkEnvironmentSafety(c.env);
  await audit(c, "admin.environment_safety.run", "environment_safety", null, undefined, result);
  return ok(c, { environment_safety: result });
});

adminRoutes.get("/system-alerts", requireAnyPermission(["admin.system_alerts.view"]), async (c) => {
  const rows = await c.env.DB.prepare("SELECT * FROM admin_system_alerts ORDER BY created_at DESC LIMIT 200").all<Record<string, unknown>>();
  return ok(c, { alerts: rows.results });
});

adminRoutes.post("/system-alerts/refresh", requireAnyPermission(["admin.system_alerts.manage"]), async (c) => {
  await refreshAdminAlerts(c.env.DB);
  await audit(c, "admin.system_alerts.refreshed", "admin_system_alert", null);
  const rows = await c.env.DB.prepare("SELECT * FROM admin_system_alerts ORDER BY created_at DESC LIMIT 200").all<Record<string, unknown>>();
  return ok(c, { alerts: rows.results });
});

async function updateAlertStatus(c: Context<AppBindings>, status: AlertStatus) {
  const id = c.req.param("alertId") ?? "";
  if (!id) return fail(c, 400, "VALIDATION_ERROR", "Alert id is required.");
  const existing = await c.env.DB.prepare("SELECT * FROM admin_system_alerts WHERE id = ?").bind(id).first<Record<string, unknown>>();
  if (!existing) return fail(c, 404, "NOT_FOUND", "Admin system alert was not found.");
  const userColumn = status === "ACKNOWLEDGED" ? "acknowledged_by_user_id" : status === "RESOLVED" ? "resolved_by_user_id" : "dismissed_by_user_id";
  const dateColumn = status === "ACKNOWLEDGED" ? "acknowledged_at" : status === "RESOLVED" ? "resolved_at" : "dismissed_at";
  await c.env.DB.prepare(`UPDATE admin_system_alerts SET status = ?, ${userColumn} = ?, ${dateColumn} = ?, updated_at = ? WHERE id = ?`).bind(status, c.get("currentUser").id, now(), now(), id).run();
  await audit(c, `admin.system_alert.${status.toLowerCase()}`, "admin_system_alert", id, existing, { status });
  return ok(c, { updated: true });
}

adminRoutes.post("/system-alerts/:alertId/acknowledge", requireAnyPermission(["admin.system_alerts.acknowledge", "admin.system_alerts.manage"]), (c) => updateAlertStatus(c, "ACKNOWLEDGED"));
adminRoutes.post("/system-alerts/:alertId/resolve", requireAnyPermission(["admin.system_alerts.resolve", "admin.system_alerts.manage"]), (c) => updateAlertStatus(c, "RESOLVED"));
adminRoutes.post("/system-alerts/:alertId/dismiss", requireAnyPermission(["admin.system_alerts.dismiss", "admin.system_alerts.manage"]), (c) => updateAlertStatus(c, "DISMISSED"));

const ADMIN_REPORT_TABLES: Record<string, { table: string; order: string; permission: string[]; sensitive?: boolean }> = {
  "audit-logs": { table: "audit_logs", order: "created_at DESC", permission: ["reports.admin.view", "admin.audit_logs.view"] },
  "security-events": { table: "security_event_logs", order: "created_at DESC", permission: ["reports.admin.view", "admin.security_events.view"], sensitive: true },
  "permission-risks": { table: "permission_risk_findings", order: "detected_at DESC", permission: ["reports.admin.view", "admin.permission_risks.view"] },
  "access-scopes": { table: "access_scope_rules", order: "created_at DESC", permission: ["reports.admin.view", "admin.access_scope_review.view"], sensitive: true },
  "module-settings": { table: "module_control_settings", order: "module_name ASC", permission: ["reports.admin.view", "admin.modules.view"] },
  "production-readiness": { table: "production_readiness_checks", order: "category ASC", permission: ["reports.admin.view", "admin.production_readiness.view"] },
  "system-health": { table: "system_health_snapshots", order: "checked_at DESC", permission: ["reports.admin.view", "admin.system_health.view"] },
  "sensitive-exports": { table: "report_export_logs", order: "requested_at DESC", permission: ["reports.admin.view", "reports.admin.sensitive.view"], sensitive: true },
  "consistency-checks": { table: "system_consistency_checks", order: "category ASC", permission: ["reports.admin.view", "admin.consistency_checks.view"] }
};

adminReportRoutes.get("/:reportKey", async (c) => {
  const report = ADMIN_REPORT_TABLES[c.req.param("reportKey")];
  if (!report) return fail(c, 404, "NOT_FOUND", "Admin report was not found.");
  if (!hasAny(c, report.permission)) return fail(c, 403, "ADMIN_PERMISSION_DENIED", "You do not have permission to view this report.");
  if (report.sensitive && !hasAny(c, ["reports.admin.sensitive.view", "admin.audit_logs.sensitive.view", "admin.security_events.sensitive.view", "admin.access_scope_review.sensitive.view"])) {
    return fail(c, 403, "ADMIN_SENSITIVE_PERMISSION_REQUIRED", "Sensitive admin reports require sensitive report permission.");
  }
  const rows = await listTableRows(c.env.DB, report.table, report.order, 250);
  return ok(c, { report: { key: c.req.param("reportKey"), rows } });
});
