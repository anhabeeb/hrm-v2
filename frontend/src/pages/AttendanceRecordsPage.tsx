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
import { PerformanceDataTable } from "../components/table/PerformanceDataTable";
import { TablePaginationBar } from "../components/table/TablePaginationBar";
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
import { useAuth } from "../hooks/useAuth";
import { useDebouncedTableFilters } from "../hooks/useDebouncedTableFilters";
import { usePaginatedQuery } from "../hooks/usePaginatedQuery";
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
  const [recordPage, setRecordPage] = useState(1);
  const [recordPageSize, setRecordPageSize] = useState(25);
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
  const { debouncedFilters, isDebouncing } = useDebouncedTableFilters(filters, 300);
  const recordsQuery = usePaginatedQuery<{ records: AttendanceRecord[]; pagination?: Record<string, unknown> }>({
    scope: user?.id,
    tableName: "attendance-records",
    page: recordPage,
    pageSize: recordPageSize,
    filters: debouncedFilters,
    enabled: Boolean(token && canView && !attendanceDisabled),
    queryFn: ({ signal, pagination }) => api.listAttendanceRecords(token!, { ...debouncedFilters, limit: pagination.limit, offset: pagination.offset }, signal),
    getRowCount: (data) => data?.records.length ?? 0
  });
  const records = recordsQuery.data?.records ?? [];
  const recordPagination = recordsQuery.data?.pagination;

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
      const [logResult, employeeResult, departmentResult, jobLevelResult, positionResult, locationResult] = await Promise.all([
        api.listAttendanceRawLogs(token, rawLogFilters),
        api.listEmployees(token, { limit: 100 }),
        api.listDepartments(token),
        api.listJobLevels(token),
        api.listPositions(token),
        api.listLocations(token)
      ]);
      const attendanceLogs = await api.listAttendanceLogs(token, { ...rawLogFilters, log_from: dateFrom ? `${dateFrom}T00:00:00` : "", log_to: dateTo ? `${dateTo}T23:59:59` : "" });
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
  }, [token, canView, rawLogFilters]);

  useEffect(() => {
    setRecordPage(1);
  }, [filters]);

  useEffect(() => {
    if (recordsQuery.error instanceof ApiError && (recordsQuery.error.code === "ATTENDANCE_MODULE_DISABLED" || recordsQuery.error.code === "MODULE_DISABLED")) {
      setAttendanceDisabled(true);
    }
  }, [recordsQuery.error]);

  async function recalculate(record: AttendanceRecord) {
    if (!token) return;
    try {
      await api.recalculateAttendanceRecord(token, record.id);
      alerts.showSuccess("Recalculation queued", "Attendance record recalculation was queued.");
      await recordsQuery.refetch();
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
      await Promise.all([load(), recordsQuery.refetch()]);
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
    setRecordPage(1);
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
      <PerformanceDataTable loading={loading || recordsQuery.isInitialLoading} refreshing={recordsQuery.isRefreshing || isDebouncing} error={error ?? recordsQuery.error?.message ?? null} empty={records.length === 0} rowCount={records.length} emptyTitle="No attendance records found" emptyDescription="Create records, import raw logs, or adjust filters." skeleton={<TableSkeleton rows={5} columns={9} label="Loading attendance records" />} className="border-0 bg-transparent p-0 shadow-none">
        <div className="flex flex-col gap-2">
          {records.map((record) => (
            <div key={record.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "0.9rem 1.1rem", background: "var(--v3-surface-2)", border: "0.5px solid var(--v3-border)", borderRadius: "var(--v3-radius-card)" }}>
              <div className="min-w-0 flex-1">
                <EmployeeIdentityCell employeeId={record.employee_id} employeeName={record.employee_name} employeeNumber={record.employee_no} departmentName={record.department_name} locationName={record.location_name} size="sm" />
                <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 pl-[44px] text-xs text-muted-foreground">
                  <span>{record.attendance_date}</span>
                  <span>&middot;</span>
                  <span>{record.first_clock_in ? new Date(record.first_clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"} / {record.last_clock_out ? new Date(record.last_clock_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"}</span>
                  <span>&middot;</span>
                  <span>{record.total_work_minutes ?? 0} min worked</span>
                  <span>&middot;</span>
                  <span>Late {record.late_minutes ?? 0} / Early {record.early_checkout_minutes ?? 0}</span>
                  <span>&middot;</span>
                  <span>{record.source}</span>
                  {record.notes ? <><span>&middot;</span><span className="max-w-64 truncate">{record.notes}</span></> : null}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Badge tone={statusTone(record.status)}>{record.status}</Badge>
                {record.missed_punch ? <Badge tone="warning">Missed punch</Badge> : null}
                {canManage ? <RowActionButton intent="edit" title="Edit" onClick={() => setEditing(record)}><Edit className="h-4 w-4" /></RowActionButton> : null}
                {canManage ? <RowActionButton intent="calculate" title="Recalculate" onClick={() => void recalculate(record)}><RefreshCw className="h-4 w-4" /></RowActionButton> : null}
              </div>
            </div>
          ))}
        </div>
      </PerformanceDataTable>
      <TablePaginationBar page={recordPage} pageSize={recordPageSize} rowCount={records.length} hasMore={Boolean(recordPagination?.has_more)} onPageChange={setRecordPage} onPageSizeChange={setRecordPageSize} />
      <Panel className="overflow-hidden">
        <div className="border-b px-3 py-2"><h2 className="text-sm font-semibold">Recent Attendance Logs</h2></div>
        {loading ? <TableSkeleton rows={4} columns={6} label="Loading attendance logs" /> : logs.length === 0 ? <EmptyState title="No attendance logs found" description="Manual and device-normalized logs will appear here." /> : (
          <div className="flex flex-col gap-2 p-3">
            {logs.slice(0, 12).map((log) => (
              <div key={log.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "0.75rem 1rem", background: "var(--v3-surface-2)", border: "0.5px solid var(--v3-border)", borderRadius: "var(--v3-radius-card)" }}>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900">{log.employee_name ?? log.external_employee_code ?? "-"}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
                    <span>{new Date(log.log_time).toLocaleString()}</span>
                    <span>&middot;</span>
                    <span>{log.log_type}</span>
                    <span>&middot;</span>
                    <span>{log.source}</span>
                    {log.notes ? <><span>&middot;</span><span className="max-w-64 truncate">{log.notes}</span></> : null}
                  </div>
                </div>
                {canManageLogs ? <RowActionButton intent="edit" title="Edit log" onClick={() => setEditingLog(log)}><Edit className="h-4 w-4" /></RowActionButton> : null}
              </div>
            ))}
          </div>
        )}
      </Panel>
      <Panel className="overflow-hidden">
        <div className="border-b px-3 py-2"><h2 className="text-sm font-semibold">Recent Raw Device Logs</h2></div>
        {loading ? <TableSkeleton rows={4} columns={6} label="Loading raw attendance logs" /> : rawLogs.length === 0 ? <EmptyState title="No raw logs found" description="Raw device and import logs will appear here." /> : (
          <div className="flex flex-col gap-2 p-3">
            {rawLogs.slice(0, 12).map((log) => (
              <div key={log.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "0.75rem 1rem", background: "var(--v3-surface-2)", border: "0.5px solid var(--v3-border)", borderRadius: "var(--v3-radius-card)" }}>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900">{log.employee_name ?? log.external_employee_code ?? "-"}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
                    <span>{log.device_name ?? log.device_code ?? "-"}</span>
                    <span>&middot;</span>
                    <span>{new Date(log.punch_time).toLocaleString()}</span>
                    <span>&middot;</span>
                    <span>{log.punch_type ?? "UNKNOWN"}</span>
                    <span>&middot;</span>
                    <span>{log.source}</span>
                  </div>
                </div>
                <div className="shrink-0 text-xs text-muted-foreground">Imported {new Date(log.imported_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
      </Panel>
      {editing !== undefined && token ? <AttendanceRecordModal token={token} employees={employees} record={editing} onClose={() => setEditing(undefined)} onSaved={async () => { await load(); await recordsQuery.refetch(); }} /> : null}
      {editingLog !== undefined && token ? <AttendanceManualLogModal token={token} employees={employees} log={editingLog} onClose={() => setEditingLog(undefined)} onSaved={async () => { await load(); await recordsQuery.refetch(); }} /> : null}
      {correctionOpen && token ? <AttendanceCorrectionModal token={token} employees={employees} onClose={() => setCorrectionOpen(false)} onSaved={async () => { await load(); await recordsQuery.refetch(); }} /> : null}
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
