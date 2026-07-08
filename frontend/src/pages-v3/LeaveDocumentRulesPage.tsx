import { useEffect, useState } from "react";
import { FileWarning, Plus } from "lucide-react";
import { PageShell, CheckboxField, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavRail } from "../components/ui/route-nav-rail";
import { EmptyState } from "../components/ui/empty-state";
import { Button, RowActionButton } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";
import { LEAVE_NAV_ITEMS } from "./leaveNav";
import type { LeavePolicy } from "../types/leave";
import type { DocumentType } from "../types/documents";

interface DocumentRuleRow {
  id: string;
  leave_policy_id: string;
  document_type_id?: string | null;
  document_type_name?: string | null;
  requires_document: number | boolean;
  required_after_consecutive_days: number | null;
  required_after_used_days: number | null;
  notes?: string | null;
  is_active: number | boolean;
}

function bool(value: unknown) {
  return value === true || value === 1;
}

export function LeaveDocumentRulesPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const permissions = new Set(user?.permissions ?? []);
  const canManage = permissions.has("leave.settings.manage");
  const [policies, setPolicies] = useState<LeavePolicy[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [policyId, setPolicyId] = useState("");
  const [rules, setRules] = useState<DocumentRuleRow[]>([]);
  const [allRules, setAllRules] = useState<Array<DocumentRuleRow & { policy: LeavePolicy }>>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<DocumentRuleRow | "new" | null>(null);

  async function loadBase() {
    if (!token) return;
    setLoading(true);
    try {
      const [policiesRes, typesRes] = await Promise.all([api.listLeavePolicies(token), api.listDocumentTypes(token)]);
      setPolicies(policiesRes.policies);
      setDocumentTypes(typesRes.document_types);
      if (!policyId && policiesRes.policies[0]) setPolicyId(policiesRes.policies[0].id);
      const entries = await Promise.all(policiesRes.policies.map((policy) => api.listLeavePolicyDocumentRules(token, policy.id).then((r) => (r.document_rules as unknown as DocumentRuleRow[]).map((rule) => ({ ...rule, policy })))));
      setAllRules(entries.flat());
    } catch (err) {
      alerts.showApiError(err, "Unable to load document rules.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadBase(); }, [token]);

  async function loadPolicyRules() {
    if (!token || !policyId) return;
    setRules((await api.listLeavePolicyDocumentRules(token, policyId)).document_rules as unknown as DocumentRuleRow[]);
  }

  useEffect(() => { void loadPolicyRules(); }, [policyId]);

  async function toggle(row: DocumentRuleRow) {
    if (!token) return;
    try {
      await api.leavePolicyDocumentRuleAction(token, policyId, row.id, bool(row.is_active) ? "disable" : "enable");
      alerts.showSuccess("Rule updated", `Document rule was ${bool(row.is_active) ? "disabled" : "enabled"}.`);
      await Promise.all([loadPolicyRules(), loadBase()]);
    } catch (err) {
      alerts.showApiError(err, "Unable to update document rule.");
    }
  }

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={LEAVE_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-lg font-medium text-slate-950">Document rules</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Supporting documents required per policy</p>
          </div>

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 2 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : allRules.length ? (
            <div className="flex flex-col gap-2">
              {allRules.map((rule) => (
                <Panel key={rule.id} className="flex items-center gap-3.5 p-3">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#FCEBEB]"><FileWarning className="h-4 w-4 text-[#A32D2D]" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-950">{rule.policy.leave_type_name ?? rule.policy.name} · {rule.document_type_name ?? "supporting document"}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {rule.required_after_consecutive_days ? `Required when a request exceeds ${rule.required_after_consecutive_days} consecutive days` : rule.required_after_used_days ? `Required after ${rule.required_after_used_days} used days` : "Always required"}
                      {rule.notes ? ` · ${rule.notes}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: bool(rule.requires_document) ? "#EAF3DE" : "#F7F7FB", color: bool(rule.requires_document) ? "#27500A" : "#6B6F86" }}>{bool(rule.requires_document) ? "Enforced" : "Optional"}</span>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: bool(rule.is_active) ? "#EAF3DE" : "#F7F7FB", color: bool(rule.is_active) ? "#27500A" : "#6B6F86" }}>{bool(rule.is_active) ? "Active" : "Inactive"}</span>
                  {canManage ? (
                    <div className="flex shrink-0 gap-1.5">
                      <RowActionButton intent="edit" size="sm" title="Edit rule" onClick={() => { setPolicyId(rule.leave_policy_id); setModal(rule); }}>Edit</RowActionButton>
                      <Button size="sm" variant={bool(rule.is_active) ? "danger" : "primary"} onClick={() => { setPolicyId(rule.leave_policy_id); void toggle(rule); }}>{bool(rule.is_active) ? "Disable" : "Enable"}</Button>
                    </div>
                  ) : null}
                </Panel>
              ))}
            </div>
          ) : (
            <Panel><EmptyState title="No document rules configured" description={policies.length ? "Set up document requirements per policy below." : "Configure leave policies first, then add document rules."} /></Panel>
          )}

          {canManage ? (
            <Panel className="flex flex-col gap-3 p-3 md:flex-row md:items-end md:justify-between">
              <div className="w-full max-w-xl space-y-1.5"><Label>Policy</Label><SelectField value={policyId} onValueChange={setPolicyId}>{policies.map((policy) => <option key={policy.id} value={policy.id}>{policy.name} - {policy.leave_type_name ?? "Leave"}</option>)}</SelectField></div>
              <Button size="sm" onClick={() => setModal("new")} disabled={!policyId}><Plus className="h-4 w-4" /> Create document rule</Button>
            </Panel>
          ) : null}
        </div>
      </div>

      {modal ? (
        <DocumentRuleModal
          policyId={policyId}
          rule={modal === "new" ? undefined : modal}
          documentTypes={documentTypes}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); void Promise.all([loadPolicyRules(), loadBase()]); }}
        />
      ) : null}
    </PageShell>
  );
}

function DocumentRuleModal({
  policyId,
  rule,
  documentTypes,
  onClose,
  onSaved
}: {
  policyId: string;
  rule?: DocumentRuleRow;
  documentTypes: DocumentType[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [form, setForm] = useState({
    document_type_id: String(rule?.document_type_id ?? ""),
    requires_document: rule ? Boolean(rule.requires_document) : true,
    required_after_consecutive_days: String(rule?.required_after_consecutive_days ?? ""),
    required_after_used_days: String(rule?.required_after_used_days ?? ""),
    notes: String(rule?.notes ?? "")
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!token) return;
    setSaving(true);
    try {
      const input = {
        document_type_id: form.document_type_id || null,
        requires_document: form.requires_document,
        required_after_consecutive_days: form.required_after_consecutive_days ? Number(form.required_after_consecutive_days) : null,
        required_after_used_days: form.required_after_used_days ? Number(form.required_after_used_days) : null,
        notes: form.notes || null
      };
      if (rule?.id) await api.updateLeavePolicyDocumentRule(token, policyId, rule.id, input);
      else await api.createLeavePolicyDocumentRule(token, policyId, input);
      alerts.showSuccess("Document rule saved", "The document rule was saved.");
      onSaved();
    } catch (err) {
      alerts.showApiError(err, "Unable to save document rule.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>{rule ? "Edit document rule" : "Create document rule"}</DialogTitle></DialogHeader>
        <DialogBody>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5"><Label>Document type</Label><SelectField value={form.document_type_id} onValueChange={(v) => setForm({ ...form, document_type_id: v })}><option value="">Generic supporting document</option>{documentTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>After consecutive days</Label><Input type="number" value={form.required_after_consecutive_days} onChange={(e) => setForm({ ...form, required_after_consecutive_days: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>After used days</Label><Input type="number" value={form.required_after_used_days} onChange={(e) => setForm({ ...form, required_after_used_days: e.target.value })} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <CheckboxField label="Requires document" checked={form.requires_document} onChange={(v) => setForm({ ...form, requires_document: v })} />
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
