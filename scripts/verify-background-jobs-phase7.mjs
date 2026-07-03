import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    failures.push(`Missing required file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolute, "utf8");
}

function check(condition, message) {
  if (!condition) failures.push(message);
}

function includesAll(text, values, label) {
  for (const value of values) {
    check(text.includes(value), `${label} missing marker: ${value}`);
  }
}

const schema = read("database/schema.sql");
const seed = read("database/seed.sql");
const wrangler = read("worker/wrangler.toml");
const password = read("worker/src/auth/password.ts");
const jobService = read("worker/src/utils/background-jobs.ts");
const jobRoutes = read("worker/src/routes/background-jobs.ts");
const index = read("worker/src/index.ts");
const documentCompliance = read("worker/src/routes/document-compliance.ts");
const documents = read("worker/src/routes/documents.ts");
const attendance = read("worker/src/routes/attendance.ts");
const appShell = read("frontend/src/layouts/AppShell.tsx");
const jobApi = read("frontend/src/lib/backgroundJobsApi.ts");
const jobHooks = `${read("frontend/src/hooks/useBackgroundJobs.ts")}\n${read("frontend/src/hooks/useBackgroundJob.ts")}`;
const jobComponents = `${read("frontend/src/components/jobs/BackgroundJobIndicator.tsx")}\n${read("frontend/src/components/jobs/BackgroundJobDrawer.tsx")}\n${read("frontend/src/components/jobs/BackgroundJobProgress.tsx")}`;
const invalidation = read("frontend/src/lib/workspaceInvalidation.ts");
const docs = read("docs/performance/background-jobs-phase7.md");
const packageJson = JSON.parse(read("package.json") || "{}");

includesAll(schema, [
  "CREATE TABLE IF NOT EXISTS background_jobs",
  "CREATE TABLE IF NOT EXISTS background_job_events",
  "idx_background_jobs_status_scheduled",
  "idx_background_jobs_type_status",
  "idx_background_jobs_requested_by",
  "idx_background_jobs_entity",
  "idx_background_jobs_dedupe_key",
  "idx_background_job_events_job_created",
  "CHECK (status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'RETRYING', 'DEAD_LETTERED'))"
], "background job schema");

includesAll(seed, [
  "background_jobs.view",
  "background_jobs.manage",
  "background_jobs.run"
], "permission seed");

includesAll(jobService, [
  "enqueueJob",
  "getJob",
  "listJobs",
  "claimNextJob",
  "markJobRunning",
  "updateJobProgress",
  "appendJobEvent",
  "markJobSucceeded",
  "markJobFailed",
  "retryJob",
  "cancelJob",
  "runJobByType",
  "markJobDeadLettered",
  "dedupe_key = ? AND status IN ('QUEUED', 'RUNNING', 'RETRYING')",
  "sanitizeJobPayload",
  "SENSITIVE_PAYLOAD_KEY",
  "runJobWithWaitUntil"
], "background job service");

includesAll(jobRoutes, [
  "GET /api/v1/background-jobs",
  "backgroundJobRoutes.get(\"/\"",
  "backgroundJobRoutes.get(\"/:jobId\"",
  "backgroundJobRoutes.post(\"/:jobId/retry\"",
  "backgroundJobRoutes.post(\"/:jobId/cancel\"",
  "backgroundJobRoutes.post(\"/:jobId/run\"",
  "backgroundJobRoutes.post(\"/run-next\"",
  "parsePaginationParams",
  "paginationMeta",
  "Cache-Control\", \"private, no-store",
  "RUN_PERMISSIONS",
  "canViewJob",
  "canManageJob",
  "jobToApi"
], "background job routes");

check(index.includes("backgroundJobRoutes") && index.includes("/api/v1/background-jobs"), "Worker index must mount background job routes.");

includesAll(documentCompliance, [
  "DOCUMENT_COMPLIANCE_RECALCULATION",
  "DOCUMENT_EXPIRY_ALERT_GENERATION",
  "enqueueJob",
  "runTrackedDocumentJob",
  "return ok(c, { job_id: job.id"
], "document compliance migration");
check(!/documentComplianceRoutes\.post\("\/compliance\/refresh"[\s\S]*?const result = await refreshAllDocumentComplianceSnapshots[\s\S]*?return ok\(c, \{ \.\.\.result, alerts \}\);/.test(documentCompliance), "Document compliance refresh must not remain only blocking/synchronous.");

includesAll(documents, [
  "ONBOARDING_READINESS_RECALCULATION",
  "enqueueUploadFollowUpJob",
  "background_job_ids",
  "targeted_workspace_slices",
  "completeDocumentUploadSessions",
  "runJobWithWaitUntil"
], "onboarding upload/readiness migration");

includesAll(attendance, [
  "ATTENDANCE_SUMMARY_RECALCULATION",
  "runTrackedAttendanceJob",
  "return ok(c, { job_id: job.id",
  "enqueueJob"
], "attendance refresh migration");

includesAll(jobApi, [
  "backgroundJobsApi",
  "/api/v1/background-jobs",
  "retry",
  "cancel"
], "frontend background jobs API");

includesAll(jobHooks, [
  "useQuery",
  "refetchInterval",
  "hasActiveBackgroundJobs",
  "TERMINAL_STATUSES"
], "frontend background job hooks");

includesAll(jobComponents, [
  "BackgroundJobIndicator",
  "BackgroundJobDrawer",
  "BackgroundJobProgress",
  "Retry",
  "Cancel",
  "showSuccess",
  "showError"
], "frontend background job components");

check(appShell.includes("BackgroundJobIndicator") && appShell.includes("<BackgroundJobIndicator />"), "AppShell must render the background job indicator in the header.");
check(invalidation.includes("invalidateBackgroundJobTargets"), "Targeted background job invalidation helper is missing.");
check(!invalidation.includes("invalidateQueries({ queryKey: queryKeys.scope(scope) })"), "Background job completion must not invalidate all global app data.");
includesAll(invalidation, ["workspaceSlice", "document-checklist", "attendance", "reports", "data_import"], "targeted invalidation");

includesAll(docs, [
  "Report generation/export preparation and import validation/apply",
  "deferred",
  "Cloudflare Queues",
  "Dedupe Strategy",
  "Security and Privacy"
], "background jobs documentation");

check(packageJson.scripts?.["verify:background-jobs-phase7"] === "node scripts/verify-background-jobs-phase7.mjs", "package.json missing verify:background-jobs-phase7 script.");

includesAll(wrangler, [
  'binding = "DB"',
  'database_name = "hrm-v2"',
  'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"',
  'binding = "DOCUMENTS_BUCKET"',
  'bucket_name = "hrm-v2-documents"'
], "D1/R2 binding protection");
check(password.includes("MAX_WORKER_PBKDF2_ITERATIONS = 100000"), "PBKDF2 maximum iteration guard must remain 100000.");

const sourceFiles = [
  jobService,
  jobRoutes,
  jobApi,
  jobHooks,
  jobComponents,
  appShell
].join("\n");
check(!/(window\.)?(alert|confirm|prompt)\s*\(/.test(sourceFiles), "Browser alert/confirm/prompt must not be introduced.");
check(!/dark:/.test(sourceFiles), "Dark mode classes must not be introduced.");
check(!/payload_json[\s\S]{0,80}return ok/.test(jobRoutes), "Job payload_json must not be exposed directly in API responses.");
check(!/localStorage/.test(jobComponents), "Sensitive job state must not be persisted to localStorage.");

if (failures.length) {
  console.error("Background jobs Phase 7 verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Background jobs Phase 7 verification passed.");
