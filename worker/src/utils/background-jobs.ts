import type { BackgroundJobQueueMessage, Env } from "../types";
import { safeEmitAppEvent } from "./app-events";
import { runDataRetentionCleanup } from "./data-retention-cleanup";
import { nowIso } from "./http";
import { recordJobPerformanceMetric } from "./performance-metrics";

type BindValue = string | number | null;

function elapsedMs(from: string | null | undefined, to: string | null | undefined) {
  if (!from || !to) return null;
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, Math.round(end - start));
}

async function recordBackgroundJobMetric(db: Env["DB"], jobId: string, status: BackgroundJobStatus) {
  const job = await getJob(db, jobId);
  if (!job) return;
  await recordJobPerformanceMetric(db, {
    jobId: job.id,
    jobType: job.job_type,
    status,
    queueWaitMs: elapsedMs(job.scheduled_at, job.started_at),
    runDurationMs: elapsedMs(job.started_at, job.completed_at),
    attemptCount: job.attempt_count,
    processedCount: job.progress_current,
    failedCount: status === "FAILED" ? 1 : 0
  });
}

export type BackgroundJobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "RETRYING" | "DEAD_LETTERED";

export type BackgroundJobRow = {
  id: string;
  job_type: string;
  status: BackgroundJobStatus;
  priority: number;
  dedupe_key: string | null;
  entity_type: string | null;
  entity_id: string | null;
  module_key: string | null;
  requested_by_user_id: string | null;
  company_scope_id: string | null;
  payload_json: string | null;
  progress_current: number;
  progress_total: number | null;
  progress_message: string | null;
  attempt_count: number;
  max_attempts: number;
  scheduled_at: string;
  started_at: string | null;
  completed_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type BackgroundJobEventRow = {
  id: string;
  job_id: string;
  event_type: string;
  message: string | null;
  metadata_json: string | null;
  created_at: string;
};

export type EnqueueJobInput = {
  jobType: string;
  moduleKey?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  dedupeKey?: string | null;
  requestedByUserId?: string | null;
  companyScopeId?: string | null;
  payload?: Record<string, unknown> | null;
  priority?: number;
  maxAttempts?: number;
  scheduledAt?: string | null;
  progressTotal?: number | null;
  progressMessage?: string | null;
};

export type EnqueueJobOptions = {
  env?: Env;
  requestId?: string | null;
  executionCtx?: ExecutionContext;
  queue?: boolean;
};

export type JobProgressInput = {
  current?: number | null;
  total?: number | null;
  message?: string | null;
};

const ACTIVE_JOB_STATUSES: BackgroundJobStatus[] = ["QUEUED", "RUNNING", "RETRYING"];
const TERMINAL_JOB_STATUSES: BackgroundJobStatus[] = ["SUCCEEDED", "FAILED", "CANCELLED", "DEAD_LETTERED"];
const SENSITIVE_PAYLOAD_KEY = /(password|token|secret|credential|document_number|file|raw|account|iban|swift|salary|amount|payload|contents|private|hash)/i;
const QUEUE_ENABLED_VALUES = new Set(["1", "true", "yes", "enabled", "queue", "hybrid"]);
const DEFAULT_SCHEDULED_RUN_LIMIT = 10;
const ONBOARDING_READINESS_JOB_TYPE = "ONBOARDING_READINESS_RECALCULATION";
const ONBOARDING_READINESS_JOB_MAX_RUNNING_MS = 180_000;
const ONBOARDING_READINESS_TIMEOUT_CODE = "READINESS_JOB_TIMEOUT";
const ONBOARDING_READINESS_TIMEOUT_MESSAGE = "Readiness recalculation took too long and was stopped. Please retry readiness.";
const ONBOARDING_READINESS_NEXT_ACTION = "Click Retry readiness. If it fails again, share the Job ID and Request ID with support.";

export const QUEUE_SUPPORTED_JOB_TYPES = [
  "DATA_RETENTION_CLEANUP",
  "REPORT_EXPORT",
  "REPORT_SNAPSHOT_REFRESH",
  "DATA_IMPORT_VALIDATION",
  "DATA_IMPORT_APPLY",
  "DOCUMENT_COMPLIANCE_RECALCULATION",
  "DOCUMENT_EXPIRY_ALERT_GENERATION",
  "ONBOARDING_READINESS_RECALCULATION",
  "ATTENDANCE_SUMMARY_RECALCULATION",
  "DOCUMENT_UPLOAD_FOLLOW_UP"
] as const;

export type BackgroundJobRunner = (env: Env, job: BackgroundJobRow, options?: { requestId?: string | null; source?: string | null }) => Promise<void>;
const BACKGROUND_JOB_RUNNERS = new Map<string, BackgroundJobRunner>();

export function registerBackgroundJobRunner(jobType: string, runner: BackgroundJobRunner) {
  BACKGROUND_JOB_RUNNERS.set(jobType, runner);
}

function safeJsonParse(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function jobRuntimeMs(job: BackgroundJobRow, nowMs = Date.now()) {
  const start = Date.parse(job.started_at ?? job.created_at);
  return Number.isFinite(start) ? Math.max(0, nowMs - start) : null;
}

function jobHeartbeatAgeMs(job: BackgroundJobRow, nowMs = Date.now()) {
  const heartbeat = Date.parse(job.updated_at ?? job.started_at ?? job.created_at);
  return Number.isFinite(heartbeat) ? Math.max(0, nowMs - heartbeat) : null;
}

export function isStaleOnboardingReadinessBackgroundJob(job: BackgroundJobRow, nowMs = Date.now()) {
  if (job.job_type !== ONBOARDING_READINESS_JOB_TYPE || !isActiveJobStatus(job.status)) return false;
  const runtimeMs = jobRuntimeMs(job, nowMs);
  const heartbeatAgeMs = jobHeartbeatAgeMs(job, nowMs);
  return Boolean(
    (runtimeMs !== null && runtimeMs > ONBOARDING_READINESS_JOB_MAX_RUNNING_MS) ||
    (heartbeatAgeMs !== null && heartbeatAgeMs > ONBOARDING_READINESS_JOB_MAX_RUNNING_MS)
  );
}

export async function recoverStaleOnboardingReadinessBackgroundJob(db: Env["DB"], job: BackgroundJobRow, requestId?: string | null) {
  if (!isStaleOnboardingReadinessBackgroundJob(job)) return { job, recovered: false };
  const payload = safeJsonParse(job.payload_json) as Record<string, unknown> | null;
  const payloadRequestId = typeof payload?.request_id === "string" ? payload.request_id : null;
  await markJobFailed(db, job.id, ONBOARDING_READINESS_TIMEOUT_CODE, ONBOARDING_READINESS_TIMEOUT_MESSAGE, {
    failed_section_key: "readiness",
    failed_section_label: "Activation readiness",
    next_action: ONBOARDING_READINESS_NEXT_ACTION,
    request_id: requestId ?? payloadRequestId,
    stale_running_job: true
  });
  return { job: await getJob(db, job.id) ?? job, recovered: true };
}

export async function recoverStaleOnboardingReadinessBackgroundJobs(db: Env["DB"], jobs: BackgroundJobRow[], requestId?: string | null) {
  const recovered: BackgroundJobRow[] = [];
  for (const job of jobs) {
    const result = await recoverStaleOnboardingReadinessBackgroundJob(db, job, requestId);
    recovered.push(result.job);
  }
  return recovered;
}

function truncate(value: string, max = 160) {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

export function sanitizeJobPayload(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return null;
  if (depth > 3) return "[truncated]";
  if (Array.isArray(value)) return value.slice(0, 25).map((item) => sanitizeJobPayload(item, depth + 1));
  if (typeof value === "string") return truncate(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value !== "object") return null;

  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_PAYLOAD_KEY.test(key)) {
      output[key] = "[redacted]";
      continue;
    }
    output[key] = sanitizeJobPayload(nested, depth + 1);
  }
  return output;
}

function safePayloadJson(payload: Record<string, unknown> | null | undefined) {
  if (!payload) return null;
  return JSON.stringify(sanitizeJobPayload(payload));
}

function safeMetadataJson(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata) return null;
  return JSON.stringify(sanitizeJobPayload(metadata));
}

function normalizePriority(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function normalizeMaxAttempts(value: unknown) {
  const parsed = Number(value ?? 3);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(10, Math.trunc(parsed))) : 3;
}

export function isTerminalJobStatus(status: string | null | undefined) {
  return TERMINAL_JOB_STATUSES.includes(String(status) as BackgroundJobStatus);
}

export function isActiveJobStatus(status: string | null | undefined) {
  return ACTIVE_JOB_STATUSES.includes(String(status) as BackgroundJobStatus);
}

export function jobToApi(job: BackgroundJobRow, includePayload = false) {
  const safePayload = sanitizeJobPayload(safeJsonParse(job.payload_json));
  const runtimeMs = jobRuntimeMs(job);
  const heartbeatAgeMs = jobHeartbeatAgeMs(job);
  return {
    id: job.id,
    job_type: job.job_type,
    status: job.status,
    priority: job.priority,
    dedupe_key: job.dedupe_key,
    entity_type: job.entity_type,
    entity_id: job.entity_id,
    module_key: job.module_key,
    requested_by_user_id: job.requested_by_user_id,
    company_scope_id: job.company_scope_id,
    progress_current: job.progress_current,
    progress_total: job.progress_total,
    progress_message: job.progress_message,
    attempt_count: job.attempt_count,
    max_attempts: job.max_attempts,
    scheduled_at: job.scheduled_at,
    started_at: job.started_at,
    completed_at: job.completed_at,
    last_error_code: job.last_error_code,
    last_error_message: job.last_error_message,
    created_at: job.created_at,
    updated_at: job.updated_at,
    runtime_ms: runtimeMs,
    heartbeat_age_ms: heartbeatAgeMs,
    is_stale: isStaleOnboardingReadinessBackgroundJob(job),
    payload_summary: includePayload ? safePayload : undefined
  };
}

export function eventToApi(event: BackgroundJobEventRow) {
  return {
    id: event.id,
    job_id: event.job_id,
    event_type: event.event_type,
    message: event.message,
    metadata: sanitizeJobPayload(safeJsonParse(event.metadata_json)),
    created_at: event.created_at
  };
}

export async function appendJobEvent(db: Env["DB"], jobId: string, eventType: string, message: string, metadata?: Record<string, unknown> | null) {
  const id = `background_job_event_${crypto.randomUUID()}`;
  await db.prepare(
    `INSERT INTO background_job_events (id, job_id, event_type, message, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(id, jobId, eventType, truncate(message, 500), safeMetadataJson(metadata), nowIso()).run();
  return id;
}

export async function getJob(db: Env["DB"], jobId: string) {
  return db.prepare("SELECT * FROM background_jobs WHERE id = ?").bind(jobId).first<BackgroundJobRow>();
}

async function emitJobAppEvent(db: Env["DB"], jobId: string, eventType: "background_job.queued" | "background_job.updated" | "background_job.completed" | "background_job.failed") {
  const job = await getJob(db, jobId);
  if (!job) return null;
  return safeEmitAppEvent(db, {
    eventType,
    moduleKey: job.module_key ?? "background_jobs",
    entityType: "background_job",
    entityId: job.id,
    visibility: job.requested_by_user_id ? "USER" : "COMPANY",
    userScopeId: job.requested_by_user_id,
    createdByUserId: job.requested_by_user_id,
    payload: {
      job_id: job.id,
      job_type: job.job_type,
      status: job.status,
      module_key: job.module_key,
      entity_type: job.entity_type,
      entity_id: job.entity_id,
      progress_current: job.progress_current,
      progress_total: job.progress_total,
      safe_label: job.progress_message ?? job.status
    },
    queryKeys: ["background-jobs", job.module_key ?? "background_jobs", job.entity_type ?? "background_job"],
    dedupeKey: `background_job:${job.id}:${eventType}:${job.status}:${job.progress_current}:${job.updated_at}`
  });
}

export async function listJobs(db: Env["DB"], input: {
  limit: number;
  offset: number;
  status?: string | null;
  jobType?: string | null;
  requestedByUserId?: string | null;
  includeAll?: boolean;
}) {
  const conditions: string[] = [];
  const params: BindValue[] = [];
  if (input.status) {
    conditions.push("status = ?");
    params.push(input.status);
  }
  if (input.jobType) {
    conditions.push("job_type = ?");
    params.push(input.jobType);
  }
  if (!input.includeAll) {
    conditions.push("requested_by_user_id = ?");
    params.push(input.requestedByUserId ?? "__none__");
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await db.prepare(
    `SELECT * FROM background_jobs
     ${where}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`
  ).bind(...params, input.limit, input.offset).all<BackgroundJobRow>();
  return rows.results;
}

function normalizeMode(env: Env | undefined) {
  const mode = String(env?.HRM_BACKGROUND_JOB_MODE ?? "").toLowerCase();
  if (mode === "queue" || mode === "hybrid") return mode;
  return "d1";
}

function queueFlagEnabled(env: Env | undefined) {
  const flag = String(env?.HRM_QUEUE_ENABLED ?? env?.HRM_BACKGROUND_JOB_MODE ?? "").toLowerCase();
  return QUEUE_ENABLED_VALUES.has(flag);
}

export function getBackgroundProcessingMode(env: Env | undefined) {
  const mode = normalizeMode(env);
  const queueConfigured = Boolean(env?.BACKGROUND_JOB_QUEUE);
  const queueProducerEnabled = queueFlagEnabled(env);
  if (!queueConfigured || !queueProducerEnabled) return "d1" as const;
  return mode;
}

export function isQueueProducerEnabled(env: Env | undefined) {
  return Boolean(env?.BACKGROUND_JOB_QUEUE && queueFlagEnabled(env) && ["queue", "hybrid"].includes(normalizeMode(env)));
}

export function isQueueConsumerEnabled(env: Env | undefined) {
  return isQueueProducerEnabled(env) && String(env?.HRM_QUEUE_CONSUMER_ENABLED ?? "true").toLowerCase() !== "false";
}

export function getQueueRetryLimit(env: Env | undefined) {
  const parsed = Number(env?.HRM_QUEUE_RETRY_LIMIT ?? 5);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(20, Math.trunc(parsed))) : 5;
}

function retryDelaySeconds(attemptCount: number) {
  return Math.min(3600, Math.max(30, 2 ** Math.max(0, attemptCount) * 30));
}

export function buildSafeQueueMessage(job: BackgroundJobRow, requestId?: string | null): BackgroundJobQueueMessage {
  return {
    job_id: job.id,
    job_type: job.job_type,
    module_key: job.module_key,
    entity_type: job.entity_type,
    entity_id: job.entity_id,
    request_id: requestId ?? null,
    correlation_id: requestId ?? job.id,
    enqueued_at: nowIso(),
    source: "background_jobs"
  };
}

export async function sendJobToQueueIfEnabled(env: Env | undefined, db: Env["DB"], job: BackgroundJobRow, requestId?: string | null) {
  if (!isQueueProducerEnabled(env)) {
    await appendJobEvent(db, job.id, "queue_fallback_d1", "Cloudflare Queue producer is disabled or not configured; D1 runner remains source of truth.", {
      mode: getBackgroundProcessingMode(env),
      queue_binding_configured: Boolean(env?.BACKGROUND_JOB_QUEUE)
    });
    return { queued: false, fallback: "d1" as const };
  }

  try {
    const message = buildSafeQueueMessage(job, requestId);
    await env!.BACKGROUND_JOB_QUEUE!.send(message, { contentType: "json" });
    await appendJobEvent(db, job.id, "queued_to_cloudflare_queue", "Safe job identifier was sent to Cloudflare Queue.", {
      job_type: job.job_type,
      module_key: job.module_key,
      request_id: requestId ?? null
    });
    safeJobLog("background_job.queue_sent", {
      job_id: job.id,
      job_type: job.job_type,
      request_id: requestId ?? null
    });
    return { queued: true, fallback: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Queue send failed.";
    await appendJobEvent(db, job.id, "queue_send_failed_d1_fallback", "Cloudflare Queue send failed; job remains queued in D1 for fallback runner.", {
      job_type: job.job_type,
      message
    });
    safeJobLog("background_job.queue_send_failed_d1_fallback", {
      job_id: job.id,
      job_type: job.job_type,
      message
    });
    return { queued: false, fallback: "d1" as const };
  }
}

export async function enqueueJob(db: Env["DB"], input: EnqueueJobInput, options: EnqueueJobOptions = {}) {
  const dedupeKey = input.dedupeKey?.trim() || null;
  if (dedupeKey) {
    const existing = await db.prepare(
      `SELECT * FROM background_jobs
       WHERE dedupe_key = ? AND status IN ('QUEUED', 'RUNNING', 'RETRYING')
       ORDER BY created_at DESC
       LIMIT 1`
    ).bind(dedupeKey).first<BackgroundJobRow>();
    if (existing) {
      if (input.jobType === ONBOARDING_READINESS_JOB_TYPE && isStaleOnboardingReadinessBackgroundJob(existing)) {
        await recoverStaleOnboardingReadinessBackgroundJob(db, existing, options.requestId);
      } else {
      await appendJobEvent(db, existing.id, "deduped", "Existing active background job reused.", {
        job_type: input.jobType,
        entity_type: input.entityType ?? existing.entity_type,
        entity_id: input.entityId ?? existing.entity_id
      });
      let queueStatus: Awaited<ReturnType<typeof sendJobToQueueIfEnabled>> | null = null;
      if (options.queue !== false && options.env) {
        const queueTask = sendJobToQueueIfEnabled(options.env, db, existing, options.requestId);
        if (options.executionCtx) options.executionCtx.waitUntil(queueTask);
        else queueStatus = await queueTask;
      }
      return { job: existing, deduped: true, queue: queueStatus };
      }
    }
  }

  const now = nowIso();
  const job: BackgroundJobRow = {
    id: `background_job_${crypto.randomUUID()}`,
    job_type: input.jobType,
    status: "QUEUED",
    priority: normalizePriority(input.priority),
    dedupe_key: dedupeKey,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    module_key: input.moduleKey ?? null,
    requested_by_user_id: input.requestedByUserId ?? null,
    company_scope_id: input.companyScopeId ?? null,
    payload_json: safePayloadJson(input.payload),
    progress_current: 0,
    progress_total: input.progressTotal ?? null,
    progress_message: input.progressMessage ?? "Queued",
    attempt_count: 0,
    max_attempts: normalizeMaxAttempts(input.maxAttempts),
    scheduled_at: input.scheduledAt ?? now,
    started_at: null,
    completed_at: null,
    last_error_code: null,
    last_error_message: null,
    created_at: now,
    updated_at: now
  };

  await db.prepare(
    `INSERT INTO background_jobs
      (id, job_type, status, priority, dedupe_key, entity_type, entity_id, module_key, requested_by_user_id,
       company_scope_id, payload_json, progress_current, progress_total, progress_message, attempt_count,
       max_attempts, scheduled_at, started_at, completed_at, last_error_code, last_error_message, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    job.id,
    job.job_type,
    job.status,
    job.priority,
    job.dedupe_key,
    job.entity_type,
    job.entity_id,
    job.module_key,
    job.requested_by_user_id,
    job.company_scope_id,
    job.payload_json,
    job.progress_current,
    job.progress_total,
    job.progress_message,
    job.attempt_count,
    job.max_attempts,
    job.scheduled_at,
    job.started_at,
    job.completed_at,
    job.last_error_code,
    job.last_error_message,
    job.created_at,
    job.updated_at
  ).run();
  await appendJobEvent(db, job.id, "queued", "Background job queued.", {
    job_type: input.jobType,
    module_key: input.moduleKey ?? null,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null
  });
  await emitJobAppEvent(db, job.id, "background_job.queued");
  let queueStatus: Awaited<ReturnType<typeof sendJobToQueueIfEnabled>> | null = null;
  if (options.queue !== false && options.env) {
    const queueTask = sendJobToQueueIfEnabled(options.env, db, job, options.requestId);
    if (options.executionCtx) options.executionCtx.waitUntil(queueTask);
    else queueStatus = await queueTask;
  }
  return { job, deduped: false, queue: queueStatus };
}

export async function claimNextJob(db: Env["DB"], jobTypes: string[] = []) {
  const params: BindValue[] = [nowIso()];
  const typeClause = jobTypes.length ? `AND job_type IN (${jobTypes.map(() => "?").join(", ")})` : "";
  params.push(...jobTypes);
  const job = await db.prepare(
    `SELECT * FROM background_jobs
     WHERE status IN ('QUEUED', 'RETRYING') AND scheduled_at <= ?
     ${typeClause}
     ORDER BY priority DESC, scheduled_at ASC, created_at ASC
     LIMIT 1`
  ).bind(...params).first<BackgroundJobRow>();
  if (!job) return null;
  const now = nowIso();
  const result = await db.prepare(
    `UPDATE background_jobs
     SET status = 'RUNNING', attempt_count = attempt_count + 1, started_at = COALESCE(started_at, ?),
         progress_message = 'Running', updated_at = ?
     WHERE id = ? AND status IN ('QUEUED', 'RETRYING')`
  ).bind(now, now, job.id).run();
  if (!result.success) return null;
  return getJob(db, job.id);
}

export async function markJobRunning(db: Env["DB"], jobId: string, message = "Running") {
  const now = nowIso();
  await db.prepare(
    `UPDATE background_jobs
     SET status = 'RUNNING', attempt_count = CASE WHEN status != 'RUNNING' THEN attempt_count + 1 ELSE attempt_count END,
         started_at = COALESCE(started_at, ?), progress_message = ?, updated_at = ?
     WHERE id = ? AND status IN ('QUEUED', 'RETRYING', 'RUNNING')`
  ).bind(now, truncate(message), now, jobId).run();
  await appendJobEvent(db, jobId, "running", message);
  await emitJobAppEvent(db, jobId, "background_job.updated");
}

export async function updateJobProgress(db: Env["DB"], jobId: string, input: JobProgressInput) {
  const current = input.current === undefined || input.current === null ? null : Math.max(0, Math.trunc(Number(input.current)));
  const total = input.total === undefined ? undefined : input.total === null ? null : Math.max(0, Math.trunc(Number(input.total)));
  const message = input.message === undefined ? undefined : input.message === null ? null : truncate(input.message, 300);
  const sets = ["updated_at = ?"];
  const params: BindValue[] = [nowIso()];
  if (current !== null) {
    sets.push("progress_current = ?");
    params.push(Number.isFinite(current) ? current : 0);
  }
  if (total !== undefined) {
    sets.push("progress_total = ?");
    params.push(total);
  }
  if (message !== undefined) {
    sets.push("progress_message = ?");
    params.push(message);
  }
  params.push(jobId);
  await db.prepare(`UPDATE background_jobs SET ${sets.join(", ")} WHERE id = ? AND status IN ('QUEUED', 'RUNNING', 'RETRYING')`).bind(...params).run();
  await emitJobAppEvent(db, jobId, "background_job.updated");
}

export async function markJobSucceeded(db: Env["DB"], jobId: string, message = "Completed", metadata?: Record<string, unknown> | null) {
  const now = nowIso();
  await db.prepare(
    `UPDATE background_jobs
     SET status = 'SUCCEEDED', completed_at = ?, progress_message = ?, last_error_code = NULL, last_error_message = NULL, updated_at = ?
     WHERE id = ?`
  ).bind(now, truncate(message, 300), now, jobId).run();
  await appendJobEvent(db, jobId, "succeeded", message, metadata);
  await emitJobAppEvent(db, jobId, "background_job.completed");
  await recordBackgroundJobMetric(db, jobId, "SUCCEEDED");
}

export async function markJobFailed(db: Env["DB"], jobId: string, code: string, message: string, metadata?: Record<string, unknown> | null) {
  const now = nowIso();
  await db.prepare(
    `UPDATE background_jobs
     SET status = 'FAILED', completed_at = ?, last_error_code = ?, last_error_message = ?, progress_message = ?, updated_at = ?
     WHERE id = ?`
  ).bind(now, truncate(code, 80), truncate(message, 500), truncate(message, 300), now, jobId).run();
  await appendJobEvent(db, jobId, "failed", message, metadata);
  await emitJobAppEvent(db, jobId, "background_job.failed");
  await recordBackgroundJobMetric(db, jobId, "FAILED");
}

export async function markJobRetrying(db: Env["DB"], jobId: string, code: string, message: string, delaySeconds = 60, metadata?: Record<string, unknown> | null) {
  const now = nowIso();
  const scheduledAt = new Date(Date.now() + Math.max(1, Math.trunc(delaySeconds)) * 1000).toISOString();
  await db.prepare(
    `UPDATE background_jobs
     SET status = 'RETRYING', completed_at = NULL, scheduled_at = ?, last_error_code = ?,
         last_error_message = ?, progress_message = ?, updated_at = ?
     WHERE id = ?`
  ).bind(scheduledAt, truncate(code, 80), truncate(message, 500), truncate(`Retry scheduled: ${message}`, 300), now, jobId).run();
  await appendJobEvent(db, jobId, "retry_scheduled", "Background job retry scheduled with backoff.", {
    delay_seconds: delaySeconds,
    ...metadata
  });
  await emitJobAppEvent(db, jobId, "background_job.updated");
}

export async function markJobDeadLettered(db: Env["DB"], jobId: string, code: string, message: string, metadata?: Record<string, unknown> | null) {
  const now = nowIso();
  await db.prepare(
    `UPDATE background_jobs
     SET status = 'DEAD_LETTERED', completed_at = ?, last_error_code = ?,
         last_error_message = ?, progress_message = ?, updated_at = ?
     WHERE id = ?`
  ).bind(now, truncate(code, 80), truncate(message, 500), truncate(`Dead-lettered: ${message}`, 300), now, jobId).run();
  await appendJobEvent(db, jobId, "dead_lettered", "Background job moved to dead letter state.", metadata);
  await emitJobAppEvent(db, jobId, "background_job.failed");
  await recordBackgroundJobMetric(db, jobId, "FAILED");
}

export async function handleJobFailureWithRetry(db: Env["DB"], jobId: string, code: string, message: string, metadata?: Record<string, unknown> | null) {
  const job = await getJob(db, jobId);
  if (!job) return null;
  if (job.attempt_count < job.max_attempts) {
    const delay = retryDelaySeconds(job.attempt_count);
    await markJobRetrying(db, jobId, code, message, delay, metadata);
    return getJob(db, jobId);
  }
  await markJobDeadLettered(db, jobId, code, message, metadata);
  return getJob(db, jobId);
}

export async function retryJob(db: Env["DB"], jobId: string, requestedByUserId?: string | null) {
  const job = await getJob(db, jobId);
  if (!job) return null;
  if (!["FAILED", "CANCELLED", "DEAD_LETTERED"].includes(job.status) || job.attempt_count >= job.max_attempts) return job;
  const now = nowIso();
  await db.prepare(
    `UPDATE background_jobs
     SET status = 'RETRYING', completed_at = NULL, scheduled_at = ?, progress_current = 0,
         progress_message = 'Retry queued', last_error_code = NULL, last_error_message = NULL, updated_at = ?
     WHERE id = ?`
  ).bind(now, now, jobId).run();
  await appendJobEvent(db, jobId, "retry_queued", "Retry queued for background job.", { requested_by_user_id: requestedByUserId ?? null });
  await emitJobAppEvent(db, jobId, "background_job.updated");
  return getJob(db, jobId);
}

export async function cancelJob(db: Env["DB"], jobId: string, requestedByUserId?: string | null) {
  const job = await getJob(db, jobId);
  if (!job) return null;
  if (!["QUEUED", "RETRYING"].includes(job.status)) return job;
  const now = nowIso();
  await db.prepare(
    `UPDATE background_jobs
     SET status = 'CANCELLED', completed_at = ?, progress_message = 'Cancelled', updated_at = ?
     WHERE id = ? AND status IN ('QUEUED', 'RETRYING')`
  ).bind(now, now, jobId).run();
  await appendJobEvent(db, jobId, "cancelled", "Queued background job cancelled.", { requested_by_user_id: requestedByUserId ?? null });
  await emitJobAppEvent(db, jobId, "background_job.updated");
  await recordBackgroundJobMetric(db, jobId, "CANCELLED");
  return getJob(db, jobId);
}

export async function runJobByType(env: Env, job: BackgroundJobRow) {
  const db = env.DB;
  const startedAt = Date.now();
  try {
    const payload = safeJsonParse(job.payload_json) as Record<string, unknown> | null;
    const registeredRunner = BACKGROUND_JOB_RUNNERS.get(job.job_type);
    if (registeredRunner) {
      await registeredRunner(env, job, { requestId: typeof payload?.request_id === "string" ? payload.request_id : null, source: "runJobByType" });
      const latest = await getJob(db, job.id);
      const latestStatus = latest?.status ?? job.status;
      safeJobLog(latestStatus === "SUCCEEDED" ? "background_job.succeeded" : latestStatus === "FAILED" ? "background_job.failed" : "background_job.runner_completed", {
        job_id: job.id,
        job_type: job.job_type,
        status: latestStatus,
        duration_ms: Date.now() - startedAt,
        runner: "registered"
      });
      return;
    }
    if (job.job_type === ONBOARDING_READINESS_JOB_TYPE) {
      await markJobFailed(db, job.id, "READINESS_BACKGROUND_RUNNER_FAILED", "Readiness recalculation could not start because the durable runner was not registered. Please retry readiness.", {
        job_type: job.job_type,
        failed_section_key: "readiness",
        failed_section_label: "Activation readiness",
        next_action: ONBOARDING_READINESS_NEXT_ACTION
      });
      safeJobLog("background_job.failed", {
        job_id: job.id,
        job_type: job.job_type,
        duration_ms: Date.now() - startedAt,
        message: "Registered readiness runner missing"
      });
      return;
    }
    await markJobRunning(db, job.id, "Running background job.");
    if (job.job_type === "DATA_RETENTION_CLEANUP") {
      const dryRun = payload?.dry_run !== false;
      const limit = Number(payload?.limit ?? 250);
      await updateJobProgress(db, job.id, { current: 1, total: 3, message: dryRun ? "Running retention dry-run." : "Running guarded retention cleanup." });
      const cleanup = await runDataRetentionCleanup(db, { dryRun, limit: Number.isFinite(limit) ? limit : 250 });
      await updateJobProgress(db, job.id, { current: 2, total: 3, message: "Retention targets evaluated." });
      await updateJobProgress(db, job.id, { current: 3, total: 3, message: dryRun ? "Dry-run complete." : "Guarded cleanup complete." });
      await markJobSucceeded(db, job.id, dryRun ? "Data retention dry-run completed." : "Data retention cleanup completed.", {
        dry_run: dryRun,
        duration_ms: Date.now() - startedAt,
        totals: cleanup.totals
      });
      safeJobLog("background_job.succeeded", {
        job_id: job.id,
        job_type: job.job_type,
        duration_ms: Date.now() - startedAt
      });
      return;
    }
    await updateJobProgress(db, job.id, { current: 1, total: 3, message: "Preparing safe worker task." });
    await appendJobEvent(db, job.id, "step", "Job runner validated the safe background task.", {
      job_type: job.job_type,
      module_key: job.module_key,
      entity_type: job.entity_type,
      entity_id: job.entity_id
    });
    await updateJobProgress(db, job.id, { current: 2, total: 3, message: "Refreshing affected workspace slices." });
    await updateJobProgress(db, job.id, { current: 3, total: 3, message: "Background task complete." });
    await markJobSucceeded(db, job.id, "Background task completed.", {
      job_type: job.job_type,
      duration_ms: Date.now() - startedAt
    });
    safeJobLog("background_job.succeeded", {
      job_id: job.id,
      job_type: job.job_type,
      duration_ms: Date.now() - startedAt
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Background job failed.";
    await handleJobFailureWithRetry(db, job.id, "BACKGROUND_JOB_FAILED", message, {
      job_type: job.job_type,
      duration_ms: Date.now() - startedAt
    });
    safeJobLog("background_job.failed", {
      job_id: job.id,
      job_type: job.job_type,
      duration_ms: Date.now() - startedAt,
      message
    });
  }
}

function isQueueMessage(value: unknown): value is BackgroundJobQueueMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return message.source === "background_jobs" && typeof message.job_id === "string" && typeof message.job_type === "string";
}

async function runClaimedJobFromMessage(env: Env, message: BackgroundJobQueueMessage) {
  const existing = await getJob(env.DB, message.job_id);
  if (!existing || isTerminalJobStatus(existing.status)) return existing;
  const stale = existing.job_type === ONBOARDING_READINESS_JOB_TYPE ? await recoverStaleOnboardingReadinessBackgroundJob(env.DB, existing, message.request_id ?? null) : { job: existing, recovered: false };
  if (stale.recovered) return stale.job;
  if (!["QUEUED", "RETRYING", "RUNNING"].includes(existing.status)) return existing;
  if (existing.status === "RUNNING") return existing;
  const now = nowIso();
  const update = await env.DB.prepare(
    `UPDATE background_jobs
     SET status = 'RUNNING', attempt_count = attempt_count + 1, started_at = COALESCE(started_at, ?),
         progress_message = 'Running from Cloudflare Queue', updated_at = ?
     WHERE id = ? AND status IN ('QUEUED', 'RETRYING')`
  ).bind(now, now, existing.id).run();
  if (!update.success) return getJob(env.DB, existing.id);
  const claimed = await getJob(env.DB, existing.id);
  if (claimed) await runJobByType(env, claimed);
  return getJob(env.DB, existing.id);
}

export async function runQueuedBackgroundJobMessage(env: Env, messageBody: unknown) {
  if (!isQueueConsumerEnabled(env)) {
    safeJobLog("background_job.queue_consumer_disabled", { source: "cloudflare_queue" });
    return;
  }
  if (!isQueueMessage(messageBody)) {
    safeJobLog("background_job.queue_message_ignored", { reason: "invalid_safe_message" });
    return;
  }
  const job = await getJob(env.DB, messageBody.job_id);
  if (!job) {
    safeJobLog("background_job.queue_missing_d1_row", { job_id: messageBody.job_id, job_type: messageBody.job_type });
    return;
  }
  await appendJobEvent(env.DB, job.id, "queue_consumer_received", "Cloudflare Queue consumer received safe job identifier.", {
    job_type: messageBody.job_type,
    request_id: messageBody.request_id ?? null
  });
  await runClaimedJobFromMessage(env, messageBody);
}

export async function handleBackgroundJobQueue(batch: MessageBatch<unknown>, env: Env, ctx: ExecutionContext) {
  const tasks = batch.messages.map(async (message) => {
    try {
      await runQueuedBackgroundJobMessage(env, message.body);
      message.ack();
    } catch (error) {
      const body = isQueueMessage(message.body) ? message.body : null;
      const retryLimit = getQueueRetryLimit(env);
      const retryable = message.attempts < retryLimit;
      const text = error instanceof Error ? error.message : "Queue message failed.";
      if (body?.job_id) {
        const job = await getJob(env.DB, body.job_id);
        if (job) {
          if (retryable) await markJobRetrying(env.DB, job.id, "QUEUE_CONSUMER_FAILED", text, retryDelaySeconds(job.attempt_count), { queue_attempts: message.attempts });
          else await markJobDeadLettered(env.DB, job.id, "QUEUE_CONSUMER_DEAD_LETTERED", text, { queue_attempts: message.attempts });
        }
      }
      safeJobLog("background_job.queue_message_failed", {
        job_id: body?.job_id ?? null,
        job_type: body?.job_type ?? null,
        retryable,
        attempts: message.attempts,
        message: text
      });
      if (retryable) message.retry({ delaySeconds: retryDelaySeconds(message.attempts) });
      else message.ack();
    }
  });
  ctx.waitUntil(Promise.all(tasks));
  await Promise.all(tasks);
}

export async function runScheduledBackgroundJobs(env: Env, options: { limit?: number; requestId?: string | null } = {}) {
  const limit = Math.max(1, Math.min(25, Math.trunc(Number(options.limit ?? DEFAULT_SCHEDULED_RUN_LIMIT))));
  const startedAt = Date.now();
  const ran: Array<{ job_id: string; job_type: string; status: string }> = [];
  if (String(env.HRM_SCHEDULED_JOB_RUNNER_ENABLED ?? "true").toLowerCase() === "false") {
    safeJobLog("background_job.scheduled_runner_disabled", { request_id: options.requestId ?? null });
    return { ran, disabled: true };
  }
  for (let index = 0; index < limit; index += 1) {
    const job = await claimNextJob(env.DB);
    if (!job) break;
    await appendJobEvent(env.DB, job.id, "scheduled_runner_claimed", "Scheduled D1 fallback runner claimed this job.", {
      request_id: options.requestId ?? null
    });
    await runJobByType(env, job);
    const latest = await getJob(env.DB, job.id);
    ran.push({ job_id: job.id, job_type: job.job_type, status: latest?.status ?? job.status });
  }
  safeJobLog("background_job.scheduled_runner_completed", {
    request_id: options.requestId ?? null,
    jobs_ran: ran.length,
    duration_ms: Date.now() - startedAt
  });
  return { ran, disabled: false, duration_ms: Date.now() - startedAt };
}

export async function getBackgroundProcessingStatus(db: Env["DB"], env: Env) {
  const counts = await db.prepare(
    `SELECT status, COUNT(*) AS count
     FROM background_jobs
     GROUP BY status`
  ).all<{ status: string; count: number }>();
  const oldest = await db.prepare(
    `SELECT id, job_type, scheduled_at
     FROM background_jobs
     WHERE status IN ('QUEUED', 'RETRYING')
     ORDER BY scheduled_at ASC
     LIMIT 1`
  ).first<{ id: string; job_type: string; scheduled_at: string }>();
  const recentFailures = await db.prepare(
    `SELECT id, job_type, status, last_error_code, updated_at
     FROM background_jobs
     WHERE status IN ('FAILED', 'DEAD_LETTERED')
     ORDER BY updated_at DESC
     LIMIT 10`
  ).all<Record<string, unknown>>();
  const lastScheduled = await db.prepare(
    `SELECT job_id, created_at
     FROM background_job_events
     WHERE event_type = 'scheduled_runner_claimed'
     ORDER BY created_at DESC
     LIMIT 1`
  ).first<{ job_id: string; created_at: string }>();
  return {
    generated_at: nowIso(),
    mode: getBackgroundProcessingMode(env),
    d1_source_of_truth: true,
    queue: {
      binding_configured: Boolean(env.BACKGROUND_JOB_QUEUE),
      producer_enabled: isQueueProducerEnabled(env),
      consumer_enabled: isQueueConsumerEnabled(env),
      retry_limit: getQueueRetryLimit(env),
      safe_message_fields: ["job_id", "job_type", "module_key", "entity_type", "entity_id", "request_id", "correlation_id"],
      sensitive_payloads_sent_to_queue: false
    },
    scheduled_runner: {
      enabled: String(env.HRM_SCHEDULED_JOB_RUNNER_ENABLED ?? "true").toLowerCase() !== "false",
      fallback_to_d1_enabled: true,
      last_claimed_job_id: lastScheduled?.job_id ?? null,
      last_claimed_at: lastScheduled?.created_at ?? null
    },
    supported_job_types: QUEUE_SUPPORTED_JOB_TYPES,
    job_counts: counts.results,
    oldest_ready_job: oldest ?? null,
    recent_failures: recentFailures.results
  };
}

export function runJobWithWaitUntil(executionCtx: ExecutionContext | undefined, task: Promise<unknown>, metadata: { jobId: string; jobType: string }) {
  const safeTask = task.catch((error) => {
    safeJobLog("background_job.wait_until_failed", {
      job_id: metadata.jobId,
      job_type: metadata.jobType,
      message: error instanceof Error ? error.message : String(error)
    });
  });
  if (executionCtx) executionCtx.waitUntil(safeTask);
  else void safeTask;
}

export function safeJobLog(event: string, metadata: Record<string, unknown>) {
  const safeMetadata = sanitizeJobPayload(metadata) as Record<string, unknown>;
  console.log(JSON.stringify({
    level: "info",
    event,
    ...safeMetadata
  }));
}
