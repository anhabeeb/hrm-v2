import { CheckCircle2, Eye, FileText, LockKeyhole, PauseCircle, PlayCircle, RefreshCw, Send, UserRound, XCircle } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { EmployeeIdentityCell } from "../components/employee/EmployeeIdentityCell";
import { ExportMenu } from "../components/export/ExportMenu";
import { PayrollNav } from "../components/payroll/PayrollNav";
import { ActionTextButton } from "../components/ui/action-button";
import { Button, RowActionButton } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { TableSkeleton } from "../components/loading";
import { PerformanceDataTable } from "../components/table/PerformanceDataTable";
import { TablePaginationBar } from "../components/table/TablePaginationBar";
import { Panel } from "../components/ui/panel";
import { InputField, PageHeader, PageShell, WarningPanel } from "../components/ui/page-shell";
import { StatusBadge } from "../components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { usePaginatedQuery } from "../hooks/usePaginatedQuery";
import { useAlert } from "../components/alerts/useAlert";
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

const PAYROLL_ATTENDANCE_DISABLED_NOTICE = "Attendance module is disabled. Payroll will not use attendance records, late penalties, absences, missed punches, or attendance-based days worked. Use manual payroll adjustments or payroll import inputs if deductions are required.";

function attendanceNoticeFromCalculation(employee: PayrollRunEmployee) {
  if (!employee.calculation_json) return null;
  try {
    const calculation = JSON.parse(employee.calculation_json) as { attendance_module_enabled?: boolean; attendance_disabled_notice?: string | null };
    return calculation.attendance_module_enabled === false ? calculation.attendance_disabled_notice ?? PAYROLL_ATTENDANCE_DISABLED_NOTICE : null;
  } catch {
    return null;
  }
}

export function PayrollRunDetailPage() {
  const { id } = useParams();
  const { token, user } = useAuth();
  const alerts = useAlert();
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
  const [employeePage, setEmployeePage] = useState(1);
  const [employeePageSize, setEmployeePageSize] = useState(25);
  const payrollEmployeesQuery = usePaginatedQuery<{ employees: PayrollRunEmployee[]; pagination?: Record<string, unknown> }>({
    scope: user?.id,
    tableName: "payroll-run-employees",
    page: employeePage,
    pageSize: employeePageSize,
    filters: { payroll_run_id: id },
    enabled: Boolean(token && canView && id),
    queryFn: ({ signal, pagination }) => api.listPayrollRunEmployees(token!, id!, { limit: pagination.limit, offset: pagination.offset }, signal),
    getRowCount: (data) => data?.employees.length ?? 0
  });
  const employees = payrollEmployeesQuery.data?.employees ?? [];
  const employeePagination = payrollEmployeesQuery.data?.pagination;

  async function load() {
    if (!token || !canView || !id) return;
    setLoading(true);
    setError(null);
    try {
      const [runResult, approvalResult, payslipResult, paymentResult] = await Promise.all([
        api.getPayrollRun(token, id),
        api.listPayrollRunApprovals(token, id),
        api.listPayrollPayslips(token, { payroll_run_id: id }),
        api.listPayrollRunPaymentRegister(token, id)
      ]);
      setRun(runResult.run);
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
      const message = "Hold reason is required.";
      setError(message);
      alerts.showValidationError(message, "Reason required");
      return;
    }
    try {
      if (holdModal.action === "hold") await api.holdPayrollRunEmployee(token, id, holdModal.employee.id, holdReason.trim());
      if (holdModal.action === "release") await api.releasePayrollRunEmployee(token, id, holdModal.employee.id);
      setHoldModal(null);
      setHoldReason("");
      alerts.showSuccess("Payroll row updated", `Employee payroll row ${holdModal.action === "hold" ? "held" : "released"}.`);
      await Promise.all([load(), payrollEmployeesQuery.refetch()]);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Unable to update payroll row.";
      setError(message);
      alerts.showApiError(err, "Unable to update payroll row.");
    }
  }

  async function confirmRunAction() {
    if (!token || !id || !runAction) return;
    const reason = actionReason.trim();
    if (runAction.reasonRequired && !reason) {
      const message = "Reason is required.";
      setError(message);
      alerts.showValidationError(message, "Reason required");
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
      alerts.showSuccess("Payroll action completed", `${runAction.title} completed.`);
      await Promise.all([load(), payrollEmployeesQuery.refetch()]);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Unable to complete payroll action.";
      setError(message);
      alerts.showApiError(err, "Unable to complete payroll action.");
    }
  }

  if (!canView) return <PageShell><Panel><EmptyState title="Payroll run unavailable" description="Your account needs payroll.view permission." /></Panel></PageShell>;
  const attendanceDisabledNotice = employees.map(attendanceNoticeFromCalculation).find(Boolean) ?? (user?.module_visibility?.attendance === false ? PAYROLL_ATTENDANCE_DISABLED_NOTICE : null);

  return (
    <PageShell>
      <PageHeader
        title="Payroll Run Detail"
        description={run ? `Run #${run.run_no} for ${run.period_month ?? "-"} / ${run.period_year ?? "-"}` : "Monthly payroll review table."}
        actions={
          <ExportMenu
            moduleName="Payroll run detail"
            rows={employees as unknown as Record<string, unknown>[]}
            columns={["employee_no_snapshot", "employee_name_snapshot", "department_name", "location_name", "basic_salary", "days_in_period", "scheduled_work_days", "days_worked", "absent_days", "leave_days", "unpaid_leave_days", "total_earnings", "total_deductions", "advance_deductions", "attendance_deductions", "leave_deductions", "net_salary", "status"]}
            filterSummary={run ? [`Run: ${run.run_no}`, `Period: ${run.period_month ?? "-"}/${run.period_year ?? "-"}`] : []}
          />
        }
      />
      <PayrollNav />
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {attendanceDisabledNotice ? <WarningPanel tone="warning">{attendanceDisabledNotice}</WarningPanel> : null}
      {run ? <Panel className="p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0 space-y-1"><div className="flex min-w-0 flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">Approval and finalization</h2><StatusBadge value={run.status} /></div><p className="text-xs text-muted-foreground">Approval history is immutable. Finalized payroll locks frozen result snapshots for payslips and payment register preparation.</p></div>
          <div className="flex flex-wrap gap-2">
            {canSubmit ? <ActionTextButton intent="submit" size="sm" onClick={() => setRunAction({ action: "submit", title: "Submit for approval" })}><Send className="h-4 w-4" /> Submit</ActionTextButton> : null}
            {canApprove ? <ActionTextButton intent="approve" size="sm" onClick={() => setRunAction({ action: "approve", title: "Approve payroll run" })}><CheckCircle2 className="h-4 w-4" /> Approve</ActionTextButton> : null}
            {canReject ? <ActionTextButton intent="reject" size="sm" onClick={() => setRunAction({ action: "reject", title: "Reject payroll run", reasonRequired: true })}><XCircle className="h-4 w-4" /> Reject</ActionTextButton> : null}
            {canReject ? <ActionTextButton intent="send-back" size="sm" onClick={() => setRunAction({ action: "send_back", title: "Send payroll back", reasonRequired: true })}>Send back</ActionTextButton> : null}
            {canFinalize ? <ActionTextButton intent="finalize" size="sm" onClick={() => setRunAction({ action: "finalize", title: "Finalize payroll run" })}><LockKeyhole className="h-4 w-4" /> Finalize</ActionTextButton> : null}
            {canUnlock ? <ActionTextButton intent="warning" size="sm" onClick={() => setRunAction({ action: "unlock", title: "Unlock finalized payroll", reasonRequired: true })}><RefreshCw className="h-4 w-4" /> Unlock</ActionTextButton> : null}
            {canPayslips ? <ActionTextButton intent="generate" size="sm" onClick={() => setRunAction({ action: "payslips", title: "Generate payslips" })}><FileText className="h-4 w-4" /> Generate payslips</ActionTextButton> : null}
            {canPayments ? <ActionTextButton intent="create" size="sm" onClick={() => setRunAction({ action: "payment_register", title: "Prepare payment register" })}>Prepare register</ActionTextButton> : null}
          </div>
        </div>
      </Panel> : null}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel className="overflow-hidden">
          <div className="border-b px-4 py-3"><h2 className="text-sm font-semibold">Approval timeline</h2></div>
          {loading ? (
            <TableSkeleton rows={3} columns={5} label="Loading payroll approval timeline" />
          ) : approvals.length === 0 ? (
            <EmptyState title="No approval events" description="Submit, approval, rejection, and finalization events will appear here." />
          ) : (
            <div className="flex flex-col gap-2 p-3">
              {approvals.map((event) => (
                <div
                  key={event.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    padding: "0.75rem 1rem",
                    background: "var(--v3-surface-2)",
                    border: "0.5px solid var(--v3-border)",
                    borderRadius: "var(--v3-radius-card)"
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{event.action}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
                      <span>{event.created_at}</span>
                      <span style={{ color: "var(--v3-border-strong)" }}>&middot;</span>
                      <span>{event.actor_name_snapshot ?? "-"}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-xs text-muted-foreground">
                    {event.previous_status ?? "-"} {"->"} {event.new_status ?? "-"}
                  </div>
                  <div className="max-w-[220px] shrink-0 truncate text-right text-xs text-muted-foreground" title={event.reason ?? event.note ?? undefined}>
                    {event.reason ?? event.note ?? "-"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel className="overflow-hidden"><div className="border-b px-4 py-3"><h2 className="text-sm font-semibold">Payslips and payment register</h2><p className="text-xs text-muted-foreground">Payment register is manual confirmation only. No bank export is included.</p></div><div className="grid gap-3 p-4 md:grid-cols-2"><div><div className="text-xs text-muted-foreground">Payslips generated</div><div className="text-lg font-semibold">{payslips.length}</div></div><div><div className="text-xs text-muted-foreground">Payment rows prepared</div><div className="text-lg font-semibold">{payments.length}</div></div></div></Panel>
      </div>
      <Panel className="overflow-hidden">
        <div className="border-b px-4 py-3"><h2 className="text-sm font-semibold">Employee payroll review</h2><p className="text-xs text-muted-foreground">Attendance, leave, roster, advance, and net salary foundations are stored as snapshots for export.</p></div>
        <PerformanceDataTable loading={loading || payrollEmployeesQuery.isInitialLoading} refreshing={payrollEmployeesQuery.isRefreshing} error={error ?? payrollEmployeesQuery.error?.message ?? null} empty={employees.length === 0} rowCount={employees.length} emptyTitle="No employee rows" emptyDescription="Recalculate or generate the run to create employee snapshots." skeleton={<TableSkeleton rows={5} columns={9} label="Loading payroll review rows" />} className="rounded-lg">
          <Table>
            <TableHeader><TableRow><TableHead className="sticky left-0 z-10 min-w-[280px] bg-slate-50/60">Employee</TableHead><TableHead className="bg-slate-50/60">Department</TableHead><TableHead className="bg-slate-50/60">Location</TableHead><TableHead className="bg-slate-50/60">Basic</TableHead><TableHead className="bg-slate-50/60">Days</TableHead><TableHead className="bg-slate-50/60">Scheduled</TableHead><TableHead className="bg-slate-50/60">Worked</TableHead><TableHead className="bg-slate-50/60">Absent</TableHead><TableHead className="bg-slate-50/60">Leave</TableHead><TableHead className="bg-slate-50/60">Unpaid leave</TableHead><TableHead className="bg-slate-50/60">Late</TableHead><TableHead className="bg-slate-50/60">Missed punch</TableHead><TableHead className="bg-slate-50/60">Missed ranges</TableHead><TableHead className="bg-slate-50/60">Earnings</TableHead><TableHead className="bg-slate-50/60">Deductions</TableHead><TableHead className="bg-slate-50/60">Advance</TableHead><TableHead className="bg-slate-50/60">Attendance</TableHead><TableHead className="bg-slate-50/60">Leave deduct.</TableHead><TableHead className="bg-slate-50/60">Net</TableHead><TableHead className="bg-slate-50/60">Status</TableHead><TableHead className="sticky right-0 bg-slate-50/60 text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>{employees.map((employee) => {
              const displayStatus = normalizeResultStatus(employee.status);
              return <TableRow key={employee.id}><TableCell className="sticky left-0 z-10 bg-white"><EmployeeIdentityCell employeeId={employee.employee_id} employeeName={employee.employee_name_snapshot} employeeNumber={employee.employee_no_snapshot} departmentName={employee.department_name} locationName={employee.location_name} size="sm" to={`/employees/${employee.employee_id}`} /></TableCell><TableCell>{employee.department_name ?? "-"}</TableCell><TableCell>{employee.location_name ?? "-"}</TableCell><TableCell>{money(employee.basic_salary)}</TableCell><TableCell>{employee.days_in_period}</TableCell><TableCell>{employee.scheduled_work_days ?? "-"}</TableCell><TableCell>{employee.days_worked ?? "-"}</TableCell><TableCell>{employee.absent_days ?? 0}</TableCell><TableCell>{employee.leave_days ?? 0}</TableCell><TableCell>{employee.unpaid_leave_days ?? 0}</TableCell><TableCell>{employee.late_days ?? 0}</TableCell><TableCell>{employee.missed_punch_days ?? 0}</TableCell><TableCell className="max-w-[220px] truncate">{employee.missed_date_ranges_json ?? "-"}</TableCell><TableCell>{money(employee.total_earnings)}</TableCell><TableCell>{money(employee.total_deductions)}</TableCell><TableCell>{money(employee.advance_deductions)}</TableCell><TableCell>{money(employee.attendance_deductions)}</TableCell><TableCell>{money(employee.leave_deductions)}</TableCell><TableCell className="font-semibold">{money(employee.net_salary)}</TableCell><TableCell><StatusBadge value={displayStatus} /></TableCell><TableCell className="sticky right-0 bg-white"><div className="flex justify-end gap-1"><RowActionButton intent="view" title="View lines" onClick={() => void showLines(employee)}><Eye className="h-4 w-4" /></RowActionButton><Link to={`/employees/${employee.employee_id}`}><RowActionButton intent="view" title="Open Employee 360"><UserRound className="h-4 w-4" /></RowActionButton></Link>{canManage && displayStatus !== "HELD" ? <RowActionButton intent="hold" title="Hold row" onClick={() => setHoldModal({ employee, action: "hold" })}><PauseCircle className="h-4 w-4" /></RowActionButton> : null}{canManage && displayStatus === "HELD" ? <RowActionButton intent="release" title="Release hold" onClick={() => setHoldModal({ employee, action: "release" })}><PlayCircle className="h-4 w-4" /></RowActionButton> : null}</div></TableCell></TableRow>;
            })}</TableBody>
          </Table>
        </PerformanceDataTable>
        <TablePaginationBar page={employeePage} pageSize={employeePageSize} rowCount={employees.length} hasMore={Boolean(employeePagination?.has_more)} onPageChange={setEmployeePage} onPageSizeChange={setEmployeePageSize} />
      </Panel>
      {selected ? <LinesModal employee={selected} lines={lines} onClose={() => { setSelected(null); setLines(null); }} /> : null}
      {holdModal ? <HoldModal modal={holdModal} reason={holdReason} onReason={setHoldReason} onClose={() => { setHoldModal(null); setHoldReason(""); }} onConfirm={() => void confirmHoldAction()} /> : null}
      {runAction ? <RunActionModal action={runAction} reason={actionReason} onReason={setActionReason} onClose={() => { setRunAction(null); setActionReason(""); }} onConfirm={() => void confirmRunAction()} /> : null}
    </PageShell>
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
          <p className="text-sm text-slate-700">{modal.action === "hold" ? "Enter the reason for holding this payroll result." : "Release this held payroll result back to Ready for review."}</p>
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
        <div className="max-h-[70vh] overflow-auto p-3">
          <div className="overflow-hidden rounded-md border-[0.5px] border-slate-200">
            <Table>
              <TableHeader><TableRow><TableHead className="bg-slate-50/60">Type</TableHead><TableHead className="bg-slate-50/60">Category</TableHead><TableHead className="bg-slate-50/60">Description</TableHead><TableHead className="bg-slate-50/60">Source</TableHead><TableHead className="bg-slate-50/60">Amount</TableHead></TableRow></TableHeader>
              <TableBody>{(lines ?? []).map((line) => <TableRow key={line.id}><TableCell>{line.line_type}</TableCell><TableCell>{line.category ?? "-"}</TableCell><TableCell>{line.description}</TableCell><TableCell>{line.source}</TableCell><TableCell>{money(line.amount)}</TableCell></TableRow>)}</TableBody>
            </Table>
          </div>
          {!lines ? <TableSkeleton rows={5} columns={5} label="Loading payroll line details" /> : lines.length === 0 ? <EmptyState title="No payroll lines" description="This row does not have line items yet." /> : null}
        </div>
      </div>
    </div>
  );
}
