import { NavLink } from "react-router-dom";
import { cn } from "../../lib/utils";

// Route-based counterpart to NavRail (nav-rail.tsx): same vertical rail visual,
// but items are real routes (NavLink) instead of in-page tab state. For modules
// whose sub-pages are separate top-level routes (Payroll, Documents, Assets,
// Settings, etc.) rather than one page switching between sections.

export interface RouteNavRailItem {
  key: string;
  label: string;
  to: string;
  end?: boolean;
  disabled?: boolean;
}

export function RouteNavRail({ items, label = "Section navigation", className }: { items: RouteNavRailItem[]; label?: string; className?: string }) {
  return (
    <nav aria-label={label} className={cn("flex w-full min-w-[150px] flex-col gap-1", className)}>
      {items.map((item) =>
        item.disabled ? (
          <span key={item.key} className="pointer-events-none flex w-full items-center rounded-card px-3 py-2 text-left text-sm font-medium text-[#6B6F86] opacity-50">
            {item.label}
          </span>
        ) : (
          <NavLink
            key={item.key}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "flex w-full items-center rounded-card px-3 py-2 text-left text-sm font-medium transition-colors",
                isActive ? "bg-primary text-primary-foreground" : "bg-transparent text-[#6B6F86] hover:bg-slate-50 hover:text-slate-950"
              )
            }
          >
            {item.label}
          </NavLink>
        )
      )}
    </nav>
  );
}
