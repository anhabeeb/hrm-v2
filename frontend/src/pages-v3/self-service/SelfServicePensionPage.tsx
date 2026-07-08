import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
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
  if (["ACTIVE", "PAID"].includes(status)) return "success";
  if (["PENDING"].includes(status)) return "warning";
  if (["FAILED", "INACTIVE"].includes(status)) return "danger";
  return "neutral";
}

export function SelfServicePensionPage() {
  const { token } = useAuth();
  const [profile, setProfile] = useState<Row | null>(null);
  const [contributions, setContributions] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api.getSelfServicePension(token).then((result) => { if (!cancelled) { setProfile((result.profile ?? null) as Row | null); setContributions(asRows(result.contributions)); } }).catch((err) => { if (!cancelled) setError(err instanceof ApiError ? err.message : "Unable to load your pension information."); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <PageShell constrained={false}>
      <div className="space-y-3.5">
        <p className="text-lg font-medium text-slate-950">Pension</p>

        <Panel className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 shrink-0" /> Pension information is read-only and reflects payroll records prepared by the company.
        </Panel>

        {loading ? (
          <div className="flex flex-col gap-2">{Array.from({ length: 2 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
        ) : error ? (
          <Panel className="p-4 text-xs text-[#A32D2D]">{error}</Panel>
        ) : (
          <>
            {profile ? (
              <Panel className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-950">{text(profile.scheme_name)} <span className="font-mono text-xs font-normal text-muted-foreground">{text(profile.scheme_code)}</span></p>
                  <Badge tone={statusTone(text(profile.status))}>{humanizeTechnicalLabel(text(profile.status))}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-3.5 rounded-md bg-[#F7F7FB] p-3 sm:grid-cols-3">
                  <div><p className="text-[9px] text-muted-foreground">Member ID</p><p className="mt-0.5 text-xs text-slate-950">{text(profile.pension_member_id)}</p></div>
                  <div><p className="text-[9px] text-muted-foreground">Enrollment</p><p className="mt-0.5 text-xs text-slate-950">{humanizeTechnicalLabel(text(profile.enrollment_status))}</p></div>
                  <div><p className="text-[9px] text-muted-foreground">Effective date</p><p className="mt-0.5 text-xs text-slate-950">{text(profile.effective_date)}</p></div>
                </div>
              </Panel>
            ) : (
              <Panel className="p-4"><EmptyState title="No pension profile on file" description="Your pension enrollment will appear here once set up by HR/Payroll." /></Panel>
            )}

            {contributions.length ? (
              <Panel className="overflow-hidden">
                <div className="border-b px-4 py-3"><p className="text-xs font-medium text-slate-950">Contribution history</p></div>
                <div className="flex flex-col">
                  {contributions.map((c, i) => (
                    <div key={String(c.id ?? i)} className="flex items-center gap-3.5 border-b border-[#F1F1F7] px-4 py-3 last:border-b-0">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-slate-950">{text(c.payroll_period_id)}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">Wage MVR {text(c.pensionable_wage)} · Employee MVR {text(c.employee_contribution_amount)} · Employer MVR {text(c.employer_contribution_amount)} · Total MVR {text(c.total_contribution_amount)}</p>
                      </div>
                      <Badge tone={statusTone(text(c.contribution_status))}>{humanizeTechnicalLabel(text(c.contribution_status))}</Badge>
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
