import type { AuthUser } from "../types/auth";
import { apiClient } from "./apiClient";
import { isPerformanceDebugEnabled } from "./debugFlags";

export type FrontendPerformanceMetricType =
  | "ROUTE_LOAD"
  | "ROUTE_TRANSITION"
  | "API_CLIENT"
  | "CACHE_HIT"
  | "CACHE_MISS"
  | "INTERACTION"
  | "CHUNK_LOAD";

export interface FrontendPerformanceMetric {
  session_metric_id?: string | null;
  route_key: string;
  metric_type: FrontendPerformanceMetricType;
  duration_ms?: number | null;
  metadata_json?: Record<string, unknown> | null;
}

const MAX_BATCH_SIZE = 20;
const FLUSH_DELAY_MS = 6000;
const ROUTE_LOAD_WARNING_MS = 1500;
const NORMAL_SAMPLE_RATE = 0.1;
const SENSITIVE_METADATA_KEY = /(password|token|secret|cookie|authorization|salary|payroll|bank|account|document_number|file_name|raw|body|response|header)/i;

let activeToken: string | null = null;
let sessionMetricId = createSessionMetricId();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
const queue: FrontendPerformanceMetric[] = [];

function createSessionMetricId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `session_metric_${crypto.randomUUID()}`;
  return `session_metric_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function shouldSendMetric(metric: FrontendPerformanceMetric) {
  if ((metric.duration_ms ?? 0) >= ROUTE_LOAD_WARNING_MS) return true;
  if (metric.metric_type === "CACHE_MISS") return true;
  if (isPerformanceDebugEnabled()) return true;
  return stableHash(`${sessionMetricId}:${metric.metric_type}:${metric.route_key}`) / 0xffffffff < NORMAL_SAMPLE_RATE;
}

function safeRouteKey(routeKey: string) {
  try {
    const url = new URL(routeKey, window.location.origin);
    return url.pathname
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, ":id")
      .replace(/\b[A-Za-z0-9_-]{24,}\b/g, ":id")
      .slice(0, 220);
  } catch {
    return String(routeKey).split("?")[0].slice(0, 220);
  }
}

function sanitizeMetadata(input?: Record<string, unknown> | null) {
  if (!input) return null;
  const output: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(input)) {
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
      output[key.slice(0, 60)] = value.replace(/[^\w .:/-]/g, "").slice(0, 180);
    }
  }
  return Object.keys(output).length ? output : null;
}

export function registerPerformanceMetricsSession(token: string | null, user: AuthUser | null) {
  activeToken = token;
  if (!token || !user) {
    queue.length = 0;
    sessionMetricId = createSessionMetricId();
    return;
  }
}

export function enqueueFrontendMetric(metric: FrontendPerformanceMetric) {
  if (!activeToken) return;
  const routeKey = safeRouteKey(metric.route_key);
  if (routeKey.startsWith("/api/v1/performance")) return;
  const safeMetric: FrontendPerformanceMetric = {
    session_metric_id: metric.session_metric_id ?? sessionMetricId,
    route_key: routeKey,
    metric_type: metric.metric_type,
    duration_ms: metric.duration_ms == null ? null : Math.max(0, Math.round(metric.duration_ms)),
    metadata_json: sanitizeMetadata(metric.metadata_json)
  };
  if (!shouldSendMetric(safeMetric)) return;
  queue.push(safeMetric);
  if (queue.length >= MAX_BATCH_SIZE) {
    void flushPerformanceMetrics();
    return;
  }
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flushPerformanceMetrics();
    }, FLUSH_DELAY_MS);
  }
}

export async function flushPerformanceMetrics() {
  if (!activeToken || flushing || !queue.length) return;
  flushing = true;
  const batch = queue.splice(0, MAX_BATCH_SIZE);
  try {
    await apiClient.post<{ accepted: number; inserted: number }>("/api/v1/performance/frontend-metrics", { metrics: batch }, {
      token: activeToken,
      dedupe: false,
      requestLabel: "performance.frontend-metrics"
    });
  } catch {
    // Observability is best-effort; collection failure must never break the app or show alerts.
  } finally {
    flushing = false;
  }
}

export function recordInteractionMetric(name: string, durationMs: number, routeKey = typeof window !== "undefined" ? window.location.pathname : "/") {
  enqueueFrontendMetric({
    route_key: routeKey,
    metric_type: "INTERACTION",
    duration_ms: durationMs,
    metadata_json: { interaction: name }
  });
}
