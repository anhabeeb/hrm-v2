import { Download, FileUp, Plus, RefreshCw, Save, ShieldCheck, Wrench } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { AttendanceNav } from "../components/attendance/AttendanceNav";
import { ActiveFilterChips, FilterResetButton, FilterSection, MoreFiltersSheet, StandardFilterBar, StandardSearchInput, StandardSelectFilter, type ActiveFilterChip } from "../components/filters";
import { EmployeeCascadeSelect } from "../components/organization/EmployeeCascadeSelect";
import { ModuleSettingsBody } from "../components/settings/ModuleToggleHeader";
import { ActionTextButton } from "../components/ui/action-button";
import { Badge } from "../components/ui/badge";
import { Button, RowActionButton } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { AdminHelpLink } from "../features/admin-help/AdminHelpLink";
import { useAuth } from "../hooks/useAuth";
import { useOrganizationReferences } from "../hooks/useOrganizationReferences";
import { ApiError, api } from "../lib/api";
import type { AttendanceDevice, AttendanceDeviceSettings, AttendanceImportBatch, AttendanceImportRowError, AttendanceLockedDayWarning, AttendanceRawLog, AttendanceUnmatchedLog, AttendanceVendorIntegration, EmployeeBiometricMapping } from "../types/attendance";
import type { Employee } from "../types/employees";
import { CheckboxField, PageHeader, PageShell, SelectField } from "../components/ui/page-shell";

type Mode = "settings" | "mappings" | "imports" | "raw-logs" | "unmatched" | "errors" | "locked-warnings" | "diagnostics" | "vendor-integrations" | "reports";

const reportKeys = [
  "attendance-devices/raw-logs",
  "attendance-devices/import-batches",
  "attendance-devices/unmatched",
  "attendance-devices/duplicates",
  "attendance-devices/import-errors",
  "attendance-devices/sync-status",
  "attendance-devices/warnings",
  "attendance-devices/locked-day-imports",
  "attendance-devices/biometric-mappings",
  "attendance-devices/reconciliation",
  "attendance-devices/night-shift-warnings",
  "attendance-devices/manual-logs"
];

function tone(status?: string) {
  if (["ACTIVE", "COMPLETED", "RESOLVED", "NORMALIZED", "MATCHED", "ONLINE"].includes(status ?? "")) return "success" as const;
  if (["OPEN", "READY", "UPLOADED", "PENDING", "LOCKED_WARNING", "WARNING", "COMPLETED_WITH_ERRORS"].includes(status ?? "")) return "warning" as const;
  if (["ERROR", "FAILED", "UNMATCHED"].includes(status ?? "")) return "danger" as const;
  return "neutral" as const;
}

export function AttendanceDeviceOperationsPage({ mode }: { mode: Mode }) {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canDeviceView = permissions.has("attendance.devices.view") || permissions.has("attendance.devices.manage") || permissions.has("attendance.view");
  const canManage = permissions.has("attendance.devices.manage") || permissions.has("attendance.import_batches.manage");

  if (!token) return null;
  if (!canDeviceView && mode !== "reports") return <PageShell><Panel><EmptyState title="Attendance device access unavailable" description="Your account needs attendance device permissions." /></Panel></PageShell>;

  return (
    <PageShell>
      <PageHeader
        title={titleFor(mode)}
        description="ZKTeco import, bridge, ADMS placeholder, reconciliation, and protected payroll-lock handling."
        actions={<AdminHelpLink target="zkteco" label="View ZKTeco Guide" />}
      />
      <AttendanceNav />
      {mode === "settings" ? <DeviceSettings token={token} canManage={canManage} /> : null}
      {mode === "mappings" ? <BiometricMappings token={token} /> : null}
      {mode === "imports" ? <ImportBatches token={token} canManage={canManage} /> : null}
      {mode === "raw-logs" ? <RawLogs token={token} /> : null}
      {mode === "unmatched" ? <UnmatchedLogs token={token} /> : null}
      {mode === "errors" ? <ImportErrors token={token} /> : null}
      {mode === "locked-warnings" ? <LockedWarnings token={token} /> : null}
      {mode === "diagnostics" ? <Diagnostics token={token} /> : null}
      {mode === "vendor-integrations" ? <VendorIntegrations token={token} canManage={canManage} /> : null}
      {mode === "reports" ? <DeviceReports token={token} /> : null}
    </PageShell>
  );
}

function titleFor(mode: Mode) {
  return ({
    settings: "Attendance Device Settings",
    mappings: "Biometric Mappings",
    imports: "Attendance Imports",
    "raw-logs": "Raw Device Logs",
    unmatched: "Unmatched Logs",
    errors: "Import Row Errors",
    "locked-warnings": "Locked-Day Import Warnings",
    diagnostics: "Device Diagnostics",
    "vendor-integrations": "Vendor Integrations",
    reports: "Attendance Device Reports"
  } as const)[mode];
}

function DeviceSettings({ token, canManage }: { token: string; canManage: boolean }) {
  const [settings, setSettings] = useState<AttendanceDeviceSettings | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setSettings((await api.getAttendanceDeviceSettings(token)).settings);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load device settings.");
    }
  }

  useEffect(() => { void load(); }, [token]);

  async function save() {
    if (!settings) return;
    setError(null);
    setMessage(null);
    try {
      setSettings((await api.updateAttendanceDeviceSettings(token, settings)).settings);
      setMessage("Device integration settings saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save device settings.");
    }
  }

  if (!settings) return <Panel><EmptyState title="Loading settings" description="Fetching device integration settings." /></Panel>;
  const moduleEnabled = Boolean(settings.zkteco_csv_import_enabled || settings.zkteco_local_bridge_enabled || settings.zkteco_push_adms_enabled);
  return (
    <Panel className="p-4">
      <StatusLine error={error} message={message} />
      <ModuleSettingsBody disabled={!moduleEnabled} className="mt-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Toggle disabled={!canManage || !moduleEnabled} label="ZKTeco CSV import" checked={settings.zkteco_csv_import_enabled} onChange={(value) => setSettings({ ...settings, zkteco_csv_import_enabled: value })} />
        <Toggle disabled={!canManage || !moduleEnabled} label="Local bridge placeholder" checked={settings.zkteco_local_bridge_enabled} onChange={(value) => setSettings({ ...settings, zkteco_local_bridge_enabled: value })} />
        <Toggle disabled={!canManage || !moduleEnabled} label="ADMS push placeholder" checked={settings.zkteco_push_adms_enabled} onChange={(value) => setSettings({ ...settings, zkteco_push_adms_enabled: value })} />
        <Toggle disabled={!canManage || !moduleEnabled} label="Auto match biometric ID" checked={settings.auto_match_by_biometric_user_id} onChange={(value) => setSettings({ ...settings, auto_match_by_biometric_user_id: value })} />
        <Toggle disabled={!canManage || !moduleEnabled} label="Auto match employee no" checked={settings.auto_match_by_employee_no} onChange={(value) => setSettings({ ...settings, auto_match_by_employee_no: value })} />
        <Toggle disabled={!canManage || !moduleEnabled} label="Auto normalize after import" checked={settings.auto_normalize_after_import} onChange={(value) => setSettings({ ...settings, auto_normalize_after_import: value })} />
        <Toggle disabled={!canManage || !moduleEnabled} label="Protect payroll-locked days" checked={settings.prevent_locked_day_overwrite} onChange={(value) => setSettings({ ...settings, prevent_locked_day_overwrite: value })} />
        <Field label="Duplicate window seconds"><Input disabled={!canManage || !moduleEnabled} type="number" value={settings.duplicate_window_seconds ?? 60} onChange={(event) => setSettings({ ...settings, duplicate_window_seconds: Number(event.target.value) })} /></Field>
        <Field label="Max import rows"><Input disabled={!canManage || !moduleEnabled} type="number" value={settings.max_import_rows ?? 20000} onChange={(event) => setSettings({ ...settings, max_import_rows: Number(event.target.value) })} /></Field>
        <Field label="Default timezone"><Input disabled={!canManage || !moduleEnabled} value={settings.default_timezone ?? ""} onChange={(event) => setSettings({ ...settings, default_timezone: event.target.value })} /></Field>
        <Field label="Allowed CSV extensions"><Input disabled={!canManage || !moduleEnabled} value={settings.csv_allowed_extensions_json ?? ""} onChange={(event) => setSettings({ ...settings, csv_allowed_extensions_json: event.target.value })} /></Field>
        <Field label="Bridge clock skew minutes"><Input disabled={!canManage || !moduleEnabled} type="number" value={settings.bridge_clock_skew_minutes ?? 15} onChange={(event) => setSettings({ ...settings, bridge_clock_skew_minutes: Number(event.target.value) })} /></Field>
      </div>
      <div className="mt-4 flex justify-end"><ActionTextButton intent="save" disabled={!canManage || !moduleEnabled} onClick={() => void save()}><Save className="h-4 w-4" /> Save settings</ActionTextButton></div>
      </ModuleSettingsBody>
    </Panel>
  );
}

function BiometricMappings({ token }: { token: string }) {
  const [mappings, setMappings] = useState<EmployeeBiometricMapping[]>([]);
  const [devices, setDevices] = useState<AttendanceDevice[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [editing, setEditing] = useState<EmployeeBiometricMapping | null | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [mappingResult, deviceResult, employeeResult] = await Promise.all([api.listBiometricMappings(token, { search }), api.listAttendanceDevices(token), api.listEmployees(token)]);
      setMappings(mappingResult.mappings);
      setDevices(deviceResult.devices);
      setEmployees(employeeResult.employees);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load biometric mappings.");
    }
  }
  useEffect(() => { void load(); }, [token, search]);
  const chips = useMemo<ActiveFilterChip[]>(() => search ? [{ key: "search", label: "Search", value: search, onRemove: () => setSearch("") }] : [], [search]);

  return (
    <Panel className="overflow-hidden">
      <Toolbar chips={chips}><DeviceSearchInput value={search} onChange={setSearch} placeholder="Search employee, biometric ID, or code" /><FilterResetButton onReset={() => setSearch("")} /><ActionTextButton intent="create" size="sm" onClick={() => setEditing(null)}><Plus className="h-4 w-4" /> Add mapping</ActionTextButton></Toolbar>
      <StatusLine error={error} />
      <DataTable rows={mappings} columns={["employee_name", "employee_no", "device_name", "biometric_user_id", "external_employee_code", "mapping_source", "status"]} />
      {mappings.length === 0 ? <EmptyState title="No biometric mappings" description="Map ZKTeco biometric user IDs to employees." /> : null}
      {editing !== undefined ? <MappingModal token={token} mapping={editing} employees={employees} devices={devices} onClose={() => setEditing(undefined)} onSaved={load} /> : null}
    </Panel>
  );
}

function ImportBatches({ token, canManage }: { token: string; canManage: boolean }) {
  const [batches, setBatches] = useState<AttendanceImportBatch[]>([]);
  const [devices, setDevices] = useState<AttendanceDevice[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [deviceId, setDeviceId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const [batchResult, deviceResult] = await Promise.all([api.listAttendanceImportBatches(token), api.listAttendanceDevices(token)]);
    setBatches(batchResult.batches);
    setDevices(deviceResult.devices);
  }
  useEffect(() => { void load().catch((err) => setError(err instanceof ApiError ? err.message : "Unable to load import batches.")); }, [token]);

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setError(null);
    setMessage(null);
    try {
      const result = await api.uploadZktecoCsvAttendance(token, { file, attendance_device_id: deviceId || null });
      setMessage(`Import uploaded. Inserted ${String(result.inserted ?? 0)}, unmatched ${String(result.unmatched ?? 0)}, duplicates ${String(result.duplicates ?? 0)}.`);
      setFile(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to upload CSV import.");
    }
  }

  return (
    <div className="space-y-4">
      <Panel className="p-4">
        <StatusLine error={error} message={message} />
        {canManage ? <form onSubmit={(event) => void upload(event)} className="grid gap-3 md:grid-cols-[1fr_220px_auto]">
          <Input type="file" accept=".csv,.txt" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required />
          <SelectField className="h-9 rounded-md border bg-white px-3 text-sm" value={deviceId} onChange={(event) => setDeviceId(event.target.value)}><option value="">No device selected</option>{devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}</SelectField>
          <ActionTextButton intent="import" type="submit"><FileUp className="h-4 w-4" /> Upload CSV</ActionTextButton>
        </form> : <p className="text-sm text-muted-foreground">You can view import batches but cannot upload new files.</p>}
      </Panel>
      <Panel className="overflow-hidden"><DataTable rows={batches} columns={["batch_number", "source", "device_name", "file_name", "status", "total_rows", "inserted_rows", "duplicate_rows", "unmatched_rows", "error_rows", "locked_warning_rows", "uploaded_at"]} /></Panel>
    </div>
  );
}

function RawLogs({ token }: { token: string }) {
  const [rows, setRows] = useState<AttendanceRawLog[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function load() {
    setRows((await api.listAttendanceRawLogs(token, { search, process_status: status })).logs);
  }
  useEffect(() => { void load().catch((err) => setError(err instanceof ApiError ? err.message : "Unable to load raw logs.")); }, [token, search, status]);
  const chips = useMemo<ActiveFilterChip[]>(() => [
    ...(search ? [{ key: "search", label: "Search", value: search, onRemove: () => setSearch("") }] : []),
    ...(status ? [{ key: "status", label: "Status", value: status.replace(/_/g, " "), title: status, onRemove: () => setStatus("") }] : [])
  ], [search, status]);
  return <Panel className="overflow-hidden"><Toolbar chips={chips}><DeviceSearchInput value={search} onChange={setSearch} placeholder="Search raw logs" /><MoreFiltersSheet title="Raw log filters" onReset={() => setStatus("")}><FilterSection title="Processing"><StandardSelectFilter value={status} onValueChange={setStatus} options={["PENDING", "MATCHED", "UNMATCHED", "DUPLICATE", "ERROR", "NORMALIZED", "LOCKED_WARNING"].map((item) => ({ value: item, label: item.replace(/_/g, " ") }))} allLabel="All statuses" ariaLabel="Process status" /></FilterSection></MoreFiltersSheet><FilterResetButton onReset={() => { setSearch(""); setStatus(""); }} /></Toolbar><StatusLine error={error} /><DataTable rows={rows} columns={["employee_name", "employee_no", "device_name", "biometric_user_id", "external_employee_code", "punch_time", "punch_type", "source", "process_status", "error_message"]} /></Panel>;
}

function UnmatchedLogs({ token }: { token: string }) {
  const [rows, setRows] = useState<AttendanceUnmatchedLog[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selected, setSelected] = useState<AttendanceUnmatchedLog | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    const [unmatched, employeeResult] = await Promise.all([api.listAttendanceUnmatchedLogs(token), api.listEmployees(token)]);
    setRows(unmatched.unmatched_logs);
    setEmployees(employeeResult.employees);
  }
  useEffect(() => { void load().catch((err) => setError(err instanceof ApiError ? err.message : "Unable to load unmatched logs.")); }, [token]);
  return <Panel className="overflow-hidden"><StatusLine error={error} /><DataTable rows={rows} columns={["device_name", "biometric_user_id", "external_employee_code", "punch_time", "reason", "status", "created_at"]} action={(row) => <RowActionButton intent="save" size="sm" title="Resolve unmatched log" onClick={() => setSelected(row)}>Resolve</RowActionButton>} />{selected ? <ResolveUnmatchedModal token={token} log={selected} employees={employees} onClose={() => setSelected(null)} onSaved={load} /> : null}</Panel>;
}

function ImportErrors({ token }: { token: string }) {
  const [rows, setRows] = useState<AttendanceImportRowError[]>([]);
  const [error, setError] = useState<string | null>(null);
  async function load() { setRows((await api.listAttendanceImportErrors(token)).errors); }
  useEffect(() => { void load().catch((err) => setError(err instanceof ApiError ? err.message : "Unable to load import errors.")); }, [token]);
  return <Panel className="overflow-hidden"><StatusLine error={error} /><DataTable rows={rows} columns={["batch_number", "row_number", "error_code", "error_message", "status", "created_at"]} action={(row) => <RowActionButton intent="save" size="sm" title="Resolve import error" onClick={() => void api.resolveAttendanceImportError(token, row.id).then(load)}>Resolve</RowActionButton>} /></Panel>;
}

function LockedWarnings({ token }: { token: string }) {
  const [rows, setRows] = useState<AttendanceLockedDayWarning[]>([]);
  const [error, setError] = useState<string | null>(null);
  async function load() { setRows((await api.listAttendanceLockedDayWarnings(token)).warnings); }
  useEffect(() => { void load().catch((err) => setError(err instanceof ApiError ? err.message : "Unable to load locked-day warnings.")); }, [token]);
  return <Panel className="overflow-hidden"><StatusLine error={error} /><DataTable rows={rows} columns={["employee_name", "employee_no", "attendance_date", "warning_type", "message", "status", "created_at"]} action={(row) => <RowActionButton intent="save" size="sm" title="Resolve locked-day warning" onClick={() => void api.resolveAttendanceLockedDayWarning(token, row.id, "Reviewed").then(load)}><ShieldCheck className="h-4 w-4" /> Resolve</RowActionButton>} /></Panel>;
}

function Diagnostics({ token }: { token: string }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void api.getAttendanceDeviceDiagnosticsOverview(token).then((result) => setRows(result.diagnostics)).catch((err) => setError(err instanceof ApiError ? err.message : "Unable to load diagnostics.")); }, [token]);
  return <Panel className="overflow-hidden"><StatusLine error={error} /><DataTable rows={rows} columns={["name", "device_code", "vendor", "device_mode", "status", "health_status", "last_seen_at", "last_sync_at", "raw_log_count", "open_unmatched_count"]} /></Panel>;
}

function VendorIntegrations({ token, canManage }: { token: string; canManage: boolean }) {
  const [rows, setRows] = useState<AttendanceVendorIntegration[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function load() { setRows((await api.listAttendanceVendorIntegrations(token)).integrations); }
  useEffect(() => { void load().catch((err) => setError(err instanceof ApiError ? err.message : "Unable to load vendor integrations.")); }, [token]);
  return <Panel className="overflow-hidden"><Toolbar>{canManage ? <ActionTextButton intent="create" size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Add placeholder</ActionTextButton> : <span />}</Toolbar><StatusLine error={error} /><DataTable rows={rows} columns={["name", "vendor", "integration_type", "status", "last_test_status", "last_test_message"]} action={(row) => <RowActionButton intent="neutral" size="sm" title="Test vendor integration" onClick={() => void api.testAttendanceVendorIntegration(token, row.id).then(load)}><Wrench className="h-4 w-4" /> Test</RowActionButton>} />{creating ? <VendorModal token={token} onClose={() => setCreating(false)} onSaved={load} /> : null}</Panel>;
}

function DeviceReports({ token }: { token: string }) {
  const [key, setKey] = useState(reportKeys[0]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  async function load() {
    const report = (await api.getReport(token, key)).report;
    setRows(report.rows);
    setColumns(report.columns);
  }
  useEffect(() => { void load().catch((err) => setError(err instanceof ApiError ? err.message : "Unable to load attendance device report.")); }, [token, key]);
  async function exportCsv() {
    const download = await api.exportReportCsv(token, key);
    const url = URL.createObjectURL(download.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = download.filename || `${key.replace(/\//g, "-")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  const chips = useMemo<ActiveFilterChip[]>(() => key !== reportKeys[0] ? [{ key: "report", label: "Report", value: key, onRemove: () => setKey(reportKeys[0]) }] : [], [key]);
  return <Panel className="overflow-hidden"><Toolbar chips={chips}><StandardSelectFilter value={key} onValueChange={setKey} allLabel={reportKeys[0]} width="documentType" options={reportKeys.slice(1).map((item) => ({ value: item, label: item }))} /><FilterResetButton onReset={() => setKey(reportKeys[0])} /><ActionTextButton intent="export" size="sm" onClick={() => void exportCsv()}><Download className="h-4 w-4" /> Export CSV</ActionTextButton></Toolbar><StatusLine error={error} /><DataTable rows={rows} columns={columns} /></Panel>;
}

function MappingModal({ token, mapping, employees, devices, onClose, onSaved }: { token: string; mapping?: EmployeeBiometricMapping | null; employees: Employee[]; devices: AttendanceDevice[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const organizationRefs = useOrganizationReferences(token);
  const [form, setForm] = useState({
    employee_id: mapping?.employee_id ?? "",
    attendance_device_id: mapping?.attendance_device_id ?? "",
    biometric_user_id: mapping?.biometric_user_id ?? "",
    biometric_user_name: mapping?.biometric_user_name ?? "",
    external_employee_code: mapping?.external_employee_code ?? "",
    notes: mapping?.notes ?? ""
  });
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      if (mapping) await api.updateBiometricMapping(token, mapping.id, form);
      else await api.createBiometricMapping(token, form);
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save mapping.");
    }
  }
  return <Modal title={mapping ? "Edit Biometric Mapping" : "Add Biometric Mapping"} onClose={onClose}><form onSubmit={(event) => void submit(event)} className="grid gap-3 md:grid-cols-2"><StatusLine error={error} /><div className="md:col-span-2"><EmployeeCascadeSelect employees={employees} departments={organizationRefs.departments} locations={organizationRefs.locations} jobLevels={organizationRefs.jobLevels} positions={organizationRefs.positions} value={form.employee_id} onChange={(employee_id) => setForm({ ...form, employee_id })} /></div><Field label="Device"><SelectField className="h-9 rounded-md border bg-white px-3 text-sm" value={form.attendance_device_id} onChange={(event) => setForm({ ...form, attendance_device_id: event.target.value })}><option value="">Any device</option>{devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}</SelectField></Field><Field label="Biometric user ID"><Input required value={form.biometric_user_id} onChange={(event) => setForm({ ...form, biometric_user_id: event.target.value })} /></Field><Field label="Biometric user name"><Input value={form.biometric_user_name} onChange={(event) => setForm({ ...form, biometric_user_name: event.target.value })} /></Field><Field label="External employee code"><Input value={form.external_employee_code} onChange={(event) => setForm({ ...form, external_employee_code: event.target.value })} /></Field><Field label="Notes"><Input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field><div className="flex justify-end gap-2 md:col-span-2"><Button variant="outline" onClick={onClose}>Cancel</Button><ActionTextButton intent="save" type="submit">Save mapping</ActionTextButton></div></form></Modal>;
}

function ResolveUnmatchedModal({ token, log, employees, onClose, onSaved }: { token: string; log: AttendanceUnmatchedLog; employees: Employee[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const organizationRefs = useOrganizationReferences(token);
  const [employeeId, setEmployeeId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await api.mapAttendanceUnmatchedLog(token, log.id, { employee_id: employeeId, note });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to resolve unmatched log.");
    }
  }
  return <Modal title="Resolve unmatched biometric log" onClose={onClose}><form onSubmit={(event) => void submit(event)} className="space-y-3"><StatusLine error={error} /><p className="text-sm text-muted-foreground">Biometric ID {log.biometric_user_id ?? "-"} at {log.punch_time ?? "-"}.</p><EmployeeCascadeSelect employees={employees} departments={organizationRefs.departments} locations={organizationRefs.locations} jobLevels={organizationRefs.jobLevels} positions={organizationRefs.positions} value={employeeId} onChange={setEmployeeId} /><Field label="Resolution note"><Input value={note} onChange={(event) => setNote(event.target.value)} /></Field><div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><ActionTextButton intent="complete" type="submit">Resolve</ActionTextButton></div></form></Modal>;
}

function VendorModal({ token, onClose, onSaved }: { token: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [vendor, setVendor] = useState("ZKTECO");
  const [integrationType, setIntegrationType] = useState("API_PLACEHOLDER");
  async function submit(event: FormEvent) {
    event.preventDefault();
    await api.createAttendanceVendorIntegration(token, { name, vendor, integration_type: integrationType });
    await onSaved();
    onClose();
  }
  return <Modal title="Add vendor integration placeholder" onClose={onClose}><form onSubmit={(event) => void submit(event)} className="space-y-3"><Field label="Name"><Input required value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label="Vendor"><Input value={vendor} onChange={(event) => setVendor(event.target.value)} /></Field><Field label="Integration type"><SelectField className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={integrationType} onChange={(event) => setIntegrationType(event.target.value)}>{["CSV_IMPORT", "LOCAL_BRIDGE", "PUSH_ADMS", "API_PLACEHOLDER"].map((item) => <option key={item}>{item}</option>)}</SelectField></Field><div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><ActionTextButton intent="save" type="submit">Save placeholder</ActionTextButton></div></form></Modal>;
}

function DataTable<T extends object>({ rows, columns, action }: { rows: T[]; columns: string[]; action?: (row: T) => ReactNode }) {
  return <div className="overflow-x-auto"><Table><TableHeader><TableRow>{columns.map((column) => <TableHead key={column}>{column.replace(/_/g, " ")}</TableHead>)}{action ? <TableHead className="text-right">Actions</TableHead> : null}</TableRow></TableHeader><TableBody>{rows.map((row, index) => {
    const record = row as Record<string, unknown>;
    return <TableRow key={String(record.id ?? index)}>{columns.map((column) => <TableCell key={column}>{renderValue(record[column])}</TableCell>)}{action ? <TableCell><div className="flex justify-end">{action(row)}</div></TableCell> : null}</TableRow>;
  })}</TableBody></Table></div>;
}

function renderValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return new Date(text).toLocaleString();
  if (["ACTIVE", "INACTIVE", "DISABLED", "ARCHIVED", "OPEN", "RESOLVED", "IGNORED", "MATCHED", "UNMATCHED", "NORMALIZED", "ERROR", "LOCKED_WARNING", "COMPLETED", "COMPLETED_WITH_ERRORS"].includes(text)) return <Badge tone={tone(text)}>{text}</Badge>;
  return text;
}

function DeviceSearchInput({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <StandardSearchInput value={value} onDebouncedChange={onChange} placeholder={placeholder} />;
}

function Toolbar({ children, chips = [] }: { children: ReactNode; chips?: ActiveFilterChip[] }) {
  return <div className="border-b p-3"><StandardFilterBar className="border-0 shadow-none">{children}</StandardFilterBar><ActiveFilterChips chips={chips} className="mt-2" /></div>;
}

function StatusLine({ error, message }: { error?: string | null; message?: string | null }) {
  return <>{error ? <div className="m-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}{message ? <div className="m-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</div> : null}</>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean | number; disabled?: boolean; onChange: (checked: boolean) => void }) {
  return <CheckboxField label={label} checked={Boolean(checked)} disabled={disabled} onChange={onChange} className="min-h-10" />;
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4"><div className="w-full max-w-2xl rounded-lg border bg-white shadow-xl"><div className="flex items-center justify-between border-b px-4 py-3"><h2 className="text-base font-semibold">{title}</h2><Button size="sm" variant="outline" onClick={onClose}>Close</Button></div><div className="p-4">{children}</div></div></div>;
}

export default AttendanceDeviceOperationsPage;
