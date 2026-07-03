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

const packageJson = JSON.parse(read("package.json"));
const workspaceQuery = "frontend/src/hooks/useWorkspaceQuery.ts";
const workspaceMutation = "frontend/src/hooks/useWorkspaceMutation.ts";
const workspaceInvalidation = "frontend/src/lib/workspaceInvalidation.ts";
const queryKeys = "frontend/src/lib/queryKeys.ts";
const performance = "frontend/src/lib/performance.ts";
const preload = "frontend/src/lib/preloadReferenceData.ts";
const organizationReferences = "frontend/src/hooks/useOrganizationReferences.ts";
const lifecyclePage = "frontend/src/pages/LifecyclePage.tsx";
const lifecyclePageText = read(lifecyclePage);
const employeeProfile = "frontend/src/pages/EmployeeProfilePage.tsx";
const dashboard = "frontend/src/pages/DashboardPage.tsx";
const globalSearch = "frontend/src/components/global/GlobalSearch.tsx";
const globalSearchApi = "frontend/src/lib/globalSearchApi.ts";
const searchResults = "frontend/src/pages/SearchResultsPage.tsx";
const notificationBell = "frontend/src/components/global/NotificationBell.tsx";
const notificationsApi = "frontend/src/lib/notificationsApi.ts";
const api = "frontend/src/lib/api.ts";
const apiClient = "frontend/src/lib/apiClient.ts";
const lifecycleRoute = "worker/src/routes/lifecycle.ts";
const dashboardRoute = "worker/src/routes/dashboard.ts";
const apiPerformance = "worker/src/utils/performance.ts";
const password = "worker/src/auth/password.ts";
const wrangler = "worker/wrangler.toml";
const seed = "database/seed.sql";

check("package.json: verify:global-workspace-page-load-reduction script is registered", packageJson.scripts?.["verify:global-workspace-page-load-reduction"] === "node scripts/verify-global-workspace-page-load-reduction.mjs");

includes(workspaceQuery, "useApiQuery", "workspace query helper uses TanStack Query foundation");
includes(workspaceQuery, "placeholderData", "workspace query keeps previous data during refresh");
includes(workspaceQuery, "firstLoad", "workspace query exposes first-load state");
includes(workspaceQuery, "refreshing", "workspace query exposes background refresh state");
includes(workspaceQuery, "recordWorkspaceQueryMetric", "workspace query records debug request-count/cache metrics");
includes(workspaceMutation, "useMutation", "workspace mutation helper uses TanStack mutation");
includes(workspaceMutation, "invalidateKeys", "workspace mutation supports targeted invalidation");
includes(workspaceMutation, "applyResult", "workspace mutation can reconcile returned workspace payloads");
includes(workspaceInvalidation, "invalidateOnboardingWorkspaceSlices", "onboarding targeted invalidation helper exists");
includes(workspaceInvalidation, "invalidateEmployeeProfileSlices", "employee profile targeted invalidation helper exists");
includes(workspaceInvalidation, "invalidateNotificationQueries", "notification targeted invalidation helper exists");
excludes(workspaceInvalidation, /refetchQueries\(\{\s*queryKey:\s*queryKeys\.onboarding\.workspace/, "onboarding section saves must not force a full workspace refetch");

includes(queryKeys, "permissionScope", "workspace query keys include permission/scope hash");
includes(queryKeys, "session", "workspace query keys include session scope");
includes(queryKeys, "onboarding", "onboarding workspace query key namespace exists");
includes(queryKeys, "workspaceSlice", "onboarding workspace slice keys exist");
includes(queryKeys, "employee", "employee workspace query key namespace exists");
includes(queryKeys, "dashboard", "Command Center workspace query key exists");
includes(queryKeys, "notifications", "notification query keys exist");
includes(queryKeys, "search", "global search query key namespace exists");

check("frontend/src/pages/LifecyclePage.tsx: onboarding case popup loads workspace through workspace query", lifecyclePageText.includes("useWorkspaceQuery<Row>") || lifecyclePageText.includes("useResilientWorkspaceQuery<Row>"));
check("frontend/src/pages/LifecyclePage.tsx: onboarding workspace query passes AbortSignal", lifecyclePageText.includes("api.getOnboardingWorkspace(token, caseId, signal)") || lifecyclePageText.includes("api.getOnboardingWorkspace(token, caseId, signal, timeoutMs)"));
includes(lifecyclePage, "placeholderData: (previousData) => String(asRow(previousData?.case).id", "onboarding cached data is entity-safe");
includes(lifecyclePage, "onboardingWorkspaceQuery.data ?? null", "onboarding popup can show cached workspace immediately");
check("frontend/src/pages/LifecyclePage.tsx: onboarding background errors are handled without crashing", lifecyclePageText.includes("onboardingWorkspaceQuery.error") || lifecyclePageText.includes("onboardingWorkspaceQuery.backgroundError"));
includes(lifecyclePage, "workspaceMutation", "onboarding section saves use workspace mutation helper");
includes(lifecyclePage, "applyWorkspacePayload(scope, caseId, result)", "onboarding mutations reconcile returned workspace payload");
includes(lifecyclePage, "invalidateOnboardingWorkspaceSlices({ scope, caseId, slices", "onboarding mutations invalidate targeted workspace slices");
includes(lifecyclePage, '["documents", "document-checklist", "readiness"]', "batch document upload refreshes documents/checklist/readiness only");
check(
  "frontend/src/pages/LifecyclePage.tsx: payment save refreshes payment/payroll readiness slices",
  lifecyclePageText.includes('["payment-methods", "payroll", "readiness"]') ||
    lifecyclePageText.includes('["payment-methods", "payroll", "pension", "readiness"]'),
);
includes(lifecyclePage, '["job-assignment", "documents", "document-checklist", "readiness"]', "job assignment save refreshes dependent document checklist/readiness");
includes(lifecyclePage, "Add multiple document rows and upload them together. Each row accepts one file.", "accepted batch document upload layout remains");
includes(lifecyclePage, "documentTypeAllowedMimeTypes", "local document upload validation remains");
includes(lifecyclePage, "Cash payment does not require bank details.", "payroll Cash validation remains");
includes(lifecyclePage, "Bank transfer requires bank, account name, and account number.", "payroll Bank Transfer validation remains");
excludes(lifecyclePage, "activeTab === \"Checklist\"", "simplified onboarding popup remains without Checklist tab");
excludes(lifecyclePage, "activeTab === \"Approval Timeline\"", "simplified onboarding popup remains without Approval Timeline tab");

includes(employeeProfile, "useWorkspaceQuery<EmployeeProfileWorkspacePayload>", "Employee 360 uses prepared workspace query");
includes(employeeProfile, "queryKeys.employee.workspace", "Employee 360 workspace query key exists");
includes(employeeProfile, "api.getEmployeeOverview(token, id!, signal)", "Employee 360 overview request is abortable");
includes(employeeProfile, "api.listEmployeeStatuses(token, signal)", "Employee 360 status reference request is abortable");
includes(employeeProfile, "api.getEmployeeLifecycleSummary(token, id!, signal)", "Employee 360 lifecycle summary is included when permitted");
includes(employeeProfile, "placeholderData: (previousData) => previousData?.overview.employee.id === id", "Employee 360 cached data is entity-safe");
includes(employeeProfile, "loadTabData", "Employee 360 heavy tab data remains lazy-loaded");
includes(employeeProfile, "activeTab === \"Payroll\"", "Employee 360 payroll panel remains tab-scoped");
includes(employeeProfile, "activeTab === \"Attendance\"", "Employee 360 attendance panel remains tab-scoped");
includes(employeeProfile, "activeTab === \"Documents\"", "Employee 360 documents panel remains tab-scoped");

includes(dashboard, "useWorkspaceQuery<CommandCenterSummary>", "Command Center summary uses workspace query");
includes(dashboard, "queryKeys.dashboard.commandCenter", "Command Center targeted query key is used");
includes(dashboard, "api.getCommandCenterDashboard(token, signal)", "Command Center request is abortable");
includes(dashboard, "summaryQuery.refreshing", "Command Center uses a small background refresh indicator");
includes(dashboard, "PriorityKpiIconStrip actions={priorityActions}", "priority KPI icons remain rendered from cached summary");
includes(dashboard, "resolveCommandCenterWelcome", "Command Center welcome header remains");

includes(preload, "queryKeys.reference.organization(scope)", "organization reference preload uses shared query key");
includes(organizationReferences, "queryKeys.reference.organization(scope)", "organization reference hook consumes shared query key");
includes(organizationReferences, "useAuth", "organization reference hook aligns preload scope with current user/session");
includes(preload, "api.listDocumentTypes", "document type reference preload remains");
includes(preload, "api.listDocumentRequiredRules", "document required-rule reference preload remains");
includes(preload, "api.listPaymentInstitutions", "payment institution reference preload remains");
includes(preload, "api.listApprovalWorkflows", "approval workflow reference preload remains");
includes(preload, "api.getSyncBootstrap", "module visibility/settings preload remains");

includes(globalSearch, "new AbortController()", "header global search creates AbortController");
includes(globalSearch, "controller.abort()", "header global search cancels stale requests");
includes(globalSearch, "window.clearTimeout(handle)", "header global search debounce cleanup remains");
includes(globalSearch, "globalSearchApi.globalSearch(token, { q: query, limit: 8 }, controller.signal)", "header global search passes AbortSignal");
includes(searchResults, "new AbortController()", "search results page creates AbortController");
includes(searchResults, "controller.abort()", "search results page cancels stale requests");
includes(searchResults, "signal?.aborted", "search results page ignores stale abort errors");
includes(globalSearchApi, "globalSearch(token: string, params: { q?: string; limit?: number }, signal?: AbortSignal)", "global search API helper accepts AbortSignal");

check(`${notificationBell}: notification unread count uses query cache`, read(notificationBell).includes("useWorkspaceQuery<{ unread_count: number }>") || read(notificationBell).includes("useWorkspaceQuery<UnreadNotificationCountResponse>"));
includes(notificationBell, "queryKeys.notifications.unreadCount(scope)", "notification unread count uses scoped key");
includes(notificationBell, "queryKeys.notifications.list(scope, 8)", "notification list uses scoped key");
includes(notificationBell, "queryClient.setQueryData<{ unread_count: number }>", "mark-read mutation updates unread count immediately");
includes(notificationBell, "invalidateNotificationQueries(scope)", "notification mutations invalidate targeted notification queries");
excludes(notificationBell, /if \(open\) void loadNotifications\(true\)/, "opening notification bell must not duplicate the query-owned fetch");
includes(notificationsApi, "getUnreadNotificationCount(token: string, signal?: AbortSignal)", "unread count API helper accepts AbortSignal");
includes(notificationsApi, "listNotifications(token: string, params?: Record", "notification list API helper accepts filters");

includes(performance, "WorkspaceQueryMetric", "workspace request-count/cache metric type exists");
includes(performance, "recordWorkspaceQueryMetric", "workspace request-count/cache metric helper exists");
includes(performance, "recent_workspace_metrics", "performance snapshot exposes safe workspace metrics");
includes(performance, "isPerformanceDebugEnabled", "workspace metrics are debug-gated for console output");
excludes(performance, /password_hash|document_contents|raw_token|salary_amount|net_salary/i, "workspace performance metrics must not log sensitive fields");

includes(lifecycleRoute, "timeD1(c, options.run, `onboarding.workspace.${options.key}`)", "onboarding workspace optional read groups are D1-timed");
includes(dashboardRoute, "timeD1(c, () => buildCommandCenterSummary(c), \"dashboard.command-center-summary\")", "Command Center summary endpoint is D1-timed");
includes(apiPerformance, "private, no-store", "authenticated API responses are not public cached");
includes(apiClient, "cache: method === \"GET\" ? \"no-store\"", "authenticated frontend GETs avoid browser/public cache");
includes(apiClient, "inflightGetRequests", "identical GET dedupe foundation remains");
includes(apiClient, "recordApiRequestTiming", "API timing foundation remains");

includes("frontend/src/layouts/AppShell.tsx", "setOpenGroup(activeGroupLabel)", "sidebar active group auto-open remains");
includes("frontend/src/layouts/AppShell.tsx", "<GlobalSearch />", "header search layout remains");
includes("frontend/src/layouts/AppShell.tsx", "<NotificationBell />", "notification bell remains in header");
includes("frontend/src/components/alerts/AlertProvider.tsx", "autoDismissMs", "global popup alert auto-dismiss remains");
includes("worker/src/utils/module-enforcement.ts", "MODULE_DISABLED_RESPONSE_MODEL", "disabled module behavior remains");

check("frontend/src: browser alert/confirm/prompt must not be introduced", !/\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/.test(readTree("frontend/src")));
check("frontend/src: dark mode must not be introduced", !/\bdark:/i.test(readTree("frontend/src")));
includes(password, "100000", "PBKDF2 iterations remain 100000");
includes(wrangler, 'binding = "DB"', "D1 binding remains DB");
includes(wrangler, 'database_name = "hrm-v2"', "D1 database name remains hrm-v2");
includes(wrangler, 'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"', "D1 database id remains unchanged");
includes(wrangler, 'binding = "DOCUMENTS_BUCKET"', "R2 binding remains DOCUMENTS_BUCKET");
includes(wrangler, 'bucket_name = "hrm-v2-documents"', "R2 bucket remains hrm-v2-documents");
check(`${seed}: Visa default rule must remain FOREIGN only`, /doc_required_rule_foreign_visa'[^;]+doc_type_visa'[^;]+'FOREIGN'/.test(read(seed)));
check(`${seed}: Work Permit default rule must remain FOREIGN only`, /doc_required_rule_foreign_work_permit'[^;]+doc_type_work_permit'[^;]+'FOREIGN'/.test(read(seed)));

for (const script of [
  "verify:global-instant-performance-foundation",
  "verify:onboarding-employee-popup-layout",
  "verify:onboarding-batch-document-upload",
  "verify:onboarding-document-payroll-validation",
  "verify:sidebar-command-center-welcome",
  "verify:header-search-layout",
  "verify:command-center-dashboard",
  "verify:global-search-notifications",
  "verify:global-popup-alerts",
  "verify:disabled-module-global-sweep",
  "verify:main-module-submodule-dependencies",
  "verify:frontend-static-assets",
  "verify:frontend-bundle-integrity",
  "verify:form-action-validation-hardening",
  "verify:employee-user-account-linking",
  "verify:import-export-standardization",
  "smoke:production-readiness"
]) {
  check(`package.json: missing regression script ${script}`, Boolean(packageJson.scripts?.[script]));
}

if (failures.length) {
  console.error("Global workspace page-load reduction verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Global workspace page-load reduction verification passed.");
