import { Archive, Download, Eye, History, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { EmployeeIdentityCell } from "../components/employee/EmployeeIdentityCell";
import { ExportMenu } from "../components/export/ExportMenu";
import { Badge } from "../components/ui/badge";
import { Button, RowActionButton } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  ActiveFilterChips,
  FilterResetButton,
  FilterSection,
  MoreFiltersSheet,
  StandardDateRangeFilter,
  StandardFilterBar,
  StandardSearchInput,
  StandardSelectFilter,
  type StandardDateRange
} from "../components/filters";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import { downloadBlob } from "../lib/export-utils";
import type { DocumentCategory, DocumentType, EmployeeDocument, EmployeeDocumentVersion } from "../types/documents";
import type { OrganizationDepartment, OrganizationLocation, OrganizationPosition } from "../types/organization";
import { PageHeader, PageShell, SelectField } from "../components/ui/page-shell";

function tone(status: string) {
  if (status === "VALID") return "success";
  if (status === "EXPIRING_SOON") return "warning";
  if (status === "ARCHIVED" || status === "SOFT_DELETED") return "neutral";
  return "danger";
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
  const expiryDateRange: StandardDateRange = useMemo(() => ({ from: filters.expiry_from, to: filters.expiry_to }), [filters.expiry_from, filters.expiry_to]);
  const issueDateRange: StandardDateRange = useMemo(() => ({ from: filters.issue_from, to: filters.issue_to }), [filters.issue_from, filters.issue_to]);
  const uploadedDateRange: StandardDateRange = useMemo(() => ({ from: filters.uploaded_from, to: filters.uploaded_to }), [filters.uploaded_from, filters.uploaded_to]);

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
      downloadBlob(result.blob, result.filename);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to export registry.");
    }
  }

  async function download(doc: EmployeeDocument) {
    if (!token) return;
    try {
      const result = await api.downloadEmployeeDocument(token, doc.employee_id, doc.id);
      downloadBlob(result.blob, result.filename);
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

  function setFilter(key: keyof typeof defaultFilters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function setExpiryDateRange(range: StandardDateRange) {
    setFilters((current) => ({ ...current, expiry_from: range.from ?? "", expiry_to: range.to ?? "" }));
  }

  function setIssueDateRange(range: StandardDateRange) {
    setFilters((current) => ({ ...current, issue_from: range.from ?? "", issue_to: range.to ?? "" }));
  }

  function setUploadedDateRange(range: StandardDateRange) {
    setFilters((current) => ({ ...current, uploaded_from: range.from ?? "", uploaded_to: range.to ?? "" }));
  }

  const activeChips = [
    filters.search.trim() ? { key: "search", label: "Search", value: filters.search.trim(), onRemove: () => setFilter("search", "") } : null,
    filters.document_type_id ? { key: "documentType", label: "Document Type", value: types.find((type) => type.id === filters.document_type_id)?.name ?? "Selected", onRemove: () => setFilter("document_type_id", "") } : null,
    filters.display_status ? { key: "displayStatus", label: "Compliance", value: filters.display_status, onRemove: () => setFilter("display_status", "") } : null,
    filters.department_id ? { key: "department", label: "Department", value: departments.find((department) => department.id === filters.department_id)?.name ?? "Selected", onRemove: () => setFilter("department_id", "") } : null,
    filters.position_id ? { key: "position", label: "Position", value: positions.find((position) => position.id === filters.position_id)?.title ?? "Selected", onRemove: () => setFilter("position_id", "") } : null,
    filters.location_id ? { key: "location", label: "Location", value: locations.find((location) => location.id === filters.location_id)?.name ?? "Selected", onRemove: () => setFilter("location_id", "") } : null,
    filters.category_id ? { key: "category", label: "Category", value: categories.find((category) => category.id === filters.category_id)?.name ?? "Selected", onRemove: () => setFilter("category_id", "") } : null,
    filters.status ? { key: "storedStatus", label: "Stored", value: filters.status, onRemove: () => setFilter("status", "") } : null,
    filters.sensitive ? { key: "sensitive", label: "Sensitivity", value: filters.sensitive === "true" ? "Sensitive" : "Non-sensitive", onRemove: () => setFilter("sensitive", "") } : null,
    filters.expiry_from || filters.expiry_to ? { key: "expiry", label: "Expiry", value: `${filters.expiry_from || "Any"} - ${filters.expiry_to || "Any"}`, onRemove: () => setExpiryDateRange({}) } : null,
    filters.issue_from || filters.issue_to ? { key: "issue", label: "Issue", value: `${filters.issue_from || "Any"} - ${filters.issue_to || "Any"}`, onRemove: () => setIssueDateRange({}) } : null,
    filters.uploaded_from || filters.uploaded_to ? { key: "uploaded", label: "Uploaded", value: `${filters.uploaded_from || "Any"} - ${filters.uploaded_to || "Any"}`, onRemove: () => setUploadedDateRange({}) } : null
  ].filter(Boolean) as Array<{ key: string; label: string; value: string; onRemove: () => void }>;

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
          {canExport ? (
            <ExportMenu
              moduleName="Document Registry"
              rows={documents as unknown as Record<string, unknown>[]}
              columns={["employee_no", "employee_name", "document_type_name", "document_number", "display_status", "issue_date", "expiry_date", "created_at"]}
              filterSummary={Object.entries(activeFilters).map(([key, value]) => `${key}: ${value}`)}
              onBackendExport={async (format) => {
                if (format === "csv") {
                  await exportCsv();
                  return;
                }
                const { exportRows } = await import("../lib/export-utils");
                exportRows(format, "Document Registry", ["employee_no", "employee_name", "document_type_name", "document_number", "display_status", "issue_date", "expiry_date", "created_at"], documents as unknown as Record<string, unknown>[], Object.entries(activeFilters).map(([key, value]) => `${key}: ${value}`));
              }}
            />
          ) : null}
          </>
        }
      />

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <StandardFilterBar
        search={<StandardSearchInput value={filters.search} onDebouncedChange={(value) => setFilter("search", value)} placeholder="Search documents..." />}
        reset={<FilterResetButton onReset={() => setFilters(defaultFilters)} />}
        moreFilters={
          <MoreFiltersSheet onReset={() => setFilters(defaultFilters)}>
            <FilterSection title="Document">
              <StandardSelectFilter value={filters.category_id} onValueChange={(value) => setFilter("category_id", value)} allLabel="All categories" options={categories.map((item) => ({ value: item.id, label: item.name }))} />
              <StandardSelectFilter value={filters.status} onValueChange={(value) => setFilter("status", value)} allLabel="All stored statuses" width="status" options={["ACTIVE", "ARCHIVED", "SOFT_DELETED"].map((item) => ({ value: item, label: item }))} />
              <StandardSelectFilter value={filters.sensitive} onValueChange={(value) => setFilter("sensitive", value)} allLabel="All sensitivity" options={[{ value: "true", label: "Sensitive" }, { value: "false", label: "Non-sensitive" }]} />
            </FilterSection>
            <FilterSection title="Employee">
              <StandardSelectFilter value={filters.department_id} onValueChange={(value) => setFilter("department_id", value)} allLabel="All departments" width="department" options={departments.filter((item) => item.is_active !== false).map((item) => ({ value: item.id, label: item.name }))} />
              <StandardSelectFilter value={filters.position_id} onValueChange={(value) => setFilter("position_id", value)} allLabel="All positions" width="position" options={positions.filter((item) => item.is_active !== false).map((item) => ({ value: item.id, label: item.title }))} />
              <StandardSelectFilter value={filters.location_id} onValueChange={(value) => setFilter("location_id", value)} allLabel="All locations" width="department" options={locations.filter((item) => item.is_active !== false).map((item) => ({ value: item.id, label: item.name }))} />
            </FilterSection>
            <FilterSection title="Date">
              <StandardDateRangeFilter value={issueDateRange} onChange={setIssueDateRange} label="Issue Date Range" />
              <StandardDateRangeFilter value={uploadedDateRange} onChange={setUploadedDateRange} label="Uploaded Date Range" />
            </FilterSection>
          </MoreFiltersSheet>
        }
      >
        <StandardSelectFilter value={filters.document_type_id} onValueChange={(value) => setFilter("document_type_id", value)} allLabel="All document types" width="documentType" options={types.map((item) => ({ value: item.id, label: item.name }))} />
        <StandardSelectFilter value={filters.display_status} onValueChange={(value) => setFilter("display_status", value)} allLabel="All compliance" width="status" options={["VALID", "EXPIRING_SOON", "EXPIRED", "ARCHIVED", "SOFT_DELETED"].map((item) => ({ value: item, label: item }))} />
        <StandardDateRangeFilter value={expiryDateRange} onChange={setExpiryDateRange} label="Expiry Date Range" />
      </StandardFilterBar>
      <ActiveFilterChips chips={activeChips} />

      <Panel className="overflow-hidden">
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
                      <Link to={`/employees/${doc.employee_id}`}><RowActionButton intent="view" title="Open Employee 360"><Eye className="h-4 w-4" /></RowActionButton></Link>
                      <RowActionButton intent="download" title="Version history" onClick={() => void showVersions(doc)}><History className="h-4 w-4" /></RowActionButton>
                      {canDownload ? <RowActionButton intent="download" title="Download" onClick={() => void download(doc)}><Download className="h-4 w-4" /></RowActionButton> : null}
                      {canArchive && doc.status === "ACTIVE" ? <RowActionButton intent="archive" title="Archive" onClick={() => setDocumentAction({ document: doc, name: "archive", reason: "" })}><Archive className="h-4 w-4" /></RowActionButton> : null}
                      {canArchive && doc.status === "ARCHIVED" ? <RowActionButton intent="restore" title="Restore" onClick={() => setDocumentAction({ document: doc, name: "restore", reason: "" })}><RotateCcw className="h-4 w-4" /></RowActionButton> : null}
                      {canDelete && doc.status !== "SOFT_DELETED" ? <RowActionButton intent="delete" title="Soft delete" onClick={() => setDocumentAction({ document: doc, name: "soft-delete", reason: "" })}><Trash2 className="h-4 w-4" /></RowActionButton> : null}
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
