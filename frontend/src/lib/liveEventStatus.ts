import { useEffect, useState } from "react";
import type { AppEventClientStatus, AppEventDeliveryMode } from "./appEventsApi";

export interface LiveEventHealth {
  healthy: boolean;
  deliveryMode: AppEventDeliveryMode | "idle";
  status: AppEventClientStatus | "idle";
  lastSeenAt: number | null;
  reconnectCount?: number;
  fallbackActive?: boolean;
  lastEventId?: string | null;
  recentEventCount?: number;
  streamError?: string | null;
  leader?: boolean;
}

let currentHealth: LiveEventHealth = { healthy: false, deliveryMode: "idle", status: "idle", lastSeenAt: null };
const subscribers = new Set<() => void>();

export function setLiveEventHealth(next: LiveEventHealth) {
  currentHealth = next;
  for (const subscriber of subscribers) subscriber();
}

export function getLiveEventHealth() {
  return currentHealth;
}

export function useLiveEventHealth() {
  const [health, setHealth] = useState(currentHealth);
  useEffect(() => {
    const subscriber = () => setHealth(currentHealth);
    subscribers.add(subscriber);
    return () => {
      subscribers.delete(subscriber);
    };
  }, []);
  return health;
}
