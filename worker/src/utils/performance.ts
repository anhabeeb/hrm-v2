import type { Context, MiddlewareHandler } from "hono";
import type { AppBindings } from "../types";
import { recordApiPerformanceMetric } from "./performance-metrics";

export const API_WARNING_THRESHOLD_MS = 750;
export const API_CRITICAL_THRESHOLD_MS = 2000;
export const D1_QUERY_WARNING_THRESHOLD_MS = 250;
export const PAYLOAD_WARNING_THRESHOLD_BYTES = 500 * 1024;

function safeRoutePattern(c: Context<AppBindings>) {
  return (c.req as { routePath?: string }).routePath ?? c.req.path;
}

function executionCtx(c: Context<AppBindings>) {
  return (c as unknown as { executionCtx?: ExecutionContext }).executionCtx;
}

function safeUserId(c: Context<AppBindings>) {
  try {
    return c.get("currentUser")?.id ?? null;
  } catch {
    return null;
  }
}

function timingState(c: Context<AppBindings>) {
  const timing = c.get("routeTiming");
  if (timing) return timing;
  const next = { queryCount: 0, d1DurationMs: 0, d1Warnings: [] as string[], requestId: undefined as string | undefined };
  c.set("routeTiming", next);
  return next;
}

export function appendServerTiming(c: Context<AppBindings>, durationMs: number) {
  const timing = timingState(c);
  const entries = [
    `app;dur=${Math.max(0, Math.round(durationMs))}`,
    `d1;dur=${Math.max(0, Math.round(timing.d1DurationMs))}`,
    `d1-count;desc="${timing.queryCount}"`
  ];
  c.header("Server-Timing", entries.join(", "));
}

function appendPrivateCacheHeader(c: Context<AppBindings>) {
  if (c.req.method === "OPTIONS") return;
  if (!c.req.path.startsWith("/api/")) return;
  const existing = c.res.headers.get("Cache-Control");
  if (!existing) {
    c.header("Cache-Control", "private, no-store");
    return;
  }
  if (/\bpublic\b/i.test(existing)) {
    c.header("Cache-Control", "private, no-store");
  }
}

function payloadBytes(c: Context<AppBindings>) {
  const length = c.res.headers.get("Content-Length") ?? c.res.headers.get("X-HRM-Payload-Bytes");
  const parsed = length ? Number(length) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function logSlowApi(input: {
  method: string;
  routePattern: string;
  durationMs: number;
  status: number;
  queryCount: number;
  d1DurationMs: number;
  payloadBytes: number;
  userId: string | null;
  requestId?: string | null;
}) {
  const level = input.durationMs >= API_CRITICAL_THRESHOLD_MS ? "error" : input.durationMs >= API_WARNING_THRESHOLD_MS ? "warn" : "info";
  const payloadWarning = input.payloadBytes >= PAYLOAD_WARNING_THRESHOLD_BYTES;
  if (level === "info" && !payloadWarning) return;
  console.warn(JSON.stringify({
    level,
    event: "worker.api_timing",
    method: input.method,
    route_pattern: input.routePattern,
    duration_ms: Math.round(input.durationMs),
    status: input.status,
    d1_query_count: input.queryCount,
    d1_duration_ms: Math.round(input.d1DurationMs),
    payload_bytes: input.payloadBytes || null,
    payload_warning: payloadWarning,
    request_id: input.requestId ?? null,
    user_id: input.userId,
    timestamp: new Date().toISOString()
  }));
}

export async function timeD1<T>(c: Context<AppBindings>, operation: () => Promise<T>, label = "d1") {
  const timing = timingState(c);
  timing.queryCount += 1;
  const start = Date.now();
  try {
    return await operation();
  } finally {
    const duration = Date.now() - start;
    timing.d1DurationMs += duration;
    if (duration >= D1_QUERY_WARNING_THRESHOLD_MS) {
      timing.d1Warnings.push(label);
      console.warn(JSON.stringify({
        level: "warn",
        event: "worker.d1_timing",
        label,
        duration_ms: duration,
        route_pattern: safeRoutePattern(c),
        request_id: timing.requestId ?? null,
        timestamp: new Date().toISOString()
      }));
    }
  }
}

export function withRequestTiming(): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const start = Date.now();
    const requestId = c.req.header("CF-Ray") ?? crypto.randomUUID();
    c.set("routeTiming", { queryCount: 0, d1DurationMs: 0, d1Warnings: [], requestId });
    c.header("X-Request-Id", requestId);
    await next();
    const durationMs = Date.now() - start;
    appendServerTiming(c, durationMs);
    appendPrivateCacheHeader(c);
    const timing = timingState(c);
    logSlowApi({
      method: c.req.method,
      routePattern: safeRoutePattern(c),
      durationMs,
      status: c.res.status,
      queryCount: timing.queryCount,
      d1DurationMs: timing.d1DurationMs,
      payloadBytes: payloadBytes(c),
      userId: safeUserId(c),
      requestId
    });
    const metricWrite = recordApiPerformanceMetric(c, {
      requestId,
      routeKey: safeRoutePattern(c),
      method: c.req.method,
      statusCode: c.res.status,
      durationMs,
      d1QueryCount: timing.queryCount,
      d1DurationMs: timing.d1DurationMs,
      payloadBytes: payloadBytes(c),
      cacheHint: c.res.headers.get("Cache-Control"),
      userId: safeUserId(c)
    });
    executionCtx(c)?.waitUntil(metricWrite);
  };
}
