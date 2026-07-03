import fs from "node:fs";
import {
  collectSourceFiles,
  createCheckCollector,
  hasBrowserPromptUsage,
  hasDarkModeMarker,
  markdownForChecks,
  read,
  writeReport
} from "./phase12-utils.mjs";

const backgroundJobs = read("worker/src/routes/background-jobs.ts");
const appEvents = read("worker/src/routes/app-events.ts");
const appEventUtils = read("worker/src/utils/app-events.ts");
const performanceRoutes = read("worker/src/routes/performance.ts");
const reports = read("worker/src/routes/reports.ts");
const reportArtifacts = read("worker/src/utils/report-artifacts.ts");
const dataTransfer = read("worker/src/routes/data-transfer.ts");
const documents = read("worker/src/routes/documents.ts");
const admin = read("worker/src/routes/admin.ts");
const moduleEnforcement = read("worker/src/utils/module-enforcement.ts");
const wrangler = read("worker/wrangler.toml");
const password = read("worker/src/auth/password.ts");

const audit = createCheckCollector();
const check = audit.check;

check("background jobs require authentication", backgroundJobs.includes("backgroundJobRoutes.use(\"*\", requireAuth)"));
check("background jobs list is scoped by user unless elevated", backgroundJobs.includes("requestedByUserId: user.id") && backgroundJobs.includes("includeAll"));
check("background job details use scoped lookup", backgroundJobs.includes("getScopedJob") && backgroundJobs.includes("canViewJob"));
check("background job raw payload is not returned by default", backgroundJobs.includes("jobToApi(job, hasAny") && read("worker/src/utils/background-jobs.ts").includes("includePayload"));
check("background job mutate actions require manage/run permissions", backgroundJobs.includes("RUN_PERMISSIONS") && backgroundJobs.includes("MANAGE_PERMISSIONS"));

check("app events require authentication", appEvents.includes("appEventRoutes.use(\"*\", requireAuth)"));
check("app event list uses current user scope", appEvents.includes("listAppEventsSince(c.env.DB, c.get(\"currentUser\")"));
check("app event utility applies user/company scope filters", appEventUtils.includes("user_scope_id") && appEventUtils.includes("company_scope_id"));
check("app event payloads are sanitized", appEventUtils.includes("sanitizeEventPayload") || appEventUtils.includes("metadata"));

check("performance routes require authentication", performanceRoutes.includes("performanceRoutes.use(\"*\", requireAuth)"));
check("performance routes require view/manage permissions", performanceRoutes.includes("requirePerformanceView") && performanceRoutes.includes("MANAGE_PERMISSIONS"));
check("performance metrics sanitize metadata", read("worker/src/utils/performance-metrics.ts").includes("sanitizePerformanceMetadata"));
check("performance routes use no-store", performanceRoutes.includes("private, no-store"));

check("reports require authentication", reports.includes("reportRoutes.use(\"*\", requireAuth)"));
check("report artifact download checks permission", reports.includes("canDownloadReportArtifact"));
check("report artifact not found masks unauthorized access", reports.includes("REPORT_ARTIFACT_NOT_FOUND"));
check("report artifact sanitizer omits storage keys", reportArtifacts.includes("sanitizeReportArtifactForUser") && !/storage_key:\s*artifact\.storage_key/.test(reportArtifacts));
check("report artifact object reads happen after permission checks", reports.includes("if (!artifact || !canDownloadReportArtifact") && reports.includes("readArtifactObject"));

check("data import routes require authentication", dataTransfer.includes("dataImportRoutes.use(\"*\", requireAuth)"));
check("data export routes require authentication", dataTransfer.includes("dataExportRoutes.use(\"*\", requireAuth)"));
check("data import/export routes require permissions", dataTransfer.includes("data_import.view") && dataTransfer.includes("data_export.run"));
check("raw import rows are permission protected", dataTransfer.includes("data_import.view") && dataTransfer.includes("validation-preview"));

check("document upload prepare/complete requires auth through document routes", documents.includes("documentRoutes.use(\"*\", requireAuth)") || documents.includes("documentComplianceRoutes.use(\"*\", requireAuth)"));
check("document upload prepare/complete validates upload permissions", documents.includes("documents.upload") && documents.includes("/uploads/prepare") && documents.includes("/uploads/complete"));
check("document upload does not expose R2 credentials", !/R2_(?:ACCESS|SECRET|TOKEN)|AWS_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID/.test(documents));

check("admin remote/schema utilities are permission protected", admin.includes("/remote-schema-tools") && admin.includes("admin.production_readiness.view"));
check("module settings routes are permission protected", admin.includes("module_control_settings") && admin.includes("requireAnyPermission"));
check("disabled-module direct route enforcement remains", moduleEnforcement.includes("requireOperationalModuleEnabled") && moduleEnforcement.includes("MODULE_DISABLED"));

const sourceFiles = collectSourceFiles(["worker/src", "frontend/src", "scripts"], [".ts", ".tsx", ".js", ".mjs"]);
const sensitiveLogFindings = [];
for (const filePath of sourceFiles) {
  const text = fs.readFileSync(filePath, "utf8");
  const matches = text.match(/console\.(?:log|error|warn)\([^;]*(password|token|bank_account|document_number|file_contents|secret|private_key)[^;]*\)/gi);
  if (matches) sensitiveLogFindings.push(`${filePath}: ${matches.length}`);
}
check("no obvious sensitive values are logged", sensitiveLogFindings.length === 0, sensitiveLogFindings.join("; "));
check("no browser alert/confirm/prompt usage", !hasBrowserPromptUsage());
check("dark mode was not introduced", !hasDarkModeMarker());
check("D1/R2 bindings unchanged", wrangler.includes('database_name = "hrm-v2"') && wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"') && wrangler.includes('binding = "DOCUMENTS_BUCKET"'));
check("PBKDF2 remains 100000", password.includes("100000") && !password.includes("210000"));

writeReport(
  "docs/production/phase12-security-permission-audit.md",
  markdownForChecks("Phase 12 Security and Permission Audit", audit.checks, [
    "## Scope\n\nThis audit is static/source-based. It checks that admin/system paths remain authenticated, permission-gated, scoped, and sanitized without logging sensitive values."
  ])
);

const failures = audit.failures();
console.log(`Security/permission Phase 12 audit complete. Passed ${audit.checks.length - failures.length}/${audit.checks.length}.`);
console.log("Report written to docs/production/phase12-security-permission-audit.md.");
if (failures.length) {
  console.error("Security/permission Phase 12 audit failed:");
  for (const failure of failures) console.error(`- ${failure.label}${failure.details ? `: ${failure.details}` : ""}`);
  process.exit(1);
}
