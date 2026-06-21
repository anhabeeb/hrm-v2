import { Eye, Plus, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { ApiError, api } from "../../lib/api";
import type { Employee } from "../../types/employees";
import type { LeaveBalance, LeaveDay, LeaveRequest, LeaveType } from "../../types/leave";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { LeaveRequestDetailModal } from "./LeaveRequestDetailModal";
import { LeaveRequestModal } from "./LeaveRequestModal";

function tone(status: string) {
  if (status === "APPROVED") return "success";
  if (status === "REJECTED") return "danger";
  if (status === "CANCELLED") return "neutral";
  return "warning";
}

export function EmployeeLeavePanel({ token, employee, permissions }: { token: string; employee: Employee; permissions: Set<string> }) {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [calendar, setCalendar] = useState<LeaveDay[]>([]);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [detailRequest, setDetailRequest] = useState<LeaveRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canCreate = permissions.has("leave.request") || permissions.has("leave.manage");
  const canCancel = permissions.has("leave.cancel") || permissions.has("leave.manage");

  async function load() {
    setError(null);
    try {
      const [summary, typeResult] = await Promise.all([api.getEmployeeLeaveSummary(token, employee.id), api.listLeaveTypes(token)]);
      setRequests(summary.requests);
      setBalances(summary.balances);
      setCalendar(summary.calendar);
      setTypes(typeResult.leave_types);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load employee leave.");
    }
  }

  useEffect(() => {
    void load();
  }, [employee.id, token]);

  async function submit(request: LeaveRequest) {
    try {
      await api.submitLeaveRequest(token, request.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to submit leave request.");
    }
  }

  async function cancel(request: LeaveRequest) {
    const reason = window.prompt("Cancellation reason");
    if (!reason) return;
    try {
      await api.cancelLeaveRequest(token, request.id, reason);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to cancel leave request.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h3 className="text-sm font-semibold">Leave profile</h3><p className="text-xs text-muted-foreground">Balances, request history, approval timeline, documents, and payroll impact foundation.</p></div>
        {canCreate ? <Button size="sm" onClick={() => setModalOpen(true)}><Plus className="h-4 w-4" /> New leave</Button> : null}
      </div>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader><TableRow><TableHead>Leave type</TableHead><TableHead>Year</TableHead><TableHead>Opening</TableHead><TableHead>Accrued</TableHead><TableHead>Used</TableHead><TableHead>Pending</TableHead><TableHead>Carry forward</TableHead><TableHead>Expired</TableHead><TableHead>Closing</TableHead></TableRow></TableHeader>
          <TableBody>{balances.map((row) => <TableRow key={row.id}><TableCell className="font-medium">{row.leave_type_name}</TableCell><TableCell>{row.period_year}</TableCell><TableCell>{row.opening_balance}</TableCell><TableCell>{row.accrued_days}</TableCell><TableCell>{row.used_days}</TableCell><TableCell>{row.pending_days}</TableCell><TableCell>{row.carried_forward_days}</TableCell><TableCell>{row.expired_days}</TableCell><TableCell>{row.closing_balance}</TableCell></TableRow>)}</TableBody>
        </Table>
        {balances.length === 0 ? <EmptyState title="No balance rows yet" description="Balances are created lazily when leave is requested." /> : null}
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Dates</TableHead><TableHead>Days</TableHead><TableHead>Status</TableHead><TableHead>Document</TableHead><TableHead>Deduction</TableHead><TableHead>Current step</TableHead><TableHead>Reason</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>{requests.map((request) => <TableRow key={request.id}><TableCell>{request.leave_type_name}</TableCell><TableCell>{request.start_date} to {request.end_date}</TableCell><TableCell>{request.requested_days}</TableCell><TableCell><Badge tone={tone(request.status)}>{request.status}</Badge></TableCell><TableCell>{request.document_status}</TableCell><TableCell>{request.salary_deduction_mode ?? "NONE"}</TableCell><TableCell>{request.current_approval_step ?? "-"}</TableCell><TableCell>{request.reason ?? "-"}</TableCell><TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => setDetailRequest(request)}><Eye className="h-4 w-4" /></Button>{request.status === "DRAFT" && canCreate ? <Button variant="ghost" size="icon" onClick={() => void submit(request)}><RotateCcw className="h-4 w-4" /></Button> : null}{request.status !== "CANCELLED" && request.status !== "REJECTED" && canCancel ? <Button variant="ghost" size="icon" onClick={() => void cancel(request)}><X className="h-4 w-4 text-red-600" /></Button> : null}</div></TableCell></TableRow>)}</TableBody>
        </Table>
        {requests.length === 0 ? <EmptyState title="No leave requests" description="Leave request history will appear here." /> : null}
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table><TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Day type</TableHead><TableHead>Counted</TableHead><TableHead>Status</TableHead><TableHead>Payroll impact</TableHead></TableRow></TableHeader><TableBody>{calendar.slice(0, 20).map((day) => <TableRow key={day.id}><TableCell>{day.leave_date}</TableCell><TableCell>{day.leave_type_name}</TableCell><TableCell>{day.day_type}</TableCell><TableCell>{day.counted_as_leave ? "Yes" : "No"}</TableCell><TableCell>{day.status}</TableCell><TableCell className="text-xs text-muted-foreground">{day.payroll_impact_json ?? "-"}</TableCell></TableRow>)}</TableBody></Table>{calendar.length === 0 ? <EmptyState title="No leave calendar rows" description="Approved and pending leave days will appear here." /> : null}</div>
      {modalOpen ? <LeaveRequestModal token={token} employees={[employee]} leaveTypes={types} employeeId={employee.id} onClose={() => setModalOpen(false)} onSaved={async (request) => { await load(); if (request.document_required) setDetailRequest(request); }} /> : null}
      {detailRequest ? <LeaveRequestDetailModal token={token} request={detailRequest} permissions={permissions} onClose={() => setDetailRequest(null)} onChanged={load} /> : null}
    </div>
  );
}
