import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, Plus } from "lucide-react";
import { PageShell } from "../../components/ui/page-shell";
import { Panel } from "../../components/ui/panel";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { useAuth } from "../../hooks/useAuth";
import { useAlert } from "../../components/alerts/useAlert";
import { ApiError, api } from "../../lib/api";
import { humanizeTechnicalLabel } from "../../lib/displayLabels";

type Row = Record<string, unknown>;
function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}
function text(value: unknown, fallback = "—") {
  const s = value === null || value === undefined ? "" : String(value);
  return s && s !== "null" && s !== "undefined" ? s : fallback;
}
function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
function mondayOf(date: Date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}
function shiftWeek(weekStart: string, deltaDays: number) {
  const d = new Date(`${weekStart}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return isoDate(d);
}
function weekDays(weekStart: string) {
  const start = new Date(`${weekStart}T00:00:00Z`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    return isoDate(d);
  });
}
function formatWeekLabel(weekStart: string, weekEnd: string) {
  const s = new Date(`${weekStart}T00:00:00Z`);
  const e = new Date(`${weekEnd}T00:00:00Z`);
  const sLabel = s.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  const eLabel = e.toLocaleDateString(undefined, { day: "numeric", timeZone: "UTC" });
  return `Week of ${sLabel} – ${eLabel}`;
}
function formatDateLong(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}
function formatTime(value: unknown) {
  const s = String(value ?? "");
  if (!s) return null;
  const [h, m] = s.split(":");
  const hour = Number(h);
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${m ?? "00"} ${period}`;
}
function isOffStatus(status: string) {
  return ["OFF", "DAY_OFF", "LEAVE", "SICK_LEAVE", "LONG_LEAVE", "PUBLIC_HOLIDAY"].includes(status);
}
function requestStatusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (status === "APPROVED") return "success";
  if (["PENDING_COLLEAGUE", "PENDING_MANAGER"].includes(status)) return "warning";
  if (status === "REJECTED") return "danger";
  return "neutral";
}
function requestStatusLabel(status: string) {
  if (status === "PENDING_COLLEAGUE") return "Pending colleague";
  if (status === "PENDING_MANAGER") return "Pending";
  return humanizeTechnicalLabel(status);
}

export function SelfServiceRosterPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const [weekStart, setWeekStart] = useState(isoDate(mondayOf(new Date())));
  const [weekEnd, setWeekEnd] = useState("");
  const [assignments, setAssignments] = useState<Row[]>([]);
  const [requests, setRequests] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [requestFormDate, setRequestFormDate] = useState<string | null>(null);
  const [viewingRequest, setViewingRequest] = useState<Row | null>(null);
  const [respondingRequest, setRespondingRequest] = useState<Row | null>(null);
  const today = isoDate(new Date());
  const myEmployeeId = text((user as unknown as Row)?.employee_id, "");

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [rosterResult, requestsResult] = await Promise.all([
        api.getSelfServiceRosterWeek(token, { week_start_date: weekStart }),
        api.getSelfServiceRosterChangeRequests(token).catch(() => ({ requests: [] as Row[] }))
      ]);
      setWeekEnd(String(rosterResult.week_end_date));
      setAssignments(asRows(rosterResult.assignments));
      setRequests(asRows(requestsResult.requests));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load your roster.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, weekStart]);

  useEffect(() => {
    const days = weekDays(weekStart);
    setSelectedDate(days.includes(today) ? today : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  const byDate = useMemo(() => new Map(assignments.map((a) => [String(a.roster_date), a])), [assignments]);
  const days = useMemo(() => weekDays(weekStart), [weekStart]);
  const selected = selectedDate ? byDate.get(selectedDate) : undefined;
  const activeRequestByDate = useMemo(() => {
    const map = new Map<string, Row>();
    for (const r of requests) {
      if (["PENDING_COLLEAGUE", "PENDING_MANAGER"].includes(text(r.status))) map.set(String(r.roster_date), r);
    }
    return map;
  }, [requests]);
  const awaitingMyResponse = requests.filter((r) => text(r.status) === "PENDING_COLLEAGUE" && r.swap_with_employee_id === myEmployeeId);
  const selectedRequest = selectedDate ? requests.find((r) => String(r.roster_date) === selectedDate && ["PENDING_COLLEAGUE", "PENDING_MANAGER", "APPROVED", "REJECTED"].includes(text(r.status))) : undefined;

  if (loading) {
    return <PageShell constrained={false}><div className="flex flex-col gap-2">{Array.from({ length: 2 }).map((_, i) => <Panel key={i} className="h-24 animate-pulse" />)}</div></PageShell>;
  }
  if (error) {
    return <PageShell constrained={false}><Panel className="p-4 text-xs text-[#A32D2D]">{error}</Panel></PageShell>;
  }

  return (
    <PageShell constrained={false}>
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={() => setWeekStart((w) => shiftWeek(w, -7))}><ChevronLeft className="h-4 w-4 text-muted-foreground" /></button>
            <p className="text-sm font-medium text-slate-950">{formatWeekLabel(weekStart, weekEnd || weekStart)}</p>
            <button type="button" onClick={() => setWeekStart((w) => shiftWeek(w, 7))}><ChevronRight className="h-4 w-4 text-muted-foreground" /></button>
          </div>
          <Button size="sm" onClick={() => setRequestFormDate(selectedDate ?? today)}><Clock className="h-3.5 w-3.5" /> Request roster change</Button>
        </div>

        {awaitingMyResponse.length ? (
          <Panel className="border-[#AFA9EC] bg-[#EEEDFE] p-3.5">
            <p className="mb-2 text-xs font-medium text-[#534AB7]">{awaitingMyResponse.length} colleague swap request{awaitingMyResponse.length === 1 ? "" : "s"} awaiting your response</p>
            <div className="flex flex-col gap-2">
              {awaitingMyResponse.map((r, i) => (
                <div key={String(r.id ?? i)} className="flex items-center justify-between rounded-md bg-white px-3 py-2">
                  <p className="text-[10px] text-slate-950">{text(r.employee_name)} wants to swap shifts with you on {formatDateLong(String(r.roster_date))}</p>
                  <Button size="sm" variant="outline" onClick={() => setRespondingRequest(r)}>Respond</Button>
                </div>
              ))}
            </div>
          </Panel>
        ) : null}

        <Panel className="p-4">
          <div className="grid grid-cols-7 gap-2">
            {days.map((date) => {
              const a = byDate.get(date);
              const status = text(a?.status, "");
              const off = isOffStatus(status);
              const start = a?.custom_start_time ?? a?.shift_start_time;
              const end = a?.custom_end_time ?? a?.shift_end_time;
              const isSelected = selectedDate === date;
              const pendingRequest = activeRequestByDate.get(date);
              const dayLabel = new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" });
              const dayNum = Number(date.slice(8));
              const bg = pendingRequest ? "#FAEEDA" : off ? "#FCEBEB" : "#F7F7FB";
              const fg = pendingRequest ? "#854F0B" : off ? "#A32D2D" : "#14162B";
              const muted = pendingRequest ? "#854F0B" : off ? "#A32D2D" : "#6B6F86";
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => setSelectedDate(date)}
                  className="rounded-lg p-2 text-center"
                  style={{ background: bg, boxShadow: isSelected ? "0 0 0 1.5px #5B4FE9" : pendingRequest ? "0 0 0 1.5px #FAC775" : undefined }}
                >
                  <p className="text-[9px] font-medium" style={{ color: muted }}>{dayLabel} {dayNum}</p>
                  {off ? (
                    <p className="mt-3.5 text-[10px] font-medium" style={{ color: fg }}>Off</p>
                  ) : start ? (
                    <>
                      <p className="mt-0.5 text-[10px] font-medium" style={{ color: fg }}>{formatTime(start)}</p>
                      <p className="text-[10px]" style={{ color: fg }}>{formatTime(end)}</p>
                      <p className="mt-1 truncate text-[8px] text-muted-foreground">{text(a?.location_name, "")}</p>
                    </>
                  ) : (
                    <p className="mt-3.5 text-[10px] text-muted-foreground">—</p>
                  )}
                  {pendingRequest ? <p className="mt-1 text-[7px] font-medium" style={{ color: fg }}>Pending</p> : null}
                </button>
              );
            })}
          </div>
        </Panel>

        {selected ? (
          <Panel className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-medium text-slate-950">{formatDateLong(selectedDate!)}</p>
              {selectedRequest ? <Badge tone={requestStatusTone(text(selectedRequest.status))}>{requestStatusLabel(text(selectedRequest.status))}</Badge> : null}
            </div>
            {isOffStatus(text(selected.status)) ? (
              <p className="text-xs text-muted-foreground">Scheduled day off.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3.5 text-xs sm:grid-cols-3">
                <div><p className="text-muted-foreground">Shift time</p><p className="mt-0.5 font-medium text-slate-950">{formatTime(selected.custom_start_time ?? selected.shift_start_time) ?? "—"} – {formatTime(selected.custom_end_time ?? selected.shift_end_time) ?? "—"}</p></div>
                <div><p className="text-muted-foreground">Outlet</p><p className="mt-0.5 text-slate-950">{text(selected.location_name)}</p></div>
                {(selected.custom_break_minutes ?? selected.break_minutes) ? (
                  <div><p className="text-muted-foreground">Break</p><p className="mt-0.5 text-slate-950">{Number(selected.custom_break_minutes ?? selected.break_minutes)} min</p></div>
                ) : null}
              </div>
            )}
            <div className="mt-3 flex items-center justify-between border-t pt-3">
              <p className="text-[9px] text-muted-foreground">Need this day changed?</p>
              {selectedRequest ? (
                <Button size="sm" variant="outline" onClick={() => setViewingRequest(selectedRequest)}>View request</Button>
              ) : (
                <Button size="sm" onClick={() => setRequestFormDate(selectedDate)}>Request roster change</Button>
              )}
            </div>
          </Panel>
        ) : selectedDate ? (
          <Panel className="p-4"><p className="text-xs text-muted-foreground">No roster assignment for this day.</p></Panel>
        ) : null}
      </div>

      {requestFormDate ? (
        <RequestChangeDialog
          date={requestFormDate}
          onClose={() => setRequestFormDate(null)}
          onSaved={async () => { setRequestFormDate(null); alerts.showSuccess("Request submitted", "Your roster change request has been sent for review."); await load(); }}
        />
      ) : null}
      {viewingRequest ? <RequestStatusDialog request={viewingRequest} onClose={() => setViewingRequest(null)} onCancelled={async () => { setViewingRequest(null); await load(); }} /> : null}
      {respondingRequest ? <ColleagueRespondDialog request={respondingRequest} onClose={() => setRespondingRequest(null)} onResponded={async () => { setRespondingRequest(null); await load(); }} /> : null}
    </PageShell>
  );
}

function RequestChangeDialog({ date, onClose, onSaved }: { date: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const { token } = useAuth();
  const [requestType, setRequestType] = useState<"CHANGE_DETAILS" | "SWAP">("CHANGE_DETAILS");
  const [requestedStart, setRequestedStart] = useState("");
  const [requestedEnd, setRequestedEnd] = useState("");
  const [makeOff, setMakeOff] = useState(false);
  const [colleagues, setColleagues] = useState<Row[]>([]);
  const [swapWithEmployeeId, setSwapWithEmployeeId] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || requestType !== "SWAP") return;
    api.getSelfServiceRosterColleagues(token, date).then((res) => setColleagues(asRows(res.colleagues))).catch(() => setColleagues([]));
  }, [token, requestType, date]);

  const selectedColleague = colleagues.find((c) => c.employee_id === swapWithEmployeeId);

  async function submit() {
    if (!token || !reason.trim()) return;
    if (requestType === "SWAP" && !swapWithEmployeeId) return;
    setSaving(true);
    setError(null);
    try {
      await api.createSelfServiceRosterChangeRequest(token, {
        request_type: requestType,
        roster_date: date,
        reason: reason.trim(),
        ...(requestType === "SWAP"
          ? { swap_with_employee_id: swapWithEmployeeId }
          : { requested_start_time: makeOff ? null : (requestedStart ? `${date}T${requestedStart}:00.000Z` : null), requested_end_time: makeOff ? null : (requestedEnd ? `${date}T${requestedEnd}:00.000Z` : null) })
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to submit request.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>Request roster change · {formatDateLong(date)}</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-[10px] text-muted-foreground">What kind of change do you need?</p>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setRequestType("CHANGE_DETAILS")}
                  className="rounded-lg border p-3 text-left"
                  style={{ borderColor: "#5B4FE9", background: requestType === "CHANGE_DETAILS" ? "#EEEDFE" : "#fff" }}
                >
                  <p className="text-xs font-medium text-slate-950">Change shift details</p>
                  <p className="mt-0.5 text-[9px] text-muted-foreground">Different time and/or outlet for this shift</p>
                </button>
                <button
                  type="button"
                  onClick={() => setRequestType("SWAP")}
                  className="rounded-lg border p-3 text-left"
                  style={{ borderColor: "#5B4FE9", background: requestType === "SWAP" ? "#EEEDFE" : "#fff" }}
                >
                  <p className="text-xs font-medium text-slate-950">Swap with a colleague</p>
                  <p className="mt-0.5 text-[9px] text-muted-foreground">Trade shifts with someone else on the roster</p>
                </button>
              </div>
            </div>

            {requestType === "CHANGE_DETAILS" ? (
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-xs text-slate-950">
                  <input type="checkbox" checked={makeOff} onChange={(e) => setMakeOff(e.target.checked)} />
                  Request this day off instead
                </label>
                {!makeOff ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label>Requested start time</Label><Input type="time" value={requestedStart} onChange={(e) => setRequestedStart(e.target.value)} /></div>
                    <div className="space-y-1.5"><Label>Requested end time</Label><Input type="time" value={requestedEnd} onChange={(e) => setRequestedEnd(e.target.value)} /></div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Swap with *</Label>
                  <select className="h-9 w-full rounded-md border border-input bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-ring/20" value={swapWithEmployeeId} onChange={(e) => setSwapWithEmployeeId(e.target.value)}>
                    <option value="">{colleagues.length ? "Select a colleague" : "No colleagues scheduled this day"}</option>
                    {colleagues.map((c) => <option key={String(c.employee_id)} value={String(c.employee_id)}>{text(c.full_name)} · {text(c.position_title, "")}</option>)}
                  </select>
                </div>
                {selectedColleague ? (
                  <div className="rounded-md bg-[#F7F7FB] p-3">
                    <p className="mb-2 text-[9px] text-muted-foreground">You'll be taking {text(selectedColleague.full_name)}'s shift below in exchange</p>
                    <p className="text-xs text-slate-950">{formatTime(selectedColleague.custom_start_time ?? selectedColleague.shift_start_time)} – {formatTime(selectedColleague.custom_end_time ?? selectedColleague.shift_end_time)} · {text(selectedColleague.location_name)}</p>
                  </div>
                ) : null}
              </div>
            )}

            <div className="space-y-1.5"><Label>Reason *</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why do you need this change?" /></div>
          </div>
          <p className="mt-3 text-[10px] text-muted-foreground">
            {requestType === "SWAP" ? "Swap requests first need your colleague to confirm, then go to your manager for final approval." : "Change requests go straight to your manager for review."}
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} disabled={!reason.trim() || (requestType === "SWAP" && !swapWithEmployeeId)} onClick={() => void submit()}>
            {requestType === "SWAP" ? "Send swap request" : "Submit request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequestStatusDialog({ request, onClose, onCancelled }: { request: Row; onClose: () => void; onCancelled: () => Promise<void> }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = text(request.status);
  const isSwap = text(request.request_type) === "SWAP";
  const cancellable = ["PENDING_COLLEAGUE", "PENDING_MANAGER"].includes(status);

  async function cancel() {
    if (!token) return;
    setCancelling(true);
    setError(null);
    try {
      await api.cancelSelfServiceRosterChangeRequest(token, String(request.id));
      alerts.showSuccess("Request withdrawn", "");
      await onCancelled();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to withdraw this request.");
    } finally {
      setCancelling(false);
    }
  }

  const steps = [
    ...(isSwap ? [{
      name: text(request.swap_with_employee_name, "Colleague"),
      label: "Colleague confirmation",
      status: request.colleague_decision ? text(request.colleague_decision) : status === "PENDING_COLLEAGUE" ? "PENDING" : "PENDING",
      note: request.colleague_decision_note,
      decidedAt: request.colleague_decided_at
    }] : []),
    {
      name: "Manager",
      label: "Manager review",
      status: request.manager_decision ? text(request.manager_decision) : "PENDING",
      note: request.manager_decision_note,
      decidedAt: request.manager_decided_at
    }
  ];

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>Roster change request · {formatDateLong(text(request.roster_date))}</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-950">{isSwap ? "Shift swap request" : "Shift change request"}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">Current: {formatTime(request.current_start_time) ?? "Off"}{request.current_start_time ? ` – ${formatTime(request.current_end_time)}` : ""}{request.current_location_name ? ` · ${text(request.current_location_name)}` : ""}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">Requested: {formatTime(request.requested_start_time) ?? "Off"}{request.requested_start_time ? ` – ${formatTime(request.requested_end_time)}` : ""}{request.requested_location_name ? ` · ${text(request.requested_location_name)}` : ""}</p>
            </div>
            <Badge tone={requestStatusTone(status)}>{requestStatusLabel(status)}</Badge>
          </div>

          {request.reason ? (
            <div className="mb-4 rounded-md bg-[#F7F7FB] p-3">
              <p className="text-xs text-slate-950">"{text(request.reason)}"</p>
            </div>
          ) : null}

          <p className="mb-3 text-xs font-medium text-slate-950">Approval progress</p>
          <div className="relative space-y-4 pl-8">
            <div className="absolute bottom-3 left-3.5 top-3 w-px bg-[#E7E7F1]" />
            {steps.map((step, i) => {
              const dotColor = step.status === "ACCEPTED" || step.status === "APPROVED" ? "#5DCAA5" : step.status === "DECLINED" || step.status === "REJECTED" ? "#F09595" : "#FAC775";
              return (
                <div key={i} className="relative">
                  <div className="absolute -left-8 top-0 grid h-7 w-7 place-items-center rounded-full" style={{ background: dotColor }}>
                    <span className="text-[10px] font-medium text-white">{["ACCEPTED", "APPROVED"].includes(step.status) ? "✓" : ["DECLINED", "REJECTED"].includes(step.status) ? "✕" : i + 1}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-slate-950">{step.label}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{step.name}</p>
                    </div>
                    <Badge tone={["ACCEPTED", "APPROVED"].includes(step.status) ? "success" : ["DECLINED", "REJECTED"].includes(step.status) ? "danger" : "warning"}>
                      {["ACCEPTED", "APPROVED"].includes(step.status) ? "Confirmed" : ["DECLINED", "REJECTED"].includes(step.status) ? "Declined" : "Awaiting response"}
                    </Badge>
                  </div>
                  {step.note ? (
                    <div className="mt-2 rounded-md bg-[#F7F7FB] p-2.5">
                      <p className="text-[10px] text-slate-950">"{text(step.note)}"</p>
                      {step.decidedAt ? <p className="mt-1 text-[8px] text-muted-foreground">{new Date(text(step.decidedAt)).toLocaleString()}</p> : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          {cancellable ? <Button size="sm" loading={cancelling} className="bg-[#A32D2D] hover:bg-[#8a2525]" onClick={() => void cancel()}>Withdraw request</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ColleagueRespondDialog({ request, onClose, onResponded }: { request: Row; onClose: () => void; onResponded: () => Promise<void> }) {
  const { token } = useAuth();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function respond(decision: "ACCEPTED" | "DECLINED") {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      await api.respondToRosterChangeRequestAsColleague(token, String(request.id), { decision, note: note.trim() || null });
      await onResponded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to submit your response.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Swap request · {formatDateLong(text(request.roster_date))}</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <p className="mb-3 text-xs text-slate-950">{text(request.employee_name)} wants to swap shifts with you on this day.</p>
          <div className="mb-3 grid grid-cols-2 gap-3 rounded-md bg-[#F7F7FB] p-3 text-xs">
            <div><p className="text-[9px] text-muted-foreground">Your shift (given up)</p><p className="mt-0.5 text-slate-950">{formatTime(request.requested_start_time) ?? "Off"} – {formatTime(request.requested_end_time) ?? ""}</p></div>
            <div><p className="text-[9px] text-muted-foreground">Their shift (received)</p><p className="mt-0.5 text-slate-950">{formatTime(request.current_start_time) ?? "Off"} – {formatTime(request.current_end_time) ?? ""}</p></div>
          </div>
          <div className="space-y-1.5"><Label>Note (optional)</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for the manager" /></div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" loading={saving} className="border-[#F09595] text-[#A32D2D] hover:bg-[#FCEBEB]" onClick={() => void respond("DECLINED")}>Decline</Button>
          <Button size="sm" loading={saving} onClick={() => void respond("ACCEPTED")}>Accept swap</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
