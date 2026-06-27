import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function requireFile(relativePath) {
  if (!exists(relativePath)) failures.push(`${relativePath}: missing required file`);
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

const pkg = JSON.parse(read("package.json"));
if (!pkg.scripts?.["verify:module-toggle-settings"]) failures.push("package.json: missing verify:module-toggle-settings script");

requireFile("frontend/src/pages/SettingsPage.tsx");
requireFile("frontend/src/components/settings/ModuleToggleHeader.tsx");
requireFile("frontend/src/components/ui/switch.tsx");
requireFile("frontend/src/components/ui/tooltip.tsx");

[
  "SettingsToggleGroup",
  "ModuleTogglePill",
  "Tooltip",
  "Switch",
  "Payroll Core",
  "payslips_enabled",
  "payment_register_enabled",
  "payment_methods_enabled",
  "payment_institutions_enabled",
  "pension_enabled",
  "bank_loan_deductions_enabled",
  "employee_advances_enabled",
  "custom_deductions_enabled",
  "payroll_adjustments_enabled",
  "payroll_reports_enabled",
  "final_settlement_enabled",
  "|",
  "api.updatePayrollSettings",
  "api.updateAttendanceSettings",
  "api.updateRosterSettings",
  "api.updateSelfServiceSettings"
].forEach((marker) => has("frontend/src/pages/SettingsPage.tsx", marker, `main Settings page missing centralized toggle marker: ${marker}`));

has("frontend/src/components/settings/ModuleToggleHeader.tsx", "This module is disabled. Enable it from Settings.", "disabled settings body must use current Settings-page wording");
has("frontend/src/components/ui/switch.tsx", "onCheckedChange", "approved switch component must remain available");
has("frontend/src/components/ui/tooltip.tsx", "role=\"tooltip\"", "toggle descriptions must have hover/focus tooltip support");

[
  "frontend/src/pages/AttendanceSettingsPage.tsx",
  "frontend/src/pages/RosterSettingsPage.tsx",
  "frontend/src/pages/SelfServiceSettingsPage.tsx",
  "frontend/src/pages/DocumentCompliancePage.tsx",
  "frontend/src/pages/ApprovalsPage.tsx",
  "frontend/src/pages/ContractsPage.tsx",
  "frontend/src/pages/LifecyclePage.tsx",
  "frontend/src/pages/FinalSettlementPage.tsx",
  "frontend/src/pages/PayrollAdminPages.tsx",
  "frontend/src/pages/AssetUniformAdvancedPages.tsx",
  "frontend/src/pages/AttendanceDeviceOperationsPage.tsx"
].forEach((file) => {
  requireFile(file);
  has(file, "ModuleSettingsBody", "module settings page must keep disabled/read-only body state");
  hasNo(file, /<ModuleToggleHeader\b/, "module settings page must not render the old top module toggle header");
  hasNo(file, /\b(window\.)?(alert|confirm|prompt)\s*\(/, "browser alert/confirm/prompt must not be used");
});

has("frontend/src/routes/AppRoutes.tsx", "lazyPage", "Prompt 13 route-level lazy loading marker missing");
has("frontend/vite.config.ts", "manualChunks", "Prompt 13 manual chunk split marker missing");
has("worker/src/auth/password.ts", "100000", "PBKDF2 max iteration marker must remain 100000");
has("worker/wrangler.toml", 'binding = "DB"', "D1 binding missing");
has("worker/wrangler.toml", 'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"', "D1 database id changed");
has("worker/wrangler.toml", 'binding = "DOCUMENTS_BUCKET"', "R2 binding missing");
has("worker/wrangler.toml", 'bucket_name = "hrm-v2-documents"', "R2 bucket changed");

if (failures.length) {
  console.error("Module toggle settings verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Module toggle settings verification passed.");
