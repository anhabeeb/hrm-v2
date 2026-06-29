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
  const [fileName, setFileName] = useState("");
  const [reason, setReason] = useState("");
  const [batch, setBatch] = useState<Record<string, unknown> | null>(null);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [preview, setPreview] = useState<ImportPreviewSummary | null>(null);
  const [ack, setAck] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const template = useMemo(() => templates.find((item) => item.key === importType) ?? templates[0], [importType, templates]);

  useEffect(() => {
    if (open) {
      setStep("template");
      setMessage(null);
      setError(null);
      setAck("");
    }
  }, [open]);

  async function downloadTemplate(format: "csv" | "xlsx") {
    if (!token || !template) return;
    setError(null);
    try {
      const result = await api.downloadDataImportTemplate(token, template.key, format);
      downloadBlob(result.blob, result.filename);
      setMessage(format === "xlsx" ? "Excel template downloaded with Instructions and Lookups sheets." : "CSV template downloaded.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to download template.");
    }
  }

  async function uploadBatch() {
    if (!token || !template) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.createDataImportBatch(token, {
        import_type: template.key,
        import_mode: importMode,
        source_file_name: fileName,
        reason,
        csv_text: csvText
      });
      setBatch(result.batch);
      const detail = await api.getDataImportBatch(token, String(result.batch.id));
      setRows(detail.rows);
      setStep("preview");
      setMessage("Import batch uploaded. Run validation preview before applying.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to upload import batch.");
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
      setMessage("Validation preview completed.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to validate import batch.");
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
      setMessage("Import apply finished. Review row-level results and audit history.");
      await onFinished?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to apply import batch.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadErrors() {
    if (!token || !batch?.id) return;
    const result = await api.downloadDataImportErrors(token, String(batch.id));
    downloadBlob(result.blob, result.filename);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="max-w-5xl">
        <SheetHeader>
          <SheetTitle>Import wizard</SheetTitle>
          <SheetDescription>Download a template, upload CSV/Excel-ready data, validate rows, then apply only after confirmation.</SheetDescription>
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
                <SelectField value={importMode} onChange={(event) => setImportMode(event.target.value)}>
                  {["VALIDATE_ONLY", "CREATE_ONLY", "UPDATE_ONLY", "UPSERT"].map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                </SelectField>
              </label>
              <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                Reason
                <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required for sensitive imports" />
              </label>
            </div>
            {template ? <p className="text-sm text-muted-foreground">{template.description}</p> : null}
          </Panel>
          {step === "template" ? (
            <Panel className="space-y-3 p-4">
              <h3 className="text-sm font-semibold">1. Download template</h3>
              <p className="text-sm text-muted-foreground">Excel templates include Instructions, Template, and hidden Lookups sheets with dropdown, date, number, required-field, and text guidance where applicable.</p>
              <div className="flex flex-wrap gap-2">
                <ActionTextButton intent="download" size="sm" onClick={() => void downloadTemplate("xlsx")}><FileSpreadsheet className="h-4 w-4" /> Download Excel template</ActionTextButton>
                <ActionTextButton intent="download" size="sm" onClick={() => void downloadTemplate("csv")}><Download className="h-4 w-4" /> Download CSV template</ActionTextButton>
              </div>
            </Panel>
          ) : null}
          {step === "upload" ? (
            <Panel className="space-y-3 p-4">
              <h3 className="text-sm font-semibold">2. Upload CSV/Excel data</h3>
              <FileUploadField
                label="Import file"
                helper="CSV is parsed directly. Excel templates provide validation guidance; save as CSV before upload if your browser cannot provide CSV text."
                accept=".csv,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setFileName(file.name);
                  void file.text().then((text) => setCsvText(text));
                }}
              />
              <TextareaField className="min-h-40 w-full rounded-md border p-2 text-xs" value={csvText} onChange={(event) => setCsvText(event.target.value)} placeholder="Paste CSV text here" />
              <ActionTextButton intent="upload" size="sm" onClick={() => void uploadBatch()} disabled={busy || !csvText.trim()}><Upload className="h-4 w-4" /> Upload batch</ActionTextButton>
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
              <ImportPreviewTable preview={preview} rows={rows} />
              <div className="flex flex-wrap gap-2">
                {step === "preview" ? <ActionTextButton intent="create" size="sm" onClick={() => void validateBatch()} disabled={busy}>Validate preview</ActionTextButton> : null}
                <ActionTextButton intent="download" size="sm" onClick={() => void downloadErrors()} disabled={!batch?.id}>Download error report</ActionTextButton>
              </div>
            </Panel>
          ) : null}
          {step === "confirm" ? (
            <Panel className="space-y-3 p-4">
              <h3 className="text-sm font-semibold">Confirm import</h3>
              <p className="text-sm text-muted-foreground">Type APPLY to commit valid rows. Invalid rows are not silently ignored. Rollback is recorded as a safe placeholder unless a module-specific rollback is implemented.</p>
              <Input className="max-w-44" value={ack} onChange={(event) => setAck(event.target.value)} placeholder="Type APPLY" />
              <ActionTextButton intent="confirm" size="sm" onClick={() => void applyBatch()} disabled={busy || ack !== "APPLY"}>Confirm import</ActionTextButton>
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
