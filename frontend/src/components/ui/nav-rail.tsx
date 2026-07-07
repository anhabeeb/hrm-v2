import { Tabs, TabsList, TabsTrigger } from "./tabs";
import { cn } from "../../lib/utils";
import type { StandardTabItem } from "./page-shell";

// Vertical sub-nav rail — the approved replacement for StandardTabs/AppTabs/
// ModuleTabs/ResponsiveTabs (horizontal pill tabs) wherever a page switches
// between in-page sections. Identical prop shape to StandardTabs on purpose:
// converting a page is an import + JSX-tag swap, not a data reshape.
//
// Note: this covers the *state-based* tab pattern (items/active/onChange
// within one component, e.g. Employee 360's tabs). Route-based sub-nav
// (AttendanceNav, navigation-tabs.tsx's ModuleNavigationBar — separate top-
// level routes via NavLink) needs its own conversion, done alongside each
// module's own Phase 2 slot rather than here.

export function NavRail({
  items,
  active,
  onChange,
  label = "Section navigation",
  className
}: {
  items: StandardTabItem[];
  active: string;
  onChange: (key: string) => void;
  label?: string;
  className?: string;
}) {
  const visibleItems = items.filter((item) => !item.hidden);

  return (
    <Tabs
      value={active}
      onValueChange={(key) => {
        const item = visibleItems.find((candidate) => candidate.key === key);
        if (!item?.disabled) onChange(key);
      }}
      className={cn("w-full", className)}
    >
      <TabsList aria-label={label} className="themed-scroll flex w-full min-w-[180px] flex-col items-stretch gap-1 overflow-y-auto bg-transparent p-0">
        {visibleItems.map((item) => {
          const isActive = active === item.key;
          const title = item.title ?? (typeof item.label === "string" ? item.label : undefined);
          return (
            <TabsTrigger
              key={item.key}
              value={item.key}
              disabled={item.disabled}
              title={title}
              className={cn(
                "flex w-full items-center justify-start gap-2 rounded-card px-3 py-2 text-left text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground shadow-none"
                  : "bg-transparent text-[#6B6F86] hover:bg-slate-50 hover:text-slate-950",
                item.disabled && "pointer-events-none opacity-50"
              )}
            >
              {item.icon ? <span className="shrink-0">{item.icon}</span> : null}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.count !== undefined ? (
                <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-xs", isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600")}>
                  {item.count}
                </span>
              ) : null}
              {item.badge ? <span className="shrink-0">{item.badge}</span> : null}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
