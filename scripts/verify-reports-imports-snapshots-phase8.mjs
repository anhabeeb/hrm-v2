import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function file(relativePath) {
  return path.join(root, relativePath);
}

function read(relativePath) {
  const absolute = file(relativePath);
  if (!fs.existsSync(absolute)) {
    failures.push(`Missing required file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolute, "utf8");
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

function includesAll(text, markers, label) {
  for (const marker of markers) {
    check(text.includes(marker), `${label} missing marker: ${marker}`);
  }
}

function assertNoRawDialogs(source, label) {
  check(!/\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/.test(source), `${label} must not use browser alert/confirm/prompt.`);
}

const schema = read("database/schema.sql");
const snapshots = read("worker/src/utils/snapshots.ts");
const reportArtifacts = read("worker/src/utils/report-artifacts.ts");
const reportJobs = read("worker/src/utils/report-jobs.ts");
const importJobs = read("worker/src/utils/import-jobs.ts");
const reportsRoute = read("worker/src/routes/reports.ts");
const dataTransfer = read("worker/src/routes/data-transfer.ts");
const attendance = read("worker/src/routes/attendance.ts");
const payroll = read("worker/src/routes/payroll.ts");
const dashboard = read("worker/src/routes/dashboard.ts");
const api = read("frontend/src/lib/api.ts");
const reportsPage = read("frontend/src/pages/ReportsPage.tsx");
const dataTransferPage = read("frontend/src/pages/DataTransferPage.tsx");
const importWizard = read("frontend/src/components/import/ImportWizard.tsx");
const invalidation = read("frontend/src/lib/workspaceInvalidation.ts");
const docs = read("docs/performance/reports-imports-snapshots-phase8.md");
const wrangler = read("worker/wrangler.toml");
const password = read("worker/src/auth/password.ts");
const packageJson = JSON.parse(read("package.json") || "{}");

includesAll(schema, [
  "CREATE TABLE IF NOT EXISTS attendance_summary_snapshots",
  "CREATE TABLE IF NOT EXISTS payroll_summary_snapshots",
  "CREATE TABLE IF NOT EXISTS report_export_artifacts",
  "CREATE TABLE IF NOT EXISTS dashboard_summary_snapshots",
  "idx_attendance_summary_snapshots_employee_date",
  "idx_attendance_summary_snapshots_employee_period",
  "idx_attendance_summary_snapshots_stale",
  "idx_payroll_summary_snapshots_period_run",
  "idx_payroll_summary_snapshots_employee",
  "idx_payroll_summary_snapshots_stale",
  "idx_report_export_artifacts_job",
  "idx_report_export_artifacts_status_user",
  "idx_report_export_artifacts_report_key",
  "idx_dashboard_summary_snapshots_key_scope",
  "idx_dashboard_summary_snapshots_stale_expires"
], "Phase 8 schema");

includesAll(snapshots, [
  "markSnapshotStale",
  "markSnapshotsStaleForEmployee",
  "markSnapshotsStaleForPeriod",
  "getFreshSnapshot",
  "upsertSnapshot",
  "recalculateAttendanceSnapshot",
  "recalculatePayrollSnapshot",
  "is_stale = 1",
  "ON CONFLICT(employee_id, period_key, summary_date)",
  "ON CONFLICT(employee_id, payroll_period_id, payroll_run_id)"
], "snapshot utilities");

includesAll(reportArtifacts, [
  "createReportArtifact",
  "expireReportArtifact",
  "getReportArtifact",
  "getReportArtifactForJob",
  "sanitizeReportArtifactForUser",
  "writeReportArtifactObject",
  "DOCUMENTS_BUCKET.put",
  "download_url",
  "storage_key"
], "report artifact utilities");
check(!/download_url[\s\S]{0,120}storage_key/.test(reportArtifacts), "Artifact download payload must not expose storage keys.");
check(/SENSITIVE_METADATA_KEY[\s\S]*document_number[\s\S]*salary[\s\S]*bank/.test(reportArtifacts), "Artifact metadata sanitizer must redact sensitive report metadata.");

includesAll(reportJobs, ["runReportExportJob", "markJobRunning", "markJobSucceeded", "markJobFailed", "duration_ms", "row_count"], "report job runner");
includesAll(importJobs, ["runImportValidationJob", "runImportApplyJob", "markJobRunning", "markJobSucceeded", "markJobFailed", "processed_rows", "error_rows"], "import job runners");

includesAll(reportsRoute, [
  "REPORT_EXPORT_GENERATION",
  "startReportExportJob",
  "createReportArtifact",
  "writeReportArtifactObject",
  "runReportExportJob",
  "reportRoutes.get(\"/artifacts/:artifactId/download\"",
  "download_url",
  "artifact_status",
  "canDownloadReportArtifact",
  "\"Cache-Control\": \"private, no-store\"",
  "getReportArtifactForJob"
], "report/export background flow");
check(/reportRoutes\.post\(`\/\$\{reportKey\}\/export`[\s\S]*startReportExportJob[\s\S]*202/.test(reportsRoute), "Report POST export route must queue a background job and return 202.");

includesAll(dataTransfer, [
  "IMPORT_VALIDATION",
  "IMPORT_APPLY",
  "DATA_EXPORT_GENERATION",
  "queueDataExportJob",
  "runImportValidationJob",
  "runImportApplyJob",
  "runReportExportJob",
  "createReportArtifact",
  "writeReportArtifactObject",
  "boundedPagination",
  "LIMIT ? OFFSET ?"
], "data transfer job migration");
check(/dataImportRoutes\.post\("\/batches\/:batchId\/validate"[\s\S]*enqueueJob[\s\S]*202/.test(dataTransfer), "Import validation must queue and return 202.");
check(/dataImportRoutes\.post\("\/batches\/:batchId\/apply"[\s\S]*enqueueJob[\s\S]*202/.test(dataTransfer), "Import apply must queue and return 202.");
check(/validation-preview[\s\S]*LIMIT \? OFFSET \?/.test(dataTransfer), "Import validation preview must be paginated.");
check(/\/batches\/:batchId\/errors[\s\S]*LIMIT \? OFFSET \?/.test(dataTransfer), "Import errors must be paginated.");
check(/\/batches\/:batchId\/results[\s\S]*LIMIT \? OFFSET \?/.test(dataTransfer), "Import results must be paginated.");
check(dataTransfer.includes("downloadDataExport") || dataTransfer.includes("/:exportType/download"), "Legacy direct data export download route must remain for compatibility.");

includesAll(attendance, [
  "ATTENDANCE_SUMMARY_RECALCULATION",
  "recalculateAttendanceSnapshot",
  "markSnapshotsStaleForEmployee",
  "attendancePeriodKey",
  "requireAttendanceModuleEnabled"
], "attendance snapshot integration");

includesAll(payroll, [
  "recalculatePayrollSnapshot",
  "markSnapshotsStaleForEmployee",
  "markSnapshotsStaleForPeriod",
  "attendance_module_enabled",
  "attendance_disabled_notice",
  "requirePayrollModuleEnabled"
], "payroll snapshot and Attendance-disabled isolation");

includesAll(dashboard, [
  "dashboard_summary_snapshots",
  "getCommandCenterSummaryWithSnapshot",
  "snapshot_cache",
  "refreshing: true",
  "enabledModules.payroll",
  "enabledModules.attendance"
], "Command Center snapshot cache");
check(!/rows:\s*\[/.test(dashboard.slice(dashboard.indexOf("return {"), dashboard.indexOf("async function buildCommandCenterSummary"))), "Cached Command Center wrapper must not return large raw row arrays.");

includesAll(api, [
  "queueReportExport",
  "downloadReportArtifact",
  "validateDataImportBatch(token: string, batchId: string)",
  "queued?: boolean",
  "getDataImportValidationPreview(token: string, batchId: string, filters?",
  "runDataExport(token: string, exportType: string"
], "frontend API helpers");
includesAll(reportsPage, ["queueReportExport", "Report export queued", "background job drawer", "api.queueReportExport", "downloadReportArtifact", "artifact_status", "download_url"], "Reports page job UX");
includesAll(dataTransferPage, ["Validation queued", "Import apply queued", "Export queued", "api.runDataExport"], "Data Transfer page job UX");
includesAll(importWizard, ["Validation queued", "Import apply queued", "background job drawer"], "Import wizard job UX");
check(invalidation.includes("data_export") && invalidation.includes("reports") && invalidation.includes("data_import"), "Background job completion must invalidate targeted report/import/export query scopes.");
check(!invalidation.includes("invalidateQueries({ queryKey: queryKeys.scope(scope) })"), "Job completion must not invalidate all scoped app queries.");

includesAll(docs, [
  "Snapshot Tables",
  "Report Artifact Flow",
  "Import Validation and Apply Flow",
  "Attendance Snapshot Invalidation",
  "Payroll Snapshot Invalidation",
  "Command Center Snapshot Strategy",
  "Employee 360 Summary Strategy",
  "Stale Snapshot Behavior",
  "Security and Privacy",
  "Deferred Items"
], "Phase 8 documentation");

for (const script of [
  "verify:background-jobs-phase7",
  "verify:large-list-table-performance",
  "verify:document-upload-acceleration-background",
  "verify:cors-request-id-hotfix",
  "verify:global-instant-performance-foundation",
  "verify:global-workspace-page-load-reduction",
  "verify:d1-query-payload-optimization"
]) {
  check(Boolean(packageJson.scripts?.[script]), `Regression verifier script is missing: ${script}`);
}
check(packageJson.scripts?.["verify:reports-imports-snapshots-phase8"] === "node scripts/verify-reports-imports-snapshots-phase8.mjs", "package.json missing verify:reports-imports-snapshots-phase8 script.");

includesAll(wrangler, [
  'binding = "DB"',
  'database_name = "hrm-v2"',
  'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"',
  'binding = "DOCUMENTS_BUCKET"',
  'bucket_name = "hrm-v2-documents"'
], "D1/R2 binding protection");
check(password.includes("MAX_WORKER_PBKDF2_ITERATIONS = 100000"), "PBKDF2 maximum iteration guard must remain 100000.");

const changedSource = [reportsRoute, dataTransfer, attendance, payroll, dashboard, reportsPage, dataTransferPage, importWizard].join("\n");
assertNoRawDialogs(changedSource, "Phase 8 changed source");
check(!/\bdark:/.test(changedSource), "Phase 8 must not introduce dark mode classes.");
check(!/public,\s*max-age/i.test(`${reportsRoute}\n${dataTransfer}\n${dashboard}`), "Authenticated HR API routes must not add public cache headers.");
check(!/localStorage\.(setItem|getItem)[\s\S]{0,160}(salary|payroll|attendance|employee|document|import)/i.test(changedSource), "Sensitive HR data must not be persisted to localStorage.");

if (failures.length) {
  console.error("Reports/imports/snapshots Phase 8 verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Reports/imports/snapshots Phase 8 verification passed.");
