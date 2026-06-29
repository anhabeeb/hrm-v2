import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PopupAlertCard } from "./PopupAlertCard";
import type { PopupAlert } from "./useAlert";

export function AlertViewport({ alerts, onDismiss }: { alerts: PopupAlert[]; onDismiss: (id: string) => void }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-3 top-3 z-[1000] flex flex-col gap-2 sm:left-auto sm:right-4 sm:top-4 sm:w-[24rem]"
      aria-label="Global alerts"
    >
      {alerts.map((alert) => <PopupAlertCard key={alert.id} alert={alert} onDismiss={onDismiss} />)}
    </div>,
    document.body
  );
}
