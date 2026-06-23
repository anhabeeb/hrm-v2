import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const failures = [];

function requireIncludes(file, needles) {
  const text = read(file);
  for (const needle of needles) {
    if (!text.includes(needle)) failures.push(`${file} missing: ${needle}`);
  }
}

function walk(dir, predicate, files = []) {
  for (const entry of readdirSync(join(root, dir))) {
    const path = join(dir, entry);
    const full = join(root, path);
    if (statSync(full).isDirectory()) walk(path, predicate, files);
    else if (predicate(path)) files.push(path);
  }
  return files;
}

requireIncludes("database/schema.sql", [
  "CREATE TABLE IF NOT EXISTS roster_settings",
  "CREATE TABLE IF NOT EXISTS shift_templates",
  "CREATE TABLE IF NOT EXISTS roster_periods",
  "CREATE TABLE IF NOT EXISTS roster_assignments",
  "module_enabled",
  "employee_self_service_roster_visibility_enabled",
  "expected_work_minutes",
  "LOCKED",
  "changed_after_publish"
]);

requireIncludes("database/seed.sql", [
  "roster.settings.view",
  "roster.settings.update",
  "roster.shift_templates.create",
  "roster.shift_templates.archive",
  "roster.periods.publish",
  "roster.periods.unpublish",
  "roster.periods.lock",
  "roster.assignments.bulk_update",
  "roster.assignments.copy_week",
  "self_service.roster.view",
  "attendance.roster_context.view",
  "leave.roster_context.view"
]);

requireIncludes("worker/src/db/permissions.ts", [
  "roster.shift_templates.manage",
  "roster.assignments.override_lock",
  "self_service.roster.view",
  "attendance.roster_context.view",
  "leave.roster_context.view"
]);

requireIncludes("worker/src/routes/roster.ts", [
  "getRosterSettings",
  "requireRosterModuleEnabled",
  "calculateShiftExpectedMinutes",
  "validateRosterAssignment",
  "detectRosterConflicts",
  "canAssignEmployeeToRoster",
  "canEditRosterPeriod",
  "getRosterAssignmentForEmployeeDate",
  "getRosterScheduleForAttendance",
  "isEmployeeScheduledToWork",
  "refreshAttendanceFromRosterChange",
  "getRosterWorkRequirementForLeaveDate",
  "getRosterAssignmentsForLeaveRange",
  "applyRosterAwareLeaveDayContext",
  "getEmployeeSelfServiceRoster",
  "/periods/:id/unpublish",
  "/periods/:id/lock",
  "/periods/:id/unlock",
  "/assignments/:id/cancel",
  "/assignments/bulk",
  "/assignments/copy-week",
  "published_snapshot_json",
  "changed_after_publish",
  "change_reason",
  "assignment_date",
  "assignment_type",
  "expected_work_minutes",
  "location_id",
  "department_id",
  "cancelled_by_user_id",
  "cancelled_at",
  "CROSS_WORKSITE_PERMISSION_REQUIRED",
  "roster.assignments.cross_worksite",
  'status: "CANCELLED"',
  '"ARCHIVED"',
  "archived_by_user_id",
  "archived_at"
]);

const rosterRouteText = read("worker/src/routes/roster.ts");
const forbiddenStatusCollapses = [
  'status === "DAY_OFF") return "OFF"',
  'status === "SICK_LEAVE"',
  'status === "LONG_LEAVE"',
  'status === "CANCELLED") return "UNASSIGNED"',
  'status === "CHANGED_AFTER_PUBLISH") return "SCHEDULED"'
];
for (const forbidden of forbiddenStatusCollapses) {
  if (rosterRouteText.includes(forbidden)) failures.push(`worker/src/routes/roster.ts still collapses Prompt 9 assignment status: ${forbidden}`);
}
if (!rosterRouteText.includes("SELECT * FROM roster_assignments WHERE roster_period_id = ?") || !rosterRouteText.includes("published_snapshot_json") || !rosterRouteText.includes("affectedAssignments")) {
  failures.push("worker/src/routes/roster.ts publish route does not update roster assignments with snapshots/change flags");
}
if (!rosterRouteText.includes("UPDATE shift_templates SET") || !rosterRouteText.includes("archived_by_user_id") || !rosterRouteText.includes("archived_at")) {
  failures.push("worker/src/routes/roster.ts shift template archive/restore does not write archived fields");
}

requireIncludes("worker/src/routes/self-service.ts", [
  'selfServiceRoutes.get("/roster"',
  'selfServiceRoutes.get("/roster/week"',
  "ROSTER_MODULE_DISABLED",
  "rp.status IN ('PUBLISHED', 'LOCKED')"
]);

requireIncludes("frontend/src/pages/RosterWeeklyPage.tsx", [
  "visibleEmployees.map",
  "weekly?.days",
  "RosterActionDialog",
  "Copy previous",
  "Lock",
  "Unlock",
  "DAY_OFF",
  "SICK_LEAVE",
  "LONG_LEAVE",
  "PUBLIC_HOLIDAY",
  "CONFLICT",
  "CANCELLED",
  "CHANGED_AFTER_PUBLISH",
  "ROSTER_MODULE_DISABLED",
  "moduleDisabled"
]);

requireIncludes("frontend/src/components/roster/RosterAssignmentModal.tsx", [
  "DAY_OFF",
  "SICK_LEAVE",
  "LONG_LEAVE",
  "PUBLIC_HOLIDAY",
  "CONFLICT",
  "CANCELLED",
  "CHANGED_AFTER_PUBLISH"
]);

requireIncludes("frontend/src/components/roster/RosterNav.tsx", [
  "moduleEnabled",
  "getRosterSettings",
  'link.to === "/roster/settings"'
]);

requireIncludes("frontend/src/pages/RosterShiftTemplatesPage.tsx", [
  "ROSTER_MODULE_DISABLED",
  "moduleDisabled"
]);

requireIncludes("frontend/src/pages/RosterReportsPage.tsx", [
  "ROSTER_MODULE_DISABLED",
  "moduleDisabled",
  "DAY_OFF",
  "SICK_LEAVE",
  "LONG_LEAVE",
  "PUBLIC_HOLIDAY",
  "CONFLICT",
  "CANCELLED",
  "CHANGED_AFTER_PUBLISH"
]);

requireIncludes("frontend/src/pages/SelfServicePage.tsx", [
  "My Roster",
  "RosterSelfServiceSection",
  "getSelfServiceRoster",
  "ROSTER_MODULE_DISABLED",
  "Changed after publish"
]);

requireIncludes("worker/wrangler.toml", [
  'binding = "DB"',
  'database_name = "hrm-v2"',
  'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"',
  'binding = "DOCUMENTS_BUCKET"',
  'bucket_name = "hrm-v2-documents"'
]);

const rosterUiFiles = walk("frontend/src", (path) => /Roster|roster/.test(path) && /\.(tsx|ts)$/.test(path));
for (const file of rosterUiFiles) {
  const text = read(file);
  if (/window\.(prompt|confirm|alert)\s*\(/.test(text)) failures.push(`${file} contains browser prompt/confirm/alert`);
}

if (failures.length) {
  console.error("Prompt 9 verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Prompt 9 verification passed.");
