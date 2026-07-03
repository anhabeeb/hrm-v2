import { API_BASE_URL, apiClient } from "./apiClient";
import { createApiRequestId } from "./performance";

export type AppEventDeliveryMode = "sse" | "fetch_stream" | "polling_fallback";
export type AppEventClientStatus = "disconnected" | "connecting" | "connected" | "reconnecting" | "fallback_polling" | "error";

export interface AppEvent {
  id: string;
  event_type: string;
  module_key: string;
  entity_type: string | null;
  entity_id: string | null;
  visibility: "USER" | "ROLE" | "COMPANY" | "SYSTEM";
  payload: Record<string, unknown>;
  query_keys: string[];
  created_at: string;
  cursor: string;
}

export interface AppEventsSinceResponse {
  delivery_mode: AppEventDeliveryMode;
  events: AppEvent[];
  next_cursor: string;
  poll_interval_ms: number;
  processed_count: number;
  duration_ms: number;
  server_time: string;
}

export interface AppEventsStreamStatusResponse {
  stream_available: boolean;
  delivery_mode: AppEventDeliveryMode;
  requested_mode?: string;
  heartbeat_seconds?: number;
  max_duration_seconds?: number;
  poll_interval_ms?: number;
  reconnect_base_ms?: number;
  reconnect_max_ms?: number;
  message: string;
}

export const appEventsApi = {
  since(token: string, input: { cursor?: string | null; limit?: number; signal?: AbortSignal }) {
    const search = new URLSearchParams();
    if (input.cursor) search.set("cursor", input.cursor);
    if (input.limit) search.set("limit", String(input.limit));
    const query = search.toString();
    return apiClient.get<AppEventsSinceResponse>(`/api/v1/app-events/since${query ? `?${query}` : ""}`, {
      token,
      signal: input.signal,
      dedupe: false,
      timeoutMs: 20000
    });
  },
  streamStatus(token: string, signal?: AbortSignal) {
    return apiClient.get<AppEventsStreamStatusResponse>("/api/v1/app-events/stream?status=1", {
      token,
      signal,
      dedupe: false
    });
  },
  connectStream(token: string, input: { cursor?: string | null; signal?: AbortSignal }) {
    const headers = new Headers();
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("Accept", "text/event-stream");
    headers.set("X-Request-ID", createApiRequestId());
    if (input.cursor) headers.set("Last-Event-ID", input.cursor);
    return fetch(`${API_BASE_URL}/api/v1/app-events/stream`, {
      method: "GET",
      headers,
      cache: "no-store",
      signal: input.signal
    });
  }
};
