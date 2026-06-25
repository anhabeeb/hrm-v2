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
  expiry_required?: boolean;
  issue_date_required?: boolean;
  document_number_required?: boolean;
  urgent_expiring_days?: number | null;
  renewal_case_auto_create?: boolean;
  employee_summary_visible?: boolean;
  employee_download_allowed?: boolean;
  blocks_employee_activation?: boolean;
  creates_payroll_warning?: boolean;
  creates_final_settlement_warning?: boolean;
  compliance_weight?: number | null;
  sensitivity_level?: "NORMAL" | "SENSITIVE" | "HIGHLY_SENSITIVE";
  renewal_instructions?: string | null;
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

export interface DocumentComplianceSettings {
  id: string;
  document_compliance_enabled: boolean;
  expiry_alerts_enabled: boolean;
  missing_required_document_alerts_enabled: boolean;
  renewal_workflow_enabled: boolean;
  auto_create_renewal_case_for_expiring_document: boolean;
  auto_create_missing_document_case: boolean;
  default_expiring_soon_days: number;
  default_urgent_expiring_days: number;
  default_overdue_grace_days: number;
  require_reason_for_renewal_case_cancel: boolean;
  require_reason_for_document_waiver: boolean;
  allow_document_requirement_waiver: boolean;
  allow_employee_view_document_compliance: boolean;
  allow_employee_download_documents: boolean;
  employee_document_upload_request_placeholder_enabled: boolean;
  sensitive_document_view_audit_enabled: boolean;
  compliance_dashboard_enabled: boolean;
  updated_at: string;
}

export interface DocumentComplianceRequiredItem {
  document_type_id: string;
  document_type_name: string;
  document_type_code: string;
  category_name: string | null;
  status: string;
  display_status?: string;
  missing?: boolean;
  waived?: boolean;
  days_until_expiry?: number | null;
  document?: EmployeeDocument | null;
  waiver?: DocumentRequirementWaiver | null;
  reason?: string | null;
  restricted?: boolean;
  is_sensitive?: boolean | number;
}

export interface EmployeeDocumentCompliance {
  employee?: Record<string, unknown>;
  compliance_status: string;
  compliance_percent: number;
  total_required_documents: number;
  submitted_required_documents: number;
  missing_required_documents: number;
  expiring_documents: number;
  urgent_expiring_documents: number;
  expired_documents: number;
  waived_required_documents: number;
  required_documents: DocumentComplianceRequiredItem[];
  missing_documents: DocumentComplianceRequiredItem[];
  expiring_documents_list: Array<EmployeeDocument & { days_until_expiry?: number | null; status?: string; restricted?: boolean }>;
  expired_documents_list: Array<EmployeeDocument & { days_until_expiry?: number | null; status?: string; restricted?: boolean }>;
  waivers: DocumentRequirementWaiver[];
  warning_summary: Record<string, number>;
}

export interface DocumentComplianceDashboard {
  summary: Record<string, number>;
  employees: EmployeeDocumentCompliance[];
  alerts: DocumentExpiryAlert[];
}

export interface DocumentExpiryAlert {
  id: string;
  employee_id: string;
  employee_no?: string | null;
  employee_name?: string | null;
  department_name?: string | null;
  location_name?: string | null;
  document_id: string | null;
  document_type_id: string;
  document_type_name?: string | null;
  document_type_code?: string | null;
  document_number?: string | null;
  original_filename?: string | null;
  alert_type: string;
  due_date: string | null;
  expiry_date: string | null;
  severity: "INFO" | "WARNING" | "CRITICAL";
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED";
  reason: string | null;
  notes: string | null;
  restricted?: boolean;
  created_at: string;
  updated_at: string;
}

export interface DocumentRenewalCase {
  id: string;
  employee_id: string;
  employee_no?: string | null;
  employee_name?: string | null;
  department_name?: string | null;
  location_name?: string | null;
  document_id: string | null;
  document_type_id: string;
  document_type_name?: string | null;
  document_type_code?: string | null;
  renewal_case_number: string;
  case_type: "NEW_REQUIRED_DOCUMENT" | "RENEWAL" | "REPLACEMENT" | "CORRECTION";
  status: "DRAFT" | "OPEN" | "IN_PROGRESS" | "WAITING_FOR_EMPLOYEE" | "WAITING_FOR_HR" | "WAITING_FOR_EXTERNAL_AUTHORITY" | "DOCUMENT_RECEIVED" | "COMPLETED" | "CANCELLED" | "WAIVED";
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  current_expiry_date: string | null;
  target_renewal_date: string | null;
  due_date: string | null;
  assigned_to_user_id: string | null;
  assigned_to_name?: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentRequirementWaiver {
  id: string;
  employee_id: string;
  employee_no?: string | null;
  employee_name?: string | null;
  department_name?: string | null;
  location_name?: string | null;
  document_type_id: string;
  document_type_name?: string | null;
  document_type_code?: string | null;
  waiver_reason: string;
  waiver_start_date: string;
  waiver_end_date: string | null;
  status: "ACTIVE" | "EXPIRED" | "CANCELLED";
  approved_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
}
