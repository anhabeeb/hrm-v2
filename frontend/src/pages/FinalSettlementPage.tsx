import { Calculator, CheckCircle2, FileText, Lock, Plus, RefreshCw, Send, Settings, Wallet, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmployeeIdentityCell } from "../components/employee/EmployeeIdentityCell";
import { ExportMenu } from "../components/export/ExportMenu";
import { ActiveFilterChips, FilterResetButton, FilterSection, MoreFiltersSheet, StandardFilterBar, StandardSearchInput, StandardSelectFilter } from "../components/filters";
import { EmployeeCascadeSelect } from "../components/organization/EmployeeCascadeSelect";
import { PayrollNav } from "../components/payroll/PayrollNav";
import { ModuleSettingsBody } from "../components/settings/ModuleToggleHeader";
import { ActionTextButton } from "../components/ui/action-button";
import { Button, RowActionButton } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Panel } from "../components/ui/panel";
import { SubNavigationBar, SubNavigationItem } from "../components/ui/navigation-tabs";
import { StatusBadge, humanizeStatus } from "../components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { AdminHelpLink } from "../features/admin-help/AdminHelpLink";
import { useAuth } from "../hooks/useAuth";
import { useOrganizationReferences } from "../hooks/useOrganizationReferences";
import { ApiError, api } from "../lib/api";
import type { Employee } from "../types/employees";
import { CheckboxField, PageHeader, PageShell, SelectField as UiSelectField } from "../components/ui/page-shell";
import type {
  FinalSettlementCase,
  FinalSettlementClearanceItem,
  FinalSettlementEvent,
  FinalSettlementLineItem,
  FinalSettlementPaymentRegister,
  FinalSettlementSettings
} from "../types/final-settlement";

type Tab = "cases" | "payments" | "reports";
type CaseAction = "submit" | "approve" | "reject" | "send-back" | "finalize" | "unlock" | "cancel" | "adjustment" | "payment";
type PaymentAction = "confirm-paid" | "cancel-payment";

function money(value: unknown) {
  return Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function bool(value: unknown) {
  return value === true || value === 1;
}

function ErrorMessage({ error }: { error: string | null }) {
  return error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-1.5 text-sm"><span className="font-medium">{label}</span>{children}</label>;
}

function SelectField({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <UiSelectField value={value} onValueChange={onChange}>{children}</UiSelectField>;
}

function Dialog({ title, children, footer }: { title: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-lg border bg-white shadow-xl">
        <div className="border-b px-4 py-3"><h2 className="text-sm font-semibold">{title}</h2></div>
        <div className="max-h-[70vh] overflow-auto p-4">{children}</div>
        <div className="flex justify-end gap-2 border-t px-4 py-3">{footer}</div>
      </div>
    </div>
  );
}

export function FinalSettlementPage() {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("final_settlement.view") || permissions.has("final_settlement.cases.view") || permissions.has("final_settlement.manage");
  const canCreate = permissions.has("final_settlement.cases.create") || permissions.has("final_settlement.cases.manage") || permissions.has("final_settlement.manage");
  const canCalculate = permissions.has("final_settlement.calculate") || permissions.has("final_settlement.recalculate") || permissions.has("final_settlement.manage");
  const canApprove = permissions.has("final_settlement.approvals.approve") || permissions.has("final_settlement.approvals.manage") || permissions.has("final_settlement.manage");
  const canFinalize = permissions.has("final_settlement.finalization.finalize") || permissions.has("final_settlement.finalization.manage") || permissions.has("final_settlement.manage");
  const canPayments = permissions.has("final_settlement.payment_register.view") || permissions.has("final_settlement.payment_register.manage") || permissions.has("final_settlement.view");
  const canSettings = permissions.has("final_settlement.settings.view") || permissions.has("final_settlement.settings.manage");
  const [tab, setTab] = useState<Tab>("cases");
  const [cases, setCases] = useState<FinalSettlementCase[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [settingsData, setSettingsData] = useState<FinalSettlementSettings | null>(null);
  const [payments, setPayments] = useState<FinalSettlementPaymentRegister[]>([]);
  const [reports, setReports] = useState<Record<string, unknown> | null>(null);
  const [selected, setSelected] = useState<FinalSettlementCase | null>(null);
  const [lineItems, setLineItems] = useState<FinalSettlementLineItem[]>([]);
  const [clearance, setClearance] = useState<FinalSettlementClearanceItem[]>([]);
  const [events, setEvents] = useState<FinalSettlementEvent[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [exitType, setExitType] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [caseAction, setCaseAction] = useState<{ type: CaseAction; row: FinalSettlementCase } | null>(null);
  const [paymentAction, setPaymentAction] = useState<{ type: PaymentAction; row: FinalSettlementPaymentRegister } | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");
  const [adjustmentType, setAdjustmentType] = useState<"EARNING" | "DEDUCTION">("EARNING");
  const [amount, setAmount] = useState("");
  const [form, setForm] = useState({ employee_id: "", exit_type: "RESIGNED", exit_date: "", last_working_day: "", reason: "" });
  const organizationRefs = useOrganizationReferences(token);

  const exitTypeOptions = useMemo(() => Array.from(new Set(cases.map((row) => row.exit_type).filter(Boolean).map(String))).sort(), [cases]);
  const departmentOptions = useMemo(() => Array.from(new Set(cases.map((row) => row.department_snapshot ?? row.department_name).filter(Boolean).map(String))).sort(), [cases]);
  const resetCaseFilters = () => {
    setSearch("");
    setStatus("");
    setExitType("");
    setDepartmentFilter("");
  };
  const activeFilterChips = useMemo(() => [
    ...(search ? [{ key: "search", label: "Search", value: search, onRemove: () => setSearch("") }] : []),
    ...(status ? [{ key: "status", label: "Status", value: humanizeStatus(status), title: status, onRemove: () => setStatus("") }] : []),
    ...(exitType ? [{ key: "exit_type", label: "Exit Type", value: exitType.replace(/_/g, " "), title: exitType, onRemove: () => setExitType("") }] : []),
    ...(departmentFilter ? [{ key: "department", label: "Department", value: departmentFilter, onRemove: () => setDepartmentFilter("") }] : [])
  ], [departmentFilter, exitType, search, status]);

  const filteredCases = useMemo(() => cases.filter((row) => {
    const text = `${row.employee_no ?? row.employee_number_snapshot ?? ""} ${row.employee_name ?? row.employee_name_snapshot ?? row.full_name ?? ""} ${row.department_snapshot ?? ""} ${row.location_snapshot ?? row.worksite_snapshot ?? ""}`.toLowerCase();
    const rowDepartment = row.department_snapshot ?? row.department_name ?? "";
    return (!search || text.includes(search.toLowerCase()))
      && (!status || row.status === status)
      && (!exitType || row.exit_type === exitType)
      && (!departmentFilter || rowDepartment === departmentFilter);
  }), [cases, departmentFilter, exitType, search, status]);
  const exportRows = useMemo(() => {
    if (tab === "payments") return payments as unknown as Record<string, unknown>[];
    if (tab === "reports") return Object.entries(reports ?? {}).map(([metric, value]) => ({ metric, value: typeof value === "object" ? JSON.stringify(value) : value }));
    return filteredCases as unknown as Record<string, unknown>[];
  }, [filteredCases, payments, reports, tab]);
  const exportColumns = useMemo(() => {
    if (tab === "payments") return ["employee_no_snapshot", "employee_name_snapshot", "payment_reference", "net_payable_amount", "payment_status", "payment_method", "paid_at", "confirmation_reference"];
    if (tab === "reports") return ["metric", "value"];
    return ["case_number", "employee_no", "employee_name", "department_snapshot", "location_snapshot", "exit_type", "exit_date", "last_working_day", "status", "net_payable_amount"];
  }, [tab]);

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    setError(null);
    try {
      const [caseResult, employeeResult, settingsResult, paymentResult, summaryResult] = await Promise.all([
        api.listFinalSettlementCases(token),
        api.listEmployees(token),
        canSettings ? api.getFinalSettlementSettings(token) : Promise.resolve({ settings: null as unknown as FinalSettlementSettings }),
        canPayments ? api.listFinalSettlementPaymentRegister(token) : Promise.resolve({ payments: [] as FinalSettlementPaymentRegister[] }),
        api.getFinalSettlementReportsSummary(token)
      ]);
      setCases(caseResult.cases);
      setEmployees(employeeResult.employees);
      setSettingsData(settingsResult.settings);
      setPayments(paymentResult.payments);
      setReports(summaryResult);
      if (selected) {
        const fresh = caseResult.cases.find((row) => row.id === selected.id) ?? null;
        setSelected(fresh);
        if (fresh) await loadDetails(fresh);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load exit payroll records.");
    } finally {
      setLoading(false);
    }
  }

  async function loadDetails(row: FinalSettlementCase) {
    if (!token) return;
    setSelected(row);
    try {
      const [lineResult, clearanceResult, eventResult] = await Promise.all([
        api.listFinalSettlementLineItems(token, row.id),
        api.listFinalSettlementClearance(token, row.id),
        api.listFinalSettlementEvents(token, row.id)
      ]);
      setLineItems(lineResult.line_items);
      setClearance(clearanceResult.clearance);
      setEvents(eventResult.events);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load settlement details.");
    }
  }

  useEffect(() => { void load(); }, [token, canView]);

  async function createCase() {
    if (!token) return;
    if (!form.employee_id || !form.exit_date || !form.last_working_day || !form.reason.trim()) {
      setError("Employee, exit date, last working day, and reason are required.");
      return;
    }
    try {
      await api.createFinalSettlementCase(token, form);
      setCreateOpen(false);
      setForm({ employee_id: "", exit_type: "RESIGNED", exit_date: "", last_working_day: "", reason: "" });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to create settlement case.");
    }
  }

  async function runCaseAction() {
    if (!token || !caseAction) return;
    const type = caseAction.type;
    const id = caseAction.row.id;
    try {
      if (type === "submit") await api.submitFinalSettlementForApproval(token, id, note.trim() || null);
      if (type === "approve") await api.approveFinalSettlement(token, id, note.trim() || null);
      if (type === "reject") {
        if (!reason.trim()) return setError("Rejection reason is required.");
        await api.rejectFinalSettlement(token, id, reason.trim());
      }
      if (type === "send-back") {
        if (!reason.trim()) return setError("Send-back reason is required.");
        await api.sendBackFinalSettlement(token, id, reason.trim());
      }
      if (type === "finalize") await api.finalizeFinalSettlement(token, id, note.trim() || null);
      if (type === "unlock") {
        if (!reason.trim()) return setError("Unlock reason is required.");
        await api.unlockFinalSettlement(token, id, reason.trim());
      }
      if (type === "cancel") {
        if (!reason.trim()) return setError("Cancellation reason is required.");
        await api.cancelFinalSettlementCase(token, id, reason.trim());
      }
      if (type === "adjustment") {
        if (!reason.trim() || Number(amount) <= 0) return setError("Manual adjustment amount and reason are required.");
        await api.createFinalSettlementManualAdjustment(token, id, { adjustment_type: adjustmentType, amount: Number(amount), reason: reason.trim() });
      }
      if (type === "payment") await api.prepareFinalSettlementPaymentRegister(token, id);
      setCaseAction(null); setReason(""); setNote(""); setAmount("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Settlement action could not be completed.");
    }
  }

  async function calculate(row: FinalSettlementCase, recalculate = false) {
    if (!token) return;
    try {
      await (recalculate ? api.recalculateFinalSettlementCase(token, row.id, "Recalculated from Exit Payroll page") : api.calculateFinalSettlementCase(token, row.id));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to calculate settlement.");
    }
  }

  async function updateClearance(item: FinalSettlementClearanceItem, nextStatus: "CLEARED" | "BLOCKED" | "WAIVED") {
    if (!token || !selected) return;
    if (nextStatus === "WAIVED") {
      setCaseAction({ type: "unlock", row: selected });
      setReason("");
      setError("Use the Waive action from the clearance row with a reason.");
      return;
    }
    try {
      await api.updateFinalSettlementClearance(token, selected.id, item.id, { status: nextStatus, reason: null });
      await loadDetails(selected);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update clearance.");
    }
  }

  async function waiveClearance(item: FinalSettlementClearanceItem) {
    if (!token || !selected) return;
    if (!reason.trim()) {
      setError("Waiver reason is required.");
      return;
    }
    try {
      await api.waiveFinalSettlementClearance(token, selected.id, item.id, reason.trim());
      setReason("");
      await loadDetails(selected);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to waive clearance item.");
    }
  }

  async function submitPaymentAction() {
    if (!token || !paymentAction) return;
    try {
      if (paymentAction.type === "confirm-paid") {
        if (!reference.trim() || !note.trim()) return setError("Payment reference and note are required.");
        await api.confirmManualFinalSettlementPayment(token, paymentAction.row.id, { confirmation_reference: reference.trim(), confirmation_note: note.trim() });
      } else {
        if (!reason.trim()) return setError("Cancellation reason is required.");
        await api.cancelFinalSettlementPayment(token, paymentAction.row.id, reason.trim());
      }
      setPaymentAction(null); setReason(""); setNote(""); setReference("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Payment register action could not be completed.");
    }
  }

  async function saveSettings(nextSettings?: FinalSettlementSettings) {
    if (!token || !settingsData) return;
    try {
      await api.updateFinalSettlementSettings(token, nextSettings ?? settingsData);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save settlement settings.");
    }
  }

  if (!canView) return <PageShell><Panel><EmptyState title="Exit payroll unavailable" description="Your account needs final settlement access." /></Panel></PageShell>;
  const finalSettlementEnabled = bool(settingsData?.final_settlement_enabled ?? true);

  return (
    <PageShell>
      <PageHeader
        title="Exit Payroll / Final Settlement"
        description="Manage Final Settlement cases, clearance, approval, finalization, and manual payment register rows."
        actions={<><AdminHelpLink target="finalSettlement" label="View Exit Payroll Guide" /><ExportMenu moduleName={`Final settlement ${tab}`} rows={exportRows} columns={exportColumns} filterSummary={activeFilterChips.map((chip) => `${chip.label}: ${chip.value}`)} />{canCreate ? <Button size="sm" disabled={!finalSettlementEnabled} onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New case</Button> : null}</>}
      />
      <PayrollNav />

      <ErrorMessage error={error} />

      <SubNavigationBar label="Exit payroll section tabs">
        {(["cases", "payments", "reports"] as Tab[]).map((item) => (
          <SubNavigationItem key={item} active={tab === item} onClick={() => setTab(item)}>
            {item === "cases" ? "Cases" : item === "payments" ? "Payment Register" : "Reports"}
          </SubNavigationItem>
        ))}
      </SubNavigationBar>

      {tab === "cases" ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <Panel className="overflow-hidden">
            <div className="border-b p-3">
              <StandardFilterBar
                search={<StandardSearchInput value={search} onDebouncedChange={setSearch} placeholder="Search employee, department, location" />}
                reset={<FilterResetButton onReset={resetCaseFilters} />}
                actions={<Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="h-4 w-4" /> Refresh</Button>}
                moreFilters={
                  <MoreFiltersSheet title="Exit payroll filters" onReset={() => { setExitType(""); setDepartmentFilter(""); }}>
                    <FilterSection title="Case details">
                      <StandardSelectFilter value={exitType} onValueChange={setExitType} allLabel="All exit types" width="status" options={exitTypeOptions.map((item) => ({ value: item, label: item.replace(/_/g, " ") }))} />
                      <StandardSelectFilter value={departmentFilter} onValueChange={setDepartmentFilter} allLabel="All departments" width="department" options={departmentOptions.map((item) => ({ value: item, label: item }))} />
                    </FilterSection>
                  </MoreFiltersSheet>
                }
              >
                <StandardSelectFilter value={status} onValueChange={setStatus} allLabel="All statuses" width="status" options={["DRAFT", "CALCULATING", "READY_FOR_REVIEW", "SUBMITTED_FOR_APPROVAL", "APPROVED", "REJECTED", "SENT_BACK", "FINALIZED", "LOCKED", "CANCELLED"].map((item) => ({ value: item, label: humanizeStatus(item) }))} />
              </StandardFilterBar>
              <ActiveFilterChips chips={activeFilterChips} className="mt-2" />
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Exit</TableHead><TableHead>Status</TableHead><TableHead>Clearance</TableHead><TableHead>Net</TableHead><TableHead>Payment</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                <TableBody>{filteredCases.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell><EmployeeIdentityCell employeeId={row.employee_id} employeeName={row.employee_name ?? row.employee_name_snapshot ?? row.full_name} employeeNumber={row.employee_no ?? row.employee_number_snapshot} departmentName={row.department_name ?? row.department_snapshot} locationName={row.location_name ?? row.location_snapshot ?? row.worksite_snapshot} size="sm" /></TableCell>
                    <TableCell><div>{row.exit_type}</div><div className="text-xs text-muted-foreground">{row.exit_date} / {row.last_working_day}</div></TableCell>
                    <TableCell><StatusBadge value={row.status} /></TableCell>
                    <TableCell><StatusBadge value={row.clearance_status} /></TableCell>
                    <TableCell className="font-semibold">{money(row.net_settlement_amount)}</TableCell>
                    <TableCell>{row.payment_status ? <StatusBadge value={row.payment_status} /> : "-"}</TableCell>
                    <TableCell><div className="flex justify-end gap-1">
                      <RowActionButton intent="view" title="View details" onClick={() => void loadDetails(row)}><FileText className="h-4 w-4" /></RowActionButton>
                      {canCalculate ? <RowActionButton intent="calculate" title="Calculate" onClick={() => void calculate(row, row.status !== "DRAFT")}><Calculator className="h-4 w-4" /></RowActionButton> : null}
                      <RowActionButton intent="view" title="More actions" onClick={() => { setCaseAction({ type: "submit", row }); setNote(""); setReason(""); }}><Send className="h-4 w-4" /></RowActionButton>
                    </div></TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </div>
            {loading ? <EmptyState title="Loading exit payroll cases" description="Fetching settlement cases." /> : filteredCases.length === 0 ? <EmptyState title="No settlement cases" description="Create a case when an employee leaves or requires exit payroll." /> : null}
          </Panel>
          <CaseDetails
            selected={selected}
            lineItems={lineItems}
            clearance={clearance}
            events={events}
            canApprove={canApprove}
            canFinalize={canFinalize}
            onAction={(type) => { if (selected) { setCaseAction({ type, row: selected }); setReason(""); setNote(""); setAmount(""); } }}
            onClearance={updateClearance}
            onWaive={(item) => void waiveClearance(item)}
            waiverReason={reason}
            onWaiverReason={setReason}
          />
        </div>
      ) : null}

      {tab === "payments" ? <PaymentTable rows={payments} canManage={permissions.has("final_settlement.payment_register.manage")} onAction={(type, row) => { setPaymentAction({ type, row }); setReason(""); setNote(""); setReference(""); }} /> : null}
      {tab === "reports" ? <ReportsPanel reports={reports} /> : null}
      {false ? <SettingsPanel settings={settingsData} canManage={permissions.has("final_settlement.settings.update") || permissions.has("final_settlement.settings.manage")} onChange={setSettingsData} onSave={(next) => void saveSettings(next)} /> : null}

      {createOpen ? <CreateCaseDialog form={form} employees={employees} organizationRefs={organizationRefs} onChange={setForm} onClose={() => setCreateOpen(false)} onSave={() => void createCase()} /> : null}
      {caseAction ? <CaseActionDialog action={caseAction.type} row={caseAction.row} note={note} reason={reason} amount={amount} adjustmentType={adjustmentType} onNote={setNote} onReason={setReason} onAmount={setAmount} onAdjustmentType={setAdjustmentType} onClose={() => setCaseAction(null)} onSave={() => void runCaseAction()} /> : null}
      {paymentAction ? <PaymentActionDialog action={paymentAction.type} row={paymentAction.row} reason={reason} note={note} reference={reference} onReason={setReason} onNote={setNote} onReference={setReference} onClose={() => setPaymentAction(null)} onSave={() => void submitPaymentAction()} /> : null}
    </PageShell>
  );
}

function CaseDetails({ selected, lineItems, clearance, events, canApprove, canFinalize, onAction, onClearance, onWaive, waiverReason, onWaiverReason }: {
  selected: FinalSettlementCase | null;
  lineItems: FinalSettlementLineItem[];
  clearance: FinalSettlementClearanceItem[];
  events: FinalSettlementEvent[];
  canApprove: boolean;
  canFinalize: boolean;
  onAction: (type: CaseAction) => void;
  onClearance: (item: FinalSettlementClearanceItem, status: "CLEARED" | "BLOCKED" | "WAIVED") => void;
  onWaive: (item: FinalSettlementClearanceItem) => void;
  waiverReason: string;
  onWaiverReason: (value: string) => void;
}) {
  if (!selected) return <Panel><EmptyState title="Select a settlement case" description="Open a row to review calculations, clearance, events, and payment preparation." /></Panel>;
  const earnings = lineItems.filter((row) => row.line_type === "EARNING");
  const deductions = lineItems.filter((row) => row.line_type === "DEDUCTION");
  const employerCosts = lineItems.filter((row) => row.line_type === "EMPLOYER_COST");
  const warnings = lineItems.filter((row) => row.line_type === "WARNING" || row.line_type === "INFO");
  return (
    <Panel className="space-y-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <EmployeeIdentityCell employeeId={selected.employee_id} employeeName={selected.employee_name ?? selected.employee_name_snapshot ?? selected.full_name} employeeNumber={selected.employee_no ?? selected.employee_number_snapshot} departmentName={selected.department_name ?? selected.department_snapshot} locationName={selected.location_name ?? selected.location_snapshot ?? selected.worksite_snapshot} status={selected.status} showStatus size="md" />
        <StatusBadge value={selected.status} />
      </div>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <Metric label="Earnings" value={money(selected.total_earnings)} />
        <Metric label="Deductions" value={money(selected.total_deductions)} />
        <Metric label="Net" value={money(selected.net_settlement_amount)} />
      </div>
      <div className="flex flex-wrap gap-2">
        <ActionTextButton intent="submit" size="sm" onClick={() => onAction("submit")}><Send className="h-4 w-4" /> Submit</ActionTextButton>
        {canApprove ? <ActionTextButton intent="approve" size="sm" onClick={() => onAction("approve")}><CheckCircle2 className="h-4 w-4" /> Approve</ActionTextButton> : null}
        {canApprove ? <ActionTextButton intent="reject" size="sm" onClick={() => onAction("reject")}><XCircle className="h-4 w-4" /> Reject</ActionTextButton> : null}
        {canApprove ? <ActionTextButton intent="send-back" size="sm" onClick={() => onAction("send-back")}>Send back</ActionTextButton> : null}
        {canFinalize ? <ActionTextButton intent="finalize" size="sm" onClick={() => onAction("finalize")}><Lock className="h-4 w-4" /> Finalize</ActionTextButton> : null}
        <ActionTextButton intent="manual-adjustment" size="sm" onClick={() => onAction("adjustment")}>Manual adjustment</ActionTextButton>
        <ActionTextButton intent="create" size="sm" onClick={() => onAction("payment")}><Wallet className="h-4 w-4" /> Prepare payment row</ActionTextButton>
      </div>
      <MiniTable title="Earnings" rows={earnings} />
      <MiniTable title="Deductions" rows={deductions} />
      <MiniTable title="Employer costs" rows={employerCosts} />
      <MiniTable title="Warnings and information" rows={warnings} />
      <div>
        <h3 className="mb-2 text-sm font-semibold">Clearance</h3>
        <div className="space-y-2">
          {clearance.map((item) => <div key={item.id} className="rounded-md border p-2 text-sm"><div className="flex justify-between gap-2"><div className="min-w-0"><div className="font-medium">{item.clearance_type}</div><div className="text-xs text-muted-foreground">{item.description}</div></div><StatusBadge value={item.status} /></div><div className="mt-2 flex flex-wrap items-center gap-2"><ActionTextButton intent="complete" size="sm" onClick={() => onClearance(item, "CLEARED")}>Clear</ActionTextButton><ActionTextButton intent="block" size="sm" onClick={() => onClearance(item, "BLOCKED")}>Block</ActionTextButton><Input className="max-w-[180px]" placeholder="Waiver reason" value={waiverReason} onChange={(event) => onWaiverReason(event.target.value)} /><ActionTextButton intent="waive" size="sm" onClick={() => onWaive(item)}>Waive</ActionTextButton></div></div>)}
          {clearance.length === 0 ? <EmptyState title="No clearance rows" description="Calculation will create asset, uniform, document, payroll, and HR clearance rows." /> : null}
        </div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Events</h3>
        <div className="max-h-44 overflow-auto rounded-md border">
          {events.map((event) => <div key={event.id} className="border-b px-3 py-2 text-xs last:border-b-0"><span className="font-medium">{event.action}</span><span className="text-muted-foreground"> - {event.created_at}</span>{event.reason ? <div className="text-muted-foreground">{event.reason}</div> : null}</div>)}
          {events.length === 0 ? <div className="p-3 text-sm text-muted-foreground">No events recorded yet.</div> : null}
        </div>
      </div>
    </Panel>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border bg-slate-50 px-3 py-2"><div className="text-xs text-muted-foreground">{label}</div><div className="font-semibold">{value}</div></div>;
}

function MiniTable({ title, rows }: { title: string; rows: FinalSettlementLineItem[] }) {
  return <div><h3 className="mb-2 text-sm font-semibold">{title}</h3><div className="max-h-48 overflow-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>Description</TableHead><TableHead>Source</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell><div className="font-medium">{row.component_name}</div>{row.notes ? <div className="text-xs text-muted-foreground">{row.notes}</div> : null}</TableCell><TableCell>{row.component_source}</TableCell><TableCell className="text-right">{row.amount == null ? "Restricted" : money(row.amount)}</TableCell></TableRow>)}</TableBody></Table>{rows.length === 0 ? <div className="p-3 text-sm text-muted-foreground">No rows.</div> : null}</div></div>;
}

function CreateCaseDialog({ form, employees, organizationRefs, onChange, onClose, onSave }: { form: { employee_id: string; exit_type: string; exit_date: string; last_working_day: string; reason: string }; employees: Employee[]; organizationRefs: ReturnType<typeof useOrganizationReferences>; onChange: (form: { employee_id: string; exit_type: string; exit_date: string; last_working_day: string; reason: string }) => void; onClose: () => void; onSave: () => void }) {
  const update = (key: keyof typeof form, value: string) => onChange({ ...form, [key]: value });
  return <Dialog title="Create exit payroll case" footer={<><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={onSave}>Create case</Button></>}><div className="grid gap-3 md:grid-cols-2"><div className="md:col-span-2"><EmployeeCascadeSelect employees={employees} departments={organizationRefs.departments} locations={organizationRefs.locations} jobLevels={organizationRefs.jobLevels} positions={organizationRefs.positions} value={form.employee_id} onChange={(employeeId) => update("employee_id", employeeId)} /></div><Field label="Exit type"><SelectField value={form.exit_type} onChange={(value) => update("exit_type", value)}>{["RESIGNED", "TERMINATED", "END_OF_CONTRACT", "ABSCONDED", "RETIRED", "DECEASED", "OTHER"].map((item) => <option key={item} value={item}>{item}</option>)}</SelectField></Field><Field label="Exit date"><Input type="date" value={form.exit_date} onChange={(event) => update("exit_date", event.target.value)} /></Field><Field label="Last working day"><Input type="date" value={form.last_working_day} onChange={(event) => update("last_working_day", event.target.value)} /></Field><Field label="Reason"><Input value={form.reason} onChange={(event) => update("reason", event.target.value)} /></Field></div></Dialog>;
}

function CaseActionDialog({ action, row, note, reason, amount, adjustmentType, onNote, onReason, onAmount, onAdjustmentType, onClose, onSave }: { action: CaseAction; row: FinalSettlementCase; note: string; reason: string; amount: string; adjustmentType: "EARNING" | "DEDUCTION"; onNote: (value: string) => void; onReason: (value: string) => void; onAmount: (value: string) => void; onAdjustmentType: (value: "EARNING" | "DEDUCTION") => void; onClose: () => void; onSave: () => void }) {
  const needsReason = ["reject", "send-back", "unlock", "cancel", "adjustment"].includes(action);
  return <Dialog title={`${action.replace(/-/g, " ")} - ${row.employee_name ?? row.full_name}`} footer={<><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={onSave}>Apply</Button></>}><div className="space-y-3"><p className="text-sm text-muted-foreground">This action is audited and does not process bank transfers.</p>{action === "adjustment" ? <div className="grid gap-3 md:grid-cols-2"><Field label="Adjustment type"><SelectField value={adjustmentType} onChange={(value) => onAdjustmentType(value as "EARNING" | "DEDUCTION")}><option value="EARNING">Earning</option><option value="DEDUCTION">Deduction</option></SelectField></Field><Field label="Amount"><Input type="number" min="0" step="0.01" value={amount} onChange={(event) => onAmount(event.target.value)} /></Field></div> : null}<Field label={needsReason ? "Reason" : "Note"}><Input value={needsReason ? reason : note} onChange={(event) => needsReason ? onReason(event.target.value) : onNote(event.target.value)} placeholder={needsReason ? "Reason required" : "Optional note"} /></Field></div></Dialog>;
}

function PaymentTable({ rows, canManage, onAction }: { rows: FinalSettlementPaymentRegister[]; canManage: boolean; onAction: (type: PaymentAction, row: FinalSettlementPaymentRegister) => void }) {
  return <Panel className="overflow-hidden"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Direction</TableHead><TableHead>Net</TableHead><TableHead>Method</TableHead><TableHead>Institution</TableHead><TableHead>Status</TableHead><TableHead>Reference</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => {
    const actionable = row.payment_status === "PENDING" || row.payment_status === "PREPARED";
    return <TableRow key={row.id}><TableCell><EmployeeIdentityCell employeeId={row.employee_id} employeeName={row.employee_name_snapshot} employeeNumber={row.employee_number_snapshot ?? row.employee_no_snapshot} size="sm" /></TableCell><TableCell>{row.payment_direction}</TableCell><TableCell>{row.net_settlement_amount == null ? "Restricted" : money(row.net_settlement_amount)}</TableCell><TableCell>{row.payment_method_type_snapshot ?? row.payment_method_snapshot ?? "-"}</TableCell><TableCell>{row.payment_institution_snapshot ?? row.bank_name_snapshot ?? "-"}</TableCell><TableCell><StatusBadge value={row.payment_status} /></TableCell><TableCell>{row.confirmation_reference ?? "-"}</TableCell><TableCell><div className="flex justify-end gap-1">{canManage ? <RowActionButton intent="approve" title="Confirm manual payment" disabled={!actionable} onClick={() => onAction("confirm-paid", row)}><CheckCircle2 className="h-4 w-4" /></RowActionButton> : null}{canManage ? <RowActionButton intent="disable" title="Cancel row" disabled={!actionable} onClick={() => onAction("cancel-payment", row)}><XCircle className="h-4 w-4" /></RowActionButton> : null}</div></TableCell></TableRow>;
  })}</TableBody></Table></div>{rows.length === 0 ? <EmptyState title="No payment register rows" description="Finalize a settlement and prepare a manual payment row." /> : null}</Panel>;
}

function PaymentActionDialog({ action, row, reason, note, reference, onReason, onNote, onReference, onClose, onSave }: { action: PaymentAction; row: FinalSettlementPaymentRegister; reason: string; note: string; reference: string; onReason: (value: string) => void; onNote: (value: string) => void; onReference: (value: string) => void; onClose: () => void; onSave: () => void }) {
  return <Dialog title={`${action === "confirm-paid" ? "Confirm manual payment" : "Cancel payment row"} - ${row.employee_name_snapshot}`} footer={<><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={onSave}>Save</Button></>}><div className="space-y-3"><div className="rounded-md border bg-muted px-3 py-2 text-sm text-muted-foreground">Manual payment confirmation only. No bank export or bank transfer is performed.</div>{action === "confirm-paid" ? <><Field label="Confirmation reference"><Input value={reference} onChange={(event) => onReference(event.target.value)} /></Field><Field label="Confirmation note"><Input value={note} onChange={(event) => onNote(event.target.value)} /></Field></> : <Field label="Cancellation reason"><Input value={reason} onChange={(event) => onReason(event.target.value)} /></Field>}</div></Dialog>;
}

function ReportsPanel({ reports }: { reports: Record<string, unknown> | null }) {
  const summary = reports?.summary as Record<string, unknown> | undefined;
  return <Panel className="space-y-3 p-4"><div><h2 className="text-sm font-semibold">Settlement reports foundation</h2><p className="text-sm text-muted-foreground">Protected report APIs cover pending, ready for approval, finalized, department/worksite totals, leave, bank loan, pension, custom deduction, asset/uniform deductions, and net settlement summaries.</p></div><div className="grid gap-3 md:grid-cols-4"><Metric label="Total cases" value={String(summary?.total_cases ?? 0)} /><Metric label="Pending" value={String(summary?.pending_settlements ?? 0)} /><Metric label="Ready approval" value={String(summary?.ready_for_approval ?? 0)} /><Metric label="Finalized" value={String(summary?.finalized_settlements ?? 0)} /><Metric label="Earnings" value={money(summary?.total_earnings)} /><Metric label="Deductions" value={money(summary?.total_deductions)} /><Metric label="Net total" value={money(summary?.net_settlement_amount)} /></div></Panel>;
}

function SettingsPanel({ settings, canManage, onChange, onSave }: { settings: FinalSettlementSettings | null; canManage: boolean; onChange: (settings: FinalSettlementSettings) => void; onSave: (settings?: FinalSettlementSettings) => void }) {
  if (!settings) return <Panel><EmptyState title="Settings unavailable" description="Your account needs final settlement settings permission." /></Panel>;
  const activeSettings = settings;
  const toggleKeys: Array<keyof FinalSettlementSettings> = [
    "allow_settlement_case_creation_from_exit_status",
    "auto_create_settlement_case_on_exit_status",
    "require_settlement_approval_before_finalization",
    "require_clearance_before_finalization",
    "require_document_checklist_before_finalization_placeholder",
    "include_unpaid_salary",
    "include_pending_payroll",
    "include_unused_leave_payout",
    "include_negative_leave_balance_deduction",
    "include_unpaid_leave_deduction",
    "include_attendance_deduction",
    "include_bank_loan_deductions",
    "include_bank_loan_shortfall_warnings",
    "include_bank_loan_direct_collection_warnings",
    "include_pension_contribution",
    "include_pension_remittance_warnings",
    "include_custom_deduction_remaining_balances",
    "include_custom_deduction_shortfall_warnings",
    "include_advance_balance_deduction",
    "include_one_time_deductions",
    "include_asset_deductions",
    "include_uniform_deductions",
    "include_notice_period_deduction",
    "include_gratuity_placeholder",
    "include_contract_end_placeholder",
    "include_manual_earning_adjustments",
    "include_manual_deduction_adjustments",
    "settlement_payment_register_enabled",
    "final_settlement_document_pdf_placeholder_enabled",
    "allow_recalculation_while_draft",
    "allow_recalculation_after_approval",
    "allow_unlock_after_finalization",
    "require_reason_for_recalculation",
    "require_reason_for_unlock"
  ];
  const enabled = bool(activeSettings.final_settlement_enabled ?? true);
  return (
    <Panel className="space-y-4 p-4">
      <ModuleSettingsBody disabled={!enabled}>
        <div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold">Exit payroll settings</h2><p className="text-sm text-muted-foreground">Configure settlement calculation, source inclusion, approval, finalization, and payment register controls.</p></div>{canManage ? <Button size="sm" disabled={!enabled} onClick={() => onSave()}><Settings className="h-4 w-4" /> Save settings</Button> : null}</div>
        <div className="grid gap-2 md:grid-cols-3">{toggleKeys.map((key) => <CheckboxField key={key} label={String(key).replace(/_/g, " ")} disabled={!canManage || !enabled} checked={bool(settings[key])} onChange={(checked) => onChange({ ...settings, [key]: checked })} />)}</div>
        <div className="grid gap-3 md:grid-cols-3"><Field label="Daily rate mode"><SelectField value={settings.default_daily_rate_calculation_mode} onChange={(value) => onChange({ ...settings, default_daily_rate_calculation_mode: value as FinalSettlementSettings["default_daily_rate_calculation_mode"] })}><option value="CALENDAR_DAYS">Calendar days</option><option value="WORKING_DAYS">Working days</option><option value="FIXED_30_DAYS">Fixed 30 days</option></SelectField></Field><Field label="Unused leave payout mode"><SelectField value={settings.default_unused_leave_payout_calculation_mode ?? "DAILY_RATE"} onChange={(value) => onChange({ ...settings, default_unused_leave_payout_calculation_mode: value as FinalSettlementSettings["default_unused_leave_payout_calculation_mode"] })}><option value="DAILY_RATE">Daily rate</option><option value="FIXED_AMOUNT">Fixed amount</option><option value="MANUAL">Manual</option></SelectField></Field><Field label="Default settlement currency"><Input disabled={!canManage || !enabled} value={settings.default_settlement_currency ?? "MVR"} onChange={(event) => onChange({ ...settings, default_settlement_currency: event.target.value })} /></Field></div>
      </ModuleSettingsBody>
    </Panel>
  );
}
