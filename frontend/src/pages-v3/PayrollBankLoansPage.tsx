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
import type { EmployeeBankLoan } from "../types/payroll";

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`.toUpperCase();
}

function statusTone(status: string) {
  if (status === "ACTIVE") return { bg: "#EAF3DE", text: "#27500A" };
  if (status === "CANCELLED") return { bg: "#FCEBEB", text: "#A32D2D" };
  return { bg: "#F7F7FB", text: "#6B6F86" };
}

export function PayrollBankLoansPage() {
  const { token } = useAuth();
  const [loans, setLoans] = useState<EmployeeBankLoan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api.listPayrollBankLoans(token).then((res) => setLoans(res.loans ?? [])).finally(() => setLoading(false));
  }, [token]);

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={PAYROLL_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-lg font-medium text-slate-950">Bank loans</p>
            <ExportMenu variant="plain" moduleName="Bank loans" rows={loans.map((l) => ({ employee: l.employee_name, bank: l.bank_name_snapshot, reference: l.loan_reference_number, outstanding: l.outstanding_balance, status: l.status }))} columns={["employee", "bank", "reference", "outstanding", "status"]} />
          </div>

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 2 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : loans.length ? (
            <div className="flex flex-col gap-2">
              {loans.map((loan) => (
                <Panel key={loan.id} className="flex items-center gap-3.5 p-3">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#FBEAF0] text-xs font-medium text-[#72243E]">{initialsOf(loan.employee_name ?? "?")}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-950">{loan.employee_name}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{loan.bank_name_snapshot} · Ref {loan.loan_reference_number} · Installment MVR {loan.monthly_installment_amount.toLocaleString()}/mo</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs font-medium text-slate-950">MVR {(loan.outstanding_balance ?? 0).toLocaleString()}</p>
                    <p className="text-[9px] text-muted-foreground">outstanding</p>
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: statusTone(loan.status).bg, color: statusTone(loan.status).text }}>{humanizeTechnicalLabel(loan.status)}</span>
                </Panel>
              ))}
            </div>
          ) : (
            <Panel><EmptyState title="No bank loans on record" description="Employee salary-deducted bank loans will appear here." /></Panel>
          )}
        </div>
      </div>
    </PageShell>
  );
}
