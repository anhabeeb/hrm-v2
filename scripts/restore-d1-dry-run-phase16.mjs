import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const schemaPath = path.join(root, "database", "schema.sql");
const reportPath = path.join(root, "docs", "production", "phase16-d1-restore-dry-run-report.md");

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function tableNames(sql) {
  return [...sql.matchAll(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+("?[\w]+"?)/gi)].map((match) => match[1].replaceAll('"', ""));
}

function sqlHasDestructiveStatement(sql) {
  const withoutComments = String(sql)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");
  return /(^|;)\s*(DROP\s+TABLE|DROP\s+DATABASE|DELETE\s+FROM|TRUNCATE|ALTER\s+TABLE\s+\w+\s+DROP)\b/i.test(withoutComments);
}

function restoreInputs() {
  return {
    backupFile: process.env.HRM_D1_RESTORE_BACKUP_FILE || "",
    manifestFile: process.env.HRM_D1_RESTORE_MANIFEST_FILE || ""
  };
}

function buildReport() {
  if (!fs.existsSync(schemaPath)) throw new Error("database/schema.sql is required for restore dry-run validation.");
  const schemaSql = read(schemaPath);
  const schemaTables = tableNames(schemaSql);
  const inputs = restoreInputs();
  const checks = [
    { check: "schema.sql exists", status: "PASS", detail: "Local source schema is available." },
    { check: "schema hash calculated", status: "PASS", detail: sha256(schemaSql) },
    { check: "live production mutation", status: "PASS", detail: "This script never executes SQL against production." }
  ];

  if (!inputs.backupFile) {
    checks.push({ check: "backup file supplied", status: "SKIPPED", detail: "HRM_D1_RESTORE_BACKUP_FILE was not set; source-only dry-run completed." });
  } else if (!fs.existsSync(inputs.backupFile)) {
    checks.push({ check: "backup file exists", status: "FAIL", detail: inputs.backupFile });
  } else {
    const backupSql = read(inputs.backupFile);
    checks.push({ check: "backup file exists", status: "PASS", detail: inputs.backupFile });
    checks.push({ check: "backup destructive statement review", status: sqlHasDestructiveStatement(backupSql) ? "WARNING" : "PASS", detail: sqlHasDestructiveStatement(backupSql) ? "Backup contains destructive-looking SQL; require manual review." : "No obvious destructive restore statements detected by dry-run scanner." });
    const backupTables = tableNames(backupSql);
    const missingFromBackup = schemaTables.filter((table) => !backupTables.includes(table));
    checks.push({ check: "table list compatibility", status: missingFromBackup.length ? "WARNING" : "PASS", detail: missingFromBackup.length ? `Backup did not declare ${missingFromBackup.slice(0, 20).join(", ")}` : "Backup table declarations match source schema markers." });
  }

  if (!inputs.manifestFile) {
    checks.push({ check: "manifest supplied", status: "SKIPPED", detail: "HRM_D1_RESTORE_MANIFEST_FILE was not set." });
  } else if (!fs.existsSync(inputs.manifestFile)) {
    checks.push({ check: "manifest exists", status: "FAIL", detail: inputs.manifestFile });
  } else {
    const manifest = JSON.parse(read(inputs.manifestFile));
    checks.push({ check: "manifest exists", status: "PASS", detail: inputs.manifestFile });
    checks.push({ check: "manifest secret check", status: JSON.stringify(manifest).match(/password|secret|token/i) ? "WARNING" : "PASS", detail: "Manifest reviewed for obvious secret keys." });
  }

  const failed = checks.filter((item) => item.status === "FAIL");
  return { checks, failed, schemaTables };
}

function writeReport(report) {
  const lines = [
    "# Phase 16 D1 Restore Dry-Run Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "This report is dry-run only. It does not mutate local, staging, or production D1.",
    "",
    "## Checks",
    "",
    "| Check | Status | Detail |",
    "| --- | --- | --- |",
    ...report.checks.map((item) => `| ${item.check} | ${item.status} | ${String(item.detail).replace(/\|/g, "/")} |`),
    "",
    "## Restore Safety Plan",
    "",
    "1. Create a fresh backup before any restore attempt.",
    "2. Restore into staging first.",
    "3. Apply database/schema.sql and database/seed.sql in staging.",
    "4. Run remote schema readiness, smoke tests, and HRM workflow checks.",
    "5. Obtain operator approval and a rollback plan before production restore.",
    "6. Never use this dry-run script as a live destructive restore command.",
    ""
  ];
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${lines.join("\n")}\n`);
}

try {
  const report = buildReport();
  writeReport(report);
  console.log("Phase 16 D1 restore dry-run completed.");
  console.log(path.relative(root, reportPath).replaceAll("\\", "/"));
  if (report.failed.length) process.exit(1);
} catch (error) {
  console.error("Phase 16 D1 restore dry-run failed safely.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
