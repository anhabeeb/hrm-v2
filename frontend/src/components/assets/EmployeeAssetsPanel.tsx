import { Eye, FilePlus, Link2, Repeat2 } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "../ui/badge";
import { Button, RowActionButton } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Panel } from "../ui/panel";
import { SelectField as UiSelectField } from "../ui/page-shell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { useAuth } from "../../hooks/useAuth";
import { ApiError, api } from "../../lib/api";
import type { AssetAssignment, AssetAssignmentEvent, AssetCategory, AssetItem, AssetUniformClearanceSummary, UniformAssignment } from "../../types/assets";
import type { EmployeeDocument } from "../../types/documents";
import type { Employee } from "../../types/employees";

type LifecycleAction = "return" | "mark-damaged" | "mark-lost" | "write-off";
type ModalState =
  | { type: "issue" }
  | { type: "lifecycle"; row: AssetAssignment; action: LifecycleAction }
  | { type: "replace"; row: AssetAssignment }
  | { type: "deduction"; row: AssetAssignment }
  | { type: "events"; row: AssetAssignment }
  | { type: "attachments"; row: AssetAssignment }
  | null;

function statusTone(status?: string) {
  if (status === "ISSUED" || status === "AVAILABLE") return "success";
  if (status === "RETURNED" || status === "REPLACED") return "neutral";
  if (status === "DAMAGED") return "warning";
  return "danger";
}

export function EmployeeAssetsPanel({ employee }: { employee: Employee }) {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const canIssue = permissions.has("assets.issue");
  const canReturn = permissions.has("assets.return");
  const canDamage = permissions.has("assets.damage");
  const canLost = permissions.has("assets.lost");
  const canWriteOff = permissions.has("assets.write_off");
  const canManage = permissions.has("assets.manage");
  const canDeductions = permissions.has("assets.deductions.manage");
  const [assignments, setAssignments] = useState<AssetAssignment[]>([]);
  const [uniforms, setUniforms] = useState<UniformAssignment[]>([]);
  const [history, setHistory] = useState<AssetAssignmentEvent[]>([]);
  const [clearance, setClearance] = useState<AssetUniformClearanceSummary | null>(null);
  const [items, setItems] = useState<AssetItem[]>([]);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [modal, setModal] = useState<ModalState>(null);
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => ({
    issued: assignments.filter((row) => row.status === "ISSUED").length,
    returned: assignments.filter((row) => row.status === "RETURNED").length,
    damaged: assignments.filter((row) => row.status === "DAMAGED").length,
    lost: assignments.filter((row) => row.status === "LOST").length,
    pendingReturn: assignments.filter((row) => row.status === "ISSUED" && (row.expected_return_date ?? row.expected_return_at)).length,
    recovery: assignments.filter((row) => row.deduction_amount || row.payroll_deduction_id).length
  }), [assignments]);
  const uniformCounts = useMemo(() => ({
    issued: uniforms.filter((row) => row.assignment_status === "ISSUED").length,
    returned: uniforms.filter((row) => row.assignment_status === "RETURNED").length,
    damaged: uniforms.filter((row) => row.assignment_status === "DAMAGED").length,
    lost: uniforms.filter((row) => row.assignment_status === "LOST").length
  }), [uniforms]);

  async function load() {
    if (!token) return;
    setError(null);
    try {
      const [summary, itemRows, categoryRows] = await Promise.all([
        api.getEmployeeAssetUniformSummary(token, employee.id).catch(() => api.getEmployeeAssetSummary(token, employee.id)),
        api.listAssetItems(token, { status: "AVAILABLE" }),
        api.listAssetCategories(token)
      ]);
      setAssignments(summary.assets ?? summary.current_assignments ?? summary.assignments ?? []);
      setUniforms(summary.uniforms ?? []);
      setHistory(summary.history ?? []);
      setClearance(summary.clearance ?? null);
      setItems(itemRows.items ?? []);
      setCategories(categoryRows.categories ?? []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load employee assets.");
    }
  }

  useEffect(() => { void load(); }, [token, employee.id]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div><h3 className="text-sm font-semibold">Assets & uniforms</h3><p className="text-xs text-muted-foreground">Current issue, returns, damage/lost, deduction recovery, history, attachments, and clearance foundation.</p></div>
        {canIssue ? <Button size="sm" onClick={() => setModal({ type: "issue" })}>Issue asset</Button> : null}
      </div>
      <div className="grid gap-2 md:grid-cols-6">
        <Metric label="Currently issued" value={counts.issued} tone="success" />
        <Metric label="Returned" value={counts.returned} tone="neutral" />
        <Metric label="Damaged" value={counts.damaged} tone="warning" />
        <Metric label="Lost" value={counts.lost} tone="danger" />
        <Metric label="Pending return" value={counts.pendingReturn} tone="warning" />
        <Metric label="Deduction/recovery" value={counts.recovery} tone="info" />
      </div>
      <div className="grid gap-2 md:grid-cols-5">
        <Metric label="Uniforms issued" value={uniformCounts.issued} tone="success" />
        <Metric label="Uniforms returned" value={uniformCounts.returned} tone="neutral" />
        <Metric label="Uniforms damaged" value={uniformCounts.damaged} tone="warning" />
        <Metric label="Uniforms lost" value={uniformCounts.lost} tone="danger" />
        <Metric label="Clearance pending" value={clearance?.pending_count ?? 0} tone={(clearance?.pending_count ?? 0) > 0 ? "warning" : "success"} />
      </div>
      {employee.status_key && !["ACTIVE", "ON_LEAVE", "DRAFT_ONBOARDING"].includes(employee.status_key) ? <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Asset clearance may be required for this employee status.</div> : null}
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Panel className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Asset</TableHead><TableHead>Category</TableHead><TableHead>Status</TableHead><TableHead>Issued</TableHead><TableHead>Expected return</TableHead><TableHead>Returned</TableHead><TableHead>Deduction</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>{assignments.map((row) => <TableRow key={row.id}><TableCell><div className="font-medium">{row.asset_name}</div><div className="text-xs text-muted-foreground">{row.asset_code}</div></TableCell><TableCell>{row.category_name ?? "-"}</TableCell><TableCell><Badge tone={statusTone(row.status)}>{row.status}</Badge></TableCell><TableCell>{row.issued_date ?? row.issued_at ?? "-"}</TableCell><TableCell>{row.expected_return_date ?? row.expected_return_at ?? "-"}</TableCell><TableCell>{row.returned_date ?? row.returned_at ?? "-"}</TableCell><TableCell>{row.deduction_amount ?? row.replacement_cost_charged ?? "-"}</TableCell><TableCell><div className="flex min-w-[480px] justify-end gap-1"><RowActionButton intent="view" size="sm" title="Events" onClick={() => setModal({ type: "events", row })}><Eye className="h-4 w-4" /> Events</RowActionButton>{canManage ? <RowActionButton intent="upload" size="sm" title="Files" onClick={() => setModal({ type: "attachments", row })}><FilePlus className="h-4 w-4" /> Files</RowActionButton> : null}{row.status === "ISSUED" && canReturn ? <RowActionButton intent="release" size="sm" title="Return" onClick={() => setModal({ type: "lifecycle", row, action: "return" })}>Return</RowActionButton> : null}{row.status === "ISSUED" && canDamage ? <RowActionButton intent="warning" size="sm" title="Damage" onClick={() => setModal({ type: "lifecycle", row, action: "mark-damaged" })}>Damage</RowActionButton> : null}{row.status === "ISSUED" && canLost ? <RowActionButton intent="warning" size="sm" title="Lost" onClick={() => setModal({ type: "lifecycle", row, action: "mark-lost" })}>Lost</RowActionButton> : null}{row.status === "ISSUED" && canWriteOff ? <RowActionButton intent="delete" size="sm" title="Write off" onClick={() => setModal({ type: "lifecycle", row, action: "write-off" })}>Write off</RowActionButton> : null}{row.status === "ISSUED" && canIssue ? <RowActionButton intent="upload" size="sm" title="Replace" onClick={() => setModal({ type: "replace", row })}><Repeat2 className="h-4 w-4" /> Replace</RowActionButton> : null}{canDeductions ? <RowActionButton intent="create" size="sm" title="Deduction" onClick={() => setModal({ type: "deduction", row })}><Link2 className="h-4 w-4" /> Deduction</RowActionButton> : null}</div></TableCell></TableRow>)}</TableBody>
          </Table>
          {!assignments.length ? <EmptyState title="No issued assets" description="Issue uniforms, devices, keys, or cards from this panel." /> : null}
        </div>
      </Panel>
      <Panel className="overflow-hidden p-0">
        <div className="border-b px-3 py-2 text-sm font-semibold">Uniform assignments</div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Uniform</TableHead><TableHead>Size</TableHead><TableHead>Quantity</TableHead><TableHead>Status</TableHead><TableHead>Clearance</TableHead><TableHead>Issued</TableHead><TableHead>Returned</TableHead><TableHead>Deduction</TableHead></TableRow></TableHeader>
            <TableBody>{uniforms.map((row) => <TableRow key={row.id}><TableCell><div className="font-medium">{row.uniform_type_name}</div><div className="text-xs text-muted-foreground">{row.uniform_type_code}</div></TableCell><TableCell>{row.size_label ?? "-"}</TableCell><TableCell>{row.quantity_issued} issued, {row.quantity_returned} returned</TableCell><TableCell><Badge tone={statusTone(row.assignment_status)}>{row.assignment_status}</Badge></TableCell><TableCell><Badge tone={statusTone(row.clearance_status)}>{row.clearance_status}</Badge></TableCell><TableCell>{row.issued_date}</TableCell><TableCell>{row.returned_date ?? "-"}</TableCell><TableCell>{row.deduction_amount ?? "-"}</TableCell></TableRow>)}</TableBody>
          </Table>
          {!uniforms.length ? <EmptyState title="No issued uniforms" description="Uniform issue and clearance records appear here." /> : null}
        </div>
      </Panel>
      <SimpleHistory rows={history} />
      {modal?.type === "issue" ? <IssueAssetModal employee={employee} categories={categories} items={items} onClose={() => setModal(null)} onSaved={() => { setModal(null); void load(); }} /> : null}
      {modal?.type === "lifecycle" ? <LifecycleModal row={modal.row} action={modal.action} onClose={() => setModal(null)} onSaved={() => { setModal(null); void load(); }} /> : null}
      {modal?.type === "replace" ? <ReplaceModal row={modal.row} items={items} onClose={() => setModal(null)} onSaved={() => { setModal(null); void load(); }} /> : null}
      {modal?.type === "deduction" ? <DeductionModal row={modal.row} onClose={() => setModal(null)} onSaved={() => { setModal(null); void load(); }} /> : null}
      {modal?.type === "events" ? <EventsModal row={modal.row} onClose={() => setModal(null)} /> : null}
      {modal?.type === "attachments" ? <AttachmentsModal row={modal.row} onClose={() => setModal(null)} /> : null}
    </div>
  );
}

function IssueAssetModal({ employee, categories, items, onClose, onSaved }: { employee: Employee; categories: AssetCategory[]; items: AssetItem[]; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const [assetItemId, setAssetItemId] = useState(items[0]?.id ?? "");
  const [issuedAt, setIssuedAt] = useState(new Date().toISOString().slice(0, 10));
  const [expectedReturnAt, setExpectedReturnAt] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (!token) return;
    try {
      await api.issueAssetAssignment(token, { employee_id: employee.id, asset_item_id: assetItemId, issued_date: issuedAt, expected_return_date: expectedReturnAt || null, notes: notes || null });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to issue asset.");
    }
  }
  return <Dialog title="Issue asset" error={error} onClose={onClose} onSave={save} saveLabel="Issue"><SelectField label="Asset item" value={assetItemId} onChange={setAssetItemId} options={items.map((item) => [item.id, `${item.code} / ${item.name} / ${categories.find((category) => category.id === item.category_id)?.name ?? item.category_name ?? "Uncategorized"}`])} /><Field label="Issued date" type="date" value={issuedAt} onChange={setIssuedAt} /><Field label="Expected return" type="date" value={expectedReturnAt} onChange={setExpectedReturnAt} /><Field label="Issue notes" value={notes} onChange={setNotes} /></Dialog>;
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
  return <ReadDialog title="Assignment attachments" onClose={onClose}>{error ? <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}<div className="mb-3 grid gap-2 md:grid-cols-3"><SelectField label="Document" value={documentId} onChange={setDocumentId} options={documents.map((document) => [document.id, document.original_filename ?? document.document_number ?? document.document_type_name ?? document.id])} /><Field label="Description" value={description} onChange={setDescription} /><div className="flex items-end"><Button size="sm" disabled={!documentId} onClick={() => void attach()}>Attach</Button></div></div><Table><TableHeader><TableRow><TableHead>Document</TableHead><TableHead>Type</TableHead><TableHead>Description</TableHead><TableHead>Attached</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{attachments.map((attachment) => <TableRow key={String(attachment.id)}><TableCell>{Boolean(attachment.restricted) ? <span className="flex items-center gap-2">Restricted document <Badge tone="warning">Restricted</Badge></span> : Boolean(attachment.unavailable) ? "Unavailable document" : String(attachment.original_filename ?? attachment.document_number ?? "-")}</TableCell><TableCell>{Boolean(attachment.restricted) ? "Restricted document" : String(attachment.document_type_name ?? "-")}</TableCell><TableCell>{String(attachment.description ?? "-")}</TableCell><TableCell>{String(attachment.attached_at ?? "-")}</TableCell><TableCell className="text-right"><RowActionButton intent="delete" size="sm" title="Detach" onClick={() => void detach(String(attachment.id))}>Detach</RowActionButton></TableCell></TableRow>)}</TableBody></Table></ReadDialog>;
}

function SimpleHistory({ rows }: { rows: AssetAssignmentEvent[] }) {
  return <Panel className="p-0"><div className="border-b px-3 py-2 text-sm font-semibold">Assignment history/events</div>{rows.length ? <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Event</TableHead><TableHead>Reason</TableHead><TableHead>Created</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell>{row.event_type}</TableCell><TableCell>{row.reason ?? "-"}</TableCell><TableCell>{row.created_at}</TableCell></TableRow>)}</TableBody></Table></div> : <EmptyState title="No asset history" description="Issue, return, damage, lost, and attachment events appear here." />}</Panel>;
}

function Metric({ label, value, tone }: { label: string; value: number; tone: "neutral" | "success" | "warning" | "danger" | "info" }) {
  return <div className="rounded-md border px-3 py-2"><p className="text-xs text-muted-foreground">{label}</p><div className="mt-1 flex items-center justify-between"><span className="text-lg font-semibold">{value}</span><Badge tone={tone}>{label}</Badge></div></div>;
}

function Dialog({ title, error, children, saveLabel = "Save", onClose, onSave }: { title: string; error: string | null; children: ReactNode; saveLabel?: string; onClose: () => void; onSave: () => void | Promise<void> }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4"><div className="w-full max-w-2xl rounded-lg border bg-white shadow-xl"><div className="flex justify-between border-b px-4 py-3"><h2 className="text-sm font-semibold">{title}</h2><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></div><div className="grid gap-3 p-4 md:grid-cols-2">{children}</div>{error ? <div className="mx-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}<div className="flex justify-end gap-2 border-t px-4 py-3"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={() => void onSave()}>{saveLabel}</Button></div></div></div>;
}

function ReadDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4"><div className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-lg border bg-white shadow-xl"><div className="flex justify-between border-b px-4 py-3"><h2 className="text-sm font-semibold">{title}</h2><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></div><div className="overflow-auto p-4">{children}</div></div></div>;
}

function SelectField({ label, value, onChange, options, empty }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]>; empty?: string }) {
  return <UiSelectField label={label} value={value} onValueChange={onChange}>{empty ? <option value="">{empty}</option> : null}{options.map(([id, labelText]) => <option key={id} value={id}>{labelText}</option>)}</UiSelectField>;
}

function Field({ label, type = "text", value, onChange }: { label: string; type?: string; value: string; onChange: (value: string) => void }) {
  return <div className="space-y-1.5"><Label>{label}</Label><Input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}
