import { useEffect, useState, type ReactNode } from "react";
import { Banknote, Building2, CalendarCheck, CalendarDays, ClipboardList, FileClock, FileSearch, FileText, ShieldCheck, Shirt, SlidersHorizontal, Users } from "lucide-react";
import { NavLink } from "react-router-dom";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { PageHeader, PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { Switch } from "../components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Tooltip } from "../components/ui/tooltip";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { cn } from "../lib/utils";

type SettingsRecord = Record<string, unknown>;
type SettingsKey = "attendance" | "attendanceDevices" | "roster" | "payroll" | "finalSettlement" | "assets" | "documentCompliance" | "contracts" | "approvals" | "onboarding" | "offboarding" | "selfService";
type SettingsMap = Partial<Record<SettingsKey, SettingsRecord | null>>;

type ToggleDefinition = {
  section: SettingsKey;
  keyName: string;
  label: string;
  description: string;
  managePermissions: string[];
  defaultEnabled?: boolean;
};

const settingsRows = [
  { key: "bootstrap.completed", scope: "System", status: "Protected" },
  { key: "documents.storage", scope: "Prepared", status: "Pending R2 bucket" },
  { key: "security.jwt", scope: "Environment", status: "Required" }
];

const SETTINGS_LOADERS: Array<{ key: SettingsKey; load: (token: string) => Promise<SettingsRecord> }> = [
  { key: "attendance", load: (token) => api.getAttendanceSettings(token).then((result) => result.settings as unknown as SettingsRecord) },
  { key: "attendanceDevices", load: (token) => api.getAttendanceDeviceSettings(token).then((result) => result.settings as unknown as SettingsRecord) },
  { key: "roster", load: (token) => api.getRosterSettings(token).then((result) => result.settings as unknown as SettingsRecord) },
  { key: "payroll", load: (token) => api.getPayrollSettings(token).then((result) => result.settings as unknown as SettingsRecord) },
  { key: "finalSettlement", load: (token) => api.getFinalSettlementSettings(token).then((result) => result.settings as unknown as SettingsRecord) },
  { key: "assets", load: (token) => api.getAssetUniformSettings(token).then((result) => result.settings as unknown as SettingsRecord) },
  { key: "documentCompliance", load: (token) => api.getDocumentComplianceSettings(token).then((result) => result.settings as unknown as SettingsRecord) },
  { key: "contracts", load: (token) => api.getContractSettings(token).then((result) => result.settings as SettingsRecord) },
  { key: "approvals", load: (token) => api.getApprovalSettings(token).then((result) => result.settings as unknown as SettingsRecord) },
  { key: "onboarding", load: (token) => api.getOnboardingSettings(token).then((result) => result.settings as unknown as SettingsRecord) },
  { key: "offboarding", load: (token) => api.getOffboardingSettings(token).then((result) => result.settings as unknown as SettingsRecord) },
  { key: "selfService", load: (token) => api.getSelfServiceSettings(token).then((result) => result.settings as SettingsRecord) }
];

const MANAGE_SETTINGS = ["settings.manage"];

function isEnabled(settings: SettingsRecord | null | undefined, keyName: string, fallback = true) {
  const value = settings?.[keyName];
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  return value === "1" || value === "true" || value === "TRUE";
}

function boolPayload(value: boolean) {
  return value ? 1 : 0;
}

export function SettingsPage() {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const [settings, setSettings] = useState<SettingsMap>({});
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const authToken = token;
    let cancelled = false;
    async function loadSettings() {
      setLoading(true);
      const results = await Promise.allSettled(SETTINGS_LOADERS.map(async (loader) => [loader.key, await loader.load(authToken)] as const));
      if (cancelled) return;
      const next: SettingsMap = {};
      for (const result of results) {
        if (result.status === "fulfilled") {
          next[result.value[0]] = result.value[1];
        }
      }
      setSettings(next);
      setLoading(false);
    }
    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, [token]);

  function canManage(keys: string[]) {
    return [...MANAGE_SETTINGS, ...keys].some((permission) => permissions.has(permission));
  }

  async function saveToggle(toggle: ToggleDefinition, nextEnabled: boolean) {
    if (!token || !canManage(toggle.managePermissions)) return;
    const current = settings[toggle.section] ?? {};
    const next = { ...current, [toggle.keyName]: boolPayload(nextEnabled) };
    const oldSettings = settings[toggle.section] ?? null;
    setSettings((previous) => ({ ...previous, [toggle.section]: next }));
    setSavingKey(`${toggle.section}.${toggle.keyName}`);
    setMessage(null);

    try {
      let saved: SettingsRecord;
      switch (toggle.section) {
        case "attendance":
          saved = (await api.updateAttendanceSettings(token, next as never)).settings as unknown as SettingsRecord;
          break;
        case "attendanceDevices":
          saved = (await api.updateAttendanceDeviceSettings(token, next as never)).settings as unknown as SettingsRecord;
          break;
        case "roster":
          saved = (await api.updateRosterSettings(token, next as never)).settings as unknown as SettingsRecord;
          break;
        case "payroll":
          saved = (await api.updatePayrollSettings(token, next as never)).settings as unknown as SettingsRecord;
          break;
        case "finalSettlement":
          saved = (await api.updateFinalSettlementSettings(token, next as never)).settings as unknown as SettingsRecord;
          break;
        case "assets":
          saved = (await api.updateAssetUniformSettings(token, next as never)).settings as unknown as SettingsRecord;
          break;
        case "documentCompliance":
          saved = (await api.updateDocumentComplianceSettings(token, next as never)).settings as unknown as SettingsRecord;
          break;
        case "contracts":
          saved = (await api.updateContractSettings(token, next)).settings as SettingsRecord;
          break;
        case "approvals":
          saved = (await api.updateApprovalSettings(token, next as never)).settings as unknown as SettingsRecord;
          break;
        case "onboarding":
          saved = (await api.updateOnboardingSettings(token, next as never)).settings as unknown as SettingsRecord;
          break;
        case "offboarding":
          saved = (await api.updateOffboardingSettings(token, next as never)).settings as unknown as SettingsRecord;
          break;
        case "selfService":
          saved = (await api.updateSelfServiceSettings(token, next)).settings as SettingsRecord;
          break;
      }
      setSettings((previous) => ({ ...previous, [toggle.section]: saved }));
      setMessage(`${toggle.label} ${nextEnabled ? "enabled" : "disabled"}.`);
    } catch (error) {
      setSettings((previous) => ({ ...previous, [toggle.section]: oldSettings }));
      setMessage(error instanceof Error ? error.message : `Unable to update ${toggle.label}.`);
    } finally {
      setSavingKey(null);
    }
  }

  const attendanceMain: ToggleDefinition = {
    section: "attendance",
    keyName: "module_enabled",
    label: "Attendance",
    description: "Controls attendance records, calendar, corrections, manual entries, reports, and payroll-impact review.",
    managePermissions: ["attendance.settings.manage", "attendance.settings.update"]
  };
  const rosterMain: ToggleDefinition = {
    section: "roster",
    keyName: "module_enabled",
    label: "Roster",
    description: "Controls weekly roster planning, shift templates, publish controls, and roster-aware leave and attendance behavior.",
    managePermissions: ["roster.settings.manage", "roster.settings.update"]
  };
  const payrollMain: ToggleDefinition = {
    section: "payroll",
    keyName: "module_enabled",
    label: "Payroll Core",
    description: "Controls payroll runs, salary calculation, payroll periods, and payroll processing.",
    managePermissions: ["payroll.settings.manage", "payroll.settings.update"]
  };
  const documentMain: ToggleDefinition = {
    section: "documentCompliance",
    keyName: "document_compliance_enabled",
    label: "Documents",
    description: "Controls employee documents, document types, document storage, compliance tracking, renewal cases, and expiry alerts.",
    managePermissions: ["documents.compliance.settings.manage", "documents.settings.manage"]
  };
  const contractsMain: ToggleDefinition = {
    section: "contracts",
    keyName: "contracts_enabled",
    label: "Contracts",
    description: "Controls employee contracts, probation, renewals, contract alerts, and contract reports.",
    managePermissions: ["contracts.settings.manage", "contracts.settings.update"]
  };
  const assetsMain: ToggleDefinition = {
    section: "assets",
    keyName: "asset_module_enabled",
    label: "Assets",
    description: "Controls asset categories, item register, issue and return lifecycle, deductions, and asset reports.",
    managePermissions: ["assets.settings.manage", "assets.settings.update"]
  };
  const selfServiceMain: ToggleDefinition = {
    section: "selfService",
    keyName: "module_enabled",
    label: "Self-Service",
    description: "Controls employee-facing portal visibility for profile, documents, leave, attendance, roster, payroll, contracts, assets, and approvals.",
    managePermissions: ["self_service.settings.manage", "self_service.settings.update"]
  };

  return (
    <PageShell>
      <PageHeader title="Settings" description="System configuration foundation." />
      {message ? <Panel className="border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">{message}</Panel> : null}

      <SettingsRow
        icon={<Building2 className="h-4 w-4 text-muted-foreground" />}
        title="Organization master data"
        description="Company profile, locations, departments, positions, and job levels."
        to="/settings/organization"
      />

      <SettingsRow
        icon={<CalendarDays className="h-4 w-4 text-muted-foreground" />}
        title="Roster management"
        description="Shift templates, weekly roster settings, reports, and publish controls."
        to="/roster/settings"
        toggles={<SettingsToggleGroup main={rosterMain} submodules={[
          { ...rosterMain, keyName: "copy_previous_week_enabled", label: "Weekly Rosters", description: "Controls weekly roster copy, planning, and roster matrix workflow." },
          { ...rosterMain, keyName: "bulk_assignment_enabled", label: "Shift Templates", description: "Controls shift template and bulk assignment workflow availability." },
          { ...rosterMain, keyName: "manager_team_roster_visibility_enabled", label: "Roster Reports", description: "Controls manager/team roster visibility and roster reporting surfaces." }
        ]} settings={settings} savingKey={savingKey} canManage={canManage} onToggle={saveToggle} loading={loading} />}
      />

      <SettingsRow
        icon={<ClipboardList className="h-4 w-4 text-muted-foreground" />}
        title="Leave management"
        description="Leave types, policies, deduction/document rules, and approval workflows."
        to="/leave/settings"
      />

      <SettingsRow
        icon={<CalendarCheck className="h-4 w-4 text-muted-foreground" />}
        title="Attendance management"
        description="Attendance rules, devices, corrections, records, and report exports."
        to="/attendance/settings"
        toggles={<SettingsToggleGroup main={attendanceMain} submodules={[
          { ...attendanceMain, keyName: "allow_manual_entries", label: "Manual", description: "Controls manual attendance entry and manual attendance adjustments where enabled.", defaultEnabled: true },
          { ...attendanceMain, keyName: "allow_employee_correction_requests", label: "Corrections", description: "Controls attendance correction requests, review, approval, and correction audit workflow." },
          { section: "attendanceDevices", keyName: "zkteco_local_bridge_enabled", label: "ZKTeco Devices", description: "Controls ZKTeco device registry, biometric mappings, attendance imports, and device diagnostics.", managePermissions: ["attendance.devices.manage", "attendance.settings.manage"], defaultEnabled: true },
          { section: "attendanceDevices", keyName: "zkteco_csv_import_enabled", label: "Imports", description: "Controls attendance CSV imports, raw logs, unmatched punch review, and import diagnostics.", managePermissions: ["attendance.devices.manage", "attendance.settings.manage"], defaultEnabled: true }
        ]} settings={settings} savingKey={savingKey} canManage={canManage} onToggle={saveToggle} loading={loading} />}
      />

      <SettingsRow
        icon={<Banknote className="h-4 w-4 text-muted-foreground" />}
        title="Payroll management"
        description="Payroll components, settings, periods, runs, advances, reports, and settlements."
        to="/payroll/settings"
        toggles={<SettingsToggleGroup main={payrollMain} submodules={[
          { ...payrollMain, keyName: "payslips_enabled", label: "Payslips", description: "Controls payslip generation, employee payslip visibility, and payslip download availability." },
          { ...payrollMain, keyName: "payment_register_enabled", label: "Register", description: "Controls payroll payment register, payment preparation status, and payment audit history." },
          { ...payrollMain, keyName: "payment_methods_enabled", label: "Methods", description: "Controls employee payment method setup and bank/cash payment method records." },
          { ...payrollMain, keyName: "payment_institutions_enabled", label: "Institutions", description: "Controls banks, wallets, cash locations, and payment institution setup." },
          { ...payrollMain, keyName: "pension_enabled", label: "Pension", description: "Controls pension schemes, employee pension profiles, pension calculation, payslip pension display, and pension reports." },
          { ...payrollMain, keyName: "bank_loan_deductions_enabled", label: "Bank Loans", description: "Controls employee bank loan salary deductions, direct bank collection tracking, bank notifications, and bank loan reports." },
          { ...payrollMain, keyName: "employee_advances_enabled", label: "Advances", description: "Controls employee advance payments, advance recovery deductions, balances, and advance reports." },
          { ...payrollMain, keyName: "custom_deductions_enabled", label: "Custom Deductions", description: "Controls custom deduction templates, employee deduction assignments, shortfalls, and deduction history." },
          { ...payrollMain, keyName: "payroll_adjustments_enabled", label: "Adjustments", description: "Controls payroll adjustment placeholders, review, approval, and adjustment audit workflow." },
          { ...payrollMain, keyName: "payroll_reports_enabled", label: "Reports", description: "Controls payroll reports, payroll exports, compliance summaries, and payroll history reporting." },
          { section: "finalSettlement", keyName: "final_settlement_enabled", label: "Final Settlement", description: "Controls exit payroll, final settlement cases, clearance checks, and settlement register workflow.", managePermissions: ["final_settlement.settings.manage", "final_settlement.settings.update"] }
        ]} settings={settings} savingKey={savingKey} canManage={canManage} onToggle={saveToggle} loading={loading} />}
      />

      <SettingsRow
        icon={<FileText className="h-4 w-4 text-muted-foreground" />}
        title="Document management"
        description="Categories, document types, required rules, and registry settings."
        to="/settings/documents"
        toggles={<SettingsToggleGroup main={documentMain} submodules={[
          { ...documentMain, keyName: "renewal_workflow_enabled", label: "Renewals", description: "Controls document renewal cases, renewal workflow, and renewal tracking." },
          { ...documentMain, keyName: "expiry_alerts_enabled", label: "Expiry Alerts", description: "Controls document expiry alerts, urgent warnings, and compliance alerting." },
          { ...documentMain, keyName: "missing_required_document_alerts_enabled", label: "Required Docs", description: "Controls missing required document alerts and checklist compliance warnings." }
        ]} settings={settings} savingKey={savingKey} canManage={canManage} onToggle={saveToggle} loading={loading} />}
      />

      <SettingsRow
        icon={<FileSearch className="h-4 w-4 text-muted-foreground" />}
        title="Contracts"
        description="Contract types, probation, renewals, contract alerts, and employee contract summaries."
        to="/settings/contracts"
        toggles={<SettingsToggleGroup main={contractsMain} submodules={[
          { ...contractsMain, keyName: "contract_expiry_alerts_enabled", label: "Alerts", description: "Controls contract expiry alerts, probation warnings, and renewal reminders." },
          { ...contractsMain, keyName: "require_contract_approval_before_activation", label: "Approvals", description: "Controls whether contract approval is required before employee activation." },
          { ...contractsMain, keyName: "auto_create_end_of_contract_settlement_case", label: "Renewals", description: "Controls end-of-contract settlement and renewal workflow handoff." }
        ]} settings={settings} savingKey={savingKey} canManage={canManage} onToggle={saveToggle} loading={loading} />}
      />

      <SettingsRow
        icon={<Shirt className="h-4 w-4 text-muted-foreground" />}
        title="Assets & uniforms"
        description="Categories, item register, issue/return tracking, and deduction rules."
        to="/assets/settings"
        toggles={<SettingsToggleGroup main={assetsMain} submodules={[
          { section: "assets", keyName: "uniform_module_enabled", label: "Uniforms", description: "Controls uniform stock, uniform assignment, uniform returns, and uniform clearance workflow.", managePermissions: ["assets.settings.manage", "assets.settings.update"] },
          { ...assetsMain, keyName: "allow_payroll_deduction_for_lost_damaged_items", label: "Deductions", description: "Controls lost/damaged asset payroll deduction eligibility and deduction review." },
          { ...assetsMain, keyName: "default_asset_clearance_required_before_final_settlement", label: "Clearance", description: "Controls whether asset clearance is required before final settlement." }
        ]} settings={settings} savingKey={savingKey} canManage={canManage} onToggle={saveToggle} loading={loading} />}
      />

      <SettingsRow
        icon={<FileClock className="h-4 w-4 text-muted-foreground" />}
        title="Lifecycle and approvals"
        description="Onboarding, offboarding, approval workflow, and employee transition controls."
        to="/onboarding/settings"
        toggles={<SettingsToggleGroup main={{ section: "onboarding", keyName: "onboarding_enabled", label: "Onboarding", description: "Controls employee onboarding cases, setup workspace, activation readiness, and onboarding task workflow.", managePermissions: ["onboarding.settings.manage", "onboarding.settings.update"] }} submodules={[
          { section: "offboarding", keyName: "offboarding_enabled", label: "Offboarding", description: "Controls employee offboarding cases, exit tasks, clearance, and offboarding lifecycle workflow.", managePermissions: ["offboarding.settings.manage", "offboarding.settings.update"] },
          { section: "approvals", keyName: "approval_workflows_enabled", label: "Approvals", description: "Controls central approval workflows, delegation, escalation, and approval notifications.", managePermissions: ["approvals.settings.manage"] }
        ]} settings={settings} savingKey={savingKey} canManage={canManage} onToggle={saveToggle} loading={loading} />}
      />

      <SettingsRow
        icon={<Users className="h-4 w-4 text-muted-foreground" />}
        title="Employee settings"
        description="Employee statuses and numbering rules."
        to="/employees/settings"
      />

      <SettingsRow
        icon={<SlidersHorizontal className="h-4 w-4 text-muted-foreground" />}
        title="Employee self-service"
        description="Portal visibility, employee request toggles, payslip download, and sensitive field display."
        to="/settings/self-service"
        toggles={<SettingsToggleGroup main={selfServiceMain} submodules={[
          { ...selfServiceMain, keyName: "leave_enabled", label: "Leave", description: "Controls employee self-service leave request and leave balance visibility." },
          { ...selfServiceMain, keyName: "attendance_enabled", label: "Attendance", description: "Controls employee self-service attendance records and correction requests." },
          { ...selfServiceMain, keyName: "payslips_enabled", label: "Payslips", description: "Controls employee payslip visibility and payslip download availability." },
          { ...selfServiceMain, keyName: "documents_enabled", label: "Documents", description: "Controls employee document visibility and self-service document submission surfaces." },
          { ...selfServiceMain, keyName: "contracts_enabled", label: "Contracts", description: "Controls employee contract visibility inside self-service." },
          { ...selfServiceMain, keyName: "assets_enabled", label: "Assets", description: "Controls employee asset and uniform visibility inside self-service." },
          { ...selfServiceMain, keyName: "approvals_enabled", label: "Approvals", description: "Controls employee approval request visibility and self-service approval timeline." }
        ]} settings={settings} savingKey={savingKey} canManage={canManage} onToggle={saveToggle} loading={loading} />}
      />

      <SettingsRow
        icon={<ShieldCheck className="h-4 w-4 text-muted-foreground" />}
        title="Admin controls & production readiness"
        description="Module toggles, consistency checks, security events, data transfer, audit review, and environment safety."
        to="/settings/admin"
      />

      <SettingsRow
        icon={<FileSearch className="h-4 w-4 text-muted-foreground" />}
        title="Data import / export and deployment readiness"
        description="CSV templates, import batches, validation preview, exports, backup guidance, QA, smoke, and deployment readiness."
        to="/settings/admin/imports"
      />

      <Panel className="overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Configuration registry</h2>
            <p className="text-xs text-muted-foreground">Protected keys are stored in D1 system settings.</p>
          </div>
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settingsRows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="font-mono text-xs">{row.key}</TableCell>
                  <TableCell>{row.scope}</TableCell>
                  <TableCell>
                    <Badge tone={row.status === "Required" ? "warning" : "neutral"}>{row.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <EmptyState title="Module status is centralized" description="Main module and submodule enablement lives on this page. Module-specific settings pages remain available for detailed configuration." />
      </Panel>
    </PageShell>
  );
}

function SettingsRow({ icon, title, description, to, toggles }: { icon: ReactNode; title: string; description: string; to: string; toggles?: ReactNode }) {
  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-col gap-4 border-b px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {icon}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="text-xs leading-5 text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
          {toggles}
          <NavLink to={to} className="shrink-0">
            <Button size="sm" variant="outline">Open</Button>
          </NavLink>
        </div>
      </div>
    </Panel>
  );
}

function SettingsToggleGroup({ main, submodules, settings, savingKey, canManage, onToggle, loading }: { main: ToggleDefinition; submodules?: ToggleDefinition[]; settings: SettingsMap; savingKey: string | null; canManage: (permissions: string[]) => boolean; onToggle: (toggle: ToggleDefinition, nextEnabled: boolean) => void; loading: boolean }) {
  return (
    <div className="SettingsToggleGroup flex min-w-0 flex-wrap items-center justify-end gap-2">
      <ModuleTogglePill toggle={main} settings={settings} savingKey={savingKey} canManage={canManage} onToggle={onToggle} loading={loading} />
      {submodules?.length ? <span className="px-1 text-slate-300">|</span> : null}
      {submodules?.map((toggle) => (
        <ModuleTogglePill key={`${toggle.section}.${toggle.keyName}`} toggle={toggle} settings={settings} savingKey={savingKey} canManage={canManage} onToggle={onToggle} loading={loading} />
      ))}
    </div>
  );
}

function ModuleTogglePill({ toggle, settings, savingKey, canManage, onToggle, loading }: { toggle: ToggleDefinition; settings: SettingsMap; savingKey: string | null; canManage: (permissions: string[]) => boolean; onToggle: (toggle: ToggleDefinition, nextEnabled: boolean) => void; loading: boolean }) {
  const enabled = isEnabled(settings[toggle.section], toggle.keyName, toggle.defaultEnabled ?? true);
  const allowed = canManage(toggle.managePermissions);
  const busy = savingKey === `${toggle.section}.${toggle.keyName}`;
  const missingSettings = !settings[toggle.section];
  const disabled = loading || busy || !allowed || missingSettings;
  const description = (
    <>
      <span>{toggle.description}</span>
      {!allowed ? <span className="mt-1 block font-medium text-amber-700">Read only: you do not have permission to change this setting.</span> : null}
      {missingSettings ? <span className="mt-1 block font-medium text-amber-700">Status could not be loaded for this setting.</span> : null}
    </>
  );

  return (
    <Tooltip content={description}>
      <span className={cn("ModuleTogglePill inline-flex h-8 items-center gap-2 rounded-md border bg-white px-2 text-xs shadow-sm", enabled ? "border-emerald-200 text-emerald-800" : "border-slate-200 text-slate-600")}>
        <span className="whitespace-nowrap font-medium">{toggle.label}</span>
        <Switch checked={enabled} disabled={disabled} aria-label={`${enabled ? "Disable" : "Enable"} ${toggle.label}`} onCheckedChange={(nextEnabled) => onToggle(toggle, nextEnabled)} />
      </span>
    </Tooltip>
  );
}
