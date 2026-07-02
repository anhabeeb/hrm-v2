import { useEffect, useMemo, useRef } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { appEventsApi, type AppEvent } from "../lib/appEventsApi";
import { createCrossTabSync } from "../lib/crossTabSync";
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

function clampInterval(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_VISIBLE_INTERVAL_MS;
  return Math.min(Math.max(parsed, 10000), 60000);
}

function debugLiveEventLog(event: string, metadata: Record<string, unknown>) {
  if (!isPerformanceDebugEnabled()) return;
  console.debug("[performance:app-events]", { event, ...metadata, created_at: new Date().toISOString() });
}

export function useAppEvents(input: UseAppEventsInput) {
  const scope = useMemo(() => createQueryScope(input.token, input.user), [input.token, input.user]);
  const scopeSignature = useMemo(() => queryScopeSignature(input.token, input.user), [input.token, input.user]);
  const cursorRef = useRef<string | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (!input.enabled || !input.token || !input.user) {
      setLiveEventHealth({ healthy: false, deliveryMode: "idle", lastSeenAt: null });
      return undefined;
    }

    stoppedRef.current = false;
    cursorRef.current = null;
    const sync = createCrossTabSync(scopeSignature, (message) => {
      const event = {
        ...message.event,
        visibility: "COMPANY",
        payload: {},
        cursor: message.event.created_at
      } as AppEvent;
      routeAppEventInvalidation({ event, scope, client: input.queryClient, source: "cross-tab" });
      debugLiveEventLog("cross_tab_event_processed", { event_type: event.event_type, query_keys: event.query_keys.length });
    });

    let timer: number | undefined;
    let abortController: AbortController | null = null;

    async function poll() {
      if (stoppedRef.current || !input.token) return;
      abortController?.abort();
      abortController = new AbortController();
      const startedAt = performance.now();
      try {
        const response = await appEventsApi.since(input.token, {
          cursor: cursorRef.current,
          limit: 75,
          signal: abortController.signal
        });
        cursorRef.current = response.next_cursor ?? cursorRef.current;
        for (const event of response.events) {
          routeAppEventInvalidation({ event, scope, client: input.queryClient, source: "poll" });
          sync.broadcastAppEvent(event);
        }
        setLiveEventHealth({ healthy: true, deliveryMode: response.delivery_mode, lastSeenAt: Date.now() });
        debugLiveEventLog("poll_completed", {
          delivery_mode: response.delivery_mode,
          processed_count: response.events.length,
          duration_ms: Math.round(performance.now() - startedAt)
        });
        const serverInterval = clampInterval(response.poll_interval_ms);
        const interval = typeof document !== "undefined" && document.visibilityState === "hidden"
          ? Math.max(serverInterval, HIDDEN_INTERVAL_MS)
          : serverInterval;
        timer = window.setTimeout(poll, interval);
      } catch (error) {
        if (abortController?.signal.aborted || stoppedRef.current) return;
        setLiveEventHealth({ healthy: false, deliveryMode: "polling_fallback", lastSeenAt: null });
        debugLiveEventLog("poll_failed", { message: error instanceof Error ? error.message : "Unknown app event polling error" });
        timer = window.setTimeout(poll, ERROR_BACKOFF_MS);
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(poll, 500);
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    timer = window.setTimeout(poll, 500);

    return () => {
      stoppedRef.current = true;
      if (timer) window.clearTimeout(timer);
      abortController?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      sync.close();
      setLiveEventHealth({ healthy: false, deliveryMode: "idle", lastSeenAt: null });
    };
  }, [input.enabled, input.queryClient, input.token, input.user, scope, scopeSignature]);
}
