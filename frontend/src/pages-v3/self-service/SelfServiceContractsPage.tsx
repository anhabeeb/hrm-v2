import { useEffect, useState } from "react";
import { FileCheck, FileText, FileX, ShieldCheck } from "lucide-react";
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
function fmtDate(value: unknown) {
  const s = text(value, "");
  if (!s) return "—";
  return new Date(`${s.slice(0, 10)}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (["ACTIVE", "RENEWED"].includes(status)) return "success";
  if (["EXPIRING_SOON", "PENDING_APPROVAL", "DUE_SOON", "PENDING_RENEWAL"].includes(status)) return "warning";
  if (["EXPIRED", "TERMINATED", "CANCELLED", "NOT_RENEWED"].includes(status)) return "danger";
  return "neutral";
}

export function SelfServiceContractsPage() {
  const { token } = useAuth();
  const [active, setActive] = useState<Row | null>(null);
  const [history, setHistory] = useState<Row[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await api.getSelfServiceContracts(token!);
        if (cancelled) return;
        setActive(result.active_contract);
        setHistory(asRows(result.contract_history));
        setMessage(result.message ?? null);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Unable to load your contracts.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [token]);

  if (loading) {
    return <PageShell constrained={false}><div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Panel key={i} className="h-20 animate-pulse" />)}</div></PageShell>;
  }
  if (error) {
    return <PageShell constrained={false}><Panel className="p-4 text-xs text-[#A32D2D]">{error}</Panel></PageShell>;
  }
  if (!active && !history.length) {
    return <PageShell constrained={false}><Panel className="p-4"><EmptyState title="No contracts on file" description={message ?? "Your contract history will appear here once HR adds one."} /></Panel></PageShell>;
  }

  const rest = active ? history.filter((c) => c.id !== active.id) : history;

  return (
    <PageShell constrained={false}>
      <div className="space-y-3.5">
        <p className="text-lg font-medium text-slate-950">My contracts</p>

        {active ? (
          <Panel className="p-4">
            <div className="mb-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#EEEDFE]"><FileText className="h-4 w-4 text-[#534AB7]" /></div>
                <div>
                  <p className="text-sm font-medium text-slate-950">{text(active.contract_type_display_name ?? active.contract_title, "Contract")}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">Started {fmtDate(active.contract_start_date)}{active.contract_end_date ? ` · Ends ${fmtDate(active.contract_end_date)}` : ""}</p>
                </div>
              </div>
              <Badge tone={statusTone(text(active.status))}>{humanizeTechnicalLabel(text(active.status))}</Badge>
            </div>

            <div className="mb-3.5 grid grid-cols-2 gap-3.5 rounded-md bg-[#F7F7FB] p-3 sm:grid-cols-3">
              <div><p className="text-[9px] text-muted-foreground">Contract number</p><p className="mt-0.5 text-xs text-slate-950">{text(active.contract_number)}</p></div>
              <div><p className="text-[9px] text-muted-foreground">Probation</p><p className="mt-0.5 text-xs text-slate-950">{humanizeTechnicalLabel(text(active.probation_status))}</p></div>
              <div><p className="text-[9px] text-muted-foreground">Renewal</p><p className="mt-0.5 text-xs text-slate-950">{humanizeTechnicalLabel(text(active.renewal_status))}</p></div>
            </div>

            <div className="flex items-center justify-between border-t pt-3">
              {text(active.probation_status) === "CONFIRMED" ? (
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-[#27500A]" />
                  <p className="text-[10px] text-slate-950">Probation confirmed</p>
                </div>
              ) : <span />}
              <p className="text-[9px] text-muted-foreground">{active.document_id ? "Document on file — contact HR for a copy" : "No contract document uploaded"}</p>
            </div>
          </Panel>
        ) : null}

        {rest.length ? (
          <Panel className="overflow-hidden">
            <div className="border-b px-4 py-3"><p className="text-xs font-medium text-slate-950">Contract history</p></div>
            <div className="flex flex-col">
              {rest.map((c, i) => (
                <div key={String(c.id ?? i)} className="flex items-center gap-3 border-b border-[#F1F1F7] px-4 py-2.5 last:border-b-0">
                  <div className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-md bg-[#F7F7FB]">
                    {c.document_id ? <FileCheck className="h-3.5 w-3.5 text-[#0C447C]" /> : <FileX className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-slate-950">{text(c.contract_type_display_name ?? c.contract_title, "Contract")}</p>
                    <p className="mt-0.5 text-[9px] text-muted-foreground">{fmtDate(c.contract_start_date)}{c.contract_end_date ? ` – ${fmtDate(c.contract_end_date)}` : ""}</p>
                  </div>
                  <Badge tone={statusTone(text(c.status))}>{humanizeTechnicalLabel(text(c.status))}</Badge>
                  {!c.document_id ? <span className="whitespace-nowrap text-[9px] text-muted-foreground">No document uploaded</span> : null}
                </div>
              ))}
            </div>
          </Panel>
        ) : null}
      </div>
    </PageShell>
  );
}
