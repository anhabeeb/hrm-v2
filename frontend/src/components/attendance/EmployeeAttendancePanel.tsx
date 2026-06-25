import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, api } from "../../lib/api";
import type { AttendanceCorrection, AttendanceRawLog, AttendanceRecord, EmployeeBiometricMapping } from "../../types/attendance";
import type { Employee } from "../../types/employees";
import { AttendanceCorrectionModal } from "./AttendanceCorrectionModal";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { Input } from "../ui/input";
import { Panel } from "../ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";

function tone(status: string) {
  if (status === "PRESENT" || status === "APPROVED") return "success" as const;
  if (status === "LATE" || status === "HALF_DAY" || status === "PENDING_CORRECTION" || status === "SUBMITTED") return "warning" as const;
  if (status === "ABSENT" || status === "REJECTED") return "danger" as const;
  return "neutral" as const;
}

export function EmployeeAttendancePanel({ token, employee, permissions }: { token: string; employee: Employee; permissions: Set<string> }) {
  const canCorrect = permissions.has("attendance.corrections.create") || permissions.has("attendance.correct") || permissions.has("attendance.corrections.manage") || permissions.has("attendance.manage");
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [calendar, setCalendar] = useState<AttendanceRecord[]>([]);
  const [corrections, setCorrections] = useState<AttendanceCorrection[]>([]);
  const [rawLogs, setRawLogs] = useState<AttendanceRawLog[]>([]);
  const [deviceSummary, setDeviceSummary] = useState<{ mappings: EmployeeBiometricMapping[]; raw_log_status_counts: Record<string, unknown>[]; recent_raw_logs: AttendanceRawLog[]; unmatched_related_count: number } | null>(null);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [summaryResult, rawLogResult, calendarResult, deviceResult] = await Promise.all([
        api.getEmployeeAttendanceSummary(token, employee.id),
        api.listEmployeeAttendanceRawLogs(token, employee.id),
        api.getEmployeeAttendanceCalendar(token, employee.id, { month }),
        api.getEmployeeAttendanceDeviceSummary(token, employee.id).catch(() => null)
      ]);
      setSummary(summaryResult.summary);
      setRecords(summaryResult.records);
      setCalendar(calendarResult.calendar);
      setCorrections(summaryResult.corrections);
      setRawLogs(rawLogResult.logs);
      setDeviceSummary(deviceResult);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load employee attendance.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, employee.id, month]);

  const byDate = new Map(calendar.map((record) => [record.attendance_date, record]));
  const selectedRecord = byDate.get(selectedDate) ?? records.find((record) => record.attendance_date === selectedDate) ?? null;
  const selectedRawLogs = rawLogs.filter((log) => log.punch_time.slice(0, 10) === selectedDate);
  const selectedCorrections = corrections.filter((correction) => correction.attendance_date === selectedDate);
  const weeks = buildMonth(month);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="text-base font-semibold">Attendance</h2><p className="text-sm text-muted-foreground">Daily records, raw logs, and correction requests for this employee.</p></div>
        <div className="flex gap-2"><Link to={`/attendance?employee_id=${employee.id}`}><Button variant="outline" size="sm">Open module</Button></Link>{canCorrect ? <Button size="sm" onClick={() => setCorrectionOpen(true)}><Plus className="h-4 w-4" /> Request correction</Button> : null}</div>
      </div>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <div className="grid gap-3 md:grid-cols-5">
        {["present", "absent", "late", "missed_punch", "pending_corrections"].map((key) => <Panel key={key} className="p-3"><div className="text-xs uppercase text-muted-foreground">{key.replace(/_/g, " ")}</div><div className="mt-1 text-xl font-semibold">{summary[key] ?? 0}</div></Panel>)}
      </div>
      <Panel className="overflow-hidden">
        <div className="border-b px-3 py-2"><h3 className="text-sm font-semibold">Attendance Device Summary</h3><p className="text-xs text-muted-foreground">Biometric mapping, recent imported logs, and unmatched-log signal for this employee.</p></div>
        <div className="grid gap-3 p-3 lg:grid-cols-3">
          <div className="rounded-md border p-3"><div className="text-xs uppercase text-muted-foreground">Active mappings</div><div className="mt-1 text-xl font-semibold">{deviceSummary?.mappings?.length ?? 0}</div></div>
          <div className="rounded-md border p-3"><div className="text-xs uppercase text-muted-foreground">Recent raw logs</div><div className="mt-1 text-xl font-semibold">{deviceSummary?.recent_raw_logs?.length ?? 0}</div></div>
          <div className="rounded-md border p-3"><div className="text-xs uppercase text-muted-foreground">Unmatched related</div><div className="mt-1 text-xl font-semibold">{deviceSummary?.unmatched_related_count ?? 0}</div></div>
        </div>
        <SmallRows title="Biometric mappings" rows={(deviceSummary?.mappings ?? []).map((mapping) => ({ device: mapping.device_name ?? mapping.device_code ?? "Any device", biometric_id: mapping.biometric_user_id, external_code: mapping.external_employee_code ?? "-", status: mapping.status }))} columns={["device", "biometric_id", "external_code", "status"]} />
      </Panel>
      <Panel className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
          <div><h3 className="text-sm font-semibold">Monthly Attendance / Payroll Calendar</h3><p className="text-xs text-muted-foreground">Approved leave appears when no attendance record exists for the day.</p></div>
          <Input className="w-40" type="month" value={month} onChange={(event) => { setMonth(event.target.value); setSelectedDate(`${event.target.value}-01`); }} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className="bg-muted/70"><tr>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <th key={day} className="h-9 border px-2 text-left text-xs font-semibold uppercase text-muted-foreground">{day}</th>)}</tr></thead>
            <tbody>
              {weeks.map((week, index) => <tr key={index}>{week.map((date, dayIndex) => {
                const record = date ? byDate.get(date) : null;
                const active = date === selectedDate;
                return (
                  <td key={date ?? `empty-${index}-${dayIndex}`} className={`h-28 w-[14.28%] border align-top ${active ? "bg-cyan-50" : "bg-white"}`}>
                    {date ? <button className="h-full w-full p-2 text-left hover:bg-muted/40" onClick={() => setSelectedDate(date)}>
                      <div className="flex items-center justify-between"><span className="font-mono text-xs">{date.slice(8)}</span>{record ? <Badge tone={tone(record.status)}>{record.status}</Badge> : <span className="text-xs text-muted-foreground">-</span>}</div>
                      {record ? <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        <div>{record.first_clock_in ? new Date(record.first_clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"} / {record.last_clock_out ? new Date(record.last_clock_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"}</div>
                        <div className="flex flex-wrap gap-1">{record.missed_punch ? <Badge tone="warning">Missed</Badge> : null}{Number(record.late_minutes ?? 0) > 0 ? <Badge tone="warning">Late</Badge> : null}{record.payroll_impact_json ? <Badge tone="info">Payroll</Badge> : null}</div>
                      </div> : null}
                    </button> : null}
                  </td>
                );
              })}</tr>)}
            </tbody>
          </table>
        </div>
        <div className="border-t p-3">
          <h4 className="text-sm font-semibold">Daily detail: {selectedDate}</h4>
          {selectedRecord ? <div className="mt-2 grid gap-2 text-sm md:grid-cols-4">
            <Detail label="Status" value={selectedRecord.status} />
            <Detail label="Clock in" value={selectedRecord.first_clock_in ? new Date(selectedRecord.first_clock_in).toLocaleString() : "-"} />
            <Detail label="Clock out" value={selectedRecord.last_clock_out ? new Date(selectedRecord.last_clock_out).toLocaleString() : "-"} />
            <Detail label="Total minutes" value={String(selectedRecord.total_work_minutes ?? 0)} />
            <Detail label="Late minutes" value={String(selectedRecord.late_minutes ?? 0)} />
            <Detail label="Early checkout" value={String(selectedRecord.early_checkout_minutes ?? 0)} />
            <Detail label="Missed punch" value={selectedRecord.missed_punch ? "Yes" : "No"} />
            <Detail label="Source" value={selectedRecord.source} />
            <Detail label="Payroll impact" value={selectedRecord.payroll_impact_json ?? "None"} wide />
            <Detail label="Notes" value={selectedRecord.notes ?? "-"} wide />
          </div> : <EmptyState title="No daily attendance record" description="Attendance, approved leave, or correction data for the selected day will appear here." />}
          <div className="mt-3 grid gap-3 xl:grid-cols-2">
            <SmallRows title="Raw logs for day" rows={selectedRawLogs.map((log) => ({ time: new Date(log.punch_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), type: log.punch_type ?? "UNKNOWN", device: log.device_name ?? log.device_code ?? "-", source: log.source }))} columns={["time", "type", "device", "source"]} />
            <SmallRows title="Corrections for day" rows={selectedCorrections.map((correction) => ({ requested: correction.requested_status ?? "-", status: correction.status, reason: correction.reason, reviewer: correction.reviewed_by_name ?? "-" }))} columns={["requested", "status", "reason", "reviewer"]} />
          </div>
        </div>
      </Panel>
      <Panel className="overflow-hidden">
        <div className="border-b px-3 py-2"><h3 className="text-sm font-semibold">Recent Records</h3></div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Status</TableHead><TableHead>Clock in/out</TableHead><TableHead>Work</TableHead><TableHead>Late/Early</TableHead><TableHead>Source</TableHead><TableHead>Payroll impact</TableHead></TableRow></TableHeader>
            <TableBody>{records.map((record) => <TableRow key={record.id}><TableCell>{record.attendance_date}</TableCell><TableCell><Badge tone={tone(record.status)}>{record.status}</Badge>{record.missed_punch ? <Badge tone="warning" className="ml-1">Missed punch</Badge> : null}</TableCell><TableCell>{record.first_clock_in ? new Date(record.first_clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"} / {record.last_clock_out ? new Date(record.last_clock_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"}</TableCell><TableCell>{record.total_work_minutes ?? 0} min</TableCell><TableCell>{record.late_minutes ?? 0} / {record.early_checkout_minutes ?? 0}</TableCell><TableCell>{record.source}</TableCell><TableCell className="max-w-72 truncate">{record.payroll_impact_json ?? "None"}</TableCell></TableRow>)}</TableBody>
          </Table>
        </div>
        {loading ? <EmptyState title="Loading attendance" description="Fetching attendance records." /> : records.length === 0 ? <EmptyState title="No attendance records" description="Attendance records will appear here after import or manual entry." /> : null}
      </Panel>
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel className="overflow-hidden">
          <div className="border-b px-3 py-2"><h3 className="text-sm font-semibold">Correction Requests</h3></div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Requested</TableHead><TableHead>Status</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader>
              <TableBody>{corrections.map((correction) => <TableRow key={correction.id}><TableCell>{correction.attendance_date}</TableCell><TableCell>{correction.requested_status ?? "-"} · {correction.requested_clock_in ? new Date(correction.requested_clock_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"} / {correction.requested_clock_out ? new Date(correction.requested_clock_out).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"}</TableCell><TableCell><Badge tone={tone(correction.status)}>{correction.status}</Badge></TableCell><TableCell className="max-w-56 truncate">{correction.reason}</TableCell></TableRow>)}</TableBody>
            </Table>
          </div>
          {!loading && corrections.length === 0 ? <EmptyState title="No corrections" description="Correction requests for this employee will appear here." /> : null}
        </Panel>
        <Panel className="overflow-hidden">
          <div className="border-b px-3 py-2"><h3 className="text-sm font-semibold">Raw Logs</h3></div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Punch time</TableHead><TableHead>Type</TableHead><TableHead>Device</TableHead><TableHead>Source</TableHead></TableRow></TableHeader>
              <TableBody>{rawLogs.slice(0, 10).map((log) => <TableRow key={log.id}><TableCell>{new Date(log.punch_time).toLocaleString()}</TableCell><TableCell>{log.punch_type ?? "UNKNOWN"}</TableCell><TableCell>{log.device_name ?? log.device_code ?? "-"}</TableCell><TableCell>{log.source}</TableCell></TableRow>)}</TableBody>
            </Table>
          </div>
          {!loading && rawLogs.length === 0 ? <EmptyState title="No raw logs" description="Device and imported punch logs will appear here." /> : null}
        </Panel>
      </div>
      {correctionOpen ? <AttendanceCorrectionModal token={token} employees={[employee]} employeeId={employee.id} onClose={() => setCorrectionOpen(false)} onSaved={load} /> : null}
    </div>
  );
}

function buildMonth(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(year, monthNumber - 1, 1);
  const last = new Date(year, monthNumber, 0);
  const cells: Array<string | null> = [];
  for (let i = 0; i < first.getDay(); i += 1) cells.push(null);
  for (let day = 1; day <= last.getDate(); day += 1) cells.push(`${month}-${String(day).padStart(2, "0")}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<string | null>> = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function Detail({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return <div className={`rounded-md border px-3 py-2 ${wide ? "md:col-span-2" : ""}`}><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 break-words">{value}</div></div>;
}

function SmallRows({ title, rows, columns }: { title: string; rows: Record<string, string>[]; columns: string[] }) {
  return <div className="rounded-md border"><div className="border-b px-3 py-2 text-sm font-semibold">{title}</div>{rows.length === 0 ? <EmptyState title="No records" description="Nothing linked to this date." /> : <div className="overflow-x-auto"><Table><TableHeader><TableRow>{columns.map((column) => <TableHead key={column}>{column}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.map((row, index) => <TableRow key={index}>{columns.map((column) => <TableCell key={column}>{row[column] ?? "-"}</TableCell>)}</TableRow>)}</TableBody></Table></div>}</div>;
}
