import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { PageShell, SelectField, CheckboxField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavSwitcher } from "../components/ui/route-nav-switcher";
import { Button, RowActionButton } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";
import { ROSTER_NAV_ITEMS } from "./rosterNav";
import type { OrganizationDepartment, OrganizationLocation } from "../types/organization";
import type { RosterSettings, ShiftTemplate, WeeklyOffRule } from "../types/roster";

const DAYS: WeeklyOffRule["day_of_week"][] = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

export function RosterSettingsPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("roster.view") || permissions.has("roster.settings.view") || permissions.has("roster.settings.manage");
  const canManage = permissions.has("roster.settings.manage") || permissions.has("roster.settings.update");
  const [settings, setSettings] = useState<RosterSettings | null>(null);
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [rules, setRules] = useState<WeeklyOffRule[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingRule, setEditingRule] = useState<WeeklyOffRule | null | undefined>(undefined);

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    try {
      const [settingsResult, templateResult, ruleResult, locationResult, departmentResult] = await Promise.all([api.getRosterSettings(token), api.listShiftTemplates(token), api.listWeeklyOffRules(token), api.listLocations(token), api.listDepartments(token)]);
      setSettings(settingsResult.settings);
      setTemplates(templateResult.shift_templates.filter((t) => Boolean(t.is_active)));
      setRules(ruleResult.rules);
      setLocations(locationResult.locations);
      setDepartments(departmentResult.departments);
    } catch (err) {
      alerts.showApiError(err, "Unable to load roster settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token, canView]);

  function update<K extends keyof RosterSettings>(key: K, value: RosterSettings[K]) {
    if (settings) setSettings({ ...settings, [key]: value });
  }

  async function save() {
    if (!token || !settings) return;
    setSaving(true);
    try {
      setSettings((await api.updateRosterSettings(token, settings)).settings);
      alerts.showSuccess("Settings saved", "Roster settings were updated.");
    } catch (err) {
      alerts.showApiError(err, "Unable to save roster settings.");
    } finally {
      setSaving(false);
    }
  }

  async function saveRule(input: Partial<WeeklyOffRule>) {
    if (!token) return;
    try {
      if (editingRule) await api.updateWeeklyOffRule(token, editingRule.id, input);
      else await api.createWeeklyOffRule(token, input);
      alerts.showSuccess("Weekly off rule saved", "The weekly off rule was saved.");
      setEditingRule(undefined);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to save weekly off rule.");
    }
  }

  async function ruleAction(rule: WeeklyOffRule, action: "enable" | "disable") {
    if (!token) return;
    try {
      await api.weeklyOffRuleAction(token, rule.id, action);
      alerts.showSuccess("Weekly off rule updated", `Rule ${action}d.`);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to update weekly off rule.");
    }
  }

  if (!canView) {
    return (
      <PageShell constrained={false}>
        <div className="flex flex-col gap-3">
          <RouteNavSwitcher items={ROSTER_NAV_ITEMS} moduleLabel="Roster" />
          <div className="min-w-0 flex-1"><Panel><EmptyState title="Roster settings unavailable" description="Your account needs roster.view permission." /></Panel></div>
        </div>
      </PageShell>
    );
  }

  const moduleEnabled = Boolean(settings?.module_enabled ?? true);
  const disabled = !canManage || !moduleEnabled;

  return (
    <PageShell constrained={false}>
      <div className="flex flex-col gap-3">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="px-4 flex items-center justify-between">
              <div>
                <RouteNavSwitcher items={ROSTER_NAV_ITEMS} moduleLabel="Roster" />
                <p className="mt-0.5 text-xs text-muted-foreground">Global weekly roster behavior and edit controls</p>
              </div>
              {canManage ? <Button size="sm" disabled={!moduleEnabled} loading={saving} onClick={() => void save()}>Save settings</Button> : null}
</div>

              <Panel className="shadow-none space-y-3 p-4">
          {loading || !settings ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 6 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : (
            <Panel className="p-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-1.5"><Label>Default week start day</Label><SelectField disabled={disabled} value={settings.default_week_start_day} onValueChange={(v) => update("default_week_start_day", v as RosterSettings["default_week_start_day"])}><option value="MONDAY">Monday</option><option value="SUNDAY">Sunday</option></SelectField></div>
                <div className="space-y-1.5"><Label>Default shift template</Label><SelectField disabled={disabled} value={settings.default_shift_template_id ?? ""} onValueChange={(v) => update("default_shift_template_id", v || null)}><option value="">No default</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.code} - {t.name}</option>)}</SelectField></div>
                <div className="space-y-1.5"><Label>Default break minutes</Label><Input disabled={disabled} type="number" min={0} value={settings.default_break_minutes ?? 60} onChange={(e) => update("default_break_minutes", Number(e.target.value))} /></div>
                <div className="space-y-1.5"><Label>Default expected work minutes</Label><Input disabled={disabled} type="number" min={0} value={settings.default_expected_work_minutes ?? 480} onChange={(e) => update("default_expected_work_minutes", Number(e.target.value))} /></div>
                <div className="space-y-1.5"><Label>Default off-day handling</Label><SelectField disabled={disabled} value={settings.default_off_day_handling_mode ?? "EXPLICIT_ONLY"} onValueChange={(v) => update("default_off_day_handling_mode", v)}><option value="EXPLICIT_ONLY">Explicit only</option><option value="WEEKLY_OFF_RULES">Weekly off rules</option></SelectField></div>
                <div className="space-y-1.5"><Label>Public holiday work assignment</Label><SelectField disabled={disabled} value={settings.public_holiday_work_assignment_mode ?? "ALLOW_EXPLICIT_SHIFT"} onValueChange={(v) => update("public_holiday_work_assignment_mode", v)}><option value="ALLOW_EXPLICIT_SHIFT">Allow explicit shift</option><option value="REQUIRE_PUBLIC_HOLIDAY_TEMPLATE">Require public holiday template</option></SelectField></div>
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                <CheckboxField disabled={disabled} label="Allow draft roster editing" checked={Boolean(settings.allow_draft_roster_editing)} onChange={(v) => update("allow_draft_roster_editing", v)} />
                <CheckboxField disabled={disabled} label="Require publish before employee visibility" checked={Boolean(settings.require_publish_before_employee_visibility)} onChange={(v) => update("require_publish_before_employee_visibility", v)} />
                <CheckboxField disabled={disabled} label="Allow unpublish before lock" checked={Boolean(settings.allow_unpublish_before_lock)} onChange={(v) => update("allow_unpublish_before_lock", v)} />
                <CheckboxField disabled={disabled} label="Allow changes after publish" checked={Boolean(settings.allow_changes_after_publish ?? settings.allow_published_roster_edits)} onChange={(v) => update("allow_changes_after_publish", v)} />
                <CheckboxField disabled={disabled} label="Require reason after publish" checked={Boolean(settings.require_reason_for_changes_after_publish ?? settings.require_reason_for_published_edits)} onChange={(v) => update("require_reason_for_changes_after_publish", v)} />
                <CheckboxField disabled={disabled} label="Allow roster lock" checked={Boolean(settings.allow_roster_lock)} onChange={(v) => update("allow_roster_lock", v)} />
                <CheckboxField disabled={disabled} label="Lock after attendance/payroll placeholder" checked={Boolean(settings.lock_roster_after_attendance_payroll_placeholder)} onChange={(v) => update("lock_roster_after_attendance_payroll_placeholder", v)} />
                <CheckboxField disabled={disabled} label="Allow shift overlap warnings" checked={Boolean(settings.allow_shift_overlap_warnings)} onChange={(v) => update("allow_shift_overlap_warnings", v)} />
                <CheckboxField disabled={disabled} label="Block overlapping shifts by default" checked={Boolean(settings.block_overlapping_shifts_by_default)} onChange={(v) => update("block_overlapping_shifts_by_default", v)} />
                <CheckboxField disabled={disabled} label="Allow cross-worksite with permission" checked={Boolean(settings.allow_cross_worksite_assignment_with_permission)} onChange={(v) => update("allow_cross_worksite_assignment_with_permission", v)} />
                <CheckboxField disabled={disabled} label="Roster-aware attendance" checked={Boolean(settings.roster_aware_attendance_enabled)} onChange={(v) => update("roster_aware_attendance_enabled", v)} />
                <CheckboxField disabled={disabled} label="Roster-aware leave counting" checked={Boolean(settings.roster_aware_leave_counting_enabled)} onChange={(v) => update("roster_aware_leave_counting_enabled", v)} />
                <CheckboxField disabled={disabled} label="Employee self-service roster visibility" checked={Boolean(settings.employee_self_service_roster_visibility_enabled)} onChange={(v) => update("employee_self_service_roster_visibility_enabled", v)} />
                <CheckboxField disabled={disabled} label="Manager team roster visibility" checked={Boolean(settings.manager_team_roster_visibility_enabled)} onChange={(v) => update("manager_team_roster_visibility_enabled", v)} />
                <CheckboxField disabled={disabled} label="Copy previous week enabled" checked={Boolean(settings.copy_previous_week_enabled)} onChange={(v) => update("copy_previous_week_enabled", v)} />
                <CheckboxField disabled={disabled} label="Bulk assignment enabled" checked={Boolean(settings.bulk_assignment_enabled)} onChange={(v) => update("bulk_assignment_enabled", v)} />
                <CheckboxField disabled={disabled} label="Show leave on roster" checked={Boolean(settings.show_leave_on_roster)} onChange={(v) => update("show_leave_on_roster", v)} />
                <CheckboxField disabled={disabled} label="Show attendance on roster" checked={Boolean(settings.show_attendance_on_roster)} onChange={(v) => update("show_attendance_on_roster", v)} />
              </div>
            </Panel>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-950">Weekly off rules</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">Foundation rules by location and department. Automatic scheduling can use these later.</p>
              </div>
              {canManage ? <Button size="sm" disabled={!moduleEnabled} onClick={() => setEditingRule(null)}><Plus className="h-4 w-4" /> Add rule</Button> : null}
            </div>
            {!loading && rules.length === 0 ? (
              <Panel><EmptyState title="No weekly off rules" description="Create a simple weekly off rule for location or department foundations." /></Panel>
            ) : (
              <div className="flex flex-col gap-2">
                {rules.map((rule) => (
                  <Panel key={rule.id} className="flex items-center gap-3.5 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-950">{rule.day_of_week}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{rule.location_name ?? "All locations"} · {rule.department_name ?? "All departments"}</p>
                    </div>
                    <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: rule.is_active ? "#EAF3DE" : "#F7F7FB", color: rule.is_active ? "#27500A" : "#6B6F86" }}>{rule.is_active ? "Active" : "Inactive"}</span>
                    {canManage ? (
                      <div className="flex shrink-0 gap-1.5">
                        <RowActionButton intent="edit" size="sm" title="Edit rule" disabled={!moduleEnabled} onClick={() => setEditingRule(rule)}>Edit</RowActionButton>
                        <Button size="sm" variant={rule.is_active ? "danger" : "primary"} disabled={!moduleEnabled} onClick={() => void ruleAction(rule, rule.is_active ? "disable" : "enable")}>{rule.is_active ? "Disable" : "Enable"}</Button>
                      </div>
                    ) : null}
                  </Panel>
                ))}
              </div>
            )}
          </div>

              </Panel>
        </div>
      </div>

      {editingRule !== undefined ? <WeeklyOffRuleModal rule={editingRule ?? undefined} locations={locations} departments={departments} onClose={() => setEditingRule(undefined)} onSave={(input) => void saveRule(input)} /> : null}
    </PageShell>
  );
}

function WeeklyOffRuleModal({ rule, locations, departments, onClose, onSave }: { rule?: WeeklyOffRule; locations: OrganizationLocation[]; departments: OrganizationDepartment[]; onClose: () => void; onSave: (input: Partial<WeeklyOffRule>) => void }) {
  const [locationId, setLocationId] = useState(rule?.location_id ?? "");
  const [departmentId, setDepartmentId] = useState(rule?.department_id ?? "");
  const [dayOfWeek, setDayOfWeek] = useState<WeeklyOffRule["day_of_week"]>(rule?.day_of_week ?? "FRIDAY");
  const [isActive, setIsActive] = useState(Boolean(rule?.is_active ?? true));

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>{rule ? "Edit weekly off rule" : "Create weekly off rule"}</DialogTitle></DialogHeader>
        <DialogBody>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Location</Label><SelectField value={locationId} onValueChange={setLocationId}><option value="">All locations</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>Department</Label><SelectField value={departmentId} onValueChange={setDepartmentId}><option value="">All departments</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>Day of week</Label><SelectField value={dayOfWeek} onValueChange={(v) => setDayOfWeek(v as WeeklyOffRule["day_of_week"])}>{DAYS.map((d) => <option key={d} value={d}>{d}</option>)}</SelectField></div>
            <div className="flex items-end pb-1"><CheckboxField label="Active" checked={isActive} onChange={setIsActive} /></div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => onSave({ location_id: locationId || null, department_id: departmentId || null, day_of_week: dayOfWeek, is_active: isActive })}>Save rule</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
