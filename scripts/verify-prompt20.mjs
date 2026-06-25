import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const exists = (file) => fs.existsSync(path.join(root, file));
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function contains(file, marker) {
  return read(file).includes(marker);
}

const schema = read("database/schema.sql");
const seed = read("database/seed.sql");
const selfServiceRoute = read("worker/src/routes/self-service.ts");
const api = read("frontend/src/lib/api.ts");
const selfServicePage = read("frontend/src/pages/SelfServicePage.tsx");
const settingsPage = read("frontend/src/pages/SelfServiceSettingsPage.tsx");
const appRoutes = read("frontend/src/routes/AppRoutes.tsx");
const wrangler = read("worker/wrangler.toml");

check(schema.includes("CREATE TABLE IF NOT EXISTS self_service_settings"), "self_service_settings table is missing.");
for (const column of [
  "module_enabled",
  "dashboard_enabled",
  "profile_update_requests_enabled",
  "payslips_enabled",
  "payment_methods_enabled",
  "bank_loans_enabled",
  "pension_enabled",
  "notifications_enabled",
  "allow_profile_update_requests",
  "allow_attendance_correction_requests",
  "allow_leave_requests",
  "allow_payslip_downloads"
]) {
  check(schema.includes(column), `self_service_settings column missing: ${column}`);
}

for (const permission of [
  "self_service.dashboard.view",
  "self_service.profile.view",
  "self_service.profile_update_requests.view",
  "self_service.profile_update_requests.create",
  "self_service.leave.view",
  "self_service.leave.apply",
  "self_service.leave.cancel",
  "self_service.attendance.view",
  "self_service.attendance_correction.view",
  "self_service.attendance_correction.request",
  "self_service.roster.view",
  "self_service.payroll.view",
  "self_service.payslips.view",
  "self_service.payslips.download",
  "self_service.payment_methods.view",
  "self_service.bank_loans.view",
  "self_service.pension.view",
  "self_service.documents.compliance.view",
  "self_service.contracts.view",
  "self_service.assets.view",
  "self_service.uniforms.view",
  "self_service.approvals.view",
  "self_service.onboarding.view",
  "self_service.offboarding.view",
  "self_service.notifications.view",
  "self_service.notifications.update",
  "self_service.settings.view",
  "self_service.settings.update",
  "self_service.settings.manage"
]) {
  check(seed.includes(permission), `Prompt 20 permission missing from seed: ${permission}`);
}

for (const helper of [
  "getAuthenticatedSelfServiceEmployee",
  "requireSelfServiceOwnEmployee",
  "maskSelfServiceSensitiveFields",
  "assertSelfServiceModuleEnabled",
  "getSelfServiceDashboardSummary",
  "getSelfServiceModuleVisibility",
  "requireSelfServiceEnabled",
  "requireSelfServiceEmployeeContext",
  "getSelfServiceProfile",
  "createSelfServiceProfileUpdateRequest",
  "getSelfServiceProfileUpdateRequests",
  "cancelSelfServiceProfileUpdateRequest",
  "getSelfServiceLeaveSummary",
  "getSelfServiceLeaveBalances",
  "createSelfServiceLeaveRequest",
  "getSelfServiceLeaveApprovalTimeline",
  "getSelfServiceAttendanceSummary",
  "getSelfServiceAttendanceCalendar",
  "createSelfServiceAttendanceCorrection",
  "getSelfServiceAttendanceCorrectionTimeline",
  "getSelfServiceRosterWeekly",
  "getSelfServiceUpcomingShifts",
  "getSelfServicePublishedRosterOnly",
  "getSelfServicePayrollSummary",
  "getSelfServicePayrollHistory",
  "getSelfServicePayslips",
  "getSelfServicePayslipDetail",
  "downloadSelfServicePayslip",
  "getSelfServiceBankLoans",
  "getSelfServiceBankLoanPaymentHistory",
  "getSelfServicePensionSummary",
  "getSelfServicePensionContributionHistory",
  "getSelfServiceDocumentCompliance",
  "getSelfServiceDocumentWarnings",
  "getSelfServiceContracts",
  "getSelfServiceContractSummary",
  "getSelfServiceAssets",
  "getSelfServiceUniforms",
  "getSelfServiceApprovalStatus",
  "getSelfServiceRequestTimeline",
  "getSelfServiceSubmittedRequests",
  "getSelfServiceOnboardingStatus",
  "getSelfServiceOffboardingStatus",
  "getSelfServiceLifecycleSummary",
  "getSelfServiceNotifications",
  "markSelfServiceNotificationRead",
  "getSelfServiceUnreadNotificationCount"
]) {
  check(selfServiceRoute.includes(helper), `Self-service helper marker missing: ${helper}`);
}

for (const route of [
  '"/dashboard"',
  '"/settings"',
  '"/profile/update-requests"',
  '"/documents/warnings"',
  '"/attendance/summary"',
  '"/attendance/calendar"',
  '"/leave/summary"',
  '"/leave/balances"',
  '"/leave/requests/:requestId/cancel"',
  '"/roster/weekly"',
  '"/roster/upcoming"',
  '"/payroll/summary"',
  '"/payroll/history"',
  '"/requests"',
  '"/approvals"',
  '"/notifications"',
  '"/notifications/:notificationId/read"'
]) {
  check(selfServiceRoute.includes(route), `Self-service backend route missing: ${route}`);
}

for (const apiHelper of [
  "getSelfServiceDashboard",
  "getSelfServiceSettings",
  "updateSelfServiceSettings",
  "getSelfServiceProfileUpdateRequests",
  "createSelfServiceProfileUpdateRequest",
  "cancelSelfServiceProfileUpdateRequest",
  "getSelfServiceAttendanceSummary",
  "getSelfServiceAttendanceCalendar",
  "getSelfServiceLeaveSummary",
  "getSelfServiceLeaveBalances",
  "cancelSelfServiceLeaveRequest",
  "getSelfServicePayrollSummary",
  "getSelfServicePayrollHistory",
  "getSelfServiceRequests",
  "getSelfServiceNotifications",
  "markSelfServiceNotificationRead",
  "markAllSelfServiceNotificationsRead"
]) {
  check(api.includes(apiHelper), `Frontend API helper missing: ${apiHelper}`);
}

for (const route of [
  "self-service/profile",
  "self-service/leave",
  "self-service/attendance",
  "self-service/roster",
  "self-service/payroll",
  "self-service/payment-methods",
  "self-service/bank-loans",
  "self-service/pension",
  "self-service/documents",
  "self-service/contracts",
  "self-service/assets",
  "self-service/uniforms",
  "self-service/approvals",
  "self-service/onboarding",
  "self-service/offboarding",
  "self-service/notifications",
  "settings/self-service"
]) {
  check(appRoutes.includes(route), `Frontend route missing: ${route}`);
}

for (const marker of [
  "SelfServiceDashboardSection",
  "PaymentMethodsSection",
  "BankLoansSection",
  "PensionSection",
  "SelfServiceRequestsSection",
  "NotificationsSection",
  "Profile update requests",
  "Employee Self-Service Settings"
]) {
  check((selfServicePage + settingsPage).includes(marker), `Frontend UI marker missing: ${marker}`);
}

for (const file of ["frontend/src/pages/SelfServicePage.tsx", "frontend/src/pages/SelfServiceSettingsPage.tsx"]) {
  const content = read(file);
  check(!/(^|[^a-zA-Z])alert\s*\(/.test(content), `${file} contains browser alert().`);
  check(!/(^|[^a-zA-Z])confirm\s*\(/.test(content), `${file} contains browser confirm().`);
  check(!/(^|[^a-zA-Z])prompt\s*\(/.test(content), `${file} contains browser prompt().`);
}

check(wrangler.includes('database_name = "hrm-v2"'), "D1 database_name changed.");
check(wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'), "D1 database_id changed.");
check(wrangler.includes('bucket_name = "hrm-v2-documents"'), "R2 bucket binding changed.");
check(contains("worker/src/auth/password.ts", "PBKDF2_ITERATIONS = 100000") || contains("worker/src/auth/password.ts", "100000"), "PBKDF2 100000 marker missing.");

for (const script of [
  "scripts/verify-baseline-prompts1-5.mjs",
  "scripts/verify-recovery-prompts6-9.mjs",
  "scripts/verify-prompt8.mjs",
  "scripts/verify-prompt9.mjs",
  "scripts/verify-prompt10.mjs",
  "scripts/verify-prompt11.mjs",
  "scripts/verify-prompt12.mjs",
  "scripts/verify-prompt12b.mjs",
  "scripts/verify-prompt12-final.mjs",
  "scripts/verify-prompt13.mjs",
  "scripts/verify-prompt14.mjs",
  "scripts/verify-prompt15.mjs",
  "scripts/verify-prompt16.mjs",
  "scripts/verify-prompt17.mjs",
  "scripts/verify-prompt18.mjs",
  "scripts/verify-prompt19.mjs"
]) {
  check(exists(script), `Prior verifier missing: ${script}`);
}

if (failures.length) {
  console.error("Prompt 20 verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Prompt 20 verification passed.");
