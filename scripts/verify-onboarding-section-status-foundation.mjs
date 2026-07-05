import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

function includesAll(source, markers) {
  return markers.every((marker) => source.includes(marker));
}

const schema = read("database/schema.sql");
const registry = read("worker/src/onboarding/section-status-registry.ts");
const helpers = read("worker/src/onboarding/section-status.ts");
const evaluators = read("worker/src/onboarding/section-evaluators.ts");
const lifecycle = read("worker/src/routes/lifecycle.ts");
const lifecyclePage = read("frontend/src/pages/LifecyclePage.tsx");
const api = read("frontend/src/lib/api.ts");
const wrangler = read("worker/wrangler.toml");
const password = read("worker/src/auth/password.ts");

const requiredSections = [
  "employee_info",
  "contact_emergency",
  "job_assignment",
  "contract",
  "documents",
  "payroll_profile",
  "payment_method",
  "pension",
  "user_access",
  "attendance_roster",
  "assets_uniforms",
  "approval_tasks"
];

const requiredIndexes = [
  "idx_onboarding_setup_section_statuses_case",
  "idx_onboarding_setup_section_statuses_employee",
  "idx_onboarding_setup_section_statuses_company",
  "idx_onboarding_setup_section_statuses_status",
  "idx_onboarding_setup_section_statuses_case_status",
  "idx_onboarding_setup_section_statuses_case_required_complete",
  "idx_onboarding_setup_section_statuses_case_stale"
];

check(schema.includes("CREATE TABLE IF NOT EXISTS onboarding_setup_section_statuses"), "onboarding_setup_section_statuses table is missing from schema.sql");
check(schema.includes("UNIQUE (case_id, section_key)"), "unique case_id + section_key constraint is missing");
for (const indexName of requiredIndexes) check(schema.includes(indexName), `${indexName} is missing`);
for (const status of ["not_started", "incomplete", "complete", "blocked", "not_required", "failed", "stale", "verified"]) {
  check(schema.includes(`'${status}'`), `status ${status} is missing from CHECK constraint`);
}

for (const key of requiredSections) check(registry.includes(`section_key: "${key}"`), `section registry missing ${key}`);
check(registry.includes("isOnboardingSectionModuleEnabled"), "disabled-module helper is missing");
check(registry.includes("pension") && registry.includes("assets_uniforms") && registry.includes("attendance"), "required module dependencies are missing from registry");
check(registry.includes('module_dependency: "payment_methods"') && registry.includes("require_payment_method_before_activation") && registry.includes("require_pension_profile_if_eligible_before_activation"), "required onboarding payment/pension setting fallbacks are missing");

for (const helper of [
  "getOnboardingSectionDefinitions",
  "upsertOnboardingSectionStatus",
  "getOnboardingSectionStatuses",
  "rebuildOnboardingSectionStatusesForCase",
  "aggregateOnboardingReadinessFromSections",
  "markOnboardingSectionStale",
  "sanitizeSectionStatusError"
]) {
  check(helpers.includes(`function ${helper}`) || helpers.includes(`function ${helper}(`) || helpers.includes(`async function ${helper}`), `${helper} helper is missing`);
}
check(!helpers.includes("loadOnboardingWorkspace"), "section status aggregator must not reload the full onboarding workspace");
check(helpers.includes("can_activate_candidate: false"), "shadow readiness must not enable activation");
check(helpers.includes("status === \"stale\"") && helpers.includes("stale_sections"), "stale status must block candidate readiness");
check(!/stack\s*:/i.test(helpers), "section status helper must not expose raw stack traces");

check(evaluators.includes("evaluateOnboardingSectionStatuses"), "section evaluators export is missing");
check(!evaluators.includes("loadOnboardingWorkspace"), "section evaluators must not reload the full onboarding workspace");
check(evaluators.includes("return blocked("), "missing setup must return blocked/incomplete");
check(evaluators.includes("return notRequired("), "disabled/optional setup must return not_required");
check(evaluators.includes("methodType === \"CASH\"") && evaluators.includes("payment_institution: \"not_required\""), "Cash payment must not require Payment Institution");
check(evaluators.includes("methodType === \"BANK_TRANSFER\"") && includesAll(evaluators, ["payment_institution_id", "bank_account_name", "bank_account_number"]), "Bank Transfer validation was weakened");
check(evaluators.includes("document_required_rules") && evaluators.includes("employee_type") && evaluators.includes("employment_type"), "local/foreign document rule filtering is missing");
check(evaluators.includes("sanitizeEvaluatorError"), "evaluator failure sanitization is missing");
check(!/error\.stack|stackTrace|raw_stack/i.test(evaluators), "evaluator failure may expose raw stack traces");

check(lifecycle.includes('onboardingRoutes.get("/cases/:caseId/section-readiness"'), "shadow section-readiness endpoint is missing");
check(lifecycle.includes('onboardingRoutes.post("/cases/:caseId/section-statuses/rebuild"'), "section statuses rebuild endpoint is missing");
check(lifecycle.includes("requireAnyPermission") && lifecycle.includes("getCaseEmployee(c, \"ONBOARDING\", caseId, \"view\")"), "shadow endpoint is not permission/scope protected");
check(lifecycle.includes("getCaseEmployee(c, \"ONBOARDING\", caseId, \"manage\")"), "rebuild endpoint is not manage-scoped");
check(lifecycle.includes("markOnboardingShadowSectionsStale"), "stale marking foundation is not wired into onboarding saves");
check(!lifecycle.includes("can_activate_candidate: true"), "Phase 1 must not use shadow readiness to enable activation");

check(api.includes("getOnboardingSectionReadiness") && api.includes("/section-readiness"), "frontend API helper for section readiness is missing");
check(api.includes("rebuildOnboardingSectionStatuses") && api.includes("/section-statuses/rebuild"), "frontend API helper for section rebuild is missing");
check(lifecyclePage.includes("Section Readiness Preview"), "frontend shadow preview is missing");
check(lifecyclePage.includes("data-shadow-readiness-preview") && lifecyclePage.includes("Preview only"), "frontend preview is not clearly marked shadow/preview");
check(lifecyclePage.includes("Activation still uses the existing server validation"), "frontend preview does not clarify activation is unchanged");

for (const marker of [
  "verify:onboarding-readiness-stuck-job-hotfix",
  "verify:onboarding-readiness-failed-hotfix",
  "verify:onboarding-readiness-confirmation-hotfix",
  "verify:onboarding-readiness-refreshing-hotfix",
  "verify:onboarding-save-stale-readiness-hotfix-v2",
  "verify:onboarding-workspace-save-timeout-hotfix",
  "verify:onboarding-payroll-readiness-hotfix"
]) {
  check(read("package.json").includes(marker), `${marker} script is missing`);
}

const changedFrontend = [lifecyclePage, api].join("\n");
check(!/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(changedFrontend), "browser alert/confirm/prompt was introduced");
check(!/\bdark:/.test([lifecyclePage, registry, helpers, evaluators].join("\n")), "dark mode classes were introduced");
check(wrangler.includes('binding = "DB"') && wrangler.includes('database_name = "hrm-v2"') && wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'), "D1 binding changed");
check(wrangler.includes('binding = "DOCUMENTS_BUCKET"') && wrangler.includes('bucket_name = "hrm-v2-documents"'), "R2 binding changed");
check(password.includes("100000"), "PBKDF2 iterations changed or could not be verified");

if (failures.length) {
  console.error("Onboarding section status foundation verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Onboarding section status foundation verification passed.");
