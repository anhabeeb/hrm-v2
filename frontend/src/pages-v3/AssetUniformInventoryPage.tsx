import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { PageShell, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavRail } from "../components/ui/route-nav-rail";
import { Button, RowActionButton } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { EmptyState } from "../components/ui/empty-state";
import { ExportMenu } from "../components/export/ExportMenu";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";
import { ASSETS_NAV_ITEMS } from "./assetsNav";
import type { UniformStockItem, UniformType } from "../types/assets";
import type { OrganizationLocation } from "../types/organization";

function tone(status?: string) {
  if (status === "ACTIVE") return { bg: "#EAF3DE", text: "#27500A" };
  if (status === "ARCHIVED") return { bg: "#FCEBEB", text: "#A32D2D" };
  return { bg: "#F7F7FB", text: "#6B6F86" };
}

export function AssetUniformInventoryPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const canManage = Boolean(user?.permissions.includes("uniforms.stock.manage") || user?.permissions.includes("uniforms.manage"));
  const [stock, setStock] = useState<UniformStockItem[]>([]);
  const [types, setTypes] = useState<UniformType[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [search, setSearch] = useState("");
  const [typeId, setTypeId] = useState("all");
  const [locationId, setLocationId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<UniformStockItem | "new" | null>(null);

  const filters = useMemo(() => ({ search, uniform_type_id: typeId === "all" ? undefined : typeId, location_id: locationId === "all" ? undefined : locationId }), [search, typeId, locationId]);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const [stockRows, typeRows, locationRows] = await Promise.all([api.listUniformStock(token, filters), api.listUniformTypes(token), api.listLocations(token)]);
      setStock(stockRows.stock ?? []);
      setTypes(typeRows.types ?? []);
      setLocations(locationRows.locations ?? []);
    } catch (err) {
      alerts.showApiError(err, "Unable to load uniform stock.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token, filters]);

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={ASSETS_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-slate-950">Uniform inventory</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Track uniform quantities by type, size, and location</p>
            </div>
            <div className="flex items-center gap-2">
              <ExportMenu variant="plain" moduleName="Uniform inventory" rows={stock as unknown as Record<string, unknown>[]} columns={["uniform_type_code", "uniform_type_name", "size_label", "location_name", "total_quantity", "available_quantity", "issued_quantity", "damaged_quantity", "lost_quantity", "reorder_level", "status"]} />
              {canManage ? <Button size="sm" onClick={() => setModal("new")}><Plus className="h-4 w-4" /> Create stock</Button> : null}
            </div>
          </div>

          <Panel className="flex flex-wrap items-center gap-3.5 p-3">
            <div className="min-w-[160px] flex-1 rounded-md bg-[#F7F7FB] px-3 py-1.5 text-xs text-muted-foreground">
              <input className="w-full bg-transparent outline-none placeholder:text-muted-foreground" placeholder="Search type/size" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <SelectField className="w-auto bg-transparent text-xs text-muted-foreground" value={typeId} onValueChange={setTypeId}>
              <option value="all">All types</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </SelectField>
            <SelectField className="w-auto bg-transparent text-xs text-muted-foreground" value={locationId} onValueChange={setLocationId}>
              <option value="all">All locations</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </SelectField>
          </Panel>

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : stock.length ? (
            <div className="flex flex-col gap-2">
              {stock.map((row) => (
                <Panel key={row.id} className="flex items-center gap-3.5 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-950">{row.uniform_type_name} <span className="font-mono font-normal text-muted-foreground">{row.uniform_type_code}</span></p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">Size {row.size_label ?? "-"} · {row.location_name ?? "No location"} · Total {row.total_quantity} · Available {row.available_quantity} · Issued {row.issued_quantity} · Damaged/Lost {row.damaged_quantity}/{row.lost_quantity} · Reorder {row.reorder_level ?? "-"}</p>
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: tone(row.status).bg, color: tone(row.status).text }}>{row.status}</span>
                  {canManage ? <RowActionButton intent="edit" size="sm" title="Edit stock" onClick={() => setModal(row)}>Edit</RowActionButton> : null}
                </Panel>
              ))}
            </div>
          ) : (
            <Panel><EmptyState title="No uniform stock" description="Add stock quantities by type, size, and location." /></Panel>
          )}
        </div>
      </div>

      {modal ? <UniformStockModal row={modal === "new" ? undefined : modal} types={types} locations={locations} onClose={() => setModal(null)} onSaved={() => { setModal(null); void load(); }} /> : null}
    </PageShell>
  );
}

const QUANTITY_FIELDS = ["total_quantity", "available_quantity", "issued_quantity", "damaged_quantity", "lost_quantity", "retired_quantity", "reorder_level"] as const;

function UniformStockModal({ row, types, locations, onClose, onSaved }: { row?: UniformStockItem; types: UniformType[]; locations: OrganizationLocation[]; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [typeId, setTypeId] = useState(row?.uniform_type_id ?? types[0]?.id ?? "");
  const [sizeLabel, setSizeLabel] = useState(row?.size_label ?? "");
  const [locationId, setLocationId] = useState(row?.location_id ?? "");
  const [status, setStatus] = useState(row?.status ?? "ACTIVE");
  const [quantities, setQuantities] = useState<Record<typeof QUANTITY_FIELDS[number], string>>({
    total_quantity: String(row?.total_quantity ?? 0),
    available_quantity: String(row?.available_quantity ?? 0),
    issued_quantity: String(row?.issued_quantity ?? 0),
    damaged_quantity: String(row?.damaged_quantity ?? 0),
    lost_quantity: String(row?.lost_quantity ?? 0),
    retired_quantity: String(row?.retired_quantity ?? 0),
    reorder_level: String(row?.reorder_level ?? "")
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!token || !typeId) { setError("Uniform type is required."); return; }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { uniform_type_id: typeId, size_label: sizeLabel || null, location_id: locationId || null, status };
      for (const field of QUANTITY_FIELDS) payload[field] = quantities[field] === "" ? null : Number(quantities[field]);
      if (row) await api.updateUniformStock(token, row.id, payload);
      else await api.createUniformStock(token, payload);
      alerts.showSuccess("Uniform stock saved", "The uniform stock entry was saved.");
      onSaved();
    } catch (err) {
      alerts.showApiError(err, "Unable to save uniform stock.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>{row ? "Edit uniform stock" : "Create uniform stock"}</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Uniform type</Label><SelectField value={typeId} onValueChange={setTypeId}>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>Size</Label><Input value={sizeLabel} onChange={(e) => setSizeLabel(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Location</Label><SelectField value={locationId} onValueChange={setLocationId}><option value="">No location</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>Status</Label><SelectField value={status} onValueChange={setStatus}>{["ACTIVE", "INACTIVE", "ARCHIVED"].map((v) => <option key={v} value={v}>{v}</option>)}</SelectField></div>
            {QUANTITY_FIELDS.map((field) => (
              <div key={field} className="space-y-1.5"><Label>{field.replace(/_/g, " ")}</Label><Input type="number" min={0} value={quantities[field]} onChange={(e) => setQuantities({ ...quantities, [field]: e.target.value })} /></div>
            ))}
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
