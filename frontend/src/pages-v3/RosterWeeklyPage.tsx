import { Fragment, useEffect, useMemo, useState } from "react";
import { ClipboardCopy, Plus } from "lucide-react";
import { PageShell, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { EmptyState } from "../components/ui/empty-state";
import { RosterAssignmentModal } from "../components/roster/RosterAssignmentModal";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { ApiError, api } from "../lib/api";
import type { OrganizationDepartment, OrganizationLocation } from "../types/organization";
import type { RosterAssignment, RosterEmployeeRow, ShiftTemplate, WeeklyOffRule, WeeklyRoster } from "../types/roster";

function text(value: unknown, fallback = "") {
  const s = value === null || value === undefined ? "" : String(value);
  return s && s !== "null" && s !== "undefined" ? s : fallback;
}

const AVATAR_COLOR_PALETTE = [
  { bg: "#E6F1FB", text: "#0C447C" },
  { bg: "#FBEAF0", text: "#72243E" },
  { bg: "#FAEEDA", text: "#854F0B" },
  { bg: "#EAF3DE", text: "#27500A" },
  { bg: "#EEEDFE", text: "#534AB7" },
  { bg: "#FCEBEB", text: "#A32D2D" }
];
function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  return (`${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`).toUpperCase() || "E";
}
function colorFor(name: string) {
  const hash = name.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_COLOR_PALETTE[hash % AVATAR_COLOR_PALETTE.length];
}

function mondayOf(date: Date) {
  const copy = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = copy.getUTCDay();
  copy.setUTCDate(copy.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return copy.toISOString().slice(0, 10);
}
function addDaysIso(dateIso: string, days: number) {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function dayOfWeekName(dateIso: string) {
  const names = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;
  return names[new Date(`${dateIso}T00:00:00Z`).getUTCDay()];
}
function cellKey(employeeId: string, date: string) {
  return `${employeeId}:${date}`;
}

const shiftStatuses = new Set(["SCHEDULED", "DRAFT", "PUBLISHED", "CHANGED_AFTER_PUBLISH"]);
const offStatuses = new Set(["DAY_OFF", "OFF"]);
const leaveStatuses = new Set(["LEAVE", "SICK_LEAVE", "LONG_LEAVE"]);

function cellVisual(assignment: Partial<RosterAssignment> | undefined, shiftTemplates: ShiftTemplate[]) {
  const status = String(assignment?.status ?? "UNASSIGNED");
  const template = assignment?.shift_template_id ? shiftTemplates.find((t) => t.id === assignment.shift_template_id) : undefined;
  const overnight = template ? Boolean(template.is_overnight) : false;
  if (shiftStatuses.has(status)) {
    if (overnight) return { bg: "#FCEBEB", color: "#A32D2D" };
    return { bg: "#EAF3DE", color: "#27500A" };
  }
  if (leaveStatuses.has(status)) return { bg: "#E6F1FB", color: "#0C447C" };
  if (status === "CONFLICT" || status === "CHANGED_AFTER_PUBLISH") return { bg: "#FAEEDA", color: "#854F0B" };
  return { bg: "#F7F7FB", color: "#9A9DB0" };
}

function cellLabel(assignment: Partial<RosterAssignment> | undefined) {
  const status = String(assignment?.status ?? "UNASSIGNED");
  if (shiftStatuses.has(status)) {
    const start = assignment?.custom_start_time ?? assignment?.shift_start_time;
    const end = assignment?.custom_end_time ?? assignment?.shift_end_time;
    if (start && end) return `${String(start).slice(0, 5)}-${String(end).slice(0, 5)}`;
    return assignment?.shift_code ?? "Shift";
  }
  if (offStatuses.has(status)) return "Off";
  if (leaveStatuses.has(status)) return "Leave";
  if (status === "PUBLIC_HOLIDAY") return "Holiday";
  if (status === "UNASSIGNED") return "—";
  return status.replace(/_/g, " ");
}

export function RosterWeeklyPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("roster.view");
  const canManage = permissions.has("roster.manage") || permissions.has("roster.assignments.manage") || permissions.has("roster.assignments.update") || permissions.has("roster.assignments.bulk_update");
  const canPublish = permissions.has("roster.publish") || permissions.has("roster.periods.publish");

  const defaultWeekStart = useMemo(() => mondayOf(new Date()), []);
  const [weekStart, setWeekStart] = useState(defaultWeekStart);
  const [departmentId, setDepartmentId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);

  const [weekly, setWeekly] = useState<WeeklyRoster | null>(null);
  const [changeRequests, setChangeRequests] = useState<Record<string, unknown>[]>([]);
  const [decidingRequestId, setDecidingRequestId] = useState<string | null>(null);
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [draft, setDraft] = useState<Record<string, Partial<RosterAssignment>>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [quickPicker, setQuickPicker] = useState<{ employee: RosterEmployeeRow; date: string } | null>(null);
  const [detailEditing, setDetailEditing] = useState<{ employee: RosterEmployeeRow; date: string; assignment: Partial<RosterAssignment> } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);

  const filters = useMemo(() => ({ week_start_date: weekStart, department_id: departmentId || undefined, location_id: locationId || undefined }), [weekStart, departmentId, locationId]);

  const canManageChangeRequests = permissions.has("roster.change_requests.manage") || permissions.has("roster.manage");

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    setError(null);
    try {
      const [weeklyResult, departmentResult, locationResult, changeRequestsResult] = await Promise.all([
        api.getWeeklyRoster(token, filters),
        api.listDepartments(token),
        api.listLocations(token),
        api.getRosterChangeRequests(token, { status: "PENDING_MANAGER" }).catch(() => ({ requests: [] as Record<string, unknown>[] }))
      ]);
      setWeekly(weeklyResult);
      setDepartments(departmentResult.departments);
      setLocations(locationResult.locations);
      setDraft(weeklyResult.assignment_map ?? {});
      setDirty(new Set());
      setChangeRequests(changeRequestsResult.requests);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load weekly roster.");
    } finally {
      setLoading(false);
    }
  }

  async function decideChangeRequest(requestId: string, decision: "APPROVED" | "REJECTED") {
    if (!token) return;
    setDecidingRequestId(requestId);
    try {
      await api.decideRosterChangeRequest(token, requestId, { decision });
      alerts.showSuccess(decision === "APPROVED" ? "Request approved" : "Request rejected", "");
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to decide this request.");
    } finally {
      setDecidingRequestId(null);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, canView, weekStart, departmentId, locationId]);

  if (!canView) {
    return <PageShell constrained={false}><Panel className="p-4"><EmptyState title="Roster unavailable" description="Your account needs roster.view permission." /></Panel></PageShell>;
  }

  const days = weekly?.days ?? [];
  const employees = weekly?.employees ?? [];
  const shiftTemplates = weekly?.shift_templates ?? [];
  const hasPeriod = Boolean(weekly?.period);
  const periodStatus = text(weekly?.period?.status, "DRAFT");

  function setCell(employeeId: string, date: string, patch: Partial<RosterAssignment>) {
    const key = cellKey(employeeId, date);
    setDraft((current) => ({ ...current, [key]: { ...current[key], employee_id: employeeId, roster_date: date, ...patch } }));
    setDirty((current) => new Set(current).add(key));
  }

  async function saveDirty() {
    if (!token || dirty.size === 0) return;
    setSaving(true);
    try {
      const assignments = Array.from(dirty).map((key) => draft[key]).filter(Boolean);
      const result = await api.saveWeeklyRoster(token, { week_start_date: weekStart, location_id: locationId || null, department_id: departmentId || null, reason: "", assignments });
      alerts.showSuccess("Roster saved", `${result.assignments.length} assignment(s) updated${result.warnings.length ? ` · ${result.warnings.length} warning(s)` : ""}.`);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to save roster.");
    } finally {
      setSaving(false);
    }
  }

  async function copyPrevious() {
    if (!token) return;
    try {
      const result = await api.copyPreviousRosterWeek(token, { target_week_start_date: weekStart, location_id: locationId || null, department_id: departmentId || null, overwrite_existing: false });
      alerts.showSuccess("Copied", `${result.copied} assignment(s) copied from the previous week.`);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to copy previous week.");
    }
  }

  const warnings = useMemo(() => {
    const list: Array<{ employee: string; day: string }> = [];
    for (const employee of employees) {
      for (const day of days) {
        const status = String(draft[cellKey(employee.employee_id, day.date)]?.status ?? "UNASSIGNED");
        if (status === "UNASSIGNED") { list.push({ employee: employee.full_name, day: day.label }); break; }
      }
    }
    return list;
  }, [employees, days, draft]);
  const shiftTypeCount = useMemo(() => new Set(Object.values(draft).map((a) => a.shift_template_id).filter(Boolean)).size, [draft]);

  async function doPublish() {
    if (!token) return;
    try {
      const period = weekly?.period ?? (await api.createRosterPeriod(token, { week_start_date: weekStart, location_id: locationId || null, department_id: departmentId || null })).period;
      await api.publishRosterPeriod(token, period.id);
      alerts.showSuccess("Roster published", "Employees can now see this week's schedule.");
      setPublishOpen(false);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to publish roster.");
    }
  }

  return (
    <PageShell constrained={false}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-medium text-slate-950">Weekly roster</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{hasPeriod ? `${periodStatus === "PUBLISHED" ? "Published" : "Draft · not yet visible to employees"}` : "No roster yet for this week"}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs text-muted-foreground shadow-panel">
              <button type="button" onClick={() => setWeekStart(addDaysIso(weekStart, -7))}>←</button>
              {weekStart} – {addDaysIso(weekStart, 6)}
              <button type="button" onClick={() => setWeekStart(addDaysIso(weekStart, 7))}>→</button>
            </div>
            {hasPeriod && canPublish && periodStatus !== "PUBLISHED" ? <Button size="sm" onClick={() => setPublishOpen(true)}>Publish roster</Button> : null}
          </div>
        </div>

        <Panel className="flex flex-wrap items-center gap-3.5 p-3">
          <select className="bg-transparent text-xs text-muted-foreground outline-none" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="">Department</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select className="bg-transparent text-xs text-muted-foreground outline-none" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">Outlet/location</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <button type="button" onClick={() => setMoreOpen((v) => !v)} className="ml-auto flex items-center gap-1.5 rounded-md border border-[#D3D3E3] px-2.5 py-1.5 text-xs text-muted-foreground">
            More filters
          </button>
          {moreOpen ? <p className="w-full border-t border-[#E7E7F1] pt-2.5 text-xs text-muted-foreground">Additional filtering by job level, position, and status is available from the full Roster view.</p> : null}
        </Panel>

        {error ? <Panel className="p-3 text-xs text-[#A32D2D]">{error}</Panel> : null}

        {canManageChangeRequests && changeRequests.length ? (
          <Panel className="overflow-hidden">
            <div className="flex items-center gap-2.5 border-b px-4 py-3">
              <div className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-md bg-[#FAEEDA]"><ClipboardCopy className="h-3.5 w-3.5 text-[#854F0B]" /></div>
              <p className="text-xs font-medium text-slate-950">Pending change requests</p>
              <Badge tone="warning" className="ml-auto">{changeRequests.length} awaiting your review</Badge>
            </div>
            <div className="flex flex-col">
              {changeRequests.map((r, i) => {
                const isSwap = text(r.request_type) === "SWAP";
                const summary = isSwap
                  ? `Requesting to swap ${text(r.roster_date)} with ${text(r.swap_with_employee_name, "a colleague")}`
                  : `Requesting ${text(r.roster_date)} shift moved from ${text(r.current_start_time, "off") || "off"}${r.current_start_time ? `–${text(r.current_end_time)}` : ""}${r.current_location_name ? ` (${text(r.current_location_name)})` : ""} to ${text(r.requested_start_time, "off") || "off"}${r.requested_start_time ? `–${text(r.requested_end_time)}` : ""}${r.requested_location_name ? ` (${text(r.requested_location_name)})` : ""}`;
                const deciding = decidingRequestId === String(r.id);
                return (
                  <div key={String(r.id ?? i)} className="flex items-center gap-3 border-b border-[#F1F1F7] px-4 py-3 last:border-b-0">
                    <div className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-[#E6F1FB] text-[11px] font-medium text-[#0C447C]">{initialsOf(text(r.employee_name, "?"))}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-950">{text(r.employee_name)}</p>
                      <p className="mt-0.5 text-[9px] text-muted-foreground">{summary}</p>
                      <p className="mt-0.5 text-[8px] text-muted-foreground">Reason: "{text(r.reason)}"</p>
                    </div>
                    <Button size="sm" variant="outline" className="border-[#F09595] text-[#A32D2D] hover:bg-[#FCEBEB]" loading={deciding} onClick={() => void decideChangeRequest(String(r.id), "REJECTED")}>Reject</Button>
                    <Button size="sm" loading={deciding} onClick={() => void decideChangeRequest(String(r.id), "APPROVED")}>Approve</Button>
                  </div>
                );
              })}
            </div>
          </Panel>
        ) : null}

        {loading ? (
          <div className="flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
        ) : !hasPeriod ? (
          <Panel className="flex flex-col items-center gap-2 p-8 text-center">
            <p className="text-xs font-medium text-slate-950">No roster created for this week</p>
            <p className="text-[11px] text-muted-foreground">Start from scratch, or copy last week's schedule as a starting point</p>
            {canManage ? (
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => void copyPrevious()}><ClipboardCopy className="h-3.5 w-3.5" /> Copy last week</Button>
                <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-3.5 w-3.5" /> Create roster</Button>
              </div>
            ) : null}
          </Panel>
        ) : employees.length === 0 ? (
          <Panel className="p-4"><EmptyState title="No roster-eligible employees found" description="Adjust filters, or mark employees as roster eligible with an active status." /></Panel>
        ) : (
          <>
            <Panel className="overflow-x-auto p-3.5">
              <div className="grid min-w-[720px] gap-1.5" style={{ gridTemplateColumns: `160px repeat(${days.length},1fr)` }}>
                <div />
                {days.map((day) => (
                  <span key={day.date} className="text-center text-[9px] font-medium text-muted-foreground">{day.label.slice(0, 3).toUpperCase()} {day.date.slice(8, 10)}</span>
                ))}
                {employees.map((employee) => (
                  <Fragment key={employee.employee_id}>
                    <div className="flex items-center gap-2 py-1.5">
                      <div className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full text-[9px] font-medium" style={{ background: colorFor(employee.full_name).bg, color: colorFor(employee.full_name).text }}>{initialsOf(employee.full_name)}</div>
                      <span className="truncate text-[10px] text-slate-950">{employee.full_name}</span>
                    </div>
                    {days.map((day) => {
                      const assignment = draft[cellKey(employee.employee_id, day.date)];
                      const visual = cellVisual(assignment, shiftTemplates);
                      return (
                        <button
                          key={`${employee.employee_id}-${day.date}`}
                          type="button"
                          disabled={!canManage}
                          onClick={() => setQuickPicker({ employee, date: day.date })}
                          className="rounded-md py-1.5 text-center text-[9px] font-medium disabled:cursor-default"
                          style={{ background: visual.bg, color: visual.color }}
                        >
                          {cellLabel(assignment)}
                        </button>
                      );
                    })}
                  </Fragment>
                ))}
              </div>
            </Panel>

            <div className="flex flex-wrap items-center gap-3.5 text-[10px] text-muted-foreground">
              <span><span className="mr-1.5 inline-block h-2 w-2 rounded-[2px]" style={{ background: "#EAF3DE", border: "1px solid #C0DD97" }} />Scheduled</span>
              <span><span className="mr-1.5 inline-block h-2 w-2 rounded-[2px]" style={{ background: "#FCEBEB", border: "1px solid #F09595" }} />Night shift</span>
              <span><span className="mr-1.5 inline-block h-2 w-2 rounded-[2px]" style={{ background: "#E6F1FB", border: "1px solid #85B7EB" }} />On leave</span>
              <span><span className="mr-1.5 inline-block h-2 w-2 rounded-[2px]" style={{ background: "#F7F7FB", border: "1px solid #E7E7F1" }} />Day off</span>
            </div>

            {canManage ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge tone={periodStatus === "PUBLISHED" ? "success" : "warning"}>{periodStatus}</Badge>
                  <span className="text-xs text-muted-foreground">{dirty.size} unsaved cell(s)</span>
                </div>
                {dirty.size ? <Button size="sm" loading={saving} onClick={() => void saveDirty()}>Save changes</Button> : null}
              </div>
            ) : null}
          </>
        )}
      </div>

      {quickPicker ? (
        <QuickShiftPickerDialog
          employee={quickPicker.employee}
          date={quickPicker.date}
          shiftTemplates={shiftTemplates}
          current={draft[cellKey(quickPicker.employee.employee_id, quickPicker.date)]}
          onClose={() => setQuickPicker(null)}
          onPick={(patch) => { setCell(quickPicker.employee.employee_id, quickPicker.date, patch); setQuickPicker(null); }}
          onMoreOptions={() => {
            const employee = quickPicker.employee;
            const date = quickPicker.date;
            setDetailEditing({ employee, date, assignment: draft[cellKey(employee.employee_id, date)] ?? { employee_id: employee.employee_id, roster_date: date, status: "UNASSIGNED" } });
            setQuickPicker(null);
          }}
        />
      ) : null}

      {detailEditing ? (
        <RosterAssignmentModal
          title="Edit roster assignment"
          subtitle={`${detailEditing.employee.employee_no} · ${detailEditing.employee.full_name} · ${detailEditing.date}`}
          assignment={detailEditing.assignment}
          shiftTemplates={shiftTemplates}
          requireReason={periodStatus === "PUBLISHED"}
          onClose={() => setDetailEditing(null)}
          onSave={async (input) => {
            setCell(detailEditing.employee.employee_id, detailEditing.date, input);
            setDetailEditing(null);
          }}
        />
      ) : null}

      {createOpen ? (
        <CreateRosterDialog
          weekStart={weekStart}
          departmentName={departments.find((d) => d.id === departmentId)?.name}
          locationName={locations.find((l) => l.id === locationId)?.name}
          departmentId={departmentId}
          locationId={locationId}
          employees={employees}
          departments={departments}
          locations={locations}
          shiftTemplates={shiftTemplates}
          days={days}
          onClose={() => setCreateOpen(false)}
          onCreated={async () => { setCreateOpen(false); await load(); }}
        />
      ) : null}

      {publishOpen ? (
        <PublishRosterDialog
          weekStart={weekStart}
          employeeCount={employees.length}
          shiftTypeCount={shiftTypeCount}
          warnings={warnings}
          onClose={() => setPublishOpen(false)}
          onPublish={() => void doPublish()}
        />
      ) : null}
    </PageShell>
  );
}

function QuickShiftPickerDialog({ employee, date, shiftTemplates, current, onClose, onPick, onMoreOptions }: {
  employee: RosterEmployeeRow;
  date: string;
  shiftTemplates: ShiftTemplate[];
  current: Partial<RosterAssignment> | undefined;
  onClose: () => void;
  onPick: (patch: Partial<RosterAssignment>) => void;
  onMoreOptions: () => void;
}) {
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>{employee.full_name} · {date}</DialogTitle></DialogHeader>
        <DialogBody>
          <div className="space-y-1.5">
            {shiftTemplates.filter((t) => t.is_active !== false && t.is_active !== 0).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onPick({ status: "DRAFT", assignment_type: "SHIFT", shift_template_id: t.id })}
                className="flex w-full items-center gap-2 rounded-md bg-[#F7F7FB] px-2.5 py-2 text-left text-xs text-slate-950 hover:bg-slate-100"
              >
                <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: t.is_overnight ? "#F0997B" : "#5DCAA5" }} />
                {t.name} · {t.start_time.slice(0, 5)}-{t.end_time.slice(0, 5)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onPick({ status: "DAY_OFF", assignment_type: "DAY_OFF", shift_template_id: null })}
              className="w-full rounded-md bg-[#F7F7FB] px-2.5 py-2 text-left text-xs text-slate-950 hover:bg-slate-100"
            >
              Day off
            </button>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">Current: {String(current?.status ?? "UNASSIGNED")}</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onMoreOptions}>Custom / more options</Button>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateRosterDialog({ weekStart, departmentName, locationName, departmentId, locationId, employees, departments, locations, shiftTemplates, days, onClose, onCreated }: {
  weekStart: string;
  departmentName?: string;
  locationName?: string;
  departmentId: string;
  locationId: string;
  employees: RosterEmployeeRow[];
  departments: OrganizationDepartment[];
  locations: OrganizationLocation[];
  shiftTemplates: ShiftTemplate[];
  days: Array<{ date: string; label: string }>;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const { token } = useAuth();
  const alerts = useAlert();
  const activeTemplates = shiftTemplates.filter((t) => t.is_active !== false && t.is_active !== 0);
  const [defaultShiftId, setDefaultShiftId] = useState(activeTemplates[0]?.id ?? "");
  const [applyWeeklyOff, setApplyWeeklyOff] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!token || !defaultShiftId) return;
    setSaving(true);
    setError(null);
    try {
      let offRules: WeeklyOffRule[] = [];
      if (applyWeeklyOff) offRules = (await api.listWeeklyOffRules(token)).rules;
      const deptIdByName = new Map(departments.map((d) => [d.name, d.id]));
      const locIdByName = new Map(locations.map((l) => [l.name, l.id]));
      const assignments = employees.flatMap((employee) => {
        const empDeptId = employee.department_name ? deptIdByName.get(employee.department_name) : undefined;
        const empLocId = employee.location_name ? locIdByName.get(employee.location_name) : undefined;
        return days.map((day) => {
          const dow = dayOfWeekName(day.date);
          const isOff = applyWeeklyOff && offRules.some((r) => (r.is_active === true || r.is_active === 1) && r.day_of_week === dow && (!r.department_id || r.department_id === empDeptId) && (!r.location_id || r.location_id === empLocId));
          return {
            employee_id: employee.employee_id,
            roster_date: day.date,
            status: isOff ? "DAY_OFF" : "DRAFT",
            assignment_type: isOff ? "DAY_OFF" : "SHIFT",
            shift_template_id: isOff ? null : defaultShiftId
          };
        });
      });
      await api.saveWeeklyRoster(token, { week_start_date: weekStart, location_id: locationId || null, department_id: departmentId || null, reason: "Created via Create roster", assignments });
      alerts.showSuccess("Roster created", `Draft roster created for ${employees.length} employee(s).`);
      await onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to create roster.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Create roster</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><Label>Scope</Label><p className="mt-1 text-slate-950">{departmentName ?? "All departments"}</p></div>
              <div><Label>Outlet/location</Label><p className="mt-1 text-slate-950">{locationName ?? "All locations"}</p></div>
            </div>
            <div className="space-y-1.5">
              <Label>Default shift for unassigned days *</Label>
              <SelectField value={defaultShiftId} onValueChange={setDefaultShiftId}>
                <option value="">Select a shift template</option>
                {activeTemplates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.start_time.slice(0, 5)}-{t.end_time.slice(0, 5)})</option>)}
              </SelectField>
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-950">
              <input type="checkbox" className="h-3.5 w-3.5" checked={applyWeeklyOff} onChange={(e) => setApplyWeeklyOff(e.target.checked)} />
              Apply each employee's usual weekly-off day
            </label>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} disabled={!defaultShiftId} onClick={() => void create()}>Create draft roster</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PublishRosterDialog({ weekStart, employeeCount, shiftTypeCount, warnings, onClose, onPublish }: {
  weekStart: string;
  employeeCount: number;
  shiftTypeCount: number;
  warnings: Array<{ employee: string; day: string }>;
  onClose: () => void;
  onPublish: () => void;
}) {
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Publish roster</DialogTitle></DialogHeader>
        <DialogBody>
          <p className="text-xs text-muted-foreground">Publishing makes the week of {weekStart} visible in every employee's self-service roster and sends them a notification.</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-md bg-[#F7F7FB] p-2.5 text-center"><p className="text-base font-medium text-slate-950">{employeeCount}</p><p className="text-[9px] text-muted-foreground">Employees</p></div>
            <div className="rounded-md bg-[#F7F7FB] p-2.5 text-center"><p className="text-base font-medium text-slate-950">{shiftTypeCount}</p><p className="text-[9px] text-muted-foreground">Shift types</p></div>
            <div className="rounded-md bg-[#F7F7FB] p-2.5 text-center"><p className="text-base font-medium text-[#A32D2D]">{warnings.length}</p><p className="text-[9px] text-muted-foreground">Warnings</p></div>
          </div>
          {warnings.length ? (
            <div className="mt-3 rounded-md border border-[#FAC775] bg-[#FAEEDA] p-2.5">
              <p className="text-xs font-medium text-slate-950">{warnings.length} employee{warnings.length > 1 ? "s have" : " has"} no shift assigned</p>
              <p className="mt-1 text-[10px] text-[#854F0B]">{warnings.slice(0, 5).map((w) => `${w.employee} (${w.day.slice(0, 3)})`).join(", ")}{warnings.length > 5 ? ", …" : ""} — you can still publish; they'll show as unscheduled</p>
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Go back and fix</Button>
          <Button size="sm" onClick={onPublish}>Publish anyway</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
