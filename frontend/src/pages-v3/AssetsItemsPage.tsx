import { useEffect, useMemo, useState } from "react";
import { Laptop, Package, Plus, Shirt } from "lucide-react";
import { PageShell, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavRail } from "../components/ui/route-nav-rail";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import { ASSETS_NAV_ITEMS } from "./assetsNav";
import type { AssetCategory, AssetItem } from "../types/assets";
import type { OrganizationLocation } from "../types/organization";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

interface ItemGroup {
  key: string;
  name: string;
  categoryName: string;
  categoryId: string;
  isUniform: boolean;
  locationName: string;
  total: number;
  assigned: number;
  items: AssetItem[];
}

function iconFor(categoryName: string, isUniform: boolean) {
  if (isUniform) return Shirt;
  if (/electronic|laptop|computer|device/i.test(categoryName)) return Laptop;
  return Package;
}

export function AssetsItemsPage() {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canManage = permissions.has("assets.manage");

  const [items, setItems] = useState<AssetItem[]>([]);
  const [overdueCount, setOverdueCount] = useState(0);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [locationId, setLocationId] = useState("all");
  const [stockStatus, setStockStatus] = useState("all");
  const [moreOpen, setMoreOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [detailGroup, setDetailGroup] = useState<ItemGroup | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [itemResult, assignmentResult, categoryResult, locationResult] = await Promise.all([
        api.listAssetItems(token, {}),
        api.listAssetAssignments(token, { status: "ISSUED" }),
        api.listAssetCategories(token),
        api.listLocations(token)
      ]);
      setItems(itemResult.items ?? []);
      setOverdueCount((assignmentResult.assignments ?? []).filter((a) => a.expected_return_date && a.expected_return_date < todayIso()).length);
      setCategories(categoryResult.categories ?? []);
      setLocations(locationResult.locations ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load asset items.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token]);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const locationById = useMemo(() => new Map(locations.map((l) => [l.id, l.name])), [locations]);

  const groups = useMemo<ItemGroup[]>(() => {
    const map = new Map<string, ItemGroup>();
    for (const item of items) {
      const key = `${item.category_id}::${item.name}`;
      const category = categoryById.get(item.category_id);
      const locId = item.assigned_location_id ?? item.assigned_worksite_id ?? null;
      const existing = map.get(key);
      const isAssigned = item.status === "ISSUED";
      if (existing) {
        existing.total += 1;
        if (isAssigned) existing.assigned += 1;
        existing.items.push(item);
        if (locId && existing.locationName === "Unassigned") existing.locationName = locationById.get(locId) ?? "Unassigned";
      } else {
        map.set(key, {
          key,
          name: item.name,
          categoryName: category?.name ?? item.category_name ?? "Uncategorized",
          categoryId: item.category_id,
          isUniform: Boolean(category?.is_uniform),
          locationName: locId ? (locationById.get(locId) ?? "Unassigned") : "Unassigned",
          total: 1,
          assigned: isAssigned ? 1 : 0,
          items: [item]
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [items, categoryById, locationById]);

  const filteredGroups = useMemo(() => {
    return groups
      .filter((g) => !search.trim() || g.name.toLowerCase().includes(search.trim().toLowerCase()))
      .filter((g) => categoryId === "all" || g.categoryId === categoryId)
      .filter((g) => locationId === "all" || g.items.some((i) => (i.assigned_location_id ?? i.assigned_worksite_id) === locationId))
      .filter((g) => stockStatus === "all" || (stockStatus === "LOW" ? g.total - g.assigned === 0 : g.total - g.assigned > 0));
  }, [groups, search, categoryId, locationId, stockStatus]);

  const totalItems = items.length;
  const assignedCount = items.filter((i) => i.status === "ISSUED").length;
  const lowStockCount = groups.filter((g) => g.total - g.assigned === 0).length;

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={ASSETS_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-slate-950">Assets & uniforms</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Equipment and uniform inventory</p>
            </div>
            {canManage ? <Button size="sm" onClick={() => setNewOpen(true)}><Plus className="h-4 w-4" /> New item</Button> : null}
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Panel className="p-3"><p className="text-[10px] text-muted-foreground">Total items</p><p className="mt-1 text-lg font-medium text-slate-950">{totalItems}</p></Panel>
            <Panel className="p-3"><p className="text-[10px] text-muted-foreground">Assigned</p><p className="mt-1 text-lg font-medium text-slate-950">{assignedCount}</p></Panel>
            <Panel className="p-3"><p className="text-[10px] text-muted-foreground">Low stock</p><p className="mt-1 text-lg font-medium text-[#854F0B]">{lowStockCount}</p></Panel>
            <Panel className="p-3"><p className="text-[10px] text-muted-foreground">Overdue returns</p><p className="mt-1 text-lg font-medium text-[#A32D2D]">{overdueCount}</p></Panel>
          </div>

          <Panel className="flex flex-col gap-2.5 p-3">
            <div className="flex flex-wrap items-center gap-3.5">
              <div className="min-w-[160px] flex-1 rounded-md bg-[#F7F7FB] px-3 py-1.5 text-xs text-muted-foreground">
                <input className="w-full bg-transparent outline-none placeholder:text-muted-foreground" placeholder="Search item" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <select className="bg-transparent text-xs text-muted-foreground outline-none" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="all">Category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select className="bg-transparent text-xs text-muted-foreground outline-none" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <option value="all">Outlet/location</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <select className="bg-transparent text-xs text-muted-foreground outline-none" value={stockStatus} onChange={(e) => setStockStatus(e.target.value)}>
                <option value="all">Stock status</option>
                <option value="IN_STOCK">In stock</option>
                <option value="LOW">Low stock</option>
              </select>
              <button type="button" onClick={() => setMoreOpen((v) => !v)} className="ml-auto flex items-center gap-1.5 rounded-md border border-[#D3D3E3] px-2.5 py-1.5 text-xs text-muted-foreground">
                More filters
              </button>
            </div>
            {moreOpen ? (
              <p className="border-t border-[#E7E7F1] pt-2.5 text-xs text-muted-foreground">No additional filters — use Assignments for issue/return date filtering.</p>
            ) : null}
          </Panel>

          {error ? <Panel className="p-4 text-sm text-[#A32D2D]">{error}</Panel> : null}

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : filteredGroups.length ? (
            <div className="flex flex-col gap-2">
              {filteredGroups.map((group) => {
                const available = group.total - group.assigned;
                const Icon = iconFor(group.categoryName, group.isUniform);
                return (
                  <Panel key={group.key} className="flex items-center gap-3.5 p-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: group.isUniform ? "#EEEDFE" : "#E6F1FB" }}>
                      <Icon className="h-4 w-4" style={{ color: group.isUniform ? "#26215C" : "#0C447C" }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-950">{group.name}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{group.categoryName} · {group.locationName}</p>
                    </div>
                    <div className="min-w-[70px] text-right">
                      <p className="text-xs font-medium text-slate-950">{group.total} total</p>
                      <p className="mt-0.5 text-[9px] text-muted-foreground">{group.assigned} assigned</p>
                    </div>
                    <span className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-medium" style={available === 0 ? { background: "#FAEEDA", color: "#854F0B" } : { background: "#EAF3DE", color: "#27500A" }}>
                      {available === 0 ? "Low stock" : "In stock"}
                    </span>
                    <button type="button" className="text-muted-foreground hover:text-slate-900" onClick={() => setDetailGroup(group)}>⋮</button>
                  </Panel>
                );
              })}
            </div>
          ) : (
            <Panel><EmptyState title="No asset items found" description="Adjust filters or create an item record." /></Panel>
          )}
        </div>
      </div>

      {newOpen ? <NewItemModal categories={categories} onClose={() => setNewOpen(false)} onSaved={() => { setNewOpen(false); void load(); }} /> : null}
      {detailGroup ? <GroupDetailDialog group={detailGroup} onClose={() => setDetailGroup(null)} /> : null}
    </PageShell>
  );
}

function GroupDetailDialog({ group, onClose }: { group: ItemGroup; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>{group.name}</DialogTitle></DialogHeader>
        <DialogBody>
          <div className="space-y-1.5">
            {group.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between rounded-md bg-[#F7F7FB] px-2.5 py-1.5 text-xs">
                <span className="text-slate-950">{item.code}{item.serial_no || item.serial_number ? ` · SN ${item.serial_no ?? item.serial_number}` : ""}</span>
                <span className="text-muted-foreground">{item.status}</span>
              </div>
            ))}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewItemModal({ categories, onClose, onSaved }: { categories: AssetCategory[]; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [size, setSize] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [replacementCost, setReplacementCost] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!token || !categoryId) return;
    setSaving(true);
    setError(null);
    try {
      await api.createAssetItem(token, { name, code, category_id: categoryId, size: size || null, serial_number: serialNumber || null, replacement_cost: replacementCost ? Number(replacementCost) : null });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to create item.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>New asset item</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. MacBook Air M2" /></div>
            <div className="space-y-1.5"><Label>Code</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. AST-0142" /></div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <SelectField value={categoryId} onValueChange={setCategoryId}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </SelectField>
            </div>
            <div className="space-y-1.5"><Label>Size (optional)</Label><Input value={size} onChange={(e) => setSize(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Serial number (optional)</Label><Input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Replacement cost (MVR, optional)</Label><Input type="number" value={replacementCost} onChange={(e) => setReplacementCost(e.target.value)} /></div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} disabled={!name.trim() || !code.trim() || !categoryId} onClick={() => void submit()}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
