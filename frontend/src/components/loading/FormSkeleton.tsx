import { cn } from "../../lib/utils";

export function FormSkeleton({ fields = 6, className, label = "Loading form" }: { fields?: number; className?: string; label?: string }) {
  return (
    <div className={cn("rounded-lg border bg-white p-4 shadow-panel", className)} aria-busy="true" aria-label={label}>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: fields }).map((_, index) => (
          <div key={index} className="space-y-2">
            <div className="h-3 w-24 animate-pulse rounded bg-slate-200 motion-reduce:animate-none" />
            <div className="h-9 animate-pulse rounded-md bg-slate-100 motion-reduce:animate-none" />
          </div>
        ))}
      </div>
    </div>
  );
}
