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
  const content = read(file);
  const ok = marker instanceof RegExp ? marker.test(content) : content.includes(marker);
  check(`${file}: ${message}`, ok);
}

function excludes(file, marker, message) {
  const content = read(file);
  const ok = marker instanceof RegExp ? !marker.test(content) : !content.includes(marker);
  check(`${file}: ${message}`, ok);
}

function readTree(relativeDir) {
  const absoluteDir = path.join(root, relativeDir);
  if (!fs.existsSync(absoluteDir)) {
    failures.push(`${relativeDir}: missing required directory`);
    return "";
  }
  const chunks = [];
  const stack = [absoluteDir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (/\.(ts|tsx)$/.test(entry.name)) {
        chunks.push(fs.readFileSync(fullPath, "utf8"));
      }
    }
  }
  return chunks.join("\n");
}

const rootPackage = JSON.parse(read("package.json"));
const frontendPackage = JSON.parse(read("frontend/package.json"));
const app = "frontend/src/app/App.tsx";
const api = "frontend/src/lib/api.ts";
const apiClient = "frontend/src/lib/apiClient.ts";
const queryClient = "frontend/src/lib/queryClient.ts";
const queryKeys = "frontend/src/lib/queryKeys.ts";
const useApiQuery = "frontend/src/hooks/useApiQuery.ts";
const useApiMutation = "frontend/src/hooks/useApiMutation.ts";
const preload = "frontend/src/lib/preloadReferenceData.ts";
const auth = "frontend/src/hooks/useAuth.tsx";
const referenceHook = "frontend/src/hooks/useReferenceData.ts";
const frontendPerformance = "frontend/src/lib/performance.ts";
const debugFlags = "frontend/src/lib/debugFlags.ts";
const workerPerformance = "worker/src/utils/performance.ts";
const workerMiddleware = "worker/src/middleware/performance.ts";
const workerIndex = "worker/src/index.ts";
const workerTypes = "worker/src/types.ts";
const password = "worker/src/auth/password.ts";
const wrangler = "worker/wrangler.toml";
const lifecyclePage = "frontend/src/pages/LifecyclePage.tsx";
const seed = "database/seed.sql";

check("frontend/package.json: @tanstack/react-query dependency is present", Boolean(frontendPackage.dependencies?.["@tanstack/react-query"]));
check("package.json: verify:global-instant-performance-foundation script is registered", rootPackage.scripts?.["verify:global-instant-performance-foundation"] === "node scripts/verify-global-instant-performance-foundation.mjs");

includes(app, "QueryClientProvider", "QueryClientProvider is mounted");
includes(app, "client={queryClient}", "stable singleton QueryClient is used");
excludes(app, /new\s+QueryClient\s*\(/, "QueryClient is not recreated in App render");
includes(queryClient, "export const queryClient = new QueryClient", "singleton QueryClient is created outside render");
includes(queryClient, "DEFAULT_SERVER_STATE_STALE_TIME_MS", "normal server-state stale time is configured");
includes(queryClient, "REFERENCE_DATA_STALE_TIME_MS", "longer reference stale time is configured");
includes(queryClient, "refetchOnWindowFocus: false", "window focus refetch is controlled");
includes(queryClient, "retry: (failureCount, error)", "query retry policy is explicit and safe");
includes(queryClient, "mutations", "mutation defaults are configured");
includes(queryClient, "retry: false", "mutations do not blindly retry writes");
includes(queryClient, "clearQueryCacheForSessionChange", "query cache clear helper exists");
includes(queryClient, "queryClient.clear()", "logout/scope cache clear empties query cache");
includes(queryClient, "invalidateReferenceQueries", "targeted reference invalidation helper exists");

includes(queryKeys, "createQueryScope", "query scope helper exists");
includes(queryKeys, "tenant", "query keys include tenant/company scope");
includes(queryKeys, "userId", "query keys include user scope");
includes(queryKeys, "session", "query keys include session scope");
includes(queryKeys, "permissionScope", "query keys include permission/scope hash");
includes(queryKeys, "moduleVisibility", "module visibility key exists");
includes(queryKeys, "documentRequiredRules", "document required-rule reference key exists");
includes(queryKeys, "paymentInstitutions", "payment institution reference key exists");
includes(queryKeys, "approvalWorkflows", "approval workflow reference key exists");

includes(auth, "clearQueryCacheForSessionChange(\"logout\")", "logout clears query cache");
includes(auth, "clearQueryCacheForSessionChange(\"permission-change\")", "permission changes clear query cache");
includes(auth, "clearQueryCacheForSessionChange(\"scope-change\")", "scope/session changes clear query cache");
includes(auth, "preloadGlobalReferenceData", "auth triggers reference preload");
includes(auth, "queryScopeSignature", "auth tracks query scope signature");
includes(auth, "queryClient.setQueryData", "auth seeds current-user query data");

includes(apiClient, "export const apiClient", "central typed API client is exported");
includes(apiClient, "get<T>", "typed GET method exists");
includes(apiClient, "post<T>", "typed POST method exists");
includes(apiClient, "patch<T>", "typed PATCH method exists");
includes(apiClient, "delete<T>", "typed DELETE method exists");
includes(apiClient, "AbortSignal", "API client supports AbortSignal/cancellation");
includes(apiClient, "API_REQUEST_TIMEOUT_MS", "API client supports timeout handling");
includes(apiClient, "X-Request-ID", "API client sends request correlation id");
includes(apiClient, "recordApiRequestTiming", "API client records request duration");
includes(apiClient, "Server-Timing", "API client captures server timing");
includes(apiClient, "hrm-v2-session-expired", "session-expired handling is preserved");
includes(apiClient, "hrm-v2-api-permission-error", "permission response handling event exists");
includes(apiClient, "hrm-v2-module-disabled", "module-disabled response handling event exists");
includes(apiClient, "inflightGetRequests", "GET in-flight dedupe map exists");
includes(apiClient, "method === \"GET\"", "dedupe is limited to GET requests");
includes(apiClient, "dedupe !== false", "dedupe can be disabled");
includes(apiClient, "dedupe: false", "write helpers disable dedupe");
includes(apiClient, "if (key) inflightGetRequests.delete(key)", "failed/finished requests clear inflight map");
includes(apiClient, "cache: method === \"GET\" ? \"no-store\"", "authenticated GETs are not public/browser cached");
includes(apiClient, "multipartRequest", "uploads remain separate from deduped writes");
excludes(apiClient, /method === "POST"[\s\S]{0,120}inflightGetRequests\.set/, "POST requests are not added to GET dedupe map");
includes(api, "export { API_BASE_URL, ApiError, apiClient } from \"./apiClient\"", "broad API keeps API-client compatibility exports");

includes(useApiQuery, "placeholderData", "stale-while-revalidate/keep-previous-data helper exists");
includes(useApiQuery, "previousData", "cached previous data is preserved during background refresh");
includes(referenceHook, "useApiQuery", "reference hook uses TanStack Query");
includes(referenceHook, "REFERENCE_DATA_STALE_TIME_MS", "reference hook applies longer stale time");
includes(referenceHook, "refreshing", "reference hook exposes background refresh state");
includes(referenceHook, "referenceDataCache.getOrLoad", "legacy reference cache remains compatible");

includes(preload, "preloadGlobalReferenceData", "global reference preload helper exists");
includes(preload, "prefetchQuery", "preload uses QueryClient prefetch");
includes(preload, "api.getSyncBootstrap", "module visibility/settings are preloaded");
includes(preload, "api.listDepartments", "departments preload exists");
includes(preload, "api.listPositions", "positions preload exists");
includes(preload, "api.listJobLevels", "job levels preload exists");
includes(preload, "api.listLocations", "locations preload exists");
includes(preload, "api.listDocumentTypes", "document types preload exists");
includes(preload, "api.listDocumentRequiredRules", "document required rules preload exists");
includes(preload, "api.listPaymentInstitutions", "payment institutions preload exists");
includes(preload, "api.listApprovalWorkflows", "approval workflows preload exists");
includes(preload, "api.listLeaveTypes", "leave types preload exists");
includes(preload, "moduleEnabled", "preload respects disabled modules");
includes(preload, "catch", "failed preload is swallowed quietly");

includes(useApiMutation, "useOptimisticApiMutation", "safe optimistic mutation helper exists");
includes(useApiMutation, "createSnapshot", "optimistic helper stores rollback snapshot");
includes(useApiMutation, "rollback", "optimistic helper rolls back on error");
includes(useApiMutation, "reconcile", "optimistic helper reconciles server response");
includes(useApiMutation, "invalidateKeys", "optimistic helper invalidates affected keys");
includes(useApiMutation, "SENSITIVE_OPTIMISTIC_ACTIONS", "sensitive actions are blocked from optimism");
includes(useApiMutation, "Optimistic mutation is not allowed for sensitive action", "sensitive optimistic false-success is prevented");

includes(frontendPerformance, "recordRouteLoadDuration", "frontend route duration instrumentation exists");
includes(frontendPerformance, "recordApiRequestTiming", "frontend API timing instrumentation exists");
includes(frontendPerformance, "recordCacheEvent", "cache hit/miss instrumentation exists");
includes(frontendPerformance, "isPerformanceDebugEnabled", "frontend performance logs are debug gated");
includes(debugFlags, "VITE_PERFORMANCE_DEBUG", "debug flag exists");
includes(debugFlags, "hrm_v2_performance_debug", "local dev performance debug flag exists");

includes(workerIndex, "withRouteTiming", "worker timing middleware is mounted");
includes(workerPerformance, "withRequestTiming", "worker withRequestTiming helper exists");
includes(workerPerformance, "timeD1", "worker D1 timing helper exists");
includes(workerPerformance, "appendServerTiming", "Server-Timing helper exists");
includes(workerPerformance, "logSlowApi", "slow API logging helper exists");
includes(workerPerformance, "API_WARNING_THRESHOLD_MS = 750", "API warning threshold is configured");
includes(workerPerformance, "API_CRITICAL_THRESHOLD_MS = 2000", "API critical threshold is configured");
includes(workerPerformance, "D1_QUERY_WARNING_THRESHOLD_MS = 250", "D1 warning threshold is configured");
includes(workerPerformance, "PAYLOAD_WARNING_THRESHOLD_BYTES = 500 * 1024", "payload warning threshold is configured");
includes(workerPerformance, "Cache-Control", "authenticated API cache-control guard exists");
includes(workerPerformance, "private, no-store", "authenticated API responses are not public cached");
excludes(workerPerformance, /password_hash|token|document_contents|payroll_values|salary_amount/i, "performance logs avoid sensitive values and secrets");
includes(workerMiddleware, "withRequestTiming as withRouteTiming", "legacy middleware route timing export remains");
includes(workerMiddleware, "timeD1 as measureD1Query", "legacy D1 measure export remains");
includes(workerTypes, "d1DurationMs", "route timing tracks D1 duration");
includes(workerTypes, "d1Warnings", "route timing tracks D1 warnings");

check("frontend/src: browser alert/confirm/prompt must not be introduced", !/\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/.test(readTree("frontend/src")));
excludes(lifecyclePage, /dark:/, "dark mode classes must not be introduced in changed onboarding page");
includes(password, "ITERATIONS = 100000", "PBKDF2 iterations remain 100000");
includes(wrangler, 'binding = "DB"', "D1 binding remains DB");
includes(wrangler, 'database_name = "hrm-v2"', "D1 database name remains hrm-v2");
includes(wrangler, 'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"', "D1 database id remains unchanged");
includes(wrangler, 'binding = "DOCUMENTS_BUCKET"', "R2 binding remains DOCUMENTS_BUCKET");
includes(wrangler, 'bucket_name = "hrm-v2-documents"', "R2 bucket remains hrm-v2-documents");

includes(lifecyclePage, "Add multiple document rows and upload them together. Each row accepts one file.", "onboarding popup documents layout remains accepted");
excludes(lifecyclePage, "activeTab === \"Checklist\"", "Checklist setup tab remains removed");
excludes(lifecyclePage, "activeTab === \"Approval Timeline\"", "Approval Timeline setup tab remains removed");
includes(lifecyclePage, "Cash payment does not require bank details.", "payroll Cash validation remains");
includes(lifecyclePage, "Bank transfer requires bank, account name, and account number.", "payroll Bank Transfer validation remains");
check(`${seed}: Visa default rule must remain FOREIGN only`, /doc_required_rule_foreign_visa'[^;]+doc_type_visa'[^;]+'FOREIGN'/.test(read(seed)));
check(`${seed}: Work Permit default rule must remain FOREIGN only`, /doc_required_rule_foreign_work_permit'[^;]+doc_type_work_permit'[^;]+'FOREIGN'/.test(read(seed)));

for (const script of [
  "verify:onboarding-employee-popup-layout",
  "verify:onboarding-batch-document-upload",
  "verify:onboarding-document-payroll-validation",
  "verify:sidebar-command-center-welcome",
  "verify:header-search-layout",
  "verify:command-center-dashboard",
  "verify:global-popup-alerts",
  "verify:disabled-module-global-sweep",
  "verify:frontend-static-assets",
  "verify:frontend-bundle-integrity"
]) {
  check(`package.json: missing regression script ${script}`, Boolean(rootPackage.scripts?.[script]));
}

if (failures.length) {
  console.error("Global instant performance foundation verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Global instant performance foundation verification passed.");
