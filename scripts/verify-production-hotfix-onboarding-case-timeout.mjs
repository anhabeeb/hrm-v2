import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`${relativePath}: missing required file`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function readTree(relativeDir) {
  const absoluteDir = path.join(root, relativeDir);
  if (!fs.existsSync(absoluteDir)) return "";
  const chunks = [];
  const stack = [absoluteDir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!["node_modules", "dist", "build", ".wrangler", ".git"].includes(entry.name)) stack.push(fullPath);
      } else if (/\.(ts|tsx|mjs|js|toml|sql|md|json)$/.test(entry.name)) {
        chunks.push(fs.readFileSync(fullPath, "utf8"));
      }
    }
  }
  return chunks.join("\n");
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

function includes(file, marker, message) {
  const content = read(file);
  check(`${file}: ${message}`, marker instanceof RegExp ? marker.test(content) : content.includes(marker));
}

function excludes(file, marker, message) {
  const content = read(file);
  check(`${file}: ${message}`, marker instanceof RegExp ? !marker.test(content) : !content.includes(marker));
}

const packageJson = JSON.parse(read("package.json") || "{}");
const lifecycleRoute = read("worker/src/routes/lifecycle.ts");
const lifecyclePage = read("frontend/src/pages/LifecyclePage.tsx");
const api = read("frontend/src/lib/api.ts");
const apiClient = read("frontend/src/lib/apiClient.ts");
const preload = read("frontend/src/lib/preloadReferenceData.ts");
const remotePhase21 = read("scripts/phase21-remote-d1-utils.mjs");
const frontendTree = readTree("frontend/src");
const workerTree = readTree("worker/src");

check("package.json: verify:production-hotfix-onboarding-case-timeout script is registered", packageJson.scripts?.["verify:production-hotfix-onboarding-case-timeout"] === "node scripts/verify-production-hotfix-onboarding-case-timeout.mjs");

for (const marker of [
  "runOptionalSectionWithTimeout",
  "ONBOARDING_WORKSPACE_OPTIONAL_SECTION_TIMEOUT_MS",
  "ONBOARDING_WORKSPACE_REQUIRED_SECTION_TIMEOUT_MS",
  "loadRequiredOnboardingWorkspaceSection",
  "workspaceDeferredMessage",
  "workspaceRetryKey",
  "TIMEOUT",
  "DEFERRED",
  "X-Onboarding-Workspace-Request-Id",
  "onboarding.workspace.open.start",
  "workspace_meta",
  "optional_section_states"
]) {
  check(`worker/src/routes/lifecycle.ts: missing onboarding timeout marker ${marker}`, lifecycleRoute.includes(marker));
}

check("worker/src/routes/lifecycle.ts: module status gates must be parallelized", lifecycleRoute.includes("Promise.all(moduleKeys.map") && lifecycleRoute.includes("paymentInstitutionsSettingEnabled"));
check("worker/src/routes/lifecycle.ts: checklist and readiness must be bounded before returning workspace", lifecycleRoute.includes('key: "checklist"') && lifecycleRoute.includes('key: "readiness"') && lifecycleRoute.includes("timeoutMs: 2200"));
const activateFunction = sliceBetween(lifecycleRoute, "export async function activateEmployeeFromOnboarding", "export async function activateEmployeeWithOnboardingOverride");
check("worker/src/routes/lifecycle.ts: activation must still validate fresh readiness server-side", lifecycleRoute.includes("runOnboardingFinalVerificationForRoute") && activateFunction.includes("verification.can_activate") && lifecycleRoute.includes("activateEmployeeFromOnboarding"));
const optionalLoaderStart = lifecycleRoute.indexOf("async function loadOptionalOnboardingWorkspaceSection");
const optionalLoader = optionalLoaderStart >= 0 ? lifecycleRoute.slice(optionalLoaderStart, lifecycleRoute.indexOf("async function ensureOnboardingModuleEnabled")) : "";
check("worker/src/routes/lifecycle.ts: disabled optional modules must skip queries early", optionalLoader.indexOf("options.moduleKey && options.moduleStatuses[options.moduleKey] === false") >= 0 && optionalLoader.indexOf("options.moduleKey && options.moduleStatuses[options.moduleKey] === false") < optionalLoader.indexOf("runOptionalSectionWithTimeout"));
check("worker/src/routes/lifecycle.ts: unauthorized optional modules must skip queries early", optionalLoader.indexOf("!hasAny(c, permissions)") >= 0 && optionalLoader.indexOf("!hasAny(c, permissions)") < optionalLoader.indexOf("runOptionalSectionWithTimeout"));
excludes("worker/src/routes/lifecycle.ts", /activeTab === "Checklist"|activeTab === "Approval Timeline"|ChecklistWorkspaceTable|Timeline items=\{asRows\(workspace\.events\)/, "onboarding workspace must not restore removed Checklist or Approval Timeline sections");

for (const marker of [
  "useResilientWorkspaceQuery<Row>",
  "timeoutMs: 12000",
  "Retry loading case",
  "workspaceSectionStatesForTab",
  "sectionNeedsRetry",
  "backgroundError: onboardingWorkspaceQuery.backgroundError",
  "Cached data remains visible",
  "Retry section",
  "Refreshing"
]) {
  check(`frontend/src/pages/LifecyclePage.tsx: missing progressive popup marker ${marker}`, lifecyclePage.includes(marker));
}

check("frontend/src/pages/LifecyclePage.tsx: first-load timeout must render retry state instead of endless blank shell", lifecyclePage.includes("onboardingWorkspaceQuery.timedOut") && lifecyclePage.includes("combinedError ? null : <FormSkeleton"));
check("frontend/src/pages/LifecyclePage.tsx: cached workspace refresh error must be scoped", lifecyclePage.includes("backgroundError: onboardingWorkspaceQuery.backgroundError") && lifecyclePage.includes("Workspace refresh did not finish"));
check("frontend/src/lib/api.ts: onboarding workspace API must accept timeout", api.includes("getOnboardingWorkspace(token: string, caseId: string, signal?: AbortSignal, timeoutMs = 12000)") && api.includes('requestLabel: "onboarding.workspace"'));
check("frontend/src/lib/apiClient.ts: request helper must pass timeoutMs through to apiClient", apiClient.includes("timeoutMs?: number") && apiClient.includes("apiClient.request<T>(path, { ...rest, signal: signal ?? undefined, token })"));

for (const marker of [
  "canPreloadPaymentInstitutions",
  "enabled: canPreloadPaymentInstitutions(input.user)",
  "catch",
  "moduleEnabled(input.user, \"documents\")",
  "moduleEnabled(input.user, \"document_compliance\")"
]) {
  check(`frontend/src/lib/preloadReferenceData.ts: background preload must stay quiet/gated (${marker})`, preload.includes(marker));
}

for (const table of [
  "employee_onboarding_cases",
  "employee_onboarding_tasks",
  "employee_documents",
  "document_required_rules",
  "document_upload_sessions",
  "payment_institutions",
  "employee_payment_methods",
  "background_jobs",
  "app_events"
]) {
  check(`scripts/phase21-remote-d1-utils.mjs: remote readiness should include ${table}`, remotePhase21.includes(`"${table}"`) || remotePhase21.includes(table));
}

includes("worker/src/utils/cors.ts", "x-request-id", "CORS request-id hotfix remains");
includes("worker/src/routes/app-events.ts", "poll", "stream fallback support remains in source tree");
includes("worker/src/routes/notifications.ts", "unreadCountFallback", "notification unread-count safe fallback remains");
includes("worker/src/utils/performance.ts", "private, no-store", "authenticated HR API data remains private/no-store");
excludes("worker/src/utils/performance.ts", /Cache-Control["',\s]+public/i, "authenticated HR API data must not become public cached");
includes("worker/wrangler.toml", 'binding = "DB"', "D1 binding remains DB");
includes("worker/wrangler.toml", 'database_name = "hrm-v2"', "D1 database name remains hrm-v2");
includes("worker/wrangler.toml", 'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"', "D1 database id remains unchanged");
includes("worker/wrangler.toml", 'binding = "DOCUMENTS_BUCKET"', "R2 binding remains DOCUMENTS_BUCKET");
includes("worker/wrangler.toml", 'bucket_name = "hrm-v2-documents"', "R2 bucket remains hrm-v2-documents");
includes("worker/src/auth/password.ts", "100000", "PBKDF2 iterations remain 100000");
check("frontend/worker source: browser alert/confirm/prompt must not be introduced", !/\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/.test(`${frontendTree}\n${workerTree}`));
check("frontend source: dark mode must not be introduced", !/\bdark:/i.test(frontendTree));

if (failures.length) {
  console.error("Production onboarding case timeout hotfix verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Production onboarding case timeout hotfix verification passed.");
