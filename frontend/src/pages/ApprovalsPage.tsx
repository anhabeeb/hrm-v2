import { Bell, CheckCircle2, Clock, Eye, FileText, GitBranch, RefreshCw, Send, Settings, ShieldCheck, UserCheck, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ExportMenu } from "../components/export/ExportMenu";
import { ModuleSettingsBody } from "../components/settings/ModuleToggleHeader";
import { ActionTextButton } from "../components/ui/action-button";
import { Badge } from "../components/ui/badge";
import { Button, RowActionButton } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  ActiveFilterChips,
  FilterResetButton,
  FilterSection,
  MoreFiltersSheet,
  StandardFilterBar,
  StandardSearchInput,
  StandardSelectFilter
} from "../components/filters";
import { SubNavigationBar, SubNavigationItem } from "../components/ui/navigation-tabs";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { AdminHelpLink } from "../features/admin-help/AdminHelpLink";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import { CheckboxField, PageHeader, PageShell, SelectField } from "../components/ui/page-shell";
import type {
  ApprovalAction,
  ApprovalDelegationRule,
  ApprovalInstance,
  ApprovalInstanceStep,
  ApprovalNotificationTemplate,
  ApprovalPreview,
  ApprovalStepAssignee,
  ApprovalWorkflow,
  ApprovalWorkflowCondition,
  ApprovalWorkflowSettings,
  ApprovalWorkflowStep
} from "../types/approvals";

type Mode = "inbox" | "submitted" | "overdue" | "escalated" | "delegated" | "history" | "workflows" | "settings" | "delegations" | "templates" | "reports" | "self-service";

const tabs: Array<{ mode: Mode; label: string; to: string }> = [
  { mode: "inbox", label: "My Pending", to: "/approvals" },
  { mode: "submitted", label: "Submitted", to: "/approvals/submitted" },
  { mode: "overdue", label: "Overdue", to: "/approvals/overdue" },
  { mode: "escalated", label: "Escalated", to: "/approvals/escalated" },
  { mode: "delegated", label: "Delegated", to: "/approvals/delegated" },
  { mode: "history", label: "History", to: "/approvals/history" },
  { mode: "workflows", label: "Workflows", to: "/approvals/workflows" },
  { mode: "delegations", label: "Delegations", to: "/approvals/delegations" },
  { mode: "templates", label: "Templates", to: "/approvals/templates" },
  { mode: "reports", label: "Reports", to: "/approvals/reports" }
];

const statusTone = (status?: string) => {
  if (!status) return "neutral";
  if (["APPROVED", "COMPLETED", "ACTIVE"].includes(status)) return "success";
  if (["PENDING", "PARTIALLY_APPROVED", "WAITING", "ESCALATED", "DELEGATED", "SENT_BACK", "DRAFT"].includes(status)) return "warning";
  if (["REJECTED", "CANCELLED", "EXPIRED", "ARCHIVED"].includes(status)) return "danger";
  return "neutral";
};

function can(userPermissions: Set<string>, keys: string[]) {
  return keys.some((key) => userPermissions.has(key));
}

export function ApprovalsPage({ mode = "inbox" }: { mode?: Mode }) {
  const { token, user } = useAuth();
  const permissions = useMemo(() => new Set(user?.permissions ?? []), [user?.permissions]);
  const canView = can(permissions, ["approvals.view", "approvals.inbox.view", "approvals.instances.view", "approvals.workflows.view", "approvals.settings.view", "approvals.manage"]);
  const canManage = can(permissions, ["approvals.manage", "approvals.workflows.manage", "approvals.settings.manage"]);
  const [approvals, setApprovals] = useState<ApprovalInstance[]>([]);
  const [workflows, setWorkflows] = useState<ApprovalWorkflow[]>([]);
  const [settings, setSettings] = useState<ApprovalWorkflowSettings | null>(null);
  const [delegations, setDelegations] = useState<ApprovalDelegationRule[]>([]);
  const [templates, setTemplates] = useState<ApprovalNotificationTemplate[]>([]);
  const [reportRows, setReportRows] = useState<Record<string, unknown>[]>([]);
  const [selected, setSelected] = useState<null | { instance: ApprovalInstance; steps: ApprovalInstanceStep[]; assignees: ApprovalStepAssignee[]; timeline: ApprovalAction[] }>(null);
  const [workflowDetail, setWorkflowDetail] = useState<null | { workflow: ApprovalWorkflow; conditions: ApprovalWorkflowCondition[]; steps: ApprovalWorkflowStep[] }>(null);
  const [preview, setPreview] = useState<ApprovalPreview | null>(null);
  const [reasonAction, setReasonAction] = useState<null | { title: string; action: "approve" | "reject" | "send-back" | "cancel"; instance: ApprovalInstance; reason: string; required?: boolean }>(null);
  const [workflowForm, setWorkflowForm] = useState({ workflow_code: "", workflow_name: "", module_key: "generic", action_key: "approval", applies_to_entity_type: "generic", priority_number: "100", status: "DRAFT" });
  const [stepForm, setStepForm] = useState({ step_number: "1", step_name: "", step_mode: "SEQUENTIAL", approval_mode: "ANY_ONE", approver_type: "ROLE", approver_role_id: "", approver_permission_key: "", approver_user_id: "", skip_if_no_approver: false });
  const [conditionForm, setConditionForm] = useState({ field_key: "module_key", operator: "EQUALS", value: "" });
  const [delegationForm, setDelegationForm] = useState({ delegate_user_id: "", start_at: "", end_at: "", reason: "", module_key: "", action_key: "" });
  const [templateEdit, setTemplateEdit] = useState<ApprovalNotificationTemplate | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    setError(null);
    try {
      if (mode === "workflows") setWorkflows((await api.listApprovalWorkflows(token, { search, status })).workflows);
      else if (mode === "settings") setSettings((await api.getApprovalSettings(token)).settings);
      else if (mode === "delegations") setDelegations((await api.listApprovalDelegations(token)).delegations);
      else if (mode === "templates") setTemplates((await api.listApprovalNotificationTemplates(token)).templates);
      else if (mode === "reports") setReportRows((await api.getReport(token, "approvals/pending")).report.rows);
      else if (mode === "self-service") setApprovals((await api.getSelfServiceApprovals(token)).approvals);
      else {
        const apiMode = mode === "delegated" ? "delegated-to-me" : mode;
        setApprovals((await api.listApprovalInbox(token, apiMode as Parameters<typeof api.listApprovalInbox>[1], { search, status })).approvals);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load approvals.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, canView, mode, search, status]);

  function resetFilters() {
    setSearch("");
    setStatus("");
  }

  const activeChips = [
    search.trim() ? { key: "search", label: "Search", value: search.trim(), onRemove: () => setSearch("") } : null,
    status ? { key: "status", label: "Approval Status", value: status, onRemove: () => setStatus("") } : null
  ].filter(Boolean) as Array<{ key: string; label: string; value: string; onRemove: () => void }>;
  const exportRows = useMemo(() => {
    if (mode === "workflows") return workflows as unknown as Record<string, unknown>[];
    if (mode === "delegations") return delegations as unknown as Record<string, unknown>[];
    if (mode === "templates") return templates as unknown as Record<string, unknown>[];
    if (mode === "reports") return reportRows;
    return approvals as unknown as Record<string, unknown>[];
  }, [approvals, delegations, mode, reportRows, templates, workflows]);
  const exportColumns = useMemo(() => {
    if (mode === "workflows") return ["workflow_code", "workflow_name", "module_key", "action_key", "status", "priority_number"];
    if (mode === "delegations") return ["delegator_name", "delegate_user_name", "module_key", "action_key", "start_at", "end_at", "status"];
    if (mode === "templates") return ["template_key", "template_name", "channel", "status", "module_key", "action_key"];
    if (mode === "reports") return Object.keys(reportRows[0] ?? { report: "", value: "" });
    return ["request_title", "module_key", "action_key", "entity_type", "entity_id", "status", "current_step_number", "submitted_at", "fallback_used"];
  }, [mode, reportRows]);

  async function openInstance(instance: ApprovalInstance) {
    if (!token) return;
    setSelected(await api.getApprovalInstance(token, instance.id));
  }

  async function openWorkflow(workflow: ApprovalWorkflow) {
    if (!token) return;
    setWorkflowDetail(await api.getApprovalWorkflow(token, workflow.id));
    setPreview(null);
  }

  async function submitDecision() {
    if (!token || !reasonAction) return;
    try {
      await api.approvalInstanceAction(token, reasonAction.instance.id, reasonAction.action, { reason: reasonAction.reason, note: reasonAction.reason });
      setReasonAction(null);
      setSelected(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to submit approval decision.");
    }
  }

  async function saveWorkflow() {
    if (!token) return;
    try {
      await api.createApprovalWorkflow(token, { ...workflowForm, priority_number: Number(workflowForm.priority_number) } as Partial<ApprovalWorkflow>);
      setWorkflowForm({ workflow_code: "", workflow_name: "", module_key: "generic", action_key: "approval", applies_to_entity_type: "generic", priority_number: "100", status: "DRAFT" });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save workflow.");
    }
  }

  async function saveStep() {
    if (!token || !workflowDetail) return;
    try {
      await api.createApprovalWorkflowStep(token, workflowDetail.workflow.id, { ...stepForm, step_number: Number(stepForm.step_number), skip_if_no_approver: stepForm.skip_if_no_approver });
      await openWorkflow(workflowDetail.workflow);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save workflow step.");
    }
  }

  async function saveCondition() {
    if (!token || !workflowDetail) return;
    try {
      await api.createApprovalWorkflowCondition(token, workflowDetail.workflow.id, { ...conditionForm, value: conditionForm.value });
      await openWorkflow(workflowDetail.workflow);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save workflow condition.");
    }
  }

  async function runPreview() {
    if (!token || !workflowDetail) return;
    setPreview((await api.previewApprovalWorkflow(token, { module_key: workflowDetail.workflow.module_key, action_key: workflowDetail.workflow.action_key })).preview);
  }

  async function saveDelegation() {
    if (!token) return;
    try {
      await api.createApprovalDelegation(token, delegationForm);
      setDelegationForm({ delegate_user_id: "", start_at: "", end_at: "", reason: "", module_key: "", action_key: "" });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save delegation.");
    }
  }

  if (!canView) return <PageShell><Panel><EmptyState title="Approvals unavailable" description="Your account needs approval workflow permissions." /></Panel></PageShell>;

  return (
    <PageShell>
      <PageHeader
        title="Central Approval Workflows"
        description="Configurable chains, delegation, escalation, notifications, timelines, and module fallback adapters."
        actions={
          <>
          <AdminHelpLink target="approvals" label="View Approval Guide" />
          <ExportMenu
            moduleName={`Approvals ${mode}`}
            rows={exportRows}
            columns={exportColumns}
            filterSummary={activeChips.map((chip) => `${chip.label}: ${chip.value}`)}
            disabled={mode === "settings"}
          />
          {can(permissions, ["approvals.escalations.manage", "approvals.manage"]) ? <ActionTextButton intent="refresh" size="sm" onClick={async () => { if (token) { await api.refreshApprovalReminders(token); await api.refreshApprovalEscalations(token); await load(); } }}><RefreshCw className="h-4 w-4" /> Refresh reminders</ActionTextButton> : null}
          <Link to="/reports"><ActionTextButton intent="view" size="sm"><FileText className="h-4 w-4" /> Report Center</ActionTextButton></Link>
          </>
        }
      />

      <SubNavigationBar label="Approval section tabs">
        {tabs.map((tab) => <SubNavigationItem key={tab.mode} to={tab.to} active={mode === tab.mode}>{tab.label}</SubNavigationItem>)}
      </SubNavigationBar>

      {!["settings", "templates", "delegations", "reports"].includes(mode) ? (
        <>
          <StandardFilterBar
            search={<StandardSearchInput value={search} onDebouncedChange={setSearch} placeholder="Search requests..." />}
            reset={<FilterResetButton onReset={resetFilters} />}
            moreFilters={
              <MoreFiltersSheet onReset={resetFilters}>
                <FilterSection title="Approval">
                  <StandardSelectFilter value={status} onValueChange={setStatus} allLabel="All statuses" width="status" options={["DRAFT", "ACTIVE", "PENDING", "PARTIALLY_APPROVED", "APPROVED", "REJECTED", "SENT_BACK", "CANCELLED", "ARCHIVED"].map((item) => ({ value: item, label: item }))} />
                </FilterSection>
              </MoreFiltersSheet>
            }
          >
            <StandardSelectFilter value={status} onValueChange={setStatus} allLabel="All statuses" width="status" options={["DRAFT", "ACTIVE", "PENDING", "PARTIALLY_APPROVED", "APPROVED", "REJECTED", "SENT_BACK", "CANCELLED", "ARCHIVED"].map((item) => ({ value: item, label: item }))} />
          </StandardFilterBar>
          <ActiveFilterChips chips={activeChips} />
        </>
      ) : null}

      <Panel className="overflow-hidden">
        {error ? <div className="m-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
        {["inbox", "submitted", "overdue", "escalated", "delegated", "history", "self-service"].includes(mode) ? <ApprovalTable rows={approvals} loading={loading} onOpen={openInstance} /> : null}
        {mode === "workflows" ? <WorkflowBuilder rows={workflows} loading={loading} form={workflowForm} setForm={setWorkflowForm} onSave={saveWorkflow} onOpen={openWorkflow} canManage={canManage} /> : null}
        {mode === "settings" && settings ? <SettingsPanel settings={settings} token={token!} canManage={canManage} onSaved={load} onError={setError} /> : null}
        {mode === "delegations" ? <Delegations rows={delegations} loading={loading} form={delegationForm} setForm={setDelegationForm} onSave={saveDelegation} /> : null}
        {mode === "templates" ? <Templates rows={templates} loading={loading} onEdit={setTemplateEdit} /> : null}
        {mode === "reports" ? <ReportTable rows={reportRows} loading={loading} /> : null}
      </Panel>

      {selected ? <ApprovalDetail detail={selected} permissions={permissions} onClose={() => setSelected(null)} onDecision={(action, required) => setReasonAction({ title: `${action.replace("-", " ")} approval`, action, instance: selected.instance, reason: "", required })} /> : null}
      {workflowDetail ? <WorkflowDetail detail={workflowDetail} stepForm={stepForm} setStepForm={setStepForm} conditionForm={conditionForm} setConditionForm={setConditionForm} onClose={() => setWorkflowDetail(null)} onSaveStep={saveStep} onSaveCondition={saveCondition} onPreview={runPreview} preview={preview} canManage={canManage} /> : null}
      {reasonAction ? <ReasonDialog action={reasonAction} setAction={setReasonAction} onSubmit={submitDecision} /> : null}
      {templateEdit && token ? <TemplateDialog token={token} template={templateEdit} onClose={() => setTemplateEdit(null)} onSaved={load} /> : null}
    </PageShell>
  );
}

function ApprovalTable({ rows, loading, onOpen }: { rows: ApprovalInstance[]; loading: boolean; onOpen: (row: ApprovalInstance) => void }) {
  return <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Request</TableHead><TableHead>Module</TableHead><TableHead>Entity</TableHead><TableHead>Status</TableHead><TableHead>Current step</TableHead><TableHead>Submitted</TableHead><TableHead>Fallback</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell className="font-medium">{row.request_title}<div className="font-mono text-xs text-muted-foreground">{row.workflow_name_snapshot ?? "Module fallback available"}</div></TableCell><TableCell>{row.module_key}<div className="text-xs text-muted-foreground">{row.action_key}</div></TableCell><TableCell>{row.entity_type}<div className="font-mono text-xs text-muted-foreground">{row.entity_id}</div></TableCell><TableCell><Badge tone={statusTone(row.status)}>{row.status}</Badge></TableCell><TableCell>{row.current_step_number ?? "-"}</TableCell><TableCell>{row.submitted_at}</TableCell><TableCell>{row.fallback_used ? "Yes" : "No"}</TableCell><TableCell className="text-right"><RowActionButton intent="view" size="sm" title="View" onClick={() => void onOpen(row)}><Eye className="h-4 w-4" /> View</RowActionButton></TableCell></TableRow>)}</TableBody></Table>{loading ? <EmptyState title="Loading approvals" description="Fetching approval records." /> : rows.length === 0 ? <EmptyState title="No approvals" description="Approval requests will appear here." /> : null}</div>;
}

function WorkflowBuilder({ rows, loading, form, setForm, onSave, onOpen, canManage }: { rows: ApprovalWorkflow[]; loading: boolean; form: Record<string, string>; setForm: (form: any) => void; onSave: () => void; onOpen: (row: ApprovalWorkflow) => void; canManage: boolean }) {
  return <div className="space-y-3 p-3">{canManage ? <div className="grid gap-2 rounded-md border p-3 md:grid-cols-7"><Field label="Code" value={form.workflow_code} onChange={(value) => setForm({ ...form, workflow_code: value })} /><Field label="Name" value={form.workflow_name} onChange={(value) => setForm({ ...form, workflow_name: value })} /><Field label="Module" value={form.module_key} onChange={(value) => setForm({ ...form, module_key: value })} /><Field label="Action" value={form.action_key} onChange={(value) => setForm({ ...form, action_key: value })} /><Field label="Entity" value={form.applies_to_entity_type} onChange={(value) => setForm({ ...form, applies_to_entity_type: value })} /><Field label="Priority" value={form.priority_number} onChange={(value) => setForm({ ...form, priority_number: value })} /><div className="flex items-end"><Button size="sm" onClick={() => void onSave()}><GitBranch className="h-4 w-4" /> Create</Button></div></div> : null}<div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Workflow</TableHead><TableHead>Module</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead><TableHead>Enabled</TableHead><TableHead>Fallback</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell className="font-medium">{row.workflow_name}<div className="font-mono text-xs text-muted-foreground">{row.workflow_code}</div></TableCell><TableCell>{row.module_key}<div className="text-xs text-muted-foreground">{row.action_key}</div></TableCell><TableCell>{row.priority_number}</TableCell><TableCell><Badge tone={statusTone(row.status)}>{row.status}</Badge></TableCell><TableCell>{row.is_enabled ? "Yes" : "No"}</TableCell><TableCell>{row.fallback_behavior}</TableCell><TableCell className="text-right"><RowActionButton intent="edit" size="sm" title="Configure" onClick={() => void onOpen(row)}>Configure</RowActionButton></TableCell></TableRow>)}</TableBody></Table>{loading ? <EmptyState title="Loading workflows" description="Fetching approval workflows." /> : rows.length === 0 ? <EmptyState title="No workflows" description="Create a workflow to route future central approvals." /> : null}</div></div>;
}

function SettingsPanel({ settings, token, canManage, onSaved, onError }: { settings: ApprovalWorkflowSettings; token: string; canManage: boolean; onSaved: () => Promise<void>; onError: (message: string | null) => void }) {
  const [form, setForm] = useState(settings);
  const update = (key: keyof ApprovalWorkflowSettings, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  async function save(next = form) {
    try {
      await api.updateApprovalSettings(token, next);
      await onSaved();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Unable to save approval settings.");
    }
  }
  const enabled = Boolean(form.approval_workflows_enabled);
  return (
    <div className="space-y-3 p-3">
      <ModuleSettingsBody disabled={!enabled}>
        <div className="grid gap-3 md:grid-cols-3">
          <Toggle disabled={!canManage || !enabled} label="Use central workflows" checked={form.use_central_workflow_for_supported_modules} onChange={(value) => update("use_central_workflow_for_supported_modules", value)} />
          <Toggle disabled={!canManage || !enabled} label="Fallback to module approval" checked={form.fallback_to_module_approval_if_no_workflow} onChange={(value) => update("fallback_to_module_approval_if_no_workflow", value)} />
          <Toggle disabled={!canManage || !enabled} label="Block self approval by default" checked={form.block_self_approval_by_default} onChange={(value) => update("block_self_approval_by_default", value)} />
          <Toggle disabled={!canManage || !enabled} label="Delegation enabled" checked={form.allow_delegation} onChange={(value) => update("allow_delegation", value)} />
          <Toggle disabled={!canManage || !enabled} label="Escalation enabled" checked={form.escalation_enabled} onChange={(value) => update("escalation_enabled", value)} />
          <Toggle disabled={!canManage || !enabled} label="Reminders enabled" checked={form.reminders_enabled} onChange={(value) => update("reminders_enabled", value)} />
          <Toggle disabled={!canManage || !enabled} label="Parallel approvals" checked={form.allow_parallel_approvals} onChange={(value) => update("allow_parallel_approvals", value)} />
          <Toggle disabled={!canManage || !enabled} label="Any-one approval mode" checked={form.allow_any_one_approval_mode} onChange={(value) => update("allow_any_one_approval_mode", value)} />
          <div><Label>Escalation basis</Label><SelectField disabled={!canManage || !enabled} className="mt-1 h-9 w-full rounded-md border bg-white px-3 text-sm" value={form.default_escalation_time_basis} onChange={(event) => update("default_escalation_time_basis", event.target.value)}><option value="CALENDAR_DAYS">Calendar days</option><option value="WORKING_DAYS">Working days</option></SelectField></div>
          <div><Label>Employee visibility</Label><SelectField disabled={!canManage || !enabled} className="mt-1 h-9 w-full rounded-md border bg-white px-3 text-sm" value={form.default_employee_visibility_mode} onChange={(event) => update("default_employee_visibility_mode", event.target.value)}><option value="STEP_NAMES_ONLY">Step names only</option><option value="STEP_NAMES_AND_APPROVER_ROLES">Step names and roles</option><option value="FULL_APPROVER_NAMES">Full approver names</option></SelectField></div>
          <div className="flex items-end"><Button size="sm" disabled={!canManage || !enabled} onClick={() => void save()}><Settings className="h-4 w-4" /> Save settings</Button></div>
        </div>
      </ModuleSettingsBody>
    </div>
  );
}

function Delegations({ rows, loading, form, setForm, onSave }: { rows: ApprovalDelegationRule[]; loading: boolean; form: Record<string, string>; setForm: (form: any) => void; onSave: () => void }) {
  return <div className="space-y-3 p-3"><div className="grid gap-2 rounded-md border p-3 md:grid-cols-6"><Field label="Delegate user ID" value={form.delegate_user_id} onChange={(value) => setForm({ ...form, delegate_user_id: value })} /><Field label="Start" value={form.start_at} onChange={(value) => setForm({ ...form, start_at: value })} /><Field label="End" value={form.end_at} onChange={(value) => setForm({ ...form, end_at: value })} /><Field label="Module" value={form.module_key} onChange={(value) => setForm({ ...form, module_key: value })} /><Field label="Reason" value={form.reason} onChange={(value) => setForm({ ...form, reason: value })} /><div className="flex items-end"><Button size="sm" onClick={() => void onSave()}><UserCheck className="h-4 w-4" /> Create</Button></div></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Delegator</TableHead><TableHead>Delegate</TableHead><TableHead>Module</TableHead><TableHead>Dates</TableHead><TableHead>Status</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell>{row.delegator_name ?? row.delegator_user_id}</TableCell><TableCell>{row.delegate_name ?? row.delegate_user_id}</TableCell><TableCell>{row.module_key ?? "All"} / {row.action_key ?? "All"}</TableCell><TableCell>{row.start_at} to {row.end_at}</TableCell><TableCell><Badge tone={statusTone(row.status)}>{row.status}</Badge></TableCell><TableCell>{row.reason}</TableCell></TableRow>)}</TableBody></Table>{loading ? <EmptyState title="Loading delegations" description="Fetching approval delegations." /> : rows.length === 0 ? <EmptyState title="No delegations" description="Time-bound delegations will appear here." /> : null}</div></div>;
}

function Templates({ rows, loading, onEdit }: { rows: ApprovalNotificationTemplate[]; loading: boolean; onEdit: (row: ApprovalNotificationTemplate) => void }) {
  return <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Template</TableHead><TableHead>Event</TableHead><TableHead>Channel</TableHead><TableHead>Subject</TableHead><TableHead>Enabled</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell className="font-medium">{row.template_name}<div className="font-mono text-xs text-muted-foreground">{row.template_code}</div></TableCell><TableCell>{row.event_type}</TableCell><TableCell>{row.channel}</TableCell><TableCell>{row.subject_template ?? "-"}</TableCell><TableCell>{row.is_enabled ? "Yes" : "No"}</TableCell><TableCell className="text-right"><RowActionButton intent="edit" size="sm" title="Edit" onClick={() => onEdit(row)}>Edit</RowActionButton></TableCell></TableRow>)}</TableBody></Table>{loading ? <EmptyState title="Loading templates" description="Fetching notification templates." /> : rows.length === 0 ? <EmptyState title="No templates" description="Approval notification templates are seeded by default." /> : null}</div>;
}

function ReportTable({ rows, loading }: { rows: Record<string, unknown>[]; loading: boolean }) {
  const columns = Object.keys(rows[0] ?? { request_title: "", module_key: "", action_key: "", status: "", submitted_at: "" });
  return <div className="overflow-x-auto"><Table><TableHeader><TableRow>{columns.map((column) => <TableHead key={column}>{column.replace(/_/g, " ")}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map((row, index) => <TableRow key={String(row.id ?? index)}>{columns.map((column) => <TableCell key={column}>{String(row[column] ?? "-")}</TableCell>)}</TableRow>)}</TableBody></Table>{loading ? <EmptyState title="Loading report" description="Fetching approval report data." /> : rows.length === 0 ? <EmptyState title="No report rows" description="Approval report rows will appear after approvals are submitted." /> : null}</div>;
}

function ApprovalDetail({ detail, permissions, onClose, onDecision }: { detail: { instance: ApprovalInstance; steps: ApprovalInstanceStep[]; assignees: ApprovalStepAssignee[]; timeline: ApprovalAction[] }; permissions: Set<string>; onClose: () => void; onDecision: (action: "approve" | "reject" | "send-back" | "cancel", required: boolean) => void }) {
  return <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/25"><div className="h-full w-full max-w-4xl overflow-y-auto border-l bg-white shadow-xl"><div className="flex items-center justify-between border-b px-4 py-3"><div><h2 className="text-sm font-semibold">{detail.instance.request_title}</h2><p className="text-xs text-muted-foreground">{detail.instance.module_key} / {detail.instance.action_key}</p></div><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></div><div className="space-y-4 p-4"><div className="grid gap-2 md:grid-cols-4"><Info label="Status" value={detail.instance.status} /><Info label="Workflow" value={detail.instance.workflow_name_snapshot ?? "Module fallback"} /><Info label="Entity" value={`${detail.instance.entity_type} ${detail.instance.entity_id}`} /><Info label="Submitted" value={detail.instance.submitted_at} /></div><section><h3 className="mb-2 text-sm font-semibold">Steps</h3><Table><TableHeader><TableRow><TableHead>#</TableHead><TableHead>Step</TableHead><TableHead>Mode</TableHead><TableHead>Status</TableHead><TableHead>Due</TableHead></TableRow></TableHeader><TableBody>{detail.steps.map((step) => <TableRow key={step.id}><TableCell>{step.step_number}</TableCell><TableCell>{step.step_name}</TableCell><TableCell>{step.step_mode} / {step.approval_mode}</TableCell><TableCell><Badge tone={statusTone(step.status)}>{step.status}</Badge></TableCell><TableCell>{step.due_at ?? "-"}</TableCell></TableRow>)}</TableBody></Table></section><section><h3 className="mb-2 text-sm font-semibold">Assignees</h3><div className="grid gap-2 md:grid-cols-2">{detail.assignees.map((assignee) => <div key={assignee.id} className="rounded-md border p-3 text-sm"><div className="font-medium">{assignee.assigned_user_name_snapshot}</div><div className="text-xs text-muted-foreground">{assignee.assignment_type} {assignee.assigned_role_snapshot ? `- ${assignee.assigned_role_snapshot}` : ""}</div><Badge className="mt-2" tone={statusTone(assignee.status)}>{assignee.status}</Badge></div>)}</div></section><section><h3 className="mb-2 text-sm font-semibold">Timeline</h3><div className="space-y-2">{detail.timeline.map((item) => <div key={item.id} className="rounded-md border p-3 text-sm"><div className="font-medium">{item.action} <span className="text-muted-foreground">by {item.actor_name_snapshot ?? "System"}</span></div><div className="text-xs text-muted-foreground">{item.created_at}</div>{item.reason ? <div className="mt-1">{item.reason}</div> : null}</div>)}</div></section><div className="flex flex-wrap justify-end gap-2 border-t pt-3">{can(permissions, ["approvals.instances.approve", "approvals.manage"]) ? <ActionTextButton intent="approve" size="sm" onClick={() => onDecision("approve", false)}><CheckCircle2 className="h-4 w-4" /> Approve</ActionTextButton> : null}{can(permissions, ["approvals.instances.reject", "approvals.manage"]) ? <ActionTextButton intent="reject" size="sm" onClick={() => onDecision("reject", true)}><XCircle className="h-4 w-4" /> Reject</ActionTextButton> : null}{can(permissions, ["approvals.instances.send_back", "approvals.manage"]) ? <ActionTextButton intent="send-back" size="sm" onClick={() => onDecision("send-back", true)}><Send className="h-4 w-4" /> Send back</ActionTextButton> : null}{can(permissions, ["approvals.instances.cancel", "approvals.manage"]) ? <ActionTextButton intent="cancel-record" size="sm" onClick={() => onDecision("cancel", true)}>Cancel</ActionTextButton> : null}</div></div></div></div>;
}

function WorkflowDetail({ detail, stepForm, setStepForm, conditionForm, setConditionForm, onClose, onSaveStep, onSaveCondition, onPreview, preview, canManage }: { detail: { workflow: ApprovalWorkflow; conditions: ApprovalWorkflowCondition[]; steps: ApprovalWorkflowStep[] }; stepForm: any; setStepForm: (value: any) => void; conditionForm: any; setConditionForm: (value: any) => void; onClose: () => void; onSaveStep: () => void; onSaveCondition: () => void; onPreview: () => void; preview: ApprovalPreview | null; canManage: boolean }) {
  return <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/25"><div className="h-full w-full max-w-5xl overflow-y-auto border-l bg-white shadow-xl"><div className="flex items-center justify-between border-b px-4 py-3"><div><h2 className="text-sm font-semibold">{detail.workflow.workflow_name}</h2><p className="text-xs text-muted-foreground">Sequential/parallel steps, ANY_ONE/ALL_REQUIRED approval modes, and condition builder.</p></div><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></div><div className="space-y-4 p-4">{canManage ? <div className="grid gap-3 lg:grid-cols-2"><div className="rounded-md border p-3"><h3 className="mb-2 text-sm font-semibold">Add step</h3><div className="grid gap-2 md:grid-cols-2"><Field label="Number" value={stepForm.step_number} onChange={(value) => setStepForm({ ...stepForm, step_number: value })} /><Field label="Name" value={stepForm.step_name} onChange={(value) => setStepForm({ ...stepForm, step_name: value })} /><Select label="Step mode" value={stepForm.step_mode} onChange={(value) => setStepForm({ ...stepForm, step_mode: value })} options={["SEQUENTIAL", "PARALLEL"]} /><Select label="Approval mode" value={stepForm.approval_mode} onChange={(value) => setStepForm({ ...stepForm, approval_mode: value })} options={["ANY_ONE", "ALL_REQUIRED"]} /><Select label="Approver type" value={stepForm.approver_type} onChange={(value) => setStepForm({ ...stepForm, approver_type: value })} options={["SPECIFIC_USER", "ROLE", "PERMISSION", "REPORTING_MANAGER", "DEPARTMENT_HEAD", "LOCATION_MANAGER", "SUPER_ADMIN_FALLBACK"]} /><Field label="Role/User/Permission ID" value={stepForm.approver_role_id || stepForm.approver_user_id || stepForm.approver_permission_key} onChange={(value) => setStepForm({ ...stepForm, approver_role_id: stepForm.approver_type === "ROLE" ? value : "", approver_user_id: stepForm.approver_type === "SPECIFIC_USER" ? value : "", approver_permission_key: stepForm.approver_type === "PERMISSION" ? value : "" })} /></div><Button className="mt-3" size="sm" onClick={() => void onSaveStep()}>Add step</Button></div><div className="rounded-md border p-3"><h3 className="mb-2 text-sm font-semibold">Add condition</h3><div className="grid gap-2 md:grid-cols-3"><Field label="Field" value={conditionForm.field_key} onChange={(value) => setConditionForm({ ...conditionForm, field_key: value })} /><Select label="Operator" value={conditionForm.operator} onChange={(value) => setConditionForm({ ...conditionForm, operator: value })} options={["EQUALS", "NOT_EQUALS", "IN", "NOT_IN", "GREATER_THAN", "LESS_THAN", "EXISTS"]} /><Field label="Value" value={conditionForm.value} onChange={(value) => setConditionForm({ ...conditionForm, value })} /></div><Button className="mt-3" size="sm" onClick={() => void onSaveCondition()}>Add condition</Button></div></div> : null}<div className="grid gap-4 lg:grid-cols-2"><section><h3 className="mb-2 text-sm font-semibold">Steps</h3><Table><TableHeader><TableRow><TableHead>#</TableHead><TableHead>Name</TableHead><TableHead>Mode</TableHead><TableHead>Approver</TableHead><TableHead>Enabled</TableHead></TableRow></TableHeader><TableBody>{detail.steps.map((step) => <TableRow key={step.id}><TableCell>{step.step_number}</TableCell><TableCell>{step.step_name}</TableCell><TableCell>{step.step_mode} / {step.approval_mode}</TableCell><TableCell>{step.approver_type}</TableCell><TableCell>{step.is_enabled ? "Yes" : "No"}</TableCell></TableRow>)}</TableBody></Table></section><section><h3 className="mb-2 text-sm font-semibold">Conditions</h3><Table><TableHeader><TableRow><TableHead>Field</TableHead><TableHead>Operator</TableHead><TableHead>Value</TableHead></TableRow></TableHeader><TableBody>{detail.conditions.map((condition) => <TableRow key={condition.id}><TableCell>{condition.field_key}</TableCell><TableCell>{condition.operator}</TableCell><TableCell>{String(condition.value ?? "-")}</TableCell></TableRow>)}</TableBody></Table></section></div><section className="rounded-md border p-3"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Workflow preview</h3><Button variant="outline" size="sm" onClick={() => void onPreview()}><ShieldCheck className="h-4 w-4" /> Preview</Button></div>{preview ? <div className="mt-3 space-y-2 text-sm"><div>Fallback: <Badge>{preview.fallback_behavior}</Badge></div>{preview.warnings.length ? <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-700">{preview.warnings.join(" ")}</div> : null}{preview.steps.map((step) => <div key={step.id} className="rounded-md border p-2">{step.step_name} - {step.approver_type} - {step.approval_mode}<div className="text-xs text-muted-foreground">Approvers resolved: {step.approvers?.length ?? 0}</div></div>)}</div> : <p className="mt-2 text-sm text-muted-foreground">Preview shows matched workflow, resolved approvers, fallback behavior, and self-approval warnings.</p>}</section></div></div></div>;
}

function ReasonDialog({ action, setAction, onSubmit }: { action: { title: string; reason: string; required?: boolean }; setAction: (value: any) => void; onSubmit: () => void }) {
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/25 p-4"><div className="w-full max-w-md rounded-lg border bg-white p-4 shadow-xl"><h2 className="text-sm font-semibold">{action.title}</h2><Input className="mt-3" placeholder={action.required ? "Reason required" : "Note"} value={action.reason} onChange={(event) => setAction({ ...action, reason: event.target.value })} /><div className="mt-4 flex justify-end gap-2"><Button variant="outline" size="sm" onClick={() => setAction(null)}>Cancel</Button><Button size="sm" onClick={() => void onSubmit()}>Submit</Button></div></div></div>;
}

function TemplateDialog({ token, template, onClose, onSaved }: { token: string; template: ApprovalNotificationTemplate; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState(template);
  async function save() {
    await api.updateApprovalNotificationTemplate(token, template.id, form);
    await onSaved();
    onClose();
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4"><div className="w-full max-w-2xl rounded-lg border bg-white p-4 shadow-xl"><h2 className="text-sm font-semibold">Notification template</h2><div className="mt-3 grid gap-3"><Field label="Name" value={form.template_name} onChange={(value) => setForm({ ...form, template_name: value })} /><Field label="Subject" value={form.subject_template ?? ""} onChange={(value) => setForm({ ...form, subject_template: value })} /><Field label="Body" value={form.body_template} onChange={(value) => setForm({ ...form, body_template: value })} /><Toggle label="Enabled" checked={Boolean(form.is_enabled)} onChange={(value) => setForm({ ...form, is_enabled: value })} /></div><div className="mt-4 flex justify-end gap-2"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={() => void save()}><Bell className="h-4 w-4" /> Save</Button></div></div></div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-sm font-medium">{value}</div></div>;
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div className="space-y-1"><Label>{label}</Label><Input value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return <div className="space-y-1"><Label>{label}</Label><SelectField className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</SelectField></div>;
}

function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return <CheckboxField label={label} checked={checked} disabled={disabled} onChange={onChange} />;
}
