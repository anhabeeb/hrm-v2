import { useEffect, useState } from "react";
import { FileWarning, Laptop, Plus, Receipt, UserCog, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import { PageShell } from "../../components/ui/page-shell";
import { Panel } from "../../components/ui/panel";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { ProgressRing } from "../../components/ui/progress-ring";
import { EmptyState } from "../../components/ui/empty-state";
import { useAuth } from "../../hooks/useAuth";
import { ApiError, api } from "../../lib/api";

function text(value: unknown, fallback = "") {
  const s = value === null || value === undefined ? "" : String(value);
  return s && s !== "null" && s !== "undefined" ? s : fallback;
}
type Row = Record<string, unknown>;
function asRow(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {};
}
function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}

const RING_COLORS = ["#378ADD", "#F0997B", "#5DCAA5", "#AFA9EC"];

export function SelfServiceHomePage() {
  const { token } = useAuth();
  const [dashboard, setDashboard] = useState<Row | null>(null);
  const [leaveBalances, setLeaveBalances] = useState<Row[]>([]);
  const [roster, setRoster] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [dashResult, leaveResult, rosterResult] = await Promise.all([
          api.getSelfServiceDashboard(token!),
          api.getSelfServiceLeaveBalances(token!).catch(() => ({ balance_cycles: [] as Row[] })),
          api.getSelfServiceRosterWeek(token!).catch(() => ({ days: [] as Row[] }) as unknown as Row)
        ]);
        if (cancelled) return;
        setDashboard(dashResult as unknown as Row);
        setLeaveBalances(asRows((leaveResult as { balance_cycles: Row[] }).balance_cycles));
        const rosterDays = asRows((rosterResult as Row).days ?? (rosterResult as Row).assignments ?? rosterResult);
        setRoster(rosterDays);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Unable to load your dashboard.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [token]);

  if (loading) {
    return <PageShell constrained={false}><div className="flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <Panel key={i} className="h-20 animate-pulse" />)}</div></PageShell>;
  }
  if (error) {
    return <PageShell constrained={false}><Panel className="p-4"><EmptyState title="Unable to load dashboard" description={error} /></Panel></PageShell>;
  }
  if (!dashboard) return null;

  const employee = asRow(dashboard.employee);
  const summary = asRow(dashboard.summary);
  const visibility = asRow(dashboard.module_visibility) as Record<string, boolean>;
  const visible = (key: string) => visibility[key] !== false;
  const notifications = asRows(dashboard.notifications);
  const name = text(employee.display_name ?? employee.full_name, "there");
  const roleLine = [text(employee.position_title), text(employee.department_name)].filter(Boolean).join(" · ");

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <PageShell constrained={false}>
      <div className="space-y-3.5">
        <div>
          <p className="text-lg font-medium text-slate-950">Welcome back, {name.split(" ")[0]}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{roleLine || "—"}</p>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <Panel className="p-3"><p className="text-[9px] text-muted-foreground">Open requests</p><p className="mt-1 text-lg font-medium text-[#854F0B]">{Number(summary.open_leave_requests ?? 0) + Number(summary.pending_attendance_corrections ?? 0) + Number(summary.pending_profile_updates ?? 0)}</p></Panel>
          {visible("documents") ? <Panel className="p-3"><p className="text-[9px] text-muted-foreground">Expiring documents</p><p className="mt-1 text-lg font-medium text-slate-950">{Number(summary.expiring_documents ?? 0)}</p></Panel> : null}
          {visible("payslips") ? <Panel className="p-3"><p className="text-[9px] text-muted-foreground">Available payslips</p><p className="mt-1 text-lg font-medium text-slate-950">{Number(summary.available_payslips ?? 0)}</p></Panel> : null}
        </div>

        {visible("roster") && roster.length ? (
          <Panel className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-medium text-slate-950">My roster this week</p>
              <Link to="/v3-preview/self-service/roster" className="text-[10px] text-primary">View full roster</Link>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {roster.map((day, i) => {
                const date = text(day.roster_date ?? day.date);
                const isToday = date === todayIso;
                const status = text(day.status);
                const isOff = ["OFF", "DAY_OFF"].includes(status);
                const start = day.custom_start_time ?? day.shift_start_time;
                const end = day.custom_end_time ?? day.shift_end_time;
                const bg = isToday ? "#EEEDFE" : isOff ? "#FCEBEB" : "#F7F7FB";
                const fg = isToday ? "#534AB7" : isOff ? "#A32D2D" : "#14162B";
                return (
                  <div key={i} className="rounded-md p-2 text-center" style={{ background: bg }}>
                    <p className="text-[9px] font-medium" style={{ color: isToday ? "#534AB7" : isOff ? "#A32D2D" : "#6B6F86" }}>{date.slice(5)}</p>
                    {isOff ? <p className="mt-2 text-[10px] font-medium" style={{ color: fg }}>Off</p> : start ? (
                      <>
                        <p className="text-[10px] font-medium" style={{ color: fg }}>{String(start).slice(0, 5)}</p>
                        <p className="text-[10px]" style={{ color: fg }}>{String(end ?? "").slice(0, 5)}</p>
                      </>
                    ) : <p className="mt-2 text-[10px] text-muted-foreground">—</p>}
                  </div>
                );
              })}
            </div>
          </Panel>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr]">
          {visible("leave") ? (
            <Panel className="p-4">
              <p className="mb-3 text-xs font-medium text-slate-950">Leave balance</p>
              {leaveBalances.length ? (
                <div className="flex flex-wrap justify-center gap-6">
                  {leaveBalances.map((cycle, index) => {
                    const taken = Number(cycle.used_days ?? 0);
                    const max = Math.round(Number(cycle.opening_balance ?? 0) + Number(cycle.accrued_days ?? 0)) || taken || 1;
                    return <ProgressRing key={String(cycle.id ?? index)} value={taken} max={max} color={RING_COLORS[index % RING_COLORS.length]} label={text(cycle.leave_type_name)} />;
                  })}
                </div>
              ) : <p className="text-center text-xs text-muted-foreground">No leave balance cycles yet.</p>}
              <div className="mt-3 flex justify-center">
                <Link to="/v3-preview/self-service/leave"><Button size="sm"><Plus className="h-3.5 w-3.5" /> Request leave</Button></Link>
              </div>
            </Panel>
          ) : null}
          <Panel className="p-4">
            <p className="mb-3 text-xs font-medium text-slate-950">Quick actions</p>
            <div className="flex flex-col gap-2">
              {visible("payslips") ? <Link to="/v3-preview/self-service/payroll" className="flex items-center gap-2 rounded-md bg-[#F7F7FB] px-3 py-2 text-xs text-slate-950"><Receipt className="h-3.5 w-3.5 text-primary" /> View latest payslip</Link> : null}
              <Link to="/v3-preview/self-service/profile" className="flex items-center gap-2 rounded-md bg-[#F7F7FB] px-3 py-2 text-xs text-slate-950"><UserCog className="h-3.5 w-3.5 text-primary" /> Update contact details</Link>
              {visible("documents") ? <Link to="/v3-preview/self-service/documents" className="flex items-center gap-2 rounded-md bg-[#F7F7FB] px-3 py-2 text-xs text-slate-950"><Upload className="h-3.5 w-3.5 text-primary" /> Upload a document</Link> : null}
            </div>
          </Panel>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <Panel className="p-4">
            <p className="mb-2 text-xs font-medium text-slate-950">Recent activity</p>
            {notifications.length ? (
              <div className="flex flex-col gap-2.5">
                {notifications.slice(0, 5).map((n, i) => (
                  <div key={String(n.id ?? i)} className="flex items-center gap-2.5">
                    <Badge tone={n.severity === "warning" || n.severity === "danger" ? "warning" : "success"} className="shrink-0 px-1.5">•</Badge>
                    <p className="flex-1 truncate text-xs text-muted-foreground">{text(n.title ?? n.message)}</p>
                    <span className="shrink-0 text-[9px] text-muted-foreground">{text(n.created_at).slice(0, 10)}</span>
                  </div>
                ))}
              </div>
            ) : <p className="text-xs text-muted-foreground">No recent activity.</p>}
          </Panel>
          {visible("assets") ? (
            <Panel className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-medium text-slate-950">My assets</p>
                <Link to="/v3-preview/self-service/assets" className="text-[10px] text-primary">View all</Link>
              </div>
              <AssetsSummary token={token} />
            </Panel>
          ) : null}
        </div>

        {visible("documents") ? <DocumentWarningsSummary token={token} /> : null}
      </div>
    </PageShell>
  );
}

function AssetsSummary({ token }: { token: string | null }) {
  const [assets, setAssets] = useState<Row[] | null>(null);
  useEffect(() => {
    if (!token) return;
    api.getSelfServiceAssets(token).then((res) => setAssets(asRows(res.assignments))).catch(() => setAssets([]));
  }, [token]);
  if (assets === null) return <p className="text-xs text-muted-foreground">Loading…</p>;
  if (!assets.length) return <p className="text-xs text-muted-foreground">No assets assigned.</p>;
  return (
    <div className="flex flex-col gap-2">
      {assets.slice(0, 3).map((a, i) => (
        <div key={String(a.id ?? i)} className="flex items-center gap-2.5">
          <div className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-md bg-[#E6F1FB]"><Laptop className="h-3.5 w-3.5 text-[#0C447C]" /></div>
          <p className="truncate text-xs text-slate-950">{text(a.asset_name)}</p>
        </div>
      ))}
    </div>
  );
}

function DocumentWarningsSummary({ token }: { token: string | null }) {
  const [warnings, setWarnings] = useState<Row[] | null>(null);
  useEffect(() => {
    if (!token) return;
    api.getSelfServiceDocumentWarnings(token).then((res) => setWarnings(asRows(res.warnings))).catch(() => setWarnings([]));
  }, [token]);
  if (!warnings || !warnings.length) return null;
  return (
    <Panel className="p-4">
      <p className="mb-2 text-xs font-medium text-slate-950">Document alerts</p>
      <div className="flex flex-col gap-2">
        {warnings.slice(0, 3).map((w, i) => (
          <div key={String(w.id ?? i)} className="flex items-center gap-2.5">
            <div className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-md bg-[#FCEBEB]"><FileWarning className="h-3.5 w-3.5 text-[#A32D2D]" /></div>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-slate-950">{text(w.document_type_name, "Document")}</p>
              <p className="text-[9px] text-muted-foreground">{text(w.message, "Expiring soon")}</p>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
