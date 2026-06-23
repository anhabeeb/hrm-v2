import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const requiredSchemaTokens = [
  "CREATE TABLE IF NOT EXISTS attendance_logs",
  "module_enabled",
  "manual_entry_requires_approval",
  "correction_requires_approval",
  "payroll_impact_enabled",
  "default_attendance_source",
  "allow_manager_team_corrections",
  "require_reason_for_correction_review",
  "overtime_tracking_enabled",
  "lock_after_payroll_finalized",
  "monthly_attendance_lock_day",
  "default_absent_status",
  "attendance_source_options_json",
  "calculated_status",
  "final_status",
  "locked_for_payroll",
  "current_values_json",
  "requested_values_json",
  "'PENDING'"
];
const requiredStatusTokens = [
  "SICK_LEAVE",
  "LONG_LEAVE",
  "DAY_OFF",
  "PUBLIC_HOLIDAY",
  "MISSING_PUNCH",
  "CORRECTED"
];
const requiredBackendTokens = [
  "requireAttendanceModuleEnabled",
  "ATTENDANCE_MODULE_DISABLED",
  "getAttendanceSettings",
  "calculateDailyAttendanceStatus",
  "refreshDailyAttendanceRecord",
  "refreshAttendanceRange",
  "getEmployeeAttendanceCalendar",
  "getAttendancePayrollImpact",
  "applyAttendanceCorrection",
  "canManageAttendanceForEmployee",
  "canViewAttendanceForEmployee",
  "requireAttendanceRecordUnlocked",
  "attendance.lock.override",
  "attendance.corrections.create",
  "attendance.corrections.manage",
  "attendance.corrections.approve",
  "attendance.corrections.reject",
  "attendance.manage",
  "attendance.logs.manage",
  "attendance.daily.refresh",
  "attendance.payroll_impact.view",
  "attendanceSnapshot",
  "requested_values_json",
  "/logs/manual",
  "/daily/refresh",
  "/payroll-impact"
];
const requiredSelfServiceTokens = [
  "self_service.attendance.view",
  "self_service.attendance_correction.request",
  "requireSelfServiceAttendanceEnabled",
  "ATTENDANCE_MODULE_DISABLED",
  "allow_employee_correction_requests",
  "requested_values_json"
];
const requiredFrontendTokens = [
  "AttendanceManualLogModal",
  "module_enabled",
  "ATTENDANCE_MODULE_DISABLED",
  "attendanceDisabled",
  "Attendance module is disabled.",
  "listAttendanceLogs",
  "createManualAttendanceLog",
  "getAttendancePayrollImpact",
  "PENDING",
  "SICK_LEAVE",
  "LONG_LEAVE",
  "PUBLIC_HOLIDAY"
];

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function assertIncludes(label, text, tokens) {
  const missing = tokens.filter((token) => !text.includes(token));
  if (missing.length) throw new Error(`${label} missing: ${missing.join(", ")}`);
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const rel = relative(root, path).replaceAll("\\", "/");
    if (/(^|\/)(node_modules|\.git|dist|build|\.wrangler|\.cache|\.turbo|coverage)(\/|$)/.test(rel)) continue;
    if (statSync(path).isDirectory()) walk(path, files);
    else files.push(path);
  }
  return files;
}

assertIncludes("database/schema.sql", read("database/schema.sql"), [...requiredSchemaTokens, ...requiredStatusTokens]);
assertIncludes("database/seed.sql", read("database/seed.sql"), ["self_service.attendance.view", "self_service.attendance_correction.request", "attendance.lock.override"]);
assertIncludes("worker/src/routes/attendance.ts", read("worker/src/routes/attendance.ts"), [...requiredBackendTokens, ...requiredStatusTokens]);
assertIncludes("worker/src/routes/self-service.ts", read("worker/src/routes/self-service.ts"), requiredSelfServiceTokens);
assertIncludes("frontend attendance UI", [
  read("frontend/src/types/attendance.ts"),
  read("frontend/src/lib/api.ts"),
  read("frontend/src/pages/AttendanceRecordsPage.tsx"),
  read("frontend/src/pages/AttendanceCorrectionsPage.tsx"),
  read("frontend/src/pages/AttendanceSettingsPage.tsx"),
  read("frontend/src/components/attendance/AttendanceManualLogModal.tsx")
].join("\n"), requiredFrontendTokens);

const attendanceRoutes = read("worker/src/routes/attendance.ts");
assertIncludes("correction create compatibility", attendanceRoutes, ["attendance.corrections.create", "attendance.correct", "attendance.corrections.manage", "attendance.manage"]);
assertIncludes("correction approve compatibility", attendanceRoutes, ["attendance.corrections.approve", "attendance.approve_correction", "attendance.corrections.manage", "attendance.manage"]);
assertIncludes("correction reject compatibility", attendanceRoutes, ["attendance.corrections.reject", "attendance.approve_correction", "attendance.corrections.manage", "attendance.manage"]);
assertIncludes("daily status logic", attendanceRoutes, ["calculateDailyAttendanceStatus", "MISSING_PUNCH", "EARLY_LEAVE", "PENDING_CORRECTION", "SICK_LEAVE", "DAY_OFF", "PUBLIC_HOLIDAY"]);
assertIncludes("payroll lock logic", attendanceRoutes, ["locked_for_payroll", "attendance.lock.override", "requireAttendanceRecordUnlocked"]);

const attendanceFrontend = [
  read("frontend/src/components/attendance/AttendanceNav.tsx"),
  read("frontend/src/pages/AttendanceRecordsPage.tsx"),
  read("frontend/src/pages/AttendanceCalendarPage.tsx"),
  read("frontend/src/pages/AttendanceCorrectionsPage.tsx"),
  read("frontend/src/pages/AttendanceReportsPage.tsx"),
  read("frontend/src/pages/SelfServicePage.tsx")
].join("\n");
assertIncludes("frontend module-disabled awareness", attendanceFrontend, ["module_enabled", "ATTENDANCE_MODULE_DISABLED", "Attendance module is disabled.", "attendanceDisabled"]);

const attendanceUiFiles = walk(join(root, "frontend", "src")).filter((path) => /Attendance|attendance/.test(path));
const promptFiles = attendanceUiFiles.filter((path) => /window\.(prompt|confirm|alert)\s*\(/.test(readFileSync(path, "utf8")));
if (promptFiles.length) {
  throw new Error(`Prompt 8 attendance UI still uses browser prompt/confirm/alert: ${promptFiles.map((path) => relative(root, path)).join(", ")}`);
}

console.log("Prompt 8 verification passed.");
