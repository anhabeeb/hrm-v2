import { CheckCircle2, FileDown, RefreshCw, ShieldAlert } from "lucide-react";
import { FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { DataTableFrame } from "../components/ui/data-table";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Panel } from "../components/ui/panel";
import { StatusBadge } from "../components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import type { Employee } from "../types/employees";
import type { LifecycleSettings, LifecycleTask, OffboardingCase, OnboardingCase } from "../types/lifecycle";

type Mode =
  | "onboarding-dashboard"
  | "onboarding-cases"
  | "onboarding-settings"
  | "onboarding-alerts"
  | "offboarding-dashboard"
  | "offboarding-cases"
  | "offboarding-settings"
  | "lifecycle-reports";

type CaseKind = "onboarding" | "offboarding";
type Row = Record<string, unknown>;

const nav = [
  { label: "Onboarding Dashboard", mode: "onboarding-dashboard", to: "/onboarding" },
  { label: "Onboarding Cases", mode: "onboarding-cases", to: "/onboarding/cases" },
  { label: "Onboarding Alerts", mode: "onboarding-alerts", to: "/onboarding/alerts" },
  { label: "Onboarding Settings", mode: "onboarding-settings", to: "/onboarding/settings" },
  { label: "Offboarding Dashboard", mode: "offboarding-dashboard", to: "/offboarding" },
  { label: "Offboarding Cases", mode: "offboarding-cases", to: "/offboarding/cases" },
  { label: "Offboarding Settings", mode: "offboarding-settings", to: "/offboarding/settings" },
  { label: "Lifecycle Reports", mode: "lifecycle-reports", to: "/lifecycle/reports" }
] as const;

const onboardingSettingFields = [
  "onboarding_enabled",
  "require_onboarding_before_activation",
  "allow_draft_employee_records",
  "allow_partial_onboarding",
  "require_documents_before_activation",
  "require_contract_before_activation",
  "require_payroll_profile_before_activation",
  "require_biometric_mapping_before_activation",
  "require_user_account_before_activation",
  "require_approval_before_activation",
  "allow_activation_override_with_reason",
  "employee_self_service_onboarding_view_enabled"
];

const offboardingSettingFields = [
  "offboarding_enabled",
  "require_offboarding_case_before_exit",
  "auto_create_offboarding_case_on_exit_status",
  "require_final_settlement_before_archive",
  "require_asset_uniform_clearance",
  "require_document_checklist",
  "require_payroll_final_check",
  "require_attendance_final_check",
  "require_roster_future_assignment_check",
  "require_user_account_deactivation",
  "require_access_revocation",
  "require_approval_before_exit_finalization",
  "allow_offboarding_override_with_reason",
  "employee_self_service_offboarding_view_enabled"
];

const reportKeys = [
  "onboarding/summary",
  "onboarding/overdue-tasks",
  "onboarding/blocked",
  "onboarding/completed",
  "onboarding/by-department",
  "onboarding/by-worksite",
  "onboarding/overrides",
  "offboarding/summary",
  "offboarding/overdue-tasks",
  "offboarding/pending-clearance",
  "offboarding/pending-final-settlement",
  "offboarding/pending-payroll-check",
  "offboarding/pending-access-revocation",
  "offboarding/completed",
  "offboarding/overrides",
  "lifecycle/events",
  "lifecycle/sla-placeholder"
];

function text(value: unknown) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function title(value: string) {
  return value.replace(/\//g, " / ").replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isEnabled(value: unknown) {
  return value === true || value === 1 || value === "1";
}

export function LifecyclePage({ mode = "onboarding-dashboard" }: { mode?: Mode }) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [onboardingCases, setOnboardingCases] = useState<OnboardingCase[]>([]);
  const [offboardingCases, setOffboardingCases] = useState<OffboardingCase[]>([]);
  const [dashboard, setDashboard] = useState<Row>({});
  const [alerts, setAlerts] = useState<Row[]>([]);
  const [settings, setSettings] = useState<LifecycleSettings | null>(null);
  const [selected, setSelected] = useState<{ kind: CaseKind; id: string } | null>(null);
  const [createKind, setCreateKind] = useState<CaseKind | null>(null);
  const [reportKey, setReportKey] = useState(reportKeys[0]);
  const [reportRows, setReportRows] = useState<Row[]>([]);
  const [reasonAction, setReasonAction] = useState<{ title: string; submit: (reason: string) => Promise<void> } | null>(null);

  const activeKind: CaseKind = mode.startsWith("offboarding") ? "offboarding" : "onboarding";
  const activeCases = activeKind === "onboarding" ? onboardingCases : offboardingCases;

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      if (mode.includes("settings")) {
        setSettings(activeKind === "onboarding" ? (await api.getOnboardingSettings(token)).settings : (await api.getOffboardingSettings(token)).settings);
      } else if (mode === "onboarding-alerts") {
        setAlerts((await api.listOnboardingAlerts(token)).alerts);
      } else if (mode === "lifecycle-reports") {
        setReportRows((await api.getReport(token, reportKey)).report.rows as Row[]);
      } else if (mode.includes("dashboard")) {
        setDashboard(activeKind === "onboarding" ? (await api.getOnboardingDashboard(token)).dashboard : (await api.getOffboardingDashboard(token)).dashboard);
      } else {
        const [employeeResult, caseResult] = await Promise.all([
          api.listEmployees(token).catch(() => ({ employees: [] })),
          activeKind === "onboarding" ? api.listOnboardingCases(token) : api.listOffboardingCases(token)
        ]);
        setEmployees(employeeResult.employees);
        if (activeKind === "onboarding") setOnboardingCases((caseResult as { cases: OnboardingCase[] }).cases);
        else setOffboardingCases((caseResult as { cases: OffboardingCase[] }).cases);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Lifecycle workspace could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, mode, reportKey]);

  async function saveSettings(input: LifecycleSettings) {
    if (!token) return;
    setError(null);
    try {
      setSettings(activeKind === "onboarding" ? (await api.updateOnboardingSettings(token, input)).settings : (await api.updateOffboardingSettings(token, input)).settings);
      setMessage("Settings saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save lifecycle settings.");
    }
  }

  async function refreshAlerts() {
    if (!token) return;
    await api.refreshOnboardingAlerts(token);
    await load();
  }

  async function exportReport() {
    if (!token) return;
    const download = await api.exportReportCsv(token, reportKey);
    const url = URL.createObjectURL(download.blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = download.filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Employee Lifecycle</h1>
          <p className="text-sm text-muted-foreground">Onboarding, offboarding, lifecycle tasks, activation readiness, and exit readiness.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <Panel className="overflow-x-auto p-2">
        <div className="flex min-w-max gap-1">
          {nav.map((item) => (
            <Link key={item.mode} to={item.to} className={`rounded-md px-3 py-2 text-sm ${mode === item.mode ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
              {item.label}
            </Link>
          ))}
        </div>
      </Panel>

      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}

      {mode.includes("dashboard") ? <DashboardSection data={dashboard} loading={loading} error={error} /> : null}
      {mode.includes("cases") ? (
        <CasesSection
          kind={activeKind}
          cases={activeCases}
          loading={loading}
          error={error}
          onCreate={() => setCreateKind(activeKind)}
          onSelect={(id) => setSelected({ kind: activeKind, id })}
        />
      ) : null}
      {mode.includes("settings") ? <SettingsSection settings={settings} kind={activeKind} loading={loading} error={error} onSave={saveSettings} /> : null}
      {mode === "onboarding-alerts" ? <AlertsSection alerts={alerts} loading={loading} error={error} onRefresh={() => void refreshAlerts()} /> : null}
      {mode === "lifecycle-reports" ? <ReportsSection reportKey={reportKey} setReportKey={setReportKey} rows={reportRows} loading={loading} error={error} onExport={() => void exportReport()} /> : null}

      {createKind ? <CreateCaseModal kind={createKind} employees={employees} onClose={() => setCreateKind(null)} onCreated={() => { setCreateKind(null); void load(); }} /> : null}
      {selected ? (
        <CaseDetailModal
          kind={selected.kind}
          caseId={selected.id}
          onClose={() => setSelected(null)}
          onChanged={() => void load()}
          askReason={(titleText, submit) => setReasonAction({ title: titleText, submit })}
        />
      ) : null}
      {reasonAction ? <ReasonModal title={reasonAction.title} onClose={() => setReasonAction(null)} onSubmit={async (reason) => { await reasonAction.submit(reason); setReasonAction(null); }} /> : null}
    </div>
  );
}

function DashboardSection({ data, loading, error }: { data: Row; loading: boolean; error: string | null }) {
  const stats = Object.entries(data).filter(([, value]) => typeof value === "number");
  const rows = (data.rows ?? data.recent_onboarding ?? data.recent_offboarding ?? []) as Row[];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(([key, value]) => (
          <Panel key={key} className="p-4">
            <p className="text-xs font-medium uppercase text-muted-foreground">{title(key)}</p>
            <p className="mt-2 text-2xl font-semibold">{String(value)}</p>
          </Panel>
        ))}
      </div>
      <DataTableFrame loading={loading} error={error} empty={!loading && rows.length === 0}>
        <Table>
          <TableHeader><TableRow><TableHead>Case</TableHead><TableHead>Employee</TableHead><TableHead>Status</TableHead><TableHead>Due</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={String(row.id)}>
                <TableCell>{text(row.case_number)}</TableCell>
                <TableCell>{text(row.employee_name ?? row.employee_name_snapshot)}</TableCell>
                <TableCell><StatusBadge value={row.onboarding_status ?? row.offboarding_status} /></TableCell>
                <TableCell>{text(row.due_date)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataTableFrame>
    </div>
  );
}

function CasesSection({ kind, cases, loading, error, onCreate, onSelect }: { kind: CaseKind; cases: (OnboardingCase | OffboardingCase)[]; loading: boolean; error: string | null; onCreate: () => void; onSelect: (id: string) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={onCreate}>Create {kind} case</Button>
      </div>
      <DataTableFrame loading={loading} error={error} empty={!loading && cases.length === 0}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Case</TableHead><TableHead>Employee</TableHead><TableHead>Department</TableHead><TableHead>Worksite</TableHead><TableHead>Status</TableHead><TableHead>Readiness</TableHead><TableHead>Due</TableHead><TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cases.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.case_number}</TableCell>
                <TableCell>{row.employee_name ?? row.employee_name_snapshot ?? "-"}</TableCell>
                <TableCell>{row.department_name ?? "-"}</TableCell>
                <TableCell>{row.location_name ?? "-"}</TableCell>
                <TableCell><StatusBadge value={"onboarding_status" in row ? row.onboarding_status : row.offboarding_status} /></TableCell>
                <TableCell><StatusBadge value={"activation_status" in row ? row.activation_status : row.finalization_status} /></TableCell>
                <TableCell>{row.due_date ?? "-"}</TableCell>
                <TableCell><Button variant="outline" size="sm" onClick={() => onSelect(row.id)}>View</Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DataTableFrame>
    </div>
  );
}

function SettingsSection({ settings, kind, loading, error, onSave }: { settings: LifecycleSettings | null; kind: CaseKind; loading: boolean; error: string | null; onSave: (input: LifecycleSettings) => Promise<void> }) {
  const [draft, setDraft] = useState<LifecycleSettings | null>(settings);
  useEffect(() => setDraft(settings), [settings]);
  const fields = kind === "onboarding" ? onboardingSettingFields : offboardingSettingFields;
  if (loading) return <DataTableFrame loading><div /></DataTableFrame>;
  if (error) return <DataTableFrame error={error}><div /></DataTableFrame>;
  if (!draft) return <Panel><EmptyState title="Settings unavailable" /></Panel>;
  return (
    <Panel className="p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {fields.map((field) => (
          <label key={field} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
            <span>{title(field)}</span>
            <input type="checkbox" checked={isEnabled(draft[field])} onChange={(event) => setDraft({ ...draft, [field]: event.target.checked ? 1 : 0 })} />
          </label>
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <Button size="sm" onClick={() => void onSave(draft)}>Save settings</Button>
      </div>
    </Panel>
  );
}

function AlertsSection({ alerts, loading, error, onRefresh }: { alerts: Row[]; loading: boolean; error: string | null; onRefresh: () => void }) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Button size="sm" variant="outline" onClick={onRefresh}><ShieldAlert className="h-4 w-4" /> Refresh alerts</Button></div>
      <DataTableFrame loading={loading} error={error} empty={!loading && alerts.length === 0}>
        <Table>
          <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Type</TableHead><TableHead>Severity</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
          <TableBody>{alerts.map((row) => <TableRow key={String(row.id)}><TableCell>{text(row.employee_name)}</TableCell><TableCell>{text(row.alert_type)}</TableCell><TableCell><Badge tone="warning">{text(row.severity)}</Badge></TableCell><TableCell><StatusBadge value={row.status} /></TableCell><TableCell>{text(row.created_at)}</TableCell></TableRow>)}</TableBody>
        </Table>
      </DataTableFrame>
    </div>
  );
}

function ReportsSection({ reportKey, setReportKey, rows, loading, error, onExport }: { reportKey: string; setReportKey: (value: string) => void; rows: Row[]; loading: boolean; error: string | null; onExport: () => void }) {
  const columns = useMemo(() => Object.keys(rows[0] ?? {}).slice(0, 8), [rows]);
  return (
    <div className="space-y-3">
      <Panel className="flex flex-col gap-3 p-3 sm:flex-row sm:items-end">
        <div className="max-w-md flex-1">
          <Label>Lifecycle report</Label>
          <select className="mt-1 h-9 w-full rounded-md border bg-white px-3 text-sm" value={reportKey} onChange={(event) => setReportKey(event.target.value)}>
            {reportKeys.map((key) => <option key={key} value={key}>{title(key)}</option>)}
          </select>
        </div>
        <Button variant="outline" size="sm" onClick={onExport}><FileDown className="h-4 w-4" /> Export CSV</Button>
      </Panel>
      <DataTableFrame loading={loading} error={error} empty={!loading && rows.length === 0}>
        <Table>
          <TableHeader><TableRow>{columns.map((column) => <TableHead key={column}>{title(column)}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{rows.map((row, index) => <TableRow key={String(row.id ?? index)}>{columns.map((column) => <TableCell key={column}>{text(row[column])}</TableCell>)}</TableRow>)}</TableBody>
        </Table>
      </DataTableFrame>
    </div>
  );
}

function CreateCaseModal({ kind, employees, onClose, onCreated }: { kind: CaseKind; employees: Employee[]; onClose: () => void; onCreated: () => void }) {
  const { token } = useAuth();
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [lastWorkingDay, setLastWorkingDay] = useState(new Date().toISOString().slice(0, 10));
  const [exitType, setExitType] = useState("RESIGNED");
  const [exitReason, setExitReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token || !employeeId) return;
    setError(null);
    try {
      if (kind === "onboarding") await api.createEmployeeOnboardingCase(token, employeeId);
      else await api.createEmployeeOffboardingCase(token, employeeId, { exit_type: exitType, last_working_day: lastWorkingDay, exit_reason: exitReason || null });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to create lifecycle case.");
    }
  }
  return (
    <Modal title={`Create ${kind} case`} onClose={onClose}>
      <form className="space-y-3" onSubmit={(event) => void submit(event)}>
        <div><Label>Employee</Label><select className="mt-1 h-9 w-full rounded-md border bg-white px-3 text-sm" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employee_no} - {employee.full_name}</option>)}</select></div>
        {kind === "offboarding" ? (
          <>
            <div><Label>Exit type</Label><select className="mt-1 h-9 w-full rounded-md border bg-white px-3 text-sm" value={exitType} onChange={(event) => setExitType(event.target.value)}>{["RESIGNED", "TERMINATED", "END_OF_CONTRACT", "ABSCONDED", "RETIRED", "DECEASED", "OTHER"].map((value) => <option key={value} value={value}>{title(value)}</option>)}</select></div>
            <div><Label>Last working day</Label><Input type="date" value={lastWorkingDay} onChange={(event) => setLastWorkingDay(event.target.value)} /></div>
            <div><Label>Exit reason</Label><Input value={exitReason} onChange={(event) => setExitReason(event.target.value)} /></div>
          </>
        ) : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit">Create</Button></div>
      </form>
    </Modal>
  );
}

function CaseDetailModal({ kind, caseId, onClose, onChanged, askReason }: { kind: CaseKind; caseId: string; onClose: () => void; onChanged: () => void; askReason: (title: string, submit: (reason: string) => Promise<void>) => void }) {
  const { token } = useAuth();
  const [detail, setDetail] = useState<{ case: OnboardingCase | OffboardingCase; checklist: { tasks: LifecycleTask[] }; readiness?: Row } | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    if (!token) return;
    try {
      const data = kind === "onboarding" ? await api.getOnboardingCase(token, caseId) : await api.getOffboardingCase(token, caseId);
      const readiness = kind === "onboarding" ? (await api.getOnboardingReadiness(token, caseId)).readiness : (await api.getOffboardingReadiness(token, caseId)).readiness;
      setDetail({ case: data.case, checklist: data.checklist, readiness });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load lifecycle case.");
    }
  }
  useEffect(() => { void load(); }, [token, kind, caseId]);
  async function run(action: () => Promise<unknown>) {
    await action();
    await load();
    onChanged();
  }
  const tasks = detail?.checklist?.tasks ?? [];
  const blockers = Array.isArray(detail?.readiness?.blocking_items) ? (detail?.readiness?.blocking_items as unknown[]) : [];
  const warnings = Array.isArray(detail?.readiness?.warning_items) ? (detail?.readiness?.warning_items as unknown[]) : [];
  return (
    <Modal title={`${title(kind)} case`} onClose={onClose} wide>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {!detail ? <p className="text-sm text-muted-foreground">Loading case detail...</p> : (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Info label="Case" value={detail.case.case_number} />
            <Info label="Status" value={"onboarding_status" in detail.case ? detail.case.onboarding_status : detail.case.offboarding_status} />
            <Info label="Readiness" value={"activation_status" in detail.case ? detail.case.activation_status : detail.case.finalization_status} />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Panel className="p-3"><h3 className="text-sm font-semibold">Blocking items</h3><List values={blockers} /></Panel>
            <Panel className="p-3"><h3 className="text-sm font-semibold">Warnings</h3><List values={warnings} /></Panel>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void run(() => kind === "onboarding" ? api.refreshOnboardingTasks(token!, caseId) : api.refreshOffboardingTasks(token!, caseId))}>Refresh checklist</Button>
            {kind === "onboarding" ? (
              <>
                <Button size="sm" variant="outline" onClick={() => void run(() => api.submitOnboardingActivation(token!, caseId))}>Submit activation</Button>
                <Button size="sm" variant="outline" onClick={() => void run(() => api.approveOnboardingActivation(token!, caseId))}>Approve activation</Button>
                <Button size="sm" onClick={() => void run(() => api.activateOnboardingCase(token!, caseId))}><CheckCircle2 className="h-4 w-4" /> Activate</Button>
                <Button size="sm" variant="danger" onClick={() => askReason("Activate with override", (reason) => run(() => api.activateOnboardingCaseWithOverride(token!, caseId, reason)))}>Override activation</Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={() => void run(() => api.submitOffboardingFinalization(token!, caseId))}>Submit finalization</Button>
                <Button size="sm" variant="outline" onClick={() => void run(() => api.approveOffboardingFinalization(token!, caseId))}>Approve finalization</Button>
                <Button size="sm" onClick={() => void run(() => api.finalizeOffboardingCase(token!, caseId))}><CheckCircle2 className="h-4 w-4" /> Finalize exit</Button>
                <Button size="sm" variant="danger" onClick={() => askReason("Finalize with override", (reason) => run(() => api.finalizeOffboardingCaseWithOverride(token!, caseId, reason)))}>Override finalization</Button>
              </>
            )}
          </div>
          <DataTableFrame empty={tasks.length === 0}>
            <Table>
              <TableHeader><TableRow><TableHead>Task</TableHead><TableHead>Group</TableHead><TableHead>Status</TableHead><TableHead>Required</TableHead><TableHead>Due</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {tasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell>{task.task_name ?? task.title ?? task.task_key}</TableCell>
                    <TableCell>{task.task_group}</TableCell>
                    <TableCell><StatusBadge value={task.task_status ?? task.status} /></TableCell>
                    <TableCell>{task.is_required || task.required ? "Yes" : "No"}</TableCell>
                    <TableCell>{task.due_date ?? "-"}</TableCell>
                    <TableCell className="space-x-2">
                      <Button size="sm" variant="outline" onClick={() => void run(() => kind === "onboarding" ? api.completeOnboardingTask(token!, task.id) : api.completeOffboardingTask(token!, task.id))}>Complete</Button>
                      <Button size="sm" variant="outline" onClick={() => askReason("Waive task", (reason) => run(() => kind === "onboarding" ? api.waiveOnboardingTask(token!, task.id, reason) : api.waiveOffboardingTask(token!, task.id, reason)))}>Waive</Button>
                      <Button size="sm" variant="ghost" onClick={() => void run(() => kind === "onboarding" ? api.reopenOnboardingTask(token!, task.id) : api.reopenOffboardingTask(token!, task.id))}>Reopen</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DataTableFrame>
        </div>
      )}
    </Modal>
  );
}

function ReasonModal({ title: modalTitle, onClose, onSubmit }: { title: string; onClose: () => void; onSubmit: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!reason.trim()) {
      setError("Reason is required.");
      return;
    }
    await onSubmit(reason.trim());
  }
  return (
    <Modal title={modalTitle} onClose={onClose}>
      <form className="space-y-3" onSubmit={(event) => void submit(event)}>
        <div><Label>Reason</Label><Input value={reason} onChange={(event) => setReason(event.target.value)} /></div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit">Confirm</Button></div>
      </form>
    </Modal>
  );
}

function Modal({ title: modalTitle, children, onClose, wide }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4">
      <div className={`max-h-[90vh] w-full overflow-y-auto rounded-md bg-white shadow-lg ${wide ? "max-w-5xl" : "max-w-xl"}`}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold">{modalTitle}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: unknown }) {
  return <div className="rounded-md border px-3 py-2"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium">{text(value)}</p></div>;
}

function List({ values }: { values: unknown[] }) {
  if (!values.length) return <p className="mt-2 text-sm text-muted-foreground">None.</p>;
  return <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">{values.map((value, index) => <li key={index}>{text(value)}</li>)}</ul>;
}
