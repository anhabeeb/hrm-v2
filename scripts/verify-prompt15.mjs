import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function ok(condition, message) {
  if (!condition) {
    console.error(`Prompt 15 verification failed: ${message}`);
    process.exit(1);
  }
}

function hasAll(file, markers) {
  const text = read(file);
  for (const marker of markers) ok(text.includes(marker), `${file} missing ${marker}`);
}

const packageJson = JSON.parse(read("package.json"));
const scripts = packageJson.scripts ?? {};
[
  "verify:baseline-prompts1-5",
  "verify:prompt8",
  "verify:prompt9",
  "verify:recovery-prompts6-9",
  "verify:prompt10",
  "verify:prompt11",
  "verify:prompt12",
  "verify:prompt12b",
  "verify:prompt12-final",
  "verify:prompt13",
  "verify:prompt14",
  "verify:prompt15"
].forEach((script) => ok(Boolean(scripts[script]), `package.json missing ${script}`));

hasAll("database/schema.sql", [
  "CREATE TABLE IF NOT EXISTS document_compliance_settings",
  "CREATE TABLE IF NOT EXISTS document_requirement_waivers",
  "CREATE TABLE IF NOT EXISTS employee_document_compliance_snapshots",
  "CREATE TABLE IF NOT EXISTS document_expiry_alerts",
  "CREATE TABLE IF NOT EXISTS document_renewal_cases",
  "CREATE TABLE IF NOT EXISTS document_renewal_case_events",
  "expiry_required",
  "urgent_expiring_days",
  "renewal_case_auto_create",
  "employee_summary_visible",
  "employee_download_allowed",
  "blocks_employee_activation",
  "creates_payroll_warning",
  "creates_final_settlement_warning",
  "sensitivity_level"
]);

hasAll("database/seed.sql", [
  "INSURANCE",
  "DRIVING_LICENSE",
  "EDUCATION_CERTIFICATE",
  "document_compliance_settings_default",
  "documents.compliance.view",
  "documents.compliance.refresh",
  "documents.compliance.manage",
  "documents.compliance_settings.update",
  "documents.types.compliance.update",
  "documents.waivers.create",
  "documents.alerts.resolve",
  "documents.renewal_cases.complete",
  "documents.registry.sensitive.view",
  "employees.documents.compliance.view",
  "self_service.documents.compliance.view",
  "reports.documents.export"
]);

hasAll("worker/src/db/permissions.ts", [
  "documents.compliance.view",
  "documents.compliance_settings.manage",
  "documents.types.compliance.manage",
  "documents.waivers.manage",
  "documents.alerts.manage",
  "documents.renewal_cases.manage",
  "employees.documents.compliance.manage",
  "self_service.documents.compliance.view"
]);

hasAll("worker/src/routes/document-compliance.ts", [
  "calculateEmployeeDocumentCompliance",
  "getRequiredDocumentsForEmployee",
  "getEmployeeActiveDocumentByType",
  "getEmployeeExpiringDocuments",
  "getEmployeeExpiredDocuments",
  "getEmployeeMissingRequiredDocuments",
  "refreshEmployeeDocumentComplianceSnapshot",
  "refreshAllDocumentComplianceSnapshots",
  "refreshDocumentExpiryAlerts",
  "createDocumentExpiryAlertIfMissing",
  "resolveDocumentAlertForRenewedDocument",
  "getDocumentComplianceAlerts",
  "completeDocumentRenewalCase",
  "linkRenewalCaseToDocumentVersion",
  "replaceEmployeeDocumentForRenewal",
  "validateDocumentAgainstTypeRules",
  "refreshComplianceAfterDocumentChange",
  "getContractDocumentCompliance",
  "linkContractDocumentComplianceWarning",
  "getEmployeeContractDocumentStatus",
  "getOnboardingDocumentChecklist",
  "getEmployeeActivationDocumentWarnings",
  "getEmployeeStatusDocumentWarnings",
  "getDocumentPayrollWarnings",
  "getDocumentFinalSettlementWarnings",
  "getDocumentClearanceWarningsForSettlement",
  "/compliance/settings",
  "/compliance/dashboard",
  "/alerts",
  "/renewal-cases",
  "/waivers",
  "/documents/compliance"
]);

hasAll("worker/src/index.ts", [
  "documentComplianceRoutes",
  "employeeDocumentComplianceRoutes",
  "selfServiceDocumentComplianceRoutes"
]);

hasAll("worker/src/routes/documents.ts", [
  "refreshComplianceAfterDocumentChange",
  "resolveDocumentAlertForRenewedDocument",
  "refreshDocumentComplianceQuietly"
]);

hasAll("worker/src/routes/reports.ts", [
  "documents/compliance-summary",
  "documents/missing-required",
  "documents/expiring",
  "documents/expired",
  "documents/renewal-cases",
  "documents/waivers",
  "documents/by-department",
  "documents/by-worksite",
  "documents/foreign-compliance",
  "documents/contract-compliance",
  "documents/medical-insurance-expiry",
  "getDocumentComplianceReport"
]);

hasAll("frontend/src/lib/api.ts", [
  "getDocumentComplianceDashboard",
  "getDocumentComplianceSettings",
  "updateDocumentComplianceSettings",
  "listDocumentTypeCompliance",
  "updateDocumentTypeCompliance",
  "listDocumentAlerts",
  "documentAlertAction",
  "listDocumentRenewalCases",
  "documentRenewalCaseAction",
  "listDocumentRequirementWaivers",
  "createEmployeeDocumentWaiver",
  "getEmployeeDocumentCompliance",
  "getSelfServiceDocumentCompliance"
]);

hasAll("frontend/src/routes/AppRoutes.tsx", [
  "DocumentCompliancePage",
  "documents/compliance",
  "documents/compliance/missing",
  "documents/compliance/expiring",
  "documents/compliance/expired",
  "documents/compliance/alerts",
  "documents/compliance/renewal-cases",
  "settings/documents/compliance"
]);

hasAll("frontend/src/pages/DocumentCompliancePage.tsx", [
  "Document Expiry & Compliance",
  "Renewal Cases",
  "Type compliance settings",
  "ReasonModal",
  "TypeComplianceModal",
  "Refresh compliance"
]);

hasAll("frontend/src/components/employee/EmployeeDocumentCompliancePanel.tsx", [
  "EmployeeDocumentCompliancePanel",
  "Document compliance",
  "required_documents",
  "refreshEmployeeDocumentCompliance"
]);

hasAll("frontend/src/components/employee/EmployeeDocumentsPanel.tsx", [
  "EmployeeDocumentCompliancePanel"
]);

hasAll("frontend/src/pages/SelfServicePage.tsx", [
  "getSelfServiceDocumentCompliance",
  "Required document checklist",
  "Renewal cases"
]);

for (const file of [
  "frontend/src/pages/DocumentCompliancePage.tsx",
  "frontend/src/components/employee/EmployeeDocumentCompliancePanel.tsx",
  "frontend/src/components/employee/EmployeeDocumentsPanel.tsx",
  "frontend/src/pages/DocumentRegistryPage.tsx",
  "frontend/src/pages/SelfServicePage.tsx"
]) {
  const text = read(file);
  ok(!/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(text), `${file} must not use browser alert/confirm/prompt`);
}

const routeText = read("worker/src/routes/document-compliance.ts");
ok(!/OCR|e-signature|governmentApi|authorityApi/i.test(routeText), "Prompt 15 must not implement OCR, e-signature, or government authority integrations");

const workerWrangler = read("worker/wrangler.toml");
ok(workerWrangler.includes('binding = "DB"'), "D1 DB binding missing");
ok(workerWrangler.includes('database_name = "hrm-v2"'), "D1 database name changed");
ok(workerWrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'), "D1 database id changed");
ok(workerWrangler.includes('binding = "DOCUMENTS_BUCKET"'), "R2 document bucket binding missing");
ok(workerWrangler.includes('bucket_name = "hrm-v2-documents"'), "R2 bucket changed");

const authText = read("worker/src/auth/password.ts");
ok(authText.includes("100000"), "PBKDF2 iteration ceiling must remain 100000");

console.log("Prompt 15 verification passed.");
