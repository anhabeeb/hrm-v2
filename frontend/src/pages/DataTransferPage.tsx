import {
  Archive,
  ClipboardCheck,
  Database,
  Download,
  FileSpreadsheet,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  Upload
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { AdminHelpLink } from "../features/admin-help/AdminHelpLink";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import { FileUploadField, PageHeader, PageShell, SelectField, StandardTabs, TextareaField } from "../components/ui/page-shell";

type Row = Record<string, unknown>;
type Mode = "imports" | "templates" | "exports" | "backup" | "migration" | "remote-d1" | "qa" | "smoke" | "deployment" | "settings";
type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const tabs: Array<{ key: Mode; label: string; icon: typeof Upload }> = [
  { key: "imports", label: "Data Import Center", icon: Upload },
  { key: "templates", label: "Import Templates", icon: FileSpreadsheet },
  { key: "exports", label: "Data Export Center", icon: Download },
  { key: "backup", label: "Backup Readiness", icon: Archive },
  { key: "migration", label: "Migration / Restore", icon: Database },
  { key: "remote-d1", label: "Remote D1 Apply Guide", icon: Database },
  { key: "qa", label: "QA Test Matrix", icon: ClipboardCheck },
  { key: "smoke", label: "Smoke Tests", icon: PlayCircle },
  { key: "deployment", label: "Deployment Readiness", icon: ShieldCheck },
  { key: "settings", label: "Transfer Settings", icon: ShieldCheck }
];

function text(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ") || "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function tone(value: unknown): Tone {
  const status = String(value ?? "").toUpperCase();
  if (["PASS", "READY", "READY_TO_APPLY", "APPLIED", "APPLIED_WITH_WARNINGS", "COMPLETED", "DEPLOYED"].includes(status)) return "success";
  if (["WARNING", "UPLOADED", "VALIDATING", "NOT_TESTED", "PLANNED", "SKIPPED", "PLACEHOLDER"].includes(status)) return "warning";
  if (["FAIL", "FAILED", "VALIDATION_FAILED", "CANCELLED", "NOT_READY", "BLOCKED"].includes(status)) return "danger";
  return "neutral";
}

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((item): item is Row => typeof item === "object" && item !== null) : [];
}

function RowTable({ data, columns, empty }: { data: Row[]; columns: string[]; empty: string }) {
  return (
    <Panel className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>{columns.map((column) => <TableHead key={column}>{column.replace(/_/g, " ")}</TableHead>)}</TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, index) => (
              <TableRow key={String(row.id ?? row.key ?? row.batch_number ?? row.test_key ?? index)}>
                {columns.map((column) => (
                  <TableCell key={column} className="max-w-[360px] truncate">
                    {["status", "validation_status", "apply_status", "deployment_status"].includes(column)
                      ? <Badge tone={tone(row[column])}>{text(row[column])}</Badge>
                      : text(row[column])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!data.length ? <EmptyState title={empty} description="No rows are available yet." /> : null}
      </div>
    </Panel>
  );
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function DataTransferPage({ mode = "imports" }: { mode?: Mode }) {
  const { token, user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [active, setActive] = useState<Mode>((searchParams.get("section") as Mode) || mode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [importTypes, setImportTypes] = useState<Row[]>([]);
  const [templates, setTemplates] = useState<Row[]>([]);
  const [batches, setBatches] = useState<Row[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<Row | null>(null);
  const [batchRows, setBatchRows] = useState<Row[]>([]);
  const [preview, setPreview] = useState<Row | null>(null);
  const [exportTypes, setExportTypes] = useState<Row[]>([]);
  const [exportHistory, setExportHistory] = useState<Row[]>([]);
  const [lastExport, setLastExport] = useState<Row | null>(null);
  const [backup, setBackup] = useState<{ checklist: Row[]; records: Row[] }>({ checklist: [], records: [] });
  const [migration, setMigration] = useState<Row>({});
  const [remoteGuide, setRemoteGuide] = useState<Row>({});
  const [qaItems, setQaItems] = useState<Row[]>([]);
  const [smoke, setSmoke] = useState<Row>({});
  const [deployment, setDeployment] = useState<Row>({});
  const [settings, setSettings] = useState<Row>({});
  const [importForm, setImportForm] = useState({ import_type: "employees", import_mode: "VALIDATE_ONLY", source_file_name: "", reason: "", notes: "", csv_text: "" });
  const [applyAck, setApplyAck] = useState("");
  const [exportForm, setExportForm] = useState({ export_type: "employees", reason: "" });

  const permissions = useMemo(() => new Set(user?.permissions ?? []), [user]);
  const canView = Boolean(user?.is_owner || permissions.has("data_import.view") || permissions.has("data_export.view") || permissions.has("deployment.readiness.view"));

  function choose(tab: Mode) {
    setActive(tab);
    setSearchParams({ section: tab });
  }

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    setError(null);
    try {
      const [importTypeData, templateData, batchData, exportTypeData, exportHistoryData, backupData, migrationData, remoteData, qaData, smokeData, deployData, settingsData] = await Promise.all([
        api.listDataImportTypes(token),
        api.listDataImportTemplates(token),
        api.listDataImportBatches(token),
        api.listDataExportTypes(token),
        api.listDataExportHistory(token),
        api.getBackupReadiness(token),
        api.getMigrationReadiness(token),
        api.getRemoteD1ApplyGuide(token),
        api.getQaTestMatrix(token),
        api.listSmokeTests(token),
        api.getDeploymentReadiness(token),
        api.getDataTransferSettings(token)
      ]);
      setImportTypes(importTypeData.types);
      setTemplates(rows(templateData.templates));
      setBatches(batchData.batches);
      setExportTypes(exportTypeData.types);
      setExportHistory(exportHistoryData.history);
      setBackup(backupData);
      setMigration(migrationData);
      setRemoteGuide(remoteData);
      setQaItems(qaData.items);
      setSmoke(smokeData);
      setDeployment(deployData);
      setSettings(settingsData.settings);
      if (!exportForm.export_type && exportTypeData.types[0]?.key) setExportForm((current) => ({ ...current, export_type: String(exportTypeData.types[0].key) }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load data transfer center.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, canView]);

  async function openBatch(batchId: string) {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const detail = await api.getDataImportBatch(token, batchId);
      setSelectedBatch(detail.batch);
      setBatchRows(detail.rows);
      const previewData = await api.getDataImportValidationPreview(token, batchId);
      setPreview(previewData.preview);
      setActive("imports");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load import batch.");
    } finally {
      setLoading(false);
    }
  }

  async function createBatch() {
    if (!token) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api.createDataImportBatch(token, importForm);
      setMessage("Import batch uploaded. Run validation before apply.");
      await load();
      await openBatch(String(result.batch.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to create import batch.");
    } finally {
      setLoading(false);
    }
  }

  async function validateBatch() {
    if (!token || !selectedBatch?.id) return;
    try {
      await api.validateDataImportBatch(token, String(selectedBatch.id));
      setMessage("Validation completed.");
      await openBatch(String(selectedBatch.id));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to validate import batch.");
    }
  }

  async function applyBatch() {
    if (!token || !selectedBatch?.id) return;
    try {
      await api.applyDataImportBatch(token, String(selectedBatch.id), { acknowledgement: applyAck, reason: importForm.reason });
      setApplyAck("");
      setMessage("Import apply finished. Review row-level results.");
      await openBatch(String(selectedBatch.id));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to apply import batch.");
    }
  }

  async function cancelBatch() {
    if (!token || !selectedBatch?.id) return;
    try {
      await api.cancelDataImportBatch(token, String(selectedBatch.id), importForm.reason || "Cancelled from Data Import Center.");
      setMessage("Import batch cancelled.");
      await openBatch(String(selectedBatch.id));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to cancel import batch.");
    }
  }

  async function downloadTemplate(importType: string) {
    if (!token) return;
    try {
      const result = await api.downloadDataImportTemplate(token, importType);
      saveBlob(result.blob, result.filename);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to download template.");
    }
  }

  async function downloadErrors() {
    if (!token || !selectedBatch?.id) return;
    try {
      const result = await api.downloadDataImportErrors(token, String(selectedBatch.id));
      saveBlob(result.blob, result.filename);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to download import errors.");
    }
  }

  async function runExport() {
    if (!token) return;
    try {
      const result = await api.runDataExport(token, exportForm.export_type, { reason: exportForm.reason });
      setLastExport(result.export);
      setMessage("Export generated and audit logged.");
      const history = await api.listDataExportHistory(token);
      setExportHistory(history.history);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to run export.");
    }
  }

  async function recordBackup() {
    if (!token) return;
    await api.recordBackupReadiness(token, { backup_type: "D1_DATABASE", status: "PLANNED", notes: "Manual backup record from Admin Data Transfer Center." });
    setMessage("Backup readiness record created.");
    await load();
  }

  async function seedQa() {
    if (!token) return;
    await api.seedQaTestMatrix(token);
    setMessage("QA defaults seeded.");
    await load();
  }

  async function recordSmoke() {
    if (!token) return;
    await api.recordSmokeTestResult(token, { status: "WARNING", summary: { note: "Record created from Admin UI. Run npm run smoke:production-readiness from CLI." } });
    setMessage("Smoke result placeholder recorded.");
    await load();
  }

  async function recordDeployment() {
    if (!token) return;
    await api.recordDeploymentReadiness(token, { environment_name: "production", deployment_status: "NOT_READY", d1_status: "CHECK_REQUIRED", r2_status: "CHECK_REQUIRED", schema_status: "CHECK_REQUIRED", seed_status: "CHECK_REQUIRED", production_readiness_status: "CHECK_REQUIRED", smoke_test_status: "CHECK_REQUIRED", known_blockers: [], last_deployment_note: "Manual deployment readiness record." });
    setMessage("Deployment readiness record created.");
    await load();
  }

  async function saveSettings() {
    if (!token) return;
    const updated = await api.updateDataTransferSettings(token, settings);
    setSettings(updated.settings);
    setMessage("Data transfer settings saved.");
  }

  if (!canView) {
    return (
      <PageShell>
        <PageHeader
          title="Data Import / Export & Deployment Readiness"
          eyebrow="Data transfer"
          description="Controlled CSV import, export history, backup guidance, migration readiness, QA, smoke, and deployment status."
        />
        <EmptyState title="Data transfer controls unavailable" description="You do not have permission to view the Prompt 22 data transfer center." />
      </PageShell>
    );
  }

  return (
    <PageShell constrained={false}>
      <PageHeader
        title="Data Import / Export & Deployment Readiness"
        eyebrow="Data transfer"
        description="Controlled CSV import, export history, backup guidance, migration readiness, QA, smoke, and deployment status."
        actions={
          <>
          <AdminHelpLink target={active === "deployment" || active === "remote-d1" || active === "qa" || active === "smoke" ? "deployment" : "dataImport"} label="View Operations Guide" />
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw className="h-4 w-4" /> Refresh</Button>
          </>
        }
      />

      <StandardTabs
        label="Data transfer section tabs"
        active={active}
        onChange={(key) => choose(key as Mode)}
        items={tabs.map((tab) => {
          const Icon = tab.icon;
          return {
            key: tab.key,
            label: <><Icon className="h-4 w-4" />{tab.label}</>
          };
        })}
      />

      {error ? <Panel className="border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</Panel> : null}
      {message ? <Panel className="border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</Panel> : null}

      {active === "imports" ? (
        <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
          <Panel className="space-y-3 p-4">
            <h2 className="text-sm font-semibold">Create import batch</h2>
            <SelectField className="h-9 w-full rounded-md border px-2 text-sm" value={importForm.import_type} onChange={(event) => setImportForm({ ...importForm, import_type: event.target.value })}>
              {importTypes.map((type) => <option key={String(type.key)} value={String(type.key)}>{text(type.label)}</option>)}
            </SelectField>
            <SelectField className="h-9 w-full rounded-md border px-2 text-sm" value={importForm.import_mode} onChange={(event) => setImportForm({ ...importForm, import_mode: event.target.value })}>
              {["VALIDATE_ONLY", "CREATE_ONLY", "UPDATE_ONLY", "UPSERT"].map((option) => <option key={option} value={option}>{option}</option>)}
            </SelectField>
            <Input placeholder="Reason for sensitive imports" value={importForm.reason} onChange={(event) => setImportForm({ ...importForm, reason: event.target.value })} />
            <FileUploadField
              label="CSV file"
              helper="Accepted formats: .csv, text/csv, text/plain."
              accept=".csv,text/csv,text/plain"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void file.text().then((csv_text) => setImportForm((current) => ({ ...current, csv_text, source_file_name: file.name })));
              }}
            />
            <TextareaField className="min-h-36 w-full rounded-md border p-2 text-xs" placeholder="Paste CSV text here" value={importForm.csv_text} onChange={(event) => setImportForm({ ...importForm, csv_text: event.target.value })} />
            <Button size="sm" onClick={() => void createBatch()} disabled={loading || !importForm.csv_text}><Upload className="h-4 w-4" /> Upload batch</Button>
          </Panel>
          <div className="space-y-4">
            <RowTable data={batches} columns={["batch_number", "import_type", "import_mode", "row_count", "valid_row_count", "invalid_row_count", "warning_count", "status", "created_at"]} empty="No import batches" />
            {batches.length ? <div className="flex flex-wrap gap-2">{batches.slice(0, 10).map((batch) => <Button key={String(batch.id)} variant="outline" size="sm" onClick={() => void openBatch(String(batch.id))}>Open {text(batch.batch_number)}</Button>)}</div> : null}
          </div>
          {selectedBatch ? (
            <Panel className="space-y-3 p-4 xl:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><h2 className="text-sm font-semibold">Batch detail: {text(selectedBatch.batch_number)}</h2><p className="text-xs text-muted-foreground">Validation preview, row errors, apply results, and rollback placeholder guidance.</p></div>
                <Badge tone={tone(selectedBatch.status)}>{text(selectedBatch.status)}</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => void validateBatch()}>Validate</Button>
                <Input className="max-w-40" placeholder="Type APPLY" value={applyAck} onChange={(event) => setApplyAck(event.target.value)} />
                <Button size="sm" onClick={() => void applyBatch()} disabled={applyAck !== "APPLY"}>Apply valid rows</Button>
                <Button size="sm" variant="outline" onClick={() => void cancelBatch()}>Cancel</Button>
                <Button size="sm" variant="outline" onClick={() => void downloadErrors()}><Download className="h-4 w-4" /> Errors CSV</Button>
              </div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Validation Preview</h3>
              {preview ? <RowTable data={[preview]} columns={["total_rows", "valid_rows", "invalid_rows", "duplicate_rows", "warnings", "create_rows", "update_rows", "skipped_rows"]} empty="No preview" /> : null}
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Import Errors / Results</h3>
              <RowTable data={batchRows} columns={["row_number", "validation_status", "apply_status", "action", "error_code", "error_message"]} empty="No row results" />
            </Panel>
          ) : null}
        </div>
      ) : null}

      {active === "templates" ? (
        <div className="space-y-3">
          <RowTable data={templates} columns={["key", "label", "category", "description"]} empty="No templates" />
          <div className="flex flex-wrap gap-2">{templates.map((template) => <Button key={String(template.key)} size="sm" variant="outline" onClick={() => void downloadTemplate(String(template.key))}><Download className="h-4 w-4" /> {text(template.label)}</Button>)}</div>
        </div>
      ) : null}

      {active === "exports" ? (
        <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
          <Panel className="space-y-3 p-4">
            <h2 className="text-sm font-semibold">Run export</h2>
            <SelectField className="h-9 w-full rounded-md border px-2 text-sm" value={exportForm.export_type} onChange={(event) => setExportForm({ ...exportForm, export_type: event.target.value })}>
              {exportTypes.map((type) => <option key={String(type.key)} value={String(type.key)}>{text(type.label)}</option>)}
            </SelectField>
            <Input placeholder="Reason for sensitive exports" value={exportForm.reason} onChange={(event) => setExportForm({ ...exportForm, reason: event.target.value })} />
            <Button size="sm" onClick={() => void runExport()}><Download className="h-4 w-4" /> Run export</Button>
            {lastExport ? <pre className="max-h-64 overflow-auto rounded bg-slate-50 p-2 text-xs">{text(lastExport.file_name)}{"\n"}{String(lastExport.csv_text ?? "").slice(0, 1500)}</pre> : null}
          </Panel>
          <div className="space-y-2">
            <h2 className="text-sm font-semibold">Export History</h2>
            <RowTable data={exportHistory} columns={["requested_at", "report_key", "report_name", "export_format", "row_count", "status", "sensitive_export", "file_name"]} empty="No export history" />
          </div>
        </div>
      ) : null}

      {active === "backup" ? <div className="space-y-4"><Button size="sm" onClick={() => void recordBackup()}>Record manual backup plan</Button><RowTable data={backup.checklist} columns={["command", "note", "browser_executable"]} empty="No backup guidance" /><RowTable data={backup.records} columns={["recorded_at", "backup_type", "status", "backup_reference", "notes"]} empty="No backup records" /></div> : null}
      {active === "migration" ? <Panel className="p-4"><h2 className="text-sm font-semibold">Migration / restore guidance</h2><p className="mt-1 text-sm text-muted-foreground">{text(migration.warning)}</p><ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{rows(migration.checklist).map((item, index) => <li key={index}>{text(item)}</li>)}{Array.isArray(migration.checklist) ? migration.checklist.map((item, index) => <li key={index}>{text(item)}</li>) : null}</ul></Panel> : null}
      {active === "remote-d1" ? <RowTable data={rows(remoteGuide.steps)} columns={["command", "note", "browser_executable"]} empty="No remote D1 guide" /> : null}
      {active === "qa" ? <div className="space-y-3"><Button size="sm" variant="outline" onClick={() => void seedQa()}>Seed defaults</Button><RowTable data={qaItems} columns={["category", "test_key", "test_name", "status", "tested_at", "notes", "evidence_reference"]} empty="No QA items" /></div> : null}
      {active === "smoke" ? <div className="space-y-3"><Button size="sm" variant="outline" onClick={() => void recordSmoke()}>Record smoke placeholder</Button><Panel className="p-3 text-sm">{text(smoke.cli_command)}<p className="mt-1 text-muted-foreground">{text(smoke.note)}</p></Panel><RowTable data={rows(smoke.runs)} columns={["started_at", "completed_at", "run_source", "status", "summary_json"]} empty="No smoke runs" /></div> : null}
      {active === "deployment" ? <div className="space-y-3"><Button size="sm" variant="outline" onClick={() => void recordDeployment()}>Record deployment readiness</Button><Panel className="p-3 text-sm">{text(deployment.rollback_guidance)}</Panel><RowTable data={rows(deployment.records)} columns={["recorded_at", "environment_name", "deployment_status", "d1_status", "r2_status", "schema_status", "seed_status", "smoke_test_status", "last_deployment_note"]} empty="No deployment records" /></div> : null}
      {active === "settings" ? (
        <Panel className="space-y-3 p-4">
          <h2 className="text-sm font-semibold">Import/export controls</h2>
          {["data_import_enabled", "data_export_enabled", "max_import_rows", "max_export_rows", "sensitive_import_requires_reason", "sensitive_export_requires_reason", "import_apply_requires_confirmation"].map((field) => (
            <label key={field} className="grid gap-1 text-xs font-medium text-muted-foreground md:grid-cols-[260px_1fr] md:items-center">
              {field.replace(/_/g, " ")}
              <Input value={text(settings[field]) === "-" ? "" : text(settings[field])} onChange={(event) => setSettings({ ...settings, [field]: event.target.value })} />
            </label>
          ))}
          <Button size="sm" onClick={() => void saveSettings()}>Save settings</Button>
        </Panel>
      ) : null}
    </PageShell>
  );
}
