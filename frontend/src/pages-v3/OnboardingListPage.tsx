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
import type { OnboardingCase } from "../types/lifecycle";
import type { OrganizationDepartment, OrganizationLocation, OrganizationPosition } from "../types/organization";

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

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysFromToday(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function stage(caseRow: OnboardingCase): "ACTIVATED" | "BLOCKED" | "IN_PROGRESS" {
  if (caseRow.onboarding_status === "ACTIVATED" || caseRow.activation_status === "ACTIVATED") return "ACTIVATED";
  if (caseRow.onboarding_status === "BLOCKED" || caseRow.activation_status === "NOT_READY") return "BLOCKED";
  return "IN_PROGRESS";
}

function progressOf(caseRow: OnboardingCase) {
  const statuses = Object.values(caseRow.setup_statuses ?? {});
  const total = statuses.length || 1;
  const complete = statuses.filter((s) => s === "COMPLETE" || s === "NOT_REQUIRED").length;
  return { complete, total: statuses.length ? total : 0 };
}

export function OnboardingListPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const alerts = useAlert();
  const permissions = new Set(user?.permissions ?? []);
  const canCreate = permissions.has("onboarding.cases.manage");

  const [cases, setCases] = useState<OnboardingCase[]>([]);
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("all");
  const [locationId, setLocationId] = useState("all");
  const [status, setStatus] = useState("all");
  const [moreOpen, setMoreOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [caseResult, deptResult, locResult] = await Promise.all([
        api.listOnboardingCases(token, {}),
        api.listDepartments(token),
        api.listLocations(token)
      ]);
      setCases(caseResult.cases);
      setDepartments(deptResult.departments);
      setLocations(locResult.locations);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load onboarding cases.");
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
      .filter((c) => departmentId === "all" || c.primary_department_id === departmentId)
      .filter((c) => locationId === "all" || c.primary_location_id === locationId)
      .filter((c) => status === "all" || stage(c) === status)
      .sort((a, b) => (a.planned_start_date ?? "").localeCompare(b.planned_start_date ?? ""));
  }, [cases, search, departmentId, locationId, status]);

  const inProgress = cases.filter((c) => stage(c) === "IN_PROGRESS").length;
  const blocked = cases.filter((c) => stage(c) === "BLOCKED").length;
  const completingThisWeek = cases.filter((c) => stage(c) !== "ACTIVATED" && c.due_date && c.due_date >= todayIso() && c.due_date <= daysFromToday(7)).length;
  const completedThisMonth = cases.filter((c) => c.activated_at && c.activated_at.slice(0, 7) === todayIso().slice(0, 7)).length;

  return (
    <PageShell constrained={false}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-medium text-slate-950">Onboarding</p>
            <p className="mt-0.5 text-xs text-muted-foreground">New hires in progress</p>
          </div>
          {canCreate ? <Button size="sm" onClick={() => setStartOpen(true)}><Plus className="h-4 w-4" /> Start onboarding</Button> : null}
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Panel className="p-3"><p className="text-[10px] text-muted-foreground">In progress</p><p className="mt-1 text-lg font-medium text-slate-950">{inProgress}</p></Panel>
          <Panel className="p-3"><p className="text-[10px] text-muted-foreground">Blocked</p><p className="mt-1 text-lg font-medium text-[#A32D2D]">{blocked}</p></Panel>
          <Panel className="p-3"><p className="text-[10px] text-muted-foreground">Completing this week</p><p className="mt-1 text-lg font-medium text-[#854F0B]">{completingThisWeek}</p></Panel>
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
            <select className="bg-transparent text-xs text-muted-foreground outline-none" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">Status</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="BLOCKED">Blocked</option>
              <option value="ACTIVATED">Activated</option>
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
              const progress = progressOf(caseRow);
              const rowStage = stage(caseRow);
              const stageTone = rowStage === "BLOCKED" ? { bg: "#FCEBEB", text: "#A32D2D" } : rowStage === "ACTIVATED" ? { bg: "#EAF3DE", text: "#27500A" } : { bg: "#FAEEDA", text: "#854F0B" };
              const pct = progress.total ? Math.round((progress.complete / progress.total) * 100) : 0;
              return (
                <Panel key={caseRow.id} className="flex cursor-pointer items-center gap-3.5 p-3 transition hover:-translate-y-0.5 hover:shadow-md" onClick={() => navigate(`/v3-preview/onboarding/${caseRow.id}`)}>
                  <div className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full text-xs font-medium" style={{ background: color.bg, color: color.text }}>{initialsOf(name)}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-950">{name}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{caseRow.position_name ?? "—"} · {caseRow.department_name ?? "—"} · Starts {caseRow.planned_start_date ?? "—"}</p>
                  </div>
                  {progress.total ? (
                    <div className="w-20 shrink-0">
                      <div className="h-[5px] overflow-hidden rounded-full bg-[#E7E7F1]"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: rowStage === "BLOCKED" ? "#A32D2D" : "#5B4FE9" }} /></div>
                      <p className="mt-0.5 text-right text-[9px] text-muted-foreground">{progress.complete}/{progress.total} tasks</p>
                    </div>
                  ) : null}
                  <span className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: stageTone.bg, color: stageTone.text }}>{humanizeTechnicalLabel(rowStage)}</span>
                </Panel>
              );
            })}
          </div>
        ) : (
          <Panel><EmptyState title="No onboarding cases found" description="Adjust filters or start onboarding a new hire." /></Panel>
        )}
      </div>

      {startOpen ? <StartOnboardingModal onClose={() => setStartOpen(false)} onCreated={(caseId) => { setStartOpen(false); navigate(`/v3-preview/onboarding/${caseId}`); }} alerts={alerts} onRefresh={load} /> : null}
    </PageShell>
  );
}

function StartOnboardingModal({ onClose, onCreated, alerts, onRefresh }: { onClose: () => void; onCreated: (caseId: string) => void; alerts: ReturnType<typeof useAlert>; onRefresh: () => void }) {
  const { token } = useAuth();
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [positions, setPositions] = useState<OrganizationPosition[]>([]);
  const [jobLevels, setJobLevels] = useState<Array<{ id: string; name: string }>>([]);
  const [reportingManagers, setReportingManagers] = useState<Array<{ id: string; full_name: string }>>([]);
  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [nationality, setNationality] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [positionId, setPositionId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [jobLevelId, setJobLevelId] = useState("");
  const [reportingManagerId, setReportingManagerId] = useState("");
  const [employmentType, setEmploymentType] = useState<"FULL_TIME" | "PART_TIME" | "INTERN" | "TEMPORARY" | "CONTRACT">("FULL_TIME");
  const [startDate, setStartDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.getEmployeeAssignmentOptions(token).then((res) => {
      setDepartments(res.departments);
      setLocations(res.locations);
      setPositions(res.positions);
      setJobLevels(res.job_levels);
      setReportingManagers(res.reporting_managers as unknown as Array<{ id: string; full_name: string }>);
    });
  }, [token]);

  function selectPosition(id: string) {
    setPositionId(id);
    const level = positions.find((p) => p.id === id)?.level_id;
    if (level) setJobLevelId(level);
  }

  async function submit() {
    if (!token || !fullName.trim() || !departmentId || !positionId || !locationId || !jobLevelId || !startDate) return;
    setSaving(true);
    setError(null);
    try {
      const created = await api.createEmployee(token, {
        full_name: fullName.trim(),
        date_of_birth: dateOfBirth || null,
        nationality: nationality || null,
        employee_type: "LOCAL",
        employment_type: employmentType,
        primary_department_id: departmentId,
        primary_position_id: positionId,
        primary_location_id: locationId,
        job_level_id: jobLevelId,
        reporting_manager_employee_id: reportingManagerId || null,
        joining_date: startDate,
        payroll_included: true,
        roster_eligible: true
      });
      const caseResult = await api.createEmployeeOnboardingCase(token, created.employee.id);
      alerts.showSuccess("Onboarding started", `${fullName.trim()}'s onboarding case was created.`);
      onRefresh();
      onCreated(caseResult.case_id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to start onboarding.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent size="md">
        <DialogHeader><DialogTitle>Start onboarding</DialogTitle></DialogHeader>
        <DialogBody>
          {error ? <p className="mb-3 text-xs text-[#A32D2D]">{error}</p> : null}
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-xs font-medium text-slate-950">Basic information</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5"><Label>Full name</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Ada Lovelace" /></div>
                <div className="space-y-1.5"><Label>Date of birth</Label><Input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Nationality</Label><Input value={nationality} onChange={(e) => setNationality(e.target.value)} placeholder="e.g. Maldivian" /></div>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-slate-950">Employment details</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Department</Label>
                  <SelectField value={departmentId} onValueChange={setDepartmentId}>
                    <option value="">Select department</option>
                    {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </SelectField>
                </div>
                <div className="space-y-1.5">
                  <Label>Position</Label>
                  <SelectField value={positionId} onValueChange={selectPosition}>
                    <option value="">Select position</option>
                    {positions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </SelectField>
                </div>
                <div className="space-y-1.5">
                  <Label>Outlet/location</Label>
                  <SelectField value={locationId} onValueChange={setLocationId}>
                    <option value="">Select outlet</option>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </SelectField>
                </div>
                <div className="space-y-1.5">
                  <Label>Job level</Label>
                  <SelectField value={jobLevelId} onValueChange={setJobLevelId}>
                    <option value="">Select job level</option>
                    {jobLevels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </SelectField>
                </div>
                <div className="space-y-1.5">
                  <Label>Reporting manager (optional)</Label>
                  <SelectField value={reportingManagerId} onValueChange={setReportingManagerId}>
                    <option value="">Select manager</option>
                    {reportingManagers.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                  </SelectField>
                </div>
                <div className="space-y-1.5">
                  <Label>Employment type</Label>
                  <SelectField value={employmentType} onValueChange={(v) => setEmploymentType(v as typeof employmentType)}>
                    {(["FULL_TIME", "PART_TIME", "INTERN", "TEMPORARY", "CONTRACT"] as const).map((t) => <option key={t} value={t}>{humanizeTechnicalLabel(t)}</option>)}
                  </SelectField>
                </div>
                <div className="space-y-1.5"><Label>Start date</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
              </div>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} disabled={!fullName.trim() || !departmentId || !positionId || !locationId || !jobLevelId || !startDate} onClick={() => void submit()}>Start onboarding</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
