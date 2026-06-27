import { Landmark, PiggyBank, Plus, ReceiptText, ShieldCheck, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../hooks/useAuth";
import { ApiError, api } from "../../lib/api";
import type {
  EmployeeBankLoan,
  CustomDeductionTemplate,
  EmployeePayrollSummary,
  EmployeePaymentMethod,
  EmployeePensionProfile,
  PaymentInstitution,
  PensionScheme
} from "../../types/payroll";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { CheckboxField, SelectField as UiSelectField } from "../ui/page-shell";
import { Panel } from "../ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";

type PaymentForm = {
  payment_method_type: string;
  payment_institution_id: string;
  bank_account_name: string;
  bank_account_number: string;
  cash_collection_note: string;
  allocation_type: string;
  allocation_percentage: string;
  allocation_amount: string;
  is_primary: boolean;
};

type LoanForm = {
  payment_institution_id: string;
  loan_reference_number: string;
  loan_type: string;
  original_loan_amount: string;
  outstanding_balance: string;
  monthly_installment_amount: string;
  deduction_start_date: string;
  priority_number: string;
  employer_undertaking_required: boolean;
  notes: string;
};

type PensionForm = {
  pension_scheme_id: string;
  pension_member_id: string;
  registration_number: string;
  enrollment_status: string;
  employee_contribution_percent_override: string;
  employer_contribution_percent_override: string;
  employer_pays_employee_share: boolean;
  employee_extra_voluntary_contribution_amount: string;
  effective_date: string;
  exemption_reason: string;
  notes: string;
};

type CustomDeductionForm = {
  template_id: string;
  assigned_amount: string;
  assigned_percentage: string;
  total_amount: string;
  installment_count: string;
  installment_amount: string;
  effective_from: string;
  effective_to: string;
  reason: string;
  notes: string;
};

export function EmployeePayrollFoundationPanels({ employeeId, summary, onReload }: { employeeId: string; summary: EmployeePayrollSummary; onReload: () => Promise<void> }) {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const featureStatus = summary.payroll_feature_status ?? {};
  const paymentMethodsEnabled = featureStatus.payment_methods_enabled ?? true;
  const paymentInstitutionsEnabled = featureStatus.payment_institutions_enabled ?? true;
  const bankLoansEnabled = featureStatus.bank_loan_deductions_enabled ?? true;
  const pensionEnabled = featureStatus.pension_enabled ?? true;
  const customDeductionsEnabled = featureStatus.custom_deductions_enabled ?? true;
  const canManagePayment = paymentMethodsEnabled && (permissions.has("employees.payment_methods.manage") || permissions.has("payroll.payment_methods.manage"));
  const canVerifyPayment = permissions.has("employees.payment_methods.verify") || canManagePayment;
  const canManageLoans = bankLoansEnabled && (permissions.has("payroll.bank_loans.manage") || permissions.has("payroll.bank_loans.create") || permissions.has("payroll.bank_loans.update"));
  const canApproveLoans = bankLoansEnabled && (permissions.has("payroll.bank_loans.approve") || permissions.has("payroll.bank_loans.manage"));
  const canManagePension = pensionEnabled && (permissions.has("employees.pension_profiles.manage") || permissions.has("employees.pension_profiles.update"));
  const canManageCustomDeductions = customDeductionsEnabled && (permissions.has("employees.custom_deductions.manage") || permissions.has("payroll.employee_custom_deductions.manage") || permissions.has("payroll.employee_custom_deductions.create"));
  const canApproveCustomDeductions = customDeductionsEnabled && (permissions.has("payroll.employee_custom_deductions.approve") || permissions.has("payroll.employee_custom_deductions.manage"));
  const [institutions, setInstitutions] = useState<PaymentInstitution[]>([]);
  const [schemes, setSchemes] = useState<PensionScheme[]>([]);
  const [customTemplates, setCustomTemplates] = useState<CustomDeductionTemplate[]>([]);
  const [paymentForm, setPaymentForm] = useState<PaymentForm | null>(null);
  const [loanForm, setLoanForm] = useState<LoanForm | null>(null);
  const [pensionForm, setPensionForm] = useState<PensionForm | null>(null);
  const [customDeductionForm, setCustomDeductionForm] = useState<CustomDeductionForm | null>(null);
  const [customAction, setCustomAction] = useState<{ id: string; action: "approve" | "pause" | "resume" | "cancel"; reason: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    void Promise.all([
      paymentInstitutionsEnabled ? api.listPaymentInstitutions(token).then((res) => setInstitutions(res.institutions)).catch(() => setInstitutions([])) : Promise.resolve(setInstitutions([])),
      pensionEnabled ? api.listPensionSchemes(token).then((res) => setSchemes(res.schemes)).catch(() => setSchemes([])) : Promise.resolve(setSchemes([])),
      customDeductionsEnabled ? api.listCustomDeductionTemplates(token).then((res) => setCustomTemplates(res.templates)).catch(() => setCustomTemplates([])) : Promise.resolve(setCustomTemplates([]))
    ]);
  }, [token, paymentInstitutionsEnabled, pensionEnabled, customDeductionsEnabled]);

  const activeInstitutions = useMemo(() => institutions.filter((institution) => institution.status !== "ARCHIVED"), [institutions]);
  const paymentMethods = summary.payment_methods ?? [];
  const bankLoans = summary.bank_loans ?? [];
  const bankLoanPayments = summary.bank_loan_payments ?? [];
  const pensionProfile = summary.pension_profile ?? null;
  const pensionContributions = summary.pension_contributions ?? [];
  const customDeductions = summary.custom_deductions ?? [];
  const customDeductionApplications = summary.custom_deduction_applications ?? [];

  async function run(action: () => Promise<void>, success: string) {
    if (!token) return;
    setError(null);
    try {
      await action();
      setMessage(success);
      await onReload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to complete payroll foundation action.");
    }
  }

  async function savePayment() {
    if (!token || !paymentForm) return;
    await run(async () => {
      await api.createEmployeePaymentMethod(token, employeeId, {
        ...paymentForm,
        allocation_percentage: paymentForm.allocation_percentage ? Number(paymentForm.allocation_percentage) : null,
        allocation_amount: paymentForm.allocation_amount ? Number(paymentForm.allocation_amount) : null
      });
      setPaymentForm(null);
    }, "Payment method saved.");
  }

  async function saveLoan() {
    if (!token || !loanForm) return;
    await run(async () => {
      await api.createEmployeeBankLoan(token, employeeId, {
        ...loanForm,
        original_loan_amount: loanForm.original_loan_amount ? Number(loanForm.original_loan_amount) : null,
        outstanding_balance: loanForm.outstanding_balance ? Number(loanForm.outstanding_balance) : null,
        monthly_installment_amount: Number(loanForm.monthly_installment_amount),
        priority_number: loanForm.priority_number ? Number(loanForm.priority_number) : null
      });
      setLoanForm(null);
    }, "Bank loan saved as pending approval.");
  }

  async function savePension() {
    if (!token || !pensionForm) return;
    await run(async () => {
      await api.updateEmployeePensionProfile(token, employeeId, {
        ...pensionForm,
        employee_contribution_percent_override: pensionForm.employee_contribution_percent_override ? Number(pensionForm.employee_contribution_percent_override) : null,
        employer_contribution_percent_override: pensionForm.employer_contribution_percent_override ? Number(pensionForm.employer_contribution_percent_override) : null,
        employee_extra_voluntary_contribution_amount: pensionForm.employee_extra_voluntary_contribution_amount ? Number(pensionForm.employee_extra_voluntary_contribution_amount) : 0
      });
      setPensionForm(null);
    }, "Pension profile saved.");
  }

  async function saveCustomDeduction() {
    if (!token || !customDeductionForm) return;
    await run(async () => {
      await api.createEmployeeCustomDeduction(token, employeeId, {
        template_id: customDeductionForm.template_id,
        assigned_amount: customDeductionForm.assigned_amount ? Number(customDeductionForm.assigned_amount) : null,
        assigned_percentage: customDeductionForm.assigned_percentage ? Number(customDeductionForm.assigned_percentage) : null,
        total_amount: customDeductionForm.total_amount ? Number(customDeductionForm.total_amount) : null,
        installment_count: customDeductionForm.installment_count ? Number(customDeductionForm.installment_count) : null,
        installment_amount: customDeductionForm.installment_amount ? Number(customDeductionForm.installment_amount) : null,
        effective_from: customDeductionForm.effective_from,
        effective_to: customDeductionForm.effective_to || null,
        reason: customDeductionForm.reason,
        notes: customDeductionForm.notes || null
      });
      setCustomDeductionForm(null);
    }, "Custom deduction assigned.");
  }

  async function runCustomAction() {
    if (!token || !customAction) return;
    await run(async () => {
      await api.customDeductionAction(token, customAction.id, customAction.action, customAction.reason || undefined);
      setCustomAction(null);
    }, "Custom deduction updated.");
  }

  return (
    <div className="space-y-4">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}
      {paymentMethodsEnabled ? <Panel className="overflow-hidden">
        <Header icon={<WalletCards className="h-4 w-4" />} title="Payment methods" action={canManagePayment ? <Button size="sm" onClick={() => setPaymentForm(defaultPaymentForm())}><Plus className="h-4 w-4" /> Add method</Button> : null} />
        <MiniTable
          rows={paymentMethods}
          columns={["payment_method_type", "payment_institution_name", "bank_account_number_masked", "allocation_type", "allocation_percentage", "allocation_amount", "status", "verification_status"]}
          actions={(row) => canManagePayment || canVerifyPayment ? (
            <div className="flex justify-end gap-2">
              {canVerifyPayment && row.verification_status !== "VERIFIED" ? <Button size="sm" variant="outline" onClick={() => token && run(async () => { await api.verifyEmployeePaymentMethod(token, employeeId, String(row.id)); }, "Payment method verified.")}>Verify</Button> : null}
              {canManagePayment ? <Button size="sm" variant="outline" onClick={() => token && run(async () => { await api.archiveEmployeePaymentMethod(token, employeeId, String(row.id)); }, "Payment method archived.")}>Archive</Button> : null}
            </div>
          ) : null}
          empty="No payment methods have been configured."
        />
      </Panel> : <DisabledPayrollPanel icon={<WalletCards className="h-4 w-4" />} title="Payment methods" />}

      {bankLoansEnabled ? <Panel className="overflow-hidden">
        <Header icon={<Landmark className="h-4 w-4" />} title="Bank loan salary deductions" action={canManageLoans ? <Button size="sm" onClick={() => setLoanForm(defaultLoanForm())}><Plus className="h-4 w-4" /> Add loan</Button> : null} />
        <MiniTable
          rows={bankLoans}
          columns={["payment_institution_name", "loan_reference_number", "monthly_installment_amount", "outstanding_balance", "eligibility_status", "status", "approval_status"]}
          actions={(row) => canApproveLoans || canManageLoans ? (
            <div className="flex justify-end gap-2">
              {canApproveLoans && row.approval_status !== "APPROVED" ? <Button size="sm" variant="outline" onClick={() => token && run(async () => { await api.payrollBankLoanAction(token, String(row.id), "approve"); }, "Bank loan approved.")}>Approve</Button> : null}
              {canManageLoans && row.status === "ACTIVE" ? <Button size="sm" variant="outline" onClick={() => token && run(async () => { await api.payrollBankLoanAction(token, String(row.id), "pause"); }, "Bank loan paused.")}>Pause</Button> : null}
              {canManageLoans && row.status !== "CANCELLED" ? <Button size="sm" variant="outline" onClick={() => token && run(async () => { await api.payrollBankLoanAction(token, String(row.id), "cancel"); }, "Bank loan cancelled.")}>Cancel</Button> : null}
            </div>
          ) : null}
          empty="No bank loan deduction records exist for this employee."
        />
        <div className="border-t">
          <MiniTable rows={bankLoanPayments} columns={["bank_name_snapshot", "loan_reference_number_snapshot", "deducted_amount", "shortfall_amount", "payment_status", "remittance_reference"]} empty="No bank loan payment history yet." />
        </div>
      </Panel> : <DisabledPayrollPanel icon={<Landmark className="h-4 w-4" />} title="Bank loan salary deductions" />}

      {pensionEnabled ? <Panel className="overflow-hidden">
        <Header icon={<PiggyBank className="h-4 w-4" />} title="Pension profile" action={canManagePension ? <Button size="sm" onClick={() => setPensionForm(defaultPensionForm(pensionProfile))}><ShieldCheck className="h-4 w-4" /> Edit pension</Button> : null} />
        <div className="grid gap-3 border-b p-4 md:grid-cols-4">
          <Summary label="Scheme" value={pensionProfile?.scheme_name ?? "-"} />
          <Summary label="Enrollment" value={pensionProfile?.enrollment_status ?? "NOT_ENROLLED"} />
          <Summary label="Member ID" value={pensionProfile?.pension_member_id ?? "-"} />
          <Summary label="Effective" value={pensionProfile?.effective_date ?? "-"} />
        </div>
        <MiniTable rows={pensionContributions} columns={["scheme_name", "pensionable_wage", "employee_contribution_amount", "employer_contribution_amount", "total_contribution_amount", "contribution_status"]} empty="No pension contribution history yet." />
      </Panel> : <DisabledPayrollPanel icon={<PiggyBank className="h-4 w-4" />} title="Pension profile" />}

      {customDeductionsEnabled ? <Panel className="overflow-hidden">
        <Header icon={<ReceiptText className="h-4 w-4" />} title="Custom deductions" action={canManageCustomDeductions ? <Button size="sm" onClick={() => setCustomDeductionForm(defaultCustomDeductionForm(customTemplates))}><Plus className="h-4 w-4" /> Add deduction</Button> : null} />
        <MiniTable
          rows={customDeductions}
          columns={["template_name_snapshot", "category_snapshot", "assigned_amount", "total_amount", "remaining_balance", "approval_status", "status"]}
          actions={(row) => canManageCustomDeductions || canApproveCustomDeductions ? (
            <div className="flex justify-end gap-2">
              {canApproveCustomDeductions && row.approval_status !== "APPROVED" ? <Button size="sm" variant="outline" onClick={() => setCustomAction({ id: String(row.id), action: "approve", reason: "" })}>Approve</Button> : null}
              {canManageCustomDeductions && row.status === "ACTIVE" ? <Button size="sm" variant="outline" onClick={() => setCustomAction({ id: String(row.id), action: "pause", reason: "" })}>Pause</Button> : null}
              {canManageCustomDeductions && row.status === "PAUSED" ? <Button size="sm" variant="outline" onClick={() => setCustomAction({ id: String(row.id), action: "resume", reason: "" })}>Resume</Button> : null}
              {canManageCustomDeductions && !["CANCELLED", "COMPLETED", "ARCHIVED"].includes(String(row.status)) ? <Button size="sm" variant="outline" onClick={() => setCustomAction({ id: String(row.id), action: "cancel", reason: "" })}>Cancel</Button> : null}
            </div>
          ) : null}
          empty="No custom deductions are assigned to this employee."
        />
        <div className="border-t">
          <MiniTable rows={customDeductionApplications} columns={["template_name_snapshot", "scheduled_amount", "deducted_amount", "shortfall_amount", "remaining_balance_after", "application_status", "created_at"]} empty="No custom deduction payroll applications yet." />
        </div>
      </Panel> : <DisabledPayrollPanel icon={<ReceiptText className="h-4 w-4" />} title="Custom deductions" />}

      {paymentForm ? <PaymentMethodModal form={paymentForm} institutions={activeInstitutions} onChange={setPaymentForm} onClose={() => setPaymentForm(null)} onConfirm={() => void savePayment()} /> : null}
      {loanForm ? <LoanModal form={loanForm} institutions={activeInstitutions.filter((institution) => institution.type === "BANK")} onChange={setLoanForm} onClose={() => setLoanForm(null)} onConfirm={() => void saveLoan()} /> : null}
      {pensionForm ? <PensionModal form={pensionForm} schemes={schemes} onChange={setPensionForm} onClose={() => setPensionForm(null)} onConfirm={() => void savePension()} /> : null}
      {customDeductionForm ? <CustomDeductionModal form={customDeductionForm} templates={customTemplates} onChange={setCustomDeductionForm} onClose={() => setCustomDeductionForm(null)} onConfirm={() => void saveCustomDeduction()} /> : null}
      {customAction ? <Modal title={`${customAction.action} custom deduction`} onClose={() => setCustomAction(null)} onConfirm={() => void runCustomAction()} disabled={customAction.action === "cancel" && !customAction.reason.trim()}>
        <Field label={customAction.action === "cancel" ? "Reason required" : "Reason"}><Input value={customAction.reason} onChange={(event) => setCustomAction({ ...customAction, reason: event.target.value })} /></Field>
      </Modal> : null}
    </div>
  );
}

function Header({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) {
  return <div className="flex items-center justify-between border-b px-4 py-3"><div className="flex items-center gap-2 text-sm font-semibold">{icon}{title}</div>{action}</div>;
}

function DisabledPayrollPanel({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <Panel className="overflow-hidden bg-slate-50/75">
      <Header icon={icon} title={title} />
      <div className="px-4 py-5 text-sm text-muted-foreground">
        This payroll submodule is disabled in Payroll Settings. Existing historical payroll records remain protected, but active controls are hidden until the submodule is enabled.
      </div>
    </Panel>
  );
}

function Summary({ label, value }: { label: string; value: unknown }) {
  return <div><div className="text-xs text-muted-foreground">{label}</div><div className="text-sm font-medium">{format(value)}</div></div>;
}

function MiniTable({ rows, columns, actions, empty }: { rows: unknown[]; columns: string[]; actions?: (row: Record<string, unknown>) => React.ReactNode; empty: string }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader><TableRow>{columns.map((column) => <TableHead key={column}>{column.split("_").join(" ")}</TableHead>)}{actions ? <TableHead className="text-right">Actions</TableHead> : null}</TableRow></TableHeader>
        <TableBody>{rows.map((item, index) => {
          const row = item as Record<string, unknown>;
          return <TableRow key={String(row.id ?? index)}>{columns.map((column) => <TableCell key={column}>{badgeOrText(column, row[column])}</TableCell>)}{actions ? <TableCell className="text-right">{actions(row)}</TableCell> : null}</TableRow>;
        })}</TableBody>
      </Table>
      {rows.length === 0 ? <EmptyState title="No records" description={empty} /> : null}
    </div>
  );
}

function badgeOrText(column: string, value: unknown) {
  if (column.includes("status") && value) return <Badge tone="neutral">{String(value)}</Badge>;
  return format(value);
}

function format(value: unknown) {
  if (typeof value === "number") return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function defaultPaymentForm(): PaymentForm {
  return { payment_method_type: "BANK_TRANSFER", payment_institution_id: "", bank_account_name: "", bank_account_number: "", cash_collection_note: "", allocation_type: "FULL", allocation_percentage: "", allocation_amount: "", is_primary: true };
}

function defaultLoanForm(): LoanForm {
  return { payment_institution_id: "", loan_reference_number: "", loan_type: "SALARY_DEDUCTION", original_loan_amount: "", outstanding_balance: "", monthly_installment_amount: "", deduction_start_date: new Date().toISOString().slice(0, 10), priority_number: "", employer_undertaking_required: false, notes: "" };
}

function defaultPensionForm(profile: EmployeePensionProfile | null): PensionForm {
  return {
    pension_scheme_id: profile?.pension_scheme_id ?? "",
    pension_member_id: profile?.pension_member_id === "Restricted" ? "" : profile?.pension_member_id ?? "",
    registration_number: profile?.registration_number === "Restricted" ? "" : profile?.registration_number ?? "",
    enrollment_status: profile?.enrollment_status ?? "ENROLLED",
    employee_contribution_percent_override: profile?.employee_contribution_percent_override == null ? "" : String(profile.employee_contribution_percent_override),
    employer_contribution_percent_override: profile?.employer_contribution_percent_override == null ? "" : String(profile.employer_contribution_percent_override),
    employer_pays_employee_share: Boolean(profile?.employer_pays_employee_share),
    employee_extra_voluntary_contribution_amount: profile?.employee_extra_voluntary_contribution_amount ? String(profile.employee_extra_voluntary_contribution_amount) : "",
    effective_date: profile?.effective_date ?? new Date().toISOString().slice(0, 10),
    exemption_reason: profile?.exemption_reason ?? "",
    notes: profile?.notes ?? ""
  };
}

function defaultCustomDeductionForm(templates: CustomDeductionTemplate[]): CustomDeductionForm {
  const template = templates.find((item) => item.status === "ACTIVE");
  return {
    template_id: template?.id ?? "",
    assigned_amount: template?.default_amount == null ? "" : String(template.default_amount),
    assigned_percentage: template?.default_percentage == null ? "" : String(template.default_percentage),
    total_amount: template?.default_amount == null ? "" : String(template.default_amount),
    installment_count: template?.default_installment_count == null ? "" : String(template.default_installment_count),
    installment_amount: template?.default_amount == null ? "" : String(template.default_amount),
    effective_from: new Date().toISOString().slice(0, 10),
    effective_to: "",
    reason: "",
    notes: ""
  };
}

function PaymentMethodModal({ form, institutions, onChange, onClose, onConfirm }: { form: PaymentForm; institutions: PaymentInstitution[]; onChange: (form: PaymentForm) => void; onClose: () => void; onConfirm: () => void }) {
  const isBank = form.payment_method_type === "BANK_TRANSFER";
  return <Modal title="Payment method" onClose={onClose} onConfirm={onConfirm} disabled={isBank && (!form.payment_institution_id || !form.bank_account_name || !form.bank_account_number)}>
    <Select label="Type" value={form.payment_method_type} onChange={(value) => onChange({ ...form, payment_method_type: value })} options={[["BANK_TRANSFER", "Bank transfer"], ["CASH", "Cash"], ["CHEQUE_PLACEHOLDER", "Cheque placeholder"], ["MOBILE_WALLET_PLACEHOLDER", "Mobile wallet placeholder"], ["OTHER", "Other"]]} />
    {isBank ? <Select label="Bank/payment institution" value={form.payment_institution_id} onChange={(value) => onChange({ ...form, payment_institution_id: value })} options={[["", "Select institution"], ...institutions.map((institution) => [institution.id, institution.name] as [string, string])]} /> : null}
    {isBank ? <Field label="Account name"><Input value={form.bank_account_name} onChange={(event) => onChange({ ...form, bank_account_name: event.target.value })} /></Field> : null}
    {isBank ? <Field label="Account number"><Input value={form.bank_account_number} onChange={(event) => onChange({ ...form, bank_account_number: event.target.value })} /></Field> : null}
    {form.payment_method_type === "CASH" ? <Field label="Cash note"><Input value={form.cash_collection_note} onChange={(event) => onChange({ ...form, cash_collection_note: event.target.value })} /></Field> : null}
    <Select label="Allocation" value={form.allocation_type} onChange={(value) => onChange({ ...form, allocation_type: value })} options={[["FULL", "Full"], ["PERCENTAGE", "Percentage"], ["FIXED_AMOUNT", "Fixed amount"]]} />
    {form.allocation_type === "PERCENTAGE" ? <Field label="Allocation %"><Input type="number" value={form.allocation_percentage} onChange={(event) => onChange({ ...form, allocation_percentage: event.target.value })} /></Field> : null}
    {form.allocation_type === "FIXED_AMOUNT" ? <Field label="Allocation amount"><Input type="number" value={form.allocation_amount} onChange={(event) => onChange({ ...form, allocation_amount: event.target.value })} /></Field> : null}
    <Toggle label="Primary method" checked={form.is_primary} onChange={(checked) => onChange({ ...form, is_primary: checked })} />
  </Modal>;
}

function CustomDeductionModal({ form, templates, onChange, onClose, onConfirm }: { form: CustomDeductionForm; templates: CustomDeductionTemplate[]; onChange: (form: CustomDeductionForm) => void; onClose: () => void; onConfirm: () => void }) {
  function chooseTemplate(templateId: string) {
    const template = templates.find((item) => item.id === templateId);
    onChange({
      ...form,
      template_id: templateId,
      assigned_amount: template?.default_amount == null ? "" : String(template.default_amount),
      assigned_percentage: template?.default_percentage == null ? "" : String(template.default_percentage),
      total_amount: template?.default_amount == null ? form.total_amount : String(template.default_amount),
      installment_count: template?.default_installment_count == null ? "" : String(template.default_installment_count),
      installment_amount: template?.default_amount == null ? form.installment_amount : String(template.default_amount)
    });
  }

  return <Modal title="Employee custom deduction" onClose={onClose} onConfirm={onConfirm} disabled={!form.template_id || !form.effective_from || !form.reason.trim()}>
    <Select label="Template" value={form.template_id} onChange={chooseTemplate} options={templates.filter((template) => template.status === "ACTIVE").map((template) => [template.id, `${template.code} - ${template.name}`] as [string, string])} />
    <Field label="Assigned amount"><Input type="number" min={0} step="0.01" value={form.assigned_amount} onChange={(event) => onChange({ ...form, assigned_amount: event.target.value })} /></Field>
    <Field label="Assigned percentage"><Input type="number" min={0} max={100} step="0.01" value={form.assigned_percentage} onChange={(event) => onChange({ ...form, assigned_percentage: event.target.value })} /></Field>
    <Field label="Total amount"><Input type="number" min={0} step="0.01" value={form.total_amount} onChange={(event) => onChange({ ...form, total_amount: event.target.value })} /></Field>
    <Field label="Installments"><Input type="number" min={1} value={form.installment_count} onChange={(event) => onChange({ ...form, installment_count: event.target.value })} /></Field>
    <Field label="Installment amount"><Input type="number" min={0} step="0.01" value={form.installment_amount} onChange={(event) => onChange({ ...form, installment_amount: event.target.value })} /></Field>
    <Field label="Effective from"><Input type="date" value={form.effective_from} onChange={(event) => onChange({ ...form, effective_from: event.target.value })} /></Field>
    <Field label="Effective to"><Input type="date" value={form.effective_to} onChange={(event) => onChange({ ...form, effective_to: event.target.value })} /></Field>
    <Field label="Reason"><Input value={form.reason} onChange={(event) => onChange({ ...form, reason: event.target.value })} /></Field>
    <Field label="Notes"><Input value={form.notes} onChange={(event) => onChange({ ...form, notes: event.target.value })} /></Field>
  </Modal>;
}

function LoanModal({ form, institutions, onChange, onClose, onConfirm }: { form: LoanForm; institutions: PaymentInstitution[]; onChange: (form: LoanForm) => void; onClose: () => void; onConfirm: () => void }) {
  return <Modal title="Bank loan deduction" onClose={onClose} onConfirm={onConfirm} disabled={!form.payment_institution_id || !form.loan_reference_number || !form.monthly_installment_amount}>
    <Select label="Bank" value={form.payment_institution_id} onChange={(value) => onChange({ ...form, payment_institution_id: value })} options={[["", "Select bank"], ...institutions.map((institution) => [institution.id, institution.name] as [string, string])]} />
    <Field label="Loan reference"><Input value={form.loan_reference_number} onChange={(event) => onChange({ ...form, loan_reference_number: event.target.value })} /></Field>
    <Field label="Monthly installment"><Input type="number" value={form.monthly_installment_amount} onChange={(event) => onChange({ ...form, monthly_installment_amount: event.target.value })} /></Field>
    <Field label="Original amount"><Input type="number" value={form.original_loan_amount} onChange={(event) => onChange({ ...form, original_loan_amount: event.target.value })} /></Field>
    <Field label="Outstanding balance"><Input type="number" value={form.outstanding_balance} onChange={(event) => onChange({ ...form, outstanding_balance: event.target.value })} /></Field>
    <Field label="Start date"><Input type="date" value={form.deduction_start_date} onChange={(event) => onChange({ ...form, deduction_start_date: event.target.value })} /></Field>
    <Field label="Priority"><Input type="number" value={form.priority_number} onChange={(event) => onChange({ ...form, priority_number: event.target.value })} /></Field>
    <Toggle label="Employer undertaking required" checked={form.employer_undertaking_required} onChange={(checked) => onChange({ ...form, employer_undertaking_required: checked })} />
    <Field label="Notes"><Input value={form.notes} onChange={(event) => onChange({ ...form, notes: event.target.value })} /></Field>
  </Modal>;
}

function PensionModal({ form, schemes, onChange, onClose, onConfirm }: { form: PensionForm; schemes: PensionScheme[]; onChange: (form: PensionForm) => void; onClose: () => void; onConfirm: () => void }) {
  return <Modal title="Pension profile" onClose={onClose} onConfirm={onConfirm} disabled={!form.enrollment_status || !form.effective_date}>
    <Select label="Scheme" value={form.pension_scheme_id} onChange={(value) => onChange({ ...form, pension_scheme_id: value })} options={[["", "No scheme"], ...schemes.map((scheme) => [scheme.id, scheme.scheme_name] as [string, string])]} />
    <Select label="Enrollment" value={form.enrollment_status} onChange={(value) => onChange({ ...form, enrollment_status: value })} options={[["NOT_ENROLLED", "Not enrolled"], ["ENROLLED", "Enrolled"], ["VOLUNTARY", "Voluntary"], ["EXEMPTED", "Exempted"], ["SUSPENDED", "Suspended"]]} />
    <Field label="Member ID"><Input value={form.pension_member_id} onChange={(event) => onChange({ ...form, pension_member_id: event.target.value })} /></Field>
    <Field label="Registration number"><Input value={form.registration_number} onChange={(event) => onChange({ ...form, registration_number: event.target.value })} /></Field>
    <Field label="Employee % override"><Input type="number" value={form.employee_contribution_percent_override} onChange={(event) => onChange({ ...form, employee_contribution_percent_override: event.target.value })} /></Field>
    <Field label="Employer % override"><Input type="number" value={form.employer_contribution_percent_override} onChange={(event) => onChange({ ...form, employer_contribution_percent_override: event.target.value })} /></Field>
    <Toggle label="Employer pays employee share" checked={form.employer_pays_employee_share} onChange={(checked) => onChange({ ...form, employer_pays_employee_share: checked })} />
    <Field label="Voluntary amount"><Input type="number" value={form.employee_extra_voluntary_contribution_amount} onChange={(event) => onChange({ ...form, employee_extra_voluntary_contribution_amount: event.target.value })} /></Field>
    <Field label="Effective date"><Input type="date" value={form.effective_date} onChange={(event) => onChange({ ...form, effective_date: event.target.value })} /></Field>
    <Field label="Notes"><Input value={form.notes} onChange={(event) => onChange({ ...form, notes: event.target.value })} /></Field>
  </Modal>;
}

function Modal({ title, children, disabled, onClose, onConfirm }: { title: string; children: React.ReactNode; disabled?: boolean; onClose: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4"><div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border bg-white p-4 shadow-xl"><h2 className="text-sm font-semibold">{title}</h2><div className="mt-3 grid gap-3 md:grid-cols-2">{children}</div><div className="mt-4 flex justify-end gap-2"><Button size="sm" variant="outline" onClick={onClose}>Cancel</Button><Button size="sm" disabled={disabled} onClick={onConfirm}>Save</Button></div></div></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (value: string) => void }) {
  return <UiSelectField label={label} value={value} onValueChange={onChange}>{options.map(([optionValue, optionLabel]) => <option key={optionValue || optionLabel} value={optionValue}>{optionLabel}</option>)}</UiSelectField>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <CheckboxField label={label} checked={checked} onChange={onChange} />;
}
