import { useEffect, useState } from "react";
import { UserCheck } from "lucide-react";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavRail } from "../components/ui/route-nav-rail";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";
import { humanizeTechnicalLabel } from "../lib/displayLabels";
import { APPROVALS_NAV_ITEMS } from "./approvalsNav";
import type { ApprovalDelegationRule } from "../types/approvals";

function statusTone(status: string) {
  if (status === "ACTIVE") return { bg: "#EAF3DE", text: "#27500A" };
  if (status === "EXPIRED" || status === "CANCELLED") return { bg: "#FCEBEB", text: "#A32D2D" };
  return { bg: "#F7F7FB", text: "#6B6F86" };
}

export function ApprovalDelegationsPage() {
  const { token } = useAuth();
  const alerts = useAlert();
  const [rows, setRows] = useState<ApprovalDelegationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ delegate_user_id: "", start_at: "", end_at: "", reason: "", module_key: "", action_key: "" });
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!token) return;
    setLoading(true);
    const res = await api.listApprovalDelegations(token).catch(() => ({ delegations: [] }));
    setRows(res.delegations);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [token]);

  async function submit() {
    if (!token || !form.delegate_user_id || !form.start_at || !form.end_at) return;
    setSaving(true);
    try {
      await api.createApprovalDelegation(token, form);
      alerts.showSuccess("Delegation created", "Approval delegation was created.");
      setForm({ delegate_user_id: "", start_at: "", end_at: "", reason: "", module_key: "", action_key: "" });
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to save delegation.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={APPROVALS_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-lg font-medium text-slate-950">Delegations</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Time-bound delegation of approval authority to another user</p>
          </div>

          <Panel className="space-y-3 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">New delegation</p>
            <div className="grid gap-2 md:grid-cols-3">
              <div className="space-y-1"><Label>Delegate user ID</Label><Input value={form.delegate_user_id} onChange={(e) => setForm({ ...form, delegate_user_id: e.target.value })} /></div>
              <div className="space-y-1"><Label>Start</Label><Input type="date" value={form.start_at} onChange={(e) => setForm({ ...form, start_at: e.target.value })} /></div>
              <div className="space-y-1"><Label>End</Label><Input type="date" value={form.end_at} onChange={(e) => setForm({ ...form, end_at: e.target.value })} /></div>
              <div className="space-y-1"><Label>Module (optional)</Label><Input value={form.module_key} onChange={(e) => setForm({ ...form, module_key: e.target.value })} /></div>
              <div className="col-span-2 space-y-1"><Label>Reason</Label><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
            </div>
            <Button size="sm" loading={saving} disabled={!form.delegate_user_id || !form.start_at || !form.end_at} onClick={() => void submit()}><UserCheck className="h-4 w-4" /> Create delegation</Button>
          </Panel>

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 2 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : rows.length ? (
            <div className="flex flex-col gap-2">
              {rows.map((row) => (
                <Panel key={row.id} className="flex items-center gap-3.5 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-950">{row.delegator_name ?? row.delegator_user_id} → {row.delegate_name ?? row.delegate_user_id}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{row.module_key ?? "All modules"} / {row.action_key ?? "All actions"} · {row.start_at} to {row.end_at}{row.reason ? ` · ${row.reason}` : ""}</p>
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: statusTone(row.status).bg, color: statusTone(row.status).text }}>{humanizeTechnicalLabel(row.status)}</span>
                </Panel>
              ))}
            </div>
          ) : (
            <Panel><EmptyState title="No delegations" description="Time-bound delegations will appear here." /></Panel>
          )}
        </div>
      </div>
    </PageShell>
  );
}
