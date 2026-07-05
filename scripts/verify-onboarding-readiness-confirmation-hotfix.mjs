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
const performance = read("worker/src/utils/performance.ts");
const performanceMetrics = read("frontend/src/lib/performanceMetrics.ts");
const password = read("worker/src/auth/password.ts");
const wrangler = read("worker/wrangler.toml");

check(
  "package.json: verify:onboarding-readiness-confirmation-hotfix script is registered",
  packageJson.scripts?.["verify:onboarding-readiness-confirmation-hotfix"] === "node scripts/verify-onboarding-readiness-confirmation-hotfix.mjs"
);

check("backend: readiness refresh state uses stable job ids", lifecycle.includes("type OnboardingReadinessRefreshState") && lifecycle.includes("jobId: string") && lifecycle.includes("caseId: string"));
check("backend: readiness refresh is deduped by case id", lifecycle.includes("const onboardingReadinessRefreshInFlight = new Map<string, OnboardingReadinessRefreshState>()") && lifecycle.includes("isActiveOnboardingReadinessRefresh(existing)") && lifecycle.includes('reason: "already_queued"'));
check("backend: active refreshes cannot remain running indefinitely", lifecycle.includes("ONBOARDING_READINESS_REFRESH_MAX_RUNNING_MS") && lifecycle.includes('state.status = "failed"') && lifecycle.includes("READINESS_SECTION_TIMEOUT"));
check("backend: refresh uses waitUntil or immediate fallback", lifecycle.includes("executionCtx.waitUntil(safeTask)") && lifecycle.includes("else void safeTask"));
check("backend: stale workspace refresh shares deduped queue", lifecycle.includes('queueOnboardingReadinessRefresh(c, caseId, "onboarding.workspace.readiness_stale_refresh")') && !lifecycle.includes('runLifecycleBackgroundTask(c, refreshWorkspaceReadiness(c, caseId, undefined, "onboarding.workspace.readiness_stale_refresh")'));

const refreshRoute = sliceBetween(lifecycle, 'onboardingRoutes.post("/cases/:caseId/refresh-readiness"', 'onboardingRoutes.post("/cases/:caseId/complete"');
check("backend: refresh-readiness route exists", refreshRoute.length > 0);
check(
  "backend: refresh-readiness response returns trackable status fields",
  (refreshRoute.includes("onboardingReadinessRefreshPayload") && refreshRoute.includes("readiness_refresh") && refreshRoute.includes("queued.queued ? \"queued\"") && refreshRoute.includes("already_queued")) ||
    (refreshRoute.includes("readiness_refresh") && refreshRoute.includes('status: "completed"') && refreshRoute.includes("request_id") && refreshRoute.includes("section_timings"))
);
check("backend: refresh-readiness route does not run heavy readiness/workspace synchronously", !refreshRoute.includes("await refreshWorkspaceReadiness") && !refreshRoute.includes("loadOnboardingWorkspace"));

const statusRoute = sliceBetween(lifecycle, 'onboardingRoutes.get("/cases/:caseId/readiness-status"', 'onboardingRoutes.get("/cases/:caseId/readiness"');
check("backend: lightweight readiness-status endpoint exists", statusRoute.length > 0);
check("backend: readiness-status endpoint returns readiness and active job status", statusRoute.includes("active_refresh_job_id") && statusRoute.includes("active_refresh_status") && statusRoute.includes("readiness_refresh") && lifecycle.includes("poll_after_ms"));
check(
  "backend: readiness-status endpoint is lightweight and bounded",
  !statusRoute.includes("loadOnboardingWorkspace") &&
    !statusRoute.includes("getEmployeeOnboardingReadiness") &&
    (statusRoute.includes("cachedOnboardingReadinessFromCase") || statusRoute.includes("getFastOnboardingSectionReadiness"))
);
check("backend: readiness status endpoint is no-store", statusRoute.includes('Cache-Control", "private, no-store"'));
check("backend: readiness success emits targeted app event", lifecycle.includes('eventType: "onboarding.readiness.updated"') && lifecycle.includes('queryKeys: ["onboarding.workspace", "onboarding.readiness", "background-jobs"]'));
check("backend: readiness failure emits safe update event", lifecycle.includes("onboarding.readiness.failed") && lifecycle.includes("Onboarding readiness refresh failed"));
const activateFunction = sliceBetween(lifecycle, "export async function activateEmployeeFromOnboarding", "export async function activateEmployeeWithOnboardingOverride");
check("backend: activation remains server-validated", activateFunction.includes("runOnboardingFinalVerificationForRoute") && activateFunction.includes("verification.can_activate") && !activateFunction.includes("can_activate_candidate"));

check("frontend API: readiness-status helper exists", api.includes("getOnboardingReadinessStatus") && api.includes("/readiness-status") && api.includes("OnboardingReadinessStatusResponse"));
check("frontend: readiness job tracker state exists", lifecyclePage.includes("readinessRefreshJob") && lifecyclePage.includes("ReadinessRefreshTracker"));
check("frontend: Retry readiness is blocked while a tracked job is active", lifecyclePage.includes("if (readinessRetrying || readinessRefreshJob)") && lifecyclePage.includes("disabled={readinessRetrying || Boolean(readinessRefreshJob)}"));
check("frontend: polling tracks status endpoint instead of repeatedly posting refresh", lifecyclePage.includes("api.getOnboardingReadinessStatus(token, caseId") && lifecyclePage.includes("setReadinessRefreshJob(null)") && lifecyclePage.includes("Readiness confirmed"));
check("frontend: active readiness job keeps activation gated", lifecyclePage.includes("setReadinessPendingConfirmation(true)") && lifecyclePage.includes("disabled: !canActivate || readinessUpdating || readinessActiveRefresh || readinessNeedsManualRefresh"));
check("frontend: refresh-running label replaces repeated retry action", lifecyclePage.includes("Refresh running") && lifecyclePage.includes("Refreshing readiness...") && lifecyclePage.includes("Using last saved readiness. Refreshing in background..."));
check("frontend: status polling does not use background job list", !sliceBetween(lifecyclePage, "api.getOnboardingReadinessStatus", "}, [token").includes("backgroundJobsApi") && !sliceBetween(lifecyclePage, "api.getOnboardingReadinessStatus", "}, [token").includes("/background-jobs"));
check("frontend: targeted onboarding cache invalidation is retained", lifecyclePage.includes('slices: ["readiness", "document-checklist"]'));

check("frontend metrics: metrics are fire-and-forget and swallowed", performanceMetrics.includes("void flushPerformanceMetrics()") && performanceMetrics.includes("catch") && performanceMetrics.includes("Observability is best-effort"));
check("authenticated HR API data remains private/no-store", performance.includes("private, no-store") && !/Cache-Control["',\s]+public/i.test(performance));
check("CORS request-id hotfix remains", read("worker/src/utils/cors.ts").includes("x-request-id"));
check("notification fallback remains non-blocking", read("worker/src/routes/notifications.ts").includes("unreadCountFallback"));

for (const script of [
  "verify:onboarding-readiness-refreshing-hotfix",
  "verify:onboarding-save-stale-readiness-hotfix-v2",
  "verify:onboarding-workspace-save-timeout-hotfix",
  "verify:onboarding-payroll-readiness-hotfix",
  "verify:production-hotfix-onboarding-case-timeout",
  "verify:production-hotfix-global-module-resilience",
  "verify:production-hotfix-stream-notifications-preload"
]) {
  check(`package.json: accepted verifier ${script} remains registered`, Boolean(packageJson.scripts?.[script]));
}

check("worker/wrangler.toml: D1 binding unchanged", wrangler.includes('binding = "DB"') && wrangler.includes('database_name = "hrm-v2"') && wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'));
check("worker/wrangler.toml: R2 binding unchanged", wrangler.includes('binding = "DOCUMENTS_BUCKET"') && wrangler.includes('bucket_name = "hrm-v2-documents"'));
check("worker/src/auth/password.ts: PBKDF2 remains 100000", password.includes("100000"));
check("frontend/backend: no browser alert/confirm/prompt", !/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(lifecyclePage + lifecycle));
check("frontend: dark mode was not introduced", !/dark:|prefers-color-scheme|useDarkMode/i.test(lifecyclePage));

if (failures.length) {
  console.error("Onboarding readiness confirmation hotfix verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Onboarding readiness confirmation hotfix verification passed.");
