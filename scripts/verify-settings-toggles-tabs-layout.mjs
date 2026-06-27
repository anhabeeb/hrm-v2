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

function collectFiles(dir) {
  const fullDir = path.join(root, dir);
  if (!fs.existsSync(fullDir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(fullDir, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(rel));
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) files.push(rel.replace(/\\/g, "/"));
  }
  return files;
}

const pkg = JSON.parse(read("package.json"));
if (!pkg.scripts?.["verify:settings-toggles-tabs-layout"]) failures.push("package.json: missing verify:settings-toggles-tabs-layout script");

[
  "frontend/src/pages/SettingsPage.tsx",
  "frontend/src/components/ui/navigation-tabs.tsx",
  "frontend/src/components/ui/page-shell.tsx",
  "frontend/src/components/ui/tooltip.tsx",
  "worker/wrangler.toml",
  "worker/src/auth/password.ts"
].forEach(requireFile);

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
  "api.updatePayrollSettings",
  "api.updateFinalSettlementSettings",
  "api.updateAttendanceDeviceSettings",
  "api.updateDocumentComplianceSettings",
  "|"
].forEach((marker) => has("frontend/src/pages/SettingsPage.tsx", marker, `Settings page toggle layout marker missing: ${marker}`));

[
  "MODULE_SETTINGS_LINKS",
  "SettingsIcon",
  "settingsAction",
  "{settingsAction}",
  "{resolvedActions}"
].forEach((marker) => has("frontend/src/components/ui/page-shell.tsx", marker, `header Settings action marker missing: ${marker}`));

[
  "Tabs, TabsList, TabsTrigger",
  "min-w-fit",
  "max-w-none",
  "justify-center",
  "text-center",
  "whitespace-nowrap",
  "overflow-x-auto",
  "TabsTrigger value={resolvedValue}"
].forEach((marker) => has("frontend/src/components/ui/navigation-tabs.tsx", marker, `content-width shadcn tab marker missing: ${marker}`));

[
  "w-[168px]",
  "min-w-[168px]",
  "max-w-[168px]"
].forEach((marker) => hasNo("frontend/src/components/ui/navigation-tabs.tsx", marker, `fixed equal-width tab token remains: ${marker}`));

[
  "frontend/src/components/payroll/PayrollNav.tsx",
  "frontend/src/components/attendance/AttendanceNav.tsx",
  "frontend/src/components/roster/RosterNav.tsx",
  "frontend/src/components/assets/AssetsNav.tsx"
].forEach((file) => {
  requireFile(file);
  has(file, "ModuleNavigationBar", "module nav must use shadcn-backed ModuleNavigationBar");
  hasNo(file, /label:\s*"Settings"|\/settings"/, "module nav must not expose Settings as a tab");
});

[
  "frontend/src/pages/ContractsPage.tsx",
  "frontend/src/pages/ApprovalsPage.tsx",
  "frontend/src/pages/DocumentCompliancePage.tsx",
  "frontend/src/pages/LifecyclePage.tsx",
  "frontend/src/pages/FinalSettlementPage.tsx"
].forEach((file) => {
  requireFile(file);
  hasNo(file, /label:\s*"Settings"|key:\s*"settings"|Onboarding Settings|Offboarding Settings|>\s*Settings\s*<\/SubNavigationItem>/, "settings tab must not be present in module tab arrays");
});

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
  has(file, "ModuleSettingsBody", "disabled/read-only settings body must remain");
  hasNo(file, /<ModuleToggleHeader\b/, "old per-module main toggle header must not render");
});

has("frontend/src/components/settings/ModuleToggleHeader.tsx", "This module is disabled. Enable it from Settings.", "module disabled wording must direct users to main Settings");
has("frontend/src/layouts/AppShell.tsx", "box-border w-full max-w-none min-w-0", "full-width app shell fix must be preserved");
has("frontend/vite.config.ts", "manualChunks", "Prompt 13 chunk optimization missing");
has("worker/wrangler.toml", 'database_name = "hrm-v2"', "D1 database name changed");
has("worker/wrangler.toml", 'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"', "D1 database id changed");
has("worker/wrangler.toml", 'bucket_name = "hrm-v2-documents"', "R2 bucket changed");
has("worker/src/auth/password.ts", "const ITERATIONS = 100000", "PBKDF2 iterations must remain 100000");

collectFiles("frontend/src").forEach((file) => {
  hasNo(file, /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/, "browser alert/confirm/prompt usage is not allowed");
  hasNo(file, /\bdark:|darkMode\b/, "dark mode marker is not allowed");
});

if (failures.length) {
  console.error("Settings toggles and tabs layout verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Settings toggles and tabs layout verification passed.");
