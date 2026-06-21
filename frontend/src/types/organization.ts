export type CompanyStatus = "ACTIVE" | "INACTIVE";
export type LocationType = "OUTLET" | "OFFICE" | "WAREHOUSE" | "OTHER";

export interface OrganizationCompany {
  id: string;
  name: string;
  legal_name: string | null;
  registration_no: string | null;
  tax_no: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_document_id: string | null;
  status: CompanyStatus;
  created_at: string;
  updated_at: string;
}

export interface OrganizationLocation {
  id: string;
  company_id: string | null;
  code: string;
  name: string;
  type: LocationType;
  island_city: string | null;
  address: string | null;
  phone: string | null;
  manager_employee_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrganizationDepartment {
  id: string;
  code: string;
  name: string;
  description: string | null;
  parent_department_id: string | null;
  parent_department_name?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrganizationJobLevel {
  id: string;
  code: string;
  name: string;
  rank_order: number;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrganizationPosition {
  id: string;
  code: string;
  title: string;
  department_id: string | null;
  department_name?: string | null;
  level_id: string | null;
  level_name?: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CompanyInput {
  name: string;
  legal_name?: string | null;
  registration_no?: string | null;
  tax_no?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  status: CompanyStatus;
}

export interface LocationInput {
  code: string;
  name: string;
  type: LocationType;
  island_city?: string | null;
  address?: string | null;
  phone?: string | null;
}

export interface DepartmentInput {
  code: string;
  name: string;
  parent_department_id?: string | null;
  description?: string | null;
}

export interface JobLevelInput {
  code: string;
  name: string;
  rank_order: number;
  description?: string | null;
}

export interface PositionInput {
  code: string;
  title: string;
  department_id?: string | null;
  level_id?: string | null;
  description?: string | null;
}
