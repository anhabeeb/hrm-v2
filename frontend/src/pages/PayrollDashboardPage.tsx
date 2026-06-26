import { Link } from "react-router-dom";
import { AlertCircle, Banknote, CalendarDays, CheckCircle2, Clock3, FileWarning, PauseCircle, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { PayrollNav } from "../components/payroll/PayrollNav";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { DashboardWidget, MetricGrid, PageHeader, PageShell, StatCard, WarningPanel } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { StatusBadge, humanizeStatus } from "../components/ui/status-badge";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import type { PayrollDashboard } from "../types/payroll";

function money(value: number | null | undefined) {
  return `MVR ${Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function PayrollDashboardPage() {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("payroll.view");
  const [dashboard, setDashboard] = useState<PayrollDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!token || !canView) return;
      setLoading(true);
      setError(null);
      try {
        setDashboard(await api.getPayrollDashboard(token));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Unable to load payroll dashboard.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [token, canView]);

  if (!canView) return <Panel><EmptyState title="Payroll unavailable" description="Your account needs payroll.view permission." /></Panel>;

  const metrics = [
    { label: "Current period net", value: money(dashboard?.current_period_net_total), icon: <Banknote className="h-4 w-4" />, tone: "info" as const },
    { label: "Draft runs", value: dashboard?.draft_runs ?? 0, icon: <Clock3 className="h-4 w-4" />, tone: "warning" as const },
    { label: "Approved placeholders", value: dashboard?.approved_runs ?? 0, icon: <CheckCircle2 className="h-4 w-4" />, tone: "success" as const },
    { label: "Finalized placeholders", value: dashboard?.paid_runs ?? 0, icon: <WalletCards className="h-4 w-4" />, tone: "neutral" as const },
    { label: "Pending advances", value: dashboard?.pending_advances ?? 0, icon: <AlertCircle className="h-4 w-4" />, tone: "warning" as const },
    { label: "Excluded employees", value: dashboard?.employees_excluded_from_payroll ?? 0, icon: <FileWarning className="h-4 w-4" />, tone: "danger" as const },
    { label: "Attendance candidates", value: dashboard?.attendance_deduction_candidates ?? 0, icon: <CalendarDays className="h-4 w-4" />, tone: "info" as const },
    { label: "Payroll holds", value: dashboard?.payroll_holds ?? 0, icon: <PauseCircle className="h-4 w-4" />, tone: "warning" as const }
  ];

  return (
    <PageShell>
      <PageHeader
        title="Payroll"
        eyebrow="Payroll Core"
        description="Month-end payroll foundation with scoped periods, review runs, advances, deductions, reports, and cutoff-aware warnings."
      />
      <PayrollNav />
      {error ? <WarningPanel tone="danger">{error}</WarningPanel> : null}
      {loading ? <Panel><EmptyState title="Loading payroll dashboard" description="Fetching payroll counters and current period status." /></Panel> : null}
      {!loading && dashboard ? (
        <>
          <MetricGrid>
            {metrics.map((metric) => <StatCard key={metric.label} label={metric.label} value={metric.value} icon={metric.icon} tone={metric.tone} />)}
          </MetricGrid>

          <DashboardWidget
            title="Current payroll period"
            description="Salary is normally paid at month end. Prompt 10 keeps final payment processing as a later phase."
            actions={
              <div className="flex flex-wrap gap-2">
                <Link to="/payroll/periods"><Button size="sm" variant="outline">Open periods</Button></Link>
                <Link to="/payroll/runs"><Button size="sm">Open runs</Button></Link>
              </div>
            }
          >
            {dashboard.current_period ? (
              <div className="grid gap-3 p-4 md:grid-cols-4">
                <Info label="Month/year" value={`${dashboard.current_period.period_month}/${dashboard.current_period.period_year}`} />
                <Info label="Date range" value={`${dashboard.current_period.start_date} to ${dashboard.current_period.end_date}`} />
                <Info label="Payment date" value={dashboard.current_period.salary_payment_date ?? "-"} />
                <div><p className="text-xs text-muted-foreground">Status</p><StatusBadge value={dashboard.current_period.status} /></div>
              </div>
            ) : <EmptyState title="No current payroll period" description="Create an open payroll period before generating runs." />}
          </DashboardWidget>

          <DashboardWidget title="Payroll run status stepper" description="Prompt 10 runs move through review-safe placeholders before future payment processing is enabled.">
            <div className="grid gap-2 p-4 md:grid-cols-5">
              {["DRAFT", "CALCULATING", "READY_FOR_REVIEW", "APPROVED_PLACEHOLDER", "FINALIZED_PLACEHOLDER"].map((status, index) => (
                <div key={status} className="rounded-md border bg-slate-50 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Step {index + 1}</p>
                  <p className="mt-1 truncate text-xs font-semibold text-slate-900" title={status}>{humanizeStatus(status)}</p>
                </div>
              ))}
            </div>
          </DashboardWidget>
        </>
      ) : null}
    </PageShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-sm font-medium">{value}</p></div>;
}
