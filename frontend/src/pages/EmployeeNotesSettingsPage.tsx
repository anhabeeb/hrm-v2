import { Pencil, Power } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import type { EmployeeNoteCategory, NoteVisibility } from "../types/assets";

export function EmployeeNotesSettingsPage() {
  const { token, user } = useAuth();
  const canManage = user?.permissions.includes("employee_notes.restricted.manage");
  const [categories, setCategories] = useState<EmployeeNoteCategory[]>([]);
  const [modal, setModal] = useState<EmployeeNoteCategory | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    try {
      setCategories((await api.listEmployeeNoteCategories(token)).categories ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load note categories.");
    }
  }

  useEffect(() => { void load(); }, [token]);

  async function toggle(row: EmployeeNoteCategory) {
    if (!token) return;
    await api.noteCategoryAction(token, row.id, row.is_active ? "disable" : "enable");
    await load();
  }

  return (
    <div className="space-y-4">
      <div><h1 className="text-lg font-semibold">Employee Note Settings</h1><p className="text-sm text-muted-foreground">Manage predefined note categories and default visibility for Employee 360 notes.</p></div>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Panel className="overflow-hidden p-0">
        <div className="flex justify-end border-b p-3">{canManage ? <Button size="sm" onClick={() => setModal("new")}>Create category</Button> : null}</div>
        <div className="overflow-x-auto">
          <Table><TableHeader><TableRow><TableHead>Key</TableHead><TableHead>Name</TableHead><TableHead>Visibility</TableHead><TableHead>Description</TableHead><TableHead>Protected</TableHead><TableHead>Status</TableHead><TableHead>Sort</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{categories.map((row) => <TableRow key={row.id}><TableCell>{row.key ?? row.code}</TableCell><TableCell>{row.name}</TableCell><TableCell><Badge tone={row.default_visibility === "RESTRICTED" ? "danger" : row.default_visibility === "HR_ONLY" ? "warning" : "neutral"}>{row.default_visibility}</Badge></TableCell><TableCell>{row.description ?? "-"}</TableCell><TableCell>{row.is_protected ? <Badge tone="info">Protected</Badge> : "-"}</TableCell><TableCell><Badge tone={row.is_active ? "success" : "neutral"}>{row.is_active ? "Active" : "Inactive"}</Badge></TableCell><TableCell>{row.sort_order}</TableCell><TableCell><div className="flex justify-end gap-1">{canManage ? <><Button variant="ghost" size="icon" onClick={() => setModal(row)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => void toggle(row)}><Power className="h-4 w-4" /></Button></> : "-"}</div></TableCell></TableRow>)}</TableBody></Table>
          {!categories.length ? <EmptyState title="No note categories" description="Seeded note categories appear after seed is applied." /> : null}
        </div>
      </Panel>
      {modal ? <CategoryModal category={modal === "new" ? undefined : modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); void load(); }} /> : null}
    </div>
  );
}

function CategoryModal({ category, onClose, onSaved }: { category?: EmployeeNoteCategory; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const [form, setForm] = useState<Partial<EmployeeNoteCategory>>({ code: category?.code ?? category?.key ?? "", name: category?.name ?? "", description: category?.description ?? "", default_visibility: category?.default_visibility ?? "GENERAL", sort_order: category?.sort_order ?? 100 });
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (!token) return;
    try {
      if (category) await api.updateEmployeeNoteCategory(token, category.id, form);
      else await api.createEmployeeNoteCategory(token, form);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save note category.");
    }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4"><div className="w-full max-w-2xl rounded-lg border bg-white shadow-xl"><div className="flex justify-between border-b px-4 py-3"><h2 className="text-sm font-semibold">{category ? "Edit note category" : "Create note category"}</h2><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></div><div className="grid gap-3 p-4 md:grid-cols-2"><Field label="Key" value={form.code ?? ""} onChange={(code) => setForm({ ...form, code })} /><Field label="Name" value={form.name ?? ""} onChange={(name) => setForm({ ...form, name })} /><div className="space-y-1.5"><Label>Default visibility</Label><select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={form.default_visibility ?? "GENERAL"} onChange={(event) => setForm({ ...form, default_visibility: event.target.value as NoteVisibility })}>{["GENERAL","HR_ONLY","RESTRICTED"].map((value) => <option key={value} value={value}>{value}</option>)}</select></div><Field label="Sort order" type="number" value={String(form.sort_order ?? 100)} onChange={(sort_order) => setForm({ ...form, sort_order: Number(sort_order) })} /><Field label="Description" value={form.description ?? ""} onChange={(description) => setForm({ ...form, description })} /></div>{error ? <div className="mx-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}<div className="flex justify-end gap-2 border-t px-4 py-3"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={() => void save()}>Save</Button></div></div></div>;
}

function Field({ label, value, type = "text", onChange }: { label: string; value: string; type?: string; onChange: (value: string) => void }) {
  return <div className="space-y-1.5"><Label>{label}</Label><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}
