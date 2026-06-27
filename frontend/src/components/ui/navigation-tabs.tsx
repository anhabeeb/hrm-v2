import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "../../lib/utils";
import { Button } from "./button";

type NavigationBarProps = {
  children: ReactNode;
  label: string;
  className?: string;
  variant?: NavigationTabsVariant;
};

type NavigationItemProps = {
  children: ReactNode;
  active?: boolean;
  className?: string;
  disabled?: boolean;
  title?: string;
  to?: string;
  onClick?: () => void;
  variant?: NavigationTabsVariant;
};

export type NavigationTabsVariant = "equal" | "scrollable" | "compact";

export const NAVIGATION_TAB_SIZE_TOKENS = {
  shell: "box-border w-full max-w-none min-w-0 overflow-hidden rounded-lg border bg-white p-1 shadow-panel",
  listBase: "min-w-0 gap-1 overflow-x-auto [scrollbar-width:thin]",
  listEqual: "grid w-full",
  listScrollable: "flex min-w-full",
  listCompact: "flex min-w-full",
  triggerBase: "inline-flex h-10 min-w-[8rem] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent px-4 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  triggerEqual: "w-full min-w-0",
  triggerCompact: "min-w-[7rem] px-3",
  triggerActive: "border-primary/20 bg-primary text-primary-foreground shadow-sm",
  triggerInactive: "text-muted-foreground hover:border-slate-200 hover:bg-slate-100 hover:text-slate-950",
  triggerDisabled: "cursor-not-allowed opacity-55",
  triggerIcon: "[&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0",
  badgeBase: "ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full border px-1.5 text-[11px] font-semibold leading-none",
  badgeActive: "border-white/30 bg-white/15 text-inherit",
  badgeInactive: "border-slate-200 bg-slate-100 text-slate-600"
} as const;

export function getNavigationTabShellClass(variant: NavigationTabsVariant = "scrollable") {
  return cn(
    NAVIGATION_TAB_SIZE_TOKENS.shell,
    variant === "compact" && "bg-slate-50/80"
  );
}

export function getNavigationTabListClass(variant: NavigationTabsVariant = "scrollable") {
  return cn(
    NAVIGATION_TAB_SIZE_TOKENS.listBase,
    variant === "equal" ? NAVIGATION_TAB_SIZE_TOKENS.listEqual : null,
    variant === "scrollable" ? NAVIGATION_TAB_SIZE_TOKENS.listScrollable : null,
    variant === "compact" ? NAVIGATION_TAB_SIZE_TOKENS.listCompact : null
  );
}

export function getNavigationTabItemClass({
  active,
  disabled,
  variant = "scrollable"
}: {
  active?: boolean;
  disabled?: boolean;
  variant?: NavigationTabsVariant;
}) {
  return cn(
    NAVIGATION_TAB_SIZE_TOKENS.triggerBase,
    NAVIGATION_TAB_SIZE_TOKENS.triggerIcon,
    variant === "equal" && NAVIGATION_TAB_SIZE_TOKENS.triggerEqual,
    variant === "compact" && NAVIGATION_TAB_SIZE_TOKENS.triggerCompact,
    active ? NAVIGATION_TAB_SIZE_TOKENS.triggerActive : NAVIGATION_TAB_SIZE_TOKENS.triggerInactive,
    disabled && NAVIGATION_TAB_SIZE_TOKENS.triggerDisabled
  );
}

export function getNavigationTabBadgeClass(active?: boolean) {
  return cn(
    NAVIGATION_TAB_SIZE_TOKENS.badgeBase,
    active ? NAVIGATION_TAB_SIZE_TOKENS.badgeActive : NAVIGATION_TAB_SIZE_TOKENS.badgeInactive
  );
}

function itemTitle(children: ReactNode, title?: string) {
  return title ?? (typeof children === "string" ? children : undefined);
}

export function ModuleNavigationBar({ children, label, className, variant = "scrollable" }: NavigationBarProps) {
  return (
    <nav
      aria-label={label}
      className={cn(getNavigationTabShellClass(variant), className)}
    >
      <div className={getNavigationTabListClass(variant)}>
        {children}
      </div>
    </nav>
  );
}

export function ModuleNavigationItem({ children, active = false, className, disabled = false, title, to, onClick, variant = "scrollable" }: NavigationItemProps) {
  const classes = cn(
    getNavigationTabItemClass({ active, disabled, variant }),
    className
  );

  if (to && !disabled) {
    return (
      <Link to={to} aria-current={active ? "page" : undefined} title={itemTitle(children, title)} className={classes}>
        {children}
      </Link>
    );
  }

  if (to && disabled) {
    return (
      <span aria-disabled="true" title={itemTitle(children, title)} className={classes}>
        {children}
      </span>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="md"
      aria-current={active ? "page" : undefined}
      disabled={disabled}
      title={itemTitle(children, title)}
      onClick={onClick}
      className={classes}
    >
      {children}
    </Button>
  );
}

export function SubNavigationBar({ children, label, className, variant = "compact" }: NavigationBarProps) {
  return <ModuleNavigationBar label={label} className={className} variant={variant}>{children}</ModuleNavigationBar>;
}

export function SubNavigationItem({ children, active = false, className, disabled = false, title, to, onClick, variant = "compact" }: NavigationItemProps) {
  return (
    <ModuleNavigationItem
      to={to}
      onClick={onClick}
      active={active}
      disabled={disabled}
      title={title}
      variant={variant}
      className={className}
    >
      {children}
    </ModuleNavigationItem>
  );
}
