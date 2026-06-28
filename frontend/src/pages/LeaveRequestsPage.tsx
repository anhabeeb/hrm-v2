import { Check, Eye, Plus, RotateCcw, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EmployeeIdentityCell } from "../components/employee/EmployeeIdentityCell";
import { LeaveRequestDetailModal } from "../components/leave/LeaveRequestDetailModal";
import { LeaveRequestModal } from "../components/leave/LeaveRequestModal";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { ConfirmDialog } from "../components/ui/dialogs";
import { EmptyState } from "../components/ui/empty-state";
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
import { CheckboxField, PageHeader, PageShell, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import type { Employee } from "../types/employees";
import type { LeaveRequest, LeaveType } from "../types/leave";
import type { OrganizationDepartment, OrganizationLocation, OrganizationPosition } from "../types/organization";

function tone(status: string) {
  if (status === "APPROVED") return "success";
  if (status === "PENDING_APPROVAL" || status === "SUBMITTED" || status === "DRAFT") return "warning";
  if (status === "CANCELLED") return "neutral";
  return "danger";
}

export function LeaveRequestsPage({ approvalsOnly = false }: { approvalsOnly?: boolean }) {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("leave.view");
  const canCreate = permissions.has("leave.request") || permissions.has("leave.manage");
  const canApprove = permissions.has("leave.approve");
  const canCancel = permissions.has("leave.cancel") || permissions.has("leave.manage");
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [positions, setPositions] = useState<OrganizationPosition[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [search, setSearch] = useState("");
  const [typeId, setTypeId] = useState("");
  const [status, setStatus] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [positionId, setPositionId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [startFrom, setStartFrom] = useState("");
  const [startTo, setStartTo] = useState("");
  const [endFrom, setEndFrom] = useState("");
  const [endTo, setEndTo] = useState("");
  const [submittedFrom, setSubmittedFrom] = useState("");
  const [submittedTo, setSubmittedTo] = useState("");
  const [pendingMine, setPendingMine] = useState(approvalsOnly);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailRequest, setDetailRequest] = useState<LeaveRequest | null>(null);
  const [actionTarget, setActionTarget] = useState<{ request: LeaveRequest; name: "submit" | "approve" | "reject" | "cancel" } | null>(null);
  const [actionNote, setActionNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const leaveDateRange: StandardDateRange = useMemo(() => ({ from: startFrom, to: startTo }), [startFrom, startTo]);
  const submittedDateRange: StandardDateRange = useMemo(() => ({ from: submittedFrom, to: submittedTo }), [submittedFrom, submittedTo]);

  const filters = useMemo(() => ({
    search,
    leave_type_id: typeId,
    status,
    department_id: departmentId,
    position_id: positionId,
    location_id: locationId,
    start_date_from: startFrom,
    start_date_to: startTo,
    end_date_from: endFrom,
    end_date_to: endTo,
    submitted_from: submittedFrom,
    submitted_to: submittedTo,
    pending_my_approval: approvalsOnly || pendingMine ? true : undefined
  }), [search, typeId, status, departmentId, positionId, locationId, startFrom, startTo, endFrom, endTo, submittedFrom, submittedTo, approvalsOnly, pendingMine]);

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    setError(null);
    try {
      const [requestResult, typeResult, employeeResult, departmentResult, positionResult, locationResult] = await Promise.all([
        api.listLeaveRequests(token, filters),
        api.listLeaveTypes(token),
        api.listEmployees(token),
        api.listDepartments(token),
        api.listPositions(token),
        api.listLocations(token)
      ]);
      setRequests(requestResult.requests);
      setTypes(typeResult.leave_types);
      setEmployees(employeeResult.employees);
      setDepartments(departmentResult.departments);
      setPositions(positionResult.positions);
      setLocations(locationResult.locations);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load leave requests.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, canView, filters]);

  async function action(request: LeaveRequest, name: "submit" | "approve" | "reject" | "cancel") {
    if (!token) return;
    try {
      if (name === "submit") await api.submitLeaveRequest(token, request.id);
      if (name === "approve") await api.approveLeaveRequest(token, request.id, actionNote || null);
      if (name === "reject") {
        if (!actionNote.trim()) return;
        await api.rejectLeaveRequest(token, request.id, actionNote.trim());
      }
      if (name === "cancel") {
        if (!actionNote.trim()) return;
        await api.cancelLeaveRequest(token, request.id, actionNote.trim());
      }
      setActionTarget(null);
      setActionNote("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update leave request.");
    }
  }

  function setLeaveDateRange(range: StandardDateRange) {
    setStartFrom(range.from ?? "");
    setStartTo(range.to ?? "");
  }

  function setSubmittedDateRange(range: StandardDateRange) {
    setSubmittedFrom(range.from ?? "");
    setSubmittedTo(range.to ?? "");
  }

  function resetFilters() {
    setSearch("");
    setTypeId("");
    setStatus("");
    setDepartmentId("");
    setPositionId("");
    setLocationId("");
    setStartFrom("");
    setStartTo("");
    setEndFrom("");
    setEndTo("");
    setSubmittedFrom("");
    setSubmittedTo("");
    setPendingMine(approvalsOnly);
  }

  const activeChips = [
    search.trim() ? { key: "search", label: "Search", value: search.trim(), onRemove: () => setSearch("") } : null,
    typeId ? { key: "leaveType", label: "Leave Type", value: types.find((type) => type.id === typeId)?.name ?? "Selected", onRemove: () => setTypeId("") } : null,
    status ? { key: "status", label: "Status", value: status, onRemove: () => setStatus("") } : null,
    departmentId ? { key: "department", label: "Department", value: departments.find((department) => department.id === departmentId)?.name ?? "Selected", onRemove: () => setDepartmentId("") } : null,
    positionId ? { key: "position", label: "Position", value: positions.find((position) => position.id === positionId)?.title ?? "Selected", onRemove: () => setPositionId("") } : null,
    locationId ? { key: "location", label: "Location", value: locations.find((location) => location.id === locationId)?.name ?? "Selected", onRemove: () => setLocationId("") } : null,
    startFrom || startTo ? { key: "leaveDate", label: "Leave Date", value: `${startFrom || "Any"} - ${startTo || "Any"}`, onRemove: () => setLeaveDateRange({}) } : null,
    submittedFrom || submittedTo ? { key: "submittedDate", label: "Submitted", value: `${submittedFrom || "Any"} - ${submittedTo || "Any"}`, onRemove: () => setSubmittedDateRange({}) } : null,
    pendingMine && !approvalsOnly ? { key: "pendingMine", label: "Approval", value: "Pending mine", onRemove: () => setPendingMine(false) } : null
  ].filter(Boolean) as Array<{ key: string; label: string; value: string; onRemove: () => void }>;

  if (!canView) return <PageShell><Panel><EmptyState title="Leave unavailable" description="Your account needs leave.view permission." /></Panel></PageShell>;

  return (
    <PageShell>
      <PageHeader
        title={approvalsOnly ? "Pending Leave Approvals" : "Leave Requests"}
        description="Leave requests, approval status, document status, and salary impact foundation."
        actions={
          <>
          <Link to="/leave/calendar"><Button variant="outline" size="sm">Calendar</Button></Link>
          <Link to="/leave/settings"><Button variant="outline" size="sm">Settings</Button></Link>
          {canCreate ? <Button size="sm" onClick={() => setModalOpen(true)}><Plus className="h-4 w-4" /> New request</Button> : null}
          </>
        }
      />
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <StandardFilterBar
        search={<StandardSearchInput value={search} onDebouncedChange={setSearch} placeholder="Search employee..." />}
        reset={<FilterResetButton onReset={resetFilters} />}
        moreFilters={
          <MoreFiltersSheet onReset={resetFilters}>
            <FilterSection title="Employee">
              <StandardSelectFilter value={departmentId} onValueChange={setDepartmentId} allLabel="All departments" width="department" options={departments.filter((department) => department.is_active !== false).map((department) => ({ value: department.id, label: department.name }))} />
              <StandardSelectFilter value={positionId} onValueChange={setPositionId} allLabel="All positions" width="position" options={positions.filter((position) => position.is_active !== false).map((position) => ({ value: position.id, label: position.title }))} />
              <StandardSelectFilter value={locationId} onValueChange={setLocationId} allLabel="All locations" width="department" options={locations.filter((location) => location.is_active !== false).map((location) => ({ value: location.id, label: location.name }))} />
            </FilterSection>
            <FilterSection title="Leave Rules">
              <CheckboxField label="Pending my approval" checked={pendingMine} disabled={approvalsOnly} onChange={setPendingMine} />
            </FilterSection>
            <FilterSection title="Date">
              <StandardDateRangeFilter value={submittedDateRange} onChange={setSubmittedDateRange} label="Requested Date Range" />
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-medium text-slate-800">End from<Input type="date" value={endFrom} onChange={(event) => setEndFrom(event.target.value)} /></label>
                <label className="grid gap-1.5 text-sm font-medium text-slate-800">End to<Input type="date" value={endTo} onChange={(event) => setEndTo(event.target.value)} /></label>
              </div>
            </FilterSection>
          </MoreFiltersSheet>
        }
      >
        <StandardSelectFilter value={typeId} onValueChange={setTypeId} allLabel="All leave types" width="leaveType" options={types.map((type) => ({ value: type.id, label: type.name }))} />
        <StandardSelectFilter value={status} onValueChange={setStatus} allLabel="All statuses" width="status" options={["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "CANCELLED"].map((item) => ({ value: item, label: item }))} />
        <StandardDateRangeFilter value={leaveDateRange} onChange={setLeaveDateRange} label="Date Range" />
      </StandardFilterBar>
      <ActiveFilterChips chips={activeChips} />
      <Panel className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Department</TableHead><TableHead>Leave type</TableHead><TableHead>Dates</TableHead><TableHead>Days</TableHead><TableHead>Status</TableHead><TableHead>Document</TableHead><TableHead>Deduction</TableHead><TableHead>Current step</TableHead><TableHead>Submitted</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>{requests.map((request) => <TableRow key={request.id}><TableCell><EmployeeIdentityCell employeeId={request.employee_id} employeeName={request.employee_name} employeeNumber={request.employee_no} departmentName={request.department_name} locationName={request.location_name} size="sm" to={`/employees/${request.employee_id}`} /></TableCell><TableCell>{request.department_name ?? "-"}</TableCell><TableCell>{request.leave_type_name}</TableCell><TableCell>{request.start_date} to {request.end_date}</TableCell><TableCell>{request.requested_days}</TableCell><TableCell><Badge tone={tone(request.status)}>{request.status}</Badge></TableCell><TableCell>{request.document_status}</TableCell><TableCell>{request.salary_deduction_mode ?? "NONE"}</TableCell><TableCell>{request.current_approval_step ?? "-"}</TableCell><TableCell>{request.submitted_at ? new Date(request.submitted_at).toLocaleDateString() : "-"}</TableCell><TableCell><div className="flex justify-end gap-1"><Button title="View details" variant="ghost" size="icon" onClick={() => setDetailRequest(request)}><Eye className="h-4 w-4" /></Button>{request.status === "DRAFT" && canCreate ? <Button title="Submit" variant="ghost" size="icon" onClick={() => { setActionTarget({ request, name: "submit" }); setActionNote(""); }}><RotateCcw className="h-4 w-4" /></Button> : null}{request.status === "PENDING_APPROVAL" && canApprove ? <Button title="Approve" variant="ghost" size="icon" onClick={() => { setActionTarget({ request, name: "approve" }); setActionNote(""); }}><Check className="h-4 w-4" /></Button> : null}{request.status === "PENDING_APPROVAL" && canApprove ? <Button title="Reject" variant="ghost" size="icon" onClick={() => { setActionTarget({ request, name: "reject" }); setActionNote(""); }}><X className="h-4 w-4" /></Button> : null}{request.status !== "CANCELLED" && request.status !== "REJECTED" && canCancel ? <Button title="Cancel" variant="ghost" size="icon" onClick={() => { setActionTarget({ request, name: "cancel" }); setActionNote(""); }}><X className="h-4 w-4 text-red-600" /></Button> : null}</div></TableCell></TableRow>)}</TableBody>
          </Table>
        </div>
        {loading ? <EmptyState title="Loading leave requests" description="Fetching leave records." /> : requests.length === 0 ? <EmptyState title="No leave requests found" description="Create a leave request or adjust filters." /> : null}
      </Panel>
      {modalOpen && token ? <LeaveRequestModal token={token} employees={employees} leaveTypes={types} onClose={() => setModalOpen(false)} onSaved={async (request) => { await load(); if (request.document_required) setDetailRequest(request); }} /> : null}
      {detailRequest && token ? <LeaveRequestDetailModal token={token} request={detailRequest} permissions={permissions} onClose={() => setDetailRequest(null)} onChanged={load} /> : null}
      <ConfirmDialog
        open={Boolean(actionTarget)}
        title={`${actionTarget?.name ?? "Update"} leave request`}
        description={actionTarget ? `${actionTarget.name.charAt(0).toUpperCase()}${actionTarget.name.slice(1)} leave request for ${actionTarget.request.employee_name ?? actionTarget.request.employee_no}?` : undefined}
        confirmLabel={actionTarget?.name ? `${actionTarget.name.charAt(0).toUpperCase()}${actionTarget.name.slice(1)}` : "Confirm"}
        tone={actionTarget?.name === "reject" || actionTarget?.name === "cancel" ? "danger" : "default"}
        requireReason={actionTarget?.name === "reject" || actionTarget?.name === "cancel"}
        reasonLabel={actionTarget?.name === "approve" ? "Approval note" : "Reason"}
        reasonValue={actionNote}
        onReasonChange={setActionNote}
        onCancel={() => { setActionTarget(null); setActionNote(""); }}
        onConfirm={() => actionTarget ? void action(actionTarget.request, actionTarget.name) : undefined}
      />
    </PageShell>
  );
}
