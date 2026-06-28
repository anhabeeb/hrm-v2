import { Pencil, Power } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { AssetsNav } from "../components/assets/AssetsNav";
import { Badge } from "../components/ui/badge";
import { Button, RowActionButton } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { PageHeader, PageShell, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import type { AssetCategory, AssetDeductionRule } from "../types/assets";

export function AssetSettingsPage({ mode = "categories" }: { mode?: "categories" | "deduction-rules" }) {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canManageCategories = permissions.has("assets.settings.manage");
  const canManageRules = permissions.has("assets.deductions.manage");
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [rules, setRules] = useState<AssetDeductionRule[]>([]);
  const [categoryModal, setCategoryModal] = useState<AssetCategory | "new" | null>(null);
  const [ruleModal, setRuleModal] = useState<AssetDeductionRule | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    setError(null);
    try {
      const [categoryRows, ruleRows] = await Promise.all([api.listAssetCategories(token), api.listAssetDeductionRules(token)]);
      setCategories(categoryRows.categories ?? []);
      setRules(ruleRows.rules ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load asset settings.");
    }
  }

  useEffect(() => { void load(); }, [token]);

  async function toggleCategory(row: AssetCategory) {
    if (!token) return;
    await api.assetCategoryAction(token, row.id, row.is_active ? "disable" : "enable");
    await load();
  }

  async function toggleRule(row: AssetDeductionRule) {
    if (!token) return;
    await api.assetDeductionRuleAction(token, row.id, row.is_active ? "disable" : "enable");
    await load();
  }

  return (
    <PageShell>
      <PageHeader title={mode === "categories" ? "Asset Categories" : "Asset Deduction Rules"} description="Configure asset and uniform templates without hard deleting protected defaults." />
      <AssetsNav />
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {mode === "categories" ? (
        <Panel className="overflow-hidden p-0"><div className="flex justify-end border-b p-3">{canManageCategories ? <Button size="sm" onClick={() => setCategoryModal("new")}>Create category</Button> : null}</div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead>Description</TableHead><TableHead>Status</TableHead><TableHead>Sort</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{categories.map((row) => <TableRow key={row.id}><TableCell>{row.code}</TableCell><TableCell>{row.name}</TableCell><TableCell>{row.type ?? row.category_type}</TableCell><TableCell>{row.description ?? "-"}</TableCell><TableCell><Badge tone={row.is_active ? "success" : "neutral"}>{row.is_active ? "Active" : "Inactive"}</Badge></TableCell><TableCell>{row.sort_order}</TableCell><TableCell><div className="flex justify-end gap-1">{canManageCategories ? <><RowActionButton intent="edit" title="Edit category" aria-label="Edit category" onClick={() => setCategoryModal(row)}><Pencil className="h-4 w-4" /></RowActionButton><RowActionButton intent={row.is_active ? "disable" : "enable"} title={row.is_active ? "Disable category" : "Enable category"} aria-label={row.is_active ? "Disable category" : "Enable category"} onClick={() => void toggleCategory(row)}><Power className="h-4 w-4" /></RowActionButton></> : "-"}</div></TableCell></TableRow>)}</TableBody></Table>{!categories.length ? <EmptyState title="No categories" description="Seeded defaults appear after schema seed is applied." /> : null}</div></Panel>
      ) : (
        <Panel className="overflow-hidden p-0"><div className="flex justify-end border-b p-3">{canManageRules ? <Button size="sm" onClick={() => setRuleModal("new")}>Create rule</Button> : null}</div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Category</TableHead><TableHead>Condition</TableHead><TableHead>Event</TableHead><TableHead>Mode</TableHead><TableHead>Amount</TableHead><TableHead>Percent</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{rules.map((row) => <TableRow key={row.id}><TableCell>{row.category_name ?? "-"}</TableCell><TableCell>{String(row.condition_status ?? "-")}</TableCell><TableCell>{String(row.event_type ?? "-")}</TableCell><TableCell>{row.deduction_mode}</TableCell><TableCell>{String(row.deduction_amount ?? row.fixed_amount ?? "-")}</TableCell><TableCell>{String(row.deduction_percent ?? row.percentage ?? "-")}</TableCell><TableCell><Badge tone={row.is_active ? "success" : "neutral"}>{row.is_active ? "Active" : "Inactive"}</Badge></TableCell><TableCell><div className="flex justify-end gap-1">{canManageRules ? <><RowActionButton intent="edit" title="Edit deduction rule" aria-label="Edit deduction rule" onClick={() => setRuleModal(row)}><Pencil className="h-4 w-4" /></RowActionButton><RowActionButton intent={row.is_active ? "disable" : "enable"} title={row.is_active ? "Disable deduction rule" : "Enable deduction rule"} aria-label={row.is_active ? "Disable deduction rule" : "Enable deduction rule"} onClick={() => void toggleRule(row)}><Power className="h-4 w-4" /></RowActionButton></> : "-"}</div></TableCell></TableRow>)}</TableBody></Table>{!rules.length ? <EmptyState title="No deduction rules" description="Create rules for lost or damaged item recovery." /> : null}</div></Panel>
      )}
      {categoryModal ? <CategoryModal category={categoryModal === "new" ? undefined : categoryModal} onClose={() => setCategoryModal(null)} onSaved={() => { setCategoryModal(null); void load(); }} /> : null}
      {ruleModal ? <RuleModal rule={ruleModal === "new" ? undefined : ruleModal} categories={categories} onClose={() => setRuleModal(null)} onSaved={() => { setRuleModal(null); void load(); }} /> : null}
    </PageShell>
  );
}

function CategoryModal({ category, onClose, onSaved }: { category?: AssetCategory; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const [form, setForm] = useState<Partial<AssetCategory>>({ code: category?.code ?? "", name: category?.name ?? "", type: category?.type ?? "ASSET", description: category?.description ?? "", sort_order: category?.sort_order ?? 100 });
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (!token) return;
    try {
      if (category) await api.updateAssetCategory(token, category.id, form);
      else await api.createAssetCategory(token, form);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save category.");
    }
  }
  return <Modal title={category ? "Edit category" : "Create category"} error={error} onClose={onClose} onSave={save}><Field label="Code" value={form.code ?? ""} onChange={(code) => setForm({ ...form, code })} /><Field label="Name" value={form.name ?? ""} onChange={(name) => setForm({ ...form, name })} /><SelectField label="Type" value={form.type ?? "ASSET"} onChange={(event) => setForm({ ...form, type: event.target.value as AssetCategory["type"] })}>{["ASSET","UNIFORM","OTHER"].map((value) => <option key={value} value={value}>{value}</option>)}</SelectField><Field label="Sort order" type="number" value={String(form.sort_order ?? 100)} onChange={(sort_order) => setForm({ ...form, sort_order: Number(sort_order) })} /><Field label="Description" value={form.description ?? ""} onChange={(description) => setForm({ ...form, description })} /></Modal>;
}

function RuleModal({ rule, categories, onClose, onSaved }: { rule?: AssetDeductionRule; categories: AssetCategory[]; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const [form, setForm] = useState<Partial<AssetDeductionRule>>({ category_id: rule?.category_id ?? "", condition_status: rule?.condition_status ?? "", event_type: rule?.event_type ?? "LOST", deduction_mode: rule?.deduction_mode ?? "REPLACEMENT_COST", deduction_amount: rule?.deduction_amount ?? rule?.fixed_amount ?? null, deduction_percent: rule?.deduction_percent ?? rule?.percentage ?? null });
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (!token) return;
    try {
      if (rule) await api.updateAssetDeductionRule(token, rule.id, form);
      else await api.createAssetDeductionRule(token, form);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save rule.");
    }
  }
  return <Modal title={rule ? "Edit deduction rule" : "Create deduction rule"} error={error} onClose={onClose} onSave={save}><SelectField label="Category" value={form.category_id ?? ""} onChange={(event) => setForm({ ...form, category_id: event.target.value })}><option value="">Any category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</SelectField><Field label="Condition" value={String(form.condition_status ?? "")} onChange={(condition_status) => setForm({ ...form, condition_status })} /><Field label="Event type" value={String(form.event_type ?? "")} onChange={(event_type) => setForm({ ...form, event_type })} /><SelectField label="Deduction mode" value={form.deduction_mode ?? "REPLACEMENT_COST"} onChange={(event) => setForm({ ...form, deduction_mode: event.target.value })}>{["NONE","FIXED_AMOUNT","REPLACEMENT_COST","PERCENTAGE_OF_COST","CUSTOM"].map((value) => <option key={value} value={value}>{value}</option>)}</SelectField><Field label="Amount" type="number" value={String(form.deduction_amount ?? "")} onChange={(value) => setForm({ ...form, deduction_amount: value ? Number(value) : null })} /><Field label="Percent" type="number" value={String(form.deduction_percent ?? "")} onChange={(value) => setForm({ ...form, deduction_percent: value ? Number(value) : null })} /></Modal>;
}

function Modal({ title, error, children, onClose, onSave }: { title: string; error: string | null; children: ReactNode; onClose: () => void; onSave: () => void | Promise<void> }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4"><div className="w-full max-w-2xl rounded-lg border bg-white shadow-xl"><div className="flex justify-between border-b px-4 py-3"><h2 className="text-sm font-semibold">{title}</h2><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></div><div className="grid gap-3 p-4 md:grid-cols-2">{children}</div>{error ? <div className="mx-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}<div className="flex justify-end gap-2 border-t px-4 py-3"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={() => void onSave()}>Save</Button></div></div></div>;
}

function Field({ label, value, type = "text", onChange }: { label: string; value: string; type?: string; onChange: (value: string) => void }) {
  return <div className="space-y-1.5"><Label>{label}</Label><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}
