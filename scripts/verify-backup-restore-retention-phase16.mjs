import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const checks = [];

function file(rel) {
  return path.join(root, rel);
}

function exists(rel) {
  return fs.existsSync(file(rel));
}

function read(rel) {
  return fs.readFileSync(file(rel), "utf8");
}

function add(name, passed, detail = "") {
  checks.push({ name, passed, detail });
}

function has(rel, needles, label = rel) {
  const text = exists(rel) ? read(rel) : "";
  const missing = needles.filter((needle) => !text.includes(needle));
  add(label, missing.length === 0, missing.length ? `Missing: ${missing.join(", ")}` : "");
}

function notHas(rel, needles, label = rel) {
  const text = exists(rel) ? read(rel) : "";
  const found = needles.filter((needle) => text.includes(needle));
  add(label, found.length === 0, found.length ? `Found forbidden marker: ${found.join(", ")}` : "");
}

function collectFiles(dir, extensions) {
  if (!exists(dir)) return [];
  const result = [];
  const stack = [file(dir)];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (["node_modules", ".git", "dist", "build", ".wrangler", ".cache", ".turbo", "coverage"].includes(entry.name)) continue;
        stack.push(full);
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        result.push(full);
      }
    }
  }
  return result;
}

function textOf(rel) {
  return exists(rel) ? read(rel) : "";
}

const packageJson = JSON.parse(read("package.json"));
const scripts = packageJson.scripts ?? {};

const requiredFiles = [
  "docs/production/phase16-backup-restore-disaster-recovery.md",
  "docs/production/backup-manifest-format.md",
  "scripts/create-backup-manifest-phase16.mjs",
  "scripts/backup-d1-phase16.mjs",
  "scripts/restore-d1-dry-run-phase16.mjs",
  "scripts/backup-r2-inventory-phase16.mjs",
  "scripts/verify-r2-restore-readiness-phase16.mjs",
  "scripts/verify-backup-restore-retention-phase16.mjs",
  "worker/src/utils/data-retention-cleanup.ts",
  "frontend/src/pages/AdminBackupRetentionPage.tsx"
];

for (const rel of requiredFiles) {
  add(`${rel} exists`, exists(rel));
}

for (const scriptName of [
  "backup:create-manifest-phase16",
  "backup:d1-phase16",
  "restore:d1-dry-run-phase16",
  "backup:r2-inventory-phase16",
  "verify:r2-restore-readiness-phase16",
  "verify:backup-restore-retention-phase16"
]) {
  add(`package script ${scriptName}`, typeof scripts[scriptName] === "string" && scripts[scriptName].includes("phase16"));
}

has("database/schema.sql", [
  "CREATE TABLE IF NOT EXISTS data_retention_policies",
  "idx_data_retention_policies_key",
  "idx_data_retention_policies_enabled",
  "CREATE TABLE IF NOT EXISTS backup_readiness_records",
  "CREATE TABLE IF NOT EXISTS background_jobs",
  "CREATE TABLE IF NOT EXISTS document_upload_sessions",
  "CREATE TABLE IF NOT EXISTS report_export_artifacts"
], "schema contains backup/retention foundations");

has("database/seed.sql", [
  "admin.backup_retention.view",
  "admin.backup_retention.manage",
  "admin.data_retention.cleanup",
  "performance_metrics_detailed",
  "audit_security_logs_do_not_auto_delete",
  "employee_payroll_business_records_do_not_auto_delete",
  "active_employee_documents_do_not_auto_delete"
], "seed contains Phase 16 permissions and safe policies");

has("worker/src/utils/data-retention-cleanup.ts", [
  "runDataRetentionCleanup",
  "getBackupRetentionStatus",
  "BUSINESS_CRITICAL_TABLES",
  "dryRun",
  "report_export_artifacts",
  "document_upload_sessions",
  "dashboard_summary_snapshots",
  "performance_api_metrics",
  "background_jobs",
  "COUNT(*) AS count",
  "LIMIT ?"
], "data retention cleanup utility is bounded and dry-run aware");

notHas("worker/src/utils/data-retention-cleanup.ts", [
  "DELETE FROM employees",
  "DELETE FROM employee_documents",
  "DELETE FROM employee_document_versions",
  "DELETE FROM payroll_periods",
  "DELETE FROM payroll_runs",
  "DELETE FROM payroll_employee_results",
  "DELETE FROM leave_requests",
  "DELETE FROM attendance_records",
  "DELETE FROM audit_logs"
], "retention cleanup does not delete protected business tables");

has("worker/src/routes/admin.ts", [
  "/backup-retention/status",
  "/data-retention/policies",
  "/data-retention/cleanup",
  "admin.backup_retention.view",
  "admin.data_retention.cleanup",
  "RUN_RETENTION_CLEANUP",
  "enqueueJob",
  "runJobWithWaitUntil",
  "Cache-Control",
  "private, no-store",
  "recordAudit"
], "admin backup/retention APIs are permissioned, async, audited, and no-store");

has("frontend/src/lib/api.ts", [
  "getBackupRetentionStatus",
  "listDataRetentionPolicies",
  "updateDataRetentionPolicy",
  "runDataRetentionCleanup"
], "frontend API exposes backup/retention calls");

has("frontend/src/pages/AdminBackupRetentionPage.tsx", [
  "Backup & Retention",
  "Cleanup dry-run",
  "Queue confirmed cleanup",
  "ConfirmDialog",
  "RUN_RETENTION_CLEANUP",
  "admin.backup_retention.view",
  "admin.data_retention.cleanup",
  "No direct browser restore"
], "admin backup/retention page exposes safe operations");

has("frontend/src/routes/AppRoutes.tsx", [
  "AdminBackupRetentionPage",
  "admin-backup-retention",
  "settings/admin/backup-retention"
], "backup/retention route is registered and preloadable");

has("frontend/src/layouts/AppShell.tsx", [
  "Backup & Retention",
  "/settings/admin/backup-retention",
  "admin.backup_retention.view"
], "backup/retention navigation is permission-aware");

has("frontend/src/pages/SettingsPage.tsx", [
  "Backup, restore, and retention",
  "/settings/admin/backup-retention"
], "settings hub links backup/retention workspace");

has("frontend/src/features/admin-help/adminHelpTargets.ts", [
  "backupRetention",
  "backup-retention-disaster-recovery"
], "contextual help target exists");

has("frontend/src/features/admin-help/hrmGuideContent.ts", [
  "Backup, Restore, and Data Retention",
  "backup-retention-disaster-recovery",
  "/settings/admin/backup-retention",
  "Do not run live D1 restores from the browser"
], "help center documents backup/retention operations");

has("docs/user-guides/production-operations-runbook.md", [
  "Phase 16 Backup, Restore, And Retention Operations",
  "backup:create-manifest-phase16",
  "backup:d1-phase16",
  "restore:d1-dry-run-phase16",
  "backup:r2-inventory-phase16",
  "verify:r2-restore-readiness-phase16",
  "RUN_RETENTION_CLEANUP"
], "production operations runbook includes Phase 16 commands");

has("docs/production/phase12-backup-rollback-runbook.md", [
  "Phase 16 Backup/Restore Expansion",
  "Do not restore live D1 from the browser",
  "active employee documents",
  "payroll results",
  "audit logs"
], "Phase 12 rollback runbook references Phase 16 guardrails");

has("docs/production/phase12-production-readiness-checklist.md", [
  "Phase 16 backup manifest",
  "D1 restore dry-run",
  "R2 restore readiness",
  "Retention cleanup dry-run",
  "No backup dump"
], "Phase 12 readiness checklist includes Phase 16 steps");

has("docs/production/phase16-backup-restore-disaster-recovery.md", [
  "Backup Goals",
  "D1 Database Backup Plan",
  "R2 Document/File Backup Plan",
  "Restore Testing",
  "Emergency Restore Procedure",
  "What Must Never Be Deleted Automatically",
  "Dry-run",
  "No browser-based live D1 restore"
], "Phase 16 documentation covers required runbook topics");

has("scripts/create-backup-manifest-phase16.mjs", [
  "phase16-backup-manifest-example.json",
  "schema_hash_sha256",
  "secrets_included",
  "writeFileSync"
], "manifest generator writes non-secret manifest");

has("scripts/backup-d1-phase16.mjs", [
  "HRM_BACKUP_LIVE",
  "HRM_BACKUP_CONFIRM",
  "BACKUP_D1",
  "dry_run",
  "spawnSync",
  "wrangler",
  "d1",
  "export",
  "Refusing to write live backup output inside the source tree"
], "D1 backup script is dry-run by default and uses safe CLI args");

has("scripts/restore-d1-dry-run-phase16.mjs", [
  "dry-run",
  "phase16-d1-restore-dry-run-report.md",
  "This script never executes SQL against production"
], "D1 restore script is dry-run/report-only");

has("scripts/backup-r2-inventory-phase16.mjs", [
  "HRM_R2_BACKUP_LIVE",
  "BACKUP_R2_INVENTORY",
  "sha256",
  "key_hash",
  "phase16-r2-inventory-report.md",
  "dry_run"
], "R2 inventory script avoids raw object key leakage by default");

has("scripts/verify-r2-restore-readiness-phase16.mjs", [
  "employee_document_versions",
  "r2_key",
  "document_upload_sessions",
  "phase16-r2-restore-readiness-report.md"
], "R2 readiness verifier checks document storage references");

const cors = textOf("worker/src/index.ts");
add("CORS request-id headers remain allowed", cors.includes("x-request-id") && cors.includes("X-Request-Id") && cors.includes("Vary"));
add("authenticated API no-store guard remains present", textOf("worker/src/utils/performance.ts").includes("private, no-store") || textOf("worker/src/routes/admin.ts").includes("private, no-store"));

const wrangler = textOf("worker/wrangler.toml");
add("D1 binding unchanged", wrangler.includes('binding = "DB"') && wrangler.includes('database_name = "hrm-v2"') && wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'));
add("R2 binding unchanged", wrangler.includes('binding = "DOCUMENTS_BUCKET"') && wrangler.includes('bucket_name = "hrm-v2-documents"'));

const password = textOf("worker/src/auth/password.ts");
add("PBKDF2 remains 100000", password.includes("100000") && !password.includes("210000"));

for (const rel of [
  "scripts/verify-admin-user-documentation-phase15.mjs",
  "scripts/verify-final-uiux-consistency-phase14.mjs",
  "scripts/verify-e2e-workflows-phase13.mjs",
  "scripts/verify-production-readiness-phase12.mjs",
  "scripts/verify-performance-observability-phase11.mjs"
]) {
  add(`${rel} preserved`, exists(rel));
}

const changedUi = [
  "frontend/src/pages/AdminBackupRetentionPage.tsx",
  "frontend/src/pages/SettingsPage.tsx",
  "frontend/src/layouts/AppShell.tsx",
  "frontend/src/features/admin-help/hrmGuideContent.ts"
].map(textOf).join("\n");
add("no browser alert/confirm/prompt in Phase 16 UI", !/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(changedUi));
add("no dark mode introduced in Phase 16 UI", !/\bdark:/.test(changedUi));

const backupScripts = [
  "scripts/create-backup-manifest-phase16.mjs",
  "scripts/backup-d1-phase16.mjs",
  "scripts/restore-d1-dry-run-phase16.mjs",
  "scripts/backup-r2-inventory-phase16.mjs",
  "scripts/verify-r2-restore-readiness-phase16.mjs"
].map(textOf).join("\n");
add("backup scripts do not hardcode obvious credentials", !/(password\s*[:=]\s*["'][^"']+|secret\s*[:=]\s*["'][^"']+|access[_-]?key\s*[:=]\s*["'][^"']+)/i.test(backupScripts));
add("backup scripts do not perform destructive remote restore", !/(d1\s+execute[\s\S]{0,200}--remote[\s\S]{0,200}--file|DROP\s+TABLE\s+IF\s+EXISTS\s+employees)/i.test(backupScripts));

const sourceFiles = [
  ...collectFiles("frontend/src", [".tsx", ".ts"]),
  ...collectFiles("worker/src", [".ts"])
];
const sourceText = sourceFiles.map((full) => fs.readFileSync(full, "utf8")).join("\n");
add("no browser alert/confirm/prompt introduced app-wide", !/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(sourceText));
add("no app-wide dark mode class introduced", !/\bdark:/.test(sourceText));

const failed = checks.filter((check) => !check.passed);
for (const check of checks) {
  const mark = check.passed ? "PASS" : "FAIL";
  console.log(`${mark} ${check.name}${check.detail ? ` - ${check.detail}` : ""}`);
}

if (failed.length) {
  console.error(`\nPhase 16 backup/restore/retention verification failed: ${failed.length} issue(s).`);
  process.exit(1);
}

console.log(`\nPhase 16 backup/restore/retention verification passed (${checks.length} checks).`);
