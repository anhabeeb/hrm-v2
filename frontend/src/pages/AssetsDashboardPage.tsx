import { Link } from "react-router-dom";
import { AssetsNav } from "../components/assets/AssetsNav";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Panel } from "../components/ui/panel";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import { useEffect, useState } from "react";
import type { AssetDashboard } from "../types/assets";

export function AssetsDashboardPage() {
  const { token, user } = useAuth();
  const canView = user?.permissions.includes("assets.view");
  const [dashboard, setDashboard] = useState<AssetDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !canView) return;
    api.getAssetsDashboard(token).then(setDashboard).catch((err) => setError(err instanceof ApiError ? err.message : "Unable to load assets dashboard."));
  }, [token, canView]);

  if (!canView) return <Panel><EmptyState title="Assets unavailable" description="Your account needs assets.view permission." /></Panel>;

  const metrics = [
    ["Total items", dashboard?.total_items ?? 0],
    ["Available", dashboard?.available_items ?? 0],
    ["Issued", dashboard?.issued_items ?? 0],
    ["Damaged", dashboard?.damaged_items ?? 0],
    ["Lost", dashboard?.lost_items ?? 0],
    ["Pending returns", dashboard?.pending_returns ?? 0],
    ["Pending deductions", dashboard?.pending_deductions ?? 0]
  ];

  return (
    <div className="space-y-4">
      <div><h1 className="text-lg font-semibold">Assets & Uniforms</h1><p className="text-sm text-muted-foreground">Asset inventory, employee issue/return tracking, deductions, and clearance foundation.</p></div>
      <Panel className="p-0"><AssetsNav /><div className="grid gap-3 p-4 md:grid-cols-4">{metrics.map(([label, value]) => <div key={label} className="rounded-md border px-3 py-2"><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-semibold">{value}</p></div>)}</div></Panel>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-sm font-semibold">Operational shortcuts</h2><p className="text-xs text-muted-foreground">Manage the core registers from focused table views.</p></div>
          <div className="flex flex-wrap gap-2">
            <Link to="/assets/items"><Button size="sm" variant="outline">Items</Button></Link>
            <Link to="/assets/assignments"><Button size="sm" variant="outline">Assignments</Button></Link>
            <Link to="/assets/reports"><Button size="sm" variant="outline">Reports</Button></Link>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2"><Badge tone="neutral">Uniforms</Badge><Badge tone="neutral">Devices</Badge><Badge tone="neutral">Access cards</Badge><Badge tone="neutral">Payroll deductions</Badge><Badge tone="neutral">Clearance-ready</Badge></div>
      </Panel>
    </div>
  );
}
