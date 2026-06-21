import type { AuthUser } from "../types";
import { realtimeEvent, serializeRealtimeEvent, type RealtimeChannel, type RealtimeClientMessage } from "./events";

const SUPPORTED_CHANNELS = new Set<RealtimeChannel>([
  "dashboard",
  "notifications",
  "leave",
  "attendance",
  "roster",
  "documents",
  "devices"
]);

function send(webSocket: WebSocket, event: ReturnType<typeof realtimeEvent>) {
  webSocket.send(serializeRealtimeEvent(event));
}

function parseClientMessage(data: string | ArrayBuffer): RealtimeClientMessage | null {
  if (typeof data !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as RealtimeClientMessage;
    if (parsed.type === "ping" || parsed.type === "subscribe" || parsed.type === "unsubscribe") {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

export function createRealtimeSession(server: WebSocket, user: AuthUser) {
  const subscribedChannels = new Set<RealtimeChannel>();
  server.accept();

  send(
    server,
    realtimeEvent("connection.ready", "system", {
      user_id: user.id,
      channels_available: Array.from(SUPPORTED_CHANNELS),
      realtime_scope: "single-worker-session-placeholder"
    })
  );

  server.addEventListener("message", (event) => {
    const message = parseClientMessage(event.data);
    if (!message) {
      send(server, realtimeEvent("connection.error", "system", { message: "Unsupported realtime message." }));
      return;
    }

    if (message.type === "ping") {
      send(server, realtimeEvent("heartbeat.pong", "system", { ok: true }));
      return;
    }

    if (!message.channel || !SUPPORTED_CHANNELS.has(message.channel)) {
      send(server, realtimeEvent("connection.error", "system", { message: "Unsupported realtime channel." }));
      return;
    }

    if (message.type === "subscribe") {
      subscribedChannels.add(message.channel);
    } else {
      subscribedChannels.delete(message.channel);
    }

    send(
      server,
      realtimeEvent("subscription.ack", message.channel, {
        channel: message.channel,
        subscribed: message.type === "subscribe",
        subscribed_channels: Array.from(subscribedChannels)
      })
    );
  });
}
