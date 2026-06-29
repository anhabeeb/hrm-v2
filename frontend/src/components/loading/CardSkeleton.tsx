import { cn } from "../../lib/utils";

export function CardSkeleton({ cards = 4, className, label = "Loading summary cards" }: { cards?: number; className?: string; label?: string }) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-4", className)} aria-busy="true" aria-label={label}>
      {Array.from({ length: cards }).map((_, index) => (
        <div key={index} className="rounded-lg border bg-white p-4 shadow-panel">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="h-3 w-28 animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
              <div className="h-7 w-20 animate-pulse rounded bg-slate-200 motion-reduce:animate-none" />
              <div className="h-3 w-36 animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
            </div>
            <div className="h-9 w-9 animate-pulse rounded-md bg-primary/10 motion-reduce:animate-none" />
          </div>
        </div>
      ))}
    </div>
  );
}
