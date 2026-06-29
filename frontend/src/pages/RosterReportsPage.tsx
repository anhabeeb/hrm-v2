import { useEffect, useMemo, useState } from "react";
import { ActiveFilterChips, FilterResetButton, formatDateRangeLabel, MoreFiltersSheet, StandardDateRangeFilter, StandardFilterBar, StandardSearchInput, StandardSelectFilter } from "../components/filters";
import { ExportMenu } from "../components/export/ExportMenu";
import { TableSkeleton } from "../components/loading";
import { OrganizationCascadeSelector } from "../components/organization/OrganizationCascadeSelector";
import { RosterNav } from "../components/roster/RosterNav";
import { EmptyState } from "../components/ui/empty-state";
import { PageHeader, PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import { downloadBlob } from "../lib/export-utils";
import type { OrganizationDepartment, OrganizationLocation } from "../types/organization";
import type { RosterAssignmentStatus } from "../types/roster";

const statuses: RosterAssignmentStatus[] = ["UNASSIGNED", "DRAFT", "PUBLISHED", "CHANGED_AFTER_PUBLISH", "SCHEDULED", "DAY_OFF", "OFF", "LEAVE", "SICK_LEAVE", "LONG_LEAVE", "PUBLIC_HOLIDAY", "CONFLICT", "CANCELLED", "ABSENT_PLACEHOLDER"];

export function RosterReportsPage() {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("roster.reports.view");
  const canExport = permissions.has("roster.reports.export");
  const defaultWeekStart = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [weekStart, setWeekStart] = useState(defaultWeekStart);
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [status, setStatus] = useState("");
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [reports, setReports] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [moduleDisabled, setModuleDisabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const filters = useMemo(() => ({ week_start_date: weekStart, search, department_id: departmentId, location_id: locationId, status }), [weekStart, search, departmentId, locationId, status]);
  const weekRange = useMemo(() => ({ from: weekStart, to: weekStart }), [weekStart]);
  const activeFilterChips = useMemo(() => [
    ...(search ? [{ key: "search", label: "Search", value: search, onRemove: () => setSearch("") }] : []),
    ...(weekStart !== defaultWeekStart ? [{ key: "week", label: "Week", value: formatDateRangeLabel(weekRange), onRemove: () => setWeekStart(defaultWeekStart) }] : []),
    ...(status ? [{ key: "status", label: "Status", value: status.replace(/_/g, " "), title: status, onRemove: () => setStatus("") }] : []),
    ...(departmentId ? [{ key: "department", label: "Department", value: departments.find((department) => department.id === departmentId)?.name ?? departmentId, onRemove: () => setDepartmentId("") }] : []),
    ...(locationId ? [{ key: "location", label: "Location", value: locations.find((location) => location.id === locationId)?.name ?? locationId, onRemove: () => setLocationId("") }] : [])
  ], [defaultWeekStart, departmentId, departments, locationId, locations, search, status, weekRange, weekStart]);

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    setError(null);
    setModuleDisabled(false);
    try {
      const [reportResult, departmentResult, locationResult] = await Promise.all([api.getRosterReports(token, filters), api.listDepartments(token), api.listLocations(token)]);
      setReports(reportResult.reports);
      setDepartments(departmentResult.departments);
      setLocations(locationResult.locations);
    } catch (err) {
      if (err instanceof ApiError && err.code === "ROSTER_MODULE_DISABLED") {
        setModuleDisabled(true);
        setReports([]);
        return;
      }
      setError(err instanceof ApiError ? err.message : "Unable to load roster reports.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, canView, filters]);

  const filtered = reports;

  async function exportCsv() {
    if (!token) return;
    try {
      const download = await api.exportRosterReportCsv(token, filters);
      downloadBlob(download.blob, download.filename || `roster-report-${weekStart}.csv`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to export roster report.");
    }
  }

  if (!canView) return <PageShell><Panel><EmptyState title="Roster reports unavailable" description="Your account needs roster.reports.view permission." /></Panel></PageShell>;
  if (moduleDisabled) {
    return (
      <PageShell>
        <PageHeader title="Roster Reports" description="Roster module is disabled." />
        <RosterNav />
        <Panel><EmptyState title="Roster module is disabled" description="Enable roster from settings before viewing roster reports." /></Panel>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Roster Reports"
        description="Weekly schedule summaries prepared for payroll and operations exports."
        actions={canExport ? (
          <ExportMenu
            moduleName="Roster Reports"
            rows={filtered}
            columns={["employee_no", "employee_name", "department_name", "location_name", "scheduled_days", "off_days", "leave_days", "unassigned_days", "scheduled_minutes"]}
            filterSummary={Object.entries(filters).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`)}
            onBackendExport={async (format) => {
              if (format === "csv") {
                await exportCsv();
                return;
              }
              const { exportRows } = await import("../lib/export-utils");
              exportRows(format, "Roster Reports", ["employee_no", "employee_name", "department_name", "location_name", "scheduled_days", "off_days", "leave_days", "unassigned_days", "scheduled_minutes"], filtered, Object.entries(filters).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`));
            }}
          />
        ) : null}
      />
      <RosterNav />
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Panel className="overflow-hidden">
        <div className="border-b p-3">
          <StandardFilterBar
            search={<StandardSearchInput value={search} onDebouncedChange={setSearch} placeholder="Search employee" />}
            reset={<FilterResetButton onReset={() => { setSearch(""); setWeekStart(defaultWeekStart); setDepartmentId(""); setLocationId(""); setStatus(""); }} />}
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
            <StandardDateRangeFilter value={weekRange} onChange={(range) => setWeekStart(range.from ?? weekStart)} label="Week Start" />
            <StandardSelectFilter value={status} onValueChange={setStatus} allLabel="All statuses" width="status" options={statuses.map((item) => ({ value: item, label: item }))} />
          </StandardFilterBar>
          <ActiveFilterChips chips={activeFilterChips} className="mt-2" />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Department</TableHead><TableHead>Location</TableHead><TableHead>Scheduled</TableHead><TableHead>Off</TableHead><TableHead>Leave</TableHead><TableHead>Unassigned</TableHead><TableHead>Scheduled minutes</TableHead></TableRow></TableHeader>
            <TableBody>{filtered.map((row, index) => <TableRow key={String(row.employee_id ?? index)}><TableCell><div className="font-medium">{String(row.employee_name ?? "-")}</div><div className="font-mono text-xs text-muted-foreground">{String(row.employee_no ?? "")}</div></TableCell><TableCell>{String(row.department_name ?? "-")}</TableCell><TableCell>{String(row.location_name ?? "-")}</TableCell><TableCell>{String(row.scheduled_days ?? 0)}</TableCell><TableCell>{String(row.off_days ?? 0)}</TableCell><TableCell>{String(row.leave_days ?? 0)}</TableCell><TableCell>{String(row.unassigned_days ?? 0)}</TableCell><TableCell>{String(row.scheduled_minutes ?? 0)}</TableCell></TableRow>)}</TableBody>
          </Table>
        </div>
        {loading ? <TableSkeleton rows={6} columns={9} label="Loading roster reports" /> : filtered.length === 0 ? <EmptyState title="No roster report rows" description="Create assignments or adjust filters." /> : null}
      </Panel>
    </PageShell>
  );
}
