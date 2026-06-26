import { FileSignature, Plus, RefreshCw } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { DataTableFrame } from "../ui/data-table";
import { EmptyState } from "../ui/empty-state";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { SelectField } from "../ui/page-shell";
import { Panel } from "../ui/panel";
import { StatusBadge } from "../ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { api } from "../../lib/api";
import type { Employee } from "../../types/employees";

type Row = Record<string, unknown>;

function text(value: unknown) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function bool(value: unknown) {
  return value === true || value === 1;
}

export function EmployeeContractsPanel({ employee, token, permissions }: { employee: Employee; token: string; permissions: Set<string> }) {
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [types, setTypes] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<{ row: Row; action: string; title: string; reasonRequired?: boolean } | null>(null);

  const canManage = permissions.has("employees.contracts.manage") || permissions.has("contracts.manage") || permissions.has("contracts.create");
  const activeContract = (summary?.active_contract ?? null) as Row | null;
  const history = useRows(summary, "contract_history");
  const events = useRows(summary, "events");
  const alerts = useRows(summary, "alerts");
  const activeTypes = useMemo(() => types.filter((type) => bool(type.is_active) && type.status !== "ARCHIVED"), [types]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [summaryResult, typeResult] = await Promise.all([
        api.getEmployeeContractSummary(token, employee.id),
        api.listContractTypes(token, { include_archived: false }).catch(() => ({ types: [] }))
      ]);
      setSummary(summaryResult);
      setTypes(typeResult.types);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Employee contracts could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [employee.id, token]);

  async function saveContract(input: Row) {
    await api.createEmployeeContract(token, employee.id, input);
    setCreateOpen(false);
    setMessage("Contract draft created.");
    await load();
  }

  async function runAction(reason?: string | null) {
    if (!actionTarget) return;
    await api.contractAction(token, String(actionTarget.row.id), actionTarget.action, { reason });
    setActionTarget(null);
    setMessage(`${actionTarget.title} completed.`);
    await load();
  }

  const requirement = (summary?.requirement_status ?? {}) as Row;
  const payrollImpact = (summary?.payroll_impact ?? {}) as Row;
  const finalSettlement = (summary?.final_settlement_context ?? {}) as Row;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-semibold">Contracts</h2>
          <p className="text-sm text-muted-foreground">Contract status, probation, renewals, alerts, and salary snapshot foundations.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="h-4 w-4" />Refresh</Button>
          {canManage ? <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" />New contract</Button> : null}
        </div>
      </div>
      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}
      <DataTableFrame loading={loading} error={error} empty={!loading && !activeContract && history.length === 0}>
        <div className="grid gap-4 xl:grid-cols-3">
          <Panel className="p-4 xl:col-span-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Active contract</h3>
                <p className="text-xs text-muted-foreground">One active contract is allowed for each employee.</p>
              </div>
              {activeContract ? <StatusBadge value={String(activeContract.status ?? "ACTIVE")} /> : null}
            </div>
            {activeContract ? (
              <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {[
                  ["Contract number", activeContract.contract_number],
                  ["Type", activeContract.contract_type_name_snapshot],
                  ["Approval", activeContract.approval_status],
                  ["Start", activeContract.contract_start_date],
                  ["End", activeContract.contract_end_date],
                  ["Probation", activeContract.probation_status],
                  ["Confirmation due", activeContract.confirmation_due_date],
                  ["Renewal", activeContract.renewal_status],
                  ["Document", activeContract.document_id ? "Linked" : "Missing"]
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-md border px-3 py-2">
                    <p className="text-xs text-muted-foreground">{String(label)}</p>
                    <p className="mt-1 text-sm font-medium">{text(value)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No active contract" description="Create or activate a contract when this employee needs contract tracking." />
            )}
          </Panel>
          <Panel className="p-4">
            <h3 className="text-sm font-semibold">Readiness</h3>
            <div className="mt-3 space-y-2 text-sm">
              <StatusLine label="Contract required" value={requirement.contract_required ? "Yes" : "No"} tone={requirement.blocking ? "warning" : "neutral"} />
              <StatusLine label="Requirement status" value={text(requirement.status)} tone={requirement.blocking ? "warning" : "success"} />
              <StatusLine label="Payroll impact" value={text(payrollImpact.salary_snapshot_status)} tone={payrollImpact.salary_mismatch ? "warning" : "neutral"} />
              <StatusLine label="Settlement flag" value={finalSettlement.end_of_contract_settlement_needed ? "May be needed" : "No active flag"} tone={finalSettlement.end_of_contract_settlement_needed ? "warning" : "neutral"} />
            </div>
          </Panel>
          <Panel className="p-3 xl:col-span-3">
            <ContractHistory rows={history} canManage={canManage} onAction={setActionTarget} />
          </Panel>
          <Panel className="p-3 xl:col-span-2">
            <SimpleRows title="Contract events" rows={events} columns={["event_type", "from_status", "to_status", "reason", "created_by_name", "created_at"]} />
          </Panel>
          <Panel className="p-3">
            <SimpleRows title="Open alerts" rows={alerts} columns={["alert_type", "severity", "status", "due_date", "notes"]} />
          </Panel>
        </div>
      </DataTableFrame>
      {createOpen ? <CreateContractDialog types={activeTypes} onClose={() => setCreateOpen(false)} onSave={saveContract} /> : null}
      {actionTarget ? <ReasonDialog target={actionTarget} onClose={() => setActionTarget(null)} onConfirm={(reason) => void runAction(reason)} /> : null}
    </div>
  );
}

function useRows(data: Record<string, unknown> | null, key: string) {
  const value = data?.[key];
  return Array.isArray(value) ? (value as Row[]) : [];
}

function StatusLine({ label, value, tone }: { label: string; value: string; tone: "neutral" | "success" | "warning" }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <Badge tone={tone}>{value}</Badge>
    </div>
  );
}

function ContractHistory({ rows, canManage, onAction }: { rows: Row[]; canManage: boolean; onAction: (target: { row: Row; action: string; title: string; reasonRequired?: boolean }) => void }) {
  return (
    <SimpleRows
      title="Contract history"
      rows={rows}
      columns={["contract_number", "contract_type_name_snapshot", "status", "approval_status", "contract_start_date", "contract_end_date", "probation_status", "renewal_status"]}
      actions={canManage ? (row) => (
        <div className="flex flex-wrap justify-end gap-1">
          <Button variant="outline" size="sm" onClick={() => onAction({ row, action: "submit-for-approval", title: "Submit for approval" })}>Submit</Button>
          <Button variant="outline" size="sm" onClick={() => onAction({ row, action: "approve", title: "Approve" })}>Approve</Button>
          <Button variant="outline" size="sm" onClick={() => onAction({ row, action: "activate", title: "Activate" })}>Activate</Button>
          <Button variant="danger" size="sm" onClick={() => onAction({ row, action: "cancel", title: "Cancel contract", reasonRequired: true })}>Cancel</Button>
        </div>
      ) : undefined}
    />
  );
}

function CreateContractDialog({ types, onClose, onSave }: { types: Row[]; onClose: () => void; onSave: (input: Row) => Promise<void> }) {
  const [form, setForm] = useState({
    contract_type_id: "",
    contract_number: "",
    contract_title: "",
    contract_start_date: "",
    contract_end_date: "",
    probation_end_date: "",
    confirmation_due_date: "",
    basic_salary_snapshot: "",
    salary_currency_snapshot: "MVR",
    notes: ""
  });
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await onSave({
        contract_type_id: form.contract_type_id,
        contract_number: form.contract_number || null,
        contract_title: form.contract_title || null,
        contract_start_date: form.contract_start_date,
        contract_end_date: form.contract_end_date || null,
        probation_end_date: form.probation_end_date || null,
        confirmation_due_date: form.confirmation_due_date || null,
        basic_salary_snapshot: form.basic_salary_snapshot ? Number(form.basic_salary_snapshot) : null,
        salary_currency_snapshot: form.salary_currency_snapshot,
        notes: form.notes || null
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create contract.");
    }
  }
  return (
    <ModalShell title="Create contract" onClose={onClose}>
      <form onSubmit={(event) => void submit(event)} className="grid gap-3 md:grid-cols-2">
        <SelectField required label="Contract type" value={form.contract_type_id} onValueChange={(contract_type_id) => setForm({ ...form, contract_type_id })}><option value="">Select type</option>{types.map((type) => <option key={String(type.id)} value={String(type.id)}>{text(type.name)}</option>)}</SelectField>
        <Field label="Contract number"><Input value={form.contract_number} onChange={(event) => setForm({ ...form, contract_number: event.target.value })} placeholder="Auto if blank" /></Field>
        <Field label="Title"><Input value={form.contract_title} onChange={(event) => setForm({ ...form, contract_title: event.target.value })} /></Field>
        <Field label="Start date"><Input type="date" required value={form.contract_start_date} onChange={(event) => setForm({ ...form, contract_start_date: event.target.value })} /></Field>
        <Field label="End date"><Input type="date" value={form.contract_end_date} onChange={(event) => setForm({ ...form, contract_end_date: event.target.value })} /></Field>
        <Field label="Probation end"><Input type="date" value={form.probation_end_date} onChange={(event) => setForm({ ...form, probation_end_date: event.target.value })} /></Field>
        <Field label="Confirmation due"><Input type="date" value={form.confirmation_due_date} onChange={(event) => setForm({ ...form, confirmation_due_date: event.target.value })} /></Field>
        <Field label="Salary snapshot"><Input type="number" min="0" value={form.basic_salary_snapshot} onChange={(event) => setForm({ ...form, basic_salary_snapshot: event.target.value })} /></Field>
        <Field label="Currency"><Input value={form.salary_currency_snapshot} onChange={(event) => setForm({ ...form, salary_currency_snapshot: event.target.value })} /></Field>
        <Field label="Notes"><Input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field>
        {error ? <p className="text-sm text-red-600 md:col-span-2">{error}</p> : null}
        <div className="flex justify-end gap-2 md:col-span-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit"><FileSignature className="h-4 w-4" />Save draft</Button></div>
      </form>
    </ModalShell>
  );
}

function ReasonDialog({ target, onClose, onConfirm }: { target: { row: Row; title: string; action: string; reasonRequired?: boolean }; onClose: () => void; onConfirm: (reason: string | null) => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <ModalShell title={target.title} onClose={onClose}>
      <p className="text-sm text-muted-foreground">Apply {target.action.split("-").join(" ")} to {text(target.row.contract_number)}.</p>
      <Field label={target.reasonRequired ? "Reason required" : "Reason / note"}><Input value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => { if (target.reasonRequired && !reason.trim()) { setError("Reason is required."); return; } onConfirm(reason.trim() || null); }}>Confirm</Button></div>
    </ModalShell>
  );
}

function ModalShell({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-md border bg-white p-4 shadow-lg">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold">{title}</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1 text-sm"><Label>{label}</Label>{children}</label>;
}

function SimpleRows({ title, rows, columns, actions }: { title: string; rows: Row[]; columns: string[]; actions?: (row: Row) => ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? <EmptyState title="No rows" description="There are no records to show." /> : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow>{columns.map((column) => <TableHead key={column}>{column.split("_").join(" ")}</TableHead>)}{actions ? <TableHead className="text-right">Actions</TableHead> : null}</TableRow></TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={String(row.id ?? index)}>
                  {columns.map((column) => <TableCell key={column}>{text(row[column])}</TableCell>)}
                  {actions ? <TableCell>{actions(row)}</TableCell> : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
