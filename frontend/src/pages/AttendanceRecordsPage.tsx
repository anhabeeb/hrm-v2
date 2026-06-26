import { Edit, FileClock, Plus, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmployeeIdentityCell } from "../components/employee/EmployeeIdentityCell";
import { AttendanceCorrectionModal } from "../components/attendance/AttendanceCorrectionModal";
import { AttendanceManualLogModal } from "../components/attendance/AttendanceManualLogModal";
import { AttendanceNav } from "../components/attendance/AttendanceNav";
import { AttendanceRecordModal } from "../components/attendance/AttendanceRecordModal";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import type { AttendanceLog, AttendanceRawLog, AttendanceRecord } from "../types/attendance";
import type { Employee } from "../types/employees";
import type { OrganizationDepartment, OrganizationLocation, OrganizationPosition } from "../types/organization";
import { CheckboxField, SelectField, TextareaField } from "../components/ui/page-shell";

function statusTone(status: string) {
  if (status === "PRESENT") return "success" as const;
  if (status === "LATE" || status === "HALF_DAY" || status === "PENDING_CORRECTION") return "warning" as const;
  if (status === "ABSENT") return "danger" as const;
  return "neutral" as const;
}

export function AttendanceRecordsPage() {
  const { token, user } = useAuth();
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
      const [recordResult, logResult, employeeResult, departmentResult, positionResult, locationResult] = await Promise.all([
        api.listAttendanceRecords(token, filters),
        api.listAttendanceRawLogs(token, rawLogFilters),
        api.listEmployees(token),
        api.listDepartments(token),
        api.listPositions(token),
        api.listLocations(token)
      ]);
      const attendanceLogs = await api.listAttendanceLogs(token, { ...rawLogFilters, log_from: dateFrom ? `${dateFrom}T00:00:00` : "", log_to: dateTo ? `${dateTo}T23:59:59` : "" });
      setRecords(recordResult.records);
      setRawLogs(logResult.logs);
      setLogs(attendanceLogs.logs);
      setEmployees(employeeResult.employees);
      setDepartments(departmentResult.departments);
      setPositions(positionResult.positions);
      setLocations(locationResult.locations);
    } catch (err) {
      if (err instanceof ApiError && err.code === "ATTENDANCE_MODULE_DISABLED") {
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
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to queue recalculation.");
    }
  }

  async function importRawLogs() {
    if (!token) return;
    try {
      const logs = JSON.parse(rawJson) as Record<string, unknown>[];
      await api.importAttendanceRawLogs(token, { logs, source: "MANUAL_IMPORT" });
      setRawImportOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Enter valid raw log JSON before importing.");
    }
  }

  if (!canView) return <Panel><EmptyState title="Attendance unavailable" description="Your account needs attendance.view permission." /></Panel>;
  if (attendanceDisabled) return <div className="space-y-4"><div><h1 className="text-lg font-semibold">Attendance Records</h1><p className="text-sm text-muted-foreground">Attendance module is disabled.</p></div><AttendanceNav /><Panel><EmptyState title="Attendance module is disabled." description="Attendance records and manual actions are hidden until an administrator enables the module in Attendance Settings." /></Panel></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Attendance Records</h1>
          <p className="text-sm text-muted-foreground">Daily attendance, raw punches, correction requests, and payroll impact foundation.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canManageLogs ? <Button variant="outline" size="sm" onClick={() => setEditingLog(null)}><Plus className="h-4 w-4" /> Manual log</Button> : null}
          {canDevices ? <Button variant="outline" size="sm" onClick={() => setRawImportOpen(true)}><FileClock className="h-4 w-4" /> Import raw logs</Button> : null}
          {canCorrect ? <Button variant="outline" size="sm" onClick={() => setCorrectionOpen(true)}>Request correction</Button> : null}
          {canManage ? <Button size="sm" onClick={() => setEditing(null)}><Plus className="h-4 w-4" /> Manual record</Button> : null}
        </div>
      </div>
      <AttendanceNav />
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Panel className="overflow-hidden">
        <div className="grid gap-2 border-b p-3 md:grid-cols-4 xl:grid-cols-8">
          <div className="relative md:col-span-2"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search employee or number" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <SelectField className="h-9 rounded-md border bg-white px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{["PRESENT", "ABSENT", "LATE", "EARLY_LEAVE", "HALF_DAY", "LEAVE", "SICK_LEAVE", "LONG_LEAVE", "DAY_OFF", "PUBLIC_HOLIDAY", "MISSING_PUNCH", "PENDING_CORRECTION", "CORRECTED"].map((item) => <option key={item} value={item}>{item}</option>)}</SelectField>
          <SelectField className="h-9 rounded-md border bg-white px-3 text-sm" value={source} onChange={(event) => setSource(event.target.value)}><option value="">All sources</option>{["DEVICE", "MANUAL", "CORRECTION", "LEAVE", "ROSTER", "SYSTEM"].map((item) => <option key={item} value={item}>{item}</option>)}</SelectField>
          <SelectField className="h-9 rounded-md border bg-white px-3 text-sm" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}><option value="">All departments</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</SelectField>
          <SelectField className="h-9 rounded-md border bg-white px-3 text-sm" value={positionId} onChange={(event) => setPositionId(event.target.value)}><option value="">All positions</option>{positions.map((position) => <option key={position.id} value={position.id}>{position.title}</option>)}</SelectField>
          <SelectField className="h-9 rounded-md border bg-white px-3 text-sm" value={locationId} onChange={(event) => setLocationId(event.target.value)}><option value="">All locations</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</SelectField>
          <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} aria-label="Date from" />
          <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} aria-label="Date to" />
          <SelectField className="h-9 rounded-md border bg-white px-3 text-sm" value={missedPunch} onChange={(event) => setMissedPunch(event.target.value)}><option value="">Missed punch: any</option><option value="true">Missed punch</option><option value="false">No missed punch</option></SelectField>
          <CheckboxField label="Late only" checked={lateOnly} onChange={setLateOnly} />
          <CheckboxField label="Early checkout" checked={earlyCheckoutOnly} onChange={setEarlyCheckoutOnly} />
          <CheckboxField label="Payroll impact" checked={payrollImpact} onChange={setPayrollImpact} />
        </div>
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
                <TableCell><div className="flex justify-end gap-1">{canManage ? <Button title="Edit" variant="ghost" size="icon" onClick={() => setEditing(record)}><Edit className="h-4 w-4" /></Button> : null}{canManage ? <Button title="Recalculate" variant="ghost" size="icon" onClick={() => void recalculate(record)}><RefreshCw className="h-4 w-4" /></Button> : null}</div></TableCell>
              </TableRow>)}
            </TableBody>
          </Table>
        </div>
        {loading ? <EmptyState title="Loading attendance records" description="Fetching attendance data." /> : records.length === 0 ? <EmptyState title="No attendance records found" description="Create records, import raw logs, or adjust filters." /> : null}
      </Panel>
      <Panel className="overflow-hidden">
        <div className="border-b px-3 py-2"><h2 className="text-sm font-semibold">Recent Attendance Logs</h2></div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Log time</TableHead><TableHead>Type</TableHead><TableHead>Source</TableHead><TableHead>Notes</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>{logs.slice(0, 12).map((log) => <TableRow key={log.id}><TableCell>{log.employee_name ?? log.external_employee_code ?? "-"}</TableCell><TableCell>{new Date(log.log_time).toLocaleString()}</TableCell><TableCell>{log.log_type}</TableCell><TableCell>{log.source}</TableCell><TableCell className="max-w-64 truncate">{log.notes ?? "-"}</TableCell><TableCell><div className="flex justify-end">{canManageLogs ? <Button title="Edit log" variant="ghost" size="icon" onClick={() => setEditingLog(log)}><Edit className="h-4 w-4" /></Button> : null}</div></TableCell></TableRow>)}</TableBody>
          </Table>
        </div>
        {!loading && logs.length === 0 ? <EmptyState title="No attendance logs found" description="Manual and device-normalized logs will appear here." /> : null}
      </Panel>
      <Panel className="overflow-hidden">
        <div className="border-b px-3 py-2"><h2 className="text-sm font-semibold">Recent Raw Device Logs</h2></div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Device</TableHead><TableHead>Punch time</TableHead><TableHead>Type</TableHead><TableHead>Source</TableHead><TableHead>Imported</TableHead></TableRow></TableHeader>
            <TableBody>{rawLogs.slice(0, 12).map((log) => <TableRow key={log.id}><TableCell>{log.employee_name ?? log.external_employee_code ?? "-"}</TableCell><TableCell>{log.device_name ?? log.device_code ?? "-"}</TableCell><TableCell>{new Date(log.punch_time).toLocaleString()}</TableCell><TableCell>{log.punch_type ?? "UNKNOWN"}</TableCell><TableCell>{log.source}</TableCell><TableCell>{new Date(log.imported_at).toLocaleString()}</TableCell></TableRow>)}</TableBody>
          </Table>
        </div>
        {!loading && rawLogs.length === 0 ? <EmptyState title="No raw logs found" description="Raw device and import logs will appear here." /> : null}
      </Panel>
      {editing !== undefined && token ? <AttendanceRecordModal token={token} employees={employees} record={editing} onClose={() => setEditing(undefined)} onSaved={load} /> : null}
      {editingLog !== undefined && token ? <AttendanceManualLogModal token={token} employees={employees} log={editingLog} onClose={() => setEditingLog(undefined)} onSaved={load} /> : null}
      {correctionOpen && token ? <AttendanceCorrectionModal token={token} employees={employees} onClose={() => setCorrectionOpen(false)} onSaved={load} /> : null}
      {rawImportOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4">
          <div className="w-full max-w-2xl rounded-lg border bg-white shadow-xl">
            <div className="border-b px-4 py-3"><h2 className="text-base font-semibold">Import Raw Attendance Logs</h2><p className="text-sm text-muted-foreground">Paste an array of device/API punch objects. Duplicate logs are skipped by the backend.</p></div>
            <div className="p-4"><TextareaField className="min-h-64 w-full rounded-md border bg-white p-3 font-mono text-xs" value={rawJson} onChange={(event) => setRawJson(event.target.value)} /></div>
            <div className="flex justify-end gap-2 border-t px-4 py-3"><Button variant="outline" onClick={() => setRawImportOpen(false)}>Cancel</Button><Button onClick={() => void importRawLogs()}>Import logs</Button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
