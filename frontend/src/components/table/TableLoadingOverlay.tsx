import { RefreshCw } from "lucide-react";
import { cn } from "../../lib/utils";

export function TableLoadingOverlay({ show, label = "Updating results" }: { show?: boolean; label?: string }) {
  if (!show) return null;
  return (
    <div className={cn("pointer-events-none absolute right-3 top-3 z-20 inline-flex items-center gap-2 rounded-full border bg-white/95 px-3 py-1 text-xs font-medium text-muted-foreground shadow-panel")}>
      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
      {label}
    </div>
  );
}
