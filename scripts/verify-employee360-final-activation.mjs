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

function sliceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  if (startIndex < 0) return "";
  const endIndex = end ? source.indexOf(end, startIndex + start.length) : -1;
  return source.slice(startIndex, endIndex > startIndex ? endIndex : undefined);
}

const packageJson = JSON.parse(read("package.json"));
const service = read("worker/src/employee-setup/final-activation-verifier.ts");
const employeeStatus = read("worker/src/employee-setup/section-status.ts");
const documentsDecision = read("worker/src/employee-setup/document-requirement-decisions.ts");
const employeesRoute = read("worker/src/routes/employees.ts");
const lifecycleRoute = read("worker/src/routes/lifecycle.ts");
const profilePage = read("frontend/src/pages/EmployeeProfilePage.tsx");
const api = read("frontend/src/lib/api.ts");
const types = read("frontend/src/types/employees.ts");
const seed = read("database/seed.sql");
const schema = read("database/schema.sql");
const wrangler = read("worker/wrangler.toml");
const password = read("worker/src/auth/password.ts");

for (const helper of [
  "verifyEmployee360SetupForActivation",
  "rebuildStaleEmployeeSetupSectionsBeforeFinalVerification",
  "runEmployeeSetupFinalSectionVerification",
  "markEmployeeSetupSectionsVerified",
  "buildEmployeeActivationBlockerResponse"
]) {
  check(service.includes(`export async function ${helper}`) || service.includes(`export function ${helper}`), `${helper} helper is missing`);
}

check(service.includes("safeEvaluateEmployeeSetupSection") && service.includes("createEmployeeSetupEvaluationContext"), "final verifier must use bounded Employee 360 section evaluators");
check(!service.includes("getEmployeeOverview") && !service.includes("workspace"), "final verifier must not load the full Employee 360 workspace");
check(!service.includes("getEmployeeOnboardingReadiness") && !service.includes("calculateOnboardingReadiness"), "final verifier must not call old heavy onboarding readiness as primary path");
check(service.includes("verifyDocumentDecisionForActivation") && service.includes("DOCUMENT_WAIVER_AUDIT_MISSING"), "document decisions/waivers are not rechecked with audit protection");
check(service.includes("DOCUMENT_REQUIREMENT_HARD_REQUIRED") || documentsDecision.includes("DOCUMENT_REQUIREMENT_HARD_REQUIRED"), "hard-required non-waivable document protection is missing");
check(service.includes("revoked") || documentsDecision.includes("revoked"), "revoked waiver handling is missing");
check(employeeStatus.includes('methodType === "BANK_TRANSFER"') && employeeStatus.includes("payment_institution_id") && employeeStatus.includes("bank_account_name") && employeeStatus.includes("bank_account_number"), "Bank Transfer validation is weakened");
check(employeeStatus.includes('methodType === "CASH"') && employeeStatus.includes('payment_institution: "not_required"'), "Cash payment can require Payment Institution");
check(employeeStatus.includes("Pension is disabled or Payroll is disabled.") && employeeStatus.includes("Pension setup is optional"), "Pension disabled/not-required behavior regressed");
check(employeeStatus.includes("Attendance and Roster setup is disabled or not required.") && employeeStatus.includes("Payroll is disabled."), "Attendance disabled / Payroll isolation markers are missing");
check(employeeStatus.includes("document_required_rules") && employeeStatus.includes("employee_type") && employeeStatus.includes("decision_gate"), "local/foreign document decision gate markers are missing");

const finalRoute = sliceBetween(employeesRoute, 'employeeRoutes.post("/:id/setup/final-verification"', 'employeeRoutes.post("/:id/setup/activate"');
const activateRoute = sliceBetween(employeesRoute, 'employeeRoutes.post("/:id/setup/activate"', 'employeeRoutes.get("/:id"');
check(finalRoute.includes("verifyEmployee360SetupForActivation"), "final verification endpoint is missing or does not call final verifier");
check(finalRoute.includes("canAccessEmployee") && finalRoute.includes('"manage"'), "final verification endpoint lacks manage scope enforcement");
check(finalRoute.includes("employee.setup.final_verification.started") && finalRoute.includes("finalVerificationEventType"), "final verification endpoint does not audit started/result events");
check(finalRoute.includes("employee.setup.final_verification.verified") || employeesRoute.includes("employee.setup.final_verification.verified"), "final verification verified app event is missing");
check(finalRoute.includes('Cache-Control", "private, no-store"') && finalRoute.includes('Vary", "Origin"'), "final verification endpoint lacks no-store/CORS headers");
check(activateRoute.includes("verifyEmployee360SetupForActivation"), "activation endpoint must call final verifier before activation");
check(activateRoute.indexOf("verifyEmployee360SetupForActivation") < activateRoute.indexOf("UPDATE employees SET status_id"), "activation status update can happen before final verifier");
check(activateRoute.includes("!verification.can_activate") && activateRoute.includes("buildEmployeeActivationBlockerResponse"), "blocked/stale/failed final verification can be bypassed");
check(activateRoute.includes('"PENDING_APPROVAL"') && activateRoute.includes('"ACTIVE"'), "activation endpoint does not implement approval/direct activation statuses");
check(activateRoute.includes("employee.activation.pending_approval") && activateRoute.includes("employee.activated"), "activation app events are missing");
check(activateRoute.includes("employee.activation.submitted"), "activation submitted audit event is missing");
check(activateRoute.includes("employeeSetupApprovalRequired"), "approval workflow gate is missing");

check(seed.includes("employee.setup.verify") && seed.includes("employee.setup.activate") && seed.includes("employees.activate"), "Employee 360 final activation permissions are missing from seed");
check(seed.includes("'PENDING_FINAL_VERIFICATION'") && seed.includes("'PENDING_APPROVAL'"), "pending final verification/approval status seeds are missing");

check(api.includes("runEmployee360FinalVerification") && api.includes("/setup/final-verification"), "frontend final verification API helper is missing");
check(api.includes("activateEmployeeFromEmployee360") && api.includes("/setup/activate"), "frontend activation API helper is missing");
check(types.includes("Employee360FinalVerification") && types.includes("Employee360FinalActivationResponse"), "frontend final activation types are missing");
check(profilePage.includes("Run Final Verification"), "Employee 360 final verification button is missing");
check(profilePage.includes("Activate Employee") && profilePage.includes("Submit Activation"), "Employee 360 activation button states are missing");
check(profilePage.includes("backendVerified") && profilePage.includes("!backendVerified"), "frontend setup status alone can activate employee");
check(profilePage.includes("lastVerification?.status === \"verified\"") && profilePage.includes("lastVerification.can_activate === true"), "frontend does not require backend final verification before activation");
check(profilePage.includes("setLastFinalVerification(result.verification)") && profilePage.includes("applyFinalActivationResponse"), "frontend does not update panel from final verification response");

for (const marker of [
  "employee.setup.final_verification.verified",
  "employee.setup.final_verification.blocked",
  "employee.setup.final_verification.failed",
  "employee.activated",
  "employee.activation.pending_approval",
  "employee.setup.status.updated"
]) {
  check(employeesRoute.includes(marker), `${marker} app/audit event marker is missing`);
}

check(lifecycleRoute.includes("activateEmployeeFromOnboarding") && lifecycleRoute.includes('onboardingRoutes.post("/cases/:caseId/final-verification"'), "old onboarding activation/final verification was removed");
check(schema.includes("CREATE TABLE IF NOT EXISTS employee_onboarding_cases"), "onboarding cases/history table was removed");
check(!/DROP\s+TABLE\s+employee_onboarding_cases/i.test([schema, employeesRoute].join("\n")), "onboarding cases/history appear to be deleted");
check(!/can_activate_candidate\s*===\s*true[\s\S]{0,160}activateEmployeeFromEmployee360/.test(profilePage), "frontend candidate readiness can activate employee");
check(!/status\s*=\s*'ACTIVE'[\s\S]{0,200}without final/i.test(employeesRoute), "activation bypass marker detected");
check(service.includes("safeText") && service.includes("sensitive value") && service.includes("SQLITE_"), "final verifier safe error redaction is missing");
check(!/\b(window\.)?(alert|confirm|prompt)\s*\(/.test([service, employeesRoute, profilePage].join("\n")), "browser alert/confirm/prompt was introduced");
check(!/dark:|prefers-color-scheme|useDarkMode/i.test([service, employeesRoute, profilePage].join("\n")), "dark mode was introduced");
check(wrangler.includes('binding = "DB"') && wrangler.includes('database_name = "hrm-v2"') && wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'), "D1 binding changed");
check(wrangler.includes('binding = "DOCUMENTS_BUCKET"') && wrangler.includes('bucket_name = "hrm-v2-documents"'), "R2 binding changed");
check(password.includes("100000"), "PBKDF2 iterations changed");
check(packageJson.scripts?.["verify:employee360-final-activation"] === "node scripts/verify-employee360-final-activation.mjs", "verify:employee360-final-activation package script is missing");
check(packageJson.scripts?.["diagnose:employee360-final-activation"] === "node scripts/diagnose-employee360-final-activation.mjs", "diagnose:employee360-final-activation package script is missing");
check(fs.existsSync(path.join(root, "scripts", "diagnose-employee360-final-activation.mjs")), "diagnostic script is missing");

if (failures.length) {
  console.error("Employee 360 final activation verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Employee 360 final activation verification passed.");
