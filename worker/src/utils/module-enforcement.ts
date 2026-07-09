import type { Context } from "hono";
import type { MiddlewareHandler } from "hono";
import type { AppBindings, AuthUser, Env } from "../types";

export const MODULE_DISABLED_RESPONSE_MODEL = "MODULE_DISABLED";
export const SUBMODULE_DISABLED_RESPONSE_MODEL = "SUBMODULE_DISABLED";
export const MODULE_DISABLED_USER_MESSAGE = "This module is disabled.";
export const SETTINGS_MODULE_REENABLE_ALLOWED = "Enable this module from Settings to use this feature.";

const ALWAYS_AVAILABLE_MODULES = new Set([
  "",
  "admin",
  "admin_settings",
  "audit",
  "audit_security",
  "dashboard",
  "employees",
  "employee_360",
  "general",
  "notifications",
  "organization",
  "permissions",
  "roles",
  "search",
  "settings",
  "system",
  "users"
]);

const MODULE_KEY_ALIASES: Record<string, string> = {
  assets: "assets_uniforms",
  uniforms: "assets_uniforms",
  reports: "reports_exports",
  report: "reports_exports",
  exports: "reports_exports",
  data_import: "data_transfer",
  data_export: "data_transfer",
  zkteco: "zkteco_attendance",
  attendance_devices: "zkteco_attendance"
};

export const PAYROLL_SUBMODULE_SETTING_KEYS: Record<string, string> = {
  payslips: "payslips_enabled",
  payroll_payslips: "payslips_enabled",
  payment_register: "payment_register_enabled",
  payroll_payment_register: "payment_register_enabled",
  payment_methods: "payment_methods_enabled",
  payroll_payment_methods: "payment_methods_enabled",
  payment_institutions: "payment_institutions_enabled",
  payroll_payment_institutions: "payment_institutions_enabled",
  employee_advances: "employee_advances_enabled",
  payroll_employee_advances: "employee_advances_enabled",
  advances: "employee_advances_enabled",
  payroll_adjustments: "payroll_adjustments_enabled",
  adjustments: "payroll_adjustments_enabled",
  payroll_reports: "payroll_reports_enabled",
  bank_loans: "bank_loan_deductions_enabled",
  payroll_bank_loans: "bank_loan_deductions_enabled",
  pension: "pension_enabled",
  payroll_pension: "pension_enabled",
  custom_deductions: "custom_deductions_enabled",
  payroll_custom_deductions: "custom_deductions_enabled"
};

const MODULE_VISIBILITY_PERMISSIONS: Record<string, string[]> = {
  employees: ["employees.view"],
  employee_360: ["employees.view"],
  leave: ["leave.view", "employees.leave.view", "self_service.leave.view"],
  attendance: ["attendance.view", "employees.attendance.view", "self_service.attendance.view"],
  zkteco_attendance: ["attendance.devices.manage", "attendance.raw_logs.view", "reports.attendance_devices.view"],
  roster: ["roster.view", "employees.roster.view", "self_service.roster.view"],
  payroll: ["payroll.view", "employees.payroll.view", "self_service.payroll.view"],
  payroll_payslips: ["payroll.payslips.view", "payroll.view", "self_service.payroll.view"],
  payroll_payment_register: ["payroll.payment_register.view", "payroll.view"],
  payroll_employee_advances: ["payroll.advances.view", "payroll.view"],
  payroll_bank_loans: ["payroll.bank_loans.view", "reports.bank_loans.view", "payroll.view"],
  payroll_pension: ["payroll.pension_contributions.view", "reports.pension.view", "payroll.view"],
  payroll_custom_deductions: ["payroll.employee_custom_deductions.view", "reports.custom_deductions.view", "payroll.view"],
  payroll_payment_methods: ["payroll.payment_methods.view", "payroll.view"],
  payroll_payment_institutions: ["payroll.payment_institutions.view", "payroll.view"],
  documents: ["documents.view", "self_service.documents.compliance.view"],
  document_compliance: ["documents.compliance.view", "self_service.documents.compliance.view"],
  contracts: ["contracts.view", "employees.contracts.view", "self_service.contracts.view"],
  assets_uniforms: ["assets.view", "employees.assets.view", "self_service.assets.view"],
  assets: ["assets.view", "employees.assets.view", "self_service.assets.view"],
  uniforms: ["assets.view", "uniforms.view", "self_service.uniforms.view"],
  final_settlement: ["final_settlement.view", "employees.final_settlement.view"],
  approvals: ["approvals.view", "approvals.inbox.view", "self_service.approvals.view"],
  onboarding: ["onboarding.dashboard.view", "onboarding.cases.view", "employees.lifecycle.view", "self_service.onboarding.view"],
  offboarding: ["offboarding.dashboard.view", "offboarding.cases.view", "employees.lifecycle.view", "self_service.offboarding.view"],
  reports: ["reports.view"],
  reports_exports: ["reports.view"],
  self_service: ["self_service.view"],
  data_transfer: ["data_import.view", "data_export.view", "data_transfer.settings.view"],
  admin_settings: ["admin.settings_hub.view", "settings.view"]
};

function bool(value: unknown, fallback = true) {
  if (value === null || value === undefined) return fallback;
  return Number(value) === 1 || value === true || value === "1";
}

export function normalizeOperationalModuleKey(moduleKey: string | null | undefined) {
  const key = String(moduleKey ?? "").trim();
  return MODULE_KEY_ALIASES[key] ?? key;
}

function hasAny(user: Pick<AuthUser, "permissions" | "is_owner"> | undefined, permissions: string[]) {
  if (!user) return true;
  return user.is_owner || permissions.some((permission) => user.permissions.includes(permission));
}

async function moduleControlEnabledRaw(db: Env["DB"], moduleKey: string, fallback = true) {
  try {
    const row = await db
      .prepare("SELECT is_enabled, status FROM module_control_settings WHERE module_key = ?")
      .bind(moduleKey)
      .first<{ is_enabled: unknown; status: string | null }>();
    if (!row) return fallback;
    return bool(row.is_enabled, fallback) && String(row.status ?? "ACTIVE") !== "DISABLED";
  } catch {
    return fallback;
  }
}

async function settingEnabledRaw(db: Env["DB"], sql: string, fallback = true) {
  try {
    const row = await db.prepare(sql).first<{ enabled: unknown }>();
    if (!row) return fallback;
    return bool(row.enabled, fallback);
  } catch {
    return fallback;
  }
}

export function disabledModulePayload(moduleKey: string, moduleLabel?: string) {
  const label = moduleLabel || moduleKey.replace(/_/g, " ");
  return {
    code: MODULE_DISABLED_RESPONSE_MODEL,
    message: `${label.charAt(0).toUpperCase()}${label.slice(1)} module is disabled.`,
    module: moduleKey,
    state: "Disabled",
    guidance: SETTINGS_MODULE_REENABLE_ALLOWED
  };
}

export function disabledSubmodulePayload(moduleKey: string, submoduleKey: string, submoduleLabel?: string, options: { parentDisabled?: boolean } = {}) {
  const label = submoduleLabel || submoduleKey.replace(/_/g, " ");
  const moduleLabel = moduleKey.replace(/_/g, " ");
  return {
    code: SUBMODULE_DISABLED_RESPONSE_MODEL,
    message: options.parentDisabled
      ? `${label.charAt(0).toUpperCase()}${label.slice(1)} is disabled because ${moduleLabel} is disabled.`
      : `${label.charAt(0).toUpperCase()}${label.slice(1)} is disabled.`,
    module: moduleKey,
    submodule: submoduleKey,
    parent_disabled: Boolean(options.parentDisabled),
    parent_module: options.parentDisabled ? moduleKey : null,
    state: "Disabled",
    guidance: options.parentDisabled ? `Enable ${moduleLabel} from Settings to use this feature.` : SETTINGS_MODULE_REENABLE_ALLOWED
  };
}

export function disabledModuleResponse(c: Context<AppBindings>, moduleKey: string, moduleLabel?: string) {
  const payload = disabledModulePayload(moduleKey, moduleLabel);
  return c.json({ ok: false, error: payload }, 403);
}

export function disabledSubmoduleResponse(c: Context<AppBindings>, moduleKey: string, submoduleKey: string, submoduleLabel?: string, options: { parentDisabled?: boolean } = {}) {
  const payload = disabledSubmodulePayload(moduleKey, submoduleKey, submoduleLabel, options);
  return c.json({ ok: false, error: payload }, 403);
}

export async function isOperationalModuleEnabled(db: Env["DB"], moduleKey: string | null | undefined): Promise<boolean> {
  const normalized = normalizeOperationalModuleKey(moduleKey);
  if (ALWAYS_AVAILABLE_MODULES.has(normalized)) return true;
  if (PAYROLL_SUBMODULE_SETTING_KEYS[normalized]) {
    return isOperationalSubmoduleEnabled(db, "payroll", normalized);
  }
  return moduleControlEnabledRaw(db, normalized, true);
}

export async function isOperationalSubmoduleEnabled(db: Env["DB"], moduleKey: string, submoduleKey: string | null | undefined): Promise<boolean> {
  const normalizedModule = normalizeOperationalModuleKey(moduleKey);
  const rawSubmodule = String(submoduleKey ?? "").trim();
  const normalizedSubmodule = normalizeOperationalModuleKey(submoduleKey);
  if (!(await isOperationalModuleEnabled(db, normalizedModule))) return false;
  if (normalizedModule === "assets_uniforms") {
    if (rawSubmodule === "uniforms" || rawSubmodule === "uniform") {
      return settingEnabledRaw(db, "SELECT uniform_module_enabled AS enabled FROM asset_uniform_settings WHERE id = 'asset_uniform_settings_default'", true);
    }
    if (rawSubmodule === "assets" || rawSubmodule === "asset") {
      return settingEnabledRaw(db, "SELECT asset_module_enabled AS enabled FROM asset_uniform_settings WHERE id = 'asset_uniform_settings_default'", true);
    }
    return true;
  }
  if (normalizedModule !== "payroll") return isOperationalModuleEnabled(db, normalizedSubmodule);
  const settingKey = PAYROLL_SUBMODULE_SETTING_KEYS[normalizedSubmodule];
  if (!settingKey) return true;
  if (!(await moduleControlEnabledRaw(db, normalizedSubmodule, true))) return false;
  try {
    const row = await db
      .prepare(`SELECT module_enabled, ${settingKey} AS submodule_enabled FROM payroll_settings WHERE id = 'payroll_settings_default'`)
      .first<{ module_enabled: unknown; submodule_enabled: unknown }>();
    if (!row) return true;
    return bool(row.module_enabled, true) && bool(row.submodule_enabled, true);
  } catch {
    return true;
  }
}

export async function getOperationalSubmoduleState(db: Env["DB"], moduleKey: string, submoduleKey: string | null | undefined): Promise<{ enabled: boolean; parentDisabled: boolean; module: string; submodule: string }> {
  const normalizedModule = normalizeOperationalModuleKey(moduleKey);
  const normalizedSubmodule = normalizeOperationalModuleKey(submoduleKey);
  if (!(await isOperationalModuleEnabled(db, normalizedModule))) {
    return { enabled: false, parentDisabled: true, module: normalizedModule, submodule: normalizedSubmodule };
  }
  return {
    enabled: await isOperationalSubmoduleEnabled(db, normalizedModule, normalizedSubmodule),
    parentDisabled: false,
    module: normalizedModule,
    submodule: normalizedSubmodule
  };
}

export async function requireOperationalModuleEnabled(c: Context<AppBindings>, moduleKey: string, moduleLabel?: string) {
  return (await isOperationalModuleEnabled(c.env.DB, moduleKey)) ? null : disabledModuleResponse(c, normalizeOperationalModuleKey(moduleKey), moduleLabel);
}

export async function requireOperationalSubmoduleEnabled(c: Context<AppBindings>, moduleKey: string, submoduleKey: string, submoduleLabel?: string) {
  const state = await getOperationalSubmoduleState(c.env.DB, moduleKey, submoduleKey);
  return state.enabled ? null : disabledSubmoduleResponse(c, state.module, state.submodule, submoduleLabel, { parentDisabled: state.parentDisabled });
}

export function requireOperationalModuleMiddleware(moduleKey: string, moduleLabel?: string): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const disabled = await requireOperationalModuleEnabled(c, moduleKey, moduleLabel);
    if (disabled) return disabled;
    await next();
  };
}

export function requireOperationalSubmoduleMiddleware(moduleKey: string, submoduleKey: string, submoduleLabel?: string): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const disabled = await requireOperationalSubmoduleEnabled(c, moduleKey, submoduleKey, submoduleLabel);
    if (disabled) return disabled;
    await next();
  };
}

type ModuleStateSnapshot = Record<string, boolean>;
const MODULE_STATE_CACHE_TTL_MS = 15000;
let moduleStateCache: { expiresAt: number; value: ModuleStateSnapshot } | null = null;

function rowFlag(row: Record<string, unknown> | null | undefined, key: string, fallback = true) {
  return bool(row?.[key], fallback);
}

async function getOperationalModuleStateSnapshot(db: Env["DB"]): Promise<ModuleStateSnapshot> {
  const now = Date.now();
  if (moduleStateCache && moduleStateCache.expiresAt > now) {
    return moduleStateCache.value;
  }
  const [
    controls,
    attendance,
    attendanceDevice,
    roster,
    payroll,
    documentCompliance,
    contracts,
    assets,
    finalSettlement,
    approvals,
    onboarding,
    offboarding,
    selfService
  ] = await Promise.all([
    db.prepare("SELECT module_key, is_enabled, status FROM module_control_settings").all<{ module_key: string; is_enabled: unknown; status: string | null }>(),
    db.prepare("SELECT module_enabled FROM attendance_settings WHERE id = 'attendance_settings_default'").first<Record<string, unknown>>().catch(() => null),
    db.prepare("SELECT zkteco_csv_import_enabled FROM attendance_device_settings WHERE id = 'attendance_device_settings_default'").first<Record<string, unknown>>().catch(() => null),
    db.prepare("SELECT module_enabled FROM roster_settings WHERE id = 'roster_settings_default'").first<Record<string, unknown>>().catch(() => null),
    db.prepare(
      `SELECT module_enabled, payslips_enabled, payment_register_enabled, payment_methods_enabled,
              payment_institutions_enabled, employee_advances_enabled, bank_loan_deductions_enabled,
              pension_enabled, custom_deductions_enabled
       FROM payroll_settings WHERE id = 'payroll_settings_default'`
    ).first<Record<string, unknown>>().catch(() => null),
    db.prepare("SELECT document_compliance_enabled FROM document_compliance_settings ORDER BY created_at LIMIT 1").first<Record<string, unknown>>().catch(() => null),
    db.prepare("SELECT contracts_enabled FROM contract_settings ORDER BY created_at LIMIT 1").first<Record<string, unknown>>().catch(() => null),
    db.prepare("SELECT asset_module_enabled, uniform_module_enabled FROM asset_uniform_settings WHERE id = 'asset_uniform_settings_default'").first<Record<string, unknown>>().catch(() => null),
    db.prepare("SELECT module_enabled, final_settlement_enabled FROM final_settlement_settings WHERE id = 'final_settlement_settings_default'").first<Record<string, unknown>>().catch(() => null),
    db.prepare("SELECT approval_workflows_enabled FROM approval_workflow_settings WHERE id = 'approval_workflow_settings_default'").first<Record<string, unknown>>().catch(() => null),
    db.prepare("SELECT onboarding_enabled FROM onboarding_settings WHERE id = 'onboarding_settings_default'").first<Record<string, unknown>>().catch(() => null),
    db.prepare("SELECT offboarding_enabled FROM offboarding_settings WHERE id = 'offboarding_settings_default'").first<Record<string, unknown>>().catch(() => null),
    db.prepare("SELECT module_enabled FROM self_service_settings WHERE id = 'self_service_settings_default'").first<Record<string, unknown>>().catch(() => null)
  ]);

  const controlMap = new Map(controls.results.map((row) => [
    normalizeOperationalModuleKey(row.module_key),
    bool(row.is_enabled, true) && String(row.status ?? "ACTIVE") !== "DISABLED"
  ]));
  const central = (key: string, fallback = true) => controlMap.get(normalizeOperationalModuleKey(key)) ?? fallback;
  const attendanceEnabled = central("attendance") && rowFlag(attendance, "module_enabled", true);
  const payrollEnabled = central("payroll") && rowFlag(payroll, "module_enabled", true);
  const assetsEnabled = central("assets_uniforms") && rowFlag(assets, "asset_module_enabled", true);
  const uniformsEnabled = central("assets_uniforms") && rowFlag(assets, "uniform_module_enabled", true);
  const documentComplianceEnabled = central("document_compliance") && rowFlag(documentCompliance, "document_compliance_enabled", true);

  const snapshot = {
    employees: true,
    employee_360: true,
    leave: central("leave"),
    attendance: attendanceEnabled,
    zkteco_attendance: attendanceEnabled && central("zkteco_attendance") && rowFlag(attendanceDevice, "zkteco_csv_import_enabled", true),
    roster: central("roster") && rowFlag(roster, "module_enabled", true),
    payroll: payrollEnabled,
    payroll_payslips: payrollEnabled && rowFlag(payroll, "payslips_enabled", true),
    payroll_payment_register: payrollEnabled && rowFlag(payroll, "payment_register_enabled", true),
    payroll_employee_advances: payrollEnabled && rowFlag(payroll, "employee_advances_enabled", true),
    payroll_bank_loans: payrollEnabled && rowFlag(payroll, "bank_loan_deductions_enabled", true),
    payroll_pension: payrollEnabled && rowFlag(payroll, "pension_enabled", true),
    payroll_custom_deductions: payrollEnabled && rowFlag(payroll, "custom_deductions_enabled", true),
    payroll_payment_methods: payrollEnabled && rowFlag(payroll, "payment_methods_enabled", true),
    payroll_payment_institutions: payrollEnabled && rowFlag(payroll, "payment_institutions_enabled", true),
    documents: central("documents") && documentComplianceEnabled,
    document_compliance: documentComplianceEnabled,
    contracts: central("contracts") && rowFlag(contracts, "contracts_enabled", true),
    assets_uniforms: assetsEnabled || uniformsEnabled,
    assets: assetsEnabled,
    uniforms: uniformsEnabled,
    final_settlement: central("final_settlement") && rowFlag(finalSettlement, "module_enabled", true) && rowFlag(finalSettlement, "final_settlement_enabled", true),
    approvals: central("approvals") && rowFlag(approvals, "approval_workflows_enabled", true),
    onboarding: central("onboarding") && rowFlag(onboarding, "onboarding_enabled", true),
    offboarding: central("offboarding") && rowFlag(offboarding, "offboarding_enabled", true),
    reports: central("reports_exports"),
    reports_exports: central("reports_exports"),
    self_service: central("self_service") && rowFlag(selfService, "module_enabled", true),
    data_transfer: central("data_transfer"),
    admin_settings: true,
    notifications: true
  };
  moduleStateCache = { expiresAt: now + MODULE_STATE_CACHE_TTL_MS, value: snapshot };
  return snapshot;
}

export async function getModuleVisibilityForUser(db: Env["DB"], user?: Pick<AuthUser, "permissions" | "is_owner">) {
  const keys = Object.keys(MODULE_VISIBILITY_PERMISSIONS);
  const moduleStates = await getOperationalModuleStateSnapshot(db);
  const entries = keys.map((key) => {
    const permitted = hasAny(user, MODULE_VISIBILITY_PERMISSIONS[key]);
    const enabled = moduleStates[key] ?? true;
    return [key, permitted && enabled] as const;
  });
  const visibility = Object.fromEntries(entries);
  visibility.settings = hasAny(user, ["settings.view", "admin.settings_hub.view", "admin.modules.view"]);
  visibility.admin = hasAny(user, ["admin.settings_hub.view", "admin.modules.view", "admin.help.view"]);
  visibility.users = hasAny(user, ["users.view", "roles.view"]);
  visibility.organization = hasAny(user, ["organization.view", "settings.view"]);
  visibility.notifications = hasAny(user, ["notifications.view", "self_service.notifications.view", "notifications.manage"]) && (moduleStates.notifications ?? true);
  return visibility;
}

export async function filterDisabledOperationalModules<T extends { moduleKey?: string; module?: string; submoduleKey?: string }>(db: Env["DB"], items: T[]) {
  const output: T[] = [];
  for (const item of items) {
    const moduleKey = item.moduleKey ?? item.module ?? "";
    const enabled = item.submoduleKey
      ? await isOperationalSubmoduleEnabled(db, moduleKey, item.submoduleKey)
      : await isOperationalModuleEnabled(db, moduleKey);
    if (enabled) output.push(item);
  }
  return output;
}
