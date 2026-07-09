import { useEffect, useState } from "react";
import { PageShell, CheckboxField, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";
import type { ApprovalWorkflowSettings } from "../types/approvals";

const SWITCHES: Array<[keyof ApprovalWorkflowSettings, string]> = [
  ["use_central_workflow_for_supported_modules", "Use central workflows"],
  ["fallback_to_module_approval_if_no_workflow", "Fallback to module approval"],
  ["block_self_approval_by_default", "Block self approval by default"],
  ["allow_delegation", "Delegation enabled"],
  ["escalation_enabled", "Escalation enabled"],
  ["reminders_enabled", "Reminders enabled"],
  ["allow_parallel_approvals", "Parallel approvals"],
  ["allow_any_one_approval_mode", "Any-one approval mode"]
];

export function ApprovalSettingsPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const permissions = new Set(user?.permissions ?? []);
  const canManage = permissions.has("approvals.manage") || permissions.has("approvals.settings.manage");
  const [settings, setSettings] = useState<ApprovalWorkflowSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      setSettings((await api.getApprovalSettings(token)).settings);
    } catch (err) {
      alerts.showApiError(err, "Unable to load approval settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token]);

  function update<K extends keyof ApprovalWorkflowSettings>(key: K, value: ApprovalWorkflowSettings[K]) {
    if (settings) setSettings({ ...settings, [key]: value });
  }

  async function save() {
    if (!token || !settings) return;
    setSaving(true);
    try {
      setSettings((await api.updateApprovalSettings(token, settings)).settings);
      alerts.showSuccess("Approval settings saved", "Central approval workflow settings were updated.");
    } catch (err) {
      alerts.showApiError(err, "Unable to save approval settings.");
    } finally {
      setSaving(false);
    }
  }

  const enabled = Boolean(settings?.approval_workflows_enabled);
  const disabled = !canManage || !enabled;

  return (
    <PageShell constrained={false}>
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-medium text-slate-950">Approval settings</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Central workflow routing, delegation, escalation, and employee visibility defaults</p>
          </div>
          {canManage ? <Button size="sm" disabled={!enabled} loading={saving} onClick={() => void save()}>Save settings</Button> : null}
        </div>

        {loading || !settings ? (
          <Panel className="h-64 animate-pulse" />
        ) : (
          <Panel className="p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {SWITCHES.map(([key, label]) => (
                <CheckboxField key={key} label={label} disabled={disabled} checked={Boolean(settings[key])} onChange={(v) => update(key, v as ApprovalWorkflowSettings[typeof key])} />
              ))}
              <div className="space-y-1.5">
                <Label>Escalation basis</Label>
                <SelectField disabled={disabled} value={settings.default_escalation_time_basis} onValueChange={(v) => update("default_escalation_time_basis", v as ApprovalWorkflowSettings["default_escalation_time_basis"])}>
                  <option value="CALENDAR_DAYS">Calendar days</option>
                  <option value="WORKING_DAYS">Working days</option>
                </SelectField>
              </div>
              <div className="space-y-1.5">
                <Label>Employee visibility</Label>
                <SelectField disabled={disabled} value={settings.default_employee_visibility_mode} onValueChange={(v) => update("default_employee_visibility_mode", v as ApprovalWorkflowSettings["default_employee_visibility_mode"])}>
                  <option value="STEP_NAMES_ONLY">Step names only</option>
                  <option value="STEP_NAMES_AND_APPROVER_ROLES">Step names and roles</option>
                  <option value="FULL_APPROVER_NAMES">Full approver names</option>
                </SelectField>
              </div>
            </div>
          </Panel>
        )}
      </div>
    </PageShell>
  );
}
