import { useEffect, useState } from "react";
import { Shirt } from "lucide-react";
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
  if (["ASSIGNED", "ISSUED"].includes(status)) return "success";
  if (["RETURN_PENDING", "PENDING_APPROVAL", "DEDUCTION_PENDING"].includes(status)) return "warning";
  if (["DAMAGED", "LOST"].includes(status)) return "danger";
  return "neutral";
}

export function SelfServiceUniformsPage() {
  const { token } = useAuth();
  const [uniforms, setUniforms] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api.getSelfServiceUniforms(token).then((result) => { if (!cancelled) setUniforms(asRows(result.assignments)); }).catch((err) => { if (!cancelled) setError(err instanceof ApiError ? err.message : "Unable to load your uniforms."); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <PageShell constrained={false}>
      <div className="space-y-3.5">
        <p className="text-lg font-medium text-slate-950">My uniforms</p>

        {loading ? (
          <div className="flex flex-col gap-2">{Array.from({ length: 2 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
        ) : error ? (
          <Panel className="p-4 text-xs text-[#A32D2D]">{error}</Panel>
        ) : uniforms.length ? (
          <Panel className="overflow-hidden">
            <div className="flex flex-col">
              {uniforms.map((u, i) => (
                <div key={String(u.id ?? i)} className="flex items-center gap-3 border-b border-[#F1F1F7] px-4 py-3 last:border-b-0">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#EEEDFE]"><Shirt className="h-4 w-4 text-[#534AB7]" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-slate-950">
                      {text(u.uniform_type_name, "Uniform item")}{Number(u.quantity_issued ?? 1) > 1 ? ` (x${u.quantity_issued})` : ""}{u.size_label ? ` · Size ${text(u.size_label)}` : ""}
                    </p>
                    <p className="mt-0.5 text-[9px] text-muted-foreground">Issued {fmtDate(u.issued_date)}{u.expected_return_date ? ` · Expected return ${fmtDate(u.expected_return_date)}` : ""}{u.returned_date ? ` · Returned ${fmtDate(u.returned_date)}` : ""}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge tone={statusTone(text(u.assignment_status))}>{humanizeTechnicalLabel(text(u.assignment_status))}</Badge>
                    <Badge tone={statusTone(text(u.clearance_status))}>{humanizeTechnicalLabel(text(u.clearance_status))}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        ) : (
          <Panel className="p-4"><EmptyState title="No uniforms assigned" description="Uniform items assigned to you will appear here." /></Panel>
        )}

        <p className="text-center text-[9px] text-muted-foreground">This page is view-only. Contact your manager or HR to report damage or request replacements.</p>
      </div>
    </PageShell>
  );
}
