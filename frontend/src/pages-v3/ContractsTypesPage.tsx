import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { PageShell, CheckboxField, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavRail } from "../components/ui/route-nav-rail";
import { EmptyState } from "../components/ui/empty-state";
import { Badge } from "../components/ui/badge";
import { Button, RowActionButton } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";
import { CONTRACTS_NAV_ITEMS } from "./contractsNav";

type Row = Record<string, unknown>;

const DOT_COLORS = ["#AFA9EC", "#F0997B", "#7FB8DE", "#8FCB9E", "#FAC775", "#E895B3"];
const CATEGORIES = ["EMPLOYMENT", "RENEWAL", "PROBATION", "TEMPORARY", "CONSULTANCY_PLACEHOLDER", "OTHER"];

function bool(value: unknown) {
  return value === true || value === 1;
}

function typeDescription(type: Row) {
  const parts: string[] = [];
  parts.push(type.default_duration_months ? `${type.default_duration_months} mo default duration` : "No fixed duration");
  parts.push(type.requires_probation ? `Probation required${type.default_probation_months ? ` (${type.default_probation_months} mo)` : ""}` : "No probation");
  parts.push(type.allows_renewal ? "Renewable" : "Not renewable");
  return parts.join(" · ");
}

export function ContractsTypesPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const permissions = new Set(user?.permissions ?? []);
  const canManage = permissions.has("contracts.settings.manage") || permissions.has("contracts.settings.update");
  const [types, setTypes] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Row | "new" | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      setTypes((await api.listContractTypes(token, {})).types);
    } catch (err) {
      alerts.showApiError(err, "Unable to load contract types.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token]);

  async function archive(type: Row) {
    if (!token) return;
    try {
      await api.archiveContractType(token, String(type.id));
      alerts.showSuccess("Contract type archived", `${String(type.name ?? type.code)} was archived.`);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to archive contract type.");
    }
  }

  const active = types.filter((t) => t.is_active !== false && t.status !== "ARCHIVED" && !t.archived_at);
  const archived = types.filter((t) => !(t.is_active !== false && t.status !== "ARCHIVED" && !t.archived_at));

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={CONTRACTS_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-slate-950">Types</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Contract type durations, probation, and renewal rules</p>
            </div>
            {canManage ? <Button size="sm" onClick={() => setModal("new")}><Plus className="h-4 w-4" /> New type</Button> : null}
          </div>

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Panel key={i} className="h-14 animate-pulse" />)}</div>
          ) : active.length ? (
            <div className="flex flex-col gap-2">
              {active.map((type, i) => (
                <Panel key={String(type.id)} className="flex items-center gap-3.5 p-3">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: DOT_COLORS[i % DOT_COLORS.length] }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-950">{String(type.name ?? type.code)} <span className="font-mono font-normal text-muted-foreground">{String(type.code ?? "")}</span></p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{typeDescription(type)}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#F7F7FB] px-2.5 py-1 text-[9px] text-muted-foreground">{String(type.category ?? "")}</span>
                  {canManage ? (
                    <div className="flex shrink-0 gap-1.5">
                      <RowActionButton intent="edit" size="sm" title="Edit type" onClick={() => setModal(type)}>Edit</RowActionButton>
                      <RowActionButton intent="archive" size="sm" title="Archive type" onClick={() => void archive(type)}>Archive</RowActionButton>
                    </div>
                  ) : null}
                </Panel>
              ))}
            </div>
          ) : (
            <Panel><EmptyState title="No contract types configured" description="Create the first contract type." /></Panel>
          )}

          {archived.length ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Archived</p>
              <div className="flex flex-col gap-2">
                {archived.map((type) => (
                  <Panel key={String(type.id)} className="flex items-center gap-3.5 p-3 opacity-70">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-950">{String(type.name ?? type.code)} <span className="font-mono font-normal text-muted-foreground">{String(type.code ?? "")}</span></p>
                    </div>
                    <Badge tone="neutral">Archived</Badge>
                  </Panel>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {modal ? <TypeModal type={modal === "new" ? undefined : modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); void load(); }} /> : null}
    </PageShell>
  );
}

function TypeModal({ type, onClose, onSaved }: { type?: Row; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [form, setForm] = useState({
    code: String(type?.code ?? ""),
    name: String(type?.name ?? ""),
    category: String(type?.category ?? "EMPLOYMENT"),
    default_duration_months: String(type?.default_duration_months ?? ""),
    requires_probation: bool(type?.requires_probation),
    default_probation_months: String(type?.default_probation_months ?? ""),
    allows_renewal: type ? bool(type.allows_renewal) : true,
    description: String(type?.description ?? "")
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!token) return;
    setSaving(true);
    try {
      const input = {
        ...form,
        default_duration_months: form.default_duration_months ? Number(form.default_duration_months) : null,
        default_probation_months: form.default_probation_months ? Number(form.default_probation_months) : null
      };
      if (type) await api.updateContractType(token, String(type.id), input);
      else await api.createContractType(token, input);
      alerts.showSuccess("Contract type saved", "The contract type was saved.");
      onSaved();
    } catch (err) {
      alerts.showApiError(err, "Unable to save contract type.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>{type ? "Edit contract type" : "Create contract type"}</DialogTitle></DialogHeader>
        <DialogBody>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Category</Label><SelectField value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>Default duration (months)</Label><Input type="number" min={0} value={form.default_duration_months} onChange={(e) => setForm({ ...form, default_duration_months: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Default probation (months)</Label><Input type="number" min={0} value={form.default_probation_months} onChange={(e) => setForm({ ...form, default_probation_months: e.target.value })} disabled={!form.requires_probation} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Description</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="col-span-2 flex items-end gap-4">
              <CheckboxField label="Requires probation" checked={form.requires_probation} onChange={(v) => setForm({ ...form, requires_probation: v })} />
              <CheckboxField label="Allows renewal" checked={form.allows_renewal} onChange={(v) => setForm({ ...form, allows_renewal: v })} />
            </div>
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
