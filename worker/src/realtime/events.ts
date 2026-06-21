export type RealtimeChannel =
  | "dashboard"
  | "notifications"
  | "leave"
  | "attendance"
  | "roster"
  | "documents"
  | "payroll"
  | "assets"
  | "audit"
  | "devices";

export type RealtimeEventType =
  | "connection.ready"
  | "connection.error"
  | "heartbeat.pong"
  | "subscription.ack"
  | "notification.created"
  | "leave.approval.updated"
  | "attendance.correction.updated"
  | "roster.updated"
  | "documents.alert.updated"
  | "dashboard.counter.updated"
  | "devices.sync.updated";

export interface RealtimeEnvelope<T = unknown> {
  id: string;
  type: RealtimeEventType;
  channel: RealtimeChannel | "system";
  payload: T;
  created_at: string;
}

export interface RealtimeClientMessage {
  type: "ping" | "subscribe" | "unsubscribe";
  channel?: RealtimeChannel;
}

export function realtimeEvent<T>(type: RealtimeEventType, channel: RealtimeEnvelope["channel"], payload: T): RealtimeEnvelope<T> {
  return {
    id: crypto.randomUUID(),
    type,
    channel,
    payload,
    created_at: new Date().toISOString()
  };
}

export function serializeRealtimeEvent(event: RealtimeEnvelope) {
  return JSON.stringify(event);
}
