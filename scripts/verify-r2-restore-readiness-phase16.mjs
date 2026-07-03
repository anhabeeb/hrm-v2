import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const schemaPath = path.join(root, "database", "schema.sql");
const inventoryReportPath = path.join(root, "docs", "production", "phase16-r2-inventory-report.md");
const readinessReportPath = path.join(root, "docs", "production", "phase16-r2-restore-readiness-report.md");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function hasTable(sql, table) {
  return new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+"?${table}"?`, "i").test(sql);
}

function hasColumn(sql, table, column) {
  const pattern = new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+"?${table}"?\\s*\\(([\\s\\S]*?)\\);`, "i");
  const match = sql.match(pattern);
  return Boolean(match && new RegExp(`(^|\\n|,)\\s*"?${column}"?\\s`, "i").test(match[1]));
}

function inventoryExists() {
  return fs.existsSync(inventoryReportPath);
}

function buildChecks() {
  if (!fs.existsSync(schemaPath)) throw new Error("database/schema.sql is required.");
  const schema = read(schemaPath);
  const checks = [
    { check: "employee_documents table exists", status: hasTable(schema, "employee_documents") ? "PASS" : "FAIL", detail: "D1 document metadata table." },
    { check: "employee_document_versions table exists", status: hasTable(schema, "employee_document_versions") ? "PASS" : "FAIL", detail: "Version metadata maps documents to R2 keys." },
    { check: "employee_document_versions.r2_key exists", status: hasColumn(schema, "employee_document_versions", "r2_key") ? "PASS" : "FAIL", detail: "Required for restore reference verification." },
    { check: "document_upload_sessions table exists", status: hasTable(schema, "document_upload_sessions") ? "PASS" : "FAIL", detail: "Pending upload cleanup can be checked safely." },
    { check: "report_export_artifacts table exists", status: hasTable(schema, "report_export_artifacts") ? "PASS" : "FAIL", detail: "Expired report artifact object candidates can be detected." },
    { check: "R2 inventory report exists", status: inventoryExists() ? "PASS" : "WARNING", detail: inventoryExists() ? "Inventory report available." : "Run npm run backup:r2-inventory-phase16 first for live inventory detail." },
    { check: "no object deletion", status: "PASS", detail: "This script does not delete R2 objects or D1 metadata." }
  ];
  return checks;
}

function writeReport(checks) {
  const lines = [
    "# Phase 16 R2 Restore Readiness Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "This report validates restore-readiness markers only. It does not download, expose, or delete R2 object contents.",
    "",
    "| Check | Status | Detail |",
    "| --- | --- | --- |",
    ...checks.map((item) => `| ${item.check} | ${item.status} | ${String(item.detail).replace(/\|/g, "/")} |`),
    "",
    "## Follow-Up",
    "",
    "- Compare redacted R2 object inventory with employee_document_versions.r2_key records in a trusted admin environment.",
    "- Investigate orphan candidates before deletion.",
    "- Never delete active employee document objects automatically.",
    ""
  ];
  fs.mkdirSync(path.dirname(readinessReportPath), { recursive: true });
  fs.writeFileSync(readinessReportPath, `${lines.join("\n")}\n`);
}

try {
  const checks = buildChecks();
  writeReport(checks);
  const failures = checks.filter((item) => item.status === "FAIL");
  console.log("Phase 16 R2 restore readiness report written.");
  console.log(path.relative(root, readinessReportPath).replaceAll("\\", "/"));
  if (failures.length) process.exit(1);
} catch (error) {
  console.error("Phase 16 R2 restore readiness failed safely.");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
