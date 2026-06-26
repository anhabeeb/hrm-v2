import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "../../lib/utils";
import { Button } from "./button";

type NavigationBarProps = {
  children: ReactNode;
  label: string;
  className?: string;
};

type NavigationItemProps = {
  children: ReactNode;
  active?: boolean;
  className?: string;
  title?: string;
  to?: string;
  onClick?: () => void;
};

function itemTitle(children: ReactNode, title?: string) {
  return title ?? (typeof children === "string" ? children : undefined);
}

export function ModuleNavigationBar({ children, label, className }: NavigationBarProps) {
  return (
    <nav
      aria-label={label}
      className={cn("min-w-0 overflow-hidden rounded-lg border bg-white shadow-panel", className)}
    >
      <div className="flex min-w-0 gap-1 overflow-x-auto px-2 py-2 [scrollbar-width:thin]">
        {children}
      </div>
    </nav>
  );
}

export function ModuleNavigationItem({ children, active = false, className, title, to, onClick }: NavigationItemProps) {
  const classes = cn(
    "inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors",
    active
      ? "bg-primary text-primary-foreground shadow-sm"
      : "text-muted-foreground hover:bg-slate-100 hover:text-slate-950",
    className
  );

  if (to) {
    return (
      <Link to={to} aria-current={active ? "page" : undefined} title={itemTitle(children, title)} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <Button
      type="button"
      variant={active ? "primary" : "ghost"}
      size="sm"
      aria-current={active ? "page" : undefined}
      title={itemTitle(children, title)}
      onClick={onClick}
      className={classes}
    >
      {children}
    </Button>
  );
}

export function SubNavigationBar({ children, label, className }: NavigationBarProps) {
  return (
    <nav
      aria-label={label}
      className={cn("min-w-0 overflow-hidden rounded-lg border bg-slate-50/80 p-1 shadow-panel", className)}
    >
      <div className="flex min-w-0 gap-1 overflow-x-auto [scrollbar-width:thin]">
        {children}
      </div>
    </nav>
  );
}

export function SubNavigationItem({ children, active = false, className, title, to, onClick }: NavigationItemProps) {
  return (
    <ModuleNavigationItem
      to={to}
      onClick={onClick}
      active={active}
      title={title}
      className={cn("h-8 px-2.5 text-xs", active ? "" : "hover:bg-white", className)}
    >
      {children}
    </ModuleNavigationItem>
  );
}
