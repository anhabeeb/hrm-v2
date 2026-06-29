import { Edit, FileClock, Plus, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EmployeeIdentityCell } from "../components/employee/EmployeeIdentityCell";
import { AttendanceCorrectionModal } from "../components/attendance/AttendanceCorrectionModal";
import { AttendanceManualLogModal } from "../components/attendance/AttendanceManualLogModal";
import { AttendanceNav } from "../components/attendance/AttendanceNav";
import { AttendanceRecordModal } from "../components/attendance/AttendanceRecordModal";
import { ExportMenu } from "../components/export/ExportMenu";
import { Badge } from "../components/ui/badge";
import { ActionTextButton } from "../components/ui/action-button";
import { Button, RowActionButton } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { TableSkeleton } from "../components/loading";
import { Input } from "../components/ui/input";
import {
  ActiveFilterChips,
  FilterResetButton,
  FilterSection,
  MoreFiltersSheet,
  StandardDateRangeFilter,
  StandardFilterBar,
  StandardSearchInput,
  StandardSelectFilter,
  type StandardDateRange
} from "../components/filters";
import { OrganizationCascadeSelector } from "../components/organization/OrganizationCascadeSelector";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { ApiError, api } from "../lib/api";
import type { AttendanceLog, AttendanceRawLog, AttendanceRecord } from "../types/attendance";
import type { Employee } from "../types/employees";
import type { OrganizationDepartment, OrganizationJobLevel, OrganizationLocation, OrganizationPosition } from "../types/organization";
import { CheckboxField, PageHeader, PageShell, SelectField, TextareaField } from "../components/ui/page-shell";

function statusTone(status: string) {
  if (status === "PRESENT") return "success" as const;
  if (status === "LATE" || status === "HALF_DAY" || status === "PENDING_CORRECTION") return "warning" as const;
  if (status === "ABSENT") return "danger" as const;
  return "neutral" as const;
}

export function AttendanceRecordsPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("attendance.view");
  const canManage = permissions.has("attendance.manage");
  const canCorrect = permissions.has("attendance.correct") || permissions.has("attendance.manage");
  const canDevices = permissions.has("attendance.devices.manage");
  const canManageLogs = permissions.has("attendance.logs.manage") || permissions.has("attendance.manual_entries.manage") || permissions.has("attendance.manage");
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [rawLogs, setRawLogs] = useState<AttendanceRawLog[]>([]);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [jobLevels, setJobLevels] = useState<OrganizationJobLevel[]>([]);
  const [positions, setPositions] = useState<OrganizationPosition[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [positionId, setPositionId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [missedPunch, setMissedPunch] = useState("");
  const [lateOnly, setLateOnly] = useState(false);
  const [earlyCheckoutOnly, setEarlyCheckoutOnly] = useState(false);
  const [payrollImpact, setPayrollImpact] = useState(false);
  const [editing, setEditing] = useState<AttendanceRecord | null | undefined>(undefined);
  const [editingLog, setEditingLog] = useState<AttendanceLog | null | undefined>(undefined);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [rawImportOpen, setRawImportOpen] = useState(false);
  const [attendanceDisabled, setAttendanceDisabled] = useState(false);
  const [rawJson, setRawJson] = useState("[\n  {\n    \"external_employee_code\": \"EMP001\",\n    \"punch_time\": \"2026-06-20T09:00:00\",\n    \"punch_type\": \"IN\"\n  }\n]");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dateRange: StandardDateRange = useMemo(() => ({ from: dateFrom, to: dateTo }), [dateFrom, dateTo]);

  const filters = useMemo(() => ({
    search,
    status,
    source,
    department_id: departmentId,
    position_id: positionId,
    location_id: locationId,
    date_from: dateFrom,
    date_to: dateTo,
    missed_punch: missedPunch,
    late_only: lateOnly || undefined,
    early_checkout_only: earlyCheckoutOnly || undefined,
    payroll_impact: payrollImpact || undefined
  }), [search, status, source, departmentId, positionId, locationId, dateFrom, dateTo, missedPunch, lateOnly, earlyCheckoutOnly, payrollImpact]);

  const rawLogFilters = useMemo(() => ({
    search,
    source: source === "DEVICE" ? "DEVICE" : source === "MANUAL_IMPORT" ? "MANUAL_IMPORT" : "",
    punch_from: dateFrom ? `${dateFrom}T00:00:00` : "",
    punch_to: dateTo ? `${dateTo}T23:59:59` : ""
  }), [search, source, dateFrom, dateTo]);

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    setError(null);
    try {
      setAttendanceDisabled(false);
      const [recordResult, logResult, employeeResult, departmentResult, jobLevelResult, positionResult, locationResult] = await Promise.all([
        api.listAttendanceRecords(token, filters),
        api.listAttendanceRawLogs(token, rawLogFilters),
        api.listEmployees(token),
        api.listDepartments(token),
        api.listJobLevels(token),
        api.listPositions(token),
        api.listLocations(token)
      ]);
      const attendanceLogs = await api.listAttendanceLogs(token, { ...rawLogFilters, log_from: dateFrom ? `${dateFrom}T00:00:00` : "", log_to: dateTo ? `${dateTo}T23:59:59` : "" });
      setRecords(recordResult.records);
      setRawLogs(logResult.logs);
      setLogs(attendanceLogs.logs);
      setEmployees(employeeResult.employees);
      setDepartments(departmentResult.departments);
      setJobLevels(jobLevelResult.job_levels);
      setPositions(positionResult.positions);
      setLocations(locationResult.locations);
    } catch (err) {
      if (err instanceof ApiError && (err.code === "ATTENDANCE_MODULE_DISABLED" || err.code === "MODULE_DISABLED")) {
        setAttendanceDisabled(true);
        setRecords([]);
        setRawLogs([]);
        setLogs([]);
        return;
      }
      setError(err instanceof ApiError ? err.message : "Unable to load attendance records.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, canView, filters, rawLogFilters]);

  async function recalculate(record: AttendanceRecord) {
    if (!token) return;
    try {
      await api.recalculateAttendanceRecord(token, record.id);
      alerts.showSuccess("Recalculation queued", "Attendance record recalculation was queued.");
      await load();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Unable to queue recalculation.";
      setError(message);
      alerts.showApiError(err, "Unable to queue recalculation.");
    }
  }

  async function importRawLogs() {
    if (!token) return;
    try {
      const logs = JSON.parse(rawJson) as Record<string, unknown>[];
      await api.importAttendanceRawLogs(token, { logs, source: "MANUAL_IMPORT" });
      setRawImportOpen(false);
      alerts.showSuccess("Raw logs imported", "Attendance raw logs were imported.");
      await load();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Enter valid raw log JSON before importing.";
      setError(message);
      if (err instanceof SyntaxError) alerts.showValidationError(message, "Invalid raw log JSON");
      else alerts.showApiError(err, "Unable to import raw logs.");
    }
  }

  function setRange(range: StandardDateRange) {
    setDateFrom(range.from ?? "");
    setDateTo(range.to ?? "");
  }

  function resetFilters() {
    const today = new Date().toISOString().slice(0, 10);
    setSearch("");
    setStatus("");
    setSource("");
    setDepartmentId("");
    setPositionId("");
    setLocationId("");
    setDateFrom(today);
    setDateTo(today);
    setMissedPunch("");
    setLateOnly(false);
    setEarlyCheckoutOnly(false);
    setPayrollImpact(false);
  }

  const activeChips = [
    search.trim() ? { key: "search", label: "Search", value: search.trim(), onRemove: () => setSearch("") } : null,
    status ? { key: "status", label: "Status", value: status, onRemove: () => setStatus("") } : null,
    source ? { key: "source", label: "Source", value: source, onRemove: () => setSource("") } : null,
    departmentId ? { key: "department", label: "Department", value: departments.find((department) => department.id === departmentId)?.name ?? "Selected", onRemove: () => setDepartmentId("") } : null,
    positionId ? { key: "position", label: "Position", value: positions.find((position) => position.id === positionId)?.title ?? "Selected", onRemove: () => setPositionId("") } : null,
    locationId ? { key: "location", label: "Location", value: locations.find((location) => location.id === locationId)?.name ?? "Selected", onRemove: () => setLocationId("") } : null,
    missedPunch ? { key: "missedPunch", label: "Missed Punch", value: missedPunch === "true" ? "Yes" : "No", onRemove: () => setMissedPunch("") } : null,
    lateOnly ? { key: "lateOnly", label: "Late", value: "Late only", onRemove: () => setLateOnly(false) } : null,
    earlyCheckoutOnly ? { key: "earlyCheckout", label: "Early", value: "Early checkout", onRemove: () => setEarlyCheckoutOnly(false) } : null,
    payrollImpact ? { key: "payrollImpact", label: "Payroll", value: "Impact only", onRemove: () => setPayrollImpact(false) } : null,
    dateFrom || dateTo ? { key: "date", label: "Date", value: `${dateFrom || "Any"} - ${dateTo || "Any"}`, onRemove: () => setRange({}) } : null
  ].filter(Boolean) as Array<{ key: string; label: string; value: string; onRemove: () => void }>;

  if (!canView) return <PageShell><Panel><EmptyState title="Attendance unavailable" description="Your account needs attendance.view permission." /></Panel></PageShell>;
  if (attendanceDisabled) return <PageShell><PageHeader title="Attendance Records" description="Attendance module is disabled." /><AttendanceNav /><Panel><EmptyState title="Attendance module is disabled." description="Attendance records and manual actions are hidden until an administrator enables the module in Attendance Settings." /></Panel></PageShell>;

  return (
    <PageShell>
      <PageHeader
        title="Attendance Records"
        description="Daily attendance, raw punches, correction requests, and payroll impact foundation."
        actions={
          <>
          <ExportMenu
            moduleName="Attendance records"
            rows={records as unknown as Record<string, unknown>[]}
            columns={["employee_no", "employee_name", "department_name", "location_name", "attendance_date", "status", "first_clock_in", "last_clock_out", "total_work_minutes", "late_minutes", "early_checkout_minutes", "source", "payroll_impact_json", "notes"]}
            filterSummary={activeChips.map((chip) => `${chip.label}: ${chip.value}`)}
          />
          <Link to="/settings/admin/imports"><ActionTextButton intent="import" size="sm">Validate attendance import</ActionTextButton></Link>
          {canManageLogs ? <ActionTextButton intent="create" size="sm" onClick={() => setEditingLog(null)}><Plus className="h-4 w-4" /> Manual log</ActionTextButton> : null}
          {canDevices ? <ActionTextButton intent="import" size="sm" onClick={() => setRawImportOpen(true)}><FileClock className="h-4 w-4" /> Import raw logs</ActionTextButton> : null}
          {canCorrect ? <ActionTextButton intent="create" size="sm" onClick={() => setCorrectionOpen(true)}>Request correction</ActionTextButton> : null}
          {canManage ? <ActionTextButton intent="create" size="sm" onClick={() => setEditing(null)}><Plus className="h-4 w-4" /> Manual record</ActionTextButton> : null}
          </>
        }
      />
      <AttendanceNav />
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <StandardFilterBar
        search={<StandardSearchInput value={search} onDebouncedChange={setSearch} placeholder="Search employee..." />}
        reset={<FilterResetButton onReset={resetFilters} />}
        moreFilters={
          <MoreFiltersSheet onReset={resetFilters}>
            <FilterSection title="Attendance">
              <StandardSelectFilter value={source} onValueChange={setSource} allLabel="All sources" options={["DEVICE", "MANUAL", "CORRECTION", "LEAVE", "ROSTER", "SYSTEM"].map((item) => ({ value: item, label: item }))} />
              <StandardSelectFilter value={missedPunch} onValueChange={setMissedPunch} allLabel="Missed punch: any" options={[{ value: "true", label: "Missed punch" }, { value: "false", label: "No missed punch" }]} />
              <CheckboxField label="Late only" checked={lateOnly} onChange={setLateOnly} />
              <CheckboxField label="Early checkout" checked={earlyCheckoutOnly} onChange={setEarlyCheckoutOnly} />
              <CheckboxField label="Payroll impact" checked={payrollImpact} onChange={setPayrollImpact} />
            </FilterSection>
            <FilterSection title="Organization">
              <StandardSelectFilter value={locationId} onValueChange={setLocationId} allLabel="All locations" width="department" options={locations.filter((location) => location.is_active !== false).map((location) => ({ value: location.id, label: location.name }))} />
              <StandardSelectFilter value={departmentId} onValueChange={setDepartmentId} allLabel="All departments" width="department" options={departments.filter((department) => department.is_active !== false).map((department) => ({ value: department.id, label: department.name }))} />
              <StandardSelectFilter value={positionId} onValueChange={setPositionId} allLabel="All positions" width="position" options={positions.filter((position) => position.is_active !== false).map((position) => ({ value: position.id, label: position.title }))} />
            </FilterSection>
          </MoreFiltersSheet>
        }
      >
        <StandardSelectFilter value={departmentId} onValueChange={setDepartmentId} allLabel="All departments" width="department" options={departments.filter((department) => department.is_active !== false).map((department) => ({ value: department.id, label: department.name }))} />
        <StandardDateRangeFilter value={dateRange} onChange={setRange} label="Date Range" />
        <StandardSelectFilter value={status} onValueChange={setStatus} allLabel="All statuses" width="status" options={["PRESENT", "ABSENT", "LATE", "EARLY_LEAVE", "HALF_DAY", "LEAVE", "SICK_LEAVE", "LONG_LEAVE", "DAY_OFF", "PUBLIC_HOLIDAY", "MISSING_PUNCH", "PENDING_CORRECTION", "CORRECTED"].map((item) => ({ value: item, label: item }))} />
      </StandardFilterBar>
      <ActiveFilterChips chips={activeChips} />
      <Panel className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Date</TableHead><TableHead>Status</TableHead><TableHead>Clock in/out</TableHead><TableHead>Work</TableHead><TableHead>Late/Early</TableHead><TableHead>Source</TableHead><TableHead>Payroll impact</TableHead><TableHead>Notes</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {records.map((record) => <TableRow key={record.id}>
                <TableCell><EmployeeIdentityCell employeeId={record.employee_id} employeeName={record.employee_name} employeeNumber={record.employee_no} departmentName={record.department_name} locationName={record.location_name} size="sm" /></TableCell>
                <TableCell>{record.attendance_date}</TableCell>
                <TableCell><Badge tone={statusTone(record.status)}>{record.status}</Badge>{record.missed_punch ? <Badge tone="warning" className="ml-1">Missed punch</Badge> : null}</TableCell>
                <TableCell>{record.first_clock_in ? new Date(record.first_clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"} / {record.last_clock_out ? new Date(record.last_clock_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"}</TableCell>
                <TableCell>{record.total_work_minutes ?? 0} min</TableCell>
                <TableCell>{record.late_minutes ?? 0} / {record.early_checkout_minutes ?? 0}</TableCell>
                <TableCell>{record.source}</TableCell>
                <TableCell className="max-w-64 truncate">{record.payroll_impact_json ?? "None"}</TableCell>
                <TableCell className="max-w-48 truncate">{record.notes ?? "-"}</TableCell>
                <TableCell><div className="flex justify-end gap-1">{canManage ? <RowActionButton intent="edit" title="Edit" onClick={() => setEditing(record)}><Edit className="h-4 w-4" /></RowActionButton> : null}{canManage ? <RowActionButton intent="calculate" title="Recalculate" onClick={() => void recalculate(record)}><RefreshCw className="h-4 w-4" /></RowActionButton> : null}</div></TableCell>
              </TableRow>)}
            </TableBody>
          </Table>
        </div>
        {loading ? <TableSkeleton rows={6} columns={10} label="Loading attendance records" /> : records.length === 0 ? <EmptyState title="No attendance records found" description="Create records, import raw logs, or adjust filters." /> : null}
      </Panel>
      <Panel className="overflow-hidden">
        <div className="border-b px-3 py-2"><h2 className="text-sm font-semibold">Recent Attendance Logs</h2></div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Log time</TableHead><TableHead>Type</TableHead><TableHead>Source</TableHead><TableHead>Notes</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>{logs.slice(0, 12).map((log) => <TableRow key={log.id}><TableCell>{log.employee_name ?? log.external_employee_code ?? "-"}</TableCell><TableCell>{new Date(log.log_time).toLocaleString()}</TableCell><TableCell>{log.log_type}</TableCell><TableCell>{log.source}</TableCell><TableCell className="max-w-64 truncate">{log.notes ?? "-"}</TableCell><TableCell><div className="flex justify-end">{canManageLogs ? <RowActionButton intent="edit" title="Edit log" onClick={() => setEditingLog(log)}><Edit className="h-4 w-4" /></RowActionButton> : null}</div></TableCell></TableRow>)}</TableBody>
          </Table>
        </div>
        {loading ? <TableSkeleton rows={4} columns={6} label="Loading attendance logs" /> : logs.length === 0 ? <EmptyState title="No attendance logs found" description="Manual and device-normalized logs will appear here." /> : null}
      </Panel>
      <Panel className="overflow-hidden">
        <div className="border-b px-3 py-2"><h2 className="text-sm font-semibold">Recent Raw Device Logs</h2></div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Device</TableHead><TableHead>Punch time</TableHead><TableHead>Type</TableHead><TableHead>Source</TableHead><TableHead>Imported</TableHead></TableRow></TableHeader>
            <TableBody>{rawLogs.slice(0, 12).map((log) => <TableRow key={log.id}><TableCell>{log.employee_name ?? log.external_employee_code ?? "-"}</TableCell><TableCell>{log.device_name ?? log.device_code ?? "-"}</TableCell><TableCell>{new Date(log.punch_time).toLocaleString()}</TableCell><TableCell>{log.punch_type ?? "UNKNOWN"}</TableCell><TableCell>{log.source}</TableCell><TableCell>{new Date(log.imported_at).toLocaleString()}</TableCell></TableRow>)}</TableBody>
          </Table>
        </div>
        {loading ? <TableSkeleton rows={4} columns={6} label="Loading raw attendance logs" /> : rawLogs.length === 0 ? <EmptyState title="No raw logs found" description="Raw device and import logs will appear here." /> : null}
      </Panel>
      {editing !== undefined && token ? <AttendanceRecordModal token={token} employees={employees} record={editing} onClose={() => setEditing(undefined)} onSaved={load} /> : null}
      {editingLog !== undefined && token ? <AttendanceManualLogModal token={token} employees={employees} log={editingLog} onClose={() => setEditingLog(undefined)} onSaved={load} /> : null}
      {correctionOpen && token ? <AttendanceCorrectionModal token={token} employees={employees} onClose={() => setCorrectionOpen(false)} onSaved={load} /> : null}
      {rawImportOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4">
          <div className="w-full max-w-2xl rounded-lg border bg-white shadow-xl">
            <div className="border-b px-4 py-3"><h2 className="text-base font-semibold">Import Raw Attendance Logs</h2><p className="text-sm text-muted-foreground">Paste an array of device/API punch objects. Duplicate logs are skipped by the backend.</p></div>
            <div className="p-4"><TextareaField className="min-h-64 w-full rounded-md border bg-white p-3 font-mono text-xs" value={rawJson} onChange={(event) => setRawJson(event.target.value)} /></div>
            <div className="flex justify-end gap-2 border-t px-4 py-3"><Button variant="outline" onClick={() => setRawImportOpen(false)}>Cancel</Button><ActionTextButton intent="import" onClick={() => void importRawLogs()}>Import logs</ActionTextButton></div>
          </div>
        </div>
      ) : null}
    </PageShell>
  );
}
