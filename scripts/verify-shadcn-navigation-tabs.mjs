import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function filePath(relativePath) {
  return path.join(root, relativePath);
}

function exists(relativePath) {
  return fs.existsSync(filePath(relativePath));
}

function read(relativePath) {
  return fs.readFileSync(filePath(relativePath), "utf8");
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

const pkg = JSON.parse(read("package.json"));
if (!pkg.scripts?.["verify:shadcn-navigation-tabs"]) failures.push("package.json: missing verify:shadcn-navigation-tabs");

[
  "frontend/src/components/ui/tabs.tsx",
  "frontend/src/components/ui/navigation-tabs.tsx",
  "frontend/src/components/ui/page-shell.tsx",
  "frontend/package.json",
  "frontend/vite.config.ts",
  "worker/wrangler.toml",
  "worker/src/auth/password.ts"
].forEach(requireFile);

has("frontend/package.json", '"@radix-ui/react-tabs"', "frontend must depend on Radix Tabs for shadcn/ui Tabs");
has("frontend/src/components/ui/tabs.tsx", '@radix-ui/react-tabs', "shadcn tabs primitive must use Radix Tabs");
[
  "const Tabs = TabsPrimitive.Root",
  "TabsList",
  "TabsTrigger",
  "TabsContent",
  "React.forwardRef"
].forEach((marker) => has("frontend/src/components/ui/tabs.tsx", marker, `tabs primitive marker missing: ${marker}`));

[
  'from "./tabs"',
  "Tabs, TabsList, TabsTrigger",
  "TabsList aria-label={label}",
  "TabsTrigger value={resolvedValue}",
  "asChild",
  "Link to={to}",
  "NavigationTabContent",
  "w-[168px]",
  "min-w-[168px]",
  "max-w-[168px]",
  "h-10",
  "min-h-10",
  "max-h-10",
  "truncate",
  "overflow-x-auto"
].forEach((marker) => has("frontend/src/components/ui/navigation-tabs.tsx", marker, `shadcn route tab wrapper marker missing: ${marker}`));

[
  'from "./tabs"',
  "TabsShell",
  "TabsList aria-label={label}",
  "TabsTrigger",
  "value={active}",
  "onValueChange",
  "getNavigationTabItemClass",
  "min-w-0 truncate"
].forEach((marker) => has("frontend/src/components/ui/page-shell.tsx", marker, `StandardTabs shadcn marker missing: ${marker}`));

hasNo("frontend/src/components/ui/page-shell.tsx", /<Button[\s\S]{0,240}role="tab"|role="tablist"|aria-selected/, "StandardTabs must not use custom button-based tab roles");
hasNo("frontend/src/components/ui/navigation-tabs.tsx", /<Button[\s\S]{0,240}aria-current|<nav[\s\S]{0,120}aria-label=\{label\}/, "ModuleNavigationBar/SubNavigationBar must use shadcn Tabs primitives");

const moduleNavFiles = [
  "frontend/src/components/attendance/AttendanceNav.tsx",
  "frontend/src/components/roster/RosterNav.tsx",
  "frontend/src/components/payroll/PayrollNav.tsx",
  "frontend/src/components/assets/AssetsNav.tsx"
];

moduleNavFiles.forEach((file) => {
  requireFile(file);
  has(file, "ModuleNavigationBar", "module route tabs must use the shadcn-backed ModuleNavigationBar");
  has(file, "ModuleNavigationItem", "module route tabs must use the shadcn-backed ModuleNavigationItem");
  hasNo(file, /<Button[\s\S]{0,200}(?:active|tab)|role="tab"|TabsTrigger|border-b-2|rounded-full/, "module nav files must not define custom tab visuals");
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
  has(file, /StandardTabs|ResponsiveTabs/, "major tabbed page must use the shared shadcn-based StandardTabs/ResponsiveTabs");
  hasNo(file, /<Button[^>]*role="tab"|<button[^>]*role="tab"|TabsList|TabsTrigger|border-b-2|rounded-full/, "major tabbed page must not define one-off tab primitives");
});

const subNavigationPages = [
  "frontend/src/pages/ApprovalsPage.tsx",
  "frontend/src/pages/DocumentCompliancePage.tsx",
  "frontend/src/pages/FinalSettlementPage.tsx",
  "frontend/src/pages/LifecyclePage.tsx"
];

subNavigationPages.forEach((file) => {
  requireFile(file);
  has(file, "SubNavigationBar", "sub navigation page must use shadcn-backed SubNavigationBar");
  has(file, "SubNavigationItem", "sub navigation page must use shadcn-backed SubNavigationItem");
  hasNo(file, /<Button[^>]*role="tab"|<button[^>]*role="tab"|TabsList|TabsTrigger|border-b-2|rounded-full/, "sub navigation page must not define one-off tab primitives");
});

has("frontend/src/pages/ContractsPage.tsx", "StandardTabs", "Contracts page must use shadcn-based shared tabs");
has("frontend/src/pages/ContractsPage.tsx", "Probation due", "Contracts page expected tab marker missing");
has("frontend/src/pages/LifecyclePage.tsx", "SubNavigationBar", "Onboarding/Offboarding page must use shadcn-based shared route tabs");
has("frontend/src/pages/LifecyclePage.tsx", "Onboarding Dashboard", "Onboarding Dashboard tab marker missing");
has("frontend/src/pages/EmployeeProfilePage.tsx", "ResponsiveTabs", "Employee Contact/360 tabs must use shared shadcn-based tabs");
has("frontend/src/pages/SelfServicePage.tsx", "PageShell", "Self-service page must preserve shared shell alignment");
hasNo("frontend/src/pages/SelfServicePage.tsx", /role="tab"|TabsList|TabsTrigger|border-b-2|rounded-full/, "Self-service must not define one-off tab visuals");

const frontendFiles = collectFiles("frontend/src");
frontendFiles.forEach((file) => {
  if (file.includes("components/ui/tabs.tsx") || file.includes("components/ui/navigation-tabs.tsx") || file.includes("components/ui/page-shell.tsx")) return;
  hasNo(file, /<TabsList|<TabsTrigger|role="tablist"|role="tab"[^>]*className=|<Button[^>]*role="tab"|<button[^>]*role="tab"|border-b-2[\s\S]{0,160}(?:activeTab|setActiveTab|setTab\(|tab\s*===)|rounded-full[\s\S]{0,160}(?:activeTab|setActiveTab|setTab\(|tab\s*===)/, "real tabbed pages must not bypass shared shadcn tab wrappers");
  hasNo(file, /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/, "browser alert/confirm/prompt usage is not allowed");
  hasNo(file, /\bdark:|darkMode\b/, "dark mode marker is not allowed");
});

has("frontend/src/layouts/AppShell.tsx", "box-border w-full max-w-none min-w-0", "page full-width app shell fix must be preserved");
hasNo("frontend/src/layouts/AppShell.tsx", /mx-auto\s+w-full\s+max-w|max-w-\[(?:1480|1680)px\]|max-w-screen-xl|container\s+mx-auto/, "app shell must not reintroduce centered page width");
has("frontend/src/components/ui/page-shell.tsx", /PageShell[\s\S]*box-border w-full max-w-none min-w-0/, "PageShell must remain full-width");
has("frontend/vite.config.ts", "manualChunks", "Prompt 13 chunk optimization missing");
has("worker/wrangler.toml", 'database_name = "hrm-v2"', "D1 database name changed");
has("worker/wrangler.toml", 'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"', "D1 database id changed");
has("worker/wrangler.toml", 'bucket_name = "hrm-v2-documents"', "R2 bucket changed");
has("worker/src/auth/password.ts", "const ITERATIONS = 100000", "PBKDF2 iterations must remain 100000");

if (failures.length) {
  console.error("shadcn navigation tab verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("shadcn navigation tab verification passed.");
