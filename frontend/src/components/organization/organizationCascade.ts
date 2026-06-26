import type { Employee } from "../../types/employees";
import type { OrganizationDepartment, OrganizationJobLevel, OrganizationLocation, OrganizationPosition } from "../../types/organization";
import type { ValidationIssue } from "../../lib/validation";

export interface OrganizationCascadeValue {
  locationId?: string;
  locationIds?: string[];
  departmentId?: string;
  departmentIds?: string[];
  jobLevelId?: string;
  jobLevelIds?: string[];
  positionId?: string;
  positionIds?: string[];
  employeeId?: string;
}

export interface OrganizationCascadeOptions {
  departments: OrganizationDepartment[];
  locations?: OrganizationLocation[];
  jobLevels: OrganizationJobLevel[];
  positions: OrganizationPosition[];
  employees?: Employee[];
  allowedDepartmentIds?: string[];
  allowedLocationIds?: string[];
  scopeDepartmentIds?: string[];
  scopeLocationIds?: string[];
  requireDepartmentForJobLevel?: boolean;
  requireJobLevelForPosition?: boolean;
  allowCompatibilityGlobalPositions?: boolean;
  includeInactive?: boolean;
  mode?: "role-mapping" | "employee-assignment" | "approval-routing" | "report-filter" | "payroll-filter" | "document-rule" | "asset-rule" | "general";
}

const resetNotice = "Some selections were removed because they are not valid for the selected department/job level.";

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function selectedIds(single?: string, multiple?: string[]) {
  return unique([...(multiple ?? []), single].filter((value): value is string => Boolean(value)));
}

function limitByIds<T extends { id: string }>(rows: T[], ids?: string[]) {
  const selected = unique((ids ?? []).filter(Boolean));
  return selected.length ? rows.filter((row) => selected.includes(row.id)) : rows;
}

function positionHasRequiredRelationships(position: OrganizationPosition, allowCompatibilityGlobalPositions = false) {
  return allowCompatibilityGlobalPositions || Boolean(position.department_id && position.level_id);
}

export function getScopedDepartments(options: OrganizationCascadeOptions) {
  return limitByIds(limitByIds(options.departments, options.allowedDepartmentIds), options.scopeDepartmentIds);
}

export function getScopedLocations(options: OrganizationCascadeOptions) {
  return limitByIds(limitByIds(options.locations ?? [], options.allowedLocationIds), options.scopeLocationIds);
}

export function filterJobLevelsForDepartments(jobLevels: OrganizationJobLevel[], positions: OrganizationPosition[], departmentIds: string[], allowCompatibilityGlobalPositions = false) {
  if (!departmentIds.length) return [];
  const levelIds = unique(
    positions
      .filter((position) => positionHasRequiredRelationships(position, allowCompatibilityGlobalPositions))
      .filter((position) => position.department_id && departmentIds.includes(position.department_id))
      .map((position) => position.level_id)
      .filter(Boolean)
  );
  return jobLevels.filter((level) => levelIds.includes(level.id));
}

export function filterPositionsForCascade(positions: OrganizationPosition[], value: OrganizationCascadeValue, options: Pick<OrganizationCascadeOptions, "allowedDepartmentIds" | "scopeDepartmentIds" | "allowCompatibilityGlobalPositions"> = {}) {
  const departmentIds = selectedIds(value.departmentId, value.departmentIds);
  const jobLevelIds = selectedIds(value.jobLevelId, value.jobLevelIds);
  const allowedDepartments = unique([...(options.allowedDepartmentIds ?? []), ...(options.scopeDepartmentIds ?? [])]);
  return positions.filter((position) => {
    if (!positionHasRequiredRelationships(position, options.allowCompatibilityGlobalPositions)) return false;
    if (allowedDepartments.length && (!position.department_id || !allowedDepartments.includes(position.department_id))) return false;
    if (departmentIds.length && (!position.department_id || !departmentIds.includes(position.department_id))) return false;
    if (jobLevelIds.length && (!position.level_id || !jobLevelIds.includes(position.level_id))) return false;
    return true;
  });
}

export function filterEmployeesForCascade(employees: Employee[] = [], value: OrganizationCascadeValue) {
  const locationIds = selectedIds(value.locationId, value.locationIds);
  const departmentIds = selectedIds(value.departmentId, value.departmentIds);
  const jobLevelIds = selectedIds(value.jobLevelId, value.jobLevelIds);
  const positionIds = selectedIds(value.positionId, value.positionIds);
  return employees.filter((employee) => {
    if (locationIds.length && !locationIds.includes(employee.primary_location_id ?? "")) return false;
    if (departmentIds.length && !departmentIds.includes(employee.primary_department_id ?? "")) return false;
    if (jobLevelIds.length && !jobLevelIds.includes(employee.job_level_id ?? "")) return false;
    if (positionIds.length && !positionIds.includes(employee.primary_position_id ?? "")) return false;
    return true;
  });
}

export function getOrganizationCascadeOptions(options: OrganizationCascadeOptions, value: OrganizationCascadeValue) {
  const departments = getScopedDepartments(options);
  const locations = getScopedLocations(options);
  const departmentIds = selectedIds(value.departmentId, value.departmentIds);
  const fallbackDepartmentIds = departmentIds.length ? departmentIds : departments.map((department) => department.id);
  const jobLevels = filterJobLevelsForDepartments(options.jobLevels, options.positions, fallbackDepartmentIds, options.allowCompatibilityGlobalPositions);
  const positions = filterPositionsForCascade(options.positions, value, {
    allowedDepartmentIds: departments.map((department) => department.id),
    allowCompatibilityGlobalPositions: options.allowCompatibilityGlobalPositions
  });
  const employees = filterEmployeesForCascade(options.employees ?? [], {
    ...value,
    locationIds: selectedIds(value.locationId, value.locationIds).length ? selectedIds(value.locationId, value.locationIds) : locations.map((location) => location.id),
    departmentIds: departmentIds.length ? departmentIds : departments.map((department) => department.id)
  });
  return { departments, locations, jobLevels, positions, employees };
}

export function resetInvalidOrganizationCascade(options: OrganizationCascadeOptions, value: OrganizationCascadeValue) {
  const next = { ...value };
  let reset = false;
  const available = getOrganizationCascadeOptions(options, next);

  if (next.locationId && !available.locations.some((location) => location.id === next.locationId)) {
    next.locationId = "";
    reset = true;
  }
  if (next.departmentId && !available.departments.some((department) => department.id === next.departmentId)) {
    next.departmentId = "";
    next.jobLevelId = "";
    next.positionId = "";
    next.employeeId = "";
    reset = true;
  }
  if (next.jobLevelId && !available.jobLevels.some((level) => level.id === next.jobLevelId)) {
    next.jobLevelId = "";
    reset = true;
  }
  const positionsAfterLevel = filterPositionsForCascade(options.positions, next, {
    allowedDepartmentIds: available.departments.map((department) => department.id),
    allowCompatibilityGlobalPositions: options.allowCompatibilityGlobalPositions
  });
  if (next.positionId && !positionsAfterLevel.some((position) => position.id === next.positionId)) {
    next.positionId = "";
    reset = true;
  }
  const employeesAfterCascade = filterEmployeesForCascade(options.employees ?? [], next);
  if (next.employeeId && !employeesAfterCascade.some((employee) => employee.id === next.employeeId)) {
    next.employeeId = "";
    reset = true;
  }

  return { value: next, notice: reset ? resetNotice : null };
}

export function validateOrganizationCascade(options: OrganizationCascadeOptions, value: OrganizationCascadeValue): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const available = getOrganizationCascadeOptions(options, value);
  const details = { ...value };
  if (value.locationId && !available.locations.some((location) => location.id === value.locationId)) {
    issues.push({ code: "INVALID_ORGANIZATION_CASCADE", field: "locationId", message: "Selected location is not available for the selected access scope.", severity: "error", details });
  }
  if (value.departmentId && !available.departments.some((department) => department.id === value.departmentId)) {
    issues.push({ code: "INVALID_ORGANIZATION_CASCADE", field: "departmentId", message: "Selected department is not available.", severity: "error", details });
  }
  if (value.jobLevelId && !available.jobLevels.some((level) => level.id === value.jobLevelId)) {
    issues.push({ code: "INVALID_ORGANIZATION_CASCADE", field: "jobLevelId", message: "Selected job level is not valid for the selected department.", severity: "error", details });
  }
  if (value.positionId && !available.positions.some((position) => position.id === value.positionId)) {
    issues.push({ code: "INVALID_ORGANIZATION_CASCADE", field: "positionId", message: "Selected position is not valid for the selected department and job level.", severity: "error", details });
  }
  if (value.employeeId && !available.employees.some((employee) => employee.id === value.employeeId)) {
    issues.push({ code: "INVALID_ORGANIZATION_CASCADE", field: "employeeId", message: "Selected employee is not valid for the selected organization filters.", severity: "error", details });
  }
  return issues;
}
