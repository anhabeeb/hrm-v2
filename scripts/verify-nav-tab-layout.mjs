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
if (!pkg.scripts?.["verify:ui-standardization"]) failures.push("package.json: missing verify:ui-standardization");
if (!pkg.scripts?.["verify:prompt23"]) failures.push("package.json: missing verify:prompt23");
if (!pkg.scripts?.["verify:nav-tabs"]) failures.push("package.json: missing verify:nav-tabs");

const navigationTabs = "frontend/src/components/ui/navigation-tabs.tsx";
requireFile(navigationTabs);
[
  "ModuleNavigationBar",
  "ModuleNavigationItem",
  "SubNavigationBar",
  "SubNavigationItem",
  "overflow-x-auto",
  "whitespace-nowrap",
  "aria-current"
].forEach((marker) => has(navigationTabs, marker, `navigation tab marker missing: ${marker}`));

[
  ["frontend/src/components/attendance/AttendanceNav.tsx", "Attendance navigation"],
  ["frontend/src/components/roster/RosterNav.tsx", "Roster navigation"],
  ["frontend/src/components/payroll/PayrollNav.tsx", "Payroll navigation"]
].forEach(([file, label]) => {
  requireFile(file);
  has(file, "ModuleNavigationBar", "module nav must use ModuleNavigationBar");
  has(file, "ModuleNavigationItem", "module nav must use ModuleNavigationItem");
  has(file, label, `accessible label missing: ${label}`);
  hasNo(file, /flex\s+flex-wrap\s+gap-2/, "module nav must not render as flex-wrapped action buttons");
});

const navPages = [
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
];

const navInActionsPattern = /actions=\{<\s*(AttendanceNav|RosterNav|PayrollNav)\b|actions=\{[\s\S]{0,240}<\s*(AttendanceNav|RosterNav|PayrollNav)\b/;
const navInActionRowPattern = /className=["'][^"']*flex[^"']*flex-wrap[^"']*gap-2[^"']*["'][^>]*>\s*<\s*(AttendanceNav|RosterNav|PayrollNav)\b/;
const rawVisibleControlPattern = /<(select|input|button|textarea|table)\b/;
const browserPromptPattern = /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/;

navPages.forEach((file) => {
  requireFile(file);
  hasNo(file, navInActionsPattern, "module nav must not be passed through PageHeader actions");
  hasNo(file, navInActionRowPattern, "module nav must not be mixed into Add/Create/Export/Help action rows");
  hasNo(file, browserPromptPattern, "browser alert/confirm/prompt usage is not allowed");
  if (!file.includes("components/ui/")) hasNo(file, rawVisibleControlPattern, "raw visible controls are not allowed in active pages");
});

has("frontend/src/pages/FinalSettlementPage.tsx", "SubNavigationBar", "Exit Payroll sub-tabs must use SubNavigationBar");
has("frontend/src/pages/FinalSettlementPage.tsx", "Exit payroll section tabs", "Exit Payroll sub-tab aria label missing");

const statusBadge = "frontend/src/components/ui/status-badge.tsx";
[
  "humanizeStatus",
  "BANK_TO_COLLECT_DIRECTLY_FROM_EMPLOYEE",
  "SKIPPED_MINIMUM_NET_PROTECTION",
  "READY_FOR_REVIEW",
  "FINALIZED_PLACEHOLDER",
  "Submitted",
  "Bank direct collection",
  "Skipped: min net"
].forEach((marker) => has(statusBadge, marker, `status display helper marker missing: ${marker}`));

[
  "frontend/src/pages/PayrollDashboardPage.tsx",
  "frontend/src/pages/PayrollPeriodsPage.tsx",
  "frontend/src/pages/PayrollRunsPage.tsx",
  "frontend/src/pages/PayrollRunDetailPage.tsx",
  "frontend/src/pages/PayrollAdminPages.tsx",
  "frontend/src/pages/PayrollFoundationPages.tsx",
  "frontend/src/pages/PayrollPrompt11Pages.tsx",
  "frontend/src/pages/FinalSettlementPage.tsx"
].forEach((file) => {
  hasNo(file, /<Badge[^>]*>\{[^}]*status/i, "payroll status badges should use StatusBadge/humanizeStatus");
});

has("worker/wrangler.toml", 'database_name = "hrm-v2"', "D1 database name changed");
has("worker/wrangler.toml", 'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"', "D1 database id changed");
has("worker/wrangler.toml", 'bucket_name = "hrm-v2-documents"', "R2 bucket changed");
has("worker/src/auth/password.ts", "const ITERATIONS = 100000", "PBKDF2 iterations must remain 100000");
has("frontend/vite.config.ts", "manualChunks", "Prompt 13 chunk optimization missing");

function collectSourceFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...collectSourceFiles(rel));
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) files.push(rel.replace(/\\/g, "/"));
  }
  return files;
}

collectSourceFiles("frontend/src").forEach((file) => {
  hasNo(file, /\bdark:|darkMode\b/, "dark mode marker is not allowed");
});

if (failures.length) {
  console.error("Navigation tab layout verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Navigation tab layout verification passed.");
