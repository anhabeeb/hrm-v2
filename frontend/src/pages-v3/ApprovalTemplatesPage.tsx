import { useEffect, useState } from "react";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavSwitcher } from "../components/ui/route-nav-switcher";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { CheckboxField } from "../components/ui/page-shell";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";
import { APPROVALS_NAV_ITEMS } from "./approvalsNav";
import type { ApprovalNotificationTemplate } from "../types/approvals";

export function ApprovalTemplatesPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<ApprovalNotificationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ApprovalNotificationTemplate | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    const res = await api.listApprovalNotificationTemplates(token).catch(() => ({ templates: [] }));
    setRows(res.templates);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [token]);

  return (
    <PageShell constrained={false}>
      <div className="flex flex-col gap-3">
        <div className="min-w-0 flex-1 space-y-3">
            <div className="px-4">
                <RouteNavSwitcher items={APPROVALS_NAV_ITEMS} moduleLabel="Approvals" />
                <p className="mt-0.5 text-xs text-muted-foreground">Notification templates sent for approval events</p>
            </div>

              <Panel className="shadow-none space-y-3 p-4">
          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : rows.length ? (
            <div className="flex flex-col gap-2">
              {rows.map((row) => (
                <Panel key={row.id} className="flex items-center gap-3.5 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-950">{row.template_name}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{row.template_code} · {row.event_type} · {row.channel}</p>
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: row.is_enabled ? "#EAF3DE" : "#F7F7FB", color: row.is_enabled ? "#27500A" : "#6B6F86" }}>{row.is_enabled ? "Enabled" : "Disabled"}</span>
                  <Button size="sm" variant="outline" onClick={() => setEditing(row)}>Edit</Button>
                </Panel>
              ))}
            </div>
          ) : (
            <Panel><EmptyState title="No templates" description="Approval notification templates are seeded by default." /></Panel>
          )}

              </Panel>
        </div>
      </div>

      {editing ? <TemplateDialog template={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }} /> : null}
    </PageShell>
  );
}

function TemplateDialog({ template, onClose, onSaved }: { template: ApprovalNotificationTemplate; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [form, setForm] = useState(template);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!token) return;
    setSaving(true);
    try {
      await api.updateApprovalNotificationTemplate(token, template.id, form);
      alerts.showSuccess("Notification template saved", "Approval notification template was updated.");
      onSaved();
    } catch (err) {
      alerts.showApiError(err, "Unable to save notification template.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>Notification template</DialogTitle></DialogHeader>
        <DialogBody>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={form.template_name} onChange={(e) => setForm({ ...form, template_name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Subject</Label><Input value={form.subject_template ?? ""} onChange={(e) => setForm({ ...form, subject_template: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Body</Label><Input value={form.body_template} onChange={(e) => setForm({ ...form, body_template: e.target.value })} /></div>
            <CheckboxField label="Enabled" checked={Boolean(form.is_enabled)} onChange={(checked) => setForm({ ...form, is_enabled: checked })} />
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
