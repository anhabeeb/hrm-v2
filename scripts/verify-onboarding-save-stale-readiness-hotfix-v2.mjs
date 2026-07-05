import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function fail(message) {
  console.error(`Onboarding save stale-readiness hotfix V2 verification failed: ${message}`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function span(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert(start >= 0, `${startMarker} is missing`);
  const end = endMarker ? source.indexOf(endMarker, start + startMarker.length) : -1;
  return source.slice(start, end === -1 ? source.length : end);
}

const lifecycle = read("worker/src/routes/lifecycle.ts");
const schema = read("database/schema.sql");
const api = read("frontend/src/lib/api.ts");
const apiClient = read("frontend/src/lib/apiClient.ts");
const alerts = read("frontend/src/lib/alert-utils.ts");
const lifecyclePage = read("frontend/src/pages/LifecyclePage.tsx");
const packageJson = JSON.parse(read("package.json"));
const wrangler = read("worker/wrangler.toml");
const password = read("worker/src/auth/password.ts");

assert(schema.includes("CREATE TABLE IF NOT EXISTS onboarding_workspace_save_statuses"), "save-status table is missing from schema");
assert(schema.includes("UNIQUE (request_id)") && schema.includes("UNIQUE (idempotency_key)"), "save-status duplicate protection constraints are missing");
assert(schema.includes("readiness_refresh_status"), "save-status readiness refresh tracking is missing from schema");

assert(lifecycle.includes("onboardingRoutes.get(\"/cases/:caseId/save-status\""), "save-status reconciliation endpoint is missing");
assert(lifecycle.includes("findOnboardingSaveStatus") && lifecycle.includes("onboardingSaveStatusPayload"), "save-status lookup helpers are missing");
assert(lifecycle.includes("replayCommittedOnboardingWorkspaceSave"), "idempotent replay helper is missing");
assert(lifecycle.includes("onboardingRoutes.use(\"/cases/:caseId/*\""), "save route middleware hook is missing");
assert(lifecycle.includes("X-Idempotency-Key") && lifecycle.includes("idempotency-key"), "backend idempotency key header support is missing");

const fastSaveSpan = span(lifecycle, "async function fastOnboardingWorkspaceSave", "function where");
assert(fastSaveSpan.includes("recordOnboardingSaveCommitted"), "fast save does not record committed save status");
assert(fastSaveSpan.includes("scheduleOnboardingPostSaveRefresh"), "fast save does not schedule readiness refresh after commit");
assert(fastSaveSpan.indexOf("recordOnboardingSaveCommitted") < fastSaveSpan.indexOf("scheduleOnboardingPostSaveRefresh"), "readiness refresh is scheduled before save status is recorded");
assert(fastSaveSpan.includes("response_returned"), "fast save response timing marker is missing");
assert(!/workspace:\s*await\s+loadOnboardingWorkspace/.test(fastSaveSpan), "fast save response still waits for a full workspace reload");

const scheduleSpan = span(lifecycle, "function scheduleOnboardingPostSaveRefresh", "async function fastOnboardingWorkspaceSave");
assert(scheduleSpan.includes("updateOnboardingSaveReadinessStatus"), "background readiness status reconciliation updates are missing");
assert(scheduleSpan.includes("status: \"running\"") && scheduleSpan.includes("status: \"succeeded\"") && scheduleSpan.includes("status: \"failed\""), "background readiness terminal status updates are incomplete");
assert(scheduleSpan.includes("refreshWorkspaceReadiness"), "background refresh no longer calls readiness calculation");
assert(scheduleSpan.includes("optional_event_failed"), "optional event failures can still block save/readiness flow");

const refreshSpan = span(lifecycle, "async function refreshWorkspaceReadiness", "function runLifecycleBackgroundTask");
assert(refreshSpan.includes("onboarding.readiness.event_emit_failed"), "readiness app-event failure is not safely caught");
assert(refreshSpan.includes("getEmployeeOnboardingReadiness"), "readiness refresh no longer calculates readiness directly");

assert(lifecycle.includes("terminal_states: [\"ready\", \"blocked\", \"stale\", \"failed\", \"refreshing\"]"), "readiness terminal states are not exposed");
assert(lifecycle.includes("last_known_can_activate") && lifecycle.includes("last_calculated_at"), "stale readiness fallback metadata is missing");
assert(lifecycle.includes("failedOnboardingReadiness"), "failed readiness fallback is missing");

assert(api.includes("getOnboardingWorkspaceSaveStatus"), "frontend save-status API helper is missing");
assert(api.includes("request_id?: string") && api.includes("idempotency_key?: string"), "frontend save response does not expose request/idempotency ids");
assert(api.includes("onboarding.workspace.save-status"), "frontend save-status request label is missing");
assert(apiClient.includes("Save timed out. Checking whether your changes were saved"), "central timeout message was not updated");
assert(alerts.includes("Save timed out. Checking whether your changes were saved"), "global popup timeout message was not updated");
assert(lifecyclePage.includes("isOnboardingSaveTimeoutError"), "frontend timeout classifier is missing");
assert(lifecyclePage.includes("api.getOnboardingWorkspaceSaveStatus"), "frontend timeout reconciliation call is missing");
assert(lifecyclePage.includes("Save status could not be confirmed. Retry or refresh section."), "unconfirmed save status fallback message is missing");
assert(lifecyclePage.includes("Saved. Updating readiness..."), "frontend does not show saved-before-readiness state");
assert(lifecyclePage.includes("readinessPendingConfirmation"), "activation guard while readiness is pending is missing");

const refreshRoute = span(lifecycle, 'onboardingRoutes.post("/cases/:caseId/refresh-readiness"', 'onboardingRoutes.post("/cases/:caseId/complete"');
assert(refreshRoute.includes("queueOnboardingReadinessRefresh") && refreshRoute.includes("cachedOnboardingReadinessFromCase") && refreshRoute.includes("onboardingReadinessRefreshPayload"), "manual readiness refresh does not queue and return a tracked background refresh");
assert(refreshRoute.includes("readiness_updating: true") && refreshRoute.includes('queued.queued ? "queued"') && refreshRoute.includes("already_queued"), "manual readiness refresh does not return a queued/updating response");
assert(!refreshRoute.includes("refreshWorkspaceReadiness") && !refreshRoute.includes("loadOnboardingWorkspace") && !refreshRoute.includes("workspaceWithConfirmedReadiness"), "manual readiness refresh still waits for direct readiness/workspace reload");
const completeRoute = span(lifecycle, 'onboardingRoutes.post("/cases/:caseId/complete"', 'onboardingRoutes.get("/cases/:caseId"');
assert(completeRoute.includes("getEmployeeOnboardingReadiness") && completeRoute.includes("ONBOARDING_WORKSPACE_NOT_READY"), "activation submission no longer validates server-side readiness");
const activateRoute = span(lifecycle, 'onboardingRoutes.post("/cases/:caseId/activate"', 'onboardingRoutes.post("/cases/:caseId/activate-with-override"');
assert(activateRoute.includes("activateEmployeeFromOnboarding") && lifecycle.includes("if (!readiness?.can_activate) return { blocked: true, readiness };"), "activation no longer enforces server-side readiness");

assert(lifecycle.includes("methodType === \"BANK_TRANSFER\"") && lifecycle.includes("PAYMENT_INSTITUTIONS_DISABLED_FOR_BANK_TRANSFER"), "Bank Transfer payment institution validation regressed");
assert(lifecycle.includes("Cash payment method is complete."), "Cash payment readiness completion regressed");
assert(lifecycle.includes("Pension setup is not required because Pension is disabled.") || lifecycle.includes("Pension setup is not required because Payroll is disabled."), "disabled pension readiness completion regressed");
assert(lifecycle.includes("existingPrimary") && lifecycle.includes("UPDATE employee_payment_methods SET payment_method_type"), "payment method duplicate-safe save regressed");
assert(lifecycle.includes("existing?.id ?? id(\"employee_pension_profile\")"), "pension duplicate-safe save regressed");

assert(packageJson.scripts?.["verify:onboarding-save-stale-readiness-hotfix-v2"] === "node scripts/verify-onboarding-save-stale-readiness-hotfix-v2.mjs", "package verifier script is missing");
assert(packageJson.scripts?.["diagnose:onboarding-save-timeout-hotfix"] === "node scripts/diagnose-onboarding-save-timeout-hotfix.mjs", "package diagnostic script is missing");
assert(packageJson.scripts?.["verify:onboarding-save-failed-fetch-hotfix"], "failed-fetch hotfix verifier script is missing");

for (const [file, text] of [
  ["frontend/src/pages/LifecyclePage.tsx", lifecyclePage],
  ["frontend/src/lib/api.ts", api],
  ["frontend/src/lib/apiClient.ts", apiClient],
  ["frontend/src/lib/alert-utils.ts", alerts]
]) {
  assert(!/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(text), `browser alert/confirm/prompt found in ${file}`);
}

assert(wrangler.includes('binding = "DB"') && wrangler.includes('database_name = "hrm-v2"') && wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'), "D1 binding changed");
assert(wrangler.includes('binding = "DOCUMENTS_BUCKET"') && wrangler.includes('bucket_name = "hrm-v2-documents"'), "R2 binding changed");
assert(password.includes("100000"), "PBKDF2 iteration count changed");
assert(!/darkMode\s*:|className=.*dark:/.test(read("frontend/tailwind.config.ts")) && !/dark:/.test(lifecyclePage), "dark mode classes/config introduced in hotfix area");

console.log("Onboarding save stale-readiness hotfix V2 verification passed.");
