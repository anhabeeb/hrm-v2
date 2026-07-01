export type PayrollComponentType = "EARNING" | "DEDUCTION" | "INFO" | "EMPLOYER_COST" | "BASIC_SALARY" | "ALLOWANCE" | "FIXED_DEDUCTION" | "VARIABLE_DEDUCTION" | "ATTENDANCE_DEDUCTION" | "LEAVE_DEDUCTION" | "ADVANCE_DEDUCTION" | "BANK_LOAN_DEDUCTION" | "PENSION_EMPLOYEE_CONTRIBUTION" | "PENSION_EMPLOYER_CONTRIBUTION" | "ONE_TIME_DEDUCTION" | "OVERTIME_PLACEHOLDER" | "BENEFIT_PLACEHOLDER" | "ADJUSTMENT";
export type PayrollCalculationType = "FIXED" | "VARIABLE" | "PERCENTAGE" | "FIXED_AMOUNT" | "PERCENTAGE_OF_BASIC" | "PERCENTAGE_OF_GROSS" | "DAILY_RATE" | "HOURLY_RATE" | "FORMULA_PLACEHOLDER" | "MANUAL";
export type PayrollPeriodStatus = "DRAFT" | "CALCULATING" | "READY_FOR_REVIEW" | "SUBMITTED_FOR_APPROVAL" | "APPROVED_PLACEHOLDER" | "FINALIZED_PLACEHOLDER" | "REJECTED" | "SENT_BACK" | "APPROVED" | "FINALIZED" | "LOCKED" | "CANCELLED" | "OPEN" | "PROCESSING" | "REVIEW" | "PAID" | "CLOSED";
export type PayrollRunStatus = "DRAFT" | "CALCULATING" | "READY_FOR_REVIEW" | "SUBMITTED_FOR_APPROVAL" | "APPROVED_PLACEHOLDER" | "FINALIZED_PLACEHOLDER" | "REJECTED" | "SENT_BACK" | "APPROVED" | "FINALIZED" | "LOCKED" | "CANCELLED" | "PROCESSING" | "REVIEW" | "PAID";
export type PayrollAdvanceStatus = "REQUESTED" | "APPROVED" | "PAID" | "DEDUCTED" | "CANCELLED";

export interface PayrollComponent {
  id: string;
  code: string;
  name: string;
  type: PayrollComponentType;
  category: string | null;
  calculation_type: PayrollCalculationType;
  default_amount: number | null;
  default_percentage: number | null;
  applies_to_basic_salary: number | boolean;
  is_taxable: number | boolean | null;
  is_active: number | boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PayrollSettings {
  id: string;
  module_enabled?: number | boolean;
  default_currency: string;
  default_daily_rate_mode: "CALENDAR_DAYS" | "WORKING_DAYS" | "FIXED_30_DAYS";
  allow_negative_net_salary: number | boolean;
  require_approval_before_paid: number | boolean;
  include_attendance_deductions: number | boolean;
  include_leave_deductions: number | boolean;
  include_advance_deductions: number | boolean;
  include_roster_scheduled_days: number | boolean;
  default_salary_payment_day: number | null;
  payslips_enabled?: number | boolean;
  payment_register_enabled?: number | boolean;
  payment_methods_enabled?: number | boolean;
  payment_institutions_enabled?: number | boolean;
  employee_advances_enabled?: number | boolean;
  payroll_adjustments_enabled?: number | boolean;
  payroll_reports_enabled?: number | boolean;
  created_at: string;
  updated_at: string;
  bank_loan_deductions_enabled?: number | boolean;
  allow_multiple_bank_loans_per_employee?: number | boolean;
  require_loan_approval_before_payroll_deduction?: number | boolean;
  loan_deduction_priority?: number | null;
  allow_partial_loan_deduction?: number | boolean;
  block_payroll_if_loan_exceeds_net_salary?: number | boolean;
  show_loan_details_in_self_service?: number | boolean;
  show_loan_details_on_payslip?: number | boolean;
  bank_loan_requires_bank_salary_route_default?: number | boolean;
  bank_loan_cash_salary_default_ineligible?: number | boolean;
  bank_loan_statement_months_required_min?: number | null;
  bank_loan_statement_months_required_default?: number | null;
  bank_loan_salary_slips_months_required_default?: number | null;
  bank_loan_allow_cash_employee_override?: number | boolean;
  bank_loan_override_requires_reason?: number | boolean;
  bank_loan_override_requires_document?: number | boolean;
  bank_loan_insufficient_salary_mode?: "WARN_ONLY" | "PARTIAL_DEDUCTION" | "SKIP_AND_MARK_FAILED" | "BLOCK_PAYROLL" | "REQUIRE_OVERRIDE" | string | null;
  bank_loan_minimum_net_salary_protection_enabled?: number | boolean;
  bank_loan_minimum_net_salary_threshold_type?: "PERCENTAGE_OF_NET_SALARY" | "FIXED_AMOUNT" | string | null;
  bank_loan_minimum_net_salary_threshold_percentage?: number | null;
  bank_loan_minimum_net_salary_threshold_amount?: number | null;
  bank_loan_skip_if_below_threshold_enabled?: number | boolean;
  bank_loan_bank_notification_required_on_skip?: number | boolean;
  bank_loan_employee_direct_collection_status_enabled?: number | boolean;
  pension_enabled?: number | boolean;
  default_pension_scheme_id?: string | null;
  pension_auto_calculation_enabled?: number | boolean;
  pension_employee_contribution_default_percent?: number | null;
  pension_employer_contribution_default_percent?: number | null;
  pension_basis_default?: string | null;
  pension_show_on_payslip?: number | boolean;
  pension_show_in_self_service?: number | boolean;
  pension_remittance_enabled?: number | boolean;
  pension_employer_can_pay_employee_share?: number | boolean;
  foreign_employee_pension_default_enabled?: number | boolean;
  foreign_employee_voluntary_enrollment_enabled?: number | boolean;
  payroll_deduction_priority_json?: string | null;
  cash_salary_acknowledgement_enabled?: number | boolean;
  cash_salary_acknowledgement_required_before_finalize?: number | boolean;
  cash_salary_signature_capture_placeholder_enabled?: number | boolean;
  custom_deductions_enabled?: number | boolean;
  require_custom_deduction_approval?: number | boolean;
  custom_deduction_show_on_payslip_default?: number | boolean;
  custom_deduction_show_in_self_service_default?: number | boolean;
  custom_deduction_include_in_final_settlement_default?: number | boolean;
  custom_deduction_insufficient_salary_mode?: "WARN_ONLY" | "PARTIAL_DEDUCTION" | "SKIP_AND_MARK_FAILED" | "BLOCK_PAYROLL" | "REQUIRE_OVERRIDE" | string | null;
  custom_deduction_allow_partial_deduction?: number | boolean;
  custom_deduction_shortfall_carry_forward_enabled?: number | boolean;
  custom_deduction_priority_default?: number | null;
  custom_deduction_require_reason_for_cancel?: number | boolean;
  custom_deduction_require_document_for_sensitive_categories?: number | boolean;
}

export type CustomDeductionType = "ONE_TIME" | "RECURRING" | "INSTALLMENT" | "BALANCE_BASED" | "FORMULA_PLACEHOLDER";
export type CustomDeductionAmountType = "FIXED_AMOUNT" | "PERCENTAGE_OF_BASIC" | "PERCENTAGE_OF_GROSS" | "CUSTOM_FORMULA_PLACEHOLDER";
export type CustomDeductionStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED" | "ARCHIVED";
export type CustomDeductionApprovalStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface CustomDeductionTemplate {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string;
  deduction_type: CustomDeductionType;
  amount_type: CustomDeductionAmountType;
  default_amount: number | null;
  default_percentage: number | null;
  default_currency: string;
  default_installment_count: number | null;
  default_recurrence_interval: string | null;
  default_priority_number: number | null;
  affects_net_salary: number | boolean;
  show_on_payslip: number | boolean;
  show_in_self_service: number | boolean;
  require_employee_acknowledgement_placeholder: number | boolean;
  require_approval: number | boolean;
  require_document: number | boolean;
  allow_employee_override_amount: number | boolean;
  allow_installment_override: number | boolean;
  allow_pause_resume: number | boolean;
  include_in_final_settlement: number | boolean;
  linked_module: string;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  created_at: string;
  updated_at: string;
}

export interface EmployeeCustomDeduction {
  id: string;
  employee_id: string;
  employee_no?: string | null;
  employee_name?: string | null;
  department_name?: string | null;
  location_name?: string | null;
  template_id: string;
  template_code_snapshot: string;
  template_name_snapshot: string;
  template_code?: string | null;
  template_name?: string | null;
  category_snapshot: string;
  deduction_type: CustomDeductionType;
  amount_type: CustomDeductionAmountType;
  assigned_amount: number | null;
  assigned_percentage: number | null;
  currency: string;
  total_amount: number | null;
  remaining_balance: number | null;
  installment_count: number | null;
  installments_completed: number;
  installment_amount: number | null;
  recurrence_interval: string | null;
  payroll_period_id_start: string | null;
  payroll_period_id_end: string | null;
  start_date: string | null;
  end_date: string | null;
  effective_from: string;
  effective_to: string | null;
  priority_number: number | null;
  show_on_payslip: number | boolean;
  show_in_self_service: number | boolean;
  include_in_final_settlement: number | boolean;
  approval_status: CustomDeductionApprovalStatus;
  status: CustomDeductionStatus;
  source: string;
  source_reference_type: string | null;
  source_reference_id: string | null;
  supporting_document_id: string | null;
  reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmployeeCustomDeductionApplication {
  id: string;
  employee_custom_deduction_id: string;
  employee_id: string;
  employee_no?: string | null;
  employee_name?: string | null;
  template_id: string;
  template_name_snapshot?: string | null;
  category_snapshot?: string | null;
  payroll_period_id: string;
  payroll_run_id: string | null;
  payroll_employee_result_id: string | null;
  scheduled_amount: number;
  deducted_amount: number;
  shortfall_amount: number;
  remaining_balance_before: number | null;
  remaining_balance_after: number | null;
  installment_number: number | null;
  application_status: "SCHEDULED" | "APPLIED_IN_PAYROLL" | "PARTIAL" | "SKIPPED" | "FAILED" | "CANCELLED";
  reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type PaymentMethodType = "BANK_TRANSFER" | "CASH" | "CHEQUE_PLACEHOLDER" | "MOBILE_WALLET_PLACEHOLDER" | "OTHER";

export interface PaymentInstitution {
  id: string;
  code: string;
  name: string;
  type: "BANK" | "WALLET_PROVIDER" | "CASH_LOCATION" | "OTHER";
  country_code: string | null;
  swift_code: string | null;
  is_active: number | boolean;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface EmployeePaymentMethod {
  id: string;
  employee_id: string;
  payment_method_type: PaymentMethodType;
  payment_institution_id: string | null;
  payment_institution_name?: string | null;
  bank_name_snapshot: string | null;
  bank_account_name: string | null;
  bank_account_number_masked: string | null;
  wallet_provider: string | null;
  wallet_number: string | null;
  cheque_payee_name: string | null;
  cash_collection_location_id: string | null;
  cash_collection_location_name?: string | null;
  cash_collection_note: string | null;
  is_primary: number | boolean;
  allocation_type: "FULL" | "PERCENTAGE" | "FIXED_AMOUNT";
  allocation_percentage: number | null;
  allocation_amount: number | null;
  currency: string;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  verification_status: "UNVERIFIED" | "VERIFIED" | "REJECTED";
  effective_date: string | null;
  end_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BankLoanEligibilityRule {
  id: string;
  payment_institution_id: string | null;
  payment_institution_name?: string | null;
  loan_product_name: string | null;
  cash_salary_eligibility_rule: "INELIGIBLE_BY_DEFAULT" | "ALLOW_WITH_DOCUMENTS" | "ALLOW_WITH_BANK_CONFIRMATION" | "ALLOW_WITH_OVERRIDE";
  required_statement_months: number | null;
  required_salary_slip_months: number | null;
  employer_salary_undertaking_required: number | boolean;
  minimum_employment_months: number | null;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
}

export interface EmployeeBankLoan {
  id: string;
  employee_id: string;
  employee_no?: string | null;
  employee_name?: string | null;
  payment_institution_id: string;
  payment_institution_name?: string | null;
  bank_name_snapshot: string;
  loan_reference_number: string;
  loan_type: string;
  original_loan_amount: number | null;
  outstanding_balance: number | null;
  monthly_installment_amount: number;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";
  approval_status: "PENDING" | "APPROVED" | "REJECTED";
  priority_number: number | null;
  eligibility_status: "ELIGIBLE" | "INELIGIBLE_CASH_SALARY" | "PENDING_DOCUMENTS" | "BANK_CONFIRMED" | "OVERRIDDEN";
  eligibility_reason: string | null;
  employer_undertaking_required: number | boolean;
  employer_undertaking_status: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmployeeBankLoanPayment {
  id: string;
  employee_bank_loan_id: string;
  employee_id: string;
  payroll_period_id: string;
  bank_name_snapshot: string;
  loan_reference_number_snapshot: string;
  scheduled_installment_amount: number;
  deducted_amount: number;
  shortfall_amount: number;
  carried_forward_amount: number;
  payment_status: string;
  minimum_net_salary_threshold_type?: string | null;
  minimum_net_salary_threshold_value?: number | null;
  net_salary_before_loan?: number | null;
  net_salary_after_attempted_loan?: number | null;
  skipped_due_to_minimum_net_salary?: number | boolean;
  bank_direct_collection_required?: number | boolean;
  bank_notification_status?: string | null;
  bank_notification_reference?: string | null;
  bank_notification_note?: string | null;
  bank_notified_at?: string | null;
  employee_direct_collection_message?: string | null;
  remittance_reference: string | null;
  created_at: string;
}

export interface BankLoanRemittanceBatch {
  id: string;
  payroll_period_id: string;
  payment_institution_id: string;
  payment_institution_name?: string | null;
  period_label: string;
  total_deducted_amount: number;
  employee_count: number;
  status: string;
  remittance_reference: string | null;
  confirmation_note: string | null;
  created_at: string;
}

export interface PensionScheme {
  id: string;
  scheme_code: string;
  scheme_name: string;
  country_code: string;
  employee_contribution_percent: number;
  employer_contribution_percent: number;
  contribution_basis: "BASIC_SALARY_ONLY" | "GROSS_SALARY" | "CUSTOM_FORMULA_PLACEHOLDER";
  include_allowances: number | boolean;
  local_employee_required: number | boolean;
  foreign_employee_allowed: number | boolean;
  foreign_employee_default_required: number | boolean;
  employer_can_pay_employee_share: number | boolean;
  effective_from: string;
  effective_to: string | null;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  notes: string | null;
}

export interface EmployeePensionProfile {
  id: string;
  employee_id: string;
  pension_scheme_id: string | null;
  scheme_name?: string | null;
  scheme_code?: string | null;
  pension_member_id: string | null;
  registration_number: string | null;
  enrollment_status: "NOT_ENROLLED" | "ENROLLED" | "EXEMPTED" | "VOLUNTARY" | "SUSPENDED";
  employee_contribution_percent_override: number | null;
  employer_contribution_percent_override: number | null;
  employer_pays_employee_share: number | boolean;
  employee_extra_voluntary_contribution_amount: number;
  contribution_basis_override: string | null;
  effective_date: string;
  end_date: string | null;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  exemption_reason: string | null;
  notes: string | null;
}

export interface PayrollPensionContribution {
  id: string;
  payroll_period_id: string;
  payroll_run_id: string;
  employee_id: string;
  employee_no?: string | null;
  employee_name?: string | null;
  scheme_name?: string | null;
  pensionable_wage: number;
  employee_contribution_percent: number;
  employee_contribution_amount: number;
  employer_contribution_percent: number;
  employer_contribution_amount: number;
  total_contribution_amount: number;
  contribution_status: string;
  created_at: string;
}

export interface PensionRemittanceBatch {
  id: string;
  payroll_period_id: string;
  scheme_id: string;
  scheme_name?: string | null;
  period_label: string;
  employee_contribution_total: number;
  employer_contribution_total: number;
  total_remittance_amount: number;
  status: string;
  remittance_reference: string | null;
  confirmation_note: string | null;
  created_at: string;
}

export interface EmployeePayrollProfile {
  id?: string;
  employee_id: string;
  basic_salary: number;
  currency: string;
  payment_method: "CASH" | "BANK_TRANSFER" | "CHEQUE" | "OTHER";
  bank_name: string | null;
  bank_account_no: string | null;
  bank_account_name: string | null;
  payroll_included: number | boolean;
  overtime_eligible: number | boolean;
  benefits_eligible: number | boolean;
  advance_eligible: number | boolean;
  advance_limit_amount: number | null;
  advance_limit_percent: number | null;
  missed_day_deduction_enabled: number | boolean;
  leave_deduction_enabled: number | boolean;
  daily_rate_mode: "CALENDAR_DAYS" | "WORKING_DAYS" | "FIXED_30_DAYS";
  effective_from: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PayrollPeriod {
  id: string;
  period_month: number;
  period_year: number;
  start_date: string;
  end_date: string;
  salary_payment_date: string | null;
  status: PayrollPeriodStatus;
  created_by_name?: string | null;
  approved_at: string | null;
  paid_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayrollRun {
  id: string;
  payroll_period_id: string;
  period_month?: number;
  period_year?: number;
  start_date?: string;
  end_date?: string;
  run_no: number;
  status: PayrollRunStatus;
  calculation_mode: "STANDARD" | "RECALCULATION" | "FINAL_SETTLEMENT";
  generated_by_name?: string | null;
  generated_at: string;
  approved_at: string | null;
  paid_at: string | null;
  notes: string | null;
  employee_count?: number;
  total_earnings?: number;
  total_deductions?: number;
  net_salary_total?: number;
  created_at: string;
  updated_at: string;
}

export interface PayrollRunEmployee {
  id: string;
  payroll_run_id: string;
  employee_id: string;
  employee_no_snapshot: string | null;
  employee_name_snapshot: string;
  department_name?: string | null;
  position_title?: string | null;
  location_name?: string | null;
  basic_salary: number;
  total_earnings: number;
  total_deductions: number;
  advance_deductions: number;
  attendance_deductions: number;
  leave_deductions: number;
  other_deductions: number;
  net_salary: number;
  days_in_period: number;
  scheduled_work_days: number | null;
  days_worked: number | null;
  absent_days: number | null;
  leave_days: number | null;
  unpaid_leave_days: number | null;
  late_days: number | null;
  missed_punch_days: number | null;
  missed_date_ranges_json: string | null;
  calculation_json?: string | null;
  status: "DRAFT" | "READY_FOR_REVIEW" | "SUBMITTED_FOR_APPROVAL" | "APPROVED_PLACEHOLDER" | "FINALIZED_PLACEHOLDER" | "APPROVED" | "FINALIZED" | "HELD" | "EXCLUDED" | "CANCELLED" | "REVIEW" | "PAID";
  hold_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayrollRunLine {
  id: string;
  payroll_run_employee_id: string;
  payroll_component_id: string | null;
  line_type: PayrollComponentType;
  category: string | null;
  description: string;
  amount: number;
  source: string;
  source_entity_type: string | null;
  source_entity_id: string | null;
  calculation_json: string | null;
  created_at: string;
}

export interface PayrollAdvance {
  id: string;
  employee_id: string;
  employee_no?: string | null;
  employee_name?: string | null;
  department_name?: string | null;
  location_name?: string | null;
  amount: number;
  payment_date: string;
  repayment_period_id: string | null;
  repayment_period_label?: string | null;
  status: PayrollAdvanceStatus;
  notes: string | null;
  created_by_name?: string | null;
  approved_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayrollDeduction {
  id: string;
  employee_id: string;
  employee_no?: string | null;
  employee_name?: string | null;
  payroll_component_id: string | null;
  component_name?: string | null;
  deduction_type: "FIXED" | "VARIABLE" | "ONE_TIME" | "RECURRING";
  amount: number;
  start_date: string | null;
  end_date: string | null;
  payroll_period_id: string | null;
  reason: string;
  status: "ACTIVE" | "INACTIVE" | "APPLIED" | "CANCELLED";
  created_at: string;
  updated_at: string;
}

export interface PayrollAdjustment {
  id: string;
  employee_id: string;
  employee_no?: string | null;
  employee_name?: string | null;
  payroll_period_id: string | null;
  adjustment_type: PayrollComponentType;
  amount: number;
  reason: string;
  status: "DRAFT" | "APPROVED_PLACEHOLDER" | "APPROVED" | "APPLIED" | "CANCELLED";
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FinalSettlement {
  id: string;
  employee_id: string;
  employee_no?: string | null;
  employee_name?: string | null;
  payroll_period_id: string | null;
  final_salary_amount: number | null;
  pending_advance_amount: number | null;
  pending_deduction_amount: number | null;
  leave_encashment_amount: number | null;
  asset_recovery_amount: number | null;
  net_settlement_amount: number | null;
  status: "DRAFT" | "REVIEW" | "APPROVED" | "PAID" | "CANCELLED";
  reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmployeePayrollSummary {
  payroll_feature_status?: {
    payroll_core_enabled?: boolean;
    payment_methods_enabled?: boolean;
    payment_institutions_enabled?: boolean;
    bank_loan_deductions_enabled?: boolean;
    pension_enabled?: boolean;
    custom_deductions_enabled?: boolean;
    employee_advances_enabled?: boolean;
    payslips_enabled?: boolean;
    payment_register_enabled?: boolean;
  };
  profile: EmployeePayrollProfile;
  salary_history: Record<string, unknown>[];
  increments: Record<string, unknown>[];
  advances: PayrollAdvance[];
  deductions: PayrollDeduction[];
  runs: PayrollRunEmployee[];
  payslips?: PayrollPayslip[];
  settlements: FinalSettlement[];
  payment_methods?: EmployeePaymentMethod[];
  bank_loans?: EmployeeBankLoan[];
  bank_loan_payments?: EmployeeBankLoanPayment[];
  pension_profile?: EmployeePensionProfile | null;
  pension_contributions?: PayrollPensionContribution[];
  custom_deductions?: EmployeeCustomDeduction[];
  custom_deduction_applications?: EmployeeCustomDeductionApplication[];
  audit: Record<string, unknown>[];
}

export interface PayrollDashboard {
  current_period?: PayrollPeriod | null;
  draft_runs: number;
  approved_runs: number;
  paid_runs: number;
  current_period_net_total: number;
  pending_advances: number;
  employees_excluded_from_payroll: number;
  attendance_module_enabled?: boolean;
  attendance_disabled_notice?: string | null;
  attendance_deduction_candidates: number;
  leave_deduction_candidates: number;
  payroll_holds: number;
}

export interface PayrollApprovalEvent {
  id: string;
  payroll_period_id: string;
  payroll_run_id: string;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  actor_user_id: string | null;
  actor_name_snapshot: string | null;
  note: string | null;
  reason: string | null;
  created_at: string;
}

export interface PayrollPayslip {
  id: string;
  payslip_number: string;
  payroll_period_id: string;
  payroll_run_id: string;
  payroll_employee_result_id: string;
  employee_id: string;
  employee_no_snapshot?: string | null;
  employee_name_snapshot?: string | null;
  period_month?: number;
  period_year?: number;
  run_no?: number;
  status: "DRAFT" | "GENERATED" | "REGENERATED" | "CANCELLED";
  generated_at: string | null;
  version_number: number;
  download_count?: number;
  last_downloaded_at?: string | null;
  net_salary?: number;
}

export interface PayrollPaymentRegister {
  id: string;
  payroll_period_id: string;
  payroll_run_id: string;
  payroll_employee_result_id: string;
  employee_id: string;
  employee_number_snapshot: string | null;
  employee_name_snapshot: string;
  payment_method_snapshot: string | null;
  bank_name_snapshot: string | null;
  bank_account_name_snapshot: string | null;
  bank_account_number_masked: string | null;
  net_salary_amount: number;
  payment_status: "PENDING" | "PREPARED" | "MANUALLY_CONFIRMED_PAID" | "FAILED_PLACEHOLDER" | "CANCELLED";
  confirmation_reference: string | null;
  confirmation_note: string | null;
  period_month?: number;
  period_year?: number;
  run_no?: number;
  created_at: string;
  updated_at: string;
}

export interface PayrollHistoryRow {
  payroll_run_id: string;
  run_no: number;
  period_month: number;
  period_year: number;
  employee_id: string;
  employee_no_snapshot: string | null;
  employee_name_snapshot: string;
  department_name?: string | null;
  location_name?: string | null;
  basic_salary: number;
  total_earnings: number;
  total_deductions: number;
  net_salary: number;
  status: string;
}
