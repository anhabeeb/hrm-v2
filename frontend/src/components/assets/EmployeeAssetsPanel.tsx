import { Eye, FilePlus, Link2, Repeat2 } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { ActionTextButton } from "../ui/action-button";
import { Badge } from "../ui/badge";
import { Button, RowActionButton } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { Panel } from "../ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { useAuth } from "../../hooks/useAuth";
import { ApiError, api } from "../../lib/api";
import { focusFirstInvalidField, normalizeValidationIssues, useFormValidation, validateAmount, validateDateRange, validateRequiredField, type ValidationIssue } from "../../lib/form-validation";
import type { AssetAssignment, AssetAssignmentEvent, AssetCategory, AssetItem, AssetUniformClearanceSummary, UniformAssignment } from "../../types/assets";
import type { EmployeeDocument } from "../../types/documents";
import type { Employee } from "../../types/employees";
import { useAlert } from "../alerts/useAlert";
import { FormErrorSummary } from "../forms/FormErrorSummary";
import { ValidatedReasonField, ValidatedSelectField, ValidatedTextField } from "../forms/validated-fields";

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

function hasErrors(issues: ValidationIssue[]) {
  return issues.some((issue) => issue.severity === "error");
}

export function EmployeeAssetsPanel({ employee }: { employee: Employee }) {
  const { token, user } = useAuth();
  const permissions = new Set(user?.permissions ?? []);
  const assetsUniformsVisible = user?.module_visibility?.assets_uniforms !== false;
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
    if (!token || !assetsUniformsVisible) {
      setAssignments([]);
      setUniforms([]);
      setHistory([]);
      setClearance(null);
      setItems([]);
      setCategories([]);
      setError(null);
      return;
    }
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

  useEffect(() => { void load(); }, [token, employee.id, assetsUniformsVisible]);

  if (!assetsUniformsVisible) {
    return (
      <Panel className="p-4">
        <EmptyState title="Assets & uniforms disabled" description="This optional employee section is disabled in Settings." />
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div><h3 className="text-sm font-semibold">Assets & uniforms</h3><p className="text-xs text-muted-foreground">Current issue, returns, damage/lost, deduction recovery, history, attachments, and clearance foundation.</p></div>
        {canIssue ? <ActionTextButton intent="create" size="sm" onClick={() => setModal({ type: "issue" })}>Issue asset</ActionTextButton> : null}
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
  const alerts = useAlert();
  const [assetItemId, setAssetItemId] = useState(items[0]?.id ?? "");
  const [issuedAt, setIssuedAt] = useState(new Date().toISOString().slice(0, 10));
  const [expectedReturnAt, setExpectedReturnAt] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const validation = useFormValidation();
  async function save() {
    if (!token) return;
    const issues = [
      ...validateRequiredField(assetItemId, "asset_item_id", "Asset item"),
      ...validateRequiredField(issuedAt, "issued_date", "Issued date"),
      ...validateDateRange({ start: issuedAt, end: expectedReturnAt, startField: "issued_date", endField: "expected_return_date", label: "Expected return" })
    ];
    validation.setIssues(issues);
    if (hasErrors(issues)) {
      alerts.showValidationError(issues, "Asset issue needs attention");
      setTimeout(() => focusFirstInvalidField(issues), 0);
      return;
    }
    try {
      await api.issueAssetAssignment(token, { employee_id: employee.id, asset_item_id: assetItemId, issued_date: issuedAt, expected_return_date: expectedReturnAt || null, notes: notes || null });
      alerts.showSuccess("Asset issued", "The asset assignment was created.");
      onSaved();
    } catch (err) {
      const issuesFromApi = normalizeValidationIssues(err);
      if (issuesFromApi.length) {
        validation.setIssues(issuesFromApi);
        alerts.showValidationError(issuesFromApi, "Asset issue cannot be saved");
        setTimeout(() => focusFirstInvalidField(issuesFromApi), 0);
      } else {
        alerts.showApiError(err, "Asset issue failed");
      }
      setError(err instanceof ApiError ? err.message : "Unable to issue asset.");
    }
  }
  return <Dialog title="Issue asset" error={error} issues={validation.issues} onClose={onClose} onSave={save} saveLabel="Issue"><ValidatedSelectField field="asset_item_id" label="Asset item" value={assetItemId} issues={validation.issues} onValueChange={setAssetItemId}>{items.map((item) => <option key={item.id} value={item.id}>{item.code} / {item.name} / {categories.find((category) => category.id === item.category_id)?.name ?? item.category_name ?? "Uncategorized"}</option>)}</ValidatedSelectField><ValidatedTextField field="issued_date" label="Issued date" type="date" value={issuedAt} issues={validation.issues} onChange={setIssuedAt} /><ValidatedTextField field="expected_return_date" label="Expected return" type="date" value={expectedReturnAt} issues={validation.issues} onChange={setExpectedReturnAt} /><ValidatedTextField field="notes" label="Issue notes" value={notes} issues={validation.issues} onChange={setNotes} /></Dialog>;
}

function LifecycleModal({ row, action, onClose, onSaved }: { row: AssetAssignment; action: LifecycleAction; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [returnedDate, setReturnedDate] = useState(new Date().toISOString().slice(0, 10));
  const [condition, setCondition] = useState("GOOD");
  const [reason, setReason] = useState("");
  const [deductionAmount, setDeductionAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const validation = useFormValidation();
  async function save() {
    if (!token) return;
    const issues = [
      ...(action === "return" ? validateRequiredField(returnedDate, "returned_date", "Returned date") : []),
      ...validateRequiredField(reason, "reason", "Reason"),
      ...validateAmount({ value: deductionAmount, field: "deduction_amount", label: "Deduction amount", min: 0 })
    ];
    validation.setIssues(issues);
    if (hasErrors(issues)) {
      alerts.showValidationError(issues, "Asset action needs attention");
      setTimeout(() => focusFirstInvalidField(issues), 0);
      return;
    }
    try {
      await api.assetAssignmentAction(token, row.id, action, { reason, returned_date: returnedDate, condition_on_return: condition, deduction_amount: deductionAmount ? Number(deductionAmount) : null });
      alerts.showSuccess("Asset assignment updated", `${action.replace("-", " ")} action completed.`);
      onSaved();
    } catch (err) {
      const issuesFromApi = normalizeValidationIssues(err);
      if (issuesFromApi.length) {
        validation.setIssues(issuesFromApi);
        alerts.showValidationError(issuesFromApi, "Asset action cannot be saved");
        setTimeout(() => focusFirstInvalidField(issuesFromApi), 0);
      } else {
        alerts.showApiError(err, "Asset action failed");
      }
      setError(err instanceof ApiError ? err.message : "Unable to update assignment.");
    }
  }
  return <Dialog title={`${action.replace("-", " ")} asset`} error={error} issues={validation.issues} onClose={onClose} onSave={save}>{action === "return" ? <><ValidatedTextField field="returned_date" label="Returned date" type="date" value={returnedDate} issues={validation.issues} onChange={setReturnedDate} /><ValidatedTextField field="condition_on_return" label="Condition on return" value={condition} issues={validation.issues} onChange={setCondition} /></> : null}<ValidatedReasonField required value={reason} issues={validation.issues} onChange={setReason} /><ValidatedTextField field="deduction_amount" label="Deduction amount" type="number" value={deductionAmount} issues={validation.issues} onChange={setDeductionAmount} /></Dialog>;
}

function ReplaceModal({ row, items, onClose, onSaved }: { row: AssetAssignment; items: AssetItem[]; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [replacementAssetItemId, setReplacementAssetItemId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const validation = useFormValidation();
  async function save() {
    if (!token) return;
    const issues = [
      ...validateRequiredField(replacementAssetItemId, "replacement_asset_item_id", "Replacement item"),
      ...validateRequiredField(reason, "reason", "Reason")
    ];
    validation.setIssues(issues);
    if (hasErrors(issues)) {
      alerts.showValidationError(issues, "Replacement needs attention");
      setTimeout(() => focusFirstInvalidField(issues), 0);
      return;
    }
    try {
      await api.replaceAssetAssignment(token, row.id, { replacement_asset_item_id: replacementAssetItemId || null, reason });
      alerts.showSuccess("Asset replaced", "The replacement asset was linked.");
      onSaved();
    } catch (err) {
      const issuesFromApi = normalizeValidationIssues(err);
      if (issuesFromApi.length) {
        validation.setIssues(issuesFromApi);
        alerts.showValidationError(issuesFromApi, "Asset replacement cannot be saved");
        setTimeout(() => focusFirstInvalidField(issuesFromApi), 0);
      } else {
        alerts.showApiError(err, "Asset replacement failed");
      }
      setError(err instanceof ApiError ? err.message : "Unable to replace asset.");
    }
  }
  return <Dialog title="Replace asset" error={error} issues={validation.issues} onClose={onClose} onSave={save}><ValidatedSelectField field="replacement_asset_item_id" label="Replacement item" value={replacementAssetItemId} issues={validation.issues} onValueChange={setReplacementAssetItemId}><option value="">Select replacement item</option>{items.map((item) => <option key={item.id} value={item.id}>{item.code} / {item.name}</option>)}</ValidatedSelectField><ValidatedReasonField required value={reason} issues={validation.issues} onChange={setReason} /></Dialog>;
}

function DeductionModal({ row, onClose, onSaved }: { row: AssetAssignment; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [deductionId, setDeductionId] = useState(row.payroll_deduction_id ?? "");
  const [adjustmentId, setAdjustmentId] = useState("");
  const [amount, setAmount] = useState(String(row.deduction_amount ?? ""));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const validation = useFormValidation();
  async function save() {
    if (!token) return;
    const issues = [
      ...(!deductionId && !adjustmentId ? [{ code: "REQUIRED_FIELD", field: "payroll_deduction_id", message: "Payroll deduction or adjustment ID is required.", severity: "error" as const }] : []),
      ...validateRequiredField(amount, "deduction_amount", "Deduction amount"),
      ...validateAmount({ value: amount, field: "deduction_amount", label: "Deduction amount", min: 0 }),
      ...validateRequiredField(reason, "reason", "Reason")
    ];
    validation.setIssues(issues);
    if (hasErrors(issues)) {
      alerts.showValidationError(issues, "Deduction link needs attention");
      setTimeout(() => focusFirstInvalidField(issues), 0);
      return;
    }
    try {
      await api.linkAssetDeduction(token, row.id, { payroll_deduction_id: deductionId || null, payroll_adjustment_id: adjustmentId || null, deduction_amount: amount ? Number(amount) : null, reason });
      alerts.showSuccess("Deduction linked", "The asset recovery record was updated.");
      onSaved();
    } catch (err) {
      const issuesFromApi = normalizeValidationIssues(err);
      if (issuesFromApi.length) {
        validation.setIssues(issuesFromApi);
        alerts.showValidationError(issuesFromApi, "Deduction link cannot be saved");
        setTimeout(() => focusFirstInvalidField(issuesFromApi), 0);
      } else {
        alerts.showApiError(err, "Deduction link failed");
      }
      setError(err instanceof ApiError ? err.message : "Unable to link deduction.");
    }
  }
  return <Dialog title="Link deduction/recovery" error={error} issues={validation.issues} onClose={onClose} onSave={save}><ValidatedTextField field="payroll_deduction_id" label="Payroll deduction id" value={deductionId} issues={validation.issues} onChange={setDeductionId} /><ValidatedTextField field="payroll_adjustment_id" label="Payroll adjustment id" value={adjustmentId} issues={validation.issues} onChange={setAdjustmentId} /><ValidatedTextField field="deduction_amount" label="Deduction amount" type="number" value={amount} issues={validation.issues} onChange={setAmount} /><ValidatedReasonField required value={reason} issues={validation.issues} onChange={setReason} /></Dialog>;
}

function EventsModal({ row, onClose }: { row: AssetAssignment; onClose: () => void }) {
  const { token } = useAuth();
  const [events, setEvents] = useState<AssetAssignmentEvent[]>([]);
  useEffect(() => { if (token) void api.listAssetAssignmentEvents(token, row.id).then((result) => setEvents(result.events ?? [])); }, [token, row.id]);
  return <ReadDialog title="Assignment events" onClose={onClose}>{events.length ? <Table><TableHeader><TableRow><TableHead>Event</TableHead><TableHead>Reason</TableHead><TableHead>By</TableHead><TableHead>Created</TableHead></TableRow></TableHeader><TableBody>{events.map((event) => <TableRow key={event.id}><TableCell>{event.event_type}</TableCell><TableCell>{event.reason ?? "-"}</TableCell><TableCell>{event.event_by_name ?? "-"}</TableCell><TableCell>{event.created_at}</TableCell></TableRow>)}</TableBody></Table> : <EmptyState title="No events" description="Lifecycle events will appear here." />}</ReadDialog>;
}

function AttachmentsModal({ row, onClose }: { row: AssetAssignment; onClose: () => void }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [attachments, setAttachments] = useState<Record<string, unknown>[]>([]);
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [documentId, setDocumentId] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const validation = useFormValidation();
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
    const issues = validateRequiredField(documentId, "employee_document_id", "Document");
    validation.setIssues(issues);
    if (hasErrors(issues)) {
      alerts.showValidationError(issues, "Attachment needs a document");
      setTimeout(() => focusFirstInvalidField(issues), 0);
      return;
    }
    try {
      await api.attachAssetDocument(token, row.id, { employee_document_id: documentId, description });
      setDescription("");
      await load();
      alerts.showSuccess("Document attached", "The asset attachment was linked.");
    } catch (err) {
      const issuesFromApi = normalizeValidationIssues(err);
      if (issuesFromApi.length) {
        validation.setIssues(issuesFromApi);
        alerts.showValidationError(issuesFromApi, "Attachment cannot be saved");
        setTimeout(() => focusFirstInvalidField(issuesFromApi), 0);
      } else {
        alerts.showApiError(err, "Attachment failed");
      }
      setError(err instanceof ApiError ? err.message : "Unable to attach document.");
    }
  }
  async function detach(id: string) {
    if (!token) return;
    try {
      await api.detachAssetDocument(token, row.id, id);
      await load();
      alerts.showSuccess("Document detached", "The asset attachment was removed.");
    } catch (err) {
      alerts.showApiError(err, "Attachment detach failed");
      setError(err instanceof ApiError ? err.message : "Unable to detach document.");
    }
  }
  return <ReadDialog title="Assignment attachments" onClose={onClose}>{error ? <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}<FormErrorSummary issues={validation.issues} /><div className="mb-3 grid gap-2 md:grid-cols-3"><ValidatedSelectField field="employee_document_id" label="Document" value={documentId} issues={validation.issues} onValueChange={setDocumentId}>{documents.map((document) => <option key={document.id} value={document.id}>{document.original_filename ?? document.document_number ?? document.document_type_name ?? document.id}</option>)}</ValidatedSelectField><ValidatedTextField field="description" label="Description" value={description} issues={validation.issues} onChange={setDescription} /><div className="flex items-end"><ActionTextButton intent="create" size="sm" onClick={() => void attach()}>Attach</ActionTextButton></div></div><Table><TableHeader><TableRow><TableHead>Document</TableHead><TableHead>Type</TableHead><TableHead>Description</TableHead><TableHead>Attached</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{attachments.map((attachment) => <TableRow key={String(attachment.id)}><TableCell>{Boolean(attachment.restricted) ? <span className="flex items-center gap-2">Restricted document <Badge tone="warning">Restricted</Badge></span> : Boolean(attachment.unavailable) ? "Unavailable document" : String(attachment.original_filename ?? attachment.document_number ?? "-")}</TableCell><TableCell>{Boolean(attachment.restricted) ? "Restricted document" : String(attachment.document_type_name ?? "-")}</TableCell><TableCell>{String(attachment.description ?? "-")}</TableCell><TableCell>{String(attachment.attached_at ?? "-")}</TableCell><TableCell className="text-right"><RowActionButton intent="delete" size="sm" title="Detach" onClick={() => void detach(String(attachment.id))}>Detach</RowActionButton></TableCell></TableRow>)}</TableBody></Table></ReadDialog>;
}

function SimpleHistory({ rows }: { rows: AssetAssignmentEvent[] }) {
  return <Panel className="p-0"><div className="border-b px-3 py-2 text-sm font-semibold">Assignment history/events</div>{rows.length ? <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Event</TableHead><TableHead>Reason</TableHead><TableHead>Created</TableHead></TableRow></TableHeader><TableBody>{rows.map((row) => <TableRow key={row.id}><TableCell>{row.event_type}</TableCell><TableCell>{row.reason ?? "-"}</TableCell><TableCell>{row.created_at}</TableCell></TableRow>)}</TableBody></Table></div> : <EmptyState title="No asset history" description="Issue, return, damage, lost, and attachment events appear here." />}</Panel>;
}

function Metric({ label, value, tone }: { label: string; value: number; tone: "neutral" | "success" | "warning" | "danger" | "info" }) {
  return <div className="rounded-md border px-3 py-2"><p className="text-xs text-muted-foreground">{label}</p><div className="mt-1 flex items-center justify-between"><span className="text-lg font-semibold">{value}</span><Badge tone={tone}>{label}</Badge></div></div>;
}

function Dialog({ title, error, issues, children, saveLabel = "Save", onClose, onSave }: { title: string; error: string | null; issues?: ValidationIssue[]; children: ReactNode; saveLabel?: string; onClose: () => void; onSave: () => void | Promise<void> }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4"><div className="w-full max-w-2xl rounded-lg border bg-white shadow-xl"><div className="flex justify-between border-b px-4 py-3"><h2 className="text-sm font-semibold">{title}</h2><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></div><div className="px-4 pt-4"><FormErrorSummary issues={issues} /></div><div className="grid gap-3 p-4 md:grid-cols-2">{children}</div>{error ? <div className="mx-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}<div className="flex justify-end gap-2 border-t px-4 py-3"><Button variant="outline" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={() => void onSave()}>{saveLabel}</Button></div></div></div>;
}

function ReadDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4"><div className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-lg border bg-white shadow-xl"><div className="flex justify-between border-b px-4 py-3"><h2 className="text-sm font-semibold">{title}</h2><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></div><div className="overflow-auto p-4">{children}</div></div></div>;
}
