import { Pencil, Power } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "../components/ui/badge";
import { Button, RowActionButton } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { PageHeader, PageShell, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
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
    <PageShell>
      <PageHeader
        title="Employee Note Settings"
        eyebrow="Settings"
        description="Manage predefined note categories and default visibility for Employee 360 notes."
        actions={canManage ? <Button size="sm" onClick={() => setModal("new")}>Create category</Button> : null}
      />
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {!categories.length ? (
        <Panel className="overflow-hidden p-0">
          <EmptyState title="No note categories" description="Seeded note categories appear after seed is applied." />
        </Panel>
      ) : (
        <div className="flex flex-col gap-2">
          {categories.map((row) => (
            <div
              key={row.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "0.9rem 1.1rem",
                background: "var(--v3-surface-2)",
                border: "0.5px solid var(--v3-border)",
                borderRadius: "var(--v3-radius-card)"
              }}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-900">{row.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{row.key ?? row.code}</span>
                  {row.is_protected ? <Badge tone="info">Protected</Badge> : null}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
                  {row.description ? <span>{row.description}</span> : null}
                  {row.description ? <span className="text-[var(--v3-border-strong)]">&middot;</span> : null}
                  <span>Sort {row.sort_order}</span>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={row.default_visibility === "RESTRICTED" ? "danger" : row.default_visibility === "HR_ONLY" ? "warning" : "neutral"}>{row.default_visibility}</Badge>
                <Badge tone={row.is_active ? "success" : "neutral"}>{row.is_active ? "Active" : "Inactive"}</Badge>
                {canManage ? (
                  <div className="flex gap-1">
                    <RowActionButton intent="edit" title="Edit" onClick={() => setModal(row)}><Pencil className="h-4 w-4" /></RowActionButton>
                    <RowActionButton intent={row.is_active ? "disable" : "enable"} title={row.is_active ? "Disable" : "Enable"} onClick={() => void toggle(row)}><Power className="h-4 w-4" /></RowActionButton>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
      {modal ? <CategoryModal category={modal === "new" ? undefined : modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); void load(); }} /> : null}
    </PageShell>
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
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4"><div className="w-full max-w-2xl rounded-lg border bg-white shadow-xl"><div className="flex justify-between border-b px-4 py-3"><h2 className="text-sm font-semibold">{category ? "Edit note category" : "Create note category"}</h2><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></div><div className="grid gap-3 p-4 md:grid-cols-2"><Field label="Key" value={form.code ?? ""} onChange={(code) => setForm({ ...form, code })} /><Field label="Name" value={form.name ?? ""} onChange={(name) => setForm({ ...form, name })} /><SelectField label="Default visibility" value={form.default_visibility ?? "GENERAL"} onValueChange={(value) => setForm({ ...form, default_visibility: value as NoteVisibility })}>{["GENERAL","HR_ONLY","RESTRICTED"].map((value) => <option key={value} value={value}>{value}</option>)}</SelectField><Field label="Sort order" type="number" value={String(form.sort_order ?? 100)} onChange={(sort_order) => setForm({ ...form, sort_order: Number(sort_order) })} /><Field label="Description" value={form.description ?? ""} onChange={(description) => setForm({ ...form, description })} /></div>{error ? <div className="mx-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}<div className="flex justify-end gap-2 border-t px-4 py-3"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={() => void save()}>Save</Button></div></div></div>;
}

function Field({ label, value, type = "text", onChange }: { label: string; value: string; type?: string; onChange: (value: string) => void }) {
  return <div className="space-y-1.5"><Label>{label}</Label><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}
