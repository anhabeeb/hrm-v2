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
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";
import { humanizeTechnicalLabel } from "../lib/displayLabels";
import { PAYROLL_NAV_ITEMS } from "./payrollNav";
import type { Employee } from "../types/employees";
import type { PayrollAdvance } from "../types/payroll";

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`.toUpperCase();
}

function statusTone(status: string) {
  if (["APPROVED", "PAID", "DEDUCTED"].includes(status)) return { bg: "#EAF3DE", text: "#27500A" };
  if (status === "CANCELLED") return { bg: "#FCEBEB", text: "#A32D2D" };
  return { bg: "#FAEEDA", text: "#854F0B" };
}

export function PayrollAdvancesPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const [advances, setAdvances] = useState<PayrollAdvance[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);

  const permissions = new Set(user?.permissions ?? []);
  const canApprove = permissions.has("payroll.advances.approve") || permissions.has("payroll.advances.manage");

  async function load() {
    if (!token) return;
    const result = await api.listPayrollAdvances(token, {});
    setAdvances(result.advances ?? []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [token]);

  async function approve(id: string) {
    if (!token) return;
    try {
      await api.approvePayrollAdvance(token, id);
      alerts.showSuccess("Advance approved", "The employee advance was approved.");
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to approve advance");
    }
  }

  async function reject(id: string) {
    if (!token) return;
    try {
      await api.cancelPayrollAdvance(token, id, "Rejected from Payroll advances list");
      alerts.showSuccess("Advance rejected", "The employee advance was rejected.");
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to reject advance");
    }
  }

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={PAYROLL_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-lg font-medium text-slate-950">Advances</p>
            <Button size="sm" onClick={() => setNewOpen(true)}><Plus className="h-4 w-4" /> New advance</Button>
          </div>

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 2 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : advances.length ? (
            <div className="flex flex-col gap-2">
              {advances.map((a) => (
                <Panel key={a.id} className="flex items-center gap-3.5 p-3">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#FAECE7] text-xs font-medium text-[#993C1D]">{initialsOf(a.employee_name ?? "?")}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-950">{a.employee_name}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">MVR {a.amount.toLocaleString()} · Requested {a.payment_date}{a.repayment_period_label ? `, repay over ${a.repayment_period_label}` : ""}</p>
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: statusTone(a.status).bg, color: statusTone(a.status).text }}>{humanizeTechnicalLabel(a.status)}</span>
                  {a.status === "REQUESTED" && canApprove ? (
                    <div className="flex shrink-0 gap-1.5">
                      <Button size="sm" variant="actionSave" onClick={() => void approve(a.id)}>Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => void reject(a.id)}>Reject</Button>
                    </div>
                  ) : null}
                </Panel>
              ))}
            </div>
          ) : (
            <Panel><EmptyState title="No payroll advances" description="Advances requested by employees will appear here." /></Panel>
          )}
        </div>
      </div>
      {newOpen ? <NewAdvanceModal onClose={() => setNewOpen(false)} onSaved={() => { setNewOpen(false); void load(); }} /> : null}
    </PageShell>
  );
}

function NewAdvanceModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
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
      await api.createPayrollAdvance(token, { employee_id: employeeId, amount: Number(amount), payment_date: paymentDate });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create advance.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>New payroll advance</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Employee</Label>
              <SelectField value={employeeId} onValueChange={setEmployeeId}>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </SelectField>
            </div>
            <div className="space-y-1.5"><Label>Amount (MVR)</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Payment date</Label><Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} /></div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} disabled={!employeeId || !amount} onClick={() => void submit()}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
