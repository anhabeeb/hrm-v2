import { Children, isValidElement, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "../../lib/utils";
import { Tabs, TabsList, TabsTrigger } from "./tabs";

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
  value?: string;
  variant?: NavigationTabsVariant;
};

export type NavigationTabsVariant = "equal" | "scrollable" | "compact";

export const NAVIGATION_TAB_SIZE_TOKENS = {
  tabWidth: "min-w-fit",
  tabHeight: "h-10 min-h-10 max-h-10",
  shell: "box-border w-full max-w-none min-w-0 overflow-x-auto rounded-lg border bg-white p-1 shadow-panel [scrollbar-width:thin]",
  listBase: "flex w-max min-w-full items-center gap-2",
  listEqual: "flex w-max min-w-full",
  listScrollable: "flex w-max min-w-full",
  listCompact: "flex w-max min-w-full",
  triggerBase: "box-border inline-flex h-10 min-h-10 max-h-10 min-w-fit max-w-none shrink-0 items-center justify-center overflow-hidden whitespace-nowrap rounded-md border border-transparent px-4 text-center text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  triggerEqual: "",
  triggerCompact: "",
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

function itemValue({ children, title, to, value }: Pick<NavigationItemProps, "children" | "title" | "to" | "value">) {
  return value ?? to ?? itemTitle(children, title) ?? "navigation-tab";
}

function activeValueFromChildren(children: ReactNode) {
  let activeValue = "__no_active_route_tab__";
  Children.forEach(children, (child) => {
    if (!isValidElement<NavigationItemProps>(child)) return;
    if (child.props.active) {
      activeValue = itemValue(child.props);
    }
  });
  return activeValue;
}

function NavigationTabContent({ children }: { children: ReactNode }) {
  if (typeof children === "string" || typeof children === "number") {
    return <span className="whitespace-nowrap text-center">{children}</span>;
  }

  return (
    <span className="flex min-w-0 max-w-full items-center justify-center gap-2 overflow-hidden text-center">
      {children}
    </span>
  );
}

export function ModuleNavigationBar({ children, label, className, variant = "scrollable" }: NavigationBarProps) {
  return (
    <Tabs
      value={activeValueFromChildren(children)}
      className={cn(getNavigationTabShellClass(variant), className)}
    >
      <TabsList aria-label={label} className={getNavigationTabListClass(variant)}>
        {children}
      </TabsList>
    </Tabs>
  );
}

export function ModuleNavigationItem({ children, active = false, className, disabled = false, title, to, onClick, value, variant = "scrollable" }: NavigationItemProps) {
  const resolvedValue = itemValue({ children, title, to, value });
  const classes = cn(
    getNavigationTabItemClass({ active, disabled, variant }),
    className
  );

  if (to && !disabled) {
    return (
      <TabsTrigger value={resolvedValue} asChild className={classes}>
        <Link to={to} aria-current={active ? "page" : undefined} title={itemTitle(children, title)}>
          <NavigationTabContent>{children}</NavigationTabContent>
        </Link>
      </TabsTrigger>
    );
  }

  if (to && disabled) {
    return (
      <TabsTrigger value={resolvedValue} disabled title={itemTitle(children, title)} className={classes}>
        <NavigationTabContent>{children}</NavigationTabContent>
      </TabsTrigger>
    );
  }

  return (
    <TabsTrigger
      value={resolvedValue}
      aria-current={active ? "page" : undefined}
      disabled={disabled}
      title={itemTitle(children, title)}
      onClick={onClick}
      className={classes}
    >
      <NavigationTabContent>{children}</NavigationTabContent>
    </TabsTrigger>
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
