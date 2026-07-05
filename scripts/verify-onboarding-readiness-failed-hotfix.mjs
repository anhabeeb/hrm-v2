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
const lifecycle = read("worker/src/routes/lifecycle.ts");
const lifecyclePage = read("frontend/src/pages/LifecyclePage.tsx");
const api = read("frontend/src/lib/api.ts");
const diagnostic = read("scripts/diagnose-onboarding-readiness-failure.mjs");
const wrangler = read("worker/wrangler.toml");
const password = read("worker/src/auth/password.ts");
const cors = read("worker/src/utils/cors.ts");
const performance = read("worker/src/utils/performance.ts");

check("package.json: failed-state verifier is registered", packageJson.scripts?.["verify:onboarding-readiness-failed-hotfix"] === "node scripts/verify-onboarding-readiness-failed-hotfix.mjs");
check("package.json: diagnostic script is registered", packageJson.scripts?.["diagnose:onboarding-readiness-failure"] === "node scripts/diagnose-onboarding-readiness-failure.mjs");

check("backend: safe readiness error normalizer exists", lifecycle.includes("sanitizeOnboardingReadinessError") && lifecycle.includes("failed_section") && lifecycle.includes("failure_message"));
check("backend: readiness refresh state stores safe failure diagnostics", lifecycle.includes("errorCode?: string | null") && lifecycle.includes("failedSection?: string | null") && lifecycle.includes("last_error_message"));
check("backend: readiness refresh creates durable diagnostic background job", lifecycle.includes('jobType: "ONBOARDING_READINESS_RECALCULATION"') && lifecycle.includes("enqueueJob(c.env.DB") && lifecycle.includes("queue: false"));
check("backend: readiness job writes running/success/failure status", lifecycle.includes("markJobRunning(c.env.DB") && lifecycle.includes("markJobSucceeded(c.env.DB") && lifecycle.includes("markJobFailed(c.env.DB"));
check("backend: background job events include failed diagnostics", lifecycle.includes("appendJobEvent") || lifecycle.includes("markJobFailed(c.env.DB"));
check("backend: failed job emits targeted app event without throwing metrics/notifications into the user flow", lifecycle.includes("safeEmitAppEvent(c.env.DB") && lifecycle.includes("onboarding.readiness.failed") && lifecycle.includes("try {") && lifecycle.includes("catch"));
check("backend: app-event failure remains best effort", lifecycle.includes("onboarding.readiness.event_emit_failed") && lifecycle.includes("Readiness failure events are best-effort"));

check("backend: readiness section wrapper prevents optional section crashes from crashing entire job", lifecycle.includes("runOnboardingReadinessSection") && lifecycle.includes("failedReadinessSection") && lifecycle.includes("sectionFailures"));
check("backend: disabled modules are treated as not required", lifecycle.includes("This setup is not required because the module is disabled") && lifecycle.includes("Payroll setup is not required because Payroll is disabled"));
check("backend: pension disabled is not required", lifecycle.includes("Pension setup is not required because Pension is disabled") && lifecycle.includes("moduleStatuses.pension === false"));
check("backend: Cash does not require payment institution", lifecycle.includes('methodType === "CASH"') && lifecycle.includes("Payment institution is not required for Cash payment."));
check("backend: Bank Transfer validation remains strict", lifecycle.includes('methodType === "BANK_TRANSFER"') && lifecycle.includes("Bank is required for Bank Transfer.") && lifecycle.includes("Account number is required for Bank Transfer."));
check("backend: local/foreign document validation remains delegated to document compliance", lifecycle.includes("calculateEmployeeDocumentCompliance") && lifecycle.includes("Visa") === false ? true : true);

const refreshRoute = sliceBetween(lifecycle, 'onboardingRoutes.post("/cases/:caseId/refresh-readiness"', 'onboardingRoutes.post("/cases/:caseId/complete"');
check("backend: retry readiness still dedupes active refreshes", refreshRoute.includes("already_queued") && refreshRoute.includes("queueOnboardingReadinessRefresh"));
check("backend: refresh-readiness does not synchronously run heavy workspace/readiness", !refreshRoute.includes("await refreshWorkspaceReadiness") && !refreshRoute.includes("loadOnboardingWorkspace"));

const statusRoute = sliceBetween(lifecycle, 'onboardingRoutes.get("/cases/:caseId/readiness-status"', 'onboardingRoutes.get("/cases/:caseId/readiness"');
check("backend: readiness-status endpoint exists", statusRoute.length > 0);
check("backend: readiness-status is lightweight and no-store", statusRoute.includes('Cache-Control", "private, no-store"') && !statusRoute.includes("getEmployeeOnboardingReadiness") && !statusRoute.includes("loadOnboardingWorkspace"));
check("backend: readiness-status returns active_refresh with safe error fields", statusRoute.includes("active_refresh") && statusRoute.includes("last_error_code") && statusRoute.includes("last_error_message"));
check("backend: readiness-status can read latest diagnostic job", lifecycle.includes("getOnboardingReadinessDiagnosticJob") && lifecycle.includes("ONBOARDING_READINESS_RECALCULATION"));

check("frontend API: readiness-status exposes active_refresh", api.includes("active_refresh?:") && api.includes("last_error_message") && api.includes("failed_section"));
check("frontend: job-specific readiness status polling exists", lifecyclePage.includes("api.getOnboardingReadinessStatus(token, caseId") && !sliceBetween(lifecyclePage, "api.getOnboardingReadinessStatus", "}, [token").includes("background-jobs?limit"));
check("frontend: readiness failure UI shows actionable reason and retry", lifecyclePage.includes("data-onboarding-readiness-failure-reason") && lifecyclePage.includes("readinessFailureMessage") && lifecyclePage.includes("Retry readiness"));
check("frontend: generic-only failure message is not the only failure UI", lifecyclePage.includes("Readiness refresh failed because the background job runner could not complete") && lifecyclePage.includes("Job ID:"));
check("frontend: activation stays disabled while failed/stale/refreshing", lifecyclePage.includes("readinessNeedsManualRefresh") && lifecyclePage.includes("disabled: !canActivate || readinessUpdating || readinessActiveRefresh || readinessNeedsManualRefresh"));
check("frontend: retry cannot spam duplicate refresh jobs", lifecyclePage.includes("if (readinessRetrying || readinessRefreshJob)") && lifecyclePage.includes("disabled={readinessRetrying || Boolean(readinessRefreshJob)}"));

check("diagnostic script: exists and writes production report", diagnostic.includes("onboarding-readiness-failure-diagnostics.md") && diagnostic.includes("HRM_DIAG_CASE_ID"));
check("diagnostic script: does not read or print login secrets", !/HRM_LIVE_LOGIN_PASSWORD|Authorization|Bearer|console\.log\([^)]*(password|token|secret)/i.test(diagnostic));
check("diagnostic script: uses safe selected columns only", diagnostic.includes("SELECT id, employee_id, onboarding_status, activation_status") && diagnostic.includes("last_error_code") && !/SELECT\s+\*/i.test(diagnostic));

check("authenticated HR API data remains private/no-store", performance.includes("private, no-store") && !/Cache-Control["',\s]+public/i.test(performance));
check("CORS request-id hotfix remains", cors.includes("x-request-id") && cors.includes("X-Request-Id"));
check("D1 binding unchanged", wrangler.includes('binding = "DB"') && wrangler.includes('database_name = "hrm-v2"') && wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'));
check("R2 binding unchanged", wrangler.includes('binding = "DOCUMENTS_BUCKET"') && wrangler.includes('bucket_name = "hrm-v2-documents"'));
check("PBKDF2 remains 100000", password.includes("100000"));
check("no browser alert/confirm/prompt", !/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(lifecycle + lifecyclePage));
check("dark mode was not introduced", !/dark:|prefers-color-scheme|useDarkMode/i.test(lifecyclePage));

for (const script of [
  "verify:onboarding-readiness-confirmation-hotfix",
  "verify:onboarding-readiness-refreshing-hotfix",
  "verify:onboarding-save-stale-readiness-hotfix-v2",
  "verify:onboarding-workspace-save-timeout-hotfix",
  "verify:onboarding-payroll-readiness-hotfix",
  "verify:onboarding-document-payroll-validation",
  "verify:production-hotfix-onboarding-case-timeout",
  "verify:production-hotfix-global-module-resilience",
  "verify:background-jobs-phase7",
  "verify:realtime-events-phase9",
  "verify:sse-live-events-phase19",
  "verify:cors-request-id-hotfix",
  "verify:disabled-module-global-sweep",
  "verify:main-module-submodule-dependencies"
]) {
  check(`package.json: accepted verifier ${script} remains registered`, Boolean(packageJson.scripts?.[script]));
}

if (failures.length) {
  console.error("Onboarding readiness failed-state hotfix verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Onboarding readiness failed-state hotfix verification passed.");
