import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];
const frontendCovered = [];
const frontendExceptions = [];
const backendCovered = [];
const backendExceptions = [];

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

function exists(relativePath) {
  if (!fs.existsSync(filePath(relativePath))) failures.push(`${relativePath}: missing required file`);
}

function has(relativePath, marker, message) {
  const content = read(relativePath);
  const ok = marker instanceof RegExp ? marker.test(content) : content.includes(marker);
  if (!ok) failures.push(`${relativePath}: ${message}`);
}

function hasNo(relativePath, marker, message) {
  const content = read(relativePath);
  const ok = marker instanceof RegExp ? !marker.test(content) : !content.includes(marker);
  if (!ok) failures.push(`${relativePath}: ${message}`);
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

function containsAny(relativePath, markers) {
  const content = readOptional(relativePath);
  return markers.some((marker) => content.includes(marker));
}

function requireFrontendCoverage(item) {
  const content = readOptional(item.file);
  if (!content && item.exception) {
    frontendExceptions.push(`${item.file}: ${item.exception}`);
    return;
  }
  if (!content) {
    failures.push(`${item.file}: required frontend file is missing and has no documented exception`);
    return;
  }
  if (containsAny(item.file, item.markers)) {
    frontendCovered.push(`${item.file}: ${item.markers.find((marker) => content.includes(marker))}`);
    return;
  }
  if (item.exception) {
    frontendExceptions.push(`${item.file}: ${item.exception}`);
    return;
  }
  failures.push(`${item.file}: missing cascade/shared selector coverage (${item.markers.join(" or ")})`);
}

function requireBackendCoverage(item) {
  const content = readOptional(item.file);
  if (!content && item.exception) {
    backendExceptions.push(`${item.file}: ${item.exception}`);
    return;
  }
  if (!content) {
    failures.push(`${item.file}: required backend route is missing and has no documented exception`);
    return;
  }
  const missing = item.markers.filter((marker) => !content.includes(marker));
  if (missing.length === 0) {
    backendCovered.push(`${item.file}: ${item.markers.join(", ")}`);
    return;
  }
  if (item.exception) {
    backendExceptions.push(`${item.file}: ${item.exception}; missing ${missing.join(", ")}`);
    return;
  }
  failures.push(`${item.file}: missing backend validation helper coverage: ${missing.join(", ")}`);
}

const pkg = JSON.parse(read("package.json") || "{}");
for (const script of ["verify:global-validation", "verify:ui-standardization", "verify:prompt13", "verify:prompt23"]) {
  if (!pkg.scripts?.[script]) failures.push(`package.json: missing ${script} script`);
}

[
  "frontend/src/lib/validation.ts",
  "frontend/src/components/forms/ValidationSummary.tsx",
  "frontend/src/components/forms/FieldError.tsx",
  "frontend/src/components/forms/FormBlockingAlert.tsx",
  "frontend/src/components/forms/FormWarningAlert.tsx",
  "frontend/src/components/forms/DependentFieldResetNotice.tsx",
  "frontend/src/components/forms/ValidatedDateRangeField.tsx",
  "frontend/src/components/forms/ValidatedAmountField.tsx",
  "frontend/src/components/forms/ValidatedEffectiveDateField.tsx",
  "frontend/src/components/organization/OrganizationCascadeSelector.tsx",
  "frontend/src/components/organization/EmployeeCascadeSelect.tsx",
  "frontend/src/components/organization/OrganizationSelectFields.tsx",
  "frontend/src/components/organization/organizationCascade.ts",
  "frontend/src/hooks/useOrganizationReferences.ts",
  "worker/src/lib/validation.ts",
  "worker/src/lib/organizationCascadeValidation.ts",
  "worker/src/lib/moduleValidation.ts"
].forEach(exists);

[
  "useFormValidation",
  "ValidationIssue",
  "validateDateRange",
  "validateAmount",
  "hasBlockingIssues"
].forEach((marker) => has("frontend/src/lib/validation.ts", marker, `frontend validation marker missing: ${marker}`));

[
  "ValidationSummary",
  "FieldError",
  "FormBlockingAlert",
  "FormWarningAlert",
  "DependentFieldResetNotice",
  "ValidatedDateRangeField",
  "ValidatedAmountField",
  "ValidatedEffectiveDateField"
].forEach((marker) => {
  const file = marker === "FieldError" ? "frontend/src/components/forms/FieldError.tsx" : `frontend/src/components/forms/${marker}.tsx`;
  has(file, marker, `${marker} component marker missing`);
});

[
  "OrganizationCascadeSelector",
  "includeJobLevel",
  "allowedDepartmentIds",
  "allowedLocationIds",
  "scopeDepartmentIds",
  "scopeLocationIds",
  "mode === \"role-mapping\"",
  "No positions available for selected department and job level",
  "Select department first",
  "Select allowed department scope first"
].forEach((marker) => has("frontend/src/components/organization/OrganizationCascadeSelector.tsx", marker, `organization cascade selector marker missing: ${marker}`));

[
  "getOrganizationCascadeOptions",
  "resetInvalidOrganizationCascade",
  "validateOrganizationCascade",
  "positionHasRequiredRelationships",
  "Some selections were removed because they are not valid"
].forEach((marker) => has("frontend/src/components/organization/organizationCascade.ts", marker, `organization cascade logic marker missing: ${marker}`));

[
  "DepartmentSelectField",
  "JobLevelSelectField",
  "PositionSelectField",
  "EmployeeSelectField"
].forEach((marker) => has("frontend/src/components/organization/OrganizationSelectFields.tsx", marker, `organization select field missing: ${marker}`));

[
  "validateOrganizationCascade",
  "validateAccessScope",
  "validateDateRange",
  "validateDuplicateConflict",
  "validateLockedState",
  "validatePayrollRules",
  "validateLeaveRules",
  "validateAttendanceRosterRules",
  "validateApprovalWorkflowRules",
  "validateDocumentRules",
  "validateContractRules",
  "validateAssetUniformRules",
  "validateImportRows",
  "validationResponse"
].forEach((marker) => has("worker/src/lib/moduleValidation.ts", marker, `backend validation export missing: ${marker}`));

[
  "input.end < input.start",
  "input.amount < 0",
  "input.quantity < 0",
  "validateLockedState",
  "getActorSelectableScope",
  "ACCESS_SCOPE_OUTSIDE_ACTOR_SCOPE",
  "ACCESS_SCOPE_TOO_BROAD",
  "validateDateRange({ start: input.issueDate, end: input.expiryDate"
].forEach((marker) => has("worker/src/lib/validation.ts", marker, `validation helper must contain real rule check: ${marker}`));

const frontendRequirements = [
  { file: "frontend/src/pages/UsersAccessPage.tsx", markers: ["OrganizationCascadeSelector"] },
  { file: "frontend/src/pages/UsersAccessPage.tsx", markers: ["allowedDepartmentIds={scopedDepartmentIds}"] },
  { file: "frontend/src/pages/UsersAccessPage.tsx", markers: ["allowedLocationIds={scopedLocationIds}"] },
  { file: "frontend/src/pages/UsersAccessPage.tsx", markers: ["mode=\"role-mapping\""] },
  { file: "frontend/src/pages/EmployeesPage.tsx", markers: ["OrganizationCascadeSelector"] },
  { file: "frontend/src/pages/EmployeeProfilePage.tsx", markers: ["OrganizationCascadeSelector", "EmployeeCascadeSelect", "EmployeeSelectField"], exception: "Employee 360 profile page does not expose a job assignment editor in this verified build; job changes remain routed through EmployeesPage/history flows." },
  { file: "frontend/src/pages/OrganizationSettingsPage.tsx", markers: ["OrganizationCascadeSelector"] },
  { file: "frontend/src/pages/ApprovalsPage.tsx", markers: ["OrganizationCascadeSelector", "EmployeeCascadeSelect"], exception: "Current central approvals page exposes settings, timeline, delegates, and step controls without org-condition selectors; backend approval workflow routes validate org conditions." },
  { file: "frontend/src/pages/RosterWeeklyPage.tsx", markers: ["OrganizationCascadeSelector"] },
  { file: "frontend/src/pages/RosterAssignmentModal.tsx", markers: ["OrganizationCascadeSelector", "EmployeeCascadeSelect"], exception: "No standalone RosterAssignmentModal file exists; roster assignment and filters live in RosterWeeklyPage and use the cascade." },
  { file: "frontend/src/pages/RosterSettingsPage.tsx", markers: ["OrganizationCascadeSelector"] },
  { file: "frontend/src/pages/AttendanceRecordsPage.tsx", markers: ["OrganizationCascadeSelector"] },
  { file: "frontend/src/pages/AttendanceCalendarPage.tsx", markers: ["OrganizationCascadeSelector"] },
  { file: "frontend/src/pages/AttendanceCorrectionsPage.tsx", markers: ["OrganizationCascadeSelector"] },
  { file: "frontend/src/pages/PayrollAdminPages.tsx", markers: ["OrganizationCascadeSelector", "EmployeeCascadeSelect"] },
  { file: "frontend/src/pages/PayrollFoundationPages.tsx", markers: ["EmployeeCascadeSelect"] },
  { file: "frontend/src/pages/PayrollRunDetailPage.tsx", markers: ["OrganizationCascadeSelector", "EmployeeCascadeSelect"], exception: "Payroll run detail is a scoped review/detail surface with no employee selector; row access is enforced by backend payroll scope." },
  { file: "frontend/src/pages/FinalSettlementPage.tsx", markers: ["EmployeeCascadeSelect"] },
  { file: "frontend/src/pages/DocumentSettingsPage.tsx", markers: ["OrganizationCascadeSelector"] },
  { file: "frontend/src/pages/DocumentCompliancePage.tsx", markers: ["OrganizationCascadeSelector", "EmployeeCascadeSelect"], exception: "Document compliance page exposes status/action controls only; employee rows are backend scope filtered and document targeting rules live in DocumentSettingsPage." },
  { file: "frontend/src/pages/LeaveSettingsPage.tsx", markers: ["OrganizationCascadeSelector"] },
  { file: "frontend/src/pages/ContractsPage.tsx", markers: ["EmployeeCascadeSelect"] },
  { file: "frontend/src/pages/AssetAssignmentsPage.tsx", markers: ["OrganizationCascadeSelector", "EmployeeCascadeSelect"] },
  { file: "frontend/src/pages/AssetsReportsPage.tsx", markers: ["OrganizationCascadeSelector"] },
  { file: "frontend/src/pages/AssetUniformAdvancedPages.tsx", markers: ["EmployeeCascadeSelect"] },
  { file: "frontend/src/pages/LifecyclePage.tsx", markers: ["EmployeeCascadeSelect"] },
  { file: "frontend/src/pages/ReportsPage.tsx", markers: ["OrganizationCascadeSelector", "ValidatedDateRangeField"] },
  { file: "frontend/src/pages/AttendanceReportsPage.tsx", markers: ["OrganizationCascadeSelector"] },
  { file: "frontend/src/pages/RosterReportsPage.tsx", markers: ["OrganizationCascadeSelector"] },
  { file: "frontend/src/pages/DataTransferPage.tsx", markers: ["OrganizationCascadeSelector", "EmployeeCascadeSelect"], exception: "Data transfer page chooses import/export templates; row-level org references are validated by data-transfer backend before apply." },
  { file: "frontend/src/pages/AttendanceDeviceOperationsPage.tsx", markers: ["EmployeeCascadeSelect"] },
  { file: "frontend/src/pages/SelfServicePage.tsx", markers: ["OrganizationCascadeSelector", "EmployeeCascadeSelect"], exception: "Self-service is strictly linked-employee/SELF_ONLY and does not expose manager/team org selectors." }
];
frontendRequirements.forEach(requireFrontendCoverage);

const frontendFiles = walk("frontend/src", (file) => /\.(tsx?|jsx?)$/.test(file));
const cascadeUsageFiles = frontendFiles.filter((file) => {
  const content = readOptional(file);
  return content.includes("<OrganizationCascadeSelector") || content.includes("<EmployeeCascadeSelect") || content.includes("<EmployeeSelectField");
});
if (cascadeUsageFiles.length <= 3) failures.push(`frontend/src: cascade selector coverage is still too narrow; found ${cascadeUsageFiles.length} files`);
if (cascadeUsageFiles.length < 12) failures.push(`frontend/src: expected broad cascade selector adoption in at least 12 files; found ${cascadeUsageFiles.length}`);

const fieldErrorUsageFiles = frontendFiles.filter((file) => readOptional(file).includes("FieldError"));
if (fieldErrorUsageFiles.length < 3) failures.push(`frontend/src: FieldError must be used by shared validation components/forms; found ${fieldErrorUsageFiles.length} files`);
has("frontend/src/pages/UsersAccessPage.tsx", "ValidationSummary", "role mapping modal must show validation summary");
has("frontend/src/pages/UsersAccessPage.tsx", "FormBlockingAlert", "role mapping modal must show blocking validation alert");
has("frontend/src/pages/UsersAccessPage.tsx", "FormWarningAlert", "role mapping modal must show warning validation alert");
has("frontend/src/components/organization/OrganizationCascadeSelector.tsx", "DependentFieldResetNotice", "cascade selector must show dependent field reset notices");

hasNo("frontend/src/pages/EmployeesPage.tsx", /props\.positions\.map\([^)]*=>\s*<option[\s\S]{0,160}position\.title/, "employee form must not use a global position dropdown");
hasNo("frontend/src/pages/UsersAccessPage.tsx", /props\.positions\.map\([^)]*=>\s*<option[\s\S]{0,160}position\.title/, "role mapping form must not use a global position dropdown");
hasNo("frontend/src/pages/UsersAccessPage.tsx", /props\.jobLevels\.map\([^)]*=>\s*<option[\s\S]{0,160}level\.name/, "role mapping form must not use a global job-level dropdown");

const backendRequirements = [
  { file: "worker/src/routes/role-mappings.ts", markers: ["validateOrganizationCascade", "validateAccessScope", "requestedScopeType"] },
  { file: "worker/src/routes/access-scopes.ts", markers: ["validateAccessScope", "requestedScopeType"] },
  { file: "worker/src/routes/employees.ts", markers: ["validateOrganizationCascadeWithScope", "validationResponse"] },
  { file: "worker/src/routes/users.ts", markers: ["validateDuplicateConflict", "validationResponse"] },
  { file: "worker/src/routes/roles.ts", markers: ["validateDuplicateConflict", "validateLockedState", "validationResponse"] },
  { file: "worker/src/routes/approvals.ts", markers: ["validateApprovalWorkflowRules", "validateDateRange", "validationResponse"] },
  { file: "worker/src/routes/leave.ts", markers: ["validateApprovalWorkflowRules", "validateOrganizationCascade", "validationResponse"] },
  { file: "worker/src/routes/attendance.ts", markers: ["validateAttendanceRosterRules", "validateDuplicateConflict", "validateLockedState", "validationResponse"] },
  { file: "worker/src/routes/attendance-devices-zkteco.ts", markers: ["validateDuplicateConflict", "validationResponse"] },
  { file: "worker/src/routes/roster.ts", markers: ["validateAttendanceRosterRules", "validateOrganizationCascade"] },
  { file: "worker/src/routes/payroll.ts", markers: ["validatePayrollRules", "validationResponse"] },
  { file: "worker/src/routes/payroll-foundations.ts", markers: ["validatePayrollRules", "validateDateRange"] },
  { file: "worker/src/routes/final-settlement.ts", markers: ["validateDateRange", "validateLockedState", "validationResponse"] },
  { file: "worker/src/routes/documents.ts", markers: ["validateDocumentRules", "validateOrganizationCascade", "validationResponse"] },
  { file: "worker/src/routes/document-compliance.ts", markers: ["validateDocumentRules", "validateDateRange", "validationResponse"] },
  { file: "worker/src/routes/contracts.ts", markers: ["validateContractRules", "validationResponse"] },
  { file: "worker/src/routes/asset-uniforms-advanced.ts", markers: ["validateAssetUniformRules", "validationResponse"] },
  { file: "worker/src/routes/lifecycle.ts", markers: ["validateDateRange", "validateDuplicateConflict", "validationResponse"] },
  { file: "worker/src/routes/reports.ts", markers: ["validateDateRange", "validateOrganizationCascade", "validationResponse"] },
  { file: "worker/src/routes/data-transfer.ts", markers: ["validateImportRows"] },
  { file: "worker/src/routes/self-service.ts", markers: ["validateDateRange", "validateAttendanceRosterRules", "validateLeaveRules", "validationResponse"] }
];
backendRequirements.forEach(requireBackendCoverage);

for (const route of ["worker/src/routes/attendance.ts", "worker/src/routes/attendance-devices-zkteco.ts", "worker/src/routes/lifecycle.ts", "worker/src/routes/users.ts", "worker/src/routes/roles.ts", "worker/src/routes/self-service.ts"]) {
  has(route, "../lib/moduleValidation", "route must not remain outside the global validation framework");
}

const browserPromptPattern = /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/;
for (const file of frontendFiles) {
  if (browserPromptPattern.test(readOptional(file))) failures.push(`${file}: browser alert/confirm/prompt usage is not allowed`);
}

const rawControlPattern = /<(select|input|button|textarea|table)\b/;
for (const file of frontendFiles) {
  if (file.includes("/components/ui/")) continue;
  if (file.includes("/components/forms/")) continue;
  if (file.includes("/components/organization/")) continue;
  const content = readOptional(file).replace(/<input[^>]+type=["']hidden["'][^>]*>/g, "");
  if (rawControlPattern.test(content)) failures.push(`${file}: raw visible controls should remain in shared UI primitives or validation components`);
}

has("worker/wrangler.toml", 'binding = "DB"', "D1 binding missing");
has("worker/wrangler.toml", 'database_name = "hrm-v2"', "D1 database name changed");
has("worker/wrangler.toml", 'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"', "D1 database id changed");
has("worker/wrangler.toml", 'binding = "DOCUMENTS_BUCKET"', "R2 binding missing");
has("worker/wrangler.toml", 'bucket_name = "hrm-v2-documents"', "R2 bucket changed");
has("worker/src/auth/password.ts", "PBKDF2_ITERATIONS = 100000", "PBKDF2 iteration limit must stay 100000");
has("frontend/vite.config.ts", "manualChunks", "Prompt 13 chunk optimization marker missing");
has("frontend/src/components/ui/page-shell.tsx", "PageShell", "Prompt 23 page shell marker missing");

for (const file of frontendFiles) {
  hasNo(file, "darkMode", "dark mode must not be added");
}

console.log("Global validation frontend files covered:");
frontendCovered.forEach((item) => console.log(`- ${item}`));
console.log("Global validation documented frontend exceptions:");
frontendExceptions.forEach((item) => console.log(`- ${item}`));
console.log("Global validation backend routes covered:");
backendCovered.forEach((item) => console.log(`- ${item}`));
console.log("Global validation documented backend exceptions:");
backendExceptions.forEach((item) => console.log(`- ${item}`));

if (failures.length) {
  console.error("Global validation verifier failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Global validation framework verifier passed.");
