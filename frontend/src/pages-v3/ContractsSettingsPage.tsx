import { useEffect, useState } from "react";
import { PageShell, CheckboxField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";

type Row = Record<string, unknown>;

function bool(value: unknown) {
  return value === true || value === 1 || value === "1";
}

const SWITCHES = ["require_contract_for_active_employee", "auto_create_contract_task_on_onboarding", "require_contract_approval_before_activation", "allow_employee_without_contract_warning", "contract_expiry_alerts_enabled", "auto_mark_expired_contracts", "auto_create_end_of_contract_settlement_case", "require_reason_for_contract_change", "allow_contract_salary_snapshot", "allow_contract_salary_update_to_payroll_profile", "require_approval_for_contract_salary_update", "contract_document_required", "contract_sensitive_salary_terms"];
const NUMBERS = ["default_expiry_warning_days", "default_probation_warning_days", "default_renewal_warning_days"];

function labelFor(key: string) {
  return key.split("_").join(" ");
}

export function ContractsSettingsPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const permissions = new Set(user?.permissions ?? []);
  const canEdit = permissions.has("contracts.settings.manage") || permissions.has("contracts.settings.update");
  const [settings, setSettings] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      setSettings((await api.getContractSettings(token)).settings as Row);
    } catch (err) {
      alerts.showApiError(err, "Unable to load contract settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token]);

  function update(key: string, value: unknown) {
    if (settings) setSettings({ ...settings, [key]: value });
  }

  async function save() {
    if (!token || !settings) return;
    setSaving(true);
    try {
      setSettings((await api.updateContractSettings(token, settings)).settings as Row);
      alerts.showSuccess("Settings saved", "Contract settings were updated.");
    } catch (err) {
      alerts.showApiError(err, "Unable to save contract settings.");
    } finally {
      setSaving(false);
    }
  }

  const enabled = settings ? bool(settings.contracts_enabled ?? true) : true;
  const disabled = !canEdit || !enabled;

  return (
    <PageShell constrained={false}>
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-medium text-slate-950">Contract settings</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Control contract requirement warnings, expiry/probation alerts, salary snapshots, and document expectations</p>
          </div>
          {canEdit ? <Button size="sm" disabled={!enabled} loading={saving} onClick={() => void save()}>Save settings</Button> : null}
        </div>

        {loading || !settings ? (
          <Panel className="h-64 animate-pulse" />
        ) : (
          <Panel className="p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {SWITCHES.map((key) => (
                <CheckboxField key={key} label={labelFor(key)} disabled={disabled} checked={bool(settings[key])} onChange={(v) => update(key, v)} />
              ))}
              {NUMBERS.map((key) => (
                <div key={key} className="space-y-1.5"><Label className="capitalize">{labelFor(key)}</Label><Input type="number" min={0} disabled={disabled} value={String(settings[key] ?? "")} onChange={(e) => update(key, Number(e.target.value))} /></div>
              ))}
            </div>
          </Panel>
        )}
      </div>
    </PageShell>
  );
}
