import { useEffect, useMemo, useRef } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { appEventsApi, type AppEvent, type AppEventClientStatus, type AppEventDeliveryMode } from "../lib/appEventsApi";
import { createCrossTabLeader, createCrossTabSync } from "../lib/crossTabSync";
import { isPerformanceDebugEnabled } from "../lib/debugFlags";
import { setLiveEventHealth } from "../lib/liveEventStatus";
import { createQueryScope, queryScopeSignature } from "../lib/queryKeys";
import { routeAppEventInvalidation } from "../lib/queryInvalidationRouter";
import type { AuthUser } from "../types/auth";

type UseAppEventsInput = {
  token: string | null;
  user: AuthUser | null;
  enabled: boolean;
  queryClient: QueryClient;
};

const DEFAULT_VISIBLE_INTERVAL_MS = 30000;
const HIDDEN_INTERVAL_MS = 60000;
const ERROR_BACKOFF_MS = 45000;
const STREAM_RECONNECT_BASE_MS = 2000;
const STREAM_RECONNECT_MAX_MS = 30000;
const STREAM_MAX_RECONNECT_ATTEMPTS = 2;
const STREAM_RETRY_WINDOW_MS = 5 * 60 * 1000;
const PROCESSED_EVENT_LIMIT = 400;

type SseFrame = {
  event: string;
  id: string | null;
  retry: number | null;
  data: unknown;
};

function clampInterval(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_VISIBLE_INTERVAL_MS;
  return Math.min(Math.max(parsed, 10000), 60000);
}

function debugLiveEventLog(event: string, metadata: Record<string, unknown>) {
  if (!isPerformanceDebugEnabled()) return;
  console.debug("[performance:app-events]", { event, ...metadata, created_at: new Date().toISOString() });
}

function recordLiveEventMetric(input: { status: AppEventClientStatus; deliveryMode: AppEventDeliveryMode | "idle"; durationMs?: number; events?: number; reconnects?: number; invalidations?: number; fallback?: boolean }) {
  void import("../lib/performanceMetrics")
    .then(({ enqueueFrontendMetric }) => enqueueFrontendMetric({
      route_key: "live-events",
      metric_type: "INTERACTION",
      duration_ms: input.durationMs ?? null,
      metadata_json: {
        live_status: input.status,
        delivery_mode: input.deliveryMode,
        events_received: input.events ?? 0,
        reconnect_count: input.reconnects ?? 0,
        invalidations_triggered: input.invalidations ?? 0,
        fallback_active: Boolean(input.fallback)
      }
    }))
    .catch(() => undefined);
}

function parseSseFrame(raw: string): SseFrame | null {
  const lines = raw.split(/\r?\n/);
  let event = "message";
  let id: string | null = null;
  let retry: number | null = null;
  const dataLines: string[] = [];
  for (const line of lines) {
    if (!line || line.startsWith(":")) continue;
    const separator = line.indexOf(":");
    const field = separator >= 0 ? line.slice(0, separator) : line;
    const value = separator >= 0 ? line.slice(separator + 1).replace(/^ /, "") : "";
    if (field === "event") event = value || "message";
    if (field === "id") id = value || null;
    if (field === "retry") {
      const parsed = Number(value);
      retry = Number.isFinite(parsed) ? parsed : null;
    }
    if (field === "data") dataLines.push(value);
  }
  if (!dataLines.length && event === "message" && !id) return null;
  let data: unknown = null;
  if (dataLines.length) {
    const text = dataLines.join("\n");
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  return { event, id, retry, data };
}

function toAppEvent(frame: SseFrame): AppEvent | null {
  if (!frame.data || typeof frame.data !== "object") return null;
  const data = frame.data as Partial<AppEvent>;
  if (!data.id || !data.event_type || !data.created_at) return null;
  return {
    id: String(data.id),
    event_type: String(data.event_type),
    module_key: String(data.module_key ?? "general"),
    entity_type: data.entity_type ?? null,
    entity_id: data.entity_id ?? null,
    visibility: data.visibility ?? "COMPANY",
    payload: data.payload && typeof data.payload === "object" ? data.payload as Record<string, unknown> : {},
    query_keys: Array.isArray(data.query_keys) ? data.query_keys.map(String).slice(0, 24) : [],
    created_at: String(data.created_at),
    cursor: String(data.cursor ?? frame.id ?? data.created_at)
  };
}

export function useAppEvents(input: UseAppEventsInput) {
  const scope = useMemo(() => createQueryScope(input.token, input.user), [input.token, input.user]);
  const scopeSignature = useMemo(() => queryScopeSignature(input.token, input.user), [input.token, input.user]);
  const cursorRef = useRef<string | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (!input.enabled || !input.token || !input.user) {
      setLiveEventHealth({ healthy: false, deliveryMode: "idle", status: "idle", lastSeenAt: null });
      return undefined;
    }

    stoppedRef.current = false;
    cursorRef.current = null;
    const processedEventIds: string[] = [];
    const processedSet = new Set<string>();
    let streamAbortController: AbortController | null = null;
    let pollAbortController: AbortController | null = null;
    let pollTimer: number | undefined;
    let reconnectTimer: number | undefined;
    let reconnectCount = 0;
    let receivedCount = 0;
    let streamStartedAt = 0;
    let currentDeliveryMode: AppEventDeliveryMode | "idle" = "idle";
    let leaderActive = false;
    let streamFallbackLocked = false;
    let nextStreamRetryAt = 0;

    function rememberEvent(id: string) {
      if (processedSet.has(id)) return false;
      processedSet.add(id);
      processedEventIds.push(id);
      while (processedEventIds.length > PROCESSED_EVENT_LIMIT) {
        const old = processedEventIds.shift();
        if (old) processedSet.delete(old);
      }
      return true;
    }

    function updateHealth(status: AppEventClientStatus | "idle", options: Partial<Parameters<typeof setLiveEventHealth>[0]> = {}) {
      const healthy = status === "connected" || status === "fallback_polling";
      setLiveEventHealth({
        healthy,
        deliveryMode: options.deliveryMode ?? currentDeliveryMode,
        status,
        lastSeenAt: options.lastSeenAt ?? (healthy ? Date.now() : null),
        reconnectCount,
        fallbackActive: status === "fallback_polling",
        lastEventId: cursorRef.current,
        recentEventCount: receivedCount,
        streamError: options.streamError ?? null,
        leader: leaderActive,
        ...options
      });
    }

    function processEvent(event: AppEvent, source: "stream" | "poll" | "cross-tab") {
      if (!rememberEvent(event.id)) return 0;
      cursorRef.current = event.cursor ?? event.created_at ?? cursorRef.current;
      receivedCount += 1;
      const invalidations = routeAppEventInvalidation({ event, scope, client: input.queryClient, source });
      if (source !== "cross-tab") sync.broadcastAppEvent(event);
      debugLiveEventLog(`${source}_event_processed`, { event_type: event.event_type, query_keys: event.query_keys.length, invalidations });
      return invalidations;
    }

    const sync = createCrossTabSync(scopeSignature, (message) => {
      const event = {
        ...message.event,
        visibility: "COMPANY",
        payload: {},
        cursor: message.event.created_at
      } as AppEvent;
      processEvent(event, "cross-tab");
      currentDeliveryMode = "fetch_stream";
      updateHealth("connected", { deliveryMode: "fetch_stream", leader: false });
    });

    function clearTimers() {
      if (pollTimer) window.clearTimeout(pollTimer);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      pollTimer = undefined;
      reconnectTimer = undefined;
    }

    function stopNetwork() {
      clearTimers();
      // Phase 9 compatibility: abortController?.abort() is now split by stream and polling controllers.
      streamAbortController?.abort();
      pollAbortController?.abort();
      streamAbortController = null;
      pollAbortController = null;
    }

    async function pollFallback(reason = "fallback") {
      if (stoppedRef.current || !input.token || !leaderActive) return;
      pollAbortController?.abort();
      pollAbortController = new AbortController();
      currentDeliveryMode = "polling_fallback";
      updateHealth("fallback_polling", { deliveryMode: "polling_fallback" });
      const startedAt = performance.now();
      try {
        const response = await appEventsApi.since(input.token, {
          cursor: cursorRef.current,
          limit: 75,
          signal: pollAbortController.signal
        });
        currentDeliveryMode = response.delivery_mode;
        let invalidations = 0;
        for (const event of response.events) invalidations += processEvent(event, "poll");
        updateHealth("fallback_polling", { deliveryMode: response.delivery_mode, lastSeenAt: Date.now() });
        recordLiveEventMetric({ status: "fallback_polling", deliveryMode: response.delivery_mode, durationMs: performance.now() - startedAt, events: response.events.length, reconnects: reconnectCount, invalidations, fallback: true });
        debugLiveEventLog("poll_completed", {
          reason,
          delivery_mode: response.delivery_mode,
          processed_count: response.events.length,
          duration_ms: Math.round(performance.now() - startedAt)
        });
        const serverInterval = clampInterval(response.poll_interval_ms);
        const interval = typeof document !== "undefined" && document.visibilityState === "hidden"
          ? Math.max(serverInterval, HIDDEN_INTERVAL_MS)
          : serverInterval;
        pollTimer = window.setTimeout(() => void pollFallback("scheduled"), interval);
      } catch (error) {
        if (pollAbortController?.signal.aborted || stoppedRef.current) return;
        updateHealth("error", { deliveryMode: "polling_fallback", streamError: error instanceof Error ? error.message : "Polling fallback failed." });
        debugLiveEventLog("poll_failed", { message: error instanceof Error ? error.message : "Unknown app event polling error" });
        pollTimer = window.setTimeout(() => void pollFallback("error-backoff"), ERROR_BACKOFF_MS);
      }
    }

    function scheduleReconnect(reason: string) {
      if (stoppedRef.current || !leaderActive) return;
      reconnectCount += 1;
      if (reconnectCount >= STREAM_MAX_RECONNECT_ATTEMPTS) {
        streamFallbackLocked = true;
        nextStreamRetryAt = Date.now() + STREAM_RETRY_WINDOW_MS;
        streamAbortController?.abort();
        streamAbortController = null;
        updateHealth("fallback_polling", {
          deliveryMode: "polling_fallback",
          streamError: `${reason}; using polling fallback until the stream retry window opens.`
        });
        void pollFallback("stream-unhealthy");
        reconnectTimer = window.setTimeout(() => {
          if (stoppedRef.current || !leaderActive || Date.now() < nextStreamRetryAt) return;
          streamFallbackLocked = false;
          reconnectCount = 0;
          void connectStream();
        }, STREAM_RETRY_WINDOW_MS);
        return;
      }
      const delay = Math.min(STREAM_RECONNECT_MAX_MS, STREAM_RECONNECT_BASE_MS * 2 ** Math.min(reconnectCount, 5));
      updateHealth("reconnecting", { deliveryMode: currentDeliveryMode === "idle" ? "fetch_stream" : currentDeliveryMode, streamError: reason });
      void pollFallback("stream-reconnect");
      reconnectTimer = window.setTimeout(() => void connectStream(), delay);
    }

    async function consumeStream(response: Response) {
      if (!response.body) throw new Error("Live event stream response body is unavailable.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (!stoppedRef.current && leaderActive) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split(/\n\n|\r\n\r\n/);
        buffer = frames.pop() ?? "";
        for (const rawFrame of frames) {
          const frame = parseSseFrame(rawFrame);
          if (!frame) continue;
          if (frame.event === "heartbeat" || frame.event === "stream.open") {
            updateHealth("connected", { deliveryMode: currentDeliveryMode, lastSeenAt: Date.now() });
            continue;
          }
          if (frame.event === "stream.close") return;
          if (frame.event === "stream.error") throw new Error("Live event stream requested reconnect.");
          const appEvent = toAppEvent(frame);
          if (!appEvent) continue;
          const invalidations = processEvent(appEvent, "stream");
          updateHealth("connected", { deliveryMode: currentDeliveryMode, lastSeenAt: Date.now() });
          recordLiveEventMetric({ status: "connected", deliveryMode: currentDeliveryMode, events: 1, reconnects: reconnectCount, invalidations });
        }
      }
    }

    async function connectStream() {
      if (stoppedRef.current || !input.token || !leaderActive) return;
      if (streamFallbackLocked && Date.now() < nextStreamRetryAt) {
        void pollFallback("stream-fallback-locked");
        return;
      }
      if (pollTimer) window.clearTimeout(pollTimer);
      pollTimer = undefined;
      streamAbortController?.abort();
      streamAbortController = new AbortController();
      currentDeliveryMode = "fetch_stream";
      streamStartedAt = performance.now();
      updateHealth(reconnectCount ? "reconnecting" : "connecting", { deliveryMode: "fetch_stream" });
      try {
        const response = await appEventsApi.connectStream(input.token, {
          cursor: cursorRef.current,
          signal: streamAbortController.signal
        });
        if (!response.ok) throw new Error(`Live event stream unavailable (${response.status}).`);
        const contentType = response.headers.get("Content-Type") ?? "";
        if (!contentType.includes("text/event-stream")) throw new Error("Live event stream returned a non-stream response.");
        streamFallbackLocked = false;
        nextStreamRetryAt = 0;
        reconnectCount = 0;
        currentDeliveryMode = "fetch_stream";
        updateHealth("connected", { deliveryMode: "fetch_stream", lastSeenAt: Date.now() });
        await consumeStream(response);
        if (!stoppedRef.current && leaderActive) {
          recordLiveEventMetric({ status: "connected", deliveryMode: "fetch_stream", durationMs: performance.now() - streamStartedAt, events: receivedCount, reconnects: reconnectCount });
          scheduleReconnect("stream-ended");
        }
      } catch (error) {
        if (streamAbortController?.signal.aborted || stoppedRef.current) return;
        debugLiveEventLog("stream_failed", { message: error instanceof Error ? error.message : "Unknown stream error" });
        scheduleReconnect(error instanceof Error ? error.message : "stream failed");
      }
    }

    function onVisibilityChange() {
      if (!leaderActive) return;
      if (document.visibilityState === "visible") {
        if (pollTimer) window.clearTimeout(pollTimer);
        if (streamFallbackLocked) void pollFallback("visible-fallback");
        else if (!streamAbortController) void connectStream();
      }
    }

    const leader = createCrossTabLeader(scopeSignature, (isLeader) => {
      leaderActive = isLeader;
      stopNetwork();
      if (isLeader) {
        void connectStream();
      } else {
        currentDeliveryMode = "fetch_stream";
        updateHealth("connected", { deliveryMode: "fetch_stream", leader: false });
      }
    });
    leaderActive = leader.isLeader();
    if (!leaderActive) {
      currentDeliveryMode = "fetch_stream";
      updateHealth("connected", { deliveryMode: "fetch_stream", leader: false });
    }

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stoppedRef.current = true;
      stopNetwork();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      leader.close();
      sync.close();
      setLiveEventHealth({ healthy: false, deliveryMode: "idle", status: "idle", lastSeenAt: null });
    };
  }, [input.enabled, input.queryClient, input.token, input.user, scope, scopeSignature]);
}
