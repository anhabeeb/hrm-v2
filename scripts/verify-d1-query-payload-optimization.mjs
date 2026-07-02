import fs from "node:fs";
import path from "node:path";
import { parseSchema, rootDir } from "./remote-d1-schema-utils.mjs";

const failures = [];

function read(relativePath) {
  const absolutePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`${relativePath}: missing required file`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function check(message, condition) {
  if (!condition) failures.push(message);
}

function includes(file, marker, message) {
  const content = read(file);
  check(`${file}: ${message}`, marker instanceof RegExp ? marker.test(content) : content.includes(marker));
}

function excludes(file, marker, message) {
  const content = read(file);
  check(`${file}: ${message}`, marker instanceof RegExp ? !marker.test(content) : !content.includes(marker));
}

function readTree(relativeDir) {
  const root = path.join(rootDir, relativeDir);
  if (!fs.existsSync(root)) return "";
  const chunks = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) chunks.push(fs.readFileSync(full, "utf8"));
    }
  }
  return chunks.join("\n");
}

function assertIndex(schema, indexName, tableName, message) {
  check(message, Boolean(schema.indexes?.[tableName]?.some((index) => index.name === indexName)));
}

function normalizeIndexSql(sql) {
  return String(sql)
    .replace(/\s+/g, " ")
    .replace(/\bidx_[A-Za-z0-9_]+\b/g, "idx")
    .trim()
    .toLowerCase();
}

const packageJson = JSON.parse(read("package.json"));
const schema = parseSchema(read("database/schema.sql"));
const schemaSql = read("database/schema.sql");
const lifecycle = "worker/src/routes/lifecycle.ts";
const notifications = "worker/src/routes/notifications.ts";
const search = "worker/src/routes/search.ts";
const dashboard = "worker/src/routes/dashboard.ts";
const employees = "worker/src/routes/employees.ts";
const performance = "worker/src/utils/performance.ts";
const http = "worker/src/utils/http.ts";
const remoteAudit = "scripts/audit-remote-d1-schema.mjs";
const remoteGenerate = "scripts/generate-remote-d1-repair.mjs";
const remoteReady = "scripts/verify-remote-d1-schema-ready.mjs";
const password = "worker/src/auth/password.ts";
const wrangler = "worker/wrangler.toml";

check("package.json: audit:d1-query-performance script is registered", packageJson.scripts?.["audit:d1-query-performance"] === "node scripts/audit-d1-query-performance.mjs");
check("package.json: verify:d1-query-payload-optimization script is registered", packageJson.scripts?.["verify:d1-query-payload-optimization"] === "node scripts/verify-d1-query-payload-optimization.mjs");
includes("scripts/audit-d1-query-performance.mjs", "SELECT * occurrences", "D1 query audit reports SELECT * risk");
includes("scripts/audit-d1-query-performance.mjs", "Potential unbounded ordered lists", "D1 query audit reports unbounded list risk");
includes("scripts/audit-d1-query-performance.mjs", "Potential unindexed filters", "D1 query audit reports missing-index risk");
includes("scripts/audit-d1-query-performance.mjs", "Potential N+1 risks", "D1 query audit reports N+1 risk");

for (const [indexName, tableName, message] of [
  ["idx_phase3_employees_type_employment_archived", "employees", "employee type/employment filters have a Phase 3 index"],
  ["idx_phase3_employees_created_active", "employees", "employee created/active list ordering has a Phase 3 index"],
  ["idx_phase3_onboarding_activation_created", "employee_onboarding_cases", "onboarding activation/status lists have a Phase 3 index"],
  ["idx_phase3_onboarding_owner_status_created", "employee_onboarding_cases", "onboarding owner/status lists have a Phase 3 index"],
  ["idx_phase3_document_required_rules_criteria", "document_required_rules", "document requirement matching has a Phase 3 criteria index"],
  ["idx_phase3_employee_documents_status_expiry_employee", "employee_documents", "document expiry/status filters have a Phase 3 index"],
  ["idx_phase3_attendance_daily_employee_status_date", "attendance_daily_records", "attendance employee/date/status filters have a Phase 3 index"],
  ["idx_phase3_attendance_corrections_status_employee_date", "attendance_correction_requests", "attendance correction status/date filters have a Phase 3 index"],
  ["idx_phase3_roster_assignments_employee_status_date", "roster_assignments", "roster employee/status/date filters have a Phase 3 index"],
  ["idx_phase3_payroll_runs_status_period", "payroll_runs", "payroll run status/period filters have a Phase 3 index"],
  ["idx_phase3_payroll_results_employee_status_run", "payroll_employee_results", "payroll employee result filters have a Phase 3 index"],
  ["idx_phase3_payroll_advances_status_employee_date", "payroll_advance_payments", "payroll advance payment filters have a Phase 3 index"],
  ["idx_phase3_payroll_adjustments_period_status", "payroll_adjustments", "payroll adjustment period/status filters have a Phase 3 index"],
  ["idx_phase3_assets_assignment_employee_status_created", "employee_asset_assignments", "asset assignment filters have a Phase 3 index"],
  ["idx_phase3_uniform_assignment_employee_status_created", "employee_uniform_assignments", "uniform assignment filters have a Phase 3 index"]
]) {
  assertIndex(schema, indexName, tableName, `database/schema.sql: ${message}`);
}

const phase3Indexes = Object.values(schema.indexes).flat().filter((index) => index.name.startsWith("idx_phase3_"));
check("database/schema.sql: Phase 3 indexes must be non-unique", phase3Indexes.every((index) => !/^CREATE\s+UNIQUE\s+INDEX/i.test(index.sql)));
const normalizedIndexes = new Map();
for (const index of Object.values(schema.indexes).flat()) {
  const normalized = normalizeIndexSql(index.sql);
  normalizedIndexes.set(normalized, [...(normalizedIndexes.get(normalized) ?? []), index.name]);
}
const duplicateIndexes = [...normalizedIndexes.values()].filter((names) => names.length > 1);
check(`database/schema.sql: duplicate index definitions must not be introduced (${duplicateIndexes.map((names) => names.join("/")).join(", ")})`, duplicateIndexes.length === 0);

includes(remoteAudit, "missingIndexes", "remote schema audit detects missing schema indexes");
includes(remoteGenerate, "addMissingIndexStatements", "remote repair generator can recreate missing indexes");
includes(remoteReady, "missing_columns", "remote readiness still validates columns");

includes(http, "X-HRM-Payload-Bytes", "shared JSON response helper records approximate payload size");
includes(http, "estimatePayloadBytes", "payload size estimation helper exists");
includes(performance, "PAYLOAD_WARNING_THRESHOLD_BYTES", "payload warning threshold remains");
includes(performance, "request_id", "performance warnings include request id correlation");
includes(performance, "X-HRM-Payload-Bytes", "performance middleware reads approximate payload size header");
excludes(performance, /JSON\.stringify\([^)]*body|password_hash|raw_token|document_contents|net_salary/i, "performance logging must not serialize sensitive payload bodies");
includes(performance, "private, no-store", "authenticated API responses are private/no-store");

includes(lifecycle, "timeD1(c, options.run, `onboarding.workspace.${options.key}`)", "onboarding workspace optional read groups remain D1-timed");
includes(lifecycle, "moduleStatuses[options.moduleKey] === false", "onboarding workspace skips disabled optional modules early");
includes(lifecycle, "No permission to load", "onboarding optional sections return no-permission state");
includes(lifecycle, "SELECT id, code, name, category, requires_end_date", "contract type workspace payload is narrowed");
includes(lifecycle, "SELECT id, employee_id, basic_salary, currency, payment_method", "payroll profile workspace payload is narrowed");
includes(lifecycle, "SELECT id, employee_id, payment_method_type", "payment method workspace payload is narrowed");
includes(lifecycle, "SELECT id, scheme_code, scheme_name", "pension scheme workspace payload is narrowed");
includes(lifecycle, "SELECT id, employee_id, attendance_device_id, biometric_user_id", "biometric mapping workspace payload is narrowed");
includes(lifecycle, "SELECT ea.id, ea.employee_id, ea.asset_item_id", "asset assignment workspace payload is narrowed");
includes(lifecycle, "LIMIT 100", "onboarding workspace user/support lists are capped");
includes(lifecycle, "LIMIT 200", "onboarding workspace large reference lists are capped");
excludes(lifecycle, "SELECT ea.*, ai.code AS asset_code", "asset workspace query no longer selects all assignment columns");
excludes(lifecycle, "SELECT * FROM pension_schemes WHERE status = 'ACTIVE'", "pension scheme workspace query no longer selects all columns");
excludes(lifecycle, "SELECT * FROM employee_biometric_mappings WHERE employee_id", "biometric workspace query no longer selects all columns");
excludes(lifecycle, "SELECT * FROM employee_payment_methods WHERE employee_id", "payment method workspace query no longer selects all columns");
excludes(lifecycle, "SELECT * FROM employee_lifecycle_events WHERE case_type = 'ONBOARDING'", "onboarding workspace event payload is narrowed");

includes(notifications, "NOTIFICATION_SELECT_COLUMNS", "notification list/detail queries use an explicit column list");
excludes(notifications, "SELECT * FROM notifications", "notifications hot path must not select all columns");
includes(notifications, "LIMIT ?", "notification list remains bounded");
includes(search, "const DEFAULT_LIMIT = 8", "global search default limit remains safe");
includes(search, "const MAX_LIMIT = 25", "global search maximum limit remains safe");
includes(search, "Promise.allSettled", "global search groups remain independent/cancellable-friendly");
includes(search, "moduleAllowed", "global search skips disabled or unauthorized modules");

includes(dashboard, "COUNT(*) AS value", "Command Center uses summary counts");
excludes(dashboard, /SELECT\s+\*/i, "Command Center must not return large row arrays");
includes(dashboard, "enabledModules.attendance", "Command Center skips disabled attendance group");
includes(dashboard, "enabledModules.payroll", "Command Center skips disabled payroll group");
includes(dashboard, "PriorityAction", "priority KPI icon data remains");
includes(dashboard, "dashboard.command-center-summary", "Command Center route remains timed");

includes(employees, "const EMPLOYEE_LIST_DEFAULT_LIMIT", "employee list has a default limit");
includes(employees, "const EMPLOYEE_LIST_MAX_LIMIT", "employee list has a maximum limit");
check(`${employees}: employee list endpoint caps LIMIT/OFFSET`, /LIMIT \? OFFSET \?/.test(read(employees)));
check(`${employees}: Employee 360 overview audit payload is capped`, /ORDER BY created_at DESC LIMIT 8/.test(read(employees)));

for (const script of [
  "verify:global-instant-performance-foundation",
  "verify:global-workspace-page-load-reduction",
  "verify:onboarding-employee-popup-layout",
  "verify:onboarding-batch-document-upload",
  "verify:onboarding-document-payroll-validation",
  "verify:sidebar-command-center-welcome",
  "verify:header-search-layout",
  "verify:command-center-dashboard",
  "verify:global-search-notifications",
  "verify:global-popup-alerts",
  "verify:disabled-module-global-sweep",
  "verify:main-module-submodule-dependencies",
  "verify:frontend-static-assets",
  "verify:frontend-bundle-integrity",
  "verify:form-action-validation-hardening",
  "verify:employee-user-account-linking",
  "verify:import-export-standardization",
  "smoke:production-readiness"
]) {
  check(`package.json: required regression script ${script} exists`, Boolean(packageJson.scripts?.[script]));
}

check("frontend/src: browser alert/confirm/prompt must not be introduced", !/\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/.test(readTree("frontend/src")));
check("frontend/src: dark mode must not be introduced", !/\bdark:/i.test(readTree("frontend/src")));
includes(password, "100000", "PBKDF2 iterations remain 100000");
includes(wrangler, 'binding = "DB"', "D1 binding remains DB");
includes(wrangler, 'database_name = "hrm-v2"', "D1 database name remains hrm-v2");
includes(wrangler, 'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"', "D1 database id remains unchanged");
includes(wrangler, 'binding = "DOCUMENTS_BUCKET"', "R2 binding remains DOCUMENTS_BUCKET");
includes(wrangler, 'bucket_name = "hrm-v2-documents"', "R2 bucket remains hrm-v2-documents");
check("database/schema.sql: no public cache marker added", !/\bCache-Control:\s*public\b/i.test(schemaSql));

if (failures.length) {
  console.error("D1 query and payload optimization verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("D1 query and payload optimization verification passed.");
