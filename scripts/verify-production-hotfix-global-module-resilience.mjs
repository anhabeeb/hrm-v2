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

function includes(file, marker, message) {
  const content = read(file);
  check(`${file}: ${message}`, marker instanceof RegExp ? marker.test(content) : content.includes(marker));
}

function excludes(file, marker, message) {
  const content = read(file);
  check(`${file}: ${message}`, marker instanceof RegExp ? !marker.test(content) : !content.includes(marker));
}

const packageJson = JSON.parse(read("package.json") || "{}");
const lifecyclePage = read("frontend/src/pages/LifecyclePage.tsx");
const employeeProfile = read("frontend/src/pages/EmployeeProfilePage.tsx");
const attendance = read("frontend/src/pages/AttendanceRecordsPage.tsx");
const reports = read("frontend/src/pages/ReportsPage.tsx");
const settings = read("frontend/src/pages/SettingsPage.tsx");
const selfService = read("frontend/src/pages/SelfServicePage.tsx");
const workspaceQuery = read("frontend/src/hooks/useWorkspaceQuery.ts");
const resilientQuery = read("frontend/src/hooks/useResilientWorkspaceQuery.ts");
const moduleSections = read("frontend/src/lib/moduleSectionLoading.ts");
const sectionRetry = read("frontend/src/lib/sectionRetryState.ts");
const preload = read("frontend/src/lib/preloadReferenceData.ts");
const useAppEvents = read("frontend/src/hooks/useAppEvents.ts");
const notificationBell = read("frontend/src/components/global/NotificationBell.tsx");
const lifecycleRoute = read("worker/src/routes/lifecycle.ts");
const optionalTimeout = read("worker/src/utils/optional-section-timeout.ts");
const workspaceResponse = read("worker/src/utils/workspace-response.ts");
const frontendTree = readTree("frontend/src");
const workerTree = readTree("worker/src");

check("package.json: verify:production-hotfix-global-module-resilience script is registered", packageJson.scripts?.["verify:production-hotfix-global-module-resilience"] === "node scripts/verify-production-hotfix-global-module-resilience.mjs");

for (const marker of [
  "useResilientWorkspaceQuery",
  "blockingError",
  "backgroundError",
  "hasCachedData",
  "sectionRetryState",
  "timeoutMs"
]) {
  check(`frontend/src/hooks/useResilientWorkspaceQuery.ts: missing ${marker}`, resilientQuery.includes(marker));
}

for (const marker of ["ModuleSectionStatus", "isNonBlockingSectionStatus", "sectionNeedsRetry", "sectionStatusLabel"]) {
  check(`frontend/src/lib/moduleSectionLoading.ts: missing ${marker}`, moduleSections.includes(marker));
}
for (const marker of ["isQuietOptionalSectionError", "REQUEST_ABORTED", "MODULE_DISABLED", "SUBMODULE_DISABLED", "createSectionRetryState"]) {
  check(`frontend/src/lib/sectionRetryState.ts: missing ${marker}`, sectionRetry.includes(marker));
}
for (const marker of ["runOptionalSectionWithTimeout", "Promise.race", "onLateFailure", "timeoutMs"]) {
  check(`worker/src/utils/optional-section-timeout.ts: missing ${marker}`, optionalTimeout.includes(marker));
}
for (const marker of ["workspaceRetryKey", "workspaceDeferredMessage"]) {
  check(`worker/src/utils/workspace-response.ts: missing ${marker}`, workspaceResponse.includes(marker));
}

check("onboarding must use the global resilient query helper", lifecyclePage.includes("useResilientWorkspaceQuery<Row>") && lifecyclePage.includes("workspaceSectionStatesForTab"));
check("Employee 360 shell must keep optional panels independent", employeeProfile.includes("useWorkspaceQuery<EmployeeProfileWorkspacePayload>") && employeeProfile.includes("catch(() => null)") && employeeProfile.includes("loadedTabs") && employeeProfile.includes("EmptyState title=\"Payroll unavailable\""));
check("attendance page must handle disabled/optional failures without blocking unrelated modules", attendance.includes("attendanceDisabled") && attendance.includes("MODULE_DISABLED") && attendance.includes("TableSkeleton"));
check("reports/import-export work must be background-job scoped", reports.includes("report export queued") && reports.includes("background job drawer") && reports.includes("Unable to queue report export"));
check("settings page must keep module settings available independently", settings.includes("SettingsToggleGroup") && settings.includes("Module toggles") && settings.includes("showApiError"));
check("self-service must hide disabled modules and ignore admin-only preload failures", selfService.includes("SELF_SERVICE_UNAVAILABLE") && selfService.includes("MODULE_DISABLED") && selfService.includes("ROSTER_SELF_SERVICE_DISABLED"));
check("workspace query must keep cached data during refresh", workspaceQuery.includes("placeholderData") && workspaceQuery.includes("background-refresh") && workspaceQuery.includes("cache-hit"));
check("reference preload 403/optional failures must stay quiet", preload.includes("quietPrefetch") && preload.includes("catch") && preload.includes("canPreloadPaymentInstitutions"));
check("app-events stream failure must not block modules", useAppEvents.includes("streamFallbackLocked") && useAppEvents.includes("pollFallback(\"stream-unhealthy\")"));
check("notification unread-count failure must not block modules", notificationBell.includes("failureBackoffActive()") && notificationBell.includes("notificationsUnavailable ? 0"));
const optionalLoaderStart = lifecycleRoute.indexOf("async function loadOptionalOnboardingWorkspaceSection");
const optionalLoader = optionalLoaderStart >= 0 ? lifecycleRoute.slice(optionalLoaderStart, lifecycleRoute.indexOf("async function ensureOnboardingModuleEnabled")) : "";
check("backend onboarding optional sections must skip disabled/unauthorized modules before query", optionalLoader.includes("DISABLED") && optionalLoader.includes("NO_PERMISSION") && optionalLoader.indexOf("DISABLED") < optionalLoader.indexOf("runOptionalSectionWithTimeout") && optionalLoader.indexOf("NO_PERMISSION") < optionalLoader.indexOf("runOptionalSectionWithTimeout"));
check("critical activation validation must remain fresh server-side", lifecycleRoute.includes("activateEmployeeFromOnboarding") && lifecycleRoute.includes("getEmployeeOnboardingReadiness"));
includes("worker/src/routes/app-events.ts", "applyCorsHeaders", "CORS stream hotfix remains");
includes("worker/src/utils/performance.ts", "private, no-store", "authenticated HR API data remains private/no-store");
excludes("worker/src/utils/performance.ts", /Cache-Control["',\s]+public/i, "authenticated HR API data must not become public cached");
includes("worker/wrangler.toml", 'binding = "DB"', "D1 binding remains DB");
includes("worker/wrangler.toml", 'binding = "DOCUMENTS_BUCKET"', "R2 binding remains DOCUMENTS_BUCKET");
includes("worker/src/auth/password.ts", "100000", "PBKDF2 iterations remain 100000");
check("frontend/worker source: browser alert/confirm/prompt must not be introduced", !/\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/.test(`${frontendTree}\n${workerTree}`));
check("frontend source: dark mode must not be introduced", !/\bdark:/i.test(frontendTree));

if (failures.length) {
  console.error("Production global module resilience hotfix verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Production global module resilience hotfix verification passed.");
