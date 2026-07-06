import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file)) {
    failures.push(`${relativePath}: missing`);
    return "";
  }
  return fs.readFileSync(file, "utf8");
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

const packageJson = JSON.parse(read("package.json"));
const schema = read("database/schema.sql");
const seed = read("database/seed.sql");
const migration = read("scripts/migrate-onboarding-cases-to-employee360-setup.mjs");
const oneCaseVerifier = read("scripts/verify-one-case-onboarding-to-employee360.mjs");
const liveVerifier = read("scripts/verify-live-employee360-setup-rollout.mjs");
const employeeRoutes = read("worker/src/routes/employees.ts");
const sectionStatus = read("worker/src/employee-setup/section-status.ts");
const finalVerifier = read("worker/src/employee-setup/final-activation-verifier.ts");
const appRoutes = read("frontend/src/routes/AppRoutes.tsx");
const appShell = read("frontend/src/layouts/AppShell.tsx");
const api = read("frontend/src/lib/api.ts");
const employeesPage = read("frontend/src/pages/EmployeesPage.tsx");
const setupPage = read("frontend/src/pages/EmployeeSetupListPage.tsx");
const profilePage = read("frontend/src/pages/EmployeeProfilePage.tsx");
const searchRoute = read("worker/src/routes/search.ts");
const dashboardRoute = read("worker/src/routes/dashboard.ts");
const notificationRoute = read("worker/src/routes/notifications.ts");
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

check(packageJson.scripts?.["migrate:onboarding-to-employee360-setup"] === "node scripts/migrate-onboarding-cases-to-employee360-setup.mjs", "migration package script is missing");
check(packageJson.scripts?.["verify:one-case-onboarding-to-employee360"] === "node scripts/verify-one-case-onboarding-to-employee360.mjs", "one-case verifier package script is missing");
check(packageJson.scripts?.["verify:live-employee360-setup-rollout"] === "node scripts/verify-live-employee360-setup-rollout.mjs", "live rollout verifier package script is missing");
check(packageJson.scripts?.["verify:employee360-setup-rollout"] === "node scripts/verify-employee360-setup-rollout.mjs", "rollout verifier package script is missing");

check(schema.includes("CREATE TABLE IF NOT EXISTS employee_onboarding_cases"), "legacy employee_onboarding_cases history table was removed");
check(schema.includes("CREATE TABLE IF NOT EXISTS employee_setup_section_statuses") && schema.includes("source_case_id"), "Employee 360 section-status source_case_id schema is missing");
check(!/DROP\s+TABLE\s+employee_onboarding_cases/i.test(schema), "destructive onboarding table drop detected");
check(seed.includes("'PENDING_SETUP'") && seed.includes("'PENDING_FINAL_VERIFICATION'") && seed.includes("'PENDING_APPROVAL'"), "Employee setup status seeds are missing");
check(requiredSections.every((section) => sectionStatus.includes(section)), "Employee 360 required section registry/evaluators are incomplete");
check(finalVerifier.includes("verifyEmployee360SetupForActivation") && finalVerifier.includes("can_activate"), "Employee 360 final activation verifier is missing");

check(migration.includes("HRM_MIGRATE_ONBOARDING_TO_EMPLOYEE360") && migration.includes("HRM_MIGRATE_CONFIRM") && migration.includes("dry_run"), "migration script does not default to safe dry-run with explicit write confirmation");
check(migration.includes("HRM_MIGRATE_CASE_ID") && migration.includes("HRM_MIGRATE_EMPLOYEE_ID") && migration.includes("HRM_MIGRATE_BATCH_LIMIT"), "migration script is missing required target env support");
check(
  migration.includes("setup-sections/rebuild") &&
    migration.includes("onboarding-to-employee360-migration-report.md") &&
    migration.includes("onboarding-to-employee360-migration-summary.json") &&
    fs.existsSync(path.join(root, "docs", "production", "onboarding-to-employee360-migration-report.md")) &&
    fs.existsSync(path.join(root, "docs", "production", "onboarding-to-employee360-migration-summary.json")),
  "migration script does not write the required reports or rebuild Employee 360 statuses"
);
check(oneCaseVerifier.includes("HRM_MIGRATE_CASE_ID") && oneCaseVerifier.includes("setup-readiness") && oneCaseVerifier.includes("SKIPPED"), "one-case verifier must support safe skipped mode and setup-readiness checks");
check(liveVerifier.includes("HRM_PROD_API_URL") && liveVerifier.includes("HRM_LIVE_LOGIN_EMAIL") && liveVerifier.includes("HRM_LIVE_LOGIN_PASSWORD") && liveVerifier.includes("no production activation"), "live rollout verifier is missing required env/safety markers");

check(employeeRoutes.includes('employeeRoutes.get("/setup"') && employeeRoutes.includes("buildEmployeeScopeWhereClause") && employeeRoutes.includes("employee_setup_section_statuses"), "Employee setup queue endpoint is missing scope/status aggregation");
check(employeeRoutes.includes("PENDING_SETUP") && employeeRoutes.includes("PENDING_FINAL_VERIFICATION") && employeeRoutes.includes("PENDING_APPROVAL"), "Employee setup queue does not include pending setup/final verification/approval statuses");
check(api.includes("listEmployeeSetupQueue") && api.includes("/api/v1/employees/setup"), "frontend API helper for setup queue is missing");
check(setupPage.includes("Employee 360 Setup") && setupPage.includes("api.listEmployeeSetupQueue") && setupPage.includes("?setup=1"), "Employee 360 setup queue page is missing or does not open Employee 360 profiles");
check(appRoutes.includes('path="employees/setup"') && appRoutes.includes("LegacyOnboardingRedirect"), "App routes do not expose setup queue or redirect legacy onboarding routes");
check(appShell.includes("Employee Setup") && appShell.includes("/employees/setup") && !appShell.includes('label: "Onboarding", to: "/onboarding"'), "Sidebar still exposes old onboarding as the operational entry");
check(!employeesPage.includes("/onboarding/cases?case_id=") && employeesPage.includes("?setup=1"), "Employee list rows still route pending employees to old onboarding cases");
check(profilePage.includes("useSearchParams") && profilePage.includes('searchParams.get("setup") === "1"') && profilePage.includes("Run Final Verification"), "Employee profile does not support setup deep links/final verification panel");
check(searchRoute.includes("/employees/setup") && searchRoute.includes("Employee setup") && searchRoute.includes("`/employees/${row.employee_id}?setup=1`"), "Global search onboarding results do not route to Employee 360 setup");
check(dashboardRoute.includes("/employees/setup") && dashboardRoute.includes("PENDING_FINAL_VERIFICATION"), "Command Center setup KPIs/actions do not route to Employee 360 setup");
check(notificationRoute.includes("/employees/setup?legacy_case="), "Onboarding notifications do not route to Employee 360 setup fallback");

check(fs.existsSync(path.join(root, "docs", "production", "employee360-setup-rollout-phase5.md")), "Phase 5 rollout document is missing");
for (const doc of [
  "docs/user-guides/onboarding-offboarding-guide.md",
  "docs/user-guides/hr-operations-guide.md",
  "docs/user-guides/admin-configuration-guide.md",
  "docs/user-guides/employee-self-service-guide.md",
  "docs/user-guides/production-operations-runbook.md",
  "docs/production/phase13-manual-ui-workflow-checklist.md"
]) {
  const text = read(doc);
  check(text.includes("Employee 360 setup") || text.includes("Employee 360 Setup"), `${doc} does not mention Employee 360 setup rollout`);
}

const changedSource = [employeeRoutes, appRoutes, appShell, api, employeesPage, setupPage, profilePage, searchRoute, dashboardRoute, notificationRoute, migration, oneCaseVerifier, liveVerifier].join("\n");
check(!/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(changedSource), "browser alert/confirm/prompt was introduced");
check(!/dark:|prefers-color-scheme|useDarkMode/i.test(changedSource), "dark mode marker introduced");
check(wrangler.includes('binding = "DB"') && wrangler.includes('database_name = "hrm-v2"') && wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'), "D1 binding changed");
check(wrangler.includes('binding = "DOCUMENTS_BUCKET"') && wrangler.includes('bucket_name = "hrm-v2-documents"'), "R2 binding changed");
check(password.includes("100000"), "PBKDF2 iterations changed");

if (failures.length) {
  console.error("Employee 360 setup rollout verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Employee 360 setup rollout verification passed.");
