import { FileUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ExportMenu } from "../components/export/ExportMenu";
import { ActiveFilterChips, FilterResetButton, FilterSection, MoreFiltersSheet, StandardFilterBar, StandardSearchInput, StandardSelectFilter } from "../components/filters";
import { ActionTextButton } from "../components/ui/action-button";
import { Button, RowActionButton } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { TableSkeleton } from "../components/loading";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { PageHeader, PageShell, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { ApiError, api } from "../lib/api";
import type { DocumentType, MissingDocument } from "../types/documents";
import type { OrganizationDepartment, OrganizationLocation } from "../types/organization";

const emptyFilters = {
  search: "",
  department_id: "",
  location_id: "",
  document_type_id: "",
  employee_type: "",
  employment_type: ""
};

export function MissingDocumentsPage() {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("documents.view");
  const canUpload = permissions.has("documents.upload");
  const [rows, setRows] = useState<MissingDocument[]>([]);
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [filters, setFilters] = useState(emptyFilters);
  const [uploadRow, setUploadRow] = useState<MissingDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeFilters = useMemo(() => Object.fromEntries(Object.entries(filters).filter(([, value]) => value)), [filters]);
  const departmentName = (id: string) => departments.find((item) => item.id === id)?.name ?? id;
  const locationName = (id: string) => locations.find((item) => item.id === id)?.name ?? id;
  const documentTypeName = (id: string) => types.find((item) => item.id === id)?.name ?? id;
  const activeFilterChips = useMemo(() => [
    ...(filters.search ? [{ key: "search", label: "Search", value: filters.search, onRemove: () => setFilters((current) => ({ ...current, search: "" })) }] : []),
    ...(filters.department_id ? [{ key: "department", label: "Department", value: departmentName(filters.department_id), onRemove: () => setFilters((current) => ({ ...current, department_id: "" })) }] : []),
    ...(filters.document_type_id ? [{ key: "document_type", label: "Document Type", value: documentTypeName(filters.document_type_id), onRemove: () => setFilters((current) => ({ ...current, document_type_id: "" })) }] : []),
    ...(filters.location_id ? [{ key: "location", label: "Location", value: locationName(filters.location_id), onRemove: () => setFilters((current) => ({ ...current, location_id: "" })) }] : []),
    ...(filters.employee_type ? [{ key: "employee_type", label: "Employee Type", value: filters.employee_type.replace(/_/g, " "), title: filters.employee_type, onRemove: () => setFilters((current) => ({ ...current, employee_type: "" })) }] : []),
    ...(filters.employment_type ? [{ key: "employment_type", label: "Employment Type", value: filters.employment_type.replace(/_/g, " "), title: filters.employment_type, onRemove: () => setFilters((current) => ({ ...current, employment_type: "" })) }] : [])
  ], [departments, filters, locations, types]);

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    setError(null);
    try {
      const [missingResult, typeResult, departmentResult, locationResult] = await Promise.all([
        api.listMissingDocuments(token, activeFilters),
        api.listDocumentTypes(token),
        api.listDepartments(token),
        api.listLocations(token)
      ]);
      setRows(missingResult.missing);
      setTypes(typeResult.document_types);
      setDepartments(departmentResult.departments);
      setLocations(locationResult.locations);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load missing documents.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, canView, activeFilters]);

  if (!canView) return <PageShell><Panel><EmptyState title="Missing documents unavailable" description="Your account needs documents.view permission." /></Panel></PageShell>;

  return (
    <PageShell>
      <PageHeader
        title="Missing Required Documents"
        description="Required-rule gaps prepared for compliance follow-up."
        actions={
          <>
          <Link to="/settings/admin/imports"><ActionTextButton intent="import" size="sm">Validate document import</ActionTextButton></Link>
          <ExportMenu
            moduleName="Missing documents"
            rows={rows as unknown as Record<string, unknown>[]}
            columns={["employee_no", "employee_name", "department_name", "position_title", "location_name", "employee_type", "employment_type", "document_type_name", "category_name", "reason"]}
            filterSummary={activeFilterChips.map((chip) => `${chip.label}: ${chip.value}`)}
          />
          <Link to="/documents"><Button variant="outline" size="sm">Back to registry</Button></Link>
          </>
        }
      />
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Panel className="overflow-hidden">
        <div className="border-b p-3">
          <StandardFilterBar
            search={<StandardSearchInput value={filters.search} onDebouncedChange={(search) => setFilters((current) => ({ ...current, search }))} placeholder="Search employee or document type" />}
            reset={<FilterResetButton onReset={() => setFilters(emptyFilters)} />}
            moreFilters={
              <MoreFiltersSheet title="Missing document filters" onReset={() => setFilters((current) => ({ ...current, location_id: "", employee_type: "", employment_type: "" }))}>
                <FilterSection title="Additional filters">
                  <StandardSelectFilter value={filters.location_id} onValueChange={(location_id) => setFilters((current) => ({ ...current, location_id }))} allLabel="All locations" width="department" options={locations.map((item) => ({ value: item.id, label: item.name }))} />
                  <StandardSelectFilter value={filters.employee_type} onValueChange={(employee_type) => setFilters((current) => ({ ...current, employee_type }))} allLabel="All employee types" width="status" options={["LOCAL", "FOREIGN", "OTHER"].map((item) => ({ value: item, label: item.replace(/_/g, " ") }))} />
                  <StandardSelectFilter value={filters.employment_type} onValueChange={(employment_type) => setFilters((current) => ({ ...current, employment_type }))} allLabel="All employment types" width="status" options={["FULL_TIME", "PART_TIME", "INTERN", "TEMPORARY", "CONTRACT"].map((item) => ({ value: item, label: item.replace(/_/g, " ") }))} />
                </FilterSection>
              </MoreFiltersSheet>
            }
          >
            <StandardSelectFilter value={filters.department_id} onValueChange={(department_id) => setFilters((current) => ({ ...current, department_id }))} allLabel="All departments" width="department" options={departments.map((item) => ({ value: item.id, label: item.name }))} />
            <StandardSelectFilter value={filters.document_type_id} onValueChange={(document_type_id) => setFilters((current) => ({ ...current, document_type_id }))} allLabel="All document types" width="documentType" options={types.map((item) => ({ value: item.id, label: item.name }))} />
          </StandardFilterBar>
          <ActiveFilterChips chips={activeFilterChips} className="mt-2" />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Department</TableHead><TableHead>Position</TableHead><TableHead>Location</TableHead><TableHead>Employee type</TableHead><TableHead>Employment type</TableHead><TableHead>Required document</TableHead><TableHead>Category</TableHead><TableHead>Reason</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>{rows.map((row) => <TableRow key={`${row.employee_id}-${row.document_type_id}`}><TableCell><span className="font-medium">{row.employee_name}</span><div className="font-mono text-xs text-muted-foreground">{row.employee_no}</div></TableCell><TableCell>{row.department_name ?? "-"}</TableCell><TableCell>{row.position_title ?? "-"}</TableCell><TableCell>{row.location_name ?? "-"}</TableCell><TableCell>{row.employee_type}</TableCell><TableCell>{row.employment_type}</TableCell><TableCell>{row.document_type_name}</TableCell><TableCell>{row.category_name ?? "-"}</TableCell><TableCell>{row.reason ?? "Required rule"}</TableCell><TableCell><div className="flex justify-end gap-1"><Link to={`/employees/${row.employee_id}`}><RowActionButton intent="view" size="sm" title="Open 360">Open 360</RowActionButton></Link>{canUpload ? <RowActionButton intent="upload" size="sm" title="Upload missing document" onClick={() => setUploadRow(row)}><FileUp className="h-4 w-4" /> Upload</RowActionButton> : null}</div></TableCell></TableRow>)}</TableBody>
          </Table>
        </div>
        {loading ? <TableSkeleton rows={6} columns={10} label="Loading missing documents" /> : rows.length === 0 ? <EmptyState title="No missing documents" description="Required documents are currently satisfied for the loaded rules." /> : null}
      </Panel>
      {uploadRow && token ? <MissingUploadModal token={token} row={uploadRow} type={types.find((item) => item.id === uploadRow.document_type_id)} onClose={() => setUploadRow(null)} onSaved={load} /> : null}
    </PageShell>
  );
}

function MissingUploadModal({ token, row, type, onClose, onSaved }: { token: string; row: MissingDocument; type?: DocumentType; onClose: () => void; onSaved: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null);
  const [documentNumber, setDocumentNumber] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const alerts = useAlert();

  async function submit() {
    if (!file) {
      const message = "Choose a file to upload.";
      setError(message);
      alerts.showValidationError(message, "File required");
      return;
    }
    const form = new FormData();
    form.append("document_type_id", row.document_type_id);
    form.append("file", file);
    form.append("document_number", documentNumber);
    form.append("issue_date", issueDate);
    form.append("expiry_date", expiryDate);
    form.append("notes", notes);
    setSaving(true);
    setError(null);
    try {
      await api.uploadEmployeeDocument(token, row.employee_id, form);
      alerts.showSuccess("Document uploaded", "Missing required document was uploaded.");
      await onSaved();
      onClose();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Unable to upload document.";
      setError(message);
      alerts.showApiError(err, "Unable to upload document.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4"><div className="w-full max-w-2xl rounded-lg border bg-white shadow-xl"><div className="flex items-center justify-between border-b px-4 py-3"><div><h2 className="text-sm font-semibold">Upload missing document</h2><p className="text-xs text-muted-foreground">{row.employee_name} · {row.employee_no} · {row.document_type_name}</p></div><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></div><div className="grid gap-3 p-4 md:grid-cols-2"><div className="space-y-1.5 md:col-span-2"><Label>File</Label><Input type="file" accept={type?.allowed_file_types?.join(",")} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />{type ? <p className="text-xs text-muted-foreground">Max {type.max_file_size_mb} MB. {type.allowed_file_types?.join(", ")}</p> : null}</div><Field label={`Document number${type?.requires_document_number ? " *" : ""}`} value={documentNumber} onChange={setDocumentNumber} /><Field label={`Issue date${type?.requires_issue_date ? " *" : ""}`} type="date" value={issueDate} onChange={setIssueDate} /><Field label={`Expiry date${type?.requires_expiry_date ? " *" : ""}`} type="date" value={expiryDate} onChange={setExpiryDate} /><Field label="Notes" value={notes} onChange={setNotes} /></div>{error ? <div className="mx-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}<div className="flex justify-end gap-2 border-t px-4 py-3"><Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button><Button size="sm" loading={saving} loadingLabel="Uploading document" onClick={() => void submit()}>Upload</Button></div></div></div>;
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <div className="space-y-1.5"><Label>{label}</Label><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}
