import { useEffect, useState } from "react";
import { Calculator, Plus } from "lucide-react";
import { PageShell, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavSwitcher } from "../components/ui/route-nav-switcher";
import { EmptyState } from "../components/ui/empty-state";
import { Button, RowActionButton } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";
import { humanizeTechnicalLabel } from "../lib/displayLabels";
import { LEAVE_NAV_ITEMS } from "./leaveNav";
import type { DeductionMode, LeavePolicy } from "../types/leave";

interface DeductionRuleRow {
  id: string;
  leave_policy_id: string;
  deduction_mode: DeductionMode;
  deduction_pay_component: string | null;
  deduction_after_days: number | null;
  long_leave_threshold_days: number | null;
  custom_rule_json?: string | null;
  is_active: number | boolean;
}

function bool(value: unknown) {
  return value === true || value === 1;
}

function ruleDescription(rule: DeductionRuleRow) {
  if (rule.deduction_mode === "NONE" || rule.deduction_mode === "NO_DEDUCTION") return "No payroll deduction applied.";
  const parts: string[] = [humanizeTechnicalLabel(rule.deduction_mode)];
  if (rule.deduction_pay_component) parts.push(`from ${humanizeTechnicalLabel(rule.deduction_pay_component)}`);
  if (rule.deduction_after_days) parts.push(`after ${rule.deduction_after_days} days`);
  if (rule.long_leave_threshold_days) parts.push(`long-leave threshold ${rule.long_leave_threshold_days} days`);
  return parts.join(" · ");
}

const DEDUCTION_MODES: DeductionMode[] = ["NONE", "FULL_DAY", "WORKED_DAYS_ONLY", "CUSTOM"];

export function LeaveDeductionRulesPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const permissions = new Set(user?.permissions ?? []);
  const canManage = permissions.has("leave.settings.manage");
  const [policies, setPolicies] = useState<LeavePolicy[]>([]);
  const [policyId, setPolicyId] = useState("");
  const [allRules, setAllRules] = useState<Array<DeductionRuleRow & { policy: LeavePolicy }>>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<DeductionRuleRow | "new" | null>(null);

  async function loadBase() {
    if (!token) return;
    setLoading(true);
    try {
      const policiesRes = await api.listLeavePolicies(token);
      setPolicies(policiesRes.policies);
      if (!policyId && policiesRes.policies[0]) setPolicyId(policiesRes.policies[0].id);
      const entries = await Promise.all(policiesRes.policies.map((policy) => api.listLeavePolicyDeductionRules(token, policy.id).then((r) => (r.deduction_rules as unknown as DeductionRuleRow[]).map((rule) => ({ ...rule, policy })))));
      setAllRules(entries.flat());
    } catch (err) {
      alerts.showApiError(err, "Unable to load deduction rules.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadBase(); }, [token]);

  async function toggle(row: DeductionRuleRow) {
    if (!token) return;
    try {
      await api.leavePolicyDeductionRuleAction(token, row.leave_policy_id, row.id, bool(row.is_active) ? "disable" : "enable");
      alerts.showSuccess("Rule updated", `Deduction rule was ${bool(row.is_active) ? "disabled" : "enabled"}.`);
      await loadBase();
    } catch (err) {
      alerts.showApiError(err, "Unable to update deduction rule.");
    }
  }

  return (
    <PageShell constrained={false}>
      <div className="flex flex-col gap-3">
        <div className="min-w-0 flex-1 space-y-3">
            <div className="px-4">
                <RouteNavSwitcher items={LEAVE_NAV_ITEMS} moduleLabel="Leave" />
                <p className="mt-0.5 text-xs text-muted-foreground">How excess or unpaid leave impacts payroll</p>
            </div>

              <Panel className="shadow-none space-y-3 p-4">
          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 2 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : allRules.length ? (
            <div className="flex flex-col gap-2">
              {allRules.map((rule) => (
                <Panel key={rule.id} className="flex items-center gap-3.5 p-3">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#FAEEDA]"><Calculator className="h-4 w-4 text-[#854F0B]" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-950">{rule.policy.leave_type_name ?? rule.policy.name} · {humanizeTechnicalLabel(rule.deduction_mode)}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{ruleDescription(rule)}</p>
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: bool(rule.is_active) ? "#EAF3DE" : "#F7F7FB", color: bool(rule.is_active) ? "#27500A" : "#6B6F86" }}>{bool(rule.is_active) ? "Active" : "Inactive"}</span>
                  {canManage ? (
                    <div className="flex shrink-0 gap-1.5">
                      <RowActionButton intent="edit" size="sm" title="Edit rule" onClick={() => { setPolicyId(rule.leave_policy_id); setModal(rule); }}>Edit</RowActionButton>
                      <Button size="sm" variant={bool(rule.is_active) ? "danger" : "primary"} onClick={() => void toggle(rule)}>{bool(rule.is_active) ? "Disable" : "Enable"}</Button>
                    </div>
                  ) : null}
                </Panel>
              ))}
            </div>
          ) : (
            <Panel><EmptyState title="No deduction rules configured" description={policies.length ? "Set up payroll deduction rules per policy below." : "Configure leave policies first, then add deduction rules."} /></Panel>
          )}

          {canManage ? (
            <Panel className="flex flex-col gap-3 p-3 md:flex-row md:items-end md:justify-between">
              <div className="w-full max-w-xl space-y-1.5"><Label>Policy</Label><SelectField value={policyId} onValueChange={setPolicyId}>{policies.map((policy) => <option key={policy.id} value={policy.id}>{policy.name} - {policy.leave_type_name ?? "Leave"}</option>)}</SelectField></div>
              <Button size="sm" onClick={() => setModal("new")} disabled={!policyId}><Plus className="h-4 w-4" /> Create deduction rule</Button>
            </Panel>
          ) : null}

              </Panel>
        </div>
      </div>

      {modal ? (
        <DeductionRuleModal
          policyId={policyId}
          rule={modal === "new" ? undefined : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); void loadBase(); }}
        />
      ) : null}
    </PageShell>
  );
}

function DeductionRuleModal({ policyId, rule, onClose, onSaved }: { policyId: string; rule?: DeductionRuleRow; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [form, setForm] = useState({
    deduction_mode: String(rule?.deduction_mode ?? "NONE"),
    deduction_pay_component: String(rule?.deduction_pay_component ?? ""),
    deduction_after_days: String(rule?.deduction_after_days ?? ""),
    long_leave_threshold_days: String(rule?.long_leave_threshold_days ?? ""),
    custom_rule_json: String(rule?.custom_rule_json ?? "")
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!token) return;
    setSaving(true);
    try {
      const input = {
        deduction_mode: form.deduction_mode,
        deduction_pay_component: form.deduction_pay_component || null,
        deduction_after_days: form.deduction_after_days ? Number(form.deduction_after_days) : null,
        long_leave_threshold_days: form.long_leave_threshold_days ? Number(form.long_leave_threshold_days) : null,
        custom_rule_json: form.custom_rule_json || null
      };
      if (rule?.id) await api.updateLeavePolicyDeductionRule(token, policyId, rule.id, input);
      else await api.createLeavePolicyDeductionRule(token, policyId, input);
      alerts.showSuccess("Deduction rule saved", "The deduction rule was saved.");
      onSaved();
    } catch (err) {
      alerts.showApiError(err, "Unable to save deduction rule.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>{rule ? "Edit deduction rule" : "Create deduction rule"}</DialogTitle></DialogHeader>
        <DialogBody>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Deduction mode</Label><SelectField value={form.deduction_mode} onValueChange={(v) => setForm({ ...form, deduction_mode: v })}>{DEDUCTION_MODES.map((mode) => <option key={mode} value={mode}>{humanizeTechnicalLabel(mode)}</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>Pay component</Label><Input value={form.deduction_pay_component} onChange={(e) => setForm({ ...form, deduction_pay_component: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Deduct after days</Label><Input type="number" value={form.deduction_after_days} onChange={(e) => setForm({ ...form, deduction_after_days: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Long leave threshold</Label><Input type="number" value={form.long_leave_threshold_days} onChange={(e) => setForm({ ...form, long_leave_threshold_days: e.target.value })} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Custom rule JSON</Label><Input value={form.custom_rule_json} onChange={(e) => setForm({ ...form, custom_rule_json: e.target.value })} /></div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={() => void save()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
