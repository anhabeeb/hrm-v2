import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function has(relativePath, marker, message) {
  const text = read(relativePath);
  const ok = marker instanceof RegExp ? marker.test(text) : text.includes(marker);
  if (!ok) failures.push(`${relativePath}: ${message}`);
}

function hasAll(relativePath, markers, area) {
  for (const marker of markers) {
    has(relativePath, marker, `${area} missing ${String(marker)}`);
  }
}

function hasNo(relativePath, pattern, message) {
  const text = read(relativePath);
  if (pattern.test(text)) failures.push(`${relativePath}: ${message}`);
}

function listFiles(dir, extensions) {
  const absolute = path.join(root, dir);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { recursive: true })
    .filter((entry) => extensions.some((extension) => String(entry).endsWith(extension)))
    .map((entry) => path.join(dir, String(entry)).replaceAll("\\", "/"));
}

function requireScript(scriptName) {
  const pkg = JSON.parse(read("package.json"));
  if (!pkg.scripts?.[scriptName]) failures.push(`package.json: missing ${scriptName}`);
}

requireScript("verify:client-side-speed-polish");

hasAll("frontend/src/hooks/useAuth.tsx", [
  "bootstrapInflightRef",
  "meInflightRef",
  "loadCurrentUser",
  "api.getBootstrapStatus().finally",
  "api.me(savedToken).finally",
  "invalidateReferenceDataCache",
  "clearSession"
], "auth/session coalescing and cache invalidation");

hasAll("frontend/src/lib/referenceDataCache.ts", [
  "referenceDataCache",
  "getOrLoad",
  "inflight",
  "invalidateReferenceDataCache",
  "DEFAULT_REFERENCE_DATA_TTL_MS"
], "reference data cache utility");
hasAll("frontend/src/hooks/useReferenceData.ts", [
  "loadRef",
  "fallbackRef",
  "referenceDataCache.getOrLoad",
  "if (!token || !enabled) return fallbackRef.current"
], "reference data hook should reuse cached data and avoid disabled/no-token fetches");
hasNo("frontend/src/hooks/useReferenceData.ts", /\bsetData\(fallback\)/, "reference hook must not clear visible cached data when disabled or temporarily unavailable");
hasAll("frontend/src/pages/PayrollAdminPages.tsx", [
  "referenceDataCache",
  "referenceDataCache.getOrLoad(\"payroll:admin-reference-data\"",
  "api.listPayrollPeriods"
], "payroll admin reference data should be shared instead of refetched per page/modal");

const employeeProfile = read("frontend/src/pages/EmployeeProfilePage.tsx");
hasAll("frontend/src/pages/EmployeeProfilePage.tsx", [
  "loadedTabs",
  "tabLoading",
  "loadTabData",
  "TableSkeleton",
  "loadTabData(activeTab)",
  "loadTabData(\"User Access\", true)",
  "activeTab === \"Personal Info\"",
  "activeTab === \"Job Info\"",
  "activeTab === \"User Access\""
], "Employee 360 lazy tab loading");
const eagerLoadBlock = employeeProfile.split("const loadTabData")[0] ?? employeeProfile;
for (const forbidden of ["api.listEmployeeJobHistory", "api.getEmployeeUserAccess", "api.getEmployeeUserAccount", "api.listRoles", "api.listKycRequests"]) {
  if (eagerLoadBlock.includes(forbidden)) {
    failures.push(`frontend/src/pages/EmployeeProfilePage.tsx: ${forbidden} should be lazy-loaded by tab, not fetched during initial profile load`);
  }
}

hasAll("frontend/src/routes/AppRoutes.tsx", [
  "lazyPage",
  "measureAsync(`route chunk",
  "Page.preload",
  "registerRoutePreloader(\"employee-profile\"",
  "registerRoutePreloader(\"onboarding-case\"",
  "registerRoutePreloader(\"payroll-run-detail\""
], "route lazy loading and code-chunk preloading");
hasAll("frontend/src/lib/routePreload.ts", [
  "routePreloadRegistry",
  "routePreloadInflight",
  "preloadLikelyRoute",
  "requestIdleCallback",
  "moduleVisibility"
], "safe route preloading helper");
hasAll("frontend/src/components/employee/EmployeeIdentityCell.tsx", [
  "preloadLikelyRoute(\"employee-profile\"",
  "onMouseEnter={preloadProfile}",
  "onFocus={preloadProfile}"
], "employee profile route chunk preload on likely navigation");

hasAll("frontend/src/lib/performanceDiagnostics.ts", [
  "hrm_v2_perf_diagnostics",
  "measureAsync",
  "measurePerformance",
  "[hrm-perf]",
  "never include request payloads"
], "low-noise performance diagnostics");

hasAll("frontend/src/components/global/GlobalSearch.tsx", [
  "GLOBAL_SEARCH_DEBOUNCE_MS = 350",
  "cancelled",
  "lastFailedQueryRef",
  "retryBlockedUntilRef"
], "global search debounce and failure backoff must remain");
hasAll("frontend/src/components/filters/index.tsx", [
  "onDebouncedChange",
  "window.setTimeout"
], "standard search input debounce");
hasAll("frontend/src/components/filters/index.tsx", [
  "export function MoreFiltersSheet",
  "open",
  "children"
], "More Filters sheet should keep heavy options behind sheet open state");

hasAll("frontend/src/components/loading/index.ts", [
  "AppLoader",
  "PageLoader",
  "TableSkeleton",
  "CardSkeleton",
  "FormSkeleton",
  "LoadingButton"
], "professional loaders and skeletons");
hasAll("frontend/src/routes/AppRoutes.tsx", [
  "OperationalRouteGate",
  "ModuleDisabledState",
  "moduleEnabled(user?.module_visibility"
], "disabled module direct route handling");
hasAll("worker/src/utils/module-enforcement.ts", [
  "requireOperationalModuleEnabled",
  "requireOperationalSubmoduleEnabled",
  "filterDisabledOperationalModules"
], "disabled module backend sweep");

for (const script of [
  "verify:disabled-module-global-sweep",
  "verify:onboarding-dashboard-kpis",
  "verify:dependency-security-cleanup",
  "verify:professional-app-loader",
  "verify:global-popup-alerts",
  "verify:form-action-validation-hardening",
  "verify:employee-user-account-linking",
  "verify:import-export-standardization",
  "verify:button-color-standardization",
  "verify:frontend-static-assets",
  "verify:frontend-bundle-integrity",
  "verify:filter-search-date-standardization",
  "verify:command-center-dashboard"
]) {
  requireScript(script);
}

has("frontend/vite.config.ts", "manualChunks", "route-level code splitting must remain configured");
hasNo("frontend/vite.config.ts", /id\.includes\(["']react["']\)/, "React chunking must not use unsafe substring matching");
hasAll("frontend/public/_headers", [
  "/index.html",
  "Cache-Control: no-cache",
  "/assets/*",
  "Cache-Control: public, max-age=31536000, immutable"
], "frontend static cache headers");
hasAll("worker/wrangler.toml", [
  'binding = "DB"',
  'database_name = "hrm-v2"',
  'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"',
  'binding = "DOCUMENTS_BUCKET"',
  'bucket_name = "hrm-v2-documents"'
], "D1/R2 bindings");
has("worker/src/auth/password.ts", "100000", "PBKDF2 cap must remain 100000");
has("frontend/src/pages/DashboardPage.tsx", /<Accordion[\s\S]{0,120}type="single"[\s\S]{0,120}collapsible/, "Command Center accordion single-open behavior must not regress");

const frontendFiles = listFiles("frontend/src", [".ts", ".tsx"]);
for (const file of frontendFiles) {
  hasNo(file, /\b(window\.)?(alert|confirm|prompt)\s*\(/, "browser alert/confirm/prompt is not allowed");
  hasNo(file, /dark:/, "dark mode classes must not be introduced");
}

if (failures.length) {
  console.error("Client-side speed polish verifier failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Client-side speed polish verifier passed.");
