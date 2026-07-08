import { useEffect, useState } from "react";
import { Download, Eye } from "lucide-react";
import { PageShell } from "../../components/ui/page-shell";
import { Panel } from "../../components/ui/panel";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/empty-state";
import { useAuth } from "../../hooks/useAuth";
import { useAlert } from "../../components/alerts/useAlert";
import { ApiError, api } from "../../lib/api";
import { downloadBlob } from "../../lib/export-utils";
import { humanizeTechnicalLabel } from "../../lib/displayLabels";

type Row = Record<string, unknown>;
function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}
function text(value: unknown, fallback = "—") {
  const s = value === null || value === undefined ? "" : String(value);
  return s && s !== "null" && s !== "undefined" ? s : fallback;
}
function money(value: unknown, currency = "MVR") {
  const n = Number(value ?? 0);
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
function periodLabel(month: unknown, year: unknown) {
  const m = Number(month);
  if (!m || !year) return "—";
  return new Date(Date.UTC(Number(year), m - 1, 1)).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}
function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (["PAID", "APPROVED", "ACTIVE", "GENERATED", "REGENERATED"].includes(status)) return "success";
  if (["REQUESTED", "DEDUCTED", "APPLIED"].includes(status)) return "warning";
  if (["CANCELLED", "INACTIVE"].includes(status)) return "neutral";
  return "neutral";
}

export function SelfServicePayrollPage() {
  const { token } = useAuth();
  const alerts = useAlert();
  const [payroll, setPayroll] = useState<Row | null>(null);
  const [payslips, setPayslips] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [payrollResult, payslipsResult] = await Promise.all([
          api.getSelfServicePayroll(token!),
          api.getSelfServicePayslips(token!).catch(() => ({ payslips: [] as Row[] }))
        ]);
        if (cancelled) return;
        setPayroll(payrollResult as unknown as Row);
        setPayslips(asRows(payslipsResult.payslips));
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Unable to load your payroll.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [token]);

  async function preview(id: string) {
    if (!token) return;
    setBusyId(`preview-${id}`);
    try {
      const result = await api.previewSelfServicePayslip(token, id);
      window.open(URL.createObjectURL(result.blob), "_blank");
    } catch (err) {
      alerts.showError("Unable to preview payslip", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function download(id: string, payslipNumber: string) {
    if (!token) return;
    setBusyId(`download-${id}`);
    try {
      const result = await api.downloadSelfServicePayslip(token, id);
      downloadBlob(result.blob, result.filename ?? `${payslipNumber}.html`);
    } catch (err) {
      alerts.showError("Unable to download payslip", err instanceof ApiError ? err.message : "Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <PageShell constrained={false}><div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Panel key={i} className="h-20 animate-pulse" />)}</div></PageShell>;
  }
  if (error || !payroll) {
    return <PageShell constrained={false}><Panel className="p-4"><EmptyState title="Unable to load payroll" description={error ?? undefined} /></Panel></PageShell>;
  }

  const currency = text((payroll.profile as Row | null)?.currency, "MVR");
  const runs = asRows(payroll.runs);
  const latestRun = runs[0];
  const latestPayslip = latestRun ? payslips.find((p) => Number(p.period_month) === Number((latestRun as Row).period?.toString().split("/")[0]) ) : undefined;
  const downloadEnabled = Boolean(payroll.payslip_download_enabled);
  const advances = asRows(payroll.advances);
  const deductions = asRows(payroll.deductions);

  return (
    <PageShell constrained={false}>
      <div className="space-y-3.5">
        <p className="text-lg font-medium text-slate-950">My payroll</p>

        {latestRun ? (
          <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="text-[9px] text-muted-foreground">Latest payslip · {text((latestRun as Row).period)}</p>
              <p className="mt-1.5 text-xl font-medium text-slate-950">{money((latestRun as Row).net_salary, currency)} <span className="text-xs font-normal text-muted-foreground">net</span></p>
              <div className="mt-2 flex gap-4">
                <span className="text-[9px] text-muted-foreground">Gross: {money((latestRun as Row).total_earnings, currency)}</span>
                <span className="text-[9px] text-muted-foreground">Deductions: {money((latestRun as Row).total_deductions, currency)}</span>
              </div>
            </div>
            {latestPayslip ? (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" loading={busyId === `preview-${latestPayslip.id}`} onClick={() => void preview(String(latestPayslip.id))}><Eye className="h-3.5 w-3.5" /> View</Button>
                {downloadEnabled ? <Button size="sm" loading={busyId === `download-${latestPayslip.id}`} onClick={() => void download(String(latestPayslip.id), text(latestPayslip.payslip_number, "payslip"))}><Download className="h-3.5 w-3.5" /> Download</Button> : null}
              </div>
            ) : null}
          </Panel>
        ) : (
          <Panel className="p-4"><EmptyState title="No payslips yet" description="Your payslips will appear here once payroll is processed." /></Panel>
        )}

        {payslips.length ? (
          <Panel className="overflow-hidden">
            <div className="border-b px-4 py-3"><p className="text-xs font-medium text-slate-950">Payslip history</p></div>
            <div className="flex flex-col">
              {payslips.map((p, i) => (
                <div key={String(p.id ?? i)} className="flex items-center gap-3 border-b border-[#F1F1F7] px-4 py-2.5 last:border-b-0">
                  <p className="flex-1 text-xs font-medium text-slate-950">{periodLabel(p.period_month, p.period_year)}</p>
                  <span className="w-28 text-[9px] text-muted-foreground">Net {money(p.net_salary, currency)}</span>
                  <Badge tone={statusTone(text(p.status))}>{humanizeTechnicalLabel(text(p.status))}</Badge>
                  <div className="flex gap-2 text-muted-foreground">
                    <button type="button" title="Preview" disabled={busyId === `preview-${p.id}`} onClick={() => void preview(String(p.id))}><Eye className="h-3.5 w-3.5" /></button>
                    {downloadEnabled ? <button type="button" title="Download" disabled={busyId === `download-${p.id}`} onClick={() => void download(String(p.id), text(p.payslip_number, "payslip"))}><Download className="h-3.5 w-3.5" /></button> : null}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        ) : null}

        {advances.length || deductions.length ? (
          <Panel className="overflow-hidden">
            <div className="border-b px-4 py-3">
              <p className="text-xs font-medium text-slate-950">Deductions & advances</p>
              <p className="mt-0.5 text-[9px] text-muted-foreground">Set up by Payroll/HR — view only from here</p>
            </div>
            <div className="flex flex-col gap-2.5 p-4">
              {advances.map((a, i) => (
                <div key={`adv-${i}`} className="flex items-center justify-between border-b border-[#F1F1F7] pb-2.5 last:border-b-0 last:pb-0">
                  <div>
                    <p className="text-xs font-medium text-slate-950">Salary advance</p>
                    <p className="mt-0.5 text-[9px] text-muted-foreground">{money(a.amount, currency)} · {text(a.payment_date)}{a.notes ? ` · ${text(a.notes)}` : ""}</p>
                  </div>
                  <Badge tone={statusTone(text(a.status))}>{humanizeTechnicalLabel(text(a.status))}</Badge>
                </div>
              ))}
              {deductions.map((d, i) => (
                <div key={`ded-${i}`} className="flex items-center justify-between border-b border-[#F1F1F7] pb-2.5 last:border-b-0 last:pb-0">
                  <div>
                    <p className="text-xs font-medium text-slate-950">{humanizeTechnicalLabel(text(d.deduction_type))} deduction</p>
                    <p className="mt-0.5 text-[9px] text-muted-foreground">{money(d.amount, currency)}{d.start_date ? ` · From ${text(d.start_date)}` : ""}{d.end_date ? ` to ${text(d.end_date)}` : ""} · {text(d.reason)}</p>
                  </div>
                  <Badge tone={statusTone(text(d.status))}>{humanizeTechnicalLabel(text(d.status))}</Badge>
                </div>
              ))}
            </div>
          </Panel>
        ) : null}
      </div>
    </PageShell>
  );
}
