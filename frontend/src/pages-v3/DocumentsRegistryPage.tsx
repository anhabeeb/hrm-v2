import { useEffect, useMemo, useState } from "react";
import { Download, FileImage, FileText, MoreVertical, Upload } from "lucide-react";
import { PageShell, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavRail } from "../components/ui/route-nav-rail";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { ApiError, api } from "../lib/api";
import { humanizeTechnicalLabel } from "../lib/displayLabels";
import { DOCUMENTS_NAV_ITEMS } from "./documentsNav";
import type { DocumentDashboard, DocumentDisplayStatus, DocumentType, EmployeeDocument } from "../types/documents";
import type { Employee } from "../types/employees";
import type { OrganizationLocation } from "../types/organization";

function fileIconFor(doc: EmployeeDocument) {
  const name = (doc.original_filename ?? "").toLowerCase();
  const mime = (doc.file_mime_type ?? "").toLowerCase();
  if (mime.includes("image") || /\.(jpg|jpeg|png)$/.test(name)) return { Icon: FileImage, bg: "#E6F1FB", color: "#0C447C" };
  return { Icon: FileText, bg: "#FCEBEB", color: "#A32D2D" };
}

function statusTone(status: DocumentDisplayStatus) {
  if (status === "VALID") return { bg: "#EAF3DE", text: "#27500A", label: "Valid" };
  if (status === "EXPIRING_SOON") return { bg: "#FCEBEB", text: "#A32D2D", label: "Expiring soon" };
  if (status === "EXPIRED") return { bg: "#FCEBEB", text: "#A32D2D", label: "Expired" };
  return { bg: "#F7F7FB", text: "#6B6F86", label: humanizeTechnicalLabel(status) };
}

const STATUS_TABS: Array<{ key: "ALL" | DocumentDisplayStatus; label: string }> = [
  { key: "ALL", label: "All" },
  { key: "VALID", label: "Valid" },
  { key: "EXPIRING_SOON", label: "Expiring soon" },
  { key: "EXPIRED", label: "Expired" }
];

export function DocumentsRegistryPage() {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canUpload = permissions.has("documents.upload");

  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [dashboard, setDashboard] = useState<DocumentDashboard | null>(null);
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusTab, setStatusTab] = useState<"ALL" | DocumentDisplayStatus>("ALL");
  const [search, setSearch] = useState("");
  const [typeId, setTypeId] = useState("all");
  const [locationId, setLocationId] = useState("all");
  const [moreOpen, setMoreOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [detailDoc, setDetailDoc] = useState<EmployeeDocument | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [registryResult, dashboardResult, typeResult, locationResult] = await Promise.all([
        api.listDocumentRegistry(token, { location_id: locationId === "all" ? undefined : locationId, document_type_id: typeId === "all" ? undefined : typeId, search: search || undefined }),
        api.getDocumentDashboard(token),
        api.listDocumentTypes(token),
        api.listLocations(token)
      ]);
      setDocuments(registryResult.documents);
      setDashboard(dashboardResult);
      setTypes(typeResult.document_types);
      setLocations(locationResult.locations);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load document registry.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, locationId, typeId]);

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: documents.length };
    for (const doc of documents) counts[doc.display_status] = (counts[doc.display_status] ?? 0) + 1;
    return counts;
  }, [documents]);

  const filtered = useMemo(() => {
    return documents
      .filter((d) => statusTab === "ALL" || d.display_status === statusTab)
      .filter((d) => !search.trim() || (d.employee_name ?? "").toLowerCase().includes(search.trim().toLowerCase()) || (d.document_type_name ?? "").toLowerCase().includes(search.trim().toLowerCase()))
      .sort((a, b) => (b.uploaded_at ?? b.created_at).localeCompare(a.uploaded_at ?? a.created_at));
  }, [documents, statusTab, search]);

  const sensitiveCount = documents.filter((d) => d.is_sensitive).length;

  async function download(doc: EmployeeDocument) {
    if (!token) return;
    try {
      const { blob, filename } = await api.downloadEmployeeDocument(token, doc.employee_id, doc.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || doc.original_filename || "document";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to download document.");
    }
  }

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={DOCUMENTS_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-slate-950">Registry</p>
              <p className="mt-0.5 text-xs text-muted-foreground">All employee documents in one place</p>
            </div>
            {canUpload ? <Button size="sm" onClick={() => setUploadOpen(true)}><Upload className="h-4 w-4" /> Upload document</Button> : null}
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Panel className="p-3"><p className="text-[10px] text-muted-foreground">Total documents</p><p className="mt-1 text-lg font-medium text-slate-950">{dashboard?.total_documents ?? "—"}</p></Panel>
            <Panel className="p-3"><p className="text-[10px] text-muted-foreground">Expiring soon</p><p className="mt-1 text-lg font-medium text-[#854F0B]">{dashboard?.expiring_soon ?? "—"}</p></Panel>
            <Panel className="p-3"><p className="text-[10px] text-muted-foreground">Missing</p><p className="mt-1 text-lg font-medium text-[#A32D2D]">{dashboard?.missing_required_documents ?? "—"}</p></Panel>
            <Panel className="p-3"><p className="text-[10px] text-muted-foreground">Sensitive</p><p className="mt-1 text-lg font-medium text-slate-950">{sensitiveCount}</p></Panel>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusTab(tab.key)}
                className="rounded-md px-3 py-1.5 text-[10px] font-medium transition-colors"
                style={statusTab === tab.key ? { background: "#5B4FE9", color: "#fff" } : { background: "#F7F7FB", color: "#6B6F86" }}
              >
                {tab.label} ({tabCounts[tab.key] ?? 0})
              </button>
            ))}
          </div>

          <Panel className="flex flex-col gap-2.5 p-3">
            <div className="flex flex-wrap items-center gap-3.5">
              <div className="min-w-[160px] flex-1 rounded-md bg-[#F7F7FB] px-3 py-1.5 text-xs text-muted-foreground">
                <input className="w-full bg-transparent outline-none placeholder:text-muted-foreground" placeholder="Search employee or document" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <select className="bg-transparent text-xs text-muted-foreground outline-none" value={typeId} onChange={(e) => setTypeId(e.target.value)}>
                <option value="all">Document type</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select className="bg-transparent text-xs text-muted-foreground outline-none" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <option value="all">Outlet/location</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <button type="button" onClick={() => setMoreOpen((v) => !v)} className="ml-auto flex items-center gap-1.5 rounded-md border border-[#D3D3E3] px-2.5 py-1.5 text-xs text-muted-foreground">
                More filters
              </button>
            </div>
            {moreOpen ? (
              <p className="border-t border-[#E7E7F1] pt-2.5 text-xs text-muted-foreground">No additional filters — use Compliance or Missing documents for renewal and gap tracking.</p>
            ) : null}
          </Panel>

          {error ? <Panel className="p-4 text-sm text-[#A32D2D]">{error}</Panel> : null}

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : filtered.length ? (
            <div className="flex flex-col gap-2">
              {filtered.map((doc) => {
                const { Icon, bg, color } = fileIconFor(doc);
                const tone = statusTone(doc.display_status);
                return (
                  <Panel key={doc.id} className="flex items-center gap-3.5 p-3">
                    <div className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-lg" style={{ background: bg }}>
                      <Icon className="h-4 w-4" style={{ color }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-950">{doc.original_filename ?? doc.document_type_name}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{doc.employee_name} · Uploaded {(doc.uploaded_at ?? doc.created_at).slice(0, 10)}</p>
                    </div>
                    <span className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: tone.bg, color: tone.text }}>{tone.label}</span>
                    <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
                      <button type="button" title="Download" onClick={() => void download(doc)}><Download className="h-3.5 w-3.5" /></button>
                      <button type="button" title="Details" onClick={() => setDetailDoc(doc)}><MoreVertical className="h-4 w-4" /></button>
                    </div>
                  </Panel>
                );
              })}
            </div>
          ) : (
            <Panel><EmptyState title="No documents found" description="Adjust filters or upload a document." /></Panel>
          )}
        </div>
      </div>

      {uploadOpen ? <UploadDocumentModal types={types} onClose={() => setUploadOpen(false)} onSaved={() => { setUploadOpen(false); void load(); }} /> : null}
      {detailDoc ? <DocumentDetailDialog doc={detailDoc} onClose={() => setDetailDoc(null)} /> : null}
    </PageShell>
  );
}

function DocumentDetailDialog({ doc, onClose }: { doc: EmployeeDocument; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>{doc.document_type_name}</DialogTitle></DialogHeader>
        <DialogBody>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div><p className="text-muted-foreground">Employee</p><p className="mt-0.5 font-medium text-slate-950">{doc.employee_name}</p></div>
            <div><p className="text-muted-foreground">File</p><p className="mt-0.5 font-medium text-slate-950">{doc.original_filename ?? "—"}</p></div>
            <div><p className="text-muted-foreground">Document number</p><p className="mt-0.5 font-medium text-slate-950">{doc.document_number ?? "—"}</p></div>
            <div><p className="text-muted-foreground">Issue date</p><p className="mt-0.5 font-medium text-slate-950">{doc.issue_date ?? "—"}</p></div>
            <div><p className="text-muted-foreground">Expiry date</p><p className="mt-0.5 font-medium text-slate-950">{doc.expiry_date ?? "—"}</p></div>
            <div><p className="text-muted-foreground">Sensitive</p><p className="mt-0.5 font-medium text-slate-950">{doc.is_sensitive ? "Yes" : "No"}</p></div>
          </div>
          {doc.notes ? <div className="mt-3"><p className="text-xs text-muted-foreground">Notes</p><p className="mt-0.5 text-xs text-slate-950">{doc.notes}</p></div> : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UploadDocumentModal({ types, onClose, onSaved }: { types: DocumentType[]; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [documentNumber, setDocumentNumber] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedType = types.find((t) => t.id === typeId);

  useEffect(() => {
    if (!token) return;
    api.listEmployees(token, { limit: 300, offset: 0 }).then((res) => {
      setEmployees(res.employees);
      setEmployeeId(res.employees[0]?.id ?? "");
    });
  }, [token]);

  async function submit() {
    if (!token || !employeeId || !typeId || !file) return;
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("document_type_id", typeId);
      if (documentNumber) form.append("document_number", documentNumber);
      if (issueDate) form.append("issue_date", issueDate);
      if (expiryDate) form.append("expiry_date", expiryDate);
      await api.uploadEmployeeDocument(token, employeeId, form);
      alerts.showSuccess("Document uploaded", "The document was added to the employee's record.");
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to upload document.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Upload document</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Employee</Label>
              <SelectField value={employeeId} onValueChange={setEmployeeId}>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name} · {e.employee_no}</option>)}
              </SelectField>
            </div>
            <div className="space-y-1.5">
              <Label>Document type</Label>
              <SelectField value={typeId} onValueChange={setTypeId}>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </SelectField>
              {selectedType?.is_sensitive ? <p className="text-[10px] text-[#A32D2D]">This document type is marked sensitive — visibility is restricted to HR and the employee.</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label>File</Label>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full rounded-md border border-dashed border-[#D3D3E3] bg-[#F7F7FB] p-3 text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Issue date{selectedType?.requires_issue_date ? " (required)" : ""}</Label>
                <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Expiry date{selectedType?.requires_expiry_date ? " (required)" : ""}</Label>
                <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
              </div>
            </div>
            {selectedType?.requires_document_number ? (
              <div className="space-y-1.5"><Label>Document number (required)</Label><Input value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} /></div>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            loading={saving}
            disabled={!employeeId || !typeId || !file || (selectedType?.requires_document_number && !documentNumber) || (selectedType?.requires_issue_date && !issueDate) || (selectedType?.requires_expiry_date && !expiryDate)}
            onClick={() => void submit()}
          >
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
