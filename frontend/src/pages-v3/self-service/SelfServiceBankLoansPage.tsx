import { useEffect, useState } from "react";
import { Landmark } from "lucide-react";
import { PageShell } from "../../components/ui/page-shell";
import { Panel } from "../../components/ui/panel";
import { Badge } from "../../components/ui/badge";
import { EmptyState } from "../../components/ui/empty-state";
import { useAuth } from "../../hooks/useAuth";
import { ApiError, api } from "../../lib/api";
import { humanizeTechnicalLabel } from "../../lib/displayLabels";

type Row = Record<string, unknown>;
function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}
function text(value: unknown, fallback = "—") {
  const s = value === null || value === undefined ? "" : String(value);
  return s && s !== "null" && s !== "undefined" ? s : fallback;
}
function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (["ACTIVE", "ELIGIBLE", "PAID"].includes(status)) return "success";
  if (["PENDING_APPROVAL", "PENDING", "SKIPPED"].includes(status)) return "warning";
  if (["REJECTED", "INELIGIBLE", "FAILED"].includes(status)) return "danger";
  return "neutral";
}

export function SelfServiceBankLoansPage() {
  const { token } = useAuth();
  const [loans, setLoans] = useState<Row[]>([]);
  const [payments, setPayments] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api.getSelfServiceBankLoans(token).then((result) => { if (!cancelled) { setLoans(asRows(result.loans)); setPayments(asRows(result.payments)); } }).catch((err) => { if (!cancelled) setError(err instanceof ApiError ? err.message : "Unable to load your bank loans."); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <PageShell constrained={false}>
      <div className="space-y-3.5">
        <p className="text-lg font-medium text-slate-950">Bank loans</p>

        <Panel className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
          <Landmark className="h-4 w-4 shrink-0" /> Bank loan details are shown only when payroll settings allow employee self-service visibility.
        </Panel>

        {loading ? (
          <div className="flex flex-col gap-2">{Array.from({ length: 2 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
        ) : error ? (
          <Panel className="p-4 text-xs text-[#A32D2D]">{error}</Panel>
        ) : (
          <>
            {loans.length ? (
              <Panel className="overflow-hidden">
                <div className="border-b px-4 py-3"><p className="text-xs font-medium text-slate-950">My loans</p></div>
                <div className="flex flex-col">
                  {loans.map((l, i) => (
                    <div key={String(l.id ?? i)} className="flex items-center gap-3.5 border-b border-[#F1F1F7] px-4 py-3 last:border-b-0">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-slate-950">{text(l.payment_institution_name)} <span className="font-mono font-normal text-muted-foreground">{text(l.loan_reference_number)}</span></p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">Monthly MVR {text(l.monthly_installment_amount)} · Outstanding MVR {text(l.outstanding_balance)}</p>
                      </div>
                      <Badge tone={statusTone(text(l.eligibility_status))}>{humanizeTechnicalLabel(text(l.eligibility_status))}</Badge>
                      <Badge tone={statusTone(text(l.status))}>{humanizeTechnicalLabel(text(l.status))}</Badge>
                    </div>
                  ))}
                </div>
              </Panel>
            ) : (
              <Panel className="p-4"><EmptyState title="No bank loans on file" description="Loans set up by HR/Payroll will appear here." /></Panel>
            )}

            {payments.length ? (
              <Panel className="overflow-hidden">
                <div className="border-b px-4 py-3"><p className="text-xs font-medium text-slate-950">Payment history</p></div>
                <div className="flex flex-col">
                  {payments.map((p, i) => (
                    <div key={String(p.id ?? i)} className="flex items-center gap-3.5 border-b border-[#F1F1F7] px-4 py-3 last:border-b-0">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-slate-950">{text(p.bank_name_snapshot)} <span className="font-mono font-normal text-muted-foreground">{text(p.loan_reference_number_snapshot)}</span></p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">Scheduled MVR {text(p.scheduled_installment_amount)} · Deducted MVR {text(p.deducted_amount)}{p.shortfall_amount ? ` · Shortfall MVR ${text(p.shortfall_amount)}` : ""}</p>
                      </div>
                      <Badge tone={statusTone(text(p.payment_status))}>{humanizeTechnicalLabel(text(p.payment_status))}</Badge>
                    </div>
                  ))}
                </div>
              </Panel>
            ) : null}
          </>
        )}
      </div>
    </PageShell>
  );
}
