import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const reportPath = path.join(root, "docs", "production", "onboarding-section-statuses-diagnostics.md");
const schemaPath = path.join(root, "database", "schema.sql");
const registryPath = path.join(root, "worker", "src", "onboarding", "section-status-registry.ts");
const helperPath = path.join(root, "worker", "src", "onboarding", "section-status.ts");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function sectionKeys(registrySource) {
  return [...registrySource.matchAll(/section_key:\s*"([^"]+)"/g)].map((match) => match[1]);
}

function safeId(value) {
  const raw = String(value ?? "").trim();
  return /^[A-Za-z0-9_-]{3,160}$/.test(raw) ? raw : "";
}

const schema = read(schemaPath);
const registry = read(registryPath);
const helpers = read(helperPath);
const keys = sectionKeys(registry);
const requiredKeys = [
  "employee_info",
  "contact_emergency",
  "job_assignment",
  "contract",
  "documents",
  "payroll_profile",
  "payment_method",
  "pension",
  "user_access",
  "attendance_roster",
  "assets_uniforms",
  "approval_tasks"
];
const missingRegistryKeys = requiredKeys.filter((key) => !keys.includes(key));
const caseId = safeId(process.env.HRM_DIAG_CASE_ID);
const employeeId = safeId(process.env.HRM_DIAG_EMPLOYEE_ID);
const generatedAt = new Date().toISOString();

const lines = [
  "# Onboarding Section Status Diagnostics",
  "",
  `Generated at: ${generatedAt}`,
  "",
  "## Source Checks",
  "",
  `- Table present in schema: ${schema.includes("CREATE TABLE IF NOT EXISTS onboarding_setup_section_statuses") ? "PASS" : "FAIL"}`,
  `- Unique case/section protection: ${schema.includes("UNIQUE (case_id, section_key)") ? "PASS" : "FAIL"}`,
  `- Helper module present: ${helpers.includes("aggregateOnboardingReadinessFromSections") && helpers.includes("markOnboardingSectionStale") ? "PASS" : "FAIL"}`,
  `- Registry section count: ${keys.length}`,
  `- Missing registry sections: ${missingRegistryKeys.length ? missingRegistryKeys.join(", ") : "none"}`,
  "",
  "## Runtime Case Inspection",
  ""
];

if (!caseId) {
  lines.push(
    "Status: SKIPPED",
    "",
    "Set `HRM_DIAG_CASE_ID` to inspect one onboarding case. This diagnostic does not query production data without an explicit case id.",
    ""
  );
} else {
  lines.push(
    "Status: READY_TO_RUN_BOUNDED_SQL",
    "",
    `Case ID: ${caseId}`,
    employeeId ? `Employee ID: ${employeeId}` : "Employee ID: not provided",
    "",
    "Run these bounded SQL checks against the intended D1 target if row-level diagnostics are needed:",
    "",
    "```sql",
    `SELECT section_key, section_label, status, is_required, is_complete, is_verified, is_stale, status_reason_code, updated_at FROM onboarding_setup_section_statuses WHERE case_id = '${caseId}' ORDER BY section_key;`,
    `SELECT section_key, COUNT(*) AS duplicate_count FROM onboarding_setup_section_statuses WHERE case_id = '${caseId}' GROUP BY section_key HAVING COUNT(*) > 1;`,
    `SELECT section_key, status, status_reason_code FROM onboarding_setup_section_statuses WHERE case_id = '${caseId}' AND status IN ('stale', 'failed', 'blocked') ORDER BY section_key;`,
    "```",
    ""
  );
}

lines.push(
  "## Shadow Comparison Notes",
  "",
  "- The Phase 1 section readiness system is shadow/read-only.",
  "- Candidate readiness from section statuses must not enable activation.",
  "- Missing setup should appear as blocked/incomplete, while failed is reserved for system/checker failures.",
  "- Do not include payroll amounts, bank account values, document numbers, file contents, passwords, tokens, or raw SQL errors in diagnostic output.",
  ""
);

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${lines.join("\n")}\n`);
console.log("Onboarding section status diagnostics report generated.");
console.log("Report saved: docs/production/onboarding-section-statuses-diagnostics.md");
if (!caseId) console.log("Runtime row inspection skipped because HRM_DIAG_CASE_ID was not provided.");
