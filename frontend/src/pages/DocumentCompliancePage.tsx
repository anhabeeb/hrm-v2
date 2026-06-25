import { Bell, CheckCircle2, ClipboardList, FileWarning, RefreshCw, Settings, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import type { DocumentComplianceDashboard, DocumentComplianceSettings, DocumentExpiryAlert, DocumentRenewalCase, DocumentRequirementWaiver, DocumentType } from "../types/documents";

type Mode = "dashboard" | "missing" | "expiring" | "expired" | "alerts" | "renewal-cases" | "waivers" | "settings" | "type-settings";

const tabs: Array<{ mode: Mode; label: string; to: string }> = [
  { mode: "dashboard", label: "Dashboard", to: "/documents/compliance" },
  { mode: "missing", label: "Missing", to: "/documents/compliance/missing" },
  { mode: "expiring", label: "Expiring", to: "/documents/compliance/expiring" },
  { mode: "expired", label: "Expired", to: "/documents/compliance/expired" },
  { mode: "alerts", label: "Alerts", to: "/documents/compliance/alerts" },
  { mode: "renewal-cases", label: "Renewal Cases", to: "/documents/compliance/renewal-cases" },
  { mode: "waivers", label: "Waivers", to: "/documents/compliance/waivers" },
  { mode: "settings", label: "Settings", to: "/settings/documents/compliance" },
  { mode: "type-settings", label: "Type Rules", to: "/settings/documents/compliance/types" }
];

function statusTone(status?: string) {
  if (!status) return "neutral";
  if (["COMPLIANT", "RESOLVED", "COMPLETED", "VALID"].includes(status)) return "success";
  if (["EXPIRING_SOON", "OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "WAITING_FOR_EMPLOYEE", "WAITING_FOR_HR"].includes(status)) return "warning";
  if (["EXPIRED_DOCUMENTS", "EXPIRED", "URGENT_EXPIRING", "MISSING_REQUIRED", "CRITICAL", "CANCELLED"].includes(status)) return "danger";
  return "neutral";
}

function asText(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return "-";
  return String(value);
}

export function DocumentCompliancePage({ mode = "dashboard" }: { mode?: Mode }) {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("documents.compliance.view") || permissions.has("documents.view") || permissions.has("reports.documents.view");
  const canManage = permissions.has("documents.compliance.manage") || permissions.has("documents.alerts.manage") || permissions.has("documents.renewal_cases.manage");
  const [dashboard, setDashboard] = useState<DocumentComplianceDashboard | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [alerts, setAlerts] = useState<DocumentExpiryAlert[]>([]);
  const [cases, setCases] = useState<DocumentRenewalCase[]>([]);
  const [waivers, setWaivers] = useState<DocumentRequirementWaiver[]>([]);
  const [settings, setSettings] = useState<DocumentComplianceSettings | null>(null);
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reasonAction, setReasonAction] = useState<null | { title: string; reason: string; onConfirm: (reason: string) => Promise<void>; required?: boolean }>(null);
  const [typeModal, setTypeModal] = useState<DocumentType | null>(null);

  const activeFilters = useMemo(() => ({ search, status }), [search, status]);

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    setError(null);
    try {
      if (mode === "dashboard") {
        setDashboard(await api.getDocumentComplianceDashboard(token));
      } else if (mode === "missing") {
        const result = await api.listDocumentComplianceMissing(token, activeFilters);
        setRows(result.rows ?? result.missing ?? []);
      } else if (mode === "expiring") {
        const result = await api.listDocumentComplianceExpiring(token, activeFilters);
        setRows(result.rows ?? result.expiring ?? []);
      } else if (mode === "expired") {
        const result = await api.listDocumentComplianceExpired(token, activeFilters);
        setRows(result.rows ?? result.expired ?? []);
      } else if (mode === "alerts") {
        setAlerts((await api.listDocumentAlerts(token, activeFilters)).alerts);
      } else if (mode === "renewal-cases") {
        setCases((await api.listDocumentRenewalCases(token, activeFilters)).renewal_cases);
      } else if (mode === "waivers") {
        setWaivers((await api.listDocumentRequirementWaivers(token, activeFilters)).waivers);
      } else if (mode === "settings") {
        setSettings((await api.getDocumentComplianceSettings(token)).settings);
      } else {
        setTypes((await api.listDocumentTypeCompliance(token)).document_types);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load document compliance.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, canView, mode, activeFilters]);

  async function refreshAll() {
    if (!token) return;
    try {
      await api.refreshDocumentCompliance(token);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to refresh compliance.");
    }
  }

  async function alertAction(alert: DocumentExpiryAlert, action: "acknowledge" | "resolve" | "dismiss", reason = "") {
    if (!token) return;
    await api.documentAlertAction(token, alert.id, action, reason);
    await load();
  }

  async function caseAction(row: DocumentRenewalCase, action: "mark-in-progress" | "mark-waiting" | "complete" | "cancel", reason = "") {
    if (!token) return;
    await api.documentRenewalCaseAction(token, row.id, action, { reason, note: reason });
    await load();
  }

  if (!canView) return <Panel><EmptyState title="Document compliance unavailable" description="Your account needs document compliance permission." /></Panel>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Document Expiry & Compliance</h1>
          <p className="text-sm text-muted-foreground">Required documents, expiry alerts, renewal cases, waivers, and compliance settings.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/documents/registry"><Button variant="outline" size="sm">Registry</Button></Link>
          {canManage ? <Button size="sm" variant="outline" onClick={() => void refreshAll()}><RefreshCw className="h-4 w-4" /> Refresh compliance</Button> : null}
        </div>
      </div>

      <Panel className="overflow-hidden">
        <div className="flex overflow-x-auto border-b">
          {tabs.map((tab) => <Link key={tab.mode} to={tab.to} className={`h-11 whitespace-nowrap border-b-2 px-4 pt-3 text-sm font-medium ${mode === tab.mode ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:bg-muted/50"}`}>{tab.label}</Link>)}
        </div>
        {error ? <div className="m-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

        {mode !== "dashboard" && mode !== "settings" && mode !== "type-settings" ? (
          <div className="grid gap-2 border-b p-3 md:grid-cols-4">
            <Input placeholder="Search employee or document" value={search} onChange={(event) => setSearch(event.target.value)} />
            <select className="h-9 rounded-md border bg-white px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">All statuses</option>
              {["OPEN", "ACKNOWLEDGED", "RESOLVED", "DISMISSED", "IN_PROGRESS", "WAITING_FOR_EMPLOYEE", "COMPLETED", "CANCELLED", "ACTIVE"].map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
        ) : null}

        {mode === "dashboard" ? <Dashboard dashboard={dashboard} loading={loading} /> : null}
        {["missing", "expiring", "expired"].includes(mode) ? <GenericRows rows={rows} loading={loading} /> : null}
        {mode === "alerts" ? <Alerts rows={alerts} loading={loading} canManage={canManage} onAction={(alert, action) => action === "acknowledge" ? void alertAction(alert, action) : setReasonAction({ title: `${action} alert`, reason: "", required: action !== "dismiss", onConfirm: (reason) => alertAction(alert, action, reason) })} /> : null}
        {mode === "renewal-cases" ? <RenewalCases rows={cases} loading={loading} canManage={canManage} onAction={(row, action) => action === "cancel" ? setReasonAction({ title: "Cancel renewal case", reason: "", required: true, onConfirm: (reason) => caseAction(row, action, reason) }) : void caseAction(row, action)} /> : null}
        {mode === "waivers" ? <Waivers rows={waivers} loading={loading} canManage={canManage} onCancel={(row) => setReasonAction({ title: "Cancel waiver", reason: "", required: true, onConfirm: async (reason) => { if (token) await api.cancelDocumentRequirementWaiver(token, row.id, reason); await load(); } })} /> : null}
        {mode === "settings" && settings ? <SettingsForm settings={settings} token={token!} onSaved={load} onError={setError} /> : null}
        {mode === "type-settings" ? <TypeCompliance types={types} loading={loading} canManage={canManage || permissions.has("documents.types.compliance.update")} onEdit={setTypeModal} /> : null}
      </Panel>

      {reasonAction ? <ReasonModal action={reasonAction} onClose={() => setReasonAction(null)} /> : null}
      {typeModal && token ? <TypeComplianceModal token={token} type={typeModal} onClose={() => setTypeModal(null)} onSaved={load} /> : null}
    </div>
  );
}

function Dashboard({ dashboard, loading }: { dashboard: DocumentComplianceDashboard | null; loading: boolean }) {
  if (loading) return <EmptyState title="Loading compliance dashboard" description="Refreshing document compliance summary." />;
  if (!dashboard) return <EmptyState title="No dashboard data" description="Refresh compliance to generate the first snapshot." />;
  const summary = dashboard.summary ?? {};
  const tiles = [
    ["Employees", summary.employee_count, "neutral"],
    ["Compliant", summary.compliant, "success"],
    ["Missing", summary.missing_required, "danger"],
    ["Expiring", summary.expiring_soon, "warning"],
    ["Urgent", summary.urgent_expiring, "danger"],
    ["Expired", summary.expired, "danger"],
    ["Waivers", summary.waivers, "neutral"],
    ["Open alerts", summary.open_alerts, "warning"]
  ] as const;
  return <div className="space-y-4 p-3"><div className="grid gap-2 md:grid-cols-4 xl:grid-cols-8">{tiles.map(([label, value, tone]) => <div key={label} className="rounded-md border p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-xl font-semibold"><Badge tone={tone}>{String(value ?? 0)}</Badge></div></div>)}</div><Alerts rows={dashboard.alerts ?? []} loading={false} canManage={false} onAction={() => undefined} /></div>;
}

function GenericRows({ rows, loading }: { rows: Record<string, unknown>[]; loading: boolean }) {
  const columns = ["employee_name", "employee_no", "department_name", "location_name", "position_title", "document_type_name", "document_number", "expiry_date", "days_until_expiry", "status", "reason"];
  return <div className="overflow-x-auto"><Table><TableHeader><TableRow>{columns.map((column) => <TableHead key={column}>{column.replace(/_/g, " ")}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map((row, index) => <TableRow key={String(row.id ?? `${row.employee_id}-${row.document_type_id}-${index}`)}>{columns.map((column) => <TableCell key={column}>{column === "status" ? <Badge tone={statusTone(String(row[column] ?? row.display_status ?? row.requirement_status))}>{asText(row[column] ?? row.display_status ?? row.requirement_status)}</Badge> : asText(row[column])}</TableCell>)}</TableRow>)}</TableBody></Table>{loading ? <EmptyState title="Loading rows" description="Fetching compliance rows." /> : rows.length === 0 ? <EmptyState title="No rows found" description="No records match this view." /> : null}</div>;
}

function Alerts({ rows, loading, canManage, onAction }: { rows: DocumentExpiryAlert[]; loading: boolean; canManage: boolean; onAction: (row: DocumentExpiryAlert, action: "acknowledge" | "resolve" | "dismiss") => void }) {
  return <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Document</TableHead><TableHead>Alert</TableHead><TableHead>Severity</TableHead><TableHead>Status</TableHead><TableHead>Due</TableHead><TableHead>Expiry</TableHead><TableHead>Notes</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell>{row.employee_name ?? "-"}<div className="font-mono text-xs text-muted-foreground">{row.employee_no}</div></TableCell><TableCell>{row.restricted ? "Restricted document" : row.document_type_name ?? "-"}</TableCell><TableCell>{row.alert_type}</TableCell><TableCell><Badge tone={statusTone(row.severity)}>{row.severity}</Badge></TableCell><TableCell><Badge tone={statusTone(row.status)}>{row.status}</Badge></TableCell><TableCell>{row.due_date ?? "-"}</TableCell><TableCell>{row.expiry_date ?? "-"}</TableCell><TableCell>{row.notes ?? "-"}</TableCell><TableCell><div className="flex justify-end gap-1">{canManage && row.status === "OPEN" ? <Button variant="ghost" size="sm" onClick={() => onAction(row, "acknowledge")}><Bell className="h-4 w-4" /> Ack</Button> : null}{canManage && row.status !== "RESOLVED" ? <Button variant="ghost" size="sm" onClick={() => onAction(row, "resolve")}><CheckCircle2 className="h-4 w-4" /> Resolve</Button> : null}{canManage && row.status !== "DISMISSED" ? <Button variant="ghost" size="sm" onClick={() => onAction(row, "dismiss")}><XCircle className="h-4 w-4" /> Dismiss</Button> : null}</div></TableCell></TableRow>)}</TableBody></Table>{loading ? <EmptyState title="Loading alerts" description="Fetching document expiry alerts." /> : rows.length === 0 ? <EmptyState title="No alerts" description="There are no matching document alerts." /> : null}</div>;
}

function RenewalCases({ rows, loading, canManage, onAction }: { rows: DocumentRenewalCase[]; loading: boolean; canManage: boolean; onAction: (row: DocumentRenewalCase, action: "mark-in-progress" | "mark-waiting" | "complete" | "cancel") => void }) {
  return <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Case</TableHead><TableHead>Employee</TableHead><TableHead>Document</TableHead><TableHead>Type</TableHead><TableHead>Status</TableHead><TableHead>Priority</TableHead><TableHead>Due</TableHead><TableHead>Assigned</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell className="font-mono text-xs">{row.renewal_case_number}</TableCell><TableCell>{row.employee_name ?? "-"}<div className="font-mono text-xs text-muted-foreground">{row.employee_no}</div></TableCell><TableCell>{row.document_type_name ?? "-"}</TableCell><TableCell>{row.case_type}</TableCell><TableCell><Badge tone={statusTone(row.status)}>{row.status}</Badge></TableCell><TableCell>{row.priority}</TableCell><TableCell>{row.due_date ?? "-"}</TableCell><TableCell>{row.assigned_to_name ?? "-"}</TableCell><TableCell><div className="flex justify-end gap-1">{canManage && row.status === "OPEN" ? <Button variant="ghost" size="sm" onClick={() => onAction(row, "mark-in-progress")}>Start</Button> : null}{canManage && row.status !== "COMPLETED" ? <Button variant="ghost" size="sm" onClick={() => onAction(row, "mark-waiting")}>Waiting</Button> : null}{canManage && row.status !== "COMPLETED" ? <Button variant="ghost" size="sm" onClick={() => onAction(row, "complete")}>Complete</Button> : null}{canManage && row.status !== "CANCELLED" ? <Button variant="ghost" size="sm" onClick={() => onAction(row, "cancel")}>Cancel</Button> : null}</div></TableCell></TableRow>)}</TableBody></Table>{loading ? <EmptyState title="Loading renewal cases" description="Fetching renewal workflow records." /> : rows.length === 0 ? <EmptyState title="No renewal cases" description="Expiry and missing document workflows will appear here." /> : null}</div>;
}

function Waivers({ rows, loading, canManage, onCancel }: { rows: DocumentRequirementWaiver[]; loading: boolean; canManage: boolean; onCancel: (row: DocumentRequirementWaiver) => void }) {
  return <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Document</TableHead><TableHead>Reason</TableHead><TableHead>Start</TableHead><TableHead>End</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell>{row.employee_name ?? "-"}<div className="font-mono text-xs text-muted-foreground">{row.employee_no}</div></TableCell><TableCell>{row.document_type_name ?? row.document_type_code ?? "-"}</TableCell><TableCell>{row.waiver_reason}</TableCell><TableCell>{row.waiver_start_date}</TableCell><TableCell>{row.waiver_end_date ?? "-"}</TableCell><TableCell><Badge tone={statusTone(row.status)}>{row.status}</Badge></TableCell><TableCell className="text-right">{canManage && row.status === "ACTIVE" ? <Button variant="ghost" size="sm" onClick={() => onCancel(row)}>Cancel</Button> : null}</TableCell></TableRow>)}</TableBody></Table>{loading ? <EmptyState title="Loading waivers" description="Fetching requirement waivers." /> : rows.length === 0 ? <EmptyState title="No waivers" description="Waived requirements will appear here." /> : null}</div>;
}

function SettingsForm({ settings, token, onSaved, onError }: { settings: DocumentComplianceSettings; token: string; onSaved: () => Promise<void>; onError: (value: string | null) => void }) {
  const [form, setForm] = useState(settings);
  const update = (key: keyof DocumentComplianceSettings, value: string | number | boolean) => setForm((current) => ({ ...current, [key]: value }));
  async function save() {
    try {
      await api.updateDocumentComplianceSettings(token, form);
      await onSaved();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Unable to save compliance settings.");
    }
  }
  return <div className="grid gap-3 p-3 md:grid-cols-3"><Toggle label="Compliance enabled" checked={form.document_compliance_enabled} onChange={(value) => update("document_compliance_enabled", value)} /><Toggle label="Expiry alerts" checked={form.expiry_alerts_enabled} onChange={(value) => update("expiry_alerts_enabled", value)} /><Toggle label="Missing alerts" checked={form.missing_required_document_alerts_enabled} onChange={(value) => update("missing_required_document_alerts_enabled", value)} /><Toggle label="Renewal workflow" checked={form.renewal_workflow_enabled} onChange={(value) => update("renewal_workflow_enabled", value)} /><Toggle label="Allow waivers" checked={form.allow_document_requirement_waiver} onChange={(value) => update("allow_document_requirement_waiver", value)} /><Toggle label="Self-service view" checked={form.allow_employee_view_document_compliance} onChange={(value) => update("allow_employee_view_document_compliance", value)} /><Field label="Expiring soon days" type="number" value={String(form.default_expiring_soon_days)} onChange={(value) => update("default_expiring_soon_days", Number(value))} /><Field label="Urgent days" type="number" value={String(form.default_urgent_expiring_days)} onChange={(value) => update("default_urgent_expiring_days", Number(value))} /><Field label="Overdue grace days" type="number" value={String(form.default_overdue_grace_days)} onChange={(value) => update("default_overdue_grace_days", Number(value))} /><div className="md:col-span-3"><Button size="sm" onClick={() => void save()}><Settings className="h-4 w-4" /> Save settings</Button></div></div>;
}

function TypeCompliance({ types, loading, canManage, onEdit }: { types: DocumentType[]; loading: boolean; canManage: boolean; onEdit: (type: DocumentType) => void }) {
  return <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Sensitivity</TableHead><TableHead>Expiry</TableHead><TableHead>Urgent days</TableHead><TableHead>Activation block</TableHead><TableHead>Payroll warning</TableHead><TableHead>Settlement warning</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{types.map((type) => <TableRow key={type.id}><TableCell className="font-medium">{type.name}<div className="font-mono text-xs text-muted-foreground">{type.code}</div></TableCell><TableCell><Badge tone={type.is_sensitive ? "warning" : "neutral"}>{type.sensitivity_level ?? (type.is_sensitive ? "SENSITIVE" : "NORMAL")}</Badge></TableCell><TableCell>{type.expiry_required || type.requires_expiry_date ? "Required" : "Optional"}</TableCell><TableCell>{type.urgent_expiring_days ?? "-"}</TableCell><TableCell>{type.blocks_employee_activation ? "Yes" : "No"}</TableCell><TableCell>{type.creates_payroll_warning ? "Yes" : "No"}</TableCell><TableCell>{type.creates_final_settlement_warning ? "Yes" : "No"}</TableCell><TableCell className="text-right">{canManage ? <Button variant="ghost" size="sm" onClick={() => onEdit(type)}>Edit</Button> : null}</TableCell></TableRow>)}</TableBody></Table>{loading ? <EmptyState title="Loading type compliance" description="Fetching document type compliance rules." /> : types.length === 0 ? <EmptyState title="No document types" description="Create document types first." /> : null}</div>;
}

function TypeComplianceModal({ token, type, onClose, onSaved }: { token: string; type: DocumentType; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<Partial<DocumentType>>(type);
  const update = (key: keyof DocumentType, value: string | number | boolean | null) => setForm((current) => ({ ...current, [key]: value }));
  async function save() {
    await api.updateDocumentTypeCompliance(token, type.id, form);
    await onSaved();
    onClose();
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4"><div className="w-full max-w-2xl rounded-lg border bg-white shadow-xl"><div className="flex items-center justify-between border-b px-4 py-3"><div><h2 className="text-sm font-semibold">Type compliance settings</h2><p className="text-xs text-muted-foreground">{type.name}</p></div><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></div><div className="grid gap-3 p-4 md:grid-cols-2"><Toggle label="Expiry required" checked={Boolean(form.expiry_required)} onChange={(value) => update("expiry_required", value)} /><Toggle label="Issue date required" checked={Boolean(form.issue_date_required)} onChange={(value) => update("issue_date_required", value)} /><Toggle label="Document number required" checked={Boolean(form.document_number_required)} onChange={(value) => update("document_number_required", value)} /><Toggle label="Auto-create renewal case" checked={Boolean(form.renewal_case_auto_create)} onChange={(value) => update("renewal_case_auto_create", value)} /><Toggle label="Employee summary visible" checked={form.employee_summary_visible !== false} onChange={(value) => update("employee_summary_visible", value)} /><Toggle label="Employee download allowed" checked={Boolean(form.employee_download_allowed)} onChange={(value) => update("employee_download_allowed", value)} /><Toggle label="Blocks activation" checked={Boolean(form.blocks_employee_activation)} onChange={(value) => update("blocks_employee_activation", value)} /><Toggle label="Payroll warning" checked={Boolean(form.creates_payroll_warning)} onChange={(value) => update("creates_payroll_warning", value)} /><Toggle label="Final settlement warning" checked={Boolean(form.creates_final_settlement_warning)} onChange={(value) => update("creates_final_settlement_warning", value)} /><Field label="Urgent expiring days" type="number" value={String(form.urgent_expiring_days ?? "")} onChange={(value) => update("urgent_expiring_days", value ? Number(value) : null)} /><Field label="Compliance weight" type="number" value={String(form.compliance_weight ?? "")} onChange={(value) => update("compliance_weight", value ? Number(value) : null)} /><div><Label>Sensitivity</Label><select className="mt-1 h-9 w-full rounded-md border bg-white px-3 text-sm" value={form.sensitivity_level ?? "NORMAL"} onChange={(event) => update("sensitivity_level", event.target.value)}><option value="NORMAL">Normal</option><option value="SENSITIVE">Sensitive</option><option value="HIGHLY_SENSITIVE">Highly sensitive</option></select></div><div className="md:col-span-2"><Label>Renewal instructions</Label><Input value={form.renewal_instructions ?? ""} onChange={(event) => update("renewal_instructions", event.target.value)} /></div></div><div className="flex justify-end gap-2 border-t px-4 py-3"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={() => void save()}>Save</Button></div></div></div>;
}

function ReasonModal({ action, onClose }: { action: { title: string; reason: string; required?: boolean; onConfirm: (reason: string) => Promise<void> }; onClose: () => void }) {
  const [reason, setReason] = useState(action.reason);
  const [error, setError] = useState<string | null>(null);
  async function submitReason() {
    if (action.required && !reason.trim()) {
      setError("Reason is required.");
      return;
    }
    try {
      await action.onConfirm(reason.trim());
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to complete action.");
    }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4"><div className="w-full max-w-md rounded-lg border bg-white p-4 shadow-xl"><h2 className="text-sm font-semibold">{action.title}</h2><Input className="mt-3" placeholder="Reason or note" value={reason} onChange={(event) => setReason(event.target.value)} />{error ? <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}<div className="mt-4 flex justify-end gap-2"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={() => void submitReason()}>Confirm</Button></div></div></div>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /> {label}</label>;
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <div className="space-y-1.5"><Label>{label}</Label><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}
