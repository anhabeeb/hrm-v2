import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { PageShell, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavSwitcher } from "../components/ui/route-nav-switcher";
import { Button, RowActionButton } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";
import { ASSETS_NAV_ITEMS } from "./assetsNav";
import type { AssetCategory, AssetDeductionRule } from "../types/assets";

export function AssetDeductionRulesPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const canManage = Boolean(user?.permissions.includes("assets.deductions.manage"));
  const [rows, setRows] = useState<AssetDeductionRule[]>([]);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<AssetDeductionRule | "new" | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const [ruleRows, categoryRows] = await Promise.all([api.listAssetDeductionRules(token), api.listAssetCategories(token)]);
      setRows(ruleRows.rules ?? []);
      setCategories(categoryRows.categories ?? []);
    } catch (err) {
      alerts.showApiError(err, "Unable to load asset deduction rules.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token]);

  async function toggle(row: AssetDeductionRule) {
    if (!token) return;
    try {
      await api.assetDeductionRuleAction(token, row.id, row.is_active ? "disable" : "enable");
      alerts.showSuccess("Rule updated", `Deduction rule was ${row.is_active ? "disabled" : "enabled"}.`);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to update deduction rule.");
    }
  }

  return (
    <PageShell constrained={false}>
      <div className="flex flex-col gap-3">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="px-4 flex items-center justify-between">
              <div>
                <RouteNavSwitcher items={ASSETS_NAV_ITEMS} moduleLabel="Assets" />
                <p className="mt-0.5 text-xs text-muted-foreground">Configure payroll deduction rules for lost or damaged item recovery</p>
              </div>
              {canManage ? <Button size="sm" onClick={() => setModal("new")}><Plus className="h-4 w-4" /> Create rule</Button> : null}
</div>

              <Panel className="shadow-none space-y-3 p-4">
          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : rows.length ? (
            <div className="flex flex-col gap-2">
              {rows.map((row) => (
                <Panel key={row.id} className="flex items-center gap-3.5 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-950">{row.category_name ?? "Any category"}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{String(row.condition_status ?? "-")} · {String(row.event_type ?? "-")} · {row.deduction_mode} · Amount {String(row.deduction_amount ?? row.fixed_amount ?? "-")} · Percent {String(row.deduction_percent ?? row.percentage ?? "-")}</p>
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: row.is_active ? "#EAF3DE" : "#F7F7FB", color: row.is_active ? "#27500A" : "#6B6F86" }}>{row.is_active ? "Active" : "Inactive"}</span>
                  {canManage ? (
                    <div className="flex shrink-0 gap-1.5">
                      <RowActionButton intent="edit" size="sm" title="Edit deduction rule" onClick={() => setModal(row)}>Edit</RowActionButton>
                      <Button size="sm" variant={row.is_active ? "danger" : "primary"} onClick={() => void toggle(row)}>{row.is_active ? "Disable" : "Enable"}</Button>
                    </div>
                  ) : null}
                </Panel>
              ))}
            </div>
          ) : (
            <Panel><EmptyState title="No deduction rules" description="Create rules for lost or damaged item recovery." /></Panel>
          )}

              </Panel>
        </div>
      </div>

      {modal ? <RuleModal rule={modal === "new" ? undefined : modal} categories={categories} onClose={() => setModal(null)} onSaved={() => { setModal(null); void load(); }} /> : null}
    </PageShell>
  );
}

function RuleModal({ rule, categories, onClose, onSaved }: { rule?: AssetDeductionRule; categories: AssetCategory[]; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [categoryId, setCategoryId] = useState(rule?.category_id ?? "");
  const [condition, setCondition] = useState(String(rule?.condition_status ?? ""));
  const [eventType, setEventType] = useState(String(rule?.event_type ?? "LOST"));
  const [deductionMode, setDeductionMode] = useState(rule?.deduction_mode ?? "REPLACEMENT_COST");
  const [amount, setAmount] = useState(String(rule?.deduction_amount ?? rule?.fixed_amount ?? ""));
  const [percent, setPercent] = useState(String(rule?.deduction_percent ?? rule?.percentage ?? ""));
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!token) return;
    setSaving(true);
    try {
      const payload = { category_id: categoryId || null, condition_status: condition, event_type: eventType, deduction_mode: deductionMode, deduction_amount: amount ? Number(amount) : null, deduction_percent: percent ? Number(percent) : null };
      if (rule) await api.updateAssetDeductionRule(token, rule.id, payload);
      else await api.createAssetDeductionRule(token, payload);
      alerts.showSuccess("Rule saved", "The deduction rule was saved.");
      onSaved();
    } catch (err) {
      alerts.showApiError(err, "Unable to save rule.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>{rule ? "Edit deduction rule" : "Create deduction rule"}</DialogTitle></DialogHeader>
        <DialogBody>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5"><Label>Category</Label><SelectField value={categoryId} onValueChange={setCategoryId}><option value="">Any category</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>Condition</Label><Input value={condition} onChange={(e) => setCondition(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Event type</Label><Input value={eventType} onChange={(e) => setEventType(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Deduction mode</Label><SelectField value={deductionMode} onValueChange={setDeductionMode}>{["NONE", "FIXED_AMOUNT", "REPLACEMENT_COST", "PERCENTAGE_OF_COST", "CUSTOM"].map((v) => <option key={v} value={v}>{v}</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>Amount</Label><Input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Percent</Label><Input type="number" min={0} max={100} value={percent} onChange={(e) => setPercent(e.target.value)} /></div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={() => void save()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
