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
  const files = [];
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(rel));
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) files.push(rel.replace(/\\/g, "/"));
  }
  return files;
}

const pkg = JSON.parse(read("package.json"));
const scripts = pkg.scripts ?? {};
[
  "verify:prompt13",
  "verify:prompt23",
  "verify:ui-standardization",
  "verify:nav-tabs",
  "verify:page-layout-consistency",
  "smoke:production-readiness"
].forEach((scriptName) => {
  if (!scripts[scriptName]) failures.push(`package.json: missing ${scriptName}`);
});

[
  "frontend/src/components/ui/page-shell.tsx",
  "frontend/src/components/ui/navigation-tabs.tsx",
  "frontend/src/components/ui/data-table-shell.tsx",
  "frontend/src/components/ui/data-table.tsx",
  "frontend/src/pages/DashboardPage.tsx",
  "frontend/src/pages/EmployeeProfilePage.tsx",
  "frontend/src/components/assets/AssetsNav.tsx",
  "worker/wrangler.toml",
  "worker/src/auth/password.ts",
  "frontend/vite.config.ts"
].forEach(requireFile);

const pageShell = "frontend/src/components/ui/page-shell.tsx";
[
  "PageHeader",
  "ModulePageHeader",
  "AppPageHeader",
  "PageShell",
  "PageLayout",
  "ModulePageLayout",
  "PageContent",
  "AppContentContainer",
  "PageActions",
  "PageBreadcrumbs",
  "FilterBar",
  "ActionBar",
  "SectionCard",
  "SettingsCard",
  "TabsShell",
  "StandardTabs",
  "AppTabs",
  "ModuleTabs",
  "EmployeeStyleTabs",
  "ResponsiveTabs",
  "role=\"tablist\"",
  "aria-selected",
  "whitespace-nowrap",
  "rounded-lg border bg-white",
  "shadow-panel",
  "max-w-[1480px]"
].forEach((marker) => has(pageShell, marker, `shared page layout marker missing: ${marker}`));

[
  "ModuleNavigationBar",
  "ModuleNavigationItem",
  "SubNavigationBar",
  "SubNavigationItem",
  "overflow-x-auto",
  "whitespace-nowrap",
  "aria-current"
].forEach((marker) => has("frontend/src/components/ui/navigation-tabs.tsx", marker, `shared navigation tab marker missing: ${marker}`));

[
  "DataTableShell",
  "ResponsiveTableWrapper",
  "overflow-x-auto"
].forEach((marker) => has("frontend/src/components/ui/data-table-shell.tsx", marker, `responsive table marker missing: ${marker}`));

has("frontend/src/pages/DashboardPage.tsx", "HRM command center", "HRM Command Center header reference marker missing");
has("frontend/src/pages/DashboardPage.tsx", "PageHeader", "Dashboard must use shared PageHeader");
has("frontend/src/pages/DashboardPage.tsx", "PageShell", "Dashboard must use shared PageShell");

has("frontend/src/pages/EmployeeProfilePage.tsx", "ResponsiveTabs", "Employee 360 tabs must use shared Employee-style ResponsiveTabs");
has("frontend/src/pages/EmployeeProfilePage.tsx", "Contacts", "Employee Contact tab reference marker missing");

[
  ["frontend/src/components/attendance/AttendanceNav.tsx", "Attendance navigation"],
  ["frontend/src/components/roster/RosterNav.tsx", "Roster navigation"],
  ["frontend/src/components/payroll/PayrollNav.tsx", "Payroll navigation"],
  ["frontend/src/components/assets/AssetsNav.tsx", "Assets and uniforms navigation"]
].forEach(([file, label]) => {
  requireFile(file);
  has(file, "ModuleNavigationBar", `${label} must use shared ModuleNavigationBar`);
  has(file, "ModuleNavigationItem", `${label} must use shared ModuleNavigationItem`);
  has(file, label, `${label} accessible label missing`);
});

const layoutPages = [
  "frontend/src/pages/DashboardPage.tsx",
  "frontend/src/pages/EmployeesPage.tsx",
  "frontend/src/pages/EmployeeProfilePage.tsx",
  "frontend/src/pages/PayrollDashboardPage.tsx",
  "frontend/src/pages/PayrollRunsPage.tsx",
  "frontend/src/pages/PayrollAdminPages.tsx",
  "frontend/src/pages/PayrollFoundationPages.tsx",
  "frontend/src/pages/PayrollPrompt11Pages.tsx",
  "frontend/src/pages/ReportsPage.tsx",
  "frontend/src/pages/SelfServicePage.tsx",
  "frontend/src/pages/AdminHelpGuidePage.tsx",
  "frontend/src/pages/AssetUniformAdvancedPages.tsx"
];

layoutPages.forEach((file) => {
  requireFile(file);
  has(file, /PageHeader|PayrollPageHeader|EmployeeProfileCard|Header title=|<Header\b/, "major page must use shared PageHeader or an approved detail header wrapper");
  has(file, /PageShell|PayrollPageShell|PayrollTablePageLayout/, "major page must use shared PageShell/PageLayout or an approved wrapper backed by it");
});

[
  "frontend/src/pages/PayrollAdminPages.tsx",
  "frontend/src/pages/PayrollFoundationPages.tsx",
  "frontend/src/pages/PayrollPrompt11Pages.tsx",
  "frontend/src/pages/AssetUniformAdvancedPages.tsx"
].forEach((file) => {
  has(file, "PageHeader", "post-production page header standard missing");
});

[
  "frontend/src/pages/EmployeesPage.tsx",
  "frontend/src/pages/PayrollAdminPages.tsx",
  "frontend/src/pages/PayrollRunsPage.tsx",
  "frontend/src/pages/ReportsPage.tsx",
  "frontend/src/pages/AssetUniformAdvancedPages.tsx"
].forEach((file) => {
  has(file, "FilterBar", "list/report pages should use shared FilterBar");
});

[
  "frontend/src/pages/EmployeesPage.tsx",
  "frontend/src/pages/PayrollRunsPage.tsx",
  "frontend/src/pages/PayrollFoundationPages.tsx",
  "frontend/src/pages/PayrollPrompt11Pages.tsx",
  "frontend/src/pages/AssetUniformAdvancedPages.tsx",
  "frontend/src/pages/ReportsPage.tsx"
].forEach((file) => {
  has(file, /DataTableFrame|DataTableShell|ResponsiveTableWrapper|overflow-x-auto/, "table/list page must keep horizontal scroll inside the table wrapper");
});

[
  "frontend/src/pages/AttendanceSettingsPage.tsx",
  "frontend/src/pages/RosterSettingsPage.tsx",
  "frontend/src/pages/PayrollAdminPages.tsx",
  "frontend/src/pages/AssetUniformAdvancedPages.tsx",
  "frontend/src/pages/AdminSettingsPage.tsx",
  "frontend/src/pages/SelfServiceSettingsPage.tsx"
].forEach((file) => {
  if (!exists(file)) return;
  has(file, /ModuleToggleHeader|Production Controls|ModuleSettingsBody/, "settings pages must keep module toggle/disabled settings structure");
});

hasNo("frontend/src/pages/PayrollAdminPages.tsx", /function\s+PageShell\s*\(/, "payroll admin must not define a one-off PageShell");
hasNo("frontend/src/components/assets/AssetsNav.tsx", /className=.*border-b-2/, "AssetsNav must not use one-off tab classes");

has("frontend/vite.config.ts", "manualChunks", "Prompt 13 chunk optimization missing");
has("worker/wrangler.toml", 'database_name = "hrm-v2"', "D1 database name changed");
has("worker/wrangler.toml", 'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"', "D1 database id changed");
has("worker/wrangler.toml", 'bucket_name = "hrm-v2-documents"', "R2 bucket changed");
has("worker/src/auth/password.ts", "const ITERATIONS = 100000", "PBKDF2 iterations must remain 100000");

const frontendFiles = collectFiles("frontend/src");
const browserPromptPattern = /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/;
const darkModePattern = /\bdark:|darkMode\b/;
frontendFiles.forEach((file) => {
  hasNo(file, browserPromptPattern, "browser alert/confirm/prompt usage is not allowed");
  hasNo(file, darkModePattern, "dark mode marker is not allowed");
});

if (failures.length) {
  console.error("Page layout consistency verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Page layout consistency verification passed.");
