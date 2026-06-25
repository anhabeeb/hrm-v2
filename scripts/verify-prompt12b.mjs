import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const failures = [];

function read(rel) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    failures.push(`Missing file: ${rel}`);
    return "";
  }
  return fs.readFileSync(file, "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function ok(condition, message) {
  if (!condition) failures.push(message);
}

function includes(rel, markers) {
  const content = read(rel);
  for (const marker of markers) ok(content.includes(marker), `${rel} missing marker: ${marker}`);
}

function noBrowserPrompts(rel) {
  const content = read(rel);
  const match = content.match(/\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/);
  ok(!match, `${rel} contains browser alert/confirm/prompt usage: ${match?.[0] ?? ""}`);
}

const pkg = JSON.parse(read("package.json") || "{}");
ok(pkg.scripts?.["verify:prompt12b"] === "node scripts/verify-prompt12b.mjs", "package.json missing verify:prompt12b script");

for (const script of [
  "scripts/verify-baseline-prompts1-5.mjs",
  "scripts/verify-recovery-prompts6-9.mjs",
  "scripts/verify-prompt8.mjs",
  "scripts/verify-prompt9.mjs",
  "scripts/verify-prompt10.mjs",
  "scripts/verify-prompt11.mjs",
  "scripts/verify-prompt12.mjs"
]) ok(exists(script), `Missing protected verifier ${script}`);

includes("worker/wrangler.toml", [
  'database_name = "hrm-v2"',
  'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"',
  'bucket_name = "hrm-v2-documents"'
]);

includes("worker/src/auth/password.ts", ["MAX_WORKER_PBKDF2_ITERATIONS = 100000"]);

includes("database/schema.sql", [
  "custom_deduction_templates",
  "employee_custom_deductions",
  "employee_custom_deduction_applications",
  "custom_deductions_enabled",
  "require_custom_deduction_approval",
  "custom_deduction_show_on_payslip_default",
  "custom_deduction_show_in_self_service_default",
  "custom_deduction_include_in_final_settlement_default",
  "custom_deduction_insufficient_salary_mode",
  "custom_deduction_allow_partial_deduction",
  "custom_deduction_shortfall_carry_forward_enabled",
  "custom_deduction_priority_default",
  "ONE_TIME",
  "RECURRING",
  "INSTALLMENT",
  "BALANCE_BASED",
  "FORMULA_PLACEHOLDER",
  "APPLIED_IN_PAYROLL",
  "PARTIAL",
  "SKIPPED",
  "FAILED"
]);

includes("database/seed.sql", [
  "payroll.custom_deduction_templates.view",
  "payroll.custom_deduction_templates.manage",
  "payroll.employee_custom_deductions.view",
  "payroll.employee_custom_deductions.manage",
  "payroll.custom_deduction_settings.manage",
  "payroll.custom_deduction_reports.view",
  "employees.custom_deductions.view",
  "employees.custom_deductions.manage",
  "self_service.custom_deductions.view",
  "VISA_FEE",
  "MEDICAL_FEE",
  "INSURANCE_FEE",
  "WORK_PERMIT_FEE",
  "ACCOMMODATION",
  "UNIFORM_DEDUCTION",
  "ASSET_DAMAGE",
  "PENALTY_PLACEHOLDER",
  "OTHER_CUSTOM_DEDUCTION"
]);

includes("worker/src/routes/payroll-foundations.ts", [
  "CUSTOM_DEDUCTION_TYPES",
  "readCustomDeductionTemplateInput",
  "getActiveCustomDeductionsForPayroll",
  "applyCustomDeductionsToPayroll",
  "recordCustomDeductionPayrollApplications",
  "updateCustomDeductionAfterPayrollFinalized",
  "getCustomDeductionOutstandingBalanceForSettlement",
  "getFinalSettlementCustomDeductionImpact",
  '"/custom-deduction-templates"',
  '"/custom-deductions"',
  '"/:employeeId/custom-deductions"',
  '"/reports/custom-deductions-summary"',
  '"/reports/custom-deductions-by-template"',
  '"/reports/custom-deduction-shortfalls"',
  '"/custom-deductions"',
  "selfServicePayrollFoundationRoutes",
  "payroll.employee_custom_deduction.created",
  "payroll.employee_custom_deduction.approved",
  "payroll.custom_deduction.applied"
]);

includes("worker/src/routes/payroll.ts", [
  "applyCustomDeductionsToPayroll",
  "recordCustomDeductionPayrollApplications",
  "updateCustomDeductionAfterPayrollFinalized",
  "CUSTOM_DEDUCTION",
  "custom_deduction_total",
  "custom_deduction_warnings",
  "custom_deduction_requires_resolution",
  "employee_custom_deduction_applications",
  "payroll.custom_deduction_report_exported",
  "customDeductionReportFilters",
  "payroll.custom_deduction_settings.manage"
]);

includes("frontend/src/types/payroll.ts", [
  "CustomDeductionTemplate",
  "EmployeeCustomDeduction",
  "EmployeeCustomDeductionApplication",
  "custom_deductions_enabled",
  "custom_deduction_applications"
]);

includes("frontend/src/lib/api.ts", [
  "listCustomDeductionTemplates",
  "createCustomDeductionTemplate",
  "archiveCustomDeductionTemplate",
  "listPayrollCustomDeductions",
  "listEmployeeCustomDeductions",
  "createEmployeeCustomDeduction",
  "customDeductionAction",
  "getCustomDeductionSummaryReport",
  "getSelfServiceCustomDeductions"
]);

includes("frontend/src/pages/PayrollFoundationPages.tsx", [
  "PayrollCustomDeductionsPage",
  "Custom deduction templates",
  "Employee custom deduction assignments",
  "Payroll application history",
  "Assign deduction",
  "TemplateModal",
  "AssignmentModal"
]);

includes("frontend/src/components/payroll/PayrollNav.tsx", ["Custom Deductions", "/payroll/custom-deductions"]);
includes("frontend/src/routes/AppRoutes.tsx", ["PayrollCustomDeductionsPage", 'path="payroll/custom-deductions"']);
includes("frontend/src/pages/PayrollAdminPages.tsx", [
  "Custom Deduction Settings",
  "custom_deduction_insufficient_salary_mode",
  "payroll.custom_deduction_settings.update",
  "custom-deductions",
  "custom-deduction-shortfalls"
]);
includes("frontend/src/components/payroll/EmployeePayrollFoundationPanels.tsx", [
  "Custom deductions",
  "Add deduction",
  "createEmployeeCustomDeduction",
  "customDeductionAction"
]);
includes("frontend/src/components/payroll/EmployeePayrollPanel.tsx", [
  "Custom deductions",
  "Custom deduction payroll applications"
]);
includes("frontend/src/pages/SelfServicePage.tsx", [
  "getSelfServiceCustomDeductions",
  "My custom deductions",
  "Custom deduction payroll history"
]);

for (const rel of [
  "frontend/src/pages/PayrollFoundationPages.tsx",
  "frontend/src/components/payroll/EmployeePayrollFoundationPanels.tsx",
  "frontend/src/pages/PayrollAdminPages.tsx",
  "frontend/src/pages/SelfServicePage.tsx"
]) noBrowserPrompts(rel);

if (failures.length) {
  console.error("Prompt 12B verifier failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Prompt 12B verifier passed.");
