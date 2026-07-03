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
  for (const value of values) check(text.includes(value), `${label} missing marker: ${value}`);
}

function sourceFiles(paths) {
  return paths.map((file) => read(file)).join("\n");
}

const backgroundJobs = read("worker/src/utils/background-jobs.ts");
const workerIndex = read("worker/src/index.ts");
const types = read("worker/src/types.ts");
const adminRoutes = read("worker/src/routes/admin.ts");
const adminPage = read("frontend/src/pages/AdminBackupRetentionPage.tsx");
const api = read("frontend/src/lib/api.ts");
const schema = read("database/schema.sql");
const wrangler = read("worker/wrangler.toml");
const password = read("worker/src/auth/password.ts");
const packageJson = JSON.parse(read("package.json") || "{}");
const phase17Docs = read("docs/performance/cloudflare-queues-phase17.md");
const runbook = read("docs/user-guides/production-operations-runbook.md");
const phase16Docs = read("docs/production/phase16-backup-restore-disaster-recovery.md");
const phase12Checklist = read("docs/production/phase12-production-readiness-checklist.md");

includesAll(types, [
  "BACKGROUND_JOB_QUEUE?: Queue<BackgroundJobQueueMessage>",
  "BackgroundJobQueueMessage",
  "job_id",
  "job_type",
  "source: \"background_jobs\""
], "worker env queue types");

includesAll(backgroundJobs, [
  "getBackgroundProcessingMode",
  "isQueueProducerEnabled",
  "isQueueConsumerEnabled",
  "getQueueRetryLimit",
  "buildSafeQueueMessage",
  "sendJobToQueueIfEnabled",
  "queue_send_failed_d1_fallback",
  "runQueuedBackgroundJobMessage",
  "handleBackgroundJobQueue",
  "runScheduledBackgroundJobs",
  "getBackgroundProcessingStatus",
  "markJobRetrying",
  "markJobDeadLettered",
  "DEAD_LETTERED",
  "QUEUE_SUPPORTED_JOB_TYPES",
  "DATA_RETENTION_CLEANUP",
  "DOCUMENT_COMPLIANCE_RECALCULATION",
  "REPORT_EXPORT",
  "DATA_IMPORT_VALIDATION",
  "ONBOARDING_READINESS_RECALCULATION",
  "ATTENDANCE_SUMMARY_RECALCULATION"
], "queue/background processing utility");

check(/buildSafeQueueMessage[\s\S]*job_id[\s\S]*job_type[\s\S]*source: "background_jobs"[\s\S]*}/.test(backgroundJobs), "Queue message builder must send only safe identifiers.");
check(!/buildSafeQueueMessage[\s\S]{0,700}payload_json/.test(backgroundJobs), "Queue message builder must not include payload_json.");
check(!/BACKGROUND_JOB_QUEUE!\.send\([^)]*payload_json/.test(backgroundJobs), "Queue send must not send raw payload_json.");
check(/await db\.prepare\([\s\S]*INSERT INTO background_jobs[\s\S]*\.run\(\);[\s\S]*sendJobToQueueIfEnabled/.test(backgroundJobs), "D1 job row must be inserted before Queue send.");
check(/catch \(error\)[\s\S]*queue_send_failed_d1_fallback/.test(backgroundJobs), "Queue send failure must fall back to D1 without losing the job.");
check(/message\.retry\(\{ delaySeconds/.test(backgroundJobs) && /message\.ack\(\)/.test(backgroundJobs), "Queue consumer must ack/retry messages explicitly.");
check(/scheduled_runner_claimed/.test(backgroundJobs), "Scheduled D1 fallback runner marker is missing.");
check(/runDataRetentionCleanup/.test(backgroundJobs), "Retention cleanup jobs must use Phase 16 retention utility.");

includesAll(workerIndex, [
  "handleBackgroundJobQueue",
  "runScheduledBackgroundJobs",
  "async queue(batch, env, ctx)",
  "async scheduled(event, env, ctx)",
  "ctx.waitUntil"
], "worker queue/scheduled handlers");

includesAll(adminRoutes, [
  "/background-processing/status",
  "getBackgroundProcessingStatus",
  "Cache-Control\", \"private, no-store",
  "admin.backup_retention.view",
  "enqueueJob(c.env.DB",
  "env: c.env",
  "queue?.queued",
  "runRetentionCleanupJob"
], "admin route queue/fallback integration");

includesAll(api, [
  "getBackgroundProcessingStatus",
  "/api/v1/admin/background-processing/status"
], "frontend API background processing status");

includesAll(adminPage, [
  "Background processing",
  "D1 remains the source of truth",
  "getBackgroundProcessingStatus",
  "Queue producer",
  "Queue consumer",
  "Scheduled runner",
  "Recent failures / dead letters"
], "admin status panel");

includesAll(schema, [
  "CREATE TABLE IF NOT EXISTS background_jobs",
  "DEAD_LETTERED"
], "schema dead-letter support");

includesAll(phase17Docs, [
  "Cloudflare Queues Phase 17",
  "D1 source of truth",
  "optional",
  "BACKGROUND_JOB_QUEUE",
  "queue_send_failed_d1_fallback",
  "dead-letter",
  "scheduled",
  "retention",
  "no secrets"
], "Phase 17 documentation");

includesAll(`${runbook}\n${phase16Docs}\n${phase12Checklist}`, [
  "Phase 17",
  "Cloudflare Queues",
  "D1 fallback"
], "operations documentation updates");

check(packageJson.scripts?.["verify:cloudflare-queues-phase17"] === "node scripts/verify-cloudflare-queues-phase17.mjs", "package script verify:cloudflare-queues-phase17 missing.");
check(packageJson.scripts?.["verify:queue-readiness-phase17"] === "node scripts/verify-queue-readiness-phase17.mjs", "package script verify:queue-readiness-phase17 missing.");
check(packageJson.scripts?.["smoke:background-processing-phase17"] === "node scripts/smoke-background-processing-phase17.mjs", "package script smoke:background-processing-phase17 missing.");
check(packageJson.scripts?.["jobs:run-local-phase17"] === "node scripts/run-background-jobs-local-phase17.mjs", "package script jobs:run-local-phase17 missing.");

includesAll(wrangler, [
  'binding = "DB"',
  'database_name = "hrm-v2"',
  'database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"',
  'binding = "DOCUMENTS_BUCKET"',
  'bucket_name = "hrm-v2-documents"'
], "D1/R2 binding protection");
check(password.includes("MAX_WORKER_PBKDF2_ITERATIONS = 100000"), "PBKDF2 guard must remain 100000.");
check(!/public,\s*max-age/i.test(sourceFiles(["worker/src/index.ts", "worker/src/routes/admin.ts", "worker/src/utils/background-jobs.ts"])), "Authenticated Worker/admin responses must not become public cached.");

const changedSurface = sourceFiles([
  "worker/src/utils/background-jobs.ts",
  "worker/src/routes/admin.ts",
  "worker/src/index.ts",
  "frontend/src/pages/AdminBackupRetentionPage.tsx"
]);
check(!/(window\.)?(alert|confirm|prompt)\s*\(/.test(changedSurface), "Browser alert/confirm/prompt must not be introduced.");
check(!/dark:/.test(changedSurface), "Dark mode classes must not be introduced.");
check(!/(R2_ACCESS_KEY|R2_SECRET|AWS_SECRET|secretAccessKey|accessKeyId)\s*[:=]\s*["'][^"']+/i.test(sourceFiles([
  "worker/src/utils/background-jobs.ts",
  "docs/performance/cloudflare-queues-phase17.md"
])), "R2/Queue secrets must not be hardcoded.");

if (failures.length) {
  console.error("Cloudflare Queues Phase 17 verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Cloudflare Queues Phase 17 verification passed.");
