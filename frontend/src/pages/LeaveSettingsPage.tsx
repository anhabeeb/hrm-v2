import { Pencil, Plus, Power, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { AdminHelpLink } from "../features/admin-help/AdminHelpLink";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import type { AccessUser, Role } from "../types/auth";
import type { DocumentType } from "../types/documents";
import type { LeavePolicy, LeaveType, LeaveWorkflow, LeaveWorkflowStep } from "../types/leave";
import type { OrganizationDepartment, OrganizationLocation, OrganizationPosition } from "../types/organization";

type Tab = "types" | "policies" | "documentRules" | "deductionRules" | "workflows";
type LeaveWorkflowStepForm = {
  step_order: string;
  step_name: string;
  approver_type: LeaveWorkflowStep["approver_type"];
  role_id: string;
  user_id: string;
  permission_key: string;
  is_required: boolean;
  skip_if_no_approver: boolean;
  allow_self_approval: boolean;
};

export function LeaveSettingsPage() {
  const { token, user } = useAuth();
  const canView = Boolean(user?.permissions.includes("leave.view"));
  const canSettings = Boolean(user?.permissions.includes("leave.settings.manage"));
  const canWorkflow = Boolean(user?.permissions.includes("leave.workflow.manage"));
  const [tab, setTab] = useState<Tab>("types");
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [policies, setPolicies] = useState<LeavePolicy[]>([]);
  const [workflows, setWorkflows] = useState<LeaveWorkflow[]>([]);
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [positions, setPositions] = useState<OrganizationPosition[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<AccessUser[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [typeModal, setTypeModal] = useState<LeaveType | "new" | null>(null);
  const [policyModal, setPolicyModal] = useState<LeavePolicy | "new" | null>(null);
  const [workflowModal, setWorkflowModal] = useState<LeaveWorkflow | "new" | null>(null);
  const [stepsWorkflow, setStepsWorkflow] = useState<LeaveWorkflow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    setError(null);
    try {
      const [typeResult, policyResult, workflowResult, departmentResult, positionResult, locationResult, roleResult, userResult, documentTypeResult] = await Promise.all([
        api.listLeaveTypes(token),
        api.listLeavePolicies(token),
        api.listLeaveWorkflows(token),
        api.listDepartments(token),
        api.listPositions(token),
        api.listLocations(token),
        api.listRoles(token),
        api.listUsers(token),
        api.listDocumentTypes(token)
      ]);
      setTypes(typeResult.leave_types);
      setPolicies(policyResult.policies);
      setWorkflows(workflowResult.workflows);
      setDepartments(departmentResult.departments);
      setPositions(positionResult.positions);
      setLocations(locationResult.locations);
      setRoles(roleResult.roles);
      setUsers(userResult.users);
      setDocumentTypes(documentTypeResult.document_types);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load leave settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, canView]);

  if (!canView) return <Panel><EmptyState title="Leave settings unavailable" description="Your account needs leave.view permission." /></Panel>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div><h1 className="text-lg font-semibold">Leave Settings</h1><p className="text-sm text-muted-foreground">Leave types, configurable policies, deduction/document rules, and approval workflows.</p></div>
        <AdminHelpLink target="leave" label="View Leave Guide" />
      </div>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Panel className="overflow-hidden">
        <div className="flex overflow-x-auto border-b">{(["types", "policies", "documentRules", "deductionRules", "workflows"] as Tab[]).map((item) => <button key={item} className={`h-11 border-b-2 px-4 text-sm font-medium ${tab === item ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:bg-muted/50"}`} onClick={() => setTab(item)}>{tabLabel(item)}</button>)}</div>
        {tab === "types" ? <TypesTable types={types} canManage={canSettings} loading={loading} onNew={() => setTypeModal("new")} onEdit={setTypeModal} onAction={async (row) => { if (!token) return; await api.leaveTypeAction(token, row.id, row.is_active ? "disable" : "enable"); await load(); }} /> : null}
        {tab === "policies" ? <PoliciesTable policies={policies} canManage={canSettings} loading={loading} onNew={() => setPolicyModal("new")} onEdit={setPolicyModal} onAction={async (row) => { if (!token) return; await api.leavePolicyAction(token, row.id, row.is_active ? "disable" : "enable"); await load(); }} /> : null}
        {tab === "documentRules" && token ? <PolicyDocumentRulesTable token={token} policies={policies} documentTypes={documentTypes} canManage={canSettings} /> : null}
        {tab === "deductionRules" && token ? <PolicyDeductionRulesTable token={token} policies={policies} canManage={canSettings} /> : null}
        {tab === "workflows" ? <WorkflowsTable workflows={workflows} canManage={canWorkflow} loading={loading} onNew={() => setWorkflowModal("new")} onEdit={setWorkflowModal} onSteps={setStepsWorkflow} onAction={async (row) => { if (!token) return; await api.leaveWorkflowAction(token, row.id, row.is_active ? "disable" : "enable"); await load(); }} /> : null}
      </Panel>
      {typeModal && token ? <TypeModal token={token} type={typeModal === "new" ? undefined : typeModal} onClose={() => setTypeModal(null)} onSaved={load} /> : null}
      {policyModal && token ? <PolicyModal token={token} policy={policyModal === "new" ? undefined : policyModal} types={types} departments={departments} positions={positions} locations={locations} onClose={() => setPolicyModal(null)} onSaved={load} /> : null}
      {workflowModal && token ? <WorkflowModal token={token} workflow={workflowModal === "new" ? undefined : workflowModal} types={types} departments={departments} locations={locations} onClose={() => setWorkflowModal(null)} onSaved={load} /> : null}
      {stepsWorkflow && token ? <EditableStepsModal token={token} workflow={stepsWorkflow} roles={roles} users={users} onClose={() => setStepsWorkflow(null)} /> : null}
    </div>
  );
}

function boolText(value: number | boolean) {
  return value ? "Yes" : "No";
}

function tabLabel(tab: Tab) {
  if (tab === "types") return "Leave Types";
  if (tab === "policies") return "Leave Policies";
  if (tab === "documentRules") return "Policy Document Rules";
  if (tab === "deductionRules") return "Deduction Rules";
  return "Approval Workflows";
}

function TypesTable({ types, canManage, loading, onNew, onEdit, onAction }: { types: LeaveType[]; canManage: boolean; loading: boolean; onNew: () => void; onEdit: (row: LeaveType) => void; onAction: (row: LeaveType) => void }) {
  return <SectionToolbar canManage={canManage} label="Create type" onNew={onNew}><Table><TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Paid default</TableHead><TableHead>Statutory</TableHead><TableHead>Status</TableHead><TableHead>Sort</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{types.map((row) => <TableRow key={row.id}><TableCell className="font-mono text-xs">{row.code}</TableCell><TableCell className="font-medium">{row.name}</TableCell><TableCell>{boolText(row.is_paid_default)}</TableCell><TableCell>{boolText(row.is_statutory)}</TableCell><TableCell><Badge tone={row.is_active ? "success" : "neutral"}>{row.is_active ? "Active" : "Inactive"}</Badge></TableCell><TableCell>{row.sort_order}</TableCell><TableCell><Actions canManage={canManage} onEdit={() => onEdit(row)} onAction={() => onAction(row)} active={Boolean(row.is_active)} /></TableCell></TableRow>)}</TableBody></Table>{loading ? <EmptyState title="Loading leave types" description="Fetching leave type registry." /> : null}</SectionToolbar>;
}

function PoliciesTable({ policies, canManage, loading, onNew, onEdit, onAction }: { policies: LeavePolicy[]; canManage: boolean; loading: boolean; onNew: () => void; onEdit: (row: LeavePolicy) => void; onAction: (row: LeavePolicy) => void }) {
  return <SectionToolbar canManage={canManage} label="Create policy" onNew={onNew}><Table><TableHeader><TableRow><TableHead>Policy</TableHead><TableHead>Leave type</TableHead><TableHead>Employee type</TableHead><TableHead>Employment</TableHead><TableHead>Department</TableHead><TableHead>Position</TableHead><TableHead>Location</TableHead><TableHead>Entitlement</TableHead><TableHead>Docs</TableHead><TableHead>Deduction</TableHead><TableHead>Holidays</TableHead><TableHead>Weekly off</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{policies.map((row) => <TableRow key={row.id}><TableCell className="font-medium">{row.name}</TableCell><TableCell>{row.leave_type_name}</TableCell><TableCell>{row.applies_to_employee_type ?? "Any"}</TableCell><TableCell>{row.applies_to_employment_type ?? "Any"}</TableCell><TableCell>{row.department_name ?? "Any"}</TableCell><TableCell>{row.position_title ?? "Any"}</TableCell><TableCell>{row.location_name ?? "Any"}</TableCell><TableCell>{row.annual_entitlement_days ?? "-"}</TableCell><TableCell>{row.requires_document ? "Required" : "Optional"}</TableCell><TableCell>{row.salary_deduction_mode}</TableCell><TableCell>{boolText(row.include_public_holidays)}</TableCell><TableCell>{boolText(row.include_weekly_off_days)}</TableCell><TableCell>{row.priority}</TableCell><TableCell><Badge tone={row.is_active ? "success" : "neutral"}>{row.is_active ? "Active" : "Inactive"}</Badge></TableCell><TableCell><Actions canManage={canManage} onEdit={() => onEdit(row)} onAction={() => onAction(row)} active={Boolean(row.is_active)} /></TableCell></TableRow>)}</TableBody></Table>{loading ? <EmptyState title="Loading leave policies" description="Fetching policy registry." /> : null}</SectionToolbar>;
}

function WorkflowsTable({ workflows, canManage, loading, onNew, onEdit, onSteps, onAction }: { workflows: LeaveWorkflow[]; canManage: boolean; loading: boolean; onNew: () => void; onEdit: (row: LeaveWorkflow) => void; onSteps: (row: LeaveWorkflow) => void; onAction: (row: LeaveWorkflow) => void }) {
  return <SectionToolbar canManage={canManage} label="Create workflow" onNew={onNew}><Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Leave type</TableHead><TableHead>Employee type</TableHead><TableHead>Employment</TableHead><TableHead>Department</TableHead><TableHead>Location</TableHead><TableHead>Default</TableHead><TableHead>Priority</TableHead><TableHead>Steps</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{workflows.map((row) => <TableRow key={row.id}><TableCell className="font-medium">{row.name}</TableCell><TableCell>{row.leave_type_name ?? "Any"}</TableCell><TableCell>{row.applies_to_employee_type ?? "Any"}</TableCell><TableCell>{row.applies_to_employment_type ?? "Any"}</TableCell><TableCell>{row.department_name ?? "Any"}</TableCell><TableCell>{row.location_name ?? "Any"}</TableCell><TableCell>{row.is_default ? <Badge tone="info">Default</Badge> : "-"}</TableCell><TableCell>{row.priority}</TableCell><TableCell>{row.steps_count ?? 0}</TableCell><TableCell><Badge tone={row.is_active ? "success" : "neutral"}>{row.is_active ? "Active" : "Inactive"}</Badge></TableCell><TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="sm" onClick={() => onSteps(row)}>Steps</Button><Actions canManage={canManage} onEdit={() => onEdit(row)} onAction={() => onAction(row)} active={Boolean(row.is_active)} /></div></TableCell></TableRow>)}</TableBody></Table>{loading ? <EmptyState title="Loading workflows" description="Fetching approval workflows." /> : null}</SectionToolbar>;
}

function PolicyDocumentRulesTable({ token, policies, documentTypes, canManage }: { token: string; policies: LeavePolicy[]; documentTypes: DocumentType[]; canManage: boolean }) {
  const [policyId, setPolicyId] = useState("");
  const [rules, setRules] = useState<Record<string, unknown>[]>([]);
  const [modal, setModal] = useState<Record<string, unknown> | "new" | null>(null);
  useEffect(() => { if (!policyId && policies[0]) setPolicyId(policies[0].id); }, [policies, policyId]);
  async function load() { if (policyId) setRules((await api.listLeavePolicyDocumentRules(token, policyId)).document_rules); }
  useEffect(() => { void load(); }, [policyId]);
  async function toggle(row: Record<string, unknown>) { await api.leavePolicyDocumentRuleAction(token, policyId, String(row.id), row.is_active ? "disable" : "enable"); await load(); }
  return <div><RulesToolbar policies={policies} policyId={policyId} setPolicyId={setPolicyId} canManage={canManage} label="Create document rule" onNew={() => setModal("new")} /><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Document type</TableHead><TableHead>Required</TableHead><TableHead>After consecutive days</TableHead><TableHead>After used days</TableHead><TableHead>Notes</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{rules.map((row) => <TableRow key={String(row.id)}><TableCell>{String(row.document_type_name ?? "Generic supporting document")}</TableCell><TableCell>{boolText(Boolean(row.requires_document))}</TableCell><TableCell>{String(row.required_after_consecutive_days ?? "-")}</TableCell><TableCell>{String(row.required_after_used_days ?? "-")}</TableCell><TableCell className="max-w-[280px] truncate">{String(row.notes ?? "-")}</TableCell><TableCell><Badge tone={row.is_active ? "success" : "neutral"}>{row.is_active ? "Active" : "Inactive"}</Badge></TableCell><TableCell><div className="flex justify-end gap-1">{canManage ? <><Button variant="ghost" size="icon" onClick={() => setModal(row)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => void toggle(row)}><Power className="h-4 w-4" /></Button></> : <span className="text-xs text-muted-foreground">Read only</span>}</div></TableCell></TableRow>)}</TableBody></Table>{!rules.length ? <EmptyState title="No document rules" description="Create policy-specific document thresholds or use the policy defaults." /> : null}</div>{modal ? <DocumentRuleModal token={token} policyId={policyId} rule={modal === "new" ? undefined : modal} documentTypes={documentTypes} onClose={() => setModal(null)} onSaved={load} /> : null}</div>;
}

function PolicyDeductionRulesTable({ token, policies, canManage }: { token: string; policies: LeavePolicy[]; canManage: boolean }) {
  const [policyId, setPolicyId] = useState("");
  const [rules, setRules] = useState<Record<string, unknown>[]>([]);
  const [modal, setModal] = useState<Record<string, unknown> | "new" | null>(null);
  useEffect(() => { if (!policyId && policies[0]) setPolicyId(policies[0].id); }, [policies, policyId]);
  async function load() { if (policyId) setRules((await api.listLeavePolicyDeductionRules(token, policyId)).deduction_rules); }
  useEffect(() => { void load(); }, [policyId]);
  async function toggle(row: Record<string, unknown>) { await api.leavePolicyDeductionRuleAction(token, policyId, String(row.id), row.is_active ? "disable" : "enable"); await load(); }
  return <div><RulesToolbar policies={policies} policyId={policyId} setPolicyId={setPolicyId} canManage={canManage} label="Create deduction rule" onNew={() => setModal("new")} /><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Mode</TableHead><TableHead>Pay component</TableHead><TableHead>After days</TableHead><TableHead>Long leave threshold</TableHead><TableHead>Custom rule</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{rules.map((row) => <TableRow key={String(row.id)}><TableCell className="font-mono text-xs">{String(row.deduction_mode ?? "NONE")}</TableCell><TableCell>{String(row.deduction_pay_component ?? "-")}</TableCell><TableCell>{String(row.deduction_after_days ?? "-")}</TableCell><TableCell>{String(row.long_leave_threshold_days ?? "-")}</TableCell><TableCell className="max-w-[280px] truncate">{String(row.custom_rule_json ?? "-")}</TableCell><TableCell><Badge tone={row.is_active ? "success" : "neutral"}>{row.is_active ? "Active" : "Inactive"}</Badge></TableCell><TableCell><div className="flex justify-end gap-1">{canManage ? <><Button variant="ghost" size="icon" onClick={() => setModal(row)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => void toggle(row)}><Power className="h-4 w-4" /></Button></> : <span className="text-xs text-muted-foreground">Read only</span>}</div></TableCell></TableRow>)}</TableBody></Table>{!rules.length ? <EmptyState title="No deduction rules" description="Create payroll-impact rules for future payroll integration." /> : null}</div>{modal ? <DeductionRuleModal token={token} policyId={policyId} rule={modal === "new" ? undefined : modal} onClose={() => setModal(null)} onSaved={load} /> : null}</div>;
}

function SectionToolbar({ canManage, label, onNew, children }: { canManage: boolean; label: string; onNew: () => void; children: ReactNode }) {
  return <div><div className="flex justify-end border-b p-3">{canManage ? <Button size="sm" onClick={onNew}><Plus className="h-4 w-4" /> {label}</Button> : null}</div><div className="overflow-x-auto">{children}</div></div>;
}

function Actions({ canManage, onEdit, onAction, active }: { canManage: boolean; onEdit: () => void; onAction: () => void; active: boolean }) {
  if (!canManage) return <div className="text-right text-xs text-muted-foreground">Read only</div>;
  return <div className="flex justify-end gap-1"><Button variant="ghost" size="icon" onClick={onEdit}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={onAction}><Power className="h-4 w-4" /></Button></div>;
}

function RulesToolbar({ policies, policyId, setPolicyId, canManage, label, onNew }: { policies: LeavePolicy[]; policyId: string; setPolicyId: (value: string) => void; canManage: boolean; label: string; onNew: () => void }) {
  return <div className="flex flex-col gap-3 border-b p-3 md:flex-row md:items-end md:justify-between"><div className="w-full max-w-xl space-y-1.5"><Label>Policy</Label><select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={policyId} onChange={(event) => setPolicyId(event.target.value)}>{policies.map((policy) => <option key={policy.id} value={policy.id}>{policy.name} - {policy.leave_type_name ?? "Leave"}</option>)}</select></div>{canManage ? <Button size="sm" onClick={onNew} disabled={!policyId}><Plus className="h-4 w-4" /> {label}</Button> : null}</div>;
}

function TypeModal({ token, type, onClose, onSaved }: { token: string; type?: LeaveType; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ code: type?.code ?? "", name: type?.name ?? "", description: type?.description ?? "", is_paid_default: Boolean(type?.is_paid_default ?? true), is_statutory: Boolean(type?.is_statutory), sort_order: String(type?.sort_order ?? 100) });
  return <Modal title={type ? "Edit leave type" : "Create leave type"} onClose={onClose} onSave={async () => { const input = { ...form, sort_order: Number(form.sort_order) || 100 }; if (type) await api.updateLeaveType(token, type.id, input); else await api.createLeaveType(token, input); await onSaved(); onClose(); }}><Field label="Code" value={form.code} onChange={(value) => setForm({ ...form, code: value })} /><Field label="Name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} /><Field label="Description" value={form.description} onChange={(value) => setForm({ ...form, description: value })} /><Field label="Sort order" type="number" value={form.sort_order} onChange={(value) => setForm({ ...form, sort_order: value })} /><Check label="Paid default" checked={form.is_paid_default} onChange={(value) => setForm({ ...form, is_paid_default: value })} /><Check label="Statutory" checked={form.is_statutory} onChange={(value) => setForm({ ...form, is_statutory: value })} /></Modal>;
}

function PolicyModal({ token, policy, types, departments, positions, locations, onClose, onSaved }: { token: string; policy?: LeavePolicy; types: LeaveType[]; departments: OrganizationDepartment[]; positions: OrganizationPosition[]; locations: OrganizationLocation[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({
    leave_type_id: policy?.leave_type_id ?? types[0]?.id ?? "",
    name: policy?.name ?? "",
    applies_to_employee_type: policy?.applies_to_employee_type ?? "",
    applies_to_employment_type: policy?.applies_to_employment_type ?? "",
    department_id: policy?.department_id ?? "",
    position_id: policy?.position_id ?? "",
    location_id: policy?.location_id ?? "",
    annual_entitlement_days: String(policy?.annual_entitlement_days ?? ""),
    allow_half_day: Boolean(policy?.allow_half_day ?? true),
    allow_carry_forward: Boolean(policy?.allow_carry_forward),
    carry_forward_limit_days: String(policy?.carry_forward_limit_days ?? ""),
    carry_forward_expiry_month: String(policy?.carry_forward_expiry_month ?? ""),
    include_public_holidays: Boolean(policy?.include_public_holidays),
    include_weekly_off_days: Boolean(policy?.include_weekly_off_days),
    salary_deduction_mode: policy?.salary_deduction_mode ?? "NONE",
    deduction_pay_component: policy?.deduction_pay_component ?? "",
    requires_document: Boolean(policy?.requires_document),
    document_required_after_consecutive_days: String(policy?.document_required_after_consecutive_days ?? ""),
    document_required_after_used_days: String(policy?.document_required_after_used_days ?? ""),
    max_consecutive_days: String(policy?.max_consecutive_days ?? ""),
    min_notice_days: String(policy?.min_notice_days ?? ""),
    long_leave_threshold_days: String(policy?.long_leave_threshold_days ?? ""),
    priority: String(policy?.priority ?? 100)
  });
  async function save() {
    const input = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value === "" ? null : value]));
    if (policy) await api.updateLeavePolicy(token, policy.id, input);
    else await api.createLeavePolicy(token, input);
    await onSaved();
    onClose();
  }
  return <Modal title={policy ? "Edit leave policy" : "Create leave policy"} onClose={onClose} onSave={save}><Select label="Leave type" value={form.leave_type_id} onChange={(v) => setForm({ ...form, leave_type_id: v })} options={types.map((t) => ({ value: t.id, label: t.name }))} /><Field label="Policy name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} /><SimpleSelect label="Employee type" value={form.applies_to_employee_type} onChange={(v) => setForm({ ...form, applies_to_employee_type: v })} options={["", "LOCAL", "FOREIGN", "OTHER"]} /><SimpleSelect label="Employment type" value={form.applies_to_employment_type} onChange={(v) => setForm({ ...form, applies_to_employment_type: v })} options={["", "FULL_TIME", "PART_TIME", "INTERN", "TEMPORARY", "CONTRACT"]} /><Select label="Department" value={form.department_id} onChange={(v) => setForm({ ...form, department_id: v })} options={departments.map((d) => ({ value: d.id, label: d.name }))} /><Select label="Position" value={form.position_id} onChange={(v) => setForm({ ...form, position_id: v })} options={positions.map((p) => ({ value: p.id, label: p.title }))} /><Select label="Location" value={form.location_id} onChange={(v) => setForm({ ...form, location_id: v })} options={locations.map((l) => ({ value: l.id, label: l.name }))} /><Field label="Annual entitlement" type="number" value={form.annual_entitlement_days} onChange={(v) => setForm({ ...form, annual_entitlement_days: v })} /><SimpleSelect label="Deduction mode" value={form.salary_deduction_mode} onChange={(v) => setForm({ ...form, salary_deduction_mode: v as LeavePolicy["salary_deduction_mode"] })} options={["NONE", "FULL_DAY", "WORKED_DAYS_ONLY", "CUSTOM"]} /><Field label="Deduction pay component" value={form.deduction_pay_component} onChange={(v) => setForm({ ...form, deduction_pay_component: v })} /><Field label="Doc after consecutive days" type="number" value={form.document_required_after_consecutive_days} onChange={(v) => setForm({ ...form, document_required_after_consecutive_days: v })} /><Field label="Doc after used days" type="number" value={form.document_required_after_used_days} onChange={(v) => setForm({ ...form, document_required_after_used_days: v })} /><Field label="Max consecutive days" type="number" value={form.max_consecutive_days} onChange={(v) => setForm({ ...form, max_consecutive_days: v })} /><Field label="Min notice days" type="number" value={form.min_notice_days} onChange={(v) => setForm({ ...form, min_notice_days: v })} /><Field label="Long leave threshold" type="number" value={form.long_leave_threshold_days} onChange={(v) => setForm({ ...form, long_leave_threshold_days: v })} /><Field label="Priority" type="number" value={form.priority} onChange={(v) => setForm({ ...form, priority: v })} /><Check label="Allow half day" checked={form.allow_half_day} onChange={(v) => setForm({ ...form, allow_half_day: v })} /><Check label="Carry forward" checked={form.allow_carry_forward} onChange={(v) => setForm({ ...form, allow_carry_forward: v })} /><Check label="Include public holidays" checked={form.include_public_holidays} onChange={(v) => setForm({ ...form, include_public_holidays: v })} /><Check label="Include weekly off days" checked={form.include_weekly_off_days} onChange={(v) => setForm({ ...form, include_weekly_off_days: v })} /><Check label="Requires document" checked={form.requires_document} onChange={(v) => setForm({ ...form, requires_document: v })} /></Modal>;
}

function DocumentRuleModal({ token, policyId, rule, documentTypes, onClose, onSaved }: { token: string; policyId: string; rule?: Record<string, unknown>; documentTypes: DocumentType[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ document_type_id: String(rule?.document_type_id ?? ""), requires_document: Boolean(rule?.requires_document ?? true), required_after_consecutive_days: String(rule?.required_after_consecutive_days ?? ""), required_after_used_days: String(rule?.required_after_used_days ?? ""), notes: String(rule?.notes ?? "") });
  async function save() {
    const input = { document_type_id: form.document_type_id || null, requires_document: form.requires_document, required_after_consecutive_days: form.required_after_consecutive_days ? Number(form.required_after_consecutive_days) : null, required_after_used_days: form.required_after_used_days ? Number(form.required_after_used_days) : null, notes: form.notes || null };
    if (rule?.id) await api.updateLeavePolicyDocumentRule(token, policyId, String(rule.id), input);
    else await api.createLeavePolicyDocumentRule(token, policyId, input);
    await onSaved();
    onClose();
  }
  return <Modal title={rule ? "Edit document rule" : "Create document rule"} onClose={onClose} onSave={save}><Select label="Document type" value={form.document_type_id} onChange={(value) => setForm({ ...form, document_type_id: value })} options={documentTypes.map((type) => ({ value: type.id, label: type.name }))} /><Field label="After consecutive days" type="number" value={form.required_after_consecutive_days} onChange={(value) => setForm({ ...form, required_after_consecutive_days: value })} /><Field label="After used days" type="number" value={form.required_after_used_days} onChange={(value) => setForm({ ...form, required_after_used_days: value })} /><Field label="Notes" value={form.notes} onChange={(value) => setForm({ ...form, notes: value })} /><Check label="Requires document" checked={form.requires_document} onChange={(value) => setForm({ ...form, requires_document: value })} /></Modal>;
}

function DeductionRuleModal({ token, policyId, rule, onClose, onSaved }: { token: string; policyId: string; rule?: Record<string, unknown>; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ deduction_mode: String(rule?.deduction_mode ?? "NONE"), deduction_pay_component: String(rule?.deduction_pay_component ?? ""), deduction_after_days: String(rule?.deduction_after_days ?? ""), long_leave_threshold_days: String(rule?.long_leave_threshold_days ?? ""), custom_rule_json: String(rule?.custom_rule_json ?? "") });
  async function save() {
    const input = { deduction_mode: form.deduction_mode, deduction_pay_component: form.deduction_pay_component || null, deduction_after_days: form.deduction_after_days ? Number(form.deduction_after_days) : null, long_leave_threshold_days: form.long_leave_threshold_days ? Number(form.long_leave_threshold_days) : null, custom_rule_json: form.custom_rule_json || null };
    if (rule?.id) await api.updateLeavePolicyDeductionRule(token, policyId, String(rule.id), input);
    else await api.createLeavePolicyDeductionRule(token, policyId, input);
    await onSaved();
    onClose();
  }
  return <Modal title={rule ? "Edit deduction rule" : "Create deduction rule"} onClose={onClose} onSave={save}><SimpleSelect label="Deduction mode" value={form.deduction_mode} onChange={(value) => setForm({ ...form, deduction_mode: value })} options={["NONE", "FULL_DAY", "WORKED_DAYS_ONLY", "CUSTOM"]} /><Field label="Pay component" value={form.deduction_pay_component} onChange={(value) => setForm({ ...form, deduction_pay_component: value })} /><Field label="Deduct after days" type="number" value={form.deduction_after_days} onChange={(value) => setForm({ ...form, deduction_after_days: value })} /><Field label="Long leave threshold" type="number" value={form.long_leave_threshold_days} onChange={(value) => setForm({ ...form, long_leave_threshold_days: value })} /><Field label="Custom rule JSON" value={form.custom_rule_json} onChange={(value) => setForm({ ...form, custom_rule_json: value })} /></Modal>;
}

function WorkflowModal({ token, workflow, types, departments, locations, onClose, onSaved }: { token: string; workflow?: LeaveWorkflow; types: LeaveType[]; departments: OrganizationDepartment[]; locations: OrganizationLocation[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ name: workflow?.name ?? "", description: workflow?.description ?? "", applies_to_leave_type_id: workflow?.applies_to_leave_type_id ?? "", applies_to_employee_type: workflow?.applies_to_employee_type ?? "", applies_to_employment_type: workflow?.applies_to_employment_type ?? "", department_id: workflow?.department_id ?? "", location_id: workflow?.location_id ?? "", is_default: Boolean(workflow?.is_default), priority: String(workflow?.priority ?? 100) });
  return <Modal title={workflow ? "Edit workflow" : "Create workflow"} onClose={onClose} onSave={async () => { const input = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === "" ? null : v])); if (workflow) await api.updateLeaveWorkflow(token, workflow.id, input); else await api.createLeaveWorkflow(token, input); await onSaved(); onClose(); }}><Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} /><Field label="Description" value={form.description} onChange={(v) => setForm({ ...form, description: v })} /><Select label="Leave type" value={form.applies_to_leave_type_id} onChange={(v) => setForm({ ...form, applies_to_leave_type_id: v })} options={types.map((t) => ({ value: t.id, label: t.name }))} /><SimpleSelect label="Employee type" value={form.applies_to_employee_type} onChange={(v) => setForm({ ...form, applies_to_employee_type: v })} options={["", "LOCAL", "FOREIGN", "OTHER"]} /><SimpleSelect label="Employment type" value={form.applies_to_employment_type} onChange={(v) => setForm({ ...form, applies_to_employment_type: v })} options={["", "FULL_TIME", "PART_TIME", "INTERN", "TEMPORARY", "CONTRACT"]} /><Select label="Department" value={form.department_id} onChange={(v) => setForm({ ...form, department_id: v })} options={departments.map((d) => ({ value: d.id, label: d.name }))} /><Select label="Location" value={form.location_id} onChange={(v) => setForm({ ...form, location_id: v })} options={locations.map((l) => ({ value: l.id, label: l.name }))} /><Field label="Priority" type="number" value={form.priority} onChange={(v) => setForm({ ...form, priority: v })} /><Check label="Default workflow" checked={form.is_default} onChange={(v) => setForm({ ...form, is_default: v })} /></Modal>;
}

function StepsModal({ token, workflow, roles, users, onClose }: { token: string; workflow: LeaveWorkflow; roles: Role[]; users: AccessUser[]; onClose: () => void }) {
  const [steps, setSteps] = useState<LeaveWorkflowStep[]>([]);
  const [form, setForm] = useState({ step_order: "1", step_name: "", approver_type: "PERMISSION", role_id: "", user_id: "", permission_key: "leave.approve", is_required: true, skip_if_no_approver: true, allow_self_approval: false });
  async function load() { setSteps((await api.listLeaveWorkflowSteps(token, workflow.id)).steps); }
  useEffect(() => { void load(); }, [workflow.id]);
  async function add() { await api.createLeaveWorkflowStep(token, workflow.id, { ...form, approver_type: form.approver_type as LeaveWorkflowStepForm["approver_type"], step_order: Number(form.step_order) }); setForm({ ...form, step_name: "", step_order: String(Number(form.step_order) + 1) }); await load(); }
  async function remove(step: LeaveWorkflowStep) { await api.deleteLeaveWorkflowStep(token, workflow.id, step.id); await load(); }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4"><div className="w-full max-w-5xl rounded-lg border bg-white shadow-xl"><div className="flex items-center justify-between border-b px-4 py-3"><h2 className="text-sm font-semibold">Workflow steps · {workflow.name}</h2><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></div><div className="grid gap-3 border-b p-4 md:grid-cols-4"><Field label="Order" type="number" value={form.step_order} onChange={(v) => setForm({ ...form, step_order: v })} /><Field label="Step name" value={form.step_name} onChange={(v) => setForm({ ...form, step_name: v })} /><SimpleSelect label="Approver type" value={form.approver_type} onChange={(v) => setForm({ ...form, approver_type: v })} options={["ROLE","USER","REPORTING_MANAGER","DEPARTMENT_MANAGER","DEPARTMENT_SENIOR","DIRECTOR","HR_ROLE","PERMISSION"]} /><Select label="Role" value={form.role_id} onChange={(v) => setForm({ ...form, role_id: v })} options={roles.map((r) => ({ value: r.id, label: r.name }))} /><Select label="User" value={form.user_id} onChange={(v) => setForm({ ...form, user_id: v })} options={users.map((u) => ({ value: u.id, label: u.name }))} /><Field label="Permission key" value={form.permission_key} onChange={(v) => setForm({ ...form, permission_key: v })} /><Check label="Required" checked={form.is_required} onChange={(v) => setForm({ ...form, is_required: v })} /><Check label="Skip if no approver" checked={form.skip_if_no_approver} onChange={(v) => setForm({ ...form, skip_if_no_approver: v })} /><Check label="Allow self approval" checked={form.allow_self_approval} onChange={(v) => setForm({ ...form, allow_self_approval: v })} /><Button size="sm" onClick={() => void add()}><Plus className="h-4 w-4" /> Add step</Button></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Name</TableHead><TableHead>Approver type</TableHead><TableHead>Role/User/Permission</TableHead><TableHead>Required</TableHead><TableHead>Skip</TableHead><TableHead>Self approval</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{steps.map((step) => <TableRow key={step.id}><TableCell>{step.step_order}</TableCell><TableCell>{step.step_name}</TableCell><TableCell>{step.approver_type}</TableCell><TableCell>{step.role_name ?? step.user_name ?? step.permission_key ?? "-"}</TableCell><TableCell>{boolText(step.is_required)}</TableCell><TableCell>{boolText(step.skip_if_no_approver)}</TableCell><TableCell>{boolText(step.allow_self_approval)}</TableCell><TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => void remove(step)}><Trash2 className="h-4 w-4" /></Button></TableCell></TableRow>)}</TableBody></Table></div></div></div>;
}

function EditableStepsModal({ token, workflow, roles, users, onClose }: { token: string; workflow: LeaveWorkflow; roles: Role[]; users: AccessUser[]; onClose: () => void }) {
  const blankForm = { step_order: "1", step_name: "", approver_type: "PERMISSION", role_id: "", user_id: "", permission_key: "leave.approve", is_required: true, skip_if_no_approver: true, allow_self_approval: false };
  const [steps, setSteps] = useState<LeaveWorkflowStep[]>([]);
  const [form, setForm] = useState(blankForm);
  const [editing, setEditing] = useState<LeaveWorkflowStep | null>(null);
  async function load() { setSteps((await api.listLeaveWorkflowSteps(token, workflow.id)).steps); }
  useEffect(() => { void load(); }, [workflow.id]);
  function reset(nextOrder = form.step_order) { setEditing(null); setForm({ ...blankForm, step_order: nextOrder }); }
  function edit(step: LeaveWorkflowStep) {
    setEditing(step);
    setForm({ step_order: String(step.step_order), step_name: step.step_name, approver_type: step.approver_type, role_id: step.role_id ?? "", user_id: step.user_id ?? "", permission_key: step.permission_key ?? "", is_required: Boolean(step.is_required), skip_if_no_approver: Boolean(step.skip_if_no_approver), allow_self_approval: Boolean(step.allow_self_approval) });
  }
  async function save() {
    const input = { ...form, approver_type: form.approver_type as LeaveWorkflowStepForm["approver_type"], step_order: Number(form.step_order) };
    if (editing) await api.updateLeaveWorkflowStep(token, workflow.id, editing.id, input);
    else await api.createLeaveWorkflowStep(token, workflow.id, input);
    reset(String(Number(form.step_order) + 1));
    await load();
  }
  async function remove(step: LeaveWorkflowStep) { await api.deleteLeaveWorkflowStep(token, workflow.id, step.id); await load(); }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4"><div className="w-full max-w-5xl rounded-lg border bg-white shadow-xl"><div className="flex items-center justify-between border-b px-4 py-3"><div><h2 className="text-sm font-semibold">Workflow steps - {workflow.name}</h2><p className="text-xs text-muted-foreground">Department manager, senior, and director steps follow the configured skip/block rule until hierarchy resolution is complete.</p></div><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></div><div className="grid gap-3 border-b p-4 md:grid-cols-4"><Field label="Order" type="number" value={form.step_order} onChange={(v) => setForm({ ...form, step_order: v })} /><Field label="Step name" value={form.step_name} onChange={(v) => setForm({ ...form, step_name: v })} /><SimpleSelect label="Approver type" value={form.approver_type} onChange={(v) => setForm({ ...form, approver_type: v })} options={["ROLE","USER","REPORTING_MANAGER","DEPARTMENT_MANAGER","DEPARTMENT_SENIOR","DIRECTOR","HR_ROLE","PERMISSION"]} /><Select label="Role" value={form.role_id} onChange={(v) => setForm({ ...form, role_id: v })} options={roles.map((r) => ({ value: r.id, label: r.name }))} /><Select label="User" value={form.user_id} onChange={(v) => setForm({ ...form, user_id: v })} options={users.map((u) => ({ value: u.id, label: u.name }))} /><Field label="Permission key" value={form.permission_key} onChange={(v) => setForm({ ...form, permission_key: v })} /><Check label="Required" checked={form.is_required} onChange={(v) => setForm({ ...form, is_required: v })} /><Check label="Skip if no approver" checked={form.skip_if_no_approver} onChange={(v) => setForm({ ...form, skip_if_no_approver: v })} /><Check label="Allow self approval" checked={form.allow_self_approval} onChange={(v) => setForm({ ...form, allow_self_approval: v })} /><div className="flex items-end gap-2"><Button size="sm" onClick={() => void save()}><Plus className="h-4 w-4" /> {editing ? "Save step" : "Add step"}</Button>{editing ? <Button variant="outline" size="sm" onClick={() => reset()}>Cancel edit</Button> : null}</div></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Order</TableHead><TableHead>Name</TableHead><TableHead>Approver type</TableHead><TableHead>Role/User/Permission</TableHead><TableHead>Required</TableHead><TableHead>Skip</TableHead><TableHead>Self approval</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{steps.map((step) => <TableRow key={step.id}><TableCell>{step.step_order}</TableCell><TableCell>{step.step_name}</TableCell><TableCell>{step.approver_type}</TableCell><TableCell>{step.role_name ?? step.user_name ?? step.permission_key ?? "-"}</TableCell><TableCell>{boolText(step.is_required)}</TableCell><TableCell>{boolText(step.skip_if_no_approver)}</TableCell><TableCell>{boolText(step.allow_self_approval)}</TableCell><TableCell className="text-right"><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => edit(step)}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => void remove(step)}><Trash2 className="h-4 w-4" /></Button></div></TableCell></TableRow>)}</TableBody></Table></div></div></div>;
}

function Modal({ title, children, onClose, onSave }: { title: string; children: ReactNode; onClose: () => void; onSave: () => Promise<void> | void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4"><div className="w-full max-w-4xl rounded-lg border bg-white shadow-xl"><div className="flex items-center justify-between border-b px-4 py-3"><h2 className="text-sm font-semibold">{title}</h2><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></div><div className="grid max-h-[70vh] gap-3 overflow-y-auto p-4 md:grid-cols-3">{children}</div><div className="flex justify-end gap-2 border-t px-4 py-3"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={() => void onSave()}>Save</Button></div></div></div>;
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <div className="space-y-1.5"><Label>{label}</Label><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) {
  return <div className="space-y-1.5"><Label>{label}</Label><select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}><option value="">Any</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>;
}

function SimpleSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return <div className="space-y-1.5"><Label>{label}</Label><select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option || "any"} value={option}>{option || "Any"}</option>)}</select></div>;
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /> {label}</label>;
}
