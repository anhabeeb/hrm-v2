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

const MAX_API_TIMINGS = 100;
const apiTimings: ApiTimingEntry[] = [];

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

export function getApiPerformanceSnapshot() {
  return {
    total_recorded_api_requests: apiTimings.length,
    recent_api_timings: [...apiTimings]
  };
}
