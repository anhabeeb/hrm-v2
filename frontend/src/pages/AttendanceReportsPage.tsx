import { useEffect, useMemo, useState } from "react";
import { AttendanceNav } from "../components/attendance/AttendanceNav";
import { ExportMenu } from "../components/export/ExportMenu";
import { ActiveFilterChips, FilterResetButton, formatDateRangeLabel, MoreFiltersSheet, StandardDateRangeFilter, StandardFilterBar, StandardSearchInput } from "../components/filters";
import { Badge } from "../components/ui/badge";
import { EmptyState } from "../components/ui/empty-state";
import { TableSkeleton } from "../components/loading";
import { OrganizationCascadeSelector } from "../components/organization/OrganizationCascadeSelector";
import { PageHeader, PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import { downloadBlob } from "../lib/export-utils";
import type { OrganizationDepartment, OrganizationLocation } from "../types/organization";

export function AttendanceReportsPage() {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("attendance.reports.view") || permissions.has("attendance.view");
  const canExport = permissions.has("attendance.reports.export");
  const [reports, setReports] = useState<Record<string, unknown>[]>([]);
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [locationId, setLocationId] = useState("");
  const defaultDate = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [dateFrom, setDateFrom] = useState(defaultDate);
  const [dateTo, setDateTo] = useState(defaultDate);
  const [attendanceDisabled, setAttendanceDisabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo(() => ({ search, department_id: departmentId, location_id: locationId, date_from: dateFrom, date_to: dateTo }), [search, departmentId, locationId, dateFrom, dateTo]);
  const dateRange = useMemo(() => ({ from: dateFrom, to: dateTo }), [dateFrom, dateTo]);
  const activeFilterChips = useMemo(() => [
    ...(search ? [{ key: "search", label: "Search", value: search, onRemove: () => setSearch("") }] : []),
    ...(departmentId ? [{ key: "department", label: "Department", value: departments.find((department) => department.id === departmentId)?.name ?? departmentId, onRemove: () => setDepartmentId("") }] : []),
    ...(locationId ? [{ key: "location", label: "Location", value: locations.find((location) => location.id === locationId)?.name ?? locationId, onRemove: () => setLocationId("") }] : []),
    ...(dateFrom !== defaultDate || dateTo !== defaultDate ? [{ key: "date", label: "Date", value: formatDateRangeLabel(dateRange), onRemove: () => { setDateFrom(defaultDate); setDateTo(defaultDate); } }] : [])
  ], [dateFrom, dateRange, dateTo, defaultDate, departmentId, departments, locationId, locations, search]);

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    setError(null);
    try {
      setAttendanceDisabled(false);
      const [reportResult, departmentResult, locationResult] = await Promise.all([
        api.getAttendanceReports(token, filters),
        api.listDepartments(token),
        api.listLocations(token)
      ]);
      setReports(reportResult.reports);
      setDepartments(departmentResult.departments);
      setLocations(locationResult.locations);
    } catch (err) {
      if (err instanceof ApiError && (err.code === "ATTENDANCE_MODULE_DISABLED" || err.code === "MODULE_DISABLED")) {
        setAttendanceDisabled(true);
        setReports([]);
        return;
      }
      setError(err instanceof ApiError ? err.message : "Unable to load attendance reports.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, canView, filters]);

  async function exportCsv() {
    if (!token) return;
    try {
      const download = await api.exportAttendanceReportCsv(token, filters);
      downloadBlob(download.blob, download.filename || `attendance-report-${dateFrom || "all"}-${dateTo || "all"}.csv`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to export attendance report.");
    }
  }

  if (!canView) return <PageShell><Panel><EmptyState title="Attendance reports unavailable" description="Your account needs attendance.reports.view permission." /></Panel></PageShell>;
  if (attendanceDisabled) return <PageShell><PageHeader title="Attendance Reports" description="Attendance module is disabled." /><AttendanceNav /><Panel><EmptyState title="Attendance module is disabled." description="Attendance report data and exports are hidden until an administrator enables the module." /></Panel></PageShell>;

  return (
    <PageShell>
      <PageHeader
        title="Attendance Reports"
        description="Attendance summary exports prepared for payroll reconciliation."
        actions={canExport ? (
          <ExportMenu
            moduleName="Attendance Reports"
            rows={reports}
            columns={["employee_no", "employee_name", "department_name", "location_name", "present_days", "absent_days", "late_days", "missed_punch_days", "total_work_minutes"]}
            filterSummary={Object.entries(filters).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`)}
            onBackendExport={async (format) => {
              if (format === "csv") {
                await exportCsv();
                return;
              }
              const { exportRows } = await import("../lib/export-utils");
              exportRows(format, "Attendance Reports", ["employee_no", "employee_name", "department_name", "location_name", "present_days", "absent_days", "late_days", "missed_punch_days", "total_work_minutes"], reports, Object.entries(filters).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`));
            }}
          />
        ) : null}
      />
      <AttendanceNav />
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Panel className="overflow-hidden">
        <div className="border-b p-3">
          <StandardFilterBar
            search={<StandardSearchInput value={search} onDebouncedChange={setSearch} placeholder="Search employee" />}
            reset={<FilterResetButton onReset={() => { setSearch(""); setDepartmentId(""); setLocationId(""); }} />}
            moreFilters={
              <MoreFiltersSheet onReset={() => { setDepartmentId(""); setLocationId(""); }}>
                <OrganizationCascadeSelector
                  value={{ locationId, departmentId }}
                  onChange={(next) => {
                    setLocationId(next.locationId ?? "");
                    setDepartmentId(next.departmentId ?? "");
                  }}
                  departments={departments}
                  locations={locations}
                  jobLevels={[]}
                  positions={[]}
                  includeLocation
                  includeJobLevel={false}
                  includePosition={false}
                  mode="report-filter"
                  labels={{ locationId: "Location", departmentId: "Department" }}
                  className="grid gap-2"
                />
              </MoreFiltersSheet>
            }
          >
            <StandardDateRangeFilter value={dateRange} onChange={(range) => { setDateFrom(range.from ?? ""); setDateTo(range.to ?? ""); }} label="Date Range" />
          </StandardFilterBar>
          <ActiveFilterChips chips={activeFilterChips} className="mt-2" />
        </div>
        {loading ? <TableSkeleton rows={6} columns={6} label="Loading attendance reports" /> : reports.length === 0 ? <EmptyState title="No report rows found" description="Create attendance records or adjust filters." /> : (
          <div className="flex flex-col gap-2 p-3">
            {reports.map((row, index) => (
              <div key={String(row.employee_id ?? index)} style={{ display: "flex", alignItems: "center", gap: 16, padding: "0.9rem 1.1rem", background: "var(--v3-surface-2)", border: "0.5px solid var(--v3-border)", borderRadius: "var(--v3-radius-card)" }}>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-slate-900">{String(row.employee_name ?? "-")}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="font-mono">{String(row.employee_no ?? "")}</span>
                    {row.department_name ? <><span>&middot;</span><span>{String(row.department_name)}</span></> : null}
                    {row.location_name ? <><span>&middot;</span><span>{String(row.location_name)}</span></> : null}
                    <span>&middot;</span>
                    <span>{String(row.total_work_minutes ?? 0)} min worked</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Badge tone="success">Present {String(row.present_days ?? 0)}</Badge>
                  <Badge tone="danger">Absent {String(row.absent_days ?? 0)}</Badge>
                  <Badge tone="warning">Late {String(row.late_days ?? 0)}</Badge>
                  <Badge tone="neutral">Missed {String(row.missed_punch_days ?? 0)}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </PageShell>
  );
}
