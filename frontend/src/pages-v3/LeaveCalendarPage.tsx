import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavRail } from "../components/ui/route-nav-rail";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import { LEAVE_NAV_ITEMS } from "./leaveNav";
import type { LeaveRequest, LeaveType } from "../types/leave";
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

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function LeaveCalendarPage() {
  const { token } = useAuth();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [month, setMonth] = useState(currentMonth());
  const [departmentId, setDepartmentId] = useState("all");
  const [locationId, setLocationId] = useState("all");
  const [leaveTypeId, setLeaveTypeId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [requestResult, typeResult, deptResult, locResult] = await Promise.all([
        api.listLeaveRequests(token, {}),
        api.listLeaveTypes(token),
        api.listDepartments(token),
        api.listLocations(token)
      ]);
      setRequests(requestResult.requests.filter((r) => r.status === "APPROVED" || r.status === "PENDING_APPROVAL"));
      setTypes(typeResult.leave_types);
      setDepartments(deptResult.departments);
      setLocations(locResult.locations);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load leave calendar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const filteredRequests = useMemo(() => {
    return requests
      .filter((r) => departmentId === "all" || r.department_name === departments.find((d) => d.id === departmentId)?.name)
      .filter((r) => locationId === "all" || r.location_name === locations.find((l) => l.id === locationId)?.name)
      .filter((r) => leaveTypeId === "all" || r.leave_type_id === leaveTypeId);
  }, [requests, departmentId, locationId, leaveTypeId, departments, locations]);

  const byDay = useMemo(() => {
    const map = new Map<string, LeaveRequest[]>();
    for (const request of filteredRequests) {
      const start = new Date(`${request.start_date}T00:00:00Z`);
      const end = new Date(`${request.end_date}T00:00:00Z`);
      for (let d = new Date(start); d.getTime() <= end.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
        const iso = d.toISOString().slice(0, 10);
        if (!iso.startsWith(month)) continue;
        const list = map.get(iso) ?? [];
        list.push(request);
        map.set(iso, list);
      }
    }
    return map;
  }, [filteredRequests, month]);

  const cells = useMemo(() => daysInMonthGrid(month), [month]);
  const legendEntries = useMemo(() => {
    const seen = new Map<string, { name: string; typeName: string }>();
    for (const request of filteredRequests) {
      if (!request.employee_name || seen.has(request.employee_name)) continue;
      seen.set(request.employee_name, { name: request.employee_name, typeName: request.leave_type_name ?? "Leave" });
    }
    return Array.from(seen.values()).slice(0, 8);
  }, [filteredRequests]);

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={LEAVE_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-slate-950">Team calendar</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Who's on leave, at a glance</p>
            </div>
            <div className="flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs shadow-sm">
              <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))}><ChevronLeft className="h-3.5 w-3.5" /></button>
              <span className="min-w-[100px] text-center font-medium text-slate-950">{formatMonthLabel(month)}</span>
              <button type="button" onClick={() => setMonth((m) => shiftMonth(m, 1))}><ChevronRight className="h-3.5 w-3.5" /></button>
            </div>
          </div>

          <Panel className="flex flex-col gap-2.5 p-3">
            <div className="flex flex-wrap items-center gap-3.5">
              <select className="bg-transparent text-xs text-muted-foreground outline-none" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="all">All departments</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <select className="bg-transparent text-xs text-muted-foreground outline-none" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <option value="all">All outlets/locations</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <select className="bg-transparent text-xs text-muted-foreground outline-none" value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)}>
                <option value="all">All leave types</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button type="button" onClick={() => setMoreOpen((v) => !v)} className="ml-auto flex items-center gap-1.5 rounded-md border border-[#D3D3E3] px-2.5 py-1.5 text-xs text-muted-foreground">
                More filters
              </button>
            </div>
            {moreOpen ? (
              <p className="border-t border-[#E7E7F1] pt-2.5 text-xs text-muted-foreground">No additional filters for the calendar view — use Requests for date-range or status filtering.</p>
            ) : null}
          </Panel>

          {error ? <Panel className="p-4 text-sm text-[#A32D2D]">{error}</Panel> : null}

          <Panel className="p-3.5">
            <div className="mb-1.5 grid grid-cols-7 gap-1.5">
              {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((d) => (
                <span key={d} className="text-center text-[9px] font-medium text-[#9A9DB0]">{d}</span>
              ))}
            </div>
            {loading ? (
              <div className="grid grid-cols-7 gap-1.5">{Array.from({ length: 35 }).map((_, i) => <div key={i} className="h-[58px] animate-pulse rounded-lg bg-[#F7F7FB]" />)}</div>
            ) : (
              <div className="grid grid-cols-7 gap-1.5">
                {cells.map((iso, i) => {
                  if (!iso) return <div key={`empty-${i}`} />;
                  const dayNum = Number(iso.slice(8, 10));
                  const isToday = iso === todayIso();
                  const onLeave = byDay.get(iso) ?? [];
                  return (
                    <div
                      key={iso}
                      className="min-h-[58px] rounded-lg p-1.5"
                      style={isToday ? { background: "#EEEDFE", border: "1.5px solid #5B4FE9" } : { background: "#F7F7FB" }}
                    >
                      <p className="text-[10px]" style={{ color: isToday ? "#26215C" : onLeave.length ? "#14162B" : "#9A9DB0", fontWeight: isToday || onLeave.length ? 500 : 400 }}>{dayNum}</p>
                      {onLeave.length ? (
                        <div className="mt-1 flex flex-wrap gap-0.5">
                          {onLeave.slice(0, 4).map((request) => {
                            const color = colorFor(request.employee_name ?? "?");
                            return (
                              <div key={request.id} title={`${request.employee_name} · ${request.leave_type_name}`} className="grid h-4 w-4 place-items-center rounded-full text-[7px] font-medium" style={{ background: color.bg, color: color.text }}>
                                {initialsOf(request.employee_name ?? "?")}
                              </div>
                            );
                          })}
                          {onLeave.length > 4 ? <span className="text-[7px] text-muted-foreground">+{onLeave.length - 4}</span> : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          {legendEntries.length ? (
            <div className="flex flex-wrap gap-3.5 text-[10px] text-muted-foreground">
              {legendEntries.map((entry) => {
                const color = colorFor(entry.name);
                return (
                  <span key={entry.name} className="flex items-center gap-1.5">
                    <span className="inline-block h-4 w-4 rounded-full" style={{ background: color.bg }} />
                    {entry.name} · {entry.typeName}
                  </span>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </PageShell>
  );
}
