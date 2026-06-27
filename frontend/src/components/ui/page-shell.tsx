import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { cn } from "../../lib/utils";
import { Button } from "./button";
import {
  getNavigationTabBadgeClass,
  getNavigationTabItemClass,
  getNavigationTabListClass,
  getNavigationTabShellClass,
  type NavigationTabsVariant
} from "./navigation-tabs";
import { Tabs, TabsList, TabsTrigger } from "./tabs";

interface PageShellProps {
  children: ReactNode;
  className?: string;
  constrained?: boolean;
}

export function PageShell({ children, className, constrained = true }: PageShellProps) {
  return (
    <div className={cn("box-border w-full max-w-none min-w-0 space-y-5", constrained && "w-full max-w-none", className)}>
      {children}
    </div>
  );
}

export const PageLayout = PageShell;
export const ModulePageLayout = PageShell;

export function PageContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("box-border w-full max-w-none min-w-0 space-y-5", className)}>{children}</div>;
}

export const AppContentContainer = PageContent;

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  icon?: ReactNode;
  badge?: ReactNode;
  statusBadge?: ReactNode;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  moduleStatus?: ReactNode;
  className?: string;
}

const MODULE_SETTINGS_LINKS = [
  { prefix: "/attendance", settingsPath: "/attendance/settings", permissions: ["attendance.settings.view", "attendance.settings.manage", "attendance.settings.update"] },
  { prefix: "/roster", settingsPath: "/roster/settings", permissions: ["roster.settings.view", "roster.settings.manage", "roster.settings.update"] },
  { prefix: "/payroll", settingsPath: "/payroll/settings", permissions: ["payroll.settings.view", "payroll.settings.manage", "payroll.submodules.view"] },
  { prefix: "/contracts", settingsPath: "/settings/contracts", permissions: ["contracts.settings.view", "contracts.settings.manage", "contracts.settings.update"] },
  { prefix: "/approvals", settingsPath: "/approvals/settings", permissions: ["approvals.settings.view", "approvals.settings.manage"] },
  { prefix: "/documents/compliance", settingsPath: "/settings/documents/compliance", permissions: ["documents.compliance.settings.view", "documents.compliance.settings.manage", "documents.settings.manage"] },
  { prefix: "/documents", settingsPath: "/settings/documents", permissions: ["documents.settings.view", "documents.settings.manage"] },
  { prefix: "/assets", settingsPath: "/assets/settings", permissions: ["assets.settings.view", "assets.settings.manage"] },
  { prefix: "/onboarding", settingsPath: "/onboarding/settings", permissions: ["onboarding.settings.view", "onboarding.settings.manage", "onboarding.settings.update"] },
  { prefix: "/offboarding", settingsPath: "/offboarding/settings", permissions: ["offboarding.settings.view", "offboarding.settings.manage", "offboarding.settings.update"] },
  { prefix: "/self-service", settingsPath: "/settings/self-service", permissions: ["self_service.settings.view", "self_service.settings.manage", "settings.manage"] },
  { prefix: "/leave", settingsPath: "/leave/settings", permissions: ["leave.settings.view", "leave.settings.manage", "leave.policies.manage"] }
] as const;

function getModuleSettingsLink(pathname: string, permissions: Set<string>) {
  if (pathname === "/settings" || pathname.startsWith("/settings/admin") || pathname.startsWith("/settings/organization")) return null;
  const match = MODULE_SETTINGS_LINKS
    .filter((item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];
  if (!match) return null;
  if (pathname === match.settingsPath || pathname.startsWith(`${match.settingsPath}/`)) return null;
  if (!match.permissions.some((permission) => permissions.has(permission))) return null;
  return match;
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  breadcrumbs,
  icon,
  badge,
  statusBadge,
  primaryAction,
  secondaryActions,
  moduleStatus,
  className
}: PageHeaderProps) {
  const location = useLocation();
  const { user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const moduleSettingsLink = getModuleSettingsLink(location.pathname, permissions);
  const resolvedActions = actions ?? (
    primaryAction || secondaryActions ? (
      <>
        {secondaryActions}
        {primaryAction}
      </>
    ) : null
  );
  const settingsAction = moduleSettingsLink ? (
    <Link to={moduleSettingsLink.settingsPath}>
      <Button size="sm" variant="outline">
        <SettingsIcon className="h-4 w-4" />
        Settings
      </Button>
    </Link>
  ) : null;
  const actionsWithSettings = settingsAction || resolvedActions ? (
    <>
      {settingsAction}
      {resolvedActions}
    </>
  ) : null;

  return (
    <div className={cn("box-border flex w-full max-w-none min-w-0 flex-col gap-3 rounded-lg border bg-white px-4 py-4 shadow-panel lg:flex-row lg:items-center lg:justify-between", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon ? <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-slate-50 text-slate-600">{icon}</div> : null}
        <div className="min-w-0">
        {breadcrumbs?.length ? <PageBreadcrumbs items={breadcrumbs} /> : null}
        {eyebrow || badge || statusBadge ? (
          <div className="mb-1 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
            {eyebrow ? <span>{eyebrow}</span> : null}
            {badge}
            {statusBadge}
          </div>
        ) : null}
        <h1 className="truncate text-xl font-semibold tracking-tight text-slate-950">{title}</h1>
        {description ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p> : null}
        {moduleStatus ? <div className="mt-2 text-sm text-muted-foreground">{moduleStatus}</div> : null}
        </div>
      </div>
      {actionsWithSettings ? <PageActions>{actionsWithSettings}</PageActions> : null}
    </div>
  );
}

export const ModulePageHeader = PageHeader;
export const AppPageHeader = PageHeader;

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
    <section className={cn("box-border w-full max-w-none min-w-0 overflow-hidden rounded-lg border bg-white shadow-panel", className)}>
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

export function SettingsCard(props: Parameters<typeof SectionCard>[0]) {
  return <SectionCard {...props} />;
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

export function TaskListCard({ title, tasks, action }: { title: ReactNode; tasks: Array<{ label: ReactNode; status?: ReactNode; meta?: ReactNode }>; action?: ReactNode }) {
  return (
    <SectionCard title={title} actions={action} bodyClassName="p-0">
      <div className="divide-y">
        {tasks.map((task, index) => (
          <div key={index} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">{task.label}</p>
              {task.meta ? <p className="mt-1 truncate text-xs text-muted-foreground">{task.meta}</p> : null}
            </div>
            {task.status ? <div className="shrink-0">{task.status}</div> : null}
          </div>
        ))}
        {!tasks.length ? <div className="px-4 py-6 text-sm text-muted-foreground">No tasks to show.</div> : null}
      </div>
    </SectionCard>
  );
}

export function UpcomingActivityCard({ title, items }: { title: ReactNode; items: Array<{ title: ReactNode; when?: ReactNode; description?: ReactNode }> }) {
  return <ActivityListCard title={title} items={items} />;
}

export function RecentActivityCard({ title, items }: { title: ReactNode; items: Array<{ title: ReactNode; when?: ReactNode; description?: ReactNode }> }) {
  return <ActivityListCard title={title} items={items} />;
}

export function RecentTransactionCard({ title, items }: { title: ReactNode; items: Array<{ title: ReactNode; amount?: ReactNode; description?: ReactNode }> }) {
  return (
    <SectionCard title={title} bodyClassName="p-0">
      <div className="divide-y">
        {items.map((item, index) => (
          <div key={index} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
              {item.description ? <p className="mt-1 truncate text-xs text-muted-foreground">{item.description}</p> : null}
            </div>
            {item.amount ? <div className="shrink-0 text-sm font-semibold">{item.amount}</div> : null}
          </div>
        ))}
        {!items.length ? <div className="px-4 py-6 text-sm text-muted-foreground">No recent transactions.</div> : null}
      </div>
    </SectionCard>
  );
}

function ActivityListCard({ title, items }: { title: ReactNode; items: Array<{ title: ReactNode; when?: ReactNode; description?: ReactNode }> }) {
  return (
    <SectionCard title={title} bodyClassName="p-0">
      <div className="divide-y">
        {items.map((item, index) => (
          <div key={index} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-sm font-medium text-slate-900">{item.title}</p>
              {item.when ? <p className="shrink-0 text-xs text-muted-foreground">{item.when}</p> : null}
            </div>
            {item.description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p> : null}
          </div>
        ))}
        {!items.length ? <div className="px-4 py-6 text-sm text-muted-foreground">No activity yet.</div> : null}
      </div>
    </SectionCard>
  );
}

export function ProfileCard({ avatar, title, subtitle, meta, actions }: { avatar?: ReactNode; title: ReactNode; subtitle?: ReactNode; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-white p-4 shadow-panel sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        {avatar ? <div className="shrink-0">{avatar}</div> : null}
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-slate-950">{title}</h2>
          {subtitle ? <p className="mt-1 truncate text-sm text-muted-foreground">{subtitle}</p> : null}
          {meta ? <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">{meta}</div> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function MetricGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid w-full max-w-none min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4", className)}>{children}</div>;
}

export function ActionBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("box-border flex w-full max-w-none min-w-0 flex-col gap-2 rounded-lg border bg-white p-3 shadow-panel sm:flex-row sm:items-center sm:justify-between", className)}>{children}</div>;
}

export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("box-border grid w-full max-w-none min-w-0 gap-2 rounded-lg border bg-white p-3 shadow-panel sm:grid-cols-2 lg:grid-cols-4", className)}>{children}</div>;
}

export function FilterDrawer({ open, title = "Filters", children, onClose, actions }: { open: boolean; title?: ReactNode; children: ReactNode; onClose: () => void; actions?: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/25">
      <button className="absolute inset-0" aria-label="Close filters" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l bg-white shadow-xl">
        <header className="flex items-center justify-between border-b px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {actions ? <footer className="border-t bg-slate-50 px-5 py-3">{actions}</footer> : null}
      </aside>
    </div>
  );
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

export function FormWizard({ steps, activeStep }: { steps: Array<{ label: ReactNode; description?: ReactNode }>; activeStep: number }) {
  const progress = steps.length ? Math.round(((activeStep + 1) / steps.length) * 100) : 0;
  return (
    <div className="rounded-lg border bg-white p-4 shadow-panel">
      <ProgressBar value={progress} />
      <ol className="mt-4 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
        {steps.map((step, index) => (
          <li key={index} className={cn("rounded-md border px-3 py-2", index === activeStep ? "border-primary bg-primary/5" : index < activeStep ? "border-emerald-200 bg-emerald-50" : "bg-slate-50")}>
            <p className="truncate text-xs font-semibold">{step.label}</p>
            {step.description ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{step.description}</p> : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function RepeaterFieldGroup({ title, children, action }: { title: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border bg-white">
      <div className="flex items-center justify-between gap-3 border-b bg-slate-50 px-3 py-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {action}
      </div>
      <div className="grid gap-3 p-3">{children}</div>
    </div>
  );
}

export function ComboboxField({ label, children, helper }: { label: ReactNode; children: ReactNode; helper?: ReactNode }) {
  return <FieldFrame label={label} helper={helper}>{children}</FieldFrame>;
}

export function DatePickerField({ label, children, helper }: { label: ReactNode; children: ReactNode; helper?: ReactNode }) {
  return <FieldFrame label={label} helper={helper}>{children}</FieldFrame>;
}

type StandardInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: ReactNode;
  helper?: ReactNode;
};

type StandardSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: ReactNode;
  helper?: ReactNode;
  onValueChange?: (value: string) => void;
};

type StandardTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: ReactNode;
  helper?: ReactNode;
};

export function InputField({ label, helper, className, ...props }: StandardInputProps) {
  const control = <input {...props} className={cn("h-9 w-full rounded-md border bg-white px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-muted-foreground", className)} />;
  return label ? <FieldFrame label={label} helper={helper}>{control}</FieldFrame> : control;
}

export function SelectField({ label, helper, className, children, onChange, onValueChange, ...props }: StandardSelectProps) {
  const control = (
    <select
      {...props}
      onChange={(event) => {
        onChange?.(event);
        onValueChange?.(event.target.value);
      }}
      className={cn("h-9 w-full rounded-md border bg-white px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-muted-foreground", className)}
    >
      {children}
    </select>
  );
  return label ? <FieldFrame label={label} helper={helper}>{control}</FieldFrame> : control;
}

export function TextareaField({ label, helper, className, ...props }: StandardTextareaProps) {
  const control = <textarea {...props} className={cn("min-h-24 w-full rounded-md border bg-white px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-muted-foreground", className)} />;
  return label ? <FieldFrame label={label} helper={helper}>{control}</FieldFrame> : control;
}

export function CheckboxField({ label, helper, checked, onChange, disabled, className }: { label: ReactNode; helper?: ReactNode; checked?: boolean; disabled?: boolean; className?: string; onChange?: (checked: boolean) => void }) {
  return (
    <label className={cn("flex min-h-9 items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm transition hover:bg-slate-50", disabled && "cursor-not-allowed opacity-60", className)}>
      <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary/20" checked={checked} disabled={disabled} onChange={(event) => onChange?.(event.target.checked)} />
      <span className="min-w-0 flex-1">{label}</span>
      {helper ? <span className="text-xs text-muted-foreground">{helper}</span> : null}
    </label>
  );
}

export function SwitchField(props: Parameters<typeof CheckboxField>[0]) {
  return <CheckboxField {...props} className={cn("justify-between", props.className)} />;
}

export function RadioGroupField({ label, children, helper }: { label: ReactNode; children: ReactNode; helper?: ReactNode }) {
  return <FieldFrame label={label} helper={helper}><div className="flex flex-wrap gap-2">{children}</div></FieldFrame>;
}

export function FileUploadField({ label, helper, className, ...props }: StandardInputProps) {
  return <InputField {...props} type="file" label={label} helper={helper} className={cn("pt-1.5 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs file:font-medium file:text-slate-700", className)} />;
}

export function FormFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-col-reverse gap-2 border-t bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-end", className)}>{children}</div>;
}

function FieldFrame({ label, helper, children }: { label: ReactNode; helper?: ReactNode; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium text-slate-800">{label}</span>
      {children}
      {helper ? <span className="text-xs leading-5 text-muted-foreground">{helper}</span> : null}
    </label>
  );
}

export function CommandPalette({ placeholder = "Search commands...", children }: { placeholder?: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border bg-white p-2 shadow-panel">
      <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-muted-foreground">{placeholder}</div>
      {children ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}

export const CommandSearch = CommandPalette;

export function TabsShell({ children, className, variant = "equal", value, onValueChange }: { children: ReactNode; className?: string; variant?: NavigationTabsVariant; value?: string; onValueChange?: (value: string) => void }) {
  return <Tabs value={value} onValueChange={onValueChange} className={cn(getNavigationTabShellClass(variant), className)}>{children}</Tabs>;
}

export function AccordionSection({ title, children, defaultOpen = true }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="rounded-lg border bg-white shadow-panel" open={defaultOpen}>
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-950">{title}</summary>
      <div className="border-t p-4">{children}</div>
    </details>
  );
}

export function TooltipHelp({ text }: { text: string }) {
  return <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border bg-slate-50 text-[11px] font-semibold text-slate-600" title={text}>?</span>;
}

export function ExportActionBar({ children, className }: { children: ReactNode; className?: string }) {
  return <ActionBar className={cn("border-primary/20 bg-primary/5", className)}>{children}</ActionBar>;
}

export function DashboardWidget({ title, description, children, actions }: { title: ReactNode; description?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return <SectionCard title={title} description={description} actions={actions}>{children}</SectionCard>;
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const safeValue = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div className={cn("h-2 overflow-hidden rounded-full bg-slate-100", className)}>
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${safeValue}%` }} />
    </div>
  );
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

export const AlertBanner = WarningPanel;
export const NotificationBanner = WarningPanel;

export function LoadingSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-panel">
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="h-4 animate-pulse rounded bg-slate-100" style={{ width: `${90 - index * 8}%` }} />
        ))}
      </div>
    </div>
  );
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

export function NoSearchResultsState({ action }: { action?: ReactNode }) {
  return <ErrorState title="No matching records" description="No results match the current search and filters." action={action} />;
}

type StandardTabItem = {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  count?: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
  hidden?: boolean;
  title?: string;
};

type StandardTabsVariant = NavigationTabsVariant | "auto";

export function StandardTabs({
  items,
  active,
  onChange,
  label = "Section tabs",
  variant = "auto",
  className,
  equalThreshold = 6
}: {
  items: StandardTabItem[];
  active: string;
  onChange: (key: string) => void;
  label?: string;
  variant?: StandardTabsVariant;
  className?: string;
  equalThreshold?: number;
}) {
  const visibleItems = items.filter((item) => !item.hidden);
  const resolvedVariant: NavigationTabsVariant = variant === "auto" ? "scrollable" : variant;

  return (
    <TabsShell variant={resolvedVariant} className={className} value={active} onValueChange={(key) => {
      const item = visibleItems.find((candidate) => candidate.key === key);
      if (!item?.disabled) onChange(key);
    }}>
      <TabsList aria-label={label} className={getNavigationTabListClass(resolvedVariant)}>
        {visibleItems.map((item) => {
          const isActive = active === item.key;
          const title = item.title ?? (typeof item.label === "string" ? item.label : undefined);
          return (
          <TabsTrigger
            key={item.key}
            value={item.key}
            disabled={item.disabled}
            title={title}
            className={getNavigationTabItemClass({ active: isActive, disabled: item.disabled, variant: resolvedVariant })}
          >
            <span className="flex min-w-0 max-w-full items-center justify-center gap-2 overflow-hidden text-center">
              {item.icon ? <span className="shrink-0">{item.icon}</span> : null}
              <span className="whitespace-nowrap text-center">{item.label}</span>
              {item.count !== undefined ? <span className={getNavigationTabBadgeClass(isActive)}>{item.count}</span> : null}
              {item.badge ? <span className={getNavigationTabBadgeClass(isActive)}>{item.badge}</span> : null}
            </span>
          </TabsTrigger>
          );
        })}
      </TabsList>
    </TabsShell>
  );
}

export const AppTabs = StandardTabs;
export const ModuleTabs = StandardTabs;
export const EmployeeStyleTabs = StandardTabs;

export function ResponsiveTabs(props: Parameters<typeof StandardTabs>[0]) {
  return <StandardTabs {...props} />;
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
