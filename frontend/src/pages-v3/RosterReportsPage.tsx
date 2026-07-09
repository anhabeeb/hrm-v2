import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { PageShell, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavSwitcher } from "../components/ui/route-nav-switcher";
import { Badge } from "../components/ui/badge";
import { EmptyState } from "../components/ui/empty-state";
import { ExportMenu } from "../components/export/ExportMenu";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";
import { ROSTER_NAV_ITEMS } from "./rosterNav";
import type { OrganizationDepartment, OrganizationLocation } from "../types/organization";
import type { RosterAssignmentStatus } from "../types/roster";

const STATUSES: RosterAssignmentStatus[] = ["UNASSIGNED", "DRAFT", "PUBLISHED", "CHANGED_AFTER_PUBLISH", "SCHEDULED", "DAY_OFF", "OFF", "LEAVE", "SICK_LEAVE", "LONG_LEAVE", "PUBLIC_HOLIDAY", "CONFLICT", "CANCELLED", "ABSENT_PLACEHOLDER"];

function addDaysIso(dateIso: string, days: number) {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function RosterReportsPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("roster.reports.view");
  const canExport = permissions.has("roster.reports.export");
  const [weekStart, setWeekStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("all");
  const [locationId, setLocationId] = useState("all");
  const [status, setStatus] = useState("all");
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [reports, setReports] = useState<Record<string, unknown>[]>([]);
  const [moduleDisabled, setModuleDisabled] = useState(false);
  const [loading, setLoading] = useState(true);

  const filters = useMemo(() => ({ week_start_date: weekStart, search, department_id: departmentId === "all" ? undefined : departmentId, location_id: locationId === "all" ? undefined : locationId, status: status === "all" ? undefined : status }), [weekStart, search, departmentId, locationId, status]);

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    setModuleDisabled(false);
    try {
      const [reportResult, departmentResult, locationResult] = await Promise.all([api.getRosterReports(token, filters), api.listDepartments(token), api.listLocations(token)]);
      setReports(reportResult.reports);
      setDepartments(departmentResult.departments);
      setLocations(locationResult.locations);
    } catch (err) {
      if (err && typeof err === "object" && "code" in err && (err.code === "ROSTER_MODULE_DISABLED" || err.code === "MODULE_DISABLED")) {
        setModuleDisabled(true);
        setReports([]);
      } else {
        alerts.showApiError(err, "Unable to load roster reports.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token, canView, filters]);

  if (!canView) {
    return (
      <PageShell constrained={false}>
        <div className="flex flex-col gap-3">
          <RouteNavSwitcher items={ROSTER_NAV_ITEMS} moduleLabel="Roster" />
          <div className="min-w-0 flex-1"><Panel><EmptyState title="Roster reports unavailable" description="Your account needs roster.reports.view permission." /></Panel></div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell constrained={false}>
      <div className="flex flex-col gap-3">
        <div className="min-w-0 flex-1 space-y-3">
          <div className="px-4 flex items-center justify-between">
              <div>
                <RouteNavSwitcher items={ROSTER_NAV_ITEMS} moduleLabel="Roster" />
                <p className="mt-0.5 text-xs text-muted-foreground">Weekly schedule summaries prepared for payroll and operations exports</p>
              </div>
              {canExport ? <ExportMenu variant="plain" moduleName="Roster reports" rows={reports} columns={["employee_no", "employee_name", "department_name", "location_name", "scheduled_days", "off_days", "leave_days", "unassigned_days", "scheduled_minutes"]} /> : null}
</div>

              <Panel className="shadow-none space-y-3 p-4">
          {moduleDisabled ? (
            <Panel><EmptyState title="Roster module is disabled" description="Enable roster from settings before viewing roster reports." /></Panel>
          ) : (
            <>
              <Panel className="flex flex-wrap items-center gap-3.5 p-3">
                <div className="min-w-[160px] flex-1 rounded-md bg-[#F7F7FB] px-3 py-1.5 text-xs text-muted-foreground">
                  <input className="w-full bg-transparent outline-none placeholder:text-muted-foreground" placeholder="Search employee" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <button type="button" onClick={() => setWeekStart((w) => addDaysIso(w, -7))}><ChevronDown className="h-3 w-3 rotate-90" /></button>
                  <span className="min-w-[130px] text-center font-medium text-slate-950">{weekStart} – {addDaysIso(weekStart, 6)}</span>
                  <button type="button" onClick={() => setWeekStart((w) => addDaysIso(w, 7))}><ChevronDown className="h-3 w-3 -rotate-90" /></button>
                </div>
                <SelectField className="w-auto bg-transparent text-xs text-muted-foreground" value={departmentId} onValueChange={setDepartmentId}>
                  <option value="all">All departments</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </SelectField>
                <SelectField className="w-auto bg-transparent text-xs text-muted-foreground" value={locationId} onValueChange={setLocationId}>
                  <option value="all">All locations</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </SelectField>
                <SelectField className="w-auto bg-transparent text-xs text-muted-foreground" value={status} onValueChange={setStatus}>
                  <option value="all">All statuses</option>
                  {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                </SelectField>
              </Panel>

              {loading ? (
                <div className="flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
              ) : reports.length ? (
                <div className="flex flex-col gap-2">
                  {reports.map((row, index) => (
                    <Panel key={String(row.employee_id ?? index)} className="flex items-center gap-3.5 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-slate-950">{String(row.employee_name ?? "-")}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{String(row.employee_no ?? "")}{row.department_name ? ` · ${String(row.department_name)}` : ""}{row.location_name ? ` · ${String(row.location_name)}` : ""} · {String(row.scheduled_minutes ?? 0)} scheduled minutes</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Badge tone="success">Scheduled {String(row.scheduled_days ?? 0)}</Badge>
                        <Badge tone="neutral">Off {String(row.off_days ?? 0)}</Badge>
                        <Badge tone="info">Leave {String(row.leave_days ?? 0)}</Badge>
                        <Badge tone="warning">Unassigned {String(row.unassigned_days ?? 0)}</Badge>
                      </div>
                    </Panel>
                  ))}
                </div>
              ) : (
                <Panel><EmptyState title="No roster report rows" description="Create assignments or adjust filters." /></Panel>
              )}
            </>
          )}

              </Panel>
        </div>
      </div>
    </PageShell>
  );
}
