import { Edit, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { ExportMenu } from "../components/export/ExportMenu";
import { ActiveFilterChips, FilterResetButton, StandardFilterBar, StandardSearchInput } from "../components/filters";
import { TableSkeleton } from "../components/loading";
import { RosterNav } from "../components/roster/RosterNav";
import { Badge } from "../components/ui/badge";
import { Button, RowActionButton } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { CheckboxField, PageHeader, PageShell, TextareaField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import type { ShiftTemplate } from "../types/roster";

type ShiftForm = Partial<ShiftTemplate>;

export function RosterShiftTemplatesPage() {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("roster.view") || permissions.has("roster.shift_templates.view") || permissions.has("roster.shift_templates.manage");
  const canManage = permissions.has("roster.settings.manage") || permissions.has("roster.shift_templates.manage") || permissions.has("roster.shift_templates.update");
  const canArchive = permissions.has("roster.settings.manage") || permissions.has("roster.shift_templates.manage") || permissions.has("roster.shift_templates.archive");
  const canRestore = permissions.has("roster.settings.manage") || permissions.has("roster.shift_templates.manage") || permissions.has("roster.shift_templates.restore");
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ShiftTemplate | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [moduleDisabled, setModuleDisabled] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    setError(null);
    setModuleDisabled(false);
    try {
      setTemplates((await api.listShiftTemplates(token)).shift_templates);
    } catch (err) {
      if (err instanceof ApiError && (err.code === "ROSTER_MODULE_DISABLED" || err.code === "MODULE_DISABLED")) {
        setModuleDisabled(true);
        setTemplates([]);
        return;
      }
      setError(err instanceof ApiError ? err.message : "Unable to load shift templates.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, canView]);

  const filtered = useMemo(() => templates.filter((template) => `${template.code} ${template.name}`.toLowerCase().includes(search.toLowerCase())), [templates, search]);
  const activeFilterChips = useMemo(() => search ? [{ key: "search", label: "Search", value: search, onRemove: () => setSearch("") }] : [], [search]);

  async function save(input: ShiftForm) {
    if (!token) return;
    try {
      if (editing) await api.updateShiftTemplate(token, editing.id, input);
      else await api.createShiftTemplate(token, input);
      setEditing(undefined);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save shift template.");
    }
  }

  async function action(template: ShiftTemplate, next: "enable" | "disable" | "archive" | "restore") {
    if (!token) return;
    try {
      await api.shiftTemplateAction(token, template.id, next);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update shift template status.");
    }
  }

  if (!canView) return <PageShell><Panel><EmptyState title="Shift templates unavailable" description="Your account needs roster.view permission." /></Panel></PageShell>;
  if (moduleDisabled) {
    return (
      <PageShell>
        <PageHeader title="Shift Templates" description="Roster module is disabled." />
        <RosterNav />
        <Panel><EmptyState title="Roster module is disabled" description="Enable roster from settings before managing shift templates." /></Panel>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Shift Templates"
        description="Reusable roster shifts for weekly planning and future attendance/payroll calculations."
        actions={
          <>
          <ExportMenu
            moduleName="Roster shift templates"
            rows={filtered as unknown as Record<string, unknown>[]}
            columns={["code", "name", "description", "start_time", "end_time", "break_minutes", "total_work_minutes", "is_overnight", "is_active", "sort_order"]}
            filterSummary={activeFilterChips.map((chip) => `${chip.label}: ${chip.value}`)}
          />
          {canManage ? <Button size="sm" onClick={() => setEditing(null)}><Plus className="h-4 w-4" /> New shift</Button> : null}
          </>
        }
      />
      <RosterNav />
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Panel className="overflow-hidden">
        <div className="border-b p-3">
          <StandardFilterBar
            search={<StandardSearchInput value={search} onDebouncedChange={setSearch} placeholder="Search code or name" />}
            reset={<FilterResetButton onReset={() => setSearch("")} />}
          />
          <ActiveFilterChips chips={activeFilterChips} className="mt-2" />
        </div>
        {loading ? <TableSkeleton rows={6} columns={8} label="Loading shift templates" /> : filtered.length === 0 ? <EmptyState title="No shift templates found" description="Add a shift template or adjust search." /> : (
          <div className="flex flex-col gap-2 p-3">
            {filtered.map((template) => (
              <div key={template.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "0.9rem 1.1rem", background: "var(--v3-surface-2)", border: "0.5px solid var(--v3-border)", borderRadius: "var(--v3-radius-card)" }}>
                <span className="inline-flex h-9 w-9 shrink-0 rounded-md border" style={{ background: template.color_label ?? "#e2e8f0" }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                    <span className="font-mono text-xs text-muted-foreground">{template.code}</span>
                    <span>{template.name}</span>
                    {template.is_overnight ? <Badge tone="info">Overnight</Badge> : null}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
                    <span>{template.start_time} - {template.end_time}</span>
                    <span>&middot;</span>
                    <span>Break {template.break_minutes} min</span>
                    <span>&middot;</span>
                    <span>{template.total_work_minutes ?? "-"} min total</span>
                    <span>&middot;</span>
                    <span>Sort {template.sort_order}</span>
                    {template.description ? <><span>&middot;</span><span>{template.description}</span></> : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Badge tone={template.is_active ? "success" : "neutral"}>{template.is_active ? "Active" : "Inactive"}</Badge>
                  {canManage || canArchive || canRestore ? <>
                    <RowActionButton intent="edit" title="Edit" onClick={() => setEditing(template)} disabled={!canManage}><Edit className="h-4 w-4" /></RowActionButton>
                    {template.is_active ? <RowActionButton intent="archive" size="sm" title="Archive" disabled={!canArchive} onClick={() => void action(template, "archive")}>Archive</RowActionButton> : <RowActionButton intent="restore" size="sm" title="Restore" disabled={!canRestore} onClick={() => void action(template, "restore")}>Restore</RowActionButton>}
                  </> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
      {editing !== undefined ? <ShiftTemplateModal template={editing ?? undefined} onClose={() => setEditing(undefined)} onSave={(input) => void save(input)} /> : null}
    </PageShell>
  );
}

function ShiftTemplateModal({ template, onClose, onSave }: { template?: ShiftTemplate; onClose: () => void; onSave: (input: ShiftForm) => void }) {
  const [form, setForm] = useState<ShiftForm>({
    code: template?.code ?? "",
    name: template?.name ?? "",
    description: template?.description ?? "",
    start_time: template?.start_time ?? "09:00",
    end_time: template?.end_time ?? "18:00",
    break_minutes: template?.break_minutes ?? 60,
    total_work_minutes: template?.total_work_minutes ?? 480,
    color_label: template?.color_label ?? "#dbeafe",
    is_overnight: template?.is_overnight ?? false,
    is_active: template?.is_active ?? true,
    sort_order: template?.sort_order ?? 100
  });
  const update = <K extends keyof ShiftForm>(key: K, value: ShiftForm[K]) => setForm({ ...form, [key]: value });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4">
      <div className="w-full max-w-2xl rounded-lg border bg-white shadow-xl">
        <div className="border-b px-4 py-3"><h2 className="text-sm font-semibold">{template ? "Edit shift template" : "Create shift template"}</h2></div>
        <div className="grid gap-3 p-4 md:grid-cols-2">
          <Field label="Code"><Input value={form.code ?? ""} onChange={(event) => update("code", event.target.value.toUpperCase())} /></Field>
          <Field label="Name"><Input value={form.name ?? ""} onChange={(event) => update("name", event.target.value)} /></Field>
          <Field label="Start time"><Input type="time" value={form.start_time ?? ""} onChange={(event) => update("start_time", event.target.value)} /></Field>
          <Field label="End time"><Input type="time" value={form.end_time ?? ""} onChange={(event) => update("end_time", event.target.value)} /></Field>
          <Field label="Break minutes"><Input type="number" min="0" value={form.break_minutes ?? 0} onChange={(event) => update("break_minutes", Number(event.target.value))} /></Field>
          <Field label="Total work minutes"><Input type="number" min="0" value={form.total_work_minutes ?? 0} onChange={(event) => update("total_work_minutes", Number(event.target.value))} /></Field>
          <Field label="Color label"><Input type="color" value={form.color_label ?? "#dbeafe"} onChange={(event) => update("color_label", event.target.value)} /></Field>
          <Field label="Sort order"><Input type="number" value={form.sort_order ?? 100} onChange={(event) => update("sort_order", Number(event.target.value))} /></Field>
          <CheckboxField label="Overnight shift" checked={Boolean(form.is_overnight)} onChange={(checked) => update("is_overnight", checked)} />
          <CheckboxField label="Active" checked={Boolean(form.is_active)} onChange={(checked) => update("is_active", checked)} />
          <div className="md:col-span-2"><TextareaField label="Description" value={form.description ?? ""} onChange={(event) => update("description", event.target.value)} /></div>
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={() => onSave(form)}>Save</Button></div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
