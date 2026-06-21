export type DocumentStoredStatus = "ACTIVE" | "ARCHIVED" | "SOFT_DELETED";
export type DocumentDisplayStatus = "VALID" | "EXPIRING_SOON" | "EXPIRED" | "ARCHIVED" | "SOFT_DELETED";

export interface DocumentCategory {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DocumentType {
  id: string;
  category_id: string | null;
  category_name?: string | null;
  code: string;
  name: string;
  description: string | null;
  is_sensitive: boolean;
  is_active: boolean;
  expiring_soon_days: number;
  allowed_file_types_json: string;
  allowed_file_types?: string[];
  max_file_size_mb: number;
  allow_multiple_files: boolean;
  requires_expiry_date: boolean;
  requires_issue_date: boolean;
  requires_document_number: boolean;
  retention_rule_json: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface EmployeeDocument {
  id: string;
  employee_id: string;
  employee_no?: string;
  employee_name?: string;
  department_id?: string | null;
  department_name?: string | null;
  position_id?: string | null;
  position_title?: string | null;
  location_id?: string | null;
  location_name?: string | null;
  employee_type?: string;
  employment_type?: string;
  document_type_id: string;
  document_type_name?: string;
  document_type_code?: string;
  category_id: string | null;
  category_name?: string | null;
  document_number: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  status: DocumentStoredStatus;
  display_status: DocumentDisplayStatus;
  current_version_id: string | null;
  is_sensitive: boolean;
  notes: string | null;
  version_no?: number | null;
  original_filename?: string | null;
  file_mime_type?: string | null;
  file_size_bytes?: number | null;
  uploaded_by_name?: string | null;
  uploaded_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmployeeDocumentVersion {
  id: string;
  employee_document_id: string;
  version_no: number;
  original_filename: string;
  file_mime_type: string;
  file_size_bytes: number;
  file_hash: string | null;
  uploaded_by_user_id: string;
  uploaded_by_name?: string | null;
  uploaded_at: string;
  reason_for_replacement: string | null;
  is_current: boolean;
  created_at: string;
}

export interface MissingDocument {
  employee_id: string;
  employee_no: string;
  employee_name: string;
  department_id: string | null;
  department_name: string | null;
  position_id: string | null;
  position_title: string | null;
  location_id: string | null;
  location_name: string | null;
  employee_type: string;
  employment_type: string;
  document_type_id: string;
  document_type_name: string;
  category_name: string | null;
  reason: string;
}

export interface DocumentRequiredRule {
  id: string;
  document_type_id: string;
  document_type_name?: string;
  employee_type: string | null;
  employment_type: string | null;
  department_id: string | null;
  department_name?: string | null;
  position_id: string | null;
  position_title?: string | null;
  location_id: string | null;
  location_name?: string | null;
  custom_condition_json: string | null;
  is_required: boolean | number;
  rule_priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DocumentDashboard {
  total_documents: number;
  missing_required_documents: number;
  expiring_soon: number;
  expired: number;
  top_urgent_renewals: EmployeeDocument[];
  recently_uploaded: EmployeeDocument[];
  sensitive_access_alerts_count: number;
}

export interface DocumentTypeInput {
  category_id?: string | null;
  code: string;
  name: string;
  description?: string | null;
  is_sensitive: boolean;
  expiring_soon_days: number;
  allowed_file_types: string[];
  max_file_size_mb: number;
  allow_multiple_files: boolean;
  requires_expiry_date: boolean;
  requires_issue_date: boolean;
  requires_document_number: boolean;
  sort_order: number;
}

export interface DocumentRequiredRuleInput {
  document_type_id: string;
  employee_type?: string | null;
  employment_type?: string | null;
  department_id?: string | null;
  position_id?: string | null;
  location_id?: string | null;
  custom_condition_json?: string | null;
  is_required?: boolean;
  rule_priority?: number;
}
