import type { Context, MiddlewareHandler } from "hono";
import type { AppBindings } from "../types";

const SLOW_ROUTE_WARN_MS = 750;
const SLOW_ROUTE_CRITICAL_MS = 2000;

function safeRoutePattern(c: Context<AppBindings>) {
  return (c.req as { routePath?: string }).routePath ?? c.req.path;
}

function safeUserId(c: Context<AppBindings>) {
  try {
    return c.get("currentUser")?.id ?? null;
  } catch {
    return null;
  }
}

export function logSlowRoute(input: {
  method: string;
  routePattern: string;
  durationMs: number;
  status: number;
  queryCount: number | null;
  userId: string | null;
}) {
  const level = input.durationMs >= SLOW_ROUTE_CRITICAL_MS ? "error" : input.durationMs >= SLOW_ROUTE_WARN_MS ? "warn" : "info";
  if (level === "info") return;
  console.warn(JSON.stringify({
    level,
    event: "worker.route_timing",
    method: input.method,
    route_pattern: input.routePattern,
    duration_ms: Math.round(input.durationMs),
    status: input.status,
    d1_query_count: input.queryCount,
    user_id: input.userId,
    timestamp: new Date().toISOString()
  }));
}

export async function measureD1Query<T>(c: Context<AppBindings>, operation: () => Promise<T>) {
  const timing = c.get("routeTiming");
  if (timing) timing.queryCount += 1;
  return operation();
}

export function withRouteTiming(): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const start = Date.now();
    c.set("routeTiming", { queryCount: 0 });
    await next();
    const durationMs = Date.now() - start;
    logSlowRoute({
      method: c.req.method,
      routePattern: safeRoutePattern(c),
      durationMs,
      status: c.res.status,
      queryCount: c.get("routeTiming")?.queryCount ?? null,
      userId: safeUserId(c)
    });
  };
}
