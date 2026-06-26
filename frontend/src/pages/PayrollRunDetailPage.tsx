import { CheckCircle2, Eye, FileText, LockKeyhole, PauseCircle, PlayCircle, RefreshCw, Send, UserRound, XCircle } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { EmployeeIdentityCell } from "../components/employee/EmployeeIdentityCell";
import { PayrollNav } from "../components/payroll/PayrollNav";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Panel } from "../components/ui/panel";
import { InputField } from "../components/ui/page-shell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import type { PayrollApprovalEvent, PayrollPaymentRegister, PayrollPayslip, PayrollRun, PayrollRunEmployee, PayrollRunLine } from "../types/payroll";

function money(value: number | null | undefined) {
  return Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function normalizeResultStatus(status: string) {
  if (status === "REVIEW") return "READY_FOR_REVIEW";
  if (status === "APPROVED") return "APPROVED_PLACEHOLDER";
  if (status === "PAID") return "FINALIZED_PLACEHOLDER";
  return status;
}

export function PayrollRunDetailPage() {
  const { id } = useParams();
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("payroll.results.view") || permissions.has("payroll.runs.view") || permissions.has("payroll.view");
  const canManage = permissions.has("payroll.results.update") || permissions.has("payroll.runs.manage") || permissions.has("payroll.manage");
  const canSubmit = permissions.has("payroll.approvals.submit") || permissions.has("payroll.approvals.manage") || permissions.has("payroll.manage");
  const canApprove = permissions.has("payroll.approvals.approve") || permissions.has("payroll.approvals.manage") || permissions.has("payroll.manage");
  const canReject = permissions.has("payroll.approvals.reject") || permissions.has("payroll.approvals.send_back") || permissions.has("payroll.approvals.manage") || permissions.has("payroll.manage");
  const canFinalize = permissions.has("payroll.finalization.finalize") || permissions.has("payroll.finalization.manage") || permissions.has("payroll.manage");
  const canUnlock = permissions.has("payroll.finalization.unlock") || permissions.has("payroll.unlock_after_finalization") || permissions.has("payroll.finalization.manage") || permissions.has("payroll.manage");
  const canPayslips = permissions.has("payroll.payslips.generate") || permissions.has("payroll.payslips.manage") || permissions.has("payroll.manage");
  const canPayments = permissions.has("payroll.payment_register.prepare") || permissions.has("payroll.payment_register.manage") || permissions.has("payroll.manage");
  const [run, setRun] = useState<PayrollRun | null>(null);
  const [employees, setEmployees] = useState<PayrollRunEmployee[]>([]);
  const [approvals, setApprovals] = useState<PayrollApprovalEvent[]>([]);
  const [payslips, setPayslips] = useState<PayrollPayslip[]>([]);
  const [payments, setPayments] = useState<PayrollPaymentRegister[]>([]);
  const [lines, setLines] = useState<PayrollRunLine[] | null>(null);
  const [selected, setSelected] = useState<PayrollRunEmployee | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [holdModal, setHoldModal] = useState<{ employee: PayrollRunEmployee; action: "hold" | "release" } | null>(null);
  const [holdReason, setHoldReason] = useState("");
  const [runAction, setRunAction] = useState<{ action: "submit" | "approve" | "reject" | "send_back" | "finalize" | "unlock" | "payslips" | "payment_register"; title: string; reasonRequired?: boolean } | null>(null);
  const [actionReason, setActionReason] = useState("");

  async function load() {
    if (!token || !canView || !id) return;
    setLoading(true);
    setError(null);
    try {
      const [runResult, employeeResult, approvalResult, payslipResult, paymentResult] = await Promise.all([
        api.getPayrollRun(token, id),
        api.listPayrollRunEmployees(token, id),
        api.listPayrollRunApprovals(token, id),
        api.listPayrollPayslips(token, { payroll_run_id: id }),
        api.listPayrollRunPaymentRegister(token, id)
      ]);
      setRun(runResult.run);
      setEmployees(employeeResult.employees);
      setApprovals(approvalResult.approvals);
      setPayslips(payslipResult.payslips);
      setPayments(paymentResult.payments);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load payroll run details.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, canView, id]);

  async function showLines(employee: PayrollRunEmployee) {
    if (!token || !id) return;
    setSelected(employee);
    setLines(null);
    try {
      setLines((await api.listPayrollRunEmployeeLines(token, id, employee.id)).lines);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load payroll line details.");
    }
  }

  async function confirmHoldAction() {
    if (!token || !id || !holdModal) return;
    if (holdModal.action === "hold" && !holdReason.trim()) {
      setError("Hold reason is required.");
      return;
    }
    try {
      if (holdModal.action === "hold") await api.holdPayrollRunEmployee(token, id, holdModal.employee.id, holdReason.trim());
      if (holdModal.action === "release") await api.releasePayrollRunEmployee(token, id, holdModal.employee.id);
      setHoldModal(null);
      setHoldReason("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update payroll row.");
    }
  }

  async function confirmRunAction() {
    if (!token || !id || !runAction) return;
    const reason = actionReason.trim();
    if (runAction.reasonRequired && !reason) {
      setError("Reason is required.");
      return;
    }
    try {
      if (runAction.action === "submit") await api.submitPayrollRunForApproval(token, id, reason || null);
      if (runAction.action === "approve") await api.approvePayrollRun(token, id, reason || null);
      if (runAction.action === "reject") await api.rejectPayrollRun(token, id, reason);
      if (runAction.action === "send_back") await api.sendBackPayrollRun(token, id, reason);
      if (runAction.action === "finalize") await api.finalizePayrollRun(token, id, reason || null);
      if (runAction.action === "unlock") await api.unlockFinalizedPayrollRun(token, id, reason);
      if (runAction.action === "payslips") await api.generatePayrollRunPayslips(token, id);
      if (runAction.action === "payment_register") await api.preparePayrollRunPaymentRegister(token, id);
      setRunAction(null);
      setActionReason("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to complete payroll action.");
    }
  }

  if (!canView) return <Panel><EmptyState title="Payroll run unavailable" description="Your account needs payroll.view permission." /></Panel>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div><h1 className="text-lg font-semibold">Payroll Run Detail</h1><p className="text-sm text-muted-foreground">{run ? `Run #${run.run_no} for ${run.period_month ?? "-"} / ${run.period_year ?? "-"}` : "Monthly payroll review table."}</p></div>
        <PayrollNav />
      </div>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {run ? <Panel className="p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-1"><div className="flex items-center gap-2"><h2 className="text-sm font-semibold">Approval and finalization</h2><Badge tone={["APPROVED", "FINALIZED", "LOCKED"].includes(String(run.status)) ? "success" : String(run.status) === "SUBMITTED_FOR_APPROVAL" ? "warning" : "neutral"}>{String(run.status)}</Badge></div><p className="text-xs text-muted-foreground">Approval history is immutable. Finalized payroll locks frozen result snapshots for payslips and payment register preparation.</p></div>
          <div className="flex flex-wrap gap-2">
            {canSubmit ? <Button size="sm" variant="outline" onClick={() => setRunAction({ action: "submit", title: "Submit for approval" })}><Send className="h-4 w-4" /> Submit</Button> : null}
            {canApprove ? <Button size="sm" variant="outline" onClick={() => setRunAction({ action: "approve", title: "Approve payroll run" })}><CheckCircle2 className="h-4 w-4" /> Approve</Button> : null}
            {canReject ? <Button size="sm" variant="outline" onClick={() => setRunAction({ action: "reject", title: "Reject payroll run", reasonRequired: true })}><XCircle className="h-4 w-4" /> Reject</Button> : null}
            {canReject ? <Button size="sm" variant="outline" onClick={() => setRunAction({ action: "send_back", title: "Send payroll back", reasonRequired: true })}>Send back</Button> : null}
            {canFinalize ? <Button size="sm" variant="outline" onClick={() => setRunAction({ action: "finalize", title: "Finalize payroll run" })}><LockKeyhole className="h-4 w-4" /> Finalize</Button> : null}
            {canUnlock ? <Button size="sm" variant="outline" onClick={() => setRunAction({ action: "unlock", title: "Unlock finalized payroll", reasonRequired: true })}><RefreshCw className="h-4 w-4" /> Unlock</Button> : null}
            {canPayslips ? <Button size="sm" variant="outline" onClick={() => setRunAction({ action: "payslips", title: "Generate payslips" })}><FileText className="h-4 w-4" /> Generate payslips</Button> : null}
            {canPayments ? <Button size="sm" variant="outline" onClick={() => setRunAction({ action: "payment_register", title: "Prepare payment register" })}>Prepare register</Button> : null}
          </div>
        </div>
      </Panel> : null}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel className="overflow-hidden"><div className="border-b px-4 py-3"><h2 className="text-sm font-semibold">Approval timeline</h2></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Action</TableHead><TableHead>Actor</TableHead><TableHead>Status</TableHead><TableHead>Reason / note</TableHead></TableRow></TableHeader><TableBody>{approvals.map((event) => <TableRow key={event.id}><TableCell>{event.created_at}</TableCell><TableCell>{event.action}</TableCell><TableCell>{event.actor_name_snapshot ?? "-"}</TableCell><TableCell>{event.previous_status ?? "-"} {"->"} {event.new_status ?? "-"}</TableCell><TableCell>{event.reason ?? event.note ?? "-"}</TableCell></TableRow>)}</TableBody></Table></div>{approvals.length === 0 ? <EmptyState title="No approval events" description="Submit, approval, rejection, and finalization events will appear here." /> : null}</Panel>
        <Panel className="overflow-hidden"><div className="border-b px-4 py-3"><h2 className="text-sm font-semibold">Payslips and payment register</h2><p className="text-xs text-muted-foreground">Payment register is manual confirmation only. No bank export is included.</p></div><div className="grid gap-3 p-4 md:grid-cols-2"><div><div className="text-xs text-muted-foreground">Payslips generated</div><div className="text-lg font-semibold">{payslips.length}</div></div><div><div className="text-xs text-muted-foreground">Payment rows prepared</div><div className="text-lg font-semibold">{payments.length}</div></div></div></Panel>
      </div>
      <Panel className="overflow-hidden">
        <div className="border-b px-4 py-3"><h2 className="text-sm font-semibold">Employee payroll review</h2><p className="text-xs text-muted-foreground">Attendance, leave, roster, advance, and net salary foundations are stored as snapshots for export.</p></div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead className="sticky left-0 z-10 min-w-[280px] bg-white">Employee</TableHead><TableHead>Department</TableHead><TableHead>Location</TableHead><TableHead>Basic</TableHead><TableHead>Days</TableHead><TableHead>Scheduled</TableHead><TableHead>Worked</TableHead><TableHead>Absent</TableHead><TableHead>Leave</TableHead><TableHead>Unpaid leave</TableHead><TableHead>Late</TableHead><TableHead>Missed punch</TableHead><TableHead>Missed ranges</TableHead><TableHead>Earnings</TableHead><TableHead>Deductions</TableHead><TableHead>Advance</TableHead><TableHead>Attendance</TableHead><TableHead>Leave deduct.</TableHead><TableHead>Net</TableHead><TableHead>Status</TableHead><TableHead className="sticky right-0 bg-white text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>{employees.map((employee) => {
              const displayStatus = normalizeResultStatus(employee.status);
              return <TableRow key={employee.id}><TableCell className="sticky left-0 z-10 bg-white"><EmployeeIdentityCell employeeId={employee.employee_id} employeeName={employee.employee_name_snapshot} employeeNumber={employee.employee_no_snapshot} departmentName={employee.department_name} locationName={employee.location_name} size="sm" to={`/employees/${employee.employee_id}`} /></TableCell><TableCell>{employee.department_name ?? "-"}</TableCell><TableCell>{employee.location_name ?? "-"}</TableCell><TableCell>{money(employee.basic_salary)}</TableCell><TableCell>{employee.days_in_period}</TableCell><TableCell>{employee.scheduled_work_days ?? "-"}</TableCell><TableCell>{employee.days_worked ?? "-"}</TableCell><TableCell>{employee.absent_days ?? 0}</TableCell><TableCell>{employee.leave_days ?? 0}</TableCell><TableCell>{employee.unpaid_leave_days ?? 0}</TableCell><TableCell>{employee.late_days ?? 0}</TableCell><TableCell>{employee.missed_punch_days ?? 0}</TableCell><TableCell className="max-w-[220px] truncate">{employee.missed_date_ranges_json ?? "-"}</TableCell><TableCell>{money(employee.total_earnings)}</TableCell><TableCell>{money(employee.total_deductions)}</TableCell><TableCell>{money(employee.advance_deductions)}</TableCell><TableCell>{money(employee.attendance_deductions)}</TableCell><TableCell>{money(employee.leave_deductions)}</TableCell><TableCell className="font-semibold">{money(employee.net_salary)}</TableCell><TableCell><Badge tone={displayStatus === "FINALIZED_PLACEHOLDER" ? "success" : displayStatus === "HELD" ? "warning" : "neutral"}>{displayStatus}</Badge></TableCell><TableCell className="sticky right-0 bg-white"><div className="flex justify-end gap-1"><Button title="View lines" variant="ghost" size="icon" onClick={() => void showLines(employee)}><Eye className="h-4 w-4" /></Button><Link to={`/employees/${employee.employee_id}`}><Button title="Open Employee 360" variant="ghost" size="icon"><UserRound className="h-4 w-4" /></Button></Link>{canManage && displayStatus !== "HELD" ? <Button title="Hold row" variant="ghost" size="icon" onClick={() => setHoldModal({ employee, action: "hold" })}><PauseCircle className="h-4 w-4" /></Button> : null}{canManage && displayStatus === "HELD" ? <Button title="Release hold" variant="ghost" size="icon" onClick={() => setHoldModal({ employee, action: "release" })}><PlayCircle className="h-4 w-4" /></Button> : null}</div></TableCell></TableRow>;
            })}</TableBody>
          </Table>
        </div>
        {loading ? <EmptyState title="Loading payroll review rows" description="Fetching payroll run employees." /> : employees.length === 0 ? <EmptyState title="No employee rows" description="Recalculate or generate the run to create employee snapshots." /> : null}
      </Panel>
      {selected ? <LinesModal employee={selected} lines={lines} onClose={() => { setSelected(null); setLines(null); }} /> : null}
      {holdModal ? <HoldModal modal={holdModal} reason={holdReason} onReason={setHoldReason} onClose={() => { setHoldModal(null); setHoldReason(""); }} onConfirm={() => void confirmHoldAction()} /> : null}
      {runAction ? <RunActionModal action={runAction} reason={actionReason} onReason={setActionReason} onClose={() => { setRunAction(null); setActionReason(""); }} onConfirm={() => void confirmRunAction()} /> : null}
    </div>
  );
}

function RunActionModal({ action, reason, onReason, onClose, onConfirm }: { action: { title: string; reasonRequired?: boolean }; reason: string; onReason: (value: string) => void; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4">
      <div className="w-full max-w-md rounded-lg border bg-white shadow-xl">
        <div className="border-b px-4 py-3"><h2 className="text-sm font-semibold">{action.title}</h2></div>
        <div className="space-y-3 p-4">
          <p className="text-sm text-slate-700">Confirm this payroll action. Reason or note is stored in payroll approval history and audit logs.</p>
          <InputField value={reason} onChange={(event) => onReason(event.target.value)} placeholder={action.reasonRequired ? "Reason required" : "Optional note"} />
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={onConfirm}>Confirm</Button></div>
      </div>
    </div>
  );
}

function HoldModal({ modal, reason, onReason, onClose, onConfirm }: { modal: { employee: PayrollRunEmployee; action: "hold" | "release" }; reason: string; onReason: (value: string) => void; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4">
      <div className="w-full max-w-md rounded-lg border bg-white shadow-xl">
        <div className="border-b px-4 py-3"><h2 className="text-sm font-semibold">{modal.action === "hold" ? "Hold payroll row" : "Release payroll hold"}</h2><p className="text-xs text-muted-foreground">{modal.employee.employee_name_snapshot}</p></div>
        <div className="space-y-3 p-4">
          <p className="text-sm text-slate-700">{modal.action === "hold" ? "Enter the reason for holding this payroll result." : "Release this held payroll result back to READY_FOR_REVIEW."}</p>
          {modal.action === "hold" ? <InputField value={reason} onChange={(event) => onReason(event.target.value)} placeholder="Hold reason" /> : null}
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={onConfirm}>Confirm</Button></div>
      </div>
    </div>
  );
}

function LinesModal({ employee, lines, onClose }: { employee: PayrollRunEmployee; lines: PayrollRunLine[] | null; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4">
      <div className="w-full max-w-4xl rounded-lg border bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3"><div><h2 className="text-sm font-semibold">{employee.employee_name_snapshot}</h2><p className="text-xs text-muted-foreground">Payroll lines and calculation sources.</p></div><Button variant="outline" size="sm" onClick={onClose}>Close</Button></div>
        <div className="max-h-[70vh] overflow-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Category</TableHead><TableHead>Description</TableHead><TableHead>Source</TableHead><TableHead>Amount</TableHead></TableRow></TableHeader>
            <TableBody>{(lines ?? []).map((line) => <TableRow key={line.id}><TableCell>{line.line_type}</TableCell><TableCell>{line.category ?? "-"}</TableCell><TableCell>{line.description}</TableCell><TableCell>{line.source}</TableCell><TableCell>{money(line.amount)}</TableCell></TableRow>)}</TableBody>
          </Table>
          {!lines ? <EmptyState title="Loading line details" description="Fetching payroll run lines." /> : lines.length === 0 ? <EmptyState title="No payroll lines" description="This row does not have line items yet." /> : null}
        </div>
      </div>
    </div>
  );
}
