import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AttendanceNav } from "../components/attendance/AttendanceNav";
import { Badge } from "../components/ui/badge";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import type { AttendanceRecord } from "../types/attendance";
import type { Employee } from "../types/employees";
import type { OrganizationDepartment, OrganizationLocation } from "../types/organization";

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
      const [calendarResult, employeeResult, departmentResult, locationResult] = await Promise.all([
        api.getAttendanceCalendar(token, filters),
        api.listEmployees(token),
        api.listDepartments(token),
        api.listLocations(token)
      ]);
      setRecords(calendarResult.calendar);
      setEmployees(employeeResult.employees);
      setDepartments(departmentResult.departments);
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

  if (!canView) return <Panel><EmptyState title="Attendance calendar unavailable" description="Your account needs attendance.view permission." /></Panel>;
  if (attendanceDisabled) return <div className="space-y-4"><div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"><div><h1 className="text-lg font-semibold">Attendance Calendar</h1><p className="text-sm text-muted-foreground">Attendance module is disabled.</p></div><AttendanceNav /></div><Panel><EmptyState title="Attendance module is disabled." description="Attendance calendar data is hidden until an administrator enables the module." /></Panel></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div><h1 className="text-lg font-semibold">Attendance Calendar</h1><p className="text-sm text-muted-foreground">Compact date-based attendance foundation for teams and outlets.</p></div>
        <AttendanceNav />
      </div>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Panel className="overflow-hidden">
        <div className="grid gap-2 border-b p-3 md:grid-cols-4 xl:grid-cols-7">
          <div className="relative md:col-span-2"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search employee" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <select className="h-9 rounded-md border bg-white px-3 text-sm" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}><option value="">All employees</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.display_name ?? employee.full_name} ({employee.employee_no})</option>)}</select>
          <select className="h-9 rounded-md border bg-white px-3 text-sm" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}><option value="">All departments</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select>
          <select className="h-9 rounded-md border bg-white px-3 text-sm" value={locationId} onChange={(event) => setLocationId(event.target.value)}><option value="">All locations</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select>
          <select className="h-9 rounded-md border bg-white px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{["PRESENT", "ABSENT", "LATE", "EARLY_LEAVE", "HALF_DAY", "LEAVE", "SICK_LEAVE", "LONG_LEAVE", "DAY_OFF", "PUBLIC_HOLIDAY", "MISSING_PUNCH", "PENDING_CORRECTION", "CORRECTED"].map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} aria-label="Date from" />
          <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} aria-label="Date to" />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Employee</TableHead><TableHead>Department</TableHead><TableHead>Location</TableHead><TableHead>Status</TableHead><TableHead>Clock in/out</TableHead><TableHead>Work minutes</TableHead><TableHead>Flags</TableHead></TableRow></TableHeader>
            <TableBody>{records.map((record) => <TableRow key={record.id}><TableCell>{record.attendance_date}</TableCell><TableCell><div className="font-medium">{record.employee_name}</div><div className="font-mono text-xs text-muted-foreground">{record.employee_no}</div></TableCell><TableCell>{record.department_name ?? "-"}</TableCell><TableCell>{record.location_name ?? "-"}</TableCell><TableCell><Badge tone={tone(record.status)}>{record.status}</Badge></TableCell><TableCell>{record.first_clock_in ? new Date(record.first_clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"} / {record.last_clock_out ? new Date(record.last_clock_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"}</TableCell><TableCell>{record.total_work_minutes ?? 0}</TableCell><TableCell>{record.missed_punch ? <Badge tone="warning">Missed punch</Badge> : "-"}</TableCell></TableRow>)}</TableBody>
          </Table>
        </div>
        {loading ? <EmptyState title="Loading calendar" description="Fetching attendance calendar records." /> : records.length === 0 ? <EmptyState title="No calendar records found" description="Create attendance records or adjust filters." /> : null}
      </Panel>
    </div>
  );
}
