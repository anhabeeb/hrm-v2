import { useEffect, useState } from "react";
import { PageShell, SelectField, CheckboxField, type StandardTabItem } from "../components/ui/page-shell";
import { NavRail } from "../components/ui/nav-rail";
import { Panel } from "../components/ui/panel";
import { Badge } from "../components/ui/badge";
import { Button, RowActionButton } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";
import type { DocumentComplianceSettings, DocumentType } from "../types/documents";

const TAB_ITEMS: StandardTabItem[] = [
  { key: "settings", label: "Compliance settings" },
  { key: "type-rules", label: "Type rules" }
];

export function DocumentComplianceSettingsPage({ initialTab = "settings" }: { initialTab?: "settings" | "type-rules" }) {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const permissions = new Set(user?.permissions ?? []);
  const canManage = permissions.has("documents.compliance.manage") || permissions.has("documents.settings.manage");
  const canRules = canManage || permissions.has("documents.types.compliance.update");
  const [tab, setTab] = useState<string>(initialTab);
  const [settings, setSettings] = useState<DocumentComplianceSettings | null>(null);
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [typeModal, setTypeModal] = useState<DocumentType | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const [settingsResult, typesResult] = await Promise.all([api.getDocumentComplianceSettings(token), api.listDocumentTypeCompliance(token)]);
      setSettings(settingsResult.settings);
      setTypes(typesResult.document_types);
    } catch (err) {
      alerts.showApiError(err, "Unable to load document compliance settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token]);
  useEffect(() => { setTab(initialTab); }, [initialTab]);

  function update<K extends keyof DocumentComplianceSettings>(key: K, value: DocumentComplianceSettings[K]) {
    if (settings) setSettings({ ...settings, [key]: value });
  }

  async function save() {
    if (!token || !settings) return;
    setSaving(true);
    try {
      setSettings((await api.updateDocumentComplianceSettings(token, settings)).settings);
      alerts.showSuccess("Settings saved", "Document compliance settings were updated.");
    } catch (err) {
      alerts.showApiError(err, "Unable to save compliance settings.");
    } finally {
      setSaving(false);
    }
  }

  const enabled = Boolean(settings?.document_compliance_enabled);
  const disabled = !canManage || !enabled;

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <NavRail items={TAB_ITEMS} active={tab} onChange={setTab} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          {tab === "settings" ? (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-medium text-slate-950">Compliance settings</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Expiry alerts, renewal workflow, waivers, and self-service visibility defaults</p>
                </div>
                {canManage ? <Button size="sm" disabled={!enabled} loading={saving} onClick={() => void save()}>Save settings</Button> : null}
              </div>

              {loading || !settings ? (
                <Panel className="h-64 animate-pulse" />
              ) : (
                <Panel className="p-4">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <CheckboxField label="Expiry alerts" disabled={disabled} checked={Boolean(settings.expiry_alerts_enabled)} onChange={(v) => update("expiry_alerts_enabled", v)} />
                    <CheckboxField label="Missing alerts" disabled={disabled} checked={Boolean(settings.missing_required_document_alerts_enabled)} onChange={(v) => update("missing_required_document_alerts_enabled", v)} />
                    <CheckboxField label="Renewal workflow" disabled={disabled} checked={Boolean(settings.renewal_workflow_enabled)} onChange={(v) => update("renewal_workflow_enabled", v)} />
                    <CheckboxField label="Allow waivers" disabled={disabled} checked={Boolean(settings.allow_document_requirement_waiver)} onChange={(v) => update("allow_document_requirement_waiver", v)} />
                    <CheckboxField label="Self-service view" disabled={disabled} checked={Boolean(settings.allow_employee_view_document_compliance)} onChange={(v) => update("allow_employee_view_document_compliance", v)} />
                    <div className="space-y-1.5"><Label>Expiring soon days</Label><Input type="number" min={0} disabled={disabled} value={settings.default_expiring_soon_days} onChange={(e) => update("default_expiring_soon_days", Number(e.target.value))} /></div>
                    <div className="space-y-1.5"><Label>Urgent days</Label><Input type="number" min={0} disabled={disabled} value={settings.default_urgent_expiring_days} onChange={(e) => update("default_urgent_expiring_days", Number(e.target.value))} /></div>
                    <div className="space-y-1.5"><Label>Overdue grace days</Label><Input type="number" min={0} disabled={disabled} value={settings.default_overdue_grace_days} onChange={(e) => update("default_overdue_grace_days", Number(e.target.value))} /></div>
                  </div>
                </Panel>
              )}
            </>
          ) : (
            <>
              <div>
                <p className="text-lg font-medium text-slate-950">Type compliance rules</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Per document-type expiry, activation-block, and sensitivity behavior</p>
              </div>
              {loading ? (
                <div className="flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
              ) : types.length ? (
                <div className="flex flex-col gap-2">
                  {types.map((row) => (
                    <Panel key={row.id} className="flex items-center gap-3.5 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-slate-950">{row.name} <span className="font-mono font-normal text-muted-foreground">{row.code}</span></p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{row.expiry_required || row.requires_expiry_date ? "Expiry required" : "Expiry optional"} · Urgent {row.urgent_expiring_days ?? "-"} days · Activation block {row.blocks_employee_activation ? "Yes" : "No"} · Payroll warning {row.creates_payroll_warning ? "Yes" : "No"}</p>
                      </div>
                      <Badge tone={row.is_sensitive ? "warning" : "neutral"}>{row.sensitivity_level ?? (row.is_sensitive ? "SENSITIVE" : "NORMAL")}</Badge>
                      {canRules ? <RowActionButton intent="edit" size="sm" title="Edit type compliance" onClick={() => setTypeModal(row)}>Edit</RowActionButton> : null}
                    </Panel>
                  ))}
                </div>
              ) : (
                <Panel><EmptyState title="No document types" description="Create document types first in Document Settings." /></Panel>
              )}
            </>
          )}
        </div>
      </div>

      {typeModal ? <TypeComplianceModal type={typeModal} onClose={() => setTypeModal(null)} onSaved={() => { setTypeModal(null); void load(); }} /> : null}
    </PageShell>
  );
}

function TypeComplianceModal({ type, onClose, onSaved }: { type: DocumentType; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [form, setForm] = useState<Partial<DocumentType>>(type);
  const [saving, setSaving] = useState(false);
  const update = <K extends keyof DocumentType>(key: K, value: DocumentType[K]) => setForm((current) => ({ ...current, [key]: value }));

  async function save() {
    if (!token) return;
    setSaving(true);
    try {
      await api.updateDocumentTypeCompliance(token, type.id, form);
      alerts.showSuccess("Type compliance saved", "Document type compliance settings were updated.");
      onSaved();
    } catch (err) {
      alerts.showApiError(err, "Unable to save type compliance settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>Type compliance settings</DialogTitle><p className="text-xs text-muted-foreground">{type.name}</p></DialogHeader>
        <DialogBody>
          <div className="grid grid-cols-2 gap-3">
            <CheckboxField label="Expiry required" checked={Boolean(form.expiry_required)} onChange={(v) => update("expiry_required", v)} />
            <CheckboxField label="Issue date required" checked={Boolean(form.issue_date_required)} onChange={(v) => update("issue_date_required", v)} />
            <CheckboxField label="Document number required" checked={Boolean(form.document_number_required)} onChange={(v) => update("document_number_required", v)} />
            <CheckboxField label="Auto-create renewal case" checked={Boolean(form.renewal_case_auto_create)} onChange={(v) => update("renewal_case_auto_create", v)} />
            <CheckboxField label="Employee summary visible" checked={form.employee_summary_visible !== false} onChange={(v) => update("employee_summary_visible", v)} />
            <CheckboxField label="Employee download allowed" checked={Boolean(form.employee_download_allowed)} onChange={(v) => update("employee_download_allowed", v)} />
            <CheckboxField label="Blocks activation" checked={Boolean(form.blocks_employee_activation)} onChange={(v) => update("blocks_employee_activation", v)} />
            <CheckboxField label="Payroll warning" checked={Boolean(form.creates_payroll_warning)} onChange={(v) => update("creates_payroll_warning", v)} />
            <CheckboxField label="Final settlement warning" checked={Boolean(form.creates_final_settlement_warning)} onChange={(v) => update("creates_final_settlement_warning", v)} />
            <div className="space-y-1.5"><Label>Urgent expiring days</Label><Input type="number" min={0} value={form.urgent_expiring_days ?? ""} onChange={(e) => update("urgent_expiring_days", e.target.value ? Number(e.target.value) : null)} /></div>
            <div className="space-y-1.5"><Label>Compliance weight</Label><Input type="number" min={0} value={form.compliance_weight ?? ""} onChange={(e) => update("compliance_weight", e.target.value ? Number(e.target.value) : null)} /></div>
            <div className="space-y-1.5"><Label>Sensitivity</Label><SelectField value={form.sensitivity_level ?? "NORMAL"} onValueChange={(v) => update("sensitivity_level", v as DocumentType["sensitivity_level"])}><option value="NORMAL">Normal</option><option value="SENSITIVE">Sensitive</option><option value="HIGHLY_SENSITIVE">Highly sensitive</option></SelectField></div>
            <div className="col-span-2 space-y-1.5"><Label>Renewal instructions</Label><Input value={form.renewal_instructions ?? ""} onChange={(e) => update("renewal_instructions", e.target.value)} /></div>
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
