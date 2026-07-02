import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function rel(file) {
  return path.join(root, file);
}

function read(file) {
  return fs.readFileSync(rel(file), "utf8");
}

function exists(file) {
  return fs.existsSync(rel(file));
}

function fail(message) {
  failures.push(message);
}

function assertExists(file) {
  if (!exists(file)) fail(`${file} is missing.`);
}

function assertIncludes(file, marker, message = `${file} is missing marker ${marker}`) {
  if (!read(file).includes(marker)) fail(message);
}

function assertNotIncludes(file, marker, message = `${file} must not include ${marker}`) {
  if (read(file).includes(marker)) fail(message);
}

function assertRegex(file, regex, message) {
  if (!regex.test(read(file))) fail(message);
}

const sharedFiles = [
  "frontend/src/components/table/PerformanceDataTable.tsx",
  "frontend/src/components/table/TablePaginationBar.tsx",
  "frontend/src/components/table/TableLoadingOverlay.tsx",
  "frontend/src/hooks/usePaginatedQuery.ts",
  "frontend/src/hooks/useDebouncedTableFilters.ts",
  "frontend/src/lib/tableQueryKeys.ts",
  "frontend/src/lib/tablePerformance.ts",
  "worker/src/utils/pagination.ts"
];

for (const file of sharedFiles) assertExists(file);

assertIncludes("frontend/src/components/table/PerformanceDataTable.tsx", "TableLoadingOverlay", "PerformanceDataTable must show a table-level refreshing overlay.");
assertIncludes("frontend/src/components/table/PerformanceDataTable.tsx", "overflow-x-auto", "PerformanceDataTable must constrain horizontal table scrolling.");
assertIncludes("frontend/src/components/table/PerformanceDataTable.tsx", "data-virtualization-threshold", "PerformanceDataTable must expose the virtualization threshold marker.");
assertIncludes("frontend/src/components/table/TablePaginationBar.tsx", "TABLE_PAGE_SIZE_OPTIONS", "TablePaginationBar must use the shared page-size options.");
assertIncludes("frontend/src/hooks/usePaginatedQuery.ts", "useApiQuery", "usePaginatedQuery must build on the accepted API query foundation.");
assertIncludes("frontend/src/hooks/useApiQuery.ts", "placeholder-previous-data", "Accepted keep-previous-data query foundation must remain.");
assertIncludes("frontend/src/hooks/usePaginatedQuery.ts", "AbortSignal", "usePaginatedQuery must expose cancellable request signals.");
assertIncludes("frontend/src/hooks/useDebouncedTableFilters.ts", "setTimeout", "Table filters must debounce noisy text/filter changes.");
assertIncludes("frontend/src/lib/tableQueryKeys.ts", "tableQueryKeys", "Shared table query keys must exist.");
assertIncludes("frontend/src/lib/tablePerformance.ts", "VIRTUALIZATION_ROW_THRESHOLD", "Table virtualization threshold marker must exist.");
assertIncludes("frontend/src/lib/tablePerformance.ts", "trackTableQueryPerformance", "Table timing instrumentation must exist.");
assertIncludes("worker/src/utils/pagination.ts", "parsePaginationParams", "Backend parsePaginationParams helper must exist.");
assertIncludes("worker/src/utils/pagination.ts", "buildSafeLimitOffset", "Backend buildSafeLimitOffset helper must exist.");
assertIncludes("worker/src/utils/pagination.ts", "safeOrderByFromAllowList", "Backend safeOrderByFromAllowList helper must exist.");

const migratedPages = {
  "frontend/src/pages/EmployeesPage.tsx": ["usePaginatedQuery", "useDebouncedTableFilters", "PerformanceDataTable", "TablePaginationBar", "api.listEmployees"],
  "frontend/src/pages/LifecyclePage.tsx": ["usePaginatedQuery", "PerformanceDataTable", "TablePaginationBar", "api.listOnboardingCases", "api.listOffboardingCases"],
  "frontend/src/pages/MissingDocumentsPage.tsx": ["usePaginatedQuery", "useDebouncedTableFilters", "PerformanceDataTable", "TablePaginationBar", "api.listMissingDocuments"],
  "frontend/src/pages/AttendanceRecordsPage.tsx": ["usePaginatedQuery", "useDebouncedTableFilters", "PerformanceDataTable", "TablePaginationBar", "api.listAttendanceRecords"],
  "frontend/src/pages/AttendanceCorrectionsPage.tsx": ["usePaginatedQuery", "useDebouncedTableFilters", "PerformanceDataTable", "TablePaginationBar", "api.listAttendanceCorrections"],
  "frontend/src/pages/PayrollRunDetailPage.tsx": ["usePaginatedQuery", "PerformanceDataTable", "TablePaginationBar", "api.listPayrollRunEmployees"],
  "frontend/src/pages/NotificationCenterPage.tsx": ["usePaginatedQuery", "useDebouncedTableFilters", "PerformanceDataTable", "TablePaginationBar", "api.listNotifications"]
};

for (const [file, markers] of Object.entries(migratedPages)) {
  assertExists(file);
  for (const marker of markers) assertIncludes(file, marker, `${file} must use ${marker}.`);
}

const api = read("frontend/src/lib/api.ts");
for (const method of [
  "listEmployees",
  "listOnboardingCases",
  "listOffboardingCases",
  "listMissingDocuments",
  "listDocumentComplianceMissing",
  "listAttendanceRecords",
  "listAttendanceRawLogs",
  "listAttendanceLogs",
  "listAttendanceCorrections",
  "listPayrollRunEmployees",
  "listPayrollRunPaymentRegister",
  "listNotifications"
]) {
  if (!api.includes(`${method}(token: string`)) fail(`api.${method} helper is missing.`);
}
for (const marker of ["signal?: AbortSignal", "pagination?: Record<string, unknown>"]) {
  if (!api.includes(marker)) fail(`frontend API must include ${marker} for paginated list helpers.`);
}
for (const file of Object.keys(migratedPages)) {
  const content = read(file);
  if (!content.includes("pagination.limit") || !content.includes("pagination.offset")) {
    fail(`${file} must pass pagination.limit and pagination.offset to its paginated API call.`);
  }
}

const backendRoutes = {
  "worker/src/routes/employees.ts": ["parsePaginationParams", "paginationMeta", "LIMIT ? OFFSET ?"],
  "worker/src/routes/lifecycle.ts": ["parsePaginationParams", "paginationMeta", "LIMIT ? OFFSET ?"],
  "worker/src/routes/documents.ts": ["parsePaginationParams", "paginationMeta", "LIMIT ? OFFSET ?"],
  "worker/src/routes/document-compliance.ts": ["parsePaginationParams", "paginationMeta"],
  "worker/src/routes/attendance.ts": ["parsePaginationParams", "paginationMeta", "LIMIT ? OFFSET ?"],
  "worker/src/routes/payroll.ts": ["parsePaginationParams", "paginationMeta", "LIMIT ? OFFSET ?"],
  "worker/src/routes/notifications.ts": ["parsePaginationParams", "paginationMeta", "LIMIT ? OFFSET ?"]
};

for (const [file, markers] of Object.entries(backendRoutes)) {
  assertExists(file);
  for (const marker of markers) assertIncludes(file, marker, `${file} must include ${marker}.`);
}

assertIncludes("worker/src/utils/performance.ts", "X-Request-Id", "Worker request id/performance instrumentation must remain.");
assertIncludes("scripts/verify-cors-request-id-hotfix.mjs", "x-request-id", "CORS request-id verifier must remain.");
assertIncludes("scripts/verify-document-upload-acceleration-background.mjs", "\"/uploads/prepare\"", "Document upload Phase 5 verifier must keep prepare checks.");
assertIncludes("scripts/verify-document-upload-acceleration-background.mjs", "\"/uploads/complete\"", "Document upload Phase 5 verifier must keep complete checks.");
assertIncludes("docs/performance/document-upload-acceleration-phase5.md", "worker_proxy", "Document upload Phase 5 documentation must remain.");
assertIncludes("scripts/verify-global-instant-performance-foundation.mjs", "TanStack", "Phase 1 performance verifier must remain.");
assertIncludes("scripts/verify-global-workspace-page-load-reduction.mjs", "workspace", "Phase 2 workspace performance verifier must remain.");
assertIncludes("scripts/verify-d1-query-payload-optimization.mjs", "payload", "Phase 3 D1/payload verifier must remain.");
assertIncludes("scripts/audit-d1-query-performance.mjs", "D1 query performance audit complete", "Phase 4 D1 audit script must remain.");

assertIncludes("docs/performance/large-list-table-performance-phase6.md", "PerformanceDataTable", "Phase 6 documentation must mention shared table components.");
assertIncludes("docs/performance/large-list-table-performance-phase6.md", "server pagination", "Phase 6 documentation must mention server pagination.");

const wrangler = read("worker/wrangler.toml");
for (const marker of [
  'binding = "DB"',
  'database_name = "hrm-v2"',
  'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"',
  'binding = "DOCUMENTS_BUCKET"',
  'bucket_name = "hrm-v2-documents"'
]) {
  if (!wrangler.includes(marker)) fail(`wrangler.toml binding changed or missing: ${marker}`);
}

const workerSources = fs.readdirSync(rel("worker/src"), { recursive: true })
  .filter((file) => String(file).endsWith(".ts"))
  .map((file) => read(path.join("worker/src", String(file))))
  .join("\n");
if (!workerSources.includes("100000")) fail("PBKDF2 iteration marker 100000 is missing from worker sources.");

for (const file of Object.keys(migratedPages)) {
  assertNotIncludes(file, "window.alert(", `${file} must not use window.alert.`);
  assertNotIncludes(file, "window.confirm(", `${file} must not use window.confirm.`);
  assertNotIncludes(file, "window.prompt(", `${file} must not use window.prompt.`);
  if (/dark:/g.test(read(file))) fail(`${file} must not introduce dark mode classes.`);
}

const packageJson = JSON.parse(read("package.json"));
if (packageJson.scripts?.["verify:large-list-table-performance"] !== "node scripts/verify-large-list-table-performance.mjs") {
  fail("package.json must expose verify:large-list-table-performance.");
}

if (failures.length) {
  console.error("Large list/table performance verification failed:");
  for (const item of failures) console.error(`- ${item}`);
  process.exit(1);
}

console.log("Large list/table performance verification passed.");
