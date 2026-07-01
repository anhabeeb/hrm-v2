import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  advancedDeductionModes,
  auditReportPath,
  codeRequiredColumns,
  findLegacyManualRepairFiles,
  parseSchema,
  readyReportPath,
  rebuildRules,
  rootDir,
  writeJson
} from "./remote-d1-schema-utils.mjs";

function runAudit() {
  const result = spawnSync(process.execPath, ["scripts/audit-remote-d1-schema.mjs"], {
    cwd: rootDir,
    encoding: "utf8",
    shell: false,
    maxBuffer: 20 * 1024 * 1024
  });
  if (result.status !== 0) {
    const error = new Error("Remote schema audit failed during readiness verification.");
    error.output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    throw error;
  }
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

function assertNoFailures(condition, failures, message) {
  if (!condition) failures.push(message);
}

function main() {
  const legacyFiles = findLegacyManualRepairFiles();
  if (legacyFiles.length) {
    throw new Error(`Legacy manual repair files still exist in database root: ${legacyFiles.join(", ")}. Remove them before readiness verification.`);
  }

  const auditOutput = runAudit();
  const report = JSON.parse(fs.readFileSync(auditReportPath, "utf8"));
  const schema = parseSchema();
  const failures = [];

  assertNoFailures(Number(report.remote_table_count ?? 0) > 0, failures, "Remote audit reported zero tables; refusing to treat remote schema as ready.");
  assertNoFailures((report.missing_tables ?? []).length === 0, failures, `Missing required tables: ${(report.missing_tables ?? []).join(", ")}`);
  assertNoFailures((report.missing_columns ?? []).length === 0, failures, `Missing required columns: ${(report.missing_columns ?? []).map((item) => `${item.table}.${item.column}`).join(", ")}`);
  assertNoFailures((report.check_constraint_issues ?? []).length === 0, failures, `Old/incompatible CHECK constraints: ${(report.check_constraint_issues ?? []).map((item) => `${item.table}.${item.column}`).join(", ")}`);
  assertNoFailures((report.data_repair_issues ?? []).length === 0, failures, `Data repairs required: ${(report.data_repair_issues ?? []).map((item) => `${item.table}.${item.column}`).join(", ")}`);
  assertNoFailures((report.seed_blockers ?? []).length === 0, failures, `Seed blockers: ${(report.seed_blockers ?? []).map((item) => `${item.table}.${item.column}`).join(", ")}`);
  assertNoFailures((report.stale_repair_tables ?? []).length === 0, failures, `Stale repair tables exist: ${(report.stale_repair_tables ?? []).join(", ")}`);

  for (const value of advancedDeductionModes) {
    for (const tableName of ["leave_policies", "leave_requests", "leave_policy_deduction_rules"]) {
      const sql = report.remote_tables?.[tableName]?.sql ?? "";
      assertNoFailures(sql.includes(`'${value}'`), failures, `${tableName} CHECK does not include ${value}`);
    }
  }

  for (const [tableName, rule] of Object.entries(rebuildRules)) {
    const sql = report.remote_tables?.[tableName]?.sql ?? "";
    for (const value of rule.requiredValues) {
      assertNoFailures(sql.includes(`'${value}'`), failures, `${tableName}.${rule.column} CHECK does not include ${value}`);
    }
  }

  for (const column of ["module_enabled", "lock_roster_after_attendance_payroll_placeholder"]) {
    assertNoFailures(Boolean(report.remote_tables?.roster_settings?.columns?.[column]), failures, `roster_settings.${column} is missing`);
  }

  for (const [tableName, columns] of Object.entries(codeRequiredColumns)) {
    for (const column of Object.keys(columns)) {
      assertNoFailures(Boolean(report.remote_tables?.[tableName]?.columns?.[column]), failures, `${tableName}.${column} is missing`);
    }
  }

  if (schema.tables.final_settlements) {
    assertNoFailures(Boolean(report.remote_tables?.final_settlements), failures, "Prompt 12 final_settlements table is missing");
  }

  const readyReport = {
    generated_at: new Date().toISOString(),
    ready: failures.length === 0,
    failures,
    audit_report: path.relative(rootDir, auditReportPath).replaceAll("\\", "/"),
    audit_output: auditOutput
  };
  writeJson(readyReportPath, readyReport);

  if (failures.length) {
    console.error("Remote D1 schema is not ready for schema.sql/seed.sql.");
    for (const failure of failures) console.error(`- ${failure}`);
    console.error("Report saved: database/remote_schema_ready_report.json");
    process.exit(1);
  }

  console.log("Remote D1 schema is ready for schema.sql and seed.sql.");
  console.log("Report saved: database/remote_schema_ready_report.json");
}

try {
  main();
} catch (error) {
  console.error("Remote D1 schema readiness verification failed.");
  console.error(error.message);
  if (error.output) console.error(error.output);
  process.exit(1);
}
