import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { PageShell, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavRail } from "../components/ui/route-nav-rail";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";
import { humanizeTechnicalLabel } from "../lib/displayLabels";
import { CONTRACTS_NAV_ITEMS } from "./contractsNav";
import type { Employee } from "../types/employees";

type Row = Record<string, unknown>;

function text(value: unknown, fallback = "Not set") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function statusTone(status: string) {
  if (["ACTIVE"].includes(status)) return { bg: "#EAF3DE", text: "#27500A" };
  if (["EXPIRING_SOON", "PENDING_APPROVAL", "DRAFT"].includes(status)) return { bg: "#FAEEDA", text: "#854F0B" };
  if (["EXPIRED", "CANCELLED"].includes(status)) return { bg: "#FCEBEB", text: "#A32D2D" };
  return { bg: "#F7F7FB", text: "#6B6F86" };
}

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`.toUpperCase();
}

export function ContractsListPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const [contracts, setContracts] = useState<Row[]>([]);
  const [types, setTypes] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [actionTarget, setActionTarget] = useState<{ row: Row; action: string; title: string; reasonRequired?: boolean } | null>(null);

  const permissions = new Set(user?.permissions ?? []);
  const canManage = permissions.has("contracts.manage") || permissions.has("employees.contracts.manage");
  const canCreate = permissions.has("contracts.create") || canManage;

  async function load() {
    if (!token) return;
    setLoading(true);
    const [contractResult, typeResult] = await Promise.all([
      api.listContracts(token, status ? { status } : {}).catch(() => ({ contracts: [] })),
      api.listContractTypes(token, {}).catch(() => ({ types: [] }))
    ]);
    setContracts(contractResult.contracts);
    setTypes(typeResult.types);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [token, status]);

  async function runAction(reason: string | null) {
    if (!token || !actionTarget) return;
    try {
      await api.contractAction(token, String(actionTarget.row.id), actionTarget.action, { reason });
      alerts.showSuccess(`${actionTarget.title} completed`, `Contract ${text(actionTarget.row.contract_number)} was updated.`);
      setActionTarget(null);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Contract action failed.");
    }
  }

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={CONTRACTS_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-slate-950">Contracts</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Manage contracts, probation, renewals, and expiry alerts</p>
            </div>
            {canCreate ? <Button size="sm" onClick={() => setNewOpen(true)}><Plus className="h-4 w-4" /> New contract</Button> : null}
          </div>

          <div className="flex items-center gap-2">
            <SelectField value={status} onValueChange={setStatus} className="h-8 w-48 text-xs">
              <option value="">All statuses</option>
              {["DRAFT", "PENDING_APPROVAL", "ACTIVE", "EXPIRING_SOON", "EXPIRED", "CANCELLED", "ARCHIVED"].map((s) => <option key={s} value={s}>{humanizeTechnicalLabel(s)}</option>)}
            </SelectField>
          </div>

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Panel key={i} className="h-20 animate-pulse" />)}</div>
          ) : contracts.length ? (
            <div className="flex flex-col gap-2">
              {contracts.map((row) => (
                <Panel key={String(row.id)} className="flex items-center gap-3.5 p-3">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#E6F1FB] text-xs font-medium text-[#0C447C]">{initialsOf(text(row.employee_name_snapshot ?? row.employee_name ?? row.full_name, "?"))}</div>
                  <div className="min-w-0 flex-1">
                    <Link to={`/v3-preview/employees/${row.employee_id}`} className="text-xs font-medium text-slate-950 hover:underline">{text(row.employee_name_snapshot ?? row.employee_name ?? row.full_name)}</Link>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {text(row.contract_number)} · {text(row.contract_type_display_name ?? row.contract_type_name_snapshot, "No type")} · {text(row.contract_start_date)} to {text(row.contract_end_date, "open")}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">Probation {text(row.probation_status)} · Renewal {text(row.renewal_status)} · Document {row.document_id ? "linked" : "missing"}</p>
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: row.approval_status === "APPROVED" ? "#EAF3DE" : row.approval_status === "PENDING" ? "#FAEEDA" : "#F7F7FB", color: row.approval_status === "APPROVED" ? "#27500A" : row.approval_status === "PENDING" ? "#854F0B" : "#6B6F86" }}>{text(row.approval_status)}</span>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: statusTone(String(row.status)).bg, color: statusTone(String(row.status)).text }}>{humanizeTechnicalLabel(String(row.status))}</span>
                  {canManage ? (
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => setActionTarget({ row, action: "submit-for-approval", title: "Submit for approval" })}>Submit</Button>
                      <Button size="sm" variant="actionSave" onClick={() => setActionTarget({ row, action: "approve", title: "Approve" })}>Approve</Button>
                      <Button size="sm" onClick={() => setActionTarget({ row, action: "activate", title: "Activate" })}>Activate</Button>
                      <Button size="sm" variant="danger" onClick={() => setActionTarget({ row, action: "cancel", title: "Cancel", reasonRequired: true })}>Cancel</Button>
                    </div>
                  ) : null}
                </Panel>
              ))}
            </div>
          ) : (
            <Panel><EmptyState title="No contracts found" description="Contracts created for employees will appear here." /></Panel>
          )}
        </div>
      </div>

      {newOpen ? <NewContractModal types={types} onClose={() => setNewOpen(false)} onSaved={() => { setNewOpen(false); void load(); }} /> : null}
      {actionTarget ? (
        <Dialog open onOpenChange={(v) => !v && setActionTarget(null)}>
          <DialogContent size="sm">
            <DialogHeader><DialogTitle>{actionTarget.title}</DialogTitle></DialogHeader>
            <DialogBody><ReasonForm reasonRequired={actionTarget.reasonRequired} onConfirm={(reason) => void runAction(reason)} onCancel={() => setActionTarget(null)} /></DialogBody>
          </DialogContent>
        </Dialog>
      ) : null}
    </PageShell>
  );
}

function ReasonForm({ reasonRequired, onConfirm, onCancel }: { reasonRequired?: boolean; onConfirm: (reason: string | null) => void; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <div className="space-y-1.5"><Label>{reasonRequired ? "Reason (required)" : "Reason / note (optional)"}</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      {error ? <p className="mt-2 text-xs text-[#A32D2D]">{error}</p> : null}
      <DialogFooter className="mt-4 px-0 pb-0">
        <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={() => { if (reasonRequired && !reason.trim()) { setError("Reason is required."); return; } onConfirm(reason.trim() || null); }}>Confirm</Button>
      </DialogFooter>
    </>
  );
}

function NewContractModal({ types, onClose, onSaved }: { types: Row[]; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [form, setForm] = useState({ employee_id: "", contract_type_id: "", contract_number: "", contract_start_date: "", contract_end_date: "", probation_start_date: "", probation_end_date: "", basic_salary_snapshot: "", salary_currency_snapshot: "MVR" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.listEmployees(token, { limit: 200, offset: 0 }).then((res) => {
      setEmployees(res.employees);
      setForm((f) => ({ ...f, employee_id: res.employees[0]?.id ?? "" }));
    });
  }, [token]);

  const selectedType = useMemo(() => types.find((t) => String(t.id) === form.contract_type_id), [types, form.contract_type_id]);
  const requiresEndDate = selectedType?.requires_end_date === true || selectedType?.requires_end_date === 1;
  const requiresProbation = selectedType?.requires_probation === true || selectedType?.requires_probation === 1;

  async function submit() {
    if (!token || !form.employee_id || !form.contract_type_id) return;
    setSaving(true);
    setError(null);
    try {
      await api.createEmployeeContract(token, form.employee_id, {
        contract_type_id: form.contract_type_id,
        contract_number: form.contract_number || null,
        contract_start_date: form.contract_start_date,
        contract_end_date: form.contract_end_date || null,
        probation_start_date: form.probation_start_date || null,
        probation_end_date: form.probation_end_date || null,
        basic_salary_snapshot: form.basic_salary_snapshot ? Number(form.basic_salary_snapshot) : null,
        salary_currency_snapshot: form.salary_currency_snapshot
      });
      alerts.showSuccess("Contract saved", "Employee contract draft was saved.");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save contract.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>New employee contract</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Employee</Label>
              <SelectField value={form.employee_id} onValueChange={(v) => setForm({ ...form, employee_id: v })}>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_no})</option>)}
              </SelectField>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Contract type</Label>
              <SelectField value={form.contract_type_id} onValueChange={(v) => setForm({ ...form, contract_type_id: v })}>
                <option value="">Select type</option>
                {types.map((t) => <option key={String(t.id)} value={String(t.id)}>{text(t.name)}</option>)}
              </SelectField>
            </div>
            <div className="space-y-1.5"><Label>Contract number</Label><Input value={form.contract_number} onChange={(e) => setForm({ ...form, contract_number: e.target.value })} placeholder="Auto if blank" /></div>
            <div className="space-y-1.5"><Label>Start date</Label><Input type="date" value={form.contract_start_date} onChange={(e) => setForm({ ...form, contract_start_date: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>End date{requiresEndDate ? " *" : ""}</Label><Input type="date" value={form.contract_end_date} onChange={(e) => setForm({ ...form, contract_end_date: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Probation start{requiresProbation ? " *" : ""}</Label><Input type="date" value={form.probation_start_date} onChange={(e) => setForm({ ...form, probation_start_date: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Probation end{requiresProbation ? " *" : ""}</Label><Input type="date" value={form.probation_end_date} onChange={(e) => setForm({ ...form, probation_end_date: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Basic salary snapshot</Label><Input type="number" min="0" value={form.basic_salary_snapshot} onChange={(e) => setForm({ ...form, basic_salary_snapshot: e.target.value })} /></div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} disabled={!form.employee_id || !form.contract_type_id || !form.contract_start_date} onClick={() => void submit()}>Save draft</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
