import { Hono } from "hono";
import type { Context } from "hono";
import { requireAuth } from "../middleware/auth";
import type { AppBindings } from "../types";
import { cleanupExpiredEvents, listAppEventsSince } from "../utils/app-events";
import { ok } from "../utils/http";
import { readString } from "../utils/validation";

export const appEventRoutes = new Hono<AppBindings>();

appEventRoutes.use("*", requireAuth);
appEventRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Vary", "Authorization, Origin");
  await next();
});

function executionCtx(c: Context<AppBindings>) {
  return (c as unknown as { executionCtx?: ExecutionContext }).executionCtx;
}

appEventRoutes.get("/since", async (c) => {
  const startedAt = Date.now();
  const cursor = readString(c.req.query("cursor")) || null;
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 50), 1), 100);
  const result = await listAppEventsSince(c.env.DB, c.get("currentUser"), { cursor, limit });
  executionCtx(c)?.waitUntil(cleanupExpiredEvents(c.env.DB));
  return ok(c, {
    delivery_mode: "polling_fallback",
    events: result.events,
    next_cursor: result.nextCursor,
    poll_interval_ms: result.events.length ? 12000 : 30000,
    processed_count: result.events.length,
    duration_ms: Date.now() - startedAt,
    server_time: new Date().toISOString()
  });
});

appEventRoutes.get("/stream", async (c) => {
  return ok(c, {
    stream_available: false,
    delivery_mode: "polling_fallback",
    message: "SSE is intentionally deferred for this Worker deployment. Use /api/v1/app-events/since for authenticated scoped event polling."
  });
});
