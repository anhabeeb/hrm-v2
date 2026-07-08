import { useEffect, useState } from "react";
import { PageShell, SelectField, CheckboxField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavRail } from "../components/ui/route-nav-rail";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";
import { ATTENDANCE_NAV_ITEMS } from "./attendanceNav";
import type { AttendanceSettings } from "../types/attendance";

export function AttendanceSettingsPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const permissions = new Set(user?.permissions ?? []);
  const canManage = permissions.has("attendance.settings.manage");
  const [settings, setSettings] = useState<AttendanceSettings | null>(null);
  const [weeklyOff, setWeeklyOff] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!token) return;
    setLoading(true);
    const result = await api.getAttendanceSettings(token);
    setSettings(result.settings);
    try {
      setWeeklyOff(JSON.parse(result.settings.weekly_off_days_json ?? "[]").join(", "));
    } catch {
      setWeeklyOff("");
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, [token]);

  function update<K extends keyof AttendanceSettings>(key: K, value: AttendanceSettings[K]) {
    if (settings) setSettings({ ...settings, [key]: value });
  }

  async function save() {
    if (!token || !settings) return;
    setSaving(true);
    try {
      const weekly = weeklyOff.split(",").map((v) => v.trim().toUpperCase()).filter(Boolean);
      const result = await api.updateAttendanceSettings(token, { ...settings, weekly_off_days_json: JSON.stringify(weekly) });
      setSettings(result.settings);
      alerts.showSuccess("Settings saved", "Attendance settings updated.");
    } catch (err) {
      alerts.showApiError(err, "Unable to save attendance settings.");
    } finally {
      setSaving(false);
    }
  }

  const controlsDisabled = !canManage || !(settings?.module_enabled ?? true);

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={ATTENDANCE_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-lg font-medium text-slate-950">Settings</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Global attendance rules for roster, leave, and payroll integration</p>
          </div>

          {loading || !settings ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <Panel key={i} className="h-12 animate-pulse" />)}</div>
          ) : (
            <Panel className="p-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-1.5"><Label>Standard work minutes/day</Label><Input type="number" disabled={controlsDisabled} value={settings.standard_work_minutes_per_day} onChange={(e) => update("standard_work_minutes_per_day", Number(e.target.value))} /></div>
                <div className="space-y-1.5"><Label>Default shift start</Label><Input type="time" disabled={controlsDisabled} value={settings.default_shift_start_time ?? ""} onChange={(e) => update("default_shift_start_time", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Default shift end</Label><Input type="time" disabled={controlsDisabled} value={settings.default_shift_end_time ?? ""} onChange={(e) => update("default_shift_end_time", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Late grace minutes</Label><Input type="number" disabled={controlsDisabled} value={settings.late_grace_minutes} onChange={(e) => update("late_grace_minutes", Number(e.target.value))} /></div>
                <div className="space-y-1.5"><Label>Early checkout grace minutes</Label><Input type="number" disabled={controlsDisabled} value={settings.early_checkout_grace_minutes} onChange={(e) => update("early_checkout_grace_minutes", Number(e.target.value))} /></div>
                <div className="space-y-1.5"><Label>Weekly off days</Label><Input disabled={controlsDisabled} value={weeklyOff} onChange={(e) => setWeeklyOff(e.target.value)} placeholder="FRIDAY, SATURDAY" /></div>
                <div className="space-y-1.5"><Label>Default workday mode</Label><SelectField disabled={controlsDisabled} value={settings.default_workday_mode ?? "FIXED_SHIFT"} onValueChange={(v) => update("default_workday_mode", v as AttendanceSettings["default_workday_mode"])}>{["FIXED_SHIFT", "ROSTER_BASED", "FLEXIBLE"].map((o) => <option key={o} value={o}>{o}</option>)}</SelectField></div>
                <div className="space-y-1.5"><Label>Default attendance source</Label><SelectField disabled={controlsDisabled} value={settings.default_attendance_source ?? "DEVICE"} onValueChange={(v) => update("default_attendance_source", v as AttendanceSettings["default_attendance_source"])}>{["DEVICE", "MANUAL", "MANUAL_IMPORT", "API", "BRIDGE"].map((o) => <option key={o} value={o}>{o}</option>)}</SelectField></div>
                <div className="space-y-1.5"><Label>Default absent status</Label><SelectField disabled={controlsDisabled} value={settings.default_absent_status ?? "ABSENT"} onValueChange={(v) => update("default_absent_status", v as AttendanceSettings["default_absent_status"])}>{["ABSENT", "MISSING_PUNCH", "PENDING_CORRECTION"].map((o) => <option key={o} value={o}>{o}</option>)}</SelectField></div>
                <div className="space-y-1.5"><Label>Monthly attendance lock day</Label><Input type="number" min={1} max={31} disabled={controlsDisabled} value={settings.monthly_attendance_lock_day ?? ""} onChange={(e) => update("monthly_attendance_lock_day", e.target.value === "" ? null : Number(e.target.value))} /></div>
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                <CheckboxField label="Mark absent if no punch" disabled={controlsDisabled} checked={Boolean(settings.mark_absent_if_no_punch)} onChange={(v) => update("mark_absent_if_no_punch", v)} />
                <CheckboxField label="Missed punch requires correction" disabled={controlsDisabled} checked={Boolean(settings.missed_punch_requires_correction)} onChange={(v) => update("missed_punch_requires_correction", v)} />
                <CheckboxField label="Allow manual entries" disabled={controlsDisabled} checked={Boolean(settings.allow_manual_entries)} onChange={(v) => update("allow_manual_entries", v)} />
                <CheckboxField label="Manual entry requires approval" disabled={controlsDisabled} checked={Boolean(settings.manual_entry_requires_approval)} onChange={(v) => update("manual_entry_requires_approval", v)} />
                <CheckboxField label="Allow employee correction requests" disabled={controlsDisabled} checked={Boolean(settings.allow_employee_correction_requests)} onChange={(v) => update("allow_employee_correction_requests", v)} />
                <CheckboxField label="Correction requires approval" disabled={controlsDisabled} checked={Boolean(settings.correction_requires_approval)} onChange={(v) => update("correction_requires_approval", v)} />
                <CheckboxField label="Overtime tracking enabled" disabled={controlsDisabled} checked={Boolean(settings.overtime_tracking_enabled)} onChange={(v) => update("overtime_tracking_enabled", v)} />
                <CheckboxField label="Payroll impact enabled" disabled={controlsDisabled} checked={Boolean(settings.payroll_impact_enabled)} onChange={(v) => update("payroll_impact_enabled", v)} />
                <CheckboxField label="Lock after payroll finalized" disabled={controlsDisabled} checked={Boolean(settings.lock_after_payroll_finalized)} onChange={(v) => update("lock_after_payroll_finalized", v)} />
              </div>
              {canManage ? <div className="mt-4 flex justify-end"><Button size="sm" loading={saving} onClick={() => void save()}>Save settings</Button></div> : null}
            </Panel>
          )}
        </div>
      </div>
    </PageShell>
  );
}
