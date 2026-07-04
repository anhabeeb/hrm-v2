import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function fail(message) {
  failures.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function section(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  if (start === -1) return "";
  const end = source.indexOf(endMarker, start + startMarker.length);
  return source.slice(start, end === -1 ? undefined : end);
}

function noBrowserPrompts(source, label) {
  assert(!/\b(?:window\.)?(alert|confirm|prompt)\s*\(/.test(source), `${label} uses browser alert/confirm/prompt.`);
}

const employees = read("worker/src/routes/employees.ts");
const lifecycle = read("worker/src/routes/lifecycle.ts");
const payrollFoundations = read("worker/src/routes/payroll-foundations.ts");
const authMiddleware = read("worker/src/middleware/auth.ts");
const authRoutes = read("worker/src/routes/auth.ts");
const usersDb = read("worker/src/db/users.ts");
const notifications = read("worker/src/routes/notifications.ts");
const appEvents = read("worker/src/utils/app-events.ts");
const appEventRoutes = read("worker/src/routes/app-events.ts");
const dashboard = read("worker/src/routes/dashboard.ts");
const schema = read("database/schema.sql");
const wrangler = read("worker/wrangler.toml");
const password = read("worker/src/auth/password.ts");
const liveVerifier = read("scripts/verify-live-authenticated-performance.mjs");

const employeeList = section(employees, 'employeeRoutes.get("/", requirePermission("employees.view")', 'employeeRoutes.get("/assignment-options"');
assert(employeeList.includes("parsePaginationParams(c, { defaultLimit: 25, maxLimit: 100 })"), "Employee list does not enforce server pagination and a hard max limit.");
assert(employeeList.includes("timeD1") && employeeList.includes("employees.list.lightweight"), "Employee list lacks D1 timing marker for the lightweight first-page query.");
assert(!/SELECT\s+e\.\*/i.test(employeeList), "Employee list still uses SELECT e.*.");
assert(!employeeList.includes("employee_documents") && !employeeList.includes("payroll_employee_results") && !employeeList.includes("employee_asset_assignments"), "Employee list appears to load Employee 360/optional module detail data.");
assert(!employeeList.includes("COUNT(*)"), "Employee list first page includes a blocking total count.");

const onboardingList = section(lifecycle, "async function listOnboardingCases", "function parseJsonArrayField");
assert(onboardingList.includes("parsePaginationParams(c, { defaultLimit: 25, maxLimit: 100 })"), "Onboarding case list does not enforce server pagination.");
assert(!/SELECT\s+oc\.\*/i.test(onboardingList), "Onboarding case list still uses SELECT oc.*.");
assert(!onboardingList.includes("getOnboardingWorkspace") && !onboardingList.includes("getEmployeeOnboardingReadiness"), "Onboarding case list appears to load workspace/readiness detail data.");
assert(onboardingList.includes("onboarding.cases.list.lightweight"), "Onboarding case list lacks lightweight D1 timing marker.");

assert(payrollFoundations.includes("fastPayrollSubmoduleDenied"), "Fast optional payroll submodule permission denial helper is missing.");
assert(payrollFoundations.indexOf("fastPayrollSubmoduleDenied") < payrollFoundations.indexOf("requireOperationalSubmoduleEnabled(c, \"payroll\""), "Optional payroll submodule denial does not run before expensive module/submodule checks.");
assert(payrollFoundations.includes("payroll.payment_institutions.view") && payrollFoundations.includes("payroll.pension_schemes.view"), "Payment institution/pension fast permission checks are missing granular permissions.");

assert(authMiddleware.includes("Promise.all") && authMiddleware.includes("timeStage(c, \"auth\""), "Auth middleware does not time/parallelize auth session lookup.");
assert(authMiddleware.includes("const sessionTouch = updateSessionLastSeen") && authMiddleware.includes("waitUntil(sessionTouch"), "Current session path still blocks on updateSessionLastSeen.");
assert(usersDb.includes("Promise.all") && usersDb.includes("getModuleVisibilityForUser"), "Session user enrichment was not parallelized before module visibility.");
assert(authRoutes.includes("waitUntil(auditWrite"), "Login audit logging is not deferred after response-critical work.");
assert(password.includes("PBKDF2_ITERATIONS = 100000") || password.includes("PBKDF2_ITERATIONS=100000") || password.includes("100000"), "PBKDF2 iteration marker is missing or changed.");

assert(dashboard.includes("dashboard_summary_snapshots") && dashboard.includes("snapshot_cache") && dashboard.includes("refreshing: true"), "Command Center snapshot/stale-refresh strategy marker is missing.");
assert(!/command-center-summary[\s\S]{0,500}SELECT\s+\*/i.test(dashboard), "Command Center summary appears to use broad row-array SELECT * near route handling.");

const unreadFunction = section(notifications, "export async function getUnreadNotificationCount", "async function ensureCanUpdateNotification");
assert(/SELECT\s+COUNT\(\*\)\s+AS\s+count/i.test(unreadFunction), "Notification unread-count does not use COUNT(*).");
assert(!unreadFunction.includes("baseNotificationRows"), "Notification unread-count still loads notification rows.");

assert(appEvents.includes("created_at > ?") && appEvents.includes("LIMIT ?") && appEvents.includes("limit * 2"), "App-events since query does not use cursor and bounded limit.");
assert(appEvents.includes("moduleEnabled") && appEvents.includes("new Map<string, boolean>"), "App-events since does not batch module visibility checks.");
const streamRoute = section(appEventRoutes, 'appEventRoutes.get("/stream"', "export");
assert(streamRoute.indexOf("event: \"stream.open\"") < streamRoute.indexOf("listAppEventsSince"), "App-events stream does not open before querying event batches.");

assert(schema.includes("idx_phase3_employees_created_active"), "Employee list active/created index is missing from schema.");
assert(schema.includes("idx_phase3_onboarding_activation_created"), "Onboarding activation/status/created index is missing from schema.");
assert(schema.includes("idx_notifications_user_read") && schema.includes("idx_notifications_employee_read") && schema.includes("idx_notifications_read_created"), "Notification unread-count indexes are missing from schema.");
assert(schema.includes("idx_app_events_company_created") && schema.includes("idx_app_events_user_created"), "App-events cursor/scope indexes are missing from schema.");
assert(read("scripts/audit-remote-d1-schema.mjs").includes("missing_indexes"), "Remote schema audit does not check missing indexes.");

assert(read("worker/src/utils/performance.ts").includes("timeStage") && read("worker/src/utils/performance.ts").includes("Server-Timing"), "Endpoint timing breakdown helper is missing.");
assert(liveVerifier.includes("Production Bottlenecks Remaining") && liveVerifier.includes("previousTimings") && liveVerifier.includes("thresholds.optionalForbidden"), "Live verifier was not updated with bottleneck comparison/strict optional 403 thresholds.");

assert(!/Cache-Control["']?\s*:\s*["']?public/i.test(`${authMiddleware}\n${employees}\n${lifecycle}\n${notifications}\n${appEventRoutes}`), "Authenticated HR API route files contain public cache markers.");
assert(read("worker/src/utils/cors.ts").toLowerCase().includes("x-request-id"), "CORS request-id hotfix marker is missing.");
assert(fs.existsSync(path.join(rootDir, "scripts", "verify:onboarding-save-stale-readiness-hotfix-v2".replace("verify:", "verify-") + ".mjs")) || fs.existsSync(path.join(rootDir, "scripts", "verify-onboarding-save-stale-readiness-hotfix-v2.mjs")), "Onboarding save/readiness hotfix verifier is missing.");

for (const [label, source] of [
  ["employees route", employees],
  ["lifecycle route", lifecycle],
  ["payroll foundations route", payrollFoundations],
  ["notifications route", notifications],
  ["app-events route", appEventRoutes],
  ["live verifier", liveVerifier]
]) {
  noBrowserPrompts(source, label);
}

const frontendEntryAndLayout = `${read("frontend/src/index.css")}\n${read("frontend/src/main.tsx")}\n${read("frontend/src/layouts/AppShell.tsx")}`;
assert(!frontendEntryAndLayout.includes(".dark") && !frontendEntryAndLayout.includes("darkMode"), "Dark mode marker was introduced.");
assert(wrangler.includes('binding = "DB"') && wrangler.includes('database_name = "hrm-v2"') && wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'), "D1 binding changed.");
assert(wrangler.includes('binding = "DOCUMENTS_BUCKET"') && wrangler.includes('bucket_name = "hrm-v2-documents"'), "R2 binding changed.");

if (failures.length) {
  console.error("Live performance bottleneck hotfix verification failed:");
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log("Live performance bottleneck hotfix verification passed.");
