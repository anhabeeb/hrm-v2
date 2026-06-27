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

function pageHeaderBlocks(content) {
  const blocks = [];
  const starts = [...content.matchAll(/<PageHeader\b/g)].map((match) => match.index ?? 0);
  for (const start of starts) {
    const selfClose = content.indexOf("/>", start);
    const explicitClose = content.indexOf("</PageHeader>", start);
    const candidates = [selfClose, explicitClose].filter((index) => index >= 0);
    if (!candidates.length) continue;
    const end = Math.min(...candidates);
    blocks.push(content.slice(start, end + (end === explicitClose ? "</PageHeader>".length : 2)));
  }
  return blocks;
}

function between(content, startMarker, endMarker) {
  const start = content.indexOf(startMarker);
  if (start < 0) return "";
  const end = content.indexOf(endMarker, start);
  return content.slice(start, end < 0 ? undefined : end);
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
[
  "verify:navigation-tabs",
  "verify:nav-tabs",
  "verify:page-layout-consistency",
  "verify:prompt13",
  "verify:prompt23"
].forEach((scriptName) => {
  if (!pkg.scripts?.[scriptName]) failures.push(`package.json: missing ${scriptName}`);
});

const navigationTabs = "frontend/src/components/ui/navigation-tabs.tsx";
const pageShell = "frontend/src/components/ui/page-shell.tsx";
const navigationTabsContent = exists(navigationTabs) ? read(navigationTabs) : "";
const pageShellContent = exists(pageShell) ? read(pageShell) : "";
const triggerTokenBlock = between(navigationTabsContent, "triggerBase:", "triggerActive:");
const standardTabsBlock = between(pageShellContent, "export function StandardTabs", "export const AppTabs");

[
  navigationTabs,
  pageShell,
  "frontend/src/layouts/AppShell.tsx",
  "frontend/vite.config.ts",
  "worker/wrangler.toml",
  "worker/src/auth/password.ts"
].forEach(requireFile);

[
  "NAVIGATION_TAB_SIZE_TOKENS",
  "h-10",
  "min-h-10",
  "max-h-10",
  "w-[168px]",
  "min-w-[168px]",
  "max-w-[168px]",
  "shrink-0",
  "overflow-hidden",
  "truncate",
  "whitespace-nowrap",
  "px-3",
  "text-sm",
  "rounded-md",
  "border-primary/20 bg-primary text-primary-foreground shadow-sm",
  "text-muted-foreground hover:border-slate-200 hover:bg-slate-100 hover:text-slate-950",
  "overflow-x-auto",
  "w-max min-w-full",
  "getNavigationTabShellClass",
  "getNavigationTabListClass",
  "getNavigationTabItemClass",
  "getNavigationTabBadgeClass",
  "NavigationTabContent",
  "ModuleNavigationBar",
  "ModuleNavigationItem",
  "SubNavigationBar",
  "SubNavigationItem"
].forEach((marker) => has(navigationTabs, marker, `shared navigation token/component marker missing: ${marker}`));

[
  /triggerBase:\s*"[^"]*h-10[^"]*w-\[168px\][^"]*min-w-\[168px\][^"]*max-w-\[168px\][^"]*shrink-0[^"]*overflow-hidden[^"]*whitespace-nowrap/,
  /tabWidth:\s*"w-\[168px\] min-w-\[168px\] max-w-\[168px\]"/,
  /tabHeight:\s*"h-10 min-h-10 max-h-10"/,
  /listBase:\s*"flex w-max min-w-full items-center gap-2"/,
  /shell:\s*"[^"]*w-full max-w-none min-w-0 overflow-x-auto/
].forEach((marker) => has(navigationTabs, marker, "shared navigation tabs must use fixed-size scroll-safe tokens"));

hasNo(navigationTabs, /triggerBase:\s*"[^"]*(?:w-auto|min-w-\[8rem\]|min-w-\[7rem\]|w-full min-w-0|flex-none)/, "shared tab trigger must not use content/available-space sizing");
hasNo(navigationTabs, /trigger(?:Equal|Compact):\s*"[^"]*(?:w-\[|min-w-\[|max-w-\[|w-full|min-w-0|px-[0-9])/, "tab variants must not override the global fixed width/height");

[
  "getNavigationTabShellClass",
  "getNavigationTabListClass",
  "getNavigationTabItemClass",
  "getNavigationTabBadgeClass",
  "StandardTabs",
  "ResponsiveTabs",
  "variant = \"auto\"",
  "equalThreshold",
  "count",
  "badge",
  "disabled",
  "hidden",
  "getNavigationTabItemClass",
  "getNavigationTabListClass",
  "min-w-0 truncate",
  "title = item.title"
].forEach((marker) => has(pageShell, marker, `StandardTabs must use shared navigation token system: ${marker}`));

hasNo(pageShell, /className="h-[89]\s+whitespace-nowrap|className="[^"]*rounded-full[^"]*tab/i, "StandardTabs must not keep old one-off tab sizing");
if (/gridTemplateColumns|repeat\(\$\{visibleItems\.length\}|grid-cols-|w-full min-w-0/.test(standardTabsBlock)) {
  failures.push(`${pageShell}: StandardTabs must not size tabs from grid columns or available width`);
}
if (/className=\{cn\("h-8|className=\{cn\("h-9|w-auto|flex-none/.test(navigationTabsContent) || /rounded-full/.test(triggerTokenBlock)) {
  failures.push(`${navigationTabs}: Module/Sub navigation must not keep old one-off tab sizing`);
}

const moduleNavFiles = [
  ["frontend/src/components/attendance/AttendanceNav.tsx", "Attendance navigation"],
  ["frontend/src/components/roster/RosterNav.tsx", "Roster navigation"],
  ["frontend/src/components/payroll/PayrollNav.tsx", "Payroll navigation"],
  ["frontend/src/components/assets/AssetsNav.tsx", "Assets and uniforms navigation"]
];

moduleNavFiles.forEach(([file, label]) => {
  requireFile(file);
  has(file, "ModuleNavigationBar", `${label} must use ModuleNavigationBar`);
  has(file, "ModuleNavigationItem", `${label} must use ModuleNavigationItem`);
  has(file, label, `${label} accessible label missing`);
  hasNo(file, /h-[89]|rounded-full|border-b-2|flex\s+flex-wrap\s+gap-2/, `${label} must not use page-specific tab sizing`);
});

const standardTabbedPages = [
  "frontend/src/pages/EmployeeProfilePage.tsx",
  "frontend/src/pages/UsersAccessPage.tsx",
  "frontend/src/pages/OrganizationSettingsPage.tsx",
  "frontend/src/pages/LeaveSettingsPage.tsx",
  "frontend/src/pages/DocumentSettingsPage.tsx",
  "frontend/src/pages/ContractsPage.tsx",
  "frontend/src/pages/AdminSettingsPage.tsx",
  "frontend/src/pages/DataTransferPage.tsx",
  "frontend/src/pages/EmployeeSettingsPage.tsx",
  "frontend/src/pages/ReportsPage.tsx"
];

standardTabbedPages.forEach((file) => {
  requireFile(file);
  has(file, /StandardTabs|ResponsiveTabs/, "tabbed page must use shared StandardTabs/ResponsiveTabs");
});

const subNavigationPages = [
  "frontend/src/pages/ApprovalsPage.tsx",
  "frontend/src/pages/DocumentCompliancePage.tsx",
  "frontend/src/pages/FinalSettlementPage.tsx",
  "frontend/src/pages/LifecyclePage.tsx"
];

subNavigationPages.forEach((file) => {
  requireFile(file);
  has(file, "SubNavigationBar", "sub-navigation page must use shared SubNavigationBar");
  has(file, "SubNavigationItem", "sub-navigation page must use shared SubNavigationItem");
});

has("frontend/src/pages/ContractsPage.tsx", "StandardTabs", "Contracts page must use shared fixed-size tabs");
has("frontend/src/pages/ContractsPage.tsx", "Contract section tabs", "Contracts page tab aria label missing");
has("frontend/src/pages/ContractsPage.tsx", "Probation due", "Contracts page expected tab marker missing");
hasNo("frontend/src/pages/ContractsPage.tsx", /role="tab"|TabsList|TabsTrigger|w-auto|flex-none|border-b-2|rounded-full/, "Contracts page must not define content-sized custom tabs");

has("frontend/src/pages/LifecyclePage.tsx", "SubNavigationBar", "Onboarding/Offboarding page must use shared fixed-size sub navigation");
has("frontend/src/pages/LifecyclePage.tsx", "SubNavigationItem", "Onboarding/Offboarding tab items must use shared fixed-size sub navigation");
has("frontend/src/pages/LifecyclePage.tsx", "Onboarding Dashboard", "Onboarding dashboard tab marker missing");
has("frontend/src/pages/LifecyclePage.tsx", "Lifecycle Reports", "Lifecycle reports tab marker missing");
hasNo("frontend/src/pages/LifecyclePage.tsx", /role="tab"|TabsList|TabsTrigger|w-auto|flex-none|border-b-2|rounded-full/, "Onboarding/Offboarding page must not define content-sized custom tabs");

const tabIntentPattern = /\b(?:activeTab|setActiveTab|setTab\(|activeSection|setActiveSection|role="tablist"|TabsList|TabsTrigger|data-state)\b|tab\s*===/;
const tabbedPages = collectFiles("frontend/src/pages").filter((file) => tabIntentPattern.test(read(file)));
tabbedPages.forEach((file) => {
  const content = read(file);
  if (!/(StandardTabs|ResponsiveTabs|SubNavigationBar|ModuleNavigationBar)/.test(content)) {
    failures.push(`${file}: tab-intent page must use the shared tab/navigation component family`);
  }
  hasNo(file, /TabsList|TabsTrigger|data-state=/, "one-off shadcn tab primitives with page-specific sizing are not allowed");
  hasNo(file, /role="tab"[^>]*className=|<Button[^>]*role="tab"|<button[^>]*role="tab"/, "page-level custom tab buttons are not allowed");
  hasNo(file, /border-b-2[\s\S]{0,160}(?:activeTab|setActiveTab|setTab\(|tab\s*===)/, "underlined one-off tab style is not allowed");
  hasNo(file, /rounded-full[\s\S]{0,160}(?:activeTab|setActiveTab|setTab\(|tab\s*===)/, "pill one-off tab style is not allowed");
});

[
  "frontend/src/pages/AttendanceRecordsPage.tsx",
  "frontend/src/pages/AttendanceCalendarPage.tsx",
  "frontend/src/pages/AttendanceCorrectionsPage.tsx",
  "frontend/src/pages/AttendanceDevicesPage.tsx",
  "frontend/src/pages/AttendanceDeviceOperationsPage.tsx",
  "frontend/src/pages/AttendanceReportsPage.tsx",
  "frontend/src/pages/AttendanceSettingsPage.tsx",
  "frontend/src/pages/RosterWeeklyPage.tsx",
  "frontend/src/pages/RosterShiftTemplatesPage.tsx",
  "frontend/src/pages/RosterReportsPage.tsx",
  "frontend/src/pages/RosterSettingsPage.tsx",
  "frontend/src/pages/PayrollDashboardPage.tsx",
  "frontend/src/pages/PayrollPeriodsPage.tsx",
  "frontend/src/pages/PayrollRunsPage.tsx",
  "frontend/src/pages/PayrollRunDetailPage.tsx",
  "frontend/src/pages/PayrollAdminPages.tsx",
  "frontend/src/pages/PayrollFoundationPages.tsx",
  "frontend/src/pages/PayrollPrompt11Pages.tsx",
  "frontend/src/pages/FinalSettlementPage.tsx"
].forEach((file) => {
  requireFile(file);
  if (!exists(file)) return;
  pageHeaderBlocks(read(file)).forEach((block) => {
    if (/<\s*(AttendanceNav|RosterNav|PayrollNav)\b/.test(block)) {
      failures.push(`${file}: module navigation must stay outside PageHeader actions`);
    }
  });
});

has("frontend/src/pages/EmployeeProfilePage.tsx", "ResponsiveTabs", "Employee 360/Contacts must use the shared tab standard");
has("frontend/src/pages/SelfServicePage.tsx", "PageShell", "Self-service page must preserve shared shell alignment");
hasNo("frontend/src/pages/SelfServicePage.tsx", /TabsList|TabsTrigger|role="tab"[^>]*className=|border-b-2[\s\S]{0,160}setTab/, "Self-service must not introduce one-off tab styling");

has("frontend/src/layouts/AppShell.tsx", "box-border w-full max-w-none min-w-0", "dashboard/page full-width routed content fix must be preserved");
hasNo("frontend/src/layouts/AppShell.tsx", /mx-auto\s+w-full\s+max-w|max-w-\[(?:1480|1680)px\]|max-w-screen-xl|container\s+mx-auto/, "app shell must not reintroduce centered page width");
has(pageShell, /PageShell[\s\S]*box-border w-full max-w-none min-w-0/, "PageShell must remain full-width");
hasNo(pageShell, /max-w-\[1480px\]|mx-auto w-full max-w|max-w-3xl/, "PageShell/PageHeader must not independently narrow page width");

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
  console.error("Navigation tab consistency verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Navigation tab consistency verification passed. Tabbed pages checked: ${tabbedPages.length}.`);
