import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { downloadBlob } from "../../lib/export-utils";
import { summarizePreview, type ImportPreviewSummary, type ImportTemplateDefinition } from "../../lib/import-utils";
import { ActionTextButton } from "../ui/action-button";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { FileUploadField, SelectField, TextareaField } from "../ui/page-shell";
import { Panel } from "../ui/panel";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "../ui/sheet";
import { useAlert } from "../alerts/useAlert";
import { ImportPreviewTable } from "./ImportPreviewTable";

type ImportWizardStep = "template" | "upload" | "preview" | "confirm" | "done";

export function ImportWizard({
  token,
  open,
  onOpenChange,
  templates,
  defaultImportType = "employees",
  onFinished
}: {
  token: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: ImportTemplateDefinition[];
  defaultImportType?: string;
  onFinished?: () => Promise<void> | void;
}) {
  const [step, setStep] = useState<ImportWizardStep>("template");
  const [importType, setImportType] = useState(defaultImportType);
  const [importMode, setImportMode] = useState("VALIDATE_ONLY");
  const [csvText, setCsvText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFileType, setSelectedFileType] = useState<"csv" | "xlsx" | null>(null);
  const [fileName, setFileName] = useState("");
  const [reason, setReason] = useState("");
  const [batch, setBatch] = useState<Record<string, unknown> | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [preview, setPreview] = useState<ImportPreviewSummary | null>(null);
  const [ack, setAck] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [templateBusy, setTemplateBusy] = useState<"csv" | "xlsx" | null>(null);
  const [errorsBusy, setErrorsBusy] = useState(false);
  const alerts = useAlert();
  const template = useMemo(() => templates.find((item) => item.key === importType) ?? templates[0], [importType, templates]);
  const placeholderOnly = Boolean(template?.placeholderOnly);

  useEffect(() => {
    if (open) {
      setStep("template");
      setMessage(null);
      setError(null);
      setAck("");
      setCsvText("");
      setSelectedFile(null);
      setSelectedFileType(null);
      setFileName("");
    }
  }, [open]);

  useEffect(() => {
    if (placeholderOnly && importMode !== "VALIDATE_ONLY") setImportMode("VALIDATE_ONLY");
  }, [placeholderOnly, importMode]);

  async function downloadTemplate(format: "csv" | "xlsx") {
    if (!token || !template) return;
    setTemplateBusy(format);
    setError(null);
    try {
      const result = await api.downloadDataImportTemplate(token, template.key, format);
      downloadBlob(result.blob, result.filename);
      const successMessage = format === "xlsx" ? "Excel template downloaded with Instructions and Lookups sheets." : "CSV template downloaded.";
      setMessage(successMessage);
      alerts.showSuccess("Template downloaded", successMessage);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Unable to download template.";
      setError(message);
      alerts.showApiError(err, "Unable to download template.");
    } finally {
      setTemplateBusy(null);
    }
  }

  async function uploadBatch() {
    if (!token || !template) return;
    setBusy(true);
    setError(null);
    try {
      const effectiveMode = placeholderOnly ? "VALIDATE_ONLY" : importMode;
      const result = selectedFile
        ? await api.createDataImportBatchFromFile(token, (() => {
          const form = new FormData();
          form.append("import_type", template.key);
          form.append("import_mode", effectiveMode);
          form.append("reason", reason);
          form.append("source_file_name", selectedFile.name);
          form.append("file", selectedFile);
          return form;
        })())
        : await api.createDataImportBatch(token, {
          import_type: template.key,
          import_mode: effectiveMode,
          source_file_name: fileName,
          reason,
          csv_text: csvText
        });
      setBatch(result.batch);
      const detail = await api.getDataImportBatch(token, String(result.batch.id));
      setRows(detail.rows);
      setStep("preview");
      const successMessage = placeholderOnly ? "Validation-only batch uploaded. Run validation preview; no records will be created or updated." : "Import batch uploaded. Run validation preview before applying.";
      setMessage(successMessage);
      alerts.showSuccess("Import batch uploaded", successMessage);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Unable to upload import batch.";
      setError(message);
      alerts.showApiError(err, "Unable to upload import batch.");
    } finally {
      setBusy(false);
    }
  }

  async function validateBatch() {
    if (!token || !batch?.id) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.validateDataImportBatch(token, String(batch.id));
      setBatch(result.batch);
      const previewData = await api.getDataImportValidationPreview(token, String(batch.id));
      const detail = await api.getDataImportBatch(token, String(batch.id));
      setPreview(previewData.preview as ImportPreviewSummary);
      setRows(detail.rows);
      setStep("confirm");
      const successMessage = placeholderOnly ? "Validation preview completed. This import type is validation-only." : "Validation preview completed.";
      setMessage(successMessage);
      alerts.showSuccess("Validation completed", successMessage);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Unable to validate import batch.";
      setError(message);
      alerts.showApiError(err, "Unable to validate import batch.");
    } finally {
      setBusy(false);
    }
  }

  async function applyBatch() {
    if (!token || !batch?.id) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.applyDataImportBatch(token, String(batch.id), { acknowledgement: ack, reason });
      setBatch(result.batch);
      setStep("done");
      const successMessage = "Import apply finished. Review row-level results and audit history.";
      setMessage(successMessage);
      alerts.showSuccess("Import applied", successMessage);
      await onFinished?.();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Unable to apply import batch.";
      setError(message);
      alerts.showApiError(err, "Unable to apply import batch.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadErrors() {
    if (!token || !batch?.id) return;
    setErrorsBusy(true);
    try {
      const result = await api.downloadDataImportErrors(token, String(batch.id));
      downloadBlob(result.blob, result.filename);
      alerts.showSuccess("Import errors downloaded", "Row-level import error file downloaded.");
    } catch (err) {
      alerts.showApiError(err, "Unable to download import errors.");
    } finally {
      setErrorsBusy(false);
    }
  }

  function selectImportFile(file: File | undefined) {
    setError(null);
    setSelectedFile(null);
    setSelectedFileType(null);
    setFileName("");
    if (!file) return;
    const name = file.name.toLowerCase();
    const mime = file.type.toLowerCase();
    const type = name.endsWith(".xlsx") || mime.includes("spreadsheetml.sheet") ? "xlsx" : name.endsWith(".csv") || mime === "text/csv" || mime === "text/plain" ? "csv" : null;
    if (!type) {
      const message = "Unsupported import file. Upload a CSV file or an Excel .xlsx template.";
      setError(message);
      alerts.showValidationError(message, "Unsupported file");
      return;
    }
    setSelectedFile(file);
    setSelectedFileType(type);
    setFileName(file.name);
    setCsvText("");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="max-w-5xl">
        <SheetHeader>
          <SheetTitle>Import wizard</SheetTitle>
          <SheetDescription>Download a template, upload CSV or Excel .xlsx data, validate rows, then apply only after confirmation.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid gap-2 md:grid-cols-5">
            {["template", "upload", "preview", "confirm", "done"].map((item) => (
              <div key={item} className={`rounded-md border px-3 py-2 text-xs font-medium ${step === item ? "border-primary bg-primary/10 text-primary" : "bg-white text-muted-foreground"}`}>{item.replace(/^\w/, (letter) => letter.toUpperCase())}</div>
            ))}
          </div>
          {error ? <Panel className="border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</Panel> : null}
          {message ? <Panel className="border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</Panel> : null}
          <Panel className="space-y-3 p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                Import type
                <SelectField value={importType} onChange={(event) => setImportType(event.target.value)}>
                  {templates.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                </SelectField>
              </label>
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                Mode
                <SelectField value={placeholderOnly ? "VALIDATE_ONLY" : importMode} disabled={placeholderOnly} onChange={(event) => setImportMode(event.target.value)}>
                  {["VALIDATE_ONLY", "CREATE_ONLY", "UPDATE_ONLY", "UPSERT"].map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                </SelectField>
              </label>
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                Reason
                <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required for sensitive imports" />
              </label>
            </div>
            {template ? <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-muted-foreground">{template.description}</p>
                {placeholderOnly ? <Badge tone="warning">Validation only</Badge> : <Badge tone="success">Apply handler available</Badge>}
              </div>
              {placeholderOnly ? <p className="text-xs text-amber-700">Apply handler not available yet. You can download templates, upload files, and preview validation; no records will be created or updated.</p> : null}
            </div> : null}
          </Panel>
          {step === "template" ? (
            <Panel className="space-y-3 p-4">
              <h3 className="text-sm font-semibold">1. Download template</h3>
              <p className="text-sm text-muted-foreground">Excel templates include Instructions, Template, and hidden Lookups sheets with dropdown, date, number, required-field, and text guidance where applicable.</p>
              {placeholderOnly ? <Panel className="border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Validation-only import. Upload and preview are supported, but Confirm Import is hidden because this import type has no apply handler yet.</Panel> : null}
              <div className="flex flex-wrap gap-2">
                <ActionTextButton intent="download" size="sm" loading={templateBusy === "xlsx"} disabled={Boolean(templateBusy)} onClick={() => void downloadTemplate("xlsx")}><FileSpreadsheet className="h-4 w-4" /> Download Excel template</ActionTextButton>
                <ActionTextButton intent="download" size="sm" loading={templateBusy === "csv"} disabled={Boolean(templateBusy)} onClick={() => void downloadTemplate("csv")}><Download className="h-4 w-4" /> Download CSV template</ActionTextButton>
              </div>
            </Panel>
          ) : null}
          {step === "upload" ? (
            <Panel className="space-y-3 p-4">
              <h3 className="text-sm font-semibold">2. Upload CSV or Excel data</h3>
              <FileUploadField
                label="Import file"
                helper="CSV files are parsed as comma-separated text. Excel .xlsx files are parsed from the Template sheet or first worksheet."
                accept=".csv,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(event) => selectImportFile(event.target.files?.[0])}
              />
              {selectedFile ? <Panel className="border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
                Selected {selectedFileType === "xlsx" ? "Excel .xlsx" : "CSV"} file: <span className="font-medium">{fileName}</span>
                {selectedFileType === "xlsx" ? <span className="block text-xs">Excel file will be parsed from the Template sheet.</span> : null}
              </Panel> : null}
              <TextareaField className="min-h-32 w-full rounded-md border p-2 text-xs" value={csvText} disabled={Boolean(selectedFile)} onChange={(event) => { setCsvText(event.target.value); setSelectedFile(null); setSelectedFileType(null); setFileName("pasted-csv.csv"); }} placeholder="Optional fallback: paste CSV text here" />
              {placeholderOnly ? <Panel className="border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Validation-only import; no records will be created or updated after validation.</Panel> : null}
              <ActionTextButton intent="upload" size="sm" loading={busy} onClick={() => void uploadBatch()} disabled={busy || (!selectedFile && !csvText.trim())}><Upload className="h-4 w-4" /> Upload batch</ActionTextButton>
            </Panel>
          ) : null}
          {(step === "preview" || step === "confirm" || step === "done") ? (
            <Panel className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Validation preview</h3>
                {batch?.status ? <Badge>{String(batch.status)}</Badge> : null}
              </div>
              <div className="grid gap-2 md:grid-cols-5">
                {summarizePreview(preview).map((item) => <Panel key={item.label} className="p-3"><div className="text-xs text-muted-foreground">{item.label}</div><div className="text-lg font-semibold">{item.value}</div></Panel>)}
              </div>
              <ImportPreviewTable preview={preview} rows={rows} loading={busy && step === "preview"} />
              <div className="flex flex-wrap gap-2">
                {step === "preview" ? <ActionTextButton intent="create" size="sm" loading={busy} onClick={() => void validateBatch()} disabled={busy}>Validate preview</ActionTextButton> : null}
                <ActionTextButton intent="download" size="sm" loading={errorsBusy} onClick={() => void downloadErrors()} disabled={!batch?.id || errorsBusy}>Download error report</ActionTextButton>
              </div>
            </Panel>
          ) : null}
          {step === "confirm" ? (
            <Panel className="space-y-3 p-4">
              {placeholderOnly ? <>
                <h3 className="text-sm font-semibold">Validation-only result</h3>
                <p className="text-sm text-muted-foreground">Apply handler not available yet. This batch can be reviewed and exported as an error report, but it will not create or update records.</p>
                <Badge tone="warning">No commit action available</Badge>
              </> : <>
                <h3 className="text-sm font-semibold">Confirm import</h3>
                <p className="text-sm text-muted-foreground">Type APPLY to commit valid rows. Invalid rows are not silently ignored. Rollback is recorded as a safe placeholder unless a module-specific rollback is implemented.</p>
                <Input className="max-w-44" value={ack} onChange={(event) => setAck(event.target.value)} placeholder="Type APPLY" />
                <ActionTextButton intent="confirm" size="sm" loading={busy} onClick={() => void applyBatch()} disabled={busy || ack !== "APPLY"}>Confirm import</ActionTextButton>
              </>}
            </Panel>
          ) : null}
        </div>
        <SheetFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
          {step !== "template" ? <Button variant="outline" size="sm" onClick={() => setStep("template")}>Back</Button> : null}
          {step === "template" ? <ActionTextButton intent="create" size="sm" onClick={() => setStep("upload")}>Continue to upload</ActionTextButton> : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
