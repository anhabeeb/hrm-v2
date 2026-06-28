import { Archive, Check, Landmark, PiggyBank, Plus, RefreshCw, ReceiptText, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { EmployeeIdentityCell } from "../components/employee/EmployeeIdentityCell";
import { EmployeeCascadeSelect } from "../components/organization/EmployeeCascadeSelect";
import { PayrollNav } from "../components/payroll/PayrollNav";
import { Button } from "../components/ui/button";
import { ResponsiveTableWrapper } from "../components/ui/data-table-shell";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Panel } from "../components/ui/panel";
import { StatusBadge } from "../components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { AdminHelpLink } from "../features/admin-help/AdminHelpLink";
import { useAuth } from "../hooks/useAuth";
import { useOrganizationReferences } from "../hooks/useOrganizationReferences";
import { ApiError, api } from "../lib/api";
import type { Employee } from "../types/employees";
import type { BankLoanEligibilityRule, BankLoanRemittanceBatch, CustomDeductionTemplate, EmployeeBankLoan, EmployeeBankLoanPayment, EmployeeCustomDeduction, EmployeeCustomDeductionApplication, PaymentInstitution, PayrollPensionContribution, PensionRemittanceBatch, PensionScheme } from "../types/payroll";
import { CheckboxField, PageHeader, PageShell, SelectField } from "../components/ui/page-shell";

export function PayrollPaymentInstitutionsPage() {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("payroll.payment_institutions.view") || permissions.has("payroll.payment_institutions.manage") || permissions.has("payroll.view");
  const canManage = permissions.has("payroll.payment_institutions.manage") || permissions.has("payroll.payment_institutions.create") || permissions.has("payroll.payment_institutions.update");
  const [rows, setRows] = useState<PaymentInstitution[]>([]);
  const [form, setForm] = useState<{ code: string; name: string; type: "BANK" | "WALLET_PROVIDER" | "CASH_LOCATION" | "OTHER"; swift_code: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    if (!canView) {
      setRows([]);
      setError(null);
      return;
    }
    try {
      setRows((await api.listPaymentInstitutions(token, true)).institutions);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load payment institutions.");
    }
  }

  useEffect(() => { void load(); }, [token, canView]);

  async function save() {
    if (!token || !form) return;
    try {
      await api.createPaymentInstitution(token, form);
      setForm(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save payment institution.");
    }
  }

  return <PayrollPageShell title="Payment Institutions" description="Configurable banks, cash locations, wallet providers, and other payment institutions.">
    {error ? <ErrorText message={error} /> : null}
    {!canView ? <Panel className="p-4"><EmptyState title="No permission" description="You do not have permission to view payment institutions." /></Panel> : null}
    <Panel className="overflow-hidden">
      <Header icon={<WalletCards className="h-4 w-4" />} title="Banks and payment institutions" action={canManage ? <Button size="sm" onClick={() => setForm({ code: "", name: "", type: "BANK", swift_code: "" })}><Plus className="h-4 w-4" /> Add institution</Button> : null} />
      <DataTable rows={rows} columns={["code", "name", "type", "swift_code", "status", "display_order"]} actions={canManage ? (row) => row.status !== "ARCHIVED" ? <Button size="sm" variant="outline" onClick={() => token && api.archivePaymentInstitution(token, String(row.id)).then(load)}><Archive className="h-4 w-4" /> Archive</Button> : null : undefined} empty="No payment institutions configured." />
    </Panel>
    {form ? <Modal title="Add payment institution" onClose={() => setForm(null)} onConfirm={save} disabled={!form.code || !form.name}>
      <Field label="Code"><Input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value.toUpperCase() })} /></Field>
      <Field label="Name"><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
      <Select label="Type" value={form.type} onChange={(value) => setForm({ ...form, type: value as typeof form.type })} options={[["BANK", "Bank"], ["WALLET_PROVIDER", "Wallet provider"], ["CASH_LOCATION", "Cash location"], ["OTHER", "Other"]]} />
      <Field label="SWIFT/code note"><Input value={form.swift_code} onChange={(event) => setForm({ ...form, swift_code: event.target.value })} /></Field>
    </Modal> : null}
  </PayrollPageShell>;
}

export function PayrollBankLoansPage() {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canApprove = permissions.has("payroll.bank_loans.approve") || permissions.has("payroll.bank_loans.manage");
  const canConfirm = permissions.has("payroll.bank_loan_payments.confirm") || permissions.has("payroll.bank_loan_payments.manage");
  const [loans, setLoans] = useState<EmployeeBankLoan[]>([]);
  const [payments, setPayments] = useState<EmployeeBankLoanPayment[]>([]);
  const [rules, setRules] = useState<BankLoanEligibilityRule[]>([]);
  const [batches, setBatches] = useState<BankLoanRemittanceBatch[]>([]);
  const [reports, setReports] = useState<Record<string, unknown>[]>([]);
  const [notifyForm, setNotifyForm] = useState<{ payment: EmployeeBankLoanPayment; reference: string; note: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    try {
      const [loanRes, paymentRes, ruleRes, batchRes, reportRes] = await Promise.all([
        api.listPayrollBankLoans(token),
        api.listPayrollBankLoanPayments(token),
        api.listBankLoanEligibilityRules(token),
        api.listBankLoanRemittanceBatches(token),
        api.getBankLoanSummaryReport(token)
      ]);
      setLoans(loanRes.loans);
      setPayments(paymentRes.payments);
      setRules(ruleRes.rules);
      setBatches(batchRes.batches);
      setReports(reportRes.reports);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load bank loan data.");
    }
  }

  useEffect(() => { void load(); }, [token]);

  async function markBankNotified() {
    if (!token || !notifyForm) return;
    try {
      await api.markBankLoanPaymentBankNotified(token, notifyForm.payment.id, {
        bank_notification_reference: notifyForm.reference || null,
        bank_notification_note: notifyForm.note || null
      });
      setNotifyForm(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to mark bank as notified.");
    }
  }

  return <PayrollPageShell title="Bank Loans" description="External bank salary-deduction loans, eligibility, manual remittance, and shortfall review.">
    {error ? <ErrorText message={error} /> : null}
    <Panel className="overflow-hidden">
      <Header icon={<Landmark className="h-4 w-4" />} title="Loan records" action={<Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4" /> Refresh</Button>} />
      <DataTable rows={loans} columns={["employee_no", "employee_name", "payment_institution_name", "loan_reference_number", "monthly_installment_amount", "eligibility_status", "status", "approval_status"]} actions={canApprove ? (row) => row.approval_status !== "APPROVED" ? <Button size="sm" variant="outline" onClick={() => token && api.payrollBankLoanAction(token, String(row.id), "approve").then(load)}><Check className="h-4 w-4" /> Approve</Button> : null : undefined} empty="No bank loan deduction records yet." />
    </Panel>
    <Panel className="overflow-hidden"><Header icon={<Landmark className="h-4 w-4" />} title="Payments and remittance" /><DataTable rows={payments} columns={["employee_name", "bank_name_snapshot", "loan_reference_number_snapshot", "scheduled_installment_amount", "deducted_amount", "shortfall_amount", "skipped_due_to_minimum_net_salary", "payment_status", "bank_notification_status", "bank_notification_reference", "bank_notified_at"]} actions={canConfirm ? (row) => {
      const directCollection = Boolean(row.skipped_due_to_minimum_net_salary) || Boolean(row.bank_direct_collection_required);
      if (directCollection && row.bank_notification_status !== "BANK_NOTIFIED") return <Button size="sm" variant="outline" onClick={() => setNotifyForm({ payment: row as unknown as EmployeeBankLoanPayment, reference: "", note: "" })}>Mark bank notified</Button>;
      if (!directCollection && row.payment_status !== "MANUALLY_CONFIRMED_PAID_TO_BANK") return <Button size="sm" variant="outline" onClick={() => token && api.confirmBankLoanPaidToBank(token, String(row.id), { remittance_reference: "MANUAL", notes: "Manual confirmation from Payroll Bank Loans page" }).then(load)}>Confirm</Button>;
      return null;
    } : undefined} empty="No bank loan payment history yet." /></Panel>
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel className="overflow-hidden"><Header icon={<Landmark className="h-4 w-4" />} title="Eligibility rules" /><DataTable rows={rules} columns={["payment_institution_name", "loan_product_name", "cash_salary_eligibility_rule", "required_statement_months", "required_salary_slip_months", "status"]} empty="No eligibility rules configured." /></Panel>
      <Panel className="overflow-hidden"><Header icon={<Landmark className="h-4 w-4" />} title="Remittance batches" /><DataTable rows={batches} columns={["payment_institution_name", "period_label", "employee_count", "total_deducted_amount", "status", "remittance_reference"]} empty="No bank loan remittance batches prepared." /></Panel>
    </div>
    <Panel className="overflow-hidden"><Header icon={<Landmark className="h-4 w-4" />} title="Bank loan summary by bank" /><DataTable rows={reports} columns={["bank_name_snapshot", "employee_count", "total_deduction_amount", "total_shortfall_amount", "total_direct_collection_amount", "payment_status", "bank_notification_status"]} empty="No bank loan summary rows yet." /></Panel>
    {notifyForm ? <Modal title="Mark bank notified" onClose={() => setNotifyForm(null)} onConfirm={() => void markBankNotified()} disabled={!notifyForm.reference.trim() && !notifyForm.note.trim()}>
      <Field label="Reference"><Input value={notifyForm.reference} onChange={(event) => setNotifyForm({ ...notifyForm, reference: event.target.value })} /></Field>
      <Field label="Note"><Input value={notifyForm.note} onChange={(event) => setNotifyForm({ ...notifyForm, note: event.target.value })} /></Field>
    </Modal> : null}
  </PayrollPageShell>;
}

type TemplateForm = {
  id?: string;
  code: string;
  name: string;
  description: string;
  category: string;
  deduction_type: string;
  amount_type: string;
  default_amount: string;
  default_percentage: string;
  default_installment_count: string;
  default_recurrence_interval: string;
  default_priority_number: string;
  show_on_payslip: boolean;
  show_in_self_service: boolean;
  require_approval: boolean;
  require_document: boolean;
  include_in_final_settlement: boolean;
  status: string;
};

type AssignmentForm = {
  employee_id: string;
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

export function PayrollCustomDeductionsPage() {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canManageTemplates = permissions.has("payroll.custom_deduction_templates.manage") || permissions.has("payroll.custom_deduction_templates.create") || permissions.has("payroll.custom_deduction_templates.update");
  const canManageAssignments = permissions.has("payroll.employee_custom_deductions.manage") || permissions.has("payroll.employee_custom_deductions.create") || permissions.has("employees.custom_deductions.manage");
  const canApproveAssignments = permissions.has("payroll.employee_custom_deductions.approve") || permissions.has("payroll.employee_custom_deductions.manage");
  const [templates, setTemplates] = useState<CustomDeductionTemplate[]>([]);
  const [deductions, setDeductions] = useState<EmployeeCustomDeduction[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [summary, setSummary] = useState<Record<string, unknown>[]>([]);
  const [byTemplate, setByTemplate] = useState<Record<string, unknown>[]>([]);
  const [byCategory, setByCategory] = useState<Record<string, unknown>[]>([]);
  const [shortfalls, setShortfalls] = useState<Record<string, unknown>[]>([]);
  const [applications, setApplications] = useState<EmployeeCustomDeductionApplication[]>([]);
  const [templateForm, setTemplateForm] = useState<TemplateForm | null>(null);
  const [assignmentForm, setAssignmentForm] = useState<AssignmentForm | null>(null);
  const [actionForm, setActionForm] = useState<{ id: string; action: "approve" | "reject" | "pause" | "resume" | "cancel"; reason: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const organizationRefs = useOrganizationReferences(token);

  async function load() {
    if (!token) return;
    try {
      const [templateRes, deductionRes, employeeRes, summaryRes, templateReport, categoryReport, shortfallReport, appReport] = await Promise.all([
        api.listCustomDeductionTemplates(token, true),
        api.listPayrollCustomDeductions(token),
        api.listEmployees(token),
        api.getCustomDeductionSummaryReport(token),
        api.getCustomDeductionsByTemplateReport(token),
        api.getCustomDeductionsByCategoryReport(token),
        api.getCustomDeductionShortfallsReport(token),
        api.getCustomDeductionApplicationsReport(token)
      ]);
      setTemplates(templateRes.templates);
      setDeductions(deductionRes.deductions);
      setEmployees(employeeRes.employees);
      setSummary(summaryRes.reports);
      setByTemplate(templateReport.reports);
      setByCategory(categoryReport.reports);
      setShortfalls(shortfallReport.reports);
      setApplications(appReport.reports);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load custom deductions.");
    }
  }

  useEffect(() => { void load(); }, [token]);

  async function saveTemplate() {
    if (!token || !templateForm) return;
    const input = {
      code: templateForm.code.toUpperCase(),
      name: templateForm.name,
      description: templateForm.description || null,
      category: templateForm.category.toUpperCase(),
      deduction_type: templateForm.deduction_type,
      amount_type: templateForm.amount_type,
      default_amount: templateForm.default_amount ? Number(templateForm.default_amount) : null,
      default_percentage: templateForm.default_percentage ? Number(templateForm.default_percentage) : null,
      default_installment_count: templateForm.default_installment_count ? Number(templateForm.default_installment_count) : null,
      default_recurrence_interval: templateForm.default_recurrence_interval || null,
      default_priority_number: templateForm.default_priority_number ? Number(templateForm.default_priority_number) : null,
      show_on_payslip: templateForm.show_on_payslip,
      show_in_self_service: templateForm.show_in_self_service,
      require_approval: templateForm.require_approval,
      require_document: templateForm.require_document,
      include_in_final_settlement: templateForm.include_in_final_settlement,
      status: templateForm.status
    };
    try {
      if (templateForm.id) await api.updateCustomDeductionTemplate(token, templateForm.id, input);
      else await api.createCustomDeductionTemplate(token, input);
      setTemplateForm(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save custom deduction template.");
    }
  }

  async function saveAssignment() {
    if (!token || !assignmentForm) return;
    try {
      await api.createEmployeeCustomDeduction(token, assignmentForm.employee_id, {
        template_id: assignmentForm.template_id,
        assigned_amount: assignmentForm.assigned_amount ? Number(assignmentForm.assigned_amount) : null,
        assigned_percentage: assignmentForm.assigned_percentage ? Number(assignmentForm.assigned_percentage) : null,
        total_amount: assignmentForm.total_amount ? Number(assignmentForm.total_amount) : null,
        installment_count: assignmentForm.installment_count ? Number(assignmentForm.installment_count) : null,
        installment_amount: assignmentForm.installment_amount ? Number(assignmentForm.installment_amount) : null,
        effective_from: assignmentForm.effective_from,
        effective_to: assignmentForm.effective_to || null,
        reason: assignmentForm.reason,
        notes: assignmentForm.notes || null
      });
      setAssignmentForm(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to assign custom deduction.");
    }
  }

  async function runAction() {
    if (!token || !actionForm) return;
    try {
      await api.customDeductionAction(token, actionForm.id, actionForm.action, actionForm.reason || undefined);
      setActionForm(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update custom deduction.");
    }
  }

  return <PayrollPageShell title="Custom Deductions" description="Configurable payroll deduction templates, employee assignments, payroll applications, shortfalls, and employee self-service visibility.">
    {error ? <ErrorText message={error} /> : null}
    <Panel className="overflow-hidden">
      <Header icon={<ReceiptText className="h-4 w-4" />} title="Custom deduction templates" action={canManageTemplates ? <Button size="sm" onClick={() => setTemplateForm(defaultTemplateForm())}><Plus className="h-4 w-4" /> Add template</Button> : null} />
      <DataTable rows={templates} columns={["code", "name", "category", "deduction_type", "amount_type", "default_amount", "default_percentage", "require_approval", "status"]} actions={canManageTemplates ? (row) => (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => setTemplateForm(templateToForm(row as unknown as CustomDeductionTemplate))}>Edit</Button>
          {row.status !== "ARCHIVED" ? <Button size="sm" variant="outline" onClick={() => token && api.archiveCustomDeductionTemplate(token, String(row.id)).then(load)}>Archive</Button> : null}
        </div>
      ) : undefined} empty="No custom deduction templates configured." />
    </Panel>

    <Panel className="overflow-hidden">
      <Header icon={<ReceiptText className="h-4 w-4" />} title="Employee custom deduction assignments" action={canManageAssignments ? <Button size="sm" onClick={() => setAssignmentForm(defaultAssignmentForm(templates))}><Plus className="h-4 w-4" /> Assign deduction</Button> : null} />
      <DataTable rows={deductions} columns={["employee_no", "employee_name", "template_name_snapshot", "category_snapshot", "assigned_amount", "total_amount", "remaining_balance", "approval_status", "status"]} actions={(row) => (
        <div className="flex justify-end gap-2">
          {canApproveAssignments && row.approval_status !== "APPROVED" ? <Button size="sm" variant="outline" onClick={() => setActionForm({ id: String(row.id), action: "approve", reason: "" })}>Approve</Button> : null}
          {canApproveAssignments && row.approval_status === "PENDING_APPROVAL" ? <Button size="sm" variant="outline" onClick={() => setActionForm({ id: String(row.id), action: "reject", reason: "" })}>Reject</Button> : null}
          {canManageAssignments && row.status === "ACTIVE" ? <Button size="sm" variant="outline" onClick={() => setActionForm({ id: String(row.id), action: "pause", reason: "" })}>Pause</Button> : null}
          {canManageAssignments && row.status === "PAUSED" ? <Button size="sm" variant="outline" onClick={() => setActionForm({ id: String(row.id), action: "resume", reason: "" })}>Resume</Button> : null}
          {canManageAssignments && !["CANCELLED", "COMPLETED", "ARCHIVED"].includes(String(row.status)) ? <Button size="sm" variant="outline" onClick={() => setActionForm({ id: String(row.id), action: "cancel", reason: "" })}>Cancel</Button> : null}
        </div>
      )} empty="No employee custom deduction assignments yet." />
    </Panel>

    <div className="grid gap-4 xl:grid-cols-2">
      <Panel className="overflow-hidden"><Header icon={<ReceiptText className="h-4 w-4" />} title="Application summary" /><DataTable rows={summary} columns={["application_status", "application_count", "scheduled_amount", "deducted_amount", "shortfall_amount"]} empty="No custom deduction applications calculated yet." /></Panel>
      <Panel className="overflow-hidden"><Header icon={<ReceiptText className="h-4 w-4" />} title="Shortfalls and warnings" /><DataTable rows={shortfalls} columns={["employee_no", "employee_name", "template_name_snapshot", "scheduled_amount", "deducted_amount", "shortfall_amount", "application_status", "reason"]} empty="No custom deduction shortfalls recorded." /></Panel>
      <Panel className="overflow-hidden"><Header icon={<ReceiptText className="h-4 w-4" />} title="By template" /><DataTable rows={byTemplate} columns={["template_code_snapshot", "template_name_snapshot", "assignment_count", "deducted_amount", "remaining_balance"]} empty="No template report rows yet." /></Panel>
      <Panel className="overflow-hidden"><Header icon={<ReceiptText className="h-4 w-4" />} title="By category" /><DataTable rows={byCategory} columns={["category_snapshot", "assignment_count", "deducted_amount", "remaining_balance"]} empty="No category report rows yet." /></Panel>
    </div>
    <Panel className="overflow-hidden"><Header icon={<ReceiptText className="h-4 w-4" />} title="Payroll application history" /><DataTable rows={applications} columns={["employee_no", "employee_name", "template_name_snapshot", "scheduled_amount", "deducted_amount", "shortfall_amount", "remaining_balance_after", "application_status", "created_at"]} empty="No payroll application history yet." /></Panel>

    {templateForm ? <TemplateModal form={templateForm} onChange={setTemplateForm} onClose={() => setTemplateForm(null)} onConfirm={() => void saveTemplate()} /> : null}
    {assignmentForm ? <AssignmentModal form={assignmentForm} templates={templates.filter((template) => template.status === "ACTIVE")} employees={employees} organizationRefs={organizationRefs} onChange={setAssignmentForm} onClose={() => setAssignmentForm(null)} onConfirm={() => void saveAssignment()} /> : null}
    {actionForm ? <Modal title={`${actionForm.action} custom deduction`} onClose={() => setActionForm(null)} onConfirm={() => void runAction()} disabled={(actionForm.action === "reject" || actionForm.action === "cancel") && !actionForm.reason.trim()}>
      <div className="md:col-span-2"><Field label={actionForm.action === "reject" || actionForm.action === "cancel" ? "Reason required" : "Reason"}><Input value={actionForm.reason} onChange={(event) => setActionForm({ ...actionForm, reason: event.target.value })} /></Field></div>
    </Modal> : null}
  </PayrollPageShell>;
}

export function PayrollPensionPage() {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("payroll.pension_schemes.view") || permissions.has("payroll.pension_schemes.manage") || permissions.has("payroll.pension_contributions.view") || permissions.has("payroll.pension_remittance.view") || permissions.has("payroll.view");
  const canManage = permissions.has("payroll.pension_schemes.manage") || permissions.has("payroll.pension_schemes.create");
  const [schemes, setSchemes] = useState<PensionScheme[]>([]);
  const [contributions, setContributions] = useState<PayrollPensionContribution[]>([]);
  const [batches, setBatches] = useState<PensionRemittanceBatch[]>([]);
  const [reports, setReports] = useState<Record<string, unknown>[]>([]);
  const [form, setForm] = useState<{ scheme_code: string; scheme_name: string; employee_contribution_percent: string; employer_contribution_percent: string; effective_from: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    if (!canView) {
      setSchemes([]);
      setContributions([]);
      setBatches([]);
      setReports([]);
      setError(null);
      return;
    }
    try {
      const [schemeRes, contributionRes, batchRes, reportRes] = await Promise.all([
        api.listPensionSchemes(token),
        api.listPensionContributions(token),
        api.listPensionRemittanceBatches(token),
        api.getPensionContributionsReport(token)
      ]);
      setSchemes(schemeRes.schemes);
      setContributions(contributionRes.contributions);
      setBatches(batchRes.batches);
      setReports(reportRes.reports);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load pension data.");
    }
  }

  useEffect(() => { void load(); }, [token, canView]);

  async function saveScheme() {
    if (!token || !form) return;
    try {
      await api.createPensionScheme(token, { ...form, employee_contribution_percent: Number(form.employee_contribution_percent), employer_contribution_percent: Number(form.employer_contribution_percent) });
      setForm(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save pension scheme.");
    }
  }

  return <PayrollPageShell title="Pension" description="Effective-dated pension schemes, employee/employer contributions, and manual remittance tracking.">
    {error ? <ErrorText message={error} /> : null}
    {!canView ? <Panel className="p-4"><EmptyState title="No permission" description="You do not have permission to view pension setup." /></Panel> : null}
    <Panel className="overflow-hidden"><Header icon={<PiggyBank className="h-4 w-4" />} title="Pension schemes" action={canManage ? <Button size="sm" onClick={() => setForm({ scheme_code: "", scheme_name: "", employee_contribution_percent: "7", employer_contribution_percent: "7", effective_from: new Date().toISOString().slice(0, 10) })}><Plus className="h-4 w-4" /> Add scheme</Button> : null} /><DataTable rows={schemes} columns={["scheme_code", "scheme_name", "employee_contribution_percent", "employer_contribution_percent", "contribution_basis", "foreign_employee_default_required", "status"]} empty="No pension schemes configured." /></Panel>
    <Panel className="overflow-hidden"><Header icon={<PiggyBank className="h-4 w-4" />} title="Contribution history" /><DataTable rows={contributions} columns={["employee_no", "employee_name", "scheme_name", "pensionable_wage", "employee_contribution_amount", "employer_contribution_amount", "total_contribution_amount", "contribution_status"]} empty="No pension contributions calculated yet." /></Panel>
    <div className="grid gap-4 xl:grid-cols-2">
      <Panel className="overflow-hidden"><Header icon={<PiggyBank className="h-4 w-4" />} title="Remittance batches" /><DataTable rows={batches} columns={["scheme_name", "period_label", "employee_contribution_total", "employer_contribution_total", "total_remittance_amount", "status"]} empty="No pension remittance batches prepared." /></Panel>
      <Panel className="overflow-hidden"><Header icon={<PiggyBank className="h-4 w-4" />} title="Pension report summary" /><DataTable rows={reports} columns={["scheme_name", "employee_count", "pensionable_wage", "employee_contribution_total", "employer_contribution_total", "total_contribution"]} empty="No pension report rows yet." /></Panel>
    </div>
    {form ? <Modal title="Add pension scheme" onClose={() => setForm(null)} onConfirm={saveScheme} disabled={!form.scheme_code || !form.scheme_name}>
      <Field label="Code"><Input value={form.scheme_code} onChange={(event) => setForm({ ...form, scheme_code: event.target.value.toUpperCase() })} /></Field>
      <Field label="Name"><Input value={form.scheme_name} onChange={(event) => setForm({ ...form, scheme_name: event.target.value })} /></Field>
      <Field label="Employee %"><Input type="number" value={form.employee_contribution_percent} onChange={(event) => setForm({ ...form, employee_contribution_percent: event.target.value })} /></Field>
      <Field label="Employer %"><Input type="number" value={form.employer_contribution_percent} onChange={(event) => setForm({ ...form, employer_contribution_percent: event.target.value })} /></Field>
      <Field label="Effective from"><Input type="date" value={form.effective_from} onChange={(event) => setForm({ ...form, effective_from: event.target.value })} /></Field>
    </Modal> : null}
  </PayrollPageShell>;
}

function PayrollPageShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  const helpTarget = title.includes("Bank") ? "bankLoans" : title.includes("Pension") ? "pension" : "payroll";
  return (
    <PageShell>
      <PageHeader title={title} description={description} actions={<AdminHelpLink target={helpTarget} label="View Payroll Guide" />} />
      <PayrollNav />
      {children}
    </PageShell>
  );
}

function Header({ icon, title, action }: { icon: React.ReactNode; title: string; action?: React.ReactNode }) {
  return <div className="flex items-center justify-between border-b px-4 py-3"><div className="flex items-center gap-2 text-sm font-semibold">{icon}{title}</div>{action}</div>;
}

function DataTable({ rows, columns, actions, empty }: { rows: unknown[]; columns: string[]; actions?: (row: Record<string, unknown>) => React.ReactNode; empty: string }) {
  const hasEmployeeIdentity = columns.includes("employee_name") || columns.includes("employee_name_snapshot");
  const visibleColumns = hasEmployeeIdentity ? ["__employee", ...columns.filter((column) => !["employee_no", "employee_name", "employee_name_snapshot", "employee_number_snapshot"].includes(column))] : columns;
  return <ResponsiveTableWrapper><Table><TableHeader><TableRow>{visibleColumns.map((column) => <TableHead key={column}>{column === "__employee" ? "Employee" : column.split("_").join(" ")}</TableHead>)}{actions ? <TableHead className="text-right">Actions</TableHead> : null}</TableRow></TableHeader><TableBody>{rows.map((item, index) => {
    const row = item as Record<string, unknown>;
    return <TableRow key={String(row.id ?? index)}>{visibleColumns.map((column) => <TableCell key={column}>{column === "__employee" ? <EmployeeIdentityCell employeeId={String(row.employee_id ?? "")} employeeName={String(row.employee_name ?? row.employee_name_snapshot ?? "-")} employeeNumber={String(row.employee_no ?? row.employee_number_snapshot ?? "")} departmentName={String(row.department_name ?? "")} locationName={String(row.location_name ?? "")} size="sm" /> : renderValue(column, row[column])}</TableCell>)}{actions ? <TableCell className="text-right">{actions(row)}</TableCell> : null}</TableRow>;
  })}</TableBody></Table>{rows.length === 0 ? <EmptyState title="No records" description={empty} /> : null}</ResponsiveTableWrapper>;
}

function renderValue(column: string, value: unknown) {
  if (column.includes("status") && value) return <StatusBadge value={value} />;
  if (typeof value === "number") return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function ErrorText({ message }: { message: string }) {
  return <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (value: string) => void }) {
  return <Field label={label}><SelectField className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</SelectField></Field>;
}

function Modal({ title, children, disabled, onClose, onConfirm }: { title: string; children: React.ReactNode; disabled?: boolean; onClose: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4"><div className="w-full max-w-lg rounded-lg border bg-white p-4 shadow-xl"><h2 className="text-sm font-semibold">{title}</h2><div className="mt-3 grid gap-3 md:grid-cols-2">{children}</div><div className="mt-4 flex justify-end gap-2"><Button size="sm" variant="outline" onClick={onClose}>Cancel</Button><Button size="sm" disabled={disabled} onClick={onConfirm}>Save</Button></div></div></div>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <CheckboxField label={label} checked={checked} onChange={onChange} />;
}

function defaultTemplateForm(): TemplateForm {
  return {
    code: "",
    name: "",
    description: "",
    category: "OTHER",
    deduction_type: "ONE_TIME",
    amount_type: "FIXED_AMOUNT",
    default_amount: "",
    default_percentage: "",
    default_installment_count: "",
    default_recurrence_interval: "MONTHLY",
    default_priority_number: "3",
    show_on_payslip: true,
    show_in_self_service: true,
    require_approval: true,
    require_document: false,
    include_in_final_settlement: true,
    status: "ACTIVE"
  };
}

function templateToForm(template: CustomDeductionTemplate): TemplateForm {
  return {
    id: template.id,
    code: template.code,
    name: template.name,
    description: template.description ?? "",
    category: template.category,
    deduction_type: template.deduction_type,
    amount_type: template.amount_type,
    default_amount: template.default_amount == null ? "" : String(template.default_amount),
    default_percentage: template.default_percentage == null ? "" : String(template.default_percentage),
    default_installment_count: template.default_installment_count == null ? "" : String(template.default_installment_count),
    default_recurrence_interval: template.default_recurrence_interval ?? "MONTHLY",
    default_priority_number: template.default_priority_number == null ? "" : String(template.default_priority_number),
    show_on_payslip: Boolean(template.show_on_payslip),
    show_in_self_service: Boolean(template.show_in_self_service),
    require_approval: Boolean(template.require_approval),
    require_document: Boolean(template.require_document),
    include_in_final_settlement: Boolean(template.include_in_final_settlement),
    status: template.status
  };
}

function defaultAssignmentForm(templates: CustomDeductionTemplate[]): AssignmentForm {
  const template = templates.find((item) => item.status === "ACTIVE");
  return {
    employee_id: "",
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

function TemplateModal({ form, onChange, onClose, onConfirm }: { form: TemplateForm; onChange: (form: TemplateForm) => void; onClose: () => void; onConfirm: () => void }) {
  return <Modal title={form.id ? "Edit custom deduction template" : "Create custom deduction template"} onClose={onClose} onConfirm={onConfirm} disabled={!form.code.trim() || !form.name.trim()}>
    <Field label="Code"><Input value={form.code} onChange={(event) => onChange({ ...form, code: event.target.value.toUpperCase() })} /></Field>
    <Field label="Name"><Input value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} /></Field>
    <Field label="Category"><Input value={form.category} onChange={(event) => onChange({ ...form, category: event.target.value.toUpperCase() })} /></Field>
    <Select label="Deduction type" value={form.deduction_type} onChange={(value) => onChange({ ...form, deduction_type: value })} options={[["ONE_TIME", "One time"], ["RECURRING", "Recurring"], ["INSTALLMENT", "Installment"], ["BALANCE_BASED", "Balance based"], ["FORMULA_PLACEHOLDER", "Formula placeholder"]]} />
    <Select label="Amount type" value={form.amount_type} onChange={(value) => onChange({ ...form, amount_type: value })} options={[["FIXED_AMOUNT", "Fixed amount"], ["PERCENTAGE_OF_BASIC", "% of basic"], ["PERCENTAGE_OF_GROSS", "% of gross"], ["CUSTOM_FORMULA_PLACEHOLDER", "Formula placeholder"]]} />
    <Field label="Default amount"><Input type="number" min={0} step="0.01" value={form.default_amount} onChange={(event) => onChange({ ...form, default_amount: event.target.value })} /></Field>
    <Field label="Default percentage"><Input type="number" min={0} max={100} step="0.01" value={form.default_percentage} onChange={(event) => onChange({ ...form, default_percentage: event.target.value })} /></Field>
    <Field label="Installment count"><Input type="number" min={1} value={form.default_installment_count} onChange={(event) => onChange({ ...form, default_installment_count: event.target.value })} /></Field>
    <Select label="Recurrence" value={form.default_recurrence_interval} onChange={(value) => onChange({ ...form, default_recurrence_interval: value })} options={[["MONTHLY", "Monthly"], ["PAYROLL_PERIOD", "Payroll period"], ["WEEKLY_PLACEHOLDER", "Weekly placeholder"], ["CUSTOM_PLACEHOLDER", "Custom placeholder"]]} />
    <Field label="Priority"><Input type="number" value={form.default_priority_number} onChange={(event) => onChange({ ...form, default_priority_number: event.target.value })} /></Field>
    <Select label="Status" value={form.status} onChange={(value) => onChange({ ...form, status: value })} options={[["ACTIVE", "Active"], ["INACTIVE", "Inactive"], ["ARCHIVED", "Archived"]]} />
    <Toggle label="Show on payslip" checked={form.show_on_payslip} onChange={(value) => onChange({ ...form, show_on_payslip: value })} />
    <Toggle label="Show in self-service" checked={form.show_in_self_service} onChange={(value) => onChange({ ...form, show_in_self_service: value })} />
    <Toggle label="Require approval" checked={form.require_approval} onChange={(value) => onChange({ ...form, require_approval: value })} />
    <Toggle label="Require document" checked={form.require_document} onChange={(value) => onChange({ ...form, require_document: value })} />
    <Toggle label="Include in final settlement" checked={form.include_in_final_settlement} onChange={(value) => onChange({ ...form, include_in_final_settlement: value })} />
    <div className="md:col-span-2"><Field label="Description"><Input value={form.description} onChange={(event) => onChange({ ...form, description: event.target.value })} /></Field></div>
  </Modal>;
}

function AssignmentModal({ form, templates, employees, organizationRefs, onChange, onClose, onConfirm }: { form: AssignmentForm; templates: CustomDeductionTemplate[]; employees: Employee[]; organizationRefs: ReturnType<typeof useOrganizationReferences>; onChange: (form: AssignmentForm) => void; onClose: () => void; onConfirm: () => void }) {
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

  return <Modal title="Assign employee custom deduction" onClose={onClose} onConfirm={onConfirm} disabled={!form.employee_id || !form.template_id || !form.effective_from || !form.reason.trim()}>
    <div className="md:col-span-2"><EmployeeCascadeSelect employees={employees} departments={organizationRefs.departments} locations={organizationRefs.locations} jobLevels={organizationRefs.jobLevels} positions={organizationRefs.positions} value={form.employee_id} onChange={(employee_id) => onChange({ ...form, employee_id })} mode="payroll-filter" /></div>
    <Field label="Template"><SelectField className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={form.template_id} onChange={(event) => chooseTemplate(event.target.value)}><option value="">Select template</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.code} - {template.name}</option>)}</SelectField></Field>
    <Field label="Assigned amount"><Input type="number" min={0} step="0.01" value={form.assigned_amount} onChange={(event) => onChange({ ...form, assigned_amount: event.target.value })} /></Field>
    <Field label="Assigned percentage"><Input type="number" min={0} max={100} step="0.01" value={form.assigned_percentage} onChange={(event) => onChange({ ...form, assigned_percentage: event.target.value })} /></Field>
    <Field label="Total amount"><Input type="number" min={0} step="0.01" value={form.total_amount} onChange={(event) => onChange({ ...form, total_amount: event.target.value })} /></Field>
    <Field label="Installment count"><Input type="number" min={1} value={form.installment_count} onChange={(event) => onChange({ ...form, installment_count: event.target.value })} /></Field>
    <Field label="Installment amount"><Input type="number" min={0} step="0.01" value={form.installment_amount} onChange={(event) => onChange({ ...form, installment_amount: event.target.value })} /></Field>
    <Field label="Effective from"><Input type="date" value={form.effective_from} onChange={(event) => onChange({ ...form, effective_from: event.target.value })} /></Field>
    <Field label="Effective to"><Input type="date" value={form.effective_to} onChange={(event) => onChange({ ...form, effective_to: event.target.value })} /></Field>
    <Field label="Reason"><Input value={form.reason} onChange={(event) => onChange({ ...form, reason: event.target.value })} /></Field>
    <div className="md:col-span-2"><Field label="Notes"><Input value={form.notes} onChange={(event) => onChange({ ...form, notes: event.target.value })} /></Field></div>
  </Modal>;
}
