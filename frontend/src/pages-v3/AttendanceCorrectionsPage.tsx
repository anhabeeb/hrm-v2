import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { PageShell, SelectField } from "../components/ui/page-shell";
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
import { ATTENDANCE_NAV_ITEMS } from "./attendanceNav";
import type { AttendanceCorrection, AttendanceStatus } from "../types/attendance";
import type { Employee } from "../types/employees";

function tone(status: string) {
  if (status === "APPROVED") return { bg: "#EAF3DE", text: "#27500A" };
  if (status === "PENDING" || status === "SUBMITTED") return { bg: "#FAEEDA", text: "#854F0B" };
  if (status === "CANCELLED") return { bg: "#F7F7FB", text: "#6B6F86" };
  return { bg: "#FCEBEB", text: "#A32D2D" };
}

function parseSnapshot(value?: string | null) {
  if (!value) return {} as Record<string, unknown>;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function AttendanceCorrectionsPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const [corrections, setCorrections] = useState<AttendanceCorrection[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<{ correction: AttendanceCorrection; type: "approve" | "reject" | "cancel" } | null>(null);

  const permissions = new Set(user?.permissions ?? []);
  const canCorrect = permissions.has("attendance.corrections.create") || permissions.has("attendance.correct") || permissions.has("attendance.corrections.manage") || permissions.has("attendance.manage");
  const canApprove = permissions.has("attendance.corrections.approve") || permissions.has("attendance.approve_correction") || permissions.has("attendance.corrections.manage") || permissions.has("attendance.manage");

  async function load() {
    if (!token) return;
    setLoading(true);
    const [correctionResult, employeeResult] = await Promise.all([
      api.listAttendanceCorrections(token, {}).catch(() => ({ corrections: [] })),
      api.listEmployees(token, { limit: 200 })
    ]);
    setCorrections(correctionResult.corrections);
    setEmployees(employeeResult.employees);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [token]);

  async function submitReview(note: string) {
    if (!token || !reviewAction) return;
    try {
      if (reviewAction.type === "approve") await api.approveAttendanceCorrection(token, reviewAction.correction.id, note || null);
      if (reviewAction.type === "reject") await api.rejectAttendanceCorrection(token, reviewAction.correction.id, note);
      if (reviewAction.type === "cancel") await api.cancelAttendanceCorrection(token, reviewAction.correction.id, note || null);
      alerts.showSuccess("Correction updated", `Attendance correction ${reviewAction.type} completed.`);
      setReviewAction(null);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to update correction request.");
    }
  }

  return (
    <PageShell constrained={false}>
      <div className="flex flex-col gap-3">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="px-4 flex items-center justify-between">
              <div>
                <RouteNavSwitcher items={ATTENDANCE_NAV_ITEMS} moduleLabel="Attendance" />
                <p className="mt-0.5 text-xs text-muted-foreground">Missed punch and status correction approval workflow</p>
              </div>
              {canCorrect ? <Button size="sm" onClick={() => setNewOpen(true)}><Plus className="h-4 w-4" /> New correction</Button> : null}
</div>

              <Panel className="shadow-none space-y-3 p-4">
          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Panel key={i} className="h-20 animate-pulse" />)}</div>
          ) : corrections.length ? (
            <div className="flex flex-col gap-2">
              {corrections.map((correction) => {
                const current = parseSnapshot(correction.current_values_json);
                const pending = correction.status === "PENDING" || correction.status === "SUBMITTED";
                return (
                  <Panel key={correction.id} className="flex items-center gap-3.5 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-950">{correction.employee_name ?? "-"} <span className="font-normal text-muted-foreground">{correction.employee_no}</span></p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{correction.attendance_date} · Current: {String(current.status ?? "-")} · Requested: {correction.requested_status ?? "-"} {correction.requested_clock_in ? new Date(correction.requested_clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""} / {correction.requested_clock_out ? new Date(correction.requested_clock_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</p>
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{correction.reason} · By {correction.requested_by_name ?? "-"}{correction.reviewed_by_name ? ` · Reviewed by ${correction.reviewed_by_name}` : ""}</p>
                    </div>
                    <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: tone(correction.status).bg, color: tone(correction.status).text }}>{humanizeTechnicalLabel(correction.status)}</span>
                    {pending && canApprove ? (
                      <div className="flex shrink-0 gap-1.5">
                        <Button size="sm" variant="actionSave" onClick={() => setReviewAction({ correction, type: "approve" })}>Approve</Button>
                        <Button size="sm" variant="danger" onClick={() => setReviewAction({ correction, type: "reject" })}>Reject</Button>
                      </div>
                    ) : null}
                  </Panel>
                );
              })}
            </div>
          ) : (
            <Panel><EmptyState title="No correction requests found" description="Submit a correction request or adjust filters." /></Panel>
          )}

              </Panel>
        </div>
      </div>

      {newOpen ? <NewCorrectionModal employees={employees} onClose={() => setNewOpen(false)} onSaved={() => { setNewOpen(false); void load(); }} /> : null}
      {reviewAction ? (
        <Dialog open onOpenChange={(v) => !v && setReviewAction(null)}>
          <DialogContent size="sm">
            <DialogHeader><DialogTitle>{reviewAction.type === "approve" ? "Approve correction" : "Reject correction"}</DialogTitle></DialogHeader>
            <DialogBody><ReviewForm required={reviewAction.type !== "approve"} onSubmit={(note) => void submitReview(note)} /></DialogBody>
          </DialogContent>
        </Dialog>
      ) : null}
    </PageShell>
  );
}

function ReviewForm({ required, onSubmit }: { required?: boolean; onSubmit: (note: string) => void }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <div className="space-y-1.5"><Label>{required ? "Reason (required)" : "Note (optional)"}</Label><Input value={note} onChange={(e) => setNote(e.target.value)} /></div>
      {error ? <p className="mt-2 text-xs text-[#A32D2D]">{error}</p> : null}
      <DialogFooter className="mt-4 px-0 pb-0"><Button size="sm" onClick={() => { if (required && !note.trim()) { setError("A reason is required."); return; } onSubmit(note); }}>Confirm</Button></DialogFooter>
    </>
  );
}

function NewCorrectionModal({ employees, onClose, onSaved }: { employees: Employee[]; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const alerts = useAlert();
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!token || !employeeId || !reason.trim()) return setError("Employee and reason are required.");
    setSaving(true);
    setError(null);
    try {
      await api.createAttendanceCorrection(token, { employee_id: employeeId, attendance_date: date, requested_clock_in: clockIn || null, requested_clock_out: clockOut || null, requested_status: (status || null) as AttendanceStatus | null, reason });
      alerts.showSuccess("Correction submitted", "The request was sent for review.");
      onSaved();
    } catch (err) {
      alerts.showApiError(err, "Unable to submit correction request.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>New attendance correction</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5"><Label>Employee</Label><SelectField value={employeeId} onValueChange={setEmployeeId}>{employees.map((e) => <option key={e.id} value={e.id}>{e.full_name} ({e.employee_no})</option>)}</SelectField></div>
            <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Requested status</Label><SelectField value={status} onValueChange={setStatus}><option value="">No change</option><option value="PRESENT">Present</option><option value="ABSENT">Absent</option><option value="LATE">Late</option><option value="HALF_DAY">Half day</option></SelectField></div>
            <div className="space-y-1.5"><Label>Clock in</Label><Input type="time" value={clockIn} onChange={(e) => setClockIn(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Clock out</Label><Input type="time" value={clockOut} onChange={(e) => setClockOut(e.target.value)} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={() => void submit()}>Submit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
