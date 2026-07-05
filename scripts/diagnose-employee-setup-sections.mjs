import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const reportPath = path.join(root, "docs", "production", "employee-setup-sections-diagnostics.md");
const schemaPath = path.join(root, "database", "schema.sql");
const registryPath = path.join(root, "worker", "src", "employee-setup", "section-registry.ts");
const helperPath = path.join(root, "worker", "src", "employee-setup", "section-status.ts");
const employeesRoutePath = path.join(root, "worker", "src", "routes", "employees.ts");
const frontendPath = path.join(root, "frontend", "src", "pages", "EmployeeProfilePage.tsx");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function sectionKeys(registrySource) {
  return [...registrySource.matchAll(/section_key:\s*"([^"]+)"/g)].map((match) => match[1]);
}

function safeId(value) {
  const raw = String(value ?? "").trim();
  return /^[A-Za-z0-9_-]{3,180}$/.test(raw) ? raw : "";
}

const schema = read(schemaPath);
const registry = read(registryPath);
const helpers = read(helperPath);
const employeesRoute = read(employeesRoutePath);
const frontend = read(frontendPath);
const keys = sectionKeys(registry);
const requiredKeys = [
  "profile_information",
  "contact_emergency",
  "job_assignment",
  "documents",
  "contract",
  "payroll_profile",
  "payment_method",
  "pension",
  "user_access",
  "attendance_roster",
  "assets_uniforms",
  "approval_tasks",
  "final_verification"
];
const missingRegistryKeys = requiredKeys.filter((key) => !keys.includes(key));
const employeeId = safeId(process.env.HRM_DIAG_EMPLOYEE_ID);
const generatedAt = new Date().toISOString();

const lines = [
  "# Employee 360 Setup Sections Diagnostics",
  "",
  `Generated at: ${generatedAt}`,
  "",
  "## Source Checks",
  "",
  `- Table present in schema: ${schema.includes("CREATE TABLE IF NOT EXISTS employee_setup_section_statuses") ? "PASS" : "FAIL"}`,
  `- Unique employee/section protection: ${schema.includes("UNIQUE (employee_id, section_key)") ? "PASS" : "FAIL"}`,
  `- Employee status seed includes PENDING_SETUP: ${read(path.join(root, "database", "seed.sql")).includes("'PENDING_SETUP'") ? "PASS" : "FAIL"}`,
  `- Registry section count: ${keys.length}`,
  `- Expected section list: ${keys.join(", ")}`,
  `- Missing registry sections: ${missingRegistryKeys.length ? missingRegistryKeys.join(", ") : "none"}`,
  `- Helper module present: ${helpers.includes("aggregateEmployeeSetupReadiness") && helpers.includes("markEmployeeSetupSectionStale") ? "PASS" : "FAIL"}`,
  `- Setup-readiness endpoint present: ${employeesRoute.includes('"/:id/setup-readiness"') ? "PASS" : "FAIL"}`,
  `- Setup-sections rebuild endpoint present: ${employeesRoute.includes('"/:id/setup-sections/rebuild"') ? "PASS" : "FAIL"}`,
  `- Employee 360 preview panel present: ${frontend.includes("EmployeeSetupReadinessPanel") ? "PASS" : "FAIL"}`,
  `- Activation remains preview-only: ${helpers.includes("can_activate_candidate: false") && employeesRoute.includes("activation_switched: false") ? "PASS" : "FAIL"}`,
  `- latest status update timestamps: checked via bounded SQL when HRM_DIAG_EMPLOYEE_ID is provided`,
  `- stale sections: checked via bounded SQL when HRM_DIAG_EMPLOYEE_ID is provided`,
  `- failed sections: checked via bounded SQL when HRM_DIAG_EMPLOYEE_ID is provided`,
  `- missing required section rows: checked via bounded SQL when HRM_DIAG_EMPLOYEE_ID is provided`,
  `- duplicate section rows: checked via bounded SQL when HRM_DIAG_EMPLOYEE_ID is provided`,
  `- setup readiness summary: checked via bounded SQL when HRM_DIAG_EMPLOYEE_ID is provided`,
  `- recent employee save/update events: checked via bounded SQL when HRM_DIAG_EMPLOYEE_ID is provided`,
  "",
  "## Runtime Employee Inspection",
  ""
];

if (!employeeId) {
  lines.push(
    "Status: SKIPPED",
    "",
    "Set `HRM_DIAG_EMPLOYEE_ID` to inspect one employee. This diagnostic does not query production data without an explicit employee id.",
    ""
  );
} else {
  lines.push(
    "Status: READY_TO_RUN_BOUNDED_SQL",
    "",
    `Employee ID: ${employeeId}`,
    "",
    "Run these bounded SQL checks against the intended D1 target if row-level diagnostics are needed:",
    "",
    "```sql",
    `SELECT section_key, section_label, status, is_required, is_complete, is_verified, is_stale, status_reason_code, updated_at FROM employee_setup_section_statuses WHERE employee_id = '${employeeId}' ORDER BY section_key;`,
    `-- latest status update timestamps`,
    `SELECT section_key, status, last_saved_at, last_evaluated_at, updated_at FROM employee_setup_section_statuses WHERE employee_id = '${employeeId}' ORDER BY updated_at DESC;`,
    `-- stale sections`,
    `SELECT section_key, section_label, status_reason_code, status_message, next_action, updated_at FROM employee_setup_section_statuses WHERE employee_id = '${employeeId}' AND (is_stale = 1 OR status = 'stale') ORDER BY section_key;`,
    `-- failed sections`,
    `SELECT section_key, section_label, status_reason_code, status_message, next_action, updated_at FROM employee_setup_section_statuses WHERE employee_id = '${employeeId}' AND status = 'failed' ORDER BY section_key;`,
    `-- duplicate section rows`,
    `SELECT section_key, COUNT(*) AS duplicate_count FROM employee_setup_section_statuses WHERE employee_id = '${employeeId}' GROUP BY section_key HAVING COUNT(*) > 1;`,
    `-- missing required section rows`,
    `SELECT expected.section_key FROM (${requiredKeys.map((key) => `SELECT '${key}' AS section_key`).join(" UNION ALL ")}) expected LEFT JOIN employee_setup_section_statuses actual ON actual.employee_id = '${employeeId}' AND actual.section_key = expected.section_key WHERE actual.section_key IS NULL;`,
    `-- setup readiness summary`,
    `SELECT status, COUNT(*) AS section_count, SUM(CASE WHEN is_required = 1 THEN 1 ELSE 0 END) AS required_count, SUM(CASE WHEN is_complete = 1 THEN 1 ELSE 0 END) AS complete_count, SUM(CASE WHEN is_stale = 1 THEN 1 ELSE 0 END) AS stale_count FROM employee_setup_section_statuses WHERE employee_id = '${employeeId}' GROUP BY status ORDER BY status;`,
    `SELECT e.id, e.employee_no, es.key AS status_key FROM employees e LEFT JOIN employee_statuses es ON es.id = e.status_id WHERE e.id = '${employeeId}' LIMIT 1;`,
    `-- recent employee save/update events`,
    `SELECT action, entity_type, entity_id, created_at FROM audit_logs WHERE entity_id = '${employeeId}' AND action LIKE 'employee.%' ORDER BY created_at DESC LIMIT 25;`,
    "```",
    ""
  );
}

lines.push(
  "## Phase 1 Notes",
  "",
  "- Employee 360 setup readiness is a shadow preview in this phase.",
  "- The old onboarding module and activation verifier remain the production activation authority.",
  "- Missing setup should appear as blocked/incomplete, while failed is reserved for system checker failures.",
  "- Disabled modules or disabled submodules should mark dependent sections as not required.",
  "- Do not include payroll amounts, bank account values, document numbers, file contents, passwords, tokens, or raw SQL errors in diagnostic output.",
  ""
);

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${lines.join("\n")}\n`);
console.log("Employee 360 setup sections diagnostics report generated.");
console.log("Report saved: docs/production/employee-setup-sections-diagnostics.md");
if (!employeeId) console.log("Runtime row inspection skipped because HRM_DIAG_EMPLOYEE_ID was not provided.");
