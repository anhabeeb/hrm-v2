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

function check(message, condition) {
  if (!condition) failures.push(message);
}

function includes(file, marker, message) {
  const content = read(file);
  const ok = marker instanceof RegExp ? marker.test(content) : content.includes(marker);
  check(`${file}: ${message}`, ok);
}

function excludes(file, marker, message) {
  const content = read(file);
  const ok = marker instanceof RegExp ? !marker.test(content) : !content.includes(marker);
  check(`${file}: ${message}`, ok);
}

function blockAfter(file, marker, length = 2400) {
  const content = read(file);
  const start = content.indexOf(marker);
  if (start < 0) {
    failures.push(`${file}: missing block marker ${marker}`);
    return "";
  }
  return content.slice(start, start + length);
}

const lifecyclePage = "frontend/src/pages/LifecyclePage.tsx";
const payrollFoundationPanel = "frontend/src/components/payroll/EmployeePayrollFoundationPanels.tsx";
const employeePayrollPanel = "frontend/src/components/payroll/EmployeePayrollPanel.tsx";
const lifecycleRoute = "worker/src/routes/lifecycle.ts";
const documentComplianceRoute = "worker/src/routes/document-compliance.ts";
const payrollFoundationsRoute = "worker/src/routes/payroll-foundations.ts";
const payrollRoute = "worker/src/routes/payroll.ts";
const documentSettingsPage = "frontend/src/pages/DocumentSettingsPage.tsx";
const schema = "database/schema.sql";
const seed = "database/seed.sql";
const wrangler = "worker/wrangler.toml";
const password = "worker/src/auth/password.ts";

const lifecyclePageText = read(lifecyclePage);
const lifecycleRouteText = read(lifecycleRoute);
const documentComplianceText = read(documentComplianceRoute);
const payrollFoundationsText = read(payrollFoundationsRoute);
const seedText = read(seed);

includes(lifecyclePage, "Add multiple document rows and upload the batch in one action.", "onboarding document upload supports batch submission");
includes(lifecyclePage, "Upload one file at a time per row.", "onboarding document upload keeps each row single-file");
includes(lifecyclePage, "This document type allows multiple active files; add one row for each file.", "multiple-active document type helper is visible");
includes(lifecyclePage, "This document type allows only one active file. Uploading another later requires replacing the existing document.", "single-active document type helper is visible");
includes(lifecyclePage, "handleFileChange", "file selection uses a validation handler");
includes(lifecyclePage, "files.length > 1", "file handler blocks multiple selections defensively");
includes(lifecyclePage, "validateRows", "upload button runs field-level batch validation before submit");
includes(lifecyclePage, "form.set(\"metadata\"", "batch upload sends document metadata array");
includes(lifecyclePage, "form.set(`file_${index}`", "batch upload sends indexed files");
includes(lifecyclePage, "uploadOnboardingWorkspaceDocumentBatch", "onboarding workspace uses batch document upload API");

const documentUploadBlock = blockAfter(lifecyclePage, "function DocumentsWorkspaceForm", 15000);
check(`${lifecyclePage}: document upload input must remain single-file`, !/<Input[^>]+type="file"[^>]+multiple/.test(documentUploadBlock));
check(`${lifecyclePage}: onboarding document form must use multi-row batch upload`, /Add document/.test(documentUploadBlock) && /Upload documents/.test(documentUploadBlock));

includes(lifecyclePage, "Employee type:", "document checklist shows employee type badge");
includes(lifecyclePage, "Required documents are based on the employee type, employment type, department, position, and location configured in Document Required Rules.", "document checklist explains required rule matching");
includes(lifecyclePage, "No employee-type-specific document rule matched. Any-scope document rules still apply.", "no employee-type-specific rule message exists");
includes(lifecyclePage, "No required document rules are configured for this employee.", "no required-rules message exists");
includes(lifecyclePage, "matchedScopeLabel", "checklist renders matched employment/department/position/location scope");
includes(lifecyclePage, "matched_employee_type_label", "checklist renders matched employee type rule");
includes(lifecyclePage, "typeSpecificRows", "checklist detects employee-type-specific rules");

includes(documentSettingsPage, "Required Rules", "admin document required rules UI exists");
includes(documentSettingsPage, "Employee type", "required rules UI exposes employee type scope");
includes(documentSettingsPage, "options={[\"\", \"LOCAL\", \"FOREIGN\", \"OTHER\"]}", "required rules UI supports Any/Local/Foreign/Other");
includes(documentSettingsPage, "api.createDocumentRequiredRule", "required rules can be created in the app");
includes(documentSettingsPage, "api.updateDocumentRequiredRule", "required rules can be edited in the app");
includes(documentSettingsPage, "api.documentRequiredRuleAction", "required rules can be enabled or disabled in the app");

includes(documentComplianceRoute, "FROM document_required_rules rr", "document compliance reads configured required rules");
includes(documentComplianceRoute, "JOIN document_types dt", "document compliance depends on configured document types");
includes(documentComplianceRoute, "rr.employee_type IS NULL OR rr.employee_type = ?", "document compliance applies Any plus matching employee type");
includes(documentComplianceRoute, "rr.employment_type IS NULL OR rr.employment_type = ?", "document compliance applies employment scope");
includes(documentComplianceRoute, "rr.department_id IS NULL OR rr.department_id = ?", "document compliance applies department scope");
includes(documentComplianceRoute, "rr.position_id IS NULL OR rr.position_id = ?", "document compliance applies position scope");
includes(documentComplianceRoute, "rr.location_id IS NULL OR rr.location_id = ?", "document compliance applies location scope");
includes(documentComplianceRoute, "matched_employee_type_rule", "document compliance returns matched employee type rule metadata");
includes(documentComplianceRoute, "matched_department_name", "document compliance returns matched scope labels");

const complianceFunction = blockAfter(documentComplianceRoute, "export async function getRequiredDocumentsForEmployee", 5200);
check(`${documentComplianceRoute}: required document logic must not hardcode Visa/Work Permit/Passport/ID Card lists`, !/(VISA|WORK_PERMIT|PASSPORT|ID_CARD)/.test(complianceFunction));

includes(lifecycleRoute, "calculateEmployeeDocumentCompliance", "onboarding document checklist uses compliance helper");
includes(lifecycleRoute, '"/cases/:caseId/documents/batch"', "onboarding batch document upload route exists");
includes(lifecycleRoute, "parseDocumentBatchMetadata", "onboarding batch document route parses metadata");
includes(lifecycleRoute, "DOCUMENT_BATCH_VALIDATION_FAILED", "onboarding batch document route returns row-level validation errors");
includes(lifecycleRoute, "DUPLICATE_DOCUMENT_TYPE_IN_BATCH", "onboarding batch document route blocks duplicate single-active document rows");
includes(lifecycleRoute, "cleanupEmployeeDocumentUploads", "onboarding batch document route cleans up partial saved documents");
includes(lifecycleRoute, "getOnboardingDocumentBlockers", "activation document blockers use onboarding checklist");
includes(lifecycleRoute, "documentsEnabled", "documents module enabled state is checked");
includes(lifecycleRoute, "complianceModuleEnabled", "document compliance module enabled state is checked");
includes(lifecycleRoute, "status: \"DISABLED\"", "disabled Documents/Document Compliance returns disabled status");
includes(lifecycleRoute, "return []", "disabled/warning checklist does not block activation");
includes(lifecycleRoute, "matched_scope", "onboarding checklist returns matched scope metadata");

includes(seed, "doc_type_emergency_contact_form", "Emergency Contact Form document type is seeded");
includes(seed, "doc_required_rule_any_employment_contract", "Any-scope employment contract rule is seeded");
includes(seed, "doc_required_rule_any_profile_photo", "Any-scope profile photo rule is seeded");
includes(seed, "doc_required_rule_any_emergency_contact_form", "Any-scope emergency contact rule is seeded");
includes(seed, "doc_required_rule_local_id_card", "Local ID card rule is seeded");
includes(seed, "doc_required_rule_foreign_passport", "Foreign passport rule is seeded");
includes(seed, "doc_required_rule_foreign_visa", "Foreign visa rule is seeded");
includes(seed, "doc_required_rule_foreign_work_permit", "Foreign work permit rule is seeded");
check(`${seed}: Visa default required rule must be FOREIGN`, /doc_required_rule_foreign_visa'[^;]+doc_type_visa'[^;]+'FOREIGN'/.test(seedText));
check(`${seed}: Work Permit default required rule must be FOREIGN`, /doc_required_rule_foreign_work_permit'[^;]+doc_type_work_permit'[^;]+'FOREIGN'/.test(seedText));
check(`${seed}: Any-scope rules must use NULL employee_type`, /doc_required_rule_any_employment_contract'[^;]+doc_type_employment_contract'[^;]+NULL/.test(seedText));
for (const code of ["BML", "MIB", "SBI", "BOC", "MCB", "HBL", "CBM"]) {
  check(`${seed}: active bank seed includes ${code}`, seedText.includes(`'payment_inst_${code.toLowerCase()}'`) && seedText.includes(`'${code}'`) && seedText.includes("'BANK'"));
}

includes(schema, "CREATE TABLE IF NOT EXISTS document_required_rules", "document required rules table exists");
includes(schema, "employee_type TEXT CHECK (employee_type IN ('LOCAL', 'FOREIGN', 'OTHER') OR employee_type IS NULL)", "required rules support Any/Local/Foreign/Other");
includes(schema, "allow_multiple_files INTEGER", "document types support multiple-active-file configuration");
includes(schema, "allowed_mime_types TEXT", "document types support upload file rules");

includes(lifecyclePage, "Cash payment does not require bank details.", "onboarding cash helper is visible");
includes(lifecyclePage, "Bank transfer requires bank, account name, and account number.", "onboarding bank-transfer helper is visible");
includes(lifecyclePage, "activeBankInstitutions", "onboarding bank selector uses active bank filtering");
includes(lifecyclePage, "type) === \"BANK\"", "onboarding frontend bank selector filters type BANK");
includes(lifecyclePage, "status) === \"ACTIVE\"", "onboarding frontend bank selector filters ACTIVE status");
includes(lifecyclePage, "Select active bank", "onboarding bank selector is labeled as active bank");
includes(lifecyclePage, "payment_institution_id: normalized === \"BANK_TRANSFER\" ? payment.payment_institution_id : \"\"", "switching from bank transfer clears institution");
includes(lifecyclePage, "bank_account_name: normalized === \"BANK_TRANSFER\" ? payment.bank_account_name : \"\"", "switching from bank transfer clears account name");
includes(lifecyclePage, "bank_account_number: normalized === \"BANK_TRANSFER\" ? payment.bank_account_number : \"\"", "switching from bank transfer clears account number");
includes(lifecyclePage, "paymentErrors", "onboarding payment method has field-level validation");

includes(lifecycleRoute, "getActiveBankPaymentInstitution", "onboarding backend validates active bank institution");
includes(lifecycleRoute, "type = 'BANK'", "onboarding backend only accepts bank institutions for Bank Transfer");
includes(lifecycleRoute, "is_active = 1 AND status = 'ACTIVE'", "onboarding backend only accepts active institutions");
includes(lifecycleRoute, "bankTransfer ? optionalText(body.payment_institution_id) : null", "Cash does not preserve stale institution payload");
includes(lifecycleRoute, "bankTransfer ? optionalText(body.bank_account_name) : null", "Cash does not preserve stale account name payload");
includes(lifecycleRoute, "bankTransfer ? optionalText(body.bank_account_number) : null", "Cash does not preserve stale account number payload");
includes(lifecycleRoute, "Bank transfer requires bank, account name, and account number.", "onboarding backend requires complete Bank Transfer fields");
includes(lifecycleRoute, "active_bank_id", "onboarding payment readiness verifies active bank");
includes(lifecycleRoute, "methodType === \"CASH\"", "onboarding payment readiness accepts Cash without bank details");
includes(lifecycleRoute, "methodType === \"BANK_TRANSFER\"", "onboarding payment readiness validates Bank Transfer details");

includes(payrollFoundationPanel, "Cash payment does not require bank details.", "Employee 360 payment modal explains Cash");
includes(payrollFoundationPanel, "Bank transfer requires bank, account name, and account number.", "Employee 360 payment modal explains Bank Transfer");
includes(payrollFoundationPanel, "activeBanks", "Employee 360 payment modal uses active bank list");
includes(payrollFoundationPanel, "institution.type === \"BANK\"", "Employee 360 payment modal filters BANK institutions");
includes(payrollFoundationPanel, "institution.status === \"ACTIVE\"", "Employee 360 payment modal filters active institutions");
includes(payrollFoundationPanel, "institutionLabel", "Employee 360 payment modal labels banks with code and name");
includes(payrollFoundationPanel, "normalized === \"BANK_TRANSFER\" ? form.payment_institution_id : \"\"", "Employee 360 payment modal clears stale bank institution");
includes(payrollFoundationPanel, "normalized === \"BANK_TRANSFER\" ? form.bank_account_name : \"\"", "Employee 360 payment modal clears stale account name");
includes(payrollFoundationPanel, "normalized === \"BANK_TRANSFER\" ? form.bank_account_number : \"\"", "Employee 360 payment modal clears stale account number");
includes(payrollFoundationPanel, "validatePaymentForm", "Employee 360 payment modal has field-level validation");

includes(employeePayrollPanel, "Cash payment does not require bank details.", "payroll profile explains Cash does not require bank details");
includes(employeePayrollPanel, "profileBankTransfer", "payroll profile only shows bank fields for Bank Transfer");
includes(employeePayrollPanel, "value === \"BANK_TRANSFER\" ? form.bank_name : null", "payroll profile clears stale bank name for non-bank methods");
includes(employeePayrollPanel, "value === \"BANK_TRANSFER\" ? form.bank_account_no : null", "payroll profile clears stale bank account number for non-bank methods");
includes(employeePayrollPanel, "value === \"BANK_TRANSFER\" ? form.bank_account_name : null", "payroll profile clears stale account name for non-bank methods");

includes(payrollFoundationsRoute, "readActiveBankInstitution", "employee payment method backend validates active bank institutions");
includes(payrollFoundationsRoute, "type = 'BANK'", "employee payment method backend rejects non-bank institutions for Bank Transfer");
includes(payrollFoundationsRoute, "is_active = 1 AND status = 'ACTIVE'", "employee payment method backend rejects inactive/archived institutions");
includes(payrollFoundationsRoute, "methodType === \"BANK_TRANSFER\"", "employee payment method backend branches Bank Transfer validation");
includes(payrollFoundationsRoute, "methodType === \"CASH\" ? text(body.cash_collection_location_id)", "Cash-only collection fields are isolated");
includes(payrollFoundationsRoute, "Bank transfer requires an active bank institution.", "employee payment method backend emits clear bank validation error");
includes(payrollFoundationsRoute, "Bank transfer requires bank/payment institution, account name, and account number.", "employee payment method backend requires Bank Transfer account fields");

includes(payrollRoute, "profileStoresBankDetails", "payroll profile backend clears bank fields unless Bank Transfer");
includes(payrollRoute, "paymentMethod === \"BANK_TRANSFER\"", "payroll profile backend detects Bank Transfer");

for (const file of [
  lifecyclePage,
  payrollFoundationPanel,
  employeePayrollPanel,
  lifecycleRoute,
  payrollFoundationsRoute,
  payrollRoute,
  documentComplianceRoute,
  documentSettingsPage
]) {
  excludes(file, /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/, "browser alert/confirm/prompt must not be introduced");
  excludes(file, /dark:/, "dark mode classes must not be introduced");
}

includes(password, "ITERATIONS = 100000", "PBKDF2 iterations remain 100000");
includes(wrangler, 'binding = "DB"', "D1 binding remains DB");
includes(wrangler, 'database_name = "hrm-v2"', "D1 database name remains hrm-v2");
includes(wrangler, 'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"', "D1 database id remains unchanged");
includes(wrangler, 'binding = "DOCUMENTS_BUCKET"', "R2 binding remains DOCUMENTS_BUCKET");
includes(wrangler, 'bucket_name = "hrm-v2-documents"', "R2 bucket remains hrm-v2-documents");

const packageJson = JSON.parse(read("package.json"));
for (const script of [
  "verify:header-search-layout",
  "verify:sidebar-command-center-welcome",
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
  "verify:onboarding-document-payroll-validation"
]) {
  check(`package.json: missing ${script} script`, Boolean(packageJson.scripts?.[script]));
}

if (failures.length) {
  console.error("Onboarding document/payroll validation verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Onboarding document/payroll validation verification passed.");
