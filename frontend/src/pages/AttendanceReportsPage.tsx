import { Download, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AttendanceNav } from "../components/attendance/AttendanceNav";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { OrganizationCascadeSelector } from "../components/organization/OrganizationCascadeSelector";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
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
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [attendanceDisabled, setAttendanceDisabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo(() => ({ search, department_id: departmentId, location_id: locationId, date_from: dateFrom, date_to: dateTo }), [search, departmentId, locationId, dateFrom, dateTo]);

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
      if (err instanceof ApiError && err.code === "ATTENDANCE_MODULE_DISABLED") {
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
      const url = URL.createObjectURL(download.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = download.filename || `attendance-report-${dateFrom || "all"}-${dateTo || "all"}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to export attendance report.");
    }
  }

  if (!canView) return <Panel><EmptyState title="Attendance reports unavailable" description="Your account needs attendance.reports.view permission." /></Panel>;
  if (attendanceDisabled) return <div className="space-y-4"><div><h1 className="text-lg font-semibold">Attendance Reports</h1><p className="text-sm text-muted-foreground">Attendance module is disabled.</p></div><AttendanceNav /><Panel><EmptyState title="Attendance module is disabled." description="Attendance report data and exports are hidden until an administrator enables the module." /></Panel></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div><h1 className="text-lg font-semibold">Attendance Reports</h1><p className="text-sm text-muted-foreground">Attendance summary exports prepared for payroll reconciliation.</p></div>
        <div className="flex flex-wrap gap-2">{canExport ? <Button size="sm" onClick={() => void exportCsv()}><Download className="h-4 w-4" /> Export CSV</Button> : null}</div>
      </div>
      <AttendanceNav />
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Panel className="overflow-hidden">
        <div className="grid gap-2 border-b p-3 md:grid-cols-5">
          <div className="relative md:col-span-2"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search employee" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <div className="md:col-span-2">
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
              className="grid gap-2 md:grid-cols-2"
            />
          </div>
          <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} aria-label="Date from" />
          <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} aria-label="Date to" />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Department</TableHead><TableHead>Location</TableHead><TableHead>Present</TableHead><TableHead>Absent</TableHead><TableHead>Late</TableHead><TableHead>Missed punch</TableHead><TableHead>Work minutes</TableHead></TableRow></TableHeader>
            <TableBody>{reports.map((row, index) => <TableRow key={String(row.employee_id ?? index)}><TableCell><div className="font-medium">{String(row.employee_name ?? "-")}</div><div className="font-mono text-xs text-muted-foreground">{String(row.employee_no ?? "")}</div></TableCell><TableCell>{String(row.department_name ?? "-")}</TableCell><TableCell>{String(row.location_name ?? "-")}</TableCell><TableCell>{String(row.present_days ?? 0)}</TableCell><TableCell>{String(row.absent_days ?? 0)}</TableCell><TableCell>{String(row.late_days ?? 0)}</TableCell><TableCell>{String(row.missed_punch_days ?? 0)}</TableCell><TableCell>{String(row.total_work_minutes ?? 0)}</TableCell></TableRow>)}</TableBody>
          </Table>
        </div>
        {loading ? <EmptyState title="Loading reports" description="Building attendance report data." /> : reports.length === 0 ? <EmptyState title="No report rows found" description="Create attendance records or adjust filters." /> : null}
      </Panel>
    </div>
  );
}
