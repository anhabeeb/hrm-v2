import { useEffect, useState } from "react";
import { PageShell, CheckboxField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";

const SETTING_GROUPS = [
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
  const alerts = useAlert();
  const permissions = new Set(user?.permissions ?? []);
  const canManage = permissions.has("self_service.settings.manage") || permissions.has("self_service.settings.update") || permissions.has("settings.manage");
  const canView = canManage || permissions.has("self_service.settings.view") || permissions.has("settings.view");
  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    try {
      setSettings((await api.getSelfServiceSettings(token)).settings);
    } catch (err) {
      alerts.showApiError(err, "Unable to load self-service settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token, canView]);

  function update(key: string, value: boolean) {
    setSettings((current) => ({ ...(current ?? {}), [key]: value ? 1 : 0 }));
  }

  async function save() {
    if (!token || !settings) return;
    setSaving(true);
    try {
      setSettings((await api.updateSelfServiceSettings(token, settings)).settings);
      alerts.showSuccess("Settings saved", "Self-service settings were updated.");
    } catch (err) {
      alerts.showApiError(err, "Unable to save self-service settings.");
    } finally {
      setSaving(false);
    }
  }

  if (!canView) {
    return (
      <PageShell constrained={false}>
        <div className="space-y-3.5">
          <p className="text-lg font-medium text-slate-950">Employee self-service settings</p>
          <Panel className="p-4"><EmptyState title="Self-service settings unavailable" description="Your account needs self_service.settings.view permission." /></Panel>
        </div>
      </PageShell>
    );
  }

  const moduleEnabled = Boolean(Number(settings?.module_enabled ?? 1));
  const disabled = !canManage || !moduleEnabled;

  return (
    <PageShell constrained={false}>
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-medium text-slate-950">Employee self-service settings</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Configure which employee self-service modules are visible and which employee actions are allowed</p>
          </div>
          {canManage ? <Button size="sm" disabled={saving || !settings || !moduleEnabled} loading={saving} onClick={() => void save()}>Save settings</Button> : null}
        </div>

        {loading || !settings ? (
          <div className="grid gap-3 xl:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Panel key={i} className="h-32 animate-pulse" />)}</div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {SETTING_GROUPS.map((group) => (
              <Panel key={group.title} className="overflow-hidden">
                <div className="border-b px-4 py-3"><p className="text-xs font-medium text-slate-950">{group.title}</p></div>
                <div className="grid gap-2 p-3">
                  {group.keys.map(([key, label]) => (
                    <CheckboxField key={key} label={label} disabled={disabled} checked={Boolean(Number(settings?.[key] ?? 0))} onChange={(v) => update(key, v)} />
                  ))}
                </div>
              </Panel>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}
