import fs from "node:fs";

const checks = [];

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function check(label, condition) {
  checks.push({ label, condition: Boolean(condition) });
}

function includesAll(text, values) {
  return values.every((value) => text.includes(value));
}

const workerIndex = read("worker/src/index.ts");
const corsUtil = read("worker/src/utils/cors.ts");
const httpUtil = read("worker/src/utils/http.ts");
const validation = read("worker/src/lib/validation.ts");
const lifecycle = read("worker/src/routes/lifecycle.ts");
const api = read("frontend/src/lib/api.ts");
const apiClient = read("frontend/src/lib/apiClient.ts");
const alertUtils = read("frontend/src/lib/alert-utils.ts");
const documentUploadApi = read("frontend/src/lib/documentUploadApi.ts");
const packageJson = JSON.parse(read("package.json"));
const wrangler = read("worker/wrangler.toml");

const saveRoutes = [
  ["PATCH", "/cases/:caseId/employee-info", "updateOnboardingWorkspaceEmployeeInfo"],
  ["PATCH", "/cases/:caseId/contact-info", "updateOnboardingWorkspaceContactInfo"],
  ["PATCH", "/cases/:caseId/job-assignment", "updateOnboardingWorkspaceJobAssignment"],
  ["POST", "/cases/:caseId/documents", "uploadOnboardingWorkspaceDocument"],
  ["POST", "/cases/:caseId/documents/batch", "uploadOnboardingWorkspaceDocumentBatch"],
  ["POST", "/cases/:caseId/documents/uploads/prepare", "prepareOnboardingDocumentUploads"],
  ["POST", "/cases/:caseId/documents/uploads/complete", "completeOnboardingDocumentUploads"],
  ["POST", "/cases/:caseId/contracts", "createOnboardingWorkspaceContract"],
  ["PATCH", "/cases/:caseId/payroll-profile", "updateOnboardingWorkspacePayrollProfile"],
  ["POST", "/cases/:caseId/payment-methods", "createOnboardingWorkspacePaymentMethod"],
  ["POST", "/cases/:caseId/pension-profile", "updateOnboardingWorkspacePensionProfile"],
  ["POST", "/cases/:caseId/biometric-mapping", "createOnboardingWorkspaceBiometricMapping"],
  ["POST", "/cases/:caseId/assets-uniforms", "saveOnboardingWorkspaceAssetsUniforms"],
  ["POST", "/cases/:caseId/user-account", "saveOnboardingWorkspaceUserAccount"],
  ["POST", "/cases/:caseId/refresh-checklist", "refreshOnboardingWorkspaceChecklist"],
  ["POST", "/cases/:caseId/refresh-readiness", "refreshOnboardingWorkspaceReadiness"],
  ["POST", "/cases/:caseId/complete", "completeOnboardingWorkspace"],
  ["POST", "/cases/:caseId/activate", "activateOnboardingCase"],
  ["POST", "/cases/:caseId/activate-with-override", "activateOnboardingCaseWithOverride"]
];

check("package script is registered", packageJson.scripts?.["verify:onboarding-save-failed-fetch-hotfix"] === "node scripts/verify-onboarding-save-failed-fetch-hotfix.mjs");

for (const source of [workerIndex, corsUtil]) {
  check("CORS allows idempotency headers used by onboarding saves", includesAll(source, ["X-Idempotency-Key", "x-idempotency-key", "Idempotency-Key", "idempotency-key"]));
  check("CORS keeps request-id headers", includesAll(source, ["X-Request-Id", "x-request-id"]));
  check("CORS allows production frontend origin without wildcard credentials", source.includes("https://hr.cafeasiana.com.mv") && !source.includes('"Access-Control-Allow-Origin": "*"'));
  check("CORS methods include OPTIONS/PATCH/POST", includesAll(source, ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"]));
}

check("OPTIONS preflight is handled before auth routes", workerIndex.indexOf('if (c.req.method === "OPTIONS")') < workerIndex.indexOf('app.route("/api/v1/auth"'));
check("Vary Origin is set in global CORS middleware", workerIndex.includes('c.header("Vary", "Origin")'));
check("error envelopes include request_id", httpUtil.includes("request_id: requestId") && validation.includes("request_id: requestId"));
check("error envelopes are JSON and no-store", httpUtil.includes("return c.json(payload, status)") && httpUtil.includes('c.header("Cache-Control", "private, no-store")'));
check("onboarding fast save response includes request_id", lifecycle.includes("request_id: requestId") && lifecycle.includes("onboarding.workspace.save.fast_commit"));
check("fast save keeps background readiness queued", lifecycle.includes("Saved. Updating activation readiness in the background.") && lifecycle.includes("runLifecycleBackgroundTask"));

for (const [method, route, frontendMethod] of saveRoutes) {
  const backendCall = `onboardingRoutes.${method.toLowerCase()}("${route}"`;
  check(`backend route exists for ${method} ${route}`, lifecycle.includes(backendCall));
  check(`frontend method exists for ${frontendMethod}`, api.includes(frontendMethod) || documentUploadApi.includes(frontendMethod));
}

check("frontend onboarding saves send idempotency key", api.includes("onboardingSaveRequestOptions") && api.includes('"X-Idempotency-Key"'));
check("frontend save timeout remains bounded", api.includes("timeoutMs = 10000"));
check("central API client classifies network errors", apiClient.includes("classifyFetchFailure") && apiClient.includes("Could not reach the server. Check connection or try again."));
check("central API client classifies timeout/abort", apiClient.includes("REQUEST_ABORTED") && apiClient.includes("Refresh this section before retrying"));
check("central API client passes response request id into ApiError", apiClient.includes("responseRequestId(response, requestId)") && apiClient.includes("requestId: errorRequestId"));
check("frontend alert mapper does not surface raw Failed to fetch", alertUtils.includes("Could not reach server") && alertUtils.includes("Could not reach the server. Check connection or try again.") && !alertUtils.includes('message: sanitizeAlertMessage(rawMessage)'));
check("invalid JSON response is classified", alertUtils.includes("Invalid server response") && apiClient.includes("INVALID_RESPONSE"));
check("document upload prepare/complete uses central API client classification", documentUploadApi.includes("apiClient.post") && !documentUploadApi.includes("fetch(`${API_BASE_URL}"));
check("onboarding save catch preserves form state by not clearing form data", lifecycle.includes("fastOnboardingWorkspaceSave") && api.includes("payment_method") && !read("frontend/src/pages/LifecyclePage.tsx").includes("setForm({})"));
check("payment method save remains idempotent/upsert-style", lifecycle.includes("existingPrimary") && lifecycle.includes("UPDATE employee_payment_methods") && lifecycle.includes("INSERT INTO employee_payment_methods"));
check("authenticated HR API data remains private/no-store", read("worker/src/utils/performance.ts").includes('"Cache-Control", "private, no-store"'));
check("stream CORS/request-id hotfix markers remain", read("worker/src/routes/app-events.ts").includes("getCorsHeaders") && corsUtil.includes("Last-Event-ID"));
check("D1 binding unchanged", wrangler.includes('binding = "DB"') && wrangler.includes('database_name = "hrm-v2"') && wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'));
check("R2 binding unchanged", wrangler.includes('binding = "DOCUMENTS_BUCKET"') && wrangler.includes('bucket_name = "hrm-v2-documents"'));
check("PBKDF2 remains 100000", read("worker/src/auth/password.ts").includes("const ITERATIONS = 100000"));

const browserPromptPattern = /\b(window\.)?(alert|confirm|prompt)\s*\(/;
for (const file of [
  "frontend/src/lib/apiClient.ts",
  "frontend/src/lib/alert-utils.ts",
  "frontend/src/pages/LifecyclePage.tsx"
]) {
  check(`${file} has no browser alert/confirm/prompt`, !browserPromptPattern.test(read(file)));
}

const failed = checks.filter((item) => !item.condition);
if (failed.length) {
  console.error("Onboarding save failed-fetch hotfix verification failed:");
  for (const item of failed) console.error(`- ${item.label}`);
  process.exit(1);
}

console.log(`Onboarding save failed-fetch hotfix verification passed (${checks.length} checks).`);
