import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function must(condition, message) {
  if (!condition) failures.push(message);
}

function includes(file, marker) {
  must(read(file).includes(marker), `${file} missing ${marker}`);
}

const schema = read("database/schema.sql");
const seed = read("database/seed.sql");
const permissions = read("worker/src/db/permissions.ts");
const lifecycleRoute = read("worker/src/routes/lifecycle.ts");
const workerIndex = read("worker/src/index.ts");
const reportsRoute = read("worker/src/routes/reports.ts");
const api = read("frontend/src/lib/api.ts");
const appRoutes = read("frontend/src/routes/AppRoutes.tsx");
const appShell = read("frontend/src/layouts/AppShell.tsx");
const selfService = read("frontend/src/pages/SelfServicePage.tsx");
const employeeProfile = read("frontend/src/pages/EmployeeProfilePage.tsx");
const wrangler = read("worker/wrangler.toml");
const auth = read("worker/src/auth/password.ts");

[
  "onboarding_settings",
  "employee_onboarding_cases",
  "employee_onboarding_tasks",
  "onboarding_alerts",
  "offboarding_settings",
  "employee_offboarding_cases",
  "employee_offboarding_tasks",
  "employee_lifecycle_events"
].forEach((marker) => must(schema.includes(marker), `schema missing ${marker}`));

[
  "onboarding.settings.view",
  "onboarding.settings.manage",
  "onboarding.cases.view",
  "onboarding.cases.create",
  "onboarding.tasks.complete",
  "onboarding.tasks.waive",
  "onboarding.activation.activate",
  "onboarding.activation.override",
  "onboarding.dashboard.view",
  "onboarding.alerts.view",
  "offboarding.settings.view",
  "offboarding.cases.create",
  "offboarding.tasks.complete",
  "offboarding.finalization.finalize",
  "offboarding.finalization.override",
  "offboarding.dashboard.view",
  "employees.lifecycle.view",
  "employees.lifecycle.manage",
  "self_service.onboarding.view",
  "self_service.offboarding.view",
  "reports.onboarding.view",
  "reports.offboarding.view",
  "reports.lifecycle.view"
].forEach((marker) => {
  must(seed.includes(marker), `seed missing ${marker}`);
  must(permissions.includes(marker), `permission registry missing ${marker}`);
});

[
  "createLifecycleEvent",
  "createOnboardingTaskIfMissing",
  "refreshOnboardingChecklist",
  "getOnboardingChecklistStatus",
  "getOnboardingBlockers",
  "completeOnboardingTask",
  "waiveOnboardingTask",
  "getOnboardingDocumentChecklist",
  "getOnboardingContractStatus",
  "getOnboardingPayrollReadiness",
  "getOnboardingBiometricMappingStatus",
  "getOnboardingUserAccessStatus",
  "getEmployeeOnboardingReadiness",
  "submitEmployeeActivationForApproval",
  "approveEmployeeActivation",
  "activateEmployeeFromOnboarding",
  "activateEmployeeWithOnboardingOverride",
  "getOffboardingFinalSettlementStatus",
  "getOffboardingPayrollStatus",
  "getOffboardingBankLoanStatus",
  "getOffboardingBiometricImportWarnings",
  "getOffboardingRosterFutureAssignmentWarnings",
  "getOffboardingUserAccessStatus",
  "deactivateEmployeeUserAccessForOffboarding",
  "getEmployeeOffboardingReadiness",
  "submitEmployeeExitForApproval",
  "approveEmployeeExitFinalization",
  "finalizeEmployeeExitFromOffboarding",
  "finalizeEmployeeExitWithOverride"
].forEach((marker) => must(lifecycleRoute.includes(marker), `lifecycle route helper missing ${marker}`));

[
  "/settings",
  "/cases",
  "/dashboard",
  "/alerts",
  "/cases/:caseId/readiness",
  "/cases/:caseId/activate-with-override",
  "/cases/:caseId/finalize-with-override",
  "/:employeeId/lifecycle-summary",
  "/onboarding",
  "/offboarding"
].forEach((marker) => must(lifecycleRoute.includes(marker), `lifecycle route missing ${marker}`));

must(workerIndex.includes("lifecycleRoutes"), "worker index does not mount lifecycleRoutes");
must(workerIndex.includes("onboardingRoutes"), "worker index does not mount onboardingRoutes");
must(workerIndex.includes("offboardingRoutes"), "worker index does not mount offboardingRoutes");
must(
  workerIndex.indexOf('app.route("/api/v1/employees", employeeLifecycleRoutes)') < workerIndex.indexOf('app.route("/api/v1/employees", employeeRoutes)'),
  "employee lifecycle routes must mount before legacy employee routes"
);

[
  "onboarding/summary",
  "offboarding/summary",
  "lifecycle/events",
  "lifecycle/sla-placeholder",
  "getLifecycleReport"
].forEach((marker) => must(reportsRoute.includes(marker), `reports route missing ${marker}`));

must(exists("frontend/src/pages/LifecyclePage.tsx"), "LifecyclePage is missing");
must(exists("frontend/src/types/lifecycle.ts"), "lifecycle frontend types are missing");

[
  "getLifecycleDashboard",
  "listLifecycleEvents",
  "getOnboardingSettings",
  "listOnboardingCases",
  "getOnboardingReadiness",
  "activateOnboardingCaseWithOverride",
  "getOffboardingSettings",
  "listOffboardingCases",
  "getOffboardingReadiness",
  "finalizeOffboardingCaseWithOverride",
  "getEmployeeLifecycleSummary",
  "getSelfServiceOnboarding",
  "getSelfServiceOffboarding"
].forEach((marker) => must(api.includes(marker), `frontend api missing ${marker}`));

[
  "path=\"onboarding\"",
  "path=\"onboarding/cases\"",
  "path=\"onboarding/settings\"",
  "path=\"offboarding\"",
  "path=\"offboarding/cases\"",
  "path=\"offboarding/settings\"",
  "path=\"lifecycle/reports\"",
  "path=\"self-service/onboarding\"",
  "path=\"self-service/offboarding\""
].forEach((marker) => must(appRoutes.includes(marker), `AppRoutes missing ${marker}`));

must(appShell.includes("Onboarding") && appShell.includes("Offboarding"), "sidebar missing lifecycle navigation");
must(selfService.includes("My Onboarding") && selfService.includes("My Offboarding"), "self-service lifecycle tabs missing");
must(employeeProfile.includes("\"Lifecycle\"") && employeeProfile.includes("LifecyclePanel"), "Employee 360 lifecycle panel missing");

[
  "frontend/src/pages/LifecyclePage.tsx",
  "frontend/src/pages/SelfServicePage.tsx",
  "frontend/src/pages/EmployeeProfilePage.tsx"
].forEach((file) => {
  const text = read(file);
  must(!/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(text), `${file} uses browser alert/confirm/prompt`);
});

must(!/recruitment/i.test(lifecycleRoute), "Prompt 19 should not implement recruitment");
must(!/e-signature|esignature/i.test(lifecycleRoute), "Prompt 19 should not implement e-signature");

must(wrangler.includes('database_name = "hrm-v2"'), "D1 database_name changed");
must(wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'), "D1 database_id changed");
must(wrangler.includes('bucket_name = "hrm-v2-documents"'), "R2 bucket changed");
must(auth.includes("PBKDF2_ITERATIONS = 100000") || auth.includes("100000"), "PBKDF2 max iteration guard missing");

[
  "scripts/verify-baseline-prompts1-5.mjs",
  "scripts/verify-recovery-prompts6-9.mjs",
  "scripts/verify-prompt18.mjs"
].forEach((file) => must(exists(file), `${file} is missing`));

if (failures.length) {
  console.error("Prompt 19 verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Prompt 19 verification passed.");
