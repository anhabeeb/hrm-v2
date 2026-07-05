import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function check(label, condition) {
  if (!condition) failures.push(label);
}

const lifecycle = read("worker/src/routes/lifecycle.ts");
const backgroundJobs = read("worker/src/utils/background-jobs.ts");
const backgroundJobRoutes = read("worker/src/routes/background-jobs.ts");
const lifecyclePage = read("frontend/src/pages/LifecyclePage.tsx");
const api = read("frontend/src/lib/api.ts");
const packageJson = JSON.parse(read("package.json"));
const diagnostic = read("scripts/diagnose-onboarding-readiness-stuck-job.mjs");
const wrangler = read("worker/wrangler.toml");
const schema = read("database/schema.sql");

check("package.json registers stuck-job verifier", packageJson.scripts?.["verify:onboarding-readiness-stuck-job-hotfix"] === "node scripts/verify-onboarding-readiness-stuck-job-hotfix.mjs");
check("package.json registers stuck-job diagnostic", packageJson.scripts?.["diagnose:onboarding-readiness-stuck-job"] === "node scripts/diagnose-onboarding-readiness-stuck-job.mjs");

check("backend defines warning and max runtime thresholds", lifecycle.includes("ONBOARDING_READINESS_REFRESH_WARNING_MS = 60_000") && lifecycle.includes("ONBOARDING_READINESS_REFRESH_MAX_RUNNING_MS = 180_000"));
check("backend defines bounded section timeout", lifecycle.includes("ONBOARDING_READINESS_SECTION_TIMEOUT_MS = 8_000") && lifecycle.includes("runOptionalSectionWithTimeout"));
check("backend uses four readiness progress phases", lifecycle.includes("progressTotal: 4") && lifecycle.includes("Preparing readiness refresh.") && lifecycle.includes("Checking onboarding readiness sections.") && lifecycle.includes("Saving readiness result.") && lifecycle.includes("Publishing readiness update."));
check("backend detects stale queued/running readiness jobs", lifecycle.includes("isStaleOnboardingReadinessJob") && lifecycle.includes("heartbeat_age_ms") && lifecycle.includes("ONBOARDING_READINESS_REFRESH_MAX_RUNNING_MS"));
check("backend recovers stale running readiness jobs as failed", lifecycle.includes("recoverStaleOnboardingReadinessJob") && lifecycle.includes("stale_running_job") && lifecycle.includes("markJobFailed(c.env.DB, job!.id"));
check("backend active refresh payload exposes runtime/stale fields", lifecycle.includes("runtime_ms") && lifecycle.includes("heartbeat_age_ms") && lifecycle.includes("warning_after_ms") && lifecycle.includes("max_runtime_ms") && lifecycle.includes("is_stale"));

const runJobByTypeBody = backgroundJobs.slice(backgroundJobs.indexOf("export async function runJobByType"), backgroundJobs.indexOf("function isQueueMessage"));
const queueRefreshBody = lifecycle.slice(lifecycle.indexOf("async function queueOnboardingReadinessRefresh"), lifecycle.indexOf("type OnboardingFastSaveInput"));
const durableRunnerStart = lifecycle.indexOf("export async function runOnboardingReadinessRecalculationJob");
const durableRunnerEnd = lifecycle.indexOf('registerBackgroundJobRunner("ONBOARDING_READINESS_RECALCULATION"', durableRunnerStart);
const durableRunnerBody = lifecycle.slice(durableRunnerStart, durableRunnerEnd);

check("background runner registry exists for durable job dispatch", backgroundJobs.includes("registerBackgroundJobRunner") && lifecycle.includes('registerBackgroundJobRunner("ONBOARDING_READINESS_RECALCULATION", runOnboardingReadinessRecalculationJob)'));
check("runJobByType explicitly handles readiness jobs", runJobByTypeBody.includes("ONBOARDING_READINESS_JOB_TYPE") && runJobByTypeBody.includes("READINESS_BACKGROUND_RUNNER_FAILED") && runJobByTypeBody.includes("BACKGROUND_JOB_RUNNERS.get(job.job_type)"));
check("generic fallback cannot falsely succeed readiness jobs", runJobByTypeBody.indexOf("if (job.job_type === ONBOARDING_READINESS_JOB_TYPE)") > -1 && runJobByTypeBody.indexOf("if (job.job_type === ONBOARDING_READINESS_JOB_TYPE)") < runJobByTypeBody.indexOf("await markJobRunning(db, job.id, \"Running background job.\")"));
check("durable runner calculates real readiness before success", durableRunnerBody.includes("refreshWorkspaceReadiness(internalContext") && durableRunnerBody.includes("markJobSucceeded(env.DB, job.id") && durableRunnerBody.indexOf("refreshWorkspaceReadiness(internalContext") < durableRunnerBody.indexOf("markJobSucceeded(env.DB, job.id"));
check("readiness runner is independent of live Hono request context", durableRunnerBody.includes("env: Env") && durableRunnerBody.includes("internalLifecycleContext(env, actor, requestId)") && !durableRunnerBody.includes("c.req") && !durableRunnerBody.includes("c.get(\"currentUser\")"));
check("readiness job dedupe key is stable per case", queueRefreshBody.includes("const dedupeKey = `onboarding_readiness:${caseId}`") && !/dedupeKey:\s*`onboarding_readiness:\$\{caseId\}:\$\{state\.jobId\}/.test(lifecycle));
check("readiness D1 active dedupe recovers stale jobs", backgroundJobs.includes("WHERE dedupe_key = ?") && backgroundJobs.includes("status IN ('QUEUED', 'RUNNING', 'RETRYING')") && backgroundJobs.includes("recoverStaleOnboardingReadinessBackgroundJob(db, existing"));
check("queue consumer runs real readiness recalculation", backgroundJobs.includes("runQueuedBackgroundJobMessage") && backgroundJobs.includes("runJobByType(env, claimed)") && backgroundJobs.includes("recoverStaleOnboardingReadinessBackgroundJob(env.DB, existing"));
check("scheduled D1 fallback runs real readiness recalculation", backgroundJobs.includes("runScheduledBackgroundJobs") && backgroundJobs.includes("await runJobByType(env, job)"));
check("save path starts D1 fallback with durable runner only after commit", lifecycle.includes("startOnboardingReadinessJobFallback") && lifecycle.includes("d1_fallback_after_save_commit") && lifecycle.includes("dispatchImmediately?: boolean"));
check("background job list/detail recover stale readiness jobs", backgroundJobRoutes.includes("recoverStaleOnboardingReadinessBackgroundJobs") && backgroundJobRoutes.includes("recoverStaleOnboardingReadinessBackgroundJob"));

const failureCodes = [
  "READINESS_JOB_TIMEOUT",
  "READINESS_SECTION_TIMEOUT",
  "READINESS_SECTION_FAILED",
  "READINESS_PERMISSION_CONTEXT_FAILED",
  "READINESS_MODULE_CONFIG_FAILED",
  "READINESS_DOCUMENT_RULES_FAILED",
  "READINESS_PAYROLL_VALIDATION_FAILED",
  "READINESS_PAYMENT_VALIDATION_FAILED",
  "READINESS_PENSION_VALIDATION_FAILED",
  "READINESS_USER_ACCESS_FAILED",
  "READINESS_BACKGROUND_RUNNER_FAILED",
  "READINESS_UNKNOWN_ERROR"
];
for (const code of failureCodes) {
  check(`backend includes failure code ${code}`, lifecycle.includes(code));
}

check("backend stores safe failure reason fields", lifecycle.includes("error_code") && lifecycle.includes("error_message") && lifecycle.includes("failed_section_key") && lifecycle.includes("failed_section_label") && lifecycle.includes("next_action") && lifecycle.includes("request_id"));
check("backend failure payload includes support identifiers", lifecycle.includes("job_id") && lifecycle.includes("request_id") && lifecycle.includes("Support") === false);
check("backend status endpoint returns detailed failed readiness", lifecycle.includes("failedReadiness") && lifecycle.includes("failure_reason") && lifecycle.includes("retry_allowed") && lifecycle.includes("blocking_items"));
check("backend does not expose raw stack traces in safe message", !/stack\s*:\s*error|error\.stack|stack_trace/i.test(lifecycle));

check("frontend API exposes detailed active refresh fields", api.includes("failed_section_label?: string | null") && api.includes("next_action?: string | null") && api.includes("request_id?: string | null") && api.includes("runtime_ms?: number | null"));
check("frontend renders detailed failure title/reason/next action/support details", lifecyclePage.includes("readinessFailureDetails") && lifecyclePage.includes("Reason") && lifecyclePage.includes("What to do next") && lifecyclePage.includes("Support details") && lifecyclePage.includes("Request ID"));
check("frontend does not only show generic readiness failed", !/>\s*Readiness failed\s*</.test(lifecyclePage) && lifecyclePage.includes("Readiness refresh failed while checking"));
check("frontend treats stale_failed as terminal", lifecyclePage.includes("stale_failed") && /!\[\s*["']failed["']\s*,\s*["']stale_failed["']\s*\]\.includes\(refreshStatus\)/.test(lifecyclePage));
check("frontend sanitizes failure text before display", lifecyclePage.includes("safeReadinessText") && lifecyclePage.includes("stack trace") && lifecyclePage.includes("sqlite_"));

check("diagnostic script writes stuck-job report", diagnostic.includes("onboarding-readiness-stuck-job-diagnostics.md") && diagnostic.includes("HRM_DIAG_CASE_ID"));
check("diagnostic script checks stale running jobs", diagnostic.includes("Running readiness jobs older than max runtime") && diagnostic.includes("180000"));
check("diagnostic script includes safe readiness input counts", diagnostic.includes("document required rules count") && diagnostic.includes("employee document count") && diagnostic.includes("payroll/payment/pension presence") && diagnostic.includes("user_link_state"));
check("diagnostic script does not print secrets", diagnostic.includes("does not print credentials") && diagnostic.includes("passwords") && diagnostic.includes("tokens"));

check("D1 binding unchanged", wrangler.includes('binding = "DB"') && wrangler.includes('database_name = "hrm-v2"') && wrangler.includes('database_id = "97f9966e-4fe5-4999-aed7-dc20d75fc89e"'));
check("R2 binding unchanged", wrangler.includes('binding = "DOCUMENTS_BUCKET"') && wrangler.includes('bucket_name = "hrm-v2-documents"'));
check("PBKDF2 iterations remain 100000", read("worker/src/auth/password.ts").includes("PBKDF2_ITERATIONS = 100000") || read("worker/src/auth/password.ts").includes("iterations = 100000"));
check("background jobs schema remains present", schema.includes("CREATE TABLE IF NOT EXISTS background_jobs") && schema.includes("background_job_events"));
check("no browser alert/confirm/prompt in changed UI", !/\b(window\.)?(alert|confirm|prompt)\s*\(/.test(lifecyclePage));
check("dark mode not introduced in changed UI", !/\bdark:/.test(lifecyclePage));

if (failures.length) {
  console.error("Onboarding readiness stuck-job hotfix verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Onboarding readiness stuck-job hotfix verification passed.");
