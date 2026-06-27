import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

export function Tooltip({ children, content, className }: { children: ReactNode; content: ReactNode; className?: string }) {
  return (
    <span className={cn("group/tooltip relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-full z-50 mt-2 hidden w-72 rounded-md border bg-white px-3 py-2 text-left text-xs leading-5 text-slate-700 shadow-lg group-hover/tooltip:block group-focus-within/tooltip:block"
      >
        {content}
      </span>
    </span>
  );
}
