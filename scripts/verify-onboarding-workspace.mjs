import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${message}`);
  }
}

function includes(file, marker, message = `${file} contains ${marker}`) {
  assert(read(file).includes(marker), message);
}

function notMatches(file, pattern, message) {
  assert(!pattern.test(read(file)), message);
}

const lifecycle = read("worker/src/routes/lifecycle.ts");
const documents = read("worker/src/routes/documents.ts");
const employeesRoute = read("worker/src/routes/employees.ts");
const lifecyclePage = read("frontend/src/pages/LifecyclePage.tsx");
const employeeProfilePage = read("frontend/src/pages/EmployeeProfilePage.tsx");
const employeesPage = read("frontend/src/pages/EmployeesPage.tsx");
const api = read("frontend/src/lib/api.ts");
const permissions = read("worker/src/db/permissions.ts");
const seed = read("database/seed.sql");
const wrangler = read("worker/wrangler.toml");

[
  '"/cases/:caseId/workspace"',
  '"/cases/:caseId/employee-info"',
  '"/cases/:caseId/contact-info"',
  '"/cases/:caseId/job-assignment"',
  '"/cases/:caseId/documents"',
  '"/cases/:caseId/contracts"',
  '"/cases/:caseId/payroll-profile"',
  '"/cases/:caseId/payment-methods"',
  '"/cases/:caseId/pension-profile"',
  '"/cases/:caseId/biometric-mapping"',
  '"/cases/:caseId/assets-uniforms"',
  '"/cases/:caseId/user-account"',
  '"/cases/:caseId/refresh-checklist"',
  '"/cases/:caseId/complete"'
].forEach((marker) => assert(lifecycle.includes(marker), `onboarding workspace API marker exists: ${marker}`));

[
  "loadOnboardingWorkspace",
  "validateWorkspaceJobAssignment",
  "employee_contacts",
  "employee_addresses",
  "employee_contracts",
  "employee_payroll_profiles",
  "employee_payment_methods",
  "employee_pension_profiles",
  "employee_biometric_mappings",
  "employee_asset_assignments",
  "source_of_truth",
  "setOnboardingTaskState",
  "NOT_REQUIRED",
  "isModuleEnabled",
  "activateEmployeeFromOnboarding"
].forEach((marker) => assert(lifecycle.includes(marker), `lifecycle source-of-truth marker exists: ${marker}`));

assert(lifecycle.includes("uploadEmployeeDocument(c") && documents.includes("DOCUMENTS_BUCKET") && documents.includes("r2_key"), "onboarding document upload delegates to existing document/R2 flow");
assert(documents.includes("employee_documents") && documents.includes("employee_document_versions"), "existing document module writes employee document source tables");

[
  "getOnboardingWorkspace",
  "updateOnboardingWorkspaceEmployeeInfo",
  "updateOnboardingWorkspaceContactInfo",
  "updateOnboardingWorkspaceJobAssignment",
  "uploadOnboardingWorkspaceDocument",
  "createOnboardingWorkspaceContract",
  "updateOnboardingWorkspacePayrollProfile",
  "createOnboardingWorkspacePaymentMethod",
  "updateOnboardingWorkspacePensionProfile",
  "createOnboardingWorkspaceBiometricMapping",
  "saveOnboardingWorkspaceAssetsUniforms",
  "saveOnboardingWorkspaceUserAccount",
  "completeOnboardingWorkspace"
].forEach((marker) => assert(api.includes(marker), `frontend API helper exists: ${marker}`));

[
  "OnboardingWorkspace",
  "EmployeeInfoWorkspaceForm",
  "ContactWorkspaceForm",
  "JobAssignmentWorkspaceForm",
  "DocumentsWorkspaceForm",
  "ContractWorkspaceForm",
  "PayrollWorkspaceForm",
  "PaymentPensionWorkspaceForm",
  "AttendanceRosterWorkspaceForm",
  "AssetsWorkspaceForm",
  "UserAccessWorkspaceForm",
  "ChecklistWorkspaceTable",
  "SubNavigationBar",
  "uploadOnboardingWorkspaceDocument"
].forEach((marker) => assert(lifecyclePage.includes(marker), `onboarding case page includes workspace UI marker: ${marker}`));

assert(employeeProfilePage.includes("employees.360.view_during_onboarding"), "Employee 360 override permission is checked");
assert(employeeProfilePage.includes("Employee 360 is locked during onboarding"), "Employee 360 locked message exists");
assert(employeeProfilePage.includes("/onboarding/cases?case_id="), "Employee 360 lock links back to onboarding case");
assert(employeesRoute.includes("active_onboarding_case_id"), "employee list API returns active onboarding case marker");
assert(employeesPage.includes("employeePrimaryRoute") && employeesPage.includes("active_onboarding_case_id"), "employee list routes onboarding employees to onboarding case");

[
  "onboarding.workspace.view",
  "onboarding.workspace.update",
  "onboarding.workspace.documents.upload",
  "onboarding.workspace.contracts.create",
  "onboarding.workspace.payroll.update",
  "onboarding.workspace.payment_methods.update",
  "onboarding.workspace.pension.update",
  "onboarding.workspace.attendance.update",
  "onboarding.workspace.assets.update",
  "onboarding.workspace.user_access.update",
  "onboarding.workspace.complete",
  "onboarding.workspace.activate",
  "employees.360.view_during_onboarding"
].forEach((marker) => {
  assert(permissions.includes(marker), `permission catalog includes ${marker}`);
  assert(seed.includes(marker), `seed includes ${marker}`);
});

assert(wrangler.includes('binding = "DB"') && wrangler.includes('database_name = "hrm-v2"') && wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'), "D1 binding unchanged");
assert(wrangler.includes('binding = "DOCUMENTS_BUCKET"') && wrangler.includes('bucket_name = "hrm-v2-documents"'), "R2 binding unchanged");
assert(read("worker/src/auth/password.ts").includes("PBKDF2_ITERATIONS = 100000") || read("worker/src/auth/password.ts").includes("100000"), "PBKDF2 remains capped at 100000");

["frontend/src/pages/LifecyclePage.tsx", "frontend/src/pages/EmployeeProfilePage.tsx", "frontend/src/pages/EmployeesPage.tsx"].forEach((file) => {
  notMatches(file, /\b(window\.)?(alert|confirm|prompt)\s*\(/, `${file} has no browser alert/confirm/prompt`);
});

includes("scripts/verify-performance-optimization.mjs", "performance", "performance optimization verifier remains present");
includes("scripts/verify-shadcn-navigation-tabs.mjs", "shadcn", "shadcn navigation verifier remains present");

if (process.exitCode) {
  console.error("Onboarding workspace verification failed.");
  process.exit(process.exitCode);
}

console.log("Onboarding workspace verification passed.");
