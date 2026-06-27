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
  "verify:shadcn-navigation-tabs",
  "verify:nav-tabs",
  "verify:page-layout-consistency",
  "verify:prompt13",
  "verify:prompt23"
].forEach((scriptName) => {
  if (!pkg.scripts?.[scriptName]) failures.push(`package.json: missing ${scriptName}`);
});

const navigationTabs = "frontend/src/components/ui/navigation-tabs.tsx";
const pageShell = "frontend/src/components/ui/page-shell.tsx";

[
  navigationTabs,
  "frontend/src/components/ui/tabs.tsx",
  pageShell,
  "frontend/src/layouts/AppShell.tsx",
  "frontend/vite.config.ts",
  "worker/wrangler.toml",
  "worker/src/auth/password.ts"
].forEach(requireFile);

[
  "NAVIGATION_TAB_SIZE_TOKENS",
  'from "./tabs"',
  "TabsList",
  "TabsTrigger",
  "h-10",
  "min-h-10",
  "max-h-10",
  "min-w-fit",
  "max-w-none",
  "shrink-0",
  "overflow-hidden",
  "whitespace-nowrap",
  "justify-center",
  "text-center",
  "px-4",
  "rounded-md",
  "overflow-x-auto",
  "w-max min-w-full",
  "ModuleNavigationBar",
  "ModuleNavigationItem",
  "SubNavigationBar",
  "SubNavigationItem"
].forEach((marker) => has(navigationTabs, marker, `shared navigation content-width marker missing: ${marker}`));

[
  "w-[168px]",
  "min-w-[168px]",
  "max-w-[168px]"
].forEach((marker) => hasNo(navigationTabs, marker, `fixed-width tab token remains: ${marker}`));

[
  'from "./tabs"',
  "TabsShell",
  "TabsList aria-label={label}",
  "TabsTrigger",
  "value={active}",
  "onValueChange",
  "getNavigationTabItemClass",
  "getNavigationTabListClass",
  "whitespace-nowrap text-center",
  "variant === \"auto\" ? \"scrollable\""
].forEach((marker) => has(pageShell, marker, `StandardTabs content-width marker missing: ${marker}`));

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
  hasNo(file, /h-[89]|rounded-full|border-b-2|flex\s+flex-wrap\s+gap-2|label:\s*"Settings"|\/settings"/, `${label} must not use old/custom tab sizing or expose Settings`);
});

[
  "frontend/src/pages/ApprovalsPage.tsx",
  "frontend/src/pages/DocumentCompliancePage.tsx",
  "frontend/src/pages/FinalSettlementPage.tsx",
  "frontend/src/pages/LifecyclePage.tsx"
].forEach((file) => {
  requireFile(file);
  has(file, "SubNavigationBar", "sub-navigation page must use shared SubNavigationBar");
  has(file, "SubNavigationItem", "sub-navigation page must use shared SubNavigationItem");
  hasNo(file, /role="tab"|TabsList|TabsTrigger|w-\[168px\]|min-w-\[168px\]|max-w-\[168px\]|border-b-2|rounded-full/, "sub navigation page must not define one-off or fixed-width tab styling");
  hasNo(file, /label:\s*"Settings"|key:\s*"settings"|Onboarding Settings|Offboarding Settings|>\s*Settings\s*<\/SubNavigationItem>/, "settings tab must not be present");
});

[
  "frontend/src/pages/ContractsPage.tsx",
  "frontend/src/pages/EmployeeProfilePage.tsx",
  "frontend/src/pages/UsersAccessPage.tsx",
  "frontend/src/pages/OrganizationSettingsPage.tsx",
  "frontend/src/pages/LeaveSettingsPage.tsx",
  "frontend/src/pages/DocumentSettingsPage.tsx",
  "frontend/src/pages/AdminSettingsPage.tsx",
  "frontend/src/pages/DataTransferPage.tsx",
  "frontend/src/pages/EmployeeSettingsPage.tsx",
  "frontend/src/pages/ReportsPage.tsx"
].forEach((file) => {
  requireFile(file);
  has(file, /StandardTabs|ResponsiveTabs/, "tabbed page must use shared StandardTabs/ResponsiveTabs");
});

has("frontend/src/components/ui/page-shell.tsx", "MODULE_SETTINGS_LINKS", "central header Settings link mapping missing");
has("frontend/src/layouts/AppShell.tsx", "box-border w-full max-w-none min-w-0", "dashboard/page full-width routed content fix must be preserved");
has(pageShell, /PageShell[\s\S]*box-border w-full max-w-none min-w-0/, "PageShell must remain full-width");
hasNo(pageShell, /max-w-\[1480px\]|mx-auto w-full max-w|max-w-3xl/, "PageShell/PageHeader must not independently narrow page width");

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
  console.error("Navigation tab consistency verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Navigation tab consistency verification passed.");
