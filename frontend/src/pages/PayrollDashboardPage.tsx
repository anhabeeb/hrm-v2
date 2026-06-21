import { Link } from "react-router-dom";
import { AlertCircle, Banknote, CalendarDays, CheckCircle2, Clock3, FileWarning, PauseCircle, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { PayrollNav } from "../components/payroll/PayrollNav";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Panel } from "../components/ui/panel";
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
    { label: "Current period net", value: money(dashboard?.current_period_net_total), icon: Banknote },
    { label: "Draft runs", value: dashboard?.draft_runs ?? 0, icon: Clock3 },
    { label: "Approved runs", value: dashboard?.approved_runs ?? 0, icon: CheckCircle2 },
    { label: "Paid runs", value: dashboard?.paid_runs ?? 0, icon: WalletCards },
    { label: "Pending advances", value: dashboard?.pending_advances ?? 0, icon: AlertCircle },
    { label: "Excluded employees", value: dashboard?.employees_excluded_from_payroll ?? 0, icon: FileWarning },
    { label: "Attendance candidates", value: dashboard?.attendance_deduction_candidates ?? 0, icon: CalendarDays },
    { label: "Payroll holds", value: dashboard?.payroll_holds ?? 0, icon: PauseCircle }
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Payroll</h1>
          <p className="text-sm text-muted-foreground">Month-end payroll foundation with periods, runs, advances, deductions, and exports.</p>
        </div>
        <PayrollNav />
      </div>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {loading ? <Panel><EmptyState title="Loading payroll dashboard" description="Fetching payroll counters and current period status." /></Panel> : null}
      {!loading && dashboard ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => {
              const Icon = metric.icon;
              return (
                <Panel key={metric.label} className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{metric.label}</p>
                      <p className="mt-1 text-xl font-semibold">{metric.value}</p>
                    </div>
                    <div className="rounded-md border bg-slate-50 p-2"><Icon className="h-4 w-4 text-slate-600" /></div>
                  </div>
                </Panel>
              );
            })}
          </div>
          <Panel className="overflow-hidden">
            <div className="flex flex-col gap-3 border-b px-4 py-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-sm font-semibold">Current payroll period</h2>
                <p className="text-xs text-muted-foreground">Salary is normally paid at month end. Complex statutory rules remain future configuration.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link to="/payroll/periods"><Button size="sm" variant="outline">Open periods</Button></Link>
                <Link to="/payroll/runs"><Button size="sm">Open runs</Button></Link>
              </div>
            </div>
            {dashboard.current_period ? (
              <div className="grid gap-3 p-4 md:grid-cols-4">
                <Info label="Month/year" value={`${dashboard.current_period.period_month}/${dashboard.current_period.period_year}`} />
                <Info label="Date range" value={`${dashboard.current_period.start_date} to ${dashboard.current_period.end_date}`} />
                <Info label="Payment date" value={dashboard.current_period.salary_payment_date ?? "-"} />
                <div><p className="text-xs text-muted-foreground">Status</p><Badge tone={dashboard.current_period.status === "PAID" ? "success" : "neutral"}>{dashboard.current_period.status}</Badge></div>
              </div>
            ) : <EmptyState title="No current payroll period" description="Create an open payroll period before generating runs." />}
          </Panel>
        </>
      ) : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-sm font-medium">{value}</p></div>;
}
