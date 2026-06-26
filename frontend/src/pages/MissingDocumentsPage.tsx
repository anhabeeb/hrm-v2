import { FileUp, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
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

  if (!canView) return <Panel><EmptyState title="Missing documents unavailable" description="Your account needs documents.view permission." /></Panel>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Missing Required Documents</h1>
          <p className="text-sm text-muted-foreground">Required-rule gaps prepared for compliance follow-up.</p>
        </div>
        <Link to="/documents"><Button variant="outline" size="sm">Back to registry</Button></Link>
      </div>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Panel className="overflow-hidden">
        <div className="grid gap-2 border-b p-3 lg:grid-cols-6">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search employee or document type" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
          </div>
          <FilterSelect label="All departments" value={filters.department_id} onChange={(value) => setFilters({ ...filters, department_id: value })} options={departments.map((item) => ({ value: item.id, label: item.name }))} />
          <FilterSelect label="All locations" value={filters.location_id} onChange={(value) => setFilters({ ...filters, location_id: value })} options={locations.map((item) => ({ value: item.id, label: item.name }))} />
          <FilterSelect label="All document types" value={filters.document_type_id} onChange={(value) => setFilters({ ...filters, document_type_id: value })} options={types.map((item) => ({ value: item.id, label: item.name }))} />
          <SelectField aria-label="Employee type" value={filters.employee_type} onValueChange={(employee_type) => setFilters({ ...filters, employee_type })}><option value="">All employee types</option>{["LOCAL", "FOREIGN", "OTHER"].map((item) => <option key={item} value={item}>{item}</option>)}</SelectField>
          <SelectField aria-label="Employment type" value={filters.employment_type} onValueChange={(employment_type) => setFilters({ ...filters, employment_type })}><option value="">All employment types</option>{["FULL_TIME", "PART_TIME", "INTERN", "TEMPORARY", "CONTRACT"].map((item) => <option key={item} value={item}>{item}</option>)}</SelectField>
          <Button variant="outline" size="sm" onClick={() => setFilters(emptyFilters)}>Reset filters</Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Department</TableHead><TableHead>Position</TableHead><TableHead>Location</TableHead><TableHead>Employee type</TableHead><TableHead>Employment type</TableHead><TableHead>Required document</TableHead><TableHead>Category</TableHead><TableHead>Reason</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>{rows.map((row) => <TableRow key={`${row.employee_id}-${row.document_type_id}`}><TableCell><span className="font-medium">{row.employee_name}</span><div className="font-mono text-xs text-muted-foreground">{row.employee_no}</div></TableCell><TableCell>{row.department_name ?? "-"}</TableCell><TableCell>{row.position_title ?? "-"}</TableCell><TableCell>{row.location_name ?? "-"}</TableCell><TableCell>{row.employee_type}</TableCell><TableCell>{row.employment_type}</TableCell><TableCell>{row.document_type_name}</TableCell><TableCell>{row.category_name ?? "-"}</TableCell><TableCell>{row.reason ?? "Required rule"}</TableCell><TableCell><div className="flex justify-end gap-1"><Link to={`/employees/${row.employee_id}`}><Button variant="ghost" size="sm">Open 360</Button></Link>{canUpload ? <Button variant="outline" size="sm" onClick={() => setUploadRow(row)}><FileUp className="h-4 w-4" /> Upload</Button> : null}</div></TableCell></TableRow>)}</TableBody>
          </Table>
        </div>
        {loading ? <EmptyState title="Loading missing documents" description="Checking required-rule gaps." /> : rows.length === 0 ? <EmptyState title="No missing documents" description="Required documents are currently satisfied for the loaded rules." /> : null}
      </Panel>
      {uploadRow && token ? <MissingUploadModal token={token} row={uploadRow} type={types.find((item) => item.id === uploadRow.document_type_id)} onClose={() => setUploadRow(null)} onSaved={load} /> : null}
    </div>
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

  async function submit() {
    if (!file) {
      setError("Choose a file to upload.");
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
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to upload document.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4"><div className="w-full max-w-2xl rounded-lg border bg-white shadow-xl"><div className="flex items-center justify-between border-b px-4 py-3"><div><h2 className="text-sm font-semibold">Upload missing document</h2><p className="text-xs text-muted-foreground">{row.employee_name} · {row.employee_no} · {row.document_type_name}</p></div><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></div><div className="grid gap-3 p-4 md:grid-cols-2"><div className="space-y-1.5 md:col-span-2"><Label>File</Label><Input type="file" accept={type?.allowed_file_types?.join(",")} onChange={(event) => setFile(event.target.files?.[0] ?? null)} />{type ? <p className="text-xs text-muted-foreground">Max {type.max_file_size_mb} MB. {type.allowed_file_types?.join(", ")}</p> : null}</div><Field label={`Document number${type?.requires_document_number ? " *" : ""}`} value={documentNumber} onChange={setDocumentNumber} /><Field label={`Issue date${type?.requires_issue_date ? " *" : ""}`} type="date" value={issueDate} onChange={setIssueDate} /><Field label={`Expiry date${type?.requires_expiry_date ? " *" : ""}`} type="date" value={expiryDate} onChange={setExpiryDate} /><Field label="Notes" value={notes} onChange={setNotes} /></div>{error ? <div className="mx-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}<div className="flex justify-end gap-2 border-t px-4 py-3"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" disabled={saving} onClick={() => void submit()}>{saving ? "Uploading..." : "Upload"}</Button></div></div></div>;
}

function FilterSelect({ value, onChange, options, label }: { value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }>; label: string }) {
  return <SelectField aria-label={label} value={value} onValueChange={onChange}><option value="">{label}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</SelectField>;
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <div className="space-y-1.5"><Label>{label}</Label><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}
