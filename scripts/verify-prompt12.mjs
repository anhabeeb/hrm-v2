import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();

function read(rel) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) fail(`Missing file: ${rel}`);
  return fs.readFileSync(file, "utf8");
}

const failures = [];

function fail(message) {
  failures.push(message);
}

function assertIncludes(rel, markers) {
  const content = read(rel);
  for (const marker of markers) {
    if (!content.includes(marker)) fail(`${rel} is missing marker: ${marker}`);
  }
}

function assertNoBrowserPrompts(rel) {
  const content = read(rel);
  const match = content.match(/\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/);
  if (match) fail(`${rel} contains browser prompt/alert/confirm usage: ${match[0]}`);
}

assertIncludes("database/schema.sql", [
  "payment_institutions",
  "employee_payment_methods",
  "BANK_TRANSFER",
  "CASH",
  "PERCENTAGE",
  "FIXED_AMOUNT",
  "employee_bank_loans",
  "employer_undertaking_required",
  "salary_routing_commitment_status",
  "employee_bank_loan_payments",
  "bank_loan_eligibility_rules",
  "INELIGIBLE_BY_DEFAULT",
  "bank_loan_remittance_batches",
  "bank_loan_remittance_batch_items",
  "pension_schemes",
  "effective_from",
  "employee_pension_profiles",
  "foreign_employee_default_required",
  "payroll_pension_contributions",
  "pension_remittance_batches",
  "bank_loan_cash_salary_default_ineligible",
  "bank_loan_statement_months_required_default",
  "bank_loan_salary_slips_months_required_default",
  "bank_loan_insufficient_salary_mode",
  "payroll_deduction_priority_json",
  "cash_salary_acknowledgement_enabled",
  "bank_loan_minimum_net_salary_protection_enabled",
  "bank_loan_minimum_net_salary_threshold_type",
  "PERCENTAGE_OF_NET_SALARY",
  "FIXED_AMOUNT",
  "bank_loan_skip_if_below_threshold_enabled",
  "bank_loan_bank_notification_required_on_skip",
  "bank_loan_employee_direct_collection_status_enabled",
  "SKIPPED_MINIMUM_NET_PROTECTION",
  "BANK_TO_COLLECT_DIRECTLY_FROM_EMPLOYEE",
  "BANK_NOTIFIED",
  "BANK_NOTIFICATION_PENDING",
  "minimum_net_salary_threshold_type",
  "net_salary_before_loan",
  "net_salary_after_attempted_loan",
  "skipped_due_to_minimum_net_salary",
  "bank_direct_collection_required",
  "bank_notification_reference",
  "bank_notified_by_user_id"
]);

const schemaSql = read("database/schema.sql");
const modeLine = schemaSql.match(/bank_loan_insufficient_salary_mode[^\n]+/)?.[0] ?? "";
for (const mode of ["WARN_ONLY", "PARTIAL_DEDUCTION", "SKIP_AND_MARK_FAILED", "BLOCK_PAYROLL", "REQUIRE_OVERRIDE"]) {
  if (!modeLine.includes(mode)) fail(`bank_loan_insufficient_salary_mode is missing ${mode}`);
}
for (const oldMode of ["PARTIAL_AND_CARRY_FORWARD", "SKIP_AND_CARRY_FORWARD"]) {
  if (modeLine.includes(oldMode)) fail(`bank_loan_insufficient_salary_mode still includes old mode ${oldMode}`);
}
if (!modeLine.includes("DEFAULT 'REQUIRE_OVERRIDE'")) fail("bank_loan_insufficient_salary_mode default must be REQUIRE_OVERRIDE");
if (!schemaSql.includes("line_type IN ('EARNING', 'DEDUCTION', 'INFO', 'EMPLOYER_COST')")) fail("payroll line item schema must allow INFO/EMPLOYER_COST");

assertIncludes("database/seed.sql", [
  "payroll.payment_institutions.view",
  "employees.payment_methods.sensitive.view",
  "self_service.payment_methods.view",
  "payroll.bank_loans.sensitive.view",
  "payroll.bank_loan_remittance.prepare",
  "self_service.bank_loans.view",
  "payroll.pension_schemes.view",
  "employees.pension_profiles.sensitive.view",
  "payroll.pension_remittance.prepare",
  "self_service.pension.view",
  "BANK_LOAN_DEDUCTION",
  "PENSION_EMPLOYEE_CONTRIBUTION",
  "PENSION_EMPLOYER_CONTRIBUTION",
  "pension_scheme_mrps"
]);

assertIncludes("worker/src/routes/payroll-foundations.ts", [
  "payrollFoundationRoutes",
  "payment-institutions",
  "employee_payment_methods",
  "getActivePaymentMethodSnapshot",
  "getActiveApprovedBankLoansForPayroll",
  "recordBankLoanPayrollPayments",
  "calculatePayrollPensionContribution",
  "recordPayrollPensionContribution",
  "bank-loan-eligibility-rules",
  "bank-loan-remittance-batches",
  "pension-schemes",
  "pension-remittance-batches",
  "selfServicePayrollFoundationRoutes",
  "Payment method is missing.",
  "INELIGIBLE_CASH_SALARY",
  "official_bank_export_generated"
]);

assertIncludes("worker/src/routes/payroll-foundations.ts", [
  "BANK_LOAN_INSUFFICIENT_SALARY_MODES",
  "PARTIAL_DEDUCTION",
  "SKIP_AND_MARK_FAILED",
  "REQUIRE_OVERRIDE_NO_DEDUCTION",
  "carried_forward_amount: carriedForward",
  "Monthly installment amount must be greater than 0.",
  "loan_reference_number: loanReferenceNumber",
  "payment_institution_id = ?",
  "bank_name_snapshot = ?",
  "show_loan_details_in_self_service",
  "pension_show_in_self_service",
  "bankLoanMinimumNetThreshold",
  "SKIPPED_MINIMUM_NET_PROTECTION",
  "BANK_TO_COLLECT_DIRECTLY_FROM_EMPLOYEE",
  "BANK_NOTIFICATION_PENDING",
  "skipped_due_to_minimum_net_salary",
  "bank_direct_collection_required",
  "mark-bank-notified",
  "payroll.bank_loan_payment.bank_notified",
  "total_direct_collection_amount",
  "This month's loan deduction was skipped by payroll due to minimum salary protection"
]);

assertIncludes("worker/src/routes/payroll.ts", [
  "getActivePaymentMethodSnapshot",
  "BANK_LOAN_DEDUCTION",
  "PENSION_EMPLOYEE_CONTRIBUTION",
  "PENSION_EMPLOYER_CONTRIBUTION",
  "Bank loan salary deduction",
  "Pension employee contribution",
  "Pension employer contribution (company cost)",
  "recordBankLoanPayrollPayments",
  "recordPayrollPensionContribution",
  "payment_method_snapshot",
  "employee_payment_methods"
]);

assertIncludes("worker/src/routes/payroll.ts", [
  "BANK_LOAN_INSUFFICIENT_SALARY_MODES",
  "bank_loan_deductions_enabled",
  "allow_multiple_bank_loans_per_employee",
  "require_loan_approval_before_payroll_deduction",
  "loan_deduction_priority",
  "allow_partial_loan_deduction",
  "bank_loan_insufficient_salary_mode",
  "bank_loan_minimum_net_salary_protection_enabled",
  "bank_loan_minimum_net_salary_threshold_type",
  "bank_loan_minimum_net_salary_threshold_percentage",
  "bank_loan_minimum_net_salary_threshold_amount",
  "bank_loan_skip_if_below_threshold_enabled",
  "bank_loan_bank_notification_required_on_skip",
  "bank_loan_employee_direct_collection_status_enabled",
  "pension_employer_can_pay_employee_share",
  "cash_salary_acknowledgement_required_before_finalize",
  "canViewBankLoans",
  "canSensitiveBankLoans",
  "safeBankLoan(",
  "canViewPension",
  "canSensitivePension",
  "safePensionProfile(",
  "bank_loan_requires_resolution",
  "EMPLOYER_COST",
  "not_employee_earning: true"
]);
if (read("worker/src/routes/payroll.ts").includes('"EARNING", "PENSION_EMPLOYER_COST"')) fail("Employer pension contribution is still inserted as an employee earning.");

assertIncludes("worker/src/routes/final-settlement.ts", [
  "getActivePaymentMethodSnapshot",
  "getEmployeePaymentMethods",
  "employee_bank_loans",
  "employee_bank_loan_payments",
  "employee_pension_profiles",
  "payroll_pension_contributions",
  "payment_methods_source"
]);

assertIncludes("worker/src/index.ts", [
  "payrollFoundationRoutes",
  "employeePayrollFoundationRoutes",
  "selfServicePayrollFoundationRoutes"
]);

assertIncludes("frontend/src/lib/api.ts", [
  "listPaymentInstitutions",
  "createEmployeePaymentMethod",
  "listPayrollBankLoans",
  "confirmBankLoanPaidToBank",
  "markBankLoanPaymentBankNotified",
  "listBankLoanEligibilityRules",
  "listBankLoanRemittanceBatches",
  "listPensionSchemes",
  "listPensionContributions",
  "listPensionRemittanceBatches",
  "getSelfServicePaymentMethods",
  "getSelfServiceBankLoans",
  "getSelfServicePension"
]);

assertIncludes("frontend/src/pages/PayrollAdminPages.tsx", [
  "General Payroll",
  "Bank Loan Deductions",
  "Pension Settings",
  "Payment/Cash Salary Settings",
  "Deduction Priority",
  "bank_loan_insufficient_salary_mode",
  "SKIP_AND_MARK_FAILED",
  "Enable minimum net salary protection",
  "Minimum net threshold type",
  "Skip loan if below threshold",
  "Require bank notification on skip",
  "Enable direct collection status",
  "show_loan_details_in_self_service",
  "show_loan_details_on_payslip",
  "pension_employer_can_pay_employee_share",
  "cash_salary_signature_capture_placeholder_enabled",
  "payroll_deduction_priority_json"
]);

assertIncludes("frontend/src/components/payroll/EmployeePayrollFoundationPanels.tsx", [
  "Payment methods",
  "Bank loan salary deductions",
  "Pension profile",
  "createEmployeePaymentMethod",
  "createEmployeeBankLoan",
  "updateEmployeePensionProfile"
]);

assertIncludes("frontend/src/pages/PayrollFoundationPages.tsx", [
  "PayrollPaymentInstitutionsPage",
  "PayrollBankLoansPage",
  "PayrollPensionPage",
  "Bank loan summary by bank",
  "Remittance batches",
  "Pension schemes",
  "markBankLoanPaymentBankNotified",
  "Mark bank notified",
  "total_direct_collection_amount",
  "bank_notification_status"
]);

assertIncludes("frontend/src/routes/AppRoutes.tsx", [
  "payroll/payment-institutions",
  "payroll/bank-loans",
  "payroll/pension"
]);

assertIncludes("frontend/src/components/payroll/PayrollNav.tsx", [
  "Payment Institutions",
  "Bank Loans",
  "Pension"
]);

assertIncludes("frontend/src/pages/SelfServicePage.tsx", [
  "My payment methods",
  "My bank loans",
  "My pension profile",
  "getSelfServicePaymentMethods",
  "getSelfServiceBankLoans",
  "getSelfServicePension",
  "employee_direct_collection_message",
  "bank_notification_status"
]);

assertNoBrowserPrompts("frontend/src/components/payroll/EmployeePayrollFoundationPanels.tsx");
assertNoBrowserPrompts("frontend/src/pages/PayrollFoundationPages.tsx");
assertNoBrowserPrompts("frontend/src/pages/PayrollAdminPages.tsx");
assertNoBrowserPrompts("frontend/src/pages/SelfServicePage.tsx");
assertNoBrowserPrompts("frontend/src/components/payroll/EmployeePayrollPanel.tsx");

assertIncludes("worker/wrangler.toml", [
  'database_name = "hrm-v2"',
  'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"',
  'binding = "DOCUMENTS_BUCKET"',
  'bucket_name = "hrm-v2-documents"'
]);

assertIncludes("worker/src/auth/password.ts", ["PBKDF2_ITERATIONS = 100000"]);

const packageJson = JSON.parse(read("package.json"));
for (const script of ["verify:baseline-prompts1-5", "verify:prompt8", "verify:prompt9", "verify:recovery-prompts6-9", "verify:prompt10", "verify:prompt11"]) {
  if (!packageJson.scripts?.[script]) fail(`package.json is missing ${script}`);
}

if (failures.length) {
  console.error("Prompt 12A verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Prompt 12A verification passed.");
