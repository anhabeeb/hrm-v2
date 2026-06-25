import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const failures = [];

function must(condition, message) {
  if (!condition) failures.push(message);
}

function includes(file, marker) {
  return read(file).includes(marker);
}

const schema = read("database/schema.sql");
const seed = read("database/seed.sql");
const wrangler = read("worker/wrangler.toml");
const route = read("worker/src/routes/attendance-devices-zkteco.ts");
const index = read("worker/src/index.ts");
const api = read("frontend/src/lib/api.ts");
const routes = read("frontend/src/routes/AppRoutes.tsx");
const nav = read("frontend/src/components/attendance/AttendanceNav.tsx");

[
  "attendance_device_settings",
  "employee_biometric_mappings",
  "attendance_import_batches",
  "attendance_unmatched_logs",
  "attendance_locked_day_import_warnings",
  "attendance_import_row_errors",
  "attendance_vendor_integrations",
  "biometric_user_id",
  "duplicate_hash",
  "process_status",
  "locked_day_warning_id"
].forEach((marker) => must(schema.includes(marker), `schema missing ${marker}`));

[
  "parseZktecoCsvAttendance",
  "normalizeZktecoCsvRow",
  "detectZktecoCsvColumns",
  "createAttendanceImportBatch",
  "createAttendanceRawLogFromImportRow",
  "generateAttendanceRawLogDuplicateHash",
  "authenticateZktecoBridgeRequest",
  "ingestZktecoBridgeLogs",
  "validateZktecoBridgePayload",
  "ingestZktecoPushAdmsPayload",
  "validateZktecoPushAdmsDevice",
  "parseZktecoPushAdmsLogsPlaceholder",
  "matchRawLogToEmployee",
  "createUnmatchedAttendanceLog",
  "resolveUnmatchedAttendanceLog",
  "reprocessResolvedUnmatchedLogs",
  "normalizeAttendanceRawLogs",
  "normalizeRawLogsForEmployeeDate",
  "getRosterAwareAttendanceWorkday",
  "detectMissingPunchFromRawLogs",
  "detectDuplicatePunchesForDay",
  "detectOutOfOrderPunches",
  "applyNormalizedLogsToDailyAttendance",
  "refreshAttendanceDailyRecordFromRawLogs",
  "isAttendanceDayLockedForPayroll",
  "createLockedDayImportWarning",
  "preventLockedAttendanceOverwrite",
  "resolveLockedDayImportWarning"
].forEach((marker) => must(route.includes(marker), `route helper missing ${marker}`));

[
  "/devices/settings",
  "/import-batches/zkteco-csv",
  "/zkteco/local-bridge/logs",
  "/zkteco/push-adms",
  "/unmatched-logs",
  "/locked-day-import-warnings",
  "/vendor-integrations"
].forEach((marker) => must(route.includes(marker), `route missing ${marker}`));

[
  "attendance.devices.settings.view",
  "attendance.devices.settings.update",
  "attendance.biometric_mappings.manage",
  "attendance.import_batches.upload",
  "attendance.raw_logs.reprocess",
  "attendance.unmatched_logs.resolve",
  "attendance.locked_warnings.resolve",
  "attendance.device_diagnostics.view",
  "attendance.vendor_integrations.manage",
  "reports.attendance_devices.view"
].forEach((marker) => {
  must(seed.includes(marker), `seed missing permission ${marker}`);
  must(read("worker/src/db/permissions.ts").includes(marker), `permission registry missing ${marker}`);
});

must(index.includes("attendanceDeviceSyncRoutes"), "worker index does not mount Prompt 18 attendance routes");
must(exists("frontend/src/pages/AttendanceDeviceOperationsPage.tsx"), "AttendanceDeviceOperationsPage is missing");
[
  "getAttendanceDeviceSettings",
  "uploadZktecoCsvAttendance",
  "listBiometricMappings",
  "listAttendanceImportBatches",
  "listAttendanceUnmatchedLogs",
  "listAttendanceLockedDayWarnings",
  "getEmployeeAttendanceDeviceSummary",
  "getSelfServiceAttendanceDeviceSummary"
].forEach((marker) => must(api.includes(marker), `frontend api missing ${marker}`));

[
  "attendance/devices/settings",
  "attendance/biometric-mappings",
  "attendance/imports",
  "attendance/raw-logs",
  "attendance/unmatched-logs",
  "attendance/device-diagnostics",
  "attendance/device-reports"
].forEach((marker) => must(routes.includes(marker), `frontend route missing ${marker}`));

must(nav.includes("Device Reports") && nav.includes("Mappings") && nav.includes("Imports"), "attendance nav missing Prompt 18 links");
must(includes("frontend/src/components/attendance/EmployeeAttendancePanel.tsx", "Attendance Device Summary"), "Employee 360 attendance device summary missing");
must(includes("frontend/src/pages/SelfServicePage.tsx", "Biometric attendance summary"), "Self-service attendance device summary missing");
must(includes("worker/src/routes/reports.ts", "attendance-devices/raw-logs"), "attendance device reports missing");

must(wrangler.includes('database_name = "hrm-v2"'), "D1 database_name changed");
must(wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'), "D1 database_id changed");
must(wrangler.includes('bucket_name = "hrm-v2-documents"'), "R2 bucket changed");

[
  "frontend/src/pages/AttendanceDeviceOperationsPage.tsx",
  "frontend/src/components/attendance/AttendanceDeviceModal.tsx",
  "frontend/src/pages/AttendanceDevicesPage.tsx"
].forEach((file) => {
  const text = read(file);
  must(!/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(text), `${file} uses browser alert/confirm/prompt`);
});

if (failures.length) {
  console.error("Prompt 18 verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Prompt 18 verification passed.");
