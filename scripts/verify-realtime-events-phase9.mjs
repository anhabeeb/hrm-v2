import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function file(relativePath) {
  return path.join(root, relativePath);
}

function read(relativePath) {
  const absolute = file(relativePath);
  if (!fs.existsSync(absolute)) {
    failures.push(`Missing required file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolute, "utf8");
}

function readTree(relativeDir) {
  const absolute = file(relativeDir);
  if (!fs.existsSync(absolute)) return "";
  const chunks = [];
  const stack = [absolute];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) chunks.push(fs.readFileSync(full, "utf8"));
    }
  }
  return chunks.join("\n");
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

function includesAll(source, markers, label) {
  for (const marker of markers) {
    check(source.includes(marker), `${label} missing marker: ${marker}`);
  }
}

function assertNoRawDialogs(source, label) {
  check(!/\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/.test(source), `${label} must not use browser alert/confirm/prompt.`);
}

const schema = read("database/schema.sql");
const appEventsUtil = read("worker/src/utils/app-events.ts");
const appEventsRoute = read("worker/src/routes/app-events.ts");
const index = read("worker/src/index.ts");
const publisher = read("worker/src/realtime/publisher.ts");
const backgroundJobs = read("worker/src/utils/background-jobs.ts");
const notifications = read("worker/src/routes/notifications.ts");
const reportJobs = read("worker/src/utils/report-jobs.ts");
const importJobs = read("worker/src/utils/import-jobs.ts");
const documents = read("worker/src/routes/documents.ts");
const lifecycle = read("worker/src/routes/lifecycle.ts");
const admin = read("worker/src/routes/admin.ts");
const dashboard = read("worker/src/routes/dashboard.ts");
const snapshots = read("worker/src/utils/snapshots.ts");
const appEventsApi = read("frontend/src/lib/appEventsApi.ts");
const useAppEvents = read("frontend/src/hooks/useAppEvents.ts");
const liveBridge = read("frontend/src/hooks/useLiveQueryInvalidation.tsx");
const crossTabSync = read("frontend/src/lib/crossTabSync.ts");
const invalidationRouter = read("frontend/src/lib/queryInvalidationRouter.ts");
const liveStatus = read("frontend/src/lib/liveEventStatus.ts");
const auth = read("frontend/src/hooks/useAuth.tsx");
const backgroundJobsHook = read("frontend/src/hooks/useBackgroundJobs.ts");
const app = read("frontend/src/app/App.tsx");
const docs = read("docs/performance/realtime-events-phase9.md");
const cors = index;
const password = read("worker/src/auth/password.ts");
const wrangler = read("worker/wrangler.toml");
const packageJson = JSON.parse(read("package.json") || "{}");
const frontendTree = readTree("frontend/src");
const workerTree = readTree("worker/src");

includesAll(schema, [
  "CREATE TABLE IF NOT EXISTS app_events",
  "visibility TEXT NOT NULL DEFAULT 'COMPANY' CHECK (visibility IN ('USER', 'ROLE', 'COMPANY', 'SYSTEM'))",
  "payload_json TEXT",
  "query_keys_json TEXT",
  "dedupe_key TEXT",
  "delivered_at TEXT",
  "is_sensitive INTEGER NOT NULL DEFAULT 0",
  "idx_app_events_company_created",
  "idx_app_events_user_created",
  "idx_app_events_module_created",
  "idx_app_events_entity_created",
  "idx_app_events_dedupe_key",
  "idx_app_events_expires_at"
], "app event schema");

includesAll(appEventsUtil, [
  "emitAppEvent",
  "emitQueryInvalidationEvent",
  "listAppEventsSince",
  "sanitizeEventForUser",
  "cleanupExpiredEvents",
  "buildEventScope",
  "canUserReceiveEvent",
  "dedupeAppEvent",
  "sanitizeEventPayload",
  "SENSITIVE_EVENT_KEY",
  "isOperationalModuleEnabled",
  "canAccessEmployee",
  "visibility = 'USER' AND user_scope_id",
  "visibility = 'ROLE' AND role_scope_key",
  "private"
].filter(Boolean), "app event service");
check(/SENSITIVE_EVENT_KEY[\s\S]*password[\s\S]*token[\s\S]*document_number[\s\S]*salary[\s\S]*r2_key[\s\S]*storage_key/.test(appEventsUtil), "App event sanitizer must redact sensitive payload keys.");
check(/canUserReceiveEvent[\s\S]*isOperationalModuleEnabled[\s\S]*canAccessEmployee/.test(appEventsUtil), "Event delivery must be module and employee-scope aware.");

includesAll(appEventsRoute, [
  "appEventRoutes.use(\"*\", requireAuth)",
  "Cache-Control\", \"private, no-store\"",
  "\"/since\"",
  "listAppEventsSince",
  "delivery_mode: \"polling_fallback\"",
  "poll_interval_ms",
  "cleanupExpiredEvents",
  "waitUntil",
  "\"/stream\""
], "app event endpoint");
check(index.includes("appEventRoutes") && index.includes('app.route("/api/v1/app-events", appEventRoutes)'), "App event route must be mounted under /api/v1/app-events.");

includesAll(publisher, [
  "emitQueryInvalidationEvent",
  "eventQueryFamilies",
  "publishAccessEvent(env",
  "document.uploaded",
  "onboarding.readiness.updated",
  "module.visibility.updated"
], "realtime publisher app-event bridge");

includesAll(backgroundJobs, [
  "safeEmitAppEvent",
  "background_job.queued",
  "background_job.updated",
  "background_job.completed",
  "background_job.failed",
  "requested_by_user_id ? \"USER\" : \"COMPANY\""
], "background job event emission");

includesAll(notifications, [
  "notification.created",
  "notification.read",
  "userScopeId: input.userId",
  "userScopeId: c.get(\"currentUser\").id",
  "SELECT id FROM users WHERE employee_id"
], "notification event emission");

includesAll(reportJobs, ["report.artifact.ready", "report-artifacts", "background-jobs"], "report artifact ready events");
includesAll(importJobs, ["import.validation.completed", "import.apply.completed", "data_import", "background-jobs"], "import completion events");
includesAll(documents, ["document.compliance.updated", "onboarding.readiness.updated", "document.follow_up", "background-jobs"], "document/upload follow-up events");
includesAll(lifecycle, ["emitOnboardingWorkspaceEvent", "employee.updated", "payroll.payment_method.updated", "onboarding.readiness.updated"], "onboarding workspace events");
includesAll(admin, ["module.visibility.updated", "module-visibility", "auth.me", "dashboard.command-center"], "module visibility events");
includesAll(dashboard, ["dashboard.summary.updated", "Command Center refreshed"], "dashboard summary events");
includesAll(snapshots, ["attendance.summary.updated", "payroll.summary.updated", "safeEmitAppEvent"], "attendance/payroll snapshot events");

includesAll(appEventsApi, ["appEventsApi", "/api/v1/app-events/since", "delivery_mode", "poll_interval_ms", "dedupe: false"], "frontend app event API");
includesAll(useAppEvents, [
  "useAppEvents",
  "enabled",
  "if (!input.enabled || !input.token || !input.user)",
  "appEventsApi.since",
  "visibilitychange",
  "HIDDEN_INTERVAL_MS",
  "setLiveEventHealth",
  "routeAppEventInvalidation",
  "sync.broadcastAppEvent",
  "debugLiveEventLog",
  "abortController?.abort()"
], "frontend live event hook");
includesAll(liveBridge, ["LiveQueryInvalidationBridge", "useAuth", "useQueryClient", "useAppEvents"], "live query bridge");
check(app.includes("<LiveQueryInvalidationBridge />"), "Live query invalidation bridge must be mounted in App.");

includesAll(crossTabSync, [
  "BroadcastChannel",
  "storage",
  "safeEventForBroadcast",
  "query_keys",
  "broadcastSessionEvent",
  "subscribeCrossTabSessionEvents",
  "logout",
  "scope-change"
], "cross-tab coordination");
check(!/payload\s*:/.test(crossTabSync.slice(crossTabSync.indexOf("safeEventForBroadcast"), crossTabSync.indexOf("function parseMessage"))), "Cross-tab safe event broadcast must not include sensitive payload.");
check(!/localStorage\.setItem[\s\S]{0,120}payload/i.test(crossTabSync), "Cross-tab storage fallback must not store event payloads.");
includesAll(auth, ["broadcastSessionEvent(\"scope-change\"", "broadcastSessionEvent(\"logout\"", "subscribeCrossTabSessionEvents", "clearQueryCacheForSessionChange(\"scope-change\")"], "auth cross-tab session coordination");

includesAll(invalidationRouter, [
  "routeAppEventInvalidation",
  "invalidateNotificationQueries",
  "invalidateOnboardingWorkspaceSlices",
  "invalidateEmployeeProfileSlices",
  "invalidateCommandCenterSummary",
  "module-visibility",
  "report-artifacts",
  "data_import",
  "data_export"
], "query invalidation router");
check(!invalidationRouter.includes("invalidateQueries({ queryKey: queryKeys.scope(scope) })"), "App events must not invalidate the entire scoped app cache.");
check(!invalidationRouter.includes("queryClient.clear()"), "App event router must not clear the whole query cache.");
includesAll(liveStatus, ["setLiveEventHealth", "useLiveEventHealth", "deliveryMode"], "live event health store");
includesAll(backgroundJobsHook, ["useLiveEventHealth", "liveEvents.healthy ? 30000 : 5000"], "background job polling reduction");

includesAll(docs, [
  "App Event Schema",
  "Event Types",
  "Scope And Visibility",
  "Delivery Mode",
  "polling fallback",
  "Frontend Event Client",
  "Query Invalidation Router",
  "Cross-Tab Coordination",
  "Polling Reduction",
  "Security And Privacy",
  "Deferred Items"
], "Phase 9 documentation");

for (const script of [
  "verify:reports-imports-snapshots-phase8",
  "verify:background-jobs-phase7",
  "verify:large-list-table-performance",
  "verify:document-upload-acceleration-background",
  "verify:cors-request-id-hotfix",
  "verify:global-instant-performance-foundation",
  "verify:global-workspace-page-load-reduction",
  "verify:d1-query-payload-optimization",
  "verify:frontend-static-assets",
  "verify:frontend-bundle-integrity"
]) {
  check(Boolean(packageJson.scripts?.[script]), `Regression verifier script missing: ${script}`);
}
check(packageJson.scripts?.["verify:realtime-events-phase9"] === "node scripts/verify-realtime-events-phase9.mjs", "package.json must register verify:realtime-events-phase9.");

check(/x-request-id/i.test(cors) && /X-Request-Id/.test(cors), "CORS request-id hotfix must remain.");
check(/private,\s*no-store/i.test(`${appEventsRoute}\n${cors}\n${workerTree}`), "Authenticated HR API must remain private/no-store.");
includesAll(wrangler, [
  'binding = "DB"',
  'database_name = "hrm-v2"',
  'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"',
  'binding = "DOCUMENTS_BUCKET"',
  'bucket_name = "hrm-v2-documents"'
], "D1/R2 binding protection");
check(password.includes("MAX_WORKER_PBKDF2_ITERATIONS = 100000"), "PBKDF2 maximum iteration guard must remain 100000.");
assertNoRawDialogs(`${frontendTree}\n${workerTree}`, "Phase 9 source");
check(!/\bdark:/.test(frontendTree), "Phase 9 must not introduce dark mode classes.");
check(!/R2_(ACCESS|SECRET|TOKEN)|AWS_ACCESS_KEY|AWS_SECRET|SECRET_ACCESS/i.test(frontendTree), "Frontend must not expose R2 or cloud storage secrets.");
check(!/localStorage\.setItem[\s\S]{0,180}(salary|payroll|attendance|employee|document|bank|payload)/i.test(`${useAppEvents}\n${crossTabSync}\n${invalidationRouter}`), "Phase 9 must not persist sensitive HR event data to localStorage.");
check(!/console\.(log|debug|warn|error)\([^)]*(document_number|bank_account|net_salary|gross_salary|storage_key|r2_key|password|token)/i.test(`${appEventsUtil}\n${useAppEvents}\n${crossTabSync}`), "Phase 9 must not log sensitive event payload data.");

if (failures.length) {
  console.error("Realtime app events Phase 9 verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Realtime app events Phase 9 verification passed.");
