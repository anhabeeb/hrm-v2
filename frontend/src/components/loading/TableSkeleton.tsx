import { cn } from "../../lib/utils";

export function TableSkeleton({
  rows = 5,
  columns = 6,
  className,
  label = "Loading table rows"
}: {
  rows?: number;
  columns?: number;
  className?: string;
  label?: string;
}) {
  return (
    <div className={cn("box-border w-full max-w-none min-w-0 overflow-hidden rounded-lg border bg-white shadow-panel", className)} aria-busy="true" aria-label={label}>
      <div className="border-b bg-slate-50 px-4 py-3">
        <div className="h-3 w-44 animate-pulse rounded bg-slate-200 motion-reduce:animate-none" />
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[680px] divide-y">
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <div key={rowIndex} className="grid gap-4 px-4 py-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
              {Array.from({ length: columns }).map((__, columnIndex) => (
                <div
                  key={`${rowIndex}-${columnIndex}`}
                  className="h-3 animate-pulse rounded bg-slate-100 motion-reduce:animate-none"
                  style={{ width: `${columnIndex % 3 === 0 ? 72 : columnIndex % 3 === 1 ? 88 : 58}%` }}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
