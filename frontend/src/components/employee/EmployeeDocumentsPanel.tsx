import { Archive, Download, Eye, FileUp, ImageUp, RotateCcw, Trash2, UploadCloud } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ApiError, api } from "../../lib/api";
import type { DocumentType, EmployeeDocument, EmployeeDocumentVersion, MissingDocument } from "../../types/documents";
import type { Employee } from "../../types/employees";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";

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

export function EmployeeDocumentsPanel({ employee, token, permissions, onChanged }: { employee: Employee; token: string; permissions: Set<string>; onChanged?: () => Promise<void> }) {
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [missing, setMissing] = useState<MissingDocument[]>([]);
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadModal, setUploadModal] = useState<{ mode: "upload" | "replace" | "photo"; document?: EmployeeDocument } | null>(null);
  const [versions, setVersions] = useState<{ document: EmployeeDocument; rows: EmployeeDocumentVersion[] } | null>(null);

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
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to download document.");
    }
  }

  async function action(document: EmployeeDocument, name: "archive" | "restore" | "soft-delete") {
    const reason = window.prompt(`${name.replace("-", " ")} reason`);
    if (!reason) return;
    try {
      await api.employeeDocumentAction(token, employee.id, document.id, name, reason);
      await afterChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update document.");
    }
  }

  async function permanentlyDelete(document: EmployeeDocument) {
    const reason = window.prompt("Permanent delete reason");
    if (!reason) return;
    if (!window.confirm("Permanently delete this document and all file versions?")) return;
    try {
      await api.permanentlyDeleteEmployeeDocument(token, employee.id, document.id, reason);
      await afterChange();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to permanently delete document.");
    }
  }

  async function showVersions(document: EmployeeDocument) {
    try {
      const result = await api.listEmployeeDocumentVersions(token, employee.id, document.id);
      setVersions({ document, rows: result.versions });
    } catch (err) {
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
          {canUpload ? <Button size="sm" variant="outline" onClick={() => setUploadModal({ mode: "photo" })}><ImageUp className="h-4 w-4" /> Profile photo</Button> : null}
          {canUpload ? <Button size="sm" onClick={() => setUploadModal({ mode: "upload" })}><FileUp className="h-4 w-4" /> Upload document</Button> : null}
        </div>
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

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
                    <Button title="Versions" variant="ghost" size="icon" onClick={() => void showVersions(document)}><Eye className="h-4 w-4" /></Button>
                    {canDownload ? <Button title="Download" variant="ghost" size="icon" onClick={() => void download(document)}><Download className="h-4 w-4" /></Button> : null}
                    {canUpload && document.status === "ACTIVE" ? <Button title="Replace" variant="ghost" size="icon" onClick={() => setUploadModal({ mode: "replace", document })}><UploadCloud className="h-4 w-4" /></Button> : null}
                    {canArchive && document.status === "ACTIVE" ? <Button title="Archive" variant="ghost" size="icon" onClick={() => void action(document, "archive")}><Archive className="h-4 w-4" /></Button> : null}
                    {canArchive && document.status === "ARCHIVED" ? <Button title="Restore" variant="ghost" size="icon" onClick={() => void action(document, "restore")}><RotateCcw className="h-4 w-4" /></Button> : null}
                    {canDelete && document.status !== "SOFT_DELETED" ? <Button title="Soft delete" variant="ghost" size="icon" onClick={() => void action(document, "soft-delete")}><Trash2 className="h-4 w-4" /></Button> : null}
                    {canPermanentDelete ? <Button title="Permanent delete" variant="ghost" size="icon" onClick={() => void permanentlyDelete(document)}><Trash2 className="h-4 w-4 text-red-600" /></Button> : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!loading && documents.length === 0 ? <EmptyState title="No documents uploaded" description="Required and uploaded documents will appear here." /> : null}
        {loading ? <EmptyState title="Loading documents" description="Fetching employee document records." /> : null}
      </div>

      {uploadModal ? <DocumentUploadModal employee={employee} token={token} types={types} state={uploadModal} onClose={() => setUploadModal(null)} onSaved={afterChange} /> : null}
      {versions ? <VersionsModal versions={versions} onClose={() => setVersions(null)} /> : null}
    </div>
  );
}

function DocumentUploadModal({ employee, token, types, state, onClose, onSaved }: { employee: Employee; token: string; types: DocumentType[]; state: { mode: "upload" | "replace" | "photo"; document?: EmployeeDocument }; onClose: () => void; onSaved: () => Promise<void> }) {
  const activeTypes = useMemo(() => types.filter((type) => type.is_active), [types]);
  const [documentTypeId, setDocumentTypeId] = useState(state.document?.document_type_id ?? activeTypes[0]?.id ?? "");
  const selectedType = activeTypes.find((type) => type.id === documentTypeId);
  const [file, setFile] = useState<File | null>(null);
  const [documentNumber, setDocumentNumber] = useState(state.document?.document_number ?? "");
  const [issueDate, setIssueDate] = useState(state.document?.issue_date ?? "");
  const [expiryDate, setExpiryDate] = useState(state.document?.expiry_date ?? "");
  const [notes, setNotes] = useState(state.document?.notes ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setError(null);
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    if (state.mode === "upload" && !documentTypeId) {
      setError("Choose a document type.");
      return;
    }
    if (state.mode === "replace" && !reason) {
      setError("Replacement reason is required.");
      return;
    }
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
      onClose();
    } catch (err) {
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
        <div className="grid gap-3 p-4 md:grid-cols-2">
          {state.mode === "upload" ? (
            <div className="space-y-1.5 md:col-span-2">
              <Label>Document type</Label>
              <select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={documentTypeId} onChange={(event) => setDocumentTypeId(event.target.value)}>
                {activeTypes.map((type) => <option key={type.id} value={type.id}>{type.name}{type.is_sensitive ? " (Sensitive)" : ""}</option>)}
              </select>
            </div>
          ) : null}
          <div className="space-y-1.5 md:col-span-2">
            <Label>File</Label>
            <Input type="file" accept={selectedType?.allowed_file_types?.join(",")} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            {selectedType ? <p className="text-xs text-muted-foreground">Max {selectedType.max_file_size_mb} MB. {selectedType.allowed_file_types?.join(", ")}</p> : null}
          </div>
          {state.mode !== "photo" ? (
            <>
              <Field label={`Document number${selectedType?.requires_document_number ? " *" : ""}`} value={documentNumber} onChange={setDocumentNumber} />
              <Field label={`Issue date${selectedType?.requires_issue_date ? " *" : ""}`} value={issueDate} onChange={setIssueDate} type="date" />
              <Field label={`Expiry date${selectedType?.requires_expiry_date ? " *" : ""}`} value={expiryDate} onChange={setExpiryDate} type="date" />
              <Field label="Notes" value={notes} onChange={setNotes} />
            </>
          ) : null}
          {state.mode === "replace" ? <div className="space-y-1.5 md:col-span-2"><Label>Replacement reason *</Label><Input value={reason} onChange={(event) => setReason(event.target.value)} /></div> : null}
        </div>
        {error ? <div className="mx-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={saving} onClick={() => void submit()}>{saving ? "Saving..." : "Save"}</Button>
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

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <div className="space-y-1.5"><Label>{label}</Label><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}
