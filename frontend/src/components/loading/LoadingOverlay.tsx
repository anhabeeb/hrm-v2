import { InlineSpinner } from "./InlineSpinner";

export function LoadingOverlay({ show, label = "Working on this request..." }: { show: boolean; label?: string }) {
  if (!show) return null;
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-lg bg-white/75 backdrop-blur-[1px]" aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-panel">
        <InlineSpinner />
        <span>{label}</span>
      </div>
    </div>
  );
}
