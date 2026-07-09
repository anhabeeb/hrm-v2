import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Boxes, CheckCircle2, PackageCheck, PackageX, RotateCcw, Wallet } from "lucide-react";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavSwitcher } from "../components/ui/route-nav-switcher";
import { Badge } from "../components/ui/badge";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { ASSETS_NAV_ITEMS } from "./assetsNav";
import type { AssetDashboard } from "../types/assets";

export function AssetsDashboardPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const canView = user?.permissions.includes("assets.view");
  const [dashboard, setDashboard] = useState<AssetDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !canView) return;
    api.getAssetsDashboard(token).then(setDashboard).catch((err) => setError(err instanceof Error ? err.message : "Unable to load assets dashboard."));
  }, [token, canView]);

  if (!canView) {
    return (
      <PageShell constrained={false}>
        <div className="flex flex-col gap-3">
          <RouteNavSwitcher items={ASSETS_NAV_ITEMS} moduleLabel="Assets" />
          <div className="min-w-0 flex-1"><Panel><EmptyState title="Assets unavailable" description="Your account needs assets.view permission." /></Panel></div>
        </div>
      </PageShell>
    );
  }

  const metrics = [
    { label: "Total items", value: dashboard?.total_items ?? 0, icon: Boxes, tone: "info" as const },
    { label: "Available", value: dashboard?.available_items ?? 0, icon: CheckCircle2, tone: "success" as const },
    { label: "Issued", value: dashboard?.issued_items ?? 0, icon: PackageCheck, tone: "info" as const },
    { label: "Damaged", value: dashboard?.damaged_items ?? 0, icon: AlertCircle, tone: "warning" as const },
    { label: "Lost", value: dashboard?.lost_items ?? 0, icon: PackageX, tone: "danger" as const },
    { label: "Pending returns", value: dashboard?.pending_returns ?? 0, icon: RotateCcw, tone: "warning" as const },
    { label: "Pending deductions", value: dashboard?.pending_deductions ?? 0, icon: Wallet, tone: "warning" as const }
  ];

  const toneClasses: Record<string, string> = {
    success: "border-[#5DCAA5]/30 bg-[#EAF3DE] text-[#27500A]",
    warning: "border-[#FAC775]/30 bg-[#FAEEDA] text-[#854F0B]",
    danger: "border-[#F09595]/30 bg-[#FCEBEB] text-[#A32D2D]",
    info: "border-[#7FB3E0]/30 bg-[#E6F1FB] text-[#0C447C]"
  };

  return (
    <PageShell constrained={false}>
      <div className="flex flex-col gap-3">
        <div className="min-w-0 flex-1 space-y-3">
            <div className="px-4">
                <RouteNavSwitcher items={ASSETS_NAV_ITEMS} moduleLabel="Assets" />
                <p className="mt-0.5 text-xs text-muted-foreground">Asset inventory, employee issue/return tracking, deductions, and clearance foundation</p>
            </div>

              <Panel className="shadow-none space-y-3 p-4">
          {error ? <Panel className="p-3 text-xs text-[#A32D2D]">{error}</Panel> : null}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {metrics.map((m) => (
              <Panel key={m.label} className="p-3">
                <div className="flex items-start justify-between">
                  <span className="text-xs text-muted-foreground">{m.label}</span>
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${toneClasses[m.tone]}`}><m.icon className="h-3.5 w-3.5" /></span>
                </div>
                <p className="mt-2 text-xl font-medium text-slate-950">{m.value}</p>
              </Panel>
            ))}
          </div>

          <Panel className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-950">Operational shortcuts</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Manage the core registers from focused card views</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => navigate("/v3-preview/assets/items")} className="rounded-md border border-[#D3D3E3] px-2.5 py-1.5 text-xs text-muted-foreground hover:text-slate-950">Items</button>
                <button type="button" onClick={() => navigate("/v3-preview/assets/assignments")} className="rounded-md border border-[#D3D3E3] px-2.5 py-1.5 text-xs text-muted-foreground hover:text-slate-950">Assignments</button>
                <button type="button" onClick={() => navigate("/v3-preview/assets/reports")} className="rounded-md border border-[#D3D3E3] px-2.5 py-1.5 text-xs text-muted-foreground hover:text-slate-950">Reports</button>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge tone="neutral">Uniforms</Badge>
              <Badge tone="neutral">Devices</Badge>
              <Badge tone="neutral">Access cards</Badge>
              <Badge tone="neutral">Payroll deductions</Badge>
              <Badge tone="neutral">Clearance-ready</Badge>
            </div>
          </Panel>

              </Panel>
        </div>
      </div>
    </PageShell>
  );
}
