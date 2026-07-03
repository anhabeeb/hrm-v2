import { apiClient } from "./apiClient";

export type AppEventDeliveryMode = "stream" | "long-poll" | "polling_fallback";

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
    return apiClient.get<{ stream_available: boolean; delivery_mode: AppEventDeliveryMode; message: string }>("/api/v1/app-events/stream", {
      token,
      signal,
      dedupe: false
    });
  }
};
