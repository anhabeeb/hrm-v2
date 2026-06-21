import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "../components/ui/badge";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
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

  if (!canView) return <Panel><EmptyState title="Leave calendar unavailable" description="Your account needs leave.view permission." /></Panel>;

  return (
    <div className="space-y-4">
      <div><h1 className="text-lg font-semibold">Leave Calendar</h1><p className="text-sm text-muted-foreground">Compact calendar/list foundation for approved and pending leave blocks.</p></div>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Panel className="overflow-hidden">
        <div className="grid gap-2 border-b p-3 md:grid-cols-4 xl:grid-cols-7">
          <div className="relative md:col-span-2"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search employee" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <select className="h-9 rounded-md border bg-white px-3 text-sm" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}><option value="">All departments</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select>
          <select className="h-9 rounded-md border bg-white px-3 text-sm" value={locationId} onChange={(event) => setLocationId(event.target.value)}><option value="">All locations</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select>
          <select className="h-9 rounded-md border bg-white px-3 text-sm" value={typeId} onChange={(event) => setTypeId(event.target.value)}><option value="">All leave types</option>{types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select>
          <select className="h-9 rounded-md border bg-white px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Approved and pending</option><option value="APPROVED">Approved</option><option value="PENDING_APPROVAL">Pending approval</option></select>
          <Input type="date" aria-label="Start date from" value={startFrom} onChange={(event) => setStartFrom(event.target.value)} />
          <Input type="date" aria-label="Start date to" value={startTo} onChange={(event) => setStartTo(event.target.value)} />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Department</TableHead><TableHead>Location</TableHead><TableHead>Leave type</TableHead><TableHead>Start</TableHead><TableHead>End</TableHead><TableHead>Days</TableHead><TableHead>Status</TableHead><TableHead>Public holiday/weekend</TableHead></TableRow></TableHeader>
            <TableBody>{requests.map((request) => <TableRow key={request.id}><TableCell className="font-medium">{request.employee_name}</TableCell><TableCell>{request.department_name ?? "-"}</TableCell><TableCell>{request.location_name ?? "-"}</TableCell><TableCell>{request.leave_type_name}</TableCell><TableCell>{request.start_date}</TableCell><TableCell>{request.end_date}</TableCell><TableCell>{request.requested_days}</TableCell><TableCell><Badge tone={request.status === "APPROVED" ? "success" : "warning"}>{request.status}</Badge></TableCell><TableCell className="text-xs text-muted-foreground">{request.public_holiday_handling_json ?? "-"}</TableCell></TableRow>)}</TableBody>
          </Table>
        </div>
        {loading ? <EmptyState title="Loading leave calendar" description="Fetching calendar blocks." /> : requests.length === 0 ? <EmptyState title="No leave blocks" description="Approved and pending leave requests will appear here." /> : null}
      </Panel>
    </div>
  );
}
