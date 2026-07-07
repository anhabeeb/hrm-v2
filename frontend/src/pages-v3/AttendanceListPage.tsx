import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, RefreshCw, SlidersHorizontal } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { ExportMenu } from "../components/export/ExportMenu";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { humanizeTechnicalLabel } from "../lib/displayLabels";
import { cn } from "../lib/utils";
import type { AttendanceRecord } from "../types/attendance";
import type { Employee } from "../types/employees";

const AVATAR_COLOR_PALETTE = [
  { bg: "#E6F1FB", text: "#0C447C" },
  { bg: "#FAECE7", text: "#993C1D" },
  { bg: "#EAF3DE", text: "#27500A" },
  { bg: "#EEEDFE", text: "#534AB7" },
  { bg: "#FAEEDA", text: "#854F0B" },
  { bg: "#FCEBEB", text: "#A32D2D" }
];

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function formatMonthLabel(month: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

interface EmployeeAttendanceSummary {
  employee: Employee;
  present: number;
  late: number;
  absent: number;
}

export function AttendanceListPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [locations, setLocations] = useState<Array<{ id: string; name: string }>>([]);
  const [month, setMonth] = useState(currentMonth());
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("all");
  const [locationId, setLocationId] = useState("all");
  const [employmentType, setEmploymentType] = useState("all");
  const [missedPunchOnly, setMissedPunchOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [employeesResult, calendarResult, assignmentOptions] = await Promise.all([
        api.listEmployees(token, { limit: 500, offset: 0 }),
        api.getAttendanceCalendar(token, { month }),
        api.getEmployeeAssignmentOptions(token)
      ]);
      setEmployees(employeesResult.employees);
      setRecords(calendarResult.calendar);
      setDepartments(assignmentOptions.departments);
      setLocations(assignmentOptions.locations);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load attendance.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, month]);

  const summaries = useMemo<EmployeeAttendanceSummary[]>(() => {
    const byEmployee = new Map<string, AttendanceRecord[]>();
    for (const record of records) {
      if (!record.employee_id) continue;
      const list = byEmployee.get(record.employee_id) ?? [];
      list.push(record);
      byEmployee.set(record.employee_id, list);
    }
    return employees
      .filter((e) => !e.archived_at)
      .filter((e) => !search.trim() || e.full_name.toLowerCase().includes(search.trim().toLowerCase()) || e.employee_no.toLowerCase().includes(search.trim().toLowerCase()))
      .filter((e) => departmentId === "all" || e.primary_department_id === departmentId)
      .filter((e) => locationId === "all" || e.primary_location_id === locationId)
      .filter((e) => employmentType === "all" || e.employment_type === employmentType)
      .map((employee) => {
        const rows = byEmployee.get(employee.id) ?? [];
        const present = rows.filter((r) => ["PRESENT", "HALF_DAY", "EARLY_LEAVE"].includes(r.status) && !(r.late_minutes && r.late_minutes > 0)).length;
        const late = rows.filter((r) => (r.late_minutes ?? 0) > 0).length;
        const absent = rows.filter((r) => r.status === "ABSENT").length;
        return { employee, present, late, absent, missedPunch: rows.some((r) => Number(r.missed_punch) === 1) };
      })
      .filter((row) => !missedPunchOnly || row.missedPunch);
  }, [employees, records, search, departmentId, locationId, employmentType, missedPunchOnly]);

  return (
    <PageShell constrained={false}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-medium text-slate-950">Attendance</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Click an employee to open their attendance calendar</p>
          </div>
          <ExportMenu variant="plain" moduleName="Attendance" rows={summaries.map((s) => ({ employee_no: s.employee.employee_no, full_name: s.employee.full_name, present: s.present, late: s.late, absent: s.absent }))} columns={["employee_no", "full_name", "present", "late", "absent"]} />
        </div>

        <Panel className="flex flex-wrap items-center gap-3.5 p-3">
          <div className="min-w-[160px] flex-1 rounded-md bg-[#F7F7FB] px-3 py-1.5 text-xs text-muted-foreground">
            <input className="w-full bg-transparent outline-none placeholder:text-muted-foreground" placeholder="Search employee" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))}><ChevronDown className="h-3 w-3 rotate-90" /></button>
            <span className="min-w-[92px] text-center font-medium text-slate-950">{formatMonthLabel(month)}</span>
            <button type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))}><ChevronDown className="h-3 w-3 -rotate-90" /></button>
          </div>
          <select className="bg-transparent text-xs text-muted-foreground outline-none" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            <option value="all">All departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select className="bg-transparent text-xs text-muted-foreground outline-none" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="all">All locations</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select className="bg-transparent text-xs text-muted-foreground outline-none" value={employmentType} onChange={(e) => setEmploymentType(e.target.value)}>
            <option value="all">Employment type</option>
            {["FULL_TIME", "PART_TIME", "INTERN", "TEMPORARY", "CONTRACT"].map((t) => <option key={t} value={t}>{humanizeTechnicalLabel(t)}</option>)}
          </select>
          <button type="button" onClick={() => setMissedPunchOnly((v) => !v)} className={cn("inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs", missedPunchOnly ? "border-primary text-primary" : "border-[#D3D3E3] text-muted-foreground")}>
            <SlidersHorizontal className="h-3 w-3" /> Missed punches
          </button>
          <button type="button" onClick={() => { setSearch(""); setDepartmentId("all"); setLocationId("all"); setEmploymentType("all"); setMissedPunchOnly(false); setMonth(currentMonth()); }} className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-slate-900">
            <RefreshCw className="h-3 w-3" /> Reset
          </button>
        </Panel>

        {error ? <Panel className="p-4 text-sm text-[#A32D2D]">{error}</Panel> : null}

        {loading ? (
          <div className="flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
        ) : summaries.length ? (
          <div className="flex flex-col gap-2">
            {summaries.map(({ employee, present, late, absent }) => {
              const color = AVATAR_COLOR_PALETTE[employee.full_name.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % AVATAR_COLOR_PALETTE.length];
              return (
                <Panel key={employee.id} className="flex cursor-pointer items-center gap-3.5 p-3 transition hover:-translate-y-0.5 hover:shadow-md" onClick={() => navigate(`/v3-preview/attendance/${employee.id}?month=${month}`)}>
                  <div className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full text-xs font-medium" style={{ background: color.bg, color: color.text }}>
                    {initialsOf(employee.full_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-950">{employee.full_name}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{employee.department_name ?? "No department"} · {employee.location_name ?? "No location"}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2.5">
                    <span className="rounded-full bg-[#EAF3DE] px-2.5 py-1 text-[10px] text-[#27500A]">{present} present</span>
                    <span className="rounded-full bg-[#FAEEDA] px-2.5 py-1 text-[10px] text-[#854F0B]">{late} late</span>
                    <span className="rounded-full bg-[#FCEBEB] px-2.5 py-1 text-[10px] text-[#A32D2D]">{absent} absent</span>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Panel>
              );
            })}
          </div>
        ) : (
          <Panel><EmptyState title="No employees found" description="Adjust filters or check back once attendance data is recorded." /></Panel>
        )}
      </div>
    </PageShell>
  );
}
