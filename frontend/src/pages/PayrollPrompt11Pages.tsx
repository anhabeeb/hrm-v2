import { CheckCircle2, Download, Eye, RefreshCw, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { EmployeeIdentityCell } from "../components/employee/EmployeeIdentityCell";
import { PayrollNav } from "../components/payroll/PayrollNav";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Panel } from "../components/ui/panel";
import { StatusBadge } from "../components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import type { PayrollHistoryRow, PayrollPaymentRegister, PayrollPayslip } from "../types/payroll";

function money(value: unknown) {
  return Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Header({ title, description }: { title: string; description: string }) {
  return <><div><h1 className="text-lg font-semibold">{title}</h1><p className="text-sm text-muted-foreground">{description}</p></div><PayrollNav /></>;
}

function ErrorMessage({ error }: { error: string | null }) {
  return error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null;
}

function usePageLoad<T>(loader: (token: string) => Promise<T>, canView: boolean) {
  const { token } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  async function load() {
    if (!token || !canView) return;
    setLoading(true); setError(null);
    try { setData(await loader(token)); } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to load payroll data."); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [token, canView]);
  return { data, error, loading, reload: load };
}

export function PayrollPayslipsPage() {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("payroll.payslips.view") || permissions.has("payroll.view");
  const canRegenerate = permissions.has("payroll.payslips.regenerate") || permissions.has("payroll.payslips.manage");
  const canDownload = permissions.has("payroll.payslips.download") || permissions.has("payroll.payslips.manage");
  const { data, error, loading, reload } = usePageLoad((authToken) => api.listPayrollPayslips(authToken), canView);
  const [actionError, setActionError] = useState<string | null>(null);
  async function openPreview(id: string) {
    if (!token) return;
    try {
      const file = await api.previewPayrollPayslip(token, id);
      window.open(URL.createObjectURL(file.blob), "_blank", "noopener,noreferrer");
    } catch (err) { setActionError(err instanceof ApiError ? err.message : "Unable to preview payslip."); }
  }
  async function download(id: string) {
    if (!token) return;
    try {
      const file = await api.downloadPayrollPayslip(token, id);
      const url = URL.createObjectURL(file.blob);
      const link = document.createElement("a");
      link.href = url; link.download = file.filename || "payslip.html"; link.click();
      URL.revokeObjectURL(url);
    } catch (err) { setActionError(err instanceof ApiError ? err.message : "Unable to download payslip."); }
  }
  async function regenerate(id: string) {
    if (!token) return;
    try { await api.regeneratePayrollPayslip(token, id); await reload(); } catch (err) { setActionError(err instanceof ApiError ? err.message : "Unable to regenerate payslip."); }
  }
  const rows = data?.payslips ?? [];
  if (!canView) return <Panel><EmptyState title="Payslips unavailable" description="Your account needs payroll payslip permission." /></Panel>;
  return <div className="space-y-4"><Header title="Payslips" description="Generated payslips from finalized payroll snapshots." /><ErrorMessage error={error ?? actionError} /><Panel className="overflow-hidden"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Period</TableHead><TableHead>Payslip</TableHead><TableHead>Employee</TableHead><TableHead>Status</TableHead><TableHead>Version</TableHead><TableHead>Generated</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{rows.map((row: PayrollPayslip) => <TableRow key={row.id}><TableCell>{row.period_month}/{row.period_year}</TableCell><TableCell className="font-mono text-xs">{row.payslip_number}</TableCell><TableCell><EmployeeIdentityCell employeeId={row.employee_id} employeeName={row.employee_name_snapshot ?? "-"} employeeNumber={row.employee_no_snapshot ?? ""} size="sm" /></TableCell><TableCell><StatusBadge value={row.status} /></TableCell><TableCell>{row.version_number}</TableCell><TableCell>{row.generated_at ?? "-"}</TableCell><TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" title="Preview" onClick={() => void openPreview(row.id)}><Eye className="h-4 w-4" /></Button>{canDownload ? <Button variant="ghost" size="icon" title="Download" onClick={() => void download(row.id)}><Download className="h-4 w-4" /></Button> : null}{canRegenerate ? <Button variant="ghost" size="icon" title="Regenerate" onClick={() => void regenerate(row.id)}><RefreshCw className="h-4 w-4" /></Button> : null}</div></TableCell></TableRow>)}</TableBody></Table></div>{loading ? <EmptyState title="Loading payslips" description="Fetching generated payslip records." /> : rows.length === 0 ? <EmptyState title="No payslips available" description="Generate payslips from a finalized payroll run." /> : null}</Panel></div>;
}

export function PayrollPaymentRegisterPage() {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("payroll.payment_register.view") || permissions.has("payroll.view");
  const canConfirm = permissions.has("payroll.payment_register.confirm_manual_paid") || permissions.has("payroll.payment_register.manage");
  const canCancel = permissions.has("payroll.payment_register.cancel") || permissions.has("payroll.payment_register.manage");
  const { data, error, loading, reload } = usePageLoad((token) => api.listPayrollPaymentRegisters(token), canView);
  const [action, setAction] = useState<{ type: "confirm" | "cancel"; row: PayrollPaymentRegister } | null>(null);
  const [confirmationReference, setConfirmationReference] = useState("");
  const [confirmationNote, setConfirmationNote] = useState("");
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  function openAction(type: "confirm" | "cancel", row: PayrollPaymentRegister) {
    setAction({ type, row });
    setConfirmationReference("");
    setConfirmationNote("");
    setReason("");
    setActionError(null);
  }

  async function submitAction() {
    if (!token || !action) return;
    setActionError(null);
    try {
      if (action.type === "confirm") {
        if (!confirmationReference.trim() || !confirmationNote.trim()) {
          setActionError("Confirmation reference and confirmation note are required.");
          return;
        }
        await api.confirmManualPayrollPayment(token, action.row.id, {
          confirmation_reference: confirmationReference.trim(),
          confirmation_note: confirmationNote.trim()
        });
      } else {
        if (!reason.trim()) {
          setActionError("Cancellation reason is required.");
          return;
        }
        await api.cancelPayrollPaymentRegister(token, action.row.id, reason.trim());
      }
      setAction(null);
      await reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Payment register action could not be completed.");
    }
  }

  const rows = data?.payments ?? [];
  if (!canView) return <Panel><EmptyState title="Payment register unavailable" description="Your account needs payment register permission." /></Panel>;
  return (
    <div className="space-y-4">
      <Header title="Payment Register" description="Manual payment confirmation only. No bank transfer is performed." />
      <ErrorMessage error={error ?? actionError} />
      <Panel className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Bank</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Net salary</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row: PayrollPaymentRegister) => {
                const closed = row.payment_status === "MANUALLY_CONFIRMED_PAID" || row.payment_status === "CANCELLED";
                return (
                  <TableRow key={row.id}>
                    <TableCell>{row.period_month}/{row.period_year}</TableCell>
                    <TableCell><EmployeeIdentityCell employeeId={row.employee_id} employeeName={row.employee_name_snapshot} employeeNumber={row.employee_number_snapshot} size="sm" /></TableCell>
                    <TableCell>{row.payment_method_snapshot ?? "-"}</TableCell>
                    <TableCell>{row.bank_name_snapshot ?? "-"}</TableCell>
                    <TableCell>{row.bank_account_number_masked ?? "-"}</TableCell>
                    <TableCell>{money(row.net_salary_amount)}</TableCell>
                    <TableCell><StatusBadge value={row.payment_status} /></TableCell>
                    <TableCell>{row.confirmation_reference ?? "-"}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {canConfirm ? <Button variant="ghost" size="icon" title="Confirm paid manually" disabled={closed} onClick={() => openAction("confirm", row)}><CheckCircle2 className="h-4 w-4" /></Button> : null}
                        {canCancel ? <Button variant="ghost" size="icon" title="Cancel payment row" disabled={closed} onClick={() => openAction("cancel", row)}><XCircle className="h-4 w-4" /></Button> : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {loading ? <EmptyState title="Loading payment register" description="Fetching prepared payment rows." /> : rows.length === 0 ? <EmptyState title="No payment register rows" description="Prepare the register from a finalized payroll run." /> : null}
      </Panel>
      {action ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <Panel className="w-full max-w-lg space-y-4 p-4 shadow-lg">
            <div>
              <h2 className="text-base font-semibold">{action.type === "confirm" ? "Confirm manual payment" : "Cancel payment register row"}</h2>
              <p className="text-sm text-muted-foreground">
                {action.row.employee_name_snapshot} - {money(action.row.net_salary_amount)}
              </p>
            </div>
            {action.type === "confirm" ? (
              <div className="space-y-3">
                <div className="rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">Manual payment confirmation only. No bank transfer is performed.</div>
                <label className="block space-y-1 text-sm">
                  <span className="font-medium">Confirmation reference</span>
                  <Input required name="confirmation_reference" value={confirmationReference} onChange={(event) => setConfirmationReference(event.target.value)} placeholder="Receipt, transfer, or cash voucher reference" />
                </label>
                <label className="block space-y-1 text-sm">
                  <span className="font-medium">Confirmation note</span>
                  <Input required name="confirmation_note" value={confirmationNote} onChange={(event) => setConfirmationNote(event.target.value)} placeholder="Who confirmed this manual payment and why" />
                </label>
              </div>
            ) : (
              <label className="block space-y-1 text-sm">
                <span className="font-medium">Cancellation reason</span>
                <Input required value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for cancelling this payment row" />
              </label>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAction(null)}>Cancel</Button>
              <Button variant={action.type === "confirm" ? "primary" : "danger"} onClick={() => void submitAction()}>{action.type === "confirm" ? "Confirm paid" : "Cancel row"}</Button>
            </div>
          </Panel>
        </div>
      ) : null}
    </div>
  );
}

export function PayrollHistoryPage() {
  const { user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("payroll.history.view") || permissions.has("payroll.reports.view") || permissions.has("payroll.view");
  const { data, error, loading } = usePageLoad((token) => api.getPayrollHistory(token), canView);
  const rows = data?.history ?? [];
  if (!canView) return <Panel><EmptyState title="Payroll history unavailable" description="Your account needs payroll history permission." /></Panel>;
  return <div className="space-y-4"><Header title="Payroll History" description="Finalized payroll history based on frozen payroll result snapshots." /><ErrorMessage error={error} /><Panel className="overflow-hidden"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Period</TableHead><TableHead>Run</TableHead><TableHead>Employee</TableHead><TableHead>Department</TableHead><TableHead>Location</TableHead><TableHead>Earnings</TableHead><TableHead>Deductions</TableHead><TableHead>Net</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{rows.map((row: PayrollHistoryRow, index) => <TableRow key={`${row.payroll_run_id}-${row.employee_id}-${index}`}><TableCell>{row.period_month}/{row.period_year}</TableCell><TableCell>#{row.run_no}</TableCell><TableCell><EmployeeIdentityCell employeeId={row.employee_id} employeeName={row.employee_name_snapshot} employeeNumber={row.employee_no_snapshot} departmentName={row.department_name} locationName={row.location_name} size="sm" /></TableCell><TableCell>{row.department_name ?? "-"}</TableCell><TableCell>{row.location_name ?? "-"}</TableCell><TableCell>{money(row.total_earnings)}</TableCell><TableCell>{money(row.total_deductions)}</TableCell><TableCell className="font-semibold">{money(row.net_salary)}</TableCell><TableCell><StatusBadge value={row.status} /></TableCell></TableRow>)}</TableBody></Table></div>{loading ? <EmptyState title="Loading payroll history" description="Fetching finalized payroll rows." /> : rows.length === 0 ? <EmptyState title="No finalized payroll history" description="Finalized payroll snapshots will appear here." /> : null}</Panel></div>;
}
