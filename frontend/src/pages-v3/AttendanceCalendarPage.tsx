import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavSwitcher } from "../components/ui/route-nav-switcher";
import { Input } from "../components/ui/input";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { humanizeTechnicalLabel } from "../lib/displayLabels";
import { ATTENDANCE_NAV_ITEMS } from "./attendanceNav";
import type { AttendanceRecord } from "../types/attendance";

function tone(status: string) {
  if (status === "PRESENT") return { bg: "#EAF3DE", text: "#27500A" };
  if (["LATE", "HALF_DAY", "PENDING_CORRECTION"].includes(status)) return { bg: "#FAEEDA", text: "#854F0B" };
  if (status === "ABSENT") return { bg: "#FCEBEB", text: "#A32D2D" };
  return { bg: "#F7F7FB", text: "#6B6F86" };
}

export function AttendanceCalendarPage() {
  const { token } = useAuth();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const defaultDate = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [dateFrom, setDateFrom] = useState(defaultDate);
  const [dateTo, setDateTo] = useState(defaultDate);

  async function load() {
    if (!token) return;
    setLoading(true);
    const res = await api.getAttendanceCalendar(token, { date_from: dateFrom, date_to: dateTo }).catch(() => ({ calendar: [] }));
    setRecords(res.calendar);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [token, dateFrom, dateTo]);

  return (
    <PageShell constrained={false}>
      <div className="flex flex-col gap-3">
        <div className="min-w-0 flex-1 space-y-3">
            <div className="px-4">
                <RouteNavSwitcher items={ATTENDANCE_NAV_ITEMS} moduleLabel="Attendance" />
                <p className="mt-0.5 text-xs text-muted-foreground">Company-wide attendance by date range</p>
            </div>

              <Panel className="shadow-none space-y-3 p-4">
          <div className="flex items-center gap-2">
            <Input className="h-8 w-36 text-xs" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <Input className="h-8 w-36 text-xs" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : records.length ? (
            <div className="flex flex-col gap-2">
              {records.map((record) => (
                <Panel key={record.id} className="flex items-center gap-3.5 p-3">
                  <div className="min-w-0 flex-1">
                    <Link to={`/v3-preview/attendance/${record.employee_id}`} className="text-xs font-medium text-slate-950 hover:underline">{record.employee_name ?? "-"}</Link>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{record.employee_no}{record.department_name ? ` · ${record.department_name}` : ""}{record.location_name ? ` · ${record.location_name}` : ""}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{record.attendance_date} · {record.first_clock_in ? new Date(record.first_clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"} / {record.last_clock_out ? new Date(record.last_clock_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"} · {record.total_work_minutes ?? 0} min</p>
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: tone(record.status).bg, color: tone(record.status).text }}>{humanizeTechnicalLabel(record.status)}</span>
                  {record.missed_punch ? <span className="shrink-0 rounded-full bg-[#FAEEDA] px-2.5 py-1 text-[10px] font-medium text-[#854F0B]">Missed punch</span> : null}
                </Panel>
              ))}
            </div>
          ) : (
            <Panel><EmptyState title="No calendar records found" description="Create attendance records or adjust the date range." /></Panel>
          )}

              </Panel>
        </div>
      </div>
    </PageShell>
  );
}
