import { useEffect, useState } from "react";
import { AlertTriangle, Banknote, CalendarCheck, CalendarDays, FileClock, FileSearch, FileText, Shirt, SlidersHorizontal, Users } from "lucide-react";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Switch } from "../components/ui/switch";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";

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

type ModuleCardDef = {
  icon: React.ReactNode;
  iconColor: string;
  title: string;
  description: string;
  main: ToggleDefinition;
  submodules: ToggleDefinition[];
};

export function SettingsModulesPage() {
  const { token, user, refreshCurrentUser } = useAuth();
  const alerts = useAlert();
  const permissions = new Set(user?.permissions ?? []);
  const [settings, setSettings] = useState<SettingsMap>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [confirmDisable, setConfirmDisable] = useState<{ card: ModuleCardDef; reason: string; acknowledged: boolean } | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    const results = await Promise.allSettled(SETTINGS_LOADERS.map(async (loader) => [loader.key, await loader.load(token)] as const));
    const next: SettingsMap = {};
    for (const result of results) {
      if (result.status === "fulfilled") next[result.value[0]] = result.value[1];
    }
    setSettings(next);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function canManage(keys: string[]) {
    return [...MANAGE_SETTINGS, ...keys].some((permission) => permissions.has(permission));
  }

  async function saveToggle(toggle: ToggleDefinition, nextEnabled: boolean, metadata: SettingsRecord = {}) {
    if (!token || !canManage(toggle.managePermissions)) return;
    const current = settings[toggle.section] ?? {};
    const next = { ...current, [toggle.keyName]: boolPayload(nextEnabled), ...metadata };
    setSavingKey(`${toggle.section}.${toggle.keyName}`);
    try {
      let saved: SettingsRecord;
      switch (toggle.section) {
        case "attendance": saved = (await api.updateAttendanceSettings(token, next as never)).settings as unknown as SettingsRecord; break;
        case "attendanceDevices": saved = (await api.updateAttendanceDeviceSettings(token, next as never)).settings as unknown as SettingsRecord; break;
        case "roster": saved = (await api.updateRosterSettings(token, next as never)).settings as unknown as SettingsRecord; break;
        case "payroll": saved = (await api.updatePayrollSettings(token, next as never)).settings as unknown as SettingsRecord; break;
        case "finalSettlement": saved = (await api.updateFinalSettlementSettings(token, next as never)).settings as unknown as SettingsRecord; break;
        case "assets": saved = (await api.updateAssetUniformSettings(token, next as never)).settings as unknown as SettingsRecord; break;
        case "documentCompliance": saved = (await api.updateDocumentComplianceSettings(token, next as never)).settings as unknown as SettingsRecord; break;
        case "contracts": saved = (await api.updateContractSettings(token, next)).settings as SettingsRecord; break;
        case "approvals": saved = (await api.updateApprovalSettings(token, next as never)).settings as unknown as SettingsRecord; break;
        case "onboarding": saved = (await api.updateOnboardingSettings(token, next as never)).settings as unknown as SettingsRecord; break;
        case "offboarding": saved = (await api.updateOffboardingSettings(token, next as never)).settings as unknown as SettingsRecord; break;
        case "selfService": saved = (await api.updateSelfServiceSettings(token, next)).settings as SettingsRecord; break;
      }
      setSettings((previous) => ({ ...previous, [toggle.section]: saved }));
      await refreshCurrentUser();
      alerts.showSuccess("Module updated", `${toggle.label} ${nextEnabled ? "enabled" : "disabled"}.`);
    } catch (err) {
      alerts.showApiError(err, `Unable to update ${toggle.label}.`);
    } finally {
      setSavingKey(null);
    }
  }

  function requestMainToggle(card: ModuleCardDef, nextEnabled: boolean) {
    if (!nextEnabled && card.submodules.length) {
      setConfirmDisable({ card, reason: "", acknowledged: false });
      return;
    }
    void saveToggle(card.main, nextEnabled);
  }

  function confirmMainDisable() {
    if (!confirmDisable) return;
    const requiresReason = confirmDisable.card.main.section === "attendance";
    if (requiresReason && !confirmDisable.reason.trim()) {
      alerts.showError("Reason required", "Please enter a reason before disabling this module.");
      return;
    }
    if (!confirmDisable.acknowledged) {
      alerts.showError("Confirmation required", "Please acknowledge the impact before disabling this module.");
      return;
    }
    void saveToggle(confirmDisable.card.main, false, requiresReason ? { module_disable_reason: confirmDisable.reason.trim() } : {});
    setConfirmDisable(null);
  }

  const attendanceMain: ToggleDefinition = { section: "attendance", keyName: "module_enabled", label: "Attendance", description: "Attendance records, calendar, corrections, manual entries, reports, and payroll-impact review.", managePermissions: ["attendance.settings.manage", "attendance.settings.update"] };
  const rosterMain: ToggleDefinition = { section: "roster", keyName: "module_enabled", label: "Roster", description: "Weekly roster planning, shift templates, publish controls, and roster-aware leave/attendance behavior.", managePermissions: ["roster.settings.manage", "roster.settings.update"] };
  const payrollMain: ToggleDefinition = { section: "payroll", keyName: "module_enabled", label: "Payroll", description: "Payroll runs, salary calculation, payroll periods, and payroll processing.", managePermissions: ["payroll.settings.manage", "payroll.settings.update"] };
  const documentMain: ToggleDefinition = { section: "documentCompliance", keyName: "document_compliance_enabled", label: "Documents", description: "Employee documents, document types, storage, compliance tracking, renewal cases, and expiry alerts.", managePermissions: ["documents.compliance.settings.manage", "documents.settings.manage"] };
  const contractsMain: ToggleDefinition = { section: "contracts", keyName: "contracts_enabled", label: "Contracts", description: "Employee contracts, probation, renewals, contract alerts, and contract reports.", managePermissions: ["contracts.settings.manage", "contracts.settings.update"] };
  const assetsMain: ToggleDefinition = { section: "assets", keyName: "asset_module_enabled", label: "Assets & uniforms", description: "Asset categories, item register, issue/return lifecycle, deductions, and asset reports.", managePermissions: ["assets.settings.manage", "assets.settings.update"] };
  const onboardingMain: ToggleDefinition = { section: "onboarding", keyName: "onboarding_enabled", label: "Onboarding & offboarding", description: "Onboarding cases, setup workspace, activation readiness, exit clearances, and lifecycle tasks.", managePermissions: ["onboarding.settings.manage", "onboarding.settings.update"] };
  const selfServiceMain: ToggleDefinition = { section: "selfService", keyName: "module_enabled", label: "Self-service", description: "Employee-facing portal visibility for profile, documents, leave, attendance, roster, payroll, contracts, assets, and approvals.", managePermissions: ["self_service.settings.manage", "self_service.settings.update"] };

  const cards: ModuleCardDef[] = [
    { icon: <CalendarCheck className="h-4 w-4" />, iconColor: "#5B4FE9", title: "Attendance", description: attendanceMain.description, main: attendanceMain, submodules: [
      { ...attendanceMain, keyName: "allow_manual_entries", label: "Manual entries", description: "Manual attendance entry and adjustments.", defaultEnabled: true },
      { ...attendanceMain, keyName: "allow_employee_correction_requests", label: "Corrections", description: "Attendance correction requests, review, and approval." },
      { section: "attendanceDevices", keyName: "zkteco_local_bridge_enabled", label: "ZKTeco devices", description: "Device registry, biometric mappings, and diagnostics.", managePermissions: ["attendance.devices.manage", "attendance.settings.manage"], defaultEnabled: true },
      { section: "attendanceDevices", keyName: "zkteco_csv_import_enabled", label: "Imports", description: "Attendance CSV imports and unmatched punch review.", managePermissions: ["attendance.devices.manage", "attendance.settings.manage"], defaultEnabled: true }
    ] },
    { icon: <CalendarDays className="h-4 w-4" />, iconColor: "#5B4FE9", title: "Roster", description: rosterMain.description, main: rosterMain, submodules: [
      { ...rosterMain, keyName: "copy_previous_week_enabled", label: "Weekly rosters", description: "Weekly roster copy, planning, and matrix workflow." },
      { ...rosterMain, keyName: "bulk_assignment_enabled", label: "Shift templates", description: "Shift template and bulk assignment workflow." },
      { ...rosterMain, keyName: "manager_team_roster_visibility_enabled", label: "Roster reports", description: "Manager/team roster visibility and reporting." }
    ] },
    { icon: <Banknote className="h-4 w-4" />, iconColor: "#5B4FE9", title: "Payroll", description: payrollMain.description, main: payrollMain, submodules: [
      { ...payrollMain, keyName: "payslips_enabled", label: "Payslips", description: "Payslip generation and employee visibility." },
      { ...payrollMain, keyName: "payment_register_enabled", label: "Payment register", description: "Payment preparation status and audit history." },
      { ...payrollMain, keyName: "payment_methods_enabled", label: "Payment methods", description: "Employee payment method setup." },
      { ...payrollMain, keyName: "payment_institutions_enabled", label: "Institutions", description: "Banks, wallets, and cash locations." },
      { ...payrollMain, keyName: "pension_enabled", label: "Pension", description: "Pension schemes and employee profiles." },
      { ...payrollMain, keyName: "bank_loan_deductions_enabled", label: "Bank loans", description: "Bank loan salary deductions and tracking." },
      { ...payrollMain, keyName: "employee_advances_enabled", label: "Advances", description: "Employee advance payments and recovery." },
      { ...payrollMain, keyName: "custom_deductions_enabled", label: "Custom deductions", description: "Custom deduction templates and history." },
      { ...payrollMain, keyName: "payroll_adjustments_enabled", label: "Adjustments", description: "Payroll adjustment review and approval." },
      { ...payrollMain, keyName: "payroll_reports_enabled", label: "Reports", description: "Payroll reports, exports, and summaries." },
      { section: "finalSettlement", keyName: "final_settlement_enabled", label: "Final settlement", description: "Exit payroll, clearance checks, and settlement register.", managePermissions: ["final_settlement.settings.manage", "final_settlement.settings.update"] }
    ] },
    { icon: <FileText className="h-4 w-4" />, iconColor: "#5B4FE9", title: "Documents", description: documentMain.description, main: documentMain, submodules: [
      { ...documentMain, keyName: "renewal_workflow_enabled", label: "Renewals", description: "Document renewal cases and tracking." },
      { ...documentMain, keyName: "expiry_alerts_enabled", label: "Expiry alerts", description: "Expiry alerts and compliance alerting." },
      { ...documentMain, keyName: "missing_required_document_alerts_enabled", label: "Required docs", description: "Missing required document alerts." }
    ] },
    { icon: <FileSearch className="h-4 w-4" />, iconColor: "#5B4FE9", title: "Contracts", description: contractsMain.description, main: contractsMain, submodules: [
      { ...contractsMain, keyName: "contract_expiry_alerts_enabled", label: "Alerts", description: "Contract expiry and probation warnings." },
      { ...contractsMain, keyName: "require_contract_approval_before_activation", label: "Approvals", description: "Require contract approval before activation." },
      { ...contractsMain, keyName: "auto_create_end_of_contract_settlement_case", label: "Renewals", description: "End-of-contract settlement handoff." }
    ] },
    { icon: <Shirt className="h-4 w-4" />, iconColor: "#5B4FE9", title: "Assets & uniforms", description: assetsMain.description, main: assetsMain, submodules: [
      { section: "assets", keyName: "uniform_module_enabled", label: "Uniforms", description: "Uniform stock, assignment, and clearance.", managePermissions: ["assets.settings.manage", "assets.settings.update"] },
      { ...assetsMain, keyName: "allow_payroll_deduction_for_lost_damaged_items", label: "Deductions", description: "Lost/damaged asset payroll deductions." },
      { ...assetsMain, keyName: "default_asset_clearance_required_before_final_settlement", label: "Clearance", description: "Require clearance before final settlement." }
    ] },
    { icon: <FileClock className="h-4 w-4" />, iconColor: "#5B4FE9", title: "Onboarding & offboarding", description: onboardingMain.description, main: onboardingMain, submodules: [
      { section: "offboarding", keyName: "offboarding_enabled", label: "Offboarding", description: "Exit tasks, clearance, and lifecycle workflow.", managePermissions: ["offboarding.settings.manage", "offboarding.settings.update"] },
      { section: "approvals", keyName: "approval_workflows_enabled", label: "Approvals", description: "Central approval workflows, delegation, escalation.", managePermissions: ["approvals.settings.manage"] }
    ] },
    { icon: <SlidersHorizontal className="h-4 w-4" />, iconColor: "#5B4FE9", title: "Self-service", description: selfServiceMain.description, main: selfServiceMain, submodules: [
      { ...selfServiceMain, keyName: "leave_enabled", label: "Leave", description: "Self-service leave requests and balances." },
      { ...selfServiceMain, keyName: "attendance_enabled", label: "Attendance", description: "Self-service attendance and corrections." },
      { ...selfServiceMain, keyName: "payslips_enabled", label: "Payslips", description: "Payslip visibility and download." },
      { ...selfServiceMain, keyName: "documents_enabled", label: "Documents", description: "Document visibility in self-service." },
      { ...selfServiceMain, keyName: "contracts_enabled", label: "Contracts", description: "Contract visibility in self-service." },
      { ...selfServiceMain, keyName: "assets_enabled", label: "Assets", description: "Asset/uniform visibility in self-service." },
      { ...selfServiceMain, keyName: "approvals_enabled", label: "Approvals", description: "Approval request visibility and timeline." }
    ] }
  ];

  return (
    <PageShell constrained={false}>
      <div className="space-y-3">
        <div>
          <p className="text-lg font-medium text-slate-950">Modules</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Turn features on or off — disabling a module also disables everything that depends on it</p>
        </div>

        <Panel className="p-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Users className="h-4 w-4 text-[#5B4FE9]" />
              <div><p className="text-xs font-medium text-slate-950">Employees</p><p className="text-[9px] text-muted-foreground">Required — the whole system depends on this</p></div>
            </div>
            <Badge tone="neutral">Always on</Badge>
          </div>
        </Panel>

        {loading ? (
          <div className="flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <Panel key={i} className="h-20 animate-pulse" />)}</div>
        ) : (
          <div className="flex flex-col gap-2">
            {cards.map((card) => {
              const enabled = isEnabled(settings[card.main.section], card.main.keyName, card.main.defaultEnabled ?? true);
              const allowed = canManage(card.main.managePermissions);
              const busy = savingKey === `${card.main.section}.${card.main.keyName}`;
              return (
                <Panel key={card.title} className="p-3.5" style={!enabled ? { opacity: 0.6 } : undefined}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span style={{ color: card.iconColor }}>{card.icon}</span>
                      <div>
                        <p className="text-xs font-medium text-slate-950">{card.title}</p>
                        <p className="text-[9px] text-muted-foreground">{!enabled ? "Disabled" : card.submodules.length ? `${card.submodules.length} sub-setting(s)` : card.description}</p>
                      </div>
                    </div>
                    <Switch checked={enabled} disabled={!allowed || busy} onCheckedChange={(next) => requestMainToggle(card, next)} />
                  </div>
                  {enabled && card.submodules.length ? (
                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#E7E7F1] pt-3 sm:grid-cols-3">
                      {card.submodules.map((sub) => {
                        const subEnabled = isEnabled(settings[sub.section], sub.keyName, sub.defaultEnabled ?? true);
                        const subAllowed = canManage(sub.managePermissions);
                        const subBusy = savingKey === `${sub.section}.${sub.keyName}`;
                        return (
                          <div key={`${sub.section}.${sub.keyName}`} className="flex items-center justify-between rounded-md bg-[#F7F7FB] px-2.5 py-2">
                            <span className="truncate text-[10px] text-slate-950" title={sub.description}>{sub.label}</span>
                            <Switch checked={subEnabled} disabled={!subAllowed || subBusy} onCheckedChange={(next) => void saveToggle(sub, next)} />
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </Panel>
              );
            })}
          </div>
        )}
      </div>

      {confirmDisable ? (
        <Dialog open onOpenChange={(v) => !v && setConfirmDisable(null)}>
          <DialogContent size="sm">
            <DialogHeader><DialogTitle>Turning off "{confirmDisable.card.title}" affects other settings</DialogTitle></DialogHeader>
            <DialogBody>
              <div className="rounded-md border border-[#F09595] bg-[#FCEBEB] p-3">
                <div className="mb-2 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-[#A32D2D]" /><p className="text-xs font-medium text-slate-950">These sub-settings will stop working until you re-enable it:</p></div>
                <div className="flex flex-wrap gap-1.5">
                  {confirmDisable.card.submodules.map((sub) => <span key={sub.keyName} className="rounded-full bg-white px-2.5 py-1 text-[10px] text-[#A32D2D]">{sub.label}</span>)}
                </div>
              </div>
              {confirmDisable.card.main.section === "attendance" ? (
                <div className="mt-3 space-y-1.5">
                  <label className="text-xs font-medium text-slate-950">Reason *</label>
                  <Input value={confirmDisable.reason} onChange={(e) => setConfirmDisable({ ...confirmDisable, reason: e.target.value })} placeholder="Reason required for disabling Attendance" />
                </div>
              ) : null}
              <label className="mt-3 flex items-center gap-2 text-xs text-slate-950">
                <input type="checkbox" className="h-3.5 w-3.5" checked={confirmDisable.acknowledged} onChange={(e) => setConfirmDisable({ ...confirmDisable, acknowledged: e.target.checked })} />
                I understand and want to disable {confirmDisable.card.title} anyway
              </label>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setConfirmDisable(null)}>Cancel</Button>
              <Button size="sm" variant="danger" onClick={confirmMainDisable}>Disable {confirmDisable.card.title}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </PageShell>
  );
}
