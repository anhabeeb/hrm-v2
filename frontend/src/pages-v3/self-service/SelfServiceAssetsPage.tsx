import { useEffect, useState } from "react";
import { Key, Laptop, Shirt } from "lucide-react";
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
function assetIcon(categoryName: string) {
  const c = categoryName.toLowerCase();
  if (c.includes("key") || c.includes("access") || c.includes("card")) return Key;
  return Laptop;
}

export function SelfServiceAssetsPage() {
  const { token } = useAuth();
  const [assets, setAssets] = useState<Row[]>([]);
  const [uniforms, setUniforms] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [assetsResult, uniformsResult] = await Promise.all([
          api.getSelfServiceAssets(token!),
          api.getSelfServiceUniforms(token!).catch(() => ({ assignments: [] as Row[] }))
        ]);
        if (cancelled) return;
        setAssets(asRows(assetsResult.assignments));
        setUniforms(asRows(uniformsResult.assignments));
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Unable to load your assets.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [token]);

  if (loading) {
    return <PageShell constrained={false}><div className="flex flex-col gap-2">{Array.from({ length: 2 }).map((_, i) => <Panel key={i} className="h-24 animate-pulse" />)}</div></PageShell>;
  }
  if (error) {
    return <PageShell constrained={false}><Panel className="p-4 text-xs text-[#A32D2D]">{error}</Panel></PageShell>;
  }
  if (!assets.length && !uniforms.length) {
    return (
      <PageShell constrained={false}>
        <div className="space-y-3.5">
          <p className="text-lg font-medium text-slate-950">My assets</p>
          <Panel className="p-4"><EmptyState title="No assets assigned" description="Equipment and uniform items assigned to you will appear here." /></Panel>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell constrained={false}>
      <div className="space-y-3.5">
        <p className="text-lg font-medium text-slate-950">My assets</p>

        {assets.length ? (
          <Panel className="overflow-hidden">
            <div className="border-b px-4 py-3"><p className="text-xs font-medium text-slate-950">Equipment</p></div>
            <div className="flex flex-col">
              {assets.map((a, i) => {
                const Icon = assetIcon(text(a.category_name, ""));
                return (
                  <div key={String(a.id ?? i)} className="flex items-center gap-3 border-b border-[#F1F1F7] px-4 py-3 last:border-b-0">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#E6F1FB]"><Icon className="h-4 w-4 text-[#0C447C]" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-slate-950">{text(a.asset_name, "Asset")}</p>
                      <p className="mt-0.5 text-[9px] text-muted-foreground">{a.asset_code ? `Asset tag ${text(a.asset_code)} · ` : ""}Assigned {fmtDate(a.issued_date)}</p>
                    </div>
                    <Badge tone={statusTone(text(a.assignment_status))}>{humanizeTechnicalLabel(text(a.assignment_status))}</Badge>
                  </div>
                );
              })}
            </div>
          </Panel>
        ) : null}

        {uniforms.length ? (
          <Panel className="overflow-hidden">
            <div className="border-b px-4 py-3"><p className="text-xs font-medium text-slate-950">Uniform</p></div>
            <div className="flex flex-col">
              {uniforms.map((u, i) => (
                <div key={String(u.id ?? i)} className="flex items-center gap-3 border-b border-[#F1F1F7] px-4 py-3 last:border-b-0">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#EEEDFE]"><Shirt className="h-4 w-4 text-[#534AB7]" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-slate-950">
                      {text(u.uniform_type_name, "Uniform item")}{Number(u.quantity_issued ?? 1) > 1 ? ` (x${u.quantity_issued})` : ""}{u.size_label ? ` · Size ${text(u.size_label)}` : ""}
                    </p>
                    <p className="mt-0.5 text-[9px] text-muted-foreground">Issued {fmtDate(u.issued_date)}</p>
                  </div>
                  <Badge tone={statusTone(text(u.assignment_status))}>{humanizeTechnicalLabel(text(u.assignment_status))}</Badge>
                </div>
              ))}
            </div>
          </Panel>
        ) : null}

        <p className="text-center text-[9px] text-muted-foreground">This page is view-only. Contact your manager or HR for new equipment requests or to report damage.</p>
      </div>
    </PageShell>
  );
}
