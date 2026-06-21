import { FilePlus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ApiError, api } from "../../lib/api";
import type { EmployeeDocument } from "../../types/documents";
import type { LeaveApproval, LeaveDocument, LeaveRequest } from "../../types/leave";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { Label } from "../ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { LeaveTimeline } from "./LeaveTimeline";

export function LeaveRequestDetailModal({
  token,
  request,
  permissions,
  onClose,
  onChanged
}: {
  token: string;
  request: LeaveRequest;
  permissions: Set<string>;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [timeline, setTimeline] = useState<LeaveApproval[]>([]);
  const [attached, setAttached] = useState<LeaveDocument[]>([]);
  const [employeeDocs, setEmployeeDocs] = useState<EmployeeDocument[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const canAttach = permissions.has("leave.request") || permissions.has("leave.manage");
  const activeDocs = useMemo(() => employeeDocs.filter((doc) => doc.status === "ACTIVE"), [employeeDocs]);

  async function load() {
    setError(null);
    try {
      const [timelineResult, attachedResult, employeeDocResult] = await Promise.all([
        api.getLeaveRequestTimeline(token, request.id),
        api.listLeaveRequestDocuments(token, request.id),
        api.listEmployeeDocuments(token, request.employee_id)
      ]);
      setTimeline(timelineResult.timeline);
      setAttached(attachedResult.documents);
      setEmployeeDocs(employeeDocResult.documents);
      setSelectedDocumentId((current) => current || employeeDocResult.documents.find((doc) => doc.status === "ACTIVE")?.id || "");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load leave request details.");
    }
  }

  useEffect(() => {
    void load();
  }, [request.id]);

  async function attach() {
    if (!selectedDocumentId) return;
    try {
      await api.attachLeaveDocument(token, request.id, selectedDocumentId);
      await load();
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to attach supporting document.");
    }
  }

  async function detach(documentId: string) {
    try {
      await api.detachLeaveDocument(token, request.id, documentId);
      await load();
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to detach supporting document.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4">
      <div className="w-full max-w-5xl rounded-lg border bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Leave request - {request.employee_name ?? request.employee_no}</h2>
            <p className="text-xs text-muted-foreground">{request.leave_type_name} - {request.start_date} to {request.end_date}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
        <div className="max-h-[75vh] space-y-4 overflow-y-auto p-4">
          {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
          {request.document_required && request.document_status !== "PROVIDED" ? <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Supporting document is required before submission.</div> : null}
          <div className="grid gap-3 md:grid-cols-4">
            <Metric label="Status" value={request.status} />
            <Metric label="Document" value={request.document_status} />
            <Metric label="Days" value={String(request.requested_days)} />
            <Metric label="Deduction" value={request.salary_deduction_mode ?? "NONE"} />
          </div>
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Supporting documents</h3>
            {canAttach ? <div className="flex flex-col gap-2 rounded-md border p-3 md:flex-row md:items-end">
              <div className="w-full space-y-1.5">
                <Label>Attach existing employee document</Label>
                <select className="h-9 w-full rounded-md border bg-white px-3 text-sm" value={selectedDocumentId} onChange={(event) => setSelectedDocumentId(event.target.value)}>
                  <option value="">Select document</option>
                  {activeDocs.map((doc) => <option key={doc.id} value={doc.id}>{doc.document_type_name ?? doc.document_type_code} {doc.document_number ? `- ${doc.document_number}` : ""}{doc.is_sensitive ? " (Sensitive)" : ""}</option>)}
                </select>
              </div>
              <Button size="sm" disabled={!selectedDocumentId} onClick={() => void attach()}><FilePlus className="h-4 w-4" /> Attach</Button>
            </div> : null}
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader><TableRow><TableHead>Document</TableHead><TableHead>Number</TableHead><TableHead>Status</TableHead><TableHead>Expiry</TableHead><TableHead>Attached</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                <TableBody>{attached.map((doc) => <TableRow key={doc.id}><TableCell className="font-medium">{doc.document_type_name ?? doc.document_type_code ?? "Document"}{doc.is_sensitive ? <Badge className="ml-2" tone="warning">Sensitive</Badge> : null}</TableCell><TableCell>{doc.document_number ?? "-"}</TableCell><TableCell>{doc.employee_document_status}</TableCell><TableCell>{doc.expiry_date ?? "-"}</TableCell><TableCell>{new Date(doc.attached_at).toLocaleDateString()}</TableCell><TableCell><div className="flex justify-end">{canAttach ? <Button variant="ghost" size="icon" onClick={() => void detach(doc.employee_document_id)}><Trash2 className="h-4 w-4 text-red-600" /></Button> : null}</div></TableCell></TableRow>)}</TableBody>
              </Table>
              {attached.length === 0 ? <EmptyState title="No supporting documents" description="Attach an active employee document from Document Tracking." /> : null}
            </div>
          </section>
          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Approval timeline</h3>
            <LeaveTimeline rows={timeline} />
          </section>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border px-3 py-2"><p className="text-xs text-muted-foreground">{label}</p><p className="text-sm font-semibold">{value}</p></div>;
}
