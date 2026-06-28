import {
  Activity,
  Archive,
  Banknote,
  Bell,
  Briefcase,
  CalendarCheck,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Database,
  FileText,
  FileWarning,
  LayoutDashboard,
  LogOut,
  PauseCircle,
  RefreshCw,
  RotateCcw,
  Settings,
  ShieldAlert,
  Shirt,
  TrendingUp,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon
} from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../components/ui/accordion";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { DashboardWidget, PageHeader, PageShell, QuickActionCard, WarningPanel } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { api } from "../lib/api";
import { cn } from "../lib/utils";
import { useAuth } from "../hooks/useAuth";

type DashboardTone = "neutral" | "success" | "warning" | "danger" | "info";

interface CommandCenterKpi {
  id: string;
  title: string;
  value: number | string;
  description: string;
  tone: DashboardTone;
  icon_key: string;
  route: string;
  secondary_value?: string | number | null;
}

interface CommandCenterGroup {
  key: string;
  title: string;
  enabled: boolean;
  available: boolean;
  warning?: string;
  kpis: CommandCenterKpi[];
}

interface PriorityAction {
  id: string;
  title: string;
  description: string;
  count: number;
  tone: DashboardTone;
  icon_key: string;
  route: string;
}

interface CommandCenterSummary {
  generated_at?: string;
  enabled_modules?: Record<string, boolean>;
  groups?: Record<string, CommandCenterGroup>;
  priority_actions?: PriorityAction[];
  warnings?: { group: string; message?: string }[];
}

const iconMap: Record<string, LucideIcon> = {
  activity: Activity,
  archive: Archive,
  banknote: Banknote,
  bell: Bell,
  briefcase: Briefcase,
  "calendar-check": CalendarCheck,
  "calendar-clock": Clock3,
  "calendar-days": CalendarDays,
  "calendar-range": CalendarDays,
  "calendar-x": CalendarCheck,
  "check-circle": CheckCircle2,
  "clipboard-check": CheckCircle2,
  "clipboard-edit": FileText,
  "clipboard-list": FileText,
  clock: Clock3,
  "database-zap": Database,
  edit: FileText,
  "file-signature": FileText,
  "file-warning": FileWarning,
  "file-x": FileWarning,
  "git-branch": TrendingUp,
  "hand-coins": Banknote,
  "log-out": LogOut,
  "pause-circle": PauseCircle,
  receipt: FileText,
  "refresh-cw": RotateCcw,
  "rotate-ccw": RotateCcw,
  "scan-line": Activity,
  settings: Settings,
  "shield-alert": ShieldAlert,
  shirt: Shirt,
  "triangle-alert": ShieldAlert,
  "trending-up": TrendingUp,
  "undo-2": RotateCcw,
  "user-check": UserCheck,
  "user-plus": UserPlus,
  users: Users,
  wallet: Wallet
};

const groupOrder = ["workforce", "attendance", "leave", "payroll", "documents", "contracts", "approvals", "assets", "alerts"];

function asGroups(summary: CommandCenterSummary | null) {
  const groups = summary?.groups ?? {};
  return groupOrder
    .map((key) => groups[key])
    .filter((group): group is CommandCenterGroup => Boolean(group))
    .filter((group) => group.enabled && (group.kpis.length > 0 || group.warning));
}

function formatValue(value: number | string) {
  return typeof value === "number" ? value.toLocaleString() : value;
}

function kpiTone(value: DashboardTone) {
  return {
    neutral: "border-slate-200 bg-slate-50 text-slate-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    danger: "border-red-200 bg-red-50 text-red-700",
    info: "border-cyan-200 bg-cyan-50 text-cyan-700"
  }[value];
}

function toneSummaryValueClass(value: DashboardTone) {
  return {
    neutral: "text-slate-700",
    success: "text-emerald-700",
    warning: "text-amber-700",
    danger: "text-red-700",
    info: "text-cyan-700"
  }[value];
}

function getPreferredOpenGroup(groups: CommandCenterGroup[]) {
  return groups.find((group) => group.key === "workforce" && group.available)?.key
    ?? groups.find((group) => group.available)?.key
    ?? groups[0]?.key
    ?? "";
}

const KPI_ROW_SIZE = 5;
const commandCenterKpiCardClass = "w-full min-w-0";

function getKpiGroupFullSummary(group: CommandCenterGroup) {
  if (!group.available) return group.warning ?? "This KPI group is temporarily unavailable.";
  if (!group.kpis.length) return "No KPI cards available.";
  return group.kpis.map((kpi) => `${kpi.title}: ${formatValue(kpi.value)}`).join(" | ");
}

function chunkKpis<T>(items: T[], size = KPI_ROW_SIZE) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function DashboardPage() {
  const { token } = useAuth();
  const [summary, setSummary] = useState<CommandCenterSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openGroup, setOpenGroup] = useState<string | undefined>(undefined);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setSummary(await api.getCommandCenterDashboard(token) as CommandCenterSummary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Command Center could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token]);

  const groups = useMemo(() => asGroups(summary), [summary]);
  const priorityActions = useMemo(() => summary?.priority_actions ?? [], [summary]);

  useEffect(() => {
    setOpenGroup((current) => {
      if (!groups.length) return undefined;
      if (current === "") return current;
      if (current && groups.some((group) => group.key === current)) return current;
      return getPreferredOpenGroup(groups);
    });
  }, [groups]);

  return (
    <PageShell>
      <PageHeader
        title="HRM Command Center"
        eyebrow="HRM command center"
        description="Enterprise people operations overview with live HR, attendance, payroll, compliance, and workflow indicators."
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      {error ? <WarningPanel tone="danger">{error}</WarningPanel> : null}

      {loading ? <CommandCenterSkeleton /> : null}

      {!loading && !error ? (
        <div className="space-y-5">
          {summary?.warnings?.length ? (
            <WarningPanel tone="warning">
              Some Command Center groups are temporarily unavailable. The remaining KPI groups are still current.
            </WarningPanel>
          ) : null}

          {groups.length ? (
            <Accordion
              type="single"
              collapsible
              value={openGroup}
              onValueChange={setOpenGroup}
              className="space-y-4"
            >
              {groups.map((group) => (
                <AccordionItem
                  key={group.key}
                  value={group.key}
                  className="overflow-hidden rounded-lg border bg-white shadow-panel"
                >
                  <AccordionTrigger className="px-4 py-3 hover:no-underline">
                    <div className="flex w-full min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex min-w-0 shrink-0 items-center gap-2 lg:max-w-[16rem]">
                        <span className="truncate text-sm font-semibold text-slate-950">{group.title}</span>
                        <Badge tone={group.available ? "success" : "warning"}>{group.available ? "Live" : "Warning"}</Badge>
                      </div>
                      <p
                        className="kpi-summary-region min-w-0 flex-1 text-left text-xs font-normal leading-5 lg:text-right"
                        title={getKpiGroupFullSummary(group)}
                      >
                        <CommandCenterKpiSummary group={group} />
                      </p>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="border-t p-0">
                  {group.available ? (
                    <CommandCenterKpiGrid kpis={group.kpis} />
                  ) : (
                    <div className="p-4">
                      <WarningPanel tone="warning">{group.warning ?? "This KPI group is temporarily unavailable."}</WarningPanel>
                    </div>
                  )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          ) : (
            <Panel className="p-6">
              <div className="flex items-start gap-3">
                <LayoutDashboard className="mt-1 h-5 w-5 text-muted-foreground" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-950">No operational KPI groups available</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Enabled modules and permission-allowed summaries will appear here when available.
                  </p>
                </div>
              </div>
            </Panel>
          )}

          <DashboardWidget title="Priority Actions" description="Permission-safe shortcuts into queues that need attention first.">
            {priorityActions.length ? (
              <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-3">
                {priorityActions.map((action) => <PriorityActionCard key={action.id} action={action} />)}
              </div>
            ) : (
              <div className="p-4">
                <QuickActionCard title="No urgent actions" description="Enabled modules do not currently have high-priority queues in your scope." />
              </div>
            )}
          </DashboardWidget>
        </div>
      ) : null}
    </PageShell>
  );
}

function CommandCenterKpiGrid({ kpis }: { kpis: CommandCenterKpi[] }) {
  return (
    <div className="mx-auto flex max-w-[89rem] flex-col items-center gap-4 p-4">
      {chunkKpis(kpis, KPI_ROW_SIZE).map((row, rowIndex) => (
        <div
          key={rowIndex}
          className="kpi-row grid w-full justify-center gap-4 [grid-template-columns:minmax(0,1fr)] sm:[grid-template-columns:repeat(2,minmax(0,18rem))] lg:[grid-template-columns:repeat(3,minmax(0,17rem))] 2xl:[grid-template-columns:repeat(var(--kpi-row-count),16.75rem)]"
          style={{ "--kpi-row-count": row.length } as CSSProperties & Record<"--kpi-row-count", number>}
        >
          {row.map((card) => <CommandCenterKpiCard key={card.id} card={card} />)}
        </div>
      ))}
    </div>
  );
}

function CommandCenterKpiSummary({ group }: { group: CommandCenterGroup }) {
  if (!group.available) {
    return <span className="text-amber-700">{group.warning ?? "This KPI group is temporarily unavailable."}</span>;
  }

  if (!group.kpis.length) {
    return <span className="text-slate-500">No KPI cards available.</span>;
  }

  return (
    <span className="inline-flex flex-wrap justify-start gap-x-2 gap-y-1 lg:justify-end">
      {group.kpis.map((kpi, index) => (
        <span key={kpi.id} className="inline-flex min-w-0 items-baseline gap-1">
          <span className="text-slate-600">{kpi.title}:</span>
          <span className={cn("font-semibold", toneSummaryValueClass(kpi.tone))}>{formatValue(kpi.value)}</span>
          {index < group.kpis.length - 1 ? <span className="ml-1 text-slate-300" aria-hidden="true">|</span> : null}
        </span>
      ))}
    </span>
  );
}

function CommandCenterKpiCard({ card }: { card: CommandCenterKpi }) {
  const Icon = iconMap[card.icon_key] ?? Activity;
  return (
    <Link
      to={card.route}
      className={cn("CommandCenterKpiCard group block h-full min-w-0 rounded-lg border bg-white p-4 shadow-panel transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/20", commandCenterKpiCardClass)}
    >
      <div className="flex h-full min-h-[148px] min-w-0 flex-col justify-between gap-4">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-950" title={card.title}>{card.title}</p>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{card.description}</p>
          </div>
          <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-md border", kpiTone(card.tone))}>
            <Icon className="h-4 w-4" />
          </span>
        </div>
        <div className="flex min-w-0 items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-2xl font-semibold tracking-tight text-slate-950" title={String(card.value)}>
              {formatValue(card.value)}
            </div>
            {card.secondary_value ? <p className="mt-1 truncate text-xs text-muted-foreground" title={String(card.secondary_value)}>{card.secondary_value}</p> : null}
          </div>
          <Badge tone={card.tone} className="shrink-0">{card.tone}</Badge>
        </div>
      </div>
    </Link>
  );
}

function PriorityActionCard({ action }: { action: PriorityAction }) {
  const Icon = iconMap[action.icon_key] ?? Activity;
  return (
    <Link to={action.route} className="block min-w-0 rounded-lg border bg-white p-4 shadow-panel transition hover:border-primary/40 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary/20">
      <div className="flex min-w-0 items-start gap-3">
        <span className={cn("mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md border", kpiTone(action.tone))}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <h3 className="truncate text-sm font-semibold text-slate-950">{action.title}</h3>
            <Badge tone={action.tone} className="shrink-0">{action.count.toLocaleString()}</Badge>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{action.description}</p>
        </div>
      </div>
    </Link>
  );
}

function CommandCenterSkeleton() {
  const skeletonCards = Array.from({ length: 4 }).map((_, index) => ({ id: `skeleton-${index}` }));

  return (
    <div className="space-y-5">
      {["Workforce", "Attendance", "Payroll"].map((group) => (
        <DashboardWidget key={group} title={group} description="Loading live KPI cards.">
          <div className="mx-auto flex max-w-[89rem] flex-col items-center gap-4 p-4">
            {chunkKpis(skeletonCards, KPI_ROW_SIZE).map((row, rowIndex) => (
              <div
                key={rowIndex}
                className="kpi-row grid w-full justify-center gap-4 [grid-template-columns:minmax(0,1fr)] sm:[grid-template-columns:repeat(2,minmax(0,18rem))] lg:[grid-template-columns:repeat(3,minmax(0,17rem))] 2xl:[grid-template-columns:repeat(var(--kpi-row-count),16.75rem)]"
                style={{ "--kpi-row-count": row.length } as CSSProperties & Record<"--kpi-row-count", number>}
              >
                {row.map((card) => (
                  <Panel key={card.id} className={cn("min-h-[148px] animate-pulse p-4", commandCenterKpiCardClass)}>
                    <div className="h-4 w-32 rounded bg-slate-100" />
                    <div className="mt-3 h-3 w-full rounded bg-slate-100" />
                    <div className="mt-8 h-8 w-20 rounded bg-slate-100" />
                  </Panel>
                ))}
              </div>
            ))}
          </div>
        </DashboardWidget>
      ))}
    </div>
  );
}
