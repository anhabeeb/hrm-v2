import { useEffect, useMemo, useState } from "react";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavSwitcher } from "../components/ui/route-nav-switcher";
import { Input } from "../components/ui/input";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { ATTENDANCE_NAV_ITEMS } from "./attendanceNav";

type Row = Record<string, unknown>;

export function AttendanceReportsPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const defaultDate = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [dateFrom, setDateFrom] = useState(defaultDate);
  const [dateTo, setDateTo] = useState(defaultDate);

  async function load() {
    if (!token) return;
    setLoading(true);
    const res = await api.getAttendanceReports(token, { date_from: dateFrom, date_to: dateTo }).catch(() => ({ reports: [] }));
    setRows(res.reports);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [token, dateFrom, dateTo]);

  return (
    <PageShell constrained={false}>
      <div className="flex flex-col gap-3">
        <div className="min-w-0 flex-1 space-y-3">
            <div className="px-4">
                <RouteNavSwitcher items={ATTENDANCE_NAV_ITEMS} moduleLabel="Attendance" />
                <p className="mt-0.5 text-xs text-muted-foreground">Attendance summary exports prepared for payroll reconciliation</p>
            </div>

              <Panel className="shadow-none space-y-3 p-4">
          <div className="flex items-center gap-2">
            <Input className="h-8 w-36 text-xs" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <Input className="h-8 w-36 text-xs" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : rows.length ? (
            <div className="flex flex-col gap-2">
              {rows.map((row, i) => (
                <Panel key={String(row.employee_id ?? i)} className="flex items-center gap-3.5 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-950">{String(row.employee_name ?? "-")}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{String(row.employee_no ?? "")}{row.department_name ? ` · ${row.department_name}` : ""}{row.location_name ? ` · ${row.location_name}` : ""} · {String(row.total_work_minutes ?? 0)} min worked</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#EAF3DE] px-2 py-0.5 text-[10px] font-medium text-[#27500A]">Present {String(row.present_days ?? 0)}</span>
                  <span className="shrink-0 rounded-full bg-[#FCEBEB] px-2 py-0.5 text-[10px] font-medium text-[#A32D2D]">Absent {String(row.absent_days ?? 0)}</span>
                  <span className="shrink-0 rounded-full bg-[#FAEEDA] px-2 py-0.5 text-[10px] font-medium text-[#854F0B]">Late {String(row.late_days ?? 0)}</span>
                  <span className="shrink-0 rounded-full bg-[#F7F7FB] px-2 py-0.5 text-[10px] text-muted-foreground">Missed {String(row.missed_punch_days ?? 0)}</span>
                </Panel>
              ))}
            </div>
          ) : (
            <Panel><EmptyState title="No report rows found" description="Create attendance records or adjust the date range." /></Panel>
          )}

              </Panel>
        </div>
      </div>
    </PageShell>
  );
}
