import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const failures = [];
const warnings = [];
const passes = [];

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`Missing file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function exists(relativePath, label = relativePath) {
  if (fs.existsSync(path.join(root, relativePath))) {
    passes.push(`${label} exists`);
    return true;
  }
  failures.push(`Missing ${label}`);
  return false;
}

function has(content, marker, label = marker) {
  if (content.includes(marker)) {
    passes.push(label);
    return true;
  }
  failures.push(`Missing marker: ${label}`);
  return false;
}

function notHas(content, marker, label = marker) {
  if (!content.includes(marker)) {
    passes.push(`No ${label}`);
    return true;
  }
  failures.push(`Unexpected marker: ${label}`);
  return false;
}

function nodeCheck(relativePath) {
  if (!exists(relativePath)) return;
  const result = spawnSync(process.execPath, ["--check", path.join(root, relativePath)], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status === 0) {
    passes.push(`node --check ${relativePath}`);
  } else {
    failures.push(`node --check failed for ${relativePath}: ${result.stderr || result.stdout}`);
  }
}

const packageJson = JSON.parse(read("package.json") || "{}");
const schema = read("database/schema.sql");
const seed = read("database/seed.sql");
const workerWrangler = read("worker/wrangler.toml");
const rootWrangler = fs.existsSync(path.join(root, "wrangler.toml")) ? read("wrangler.toml") : "";
const workerIndex = read("worker/src/index.ts");
const api = read("frontend/src/lib/api.ts");
const appRoutes = read("frontend/src/routes/AppRoutes.tsx");
const dataTransferPage = read("frontend/src/pages/DataTransferPage.tsx");
const dataTransferRoute = read("worker/src/routes/data-transfer.ts");
const adminSettings = read("frontend/src/pages/AdminSettingsPage.tsx");
const settingsPage = read("frontend/src/pages/SettingsPage.tsx");
const password = read("worker/src/auth/password.ts");

for (const script of [
  "typecheck",
  "build",
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
  has(schema, `CREATE TABLE IF NOT EXISTS ${table}`, `Prompt 22 table ${table}`);
}

for (const permission of [
  "data_import.view",
  "data_import.upload",
  "data_import.validate",
  "data_import.apply",
  "data_import.cancel",
  "data_import.sensitive",
  "data_export.view",
  "data_export.run",
  "data_export.sensitive",
  "data_transfer.settings.view",
  "data_transfer.settings.update",
  "backup.readiness.view",
  "migration.readiness.view",
  "deployment.readiness.view",
  "qa.checklist.view",
  "qa.smoke_tests.run"
]) {
  has(seed, permission, `Prompt 22 permission ${permission}`);
}

for (const route of [
  'app.route("/api/v1/data-import", dataImportRoutes)',
  'app.route("/api/v1/data-export", dataExportRoutes)',
  'app.route("/api/v1/admin", dataTransferAdminRoutes)'
]) {
  has(workerIndex, route, `Worker mount ${route}`);
}

for (const marker of [
  "getDataImportTemplate",
  "validateImportRow",
  "validateImportForeignReferences",
  "protectAdminRecordsDuringImport",
  "runDataExport",
  "applyDataExportSensitiveMasking",
  "enforceSensitiveImportExportReason",
  "backup-readiness",
  "remote-d1-apply-guide",
  "deployment-readiness"
]) {
  has(dataTransferRoute, marker, `Data transfer backend marker ${marker}`);
}

for (const helper of [
  "listDataImportTypes",
  "createDataImportBatch",
  "validateDataImportBatch",
  "applyDataImportBatch",
  "runDataExport",
  "getBackupReadiness",
  "getRemoteD1ApplyGuide",
  "getQaTestMatrix",
  "recordSmokeTestResult",
  "getDeploymentReadiness"
]) {
  has(api, helper, `Frontend API helper ${helper}`);
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
  has(appRoutes, route, `Frontend route ${route}`);
}

for (const marker of [
  "Data Import Center",
  "Import Templates",
  "Data Export Center",
  "Backup Readiness",
  "Migration / Restore",
  "Remote D1 Apply Guide",
  "QA Test Matrix",
  "Smoke Tests",
  "Deployment Readiness",
  "Transfer Settings"
]) {
  has(dataTransferPage, marker, `DataTransferPage marker ${marker}`);
}

has(adminSettings + settingsPage, "data transfer", "Admin/settings data transfer entry");
has(appRoutes, "lazyPage", "lazy route marker");
has(appRoutes, "Suspense", "Suspense route marker");
has(workerWrangler + rootWrangler, 'database_name = "hrm-v2"', "D1 database name");
has(workerWrangler + rootWrangler, 'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"', "D1 database id");
has(workerWrangler + rootWrangler, 'bucket_name = "hrm-v2-documents"', "R2 bucket");
has(password, "100000", "PBKDF2 100000");
notHas(password, "210000", "unsupported PBKDF2 210000");

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

for (const marker of ["window.prompt", "window.confirm", "window.alert", "prompt(", "confirm(", "alert("]) {
  notHas(dataTransferPage, marker, `browser dialog ${marker}`);
}

for (const disallowed of [
  "spawnSync(",
  "execSync(",
  "child_process",
  "wrangler rollback",
  "apply-remote-schema-repair"
]) {
  notHas(dataTransferPage + dataTransferRoute, disallowed, `destructive/remote action marker ${disallowed}`);
}

for (const localSecret of [".env", ".env.local", ".dev.vars"]) {
  if (fs.existsSync(path.join(root, localSecret))) failures.push(`Local secret file present: ${localSecret}`);
}

if (!fs.existsSync(path.join(root, ".dev.vars.example"))) warnings.push(".dev.vars.example is missing; local setup docs may be incomplete.");

console.log("Production readiness smoke check summary");
console.log(`Passed checks: ${passes.length}`);
if (warnings.length) {
  console.log("Warnings:");
  for (const warning of warnings) console.log(`- ${warning}`);
}

if (failures.length) {
  console.error("Failures:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Production readiness smoke checks passed. No production API, remote repair, deployment, rollback, or browser restore action was executed.");
