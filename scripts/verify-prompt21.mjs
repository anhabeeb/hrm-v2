import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const failures = [];

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`Missing file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function exists(relativePath) {
  if (!fs.existsSync(path.join(root, relativePath))) failures.push(`Missing file: ${relativePath}`);
}

function has(content, marker, label = marker) {
  if (!content.includes(marker)) failures.push(`Missing marker: ${label}`);
}

function notHas(content, marker, label = marker) {
  if (content.includes(marker)) failures.push(`Unexpected marker: ${label}`);
}

function noBrowserDialogs(relativePath) {
  const content = read(relativePath);
  for (const marker of ["window.prompt", "window.confirm", "window.alert", "prompt(", "confirm(", "alert("]) {
    if (content.includes(marker)) failures.push(`Browser dialog marker ${marker} found in ${relativePath}`);
  }
}

function nodeCheck(relativePath) {
  const result = spawnSync(process.execPath, ["--check", path.join(root, relativePath)], { encoding: "utf8" });
  if (result.status !== 0) failures.push(`node --check failed for ${relativePath}: ${result.stderr || result.stdout}`);
}

const schema = read("database/schema.sql");
const seed = read("database/seed.sql");
const adminRoute = read("worker/src/routes/admin.ts");
const index = read("worker/src/index.ts");
const appRoutes = read("frontend/src/routes/AppRoutes.tsx");
const adminPage = read("frontend/src/pages/AdminSettingsPage.tsx");
const settingsPage = read("frontend/src/pages/SettingsPage.tsx");
const appShell = read("frontend/src/layouts/AppShell.tsx");
const api = read("frontend/src/lib/api.ts");
const packageJson = JSON.parse(read("package.json") || "{}");
const workerWrangler = read("worker/wrangler.toml");
const rootWrangler = read("wrangler.toml");
const password = read("worker/src/auth/password.ts");

for (const script of [
  "verify:baseline-prompts1-5",
  "verify:prompt8",
  "verify:prompt9",
  "verify:recovery-prompts6-9",
  "verify:prompt10",
  "verify:prompt11",
  "verify:prompt12",
  "verify:prompt12b",
  "verify:prompt12-final",
  "verify:prompt13",
  "verify:prompt14",
  "verify:prompt15",
  "verify:prompt16",
  "verify:prompt17",
  "verify:prompt18",
  "verify:prompt19",
  "verify:prompt20",
  "verify:prompt21"
]) {
  if (!packageJson.scripts?.[script]) failures.push(`Missing package script: ${script}`);
}

for (const table of [
  "module_control_settings",
  "system_consistency_checks",
  "security_event_logs",
  "permission_risk_findings",
  "security_settings",
  "system_health_snapshots",
  "data_retention_settings",
  "export_security_settings",
  "production_readiness_checks",
  "admin_system_alerts"
]) {
  has(schema, `CREATE TABLE IF NOT EXISTS ${table}`, `schema table ${table}`);
}

for (const permission of [
  "admin.settings_hub.view",
  "admin.modules.view",
  "admin.consistency_checks.run",
  "admin.audit_logs.sensitive.view",
  "admin.security_events.view",
  "admin.permission_risks.run",
  "admin.access_scope_review.view",
  "admin.security_settings.update",
  "admin.system_health.refresh",
  "admin.production_readiness.run",
  "admin.environment_safety.run",
  "admin.data_retention.update",
  "admin.export_security.update",
  "admin.system_alerts.manage",
  "reports.admin.view",
  "reports.admin.sensitive.view"
]) {
  has(seed, permission, `seed permission ${permission}`);
  has(adminRoute + api + adminPage, permission.split(".").slice(0, 2).join(".") || permission, `admin implementation marker ${permission}`);
}

for (const routeMarker of [
  'app.route("/api/v1/admin", adminRoutes)',
  'app.route("/api/v1/reports/admin", adminReportRoutes)',
  "settings/admin",
  "AdminSettingsPage",
  "Admin controls & production readiness"
]) {
  has(index + appRoutes + adminPage + settingsPage + appShell, routeMarker, `route/UI marker ${routeMarker}`);
}

for (const helper of [
  "getModuleControlStatus",
  "getModuleDependencyWarnings",
  "updateModuleEnabledState",
  "getModuleImpactSummary",
  "runSystemConsistencyChecks",
  "checkModuleConfigurationConsistency",
  "checkPermissionConfigurationConsistency",
  "checkSecurityConfigurationConsistency",
  "checkProductionReadinessConsistency",
  "createSecurityEventLog",
  "logFailedPermissionCheck",
  "logProtectedUserModificationAttempt",
  "logSelfServiceScopeViolation",
  "logSensitiveExportEvent",
  "runPermissionSanityChecks",
  "detectRolePermissionRisks",
  "detectUserScopeRisks",
  "detectSelfServicePermissionRisks",
  "detectSensitiveExportRisks",
  "assertProtectedAdminCanBeModified",
  "preventLastProtectedAdminRemoval",
  "preventProtectedAdminOffboardingDeactivation",
  "isProtectedAdminUser",
  "logProtectedAdminSecurityEvent",
  "getAccessScopeReview",
  "summarizeUserAccessScopes",
  "detectBroadAccessScopeWarnings",
  "getSystemHealthSummary",
  "checkD1Connectivity",
  "checkR2BindingPresence",
  "checkSchemaReadinessStatus",
  "checkModuleHealthStatus",
  "checkExportHealthStatus",
  "runProductionReadinessChecks",
  "getProductionReadinessChecklist",
  "checkRequiredVerifiersPresent",
  "checkNoSecretFilesPackagedMarker",
  "checkBuildChunkWarningStatusMarker",
  "checkEnvironmentSafety",
  "checkCloudflareBindings",
  "checkSecretFileExposureMarkers",
  "checkDatabaseBindingIdentity"
]) {
  has(adminRoute, helper, `admin helper ${helper}`);
}

for (const apiHelper of [
  "getAdminSettingsHub",
  "listAdminModules",
  "runAdminConsistencyChecks",
  "listAdminAuditLogs",
  "listAdminSecurityEvents",
  "runPermissionRisks",
  "getAccessScopeReview",
  "getAdminSecuritySettings",
  "getSystemHealth",
  "getRemoteSchemaToolsStatus",
  "getDataRetentionSettings",
  "getExportSecuritySettings",
  "getProductionReadiness",
  "getEnvironmentSafety",
  "listAdminSystemAlerts",
  "getAdminReport"
]) {
  has(api, apiHelper, `frontend API helper ${apiHelper}`);
}

for (const remoteScript of [
  "scripts/audit-remote-d1-schema.mjs",
  "scripts/generate-remote-d1-repair.mjs",
  "scripts/apply-remote-d1-repair.mjs",
  "scripts/verify-remote-d1-schema-ready.mjs"
]) {
  exists(remoteScript);
  nodeCheck(remoteScript);
}

has(workerWrangler + rootWrangler, 'database_name = "hrm-v2"', "D1 database name");
has(workerWrangler + rootWrangler, 'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"', "D1 database id");
has(workerWrangler + rootWrangler, 'binding = "DOCUMENTS_BUCKET"', "R2 binding");
has(workerWrangler + rootWrangler, 'bucket_name = "hrm-v2-documents"', "R2 bucket");
has(password, "100000", "PBKDF2 100000");
has(appRoutes, "lazyPage", "Prompt 13 lazy loading marker");
has(appRoutes, "Suspense", "Prompt 13 Suspense marker");

notHas(adminRoute + adminPage, "wrangler d1 execute", "browser-based remote D1 repair");
notHas(adminRoute + adminPage, "MFA_REQUIRED", "real MFA implementation");
notHas(adminRoute + adminPage, "sendSms", "real SMS integration");
notHas(adminRoute + adminPage, "sendEmail", "real email integration");
notHas(adminRoute, "DELETE FROM audit_logs", "automatic audit log deletion");
notHas(adminRoute, "DELETE FROM security_event_logs", "automatic security log deletion");
noBrowserDialogs("frontend/src/pages/AdminSettingsPage.tsx");

for (const secretFile of [".env", ".env.local", ".dev.vars"]) {
  if (fs.existsSync(path.join(root, secretFile))) failures.push(`Secret/local env file present in project root: ${secretFile}`);
}

for (const previousMarker of [
  "self_service_settings",
  "leave_balance_cycles",
  "requireAttendanceModuleEnabled",
  "requireRosterModuleEnabled",
  "payroll_employee_results",
  "final_settlement_cases",
  "document_renewal_cases",
  "approval_workflows",
  "attendance_import_batches",
  "onboarding_cases"
]) {
  has(schema + read("worker/src/routes/self-service.ts") + read("worker/src/routes/leave.ts") + read("worker/src/routes/attendance.ts") + read("worker/src/routes/roster.ts") + read("worker/src/routes/payroll.ts") + read("worker/src/routes/final-settlement.ts") + read("worker/src/routes/document-compliance.ts") + read("worker/src/routes/approvals.ts") + read("worker/src/routes/lifecycle.ts"), previousMarker, `previous prompt marker ${previousMarker}`);
}

if (failures.length) {
  console.error("Prompt 21 verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Prompt 21 verification passed.");
