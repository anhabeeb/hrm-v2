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

function listZipEntryNames(filePath) {
  const buffer = fs.readFileSync(filePath);
  const signature = 0x06054b50;
  const start = Math.max(0, buffer.length - 65557);
  let endOffset = -1;
  for (let offset = buffer.length - 22; offset >= start; offset -= 1) {
    if (buffer.readUInt32LE(offset) === signature) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw new Error(`Could not locate ZIP central directory for ${path.basename(filePath)}`);
  const entryCount = buffer.readUInt16LE(endOffset + 10);
  let cursor = buffer.readUInt32LE(endOffset + 16);
  const names = [];
  for (let index = 0; index < entryCount; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error(`Invalid ZIP central directory entry in ${path.basename(filePath)}`);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const name = buffer.slice(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    names.push(name);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

function validateRootZips() {
  const zipFiles = fs.readdirSync(root).filter((name) => name.endsWith(".zip"));
  for (const fileName of zipFiles) {
    for (const entryName of listZipEntryNames(path.join(root, fileName))) {
      check(`${fileName}: ZIP entry paths must use forward slashes`, !entryName.includes("\\"));
      check(`${fileName}: ZIP must not include forbidden generated or secret files`, !/(^|\/)(\.git|node_modules|\.wrangler|dist|build|\.cache|\.turbo|coverage)(\/|$)|\.log$|\.env(\.local)?$|\.dev\.vars$|\.zip$/i.test(entryName));
    }
  }
}

const packageJson = JSON.parse(read("package.json") || "{}");
const cors = read("worker/src/utils/cors.ts");
const index = read("worker/src/index.ts");
const appEventsRoute = read("worker/src/routes/app-events.ts");
const notificationsRoute = read("worker/src/routes/notifications.ts");
const useAppEvents = read("frontend/src/hooks/useAppEvents.ts");
const notificationBell = read("frontend/src/components/global/NotificationBell.tsx");
const notificationsApi = read("frontend/src/lib/notificationsApi.ts");
const preload = read("frontend/src/lib/preloadReferenceData.ts");
const phase21Remote = read("scripts/phase21-remote-d1-utils.mjs");
const frontendTree = readTree("frontend/src");
const workerTree = readTree("worker/src");

check("package.json: verify:production-hotfix-stream-notifications-preload script is registered", packageJson.scripts?.["verify:production-hotfix-stream-notifications-preload"] === "node scripts/verify-production-hotfix-stream-notifications-preload.mjs");

for (const marker of [
  "PRODUCTION_FRONTEND_ORIGIN",
  "https://hr.cafeasiana.com.mv",
  "CORS_ALLOWED_HEADERS",
  "X-Request-Id",
  "x-request-id",
  "Last-Event-ID",
  "Access-Control-Allow-Origin",
  "Access-Control-Allow-Credentials",
  "Access-Control-Allow-Headers",
  "Access-Control-Allow-Methods",
  "Vary"
]) {
  check(`worker/src/utils/cors.ts: missing ${marker}`, cors.includes(marker));
}
excludes("worker/src/utils/cors.ts", /Access-Control-Allow-Origin["',\s]+\*/i, "wildcard origin must not be used with credentialed CORS");

includes("worker/src/routes/app-events.ts", "applyCorsHeaders(c, \"Authorization, Origin, Last-Event-ID\")", "app-events route applies CORS before auth/errors");
check("worker/src/routes/app-events.ts: CORS middleware must run before requireAuth", appEventsRoute.indexOf("applyCorsHeaders") >= 0 && appEventsRoute.indexOf("requireAuth") >= 0 && appEventsRoute.indexOf("applyCorsHeaders") < appEventsRoute.indexOf("appEventRoutes.use(\"*\", requireAuth)"));
includes("worker/src/routes/app-events.ts", "getCorsHeaders(c.req.raw, c.env.CORS_ORIGIN", "stream headers include accepted CORS headers");
includes("worker/src/routes/app-events.ts", "return new Response(stream, { status: 200, headers: streamHeaders(c) })", "stream response must not omit CORS headers");
includes("worker/src/routes/app-events.ts", "\"Content-Type\": \"text/event-stream; charset=utf-8\"", "stream success returns text/event-stream");
includes("worker/src/routes/app-events.ts", "\"Cache-Control\": \"private, no-store\"", "stream response remains private/no-store");
includes("worker/src/routes/app-events.ts", "\"Vary\": \"Authorization, Origin, Last-Event-ID\"", "stream response varies by origin/auth/cursor");

includes("frontend/src/hooks/useAppEvents.ts", "STREAM_MAX_RECONNECT_ATTEMPTS", "stream retry attempts are capped");
includes("frontend/src/hooks/useAppEvents.ts", "STREAM_RETRY_WINDOW_MS", "stream uses safe retry window");
includes("frontend/src/hooks/useAppEvents.ts", "streamFallbackLocked", "stream unhealthy state is session/window locked");
includes("frontend/src/hooks/useAppEvents.ts", "pollFallback(\"stream-unhealthy\")", "broken stream falls back to polling");
includes("frontend/src/hooks/useAppEvents.ts", "pollFallback(\"stream-fallback-locked\")", "locked stream stays on polling fallback");
includes("frontend/src/hooks/useAppEvents.ts", "appEventsApi.since", "polling fallback remains");
check("frontend/src/hooks/useAppEvents.ts: aggressive unbounded stream retry must not exist", !/setTimeout\(\(\)\s*=>\s*void connectStream\(\),\s*STREAM_RECONNECT_BASE_MS\)/.test(useAppEvents));

includes("worker/src/routes/notifications.ts", "unreadCountFallback", "notification unread-count has safe runtime fallback");
includes("worker/src/routes/notifications.ts", "unavailable: true", "notification unread-count can return safe unavailable response");
includes("worker/src/routes/notifications.ts", "notifications_module_disabled", "disabled notifications module returns safe count fallback");
includes("worker/src/routes/notifications.ts", "NOTIFICATION_PERMISSION_DENIED", "notification permission errors remain explicit");
includes("frontend/src/lib/notificationsApi.ts", "UnreadNotificationCountResponse", "frontend models unavailable unread-count response");
includes("frontend/src/components/global/NotificationBell.tsx", "NOTIFICATION_FAILURE_BACKOFF_BASE_MS", "notification bell uses backoff base");
includes("frontend/src/components/global/NotificationBell.tsx", "NOTIFICATION_FAILURE_BACKOFF_MAX_MS", "notification bell caps backoff");
includes("frontend/src/components/global/NotificationBell.tsx", "notificationsUnavailable ? 0", "notification badge is hidden/zeroed when unavailable");
includes("frontend/src/components/global/NotificationBell.tsx", "markNotificationFailure", "notification failures are tracked quietly");
includes("frontend/src/components/global/NotificationBell.tsx", "failureBackoffActive()", "notification manual refresh respects backoff");

includes("frontend/src/lib/preloadReferenceData.ts", "canPreloadPaymentInstitutions", "payment institution preload is permission-aware");
includes("frontend/src/lib/preloadReferenceData.ts", "moduleEnabled(user, \"payroll_payment_institutions\")", "payment institution preload checks payroll submodule visibility");
includes("frontend/src/lib/preloadReferenceData.ts", "\"payroll.payment_institutions.view\"", "payment institution preload requires granular view permission");
includes("frontend/src/lib/preloadReferenceData.ts", "\"payroll.payment_institutions.manage\"", "payment institution preload allows manage permission");
includes("frontend/src/lib/preloadReferenceData.ts", "enabled: canPreloadPaymentInstitutions(input.user)", "payment institution preload uses the gate");
includes("frontend/src/lib/preloadReferenceData.ts", "catch", "reference preload still swallows unauthorized/background failures quietly");

for (const table of ["notifications", "notification_preferences", "app_events", "background_jobs", "performance_api_metrics"]) {
  check(`scripts/phase21-remote-d1-utils.mjs: remote schema live checks include ${table}`, phase21Remote.includes(`"${table}"`));
}

includes("worker/src/index.ts", "x-request-id", "CORS request-id hotfix remains in global middleware");
includes("worker/src/index.ts", "c.req.method === \"OPTIONS\"", "OPTIONS preflight remains before auth routes");
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

validateRootZips();

if (failures.length) {
  console.error("Production stream/notification/preload hotfix verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Production stream/notification/preload hotfix verification passed.");
