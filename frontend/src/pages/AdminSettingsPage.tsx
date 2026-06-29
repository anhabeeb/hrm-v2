import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  ClipboardCheck,
  Database,
  Download,
  FileWarning,
  Link,
  Lock,
  RefreshCw,
  Settings,
  ShieldCheck
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NavLink, useSearchParams } from "react-router-dom";
import { ActionTextButton } from "../components/ui/action-button";
import { Badge } from "../components/ui/badge";
import { Button, RowActionButton } from "../components/ui/button";
import { ConfirmDialog } from "../components/ui/dialogs";
import { EmptyState } from "../components/ui/empty-state";
import { ActiveFilterChips, FilterResetButton, FilterSection, formatDateRangeLabel, MoreFiltersSheet, StandardDateRangeFilter, StandardFilterBar, StandardSearchInput } from "../components/filters";
import { Input } from "../components/ui/input";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { AdminHelpLink } from "../features/admin-help/AdminHelpLink";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import { clearCurrentBrowserCache, getFrontendCacheDiagnostics, preserveSafeUiPreferences } from "../lib/cache/hrmCache";
import { CheckboxField, PageHeader, PageShell, SelectField, StandardTabs } from "../components/ui/page-shell";

type Row = Record<string, unknown>;
type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const tabs = [
  { key: "hub", label: "Hub", icon: Settings },
  { key: "modules", label: "Modules", icon: ShieldCheck },
  { key: "checks", label: "Consistency", icon: ClipboardCheck },
  { key: "audit", label: "Audit", icon: Database },
  { key: "security-events", label: "Security Events", icon: Lock },
  { key: "permission-risks", label: "Permission Risks", icon: FileWarning },
  { key: "scope-review", label: "Scope Review", icon: Link },
  { key: "security-settings", label: "Security Settings", icon: Lock },
  { key: "cache-sync", label: "Cache & Sync", icon: Database },
  { key: "health", label: "Health", icon: Activity },
  { key: "remote-schema", label: "Remote Schema", icon: Database },
  { key: "data-transfer", label: "Data Transfer", icon: Download },
  { key: "retention", label: "Retention", icon: ClipboardCheck },
  { key: "export-security", label: "Export Controls", icon: Download },
  { key: "readiness", label: "Readiness", icon: ShieldCheck },
  { key: "environment", label: "Environment", icon: AlertTriangle },
  { key: "alerts", label: "Admin Alerts", icon: Bell },
  { key: "reports", label: "Reports", icon: BarChart3 }
];

const reportOptions = [
  "audit-logs",
  "security-events",
  "permission-risks",
  "access-scopes",
  "module-settings",
  "production-readiness",
  "system-health",
  "sensitive-exports",
  "consistency-checks"
];

function text(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ") || "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function SettingsToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <CheckboxField label={label} checked={checked} onChange={onChange} />;
}

function statusTone(value: unknown): Tone {
  const status = String(value ?? "").toUpperCase();
  if (["PASS", "HEALTHY", "ACTIVE", "SUCCESS", "RESOLVED"].includes(status)) return "success";
  if (["WARNING", "OPEN", "ACKNOWLEDGED", "SKIPPED"].includes(status)) return "warning";
  if (["FAIL", "ERROR", "CRITICAL", "BLOCKED", "DISABLED"].includes(status)) return "danger";
  return "neutral";
}

function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((row): row is Row => typeof row === "object" && row !== null) : [];
}

function SummaryGrid({ items }: { items: Array<{ label: string; value: unknown; tone?: Tone }> }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <Panel key={item.label} className="p-4">
          <p className="text-xs uppercase text-muted-foreground">{item.label}</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="truncate text-lg font-semibold">{text(item.value)}</p>
            {item.tone ? <Badge tone={item.tone}>{text(item.value)}</Badge> : null}
          </div>
        </Panel>
      ))}
    </div>
  );
}

function RowsTable({ rows, columns, empty }: { rows: Row[]; columns: string[]; empty: string }) {
  return (
    <Panel className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>{columns.map((column) => <TableHead key={column}>{column.replace(/_/g, " ")}</TableHead>)}</TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={String(row.id ?? row.check_key ?? row.module_key ?? row.finding_key ?? index)}>
                {columns.map((column) => (
                  <TableCell key={column} className="max-w-[360px] truncate">
                    {["status", "severity", "result"].includes(column) ? <Badge tone={statusTone(row[column])}>{text(row[column])}</Badge> : text(row[column])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!rows.length ? <EmptyState title={empty} description="Run the checker or adjust filters to see records." /> : null}
      </div>
    </Panel>
  );
}

function JsonPanel({ title, data }: { title: string; data: unknown }) {
  return (
    <Panel className="p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      <pre className="mt-3 max-h-80 overflow-auto rounded-md bg-slate-50 p-3 text-xs text-slate-700">{JSON.stringify(data ?? {}, null, 2)}</pre>
    </Panel>
  );
}

function boolInput(value: unknown) {
  return value === 1 || value === true || value === "1" || value === "true";
}

export function AdminSettingsPage() {
  const { token, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [active, setActive] = useState(searchParams.get("section") || "hub");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [hub, setHub] = useState<{ sections: Row[]; modules: Row[] }>({ sections: [], modules: [] });
  const [hubStatus, setHubStatus] = useState<Row>({});
  const [modules, setModules] = useState<Row[]>([]);
  const [checks, setChecks] = useState<Row[]>([]);
  const [auditRows, setAuditRows] = useState<Row[]>([]);
  const [securityEvents, setSecurityEvents] = useState<Row[]>([]);
  const [permissionRisks, setPermissionRisks] = useState<Row[]>([]);
  const [scopeReview, setScopeReview] = useState<Row[]>([]);
  const [securitySettings, setSecuritySettings] = useState<Row>({});
  const [cacheDiagnostics, setCacheDiagnostics] = useState<Row>({});
  const [cacheClearConfirm, setCacheClearConfirm] = useState(false);
  const [health, setHealth] = useState<Row>({});
  const [remoteSchema, setRemoteSchema] = useState<Row>({});
  const [retention, setRetention] = useState<Row>({});
  const [exportSecurity, setExportSecurity] = useState<Row>({});
  const [readiness, setReadiness] = useState<Row[]>([]);
  const [environment, setEnvironment] = useState<Row>({});
  const [alerts, setAlerts] = useState<Row[]>([]);
  const [reportKey, setReportKey] = useState("audit-logs");
  const [reportRows, setReportRows] = useState<Row[]>([]);
  const [pendingModule, setPendingModule] = useState<Row | null>(null);
  const [moduleWarnings, setModuleWarnings] = useState<Row[]>([]);
  const [auditFilters, setAuditFilters] = useState({ search: "", module: "", action: "", date_from: "", date_to: "" });
  const auditDateRange = { from: auditFilters.date_from, to: auditFilters.date_to };
  const auditFilterChips = useMemo(() => [
    ...(auditFilters.search ? [{ key: "search", label: "Search", value: auditFilters.search, onRemove: () => setAuditFilters((current) => ({ ...current, search: "" })) }] : []),
    ...(auditFilters.module ? [{ key: "module", label: "Module", value: auditFilters.module, onRemove: () => setAuditFilters((current) => ({ ...current, module: "" })) }] : []),
    ...(auditFilters.action ? [{ key: "action", label: "Action", value: auditFilters.action, onRemove: () => setAuditFilters((current) => ({ ...current, action: "" })) }] : []),
    ...(auditFilters.date_from || auditFilters.date_to ? [{ key: "date", label: "Date", value: formatDateRangeLabel(auditDateRange), onRemove: () => setAuditFilters((current) => ({ ...current, date_from: "", date_to: "" })) }] : [])
  ], [auditFilters, auditDateRange]);

  const permissions = useMemo(() => new Set(user?.permissions ?? []), [user]);
  const canView = Boolean(user?.is_owner || permissions.has("admin.settings_hub.view") || permissions.has("settings.view"));

  function selectTab(key: string) {
    setActive(key);
    setSearchParams({ section: key });
  }

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    setError(null);
    try {
      const [
        hubData,
        statusData,
        moduleData,
        checkData,
        auditData,
        eventData,
        riskData,
        scopeData,
        securityData,
        healthData,
        remoteData,
        retentionData,
        exportData,
        readinessData,
        environmentData,
        alertData
      ] = await Promise.all([
        api.getAdminSettingsHub(token),
        api.getAdminSettingsHubStatus(token),
        api.listAdminModules(token),
        api.listAdminConsistencyChecks(token),
        api.listAdminAuditLogs(token, auditFilters),
        api.listAdminSecurityEvents(token),
        api.listPermissionRisks(token),
        api.getAccessScopeReview(token),
        api.getAdminSecuritySettings(token),
        api.getSystemHealth(token),
        api.getRemoteSchemaToolsStatus(token),
        api.getDataRetentionSettings(token),
        api.getExportSecuritySettings(token),
        api.getProductionReadiness(token),
        api.getEnvironmentSafety(token),
        api.listAdminSystemAlerts(token)
      ]);
      setHub(hubData);
      setHubStatus(statusData.status);
      setModules(moduleData.modules);
      setChecks(checkData.checks);
      setAuditRows(auditData.audit);
      setSecurityEvents(eventData.events);
      setPermissionRisks(riskData.findings);
      setScopeReview(scopeData.review);
      setSecuritySettings(securityData.settings ?? {});
      setCacheDiagnostics(await getFrontendCacheDiagnostics());
      setHealth(healthData.health);
      setRemoteSchema(remoteData.remote_schema_tools);
      setRetention(retentionData.settings ?? {});
      setExportSecurity(exportData.settings ?? {});
      setReadiness(readinessData.checks);
      setEnvironment(environmentData.environment_safety);
      setAlerts(alertData.alerts);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load admin settings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token, canView]);

  async function runAction(label: string, action: () => Promise<void>) {
    if (!token) return;
    setError(null);
    setMessage(null);
    try {
      await action();
      setMessage(label);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed.");
    }
  }

  async function requestModuleToggle(module: Row) {
    if (!token) return;
    const check = await api.getAdminModuleDependencyCheck(token, String(module.module_key));
    setModuleWarnings(asRows(check.dependency_check.warnings));
    setPendingModule(module);
  }

  async function confirmModuleToggle() {
    if (!token || !pendingModule) return;
    const enabled = !boolInput(pendingModule.is_enabled);
    await runAction("Module setting updated.", async () => {
      await api.updateAdminModule(token, String(pendingModule.module_key), {
        is_enabled: enabled,
        acknowledge_dependency_warnings: true,
        reason: "Prompt 21 admin module control update"
      });
      setPendingModule(null);
      setModuleWarnings([]);
    });
  }

  async function saveSecuritySettings() {
    if (!token) return;
    await runAction("Security settings saved.", async () => {
      await api.updateAdminSecuritySettings(token, {
        session_timeout_minutes: Number(securitySettings.session_timeout_minutes ?? 480),
        idle_timeout_minutes: securitySettings.idle_timeout_minutes ? Number(securitySettings.idle_timeout_minutes) : null,
        idle_timeout_enabled: boolInput(securitySettings.idle_timeout_enabled ?? 1),
        warn_before_logout_seconds: Number(securitySettings.warn_before_logout_seconds ?? 60),
        extend_session_on_activity: boolInput(securitySettings.extend_session_on_activity ?? 1),
        apply_idle_timeout_to_admin: boolInput(securitySettings.apply_idle_timeout_to_admin ?? 1),
        apply_idle_timeout_to_self_service: boolInput(securitySettings.apply_idle_timeout_to_self_service ?? 1),
        stricter_timeout_for_sensitive_pages: boolInput(securitySettings.stricter_timeout_for_sensitive_pages ?? 1),
        sensitive_page_idle_timeout_minutes: Number(securitySettings.sensitive_page_idle_timeout_minutes ?? 10),
        audit_timeout_logout: boolInput(securitySettings.audit_timeout_logout ?? 1),
        password_policy_min_length: Number(securitySettings.password_policy_min_length ?? 8),
        audit_failed_permission_checks: boolInput(securitySettings.audit_failed_permission_checks),
        audit_sensitive_views: boolInput(securitySettings.audit_sensitive_views),
        audit_sensitive_exports: boolInput(securitySettings.audit_sensitive_exports),
        reason: "Security settings update"
      });
    });
  }

  async function saveRetention() {
    if (!token) return;
    await runAction("Retention settings saved.", async () => {
      await api.updateDataRetentionSettings(token, {
        audit_log_retention_days: retention.audit_log_retention_days ? Number(retention.audit_log_retention_days) : null,
        security_event_retention_days: retention.security_event_retention_days ? Number(retention.security_event_retention_days) : null,
        notification_retention_days: retention.notification_retention_days ? Number(retention.notification_retention_days) : null,
        auto_delete_enabled: false,
        require_manual_review_before_delete: true,
        reason: "Retention settings update"
      });
    });
  }

  async function saveExportSecurity() {
    if (!token) return;
    await runAction("Export controls saved.", async () => {
      await api.updateExportSecuritySettings(token, {
        csv_export_enabled: boolInput(exportSecurity.csv_export_enabled),
        json_export_enabled: boolInput(exportSecurity.json_export_enabled),
        sensitive_export_requires_permission: boolInput(exportSecurity.sensitive_export_requires_permission),
        sensitive_export_requires_reason: boolInput(exportSecurity.sensitive_export_requires_reason),
        sensitive_export_audit_enabled: boolInput(exportSecurity.sensitive_export_audit_enabled),
        max_export_rows: Number(exportSecurity.max_export_rows ?? 5000),
        mask_sensitive_fields_by_default: boolInput(exportSecurity.mask_sensitive_fields_by_default),
        reason: "Export security settings update"
      });
    });
  }

  async function loadReport() {
    if (!token) return;
    await runAction("Admin report loaded.", async () => {
      const report = await api.getAdminReport(token, reportKey);
      setReportRows(report.report.rows);
    });
  }

  async function clearLocalCache() {
    setCacheClearConfirm(false);
    await clearCurrentBrowserCache();
    setCacheDiagnostics(await getFrontendCacheDiagnostics());
    setMessage("Current browser cache cleared.");
  }

  if (!canView) {
    return <PageShell><Panel><EmptyState title="Admin controls unavailable" description="Your account needs admin settings or settings view permission." /></Panel></PageShell>;
  }

  return (
    <PageShell>
      <PageHeader
        title="Admin Settings & Production Controls"
        description="Central module controls, consistency checks, security logs, and production readiness guardrails."
        actions={
          <>
          <AdminHelpLink target={active === "cache-sync" ? "cacheTimeout" : active === "data-transfer" ? "dataImport" : "deployment"} label="View Configuration Guide" />
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="h-4 w-4" /> Refresh</Button>
          <NavLink to="/settings"><Button size="sm" variant="outline">Settings index</Button></NavLink>
          </>
        }
      />

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {message ? <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}

      <StandardTabs
        items={tabs.map((tab) => {
          const Icon = tab.icon;
          return { key: tab.key, label: <><Icon className="h-4 w-4" />{tab.label}</> };
        })}
        active={active}
        onChange={selectTab}
        label="Admin settings section tabs"
      />

      {loading ? <Panel className="p-6 text-sm text-muted-foreground">Loading admin controls...</Panel> : null}

      {active === "hub" ? (
        <div className="space-y-4">
          <SummaryGrid items={[
            { label: "Modules", value: hubStatus.modules_total },
            { label: "Disabled", value: hubStatus.modules_disabled },
            { label: "Warnings", value: hubStatus.warnings, tone: Number(hubStatus.warnings ?? 0) > 0 ? "warning" : "success" },
            { label: "Permission risks", value: hubStatus.permission_risks, tone: Number(hubStatus.permission_risks ?? 0) > 0 ? "warning" : "success" },
            { label: "Idle timeout", value: boolInput(securitySettings.idle_timeout_enabled ?? 1) ? `${text(securitySettings.idle_timeout_minutes ?? 15)} minutes` : "Disabled", tone: boolInput(securitySettings.idle_timeout_enabled ?? 1) ? "success" : "warning" },
            { label: "Cache mode", value: "Server authoritative", tone: "info" },
            { label: "Cache schema", value: cacheDiagnostics.cache_schema_version ?? "-", tone: "info" },
            { label: "Sensitive cache entries", value: cacheDiagnostics.sensitive_entries ?? 0, tone: Number(cacheDiagnostics.sensitive_entries ?? 0) > 0 ? "warning" : "success" }
          ]} />
          {!boolInput(securitySettings.idle_timeout_enabled ?? 1) ? <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Idle timeout is disabled. Production security posture is stronger with the default 15-minute idle timeout enabled.</div> : null}
          <RowsTable rows={hub.sections} columns={["title", "module_key", "enabled", "module_status", "warnings_count", "href"]} empty="No settings sections available." />
        </div>
      ) : null}

      {active === "modules" ? (
        <div className="space-y-4">
          {pendingModule ? (
            <Panel className="border-amber-200 bg-amber-50 p-4">
              <h3 className="text-sm font-semibold text-amber-900">Confirm module control change</h3>
              <p className="mt-1 text-sm text-amber-800">You are about to {boolInput(pendingModule.is_enabled) ? "disable" : "enable"} {text(pendingModule.module_name)}. No data will be deleted.</p>
              {moduleWarnings.length ? <RowsTable rows={moduleWarnings} columns={["severity", "type", "message", "module_key"]} empty="No dependency warnings." /> : <p className="mt-2 text-sm text-amber-800">No dependency warnings were returned.</p>}
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => void confirmModuleToggle()}>Confirm</Button>
                <Button size="sm" variant="outline" onClick={() => { setPendingModule(null); setModuleWarnings([]); }}>Cancel</Button>
              </div>
            </Panel>
          ) : null}
          <Panel className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Module</TableHead><TableHead>Status</TableHead><TableHead>Enabled</TableHead><TableHead>Required</TableHead><TableHead>Dependencies</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader>
                <TableBody>{modules.map((module) => <TableRow key={String(module.module_key)}><TableCell>{text(module.module_name)}<div className="text-xs text-muted-foreground">{text(module.module_key)}</div></TableCell><TableCell><Badge tone={statusTone(module.status)}>{text(module.status)}</Badge></TableCell><TableCell>{boolInput(module.is_enabled) ? "Yes" : "No"}</TableCell><TableCell>{boolInput(module.is_required) ? "Yes" : "No"}</TableCell><TableCell className="max-w-[360px] truncate">{text(module.dependency_keys)}</TableCell><TableCell><RowActionButton intent={boolInput(module.is_enabled) ? "disable" : "enable"} size="sm" title={boolInput(module.is_enabled) ? "Disable module" : "Enable module"} disabled={boolInput(module.is_required) && boolInput(module.is_enabled)} onClick={() => void requestModuleToggle(module)}>{boolInput(module.is_enabled) ? "Disable" : "Enable"}</RowActionButton></TableCell></TableRow>)}</TableBody>
              </Table>
            </div>
          </Panel>
        </div>
      ) : null}

      {active === "checks" ? <div className="space-y-4"><Button size="sm" onClick={() => runAction("Consistency checks completed.", async () => { if (token) setChecks((await api.runAdminConsistencyChecks(token)).checks); })}>Run consistency checks</Button><RowsTable rows={checks} columns={["severity", "status", "category", "check_name", "module_key", "message", "suggested_action", "last_checked_at"]} empty="No consistency checks yet." /></div> : null}

      {active === "audit" ? <div className="space-y-4"><Panel className="p-4"><StandardFilterBar search={<StandardSearchInput value={auditFilters.search} onDebouncedChange={(search) => setAuditFilters((current) => ({ ...current, search }))} placeholder="Search audit log" />} reset={<FilterResetButton onReset={() => setAuditFilters({ search: "", module: "", action: "", date_from: "", date_to: "" })} />} actions={<Button size="sm" variant="outline" onClick={() => void load()}>Filter</Button>} moreFilters={<MoreFiltersSheet onReset={() => setAuditFilters({ search: "", module: "", action: "", date_from: "", date_to: "" })} onApply={() => void load()}><FilterSection title="Audit metadata"><Input placeholder="Module" value={auditFilters.module} onChange={(e) => setAuditFilters({ ...auditFilters, module: e.target.value })} /><Input placeholder="Action" value={auditFilters.action} onChange={(e) => setAuditFilters({ ...auditFilters, action: e.target.value })} /><StandardDateRangeFilter value={auditDateRange} onChange={(range) => setAuditFilters((current) => ({ ...current, date_from: range.from ?? "", date_to: range.to ?? "" }))} label="Audit Date Range" /></FilterSection></MoreFiltersSheet>} /><ActiveFilterChips chips={auditFilterChips} className="mt-2" /></Panel><RowsTable rows={auditRows} columns={["created_at", "module", "action", "entity_type", "entity_id", "actor_email", "reason", "sensitive", "restricted"]} empty="No audit logs found." /></div> : null}

      {active === "security-events" ? <RowsTable rows={securityEvents} columns={["created_at", "severity", "event_type", "result", "actor_email_snapshot", "target_user_id", "module_key", "message", "restricted"]} empty="No security events found." /> : null}

      {active === "permission-risks" ? <div className="space-y-4"><Button size="sm" onClick={() => runAction("Permission sanity checks completed.", async () => { if (token) setPermissionRisks((await api.runPermissionRisks(token)).findings); })}>Run permission sanity checks</Button><RowsTable rows={permissionRisks} columns={["severity", "status", "finding_key", "role_id", "user_id", "permission_key", "message", "detected_at"]} empty="No permission risks found." /></div> : null}

      {active === "scope-review" ? <RowsTable rows={scopeReview.map((row) => ({ ...row, roles: text(row.roles), scopes: text(row.scopes), broad_access_warnings: text(row.broad_access_warnings) }))} columns={["name", "email", "status", "roles", "permission_count", "sensitive_permission_count", "broad_access_warnings", "is_owner"]} empty="No access scope review rows." /> : null}

      {active === "security-settings" ? (
        <Panel className="space-y-4 p-4">
          <div>
            <h2 className="text-sm font-semibold">Session and idle timeout</h2>
            <p className="text-xs text-muted-foreground">Default idle logout is 15 minutes. The warning dialog appears before logout and sensitive IndexedDB cache is cleared.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="grid gap-1 text-sm font-medium">Max session minutes<Input type="number" value={text(securitySettings.session_timeout_minutes)} onChange={(e) => setSecuritySettings({ ...securitySettings, session_timeout_minutes: e.target.value })} /></label>
            <label className="grid gap-1 text-sm font-medium">Idle timeout minutes<Input type="number" value={text(securitySettings.idle_timeout_minutes ?? 15)} onChange={(e) => setSecuritySettings({ ...securitySettings, idle_timeout_minutes: e.target.value })} /></label>
            <label className="grid gap-1 text-sm font-medium">Warning seconds<Input type="number" value={text(securitySettings.warn_before_logout_seconds ?? 60)} onChange={(e) => setSecuritySettings({ ...securitySettings, warn_before_logout_seconds: e.target.value })} /></label>
            <label className="grid gap-1 text-sm font-medium">Sensitive page timeout minutes<Input type="number" value={text(securitySettings.sensitive_page_idle_timeout_minutes ?? 10)} onChange={(e) => setSecuritySettings({ ...securitySettings, sensitive_page_idle_timeout_minutes: e.target.value })} /></label>
            <label className="grid gap-1 text-sm font-medium">Password min length<Input type="number" value={text(securitySettings.password_policy_min_length)} onChange={(e) => setSecuritySettings({ ...securitySettings, password_policy_min_length: e.target.value })} /></label>
          </div>
          <div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-3">
            <SettingsToggle label="Idle timeout enabled" checked={boolInput(securitySettings.idle_timeout_enabled ?? 1)} onChange={(checked) => setSecuritySettings({ ...securitySettings, idle_timeout_enabled: checked })} />
            <SettingsToggle label="Extend session on activity" checked={boolInput(securitySettings.extend_session_on_activity ?? 1)} onChange={(checked) => setSecuritySettings({ ...securitySettings, extend_session_on_activity: checked })} />
            <SettingsToggle label="Apply to admin" checked={boolInput(securitySettings.apply_idle_timeout_to_admin ?? 1)} onChange={(checked) => setSecuritySettings({ ...securitySettings, apply_idle_timeout_to_admin: checked })} />
            <SettingsToggle label="Apply to self-service" checked={boolInput(securitySettings.apply_idle_timeout_to_self_service ?? 1)} onChange={(checked) => setSecuritySettings({ ...securitySettings, apply_idle_timeout_to_self_service: checked })} />
            <SettingsToggle label="Stricter sensitive-page timeout" checked={boolInput(securitySettings.stricter_timeout_for_sensitive_pages ?? 1)} onChange={(checked) => setSecuritySettings({ ...securitySettings, stricter_timeout_for_sensitive_pages: checked })} />
            <SettingsToggle label="Audit timeout logout" checked={boolInput(securitySettings.audit_timeout_logout ?? 1)} onChange={(checked) => setSecuritySettings({ ...securitySettings, audit_timeout_logout: checked })} />
            <SettingsToggle label="Audit failed permission checks" checked={boolInput(securitySettings.audit_failed_permission_checks)} onChange={(checked) => setSecuritySettings({ ...securitySettings, audit_failed_permission_checks: checked })} />
            <SettingsToggle label="Audit sensitive views" checked={boolInput(securitySettings.audit_sensitive_views)} onChange={(checked) => setSecuritySettings({ ...securitySettings, audit_sensitive_views: checked })} />
            <SettingsToggle label="Audit sensitive exports" checked={boolInput(securitySettings.audit_sensitive_exports)} onChange={(checked) => setSecuritySettings({ ...securitySettings, audit_sensitive_exports: checked })} />
          </div>
          <div className="rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm text-cyan-800">PBKDF2 expected value is display-only and remains locked at 100000. MFA and force logout controls are placeholders only.</div>
          <Button size="sm" onClick={() => void saveSecuritySettings()}>Save security settings</Button>
        </Panel>
      ) : null}

      {active === "cache-sync" ? (
        <div className="space-y-4">
          <Panel className="space-y-3 p-4">
            <div>
              <h2 className="text-sm font-semibold">Server-authoritative hybrid cache</h2>
              <p className="text-xs text-muted-foreground">HRM frontend cache is server-authoritative and IndexedDB-assisted. Cloudflare Worker API and D1 remain the source of truth.</p>
            </div>
            <SummaryGrid items={[
              { label: "Cache schema", value: cacheDiagnostics.cache_schema_version ?? "-" },
              { label: "App cache version", value: cacheDiagnostics.app_cache_version ?? "-" },
              { label: "Total entries", value: cacheDiagnostics.total_entries ?? 0 },
              { label: "Sensitive entries", value: cacheDiagnostics.sensitive_entries ?? 0, tone: Number(cacheDiagnostics.sensitive_entries ?? 0) > 0 ? "warning" : "success" },
              { label: "Expired entries", value: cacheDiagnostics.expired_entries ?? 0 },
              { label: "Last bootstrap", value: cacheDiagnostics.last_bootstrap_time ?? "-" },
              { label: "Last clear", value: cacheDiagnostics.last_cache_clear_time ?? "-" },
              { label: "Sync cursor", value: cacheDiagnostics.sync_cursor ?? "-" }
            ]} />
            <div className="rounded-md border bg-slate-50 px-3 py-2 text-sm text-slate-700">Admins can clear only this browser's local cache. Server data and other users' browsers are not affected. {text(preserveSafeUiPreferences().preserved_keys)}</div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => void getFrontendCacheDiagnostics().then(setCacheDiagnostics)}>Refresh diagnostics</Button>
              <Button size="sm" variant="outline" onClick={() => setCacheClearConfirm(true)}>Clear current browser cache</Button>
            </div>
          </Panel>
          <JsonPanel title="Cache diagnostics" data={cacheDiagnostics} />
        </div>
      ) : null}

      {active === "health" ? <div className="space-y-4"><Button size="sm" onClick={() => runAction("System health refreshed.", async () => { if (token) setHealth((await api.refreshSystemHealth(token)).health); })}>Refresh health</Button><JsonPanel title="System health summary" data={health} /></div> : null}
      {active === "remote-schema" ? <JsonPanel title="Remote D1 schema tooling status" data={remoteSchema} /> : null}

      {active === "data-transfer" ? <Panel className="space-y-3 p-4"><div><h2 className="text-sm font-semibold">Data import/export and deployment readiness</h2><p className="text-xs text-muted-foreground">Prompt 22 keeps import validation, export history, backup guidance, migration guidance, QA, smoke tests, and deployment readiness separate from destructive production operations.</p></div><div className="flex flex-wrap gap-2"><NavLink to="/settings/admin/imports"><ActionTextButton intent="import" size="sm">Data Import Center</ActionTextButton></NavLink><NavLink to="/settings/admin/import-templates"><ActionTextButton intent="import" size="sm">Import Templates</ActionTextButton></NavLink><NavLink to="/settings/admin/exports"><ActionTextButton intent="export" size="sm">Export Center</ActionTextButton></NavLink><NavLink to="/settings/admin/backup-readiness"><Button size="sm" variant="outline">Backup Readiness</Button></NavLink><NavLink to="/settings/admin/migration-readiness"><Button size="sm" variant="outline">Migration Guidance</Button></NavLink><NavLink to="/settings/admin/remote-d1-apply-guide"><Button size="sm" variant="outline">Remote D1 Guide</Button></NavLink><NavLink to="/settings/admin/qa-test-matrix"><Button size="sm" variant="outline">QA Matrix</Button></NavLink><NavLink to="/settings/admin/smoke-tests"><Button size="sm" variant="outline">Smoke Tests</Button></NavLink><NavLink to="/settings/admin/deployment-readiness"><Button size="sm" variant="outline">Deployment Readiness</Button></NavLink><NavLink to="/settings/admin/data-transfer-settings"><Button size="sm" variant="outline">Transfer Settings</Button></NavLink></div></Panel> : null}

      {active === "retention" ? <Panel className="space-y-4 p-4"><div className="grid gap-3 md:grid-cols-3"><Input type="number" value={text(retention.audit_log_retention_days)} onChange={(e) => setRetention({ ...retention, audit_log_retention_days: e.target.value })} /><Input type="number" value={text(retention.security_event_retention_days)} onChange={(e) => setRetention({ ...retention, security_event_retention_days: e.target.value })} /><Input type="number" value={text(retention.notification_retention_days)} onChange={(e) => setRetention({ ...retention, notification_retention_days: e.target.value })} /></div><div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Automatic destructive cleanup is not implemented in Prompt 21. These are future-job settings only.</div><Button size="sm" onClick={() => void saveRetention()}>Save retention settings</Button></Panel> : null}

      {active === "export-security" ? <Panel className="space-y-4 p-4"><div className="grid gap-3 md:grid-cols-2"><Input type="number" value={text(exportSecurity.max_export_rows)} onChange={(e) => setExportSecurity({ ...exportSecurity, max_export_rows: e.target.value })} /><Input type="number" placeholder="Max date range days" value={text(exportSecurity.max_export_date_range_days)} onChange={(e) => setExportSecurity({ ...exportSecurity, max_export_date_range_days: e.target.value })} /></div><div className="grid gap-3 text-sm md:grid-cols-2 xl:grid-cols-4"><SettingsToggle label="CSV export" checked={boolInput(exportSecurity.csv_export_enabled)} onChange={(checked) => setExportSecurity({ ...exportSecurity, csv_export_enabled: checked })} /><SettingsToggle label="JSON export" checked={boolInput(exportSecurity.json_export_enabled)} onChange={(checked) => setExportSecurity({ ...exportSecurity, json_export_enabled: checked })} /><SettingsToggle label="Sensitive export reason" checked={boolInput(exportSecurity.sensitive_export_requires_reason)} onChange={(checked) => setExportSecurity({ ...exportSecurity, sensitive_export_requires_reason: checked })} /><SettingsToggle label="Sensitive export audit" checked={boolInput(exportSecurity.sensitive_export_audit_enabled)} onChange={(checked) => setExportSecurity({ ...exportSecurity, sensitive_export_audit_enabled: checked })} /></div><Button size="sm" onClick={() => void saveExportSecurity()}>Save export controls</Button></Panel> : null}

      {active === "readiness" ? <div className="space-y-4"><Button size="sm" onClick={() => runAction("Production readiness checks completed.", async () => { if (token) setReadiness((await api.runProductionReadiness(token)).checks); })}>Run readiness checks</Button><RowsTable rows={readiness} columns={["status", "category", "check_name", "message", "last_checked_at"]} empty="No readiness checks yet." /></div> : null}
      {active === "environment" ? <div className="space-y-4"><Button size="sm" onClick={() => runAction("Environment safety checked.", async () => { if (token) setEnvironment((await api.runEnvironmentSafety(token)).environment_safety); })}>Run environment safety check</Button><JsonPanel title="Environment safety" data={environment} /></div> : null}
      {active === "alerts" ? <div className="space-y-4"><Button size="sm" onClick={() => runAction("Admin alerts refreshed.", async () => { if (token) setAlerts((await api.refreshAdminSystemAlerts(token)).alerts); })}>Refresh admin alerts</Button><RowsTable rows={alerts} columns={["severity", "status", "alert_type", "module_key", "title", "message", "created_at"]} empty="No admin alerts." /></div> : null}
      {active === "reports" ? <div className="space-y-4"><Panel className="flex flex-wrap gap-2 p-4"><SelectField className="h-9 rounded-md border bg-white px-3 text-sm" value={reportKey} onChange={(e) => setReportKey(e.target.value)}>{reportOptions.map((option) => <option key={option} value={option}>{option}</option>)}</SelectField><Button size="sm" onClick={() => void loadReport()}>Load report</Button></Panel><RowsTable rows={reportRows} columns={Object.keys(reportRows[0] ?? { status: "", message: "" }).slice(0, 8)} empty="No report rows loaded." /></div> : null}
      <ConfirmDialog open={cacheClearConfirm} title="Clear local cache?" description="This clears the current browser's IndexedDB HRM cache only. Server records are not changed." confirmLabel="Clear cache" cancelLabel="Cancel" onConfirm={() => void clearLocalCache()} onCancel={() => setCacheClearConfirm(false)} />
    </PageShell>
  );
}
