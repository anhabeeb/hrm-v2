import { useEffect, useState } from "react";
import { PageShell, CheckboxField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { Button } from "../components/ui/button";
import { useAuth } from "../hooks/useAuth";
import { usePageBreadcrumb } from "../hooks/useBreadcrumb";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";
import type { LifecycleSettings } from "../types/lifecycle";

const ONBOARDING_FIELDS = [
  "onboarding_enabled",
  "require_onboarding_before_activation",
  "allow_draft_employee_records",
  "auto_create_onboarding_case_on_employee_create",
  "allow_partial_onboarding",
  "require_documents_before_activation",
  "require_contract_before_activation",
  "require_payroll_profile_before_activation",
  "require_biometric_mapping_before_activation",
  "require_user_account_before_activation",
  "require_approval_before_activation",
  "allow_activation_override_with_reason",
  "employee_self_service_onboarding_view_enabled"
];

const OFFBOARDING_FIELDS = [
  "offboarding_enabled",
  "require_offboarding_case_before_exit",
  "auto_create_offboarding_case_on_exit_status",
  "require_final_settlement_before_archive",
  "require_asset_uniform_clearance",
  "require_document_checklist",
  "require_payroll_final_check",
  "require_attendance_final_check",
  "require_roster_future_assignment_check",
  "require_user_account_deactivation",
  "require_access_revocation",
  "require_approval_before_exit_finalization",
  "allow_offboarding_override_with_reason",
  "employee_self_service_offboarding_view_enabled"
];

function title(value: string) {
  return value.replace(/\//g, " / ").replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isEnabled(value: unknown) {
  return value === true || value === 1 || value === "1";
}

export function LifecycleSettingsPage({ kind }: { kind: "onboarding" | "offboarding" }) {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const permissions = new Set(user?.permissions ?? []);
  const canManage = kind === "onboarding"
    ? permissions.has("onboarding.settings.manage") || permissions.has("onboarding.settings.update") || permissions.has("settings.manage")
    : permissions.has("offboarding.settings.manage") || permissions.has("offboarding.settings.update") || permissions.has("settings.manage");
  const fields = kind === "onboarding" ? ONBOARDING_FIELDS : OFFBOARDING_FIELDS;
  const enabledField = kind === "onboarding" ? "onboarding_enabled" : "offboarding_enabled";
  const [settings, setSettings] = useState<LifecycleSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      setSettings(kind === "onboarding" ? (await api.getOnboardingSettings(token)).settings : (await api.getOffboardingSettings(token)).settings);
    } catch (err) {
      alerts.showApiError(err, `Unable to load ${kind} settings.`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token, kind]);

  usePageBreadcrumb(["Settings"]);

  async function save() {
    if (!token || !settings) return;
    setSaving(true);
    try {
      setSettings(kind === "onboarding" ? (await api.updateOnboardingSettings(token, settings)).settings : (await api.updateOffboardingSettings(token, settings)).settings);
      alerts.showSuccess("Settings saved", `${title(kind)} settings were updated.`);
    } catch (err) {
      alerts.showApiError(err, `Unable to save ${kind} settings.`);
    } finally {
      setSaving(false);
    }
  }

  const enabled = settings ? isEnabled(settings[enabledField]) : false;
  const disabled = !canManage || !enabled;

  return (
    <PageShell constrained={false}>
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-medium text-slate-950">{title(kind)} settings</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Requirement rules that gate {kind === "onboarding" ? "employee activation" : "exit finalization"}</p>
          </div>
          {canManage ? <Button size="sm" disabled={!enabled} loading={saving} onClick={() => void save()}>Save settings</Button> : null}
        </div>

        {loading || !settings ? (
          <Panel className="h-64 animate-pulse" />
        ) : (
          <Panel className="p-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {fields.filter((field) => field !== enabledField).map((field) => (
                <CheckboxField key={field} label={title(field)} disabled={disabled} checked={isEnabled(settings[field])} onChange={(v) => setSettings({ ...settings, [field]: v ? 1 : 0 })} />
              ))}
            </div>
          </Panel>
        )}
      </div>
    </PageShell>
  );
}
