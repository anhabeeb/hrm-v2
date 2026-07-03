import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(file) {
  const target = path.join(root, file);
  if (!fs.existsSync(target)) {
    failures.push(`${file} is missing`);
    return "";
  }
  return fs.readFileSync(target, "utf8");
}

function exists(file, message) {
  if (!fs.existsSync(path.join(root, file))) failures.push(message ?? `${file} is missing`);
}

function includes(file, marker, message) {
  const content = read(file);
  if (!content.includes(marker)) failures.push(message);
}

function matches(file, regex, message) {
  const content = read(file);
  if (!regex.test(content)) failures.push(message);
}

function excludes(file, regex, message) {
  const content = read(file);
  if (regex.test(content)) failures.push(message);
}

const packageJson = JSON.parse(read("package.json") || "{}");
const schema = read("database/schema.sql");
const wrangler = read("worker/wrangler.toml");

for (const table of [
  "performance_api_metrics",
  "performance_frontend_metrics",
  "performance_job_metrics",
  "performance_build_metrics"
]) {
  if (!schema.includes(`CREATE TABLE IF NOT EXISTS ${table}`)) failures.push(`${table} schema table is missing`);
}

for (const index of [
  "idx_performance_api_route_created",
  "idx_performance_api_route_duration",
  "idx_performance_frontend_route_type_created",
  "idx_performance_frontend_type_created",
  "idx_performance_job_type_status_created",
  "idx_performance_build_label_created"
]) {
  if (!schema.includes(index)) failures.push(`${index} safe index is missing`);
}

includes("database/seed.sql", "performance.metrics.view", "performance metrics view permission must be seeded");
includes("database/seed.sql", "performance.metrics.manage", "performance metrics manage permission must be seeded");
includes("worker/src/db/permissions.ts", "performance.metrics.view", "performance metrics permission must be in permission registry");

exists("worker/src/utils/performance-metrics.ts", "backend metrics writer is missing");
includes("worker/src/utils/performance-metrics.ts", "sanitizePerformanceRouteKey", "backend metrics writer must sanitize route keys");
includes("worker/src/utils/performance-metrics.ts", "SENSITIVE_METADATA_KEY", "backend metrics writer must guard sensitive metadata");
includes("worker/src/utils/performance-metrics.ts", "recordApiPerformanceMetric", "API performance metric writer is missing");
includes("worker/src/utils/performance-metrics.ts", "recordFrontendPerformanceMetrics", "frontend performance metric writer is missing");
includes("worker/src/utils/performance-metrics.ts", "recordJobPerformanceMetric", "job performance metric writer is missing");
includes("worker/src/utils/performance-metrics.ts", "cleanupPerformanceMetrics", "metrics retention cleanup utility is missing");
matches("worker/src/utils/performance-metrics.ts", /catch\s*\([^)]*\)\s*\{[\s\S]*metric_write_failed|catch\s*\{[\s\S]*best-effort/i, "metrics write failures must be best-effort and non-blocking");
excludes("worker/src/utils/performance-metrics.ts", /request_body|response_body|password_hash|raw_token|document_contents|bank_account_number|net_salary|gross_salary/i, "metrics writer must not capture sensitive bodies or payroll/bank values");

includes("worker/src/utils/performance.ts", "recordApiPerformanceMetric", "existing request timing middleware must write sampled API metrics");
includes("worker/src/utils/performance.ts", "Server-Timing", "Server-Timing instrumentation must remain");
includes("worker/src/utils/performance.ts", "X-Request-Id", "request id instrumentation must remain");
includes("worker/src/utils/performance.ts", "private, no-store", "authenticated API no-store behavior must remain");
includes("worker/src/routes/performance.ts", "performanceRoutes", "performance API routes are missing");
includes("worker/src/routes/performance.ts", "requireAuth", "performance routes must require authentication");
includes("worker/src/routes/performance.ts", "performance.metrics.view", "performance dashboard routes must be permission protected");
includes("worker/src/routes/performance.ts", "parsePaginationParams", "performance lists must be paginated");
includes("worker/src/routes/performance.ts", "Cache-Control\", \"private, no-store", "performance API output must not be public cached");
includes("worker/src/index.ts", "/api/v1/performance", "performance routes must be mounted");

exists("frontend/src/lib/performanceMetrics.ts", "frontend metrics collector is missing");
includes("frontend/src/lib/performanceMetrics.ts", "enqueueFrontendMetric", "frontend metrics queue is missing");
includes("frontend/src/lib/performanceMetrics.ts", "flushPerformanceMetrics", "frontend metrics flush is missing");
includes("frontend/src/lib/performanceMetrics.ts", "SENSITIVE_METADATA_KEY", "frontend metrics must sanitize sensitive metadata");
includes("frontend/src/lib/performanceMetrics.ts", "catch", "frontend metrics failure must be swallowed");
excludes("frontend/src/lib/performanceMetrics.ts", /localStorage\.setItem|sessionStorage\.setItem/i, "frontend metrics must not persist metric data");
includes("frontend/src/lib/performanceMetrics.ts", "SENSITIVE_METADATA_KEY", "frontend metrics must actively filter sensitive keys");
includes("frontend/src/hooks/useRoutePerformanceMetrics.ts", "ROUTE_LOAD", "route performance hook must collect route load metrics");
includes("frontend/src/hooks/useInteractionPerformance.ts", "recordInteractionMetric", "interaction performance hook is missing");
includes("frontend/src/lib/performance.ts", "enqueueMetricSafely", "existing frontend performance helpers must feed collector safely");

exists("frontend/src/pages/PerformanceDashboardPage.tsx", "admin performance dashboard page is missing");
includes("frontend/src/pages/PerformanceDashboardPage.tsx", "Performance Observability", "performance dashboard title is missing");
includes("frontend/src/pages/PerformanceDashboardPage.tsx", "PermissionDeniedState", "performance dashboard must guard unauthorized users");
includes("frontend/src/pages/PerformanceDashboardPage.tsx", "StandardTabs", "dashboard must provide compact section navigation");
includes("frontend/src/pages/PerformanceDashboardPage.tsx", "Table", "dashboard must use table-first lists");
includes("frontend/src/pages/PerformanceDashboardPage.tsx", "limit: 25", "dashboard must use paginated server-side lists");
excludes("frontend/src/pages/PerformanceDashboardPage.tsx", /request_body|response_body|password|bank account|document number|net salary|gross salary/i, "dashboard must not expose sensitive payload fields");
includes("frontend/src/routes/AppRoutes.tsx", "settings/performance", "settings performance route is missing");
includes("frontend/src/layouts/AppShell.tsx", "performance.metrics.view", "sidebar performance link must respect permissions");
includes("frontend/src/layouts/AppShell.tsx", "useRoutePerformanceMetrics", "app shell must register route metrics hook");

exists("scripts/audit-performance-regression-budget.mjs", "performance regression budget audit script is missing");
includes("scripts/audit-performance-regression-budget.mjs", "frontend bundle budgets", "budget audit must check bundle budgets");
includes("scripts/audit-performance-regression-budget.mjs", "payload warning helpers", "budget audit must check payload warning helpers");
includes("scripts/audit-performance-regression-budget.mjs", "performance dashboard route", "budget audit must check dashboard route protection");
exists("docs/performance/observability-phase11.md", "Phase 11 performance observability documentation is missing");
includes("docs/performance/observability-phase11.md", "Retention", "Phase 11 docs must document retention");
matches("docs/performance/observability-phase11.md", /Sensitive Data/i, "Phase 11 docs must document sensitive-data restrictions");

if (packageJson.scripts?.["verify:performance-observability-phase11"] !== "node scripts/verify-performance-observability-phase11.mjs") failures.push("verify:performance-observability-phase11 script is missing");
if (packageJson.scripts?.["audit:performance-regression-budget"] !== "node scripts/audit-performance-regression-budget.mjs") failures.push("audit:performance-regression-budget script is missing");

for (const script of [
  "verify:frontend-bundle-performance-phase10",
  "verify:realtime-events-phase9",
  "verify:reports-imports-snapshots-phase8",
  "verify:background-jobs-phase7",
  "verify:large-list-table-performance",
  "verify:document-upload-acceleration-background",
  "verify:cors-request-id-hotfix",
  "verify:global-instant-performance-foundation",
  "verify:global-workspace-page-load-reduction",
  "verify:d1-query-payload-optimization"
]) {
  if (!packageJson.scripts?.[script]) failures.push(`${script} regression verifier script is missing`);
}

if (!wrangler.includes('binding = "DB"') || !wrangler.includes('database_name = "hrm-v2"') || !wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"')) failures.push("D1 binding changed");
if (!wrangler.includes('binding = "DOCUMENTS_BUCKET"') || !wrangler.includes('bucket_name = "hrm-v2-documents"')) failures.push("R2 binding changed");
includes("worker/src/auth/password.ts", "100000", "PBKDF2 iterations must remain 100000");

for (const file of [
  "frontend/src/pages/PerformanceDashboardPage.tsx",
  "frontend/src/lib/performanceMetrics.ts",
  "frontend/src/hooks/useRoutePerformanceMetrics.ts"
]) {
  excludes(file, /\b(window\.)?(alert|confirm|prompt)\s*\(/, `${file} must not use browser alert/confirm/prompt`);
  excludes(file, /\bdark:/, `${file} must not add dark mode classes`);
}

if (failures.length) {
  console.error("Performance observability Phase 11 verification failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Performance observability Phase 11 verification passed.");
