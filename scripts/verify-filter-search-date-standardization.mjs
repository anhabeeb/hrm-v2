import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function contains(file, needle, label = needle) {
  const source = read(file);
  assert(source.includes(needle), `${file} is missing ${label}.`);
}

function forbid(file, pattern, message) {
  const source = read(file);
  assert(!pattern.test(source), message);
}

function listTsxFiles(dir) {
  const absoluteDir = path.join(root, dir);
  return fs.readdirSync(absoluteDir, { recursive: true })
    .filter((entry) => String(entry).endsWith(".tsx"))
    .map((entry) => path.join(dir, String(entry)).replaceAll("\\", "/"));
}

const filterFile = "frontend/src/components/filters/index.tsx";
const filterSource = read(filterFile);

[
  "StandardFilterBar",
  "StandardSearchInput",
  "StandardSelectFilter",
  "StandardDateRangeFilter",
  "MoreFiltersSheet",
  "AdvancedFiltersSheet",
  "ActiveFilterChips",
  "FilterResetButton",
  "SaveFilterViewButton",
  "FilterToolbarActions",
  "dateRangePresets",
  "useCascadingOrganizationFilters"
].forEach((marker) => contains(filterFile, marker));

[
  "Today",
  "Yesterday",
  "This Week",
  "Last Week",
  "This Month",
  "Last Month",
  "This Quarter",
  "This Year",
  "Last 7 Days",
  "Last 30 Days",
  "Custom Range"
].forEach((preset) => contains(filterFile, preset, `date preset ${preset}`));

assert(exists("frontend/src/components/ui/sheet.tsx"), "Real shared Sheet component is missing.");
contains("frontend/src/components/ui/sheet.tsx", "@radix-ui/react-dialog", "Radix Dialog-backed Sheet implementation");
contains("frontend/src/components/ui/sheet.tsx", "SheetContent", "SheetContent export");
contains("frontend/src/components/ui/sheet.tsx", "SheetTrigger", "SheetTrigger export");
contains("frontend/src/components/ui/sheet.tsx", "SheetClose", "SheetClose export");
contains("frontend/package.json", "@radix-ui/react-dialog", "Sheet dependency");

contains(filterFile, "data-standard-filter-bar", "compact filter bar marker");
contains(filterFile, "data-filter-search-first", "search-first marker");
contains(filterFile, "window.setTimeout", "300ms debounce implementation");
contains(filterFile, "data-active-filter-chips", "active filter chip marker");
contains(filterFile, "Reset Filters", "advanced sheet reset footer");
contains(filterFile, "Apply Filters", "advanced sheet apply footer");
contains(filterFile, "FilterSection", "grouped advanced filter sections");
contains(filterFile, "SheetContent", "MoreFiltersSheet real Sheet content");
contains(filterFile, "SheetTrigger", "MoreFiltersSheet real Sheet trigger");
contains(filterFile, "SheetFooter", "MoreFiltersSheet real Sheet footer");
contains(filterFile, "SheetClose", "MoreFiltersSheet close action");
assert(!filterSource.includes("data-shadcn-sheet"), "MoreFiltersSheet must not use fake sheet marker attributes.");
assert(!filterSource.includes("data-shadcn-sheet-trigger"), "MoreFiltersSheet must not use fake sheet trigger markers.");

contains(filterFile, "data-standard-calendar-grid", "calendar grid date range picker");
contains(filterFile, "data-calendar-range-day", "calendar day range buttons");
contains(filterFile, "data-calendar-range-presets", "calendar preset rail");
contains(filterFile, "ChevronLeft", "calendar previous month control");
contains(filterFile, "ChevronRight", "calendar next month control");
forbid(filterFile, /\btype=["']date["']/, "StandardDateRangeFilter must not use native date inputs.");
forbid(filterFile, /Start date.*End date/s, "StandardDateRangeFilter should not be a start/end native date-input layout.");

contains(filterFile, "min-w-[260px]", "standard date range width");
contains(filterFile, "min-w-[220px]", "standard department width");
contains(filterFile, "departmentId", "department cascade input");
contains(filterFile, "jobLevelId", "job level cascade input");
contains(filterFile, "filteredPositions", "position cascade output");

const migratedPages = [
  "frontend/src/pages/EmployeesPage.tsx",
  "frontend/src/pages/AttendanceRecordsPage.tsx",
  "frontend/src/pages/AttendanceReportsPage.tsx",
  "frontend/src/pages/AttendanceCorrectionsPage.tsx",
  "frontend/src/pages/AttendanceCalendarPage.tsx",
  "frontend/src/pages/AttendanceDeviceOperationsPage.tsx",
  "frontend/src/pages/LeaveRequestsPage.tsx",
  "frontend/src/pages/LeaveCalendarPage.tsx",
  "frontend/src/pages/PayrollRunsPage.tsx",
  "frontend/src/pages/PayrollAdminPages.tsx",
  "frontend/src/pages/DocumentRegistryPage.tsx",
  "frontend/src/pages/ContractsPage.tsx",
  "frontend/src/pages/ApprovalsPage.tsx",
  "frontend/src/pages/AuditLogPage.tsx",
  "frontend/src/pages/ReportsPage.tsx",
  "frontend/src/pages/NotificationCenterPage.tsx",
  "frontend/src/pages/UsersAccessPage.tsx",
  "frontend/src/pages/KycRequestsPage.tsx",
  "frontend/src/pages/AssetAssignmentsPage.tsx",
  "frontend/src/pages/AssetsReportsPage.tsx",
  "frontend/src/pages/AssetUniformAdvancedPages.tsx",
  "frontend/src/pages/RosterReportsPage.tsx",
  "frontend/src/pages/RosterWeeklyPage.tsx"
];

for (const page of migratedPages) {
  const source = read(page);
  assert(source.includes("StandardFilterBar"), `${page} must use StandardFilterBar.`);
  assert(source.includes("StandardSearchInput"), `${page} must use StandardSearchInput.`);
  assert(source.includes("FilterResetButton"), `${page} must expose Reset.`);
  assert(source.includes("MoreFiltersSheet"), `${page} must route advanced filters through MoreFiltersSheet.`);
  assert(!/import\s*\{[^}]*\bFilterBar\b[^}]*\}\s*from\s*["'][^"']*page-shell["']/.test(source), `${page} must not import legacy FilterBar.`);
  assert(!/function\s+FilterBar\s*\(/.test(source), `${page} must not define a legacy local FilterBar.`);
}

[
  "frontend/src/pages/EmployeesPage.tsx",
  "frontend/src/pages/AttendanceRecordsPage.tsx",
  "frontend/src/pages/AttendanceReportsPage.tsx",
  "frontend/src/pages/AttendanceCorrectionsPage.tsx",
  "frontend/src/pages/AttendanceCalendarPage.tsx",
  "frontend/src/pages/LeaveRequestsPage.tsx",
  "frontend/src/pages/LeaveCalendarPage.tsx",
  "frontend/src/pages/PayrollAdminPages.tsx",
  "frontend/src/pages/DocumentRegistryPage.tsx",
  "frontend/src/pages/AuditLogPage.tsx",
  "frontend/src/pages/ReportsPage.tsx",
  "frontend/src/pages/NotificationCenterPage.tsx",
  "frontend/src/pages/KycRequestsPage.tsx",
  "frontend/src/pages/AssetAssignmentsPage.tsx",
  "frontend/src/pages/AssetsReportsPage.tsx",
  "frontend/src/pages/RosterReportsPage.tsx",
  "frontend/src/pages/RosterWeeklyPage.tsx"
].forEach((page) => contains(page, "StandardDateRangeFilter", "standard calendar date range filter"));

[
  "frontend/src/pages/EmployeesPage.tsx",
  "frontend/src/pages/AttendanceRecordsPage.tsx",
  "frontend/src/pages/LeaveRequestsPage.tsx",
  "frontend/src/pages/DocumentRegistryPage.tsx",
  "frontend/src/pages/AuditLogPage.tsx",
  "frontend/src/pages/ReportsPage.tsx"
].forEach((page) => contains(page, "ActiveFilterChips", "active filter chips"));

[
  "frontend/src/pages/EmployeesPage.tsx",
  "frontend/src/pages/AttendanceRecordsPage.tsx",
  "frontend/src/pages/AttendanceReportsPage.tsx",
  "frontend/src/pages/AttendanceCorrectionsPage.tsx",
  "frontend/src/pages/AttendanceCalendarPage.tsx",
  "frontend/src/pages/RosterReportsPage.tsx",
  "frontend/src/pages/RosterWeeklyPage.tsx",
  "frontend/src/pages/ReportsPage.tsx",
  "frontend/src/pages/AssetAssignmentsPage.tsx",
  "frontend/src/pages/AssetsReportsPage.tsx"
].forEach((page) => contains(page, "OrganizationCascadeSelector", "real cascading organization filters"));

const allPageSource = listTsxFiles("frontend/src/pages").map((file) => `${file}\n${read(file)}`).join("\n\n");
assert(!/StandardDateRangeFilter[\s\S]{0,180}\bdisabled\b/.test(allPageSource), "Disabled placeholder StandardDateRangeFilter detected.");
assert(!/onChange=\{\(\)\s*=>\s*undefined\}[\s\S]{0,180}Date Range/.test(allPageSource), "Non-functional placeholder date range filter detected.");
assert(!/Created-date filtering is available|Expiry range filters are displayed/.test(allPageSource), "Disabled placeholder filter helper text detected.");

const changedUiSources = [filterFile, "frontend/src/components/ui/sheet.tsx", ...migratedPages].map((file) => [file, read(file)]);
for (const [file, source] of changedUiSources) {
  assert(!/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(source), `${file} must not use browser alert/confirm/prompt.`);
  assert(!/dark:/.test(source), `${file} must not introduce dark mode classes.`);
}

const wranglerToml = read("worker/wrangler.toml");
assert(wranglerToml.includes('database_name = "hrm-v2"'), "D1 database_name changed.");
assert(wranglerToml.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'), "D1 database_id changed.");
assert(wranglerToml.includes('bucket_name = "hrm-v2-documents"'), "R2 bucket changed.");

const workerSources = fs.readdirSync(path.join(root, "worker/src"), { recursive: true })
  .filter((entry) => String(entry).endsWith(".ts"))
  .map((entry) => read(path.join("worker/src", String(entry)).replaceAll("\\", "/")))
  .join("\n");
assert(workerSources.includes("100000"), "PBKDF2 100000 marker missing.");
assert(!workerSources.includes("PBKDF2_ITERATIONS = 210000"), "PBKDF2 iteration regression detected.");

contains("scripts/verify-command-center-dashboard.mjs", "single-open", "Command Center single-open verifier marker");
contains("scripts/verify-command-center-dashboard.mjs", "priority", "priority KPI verifier marker");

console.log("Filter/search/date standardization verifier passed.");
