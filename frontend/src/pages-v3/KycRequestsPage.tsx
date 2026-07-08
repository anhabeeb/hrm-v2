import { useEffect, useState } from "react";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";
import { humanizeTechnicalLabel } from "../lib/displayLabels";

type Row = Record<string, unknown>;

function text(value: unknown, fallback = "-") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function requestedSummary(value: unknown) {
  if (!value) return "-";
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (parsed && typeof parsed === "object" && "value" in parsed) return String((parsed as { value?: unknown }).value ?? "-");
    return JSON.stringify(parsed);
  } catch {
    return String(value);
  }
}

function statusTone(status: string) {
  if (status === "APPROVED") return { bg: "#EAF3DE", text: "#27500A" };
  if (status === "REJECTED" || status === "CANCELLED") return { bg: "#FCEBEB", text: "#A32D2D" };
  return { bg: "#FAEEDA", text: "#854F0B" };
}

export function KycRequestsPage() {
  const { token } = useAuth();
  const alerts = useAlert();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewAction, setReviewAction] = useState<{ type: "approve" | "reject"; row: Row } | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    const result = await api.listKycRequests(token, {}).catch(() => ({ requests: [] }));
    setRows(result.requests);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [token]);

  async function submitReview(note: string) {
    if (!token || !reviewAction) return;
    try {
      if (reviewAction.type === "approve") {
        await api.approveKycRequest(token, String(reviewAction.row.id), note);
        alerts.showSuccess("KYC request approved", "Employee profile update request was approved.");
      } else {
        if (!note.trim()) {
          alerts.showValidationError("Review note is required when rejecting a KYC request.", "Review note required");
          return;
        }
        await api.rejectKycRequest(token, String(reviewAction.row.id), note.trim());
        alerts.showSuccess("KYC request rejected", "Employee profile update request was rejected.");
      }
      setReviewAction(null);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to review KYC request.");
    }
  }

  return (
    <PageShell constrained={false}>
      <div>
        <p className="text-lg font-medium text-slate-950">KYC update requests</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Review employee-submitted profile update requests</p>
      </div>

      {loading ? (
        <div className="mt-3 flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Panel key={i} className="h-20 animate-pulse" />)}</div>
      ) : rows.length ? (
        <div className="mt-3 flex flex-col gap-2">
          {rows.map((row) => {
            const actionable = String(row.status) === "SUBMITTED" || String(row.status) === "REVIEWED";
            return (
              <Panel key={String(row.id)} className="flex items-center gap-3.5 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-950">{text(row.employee_name)} <span className="font-normal text-muted-foreground">{text(row.employee_no)}</span></p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{text(row.section)} / {text(row.field_key)} · New value: {requestedSummary(row.requested_value_json)}{row.reason ? ` · Reason: ${text(row.reason)}` : ""}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">Requested by {text(row.requested_by_name)} · Created {text(row.created_at)}{row.reviewed_at ? ` · Reviewed ${text(row.reviewed_at)}` : ""}{row.review_note ? ` · Note: ${text(row.review_note)}` : ""}</p>
                </div>
                <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: statusTone(String(row.status)).bg, color: statusTone(String(row.status)).text }}>{humanizeTechnicalLabel(String(row.status))}</span>
                {actionable ? (
                  <div className="flex shrink-0 gap-1.5">
                    <Button size="sm" variant="actionSave" onClick={() => setReviewAction({ type: "approve", row })}>Approve</Button>
                    <Button size="sm" variant="danger" onClick={() => setReviewAction({ type: "reject", row })}>Reject</Button>
                  </div>
                ) : null}
              </Panel>
            );
          })}
        </div>
      ) : (
        <Panel className="mt-3"><EmptyState title="No KYC requests" description="Employee-submitted profile update requests will appear here." /></Panel>
      )}

      {reviewAction ? (
        <Dialog open onOpenChange={(v) => !v && setReviewAction(null)}>
          <DialogContent size="sm">
            <DialogHeader><DialogTitle>{reviewAction.type === "reject" ? "Reject profile update" : "Approve profile update"}</DialogTitle></DialogHeader>
            <DialogBody><ReviewForm type={reviewAction.type} onSubmit={(note) => void submitReview(note)} /></DialogBody>
          </DialogContent>
        </Dialog>
      ) : null}
    </PageShell>
  );
}

function ReviewForm({ type, onSubmit }: { type: "approve" | "reject"; onSubmit: (note: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <>
      <div className="space-y-1.5"><Label>{type === "reject" ? "Rejection note (required)" : "Approval note (optional)"}</Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>
      <DialogFooter className="mt-4 px-0 pb-0">
        <Button size="sm" variant={type === "reject" ? "danger" : "primary"} onClick={() => onSubmit(note)}>{type === "reject" ? "Reject" : "Approve"}</Button>
      </DialogFooter>
    </>
  );
}
