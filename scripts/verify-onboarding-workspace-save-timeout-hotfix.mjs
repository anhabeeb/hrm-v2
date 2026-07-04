import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function fail(message) {
  console.error(`Onboarding workspace save timeout hotfix verification failed: ${message}`);
  process.exit(1);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function routeSpan(source, route) {
  const index = source.indexOf(route);
  assert(index >= 0, `${route} route is missing`);
  const next = source.indexOf("\nonboardingRoutes.", index + route.length);
  return source.slice(index, next === -1 ? source.length : next);
}

const lifecycle = read("worker/src/routes/lifecycle.ts");
const api = read("frontend/src/lib/api.ts");
const apiClient = read("frontend/src/lib/apiClient.ts");
const lifecyclePage = read("frontend/src/pages/LifecyclePage.tsx");
const packageJson = JSON.parse(read("package.json"));
const wrangler = read("worker/wrangler.toml");

assert(lifecycle.includes("fastOnboardingWorkspaceSave"), "fastOnboardingWorkspaceSave helper is missing");
assert(lifecycle.includes("enqueueOnboardingPostSaveRefresh"), "background readiness refresh queue helper is missing");
assert(lifecycle.includes("timeOnboardingWorkspaceSave"), "save D1 timing helper is missing");
assert(lifecycle.includes("onboarding.workspace.save.fast_commit"), "safe save timing log marker is missing");
assert(lifecycle.includes("onboarding.workspace.save_background_refresh"), "background readiness refresh marker is missing");
assert(lifecycle.includes("readiness_refresh: readinessRefresh"), "fast save response does not expose readiness_refresh");
assert(lifecycle.includes("section_status"), "fast save response does not expose section_status");

const saveRoutes = [
  ["patch", "/cases/:caseId/employee-info", "employee_info"],
  ["patch", "/cases/:caseId/contact-info", "contact_info"],
  ["patch", "/cases/:caseId/job-assignment", "job_assignment"],
  ["post", "/cases/:caseId/documents/batch", "documents"],
  ["post", "/cases/:caseId/contracts", "contract"],
  ["patch", "/cases/:caseId/payroll-profile", "payroll_profile"],
  ["post", "/cases/:caseId/payment-methods", "payment_method"],
  ["post", "/cases/:caseId/pension-profile", "pension_profile"],
  ["post", "/cases/:caseId/biometric-mapping", "attendance_biometric"],
  ["post", "/cases/:caseId/assets-uniforms", "assets_uniforms"],
  ["post", "/cases/:caseId/user-account", "user_access"]
];

for (const [method, route, section] of saveRoutes) {
  const span = routeSpan(lifecycle, `onboardingRoutes.${method}("${route}"`);
  assert(!/workspace:\s*await\s+loadOnboardingWorkspace/.test(span), `${section} save still returns a full workspace reload`);
  assert(!/const\s+readiness\s*=\s*await\s+refreshWorkspaceReadiness/.test(span), `${section} save still waits for readiness refresh`);
  assert(span.includes("fastOnboardingWorkspaceSave") || section === "documents", `${section} save does not use fast save response`);
}

const paymentSpan = routeSpan(lifecycle, 'onboardingRoutes.post("/cases/:caseId/payment-methods"');
assert(paymentSpan.includes("existingPrimary"), "payment method retry does not reuse the existing active primary payment method");
assert(paymentSpan.includes("UPDATE employee_payment_methods SET payment_method_type"), "payment method retry does not update existing primary method");
assert(!/INSERT INTO employee_payment_methods[\s\S]*return ok\(c, \{ readiness, workspace \}/.test(paymentSpan), "payment method save can still block on readiness/workspace");

const payrollSpan = routeSpan(lifecycle, 'onboardingRoutes.patch("/cases/:caseId/payroll-profile"');
assert(payrollSpan.includes("ON CONFLICT(employee_id) DO UPDATE"), "payroll profile save is not duplicate-safe");
assert(!payrollSpan.includes("workspaceWithConfirmedReadiness"), "payroll profile save still waits for confirmed workspace");

const pensionSpan = routeSpan(lifecycle, 'onboardingRoutes.post("/cases/:caseId/pension-profile"');
assert(pensionSpan.includes("existing?.id ?? id(\"employee_pension_profile\")"), "pension profile retry does not reuse the active pension profile");
assert(!pensionSpan.includes("workspaceWithConfirmedReadiness"), "pension profile save still waits for confirmed workspace");

assert(api.includes("onboardingSaveRequestOptions"), "frontend onboarding save request wrapper is missing");
assert(api.includes('"X-Idempotency-Key"'), "frontend onboarding saves do not send idempotency keys");
assert(api.includes("timeoutMs") && api.includes("onboarding.workspace.save"), "frontend onboarding saves do not have bounded timeout labels");
assert(apiClient.includes("multipartRequest<T>") && apiClient.includes("createRequestSignal(undefined, options.timeoutMs"), "multipart save timeout handling is missing");

assert(lifecyclePage.includes("saveResponseQueuedReadiness"), "frontend does not treat queued readiness separately from save success");
assert(lifecyclePage.includes("readinessPendingConfirmation"), "frontend does not gate activation while readiness confirmation is pending");
assert(lifecyclePage.includes("data-onboarding-readiness-background-refresh"), "frontend scoped readiness updating panel is missing");
assert(lifecyclePage.includes("Your section save is complete. Activation stays disabled until readiness is confirmed."), "frontend does not show saved-before-readiness messaging");
assert(lifecyclePage.includes("setReadinessQueuedAt(Date.now())"), "frontend does not timestamp queued readiness refresh");
assert(lifecyclePage.includes("Date.parse(String(readiness.last_calculated_at"), "frontend does not clear pending state from fresh readiness timestamp");
assert(!/window\.(alert|confirm|prompt)\s*\(/.test(lifecyclePage), "browser alert/confirm/prompt is used in LifecyclePage");

assert(lifecycle.includes("terminal_states: [\"ready\", \"blocked\", \"stale\", \"failed\", \"refreshing\"]"), "readiness terminal state contract is missing from save response");
assert(lifecycle.includes("PAYMENT_INSTITUTIONS_DISABLED_FOR_BANK_TRANSFER"), "Bank Transfer payment institution validation regressed");
assert(lifecycle.includes("methodType === \"BANK_TRANSFER\""), "Cash/Bank Transfer payment validation branch is missing");
assert(lifecycle.includes("readiness: false"), "disabled/not-required module saves do not avoid unnecessary readiness blocking");

assert(packageJson.scripts?.["verify:onboarding-workspace-save-timeout-hotfix"] === "node scripts/verify-onboarding-workspace-save-timeout-hotfix.mjs", "package script verify:onboarding-workspace-save-timeout-hotfix is missing");
assert(packageJson.scripts?.["verify:onboarding-readiness-refreshing-hotfix"], "readiness refreshing hotfix verifier script registration is missing");
assert(packageJson.scripts?.["verify:onboarding-payroll-readiness-hotfix"], "payroll readiness hotfix verifier script registration is missing");

assert(wrangler.includes('binding = "DB"') && wrangler.includes('database_name = "hrm-v2"') && wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'), "D1 binding changed");
assert(wrangler.includes('binding = "DOCUMENTS_BUCKET"') && wrangler.includes('bucket_name = "hrm-v2-documents"'), "R2 binding changed");
assert(read("worker/src/auth/password.ts").includes("100000"), "PBKDF2 iteration count changed");

const frontendFiles = fs.readdirSync(path.join(root, "frontend", "src"), { recursive: true })
  .filter((file) => String(file).endsWith(".tsx") || String(file).endsWith(".ts"));
for (const file of frontendFiles) {
  const text = read(path.join("frontend", "src", String(file)));
  if (/\b(alert|confirm|prompt)\s*\(/.test(text) || /window\.(alert|confirm|prompt)\s*\(/.test(text)) {
    fail(`browser alert/confirm/prompt found in frontend/src/${String(file).replaceAll("\\", "/")}`);
  }
}

console.log("Onboarding workspace save timeout hotfix verification passed.");
