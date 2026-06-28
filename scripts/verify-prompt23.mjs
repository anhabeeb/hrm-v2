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

function walk(relativeDir, matcher, files = []) {
  const absoluteDir = path.join(root, relativeDir);
  if (!fs.existsSync(absoluteDir)) return files;
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      walk(relativePath, matcher, files);
    } else if (matcher(relativePath)) {
      files.push(relativePath);
    }
  }
  return files;
}

function noBrowserDialogs(relativePath) {
  const content = read(relativePath);
  const checks = [
    [/window\.(alert|confirm|prompt)\s*\(/, "window alert/confirm/prompt"],
    [/(^|[^A-Za-z0-9_$\.])alert\s*\(/, "browser alert()"],
    [/(^|[^A-Za-z0-9_$\.])confirm\s*\(/, "browser confirm()"],
    [/(^|[^A-Za-z0-9_$\.])prompt\s*\(/, "browser prompt()"]
  ];
  for (const [pattern, label] of checks) {
    if (pattern.test(content)) failures.push(`${relativePath} contains ${label}`);
  }
}

const packageJson = JSON.parse(read("package.json") || "{}");
const scripts = packageJson.scripts ?? {};
const appShell = read("frontend/src/layouts/AppShell.tsx");
const appRoutes = read("frontend/src/routes/AppRoutes.tsx");
const viteConfig = read("frontend/vite.config.ts");
const pageShell = read("frontend/src/components/ui/page-shell.tsx");
const dataTableShell = read("frontend/src/components/ui/data-table-shell.tsx");
const dialogs = read("frontend/src/components/ui/dialogs.tsx");
const timeline = read("frontend/src/components/ui/timeline.tsx");
const statusBadge = read("frontend/src/components/ui/status-badge.tsx");
const dashboard = read("frontend/src/pages/DashboardPage.tsx");
const employeeProfile = read("frontend/src/pages/EmployeeProfilePage.tsx");
const payrollDashboard = read("frontend/src/pages/PayrollDashboardPage.tsx");
const reports = read("frontend/src/pages/ReportsPage.tsx");
const selfService = read("frontend/src/pages/SelfServicePage.tsx");
const workerWrangler = read("worker/wrangler.toml");
const rootWrangler = read("wrangler.toml");
const password = read("worker/src/auth/password.ts");

for (const scriptName of [
  "verify:baseline-prompts1-5",
  "verify:prompt8",
  "verify:prompt9",
  "verify:recovery-prompts6-9",
  "verify:prompt10",
  "verify:prompt11",
  "verify:prompt12",
  "verify:prompt12b",
  "verify:prompt12-final",
  "verify:prompt13",
  "verify:prompt14",
  "verify:prompt15",
  "verify:prompt16",
  "verify:prompt17",
  "verify:prompt18",
  "verify:prompt19",
  "verify:prompt20",
  "verify:prompt21",
  "verify:prompt22",
  "smoke:production-readiness",
  "verify:prompt23"
]) {
  if (!scripts[scriptName]) failures.push(`Missing package script: ${scriptName}`);
}

for (const relativePath of [
  "scripts/verify-prompt13.mjs",
  "scripts/verify-prompt14.mjs",
  "scripts/verify-prompt15.mjs",
  "scripts/verify-prompt16.mjs",
  "scripts/verify-prompt17.mjs",
  "scripts/verify-prompt18.mjs",
  "scripts/verify-prompt19.mjs",
  "scripts/verify-prompt20.mjs",
  "scripts/verify-prompt21.mjs",
  "scripts/verify-prompt22.mjs",
  "scripts/run-production-smoke-checks.mjs"
]) {
  exists(relativePath);
}

for (const marker of [
  "PageShell",
  "PageHeader",
  "PageBreadcrumbs",
  "PageActions",
  "SectionCard",
  "StatCard",
  "SummaryCard",
  "QuickActionCard",
  "MetricGrid",
  "ActionBar",
  "FilterBar",
  "FormSection",
  "SettingsSection",
  "DashboardWidget",
  "WarningPanel",
  "InfoPanel",
  "LoadingState",
  "ErrorState",
  "PermissionDeniedState",
  "ModuleDisabledState",
  "ResponsiveTabs",
  "MobileListCard"
]) {
  has(pageShell, marker, `page-shell ${marker}`);
}

for (const marker of ["DataTableShell", "LoadingState", "ErrorState", "EmptyState"]) has(dataTableShell, marker, `data table shell ${marker}`);
for (const marker of ["DetailDrawer", "ConfirmDialog", "requireReason"]) has(dialogs, marker, `dialogs ${marker}`);
for (const marker of ["Timeline", "TimelineItem"]) has(timeline, marker, `timeline ${marker}`);
for (const marker of ["StatusBadge", "READY_FOR_REVIEW", "FINALIZED_PLACEHOLDER", "BANK_NOTIFICATION_PENDING"]) has(statusBadge, marker, `status badge ${marker}`);

for (const marker of [
  "navGroups",
  "AdminShell",
  "SelfServiceShell",
  "collapsed",
  "Menu",
  "Bell",
  "Search",
  "Time & Attendance",
  "Lifecycle",
  "Admin Controls"
]) {
  has(appShell, marker, `app shell ${marker}`);
}

for (const marker of ["lazyPage", "Suspense"]) has(appRoutes, marker, `app routes ${marker}`);
has(viteConfig, "manualChunks", "Vite manualChunks preserved");

for (const marker of ["PageShell", "PageHeader", "DashboardWidget", "PriorityKpiIconStrip", "Accordion", "CommandCenterKpiGrid"]) has(dashboard, marker, `dashboard ${marker}`);
for (const marker of ["EmployeeAvatar", "EmployeeProfilePhotoControls", "ResponsiveTabs", "EmployeePayrollPanel", "EmployeeDocumentsPanel"]) has(employeeProfile, marker, `Employee 360 ${marker}`);
for (const marker of ["Payroll run status stepper", "MetricGrid", "StatCard", "DashboardWidget"]) has(payrollDashboard, marker, `payroll dashboard ${marker}`);
for (const marker of ["Report Center", "PageHeader", "PageShell", "groupedReports"]) has(reports, marker, `reports page ${marker}`);
for (const marker of ["Employee Self-Service", "PageShell", "PageHeader", "My HR workspace"]) has(selfService, marker, `self-service ${marker}`);

const frontendFiles = walk("frontend/src", (file) => /\.(ts|tsx)$/.test(file));
for (const file of frontendFiles) {
  const content = read(file);
  noBrowserDialogs(file);
  notHas(content, "dark:", `${file} contains dark-mode Tailwind class`);
  notHas(content.toLowerCase(), "dark mode", `${file} contains dark mode copy`);
  notHas(content.toLowerCase(), "tailwindui", `${file} contains Tailwind UI branding`);
  notHas(content.toLowerCase(), "tailwind admin", `${file} contains Tailwind Admin branding`);
}

for (const config of [workerWrangler, rootWrangler]) {
  has(config, 'database_name = "hrm-v2"', "D1 database name");
  has(config, 'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"', "D1 database id");
  has(config, 'bucket_name = "hrm-v2-documents"', "R2 bucket");
}
has(password, "100000", "PBKDF2 max iterations remain 100000");

if (failures.length) {
  console.error("Prompt 23 verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Prompt 23 UI modernization verification passed.");
