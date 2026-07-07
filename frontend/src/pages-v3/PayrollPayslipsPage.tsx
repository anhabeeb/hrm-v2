import { useEffect, useState } from "react";
import { Eye, FileText } from "lucide-react";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavRail } from "../components/ui/route-nav-rail";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";
import { downloadBlob } from "../lib/export-utils";
import { humanizeTechnicalLabel } from "../lib/displayLabels";
import { cn } from "../lib/utils";
import { PAYROLL_NAV_ITEMS } from "./payrollNav";
import type { PayrollPayslip } from "../types/payroll";

function statusTone(status: string) {
  if (status === "GENERATED" || status === "REGENERATED") return { bg: "#EAF3DE", text: "#27500A" };
  if (status === "CANCELLED") return { bg: "#FCEBEB", text: "#A32D2D" };
  return { bg: "#FAEEDA", text: "#854F0B" };
}

export function PayrollPayslipsPage() {
  const { token } = useAuth();
  const alerts = useAlert();
  const [payslips, setPayslips] = useState<PayrollPayslip[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.listPayrollPayslips(token, {}).then((res) => setPayslips(res.payslips ?? [])).finally(() => setLoading(false));
  }, [token]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function downloadSelected() {
    if (!token) return;
    setDownloading(true);
    try {
      for (const id of selected) {
        const payslip = payslips.find((p) => p.id === id);
        const result = await api.downloadPayrollPayslip(token, id);
        downloadBlob(result.blob, result.filename ?? `${payslip?.payslip_number ?? id}.pdf`);
      }
      alerts.showSuccess("Payslips downloaded", `${selected.size} payslip${selected.size === 1 ? "" : "s"} downloaded as PDF.`);
    } catch (err) {
      alerts.showApiError(err, "Unable to download payslips");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={PAYROLL_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-slate-950">Payslips</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Select multiple to download together</p>
            </div>
          </div>

          {selected.size > 0 ? (
            <Panel className="flex items-center justify-between bg-[#EEEDFE] p-3">
              <span className="text-xs font-medium text-[#26215C]">{selected.size} selected</span>
              <button type="button" disabled={downloading} onClick={() => void downloadSelected()} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60">
                <FileText className="h-3.5 w-3.5" /> Download as PDF
              </button>
            </Panel>
          ) : null}

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 2 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : payslips.length ? (
            <div className="flex flex-col gap-2">
              {payslips.map((p) => {
                const isSelected = selected.has(p.id);
                return (
                  <Panel key={p.id} className={cn("flex items-center gap-3.5 p-3", isSelected && "border-primary")} style={isSelected ? { borderWidth: 1.5 } : undefined}>
                    <button type="button" onClick={() => toggle(p.id)} className={cn("grid h-4 w-4 shrink-0 place-items-center rounded", isSelected ? "bg-primary" : "border border-[#D3D3E3]")}>
                      {isSelected ? <span className="text-[9px] text-white">✓</span> : null}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-950">{p.employee_name_snapshot}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{p.payslip_number}</p>
                    </div>
                    <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: statusTone(p.status).bg, color: statusTone(p.status).text }}>{humanizeTechnicalLabel(p.status)}</span>
                    <button type="button" title="Preview" onClick={() => { if (token) void api.previewPayrollPayslip(token, p.id).then((result) => window.open(URL.createObjectURL(result.blob), "_blank")); }} className="text-muted-foreground">
                      <Eye className="h-4 w-4" />
                    </button>
                    <button type="button" title="Download" onClick={() => { if (token) void api.downloadPayrollPayslip(token, p.id).then((result) => downloadBlob(result.blob, result.filename ?? `${p.payslip_number}.pdf`)); }} className="text-muted-foreground">
                      <FileText className="h-4 w-4" />
                    </button>
                  </Panel>
                );
              })}
            </div>
          ) : (
            <Panel><EmptyState title="No payslips generated yet" description="Payslips appear here once a payroll run generates them." /></Panel>
          )}
        </div>
      </div>
    </PageShell>
  );
}
