import { useEffect, useState } from "react";
import type { AppEventDeliveryMode } from "./appEventsApi";

export interface LiveEventHealth {
  healthy: boolean;
  deliveryMode: AppEventDeliveryMode | "idle";
  lastSeenAt: number | null;
}

let currentHealth: LiveEventHealth = { healthy: false, deliveryMode: "idle", lastSeenAt: null };
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
