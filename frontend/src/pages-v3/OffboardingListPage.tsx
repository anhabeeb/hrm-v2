import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageShell, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../components/ui/dialog";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { ApiError, api } from "../lib/api";
import { humanizeTechnicalLabel } from "../lib/displayLabels";
import type { OffboardingCase } from "../types/lifecycle";
import type { Employee } from "../types/employees";
import type { OrganizationDepartment, OrganizationLocation } from "../types/organization";

const AVATAR_COLOR_PALETTE = [
  { bg: "#E6F1FB", text: "#0C447C" },
  { bg: "#FBEAF0", text: "#72243E" },
  { bg: "#FAEEDA", text: "#854F0B" },
  { bg: "#EAF3DE", text: "#27500A" },
  { bg: "#EEEDFE", text: "#534AB7" },
  { bg: "#FCEBEB", text: "#A32D2D" }
];

const EXIT_TYPES = ["RESIGNED", "TERMINATED", "END_OF_CONTRACT", "ABSCONDED", "RETIRED", "DECEASED", "OTHER"] as const;

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`.toUpperCase();
}

function colorFor(name: string) {
  const hash = name.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_COLOR_PALETTE[hash % AVATAR_COLOR_PALETTE.length];
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysFromToday(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function stageOf(caseRow: OffboardingCase) {
  if (caseRow.offboarding_status === "COMPLETED") return "COMPLETED";
  if (caseRow.offboarding_status === "CANCELLED") return "CANCELLED";
  if (caseRow.offboarding_status === "WAITING_FOR_CLEARANCE") return "AWAITING_CLEARANCE";
  return "IN_PROGRESS";
}

function stageTone(stage: string) {
  if (stage === "COMPLETED") return { bg: "#EAF3DE", text: "#27500A" };
  if (stage === "AWAITING_CLEARANCE") return { bg: "#FAEEDA", text: "#854F0B" };
  if (stage === "CANCELLED") return { bg: "#F7F7FB", text: "#6B6F86" };
  return { bg: "#E6F1FB", text: "#0C447C" };
}

export function OffboardingListPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const alerts = useAlert();
  const permissions = new Set(user?.permissions ?? []);
  const canCreate = permissions.has("offboarding.cases.manage");

  const [cases, setCases] = useState<OffboardingCase[]>([]);
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("all");
  const [locationId, setLocationId] = useState("all");
  const [exitReason, setExitReason] = useState("all");
  const [moreOpen, setMoreOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [caseResult, deptResult, locResult] = await Promise.all([
        api.listOffboardingCases(token, {}),
        api.listDepartments(token),
        api.listLocations(token)
      ]);
      setCases(caseResult.cases);
      setDepartments(deptResult.departments);
      setLocations(locResult.locations);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load offboarding cases.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const filtered = useMemo(() => {
    return cases
      .filter((c) => !search.trim() || (c.employee_name ?? c.employee_name_snapshot ?? "").toLowerCase().includes(search.trim().toLowerCase()))
      .filter((c) => departmentId === "all" || String((c as unknown as Record<string, unknown>).primary_department_id ?? "") === departmentId)
      .filter((c) => locationId === "all" || String((c as unknown as Record<string, unknown>).primary_location_id ?? "") === locationId)
      .filter((c) => exitReason === "all" || c.exit_type === exitReason)
      .sort((a, b) => (a.last_working_day ?? "").localeCompare(b.last_working_day ?? ""));
  }, [cases, search, departmentId, locationId, exitReason]);

  const inProgress = cases.filter((c) => stageOf(c) === "IN_PROGRESS").length;
  const awaitingClearance = cases.filter((c) => stageOf(c) === "AWAITING_CLEARANCE").length;
  const lastDayThisWeek = cases.filter((c) => stageOf(c) !== "COMPLETED" && c.last_working_day >= todayIso() && c.last_working_day <= daysFromToday(7)).length;
  const completedThisMonth = cases.filter((c) => c.finalized_at && c.finalized_at.slice(0, 7) === todayIso().slice(0, 7)).length;

  return (
    <PageShell constrained={false}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-medium text-slate-950">Offboarding</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Employees exiting, and their clearance progress</p>
          </div>
          {canCreate ? <Button size="sm" onClick={() => setStartOpen(true)}><Plus className="h-4 w-4" /> Start offboarding</Button> : null}
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Panel className="p-3"><p className="text-[10px] text-muted-foreground">In progress</p><p className="mt-1 text-lg font-medium text-slate-950">{inProgress}</p></Panel>
          <Panel className="p-3"><p className="text-[10px] text-muted-foreground">Awaiting clearance</p><p className="mt-1 text-lg font-medium text-[#854F0B]">{awaitingClearance}</p></Panel>
          <Panel className="p-3"><p className="text-[10px] text-muted-foreground">Last day this week</p><p className="mt-1 text-lg font-medium text-[#A32D2D]">{lastDayThisWeek}</p></Panel>
          <Panel className="p-3"><p className="text-[10px] text-muted-foreground">Completed this month</p><p className="mt-1 text-lg font-medium text-slate-950">{completedThisMonth}</p></Panel>
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
            <select className="bg-transparent text-xs text-muted-foreground outline-none" value={exitReason} onChange={(e) => setExitReason(e.target.value)}>
              <option value="all">Exit reason</option>
              {EXIT_TYPES.map((t) => <option key={t} value={t}>{humanizeTechnicalLabel(t)}</option>)}
            </select>
            <button type="button" onClick={() => setMoreOpen((v) => !v)} className="ml-auto flex items-center gap-1.5 rounded-md border border-[#D3D3E3] px-2.5 py-1.5 text-xs text-muted-foreground">
              More filters
            </button>
          </div>
          {moreOpen ? (
            <p className="border-t border-[#E7E7F1] pt-2.5 text-xs text-muted-foreground">No additional filters available yet.</p>
          ) : null}
        </Panel>

        {error ? <Panel className="p-4 text-sm text-[#A32D2D]">{error}</Panel> : null}

        {loading ? (
          <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
        ) : filtered.length ? (
          <div className="flex flex-col gap-2">
            {filtered.map((caseRow) => {
              const name = caseRow.employee_name ?? caseRow.employee_name_snapshot ?? "Unknown";
              const color = colorFor(name);
              const stage = stageOf(caseRow);
              const tone = stageTone(stage);
              return (
                <Panel key={caseRow.id} className="flex cursor-pointer items-center gap-3.5 p-3 transition hover:-translate-y-0.5 hover:shadow-md" onClick={() => navigate(`/v3-preview/offboarding/${caseRow.id}`)}>
                  <div className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full text-xs font-medium" style={{ background: color.bg, color: color.text }}>{initialsOf(name)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-950">{name}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{caseRow.department_name ?? "—"} · {humanizeTechnicalLabel(caseRow.exit_type)} · Last day {caseRow.last_working_day}</p>
                  </div>
                  <span className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: tone.bg, color: tone.text }}>{humanizeTechnicalLabel(stage)}</span>
                </Panel>
              );
            })}
          </div>
        ) : (
          <Panel><EmptyState title="No offboarding cases found" description="Adjust filters or start offboarding an exiting employee." /></Panel>
        )}
      </div>

      {startOpen ? <StartOffboardingModal onClose={() => setStartOpen(false)} onCreated={(caseId) => { setStartOpen(false); navigate(`/v3-preview/offboarding/${caseId}`); }} alerts={alerts} onRefresh={load} /> : null}
    </PageShell>
  );
}

function StartOffboardingModal({ onClose, onCreated, alerts, onRefresh }: { onClose: () => void; onCreated: (caseId: string) => void; alerts: ReturnType<typeof useAlert>; onRefresh: () => void }) {
  const { token } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [exitType, setExitType] = useState<typeof EXIT_TYPES[number]>("RESIGNED");
  const [lastWorkingDay, setLastWorkingDay] = useState("");
  const [exitReason, setExitReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.listEmployees(token, { limit: 300, offset: 0 }).then((res) => {
      const active = res.employees.filter((e) => !e.archived_at);
      setEmployees(active);
      setEmployeeId(active[0]?.id ?? "");
    });
  }, [token]);

  async function submit() {
    if (!token || !employeeId || !lastWorkingDay) return;
    setSaving(true);
    setError(null);
    try {
      const result = await api.createEmployeeOffboardingCase(token, employeeId, { exit_type: exitType, last_working_day: lastWorkingDay, exit_reason: exitReason || null });
      alerts.showSuccess("Offboarding started", "The offboarding case was created.");
      onRefresh();
      onCreated(result.case_id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to start offboarding.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="sm">
        <DialogHeader><DialogTitle>Start offboarding</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Employee</Label>
              <SelectField value={employeeId} onValueChange={setEmployeeId}>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name} · {e.employee_no}</option>)}
              </SelectField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Exit type</Label>
                <SelectField value={exitType} onValueChange={(v) => setExitType(v as typeof exitType)}>
                  {EXIT_TYPES.map((t) => <option key={t} value={t}>{humanizeTechnicalLabel(t)}</option>)}
                </SelectField>
              </div>
              <div className="space-y-1.5"><Label>Last working day</Label><Input type="date" value={lastWorkingDay} onChange={(e) => setLastWorkingDay(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>Exit reason (optional)</Label><Input value={exitReason} onChange={(e) => setExitReason(e.target.value)} placeholder="Notes about the exit" /></div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} disabled={!employeeId || !lastWorkingDay} onClick={() => void submit()}>Start offboarding</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
