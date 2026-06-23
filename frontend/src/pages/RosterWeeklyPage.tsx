import { CalendarDays, ClipboardCopy, Edit, Eraser, Lock, Megaphone, Save, Search, Undo2, Unlock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { RosterAssignmentModal } from "../components/roster/RosterAssignmentModal";
import { RosterNav } from "../components/roster/RosterNav";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import type { OrganizationDepartment, OrganizationLocation, OrganizationPosition } from "../types/organization";
import type { RosterAssignment, RosterAssignmentStatus, RosterEmployeeRow, ShiftTemplate, WeeklyRoster } from "../types/roster";

const statuses: RosterAssignmentStatus[] = ["UNASSIGNED", "DRAFT", "PUBLISHED", "CHANGED_AFTER_PUBLISH", "SCHEDULED", "DAY_OFF", "OFF", "LEAVE", "SICK_LEAVE", "LONG_LEAVE", "PUBLIC_HOLIDAY", "CONFLICT", "CANCELLED", "ABSENT_PLACEHOLDER"];
type RosterAction = "save-published" | "copy-previous" | "clear-week" | "unpublish" | "lock" | "unlock" | null;

function mondayOf(date: Date) {
  const copy = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = copy.getUTCDay();
  copy.setUTCDate(copy.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return copy.toISOString().slice(0, 10);
}

function cellKey(employeeId: string, date: string) {
  return `${employeeId}:${date}`;
}

function statusTone(status: string) {
  if (["SCHEDULED", "DRAFT", "PUBLISHED"].includes(status)) return "success" as const;
  if (["LEAVE", "SICK_LEAVE", "LONG_LEAVE", "DAY_OFF", "OFF", "PUBLIC_HOLIDAY"].includes(status)) return "info" as const;
  if (["ABSENT_PLACEHOLDER", "CONFLICT", "CHANGED_AFTER_PUBLISH"].includes(status)) return "warning" as const;
  return "neutral" as const;
}

function isShiftStatus(status: unknown) {
  return ["SCHEDULED", "DRAFT", "PUBLISHED", "CHANGED_AFTER_PUBLISH"].includes(String(status));
}

export function RosterWeeklyPage() {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("roster.view");
  const canManage = permissions.has("roster.manage") || permissions.has("roster.assignments.manage") || permissions.has("roster.assignments.update") || permissions.has("roster.assignments.bulk_update");
  const canPublish = permissions.has("roster.publish") || permissions.has("roster.periods.publish");
  const canUnpublish = permissions.has("roster.periods.unpublish") || permissions.has("roster.periods.manage") || permissions.has("roster.manage");
  const canLock = permissions.has("roster.periods.lock") || permissions.has("roster.periods.manage");
  const canUnlock = permissions.has("roster.periods.unlock") || permissions.has("roster.periods.manage");
  const [weekStart, setWeekStart] = useState(mondayOf(new Date()));
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [positionId, setPositionId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [weekly, setWeekly] = useState<WeeklyRoster | null>(null);
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [positions, setPositions] = useState<OrganizationPosition[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [draft, setDraft] = useState<Record<string, Partial<RosterAssignment>>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<{ employee: RosterEmployeeRow; date: string; assignment: Partial<RosterAssignment> } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [moduleDisabled, setModuleDisabled] = useState(false);
  const [action, setAction] = useState<RosterAction>(null);
  const [actionReason, setActionReason] = useState("");
  const [overwrite, setOverwrite] = useState(false);

  const filters = useMemo(() => ({ week_start_date: weekStart, search, department_id: departmentId, location_id: locationId }), [weekStart, search, departmentId, locationId]);

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    setError(null);
    setModuleDisabled(false);
    try {
      const [weeklyResult, departmentResult, positionResult, locationResult] = await Promise.all([
        api.getWeeklyRoster(token, filters),
        api.listDepartments(token),
        api.listPositions(token),
        api.listLocations(token)
      ]);
      setWeekly(weeklyResult);
      setDepartments(departmentResult.departments);
      setPositions(positionResult.positions);
      setLocations(locationResult.locations);
      setDraft(weeklyResult.assignment_map ?? {});
      setDirty(new Set());
    } catch (err) {
      if (err instanceof ApiError && err.code === "ROSTER_MODULE_DISABLED") {
        setModuleDisabled(true);
        setWeekly(null);
        return;
      }
      setError(err instanceof ApiError ? err.message : "Unable to load weekly roster.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, canView, filters]);

  const visibleEmployees = useMemo(() => {
    const rows = weekly?.employees ?? [];
    return rows.filter((employee) => {
      if (positionId && employee.position_title !== positions.find((position) => position.id === positionId)?.title) return false;
      if (statusFilter) {
        const hasStatus = (weekly?.days ?? []).some((day) => (draft[cellKey(employee.employee_id, day.date)]?.status ?? "UNASSIGNED") === statusFilter);
        if (!hasStatus) return false;
      }
      return true;
    });
  }, [weekly, positionId, positions, statusFilter, draft]);

  function updateCell(employee: RosterEmployeeRow, date: string, value: string) {
    const key = cellKey(employee.employee_id, date);
    const existing = draft[key] ?? { employee_id: employee.employee_id, roster_date: date, status: "UNASSIGNED" };
    const next: Partial<RosterAssignment> = { ...existing, employee_id: employee.employee_id, roster_date: date };
    if (value.startsWith("shift:")) {
      next.status = weekly?.period?.status === "PUBLISHED" || weekly?.period?.status === "LOCKED" ? "CHANGED_AFTER_PUBLISH" : "DRAFT";
      next.assignment_type = "SHIFT";
      next.shift_template_id = value.replace("shift:", "");
    } else {
      next.status = value as RosterAssignmentStatus;
      next.shift_template_id = null;
      next.assignment_type = value === "DAY_OFF" || value === "OFF" ? "DAY_OFF" : ["LEAVE", "SICK_LEAVE", "LONG_LEAVE"].includes(value) ? "LEAVE_PLACEHOLDER" : value === "PUBLIC_HOLIDAY" ? "PUBLIC_HOLIDAY_WORK" : undefined;
    }
    setDraft((current) => ({ ...current, [key]: next }));
    setDirty((current) => new Set(current).add(key));
  }

  function openEdit(employee: RosterEmployeeRow, date: string) {
    const assignment = draft[cellKey(employee.employee_id, date)] ?? { employee_id: employee.employee_id, roster_date: date, status: "UNASSIGNED" };
    setEditing({ employee, date, assignment });
  }

  async function saveWithReason(reason = "") {
    if (!token || !weekly || dirty.size === 0) {
      setMessage("No roster changes to save.");
      return;
    }
    setError(null);
    setMessage(null);
    try {
      const assignments = Array.from(dirty).map((key) => draft[key]).filter(Boolean);
      const result = await api.saveWeeklyRoster(token, { week_start_date: weekStart, location_id: locationId || null, department_id: departmentId || null, reason, assignments });
      setMessage(`Roster saved. ${result.assignments.length} assignment rows updated${result.warnings.length ? ` with ${result.warnings.length} leave warning(s)` : ""}.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save weekly roster.");
    }
  }

  async function save() {
    if (weekly?.period?.status === "PUBLISHED" || weekly?.period?.status === "LOCKED") {
      setAction("save-published");
      setActionReason("");
      return;
    }
    await saveWithReason("");
  }

  async function publish() {
    if (!token) return;
    try {
      const period = weekly?.period ?? (await api.createRosterPeriod(token, { week_start_date: weekStart, location_id: locationId || null, department_id: departmentId || null })).period;
      await api.publishRosterPeriod(token, period.id);
      setMessage("Roster week published.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to publish roster.");
    }
  }

  async function copyPrevious() {
    if (!token) return;
    try {
      const result = await api.copyPreviousRosterWeek(token, { target_week_start_date: weekStart, location_id: locationId || null, department_id: departmentId || null, overwrite_existing: overwrite });
      setMessage(`Copied ${result.copied} assignment rows from the previous week.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to copy previous week.");
    }
  }

  async function clearWeek() {
    if (!token) return;
    try {
      await api.clearRosterWeek(token, { week_start_date: weekStart, location_id: locationId || null, department_id: departmentId || null, reason: actionReason });
      setMessage("Roster week cleared.");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to clear roster week.");
    }
  }

  async function periodAction(next: "unpublish" | "lock" | "unlock") {
    if (!token || !weekly?.period) return;
    try {
      if (next === "unpublish") await api.unpublishRosterPeriod(token, weekly.period.id, actionReason);
      if (next === "lock") await api.lockRosterPeriod(token, weekly.period.id, actionReason || null);
      if (next === "unlock") await api.unlockRosterPeriod(token, weekly.period.id, actionReason);
      setMessage(`Roster ${next === "unpublish" ? "unpublished" : next === "lock" ? "locked" : "unlocked"}.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Unable to ${next} roster.`);
    }
  }

  async function confirmAction() {
    if (action === "save-published") await saveWithReason(actionReason);
    if (action === "copy-previous") await copyPrevious();
    if (action === "clear-week") await clearWeek();
    if (action === "unpublish") await periodAction("unpublish");
    if (action === "lock") await periodAction("lock");
    if (action === "unlock") await periodAction("unlock");
    setAction(null);
    setActionReason("");
    setOverwrite(false);
  }

  if (!canView) return <Panel><EmptyState title="Roster unavailable" description="Your account needs roster.view permission." /></Panel>;
  if (moduleDisabled) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div><h1 className="text-lg font-semibold">Weekly Roster</h1><p className="text-sm text-muted-foreground">Roster module is disabled.</p></div>
          <RosterNav />
        </div>
        <Panel><EmptyState title="Roster module is disabled" description="Roster settings remain available to permitted admins." /></Panel>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Weekly Roster</h1>
          <p className="text-sm text-muted-foreground">Table-first weekly planning with leave, attendance, payroll, and audit hooks prepared.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <RosterNav />
          {canManage ? <Button variant="outline" size="sm" onClick={() => { setAction("copy-previous"); setActionReason(""); setOverwrite(false); }}><ClipboardCopy className="h-4 w-4" /> Copy previous</Button> : null}
          {canManage ? <Button variant="outline" size="sm" onClick={() => { setAction("clear-week"); setActionReason(""); }}><Eraser className="h-4 w-4" /> Clear</Button> : null}
          {canManage ? <Button size="sm" onClick={() => void save()}><Save className="h-4 w-4" /> Save</Button> : null}
          {canPublish ? <Button variant="outline" size="sm" onClick={() => void publish()}><Megaphone className="h-4 w-4" /> Publish</Button> : null}
          {weekly?.period?.status === "PUBLISHED" && canUnpublish ? <Button variant="outline" size="sm" onClick={() => { setAction("unpublish"); setActionReason(""); }}><Undo2 className="h-4 w-4" /> Unpublish</Button> : null}
          {weekly?.period?.status === "PUBLISHED" && canLock ? <Button variant="outline" size="sm" onClick={() => { setAction("lock"); setActionReason(""); }}><Lock className="h-4 w-4" /> Lock</Button> : null}
          {weekly?.period?.status === "LOCKED" && canUnlock ? <Button variant="outline" size="sm" onClick={() => { setAction("unlock"); setActionReason(""); }}><Unlock className="h-4 w-4" /> Unlock</Button> : null}
        </div>
      </div>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}
      <Panel className="overflow-hidden">
        <div className="grid gap-2 border-b p-3 md:grid-cols-4 xl:grid-cols-8">
          <Input type="date" value={weekStart} onChange={(event) => setWeekStart(event.target.value)} aria-label="Week start date" />
          <div className="relative md:col-span-2"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search employee or number" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <select className="h-9 rounded-md border bg-white px-3 text-sm" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}><option value="">All departments</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select>
          <select className="h-9 rounded-md border bg-white px-3 text-sm" value={positionId} onChange={(event) => setPositionId(event.target.value)}><option value="">All positions</option>{positions.map((position) => <option key={position.id} value={position.id}>{position.title}</option>)}</select>
          <select className="h-9 rounded-md border bg-white px-3 text-sm" value={locationId} onChange={(event) => setLocationId(event.target.value)}><option value="">All locations</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select>
          <select className="h-9 rounded-md border bg-white px-3 text-sm" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Any assignment status</option>{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select>
          <div className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm"><CalendarDays className="h-4 w-4 text-muted-foreground" /><span>{weekly?.weekStart ?? weekStart} to {weekly?.weekEnd ?? "-"}</span></div>
        </div>
        <div className="overflow-x-auto">
          <Table className="min-w-[1180px]">
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-10 bg-muted/70">Employee</TableHead>
                {(weekly?.days ?? []).map((day) => <TableHead key={day.date}>{day.label}<div className="font-normal normal-case text-muted-foreground">{day.date.slice(5)}</div></TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleEmployees.map((employee) => (
                <TableRow key={employee.employee_id}>
                  <TableCell className="sticky left-0 z-10 min-w-60 bg-white">
                    <div className="font-medium">{employee.full_name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{employee.employee_no} - {employee.department_name ?? "No department"} - {employee.location_name ?? "No location"}</div>
                  </TableCell>
                  {(weekly?.days ?? []).map((day) => {
                    const assignment = draft[cellKey(employee.employee_id, day.date)] ?? { status: "UNASSIGNED" };
                    const value = assignment.shift_template_id && isShiftStatus(assignment.status) ? `shift:${assignment.shift_template_id}` : assignment.status ?? "UNASSIGNED";
                    const status = String(assignment.status ?? "UNASSIGNED");
                    return (
                      <TableCell key={day.date} className="min-w-40">
                        <div className="flex items-center gap-1">
                          <select disabled={!canManage} className="h-8 w-full rounded-md border bg-white px-2 text-xs" value={value} onChange={(event) => updateCell(employee, day.date, event.target.value)}>
                            {statuses.filter((item) => !["SCHEDULED"].includes(item)).map((item) => <option key={item} value={item}>{item}</option>)}
                            {(weekly?.shift_templates ?? []).map((template) => <option key={template.id} value={`shift:${template.id}`}>{template.code}</option>)}
                          </select>
                          {canManage ? <Button title="Edit assignment details" variant="ghost" size="icon" onClick={() => openEdit(employee, day.date)}><Edit className="h-4 w-4" /></Button> : null}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge tone={statusTone(status)}>{status === "OFF" ? "DAY_OFF" : status}</Badge>
                          {assignment.shift_code ? <Badge tone="neutral">{assignment.shift_code}</Badge> : null}
                          {assignment.custom_start_time || assignment.shift_start_time ? <Badge tone="neutral">{assignment.custom_start_time ?? assignment.shift_start_time}-{assignment.custom_end_time ?? assignment.shift_end_time}</Badge> : null}
                          {Number(assignment.changed_after_publish ?? 0) === 1 || status === "CHANGED_AFTER_PUBLISH" ? <Badge tone="warning">Changed</Badge> : null}
                          {assignment.conflict_status || status === "CONFLICT" ? <Badge tone="warning">Conflict</Badge> : null}
                          {status === "CANCELLED" ? <Badge tone="neutral">Cancelled</Badge> : null}
                          {assignment.notes ? <Badge tone="info">Notes</Badge> : null}
                        </div>
                        {assignment.leave_indicator ? <Badge tone="warning" className="mt-1">{assignment.leave_indicator}</Badge> : null}
                        {assignment.attendance_indicator ? <Badge tone="info" className="mt-1">{assignment.attendance_indicator}</Badge> : null}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t p-3 text-xs text-muted-foreground">
          <Badge tone={weekly?.period?.status === "PUBLISHED" ? "success" : weekly?.period?.status === "ARCHIVED" ? "neutral" : "warning"}>{weekly?.period?.status ?? "NO PERIOD"}</Badge>
          <span>{dirty.size} unsaved cell(s)</span>
        </div>
        {loading ? <EmptyState title="Loading weekly roster" description="Fetching roster employees, assignments, leave, and attendance indicators." /> : visibleEmployees.length === 0 ? <EmptyState title="No roster employees found" description="Adjust filters or mark employees as roster eligible." /> : null}
      </Panel>
      {editing ? (
        <RosterAssignmentModal
          title="Edit roster assignment"
          subtitle={`${editing.employee.employee_no} - ${editing.employee.full_name} - ${editing.date}`}
          assignment={editing.assignment}
          shiftTemplates={(weekly?.shift_templates ?? []) as ShiftTemplate[]}
          requireReason={weekly?.period?.status === "PUBLISHED"}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            const key = cellKey(editing.employee.employee_id, editing.date);
            setDraft((current) => ({ ...current, [key]: { ...current[key], ...input, employee_id: editing.employee.employee_id, roster_date: editing.date } }));
            setDirty((current) => new Set(current).add(key));
          }}
        />
      ) : null}
      {action ? (
        <RosterActionDialog
          action={action}
          reason={actionReason}
          overwrite={overwrite}
          onReasonChange={setActionReason}
          onOverwriteChange={setOverwrite}
          onClose={() => setAction(null)}
          onConfirm={() => void confirmAction()}
        />
      ) : null}
    </div>
  );
}

function RosterActionDialog({ action, reason, overwrite, onReasonChange, onOverwriteChange, onClose, onConfirm }: { action: RosterAction; reason: string; overwrite: boolean; onReasonChange: (value: string) => void; onOverwriteChange: (value: boolean) => void; onClose: () => void; onConfirm: () => void }) {
  const copy = action === "copy-previous";
  const requiresReason = action !== "copy-previous" && action !== "lock";
  const title = action === "save-published" ? "Save published roster changes" : action === "copy-previous" ? "Copy previous week" : action === "clear-week" ? "Clear roster week" : action === "unpublish" ? "Unpublish roster" : action === "lock" ? "Lock roster" : "Unlock roster";
  const description = action === "copy-previous" ? "Copy assignment rows from the previous week into this roster scope." : "This action is audited and may affect employee self-service visibility.";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4">
      <div className="w-full max-w-md rounded-lg border bg-white shadow-xl">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <div className="space-y-3 p-4">
          {copy ? <label className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm"><input type="checkbox" checked={overwrite} onChange={(event) => onOverwriteChange(event.target.checked)} /> Overwrite existing assignments</label> : null}
          <div className="space-y-1.5">
            <label className="text-xs font-medium">{requiresReason ? "Reason required" : "Reason optional"}</label>
            <textarea className="min-h-24 w-full rounded-md border bg-white px-3 py-2 text-sm" value={reason} onChange={(event) => onReasonChange(event.target.value)} placeholder="Reason for audit log" />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={requiresReason && !reason.trim()} onClick={onConfirm}>Confirm</Button>
        </div>
      </div>
    </div>
  );
}
