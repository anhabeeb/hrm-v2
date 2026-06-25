import { FormEvent, useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "../components/ui/button";
import { DataTableFrame } from "../components/ui/data-table";
import { EmptyState } from "../components/ui/empty-state";
import { Panel } from "../components/ui/panel";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";

const settingGroups = [
  {
    title: "Portal visibility",
    keys: [
      ["module_enabled", "Self-service enabled"],
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
    return <Panel className="p-6"><EmptyState title="Self-service settings unavailable" description="Your account needs self_service.settings.view permission." /></Panel>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Employee Self-Service Settings</h1>
          <p className="text-sm text-muted-foreground">Configure which employee self-service modules are visible and which employee actions are allowed.</p>
        </div>
        {canManage ? <Button form="self-service-settings-form" type="submit" disabled={saving || !settings}><Save className="h-4 w-4" />Save</Button> : null}
      </div>
      {message ? <div className="rounded-md border bg-muted px-3 py-2 text-sm">{message}</div> : null}
      <DataTableFrame loading={loading} error={error} empty={!loading && !settings}>
        <form id="self-service-settings-form" onSubmit={(event) => void save(event)} className="grid gap-4 xl:grid-cols-2">
          {settingGroups.map((group) => (
            <Panel key={group.title} className="overflow-hidden">
              <div className="border-b px-4 py-3">
                <h2 className="text-sm font-semibold">{group.title}</h2>
              </div>
              <div className="grid gap-2 p-3">
                {group.keys.map(([key, label]) => (
                  <Toggle key={key} label={label} checked={Boolean(Number(settings?.[key] ?? 0))} disabled={!canManage} onChange={(value) => update(key, value)} />
                ))}
              </div>
            </Panel>
          ))}
        </form>
      </DataTableFrame>
    </div>
  );
}

function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
      <span>{label}</span>
      <input type="checkbox" className="h-4 w-4" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}
