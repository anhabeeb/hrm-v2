import { Archive, Download, Eye, FileUp, ImageUp, RotateCcw, Trash2, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ApiError, api } from "../../lib/api";
import { focusFirstInvalidField, normalizeValidationIssues, useFormValidation, validateDateRange, validateRequiredField, type ValidationIssue } from "../../lib/form-validation";
import type { DocumentType, EmployeeDocument, EmployeeDocumentVersion, MissingDocument } from "../../types/documents";
import type { Employee } from "../../types/employees";
import { useAlert } from "../alerts/useAlert";
import { FormErrorSummary } from "../forms/FormErrorSummary";
import { ValidatedFileField, ValidatedReasonField, ValidatedSelectField, ValidatedTextField } from "../forms/validated-fields";
import { ActionTextButton } from "../ui/action-button";
import { Badge } from "../ui/badge";
import { Button, RowActionButton } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { TableSkeleton } from "../loading";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { EmployeeDocumentCompliancePanel } from "./EmployeeDocumentCompliancePanel";

function statusTone(status: string) {
  if (status === "VALID" || status === "ACTIVE") return "success";
  if (status === "EXPIRING_SOON") return "warning";
  if (status === "ARCHIVED" || status === "SOFT_DELETED") return "neutral";
  return "danger";
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function validateDocumentActionReason(reason: string): ValidationIssue[] {
  return validateRequiredField(reason, "reason", "Reason");
}

function validateDocumentUploadForm(input: {
  mode: "upload" | "replace" | "photo";
  documentTypeId: string;
  file: File | null;
  selectedType?: DocumentType;
  documentNumber: string;
  issueDate: string;
  expiryDate: string;
  reason: string;
}) {
  return [
    ...(input.mode === "upload" ? validateRequiredField(input.documentTypeId, "document_type_id", "Document type") : []),
    ...validateRequiredField(input.file ? "selected" : "", "file", "File"),
    ...(input.selectedType?.requires_document_number ? validateRequiredField(input.documentNumber, "document_number", "Document number") : []),
    ...(input.selectedType?.requires_issue_date ? validateRequiredField(input.issueDate, "issue_date", "Issue date") : []),
    ...(input.selectedType?.requires_expiry_date ? validateRequiredField(input.expiryDate, "expiry_date", "Expiry date") : []),
    ...(input.mode === "replace" ? validateRequiredField(input.reason, "reason_for_replacement", "Replacement reason") : []),
    ...validateDateRange({ start: input.issueDate, end: input.expiryDate, startField: "issue_date", endField: "expiry_date", label: "Expiry date" })
  ];
}

export function EmployeeDocumentsPanel({ employee, token, permissions, onChanged }: { employee: Employee; token: string; permissions: Set<string>; onChanged?: () => Promise<void> }) {
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [missing, setMissing] = useState<MissingDocument[]>([]);
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadModal, setUploadModal] = useState<{ mode: "upload" | "replace" | "photo"; document?: EmployeeDocument } | null>(null);
  const [versions, setVersions] = useState<{ document: EmployeeDocument; rows: EmployeeDocumentVersion[] } | null>(null);
  const [documentAction, setDocumentAction] = useState<{ document: EmployeeDocument; name: "archive" | "restore" | "soft-delete" | "permanent-delete"; reason: string } | null>(null);
  const alerts = useAlert();

  const canUpload = permissions.has("documents.upload");
  const canDownload = permissions.has("documents.download") || permissions.has("documents.sensitive.download");
  const canArchive = permissions.has("documents.archive");
  const canDelete = permissions.has("documents.delete");
  const canPermanentDelete = permissions.has("documents.permanent_delete");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [docsResult, typesResult] = await Promise.all([api.listEmployeeDocuments(token, employee.id), api.listDocumentTypes(token)]);
      setDocuments(docsResult.documents);
      setMissing(docsResult.missing);
      setTypes(typesResult.document_types);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load employee documents.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [employee.id, token]);

  async function afterChange() {
    await load();
    await onChanged?.();
  }

  async function download(document: EmployeeDocument) {
    try {
      const result = await api.downloadEmployeeDocument(token, employee.id, document.id);
      saveBlob(result.blob, result.filename);
      alerts.showSuccess("Download started", "The document file is being downloaded.");
    } catch (err) {
      alerts.showApiError(err, "Document download failed");
      setError(err instanceof ApiError ? err.message : "Unable to download document.");
    }
  }

  async function action(document: EmployeeDocument, name: "archive" | "restore" | "soft-delete", reason: string) {
    try {
      await api.employeeDocumentAction(token, employee.id, document.id, name, reason);
      setDocumentAction(null);
      await afterChange();
      alerts.showSuccess("Document updated", `Document ${name.replace("-", " ")} action completed.`);
    } catch (err) {
      alerts.showApiError(err, "Document action failed");
      setError(err instanceof ApiError ? err.message : "Unable to update document.");
    }
  }

  async function permanentlyDelete(document: EmployeeDocument, reason: string) {
    try {
      await api.permanentlyDeleteEmployeeDocument(token, employee.id, document.id, reason);
      setDocumentAction(null);
      await afterChange();
      alerts.showSuccess("Document permanently deleted", "The document metadata and versions were removed.");
    } catch (err) {
      alerts.showApiError(err, "Document deletion failed");
      setError(err instanceof ApiError ? err.message : "Unable to permanently delete document.");
    }
  }

  async function showVersions(document: EmployeeDocument) {
    try {
      const result = await api.listEmployeeDocumentVersions(token, employee.id, document.id);
      setVersions({ document, rows: result.versions });
    } catch (err) {
      alerts.showApiError(err, "Document versions failed");
      setError(err instanceof ApiError ? err.message : "Unable to load versions.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold">Documents</h3>
          <p className="text-xs text-muted-foreground">Private R2-backed employee document tracking.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canUpload ? <ActionTextButton intent="upload" size="sm" onClick={() => setUploadModal({ mode: "photo" })}><ImageUp className="h-4 w-4" /> Profile photo</ActionTextButton> : null}
          {canUpload ? <ActionTextButton intent="upload" size="sm" onClick={() => setUploadModal({ mode: "upload" })}><FileUp className="h-4 w-4" /> Upload document</ActionTextButton> : null}
        </div>
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <EmployeeDocumentCompliancePanel employee={employee} token={token} permissions={permissions} />

      {missing.length > 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50">
          <div className="border-b border-amber-200 px-3 py-2 text-sm font-semibold text-amber-900">Missing required documents</div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Document type</TableHead><TableHead>Category</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader>
              <TableBody>{missing.map((row) => <TableRow key={`${row.employee_id}-${row.document_type_id}`}><TableCell>{row.document_type_name}</TableCell><TableCell>{row.category_name ?? "-"}</TableCell><TableCell>{row.reason}</TableCell></TableRow>)}</TableBody>
            </Table>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Document No</TableHead>
              <TableHead>Issue date</TableHead>
              <TableHead>Expiry date</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>File</TableHead>
              <TableHead>Uploaded</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((document) => (
              <TableRow key={document.id}>
                <TableCell className="font-medium">{document.document_type_name}{document.is_sensitive ? <Badge className="ml-2" tone="warning">Sensitive</Badge> : null}</TableCell>
                <TableCell>{document.category_name ?? "-"}</TableCell>
                <TableCell><Badge tone={statusTone(document.display_status)}>{document.display_status}</Badge></TableCell>
                <TableCell>{document.document_number ?? "-"}</TableCell>
                <TableCell>{document.issue_date ?? "-"}</TableCell>
                <TableCell>{document.expiry_date ?? "-"}</TableCell>
                <TableCell>{document.version_no ? `v${document.version_no}` : "-"}</TableCell>
                <TableCell>{document.original_filename ?? "-"}</TableCell>
                <TableCell>{document.uploaded_at ? new Date(document.uploaded_at).toLocaleDateString() : "-"}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <RowActionButton intent="view" title="Versions" onClick={() => void showVersions(document)}><Eye className="h-4 w-4" /></RowActionButton>
                    {canDownload ? <RowActionButton intent="download" title="Download" onClick={() => void download(document)}><Download className="h-4 w-4" /></RowActionButton> : null}
                    {canUpload && document.status === "ACTIVE" ? <RowActionButton intent="upload" title="Replace" onClick={() => setUploadModal({ mode: "replace", document })}><UploadCloud className="h-4 w-4" /></RowActionButton> : null}
                    {canArchive && document.status === "ACTIVE" ? <RowActionButton intent="archive" title="Archive" onClick={() => setDocumentAction({ document, name: "archive", reason: "" })}><Archive className="h-4 w-4" /></RowActionButton> : null}
                    {canArchive && document.status === "ARCHIVED" ? <RowActionButton intent="restore" title="Restore" onClick={() => setDocumentAction({ document, name: "restore", reason: "" })}><RotateCcw className="h-4 w-4" /></RowActionButton> : null}
                    {canDelete && document.status !== "SOFT_DELETED" ? <RowActionButton intent="delete" title="Soft delete" onClick={() => setDocumentAction({ document, name: "soft-delete", reason: "" })}><Trash2 className="h-4 w-4" /></RowActionButton> : null}
                    {canPermanentDelete ? <RowActionButton intent="delete" title="Permanent delete" onClick={() => setDocumentAction({ document, name: "permanent-delete", reason: "" })}><Trash2 className="h-4 w-4 text-red-600" /></RowActionButton> : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!loading && documents.length === 0 ? <EmptyState title="No documents uploaded" description="Required and uploaded documents will appear here." /> : null}
        {loading ? <TableSkeleton rows={5} columns={8} label="Loading employee documents" /> : null}
      </div>

      {uploadModal ? <DocumentUploadModal employee={employee} token={token} types={types} state={uploadModal} onClose={() => setUploadModal(null)} onSaved={afterChange} /> : null}
      {versions ? <VersionsModal versions={versions} onClose={() => setVersions(null)} /> : null}
      {documentAction ? (
        <DocumentActionModal
          action={documentAction}
          onChange={(reason) => setDocumentAction({ ...documentAction, reason })}
          onClose={() => setDocumentAction(null)}
          onConfirm={() => documentAction.name === "permanent-delete" ? void permanentlyDelete(documentAction.document, documentAction.reason.trim()) : void action(documentAction.document, documentAction.name, documentAction.reason.trim())}
        />
      ) : null}
    </div>
  );
}

function DocumentActionModal({ action, onChange, onClose, onConfirm }: { action: { document: EmployeeDocument; name: "archive" | "restore" | "soft-delete" | "permanent-delete"; reason: string }; onChange: (reason: string) => void; onClose: () => void; onConfirm: () => void }) {
  const validation = useFormValidation();
  const alerts = useAlert();
  function handleDocumentAction() {
    const issues = validateDocumentActionReason(action.reason);
    validation.setIssues(issues);
    if (issues.some((issue) => issue.severity === "error")) {
      alerts.showValidationError(issues, "Document action needs a reason");
      setTimeout(() => focusFirstInvalidField(issues), 0);
      return;
    }
    onConfirm();
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4">
      <div className="w-full max-w-md rounded-lg border bg-white p-4 shadow-xl">
        <h2 className="text-sm font-semibold">{action.name.replace("-", " ")} document</h2>
        <p className="mt-1 text-xs text-muted-foreground">{action.name === "permanent-delete" ? "This permanently deletes document metadata and all file versions. Use only when legally appropriate." : "This action is audit logged."}</p>
        <div className="mt-3"><FormErrorSummary issues={validation.issues} /></div>
        <ValidatedReasonField required value={action.reason} issues={validation.issues} onChange={onChange} />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!action.reason.trim()} onClick={handleDocumentAction}>Confirm</Button>
        </div>
      </div>
    </div>
  );
}

function DocumentUploadModal({ employee, token, types, state, onClose, onSaved }: { employee: Employee; token: string; types: DocumentType[]; state: { mode: "upload" | "replace" | "photo"; document?: EmployeeDocument }; onClose: () => void; onSaved: () => Promise<void> }) {
  const activeTypes = useMemo(() => types.filter((type) => type.is_active), [types]);
  const profilePhotoType = activeTypes.find((type) => type.code === "PROFILE_PHOTO");
  const [documentTypeId, setDocumentTypeId] = useState(state.document?.document_type_id ?? (state.mode === "photo" ? profilePhotoType?.id : activeTypes[0]?.id) ?? "");
  const selectedType = state.mode === "photo" ? profilePhotoType : activeTypes.find((type) => type.id === documentTypeId);
  const [file, setFile] = useState<File | null>(null);
  const [documentNumber, setDocumentNumber] = useState(state.document?.document_number ?? "");
  const [issueDate, setIssueDate] = useState(state.document?.issue_date ?? "");
  const [expiryDate, setExpiryDate] = useState(state.document?.expiry_date ?? "");
  const [notes, setNotes] = useState(state.document?.notes ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const validation = useFormValidation();
  const alerts = useAlert();

  async function submit() {
    setError(null);
    const issues = validateDocumentUploadForm({ mode: state.mode, documentTypeId, file, selectedType, documentNumber, issueDate, expiryDate, reason });
    validation.setIssues(issues);
    if (issues.some((issue) => issue.severity === "error")) {
      alerts.showValidationError(issues, "Document upload needs attention");
      setTimeout(() => focusFirstInvalidField(issues), 0);
      return;
    }
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    if (state.mode === "upload") form.append("document_type_id", documentTypeId);
    form.append("document_number", documentNumber);
    form.append("issue_date", issueDate);
    form.append("expiry_date", expiryDate);
    form.append("notes", notes);
    form.append("reason_for_replacement", reason);
    setSaving(true);
    try {
      if (state.mode === "replace" && state.document) {
        await api.replaceEmployeeDocument(token, employee.id, state.document.id, form);
      } else if (state.mode === "photo") {
        await api.uploadEmployeeProfilePhoto(token, employee.id, form);
      } else {
        await api.uploadEmployeeDocument(token, employee.id, form);
      }
      await onSaved();
      alerts.showSuccess(state.mode === "photo" ? "Profile photo uploaded" : state.mode === "replace" ? "Document replaced" : "Document uploaded", "The employee document record was updated.");
      onClose();
    } catch (err) {
      const issuesFromApi = normalizeValidationIssues(err);
      if (issuesFromApi.length) {
        validation.setIssues(issuesFromApi);
        alerts.showValidationError(issuesFromApi, "Document upload cannot be saved");
        setTimeout(() => focusFirstInvalidField(issuesFromApi), 0);
      } else {
        alerts.showApiError(err, "Document upload failed");
      }
      setError(err instanceof ApiError ? err.message : "Unable to upload document.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4">
      <div className="w-full max-w-2xl rounded-lg border bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">{state.mode === "replace" ? "Replace document" : state.mode === "photo" ? "Upload profile photo" : "Upload document"}</h2>
            <p className="text-xs text-muted-foreground">{employee.full_name} · {employee.employee_no}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
        <div className="px-4 pt-4"><FormErrorSummary issues={validation.issues} /></div>
        <div className="grid gap-3 p-4 md:grid-cols-2">
          {state.mode === "upload" ? (
            <div className="md:col-span-2">
              <ValidatedSelectField field="document_type_id" label="Document type" value={documentTypeId} issues={validation.issues} onValueChange={setDocumentTypeId}>
                {activeTypes.map((type) => <option key={type.id} value={type.id}>{type.name}{type.is_sensitive ? " (Sensitive)" : ""}</option>)}
              </ValidatedSelectField>
            </div>
          ) : null}
          <div className="space-y-1.5 md:col-span-2">
            <ValidatedFileField field="file" label="File" accept={selectedType?.allowed_file_types?.join(",") ?? (state.mode === "photo" ? "image/jpeg,image/png,image/webp" : undefined)} issues={validation.issues} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            {selectedType ? <p className="text-xs text-muted-foreground">Max {selectedType.max_file_size_mb} MB. {selectedType.allowed_file_types?.join(", ")}</p> : null}
          </div>
          {state.mode !== "photo" ? (
            <>
              <ValidatedTextField field="document_number" label={`Document number${selectedType?.requires_document_number ? " *" : ""}`} value={documentNumber} issues={validation.issues} onChange={setDocumentNumber} />
              <ValidatedTextField field="issue_date" label={`Issue date${selectedType?.requires_issue_date ? " *" : ""}`} value={issueDate} issues={validation.issues} onChange={setIssueDate} type="date" />
              <ValidatedTextField field="expiry_date" label={`Expiry date${selectedType?.requires_expiry_date ? " *" : ""}`} value={expiryDate} issues={validation.issues} onChange={setExpiryDate} type="date" />
              <ValidatedTextField field="notes" label="Notes" value={notes} issues={validation.issues} onChange={setNotes} />
            </>
          ) : null}
          {state.mode === "replace" ? <div className="md:col-span-2"><ValidatedReasonField field="reason_for_replacement" label="Replacement reason *" required value={reason} issues={validation.issues} onChange={setReason} /></div> : null}
        </div>
        {error ? <div className="mx-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} loadingLabel="Saving document" onClick={() => void submit()}>Save</Button>
        </div>
      </div>
    </div>
  );
}

function VersionsModal({ versions, onClose }: { versions: { document: EmployeeDocument; rows: EmployeeDocumentVersion[] }; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4">
      <div className="w-full max-w-3xl rounded-lg border bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Document versions</h2>
            <p className="text-xs text-muted-foreground">{versions.document.document_type_name}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Version</TableHead><TableHead>File</TableHead><TableHead>Size</TableHead><TableHead>Uploaded by</TableHead><TableHead>Uploaded</TableHead><TableHead>Reason</TableHead><TableHead>Current</TableHead></TableRow></TableHeader>
            <TableBody>{versions.rows.map((row) => <TableRow key={row.id}><TableCell>v{row.version_no}</TableCell><TableCell>{row.original_filename}</TableCell><TableCell>{Math.round(row.file_size_bytes / 1024)} KB</TableCell><TableCell>{row.uploaded_by_name ?? "-"}</TableCell><TableCell>{new Date(row.uploaded_at).toLocaleString()}</TableCell><TableCell>{row.reason_for_replacement ?? "-"}</TableCell><TableCell>{row.is_current ? "Yes" : "No"}</TableCell></TableRow>)}</TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
