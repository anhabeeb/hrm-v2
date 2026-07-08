import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavRail } from "../components/ui/route-nav-rail";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { humanizeTechnicalLabel } from "../lib/displayLabels";
import { CONTRACTS_NAV_ITEMS } from "./contractsNav";

type Row = Record<string, unknown>;

function text(value: unknown, fallback = "Not set") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function statusTone(status: string) {
  if (status === "CONFIRMED") return { bg: "#EAF3DE", text: "#27500A" };
  if (status === "OVERDUE") return { bg: "#FCEBEB", text: "#A32D2D" };
  return { bg: "#FAEEDA", text: "#854F0B" };
}

export function ContractsProbationPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api.listProbationDue(token).then((res) => setRows(res.contracts)).finally(() => setLoading(false));
  }, [token]);

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={CONTRACTS_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-lg font-medium text-slate-950">Probation due</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Employees whose probation period is ending or overdue for confirmation</p>
          </div>

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : rows.length ? (
            <div className="flex flex-col gap-2">
              {rows.map((row) => (
                <Panel key={String(row.id)} className="flex items-center gap-3.5 p-3">
                  <div className="min-w-0 flex-1">
                    <Link to={`/v3-preview/employees/${row.employee_id}`} className="text-xs font-medium text-slate-950 hover:underline">{text(row.employee_name_snapshot)}</Link>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{text(row.contract_number)} · Probation ends {text(row.probation_end_date)} · Confirmation due {text(row.confirmation_due_date)}</p>
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: statusTone(String(row.probation_status)).bg, color: statusTone(String(row.probation_status)).text }}>{humanizeTechnicalLabel(String(row.probation_status))}</span>
                </Panel>
              ))}
            </div>
          ) : (
            <Panel><EmptyState title="No probation due" description="Employees approaching their probation confirmation date will appear here." /></Panel>
          )}
        </div>
      </div>
    </PageShell>
  );
}
