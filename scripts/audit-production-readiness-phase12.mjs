import {
  createCheckCollector,
  exists,
  hasBrowserPromptUsage,
  hasDarkModeMarker,
  markdownForChecks,
  packageScripts,
  read,
  writeReport
} from "./phase12-utils.mjs";

const requiredPhaseScripts = [
  "verify:global-instant-performance-foundation",
  "verify:global-workspace-page-load-reduction",
  "verify:d1-query-payload-optimization",
  "verify:document-upload-acceleration-background",
  "verify:large-list-table-performance",
  "verify:background-jobs-phase7",
  "verify:reports-imports-snapshots-phase8",
  "verify:realtime-events-phase9",
  "verify:frontend-bundle-performance-phase10",
  "verify:performance-observability-phase11"
];

const requiredFiles = [
  "scripts/verify-global-instant-performance-foundation.mjs",
  "scripts/verify-global-workspace-page-load-reduction.mjs",
  "scripts/verify-d1-query-payload-optimization.mjs",
  "scripts/verify-document-upload-acceleration-background.mjs",
  "scripts/verify-large-list-table-performance.mjs",
  "scripts/verify-background-jobs-phase7.mjs",
  "scripts/verify-reports-imports-snapshots-phase8.mjs",
  "scripts/verify-realtime-events-phase9.mjs",
  "scripts/verify-frontend-bundle-performance-phase10.mjs",
  "scripts/verify-performance-observability-phase11.mjs",
  "docs/performance/observability-phase11.md",
  "docs/performance/performance-regression-budget-phase11.md"
];

const requiredTables = [
  "document_upload_sessions",
  "background_jobs",
  "background_job_events",
  "app_events",
  "report_export_artifacts",
  "attendance_summary_snapshots",
  "payroll_summary_snapshots",
  "dashboard_summary_snapshots",
  "performance_api_metrics",
  "performance_frontend_metrics",
  "performance_job_metrics",
  "performance_build_metrics"
];

const scripts = packageScripts();
const schema = read("database/schema.sql");
const seed = read("database/seed.sql");
const index = read("worker/src/index.ts");
const workerPerformance = read("worker/src/utils/performance.ts");
const workerMiddlewarePerformance = read("worker/src/middleware/performance.ts");
const performanceRoutes = read("worker/src/routes/performance.ts");
const backgroundJobs = read("worker/src/routes/background-jobs.ts");
const appEvents = read("worker/src/routes/app-events.ts");
const reports = read("worker/src/routes/reports.ts");
const dataTransfer = read("worker/src/routes/data-transfer.ts");
const documents = read("worker/src/routes/documents.ts");
const headers = read("frontend/public/_headers");
const redirects = read("frontend/public/_redirects");
const wrangler = read("worker/wrangler.toml");
const password = read("worker/src/auth/password.ts");
const health = read("worker/src/routes/health.ts");

const audit = createCheckCollector();
const check = audit.check;

for (const scriptName of requiredPhaseScripts) {
  check(`package script exists: ${scriptName}`, Boolean(scripts[scriptName]), scripts[scriptName] ?? "missing");
}
for (const filePath of requiredFiles) {
  check(`required Phase 1-11 file exists: ${filePath}`, exists(filePath));
}
for (const table of requiredTables) {
  check(`local schema includes ${table}`, schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`));
}
check("seed includes performance metrics permissions", seed.includes("performance.metrics.view") && seed.includes("performance.metrics.manage"));

check("CORS includes x-request-id", /x-request-id/i.test(index));
check("CORS includes HRM tenant/company headers", index.includes("X-HRM-Company-Id") && index.includes("X-Tenant-Id"));
check("CORS allows production frontend origin", index.includes("https://hr.cafeasiana.com.mv"));
check("CORS sets Vary: Origin", index.includes('"Vary", "Origin"'));
check("CORS avoids wildcard credentialed origin", !/Access-Control-Allow-Origin["',\s]+\*/i.test(index));
check("OPTIONS preflight handled before route timing/auth", index.indexOf('c.req.method === "OPTIONS"') > -1 && index.indexOf('c.req.method === "OPTIONS"') < index.indexOf('app.use("*", withRouteTiming'));
check("authenticated API timing keeps private no-store", workerPerformance.includes("private, no-store") || workerMiddlewarePerformance.includes("private, no-store"));

check("static root/index are no-cache", headers.includes("/index.html") && headers.includes("no-cache"));
check("static assets are immutable", headers.includes("/assets/*") && headers.includes("max-age=31536000") && headers.includes("immutable"));
check("brand assets are immutable", headers.includes("/brand/*") && headers.includes("max-age=31536000") && headers.includes("immutable"));
check("SPA redirects do not capture assets before static rules", redirects.indexOf("/assets/*") < redirects.indexOf("/* /index.html") && redirects.indexOf("/brand/*") < redirects.indexOf("/* /index.html"));

check("performance dashboard routes require auth", performanceRoutes.includes("performanceRoutes.use(\"*\", requireAuth)"));
check("performance metrics view permissions are enforced", performanceRoutes.includes("performance.metrics.view") && performanceRoutes.includes("requirePerformanceView"));
check("performance metrics manage permissions are enforced", performanceRoutes.includes("performance.metrics.manage") && performanceRoutes.includes("MANAGE_PERMISSIONS"));
check("performance dashboard frontend checks admin permission", read("frontend/src/pages/PerformanceDashboardPage.tsx").includes("VIEW_PERMISSIONS"));

check("background job routes require auth", backgroundJobs.includes("backgroundJobRoutes.use(\"*\", requireAuth)"));
check("background job routes enforce permissions/scoping", backgroundJobs.includes("VIEW_ALL_PERMISSIONS") && backgroundJobs.includes("canViewJob") && backgroundJobs.includes("getScopedJob"));
check("app event routes require auth", appEvents.includes("appEventRoutes.use(\"*\", requireAuth)"));
check("app events are scoped via current user", appEvents.includes("listAppEventsSince(c.env.DB, c.get(\"currentUser\")"));
check("report routes require auth", reports.includes("reportRoutes.use(\"*\", requireAuth)"));
check("report artifact downloads are permission scoped", reports.includes("canDownloadReportArtifact") && reports.includes("REPORT_ARTIFACT_NOT_FOUND"));
check("report artifacts do not expose raw storage keys in API sanitizer", read("worker/src/utils/report-artifacts.ts").includes("sanitizeReportArtifactForUser") && !/storage_key:\s*artifact\.storage_key/.test(read("worker/src/utils/report-artifacts.ts")));
check("data import/export routes require auth", dataTransfer.includes("dataImportRoutes.use(\"*\", requireAuth)") && dataTransfer.includes("dataExportRoutes.use(\"*\", requireAuth)"));
check("data import/export routes enforce permissions", dataTransfer.includes("requireAnyPermission") && dataTransfer.includes("data_import.") && dataTransfer.includes("data_export."));
check("document prepare/complete routes require upload permission", documents.includes("/uploads/prepare") && documents.includes("/uploads/complete") && documents.includes("documents.upload"));
check("disabled module direct-route enforcement remains", exists("worker/src/utils/module-enforcement.ts") && read("worker/src/utils/module-enforcement.ts").includes("requireOperationalModuleEnabled"));
check("health endpoint is safe and no-store", health.includes("Cache-Control") && health.includes("private, no-store") && health.includes("SELECT 1 AS ok") && !health.includes("c.env.CORS_ORIGIN"));

check("D1 binding name unchanged", wrangler.includes('binding = "DB"') && wrangler.includes('database_name = "hrm-v2"') && wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'));
check("R2 binding name unchanged", wrangler.includes('binding = "DOCUMENTS_BUCKET"') && wrangler.includes('bucket_name = "hrm-v2-documents"'));
check("PBKDF2 remains 100000", password.includes("100000") && !password.includes("210000"));
check("no browser alert/confirm/prompt usage", !hasBrowserPromptUsage());
check("dark mode was not introduced", !hasDarkModeMarker());

const report = markdownForChecks("Phase 12 Production Readiness Audit", audit.checks, [
  "## Scope\n\nThis audit checks source-controlled readiness markers only. It does not include secrets or production sample data.",
  "## ZIP Cleanup Rules\n\nThe final package must exclude `.git/`, `node_modules/`, `.wrangler/`, `dist/`, `build/`, `.cache/`, `.turbo/`, `coverage/`, `*.log`, nested ZIP files, env files, and secret-like files. ZIP entries must use forward slashes."
]);
writeReport("docs/production/phase12-production-readiness-audit.md", report);

const deploymentChecks = audit.checks.filter((item) =>
  /CORS|static|assets|SPA|origin|no-store|health|D1 binding|R2 binding|PBKDF2/.test(item.label)
);
writeReport(
  "docs/production/phase12-deployment-config-audit.md",
  markdownForChecks("Phase 12 Deployment Config Audit", deploymentChecks, [
    "## Production Domains\n\nFrontend: `https://hr.cafeasiana.com.mv`\n\nAPI: `https://hr.api.cafeasiana.com.mv`",
    "## Notes\n\nThis report is generated from source configuration. Remote Cloudflare dashboard settings should be verified during deployment review."
  ])
);

const failures = audit.failures();
console.log(`Production readiness Phase 12 audit complete. Passed ${audit.checks.length - failures.length}/${audit.checks.length}.`);
console.log("Reports written to docs/production/phase12-production-readiness-audit.md and docs/production/phase12-deployment-config-audit.md.");
if (failures.length) {
  console.error("Production readiness Phase 12 audit failed:");
  for (const failure of failures) console.error(`- ${failure.label}${failure.details ? `: ${failure.details}` : ""}`);
  process.exit(1);
}
