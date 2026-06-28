import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
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

contains(filterFile, "data-standard-filter-bar", "compact filter bar marker");
contains(filterFile, "data-filter-search-first", "search-first marker");
contains(filterFile, "window.setTimeout", "300ms debounce implementation");
contains(filterFile, "data-active-filter-chips", "active filter chip marker");
contains(filterFile, "Reset Filters", "advanced sheet reset footer");
contains(filterFile, "Apply Filters", "advanced sheet apply footer");
contains(filterFile, "data-shadcn-sheet", "sheet-style advanced filter drawer marker");
contains(filterFile, "FilterSection", "grouped advanced filter sections");
contains(filterFile, "min-w-[260px]", "standard date range width");
contains(filterFile, "min-w-[220px]", "standard department width");
contains(filterFile, "departmentId", "department cascade input");
contains(filterFile, "jobLevelId", "job level cascade input");
contains(filterFile, "filteredPositions", "position cascade output");

const migratedPages = [
  "frontend/src/pages/EmployeesPage.tsx",
  "frontend/src/pages/AttendanceRecordsPage.tsx",
  "frontend/src/pages/LeaveRequestsPage.tsx",
  "frontend/src/pages/PayrollRunsPage.tsx",
  "frontend/src/pages/DocumentRegistryPage.tsx",
  "frontend/src/pages/ContractsPage.tsx",
  "frontend/src/pages/ApprovalsPage.tsx",
  "frontend/src/pages/AuditLogPage.tsx"
];

for (const page of migratedPages) {
  const source = read(page);
  assert(source.includes("StandardFilterBar"), `${page} must use StandardFilterBar.`);
  assert(source.includes("StandardSearchInput"), `${page} must use StandardSearchInput.`);
  assert(source.includes("FilterResetButton"), `${page} must expose Reset.`);
  assert(source.includes("ActiveFilterChips"), `${page} must show active filter chips.`);
  assert(source.includes("MoreFiltersSheet"), `${page} must route advanced filters through MoreFiltersSheet.`);
}

const dateRangeUsers = migratedPages.filter((page) => read(page).includes("StandardDateRangeFilter"));
assert(dateRangeUsers.length >= 5, "Expected standardized date range picker on major date-filtered pages.");

const changedUiSources = [filterFile, ...migratedPages].map((file) => [file, read(file)]);
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
