import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
let failed = false;

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function pass(message) {
  console.log(`PASS: ${message}`);
}

function fail(message) {
  failed = true;
  console.error(`FAIL: ${message}`);
}

function check(condition, message) {
  if (condition) pass(message);
  else fail(message);
}

function has(file, marker, message = `${file} contains ${marker}`) {
  check(read(file).includes(marker), message);
}

function hasAll(file, markers, message) {
  const source = read(file);
  check(markers.every((marker) => source.includes(marker)), message);
}

function walk(dir, predicate = () => true) {
  const absolute = path.join(root, dir);
  if (!fs.existsSync(absolute)) return [];
  const files = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (["node_modules", "dist", "build", ".wrangler"].includes(entry.name)) continue;
    const full = path.join(absolute, entry.name);
    const relative = path.relative(root, full).replaceAll("\\", "/");
    if (entry.isDirectory()) files.push(...walk(relative, predicate));
    else if (predicate(relative)) files.push(relative);
  }
  return files;
}

const alertFiles = [
  "frontend/src/components/alerts/useAlert.ts",
  "frontend/src/components/alerts/AlertProvider.tsx",
  "frontend/src/components/alerts/AlertViewport.tsx",
  "frontend/src/components/alerts/PopupAlertCard.tsx",
  "frontend/src/lib/alert-utils.ts"
];

for (const file of alertFiles) check(exists(file), `${file} exists`);

hasAll("frontend/src/components/alerts/useAlert.ts", [
  "showSuccess",
  "showError",
  "showWarning",
  "showInfo",
  "showValidationError",
  "showPermissionDenied",
  "showModuleDisabled",
  "showLoading",
  "dismissAlert",
  "clearAlerts"
], "global alert hook exposes required helpers");

hasAll("frontend/src/components/alerts/AlertProvider.tsx", [
  "AlertContext.Provider",
  "AlertViewport",
  "hrm-v2-session-expired",
  "showSessionExpired",
  "showApiError",
  "getAlertDuration",
  "alertDedupeKey"
], "global alert provider handles session, API errors, auto-dismiss, and dedupe");
hasAll("frontend/src/components/alerts/AlertProvider.tsx", [
  "alertTimers",
  "scheduledDurations",
  "window.setTimeout",
  "window.clearTimeout",
  "clearAlertTimer",
  "setAlerts((current) => current.filter((item) => item.id !== alert.id))"
], "global alert provider removes popup alerts from state/DOM after per-alert timeout");
hasAll("frontend/src/components/alerts/AlertProvider.tsx", [
  "clearAlertTimer(id)",
  "setAlerts((current) => current.filter((alert) => alert.id !== id))"
], "manual close clears the timer and removes the alert immediately");
hasAll("frontend/src/components/alerts/AlertProvider.tsx", [
  "alreadyScheduledForDuration",
  "scheduledDurations.current.get(alert.id) === duration",
  "if (alreadyScheduledForDuration) continue;"
], "existing popup alert timeout does not reset on unrelated rerenders");
hasAll("frontend/src/components/alerts/AlertProvider.tsx", [
  "persistent: input.persistent === true",
  "autoDismissMs: getAlertDuration(input)",
  "type: \"loading\", title, message, persistent: true"
], "persistent popup behavior is explicit and normal alerts receive normalized durations");
check(!read("frontend/src/components/alerts/AlertProvider.tsx").includes("autoDismissMs: null"), "global alert provider does not make popups permanent through null duration");

hasAll("frontend/src/components/alerts/AlertViewport.tsx", [
  "createPortal",
  "document.body",
  "fixed",
  "z-[1000]",
  "Global alerts"
], "global alert viewport is fixed, portal-based, and high z-index");

hasAll("frontend/src/components/alerts/PopupAlertCard.tsx", [
  "role={isAssertive ? \"alert\" : \"status\"}",
  "aria-live",
  "session-expired",
  "alert.action.variant",
  "success",
  "error",
  "warning",
  "info",
  "loading",
  "validation",
  "permission",
  "module-disabled",
  "session-expired"
], "global popup card supports required alert types and accessible live regions");
check(!read("frontend/src/components/alerts/PopupAlertCard.tsx").includes("\"session\"].includes(alert.type)"), "session-expired alerts are assertive instead of checking legacy session type");
check(read("frontend/src/components/alerts/PopupAlertCard.tsx").includes("variant={alert.action.variant ?? \"outline\"}"), "popup alert action button respects action.variant with neutral fallback");

hasAll("frontend/src/lib/alert-utils.ts", [
  "sanitizeAlertMessage",
  "[\"D1\", \"ERROR\"].join(\"_\")",
  "[\"SQLITE\", \"ERROR\"].join(\"_\")",
  "mapApiErrorToAlert",
  "status === 400",
  "status === 401",
  "status === 403",
  "status === 409",
  "status === 422",
  "status === 429",
  "status >= 500",
  "isModuleDisabledError"
], "API error mapping sanitizes internals and handles required status categories");
hasAll("frontend/src/lib/alert-utils.ts", [
  "getAlertDuration",
  "alert.persistent === true",
  "Number(alert.durationMs ?? alert.duration ?? alert.autoDismissMs)",
  "Number.isFinite(explicit) && explicit > 0",
  "Math.min(Math.max(explicit, 1000), 30000)",
  "return defaultAutoDismissMs(alert.type)"
], "alert duration handling clamps invalid/missing values to safe finite defaults");
hasAll("frontend/src/lib/alert-utils.ts", [
  "if (type === \"success\") return 3500",
  "if (type === \"info\") return 4000",
  "if (type === \"warning\" || type === \"validation\") return 6000",
  "if (type === \"error\" || type === \"permission\" || type === \"module-disabled\" || type === \"session-expired\") return 7000"
], "success/info/warning/error popup defaults are finite and auto-dismissable");

const app = read("frontend/src/app/App.tsx");
check((app.match(/<AlertProvider>/g) ?? []).length === 1, "App mounts exactly one global AlertProvider");
check(app.indexOf("<AlertProvider>") < app.indexOf("<AuthProvider>"), "AlertProvider wraps auth so login page can use global popups");

hasAll("frontend/src/pages/LoginPage.tsx", [
  "useAlert",
  "showValidationError",
  "showSuccess",
  "showError",
  "showSessionExpired",
  "showApiError",
  "emailError",
  "passwordError"
], "login page uses global popups while preserving field-level validation");
check(!read("frontend/src/pages/LoginPage.tsx").includes("setNotice"), "login page does not use legacy notice state");

const workflowCoverage = [
  ["frontend/src/pages/EmployeesPage.tsx", ["useAlert", "showSuccess", "showValidationError", "showApiError"], "employee create/edit/status actions use global alerts"],
  ["frontend/src/pages/UsersAccessPage.tsx", ["useAlert", "showSuccess", "showApiError"], "users and access actions use global alerts"],
  ["frontend/src/pages/LifecyclePage.tsx", ["useAlert", "showSuccess", "showApiError"], "onboarding workspace actions use global alerts"],
  ["frontend/src/components/leave/LeaveRequestModal.tsx", ["useAlert", "showSuccess", "showValidationError", "showApiError"], "leave request workflow uses global alerts"],
  ["frontend/src/pages/LeaveRequestsPage.tsx", ["useAlert", "showSuccess", "showValidationError", "showApiError"], "leave approval/cancel workflow uses global alerts"],
  ["frontend/src/components/attendance/AttendanceCorrectionModal.tsx", ["useAlert", "showSuccess", "showValidationError", "showApiError"], "attendance correction workflow uses global alerts"],
  ["frontend/src/components/roster/RosterAssignmentModal.tsx", ["useAlert", "showSuccess", "showValidationError", "showApiError"], "roster assignment workflow uses global alerts"],
  ["frontend/src/components/employee/EmployeeDocumentsPanel.tsx", ["useAlert", "showSuccess", "showValidationError", "showApiError"], "employee document workflow uses global alerts"],
  ["frontend/src/components/assets/EmployeeAssetsPanel.tsx", ["useAlert", "showSuccess", "showValidationError", "showApiError"], "asset assignment workflow uses global alerts"],
  ["frontend/src/pages/AssetUniformAdvancedPages.tsx", ["useAlert", "showSuccess", "showApiError"], "asset/uniform settings use global alerts"],
  ["frontend/src/components/payroll/EmployeePayrollPanel.tsx", ["useAlert", "showSuccess", "showValidationError", "showApiError"], "employee payroll workflow uses global alerts"],
  ["frontend/src/components/payroll/EmployeePayrollFoundationPanels.tsx", ["useAlert", "showSuccess", "showValidationError", "showApiError"], "payroll foundation workflow uses global alerts"],
  ["frontend/src/components/import/ImportWizard.tsx", ["useAlert", "showSuccess", "showValidationError", "showApiError"], "import wizard download/upload/validate/apply actions use global alerts"],
  ["frontend/src/pages/DataTransferPage.tsx", ["useAlert", "showSuccess", "showValidationError", "showApiError"], "data transfer import/export/admin actions use global alerts"],
  ["frontend/src/pages/ApprovalsPage.tsx", ["useAlert", "showSuccess", "showValidationError", "showApiError"], "central approval workflow actions use global alerts"],
  ["frontend/src/pages/ContractsPage.tsx", ["useAlert", "showSuccess", "showValidationError", "showApiError"], "contract workflow actions use global alerts"],
  ["frontend/src/pages/FinalSettlementPage.tsx", ["useAlert", "showSuccess", "showValidationError", "showApiError"], "exit payroll/final settlement workflow actions use global alerts"],
  ["frontend/src/pages/DocumentCompliancePage.tsx", ["useAlert", "showSuccess", "showValidationError", "showApiError"], "document compliance workflow actions use global alerts"],
  ["frontend/src/pages/AttendanceRecordsPage.tsx", ["useAlert", "showSuccess", "showValidationError", "showApiError"], "attendance record recalculation/import actions use global alerts"],
  ["frontend/src/pages/AttendanceCorrectionsPage.tsx", ["useAlert", "showSuccess", "showApiError"], "attendance correction review actions use global alerts"],
  ["frontend/src/pages/AttendanceDevicesPage.tsx", ["useAlert", "showSuccess", "showInfo", "showApiError"], "attendance device registry actions use global alerts"],
  ["frontend/src/pages/AttendanceDeviceOperationsPage.tsx", ["useAlert", "showSuccess", "showValidationError", "showApiError"], "attendance device operation actions use global alerts"],
  ["frontend/src/pages/PayrollRunsPage.tsx", ["useAlert", "showSuccess", "showValidationError", "showApiError"], "payroll run actions use global alerts"],
  ["frontend/src/pages/PayrollRunDetailPage.tsx", ["useAlert", "showSuccess", "showValidationError", "showApiError"], "payroll run detail actions use global alerts"],
  ["frontend/src/pages/PayrollAdminPages.tsx", ["useAlert", "showSuccess", "showValidationError", "showApiError"], "payroll admin save/action/export workflows use global alerts"],
  ["frontend/src/pages/ReportsPage.tsx", ["useAlert", "showSuccess", "showApiError"], "report export workflow uses global alerts"],
  ["frontend/src/pages/KycRequestsPage.tsx", ["useAlert", "showSuccess", "showValidationError", "showApiError"], "KYC review workflow uses global alerts"],
  ["frontend/src/pages/MissingDocumentsPage.tsx", ["useAlert", "showSuccess", "showValidationError", "showApiError"], "missing document upload workflow uses global alerts"]
];
for (const [file, markers, message] of workflowCoverage) hasAll(file, markers, message);

has("frontend/src/components/forms/FormErrorSummary.tsx", "FormErrorSummary", "field-level form error summary remains available");
has("frontend/src/components/forms/FieldError.tsx", "FieldError", "field-level error component remains available");
has("frontend/src/components/forms/ValidationSummary.tsx", "ValidationSummary", "validation summary component remains available");

const frontendFiles = walk("frontend/src", (file) => /\.(ts|tsx)$/.test(file));
const demoAlertPatterns = [
  /Error Area/i,
  /Warning Area/i,
  /Alert Area/i,
  /Demo alert/i,
  /Test alert/i,
  /Debug alert/i,
  /Global alert test/i,
  /warning demo/i,
  /error demo/i,
  /alert playground/i,
  /sample warning/i,
  /sample error/i,
  /sample test/i
];
const legacyPatterns = [
  /\buseToast\b/,
  /\bshowToast\b/,
  /\bToastProvider\b/,
  /\bToaster\b/,
  /\btoast\./,
  /\bnotify\s*\(/,
  /\bshowNotification\b/,
  /\bNotificationProvider\b/,
  /\bWorkspaceNoticePopup\b/,
  /\bAlertToast\b/
];
for (const file of frontendFiles) {
  const source = read(file);
  for (const pattern of demoAlertPatterns) {
    check(!pattern.test(source), `${file} has no production demo/debug alert area marker ${pattern}`);
  }
  for (const pattern of legacyPatterns) {
    check(!pattern.test(source), `${file} does not use legacy toast/local popup marker ${pattern}`);
  }
  check(!/\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/.test(source), `${file} has no browser alert/confirm/prompt`);
  if (file === "frontend/src/lib/alert-utils.ts") {
    check(!/D1_ERROR|SQLITE_ERROR/i.test(source), `${file} avoids literal database error tokens while sanitizing them`);
  } else {
    check(!/D1_ERROR|SQLITE_ERROR|no such table|no such column/i.test(source), `${file} does not expose raw database internals`);
  }
  check(!/\bdark:/.test(source), `${file} does not add dark mode classes`);
}

check(!exists("frontend/src/components/ui/toast.tsx"), "legacy shadcn toast primitive is not present");
check(!exists("frontend/src/components/ui/toaster.tsx"), "legacy shadcn toaster component is not present");
check(!exists("frontend/src/hooks/use-toast.ts"), "legacy use-toast hook is not present");

hasAll("worker/wrangler.toml", [
  'binding = "DB"',
  'database_name = "hrm-v2"',
  'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"',
  'binding = "DOCUMENTS_BUCKET"',
  'bucket_name = "hrm-v2-documents"'
], "D1 and R2 bindings remain unchanged");

check(read("worker/src/auth/password.ts").includes("100000"), "PBKDF2 remains capped at 100000");
check(exists("scripts/verify-frontend-static-assets.mjs"), "frontend static asset verifier remains present");
check(exists("scripts/verify-frontend-bundle-integrity.mjs"), "frontend bundle integrity verifier remains present");
check(exists("scripts/verify-filter-search-date-standardization.mjs"), "filter/search/date verifier remains present");
check(exists("scripts/verify-command-center-dashboard.mjs"), "Command Center verifier remains present");

if (failed) {
  console.error("Global popup alert verification failed.");
  process.exit(1);
}

console.log("Global popup alert verification passed.");
