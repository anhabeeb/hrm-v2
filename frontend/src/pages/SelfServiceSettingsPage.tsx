import { FormEvent, useEffect, useState } from "react";
import { Save } from "lucide-react";
import { ModuleSettingsBody, ModuleToggleHeader } from "../components/settings/ModuleToggleHeader";
import { Button } from "../components/ui/button";
import { DataTableFrame } from "../components/ui/data-table";
import { EmptyState } from "../components/ui/empty-state";
import { CheckboxField, PageHeader, PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";

const settingGroups = [
  {
    title: "Portal visibility",
    keys: [
      ["dashboard_enabled", "Dashboard"],
      ["profile_enabled", "Profile"],
      ["profile_update_requests_enabled", "Profile update requests"],
      ["notifications_enabled", "Notifications"]
    ]
  },
  {
    title: "HR records",
    keys: [
      ["documents_enabled", "Documents"],
      ["documents_compliance_enabled", "Document compliance"],
      ["contracts_enabled", "Contracts"],
      ["assets_enabled", "Assets"],
      ["uniforms_enabled", "Uniforms"],
      ["approvals_enabled", "Requests and approvals"],
      ["onboarding_enabled", "Onboarding"],
      ["offboarding_enabled", "Offboarding"]
    ]
  },
  {
    title: "Time and payroll",
    keys: [
      ["leave_enabled", "Leave"],
      ["attendance_enabled", "Attendance"],
      ["roster_enabled", "Roster"],
      ["payroll_enabled", "Payroll"],
      ["payslips_enabled", "Payslips"],
      ["payment_methods_enabled", "Payment methods"],
      ["bank_loans_enabled", "Bank loans"],
      ["pension_enabled", "Pension"]
    ]
  },
  {
    title: "Employee actions",
    keys: [
      ["allow_profile_update_requests", "Allow profile update requests"],
      ["allow_attendance_correction_requests", "Allow attendance correction requests"],
      ["allow_leave_requests", "Allow leave requests"],
      ["allow_payslip_downloads", "Allow payslip downloads"],
      ["show_sensitive_payroll_values", "Show payroll values"],
      ["show_sensitive_bank_details", "Show bank detail fields"]
    ]
  }
] as const;

export function SelfServiceSettingsPage() {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canManage = permissions.has("self_service.settings.manage") || permissions.has("self_service.settings.update") || permissions.has("settings.manage");
  const canView = canManage || permissions.has("self_service.settings.view") || permissions.has("settings.view");
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    setError(null);
    try {
      setSettings((await api.getSelfServiceSettings(token)).settings);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load self-service settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, canView]);

  function update(key: string, value: boolean) {
    setSettings((current) => ({ ...(current ?? {}), [key]: value ? 1 : 0 }));
  }

  async function toggleSelfServiceModule(enabled: boolean) {
    if (!token || !settings) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const next = { ...settings, module_enabled: enabled ? 1 : 0 };
      setSettings((await api.updateSelfServiceSettings(token, next)).settings);
      setMessage(enabled ? "Self-service module enabled." : "Self-service module disabled.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update self-service module status.");
    } finally {
      setSaving(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!token || !settings) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      setSettings((await api.updateSelfServiceSettings(token, settings)).settings);
      setMessage("Self-service settings saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save self-service settings.");
    } finally {
      setSaving(false);
    }
  }

  if (!canView) {
    return (
      <PageShell>
        <PageHeader
          title="Employee Self-Service Settings"
          eyebrow="Settings"
          description="Configure which employee self-service modules are visible and which employee actions are allowed."
        />
        <Panel className="p-6"><EmptyState title="Self-service settings unavailable" description="Your account needs self_service.settings.view permission." /></Panel>
      </PageShell>
    );
  }

  const moduleEnabled = Boolean(Number(settings?.module_enabled ?? 1));
  const controlsDisabled = !canManage || !moduleEnabled;

  return (
    <PageShell>
      <PageHeader
        title="Employee Self-Service Settings"
        eyebrow="Settings"
        description="Configure which employee self-service modules are visible and which employee actions are allowed."
        actions={canManage ? <Button form="self-service-settings-form" type="submit" disabled={saving || !settings || !moduleEnabled}><Save className="h-4 w-4" />Save</Button> : null}
      />
      {message ? <div className="rounded-md border bg-muted px-3 py-2 text-sm">{message}</div> : null}
      {settings ? (
        <ModuleToggleHeader
          moduleName="Self-service"
          enabled={moduleEnabled}
          permissionCanUpdate={canManage}
          isSaving={saving}
          description="Controls employee-facing portal visibility for profile, documents, leave, attendance, roster, payroll, contracts, assets, and approvals."
          disabledDescription="Self-service settings are read-only while the employee portal is disabled. Authorized users can re-enable it from this top switch."
          dependencyWarnings={["Self-service visibility affects employee document submissions, leave requests, attendance corrections, payslips, and employee profile update requests."]}
          onToggle={toggleSelfServiceModule}
        />
      ) : null}
      <DataTableFrame loading={loading} error={error} empty={!loading && !settings}>
        <form id="self-service-settings-form" onSubmit={(event) => void save(event)} className="grid gap-4 xl:grid-cols-2">
          <ModuleSettingsBody disabled={!moduleEnabled} className="contents">
          {settingGroups.map((group) => (
            <Panel key={group.title} className="overflow-hidden">
              <div className="border-b px-4 py-3">
                <h2 className="text-sm font-semibold">{group.title}</h2>
              </div>
              <div className="grid gap-2 p-3">
                {group.keys.map(([key, label]) => (
                  <Toggle key={key} label={label} checked={Boolean(Number(settings?.[key] ?? 0))} disabled={controlsDisabled} onChange={(value) => update(key, value)} />
                ))}
              </div>
            </Panel>
          ))}
          </ModuleSettingsBody>
        </form>
      </DataTableFrame>
    </PageShell>
  );
}

function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return <CheckboxField label={label} checked={checked} disabled={disabled} onChange={onChange} />;
}
