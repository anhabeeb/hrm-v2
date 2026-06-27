import { CheckCircle2, Circle, FileDown, RefreshCw, ShieldAlert } from "lucide-react";
import { FormEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { EmployeeIdentityCell } from "../components/employee/EmployeeIdentityCell";
import { EmployeeCascadeSelect } from "../components/organization/EmployeeCascadeSelect";
import { OrganizationCascadeSelector } from "../components/organization/OrganizationCascadeSelector";
import { ModuleSettingsBody } from "../components/settings/ModuleToggleHeader";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { DataTableFrame } from "../components/ui/data-table";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { SubNavigationBar, SubNavigationItem } from "../components/ui/navigation-tabs";
import { PageHeader, PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { StatusBadge } from "../components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Timeline } from "../components/ui/timeline";
import { useAuth } from "../hooks/useAuth";
import { useOrganizationReferences } from "../hooks/useOrganizationReferences";
import { ApiError, api } from "../lib/api";
import type { Employee } from "../types/employees";
import type { LifecycleSettings, LifecycleTask, OffboardingCase, OnboardingCase } from "../types/lifecycle";
import type { OrganizationDepartment, OrganizationJobLevel, OrganizationLocation, OrganizationPosition } from "../types/organization";
import { CheckboxField, SelectField } from "../components/ui/page-shell";

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
  { label: "Offboarding Dashboard", mode: "offboarding-dashboard", to: "/offboarding" },
  { label: "Offboarding Cases", mode: "offboarding-cases", to: "/offboarding/cases" },
  { label: "Lifecycle Reports", mode: "lifecycle-reports", to: "/lifecycle/reports" }
] as const;

const onboardingSettingFields = [
  "onboarding_enabled",
  "require_onboarding_before_activation",
  "allow_draft_employee_records",
  "auto_create_onboarding_case_on_employee_create",
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

function displayText(value: unknown, fallback = "Not set") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function title(value: string) {
  return value.replace(/\//g, " / ").replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isEnabled(value: unknown) {
  return value === true || value === 1 || value === "1";
}

function objectMessage(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "object") {
    const row = value as Row;
    return String(row.message ?? row.title ?? row.task_name ?? row.field ?? JSON.stringify(row));
  }
  return String(value);
}

export function LifecyclePage({ mode = "onboarding-dashboard" }: { mode?: Mode }) {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
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
  const organizationRefs = useOrganizationReferences(token);
  const [searchParams, setSearchParams] = useSearchParams();

  const activeKind: CaseKind = mode.startsWith("offboarding") ? "offboarding" : "onboarding";
  const activeCases = activeKind === "onboarding" ? onboardingCases : offboardingCases;
  const canManageLifecycleSettings = activeKind === "onboarding"
    ? permissions.has("onboarding.settings.manage") || permissions.has("onboarding.settings.update") || permissions.has("settings.manage")
    : permissions.has("offboarding.settings.manage") || permissions.has("offboarding.settings.update") || permissions.has("settings.manage");

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

  useEffect(() => {
    const caseId = searchParams.get("case_id");
    if (caseId && mode === "onboarding-cases") setSelected({ kind: "onboarding", id: caseId });
  }, [mode, searchParams]);

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
    <PageShell>
      <PageHeader
        title="Employee Lifecycle"
        description="Onboarding, offboarding, lifecycle tasks, activation readiness, and exit readiness."
        actions={<Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="h-4 w-4" /> Refresh</Button>}
      />

      <SubNavigationBar label="Employee lifecycle section tabs">
        {nav.map((item) => <SubNavigationItem key={item.mode} to={item.to} active={mode === item.mode}>{item.label}</SubNavigationItem>)}
      </SubNavigationBar>

      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}

      {mode.includes("dashboard") ? <DashboardSection data={dashboard} loading={loading} error={error} /> : null}
      {mode.includes("cases") ? (
        <CasesSection
          kind={activeKind}
          cases={activeCases}
          loading={loading}
          error={error}
          onCreate={() => setCreateKind(activeKind)}
          onSelect={(id) => {
            setSelected({ kind: activeKind, id });
            if (activeKind === "onboarding") setSearchParams({ case_id: id });
          }}
        />
      ) : null}
      {mode.includes("settings") ? <SettingsSection settings={settings} kind={activeKind} canManage={canManageLifecycleSettings} loading={loading} error={error} onSave={saveSettings} /> : null}
      {mode === "onboarding-alerts" ? <AlertsSection alerts={alerts} loading={loading} error={error} onRefresh={() => void refreshAlerts()} /> : null}
      {mode === "lifecycle-reports" ? <ReportsSection reportKey={reportKey} setReportKey={setReportKey} rows={reportRows} loading={loading} error={error} onExport={() => void exportReport()} /> : null}

      {createKind ? <CreateCaseModal kind={createKind} employees={employees} organizationRefs={organizationRefs} onClose={() => setCreateKind(null)} onCreated={() => { setCreateKind(null); void load(); }} /> : null}
      {selected ? (
        <CaseDetailModal
          kind={selected.kind}
          caseId={selected.id}
          onClose={() => {
            setSelected(null);
            if (searchParams.get("case_id")) setSearchParams({});
          }}
          onChanged={() => void load()}
          askReason={(titleText, submit) => setReasonAction({ title: titleText, submit })}
        />
      ) : null}
      {reasonAction ? <ReasonModal title={reasonAction.title} onClose={() => setReasonAction(null)} onSubmit={async (reason) => { await reasonAction.submit(reason); setReasonAction(null); }} /> : null}
    </PageShell>
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
                <TableCell><EmployeeIdentityCell employeeId={text(row.employee_id)} employeeName={text(row.employee_name ?? row.employee_name_snapshot)} employeeNumber={text(row.employee_no ?? row.employee_number_snapshot)} departmentName={text(row.department_name)} locationName={text(row.location_name ?? row.worksite_name)} size="sm" /></TableCell>
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
                <TableCell><EmployeeIdentityCell employeeId={row.employee_id} employeeName={row.employee_name ?? row.employee_name_snapshot ?? "-"} employeeNumber={row.employee_no ?? row.employee_number_snapshot} departmentName={row.department_name} locationName={row.location_name} size="sm" /></TableCell>
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

function SettingsSection({ settings, kind, canManage, loading, error, onSave }: { settings: LifecycleSettings | null; kind: CaseKind; canManage: boolean; loading: boolean; error: string | null; onSave: (input: LifecycleSettings) => Promise<void> }) {
  const [draft, setDraft] = useState<LifecycleSettings | null>(settings);
  useEffect(() => setDraft(settings), [settings]);
  const fields = kind === "onboarding" ? onboardingSettingFields : offboardingSettingFields;
  const enabledField = kind === "onboarding" ? "onboarding_enabled" : "offboarding_enabled";
  if (loading) return <DataTableFrame loading><div /></DataTableFrame>;
  if (error) return <DataTableFrame error={error}><div /></DataTableFrame>;
  if (!draft) return <Panel><EmptyState title="Settings unavailable" /></Panel>;
  const enabled = isEnabled(draft[enabledField]);
  return (
    <Panel className="space-y-4 p-4">
      <ModuleSettingsBody disabled={!enabled}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {fields.filter((field) => field !== enabledField).map((field) => (
            <CheckboxField
              key={field}
              label={title(field)}
              checked={isEnabled(draft[field])}
              disabled={!canManage || !enabled}
              onChange={(checked) => setDraft({ ...draft, [field]: checked ? 1 : 0 })}
            />
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <Button size="sm" disabled={!canManage || !enabled} onClick={() => void onSave(draft)}>Save settings</Button>
        </div>
      </ModuleSettingsBody>
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
          <TableBody>{alerts.map((row) => <TableRow key={String(row.id)}><TableCell><EmployeeIdentityCell employeeId={text(row.employee_id)} employeeName={text(row.employee_name)} employeeNumber={text(row.employee_no ?? row.employee_number_snapshot)} size="sm" /></TableCell><TableCell>{text(row.alert_type)}</TableCell><TableCell><Badge tone="warning">{text(row.severity)}</Badge></TableCell><TableCell><StatusBadge value={row.status} /></TableCell><TableCell>{text(row.created_at)}</TableCell></TableRow>)}</TableBody>
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
          <SelectField className="mt-1 h-9 w-full rounded-md border bg-white px-3 text-sm" value={reportKey} onChange={(event) => setReportKey(event.target.value)}>
            {reportKeys.map((key) => <option key={key} value={key}>{title(key)}</option>)}
          </SelectField>
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

function CreateCaseModal({ kind, employees, organizationRefs, onClose, onCreated }: { kind: CaseKind; employees: Employee[]; organizationRefs: ReturnType<typeof useOrganizationReferences>; onClose: () => void; onCreated: () => void }) {
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
        <EmployeeCascadeSelect employees={employees} departments={organizationRefs.departments} locations={organizationRefs.locations} jobLevels={organizationRefs.jobLevels} positions={organizationRefs.positions} value={employeeId} onChange={setEmployeeId} />
        {kind === "offboarding" ? (
          <>
            <div><Label>Exit type</Label><SelectField className="mt-1 h-9 w-full rounded-md border bg-white px-3 text-sm" value={exitType} onChange={(event) => setExitType(event.target.value)}>{["RESIGNED", "TERMINATED", "END_OF_CONTRACT", "ABSCONDED", "RETIRED", "DECEASED", "OTHER"].map((value) => <option key={value} value={value}>{title(value)}</option>)}</SelectField></div>
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
  const [workspace, setWorkspace] = useState<Row | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    if (!token) return;
    try {
      setError(null);
      if (kind === "onboarding") {
        const data = (await api.getOnboardingWorkspace(token, caseId)).workspace;
        setWorkspace(data);
        setDetail({ case: data.case as OnboardingCase, checklist: data.checklist as { tasks: LifecycleTask[] }, readiness: data.readiness as Row });
      } else {
        const data = await api.getOffboardingCase(token, caseId);
        const readiness = (await api.getOffboardingReadiness(token, caseId)).readiness;
        setWorkspace(null);
        setDetail({ case: data.case, checklist: data.checklist, readiness });
      }
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
        kind === "onboarding" && workspace ? (
          <OnboardingWorkspace
            workspace={workspace}
            caseId={caseId}
            reload={async () => {
              await load();
              onChanged();
            }}
            run={run}
            askReason={askReason}
          />
        ) : (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Info label="Case" value={detail.case.case_number} />
            <Info label="Status" value={"onboarding_status" in detail.case ? detail.case.onboarding_status : detail.case.offboarding_status} />
            <Info label="Readiness" value={"activation_status" in detail.case ? detail.case.activation_status : detail.case.finalization_status} />
          </div>
          <Timeline
            items={[
              { title: "Lifecycle case opened", description: detail.case.case_number, meta: text((detail.case as unknown as Row).created_at) },
              { title: "Current readiness", description: text("activation_status" in detail.case ? detail.case.activation_status : detail.case.finalization_status) },
              { title: "Current workflow status", description: text("onboarding_status" in detail.case ? detail.case.onboarding_status : detail.case.offboarding_status) }
            ]}
          />
          {kind === "onboarding" ? <ContractReadinessPanel contract={detail.readiness?.contract as Row | undefined} /> : null}
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
        )
      )}
    </Modal>
  );
}

const onboardingWorkspaceTabs = ["Overview", "Employee Info", "Contacts", "Job Assignment", "Documents", "Contract", "Payroll", "Payment & Pension", "Attendance & Roster", "Assets & Uniforms", "User Access", "Checklist", "Approval Timeline"] as const;
type OnboardingWorkspaceTab = (typeof onboardingWorkspaceTabs)[number];

type WorkspaceNotice = { tone: "success" | "danger"; message: string };

const onboardingWorkspaceSectionTasks: Record<OnboardingWorkspaceTab, string[]> = {
  Overview: [],
  "Employee Info": ["personal_info"],
  Contacts: ["contact_info"],
  "Job Assignment": ["job_assignment"],
  Documents: ["documents"],
  Contract: ["contract"],
  Payroll: ["payroll_profile"],
  "Payment & Pension": ["payment_method", "pension_profile"],
  "Attendance & Roster": ["attendance_biometric"],
  "Assets & Uniforms": ["assets_uniforms"],
  "User Access": ["user_access"],
  Checklist: [],
  "Approval Timeline": []
};

const completedOnboardingTaskStatuses = new Set(["COMPLETED", "WAIVED", "NOT_REQUIRED"]);

function asRow(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
}

function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? value as Row[] : [];
}

function isDisabledModule(workspace: Row, key: string) {
  const statuses = asRow(workspace.module_statuses);
  return statuses[key] === false;
}

function OnboardingWorkspace({ workspace, caseId, reload, run, askReason }: { workspace: Row; caseId: string; reload: () => Promise<void>; run: (action: () => Promise<unknown>) => Promise<void>; askReason: (title: string, submit: (reason: string) => Promise<void>) => void }) {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<OnboardingWorkspaceTab>("Overview");
  const [notice, setNotice] = useState<WorkspaceNotice | null>(null);
  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(null), 3600);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  async function save(action: () => Promise<unknown>, success: string) {
    if (!token) return;
    setNotice(null);
    try {
      await action();
      setNotice({ tone: "success", message: success });
      await reload();
    } catch (err) {
      setNotice({ tone: "danger", message: err instanceof ApiError ? err.message : "Unable to save onboarding workspace section." });
    }
  }
  async function runWorkspaceAction(action: () => Promise<unknown>, success: string) {
    if (!token) return;
    setNotice(null);
    try {
      await run(action);
      setNotice({ tone: "success", message: success });
    } catch (err) {
      setNotice({ tone: "danger", message: err instanceof ApiError ? err.message : "Unable to update onboarding case." });
    }
  }
  const rowCase = asRow(workspace.case);
  const employee = asRow(workspace.employee);
  const checklist = asRow(workspace.checklist);
  const readiness = asRow(workspace.readiness);
  const tasks = asRows(checklist.tasks);
  const blockers = asRows(readiness.blocking_items);
  const warnings = asRows(readiness.warning_items);
  const canActivate = readiness.can_activate === true;
  const requiredTasks = tasks.filter((task) => Boolean(task.is_required || task.required));
  const requiredComplete = requiredTasks.length > 0 && requiredTasks.every((task) => completedOnboardingTaskStatuses.has(String(task.task_status ?? task.status)));
  const taskByKey = new Map(tasks.map((task) => [String(task.task_key), task]));
  const sectionStatus = (tab: OnboardingWorkspaceTab) => {
    if (tab === "Overview") return canActivate;
    if (tab === "Checklist") return requiredComplete || canActivate;
    if (tab === "Approval Timeline") return ["SUBMITTED", "APPROVED", "ACTIVATED", "OVERRIDDEN"].includes(String(rowCase.activation_status ?? ""));
    const keys = onboardingWorkspaceSectionTasks[tab];
    if (!keys.length) return false;
    const existingTasks = keys.map((key) => taskByKey.get(key)).filter(Boolean) as Row[];
    return existingTasks.length > 0 && existingTasks.every((task) => completedOnboardingTaskStatuses.has(String(task.task_status ?? task.status)));
  };
  return (
    <div className="relative space-y-4">
      {notice ? <WorkspaceNoticePopup notice={notice} /> : null}
      <div className="rounded-lg border bg-slate-50/70 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold">{text(employee.full_name)}</h3>
              <StatusBadge value={rowCase.onboarding_status} />
              <StatusBadge value={rowCase.activation_status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{text(employee.employee_no)} / {text(employee.department_name)} / {text(employee.location_name)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Complete setup here before Employee 360 is unlocked after activation.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void save(() => api.refreshOnboardingWorkspaceChecklist(token!, caseId), "Checklist refreshed.")}>Refresh checklist</Button>
            <Button size="sm" variant="outline" onClick={() => void runWorkspaceAction(() => api.completeOnboardingWorkspace(token!, caseId), "Activation submitted.")}>Submit activation</Button>
            <Button size="sm" variant="outline" onClick={() => void runWorkspaceAction(() => api.approveOnboardingActivation(token!, caseId), "Activation approved.")}>Approve activation</Button>
            <Button
              size="sm"
              disabled={!canActivate}
              title={canActivate ? "Activate employee" : "Complete required onboarding items before activation."}
              className={canActivate ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700" : "border-slate-200 bg-slate-100 text-slate-500"}
              onClick={() => void runWorkspaceAction(() => api.activateOnboardingCase(token!, caseId), "Employee activated.")}
            >
              <CheckCircle2 className="h-4 w-4" /> Activate
            </Button>
            <Button size="sm" variant="danger" onClick={() => askReason("Activate with override", (reason) => runWorkspaceAction(() => api.activateOnboardingCaseWithOverride(token!, caseId, reason), "Employee activated with override."))}>Override activation</Button>
          </div>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-0 lg:max-h-[calc(90vh-11rem)] lg:overflow-y-auto">
          <nav aria-label="Onboarding setup sections" className="rounded-lg border bg-white p-2 shadow-panel">
            <div className="px-2 pb-2 pt-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Setup sections</p>
              <p className="mt-1 text-xs text-muted-foreground">{canActivate ? "Ready to activate" : "Complete required validator items"}</p>
            </div>
            <div className="space-y-1">
              {onboardingWorkspaceTabs.map((tab) => {
                const isActive = activeTab === tab;
                const complete = sectionStatus(tab);
                return (
                  <Button
                    key={tab}
                    variant="ghost"
                    size="sm"
                    aria-current={isActive ? "page" : undefined}
                    className={`w-full justify-start rounded-md px-2 text-left ${isActive ? "bg-primary/10 text-primary hover:bg-primary/15" : "text-slate-700"} ${complete ? "font-semibold" : ""}`}
                    onClick={() => setActiveTab(tab)}
                  >
                    {complete ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <Circle className="h-4 w-4 shrink-0 text-slate-300" />}
                    <span className="min-w-0 flex-1 truncate">{tab}</span>
                  </Button>
                );
              })}
            </div>
          </nav>
        </aside>
        <div className="min-w-0 space-y-4">
      {activeTab === "Overview" ? <OnboardingWorkspaceOverview readiness={readiness} blockers={blockers} warnings={warnings} tasks={tasks} workspace={workspace} /> : null}
      {activeTab === "Employee Info" ? <EmployeeInfoWorkspaceForm workspace={workspace} onSave={(input) => save(() => api.updateOnboardingWorkspaceEmployeeInfo(token!, caseId, input), "Employee information saved.")} /> : null}
      {activeTab === "Contacts" ? <ContactWorkspaceForm workspace={workspace} onSave={(input) => save(() => api.updateOnboardingWorkspaceContactInfo(token!, caseId, input), "Contact information saved.")} /> : null}
      {activeTab === "Job Assignment" ? <JobAssignmentWorkspaceForm workspace={workspace} onSave={(input) => save(() => api.updateOnboardingWorkspaceJobAssignment(token!, caseId, input), "Job assignment saved.")} /> : null}
      {activeTab === "Documents" ? <DocumentsWorkspaceForm workspace={workspace} onSave={(form) => save(() => api.uploadOnboardingWorkspaceDocument(token!, caseId, form), "Document uploaded.")} /> : null}
      {activeTab === "Contract" ? <ContractWorkspaceForm workspace={workspace} onSave={(input) => save(() => api.createOnboardingWorkspaceContract(token!, caseId, input), "Contract draft created.")} /> : null}
      {activeTab === "Payroll" ? <PayrollWorkspaceForm workspace={workspace} onSave={(input) => save(() => api.updateOnboardingWorkspacePayrollProfile(token!, caseId, input), "Payroll profile saved.")} /> : null}
      {activeTab === "Payment & Pension" ? <PaymentPensionWorkspaceForm workspace={workspace} onPaymentSave={(input) => save(() => api.createOnboardingWorkspacePaymentMethod(token!, caseId, input), "Payment method saved.")} onPensionSave={(input) => save(() => api.updateOnboardingWorkspacePensionProfile(token!, caseId, input), "Pension profile saved.")} /> : null}
      {activeTab === "Attendance & Roster" ? <AttendanceRosterWorkspaceForm workspace={workspace} onSave={(input) => save(() => api.createOnboardingWorkspaceBiometricMapping(token!, caseId, input), "Attendance/biometric setup saved.")} /> : null}
      {activeTab === "Assets & Uniforms" ? <AssetsWorkspaceForm workspace={workspace} onSave={(input) => save(() => api.saveOnboardingWorkspaceAssetsUniforms(token!, caseId, input), "Asset/uniform setup saved.")} /> : null}
      {activeTab === "User Access" ? <UserAccessWorkspaceForm workspace={workspace} onSave={(input) => save(() => api.saveOnboardingWorkspaceUserAccount(token!, caseId, input), "User access setup saved.")} /> : null}
      {activeTab === "Checklist" ? <ChecklistWorkspaceTable tasks={tasks} /> : null}
          {activeTab === "Approval Timeline" ? <Timeline items={asRows(workspace.events).map((event) => ({ title: text(event.action), description: text(event.new_status ?? event.note ?? event.reason), meta: text(event.created_at) }))} /> : null}
        </div>
      </div>
    </div>
  );
}

function WorkspaceNoticePopup({ notice }: { notice: WorkspaceNotice }) {
  const classes = notice.tone === "success"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : "border-red-200 bg-red-50 text-red-800";
  return (
    <div className={`fixed right-6 top-6 z-[60] w-[min(24rem,calc(100vw-3rem))] rounded-lg border px-4 py-3 text-sm shadow-lg ${classes}`} role={notice.tone === "danger" ? "alert" : "status"} aria-live="polite">
      <div className="flex items-start gap-2">
        {notice.tone === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />}
        <p className="min-w-0">{notice.message}</p>
      </div>
    </div>
  );
}

function OnboardingWorkspaceOverview({ readiness, blockers, warnings, tasks, workspace }: { readiness: Row; blockers: Row[]; warnings: Row[]; tasks: Row[]; workspace: Row }) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Panel className="p-3 lg:col-span-2">
        <h3 className="text-sm font-semibold">Activation readiness</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Info label="Can activate" value={readiness.can_activate ? "Yes" : "No"} />
          <Info label="Required tasks complete" value={asRow(readiness.checklist).required_completed ?? "-"} />
          <Info label="Required tasks" value={asRow(readiness.checklist).required_total ?? tasks.filter((task) => task.is_required || task.required).length} />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div><p className="text-xs font-medium text-muted-foreground">Blockers</p><List values={blockers} /></div>
          <div><p className="text-xs font-medium text-muted-foreground">Warnings</p><List values={warnings} /></div>
        </div>
      </Panel>
      <Panel className="p-3">
        <h3 className="text-sm font-semibold">Module readiness</h3>
        <div className="mt-3 space-y-2 text-sm">
          {Object.entries(asRow(workspace.module_statuses)).map(([key, value]) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <span>{title(key)}</span>
              <Badge tone={value === false ? "neutral" : "success"}>{value === false ? "Not required" : "Enabled"}</Badge>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function EmployeeInfoWorkspaceForm({ workspace, onSave }: { workspace: Row; onSave: (input: Row) => void }) {
  const employee = asRow(workspace.employee);
  const [form, setForm] = useState({
    full_name: text(employee.full_name),
    display_name: text(employee.display_name) === "-" ? "" : text(employee.display_name),
    gender: text(employee.gender) === "-" ? "" : text(employee.gender),
    date_of_birth: text(employee.date_of_birth) === "-" ? "" : text(employee.date_of_birth),
    nationality: text(employee.nationality) === "-" ? "" : text(employee.nationality),
    employee_type: text(employee.employee_type) === "-" ? "LOCAL" : text(employee.employee_type),
    employment_type: text(employee.employment_type) === "-" ? "FULL_TIME" : text(employee.employment_type),
    joining_date: text(employee.joining_date) === "-" ? "" : text(employee.joining_date),
    confirmation_date: text(employee.confirmation_date) === "-" ? "" : text(employee.confirmation_date),
    payroll_included: Boolean(employee.payroll_included),
    roster_eligible: Boolean(employee.roster_eligible),
    notes_summary: text(employee.notes_summary) === "-" ? "" : text(employee.notes_summary)
  });
  return (
    <Panel className="p-4">
      <h3 className="text-sm font-semibold">Basic employee information</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Field label="Full name"><Input value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></Field>
        <Field label="Display name"><Input value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} /></Field>
        <Field label="Employee number"><Input value={text(employee.employee_no)} disabled /></Field>
        <Field label="Gender"><Input value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value })} /></Field>
        <Field label="Date of birth"><Input type="date" value={form.date_of_birth} onChange={(event) => setForm({ ...form, date_of_birth: event.target.value })} /></Field>
        <Field label="Nationality"><Input value={form.nationality} onChange={(event) => setForm({ ...form, nationality: event.target.value })} /></Field>
        <SelectField label="Employee type" value={form.employee_type} onValueChange={(employee_type) => setForm({ ...form, employee_type })}>{["LOCAL", "FOREIGN", "OTHER"].map((value) => <option key={value} value={value}>{value}</option>)}</SelectField>
        <SelectField label="Employment type" value={form.employment_type} onValueChange={(employment_type) => setForm({ ...form, employment_type })}>{["FULL_TIME", "PART_TIME", "INTERN", "TEMPORARY", "CONTRACT"].map((value) => <option key={value} value={value}>{value}</option>)}</SelectField>
        <Field label="Joined date"><Input type="date" value={form.joining_date} onChange={(event) => setForm({ ...form, joining_date: event.target.value })} /></Field>
        <Field label="Confirmation date"><Input type="date" value={form.confirmation_date} onChange={(event) => setForm({ ...form, confirmation_date: event.target.value })} /></Field>
        <CheckboxField label="Payroll included" checked={form.payroll_included} onChange={(payroll_included) => setForm({ ...form, payroll_included })} />
        <CheckboxField label="Roster eligible" checked={form.roster_eligible} onChange={(roster_eligible) => setForm({ ...form, roster_eligible })} />
        <div className="md:col-span-3"><Field label="Notes"><Input value={form.notes_summary} onChange={(event) => setForm({ ...form, notes_summary: event.target.value })} /></Field></div>
      </div>
      <div className="mt-4 flex justify-end"><Button size="sm" onClick={() => onSave(form)}>Save employee info</Button></div>
    </Panel>
  );
}

function ContactWorkspaceForm({ workspace, onSave }: { workspace: Row; onSave: (input: Row) => void }) {
  const contacts = asRows(asRow(workspace.sections).contacts);
  const addresses = asRows(asRow(workspace.sections).addresses);
  const findContact = (type: string) => contacts.find((contact) => contact.contact_type === type);
  const currentAddress = addresses.find((address) => address.address_type === "CURRENT");
  const [form, setForm] = useState({
    phone: text(findContact("PERSONAL_PHONE")?.value) === "-" ? "" : text(findContact("PERSONAL_PHONE")?.value),
    personal_email: text(findContact("PERSONAL_EMAIL")?.value) === "-" ? "" : text(findContact("PERSONAL_EMAIL")?.value),
    emergency_contact_value: text(findContact("EMERGENCY")?.value) === "-" ? "" : text(findContact("EMERGENCY")?.value),
    emergency_relationship: text(findContact("EMERGENCY")?.relationship) === "-" ? "" : text(findContact("EMERGENCY")?.relationship),
    address_line: text(currentAddress?.address_line) === "-" ? "" : text(currentAddress?.address_line),
    island_city: text(currentAddress?.island_city) === "-" ? "" : text(currentAddress?.island_city),
    country: text(currentAddress?.country) === "-" ? "" : text(currentAddress?.country)
  });
  return (
    <Panel className="p-4">
      <h3 className="text-sm font-semibold">Contact information</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Field label="Phone"><Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
        <Field label="Personal email"><Input type="email" value={form.personal_email} onChange={(event) => setForm({ ...form, personal_email: event.target.value })} /></Field>
        <Field label="Emergency contact"><Input value={form.emergency_contact_value} onChange={(event) => setForm({ ...form, emergency_contact_value: event.target.value })} /></Field>
        <Field label="Emergency relationship"><Input value={form.emergency_relationship} onChange={(event) => setForm({ ...form, emergency_relationship: event.target.value })} /></Field>
        <Field label="Address"><Input value={form.address_line} onChange={(event) => setForm({ ...form, address_line: event.target.value })} /></Field>
        <Field label="Island / city"><Input value={form.island_city} onChange={(event) => setForm({ ...form, island_city: event.target.value })} /></Field>
        <Field label="Country"><Input value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} /></Field>
      </div>
      <div className="mt-4 flex justify-end"><Button size="sm" onClick={() => onSave(form)}>Save contacts</Button></div>
    </Panel>
  );
}

function JobAssignmentWorkspaceForm({ workspace, onSave }: { workspace: Row; onSave: (input: Row) => void }) {
  const employee = asRow(workspace.employee);
  const refs = asRow(workspace.refs);
  const [form, setForm] = useState({
    primary_location_id: text(employee.primary_location_id) === "-" ? "" : text(employee.primary_location_id),
    primary_department_id: text(employee.primary_department_id) === "-" ? "" : text(employee.primary_department_id),
    job_level_id: text(employee.job_level_id) === "-" ? "" : text(employee.job_level_id),
    primary_position_id: text(employee.primary_position_id) === "-" ? "" : text(employee.primary_position_id),
    reporting_manager_employee_id: text(employee.reporting_manager_employee_id) === "-" ? "" : text(employee.reporting_manager_employee_id),
    employment_type: text(employee.employment_type) === "-" ? "FULL_TIME" : text(employee.employment_type),
    employee_type: text(employee.employee_type) === "-" ? "LOCAL" : text(employee.employee_type)
  });
  return (
    <Panel className="p-4">
      <h3 className="text-sm font-semibold">Job assignment</h3>
      <p className="mt-1 text-xs text-muted-foreground">Uses the existing Department &rarr; Job Level &rarr; Position cascading validation.</p>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <div className="md:col-span-3">
          <OrganizationCascadeSelector
            includeLocation
            departments={asRows(refs.departments) as unknown as OrganizationDepartment[]}
            locations={asRows(refs.locations) as unknown as OrganizationLocation[]}
            jobLevels={asRows(refs.job_levels) as unknown as OrganizationJobLevel[]}
            positions={asRows(refs.positions) as unknown as OrganizationPosition[]}
            value={{ locationId: form.primary_location_id, departmentId: form.primary_department_id, jobLevelId: form.job_level_id, positionId: form.primary_position_id }}
            labels={{ locationId: "Worksite/location", departmentId: "Department", jobLevelId: "Job level", positionId: "Position/designation" }}
            onChange={(next) => setForm({ ...form, primary_location_id: next.locationId ?? "", primary_department_id: next.departmentId ?? "", job_level_id: next.jobLevelId ?? "", primary_position_id: next.positionId ?? "" })}
          />
        </div>
        <SelectField label="Reporting manager" value={form.reporting_manager_employee_id} onValueChange={(reporting_manager_employee_id) => setForm({ ...form, reporting_manager_employee_id })}><option value="">None</option>{asRows(refs.reporting_managers).map((manager) => <option key={String(manager.id)} value={String(manager.id)}>{text(manager.full_name)} ({text(manager.employee_no)})</option>)}</SelectField>
        <SelectField label="Employee type" value={form.employee_type} onValueChange={(employee_type) => setForm({ ...form, employee_type })}>{["LOCAL", "FOREIGN", "OTHER"].map((value) => <option key={value} value={value}>{value}</option>)}</SelectField>
        <SelectField label="Employment type" value={form.employment_type} onValueChange={(employment_type) => setForm({ ...form, employment_type })}>{["FULL_TIME", "PART_TIME", "INTERN", "TEMPORARY", "CONTRACT"].map((value) => <option key={value} value={value}>{value}</option>)}</SelectField>
      </div>
      <div className="mt-4 flex justify-end"><Button size="sm" onClick={() => onSave(form)}>Save job assignment</Button></div>
    </Panel>
  );
}

function DocumentsWorkspaceForm({ workspace, onSave }: { workspace: Row; onSave: (form: FormData) => void }) {
  const refs = asRow(workspace.refs);
  const sections = asRow(workspace.sections);
  const documentTypes = asRows(refs.document_types);
  const documents = asRow(sections.documents);
  const documentWarning = typeof sections.document_type_warning === "string" ? sections.document_type_warning : "";
  const [documentTypeId, setDocumentTypeId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState({ document_number: "", issue_date: "", expiry_date: "", notes: "" });
  const selectedType = documentTypes.find((type) => String(type.id) === documentTypeId);
  const requiredNumber = Boolean(selectedType?.requires_document_number || selectedType?.document_number_required);
  const requiredIssue = Boolean(selectedType?.requires_issue_date || selectedType?.issue_date_required);
  const requiredExpiry = Boolean(selectedType?.requires_expiry_date || selectedType?.expiry_required);
  function submit() {
    const form = new FormData();
    form.set("document_type_id", documentTypeId);
    if (file) form.set("file", file);
    form.set("document_number", metadata.document_number);
    form.set("issue_date", metadata.issue_date);
    form.set("expiry_date", metadata.expiry_date);
    form.set("notes", metadata.notes);
    onSave(form);
  }
  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_1.2fr]">
      <Panel className="p-4">
        <h3 className="text-sm font-semibold">Upload official document</h3>
        {documentWarning ? <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{documentWarning}</p> : null}
        <div className="mt-3 grid gap-3">
          <SelectField label="Document type" required value={documentTypeId} onValueChange={setDocumentTypeId}><option value="">Select document type</option>{documentTypes.map((type) => <option key={String(type.id)} value={String(type.id)}>{text(type.name)}{type.is_sensitive ? " (Sensitive)" : ""}</option>)}</SelectField>
          {selectedType ? <p className="text-xs text-muted-foreground">Allowed files: {displayText(selectedType.allowed_mime_types, "Default PDF/JPEG/PNG")} / Max size: {displayText(selectedType.max_file_size_mb, "10")} MB / Multiple: {selectedType.allow_multiple_files ? "Yes" : "No"}</p> : null}
          <Field label={`Document number${requiredNumber ? " *" : ""}`}><Input required={requiredNumber} value={metadata.document_number} onChange={(event) => setMetadata({ ...metadata, document_number: event.target.value })} /></Field>
          <Field label={`Issue date${requiredIssue ? " *" : ""}`}><Input type="date" required={requiredIssue} value={metadata.issue_date} onChange={(event) => setMetadata({ ...metadata, issue_date: event.target.value })} /></Field>
          <Field label={`Expiry date${requiredExpiry ? " *" : ""}`}><Input type="date" required={requiredExpiry} value={metadata.expiry_date} onChange={(event) => setMetadata({ ...metadata, expiry_date: event.target.value })} /></Field>
          <Field label="Notes"><Input value={metadata.notes} onChange={(event) => setMetadata({ ...metadata, notes: event.target.value })} /></Field>
          <Field label="File"><Input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></Field>
        </div>
        <div className="mt-4 flex justify-end"><Button size="sm" disabled={!documentTypeId || !file} onClick={submit}>Upload document</Button></div>
      </Panel>
      <Panel className="p-4">
        <h3 className="text-sm font-semibold">Required document checklist</h3>
        <DataTableFrame empty={asRows(documents.rows).length === 0}>
          <Table>
            <TableHeader><TableRow><TableHead>Document</TableHead><TableHead>Status</TableHead><TableHead>Uploaded</TableHead><TableHead>Expiry</TableHead></TableRow></TableHeader>
            <TableBody>{asRows(documents.rows).map((row) => <TableRow key={String(row.document_type_id ?? row.id)}><TableCell>{text(row.document_type_name)}</TableCell><TableCell><StatusBadge value={row.requirement_status ?? row.compliance_status} /></TableCell><TableCell>{row.missing ? "Missing" : "Uploaded"}</TableCell><TableCell>{text(row.expiry_date)}</TableCell></TableRow>)}</TableBody>
          </Table>
        </DataTableFrame>
      </Panel>
    </div>
  );
}

function ContractWorkspaceForm({ workspace, onSave }: { workspace: Row; onSave: (input: Row) => void }) {
  if (isDisabledModule(workspace, "contracts")) return <Panel className="p-4"><EmptyState title="Contract not required" description="The Contracts module is disabled, so onboarding will not block on contract setup." /></Panel>;
  const refs = asRow(workspace.refs);
  const types = asRows(refs.contract_types);
  const [form, setForm] = useState({ contract_type_id: "", contract_number: "", contract_title: "", contract_start_date: "", contract_end_date: "", probation_start_date: "", probation_end_date: "", confirmation_due_date: "", notes: "" });
  const selectedType = types.find((type) => String(type.id) === form.contract_type_id);
  const requiresEnd = Boolean(selectedType?.requires_end_date);
  const requiresProbation = Boolean(selectedType?.requires_probation);
  return (
    <Panel className="p-4">
      <h3 className="text-sm font-semibold">Contract setup</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <SelectField required label="Contract type" value={form.contract_type_id} onValueChange={(contract_type_id) => setForm({ ...form, contract_type_id })}><option value="">Select type</option>{types.map((type) => <option key={String(type.id)} value={String(type.id)}>{text(type.name)}</option>)}</SelectField>
        <Field label="Contract number"><Input value={form.contract_number} onChange={(event) => setForm({ ...form, contract_number: event.target.value })} placeholder="Auto if blank" /></Field>
        <Field label="Title"><Input value={form.contract_title} onChange={(event) => setForm({ ...form, contract_title: event.target.value })} /></Field>
        <Field label="Start date *"><Input type="date" required value={form.contract_start_date} onChange={(event) => setForm({ ...form, contract_start_date: event.target.value })} /></Field>
        <Field label={`End date${requiresEnd ? " *" : ""}`}><Input type="date" required={requiresEnd} value={form.contract_end_date} onChange={(event) => setForm({ ...form, contract_end_date: event.target.value })} />{!requiresEnd ? <p className="text-xs text-muted-foreground">End date is optional for this contract type.</p> : null}</Field>
        <Field label={`Probation start${requiresProbation ? " *" : ""}`}><Input type="date" required={requiresProbation} value={form.probation_start_date} onChange={(event) => setForm({ ...form, probation_start_date: event.target.value })} /></Field>
        <Field label={`Probation end${requiresProbation ? " *" : ""}`}><Input type="date" required={requiresProbation} value={form.probation_end_date} onChange={(event) => setForm({ ...form, probation_end_date: event.target.value })} /></Field>
        <Field label="Confirmation due"><Input type="date" value={form.confirmation_due_date} onChange={(event) => setForm({ ...form, confirmation_due_date: event.target.value })} /></Field>
        <Field label="Notes"><Input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field>
      </div>
      <div className="mt-4 flex justify-end"><Button size="sm" disabled={!form.contract_type_id || !form.contract_start_date} onClick={() => onSave(form)}>Create contract draft</Button></div>
    </Panel>
  );
}

function PayrollWorkspaceForm({ workspace, onSave }: { workspace: Row; onSave: (input: Row) => void }) {
  if (isDisabledModule(workspace, "payroll")) return <Panel className="p-4"><EmptyState title="Payroll not required" description="Payroll module is disabled, so onboarding will not block on payroll setup." /></Panel>;
  const profile = asRow(asRow(workspace.sections).payroll_profile);
  const [form, setForm] = useState({
    basic_salary: text(profile.basic_salary) === "-" ? "0" : text(profile.basic_salary),
    currency: text(profile.currency) === "-" ? "MVR" : text(profile.currency),
    payment_method: text(profile.payment_method) === "-" ? "CASH" : text(profile.payment_method),
    payroll_included: profile.payroll_included !== 0,
    overtime_eligible: Boolean(profile.overtime_eligible),
    benefits_eligible: Boolean(profile.benefits_eligible),
    advance_eligible: Boolean(profile.advance_eligible),
    missed_day_deduction_enabled: profile.missed_day_deduction_enabled !== 0,
    leave_deduction_enabled: profile.leave_deduction_enabled !== 0,
    daily_rate_mode: text(profile.daily_rate_mode) === "-" ? "FIXED_30_DAYS" : text(profile.daily_rate_mode)
  });
  return (
    <Panel className="p-4">
      <h3 className="text-sm font-semibold">Payroll profile</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Field label="Basic salary"><Input type="number" min="0" value={form.basic_salary} onChange={(event) => setForm({ ...form, basic_salary: event.target.value })} /></Field>
        <Field label="Currency"><Input value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })} /></Field>
        <SelectField label="Payroll payment mode" value={form.payment_method} onValueChange={(payment_method) => setForm({ ...form, payment_method })}>{["CASH", "BANK_TRANSFER", "CHEQUE", "OTHER"].map((value) => <option key={value} value={value}>{title(value)}</option>)}</SelectField>
        <SelectField label="Daily rate mode" value={form.daily_rate_mode} onValueChange={(daily_rate_mode) => setForm({ ...form, daily_rate_mode })}>{["FIXED_30_DAYS", "CALENDAR_DAYS", "WORKING_DAYS"].map((value) => <option key={value} value={value}>{title(value)}</option>)}</SelectField>
        <CheckboxField label="Payroll included" checked={form.payroll_included} onChange={(payroll_included) => setForm({ ...form, payroll_included })} />
        <CheckboxField label="Overtime eligible" checked={form.overtime_eligible} onChange={(overtime_eligible) => setForm({ ...form, overtime_eligible })} />
        <CheckboxField label="Benefits eligible" checked={form.benefits_eligible} onChange={(benefits_eligible) => setForm({ ...form, benefits_eligible })} />
        <CheckboxField label="Advance eligible" checked={form.advance_eligible} onChange={(advance_eligible) => setForm({ ...form, advance_eligible })} />
        <CheckboxField label="Missed-day deduction" checked={form.missed_day_deduction_enabled} onChange={(missed_day_deduction_enabled) => setForm({ ...form, missed_day_deduction_enabled })} />
        <CheckboxField label="Leave deduction" checked={form.leave_deduction_enabled} onChange={(leave_deduction_enabled) => setForm({ ...form, leave_deduction_enabled })} />
      </div>
      <div className="mt-4 flex justify-end"><Button size="sm" onClick={() => onSave({ ...form, basic_salary: Number(form.basic_salary) })}>Save payroll profile</Button></div>
    </Panel>
  );
}

function PaymentPensionWorkspaceForm({ workspace, onPaymentSave, onPensionSave }: { workspace: Row; onPaymentSave: (input: Row) => void; onPensionSave: (input: Row) => void }) {
  const refs = asRow(workspace.refs);
  const sections = asRow(workspace.sections);
  const [payment, setPayment] = useState({ payment_method_type: "CASH", payment_institution_id: "", bank_account_name: "", bank_account_number: "", currency: "MVR", is_primary: true, notes: "" });
  const pensionProfile = asRow(sections.pension_profile);
  const [pension, setPension] = useState({ pension_scheme_id: text(pensionProfile.pension_scheme_id) === "-" ? "" : text(pensionProfile.pension_scheme_id), enrollment_status: text(pensionProfile.enrollment_status) === "-" ? "ENROLLED" : text(pensionProfile.enrollment_status), pension_member_id: "", registration_number: "", effective_date: new Date().toISOString().slice(0, 10), notes: "" });
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel className="p-4">
        <h3 className="text-sm font-semibold">Payment method</h3>
        {isDisabledModule(workspace, "payment_methods") ? <EmptyState title="Payment method not required" description="Payment methods are disabled." /> : (
          <>
            <div className="mt-3 grid gap-3">
              <SelectField label="Method" value={payment.payment_method_type} onValueChange={(payment_method_type) => setPayment({ ...payment, payment_method_type })}>{["CASH", "BANK_TRANSFER", "CHEQUE_PLACEHOLDER", "MOBILE_WALLET_PLACEHOLDER", "OTHER"].map((value) => <option key={value} value={value}>{title(value)}</option>)}</SelectField>
              <SelectField label="Payment institution" value={payment.payment_institution_id} onValueChange={(payment_institution_id) => setPayment({ ...payment, payment_institution_id })}><option value="">None</option>{asRows(refs.payment_institutions).map((institution) => <option key={String(institution.id)} value={String(institution.id)}>{text(institution.name)}</option>)}</SelectField>
              <Field label="Account name"><Input value={payment.bank_account_name} onChange={(event) => setPayment({ ...payment, bank_account_name: event.target.value })} /></Field>
              <Field label="Account number"><Input value={payment.bank_account_number} onChange={(event) => setPayment({ ...payment, bank_account_number: event.target.value })} /></Field>
              <Field label="Currency"><Input value={payment.currency} onChange={(event) => setPayment({ ...payment, currency: event.target.value })} /></Field>
            </div>
            <div className="mt-4 flex justify-end"><Button size="sm" onClick={() => onPaymentSave(payment)}>Save payment method</Button></div>
          </>
        )}
      </Panel>
      <Panel className="p-4">
        <h3 className="text-sm font-semibold">Pension profile</h3>
        {isDisabledModule(workspace, "pension") ? <EmptyState title="Pension not required" description="Pension module is disabled." /> : (
          <>
            <div className="mt-3 grid gap-3">
              <SelectField label="Pension scheme" value={pension.pension_scheme_id} onValueChange={(pension_scheme_id) => setPension({ ...pension, pension_scheme_id })}><option value="">None / exempted</option>{asRows(refs.pension_schemes).map((scheme) => <option key={String(scheme.id)} value={String(scheme.id)}>{text(scheme.scheme_name)}</option>)}</SelectField>
              <SelectField label="Enrollment status" value={pension.enrollment_status} onValueChange={(enrollment_status) => setPension({ ...pension, enrollment_status })}>{["ENROLLED", "EXEMPTED", "VOLUNTARY", "NOT_ENROLLED", "SUSPENDED"].map((value) => <option key={value} value={value}>{title(value)}</option>)}</SelectField>
              <Field label="Member ID"><Input value={pension.pension_member_id} onChange={(event) => setPension({ ...pension, pension_member_id: event.target.value })} /></Field>
              <Field label="Registration number"><Input value={pension.registration_number} onChange={(event) => setPension({ ...pension, registration_number: event.target.value })} /></Field>
              <Field label="Effective date"><Input type="date" value={pension.effective_date} onChange={(event) => setPension({ ...pension, effective_date: event.target.value })} /></Field>
            </div>
            <div className="mt-4 flex justify-end"><Button size="sm" onClick={() => onPensionSave(pension)}>Save pension profile</Button></div>
          </>
        )}
      </Panel>
    </div>
  );
}

function AttendanceRosterWorkspaceForm({ workspace, onSave }: { workspace: Row; onSave: (input: Row) => void }) {
  const employee = asRow(workspace.employee);
  const [form, setForm] = useState({ biometric_user_id: "", biometric_user_name: "", external_employee_code: text(employee.employee_no), not_required: false, reason: "" });
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Panel className="p-4">
        <h3 className="text-sm font-semibold">Attendance / biometric</h3>
        {isDisabledModule(workspace, "attendance") ? <EmptyState title="Attendance not required" description="Attendance module is disabled." /> : (
          <div className="mt-3 grid gap-3">
            <Field label="Biometric user ID"><Input value={form.biometric_user_id} onChange={(event) => setForm({ ...form, biometric_user_id: event.target.value })} /></Field>
            <Field label="Biometric user name"><Input value={form.biometric_user_name} onChange={(event) => setForm({ ...form, biometric_user_name: event.target.value })} /></Field>
            <Field label="External employee code"><Input value={form.external_employee_code} onChange={(event) => setForm({ ...form, external_employee_code: event.target.value })} /></Field>
            <CheckboxField label="Biometric mapping not required" checked={form.not_required} onChange={(not_required) => setForm({ ...form, not_required })} />
            {form.not_required ? <Field label="Reason"><Input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></Field> : null}
            <div className="flex justify-end"><Button size="sm" onClick={() => onSave(form)}>Save attendance setup</Button></div>
          </div>
        )}
      </Panel>
      <Panel className="p-4">
        <h3 className="text-sm font-semibold">Roster readiness</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Info label="Roster eligible" value={employee.roster_eligible ? "Yes" : "No"} />
          <Info label="Worksite/location" value={employee.location_name ?? "Not set"} />
        </div>
        <p className="mt-3 text-sm text-muted-foreground">Roster assignment remains managed by the roster module after worksite and roster eligibility are ready.</p>
      </Panel>
    </div>
  );
}

function AssetsWorkspaceForm({ workspace, onSave }: { workspace: Row; onSave: (input: Row) => void }) {
  const refs = asRow(workspace.refs);
  const [form, setForm] = useState({ asset_item_id: "", issued_date: new Date().toISOString().slice(0, 10), expected_return_date: "", notes: "", not_required: false, waived: false, reason: "" });
  if (isDisabledModule(workspace, "assets_uniforms")) return <Panel className="p-4"><EmptyState title="Assets/uniforms not required" description="Assets and uniforms module is disabled." /></Panel>;
  return (
    <Panel className="p-4">
      <h3 className="text-sm font-semibold">Assets and uniforms</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <SelectField label="Available asset/uniform" value={form.asset_item_id} onValueChange={(asset_item_id) => setForm({ ...form, asset_item_id })}><option value="">Select asset or mark not required</option>{asRows(refs.available_assets).map((asset) => <option key={String(asset.id)} value={String(asset.id)}>{text(asset.name)} ({text(asset.code)})</option>)}</SelectField>
        <Field label="Issued date"><Input type="date" value={form.issued_date} onChange={(event) => setForm({ ...form, issued_date: event.target.value })} /></Field>
        <Field label="Expected return"><Input type="date" value={form.expected_return_date} onChange={(event) => setForm({ ...form, expected_return_date: event.target.value })} /></Field>
        <CheckboxField label="Not required" checked={form.not_required} onChange={(not_required) => setForm({ ...form, not_required })} />
        <CheckboxField label="Waived" checked={form.waived} onChange={(waived) => setForm({ ...form, waived })} />
        {(form.not_required || form.waived) ? <Field label="Reason"><Input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></Field> : null}
        <div className="md:col-span-3"><Field label="Notes"><Input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field></div>
      </div>
      <div className="mt-4 flex justify-end"><Button size="sm" onClick={() => onSave(form)}>Save assets/uniforms</Button></div>
    </Panel>
  );
}

function UserAccessWorkspaceForm({ workspace, onSave }: { workspace: Row; onSave: (input: Row) => void }) {
  const linked = asRow(asRow(workspace.sections).linked_user);
  const [form, setForm] = useState({ deferred: true, not_required: false, reason: "User access will be handled after activation or by Employee 360 user access." });
  return (
    <Panel className="p-4">
      <h3 className="text-sm font-semibold">User account / self-service access</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Info label="Linked account" value={linked.id ? `${text(linked.name)} (${text(linked.email)})` : "Not linked"} />
        <Info label="User status" value={linked.status ?? "Pending"} />
        <Info label="Last login" value={linked.last_login_at ?? "Not set"} />
        <CheckboxField label="Defer login setup" checked={form.deferred} onChange={(deferred) => setForm({ ...form, deferred })} />
        <CheckboxField label="Login not required" checked={form.not_required} onChange={(not_required) => setForm({ ...form, not_required })} />
        <Field label="Reason / note"><Input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></Field>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">Role mapping and access scopes remain the source of truth. Linked account creation can still be completed from the existing Employee User Access tools.</p>
      <div className="mt-4 flex justify-end"><Button size="sm" onClick={() => onSave(form)}>Save user access status</Button></div>
    </Panel>
  );
}

function ChecklistWorkspaceTable({ tasks }: { tasks: Row[] }) {
  return (
    <DataTableFrame empty={tasks.length === 0}>
      <Table>
        <TableHeader><TableRow><TableHead>Task</TableHead><TableHead>Group</TableHead><TableHead>Status</TableHead><TableHead>Required</TableHead><TableHead>Notes</TableHead></TableRow></TableHeader>
        <TableBody>
          {tasks.map((task) => <TableRow key={String(task.id)}><TableCell>{text(task.task_name ?? task.title ?? task.task_key)}</TableCell><TableCell>{text(task.task_group)}</TableCell><TableCell><StatusBadge value={task.task_status ?? task.status} /></TableCell><TableCell>{task.is_required || task.required ? "Yes" : "No"}</TableCell><TableCell>{text(task.notes ?? task.waiver_reason ?? task.blocked_reason)}</TableCell></TableRow>)}
        </TableBody>
      </Table>
    </DataTableFrame>
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function ContractReadinessPanel({ contract }: { contract?: Row }) {
  const display = (contract?.display ?? {}) as Row;
  const warnings = Array.isArray(contract?.warnings) ? contract.warnings : [];
  const blockers = Array.isArray(contract?.blockers) ? contract.blockers : [];
  return (
    <Panel className="p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold">Contract readiness</h3>
          <p className="text-xs text-muted-foreground">Permanent contracts can leave end dates blank unless the selected contract type requires one.</p>
        </div>
        <Badge tone={contract?.ready ? "success" : contract?.required ? "warning" : "neutral"}>{displayText(contract?.status_label, "Not required")}</Badge>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Info label="Contract" value={display.contract ?? (contract?.required ? "Contract missing" : "Not required")} />
        <Info label="Contract Type" value={display.contract_type ?? "Not selected"} />
        <Info label="Contract Start Date" value={display.contract_start_date ?? "Not set"} />
        <Info label="Contract End Date" value={display.contract_end_date ?? "Not required"} />
        <Info label="Probation" value={display.probation ?? "Not applicable"} />
        <Info label="Confirmation Due" value={display.confirmation_due ?? "Not set"} />
      </div>
      {blockers.length || warnings.length ? (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div><p className="text-xs font-medium text-muted-foreground">Contract blockers</p><List values={blockers} /></div>
          <div><p className="text-xs font-medium text-muted-foreground">Contract warnings</p><List values={warnings} /></div>
        </div>
      ) : null}
    </Panel>
  );
}

function List({ values }: { values: unknown[] }) {
  if (!values.length) return <p className="mt-2 text-sm text-muted-foreground">None.</p>;
  return <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">{values.map((value, index) => <li key={index}>{objectMessage(value)}</li>)}</ul>;
}
