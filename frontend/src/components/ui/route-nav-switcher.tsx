import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "../../lib/utils";

// Compact dropdown switcher for in-page sub-navigation. Replaces the old
// always-visible vertical rail (route-nav-rail.tsx) with a single control so
// long section lists (e.g. Payroll's 17) don't dominate the page. Items are
// still real routes, grouped in the dropdown when a `group` is present.

export interface RouteNavItem {
  key: string;
  label: string;
  to: string;
  end?: boolean;
  disabled?: boolean;
  group?: string;
}

function isItemActive(pathname: string, item: RouteNavItem) {
  if (item.end) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

export function RouteNavSwitcher({ items, moduleLabel, className }: { items: RouteNavItem[]; moduleLabel: string; className?: string }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeItem = useMemo(
    () => items.find((item) => isItemActive(location.pathname, item)) ?? items[0],
    [items, location.pathname]
  );

  const groups = useMemo(() => {
    if (!items.some((item) => item.group)) return null;
    const map = new Map<string, RouteNavItem[]>();
    for (const item of items) {
      const key = item.group ?? "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries());
  }, [items]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function renderItem(item: RouteNavItem) {
    if (item.disabled) {
      return (
        <span key={item.key} className="block cursor-not-allowed rounded-md px-2.5 py-1.5 text-left text-xs text-muted-foreground opacity-50">
          {item.label}
        </span>
      );
    }
    const active = isItemActive(location.pathname, item);
    return (
      <Link
        key={item.key}
        to={item.to}
        onClick={() => setOpen(false)}
        className={cn(
          "block rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
          active ? "bg-[#EEEDFE] font-medium text-primary" : "text-[#6B6F86] hover:bg-slate-50 hover:text-slate-950"
        )}
      >
        {item.label}
      </Link>
    );
  }

  return (
    <div ref={containerRef} className={cn("relative inline-block self-start", className)}>
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Switch ${moduleLabel} section`}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1.5 text-lg font-medium text-slate-950 transition-colors hover:text-primary"
      >
        {activeItem?.label ?? moduleLabel}
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div role="menu" aria-label={`${moduleLabel} sections`} className="themed-scroll absolute left-0 z-20 mt-1.5 max-h-80 w-64 overflow-y-auto rounded-lg border border-[#E7E7F1] bg-white p-1.5 shadow-lg">
          {groups
            ? groups.map(([groupName, groupItems]) => (
                <div key={groupName}>
                  <p className="px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{groupName}</p>
                  {groupItems.map(renderItem)}
                </div>
              ))
            : items.map(renderItem)}
        </div>
      ) : null}
    </div>
  );
}
