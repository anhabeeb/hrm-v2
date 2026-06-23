import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function contains(path, markers) {
  const text = read(path);
  for (const marker of markers) assert(text.includes(marker), `${path} missing marker: ${marker}`);
}

function noBrowserPrompts(path) {
  const text = read(path);
  assert(!/window\.|\b(prompt|confirm|alert)\(/.test(text), `${path} still uses browser prompt/confirm/alert`);
}

function runScript(name) {
  const result = spawnSync(process.platform === "win32" ? "cmd.exe" : "npm", process.platform === "win32" ? ["/c", "npm", "run", name] : ["run", name], {
    cwd: root,
    stdio: "inherit",
    shell: false
  });
  assert(result.status === 0, `npm run ${name} failed`);
}

assert(existsSync(join(root, "scripts", "verify-prompt8.mjs")), "verify-prompt8.mjs is missing");
assert(existsSync(join(root, "scripts", "verify-prompt9.mjs")), "verify-prompt9.mjs is missing");

contains("database/schema.sql", [
  "leave_balance_cycles",
  "leave_balance_ledger_entries",
  "leave_payroll_impacts",
  "attendance_day_overrides",
  "DEDUCT_AFTER_ENTITLEMENT_EXHAUSTED",
  "PAY_ONLY_WORKED_DAYS",
  "head_employee_id",
  "manager_employee_id",
  "old_value_json",
  "requested_value_json"
]);

contains("worker/src/routes/leave.ts", [
  "applyLeaveBalanceChange",
  "calculateLeaveDays",
  "getCurrentLeaveCycle",
  "createLeaveLedgerEntry",
  "refreshLeaveBalanceCycle",
  "getAttendanceDayOverridesForRange",
  "applyLeaveDayCountingPolicy",
  "calculateLeavePayrollImpact",
  "getLeaveApprovalChainPreview",
  "getSelfServiceLeaveCycles",
  "getEmployeeLeaveCycleSummary",
  "permissionMatchesLegacyOrGranularLeaveKey",
  'leaveRoutes.post("/calculate"',
  'leaveRoutes.post("/validate-request"',
  "canAccessEmployee",
  "approval_chain_preview"
]);

contains("worker/src/routes/self-service.ts", [
  "applyLeaveBalanceChange",
  "getSelfServiceLeaveCycles",
  "balance_cycles",
  "ledger_recent",
  "unwrapRequestedValue",
  "old_value_json",
  "requested_value_json",
  "protectedProfileUpdateFields"
]);

contains("worker/src/routes/employees.ts", [
  'employeeRoutes.get("/assignment-options"',
  "activeEntityExists",
  "createsReportingCycle",
  "Reporting manager assignment would create a reporting cycle"
]);

contains("frontend/src/pages/EmployeesPage.tsx", [
  "getEmployeeAssignmentOptions",
  "reportingManagers",
  "assignmentOptions"
]);

contains("frontend/src/pages/SelfServicePage.tsx", [
  "requested_value: form.requested_value",
  "balance_cycles",
  "ledger_recent"
]);
assert(!read("frontend/src/pages/SelfServicePage.tsx").includes("requested_value: { value: form.requested_value }"), "SelfServicePage still sends nested requested_value");

contains("frontend/src/pages/EmployeeProfilePage.tsx", [
  "ProfileUpdateRequests",
  "old_value_json",
  "requested_value_json"
]);

contains("frontend/src/components/leave/EmployeeLeavePanel.tsx", ["balance_cycles"]);
contains("frontend/src/components/leave/LeaveRequestModal.tsx", ["ApprovalPreview", "approval_chain_preview", "calculateLeaveRequest"]);

for (const path of [
  "frontend/src/pages/EmployeesPage.tsx",
  "frontend/src/pages/EmployeeProfilePage.tsx",
  "frontend/src/components/payroll/EmployeePayrollPanel.tsx",
  "frontend/src/components/employee/EmployeeDocumentsPanel.tsx",
  "frontend/src/components/employee/EmployeeProfilePhotoControls.tsx"
]) noBrowserPrompts(path);

contains("scripts/verify-prompt8.mjs", [
  "requireAttendanceModuleEnabled",
  "calculateDailyAttendanceStatus",
  "current_values_json",
  "requested_values_json",
  "MISSING_PUNCH",
  "EARLY_LEAVE",
  "self_service.attendance_correction.request"
]);

contains("scripts/verify-prompt9.mjs", [
  "CHANGED_AFTER_PUBLISH",
  "published_snapshot_json",
  "getRosterWorkRequirementForLeaveDate",
  "CROSS_WORKSITE_PERMISSION_REQUIRED",
  "roster.assignments.cross_worksite"
]);

contains("worker/wrangler.toml", [
  'binding = "DB"',
  'database_name = "hrm-v2"',
  'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"',
  'binding = "DOCUMENTS_BUCKET"',
  'bucket_name = "hrm-v2-documents"'
]);

runScript("verify:prompt8");
runScript("verify:prompt9");

console.log("Recovery verifier passed: Prompts 6-9 markers are present and protected.");
