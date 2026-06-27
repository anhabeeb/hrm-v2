import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmployeeIdentityCell } from "../components/employee/EmployeeIdentityCell";
import { Badge } from "../components/ui/badge";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { PageHeader, PageShell, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import type { LeaveRequest, LeaveType } from "../types/leave";
import type { OrganizationDepartment, OrganizationLocation } from "../types/organization";

export function LeaveCalendarPage() {
  const { token, user } = useAuth();
  const canView = Boolean(user?.permissions.includes("leave.view"));
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [status, setStatus] = useState("");
  const [startFrom, setStartFrom] = useState("");
  const [startTo, setStartTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const filters = useMemo(() => ({
    search,
    department_id: departmentId,
    location_id: locationId,
    leave_type_id: typeId,
    status,
    start_date_from: startFrom,
    start_date_to: startTo
  }), [search, departmentId, locationId, typeId, status, startFrom, startTo]);

  useEffect(() => {
    async function load() {
      if (!token || !canView) return;
      setLoading(true);
      setError(null);
      try {
        const [requestResult, typeResult, departmentResult, locationResult] = await Promise.all([
          api.listLeaveRequests(token, filters),
          api.listLeaveTypes(token),
          api.listDepartments(token),
          api.listLocations(token)
        ]);
        setRequests(requestResult.requests.filter((row) => row.status === "APPROVED" || row.status === "PENDING_APPROVAL"));
        setTypes(typeResult.leave_types);
        setDepartments(departmentResult.departments);
        setLocations(locationResult.locations);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Unable to load leave calendar.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [token, canView, filters]);

  if (!canView) return <PageShell><Panel><EmptyState title="Leave calendar unavailable" description="Your account needs leave.view permission." /></Panel></PageShell>;

  return (
    <PageShell>
      <PageHeader title="Leave Calendar" description="Compact calendar/list foundation for approved and pending leave blocks." />
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Panel className="overflow-hidden">
        <div className="grid gap-2 border-b p-3 md:grid-cols-4 xl:grid-cols-7">
          <div className="relative md:col-span-2"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search employee" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <SelectField aria-label="Department" value={departmentId} onValueChange={setDepartmentId}><option value="">All departments</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</SelectField>
          <SelectField aria-label="Location" value={locationId} onValueChange={setLocationId}><option value="">All locations</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</SelectField>
          <SelectField aria-label="Leave type" value={typeId} onValueChange={setTypeId}><option value="">All leave types</option>{types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</SelectField>
          <SelectField aria-label="Status" value={status} onValueChange={setStatus}><option value="">Approved and pending</option><option value="APPROVED">Approved</option><option value="PENDING_APPROVAL">Pending approval</option></SelectField>
          <Input type="date" aria-label="Start date from" value={startFrom} onChange={(event) => setStartFrom(event.target.value)} />
          <Input type="date" aria-label="Start date to" value={startTo} onChange={(event) => setStartTo(event.target.value)} />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Department</TableHead><TableHead>Location</TableHead><TableHead>Leave type</TableHead><TableHead>Start</TableHead><TableHead>End</TableHead><TableHead>Days</TableHead><TableHead>Status</TableHead><TableHead>Public holiday/weekend</TableHead></TableRow></TableHeader>
            <TableBody>{requests.map((request) => <TableRow key={request.id}><TableCell><EmployeeIdentityCell employeeId={request.employee_id} employeeName={request.employee_name ?? "-"} employeeNumber={request.employee_no ?? ""} departmentName={request.department_name} locationName={request.location_name} size="sm" /></TableCell><TableCell>{request.department_name ?? "-"}</TableCell><TableCell>{request.location_name ?? "-"}</TableCell><TableCell>{request.leave_type_name}</TableCell><TableCell>{request.start_date}</TableCell><TableCell>{request.end_date}</TableCell><TableCell>{request.requested_days}</TableCell><TableCell><Badge tone={request.status === "APPROVED" ? "success" : "warning"}>{request.status}</Badge></TableCell><TableCell className="text-xs text-muted-foreground">{request.public_holiday_handling_json ?? "-"}</TableCell></TableRow>)}</TableBody>
          </Table>
        </div>
        {loading ? <EmptyState title="Loading leave calendar" description="Fetching calendar blocks." /> : requests.length === 0 ? <EmptyState title="No leave blocks" description="Approved and pending leave requests will appear here." /> : null}
      </Panel>
    </PageShell>
  );
}
