import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, Banknote, CalendarDays, CheckCircle2, Clock3, FileWarning, PauseCircle, WalletCards, type LucideIcon } from "lucide-react";
import { PageShell, WarningPanel } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavRail } from "../components/ui/route-nav-rail";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { humanizeTechnicalLabel } from "../lib/displayLabels";
import { cn } from "../lib/utils";
import { PAYROLL_NAV_ITEMS } from "./payrollNav";
import type { PayrollDashboard } from "../types/payroll";

function money(value: number | null | undefined) {
  return `MVR ${Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function toneClasses(tone: "info" | "warning" | "success" | "neutral" | "danger") {
  if (tone === "success") return "border-[#5DCAA5]/30 bg-[#EAF3DE] text-[#27500A]";
  if (tone === "warning") return "border-[#FAC775]/30 bg-[#FAEEDA] text-[#854F0B]";
  if (tone === "danger") return "border-[#F09595]/30 bg-[#FCEBEB] text-[#A32D2D]";
  if (tone === "info") return "border-[#7FB3E0]/30 bg-[#E6F1FB] text-[#0C447C]";
  return "border-[#D3D3E3] bg-[#F7F7FB] text-[#6B6F86]";
}

function MetricTile({ label, value, icon: Icon, tone }: { label: string; value: string | number; icon: LucideIcon; tone: "info" | "warning" | "success" | "neutral" | "danger" }) {
  return (
    <Panel className="p-3">
      <div className="flex items-start justify-between">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full border", toneClasses(tone))}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className="mt-2 text-xl font-medium text-slate-950">{value}</p>
    </Panel>
  );
}

export function PayrollDashboardPage() {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("payroll.view");
  const [dashboard, setDashboard] = useState<PayrollDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !canView) return;
    setLoading(true);
    setError(null);
    api.getPayrollDashboard(token)
      .then(setDashboard)
      .catch((err) => setError(err instanceof Error ? err.message : "Unable to load payroll dashboard."))
      .finally(() => setLoading(false));
  }, [token, canView]);

  if (!canView) {
    return (
      <PageShell constrained={false}>
        <div className="flex gap-4">
          <RouteNavRail items={PAYROLL_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
          <div className="min-w-0 flex-1"><Panel><EmptyState title="Payroll unavailable" description="Your account needs payroll.view permission." /></Panel></div>
        </div>
      </PageShell>
    );
  }

  const attendanceModuleEnabled = dashboard?.attendance_module_enabled !== false;
  const metrics: Array<{ label: string; value: string | number; icon: LucideIcon; tone: "info" | "warning" | "success" | "neutral" | "danger" }> = [
    { label: "Current period net", value: money(dashboard?.current_period_net_total), icon: Banknote, tone: "info" },
    { label: "Draft runs", value: dashboard?.draft_runs ?? 0, icon: Clock3, tone: "warning" },
    { label: "Approved placeholders", value: dashboard?.approved_runs ?? 0, icon: CheckCircle2, tone: "success" },
    { label: "Finalized placeholders", value: dashboard?.paid_runs ?? 0, icon: WalletCards, tone: "neutral" },
    { label: "Pending advances", value: dashboard?.pending_advances ?? 0, icon: AlertCircle, tone: "warning" },
    { label: "Excluded employees", value: dashboard?.employees_excluded_from_payroll ?? 0, icon: FileWarning, tone: "danger" },
    ...(attendanceModuleEnabled ? [{ label: "Attendance candidates", value: dashboard?.attendance_deduction_candidates ?? 0, icon: CalendarDays, tone: "info" as const }] : []),
    { label: "Payroll holds", value: dashboard?.payroll_holds ?? 0, icon: PauseCircle, tone: "warning" }
  ];

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={PAYROLL_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-lg font-medium text-slate-950">Payroll</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Month-end payroll foundation with scoped periods, review runs, advances, deductions, and reports</p>
          </div>

          {error ? <WarningPanel tone="danger">{error}</WarningPanel> : null}

          {loading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Panel key={i} className="h-20 animate-pulse" />)}</div>
          ) : dashboard ? (
            <>
              {!attendanceModuleEnabled ? (
                <WarningPanel tone="warning">
                  {dashboard.attendance_disabled_notice ?? "Attendance module is disabled. Payroll will not use attendance records, late penalties, absences, missed punches, or attendance-based days worked. Use manual payroll adjustments or payroll import inputs if deductions are required."}
                </WarningPanel>
              ) : null}

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {metrics.map((metric) => <MetricTile key={metric.label} {...metric} />)}
              </div>

              <Panel className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-950">Current payroll period</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Salary is normally paid at month end.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link to="/v3-preview/payroll/periods"><Button size="sm" variant="outline">Open periods</Button></Link>
                    <Link to="/v3-preview/payroll/runs"><Button size="sm">Open runs</Button></Link>
                  </div>
                </div>
                {dashboard.current_period ? (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div><p className="text-[10px] text-muted-foreground">Month/year</p><p className="mt-0.5 text-xs font-medium text-slate-950">{dashboard.current_period.period_month}/{dashboard.current_period.period_year}</p></div>
                    <div><p className="text-[10px] text-muted-foreground">Date range</p><p className="mt-0.5 text-xs font-medium text-slate-950">{dashboard.current_period.start_date} to {dashboard.current_period.end_date}</p></div>
                    <div><p className="text-[10px] text-muted-foreground">Payment date</p><p className="mt-0.5 text-xs font-medium text-slate-950">{dashboard.current_period.salary_payment_date ?? "-"}</p></div>
                    <div><p className="text-[10px] text-muted-foreground">Status</p><span className="mt-0.5 inline-block rounded-full bg-[#F7F7FB] px-2.5 py-0.5 text-[10px] font-medium text-[#6B6F86]">{humanizeTechnicalLabel(dashboard.current_period.status)}</span></div>
                  </div>
                ) : (
                  <div className="mt-3"><EmptyState title="No current payroll period" description="Create an open payroll period before generating runs." /></div>
                )}
              </Panel>

              <Panel className="p-4">
                <p className="text-sm font-medium text-slate-950">Payroll run status stepper</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Runs move through review-safe placeholders before future payment processing is enabled.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-5">
                  {["DRAFT", "CALCULATING", "READY_FOR_REVIEW", "APPROVED_PLACEHOLDER", "FINALIZED_PLACEHOLDER"].map((status, index) => (
                    <div key={status} className="rounded-md bg-[#F7F7FB] px-3 py-2">
                      <p className="text-[10px] text-muted-foreground">Step {index + 1}</p>
                      <p className="mt-1 truncate text-xs font-medium text-slate-950" title={status}>{humanizeTechnicalLabel(status)}</p>
                    </div>
                  ))}
                </div>
              </Panel>
            </>
          ) : null}
        </div>
      </div>
    </PageShell>
  );
}
