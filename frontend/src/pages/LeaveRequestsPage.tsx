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
      <Panel className="overflow-hidden">
        <div className="grid gap-2 border-b p-3 md:grid-cols-4 xl:grid-cols-6">
          <div className="relative md:col-span-2"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search employee" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <SelectField aria-label="Leave type" value={typeId} onValueChange={setTypeId}><option value="">All leave types</option>{types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</SelectField>
          <SelectField aria-label="Status" value={status} onValueChange={setStatus}><option value="">All statuses</option>{["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "CANCELLED"].map((item) => <option key={item} value={item}>{item}</option>)}</SelectField>
          <SelectField aria-label="Department" value={departmentId} onValueChange={setDepartmentId}><option value="">All departments</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</SelectField>
          <SelectField aria-label="Position" value={positionId} onValueChange={setPositionId}><option value="">All positions</option>{positions.map((position) => <option key={position.id} value={position.id}>{position.title}</option>)}</SelectField>
          <SelectField aria-label="Location" value={locationId} onValueChange={setLocationId}><option value="">All locations</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</SelectField>
          <Input type="date" aria-label="Start date from" value={startFrom} onChange={(event) => setStartFrom(event.target.value)} />
          <Input type="date" aria-label="Start date to" value={startTo} onChange={(event) => setStartTo(event.target.value)} />
          <Input type="date" aria-label="End date from" value={endFrom} onChange={(event) => setEndFrom(event.target.value)} />
          <Input type="date" aria-label="End date to" value={endTo} onChange={(event) => setEndTo(event.target.value)} />
          <Input type="date" aria-label="Submitted from" value={submittedFrom} onChange={(event) => setSubmittedFrom(event.target.value)} />
          <Input type="date" aria-label="Submitted to" value={submittedTo} onChange={(event) => setSubmittedTo(event.target.value)} />
          <CheckboxField label="Pending my approval" checked={pendingMine} disabled={approvalsOnly} onChange={setPendingMine} />
        </div>
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
