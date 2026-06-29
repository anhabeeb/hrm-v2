import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function filePath(relativePath) {
  return path.join(root, relativePath);
}

function read(relativePath) {
  const absolutePath = filePath(relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`${relativePath}: missing required file`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function readOptional(relativePath) {
  const absolutePath = filePath(relativePath);
  return fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, "utf8") : "";
}

function check(name, condition) {
  if (!condition) failures.push(name);
}

function has(relativePath, marker, message) {
  const content = read(relativePath);
  const ok = marker instanceof RegExp ? marker.test(content) : content.includes(marker);
  check(`${relativePath}: ${message}`, ok);
}

function hasAll(relativePath, markers, message) {
  const content = read(relativePath);
  const missing = markers.filter((marker) => !(marker instanceof RegExp ? marker.test(content) : content.includes(marker)));
  check(`${relativePath}: ${message}${missing.length ? `; missing ${missing.join(", ")}` : ""}`, missing.length === 0);
}

function walk(relativeDir, predicate, files = []) {
  const absoluteDir = filePath(relativeDir);
  if (!fs.existsSync(absoluteDir)) return files;
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name).replace(/\\/g, "/");
    if (entry.isDirectory()) walk(relativePath, predicate, files);
    else if (predicate(relativePath)) files.push(relativePath);
  }
  return files;
}

function blockContains(file, startMarker, requiredMarkers) {
  const content = read(file);
  const start = content.indexOf(startMarker);
  if (start < 0) return false;
  const block = content.slice(start, Math.min(content.length, start + 2200));
  return requiredMarkers.every((marker) => block.includes(marker));
}

const pkg = JSON.parse(read("package.json") || "{}");
for (const script of [
  "verify:form-action-validation-hardening",
  "verify:global-validation",
  "verify:employee-user-account-linking",
  "verify:import-export-standardization",
  "verify:frontend-static-assets",
  "verify:frontend-bundle-integrity",
  "verify:filter-search-date-standardization",
  "verify:command-center-dashboard"
]) {
  check(`package.json: missing ${script} script`, Boolean(pkg.scripts?.[script]));
}

for (const file of [
  "frontend/src/lib/form-validation.ts",
  "frontend/src/lib/validation.ts",
  "frontend/src/lib/api.ts",
  "frontend/src/types/auth.ts",
  "frontend/src/components/forms/FieldError.tsx",
  "frontend/src/components/forms/FormErrorSummary.tsx",
  "frontend/src/components/forms/ValidationSummary.tsx",
  "worker/src/lib/validation.ts",
  "worker/src/lib/moduleValidation.ts",
  "worker/src/utils/validation.ts",
  "worker/src/utils/action-validation.ts"
]) {
  read(file);
}

hasAll("frontend/src/lib/validation.ts", [
  "normalizeValidationIssues",
  "validateRequiredField",
  "validateRequiredFields",
  "validateMaxLength",
  "validateEmail",
  "validatePhone",
  "validateDateField",
  "validateDateRange",
  "validateAmount",
  "validateEnumValue",
  "focusFirstInvalidField",
  "useFormValidation"
], "shared frontend validation helpers must be present");

hasAll("frontend/src/lib/api.ts", [
  "class ApiError",
  "validationErrors",
  "fieldErrors",
  "actionErrors",
  "apiErrorFromEnvelope",
  "validation_errors",
  "field_errors",
  "action_errors"
], "API client must preserve structured validation errors");

hasAll("worker/src/lib/validation.ts", [
  "validationIssue",
  "validationResponse",
  "validation_errors",
  "field_errors",
  "action_errors",
  "details",
  "validateRequiredField",
  "validateRequiredFields",
  "validateStringLength",
  "validateEmailField",
  "validatePhoneField",
  "validateDateField",
  "validateDateRange",
  "validateEnumValue"
], "backend structured validation helpers must be present");

hasAll("worker/src/lib/moduleValidation.ts", [
  "validateAccessScope",
  "validateOrganizationCascade",
  "validatePayrollRules",
  "validateLeaveRules",
  "validateAttendanceRosterRules",
  "validateApprovalWorkflowRules",
  "validateDocumentRules",
  "validateContractRules",
  "validateAssetUniformRules",
  "validateImportRows",
  "validationResponse"
], "module validation exports must remain available");

hasAll("worker/src/utils/action-validation.ts", [
  "validateActionReason",
  "validateAmountField",
  "validateIdReference",
  "validateModuleEnabledForAction",
  "validateEmployeeActionScope",
  "validationResult",
  "canAccessEmployee"
], "action validation helpers must cover reasons, module state, ids, amounts, and scope");

hasAll("worker/src/utils/validation.ts", [
  "isEmail",
  "isPhone",
  "isIsoDate",
  "readNumber",
  "readStringList"
], "primitive request parsing and validation helpers must be available");

hasAll("frontend/src/pages/EmployeesPage.tsx", [
  "validateEmployeeInputForm",
  "FormErrorSummary",
  "FieldError",
  "useFormValidation",
  "normalizeValidationIssues",
  "focusFirstInvalidField",
  "disabled={saving}",
  "data-validation-field"
], "employee form must expose field-level validation and guarded save state");

hasAll("frontend/src/components/forms/validated-fields.tsx", [
  "ValidatedTextField",
  "ValidatedSelectField",
  "ValidatedReasonField",
  "ValidatedFileField",
  "ValidatedTextareaField",
  "data-validation-field",
  "aria-invalid",
  "FieldError"
], "shared validated field primitives must expose field-level errors and accessibility markers");

const fieldValidationTargets = [
  ["frontend/src/components/leave/LeaveRequestModal.tsx", ["validateLeaveRequestForm", "FormErrorSummary", "ValidatedSelectField", "ValidatedTextField", "ValidatedReasonField", "useFormValidation", "normalizeValidationIssues", "focusFirstInvalidField"], "leave request modal must validate employee, leave type, dates, and reason fields"],
  ["frontend/src/components/attendance/AttendanceCorrectionModal.tsx", ["validateAttendanceCorrectionForm", "FormErrorSummary", "FieldError", "ValidatedTextField", "ValidatedSelectField", "ValidatedReasonField", "useFormValidation", "normalizeValidationIssues"], "attendance correction modal must validate employee, date/status, clock, and reason fields"],
  ["frontend/src/components/roster/RosterAssignmentModal.tsx", ["validateRosterAssignmentForm", "FormErrorSummary", "ValidatedSelectField", "ValidatedTextField", "ValidatedReasonField", "useFormValidation", "normalizeValidationIssues"], "roster assignment modal must validate status, shift template, custom times, and reason fields"],
  ["frontend/src/components/employee/EmployeeDocumentsPanel.tsx", ["validateDocumentUploadForm", "validateDocumentActionReason", "FormErrorSummary", "ValidatedFileField", "ValidatedSelectField", "ValidatedTextField", "ValidatedReasonField", "requires_document_number", "useFormValidation", "normalizeValidationIssues"], "employee documents panel must validate upload metadata, files, and action reasons"],
  ["frontend/src/components/assets/EmployeeAssetsPanel.tsx", ["FormErrorSummary", "ValidatedSelectField", "ValidatedTextField", "ValidatedReasonField", "useFormValidation", "normalizeValidationIssues", "validateRequiredField", "validateAmount"], "employee assets panel must validate issue/return/replacement/deduction fields"],
  ["frontend/src/components/payroll/EmployeePayrollPanel.tsx", ["validateIncrementForm", "validateAdvanceForm", "FormErrorSummary", "ValidatedTextField", "ValidatedReasonField", "useFormValidation", "normalizeValidationIssues"], "employee payroll panel must validate increment, advance, and salary reason flows"],
  ["frontend/src/components/payroll/EmployeePayrollFoundationPanels.tsx", ["validatePaymentForm", "validateLoanForm", "validatePensionForm", "validateCustomDeductionForm", "FormErrorSummary", "FieldError", "useFormValidation", "normalizeValidationIssues"], "payroll foundation panels must validate payment, loan, pension, and custom deduction forms"],
  ["frontend/src/pages/DocumentSettingsPage.tsx", ["validateCategoryForm", "validateDocumentTypeForm", "validateRequiredRuleForm", "FormErrorSummary", "FieldError", "useFormValidation", "normalizeValidationIssues"], "document settings forms must validate categories, document types, and required rules"],
  ["frontend/src/pages/DocumentCompliancePage.tsx", ["FormErrorSummary", "ValidatedReasonField", "ValidatedTextField", "useFormValidation", "normalizeValidationIssues"], "document compliance actions must validate thresholds and reasons"],
  ["frontend/src/pages/FinalSettlementPage.tsx", ["CreateCaseDialog", "CaseActionDialog", "PaymentActionDialog", "FormErrorSummary", "ValidatedReasonField", "ValidatedTextField", "useFormValidation", "normalizeValidationIssues"], "final settlement dialogs must validate case, action, and payment fields"],
  ["frontend/src/pages/LeaveSettingsPage.tsx", ["FormErrorSummary", "useFormValidation", "normalizeValidationIssues", "focusFirstInvalidField"], "leave settings modals must surface structured validation errors"],
  ["frontend/src/pages/LifecyclePage.tsx", ["CreateCaseModal", "ReasonModal", "FormErrorSummary", "FieldError", "ValidatedReasonField", "ValidatedTextField", "useFormValidation", "normalizeValidationIssues"], "lifecycle case and reason modals must validate required fields"],
  ["frontend/src/pages/PayrollAdminPages.tsx", ["ActionModal", "FormErrorSummary", "ValidatedReasonField", "useFormValidation", "normalizeValidationIssues"], "payroll admin modals must surface structured validation and action reasons"],
  ["frontend/src/pages/AssetUniformAdvancedPages.tsx", ["UniformTypeModal", "UniformStockModal", "IssueUniformModal", "UniformActionModal", "FormErrorSummary", "FieldError", "useFormValidation", "normalizeValidationIssues", "validateAmount", "validateRequiredField"], "asset/uniform advanced forms must validate type, stock, issue, and lifecycle actions"]
];

let coveredFieldValidationTargets = 0;
for (const [file, markers, message] of fieldValidationTargets) {
  hasAll(file, markers, message);
  const content = readOptional(file);
  if (/useFormValidation|Validated[A-Za-z]+Field|FormErrorSummary/.test(content)) coveredFieldValidationTargets += 1;
  check(`${file}: backend validation issues must be normalized`, content.includes("normalizeValidationIssues"));
  check(`${file}: invalid fields must be focusable after validation failure`, content.includes("focusFirstInvalidField") || file.includes("LeaveSettingsPage.tsx") || file.includes("PayrollAdminPages.tsx"));
}
check("app-wide validation coverage must include all targeted form-heavy screens", coveredFieldValidationTargets === fieldValidationTargets.length);

check(
  "worker/src/routes/employees.ts: create route must use structured employee validation",
  blockContains("worker/src/routes/employees.ts", 'employeeRoutes.post("/", requirePermission("employees.create")', ["validateEmployeeInput(input)", "hasValidationErrors(inputIssues)", "validationResponse(c, inputIssues)"])
);
check(
  "worker/src/routes/employees.ts: update route must use structured employee validation",
  blockContains("worker/src/routes/employees.ts", 'employeeRoutes.patch("/:id", requirePermission("employees.update")', ["validateEmployeeInput(input)", "hasValidationErrors(inputIssues)", "validationResponse(c, inputIssues)"])
);
hasAll("worker/src/routes/employees.ts", [
  "validateEmployeeRefs",
  "activeEntityExists",
  "\"departments\"",
  "\"locations\"",
  "\"positions\"",
  "\"job_levels\"",
  "createsReportingCycle",
  "canAccessEmployee"
], "employee reference, cascade, reporting manager, and scope validation must remain present");

const routeChecks = [
  ["worker/src/routes/lifecycle.ts", ["getEmployeeOnboardingReadiness", "readiness", "blockers", "canAccessEmployee"], "onboarding/offboarding readiness and scope validation must remain present"],
  ["worker/src/routes/attendance.ts", ["validateAttendanceRosterRules", "validationResponse", "validateLockedState", "locked_for_payroll"], "attendance action validation must remain present"],
  ["worker/src/routes/roster.ts", ["validateAttendanceRosterRules", "validateOrganizationCascade", "CROSS_WORKSITE_PERMISSION_REQUIRED"], "roster validation and cross-worksite guard must remain present"],
  ["worker/src/routes/leave.ts", ["validateApprovalWorkflowRules", "getLeaveApprovalChainPreview", "canAccessEmployee", "approval_chain_preview"], "leave validation and approval preview must remain present"],
  ["worker/src/routes/payroll.ts", ["validatePayrollRules", "validationResponse", "payroll_employee_results", "payroll_result_line_items"], "payroll validation and result source-of-truth must remain present"],
  ["worker/src/routes/documents.ts", ["validateDocumentRules", "validationResponse", "allowed_file_types_json", "max_file_size_mb"], "document upload metadata validation must remain present"],
  ["worker/src/routes/contracts.ts", ["validateContractRules", "CONTRACT_TYPE_REQUIRED", "CONTRACT_END_DATE_REQUIRED", "validationResponse"], "contract type and date validation must remain present"],
  ["worker/src/routes/asset-uniforms-advanced.ts", ["validateAssetUniformRules", "validationResponse", "reason"], "asset and uniform action validation must remain present"],
  ["worker/src/routes/approvals.ts", ["validateApprovalWorkflowRules", "validationResponse", "allow_self_approval"], "approval workflow validation must remain present"],
  ["worker/src/routes/data-transfer.ts", ["validateImportRows", "processedRows", "validation"], "import row validation must remain present"],
  ["worker/src/routes/self-service.ts", ["requireSelfServiceEmployeeContext", "hasValidationErrors", "validationResponse"], "self-service validation and active employee context must remain present"]
];
for (const [file, markers, message] of routeChecks) hasAll(file, markers, message);

hasAll("frontend/src/pages/LifecyclePage.tsx", [
  "WorkspaceNoticePopup",
  "completedOnboardingTaskStatuses",
  "can_activate",
  "activation"
], "onboarding workspace must keep popup notices and readiness-driven activation state");
hasAll("frontend/src/pages/ContractsPage.tsx", ["contract_type", "requires_end_date", "requires_probation"], "contract forms must keep dynamic contract type validation markers");
hasAll("frontend/src/pages/SelfServicePage.tsx", ["Self-service is unavailable", "profile update", "createSelfServiceProfileUpdateRequest"], "self-service UI must remain tied to guarded employee actions");

const frontendFiles = walk("frontend/src", (file) => /\.(ts|tsx)$/.test(file));
for (const file of frontendFiles) {
  const content = readOptional(file);
  check(`${file}: must not use browser alert/confirm/prompt`, !/\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/.test(content));
  check(`${file}: must not expose raw D1 error strings`, !/D1_ERROR|SQLITE_ERROR/.test(content));
}

const changedValidationFiles = [
  "frontend/src/pages/EmployeesPage.tsx",
  "frontend/src/lib/validation.ts",
  "frontend/src/lib/api.ts",
  "frontend/src/components/forms/FormErrorSummary.tsx",
  "worker/src/lib/validation.ts",
  "worker/src/routes/employees.ts",
  "worker/src/utils/action-validation.ts"
];
for (const file of changedValidationFiles) {
  const content = readOptional(file);
  check(`${file}: must not introduce dark mode classes`, !/\bdark:/.test(content));
}

const wrangler = read("worker/wrangler.toml");
check("worker/wrangler.toml: D1 binding must remain DB", wrangler.includes('binding = "DB"'));
check("worker/wrangler.toml: D1 database name must remain hrm-v2", wrangler.includes('database_name = "hrm-v2"'));
check("worker/wrangler.toml: D1 database id must remain protected value", wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'));
check("worker/wrangler.toml: R2 bucket must remain hrm-v2-documents", wrangler.includes('bucket_name = "hrm-v2-documents"'));

const password = read("worker/src/auth/password.ts");
check("worker/src/auth/password.ts: PBKDF2 iterations must remain 100000", /100000/.test(password));

for (const verifier of [
  "scripts/verify-employee-user-account-linking.mjs",
  "scripts/verify-import-export-standardization.mjs",
  "scripts/verify-button-color-standardization.mjs",
  "scripts/verify-frontend-static-assets.mjs",
  "scripts/verify-frontend-bundle-integrity.mjs",
  "scripts/verify-filter-search-date-standardization.mjs",
  "scripts/verify-command-center-dashboard.mjs"
]) {
  check(`${verifier}: dependency verifier must exist`, fs.existsSync(filePath(verifier)));
}

if (failures.length) {
  console.error("Form/action validation hardening verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Form/action validation hardening verification passed.");
