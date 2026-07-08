import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageShell } from "../../components/ui/page-shell";
import { Panel } from "../../components/ui/panel";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { useAuth } from "../../hooks/useAuth";
import { useAlert } from "../../components/alerts/useAlert";
import { ApiError, api } from "../../lib/api";

type Row = Record<string, unknown>;
function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}
function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}
function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}
function formatMonthLabel(month: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}
function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const from = `${month}-01`;
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { from, to };
}
function daysInMonthGrid(month: string) {
  const [y, m] = month.split("-").map(Number);
  const startWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: Array<string | null> = Array.from({ length: startWeekday }, () => null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(`${month}-${String(day).padStart(2, "0")}`);
  return cells;
}
function formatTime(value: unknown) {
  const s = String(value ?? "");
  if (!s) return "—";
  return s.slice(11, 16) || s;
}
function dayTone(record: Row | undefined) {
  if (!record) return { bg: "#F7F7FB", text: "#9A9DB0" };
  const status = String(record.status ?? "");
  if (["DAY_OFF", "OFF_DAY", "PUBLIC_HOLIDAY", "HOLIDAY"].includes(status)) return { bg: "#F1F1F7", text: "#9A9DB0" };
  if (status === "ABSENT") return { bg: "#FCEBEB", text: "#A32D2D" };
  if (Number(record.late_minutes ?? 0) > 0) return { bg: "#FAEEDA", text: "#854F0B" };
  if (["LEAVE", "SICK_LEAVE", "LONG_LEAVE", "SICK"].includes(status)) return { bg: "#EEEDFE", text: "#534AB7" };
  return { bg: "#EAF3DE", text: "#27500A" };
}
function correctionTone(status: string) {
  if (status === "PENDING") return { dot: "#FAC775", text: "#854F0B", label: "Correction requested · Pending review" };
  if (status === "APPROVED") return { dot: "#5DCAA5", text: "#27500A", label: "Corrected" };
  if (status === "REJECTED") return { dot: "#F09595", text: "#A32D2D", label: "Correction rejected" };
  return null;
}

export function SelfServiceAttendancePage() {
  const { token } = useAuth();
  const alerts = useAlert();
  const [month, setMonth] = useState(currentMonth());
  const [records, setRecords] = useState<Row[]>([]);
  const [corrections, setCorrections] = useState<Row[]>([]);
  const today = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [correctionOpen, setCorrectionOpen] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const { from, to } = monthBounds(month);
      const result = await api.getSelfServiceAttendance(token, { date_from: from, date_to: to });
      setRecords(asRows(result.records));
      setCorrections(asRows(result.corrections));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load your attendance.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, month]);

  useEffect(() => {
    if (month === currentMonth() && !selectedDate) setSelectedDate(today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const recordsByDate = useMemo(() => new Map(records.map((r) => [String(r.attendance_date), r])), [records]);
  const correctionsByDate = useMemo(() => {
    const map = new Map<string, Row>();
    for (const c of corrections) {
      const date = String(c.attendance_date);
      const existing = map.get(date);
      if (!existing || String(c.created_at) > String(existing.created_at)) map.set(date, c);
    }
    return map;
  }, [corrections]);
  const cells = useMemo(() => daysInMonthGrid(month), [month]);
  const selectedRecord = selectedDate ? recordsByDate.get(selectedDate) : undefined;
  const selectedCorrection = selectedDate ? correctionsByDate.get(selectedDate) : undefined;

  const stats = useMemo(() => {
    let present = 0, late = 0, absent = 0, onLeave = 0, minutes = 0;
    for (const r of records) {
      const status = String(r.status ?? "");
      if (status === "ABSENT") absent++;
      else if (Number(r.late_minutes ?? 0) > 0) { present++; late++; }
      else if (["LEAVE", "SICK_LEAVE", "LONG_LEAVE", "SICK"].includes(status)) onLeave++;
      else if (!["DAY_OFF", "OFF_DAY", "PUBLIC_HOLIDAY", "HOLIDAY"].includes(status)) present++;
      minutes += Number(r.total_work_minutes ?? 0);
    }
    return { present, late, absent, onLeave, hours: (minutes / 60).toFixed(1) };
  }, [records]);

  if (loading) {
    return <PageShell constrained={false}><div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Panel key={i} className="h-20 animate-pulse" />)}</div></PageShell>;
  }
  if (error) {
    return <PageShell constrained={false}><Panel className="p-4 text-xs text-[#A32D2D]">{error}</Panel></PageShell>;
  }

  return (
    <PageShell constrained={false}>
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <p className="text-lg font-medium text-slate-950">My attendance</p>
          <Button size="sm" onClick={() => setCorrectionOpen(selectedDate ?? today)}>Request correction</Button>
        </div>

        <Panel className="flex items-center justify-between px-3.5 py-2">
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))}><ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" /></button>
            <p className="min-w-[110px] text-center text-sm font-medium text-slate-950">{formatMonthLabel(month)}</p>
            <button type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))}><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /></button>
          </div>
          <button type="button" onClick={() => setMonth(currentMonth())} className="text-xs text-primary">Today</button>
        </Panel>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
          <Panel className="p-3"><p className="text-[9px] text-muted-foreground">Present</p><p className="mt-1 text-base font-medium text-[#27500A]">{stats.present} days</p></Panel>
          <Panel className="p-3"><p className="text-[9px] text-muted-foreground">Late</p><p className="mt-1 text-base font-medium text-[#854F0B]">{stats.late} days</p></Panel>
          <Panel className="p-3"><p className="text-[9px] text-muted-foreground">Absent</p><p className="mt-1 text-base font-medium text-[#A32D2D]">{stats.absent} days</p></Panel>
          <Panel className="p-3"><p className="text-[9px] text-muted-foreground">On leave</p><p className="mt-1 text-base font-medium text-[#534AB7]">{stats.onLeave} days</p></Panel>
          <Panel className="p-3"><p className="text-[9px] text-muted-foreground">Total hours</p><p className="mt-1 text-base font-medium text-slate-950">{stats.hours} hrs</p></Panel>
        </div>

        <Panel className="p-3.5">
          <div className="mb-1.5 grid grid-cols-7 gap-1.5">
            {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((d) => <span key={d} className="text-center text-[9px] font-medium text-muted-foreground">{d}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {cells.map((date, i) => {
              if (!date) return <div key={`empty-${i}`} />;
              const record = recordsByDate.get(date);
              const isToday = date === today;
              const tone = isToday ? { bg: "#EEEDFE", text: "#26215C" } : dayTone(record);
              const dayNum = Number(date.slice(8));
              return (
                <button
                  type="button"
                  key={date}
                  onClick={() => setSelectedDate(date)}
                  className="min-h-[52px] rounded-lg p-1.5 text-left"
                  style={{ background: tone.bg, boxShadow: selectedDate === date ? "0 0 0 1.5px #5B4FE9" : undefined }}
                >
                  <p className="text-[10px] font-medium" style={{ color: tone.text }}>{dayNum}</p>
                  {isToday ? <p className="mt-0.5 text-[8px]" style={{ color: tone.text }}>Today</p> : record && Number(record.late_minutes ?? 0) > 0 ? <p className="mt-0.5 text-[8px]" style={{ color: tone.text }}>Late {record.late_minutes as number}m</p> : record?.first_clock_in ? <p className="mt-0.5 text-[8px]" style={{ color: tone.text }}>{formatTime(record.first_clock_in)}</p> : null}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-3.5 text-[9px] text-muted-foreground">
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#EAF3DE]" />Present</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#FAEEDA]" />Late</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#FCEBEB]" />Absent</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#EEEDFE]" />On leave</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-[#F1F1F7]" />Day off</span>
          </div>
        </Panel>

        {selectedDate ? (
          <Panel className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-medium text-slate-950">{new Date(`${selectedDate}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}</p>
              {selectedRecord ? (
                <span className="rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: dayTone(selectedRecord).bg, color: dayTone(selectedRecord).text }}>
                  {Number(selectedRecord.late_minutes ?? 0) > 0 ? `Late by ${selectedRecord.late_minutes} minutes` : String(selectedRecord.status) === "ABSENT" ? "Absent" : "Present"}
                </span>
              ) : <span className="rounded-full bg-[#F7F7FB] px-2.5 py-1 text-[10px] text-muted-foreground">No record</span>}
            </div>
            {selectedRecord ? (
              <div className="mb-3 grid grid-cols-2 gap-3.5 border-t pt-3 text-xs sm:grid-cols-4">
                <div><p className="text-muted-foreground">Clock in</p><p className="mt-0.5 font-medium text-slate-950">{formatTime(selectedRecord.first_clock_in)}</p></div>
                <div><p className="text-muted-foreground">Clock out</p><p className="mt-0.5 font-medium text-slate-950">{formatTime(selectedRecord.last_clock_out)}</p></div>
                <div><p className="text-muted-foreground">Hours worked</p><p className="mt-0.5 text-slate-950">{selectedRecord.total_work_minutes ? `${Math.floor(Number(selectedRecord.total_work_minutes) / 60)}h ${Number(selectedRecord.total_work_minutes) % 60}m` : "—"}</p></div>
                <div><p className="text-muted-foreground">Source</p><p className="mt-0.5 text-slate-950">{selectedRecord.source ? String(selectedRecord.source).replace(/_/g, " ") : "—"}</p></div>
              </div>
            ) : <p className="mb-3 text-xs text-muted-foreground">No attendance record was logged for this day.</p>}

            {selectedCorrection && correctionTone(String(selectedCorrection.status)) ? (
              <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: "#E7E7F1" }}>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-[7px] w-[7px] rounded-full" style={{ background: correctionTone(String(selectedCorrection.status))!.dot }} />
                  <p className="text-[10px] font-medium" style={{ color: correctionTone(String(selectedCorrection.status))!.text }}>{correctionTone(String(selectedCorrection.status))!.label}</p>
                </div>
                {String(selectedCorrection.status) === "PENDING" ? null : (
                  <Button size="sm" variant="outline" onClick={() => setCorrectionOpen(selectedDate)}>Request correction</Button>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: "#E7E7F1" }}>
                <p className="text-[9px] text-muted-foreground">Notice something wrong with this record?</p>
                <Button size="sm" onClick={() => setCorrectionOpen(selectedDate)}>Request correction for this day</Button>
              </div>
            )}
          </Panel>
        ) : null}
      </div>

      {correctionOpen ? (
        <CorrectionDialog
          date={correctionOpen}
          existing={recordsByDate.get(correctionOpen)}
          onClose={() => setCorrectionOpen(null)}
          onSaved={async () => { setCorrectionOpen(null); alerts.showSuccess("Correction requested", "Your attendance admin will review this request."); await load(); }}
        />
      ) : null}
    </PageShell>
  );
}

function CorrectionDialog({ date, existing, onClose, onSaved }: { date: string; existing?: Row; onClose: () => void; onSaved: () => Promise<void> }) {
  const { token } = useAuth();
  const [clockIn, setClockIn] = useState(existing?.first_clock_in ? formatTime(existing.first_clock_in) : "09:00");
  const [clockOut, setClockOut] = useState(existing?.last_clock_out ? formatTime(existing.last_clock_out) : "17:00");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!token || !reason.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.createSelfServiceAttendanceCorrection(token, {
        attendance_date: date,
        requested_clock_in: `${date}T${clockIn}:00.000Z`,
        requested_clock_out: `${date}T${clockOut}:00.000Z`,
        reason: reason.trim()
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to submit correction.");
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
            <div className="col-span-2 space-y-1.5"><Label>Reason *</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why does this day need correcting?" /></div>
          </div>
          <p className="mt-3 text-[10px] text-muted-foreground">This submits a request for your attendance admin to review.</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} disabled={!reason.trim()} onClick={() => void submit()}>Submit request</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
