import { useEffect, useMemo, useState } from "react";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavRail } from "../components/ui/route-nav-rail";
import { ExportMenu } from "../components/export/ExportMenu";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { PAYROLL_NAV_ITEMS } from "./payrollNav";

interface PayrollReportRow {
  department_name: string | null;
  net_salary: number;
}

export function PayrollReportsPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<PayrollReportRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api.getPayrollReports(token, {}).then((res) => setRows((res.reports ?? []) as unknown as PayrollReportRow[])).finally(() => setLoading(false));
  }, [token]);

  const byDepartment = useMemo(() => {
    const map = new Map<string, { headcount: number; total: number }>();
    for (const row of rows) {
      const key = row.department_name ?? "No department";
      const entry = map.get(key) ?? { headcount: 0, total: 0 };
      entry.headcount += 1;
      entry.total += Number(row.net_salary ?? 0);
      map.set(key, entry);
    }
    return Array.from(map.entries()).map(([department, data]) => ({ department, ...data, avg: data.headcount ? Math.round(data.total / data.headcount) : 0 }));
  }, [rows]);

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={PAYROLL_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-slate-950">Reports</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Payroll cost by department, across all runs on record</p>
            </div>
            <ExportMenu variant="plain" moduleName="Payroll department report" rows={byDepartment.map((d) => ({ department: d.department, headcount: d.headcount, total_cost: d.total, avg_per_employee: d.avg }))} columns={["department", "headcount", "total_cost", "avg_per_employee"]} />
          </div>

          <Panel className="overflow-hidden p-0">
            <div className="themed-scroll overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-[#F7F7FB] text-left text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Department</th>
                    <th className="px-2.5 py-2 text-right font-medium">Headcount</th>
                    <th className="px-2.5 py-2 text-right font-medium">Total cost</th>
                    <th className="px-4 py-2 text-right font-medium">Avg per employee</th>
                  </tr>
                </thead>
                <tbody>
                  {byDepartment.map((d) => (
                    <tr key={d.department} className="border-t">
                      <td className="px-4 py-2.5 text-slate-950">{d.department}</td>
                      <td className="px-2.5 py-2.5 text-right text-slate-950">{d.headcount}</td>
                      <td className="px-2.5 py-2.5 text-right text-slate-950">{d.total.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right text-slate-950">{d.avg.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && !byDepartment.length ? <p className="p-6 text-center text-xs text-muted-foreground">No payroll data to report on yet.</p> : null}
            </div>
          </Panel>
        </div>
      </div>
    </PageShell>
  );
}
