import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function has(relativePath, marker, message) {
  const text = read(relativePath);
  const ok = marker instanceof RegExp ? marker.test(text) : text.includes(marker);
  if (!ok) failures.push(`${relativePath}: ${message}`);
}

function hasAll(relativePath, markers, area) {
  for (const marker of markers) {
    has(relativePath, marker, `${area} missing ${String(marker)}`);
  }
}

function hasNo(relativePath, pattern, message) {
  const text = read(relativePath);
  if (pattern.test(text)) failures.push(`${relativePath}: ${message}`);
}

function requireScript(scriptName) {
  const pkg = JSON.parse(read("package.json"));
  if (!pkg.scripts?.[scriptName]) failures.push(`package.json: missing ${scriptName}`);
}

[
  "worker/src/utils/module-enforcement.ts",
  "worker/src/utils/action-validation.ts",
  "worker/src/db/users.ts",
  "worker/src/routes/sync.ts",
  "worker/src/routes/search.ts",
  "worker/src/routes/notifications.ts",
  "worker/src/routes/dashboard.ts",
  "worker/src/routes/reports.ts",
  "worker/src/routes/data-transfer.ts",
  "frontend/src/layouts/AppShell.tsx",
  "frontend/src/types/auth.ts"
].forEach((file) => {
  if (!exists(file)) failures.push(`${file}: missing required disabled-module sweep file`);
});

requireScript("verify:disabled-module-global-sweep");

hasAll("worker/src/utils/module-enforcement.ts", [
  "MODULE_DISABLED_RESPONSE_MODEL",
  "SUBMODULE_DISABLED_RESPONSE_MODEL",
  "SETTINGS_MODULE_REENABLE_ALLOWED",
  "disabledModuleResponse",
  "disabledSubmoduleResponse",
  "isOperationalModuleEnabled",
  "isOperationalSubmoduleEnabled",
  "requireOperationalModuleEnabled",
  "requireOperationalSubmoduleEnabled",
  "getModuleVisibilityForUser",
  "filterDisabledOperationalModules",
  "PAYROLL_SUBMODULE_SETTING_KEYS",
  "assets_uniforms",
  "reports_exports",
  "bank_loan_deductions_enabled",
  "payment_register_enabled",
  "This module is disabled",
  "Enable this module from Settings to use this feature."
], "shared backend module-disabled helper");

hasAll("worker/src/utils/action-validation.ts", [
  "validateModuleEnabledForAction",
  "isOperationalModuleEnabled",
  "disabledModuleResponse"
], "shared action validation module state enforcement");

hasAll("worker/src/db/users.ts", [
  "getModuleVisibilityForUser",
  "module_visibility"
], "auth user module visibility");
has("worker/src/types.ts", "module_visibility?: Record<string, boolean>", "worker AuthUser carries module visibility");
has("frontend/src/types/auth.ts", "module_visibility?: Record<string, boolean>", "frontend AuthUser carries module visibility");

hasAll("worker/src/routes/sync.ts", [
  "getModuleVisibilityForUser",
  "module_visibility",
  "await canOpenModule",
  "SYNC_MODULE_NOT_FOUND"
], "sync bootstrap and targeted pulls respect module visibility");

hasAll("frontend/src/layouts/AppShell.tsx", [
  "moduleKey?: string | string[]",
  "moduleIsVisible",
  "module_visibility",
  "moduleKey: \"attendance\"",
  "moduleKey: \"roster\"",
  "moduleKey: \"leave\"",
  "moduleKey: \"payroll\"",
  "moduleKey: \"documents\"",
  "moduleKey: \"contracts\"",
  "moduleKey: \"assets_uniforms\"",
  "moduleKey: [\"reports\", \"reports_exports\"]",
  "moduleKey: \"onboarding\"",
  "moduleKey: \"offboarding\"",
  "moduleKey: \"approvals\"",
  "moduleKey: \"self_service\""
], "sidebar/nav hides disabled operational entries while settings remain permission-controlled");
hasNo("frontend/src/layouts/AppShell.tsx", /moduleKey:\s*"settings"/, "settings navigation must not be hidden by operational module toggles");

hasAll("worker/src/routes/dashboard.ts", [
  "moduleControlEnabled(db, \"assets_uniforms\")",
  "moduleControlEnabled(db, \"zkteco_attendance\")",
  "enabledModules",
  "priorityActions",
  "safeDashboardSummaryGroup",
  "payroll_payslips",
  "payroll_payment_register",
  "payroll_bank_loans",
  "payroll_pension",
  "payroll_custom_deductions"
], "Command Center hides disabled module/submodule groups, cards, and priority actions");

hasAll("worker/src/routes/search.ts", [
  "SEARCH_SETTINGS_MODULES",
  "isOperationalModuleEnabled",
  "isOperationalSubmoduleEnabled",
  "isSearchableModuleEnabled",
  "quickLinksForUser(db",
  "await quickLinksForUser(c.env.DB",
  "moduleAllowed",
  "payslips"
], "global search skips disabled modules and disabled payroll submodules");

hasAll("worker/src/routes/notifications.ts", [
  "NOTIFICATION_ALWAYS_VISIBLE_MODULES",
  "notificationModuleVisible",
  "isOperationalModuleEnabled",
  "NOTIFICATION_NOT_FOUND"
], "notification lists/counts hide disabled operational module notifications");
hasNo("worker/src/routes/notifications.ts", /admin\.modules\.view[\s\S]{0,120}enabledRows\.push/, "admin permissions must not leak disabled operational notifications into normal lists");

hasAll("worker/src/routes/reports.ts", [
  "reportModuleEnabled",
  "requireReportModuleEnabled",
  "disabledModuleResponse",
  "Object.entries(reportConfigs)",
  "if (!(await reportModuleEnabled(c, config))) continue",
  "const disabled = await requireReportModuleEnabled"
], "reports catalog and direct report/export endpoints enforce disabled modules");

hasAll("worker/src/routes/data-transfer.ts", [
  "submoduleKey?: string",
  "dataTransferDefinitionEnabled",
  "dataTransferDisabledResponse",
  "enabledImportTypes",
  "enabledExportTypes",
  "importDefinitionForBatch",
  "disabledModuleResponse",
  "disabledSubmoduleResponse",
  "submoduleKey: \"bank_loans\"",
  "submoduleKey: \"pension\"",
  "submoduleKey: \"custom_deductions\"",
  "submoduleKey: \"payment_methods\"",
  "submoduleKey: \"payslips\"",
  "WHERE import_type IN"
], "data import/export actions and templates respect disabled module/submodule state");

hasAll("worker/src/routes/lifecycle.ts", [
  "optional_section_states",
  "Disabled",
  "NOT_REQUIRED",
  "moduleStatuses",
  "isModuleEnabled",
  "This setup is not required because the module is disabled."
], "onboarding/offboarding optional disabled modules become Disabled/Not Required");
hasAll("frontend/src/pages/LifecyclePage.tsx", [
  "No Permission",
  "Disabled",
  "Not Required",
  "showApiError",
  "optional_section_states"
], "onboarding workspace displays distinct disabled/no-permission/not-required states");

hasAll("frontend/src/lib/alert-utils.ts", [
  "isModuleDisabledError",
  "MODULE_DISABLED",
  "SUBMODULE_DISABLED",
], "global popup alerts map MODULE_DISABLED/SUBMODULE_DISABLED");
hasAll("frontend/src/components/alerts/AlertProvider.tsx", [
  "module-disabled",
  "Module disabled",
  "showModuleDisabled"
], "module-disabled popup alert exists");

hasAll("frontend/src/pages/SettingsPage.tsx", [
  "ModuleTogglePill",
  "SettingsToggleGroup",
  "Open",
  ">|</span>",
  "api.updatePayrollSettings",
  "api.updateOnboardingSettings",
  "api.updateSelfServiceSettings"
], "main Settings toggle control center remains intact");
hasNo("frontend/src/pages/PayrollAdminPages.tsx", /<ModuleToggleHeader\b/, "individual payroll settings page must not reintroduce large toggle controls");

[
  "verify:onboarding-dashboard-kpis",
  "verify:dependency-security-cleanup",
  "verify:professional-app-loader",
  "verify:global-popup-alerts",
  "verify:form-action-validation-hardening",
  "verify:employee-user-account-linking",
  "verify:import-export-standardization",
  "verify:button-color-standardization",
  "verify:frontend-static-assets",
  "verify:frontend-bundle-integrity",
  "verify:filter-search-date-standardization",
  "verify:command-center-dashboard",
  "verify:settings-toggles-tabs-layout",
  "verify:payroll-submodules",
  "verify:onboarding-workspace",
  "verify:performance-optimization",
  "verify:global-search-notifications",
  "verify:shadcn-navigation-tabs",
  "verify:navigation-tabs",
  "verify:page-layout-consistency"
].forEach(requireScript);

[
  "frontend/src/layouts/AppShell.tsx",
  "frontend/src/pages/LifecyclePage.tsx",
  "frontend/src/lib/alert-utils.ts",
  "worker/src/routes/search.ts",
  "worker/src/routes/notifications.ts",
  "worker/src/routes/reports.ts",
  "worker/src/routes/data-transfer.ts"
].forEach((file) => hasNo(file, /\b(window\.)?(alert|confirm|prompt)\s*\(/, "browser alert/confirm/prompt must not be used"));

[
  "frontend/src/layouts/AppShell.tsx",
  "frontend/src/pages/LifecyclePage.tsx"
].forEach((file) => hasNo(file, /\bdark:/, "dark mode classes must not be introduced"));

const wrangler = read("worker/wrangler.toml");
if (!wrangler.includes('binding = "DB"') || !wrangler.includes('database_name = "hrm-v2"') || !wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"')) {
  failures.push("worker/wrangler.toml: D1 binding changed");
}
if (!wrangler.includes('binding = "DOCUMENTS_BUCKET"') || !wrangler.includes('bucket_name = "hrm-v2-documents"')) {
  failures.push("worker/wrangler.toml: R2 binding changed");
}
has("worker/src/auth/password.ts", "100000", "PBKDF2 remains 100000");

if (failures.length) {
  console.error("Disabled-module global sweep verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Disabled-module global sweep verification passed.");
