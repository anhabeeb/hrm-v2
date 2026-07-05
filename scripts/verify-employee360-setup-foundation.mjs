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

function sliceBetween(text, start, end) {
  const startIndex = text.indexOf(start);
  if (startIndex < 0) return "";
  const endIndex = end ? text.indexOf(end, startIndex + start.length) : -1;
  return text.slice(startIndex, endIndex > startIndex ? endIndex : undefined);
}

const packageJson = JSON.parse(read("package.json"));
const schema = read("database/schema.sql");
const seed = read("database/seed.sql");
const registry = read("worker/src/employee-setup/section-registry.ts");
const status = read("worker/src/employee-setup/section-status.ts");
const employeesRoute = read("worker/src/routes/employees.ts");
const lifecycleRoute = read("worker/src/routes/lifecycle.ts");
const oldOnboardingRegistry = read("worker/src/onboarding/section-status-registry.ts");
const oldOnboardingStatus = read("worker/src/onboarding/section-status.ts");
const api = read("frontend/src/lib/api.ts");
const profilePage = read("frontend/src/pages/EmployeeProfilePage.tsx");
const employeeTypes = read("frontend/src/types/employees.ts");
const wrangler = read("worker/wrangler.toml");
const password = read("worker/src/auth/password.ts");

const requiredSectionKeys = [
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

for (const key of requiredSectionKeys) {
  check(`registry contains ${key}`, registry.includes(`section_key: "${key}"`));
}

check("employee setup section table exists", schema.includes("CREATE TABLE IF NOT EXISTS employee_setup_section_statuses"));
check("employee setup table uses employee/section uniqueness", schema.includes("UNIQUE (employee_id, section_key)"));
check("employee setup table includes source case link", schema.includes("source_case_id TEXT"));
check("employee setup status enum includes verified/stale/not_required", schema.includes("'verified'") && schema.includes("'stale'") && schema.includes("'not_required'"));
for (const indexName of [
  "idx_employee_setup_section_statuses_employee",
  "idx_employee_setup_section_statuses_company",
  "idx_employee_setup_section_statuses_status",
  "idx_employee_setup_section_statuses_employee_status",
  "idx_employee_setup_section_statuses_employee_required_complete",
  "idx_employee_setup_section_statuses_employee_stale",
  "idx_employee_setup_section_statuses_source_case"
]) {
  check(`schema includes ${indexName}`, schema.includes(indexName));
}

check("PENDING_SETUP status seed exists", seed.includes("'PENDING_SETUP'") && seed.includes("Pending Setup"));
check("PENDING final verification/approval status seeds exist", seed.includes("'PENDING_FINAL_VERIFICATION'") && seed.includes("'PENDING_APPROVAL'"));
check("employee creation defaults to PENDING_SETUP when no status supplied", employeesRoute.includes('getStatusByKey(c.env.DB, "PENDING_SETUP")'));
check("employee creation keeps old draft fallback", employeesRoute.includes('getStatusByKey(c.env.DB, "DRAFT_ONBOARDING")'));

for (const helper of [
  "getEmployeeSetupSectionDefinitions",
  "upsertEmployeeSetupSectionStatus",
  "getEmployeeSetupSectionStatuses",
  "rebuildEmployeeSetupSectionStatuses",
  "aggregateEmployeeSetupReadiness",
  "markEmployeeSetupSectionStale",
  "sanitizeEmployeeSetupStatusError"
]) {
  check(`helper exists: ${helper}`, status.includes(`export async function ${helper}`) || status.includes(`export function ${helper}`));
}

check("helper composes missing status rows", status.includes("composeEmployeeSetupSectionStatusRows") && status.includes("SECTION_NOT_EVALUATED"));
check("activation remains shadow-only", status.includes("can_activate_candidate: false") && status.includes("activation_requires_final_verification: true") && status.includes("shadow_only: true"));
check("final verification section is blocking in phase 1", status.includes("final_server_verification") && status.includes("Final server verification has not run"));
check("disabled modules become not_required", status.includes("return notRequired") && status.includes("module or submodule is disabled"));
check("documents validation uses active required rules and employee type", status.includes("document_required_rules") && status.includes("employee_type") && status.includes("document_type_code"));
check("payment method handles CASH without bank details", status.includes('methodType === "CASH"') && status.includes("payment_institution: \"not_required\""));
check("bank transfer remains strict", status.includes('methodType === "BANK_TRANSFER"') && status.includes("bank_account_name") && status.includes("bank_account_number"));
check("pension disabled/not required can skip", status.includes("Pension is disabled or Payroll is disabled.") && status.includes("Pension setup is optional"));
check("assets uniforms disabled/not required can skip", status.includes("Assets & Uniforms are disabled.") && status.includes("Asset and uniform issue is optional"));
check("attendance/roster does not globally block payroll", status.includes("Attendance and Roster setup is disabled or not required.") && registry.includes('module_dependency: "payroll"'));
check("safe error sanitizer redacts sensitive terms", /password\|token\|secret\|document number\|account number\|bank account\|payroll amount/i.test(status));

const setupReadinessRoute = sliceBetween(employeesRoute, 'employeeRoutes.get("/:id/setup-readiness"', 'employeeRoutes.post("/:id/setup-sections/rebuild"');
const rebuildRoute = sliceBetween(employeesRoute, 'employeeRoutes.post("/:id/setup-sections/rebuild"', 'employeeRoutes.get("/:id"');
check("setup readiness endpoint exists", setupReadinessRoute.length > 0);
check("setup readiness endpoint enforces view scope", setupReadinessRoute.includes("requirePermission(\"employees.view\")") && setupReadinessRoute.includes("canAccessEmployee") && setupReadinessRoute.includes('"view"'));
check("setup readiness endpoint returns no activation switch", setupReadinessRoute.includes("activation_switched: false") && setupReadinessRoute.includes("activation_requires_final_verification: true"));
check("setup readiness endpoint uses no-store headers", setupReadinessRoute.includes('Cache-Control", "private, no-store"') && setupReadinessRoute.includes('Vary", "Origin"'));
check("rebuild endpoint exists", rebuildRoute.length > 0);
check("rebuild endpoint checks granular manage permissions", ["employees.update", "employees.lifecycle.manage", "onboarding.cases.manage", "onboarding.workspace.update"].every((permission) => rebuildRoute.includes(permission)));
check("rebuild endpoint enforces manage scope", rebuildRoute.includes("canAccessEmployee") && rebuildRoute.includes('"manage"'));
check("rebuild endpoint audits action", rebuildRoute.includes("employee.setup_sections.rebuilt"));
check("rebuild endpoint uses no-store headers", rebuildRoute.includes('Cache-Control", "private, no-store"') && rebuildRoute.includes('Vary", "Origin"'));
check("employee detail route remains after setup routes", employeesRoute.indexOf('"/:id/setup-readiness"') < employeesRoute.indexOf('employeeRoutes.get("/:id"'));

check("frontend API exposes setup readiness getter", api.includes("getEmployeeSetupReadiness") && api.includes("/setup-readiness"));
check("frontend API exposes setup sections rebuild", api.includes("rebuildEmployeeSetupSections") && api.includes("/setup-sections/rebuild"));
check("frontend response types exist", employeeTypes.includes("EmployeeSetupReadinessResponse") && employeeTypes.includes("EmployeeSetupSectionStatusRow"));
check("Employee 360 renders setup readiness panel", profilePage.includes("EmployeeSetupReadinessPanel") && profilePage.includes("Employee 360 setup readiness"));
check("Employee 360 fetches setup readiness without blocking core profile", profilePage.includes("api.getEmployeeSetupReadiness") && profilePage.includes(".catch(() => null)"));
check("Employee 360 rebuild action exists", profilePage.includes("api.rebuildEmployeeSetupSections") && profilePage.includes("Rebuild readiness"));
check("Employee 360 displays activation locked, not activation action", profilePage.includes("Activation locked") && !profilePage.includes("activateEmployeeFromEmployee360"));
check("PENDING_SETUP bypasses old 360 onboarding lock", profilePage.includes('"PENDING_SETUP"') && profilePage.includes("employee360SetupStatus"));

check("old onboarding registry remains present", oldOnboardingRegistry.includes("ONBOARDING_SECTION_DEFINITIONS") && oldOnboardingRegistry.includes('section_key: "employee_info"'));
check("old onboarding status helper remains present", oldOnboardingStatus.includes("rebuildOnboardingSectionStatusesForCase") && oldOnboardingStatus.includes("onboarding_setup_section_statuses"));
check("old onboarding activation routes remain present", lifecycleRoute.includes('onboardingRoutes.post("/cases/:caseId/final-verification"') && lifecycleRoute.includes("activateEmployeeFromOnboarding"));
check("Employee 360 setup does not replace onboarding activation authority", !employeesRoute.includes("activateEmployeeFromOnboarding") && !employeesRoute.includes("activation_status = 'ACTIVATED'"));

check("diagnostic script registered", packageJson.scripts?.["diagnose:employee-setup-sections"] === "node scripts/diagnose-employee-setup-sections.mjs");
check("verifier script registered", packageJson.scripts?.["verify:employee360-setup-foundation"] === "node scripts/verify-employee360-setup-foundation.mjs");
check("diagnostic script exists", fs.existsSync(path.join(root, "scripts/diagnose-employee-setup-sections.mjs")));

check("D1 binding unchanged", wrangler.includes('binding = "DB"') && wrangler.includes('database_name = "hrm-v2"') && wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'));
check("R2 binding unchanged", wrangler.includes('binding = "DOCUMENTS_BUCKET"') && wrangler.includes('bucket_name = "hrm-v2-documents"'));
check("PBKDF2 remains 100000", password.includes("100000"));
check("no browser alert/confirm/prompt", !/\b(window\.)?(alert|confirm|prompt)\s*\(/.test([profilePage, employeesRoute, registry, status].join("\n")));
check("dark mode not introduced", !/dark:|prefers-color-scheme|useDarkMode/i.test([profilePage, employeesRoute, registry, status].join("\n")));

if (failures.length) {
  console.error("Employee 360 setup foundation verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Employee 360 setup foundation verification passed.");
