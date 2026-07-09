import { useEffect, useState } from "react";
import { Landmark, Plus } from "lucide-react";
import { PageShell, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavSwitcher } from "../components/ui/route-nav-switcher";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { PAYROLL_NAV_ITEMS } from "./payrollNav";
import type { PaymentInstitution } from "../types/payroll";

export function PayrollInstitutionsPage() {
  const { token } = useAuth();
  const [institutions, setInstitutions] = useState<PaymentInstitution[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);

  function load() {
    if (!token) return;
    Promise.all([api.listPaymentInstitutions(token), api.listPayrollPaymentRegisters(token).catch(() => ({ payments: [] }))]).then(([instResult, regResult]) => {
      setInstitutions(instResult.institutions ?? []);
      const map: Record<string, number> = {};
      for (const p of regResult.payments ?? []) {
        const key = p.bank_name_snapshot ?? "Unknown";
        map[key] = (map[key] ?? 0) + 1;
      }
      setCounts(map);
      setLoading(false);
    });
  }

  useEffect(() => { load(); }, [token]);

  return (
    <PageShell constrained={false}>
      <div className="flex flex-col gap-3">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="px-4 flex items-center justify-between">
            <RouteNavSwitcher items={PAYROLL_NAV_ITEMS} moduleLabel="Payroll" />
            <Button size="sm" onClick={() => setNewOpen(true)}><Plus className="h-4 w-4" /> Add institution</Button>
          </div>

              <Panel className="shadow-none space-y-3 p-4">
          {loading ? (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">{Array.from({ length: 2 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : institutions.length ? (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {institutions.map((inst) => (
                <Panel key={inst.id} className="flex items-center gap-3 p-3">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#E6F1FB]"><Landmark className="h-4 w-4 text-[#0C447C]" /></div>
                  <div>
                    <p className="text-xs font-medium text-slate-950">{inst.name}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">Code {inst.code} · {counts[inst.name] ?? 0} employees</p>
                  </div>
                </Panel>
              ))}
            </div>
          ) : (
            <Panel><EmptyState title="No payment institutions configured" description="Add banks or payment providers used for salary transfers." /></Panel>
          )}

              </Panel>
        </div>
      </div>
      {newOpen ? <NewInstitutionModal onClose={() => setNewOpen(false)} onSaved={() => { setNewOpen(false); load(); }} /> : null}
    </PageShell>
  );
}

function NewInstitutionModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [type, setType] = useState<"BANK" | "WALLET_PROVIDER" | "CASH_LOCATION" | "OTHER">("BANK");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      await api.createPaymentInstitution(token, { name, code, type });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create institution.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Add payment institution</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bank of Maldives" /></div>
            <div className="space-y-1.5"><Label>Code</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. BML" /></div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <SelectField value={type} onValueChange={(v) => setType(v as typeof type)}>
                <option value="BANK">Bank</option>
                <option value="WALLET_PROVIDER">Wallet provider</option>
                <option value="CASH_LOCATION">Cash location</option>
                <option value="OTHER">Other</option>
              </SelectField>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} disabled={!name.trim() || !code.trim()} onClick={() => void submit()}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
