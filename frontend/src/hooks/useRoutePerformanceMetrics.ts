import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import type { AuthUser } from "../types/auth";
import { recordRouteLoadDuration } from "../lib/performance";

function registerSession(token: string | null, user: AuthUser | null) {
  void import("../lib/performanceMetrics")
    .then(({ registerPerformanceMetricsSession }) => registerPerformanceMetricsSession(token, user))
    .catch(() => undefined);
}

function enqueueMetric(input: {
  route_key: string;
  metric_type: "ROUTE_LOAD" | "ROUTE_TRANSITION" | "API_CLIENT" | "CACHE_HIT" | "CACHE_MISS" | "INTERACTION" | "CHUNK_LOAD";
  duration_ms?: number | null;
  metadata_json?: Record<string, unknown> | null;
}) {
  void import("../lib/performanceMetrics")
    .then(({ enqueueFrontendMetric }) => enqueueFrontendMetric(input))
    .catch(() => undefined);
}

function flushMetrics() {
  void import("../lib/performanceMetrics")
    .then(({ flushPerformanceMetrics }) => flushPerformanceMetrics())
    .catch(() => undefined);
}

export function useRoutePerformanceMetrics(token: string | null, user: AuthUser | null) {
  const location = useLocation();
  const startedAtRef = useRef<number>(typeof performance !== "undefined" ? performance.now() : Date.now());
  const previousRouteRef = useRef<string | null>(null);

  useEffect(() => {
    registerSession(token, user);
    return () => {
      flushMetrics();
    };
  }, [token, user]);

  useEffect(() => {
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const routeKey = `${location.pathname}${location.search ? "?..." : ""}`;
    const previousRoute = previousRouteRef.current;
    const durationMs = Math.max(0, now - startedAtRef.current);
    if (previousRoute) {
      recordRouteLoadDuration(previousRoute, durationMs);
      enqueueMetric({
        route_key: previousRoute,
        metric_type: "ROUTE_TRANSITION",
        duration_ms: durationMs,
        metadata_json: { to_route: location.pathname }
      });
    }
    startedAtRef.current = now;
    previousRouteRef.current = routeKey;

    const idleWindow = typeof window === "undefined" ? null : window;
    const recordSettled = () => {
      const settledAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      const settledDuration = Math.max(0, settledAt - now);
      recordRouteLoadDuration(routeKey, settledDuration);
      enqueueMetric({
        route_key: routeKey,
        metric_type: "ROUTE_LOAD",
        duration_ms: settledDuration,
        metadata_json: { route_settled: true }
      });
    };

    if (idleWindow && "requestIdleCallback" in idleWindow) {
      const handle = idleWindow.requestIdleCallback(recordSettled, { timeout: 2200 });
      return () => idleWindow.cancelIdleCallback?.(handle);
    }
    const handle = globalThis.setTimeout(recordSettled, 800);
    return () => globalThis.clearTimeout(handle);
  }, [location.pathname, location.search]);
}
