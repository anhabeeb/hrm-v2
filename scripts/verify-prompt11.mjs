import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const failures = [];

function ok(condition, message) {
  if (!condition) failures.push(message);
}

function includes(file, marker, message = `${file} missing ${marker}`) {
  ok(read(file).includes(marker), message);
}

for (const script of [
  "scripts/verify-baseline-prompts1-5.mjs",
  "scripts/verify-recovery-prompts6-9.mjs",
  "scripts/verify-prompt8.mjs",
  "scripts/verify-prompt9.mjs",
  "scripts/verify-prompt10.mjs"
]) ok(exists(script), `Missing protected verifier ${script}`);

const pkg = JSON.parse(read("package.json"));
ok(pkg.scripts?.["verify:prompt11"] === "node scripts/verify-prompt11.mjs", "package.json missing verify:prompt11 script");

const schema = read("database/schema.sql");
for (const marker of ["payroll_approval_events", "payroll_payslips", "payroll_payment_register", "finalization_snapshot_json", "module_enabled INTEGER"]) {
  ok(schema.includes(marker), `schema missing ${marker}`);
}

const seed = read("database/seed.sql");
for (const permission of [
  "payroll.approvals.view",
  "payroll.approvals.submit",
  "payroll.approvals.approve",
  "payroll.approvals.reject",
  "payroll.approvals.send_back",
  "payroll.finalization.finalize",
  "payroll.finalization.unlock",
  "payroll.override_finalized",
  "payroll.payslips.view",
  "payroll.payslips.generate",
  "payroll.payment_register.view",
  "payroll.payment_register.confirm_manual_paid",
  "payroll.history.view",
  "self_service.payslips.view",
  "self_service.payslips.download"
]) ok(seed.includes(permission), `seed missing ${permission}`);

const payroll = read("worker/src/routes/payroll.ts");
for (const helper of [
  "submitPayrollRunForApproval",
  "approvePayrollRun",
  "rejectPayrollRun",
  "finalizePayrollRun",
  "unlockFinalizedPayrollRun",
  "generatePayslipForEmployeeResult",
  "generatePayslipsForPayrollRun",
  "getPayslipSnapshotData",
  "preparePaymentRegisterForPayrollRun",
  "confirmManualPayrollPayment",
  "getPayrollHistorySummary",
  "canViewPayslipForEmployee",
  "canManagePayrollFinalization"
]) ok(payroll.includes(helper), `payroll route missing helper ${helper}`);

for (const route of [
  '"/runs/:id/approvals"',
  '"/runs/:id/submit-for-approval"',
  '"/runs/:id/approve"',
  '"/runs/:id/reject"',
  '"/runs/:id/send-back"',
  '"/runs/:id/finalize"',
  '"/runs/:id/unlock-finalized"',
  '"/runs/:id/finalization-status"',
  '"/runs/:id/generate-payslips"',
  '"/payslips"',
  '"/payslips/:payslipId"',
  '"/payslips/:payslipId/preview"',
  '"/payslips/:payslipId/download"',
  '"/payment-registers"',
  '"/runs/:id/payment-register"',
  '"/runs/:id/prepare-payment-register"',
  '"/payment-register/:paymentId/confirm-manual-paid"',
  '"/payment-register/:paymentId/cancel"',
  '"/history"',
  '"/employees/:employeeId/history"',
  '"/reports/summary"',
  '"/reports/department-totals"',
  '"/reports/worksite-totals"',
  '"/reports/allowances-deductions"',
  '"/reports/attendance-deductions"',
  '"/reports/leave-deductions"',
  '"/reports/advance-deductions"'
]) ok(payroll.includes(route), `payroll route missing ${route}`);

ok(payroll.includes("payroll_employee_results") && payroll.includes("payroll_result_line_items"), "payslip/history code must use active result snapshot tables");
ok(payroll.includes("PAYROLL_PAYMENT_NOT_AVAILABLE") && payroll.includes("FINAL_SETTLEMENT_NOT_AVAILABLE"), "Prompt 10 disabled payment/final settlement responses must remain");
ok(!payroll.includes("/bank-export"), "Bank export route must not be implemented in Prompt 11");
ok(!payroll.includes("BANK_EXPORT_FILE"), "Bank export file generation must not be implemented in Prompt 11");
const adminPayslipDownload = payroll.match(/payrollRoutes\.get\("\/payslips\/:payslipId\/download"[\s\S]*?\n\}\);/)?.[0] ?? "";
ok(adminPayslipDownload.includes("payroll.payslips.download") || adminPayslipDownload.includes("payroll.payslips.manage"), "admin payslip download must require payroll.payslips.download/manage");
ok(!adminPayslipDownload.includes('"payroll.view"'), "admin payslip download must not allow broad payroll.view");

const selfService = read("worker/src/routes/self-service.ts");
for (const marker of ['"/payslips"', '"/payslips/:payslipId"', "WHERE id = ? AND employee_id = ?", "getSelfServicePayslips"]) {
  ok(selfService.includes(marker) || payroll.includes(marker), `self-service payslip ownership marker missing ${marker}`);
}
for (const marker of ['"/payslips/:payslipId/preview"', '"/payslips/:payslipId/download"', "self_service.payslips.download", "self_service.payslip.downloaded"]) {
  ok(selfService.includes(marker), `self-service payslip route missing ${marker}`);
}
const selfServicePayslipDownload = selfService.match(/selfServiceRoutes\.get\("\/payslips\/:payslipId\/download"[\s\S]*?\n\}\);/)?.[0] ?? "";
ok(selfServicePayslipDownload.includes("WHERE id = ? AND employee_id = ?"), "self-service payslip download must enforce employee ownership");

const api = read("frontend/src/lib/api.ts");
for (const marker of [
  "submitPayrollRunForApproval",
  "finalizePayrollRun",
  "unlockFinalizedPayrollRun",
  "generatePayrollRunPayslips",
  "listPayrollPayslips",
  "listPayrollPaymentRegisters",
  "confirmManualPayrollPayment",
  "cancelPayrollPaymentRegister",
  "getPayrollHistory",
  "getSelfServicePayslips",
  "previewSelfServicePayslip",
  "downloadSelfServicePayslip"
]) ok(api.includes(marker), `frontend API missing ${marker}`);
ok(!api.includes("markPayrollRunPaid"), "frontend API must not expose markPayrollRunPaid");
ok(!api.includes("markPayrollAdvancePaid"), "frontend API must not expose markPayrollAdvancePaid");
ok(!api.includes("/mark-paid"), "frontend API must not call mark-paid routes");

const paymentRegisterPage = read("frontend/src/pages/PayrollPrompt11Pages.tsx");
for (const marker of [
  "confirmManualPayrollPayment",
  "cancelPayrollPaymentRegister",
  "payroll.payment_register.confirm_manual_paid",
  "payroll.payment_register.cancel",
  "confirmation_reference",
  "confirmation_note",
  "Manual payment confirmation only. No bank transfer is performed."
]) ok(paymentRegisterPage.includes(marker), `Payment Register UI missing ${marker}`);

const selfServicePage = read("frontend/src/pages/SelfServicePage.tsx");
for (const marker of [
  "previewSelfServicePayslip",
  "downloadSelfServicePayslip",
  "View payslip",
  "Download payslip",
  "Self-service payslips are limited to your linked employee profile."
]) ok(selfServicePage.includes(marker), `Self-service payslip UI missing ${marker}`);

for (const file of [
  "frontend/src/pages/PayrollRunDetailPage.tsx",
  "frontend/src/pages/PayrollPrompt11Pages.tsx",
  "frontend/src/pages/SelfServicePage.tsx"
]) {
  const content = read(file);
  ok(!/\b(alert|confirm|prompt)\s*\(/.test(content), `${file} must not use browser alert/confirm/prompt`);
}

includes("frontend/src/components/payroll/PayrollNav.tsx", "Payslips");
includes("frontend/src/components/payroll/PayrollNav.tsx", "Payment Register");
includes("frontend/src/components/payroll/PayrollNav.tsx", "History");
ok(!read("frontend/src/components/payroll/PayrollNav.tsx").includes("Final Settlements"), "PayrollNav must not expose Final Settlements");

const wrangler = read("worker/wrangler.toml");
ok(wrangler.includes('database_name = "hrm-v2"'), "D1 database_name changed");
ok(wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'), "D1 database_id changed");
ok(wrangler.includes('bucket_name = "hrm-v2-documents"'), "R2 bucket changed");

const auth = read("worker/src/auth/password.ts");
ok(auth.includes("100000"), "PBKDF2 max iterations must remain 100000");
ok(!auth.includes("210000"), "PBKDF2 must not revert to 210000");

if (failures.length) {
  console.error("Prompt 11 verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Prompt 11 verifier passed.");
