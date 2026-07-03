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
  const dir = path.join(rootDir, relativeDir);
  if (!fs.existsSync(dir)) return "";
  const chunks = [];
  const stack = [dir];
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

function bodyOf(content, name) {
  const start = content.search(new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${name}\\b`));
  if (start < 0) return "";
  const open = content.indexOf("{", start);
  if (open < 0) return "";
  let depth = 0;
  for (let index = open; index < content.length; index += 1) {
    const char = content[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return content.slice(start, index + 1);
    }
  }
  return "";
}

function scriptExists(packageJson, script) {
  return Boolean(packageJson.scripts?.[script]);
}

const packageJson = JSON.parse(read("package.json"));
const schemaSql = read("database/schema.sql");
const schema = parseSchema(schemaSql);
const documentCompliance = read("worker/src/routes/document-compliance.ts");
const documents = read("worker/src/routes/documents.ts");
const reports = read("worker/src/routes/reports.ts");
const backgroundJobs = read("worker/src/routes/background-jobs.ts");
const appEvents = read("worker/src/utils/app-events.ts");
const performanceRoutes = read("worker/src/routes/performance.ts");
const auditScript = read("scripts/audit-d1-query-performance.mjs");
const payloadVerifier = read("scripts/verify-d1-query-payload-optimization.mjs");
const phase20Report = read("docs/performance/d1-deferred-audit-remediation-phase20.md");
const wrangler = read("worker/wrangler.toml");
const password = read("worker/src/auth/password.ts");

check("package.json: verify:d1-deferred-audit-remediation-phase20 script exists", packageJson.scripts?.["verify:d1-deferred-audit-remediation-phase20"] === "node scripts/verify-d1-deferred-audit-remediation-phase20.mjs");
check("package.json: prior accepted performance verifier scripts remain registered", [
  "verify:sse-live-events-phase19",
  "verify:direct-r2-uploads-phase18",
  "verify:cloudflare-queues-phase17",
  "verify:backup-restore-retention-phase16",
  "verify:frontend-bundle-performance-phase10",
  "verify:document-upload-acceleration-background",
  "verify:cors-request-id-hotfix",
  "verify:d1-query-payload-optimization"
].every((script) => scriptExists(packageJson, script)));

check("docs/performance/d1-deferred-audit-remediation-phase20.md: report documents current high count", /Current HIGH findings count/i.test(phase20Report));
check("docs/performance/d1-deferred-audit-remediation-phase20.md: report documents current medium count", /Current MEDIUM findings count/i.test(phase20Report));
check("docs/performance/d1-deferred-audit-remediation-phase20.md: report documents current low count", /Current LOW findings count/i.test(phase20Report));
check("docs/performance/d1-deferred-audit-remediation-phase20.md: report documents fixed findings", /Findings fixed in Phase 20/i.test(phase20Report));
check("docs/performance/d1-deferred-audit-remediation-phase20.md: report documents deferred findings", /intentionally deferred/i.test(phase20Report));
check("docs/performance/d1-deferred-audit-remediation-phase20.md: report documents remaining high finding policy", /remaining HIGH/i.test(phase20Report));

check("scripts/audit-d1-query-performance.mjs: audit still reports HIGH findings rather than hiding them", /high_count/i.test(auditScript) && /top_high_findings/i.test(auditScript));
check("scripts/audit-d1-query-performance.mjs: audit references Phase 20 report without weakening findings", /phase20/i.test(auditScript));
check("scripts/verify-d1-query-payload-optimization.mjs: Phase 20 verifier is chained into payload optimization guard", /verify-d1-deferred-audit-remediation-phase20|d1-deferred-audit-remediation-phase20/i.test(payloadVerifier));

for (const marker of [
  "DOCUMENT_COMPLIANCE_BULK_BATCH_SIZE",
  "getActiveRequiredDocumentRules",
  "getEmployeeActiveDocumentsForEmployees",
  "getActiveWaiversForEmployees",
  "calculateLoadedEmployeeDocumentCompliance",
  "persistEmployeeDocumentComplianceSnapshot",
  "ON CONFLICT(employee_id, snapshot_date)"
]) {
  check(`worker/src/routes/document-compliance.ts: document compliance batching marker ${marker} exists`, documentCompliance.includes(marker));
}

const missingBody = bodyOf(documentCompliance, "getEmployeeMissingRequiredDocuments");
check("worker/src/routes/document-compliance.ts: missing document helper body was found", missingBody.length > 0);
check("worker/src/routes/document-compliance.ts: missing document helper avoids per-required-document active-document lookup", !/getEmployeeActiveDocumentByType/.test(missingBody));

const refreshAllBody = bodyOf(documentCompliance, "refreshAllDocumentComplianceSnapshots");
check("worker/src/routes/document-compliance.ts: bulk snapshot refresh body was found", refreshAllBody.length > 0);
check("worker/src/routes/document-compliance.ts: snapshot refresh processes employee chunks", /chunked\(ids\)/.test(refreshAllBody));
check("worker/src/routes/document-compliance.ts: snapshot refresh bulk-loads employee documents", /getEmployeeActiveDocumentsForEmployees/.test(refreshAllBody));
check("worker/src/routes/document-compliance.ts: snapshot refresh bulk-loads waivers", /getActiveWaiversForEmployees/.test(refreshAllBody));
check("worker/src/routes/document-compliance.ts: snapshot refresh persists idempotent snapshots", /persistEmployeeDocumentComplianceSnapshot/.test(refreshAllBody));

check("worker/src/routes/document-compliance.ts: dashboard no longer recalculates every employee synchronously", !/compliance\/dashboard[\s\S]{0,2400}refreshEmployeeDocumentComplianceSnapshot/.test(documentCompliance));
check("worker/src/routes/document-compliance.ts: dashboard snapshot list is bounded", /compliance\/dashboard[\s\S]{0,3200}LIMIT 200/.test(documentCompliance));
check("worker/src/routes/document-compliance.ts: renewal cases list is paginated", /renewal-cases[\s\S]{0,1400}parsePaginationParams[\s\S]{0,1400}paginationMeta/.test(documentCompliance));
check("worker/src/routes/document-compliance.ts: waiver list is paginated", /waivers[\s\S]{0,1400}parsePaginationParams[\s\S]{0,1400}LIMIT \? OFFSET \?/.test(documentCompliance));

check("worker/src/routes/documents.ts: registry list accepts pagination", /function listRegistry[\s\S]{0,500}pagination/.test(documents));
check("worker/src/routes/documents.ts: registry route is paginated", /documentRoutes\.get\("\/registry"[\s\S]{0,900}parsePaginationParams[\s\S]{0,900}paginationMeta/.test(documents));
check("worker/src/routes/documents.ts: missing report rows remain paginated", /documentRoutes\.get\("\/missing"[\s\S]{0,700}parsePaginationParams[\s\S]{0,700}paginationMeta/.test(documents));
check("worker/src/routes/documents.ts: report dashboard uses aggregate counts instead of full registry rows", /registrySummary/.test(documents) && /missingRequiredCount/.test(documents));
check("worker/src/routes/documents.ts: document dashboard limits recent registry rows", /listRegistry\(c,\s*\{[\s\S]{0,120}page:\s*1[\s\S]{0,120}limit:\s*10[\s\S]{0,120}offset:\s*0[\s\S]{0,120}\}\)/.test(documents));

check("worker/src/routes/reports.ts: payroll pension remittance uses aggregated result join", /ppc_sum/.test(reports));
check("worker/src/routes/reports.ts: bank loan remittance uses aggregated result join", /loan_sum/.test(reports));
check("worker/src/routes/reports.ts: custom deduction remittance uses aggregated result join", /custom_sum/.test(reports));
check("worker/src/routes/reports.ts: old payroll pension correlated per-row sum was removed", !/SELECT\s+SUM\(employee_contribution_amount\)[\s\S]{0,120}WHERE\s+ppc\.payroll_employee_result_id\s*=\s*pre\.id/i.test(reports));
check("worker/src/routes/reports.ts: old bank loan correlated per-row sum was removed", !/SELECT\s+SUM\(deducted_amount\)[\s\S]{0,120}WHERE\s+eblp\.payroll_employee_result_id\s*=\s*pre\.id/i.test(reports));

check("worker/src/routes/background-jobs.ts: background job list route uses pagination", /parsePaginationParams/.test(backgroundJobs) && /paginationMeta/.test(backgroundJobs));
check("worker/src/routes/background-jobs.ts: background job event detail list is capped", /background_job_events[\s\S]{0,240}LIMIT 50/.test(backgroundJobs));
check("worker/src/routes/background-jobs.ts: background job events do not expose raw metadata payloads", /NULL AS metadata_json/.test(backgroundJobs));
check("worker/src/routes/background-jobs.ts: background job events no longer use SELECT *", !/SELECT\s+\*\s+FROM\s+background_job_events/i.test(backgroundJobs));

check("worker/src/utils/app-events.ts: app event polling uses explicit columns", /APP_EVENT_SELECT_COLUMNS/.test(appEvents));
check("worker/src/utils/app-events.ts: app event polling remains bounded", /MAX_EVENTS_PER_FETCH/.test(appEvents) && /LIMIT \?/.test(appEvents));
check("worker/src/utils/app-events.ts: app event payloads remain sanitized", /sanitizeEventPayload/.test(appEvents) && /\[redacted\]/.test(appEvents));
check("worker/src/utils/app-events.ts: app event polling no longer uses SELECT *", !/SELECT\s+\*\s+FROM\s+app_events/i.test(appEvents));

check("worker/src/routes/performance.ts: performance dashboard lists remain paginated", /parsePaginationParams/.test(performanceRoutes) && /LIMIT \? OFFSET \?/.test(performanceRoutes));
check("worker/src/routes/performance.ts: performance event lists remain capped", /LIMIT 50/.test(performanceRoutes));

for (const [table, indexName] of [
  ["employee_bank_loan_payments", "idx_phase20_bank_loan_payments_result"],
  ["payroll_pension_contributions", "idx_phase20_pension_contributions_result"]
]) {
  check(`database/schema.sql: ${indexName} exists`, Boolean(schema.indexes?.[table]?.some((index) => index.name === indexName)));
  check(`database/schema.sql: ${indexName} is non-unique`, schema.indexes?.[table]?.every((index) => index.name !== indexName || !/^CREATE\s+UNIQUE\s+INDEX/i.test(index.sql)) ?? false);
}

const duplicateIndexSql = new Map();
for (const indexes of Object.values(schema.indexes)) {
  for (const index of indexes) {
    const normalized = index.sql.replace(/\bidx_[A-Za-z0-9_]+\b/g, "idx").replace(/\s+/g, " ").trim().toLowerCase();
    duplicateIndexSql.set(normalized, [...(duplicateIndexSql.get(normalized) ?? []), index.name]);
  }
}
const duplicates = [...duplicateIndexSql.values()].filter((names) => names.length > 1);
check(`database/schema.sql: no duplicate indexes introduced (${duplicates.map((names) => names.join("/")).join(", ")})`, duplicates.length === 0);

check("worker/src: authenticated HR API responses remain private/no-store", /private,\s*no-store/i.test(readTree("worker/src")));
check("worker/src: CORS request-id hotfix remains visible", /X-Request-Id/.test(readTree("worker/src")) && /x-request-id/.test(readTree("worker/src")));
check("frontend/src: no browser alert/confirm/prompt", !/\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/.test(readTree("frontend/src")));
check("frontend/src: no dark mode class added", !/\bdark:/i.test(readTree("frontend/src")));
check("worker/src/auth/password.ts: PBKDF2 iterations remain 100000", /100000/.test(password));
check("worker/wrangler.toml: D1 binding remains unchanged", /binding = "DB"/.test(wrangler) && /database_name = "hrm-v2"/.test(wrangler) && /database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"/.test(wrangler));
check("worker/wrangler.toml: R2 binding remains unchanged", /binding = "DOCUMENTS_BUCKET"/.test(wrangler) && /bucket_name = "hrm-v2-documents"/.test(wrangler));

if (failures.length) {
  console.error("Phase 20 D1 deferred audit remediation verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Phase 20 D1 deferred audit remediation verification passed.");
