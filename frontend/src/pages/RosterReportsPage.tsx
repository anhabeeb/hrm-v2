import { Download, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { RosterNav } from "../components/roster/RosterNav";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import type { OrganizationDepartment, OrganizationLocation } from "../types/organization";
import type { RosterAssignmentStatus } from "../types/roster";

const statuses: RosterAssignmentStatus[] = ["SCHEDULED", "OFF", "LEAVE", "ABSENT_PLACEHOLDER", "UNASSIGNED"];

export function RosterReportsPage() {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("roster.reports.view");
  const canExport = permissions.has("roster.reports.export");
  const [weekStart, setWeekStart] = useState(new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [status, setStatus] = useState("");
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [reports, setReports] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const filters = useMemo(() => ({ week_start_date: weekStart, search, department_id: departmentId, location_id: locationId, status }), [weekStart, search, departmentId, locationId, status]);

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    setError(null);
    try {
      const [reportResult, departmentResult, locationResult] = await Promise.all([api.getRosterReports(token, filters), api.listDepartments(token), api.listLocations(token)]);
      setReports(reportResult.reports);
      setDepartments(departmentResult.departments);
      setLocations(locationResult.locations);
    } catch (err) {
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
      const url = URL.createObjectURL(download.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = download.filename || `roster-report-${weekStart}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to export roster report.");
    }
  }

  if (!canView) return <Panel><EmptyState title="Roster reports unavailable" description="Your account needs roster.reports.view permission." /></Panel>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div><h1 className="text-lg font-semibold">Roster Reports</h1><p className="text-sm text-muted-foreground">Weekly schedule summaries prepared for payroll and operations exports.</p></div>
        <div className="flex flex-wrap gap-2"><RosterNav />{canExport ? <Button size="sm" onClick={() => void exportCsv()}><Download className="h-4 w-4" /> Export CSV</Button> : null}</div>
      </div>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Panel className="overflow-hidden">
        <div className="grid gap-2 border-b p-3 md:grid-cols-4 xl:grid-cols-6">
          <Input type="date" value={weekStart} onChange={(event) => setWeekStart(event.target.value)} aria-label="Week start date" />
          <div className="relative md:col-span-2"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search employee" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <select className="h-9 rounded-md border bg-white px-3 text-sm" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}><option value="">All departments</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select>
          <select className="h-9 rounded-md border bg-white px-3 text-sm" value={locationId} onChange={(event) => setLocationId(event.target.value)}><option value="">All locations</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select>
          <select className="h-9 rounded-md border bg-white px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Department</TableHead><TableHead>Location</TableHead><TableHead>Scheduled</TableHead><TableHead>Off</TableHead><TableHead>Leave</TableHead><TableHead>Unassigned</TableHead><TableHead>Scheduled minutes</TableHead></TableRow></TableHeader>
            <TableBody>{filtered.map((row, index) => <TableRow key={String(row.employee_id ?? index)}><TableCell><div className="font-medium">{String(row.employee_name ?? "-")}</div><div className="font-mono text-xs text-muted-foreground">{String(row.employee_no ?? "")}</div></TableCell><TableCell>{String(row.department_name ?? "-")}</TableCell><TableCell>{String(row.location_name ?? "-")}</TableCell><TableCell>{String(row.scheduled_days ?? 0)}</TableCell><TableCell>{String(row.off_days ?? 0)}</TableCell><TableCell>{String(row.leave_days ?? 0)}</TableCell><TableCell>{String(row.unassigned_days ?? 0)}</TableCell><TableCell>{String(row.scheduled_minutes ?? 0)}</TableCell></TableRow>)}</TableBody>
          </Table>
        </div>
        {loading ? <EmptyState title="Loading roster reports" description="Building roster summary rows." /> : filtered.length === 0 ? <EmptyState title="No roster report rows" description="Create assignments or adjust filters." /> : null}
      </Panel>
    </div>
  );
}
