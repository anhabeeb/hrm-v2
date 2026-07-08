import { useEffect, useState } from "react";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavRail } from "../components/ui/route-nav-rail";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { APPROVALS_NAV_ITEMS } from "./approvalsNav";

type Row = Record<string, unknown>;

export function ApprovalReportsPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api.getReport(token, "approvals/pending").then((res) => setRows(res.report.rows as Row[])).finally(() => setLoading(false));
  }, [token]);

  const columns = Object.keys(rows[0] ?? { request_title: "", module_key: "", action_key: "", status: "", submitted_at: "" });
  const [titleColumn, ...restColumns] = columns;

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={APPROVALS_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-lg font-medium text-slate-950">Reports</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Pending approvals summary across all workflows</p>
          </div>

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Panel key={i} className="h-14 animate-pulse" />)}</div>
          ) : rows.length ? (
            <div className="flex flex-col gap-2">
              {rows.map((row, i) => (
                <Panel key={String(row.id ?? i)} className="p-3">
                  <p className="text-xs font-medium text-slate-950">{String(row[titleColumn] ?? "-")}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{restColumns.map((c) => `${c.replace(/_/g, " ")}: ${String(row[c] ?? "-")}`).join(" · ")}</p>
                </Panel>
              ))}
            </div>
          ) : (
            <Panel><EmptyState title="No report rows" description="Approval report rows will appear after approvals are submitted." /></Panel>
          )}
        </div>
      </div>
    </PageShell>
  );
}
