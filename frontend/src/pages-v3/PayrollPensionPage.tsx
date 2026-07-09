import { useEffect, useState } from "react";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavSwitcher } from "../components/ui/route-nav-switcher";
import { ExportMenu } from "../components/export/ExportMenu";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { humanizeTechnicalLabel } from "../lib/displayLabels";
import { PAYROLL_NAV_ITEMS } from "./payrollNav";
import type { PayrollPensionContribution } from "../types/payroll";

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`.toUpperCase();
}

export function PayrollPensionPage() {
  const { token } = useAuth();
  const [contributions, setContributions] = useState<PayrollPensionContribution[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api.listPensionContributions(token).then((res) => setContributions(res.contributions ?? [])).finally(() => setLoading(false));
  }, [token]);

  return (
    <PageShell constrained={false}>
      <div className="flex flex-col gap-3">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="px-4 flex items-center justify-between">
            <RouteNavSwitcher items={PAYROLL_NAV_ITEMS} moduleLabel="Payroll" />
            <ExportMenu variant="plain" moduleName="Pension contributions" rows={contributions.map((c) => ({ employee: c.employee_name, scheme: c.scheme_name, amount: c.total_contribution_amount, status: c.contribution_status }))} columns={["employee", "scheme", "amount", "status"]} />
          </div>

              <Panel className="shadow-none space-y-3 p-4">
          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 2 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : contributions.length ? (
            <div className="flex flex-col gap-2">
              {contributions.map((c) => (
                <Panel key={c.id} className="flex items-center gap-3.5 p-3">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#E6F1FB] text-xs font-medium text-[#0C447C]">{initialsOf(c.employee_name ?? "?")}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-950">{c.employee_name}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{c.scheme_name ?? "Pension scheme"}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-medium text-slate-950">MVR {c.total_contribution_amount.toLocaleString()}</p>
                    <p className="text-[9px] text-muted-foreground">this period</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#EAF3DE] px-2.5 py-1 text-[10px] font-medium text-[#27500A]">{humanizeTechnicalLabel(c.contribution_status)}</span>
                </Panel>
              ))}
            </div>
          ) : (
            <Panel><EmptyState title="No pension contributions yet" description="Employee pension enrollment and contributions will appear here." /></Panel>
          )}

              </Panel>
        </div>
      </div>
    </PageShell>
  );
}
