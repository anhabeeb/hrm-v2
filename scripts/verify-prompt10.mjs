import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const failures = [];

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`Missing file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function exists(relativePath, label = relativePath) {
  if (!fs.existsSync(path.join(root, relativePath))) {
    failures.push(`Missing ${label}`);
  }
}

function has(content, marker, label = marker) {
  if (!content.includes(marker)) {
    failures.push(`Missing marker: ${label}`);
  }
}

function notHas(content, marker, label = marker) {
  if (content.includes(marker)) {
    failures.push(`Unexpected marker: ${label}`);
  }
}

function noBrowserDialogs(relativePath) {
  const content = read(relativePath);
  for (const marker of ["window.prompt", "window.confirm", "window.alert", "prompt(", "confirm(", "alert("]) {
    if (content.includes(marker)) {
      failures.push(`Browser dialog marker ${marker} found in ${relativePath}`);
    }
  }
}

function sectionBetween(content, startMarker, endMarker) {
  const start = content.indexOf(startMarker);
  if (start === -1) return "";
  const end = content.indexOf(endMarker, start + startMarker.length);
  return content.slice(start, end === -1 ? undefined : end);
}

const schema = read("database/schema.sql");
const seed = read("database/seed.sql");
const payrollRoute = read("worker/src/routes/payroll.ts");
const apiTs = read("frontend/src/lib/api.ts");
const payrollNav = read("frontend/src/components/payroll/PayrollNav.tsx");
const appRoutes = read("frontend/src/routes/AppRoutes.tsx");
const payrollRunsPage = read("frontend/src/pages/PayrollRunsPage.tsx");
const payrollAdminPages = read("frontend/src/pages/PayrollAdminPages.tsx");
const workerWrangler = read("worker/wrangler.toml");
const finalSettlementPageSection = sectionBetween(payrollAdminPages, "export function PayrollFinalSettlementsPage()", "export function PayrollSettingsPage()");
const payrollUiContent = [
  payrollRunsPage,
  payrollAdminPages,
  read("frontend/src/pages/PayrollPeriodsPage.tsx"),
  read("frontend/src/pages/PayrollRunDetailPage.tsx"),
  payrollNav,
].join("\n");

for (const relativePath of [
  "scripts/verify-baseline-prompts1-5.mjs",
  "scripts/verify-recovery-prompts6-9.mjs",
  "scripts/verify-prompt8.mjs",
  "scripts/verify-prompt9.mjs",
]) {
  exists(relativePath);
}

for (const marker of [
  "payroll_employee_results",
  "payroll_result_line_items",
  "DRAFT",
  "CALCULATING",
  "READY_FOR_REVIEW",
  "APPROVED_PLACEHOLDER",
  "FINALIZED_PLACEHOLDER",
  "LOCKED",
  "CANCELLED",
  "BASIC_SALARY",
  "ADVANCE_DEDUCTION",
  "FORMULA_PLACEHOLDER",
]) {
  has(schema, marker, `schema ${marker}`);
}

for (const permission of [
  "payroll.periods.view",
  "payroll.periods.calculate",
  "payroll.runs.view",
  "payroll.runs.recalculate",
  "payroll.runs.cancel",
  "payroll.results.view",
  "payroll.results.sensitive.view",
  "payroll.advances.approve",
  "payroll.adjustments.approve_placeholder",
]) {
  has(seed, permission, `seed permission ${permission}`);
  has(payrollRoute, permission, `route permission ${permission}`);
}

for (const helper of [
  "mapLegacyPayrollComponentType",
  "getPayrollComponentType",
  "getPayrollComponentCalculationMode",
  "getPayrollCutoffSchedule",
  "getPayrollCutoffStatus",
  "isPayrollSubmissionOpen",
  "isPayrollApprovalOpen",
  "isPayrollAttendanceReviewOpen",
  "enforcePayrollCutoffForSubmission",
  "enforcePayrollCutoffForApproval",
  "markLatePayrollAdjustmentCandidate",
  "syncLegacyPayrollRunTablesForCompatibility",
]) {
  has(payrollRoute, helper, `payroll helper ${helper}`);
}

for (const marker of [
  "INSERT INTO payroll_employee_results",
  "INSERT INTO payroll_result_line_items",
  "FROM payroll_employee_results",
  "FROM payroll_result_line_items",
  "UPDATE payroll_employee_results",
  "status = 'CALCULATING'",
  "status = 'READY_FOR_REVIEW'",
  "status = 'APPROVED_PLACEHOLDER'",
  "status = 'FINALIZED_PLACEHOLDER'",
  "status = 'LOCKED'",
  "status = 'CANCELLED'",
  "status = 'HELD'",
]) {
  has(payrollRoute, marker, `active payroll marker ${marker}`);
}

for (const badWrite of [
  "UPDATE payroll_runs SET status = 'PAID'",
  "UPDATE payroll_periods SET status = 'PAID'",
  "UPDATE payroll_employee_results SET status = 'PAID'",
  "UPDATE payroll_runs SET status = 'APPROVED'",
  "UPDATE payroll_periods SET status = 'CLOSED'",
  "UPDATE payroll_runs SET status = 'REVIEW'",
  "UPDATE payroll_periods SET status = 'REVIEW'",
  "UPDATE payroll_runs SET status = 'PROCESSING'",
  "UPDATE payroll_periods SET status = 'PROCESSING'",
]) {
  notHas(payrollRoute, badWrite, `old active status write ${badWrite}`);
}

has(payrollRoute, "PAYROLL_PAYMENT_NOT_AVAILABLE", "disabled payment route response");
has(payrollRoute, "FINAL_SETTLEMENT_NOT_AVAILABLE", "disabled final settlement response");
has(payrollRoute, 'payrollRoutes.post("/advances/:id/mark-paid"', "defensive advance mark-paid route");
has(payrollRoute, 'payrollRoutes.post("/runs/:id/mark-paid"', "defensive run mark-paid route");
has(payrollRoute, 'payrollRoutes.post("/final-settlements"', "disabled final settlement create route");
has(payrollRoute, 'payrollRoutes.patch("/final-settlements/:id"', "disabled final settlement update route");
notHas(payrollRoute, "advanceStatus(c, \"PAID\")", "advance paid status mutation");
notHas(payrollRoute, 'requirePermission("payroll.pay")', "active payroll.pay gate");
notHas(payrollRoute, "INSERT INTO final_settlements", "active final settlement create");
notHas(payrollRoute, "UPDATE final_settlements", "active final settlement update");

notHas(apiTs, "markPayrollRunPaid", "frontend markPayrollRunPaid helper");
notHas(apiTs, "markPayrollAdvancePaid", "frontend markPayrollAdvancePaid helper");
notHas(apiTs, "/mark-paid", "frontend mark-paid API path");
notHas(apiTs, "listFinalSettlements", "active frontend final settlement list helper");
notHas(apiTs, "createFinalSettlement(token", "active frontend final settlement create helper");
notHas(apiTs, "updateFinalSettlement(token", "active frontend final settlement update helper");

notHas(payrollUiContent, "markPayrollRunPaid", "payroll UI markPayrollRunPaid call");
notHas(payrollUiContent, "markPayrollAdvancePaid", "payroll UI markPayrollAdvancePaid call");
notHas(payrollUiContent, "/mark-paid", "payroll UI mark-paid path");
notHas(payrollRunsPage, "Mark paid", "Payroll runs Mark Paid UI");
notHas(payrollRunsPage, "payroll.pay", "Payroll runs payroll.pay action");
notHas(payrollAdminPages, "Mark Paid", "Payroll admin Mark Paid UI");
notHas(payrollAdminPages, "payroll.pay", "Payroll admin payroll.pay action");
has(finalSettlementPageSection, "Final settlement will be implemented in a later phase.", "final settlement future placeholder");
notHas(finalSettlementPageSection, "async function save", "active final settlement save function");
notHas(finalSettlementPageSection, "SettlementModal", "active settlement modal");
notHas(finalSettlementPageSection, "createFinalSettlement", "active final settlement create call");
notHas(finalSettlementPageSection, "updateFinalSettlement", "active final settlement update call");
notHas(finalSettlementPageSection, "Final salary amount", "active settlement form field");
notHas(finalSettlementPageSection, "Net settlement amount", "active settlement form field");
notHas(finalSettlementPageSection, "PAID", "final settlement PAID status option");
notHas(payrollNav, "Final Settlements", "active Final Settlements nav item");
notHas(appRoutes, "payroll/final-settlements", "active final settlements route");

for (const relativePath of [
  "frontend/src/pages/PayrollRunsPage.tsx",
  "frontend/src/pages/PayrollPeriodsPage.tsx",
  "frontend/src/pages/PayrollRunDetailPage.tsx",
  "frontend/src/pages/PayrollAdminPages.tsx",
  "frontend/src/components/payroll/PayrollNav.tsx",
]) {
  noBrowserDialogs(relativePath);
}

has(payrollRoute, "payroll_impact_days", "Prompt 8 attendance payroll impact read");
has(payrollRoute, "payroll_impact_minutes", "Prompt 8 attendance payroll impact read");
has(payrollRoute, "payroll_impact_reason", "Prompt 8 attendance payroll impact read");
has(payrollRoute, "correction_status", "Prompt 8 correction status read");
has(payrollRoute, "locked_for_payroll", "Prompt 8 payroll lock read");
has(payrollRoute, "leave_payroll_impacts", "Prompt 6 leave payroll impacts read");
has(payrollRoute, "CHANGED_AFTER_PUBLISH", "Prompt 9 roster status read");
has(payrollRoute, "PUBLIC_HOLIDAY", "Prompt 9 roster context read");
has(payrollRoute, "SICK_LEAVE", "Prompt 9 roster leave context read");
has(payrollRoute, "LONG_LEAVE", "Prompt 9 roster leave context read");

has(workerWrangler, 'database_name = "hrm-v2"', "D1 database_name");
has(workerWrangler, 'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"', "D1 database_id");
has(workerWrangler, 'bucket_name = "hrm-v2-documents"', "R2 bucket");

if (failures.length) {
  console.error("Prompt 10 verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Prompt 10 verification passed.");
