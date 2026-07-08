import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageShell } from "../../components/ui/page-shell";
import { Panel } from "../../components/ui/panel";
import { useAuth } from "../../hooks/useAuth";
import { ApiError, api } from "../../lib/api";

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

export function SelfServiceRosterPage() {
  const { token } = useAuth();
  const [weekStart, setWeekStart] = useState(isoDate(mondayOf(new Date())));
  const [weekEnd, setWeekEnd] = useState("");
  const [assignments, setAssignments] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const today = isoDate(new Date());

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await api.getSelfServiceRosterWeek(token!, { week_start_date: weekStart });
        if (cancelled) return;
        setWeekEnd(String(result.week_end_date));
        setAssignments(asRows(result.assignments));
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Unable to load your roster.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [token, weekStart]);

  useEffect(() => {
    const days = weekDays(weekStart);
    setSelectedDate(days.includes(today) ? today : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  const byDate = useMemo(() => new Map(assignments.map((a) => [String(a.roster_date), a])), [assignments]);
  const days = useMemo(() => weekDays(weekStart), [weekStart]);
  const selected = selectedDate ? byDate.get(selectedDate) : undefined;

  if (loading) {
    return <PageShell constrained={false}><div className="flex flex-col gap-2">{Array.from({ length: 2 }).map((_, i) => <Panel key={i} className="h-24 animate-pulse" />)}</div></PageShell>;
  }
  if (error) {
    return <PageShell constrained={false}><Panel className="p-4 text-xs text-[#A32D2D]">{error}</Panel></PageShell>;
  }

  return (
    <PageShell constrained={false}>
      <div className="space-y-3.5">
        <div className="flex items-center gap-2.5">
          <button type="button" onClick={() => setWeekStart((w) => shiftWeek(w, -7))}><ChevronLeft className="h-4 w-4 text-muted-foreground" /></button>
          <p className="text-sm font-medium text-slate-950">{formatWeekLabel(weekStart, weekEnd || weekStart)}</p>
          <button type="button" onClick={() => setWeekStart((w) => shiftWeek(w, 7))}><ChevronRight className="h-4 w-4 text-muted-foreground" /></button>
        </div>

        <Panel className="p-4">
          <div className="grid grid-cols-7 gap-2">
            {days.map((date) => {
              const a = byDate.get(date);
              const status = text(a?.status, "");
              const off = isOffStatus(status);
              const start = a?.custom_start_time ?? a?.shift_start_time;
              const end = a?.custom_end_time ?? a?.shift_end_time;
              const isSelected = selectedDate === date;
              const dayLabel = new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" });
              const dayNum = Number(date.slice(8));
              const bg = off ? "#FCEBEB" : "#F7F7FB";
              const fg = off ? "#A32D2D" : "#14162B";
              const muted = off ? "#A32D2D" : "#6B6F86";
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => setSelectedDate(date)}
                  className="rounded-lg p-2 text-center"
                  style={{ background: bg, boxShadow: isSelected ? "0 0 0 1.5px #5B4FE9" : undefined }}
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
                </button>
              );
            })}
          </div>
        </Panel>

        {selected ? (
          <Panel className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-medium text-slate-950">{new Date(`${selectedDate}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}</p>
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
          </Panel>
        ) : selectedDate ? (
          <Panel className="p-4"><p className="text-xs text-muted-foreground">No roster assignment for this day.</p></Panel>
        ) : null}
      </div>
    </PageShell>
  );
}
