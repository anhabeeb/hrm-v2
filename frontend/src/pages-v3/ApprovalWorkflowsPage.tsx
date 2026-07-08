import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { PageShell, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavRail } from "../components/ui/route-nav-rail";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";
import { humanizeTechnicalLabel } from "../lib/displayLabels";
import { APPROVALS_NAV_ITEMS } from "./approvalsNav";
import type { ApprovalPreview, ApprovalWorkflow, ApprovalWorkflowCondition, ApprovalWorkflowStep } from "../types/approvals";

function statusTone(status: string) {
  if (["ACTIVE"].includes(status)) return { bg: "#EAF3DE", text: "#27500A" };
  if (status === "DRAFT") return { bg: "#FAEEDA", text: "#854F0B" };
  return { bg: "#F7F7FB", text: "#6B6F86" };
}

export function ApprovalWorkflowsPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const [workflows, setWorkflows] = useState<ApprovalWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [detail, setDetail] = useState<{ workflow: ApprovalWorkflow; conditions: ApprovalWorkflowCondition[]; steps: ApprovalWorkflowStep[] } | null>(null);

  const permissions = new Set(user?.permissions ?? []);
  const canManage = permissions.has("approvals.manage") || permissions.has("approvals.workflows.manage");

  async function load() {
    if (!token) return;
    setLoading(true);
    const res = await api.listApprovalWorkflows(token, {}).catch(() => ({ workflows: [] }));
    setWorkflows(res.workflows);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [token]);

  async function open(workflow: ApprovalWorkflow) {
    if (!token) return;
    setDetail(await api.getApprovalWorkflow(token, workflow.id));
  }

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={APPROVALS_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-slate-950">Workflows</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Configurable approval chains routed by module and action</p>
            </div>
            {canManage ? <Button size="sm" onClick={() => setNewOpen(true)}><Plus className="h-4 w-4" /> New workflow</Button> : null}
          </div>

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : workflows.length ? (
            <div className="flex flex-col gap-2">
              {workflows.map((w) => (
                <Panel key={w.id} className="flex items-center gap-3.5 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-950">{w.workflow_name}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{w.workflow_code} · {w.module_key} / {w.action_key} · Priority {w.priority_number} · Fallback {humanizeTechnicalLabel(w.fallback_behavior)}</p>
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: statusTone(w.status).bg, color: statusTone(w.status).text }}>{humanizeTechnicalLabel(w.status)}</span>
                  <Button size="sm" variant="outline" onClick={() => void open(w)}>Configure</Button>
                </Panel>
              ))}
            </div>
          ) : (
            <Panel><EmptyState title="No workflows" description="Create a workflow to route future central approvals." /></Panel>
          )}
        </div>
      </div>

      {newOpen ? <NewWorkflowModal onClose={() => setNewOpen(false)} onSaved={() => { setNewOpen(false); void load(); }} /> : null}
      {detail ? <WorkflowDetailDialog detail={detail} canManage={canManage} onClose={() => setDetail(null)} onChanged={() => void open(detail.workflow)} /> : null}
    </PageShell>
  );
}

function NewWorkflowModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [form, setForm] = useState({ workflow_code: "", workflow_name: "", module_key: "generic", action_key: "approval", applies_to_entity_type: "generic", priority_number: "100" });
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!token || !form.workflow_code || !form.workflow_name) return;
    setSaving(true);
    try {
      await api.createApprovalWorkflow(token, { ...form, priority_number: Number(form.priority_number) } as Partial<ApprovalWorkflow>);
      alerts.showSuccess("Workflow created", "Approval workflow was created.");
      onSaved();
    } catch (err) {
      alerts.showApiError(err, "Unable to save workflow.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>New approval workflow</DialogTitle></DialogHeader>
        <DialogBody>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Code</Label><Input value={form.workflow_code} onChange={(e) => setForm({ ...form, workflow_code: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Name</Label><Input value={form.workflow_name} onChange={(e) => setForm({ ...form, workflow_name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Module key</Label><Input value={form.module_key} onChange={(e) => setForm({ ...form, module_key: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Action key</Label><Input value={form.action_key} onChange={(e) => setForm({ ...form, action_key: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Entity type</Label><Input value={form.applies_to_entity_type} onChange={(e) => setForm({ ...form, applies_to_entity_type: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Priority</Label><Input type="number" value={form.priority_number} onChange={(e) => setForm({ ...form, priority_number: e.target.value })} /></div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} disabled={!form.workflow_code || !form.workflow_name} onClick={() => void submit()}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WorkflowDetailDialog({ detail, canManage, onClose, onChanged }: { detail: { workflow: ApprovalWorkflow; conditions: ApprovalWorkflowCondition[]; steps: ApprovalWorkflowStep[] }; canManage: boolean; onClose: () => void; onChanged: () => void }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [stepForm, setStepForm] = useState({ step_number: "1", step_name: "", step_mode: "SEQUENTIAL", approval_mode: "ANY_ONE", approver_type: "ROLE", approver_value: "" });
  const [conditionForm, setConditionForm] = useState({ field_key: "module_key", operator: "EQUALS", value: "" });
  const [preview, setPreview] = useState<ApprovalPreview | null>(null);
  const [savingStep, setSavingStep] = useState(false);
  const [savingCondition, setSavingCondition] = useState(false);

  async function addStep() {
    if (!token) return;
    setSavingStep(true);
    try {
      const approverField = stepForm.approver_type === "ROLE" ? "approver_role_id" : stepForm.approver_type === "SPECIFIC_USER" ? "approver_user_id" : stepForm.approver_type === "PERMISSION" ? "approver_permission_key" : null;
      await api.createApprovalWorkflowStep(token, detail.workflow.id, {
        step_number: Number(stepForm.step_number),
        step_name: stepForm.step_name,
        step_mode: stepForm.step_mode,
        approval_mode: stepForm.approval_mode,
        approver_type: stepForm.approver_type,
        ...(approverField ? { [approverField]: stepForm.approver_value } : {})
      });
      alerts.showSuccess("Workflow step added", "Approval workflow step was added.");
      onChanged();
    } catch (err) {
      alerts.showApiError(err, "Unable to save workflow step.");
    } finally {
      setSavingStep(false);
    }
  }

  async function addCondition() {
    if (!token) return;
    setSavingCondition(true);
    try {
      await api.createApprovalWorkflowCondition(token, detail.workflow.id, conditionForm);
      alerts.showSuccess("Workflow condition added", "Approval workflow condition was added.");
      onChanged();
    } catch (err) {
      alerts.showApiError(err, "Unable to save workflow condition.");
    } finally {
      setSavingCondition(false);
    }
  }

  async function runPreview() {
    if (!token) return;
    try {
      const res = await api.previewApprovalWorkflow(token, { module_key: detail.workflow.module_key, action_key: detail.workflow.action_key });
      setPreview(res.preview);
    } catch (err) {
      alerts.showApiError(err, "Unable to preview workflow.");
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{detail.workflow.workflow_name}</DialogTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">Sequential/parallel steps, ANY_ONE/ALL_REQUIRED approval modes, and condition builder</p>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-medium text-slate-950">Steps</p>
              <div className="flex flex-col gap-1.5">
                {detail.steps.map((step) => (
                  <div key={step.id} className="rounded-md bg-[#F7F7FB] p-2.5 text-xs">
                    <p className="font-medium text-slate-950">#{step.step_number} {step.step_name}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{step.step_mode} / {step.approval_mode} · {step.approver_type}</p>
                  </div>
                ))}
                {!detail.steps.length ? <p className="text-xs text-muted-foreground">No steps configured yet.</p> : null}
              </div>
              {canManage ? (
                <div className="mt-3 space-y-2 rounded-md border border-dashed p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Add step</p>
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="Step number" type="number" value={stepForm.step_number} onChange={(e) => setStepForm({ ...stepForm, step_number: e.target.value })} />
                    <Input placeholder="Step name" value={stepForm.step_name} onChange={(e) => setStepForm({ ...stepForm, step_name: e.target.value })} />
                    <SelectField value={stepForm.step_mode} onValueChange={(v) => setStepForm({ ...stepForm, step_mode: v })}><option value="SEQUENTIAL">Sequential</option><option value="PARALLEL">Parallel</option></SelectField>
                    <SelectField value={stepForm.approval_mode} onValueChange={(v) => setStepForm({ ...stepForm, approval_mode: v })}><option value="ANY_ONE">Any one</option><option value="ALL_REQUIRED">All required</option></SelectField>
                    <SelectField value={stepForm.approver_type} onValueChange={(v) => setStepForm({ ...stepForm, approver_type: v })}>
                      <option value="ROLE">Role</option>
                      <option value="SPECIFIC_USER">Specific user</option>
                      <option value="PERMISSION">Permission</option>
                      <option value="REPORTING_MANAGER">Reporting manager</option>
                      <option value="DEPARTMENT_HEAD">Department head</option>
                      <option value="LOCATION_MANAGER">Location manager</option>
                      <option value="SUPER_ADMIN_FALLBACK">Super admin fallback</option>
                    </SelectField>
                    <Input placeholder="Role/user/permission ID" value={stepForm.approver_value} onChange={(e) => setStepForm({ ...stepForm, approver_value: e.target.value })} />
                  </div>
                  <Button size="sm" loading={savingStep} onClick={() => void addStep()}>Add step</Button>
                </div>
              ) : null}
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-slate-950">Conditions</p>
              <div className="flex flex-col gap-1.5">
                {detail.conditions.map((c) => (
                  <div key={c.id} className="rounded-md bg-[#F7F7FB] p-2.5 text-xs">
                    <p className="font-medium text-slate-950">{c.field_key} {c.operator.toLowerCase().replace(/_/g, " ")} {String(c.value ?? "-")}</p>
                  </div>
                ))}
                {!detail.conditions.length ? <p className="text-xs text-muted-foreground">No conditions configured yet.</p> : null}
              </div>
              {canManage ? (
                <div className="mt-3 space-y-2 rounded-md border border-dashed p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Add condition</p>
                  <div className="grid grid-cols-3 gap-2">
                    <Input placeholder="Field" value={conditionForm.field_key} onChange={(e) => setConditionForm({ ...conditionForm, field_key: e.target.value })} />
                    <SelectField value={conditionForm.operator} onValueChange={(v) => setConditionForm({ ...conditionForm, operator: v })}>
                      {["EQUALS", "NOT_EQUALS", "IN", "NOT_IN", "GREATER_THAN", "LESS_THAN", "EXISTS"].map((o) => <option key={o} value={o}>{humanizeTechnicalLabel(o)}</option>)}
                    </SelectField>
                    <Input placeholder="Value" value={conditionForm.value} onChange={(e) => setConditionForm({ ...conditionForm, value: e.target.value })} />
                  </div>
                  <Button size="sm" loading={savingCondition} onClick={() => void addCondition()}>Add condition</Button>
                </div>
              ) : null}

              <div className="mt-4 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-slate-950">Workflow preview</p>
                  <Button size="sm" variant="outline" onClick={() => void runPreview()}>Preview</Button>
                </div>
                {preview ? (
                  <div className="mt-2 space-y-1.5 text-xs">
                    <p>Fallback: <span className="font-medium">{humanizeTechnicalLabel(preview.fallback_behavior)}</span></p>
                    {preview.warnings.length ? <p className="rounded-md bg-[#FAEEDA] p-2 text-[#854F0B]">{preview.warnings.join(" ")}</p> : null}
                    {preview.steps.map((step) => (
                      <div key={step.id} className="rounded-md bg-[#F7F7FB] p-2">
                        {step.step_name} · {step.approver_type} · {step.approval_mode}
                        <p className="mt-0.5 text-[10px] text-muted-foreground">Approvers resolved: {step.approvers?.length ?? 0}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-[10px] text-muted-foreground">Shows the matched workflow, resolved approvers, fallback behavior, and self-approval warnings.</p>
                )}
              </div>
            </div>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
