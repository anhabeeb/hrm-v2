import { SelectField } from "../ui/page-shell";
import type { Employee } from "../../types/employees";
import type { OrganizationDepartment, OrganizationJobLevel, OrganizationPosition } from "../../types/organization";
import { filterEmployeesForCascade, filterJobLevelsForDepartments, filterPositionsForCascade, type OrganizationCascadeValue } from "./organizationCascade";

export function DepartmentSelectField({ value, onChange, departments, label = "Department" }: { value: string; onChange: (value: string) => void; departments: OrganizationDepartment[]; label?: string }) {
  return <SelectField label={label} value={value} onValueChange={onChange}><option value="">Select department</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</SelectField>;
}

export function JobLevelSelectField({ value, onChange, jobLevels, positions, departmentId, label = "Job level" }: { value: string; onChange: (value: string) => void; jobLevels: OrganizationJobLevel[]; positions: OrganizationPosition[]; departmentId?: string; label?: string }) {
  const options = filterJobLevelsForDepartments(jobLevels, positions, departmentId ? [departmentId] : []);
  return <SelectField label={label} value={value} disabled={!departmentId} helper={!departmentId ? "Select department first" : undefined} onValueChange={onChange}><option value="">Select job level</option>{options.map((level) => <option key={level.id} value={level.id}>{level.name}</option>)}</SelectField>;
}

export function PositionSelectField({ value, onChange, positions, cascade, label = "Position" }: { value: string; onChange: (value: string) => void; positions: OrganizationPosition[]; cascade: OrganizationCascadeValue; label?: string }) {
  const options = filterPositionsForCascade(positions, cascade);
  return <SelectField label={label} value={value} disabled={!cascade.departmentId || !cascade.jobLevelId} helper={!cascade.departmentId ? "Select department first" : !cascade.jobLevelId ? "Select job level first" : undefined} onValueChange={onChange}><option value="">Select position</option>{options.map((position) => <option key={position.id} value={position.id}>{position.title}</option>)}</SelectField>;
}

export function EmployeeSelectField({ value, onChange, employees, cascade, label = "Employee" }: { value: string; onChange: (value: string) => void; employees: Employee[]; cascade: OrganizationCascadeValue; label?: string }) {
  const options = filterEmployeesForCascade(employees, cascade);
  return <SelectField label={label} value={value} disabled={!cascade.departmentId} helper={!cascade.departmentId ? "Select department first" : undefined} onValueChange={onChange}><option value="">Select employee</option>{options.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name} - {employee.employee_no}</option>)}</SelectField>;
}
