import { useEffect, useState } from "react";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavRail } from "../components/ui/route-nav-rail";
import { ExportMenu } from "../components/export/ExportMenu";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { humanizeTechnicalLabel } from "../lib/displayLabels";
import { PAYROLL_NAV_ITEMS } from "./payrollNav";

interface PayrollHistoryRow {
  payroll_run_id: string;
  employee_id: string;
  employee_no_snapshot: string;
  employee_name_snapshot: string;
  department_name: string | null;
  location_name: string | null;
  period_month: number;
  period_year: number;
  run_no: number;
  total_earnings: number;
  total_deductions: number;
  net_salary: number;
  status: string;
}

function money(value: number | null | undefined) {
  return `MVR ${Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function PayrollHistoryPage() {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("payroll.history.view") || permissions.has("payroll.reports.view") || permissions.has("payroll.view");
  const [rows, setRows] = useState<PayrollHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !canView) return;
    setLoading(true);
    api.getPayrollHistory(token).then((res) => setRows((res.history ?? []) as unknown as PayrollHistoryRow[])).finally(() => setLoading(false));
  }, [token, canView]);

  if (!canView) {
    return (
      <PageShell constrained={false}>
        <div className="flex gap-4">
          <RouteNavRail items={PAYROLL_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
          <div className="min-w-0 flex-1"><Panel><EmptyState title="Payroll history unavailable" description="Your account needs payroll history permission." /></Panel></div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={PAYROLL_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-slate-950">History</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Finalized payroll history based on frozen payroll result snapshots</p>
            </div>
            <ExportMenu variant="plain" moduleName="Payroll history" rows={rows as unknown as Record<string, unknown>[]} columns={["period_month", "period_year", "run_no", "employee_no_snapshot", "employee_name_snapshot", "department_name", "location_name", "total_earnings", "total_deductions", "net_salary", "status"]} />
          </div>

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : rows.length ? (
            <div className="flex flex-col gap-2">
              {rows.map((row, index) => (
                <Panel key={`${row.payroll_run_id}-${row.employee_id}-${index}`} className="flex items-center gap-3.5 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-950">{row.employee_name_snapshot} <span className="font-normal text-muted-foreground">{row.employee_no_snapshot}</span></p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{row.department_name ?? "No department"} · {row.period_month}/{row.period_year} · Run #{row.run_no}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <div className="text-right"><p className="text-[9px] text-muted-foreground">Earnings</p><p className="text-xs text-slate-950">{money(row.total_earnings)}</p></div>
                    <div className="text-right"><p className="text-[9px] text-muted-foreground">Deductions</p><p className="text-xs text-slate-950">{money(row.total_deductions)}</p></div>
                    <div className="text-right"><p className="text-[9px] text-muted-foreground">Net</p><p className="text-xs font-medium text-slate-950">{money(row.net_salary)}</p></div>
                    <span className="rounded-full bg-[#F7F7FB] px-2.5 py-1 text-[10px] font-medium text-[#6B6F86]">{humanizeTechnicalLabel(row.status)}</span>
                  </div>
                </Panel>
              ))}
            </div>
          ) : (
            <Panel><EmptyState title="No finalized payroll history" description="Finalized payroll snapshots will appear here." /></Panel>
          )}
        </div>
      </div>
    </PageShell>
  );
}
