import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Button } from "./button";

interface PageShellProps {
  children: ReactNode;
  className?: string;
  constrained?: boolean;
}

export function PageShell({ children, className, constrained = true }: PageShellProps) {
  return (
    <div className={cn("min-w-0 space-y-5", constrained && "mx-auto w-full max-w-[1480px]", className)}>
      {children}
    </div>
  );
}

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  className?: string;
}

export function PageHeader({ title, description, eyebrow, actions, breadcrumbs, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-3 rounded-lg border bg-white px-4 py-4 shadow-panel lg:flex-row lg:items-center lg:justify-between", className)}>
      <div className="min-w-0">
        {breadcrumbs?.length ? <PageBreadcrumbs items={breadcrumbs} /> : null}
        {eyebrow ? <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">{eyebrow}</div> : null}
        <h1 className="truncate text-xl font-semibold tracking-tight text-slate-950">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <PageActions>{actions}</PageActions> : null}
    </div>
  );
}

export function PageBreadcrumbs({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav className="mb-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="inline-flex items-center gap-1">
          {index > 0 ? <span>/</span> : null}
          {item.href ? <a href={item.href} className="hover:text-foreground">{item.label}</a> : <span>{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export function PageActions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex shrink-0 flex-wrap items-center gap-2", className)}>{children}</div>;
}

export function SectionCard({ title, description, actions, children, className, bodyClassName }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cn("overflow-hidden rounded-lg border bg-white shadow-panel", className)}>
      {title || description || actions ? (
        <div className="flex flex-col gap-3 border-b bg-slate-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {title ? <h2 className="truncate text-sm font-semibold text-slate-950">{title}</h2> : null}
            {description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function StatCard({ label, value, icon, trend, tone = "neutral", href }: { label: ReactNode; value: ReactNode; icon?: ReactNode; trend?: ReactNode; tone?: "neutral" | "success" | "warning" | "danger" | "info"; href?: string }) {
  const toneClass = {
    neutral: "bg-slate-50 text-slate-600",
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    danger: "bg-red-50 text-red-700",
    info: "bg-cyan-50 text-cyan-700"
  }[tone];
  const content = (
    <div className="rounded-lg border bg-white p-4 shadow-panel transition hover:border-slate-300">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
          {trend ? <div className="mt-2 text-xs text-muted-foreground">{trend}</div> : null}
        </div>
        {icon ? <div className={cn("rounded-md border p-2", toneClass)}>{icon}</div> : null}
      </div>
    </div>
  );
  return href ? <a href={href}>{content}</a> : content;
}

export function SummaryCard(props: Parameters<typeof StatCard>[0]) {
  return <StatCard {...props} />;
}

export function QuickActionCard({ title, description, icon, action }: { title: ReactNode; description?: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-h-24 items-start gap-3 rounded-lg border bg-white p-4 shadow-panel">
      {icon ? <div className="rounded-md border bg-slate-50 p-2 text-slate-600">{icon}</div> : null}
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
        {description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p> : null}
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </div>
  );
}

export function MetricGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-4", className)}>{children}</div>;
}

export function ActionBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-2 rounded-lg border bg-white p-3 shadow-panel sm:flex-row sm:items-center sm:justify-between", className)}>{children}</div>;
}

export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-2 rounded-lg border bg-white p-3 shadow-panel sm:grid-cols-2 lg:grid-cols-4", className)}>{children}</div>;
}

export function FormSection({ title, description, children }: { title: ReactNode; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
        {description ? <p className="mt-1 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <div className="grid gap-3">{children}</div>
    </div>
  );
}

export function SettingsSection(props: Parameters<typeof FormSection>[0]) {
  return <FormSection {...props} />;
}

export function DashboardWidget({ title, description, children, actions }: { title: ReactNode; description?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return <SectionCard title={title} description={description} actions={actions}>{children}</SectionCard>;
}

export function WarningPanel({ children, tone = "warning" }: { children: ReactNode; tone?: "warning" | "danger" | "info" | "success" }) {
  const toneClass = {
    warning: "border-amber-200 bg-amber-50 text-amber-800",
    danger: "border-red-200 bg-red-50 text-red-800",
    info: "border-cyan-200 bg-cyan-50 text-cyan-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800"
  }[tone];
  return <div className={cn("rounded-lg border px-4 py-3 text-sm", toneClass)}>{children}</div>;
}

export function InfoPanel({ children }: { children: ReactNode }) {
  return <WarningPanel tone="info">{children}</WarningPanel>;
}

export function LoadingState({ title = "Loading", description = "Fetching the latest records." }: { title?: string; description?: string }) {
  return (
    <div className="rounded-lg border bg-white p-6 shadow-panel">
      <div className="space-y-3">
        <div className="h-3 w-36 animate-pulse rounded bg-slate-200" />
        <div className="h-8 w-56 animate-pulse rounded bg-slate-100" />
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", description, action }: { title?: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-800">
      <h3 className="text-sm font-semibold">{title}</h3>
      {description ? <p className="mt-1 text-sm">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function PermissionDeniedState({ action }: { action?: ReactNode }) {
  return <ErrorState title="Permission required" description="You do not have access to this workspace area." action={action} />;
}

export function ModuleDisabledState({ action }: { action?: ReactNode }) {
  return <ErrorState title="Module disabled" description="This module is currently disabled or unavailable for your account." action={action} />;
}

export function ResponsiveTabs({ items, active, onChange }: { items: Array<{ key: string; label: ReactNode }>; active: string; onChange: (key: string) => void }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-white p-1 shadow-panel">
      <div className="flex min-w-max gap-1">
        {items.map((item) => (
          <Button key={item.key} size="sm" variant={active === item.key ? "primary" : "ghost"} onClick={() => onChange(item.key)} className="whitespace-nowrap">
            {item.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function MobileListCard({ title, meta, children, actions }: { title: ReactNode; meta?: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="rounded-lg border bg-white p-3 shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{title}</h3>
          {meta ? <div className="mt-1 text-xs text-muted-foreground">{meta}</div> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children ? <div className="mt-3 text-sm">{children}</div> : null}
    </div>
  );
}
