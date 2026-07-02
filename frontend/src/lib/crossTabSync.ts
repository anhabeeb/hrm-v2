import type { AppEvent } from "./appEventsApi";

export type CrossTabAppEventMessage = {
  type: "app-event";
  source_tab_id: string;
  scope_signature: string;
  event: Pick<AppEvent, "id" | "event_type" | "module_key" | "entity_type" | "entity_id" | "query_keys" | "created_at">;
};

export type CrossTabSessionMessage = {
  type: "logout" | "scope-change";
  source_tab_id: string;
  scope_signature?: string | null;
};

type CrossTabMessage = CrossTabAppEventMessage | CrossTabSessionMessage;

const CHANNEL_NAME = "omnicore-hr-live-events";
const STORAGE_KEY = "omnicore_hr_live_event_signal";
const SESSION_STORAGE_KEY = "omnicore_hr_session_signal";

function createTabId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `tab_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

const tabId = createTabId();

function safeEventForBroadcast(event: AppEvent): CrossTabAppEventMessage["event"] {
  return {
    id: event.id,
    event_type: event.event_type,
    module_key: event.module_key,
    entity_type: event.entity_type,
    entity_id: event.entity_id,
    query_keys: Array.isArray(event.query_keys) ? event.query_keys.slice(0, 24) : [],
    created_at: event.created_at
  };
}

function parseMessage(value: unknown): CrossTabMessage | null {
  if (!value || typeof value !== "object") return null;
  const maybe = value as Partial<CrossTabMessage>;
  if (!maybe.type || maybe.source_tab_id === tabId) return null;
  if (maybe.type === "app-event" && "event" in maybe) return maybe as CrossTabAppEventMessage;
  if (maybe.type === "logout" || maybe.type === "scope-change") return maybe as CrossTabSessionMessage;
  return null;
}

function postStorageMessage(key: string, message: CrossTabMessage) {
  try {
    window.localStorage.setItem(key, JSON.stringify({ ...message, sent_at: Date.now() }));
  } catch {
    // BroadcastChannel is preferred; storage fallback is best-effort only.
  }
}

export function createCrossTabSync(scopeSignature: string, onMessage: (message: CrossTabAppEventMessage) => void) {
  if (typeof window === "undefined") return { broadcastAppEvent: () => undefined, close: () => undefined };

  const channel = "BroadcastChannel" in window ? new BroadcastChannel(CHANNEL_NAME) : null;

  function handleRawMessage(value: unknown) {
    const message = parseMessage(value);
    if (!message || message.type !== "app-event") return;
    if (message.scope_signature !== scopeSignature) return;
    onMessage(message);
  }

  if (channel) {
    channel.onmessage = (event) => handleRawMessage(event.data);
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      handleRawMessage(JSON.parse(event.newValue));
    } catch {
      // Ignore malformed cross-tab fallback data.
    }
  };
  window.addEventListener("storage", onStorage);

  return {
    broadcastAppEvent(event: AppEvent) {
      const message: CrossTabAppEventMessage = {
        type: "app-event",
        source_tab_id: tabId,
        scope_signature: scopeSignature,
        event: safeEventForBroadcast(event)
      };
      channel?.postMessage(message);
      postStorageMessage(STORAGE_KEY, message);
    },
    close() {
      if (channel) channel.close();
      window.removeEventListener("storage", onStorage);
    }
  };
}

export function broadcastSessionEvent(type: CrossTabSessionMessage["type"], scopeSignature?: string | null) {
  if (typeof window === "undefined") return;
  const message: CrossTabSessionMessage = { type, source_tab_id: tabId, scope_signature: scopeSignature ?? null };
  if ("BroadcastChannel" in window) {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(message);
    channel.close();
  }
  postStorageMessage(SESSION_STORAGE_KEY, message);
}

export function subscribeCrossTabSessionEvents(onMessage: (message: CrossTabSessionMessage) => void) {
  if (typeof window === "undefined") return () => undefined;
  const channel = "BroadcastChannel" in window ? new BroadcastChannel(CHANNEL_NAME) : null;

  function handle(value: unknown) {
    const message = parseMessage(value);
    if (!message || (message.type !== "logout" && message.type !== "scope-change")) return;
    onMessage(message);
  }

  if (channel) channel.onmessage = (event) => handle(event.data);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== SESSION_STORAGE_KEY || !event.newValue) return;
    try {
      handle(JSON.parse(event.newValue));
    } catch {
      // Ignore malformed cross-tab fallback data.
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    channel?.close();
    window.removeEventListener("storage", onStorage);
  };
}
