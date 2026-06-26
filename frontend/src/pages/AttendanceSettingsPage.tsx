import { Save } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { AttendanceNav } from "../components/attendance/AttendanceNav";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { CheckboxField, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import type { AttendanceSettings } from "../types/attendance";

export function AttendanceSettingsPage() {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("attendance.view");
  const canManage = permissions.has("attendance.settings.manage");
  const [settings, setSettings] = useState<AttendanceSettings | null>(null);
  const [weeklyOff, setWeeklyOff] = useState("FRIDAY");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.getAttendanceSettings(token);
      setSettings(result.settings);
      try {
        setWeeklyOff(JSON.parse(result.settings.weekly_off_days_json ?? "[]").join(", "));
      } catch {
        setWeeklyOff("");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load attendance settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, canView]);

  async function save() {
    if (!token || !settings) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const weekly = weeklyOff.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean);
      const result = await api.updateAttendanceSettings(token, { ...settings, weekly_off_days_json: JSON.stringify(weekly) });
      setSettings(result.settings);
      setMessage("Attendance settings saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save attendance settings.");
    } finally {
      setSaving(false);
    }
  }

  function update<K extends keyof AttendanceSettings>(key: K, value: AttendanceSettings[K]) {
    if (settings) setSettings({ ...settings, [key]: value });
  }

  if (!canView) return <Panel><EmptyState title="Attendance settings unavailable" description="Your account needs attendance.view permission." /></Panel>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div><h1 className="text-lg font-semibold">Attendance Settings</h1><p className="text-sm text-muted-foreground">Global attendance rules prepared for roster, leave, and payroll integration.</p></div>
        <AttendanceNav />
      </div>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}
      <Panel className="p-4">
        {loading || !settings ? <EmptyState title="Loading settings" description="Fetching attendance settings." /> : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Standard work minutes per day"><Input type="number" min="0" disabled={!canManage} value={settings.standard_work_minutes_per_day} onChange={(event) => update("standard_work_minutes_per_day", Number(event.target.value))} /></Field>
            <Field label="Default shift start"><Input type="time" disabled={!canManage} value={settings.default_shift_start_time ?? ""} onChange={(event) => update("default_shift_start_time", event.target.value)} /></Field>
            <Field label="Default shift end"><Input type="time" disabled={!canManage} value={settings.default_shift_end_time ?? ""} onChange={(event) => update("default_shift_end_time", event.target.value)} /></Field>
            <Field label="Late grace minutes"><Input type="number" min="0" disabled={!canManage} value={settings.late_grace_minutes} onChange={(event) => update("late_grace_minutes", Number(event.target.value))} /></Field>
            <Field label="Early checkout grace minutes"><Input type="number" min="0" disabled={!canManage} value={settings.early_checkout_grace_minutes} onChange={(event) => update("early_checkout_grace_minutes", Number(event.target.value))} /></Field>
            <Field label="Weekly off days"><Input disabled={!canManage} value={weeklyOff} onChange={(event) => setWeeklyOff(event.target.value)} placeholder="FRIDAY, SATURDAY" /></Field>
            <Field label="Default workday mode">
              <SelectField disabled={!canManage} value={settings.default_workday_mode ?? "FIXED_SHIFT"} onValueChange={(value) => update("default_workday_mode", value as AttendanceSettings["default_workday_mode"])}>
                {["FIXED_SHIFT", "ROSTER_BASED", "FLEXIBLE"].map((item) => <option key={item} value={item}>{item}</option>)}
              </SelectField>
            </Field>
            <Field label="Default attendance source">
              <SelectField disabled={!canManage} value={settings.default_attendance_source ?? "DEVICE"} onValueChange={(value) => update("default_attendance_source", value as AttendanceSettings["default_attendance_source"])}>
                {["DEVICE", "MANUAL", "MANUAL_IMPORT", "API", "BRIDGE"].map((item) => <option key={item} value={item}>{item}</option>)}
              </SelectField>
            </Field>
            <Field label="Default absent status">
              <SelectField disabled={!canManage} value={settings.default_absent_status ?? "ABSENT"} onValueChange={(value) => update("default_absent_status", value as AttendanceSettings["default_absent_status"])}>
                {["ABSENT", "MISSING_PUNCH", "PENDING_CORRECTION"].map((item) => <option key={item} value={item}>{item}</option>)}
              </SelectField>
            </Field>
            <Field label="Monthly attendance lock day"><Input type="number" min="1" max="31" disabled={!canManage} value={settings.monthly_attendance_lock_day ?? ""} onChange={(event) => update("monthly_attendance_lock_day", event.target.value === "" ? null : Number(event.target.value))} /></Field>
            <Field label="Allowed attendance sources"><Input disabled={!canManage} value={settings.attendance_source_options_json ?? ""} onChange={(event) => update("attendance_source_options_json", event.target.value)} /></Field>
            <Toggle label="Attendance module enabled" checked={Boolean(settings.module_enabled)} disabled={!canManage} onChange={(checked) => update("module_enabled", checked)} />
            <Toggle label="Mark absent if no punch" checked={Boolean(settings.mark_absent_if_no_punch)} disabled={!canManage} onChange={(checked) => update("mark_absent_if_no_punch", checked)} />
            <Toggle label="Missed punch requires correction" checked={Boolean(settings.missed_punch_requires_correction)} disabled={!canManage} onChange={(checked) => update("missed_punch_requires_correction", checked)} />
            <Toggle label="Allow manual entries" checked={Boolean(settings.allow_manual_entries)} disabled={!canManage} onChange={(checked) => update("allow_manual_entries", checked)} />
            <Toggle label="Manual entry requires approval" checked={Boolean(settings.manual_entry_requires_approval)} disabled={!canManage} onChange={(checked) => update("manual_entry_requires_approval", checked)} />
            <Toggle label="Require manual entry reason" checked={Boolean(settings.require_reason_for_manual_entries)} disabled={!canManage} onChange={(checked) => update("require_reason_for_manual_entries", checked)} />
            <Toggle label="Allow employee correction requests" checked={Boolean(settings.allow_employee_correction_requests)} disabled={!canManage} onChange={(checked) => update("allow_employee_correction_requests", checked)} />
            <Toggle label="Correction requires approval" checked={Boolean(settings.correction_requires_approval)} disabled={!canManage} onChange={(checked) => update("correction_requires_approval", checked)} />
            <Toggle label="Managers can request team corrections" checked={Boolean(settings.allow_manager_team_corrections)} disabled={!canManage} onChange={(checked) => update("allow_manager_team_corrections", checked)} />
            <Toggle label="Require correction review reason" checked={Boolean(settings.require_reason_for_correction_review)} disabled={!canManage} onChange={(checked) => update("require_reason_for_correction_review", checked)} />
            <Toggle label="Overtime tracking enabled" checked={Boolean(settings.overtime_tracking_enabled)} disabled={!canManage} onChange={(checked) => update("overtime_tracking_enabled", checked)} />
            <Toggle label="Payroll impact enabled" checked={Boolean(settings.payroll_impact_enabled)} disabled={!canManage} onChange={(checked) => update("payroll_impact_enabled", checked)} />
            <Toggle label="Lock after payroll finalized" checked={Boolean(settings.lock_after_payroll_finalized)} disabled={!canManage} onChange={(checked) => update("lock_after_payroll_finalized", checked)} />
            <Toggle label="Payroll deduction enabled" checked={Boolean(settings.payroll_deduction_enabled)} disabled={!canManage} onChange={(checked) => update("payroll_deduction_enabled", checked)} />
            <div className="md:col-span-2 xl:col-span-3 flex justify-end">{canManage ? <Button onClick={() => void save()} disabled={saving}><Save className="h-4 w-4" /> {saving ? "Saving..." : "Save settings"}</Button> : null}</div>
          </div>
        )}
      </Panel>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return <CheckboxField label={label} disabled={disabled} checked={checked} onChange={onChange} />;
}
