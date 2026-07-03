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

const backgroundJobs = read("worker/src/utils/background-jobs.ts");
const docs = read("docs/performance/cloudflare-queues-phase17.md");
const wrangler = read("worker/wrangler.toml");
const packageJson = JSON.parse(read("package.json") || "{}");

check(backgroundJobs.includes("getBackgroundProcessingMode") && backgroundJobs.includes("return \"d1\" as const"), "D1 fallback mode must be explicit.");
check(backgroundJobs.includes("BACKGROUND_JOB_QUEUE") && backgroundJobs.includes("queue_binding_configured"), "Queue readiness must report binding configuration.");
check(backgroundJobs.includes("HRM_QUEUE_ENABLED") && backgroundJobs.includes("HRM_BACKGROUND_JOB_MODE"), "Queue readiness must be feature-flagged.");
check(backgroundJobs.includes("HRM_QUEUE_CONSUMER_ENABLED"), "Queue consumer must be independently disableable.");
check(backgroundJobs.includes("HRM_SCHEDULED_JOB_RUNNER_ENABLED"), "Scheduled fallback runner must be independently disableable.");
check(backgroundJobs.includes("getBackgroundProcessingStatus"), "Background processing status helper missing.");
check(backgroundJobs.includes("safe_message_fields") && backgroundJobs.includes("sensitive_payloads_sent_to_queue: false"), "Status response must document safe queue message fields.");
check(backgroundJobs.includes("QUEUE_SUPPORTED_JOB_TYPES"), "Supported queue job type list missing.");
check(backgroundJobs.includes("retryDelaySeconds") && backgroundJobs.includes("markJobDeadLettered"), "Retry/backoff/dead-letter readiness missing.");
check(backgroundJobs.includes("queue_send_failed_d1_fallback"), "Queue send fallback event missing.");
check(backgroundJobs.includes("scheduled_runner_completed"), "Scheduled runner completion marker missing.");

check(!/\[\[queues\.producers\]\]/.test(wrangler), "Queue binding must remain optional; do not enable production Queue binding in wrangler.toml without operator setup.");
check(docs.includes("[[queues.producers]]") && docs.includes("[[queues.consumers]]"), "Docs must show optional Queue binding snippets.");
check(docs.includes("Queue mode is disabled unless") && docs.includes("HRM_QUEUE_ENABLED"), "Docs must explain feature flags.");
check(docs.includes("No raw payload_json") && docs.includes("job_id"), "Docs must state safe message envelope.");

check(packageJson.scripts?.["jobs:run-local-phase17"] === "node scripts/run-background-jobs-local-phase17.mjs", "Local runner script missing.");
check(packageJson.scripts?.["smoke:background-processing-phase17"] === "node scripts/smoke-background-processing-phase17.mjs", "Background processing smoke script missing.");

if (failures.length) {
  console.error("Queue readiness Phase 17 verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Queue readiness Phase 17 verification passed.");
