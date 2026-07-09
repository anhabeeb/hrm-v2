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
import type { AssetCategory } from "../types/assets";

export function AssetCategoriesPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const canManage = Boolean(user?.permissions.includes("assets.settings.manage"));
  const [rows, setRows] = useState<AssetCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<AssetCategory | "new" | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      setRows((await api.listAssetCategories(token)).categories ?? []);
    } catch (err) {
      alerts.showApiError(err, "Unable to load asset categories.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token]);

  async function toggle(row: AssetCategory) {
    if (!token) return;
    try {
      await api.assetCategoryAction(token, row.id, row.is_active ? "disable" : "enable");
      alerts.showSuccess("Category updated", `${row.name} was ${row.is_active ? "disabled" : "enabled"}.`);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to update category.");
    }
  }

  return (
    <PageShell constrained={false}>
      <div className="flex flex-col gap-3">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="px-4 flex items-center justify-between">
              <div>
                <RouteNavSwitcher items={ASSETS_NAV_ITEMS} moduleLabel="Assets" />
                <p className="mt-0.5 text-xs text-muted-foreground">Configure asset and uniform category templates without hard deleting protected defaults</p>
              </div>
              {canManage ? <Button size="sm" onClick={() => setModal("new")}><Plus className="h-4 w-4" /> Create category</Button> : null}
</div>

              <Panel className="shadow-none space-y-3 p-4">
          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : rows.length ? (
            <div className="flex flex-col gap-2">
              {rows.map((row) => (
                <Panel key={row.id} className="flex items-center gap-3.5 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-950">{row.name} <span className="font-mono font-normal text-muted-foreground">{row.code}</span></p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{row.type ?? row.category_type} · {row.description ?? "-"} · Sort {row.sort_order}</p>
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: row.is_active ? "#EAF3DE" : "#F7F7FB", color: row.is_active ? "#27500A" : "#6B6F86" }}>{row.is_active ? "Active" : "Inactive"}</span>
                  {canManage ? (
                    <div className="flex shrink-0 gap-1.5">
                      <RowActionButton intent="edit" size="sm" title="Edit category" onClick={() => setModal(row)}>Edit</RowActionButton>
                      <Button size="sm" variant={row.is_active ? "danger" : "primary"} onClick={() => void toggle(row)}>{row.is_active ? "Disable" : "Enable"}</Button>
                    </div>
                  ) : null}
                </Panel>
              ))}
            </div>
          ) : (
            <Panel><EmptyState title="No categories" description="Seeded defaults appear after schema seed is applied." /></Panel>
          )}

              </Panel>
        </div>
      </div>

      {modal ? <CategoryModal category={modal === "new" ? undefined : modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); void load(); }} /> : null}
    </PageShell>
  );
}

function CategoryModal({ category, onClose, onSaved }: { category?: AssetCategory; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [code, setCode] = useState(category?.code ?? "");
  const [name, setName] = useState(category?.name ?? "");
  const [type, setType] = useState<string>(category?.type ?? "ASSET");
  const [sortOrder, setSortOrder] = useState(String(category?.sort_order ?? 100));
  const [description, setDescription] = useState(category?.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!token) return;
    if (!code.trim() || !name.trim()) { setError("Code and name are required."); return; }
    setSaving(true);
    try {
      const payload = { code, name, type: type as AssetCategory["type"], sort_order: Number(sortOrder), description: description || null };
      if (category) await api.updateAssetCategory(token, category.id, payload);
      else await api.createAssetCategory(token, payload);
      alerts.showSuccess("Category saved", "The asset category was saved.");
      onSaved();
    } catch (err) {
      alerts.showApiError(err, "Unable to save category.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>{category ? "Edit category" : "Create category"}</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Code</Label><Input value={code} onChange={(e) => setCode(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Type</Label><SelectField value={type} onValueChange={setType}>{["ASSET", "UNIFORM", "OTHER"].map((v) => <option key={v} value={v}>{v}</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>Sort order</Label><Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
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
