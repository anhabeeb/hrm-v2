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
const aggregator = read("worker/src/onboarding/section-readiness-aggregator.ts");
const lifecycle = read("worker/src/routes/lifecycle.ts");
const page = read("frontend/src/pages/LifecyclePage.tsx");
const api = read("frontend/src/lib/api.ts");
const sectionStatus = read("worker/src/onboarding/section-status.ts");
const evaluator = read("worker/src/onboarding/section-evaluators.ts");
const wrangler = read("worker/wrangler.toml");
const password = read("worker/src/auth/password.ts");

for (const helper of [
  "getFastOnboardingSectionReadiness",
  "rebuildAndAggregateOnboardingSectionReadiness",
  "rebuildStaleOrMissingOnboardingSectionReadiness",
  "compareOldAndSectionReadiness"
]) {
  check(`aggregator: ${helper} export exists`, aggregator.includes(`export async function ${helper}`) || aggregator.includes(`export function ${helper}`));
}

check("aggregator: uses setup section status table helpers", aggregator.includes("onboarding_setup_section_statuses") || aggregator.includes("getOnboardingSectionStatuses"));
check("aggregator: composes missing rows from registry", aggregator.includes("composeOnboardingSectionStatusRows") && aggregator.includes("getOnboardingSectionDefinitions"));
check("aggregator: uses bounded per-section evaluator execution", aggregator.includes("DEFAULT_SECTION_STATUS_TIMEOUT_MS") && aggregator.includes("Promise.race") && aggregator.includes("setTimeout"));
check("aggregator: timeout writes safe failed status", aggregator.includes("SECTION_STATUS_TIMEOUT") && aggregator.includes("status: \"failed\"") && aggregator.includes("retry readiness"));
check("aggregator: missing setup is not converted into generic failure", sectionStatus.includes("SECTION_NOT_EVALUATED") && evaluator.includes("return blocked("));
check("aggregator: disabled/optional sections remain not_required", evaluator.includes("return notRequired(") && aggregator.includes("status === \"not_started\""));
check("aggregator: display readiness uses candidate only and final verification", aggregator.includes("can_activate_candidate: status === \"ready\"") && aggregator.includes("can_activate: false") && aggregator.includes("activation_requires_final_verification: true"));
check("aggregator: does not import old heavy readiness or workspace loader", !aggregator.includes("getEmployeeOnboardingReadiness") && !aggregator.includes("loadOnboardingWorkspace"));

const refreshRoute = sliceBetween(lifecycle, 'onboardingRoutes.post("/cases/:caseId/refresh-readiness"', 'onboardingRoutes.post("/cases/:caseId/complete"');
check("refresh-readiness route exists", refreshRoute.length > 0);
check("refresh-readiness uses section-status rebuild/aggregate", refreshRoute.includes("rebuildStaleOrMissingOnboardingSectionReadiness") && refreshRoute.includes("mode: \"section_status\""));
check("refresh-readiness does not queue old readiness job in normal path", !refreshRoute.includes("queueOnboardingReadinessRefresh") && !refreshRoute.includes("ONBOARDING_READINESS_RECALCULATION"));
check("refresh-readiness does not load full workspace or old readiness", !refreshRoute.includes("loadOnboardingWorkspace") && !refreshRoute.includes("getEmployeeOnboardingReadiness"));
check("refresh-readiness returns terminal non-running state", refreshRoute.includes("readiness_updating: false") && refreshRoute.includes("status: \"completed\""));

const statusRoute = sliceBetween(lifecycle, 'onboardingRoutes.get("/cases/:caseId/readiness-status"', 'onboardingRoutes.get("/cases/:caseId/readiness"');
check("readiness-status route exists", statusRoute.length > 0);
check("readiness-status uses fast section readiness", statusRoute.includes("getFastOnboardingSectionReadiness") && statusRoute.includes("mode: \"section_status\""));
check("readiness-status is lightweight/no-store", statusRoute.includes('Cache-Control", "private, no-store"') && !statusRoute.includes("loadOnboardingWorkspace") && !statusRoute.includes("getEmployeeOnboardingReadiness"));
check("readiness-status exposes final verification guard", statusRoute.includes("activation_requires_final_verification") && statusRoute.includes("can_activate_candidate"));

const readinessRoute = sliceBetween(lifecycle, 'onboardingRoutes.get("/cases/:caseId/readiness"', 'onboardingRoutes.post("/cases/:caseId/submit-activation"');
check("readiness route exists", readinessRoute.length > 0);
check("readiness route defaults to section-status readiness", readinessRoute.includes("getFastOnboardingSectionReadiness") && readinessRoute.includes("rebuildStaleOrMissingOnboardingSectionReadiness"));
check("legacy comparison is explicit and diagnostic only", readinessRoute.includes("include_legacy_comparison") && readinessRoute.includes("compareOldAndSectionReadiness") && readinessRoute.includes("diagnostic_only"));
check("legacy comparison is bounded", readinessRoute.includes("timeoutMs: Math.min") && readinessRoute.includes("onboarding.readiness.legacy_comparison"));

const activationFunction = sliceBetween(lifecycle, "export async function activateEmployeeFromOnboarding", "export async function activateEmployeeWithOnboardingOverride");
check(
  "activation path remains server validated",
  activationFunction.includes("runOnboardingFinalVerificationForRoute") &&
    activationFunction.includes("verification.can_activate") &&
    !activationFunction.includes("can_activate_candidate")
);
check("frontend: setup readiness display exists", page.includes("Setup Readiness") && page.includes("data-setup-readiness-display"));
check("frontend: section-status readiness can update main display", page.includes("applySectionStatusUpdatePayload") && page.includes("applyReadinessPayload({ readiness })"));
check("frontend: activation does not use section-status candidate directly", page.includes("!boolValue(readiness.activation_requires_final_verification)") && !/canActivate\s*=\s*.*can_activate_candidate/.test(page));
check("frontend: ready message says final verification", page.includes("Ready for final server verification") && page.includes("Final verification required"));
check("frontend API: section readiness response is section_status", api.includes('mode: "section_status"') && api.includes("section_timings"));

check("diagnostic script registered", packageJson.scripts?.["diagnose:onboarding-section-readiness-aggregator"] === "node scripts/diagnose-onboarding-section-readiness-aggregator.mjs");
check("one-case repair script registered", packageJson.scripts?.["repair:onboarding-section-statuses-one-case"] === "node scripts/rebuild-onboarding-section-statuses-one-case.mjs");
check("phase 3 verifier registered", packageJson.scripts?.["verify:onboarding-section-readiness-aggregator"] === "node scripts/verify-onboarding-section-readiness-aggregator.mjs");
check("diagnostic script exists", fs.existsSync(path.join(root, "scripts/diagnose-onboarding-section-readiness-aggregator.mjs")));
check("one-case repair script requires confirmation", read("scripts/rebuild-onboarding-section-statuses-one-case.mjs").includes("HRM_REPAIR_CONFIRM") && read("scripts/rebuild-onboarding-section-statuses-one-case.mjs").includes("YES"));

check("D1 binding unchanged", wrangler.includes('binding = "DB"') && wrangler.includes('database_name = "hrm-v2"') && wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'));
check("R2 binding unchanged", wrangler.includes('binding = "DOCUMENTS_BUCKET"') && wrangler.includes('bucket_name = "hrm-v2-documents"'));
check("PBKDF2 remains 100000", password.includes("100000"));
check("no browser alert/confirm/prompt", !/\b(window\.)?(alert|confirm|prompt)\s*\(/.test([page, lifecycle].join("\n")));
check("dark mode not introduced", !/dark:|prefers-color-scheme|useDarkMode/i.test([page, lifecycle, aggregator].join("\n")));

if (failures.length) {
  console.error("Onboarding section readiness aggregator verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Onboarding section readiness aggregator verification passed.");
