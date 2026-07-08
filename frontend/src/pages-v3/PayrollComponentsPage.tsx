import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { PageShell, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavRail } from "../components/ui/route-nav-rail";
import { Button, RowActionButton } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";
import { PAYROLL_NAV_ITEMS } from "./payrollNav";
import type { PayrollComponent } from "../types/payroll";

const TYPES = ["BASIC_SALARY", "ALLOWANCE", "FIXED_DEDUCTION", "VARIABLE_DEDUCTION", "ATTENDANCE_DEDUCTION", "LEAVE_DEDUCTION", "ADVANCE_DEDUCTION", "ONE_TIME_DEDUCTION", "OVERTIME_PLACEHOLDER", "BENEFIT_PLACEHOLDER", "ADJUSTMENT", "EARNING", "DEDUCTION"] as const;
const CALCULATION_TYPES = ["FIXED_AMOUNT", "PERCENTAGE_OF_BASIC", "PERCENTAGE_OF_GROSS", "DAILY_RATE", "HOURLY_RATE", "FORMULA_PLACEHOLDER", "MANUAL", "FIXED", "VARIABLE", "PERCENTAGE"] as const;
const CATEGORIES = ["BASIC", "ALLOWANCE", "BENEFIT", "OVERTIME", "ADVANCE", "ATTENDANCE", "LEAVE", "OTHER", "SALARY", "DEDUCTION", "ADJUSTMENT"] as const;

function money(value: number | null | undefined) {
  return `MVR ${Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

export function PayrollComponentsPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("payroll.components.manage") || permissions.has("payroll.view");
  const canManage = permissions.has("payroll.components.manage");
  const [rows, setRows] = useState<PayrollComponent[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<PayrollComponent> | null>(null);

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    try {
      setRows((await api.listPayrollComponents(token)).components);
    } catch (err) {
      alerts.showApiError(err, "Unable to load payroll components.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token, canView]);

  const filtered = rows.filter((row) => `${row.code} ${row.name} ${row.category ?? ""}`.toLowerCase().includes(search.toLowerCase()));

  async function save() {
    if (!token || !editing) return;
    try {
      if (editing.id) await api.updatePayrollComponent(token, editing.id, editing);
      else await api.createPayrollComponent(token, editing);
      alerts.showSuccess("Component saved", "Payroll component was saved.");
      setEditing(null);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to save component.");
    }
  }

  async function toggle(component: PayrollComponent) {
    if (!token) return;
    try {
      await api.payrollComponentAction(token, component.id, component.is_active ? "disable" : "enable");
      alerts.showSuccess("Component updated", `Payroll component ${component.is_active ? "disabled" : "enabled"}.`);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to update component.");
    }
  }

  if (!canView) {
    return (
      <PageShell constrained={false}>
        <div className="flex gap-4">
          <RouteNavRail items={PAYROLL_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
          <div className="min-w-0 flex-1"><Panel><EmptyState title="Payroll components unavailable" description="Your account needs payroll permission." /></Panel></div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={PAYROLL_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-slate-950">Components</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Earning and deduction components used in payroll result line items</p>
            </div>
            {canManage ? <Button size="sm" onClick={() => setEditing({ type: "ALLOWANCE", calculation_type: "FIXED_AMOUNT", is_active: true, sort_order: 100 })}><Plus className="h-4 w-4" /> Create component</Button> : null}
          </div>

          <Input className="h-8 w-64 text-xs" placeholder="Search code/name/category..." value={search} onChange={(e) => setSearch(e.target.value)} />

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : filtered.length ? (
            <div className="flex flex-col gap-2">
              {filtered.map((row) => (
                <Panel key={row.id} className="flex items-center gap-3.5 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-950">{row.name} <span className="font-mono font-normal text-muted-foreground">{row.code}</span></p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{row.type} · {row.category ?? "No category"} · {row.calculation_type} · {row.default_percentage ? `${row.default_percentage}%` : money(row.default_amount)}{Boolean(row.is_taxable) ? " · Taxable" : ""}</p>
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: row.is_active ? "#EAF3DE" : "#F7F7FB", color: row.is_active ? "#27500A" : "#6B6F86" }}>{row.is_active ? "Active" : "Inactive"}</span>
                  {canManage ? (
                    <div className="flex shrink-0 gap-1.5">
                      <RowActionButton intent="edit" size="sm" title="Edit component" onClick={() => setEditing(row)}>Edit</RowActionButton>
                      <Button size="sm" variant={row.is_active ? "danger" : "primary"} onClick={() => void toggle(row)}>{row.is_active ? "Disable" : "Enable"}</Button>
                    </div>
                  ) : null}
                </Panel>
              ))}
            </div>
          ) : (
            <Panel><EmptyState title="No components found" description="Create a component or adjust the search." /></Panel>
          )}
        </div>
      </div>

      {editing ? <ComponentModal value={editing} onChange={setEditing} onClose={() => setEditing(null)} onSave={() => void save()} /> : null}
    </PageShell>
  );
}

function ComponentModal({ value, onChange, onClose, onSave }: { value: Partial<PayrollComponent>; onChange: (value: Partial<PayrollComponent>) => void; onClose: () => void; onSave: () => void }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>{value.id ? "Edit component" : "Create component"}</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Code</Label><Input value={value.code ?? ""} onChange={(e) => onChange({ ...value, code: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Name</Label><Input value={value.name ?? ""} onChange={(e) => onChange({ ...value, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Type</Label><SelectField value={value.type ?? "ALLOWANCE"} onValueChange={(v) => onChange({ ...value, type: v as PayrollComponent["type"] })}>{TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>Category</Label><SelectField value={value.category ?? ""} onValueChange={(v) => onChange({ ...value, category: v || null })}><option value="">None</option>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>Calculation type</Label><SelectField value={value.calculation_type ?? "FIXED_AMOUNT"} onValueChange={(v) => onChange({ ...value, calculation_type: v as PayrollComponent["calculation_type"] })}>{CALCULATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>Sort order</Label><Input type="number" value={value.sort_order ?? 100} onChange={(e) => onChange({ ...value, sort_order: Number(e.target.value) })} /></div>
            <div className="space-y-1.5"><Label>Default amount</Label><Input type="number" value={value.default_amount ?? ""} onChange={(e) => onChange({ ...value, default_amount: e.target.value ? Number(e.target.value) : null })} /></div>
            <div className="space-y-1.5"><Label>Default percentage</Label><Input type="number" value={value.default_percentage ?? ""} onChange={(e) => onChange({ ...value, default_percentage: e.target.value ? Number(e.target.value) : null })} /></div>
            <label className="flex items-center gap-2 text-xs text-slate-950"><input type="checkbox" checked={Boolean(value.applies_to_basic_salary)} onChange={(e) => onChange({ ...value, applies_to_basic_salary: e.target.checked })} /> Applies to basic salary</label>
            <label className="flex items-center gap-2 text-xs text-slate-950"><input type="checkbox" checked={Boolean(value.is_taxable)} onChange={(e) => onChange({ ...value, is_taxable: e.target.checked })} /> Taxable</label>
            <label className="flex items-center gap-2 text-xs text-slate-950"><input type="checkbox" checked={Boolean(value.is_active)} onChange={(e) => onChange({ ...value, is_active: e.target.checked })} /> Active</label>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => { if (!value.code?.trim() || !value.name?.trim()) { setError("Code and name are required."); return; } onSave(); }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
