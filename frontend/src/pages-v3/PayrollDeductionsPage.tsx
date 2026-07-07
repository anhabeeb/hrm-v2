import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { PageShell, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavRail } from "../components/ui/route-nav-rail";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { humanizeTechnicalLabel } from "../lib/displayLabels";
import { PAYROLL_NAV_ITEMS } from "./payrollNav";
import type { Employee } from "../types/employees";
import type { PayrollDeduction } from "../types/payroll";

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`.toUpperCase();
}

function statusTone(status: string) {
  if (status === "ACTIVE" || status === "APPLIED") return { bg: "#EAF3DE", text: "#27500A" };
  if (status === "CANCELLED") return { bg: "#FCEBEB", text: "#A32D2D" };
  return { bg: "#F7F7FB", text: "#6B6F86" };
}

export function PayrollDeductionsPage() {
  const { token } = useAuth();
  const [deductions, setDeductions] = useState<PayrollDeduction[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);

  function load() {
    if (!token) return;
    api.listPayrollDeductions(token, {}).then((res) => setDeductions(res.deductions ?? [])).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [token]);

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={PAYROLL_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-lg font-medium text-slate-950">Deductions</p>
            <Button size="sm" onClick={() => setNewOpen(true)}><Plus className="h-4 w-4" /> New deduction</Button>
          </div>

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 2 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : deductions.length ? (
            <div className="flex flex-col gap-2">
              {deductions.map((d) => (
                <Panel key={d.id} className="flex items-center gap-3.5 p-3">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#E6F1FB] text-xs font-medium text-[#0C447C]">{initialsOf(d.employee_name ?? "?")}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-950">{d.employee_name}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{d.reason} · MVR {d.amount.toLocaleString()} · {humanizeTechnicalLabel(d.deduction_type)}</p>
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: statusTone(d.status).bg, color: statusTone(d.status).text }}>{humanizeTechnicalLabel(d.status)}</span>
                </Panel>
              ))}
            </div>
          ) : (
            <Panel><EmptyState title="No payroll deductions" description="Recurring or one-time deductions will appear here." /></Panel>
          )}
        </div>
      </div>
      {newOpen ? <NewDeductionModal onClose={() => setNewOpen(false)} onSaved={() => { setNewOpen(false); load(); }} /> : null}
    </PageShell>
  );
}

const DEDUCTION_TYPES = ["FIXED", "VARIABLE", "ONE_TIME", "RECURRING"] as const;

function NewDeductionModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [deductionType, setDeductionType] = useState<typeof DEDUCTION_TYPES[number]>("ONE_TIME");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.listEmployees(token, { limit: 200, offset: 0 }).then((res) => {
      setEmployees(res.employees);
      setEmployeeId(res.employees[0]?.id ?? "");
    });
  }, [token]);

  async function submit() {
    if (!token || !employeeId) return;
    setSaving(true);
    setError(null);
    try {
      await api.createPayrollDeduction(token, { employee_id: employeeId, deduction_type: deductionType, amount: Number(amount), reason });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create deduction.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>New payroll deduction</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Employee</Label>
              <SelectField value={employeeId} onValueChange={setEmployeeId}>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </SelectField>
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <SelectField value={deductionType} onValueChange={(v) => setDeductionType(v as typeof DEDUCTION_TYPES[number])}>
                {DEDUCTION_TYPES.map((t) => <option key={t} value={t}>{humanizeTechnicalLabel(t)}</option>)}
              </SelectField>
            </div>
            <div className="space-y-1.5"><Label>Amount (MVR)</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Uniform deposit" /></div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} disabled={!employeeId || !amount || !reason.trim()} onClick={() => void submit()}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
