import { Download, Edit, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PayrollNav } from "../components/payroll/PayrollNav";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import type { Employee } from "../types/employees";
import type { OrganizationDepartment, OrganizationLocation } from "../types/organization";
import type { PayrollAdjustment, PayrollAdvance, PayrollComponent, PayrollDeduction, PayrollPeriod, PayrollSettings } from "../types/payroll";

type Row = Record<string, unknown>;

function money(value: unknown) {
  return Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ErrorMessage({ error }: { error: string | null }) {
  return error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null;
}

function Header({ title, description, children }: { title: string; description: string; children?: React.ReactNode }) {
  return <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"><div><h1 className="text-lg font-semibold">{title}</h1><p className="text-sm text-muted-foreground">{description}</p></div><div className="flex flex-wrap gap-2"><PayrollNav />{children}</div></div>;
}

function SearchInput({ value, onChange, placeholder = "Search employee/name/no" }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <div className="relative md:col-span-2"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function Toggle({ label, checked, disabled = false, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm"><input type="checkbox" disabled={disabled} checked={checked} onChange={(event) => onChange(event.target.checked)} /> {label}</label>;
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

function EmployeeSelect({ employees, value, onChange }: { employees: Employee[]; value?: string | null; onChange: (value: string) => void }) {
  return <select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={value ?? ""} onChange={(event) => onChange(event.target.value)}><option value="">Select employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employee_no} - {employee.full_name}</option>)}</select>;
}

function PeriodSelect({ periods, value, onChange }: { periods: PayrollPeriod[]; value?: string | null; onChange: (value: string | null) => void }) {
  return <select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={value ?? ""} onChange={(event) => onChange(event.target.value || null)}><option value="">No period</option>{periods.map((period) => <option key={period.id} value={period.id}>{period.period_month}/{period.period_year} - {period.status}</option>)}</select>;
}

function PageShell({ title, description, error, loading, empty, emptyTitle, filters, action, children }: { title: string; description: string; error: string | null; loading: boolean; empty: boolean; emptyTitle: string; filters: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return <div className="space-y-4"><Header title={title} description={description}>{action}</Header><ErrorMessage error={error} /><Panel className="overflow-hidden"><div className="grid gap-2 border-b p-3 md:grid-cols-4 xl:grid-cols-6">{filters}</div><div className="overflow-x-auto"><Table>{children}</Table></div>{loading ? <EmptyState title={`Loading ${title.toLowerCase()}`} description="Fetching payroll rows." /> : empty ? <EmptyState title={emptyTitle} description="Use the available actions or adjust filters." /> : null}</Panel></div>;
}

async function loadReferenceData(token: string) {
  const [employees, departments, locations, periods] = await Promise.all([api.listEmployees(token), api.listDepartments(token), api.listLocations(token), api.listPayrollPeriods(token)]);
  return { employees: employees.employees, departments: departments.departments, locations: locations.locations, periods: periods.periods };
}

function DepartmentFilter({ departments, value, onChange }: { departments: OrganizationDepartment[]; value: string; onChange: (value: string) => void }) {
  return <select className="h-9 rounded-md border bg-white px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}><option value="">All departments</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select>;
}

function LocationFilter({ locations, value, onChange }: { locations: OrganizationLocation[]; value: string; onChange: (value: string) => void }) {
  return <select className="h-9 rounded-md border bg-white px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}><option value="">All locations</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select>;
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
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [editing, setEditing] = useState<Partial<PayrollAdvance> | null>(null);
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [rowAction, setRowAction] = useState<{ row: PayrollAdvance; name: "approve" | "cancel" } | null>(null);
  const [actionReason, setActionReason] = useState("");
  const filters = useMemo(() => ({ search, department_id: departmentId, location_id: locationId, status, payment_date_from: from, payment_date_to: to }), [search, departmentId, locationId, status, from, to]);
  async function load() {
    if (!token || !canView) return;
    setLoading(true); setError(null);
    try {
      const [advanceResult, refs] = await Promise.all([api.listPayrollAdvances(token, filters), loadReferenceData(token)]);
      setRows(advanceResult.advances); setEmployees(refs.employees); setDepartments(refs.departments); setLocations(refs.locations); setPeriods(refs.periods);
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
  if (!canView) return <Panel><EmptyState title="Advances unavailable" description="Your account needs payroll advance permission." /></Panel>;
  return <PageShell title="Payroll Advances" description="Track employee advances by department, location, status, and payment date." error={error} loading={loading} empty={rows.length === 0} emptyTitle="No advances" filters={<><SearchInput value={search} onChange={setSearch} /><DepartmentFilter departments={departments} value={departmentId} onChange={setDepartmentId} /><LocationFilter locations={locations} value={locationId} onChange={setLocationId} /><select className="h-9 rounded-md border bg-white px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{["REQUESTED", "APPROVED", "DEDUCTED", "CANCELLED"].map((item) => <option key={item} value={item}>{item}</option>)}</select><Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} aria-label="Payment date from" /><Input type="date" value={to} onChange={(event) => setTo(event.target.value)} aria-label="Payment date to" /></>} action={canManage ? <Button size="sm" onClick={() => setEditing({ status: "REQUESTED", payment_date: new Date().toISOString().slice(0, 10) })}><Plus className="h-4 w-4" /> Create advance</Button> : null}>
    <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Department</TableHead><TableHead>Location</TableHead><TableHead>Amount</TableHead><TableHead>Payment date</TableHead><TableHead>Repayment period</TableHead><TableHead>Status</TableHead><TableHead>Notes</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
    <TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell><div className="font-medium">{row.employee_name ?? "-"}</div><div className="font-mono text-xs text-muted-foreground">{row.employee_no ?? ""}</div></TableCell><TableCell>{row.department_name ?? "-"}</TableCell><TableCell>{row.location_name ?? "-"}</TableCell><TableCell>{money(row.amount)}</TableCell><TableCell>{row.payment_date}</TableCell><TableCell>{row.repayment_period_label ?? "-"}</TableCell><TableCell><Badge tone={row.status === "DEDUCTED" ? "success" : row.status === "CANCELLED" ? "danger" : "neutral"}>{row.status === "PAID" ? "APPROVED" : row.status}</Badge></TableCell><TableCell>{row.notes ?? "-"}</TableCell><TableCell><div className="flex justify-end gap-1">{canManage ? <Button variant="ghost" size="icon" title="Edit advance" onClick={() => setEditing(row)}><Edit className="h-4 w-4" /></Button> : null}{canApprove ? <Button variant="ghost" size="sm" onClick={() => setRowAction({ row, name: "approve" })}>Approve</Button> : null}{canCancel ? <Button variant="ghost" size="sm" onClick={() => { setActionReason(""); setRowAction({ row, name: "cancel" }); }}>Cancel</Button> : null}</div></TableCell></TableRow>)}</TableBody>
    {editing ? <AdvanceModal value={editing} employees={employees} periods={periods} onChange={setEditing} onClose={() => setEditing(null)} onSave={() => void save()} /> : null}
    {rowAction ? <ActionModal title={rowAction.name === "approve" ? "Approve advance" : "Cancel advance"} description={rowAction.name === "approve" ? "Approve this advance for later deduction." : "Cancelling an advance requires a reason."} reason={actionReason} reasonRequired={rowAction.name === "cancel"} onReason={rowAction.name === "cancel" ? setActionReason : undefined} onClose={() => { setRowAction(null); setActionReason(""); }} onConfirm={() => void confirmAction()} /> : null}
  </PageShell>;
}

function AdvanceModal({ value, employees, periods, onChange, onClose, onSave }: { value: Partial<PayrollAdvance>; employees: Employee[]; periods: PayrollPeriod[]; onChange: (value: Partial<PayrollAdvance>) => void; onClose: () => void; onSave: () => void }) {
  return <Modal title={value.id ? "Edit advance" : "Create advance"} onClose={onClose} onSave={onSave}><div className="grid gap-3 md:grid-cols-2"><Field label="Employee"><EmployeeSelect employees={employees} value={value.employee_id} onChange={(employee_id) => onChange({ ...value, employee_id })} /></Field><Field label="Amount"><Input type="number" min={0} value={value.amount ?? ""} onChange={(event) => onChange({ ...value, amount: Number(event.target.value) })} /></Field><Field label="Payment date"><Input type="date" value={value.payment_date ?? ""} onChange={(event) => onChange({ ...value, payment_date: event.target.value })} /></Field><Field label="Repayment period"><PeriodSelect periods={periods} value={value.repayment_period_id} onChange={(repayment_period_id) => onChange({ ...value, repayment_period_id })} /></Field><Field label="Notes"><Input value={value.notes ?? ""} onChange={(event) => onChange({ ...value, notes: event.target.value || null })} /></Field></div></Modal>;
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
  if (!canView) return <Panel><EmptyState title="Payroll components unavailable" description="Your account needs payroll permission." /></Panel>;
  return <PageShell title="Payroll Components" description="Manage Payroll Core earning and deduction components used in result line items." error={error} loading={loading} empty={filtered.length === 0} emptyTitle="No components" filters={<SearchInput value={search} onChange={setSearch} placeholder="Search code/name/category" />} action={canManage ? <Button size="sm" onClick={() => setEditing({ type: "ALLOWANCE", calculation_type: "FIXED_AMOUNT", is_active: true, sort_order: 100 })}><Plus className="h-4 w-4" /> Create component</Button> : null}>
    <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Category</TableHead><TableHead>Calculation</TableHead><TableHead>Default</TableHead><TableHead>Taxable</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
    <TableBody>{filtered.map((row) => <TableRow key={row.id}><TableCell className="font-mono text-xs">{row.code}</TableCell><TableCell className="font-medium">{row.name}</TableCell><TableCell>{row.type}</TableCell><TableCell>{row.category ?? "-"}</TableCell><TableCell>{row.calculation_type}</TableCell><TableCell>{row.default_percentage ? `${row.default_percentage}%` : money(row.default_amount)}</TableCell><TableCell>{Boolean(row.is_taxable) ? "Yes" : "No"}</TableCell><TableCell><Badge tone={row.is_active ? "success" : "neutral"}>{row.is_active ? "Active" : "Inactive"}</Badge></TableCell><TableCell><div className="flex justify-end gap-1">{canManage ? <><Button variant="ghost" size="icon" title="Edit component" onClick={() => setEditing(row)}><Edit className="h-4 w-4" /></Button><Button variant="ghost" size="sm" onClick={() => void toggle(row)}>{row.is_active ? "Disable" : "Enable"}</Button></> : null}</div></TableCell></TableRow>)}</TableBody>
    {editing ? <ComponentModal value={editing} onChange={setEditing} onClose={() => setEditing(null)} onSave={() => void save()} /> : null}
  </PageShell>;
}

function ComponentModal({ value, onChange, onClose, onSave }: { value: Partial<PayrollComponent>; onChange: (value: Partial<PayrollComponent>) => void; onClose: () => void; onSave: () => void }) {
  return <Modal title={value.id ? "Edit component" : "Create component"} onClose={onClose} onSave={onSave}><div className="grid gap-3 md:grid-cols-2"><Field label="Code"><Input value={value.code ?? ""} onChange={(event) => onChange({ ...value, code: event.target.value })} /></Field><Field label="Name"><Input value={value.name ?? ""} onChange={(event) => onChange({ ...value, name: event.target.value })} /></Field><Field label="Type"><select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={value.type ?? "ALLOWANCE"} onChange={(event) => onChange({ ...value, type: event.target.value as PayrollComponent["type"] })}>{["BASIC_SALARY", "ALLOWANCE", "FIXED_DEDUCTION", "VARIABLE_DEDUCTION", "ATTENDANCE_DEDUCTION", "LEAVE_DEDUCTION", "ADVANCE_DEDUCTION", "ONE_TIME_DEDUCTION", "OVERTIME_PLACEHOLDER", "BENEFIT_PLACEHOLDER", "ADJUSTMENT", "EARNING", "DEDUCTION"].map((item) => <option key={item} value={item}>{item}</option>)}</select></Field><Field label="Category"><select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={value.category ?? ""} onChange={(event) => onChange({ ...value, category: event.target.value || null })}><option value="">None</option>{["BASIC", "ALLOWANCE", "BENEFIT", "OVERTIME", "ADVANCE", "ATTENDANCE", "LEAVE", "OTHER", "SALARY", "DEDUCTION", "ADJUSTMENT"].map((item) => <option key={item} value={item}>{item}</option>)}</select></Field><Field label="Calculation type"><select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={value.calculation_type ?? "FIXED_AMOUNT"} onChange={(event) => onChange({ ...value, calculation_type: event.target.value as PayrollComponent["calculation_type"] })}>{["FIXED_AMOUNT", "PERCENTAGE_OF_BASIC", "PERCENTAGE_OF_GROSS", "DAILY_RATE", "HOURLY_RATE", "FORMULA_PLACEHOLDER", "MANUAL", "FIXED", "VARIABLE", "PERCENTAGE"].map((item) => <option key={item} value={item}>{item}</option>)}</select></Field><Field label="Default amount"><Input type="number" value={value.default_amount ?? ""} onChange={(event) => onChange({ ...value, default_amount: event.target.value ? Number(event.target.value) : null })} /></Field><Field label="Default percentage"><Input type="number" value={value.default_percentage ?? ""} onChange={(event) => onChange({ ...value, default_percentage: event.target.value ? Number(event.target.value) : null })} /></Field><Field label="Sort order"><Input type="number" value={value.sort_order ?? 100} onChange={(event) => onChange({ ...value, sort_order: Number(event.target.value) })} /></Field><Toggle label="Applies to basic salary" checked={Boolean(value.applies_to_basic_salary)} onChange={(applies_to_basic_salary) => onChange({ ...value, applies_to_basic_salary })} /><Toggle label="Taxable" checked={Boolean(value.is_taxable)} onChange={(is_taxable) => onChange({ ...value, is_taxable })} /><Toggle label="Active" checked={Boolean(value.is_active)} onChange={(is_active) => onChange({ ...value, is_active })} /></div></Modal>;
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
  const [editing, setEditing] = useState<Partial<PayrollDeduction> | null>(null);
  const [search, setSearch] = useState(""); const [departmentId, setDepartmentId] = useState(""); const [locationId, setLocationId] = useState(""); const [status, setStatus] = useState(""); const [type, setType] = useState("");
  const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(true);
  const [rowAction, setRowAction] = useState<{ row: PayrollDeduction; name: "enable" | "disable" | "cancel" } | null>(null);
  const [actionReason, setActionReason] = useState("");
  const filters = useMemo(() => ({ search, department_id: departmentId, location_id: locationId, status, deduction_type: type }), [search, departmentId, locationId, status, type]);
  async function load() { if (!token || !canView) return; setLoading(true); setError(null); try { const [result, refs, comps] = await Promise.all([api.listPayrollDeductions(token, filters), loadReferenceData(token), api.listPayrollComponents(token)]); setRows(result.deductions); setEmployees(refs.employees); setDepartments(refs.departments); setLocations(refs.locations); setPeriods(refs.periods); setComponents(comps.components.filter((component) => String(component.type).includes("DEDUCTION") || component.type === "DEDUCTION")); } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to load deductions."); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, [token, canView, filters]);
  async function save() { if (!token || !editing) return; try { if (editing.id) await api.updatePayrollDeduction(token, editing.id, editing); else await api.createPayrollDeduction(token, editing); setEditing(null); await load(); } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to save deduction."); } }
  async function confirmAction() { if (!token || !rowAction) return; if (rowAction.name === "cancel" && !actionReason.trim()) { setError("Cancellation reason is required."); return; } try { await api.payrollDeductionAction(token, rowAction.row.id, rowAction.name, rowAction.name === "cancel" ? actionReason.trim() : undefined); setRowAction(null); setActionReason(""); await load(); } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to update deduction."); } }
  if (!canView) return <Panel><EmptyState title="Deductions unavailable" description="Your account needs payroll.view permission." /></Panel>;
  return <PageShell title="Payroll Deductions" description="Manage fixed, variable, one-time, and recurring deductions." error={error} loading={loading} empty={rows.length === 0} emptyTitle="No deductions" filters={<><SearchInput value={search} onChange={setSearch} /><DepartmentFilter departments={departments} value={departmentId} onChange={setDepartmentId} /><LocationFilter locations={locations} value={locationId} onChange={setLocationId} /><select className="h-9 rounded-md border bg-white px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{["ACTIVE", "INACTIVE", "APPLIED", "CANCELLED"].map((item) => <option key={item} value={item}>{item}</option>)}</select><select className="h-9 rounded-md border bg-white px-3 text-sm" value={type} onChange={(event) => setType(event.target.value)}><option value="">All types</option>{["FIXED", "VARIABLE", "ONE_TIME", "RECURRING"].map((item) => <option key={item} value={item}>{item}</option>)}</select></>} action={canManage ? <Button size="sm" onClick={() => setEditing({ deduction_type: "ONE_TIME", status: "ACTIVE" })}><Plus className="h-4 w-4" /> Create deduction</Button> : null}>
    <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Component</TableHead><TableHead>Type</TableHead><TableHead>Amount</TableHead><TableHead>Period</TableHead><TableHead>Status</TableHead><TableHead>Reason</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
    <TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell><div className="font-medium">{row.employee_name ?? "-"}</div><div className="font-mono text-xs text-muted-foreground">{row.employee_no ?? ""}</div></TableCell><TableCell>{row.component_name ?? row.payroll_component_id ?? "-"}</TableCell><TableCell>{row.deduction_type}</TableCell><TableCell>{money(row.amount)}</TableCell><TableCell>{row.start_date ?? "-"} to {row.end_date ?? "-"}</TableCell><TableCell><Badge tone={row.status === "ACTIVE" ? "success" : row.status === "CANCELLED" ? "danger" : "neutral"}>{row.status}</Badge></TableCell><TableCell>{row.reason}</TableCell><TableCell><div className="flex justify-end gap-1">{canManage ? <><Button variant="ghost" size="icon" title="Edit deduction" onClick={() => setEditing(row)}><Edit className="h-4 w-4" /></Button><Button variant="ghost" size="sm" onClick={() => setRowAction({ row, name: row.status === "ACTIVE" ? "disable" : "enable" })}>{row.status === "ACTIVE" ? "Disable" : "Enable"}</Button><Button variant="ghost" size="sm" onClick={() => { setActionReason(""); setRowAction({ row, name: "cancel" }); }}>Cancel</Button></> : null}</div></TableCell></TableRow>)}</TableBody>
    {editing ? <DeductionModal value={editing} employees={employees} components={components} periods={periods} onChange={setEditing} onClose={() => setEditing(null)} onSave={() => void save()} /> : null}
    {rowAction ? <ActionModal title={`${rowAction.name[0].toUpperCase()}${rowAction.name.slice(1)} deduction`} description={rowAction.name === "cancel" ? "Cancelling a deduction requires a reason." : "Confirm this deduction status change."} reason={actionReason} reasonRequired={rowAction.name === "cancel"} onReason={rowAction.name === "cancel" ? setActionReason : undefined} onClose={() => { setRowAction(null); setActionReason(""); }} onConfirm={() => void confirmAction()} /> : null}
  </PageShell>;
}

function DeductionModal({ value, employees, components, periods, onChange, onClose, onSave }: { value: Partial<PayrollDeduction>; employees: Employee[]; components: PayrollComponent[]; periods: PayrollPeriod[]; onChange: (value: Partial<PayrollDeduction>) => void; onClose: () => void; onSave: () => void }) {
  return <Modal title={value.id ? "Edit deduction" : "Create deduction"} onClose={onClose} onSave={onSave}><div className="grid gap-3 md:grid-cols-2"><Field label="Employee"><EmployeeSelect employees={employees} value={value.employee_id} onChange={(employee_id) => onChange({ ...value, employee_id })} /></Field><Field label="Component"><select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={value.payroll_component_id ?? ""} onChange={(event) => onChange({ ...value, payroll_component_id: event.target.value || null })}><option value="">No component</option>{components.map((component) => <option key={component.id} value={component.id}>{component.code} - {component.name}</option>)}</select></Field><Field label="Deduction type"><select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={value.deduction_type ?? "ONE_TIME"} onChange={(event) => onChange({ ...value, deduction_type: event.target.value as PayrollDeduction["deduction_type"] })}>{["FIXED", "VARIABLE", "ONE_TIME", "RECURRING"].map((item) => <option key={item} value={item}>{item}</option>)}</select></Field><Field label="Amount"><Input type="number" value={value.amount ?? ""} onChange={(event) => onChange({ ...value, amount: Number(event.target.value) })} /></Field><Field label="Start date"><Input type="date" value={value.start_date ?? ""} onChange={(event) => onChange({ ...value, start_date: event.target.value || null })} /></Field><Field label="End date"><Input type="date" value={value.end_date ?? ""} onChange={(event) => onChange({ ...value, end_date: event.target.value || null })} /></Field><Field label="Payroll period"><PeriodSelect periods={periods} value={value.payroll_period_id} onChange={(payroll_period_id) => onChange({ ...value, payroll_period_id })} /></Field><Field label="Reason"><Input value={value.reason ?? ""} onChange={(event) => onChange({ ...value, reason: event.target.value })} /></Field></div></Modal>;
}

export function PayrollAdjustmentsPage() {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("payroll.view");
  const canManage = permissions.has("payroll.adjustments.manage");
  const canApprove = permissions.has("payroll.adjustments.approve_placeholder") || permissions.has("payroll.adjustments.manage");
  const [rows, setRows] = useState<PayrollAdjustment[]>([]); const [employees, setEmployees] = useState<Employee[]>([]); const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [editing, setEditing] = useState<Partial<PayrollAdjustment> | null>(null); const [search, setSearch] = useState(""); const [error, setError] = useState<string | null>(null); const [loading, setLoading] = useState(true);
  const [rowAction, setRowAction] = useState<{ row: PayrollAdjustment; name: "approve" | "cancel" } | null>(null); const [actionReason, setActionReason] = useState("");
  async function load() { if (!token || !canView) return; setLoading(true); setError(null); try { const [result, refs] = await Promise.all([api.listPayrollAdjustments(token, { search }), loadReferenceData(token)]); setRows(result.adjustments); setEmployees(refs.employees); setPeriods(refs.periods); } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to load adjustments."); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, [token, canView, search]);
  async function save() { if (!token || !editing) return; try { if (editing.id) await api.updatePayrollAdjustment(token, editing.id, editing); else await api.createPayrollAdjustment(token, editing); setEditing(null); await load(); } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to save adjustment."); } }
  async function confirmAction() { if (!token || !rowAction) return; if (rowAction.name === "cancel" && !actionReason.trim()) { setError("Cancellation reason is required."); return; } try { if (rowAction.name === "approve") await api.approvePayrollAdjustment(token, rowAction.row.id); if (rowAction.name === "cancel") await api.cancelPayrollAdjustment(token, rowAction.row.id, actionReason.trim()); setRowAction(null); setActionReason(""); await load(); } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to update adjustment."); } }
  if (!canView) return <Panel><EmptyState title="Adjustments unavailable" description="Your account needs payroll.view permission." /></Panel>;
  return <PageShell title="Payroll Adjustments" description="Manage manual earning and deduction adjustments." error={error} loading={loading} empty={rows.length === 0} emptyTitle="No adjustments" filters={<SearchInput value={search} onChange={setSearch} />} action={canManage ? <Button size="sm" onClick={() => setEditing({ adjustment_type: "EARNING", status: "DRAFT" })}><Plus className="h-4 w-4" /> Create adjustment</Button> : null}>
    <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Period</TableHead><TableHead>Type</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Reason</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
    <TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell><div className="font-medium">{row.employee_name ?? "-"}</div><div className="font-mono text-xs text-muted-foreground">{row.employee_no ?? ""}</div></TableCell><TableCell>{row.payroll_period_id ?? "-"}</TableCell><TableCell>{row.adjustment_type}</TableCell><TableCell>{money(row.amount)}</TableCell><TableCell><Badge tone={row.status === "APPROVED_PLACEHOLDER" || row.status === "APPROVED" ? "success" : row.status === "CANCELLED" ? "danger" : "neutral"}>{row.status === "APPROVED" ? "APPROVED_PLACEHOLDER" : row.status}</Badge></TableCell><TableCell>{row.reason}</TableCell><TableCell><div className="flex justify-end gap-1">{canManage ? <Button variant="ghost" size="icon" title="Edit adjustment" onClick={() => setEditing(row)}><Edit className="h-4 w-4" /></Button> : null}{canApprove ? <Button variant="ghost" size="sm" onClick={() => setRowAction({ row, name: "approve" })}>Approve</Button> : null}{canManage ? <Button variant="ghost" size="sm" onClick={() => { setActionReason(""); setRowAction({ row, name: "cancel" }); }}>Cancel</Button> : null}</div></TableCell></TableRow>)}</TableBody>
    {editing ? <AdjustmentModal value={editing} employees={employees} periods={periods} onChange={setEditing} onClose={() => setEditing(null)} onSave={() => void save()} /> : null}
    {rowAction ? <ActionModal title={rowAction.name === "approve" ? "Approve adjustment placeholder" : "Cancel adjustment"} description={rowAction.name === "approve" ? "Approve this adjustment as a Payroll Core placeholder." : "Cancelling an adjustment requires a reason."} reason={actionReason} reasonRequired={rowAction.name === "cancel"} onReason={rowAction.name === "cancel" ? setActionReason : undefined} onClose={() => { setRowAction(null); setActionReason(""); }} onConfirm={() => void confirmAction()} /> : null}
  </PageShell>;
}

function AdjustmentModal({ value, employees, periods, onChange, onClose, onSave }: { value: Partial<PayrollAdjustment>; employees: Employee[]; periods: PayrollPeriod[]; onChange: (value: Partial<PayrollAdjustment>) => void; onClose: () => void; onSave: () => void }) {
  return <Modal title={value.id ? "Edit adjustment" : "Create adjustment"} onClose={onClose} onSave={onSave}><div className="grid gap-3 md:grid-cols-2"><Field label="Employee"><EmployeeSelect employees={employees} value={value.employee_id} onChange={(employee_id) => onChange({ ...value, employee_id })} /></Field><Field label="Payroll period"><PeriodSelect periods={periods} value={value.payroll_period_id} onChange={(payroll_period_id) => onChange({ ...value, payroll_period_id })} /></Field><Field label="Adjustment type"><select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={value.adjustment_type ?? "EARNING"} onChange={(event) => onChange({ ...value, adjustment_type: event.target.value as PayrollAdjustment["adjustment_type"] })}><option value="EARNING">Earning</option><option value="DEDUCTION">Deduction</option></select></Field><Field label="Amount"><Input type="number" value={value.amount ?? ""} onChange={(event) => onChange({ ...value, amount: Number(event.target.value) })} /></Field><Field label="Reason"><Input value={value.reason ?? ""} onChange={(event) => onChange({ ...value, reason: event.target.value })} /></Field></div></Modal>;
}

export function PayrollFinalSettlementsPage() {
  const { user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("payroll.view");
  if (!canView) return <Panel><EmptyState title="Final settlements unavailable" description="Your account needs payroll.view permission." /></Panel>;
  return <div className="space-y-4">
    <Header title="Final Settlements" description="Final settlement will be implemented in a later phase." />
    <Panel className="p-6">
      <EmptyState title="Final settlement is not available in Payroll Core" description="Create, edit, approval, and payment settlement workflows are intentionally disabled for Prompt 10 and will be added in a later phase." />
    </Panel>
  </div>;
}

export function PayrollSettingsPage() {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("payroll.settings.view") || permissions.has("payroll.settings.manage") || permissions.has("payroll.custom_deduction_settings.view") || permissions.has("payroll.custom_deduction_settings.manage") || permissions.has("payroll.view");
  const canManage = permissions.has("payroll.settings.manage") || permissions.has("payroll.custom_deduction_settings.update") || permissions.has("payroll.custom_deduction_settings.manage");
  const [settings, setSettings] = useState<PayrollSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { async function load() { if (!token || !canView) return; try { setSettings((await api.getPayrollSettings(token)).settings); } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to load payroll settings."); } } void load(); }, [token, canView]);
  function update<K extends keyof PayrollSettings>(key: K, value: PayrollSettings[K]) { if (settings) setSettings({ ...settings, [key]: value }); }
  async function save() { if (!token || !settings) return; try { setSettings((await api.updatePayrollSettings(token, settings)).settings); setMessage("Payroll settings saved."); } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to save payroll settings."); } }
  if (!canView) return <Panel><EmptyState title="Payroll settings unavailable" description="Your account needs payroll settings permission." /></Panel>;
  return <div className="space-y-4">
    <Header title="Payroll Settings" description="General payroll, bank-loan, pension, payment, and deduction-priority controls.">{canManage ? <Button size="sm" onClick={() => void save()}>Save settings</Button> : null}</Header>
    <ErrorMessage error={error} />
    {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}
    <Panel className="p-4">
      {!settings ? <EmptyState title="Loading payroll settings" description="Fetching payroll configuration." /> : <div className="space-y-5">
        <SettingsSection title="General Payroll" description="Base calculation and module switches.">
          <Field label="Default currency"><Input disabled={!canManage} value={settings.default_currency} onChange={(event) => update("default_currency", event.target.value)} /></Field>
          <Field label="Daily rate mode"><select disabled={!canManage} className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={settings.default_daily_rate_mode} onChange={(event) => update("default_daily_rate_mode", event.target.value as PayrollSettings["default_daily_rate_mode"])}><option value="CALENDAR_DAYS">Calendar days</option><option value="WORKING_DAYS">Working days</option><option value="FIXED_30_DAYS">Fixed 30 days</option></select></Field>
          <Field label="Payment day"><Input disabled={!canManage} type="number" min={1} max={31} value={settings.default_salary_payment_day ?? ""} onChange={(event) => update("default_salary_payment_day", event.target.value ? Number(event.target.value) : null)} /></Field>
          <Toggle disabled={!canManage} label="Allow negative net salary" checked={Boolean(settings.allow_negative_net_salary)} onChange={(value) => update("allow_negative_net_salary", value)} />
          <Toggle disabled={!canManage} label="Require approval before paid" checked={Boolean(settings.require_approval_before_paid)} onChange={(value) => update("require_approval_before_paid", value)} />
          <Toggle disabled={!canManage} label="Include attendance deductions" checked={Boolean(settings.include_attendance_deductions)} onChange={(value) => update("include_attendance_deductions", value)} />
          <Toggle disabled={!canManage} label="Include leave deductions" checked={Boolean(settings.include_leave_deductions)} onChange={(value) => update("include_leave_deductions", value)} />
          <Toggle disabled={!canManage} label="Include advance deductions" checked={Boolean(settings.include_advance_deductions)} onChange={(value) => update("include_advance_deductions", value)} />
          <Toggle disabled={!canManage} label="Include roster scheduled days" checked={Boolean(settings.include_roster_scheduled_days)} onChange={(value) => update("include_roster_scheduled_days", value)} />
        </SettingsSection>

        <SettingsSection title="Bank Loan Deductions" description="Salary-deduction behavior for bank loans and cash-salary eligibility.">
          <Toggle disabled={!canManage} label="Enable bank loan deductions" checked={Boolean(settings.bank_loan_deductions_enabled ?? true)} onChange={(value) => update("bank_loan_deductions_enabled", value)} />
          <Toggle disabled={!canManage} label="Allow multiple bank loans per employee" checked={Boolean(settings.allow_multiple_bank_loans_per_employee ?? true)} onChange={(value) => update("allow_multiple_bank_loans_per_employee", value)} />
          <Toggle disabled={!canManage} label="Require loan approval before deduction" checked={Boolean(settings.require_loan_approval_before_payroll_deduction ?? true)} onChange={(value) => update("require_loan_approval_before_payroll_deduction", value)} />
          <Toggle disabled={!canManage} label="Allow partial loan deduction" checked={Boolean(settings.allow_partial_loan_deduction ?? true)} onChange={(value) => update("allow_partial_loan_deduction", value)} />
          <Toggle disabled={!canManage} label="Block payroll if loan exceeds net salary" checked={Boolean(settings.block_payroll_if_loan_exceeds_net_salary)} onChange={(value) => update("block_payroll_if_loan_exceeds_net_salary", value)} />
          <Field label="Insufficient salary mode"><select disabled={!canManage} className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={settings.bank_loan_insufficient_salary_mode ?? "REQUIRE_OVERRIDE"} onChange={(event) => update("bank_loan_insufficient_salary_mode", event.target.value)}>{["WARN_ONLY", "PARTIAL_DEDUCTION", "SKIP_AND_MARK_FAILED", "BLOCK_PAYROLL", "REQUIRE_OVERRIDE"].map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
          <Toggle disabled={!canManage} label="Enable minimum net salary protection" checked={Boolean(settings.bank_loan_minimum_net_salary_protection_enabled)} onChange={(value) => update("bank_loan_minimum_net_salary_protection_enabled", value)} />
          <Field label="Minimum net threshold type"><select disabled={!canManage} className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={settings.bank_loan_minimum_net_salary_threshold_type ?? "FIXED_AMOUNT"} onChange={(event) => update("bank_loan_minimum_net_salary_threshold_type", event.target.value)}><option value="FIXED_AMOUNT">Fixed amount</option><option value="PERCENTAGE_OF_NET_SALARY">Percentage of net salary</option></select></Field>
          <Field label="Minimum net threshold %"><Input disabled={!canManage} type="number" min={0} step="0.01" value={settings.bank_loan_minimum_net_salary_threshold_percentage ?? 0} onChange={(event) => update("bank_loan_minimum_net_salary_threshold_percentage", Number(event.target.value))} /></Field>
          <Field label="Minimum net threshold amount"><Input disabled={!canManage} type="number" min={0} step="0.01" value={settings.bank_loan_minimum_net_salary_threshold_amount ?? 0} onChange={(event) => update("bank_loan_minimum_net_salary_threshold_amount", Number(event.target.value))} /></Field>
          <Toggle disabled={!canManage} label="Skip loan if below threshold" checked={Boolean(settings.bank_loan_skip_if_below_threshold_enabled ?? true)} onChange={(value) => update("bank_loan_skip_if_below_threshold_enabled", value)} />
          <Toggle disabled={!canManage} label="Require bank notification on skip" checked={Boolean(settings.bank_loan_bank_notification_required_on_skip ?? true)} onChange={(value) => update("bank_loan_bank_notification_required_on_skip", value)} />
          <Toggle disabled={!canManage} label="Enable direct collection status" checked={Boolean(settings.bank_loan_employee_direct_collection_status_enabled ?? true)} onChange={(value) => update("bank_loan_employee_direct_collection_status_enabled", value)} />
          <Field label="Loan deduction priority"><Input disabled={!canManage} type="number" min={0} value={settings.loan_deduction_priority ?? 2} onChange={(event) => update("loan_deduction_priority", Number(event.target.value))} /></Field>
          <Field label="Minimum statement months"><Input disabled={!canManage} type="number" min={0} value={settings.bank_loan_statement_months_required_min ?? 6} onChange={(event) => update("bank_loan_statement_months_required_min", Number(event.target.value))} /></Field>
          <Field label="Default statement months"><Input disabled={!canManage} type="number" min={0} value={settings.bank_loan_statement_months_required_default ?? 12} onChange={(event) => update("bank_loan_statement_months_required_default", Number(event.target.value))} /></Field>
          <Field label="Default salary slips months"><Input disabled={!canManage} type="number" min={0} value={settings.bank_loan_salary_slips_months_required_default ?? 6} onChange={(event) => update("bank_loan_salary_slips_months_required_default", Number(event.target.value))} /></Field>
          <Toggle disabled={!canManage} label="Show loan details in self-service" checked={Boolean(settings.show_loan_details_in_self_service ?? true)} onChange={(value) => update("show_loan_details_in_self_service", value)} />
          <Toggle disabled={!canManage} label="Show loan details on payslip" checked={Boolean(settings.show_loan_details_on_payslip ?? true)} onChange={(value) => update("show_loan_details_on_payslip", value)} />
          <Toggle disabled={!canManage} label="Require bank salary route by default" checked={Boolean(settings.bank_loan_requires_bank_salary_route_default ?? true)} onChange={(value) => update("bank_loan_requires_bank_salary_route_default", value)} />
          <Toggle disabled={!canManage} label="Cash salary default ineligible" checked={Boolean(settings.bank_loan_cash_salary_default_ineligible ?? true)} onChange={(value) => update("bank_loan_cash_salary_default_ineligible", value)} />
          <Toggle disabled={!canManage} label="Allow cash employee override" checked={Boolean(settings.bank_loan_allow_cash_employee_override ?? true)} onChange={(value) => update("bank_loan_allow_cash_employee_override", value)} />
          <Toggle disabled={!canManage} label="Override requires reason" checked={Boolean(settings.bank_loan_override_requires_reason ?? true)} onChange={(value) => update("bank_loan_override_requires_reason", value)} />
          <Toggle disabled={!canManage} label="Override requires document" checked={Boolean(settings.bank_loan_override_requires_document ?? true)} onChange={(value) => update("bank_loan_override_requires_document", value)} />
        </SettingsSection>

        <SettingsSection title="Custom Deduction Settings" description="Employer-defined payroll deductions after pension and bank loan priorities, with payslip, self-service, and shortfall controls.">
          <Toggle disabled={!canManage} label="Enable custom deductions" checked={Boolean(settings.custom_deductions_enabled ?? true)} onChange={(value) => update("custom_deductions_enabled", value)} />
          <Toggle disabled={!canManage} label="Require approval before payroll deduction" checked={Boolean(settings.require_custom_deduction_approval ?? true)} onChange={(value) => update("require_custom_deduction_approval", value)} />
          <Toggle disabled={!canManage} label="Show on payslip by default" checked={Boolean(settings.custom_deduction_show_on_payslip_default ?? true)} onChange={(value) => update("custom_deduction_show_on_payslip_default", value)} />
          <Toggle disabled={!canManage} label="Show in self-service by default" checked={Boolean(settings.custom_deduction_show_in_self_service_default ?? true)} onChange={(value) => update("custom_deduction_show_in_self_service_default", value)} />
          <Toggle disabled={!canManage} label="Include in final settlement by default" checked={Boolean(settings.custom_deduction_include_in_final_settlement_default ?? true)} onChange={(value) => update("custom_deduction_include_in_final_settlement_default", value)} />
          <Toggle disabled={!canManage} label="Allow partial deduction" checked={Boolean(settings.custom_deduction_allow_partial_deduction ?? true)} onChange={(value) => update("custom_deduction_allow_partial_deduction", value)} />
          <Toggle disabled={!canManage} label="Carry forward shortfalls" checked={Boolean(settings.custom_deduction_shortfall_carry_forward_enabled)} onChange={(value) => update("custom_deduction_shortfall_carry_forward_enabled", value)} />
          <Toggle disabled={!canManage} label="Reason required for cancel" checked={Boolean(settings.custom_deduction_require_reason_for_cancel ?? true)} onChange={(value) => update("custom_deduction_require_reason_for_cancel", value)} />
          <Toggle disabled={!canManage} label="Require document for sensitive categories" checked={Boolean(settings.custom_deduction_require_document_for_sensitive_categories)} onChange={(value) => update("custom_deduction_require_document_for_sensitive_categories", value)} />
          <Field label="Insufficient salary mode"><select disabled={!canManage} className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={settings.custom_deduction_insufficient_salary_mode ?? "WARN_ONLY"} onChange={(event) => update("custom_deduction_insufficient_salary_mode", event.target.value)}>{["WARN_ONLY", "PARTIAL_DEDUCTION", "SKIP_AND_MARK_FAILED", "BLOCK_PAYROLL", "REQUIRE_OVERRIDE"].map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
          <Field label="Default priority"><Input disabled={!canManage} type="number" min={0} value={settings.custom_deduction_priority_default ?? 3} onChange={(event) => update("custom_deduction_priority_default", Number(event.target.value))} /></Field>
        </SettingsSection>

        <SettingsSection title="Pension Settings" description="Automatic employee deductions and employer company-cost contributions.">
          <Toggle disabled={!canManage} label="Enable pension" checked={Boolean(settings.pension_enabled ?? true)} onChange={(value) => update("pension_enabled", value)} />
          <Toggle disabled={!canManage} label="Auto-calculate pension" checked={Boolean(settings.pension_auto_calculation_enabled ?? true)} onChange={(value) => update("pension_auto_calculation_enabled", value)} />
          <Field label="Default pension scheme id"><Input disabled={!canManage} value={settings.default_pension_scheme_id ?? ""} onChange={(event) => update("default_pension_scheme_id", event.target.value || null)} /></Field>
          <Field label="Employee contribution %"><Input disabled={!canManage} type="number" min={0} step="0.01" value={settings.pension_employee_contribution_default_percent ?? 7} onChange={(event) => update("pension_employee_contribution_default_percent", Number(event.target.value))} /></Field>
          <Field label="Employer contribution %"><Input disabled={!canManage} type="number" min={0} step="0.01" value={settings.pension_employer_contribution_default_percent ?? 7} onChange={(event) => update("pension_employer_contribution_default_percent", Number(event.target.value))} /></Field>
          <Field label="Pension basis"><select disabled={!canManage} className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={settings.pension_basis_default ?? "BASIC_SALARY_ONLY"} onChange={(event) => update("pension_basis_default", event.target.value)}><option value="BASIC_SALARY_ONLY">Basic salary only</option><option value="GROSS_SALARY">Gross salary</option><option value="CUSTOM_FORMULA_PLACEHOLDER">Custom formula placeholder</option></select></Field>
          <Toggle disabled={!canManage} label="Show pension on payslip" checked={Boolean(settings.pension_show_on_payslip ?? true)} onChange={(value) => update("pension_show_on_payslip", value)} />
          <Toggle disabled={!canManage} label="Show pension in self-service" checked={Boolean(settings.pension_show_in_self_service ?? true)} onChange={(value) => update("pension_show_in_self_service", value)} />
          <Toggle disabled={!canManage} label="Enable pension remittance" checked={Boolean(settings.pension_remittance_enabled ?? true)} onChange={(value) => update("pension_remittance_enabled", value)} />
          <Toggle disabled={!canManage} label="Employer can pay employee share" checked={Boolean(settings.pension_employer_can_pay_employee_share ?? true)} onChange={(value) => update("pension_employer_can_pay_employee_share", value)} />
          <Toggle disabled={!canManage} label="Foreign employee pension default enabled" checked={Boolean(settings.foreign_employee_pension_default_enabled)} onChange={(value) => update("foreign_employee_pension_default_enabled", value)} />
          <Toggle disabled={!canManage} label="Foreign voluntary enrollment enabled" checked={Boolean(settings.foreign_employee_voluntary_enrollment_enabled ?? true)} onChange={(value) => update("foreign_employee_voluntary_enrollment_enabled", value)} />
        </SettingsSection>

        <SettingsSection title="Payment/Cash Salary Settings" description="Cash salary acknowledgement foundation for Payroll Core.">
          <Toggle disabled={!canManage} label="Enable cash salary acknowledgement" checked={Boolean(settings.cash_salary_acknowledgement_enabled)} onChange={(value) => update("cash_salary_acknowledgement_enabled", value)} />
          <Toggle disabled={!canManage} label="Require acknowledgement before finalize" checked={Boolean(settings.cash_salary_acknowledgement_required_before_finalize)} onChange={(value) => update("cash_salary_acknowledgement_required_before_finalize", value)} />
          <Toggle disabled={!canManage} label="Enable signature capture placeholder" checked={Boolean(settings.cash_salary_signature_capture_placeholder_enabled)} onChange={(value) => update("cash_salary_signature_capture_placeholder_enabled", value)} />
        </SettingsSection>

        <SettingsSection title="Deduction Priority" description="JSON order used by calculation foundations.">
          <div className="md:col-span-2 xl:col-span-3">
            <Field label="payroll_deduction_priority_json">
              <textarea disabled={!canManage} className="min-h-24 w-full rounded-md border bg-white px-3 py-2 font-mono text-xs" value={settings.payroll_deduction_priority_json ?? ""} onChange={(event) => update("payroll_deduction_priority_json", event.target.value)} />
            </Field>
          </div>
        </SettingsSection>
      </div>}
    </Panel>
  </div>;
}

function SettingsSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="space-y-3 border-b pb-4 last:border-b-0 last:pb-0"><div><h2 className="text-sm font-semibold">{title}</h2><p className="text-xs text-muted-foreground">{description}</p></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div></section>;
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
  const [report, setReport] = useState("summary");
  const [periodId, setPeriodId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const filters = useMemo(() => ({ report, payroll_period_id: periodId, department_id: departmentId, location_id: locationId, search }), [report, periodId, departmentId, locationId, search]);
  async function load() {
    if (!token || !canView) return;
    setLoading(true); setError(null);
    try { const [result, refs] = await Promise.all([api.getPayrollReports(token, filters), loadReferenceData(token)]); setRows(result.reports); setPeriods(refs.periods); setDepartments(refs.departments); setLocations(refs.locations); } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to load payroll reports."); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [token, canView, filters]);
  async function exportCsv() {
    if (!token) return;
    try { const download = await api.exportPayrollReportCsv(token, filters); const url = URL.createObjectURL(download.blob); const link = document.createElement("a"); link.href = url; link.download = download.filename || `payroll-${report}.csv`; link.click(); URL.revokeObjectURL(url); } catch (err) { setError(err instanceof ApiError ? err.message : "Unable to export payroll report."); }
  }
  if (!canView) return <Panel><EmptyState title="Payroll reports unavailable" description="Your account needs payroll.reports.view permission." /></Panel>;
  return <PageShell title="Payroll Reports" description="Filter and export payroll summaries with the same visible criteria." error={error} loading={loading} empty={rows.length === 0} emptyTitle="No report rows" filters={<><select className="h-9 rounded-md border bg-white px-3 text-sm" value={report} onChange={(event) => setReport(event.target.value)}>{["summary", "department", "location", "advance", "attendance", "leave", "custom-deductions", "custom-deduction-shortfalls", "employee-history", "final-settlement"].map((item) => <option key={item} value={item}>{item}</option>)}</select><select className="h-9 rounded-md border bg-white px-3 text-sm" value={periodId} onChange={(event) => setPeriodId(event.target.value)}><option value="">All periods</option>{periods.map((period) => <option key={period.id} value={period.id}>{period.period_month}/{period.period_year}</option>)}</select><DepartmentFilter departments={departments} value={departmentId} onChange={setDepartmentId} /><LocationFilter locations={locations} value={locationId} onChange={setLocationId} /><SearchInput value={search} onChange={setSearch} /></>} action={canExport ? <Button size="sm" onClick={() => void exportCsv()}><Download className="h-4 w-4" /> Export CSV</Button> : null}>
    <TableHeader><TableRow>{Object.keys(rows[0] ?? { report: "", value: "" }).map((key) => <TableHead key={key}>{key}</TableHead>)}</TableRow></TableHeader>
    <TableBody>{rows.map((row, index) => <TableRow key={index}>{Object.keys(rows[0] ?? row).map((key) => <TableCell key={key}>{String(row[key] ?? "-")}</TableCell>)}</TableRow>)}</TableBody>
  </PageShell>;
}
