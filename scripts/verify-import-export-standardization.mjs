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

function hasAll(file, markers, message) {
  markers.forEach((marker) => has(file, marker, `${message} Missing marker: ${marker}`));
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
  "worker/src/utils/import-validation.ts",
  "worker/src/utils/xlsx-import.ts"
].forEach((file) => assert(exists(file), `${file} is missing.`));

hasAll("frontend/src/components/export/ExportMenu.tsx", ["CSV", "Excel .xlsx", "PDF", "ActionTextButton"], "Export menu must expose the shared CSV/XLSX/PDF actions.");
hasAll("frontend/src/lib/export-utils.ts", [
  "rowsToCsv",
  "createXlsxBlob",
  "createPdfBlob",
  "createTemplateXlsxBlob",
  "Instructions",
  "Lookups",
  "dataValidations",
  'type="list"',
  'type="date"',
  '"decimal"',
  '"whole"',
  "Required field",
  "state=\"hidden\""
], "Excel/PDF/CSV export and template validation support regressed.");

hasAll("worker/src/utils/xlsx-import.ts", [
  "parseXlsxTemplateSheet",
  "xl/workbook.xml",
  "xl/sharedStrings.xml",
  "Template",
  "DecompressionStream",
  "rowIndex",
  "readWorksheetRows"
], "Real XLSX parsing support is missing.");

hasAll("frontend/src/components/import/ImportWizard.tsx", [
  "Download Excel template",
  "Download CSV template",
  "createDataImportBatchFromFile",
  "FormData",
  "selectedFile",
  "selectedFileType",
  "Excel file will be parsed from the Template sheet",
  "Validate preview",
  "Type APPLY",
  "Download error report",
  "Validation only",
  "Apply handler not available yet",
  "No commit action available",
  "placeholderOnly",
  "Sheet"
], "Shared ImportWizard must support real files, validation-only imports, preview, and apply confirmation.");
assert(!read("frontend/src/components/import/ImportWizard.tsx").includes(".text()"), "ImportWizard must not read uploaded files with file.text(); real files must be sent as multipart.");
assert(!/save\s+Excel\s+as\s+CSV/i.test(read("frontend/src/components/import/ImportWizard.tsx")), "ImportWizard still tells users to save Excel as CSV.");
has("frontend/src/components/import/ImportPreviewTable.tsx", "row_number", "Import preview table must show row numbers.");
has("frontend/src/components/import/ImportPreviewTable.tsx", "suggested_correction", "Import preview table must show suggested corrections.");

hasAll("frontend/src/pages/DataTransferPage.tsx", [
  "createDataImportBatchFromFile",
  "FormData",
  "selectedImportIsValidationOnly",
  "selectedBatchIsValidationOnly",
  "Excel .xlsx files are parsed from the Template sheet",
  "Validation-only batch",
  "Apply handler not available"
], "Data Transfer Center legacy import panel must use real multipart uploads and label placeholder-only imports.");
assert(!read("frontend/src/pages/DataTransferPage.tsx").includes(".text()"), "Data Transfer Center must not convert uploaded CSV/XLSX files with file.text(); use multipart uploads.");

hasAll("frontend/src/lib/import-utils.ts", ["buildExcelValidationsForTemplate", "placeholderOnly"], "Import utilities must keep template validation and placeholder metadata.");
has("frontend/src/lib/import-utils.ts", /valid[- ]combination|valid combinations/i, "Department/Job Level/Position valid-combination guidance is missing.");
hasAll("frontend/src/lib/api.ts", ["download.xlsx", "downloadDataExport", "createDataImportBatchFromFile", "multipartRequest"], "API wrapper must support XLSX templates, binary export, and multipart import upload.");

hasAll("worker/src/routes/data-transfer.ts", [
  "/templates/:importType/download.xlsx",
  "/:exportType/download",
  "parseXlsxTemplateSheet",
  "parseImportUpload",
  "inferImportFileType",
  "importFileTypeAllowed",
  "allowed_import_file_types_json",
  "matrixToImportRows",
  "parseCsvImportRows",
  "source_file_name",
  "file_type",
  "parsed_sheet_name",
  "row_count",
  "generateImportErrorCsv(batch",
  "requireAnyPermission",
  "DATA_IMPORT_DISABLED",
  "DATA_EXPORT_DISABLED",
  "canAccessEmployee",
  "data_import.uploaded",
  "data_export.run",
  "rollback_placeholder",
  "generateExcelImportTemplate",
  "getImportLookupValues",
  "valid_department_job_level_position_combinations",
  "buildPdfReport",
  "buildXlsxReport",
  "buildCsv",
  "validationMessageToIssue"
], "Backend import/export routes must keep real XLSX parsing, metadata, permissions, validation, audit, and binary export support.");
assert(!/fileType\s*===\s*["']xlsx["'][\s\S]{0,240}file\.text\s*\(/.test(read("worker/src/routes/data-transfer.ts")), "Backend XLSX branch must not read Excel files with file.text().");
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
  "frontend/src/pages/DocumentRegistryPage.tsx",
  "frontend/src/pages/KycRequestsPage.tsx",
  "frontend/src/pages/MissingDocumentsPage.tsx",
  "frontend/src/pages/DocumentCompliancePage.tsx",
  "frontend/src/pages/LeaveRequestsPage.tsx",
  "frontend/src/pages/LeaveCalendarPage.tsx",
  "frontend/src/pages/ContractsPage.tsx",
  "frontend/src/pages/ApprovalsPage.tsx",
  "frontend/src/pages/PayrollRunDetailPage.tsx",
  "frontend/src/pages/PayrollAdminPages.tsx",
  "frontend/src/pages/PayrollFoundationPages.tsx",
  "frontend/src/pages/PayrollPrompt11Pages.tsx",
  "frontend/src/pages/FinalSettlementPage.tsx",
  "frontend/src/pages/AttendanceRecordsPage.tsx",
  "frontend/src/pages/AttendanceCorrectionsPage.tsx",
  "frontend/src/pages/AttendanceDevicesPage.tsx",
  "frontend/src/pages/AttendanceDeviceOperationsPage.tsx",
  "frontend/src/pages/RosterWeeklyPage.tsx",
  "frontend/src/pages/RosterShiftTemplatesPage.tsx",
  "frontend/src/pages/AssetsItemsPage.tsx",
  "frontend/src/pages/AssetAssignmentsPage.tsx",
  "frontend/src/pages/AssetUniformAdvancedPages.tsx",
  "frontend/src/pages/UsersAccessPage.tsx"
].forEach((file) => {
  has(file, "ExportMenu", "Relevant table/list/report page must use shared ExportMenu.");
});

[
  ["frontend/src/pages/EmployeesPage.tsx", "Import employees"],
  ["frontend/src/pages/AttendanceRecordsPage.tsx", "Validate attendance import"],
  ["frontend/src/pages/AssetsItemsPage.tsx", "Asset import validation"],
  ["frontend/src/pages/AssetAssignmentsPage.tsx", "Assignment import validation"],
  ["frontend/src/pages/MissingDocumentsPage.tsx", "Validate document import"],
  ["frontend/src/pages/PayrollAdminPages.tsx", "Import payroll profiles"],
  ["frontend/src/pages/PayrollFoundationPages.tsx", "Payroll import validation"]
].forEach(([file, label]) => has(file, label, "Contextual import entry point is missing or mislabeled."));

has("frontend/src/pages/DataTransferPage.tsx", "ImportWizard", "Data transfer page must expose shared ImportWizard.");
has("frontend/src/pages/DataTransferPage.tsx", "downloadDataImportTemplate(token, importType, format)", "Template format download support is missing.");
has("frontend/src/pages/DataTransferPage.tsx", "downloadDataExport", "Data export center must use backend binary export download.");
has("database/seed.sql", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Seed must allow Excel import template MIME type.");

const source = files("frontend/src").concat(files("worker/src")).map((file) => read(file)).join("\n");
assert(!/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(source), "Browser alert(), confirm(), or prompt() was introduced.");
assert(!/darkMode\s*[:=]/i.test(source), "Dark mode configuration was introduced.");
assert(!read("frontend/src/pages/ReportsPage.tsx").includes("Excel later") && !read("frontend/src/pages/ReportsPage.tsx").includes("PDF later"), "Reports page still exposes fake Excel/PDF buttons.");

const headers = read("frontend/public/_headers");
assert(headers.includes("/index.html") && /Cache-Control:[^\n]*no-cache/.test(headers), "CSS/static asset fix regressed: index.html no-cache header missing.");
assert(headers.includes("/assets/*") && headers.includes("max-age=31536000") && headers.includes("immutable"), "CSS/static asset fix regressed: immutable asset header missing.");

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
