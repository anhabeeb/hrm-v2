import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavRail } from "../components/ui/route-nav-rail";
import { EmptyState } from "../components/ui/empty-state";
import { ExportMenu } from "../components/export/ExportMenu";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import { LEAVE_NAV_ITEMS } from "./leaveNav";
import type { Employee } from "../types/employees";
import type { LeaveBalance, LeaveType } from "../types/leave";
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

interface EmployeeBalanceRow {
  employee: Employee;
  balances: LeaveBalance[];
}

export function LeaveBalancesPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<EmployeeBalanceRow[]>([]);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("all");
  const [locationId, setLocationId] = useState("all");
  const [leaveTypeId, setLeaveTypeId] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [employeeResult, typeResult, deptResult, locResult] = await Promise.all([
        api.listEmployees(token, { limit: 300, offset: 0 }),
        api.listLeaveTypes(token),
        api.listDepartments(token),
        api.listLocations(token)
      ]);
      const activeEmployees = employeeResult.employees.filter((e) => !e.archived_at);
      const balanceResults = await Promise.all(
        activeEmployees.map((employee) => api.getEmployeeLeaveBalances(token, employee.id).then((res) => res.balances).catch(() => []))
      );
      setRows(activeEmployees.map((employee, i) => ({ employee, balances: balanceResults[i] })));
      setTypes(typeResult.leave_types);
      setDepartments(deptResult.departments);
      setLocations(locResult.locations);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load leave balances.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const filtered = useMemo(() => {
    return rows
      .filter((row) => !search.trim() || row.employee.full_name.toLowerCase().includes(search.trim().toLowerCase()) || row.employee.employee_no.toLowerCase().includes(search.trim().toLowerCase()))
      .filter((row) => departmentId === "all" || row.employee.primary_department_id === departmentId)
      .filter((row) => locationId === "all" || row.employee.primary_location_id === locationId)
      .filter((row) => leaveTypeId === "all" || row.balances.some((b) => b.leave_type_id === leaveTypeId));
  }, [rows, search, departmentId, locationId, leaveTypeId]);

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={LEAVE_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-slate-950">Balances</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Leave balances across the team, {new Date().getFullYear()} cycle</p>
            </div>
            <ExportMenu
              variant="plain"
              moduleName="Leave balances"
              rows={filtered.flatMap((row) => row.balances.map((b) => ({ employee_no: row.employee.employee_no, employee_name: row.employee.full_name, leave_type: b.leave_type_name, opening_balance: b.opening_balance, used_days: b.used_days, pending_days: b.pending_days, closing_balance: b.closing_balance })))}
              columns={["employee_no", "employee_name", "leave_type", "opening_balance", "used_days", "pending_days", "closing_balance"]}
            />
          </div>

          <Panel className="flex flex-col gap-2.5 p-3">
            <div className="flex flex-wrap items-center gap-3.5">
              <div className="min-w-[160px] flex-1 rounded-md bg-[#F7F7FB] px-3 py-1.5 text-xs text-muted-foreground">
                <input className="w-full bg-transparent outline-none placeholder:text-muted-foreground" placeholder="Search employee" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <select className="bg-transparent text-xs text-muted-foreground outline-none" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="all">Department</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <select className="bg-transparent text-xs text-muted-foreground outline-none" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <option value="all">Outlet/location</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <select className="bg-transparent text-xs text-muted-foreground outline-none" value={leaveTypeId} onChange={(e) => setLeaveTypeId(e.target.value)}>
                <option value="all">Leave type</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button type="button" onClick={() => setMoreOpen((v) => !v)} className="ml-auto flex items-center gap-1.5 rounded-md border border-[#D3D3E3] px-2.5 py-1.5 text-xs text-muted-foreground">
                More filters
              </button>
            </div>
            {moreOpen ? (
              <p className="border-t border-[#E7E7F1] pt-2.5 text-xs text-muted-foreground">No additional filters — use Requests for approval-status or date-range filtering.</p>
            ) : null}
          </Panel>

          {error ? <Panel className="p-4 text-sm text-[#A32D2D]">{error}</Panel> : null}

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : filtered.length ? (
            <div className="flex flex-col gap-2">
              {filtered.map(({ employee, balances }) => {
                const color = colorFor(employee.full_name);
                const isOpen = expanded === employee.id;
                const shown = leaveTypeId === "all" ? balances.slice(0, isOpen ? undefined : 2) : balances.filter((b) => b.leave_type_id === leaveTypeId);
                return (
                  <Panel key={employee.id} className="p-3">
                    <div className="flex cursor-pointer items-center gap-3.5" onClick={() => setExpanded(isOpen ? null : employee.id)}>
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-medium" style={{ background: color.bg, color: color.text }}>{initialsOf(employee.full_name)}</div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-slate-950">{employee.full_name}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{employee.department_name ?? "No department"}</p>
                      </div>
                      <div className="flex gap-4">
                        {shown.length ? shown.map((b) => {
                          const entitlement = b.opening_balance + b.accrued_days + b.carried_forward_days + b.adjusted_days;
                          const used = b.used_days + b.pending_days;
                          const isLow = entitlement > 0 && entitlement - used <= 1;
                          return (
                            <div key={b.id} className="text-center">
                              <p className="text-xs font-medium" style={{ color: isLow ? "#A32D2D" : "#14162B" }}>{used}/{Math.max(entitlement, used)}</p>
                              <p className="text-[9px] text-[#9A9DB0]">{b.leave_type_name}</p>
                            </div>
                          );
                        }) : <p className="text-[10px] text-muted-foreground">No balances recorded</p>}
                      </div>
                      <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
                    </div>
                    {isOpen && balances.length > 2 ? (
                      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#E7E7F1] pt-3 sm:grid-cols-4">
                        {balances.map((b) => (
                          <div key={b.id} className="rounded-md bg-[#F7F7FB] p-2 text-center">
                            <p className="text-xs font-medium text-slate-950">{b.used_days}/{Math.max(b.opening_balance + b.accrued_days + b.carried_forward_days + b.adjusted_days, b.used_days)}</p>
                            <p className="mt-0.5 text-[9px] text-muted-foreground">{b.leave_type_name}</p>
                            <p className="mt-1 text-[9px] text-[#9A9DB0]">{b.pending_days > 0 ? `${b.pending_days} pending` : `${b.closing_balance} left`}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </Panel>
                );
              })}
            </div>
          ) : (
            <Panel><EmptyState title="No employees found" description="Adjust filters to see leave balances." /></Panel>
          )}
        </div>
      </div>
    </PageShell>
  );
}
