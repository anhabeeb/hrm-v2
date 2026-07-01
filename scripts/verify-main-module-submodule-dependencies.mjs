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

function hasNo(relativePath, pattern, message) {
  const text = read(relativePath);
  if (pattern.test(text)) failures.push(`${relativePath}: ${message}`);
}

function requireScript(scriptName) {
  const pkg = JSON.parse(read("package.json"));
  if (!pkg.scripts?.[scriptName]) failures.push(`package.json: missing ${scriptName}`);
}

[
  "worker/src/utils/module-enforcement.ts",
  "worker/src/routes/attendance.ts",
  "worker/src/routes/payroll.ts",
  "frontend/src/pages/AttendanceSettingsPage.tsx",
  "frontend/src/pages/SettingsPage.tsx",
  "frontend/src/pages/PayrollDashboardPage.tsx",
  "frontend/src/pages/PayrollAdminPages.tsx",
  "frontend/src/pages/PayrollRunDetailPage.tsx",
  "frontend/src/types/payroll.ts",
  "database/seed.sql",
  "scripts/audit-remote-d1-schema.mjs",
  "scripts/generate-remote-d1-repair.mjs",
  "scripts/verify-remote-d1-schema-ready.mjs",
  "scripts/remote-d1-schema-utils.mjs"
].forEach((file) => {
  if (!exists(file)) failures.push(`${file}: required file is missing`);
});

requireScript("verify:main-module-submodule-dependencies");

has("worker/src/utils/module-enforcement.ts", "getOperationalSubmoduleState", "must expose explicit parent/submodule state helper");
has("worker/src/utils/module-enforcement.ts", "parent_disabled", "disabled submodule response must expose parent-disabled metadata");
has("worker/src/utils/module-enforcement.ts", /if \(!\(await isOperationalModuleEnabled\(db, normalizedModule\)\)\) \{\s*return \{ enabled: false, parentDisabled: true/s, "submodule state must short-circuit when parent module is disabled");
has("worker/src/utils/module-enforcement.ts", /disabledSubmoduleResponse\(c, state\.module, state\.submodule, submoduleLabel, \{ parentDisabled: state\.parentDisabled \}\)/, "submodule enforcement must pass parent-disabled state into the response");
hasNo("worker/src/utils/module-enforcement.ts", /case "payroll":[\s\S]{0,260}attendance_settings/, "Payroll must not depend on Attendance module settings for module visibility");
hasNo("worker/src/utils/module-enforcement.ts", /case "roster":[\s\S]{0,260}attendance_settings/, "Roster must not depend on Attendance module settings for module visibility");
hasNo("worker/src/utils/module-enforcement.ts", /case "leave":[\s\S]{0,260}attendance_settings/, "Leave must not depend on Attendance module settings for module visibility");

has("frontend/src/pages/SettingsPage.tsx", "AttendanceDisableDialog", "Attendance disable must use a confirmation dialog");
has("frontend/src/pages/SettingsPage.tsx", "module_disable_reason", "Attendance disable must send a required reason to the backend");
has("frontend/src/pages/SettingsPage.tsx", "module_disable_effective_mode", "Attendance disable must send effective timing");
has("frontend/src/pages/SettingsPage.tsx", "module_disable_effective_date", "Attendance disable must send effective date metadata");
has("frontend/src/pages/SettingsPage.tsx", "Disabled because {parentDisabledLabel} is disabled.", "submodule toggle tooltip must explain parent-disabled state");
has("frontend/src/pages/SettingsPage.tsx", "submoduleParentDisabledReason", "Settings UI must compute parent-disabled submodule state");
has("frontend/src/pages/SettingsPage.tsx", "setAttendanceDisableRequest", "Attendance disable must not save immediately without confirmation");
has("frontend/src/pages/SettingsPage.tsx", "payroll", "Settings UI must keep Payroll independently configurable");
has("frontend/src/pages/SettingsPage.tsx", "roster", "Settings UI must keep Roster independently configurable");
has("frontend/src/pages/SettingsPage.tsx", "leave", "Settings UI must keep Leave page separate from Attendance");

has("worker/src/routes/attendance.ts", "ATTENDANCE_DISABLE_EFFECTIVE_MODES", "Attendance disable must validate effective date choices");
has("worker/src/routes/attendance.ts", "REASON_REQUIRED", "Attendance disable must require a reason");
has("worker/src/routes/attendance.ts", "PAYROLL_PERIOD_LOCKED", "Attendance disable must protect locked payroll periods for selected effective dates");
has("worker/src/routes/attendance.ts", "attendance.settings.disabled", "Attendance disable must write a specific audit event");
has("worker/src/routes/attendance.ts", "ATTENDANCE_DISABLE_PAYROLL_WARNING", "Attendance disable audit must preserve payroll warning");
hasNo("worker/src/routes/attendance.ts", /monthly_attendance_lock_day[\s\S]{0,180}module_enabled[\s\S]{0,180}return fail/, "Attendance disable must not be blocked by a monthly 1-30 day hard window");
has("worker/src/routes/attendance.ts", "function optionalInteger", "Attendance settings must use a dedicated optional integer parser");
has("worker/src/routes/attendance.ts", "if (value === null) return null", "Optional integer parser must preserve explicit null/blank as null");
has("worker/src/routes/attendance.ts", "typeof value === \"string\" && value.trim() === \"\"", "Optional integer parser must treat blank strings as null");
has("worker/src/routes/attendance.ts", "Number.isInteger(parsed)", "Optional integer parser must reject decimals");
hasNo("worker/src/routes/attendance.ts", /monthly_attendance_lock_day:\s*num\(/, "monthly_attendance_lock_day must not use Number(\"\")-affected generic num parser");
has("worker/src/routes/attendance.ts", "!Number.isInteger(input.monthly_attendance_lock_day)", "Monthly lock day validation must reject non-integers while allowing null");
has("worker/src/routes/attendance.ts", "SET monthly_attendance_lock_day = NULL", "Attendance settings route must repair invalid lock-day values to null");
has("worker/src/routes/attendance.ts", "monthly_attendance_lock_day != CAST(monthly_attendance_lock_day AS INTEGER)", "Attendance lock-day repair must catch decimal values");

has("frontend/src/pages/AttendanceSettingsPage.tsx", "normalizeMonthlyAttendanceLockDay", "Attendance settings frontend must sanitize monthly lock day before submit");
has("frontend/src/pages/AttendanceSettingsPage.tsx", "monthly_attendance_lock_day: normalizedLockDay", "Attendance settings frontend must send sanitized lock day value");
has("frontend/src/pages/AttendanceSettingsPage.tsx", "value === \"\" || value === null || value === undefined", "Attendance settings frontend must convert blank lock day to null");
has("frontend/src/pages/AttendanceSettingsPage.tsx", "!Number.isInteger(normalizedLockDay)", "Attendance settings frontend must reject decimal lock-day values before submit");
has("frontend/src/pages/AttendanceSettingsPage.tsx", "Monthly attendance lock day must be between 1 and 31.", "Attendance settings frontend must show field-level validation");

has("worker/src/routes/payroll.ts", "PAYROLL_ATTENDANCE_DISABLED_NOTICE", "Payroll must carry the required attendance-disabled warning");
has("worker/src/routes/payroll.ts", "getPayrollAttendanceSummaryForRun", "Payroll must use a central attendance summary helper");
has("worker/src/routes/payroll.ts", "if (!attendanceEnabledForPayroll) return emptyPayrollAttendanceSummary()", "Payroll attendance helper must skip Attendance queries when disabled");
has("worker/src/routes/payroll.ts", "await isOperationalModuleEnabled(c.env.DB, \"attendance\")", "Payroll must read Attendance module state before calculation/dashboard reports");
has("worker/src/routes/payroll.ts", "attendanceEnabledForPayroll && bool(settings.include_attendance_deductions", "Payroll deductions must be gated by Attendance module state");
has("worker/src/routes/payroll.ts", "attendance_module_enabled", "Payroll snapshots/dashboard must expose Attendance module state");
has("worker/src/routes/payroll.ts", "attendanceCandidatesSql", "Payroll dashboard must avoid Attendance candidate SQL when disabled");
has("worker/src/routes/payroll.ts", "attendance_module_enabled: false", "Attendance deduction report must return a disabled state when Attendance is off");

has("frontend/src/types/payroll.ts", "attendance_module_enabled?: boolean", "Payroll dashboard type must include Attendance module state");
has("frontend/src/types/payroll.ts", "attendance_disabled_notice?: string | null", "Payroll dashboard type must include disabled warning");
has("frontend/src/pages/PayrollDashboardPage.tsx", "attendanceModuleEnabled", "Payroll dashboard must derive Attendance-enabled UI state");
has("frontend/src/pages/PayrollDashboardPage.tsx", "WarningPanel tone=\"warning\"", "Payroll dashboard must show disabled Attendance warning");
has("frontend/src/pages/PayrollDashboardPage.tsx", "...(attendanceModuleEnabled ? [{ label: \"Attendance candidates\"", "Payroll dashboard must hide Attendance candidate card when disabled");
has("frontend/src/pages/PayrollAdminPages.tsx", "attendanceModuleEnabled", "Payroll settings/reports must use Attendance module visibility");
has("frontend/src/pages/PayrollAdminPages.tsx", "disabled={!canManageSettings || !attendanceModuleEnabled}", "Attendance deduction setting must be disabled when Attendance is disabled");
has("frontend/src/pages/PayrollAdminPages.tsx", "reportOptions", "Payroll report selector must be filtered by module visibility");
has("frontend/src/pages/PayrollAdminPages.tsx", "if (!attendanceModuleEnabled && report === \"attendance\")", "Payroll report frontend must skip stale attendance report requests");
has("frontend/src/pages/PayrollRunDetailPage.tsx", "attendanceNoticeFromCalculation", "Payroll run detail must read attendance-disabled snapshot state");
has("frontend/src/pages/PayrollRunDetailPage.tsx", "PAYROLL_ATTENDANCE_DISABLED_NOTICE", "Payroll run detail must show disabled Attendance warning");

has("database/seed.sql", "UPDATE attendance_settings", "Seed/repair flow must normalize invalid attendance lock-day data");
has("database/seed.sql", "SET monthly_attendance_lock_day = NULL", "Seed/repair flow must repair invalid lock-day values to null");
has("scripts/remote-d1-schema-utils.mjs", "attendanceMonthlyLockDayInvalidWhere", "Remote repair tooling must share attendance lock-day invalid predicate");
has("scripts/audit-remote-d1-schema.mjs", "dataRepairIssues", "Remote audit must report invalid attendance lock-day data");
has("scripts/generate-remote-d1-repair.mjs", "dataRepairStatements", "Remote repair generator must emit data repair statements");
has("scripts/generate-remote-d1-repair.mjs", "SET ${quoteIdent(\"monthly_attendance_lock_day\")} = NULL", "Remote repair generator must repair invalid lock-day data to null");
has("scripts/verify-remote-d1-schema-ready.mjs", "data_repair_issues", "Remote readiness must fail until data repair issues are resolved");

for (const file of [
  "frontend/src/pages/AttendanceSettingsPage.tsx",
  "frontend/src/pages/SettingsPage.tsx",
  "frontend/src/pages/PayrollDashboardPage.tsx",
  "frontend/src/pages/PayrollAdminPages.tsx",
  "frontend/src/pages/PayrollRunDetailPage.tsx"
]) {
  hasNo(file, /\b(window\.)?(alert|confirm|prompt)\s*\(/, "must not use browser alert/confirm/prompt");
}

has("worker/wrangler.toml", 'binding = "DB"', "D1 binding must remain DB");
has("worker/wrangler.toml", 'database_name = "hrm-v2"', "D1 database name must remain hrm-v2");
has("worker/wrangler.toml", 'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"', "D1 database id must remain unchanged");
has("worker/wrangler.toml", 'binding = "DOCUMENTS_BUCKET"', "R2 binding must remain DOCUMENTS_BUCKET");
has("worker/wrangler.toml", 'bucket_name = "hrm-v2-documents"', "R2 bucket must remain unchanged");
has("worker/src/auth/password.ts", "100000", "PBKDF2 iteration count must remain 100000");
for (const file of [
  "frontend/src/pages/AttendanceSettingsPage.tsx",
  "frontend/src/pages/SettingsPage.tsx",
  "frontend/src/pages/PayrollDashboardPage.tsx",
  "frontend/src/pages/PayrollAdminPages.tsx",
  "frontend/src/pages/PayrollRunDetailPage.tsx"
]) {
  hasNo(file, /\bdark:\S+/, "dark mode utility classes must not be introduced");
}

if (failures.length) {
  console.error("Main module/submodule dependency verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Main module/submodule dependency verification passed.");
