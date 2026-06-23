export type PayrollComponentType = "EARNING" | "DEDUCTION" | "BASIC_SALARY" | "ALLOWANCE" | "FIXED_DEDUCTION" | "VARIABLE_DEDUCTION" | "ATTENDANCE_DEDUCTION" | "LEAVE_DEDUCTION" | "ADVANCE_DEDUCTION" | "ONE_TIME_DEDUCTION" | "OVERTIME_PLACEHOLDER" | "BENEFIT_PLACEHOLDER" | "ADJUSTMENT";
export type PayrollCalculationType = "FIXED" | "VARIABLE" | "PERCENTAGE" | "FIXED_AMOUNT" | "PERCENTAGE_OF_BASIC" | "PERCENTAGE_OF_GROSS" | "DAILY_RATE" | "HOURLY_RATE" | "FORMULA_PLACEHOLDER" | "MANUAL";
export type PayrollPeriodStatus = "DRAFT" | "CALCULATING" | "READY_FOR_REVIEW" | "APPROVED_PLACEHOLDER" | "FINALIZED_PLACEHOLDER" | "LOCKED" | "CANCELLED" | "OPEN" | "PROCESSING" | "REVIEW" | "APPROVED" | "PAID" | "CLOSED";
export type PayrollRunStatus = "DRAFT" | "CALCULATING" | "READY_FOR_REVIEW" | "APPROVED_PLACEHOLDER" | "FINALIZED_PLACEHOLDER" | "LOCKED" | "CANCELLED" | "PROCESSING" | "REVIEW" | "APPROVED" | "PAID";
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
  default_currency: string;
  default_daily_rate_mode: "CALENDAR_DAYS" | "WORKING_DAYS" | "FIXED_30_DAYS";
  allow_negative_net_salary: number | boolean;
  require_approval_before_paid: number | boolean;
  include_attendance_deductions: number | boolean;
  include_leave_deductions: number | boolean;
  include_advance_deductions: number | boolean;
  include_roster_scheduled_days: number | boolean;
  default_salary_payment_day: number | null;
  created_at: string;
  updated_at: string;
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
  status: "DRAFT" | "READY_FOR_REVIEW" | "APPROVED_PLACEHOLDER" | "FINALIZED_PLACEHOLDER" | "HELD" | "EXCLUDED" | "CANCELLED" | "REVIEW" | "APPROVED" | "PAID";
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
  profile: EmployeePayrollProfile;
  salary_history: Record<string, unknown>[];
  increments: Record<string, unknown>[];
  advances: PayrollAdvance[];
  deductions: PayrollDeduction[];
  runs: PayrollRunEmployee[];
  settlements: FinalSettlement[];
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
  attendance_deduction_candidates: number;
  leave_deduction_candidates: number;
  payroll_holds: number;
}
