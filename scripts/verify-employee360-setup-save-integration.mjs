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

function count(source, marker) {
  return source.split(marker).length - 1;
}

const packageJson = JSON.parse(read("package.json"));
const schema = read("database/schema.sql");
const seed = read("database/seed.sql");
const evaluators = read("worker/src/employee-setup/section-evaluators.ts");
const saveIntegration = read("worker/src/employee-setup/save-integration.ts");
const sectionStatus = read("worker/src/employee-setup/section-status.ts");
const registry = read("worker/src/employee-setup/section-registry.ts");
const employeesRoute = read("worker/src/routes/employees.ts");
const documentsRoute = read("worker/src/routes/documents.ts");
const contractsRoute = read("worker/src/routes/contracts.ts");
const payrollRoute = read("worker/src/routes/payroll.ts");
const payrollFoundationsRoute = read("worker/src/routes/payroll-foundations.ts");
const roleMappingsRoute = read("worker/src/routes/role-mappings.ts");
const attendanceDevicesRoute = read("worker/src/routes/attendance-devices-zkteco.ts");
const rosterRoute = read("worker/src/routes/roster.ts");
const assetsRoute = read("worker/src/routes/assets-notes-audit.ts");
const advancedAssetsRoute = read("worker/src/routes/asset-uniforms-advanced.ts");
const lifecycleRoute = read("worker/src/routes/lifecycle.ts");
const api = read("frontend/src/lib/api.ts");
const employeeTypes = read("frontend/src/types/employees.ts");
const profilePage = read("frontend/src/pages/EmployeeProfilePage.tsx");
const finalActivationService = read("worker/src/employee-setup/final-activation-verifier.ts");
const documentsPanel = read("frontend/src/components/employee/EmployeeDocumentsPanel.tsx");
const contractsPanel = read("frontend/src/components/employee/EmployeeContractsPanel.tsx");
const payrollPanel = read("frontend/src/components/payroll/EmployeePayrollPanel.tsx");
const payrollFoundationPanels = read("frontend/src/components/payroll/EmployeePayrollFoundationPanels.tsx");
const assetsPanel = read("frontend/src/components/assets/EmployeeAssetsPanel.tsx");
const wrangler = read("worker/wrangler.toml");
const password = read("worker/src/auth/password.ts");

const requiredSections = [
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

check(schema.includes("CREATE TABLE IF NOT EXISTS employee_setup_section_statuses"), "employee setup section status table is missing");
check(schema.includes("UNIQUE (employee_id, section_key)"), "employee setup section status uniqueness is missing");
check(seed.includes("'PENDING_SETUP'"), "PENDING_SETUP seed is missing");
for (const section of requiredSections) {
  check(registry.includes(`section_key: "${section}"`), `registry is missing ${section}`);
  check(evaluators.includes(`| "${section}"`) || evaluators.includes(`"${section}"`), `section evaluator key union is missing ${section}`);
}

check(evaluators.includes("export async function evaluateEmployeeSetupSections"), "section-scoped evaluator helper is missing");
check(evaluators.includes("const keys = uniqueSectionKeys(sectionKeys)") && evaluators.includes("definitionsByKey.get(sectionKey)"), "section evaluator does not filter requested keys");
check(evaluators.includes("safeEvaluateEmployeeSetupSection"), "section evaluator does not use safe section evaluation");
check(evaluators.includes("upsertEmployeeSetupSectionStatus"), "section evaluator does not persist evaluated section rows");
check(evaluators.includes('source_version = "employee360-setup-phase2"'), "section evaluator source version marker is missing");
check(!evaluators.includes("rebuildEmployeeSetupSectionStatuses("), "section evaluator must not rebuild every section");

check(saveIntegration.includes("export async function updateEmployeeSetupSectionStatusAfterSave"), "post-save setup integration helper is missing");
check(saveIntegration.includes("employeeSetupStatusUpdateResponse"), "standard setup_status_update response wrapper is missing");
check(saveIntegration.includes("evaluateEmployeeSetupSections"), "save integration does not use section-scoped evaluator");
check(saveIntegration.includes("markEmployeeSetupSectionStale"), "save integration does not mark stale dependencies");
check(saveIntegration.includes("warnings.push"), "save integration does not return safe warnings on status update failure");
check(saveIntegration.includes("can_activate_candidate: false") && saveIntegration.includes("activation_requires_final_verification: true"), "save integration can enable activation in Phase 2");
check(!saveIntegration.includes("rebuildEmployeeSetupSectionStatuses("), "save integration must not rebuild every section after save");

const routeSources = {
  "profile save": employeesRoute,
  "documents save": documentsRoute,
  "contract save": contractsRoute,
  "payroll profile save": payrollRoute,
  "payroll foundation save": payrollFoundationsRoute,
  "role mapping save": roleMappingsRoute,
  "attendance/biometric save": attendanceDevicesRoute,
  "roster save": rosterRoute,
  "asset save": `${assetsRoute}\n${advancedAssetsRoute}`
};
for (const [label, source] of Object.entries(routeSources)) {
  check(source.includes("updateEmployeeSetupSectionStatusAfterSave"), `${label} route group is not wired to setup status integration`);
  check(source.includes("employeeSetupStatusUpdateResponse"), `${label} route group does not return setup_status_update`);
}

check(includesAll(employeesRoute, [
  'savedSectionKey: jobChanged && !profileChanged ? "job_assignment" : "profile_information"',
  'affectedSectionKeys: [profileChanged ? "profile_information" : null, jobChanged ? "job_assignment" : null]',
  'savedSectionKey: "contact_emergency"',
  'savedSectionKey: "user_access"',
  'savedSectionKey: "approval_tasks"',
  'const staleSectionKeys = ['
]), "employees routes do not cover profile/job/contact/user access/approval task setup status updates");
check(includesAll(employeesRoute, [
  'input.employee_type !== existing.employee_type ? "documents" : null',
  'input.employment_type !== existing.employment_type ? "contract" : null',
  'input.employment_type !== existing.employment_type ? "payroll_profile" : null',
  'input.employment_type !== existing.employment_type ? "payment_method" : null',
  'input.joining_date !== existing.joining_date ? "attendance_roster" : null',
  'jobChanged ? "assets_uniforms" : null',
  'jobChanged ? "approval_tasks" : null'
]), "employee profile/job dependency stale marking is incomplete");
check(documentsRoute.includes('savedSectionKey: "documents"') && documentsRoute.includes("completeDocumentUploadSessions"), "document upload/complete flows do not evaluate documents");
check(documentsRoute.includes("permanent-delete") && count(documentsRoute, 'savedSectionKey: "documents"') >= 4, "document action/delete/metadata flows do not evaluate documents");
check(contractsRoute.includes('savedSectionKey: "contract"') && count(contractsRoute, 'savedSectionKey: "contract"') >= 8, "contract create/update/action flows do not evaluate contract");
check(payrollRoute.includes('savedSectionKey: "payroll_profile"') && payrollRoute.includes('staleSectionKeys: ["payment_method", "pension"]'), "payroll profile save does not evaluate payroll_profile and stale payment/pension");
check(payrollFoundationsRoute.includes('savedSectionKey: "payment_method"') && payrollFoundationsRoute.includes('staleSectionKeys: ["pension"]'), "payment method save does not evaluate payment_method and stale pension");
check(payrollFoundationsRoute.includes('savedSectionKey: "pension"'), "pension save does not evaluate pension");
check(roleMappingsRoute.includes('savedSectionKey: "user_access"') && employeesRoute.includes('savedSectionKey: "user_access"'), "user access link/provision/update/apply flows do not evaluate user_access");
check(attendanceDevicesRoute.includes('savedSectionKey: "attendance_roster"') && rosterRoute.includes('savedSectionKey: "attendance_roster"'), "attendance/roster setup does not evaluate attendance_roster");
check(assetsRoute.includes('savedSectionKey: "assets_uniforms"') && advancedAssetsRoute.includes('savedSectionKey: "assets_uniforms"'), "asset/uniform assignment flows do not evaluate assets_uniforms");

check(sectionStatus.includes("return blocked("), "missing setup is not represented as blocked/incomplete");
check(sectionStatus.includes("return notRequired("), "disabled modules/submodules are not represented as not_required");
check(sectionStatus.includes("Pension is disabled or Payroll is disabled.") && sectionStatus.includes("Pension setup is optional"), "pension disabled/optional behavior regressed");
check(sectionStatus.includes('methodType === "CASH"') && sectionStatus.includes('payment_institution: "not_required"'), "cash payment can require payment institution");
check(includesAll(sectionStatus, ['methodType === "BANK_TRANSFER"', "payment_institution_id", "bank_account_name", "bank_account_number"]), "bank transfer validation is weakened");
check(sectionStatus.includes("document_required_rules") && sectionStatus.includes("employee_type") && sectionStatus.includes("document_type_code"), "local/foreign document behavior markers are missing");

check(employeeTypes.includes("EmployeeSetupStatusUpdate") && employeeTypes.includes("setup_status_update"), "frontend setup status update type is missing");
check(api.includes("WithEmployeeSetupStatusUpdate"), "frontend API wrapper type is missing");
for (const marker of [
  "applyEmployeeRoleMapping",
  "provisionEmployeeUserAccount",
  "updateEmployee",
  "createEmployeeContact",
  "createEmployeeContract",
  "uploadEmployeeDocument",
  "updateEmployeePayrollProfile",
  "createEmployeePaymentMethod",
  "updateEmployeePensionProfile",
  "issueAssetAssignment"
]) {
  const index = api.indexOf(marker);
  const slice = index >= 0 ? api.slice(index, index + 500) : "";
  check(slice.includes("WithEmployeeSetupStatusUpdate"), `frontend API ${marker} is not typed with setup_status_update`);
}

check(profilePage.includes("applySetupStatusUpdate"), "Employee 360 page does not apply setup_status_update");
check(profilePage.includes("setSetupReadiness") && profilePage.includes("updated_sections") && profilePage.includes("stale_sections"), "Employee 360 preview does not merge updated/stale section rows");
check(profilePage.includes("onSetupStatusUpdate={applySetupStatusUpdate}"), "Employee 360 child panels are not passed setup update callback");
check(profilePage.includes("Rebuild readiness"), "manual rebuild button was removed");
check(profilePage.includes("Run Final Verification") || profilePage.includes("Activation locked"), "Employee 360 setup preview is not clearly final-verification gated");
check(
  !profilePage.includes("activateEmployeeFromEmployee360") ||
    (finalActivationService.includes("verifyEmployee360SetupForActivation") && profilePage.includes("backendVerified") && profilePage.includes("lastVerification.can_activate === true")),
  "Employee 360 activation must remain server-final-verifier gated"
);

for (const [name, source] of Object.entries({
  "documents panel": documentsPanel,
  "contracts panel": contractsPanel,
  "payroll panel": payrollPanel,
  "payroll foundation panels": payrollFoundationPanels,
  "assets panel": assetsPanel
})) {
  check(source.includes("onSetupStatusUpdate"), `${name} does not propagate setup_status_update`);
}
const documentsPanelCall = profilePage.slice(profilePage.indexOf("<EmployeeDocumentsPanel"), profilePage.indexOf("<EmployeeAssetsPanel"));
check(documentsPanel.includes("await load()") && !documentsPanelCall.includes("onChanged={load}"), "document section should refresh locally without a full Employee 360 reload");
check(payrollFoundationPanels.includes("verifyEmployeePaymentMethod") && payrollFoundationPanels.includes("archiveEmployeePaymentMethod"), "payment method verify/archive actions are not covered in frontend callback path");

check(lifecycleRoute.includes("activateEmployeeFromOnboarding"), "old onboarding activation authority was removed");
check(read("worker/src/onboarding/section-status.ts").includes("onboarding_setup_section_statuses"), "old onboarding section status system was removed");
check(
  !employeesRoute.includes("setup/activate") ||
    (employeesRoute.includes("verifyEmployee360SetupForActivation") && employeesRoute.indexOf("verifyEmployee360SetupForActivation") < employeesRoute.indexOf("UPDATE employees SET status_id")),
  "Employee 360 activation route must call final verifier before status updates"
);

check(packageJson.scripts?.["verify:employee360-setup-save-integration"] === "node scripts/verify-employee360-setup-save-integration.mjs", "package script verify:employee360-setup-save-integration is missing");
check(packageJson.scripts?.["diagnose:employee-setup-sections"] === "node scripts/diagnose-employee-setup-sections.mjs", "diagnostic script registration is missing");
const diagnostics = read("scripts/diagnose-employee-setup-sections.mjs");
for (const marker of ["latest status update timestamps", "stale sections", "failed sections", "missing required section rows", "duplicate section rows", "setup readiness summary", "recent employee save/update events"]) {
  check(diagnostics.includes(marker), `diagnostic output is missing ${marker}`);
}

const changedSources = [
  evaluators,
  saveIntegration,
  employeesRoute,
  documentsRoute,
  contractsRoute,
  payrollRoute,
  payrollFoundationsRoute,
  roleMappingsRoute,
  attendanceDevicesRoute,
  rosterRoute,
  assetsRoute,
  advancedAssetsRoute,
  profilePage,
  documentsPanel,
  contractsPanel,
  payrollPanel,
  payrollFoundationPanels,
  assetsPanel
].join("\n");
check(!/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(changedSources), "browser alert/confirm/prompt was introduced");
check(!/\bdark:|prefers-color-scheme|useDarkMode/i.test(changedSources), "dark mode was introduced");
check(!/password|token|secret|bank_account_number_encrypted_or_plain_placeholder/.test(saveIntegration), "setup_status_update helper risks exposing sensitive values");
check(wrangler.includes('binding = "DB"') && wrangler.includes('database_name = "hrm-v2"') && wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'), "D1 binding changed");
check(wrangler.includes('binding = "DOCUMENTS_BUCKET"') && wrangler.includes('bucket_name = "hrm-v2-documents"'), "R2 binding changed");
check(password.includes("100000"), "PBKDF2 iterations changed");

if (failures.length) {
  console.error("Employee 360 setup save integration verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Employee 360 setup save integration verification passed.");
