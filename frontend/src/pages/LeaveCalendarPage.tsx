import { useEffect, useMemo, useState } from "react";
import { EmployeeIdentityCell } from "../components/employee/EmployeeIdentityCell";
import { ActiveFilterChips, FilterResetButton, formatDateRangeLabel, MoreFiltersSheet, StandardDateRangeFilter, StandardFilterBar, StandardSearchInput, StandardSelectFilter } from "../components/filters";
import { Badge } from "../components/ui/badge";
import { EmptyState } from "../components/ui/empty-state";
import { PageHeader, PageShell } from "../components/ui/page-shell";
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
  const startRange = useMemo(() => ({ from: startFrom, to: startTo }), [startFrom, startTo]);

  const filters = useMemo(() => ({
    search,
    department_id: departmentId,
    location_id: locationId,
    leave_type_id: typeId,
    status,
    start_date_from: startFrom,
    start_date_to: startTo
  }), [search, departmentId, locationId, typeId, status, startFrom, startTo]);
  const activeFilterChips = useMemo(() => [
    ...(search ? [{ key: "search", label: "Search", value: search, onRemove: () => setSearch("") }] : []),
    ...(typeId ? [{ key: "type", label: "Leave Type", value: types.find((type) => type.id === typeId)?.name ?? typeId, onRemove: () => setTypeId("") }] : []),
    ...(status ? [{ key: "status", label: "Status", value: status.replace(/_/g, " "), title: status, onRemove: () => setStatus("") }] : []),
    ...(departmentId ? [{ key: "department", label: "Department", value: departments.find((department) => department.id === departmentId)?.name ?? departmentId, onRemove: () => setDepartmentId("") }] : []),
    ...(locationId ? [{ key: "location", label: "Location", value: locations.find((location) => location.id === locationId)?.name ?? locationId, onRemove: () => setLocationId("") }] : []),
    ...(startFrom || startTo ? [{ key: "start", label: "Start Date", value: formatDateRangeLabel(startRange), onRemove: () => { setStartFrom(""); setStartTo(""); } }] : [])
  ], [departmentId, departments, locationId, locations, search, startFrom, startRange, startTo, status, typeId, types]);

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
        <div className="border-b p-3">
          <StandardFilterBar
            search={<StandardSearchInput value={search} onDebouncedChange={setSearch} placeholder="Search employee" />}
            reset={<FilterResetButton onReset={() => { setSearch(""); setDepartmentId(""); setLocationId(""); setTypeId(""); setStatus(""); setStartFrom(""); setStartTo(""); }} />}
            moreFilters={
              <MoreFiltersSheet onReset={() => { setDepartmentId(""); setLocationId(""); }}>
                <StandardSelectFilter value={departmentId} onValueChange={setDepartmentId} allLabel="All departments" width="department" options={departments.map((department) => ({ value: department.id, label: department.name }))} />
                <StandardSelectFilter value={locationId} onValueChange={setLocationId} allLabel="All locations" width="department" options={locations.map((location) => ({ value: location.id, label: location.name }))} />
              </MoreFiltersSheet>
            }
          >
            <StandardSelectFilter value={typeId} onValueChange={setTypeId} allLabel="All leave types" width="leaveType" options={types.map((type) => ({ value: type.id, label: type.name }))} />
            <StandardSelectFilter value={status} onValueChange={setStatus} allLabel="Approved and pending" width="status" options={[{ value: "APPROVED", label: "Approved" }, { value: "PENDING_APPROVAL", label: "Pending approval" }]} />
            <StandardDateRangeFilter value={startRange} onChange={(range) => { setStartFrom(range.from ?? ""); setStartTo(range.to ?? ""); }} label="Start Date Range" />
          </StandardFilterBar>
          <ActiveFilterChips chips={activeFilterChips} className="mt-2" />
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
