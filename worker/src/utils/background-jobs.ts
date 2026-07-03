import type { Env } from "../types";
import { safeEmitAppEvent } from "./app-events";
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

export type BackgroundJobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "RETRYING";

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

export type JobProgressInput = {
  current?: number | null;
  total?: number | null;
  message?: string | null;
};

const ACTIVE_JOB_STATUSES: BackgroundJobStatus[] = ["QUEUED", "RUNNING", "RETRYING"];
const TERMINAL_JOB_STATUSES: BackgroundJobStatus[] = ["SUCCEEDED", "FAILED", "CANCELLED"];
const SENSITIVE_PAYLOAD_KEY = /(password|token|secret|credential|document_number|file|raw|account|iban|swift|salary|amount|payload|contents|private|hash)/i;

function safeJsonParse(value: string | null): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
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

export async function enqueueJob(db: Env["DB"], input: EnqueueJobInput) {
  const dedupeKey = input.dedupeKey?.trim() || null;
  if (dedupeKey) {
    const existing = await db.prepare(
      `SELECT * FROM background_jobs
       WHERE dedupe_key = ? AND status IN ('QUEUED', 'RUNNING', 'RETRYING')
       ORDER BY created_at DESC
       LIMIT 1`
    ).bind(dedupeKey).first<BackgroundJobRow>();
    if (existing) {
      await appendJobEvent(db, existing.id, "deduped", "Existing active background job reused.", {
        job_type: input.jobType,
        entity_type: input.entityType ?? existing.entity_type,
        entity_id: input.entityId ?? existing.entity_id
      });
      return { job: existing, deduped: true };
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
  return { job, deduped: false };
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

export async function retryJob(db: Env["DB"], jobId: string, requestedByUserId?: string | null) {
  const job = await getJob(db, jobId);
  if (!job) return null;
  if (!["FAILED", "CANCELLED"].includes(job.status) || job.attempt_count >= job.max_attempts) return job;
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

export async function runJobByType(db: Env["DB"], job: BackgroundJobRow) {
  const startedAt = Date.now();
  try {
    await markJobRunning(db, job.id, "Running background job.");
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
    await markJobFailed(db, job.id, "BACKGROUND_JOB_FAILED", message, {
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
