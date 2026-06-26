import { Eye, FilePlus, Link2, Repeat2 } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { EmployeeIdentityCell } from "../components/employee/EmployeeIdentityCell";
import { AssetsNav } from "../components/assets/AssetsNav";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import type { AssetAssignment, AssetAssignmentEvent, AssetCategory, AssetItem } from "../types/assets";
import type { EmployeeDocument } from "../types/documents";
import type { Employee } from "../types/employees";
import type { OrganizationDepartment, OrganizationLocation } from "../types/organization";
import { SelectField as UiSelectField } from "../components/ui/page-shell";

type LifecycleAction = "return" | "mark-damaged" | "mark-lost" | "write-off";
type ModalState =
  | { type: "issue" }
  | { type: "lifecycle"; row: AssetAssignment; action: LifecycleAction }
  | { type: "replace"; row: AssetAssignment }
  | { type: "deduction"; row: AssetAssignment }
  | { type: "events"; row: AssetAssignment }
  | { type: "attachments"; row: AssetAssignment }
  | null;

export function AssetAssignmentsPage() {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canIssue = permissions.has("assets.issue");
  const canReturn = permissions.has("assets.return");
  const canDamage = permissions.has("assets.damage");
  const canLost = permissions.has("assets.lost");
  const canWriteOff = permissions.has("assets.write_off");
  const canManage = permissions.has("assets.manage");
  const canDeductions = permissions.has("assets.deductions.manage");
  const [rows, setRows] = useState<AssetAssignment[]>([]);
  const [items, setItems] = useState<AssetItem[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [filters, setFilters] = useState({ search: "", department_id: "", location_id: "", category_id: "", status: "", issued_date_from: "", issued_date_to: "", expected_return_date_from: "", expected_return_date_to: "", returned_date_from: "", returned_date_to: "" });
  const [modal, setModal] = useState<ModalState>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    setError(null);
    try {
      const [assignmentRows, itemRows, employeeRows, categoryRows, departmentRows, locationRows] = await Promise.all([
        api.listAssetAssignments(token, filters),
        api.listAssetItems(token, { status: "AVAILABLE" }),
        api.listEmployees(token),
        api.listAssetCategories(token),
        api.listDepartments(token),
        api.listLocations(token)
      ]);
      setRows(assignmentRows.assignments ?? []);
      setItems(itemRows.items ?? []);
      setEmployees(employeeRows.employees ?? []);
      setCategories(categoryRows.categories ?? []);
      setDepartments(departmentRows.departments ?? []);
      setLocations(locationRows.locations ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load assignments.");
    }
  }

  useEffect(() => { void load(); }, [token]);

  return (
    <div className="space-y-4">
      <div><h1 className="text-lg font-semibold">Asset Assignments</h1><p className="text-sm text-muted-foreground">Issue, return, replace, damage/lost, recovery, attachment, and event tracking.</p></div>
      <Panel className="p-0">
        <AssetsNav />
        <div className="grid gap-2 p-4 md:grid-cols-4 xl:grid-cols-6">
          <Input placeholder="Employee or asset" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
          <Select value={filters.department_id} onChange={(department_id) => setFilters({ ...filters, department_id })} empty="All departments" options={departments.map((row) => [row.id, row.name])} />
          <Select value={filters.location_id} onChange={(location_id) => setFilters({ ...filters, location_id })} empty="All locations" options={locations.map((row) => [row.id, row.name])} />
          <Select value={filters.category_id} onChange={(category_id) => setFilters({ ...filters, category_id })} empty="All categories" options={categories.map((row) => [row.id, row.name])} />
          <Select value={filters.status} onChange={(status) => setFilters({ ...filters, status })} empty="All status" options={["ISSUED","RETURNED","DAMAGED","LOST","REPLACED","WRITTEN_OFF"]} />
          <Button variant="outline" size="sm" onClick={() => void load()}>Filter</Button>
          <Field label="Issued from" type="date" value={filters.issued_date_from} onChange={(issued_date_from) => setFilters({ ...filters, issued_date_from })} />
          <Field label="Issued to" type="date" value={filters.issued_date_to} onChange={(issued_date_to) => setFilters({ ...filters, issued_date_to })} />
          <Field label="Expected from" type="date" value={filters.expected_return_date_from} onChange={(expected_return_date_from) => setFilters({ ...filters, expected_return_date_from })} />
          <Field label="Expected to" type="date" value={filters.expected_return_date_to} onChange={(expected_return_date_to) => setFilters({ ...filters, expected_return_date_to })} />
          <Field label="Returned from" type="date" value={filters.returned_date_from} onChange={(returned_date_from) => setFilters({ ...filters, returned_date_from })} />
          <Field label="Returned to" type="date" value={filters.returned_date_to} onChange={(returned_date_to) => setFilters({ ...filters, returned_date_to })} />
        </div>
        <div className="flex justify-end border-t p-3">{canIssue ? <Button size="sm" onClick={() => setModal({ type: "issue" })}>Issue asset</Button> : null}</div>
      </Panel>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Panel className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Asset</TableHead><TableHead>Category</TableHead><TableHead>Status</TableHead><TableHead>Issued</TableHead><TableHead>Expected return</TableHead><TableHead>Returned</TableHead><TableHead>Deduction</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell><EmployeeIdentityCell employeeId={row.employee_id} employeeName={row.employee_name} employeeNumber={row.employee_no} departmentName={row.department_name} locationName={row.location_name} size="sm" to={`/employees/${row.employee_id}`} /></TableCell>
                  <TableCell>{row.asset_code} / {row.asset_name}</TableCell>
                  <TableCell>{row.category_name ?? "-"}</TableCell>
                  <TableCell><Badge tone={row.status === "ISSUED" ? "success" : row.status === "RETURNED" ? "neutral" : "warning"}>{row.status}</Badge></TableCell>
                  <TableCell>{row.issued_date ?? row.issued_at ?? "-"}</TableCell>
                  <TableCell>{row.expected_return_date ?? row.expected_return_at ?? "-"}</TableCell>
                  <TableCell>{row.returned_date ?? row.returned_at ?? "-"}</TableCell>
                  <TableCell>{row.deduction_amount ?? "-"}</TableCell>
                  <TableCell><div className="flex min-w-[520px] justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setModal({ type: "events", row })}><Eye className="h-4 w-4" /> Events</Button>
                    {canManage ? <Button variant="ghost" size="sm" onClick={() => setModal({ type: "attachments", row })}><FilePlus className="h-4 w-4" /> Attachments</Button> : null}
                    {row.status === "ISSUED" && canReturn ? <Button variant="ghost" size="sm" onClick={() => setModal({ type: "lifecycle", row, action: "return" })}>Return</Button> : null}
                    {row.status === "ISSUED" && canDamage ? <Button variant="ghost" size="sm" onClick={() => setModal({ type: "lifecycle", row, action: "mark-damaged" })}>Damage</Button> : null}
                    {row.status === "ISSUED" && canLost ? <Button variant="ghost" size="sm" onClick={() => setModal({ type: "lifecycle", row, action: "mark-lost" })}>Lost</Button> : null}
                    {row.status === "ISSUED" && canWriteOff ? <Button variant="ghost" size="sm" onClick={() => setModal({ type: "lifecycle", row, action: "write-off" })}>Write off</Button> : null}
                    {row.status === "ISSUED" && canIssue ? <Button variant="ghost" size="sm" onClick={() => setModal({ type: "replace", row })}><Repeat2 className="h-4 w-4" /> Replace</Button> : null}
                    {canDeductions ? <Button variant="ghost" size="sm" onClick={() => setModal({ type: "deduction", row })}><Link2 className="h-4 w-4" /> Deduction</Button> : null}
                    <Link to={`/employees/${row.employee_id}`}><Button variant="ghost" size="sm">Employee 360</Button></Link>
                  </div></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!rows.length ? <EmptyState title="No assignments" description="Assignments appear after assets are issued to employees." /> : null}
        </div>
      </Panel>
      {modal?.type === "issue" ? <IssueModal employees={employees} items={items} onClose={() => setModal(null)} onSaved={() => { setModal(null); void load(); }} /> : null}
      {modal?.type === "lifecycle" ? <LifecycleModal row={modal.row} action={modal.action} onClose={() => setModal(null)} onSaved={() => { setModal(null); void load(); }} /> : null}
      {modal?.type === "replace" ? <ReplaceModal row={modal.row} items={items} onClose={() => setModal(null)} onSaved={() => { setModal(null); void load(); }} /> : null}
      {modal?.type === "deduction" ? <DeductionModal row={modal.row} onClose={() => setModal(null)} onSaved={() => { setModal(null); void load(); }} /> : null}
      {modal?.type === "events" ? <EventsModal row={modal.row} onClose={() => setModal(null)} /> : null}
      {modal?.type === "attachments" ? <AttachmentsModal row={modal.row} onClose={() => setModal(null)} /> : null}
    </div>
  );
}

function IssueModal({ employees, items, onClose, onSaved }: { employees: Employee[]; items: AssetItem[]; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [assetItemId, setAssetItemId] = useState(items[0]?.id ?? "");
  const [issuedDate, setIssuedDate] = useState(new Date().toISOString().slice(0, 10));
  const [expectedReturnDate, setExpectedReturnDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (!token) return;
    try {
      await api.issueAssetAssignment(token, { employee_id: employeeId, asset_item_id: assetItemId, issued_date: issuedDate, expected_return_date: expectedReturnDate || null, notes: notes || null });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to issue asset.");
    }
  }
  return <Dialog title="Issue asset" error={error} onClose={onClose} onSave={save} saveLabel="Issue"><SelectField label="Employee" value={employeeId} onChange={setEmployeeId} options={employees.map((employee) => [employee.id, `${employee.employee_no} / ${employee.full_name}`])} /><SelectField label="Asset item" value={assetItemId} onChange={setAssetItemId} options={items.map((item) => [item.id, `${item.code} / ${item.name}`])} /><Field label="Issued date" type="date" value={issuedDate} onChange={setIssuedDate} /><Field label="Expected return" type="date" value={expectedReturnDate} onChange={setExpectedReturnDate} /><Field label="Notes" value={notes} onChange={setNotes} /></Dialog>;
}

function LifecycleModal({ row, action, onClose, onSaved }: { row: AssetAssignment; action: LifecycleAction; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const [returnedDate, setReturnedDate] = useState(new Date().toISOString().slice(0, 10));
  const [condition, setCondition] = useState("GOOD");
  const [reason, setReason] = useState("");
  const [deductionAmount, setDeductionAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (!token) return;
    try {
      await api.assetAssignmentAction(token, row.id, action, { reason, returned_date: returnedDate, condition_on_return: condition, deduction_amount: deductionAmount ? Number(deductionAmount) : null });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update assignment.");
    }
  }
  return <Dialog title={`${action.replace("-", " ")} asset`} error={error} onClose={onClose} onSave={save}>{action === "return" ? <><Field label="Returned date" type="date" value={returnedDate} onChange={setReturnedDate} /><Field label="Condition on return" value={condition} onChange={setCondition} /></> : null}<Field label="Reason / notes" value={reason} onChange={setReason} /><Field label="Deduction amount" type="number" value={deductionAmount} onChange={setDeductionAmount} /></Dialog>;
}

function ReplaceModal({ row, items, onClose, onSaved }: { row: AssetAssignment; items: AssetItem[]; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const [replacementAssetItemId, setReplacementAssetItemId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (!token) return;
    try {
      await api.replaceAssetAssignment(token, row.id, { replacement_asset_item_id: replacementAssetItemId || null, reason });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to replace asset.");
    }
  }
  return <Dialog title="Replace asset" error={error} onClose={onClose} onSave={save}><SelectField label="Replacement item" value={replacementAssetItemId} onChange={setReplacementAssetItemId} empty="No replacement item" options={items.map((item) => [item.id, `${item.code} / ${item.name}`])} /><Field label="Reason" value={reason} onChange={setReason} /></Dialog>;
}

function DeductionModal({ row, onClose, onSaved }: { row: AssetAssignment; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const [deductionId, setDeductionId] = useState(row.payroll_deduction_id ?? "");
  const [adjustmentId, setAdjustmentId] = useState("");
  const [amount, setAmount] = useState(String(row.deduction_amount ?? ""));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (!token) return;
    try {
      await api.linkAssetDeduction(token, row.id, { payroll_deduction_id: deductionId || null, payroll_adjustment_id: adjustmentId || null, deduction_amount: amount ? Number(amount) : null, reason });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to link deduction.");
    }
  }
  return <Dialog title="Link deduction/recovery" error={error} onClose={onClose} onSave={save}><Field label="Payroll deduction id" value={deductionId} onChange={setDeductionId} /><Field label="Payroll adjustment id" value={adjustmentId} onChange={setAdjustmentId} /><Field label="Deduction amount" type="number" value={amount} onChange={setAmount} /><Field label="Reason" value={reason} onChange={setReason} /></Dialog>;
}

function EventsModal({ row, onClose }: { row: AssetAssignment; onClose: () => void }) {
  const { token } = useAuth();
  const [events, setEvents] = useState<AssetAssignmentEvent[]>([]);
  useEffect(() => { if (token) void api.listAssetAssignmentEvents(token, row.id).then((result) => setEvents(result.events ?? [])); }, [token, row.id]);
  return <ReadDialog title="Assignment events" onClose={onClose}>{events.length ? <Table><TableHeader><TableRow><TableHead>Event</TableHead><TableHead>Reason</TableHead><TableHead>By</TableHead><TableHead>Created</TableHead></TableRow></TableHeader><TableBody>{events.map((event) => <TableRow key={event.id}><TableCell>{event.event_type}</TableCell><TableCell>{event.reason ?? "-"}</TableCell><TableCell>{event.event_by_name ?? "-"}</TableCell><TableCell>{event.created_at}</TableCell></TableRow>)}</TableBody></Table> : <EmptyState title="No events" description="Lifecycle events will appear here." />}</ReadDialog>;
}

function AttachmentsModal({ row, onClose }: { row: AssetAssignment; onClose: () => void }) {
  const { token } = useAuth();
  const [attachments, setAttachments] = useState<Record<string, unknown>[]>([]);
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [documentId, setDocumentId] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function load() {
    if (!token) return;
    const [attachmentRows, documentRows] = await Promise.all([api.listAssetAssignmentAttachments(token, row.id), api.listEmployeeDocuments(token, row.employee_id)]);
    setAttachments(attachmentRows.attachments ?? []);
    setDocuments(documentRows.documents ?? []);
    setDocumentId(documentRows.documents?.[0]?.id ?? "");
  }
  useEffect(() => { void load(); }, [token, row.id]);
  async function attach() {
    if (!token) return;
    try {
      await api.attachAssetDocument(token, row.id, { employee_document_id: documentId, description });
      setDescription("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to attach document.");
    }
  }
  async function detach(id: string) {
    if (!token) return;
    await api.detachAssetDocument(token, row.id, id);
    await load();
  }
  return <ReadDialog title="Assignment attachments" onClose={onClose}>{error ? <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}<div className="mb-3 grid gap-2 md:grid-cols-3"><SelectField label="Document" value={documentId} onChange={setDocumentId} options={documents.map((document) => [document.id, document.original_filename ?? document.document_number ?? document.document_type_name ?? document.id])} /><Field label="Description" value={description} onChange={setDescription} /><div className="flex items-end"><Button size="sm" disabled={!documentId} onClick={() => void attach()}>Attach</Button></div></div><Table><TableHeader><TableRow><TableHead>Document</TableHead><TableHead>Type</TableHead><TableHead>Description</TableHead><TableHead>Attached</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{attachments.map((attachment) => <TableRow key={String(attachment.id)}><TableCell>{Boolean(attachment.restricted) ? <span className="flex items-center gap-2">Restricted document <Badge tone="warning">Restricted</Badge></span> : Boolean(attachment.unavailable) ? "Unavailable document" : String(attachment.original_filename ?? attachment.document_number ?? "-")}</TableCell><TableCell>{Boolean(attachment.restricted) ? "Restricted document" : String(attachment.document_type_name ?? "-")}</TableCell><TableCell>{String(attachment.description ?? "-")}</TableCell><TableCell>{String(attachment.attached_at ?? "-")}</TableCell><TableCell className="text-right"><Button variant="ghost" size="sm" onClick={() => void detach(String(attachment.id))}>Detach</Button></TableCell></TableRow>)}</TableBody></Table></ReadDialog>;
}

function Dialog({ title, error, children, saveLabel = "Save", onClose, onSave }: { title: string; error: string | null; children: ReactNode; saveLabel?: string; onClose: () => void; onSave: () => void | Promise<void> }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4"><div className="w-full max-w-2xl rounded-lg border bg-white shadow-xl"><div className="flex justify-between border-b px-4 py-3"><h2 className="text-sm font-semibold">{title}</h2><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></div><div className="grid gap-3 p-4 md:grid-cols-2">{children}</div>{error ? <div className="mx-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}<div className="flex justify-end gap-2 border-t px-4 py-3"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={() => void onSave()}>{saveLabel}</Button></div></div></div>;
}

function ReadDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4"><div className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-lg border bg-white shadow-xl"><div className="flex justify-between border-b px-4 py-3"><h2 className="text-sm font-semibold">{title}</h2><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></div><div className="overflow-auto p-4">{children}</div></div></div>;
}

function Select({ value, onChange, options, empty }: { value: string; onChange: (value: string) => void; options: Array<string | [string, string]>; empty: string }) {
  return <UiSelectField value={value} onValueChange={onChange}><option value="">{empty}</option>{options.map((option) => { const id = Array.isArray(option) ? option[0] : option; const label = Array.isArray(option) ? option[1] : option; return <option key={id} value={id}>{label}</option>; })}</UiSelectField>;
}

function SelectField({ label, value, onChange, options, empty }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]>; empty?: string }) {
  return <UiSelectField label={label} value={value} onValueChange={onChange}>{empty ? <option value="">{empty}</option> : null}{options.map(([id, labelText]) => <option key={id} value={id}>{labelText}</option>)}</UiSelectField>;
}

function Field({ label, value, type = "text", onChange }: { label: string; value: string; type?: string; onChange: (value: string) => void }) {
  return <div className="space-y-1.5"><Label>{label}</Label><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}
