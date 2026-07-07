import { useEffect, useState } from "react";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavRail } from "../components/ui/route-nav-rail";
import { ExportMenu } from "../components/export/ExportMenu";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { humanizeTechnicalLabel } from "../lib/displayLabels";
import { PAYROLL_NAV_ITEMS } from "./payrollNav";
import type { PayrollPaymentRegister } from "../types/payroll";

function statusTone(status: string) {
  if (status === "MANUALLY_CONFIRMED_PAID") return { bg: "#EAF3DE", text: "#27500A" };
  if (status === "FAILED_PLACEHOLDER" || status === "CANCELLED") return { bg: "#FCEBEB", text: "#A32D2D" };
  return { bg: "#FAEEDA", text: "#854F0B" };
}

export function PayrollPaymentRegisterPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<PayrollPaymentRegister[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api.listPayrollPaymentRegisters(token).then((res) => setRows(res.payments ?? [])).finally(() => setLoading(false));
  }, [token]);

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={PAYROLL_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-slate-950">Payment register</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Bank transfer instructions for the latest run</p>
            </div>
            <ExportMenu variant="plain" moduleName="Payment register" rows={rows.map((r) => ({ employee: r.employee_name_snapshot, bank: r.bank_name_snapshot, amount: r.net_salary_amount, status: r.payment_status }))} columns={["employee", "bank", "amount", "status"]} />
          </div>

          <Panel className="overflow-hidden p-0">
            <div className="themed-scroll overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="bg-[#F7F7FB] text-left text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Employee</th>
                    <th className="px-2.5 py-2 font-medium">Bank</th>
                    <th className="px-2.5 py-2 font-medium">Account</th>
                    <th className="px-2.5 py-2 text-right font-medium">Amount</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-4 py-2.5 text-slate-950">{r.employee_name_snapshot}</td>
                      <td className="px-2.5 py-2.5 text-muted-foreground">{r.bank_name_snapshot ?? "—"}</td>
                      <td className="px-2.5 py-2.5 font-mono text-muted-foreground">{r.bank_account_number_masked ?? "—"}</td>
                      <td className="px-2.5 py-2.5 text-right font-medium text-slate-950">{r.net_salary_amount.toLocaleString()}</td>
                      <td className="px-4 py-2.5"><span className="rounded-full px-2 py-0.5 text-[9px] font-medium" style={{ background: statusTone(r.payment_status).bg, color: statusTone(r.payment_status).text }}>{humanizeTechnicalLabel(r.payment_status)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && !rows.length ? <p className="p-6 text-center text-xs text-muted-foreground">No payment register rows yet.</p> : null}
            </div>
          </Panel>
        </div>
      </div>
    </PageShell>
  );
}
