import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { PageShell, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavSwitcher } from "../components/ui/route-nav-switcher";
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
import type { PayrollAdjustment } from "../types/payroll";

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`.toUpperCase();
}

function statusTone(status: string) {
  if (["APPROVED", "APPROVED_PLACEHOLDER", "APPLIED"].includes(status)) return { bg: "#EAF3DE", text: "#27500A" };
  if (status === "CANCELLED") return { bg: "#FCEBEB", text: "#A32D2D" };
  return { bg: "#FAEEDA", text: "#854F0B" };
}

export function PayrollAdjustmentsPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const [adjustments, setAdjustments] = useState<PayrollAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);

  const permissions = new Set(user?.permissions ?? []);
  const canApprove = permissions.has("payroll.adjustments.approve_placeholder") || permissions.has("payroll.adjustments.manage");

  async function load() {
    if (!token) return;
    const result = await api.listPayrollAdjustments(token, {});
    setAdjustments(result.adjustments ?? []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [token]);

  async function approve(id: string) {
    if (!token) return;
    try {
      await api.approvePayrollAdjustment(token, id);
      alerts.showSuccess("Adjustment approved", "The payroll adjustment was approved.");
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to approve adjustment");
    }
  }

  async function reject(id: string) {
    if (!token) return;
    try {
      await api.cancelPayrollAdjustment(token, id, "Rejected from Payroll adjustments list");
      alerts.showSuccess("Adjustment rejected", "The payroll adjustment was rejected.");
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to reject adjustment");
    }
  }

  return (
    <PageShell constrained={false}>
      <div className="flex flex-col gap-3">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="px-4 flex items-center justify-between">
            <RouteNavSwitcher items={PAYROLL_NAV_ITEMS} moduleLabel="Payroll" />
            <Button size="sm" onClick={() => setNewOpen(true)}><Plus className="h-4 w-4" /> New adjustment</Button>
          </div>

              <Panel className="shadow-none space-y-3 p-4">
          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 2 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : adjustments.length ? (
            <div className="flex flex-col gap-2">
              {adjustments.map((a) => (
                <Panel key={a.id} className="flex items-center gap-3.5 p-3">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#FAEEDA] text-xs font-medium text-[#854F0B]">{initialsOf(a.employee_name ?? "?")}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-950">{a.employee_name}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{a.reason} · {a.amount >= 0 ? "+" : ""}MVR {a.amount.toLocaleString()}</p>
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: statusTone(a.status).bg, color: statusTone(a.status).text }}>{humanizeTechnicalLabel(a.status)}</span>
                  {a.status === "DRAFT" && canApprove ? (
                    <div className="flex shrink-0 gap-1.5">
                      <Button size="sm" variant="actionSave" onClick={() => void approve(a.id)}>Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => void reject(a.id)}>Reject</Button>
                    </div>
                  ) : null}
                </Panel>
              ))}
            </div>
          ) : (
            <Panel><EmptyState title="No payroll adjustments" description="One-off bonuses or corrections will appear here." /></Panel>
          )}

              </Panel>
        </div>
      </div>
      {newOpen ? <NewAdjustmentModal onClose={() => setNewOpen(false)} onSaved={() => { setNewOpen(false); void load(); }} /> : null}
    </PageShell>
  );
}

function NewAdjustmentModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [kind, setKind] = useState<"EARNING" | "DEDUCTION">("EARNING");
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
      const signedAmount = kind === "DEDUCTION" ? -Math.abs(Number(amount)) : Math.abs(Number(amount));
      await api.createPayrollAdjustment(token, { employee_id: employeeId, adjustment_type: kind, amount: signedAmount, reason });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create adjustment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>New payroll adjustment</DialogTitle></DialogHeader>
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
              <SelectField value={kind} onValueChange={(v) => setKind(v as "EARNING" | "DEDUCTION")}>
                <option value="EARNING">Bonus / addition</option>
                <option value="DEDUCTION">Correction / reduction</option>
              </SelectField>
            </div>
            <div className="space-y-1.5"><Label>Amount (MVR)</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Performance bonus" /></div>
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
