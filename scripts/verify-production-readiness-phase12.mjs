import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  createCheckCollector,
  exists,
  hasBrowserPromptUsage,
  hasDarkModeMarker,
  packageScripts,
  projectPath,
  read,
  rootDir,
  validateZipListingFromText
} from "./phase12-utils.mjs";

const scripts = packageScripts();
const audit = createCheckCollector();
const check = audit.check;

const requiredScripts = {
  "audit:production-readiness-phase12": "scripts/audit-production-readiness-phase12.mjs",
  "verify:production-remote-schema-phase12": "scripts/verify-production-remote-schema-phase12.mjs",
  "audit:security-permissions-phase12": "scripts/audit-security-permissions-phase12.mjs",
  "smoke:production-deployment-phase12": "scripts/smoke-production-deployment-phase12.mjs",
  "loadtest:production-readiness-phase12": "scripts/load-test-production-readiness-phase12.mjs"
};

for (const [scriptName, filePath] of Object.entries(requiredScripts)) {
  check(`package script exists: ${scriptName}`, Boolean(scripts[scriptName]), scripts[scriptName] ?? "missing");
  check(`script file exists: ${filePath}`, exists(filePath));
}

for (const scriptName of [
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
]) {
  check(`Phase 1-11 package script remains: ${scriptName}`, Boolean(scripts[scriptName]));
}

for (const docPath of [
  "docs/production/phase12-production-readiness-checklist.md",
  "docs/production/phase12-backup-rollback-runbook.md",
  "docs/production/phase12-deployment-manifest.md"
]) {
  check(`production readiness doc exists: ${docPath}`, exists(docPath));
}

const index = read("worker/src/index.ts");
const health = read("worker/src/routes/health.ts");
const performanceRoutes = read("worker/src/routes/performance.ts");
const backgroundJobs = read("worker/src/routes/background-jobs.ts");
const appEvents = read("worker/src/routes/app-events.ts");
const appEventUtils = read("worker/src/utils/app-events.ts");
const reports = read("worker/src/routes/reports.ts");
const reportArtifacts = read("worker/src/utils/report-artifacts.ts");
const performanceMetrics = read("worker/src/utils/performance-metrics.ts");
const workerPerformance = read("worker/src/utils/performance.ts") + "\n" + read("worker/src/middleware/performance.ts");
const smokeScript = read("scripts/smoke-production-deployment-phase12.mjs");
const loadScript = read("scripts/load-test-production-readiness-phase12.mjs");
const runbook = read("docs/production/phase12-backup-rollback-runbook.md");
const wrangler = read("worker/wrangler.toml");
const password = read("worker/src/auth/password.ts");

check("health endpoint is mounted", index.includes('app.route("/api/v1/health", healthRoutes)'));
check("health endpoint is no-store", health.includes("private, no-store"));
check("health endpoint reports timestamp", health.includes("timestamp"));
check("health endpoint checks D1 safely", health.includes("SELECT 1 AS ok"));
check("health endpoint does not expose env values", !health.includes("c.env.CORS_ORIGIN") && !health.includes("database_id"));

check("CORS request-id hotfix remains", /x-request-id/i.test(index) && index.includes("X-Request-Id"));
check("OPTIONS handled before route timing/auth", index.indexOf('c.req.method === "OPTIONS"') > -1 && index.indexOf('c.req.method === "OPTIONS"') < index.indexOf('app.use("*", withRouteTiming'));
check("production origin remains allowed", index.includes("https://hr.cafeasiana.com.mv"));
check("Vary Origin remains set", index.includes('"Vary", "Origin"'));
check("wildcard origin is not used with credentials", !/Access-Control-Allow-Origin["',\s]+\*/i.test(index));
check("authenticated API stays private/no-store", workerPerformance.includes("private, no-store"));

check("performance dashboard is admin/performance permission gated", performanceRoutes.includes("requirePerformanceView") && performanceRoutes.includes("performance.metrics.view"));
check("performance metrics do not expose sensitive metadata", performanceMetrics.includes("SENSITIVE_METADATA_KEY") && performanceMetrics.includes("sanitizePerformanceMetadata"));
check("background job routes are auth protected", backgroundJobs.includes("backgroundJobRoutes.use(\"*\", requireAuth)"));
check("background job routes are permission/scoped", backgroundJobs.includes("VIEW_ALL_PERMISSIONS") && backgroundJobs.includes("getScopedJob"));
check("app event endpoints are authenticated", appEvents.includes("appEventRoutes.use(\"*\", requireAuth)"));
check("app event endpoints are scoped", appEventUtils.includes("user_scope_id") && appEventUtils.includes("company_scope_id"));
check("report artifacts are permission protected", reports.includes("canDownloadReportArtifact") && reports.includes("REPORT_ARTIFACT_NOT_FOUND"));
check("report artifact sanitizer does not expose storage key", reportArtifacts.includes("sanitizeReportArtifactForUser") && !/storage_key:\s*artifact\.storage_key/.test(reportArtifacts));

check("load test writes are disabled by default", loadScript.includes("HRM_LOADTEST_ENABLE_WRITES") && /enableWrites\s*=/.test(loadScript) && loadScript.includes("read-only"));
check("load test does not hardcode credentials", !/password\s*[:=]\s*["'][^"']+["']|Bearer\s+[A-Za-z0-9_.-]{12,}/i.test(loadScript));
check("smoke script does not hardcode credentials", !/password\s*[:=]\s*["'][^"']+["']|Bearer\s+[A-Za-z0-9_.-]{12,}/i.test(smokeScript));
check("smoke script skips safely without env URLs", smokeScript.includes("HRM_PROD_FRONTEND_URL") && smokeScript.includes("SKIPPED"));
check("backup/rollback runbook contains no secret-looking values", !/(AKIA[0-9A-Z]{16}|-----BEGIN|password=|token=|secret=)/i.test(runbook));

check("no browser alert/confirm/prompt usage", !hasBrowserPromptUsage());
check("dark mode was not introduced", !hasDarkModeMarker());
check("D1 binding unchanged", wrangler.includes('binding = "DB"') && wrangler.includes('database_name = "hrm-v2"') && wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'));
check("R2 binding unchanged", wrangler.includes('binding = "DOCUMENTS_BUCKET"') && wrangler.includes('bucket_name = "hrm-v2-documents"'));
check("PBKDF2 remains 100000", password.includes("100000") && !password.includes("210000"));

const finalZip = projectPath("HRM-v2-production-readiness-phase12-clean.zip");
if (fs.existsSync(finalZip)) {
  const result = spawnSync("tar", ["-tf", finalZip], { cwd: rootDir, encoding: "utf8", shell: false });
  check("final ZIP listing can be read", result.status === 0, result.stderr);
  const badZipEntries = validateZipListingFromText(result.stdout);
  check("final ZIP has forward slash paths and no forbidden entries", badZipEntries.length === 0, badZipEntries.join("; "));
} else {
  check("final ZIP validation deferred until packaging", true, "HRM-v2-production-readiness-phase12-clean.zip is not present yet.");
}

const failures = audit.failures();
if (failures.length) {
  console.error("Production readiness Phase 12 verification failed:");
  for (const failure of failures) console.error(`- ${failure.label}${failure.details ? `: ${failure.details}` : ""}`);
  process.exit(1);
}

console.log(`Production readiness Phase 12 verification passed. Checks: ${audit.checks.length}.`);
