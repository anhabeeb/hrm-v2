import type { Env } from "../types";
import { validateAccessScope, validationIssue, type ValidationIssue } from "./validation";
import type { AuthUser } from "../types";

export interface OrganizationCascadeInput {
  department_id?: string | null;
  location_id?: string | null;
  position_id?: string | null;
  job_level_id?: string | null;
  employee_id?: string | null;
}

async function activeRow(db: Env["DB"], sql: string, ...params: string[]) {
  return db.prepare(sql).bind(...params).first<Record<string, unknown>>();
}

export async function validateOrganizationCascade(db: Env["DB"], input: OrganizationCascadeInput) {
  const issues: ValidationIssue[] = [];

  if (input.department_id && !(await activeRow(db, "SELECT id FROM departments WHERE id = ? AND is_active = 1", input.department_id))) {
    issues.push(validationIssue("INVALID_ORGANIZATION_CASCADE", "department_id", "Selected department was not found or is inactive.", "error", { departmentId: input.department_id }));
  }
  if (input.location_id && !(await activeRow(db, "SELECT id FROM locations WHERE id = ? AND is_active = 1", input.location_id))) {
    issues.push(validationIssue("INVALID_ORGANIZATION_CASCADE", "location_id", "Selected location was not found or is inactive.", "error", { locationId: input.location_id }));
  }
  if (input.job_level_id && !(await activeRow(db, "SELECT id FROM job_levels WHERE id = ? AND is_active = 1", input.job_level_id))) {
    issues.push(validationIssue("INVALID_ORGANIZATION_CASCADE", "job_level_id", "Selected job level was not found or is inactive.", "error", { jobLevelId: input.job_level_id }));
  }

  if (input.position_id) {
    const position = await db.prepare("SELECT id, department_id, level_id FROM positions WHERE id = ? AND is_active = 1").bind(input.position_id).first<{ id: string; department_id: string | null; level_id: string | null }>();
    if (!position) {
      issues.push(validationIssue("INVALID_ORGANIZATION_CASCADE", "position_id", "Selected position was not found or is inactive.", "error", { positionId: input.position_id }));
    } else {
      if (input.department_id && !position.department_id) {
        issues.push(validationIssue("INVALID_ORGANIZATION_CASCADE", "position_id", "Selected position is missing a department mapping and cannot be used as a global position.", "error", { departmentId: input.department_id, positionId: input.position_id }));
      } else if (input.department_id && position.department_id !== input.department_id) {
        issues.push(validationIssue("INVALID_ORGANIZATION_CASCADE", "position_id", "Selected position is not valid for the selected department.", "error", { departmentId: input.department_id, positionId: input.position_id }));
      }
      if (input.job_level_id && !position.level_id) {
        issues.push(validationIssue("INVALID_ORGANIZATION_CASCADE", "position_id", "Selected position is missing a job-level mapping and cannot be used as a global position.", "error", { jobLevelId: input.job_level_id, positionId: input.position_id }));
      } else if (input.job_level_id && position.level_id !== input.job_level_id) {
        issues.push(validationIssue("INVALID_ORGANIZATION_CASCADE", "position_id", "Selected position is not valid for the selected job level.", "error", { jobLevelId: input.job_level_id, positionId: input.position_id }));
      }
    }
  }

  if (input.job_level_id && input.department_id && !input.position_id) {
    const levelInDepartment = await db.prepare("SELECT id FROM positions WHERE department_id = ? AND level_id = ? AND is_active = 1 LIMIT 1").bind(input.department_id, input.job_level_id).first<{ id: string }>();
    if (!levelInDepartment) {
      issues.push(validationIssue("INVALID_ORGANIZATION_CASCADE", "job_level_id", "Selected job level has no active positions in the selected department.", "error", { departmentId: input.department_id, jobLevelId: input.job_level_id }));
    }
  }

  if (input.employee_id) {
    const employee = await db.prepare(
      "SELECT id, primary_department_id, primary_position_id, primary_location_id, job_level_id FROM employees WHERE id = ? AND archived_at IS NULL"
    ).bind(input.employee_id).first<{ id: string; primary_department_id: string | null; primary_position_id: string | null; primary_location_id: string | null; job_level_id: string | null }>();
    if (!employee) {
      issues.push(validationIssue("INVALID_ORGANIZATION_CASCADE", "employee_id", "Selected employee was not found or is inactive.", "error", { employeeId: input.employee_id }));
    } else {
      if (input.department_id && employee.primary_department_id !== input.department_id) issues.push(validationIssue("INVALID_ORGANIZATION_CASCADE", "employee_id", "Selected employee is not in the selected department.", "error", { employeeId: input.employee_id, departmentId: input.department_id }));
      if (input.position_id && employee.primary_position_id !== input.position_id) issues.push(validationIssue("INVALID_ORGANIZATION_CASCADE", "employee_id", "Selected employee is not assigned to the selected position.", "error", { employeeId: input.employee_id, positionId: input.position_id }));
      if (input.location_id && employee.primary_location_id !== input.location_id) issues.push(validationIssue("INVALID_ORGANIZATION_CASCADE", "employee_id", "Selected employee is not assigned to the selected location.", "error", { employeeId: input.employee_id, locationId: input.location_id }));
      if (input.job_level_id && employee.job_level_id !== input.job_level_id) issues.push(validationIssue("INVALID_ORGANIZATION_CASCADE", "employee_id", "Selected employee is not assigned to the selected job level.", "error", { employeeId: input.employee_id, jobLevelId: input.job_level_id }));
    }
  }

  return issues;
}

export async function validateOrganizationCascadeWithScope(db: Env["DB"], user: AuthUser, input: OrganizationCascadeInput) {
  return [
    ...(await validateOrganizationCascade(db, input)),
    ...(await validateAccessScope(db, user, {
      departmentIds: input.department_id ? [input.department_id] : [],
      locationIds: input.location_id ? [input.location_id] : []
    }))
  ];
}
