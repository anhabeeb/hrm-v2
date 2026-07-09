import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { PageShell, SelectField, CheckboxField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavSwitcher } from "../components/ui/route-nav-switcher";
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
import type { UniformType } from "../types/assets";

const CATEGORIES = ["SHIRT", "TROUSER", "APRON", "CAP", "SHOES", "NAME_BADGE", "OTHER"];

function tone(status?: string) {
  if (status === "ACTIVE") return { bg: "#EAF3DE", text: "#27500A" };
  if (status === "ARCHIVED") return { bg: "#FCEBEB", text: "#A32D2D" };
  return { bg: "#F7F7FB", text: "#6B6F86" };
}

export function AssetUniformTypesPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const canManage = Boolean(user?.permissions.includes("uniforms.types.manage") || user?.permissions.includes("uniforms.manage") || user?.permissions.includes("assets.settings.manage"));
  const [rows, setRows] = useState<UniformType[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<UniformType | "new" | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      setRows((await api.listUniformTypes(token)).types ?? []);
    } catch (err) {
      alerts.showApiError(err, "Unable to load uniform types.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token]);

  const filtered = useMemo(() => rows.filter((row) => !query || `${row.code} ${row.name} ${row.category}`.toLowerCase().includes(query.toLowerCase())), [rows, query]);

  async function archive(row: UniformType) {
    if (!token) return;
    try {
      await api.archiveUniformType(token, row.id);
      alerts.showSuccess("Uniform type archived", `${row.name} was archived.`);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to archive uniform type.");
    }
  }

  return (
    <PageShell constrained={false}>
      <div className="flex flex-col gap-3">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="px-4 flex items-center justify-between">
              <div>
                <RouteNavSwitcher items={ASSETS_NAV_ITEMS} moduleLabel="Assets" />
                <p className="mt-0.5 text-xs text-muted-foreground">Uniform templates, clearance defaults, replacement cycle, and deduction defaults</p>
              </div>
              <div className="flex items-center gap-2">
              <ExportMenu variant="plain" moduleName="Uniform types" rows={filtered as unknown as Record<string, unknown>[]} columns={["code", "name", "category", "default_replacement_cycle_months", "default_clearance_required", "default_deduction_amount", "status"]} />
              {canManage ? <Button size="sm" onClick={() => setModal("new")}><Plus className="h-4 w-4" /> Create type</Button> : null}
</div>

              </div>

              <Panel className="shadow-none space-y-3 p-4">

          <Input className="h-8 w-64 text-xs" placeholder="Search code/name/category..." value={query} onChange={(e) => setQuery(e.target.value)} />

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : filtered.length ? (
            <div className="flex flex-col gap-2">
              {filtered.map((row) => (
                <Panel key={row.id} className="flex items-center gap-3.5 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-950">{row.name} <span className="font-mono font-normal text-muted-foreground">{row.code}</span></p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{row.category} · Cycle {row.default_replacement_cycle_months ?? "-"} months · {Boolean(row.default_clearance_required) ? "Clearance required" : "No clearance required"} · Deduction {row.default_deduction_amount ?? "-"}</p>
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: tone(row.status).bg, color: tone(row.status).text }}>{row.status}</span>
                  {canManage ? (
                    <div className="flex shrink-0 gap-1.5">
                      <RowActionButton intent="edit" size="sm" title="Edit uniform type" onClick={() => setModal(row)}>Edit</RowActionButton>
                      <RowActionButton intent="archive" size="sm" title="Archive uniform type" onClick={() => void archive(row)}>Archive</RowActionButton>
                    </div>
                  ) : null}
                </Panel>
              ))}
            </div>
          ) : (
            <Panel><EmptyState title="No uniform types" description="Create uniform types such as shirts, shoes, aprons, and name badges." /></Panel>
          )}

              </Panel>
        </div>
      </div>

      {modal ? <UniformTypeModal row={modal === "new" ? undefined : modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); void load(); }} /> : null}
    </PageShell>
  );
}

function UniformTypeModal({ row, onClose, onSaved }: { row?: UniformType; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [code, setCode] = useState(row?.code ?? "");
  const [name, setName] = useState(row?.name ?? "");
  const [description, setDescription] = useState(row?.description ?? "");
  const [category, setCategory] = useState(row?.category ?? "SHIRT");
  const [cycleMonths, setCycleMonths] = useState(String(row?.default_replacement_cycle_months ?? ""));
  const [deductionAmount, setDeductionAmount] = useState(String(row?.default_deduction_amount ?? ""));
  const [isActive, setIsActive] = useState(Boolean(row?.is_active ?? true));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!token) return;
    if (!code.trim() || !name.trim()) { setError("Code and name are required."); return; }
    setSaving(true);
    try {
      const payload = { code, name, description: description || null, category, default_replacement_cycle_months: cycleMonths ? Number(cycleMonths) : null, default_deduction_amount: deductionAmount ? Number(deductionAmount) : null, is_active: isActive };
      if (row) await api.updateUniformType(token, row.id, payload);
      else await api.createUniformType(token, payload);
      alerts.showSuccess("Uniform type saved", "The uniform type was saved.");
      onSaved();
    } catch (err) {
      alerts.showApiError(err, "Unable to save uniform type.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>{row ? "Edit uniform type" : "Create uniform type"}</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Code</Label><Input value={code} onChange={(e) => setCode(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Category</Label><SelectField value={category} onValueChange={setCategory}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>Replacement cycle months</Label><Input type="number" min={0} value={cycleMonths} onChange={(e) => setCycleMonths(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Default deduction amount</Label><Input type="number" min={0} value={deductionAmount} onChange={(e) => setDeductionAmount(e.target.value)} /></div>
            <div className="flex items-end pb-1"><CheckboxField label="Active" checked={isActive} onChange={setIsActive} /></div>
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
