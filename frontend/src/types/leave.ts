export type LeaveStatus = "DRAFT" | "SUBMITTED" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "CANCELLED";
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "SKIPPED";
export type DeductionMode = "NONE" | "FULL_DAY" | "WORKED_DAYS_ONLY" | "CUSTOM" | "NO_DEDUCTION" | "DEDUCT_FROM_BASIC_SALARY" | "DEDUCT_FROM_GROSS_SALARY" | "DEDUCT_FROM_SELECTED_ALLOWANCE" | "FIXED_AMOUNT_PER_DAY" | "DAILY_RATE_FORMULA" | "DEDUCT_AFTER_ENTITLEMENT_EXHAUSTED" | "PAY_ONLY_WORKED_DAYS";

export interface LeaveType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_paid_default: number | boolean;
  is_statutory: number | boolean;
  is_active: number | boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface LeavePolicy {
  id: string;
  leave_type_id: string;
  leave_type_name?: string;
  leave_type_code?: string;
  name: string;
  applies_to_employee_type: string | null;
  applies_to_employment_type: string | null;
  department_id: string | null;
  department_name?: string | null;
  position_id: string | null;
  position_title?: string | null;
  location_id: string | null;
  location_name?: string | null;
  annual_entitlement_days: number | null;
  allow_half_day: number | boolean;
  allow_carry_forward: number | boolean;
  carry_forward_limit_days: number | null;
  carry_forward_expiry_month: number | null;
  include_public_holidays: number | boolean;
  include_weekly_off_days: number | boolean;
  salary_deduction_mode: DeductionMode;
  deduction_pay_component: string | null;
  requires_document: number | boolean;
  document_required_after_consecutive_days: number | null;
  document_required_after_used_days: number | null;
  max_consecutive_days: number | null;
  min_notice_days: number | null;
  long_leave_threshold_days: number | null;
  is_active: number | boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface LeaveWorkflow {
  id: string;
  name: string;
  description: string | null;
  applies_to_leave_type_id: string | null;
  leave_type_name?: string | null;
  applies_to_employee_type: string | null;
  applies_to_employment_type: string | null;
  department_id: string | null;
  department_name?: string | null;
  location_id: string | null;
  location_name?: string | null;
  position_id?: string | null;
  position_title?: string | null;
  job_level_id?: string | null;
  job_level_name?: string | null;
  min_duration_days?: number | null;
  max_duration_days?: number | null;
  payroll_impact_only?: number | boolean;
  is_default: number | boolean;
  is_active: number | boolean;
  priority: number;
  steps_count?: number;
}

export interface LeaveWorkflowStep {
  id: string;
  workflow_id: string;
  step_order: number;
  step_name: string;
  approver_type: "ROLE" | "USER" | "REPORTING_MANAGER" | "DEPARTMENT_MANAGER" | "DEPARTMENT_SENIOR" | "DIRECTOR" | "HR_ROLE" | "PERMISSION" | "DEPARTMENT_HEAD" | "LOCATION_MANAGER" | "HR_MANAGER" | "FINANCE_MANAGER" | "OWNER";
  role_id: string | null;
  role_name?: string | null;
  user_id: string | null;
  user_name?: string | null;
  permission_key: string | null;
  is_required: number | boolean;
  skip_if_no_approver: number | boolean;
  allow_self_approval: number | boolean;
}

export interface LeaveRequest {
  id: string;
  employee_id: string;
  employee_no?: string;
  employee_name?: string;
  department_name?: string | null;
  position_title?: string | null;
  location_name?: string | null;
  leave_type_id: string;
  leave_type_name?: string;
  leave_type_code?: string;
  policy_id: string | null;
  policy_name?: string | null;
  start_date: string;
  end_date: string;
  total_days: number;
  requested_days: number;
  half_day_type: "FIRST_HALF" | "SECOND_HALF" | "NONE" | null;
  reason: string | null;
  status: LeaveStatus;
  document_required: number | boolean;
  document_status: "NOT_REQUIRED" | "REQUIRED_PENDING" | "PROVIDED";
  salary_deduction_mode: DeductionMode | null;
  salary_deduction_estimate_json: string | null;
  public_holiday_handling_json: string | null;
  current_approval_step?: string | null;
  current_approver_user_id?: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeaveApproval {
  id: string;
  leave_request_id: string;
  step_order: number;
  step_name: string;
  approver_user_id: string | null;
  approver_name?: string | null;
  approver_type: string;
  status: ApprovalStatus;
  action_by_user_id: string | null;
  action_by_name?: string | null;
  action_at: string | null;
  note: string | null;
}

export interface LeaveDocument {
  id: string;
  leave_request_id: string;
  employee_document_id: string;
  document_type_id: string | null;
  document_type_name?: string | null;
  document_type_code?: string | null;
  document_number?: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  employee_document_status: string;
  is_sensitive: number | boolean;
  attached_by_user_id: string;
  attached_at: string;
  created_at: string;
}

export interface LeaveBalance {
  id: string;
  employee_id: string;
  leave_type_id: string;
  leave_type_name?: string;
  leave_type_code?: string;
  period_year: number;
  opening_balance: number;
  accrued_days: number;
  used_days: number;
  pending_days: number;
  adjusted_days: number;
  carried_forward_days: number;
  expired_days: number;
  closing_balance: number;
}

export interface LeaveBalanceCycle extends Omit<LeaveBalance, "period_year"> {
  cycle_year: number;
  cycle_start_date: string;
  cycle_end_date: string;
  period_year?: number;
}

export interface LeaveDay {
  id: string;
  leave_request_id: string;
  leave_date: string;
  day_type: string;
  counted_as_leave: number | boolean;
  payroll_impact_json: string | null;
  status?: string;
  leave_type_name?: string;
}

export interface LeaveDashboard {
  pending_approvals: number;
  requests_this_month: number;
  approved_this_month: number;
  employees_currently_on_leave: number;
  upcoming_leave: number;
  missing_required_documents: number;
}
