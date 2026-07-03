import type { Context } from "hono";
import type { AppBindings, AuthUser } from "../types";
import { nowIso } from "./http";

const API_SAMPLE_RATE = 0.05;
const FRONTEND_SAMPLE_RATE = 0.1;
const API_SLOW_WARNING_MS = 750;
const API_CRITICAL_MS = 2000;
const FRONTEND_SLOW_WARNING_MS = 1500;
const PAYLOAD_WARNING_BYTES = 500 * 1024;
const MAX_FRONTEND_BATCH_SIZE = 50;
const MAX_METADATA_BYTES = 1400;
const DEFAULT_DETAIL_RETENTION_DAYS = 30;
const DEFAULT_BUILD_RETENTION_DAYS = 180;
const SENSITIVE_METADATA_KEY = /(password|token|secret|cookie|authorization|salary|payroll|bank|account|document_number|file_name|raw|body|response|header)/i;

export type FrontendMetricType =
  | "ROUTE_LOAD"
  | "ROUTE_TRANSITION"
  | "API_CLIENT"
  | "CACHE_HIT"
  | "CACHE_MISS"
  | "INTERACTION"
  | "CHUNK_LOAD";

export interface FrontendPerformanceMetricInput {
  session_metric_id?: string | null;
  route_key?: string | null;
  metric_type?: FrontendMetricType | string | null;
  duration_ms?: number | null;
  metadata_json?: unknown;
}

export interface ApiPerformanceMetricInput {
  requestId?: string | null;
  routeKey: string;
  method: string;
  statusCode: number;
  durationMs: number;
  d1QueryCount: number;
  d1DurationMs: number;
  payloadBytes: number;
  cacheHint?: string | null;
  userId?: string | null;
  companyScopeId?: string | null;
}

export interface JobPerformanceMetricInput {
  jobId?: string | null;
  jobType: string;
  status: string;
  queueWaitMs?: number | null;
  runDurationMs?: number | null;
  attemptCount?: number | null;
  processedCount?: number | null;
  failedCount?: number | null;
}

function boundedNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shouldSample(id: string | null | undefined, rate: number) {
  if (rate >= 1) return true;
  const seed = id || crypto.randomUUID();
  return stableHash(seed) / 0xffffffff < rate;
}

export function sanitizePerformanceRouteKey(input: string | null | undefined) {
  const raw = String(input || "/unknown").split("?")[0] || "/unknown";
  return raw
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, ":id")
    .replace(/\b(?:employee|user|document|contract|payroll|onboarding|offboarding|roster|attendance|leave|asset|job|run|case|loan|payment|report)_[A-Za-z0-9_-]{8,}\b/g, ":id")
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, ":id")
    .slice(0, 220);
}

function sanitizeIdentifier(value: string | null | undefined) {
  if (!value) return null;
  return `hash_${stableHash(value).toString(16)}`;
}

function sanitizeText(value: unknown, maxLength = 160) {
  const text = String(value ?? "").replace(/[^\w .:/-]/g, "").trim();
  return text ? text.slice(0, maxLength) : null;
}

export function sanitizePerformanceMetadata(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const output: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (SENSITIVE_METADATA_KEY.test(key)) continue;
    if (value === null || typeof value === "boolean") {
      output[key.slice(0, 60)] = value;
      continue;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      output[key.slice(0, 60)] = Math.round(value);
      continue;
    }
    if (typeof value === "string") {
      output[key.slice(0, 60)] = sanitizeText(value, 180);
    }
  }
  const serialized = JSON.stringify(output);
  if (serialized === "{}") return null;
  return serialized.length > MAX_METADATA_BYTES ? JSON.stringify({ truncated: true, byte_estimate: serialized.length }) : serialized;
}

function shouldCaptureApiMetric(input: ApiPerformanceMetricInput) {
  if (input.durationMs >= API_SLOW_WARNING_MS) return true;
  if (input.statusCode >= 500) return true;
  if (input.payloadBytes >= PAYLOAD_WARNING_BYTES) return true;
  return shouldSample(input.requestId, API_SAMPLE_RATE);
}

function shouldCaptureFrontendMetric(input: FrontendPerformanceMetricInput) {
  const duration = boundedNumber(input.duration_ms, 0);
  if (duration >= FRONTEND_SLOW_WARNING_MS) return true;
  if (input.metric_type === "CACHE_MISS") return shouldSample(String(input.session_metric_id ?? input.route_key ?? ""), FRONTEND_SAMPLE_RATE);
  return shouldSample(String(input.session_metric_id ?? input.route_key ?? ""), FRONTEND_SAMPLE_RATE);
}

export async function recordApiPerformanceMetric(c: Context<AppBindings>, input: ApiPerformanceMetricInput) {
  if (!shouldCaptureApiMetric(input)) return;
  try {
    await c.env.DB.prepare(
      `INSERT INTO performance_api_metrics
        (id, request_id, route_key, method, status_code, duration_ms, d1_query_count, d1_duration_ms, payload_bytes, cache_hint, company_scope_id, user_scope_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(),
      sanitizeText(input.requestId, 80),
      sanitizePerformanceRouteKey(input.routeKey),
      sanitizeText(input.method, 16) ?? "GET",
      boundedNumber(input.statusCode),
      boundedNumber(input.durationMs),
      boundedNumber(input.d1QueryCount),
      boundedNumber(input.d1DurationMs),
      boundedNumber(input.payloadBytes),
      sanitizeText(input.cacheHint, 60),
      sanitizeIdentifier(input.companyScopeId),
      sanitizeIdentifier(input.userId),
      nowIso()
    ).run();
  } catch (error) {
    console.warn(JSON.stringify({
      level: "warn",
      event: "performance.metric_write_failed",
      metric_type: "api",
      route_key: sanitizePerformanceRouteKey(input.routeKey),
      request_id: sanitizeText(input.requestId, 80),
      message: error instanceof Error ? error.message : "metric write failed"
    }));
  }
}

export async function recordFrontendPerformanceMetrics(db: D1Database, user: AuthUser, metrics: FrontendPerformanceMetricInput[]) {
  const accepted = metrics
    .slice(0, MAX_FRONTEND_BATCH_SIZE)
    .filter((metric) => metric.metric_type && shouldCaptureFrontendMetric(metric));

  let inserted = 0;
  for (const metric of accepted) {
    try {
      await db.prepare(
        `INSERT INTO performance_frontend_metrics
          (id, session_metric_id, route_key, metric_type, duration_ms, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        crypto.randomUUID(),
        sanitizeText(metric.session_metric_id, 80) ?? sanitizeIdentifier(user.id),
        sanitizePerformanceRouteKey(metric.route_key),
        sanitizeText(metric.metric_type, 32) ?? "INTERACTION",
        metric.duration_ms == null ? null : boundedNumber(metric.duration_ms),
        sanitizePerformanceMetadata(metric.metadata_json),
        nowIso()
      ).run();
      inserted += 1;
    } catch {
      // Metrics must never block the app. The verifier checks this best-effort guard remains.
    }
  }
  return { accepted: accepted.length, inserted };
}

export async function recordJobPerformanceMetric(db: D1Database, input: JobPerformanceMetricInput) {
  try {
    await db.prepare(
      `INSERT INTO performance_job_metrics
        (id, job_id, job_type, status, queue_wait_ms, run_duration_ms, attempt_count, processed_count, failed_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(),
      sanitizeText(input.jobId, 100),
      sanitizeText(input.jobType, 120) ?? "background_job",
      sanitizeText(input.status, 40) ?? "UNKNOWN",
      input.queueWaitMs == null ? null : boundedNumber(input.queueWaitMs),
      input.runDurationMs == null ? null : boundedNumber(input.runDurationMs),
      boundedNumber(input.attemptCount),
      boundedNumber(input.processedCount),
      boundedNumber(input.failedCount),
      nowIso()
    ).run();
  } catch {
    // Best-effort only; background job state is the source of truth.
  }
}

export async function syncRecentBackgroundJobPerformanceMetrics(db: D1Database, limit = 50) {
  const rows = await db.prepare(
    `SELECT id, job_type, status, attempt_count, progress_current, scheduled_at, started_at, completed_at
     FROM background_jobs
     WHERE completed_at IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM performance_job_metrics WHERE performance_job_metrics.job_id = background_jobs.id)
     ORDER BY completed_at DESC
     LIMIT ?`
  ).bind(Math.max(1, Math.min(100, limit))).all<{
    id: string;
    job_type: string;
    status: string;
    attempt_count: number;
    progress_current: number;
    scheduled_at: string | null;
    started_at: string | null;
    completed_at: string | null;
  }>();

  for (const row of rows.results) {
    const scheduled = row.scheduled_at ? Date.parse(row.scheduled_at) : null;
    const started = row.started_at ? Date.parse(row.started_at) : null;
    const completed = row.completed_at ? Date.parse(row.completed_at) : null;
    await recordJobPerformanceMetric(db, {
      jobId: row.id,
      jobType: row.job_type,
      status: row.status,
      queueWaitMs: scheduled != null && started != null ? Math.max(0, started - scheduled) : null,
      runDurationMs: started != null && completed != null ? Math.max(0, completed - started) : null,
      attemptCount: row.attempt_count,
      processedCount: row.progress_current,
      failedCount: row.status === "FAILED" ? 1 : 0
    });
  }
  return rows.results.length;
}

export async function cleanupPerformanceMetrics(db: D1Database, options: { detailRetentionDays?: number; buildRetentionDays?: number } = {}) {
  const detailRetentionDays = Math.max(1, Math.min(90, Math.trunc(options.detailRetentionDays ?? DEFAULT_DETAIL_RETENTION_DAYS)));
  const buildRetentionDays = Math.max(30, Math.min(365, Math.trunc(options.buildRetentionDays ?? DEFAULT_BUILD_RETENTION_DAYS)));
  const detailCutoff = new Date(Date.now() - detailRetentionDays * 24 * 60 * 60 * 1000).toISOString();
  const buildCutoff = new Date(Date.now() - buildRetentionDays * 24 * 60 * 60 * 1000).toISOString();

  const api = await db.prepare("DELETE FROM performance_api_metrics WHERE created_at < ?").bind(detailCutoff).run();
  const frontend = await db.prepare("DELETE FROM performance_frontend_metrics WHERE created_at < ?").bind(detailCutoff).run();
  const jobs = await db.prepare("DELETE FROM performance_job_metrics WHERE created_at < ?").bind(detailCutoff).run();
  const builds = await db.prepare("DELETE FROM performance_build_metrics WHERE created_at < ?").bind(buildCutoff).run();
  return {
    detail_retention_days: detailRetentionDays,
    build_retention_days: buildRetentionDays,
    deleted: {
      api: api.meta?.changes ?? 0,
      frontend: frontend.meta?.changes ?? 0,
      jobs: jobs.meta?.changes ?? 0,
      builds: builds.meta?.changes ?? 0
    }
  };
}
