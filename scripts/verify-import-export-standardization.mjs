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

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function has(file, marker, message) {
  const content = read(file);
  assert(marker instanceof RegExp ? marker.test(content) : content.includes(marker), `${file}: ${message}`);
}

function files(dir) {
  const absolute = path.join(root, dir);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { recursive: true })
    .map((entry) => String(entry).replaceAll("\\", "/"))
    .filter((entry) => /\.(tsx?|mts|mjs)$/.test(entry))
    .map((entry) => `${dir}/${entry}`);
}

const pkg = JSON.parse(read("package.json"));
assert(pkg.scripts?.["verify:import-export-standardization"] === "node scripts/verify-import-export-standardization.mjs", "package.json: missing verify:import-export-standardization script.");

[
  "frontend/src/components/export/ExportMenu.tsx",
  "frontend/src/components/import/ImportWizard.tsx",
  "frontend/src/components/import/ImportPreviewTable.tsx",
  "frontend/src/lib/export-utils.ts",
  "frontend/src/lib/import-utils.ts",
  "worker/src/utils/report-export.ts",
  "worker/src/utils/import-validation.ts"
].forEach((file) => assert(exists(file), `${file} is missing.`));

has("frontend/src/components/export/ExportMenu.tsx", "CSV", "Export menu must offer CSV.");
has("frontend/src/components/export/ExportMenu.tsx", "Excel .xlsx", "Export menu must offer Excel .xlsx.");
has("frontend/src/components/export/ExportMenu.tsx", "PDF", "Export menu must offer PDF.");
has("frontend/src/components/export/ExportMenu.tsx", "ActionTextButton", "Export menu must use standardized action buttons.");
has("frontend/src/lib/export-utils.ts", "rowsToCsv", "CSV export utility is missing.");
has("frontend/src/lib/export-utils.ts", "createXlsxBlob", "Excel .xlsx export support is missing.");
has("frontend/src/lib/export-utils.ts", "createPdfBlob", "PDF export support is missing.");
has("frontend/src/lib/export-utils.ts", "createTemplateXlsxBlob", "Excel template generator is missing.");
has("frontend/src/lib/export-utils.ts", "Instructions", "Excel templates must include an Instructions sheet.");
has("frontend/src/lib/export-utils.ts", "Lookups", "Excel templates must include a Lookups/Allowed Values sheet.");
has("frontend/src/lib/export-utils.ts", "dataValidations", "Excel data validation XML is missing.");
has("frontend/src/lib/export-utils.ts", 'type="list"', "Dropdown/list validation is missing.");
has("frontend/src/lib/export-utils.ts", 'type="date"', "Date validation is missing.");
has("frontend/src/lib/export-utils.ts", '"decimal"', "Decimal number validation is missing.");
has("frontend/src/lib/export-utils.ts", '"whole"', "Whole-number validation is missing.");
has("frontend/src/lib/export-utils.ts", "Required field", "Required-field input message is missing.");
has("frontend/src/lib/export-utils.ts", "state=\"hidden\"", "Lookup sheet hiding/protection foundation is missing.");

has("frontend/src/components/import/ImportWizard.tsx", "Download Excel template", "Import wizard must download Excel templates.");
has("frontend/src/components/import/ImportWizard.tsx", "Download CSV template", "Import wizard must download CSV templates.");
has("frontend/src/components/import/ImportWizard.tsx", "Validate preview", "Import wizard must include validation preview.");
has("frontend/src/components/import/ImportWizard.tsx", "Type APPLY", "Import wizard must require confirmation before apply.");
has("frontend/src/components/import/ImportWizard.tsx", "Download error report", "Import wizard must support error report download.");
has("frontend/src/components/import/ImportWizard.tsx", "Sheet", "Import wizard must use shadcn/Radix sheet dialog, not browser confirm.");
has("frontend/src/components/import/ImportPreviewTable.tsx", "row_number", "Import preview table must show row numbers.");
has("frontend/src/components/import/ImportPreviewTable.tsx", "suggested_correction", "Import preview table must show suggested corrections.");
has("frontend/src/lib/import-utils.ts", "buildExcelValidationsForTemplate", "Template validation builder is missing.");
has("frontend/src/lib/import-utils.ts", /valid[- ]combination|valid combinations/i, "Department/Job Level/Position valid-combination guidance is missing.");

has("worker/src/routes/data-transfer.ts", "/templates/:importType/download.xlsx", "Backend Excel template download route is missing.");
has("worker/src/routes/data-transfer.ts", "/:exportType/download", "Backend binary export download route is missing.");
has("worker/src/routes/data-transfer.ts", "requireAnyPermission", "Backend import/export permission enforcement is missing.");
has("worker/src/routes/data-transfer.ts", "DATA_IMPORT_DISABLED", "Disabled data import enforcement is missing.");
has("worker/src/routes/data-transfer.ts", "DATA_EXPORT_DISABLED", "Disabled data export enforcement is missing.");
has("worker/src/routes/data-transfer.ts", "canAccessEmployee", "Import validation must enforce employee access scope.");
has("worker/src/routes/data-transfer.ts", "data_import.uploaded", "Import audit logging is missing.");
has("worker/src/routes/data-transfer.ts", "data_export.run", "Export audit logging is missing.");
has("worker/src/routes/data-transfer.ts", "rollback_placeholder", "Rollback placeholder must be explicit.");
has("worker/src/routes/data-transfer.ts", "generateExcelImportTemplate", "Backend Excel template generator is missing.");
has("worker/src/routes/data-transfer.ts", "getImportLookupValues", "Lookup sheet values must be generated from reference data where possible.");
has("worker/src/routes/data-transfer.ts", "valid_department_job_level_position_combinations", "Department/Job Level/Position validation guidance is missing.");
has("worker/src/routes/data-transfer.ts", "buildPdfReport", "Backend PDF export support is missing.");
has("worker/src/routes/data-transfer.ts", "buildXlsxReport", "Backend Excel export support is missing.");
has("worker/src/routes/data-transfer.ts", "buildCsv", "Backend CSV export utility is missing.");
has("worker/src/routes/data-transfer.ts", "validationMessageToIssue", "Error report must use row-level validation issue model.");
has("worker/src/utils/report-export.ts", "dataValidationsXml", "Worker Excel data-validation generation is missing.");
has("worker/src/utils/import-validation.ts", "ImportValidationIssue", "Row-level import validation error model is missing.");

[
  "frontend/src/pages/EmployeesPage.tsx",
  "frontend/src/pages/ReportsPage.tsx",
  "frontend/src/pages/AuditLogPage.tsx",
  "frontend/src/pages/AttendanceReportsPage.tsx",
  "frontend/src/pages/RosterReportsPage.tsx",
  "frontend/src/pages/PayrollRunsPage.tsx",
  "frontend/src/pages/AssetsReportsPage.tsx",
  "frontend/src/pages/DocumentRegistryPage.tsx"
].forEach((file) => {
  has(file, "ExportMenu", "Major page must use shared ExportMenu where relevant.");
});

has("frontend/src/pages/DataTransferPage.tsx", "ImportWizard", "Data transfer page must expose shared ImportWizard.");
has("frontend/src/pages/DataTransferPage.tsx", "downloadDataImportTemplate(token, importType, format)", "Template format download support is missing.");
has("frontend/src/pages/DataTransferPage.tsx", "downloadDataExport", "Data export center must use backend binary export download.");
has("frontend/src/lib/api.ts", "download.xlsx", "API wrapper must support Excel template download.");
has("frontend/src/lib/api.ts", "downloadDataExport", "API wrapper must support binary data export download.");
has("database/seed.sql", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Seed must allow Excel import template MIME type.");

const source = files("frontend/src").concat(files("worker/src")).map((file) => read(file)).join("\n");
assert(!/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(source), "Browser alert(), confirm(), or prompt() was introduced.");
assert(!/darkMode\s*[:=]/i.test(source), "Dark mode configuration was introduced.");
assert(!read("frontend/src/pages/ReportsPage.tsx").includes("Excel later") && !read("frontend/src/pages/ReportsPage.tsx").includes("PDF later"), "Reports page still exposes fake Excel/PDF buttons.");

const wrangler = read("worker/wrangler.toml");
assert(wrangler.includes('database_name = "hrm-v2"'), "D1 database_name changed.");
assert(wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'), "D1 database_id changed.");
assert(wrangler.includes('bucket_name = "hrm-v2-documents"'), "R2 bucket binding changed.");
assert(read("worker/src/auth/password.ts").includes("100000"), "PBKDF2 iteration count changed or marker missing.");

[
  "verify:button-color-standardization",
  "verify:frontend-static-assets",
  "verify:frontend-bundle-integrity",
  "verify:filter-search-date-standardization",
  "verify:command-center-dashboard"
].forEach((script) => assert(Boolean(pkg.scripts?.[script]), `package.json: missing regression script ${script}.`));

if (failures.length) {
  console.error("Import/export standardization verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Import/export standardization verification passed.");
