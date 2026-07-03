import { Hono } from "hono";
import type { Context } from "hono";
import { requireAuth } from "../middleware/auth";
import type { AppBindings } from "../types";
import { cleanupExpiredEvents, getLiveEventStreamConfig, listAppEventsSince } from "../utils/app-events";
import { fail, ok } from "../utils/http";
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeCursor(value: string | null | undefined) {
  const text = readString(value);
  if (!text) return null;
  return /^\d{4}-\d{2}-\d{2}T/.test(text) ? text : null;
}

function encodeSse(input: { event?: string; id?: string | null; data?: unknown; retry?: number; comment?: string }) {
  const lines: string[] = [];
  if (input.comment) lines.push(`: ${input.comment.replace(/\r?\n/g, " ")}`);
  if (input.id) lines.push(`id: ${input.id.replace(/\r?\n/g, "")}`);
  if (input.event) lines.push(`event: ${input.event.replace(/\r?\n/g, "")}`);
  if (input.retry) lines.push(`retry: ${Math.trunc(input.retry)}`);
  if (input.data !== undefined) {
    const json = JSON.stringify(input.data).replace(/\r?\n/g, " ");
    lines.push(`data: ${json}`);
  }
  return `${lines.join("\n")}\n\n`;
}

function streamHeaders() {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "private, no-store",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
    "Vary": "Authorization, Origin, Last-Event-ID"
  };
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
  const config = getLiveEventStreamConfig(c.env);
  const acceptsStream = /text\/event-stream/i.test(c.req.header("Accept") ?? "");
  if (!acceptsStream || c.req.query("status") === "1") {
    return ok(c, {
      stream_available: config.activeMode !== "polling_fallback",
      delivery_mode: config.activeMode,
      requested_mode: config.requestedMode,
      heartbeat_seconds: config.heartbeatSeconds,
      max_duration_seconds: config.maxDurationSeconds,
      poll_interval_ms: config.pollIntervalMs,
      reconnect_base_ms: config.reconnectBaseMs,
      reconnect_max_ms: config.reconnectMaxMs,
      message: config.activeMode === "polling_fallback"
        ? "Live app-event streaming is disabled; authenticated scoped polling remains active."
        : "Live app-event streaming is available. Use Authorization headers; do not place tokens in URLs."
    });
  }

  if (config.activeMode === "polling_fallback") {
    return fail(c, 409, "LIVE_EVENTS_STREAM_DISABLED", "Live app-event streaming is disabled; use polling fallback.");
  }

  const user = c.get("currentUser");
  const startedAt = Date.now();
  const encoder = new TextEncoder();
  const initialCursor = safeCursor(c.req.header("Last-Event-ID")) ?? safeCursor(c.req.query("cursor"));
  const requestSignal = c.req.raw.signal;
  const requestId = c.req.header("x-request-id") ?? c.req.header("x-correlation-id") ?? crypto.randomUUID();
  executionCtx(c)?.waitUntil(cleanupExpiredEvents(c.env.DB));

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let cursor = initialCursor;
      let closed = false;
      let eventsSent = 0;
      const close = () => {
        closed = true;
      };
      requestSignal.addEventListener("abort", close, { once: true });

      function enqueue(input: string) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(input));
        } catch {
          closed = true;
        }
      }

      enqueue(encodeSse({
        event: "stream.open",
        retry: config.reconnectBaseMs,
        data: {
          delivery_mode: config.activeMode,
          server_time: new Date().toISOString(),
          heartbeat_seconds: config.heartbeatSeconds,
          max_duration_seconds: config.maxDurationSeconds
        }
      }));

      while (!closed && Date.now() - startedAt < config.maxDurationMs) {
        const fetchStarted = Date.now();
        try {
          const result = await listAppEventsSince(c.env.DB, user, { cursor, limit: config.batchLimit });
          cursor = result.nextCursor ?? cursor;
          for (const event of result.events) {
            eventsSent += 1;
            enqueue(encodeSse({
              id: event.cursor,
              event: event.event_type || "app-event",
              data: {
                ...event,
                delivery_mode: config.activeMode,
                stream_request_id: requestId
              }
            }));
          }
          if (!result.events.length) {
            enqueue(encodeSse({
              event: "heartbeat",
              comment: "heartbeat",
              data: {
                server_time: new Date().toISOString(),
                cursor,
                delivery_mode: config.activeMode
              }
            }));
          }
          const nextDelay = result.events.length >= config.batchLimit ? 500 : Math.max(config.pollIntervalMs, config.heartbeatMs);
          await sleep(nextDelay);
        } catch (error) {
          console.warn(JSON.stringify({
            level: "warn",
            event: "app_event.stream_batch_failed",
            request_id: requestId,
            duration_ms: Date.now() - fetchStarted,
            message: error instanceof Error ? error.message.slice(0, 160) : "stream batch failed"
          }));
          enqueue(encodeSse({
            event: "stream.error",
            retry: config.reconnectMaxMs,
            data: {
              code: "STREAM_BATCH_FAILED",
              message: "Live event stream will reconnect or fall back to polling.",
              retry_ms: config.reconnectBaseMs
            }
          }));
          break;
        }
      }

      enqueue(encodeSse({
        event: "stream.close",
        retry: config.reconnectBaseMs,
        data: {
          reason: closed ? "client_closed" : "max_duration",
          events_sent: eventsSent,
          uptime_ms: Date.now() - startedAt,
          cursor
        }
      }));
      requestSignal.removeEventListener("abort", close);
      try {
        controller.close();
      } catch {
        // Stream may already be closed by the runtime.
      }
    },
    cancel() {
      // The request signal handles cleanup for aborted browser streams.
    }
  });

  return new Response(stream, { status: 200, headers: streamHeaders() });
});
