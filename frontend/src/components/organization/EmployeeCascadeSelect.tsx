import { useMemo, useState } from "react";
import type { Employee } from "../../types/employees";
import type { OrganizationDepartment, OrganizationJobLevel, OrganizationLocation, OrganizationPosition } from "../../types/organization";
import { OrganizationCascadeSelector } from "./OrganizationCascadeSelector";
import type { OrganizationCascadeValue } from "./organizationCascade";

interface Props {
  value?: string | null;
  onChange: (employeeId: string) => void;
  employees: Employee[];
  departments: OrganizationDepartment[];
  jobLevels: OrganizationJobLevel[];
  positions: OrganizationPosition[];
  locations?: OrganizationLocation[];
  label?: string;
  mode?: "employee-assignment" | "approval-routing" | "report-filter" | "payroll-filter" | "asset-rule" | "general";
  disabled?: boolean;
  className?: string;
}

function cascadeFromEmployee(employee?: Employee | null): OrganizationCascadeValue {
  return employee ? {
    locationId: employee.primary_location_id ?? "",
    departmentId: employee.primary_department_id ?? "",
    jobLevelId: employee.job_level_id ?? "",
    positionId: employee.primary_position_id ?? "",
    employeeId: employee.id
  } : {};
}

export function EmployeeCascadeSelect({
  value,
  onChange,
  employees,
  departments,
  jobLevels,
  positions,
  locations = [],
  label = "Employee",
  mode = "employee-assignment",
  disabled = false,
  className = "grid gap-3 md:grid-cols-2 xl:grid-cols-5"
}: Props) {
  const [draftCascade, setDraftCascade] = useState<OrganizationCascadeValue>({});
  const selectedEmployee = useMemo(() => employees.find((employee) => employee.id === value) ?? null, [employees, value]);
  const cascadeValue = selectedEmployee ? cascadeFromEmployee(selectedEmployee) : draftCascade;

  return (
    <OrganizationCascadeSelector
      includeLocation
      includeEmployee
      value={cascadeValue}
      onChange={(next) => {
        setDraftCascade(next);
        onChange(next.employeeId ?? "");
      }}
      departments={departments}
      jobLevels={jobLevels}
      positions={positions}
      locations={locations}
      employees={employees}
      labels={{ employeeId: label }}
      mode={mode}
      disabled={disabled}
      className={className}
    />
  );
}
