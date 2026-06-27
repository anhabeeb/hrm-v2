import { FileText, Plus, RefreshCw, Settings, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { EmployeeCascadeSelect } from "../components/organization/EmployeeCascadeSelect";
import { ModuleSettingsBody } from "../components/settings/ModuleToggleHeader";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { DataTableFrame } from "../components/ui/data-table";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Panel } from "../components/ui/panel";
import { StatusBadge } from "../components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { useOrganizationReferences } from "../hooks/useOrganizationReferences";
import { ApiError, api } from "../lib/api";
import type { Employee } from "../types/employees";
import { CheckboxField, PageHeader, PageShell, SelectField, StandardTabs } from "../components/ui/page-shell";

type Row = Record<string, unknown>;
type Tab = "contracts" | "types" | "settings" | "probation" | "renewals" | "alerts";

const tabs: Array<{ key: Tab; label: string }> = [
  { key: "contracts", label: "Contracts" },
  { key: "types", label: "Types" },
  { key: "probation", label: "Probation due" },
  { key: "renewals", label: "Renewals" },
  { key: "alerts", label: "Alerts" }
];

const typeCategories = ["EMPLOYMENT", "RENEWAL", "PROBATION", "TEMPORARY", "CONSULTANCY_PLACEHOLDER", "OTHER"];

function text(value: unknown) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function fieldValue(value: unknown, fallback = "") {
  if (value === null || value === undefined || value === "" || value === "-") return fallback;
  return String(value);
}

function bool(value: unknown) {
  return value === true || value === 1;
}

export function ContractsPage({ mode = "contracts" }: { mode?: Tab }) {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const [tab, setTab] = useState<Tab>(mode);
  const [contracts, setContracts] = useState<Row[]>([]);
  const [types, setTypes] = useState<Row[]>([]);
  const [settings, setSettings] = useState<Row | null>(null);
  const [probation, setProbation] = useState<Row[]>([]);
  const [renewals, setRenewals] = useState<Row[]>([]);
  const [alerts, setAlerts] = useState<Row[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const organizationRefs = useOrganizationReferences(token);
  const [filters, setFilters] = useState({ search: "", status: "", contract_type_id: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [contractModal, setContractModal] = useState(false);
  const [typeModal, setTypeModal] = useState<Row | null>(null);
  const [actionTarget, setActionTarget] = useState<{ row: Row; action: string; title: string; reasonRequired?: boolean } | null>(null);

  const canView = permissions.has("contracts.view") || permissions.has("employees.contracts.view");
  const canManage = permissions.has("contracts.manage") || permissions.has("employees.contracts.manage");
  const canCreate = permissions.has("contracts.create") || canManage;
  const canTypeManage = permissions.has("contracts.types.manage") || permissions.has("contracts.types.create") || permissions.has("contracts.types.update");
  const canSettings = permissions.has("contracts.settings.manage") || permissions.has("contracts.settings.update");

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const [contractResult, typeResult, settingsResult, employeeResult] = await Promise.all([
        api.listContracts(token, filters).catch(() => ({ contracts: [] })),
        api.listContractTypes(token, { include_archived: true }).catch(() => ({ types: [] })),
        api.getContractSettings(token).catch(() => ({ settings: null })),
        api.listEmployees(token).catch(() => ({ employees: [] }))
      ]);
      setContracts(contractResult.contracts);
      setTypes(typeResult.types);
      setSettings(settingsResult.settings);
      setEmployees(employeeResult.employees);
      if (tab === "probation") setProbation((await api.listProbationDue(token)).contracts);
      if (tab === "renewals") setRenewals((await api.listContractRenewals(token)).renewals);
      if (tab === "alerts") setAlerts((await api.listContractAlerts(token)).alerts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Contracts could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, tab]);

  const activeTypes = useMemo(() => types.filter((type) => bool(type.is_active) && type.status !== "ARCHIVED" && !type.archived_at), [types]);

  async function refreshAlerts() {
    if (!token) return;
    const result = await api.refreshContractAlerts(token);
    setMessage(`Contract alerts refreshed. ${result.created} alert checks completed.`);
    await load();
  }

  async function saveSettings(next: Row) {
    if (!token) return;
    try {
      setSettings((await api.updateContractSettings(token, next)).settings);
      setMessage("Contract settings updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update contract settings.");
    }
  }

  async function runContractAction(reason?: string | null) {
    if (!token || !actionTarget) return;
    try {
      await api.contractAction(token, String(actionTarget.row.id), actionTarget.action, { reason });
      setActionTarget(null);
      setMessage(`${actionTarget.title} completed.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Contract action failed.");
    }
  }

  if (!canView) {
    return <PageShell><Panel><EmptyState title="Contracts unavailable" description="Your account needs contracts.view or employees.contracts.view permission." /></Panel></PageShell>;
  }

  return (
    <PageShell>
      <PageHeader
        title="Employee Contracts"
        description="Manage contracts, probation, renewals, expiry alerts, and contract history without legal automation."
        actions={
          <>
          <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="h-4 w-4" /> Refresh</Button>
          {canCreate ? <Button size="sm" onClick={() => setContractModal(true)}><Plus className="h-4 w-4" /> New contract</Button> : null}
          </>
        }
      />

      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <StandardTabs items={tabs} active={tab} onChange={(key) => setTab(key as Tab)} label="Contract section tabs" />

      {tab === "contracts" ? (
        <Panel className="space-y-3 p-3">
          <div className="grid gap-2 md:grid-cols-4">
            <Input placeholder="Search employee/contract" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
            <Input placeholder="Status" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} />
            <SelectField className="h-9 rounded-md border bg-white px-3 text-sm" value={filters.contract_type_id} onChange={(event) => setFilters({ ...filters, contract_type_id: event.target.value })}>
              <option value="">All contract types</option>
              {activeTypes.map((type) => <option key={String(type.id)} value={String(type.id)}>{text(type.name)}</option>)}
            </SelectField>
            <Button variant="outline" size="sm" onClick={() => void load()}>Apply filters</Button>
          </div>
          <DataTableFrame loading={loading} error={error} empty={!loading && contracts.length === 0}>
            <ContractTable rows={contracts} canManage={canManage} onAction={setActionTarget} />
          </DataTableFrame>
        </Panel>
      ) : null}

      {tab === "types" ? (
        <Panel className="space-y-3 p-3">
          <div className="flex justify-end">{canTypeManage ? <Button size="sm" onClick={() => setTypeModal({})}><Plus className="h-4 w-4" /> Create type</Button> : null}</div>
          <SimpleTable rows={types} columns={["code", "name", "category", "default_duration_months", "default_probation_months", "requires_end_date", "requires_probation", "allows_renewal", "status"]} />
        </Panel>
      ) : null}

      {tab === "settings" ? <ContractSettingsPanel settings={settings} canEdit={canSettings} onSave={(next) => void saveSettings(next)} /> : null}
      {tab === "probation" ? <Panel className="p-3"><SimpleTable rows={probation} columns={["employee_number_snapshot", "employee_name_snapshot", "contract_number", "probation_status", "probation_end_date", "confirmation_due_date", "status"]} /></Panel> : null}
      {tab === "renewals" ? <Panel className="p-3"><SimpleTable rows={renewals} columns={["employee_no", "full_name", "original_contract_number", "renewal_contract_number", "renewal_status", "previous_end_date", "proposed_start_date", "proposed_end_date"]} /></Panel> : null}
      {tab === "alerts" ? (
        <Panel className="space-y-3 p-3">
          {canManage ? <Button size="sm" onClick={() => void refreshAlerts()}><ShieldCheck className="h-4 w-4" /> Refresh alerts</Button> : null}
          <SimpleTable rows={alerts} columns={["alert_type", "severity", "status", "employee_no", "full_name", "contract_number", "due_date", "notes"]} />
        </Panel>
      ) : null}

      {contractModal ? <ContractForm employees={employees} organizationRefs={organizationRefs} types={activeTypes} onClose={() => setContractModal(false)} onSave={async (employeeId, input) => { if (!token) return; await api.createEmployeeContract(token, employeeId, input); setContractModal(false); await load(); }} /> : null}
      {typeModal ? <ContractTypeForm type={Object.keys(typeModal).length ? typeModal : null} onClose={() => setTypeModal(null)} onSave={async (input) => { if (!token) return; await api.createContractType(token, input); setTypeModal(null); await load(); }} /> : null}
      {actionTarget ? (
        <ReasonDialog
          title={actionTarget.title}
          description={`Apply ${actionTarget.action.split("-").join(" ")} to contract ${text(actionTarget.row.contract_number)}.`}
          reasonRequired={actionTarget.reasonRequired}
          onClose={() => setActionTarget(null)}
          onConfirm={(reason) => void runContractAction(reason)}
        />
      ) : null}
    </PageShell>
  );
}

function ContractTable({ rows, canManage, onAction }: { rows: Row[]; canManage: boolean; onAction: (target: { row: Row; action: string; title: string; reasonRequired?: boolean }) => void }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {["Employee", "Contract", "Type", "Status", "Approval", "Start", "End", "Probation", "Renewal", "Document", "Actions"].map((column) => <TableHead key={column}>{column}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={String(row.id)}>
              <TableCell><Link className="font-medium text-primary" to={`/employees/${row.employee_id}`}>{text(row.employee_name_snapshot ?? row.full_name)}</Link><div className="text-xs text-muted-foreground">{text(row.employee_number_snapshot ?? row.employee_no)}</div></TableCell>
              <TableCell>{text(row.contract_number)}<div className="text-xs text-muted-foreground">{text(row.contract_title)}</div></TableCell>
              <TableCell>{text(row.contract_type_display_name ?? row.contract_type_name_snapshot ?? "Not selected")}</TableCell>
              <TableCell><StatusBadge value={String(row.status)} /></TableCell>
              <TableCell><Badge tone={row.approval_status === "APPROVED" ? "success" : row.approval_status === "PENDING" ? "warning" : "neutral"}>{text(row.approval_status)}</Badge></TableCell>
              <TableCell>{text(row.contract_start_date)}</TableCell>
              <TableCell>{text(row.contract_end_date)}</TableCell>
              <TableCell>{text(row.probation_status)}<div className="text-xs text-muted-foreground">{text(row.confirmation_due_date)}</div></TableCell>
              <TableCell>{text(row.renewal_status)}</TableCell>
              <TableCell>{row.document_id ? "Linked" : "Missing"}</TableCell>
              <TableCell>
                {canManage ? (
                  <div className="flex flex-wrap gap-1">
                    <Button variant="outline" size="sm" onClick={() => onAction({ row, action: "submit-for-approval", title: "Submit for approval" })}>Submit</Button>
                    <Button variant="outline" size="sm" onClick={() => onAction({ row, action: "approve", title: "Approve" })}>Approve</Button>
                    <Button variant="outline" size="sm" onClick={() => onAction({ row, action: "activate", title: "Activate" })}>Activate</Button>
                    <Button variant="danger" size="sm" onClick={() => onAction({ row, action: "cancel", title: "Cancel", reasonRequired: true })}>Cancel</Button>
                  </div>
                ) : "-"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ContractForm({ employees, organizationRefs, types, onClose, onSave }: { employees: Employee[]; organizationRefs: ReturnType<typeof useOrganizationReferences>; types: Row[]; onClose: () => void; onSave: (employeeId: string, input: Row) => Promise<void> }) {
  const [form, setForm] = useState({ employee_id: "", contract_type_id: "", contract_number: "", contract_title: "", contract_start_date: "", contract_end_date: "", probation_start_date: "", probation_end_date: "", confirmation_due_date: "", basic_salary_snapshot: "", salary_currency_snapshot: "MVR", notes: "" });
  const [error, setError] = useState<string | null>(null);
  const selectedType = useMemo(() => types.find((type) => String(type.id) === form.contract_type_id), [types, form.contract_type_id]);
  const requiresEndDate = bool(selectedType?.requires_end_date);
  const requiresProbation = bool(selectedType?.requires_probation);
  const allowsSalaryTerms = selectedType ? bool(selectedType.allows_salary_terms) : true;
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!form.contract_type_id) {
      setError("Please select a contract type.");
      return;
    }
    if (requiresEndDate && !form.contract_end_date) {
      setError("Contract end date is required for this contract type.");
      return;
    }
    if (requiresProbation && (!form.probation_start_date || !form.probation_end_date)) {
      setError("Probation dates are required for this contract type.");
      return;
    }
    try {
      await onSave(form.employee_id, {
        contract_type_id: form.contract_type_id,
        contract_number: form.contract_number || null,
        contract_title: form.contract_title || null,
        contract_start_date: form.contract_start_date,
        contract_end_date: form.contract_end_date || null,
        probation_start_date: form.probation_start_date || null,
        probation_end_date: form.probation_end_date || null,
        confirmation_due_date: form.confirmation_due_date || null,
        basic_salary_snapshot: allowsSalaryTerms && form.basic_salary_snapshot ? Number(form.basic_salary_snapshot) : null,
        salary_currency_snapshot: form.salary_currency_snapshot,
        salary_terms: allowsSalaryTerms ? { source: "contract_form", basic_salary_snapshot: form.basic_salary_snapshot || null } : undefined,
        notes: form.notes || null
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save contract.");
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4">
      <form onSubmit={(event) => void submit(event)} className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-md border bg-white p-4 shadow-lg">
        <h2 className="text-base font-semibold">Create employee contract</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2"><EmployeeCascadeSelect employees={employees} departments={organizationRefs.departments} locations={organizationRefs.locations} jobLevels={organizationRefs.jobLevels} positions={organizationRefs.positions} value={form.employee_id} onChange={(employee_id) => setForm({ ...form, employee_id })} /></div>
          <Field label="Contract type"><SelectField required className="h-9 rounded-md border bg-white px-3 text-sm" value={form.contract_type_id} onChange={(event) => setForm({ ...form, contract_type_id: event.target.value })}><option value="">Select type</option>{types.map((type) => <option key={String(type.id)} value={String(type.id)}>{text(type.name)}</option>)}</SelectField></Field>
          <Field label="Contract number"><Input value={form.contract_number} onChange={(event) => setForm({ ...form, contract_number: event.target.value })} placeholder="Auto if blank" /></Field>
          <Field label="Title"><Input value={form.contract_title} onChange={(event) => setForm({ ...form, contract_title: event.target.value })} /></Field>
          <Field label="Start date"><Input type="date" required value={form.contract_start_date} onChange={(event) => setForm({ ...form, contract_start_date: event.target.value })} /></Field>
          <Field label={`End date${requiresEndDate ? " *" : ""}`}>
            <Input type="date" required={requiresEndDate} value={form.contract_end_date} onChange={(event) => setForm({ ...form, contract_end_date: event.target.value })} />
            {!requiresEndDate ? <p className="text-xs text-muted-foreground">End date is optional for this contract type.</p> : null}
          </Field>
          <Field label={`Probation start${requiresProbation ? " *" : ""}`}><Input type="date" required={requiresProbation} value={form.probation_start_date} onChange={(event) => setForm({ ...form, probation_start_date: event.target.value })} /></Field>
          <Field label={`Probation end${requiresProbation ? " *" : ""}`}>
            <Input type="date" required={requiresProbation} value={form.probation_end_date} onChange={(event) => setForm({ ...form, probation_end_date: event.target.value })} />
            {!requiresProbation ? <p className="text-xs text-muted-foreground">Probation is optional or not applicable for this contract type.</p> : null}
          </Field>
          <Field label="Confirmation due"><Input type="date" value={form.confirmation_due_date} onChange={(event) => setForm({ ...form, confirmation_due_date: event.target.value })} /></Field>
          <Field label="Salary snapshot"><Input type="number" min="0" disabled={!allowsSalaryTerms} value={form.basic_salary_snapshot} onChange={(event) => setForm({ ...form, basic_salary_snapshot: event.target.value })} />{!allowsSalaryTerms ? <p className="text-xs text-muted-foreground">Salary terms are disabled for this contract type.</p> : null}</Field>
          <Field label="Currency"><Input disabled={!allowsSalaryTerms} value={form.salary_currency_snapshot} onChange={(event) => setForm({ ...form, salary_currency_snapshot: event.target.value })} /></Field>
          <Field label="Notes"><Input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field>
        </div>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit">Save draft</Button></div>
      </form>
    </div>
  );
}

function ContractTypeForm({ type, onClose, onSave }: { type: Row | null; onClose: () => void; onSave: (input: Row) => Promise<void> }) {
  const [form, setForm] = useState({
    code: fieldValue(type?.code),
    name: fieldValue(type?.name),
    category: fieldValue(type?.category, "EMPLOYMENT"),
    default_duration_months: fieldValue(type?.default_duration_months),
    default_probation_months: fieldValue(type?.default_probation_months),
    description: fieldValue(type?.description)
  });
  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSave({ ...form, default_duration_months: form.default_duration_months ? Number(form.default_duration_months) : null, default_probation_months: form.default_probation_months ? Number(form.default_probation_months) : null });
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4">
      <form onSubmit={(event) => void submit(event)} className="w-full max-w-lg rounded-md border bg-white p-4 shadow-lg">
        <h2 className="text-base font-semibold">Create contract type</h2>
        <div className="mt-4 grid gap-3">
          <Field label="Code"><Input required value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} /></Field>
          <Field label="Name"><Input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
          <Field label="Category"><SelectField className="h-9 rounded-md border bg-white px-3 text-sm" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{typeCategories.map((category) => <option key={category} value={category}>{category}</option>)}</SelectField></Field>
          <Field label="Default duration months"><Input type="number" min="0" value={form.default_duration_months} onChange={(event) => setForm({ ...form, default_duration_months: event.target.value })} /></Field>
          <Field label="Default probation months"><Input type="number" min="0" value={form.default_probation_months} onChange={(event) => setForm({ ...form, default_probation_months: event.target.value })} /></Field>
          <Field label="Description"><Input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field>
        </div>
        <div className="mt-4 flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit">Save type</Button></div>
      </form>
    </div>
  );
}

function ContractSettingsPanel({ settings, canEdit, onSave }: { settings: Row | null; canEdit: boolean; onSave: (next: Row) => void }) {
  const [draft, setDraft] = useState<Row>(settings ?? {});
  useEffect(() => setDraft(settings ?? {}), [settings]);
  const switches = ["require_contract_for_active_employee", "auto_create_contract_task_on_onboarding", "require_contract_approval_before_activation", "allow_employee_without_contract_warning", "contract_expiry_alerts_enabled", "auto_mark_expired_contracts", "auto_create_end_of_contract_settlement_case", "require_reason_for_contract_change", "allow_contract_salary_snapshot", "allow_contract_salary_update_to_payroll_profile", "require_approval_for_contract_salary_update", "contract_document_required", "contract_sensitive_salary_terms"];
  const numbers = ["default_expiry_warning_days", "default_probation_warning_days", "default_renewal_warning_days"];
  const enabled = bool(draft.contracts_enabled ?? true);
  return (
    <Panel className="space-y-4 p-4">
      <ModuleSettingsBody disabled={!enabled}>
        <div>
          <h2 className="text-base font-semibold">Contract Settings</h2>
          <p className="text-sm text-muted-foreground">Control contract requirement warnings, expiry/probation alerts, salary snapshots, and document expectations.</p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {switches.map((key) => <CheckboxField key={key} label={key.split("_").join(" ")} checked={bool(draft[key])} disabled={!canEdit || !enabled} onChange={(checked) => setDraft({ ...draft, [key]: checked })} />)}
          {numbers.map((key) => <Field key={key} label={key.split("_").join(" ")}><Input type="number" min="0" disabled={!canEdit || !enabled} value={text(draft[key]) === "-" ? "" : text(draft[key])} onChange={(event) => setDraft({ ...draft, [key]: Number(event.target.value) })} /></Field>)}
        </div>
        {canEdit ? <div className="mt-4 flex justify-end"><Button disabled={!enabled} onClick={() => onSave(draft)}><Settings className="h-4 w-4" /> Save settings</Button></div> : null}
      </ModuleSettingsBody>
    </Panel>
  );
}

function ReasonDialog({ title, description, reasonRequired, onClose, onConfirm }: { title: string; description: string; reasonRequired?: boolean; onClose: () => void; onConfirm: (reason: string | null) => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4">
      <div className="w-full max-w-md rounded-md border bg-white p-4 shadow-lg">
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        <Field label={reasonRequired ? "Reason required" : "Reason / note"}><Input value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { if (reasonRequired && !reason.trim()) { setError("Reason is required."); return; } onConfirm(reason.trim() || null); }}>Confirm</Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1 text-sm"><Label>{label}</Label>{children}</label>;
}

function SimpleTable({ rows, columns }: { rows: Row[]; columns: string[] }) {
  return (
    <DataTableFrame loading={false} empty={rows.length === 0}>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow>{columns.map((column) => <TableHead key={column}>{column.split("_").join(" ")}</TableHead>)}</TableRow></TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={String(row.id ?? index)}>{columns.map((column) => <TableCell key={column}>{typeof row[column] === "boolean" ? (row[column] ? "Yes" : "No") : text(row[column])}</TableCell>)}</TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </DataTableFrame>
  );
}
