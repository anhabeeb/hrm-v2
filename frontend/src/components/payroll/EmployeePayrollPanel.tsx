import { Edit, Plus, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { ActionTextButton } from "../ui/action-button";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { FormSkeleton } from "../loading";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { CheckboxField, SelectField } from "../ui/page-shell";
import { Panel } from "../ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { useAuth } from "../../hooks/useAuth";
import { ApiError, api } from "../../lib/api";
import { focusFirstInvalidField, normalizeValidationIssues, useFormValidation, validateAmount, validateDateField, validateRequiredField, type ValidationIssue } from "../../lib/form-validation";
import type { Employee } from "../../types/employees";
import type { EmployeePayrollProfile, EmployeePayrollSummary } from "../../types/payroll";
import { useAlert } from "../alerts/useAlert";
import { FormErrorSummary } from "../forms/FormErrorSummary";
import { ValidatedReasonField, ValidatedTextField } from "../forms/validated-fields";
import { EmployeePayrollFoundationPanels } from "./EmployeePayrollFoundationPanels";

function money(value: number | null | undefined, currency = "MVR") {
  return `${currency} ${Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function hasErrors(issues: ValidationIssue[]) {
  return issues.some((issue) => issue.severity === "error");
}

function validateIncrementForm(input: { amount: string; effective_date: string; reason: string }): ValidationIssue[] {
  return [
    ...validateRequiredField(input.amount, "increment_amount", "Increment amount"),
    ...validateAmount({ value: input.amount, field: "increment_amount", label: "Increment amount", min: 0 }),
    ...validateDateField(input.effective_date, "effective_date", "Effective date", { required: true }),
    ...validateRequiredField(input.reason, "reason", "Reason")
  ];
}

function validateAdvanceForm(input: { amount: string; payment_date: string }): ValidationIssue[] {
  return [
    ...validateRequiredField(input.amount, "amount", "Advance amount"),
    ...validateAmount({ value: input.amount, field: "amount", label: "Advance amount", min: 0 }),
    ...validateDateField(input.payment_date, "payment_date", "Payment date", { required: true })
  ];
}

export function EmployeePayrollPanel({ employee }: { employee: Employee }) {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("employees.payroll.view") || permissions.has("payroll.view");
  const canUpdate = permissions.has("employees.payroll.update");
  const canAdvance = permissions.has("payroll.advances.manage");
  const [summary, setSummary] = useState<EmployeePayrollSummary | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EmployeePayrollProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [salaryReason, setSalaryReason] = useState("");
  const [incrementForm, setIncrementForm] = useState<{ amount: string; effective_date: string; reason: string } | null>(null);
  const [advanceForm, setAdvanceForm] = useState<{ amount: string; payment_date: string } | null>(null);
  const alerts = useAlert();

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.getEmployeePayrollSummary(token, employee.id);
      setSummary(result);
      setForm(result.profile);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load employee payroll.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, employee.id, canView]);

  function update<K extends keyof EmployeePayrollProfile>(key: K, value: EmployeePayrollProfile[K]) {
    if (form) setForm({ ...form, [key]: value });
  }

  async function saveProfile(reason?: string) {
    if (!token || !form) return;
    const salaryChanged = summary?.profile.basic_salary !== form.basic_salary;
    if (salaryChanged && !reason) {
      setSalaryReason("");
      return;
    }
    try {
      const result = await api.updateEmployeePayrollProfile(token, employee.id, { ...form, reason });
      setForm(result.profile);
      setSummary(summary ? { ...summary, profile: result.profile } : null);
      setEditing(false);
      setMessage("Payroll profile saved.");
      alerts.showSuccess("Payroll profile saved", "Employee payroll settings were updated.");
      await load();
    } catch (err) {
      const issues = normalizeValidationIssues(err);
      if (issues.length) alerts.showValidationError(issues, "Payroll profile cannot be saved");
      else alerts.showApiError(err, "Payroll profile failed");
      setError(issues[0]?.message ?? (err instanceof ApiError ? err.message : "Unable to save payroll profile."));
    }
  }

  async function addIncrement(input: { amount: string; effective_date: string; reason: string }) {
    if (!token) return;
    const amount = Number(input.amount);
    const effective_date = input.effective_date;
    const reason = input.reason;
    try {
      await api.createEmployeeIncrement(token, employee.id, { increment_amount: amount, effective_date, reason });
      setIncrementForm(null);
      await load();
      alerts.showSuccess("Salary increment added", "The employee increment was recorded.");
    } catch (err) {
      const issues = normalizeValidationIssues(err);
      if (issues.length) alerts.showValidationError(issues, "Increment cannot be added");
      else alerts.showApiError(err, "Increment failed");
      setError(issues[0]?.message ?? (err instanceof ApiError ? err.message : "Unable to add increment."));
    }
  }

  async function addAdvance(input: { amount: string; payment_date: string }) {
    if (!token) return;
    const amount = Number(input.amount);
    const payment_date = input.payment_date;
    try {
      await api.createPayrollAdvance(token, { employee_id: employee.id, amount, payment_date });
      setAdvanceForm(null);
      await load();
      alerts.showSuccess("Payroll advance created", "The advance request was recorded.");
    } catch (err) {
      const issues = normalizeValidationIssues(err);
      if (issues.length) alerts.showValidationError(issues, "Advance cannot be created");
      else alerts.showApiError(err, "Advance failed");
      setError(issues[0]?.message ?? (err instanceof ApiError ? err.message : "Unable to add advance."));
    }
  }

  if (!canView) return <Panel><EmptyState title="Payroll unavailable" description="Your account needs employees.payroll.view or payroll.view permission." /></Panel>;
  if (loading) return <Panel><FormSkeleton fields={8} label="Loading payroll profile" /></Panel>;
  if (!summary || !form) return <Panel><EmptyState title="No payroll profile" description="Payroll defaults could not be loaded for this employee." /></Panel>;

  return (
    <div className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}
      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div><h2 className="text-sm font-semibold">Payroll profile</h2><p className="text-xs text-muted-foreground">Sensitive bank/payment fields require payroll access.</p></div>
          {canUpdate ? editing ? <ActionTextButton intent="save" size="sm" onClick={() => summary?.profile.basic_salary !== form.basic_salary ? setSalaryReason(" ") : void saveProfile()}><Save className="h-4 w-4" /> Save profile</ActionTextButton> : <ActionTextButton intent="neutral" size="sm" onClick={() => setEditing(true)}><Edit className="h-4 w-4" /> Edit profile</ActionTextButton> : null}
        </div>
        <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
          <Field label="Basic salary"><Input disabled={!editing} type="number" min={0} value={form.basic_salary} onChange={(event) => update("basic_salary", Number(event.target.value))} /></Field>
          <Field label="Currency"><Input disabled={!editing} value={form.currency} onChange={(event) => update("currency", event.target.value)} /></Field>
          <SelectField label="Payment method" disabled={!editing} value={form.payment_method} onValueChange={(value) => update("payment_method", value as EmployeePayrollProfile["payment_method"])}><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CHEQUE">Cheque</option><option value="OTHER">Other</option></SelectField>
          <SelectField label="Daily rate mode" disabled={!editing} value={form.daily_rate_mode} onValueChange={(value) => update("daily_rate_mode", value as EmployeePayrollProfile["daily_rate_mode"])}><option value="CALENDAR_DAYS">Calendar days</option><option value="WORKING_DAYS">Working days</option><option value="FIXED_30_DAYS">Fixed 30 days</option></SelectField>
          <Field label="Bank name"><Input disabled={!editing} value={form.bank_name ?? ""} onChange={(event) => update("bank_name", event.target.value || null)} /></Field>
          <Field label="Bank account no"><Input disabled={!editing} value={form.bank_account_no ?? ""} onChange={(event) => update("bank_account_no", event.target.value || null)} /></Field>
          <Field label="Bank account name"><Input disabled={!editing} value={form.bank_account_name ?? ""} onChange={(event) => update("bank_account_name", event.target.value || null)} /></Field>
          <Field label="Advance limit"><Input disabled={!editing} type="number" min={0} value={form.advance_limit_amount ?? ""} onChange={(event) => update("advance_limit_amount", event.target.value ? Number(event.target.value) : null)} /></Field>
          <Toggle disabled={!editing} label="Payroll included" checked={Boolean(form.payroll_included)} onChange={(value) => update("payroll_included", value)} />
          <Toggle disabled={!editing} label="Overtime eligible" checked={Boolean(form.overtime_eligible)} onChange={(value) => update("overtime_eligible", value)} />
          <Toggle disabled={!editing} label="Benefits eligible" checked={Boolean(form.benefits_eligible)} onChange={(value) => update("benefits_eligible", value)} />
          <Toggle disabled={!editing} label="Advance eligible" checked={Boolean(form.advance_eligible)} onChange={(value) => update("advance_eligible", value)} />
          <Toggle disabled={!editing} label="Missed-day deduction" checked={Boolean(form.missed_day_deduction_enabled)} onChange={(value) => update("missed_day_deduction_enabled", value)} />
          <Toggle disabled={!editing} label="Leave deduction" checked={Boolean(form.leave_deduction_enabled)} onChange={(value) => update("leave_deduction_enabled", value)} />
        </div>
      </Panel>
      <EmployeePayrollFoundationPanels employeeId={employee.id} summary={summary} onReload={load} />
      <div className="grid gap-4 xl:grid-cols-2">
        <RowsPanel title="Salary history" rows={summary.salary_history ?? []} columns={["effective_date", "old_basic_salary", "new_basic_salary", "reason", "created_by_name"]} action={canUpdate ? <ActionTextButton intent="create" size="sm" onClick={() => setIncrementForm({ amount: "", effective_date: new Date().toISOString().slice(0, 10), reason: "" })}><Plus className="h-4 w-4" /> Add increment</ActionTextButton> : null} />
        <RowsPanel title="Increment history" rows={summary.increments ?? []} columns={["effective_date", "old_salary", "increment_amount", "new_salary", "reason"]} />
        <RowsPanel title="Advance payments" rows={(summary.advances ?? []) as unknown as Record<string, unknown>[]} columns={["payment_date", "amount", "status", "notes", "paid_at"]} action={canAdvance ? <ActionTextButton intent="create" size="sm" onClick={() => setAdvanceForm({ amount: "", payment_date: new Date().toISOString().slice(0, 10) })}><Plus className="h-4 w-4" /> Add advance</ActionTextButton> : null} />
        <RowsPanel title="Deductions" rows={(summary.deductions ?? []) as unknown as Record<string, unknown>[]} columns={["deduction_type", "amount", "status", "reason", "start_date", "end_date"]} />
        <RowsPanel title="Payroll run history" rows={(summary.runs ?? []) as unknown as Record<string, unknown>[]} columns={["employee_no_snapshot", "basic_salary", "days_worked", "total_deductions", "net_salary", "status"]} />
        <RowsPanel title="Payslip history" rows={(summary.payslips ?? []) as unknown as Record<string, unknown>[]} columns={["period_month", "period_year", "payslip_number", "status", "version_number", "generated_at"]} />
        <RowsPanel title="Custom deductions" rows={(summary.custom_deductions ?? []) as unknown as Record<string, unknown>[]} columns={["template_name_snapshot", "category_snapshot", "assigned_amount", "total_amount", "remaining_balance", "approval_status", "status"]} />
        <RowsPanel title="Custom deduction payroll applications" rows={(summary.custom_deduction_applications ?? []) as unknown as Record<string, unknown>[]} columns={["template_name_snapshot", "scheduled_amount", "deducted_amount", "shortfall_amount", "remaining_balance_after", "application_status", "created_at"]} />
        <RowsPanel title="Final settlements" rows={(summary.settlements ?? []) as unknown as Record<string, unknown>[]} columns={["final_salary_amount", "pending_advance_amount", "net_settlement_amount", "status", "reason"]} />
      </div>
      <RowsPanel title="Payroll audit" rows={summary.audit ?? []} columns={["action", "entity_type", "reason", "created_at"]} />
      {salaryReason ? <SalaryReasonModal value={salaryReason === " " ? "" : salaryReason} onChange={(value) => setSalaryReason(value || " ")} onClose={() => setSalaryReason("")} onConfirm={() => { void saveProfile(salaryReason.trim()); setSalaryReason(""); }} /> : null}
      {incrementForm ? <IncrementModal form={incrementForm} onChange={setIncrementForm} onClose={() => setIncrementForm(null)} onConfirm={() => void addIncrement(incrementForm)} /> : null}
      {advanceForm ? <AdvanceModal form={advanceForm} onChange={setAdvanceForm} onClose={() => setAdvanceForm(null)} onConfirm={() => void addAdvance(advanceForm)} /> : null}
    </div>
  );
}

function SalaryReasonModal({ value, onChange, onClose, onConfirm }: { value: string; onChange: (value: string) => void; onClose: () => void; onConfirm: () => void }) {
  const validation = useFormValidation();
  const alerts = useAlert();
  function handleSalaryReasonSubmit() {
    const issues = validateRequiredField(value, "reason", "Reason");
    validation.setIssues(issues);
    if (hasErrors(issues)) {
      alerts.showValidationError(issues, "Salary change needs a reason");
      setTimeout(() => focusFirstInvalidField(issues), 0);
      return;
    }
    onConfirm();
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4"><div className="w-full max-w-md rounded-lg border bg-white p-4 shadow-xl"><h2 className="text-sm font-semibold">Salary change reason</h2><p className="mt-1 text-xs text-muted-foreground">A reason is required when changing basic salary.</p><div className="mt-3"><FormErrorSummary issues={validation.issues} /><ValidatedReasonField required value={value} issues={validation.issues} onChange={onChange} /></div><div className="mt-4 flex justify-end gap-2"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><ActionTextButton intent="save" size="sm" onClick={handleSalaryReasonSubmit}>Save profile</ActionTextButton></div></div></div>;
}

function IncrementModal({ form, onChange, onClose, onConfirm }: { form: { amount: string; effective_date: string; reason: string }; onChange: (form: { amount: string; effective_date: string; reason: string }) => void; onClose: () => void; onConfirm: () => void }) {
  const validation = useFormValidation();
  const alerts = useAlert();
  function handleIncrementSubmit() {
    const issues = validateIncrementForm(form);
    validation.setIssues(issues);
    if (hasErrors(issues)) {
      alerts.showValidationError(issues, "Increment needs attention");
      setTimeout(() => focusFirstInvalidField(issues), 0);
      return;
    }
    onConfirm();
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4"><div className="w-full max-w-md rounded-lg border bg-white p-4 shadow-xl"><h2 className="text-sm font-semibold">Add salary increment</h2><div className="mt-3 grid gap-3"><FormErrorSummary issues={validation.issues} /><ValidatedTextField field="increment_amount" label="Increment amount" type="number" min={0} value={form.amount} issues={validation.issues} onChange={(amount) => onChange({ ...form, amount })} /><ValidatedTextField field="effective_date" label="Effective date" type="date" value={form.effective_date} issues={validation.issues} onChange={(effective_date) => onChange({ ...form, effective_date })} /><ValidatedReasonField required value={form.reason} issues={validation.issues} onChange={(reason) => onChange({ ...form, reason })} /></div><div className="mt-4 flex justify-end gap-2"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><ActionTextButton intent="create" size="sm" onClick={handleIncrementSubmit}>Add increment</ActionTextButton></div></div></div>;
}

function AdvanceModal({ form, onChange, onClose, onConfirm }: { form: { amount: string; payment_date: string }; onChange: (form: { amount: string; payment_date: string }) => void; onClose: () => void; onConfirm: () => void }) {
  const validation = useFormValidation();
  const alerts = useAlert();
  function handleAdvanceSubmit() {
    const issues = validateAdvanceForm(form);
    validation.setIssues(issues);
    if (hasErrors(issues)) {
      alerts.showValidationError(issues, "Advance needs attention");
      setTimeout(() => focusFirstInvalidField(issues), 0);
      return;
    }
    onConfirm();
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4"><div className="w-full max-w-md rounded-lg border bg-white p-4 shadow-xl"><h2 className="text-sm font-semibold">Add payroll advance</h2><div className="mt-3 grid gap-3"><FormErrorSummary issues={validation.issues} /><ValidatedTextField field="amount" label="Advance amount" type="number" min={0} value={form.amount} issues={validation.issues} onChange={(amount) => onChange({ ...form, amount })} /><ValidatedTextField field="payment_date" label="Payment date" type="date" value={form.payment_date} issues={validation.issues} onChange={(payment_date) => onChange({ ...form, payment_date })} /></div><div className="mt-4 flex justify-end gap-2"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><ActionTextButton intent="create" size="sm" onClick={handleAdvanceSubmit}>Add advance</ActionTextButton></div></div></div>;
}

function RowsPanel({ title, rows, columns, action }: { title: string; rows: Record<string, unknown>[]; columns: string[]; action?: React.ReactNode }) {
  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center justify-between border-b px-4 py-3"><h2 className="text-sm font-semibold">{title}</h2>{action}</div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>{columns.map((column) => <TableHead key={column}>{column.split("_").join(" ")}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{rows.map((row, index) => <TableRow key={String(row.id ?? index)}>{columns.map((column) => <TableCell key={column}>{format(row[column])}</TableCell>)}</TableRow>)}</TableBody>
        </Table>
      </div>
      {rows.length === 0 ? <EmptyState title={`No ${title.toLowerCase()}`} description="Payroll history will appear here as actions are recorded." /> : null}
    </Panel>
  );
}

function format(value: unknown) {
  if (typeof value === "number") return money(value);
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void }) {
  return <CheckboxField label={label} disabled={disabled} checked={checked} onChange={onChange} />;
}
