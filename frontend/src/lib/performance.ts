import { isPerformanceDebugEnabled } from "./debugFlags";

export type ApiCacheDisposition = "network" | "deduped" | "cache-hit" | "cache-miss" | "background-refresh";

export interface ApiTimingEntry {
  method: string;
  path: string;
  status: number | null;
  durationMs: number;
  requestId: string;
  cache: ApiCacheDisposition;
  serverTiming?: string | null;
  createdAt: string;
}

export interface WorkspaceQueryMetric {
  workspace: string;
  queryKey: string;
  event: "first-load" | "cache-hit" | "background-refresh" | "settled" | "error";
  createdAt: string;
}

const MAX_API_TIMINGS = 100;
const MAX_WORKSPACE_METRICS = 100;
const apiTimings: ApiTimingEntry[] = [];
const workspaceMetrics: WorkspaceQueryMetric[] = [];

function safePath(path: string) {
  try {
    const url = new URL(path, "https://local.hrm");
    return `${url.pathname}${url.search ? "?..." : ""}`;
  } catch {
    return path.split("?")[0] ?? path;
  }
}

export function createApiRequestId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `api_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function recordApiRequestTiming(entry: Omit<ApiTimingEntry, "createdAt">) {
  const safeEntry: ApiTimingEntry = {
    ...entry,
    path: safePath(entry.path),
    durationMs: Math.round(entry.durationMs),
    createdAt: new Date().toISOString()
  };
  apiTimings.push(safeEntry);
  if (apiTimings.length > MAX_API_TIMINGS) apiTimings.splice(0, apiTimings.length - MAX_API_TIMINGS);
  if (isPerformanceDebugEnabled()) {
    console.debug("[performance:api]", safeEntry);
  }
}

export function recordRouteLoadDuration(routeId: string, durationMs: number, apiRequestCount?: number) {
  if (!isPerformanceDebugEnabled()) return;
  console.debug("[performance:route]", {
    route_id: routeId,
    duration_ms: Math.round(durationMs),
    api_request_count: apiRequestCount ?? null,
    created_at: new Date().toISOString()
  });
}

export function recordCacheEvent(input: { key: readonly unknown[] | string; disposition: ApiCacheDisposition; source: string }) {
  if (!isPerformanceDebugEnabled()) return;
  console.debug("[performance:cache]", {
    key: Array.isArray(input.key) ? input.key.join(":") : input.key,
    disposition: input.disposition,
    source: input.source,
    created_at: new Date().toISOString()
  });
}

function safeQueryKey(key: readonly unknown[] | string) {
  const text = Array.isArray(key) ? key.map((part) => String(part)).join(":") : String(key);
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

export function recordWorkspaceQueryMetric(input: {
  workspace: string;
  queryKey: readonly unknown[] | string;
  event: WorkspaceQueryMetric["event"];
}) {
  const metric: WorkspaceQueryMetric = {
    workspace: input.workspace,
    queryKey: safeQueryKey(input.queryKey),
    event: input.event,
    createdAt: new Date().toISOString()
  };
  workspaceMetrics.push(metric);
  if (workspaceMetrics.length > MAX_WORKSPACE_METRICS) workspaceMetrics.splice(0, workspaceMetrics.length - MAX_WORKSPACE_METRICS);
  if (isPerformanceDebugEnabled()) {
    console.debug("[performance:workspace]", metric);
  }
}

export function getApiPerformanceSnapshot() {
  return {
    total_recorded_api_requests: apiTimings.length,
    recent_api_timings: [...apiTimings],
    recent_workspace_metrics: [...workspaceMetrics]
  };
}
