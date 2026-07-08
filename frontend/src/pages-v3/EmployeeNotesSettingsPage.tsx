import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { PageShell, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { Button, RowActionButton } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";
import type { EmployeeNoteCategory, NoteVisibility } from "../types/assets";

function tone(visibility: string) {
  if (visibility === "RESTRICTED") return { bg: "#FCEBEB", text: "#A32D2D" };
  if (visibility === "HR_ONLY") return { bg: "#FAEEDA", text: "#854F0B" };
  return { bg: "#F7F7FB", text: "#6B6F86" };
}

export function EmployeeNotesSettingsPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const canManage = Boolean(user?.permissions.includes("employee_notes.restricted.manage"));
  const [categories, setCategories] = useState<EmployeeNoteCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<EmployeeNoteCategory | "new" | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      setCategories((await api.listEmployeeNoteCategories(token)).categories ?? []);
    } catch (err) {
      alerts.showApiError(err, "Unable to load note categories.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token]);

  async function toggle(row: EmployeeNoteCategory) {
    if (!token) return;
    try {
      await api.noteCategoryAction(token, row.id, row.is_active ? "disable" : "enable");
      alerts.showSuccess("Category updated", `${row.name} was ${row.is_active ? "disabled" : "enabled"}.`);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to update note category.");
    }
  }

  return (
    <PageShell constrained={false}>
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-medium text-slate-950">Employee note settings</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Manage predefined note categories and default visibility for Employee 360 notes</p>
          </div>
          {canManage ? <Button size="sm" onClick={() => setModal("new")}><Plus className="h-4 w-4" /> Create category</Button> : null}
        </div>

        {loading ? (
          <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
        ) : categories.length ? (
          <Panel className="overflow-hidden">
            <div className="flex flex-col">
              {categories.map((row) => (
                <div key={row.id} className="flex items-center gap-3.5 border-b border-[#F1F1F7] px-4 py-3 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-xs font-medium text-slate-950">
                      {row.name} <span className="font-mono font-normal text-muted-foreground">{row.key ?? row.code}</span>
                      {row.is_protected ? <span className="rounded-full bg-[#E6F1FB] px-2 py-0.5 text-[9px] font-medium text-[#0C447C]">Protected</span> : null}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{row.description ? `${row.description} · ` : ""}Sort {row.sort_order}</p>
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: tone(row.default_visibility).bg, color: tone(row.default_visibility).text }}>{row.default_visibility}</span>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: row.is_active ? "#EAF3DE" : "#F7F7FB", color: row.is_active ? "#27500A" : "#6B6F86" }}>{row.is_active ? "Active" : "Inactive"}</span>
                  {canManage ? (
                    <div className="flex shrink-0 gap-1.5">
                      <RowActionButton intent="edit" size="sm" title="Edit category" onClick={() => setModal(row)}>Edit</RowActionButton>
                      <Button size="sm" variant={row.is_active ? "danger" : "primary"} onClick={() => void toggle(row)}>{row.is_active ? "Disable" : "Enable"}</Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </Panel>
        ) : (
          <Panel className="p-4"><EmptyState title="No note categories" description="Seeded note categories appear after seed is applied." /></Panel>
        )}
      </div>

      {modal ? <CategoryModal category={modal === "new" ? undefined : modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); void load(); }} /> : null}
    </PageShell>
  );
}

function CategoryModal({ category, onClose, onSaved }: { category?: EmployeeNoteCategory; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [code, setCode] = useState(category?.code ?? category?.key ?? "");
  const [name, setName] = useState(category?.name ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [visibility, setVisibility] = useState<NoteVisibility>(category?.default_visibility ?? "GENERAL");
  const [sortOrder, setSortOrder] = useState(String(category?.sort_order ?? 100));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!token) return;
    if (!code.trim() || !name.trim()) { setError("Key and name are required."); return; }
    setSaving(true);
    try {
      const payload = { code, name, description: description || null, default_visibility: visibility, sort_order: Number(sortOrder) };
      if (category) await api.updateEmployeeNoteCategory(token, category.id, payload);
      else await api.createEmployeeNoteCategory(token, payload);
      alerts.showSuccess("Category saved", "The note category was saved.");
      onSaved();
    } catch (err) {
      alerts.showApiError(err, "Unable to save note category.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>{category ? "Edit note category" : "Create note category"}</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Key</Label><Input value={code} onChange={(e) => setCode(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Default visibility</Label><SelectField value={visibility} onValueChange={(v) => setVisibility(v as NoteVisibility)}><option value="GENERAL">General</option><option value="HR_ONLY">HR only</option><option value="RESTRICTED">Restricted</option></SelectField></div>
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
