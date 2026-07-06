import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const out = path.join(root, "docs", "production", "employee360-final-activation-diagnostics.md");

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  return fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, "utf8") : "";
}

function marker(source, text) {
  return source.includes(text) ? "PASS" : "FAIL";
}

const service = read("worker/src/employee-setup/final-activation-verifier.ts");
const employeesRoute = read("worker/src/routes/employees.ts");
const profilePage = read("frontend/src/pages/EmployeeProfilePage.tsx");
const api = read("frontend/src/lib/api.ts");
const types = read("frontend/src/types/employees.ts");
const seed = read("database/seed.sql");
const employeeId = process.env.HRM_DIAG_EMPLOYEE_ID;
const dryRun = process.env.HRM_DIAG_RUN_FINAL_VERIFICATION_DRY_RUN === "1";

const lines = [
  "# Employee 360 Final Activation Diagnostic",
  "",
  `Generated: ${new Date().toISOString()}`,
  "",
  "## Source Markers",
  "",
  `- Final verifier service: ${marker(service, "verifyEmployee360SetupForActivation")}`,
  `- Rebuild stale/missing sections helper: ${marker(service, "rebuildStaleEmployeeSetupSectionsBeforeFinalVerification")}`,
  `- Final targeted section verification helper: ${marker(service, "runEmployeeSetupFinalSectionVerification")}`,
  `- Mark verified sections helper: ${marker(service, "markEmployeeSetupSectionsVerified")}`,
  `- Safe blocker response helper: ${marker(service, "buildEmployeeActivationBlockerResponse")}`,
  `- Final verification endpoint: ${marker(employeesRoute, 'employeeRoutes.post("/:id/setup/final-verification"')}`,
  `- Activation endpoint: ${marker(employeesRoute, 'employeeRoutes.post("/:id/setup/activate"')}`,
  `- Activation endpoint calls final verifier: ${marker(employeesRoute, "verifyEmployee360SetupForActivation")}`,
  `- Final verification app events: ${marker(employeesRoute, "employee.setup.final_verification.verified")}`,
  `- Activation app events: ${marker(employeesRoute, "employee.activated")}`,
  `- Employee 360 API helpers: ${marker(api, "runEmployee360FinalVerification")} / ${marker(api, "activateEmployeeFromEmployee360")}`,
  `- Employee 360 frontend action buttons: ${marker(profilePage, "Run Final Verification")} / ${marker(profilePage, "Activate Employee")}`,
  `- Frontend final verification types: ${marker(types, "Employee360FinalVerification")}`,
  `- Granular permissions seeded: ${marker(seed, "employee.setup.verify")} / ${marker(seed, "employee.setup.activate")} / ${marker(seed, "employees.activate")}`,
  "",
  "## Runtime Row Inspection",
  "",
  employeeId
    ? `HRM_DIAG_EMPLOYEE_ID is set to \`${employeeId}\`. Use the SQL below against local or remote D1 to inspect the current employee.`
    : "HRM_DIAG_EMPLOYEE_ID is not set, so runtime row inspection is skipped.",
  "",
  "```sql",
  employeeId
    ? `SELECT e.id, e.employee_no, e.full_name, es.key AS employee_status
FROM employees e
LEFT JOIN employee_statuses es ON es.id = e.status_id
WHERE e.id = '${employeeId}';

SELECT section_key, section_label, status, is_required, is_complete, is_verified, is_stale,
       status_reason_code, status_message, next_action, updated_at
FROM employee_setup_section_statuses
WHERE employee_id = '${employeeId}'
ORDER BY section_key;

SELECT decision_status, document_type_id, required_rule_id, approval_status,
       decided_by_user_id, revoked_at, reason
FROM employee_document_requirement_decisions
WHERE employee_id = '${employeeId}'
ORDER BY decided_at DESC
LIMIT 50;

SELECT action, entity_type, entity_id, reason, created_at
FROM audit_logs
WHERE entity_id = '${employeeId}'
   OR entity_id LIKE '${employeeId}:%'
ORDER BY created_at DESC
LIMIT 50;`
    : "-- Set HRM_DIAG_EMPLOYEE_ID to include employee-specific diagnostic SQL.",
  "```",
  "",
  "## Dry Run",
  "",
  dryRun
    ? "HRM_DIAG_RUN_FINAL_VERIFICATION_DRY_RUN=1 was set. This source diagnostic is read-only; run the API endpoint manually with a valid token to execute backend verification."
    : "Final verification dry-run was not executed. This diagnostic does not write D1 data, activate employees, seed production data, or print secrets.",
  "",
  "## Safety Notes",
  "",
  "- Employee 360 setup status alone is not an activation authority.",
  "- The activation endpoint calls backend final verification before changing employee status.",
  "- Missing setup is expected to be Blocked, while system/query failures are Failed with safe messages.",
  "- Existing onboarding files and activation routes remain present."
];

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${lines.join("\n")}\n`);
console.log(`Employee 360 final activation diagnostic written to ${path.relative(root, out)}`);
