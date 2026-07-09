import { useEffect, useState } from "react";
import { ArrowRight, Pencil, Plus, Trash2 } from "lucide-react";
import { PageShell, CheckboxField, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavSwitcher } from "../components/ui/route-nav-switcher";
import { EmptyState } from "../components/ui/empty-state";
import { Badge } from "../components/ui/badge";
import { Button, RowActionButton } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { OrganizationCascadeSelector } from "../components/organization/OrganizationCascadeSelector";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";
import { humanizeTechnicalLabel } from "../lib/displayLabels";
import { LEAVE_NAV_ITEMS } from "./leaveNav";
import type { LeaveType, LeaveWorkflow, LeaveWorkflowStep } from "../types/leave";
import type { OrganizationDepartment, OrganizationLocation } from "../types/organization";
import type { AccessUser, Role } from "../types/auth";

function bool(value: unknown) {
  return value === true || value === 1;
}

function stepLabel(step: LeaveWorkflowStep) {
  if (step.role_name) return step.role_name;
  if (step.user_name) return step.user_name;
  if (step.approver_type === "PERMISSION" && step.permission_key) return humanizeTechnicalLabel(step.permission_key);
  return humanizeTechnicalLabel(step.approver_type);
}

const APPROVER_TYPES = ["ROLE", "USER", "REPORTING_MANAGER", "DEPARTMENT_MANAGER", "DEPARTMENT_SENIOR", "DIRECTOR", "HR_ROLE", "PERMISSION"];

export function LeaveWorkflowsPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const permissions = new Set(user?.permissions ?? []);
  const canManage = permissions.has("leave.workflow.manage");
  const [workflows, setWorkflows] = useState<LeaveWorkflow[]>([]);
  const [stepsByWorkflow, setStepsByWorkflow] = useState<Record<string, LeaveWorkflowStep[]>>({});
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [workflowModal, setWorkflowModal] = useState<LeaveWorkflow | "new" | null>(null);
  const [stepsWorkflow, setStepsWorkflow] = useState<LeaveWorkflow | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const [workflowsRes, typesRes, deptRes, locRes, roleRes, userRes] = await Promise.all([
        api.listLeaveWorkflows(token),
        api.listLeaveTypes(token),
        api.listDepartments(token),
        api.listLocations(token),
        api.listRoles(token),
        api.listUsers(token)
      ]);
      setWorkflows(workflowsRes.workflows);
      setTypes(typesRes.leave_types);
      setDepartments(deptRes.departments);
      setLocations(locRes.locations);
      setRoles(roleRes.roles);
      setUsers(userRes.users);
      const entries = await Promise.all(workflowsRes.workflows.map((w) => api.listLeaveWorkflowSteps(token, w.id).then((r) => [w.id, r.steps.sort((a, b) => a.step_order - b.step_order)] as const).catch(() => [w.id, []] as const)));
      setStepsByWorkflow(Object.fromEntries(entries));
    } catch (err) {
      alerts.showApiError(err, "Unable to load approval workflows.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token]);

  async function toggle(row: LeaveWorkflow) {
    if (!token) return;
    try {
      await api.leaveWorkflowAction(token, row.id, bool(row.is_active) ? "disable" : "enable");
      alerts.showSuccess("Workflow updated", `${row.name} was ${bool(row.is_active) ? "disabled" : "enabled"}.`);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to update workflow.");
    }
  }

  return (
    <PageShell constrained={false}>
      <div className="flex flex-col gap-3">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="px-4 flex items-center justify-between">
              <div>
                <RouteNavSwitcher items={LEAVE_NAV_ITEMS} moduleLabel="Leave" />
                <p className="mt-0.5 text-xs text-muted-foreground">Ordered approval steps applied to leave requests</p>
              </div>
              {canManage ? <Button size="sm" onClick={() => setWorkflowModal("new")}><Plus className="h-4 w-4" /> New workflow</Button> : null}
</div>

              <Panel className="shadow-none space-y-3 p-4">
          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 2 }).map((_, i) => <Panel key={i} className="h-20 animate-pulse" />)}</div>
          ) : workflows.length ? (
            <div className="flex flex-col gap-3">
              {workflows.map((workflow) => {
                const steps = stepsByWorkflow[workflow.id] ?? [];
                return (
                  <Panel key={workflow.id} className="p-3.5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-xs font-medium text-slate-950">
                        {workflow.name}
                        {workflow.is_default ? <Badge tone="info" className="ml-1.5">Default</Badge> : null}
                        {workflow.leave_type_name ? <span className="font-normal text-muted-foreground"> · applies to {workflow.leave_type_name}</span> : null}
                      </p>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Badge tone={bool(workflow.is_active) ? "success" : "neutral"}>{bool(workflow.is_active) ? "Active" : "Inactive"}</Badge>
                        {canManage ? (
                          <>
                            <RowActionButton intent="edit" size="sm" title="Steps" onClick={() => setStepsWorkflow(workflow)}>Steps</RowActionButton>
                            <RowActionButton intent="edit" size="sm" title="Edit workflow" onClick={() => setWorkflowModal(workflow)}>Edit</RowActionButton>
                            <Button size="sm" variant={bool(workflow.is_active) ? "danger" : "primary"} onClick={() => void toggle(workflow)}>{bool(workflow.is_active) ? "Disable" : "Enable"}</Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                    {steps.length ? (
                      <div className="flex flex-wrap items-center gap-2.5">
                        {steps.map((step, i) => (
                          <div key={step.id} className="flex items-center gap-2.5">
                            <div className="flex items-center gap-2 rounded-md bg-[#F7F7FB] px-3 py-2">
                              <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-primary text-[9px] font-medium text-white">{step.step_order}</span>
                              <span className="text-xs text-slate-950">{stepLabel(step)}</span>
                            </div>
                            {i < steps.length - 1 ? <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No steps configured for this workflow.</p>
                    )}
                  </Panel>
                );
              })}
            </div>
          ) : (
            <Panel><EmptyState title="No approval workflows configured" description="Create a workflow to route leave requests for approval." /></Panel>
          )}

              </Panel>
        </div>
      </div>

      {workflowModal ? (
        <WorkflowModal
          workflow={workflowModal === "new" ? undefined : workflowModal}
          types={types}
          departments={departments}
          locations={locations}
          onClose={() => setWorkflowModal(null)}
          onSaved={() => { setWorkflowModal(null); void load(); }}
        />
      ) : null}
      {stepsWorkflow ? (
        <StepsModal
          workflow={stepsWorkflow}
          roles={roles}
          users={users}
          onClose={() => { setStepsWorkflow(null); void load(); }}
        />
      ) : null}
    </PageShell>
  );
}

function WorkflowModal({
  workflow,
  types,
  departments,
  locations,
  onClose,
  onSaved
}: {
  workflow?: LeaveWorkflow;
  types: LeaveType[];
  departments: OrganizationDepartment[];
  locations: OrganizationLocation[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [form, setForm] = useState({
    name: workflow?.name ?? "",
    description: workflow?.description ?? "",
    applies_to_leave_type_id: workflow?.applies_to_leave_type_id ?? "",
    applies_to_employee_type: workflow?.applies_to_employee_type ?? "",
    applies_to_employment_type: workflow?.applies_to_employment_type ?? "",
    department_id: workflow?.department_id ?? "",
    location_id: workflow?.location_id ?? "",
    is_default: bool(workflow?.is_default),
    priority: String(workflow?.priority ?? 100)
  });
  const [saving, setSaving] = useState(false);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    if (!token) return;
    setSaving(true);
    try {
      const input = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value === "" ? null : value]));
      if (workflow) await api.updateLeaveWorkflow(token, workflow.id, input);
      else await api.createLeaveWorkflow(token, input);
      alerts.showSuccess("Workflow saved", "The approval workflow was saved.");
      onSaved();
    } catch (err) {
      alerts.showApiError(err, "Unable to save workflow.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="lg">
        <DialogHeader><DialogTitle>{workflow ? "Edit workflow" : "Create workflow"}</DialogTitle></DialogHeader>
        <DialogBody>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5"><Label>Name</Label><Input value={form.name} onChange={(e) => update("name", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Description</Label><Input value={form.description} onChange={(e) => update("description", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Leave type</Label><SelectField value={form.applies_to_leave_type_id} onValueChange={(v) => update("applies_to_leave_type_id", v)}><option value="">Any</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>Priority</Label><Input type="number" value={form.priority} onChange={(e) => update("priority", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Employee type</Label><SelectField value={form.applies_to_employee_type} onValueChange={(v) => update("applies_to_employee_type", v)}><option value="">Any</option><option value="LOCAL">Local</option><option value="FOREIGN">Foreign</option><option value="OTHER">Other</option></SelectField></div>
            <div className="space-y-1.5"><Label>Employment type</Label><SelectField value={form.applies_to_employment_type} onValueChange={(v) => update("applies_to_employment_type", v)}><option value="">Any</option><option value="FULL_TIME">Full time</option><option value="PART_TIME">Part time</option><option value="INTERN">Intern</option><option value="TEMPORARY">Temporary</option><option value="CONTRACT">Contract</option></SelectField></div>
            <div className="md:col-span-2">
              <OrganizationCascadeSelector
                value={{ locationId: form.location_id, departmentId: form.department_id }}
                onChange={(next) => setForm((current) => ({ ...current, location_id: next.locationId ?? "", department_id: next.departmentId ?? "" }))}
                departments={departments}
                locations={locations}
                jobLevels={[]}
                positions={[]}
                includeLocation
                includeJobLevel={false}
                includePosition={false}
                mode="approval-routing"
                labels={{ locationId: "Location", departmentId: "Department" }}
                className="grid gap-3 md:grid-cols-2"
                allowEmpty
              />
            </div>
            <CheckboxField label="Default workflow" checked={form.is_default} onChange={(v) => update("is_default", v)} />
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

function StepsModal({ workflow, roles, users, onClose }: { workflow: LeaveWorkflow; roles: Role[]; users: AccessUser[]; onClose: () => void }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const blankForm = { step_order: "1", step_name: "", approver_type: "PERMISSION" as LeaveWorkflowStep["approver_type"], role_id: "", user_id: "", permission_key: "leave.approve", is_required: true, skip_if_no_approver: true, allow_self_approval: false };
  const [steps, setSteps] = useState<LeaveWorkflowStep[]>([]);
  const [form, setForm] = useState(blankForm);
  const [editing, setEditing] = useState<LeaveWorkflowStep | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      setSteps((await api.listLeaveWorkflowSteps(token, workflow.id)).steps.sort((a, b) => a.step_order - b.step_order));
    } catch (err) {
      alerts.showApiError(err, "Unable to load workflow steps.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [workflow.id]);

  function reset(nextOrder = form.step_order) {
    setEditing(null);
    setForm({ ...blankForm, step_order: nextOrder });
  }

  function edit(step: LeaveWorkflowStep) {
    setEditing(step);
    setForm({ step_order: String(step.step_order), step_name: step.step_name, approver_type: step.approver_type, role_id: step.role_id ?? "", user_id: step.user_id ?? "", permission_key: step.permission_key ?? "", is_required: bool(step.is_required), skip_if_no_approver: bool(step.skip_if_no_approver), allow_self_approval: bool(step.allow_self_approval) });
  }

  async function save() {
    if (!token) return;
    setSaving(true);
    try {
      const input = { ...form, step_order: Number(form.step_order) };
      if (editing) await api.updateLeaveWorkflowStep(token, workflow.id, editing.id, input);
      else await api.createLeaveWorkflowStep(token, workflow.id, input);
      alerts.showSuccess("Step saved", "The workflow step was saved.");
      reset(String(Number(form.step_order) + 1));
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to save workflow step.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(step: LeaveWorkflowStep) {
    if (!token) return;
    try {
      await api.deleteLeaveWorkflowStep(token, workflow.id, step.id);
      alerts.showSuccess("Step removed", "The workflow step was removed.");
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to remove workflow step.");
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Workflow steps — {workflow.name}</DialogTitle>
          <p className="text-xs text-muted-foreground">Department manager, senior, and director steps follow the configured skip/block rule until hierarchy resolution is complete.</p>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-3 rounded-md border border-[#F1F1F7] p-3 md:grid-cols-4">
            <div className="space-y-1.5"><Label>Order</Label><Input type="number" value={form.step_order} onChange={(e) => setForm({ ...form, step_order: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Step name</Label><Input value={form.step_name} onChange={(e) => setForm({ ...form, step_name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Approver type</Label><SelectField value={form.approver_type} onValueChange={(v) => setForm({ ...form, approver_type: v as LeaveWorkflowStep["approver_type"] })}>{APPROVER_TYPES.map((t) => <option key={t} value={t}>{humanizeTechnicalLabel(t)}</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>Role</Label><SelectField value={form.role_id} onValueChange={(v) => setForm({ ...form, role_id: v })}><option value="">Any</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>User</Label><SelectField value={form.user_id} onValueChange={(v) => setForm({ ...form, user_id: v })}><option value="">Any</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>Permission key</Label><Input value={form.permission_key} onChange={(e) => setForm({ ...form, permission_key: e.target.value })} /></div>
            <div className="flex items-end gap-4">
              <CheckboxField label="Required" checked={form.is_required} onChange={(v) => setForm({ ...form, is_required: v })} />
              <CheckboxField label="Skip if no approver" checked={form.skip_if_no_approver} onChange={(v) => setForm({ ...form, skip_if_no_approver: v })} />
            </div>
            <CheckboxField label="Allow self approval" checked={form.allow_self_approval} onChange={(v) => setForm({ ...form, allow_self_approval: v })} />
            <div className="flex items-end gap-2">
              <Button size="sm" loading={saving} onClick={() => void save()}><Plus className="h-4 w-4" /> {editing ? "Save step" : "Add step"}</Button>
              {editing ? <Button variant="outline" size="sm" onClick={() => reset()}>Cancel edit</Button> : null}
            </div>
          </div>

          <div className="mt-3 flex flex-col gap-2">
            {loading ? (
              Array.from({ length: 2 }).map((_, i) => <Panel key={i} className="h-14 animate-pulse" />)
            ) : steps.length ? (
              steps.map((step) => (
                <Panel key={step.id} className="flex items-center gap-3.5 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-950">{step.step_order}. {step.step_name}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{humanizeTechnicalLabel(step.approver_type)} · {stepLabel(step)} · Required {bool(step.is_required) ? "Yes" : "No"} · Skip if no approver {bool(step.skip_if_no_approver) ? "Yes" : "No"} · Self approval {bool(step.allow_self_approval) ? "Yes" : "No"}</p>
                  </div>
                  <RowActionButton intent="edit" size="sm" title="Edit step" onClick={() => edit(step)}><Pencil className="h-4 w-4" /></RowActionButton>
                  <RowActionButton intent="delete" size="sm" title="Delete step" onClick={() => void remove(step)}><Trash2 className="h-4 w-4" /></RowActionButton>
                </Panel>
              ))
            ) : (
              <EmptyState title="No steps yet" description="Add the first approval step above." />
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
