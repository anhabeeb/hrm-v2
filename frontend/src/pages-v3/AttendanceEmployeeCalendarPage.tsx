import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle, DialogContent } from "../components/ui/dialog";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { PageShell, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { PermissionAdaptiveAction } from "../components/ui/permission-action";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { cn } from "../lib/utils";
import type { Employee } from "../types/employees";
import type { AttendanceRecord } from "../types/attendance";

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

function formatMonthLabel(month: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}

function daysInMonthGrid(month: string) {
  const [y, m] = month.split("-").map(Number);
  const firstOfMonth = new Date(Date.UTC(y, m - 1, 1));
  const startWeekday = firstOfMonth.getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: Array<string | null> = Array.from({ length: startWeekday }, () => null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(`${month}-${String(day).padStart(2, "0")}`);
  return cells;
}

function dayTone(record: AttendanceRecord | undefined, isToday: boolean) {
  if (isToday) return { bg: "#EEEDFE", text: "#26215C", border: null };
  if (!record) return { bg: "#F7F7FB", text: "#9A9DB0", border: null };
  if (record.status === "ABSENT") return { bg: "#FCEBEB", text: "#A32D2D", border: null };
  if ((record.late_minutes ?? 0) > 0) return { bg: "#FAEEDA", text: "#854F0B", border: "#854F0B" };
  if (record.is_leave_day) return { bg: "#E6F1FB", text: "#0C447C", border: null };
  return { bg: "#EAF3DE", text: "#27500A", border: null };
}

function formatTime(value: string | null) {
  if (!value) return "—";
  return value.slice(11, 16) || value;
}

export function AttendanceEmployeeCalendarPage() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const [searchParams] = useSearchParams();
  const { token, user } = useAuth();
  const navigate = useNavigate();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [month, setMonth] = useState(searchParams.get("month") ?? currentMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState<string | null>(null);

  const permissions = new Set(user?.permissions ?? []);
  const canManageCorrections = permissions.has("attendance.corrections.manage") || permissions.has("attendance.corrections.approve");
  const canManageManualEntries = permissions.has("attendance.manual_entries.manage");

  async function load() {
    if (!token || !employeeId) return;
    setLoading(true);
    try {
      const [overview, calendar] = await Promise.all([
        api.getEmployeeOverview(token, employeeId),
        api.getEmployeeAttendanceCalendar(token, employeeId, { month })
      ]);
      setEmployee(overview.employee);
      setRecords(calendar.calendar);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, employeeId, month]);

  const recordsByDate = useMemo(() => new Map(records.map((r) => [r.attendance_date, r])), [records]);
  const today = new Date().toISOString().slice(0, 10);
  const cells = useMemo(() => daysInMonthGrid(month), [month]);
  const selectedRecord = selectedDate ? recordsByDate.get(selectedDate) : undefined;

  if (loading || !employee) {
    return <PageShell><Panel className="h-64 animate-pulse" /></PageShell>;
  }

  return (
    <PageShell constrained={false}>
      <div className="flex flex-col gap-3">
        <Link to="/v3-preview/attendance" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-slate-900">
          &larr; Attendance / {employee.full_name}
        </Link>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-[#E6F1FB] text-xs font-medium text-[#0C447C]">
              {employee.full_name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-medium text-slate-950">{employee.full_name}</p>
              <p className="text-[10px] text-muted-foreground">{employee.department_name ?? "No department"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <PermissionAdaptiveAction
              hasAuthority={canManageCorrections}
              directLabel="Correction"
              onDirectAction={() => setCorrectionOpen(today)}
              requestLabel="Correction request"
              onRequestAction={() => setCorrectionOpen(today)}
              size="sm"
            />
            <PermissionAdaptiveAction
              hasAuthority={canManageManualEntries}
              directLabel={<><Plus className="h-3.5 w-3.5" /> Manual entry</>}
              onDirectAction={() => setManualEntryOpen(true)}
              requestLabel="Request manual entry"
              onRequestAction={() => setManualEntryOpen(true)}
              size="sm"
            />
          </div>
        </div>

        <Panel className="flex items-center justify-between px-3.5 py-2">
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))}><ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" /></button>
            <p className="min-w-[110px] text-center text-sm font-medium text-slate-950">{formatMonthLabel(month)}</p>
            <button type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))}><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /></button>
          </div>
          <button type="button" onClick={() => setMonth(currentMonth())} className="text-xs text-primary">Today</button>
        </Panel>

        <Panel className="p-3.5">
          <div className="mb-1.5 grid grid-cols-7 gap-1.5">
            {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((d) => <span key={d} className="text-center text-[9px] font-medium text-muted-foreground">{d}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {cells.map((date, i) => {
              if (!date) return <div key={`empty-${i}`} />;
              const record = recordsByDate.get(date);
              const isToday = date === today;
              const tone = dayTone(record, isToday);
              const dayNum = Number(date.slice(8));
              return (
                <button
                  type="button"
                  key={date}
                  onClick={() => setSelectedDate(date)}
                  className="min-h-[52px] rounded-lg p-1.5 text-left"
                  style={{ background: tone.bg, border: tone.border ? `1.5px solid ${tone.border}` : selectedDate === date ? "1.5px solid #5B4FE9" : undefined }}
                >
                  <p className="text-[10px] font-medium" style={{ color: tone.text }}>{dayNum}</p>
                  {isToday ? <p className="mt-0.5 text-[8px]" style={{ color: tone.text }}>Today</p> : null}
                  {!isToday && record && (record.late_minutes ?? 0) > 0 ? <p className="mt-0.5 text-[8px]" style={{ color: tone.text }}>Late {record.late_minutes}m</p> : null}
                  {!isToday && record && !(record.late_minutes ?? 0) && record.first_clock_in ? <p className="mt-0.5 text-[8px]" style={{ color: tone.text }}>{formatTime(record.first_clock_in)}</p> : null}
                </button>
              );
            })}
          </div>
        </Panel>

        <div className="flex gap-3.5 text-[10px] text-muted-foreground">
          <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#EAF3DE]" />Present</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#FAEEDA]" />Late</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#FCEBEB]" />Absent</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#E6F1FB]" />On leave</span>
        </div>

        {selectedDate ? (
          <Panel className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-950">{new Date(`${selectedDate}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}</p>
              </div>
              {selectedRecord ? (
                <span className="rounded-full px-2.5 py-1 text-[10px] font-medium" style={dayTone(selectedRecord, false) && { background: dayTone(selectedRecord, false).bg, color: dayTone(selectedRecord, false).text }}>
                  {(selectedRecord.late_minutes ?? 0) > 0 ? `Late by ${selectedRecord.late_minutes} minutes` : selectedRecord.status === "ABSENT" ? "Absent" : "Present"}
                </span>
              ) : (
                <span className="rounded-full bg-[#F7F7FB] px-2.5 py-1 text-[10px] text-muted-foreground">No record</span>
              )}
            </div>
            {selectedRecord ? (
              <div className="mb-3 grid grid-cols-2 gap-3.5 border-t pt-3 text-xs sm:grid-cols-4">
                <div><p className="text-muted-foreground">Clock in</p><p className="mt-0.5 font-medium text-slate-950">{formatTime(selectedRecord.first_clock_in)}</p></div>
                <div><p className="text-muted-foreground">Clock out</p><p className="mt-0.5 font-medium text-slate-950">{formatTime(selectedRecord.last_clock_out)}</p></div>
                <div><p className="text-muted-foreground">Source</p><p className="mt-0.5 text-slate-950">{selectedRecord.source ? selectedRecord.source.replace(/_/g, " ") : "—"}</p></div>
                <div><p className="text-muted-foreground">Worked hours</p><p className="mt-0.5 text-slate-950">{selectedRecord.total_work_minutes ? `${Math.floor(selectedRecord.total_work_minutes / 60)}h ${selectedRecord.total_work_minutes % 60}m` : "—"}</p></div>
              </div>
            ) : (
              <p className="mb-3 text-xs text-muted-foreground">No attendance record was logged for this day.</p>
            )}
            <div className="flex gap-2">
              <PermissionAdaptiveAction
                hasAuthority={canManageCorrections}
                directLabel="Edit this day"
                onDirectAction={() => setCorrectionOpen(selectedDate)}
                requestLabel="Request correction for this day"
                onRequestAction={() => setCorrectionOpen(selectedDate)}
                size="sm"
              />
              <Button variant="outline" size="sm" onClick={() => navigate(`/v3-preview/attendance?employee_id=${employeeId}&date=${selectedDate}`)}>View raw punches</Button>
            </div>
          </Panel>
        ) : null}
      </div>

      {manualEntryOpen ? (
        <ManualEntryModal employeeId={employeeId!} onClose={() => setManualEntryOpen(false)} onSaved={() => { setManualEntryOpen(false); void load(); }} />
      ) : null}
      {correctionOpen ? (
        <CorrectionModal employeeId={employeeId!} date={correctionOpen} existing={recordsByDate.get(correctionOpen)} onClose={() => setCorrectionOpen(null)} onSaved={() => { setCorrectionOpen(null); void load(); }} />
      ) : null}
    </PageShell>
  );
}

function ManualEntryModal({ employeeId, onClose, onSaved }: { employeeId: string; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [logType, setLogType] = useState<"IN" | "OUT">("IN");
  const [time, setTime] = useState("09:00");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      await api.createManualAttendanceLog(token, { employee_id: employeeId, attendance_date: date, log_time: `${date}T${time}:00.000Z`, log_type: logType, notes: notes || null, source: "MANUAL" });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save manual entry.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Manual attendance entry</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <SelectField value={logType} onValueChange={(v) => setLogType(v as "IN" | "OUT")}>
                <option value="IN">Clock in</option>
                <option value="OUT">Clock out</option>
              </SelectField>
            </div>
            <div className="space-y-1.5"><Label>Time</Label><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason for manual entry" /></div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={() => void submit()}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CorrectionModal({ employeeId, date, existing, onClose, onSaved }: { employeeId: string; date: string; existing?: AttendanceRecord; onClose: () => void; onSaved: () => void }) {
  const { token } = useAuth();
  const [clockIn, setClockIn] = useState(existing?.first_clock_in ? formatTime(existing.first_clock_in) : "09:00");
  const [clockOut, setClockOut] = useState(existing?.last_clock_out ? formatTime(existing.last_clock_out) : "17:00");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      await api.createAttendanceCorrection(token, {
        employee_id: employeeId,
        attendance_date: date,
        requested_clock_in: `${date}T${clockIn}:00.000Z`,
        requested_clock_out: `${date}T${clockOut}:00.000Z`,
        reason
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit correction.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Request correction · {date}</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Corrected clock in</Label><Input type="time" value={clockIn} onChange={(e) => setClockIn(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Corrected clock out</Label><Input type="time" value={clockOut} onChange={(e) => setClockOut(e.target.value)} /></div>
            <div className="col-span-2 space-y-1.5"><Label>Reason</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why does this day need correcting?" /></div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} disabled={!reason.trim()} onClick={() => void submit()}>Submit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
