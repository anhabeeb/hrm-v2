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

function includes(file, marker, message) {
  const text = read(file);
  check(`${file}: ${message}`, marker instanceof RegExp ? marker.test(text) : text.includes(marker));
}

function excludes(file, marker, message) {
  const text = read(file);
  check(`${file}: ${message}`, marker instanceof RegExp ? !marker.test(text) : !text.includes(marker));
}

const packageJson = JSON.parse(read("package.json"));
const lifecycleRoute = read("worker/src/routes/lifecycle.ts");
const lifecyclePage = read("frontend/src/pages/LifecyclePage.tsx");
const moduleSectionLoading = read("frontend/src/lib/moduleSectionLoading.ts");
const api = read("frontend/src/lib/api.ts");
const performance = read("worker/src/utils/performance.ts");
const password = read("worker/src/auth/password.ts");
const wrangler = read("worker/wrangler.toml");

check("package.json: verify:onboarding-readiness-refreshing-hotfix script is registered", packageJson.scripts?.["verify:onboarding-readiness-refreshing-hotfix"] === "node scripts/verify-onboarding-readiness-refreshing-hotfix.mjs");

for (const marker of [
  'status: "stale"',
  'status: "failed"',
  'status: firstFailure ? "failed" : canActivate ? "ready" : "blocked"',
  "last_calculated_at",
  "is_stale",
  "refresh_status",
  "failed_reason",
  "refresh_job_id"
]) {
  check(`worker/src/routes/lifecycle.ts: readiness terminal metadata missing ${marker}`, lifecycleRoute.includes(marker));
}

for (const marker of [
  "deferredOnboardingReadiness(\"Activation readiness\", gate.row)",
  "failedOnboardingReadiness",
  "workspaceWithConfirmedReadiness",
  "queueOnboardingReadinessRefresh(c, caseId, \"onboarding.workspace.readiness_manual_retry\")",
  "cachedOnboardingReadinessFromCase(gate.row, state)",
  "onboarding.workspace.readiness_stale_refresh",
  "onboarding.readiness.updated",
  "onboarding.readiness.refresh.complete",
  "queryKeys: [\"onboarding.workspace\", \"onboarding.readiness\", \"background-jobs\"]"
]) {
  check(`worker/src/routes/lifecycle.ts: readiness reconciliation marker missing ${marker}`, lifecycleRoute.includes(marker));
}

check("worker/src/routes/lifecycle.ts: timeout fallback must not mark readiness as active refreshing", lifecycleRoute.includes('workspaceSectionState(readinessTimeout ? "STALE" : "DEFERRED"') && lifecycleRoute.includes("refreshing: !readinessTimeout"));
check("worker/src/routes/lifecycle.ts: manual refresh-readiness endpoint exists", lifecycleRoute.includes('/cases/:caseId/refresh-readiness') && lifecycleRoute.includes("onboarding.workspace.readiness_manual_retry"));
{
  const routeStart = lifecycleRoute.indexOf('onboardingRoutes.post("/cases/:caseId/refresh-readiness"');
  const routeEnd = lifecycleRoute.indexOf('onboardingRoutes.post("/cases/:caseId/complete"', routeStart);
  const refreshRoute = lifecycleRoute.slice(routeStart, routeEnd);
  check("worker/src/routes/lifecycle.ts: manual refresh-readiness queues instead of blocking", refreshRoute.includes("queueOnboardingReadinessRefresh") && refreshRoute.includes("readiness_updating: true") && !refreshRoute.includes("refreshWorkspaceReadiness") && !refreshRoute.includes("loadOnboardingWorkspace"));
}
check("worker/src/routes/lifecycle.ts: refresh-checklist returns readiness and confirmed workspace", lifecycleRoute.includes("onboarding.workspace.readiness_manual_refresh") && lifecycleRoute.includes("return ok(c, { refreshed: true, readiness, workspace })"));
check("worker/src/routes/lifecycle.ts: payroll/payment/pension saves queue readiness without blocking save", lifecycleRoute.includes("onboarding.workspace.payroll_profile_saved") && lifecycleRoute.includes("onboarding.workspace.payment_method_saved") && lifecycleRoute.includes("onboarding.workspace.pension_profile_saved") && lifecycleRoute.includes("fastOnboardingWorkspaceSave") && lifecycleRoute.includes("queueOnboardingReadinessRefresh") && lifecycleRoute.includes("onboarding.workspace.save_background_refresh"));

for (const marker of [
  "moduleStatuses.pension === false",
  "Pension setup is not required because Pension is disabled.",
  'methodType === "CASH"',
  "Payment institution is not required for Cash payment.",
  'methodType === "BANK_TRANSFER"',
  "Bank is required for Bank Transfer.",
  "Account name is required for Bank Transfer.",
  "Account number is required for Bank Transfer."
]) {
  check(`worker/src/routes/lifecycle.ts: payroll readiness regression marker missing ${marker}`, lifecycleRoute.includes(marker));
}

for (const marker of [
  'STALE"',
  'FAILED"',
  "sectionNeedsRetry",
  "sectionStatusLabel"
]) {
  check(`frontend/src/lib/moduleSectionLoading.ts: stale/failed section state missing ${marker}`, moduleSectionLoading.includes(marker));
}

for (const marker of [
  "refreshOnboardingWorkspaceReadiness",
  "onboardingActivationReadinessStatus",
  "readinessAllowsActivation",
  "readinessRefreshIsActive",
  "readinessRefreshMessage",
  "Retry readiness",
  "Refresh readiness",
  "setReadinessUpdating(false), 20000",
  "readinessNeedsManualRefresh",
  "disabled: !canActivate || readinessUpdating || readinessActiveRefresh || readinessNeedsManualRefresh",
  "api.refreshOnboardingWorkspaceReadiness(token, caseId)"
]) {
  check(`frontend/src/pages/LifecyclePage.tsx: readiness refreshing UI marker missing ${marker}`, lifecyclePage.includes(marker) || api.includes(marker));
}

const readinessStatusHelper = lifecyclePage.slice(
  lifecyclePage.indexOf("function onboardingActivationReadinessStatus"),
  lifecyclePage.indexOf("function readinessAllowsActivation")
);
check("frontend/src/pages/LifecyclePage.tsx: stale readiness must not enable activation", readinessStatusHelper.indexOf("raw === \"stale\"") >= 0 && readinessStatusHelper.indexOf("raw === \"stale\"") < readinessStatusHelper.indexOf("readiness.can_activate === true"));
check("frontend/src/pages/LifecyclePage.tsx: retry is scoped and does not require closing popup", lifecyclePage.includes("void refreshReadiness(false)") && !lifecyclePage.includes("window.location.reload"));
check("frontend/src/pages/LifecyclePage.tsx: global popup spam avoided for manual refresh", lifecyclePage.includes("refreshReadiness(showSuccess = false)") && lifecyclePage.includes("if (showSuccess && !stillRefreshing) alerts.showSuccess"));

includes("frontend/src/lib/api.ts", "/refresh-readiness", "frontend API exposes manual readiness refresh endpoint");
includes("frontend/src/lib/api.ts", "queued?: boolean", "manual readiness refresh exposes queued response metadata");
includes("frontend/src/lib/api.ts", "workspace?: Record<string, unknown>", "manual readiness refresh no longer requires full workspace payload");

includes("worker/src/utils/performance.ts", "private, no-store", "authenticated HR API data remains private/no-store");
excludes("worker/src/utils/performance.ts", /Cache-Control["',\s]+public/i, "authenticated HR API data must not become public cached");
includes("worker/src/utils/cors.ts", "x-request-id", "CORS request-id hotfix remains");
includes("worker/src/routes/app-events.ts", "poll", "stream fallback support remains");
includes("worker/src/routes/notifications.ts", "unreadCountFallback", "notification unread fallback remains");

excludes("frontend/src/pages/LifecyclePage.tsx", /\b(window\.)?(alert|confirm|prompt)\s*\(/, "changed UI must not use browser alert/confirm/prompt");
excludes("worker/src/routes/lifecycle.ts", /\b(window\.)?(alert|confirm|prompt)\s*\(/, "backend source must not use browser alert/confirm/prompt");
check("worker/wrangler.toml: D1 binding unchanged", wrangler.includes('binding = "DB"') && wrangler.includes('database_name = "hrm-v2"') && wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'));
check("worker/wrangler.toml: R2 binding unchanged", wrangler.includes('binding = "DOCUMENTS_BUCKET"') && wrangler.includes('bucket_name = "hrm-v2-documents"'));
check("worker/src/auth/password.ts: PBKDF2 iterations remain 100000", password.includes("100000"));
check("frontend: dark mode was not introduced in touched onboarding file", !/dark:|prefers-color-scheme|useDarkMode/i.test(lifecyclePage));

for (const script of [
  "verify:onboarding-payroll-readiness-hotfix",
  "verify:production-hotfix-onboarding-case-timeout",
  "verify:production-hotfix-global-module-resilience",
  "verify:production-hotfix-stream-notifications-preload"
]) {
  check(`package.json: regression verifier ${script} remains registered`, Boolean(packageJson.scripts?.[script]));
}

if (failures.length) {
  console.error("Onboarding readiness refreshing hotfix verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Onboarding readiness refreshing hotfix verification passed.");
