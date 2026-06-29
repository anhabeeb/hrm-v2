import { Pencil, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AssetsNav } from "../components/assets/AssetsNav";
import { ExportMenu } from "../components/export/ExportMenu";
import { ActiveFilterChips, FilterResetButton, FilterSection, MoreFiltersSheet, StandardFilterBar, StandardSearchInput, StandardSelectFilter } from "../components/filters";
import { ActionTextButton } from "../components/ui/action-button";
import { Badge } from "../components/ui/badge";
import { Button, RowActionButton } from "../components/ui/button";
import { ConfirmDialog } from "../components/ui/dialogs";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { PageHeader, PageShell, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import type { AssetCategory, AssetItem } from "../types/assets";

export function AssetsItemsPage() {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canManage = permissions.has("assets.manage");
  const [items, setItems] = useState<AssetItem[]>([]);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [filters, setFilters] = useState({ search: "", status: "", category_id: "" });
  const [modal, setModal] = useState<AssetItem | "new" | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<AssetItem | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const resetFilters = () => setFilters({ search: "", status: "", category_id: "" });
  const activeFilterChips = useMemo(() => [
    ...(filters.search ? [{ key: "search", label: "Search", value: filters.search, onRemove: () => setFilters((current) => ({ ...current, search: "" })) }] : []),
    ...(filters.status ? [{ key: "status", label: "Status", value: filters.status.replace(/_/g, " "), title: filters.status, onRemove: () => setFilters((current) => ({ ...current, status: "" })) }] : []),
    ...(filters.category_id ? [{ key: "category", label: "Category", value: categories.find((category) => category.id === filters.category_id)?.name ?? filters.category_id, onRemove: () => setFilters((current) => ({ ...current, category_id: "" })) }] : [])
  ], [categories, filters]);

  async function load() {
    if (!token) return;
    setError(null);
    try {
      const [itemRows, categoryRows] = await Promise.all([api.listAssetItems(token, filters), api.listAssetCategories(token)]);
      setItems(itemRows.items ?? []);
      setCategories(categoryRows.categories ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load asset items.");
    }
  }

  useEffect(() => { void load(); }, [token]);

  async function archive(item: AssetItem) {
    if (!token) return;
    try {
      await api.archiveAssetItem(token, item.id, archiveReason.trim());
      setArchiveTarget(null);
      setArchiveReason("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to archive item.");
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Asset Items"
        description="Inventory register for uniforms, devices, cards, keys, and other controlled items."
        actions={
          <>
          <Link to="/settings/admin/imports"><ActionTextButton intent="import" size="sm">Asset import validation</ActionTextButton></Link>
          <ExportMenu
            moduleName="Asset items"
            rows={items as unknown as Record<string, unknown>[]}
            columns={["code", "name", "category_name", "variant", "size", "serial_no", "serial_number", "condition_status", "status", "replacement_cost", "notes"]}
            filterSummary={activeFilterChips.map((chip) => `${chip.label}: ${chip.value}`)}
          />
          </>
        }
      />
      <AssetsNav />
      <Panel className="p-4">
        <StandardFilterBar
          search={<StandardSearchInput value={filters.search} onDebouncedChange={(search) => setFilters((current) => ({ ...current, search }))} placeholder="Search code/name/serial" />}
          reset={<FilterResetButton onReset={resetFilters} />}
          actions={<><Button variant="outline" size="sm" onClick={() => void load()}>Filter</Button>{canManage ? <Button size="sm" onClick={() => setModal("new")}>Create item</Button> : null}</>}
          moreFilters={
            <MoreFiltersSheet title="Asset item filters" onReset={() => setFilters((current) => ({ ...current, category_id: "" }))}>
              <FilterSection title="Inventory">
                <StandardSelectFilter value={filters.category_id} onValueChange={(category_id) => setFilters((current) => ({ ...current, category_id }))} allLabel="All categories" width="documentType" options={categories.map((category) => ({ value: category.id, label: category.name }))} />
              </FilterSection>
            </MoreFiltersSheet>
          }
        >
          <StandardSelectFilter value={filters.status} onValueChange={(status) => setFilters((current) => ({ ...current, status }))} allLabel="All status" width="status" options={["AVAILABLE","ISSUED","DAMAGED","LOST","WRITTEN_OFF","ARCHIVED"].map((status) => ({ value: status, label: status.replace(/_/g, " ") }))} />
        </StandardFilterBar>
        <ActiveFilterChips chips={activeFilterChips} className="mt-2" />
      </Panel>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Panel className="overflow-hidden p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Category</TableHead><TableHead>Variant</TableHead><TableHead>Size</TableHead><TableHead>Serial</TableHead><TableHead>Condition</TableHead><TableHead>Status</TableHead><TableHead>Replacement cost</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{items.map((item) => <TableRow key={item.id}><TableCell>{item.code}</TableCell><TableCell>{item.name}</TableCell><TableCell>{item.category_name ?? "-"}</TableCell><TableCell>{item.variant ?? "-"}</TableCell><TableCell>{item.size ?? "-"}</TableCell><TableCell>{item.serial_no ?? item.serial_number ?? "-"}</TableCell><TableCell>{item.condition_status}</TableCell><TableCell><Badge tone={item.status === "AVAILABLE" ? "success" : item.status === "ISSUED" ? "info" : item.status === "ARCHIVED" ? "neutral" : "warning"}>{item.status}</Badge></TableCell><TableCell>{item.replacement_cost ?? "-"}</TableCell><TableCell><div className="flex justify-end gap-1">{canManage ? <><RowActionButton intent="edit" title="Edit" onClick={() => setModal(item)}><Pencil className="h-4 w-4" /></RowActionButton><RowActionButton intent="archive" title="Delete" onClick={() => { setArchiveTarget(item); setArchiveReason(""); }}><Trash2 className="h-4 w-4" /></RowActionButton></> : "-"}</div></TableCell></TableRow>)}</TableBody></Table>{!items.length ? <EmptyState title="No asset items" description="Create item records before issuing assets to employees." /> : null}</div></Panel>
      {modal ? <ItemModal item={modal === "new" ? undefined : modal} categories={categories} onClose={() => setModal(null)} onSaved={() => { setModal(null); void load(); }} /> : null}
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="Archive asset item"
        description={`Archive ${archiveTarget?.name ?? "this item"}? This keeps history but removes it from active use.`}
        confirmLabel="Archive"
        tone="danger"
        requireReason
        reasonValue={archiveReason}
        onReasonChange={setArchiveReason}
        onCancel={() => { setArchiveTarget(null); setArchiveReason(""); }}
        onConfirm={() => archiveTarget ? void archive(archiveTarget) : undefined}
      />
    </PageShell>
  );
}

function ItemModal({ item, categories, onClose, onSaved }: { item?: AssetItem; categories: AssetCategory[]; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const [form, setForm] = useState<Partial<AssetItem>>({ category_id: item?.category_id ?? categories[0]?.id ?? "", code: item?.code ?? "", name: item?.name ?? "", variant: item?.variant ?? "", size: item?.size ?? "", serial_no: item?.serial_no ?? item?.serial_number ?? "", condition_status: item?.condition_status ?? "GOOD", status: item?.status ?? "AVAILABLE", replacement_cost: item?.replacement_cost ?? null, notes: item?.notes ?? "" });
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (!token) return;
    try {
      if (item) await api.updateAssetItem(token, item.id, form);
      else await api.createAssetItem(token, form);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save asset item.");
    }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4"><div className="w-full max-w-2xl rounded-lg border bg-white shadow-xl"><div className="flex justify-between border-b px-4 py-3"><h2 className="text-sm font-semibold">{item ? "Edit item" : "Create item"}</h2><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></div><div className="grid gap-3 p-4 md:grid-cols-2"><SelectField label="Category" value={form.category_id ?? ""} onChange={(event) => setForm({ ...form, category_id: event.target.value })}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</SelectField><Field label="Code" value={form.code ?? ""} onChange={(code) => setForm({ ...form, code })} /><Field label="Name" value={form.name ?? ""} onChange={(name) => setForm({ ...form, name })} /><Field label="Variant" value={form.variant ?? ""} onChange={(variant) => setForm({ ...form, variant })} /><Field label="Size" value={form.size ?? ""} onChange={(size) => setForm({ ...form, size })} /><Field label="Serial no" value={form.serial_no ?? ""} onChange={(serial_no) => setForm({ ...form, serial_no })} /><SelectField label="Condition" value={form.condition_status ?? "GOOD"} onChange={(event) => setForm({ ...form, condition_status: event.target.value })}>{["NEW","GOOD","FAIR","DAMAGED","LOST","WRITTEN_OFF"].map((value) => <option key={value} value={value}>{value}</option>)}</SelectField><SelectField label="Status" value={form.status ?? "AVAILABLE"} onChange={(event) => setForm({ ...form, status: event.target.value as AssetItem["status"] })}>{["AVAILABLE","ISSUED","DAMAGED","LOST","WRITTEN_OFF","ARCHIVED"].map((value) => <option key={value} value={value}>{value}</option>)}</SelectField><Field label="Replacement cost" type="number" value={String(form.replacement_cost ?? "")} onChange={(value) => setForm({ ...form, replacement_cost: value ? Number(value) : null })} /><Field label="Notes" value={form.notes ?? ""} onChange={(notes) => setForm({ ...form, notes })} /></div>{error ? <div className="mx-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}<div className="flex justify-end gap-2 border-t px-4 py-3"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={() => void save()}>Save</Button></div></div></div>;
}

function Field({ label, value, type = "text", onChange }: { label: string; value: string; type?: string; onChange: (value: string) => void }) {
  return <div className="space-y-1.5"><Label>{label}</Label><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}
