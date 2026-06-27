import { Archive, Download, Eye, History, RotateCcw, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EmployeeIdentityCell } from "../components/employee/EmployeeIdentityCell";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import type { DocumentCategory, DocumentType, EmployeeDocument, EmployeeDocumentVersion } from "../types/documents";
import type { OrganizationDepartment, OrganizationLocation, OrganizationPosition } from "../types/organization";
import { PageHeader, PageShell, SelectField } from "../components/ui/page-shell";

function tone(status: string) {
  if (status === "VALID") return "success";
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

const defaultFilters = {
  search: "",
  department_id: "",
  position_id: "",
  location_id: "",
  category_id: "",
  document_type_id: "",
  status: "",
  display_status: "",
  sensitive: "",
  issue_from: "",
  issue_to: "",
  expiry_from: "",
  expiry_to: "",
  uploaded_from: "",
  uploaded_to: ""
};

export function DocumentRegistryPage() {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("documents.view") || permissions.has("documents.registry.view");
  const canExport = permissions.has("documents.reports.export");
  const canArchive = permissions.has("documents.archive");
  const canDelete = permissions.has("documents.delete");
  const canDownload = permissions.has("documents.download") || permissions.has("documents.sensitive.download");
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [categories, setCategories] = useState<DocumentCategory[]>([]);
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [positions, setPositions] = useState<OrganizationPosition[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [filters, setFilters] = useState(defaultFilters);
  const [versions, setVersions] = useState<{ document: EmployeeDocument; rows: EmployeeDocumentVersion[] } | null>(null);
  const [documentAction, setDocumentAction] = useState<{ document: EmployeeDocument; name: "archive" | "restore" | "soft-delete"; reason: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeFilters = useMemo(() => Object.fromEntries(Object.entries(filters).filter(([, value]) => value)), [filters]);

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    setError(null);
    try {
      const [registry, categoryResult, typeResult, departmentResult, positionResult, locationResult] = await Promise.all([
        api.listDocumentRegistry(token, activeFilters),
        api.listDocumentCategories(token),
        api.listDocumentTypes(token),
        api.listDepartments(token),
        api.listPositions(token),
        api.listLocations(token)
      ]);
      setDocuments(registry.documents);
      setCategories(categoryResult.categories);
      setTypes(typeResult.document_types);
      setDepartments(departmentResult.departments);
      setPositions(positionResult.positions);
      setLocations(locationResult.locations);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load document registry.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, canView, activeFilters]);

  async function exportCsv() {
    if (!token) return;
    try {
      const result = await api.exportDocumentRegistryCsv(token, activeFilters);
      saveBlob(result.blob, result.filename);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to export registry.");
    }
  }

  async function download(doc: EmployeeDocument) {
    if (!token) return;
    try {
      const result = await api.downloadEmployeeDocument(token, doc.employee_id, doc.id);
      saveBlob(result.blob, result.filename);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to download document.");
    }
  }

  async function showVersions(doc: EmployeeDocument) {
    if (!token) return;
    try {
      setVersions({ document: doc, rows: (await api.listEmployeeDocumentVersions(token, doc.employee_id, doc.id)).versions });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load version history.");
    }
  }

  async function action(doc: EmployeeDocument, name: "archive" | "restore" | "soft-delete", reason: string) {
    if (!token) return;
    try {
      await api.employeeDocumentAction(token, doc.employee_id, doc.id, name, reason);
      setDocumentAction(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update document.");
    }
  }

  if (!canView) return <PageShell><Panel><EmptyState title="Documents unavailable" description="Your account needs documents.view or documents.registry.view permission." /></Panel></PageShell>;

  return (
    <PageShell>
      <PageHeader
        title="Document Registry"
        description="Central employee document tracking, expiry visibility, and compliance status."
        actions={
          <>
          <Link to="/documents/compliance"><Button variant="outline" size="sm">Compliance</Button></Link>
          <Link to="/documents/missing"><Button variant="outline" size="sm">Missing required</Button></Link>
          {canExport ? <Button variant="outline" size="sm" onClick={() => void exportCsv()}><Download className="h-4 w-4" /> Export CSV</Button> : null}
          </>
        }
      />

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <Panel className="overflow-hidden">
        <div className="grid gap-2 border-b p-3 lg:grid-cols-6">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search employee, document, or number" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
          </div>
          <FilterSelect value={filters.department_id} onChange={(value) => setFilters({ ...filters, department_id: value })} options={departments.map((item) => ({ value: item.id, label: item.name }))} label="All departments" />
          <FilterSelect value={filters.position_id} onChange={(value) => setFilters({ ...filters, position_id: value })} options={positions.map((item) => ({ value: item.id, label: item.title }))} label="All positions" />
          <FilterSelect value={filters.location_id} onChange={(value) => setFilters({ ...filters, location_id: value })} options={locations.map((item) => ({ value: item.id, label: item.name }))} label="All locations" />
          <FilterSelect value={filters.category_id} onChange={(value) => setFilters({ ...filters, category_id: value })} options={categories.map((item) => ({ value: item.id, label: item.name }))} label="All categories" />
          <FilterSelect value={filters.document_type_id} onChange={(value) => setFilters({ ...filters, document_type_id: value })} options={types.map((item) => ({ value: item.id, label: item.name }))} label="All document types" />
          <SelectField className="h-9 rounded-md border bg-white px-3 text-sm" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">All stored statuses</option>{["ACTIVE", "ARCHIVED", "SOFT_DELETED"].map((item) => <option key={item} value={item}>{item}</option>)}</SelectField>
          <SelectField className="h-9 rounded-md border bg-white px-3 text-sm" value={filters.display_status} onChange={(event) => setFilters({ ...filters, display_status: event.target.value })}><option value="">All display statuses</option>{["VALID", "EXPIRING_SOON", "EXPIRED", "ARCHIVED", "SOFT_DELETED"].map((item) => <option key={item} value={item}>{item}</option>)}</SelectField>
          <SelectField className="h-9 rounded-md border bg-white px-3 text-sm" value={filters.sensitive} onChange={(event) => setFilters({ ...filters, sensitive: event.target.value })}><option value="">All sensitivity</option><option value="true">Sensitive</option><option value="false">Non-sensitive</option></SelectField>
          <DateField label="Issue from" value={filters.issue_from} onChange={(value) => setFilters({ ...filters, issue_from: value })} />
          <DateField label="Issue to" value={filters.issue_to} onChange={(value) => setFilters({ ...filters, issue_to: value })} />
          <DateField label="Expiry from" value={filters.expiry_from} onChange={(value) => setFilters({ ...filters, expiry_from: value })} />
          <DateField label="Expiry to" value={filters.expiry_to} onChange={(value) => setFilters({ ...filters, expiry_to: value })} />
          <DateField label="Uploaded from" value={filters.uploaded_from} onChange={(value) => setFilters({ ...filters, uploaded_from: value })} />
          <DateField label="Uploaded to" value={filters.uploaded_to} onChange={(value) => setFilters({ ...filters, uploaded_to: value })} />
          <Button variant="outline" size="sm" onClick={() => setFilters(defaultFilters)}>Reset filters</Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Department</TableHead><TableHead>Position</TableHead><TableHead>Location</TableHead><TableHead>Document</TableHead><TableHead>Category</TableHead><TableHead>Display</TableHead><TableHead>Stored</TableHead><TableHead>Document No</TableHead><TableHead>Issue</TableHead><TableHead>Expiry</TableHead><TableHead>Version</TableHead><TableHead>Uploaded</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {documents.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell><EmployeeIdentityCell employeeId={doc.employee_id} employeeName={doc.employee_name} employeeNumber={doc.employee_no} departmentName={doc.department_name} locationName={doc.location_name} size="sm" to={`/employees/${doc.employee_id}`} /></TableCell>
                  <TableCell>{doc.department_name ?? "-"}</TableCell>
                  <TableCell>{doc.position_title ?? "-"}</TableCell>
                  <TableCell>{doc.location_name ?? "-"}</TableCell>
                  <TableCell>{doc.document_type_name}{doc.is_sensitive ? <Badge className="ml-2" tone="warning">Sensitive</Badge> : null}</TableCell>
                  <TableCell>{doc.category_name ?? "-"}</TableCell>
                  <TableCell><Badge tone={tone(doc.display_status)}>{doc.display_status}</Badge></TableCell>
                  <TableCell>{doc.status}</TableCell>
                  <TableCell>{doc.document_number ?? "-"}</TableCell>
                  <TableCell>{doc.issue_date ?? "-"}</TableCell>
                  <TableCell>{doc.expiry_date ?? "-"}</TableCell>
                  <TableCell>{doc.version_no ? `v${doc.version_no}` : "-"}</TableCell>
                  <TableCell>{doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : "-"}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Link to={`/employees/${doc.employee_id}`}><Button title="Open Employee 360" variant="ghost" size="icon"><Eye className="h-4 w-4" /></Button></Link>
                      <Button title="Version history" variant="ghost" size="icon" onClick={() => void showVersions(doc)}><History className="h-4 w-4" /></Button>
                      {canDownload ? <Button title="Download" variant="ghost" size="icon" onClick={() => void download(doc)}><Download className="h-4 w-4" /></Button> : null}
                      {canArchive && doc.status === "ACTIVE" ? <Button title="Archive" variant="ghost" size="icon" onClick={() => setDocumentAction({ document: doc, name: "archive", reason: "" })}><Archive className="h-4 w-4" /></Button> : null}
                      {canArchive && doc.status === "ARCHIVED" ? <Button title="Restore" variant="ghost" size="icon" onClick={() => setDocumentAction({ document: doc, name: "restore", reason: "" })}><RotateCcw className="h-4 w-4" /></Button> : null}
                      {canDelete && doc.status !== "SOFT_DELETED" ? <Button title="Soft delete" variant="ghost" size="icon" onClick={() => setDocumentAction({ document: doc, name: "soft-delete", reason: "" })}><Trash2 className="h-4 w-4" /></Button> : null}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {loading ? <EmptyState title="Loading registry" description="Fetching document records." /> : documents.length === 0 ? <EmptyState title="No documents found" description="Upload employee documents from Employee 360 or adjust filters." /> : null}
      </Panel>
      {versions ? <VersionsModal versions={versions} onClose={() => setVersions(null)} /> : null}
      {documentAction ? (
        <DocumentActionModal
          action={documentAction}
          onChange={(reason) => setDocumentAction({ ...documentAction, reason })}
          onClose={() => setDocumentAction(null)}
          onConfirm={() => void action(documentAction.document, documentAction.name, documentAction.reason.trim())}
        />
      ) : null}
    </PageShell>
  );
}

function DocumentActionModal({ action, onChange, onClose, onConfirm }: { action: { document: EmployeeDocument; name: "archive" | "restore" | "soft-delete"; reason: string }; onChange: (reason: string) => void; onClose: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4"><div className="w-full max-w-md rounded-lg border bg-white p-4 shadow-xl"><h2 className="text-sm font-semibold">{action.name.replace("-", " ")} document</h2><p className="mt-1 text-xs text-muted-foreground">{action.document.document_type_name} for {action.document.employee_name}</p><Input className="mt-3" placeholder="Reason" value={action.reason} onChange={(event) => onChange(event.target.value)} /><div className="mt-4 flex justify-end gap-2"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" disabled={!action.reason.trim()} onClick={onConfirm}>Confirm</Button></div></div></div>;
}

function FilterSelect({ value, onChange, options, label }: { value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; label: string }) {
  return <SelectField className="h-9 rounded-md border bg-white px-3 text-sm" value={value} onChange={(event) => onChange(event.target.value)}><option value="">{label}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</SelectField>;
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div className="space-y-1"><Label className="text-[11px]">{label}</Label><Input type="date" value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

function VersionsModal({ versions, onClose }: { versions: { document: EmployeeDocument; rows: EmployeeDocumentVersion[] }; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4"><div className="w-full max-w-3xl rounded-lg border bg-white shadow-xl"><div className="flex items-center justify-between border-b px-4 py-3"><div><h2 className="text-sm font-semibold">Version history</h2><p className="text-xs text-muted-foreground">{versions.document.employee_name} · {versions.document.document_type_name}</p></div><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></div><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Version</TableHead><TableHead>File</TableHead><TableHead>Size</TableHead><TableHead>Uploaded by</TableHead><TableHead>Uploaded</TableHead><TableHead>Reason</TableHead><TableHead>Current</TableHead></TableRow></TableHeader><TableBody>{versions.rows.map((row) => <TableRow key={row.id}><TableCell>v{row.version_no}</TableCell><TableCell>{row.original_filename}</TableCell><TableCell>{Math.round(row.file_size_bytes / 1024)} KB</TableCell><TableCell>{row.uploaded_by_name ?? "-"}</TableCell><TableCell>{new Date(row.uploaded_at).toLocaleString()}</TableCell><TableCell>{row.reason_for_replacement ?? "-"}</TableCell><TableCell>{row.is_current ? "Yes" : "No"}</TableCell></TableRow>)}</TableBody></Table></div></div></div>;
}
