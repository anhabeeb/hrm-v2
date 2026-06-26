import { useMemo, useState } from "react";
import { DependentFieldResetNotice } from "../forms/DependentFieldResetNotice";
import { FieldError } from "../forms/FieldError";
import { SelectField } from "../ui/page-shell";
import type { Employee } from "../../types/employees";
import type { OrganizationDepartment, OrganizationJobLevel, OrganizationLocation, OrganizationPosition } from "../../types/organization";
import type { ValidationIssue } from "../../lib/validation";
import { getOrganizationCascadeOptions, resetInvalidOrganizationCascade, validateOrganizationCascade, type OrganizationCascadeValue } from "./organizationCascade";

interface Props {
  value: OrganizationCascadeValue;
  onChange: (value: OrganizationCascadeValue) => void;
  departments: OrganizationDepartment[];
  jobLevels: OrganizationJobLevel[];
  positions: OrganizationPosition[];
  locations?: OrganizationLocation[];
  employees?: Employee[];
  includeLocation?: boolean;
  includeJobLevel?: boolean;
  includePosition?: boolean;
  includeEmployee?: boolean;
  allowEmpty?: boolean;
  allowedDepartmentIds?: string[];
  allowedLocationIds?: string[];
  scopeDepartmentIds?: string[];
  scopeLocationIds?: string[];
  multiDepartment?: boolean;
  multiJobLevel?: boolean;
  multiPosition?: boolean;
  requireDepartmentForJobLevel?: boolean;
  requireJobLevelForPosition?: boolean;
  includeInactive?: boolean;
  disabled?: boolean;
  mode?: "role-mapping" | "employee-assignment" | "approval-routing" | "report-filter" | "payroll-filter" | "document-rule" | "asset-rule" | "general";
  childPrerequisiteMessage?: string;
  labels?: Partial<Record<keyof OrganizationCascadeValue, string>>;
  issues?: ValidationIssue[];
  className?: string;
}

export function OrganizationCascadeSelector({
  value,
  onChange,
  departments,
  jobLevels,
  positions,
  locations = [],
  employees = [],
  includeLocation = false,
  includeJobLevel = true,
  includePosition = true,
  includeEmployee = false,
  allowEmpty = true,
  allowedDepartmentIds,
  allowedLocationIds,
  scopeDepartmentIds,
  scopeLocationIds,
  requireDepartmentForJobLevel = true,
  requireJobLevelForPosition = true,
  includeInactive = false,
  disabled = false,
  mode = "general",
  childPrerequisiteMessage,
  labels,
  issues = [],
  className = "grid gap-3 md:grid-cols-3"
}: Props) {
  const [notice, setNotice] = useState<string | null>(null);
  const cascadeConfig = { departments, locations, jobLevels, positions, employees, allowedDepartmentIds, allowedLocationIds, scopeDepartmentIds, scopeLocationIds, requireDepartmentForJobLevel, requireJobLevelForPosition, includeInactive, mode };
  const cascadeOptions = useMemo(
    () => getOrganizationCascadeOptions(cascadeConfig, value),
    [allowedDepartmentIds, allowedLocationIds, departments, employees, includeInactive, jobLevels, locations, mode, positions, requireDepartmentForJobLevel, requireJobLevelForPosition, scopeDepartmentIds, scopeLocationIds, value]
  );
  const cascadeIssues = validateOrganizationCascade(cascadeConfig, value);
  const allIssues = [...issues, ...cascadeIssues];

  function update(next: OrganizationCascadeValue) {
    const result = resetInvalidOrganizationCascade(cascadeConfig, next);
    setNotice(result.notice);
    onChange(result.value);
  }

  const departmentScopeMissing = Boolean(allowedDepartmentIds && allowedDepartmentIds.length === 0 && mode === "role-mapping");
  const locationScopeMissing = Boolean(includeLocation && allowedLocationIds && allowedLocationIds.length === 0 && mode === "role-mapping");
  const prerequisiteMessage = childPrerequisiteMessage ?? (departmentScopeMissing ? "Select allowed department scope first" : "Select department first");
  const departmentSelected = Boolean(value.departmentId);
  const jobLevelSelected = Boolean(value.jobLevelId);
  const positionOptions = !requireDepartmentForJobLevel || departmentSelected ? cascadeOptions.positions : [];
  const employeeOptions = includeEmployee ? cascadeOptions.employees : [];

  return (
    <div className="space-y-3">
      <DependentFieldResetNotice message={notice} />
      <div className={className}>
        {includeLocation ? (
          <div className="space-y-1.5">
            <SelectField label={labels?.locationId ?? "Outlet/location"} value={value.locationId ?? ""} disabled={disabled || locationScopeMissing} helper={locationScopeMissing ? "Select allowed location scope first" : undefined} onValueChange={(locationId) => update({ ...value, locationId, employeeId: "" })}>
              {allowEmpty ? <option value="">Any location</option> : null}
              {cascadeOptions.locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </SelectField>
            <FieldError issues={allIssues.filter((issue) => issue.field === "locationId")} />
          </div>
        ) : null}
        <div className="space-y-1.5">
          <SelectField label={labels?.departmentId ?? "Department"} value={value.departmentId ?? ""} disabled={disabled || departmentScopeMissing} helper={departmentScopeMissing ? "Select allowed department scope first" : undefined} onValueChange={(departmentId) => update({ ...value, departmentId, jobLevelId: "", positionId: "", employeeId: "" })}>
            {allowEmpty ? <option value="">Any department</option> : null}
            {cascadeOptions.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
          </SelectField>
          <FieldError issues={allIssues.filter((issue) => issue.field === "departmentId")} />
        </div>
        {includeJobLevel ? <div className="space-y-1.5">
          <SelectField
            label={labels?.jobLevelId ?? "Job level"}
            value={value.jobLevelId ?? ""}
            disabled={disabled || departmentScopeMissing || (requireDepartmentForJobLevel && !departmentSelected)}
            helper={departmentScopeMissing || (requireDepartmentForJobLevel && !departmentSelected) ? prerequisiteMessage : cascadeOptions.jobLevels.length ? undefined : "No job levels available for selected department"}
            onValueChange={(jobLevelId) => update({ ...value, jobLevelId, positionId: "", employeeId: "" })}
          >
            {allowEmpty ? <option value="">Any job level</option> : null}
            {cascadeOptions.jobLevels.map((level) => <option key={level.id} value={level.id}>{level.name}</option>)}
          </SelectField>
          <FieldError issues={allIssues.filter((issue) => issue.field === "jobLevelId")} />
        </div> : null}
        {includePosition ? <div className="space-y-1.5">
          <SelectField
            label={labels?.positionId ?? "Position"}
            value={value.positionId ?? ""}
            disabled={disabled || departmentScopeMissing || (requireDepartmentForJobLevel && !departmentSelected) || (requireJobLevelForPosition && !jobLevelSelected)}
            helper={departmentScopeMissing || (requireDepartmentForJobLevel && !departmentSelected) ? prerequisiteMessage : requireJobLevelForPosition && !jobLevelSelected ? "Select job level first" : positionOptions.length ? undefined : "No positions available for selected department and job level"}
            onValueChange={(positionId) => update({ ...value, positionId, employeeId: "" })}
          >
            {allowEmpty ? <option value="">Any position</option> : null}
            {positionOptions.map((position) => (
              <option key={position.id} value={position.id}>
                {position.title}{position.department_name || position.level_name ? ` - ${[position.department_name, position.level_name].filter(Boolean).join(" / ")}` : ""}
              </option>
            ))}
          </SelectField>
          <FieldError issues={allIssues.filter((issue) => issue.field === "positionId")} />
        </div> : null}
        {includeEmployee ? (
          <div className="space-y-1.5">
            <SelectField
              label={labels?.employeeId ?? "Employee"}
              value={value.employeeId ?? ""}
              disabled={disabled || departmentScopeMissing || (requireDepartmentForJobLevel && !departmentSelected)}
              helper={departmentScopeMissing || (requireDepartmentForJobLevel && !departmentSelected) ? prerequisiteMessage : employeeOptions.length ? undefined : "No employees available for selected filters"}
              onValueChange={(employeeId) => update({ ...value, employeeId })}
            >
              {allowEmpty ? <option value="">Any employee</option> : null}
              {employeeOptions.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.full_name} - {employee.employee_no}</option>
              ))}
            </SelectField>
            <FieldError issues={allIssues.filter((issue) => issue.field === "employeeId")} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
