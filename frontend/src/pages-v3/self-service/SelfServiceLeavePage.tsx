import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { PageShell } from "../../components/ui/page-shell";
import { Panel } from "../../components/ui/panel";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { ProgressRing } from "../../components/ui/progress-ring";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { EmptyState } from "../../components/ui/empty-state";
import { useAuth } from "../../hooks/useAuth";
import { useAlert } from "../../components/alerts/useAlert";
import { ApiError, api } from "../../lib/api";

type Row = Record<string, unknown>;
function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}
function text(value: unknown, fallback = "—") {
  const s = value === null || value === undefined ? "" : String(value);
  return s && s !== "null" && s !== "undefined" ? s : fallback;
}
function fmtDate(value: unknown) {
  const s = text(value, "");
  if (!s) return "—";
  return new Date(`${s.slice(0, 10)}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
function dateRangeLabel(start: unknown, end: unknown) {
  const s = text(start, "");
  const e = text(end, "");
  if (!s) return "—";
  if (!e || e === s) return fmtDate(s);
  return `${fmtDate(s)} – ${fmtDate(e)}`;
}
const RING_COLORS = ["#378ADD", "#F0997B", "#5DCAA5", "#AFA9EC", "#FAC775"];

function requestStatusInfo(request: Row, approvals: Row[]) {
  const status = text(request.status);
  const steps = approvals.filter((a) => a.leave_request_id === request.id).sort((a, b) => Number(a.step_order) - Number(b.step_order));
  if (status === "PENDING_APPROVAL") {
    const pendingIndex = steps.findIndex((s) => text(s.status) === "PENDING");
    const stepLabel = steps.length ? ` · Step ${pendingIndex >= 0 ? pendingIndex + 1 : steps.length} of ${steps.length}` : "";
    return { tone: "warning" as const, label: `Pending${stepLabel}` };
  }
  if (status === "APPROVED") return { tone: "success" as const, label: "Approved" };
  if (status === "REJECTED") return { tone: "danger" as const, label: "Rejected" };
  if (status === "CANCELLED") return { tone: "neutral" as const, label: "Cancelled" };
  return { tone: "neutral" as const, label: "Draft" };
}

export function SelfServiceLeavePage() {
  const { token } = useAuth();
  const alerts = useAlert();
  const [data, setData] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [requestOpen, setRequestOpen] = useState(false);
  const [viewingRequest, setViewingRequest] = useState<Row | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setData((await api.getSelfServiceLeave(token)) as unknown as Row);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load your leave.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const cycles = asRows(data?.balance_cycles);
  const requests = asRows(data?.requests);
  const approvals = asRows(data?.approvals);
  const canRequest = Boolean(data?.leave_request_enabled);
  const leaveTypeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of cycles) map.set(String(c.leave_type_id), text(c.leave_type_name, "Leave"));
    return Array.from(map.entries());
  }, [cycles]);

  const filtered = requests.filter((r) => {
    const typeName = text(r.leave_type_name, "").toLowerCase();
    if (search.trim() && !typeName.includes(search.trim().toLowerCase()) && !text(r.reason, "").toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (typeFilter !== "ALL" && String(r.leave_type_id) !== typeFilter) return false;
    if (statusFilter !== "ALL" && text(r.status) !== statusFilter) return false;
    return true;
  });

  if (loading) {
    return <PageShell constrained={false}><div className="flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div></PageShell>;
  }
  if (error || !data) {
    return <PageShell constrained={false}><Panel className="p-4"><EmptyState title="Unable to load leave" description={error ?? undefined} /></Panel></PageShell>;
  }

  return (
    <PageShell constrained={false}>
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <p className="text-lg font-medium text-slate-950">My leave</p>
          {canRequest ? <Button size="sm" onClick={() => setRequestOpen(true)}><Plus className="h-3.5 w-3.5" /> Request leave</Button> : null}
        </div>

        {cycles.length ? (
          <Panel className="p-4">
            <div className="flex flex-wrap justify-center gap-6 sm:justify-start">
              {cycles.map((cycle, index) => {
                const taken = Number(cycle.used_days ?? 0);
                const max = Math.round(Number(cycle.opening_balance ?? 0) + Number(cycle.accrued_days ?? 0)) || taken || 1;
                return <ProgressRing key={String(cycle.id ?? index)} value={taken} max={max} color={RING_COLORS[index % RING_COLORS.length]} label={text(cycle.leave_type_name)} />;
              })}
            </div>
          </Panel>
        ) : null}

        <Panel className="flex flex-wrap items-center gap-2.5 p-3">
          <input
            className="h-8 min-w-[160px] flex-1 rounded-md border border-input bg-[#F7F7FB] px-3 text-xs outline-none placeholder:text-muted-foreground"
            placeholder="Search requests"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="h-8 rounded-md border border-input bg-[#F7F7FB] px-2 text-xs text-muted-foreground outline-none" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="ALL">Leave type</option>
            {leaveTypeOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select className="h-8 rounded-md border border-input bg-[#F7F7FB] px-2 text-xs text-muted-foreground outline-none" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="ALL">Status</option>
            <option value="PENDING_APPROVAL">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </Panel>

        {filtered.length ? (
          <div className="flex flex-col gap-2">
            {filtered.map((r, i) => {
              const { tone, label } = requestStatusInfo(r, approvals);
              const cancellable = ["DRAFT", "PENDING_APPROVAL"].includes(text(r.status));
              return (
                <Panel key={String(r.id ?? i)} className="flex items-center gap-3 p-3">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#E6F1FB]">
                    <span className="text-xs font-medium text-[#0C447C]">{text(r.leave_type_name, "L")[0]}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-slate-950">{text(r.leave_type_name)} · {dateRangeLabel(r.start_date, r.end_date)} ({Number(r.requested_days ?? r.total_days ?? 0)} day{Number(r.requested_days ?? r.total_days ?? 0) === 1 ? "" : "s"})</p>
                    <p className="mt-0.5 truncate text-[9px] text-muted-foreground">Submitted {fmtDate(r.submitted_at ?? r.created_at)}{r.reason ? ` · "${text(r.reason)}"` : ""}</p>
                  </div>
                  <Badge tone={tone}>{label}</Badge>
                  {cancellable ? (
                    <Button size="sm" variant="outline" className="border-[#F09595] text-[#A32D2D] hover:bg-[#FCEBEB]" onClick={() => setViewingRequest(r)}>Cancel</Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setViewingRequest(r)}>{text(r.status) === "REJECTED" ? "View reason" : "View"}</Button>
                  )}
                </Panel>
              );
            })}
          </div>
        ) : (
          <Panel className="p-4"><EmptyState title="No leave requests found" description={requests.length ? "Try adjusting your search or filters." : "You haven't submitted any leave requests yet."} /></Panel>
        )}
      </div>

      {requestOpen ? <RequestLeaveDialog leaveTypes={leaveTypeOptions} onClose={() => setRequestOpen(false)} onSaved={async () => { setRequestOpen(false); await load(); }} /> : null}
      {viewingRequest ? (
        <RequestDetailDialog
          request={viewingRequest}
          approvals={approvals.filter((a) => a.leave_request_id === viewingRequest.id)}
          onClose={() => setViewingRequest(null)}
          onCancelled={async () => { setViewingRequest(null); await load(); }}
        />
      ) : null}
    </PageShell>
  );
}

function RequestLeaveDialog({ leaveTypes, onClose, onSaved }: { leaveTypes: [string, string][]; onClose: () => void; onSaved: () => Promise<void> }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [halfDayType, setHalfDayType] = useState("NONE");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!token || !leaveTypeId || !startDate || !endDate) return;
    setSaving(true);
    setError(null);
    try {
      const result = await api.createSelfServiceLeaveRequest(token, { leave_type_id: leaveTypeId, start_date: startDate, end_date: endDate, half_day_type: halfDayType, reason: reason.trim() || null });
      alerts.showSuccess("Leave request submitted", result.document_required ? "Saved as draft — a supporting document is required before it can be submitted for approval." : "Your leave request is now pending approval.");
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to submit leave request.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Request leave</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Leave type *</Label>
              <select className="h-9 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/20" value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)}>
                <option value="">Select leave type</option>
                {leaveTypes.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Start date *</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>End date *</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Day type</Label>
              <select className="h-9 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/20" value={halfDayType} onChange={(e) => setHalfDayType(e.target.value)}>
                <option value="NONE">Full day</option>
                <option value="FIRST_HALF">First half</option>
                <option value="SECOND_HALF">Second half</option>
              </select>
            </div>
            <div className="space-y-1.5"><Label>Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you requesting this leave?" /></div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} disabled={!leaveTypeId || !startDate || !endDate} onClick={() => void submit()}>Submit request</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequestDetailDialog({ request, approvals, onClose, onCancelled }: { request: Row; approvals: Row[]; onClose: () => void; onCancelled: () => Promise<void> }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { tone, label } = requestStatusInfo(request, approvals);
  const cancellable = ["DRAFT", "PENDING_APPROVAL"].includes(text(request.status));
  const steps = [...approvals].sort((a, b) => Number(a.step_order) - Number(b.step_order));

  async function cancel() {
    if (!token) return;
    setCancelling(true);
    setError(null);
    try {
      await api.cancelSelfServiceLeaveRequest(token, String(request.id));
      alerts.showSuccess("Leave request cancelled", "");
      await onCancelled();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to cancel this request.");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>Leave request details</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-950">{text(request.leave_type_name)}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{dateRangeLabel(request.start_date, request.end_date)} · {Number(request.requested_days ?? request.total_days ?? 0)} day(s)</p>
            </div>
            <Badge tone={tone}>{label}</Badge>
          </div>

          {request.reason ? (
            <div className="mb-4 rounded-md bg-[#F7F7FB] p-3">
              <p className="text-[9px] text-muted-foreground">Reason</p>
              <p className="mt-1 text-xs text-slate-950">"{text(request.reason)}"</p>
              <p className="mt-2 text-[8px] text-muted-foreground">Submitted {fmtDate(request.submitted_at ?? request.created_at)}</p>
            </div>
          ) : null}

          {steps.length ? (
            <>
              <p className="mb-3 text-xs font-medium text-slate-950">Approval progress</p>
              <div className="relative space-y-4 pl-8">
                <div className="absolute bottom-3 left-3.5 top-3 w-px bg-[#E7E7F1]" />
                {steps.map((step, i) => {
                  const stepStatus = text(step.status);
                  const dotColor = stepStatus === "APPROVED" ? "#5DCAA5" : stepStatus === "REJECTED" ? "#F09595" : stepStatus === "SKIPPED" ? "#D3D3E3" : "#FAC775";
                  return (
                    <div key={String(step.id ?? i)} className="relative">
                      <div className="absolute -left-8 top-0 grid h-7 w-7 place-items-center rounded-full" style={{ background: dotColor }}>
                        <span className="text-[10px] font-medium text-white">{stepStatus === "PENDING" ? i + 1 : "✓"}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium text-slate-950">Step {Number(step.step_order)} · {text(step.step_name)}</p>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">{text(step.approver_name, "Unassigned")}</p>
                        </div>
                        <Badge tone={stepStatus === "APPROVED" ? "success" : stepStatus === "REJECTED" ? "danger" : stepStatus === "SKIPPED" ? "neutral" : "warning"}>
                          {stepStatus === "PENDING" ? "Awaiting review" : stepStatus === "APPROVED" ? "Approved" : stepStatus === "REJECTED" ? "Rejected" : "Skipped"}
                        </Badge>
                      </div>
                      {step.note ? (
                        <div className="mt-2 rounded-md bg-[#F7F7FB] p-2.5">
                          <p className="text-[10px] text-slate-950">"{text(step.note)}"</p>
                          <p className="mt-1 text-[8px] text-muted-foreground">{fmtDate(step.action_at)}{step.action_by_name ? ` · ${text(step.action_by_name)}` : ""}</p>
                        </div>
                      ) : stepStatus === "PENDING" ? (
                        <p className="mt-2 text-[9px] text-muted-foreground">Updates automatically once reviewed.</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          {cancellable ? <Button size="sm" loading={cancelling} className="bg-[#A32D2D] hover:bg-[#8a2525]" onClick={() => void cancel()}>Cancel request</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
