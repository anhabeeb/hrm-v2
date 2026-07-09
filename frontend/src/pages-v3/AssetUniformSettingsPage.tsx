import { useEffect, useState } from "react";
import { PageShell, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavSwitcher } from "../components/ui/route-nav-switcher";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";
import { ASSETS_NAV_ITEMS } from "./assetsNav";
import type { AssetUniformSettings } from "../types/assets";

function isOn(value: unknown) {
  return value === true || value === 1 || value === "1";
}

const CHECKS: Array<[keyof AssetUniformSettings, string, string]> = [
  ["require_approval_before_asset_issue", "Approval before asset issue", "Creates central approval foundation records before asset issue when workflows are enabled."],
  ["require_approval_before_damage_loss_deduction", "Approval before damage/loss deduction", "Routes damage and lost item deduction decisions through approvals."],
  ["allow_payroll_deduction_for_lost_damaged_items", "Allow payroll deduction", "Allows asset/uniform recovery to create custom payroll deductions."],
  ["allow_final_settlement_deduction", "Allow final settlement deduction", "Includes pending asset/uniform recovery in exit payroll clearance."],
  ["default_asset_clearance_required_before_final_settlement", "Asset clearance before final settlement", "Requires asset clearance during employee exit processing."],
  ["default_uniform_clearance_required_before_final_settlement", "Uniform clearance before final settlement", "Requires uniform clearance during employee exit processing."],
  ["allow_employee_self_service_asset_view", "Self-service asset view", "Employees can view their own asset history."],
  ["allow_employee_self_service_uniform_view", "Self-service uniform view", "Employees can view their own uniform history."],
  ["require_reason_for_waiver", "Reason required for waiver", "Waiving recovery requires a reason."],
  ["require_reason_for_deduction", "Reason required for deduction", "Deduction creation requires a reason."],
  ["require_reason_for_cancel", "Reason required for cancel", "Cancellation requires a reason."],
  ["use_central_approval_workflow", "Use central approval workflow", "Uses the shared approval workflow foundation where matched."]
];

export function AssetUniformSettingsPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const canManage = Boolean(user?.permissions.includes("assets.settings.manage") || user?.permissions.includes("uniforms.settings.manage"));
  const [settings, setSettings] = useState<Partial<AssetUniformSettings> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const result = await api.getAssetUniformSettings(token);
      setSettings(result.settings);
    } catch (err) {
      alerts.showApiError(err, "Unable to load asset and uniform settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token]);

  async function save() {
    if (!token || !settings) return;
    setSaving(true);
    try {
      const result = await api.updateAssetUniformSettings(token, settings);
      setSettings(result.settings);
      alerts.showSuccess("Settings saved", "Asset and uniform settings were updated.");
    } catch (err) {
      alerts.showApiError(err, "Unable to save settings.");
    } finally {
      setSaving(false);
    }
  }

  const modulesEnabled = settings ? isOn(settings.asset_module_enabled ?? true) || isOn(settings.uniform_module_enabled ?? true) : true;
  const disabled = !canManage || !modulesEnabled;

  return (
    <PageShell constrained={false}>
      <div className="flex flex-col gap-3">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="px-4 flex items-center justify-between">
              <div>
                <RouteNavSwitcher items={ASSETS_NAV_ITEMS} moduleLabel="Assets" />
                <p className="mt-0.5 text-xs text-muted-foreground">Lifecycle, clearance, deduction, final settlement, self-service, and approval foundations</p>
              </div>
              {canManage ? <Button size="sm" disabled={!modulesEnabled} loading={saving} onClick={() => void save()}>Save settings</Button> : null}
</div>

              <Panel className="shadow-none space-y-3 p-4">
          {loading || !settings ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 6 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : (
            <Panel className="p-4">
              <div className="grid gap-2 md:grid-cols-2">
                {CHECKS.map(([key, label, helper]) => (
                  <label key={key} className="flex items-start gap-2 rounded-md border bg-white px-3 py-2 text-xs transition hover:bg-slate-50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
                    <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-primary focus:ring-primary/20" checked={isOn(settings[key])} disabled={disabled} onChange={(e) => setSettings({ ...settings, [key]: e.target.checked })} />
                    <span className="min-w-0">
                      <span className="block font-medium text-slate-950">{label}</span>
                      <span className="mt-0.5 block text-[10px] text-muted-foreground">{helper}</span>
                    </span>
                  </label>
                ))}
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Default damage deduction mode</Label>
                  <SelectField disabled={disabled} value={String(settings.default_damage_deduction_mode ?? "FULL_REPLACEMENT_VALUE")} onValueChange={(v) => setSettings({ ...settings, default_damage_deduction_mode: v })}>
                    {["FULL_REPLACEMENT_VALUE", "CURRENT_VALUE", "MANUAL_AMOUNT", "CUSTOM_FORMULA_PLACEHOLDER"].map((v) => <option key={v} value={v}>{v}</option>)}
                  </SelectField>
                </div>
                <div className="space-y-1.5">
                  <Label>Default uniform replacement cycle months</Label>
                  <Input type="number" disabled={disabled} value={String(settings.default_uniform_replacement_cycle_months ?? "")} onChange={(e) => setSettings({ ...settings, default_uniform_replacement_cycle_months: e.target.value ? Number(e.target.value) : null })} />
                </div>
                {!canManage ? <div className="flex items-end"><Badge tone="warning">Read only</Badge></div> : null}
              </div>
            </Panel>
          )}

              </Panel>
        </div>
      </div>
    </PageShell>
  );
}
