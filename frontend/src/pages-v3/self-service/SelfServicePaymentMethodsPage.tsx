import { useEffect, useState } from "react";
import { CreditCard } from "lucide-react";
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
  if (["ACTIVE", "VERIFIED"].includes(status)) return "success";
  if (["PENDING", "PENDING_VERIFICATION"].includes(status)) return "warning";
  if (["REJECTED", "INACTIVE"].includes(status)) return "danger";
  return "neutral";
}

export function SelfServicePaymentMethodsPage() {
  const { token } = useAuth();
  const [methods, setMethods] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api.getSelfServicePaymentMethods(token).then((result) => { if (!cancelled) setMethods(asRows(result.payment_methods)); }).catch((err) => { if (!cancelled) setError(err instanceof ApiError ? err.message : "Unable to load your payment methods."); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <PageShell constrained={false}>
      <div className="space-y-3.5">
        <p className="text-lg font-medium text-slate-950">Payment methods</p>

        <Panel className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
          <CreditCard className="h-4 w-4 shrink-0" /> Payment methods are read-only in self-service. Contact HR/Payroll for changes.
        </Panel>

        {loading ? (
          <div className="flex flex-col gap-2">{Array.from({ length: 2 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
        ) : error ? (
          <Panel className="p-4 text-xs text-[#A32D2D]">{error}</Panel>
        ) : methods.length ? (
          <Panel className="overflow-hidden">
            <div className="flex flex-col">
              {methods.map((m, i) => (
                <div key={String(m.id ?? i)} className="flex items-center gap-3.5 border-b border-[#F1F1F7] px-4 py-3 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-950">{humanizeTechnicalLabel(text(m.payment_method_type))} · {text(m.payment_institution_name)}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{text(m.bank_account_number_masked)} · {humanizeTechnicalLabel(text(m.allocation_type))} {m.allocation_percentage ? `${m.allocation_percentage}%` : m.allocation_amount ? `MVR ${m.allocation_amount}` : ""}</p>
                  </div>
                  <Badge tone={statusTone(text(m.verification_status))}>{humanizeTechnicalLabel(text(m.verification_status))}</Badge>
                  <Badge tone={statusTone(text(m.status))}>{humanizeTechnicalLabel(text(m.status))}</Badge>
                </div>
              ))}
            </div>
          </Panel>
        ) : (
          <Panel className="p-4"><EmptyState title="No payment methods on file" description="Your payment methods will appear here once HR/Payroll adds them." /></Panel>
        )}
      </div>
    </PageShell>
  );
}
