import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AttendanceNav } from "../components/attendance/AttendanceNav";
import { EmployeeIdentityCell } from "../components/employee/EmployeeIdentityCell";
import { Badge } from "../components/ui/badge";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { OrganizationCascadeSelector } from "../components/organization/OrganizationCascadeSelector";
import { PageHeader, PageShell, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import type { AttendanceRecord } from "../types/attendance";
import type { Employee } from "../types/employees";
import type { OrganizationDepartment, OrganizationJobLevel, OrganizationLocation, OrganizationPosition } from "../types/organization";

function tone(status: string) {
  if (status === "PRESENT") return "success" as const;
  if (status === "LATE" || status === "HALF_DAY" || status === "PENDING_CORRECTION") return "warning" as const;
  if (status === "ABSENT") return "danger" as const;
  return "neutral" as const;
}

export function AttendanceCalendarPage() {
  const { token, user } = useAuth();
  const canView = new Set(user?.permissions ?? []).has("attendance.view");
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [jobLevels, setJobLevels] = useState<OrganizationJobLevel[]>([]);
  const [positions, setPositions] = useState<OrganizationPosition[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [search, setSearch] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState(new Date().toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [attendanceDisabled, setAttendanceDisabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filters = useMemo(() => ({ search, employee_id: employeeId, department_id: departmentId, location_id: locationId, status, date_from: dateFrom, date_to: dateTo }), [search, employeeId, departmentId, locationId, status, dateFrom, dateTo]);

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    setError(null);
    try {
      setAttendanceDisabled(false);
      const [calendarResult, employeeResult, departmentResult, jobLevelResult, positionResult, locationResult] = await Promise.all([
        api.getAttendanceCalendar(token, filters),
        api.listEmployees(token),
        api.listDepartments(token),
        api.listJobLevels(token),
        api.listPositions(token),
        api.listLocations(token)
      ]);
      setRecords(calendarResult.calendar);
      setEmployees(employeeResult.employees);
      setDepartments(departmentResult.departments);
      setJobLevels(jobLevelResult.job_levels);
      setPositions(positionResult.positions);
      setLocations(locationResult.locations);
    } catch (err) {
      if (err instanceof ApiError && err.code === "ATTENDANCE_MODULE_DISABLED") {
        setAttendanceDisabled(true);
        setRecords([]);
        return;
      }
      setError(err instanceof ApiError ? err.message : "Unable to load attendance calendar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, canView, filters]);

  if (!canView) return <PageShell><Panel><EmptyState title="Attendance calendar unavailable" description="Your account needs attendance.view permission." /></Panel></PageShell>;
  if (attendanceDisabled) return <PageShell><PageHeader title="Attendance Calendar" description="Attendance module is disabled." /><AttendanceNav /><Panel><EmptyState title="Attendance module is disabled." description="Attendance calendar data is hidden until an administrator enables the module." /></Panel></PageShell>;

  return (
    <PageShell>
      <PageHeader title="Attendance Calendar" description="Compact date-based attendance foundation for teams and outlets." />
      <AttendanceNav />
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Panel className="overflow-hidden">
        <div className="grid gap-2 border-b p-3 md:grid-cols-4 xl:grid-cols-7">
          <div className="relative md:col-span-2"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search employee" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <div className="md:col-span-4 xl:col-span-4">
            <OrganizationCascadeSelector
              value={{ locationId, departmentId, employeeId }}
              onChange={(next) => {
                setLocationId(next.locationId ?? "");
                setDepartmentId(next.departmentId ?? "");
                setEmployeeId(next.employeeId ?? "");
              }}
              departments={departments}
              locations={locations}
              jobLevels={jobLevels}
              positions={positions}
              employees={employees}
              includeLocation
              includeJobLevel={false}
              includePosition={false}
              includeEmployee
              requireDepartmentForJobLevel={false}
              mode="report-filter"
              labels={{ locationId: "Location", departmentId: "Department", employeeId: "Employee" }}
              className="grid gap-2 md:grid-cols-3"
            />
          </div>
          <SelectField aria-label="Status" value={status} onValueChange={setStatus}><option value="">All statuses</option>{["PRESENT", "ABSENT", "LATE", "EARLY_LEAVE", "HALF_DAY", "LEAVE", "SICK_LEAVE", "LONG_LEAVE", "DAY_OFF", "PUBLIC_HOLIDAY", "MISSING_PUNCH", "PENDING_CORRECTION", "CORRECTED"].map((item) => <option key={item} value={item}>{item}</option>)}</SelectField>
          <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} aria-label="Date from" />
          <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} aria-label="Date to" />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Employee</TableHead><TableHead>Department</TableHead><TableHead>Location</TableHead><TableHead>Status</TableHead><TableHead>Clock in/out</TableHead><TableHead>Work minutes</TableHead><TableHead>Flags</TableHead></TableRow></TableHeader>
            <TableBody>{records.map((record) => <TableRow key={record.id}><TableCell>{record.attendance_date}</TableCell><TableCell><EmployeeIdentityCell employeeId={record.employee_id} employeeName={record.employee_name ?? "-"} employeeNumber={record.employee_no ?? ""} departmentName={record.department_name} locationName={record.location_name} size="sm" /></TableCell><TableCell>{record.department_name ?? "-"}</TableCell><TableCell>{record.location_name ?? "-"}</TableCell><TableCell><Badge tone={tone(record.status)}>{record.status}</Badge></TableCell><TableCell>{record.first_clock_in ? new Date(record.first_clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"} / {record.last_clock_out ? new Date(record.last_clock_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"}</TableCell><TableCell>{record.total_work_minutes ?? 0}</TableCell><TableCell>{record.missed_punch ? <Badge tone="warning">Missed punch</Badge> : "-"}</TableCell></TableRow>)}</TableBody>
          </Table>
        </div>
        {loading ? <EmptyState title="Loading calendar" description="Fetching attendance calendar records." /> : records.length === 0 ? <EmptyState title="No calendar records found" description="Create attendance records or adjust filters." /> : null}
      </Panel>
    </PageShell>
  );
}
