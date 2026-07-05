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

const evaluators = read("worker/src/onboarding/section-evaluators.ts");
const sectionStatus = read("worker/src/onboarding/section-status.ts");
const lifecycle = read("worker/src/routes/lifecycle.ts");
const lifecyclePage = read("frontend/src/pages/LifecyclePage.tsx");
const api = read("frontend/src/lib/api.ts");
const documentUploadApi = read("frontend/src/lib/documentUploadApi.ts");
const registry = read("worker/src/onboarding/section-status-registry.ts");
const wrangler = read("worker/wrangler.toml");
const password = read("worker/src/auth/password.ts");
const packageJson = read("package.json");

const requiredSections = [
  "employee_info",
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
  "approval_tasks"
];

check(evaluators.includes("evaluateOnboardingSectionStatusesForKeys"), "section-scoped evaluator helper is missing");
check(evaluators.includes("requestedKeys") && evaluators.includes("selectedDefinitions"), "section-scoped evaluator does not filter selected section keys");
check(!evaluators.includes("loadOnboardingWorkspace"), "section evaluators must not reload full onboarding workspace");
check(sectionStatus.includes("updateOnboardingSectionStatusesForKeys"), "section status update helper is missing");
check(sectionStatus.includes("evaluateOnboardingSectionStatusesForKeys"), "status helper does not use scoped evaluator");
check(sectionStatus.includes("source-version") || sectionStatus.includes("section-status-phase2-save-integration"), "Phase 2 section status source marker is missing");
check(sectionStatus.includes("can_activate_candidate: false") && sectionStatus.includes("shadow_only: true"), "shadow readiness must not enable activation");
check(sectionStatus.includes("UNIQUE") === false || read("database/schema.sql").includes("UNIQUE (case_id, section_key)"), "section status uniqueness is missing");

check(lifecycle.includes("updateOnboardingSectionStatusAfterSave"), "save integration helper is missing from onboarding routes");
check(lifecycle.includes("section_status_update") && lifecycle.includes("shadow_readiness"), "save responses do not expose section_status_update/shadow_readiness");
check(lifecycle.includes("sectionStatusUpdate?: Record<string, unknown>"), "fast save input does not accept sectionStatusUpdate");
check(lifecycle.includes("warning: sectionStatusUpdate.warning"), "save warnings from section status integration are not propagated");

for (const section of requiredSections) {
  check(lifecycle.includes(`savedSectionKeys: ["${section}"]`), `${section} is not evaluated by a save route`);
}

check(includesAll(lifecycle, [
  'savedSectionKeys: ["employee_info"]',
  'staleSections.add("documents")',
  'staleSections.add("contract")',
  'staleSections.add("payroll_profile")'
]), "employee_info dependency stale marking is incomplete");
check(includesAll(lifecycle, [
  'savedSectionKeys: ["job_assignment"]',
  '"documents", "contract", "payroll_profile", "payment_method", "attendance_roster", "assets_uniforms", "approval_tasks"'
]), "job_assignment dependency stale marking is incomplete");
check(includesAll(lifecycle, [
  'savedSectionKeys: ["payroll_profile"]',
  'staleSectionKeys: ["payment_method", "pension"]'
]), "payroll_profile dependent sections are not marked stale");
check(includesAll(lifecycle, [
  'savedSectionKeys: ["payment_method"]',
  'staleSectionKeys: ["pension"]'
]), "payment_method dependent pension section is not marked stale");
check(lifecycle.includes("onboarding.workspace.documents_accelerated_uploaded") && lifecycle.includes("onboarding.workspace.documents_batch_uploaded") && lifecycle.includes("onboarding.workspace.document_uploaded"), "document upload flows are not covered by section status integration");
check(lifecycle.includes("updateOnboardingApprovalTasksSectionAfterTaskChange"), "approval task/status changes are not wired to approval_tasks");
check(lifecycle.includes("onboarding.task.completed") && lifecycle.includes("onboarding.task.waived") && lifecycle.includes("onboarding.task.reopened"), "approval task complete/waive/reopen events are not covered");

const saveHelperBody = lifecycle.slice(lifecycle.indexOf("async function updateOnboardingSectionStatusAfterSave"), lifecycle.indexOf("async function ensureLifecycleSelfOnlyScope"));
check(!saveHelperBody.includes("rebuildOnboardingSectionStatusesForCase"), "save integration helper must not rebuild every section");
check(saveHelperBody.includes("markOnboardingSectionStale"), "save integration helper does not mark dependent sections stale");
check(saveHelperBody.includes("upsertOnboardingSectionStatus") && saveHelperBody.includes('status: "failed"'), "save integration helper does not record safe failed status when shadow update fails");

const rebuildReferences = [...lifecycle.matchAll(/rebuildOnboardingSectionStatusesForCase/g)].length;
check(rebuildReferences <= 3, "full section rebuild appears to be used outside manual rebuild endpoints");
check(!/can_activate_candidate:\s*true/.test([sectionStatus, lifecycle].join("\n")), "shadow section readiness can enable activation");
check(!/readinessAllowsActivation\([^)]*sectionReadinessPreview/.test(lifecyclePage), "frontend activation uses section readiness preview");
check(lifecycle.includes("activateEmployeeFromOnboarding") && lifecycle.includes("getEmployeeOnboardingReadiness"), "old activation validation path appears to be removed");

check(lifecyclePage.includes("applySectionStatusUpdatePayload"), "frontend does not apply section_status_update from save response");
check(lifecyclePage.includes("section_status_update"), "frontend save response handling does not reference section_status_update");
check(lifecyclePage.includes("if (!sectionPreviewUpdated) void loadSectionReadinessPreview(false)") || lifecyclePage.includes("sectionPreviewUpdated"), "manual rebuild/refetch remains the only preview update path");
check((lifecyclePage.includes("Rebuild") || lifecyclePage.includes("Recheck")) && (lifecyclePage.includes("Preview only") || lifecyclePage.includes("Final verification required")), "manual rebuild/recheck or setup-readiness labeling regressed");
check(api.includes("section_status_update"), "frontend API save type is missing section_status_update");
check(documentUploadApi.includes("section_status_update"), "accelerated document upload type is missing section_status_update");

check(evaluators.includes("return blocked("), "missing setup must be blocked/incomplete, not failed");
check(evaluators.includes("return notRequired("), "disabled modules/submodules must return not_required");
check(evaluators.includes("methodType === \"CASH\"") && evaluators.includes("payment_institution: \"not_required\""), "Cash payment can require Payment Institution");
check(evaluators.includes("methodType === \"BANK_TRANSFER\"") && includesAll(evaluators, ["payment_institution_id", "bank_account_name", "bank_account_number"]), "Bank Transfer validation was weakened");
check(evaluators.includes("document_required_rules") && evaluators.includes("employee_type") && evaluators.includes("employment_type"), "local/foreign document filtering regressed");
check(registry.includes('module_dependency: "pension"') && registry.includes("require_pension_profile_if_eligible_before_activation"), "pension disabled/not_required registry behavior regressed");

check(packageJson.includes('"verify:onboarding-section-status-save-integration"'), "package script verify:onboarding-section-status-save-integration is missing");
check(packageJson.includes("diagnose:onboarding-section-statuses"), "diagnostic script is missing");

const changedSources = [lifecycle, lifecyclePage, api, documentUploadApi, evaluators, sectionStatus].join("\n");
check(!/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(changedSources), "browser alert/confirm/prompt was introduced");
check(!/\bdark:/.test(changedSources), "dark mode class was introduced");
check(wrangler.includes('binding = "DB"') && wrangler.includes('database_name = "hrm-v2"') && wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'), "D1 binding changed");
check(wrangler.includes('binding = "DOCUMENTS_BUCKET"') && wrangler.includes('bucket_name = "hrm-v2-documents"'), "R2 binding changed");
check(password.includes("100000"), "PBKDF2 iterations changed or could not be verified");

if (failures.length) {
  console.error("Onboarding section status save integration verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Onboarding section status save integration verification passed.");
