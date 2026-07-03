import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const failures = [];

function read(relativePath) {
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file)) {
    failures.push(`${relativePath}: missing required file`);
    return "";
  }
  return fs.readFileSync(file, "utf8");
}

function readTree(relativeDir) {
  const dir = path.join(root, relativeDir);
  if (!fs.existsSync(dir)) return "";
  const chunks = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!["node_modules", "dist", "build", ".wrangler"].includes(entry.name)) stack.push(full);
      } else if (/\.(ts|tsx|js|mjs|md|toml|json)$/.test(entry.name)) {
        chunks.push(fs.readFileSync(full, "utf8"));
      }
    }
  }
  return chunks.join("\n");
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

function includesAll(source, markers, label) {
  for (const marker of markers) check(source.includes(marker), `${label}: missing ${marker}`);
}

const packageJson = JSON.parse(read("package.json") || "{}");
const appEventsRoute = read("worker/src/routes/app-events.ts");
const appEventsUtil = read("worker/src/utils/app-events.ts");
const adminRoute = read("worker/src/routes/admin.ts");
const index = read("worker/src/index.ts");
const types = read("worker/src/types.ts");
const appEventsApi = read("frontend/src/lib/appEventsApi.ts");
const useAppEvents = read("frontend/src/hooks/useAppEvents.ts");
const crossTabSync = read("frontend/src/lib/crossTabSync.ts");
const liveStatus = read("frontend/src/lib/liveEventStatus.ts");
const invalidationRouter = read("frontend/src/lib/queryInvalidationRouter.ts");
const backgroundJobsHook = read("frontend/src/hooks/useBackgroundJobs.ts");
const performancePage = read("frontend/src/pages/PerformanceDashboardPage.tsx");
const api = read("frontend/src/lib/api.ts");
const docs = read("docs/performance/sse-live-events-phase19.md");
const troubleshooting = read("docs/user-guides/troubleshooting-guide.md");
const operations = read("docs/user-guides/production-operations-runbook.md");
const checklist = read("docs/production/phase12-production-readiness-checklist.md");
const frontendTree = readTree("frontend/src");
const workerTree = readTree("worker/src");
const wrangler = read("worker/wrangler.toml");
const password = read("worker/src/auth/password.ts");

check(packageJson.scripts?.["verify:sse-live-events-phase19"] === "node scripts/verify-sse-live-events-phase19.mjs", "package.json: verify:sse-live-events-phase19 script missing");

includesAll(types, [
  "HRM_LIVE_EVENTS_MODE",
  "HRM_LIVE_EVENTS_ENABLED",
  "HRM_LIVE_EVENTS_HEARTBEAT_SECONDS",
  "HRM_LIVE_EVENTS_MAX_DURATION_SECONDS",
  "HRM_LIVE_EVENTS_POLL_INTERVAL_MS",
  "HRM_LIVE_EVENTS_RECONNECT_BASE_MS",
  "HRM_LIVE_EVENTS_RECONNECT_MAX_MS"
], "Worker env types");

includesAll(appEventsUtil, [
  "AppEventDeliveryMode",
  "LiveEventStreamConfig",
  "getLiveEventStreamConfig",
  "getAppEventStreamHealth",
  "sanitizeEventPayload",
  "canUserReceiveEvent",
  "listAppEventsSince",
  "isOperationalModuleEnabled",
  "canAccessEmployee",
  "SENSITIVE_EVENT_KEY"
], "app event utility");
check(/SENSITIVE_EVENT_KEY[\s\S]*password[\s\S]*token[\s\S]*document_number[\s\S]*salary[\s\S]*r2_key[\s\S]*storage_key/.test(appEventsUtil), "App event sanitizer must redact sensitive payload keys");

includesAll(appEventsRoute, [
  "appEventRoutes.use(\"*\", requireAuth)",
  "\"/since\"",
  "\"/stream\"",
  "text/event-stream",
  "Cache-Control\": \"private, no-store\"",
  "Last-Event-ID",
  "ReadableStream",
  "heartbeat",
  "stream.open",
  "stream.close",
  "stream.error",
  "listAppEventsSince",
  "cleanupExpiredEvents",
  "getLiveEventStreamConfig",
  "LIVE_EVENTS_STREAM_DISABLED"
], "stream endpoint");
check(!/token\s*=|auth_token|access_token/i.test(appEventsRoute), "Stream endpoint must not accept auth token query parameters");
check(/safeCursor\(c\.req\.header\("Last-Event-ID"\)\)[\s\S]*safeCursor\(c\.req\.query\("cursor"\)\)/.test(appEventsRoute), "Stream endpoint must prefer Last-Event-ID and only accept safe cursor param");
check(/while \(!closed[\s\S]*config\.maxDurationMs/.test(appEventsRoute), "Stream loop must be bounded by max duration");
check(/limit:\s*config\.batchLimit/.test(appEventsRoute), "Stream loop must fetch capped batches");

includesAll(index, [
  "Accept",
  "Last-Event-ID",
  "last-event-id",
  "X-Request-Id",
  "x-request-id",
  "OPTIONS",
  "Access-Control-Allow-Headers",
  "Vary"
], "CORS/header handling");
check(index.indexOf("if (c.req.method === \"OPTIONS\")") < index.indexOf("app.use(\"*\", withRouteTiming())"), "OPTIONS preflight must be handled before route auth/timing stack");
check(!/Access-Control-Allow-Origin",\s*"\*"/.test(index), "Wildcard CORS origin must not be used with credentials");

includesAll(appEventsApi, [
  "fetch_stream",
  "polling_fallback",
  "connectStream",
  "Authorization",
  "Accept",
  "text/event-stream",
  "Last-Event-ID",
  "X-Request-ID",
  "/api/v1/app-events/stream",
  "/api/v1/app-events/since"
], "frontend event API");
check(!/stream\?token|stream.*access_token|EventSource\([^)]*token/i.test(appEventsApi + useAppEvents), "Frontend must not place auth tokens in stream URLs");

includesAll(useAppEvents, [
  "if (!input.enabled || !input.token || !input.user)",
  "appEventsApi.connectStream",
  "appEventsApi.since",
  "fallback_polling",
  "scheduleReconnect",
  "STREAM_RECONNECT_BASE_MS",
  "heartbeat",
  "parseSseFrame",
  "processedSet",
  "rememberEvent",
  "visibilitychange",
  "createCrossTabLeader",
  "sync.broadcastAppEvent",
  "routeAppEventInvalidation",
  "source: \"stream\"",
  "enqueueFrontendMetric",
  "setLiveEventHealth",
  "streamAbortController?.abort()",
  "pollAbortController?.abort()"
], "frontend live event hook");
check(!/localStorage\.setItem[\s\S]{0,200}(payload|salary|payroll|document|employee|bank)/i.test(useAppEvents), "Live event hook must not persist sensitive event payloads to localStorage");

includesAll(crossTabSync, [
  "BroadcastChannel",
  "storage",
  "safeEventForBroadcast",
  "createCrossTabLeader",
  "leader-heartbeat",
  "leader-release",
  "LEADER_TTL_MS",
  "LEADER_HEARTBEAT_MS",
  "source_tab_id",
  "query_keys"
], "cross-tab stream coordination");
check(!/payload\s*:/.test(crossTabSync.slice(crossTabSync.indexOf("safeEventForBroadcast"), crossTabSync.indexOf("function parseMessage"))), "Cross-tab app-event messages must not include payloads");

includesAll(liveStatus, [
  "AppEventClientStatus",
  "reconnectCount",
  "fallbackActive",
  "lastEventId",
  "recentEventCount",
  "streamError",
  "leader"
], "live event health store");

includesAll(invalidationRouter, [
  "source: \"stream\" | \"poll\" | \"cross-tab\"",
  "invalidateNotificationQueries",
  "invalidateOnboardingWorkspaceSlices",
  "invalidateEmployeeProfileSlices",
  "invalidateCommandCenterSummary",
  "background-jobs",
  "report-artifacts",
  "data_import",
  "data_export"
], "targeted invalidation router");
check(!invalidationRouter.includes("queryClient.clear()"), "Live event invalidation must not clear entire query cache");
check(!invalidationRouter.includes("invalidateQueries({ queryKey: queryKeys.scope(scope) })"), "Live event invalidation must not invalidate all app data for every event");

check(backgroundJobsHook.includes("liveEvents.healthy ? 30000 : 5000"), "Background job polling must remain reduced while live events are healthy");
includesAll(adminRoute + api + performancePage, [
  "/app-events/health",
  "getAppEventStreamHealth",
  "getAppEventHealth",
  "Live event stream health",
  "app_events_health",
  "d1_event_backlog_count",
  "recent_event_count",
  "stream_endpoint_enabled"
], "admin live-event diagnostics");

includesAll(docs, [
  "Phase 9 Recap",
  "Delivery Modes",
  "EventSource vs Fetch Stream",
  "No Token In URL Rule",
  "Backend Stream Endpoint",
  "Heartbeat And Reconnect",
  "Cursor And Last-Event-ID",
  "Cross-Tab Leader Coordination",
  "Polling Reduction",
  "Event Security And Sanitization",
  "Admin Health Diagnostics",
  "Troubleshooting",
  "Deferred Items"
], "Phase 19 documentation");
check(troubleshooting.includes("Live Events or Background Refresh Delayed"), "Troubleshooting guide missing live event stream guidance");
check(operations.includes("Phase 19 Live Event Stream Checks"), "Operations runbook missing Phase 19 live event checks");
check(checklist.includes("Phase 19 Live App Events"), "Production readiness checklist missing Phase 19 checks");

for (const script of [
  "verify:direct-r2-uploads-phase18",
  "verify:r2-cors-direct-upload-phase18",
  "verify:cloudflare-queues-phase17",
  "verify:queue-readiness-phase17",
  "verify:backup-restore-retention-phase16",
  "verify:admin-user-documentation-phase15",
  "verify:final-uiux-consistency-phase14",
  "verify:e2e-workflows-phase13",
  "verify:production-readiness-phase12",
  "verify:performance-observability-phase11",
  "verify:frontend-bundle-performance-phase10",
  "verify:realtime-events-phase9",
  "verify:reports-imports-snapshots-phase8",
  "verify:background-jobs-phase7",
  "verify:large-list-table-performance",
  "verify:document-upload-acceleration-background"
]) {
  check(Boolean(packageJson.scripts?.[script]), `Regression script missing: ${script}`);
}

check(/private,\s*no-store/i.test(`${appEventsRoute}\n${adminRoute}\n${workerTree}`), "Authenticated app event APIs must remain private/no-store");
check(!/console\.(log|debug|warn|error)\([^)]*(document_number|bank_account|net_salary|gross_salary|storage_key|r2_key|password|token|Authorization)/i.test(`${appEventsRoute}\n${appEventsUtil}\n${useAppEvents}\n${crossTabSync}`), "Live event code must not log sensitive payloads or credentials");
check(!/localStorage\.setItem[\s\S]{0,220}(salary|payroll|attendance|employee|document|bank|payload)/i.test(`${useAppEvents}\n${crossTabSync}\n${invalidationRouter}`), "Live event code must not store sensitive HR payloads in localStorage");
check(/binding\s*=\s*"DB"/.test(wrangler) && /database_name\s*=\s*"hrm-v2"/.test(wrangler), "D1 binding changed");
check(/binding\s*=\s*"DOCUMENTS_BUCKET"/.test(wrangler), "R2 binding changed");
check(/100000/.test(password), "PBKDF2 iteration guard changed");
check(!/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(frontendTree + workerTree), "browser alert/confirm/prompt introduced");
check(!/\bdark:/.test(frontendTree), "dark mode classes introduced");

if (failures.length) {
  console.error("Phase 19 SSE/live events verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Phase 19 SSE/live events verification passed.");
