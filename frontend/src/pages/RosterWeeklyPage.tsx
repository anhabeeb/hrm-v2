import { ClipboardCopy, Edit, Eraser, Lock, Megaphone, Save, Undo2, Unlock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmployeeIdentityCell } from "../components/employee/EmployeeIdentityCell";
import { ExportMenu } from "../components/export/ExportMenu";
import { ActiveFilterChips, FilterResetButton, formatDateRangeLabel, MoreFiltersSheet, StandardDateRangeFilter, StandardFilterBar, StandardSearchInput, StandardSelectFilter } from "../components/filters";
import { OrganizationCascadeSelector } from "../components/organization/OrganizationCascadeSelector";
import { RosterAssignmentModal } from "../components/roster/RosterAssignmentModal";
import { RosterNav } from "../components/roster/RosterNav";
import { ActionTextButton } from "../components/ui/action-button";
import { Badge } from "../components/ui/badge";
import { Button, RowActionButton } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import type { OrganizationDepartment, OrganizationJobLevel, OrganizationLocation, OrganizationPosition } from "../types/organization";
import type { RosterAssignment, RosterAssignmentStatus, RosterEmployeeRow, ShiftTemplate, WeeklyRoster } from "../types/roster";
import { CheckboxField, PageHeader, PageShell, SelectField, TextareaField } from "../components/ui/page-shell";

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
  const defaultWeekStart = useMemo(() => mondayOf(new Date()), []);
  const [weekStart, setWeekStart] = useState(defaultWeekStart);
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [jobLevelId, setJobLevelId] = useState("");
  const [positionId, setPositionId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [weekly, setWeekly] = useState<WeeklyRoster | null>(null);
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [jobLevels, setJobLevels] = useState<OrganizationJobLevel[]>([]);
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
  const weekRange = useMemo(() => ({ from: weekStart, to: weekStart }), [weekStart]);
  const activeFilterChips = useMemo(() => [
    ...(search ? [{ key: "search", label: "Search", value: search, onRemove: () => setSearch("") }] : []),
    ...(weekStart !== defaultWeekStart ? [{ key: "week", label: "Week", value: formatDateRangeLabel(weekRange), onRemove: () => setWeekStart(defaultWeekStart) }] : []),
    ...(statusFilter ? [{ key: "status", label: "Status", value: statusFilter.replace(/_/g, " "), title: statusFilter, onRemove: () => setStatusFilter("") }] : []),
    ...(locationId ? [{ key: "location", label: "Location", value: locations.find((location) => location.id === locationId)?.name ?? locationId, onRemove: () => setLocationId("") }] : []),
    ...(departmentId ? [{ key: "department", label: "Department", value: departments.find((department) => department.id === departmentId)?.name ?? departmentId, onRemove: () => setDepartmentId("") }] : []),
    ...(jobLevelId ? [{ key: "job_level", label: "Job Level", value: jobLevels.find((level) => level.id === jobLevelId)?.name ?? jobLevelId, onRemove: () => setJobLevelId("") }] : []),
    ...(positionId ? [{ key: "position", label: "Position", value: positions.find((position) => position.id === positionId)?.title ?? positionId, onRemove: () => setPositionId("") }] : [])
  ], [defaultWeekStart, departmentId, departments, jobLevelId, jobLevels, locationId, locations, positionId, positions, search, statusFilter, weekRange, weekStart]);

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    setError(null);
    setModuleDisabled(false);
    try {
      const [weeklyResult, departmentResult, jobLevelResult, positionResult, locationResult] = await Promise.all([
        api.getWeeklyRoster(token, filters),
        api.listDepartments(token),
        api.listJobLevels(token),
        api.listPositions(token),
        api.listLocations(token)
      ]);
      setWeekly(weeklyResult);
      setDepartments(departmentResult.departments);
      setJobLevels(jobLevelResult.job_levels);
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
      if (jobLevelId && employee.job_level_name !== jobLevels.find((level) => level.id === jobLevelId)?.name) return false;
      if (statusFilter) {
        const hasStatus = (weekly?.days ?? []).some((day) => (draft[cellKey(employee.employee_id, day.date)]?.status ?? "UNASSIGNED") === statusFilter);
        if (!hasStatus) return false;
      }
      return true;
    });
  }, [weekly, positionId, positions, jobLevelId, jobLevels, statusFilter, draft]);
  const rosterExportRows = useMemo(() => visibleEmployees.flatMap((employee) => (weekly?.days ?? []).map((day) => {
    const assignment = draft[cellKey(employee.employee_id, day.date)] ?? { status: "UNASSIGNED" };
    return {
      employee_no: employee.employee_no,
      employee_name: employee.full_name,
      department_name: employee.department_name,
      location_name: employee.location_name,
      roster_date: day.date,
      day_label: day.label,
      status: assignment.status ?? "UNASSIGNED",
      shift_code: assignment.shift_code ?? "",
      shift_start_time: assignment.custom_start_time ?? assignment.shift_start_time ?? "",
      shift_end_time: assignment.custom_end_time ?? assignment.shift_end_time ?? "",
      notes: assignment.notes ?? ""
    };
  })), [draft, visibleEmployees, weekly?.days]);

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

  if (!canView) return <PageShell><Panel><EmptyState title="Roster unavailable" description="Your account needs roster.view permission." /></Panel></PageShell>;
  if (moduleDisabled) {
    return (
      <PageShell>
        <PageHeader title="Weekly Roster" description="Roster module is disabled." />
        <RosterNav />
        <Panel><EmptyState title="Roster module is disabled" description="Roster settings remain available to permitted admins." /></Panel>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Weekly Roster"
        description="Table-first weekly planning with leave, attendance, payroll, and audit hooks prepared."
        actions={
          <>
          <ExportMenu
            moduleName="Weekly roster"
            rows={rosterExportRows}
            columns={["employee_no", "employee_name", "department_name", "location_name", "roster_date", "day_label", "status", "shift_code", "shift_start_time", "shift_end_time", "notes"]}
            filterSummary={activeFilterChips.map((chip) => `${chip.label}: ${chip.value}`)}
          />
          {canManage ? <ActionTextButton intent="create" size="sm" onClick={() => { setAction("copy-previous"); setActionReason(""); setOverwrite(false); }}><ClipboardCopy className="h-4 w-4" /> Copy previous</ActionTextButton> : null}
          {canManage ? <ActionTextButton intent="warning" size="sm" onClick={() => { setAction("clear-week"); setActionReason(""); }}><Eraser className="h-4 w-4" /> Clear</ActionTextButton> : null}
          {canManage ? <ActionTextButton intent="save" size="sm" onClick={() => void save()}><Save className="h-4 w-4" /> Save</ActionTextButton> : null}
          {canPublish ? <ActionTextButton intent="save" size="sm" onClick={() => void publish()}><Megaphone className="h-4 w-4" /> Publish</ActionTextButton> : null}
          {weekly?.period?.status === "PUBLISHED" && canUnpublish ? <ActionTextButton intent="warning" size="sm" onClick={() => { setAction("unpublish"); setActionReason(""); }}><Undo2 className="h-4 w-4" /> Unpublish</ActionTextButton> : null}
          {weekly?.period?.status === "PUBLISHED" && canLock ? <ActionTextButton intent="warning" size="sm" onClick={() => { setAction("lock"); setActionReason(""); }}><Lock className="h-4 w-4" /> Lock</ActionTextButton> : null}
          {weekly?.period?.status === "LOCKED" && canUnlock ? <ActionTextButton intent="warning" size="sm" onClick={() => { setAction("unlock"); setActionReason(""); }}><Unlock className="h-4 w-4" /> Unlock</ActionTextButton> : null}
          </>
        }
      />
      <RosterNav />
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}
      <Panel className="overflow-hidden">
        <div className="border-b p-3">
          <StandardFilterBar
            search={<StandardSearchInput value={search} onDebouncedChange={setSearch} placeholder="Search employee or number" />}
            reset={<FilterResetButton onReset={() => { setSearch(""); setWeekStart(defaultWeekStart); setDepartmentId(""); setJobLevelId(""); setPositionId(""); setLocationId(""); setStatusFilter(""); }} />}
            moreFilters={
              <MoreFiltersSheet onReset={() => { setDepartmentId(""); setJobLevelId(""); setPositionId(""); setLocationId(""); }}>
                <OrganizationCascadeSelector
                  includeLocation
                  mode="report-filter"
                  departments={departments}
                  jobLevels={jobLevels}
                  positions={positions}
                  locations={locations}
                  value={{ departmentId, jobLevelId, positionId, locationId }}
                  onChange={(next) => {
                    setDepartmentId(next.departmentId ?? "");
                    setJobLevelId(next.jobLevelId ?? "");
                    setPositionId(next.positionId ?? "");
                    setLocationId(next.locationId ?? "");
                  }}
                  labels={{ locationId: "Location filter", departmentId: "Department filter", jobLevelId: "Job level filter", positionId: "Position filter" }}
                  className="grid gap-2"
                />
              </MoreFiltersSheet>
            }
          >
            <StandardDateRangeFilter value={weekRange} onChange={(range) => setWeekStart(range.from ?? weekStart)} label="Week Start" />
            <StandardSelectFilter value={statusFilter} onValueChange={setStatusFilter} allLabel="Any assignment status" width="status" options={statuses.map((status) => ({ value: status, label: status }))} />
            <div className="flex h-10 items-center rounded-md border bg-slate-50 px-3 text-sm text-muted-foreground">{weekly?.weekStart ?? weekStart} to {weekly?.weekEnd ?? "-"}</div>
          </StandardFilterBar>
          <ActiveFilterChips chips={activeFilterChips} className="mt-2" />
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
                    <EmployeeIdentityCell employeeId={employee.employee_id} employeeName={employee.full_name} employeeNumber={employee.employee_no} departmentName={employee.department_name} locationName={employee.location_name} size="sm" />
                  </TableCell>
                  {(weekly?.days ?? []).map((day) => {
                    const assignment = draft[cellKey(employee.employee_id, day.date)] ?? { status: "UNASSIGNED" };
                    const value = assignment.shift_template_id && isShiftStatus(assignment.status) ? `shift:${assignment.shift_template_id}` : assignment.status ?? "UNASSIGNED";
                    const status = String(assignment.status ?? "UNASSIGNED");
                    return (
                      <TableCell key={day.date} className="min-w-40">
                        <div className="flex items-center gap-1">
                          <SelectField disabled={!canManage} className="h-8 w-full rounded-md border bg-white px-2 text-xs" value={value} onChange={(event) => updateCell(employee, day.date, event.target.value)}>
                            {statuses.filter((item) => !["SCHEDULED"].includes(item)).map((item) => <option key={item} value={item}>{item}</option>)}
                            {(weekly?.shift_templates ?? []).map((template) => <option key={template.id} value={`shift:${template.id}`}>{template.code}</option>)}
                          </SelectField>
                          {canManage ? <RowActionButton intent="edit" title="Edit assignment details" onClick={() => openEdit(employee, day.date)}><Edit className="h-4 w-4" /></RowActionButton> : null}
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
    </PageShell>
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
          {copy ? <CheckboxField label="Overwrite existing assignments" checked={overwrite} onChange={onOverwriteChange} /> : null}
          <div className="space-y-1.5">
            <label className="text-xs font-medium">{requiresReason ? "Reason required" : "Reason optional"}</label>
            <TextareaField className="min-h-24 w-full rounded-md border bg-white px-3 py-2 text-sm" value={reason} onChange={(event) => onReasonChange(event.target.value)} placeholder="Reason for audit log" />
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
