import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function filePath(relativePath) {
  return path.join(root, relativePath);
}

function read(relativePath) {
  return fs.readFileSync(filePath(relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(filePath(relativePath));
}

function requireFile(relativePath) {
  if (!exists(relativePath)) failures.push(`${relativePath}: missing required file`);
}

function has(relativePath, marker, message) {
  if (!exists(relativePath)) return failures.push(`${relativePath}: missing file for check`);
  const content = read(relativePath);
  const ok = marker instanceof RegExp ? marker.test(content) : content.includes(marker);
  if (!ok) failures.push(`${relativePath}: ${message}`);
}

function hasNo(relativePath, marker, message) {
  if (!exists(relativePath)) return;
  const content = read(relativePath);
  const ok = marker instanceof RegExp ? !marker.test(content) : !content.includes(marker);
  if (!ok) failures.push(`${relativePath}: ${message}`);
}

function collectFiles(dir) {
  const fullDir = filePath(dir);
  if (!fs.existsSync(fullDir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(fullDir, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(rel));
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) files.push(rel.replace(/\\/g, "/"));
  }
  return files;
}

function pageName(relativePath) {
  return path.basename(relativePath);
}

function isAllowedNarrowContext(line) {
  return /fixed|inset-0|modal|Modal|Dialog|drawer|Drawer|popover|Popover|tooltip|Tooltip|shadow-xl|max-h-\[|auth|login|SetupPage|setup|CommandCenterKpiGrid|max-w-\[89rem\]/i.test(line);
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
  "frontend/src/layouts/AppShell.tsx",
  "frontend/src/pages/DashboardPage.tsx",
  "frontend/src/pages/EmployeeProfilePage.tsx",
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
  "getNavigationTabItemClass",
  "AppTabs",
  "ModuleTabs",
  "EmployeeStyleTabs",
  "ResponsiveTabs",
  "TabsList",
  "TabsTrigger",
  "onValueChange",
  "rounded-lg border bg-white",
  "shadow-panel",
  "box-border w-full max-w-none min-w-0"
].forEach((marker) => has(pageShell, marker, `shared page layout marker missing: ${marker}`));

has(pageShell, /PageShell[\s\S]*box-border w-full max-w-none min-w-0/, "PageShell default must be full available width");
has(pageShell, /PageContent[\s\S]*box-border w-full max-w-none min-w-0/, "PageContent default must be full available width");
has(pageShell, /PageHeader[\s\S]*box-border flex w-full max-w-none min-w-0/, "PageHeader default must fill the shared page width");
has(pageShell, /SectionCard[\s\S]*box-border w-full max-w-none min-w-0/, "SectionCard default must fill the shared page width");
has(pageShell, /MetricGrid[\s\S]*grid w-full max-w-none min-w-0/, "MetricGrid default must fill the shared page width");
has(pageShell, /FilterBar[\s\S]*box-border grid w-full max-w-none min-w-0/, "FilterBar default must fill the shared page width");
hasNo(pageShell, /max-w-\[1480px\]|mx-auto w-full max-w|max-w-3xl/, "shared PageShell/PageHeader must not independently narrow page width");

const appShell = "frontend/src/layouts/AppShell.tsx";
has(appShell, "box-border w-full max-w-none min-w-0", "app shell routed content must use full available width");
hasNo(appShell, /mx-auto\s+w-full\s+max-w|max-w-\[(?:1480|1680)px\]|max-w-screen-xl|container\s+mx-auto/, "app shell routed content must not center or cap normal pages");

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
  "box-border w-full max-w-none min-w-0",
  "DataTableShell",
  "ResponsiveTableWrapper",
  "overflow-x-auto"
].forEach((marker) => has("frontend/src/components/ui/data-table-shell.tsx", marker, `responsive table marker missing: ${marker}`));

[
  "box-border w-full max-w-none min-w-0",
  "DataTableFrame",
  "ResponsiveTableWrapper"
].forEach((marker) => has("frontend/src/components/ui/data-table.tsx", marker, `data table frame marker missing: ${marker}`));

has("frontend/src/pages/DashboardPage.tsx", "<section className=\"CommandCenterHeader", "Command Center must use the dedicated welcome-first header section");
has("frontend/src/pages/DashboardPage.tsx", "<CommandCenterWelcome name={welcome.name} title={welcome.title} />", "Command Center welcome must be the header's primary content");
hasNo("frontend/src/pages/DashboardPage.tsx", "APP_BRANDING", "Command Center page header must not use app branding in place of the welcome heading");
has("frontend/src/pages/DashboardPage.tsx", "PageShell", "Dashboard must use shared PageShell");
hasNo("frontend/src/pages/DashboardPage.tsx", /max-w-(?:3xl|4xl|5xl|6xl|7xl|screen-xl)|\bcontainer\b|\bw-fit\b|\binline-block\b|centered|commandCenterContainer|dashboardContentClassName|PageShell\b[^>]*(?:variant|size)=["'](?:centered|narrow)/i, "Command Center must not use a centered or narrow page wrapper");
has("frontend/src/pages/DashboardPage.tsx", "CommandCenterKpiGrid", "Dashboard KPI cards must use the dedicated centered KPI grid wrapper");
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

const pageFiles = collectFiles("frontend/src/pages")
  .filter((file) => !["LoginPage.tsx", "SetupPage.tsx"].includes(pageName(file)));

const shellPattern = /<PageShell\b|<PageLayout\b|<ModulePageLayout\b|<AppContentContainer\b|<PayrollPageShell\b|<PayrollTablePageLayout\b/;
const headerPattern = /<PageHeader\b|<AppPageHeader\b|<ModulePageHeader\b|<EmployeeProfileCard\b|<PayrollPageHeader\b|<Header\b/;
const sharedTabsPattern = /\b(?:ResponsiveTabs|StandardTabs|AppTabs|EmployeeStyleTabs|SubNavigationBar|ModuleTabs)\b/;
const tabIntentPattern = /\b(?:activeTab|setActiveTab|setTab\(|activeSection|section tabs|role="tablist"|TabsList)\b|tab\s*===/;

const shellUsers = [];
const headerUsers = [];
const tabbedPages = [];
const sharedTabUsers = [];

for (const file of pageFiles) {
  const content = read(file);
  if (shellPattern.test(content)) shellUsers.push(file);
  if (headerPattern.test(content)) headerUsers.push(file);
  if (tabIntentPattern.test(content)) {
    tabbedPages.push(file);
    if (sharedTabsPattern.test(content)) sharedTabUsers.push(file);
  }

  if (/<Table\b/.test(content) && !/(overflow-x-auto|ResponsiveTableWrapper|DataTableFrame|DataTableShell|TableWrap)/.test(content)) {
    failures.push(`${file}: table content must be wrapped in a responsive overflow/table shell`);
  }

  if (/return\s*\(\s*<div\s+className="space-y-[46]/.test(content) && !shellPattern.test(content)) {
    failures.push(`${file}: page returns a one-off page wrapper instead of PageShell/PageLayout`);
  }

  if (/<h1\b/.test(content) && !headerPattern.test(content)) {
    failures.push(`${file}: page-level h1 must be provided through the shared PageHeader family`);
  }

  if (tabIntentPattern.test(content) && !sharedTabsPattern.test(content)) {
    failures.push(`${file}: tabbed page must use shared StandardTabs/ResponsiveTabs/SubNavigationBar`);
  }

  if (/setTab\([^)]*\).*border-b-2|border-b-2[\s\S]{0,160}setTab\(/.test(content)) {
    failures.push(`${file}: one-off tab button classes detected; use shared tab components`);
  }

  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (/(max-w-(?:3xl|4xl|5xl|6xl|7xl|screen-xl)|container\s+mx-auto|\bmx-auto\b|\bw-fit\b|\binline-block\b)/.test(line) && !isAllowedNarrowContext(line)) {
      failures.push(`${file}:${index + 1}: page-level narrow width wrapper detected; use the shared full-width PageShell defaults`);
    }
    if (/<PageShell\b[^>]*className=["'][^"']*(?:max-w-|mx-auto|container|w-fit|inline-block)/.test(line)) {
      failures.push(`${file}:${index + 1}: PageShell must not be narrowed with page-specific width classes`);
    }
  });
}

const shellCoverage = shellUsers.length / pageFiles.length;
const headerCoverage = headerUsers.length / pageFiles.length;
const tabCoverage = tabbedPages.length ? sharedTabUsers.length / tabbedPages.length : 1;

if (shellCoverage < 0.9) {
  failures.push(`frontend/src/pages: only ${shellUsers.length}/${pageFiles.length} pages use shared shell/layout components`);
}
if (headerCoverage < 0.9) {
  failures.push(`frontend/src/pages: only ${headerUsers.length}/${pageFiles.length} pages use shared header components`);
}
if (tabCoverage < 0.9) {
  failures.push(`frontend/src/pages: only ${sharedTabUsers.length}/${tabbedPages.length} tabbed pages use shared tab components`);
}

const explicitShellHeaderPages = [
  "frontend/src/pages/DashboardPage.tsx",
  "frontend/src/pages/EmployeesPage.tsx",
  "frontend/src/pages/EmployeeProfilePage.tsx",
  "frontend/src/pages/PayrollDashboardPage.tsx",
  "frontend/src/pages/PayrollPeriodsPage.tsx",
  "frontend/src/pages/PayrollRunsPage.tsx",
  "frontend/src/pages/PayrollRunDetailPage.tsx",
  "frontend/src/pages/PayrollAdminPages.tsx",
  "frontend/src/pages/PayrollFoundationPages.tsx",
  "frontend/src/pages/PayrollPrompt11Pages.tsx",
  "frontend/src/pages/AttendanceRecordsPage.tsx",
  "frontend/src/pages/AttendanceCalendarPage.tsx",
  "frontend/src/pages/AttendanceCorrectionsPage.tsx",
  "frontend/src/pages/AttendanceDevicesPage.tsx",
  "frontend/src/pages/AttendanceDeviceOperationsPage.tsx",
  "frontend/src/pages/AttendanceReportsPage.tsx",
  "frontend/src/pages/AttendanceSettingsPage.tsx",
  "frontend/src/pages/LeaveRequestsPage.tsx",
  "frontend/src/pages/LeaveCalendarPage.tsx",
  "frontend/src/pages/LeaveSettingsPage.tsx",
  "frontend/src/pages/RosterWeeklyPage.tsx",
  "frontend/src/pages/RosterShiftTemplatesPage.tsx",
  "frontend/src/pages/RosterReportsPage.tsx",
  "frontend/src/pages/RosterSettingsPage.tsx",
  "frontend/src/pages/DocumentRegistryPage.tsx",
  "frontend/src/pages/DocumentSettingsPage.tsx",
  "frontend/src/pages/DocumentCompliancePage.tsx",
  "frontend/src/pages/MissingDocumentsPage.tsx",
  "frontend/src/pages/ContractsPage.tsx",
  "frontend/src/pages/ReportsPage.tsx",
  "frontend/src/pages/ApprovalsPage.tsx",
  "frontend/src/pages/LifecyclePage.tsx",
  "frontend/src/pages/SelfServicePage.tsx",
  "frontend/src/pages/SettingsPage.tsx",
  "frontend/src/pages/AdminSettingsPage.tsx",
  "frontend/src/pages/SelfServiceSettingsPage.tsx",
  "frontend/src/pages/OrganizationSettingsPage.tsx",
  "frontend/src/pages/EmployeeSettingsPage.tsx",
  "frontend/src/pages/DataTransferPage.tsx",
  "frontend/src/pages/KycRequestsPage.tsx",
  "frontend/src/pages/ImportMigrationPage.tsx"
];

explicitShellHeaderPages.forEach((file) => {
  requireFile(file);
  has(file, shellPattern, "explicit module page must use shared PageShell/PageLayout family");
  if (file === "frontend/src/pages/DashboardPage.tsx") {
    has(file, "<section className=\"CommandCenterHeader", "Dashboard must use the approved welcome-first Command Center header");
    has(file, "<CommandCenterWelcome name={welcome.name} title={welcome.title} />", "Dashboard Command Center header must render the welcome component first");
  } else {
    has(file, headerPattern, "explicit module page must use shared PageHeader family");
  }
});

[
  "frontend/src/pages/EmployeeProfilePage.tsx",
  "frontend/src/pages/UsersAccessPage.tsx",
  "frontend/src/pages/OrganizationSettingsPage.tsx",
  "frontend/src/pages/LeaveSettingsPage.tsx",
  "frontend/src/pages/DocumentSettingsPage.tsx",
  "frontend/src/pages/ContractsPage.tsx",
  "frontend/src/pages/ApprovalsPage.tsx",
  "frontend/src/pages/DocumentCompliancePage.tsx",
  "frontend/src/pages/LifecyclePage.tsx",
  "frontend/src/pages/AdminSettingsPage.tsx",
  "frontend/src/pages/DataTransferPage.tsx",
  "frontend/src/pages/EmployeeSettingsPage.tsx",
  "frontend/src/pages/ReportsPage.tsx"
].forEach((file) => {
  has(file, sharedTabsPattern, "explicit tabbed page must use shared tabs/subnavigation");
});

[
  "frontend/src/pages/EmployeesPage.tsx",
  "frontend/src/pages/PayrollAdminPages.tsx",
  "frontend/src/pages/PayrollRunsPage.tsx",
  "frontend/src/pages/ReportsPage.tsx",
  "frontend/src/pages/AssetUniformAdvancedPages.tsx",
  "frontend/src/pages/KycRequestsPage.tsx"
].forEach((file) => {
  has(file, /FilterBar|Panel className="p-3"|grid gap-2/, "list/report pages should use aligned filter/action layout");
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
hasNo("frontend/src/pages/ReportsPage.tsx", /actions=\{[\s\S]{0,240}setTab\(/, "Reports tabs must not be placed inside PageHeader actions");
hasNo("frontend/src/pages/DataTransferPage.tsx", /actions=\{[\s\S]{0,360}tabs\.map\(/, "Data transfer tabs must not be placed inside PageHeader actions");

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

console.log(`Page layout consistency verification passed. Shared shell ${shellUsers.length}/${pageFiles.length}; shared header ${headerUsers.length}/${pageFiles.length}; shared tabs ${sharedTabUsers.length}/${tabbedPages.length}.`);
