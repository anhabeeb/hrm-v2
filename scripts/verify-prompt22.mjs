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

function exists(relativePath, label = relativePath) {
  if (!fs.existsSync(path.join(root, relativePath))) {
    failures.push(`Missing ${label}`);
  }
}

function has(content, marker, label = marker) {
  if (!content.includes(marker)) failures.push(`Missing marker: ${label}`);
}

function notHas(content, marker, label = marker) {
  if (content.includes(marker)) failures.push(`Unexpected marker: ${label}`);
}

function nodeCheck(relativePath) {
  exists(relativePath);
  if (!fs.existsSync(path.join(root, relativePath))) return;
  const result = spawnSync(process.execPath, ["--check", path.join(root, relativePath)], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0) failures.push(`node --check failed for ${relativePath}: ${result.stderr || result.stdout}`);
}

function noBrowserDialogs(relativePath) {
  const content = read(relativePath);
  for (const marker of ["window.prompt", "window.confirm", "window.alert", "prompt(", "confirm(", "alert("]) {
    notHas(content, marker, `${relativePath} contains browser dialog ${marker}`);
  }
}

const packageJson = JSON.parse(read("package.json") || "{}");
const schema = read("database/schema.sql");
const seed = read("database/seed.sql");
const permissions = read("worker/src/db/permissions.ts");
const workerWrangler = read("worker/wrangler.toml");
const rootWrangler = fs.existsSync(path.join(root, "wrangler.toml")) ? read("wrangler.toml") : "";
const password = read("worker/src/auth/password.ts");
const workerIndex = read("worker/src/index.ts");
const dataTransferRoute = read("worker/src/routes/data-transfer.ts");
const api = read("frontend/src/lib/api.ts");
const appRoutes = read("frontend/src/routes/AppRoutes.tsx");
const dataTransferPage = read("frontend/src/pages/DataTransferPage.tsx");
const settingsPage = read("frontend/src/pages/SettingsPage.tsx");
const adminPage = read("frontend/src/pages/AdminSettingsPage.tsx");
const usersAccessPage = read("frontend/src/pages/UsersAccessPage.tsx");

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
  "verify:prompt21",
  "verify:prompt22",
  "smoke:production-readiness",
  "audit:remote-schema",
  "generate:remote-schema-repair",
  "apply:remote-schema-repair",
  "verify:remote-schema-ready"
]) {
  if (!packageJson.scripts?.[script]) failures.push(`Missing package script: ${script}`);
}

for (const table of [
  "data_transfer_settings",
  "data_import_batches",
  "data_import_rows",
  "backup_readiness_records",
  "qa_test_matrix_items",
  "smoke_test_runs",
  "deployment_readiness_records"
]) {
  has(schema, `CREATE TABLE IF NOT EXISTS ${table}`, `schema table ${table}`);
}

for (const index of [
  "idx_data_import_batches_type",
  "idx_data_import_batches_status",
  "idx_data_import_rows_validation",
  "idx_backup_readiness_records_status",
  "idx_qa_test_matrix_items_status",
  "idx_smoke_test_runs_status",
  "idx_deployment_readiness_records_status"
]) {
  has(schema, index, `schema index ${index}`);
}

for (const permission of [
  "data_import.view",
  "data_import.upload",
  "data_import.validate",
  "data_import.apply",
  "data_import.cancel",
  "data_import.sensitive",
  "data_import.manage",
  "data_export.view",
  "data_export.run",
  "data_export.sensitive",
  "data_export.manage",
  "data_transfer.settings.view",
  "data_transfer.settings.update",
  "data_transfer.settings.manage",
  "backup.readiness.view",
  "backup.readiness.update",
  "backup.readiness.manage",
  "migration.readiness.view",
  "migration.readiness.update",
  "migration.readiness.manage",
  "deployment.readiness.view",
  "deployment.readiness.update",
  "deployment.readiness.manage",
  "qa.checklist.view",
  "qa.checklist.update",
  "qa.checklist.manage",
  "qa.smoke_tests.view",
  "qa.smoke_tests.run",
  "qa.smoke_tests.manage"
]) {
  has(seed, permission, `seed permission ${permission}`);
  has(permissions, permission, `worker permission ${permission}`);
}

for (const marker of [
  "module_data_transfer",
  "data_transfer_settings_default",
  "prompt22_data_transfer_seeded"
]) {
  has(seed, marker, `seed marker ${marker}`);
}

for (const marker of [
  'app.route("/api/v1/data-import", dataImportRoutes)',
  'app.route("/api/v1/data-export", dataExportRoutes)',
  'app.route("/api/v1/admin", dataTransferAdminRoutes)'
]) {
  has(workerIndex, marker, `route mount ${marker}`);
}

for (const helper of [
  "getDataImportTemplate",
  "generateCsvImportTemplate",
  "getImportTemplateColumnDefinitions",
  "getImportAcceptedEnumValues",
  "createDataImportBatch",
  "parseDataImportFile",
  "validateDataImportBatch",
  "applyDataImportBatch",
  "cancelDataImportBatch",
  "createDataImportRowResult",
  "getDataImportBatchSummary",
  "validateImportRow",
  "validateImportForeignReferences",
  "validateImportEnums",
  "validateImportProtectedRules",
  "buildImportValidationPreview",
  "generateImportErrorCsv",
  "getDataImportTypeDefinition",
  "getImportDuplicateKey",
  "getImportApplyHandler",
  "normalizeImportRowForType",
  "getDataExportTypeDefinition",
  "runDataExport",
  "validateDataExportPermission",
  "applyDataExportSensitiveMasking",
  "auditDataImportAction",
  "auditDataExportAction",
  "enforceDataImportPermission",
  "enforceDataExportPermission",
  "enforceSensitiveImportExportReason",
  "protectAdminRecordsDuringImport"
]) {
  has(dataTransferRoute, helper, `backend helper ${helper}`);
}

for (const endpoint of [
  "/types",
  "/templates/:importType/download",
  "/batches/:batchId/validation-preview",
  "/batches/:batchId/apply",
  "/batches/:batchId/cancel",
  "/batches/:batchId/errors/download",
  "/history/:exportId",
  "/data-transfer/settings",
  "/backup-readiness",
  "/migration-readiness",
  "/remote-d1-apply-guide",
  "/qa-test-matrix",
  "/smoke-tests",
  "/deployment-readiness"
]) {
  has(dataTransferRoute, endpoint, `backend endpoint ${endpoint}`);
}

for (const helper of [
  "listDataImportTypes",
  "listDataImportTemplates",
  "getDataImportTemplate",
  "downloadDataImportTemplate",
  "listDataImportBatches",
  "getDataImportBatch",
  "createDataImportBatch",
  "validateDataImportBatch",
  "getDataImportValidationPreview",
  "applyDataImportBatch",
  "cancelDataImportBatch",
  "downloadDataImportErrors",
  "listDataExportTypes",
  "runDataExport",
  "listDataExportHistory",
  "getDataTransferSettings",
  "updateDataTransferSettings",
  "getBackupReadiness",
  "recordBackupReadiness",
  "getMigrationReadiness",
  "recordMigrationReadinessCheck",
  "getRemoteD1ApplyGuide",
  "getQaTestMatrix",
  "seedQaTestMatrix",
  "updateQaTestMatrixItem",
  "listSmokeTests",
  "recordSmokeTestResult",
  "getDeploymentReadiness",
  "recordDeploymentReadiness"
]) {
  has(api, helper, `frontend API helper ${helper}`);
}

for (const route of [
  'path="settings/admin/imports"',
  'path="settings/admin/import-templates"',
  'path="settings/admin/exports"',
  'path="settings/admin/backup-readiness"',
  'path="settings/admin/migration-readiness"',
  'path="settings/admin/remote-d1-apply-guide"',
  'path="settings/admin/qa-test-matrix"',
  'path="settings/admin/smoke-tests"',
  'path="settings/admin/deployment-readiness"',
  'path="settings/admin/data-transfer-settings"'
]) {
  has(appRoutes, route, `frontend route ${route}`);
}

for (const marker of [
  "Data Import Center",
  "Import Templates",
  "Validation Preview",
  "Import Errors",
  "Data Export Center",
  "Export History",
  "Backup Readiness",
  "Migration / Restore",
  "Remote D1 Apply Guide",
  "QA Test Matrix",
  "Smoke Tests",
  "Deployment Readiness",
  "Transfer Settings",
  "APPLY",
  "downloadDataImportErrors"
]) {
  has(dataTransferPage, marker, `Prompt 22 page marker ${marker}`);
}

for (const marker of [
  "data_import",
  "data_export",
  "data_transfer",
  "Backup Readiness",
  "QA & Smoke Tests"
]) {
  has(usersAccessPage, marker, `Users & Access permission label ${marker}`);
}

has(settingsPage + adminPage, "Data import / export", "settings/admin data transfer link");
has(adminPage, "Data Transfer", "admin settings data transfer tab");
has(appRoutes, "lazyPage", "lazy route marker");
has(appRoutes, "Suspense", "Suspense route marker");
has(workerWrangler + rootWrangler, 'binding = "DB"', "D1 DB binding");
has(workerWrangler + rootWrangler, 'database_name = "hrm-v2"', "D1 database name");
has(workerWrangler + rootWrangler, 'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"', "D1 database id");
has(workerWrangler + rootWrangler, 'binding = "DOCUMENTS_BUCKET"', "R2 binding");
has(workerWrangler + rootWrangler, 'bucket_name = "hrm-v2-documents"', "R2 bucket");
has(password, "100000", "PBKDF2 100000");
notHas(password, "210000", "PBKDF2 unsupported 210000");

for (const promptScript of [
  "scripts/verify-baseline-prompts1-5.mjs",
  "scripts/verify-recovery-prompts6-9.mjs",
  "scripts/verify-prompt8.mjs",
  "scripts/verify-prompt9.mjs",
  "scripts/verify-prompt10.mjs",
  "scripts/verify-prompt11.mjs",
  "scripts/verify-prompt12.mjs",
  "scripts/verify-prompt12b.mjs",
  "scripts/verify-prompt12-final.mjs",
  "scripts/verify-prompt13.mjs",
  "scripts/verify-prompt14.mjs",
  "scripts/verify-prompt15.mjs",
  "scripts/verify-prompt16.mjs",
  "scripts/verify-prompt17.mjs",
  "scripts/verify-prompt18.mjs",
  "scripts/verify-prompt19.mjs",
  "scripts/verify-prompt20.mjs",
  "scripts/verify-prompt21.mjs"
]) {
  exists(promptScript);
}

for (const script of [
  "scripts/audit-remote-d1-schema.mjs",
  "scripts/generate-remote-d1-repair.mjs",
  "scripts/apply-remote-d1-repair.mjs",
  "scripts/verify-remote-d1-schema-ready.mjs",
  "scripts/run-production-smoke-checks.mjs",
  "scripts/verify-prompt22.mjs"
]) {
  nodeCheck(script);
}

noBrowserDialogs("frontend/src/pages/DataTransferPage.tsx");

for (const disallowed of [
  "spawnSync(",
  "execSync(",
  "child_process",
  "wrangler rollback",
  "DELETE FROM users",
  "DROP TABLE users",
  "DROP TABLE employees",
  "database/remote_schema_repair.sql",
  "database/remote_schema_repair_d1.sql",
  "database/remote_roster_settings_repair.sql",
  "database/remote_roster_settings_repair_2.sql"
]) {
  notHas(dataTransferPage + dataTransferRoute, disallowed, `unsafe Prompt 22 marker ${disallowed}`);
}

for (const secretFile of [".env", ".env.local", ".dev.vars"]) {
  if (fs.existsSync(path.join(root, secretFile))) failures.push(`Secret/local env file present: ${secretFile}`);
}

if (failures.length) {
  console.error("Prompt 22 verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Prompt 22 verification passed.");
