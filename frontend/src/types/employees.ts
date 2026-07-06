export type EmployeeType = "LOCAL" | "FOREIGN" | "OTHER";
export type EmploymentType = "FULL_TIME" | "PART_TIME" | "INTERN" | "TEMPORARY" | "CONTRACT";
export type ContactType = "PERSONAL_PHONE" | "WORK_PHONE" | "PERSONAL_EMAIL" | "WORK_EMAIL" | "EMERGENCY" | "GUARDIAN" | "SPOUSE" | "PARENT" | "OTHER";
export type OnboardingStatus = "PENDING" | "COMPLETED" | "SKIPPED" | "BLOCKED";

export interface EmployeeStatusSetting {
  id: string;
  key: string;
  name: string;
  description: string | null;
  is_protected: boolean;
  is_active: boolean;
  can_login: boolean;
  include_in_payroll: boolean;
  include_in_roster: boolean;
  show_in_active_lists: boolean;
  requires_exit_date: boolean;
  requires_exit_reason: boolean;
  requires_final_settlement: boolean;
  requires_document_clearance: boolean;
  requires_asset_clearance: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface EmployeeNumberSettings {
  id: string;
  prefix: string;
  include_year: boolean;
  include_location_code: boolean;
  include_department_code: boolean;
  sequence_padding: number;
  next_sequence: number;
  allow_manual_override: boolean;
  separator: string;
  created_at: string;
  updated_at: string;
}

export interface Employee {
  id: string;
  employee_no: string;
  profile_photo_document_id: string | null;
  full_name: string;
  display_name: string | null;
  gender: string | null;
  date_of_birth: string | null;
  nationality: string | null;
  employee_type: EmployeeType;
  employment_type: EmploymentType;
  status_id: string;
  status_key?: string;
  status_name?: string;
  primary_department_id: string | null;
  department_name?: string | null;
  primary_position_id: string | null;
  position_title?: string | null;
  primary_location_id: string | null;
  location_name?: string | null;
  location_code?: string | null;
  job_level_id: string | null;
  job_level_name?: string | null;
  joining_date: string | null;
  confirmation_date: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  probation_end_date: string | null;
  reporting_manager_employee_id: string | null;
  reporting_manager_name?: string | null;
  payroll_included: boolean;
  roster_eligible: boolean;
  user_id: string | null;
  linked_user_email?: string | null;
  user_linked: boolean;
  exit_date: string | null;
  exit_reason: string | null;
  notes_summary: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  active_onboarding_case_id?: string | null;
  active_onboarding_case_number?: string | null;
  active_onboarding_status?: string | null;
  active_activation_status?: string | null;
}

export interface EmployeeInput {
  employee_no?: string | null;
  full_name: string;
  display_name?: string | null;
  gender?: string | null;
  date_of_birth?: string | null;
  nationality?: string | null;
  employee_type: EmployeeType;
  employment_type: EmploymentType;
  status_id?: string | null;
  primary_department_id?: string | null;
  primary_position_id?: string | null;
  primary_location_id?: string | null;
  job_level_id?: string | null;
  joining_date?: string | null;
  confirmation_date?: string | null;
  contract_start_date?: string | null;
  contract_end_date?: string | null;
  probation_end_date?: string | null;
  reporting_manager_employee_id?: string | null;
  payroll_included: boolean;
  roster_eligible: boolean;
  user_id?: string | null;
  notes_summary?: string | null;
  effective_date?: string | null;
  reason?: string | null;
}

export interface EmployeeContact {
  id: string;
  employee_id: string;
  contact_type: ContactType;
  value: string;
  country_code: string | null;
  relationship: string | null;
  is_primary: boolean;
  emergency_priority: number | null;
  is_sensitive: boolean;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmployeeContactInput {
  contact_type: ContactType;
  value: string;
  country_code?: string | null;
  relationship?: string | null;
  is_primary: boolean;
  emergency_priority?: number | null;
  is_sensitive: boolean;
  notes?: string | null;
}

export interface OnboardingTask {
  id: string;
  employee_id: string;
  task_key: string;
  title: string;
  description: string | null;
  module: string;
  status: OnboardingStatus;
  required: number | boolean;
  completed_by_user_id: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type EmployeeSetupSectionStatus =
  | "not_started"
  | "incomplete"
  | "complete"
  | "blocked"
  | "not_required"
  | "failed"
  | "stale"
  | "verified";

export interface EmployeeSetupSectionStatusRow {
  section_key: string;
  section_label: string;
  status: EmployeeSetupSectionStatus;
  is_required: boolean;
  is_complete: boolean;
  is_verified: boolean;
  is_stale: boolean;
  status_reason_code: string | null;
  status_message: string | null;
  next_action: string | null;
  missing_fields: unknown[];
  blockers: unknown[];
  field_status: Record<string, unknown>;
  source_version: string | null;
  last_saved_at: string | null;
  last_evaluated_at: string | null;
  last_verified_at: string | null;
  updated_at: string;
}

export interface EmployeeSetupReadiness {
  status: "ready" | "blocked" | "failed" | "stale" | string;
  can_activate_candidate: boolean;
  activation_requires_final_verification: boolean;
  shadow_only: boolean;
  passing_sections: EmployeeSetupSectionStatusRow[];
  blocking_sections: EmployeeSetupSectionStatusRow[];
  failed_sections: EmployeeSetupSectionStatusRow[];
  stale_sections: EmployeeSetupSectionStatusRow[];
  blockers: Record<string, unknown>[];
  completion?: {
    complete: number;
    total: number;
    required_blocking: number;
    failed: number;
    stale: number;
  };
  last_evaluated_at: string;
}

export interface EmployeeSetupReadinessResponse {
  mode: "employee_360_setup" | string;
  employee_id: string;
  activation_switched: boolean;
  activation_requires_final_verification: boolean;
  request_id?: string;
  rebuilt_count?: number;
  failed_count?: number;
  readiness: EmployeeSetupReadiness;
  sections: EmployeeSetupSectionStatusRow[];
}

export interface Employee360FinalVerification {
  ok: boolean;
  status: "verified" | "blocked" | "failed" | "stale" | string;
  can_activate: boolean;
  activation_requires_final_verification: boolean;
  activation_requires_approval: boolean;
  activation_path: "direct_activation" | "approval_required" | "already_active" | "blocked" | string;
  employee_id: string;
  verified_sections: Record<string, unknown>[];
  blocking_sections: Record<string, unknown>[];
  failed_sections: Record<string, unknown>[];
  stale_sections: Record<string, unknown>[];
  blockers: Array<{
    section_key: string;
    section_label: string;
    status?: string | null;
    message: string;
    next_action: string;
    error_code?: string | null;
    request_id?: string | null;
  }>;
  warnings: Array<{
    section_key: string;
    section_label: string;
    status?: string | null;
    message: string;
    next_action: string;
    error_code?: string | null;
    request_id?: string | null;
  }>;
  duration_ms: number;
  request_id: string;
  rebuilt_sections: number;
  section_timings: Record<string, unknown>[];
  readiness?: Record<string, unknown>;
  sections?: Record<string, unknown>[];
}

export interface Employee360FinalActivationResponse extends EmployeeSetupReadinessResponse {
  verification: Employee360FinalVerification;
  employee: Employee | null;
  activated?: boolean;
  pending_approval?: boolean;
  idempotent?: boolean;
}

export interface EmployeeSetupStatusUpdate {
  mode: "employee_360_setup";
  updated_sections: EmployeeSetupSectionStatusRow[];
  stale_sections: EmployeeSetupSectionStatusRow[];
  readiness: EmployeeSetupReadiness;
  warnings: Array<{
    code: string;
    message: string;
    section_key?: string | null;
    section_label?: string | null;
    request_id?: string | null;
  }>;
}

export type WithEmployeeSetupStatusUpdate<T> = T & {
  setup_status_update?: EmployeeSetupStatusUpdate | null;
};
