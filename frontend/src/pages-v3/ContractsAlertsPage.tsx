import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavSwitcher } from "../components/ui/route-nav-switcher";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";
import { humanizeTechnicalLabel } from "../lib/displayLabels";
import { CONTRACTS_NAV_ITEMS } from "./contractsNav";

type Row = Record<string, unknown>;

function text(value: unknown, fallback = "Not set") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function severityTone(severity: string) {
  if (severity === "HIGH" || severity === "CRITICAL") return { bg: "#FCEBEB", text: "#A32D2D" };
  if (severity === "MEDIUM") return { bg: "#FAEEDA", text: "#854F0B" };
  return { bg: "#F7F7FB", text: "#6B6F86" };
}

export function ContractsAlertsPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const permissions = new Set(user?.permissions ?? []);
  const canManage = permissions.has("contracts.manage") || permissions.has("employees.contracts.manage");

  async function load() {
    if (!token) return;
    const res = await api.listContractAlerts(token, {}).catch(() => ({ alerts: [] }));
    setRows(res.alerts);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [token]);

  async function refresh() {
    if (!token) return;
    setRefreshing(true);
    try {
      const result = await api.refreshContractAlerts(token);
      alerts.showSuccess("Contract alerts refreshed", `${result.created} alert checks completed.`);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to refresh contract alerts.");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <PageShell constrained={false}>
      <div className="flex flex-col gap-3">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="px-4 flex items-center justify-between">
              <div>
                <RouteNavSwitcher items={CONTRACTS_NAV_ITEMS} moduleLabel="Contracts" />
                <p className="mt-0.5 text-xs text-muted-foreground">Expiry and compliance alerts for employee contracts</p>
              </div>
              {canManage ? <Button size="sm" variant="outline" loading={refreshing} onClick={() => void refresh()}><ShieldCheck className="h-4 w-4" /> Refresh alerts</Button> : null}
</div>

              <Panel className="shadow-none space-y-3 p-4">
          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : rows.length ? (
            <div className="flex flex-col gap-2">
              {rows.map((row, i) => (
                <Panel key={String(row.id ?? i)} className="flex items-center gap-3.5 p-3">
                  <div className="min-w-0 flex-1">
                    <Link to={`/v3-preview/employees/${row.employee_id}`} className="text-xs font-medium text-slate-950 hover:underline">{text(row.full_name)}</Link>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{humanizeTechnicalLabel(String(row.alert_type))} · {text(row.contract_number)} · Due {text(row.due_date)}{row.notes ? ` · ${text(row.notes)}` : ""}</p>
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: severityTone(String(row.severity)).bg, color: severityTone(String(row.severity)).text }}>{humanizeTechnicalLabel(String(row.severity))}</span>
                  <span className="shrink-0 rounded-full bg-[#F7F7FB] px-2.5 py-1 text-[10px] text-muted-foreground">{humanizeTechnicalLabel(String(row.status))}</span>
                </Panel>
              ))}
            </div>
          ) : (
            <Panel><EmptyState title="No contract alerts" description="Expiry and compliance alerts will appear here once triggered." /></Panel>
          )}

              </Panel>
        </div>
      </div>
    </PageShell>
  );
}
