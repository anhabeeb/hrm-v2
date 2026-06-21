import { Archive, Eye, Pencil, Plus, Search, Settings2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { ChangeEmployeeStatusModal } from "../components/employee/ChangeEmployeeStatusModal";
import { EmployeeAvatar } from "../components/employee/EmployeeAvatar";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import type { Employee, EmployeeInput, EmployeeStatusSetting, EmployeeType, EmploymentType } from "../types/employees";
import type { OrganizationDepartment, OrganizationJobLevel, OrganizationLocation, OrganizationPosition } from "../types/organization";

const employeeTypes: EmployeeType[] = ["LOCAL", "FOREIGN", "OTHER"];
const employmentTypes: EmploymentType[] = ["FULL_TIME", "PART_TIME", "INTERN", "TEMPORARY", "CONTRACT"];

const emptyEmployee: EmployeeInput = {
  full_name: "",
  display_name: "",
  employee_no: "",
  gender: "",
  date_of_birth: "",
  nationality: "",
  employee_type: "LOCAL",
  employment_type: "FULL_TIME",
  status_id: "",
  primary_department_id: "",
  primary_position_id: "",
  primary_location_id: "",
  job_level_id: "",
  joining_date: "",
  confirmation_date: "",
  contract_start_date: "",
  contract_end_date: "",
  probation_end_date: "",
  reporting_manager_employee_id: "",
  payroll_included: true,
  roster_eligible: true,
  notes_summary: ""
};

function statusTone(key?: string) {
  if (key === "ACTIVE" || key === "ON_LEAVE") return "success";
  if (key === "DRAFT_ONBOARDING") return "warning";
  if (key === "ARCHIVED") return "neutral";
  return "danger";
}

export function EmployeesPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [statuses, setStatuses] = useState<EmployeeStatusSetting[]>([]);
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [positions, setPositions] = useState<OrganizationPosition[]>([]);
  const [jobLevels, setJobLevels] = useState<OrganizationJobLevel[]>([]);
  const [search, setSearch] = useState("");
  const [statusId, setStatusId] = useState("all");
  const [departmentId, setDepartmentId] = useState("all");
  const [locationId, setLocationId] = useState("all");
  const [positionId, setPositionId] = useState("all");
  const [levelId, setLevelId] = useState("all");
  const [employeeType, setEmployeeType] = useState("all");
  const [employmentType, setEmploymentType] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mode: "create" | "edit"; employee?: Employee } | null>(null);
  const [statusModalEmployee, setStatusModalEmployee] = useState<Employee | null>(null);
  const [statusModalError, setStatusModalError] = useState<string | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);

  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("employees.view");
  const canCreate = permissions.has("employees.create");
  const canUpdate = permissions.has("employees.update");
  const canArchive = permissions.has("employees.archive");
  const canNumber = permissions.has("employees.numbering.manage");
  const canStatus = permissions.has("employees.status.manage");

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    setError(null);
    try {
      const [employeesResult, statusesResult, departmentsResult, locationsResult, positionsResult, levelsResult] = await Promise.all([
        api.listEmployees(token),
        api.listEmployeeStatuses(token),
        api.listDepartments(token),
        api.listLocations(token),
        api.listPositions(token),
        api.listJobLevels(token)
      ]);
      setEmployees(employeesResult.employees);
      setStatuses(statusesResult.statuses);
      setDepartments(departmentsResult.departments);
      setLocations(locationsResult.locations);
      setPositions(positionsResult.positions);
      setJobLevels(levelsResult.job_levels);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load employees.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, canView]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return employees.filter((employee) => {
      const matchesSearch =
        !needle ||
        employee.employee_no.toLowerCase().includes(needle) ||
        employee.full_name.toLowerCase().includes(needle) ||
        (employee.display_name ?? "").toLowerCase().includes(needle);
      return (
        matchesSearch &&
        (statusId === "all" || employee.status_id === statusId) &&
        (departmentId === "all" || employee.primary_department_id === departmentId) &&
        (locationId === "all" || employee.primary_location_id === locationId) &&
        (positionId === "all" || employee.primary_position_id === positionId) &&
        (levelId === "all" || employee.job_level_id === levelId) &&
        (employeeType === "all" || employee.employee_type === employeeType) &&
        (employmentType === "all" || employee.employment_type === employmentType)
      );
    });
  }, [departmentId, employeeType, employees, employmentType, levelId, locationId, positionId, search, statusId]);

  async function saveEmployee(input: EmployeeInput) {
    if (!token || !modal) return;
    try {
      if (modal.mode === "create") {
        await api.createEmployee(token, input);
      } else if (modal.employee) {
        await api.updateEmployee(token, modal.employee.id, input);
      }
      setModal(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to save employee.");
    }
  }

  async function archive(employee: Employee) {
    if (!token) return;
    const reason = window.prompt("Archive reason");
    if (!reason) return;
    try {
      await api.archiveEmployee(token, employee.id, reason);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to archive employee.");
    }
  }

  async function changeStatus(employee: Employee, input: { status_id: string; reason?: string | null; exit_date?: string | null; exit_reason?: string | null }) {
    if (!token) return;
    setStatusSaving(true);
    setStatusModalError(null);
    try {
      await api.changeEmployeeStatus(token, employee.id, input);
      setStatusModalEmployee(null);
      await load();
    } catch (err) {
      setStatusModalError(err instanceof ApiError ? err.message : "Unable to change employee status.");
    } finally {
      setStatusSaving(false);
    }
  }

  if (!canView) {
    return <Panel><EmptyState title="Employees unavailable" description="Your account needs employees.view permission." /></Panel>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-lg font-semibold">Employees</h1>
          <p className="text-sm text-muted-foreground">Employee 360 foundation with profile, status, onboarding, and job structure.</p>
        </div>
        <div className="flex gap-2">
          {(canStatus || canNumber) ? (
            <Link to="/employees/settings">
              <Button variant="outline" size="sm"><Settings2 className="h-4 w-4" /> Settings</Button>
            </Link>
          ) : null}
          {canCreate ? <Button size="sm" onClick={() => setModal({ mode: "create" })}><Plus className="h-4 w-4" /> New Employee</Button> : null}
        </div>
      </div>

      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <Panel className="overflow-hidden">
        <div className="border-b p-3">
          <div className="grid gap-2 lg:grid-cols-4 xl:grid-cols-8">
            <div className="relative lg:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search name or employee no" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <Select value={statusId} onChange={setStatusId}><option value="all">All statuses</option>{statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
            <Select value={departmentId} onChange={setDepartmentId}><option value="all">All departments</option>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
            <Select value={locationId} onChange={setLocationId}><option value="all">All locations</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select>
            <Select value={positionId} onChange={setPositionId}><option value="all">All positions</option>{positions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</Select>
            <Select value={levelId} onChange={setLevelId}><option value="all">All levels</option>{jobLevels.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}</Select>
            <Select value={employeeType} onChange={setEmployeeType}><option value="all">All types</option>{employeeTypes.map((t) => <option key={t} value={t}>{t}</option>)}</Select>
            <Select value={employmentType} onChange={setEmploymentType}><option value="all">All employment</option>{employmentTypes.map((t) => <option key={t} value={t}>{t}</option>)}</Select>
          </div>
        </div>
        {loading ? <EmptyState title="Loading employees" description="Fetching Employee 360 records." /> : filtered.length === 0 ? <EmptyState title="No employees found" description="Create a draft employee or adjust filters." /> : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Avatar</TableHead>
                  <TableHead>Employee No</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Outlet/Location</TableHead>
                  <TableHead>Job Level</TableHead>
                  <TableHead>Employee Type</TableHead>
                  <TableHead>Employment Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joining Date</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell><EmployeeAvatar employee={employee} token={token} size="sm" /></TableCell>
                    <TableCell className="font-mono text-xs">{employee.employee_no}</TableCell>
                    <TableCell className="font-medium">{employee.full_name}<div className="text-xs text-muted-foreground">{employee.display_name ?? "-"}</div></TableCell>
                    <TableCell>{employee.department_name ?? "-"}</TableCell>
                    <TableCell>{employee.position_title ?? "-"}</TableCell>
                    <TableCell>{employee.location_name ?? "-"}</TableCell>
                    <TableCell>{employee.job_level_name ?? "-"}</TableCell>
                    <TableCell>{employee.employee_type}</TableCell>
                    <TableCell>{employee.employment_type}</TableCell>
                    <TableCell><Badge tone={statusTone(employee.status_key)}>{employee.status_name ?? employee.status_key}</Badge></TableCell>
                    <TableCell>{employee.joining_date ?? "-"}</TableCell>
                    <TableCell><Badge tone={employee.user_linked ? "success" : "neutral"}>{employee.user_linked ? "Linked" : "Not linked"}</Badge></TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" title="View" onClick={() => navigate(`/employees/${employee.id}`)}><Eye className="h-4 w-4" /></Button>
                        {canUpdate ? <Button variant="ghost" size="icon" title="Edit" onClick={() => setModal({ mode: "edit", employee })}><Pencil className="h-4 w-4" /></Button> : null}
                        {canStatus ? <Button variant="ghost" size="icon" title="Change status" onClick={() => { setStatusModalError(null); setStatusModalEmployee(employee); }}><Settings2 className="h-4 w-4" /></Button> : null}
                        {canArchive ? <Button variant="ghost" size="icon" title="Archive" onClick={() => void archive(employee)}><Archive className="h-4 w-4" /></Button> : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>

      {modal ? (
        <EmployeeFormModal
          mode={modal.mode}
          employee={modal.employee}
          statuses={statuses}
          departments={departments}
          locations={locations}
          positions={positions}
          jobLevels={jobLevels}
          employees={employees}
          canNumber={canNumber}
          onClose={() => setModal(null)}
          onSave={(input) => void saveEmployee(input)}
        />
      ) : null}
      {statusModalEmployee ? (
        <ChangeEmployeeStatusModal
          employee={statusModalEmployee}
          statuses={statuses}
          error={statusModalError}
          saving={statusSaving}
          onClose={() => setStatusModalEmployee(null)}
          onSubmit={(input) => void changeStatus(statusModalEmployee, input)}
        />
      ) : null}
    </div>
  );
}

function Select({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 rounded-md border bg-white px-3 text-sm">{children}</select>;
}

function toInput(employee?: Employee): EmployeeInput {
  if (!employee) return emptyEmployee;
  return {
    employee_no: employee.employee_no,
    full_name: employee.full_name,
    display_name: employee.display_name ?? "",
    gender: employee.gender ?? "",
    date_of_birth: employee.date_of_birth ?? "",
    nationality: employee.nationality ?? "",
    employee_type: employee.employee_type,
    employment_type: employee.employment_type,
    status_id: employee.status_id,
    primary_department_id: employee.primary_department_id ?? "",
    primary_position_id: employee.primary_position_id ?? "",
    primary_location_id: employee.primary_location_id ?? "",
    job_level_id: employee.job_level_id ?? "",
    joining_date: employee.joining_date ?? "",
    confirmation_date: employee.confirmation_date ?? "",
    contract_start_date: employee.contract_start_date ?? "",
    contract_end_date: employee.contract_end_date ?? "",
    probation_end_date: employee.probation_end_date ?? "",
    reporting_manager_employee_id: employee.reporting_manager_employee_id ?? "",
    payroll_included: employee.payroll_included,
    roster_eligible: employee.roster_eligible,
    notes_summary: employee.notes_summary ?? ""
  };
}

function EmployeeFormModal(props: {
  mode: "create" | "edit";
  employee?: Employee;
  statuses: EmployeeStatusSetting[];
  departments: OrganizationDepartment[];
  locations: OrganizationLocation[];
  positions: OrganizationPosition[];
  jobLevels: OrganizationJobLevel[];
  employees: Employee[];
  canNumber: boolean;
  onClose: () => void;
  onSave: (input: EmployeeInput) => void;
}) {
  const [form, setForm] = useState<EmployeeInput>(() => toInput(props.employee));
  const update = (key: keyof EmployeeInput, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-lg border bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div><h2 className="text-sm font-semibold">{props.mode === "create" ? "Create employee" : "Edit employee"}</h2><p className="text-xs text-muted-foreground">Profile photo upload and linked user creation are reserved for later prompts.</p></div>
          <Button variant="ghost" size="sm" onClick={props.onClose}>Close</Button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Full name" value={form.full_name} onChange={(v) => update("full_name", v)} />
            <Field label="Display name" value={form.display_name ?? ""} onChange={(v) => update("display_name", v)} />
            <Field label="Employee No" value={form.employee_no ?? ""} disabled={!props.canNumber} placeholder={props.canNumber ? "Manual or blank for auto" : "Auto-generated"} onChange={(v) => update("employee_no", v)} />
            <Field label="Gender" value={form.gender ?? ""} onChange={(v) => update("gender", v)} />
            <Field label="Date of birth" type="date" value={form.date_of_birth ?? ""} onChange={(v) => update("date_of_birth", v)} />
            <Field label="Nationality" value={form.nationality ?? ""} onChange={(v) => update("nationality", v)} />
            <SelectField label="Employee type" value={form.employee_type} onChange={(v) => update("employee_type", v)}>{employeeTypes.map((t) => <option key={t} value={t}>{t}</option>)}</SelectField>
            <SelectField label="Employment type" value={form.employment_type} onChange={(v) => update("employment_type", v)}>{employmentTypes.map((t) => <option key={t} value={t}>{t}</option>)}</SelectField>
            <SelectField label="Status" value={form.status_id ?? ""} onChange={(v) => update("status_id", v)}><option value="">Draft / Onboarding default</option>{props.statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</SelectField>
            <SelectField label="Department" value={form.primary_department_id ?? ""} onChange={(v) => update("primary_department_id", v)}><option value="">None</option>{props.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</SelectField>
            <SelectField label="Position" value={form.primary_position_id ?? ""} onChange={(v) => update("primary_position_id", v)}><option value="">None</option>{props.positions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</SelectField>
            <SelectField label="Outlet/location" value={form.primary_location_id ?? ""} onChange={(v) => update("primary_location_id", v)}><option value="">None</option>{props.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</SelectField>
            <SelectField label="Job level" value={form.job_level_id ?? ""} onChange={(v) => update("job_level_id", v)}><option value="">None</option>{props.jobLevels.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}</SelectField>
            <SelectField label="Reporting manager" value={form.reporting_manager_employee_id ?? ""} onChange={(v) => update("reporting_manager_employee_id", v)}><option value="">None</option>{props.employees.filter((e) => e.id !== props.employee?.id).map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}</SelectField>
            <Field label="Joining date" type="date" value={form.joining_date ?? ""} onChange={(v) => update("joining_date", v)} />
            <Field label="Confirmation date" type="date" value={form.confirmation_date ?? ""} onChange={(v) => update("confirmation_date", v)} />
            <Field label="Contract start" type="date" value={form.contract_start_date ?? ""} onChange={(v) => update("contract_start_date", v)} />
            <Field label="Contract end" type="date" value={form.contract_end_date ?? ""} onChange={(v) => update("contract_end_date", v)} />
            <Field label="Probation end" type="date" value={form.probation_end_date ?? ""} onChange={(v) => update("probation_end_date", v)} />
            <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" checked={form.payroll_included} onChange={(e) => update("payroll_included", e.target.checked)} /> Payroll included</label>
            <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" checked={form.roster_eligible} onChange={(e) => update("roster_eligible", e.target.checked)} /> Roster eligible</label>
            <div className="md:col-span-3"><Field label="Notes summary" value={form.notes_summary ?? ""} onChange={(v) => update("notes_summary", v)} /></div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <Button variant="outline" size="sm" onClick={props.onClose}>Cancel</Button>
          <Button size="sm" onClick={() => props.onSave(form)}>Save</Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", disabled, placeholder }: { label: string; value: string; onChange: (value: string) => void; type?: string; disabled?: boolean; placeholder?: string }) {
  return <div className="space-y-1.5"><Label>{label}</Label><Input type={type} value={value} disabled={disabled} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} /></div>;
}

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label><select value={value} onChange={(event) => onChange(event.target.value)} className="h-9 w-full rounded-md border bg-white px-3 text-sm">{children}</select></div>;
}
