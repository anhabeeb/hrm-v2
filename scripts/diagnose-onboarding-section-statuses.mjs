import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const reportPath = path.join(root, "docs", "production", "onboarding-section-statuses-diagnostics.md");
const schemaPath = path.join(root, "database", "schema.sql");
const registryPath = path.join(root, "worker", "src", "onboarding", "section-status-registry.ts");
const helperPath = path.join(root, "worker", "src", "onboarding", "section-status.ts");
const evaluatorPath = path.join(root, "worker", "src", "onboarding", "section-evaluators.ts");
const lifecyclePath = path.join(root, "worker", "src", "routes", "lifecycle.ts");
const frontendPath = path.join(root, "frontend", "src", "pages", "LifecyclePage.tsx");

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
const evaluators = read(evaluatorPath);
const lifecycle = read(lifecyclePath);
const frontend = read(frontendPath);
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
  `- Section-scoped evaluator present: ${evaluators.includes("evaluateOnboardingSectionStatusesForKeys") ? "PASS" : "FAIL"}`,
  `- Save integration helper present: ${lifecycle.includes("updateOnboardingSectionStatusAfterSave") ? "PASS" : "FAIL"}`,
  `- Save response payload present: ${lifecycle.includes("section_status_update") ? "PASS" : "FAIL"}`,
  `- Frontend applies save payload: ${frontend.includes("applySectionStatusUpdatePayload") ? "PASS" : "FAIL"}`,
  `- Registry section count: ${keys.length}`,
  `- Expected section list: ${keys.join(", ")}`,
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
    `SELECT section_key, status, last_saved_at, last_evaluated_at, updated_at FROM onboarding_setup_section_statuses WHERE case_id = '${caseId}' ORDER BY updated_at DESC;`,
    `SELECT section_key, COUNT(*) AS duplicate_count FROM onboarding_setup_section_statuses WHERE case_id = '${caseId}' GROUP BY section_key HAVING COUNT(*) > 1;`,
    `SELECT section_key, status, status_reason_code FROM onboarding_setup_section_statuses WHERE case_id = '${caseId}' AND status IN ('stale', 'failed', 'blocked') ORDER BY section_key;`,
    `SELECT expected.section_key FROM (${requiredKeys.map((key) => `SELECT '${key}' AS section_key`).join(" UNION ALL ")}) expected LEFT JOIN onboarding_setup_section_statuses actual ON actual.case_id = '${caseId}' AND actual.section_key = expected.section_key WHERE actual.section_key IS NULL;`,
    `SELECT section_key, section_label, status_message, next_action FROM onboarding_setup_section_statuses WHERE case_id = '${caseId}' AND status = 'stale' ORDER BY section_key;`,
    `SELECT section_key, section_label, status_reason_code, status_message, next_action FROM onboarding_setup_section_statuses WHERE case_id = '${caseId}' AND status = 'failed' ORDER BY section_key;`,
    `SELECT action, entity_type, entity_id, created_at FROM audit_logs WHERE entity_id IN ('${caseId}'${employeeId ? `, '${employeeId}'` : ""}) AND action LIKE 'onboarding.%' ORDER BY created_at DESC LIMIT 25;`,
    "```",
    ""
  );
}

lines.push(
  "## Shadow Comparison Notes",
  "",
  "- The Phase 1 section readiness system is shadow/read-only.",
  "- Phase 2 save integration updates only affected section statuses after successful section commits.",
  "- Use the timestamp query to verify the latest saved/evaluated section rows after each onboarding save.",
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
