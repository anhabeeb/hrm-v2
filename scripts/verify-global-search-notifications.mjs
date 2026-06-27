import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function has(file, marker, message) {
  const text = read(file);
  if (!text.includes(marker)) failures.push(`${file}: ${message}`);
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

function exists(file, message) {
  if (!fs.existsSync(path.join(root, file))) failures.push(`${file}: ${message}`);
}

exists("worker/src/routes/search.ts", "global search route file missing");
exists("worker/src/routes/notifications.ts", "notification route file missing");
exists("frontend/src/components/global/GlobalSearch.tsx", "interactive global search component missing");
exists("frontend/src/components/global/NotificationBell.tsx", "interactive notification bell component missing");
exists("frontend/src/pages/SearchResultsPage.tsx", "search results page missing");
exists("frontend/src/pages/NotificationCenterPage.tsx", "notification center page missing");

hasAll("worker/src/routes/search.ts", [
  "performGlobalSearch",
  "searchEmployeesForUser",
  "searchPayrollForUser",
  "searchDocumentsForUser",
  "searchApprovalsForUser",
  "searchSettingsForUser",
  "filterSearchResultsByPermission",
  "filterSearchResultsByScope",
  "getSearchableModuleRegistry",
  "buildEmployeeScopeWhereClause",
  "SEARCH_PERMISSION_DENIED",
  "documents.sensitive.view",
  "module_control_settings"
], "global search backend helper/scope/sensitive markers missing");

hasAll("worker/src/routes/notifications.ts", [
  "getNotificationsForUser",
  "getUnreadNotificationCount",
  "markNotificationRead",
  "markAllNotificationsRead",
  "createNotificationForUser",
  "createNotificationForEmployee",
  "filterNotificationsByUserScope",
  "getNotificationRouteForEntity",
  "NOTIFICATION_NOT_FOUND",
  "canAccessEmployee",
  "safeNotificationRoute",
  "module_control_settings"
], "notification backend helper/scope markers missing");

hasAll("worker/src/index.ts", [
  "searchRoutes",
  "notificationRoutes",
  'app.route("/api/v1/search", searchRoutes)',
  'app.route("/api/v1/notifications", notificationRoutes)'
], "search/notification routes are not mounted");

hasAll("database/schema.sql", [
  "CREATE TABLE IF NOT EXISTS notifications",
  "recipient_user_id",
  "recipient_employee_id",
  "notification_preferences",
  "idx_notifications_user_read"
], "notification schema is missing");

hasAll("database/seed.sql", [
  "search.global.use",
  "search.global.admin",
  "notifications.view",
  "notifications.preferences.update",
  "notifications.admin.view"
], "search/notification permissions are not seeded");

hasAll("worker/src/db/permissions.ts", [
  "search.global.use",
  "notifications.view",
  "notifications.preferences.update"
], "worker permission registry missing search/notification permissions");

hasAll("frontend/src/lib/api.ts", [
  "GlobalSearchResponse",
  "HrmNotification",
  "globalSearch",
  "listNotifications",
  "getUnreadNotificationCount",
  "markNotificationRead",
  "markAllNotificationsRead",
  "updateNotificationPreference"
], "frontend API helpers missing");

hasAll("frontend/src/components/global/GlobalSearch.tsx", [
  "api.globalSearch",
  "Ctrl K",
  "ArrowDown",
  "ArrowUp",
  "Enter",
  "Escape",
  "navigate(`/search?q=",
  "CommandPalette",
  "openResult"
], "global search component is not meaningfully interactive");

hasAll("frontend/src/components/global/NotificationBell.tsx", [
  "api.listNotifications",
  "api.markNotificationRead",
  "api.markAllNotificationsRead",
  "unreadCount",
  "View all notifications",
  "navigate(\"/notifications\")",
  "openNotification"
], "notification bell is not meaningfully interactive");

hasAll("frontend/src/layouts/AppShell.tsx", [
  "<GlobalSearch />",
  "<NotificationBell />"
], "AppShell header does not use interactive search/bell");
hasNo("frontend/src/layouts/AppShell.tsx", /Search employees, payroll, documents\.\.\.<\/span>/, "header still contains the placeholder-only search span");

hasAll("frontend/src/pages/SearchResultsPage.tsx", [
  "api.globalSearch",
  "StandardTabs",
  "openResult",
  "StatusBadge",
  "No search results"
], "search results page missing grouping/filter/navigation behavior");

hasAll("frontend/src/pages/NotificationCenterPage.tsx", [
  "api.listNotifications",
  "api.markNotificationRead",
  "api.markAllNotificationsRead",
  "Notification Center",
  "Apply filters",
  "Open"
], "notification center page missing filters or read actions");

hasAll("frontend/src/routes/AppRoutes.tsx", [
  'path="search"',
  'path="notifications"',
  "SearchResultsPage",
  "NotificationCenterPage"
], "frontend routes missing");

hasAll("frontend/src/components/ui/navigation-tabs.tsx", [
  "ModuleNavigationBar",
  "TabsTrigger"
], "shadcn navigation tabs fix must remain present");
has("frontend/src/layouts/AppShell.tsx", "box-border w-full max-w-none min-w-0", "page full-width app shell fix must be preserved");

hasAll("worker/wrangler.toml", [
  'binding = "DB"',
  'database_name = "hrm-v2"',
  'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"',
  'binding = "DOCUMENTS_BUCKET"',
  'bucket_name = "hrm-v2-documents"'
], "D1/R2 bindings changed");
has("worker/src/auth/password.ts", "PBKDF2_ITERATIONS = 100000", "PBKDF2 iteration cap must remain 100000");
has("frontend/vite.config.ts", "manualChunks", "Prompt 13 chunk optimization must remain present");

const frontendFiles = fs.readdirSync(path.join(root, "frontend/src"), { recursive: true })
  .filter((file) => String(file).endsWith(".tsx") || String(file).endsWith(".ts"))
  .map((file) => path.join("frontend/src", String(file)).replaceAll("\\", "/"));
for (const file of frontendFiles) {
  hasNo(file, /\b(window\.)?(alert|confirm|prompt)\s*\(/, "browser alert/confirm/prompt is not allowed");
  hasNo(file, /dark mode|dark:/i, "dark mode must not be introduced");
}

if (failures.length) {
  console.error("Global search/notification verifier failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Global search and notification verifier passed.");
