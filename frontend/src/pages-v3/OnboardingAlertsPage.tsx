import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";

type Row = Record<string, unknown>;

function text(value: unknown) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function statusTone(value: unknown) {
  const status = String(value ?? "").toUpperCase();
  if (["RESOLVED", "ACKNOWLEDGED"].includes(status)) return "success" as const;
  if (["OPEN", "PENDING"].includes(status)) return "warning" as const;
  return "neutral" as const;
}

export function OnboardingAlertsPage() {
  const { token } = useAuth();
  const alerts = useAlert();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      setRows((await api.listOnboardingAlerts(token)).alerts);
    } catch (err) {
      alerts.showApiError(err, "Unable to load onboarding alerts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token]);

  async function refresh() {
    if (!token) return;
    setRefreshing(true);
    try {
      await api.refreshOnboardingAlerts(token);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to refresh onboarding alerts.");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <PageShell constrained={false}>
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <div>
            <Link to="/v3-preview/onboarding" className="mb-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-slate-900">&larr; Onboarding</Link>
            <p className="text-lg font-medium text-slate-950">Onboarding alerts</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Overdue tasks, blockers, and readiness warnings across onboarding cases</p>
          </div>
          <Button size="sm" variant="outline" loading={refreshing} onClick={() => void refresh()}><RefreshCw className="h-4 w-4" /> Refresh alerts</Button>
        </div>

        {loading ? (
          <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
        ) : rows.length ? (
          <div className="flex flex-col gap-2">
            {rows.map((row, index) => (
              <Panel key={String(row.id ?? index)} className="flex items-center gap-3.5 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-950">{text(row.employee_name)} <span className="font-normal text-muted-foreground">{text(row.employee_no)}</span></p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{text(row.alert_type)} · {text(row.created_at)}</p>
                </div>
                <Badge tone="warning">{text(row.severity)}</Badge>
                <Badge tone={statusTone(row.status)}>{text(row.status)}</Badge>
              </Panel>
            ))}
          </div>
        ) : (
          <Panel><EmptyState title="No onboarding alerts" description="Overdue tasks and readiness blockers will show up here." /></Panel>
        )}
      </div>
    </PageShell>
  );
}
