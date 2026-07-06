import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`${relativePath}: missing required file`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

function includesAll(source, markers) {
  return markers.every((marker) => source.includes(marker));
}

const packageJson = JSON.parse(read("package.json"));
const schema = read("database/schema.sql");
const seed = read("database/seed.sql");
const remoteUtils = read("scripts/remote-d1-schema-utils.mjs");
const service = read("worker/src/employee-setup/document-requirement-decisions.ts");
const documentsRoute = read("worker/src/routes/documents.ts");
const employeeSetupStatus = read("worker/src/employee-setup/section-status.ts");
const onboardingEvaluators = read("worker/src/onboarding/section-evaluators.ts");
const api = read("frontend/src/lib/api.ts");
const types = read("frontend/src/types/documents.ts");
const panel = read("frontend/src/components/employee/EmployeeDocumentsPanel.tsx");
const wrangler = read("worker/wrangler.toml");
const password = read("worker/src/auth/password.ts");

check(schema.includes("CREATE TABLE IF NOT EXISTS employee_document_requirement_decisions"), "decision table is missing");
for (const column of ["waiver_allowed", "exemption_allowed", "hard_required", "waiver_requires_reason", "waiver_requires_approval"]) {
  check(schema.includes(`${column} INTEGER`) && remoteUtils.includes(column), `${column} schema/remote repair coverage is missing`);
}
for (const indexName of [
  "idx_employee_document_requirement_decisions_employee",
  "idx_employee_document_requirement_decisions_status",
  "idx_employee_document_requirement_decisions_rule"
]) {
  check(schema.includes(indexName), `${indexName} is missing`);
}

for (const permission of [
  "documents.requirement_decision.view",
  "documents.requirement_decision.manage",
  "documents.requirement_waiver.approve",
  "documents.requirement_waiver.revoke"
]) {
  check(seed.includes(permission), `${permission} seed is missing`);
}

for (const helper of [
  "buildDocumentRequirementDecisionList",
  "decideDocumentNotRequired",
  "waiveDocumentRequirement",
  "revokeDocumentDecision",
  "getDocumentDecisionStatus",
  "syncDocumentDecisionAfterUpload",
  "verifyDocumentDecisionForActivation",
  "sanitizeDocumentDecisionError"
]) {
  check(service.includes(`export async function ${helper}`) || service.includes(`export function ${helper}`), `${helper} helper is missing`);
}
check(service.includes("ruleMatches") && service.includes("No active required document rule matches"), "not-required decisions must be derived from configured rules");
check(!/VISA|WORK_PERMIT|PASSPORT|ID_CARD/.test(service), "decision service must not hardcode document type codes");
check(service.includes("hard_required") && service.includes("DOCUMENT_REQUIREMENT_HARD_REQUIRED"), "hard-required document protection is missing");
check(service.includes("activation_blocking") && service.includes("expired"), "activation blocker handling is missing");
check(service.includes("replace(/SQLITE_") && service.includes("sensitive value"), "safe error sanitizer is missing");

for (const route of [
  'employeeDocumentRoutes.get("/:employeeId/document-requirements"',
  'employeeDocumentRoutes.post("/:employeeId/document-requirements/:documentTypeId/not-required"',
  'employeeDocumentRoutes.post("/:employeeId/document-requirements/:documentTypeId/waive"',
  'employeeDocumentRoutes.post("/:employeeId/document-requirements/:documentTypeId/revoke"'
]) {
  check(documentsRoute.includes(route), `${route} route is missing`);
}
check(documentsRoute.includes("canAccessEmployee") && documentsRoute.includes('"documents", "manage"'), "decision routes must enforce employee access scope");
check(documentsRoute.includes("document.requirement.not_required") && documentsRoute.includes("document.requirement.waived") && documentsRoute.includes("document.requirement.revoked"), "decision actions are not audited");
check(documentsRoute.includes("setup_status_update") && documentsRoute.includes('staleSectionKeys: ["final_verification"]'), "decision/upload actions must return setup_status_update and stale final verification");
check((documentsRoute.match(/syncDocumentDecisionAfterUpload/g) ?? []).length >= 5, "upload/delete/metadata flows are not synced to decision status");
check(documentsRoute.includes("waiver_allowed") && documentsRoute.includes("hard_required"), "required rule APIs do not expose new waiver fields");

check(employeeSetupStatus.includes("verifyDocumentDecisionForActivation") && employeeSetupStatus.includes("decision_gate"), "Employee 360 setup documents evaluator does not use decision gate");
check(onboardingEvaluators.includes("verifyDocumentDecisionForActivation") && onboardingEvaluators.includes("decision_gate"), "Onboarding readiness evaluator does not use decision gate");
check(employeeSetupStatus.includes("activation_requires_final_verification: true"), "Employee 360 activation shadow guard regressed");

check(api.includes("listEmployeeDocumentRequirementDecisions") && api.includes("/document-requirements"), "frontend API list helper is missing");
check(api.includes("markEmployeeDocumentRequirementNotRequired") && api.includes("waiveEmployeeDocumentRequirement") && api.includes("revokeEmployeeDocumentRequirementDecision"), "frontend API decision action helpers are missing");
check(types.includes("EmployeeDocumentRequirementDecision") && types.includes("DocumentRequirementDecisionStatus"), "frontend decision types are missing");
check(panel.includes("Document requirement decisions") && panel.includes("Employee does not require") && panel.includes("Waive") && panel.includes("Exempt") && panel.includes("Revoke"), "Employee 360 Documents panel does not expose decision UI");
check(panel.includes("setUploadModal({ mode: \"upload\", documentTypeId: row.document_type_id })"), "decision Upload action must preselect document type");
check(panel.includes("onSetupStatusUpdate") && panel.includes("result.setup_status_update"), "decision UI must propagate setup status updates");
check(!/\b(window\.)?(alert|confirm|prompt)\s*\(/.test([panel, documentsRoute, service].join("\n")), "browser alert/confirm/prompt was introduced");
check(!/dark:|prefers-color-scheme|useDarkMode/i.test([panel, documentsRoute, service].join("\n")), "dark mode was introduced");

check(packageJson.scripts?.["verify:document-requirement-decision-gate"] === "node scripts/verify-document-requirement-decision-gate.mjs", "verify script registration is missing");
check(packageJson.scripts?.["diagnose:document-requirement-decisions"] === "node scripts/diagnose-document-requirement-decisions.mjs", "diagnostic script registration is missing");
check(fs.existsSync(path.join(root, "docs/production/document-requirement-decisions-diagnostics.md")), "diagnostic report is missing");
check(wrangler.includes('binding = "DB"') && wrangler.includes('database_name = "hrm-v2"') && wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'), "D1 binding changed");
check(wrangler.includes('binding = "DOCUMENTS_BUCKET"') && wrangler.includes('bucket_name = "hrm-v2-documents"'), "R2 binding changed");
check(password.includes("100000"), "PBKDF2 iterations changed");

if (failures.length) {
  console.error("Document requirement decision gate verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Document requirement decision gate verification passed.");
