import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(rel) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) fail(`Missing file: ${rel}`);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function has(rel, marker, label = marker) {
  if (!read(rel).includes(marker)) fail(`${rel} is missing ${label}`);
}

function hasAll(rel, markers) {
  for (const marker of markers) has(rel, marker);
}

function notHasRegex(rel, regex, label) {
  const match = read(rel).match(regex);
  if (match) fail(`${rel} contains forbidden ${label}: ${match[0]}`);
}

const pkg = JSON.parse(read("package.json"));
for (const script of [
  "verify:baseline-prompts1-5",
  "verify:recovery-prompts6-9",
  "verify:prompt8",
  "verify:prompt9",
  "verify:prompt10",
  "verify:prompt11",
  "verify:prompt12",
  "verify:prompt12b",
  "verify:prompt12-final"
]) {
  if (!pkg.scripts?.[script]) fail(`package.json is missing ${script}`);
}

hasAll("database/schema.sql", [
  "final_settlement_settings",
  "final_settlement_enabled",
  "allow_settlement_case_creation_from_exit_status",
  "auto_create_settlement_case_on_exit_status",
  "include_bank_loan_deductions",
  "include_pension_contribution",
  "include_custom_deduction_remaining_balances",
  "final_settlement_cases",
  "payment_direction",
  "clearance_status",
  "approval_status",
  "final_settlement_line_items",
  "EMPLOYER_COST",
  "BANK_LOAN_DEDUCTION",
  "BANK_LOAN_DIRECT_COLLECTION_WARNING",
  "PENSION_EMPLOYER_CONTRIBUTION",
  "CUSTOM_DEDUCTION_BALANCE",
  "final_settlement_events",
  "final_settlement_clearance_items",
  "DEDUCTION_APPLIED",
  "final_settlement_manual_adjustments",
  "final_settlement_payment_register",
  "payment_method_snapshot_json",
  "final_settlement_history_snapshots"
]);

hasAll("database/seed.sql", [
  "final_settlement.view",
  "final_settlement.settings.update",
  "final_settlement.cases.create",
  "final_settlement.calculate",
  "final_settlement.approvals.approve",
  "final_settlement.finalization.finalize",
  "final_settlement.payment_register.confirm_manual_paid",
  "final_settlement.reports.sensitive.view",
  "employees.final_settlement.view",
  "final_settlement_settings_default"
]);

hasAll("worker/src/routes/final-settlement.ts", [
  "getFinalSettlementSettings",
  "requireFinalSettlementModuleEnabled",
  "createFinalSettlementCase",
  "calculateFinalSettlement",
  "calculateFinalSettlementForEmployee",
  "getSettlementEmployeeSnapshot",
  "getSettlementPayrollImpact",
  "getSettlementLeaveImpact",
  "getSettlementAttendanceImpact",
  "getSettlementRosterImpact",
  "getSettlementAssetClearanceImpact",
  "getSettlementUniformClearanceImpact",
  "getSettlementPaymentMethodImpact",
  "getSettlementBankLoanImpact",
  "getSettlementPensionImpact",
  "getSettlementCustomDeductionImpact",
  "createSettlementLineItem",
  "summarizeFinalSettlement",
  "canViewFinalSettlementForEmployee",
  "canManageFinalSettlementForEmployee",
  "getFinalSettlementLeaveBalanceSummary",
  "calculateUnusedLeavePayout",
  "calculateNegativeLeaveBalanceDeduction",
  "createLeaveSettlementLedgerEntry",
  "getFinalSettlementPayrollHistory",
  "getPendingPayrollForSettlement",
  "calculateUnpaidSalaryForSettlement",
  "getAdvanceBalanceForSettlement",
  "getOneTimeDeductionsForSettlement",
  "getPayrollPaymentRegisterStatusForSettlement",
  "getFinalSettlementPaymentMethodSummary",
  "getFinalSettlementBankLoanSummary",
  "getFinalSettlementPensionSummary",
  "getFinalSettlementCustomDeductionSummary",
  "getFinalSettlementAttendanceImpact",
  "getFinalSettlementRosterExpectedWork",
  "getFinalSettlementWorkRequirementSummary",
  "getAssetClearanceForSettlement",
  "getUniformClearanceForSettlement",
  "calculateAssetDeductionsForSettlement",
  "calculateUniformDeductionsForSettlement",
  "leave_balance_cycles",
  "leave_balance_ledger_entries",
  "leave_payroll_impacts",
  "attendance_daily_records",
  "payroll_impact_days",
  "roster_assignments",
  "CHANGED_AFTER_PUBLISH",
  "payroll_employee_results",
  "payroll_result_line_items",
  "payroll_payslips",
  "payroll_payment_register",
  "employee_payment_methods",
  "employee_bank_loans",
  "employee_bank_loan_payments",
  "SKIPPED_MINIMUM_NET_PROTECTION",
  "BANK_TO_COLLECT_DIRECTLY_FROM_EMPLOYEE",
  "employee_pension_profiles",
  "payroll_pension_contributions",
  "PENSION_EMPLOYER_CONTRIBUTION",
  "EMPLOYER_COST",
  "employee_custom_deductions",
  "getFinalSettlementCustomDeductionImpact",
  "reports/bank-loan-settlement",
  "reports/pension-settlement",
  "reports/custom-deduction-settlement",
  "official_bank_export_generated: false",
  "direct_bank_integration: false"
]);

hasAll("worker/src/index.ts", [
  "finalSettlementRoutes",
  "employeeFinalSettlementRoutes",
  "/api/v1/final-settlement"
]);

hasAll("frontend/src/lib/api.ts", [
  "listFinalSettlementCases",
  "calculateFinalSettlementCase",
  "recalculateFinalSettlementCase",
  "prepareFinalSettlementPaymentRegister",
  "getFinalSettlementBankLoanSettlementReport",
  "getFinalSettlementPensionSettlementReport",
  "getFinalSettlementCustomDeductionSettlementReport",
  "getEmployeeFinalSettlementSummary"
]);

hasAll("frontend/src/pages/FinalSettlementPage.tsx", [
  "Exit Payroll",
  "Payment Register",
  "Settlement reports foundation",
  "RESIGNED",
  "READY_FOR_REVIEW",
  "EMPLOYER_COST",
  "include_bank_loan_deductions",
  "include_pension_contribution",
  "include_custom_deduction_remaining_balances"
]);

hasAll("frontend/src/components/payroll/EmployeeFinalSettlementPanel.tsx", [
  "EmployeeFinalSettlementPanel",
  "Final settlement",
  "approval",
  "payment",
  "warnings"
]);

hasAll("frontend/src/pages/EmployeeProfilePage.tsx", [
  "Final Settlement",
  "EmployeeFinalSettlementPanel",
  "employees.final_settlement.view"
]);

hasAll("frontend/src/components/payroll/PayrollNav.tsx", [
  "Exit Payroll",
  "/payroll/exit-payroll"
]);

hasAll("frontend/src/routes/AppRoutes.tsx", [
  "FinalSettlementPage",
  "payroll/exit-payroll"
]);

hasAll("worker/src/routes/payroll-foundations.ts", [
  "SKIPPED_MINIMUM_NET_PROTECTION",
  "BANK_TO_COLLECT_DIRECTLY_FROM_EMPLOYEE",
  "BANK_NOTIFICATION_PENDING",
  "BANK_NOTIFIED",
  "getFinalSettlementCustomDeductionImpact",
  "getCustomDeductionOutstandingBalanceForSettlement",
  "getCustomDeductionWarningsForSettlement"
]);

has("worker/src/auth/password.ts", "MAX_WORKER_PBKDF2_ITERATIONS = 100000", "PBKDF2 100000 limit");
has("worker/wrangler.toml", 'database_name = "hrm-v2"', "D1 database_name");
has("worker/wrangler.toml", 'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"', "D1 database_id");
has("worker/wrangler.toml", 'bucket_name = "hrm-v2-documents"', "R2 bucket");

for (const rel of [
  "frontend/src/pages/FinalSettlementPage.tsx",
  "frontend/src/components/payroll/EmployeeFinalSettlementPanel.tsx"
]) {
  notHasRegex(rel, /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/, "browser alert/confirm/prompt");
}

for (const forbidden of ["official_bank_export", "bankTransferIntegration", "employeeSettlementSignature", "settlement_acceptance_signature"]) {
  if (read("worker/src/routes/final-settlement.ts").includes(`${forbidden}(`)) fail(`Final settlement route appears to implement forbidden ${forbidden}`);
}

if (failures.length) {
  console.error("Prompt 12 final verifier failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Prompt 12 final verifier passed.");
