export type FinalSettlementCaseStatus =
  | "DRAFT"
  | "CALCULATING"
  | "READY_FOR_REVIEW"
  | "SUBMITTED_FOR_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "SENT_BACK"
  | "FINALIZED"
  | "LOCKED"
  | "CANCELLED";

export type FinalSettlementExitType = "RESIGNED" | "TERMINATED" | "END_OF_CONTRACT" | "ABSCONDED" | "RETIRED" | "DECEASED" | "OTHER";
export type FinalSettlementLineType = "EARNING" | "DEDUCTION" | "EMPLOYER_COST" | "WARNING" | "INFO";
export type FinalSettlementClearanceStatus = "PENDING" | "CLEARED" | "DEDUCTION_APPLIED" | "WAIVED" | "NOT_REQUIRED" | "BLOCKED";
export type FinalSettlementPaymentStatus = "PENDING" | "PREPARED" | "MANUALLY_CONFIRMED_PAID" | "RECEIVED_FROM_EMPLOYEE_PLACEHOLDER" | "WAIVED" | "CANCELLED";

export interface FinalSettlementSettings {
  id: string;
  module_enabled?: number | boolean;
  final_settlement_enabled?: number | boolean;
  allow_case_creation_from_exit_status?: number | boolean;
  allow_settlement_case_creation_from_exit_status?: number | boolean;
  auto_create_case_on_exit_status?: number | boolean;
  auto_create_settlement_case_on_exit_status?: number | boolean;
  require_approval_before_finalization?: number | boolean;
  require_settlement_approval_before_finalization?: number | boolean;
  require_clearance_before_finalization: number | boolean;
  require_document_checklist_before_finalization?: number | boolean;
  require_document_checklist_before_finalization_placeholder?: number | boolean;
  include_unpaid_salary?: number | boolean;
  include_pending_payroll?: number | boolean;
  include_unused_leave_payout?: number | boolean;
  include_negative_leave_balance_deduction?: number | boolean;
  include_unpaid_leave_deduction?: number | boolean;
  include_attendance_deduction?: number | boolean;
  include_bank_loan_deductions?: number | boolean;
  include_bank_loan_shortfall_warnings?: number | boolean;
  include_bank_loan_direct_collection_warnings?: number | boolean;
  include_pension_contribution?: number | boolean;
  include_pension_remittance_warnings?: number | boolean;
  include_custom_deduction_remaining_balances?: number | boolean;
  include_custom_deduction_shortfall_warnings?: number | boolean;
  include_advance_balance_deduction?: number | boolean;
  include_one_time_deductions?: number | boolean;
  include_asset_deductions?: number | boolean;
  include_uniform_deductions?: number | boolean;
  include_notice_period_deduction?: number | boolean;
  include_gratuity_placeholder?: number | boolean;
  include_contract_end_placeholder?: number | boolean;
  include_manual_earning_adjustments?: number | boolean;
  include_manual_deduction_adjustments?: number | boolean;
  settlement_payment_register_enabled?: number | boolean;
  final_settlement_document_placeholder_enabled?: number | boolean;
  final_settlement_document_pdf_placeholder_enabled?: number | boolean;
  allow_recalculation_while_draft?: number | boolean;
  allow_recalculation_after_approval?: number | boolean;
  allow_unlock_after_finalization?: number | boolean;
  require_reason_for_recalculation?: number | boolean;
  require_reason_for_unlock?: number | boolean;
  default_daily_rate_calculation_mode: "CALENDAR_DAYS" | "WORKING_DAYS" | "FIXED_30_DAYS";
  default_unused_leave_payout_calculation_mode?: "DAILY_RATE" | "FIXED_AMOUNT" | "MANUAL";
  default_notice_period_deduction_calculation_mode?: "DAILY_RATE" | "FIXED_AMOUNT" | "MANUAL";
  default_settlement_currency?: string;
  created_at: string;
  updated_at: string;
}

export interface FinalSettlementCase {
  id: string;
  settlement_number: string;
  employee_id: string;
  employee_no?: string | null;
  employee_number_snapshot?: string | null;
  employee_name?: string | null;
  employee_name_snapshot?: string | null;
  full_name?: string | null;
  department_id?: string | null;
  department_name?: string | null;
  department_snapshot?: string | null;
  worksite_id?: string | null;
  worksite_snapshot?: string | null;
  location_name?: string | null;
  location_snapshot?: string | null;
  position_id?: string | null;
  position_title?: string | null;
  position_snapshot?: string | null;
  employment_type_snapshot?: string | null;
  exit_type: FinalSettlementExitType;
  exit_status?: string | null;
  exit_date: string;
  last_working_day: string;
  settlement_period_start_date: string | null;
  settlement_period_end_date: string | null;
  reason: string | null;
  status: FinalSettlementCaseStatus;
  total_earnings: number | null;
  total_deductions: number | null;
  net_settlement_amount: number | null;
  payment_direction?: "COMPANY_TO_EMPLOYEE" | "EMPLOYEE_TO_COMPANY" | "ZERO_BALANCE";
  company_owes_employee_amount?: number | null;
  employee_owes_company_amount?: number | null;
  clearance_status: FinalSettlementClearanceStatus;
  approval_status?: string | null;
  payment_status?: FinalSettlementPaymentStatus | string | null;
  calculation_warnings?: unknown[];
  calculation_breakdown?: Record<string, unknown>;
  sensitive_restricted?: boolean;
  created_at: string;
  updated_at: string;
}

export interface FinalSettlementLineItem {
  id: string;
  settlement_case_id: string;
  employee_id: string;
  line_type: FinalSettlementLineType;
  component_code: string;
  component_name: string;
  component_source: string;
  amount: number | null;
  quantity?: number | null;
  rate?: number | null;
  source_reference_type?: string | null;
  source_reference_id?: string | null;
  notes?: string | null;
  metadata_json?: string | null;
  sensitive_restricted?: boolean;
  created_at: string;
}

export interface FinalSettlementClearanceItem {
  id: string;
  settlement_case_id: string;
  employee_id: string;
  clearance_type: "ASSET" | "UNIFORM" | "DOCUMENT" | "PAYROLL" | "LEAVE" | "ATTENDANCE" | "ROSTER" | "OTHER";
  source_reference_type: string | null;
  source_reference_id: string | null;
  title: string;
  description: string | null;
  status: FinalSettlementClearanceStatus;
  deduction_amount: number | null;
  reason: string | null;
  created_at: string;
  updated_at: string | null;
}

export interface FinalSettlementEvent {
  id: string;
  settlement_case_id: string;
  employee_id: string;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  actor_user_id: string | null;
  actor_name_snapshot: string | null;
  note: string | null;
  reason: string | null;
  created_at: string;
}

export interface FinalSettlementPaymentRegister {
  id: string;
  settlement_case_id: string;
  employee_id: string;
  employee_no_snapshot?: string | null;
  employee_number_snapshot?: string | null;
  employee_name_snapshot: string;
  payment_method_snapshot_json?: string | null;
  payment_method_type_snapshot?: string | null;
  payment_institution_snapshot?: string | null;
  payment_method_snapshot: string | null;
  bank_name_snapshot: string | null;
  bank_account_name_snapshot?: string | null;
  bank_account_number_masked: string | null;
  net_settlement_amount: number | null;
  payment_direction: "COMPANY_TO_EMPLOYEE" | "EMPLOYEE_TO_COMPANY" | "ZERO_BALANCE";
  payment_status: FinalSettlementPaymentStatus;
  prepared_at: string | null;
  confirmed_at: string | null;
  confirmation_reference: string | null;
  confirmation_note: string | null;
  cancellation_reason: string | null;
  sensitive_restricted?: boolean;
  created_at: string;
  updated_at: string;
}

export interface FinalSettlementSummary {
  case: FinalSettlementCase | null;
  line_items: FinalSettlementLineItem[];
  clearance: FinalSettlementClearanceItem[];
  events: FinalSettlementEvent[];
  payment: FinalSettlementPaymentRegister | null;
}

export interface FinalSettlementCalculation {
  case: FinalSettlementCase;
  summary?: Record<string, unknown>;
  line_items?: FinalSettlementLineItem[];
  clearance?: FinalSettlementClearanceItem[];
}
