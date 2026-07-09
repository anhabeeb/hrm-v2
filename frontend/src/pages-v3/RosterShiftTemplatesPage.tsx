import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { PageShell, CheckboxField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavSwitcher } from "../components/ui/route-nav-switcher";
import { Button, RowActionButton } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { EmptyState } from "../components/ui/empty-state";
import { ExportMenu } from "../components/export/ExportMenu";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";
import { ROSTER_NAV_ITEMS } from "./rosterNav";
import type { ShiftTemplate } from "../types/roster";

type ShiftForm = Partial<ShiftTemplate>;

export function RosterShiftTemplatesPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("roster.view") || permissions.has("roster.shift_templates.view") || permissions.has("roster.shift_templates.manage");
  const canManage = permissions.has("roster.settings.manage") || permissions.has("roster.shift_templates.manage") || permissions.has("roster.shift_templates.update");
  const canArchive = permissions.has("roster.settings.manage") || permissions.has("roster.shift_templates.manage") || permissions.has("roster.shift_templates.archive");
  const canRestore = permissions.has("roster.settings.manage") || permissions.has("roster.shift_templates.manage") || permissions.has("roster.shift_templates.restore");
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [moduleDisabled, setModuleDisabled] = useState(false);
  const [editing, setEditing] = useState<ShiftTemplate | null | undefined>(undefined);

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    setModuleDisabled(false);
    try {
      setTemplates((await api.listShiftTemplates(token)).shift_templates);
    } catch (err) {
      if (err && typeof err === "object" && "code" in err && (err.code === "ROSTER_MODULE_DISABLED" || err.code === "MODULE_DISABLED")) {
        setModuleDisabled(true);
        setTemplates([]);
      } else {
        alerts.showApiError(err, "Unable to load shift templates.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token, canView]);

  const filtered = useMemo(() => templates.filter((t) => `${t.code} ${t.name}`.toLowerCase().includes(search.toLowerCase())), [templates, search]);

  async function save(input: ShiftForm) {
    if (!token) return;
    try {
      if (editing) await api.updateShiftTemplate(token, editing.id, input);
      else await api.createShiftTemplate(token, input);
      alerts.showSuccess("Shift template saved", "The shift template was saved.");
      setEditing(undefined);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to save shift template.");
    }
  }

  async function action(template: ShiftTemplate, next: "enable" | "disable" | "archive" | "restore") {
    if (!token) return;
    try {
      await api.shiftTemplateAction(token, template.id, next);
      alerts.showSuccess("Shift template updated", `Shift template ${next}d.`);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to update shift template status.");
    }
  }

  if (!canView) {
    return (
      <PageShell constrained={false}>
        <div className="flex flex-col gap-3">
          <RouteNavSwitcher items={ROSTER_NAV_ITEMS} moduleLabel="Roster" />
          <div className="min-w-0 flex-1"><Panel><EmptyState title="Shift templates unavailable" description="Your account needs roster.view permission." /></Panel></div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell constrained={false}>
      <div className="flex flex-col gap-3">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="px-4 flex items-center justify-between">
              <div>
                <RouteNavSwitcher items={ROSTER_NAV_ITEMS} moduleLabel="Roster" />
                <p className="mt-0.5 text-xs text-muted-foreground">Reusable roster shifts for weekly planning and attendance/payroll calculations</p>
              </div>
              <div className="flex items-center gap-2">
              <ExportMenu variant="plain" moduleName="Roster shift templates" rows={filtered as unknown as Record<string, unknown>[]} columns={["code", "name", "description", "start_time", "end_time", "break_minutes", "total_work_minutes", "is_overnight", "is_active"]} />
              {canManage ? <Button size="sm" onClick={() => setEditing(null)}><Plus className="h-4 w-4" /> New shift</Button> : null}
</div>

              </div>

              <Panel className="shadow-none space-y-3 p-4">

          {moduleDisabled ? (
            <Panel><EmptyState title="Roster module is disabled" description="Enable roster from settings before managing shift templates." /></Panel>
          ) : (
            <>
              <Input className="h-8 w-64 text-xs" placeholder="Search code/name..." value={search} onChange={(e) => setSearch(e.target.value)} />

              {loading ? (
                <div className="flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
              ) : filtered.length ? (
                <div className="flex flex-col gap-2">
                  {filtered.map((t) => (
                    <Panel key={t.id} className="flex items-center gap-3.5 p-3">
                      <span className="inline-flex h-9 w-9 shrink-0 rounded-md border" style={{ background: t.color_label ?? "#e2e8f0" }} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-xs font-medium text-slate-950">
                          <span className="font-mono font-normal text-muted-foreground">{t.code}</span>
                          {t.name}
                          {t.is_overnight ? <Badge tone="info">Overnight</Badge> : null}
                        </p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{t.start_time} - {t.end_time} · Break {t.break_minutes} min · {t.total_work_minutes ?? "-"} min total{t.description ? ` · ${t.description}` : ""}</p>
                      </div>
                      <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: t.is_active ? "#EAF3DE" : "#F7F7FB", color: t.is_active ? "#27500A" : "#6B6F86" }}>{t.is_active ? "Active" : "Inactive"}</span>
                      {canManage || canArchive || canRestore ? (
                        <div className="flex shrink-0 gap-1.5">
                          {canManage ? <RowActionButton intent="edit" size="sm" title="Edit shift template" onClick={() => setEditing(t)}>Edit</RowActionButton> : null}
                          {t.is_active
                            ? (canArchive ? <RowActionButton intent="archive" size="sm" title="Archive" onClick={() => void action(t, "archive")}>Archive</RowActionButton> : null)
                            : (canRestore ? <RowActionButton intent="restore" size="sm" title="Restore" onClick={() => void action(t, "restore")}>Restore</RowActionButton> : null)}
                        </div>
                      ) : null}
                    </Panel>
                  ))}
                </div>
              ) : (
                <Panel><EmptyState title="No shift templates found" description="Add a shift template or adjust the search." /></Panel>
              )}
            </>
          )}

              </Panel>
        </div>
      </div>

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
  const [error, setError] = useState<string | null>(null);
  const update = <K extends keyof ShiftForm>(key: K, value: ShiftForm[K]) => setForm({ ...form, [key]: value });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>{template ? "Edit shift template" : "Create shift template"}</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Code</Label><Input value={form.code ?? ""} onChange={(e) => update("code", e.target.value.toUpperCase())} /></div>
            <div className="space-y-1.5"><Label>Name</Label><Input value={form.name ?? ""} onChange={(e) => update("name", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Start time</Label><Input type="time" value={form.start_time ?? ""} onChange={(e) => update("start_time", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>End time</Label><Input type="time" value={form.end_time ?? ""} onChange={(e) => update("end_time", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Break minutes</Label><Input type="number" min={0} value={form.break_minutes ?? 0} onChange={(e) => update("break_minutes", Number(e.target.value))} /></div>
            <div className="space-y-1.5"><Label>Total work minutes</Label><Input type="number" min={0} value={form.total_work_minutes ?? 0} onChange={(e) => update("total_work_minutes", Number(e.target.value))} /></div>
            <div className="space-y-1.5"><Label>Color label</Label><Input type="color" value={form.color_label ?? "#dbeafe"} onChange={(e) => update("color_label", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Sort order</Label><Input type="number" value={form.sort_order ?? 100} onChange={(e) => update("sort_order", Number(e.target.value))} /></div>
            <CheckboxField label="Overnight shift" checked={Boolean(form.is_overnight)} onChange={(v) => update("is_overnight", v)} />
            <CheckboxField label="Active" checked={Boolean(form.is_active)} onChange={(v) => update("is_active", v)} />
            <div className="col-span-2 space-y-1.5"><Label>Description</Label><Input value={form.description ?? ""} onChange={(e) => update("description", e.target.value)} /></div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => { if (!form.code?.trim() || !form.name?.trim()) { setError("Code and name are required."); return; } onSave(form); }}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
