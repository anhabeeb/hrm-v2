import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const outputPath = path.join(root, "docs/production/document-requirement-decisions-diagnostics.md");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function marker(source, text) {
  return source.includes(text) ? "PASS" : "CHECK";
}

const schema = read("database/schema.sql");
const seed = read("database/seed.sql");
const service = read("worker/src/employee-setup/document-requirement-decisions.ts");
const documentsRoute = read("worker/src/routes/documents.ts");
const employeeSetupStatus = read("worker/src/employee-setup/section-status.ts");
const onboardingEvaluators = read("worker/src/onboarding/section-evaluators.ts");
const panel = read("frontend/src/components/employee/EmployeeDocumentsPanel.tsx");

const checks = [
  ["Decision table", marker(schema, "employee_document_requirement_decisions")],
  ["Waiver/exemption rule fields", ["waiver_allowed", "exemption_allowed", "hard_required"].every((item) => schema.includes(item)) ? "PASS" : "CHECK"],
  ["Granular permissions", ["documents.requirement_decision.view", "documents.requirement_decision.manage", "documents.requirement_waiver.approve", "documents.requirement_waiver.revoke"].every((item) => seed.includes(item)) ? "PASS" : "CHECK"],
  ["Decision list builder", marker(service, "buildDocumentRequirementDecisionList")],
  ["Not-required action", marker(service, "decideDocumentNotRequired")],
  ["Waiver/exemption action", marker(service, "waiveDocumentRequirement")],
  ["Revoke action", marker(service, "revokeDocumentDecision")],
  ["Upload sync", marker(service, "syncDocumentDecisionAfterUpload")],
  ["Activation verifier gate", marker(service, "verifyDocumentDecisionForActivation")],
  ["Employee 360 routes", marker(documentsRoute, "/:employeeId/document-requirements")],
  ["Setup status update returned", marker(documentsRoute, "setup_status_update")],
  ["Final verification marked stale", marker(documentsRoute, 'staleSectionKeys: ["final_verification"]')],
  ["Employee 360 evaluator uses gate", marker(employeeSetupStatus, "verifyDocumentDecisionForActivation")],
  ["Onboarding evaluator uses gate", marker(onboardingEvaluators, "verifyDocumentDecisionForActivation")],
  ["Employee 360 UI decision table", marker(panel, "Document requirement decisions")]
];

const report = [
  "# Document Requirement Decisions Diagnostics",
  "",
  `Generated: ${new Date().toISOString()}`,
  "",
  "## Summary",
  "",
  "This diagnostic validates the Phase 3 Employee 360 document requirement decision gate from source. It does not read or write production data.",
  "",
  "| Check | Status |",
  "| --- | --- |",
  ...checks.map(([name, status]) => `| ${name} | ${status} |`),
  "",
  "## Operational Notes",
  "",
  "- Use `GET /api/v1/employees/:employeeId/document-requirements` to inspect the effective decision list for an employee.",
  "- Missing or expired hard-required documents should stay blocked until a valid document is uploaded.",
  "- Not-required, waived, and exempted decisions are audit logged and mark Employee 360 final verification stale.",
  "- Upload, replace, metadata update, archive, restore, soft-delete, and permanent-delete paths synchronize decision status.",
  "- Visa and Work Permit local/foreign behavior is derived from `document_required_rules`, not hardcoded document type codes.",
  "",
  "## Suggested Live Checks",
  "",
  "1. Open Employee 360 > Documents for a local employee and confirm foreign-only document rules show Not required.",
  "2. Open Employee 360 > Documents for a foreign employee and confirm Passport/Visa/Work Permit rules block until uploaded or waived.",
  "3. Mark a non-hard requirement Not required and confirm the Documents section updates while Final Verification becomes stale.",
  "4. Upload a required document and confirm the same requirement row changes to Uploaded.",
  "5. Revoke a waiver/not-required decision and confirm the row returns to Missing when no active document exists.",
  ""
].join("\n");

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, report);
console.log(`Document requirement decisions diagnostics written to ${path.relative(root, outputPath)}`);
