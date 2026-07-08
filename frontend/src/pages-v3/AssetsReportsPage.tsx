import { useEffect, useMemo, useState } from "react";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavRail } from "../components/ui/route-nav-rail";
import { EmptyState } from "../components/ui/empty-state";
import { ExportMenu } from "../components/export/ExportMenu";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import { ASSETS_NAV_ITEMS } from "./assetsNav";

interface ReportRow {
  category_name?: string;
  location_name?: string;
  status?: string;
  [key: string]: unknown;
}

interface Breakdown {
  category: string;
  location: string;
  total: number;
  assigned: number;
}

export function AssetsReportsPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.getAssetsReports(token, {}).then((res) => setRows((res.reports ?? []) as ReportRow[])).catch((err) => setError(err instanceof ApiError ? err.message : "Unable to load asset reports.")).finally(() => setLoading(false));
  }, [token]);

  const breakdown = useMemo<Breakdown[]>(() => {
    const map = new Map<string, Breakdown>();
    for (const row of rows) {
      const category = row.category_name ?? "Uncategorized";
      const location = row.location_name ?? "Unassigned";
      const key = `${category}::${location}`;
      const existing = map.get(key);
      const isAssigned = row.status === "ISSUED";
      if (existing) {
        existing.total += 1;
        if (isAssigned) existing.assigned += 1;
      } else {
        map.set(key, { category, location, total: 1, assigned: isAssigned ? 1 : 0 });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.category.localeCompare(b.category) || a.location.localeCompare(b.location));
  }, [rows]);

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={ASSETS_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-lg font-medium text-slate-950">Reports</p>
            <ExportMenu
              variant="plain"
              moduleName="Asset reports"
              rows={rows as unknown as Record<string, unknown>[]}
              columns={["employee_no", "employee_name", "department_name", "location_name", "asset_code", "asset_name", "category_name", "status", "issued_date", "expected_return_date", "returned_date", "deduction_amount"]}
            />
          </div>

          {error ? <Panel className="p-4 text-sm text-[#A32D2D]">{error}</Panel> : null}

          {loading ? (
            <Panel className="h-40 animate-pulse" />
          ) : breakdown.length ? (
            <Panel className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[10px]">
                  <thead>
                    <tr className="bg-[#F7F7FB]">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Category</th>
                      <th className="px-2.5 py-2 text-left font-medium text-muted-foreground">Location</th>
                      <th className="px-2.5 py-2 text-right font-medium text-muted-foreground">Total</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">Assigned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.map((row) => (
                      <tr key={`${row.category}::${row.location}`} className="border-t border-[#E7E7F1]">
                        <td className="px-3 py-2.5 text-slate-950">{row.category}</td>
                        <td className="px-2.5 py-2.5 text-muted-foreground">{row.location}</td>
                        <td className="px-2.5 py-2.5 text-right text-slate-950">{row.total}</td>
                        <td className="px-3 py-2.5 text-right text-slate-950">{row.assigned}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          ) : (
            <Panel><EmptyState title="No asset data to report" description="Issue assets to employees to see reconciliation data here." /></Panel>
          )}
        </div>
      </div>
    </PageShell>
  );
}
