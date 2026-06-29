import { Download, Edit, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EmployeeIdentityCell } from "../components/employee/EmployeeIdentityCell";
import { ExportMenu } from "../components/export/ExportMenu";
import { EmployeeCascadeSelect } from "../components/organization/EmployeeCascadeSelect";
import { OrganizationCascadeSelector } from "../components/organization/OrganizationCascadeSelector";
import { PayrollNav } from "../components/payroll/PayrollNav";
import { ModuleSettingsBody } from "../components/settings/ModuleToggleHeader";
import { ActiveFilterChips, FilterResetButton, FilterSection, formatDateRangeLabel, MoreFiltersSheet, StandardDateRangeFilter, StandardFilterBar, StandardSearchInput, StandardSelectFilter, type ActiveFilterChip } from "../components/filters";
import { ActionTextButton } from "../components/ui/action-button";
import { Badge } from "../components/ui/badge";
import { Button, RowActionButton } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Panel } from "../components/ui/panel";
import { StatusBadge, humanizeStatus } from "../components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { AdminHelpLink } from "../features/admin-help/AdminHelpLink";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import type { Employee } from "../types/employees";
import type { OrganizationDepartment, OrganizationJobLevel, OrganizationLocation, OrganizationPosition } from "../types/organization";
import type { PayrollAdjustment, PayrollAdvance, PayrollComponent, PayrollDeduction, PayrollPeriod, PayrollSettings } from "../types/payroll";
import { CheckboxField, PageHeader, SelectField, TextareaField } from "../components/ui/page-shell";

type Row = Record<string, unknown>;
type PayrollSubmoduleSettingKey =
  | "payslips_enabled"
  | "payment_register_enabled"
  | "payment_methods_enabled"
  | "payment_institutions_enabled"
  | "employee_advances_enabled"
  | "payroll_adjustments_enabled"
  | "payroll_reports_enabled"
  | "bank_loan_deductions_enabled"
  | "custom_deductions_enabled"
  | "pension_enabled";

const payrollSubmoduleCards: Array<{ key: PayrollSubmoduleSettingKey; name: string; description: string; warnings: string[] }> = [
  { key: "payslips_enabled", name: "Payslips", description: "Controls payslip generation, employee payslip views, and payslip search results.", warnings: ["Employees and payroll users cannot view or generate payslips while this submodule is disabled."] },
  { key: "payment_register_enabled", name: "Payment Register", description: "Controls payment register preparation and manual confirmation placeholders.", warnings: ["Payment register pages and actions are blocked while this submodule is disabled."] },
  { key: "payment_methods_enabled", name: "Employee Payment Methods", description: "Controls employee payment method setup, onboarding payment-method requirements, and payslip snapshots.", warnings: ["Onboarding and Employee 360 payment-method setup will be skipped or hidden while disabled."] },
  { key: "payment_institutions_enabled", name: "Payment Institutions", description: "Controls bank/payment institution setup used by payment methods and loan foundations.", warnings: ["Payment institution setup routes and pages are blocked while disabled."] },
  { key: "employee_advances_enabled", name: "Employee Advances", description: "Controls advance records and advance deduction candidates during payroll calculation.", warnings: ["Payroll calculations skip advance deductions while this submodule is disabled."] },
  { key: "payroll_adjustments_enabled", name: "Payroll Adjustments", description: "Controls one-time adjustment records and adjustment calculation candidates.", warnings: ["Payroll calculations skip adjustment rows while this submodule is disabled."] },
  { key: "bank_loan_deductions_enabled", name: "Bank Loan Deductions", description: "Controls employee bank loan setup, loan payment history, remittance, and loan deductions.", warnings: ["Payroll calculations skip bank loan deductions while this submodule is disabled. Historical loan rows remain viewable only through enabled access paths."] },
  { key: "custom_deductions_enabled", name: "Custom Deductions", description: "Controls custom deduction templates, assignments, self-service visibility, and payroll applications.", warnings: ["Payroll calculations skip custom deductions while this submodule is disabled."] },
  { key: "pension_enabled", name: "Pension", description: "Controls pension profiles, schemes, contributions, remittance, self-service, and pension calculation.", warnings: ["Payroll calculations skip pension contributions while this submodule is disabled."] },
  { key: "payroll_reports_enabled", name: "Payroll Reports", description: "Controls Payroll report endpoints and report navigation.", warnings: ["Payroll reports are blocked while this submodule is disabled."] }
];

function money(value: unknown) {
  return Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ErrorMessage({ error }: { error: string | null }) {
  return error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null;
}

function PayrollPageHeader({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  const { user } = useAuth();
  const canImport = Boolean(user?.permissions.includes("data_import.upload") || user?.permissions.includes("data_import.manage"));
  return (
    <>
      <PageHeader
        title={title}
        description={description}
        actions={<><AdminHelpLink target="payroll" label="View Payroll Guide" />{canImport ? <Link to="/settings/admin/imports"><ActionTextButton intent="import" size="sm">Import payroll profiles</ActionTextButton></Link> : null}{children}</>}
      />
      <PayrollNav />
    </>
  );
}

function SearchInput({ value, onChange, placeholder = "Search employee/name/no" }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <StandardSearchInput className="md:col-span-2" value={value} onDebouncedChange={onChange} placeholder={placeholder} />;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function Toggle({ label, checked, disabled = false, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return <CheckboxField label={label} disabled={disabled} checked={checked} onChange={onChange} />;
}

function Modal({ title, children, onClose, onSave }: { title: string; children: React.ReactNode; onClose: () => void; onSave: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-lg border bg-white shadow-xl">
        <div className="border-b px-4 py-3"><h2 className="text-sm font-semibold">{title}</h2></div>
        <div className="max-h-[70vh] overflow-auto p-4">{children}</div>
        <div className="flex justify-end gap-2 border-t px-4 py-3"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={onSave}>Save</Button></div>
      </div>
    </div>
  );
}

function ActionModal({ title, description, reason, reasonRequired, onReason, onClose, onConfirm }: { title: string; description: string; reason?: string; reasonRequired?: boolean; onReason?: (value: string) => void; onClose: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4">
      <div className="w-full max-w-md rounded-lg border bg-white shadow-xl">
        <div className="border-b px-4 py-3"><h2 className="text-sm font-semibold">{title}</h2></div>
        <div className="space-y-3 p-4">
          <p className="text-sm text-slate-700">{description}</p>
          {onReason ? <Input value={reason ?? ""} onChange={(event) => onReason(event.target.value)} placeholder={reasonRequired ? "Reason required" : "Reason"} /> : null}
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={onConfirm}>Confirm</Button></div>
      </div>
    </div>
  );
}

function EmployeeSelect({ employees, departments, locations, jobLevels, positions, value, onChange }: { employees: Employee[]; departments: OrganizationDepartment[]; locations: OrganizationLocation[]; jobLevels: OrganizationJobLevel[]; positions: OrganizationPosition[]; value?: string | null; onChange: (value: string) => void }) {
  return <EmployeeCascadeSelect employees={employees} departments={departments} locations={locations} jobLevels={jobLevels} positions={positions} value={value} onChange={onChange} mode="payroll-filter" />;
}

function PeriodSelect({ periods, value, onChange }: { periods: PayrollPeriod[]; value?: string | null; onChange: (value: string | null) => void }) {
  return <SelectField className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={value ?? ""} onChange={(event) => onChange(event.target.value || null)}><option value="">No period</option>{periods.map((period) => <option key={period.id} value={period.id}>{period.period_month}/{period.period_year} - {humanizeStatus(period.status)}</option>)}</SelectField>;
}

function PayrollTablePageLayout({ title, description, error, loading, empty, emptyTitle, filters, onReset, action, chips = [], exportRows, exportColumns, children }: { title: string; description: string; error: string | null; loading: boolean; empty: boolean; emptyTitle: string; filters: React.ReactNode; onReset?: () => void; action?: React.ReactNode; chips?: ActiveFilterChip[]; exportRows?: Record<string, unknown>[]; exportColumns?: string[]; children: React.ReactNode }) {
  return <div className="space-y-4"><PayrollPageHeader title={title} description={description}>{exportRows && exportColumns ? <ExportMenu moduleName={title} rows={exportRows} columns={exportColumns} filterSummary={chips.map((chip) => `${chip.label}: ${chip.value}`)} /> : null}{action}</PayrollPageHeader><ErrorMessage error={error} /><Panel className="overflow-hidden"><div className="border-b p-3"><StandardFilterBar className="border-0 shadow-none">{filters}{onReset ? <FilterResetButton onReset={onReset} /> : null}</StandardFilterBar><ActiveFilterChips chips={chips} className="mt-2" /></div><div className="overflow-x-auto"><Table>{children}</Table></div>{loading ? <EmptyState title={`Loading ${title.toLowerCase()}`} description="Fetching payroll rows." /> : empty ? <EmptyState title={emptyTitle} description="Use the available actions or adjust filters." /> : null}</Panel></div>;
}

async function loadReferenceData(token: string) {
  const [employees, departments, locations, jobLevels, positions, periods] = await Promise.all([api.listEmployees(token), api.listDepartments(token), api.listLocations(token), api.listJobLevels(token), api.listPositions(token), api.listPayrollPeriods(token)]);
  return { employees: employees.employees, departments: departments.departments, locations: locations.locations, jobLevels: jobLevels.job_levels, positions: positions.positions, periods: periods.periods };
}

function payrollOrgFilterChips(input: {
  departments: OrganizationDepartment[];
  locations: OrganizationLocation[];
  jobLevels: OrganizationJobLevel[];
  positions: OrganizationPosition[];
  departmentId: string;
  locationId: string;
  jobLevelId: string;
  positionId: string;
  setDepartmentId: (value: string) => void;
  setLocationId: (value: string) => void;
  setJobLevelId: (value: string) => void;
  setPositionId: (value: string) => void;
}): ActiveFilterChip[] {
  return [
    ...(input.locationId ? [{ key: "location", label: "Location", value: input.locations.find((row) => row.id === input.locationId)?.name ?? input.locationId, onRemove: () => input.setLocationId("") }] : []),
    ...(input.departmentId ? [{ key: "department", label: "Department", value: input.departments.find((row) => row.id === input.departmentId)?.name ?? input.departmentId, onRemove: () => input.setDepartmentId("") }] : []),
    ...(input.jobLevelId ? [{ key: "job_level", label: "Job Level", value: input.jobLevels.find((row) => row.id === input.jobLevelId)?.name ?? input.jobLevelId, onRemove: () => input.setJobLevelId("") }] : []),
    ...(input.positionId ? [{ key: "position", label: "Position", value: input.positions.find((row) => row.id === input.positionId)?.title ?? input.positionId, onRemove: () => input.setPositionId("") }] : [])
  ];
}

function PayrollOrgFilter({ departments, locations, jobLevels, positions, departmentId, locationId, jobLevelId, positionId, onChange }: { departments: OrganizationDepartment[]; locations: OrganizationLocation[]; jobLevels: OrganizationJobLevel[]; positions: OrganizationPosition[]; departmentId: string; locationId: string; jobLevelId: string; positionId: string; onChange: (value: { departmentId: string; locationId: string; jobLevelId: string; positionId: string }) => void }) {
  return (
    <div className="md:col-span-4 xl:col-span-4">
      <OrganizationCascadeSelector
        includeLocation
        mode="payroll-filter"
        departments={departments}
        locations={locations}
        jobLevels={jobLevels}
        positions={positions}
        value={{ departmentId, locationId, jobLevelId, positionId }}
        onChange={(next) => onChange({ departmentId: next.departmentId ?? "", locationId: next.locationId ?? "", jobLevelId: next.jobLevelId ?? "", positionId: next.positionId ?? "" })}
        labels={{ departmentId: "Department filter", jobLevelId: "Job level filter", positionId: "Position filter", locationId: "Location filter" }}
        className="grid gap-2 md:grid-cols-2 xl:grid-cols-4"
      />
    </div>
  );
}

export function PayrollAdvancesPage() {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("payroll.advances.view") || permissions.has("payroll.view");
  const canManage = permissions.has("payroll.advances.manage");
  const canApprove = permissions.has("payroll.advances.approve") || permissions.has("payroll.advances.manage");
  const canCancel = permissions.has("payroll.advances.cancel") || permissions.has("payroll.advances.manage");
  const [rows, setRows] = useState<PayrollAdvance[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [jobLevels, setJobLevels] = useState<OrganizationJobLevel[]>([]);
  const [positions, setPositions] = useState<OrganizationPosition[]>([]);
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [editing, setEditing] = useState<Partial<PayrollAdvance> | null>(null);
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [jobLevelId, setJobLevelId] = useState("");
  const [positionId, setPositionId] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rowAction, setRowAction] = useState<{ row: PayrollAdvance; name: "approve" | "cancel" } | null>(null);
  const [actionReason, setActionReason] = useState("");
  const filters = useMemo(() => ({ search, department_id: departmentId, location_id: locationId, status, payment_date_from: from, payment_date_to: to }), [search, departmentId, locationId, status, from, to]);
  const paymentDateRange = useMemo(() => ({ from, to }), [from, to]);
  async function load() {
    if (!token || !canView) return;
    setLoading(true); setError(null);
    try {
      const [advanceResult, refs] = await Promise.all([api.listPayrollAdvances(token, filters), loadReferenceData(token)]);
      setRows(advanceResult.advances); setEmployees(refs.employees); setDepartments(refs.departments); setLocations(refs.locations); setJobLevels(refs.jobLevels); setPositions(refs.positions); setPeriods(refs.periods);
    } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to load advances."); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [token, canView, filters]);
  async function save() {
    if (!token || !editing) return;
    try {
      if (editing.id) await api.updatePayrollAdvance(token, editing.id, editing);
      else await api.createPayrollAdvance(token, editing);
      setEditing(null); await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to save advance."); }
  }
  async function confirmAction() {
    if (!token || !rowAction) return;
    if (rowAction.name === "cancel" && !actionReason.trim()) {
      setError("Cancellation reason is required.");
      return;
    }
    try {
      if (rowAction.name === "approve") await api.approvePayrollAdvance(token, rowAction.row.id);
      if (rowAction.name === "cancel") await api.cancelPayrollAdvance(token, rowAction.row.id, actionReason.trim());
      setRowAction(null);
      setActionReason("");
      await load();
    } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to update advance."); }
  }
  const chips = useMemo<ActiveFilterChip[]>(() => [
    ...(search ? [{ key: "search", label: "Search", value: search, onRemove: () => setSearch("") }] : []),
    ...(status ? [{ key: "status", label: "Status", value: status.replace(/_/g, " "), title: status, onRemove: () => setStatus("") }] : []),
    ...(from || to ? [{ key: "payment_date", label: "Payment Date", value: formatDateRangeLabel(paymentDateRange), onRemove: () => { setFrom(""); setTo(""); } }] : []),
    ...payrollOrgFilterChips({ departments, locations, jobLevels, positions, departmentId, locationId, jobLevelId, positionId, setDepartmentId, setLocationId, setJobLevelId, setPositionId })
  ], [departmentId, departments, from, jobLevelId, jobLevels, locationId, locations, paymentDateRange, positionId, positions, search, status, to]);
  if (!canView) return <Panel><EmptyState title="Advances unavailable" description="Your account needs payroll advance permission." /></Panel>;
  return <PayrollTablePageLayout title="Payroll Advances" description="Track employee advances by department, location, status, and payment date." error={error} loading={loading} empty={rows.length === 0} emptyTitle="No advances" chips={chips} onReset={() => { setSearch(""); setDepartmentId(""); setLocationId(""); setJobLevelId(""); setPositionId(""); setStatus(""); setFrom(""); setTo(""); }} filters={<><SearchInput value={search} onChange={setSearch} /><StandardSelectFilter value={status} onValueChange={setStatus} allLabel="All statuses" width="status" options={["REQUESTED", "APPROVED", "DEDUCTED", "CANCELLED"].map((item) => ({ value: item, label: item.replace(/_/g, " ") }))} /><StandardDateRangeFilter value={paymentDateRange} onChange={(range) => { setFrom(range.from ?? ""); setTo(range.to ?? ""); }} label="Payment Date Range" /><MoreFiltersSheet title="Advance filters" onReset={() => { setDepartmentId(""); setLocationId(""); setJobLevelId(""); setPositionId(""); }}><FilterSection title="Organization"><PayrollOrgFilter departments={departments} locations={locations} jobLevels={jobLevels} positions={positions} departmentId={departmentId} locationId={locationId} jobLevelId={jobLevelId} positionId={positionId} onChange={(next) => { setDepartmentId(next.departmentId); setLocationId(next.locationId); setJobLevelId(next.jobLevelId); setPositionId(next.positionId); }} /></FilterSection></MoreFiltersSheet></>} exportRows={rows as unknown as Record<string, unknown>[]} exportColumns={["employee_no", "employee_name", "department_name", "location_name", "amount", "payment_date", "repayment_period_label", "status", "notes"]} action={canManage ? <Button size="sm" onClick={() => setEditing({ status: "REQUESTED", payment_date: new Date().toISOString().slice(0, 10) })}><Plus className="h-4 w-4" /> Create advance</Button> : null}>
    <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Department</TableHead><TableHead>Location</TableHead><TableHead>Amount</TableHead><TableHead>Payment date</TableHead><TableHead>Repayment period</TableHead><TableHead>Status</TableHead><TableHead>Notes</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
    <TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell><EmployeeIdentityCell employeeId={row.employee_id} employeeName={row.employee_name} employeeNumber={row.employee_no} departmentName={row.department_name} locationName={row.location_name} size="sm" /></TableCell><TableCell>{row.department_name ?? "-"}</TableCell><TableCell>{row.location_name ?? "-"}</TableCell><TableCell>{money(row.amount)}</TableCell><TableCell>{row.payment_date}</TableCell><TableCell>{row.repayment_period_label ?? "-"}</TableCell><TableCell><StatusBadge value={row.status === "PAID" ? "APPROVED" : row.status} /></TableCell><TableCell>{row.notes ?? "-"}</TableCell><TableCell><div className="flex justify-end gap-1">{canManage ? <RowActionButton intent="edit" title="Edit advance" onClick={() => setEditing(row)}><Edit className="h-4 w-4" /></RowActionButton> : null}{canApprove ? <RowActionButton intent="approve" size="sm" title="Approve" onClick={() => setRowAction({ row, name: "approve" })}>Approve</RowActionButton> : null}{canCancel ? <RowActionButton intent="delete" size="sm" title="Cancel advance" onClick={() => { setActionReason(""); setRowAction({ row, name: "cancel" }); }}>Cancel</RowActionButton> : null}</div></TableCell></TableRow>)}</TableBody>
    {editing ? <AdvanceModal value={editing} employees={employees} departments={departments} locations={locations} jobLevels={jobLevels} positions={positions} periods={periods} onChange={setEditing} onClose={() => setEditing(null)} onSave={() => void save()} /> : null}
    {rowAction ? <ActionModal title={rowAction.name === "approve" ? "Approve advance" : "Cancel advance"} description={rowAction.name === "approve" ? "Approve this advance for later deduction." : "Cancelling an advance requires a reason."} reason={actionReason} reasonRequired={rowAction.name === "cancel"} onReason={rowAction.name === "cancel" ? setActionReason : undefined} onClose={() => { setRowAction(null); setActionReason(""); }} onConfirm={() => void confirmAction()} /> : null}
  </PayrollTablePageLayout>;
}

function AdvanceModal({ value, employees, departments, locations, jobLevels, positions, periods, onChange, onClose, onSave }: { value: Partial<PayrollAdvance>; employees: Employee[]; departments: OrganizationDepartment[]; locations: OrganizationLocation[]; jobLevels: OrganizationJobLevel[]; positions: OrganizationPosition[]; periods: PayrollPeriod[]; onChange: (value: Partial<PayrollAdvance>) => void; onClose: () => void; onSave: () => void }) {
  return <Modal title={value.id ? "Edit advance" : "Create advance"} onClose={onClose} onSave={onSave}><div className="grid gap-3 md:grid-cols-2"><div className="md:col-span-2"><EmployeeSelect employees={employees} departments={departments} locations={locations} jobLevels={jobLevels} positions={positions} value={value.employee_id} onChange={(employee_id) => onChange({ ...value, employee_id })} /></div><Field label="Amount"><Input type="number" min={0} value={value.amount ?? ""} onChange={(event) => onChange({ ...value, amount: Number(event.target.value) })} /></Field><Field label="Payment date"><Input type="date" value={value.payment_date ?? ""} onChange={(event) => onChange({ ...value, payment_date: event.target.value })} /></Field><Field label="Repayment period"><PeriodSelect periods={periods} value={value.repayment_period_id} onChange={(repayment_period_id) => onChange({ ...value, repayment_period_id })} /></Field><Field label="Notes"><Input value={value.notes ?? ""} onChange={(event) => onChange({ ...value, notes: event.target.value || null })} /></Field></div></Modal>;
}

export function PayrollComponentsPage() {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("payroll.components.manage") || permissions.has("payroll.view");
  const canManage = permissions.has("payroll.components.manage");
  const [rows, setRows] = useState<PayrollComponent[]>([]);
  const [editing, setEditing] = useState<Partial<PayrollComponent> | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  async function load() {
    if (!token || !canView) return;
    setLoading(true); setError(null);
    try { setRows((await api.listPayrollComponents(token)).components); } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to load payroll components."); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [token, canView]);
  async function save() {
    if (!token || !editing) return;
    try { if (editing.id) await api.updatePayrollComponent(token, editing.id, editing); else await api.createPayrollComponent(token, editing); setEditing(null); await load(); } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to save component."); }
  }
  async function toggle(component: PayrollComponent) {
    if (!token) return;
    try { await api.payrollComponentAction(token, component.id, component.is_active ? "disable" : "enable"); await load(); } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to update component."); }
  }
  const filtered = rows.filter((row) => `${row.code} ${row.name} ${row.category ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const chips = useMemo<ActiveFilterChip[]>(() => search ? [{ key: "search", label: "Search", value: search, onRemove: () => setSearch("") }] : [], [search]);
  if (!canView) return <Panel><EmptyState title="Payroll components unavailable" description="Your account needs payroll permission." /></Panel>;
  return <PayrollTablePageLayout title="Payroll Components" description="Manage Payroll Core earning and deduction components used in result line items." error={error} loading={loading} empty={filtered.length === 0} emptyTitle="No components" chips={chips} onReset={() => setSearch("")} filters={<SearchInput value={search} onChange={setSearch} placeholder="Search code/name/category" />} exportRows={filtered as unknown as Record<string, unknown>[]} exportColumns={["code", "name", "type", "category", "calculation_type", "default_amount", "default_percentage", "is_taxable", "is_active"]} action={canManage ? <Button size="sm" onClick={() => setEditing({ type: "ALLOWANCE", calculation_type: "FIXED_AMOUNT", is_active: true, sort_order: 100 })}><Plus className="h-4 w-4" /> Create component</Button> : null}>
    <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Category</TableHead><TableHead>Calculation</TableHead><TableHead>Default</TableHead><TableHead>Taxable</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
    <TableBody>{filtered.map((row) => <TableRow key={row.id}><TableCell className="font-mono text-xs">{row.code}</TableCell><TableCell className="font-medium">{row.name}</TableCell><TableCell>{row.type}</TableCell><TableCell>{row.category ?? "-"}</TableCell><TableCell>{row.calculation_type}</TableCell><TableCell>{row.default_percentage ? `${row.default_percentage}%` : money(row.default_amount)}</TableCell><TableCell>{Boolean(row.is_taxable) ? "Yes" : "No"}</TableCell><TableCell><Badge tone={row.is_active ? "success" : "neutral"}>{row.is_active ? "Active" : "Inactive"}</Badge></TableCell><TableCell><div className="flex justify-end gap-1">{canManage ? <><RowActionButton intent="edit" title="Edit component" onClick={() => setEditing(row)}><Edit className="h-4 w-4" /></RowActionButton><RowActionButton intent={row.is_active ? "disable" : "enable"} size="sm" title={row.is_active ? "Disable" : "Enable"} onClick={() => void toggle(row)}>{row.is_active ? "Disable" : "Enable"}</RowActionButton></> : null}</div></TableCell></TableRow>)}</TableBody>
    {editing ? <ComponentModal value={editing} onChange={setEditing} onClose={() => setEditing(null)} onSave={() => void save()} /> : null}
  </PayrollTablePageLayout>;
}

function ComponentModal({ value, onChange, onClose, onSave }: { value: Partial<PayrollComponent>; onChange: (value: Partial<PayrollComponent>) => void; onClose: () => void; onSave: () => void }) {
  return <Modal title={value.id ? "Edit component" : "Create component"} onClose={onClose} onSave={onSave}><div className="grid gap-3 md:grid-cols-2"><Field label="Code"><Input value={value.code ?? ""} onChange={(event) => onChange({ ...value, code: event.target.value })} /></Field><Field label="Name"><Input value={value.name ?? ""} onChange={(event) => onChange({ ...value, name: event.target.value })} /></Field><Field label="Type"><SelectField className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={value.type ?? "ALLOWANCE"} onChange={(event) => onChange({ ...value, type: event.target.value as PayrollComponent["type"] })}>{["BASIC_SALARY", "ALLOWANCE", "FIXED_DEDUCTION", "VARIABLE_DEDUCTION", "ATTENDANCE_DEDUCTION", "LEAVE_DEDUCTION", "ADVANCE_DEDUCTION", "ONE_TIME_DEDUCTION", "OVERTIME_PLACEHOLDER", "BENEFIT_PLACEHOLDER", "ADJUSTMENT", "EARNING", "DEDUCTION"].map((item) => <option key={item} value={item}>{item}</option>)}</SelectField></Field><Field label="Category"><SelectField className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={value.category ?? ""} onChange={(event) => onChange({ ...value, category: event.target.value || null })}><option value="">None</option>{["BASIC", "ALLOWANCE", "BENEFIT", "OVERTIME", "ADVANCE", "ATTENDANCE", "LEAVE", "OTHER", "SALARY", "DEDUCTION", "ADJUSTMENT"].map((item) => <option key={item} value={item}>{item}</option>)}</SelectField></Field><Field label="Calculation type"><SelectField className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={value.calculation_type ?? "FIXED_AMOUNT"} onChange={(event) => onChange({ ...value, calculation_type: event.target.value as PayrollComponent["calculation_type"] })}>{["FIXED_AMOUNT", "PERCENTAGE_OF_BASIC", "PERCENTAGE_OF_GROSS", "DAILY_RATE", "HOURLY_RATE", "FORMULA_PLACEHOLDER", "MANUAL", "FIXED", "VARIABLE", "PERCENTAGE"].map((item) => <option key={item} value={item}>{item}</option>)}</SelectField></Field><Field label="Default amount"><Input type="number" value={value.default_amount ?? ""} onChange={(event) => onChange({ ...value, default_amount: event.target.value ? Number(event.target.value) : null })} /></Field><Field label="Default percentage"><Input type="number" value={value.default_percentage ?? ""} onChange={(event) => onChange({ ...value, default_percentage: event.target.value ? Number(event.target.value) : null })} /></Field><Field label="Sort order"><Input type="number" value={value.sort_order ?? 100} onChange={(event) => onChange({ ...value, sort_order: Number(event.target.value) })} /></Field><Toggle label="Applies to basic salary" checked={Boolean(value.applies_to_basic_salary)} onChange={(applies_to_basic_salary) => onChange({ ...value, applies_to_basic_salary })} /><Toggle label="Taxable" checked={Boolean(value.is_taxable)} onChange={(is_taxable) => onChange({ ...value, is_taxable })} /><Toggle label="Active" checked={Boolean(value.is_active)} onChange={(is_active) => onChange({ ...value, is_active })} /></div></Modal>;
}

export function PayrollDeductionsPage() {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("payroll.view");
  const canManage = permissions.has("payroll.manage") || permissions.has("payroll.adjustments.manage");
  const [rows, setRows] = useState<PayrollDeduction[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [components, setComponents] = useState<PayrollComponent[]>([]);
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [jobLevels, setJobLevels] = useState<OrganizationJobLevel[]>([]);
  const [positions, setPositions] = useState<OrganizationPosition[]>([]);
  const [editing, setEditing] = useState<Partial<PayrollDeduction> | null>(null);
  const [search, setSearch] = useState(""); const [departmentId, setDepartmentId] = useState(""); const [locationId, setLocationId] = useState(""); const [jobLevelId, setJobLevelId] = useState(""); const [positionId, setPositionId] = useState(""); const [status, setStatus] = useState(""); const [type, setType] = useState("");
  const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(true);
  const [rowAction, setRowAction] = useState<{ row: PayrollDeduction; name: "enable" | "disable" | "cancel" } | null>(null);
  const [actionReason, setActionReason] = useState("");
  const filters = useMemo(() => ({ search, department_id: departmentId, location_id: locationId, status, deduction_type: type }), [search, departmentId, locationId, status, type]);
  async function load() { if (!token || !canView) return; setLoading(true); setError(null); try { const [result, refs, comps] = await Promise.all([api.listPayrollDeductions(token, filters), loadReferenceData(token), api.listPayrollComponents(token)]); setRows(result.deductions); setEmployees(refs.employees); setDepartments(refs.departments); setLocations(refs.locations); setJobLevels(refs.jobLevels); setPositions(refs.positions); setPeriods(refs.periods); setComponents(comps.components.filter((component) => String(component.type).includes("DEDUCTION") || component.type === "DEDUCTION")); } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to load deductions."); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, [token, canView, filters]);
  async function save() { if (!token || !editing) return; try { if (editing.id) await api.updatePayrollDeduction(token, editing.id, editing); else await api.createPayrollDeduction(token, editing); setEditing(null); await load(); } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to save deduction."); } }
  async function confirmAction() { if (!token || !rowAction) return; if (rowAction.name === "cancel" && !actionReason.trim()) { setError("Cancellation reason is required."); return; } try { await api.payrollDeductionAction(token, rowAction.row.id, rowAction.name, rowAction.name === "cancel" ? actionReason.trim() : undefined); setRowAction(null); setActionReason(""); await load(); } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to update deduction."); } }
  const chips = useMemo<ActiveFilterChip[]>(() => [
    ...(search ? [{ key: "search", label: "Search", value: search, onRemove: () => setSearch("") }] : []),
    ...(status ? [{ key: "status", label: "Status", value: status.replace(/_/g, " "), title: status, onRemove: () => setStatus("") }] : []),
    ...(type ? [{ key: "type", label: "Type", value: type.replace(/_/g, " "), title: type, onRemove: () => setType("") }] : []),
    ...payrollOrgFilterChips({ departments, locations, jobLevels, positions, departmentId, locationId, jobLevelId, positionId, setDepartmentId, setLocationId, setJobLevelId, setPositionId })
  ], [departmentId, departments, jobLevelId, jobLevels, locationId, locations, positionId, positions, search, status, type]);
  if (!canView) return <Panel><EmptyState title="Deductions unavailable" description="Your account needs payroll.view permission." /></Panel>;
  return <PayrollTablePageLayout title="Payroll Deductions" description="Manage fixed, variable, one-time, and recurring deductions." error={error} loading={loading} empty={rows.length === 0} emptyTitle="No deductions" chips={chips} onReset={() => { setSearch(""); setDepartmentId(""); setLocationId(""); setJobLevelId(""); setPositionId(""); setStatus(""); setType(""); }} filters={<><SearchInput value={search} onChange={setSearch} /><StandardSelectFilter value={status} onValueChange={setStatus} allLabel="All statuses" width="status" options={["ACTIVE", "INACTIVE", "APPLIED", "CANCELLED"].map((item) => ({ value: item, label: item.replace(/_/g, " ") }))} /><StandardSelectFilter value={type} onValueChange={setType} allLabel="All types" width="status" options={["FIXED", "VARIABLE", "ONE_TIME", "RECURRING"].map((item) => ({ value: item, label: item.replace(/_/g, " ") }))} /><MoreFiltersSheet title="Deduction filters" onReset={() => { setDepartmentId(""); setLocationId(""); setJobLevelId(""); setPositionId(""); }}><FilterSection title="Organization"><PayrollOrgFilter departments={departments} locations={locations} jobLevels={jobLevels} positions={positions} departmentId={departmentId} locationId={locationId} jobLevelId={jobLevelId} positionId={positionId} onChange={(next) => { setDepartmentId(next.departmentId); setLocationId(next.locationId); setJobLevelId(next.jobLevelId); setPositionId(next.positionId); }} /></FilterSection></MoreFiltersSheet></>} exportRows={rows as unknown as Record<string, unknown>[]} exportColumns={["employee_no", "employee_name", "component_name", "deduction_type", "amount", "start_date", "end_date", "status", "reason"]} action={canManage ? <Button size="sm" onClick={() => setEditing({ deduction_type: "ONE_TIME", status: "ACTIVE" })}><Plus className="h-4 w-4" /> Create deduction</Button> : null}>
    <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Component</TableHead><TableHead>Type</TableHead><TableHead>Amount</TableHead><TableHead>Period</TableHead><TableHead>Status</TableHead><TableHead>Reason</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
    <TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell><EmployeeIdentityCell employeeId={row.employee_id} employeeName={row.employee_name} employeeNumber={row.employee_no} size="sm" /></TableCell><TableCell>{row.component_name ?? row.payroll_component_id ?? "-"}</TableCell><TableCell>{row.deduction_type}</TableCell><TableCell>{money(row.amount)}</TableCell><TableCell>{row.start_date ?? "-"} to {row.end_date ?? "-"}</TableCell><TableCell><StatusBadge value={row.status} /></TableCell><TableCell>{row.reason}</TableCell><TableCell><div className="flex justify-end gap-1">{canManage ? <><RowActionButton intent="edit" title="Edit deduction" onClick={() => setEditing(row)}><Edit className="h-4 w-4" /></RowActionButton><RowActionButton intent={row.status === "ACTIVE" ? "disable" : "enable"} size="sm" title={row.status === "ACTIVE" ? "Disable" : "Enable"} onClick={() => setRowAction({ row, name: row.status === "ACTIVE" ? "disable" : "enable" })}>{row.status === "ACTIVE" ? "Disable" : "Enable"}</RowActionButton><RowActionButton intent="delete" size="sm" title="Cancel deduction" onClick={() => { setActionReason(""); setRowAction({ row, name: "cancel" }); }}>Cancel</RowActionButton></> : null}</div></TableCell></TableRow>)}</TableBody>
    {editing ? <DeductionModal value={editing} employees={employees} departments={departments} locations={locations} jobLevels={jobLevels} positions={positions} components={components} periods={periods} onChange={setEditing} onClose={() => setEditing(null)} onSave={() => void save()} /> : null}
    {rowAction ? <ActionModal title={`${rowAction.name[0].toUpperCase()}${rowAction.name.slice(1)} deduction`} description={rowAction.name === "cancel" ? "Cancelling a deduction requires a reason." : "Confirm this deduction status change."} reason={actionReason} reasonRequired={rowAction.name === "cancel"} onReason={rowAction.name === "cancel" ? setActionReason : undefined} onClose={() => { setRowAction(null); setActionReason(""); }} onConfirm={() => void confirmAction()} /> : null}
  </PayrollTablePageLayout>;
}

function DeductionModal({ value, employees, departments, locations, jobLevels, positions, components, periods, onChange, onClose, onSave }: { value: Partial<PayrollDeduction>; employees: Employee[]; departments: OrganizationDepartment[]; locations: OrganizationLocation[]; jobLevels: OrganizationJobLevel[]; positions: OrganizationPosition[]; components: PayrollComponent[]; periods: PayrollPeriod[]; onChange: (value: Partial<PayrollDeduction>) => void; onClose: () => void; onSave: () => void }) {
  return <Modal title={value.id ? "Edit deduction" : "Create deduction"} onClose={onClose} onSave={onSave}><div className="grid gap-3 md:grid-cols-2"><div className="md:col-span-2"><EmployeeSelect employees={employees} departments={departments} locations={locations} jobLevels={jobLevels} positions={positions} value={value.employee_id} onChange={(employee_id) => onChange({ ...value, employee_id })} /></div><Field label="Component"><SelectField className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={value.payroll_component_id ?? ""} onChange={(event) => onChange({ ...value, payroll_component_id: event.target.value || null })}><option value="">No component</option>{components.map((component) => <option key={component.id} value={component.id}>{component.code} - {component.name}</option>)}</SelectField></Field><Field label="Deduction type"><SelectField className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={value.deduction_type ?? "ONE_TIME"} onChange={(event) => onChange({ ...value, deduction_type: event.target.value as PayrollDeduction["deduction_type"] })}>{["FIXED", "VARIABLE", "ONE_TIME", "RECURRING"].map((item) => <option key={item} value={item}>{item}</option>)}</SelectField></Field><Field label="Amount"><Input type="number" value={value.amount ?? ""} onChange={(event) => onChange({ ...value, amount: Number(event.target.value) })} /></Field><Field label="Start date"><Input type="date" value={value.start_date ?? ""} onChange={(event) => onChange({ ...value, start_date: event.target.value || null })} /></Field><Field label="End date"><Input type="date" value={value.end_date ?? ""} onChange={(event) => onChange({ ...value, end_date: event.target.value || null })} /></Field><Field label="Payroll period"><PeriodSelect periods={periods} value={value.payroll_period_id} onChange={(payroll_period_id) => onChange({ ...value, payroll_period_id })} /></Field><Field label="Reason"><Input value={value.reason ?? ""} onChange={(event) => onChange({ ...value, reason: event.target.value })} /></Field></div></Modal>;
}

export function PayrollAdjustmentsPage() {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("payroll.view");
  const canManage = permissions.has("payroll.adjustments.manage");
  const canApprove = permissions.has("payroll.adjustments.approve_placeholder") || permissions.has("payroll.adjustments.manage");
  const [rows, setRows] = useState<PayrollAdjustment[]>([]); const [employees, setEmployees] = useState<Employee[]>([]); const [departments, setDepartments] = useState<OrganizationDepartment[]>([]); const [locations, setLocations] = useState<OrganizationLocation[]>([]); const [jobLevels, setJobLevels] = useState<OrganizationJobLevel[]>([]); const [positions, setPositions] = useState<OrganizationPosition[]>([]); const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [editing, setEditing] = useState<Partial<PayrollAdjustment> | null>(null); const [search, setSearch] = useState(""); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(true);
  const [rowAction, setRowAction] = useState<{ row: PayrollAdjustment; name: "approve" | "cancel" } | null>(null); const [actionReason, setActionReason] = useState("");
  async function load() { if (!token || !canView) return; setLoading(true); setError(null); try { const [result, refs] = await Promise.all([api.listPayrollAdjustments(token, { search }), loadReferenceData(token)]); setRows(result.adjustments); setEmployees(refs.employees); setDepartments(refs.departments); setLocations(refs.locations); setJobLevels(refs.jobLevels); setPositions(refs.positions); setPeriods(refs.periods); } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to load adjustments."); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, [token, canView, search]);
  async function save() { if (!token || !editing) return; try { if (editing.id) await api.updatePayrollAdjustment(token, editing.id, editing); else await api.createPayrollAdjustment(token, editing); setEditing(null); await load(); } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to save adjustment."); } }
  async function confirmAction() { if (!token || !rowAction) return; if (rowAction.name === "cancel" && !actionReason.trim()) { setError("Cancellation reason is required."); return; } try { if (rowAction.name === "approve") await api.approvePayrollAdjustment(token, rowAction.row.id); if (rowAction.name === "cancel") await api.cancelPayrollAdjustment(token, rowAction.row.id, actionReason.trim()); setRowAction(null); setActionReason(""); await load(); } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to update adjustment."); } }
  const chips = useMemo<ActiveFilterChip[]>(() => search ? [{ key: "search", label: "Search", value: search, onRemove: () => setSearch("") }] : [], [search]);
  if (!canView) return <Panel><EmptyState title="Adjustments unavailable" description="Your account needs payroll.view permission." /></Panel>;
  return <PayrollTablePageLayout title="Payroll Adjustments" description="Manage manual earning and deduction adjustments." error={error} loading={loading} empty={rows.length === 0} emptyTitle="No adjustments" chips={chips} onReset={() => setSearch("")} filters={<SearchInput value={search} onChange={setSearch} />} exportRows={rows as unknown as Record<string, unknown>[]} exportColumns={["employee_no", "employee_name", "payroll_period_id", "adjustment_type", "amount", "status", "reason"]} action={canManage ? <Button size="sm" onClick={() => setEditing({ adjustment_type: "EARNING", status: "DRAFT" })}><Plus className="h-4 w-4" /> Create adjustment</Button> : null}>
    <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Period</TableHead><TableHead>Type</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Reason</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
    <TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell><EmployeeIdentityCell employeeId={row.employee_id} employeeName={row.employee_name} employeeNumber={row.employee_no} size="sm" /></TableCell><TableCell>{row.payroll_period_id ?? "-"}</TableCell><TableCell>{row.adjustment_type}</TableCell><TableCell>{money(row.amount)}</TableCell><TableCell><StatusBadge value={row.status === "APPROVED" ? "APPROVED_PLACEHOLDER" : row.status} /></TableCell><TableCell>{row.reason}</TableCell><TableCell><div className="flex justify-end gap-1">{canManage ? <RowActionButton intent="edit" title="Edit adjustment" onClick={() => setEditing(row)}><Edit className="h-4 w-4" /></RowActionButton> : null}{canApprove ? <RowActionButton intent="approve" size="sm" title="Approve" onClick={() => setRowAction({ row, name: "approve" })}>Approve</RowActionButton> : null}{canManage ? <Button variant="ghost" size="sm" onClick={() => { setActionReason(""); setRowAction({ row, name: "cancel" }); }}>Cancel</Button> : null}</div></TableCell></TableRow>)}</TableBody>
    {editing ? <AdjustmentModal value={editing} employees={employees} departments={departments} locations={locations} jobLevels={jobLevels} positions={positions} periods={periods} onChange={setEditing} onClose={() => setEditing(null)} onSave={() => void save()} /> : null}
    {rowAction ? <ActionModal title={rowAction.name === "approve" ? "Approve adjustment placeholder" : "Cancel adjustment"} description={rowAction.name === "approve" ? "Approve this adjustment as a Payroll Core placeholder." : "Cancelling an adjustment requires a reason."} reason={actionReason} reasonRequired={rowAction.name === "cancel"} onReason={rowAction.name === "cancel" ? setActionReason : undefined} onClose={() => { setRowAction(null); setActionReason(""); }} onConfirm={() => void confirmAction()} /> : null}
  </PayrollTablePageLayout>;
}

function AdjustmentModal({ value, employees, departments, locations, jobLevels, positions, periods, onChange, onClose, onSave }: { value: Partial<PayrollAdjustment>; employees: Employee[]; departments: OrganizationDepartment[]; locations: OrganizationLocation[]; jobLevels: OrganizationJobLevel[]; positions: OrganizationPosition[]; periods: PayrollPeriod[]; onChange: (value: Partial<PayrollAdjustment>) => void; onClose: () => void; onSave: () => void }) {
  return <Modal title={value.id ? "Edit adjustment" : "Create adjustment"} onClose={onClose} onSave={onSave}><div className="grid gap-3 md:grid-cols-2"><div className="md:col-span-2"><EmployeeSelect employees={employees} departments={departments} locations={locations} jobLevels={jobLevels} positions={positions} value={value.employee_id} onChange={(employee_id) => onChange({ ...value, employee_id })} /></div><Field label="Payroll period"><PeriodSelect periods={periods} value={value.payroll_period_id} onChange={(payroll_period_id) => onChange({ ...value, payroll_period_id })} /></Field><Field label="Adjustment type"><SelectField className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={value.adjustment_type ?? "EARNING"} onChange={(event) => onChange({ ...value, adjustment_type: event.target.value as PayrollAdjustment["adjustment_type"] })}><option value="EARNING">Earning</option><option value="DEDUCTION">Deduction</option></SelectField></Field><Field label="Amount"><Input type="number" value={value.amount ?? ""} onChange={(event) => onChange({ ...value, amount: Number(event.target.value) })} /></Field><Field label="Reason"><Input value={value.reason ?? ""} onChange={(event) => onChange({ ...value, reason: event.target.value })} /></Field></div></Modal>;
}

export function PayrollFinalSettlementsPage() {
  const { user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("payroll.view");
  if (!canView) return <Panel><EmptyState title="Final settlements unavailable" description="Your account needs payroll.view permission." /></Panel>;
  return <div className="space-y-4">
    <PayrollPageHeader title="Final Settlements" description="Final settlement will be implemented in a later phase." />
    <Panel className="p-6">
      <EmptyState title="Final settlement is not available in Payroll Core" description="Create, edit, approval, and payment settlement workflows are intentionally disabled for Prompt 10 and will be added in a later phase." />
    </Panel>
  </div>;
}

export function PayrollSettingsPage() {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("payroll.settings.view") || permissions.has("payroll.settings.manage") || permissions.has("payroll.submodules.view") || permissions.has("payroll.submodules.manage") || permissions.has("payroll.custom_deduction_settings.view") || permissions.has("payroll.custom_deduction_settings.manage") || permissions.has("payroll.view");
  const canManageSettings = permissions.has("payroll.settings.manage") || permissions.has("payroll.custom_deduction_settings.update") || permissions.has("payroll.custom_deduction_settings.manage");
  const canManageSubmodules = permissions.has("payroll.submodules.update") || permissions.has("payroll.submodules.manage") || permissions.has("payroll.settings.manage");
  const [settings, setSettings] = useState<PayrollSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { async function load() { if (!token || !canView) return; try { setSettings((await api.getPayrollSettings(token)).settings); } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to load payroll settings."); } } void load(); }, [token, canView]);
  function update<K extends keyof PayrollSettings>(key: K, value: PayrollSettings[K]) { if (settings) setSettings({ ...settings, [key]: value }); }
  async function save() { if (!token || !settings) return; try { setSettings((await api.updatePayrollSettings(token, settings)).settings); setMessage("Payroll settings saved."); } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to save payroll settings."); } }
  async function togglePayrollModule(enabled: boolean) { if (!token || !settings) return; try { setSettings((await api.updatePayrollSettings(token, { ...settings, module_enabled: enabled })).settings); setMessage(enabled ? "Payroll module enabled." : "Payroll module disabled."); } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to update payroll module status."); } }
  async function togglePayrollSubmodule(key: PayrollSubmoduleSettingKey, enabled: boolean) {
    if (!token || !settings) return;
    try {
      setSettings((await api.updatePayrollSettings(token, { ...settings, [key]: enabled })).settings);
      const label = payrollSubmoduleCards.find((item) => item.key === key)?.name ?? "Payroll submodule";
      setMessage(`${label} ${enabled ? "enabled" : "disabled"}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update payroll submodule status.");
    }
  }
  if (!canView) return <Panel><EmptyState title="Payroll settings unavailable" description="Your account needs payroll settings permission." /></Panel>;
  const moduleEnabled = Boolean(settings?.module_enabled ?? true);
  return <div className="space-y-4">
    <PayrollPageHeader title="Payroll Settings" description="General payroll, bank-loan, pension, payment, and deduction-priority controls.">{canManageSettings ? <Button size="sm" disabled={!moduleEnabled} onClick={() => void save()}>Save settings</Button> : null}</PayrollPageHeader>
    <ErrorMessage error={error} />
    {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}
    {settings ? (
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-950">Payroll module controls moved</h2>
          <p className="text-sm text-muted-foreground">Main payroll and payroll submodule enablement is managed from the main Settings page.</p>
        </div>
        <Panel className="p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-sm font-semibold">Final settlement status</h3>
              <p className="text-sm text-muted-foreground">Exit Payroll / Final Settlement is controlled by final settlement settings and workflow rules, not duplicated here.</p>
            </div>
            <Badge tone="neutral">Managed separately</Badge>
          </div>
        </Panel>
      </section>
    ) : null}
    <Panel className="p-4">
      {!settings ? <EmptyState title="Loading payroll settings" description="Fetching payroll configuration." /> : <ModuleSettingsBody disabled={!moduleEnabled}><div className="space-y-5">
        <SettingsSection title="General Payroll" description="Base calculation and module switches.">
          <Field label="Default currency"><Input disabled={!canManageSettings} value={settings.default_currency} onChange={(event) => update("default_currency", event.target.value)} /></Field>
          <Field label="Daily rate mode"><SelectField disabled={!canManageSettings} className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={settings.default_daily_rate_mode} onChange={(event) => update("default_daily_rate_mode", event.target.value as PayrollSettings["default_daily_rate_mode"])}><option value="CALENDAR_DAYS">Calendar days</option><option value="WORKING_DAYS">Working days</option><option value="FIXED_30_DAYS">Fixed 30 days</option></SelectField></Field>
          <Field label="Payment day"><Input disabled={!canManageSettings} type="number" min={1} max={31} value={settings.default_salary_payment_day ?? ""} onChange={(event) => update("default_salary_payment_day", event.target.value ? Number(event.target.value) : null)} /></Field>
          <Toggle disabled={!canManageSettings} label="Allow negative net salary" checked={Boolean(settings.allow_negative_net_salary)} onChange={(value) => update("allow_negative_net_salary", value)} />
          <Toggle disabled={!canManageSettings} label="Require approval before paid" checked={Boolean(settings.require_approval_before_paid)} onChange={(value) => update("require_approval_before_paid", value)} />
          <Toggle disabled={!canManageSettings} label="Include attendance deductions" checked={Boolean(settings.include_attendance_deductions)} onChange={(value) => update("include_attendance_deductions", value)} />
          <Toggle disabled={!canManageSettings} label="Include leave deductions" checked={Boolean(settings.include_leave_deductions)} onChange={(value) => update("include_leave_deductions", value)} />
          <Toggle disabled={!canManageSettings || !Boolean(settings.employee_advances_enabled ?? true)} label="Include advance deductions" checked={Boolean(settings.include_advance_deductions)} onChange={(value) => update("include_advance_deductions", value)} />
          <Toggle disabled={!canManageSettings} label="Include roster scheduled days" checked={Boolean(settings.include_roster_scheduled_days)} onChange={(value) => update("include_roster_scheduled_days", value)} />
        </SettingsSection>

        <SubmoduleSettingsSection enabled={Boolean(settings.bank_loan_deductions_enabled ?? true)} name="Bank Loan Deductions">
        <SettingsSection title="Bank Loan Deductions" description="Salary-deduction behavior for bank loans and cash-salary eligibility.">
          <Toggle disabled label="Enable bank loan deductions" checked={Boolean(settings.bank_loan_deductions_enabled ?? true)} onChange={() => undefined} />
          <Toggle disabled={!canManageSettings} label="Allow multiple bank loans per employee" checked={Boolean(settings.allow_multiple_bank_loans_per_employee ?? true)} onChange={(value) => update("allow_multiple_bank_loans_per_employee", value)} />
          <Toggle disabled={!canManageSettings} label="Require loan approval before deduction" checked={Boolean(settings.require_loan_approval_before_payroll_deduction ?? true)} onChange={(value) => update("require_loan_approval_before_payroll_deduction", value)} />
          <Toggle disabled={!canManageSettings} label="Allow partial loan deduction" checked={Boolean(settings.allow_partial_loan_deduction ?? true)} onChange={(value) => update("allow_partial_loan_deduction", value)} />
          <Toggle disabled={!canManageSettings} label="Block payroll if loan exceeds net salary" checked={Boolean(settings.block_payroll_if_loan_exceeds_net_salary)} onChange={(value) => update("block_payroll_if_loan_exceeds_net_salary", value)} />
          <Field label="Insufficient salary mode"><SelectField disabled={!canManageSettings} className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={settings.bank_loan_insufficient_salary_mode ?? "REQUIRE_OVERRIDE"} onChange={(event) => update("bank_loan_insufficient_salary_mode", event.target.value)}>{["WARN_ONLY", "PARTIAL_DEDUCTION", "SKIP_AND_MARK_FAILED", "BLOCK_PAYROLL", "REQUIRE_OVERRIDE"].map((item) => <option key={item} value={item}>{item}</option>)}</SelectField></Field>
          <Toggle disabled={!canManageSettings} label="Enable minimum net salary protection" checked={Boolean(settings.bank_loan_minimum_net_salary_protection_enabled)} onChange={(value) => update("bank_loan_minimum_net_salary_protection_enabled", value)} />
          <Field label="Minimum net threshold type"><SelectField disabled={!canManageSettings} className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={settings.bank_loan_minimum_net_salary_threshold_type ?? "FIXED_AMOUNT"} onChange={(event) => update("bank_loan_minimum_net_salary_threshold_type", event.target.value)}><option value="FIXED_AMOUNT">Fixed amount</option><option value="PERCENTAGE_OF_NET_SALARY">Percentage of net salary</option></SelectField></Field>
          <Field label="Minimum net threshold %"><Input disabled={!canManageSettings} type="number" min={0} step="0.01" value={settings.bank_loan_minimum_net_salary_threshold_percentage ?? 0} onChange={(event) => update("bank_loan_minimum_net_salary_threshold_percentage", Number(event.target.value))} /></Field>
          <Field label="Minimum net threshold amount"><Input disabled={!canManageSettings} type="number" min={0} step="0.01" value={settings.bank_loan_minimum_net_salary_threshold_amount ?? 0} onChange={(event) => update("bank_loan_minimum_net_salary_threshold_amount", Number(event.target.value))} /></Field>
          <Toggle disabled={!canManageSettings} label="Skip loan if below threshold" checked={Boolean(settings.bank_loan_skip_if_below_threshold_enabled ?? true)} onChange={(value) => update("bank_loan_skip_if_below_threshold_enabled", value)} />
          <Toggle disabled={!canManageSettings} label="Require bank notification on skip" checked={Boolean(settings.bank_loan_bank_notification_required_on_skip ?? true)} onChange={(value) => update("bank_loan_bank_notification_required_on_skip", value)} />
          <Toggle disabled={!canManageSettings} label="Enable direct collection status" checked={Boolean(settings.bank_loan_employee_direct_collection_status_enabled ?? true)} onChange={(value) => update("bank_loan_employee_direct_collection_status_enabled", value)} />
          <Field label="Loan deduction priority"><Input disabled={!canManageSettings} type="number" min={0} value={settings.loan_deduction_priority ?? 2} onChange={(event) => update("loan_deduction_priority", Number(event.target.value))} /></Field>
          <Field label="Minimum statement months"><Input disabled={!canManageSettings} type="number" min={0} value={settings.bank_loan_statement_months_required_min ?? 6} onChange={(event) => update("bank_loan_statement_months_required_min", Number(event.target.value))} /></Field>
          <Field label="Default statement months"><Input disabled={!canManageSettings} type="number" min={0} value={settings.bank_loan_statement_months_required_default ?? 12} onChange={(event) => update("bank_loan_statement_months_required_default", Number(event.target.value))} /></Field>
          <Field label="Default salary slips months"><Input disabled={!canManageSettings} type="number" min={0} value={settings.bank_loan_salary_slips_months_required_default ?? 6} onChange={(event) => update("bank_loan_salary_slips_months_required_default", Number(event.target.value))} /></Field>
          <Toggle disabled={!canManageSettings} label="Show loan details in self-service" checked={Boolean(settings.show_loan_details_in_self_service ?? true)} onChange={(value) => update("show_loan_details_in_self_service", value)} />
          <Toggle disabled={!canManageSettings} label="Show loan details on payslip" checked={Boolean(settings.show_loan_details_on_payslip ?? true)} onChange={(value) => update("show_loan_details_on_payslip", value)} />
          <Toggle disabled={!canManageSettings} label="Require bank salary route by default" checked={Boolean(settings.bank_loan_requires_bank_salary_route_default ?? true)} onChange={(value) => update("bank_loan_requires_bank_salary_route_default", value)} />
          <Toggle disabled={!canManageSettings} label="Cash salary default ineligible" checked={Boolean(settings.bank_loan_cash_salary_default_ineligible ?? true)} onChange={(value) => update("bank_loan_cash_salary_default_ineligible", value)} />
          <Toggle disabled={!canManageSettings} label="Allow cash employee override" checked={Boolean(settings.bank_loan_allow_cash_employee_override ?? true)} onChange={(value) => update("bank_loan_allow_cash_employee_override", value)} />
          <Toggle disabled={!canManageSettings} label="Override requires reason" checked={Boolean(settings.bank_loan_override_requires_reason ?? true)} onChange={(value) => update("bank_loan_override_requires_reason", value)} />
          <Toggle disabled={!canManageSettings} label="Override requires document" checked={Boolean(settings.bank_loan_override_requires_document ?? true)} onChange={(value) => update("bank_loan_override_requires_document", value)} />
        </SettingsSection>
        </SubmoduleSettingsSection>

        <SubmoduleSettingsSection enabled={Boolean(settings.custom_deductions_enabled ?? true)} name="Custom Deductions">
        <SettingsSection title="Custom Deduction Settings" description="Employer-defined payroll deductions after pension and bank loan priorities, with payslip, self-service, and shortfall controls.">
          <Toggle disabled label="Enable custom deductions" checked={Boolean(settings.custom_deductions_enabled ?? true)} onChange={() => undefined} />
          <Toggle disabled={!canManageSettings} label="Require approval before payroll deduction" checked={Boolean(settings.require_custom_deduction_approval ?? true)} onChange={(value) => update("require_custom_deduction_approval", value)} />
          <Toggle disabled={!canManageSettings} label="Show on payslip by default" checked={Boolean(settings.custom_deduction_show_on_payslip_default ?? true)} onChange={(value) => update("custom_deduction_show_on_payslip_default", value)} />
          <Toggle disabled={!canManageSettings} label="Show in self-service by default" checked={Boolean(settings.custom_deduction_show_in_self_service_default ?? true)} onChange={(value) => update("custom_deduction_show_in_self_service_default", value)} />
          <Toggle disabled={!canManageSettings} label="Include in final settlement by default" checked={Boolean(settings.custom_deduction_include_in_final_settlement_default ?? true)} onChange={(value) => update("custom_deduction_include_in_final_settlement_default", value)} />
          <Toggle disabled={!canManageSettings} label="Allow partial deduction" checked={Boolean(settings.custom_deduction_allow_partial_deduction ?? true)} onChange={(value) => update("custom_deduction_allow_partial_deduction", value)} />
          <Toggle disabled={!canManageSettings} label="Carry forward shortfalls" checked={Boolean(settings.custom_deduction_shortfall_carry_forward_enabled)} onChange={(value) => update("custom_deduction_shortfall_carry_forward_enabled", value)} />
          <Toggle disabled={!canManageSettings} label="Reason required for cancel" checked={Boolean(settings.custom_deduction_require_reason_for_cancel ?? true)} onChange={(value) => update("custom_deduction_require_reason_for_cancel", value)} />
          <Toggle disabled={!canManageSettings} label="Require document for sensitive categories" checked={Boolean(settings.custom_deduction_require_document_for_sensitive_categories)} onChange={(value) => update("custom_deduction_require_document_for_sensitive_categories", value)} />
          <Field label="Insufficient salary mode"><SelectField disabled={!canManageSettings} className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={settings.custom_deduction_insufficient_salary_mode ?? "WARN_ONLY"} onChange={(event) => update("custom_deduction_insufficient_salary_mode", event.target.value)}>{["WARN_ONLY", "PARTIAL_DEDUCTION", "SKIP_AND_MARK_FAILED", "BLOCK_PAYROLL", "REQUIRE_OVERRIDE"].map((item) => <option key={item} value={item}>{item}</option>)}</SelectField></Field>
          <Field label="Default priority"><Input disabled={!canManageSettings} type="number" min={0} value={settings.custom_deduction_priority_default ?? 3} onChange={(event) => update("custom_deduction_priority_default", Number(event.target.value))} /></Field>
        </SettingsSection>
        </SubmoduleSettingsSection>

        <SubmoduleSettingsSection enabled={Boolean(settings.pension_enabled ?? true)} name="Pension">
        <SettingsSection title="Pension Settings" description="Automatic employee deductions and employer company-cost contributions.">
          <Toggle disabled label="Enable pension" checked={Boolean(settings.pension_enabled ?? true)} onChange={() => undefined} />
          <Toggle disabled={!canManageSettings} label="Auto-calculate pension" checked={Boolean(settings.pension_auto_calculation_enabled ?? true)} onChange={(value) => update("pension_auto_calculation_enabled", value)} />
          <Field label="Default pension scheme id"><Input disabled={!canManageSettings} value={settings.default_pension_scheme_id ?? ""} onChange={(event) => update("default_pension_scheme_id", event.target.value || null)} /></Field>
          <Field label="Employee contribution %"><Input disabled={!canManageSettings} type="number" min={0} step="0.01" value={settings.pension_employee_contribution_default_percent ?? 7} onChange={(event) => update("pension_employee_contribution_default_percent", Number(event.target.value))} /></Field>
          <Field label="Employer contribution %"><Input disabled={!canManageSettings} type="number" min={0} step="0.01" value={settings.pension_employer_contribution_default_percent ?? 7} onChange={(event) => update("pension_employer_contribution_default_percent", Number(event.target.value))} /></Field>
          <Field label="Pension basis"><SelectField disabled={!canManageSettings} className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={settings.pension_basis_default ?? "BASIC_SALARY_ONLY"} onChange={(event) => update("pension_basis_default", event.target.value)}><option value="BASIC_SALARY_ONLY">Basic salary only</option><option value="GROSS_SALARY">Gross salary</option><option value="CUSTOM_FORMULA_PLACEHOLDER">Custom formula placeholder</option></SelectField></Field>
          <Toggle disabled={!canManageSettings} label="Show pension on payslip" checked={Boolean(settings.pension_show_on_payslip ?? true)} onChange={(value) => update("pension_show_on_payslip", value)} />
          <Toggle disabled={!canManageSettings} label="Show pension in self-service" checked={Boolean(settings.pension_show_in_self_service ?? true)} onChange={(value) => update("pension_show_in_self_service", value)} />
          <Toggle disabled={!canManageSettings} label="Enable pension remittance" checked={Boolean(settings.pension_remittance_enabled ?? true)} onChange={(value) => update("pension_remittance_enabled", value)} />
          <Toggle disabled={!canManageSettings} label="Employer can pay employee share" checked={Boolean(settings.pension_employer_can_pay_employee_share ?? true)} onChange={(value) => update("pension_employer_can_pay_employee_share", value)} />
          <Toggle disabled={!canManageSettings} label="Foreign employee pension default enabled" checked={Boolean(settings.foreign_employee_pension_default_enabled)} onChange={(value) => update("foreign_employee_pension_default_enabled", value)} />
          <Toggle disabled={!canManageSettings} label="Foreign voluntary enrollment enabled" checked={Boolean(settings.foreign_employee_voluntary_enrollment_enabled ?? true)} onChange={(value) => update("foreign_employee_voluntary_enrollment_enabled", value)} />
        </SettingsSection>
        </SubmoduleSettingsSection>

        <SubmoduleSettingsSection enabled={Boolean(settings.payment_methods_enabled ?? true)} name="Employee Payment Methods">
        <SettingsSection title="Payment/Cash Salary Settings" description="Cash salary acknowledgement foundation for Payroll Core.">
          <Toggle disabled={!canManageSettings} label="Enable cash salary acknowledgement" checked={Boolean(settings.cash_salary_acknowledgement_enabled)} onChange={(value) => update("cash_salary_acknowledgement_enabled", value)} />
          <Toggle disabled={!canManageSettings} label="Require acknowledgement before finalize" checked={Boolean(settings.cash_salary_acknowledgement_required_before_finalize)} onChange={(value) => update("cash_salary_acknowledgement_required_before_finalize", value)} />
          <Toggle disabled={!canManageSettings} label="Enable signature capture placeholder" checked={Boolean(settings.cash_salary_signature_capture_placeholder_enabled)} onChange={(value) => update("cash_salary_signature_capture_placeholder_enabled", value)} />
        </SettingsSection>
        </SubmoduleSettingsSection>

        <SettingsSection title="Deduction Priority" description="JSON order used by calculation foundations.">
          <div className="md:col-span-2 xl:col-span-3">
            <Field label="payroll_deduction_priority_json">
              <TextareaField disabled={!canManageSettings} className="min-h-24 w-full rounded-md border bg-white px-3 py-2 font-mono text-xs" value={settings.payroll_deduction_priority_json ?? ""} onChange={(event) => update("payroll_deduction_priority_json", event.target.value)} />
            </Field>
          </div>
        </SettingsSection>
      </div></ModuleSettingsBody>}
    </Panel>
  </div>;
}

function SettingsSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="space-y-3 border-b pb-4 last:border-b-0 last:pb-0"><div><h2 className="text-sm font-semibold">{title}</h2><p className="text-xs text-muted-foreground">{description}</p></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div></section>;
}

function SubmoduleSettingsSection({ enabled, name, children }: { enabled: boolean; name: string; children: React.ReactNode }) {
  return (
    <fieldset disabled={!enabled} className={!enabled ? "rounded-lg bg-slate-50/75 opacity-65" : undefined}>
      {!enabled ? (
        <div className="mb-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-muted-foreground">
          {name} payroll submodule is disabled. These settings are visible for review but cannot be edited until the submodule is enabled.
        </div>
      ) : null}
      {children}
    </fieldset>
  );
}

export function PayrollReportsPage() {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("payroll.reports.view");
  const canExport = permissions.has("payroll.reports.export");
  const [rows, setRows] = useState<Row[]>([]);
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [jobLevels, setJobLevels] = useState<OrganizationJobLevel[]>([]);
  const [positions, setPositions] = useState<OrganizationPosition[]>([]);
  const [report, setReport] = useState("summary");
  const [periodId, setPeriodId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [jobLevelId, setJobLevelId] = useState("");
  const [positionId, setPositionId] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const filters = useMemo(() => ({ report, payroll_period_id: periodId, department_id: departmentId, location_id: locationId, search }), [report, periodId, departmentId, locationId, search]);
  async function load() {
    if (!token || !canView) return;
    setLoading(true); setError(null);
    try { const [result, refs] = await Promise.all([api.getPayrollReports(token, filters), loadReferenceData(token)]); setRows(result.reports); setPeriods(refs.periods); setDepartments(refs.departments); setLocations(refs.locations); setJobLevels(refs.jobLevels); setPositions(refs.positions); } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to load payroll reports."); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [token, canView, filters]);
  async function exportCsv() {
    if (!token) return;
    try { const download = await api.exportPayrollReportCsv(token, filters); const url = URL.createObjectURL(download.blob); const link = document.createElement("a"); link.href = url; link.download = download.filename || `payroll-${report}.csv`; link.click(); URL.revokeObjectURL(url); } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to export payroll report."); }
  }
  const chips = useMemo<ActiveFilterChip[]>(() => [
    ...(search ? [{ key: "search", label: "Search", value: search, onRemove: () => setSearch("") }] : []),
    ...(report !== "summary" ? [{ key: "report", label: "Report", value: report.replace(/-/g, " "), title: report, onRemove: () => setReport("summary") }] : []),
    ...(periodId ? [{ key: "period", label: "Period", value: periods.find((period) => period.id === periodId) ? `${periods.find((period) => period.id === periodId)?.period_month}/${periods.find((period) => period.id === periodId)?.period_year}` : periodId, onRemove: () => setPeriodId("") }] : []),
    ...payrollOrgFilterChips({ departments, locations, jobLevels, positions, departmentId, locationId, jobLevelId, positionId, setDepartmentId, setLocationId, setJobLevelId, setPositionId })
  ], [departmentId, departments, jobLevelId, jobLevels, locationId, locations, periodId, periods, positionId, positions, report, search]);
  if (!canView) return <Panel><EmptyState title="Payroll reports unavailable" description="Your account needs payroll.reports.view permission." /></Panel>;
  return <PayrollTablePageLayout title="Payroll Reports" description="Filter and export payroll summaries with the same visible criteria." error={error} loading={loading} empty={rows.length === 0} emptyTitle="No report rows" chips={chips} onReset={() => { setReport("summary"); setPeriodId(""); setDepartmentId(""); setLocationId(""); setJobLevelId(""); setPositionId(""); setSearch(""); }} filters={<><SearchInput value={search} onChange={setSearch} /><StandardSelectFilter value={report} onValueChange={setReport} allLabel="Summary" width="documentType" options={["department", "location", "advance", "attendance", "leave", "custom-deductions", "custom-deduction-shortfalls", "employee-history", "final-settlement"].map((item) => ({ value: item, label: item.replace(/-/g, " ") }))} /><StandardSelectFilter value={periodId} onValueChange={setPeriodId} allLabel="All periods" width="payrollPeriod" options={periods.map((period) => ({ value: period.id, label: `${period.period_month}/${period.period_year}` }))} /><MoreFiltersSheet title="Payroll report filters" onReset={() => { setDepartmentId(""); setLocationId(""); setJobLevelId(""); setPositionId(""); }}><FilterSection title="Organization"><PayrollOrgFilter departments={departments} locations={locations} jobLevels={jobLevels} positions={positions} departmentId={departmentId} locationId={locationId} jobLevelId={jobLevelId} positionId={positionId} onChange={(next) => { setDepartmentId(next.departmentId); setLocationId(next.locationId); setJobLevelId(next.jobLevelId); setPositionId(next.positionId); }} /></FilterSection></MoreFiltersSheet></>} exportRows={rows} exportColumns={Object.keys(rows[0] ?? { report: "", value: "" })} action={canExport ? <Button size="sm" onClick={() => void exportCsv()}><Download className="h-4 w-4" /> Export CSV</Button> : null}>
    <TableHeader><TableRow>{Object.keys(rows[0] ?? { report: "", value: "" }).map((key) => <TableHead key={key}>{key}</TableHead>)}</TableRow></TableHeader>
    <TableBody>{rows.map((row, index) => <TableRow key={index}>{Object.keys(rows[0] ?? row).map((key) => <TableCell key={key}>{String(row[key] ?? "-")}</TableCell>)}</TableRow>)}</TableBody>
  </PayrollTablePageLayout>;
}
