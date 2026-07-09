import { useEffect, useState } from "react";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavSwitcher } from "../components/ui/route-nav-switcher";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";
import { humanizeTechnicalLabel } from "../lib/displayLabels";
import { APPROVALS_NAV_ITEMS } from "./approvalsNav";
import type { ApprovalAction, ApprovalInstance, ApprovalInstanceStep, ApprovalStepAssignee } from "../types/approvals";

type Mode = "inbox" | "submitted" | "overdue" | "escalated" | "delegated" | "history";

const TITLES: Record<Mode, { title: string; description: string }> = {
  inbox: { title: "My pending", description: "Approval requests waiting on your decision" },
  submitted: { title: "Submitted", description: "Requests you've submitted for approval" },
  overdue: { title: "Overdue", description: "Requests past their step's due date" },
  escalated: { title: "Escalated", description: "Requests escalated after missing their deadline" },
  delegated: { title: "Delegated", description: "Requests delegated to you by another approver" },
  history: { title: "History", description: "Completed approval requests" }
};

function statusTone(status: string) {
  if (["APPROVED", "COMPLETED", "ACTIVE"].includes(status)) return { bg: "#EAF3DE", text: "#27500A" };
  if (["REJECTED", "CANCELLED", "EXPIRED", "ARCHIVED"].includes(status)) return { bg: "#FCEBEB", text: "#A32D2D" };
  return { bg: "#FAEEDA", text: "#854F0B" };
}

export function ApprovalInboxPage({ mode }: { mode: Mode }) {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const [rows, setRows] = useState<ApprovalInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{ instance: ApprovalInstance; steps: ApprovalInstanceStep[]; assignees: ApprovalStepAssignee[]; timeline: ApprovalAction[] } | null>(null);
  const [decision, setDecision] = useState<{ action: "approve" | "reject" | "send-back" | "cancel"; title: string; required?: boolean } | null>(null);

  const permissions = new Set(user?.permissions ?? []);
  const can = (keys: string[]) => keys.some((k) => permissions.has(k));

  async function load() {
    setLoading(true);
    if (!token) return;
    try {
      const apiMode = mode === "delegated" ? "delegated-to-me" : mode;
      const result = await api.listApprovalInbox(token, apiMode as Parameters<typeof api.listApprovalInbox>[1]);
      setRows(result.approvals);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token, mode]);

  async function open(row: ApprovalInstance) {
    if (!token) return;
    setSelected(await api.getApprovalInstance(token, row.id));
  }

  async function submitDecision(reason: string) {
    if (!token || !selected || !decision) return;
    if (decision.required && !reason.trim()) {
      alerts.showValidationError("A reason is required before submitting this decision.", "Reason required");
      return;
    }
    try {
      await api.approvalInstanceAction(token, selected.instance.id, decision.action, { reason, note: reason });
      alerts.showSuccess("Approval updated", `The ${decision.action.replace("-", " ")} decision was submitted.`);
      setDecision(null);
      setSelected(null);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to submit approval decision.");
    }
  }

  const { title, description } = TITLES[mode];

  return (
    <PageShell constrained={false}>
      <div className="flex flex-col gap-3">
        <div className="min-w-0 flex-1 space-y-3">
            <div className="px-4">
                <RouteNavSwitcher items={APPROVALS_NAV_ITEMS} moduleLabel="Approvals" />
                <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            </div>

              <Panel className="shadow-none space-y-3 p-4">
          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : rows.length ? (
            <div className="flex flex-col gap-2">
              {rows.map((row) => (
                <Panel key={row.id} className="flex items-center gap-3.5 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-950">{row.request_title}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {row.workflow_name_snapshot ?? "Module fallback"} · {row.module_key} / {row.action_key} · Step {row.current_step_number ?? "-"} · Submitted {row.submitted_at}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: statusTone(row.status).bg, color: statusTone(row.status).text }}>{humanizeTechnicalLabel(row.status)}</span>
                  <Button size="sm" variant="outline" onClick={() => void open(row)}>View</Button>
                </Panel>
              ))}
            </div>
          ) : (
            <Panel><EmptyState title="No approvals" description="Approval requests will appear here." /></Panel>
          )}

              </Panel>
        </div>
      </div>

      {selected ? (
        <Dialog open onOpenChange={(v) => !v && setSelected(null)}>
          <DialogContent size="lg">
            <DialogHeader><DialogTitle>{selected.instance.request_title}</DialogTitle></DialogHeader>
            <DialogBody>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Info label="Status" value={humanizeTechnicalLabel(selected.instance.status)} />
                <Info label="Workflow" value={selected.instance.workflow_name_snapshot ?? "Module fallback"} />
                <Info label="Entity" value={`${selected.instance.entity_type} ${selected.instance.entity_id}`} />
                <Info label="Submitted" value={selected.instance.submitted_at} />
              </div>
              <p className="mb-2 text-xs font-medium text-slate-950">Steps</p>
              <div className="mb-4 flex flex-col gap-1.5">
                {selected.steps.map((step) => (
                  <div key={step.id} className="flex items-center gap-2.5 rounded-md bg-[#F7F7FB] px-3 py-2 text-xs">
                    <span className="shrink-0 text-muted-foreground">#{step.step_number}</span>
                    <span className="flex-1">{step.step_name}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{step.step_mode} / {step.approval_mode}</span>
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium" style={{ background: statusTone(step.status).bg, color: statusTone(step.status).text }}>{humanizeTechnicalLabel(step.status)}</span>
                  </div>
                ))}
              </div>
              <p className="mb-2 text-xs font-medium text-slate-950">Assignees</p>
              <div className="mb-4 grid grid-cols-2 gap-2">
                {selected.assignees.map((a) => (
                  <div key={a.id} className="rounded-md bg-[#F7F7FB] p-2.5 text-xs">
                    <p className="font-medium text-slate-950">{a.assigned_user_name_snapshot}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{a.assignment_type}{a.assigned_role_snapshot ? ` · ${a.assigned_role_snapshot}` : ""}</p>
                  </div>
                ))}
              </div>
              <p className="mb-2 text-xs font-medium text-slate-950">Timeline</p>
              <div className="flex flex-col gap-1.5">
                {selected.timeline.map((item) => (
                  <div key={item.id} className="rounded-md bg-[#F7F7FB] p-2.5 text-xs">
                    <p className="font-medium text-slate-950">{humanizeTechnicalLabel(item.action)} <span className="font-normal text-muted-foreground">by {item.actor_name_snapshot ?? "System"}</span></p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{item.created_at}</p>
                    {item.reason ? <p className="mt-1 text-[10px] text-slate-950">{item.reason}</p> : null}
                  </div>
                ))}
              </div>
            </DialogBody>
            <DialogFooter>
              {can(["approvals.instances.approve", "approvals.manage"]) ? <Button size="sm" variant="actionSave" onClick={() => setDecision({ action: "approve", title: "Approve approval" })}>Approve</Button> : null}
              {can(["approvals.instances.send_back", "approvals.manage"]) ? <Button size="sm" variant="outline" onClick={() => setDecision({ action: "send-back", title: "Send back", required: true })}>Send back</Button> : null}
              {can(["approvals.instances.reject", "approvals.manage"]) ? <Button size="sm" variant="danger" onClick={() => setDecision({ action: "reject", title: "Reject approval", required: true })}>Reject</Button> : null}
              {can(["approvals.instances.cancel", "approvals.manage"]) ? <Button size="sm" variant="danger" onClick={() => setDecision({ action: "cancel", title: "Cancel approval", required: true })}>Cancel</Button> : null}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {decision ? (
        <Dialog open onOpenChange={(v) => !v && setDecision(null)}>
          <DialogContent size="sm">
            <DialogHeader><DialogTitle>{decision.title}</DialogTitle></DialogHeader>
            <DialogBody><ReasonForm required={decision.required} onSubmit={(reason) => void submitDecision(reason)} /></DialogBody>
          </DialogContent>
        </Dialog>
      ) : null}
    </PageShell>
  );
}

function ReasonForm({ required, onSubmit }: { required?: boolean; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <>
      <div className="space-y-1.5"><Label>{required ? "Reason (required)" : "Reason / note (optional)"}</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      <DialogFooter className="mt-4 px-0 pb-0"><Button size="sm" onClick={() => onSubmit(reason)}>Submit</Button></DialogFooter>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md bg-[#F7F7FB] p-2.5"><p className="text-[9px] text-muted-foreground">{label}</p><p className="mt-0.5 text-xs font-medium text-slate-950">{value}</p></div>;
}
