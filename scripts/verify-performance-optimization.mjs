import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function exists(file, message) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`${file}: ${message}`);
}

function has(file, marker, message) {
  const text = read(file);
  if (!text.includes(marker)) failures.push(`${file}: missing ${marker} - ${message}`);
}

function hasAll(file, markers, message) {
  const text = read(file);
  for (const marker of markers) {
    if (!text.includes(marker)) failures.push(`${file}: missing ${marker} - ${message}`);
  }
}

function hasNo(file, pattern, message) {
  const text = read(file);
  if (pattern.test(text)) failures.push(`${file}: ${message}`);
}

exists("worker/src/middleware/performance.ts", "route timing middleware missing");
hasAll("worker/src/middleware/performance.ts", [
  "withRouteTiming",
  "logSlowRoute",
  "measureD1Query",
  "SLOW_ROUTE_WARN_MS = 750",
  "SLOW_ROUTE_CRITICAL_MS = 2000",
  "duration_ms",
  "d1_query_count",
  "route_pattern"
], "route timing instrumentation markers missing");
has("worker/src/index.ts", "withRouteTiming()", "global route timing middleware is not mounted");

hasAll("worker/src/utils/http.ts", [
  "withPrivateCacheHeaders",
  "okCached",
  "Cache-Control",
  "private, max-age=${maxAgeSeconds}",
  "Vary",
  "Authorization"
], "private cache response helpers missing");
hasAll("worker/src/routes/organization.ts", [
  "okCached",
  "locations-",
  "departments-",
  "job-levels-",
  "positions-"
], "organization reference endpoints must use private cache headers");
hasAll("worker/src/routes/employees.ts", [
  "okCached",
  "assignment-options",
  "EMPLOYEE_LIST_DEFAULT_LIMIT",
  "EMPLOYEE_LIST_MAX_LIMIT",
  "LIMIT ? OFFSET ?",
  "pagination"
], "employee reference/list pagination and cache markers missing");

hasAll("frontend/src/lib/referenceDataCache.ts", [
  "referenceDataCache",
  "invalidateReferenceDataCache",
  "DEFAULT_REFERENCE_DATA_TTL_MS",
  "getOrLoad",
  "inflight"
], "frontend reference data cache missing");
hasAll("frontend/src/hooks/useReferenceData.ts", [
  "useReferenceData",
  "referenceDataCache.getOrLoad",
  "refresh"
], "reference data hook missing");
hasAll("frontend/src/hooks/useOrganizationReferences.ts", [
  "useReferenceData",
  "organization:references",
  "api.listDepartments",
  "api.listLocations",
  "api.listJobLevels",
  "api.listPositions"
], "organization references must use cached reference data");
hasAll("frontend/src/lib/api.ts", [
  "invalidateReferenceDataCache",
  "invalidateReferences",
  "organization"
], "master-data mutation cache invalidation missing");
hasAll("frontend/src/hooks/useAuth.tsx", [
  "invalidateReferenceDataCache",
  "clearSession"
], "reference cache must clear on session changes");

hasAll("frontend/src/components/global/GlobalSearch.tsx", [
  "GLOBAL_SEARCH_DEBOUNCE_MS = 350",
  "lastFailedQueryRef",
  "retryBlockedUntilRef",
  "cancelled"
], "global search debounce/stale request protection missing");
hasAll("frontend/src/components/global/NotificationBell.tsx", [
  "api.getUnreadNotificationCount",
  "NOTIFICATION_UNREAD_POLL_INTERVAL_MS",
  "90000",
  "visibilitychange",
  "document.visibilityState",
  "lastNotificationFailureAtRef",
  "NOTIFICATION_FAILURE_BACKOFF_MS",
  "if (open) void loadNotifications(true)"
], "notification polling/list-on-open optimization missing");
hasNo("frontend/src/components/global/NotificationBell.tsx", /setInterval\([^,]+,\s*60000\)/, "notification polling should not be an aggressive fixed 60s list poll");

hasAll("worker/src/routes/search.ts", [
  "isSearchableModuleEnabled",
  "module_control_settings",
  "Promise.allSettled",
  "measureD1Query",
  "DEFAULT_LIMIT = 8",
  "MAX_LIMIT = 25"
], "global search performance/hardening markers missing");
hasAll("worker/src/routes/notifications.ts", [
  "boundedLimit",
  "NOTIFICATION_LIMIT_MAX",
  "measureD1Query",
  "isModuleEnabled",
  "module_control_settings"
], "notification pagination/module-skip markers missing");

hasAll("frontend/src/pages/EmployeeProfilePage.tsx", [
  "activeTab === \"Payroll\"",
  "activeTab === \"Attendance\"",
  "activeTab === \"Roster\"",
  "activeTab === \"Leave\"",
  "activeTab === \"Documents\""
], "Employee 360 heavy tab content must remain lazy-rendered");
hasAll("database/schema.sql", [
  "idx_performance_notifications_user_created",
  "idx_performance_employees_active_lookup",
  "idx_performance_employee_documents_employee_type_status",
  "idx_performance_leave_requests_status_dates",
  "idx_performance_attendance_daily_date_status",
  "idx_performance_payroll_results_status_run_employee",
  "idx_performance_approval_instances_status_employee",
  "idx_performance_onboarding_status_created",
  "idx_performance_offboarding_status_created",
  "idx_performance_audit_logs_module_created"
], "performance indexes missing");

const wrangler = read("worker/wrangler.toml");
for (const forbidden of ["kv_namespaces", "durable_objects", "queues", "analytics_engine_datasets", "vectorize", "hyperdrive"]) {
  if (wrangler.includes(forbidden)) failures.push(`worker/wrangler.toml: added forbidden Cloudflare service binding ${forbidden}`);
}
hasAll("worker/wrangler.toml", [
  'binding = "DB"',
  'database_name = "hrm-v2"',
  'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"',
  'binding = "DOCUMENTS_BUCKET"',
  'bucket_name = "hrm-v2-documents"'
], "D1/R2 bindings changed");
has("worker/src/auth/password.ts", "100000", "PBKDF2 cap must remain 100000");
has("frontend/vite.config.ts", "manualChunks", "Prompt 13 chunk optimization must remain present");
has("frontend/src/layouts/AppShell.tsx", "box-border w-full max-w-none min-w-0", "full-width page shell fix must remain present");
has("frontend/src/components/ui/navigation-tabs.tsx", "TabsTrigger", "shadcn tab fix must remain present");
has("worker/src/routes/search.ts", "SEARCH_RUNTIME_ERROR", "global search runtime hardening must remain present");
has("worker/src/routes/notifications.ts", "NOTIFICATIONS_RUNTIME_ERROR", "notification runtime hardening must remain present");

const frontendFiles = fs.readdirSync(path.join(root, "frontend/src"), { recursive: true })
  .filter((file) => String(file).endsWith(".tsx") || String(file).endsWith(".ts"))
  .map((file) => path.join("frontend/src", String(file)).replaceAll("\\", "/"));
for (const file of frontendFiles) {
  hasNo(file, /\b(window\.)?(alert|confirm|prompt)\s*\(/, "browser alert/confirm/prompt is not allowed");
  hasNo(file, /dark mode|dark:/i, "dark mode must not be introduced");
}

if (failures.length) {
  console.error("Performance optimization verifier failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Performance optimization verifier passed.");
