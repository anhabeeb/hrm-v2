import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function ok(condition, message) {
  if (!condition) {
    console.error(`Prompt 13 verification failed: ${message}`);
    process.exit(1);
  }
}

function hasAll(file, markers) {
  const text = read(file);
  for (const marker of markers) ok(text.includes(marker), `${file} missing ${marker}`);
}

const packageJson = JSON.parse(read("package.json"));
const scripts = packageJson.scripts ?? {};
[
  "verify:baseline-prompts1-5",
  "verify:prompt8",
  "verify:prompt9",
  "verify:recovery-prompts6-9",
  "verify:prompt10",
  "verify:prompt11",
  "verify:prompt12",
  "verify:prompt12b",
  "verify:prompt12-final",
  "verify:prompt13"
].forEach((script) => ok(Boolean(scripts[script]), `package.json missing ${script}`));

hasAll("database/schema.sql", [
  "CREATE TABLE IF NOT EXISTS report_export_logs",
  "idx_report_export_logs_report_key",
  "idx_report_export_logs_requested_by",
  "idx_report_export_logs_status"
]);

hasAll("database/seed.sql", [
  "reports.export.sensitive",
  "reports.export.history.view",
  "reports.payroll.view",
  "reports.pension.view",
  "reports.bank_loans.view",
  "reports.custom_deductions.view",
  "reports.final_settlement.view",
  "reports.attendance_variance.view",
  "reports.leave_payroll.view",
  "reports.roster_payroll.view",
  "reports.payment_register.view",
  "reports.compliance.view",
  "reports.manage"
]);

hasAll("worker/src/db/permissions.ts", [
  "reports.export.sensitive",
  "reports.export.history.view",
  "reports.payroll.view",
  "reports.pension.view",
  "reports.bank_loans.view",
  "reports.custom_deductions.view",
  "reports.final_settlement.view",
  "reports.payment_register.view"
]);

hasAll("worker/src/routes/reports.ts", [
  "requireReportPermission",
  "applyReportEmployeeScope",
  "parseReportDateRange",
  "parseReportPagination",
  "maskSensitiveReportFields",
  "createReportExportLog",
  "generateCsvExport",
  "getPayrollRunSummaryReport",
  "getPensionContributionReport",
  "getBankLoanDeductionReport",
  "getCustomDeductionReport",
  "getFinalSettlementReport",
  "getAttendancePayrollVarianceReport",
  "getPaymentRegisterReport",
  "payroll/run-summary",
  "payroll/period-summary",
  "payroll/employee-history",
  "payroll/components",
  "payroll/gross-to-net",
  "payroll/adjustments",
  "payroll/payment-status",
  "payroll/exceptions",
  "pension/monthly-contributions",
  "pension/remittance-summary",
  "bank-loans/deduction-summary",
  "bank-loans/remittance-summary",
  "bank-loans/direct-collection",
  "bank-loans/notification-pending",
  "custom-deductions/summary",
  "custom-deductions/by-template",
  "custom-deductions/shortfalls",
  "final-settlement/summary",
  "final-settlement/bank-loan-impact",
  "final-settlement/pension-impact",
  "final-settlement/custom-deduction-impact",
  "variance/attendance-payroll",
  "variance/leave-payroll",
  "variance/roster-attendance",
  "payment-register/salary-summary",
  "payment-register/final-settlement",
  "/export-logs",
  "/export-logs/:exportId/download",
  "Excel/PDF export will be added in a later export phase"
]);

const reportsRoute = read("worker/src/routes/reports.ts");
ok(reportsRoute.includes('replace(/"/g, \'""\')'), "CSV export helper must escape quotes safely");
ok(!/official bank export|bank transfer integration|pension office upload/i.test(reportsRoute), "Prompt 13 must not add official bank/pension integration exports");

hasAll("frontend/src/pages/ReportsPage.tsx", [
  "Payroll & Compliance Reports",
  "Export History / Report Audit Logs",
  "DataTableFrame",
  "overflow-hidden",
  "ExportMenu",
  "exportRows(format",
  "Excel and PDF exports use the currently loaded report rows",
  "filterChips",
  "payment register reporting",
  "Final settlement status"
]);

const reportsPage = read("frontend/src/pages/ReportsPage.tsx");
ok(!/Excel\/PDF (remain )?future placeholders|Excel export will be added|PDF export will be added/i.test(reportsPage), "Reports page must not present active Excel/PDF exports as placeholders");

hasAll("frontend/src/lib/api.ts", [
  "getReportExportLogs",
  "/api/v1/reports/export-logs",
  "exportReportCsv"
]);

hasAll("frontend/src/routes/AppRoutes.tsx", [
  "lazyPage",
  "Suspense",
  "import(\"../pages/ReportsPage\")",
  "import(\"../pages/FinalSettlementPage\")",
  "import(\"../pages/PayrollAdminPages\")",
  "import(\"../pages/DocumentRegistryPage\")",
  "import(\"../pages/AttendanceRecordsPage\")",
  "import(\"../pages/RosterWeeklyPage\")",
  "import(\"../pages/SettingsPage\")"
]);

hasAll("frontend/vite.config.ts", [
  "manualChunks",
  "react-vendor",
  "router-vendor",
  "ui-vendor"
]);

const wranglerToml = read("worker/wrangler.toml");
ok(wranglerToml.includes('binding = "DB"'), "D1 DB binding missing");
ok(wranglerToml.includes('database_name = "hrm-v2"'), "D1 database name changed");
ok(wranglerToml.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'), "D1 database id changed");
ok(wranglerToml.includes('binding = "DOCUMENTS_BUCKET"'), "R2 binding missing");
ok(wranglerToml.includes('bucket_name = "hrm-v2-documents"'), "R2 bucket changed");

const auth = read("worker/src/auth/password.ts");
ok(auth.includes("100000"), "PBKDF2 maximum must remain 100000");
ok(!auth.includes("210000"), "PBKDF2 must not be reverted to 210000");

for (const file of ["frontend/src/pages/ReportsPage.tsx"]) {
  const text = read(file);
  ok(!/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(text), `${file} must not use browser alert/confirm/prompt`);
}

console.log("Prompt 13 verifier passed.");
