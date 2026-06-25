import type { ReactNode } from "react";

export interface TimelineItem {
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol className="space-y-3">
      {items.map((item, index) => (
        <li key={index} className="relative pl-6">
          <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full border border-primary bg-white" />
          {index < items.length - 1 ? <span className="absolute left-[4px] top-4 h-full w-px bg-border" /> : null}
          <div className="rounded-lg border bg-white p-3 shadow-panel">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{item.title}</h3>
              {item.meta ? <div className="text-xs text-muted-foreground">{item.meta}</div> : null}
            </div>
            {item.description ? <p className="mt-1 text-sm text-muted-foreground">{item.description}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
