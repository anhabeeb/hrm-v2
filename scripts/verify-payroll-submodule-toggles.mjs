import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function has(relativePath, marker, message) {
  const content = read(relativePath);
  const ok = marker instanceof RegExp ? marker.test(content) : content.includes(marker);
  if (!ok) failures.push(`${relativePath}: ${message}`);
}

function hasNo(relativePath, marker, message) {
  const content = read(relativePath);
  const ok = marker instanceof RegExp ? !marker.test(content) : !content.includes(marker);
  if (!ok) failures.push(`${relativePath}: ${message}`);
}

function hasAll(relativePath, markers) {
  markers.forEach((marker) => has(relativePath, marker, `missing marker ${String(marker)}`));
}

const pkg = JSON.parse(read("package.json"));
if (!pkg.scripts?.["verify:payroll-submodules"]) failures.push("package.json: missing verify:payroll-submodules script");

const payrollSubmoduleColumns = [
  "payslips_enabled",
  "payment_register_enabled",
  "payment_methods_enabled",
  "payment_institutions_enabled",
  "employee_advances_enabled",
  "payroll_adjustments_enabled",
  "payroll_reports_enabled",
  "bank_loan_deductions_enabled",
  "custom_deductions_enabled",
  "pension_enabled"
];

hasAll("database/schema.sql", payrollSubmoduleColumns);
hasAll("database/seed.sql", [
  "payroll.submodules.view",
  "payroll.submodules.update",
  "payroll.submodules.manage",
  "payslips_enabled",
  "payment_register_enabled",
  "payment_methods_enabled",
  "payment_institutions_enabled",
  "employee_advances_enabled",
  "payroll_adjustments_enabled",
  "payroll_reports_enabled"
]);
hasAll("worker/src/db/permissions.ts", ["payroll.submodules.view", "payroll.submodules.update", "payroll.submodules.manage"]);

hasAll("worker/src/routes/payroll.ts", [
  "type PayrollSubmoduleKey",
  "PAYROLL_SUBMODULE_LABELS",
  "payrollSubmoduleEnabled",
  "requirePayrollSubmoduleEnabled",
  "PAYROLL_SUBMODULE_DISABLED",
  "payroll_submodules",
  "employeeAdvancesEnabled",
  "payrollAdjustmentsEnabled",
  "bankLoansEnabled",
  "customDeductionsEnabled",
  "pensionEnabled",
  "payment_register_enabled",
  "payslips_enabled",
  "payroll_reports_enabled",
  "payroll_feature_status"
]);
hasNo("worker/src/routes/payroll.ts", /mark-paid[\s\S]{0,240}SET\s+status\s*=\s*['"]PAID['"]/i, "Prompt 10 payment disabling must remain intact");

hasAll("worker/src/routes/payroll-foundations.ts", [
  "type PayrollSubmoduleKey",
  "requirePayrollSubmoduleMiddleware",
  "PAYROLL_SUBMODULE_DISABLED",
  "payment_methods_enabled",
  "payment_institutions_enabled",
  "bank_loan_deductions_enabled",
  "custom_deductions_enabled",
  "pension_enabled"
]);

hasAll("worker/src/routes/search.ts", [
  "isPayrollSubmoduleEnabled",
  "payslips_enabled"
]);

hasAll("worker/src/routes/final-settlement.ts", [
  "getPayrollSettingsForSettlement",
  "settlementPayrollSubmoduleEnabled",
  "payroll_submodules",
  "employee_advances_enabled",
  "bank_loan_deductions_enabled",
  "custom_deductions_enabled",
  "pension_enabled"
]);

hasAll("frontend/src/pages/SettingsPage.tsx", [
  "SettingsToggleGroup",
  "ModuleTogglePill",
  "Payroll Core",
  "payslips_enabled",
  "payment_register_enabled",
  "payment_methods_enabled",
  "payment_institutions_enabled",
  "employee_advances_enabled",
  "payroll_adjustments_enabled",
  "payroll_reports_enabled",
  "bank_loan_deductions_enabled",
  "custom_deductions_enabled",
  "pension_enabled",
  "final_settlement_enabled",
  "api.updatePayrollSettings",
  "api.updateFinalSettlementSettings"
]);
hasAll("frontend/src/pages/PayrollAdminPages.tsx", [
  "Payroll module controls moved",
  "Main payroll and payroll submodule enablement is managed from the main Settings page.",
  "Final settlement status",
  "SubmoduleSettingsSection"
]);
hasNo("frontend/src/pages/PayrollAdminPages.tsx", /<ModuleToggleHeader\b/, "Payroll settings page must not render submodule toggle cards");

hasAll("frontend/src/components/payroll/PayrollNav.tsx", [
  "PayrollSubmoduleSettingKey",
  "api.getPayrollSettings",
  "submoduleVisible",
  "payslips_enabled",
  "payment_register_enabled",
  "employee_advances_enabled",
  "bank_loan_deductions_enabled",
  "custom_deductions_enabled",
  "pension_enabled"
]);

hasAll("frontend/src/components/payroll/EmployeePayrollFoundationPanels.tsx", [
  "summary.payroll_feature_status",
  "DisabledPayrollPanel",
  "payment_methods_enabled",
  "bank_loan_deductions_enabled",
  "pension_enabled",
  "custom_deductions_enabled"
]);

hasAll("scripts/remote-d1-schema-utils.mjs", [
  "payroll_settings",
  "payslips_enabled",
  "payment_register_enabled",
  "payment_methods_enabled",
  "payment_institutions_enabled",
  "employee_advances_enabled",
  "payroll_adjustments_enabled",
  "payroll_reports_enabled"
]);

[
  "frontend/src/pages/PayrollAdminPages.tsx",
  "frontend/src/components/payroll/PayrollNav.tsx",
  "frontend/src/components/payroll/EmployeePayrollFoundationPanels.tsx"
].forEach((file) => hasNo(file, /\b(window\.)?(alert|confirm|prompt)\s*\(/, "browser alert/confirm/prompt must not be used"));

has("worker/src/auth/password.ts", "100000", "PBKDF2 max iteration marker must remain 100000");
hasNo("worker/src/auth/password.ts", "210000", "PBKDF2 must not exceed Workers runtime limit");
has("worker/wrangler.toml", 'binding = "DB"', "D1 binding missing");
has("worker/wrangler.toml", 'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"', "D1 database id changed");
has("worker/wrangler.toml", 'binding = "DOCUMENTS_BUCKET"', "R2 binding missing");
has("worker/wrangler.toml", 'bucket_name = "hrm-v2-documents"', "R2 bucket changed");

if (failures.length) {
  console.error("Payroll submodule toggle verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Payroll submodule toggle verification passed.");
