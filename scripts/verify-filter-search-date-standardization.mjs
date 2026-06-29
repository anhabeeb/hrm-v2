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
contains(filterFile, "data-filter-left-group", "left filter group marker");
contains(filterFile, "data-filter-left-filters", "left filter slot marker");
contains(filterFile, "data-filter-search-first", "search-first marker");
contains(filterFile, "data-filter-right-actions", "right action group marker");
contains(filterFile, "data-left-filters", "leftFilters-compatible slot marker");
contains(filterFile, "data-right-actions", "rightActions-compatible slot marker");
contains(filterFile, "data-filter-action-slot", "right-side action slot marker");
contains(filterFile, "lg:ml-auto", "right action desktop auto alignment");
contains(filterFile, "partitionFilterChildren", "StandardFilterBar child slot partitioning");
contains(filterFile, "isFilterActionElement", "StandardFilterBar action child detection");
contains(filterFile, "slottedRightActions", "StandardFilterBar slotted right actions");
assert(/data-filter-left-group[\s\S]*data-filter-search-first[\s\S]*leftFilters\.map/.test(filterSource), "StandardFilterBar must keep search and primary filters in the left group.");
assert(/data-filter-right-actions[\s\S]*rightActions\.map/.test(filterSource), "StandardFilterBar must render More Filters, Reset, Save View, and actions in the right action group.");
assert(/child\.type === MoreFiltersSheet[\s\S]*child\.type === FilterResetButton[\s\S]*child\.type === SaveFilterViewButton/.test(filterSource), "More Filters, Reset, and Save View children must be moved to the right action slot.");
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

contains(filterFile, "lg:w-[420px]", "long desktop search width");
contains(filterFile, "xl:max-w-[480px]", "large desktop search max width");
contains(filterFile, "sm:w-[340px]", "tablet search width");
contains(filterFile, "className=\"h-10 pr-9 pl-9\"", "compact search height");
forbid(filterFile, /sm:w-\[300px\]/, "StandardSearchInput must not regress to the old short desktop width.");
forbid(filterFile, /h-\[100px\]/, "StandardSearchInput must not use oversized search height.");
contains(filterFile, "widthVariant", "filter width variant prop");
contains(filterFile, "FilterWidthVariant", "filter width variant type");
contains(filterFile, "short: \"w-full sm:w-[160px] sm:min-w-[140px] sm:max-w-[160px]\"", "compact short filter width");
contains(filterFile, "auto: \"w-full sm:w-auto sm:min-w-fit sm:max-w-[220px]\"", "content-fit auto filter width");
contains(filterFile, "status: \"w-full sm:w-[150px] sm:min-w-[130px] sm:max-w-[150px]\"", "compact status filter width");
contains(filterFile, "department: \"w-full sm:w-[190px] sm:min-w-[170px] sm:max-w-[210px]\"", "compact department filter width");
contains(filterFile, "jobLevel: \"w-full sm:w-[165px] sm:min-w-[150px] sm:max-w-[180px]\"", "compact job level filter width");
contains(filterFile, "position: \"w-full sm:w-[210px] sm:min-w-[190px] sm:max-w-[230px]\"", "compact position filter width");
contains(filterFile, "employee: \"w-full sm:w-[240px] sm:min-w-[220px] sm:max-w-[260px]\"", "employee filter width");
contains(filterFile, "dateRange: \"w-full sm:w-[240px] sm:min-w-[220px] sm:max-w-[260px]\"", "compact date range width");
contains(filterFile, "filterSelectMinWidths[resolvedWidth]", "StandardSelectFilter resolved width mapping");
contains(filterFile, "filterSelectMinWidths[widthVariant]", "StandardDateRangeFilter width variant mapping");
contains(filterFile, "className={cn(\"h-10 shrink-0 truncate\"", "StandardSelectFilter must not inherit oversized w-full desktop width");
contains(filterFile, "className={cn(\"h-10 shrink-0 justify-between", "StandardDateRangeFilter compact date-range trigger width");
assert(!/status:\s*["'][^"']*260px/.test(filterSource), "Status filters must not be as wide as employee/date filters.");
contains(filterFile, "departmentId", "department cascade input");
contains(filterFile, "jobLevelId", "job level cascade input");
contains(filterFile, "filteredPositions", "position cascade output");

const migratedPages = [
  "frontend/src/pages/AdminHelpGuidePage.tsx",
  "frontend/src/pages/AdminSettingsPage.tsx",
  "frontend/src/pages/AssetAssignmentsPage.tsx",
  "frontend/src/pages/AssetUniformAdvancedPages.tsx",
  "frontend/src/pages/AssetsItemsPage.tsx",
  "frontend/src/pages/AssetsReportsPage.tsx",
  "frontend/src/pages/EmployeesPage.tsx",
  "frontend/src/pages/AttendanceDevicesPage.tsx",
  "frontend/src/pages/AttendanceRecordsPage.tsx",
  "frontend/src/pages/AttendanceReportsPage.tsx",
  "frontend/src/pages/AttendanceCorrectionsPage.tsx",
  "frontend/src/pages/AttendanceCalendarPage.tsx",
  "frontend/src/pages/AttendanceDeviceOperationsPage.tsx",
  "frontend/src/pages/DocumentCompliancePage.tsx",
  "frontend/src/pages/FinalSettlementPage.tsx",
  "frontend/src/pages/LeaveRequestsPage.tsx",
  "frontend/src/pages/LeaveCalendarPage.tsx",
  "frontend/src/pages/MissingDocumentsPage.tsx",
  "frontend/src/pages/OrganizationSettingsPage.tsx",
  "frontend/src/pages/PayrollPeriodsPage.tsx",
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
  "frontend/src/pages/RosterReportsPage.tsx",
  "frontend/src/pages/RosterShiftTemplatesPage.tsx",
  "frontend/src/pages/RosterWeeklyPage.tsx",
  "frontend/src/pages/SearchResultsPage.tsx"
];

const pagesWithMoreFilters = [
  "frontend/src/pages/EmployeesPage.tsx",
  "frontend/src/pages/AttendanceDevicesPage.tsx",
  "frontend/src/pages/AttendanceRecordsPage.tsx",
  "frontend/src/pages/AttendanceReportsPage.tsx",
  "frontend/src/pages/AttendanceCorrectionsPage.tsx",
  "frontend/src/pages/AttendanceCalendarPage.tsx",
  "frontend/src/pages/AttendanceDeviceOperationsPage.tsx",
  "frontend/src/pages/AssetAssignmentsPage.tsx",
  "frontend/src/pages/AssetUniformAdvancedPages.tsx",
  "frontend/src/pages/AssetsItemsPage.tsx",
  "frontend/src/pages/AssetsReportsPage.tsx",
  "frontend/src/pages/FinalSettlementPage.tsx",
  "frontend/src/pages/LeaveRequestsPage.tsx",
  "frontend/src/pages/LeaveCalendarPage.tsx",
  "frontend/src/pages/MissingDocumentsPage.tsx",
  "frontend/src/pages/PayrollPeriodsPage.tsx",
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
  "frontend/src/pages/RosterReportsPage.tsx",
  "frontend/src/pages/RosterWeeklyPage.tsx"
];

for (const page of migratedPages) {
  const source = read(page);
  assert(source.includes("StandardFilterBar"), `${page} must use StandardFilterBar.`);
  assert(source.includes("StandardSearchInput"), `${page} must use StandardSearchInput.`);
  assert(source.includes("FilterResetButton"), `${page} must expose Reset.`);
  assert(!/import\s*\{[^}]*\bFilterBar\b[^}]*\}\s*from\s*["'][^"']*page-shell["']/.test(source), `${page} must not import legacy FilterBar.`);
  assert(!/function\s+FilterBar\s*\(/.test(source), `${page} must not define a legacy local FilterBar.`);
}

for (const page of pagesWithMoreFilters) {
  contains(page, "MoreFiltersSheet", "MoreFiltersSheet for advanced filters");
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
  "frontend/src/pages/AdminSettingsPage.tsx",
  "frontend/src/pages/AdminHelpGuidePage.tsx",
  "frontend/src/pages/AssetAssignmentsPage.tsx",
  "frontend/src/pages/AssetUniformAdvancedPages.tsx",
  "frontend/src/pages/AssetsItemsPage.tsx",
  "frontend/src/pages/AssetsReportsPage.tsx",
  "frontend/src/pages/AttendanceCalendarPage.tsx",
  "frontend/src/pages/AttendanceCorrectionsPage.tsx",
  "frontend/src/pages/AttendanceDeviceOperationsPage.tsx",
  "frontend/src/pages/AttendanceDevicesPage.tsx",
  "frontend/src/pages/AttendanceReportsPage.tsx",
  "frontend/src/pages/DocumentCompliancePage.tsx",
  "frontend/src/pages/FinalSettlementPage.tsx",
  "frontend/src/pages/KycRequestsPage.tsx",
  "frontend/src/pages/LeaveRequestsPage.tsx",
  "frontend/src/pages/LeaveCalendarPage.tsx",
  "frontend/src/pages/MissingDocumentsPage.tsx",
  "frontend/src/pages/OrganizationSettingsPage.tsx",
  "frontend/src/pages/PayrollAdminPages.tsx",
  "frontend/src/pages/PayrollPeriodsPage.tsx",
  "frontend/src/pages/RosterReportsPage.tsx",
  "frontend/src/pages/RosterShiftTemplatesPage.tsx",
  "frontend/src/pages/RosterWeeklyPage.tsx",
  "frontend/src/pages/SearchResultsPage.tsx",
  "frontend/src/pages/UsersAccessPage.tsx",
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
assert(!/StandardSearchInput[\s\S]{0,160}(?:sm:w-\[300px\]|w-\[300px\]|h-\[100px\])/.test(allPageSource), "Page-level search width/height override regressed to old sizing.");
assert(!/StandardSelectFilter[\s\S]{0,220}(?:w-\[260px\]|w-\[280px\]|w-\[300px\]|min-w-\[260px\])/.test(allPageSource), "Page-level select width override regressed to oversized defaults.");
assert(!/StandardFilterBar[\s\S]{0,240}<MoreFiltersSheet[\s\S]{0,240}<FilterResetButton/.test(allPageSource), "Pages must not crowd More Filters and Reset directly after primary filters.");

const allPages = listTsxFiles("frontend/src/pages");
for (const page of allPages) {
  const source = read(page);
  if (source.includes("StandardFilterBar") && /(Filter|filter|search|query|dateFrom|dateTo|status)/.test(source)) {
    assert(source.includes("ActiveFilterChips"), `${page} uses StandardFilterBar with filter state but lacks ActiveFilterChips.`);
  }
}

forbid("frontend/src/pages/DocumentCompliancePage.tsx", /<Input[^>]*placeholder=["']Search employee or document["']/s, "DocumentCompliancePage must not use raw search Input in its compliance filter bar.");
forbid("frontend/src/pages/DocumentCompliancePage.tsx", /grid gap-2 border-b p-3 md:grid-cols-4/, "DocumentCompliancePage must not use the old raw grid filter bar.");
forbid("frontend/src/pages/MissingDocumentsPage.tsx", /function\s+FilterSelect\b/, "MissingDocumentsPage must not keep the old local FilterSelect helper.");
forbid("frontend/src/pages/MissingDocumentsPage.tsx", /lg:grid-cols-6/, "MissingDocumentsPage must not use the old six-column raw filter grid.");
forbid("frontend/src/pages/FinalSettlementPage.tsx", /<Input[^>]*placeholder=["']Search employee, department, location["']/s, "FinalSettlementPage must not use raw search Input in its case filter bar.");
forbid("frontend/src/pages/AttendanceDevicesPage.tsx", /<Input[^>]*placeholder=["']Search devices["']/s, "AttendanceDevicesPage must not use raw search Input in its device filter bar.");
forbid("frontend/src/pages/AssetsItemsPage.tsx", /<Input[^>]*placeholder=["']Search code\/name\/serial["']/s, "AssetsItemsPage must not use raw search Input in its item filter bar.");
forbid("frontend/src/pages/RosterShiftTemplatesPage.tsx", /<Input[^>]*placeholder=["']Search shift templates["']/s, "RosterShiftTemplatesPage must not use raw search Input in its template filter bar.");
forbid("frontend/src/pages/PayrollPeriodsPage.tsx", /grid gap-2 border-b p-3/, "PayrollPeriodsPage must not use the old raw grid filter bar.");
forbid("frontend/src/pages/SearchResultsPage.tsx", /<Input[^>]*value=\{query\}/s, "SearchResultsPage must not use raw Input for result search.");
forbid("frontend/src/pages/OrganizationSettingsPage.tsx", /function\s+SearchFilter[\s\S]{0,260}<Input\b/, "OrganizationSettingsPage SearchFilter must render StandardSearchInput.");
forbid("frontend/src/pages/AdminHelpGuidePage.tsx", /<Input[^>]*placeholder=["']Search guide["']/s, "AdminHelpGuidePage must not use raw search Input for guide search.");

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
