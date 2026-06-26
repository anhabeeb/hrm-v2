import { Edit, Plus, Save } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { RosterNav } from "../components/roster/RosterNav";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Label } from "../components/ui/label";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import type { OrganizationDepartment, OrganizationLocation } from "../types/organization";
import type { RosterSettings, ShiftTemplate, WeeklyOffRule } from "../types/roster";
import { CheckboxField, InputField, SelectField } from "../components/ui/page-shell";

const days: WeeklyOffRule["day_of_week"][] = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

export function RosterSettingsPage() {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("roster.view") || permissions.has("roster.settings.view") || permissions.has("roster.settings.manage");
  const canManage = permissions.has("roster.settings.manage") || permissions.has("roster.settings.update");
  const [settings, setSettings] = useState<RosterSettings | null>(null);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [rules, setRules] = useState<WeeklyOffRule[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [editingRule, setEditingRule] = useState<WeeklyOffRule | null | undefined>(undefined);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    setError(null);
    try {
      const [settingsResult, templateResult, ruleResult, locationResult, departmentResult] = await Promise.all([api.getRosterSettings(token), api.listShiftTemplates(token), api.listWeeklyOffRules(token), api.listLocations(token), api.listDepartments(token)]);
      setSettings(settingsResult.settings);
      setTemplates(templateResult.shift_templates.filter((template) => Boolean(template.is_active)));
      setRules(ruleResult.rules);
      setLocations(locationResult.locations);
      setDepartments(departmentResult.departments);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load roster settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, canView]);

  function update<K extends keyof RosterSettings>(key: K, value: RosterSettings[K]) {
    if (settings) setSettings({ ...settings, [key]: value });
  }

  async function save() {
    if (!token || !settings) return;
    setError(null);
    setMessage(null);
    try {
      setSettings((await api.updateRosterSettings(token, settings)).settings);
      setMessage("Roster settings saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save roster settings.");
    }
  }

  async function saveRule(input: Partial<WeeklyOffRule>) {
    if (!token) return;
    setError(null);
    setMessage(null);
    try {
      if (editingRule) await api.updateWeeklyOffRule(token, editingRule.id, input);
      else await api.createWeeklyOffRule(token, input);
      setEditingRule(undefined);
      setMessage("Weekly off rule saved.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save weekly off rule.");
    }
  }

  async function ruleAction(rule: WeeklyOffRule, action: "enable" | "disable") {
    if (!token) return;
    try {
      await api.weeklyOffRuleAction(token, rule.id, action);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update weekly off rule.");
    }
  }

  if (!canView) return <Panel><EmptyState title="Roster settings unavailable" description="Your account needs roster.view permission." /></Panel>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div><h1 className="text-lg font-semibold">Roster Settings</h1><p className="text-sm text-muted-foreground">Global weekly roster behavior and edit controls.</p></div>
        <RosterNav />
      </div>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}
      <Panel className="p-4">
        {loading || !settings ? <EmptyState title="Loading roster settings" description="Fetching roster configuration." /> : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Default week start day">
              <SelectField disabled={!canManage} className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={settings.default_week_start_day} onChange={(event) => update("default_week_start_day", event.target.value as RosterSettings["default_week_start_day"])}>
                <option value="MONDAY">Monday</option>
                <option value="SUNDAY">Sunday</option>
              </SelectField>
            </Field>
            <Field label="Default shift template">
              <SelectField disabled={!canManage} className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={settings.default_shift_template_id ?? ""} onChange={(event) => update("default_shift_template_id", event.target.value || null)}>
                <option value="">No default</option>
                {templates.map((template) => <option key={template.id} value={template.id}>{template.code} - {template.name}</option>)}
              </SelectField>
            </Field>
            <Toggle disabled={!canManage} label="Roster module enabled" checked={Boolean(settings.module_enabled)} onChange={(value) => update("module_enabled", value)} />
            <Toggle disabled={!canManage} label="Allow draft roster editing" checked={Boolean(settings.allow_draft_roster_editing)} onChange={(value) => update("allow_draft_roster_editing", value)} />
            <Toggle disabled={!canManage} label="Require publish before employee visibility" checked={Boolean(settings.require_publish_before_employee_visibility)} onChange={(value) => update("require_publish_before_employee_visibility", value)} />
            <Toggle disabled={!canManage} label="Allow unpublish before lock" checked={Boolean(settings.allow_unpublish_before_lock)} onChange={(value) => update("allow_unpublish_before_lock", value)} />
            <Toggle disabled={!canManage} label="Allow changes after publish" checked={Boolean(settings.allow_changes_after_publish ?? settings.allow_published_roster_edits)} onChange={(value) => update("allow_changes_after_publish", value)} />
            <Toggle disabled={!canManage} label="Require reason after publish" checked={Boolean(settings.require_reason_for_changes_after_publish ?? settings.require_reason_for_published_edits)} onChange={(value) => update("require_reason_for_changes_after_publish", value)} />
            <Toggle disabled={!canManage} label="Allow roster lock" checked={Boolean(settings.allow_roster_lock)} onChange={(value) => update("allow_roster_lock", value)} />
            <Toggle disabled={!canManage} label="Lock after attendance/payroll placeholder" checked={Boolean(settings.lock_roster_after_attendance_payroll_placeholder)} onChange={(value) => update("lock_roster_after_attendance_payroll_placeholder", value)} />
            <Toggle disabled={!canManage} label="Allow shift overlap warnings" checked={Boolean(settings.allow_shift_overlap_warnings)} onChange={(value) => update("allow_shift_overlap_warnings", value)} />
            <Toggle disabled={!canManage} label="Block overlapping shifts by default" checked={Boolean(settings.block_overlapping_shifts_by_default)} onChange={(value) => update("block_overlapping_shifts_by_default", value)} />
            <Toggle disabled={!canManage} label="Allow cross-worksite with permission" checked={Boolean(settings.allow_cross_worksite_assignment_with_permission)} onChange={(value) => update("allow_cross_worksite_assignment_with_permission", value)} />
            <Toggle disabled={!canManage} label="Roster-aware attendance" checked={Boolean(settings.roster_aware_attendance_enabled)} onChange={(value) => update("roster_aware_attendance_enabled", value)} />
            <Toggle disabled={!canManage} label="Roster-aware leave counting" checked={Boolean(settings.roster_aware_leave_counting_enabled)} onChange={(value) => update("roster_aware_leave_counting_enabled", value)} />
            <Toggle disabled={!canManage} label="Employee self-service roster visibility" checked={Boolean(settings.employee_self_service_roster_visibility_enabled)} onChange={(value) => update("employee_self_service_roster_visibility_enabled", value)} />
            <Toggle disabled={!canManage} label="Manager team roster visibility" checked={Boolean(settings.manager_team_roster_visibility_enabled)} onChange={(value) => update("manager_team_roster_visibility_enabled", value)} />
            <Toggle disabled={!canManage} label="Copy previous week enabled" checked={Boolean(settings.copy_previous_week_enabled)} onChange={(value) => update("copy_previous_week_enabled", value)} />
            <Toggle disabled={!canManage} label="Bulk assignment enabled" checked={Boolean(settings.bulk_assignment_enabled)} onChange={(value) => update("bulk_assignment_enabled", value)} />
            <Field label="Default break minutes"><InputField disabled={!canManage} type="number" min="0" value={settings.default_break_minutes ?? 60} onChange={(event) => update("default_break_minutes", Number(event.target.value))} /></Field>
            <Field label="Default expected work minutes"><InputField disabled={!canManage} type="number" min="0" value={settings.default_expected_work_minutes ?? 480} onChange={(event) => update("default_expected_work_minutes", Number(event.target.value))} /></Field>
            <Field label="Default off-day handling">
              <SelectField disabled={!canManage} className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={settings.default_off_day_handling_mode ?? "EXPLICIT_ONLY"} onChange={(event) => update("default_off_day_handling_mode", event.target.value)}>
                <option value="EXPLICIT_ONLY">Explicit only</option>
                <option value="WEEKLY_OFF_RULES">Weekly off rules</option>
              </SelectField>
            </Field>
            <Field label="Public holiday work assignment">
              <SelectField disabled={!canManage} className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={settings.public_holiday_work_assignment_mode ?? "ALLOW_EXPLICIT_SHIFT"} onChange={(event) => update("public_holiday_work_assignment_mode", event.target.value)}>
                <option value="ALLOW_EXPLICIT_SHIFT">Allow explicit shift</option>
                <option value="REQUIRE_PUBLIC_HOLIDAY_TEMPLATE">Require public holiday template</option>
              </SelectField>
            </Field>
            <Toggle disabled={!canManage} label="Allow published roster edits" checked={Boolean(settings.allow_published_roster_edits)} onChange={(value) => update("allow_published_roster_edits", value)} />
            <Toggle disabled={!canManage} label="Require reason for published edits" checked={Boolean(settings.require_reason_for_published_edits)} onChange={(value) => update("require_reason_for_published_edits", value)} />
            <Toggle disabled={!canManage} label="Show leave on roster" checked={Boolean(settings.show_leave_on_roster)} onChange={(value) => update("show_leave_on_roster", value)} />
            <Toggle disabled={!canManage} label="Show attendance on roster" checked={Boolean(settings.show_attendance_on_roster)} onChange={(value) => update("show_attendance_on_roster", value)} />
            <div className="flex justify-end md:col-span-2 xl:col-span-3">{canManage ? <Button onClick={() => void save()}><Save className="h-4 w-4" /> Save settings</Button> : null}</div>
          </div>
        )}
      </Panel>
      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Weekly off rules</h2>
            <p className="text-xs text-muted-foreground">Foundation rules by location and department. Automatic scheduling can use these later.</p>
          </div>
          {canManage ? <Button size="sm" onClick={() => setEditingRule(null)}><Plus className="h-4 w-4" /> Add rule</Button> : null}
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Location</TableHead><TableHead>Department</TableHead><TableHead>Day of week</TableHead><TableHead>Status</TableHead>{canManage ? <TableHead className="text-right">Actions</TableHead> : null}</TableRow></TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell>{rule.location_name ?? "All locations"}</TableCell>
                  <TableCell>{rule.department_name ?? "All departments"}</TableCell>
                  <TableCell>{rule.day_of_week}</TableCell>
                  <TableCell><Badge tone={rule.is_active ? "success" : "neutral"}>{rule.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                  {canManage ? <TableCell><div className="flex justify-end gap-1"><Button title="Edit rule" variant="ghost" size="icon" onClick={() => setEditingRule(rule)}><Edit className="h-4 w-4" /></Button><Button variant="ghost" size="sm" onClick={() => void ruleAction(rule, rule.is_active ? "disable" : "enable")}>{rule.is_active ? "Disable" : "Enable"}</Button></div></TableCell> : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {!loading && rules.length === 0 ? <EmptyState title="No weekly off rules" description="Create a simple weekly off rule for location or department foundations." /> : null}
      </Panel>
      {editingRule !== undefined ? <WeeklyOffRuleModal rule={editingRule ?? undefined} locations={locations} departments={departments} onClose={() => setEditingRule(undefined)} onSave={(input) => void saveRule(input)} /> : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return <CheckboxField label={label} disabled={disabled} checked={checked} onChange={onChange} />;
}

function WeeklyOffRuleModal({ rule, locations, departments, onClose, onSave }: { rule?: WeeklyOffRule; locations: OrganizationLocation[]; departments: OrganizationDepartment[]; onClose: () => void; onSave: (input: Partial<WeeklyOffRule>) => void }) {
  const [form, setForm] = useState<Partial<WeeklyOffRule>>({
    location_id: rule?.location_id ?? null,
    department_id: rule?.department_id ?? null,
    day_of_week: rule?.day_of_week ?? "FRIDAY",
    is_active: rule?.is_active ?? true
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4">
      <div className="w-full max-w-lg rounded-lg border bg-white shadow-xl">
        <div className="border-b px-4 py-3"><h2 className="text-sm font-semibold">{rule ? "Edit weekly off rule" : "Create weekly off rule"}</h2></div>
        <div className="grid gap-3 p-4">
          <Field label="Location">
            <SelectField className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={form.location_id ?? ""} onChange={(event) => setForm({ ...form, location_id: event.target.value || null })}>
              <option value="">All locations</option>
              {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </SelectField>
          </Field>
          <Field label="Department">
            <SelectField className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={form.department_id ?? ""} onChange={(event) => setForm({ ...form, department_id: event.target.value || null })}>
              <option value="">All departments</option>
              {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
            </SelectField>
          </Field>
          <Field label="Day of week">
            <SelectField className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={form.day_of_week} onChange={(event) => setForm({ ...form, day_of_week: event.target.value as WeeklyOffRule["day_of_week"] })}>
              {days.map((day) => <option key={day} value={day}>{day}</option>)}
            </SelectField>
          </Field>
          <CheckboxField label="Active" checked={Boolean(form.is_active)} onChange={(checked) => setForm({ ...form, is_active: checked })} />
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={() => onSave(form)}>Save rule</Button></div>
      </div>
    </div>
  );
}
