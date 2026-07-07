import {
  AlertCircle,
  AlertTriangle,
  Cake,
  Check,
  Clock3,
  FileSignature,
  FileWarning,
  IdCard,
  Package,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  TrendingUp,
  UserPlus,
  Users,
  type LucideIcon
} from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { PageShell, WarningPanel } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { Button } from "../components/ui/button";
import { CardSkeleton } from "../components/loading/CardSkeleton";
import { api } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { useAuth } from "../hooks/useAuth";
import { useWorkspaceQuery } from "../hooks/useWorkspaceQuery";
import type { AuthUser } from "../types/auth";

type DashboardTone = "neutral" | "success" | "warning" | "danger" | "info";

interface OverviewKpi {
  id: string;
  title: string;
  value: number | string;
  tone: DashboardTone;
  icon_key: string;
  route: string;
  secondary_value?: string | number | null;
}

interface AttendanceWeekDay {
  date: string;
  present: number;
  late: number;
  absent: number;
}

interface Birthday {
  name: string;
  month_day: string;
  is_today: boolean;
  department: string | null;
}

interface DepartmentSlice {
  department: string;
  count: number;
  percent: number;
}

interface ActivityItem {
  label: string;
  created_at: string;
}

interface PayrollSnapshot {
  next_run: string | null;
  status: string | null;
  est_total_cost: number | null;
  employees_included: number;
  pending_advances: number;
  trend_percent: number | null;
}

interface ApprovalQueueItem {
  key: string;
  title: string;
  count: number;
  icon_key: string;
}

interface HeadcountPoint {
  month: string;
  count: number;
}

interface AssetsWidget {
  overdue_returns: number;
  low_stock_items: number;
  pending_assignments: number;
}

interface DashboardOverview {
  kpis: OverviewKpi[];
  attendance_week: AttendanceWeekDay[];
  birthdays_this_week: Birthday[];
  department_breakdown: DepartmentSlice[];
  recent_activity: ActivityItem[];
  payroll_snapshot: PayrollSnapshot;
  approvals_queue: ApprovalQueueItem[];
  headcount_trend: HeadcountPoint[];
  assets_widget: AssetsWidget;
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

// Today's real backend (worker/src/routes/dashboard.ts on this branch) only
// returns the legacy per-module "groups" shape, not yet the bespoke `overview`
// shape this page is designed against. This adapter maps whatever real KPIs
// already exist onto the new widgets, and leaves the rest genuinely empty
// (each widget below already has an honest "no data yet" state) rather than
// fabricating numbers. Delete this adapter once the real overview endpoint
// (already written on redesign/phase-2-dashboard) is reconnected.
interface LegacyKpi {
  id: string;
  value: number | string;
}
interface LegacyGroup {
  kpis?: LegacyKpi[];
}
interface LegacyCommandCenterSummary {
  generated_at?: string;
  groups?: Record<string, LegacyGroup>;
  priority_actions?: PriorityAction[];
  warnings?: { group: string; message?: string }[];
}

function findLegacyKpiValue(groups: Record<string, LegacyGroup> | undefined, groupKey: string, kpiId: string): number | undefined {
  const value = groups?.[groupKey]?.kpis?.find((k) => k.id === kpiId)?.value;
  return typeof value === "number" ? value : undefined;
}

function currentWeekPlaceholder(): AttendanceWeekDay[] {
  const now = new Date();
  const day = now.getUTCDay();
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - (day === 0 ? 6 : day - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), present: 0, late: 0, absent: 0 };
  });
}

function deriveOverviewFromLegacySummary(summary: LegacyCommandCenterSummary): DashboardOverview {
  const groups = summary.groups;
  const totalEmployees = findLegacyKpiValue(groups, "workforce", "total-employees") ?? 0;
  const presentToday = findLegacyKpiValue(groups, "attendance", "present-today");
  const attendanceRate = totalEmployees > 0 && presentToday !== undefined ? Math.round((presentToday / totalEmployees) * 100) : null;
  const pendingLeave = findLegacyKpiValue(groups, "leave", "pending-leave") ?? 0;
  const onboardingCount = findLegacyKpiValue(groups, "workforce", "onboarding-employees") ?? 0;
  const renewalsDue = findLegacyKpiValue(groups, "contracts", "renewals-due");
  const pendingReturns = findLegacyKpiValue(groups, "assets", "pending-returns") ?? 0;
  const pendingClearance = findLegacyKpiValue(groups, "assets", "pending-clearance") ?? 0;

  const kpis: OverviewKpi[] = [
    { id: "total-employees", title: "Total Employees", value: totalEmployees, tone: "info", icon_key: "users", route: "/employees" },
    { id: "attendance-rate", title: "Attendance Rate", value: attendanceRate === null ? "N/A" : `${attendanceRate}%`, tone: "success", icon_key: "check", route: "/attendance/records" },
    { id: "open-leave", title: "Open Leave Requests", value: pendingLeave, tone: "warning", icon_key: "calendar-due", route: "/leave/approvals?status=PENDING_APPROVAL" },
    { id: "pending-onboarding", title: "Pending Onboarding", value: onboardingCount, tone: "warning", icon_key: "user-plus", route: "/employees/setup" }
  ];

  const approvalsQueue: ApprovalQueueItem[] = [
    { key: "leave", title: "Leave requests", count: pendingLeave, icon_key: "file-warning" },
    ...(renewalsDue !== undefined ? [{ key: "contracts", title: "Contract renewals", count: renewalsDue, icon_key: "file-signature" }] : [])
  ];

  return {
    kpis,
    attendance_week: currentWeekPlaceholder(),
    birthdays_this_week: [],
    department_breakdown: [],
    recent_activity: [],
    payroll_snapshot: { next_run: null, status: null, est_total_cost: null, employees_included: 0, pending_advances: 0, trend_percent: null },
    approvals_queue: approvalsQueue,
    headcount_trend: [],
    assets_widget: { overdue_returns: pendingReturns, low_stock_items: 0, pending_assignments: pendingClearance }
  };
}

const iconMap: Record<string, LucideIcon> = {
  users: Users,
  check: Check,
  "calendar-due": Clock3,
  "user-plus": UserPlus,
  "trending-up": TrendingUp,
  "file-warning": FileWarning,
  "file-signature": FileSignature,
  cake: Cake,
  "shield-check": ShieldCheck,
  "id-badge-2": IdCard,
  package: Package,
  "alert-circle": AlertCircle,
  "triangle-alert": AlertTriangle
};

// Category colors match the approved 6-triad palette (Badge/Button share the
// same hex values) so dashboard tones read consistently with the rest of the app.
function toneIconClass(value: DashboardTone) {
  return {
    neutral: "border-slate-200 bg-slate-50 text-slate-700",
    success: "border-[#5DCAA5] bg-[#EAF3DE] text-[#27500A]",
    warning: "border-[#FAC775] bg-[#FAEEDA] text-[#854F0B]",
    danger: "border-[#F09595] bg-[#FCEBEB] text-[#A32D2D]",
    info: "border-[#378ADD] bg-[#E6F1FB] text-[#0C447C]"
  }[value];
}

function toneTextClass(value: DashboardTone) {
  return {
    neutral: "text-slate-500",
    success: "text-[#27500A]",
    warning: "text-[#854F0B]",
    danger: "text-[#A32D2D]",
    info: "text-[#0C447C]"
  }[value];
}

function cleanWelcomeText(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || /^(undefined|null|\[object object\])$/i.test(text)) return "";
  return text;
}

function titleCaseToken(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function emailPrefix(value: unknown) {
  const text = cleanWelcomeText(value);
  if (!text.includes("@")) return "";
  return titleCaseToken(text.split("@")[0] ?? "");
}

function resolveWelcomeName(user: AuthUser | null) {
  return [user?.employee_full_name, user?.employee_display_name, user?.name, user?.username, emailPrefix(user?.email)].map(cleanWelcomeText).find(Boolean) ?? "User";
}

function resolveWelcomeTitle(user: AuthUser | null) {
  const roleTitle = (user?.roles ?? []).map((role) => titleCaseToken(cleanWelcomeText(role))).find(Boolean);
  return [user?.employee_position_title, user?.employee_job_title, user?.employee_designation, roleTitle, user?.is_owner ? "Owner" : ""].map(cleanWelcomeText).find(Boolean) ?? "Team Member";
}

function formatDayLabel(dateStr: string) {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" });
}

function formatMonthLabel(monthStr: string) {
  return new Date(`${monthStr}-01T00:00:00Z`).toLocaleDateString(undefined, { month: "short", timeZone: "UTC" });
}

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${Math.max(minutes, 0)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatCurrency(value: number) {
  return `MVR ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatBirthdayLabel(monthDay: string) {
  return new Date(`2024-${monthDay}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}

export function DashboardPage() {
  const { user } = useAuth();
  const summaryQuery = useWorkspaceQuery<LegacyCommandCenterSummary>({
    workspaceName: "command-center",
    queryKey: (scope) => queryKeys.dashboard.commandCenter(scope),
    queryFn: ({ token, signal }) => api.getCommandCenterDashboard(token, signal) as Promise<LegacyCommandCenterSummary>
  });
  const summary = summaryQuery.data ?? null;
  const loading = summaryQuery.firstLoad;
  const error = summaryQuery.error ? summaryQuery.error.message : null;
  const overview = useMemo(() => (summary ? deriveOverviewFromLegacySummary(summary) : undefined), [summary]);
  const welcomeName = useMemo(() => resolveWelcomeName(user), [user]);
  const welcomeTitle = useMemo(() => resolveWelcomeTitle(user), [user]);

  async function refresh() {
    await summaryQuery.refetch();
  }

  return (
    <PageShell>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between rounded-card border bg-white px-5 py-4 shadow-panel">
          <div>
            <p className="text-lg font-medium text-slate-950">Welcome, {welcomeName}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {welcomeTitle}
              {overview?.attendance_week?.length ? ` · Week of ${formatDayLabel(overview.attendance_week[0].date)} ${overview.attendance_week[0].date.slice(8)} – ${formatDayLabel(overview.attendance_week[6].date)} ${overview.attendance_week[6].date.slice(8)}` : null}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {error ? <WarningPanel tone="danger">{error}</WarningPanel> : null}
        {summary?.warnings?.length ? <WarningPanel tone="warning">Some dashboard widgets are temporarily unavailable.</WarningPanel> : null}

        {loading ? <DashboardSkeleton /> : null}

        {!loading && overview ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {overview.kpis.map((kpi) => <KpiCard key={kpi.id} kpi={kpi} />)}
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.4fr_1fr]">
              <AttendanceOverviewCard days={overview.attendance_week} />
              <RemindersCard priorityActions={summary?.priority_actions ?? []} />
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_1.4fr]">
              <DepartmentDonutCard breakdown={overview.department_breakdown} />
              <RecentActivityCard items={overview.recent_activity} />
            </div>

            <UpcomingBirthdaysCard birthdays={overview.birthdays_this_week} />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <PayrollSnapshotCard snapshot={overview.payroll_snapshot} />
              <ApprovalsQueueCard items={overview.approvals_queue} />
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.4fr_1fr]">
              <HeadcountTrendCard points={overview.headcount_trend} />
              <AssetsWidgetCard widget={overview.assets_widget} />
            </div>
          </div>
        ) : null}

        {!loading && !overview && !error ? (
          <Panel className="p-6">
            <p className="text-sm font-semibold text-slate-950">No dashboard data available</p>
            <p className="mt-1 text-sm text-muted-foreground">Widgets will appear here once the workspace summary is available.</p>
          </Panel>
        ) : null}
      </div>
    </PageShell>
  );
}

function KpiCard({ kpi }: { kpi: OverviewKpi }) {
  const Icon = iconMap[kpi.icon_key] ?? Users;
  return (
    <Link to={kpi.route} className="block rounded-card border bg-white p-3 shadow-panel transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between">
        <span className="text-xs text-muted-foreground">{kpi.title}</span>
        <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full border", toneIconClass(kpi.tone))}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className="mt-2 text-xl font-medium text-slate-950">{kpi.value}</p>
      {kpi.secondary_value ? <p className={cn("mt-0.5 truncate text-xs", toneTextClass(kpi.tone))}>{kpi.secondary_value}</p> : null}
    </Link>
  );
}

function AttendanceOverviewCard({ days }: { days: AttendanceWeekDay[] }) {
  const maxTotal = Math.max(1, ...days.map((d) => d.present + d.late + d.absent));
  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-950">Attendance overview</p>
        <div className="flex gap-2.5 text-[10px] text-muted-foreground">
          <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-sm bg-[#5DCAA5]" />Present</span>
          <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-sm bg-[#FAC775]" />Late</span>
          <span><span className="mr-1 inline-block h-1.5 w-1.5 rounded-sm bg-[#F09595]" />Absent</span>
        </div>
      </div>
      <div className="flex h-32 items-end gap-2">
        {days.map((day) => {
          const total = day.present + day.late + day.absent;
          return (
            <div key={day.date} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="flex h-24 w-full flex-col justify-end overflow-hidden rounded-md bg-[#F7F7FB]">
                {total > 0 ? (
                  <>
                    <div style={{ height: `${(day.absent / maxTotal) * 100}%` }} className="w-full bg-[#F09595]" />
                    <div style={{ height: `${(day.late / maxTotal) * 100}%` }} className="w-full bg-[#FAC775]" />
                    <div style={{ height: `${(day.present / maxTotal) * 100}%` }} className="w-full bg-[#5DCAA5]" />
                  </>
                ) : null}
              </div>
              <span className="text-[10px] text-muted-foreground">{formatDayLabel(day.date)}</span>
            </div>
          );
        })}
      </div>
      {maxTotal <= 1 && days.every((d) => d.present + d.late + d.absent === 0) ? (
        <p className="mt-2 text-center text-[10px] text-muted-foreground">No attendance records logged yet this week.</p>
      ) : null}
    </Panel>
  );
}

function RemindersCard({ priorityActions }: { priorityActions: PriorityAction[] }) {
  const items = priorityActions.filter((a) => a.count > 0).slice(0, 4).map((a) => ({ key: a.id, icon: iconMap[a.icon_key] ?? FileWarning, tone: a.tone, title: a.title, detail: `${a.count} pending` }));
  return (
    <Panel className="p-4">
      <p className="mb-3 text-xs font-semibold text-slate-950">Reminders</p>
      {items.length ? (
        <div className="flex flex-col gap-2.5">
          {items.map((item) => (
            <div key={item.key} className="flex items-start gap-2.5">
              <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-md border", toneIconClass(item.tone))}>
                <item.icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-950">{item.title}</p>
                <p className="truncate text-[10px] text-muted-foreground">{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Nothing needs your attention right now.</p>
      )}
    </Panel>
  );
}

const BIRTHDAY_AVATAR_COLORS = ["#378ADD", "#F0997B", "#AFA9EC", "#FAC775", "#F09595"];

function UpcomingBirthdaysCard({ birthdays }: { birthdays: Birthday[] }) {
  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-950">Upcoming birthdays</p>
        <span className="text-[10px] text-muted-foreground">Company-wide</span>
      </div>
      {birthdays.length ? (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
          {birthdays.map((b, index) => (
            <div
              key={`${b.name}-${b.month_day}`}
              className="flex items-center gap-2.5 rounded-md p-2.5"
              style={{ background: b.is_today ? "#EAF3DE" : "#F7F7FB" }}
            >
              <span
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-medium text-white"
                style={{ background: b.is_today ? "#5DCAA5" : BIRTHDAY_AVATAR_COLORS[index % BIRTHDAY_AVATAR_COLORS.length] }}
              >
                {initialsOf(b.name)}
              </span>
              <div className="min-w-0">
                <p className={cn("truncate text-xs font-medium", b.is_today ? "text-[#27500A]" : "text-slate-950")}>{b.name}</p>
                <p className={cn("truncate text-[10px]", b.is_today ? "text-[#27500A]" : "text-muted-foreground")}>
                  {b.is_today ? (
                    <>Today <Cake className="ml-0.5 inline h-2.5 w-2.5 align-[-1px]" /></>
                  ) : (
                    `${formatBirthdayLabel(b.month_day)}${b.department ? ` · ${b.department}` : ""}`
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No birthdays in the next 7 days.</p>
      )}
    </Panel>
  );
}

const DONUT_COLORS = ["#378ADD", "#F0997B", "#AFA9EC"];
const DONUT_TEXT_COLORS = ["#185FA5", "#993C1D", "#534AB7"];

function DepartmentDonutCard({ breakdown }: { breakdown: DepartmentSlice[] }) {
  let offset = 0;
  const circumference = 2 * Math.PI * 36;
  return (
    <Panel className="flex items-center gap-4 p-4">
      {breakdown.length ? (
        <>
          <svg width="90" height="90" viewBox="0 0 90 90" aria-hidden="true">
            {breakdown.map((slice, index) => {
              const length = (slice.percent / 100) * circumference;
              const dashoffset = circumference - offset;
              offset += length;
              return (
                <circle
                  key={slice.department}
                  cx="45" cy="45" r="36" fill="none"
                  stroke={DONUT_COLORS[index % DONUT_COLORS.length]}
                  strokeWidth="14"
                  strokeDasharray={`${length} ${circumference}`}
                  strokeDashoffset={dashoffset}
                  transform="rotate(-90 45 45)"
                />
              );
            })}
          </svg>
          <div className="flex flex-col gap-1.5 text-xs">
            <p className="mb-0.5 text-xs font-semibold text-slate-950">By department</p>
            {breakdown.map((slice, index) => (
              <span key={slice.department} style={{ color: DONUT_TEXT_COLORS[index % DONUT_TEXT_COLORS.length] }}>
                <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-sm" style={{ background: DONUT_COLORS[index % DONUT_COLORS.length] }} />
                {slice.department} &middot; {slice.percent}%
              </span>
            ))}
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">No department assignments to summarize yet.</p>
      )}
    </Panel>
  );
}

function RecentActivityCard({ items }: { items: ActivityItem[] }) {
  return (
    <Panel className="p-4">
      <p className="mb-2.5 text-xs font-semibold text-slate-950">Recent activity</p>
      {items.length ? (
        <div className="flex flex-col gap-2">
          {items.slice(0, 5).map((item, index) => (
            <div key={index} className="flex items-center gap-2">
              <p className="flex-1 truncate text-xs text-muted-foreground">{item.label}</p>
              <span className="shrink-0 whitespace-nowrap text-[10px] text-muted-foreground">{timeAgo(item.created_at)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No recent activity to show.</p>
      )}
    </Panel>
  );
}

function PayrollSnapshotCard({ snapshot }: { snapshot: PayrollSnapshot }) {
  return (
    <Panel className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-950">Payroll snapshot</p>
        {snapshot.status ? <span className="rounded-full bg-[#EAF3DE] px-2 py-0.5 text-[10px] text-[#27500A]">{snapshot.status}</span> : null}
      </div>
      <div className="mb-3 flex items-end justify-between">
        <div><p className="text-[10px] text-muted-foreground">Next run</p><p className="text-sm font-medium text-slate-950">{snapshot.next_run ?? "Not set"}</p></div>
        <div className="text-right"><p className="text-[10px] text-muted-foreground">Est. total cost</p><p className="text-base font-medium text-slate-950">{snapshot.est_total_cost !== null ? formatCurrency(snapshot.est_total_cost) : "Not set"}</p></div>
      </div>
      <div className="flex gap-4 border-t pt-2.5 text-[10px] text-muted-foreground">
        <span><Users className="mr-1 inline h-3 w-3 align-[-1px]" />{snapshot.employees_included} included</span>
        <span className={snapshot.pending_advances > 0 ? "text-[#854F0B]" : undefined}><Clock3 className="mr-1 inline h-3 w-3 align-[-1px]" />{snapshot.pending_advances} pending advances</span>
        {snapshot.trend_percent !== null ? (
          <span className={snapshot.trend_percent >= 0 ? "text-[#27500A]" : "text-[#A32D2D]"}><TrendingUp className="mr-1 inline h-3 w-3 align-[-1px]" />{snapshot.trend_percent >= 0 ? "+" : ""}{snapshot.trend_percent}% vs last run</span>
        ) : null}
      </div>
    </Panel>
  );
}

function ApprovalsQueueCard({ items }: { items: ApprovalQueueItem[] }) {
  return (
    <Panel className="p-4">
      <p className="mb-2.5 text-xs font-semibold text-slate-950">Approvals queue</p>
      {items.length ? (
        <div className="flex flex-col gap-2">
          {items.map((item) => {
            const Icon = iconMap[item.icon_key] ?? FileWarning;
            return (
              <div key={item.key} className="flex items-center gap-2.5">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-[#378ADD] bg-[#E6F1FB]">
                  <Icon className="h-3.5 w-3.5 text-[#0C447C]" />
                </span>
                <p className="flex-1 text-xs text-slate-950">{item.title}</p>
                <span className="rounded-full bg-[#F7F7FB] px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{item.count}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No approvals queued right now.</p>
      )}
    </Panel>
  );
}

function HeadcountTrendCard({ points }: { points: HeadcountPoint[] }) {
  if (!points.length) {
    return (
      <Panel className="p-4">
        <p className="mb-1.5 text-xs font-semibold text-slate-950">Headcount trend</p>
        <p className="text-xs text-muted-foreground">Not enough history to chart a trend yet.</p>
      </Panel>
    );
  }
  const max = Math.max(1, ...points.map((p) => p.count));
  const min = Math.min(...points.map((p) => p.count));
  const width = 320;
  const height = 90;
  const stepX = points.length > 1 ? width / (points.length - 1) : width;
  const scaleY = (value: number) => height - 10 - ((value - min) / Math.max(1, max - min)) * (height - 20);
  const linePoints = points.map((p, i) => `${i * stepX},${scaleY(p.count)}`).join(" ");
  const areaPoints = `0,${height} ${linePoints} ${width},${height}`;
  const trendDelta = points.length ? points[points.length - 1].count - points[0].count : 0;
  return (
    <Panel className="p-4">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-950">Headcount trend</p>
        <span className={cn("text-[10px]", trendDelta >= 0 ? "text-[#27500A]" : "text-[#A32D2D]")}>
          <TrendingUp className="mr-1 inline h-3 w-3 align-[-1px]" />{trendDelta >= 0 ? "+" : ""}{trendDelta} over 6 months
        </span>
      </div>
      <svg width="100%" height={height + 20} viewBox={`0 0 ${width} ${height + 20}`} aria-hidden="true">
        <polygon points={areaPoints} fill="#EEEDFE" />
        <polyline points={linePoints} fill="none" stroke="#5B4FE9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => <text key={p.month} x={i * stepX} y={height + 16} fontSize="9" fill="#9A9DB0">{formatMonthLabel(p.month)}</text>)}
      </svg>
    </Panel>
  );
}

function AssetsWidgetCard({ widget }: { widget: AssetsWidget }) {
  const rows = [
    { key: "overdue", title: "Overdue returns", count: widget.overdue_returns, icon: AlertCircle, tone: "danger" as DashboardTone },
    { key: "low-stock", title: "Low stock items", count: widget.low_stock_items, icon: Package, tone: "warning" as DashboardTone },
    { key: "pending", title: "Pending assignments", count: widget.pending_assignments, icon: RotateCcw, tone: "info" as DashboardTone }
  ];
  return (
    <Panel className="p-4">
      <p className="mb-2.5 text-xs font-semibold text-slate-950">Assets &amp; uniforms</p>
      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center gap-2.5">
            <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-md border", toneIconClass(row.tone))}>
              <row.icon className="h-3.5 w-3.5" />
            </span>
            <p className="flex-1 text-xs text-slate-950">{row.title}</p>
            <span className="rounded-full bg-[#F7F7FB] px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{row.count}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading dashboard">
      <CardSkeleton cards={4} />
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {[0, 1].map((i) => (
          <Panel key={i} className="p-4">
            <div className="h-4 w-32 animate-pulse rounded bg-slate-100" />
            <div className="mt-4 h-24 animate-pulse rounded bg-slate-100" />
          </Panel>
        ))}
      </div>
    </div>
  );
}
