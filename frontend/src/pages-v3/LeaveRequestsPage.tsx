import { useEffect, useMemo, useState } from "react";
import { MoreVertical } from "lucide-react";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavRail } from "../components/ui/route-nav-rail";
import { Button } from "../components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { EmptyState } from "../components/ui/empty-state";
import { ExportMenu } from "../components/export/ExportMenu";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { ApiError, api } from "../lib/api";
import { humanizeTechnicalLabel } from "../lib/displayLabels";
import { LEAVE_NAV_ITEMS } from "./leaveNav";
import type { LeaveApproval, LeaveDashboard, LeaveRequest, LeaveType } from "../types/leave";
import type { OrganizationDepartment, OrganizationLocation } from "../types/organization";

const AVATAR_COLOR_PALETTE = [
  { bg: "#E6F1FB", text: "#0C447C" },
  { bg: "#FBEAF0", text: "#72243E" },
  { bg: "#FAEEDA", text: "#854F0B" },
  { bg: "#EAF3DE", text: "#27500A" },
  { bg: "#EEEDFE", text: "#534AB7" },
  { bg: "#FCEBEB", text: "#A32D2D" }
];

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`.toUpperCase();
}

function colorFor(name: string) {
  const hash = name.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_COLOR_PALETTE[hash % AVATAR_COLOR_PALETTE.length];
}

function statusTone(status: string) {
  if (status === "APPROVED") return { bg: "#EAF3DE", text: "#27500A" };
  if (status === "PENDING_APPROVAL" || status === "SUBMITTED" || status === "DRAFT") return { bg: "#FAEEDA", text: "#854F0B" };
  if (status === "CANCELLED") return { bg: "#F7F7FB", text: "#6B6F86" };
  return { bg: "#FCEBEB", text: "#A32D2D" };
}

function formatDateRange(request: LeaveRequest) {
  const start = new Date(`${request.start_date}T00:00:00Z`);
  const end = new Date(`${request.end_date}T00:00:00Z`);
  const startLabel = start.toLocaleDateString(undefined, { month: "short", day: "numeric", year: request.start_date.slice(0, 4) !== String(new Date().getFullYear()) ? "numeric" : undefined, timeZone: "UTC" });
  if (request.start_date === request.end_date) {
    return `${startLabel}, ${start.getUTCFullYear()}`;
  }
  const endLabel = end.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  return `${startLabel} – ${endLabel}, ${end.getUTCFullYear()}`;
}

function currentYear() {
  return new Date().getFullYear();
}

export function LeaveRequestsPage({ approvalsOnly = false }: { approvalsOnly?: boolean }) {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const permissions = new Set(user?.permissions ?? []);
  const canApprove = permissions.has("leave.approve");
  const canCancel = permissions.has("leave.cancel") || permissions.has("leave.manage");

  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [dashboard, setDashboard] = useState<LeaveDashboard | null>(null);
  const [daysTakenYtd, setDaysTakenYtd] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [leaveTypeId, setLeaveTypeId] = useState("all");
  const [departmentId, setDepartmentId] = useState("all");
  const [locationId, setLocationId] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);

  const [detailRequest, setDetailRequest] = useState<LeaveRequest | null>(null);
  const [rejectTarget, setRejectTarget] = useState<LeaveRequest | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const year = currentYear();
      const [requestResult, typeResult, deptResult, locResult, dashboardResult, ytdResult] = await Promise.all([
        api.listLeaveRequests(token, approvalsOnly ? { pending_my_approval: true } : {}),
        api.listLeaveTypes(token),
        api.listDepartments(token),
        api.listLocations(token),
        api.getLeaveDashboard(token),
        api.listLeaveRequests(token, { status: "APPROVED", start_date_from: `${year}-01-01`, start_date_to: `${year}-12-31` })
      ]);
      setRequests(requestResult.requests);
      setTypes(typeResult.leave_types);
      setDepartments(deptResult.departments);
      setLocations(locResult.locations);
      setDashboard(dashboardResult);
      setDaysTakenYtd(ytdResult.requests.reduce((sum, r) => sum + (r.requested_days ?? r.total_days ?? 0), 0));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load leave requests.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const filtered = useMemo(() => {
    return requests
      .filter((r) => !search.trim() || (r.employee_name ?? "").toLowerCase().includes(search.trim().toLowerCase()))
      .filter((r) => status === "all" || r.status === status)
      .filter((r) => leaveTypeId === "all" || r.leave_type_id === leaveTypeId)
      .filter((r) => departmentId === "all" || r.department_name === departments.find((d) => d.id === departmentId)?.name)
      .filter((r) => locationId === "all" || r.location_name === locations.find((l) => l.id === locationId)?.name)
      .filter((r) => !dateFrom || r.start_date >= dateFrom)
      .filter((r) => !dateTo || r.start_date <= dateTo)
      .sort((a, b) => (b.submitted_at ?? b.created_at).localeCompare(a.submitted_at ?? a.created_at));
  }, [requests, search, status, leaveTypeId, departmentId, locationId, dateFrom, dateTo, departments, locations]);

  function resetFilters() {
    setSearch("");
    setStatus("all");
    setLeaveTypeId("all");
    setDepartmentId("all");
    setLocationId("all");
    setDateFrom("");
    setDateTo("");
  }

  async function approve(request: LeaveRequest) {
    if (!token) return;
    setBusyId(request.id);
    try {
      await api.approveLeaveRequest(token, request.id, null);
      alerts.showSuccess("Leave request approved", `${request.employee_name}'s request was approved.`);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to approve leave request");
    } finally {
      setBusyId(null);
    }
  }

  async function reject() {
    if (!token || !rejectTarget) return;
    if (!rejectNote.trim()) {
      alerts.showValidationError("A note is required to reject a leave request.", "Leave action needs a note");
      return;
    }
    setBusyId(rejectTarget.id);
    try {
      await api.rejectLeaveRequest(token, rejectTarget.id, rejectNote.trim());
      alerts.showSuccess("Leave request rejected", `${rejectTarget.employee_name}'s request was rejected.`);
      setRejectTarget(null);
      setRejectNote("");
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to reject leave request");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={LEAVE_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-slate-950">{approvalsOnly ? "Pending leave approvals" : "Leave requests"}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{approvalsOnly ? "Requests waiting on your approval step" : "Review, approve, or track leave across the team"}</p>
            </div>
            <ExportMenu
              variant="plain"
              moduleName={approvalsOnly ? "Pending leave approvals" : "Leave requests"}
              rows={filtered as unknown as Record<string, unknown>[]}
              columns={["employee_no", "employee_name", "department_name", "leave_type_name", "start_date", "end_date", "requested_days", "status", "current_approval_step", "submitted_at"]}
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Panel className="p-3"><p className="text-[10px] text-muted-foreground">Pending</p><p className="mt-1 text-lg font-medium text-[#854F0B]">{dashboard?.pending_approvals ?? "—"}</p></Panel>
            <Panel className="p-3"><p className="text-[10px] text-muted-foreground">Approved this month</p><p className="mt-1 text-lg font-medium text-slate-950">{dashboard?.approved_this_month ?? "—"}</p></Panel>
            <Panel className="p-3"><p className="text-[10px] text-muted-foreground">On leave today</p><p className="mt-1 text-lg font-medium text-slate-950">{dashboard?.employees_currently_on_leave ?? "—"}</p></Panel>
            <Panel className="p-3"><p className="text-[10px] text-muted-foreground">Days taken YTD</p><p className="mt-1 text-lg font-medium text-slate-950">{daysTakenYtd}</p></Panel>
          </div>

          <Panel className="flex flex-col gap-2.5 p-3">
            <div className="flex flex-wrap items-center gap-3.5">
              <div className="min-w-[160px] flex-1 rounded-md bg-[#F7F7FB] px-3 py-1.5 text-xs text-muted-foreground">
                <input className="w-full bg-transparent outline-none placeholder:text-muted-foreground" placeholder="Search employee" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <select className="bg-transparent text-xs text-muted-foreground outline-none" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="all">All statuses</option>
                {["SUBMITTED", "PENDING_APPROVAL", "APPROVED", "REJECTED", "CANCELLED"].map((s) => <option key={s} value={s}>{humanizeTechnicalLabel(s)}</option>)}
              </select>
              <select className="bg-transparent text-xs text-muted-foreground outline-none" value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)}>
                <option value="all">All leave types</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select className="bg-transparent text-xs text-muted-foreground outline-none" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="all">Department</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <select className="bg-transparent text-xs text-muted-foreground outline-none" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <option value="all">Outlet/location</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <button type="button" onClick={() => setMoreOpen((v) => !v)} className="ml-auto text-xs font-medium text-primary hover:underline">
                More filters
              </button>
            </div>
            {moreOpen ? (
              <div className="flex flex-wrap items-center gap-3.5 border-t border-[#E7E7F1] pt-2.5">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  Start date from
                  <input type="date" className="rounded-md border border-[#D3D3E3] bg-transparent px-2 py-1 text-xs" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </label>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  to
                  <input type="date" className="rounded-md border border-[#D3D3E3] bg-transparent px-2 py-1 text-xs" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </label>
                <button type="button" onClick={resetFilters} className="text-xs text-muted-foreground hover:text-slate-900">Reset all</button>
              </div>
            ) : null}
          </Panel>

          {error ? <Panel className="p-4 text-sm text-[#A32D2D]">{error}</Panel> : null}

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : filtered.length ? (
            <div className="flex flex-col gap-2">
              {filtered.map((request) => {
                const color = colorFor(request.employee_name ?? "?");
                const tone = statusTone(request.status);
                const isPending = request.status === "SUBMITTED" || request.status === "PENDING_APPROVAL";
                const isCurrentApprover = canApprove && (!request.current_approver_user_id || request.current_approver_user_id === user?.id);
                return (
                  <Panel key={request.id} className="flex items-center gap-3.5 p-3">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-medium" style={{ background: color.bg, color: color.text }}>{initialsOf(request.employee_name ?? "?")}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-950">{request.employee_name}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{request.leave_type_name} · {formatDateRange(request)} · {request.requested_days} day{request.requested_days === 1 ? "" : "s"}</p>
                    </div>
                    {isPending && request.current_approval_step ? <span className="shrink-0 whitespace-nowrap text-[9px] text-muted-foreground">{request.current_approval_step}</span> : null}
                    <span className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: tone.bg, color: tone.text }}>{humanizeTechnicalLabel(request.status)}</span>
                    {isPending ? (
                      isCurrentApprover ? (
                        <div className="flex shrink-0 gap-1.5">
                          <Button size="sm" variant="actionSave" loading={busyId === request.id} onClick={() => void approve(request)}>Approve</Button>
                          <Button size="sm" variant="outline" className="border-[#F09595] text-[#A32D2D] hover:bg-[#FCEBEB]" onClick={() => setRejectTarget(request)}>Reject</Button>
                        </div>
                      ) : (
                        <span className="shrink-0 whitespace-nowrap rounded-md border border-[#D3D3E3] px-2.5 py-1.5 text-[10px] text-muted-foreground">View only · not your step</span>
                      )
                    ) : (
                      <button type="button" className="shrink-0 text-muted-foreground hover:text-slate-900" onClick={() => setDetailRequest(request)}>
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    )}
                  </Panel>
                );
              })}
            </div>
          ) : (
            <Panel><EmptyState title="No leave requests found" description="Adjust filters or check back once employees submit requests." /></Panel>
          )}
        </div>
      </div>

      {detailRequest ? <RequestDetailDialog request={detailRequest} canCancel={canCancel} onClose={() => setDetailRequest(null)} onCancelled={() => { setDetailRequest(null); void load(); }} /> : null}

      {rejectTarget ? (
        <Dialog open onOpenChange={(v) => { if (!v) { setRejectTarget(null); setRejectNote(""); } }}>
          <DialogContent size="sm">
            <DialogHeader><DialogTitle>Reject leave request</DialogTitle></DialogHeader>
            <DialogBody>
              <p className="mb-3 text-xs text-muted-foreground">{rejectTarget.employee_name} · {rejectTarget.leave_type_name} · {formatDateRange(rejectTarget)}</p>
              <label className="space-y-1.5 text-xs font-medium text-slate-950">
                Reason (required)
                <textarea className="mt-1 h-24 w-full rounded-md border border-[#D3D3E3] bg-transparent p-2 text-xs outline-none" value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="Explain why this request is being rejected" />
              </label>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => { setRejectTarget(null); setRejectNote(""); }}>Cancel</Button>
              <Button size="sm" loading={busyId === rejectTarget.id} disabled={!rejectNote.trim()} onClick={() => void reject()}>Reject request</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </PageShell>
  );
}

function RequestDetailDialog({ request, canCancel, onClose, onCancelled }: { request: LeaveRequest; canCancel: boolean; onClose: () => void; onCancelled: () => void }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [timeline, setTimeline] = useState<LeaveApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);

  useEffect(() => {
    if (!token) return;
    api.getLeaveRequestTimeline(token, request.id).then((res) => setTimeline(res.timeline)).finally(() => setLoading(false));
  }, [token, request.id]);

  const cancellable = canCancel && ["SUBMITTED", "PENDING_APPROVAL", "APPROVED"].includes(request.status);

  async function submitCancel() {
    if (!token || !cancelReason.trim()) {
      alerts.showValidationError("A reason is required to cancel a leave request.", "Leave action needs a reason");
      return;
    }
    setCancelling(true);
    try {
      await api.cancelLeaveRequest(token, request.id, cancelReason.trim());
      alerts.showSuccess("Leave request cancelled", "The request has been cancelled.");
      onCancelled();
    } catch (err) {
      alerts.showApiError(err, "Unable to cancel leave request");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>{request.employee_name}'s leave request</DialogTitle></DialogHeader>
        <DialogBody>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><p className="text-muted-foreground">Leave type</p><p className="mt-0.5 font-medium text-slate-950">{request.leave_type_name}</p></div>
              <div><p className="text-muted-foreground">Dates</p><p className="mt-0.5 font-medium text-slate-950">{formatDateRange(request)}</p></div>
              <div><p className="text-muted-foreground">Days</p><p className="mt-0.5 font-medium text-slate-950">{request.requested_days}</p></div>
              <div><p className="text-muted-foreground">Status</p><p className="mt-0.5 font-medium text-slate-950">{humanizeTechnicalLabel(request.status)}</p></div>
            </div>
            {request.reason ? <div><p className="text-xs text-muted-foreground">Reason</p><p className="mt-0.5 text-xs text-slate-950">{request.reason}</p></div> : null}
            {request.cancellation_reason ? <div><p className="text-xs text-muted-foreground">Cancellation reason</p><p className="mt-0.5 text-xs text-slate-950">{request.cancellation_reason}</p></div> : null}
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-950">Approval timeline</p>
              {loading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : timeline.length ? (
                <div className="space-y-1.5">
                  {timeline.map((step) => (
                    <div key={step.id} className="flex items-center justify-between rounded-md bg-[#F7F7FB] px-2.5 py-1.5 text-xs">
                      <span className="text-slate-950">Step {step.step_order} · {step.step_name}{step.approver_name ? ` — ${step.approver_name}` : ""}</span>
                      <span className="text-muted-foreground">{humanizeTechnicalLabel(step.status)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No approval steps recorded.</p>
              )}
            </div>
            {cancelOpen ? (
              <label className="block space-y-1.5 text-xs font-medium text-slate-950">
                Cancellation reason (required)
                <textarea className="mt-1 h-20 w-full rounded-md border border-[#D3D3E3] bg-transparent p-2 text-xs outline-none" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
              </label>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter>
          {cancellable ? (
            cancelOpen ? (
              <>
                <Button variant="outline" size="sm" onClick={() => setCancelOpen(false)}>Back</Button>
                <Button size="sm" variant="outline" className="border-[#F09595] text-[#A32D2D] hover:bg-[#FCEBEB]" loading={cancelling} disabled={!cancelReason.trim()} onClick={() => void submitCancel()}>Confirm cancel</Button>
              </>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
                <Button size="sm" variant="outline" className="border-[#F09595] text-[#A32D2D] hover:bg-[#FCEBEB]" onClick={() => setCancelOpen(true)}>Cancel request</Button>
              </>
            )
          ) : (
            <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
