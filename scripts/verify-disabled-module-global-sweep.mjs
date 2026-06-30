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

function hasAny(relativePath, markers, message) {
  const text = read(relativePath);
  if (!markers.some((marker) => marker instanceof RegExp ? marker.test(text) : text.includes(marker))) {
    failures.push(`${relativePath}: ${message}`);
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
  "frontend/src/routes/AppRoutes.tsx",
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
  "requireOperationalModuleMiddleware",
  "requireOperationalSubmoduleMiddleware",
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

hasAll("worker/src/utils/module-enforcement.ts", [
  "moduleControlEnabledRaw",
  "settingEnabledRaw",
  "moduleSpecificSettingEnabledRaw",
  "centralEnabled",
  "moduleSpecificSettingEnabledRaw(db, normalized, true)",
  "roster_settings",
  "attendance_settings",
  "payroll_settings",
  "asset_uniform_settings",
  "asset_module_enabled",
  "uniform_module_enabled",
  "document_compliance_settings",
  "document_compliance_enabled",
  "contract_settings",
  "contracts_enabled",
  "onboarding_settings",
  "onboarding_enabled",
  "offboarding_settings",
  "offboarding_enabled",
  "self_service_settings",
  "module_enabled AS enabled"
], "module visibility must combine central module_control_settings with module-specific settings tables");

hasNo(
  "worker/src/utils/module-enforcement.ts",
  /case "roster":[\s\S]{0,260}attendance_settings/,
  "Roster visibility must come from roster_settings, not Attendance settings"
);
hasNo(
  "worker/src/utils/module-enforcement.ts",
  /case "payroll":[\s\S]{0,260}attendance_settings/,
  "Payroll visibility must come from payroll_settings, not Attendance settings"
);
hasNo(
  "worker/src/utils/module-enforcement.ts",
  /case "leave":[\s\S]{0,260}attendance_settings/,
  "Leave visibility must not be disabled just because Attendance is disabled"
);

hasAll("worker/src/utils/action-validation.ts", [
  "validateModuleEnabledForAction",
  "isOperationalModuleEnabled",
  "disabledModuleResponse"
], "shared action validation module state enforcement");

const operationalRouteChecks = [
  {
    file: "worker/src/routes/leave.ts",
    markers: [
      /leaveRoutes\.use\("\*",\s*requireOperationalModuleMiddleware\("leave"/,
      /employeeLeaveRoutes\.use\("\*",\s*requireOperationalModuleMiddleware\("leave"/
    ],
    area: "leave operational routes use central disabled-module enforcement"
  },
  {
    file: "worker/src/routes/documents.ts",
    markers: [
      /documentRoutes\.use\("\*",\s*requireOperationalModuleMiddleware\("documents"/,
      /employeeDocumentRoutes\.use\("\*",\s*requireOperationalModuleMiddleware\("documents"/
    ],
    area: "document operational routes use central disabled-module enforcement"
  },
  {
    file: "worker/src/routes/document-compliance.ts",
    markers: [
      /documentComplianceRoutes\.use\("\*",\s*requireOperationalModuleMiddleware\("documents"/,
      /employeeDocumentComplianceRoutes\.use\("\*",\s*requireOperationalModuleMiddleware\("documents"/,
      /selfServiceDocumentComplianceRoutes\.use\("\*",\s*requireOperationalModuleMiddleware\("documents"/
    ],
    area: "document compliance routes use central disabled-module enforcement"
  },
  {
    file: "worker/src/routes/approvals.ts",
    markers: [
      /approvalRoutes\.use\("\*",\s*async/,
      /requireOperationalModuleMiddleware\("approvals"/,
      /selfServiceApprovalRoutes\.use\("\*",\s*requireOperationalModuleMiddleware\("approvals"/,
      /approvalReportRoutes\.use\("\*",\s*requireOperationalModuleMiddleware\("approvals"/,
      /approvals\/settings/,
      /approvals\/workflows/
    ],
    area: "approval operational routes use central disabled-module enforcement while settings remain reachable"
  },
  {
    file: "worker/src/routes/attendance-devices-zkteco.ts",
    markers: [
      /attendanceDeviceSyncRoutes\.use\("\*",\s*requireOperationalModuleMiddleware\("zkteco_attendance"/,
      /employeeAttendanceDeviceSyncRoutes\.use\("\*",\s*requireOperationalModuleMiddleware\("zkteco_attendance"/,
      /selfServiceAttendanceDeviceSyncRoutes\.use\("\*",\s*requireOperationalModuleMiddleware\("zkteco_attendance"/
    ],
    area: "ZKTeco attendance device routes use central disabled-module enforcement"
  },
  {
    file: "worker/src/routes/assets-notes-audit.ts",
    markers: [
      /assetRoutes\.use\("\*",\s*requireOperationalModuleMiddleware\("assets_uniforms"/,
      /employeeAssetRoutes\.use\("\/:employeeId\/assets\/\*",\s*requireOperationalModuleMiddleware\("assets_uniforms"/
    ],
    area: "asset routes use central disabled-module enforcement without blocking employee core APIs"
  },
  {
    file: "worker/src/routes/asset-uniforms-advanced.ts",
    markers: [
      /assetUniformAdvancedRoutes\.use\("\*",\s*async/,
      /uniformRoutes\.use\("\*",\s*async/,
      /requireOperationalModuleMiddleware\("assets_uniforms"/,
      /employeeAssetUniformRoutes\.use\("\/:employeeId\/assets\/\*"/,
      /employeeAssetUniformRoutes\.use\("\/:employeeId\/assets-uniforms\/\*"/,
      /employeeAssetUniformRoutes\.use\("\/:employeeId\/uniforms"/,
      /selfServiceAssetUniformRoutes\.use\("\/assets"/,
      /selfServiceAssetUniformRoutes\.use\("\/uniforms"/,
      /disabledSubmoduleResponse\(c,\s*"assets_uniforms",\s*"assets"/,
      /disabledSubmoduleResponse\(c,\s*"assets_uniforms",\s*"uniforms"/
    ],
    area: "advanced asset and uniform routes use central module/submodule enforcement without blocking employee/self-service core APIs"
  },
  {
    file: "worker/src/routes/contracts.ts",
    markers: [
      /requireOperationalModuleEnabled\(c,\s*"contracts"/,
      /disabledModuleResponse\(c,\s*"contracts"/,
      /contractRoutes\.get\("\/settings"/,
      /contractRoutes\.use\("\*",\s*async/,
      /employeeContractRoutes\.use\("\*",\s*async/,
      /selfServiceContractRoutes\.use\("\*",\s*async/
    ],
    area: "contract operational routes use central disabled-module enforcement while settings remain reachable"
  },
  {
    file: "worker/src/routes/final-settlement.ts",
    markers: [
      /requireOperationalModuleEnabled\(c,\s*"final_settlement"/,
      /disabledModuleResponse\(c,\s*"final_settlement"/,
      /finalSettlementRoutes\.get\("\/settings"/,
      /finalSettlementRoutes\.use\("\*",\s*async/,
      /employeeFinalSettlementRoutes\.use\("\*",\s*async/
    ],
    area: "final settlement routes use central disabled-module enforcement while settings remain reachable"
  },
  {
    file: "worker/src/routes/payroll.ts",
    markers: [
      /requireOperationalModuleEnabled\(c,\s*"payroll"/,
      /requireOperationalSubmoduleEnabled\(c,\s*"payroll"/,
      /disabledModuleResponse\(c,\s*"payroll"/
    ],
    area: "payroll operational routes use central module/submodule enforcement"
  },
  {
    file: "worker/src/routes/payroll-foundations.ts",
    markers: [
      /requireOperationalSubmoduleEnabled\(c,\s*"payroll"/,
      /disabledModuleResponse\(c,\s*"payroll"/,
      /custom_deductions/
    ],
    area: "payroll foundation submodule routes use central submodule enforcement"
  },
  {
    file: "worker/src/routes/attendance.ts",
    markers: [
      /requireOperationalModuleEnabled\(c,\s*"attendance"/,
      /disabledModuleResponse\(c,\s*"attendance"/,
      /path\.includes\("\/attendance\/settings"\)/
    ],
    area: "attendance routes use central disabled-module enforcement while settings remain reachable"
  },
  {
    file: "worker/src/routes/roster.ts",
    markers: [
      /requireOperationalModuleEnabled\(c,\s*"roster"/,
      /disabledModuleResponse\(c,\s*"roster"/,
      /c\.req\.path\.endsWith\("\/settings"\)/
    ],
    area: "roster routes use central disabled-module enforcement while settings remain reachable"
  },
  {
    file: "worker/src/routes/self-service.ts",
    markers: [
      /requireOperationalModuleEnabled\(c,\s*"self_service"/,
      /disabledModuleResponse\(c,\s*"self_service"/,
      /disabledSubmoduleResponse\(c,\s*"self_service"/,
      /isOperationalModuleEnabled\(c\.env\.DB,\s*"documents"/,
      /isOperationalModuleEnabled\(c\.env\.DB,\s*"assets_uniforms"/,
      /isOperationalSubmoduleEnabled\(c\.env\.DB,\s*"payroll",\s*"payslips"/,
      /getSelfServiceDashboardSummary\(c,\s*gate\.employeeId!,\s*visibility\)/,
      /requireOperationalModuleEnabled\(c,\s*"attendance"/,
      /requireOperationalModuleEnabled\(c,\s*"roster"/,
      /requireOperationalModuleEnabled\(c,\s*"leave"/,
      /requireOperationalModuleEnabled\(c,\s*"documents"/,
      /requireOperationalModuleEnabled\(c,\s*"assets_uniforms"/,
      /requireOperationalSubmoduleEnabled\(c,\s*"payroll",\s*"payslips"/,
      /requireOperationalModuleEnabled\(c,\s*"payroll"/
    ],
    area: "self-service and optional self-service module routes use central disabled-module enforcement"
  },
  {
    file: "worker/src/routes/lifecycle.ts",
    markers: [
      /requireOperationalModuleMiddleware\("onboarding"/,
      /requireOperationalModuleMiddleware\("offboarding"/,
      /onboardingRoutes\.use\("\*"/,
      /offboardingRoutes\.use\("\*"/,
      /employeeLifecycleRoutes\.use\("\/:employeeId\/onboarding\/\*"/,
      /employeeLifecycleRoutes\.use\("\/:employeeId\/offboarding\/\*"/,
      /selfServiceLifecycleRoutes\.use\("\/onboarding"/,
      /selfServiceLifecycleRoutes\.use\("\/offboarding"/
    ],
    area: "onboarding/offboarding operational routes use central disabled-module enforcement"
  },
  {
    file: "worker/src/routes/employees.ts",
    markers: [
      /requireOperationalModuleEnabled\(c,\s*"onboarding"/,
      /employeeRoutes\.get\("\/:id\/onboarding"/,
      /employeeRoutes\.patch\("\/:id\/onboarding\/:taskId"/
    ],
    area: "employee optional onboarding subfeature routes use central disabled-module enforcement"
  }
];

for (const check of operationalRouteChecks) {
  hasAll(check.file, check.markers, check.area);
}

const legacyDisabledCodes = /\b(CONTRACTS_DISABLED|PAYROLL_MODULE_DISABLED|PAYROLL_SUBMODULE_DISABLED|ATTENDANCE_MODULE_DISABLED|ROSTER_MODULE_DISABLED|ASSET_MODULE_DISABLED|UNIFORM_MODULE_DISABLED|FINAL_SETTLEMENT_MODULE_DISABLED|SELF_SERVICE_DISABLED|SELF_SERVICE_MODULE_DISABLED|CUSTOM_DEDUCTIONS_DISABLED)\b/;
[
  "worker/src/routes/leave.ts",
  "worker/src/routes/documents.ts",
  "worker/src/routes/document-compliance.ts",
  "worker/src/routes/approvals.ts",
  "worker/src/routes/attendance-devices-zkteco.ts",
  "worker/src/routes/assets-notes-audit.ts",
  "worker/src/routes/contracts.ts",
  "worker/src/routes/asset-uniforms-advanced.ts",
  "worker/src/routes/final-settlement.ts",
  "worker/src/routes/payroll.ts",
  "worker/src/routes/payroll-foundations.ts",
  "worker/src/routes/attendance.ts",
  "worker/src/routes/roster.ts",
  "worker/src/routes/self-service.ts",
  "worker/src/routes/lifecycle.ts",
  "worker/src/routes/employees.ts"
].forEach((file) => hasNo(file, legacyDisabledCodes, "disabled operational APIs must use standard MODULE_DISABLED/SUBMODULE_DISABLED response models"));

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

hasAll("frontend/src/hooks/useAuth.tsx", [
  "refreshCurrentUser: () => Promise<AuthUser | null>",
  "const refreshCurrentUser = useCallback",
  "api.me",
  "persistSession(currentToken, result.user)",
  "clearSession()"
], "auth hook exposes current-user refresh so module_visibility updates immediately after settings changes");

hasAll("frontend/src/routes/AppRoutes.tsx", [
  "OperationalRouteGate",
  "ModuleDisabledState",
  "module_visibility",
  "match?: \"any\" | \"all\"",
  "operationalAll",
  "Open Settings",
  "Enable this module from Settings to use this feature.",
  /operational\("contracts",\s*"Contracts"/,
  /operational\("leave",\s*"Leave"/,
  /operational\("documents",\s*"Documents"/,
  /operational\("approvals",\s*"Approvals"/,
  /operational\("attendance",\s*"Attendance"/,
  /operational\("zkteco_attendance",\s*"ZKTeco attendance"/,
  /operational\("assets_uniforms",\s*"Assets and uniforms"/,
  /operational\("final_settlement",\s*"Final settlement"/,
  /operational\("payroll",\s*"Payroll"/,
  /operational\("payroll_payslips",\s*"Payslips"/,
  /operational\("payroll_payment_register",\s*"Payment register"/,
  /operational\("payroll_payment_institutions",\s*"Payment institutions"/,
  /operational\("payroll_bank_loans",\s*"Bank loans"/,
  /operational\("payroll_custom_deductions",\s*"Custom deductions"/,
  /operational\("payroll_pension",\s*"Pension"/,
  /operational\("payroll_reports",\s*"Payroll reports"/,
  /operational\("roster",\s*"Roster"/,
  /operational\(\["reports",\s*"reports_exports"\],\s*"Reports"/,
  /operational\("self_service",\s*"Self-service"/,
  /path="payroll\/settings"\s+element={<PayrollSettingsPage/,
  /path="attendance\/settings"\s+element={<AttendanceSettingsPage/,
  /path="roster\/settings"\s+element={<RosterSettingsPage/,
  /path="assets\/settings"\s+element={<AssetUniformSettingsPage/,
  /path="settings"/
], "direct frontend operational routes show clean disabled-module states while settings remain reachable");

hasAll("frontend/src/routes/AppRoutes.tsx", [
  /path="self-service\/profile"\s+element={operational\("self_service"/,
  /path="self-service\/documents"\s+element={operationalAll\(\["self_service",\s*"documents"\]/,
  /path="self-service\/attendance"\s+element={operationalAll\(\["self_service",\s*"attendance"\]/,
  /path="self-service\/leave"\s+element={operationalAll\(\["self_service",\s*"leave"\]/,
  /path="self-service\/roster"\s+element={operationalAll\(\["self_service",\s*"roster"\]/,
  /path="self-service\/payroll"\s+element={operationalAll\(\["self_service",\s*"payroll"\]/,
  /path="self-service\/assets"\s+element={operationalAll\(\["self_service",\s*"assets_uniforms"\]/,
  /path="self-service\/uniforms"\s+element={operationalAll\(\["self_service",\s*"assets_uniforms"\]/
], "self-service deep links must be guarded by direct disabled-module route state");

hasAll("frontend/src/pages/SelfServicePage.tsx", [
  "moduleKeys: [\"roster\"]",
  "moduleKeys: [\"assets_uniforms\"]",
  "moduleKeys: [\"attendance\"]",
  "moduleKeys: [\"leave\"]",
  "moduleKeys: [\"documents\"]",
  "moduleKeys: [\"payroll\", \"payroll_bank_loans\"]",
  "moduleKeys: [\"payroll\", \"payroll_pension\"]",
  "moduleKeys: [\"payroll\", \"payroll_payment_methods\"]",
  "visibilityKeys",
  "navItemVisible",
  "combinedVisibility",
  "visibleNav.map",
  "self.module_visibility",
  "requestVisibility.payment_methods !== false",
  "requestVisibility.bank_loans !== false",
  "requestVisibility.pension !== false",
  "visible(\"roster\")",
  "visible(\"assets\")",
  "visible(\"payslips\")"
], "employee self-service navigation, quick actions, dashboard cards, and optional API calls must obey module visibility");
hasNo("frontend/src/pages/SelfServicePage.tsx", /nav\.map\(\(item\)/, "self-service tab strip must not render hardcoded nav items without module_visibility filtering");

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
  "moduleKey: \"assets_uniforms\"",
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
  "api.updateSelfServiceSettings",
  "refreshCurrentUser",
  "await refreshCurrentUser()",
  "useAlert",
  "alerts.showSuccess",
  "alerts.showApiError"
], "main Settings toggle control center saves settings, refreshes module visibility, and shows popup feedback");
hasNo("frontend/src/pages/PayrollAdminPages.tsx", /<ModuleToggleHeader\b/, "individual payroll settings page must not reintroduce large toggle controls");

[
  "verify:onboarding-dashboard-kpis",
  "verify:employee-core-not-blocked-by-assets",
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
