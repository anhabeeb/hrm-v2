import { Archive, Eye, Pencil, Plus, Settings2 } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge } from "../components/ui/badge";
import { useAlert } from "../components/alerts/useAlert";
import { ActionTextButton } from "../components/ui/action-button";
import { Button, RowActionButton } from "../components/ui/button";
import { ChangeEmployeeStatusModal } from "../components/employee/ChangeEmployeeStatusModal";
import { EmployeeIdentityCell } from "../components/employee/EmployeeIdentityCell";
import { ExportMenu } from "../components/export/ExportMenu";
import { FieldError } from "../components/forms/FieldError";
import { FormErrorSummary } from "../components/forms/FormErrorSummary";
import { OrganizationCascadeSelector } from "../components/organization/OrganizationCascadeSelector";
import {
  ActiveFilterChips,
  FilterResetButton,
  FilterSection,
  MoreFiltersSheet,
  StandardDateRangeFilter,
  StandardFilterBar,
  StandardSearchInput,
  StandardSelectFilter,
  useCascadingOrganizationFilters,
  type StandardDateRange
} from "../components/filters";
import { DataTableShell } from "../components/ui/data-table-shell";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { AlertBanner, CheckboxField, PageHeader, PageShell, SelectField, SelectField as UiSelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { StatusBadge } from "../components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import { focusFirstInvalidField, normalizeValidationIssues, useFormValidation, validateDateField, validateDateRange, validateEnumValue, validateMaxLength, validateRequiredFields, type ValidationIssue } from "../lib/form-validation";
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

function employeePrimaryRoute(employee: Employee) {
  const hasActiveOnboarding = Boolean(employee.active_onboarding_case_id && employee.active_activation_status !== "ACTIVATED" && employee.active_onboarding_status !== "CANCELLED");
  const isPreActivation = ["DRAFT", "DRAFT_ONBOARDING", "ONBOARDING", "NOT_ACTIVE"].includes(employee.status_key ?? "");
  if (hasActiveOnboarding) return `/onboarding/cases?case_id=${employee.active_onboarding_case_id}`;
  if (isPreActivation) return "/onboarding/cases";
  return `/employees/${employee.id}`;
}

export function EmployeesPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const alerts = useAlert();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [statuses, setStatuses] = useState<EmployeeStatusSetting[]>([]);
  const [departments, setDepartments] = useState<OrganizationDepartment[]>([]);
  const [locations, setLocations] = useState<OrganizationLocation[]>([]);
  const [positions, setPositions] = useState<OrganizationPosition[]>([]);
  const [jobLevels, setJobLevels] = useState<OrganizationJobLevel[]>([]);
  const [reportingManagers, setReportingManagers] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [statusId, setStatusId] = useState("all");
  const [departmentId, setDepartmentId] = useState("all");
  const [locationId, setLocationId] = useState("all");
  const [positionId, setPositionId] = useState("all");
  const [levelId, setLevelId] = useState("all");
  const [employeeType, setEmployeeType] = useState("all");
  const [employmentType, setEmploymentType] = useState("all");
  const [joinedDateRange, setJoinedDateRange] = useState<StandardDateRange>({});
  const [userLinked, setUserLinked] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mode: "create" | "edit"; employee?: Employee } | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Employee | null>(null);
  const [archiveReason, setArchiveReason] = useState("");
  const [statusModalEmployee, setStatusModalEmployee] = useState<Employee | null>(null);
  const [statusModalError, setStatusModalError] = useState<string | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);

  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("employees.view");
  const canCreate = permissions.has("employees.create");
  const canUpdate = permissions.has("employees.update");
  const canArchive = permissions.has("employees.archive");
  const canExport = permissions.has("reports.export") || permissions.has("employees.view");
  const canImport = permissions.has("data_import.upload") || permissions.has("data_import.manage");
  const canNumber = permissions.has("employees.numbering.manage");
  const canStatus = permissions.has("employees.status.manage");
  const { activeDepartments, filteredJobLevels, filteredPositions } = useCascadingOrganizationFilters({
    departments,
    jobLevels,
    positions,
    departmentId: departmentId === "all" ? "" : departmentId,
    jobLevelId: levelId === "all" ? "" : levelId,
    onInvalidSelection: (next) => {
      if (next.jobLevelId === "") setLevelId("all");
      if (next.positionId === "") setPositionId("all");
    }
  });

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    setError(null);
    try {
      const [employeesResult, statusesResult, assignmentOptions] = await Promise.all([
        api.listEmployees(token),
        api.listEmployeeStatuses(token),
        api.getEmployeeAssignmentOptions(token)
      ]);
      setEmployees(employeesResult.employees);
      setStatuses(statusesResult.statuses);
      setDepartments(assignmentOptions.departments);
      setLocations(assignmentOptions.locations);
      setPositions(assignmentOptions.positions);
      setJobLevels(assignmentOptions.job_levels);
      setReportingManagers(assignmentOptions.reporting_managers);
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
        (employmentType === "all" || employee.employment_type === employmentType) &&
        (userLinked === "all" || (userLinked === "linked" ? employee.user_linked : !employee.user_linked)) &&
        (!joinedDateRange.from || (employee.joining_date ?? "") >= joinedDateRange.from) &&
        (!joinedDateRange.to || (employee.joining_date ?? "") <= joinedDateRange.to)
      );
    });
  }, [departmentId, employeeType, employees, employmentType, joinedDateRange.from, joinedDateRange.to, levelId, locationId, positionId, search, statusId, userLinked]);

  function resetFilters() {
    setSearch("");
    setStatusId("all");
    setDepartmentId("all");
    setLocationId("all");
    setPositionId("all");
    setLevelId("all");
    setEmployeeType("all");
    setEmploymentType("all");
    setJoinedDateRange({});
    setUserLinked("all");
  }

  const activeChips = [
    search.trim() ? { key: "search", label: "Search", value: search.trim(), onRemove: () => setSearch("") } : null,
    statusId !== "all" ? { key: "status", label: "Status", value: statuses.find((status) => status.id === statusId)?.name ?? "Selected", onRemove: () => setStatusId("all") } : null,
    departmentId !== "all" ? { key: "department", label: "Department", value: departments.find((department) => department.id === departmentId)?.name ?? "Selected", onRemove: () => { setDepartmentId("all"); setLevelId("all"); setPositionId("all"); } } : null,
    levelId !== "all" ? { key: "level", label: "Job Level", value: jobLevels.find((level) => level.id === levelId)?.name ?? "Selected", onRemove: () => { setLevelId("all"); setPositionId("all"); } } : null,
    positionId !== "all" ? { key: "position", label: "Position", value: positions.find((position) => position.id === positionId)?.title ?? "Selected", onRemove: () => setPositionId("all") } : null,
    locationId !== "all" ? { key: "location", label: "Location", value: locations.find((location) => location.id === locationId)?.name ?? "Selected", onRemove: () => setLocationId("all") } : null,
    employeeType !== "all" ? { key: "employeeType", label: "Employee Type", value: employeeType, onRemove: () => setEmployeeType("all") } : null,
    employmentType !== "all" ? { key: "employmentType", label: "Employment", value: employmentType, onRemove: () => setEmploymentType("all") } : null,
    userLinked !== "all" ? { key: "userLinked", label: "User", value: userLinked === "linked" ? "Linked" : "Not linked", onRemove: () => setUserLinked("all") } : null,
    joinedDateRange.from || joinedDateRange.to ? { key: "joiningDate", label: "Joined", value: `${joinedDateRange.from || "Any"} - ${joinedDateRange.to || "Any"}`, onRemove: () => setJoinedDateRange({}) } : null
  ].filter(Boolean) as Array<{ key: string; label: string; value: ReactNode; onRemove: () => void }>;

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
      alerts.showSuccess(modal.mode === "create" ? "Employee created" : "Employee updated", modal.mode === "create" ? "The employee record was added." : "The employee record was saved.");
    } catch (err) {
      const issues = normalizeValidationIssues(err);
      if (issues.length) alerts.showValidationError(issues, "Employee form needs attention");
      else alerts.showApiError(err, "Employee save failed");
      setError(err instanceof ApiError ? err.message : "Unable to save employee.");
      throw err;
    }
  }

  async function archive(employee: Employee, reason: string) {
    if (!token) return;
    try {
      await api.archiveEmployee(token, employee.id, reason);
      setArchiveTarget(null);
      setArchiveReason("");
      await load();
      alerts.showSuccess("Employee archived", `${employee.full_name} was archived.`);
    } catch (err) {
      alerts.showApiError(err, "Employee archive failed");
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
      alerts.showSuccess("Employee status changed", `${employee.full_name} status was updated.`);
    } catch (err) {
      alerts.showApiError(err, "Employee status change failed");
      setStatusModalError(err instanceof ApiError ? err.message : "Unable to change employee status.");
    } finally {
      setStatusSaving(false);
    }
  }

  if (!canView) {
    return <PageShell><Panel><EmptyState title="Employees unavailable" description="Your account needs employees.view permission." /></Panel></PageShell>;
  }

  return (
    <PageShell constrained={false}>
      <PageHeader
        title="Employees"
        description="Employee 360 foundation with profile, status, onboarding, and job structure."
        actions={
          <>
          {(canStatus || canNumber) ? (
            <Link to="/employees/settings">
              <Button variant="outline" size="sm"><Settings2 className="h-4 w-4" /> Settings</Button>
            </Link>
          ) : null}
          {canImport ? <Link to="/settings/admin/imports"><ActionTextButton intent="import" size="sm">Import employees</ActionTextButton></Link> : null}
          {canExport ? <ExportMenu moduleName="Employees" rows={filtered as unknown as Record<string, unknown>[]} columns={["employee_no", "full_name", "employee_type", "employment_type", "status_key", "joining_date", "user_linked", "linked_user_email"]} filterSummary={activeChips.map((chip) => `${chip.label}: ${String(chip.value)}`)} /> : null}
          {canCreate ? <Button size="sm" onClick={() => setModal({ mode: "create" })}><Plus className="h-4 w-4" /> New Employee</Button> : null}
          </>
        }
      />

      {error ? <AlertBanner tone="danger"><strong>Unable to complete employee action.</strong> {error}</AlertBanner> : null}

      <div className="space-y-3">
        <StandardFilterBar
          search={<StandardSearchInput value={search} onDebouncedChange={setSearch} placeholder="Search employees..." />}
          reset={<FilterResetButton onReset={resetFilters} />}
          moreFilters={
            <MoreFiltersSheet onReset={resetFilters}>
              <FilterSection title="Organization">
                <StandardSelectFilter value={departmentId === "all" ? "" : departmentId} onValueChange={(value) => { setDepartmentId(value || "all"); setLevelId("all"); setPositionId("all"); }} allLabel="All departments" width="department" options={activeDepartments.map((department) => ({ value: department.id, label: department.name }))} />
                <StandardSelectFilter value={levelId === "all" ? "" : levelId} onValueChange={(value) => { setLevelId(value || "all"); setPositionId("all"); }} allLabel="All job levels" width="jobLevel" options={filteredJobLevels.map((level) => ({ value: level.id, label: level.name }))} />
                <StandardSelectFilter value={positionId === "all" ? "" : positionId} onValueChange={(value) => setPositionId(value || "all")} allLabel="All positions" width="position" options={filteredPositions.map((position) => ({ value: position.id, label: position.title }))} />
                <StandardSelectFilter value={locationId === "all" ? "" : locationId} onValueChange={(value) => setLocationId(value || "all")} allLabel="All locations" width="department" options={locations.filter((location) => location.is_active !== false).map((location) => ({ value: location.id, label: location.name }))} />
              </FilterSection>
              <FilterSection title="Employment">
                <StandardSelectFilter value={employeeType === "all" ? "" : employeeType} onValueChange={(value) => setEmployeeType(value || "all")} allLabel="All employee types" options={employeeTypes.map((type) => ({ value: type, label: type }))} />
                <StandardSelectFilter value={employmentType === "all" ? "" : employmentType} onValueChange={(value) => setEmploymentType(value || "all")} allLabel="All employment" options={employmentTypes.map((type) => ({ value: type, label: type }))} />
                <StandardDateRangeFilter value={joinedDateRange} onChange={setJoinedDateRange} label="Joined Date Range" />
              </FilterSection>
              <FilterSection title="Compliance">
                <StandardSelectFilter value={userLinked === "all" ? "" : userLinked} onValueChange={(value) => setUserLinked(value || "all")} allLabel="Any user link" options={[{ value: "linked", label: "Linked user" }, { value: "not_linked", label: "Not linked" }]} />
              </FilterSection>
            </MoreFiltersSheet>
          }
        >
          <StandardSelectFilter value={statusId === "all" ? "" : statusId} onValueChange={(value) => setStatusId(value || "all")} allLabel="All statuses" width="status" options={statuses.map((status) => ({ value: status.id, label: status.name }))} />
          <StandardSelectFilter value={departmentId === "all" ? "" : departmentId} onValueChange={(value) => { setDepartmentId(value || "all"); setLevelId("all"); setPositionId("all"); }} allLabel="All departments" width="department" options={activeDepartments.map((department) => ({ value: department.id, label: department.name }))} />
          <StandardSelectFilter value={levelId === "all" ? "" : levelId} onValueChange={(value) => { setLevelId(value || "all"); setPositionId("all"); }} allLabel="All job levels" width="jobLevel" options={filteredJobLevels.map((level) => ({ value: level.id, label: level.name }))} />
        </StandardFilterBar>
        <ActiveFilterChips chips={activeChips} />
        <DataTableShell loading={loading} empty={filtered.length === 0} emptyTitle="No employees found" emptyDescription="Create a draft employee or adjust filters.">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 z-10 min-w-[280px] bg-white">Employee</TableHead>
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
                    <TableCell className="sticky left-0 z-10 bg-white">
                      <EmployeeIdentityCell
                        employee={employee}
                        token={token}
                        employeeName={employee.full_name}
                        employeeNumber={employee.employee_no}
                        departmentName={employee.department_name}
                        locationName={employee.location_name}
                        status={employee.status_name ?? employee.status_key}
                        to={employeePrimaryRoute(employee)}
                      />
                    </TableCell>
                    <TableCell>{employee.department_name ?? "-"}</TableCell>
                    <TableCell>{employee.position_title ?? "-"}</TableCell>
                    <TableCell>{employee.location_name ?? "-"}</TableCell>
                    <TableCell>{employee.job_level_name ?? "-"}</TableCell>
                    <TableCell>{employee.employee_type}</TableCell>
                    <TableCell>{employee.employment_type}</TableCell>
                    <TableCell><StatusBadge value={employee.status_name ?? employee.status_key ?? "-"} /></TableCell>
                    <TableCell>{employee.joining_date ?? "-"}</TableCell>
                    <TableCell><Badge tone={employee.user_linked ? "success" : "neutral"}>{employee.user_linked ? "Linked" : "Not linked"}</Badge></TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <RowActionButton intent="view" title={employee.active_onboarding_case_id ? "Open onboarding case" : "View"} onClick={() => navigate(employeePrimaryRoute(employee))}><Eye className="h-4 w-4" /></RowActionButton>
                        {canUpdate ? <RowActionButton intent="edit" title="Edit" onClick={() => setModal({ mode: "edit", employee })}><Pencil className="h-4 w-4" /></RowActionButton> : null}
                        {canStatus ? <RowActionButton intent="neutral" title="Change status" onClick={() => { setStatusModalError(null); setStatusModalEmployee(employee); }}><Settings2 className="h-4 w-4" /></RowActionButton> : null}
                        {canArchive ? <RowActionButton intent="archive" title="Archive" onClick={() => setArchiveTarget(employee)}><Archive className="h-4 w-4" /></RowActionButton> : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
        </DataTableShell>
      </div>

      {modal ? (
        <EmployeeFormModal
          mode={modal.mode}
          employee={modal.employee}
          statuses={statuses}
          departments={departments}
          locations={locations}
          positions={positions}
          jobLevels={jobLevels}
          employees={reportingManagers}
          canNumber={canNumber}
          onClose={() => setModal(null)}
          onSave={saveEmployee}
        />
      ) : null}
      {archiveTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4">
          <div className="w-full max-w-md rounded-lg border bg-white p-4 shadow-xl">
            <h2 className="text-sm font-semibold">Archive employee</h2>
            <p className="mt-1 text-xs text-muted-foreground">Archive {archiveTarget.full_name}. Existing history is retained.</p>
            <Input className="mt-3" placeholder="Archive reason" value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setArchiveTarget(null); setArchiveReason(""); }}>Cancel</Button>
              <Button size="sm" disabled={!archiveReason.trim()} onClick={() => void archive(archiveTarget, archiveReason.trim())}>Archive</Button>
            </div>
          </div>
        </div>
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
    </PageShell>
  );
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

function validateEmployeeInputForm(form: EmployeeInput): ValidationIssue[] {
  return [
    ...validateRequiredFields(form as unknown as Record<string, unknown>, {
      full_name: "Full name",
      employee_type: "Employee type",
      employment_type: "Employment type"
    }),
    ...validateEnumValue(form.employee_type, "employee_type", "Employee type", employeeTypes),
    ...validateEnumValue(form.employment_type, "employment_type", "Employment type", employmentTypes),
    ...validateMaxLength(form.employee_no, "employee_no", "Employee number", 64),
    ...validateMaxLength(form.full_name, "full_name", "Full name", 200),
    ...validateMaxLength(form.display_name, "display_name", "Display name", 200),
    ...validateMaxLength(form.notes_summary, "notes_summary", "Notes summary", 1000),
    ...validateDateField(form.date_of_birth, "date_of_birth", "Date of birth", { allowFuture: false }),
    ...validateDateField(form.joining_date, "joining_date", "Joining date"),
    ...validateDateField(form.confirmation_date, "confirmation_date", "Confirmation date"),
    ...validateDateField(form.contract_start_date, "contract_start_date", "Contract start date"),
    ...validateDateField(form.contract_end_date, "contract_end_date", "Contract end date"),
    ...validateDateField(form.probation_end_date, "probation_end_date", "Probation end date"),
    ...validateDateRange({ start: form.contract_start_date, end: form.contract_end_date, startField: "contract_start_date", endField: "contract_end_date", label: "Contract end date" }),
    ...validateDateRange({ start: form.joining_date, end: form.probation_end_date, startField: "joining_date", endField: "probation_end_date", label: "Probation end date" }),
    ...validateDateRange({ start: form.joining_date, end: form.confirmation_date, startField: "joining_date", endField: "confirmation_date", label: "Confirmation date" })
  ];
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
  onSave: (input: EmployeeInput) => Promise<void>;
}) {
  const [form, setForm] = useState<EmployeeInput>(() => toInput(props.employee));
  const validation = useFormValidation();
  const alerts = useAlert();
  const [saving, setSaving] = useState(false);
  const update = (key: keyof EmployeeInput, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  const updateCascade = (next: { locationId?: string; departmentId?: string; jobLevelId?: string; positionId?: string }) => {
    setForm((current) => ({
      ...current,
      primary_location_id: next.locationId ?? "",
      primary_department_id: next.departmentId ?? "",
      job_level_id: next.jobLevelId ?? "",
      primary_position_id: next.positionId ?? ""
    }));
  };
  async function submit() {
    const issues = validateEmployeeInputForm(form);
    validation.setIssues(issues);
    if (issues.some((issue) => issue.severity === "error")) {
      alerts.showValidationError(issues, "Employee form needs attention");
      setTimeout(() => focusFirstInvalidField(issues), 0);
      return;
    }
    setSaving(true);
    try {
      await props.onSave(form);
    } catch (err) {
      const issuesFromApi = normalizeValidationIssues(err);
      if (issuesFromApi.length) {
        validation.setIssues(issuesFromApi);
        alerts.showValidationError(issuesFromApi, "Employee form cannot be saved");
        setTimeout(() => focusFirstInvalidField(issuesFromApi), 0);
      }
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-lg border bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div><h2 className="text-sm font-semibold">{props.mode === "create" ? "Create employee" : "Edit employee"}</h2><p className="text-xs text-muted-foreground">Profile photo is managed from Employee 360 after the employee record is saved.</p></div>
          <Button variant="ghost" size="sm" onClick={props.onClose}>Close</Button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-4">
          <FormErrorSummary issues={validation.issues} />
          <div className="grid gap-3 md:grid-cols-3">
            <Field field="full_name" label="Full name" value={form.full_name} issues={validation.fieldIssues("full_name")} onChange={(v) => update("full_name", v)} />
            <Field field="display_name" label="Display name" value={form.display_name ?? ""} issues={validation.fieldIssues("display_name")} onChange={(v) => update("display_name", v)} />
            <Field field="employee_no" label="Employee No" value={form.employee_no ?? ""} disabled={!props.canNumber} placeholder={props.canNumber ? "Manual or blank for auto" : "Auto-generated"} issues={validation.fieldIssues("employee_no")} onChange={(v) => update("employee_no", v)} />
            <Field label="Gender" value={form.gender ?? ""} onChange={(v) => update("gender", v)} />
            <Field field="date_of_birth" label="Date of birth" type="date" value={form.date_of_birth ?? ""} issues={validation.fieldIssues("date_of_birth")} onChange={(v) => update("date_of_birth", v)} />
            <Field label="Nationality" value={form.nationality ?? ""} onChange={(v) => update("nationality", v)} />
            <div className="space-y-1.5"><UiSelectField label="Employee type" value={form.employee_type} onValueChange={(v) => update("employee_type", v)}>{employeeTypes.map((t) => <option key={t} value={t}>{t}</option>)}</UiSelectField><FieldError issues={validation.fieldIssues("employee_type")} /></div>
            <div className="space-y-1.5"><UiSelectField label="Employment type" value={form.employment_type} onValueChange={(v) => update("employment_type", v)}>{employmentTypes.map((t) => <option key={t} value={t}>{t}</option>)}</UiSelectField><FieldError issues={validation.fieldIssues("employment_type")} /></div>
            <UiSelectField label="Status" value={form.status_id ?? ""} onValueChange={(v) => update("status_id", v)}><option value="">Draft / Onboarding default</option>{props.statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</UiSelectField>
            <div className="md:col-span-3">
              <OrganizationCascadeSelector
                includeLocation
                departments={props.departments}
                locations={props.locations}
                jobLevels={props.jobLevels}
                positions={props.positions}
                value={{
                  locationId: form.primary_location_id ?? "",
                  departmentId: form.primary_department_id ?? "",
                  jobLevelId: form.job_level_id ?? "",
                  positionId: form.primary_position_id ?? ""
                }}
                labels={{ departmentId: "Department", jobLevelId: "Job level", positionId: "Position", locationId: "Outlet/location" }}
                onChange={updateCascade}
              />
            </div>
            <UiSelectField label="Reporting manager" value={form.reporting_manager_employee_id ?? ""} onValueChange={(v) => update("reporting_manager_employee_id", v)}><option value="">None</option>{props.employees.filter((e) => e.id !== props.employee?.id).map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}</UiSelectField>
            <Field field="joining_date" label="Joining date" type="date" value={form.joining_date ?? ""} issues={validation.fieldIssues("joining_date")} onChange={(v) => update("joining_date", v)} />
            <Field field="confirmation_date" label="Confirmation date" type="date" value={form.confirmation_date ?? ""} issues={validation.fieldIssues("confirmation_date")} onChange={(v) => update("confirmation_date", v)} />
            <Field field="contract_start_date" label="Contract start" type="date" value={form.contract_start_date ?? ""} issues={validation.fieldIssues("contract_start_date")} onChange={(v) => update("contract_start_date", v)} />
            <Field field="contract_end_date" label="Contract end" type="date" value={form.contract_end_date ?? ""} issues={validation.fieldIssues("contract_end_date")} onChange={(v) => update("contract_end_date", v)} />
            <Field field="probation_end_date" label="Probation end" type="date" value={form.probation_end_date ?? ""} issues={validation.fieldIssues("probation_end_date")} onChange={(v) => update("probation_end_date", v)} />
            <CheckboxField label="Payroll included" checked={form.payroll_included} onChange={(value) => update("payroll_included", value)} className="self-end" />
            <CheckboxField label="Roster eligible" checked={form.roster_eligible} onChange={(value) => update("roster_eligible", value)} className="self-end" />
            <div className="md:col-span-3"><Field field="notes_summary" label="Notes summary" value={form.notes_summary ?? ""} issues={validation.fieldIssues("notes_summary")} onChange={(v) => update("notes_summary", v)} /></div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3">
          <Button variant="outline" size="sm" disabled={saving} onClick={props.onClose}>Cancel</Button>
          <Button size="sm" disabled={saving} onClick={() => void submit()}>{saving ? "Saving..." : "Save"}</Button>
        </div>
      </div>
    </div>
  );
}

function Field({ field, label, value, onChange, type = "text", disabled, placeholder, issues }: { field?: string; label: string; value: string; onChange: (value: string) => void; type?: string; disabled?: boolean; placeholder?: string; issues?: ValidationIssue[] }) {
  const hasError = Boolean(issues?.some((issue) => issue.severity === "error"));
  return <div className="space-y-1.5"><Label>{label}</Label><Input name={field} data-validation-field={field} aria-invalid={hasError || undefined} type={type} value={value} disabled={disabled} placeholder={placeholder} className={hasError ? "border-red-300 focus-visible:ring-red-500" : undefined} onChange={(event) => onChange(event.target.value)} /><FieldError issues={issues} /></div>;
}
