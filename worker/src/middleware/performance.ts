import {
  API_CRITICAL_THRESHOLD_MS,
  API_WARNING_THRESHOLD_MS,
  appendServerTiming,
  logSlowApi,
  timeD1,
  withRequestTiming
} from "../utils/performance";

export {
  appendServerTiming,
  logSlowApi,
  timeD1,
  withRequestTiming,
  withRequestTiming as withRouteTiming,
  timeD1 as measureD1Query
} from "../utils/performance";

export const SLOW_ROUTE_WARN_MS = 750;
export const SLOW_ROUTE_CRITICAL_MS = 2000;

type SlowRouteMetadata = {
  duration_ms: number;
  d1_query_count: number;
  route_pattern: string;
  method?: string;
  status?: number;
  d1_duration_ms?: number;
};

export function logSlowRoute(metadata: SlowRouteMetadata) {
  const d1DurationMs = metadata.d1_duration_ms ?? 0;
  if (metadata.duration_ms < API_WARNING_THRESHOLD_MS && d1DurationMs < API_CRITICAL_THRESHOLD_MS) {
    return;
  }
  logSlowApi({
    durationMs: metadata.duration_ms,
    method: metadata.method ?? "UNKNOWN",
    routePattern: metadata.route_pattern,
    status: metadata.status ?? 0,
    queryCount: metadata.d1_query_count,
    d1DurationMs,
    payloadBytes: 0,
    userId: null
  });
}
