-- Generated HRM v2 remote D1 schema repair.;

-- Review this file before applying it.;

-- Do not include transaction-control statements in D1/Wrangler command files.;

-- Apply with: npm run apply:remote-schema-repair;

PRAGMA foreign_keys = OFF;

-- Create missing table leave_balance_cycles;

CREATE TABLE IF NOT EXISTS leave_balance_cycles (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  leave_type_id TEXT NOT NULL,
  cycle_year INTEGER NOT NULL,
  cycle_start_date TEXT NOT NULL,
  cycle_end_date TEXT NOT NULL,
  opening_balance REAL NOT NULL DEFAULT 0,
  accrued_days REAL NOT NULL DEFAULT 0,
  used_days REAL NOT NULL DEFAULT 0,
  pending_days REAL NOT NULL DEFAULT 0,
  adjusted_days REAL NOT NULL DEFAULT 0,
  carried_forward_days REAL NOT NULL DEFAULT 0,
  expired_days REAL NOT NULL DEFAULT 0,
  closing_balance REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (employee_id, leave_type_id, cycle_year),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_leave_balance_cycles_employee ON leave_balance_cycles(employee_id, cycle_year);

-- Create missing table leave_balance_ledger_entries;

CREATE TABLE IF NOT EXISTS leave_balance_ledger_entries (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  leave_type_id TEXT NOT NULL,
  leave_request_id TEXT,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('OPENING', 'ACCRUAL', 'PENDING_HOLD', 'PENDING_RELEASE', 'USED', 'USED_REVERSAL', 'ADJUSTMENT', 'CARRY_FORWARD', 'EXPIRY')),
  days REAL NOT NULL,
  balance_before_json TEXT,
  balance_after_json TEXT,
  reason TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (cycle_id) REFERENCES leave_balance_cycles(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE CASCADE,
  FOREIGN KEY (leave_request_id) REFERENCES leave_requests(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_leave_ledger_employee ON leave_balance_ledger_entries(employee_id, created_at);

CREATE INDEX IF NOT EXISTS idx_leave_ledger_request ON leave_balance_ledger_entries(leave_request_id);

-- Create missing table leave_payroll_impacts;

CREATE TABLE IF NOT EXISTS leave_payroll_impacts (
  id TEXT PRIMARY KEY,
  leave_request_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  leave_type_id TEXT NOT NULL,
  salary_deduction_mode TEXT NOT NULL CHECK (salary_deduction_mode IN ('NONE', 'FULL_DAY', 'WORKED_DAYS_ONLY', 'CUSTOM', 'NO_DEDUCTION', 'DEDUCT_FROM_BASIC_SALARY', 'DEDUCT_FROM_GROSS_SALARY', 'DEDUCT_FROM_SELECTED_ALLOWANCE', 'FIXED_AMOUNT_PER_DAY', 'DAILY_RATE_FORMULA', 'DEDUCT_AFTER_ENTITLEMENT_EXHAUSTED', 'PAY_ONLY_WORKED_DAYS')),
  chargeable_days REAL NOT NULL DEFAULT 0,
  estimated_amount REAL,
  impact_json TEXT,
  status TEXT NOT NULL DEFAULT 'ESTIMATED' CHECK (status IN ('ESTIMATED', 'APPLIED', 'IGNORED', 'REVERSED')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (leave_request_id) REFERENCES leave_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_leave_payroll_impacts_request ON leave_payroll_impacts(leave_request_id);

-- Create missing table attendance_day_overrides;

CREATE TABLE IF NOT EXISTS attendance_day_overrides (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  override_date TEXT NOT NULL,
  day_type TEXT NOT NULL CHECK (day_type IN ('WORKING_DAY', 'WEEKLY_OFF', 'PUBLIC_HOLIDAY', 'HALF_DAY', 'CUSTOM')),
  affects_leave_calculation INTEGER NOT NULL DEFAULT 1 CHECK (affects_leave_calculation IN (0, 1)),
  leave_count_multiplier REAL,
  reason TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (employee_id, override_date),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_attendance_day_overrides_employee_date ON attendance_day_overrides(employee_id, override_date);

-- Create missing table attendance_logs;

CREATE TABLE IF NOT EXISTS attendance_logs (
  id TEXT PRIMARY KEY,
  employee_id TEXT,
  device_id TEXT,
  external_employee_code TEXT,
  log_time TEXT NOT NULL,
  log_type TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (log_type IN ('IN', 'OUT', 'BREAK_IN', 'BREAK_OUT', 'UNKNOWN')),
  source TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('DEVICE', 'MANUAL', 'MANUAL_IMPORT', 'API', 'BRIDGE')),
  attendance_date TEXT NOT NULL,
  notes TEXT,
  raw_payload_json TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  archived_by_user_id TEXT,
  archived_at TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL,
  FOREIGN KEY (device_id) REFERENCES attendance_devices(id) ON DELETE SET NULL,
  FOREIGN KEY (archived_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_attendance_logs_employee_date ON attendance_logs(employee_id, attendance_date);

CREATE INDEX IF NOT EXISTS idx_attendance_logs_log_time ON attendance_logs(log_time);

CREATE INDEX IF NOT EXISTS idx_attendance_logs_archived ON attendance_logs(is_archived, attendance_date);

-- Create missing table payroll_employee_results;

CREATE TABLE IF NOT EXISTS payroll_employee_results (
  id TEXT PRIMARY KEY,
  payroll_run_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  employee_no_snapshot TEXT NOT NULL,
  employee_name_snapshot TEXT NOT NULL,
  department_id TEXT,
  position_id TEXT,
  location_id TEXT,
  basic_salary REAL NOT NULL DEFAULT 0 CHECK (basic_salary >= 0),
  total_earnings REAL NOT NULL DEFAULT 0 CHECK (total_earnings >= 0),
  total_deductions REAL NOT NULL DEFAULT 0 CHECK (total_deductions >= 0),
  advance_deductions REAL NOT NULL DEFAULT 0 CHECK (advance_deductions >= 0),
  attendance_deductions REAL NOT NULL DEFAULT 0 CHECK (attendance_deductions >= 0),
  leave_deductions REAL NOT NULL DEFAULT 0 CHECK (leave_deductions >= 0),
  other_deductions REAL NOT NULL DEFAULT 0 CHECK (other_deductions >= 0),
  net_salary REAL NOT NULL DEFAULT 0,
  days_in_period INTEGER NOT NULL DEFAULT 0,
  scheduled_work_days INTEGER,
  days_worked INTEGER,
  absent_days INTEGER,
  leave_days INTEGER,
  unpaid_leave_days INTEGER,
  late_days INTEGER,
  missed_punch_days INTEGER,
  missed_date_ranges_json TEXT,
  calculation_json TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'READY_FOR_REVIEW', 'SUBMITTED_FOR_APPROVAL', 'APPROVED_PLACEHOLDER', 'FINALIZED_PLACEHOLDER', 'APPROVED', 'FINALIZED', 'HELD', 'EXCLUDED', 'CANCELLED')),
  hold_reason TEXT,
  finalized_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (payroll_run_id, employee_id),
  FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payroll_employee_results_run ON payroll_employee_results(payroll_run_id, status);

CREATE INDEX IF NOT EXISTS idx_payroll_employee_results_employee ON payroll_employee_results(employee_id);

-- Create missing table payroll_result_line_items;

CREATE TABLE IF NOT EXISTS payroll_result_line_items (
  id TEXT PRIMARY KEY,
  payroll_run_employee_id TEXT NOT NULL,
  payroll_component_id TEXT,
  line_type TEXT NOT NULL CHECK (line_type IN ('EARNING', 'DEDUCTION')),
  category TEXT,
  description TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount >= 0),
  source TEXT NOT NULL CHECK (source IN ('PROFILE', 'ADVANCE', 'ATTENDANCE', 'LEAVE', 'ROSTER', 'MANUAL', 'SYSTEM')),
  source_entity_type TEXT,
  source_entity_id TEXT,
  calculation_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (payroll_run_employee_id) REFERENCES payroll_employee_results(id) ON DELETE CASCADE,
  FOREIGN KEY (payroll_component_id) REFERENCES payroll_components(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payroll_result_line_items_result ON payroll_result_line_items(payroll_run_employee_id, line_type);

-- Create missing table payroll_approval_events;

CREATE TABLE IF NOT EXISTS payroll_approval_events (
  id TEXT PRIMARY KEY,
  payroll_period_id TEXT NOT NULL,
  payroll_run_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('SUBMITTED_FOR_APPROVAL', 'APPROVED', 'REJECTED', 'SENT_BACK', 'FINALIZED', 'UNLOCKED')),
  previous_status TEXT,
  new_status TEXT,
  actor_user_id TEXT,
  actor_name_snapshot TEXT,
  note TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
  FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payroll_approval_events_run ON payroll_approval_events(payroll_run_id, created_at);

CREATE INDEX IF NOT EXISTS idx_payroll_approval_events_period ON payroll_approval_events(payroll_period_id, created_at);

-- Create missing table payroll_payslips;

CREATE TABLE IF NOT EXISTS payroll_payslips (
  id TEXT PRIMARY KEY,
  payslip_number TEXT NOT NULL UNIQUE,
  payroll_period_id TEXT NOT NULL,
  payroll_run_id TEXT NOT NULL,
  payroll_employee_result_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'GENERATED' CHECK (status IN ('DRAFT', 'GENERATED', 'REGENERATED', 'CANCELLED')),
  generated_by_user_id TEXT,
  generated_at TEXT,
  regenerated_by_user_id TEXT,
  regenerated_at TEXT,
  version_number INTEGER NOT NULL DEFAULT 1 CHECK (version_number >= 1),
  payslip_data_json TEXT NOT NULL,
  html_snapshot TEXT,
  pdf_object_key TEXT,
  download_count INTEGER NOT NULL DEFAULT 0 CHECK (download_count >= 0),
  last_downloaded_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  UNIQUE (payroll_employee_result_id),
  FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
  FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (payroll_employee_result_id) REFERENCES payroll_employee_results(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (generated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (regenerated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payroll_payslips_run ON payroll_payslips(payroll_run_id, status);

CREATE INDEX IF NOT EXISTS idx_payroll_payslips_employee ON payroll_payslips(employee_id, generated_at);

CREATE INDEX IF NOT EXISTS idx_payroll_payslips_period ON payroll_payslips(payroll_period_id, status);

-- Create missing table payroll_payment_register;

CREATE TABLE IF NOT EXISTS payroll_payment_register (
  id TEXT PRIMARY KEY,
  payroll_period_id TEXT NOT NULL,
  payroll_run_id TEXT NOT NULL,
  payroll_employee_result_id TEXT NOT NULL UNIQUE,
  employee_id TEXT NOT NULL,
  employee_number_snapshot TEXT NOT NULL,
  employee_name_snapshot TEXT NOT NULL,
  payment_method_snapshot TEXT,
  bank_name_snapshot TEXT,
  bank_account_name_snapshot TEXT,
  bank_account_number_masked TEXT,
  net_salary_amount REAL NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'PREPARED', 'MANUALLY_CONFIRMED_PAID', 'FAILED_PLACEHOLDER', 'CANCELLED')),
  prepared_by_user_id TEXT,
  prepared_at TEXT,
  confirmed_paid_by_user_id TEXT,
  confirmed_paid_at TEXT,
  confirmation_reference TEXT,
  confirmation_note TEXT,
  failed_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
  FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (payroll_employee_result_id) REFERENCES payroll_employee_results(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (prepared_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (confirmed_paid_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payroll_payment_register_run ON payroll_payment_register(payroll_run_id, payment_status);

CREATE INDEX IF NOT EXISTS idx_payroll_payment_register_employee ON payroll_payment_register(employee_id);

CREATE INDEX IF NOT EXISTS idx_payroll_payment_register_period ON payroll_payment_register(payroll_period_id, payment_status);

-- Add missing columns;

ALTER TABLE "departments" ADD COLUMN head_employee_id TEXT;

ALTER TABLE "departments" ADD COLUMN manager_employee_id TEXT;

ALTER TABLE "attendance_daily_records" ADD COLUMN calculated_status TEXT CHECK (calculated_status IN ('PRESENT', 'ABSENT', 'LATE', 'EARLY_LEAVE', 'HALF_DAY', 'LEAVE', 'SICK_LEAVE', 'LONG_LEAVE', 'DAY_OFF', 'PUBLIC_HOLIDAY', 'MISSING_PUNCH', 'PENDING_CORRECTION', 'CORRECTED', 'SICK', 'OFF_DAY', 'HOLIDAY') OR calculated_status IS NULL);

ALTER TABLE "attendance_daily_records" ADD COLUMN final_status TEXT CHECK (final_status IN ('PRESENT', 'ABSENT', 'LATE', 'EARLY_LEAVE', 'HALF_DAY', 'LEAVE', 'SICK_LEAVE', 'LONG_LEAVE', 'DAY_OFF', 'PUBLIC_HOLIDAY', 'MISSING_PUNCH', 'PENDING_CORRECTION', 'CORRECTED', 'SICK', 'OFF_DAY', 'HOLIDAY') OR final_status IS NULL);

ALTER TABLE "attendance_daily_records" ADD COLUMN missing_clock_in INTEGER NOT NULL DEFAULT 0 CHECK (missing_clock_in IN (0, 1));

ALTER TABLE "attendance_daily_records" ADD COLUMN missing_clock_out INTEGER NOT NULL DEFAULT 0 CHECK (missing_clock_out IN (0, 1));

ALTER TABLE "attendance_daily_records" ADD COLUMN is_absent INTEGER NOT NULL DEFAULT 0 CHECK (is_absent IN (0, 1));

ALTER TABLE "attendance_daily_records" ADD COLUMN is_late INTEGER NOT NULL DEFAULT 0 CHECK (is_late IN (0, 1));

ALTER TABLE "attendance_daily_records" ADD COLUMN is_early_leave INTEGER NOT NULL DEFAULT 0 CHECK (is_early_leave IN (0, 1));

ALTER TABLE "attendance_daily_records" ADD COLUMN is_half_day INTEGER NOT NULL DEFAULT 0 CHECK (is_half_day IN (0, 1));

ALTER TABLE "attendance_daily_records" ADD COLUMN is_leave_day INTEGER NOT NULL DEFAULT 0 CHECK (is_leave_day IN (0, 1));

ALTER TABLE "attendance_daily_records" ADD COLUMN is_public_holiday INTEGER NOT NULL DEFAULT 0 CHECK (is_public_holiday IN (0, 1));

ALTER TABLE "attendance_daily_records" ADD COLUMN is_day_off INTEGER NOT NULL DEFAULT 0 CHECK (is_day_off IN (0, 1));

ALTER TABLE "attendance_daily_records" ADD COLUMN payroll_impact_status TEXT;

ALTER TABLE "attendance_daily_records" ADD COLUMN payroll_impact_minutes INTEGER;

ALTER TABLE "attendance_daily_records" ADD COLUMN payroll_impact_days REAL;

ALTER TABLE "attendance_daily_records" ADD COLUMN payroll_impact_reason TEXT;

ALTER TABLE "attendance_daily_records" ADD COLUMN roster_shift_id TEXT;

ALTER TABLE "attendance_daily_records" ADD COLUMN correction_status TEXT CHECK (correction_status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') OR correction_status IS NULL);

ALTER TABLE "attendance_daily_records" ADD COLUMN locked_for_payroll INTEGER NOT NULL DEFAULT 0 CHECK (locked_for_payroll IN (0, 1));

ALTER TABLE "attendance_daily_records" ADD COLUMN generated_by TEXT;

ALTER TABLE "attendance_daily_records" ADD COLUMN generated_at TEXT;

ALTER TABLE "attendance_daily_records" ADD COLUMN metadata_json TEXT;

ALTER TABLE "attendance_correction_requests" ADD COLUMN request_type TEXT NOT NULL DEFAULT 'OTHER';

ALTER TABLE "attendance_correction_requests" ADD COLUMN current_values_json TEXT;

ALTER TABLE "attendance_correction_requests" ADD COLUMN requested_values_json TEXT;

ALTER TABLE "attendance_correction_requests" ADD COLUMN reviewer_user_id TEXT;

ALTER TABLE "attendance_correction_requests" ADD COLUMN reviewer_note TEXT;

ALTER TABLE "attendance_correction_requests" ADD COLUMN metadata_json TEXT;

ALTER TABLE "attendance_settings" ADD COLUMN module_enabled INTEGER NOT NULL DEFAULT 1 CHECK (module_enabled IN (0, 1));

ALTER TABLE "attendance_settings" ADD COLUMN default_workday_mode TEXT NOT NULL DEFAULT 'FIXED_SHIFT' CHECK (default_workday_mode IN ('FIXED_SHIFT', 'ROSTER_BASED', 'FLEXIBLE'));

ALTER TABLE "attendance_settings" ADD COLUMN allow_manual_entries INTEGER NOT NULL DEFAULT 1 CHECK (allow_manual_entries IN (0, 1));

ALTER TABLE "attendance_settings" ADD COLUMN require_reason_for_manual_entries INTEGER NOT NULL DEFAULT 1 CHECK (require_reason_for_manual_entries IN (0, 1));

ALTER TABLE "attendance_settings" ADD COLUMN allow_employee_correction_requests INTEGER NOT NULL DEFAULT 1 CHECK (allow_employee_correction_requests IN (0, 1));

ALTER TABLE "attendance_settings" ADD COLUMN manual_entry_requires_approval INTEGER NOT NULL DEFAULT 0 CHECK (manual_entry_requires_approval IN (0, 1));

ALTER TABLE "attendance_settings" ADD COLUMN correction_requires_approval INTEGER NOT NULL DEFAULT 1 CHECK (correction_requires_approval IN (0, 1));

ALTER TABLE "attendance_settings" ADD COLUMN payroll_impact_enabled INTEGER NOT NULL DEFAULT 0 CHECK (payroll_impact_enabled IN (0, 1));

ALTER TABLE "attendance_settings" ADD COLUMN default_attendance_source TEXT NOT NULL DEFAULT 'MANUAL' CHECK (default_attendance_source IN ('DEVICE', 'MANUAL', 'MANUAL_IMPORT', 'API', 'BRIDGE'));

ALTER TABLE "attendance_settings" ADD COLUMN allow_manager_team_corrections INTEGER NOT NULL DEFAULT 1 CHECK (allow_manager_team_corrections IN (0, 1));

ALTER TABLE "attendance_settings" ADD COLUMN require_reason_for_correction_review INTEGER NOT NULL DEFAULT 1 CHECK (require_reason_for_correction_review IN (0, 1));

ALTER TABLE "attendance_settings" ADD COLUMN overtime_tracking_enabled INTEGER NOT NULL DEFAULT 0 CHECK (overtime_tracking_enabled IN (0, 1));

ALTER TABLE "attendance_settings" ADD COLUMN lock_after_payroll_finalized INTEGER NOT NULL DEFAULT 1 CHECK (lock_after_payroll_finalized IN (0, 1));

ALTER TABLE "attendance_settings" ADD COLUMN monthly_attendance_lock_day INTEGER CHECK (monthly_attendance_lock_day IS NULL OR (monthly_attendance_lock_day >= 1 AND monthly_attendance_lock_day <= 31));

ALTER TABLE "attendance_settings" ADD COLUMN default_absent_status TEXT NOT NULL DEFAULT 'ABSENT' CHECK (default_absent_status IN ('ABSENT', 'MISSING_PUNCH', 'PENDING_CORRECTION'));

ALTER TABLE "attendance_settings" ADD COLUMN attendance_source_options_json TEXT;

ALTER TABLE "attendance_settings" ADD COLUMN roster_integration_mode TEXT NOT NULL DEFAULT 'PLACEHOLDER' CHECK (roster_integration_mode IN ('PLACEHOLDER', 'ROSTER_REQUIRED', 'ROSTER_OPTIONAL'));

ALTER TABLE "attendance_settings" ADD COLUMN public_holiday_integration_mode TEXT NOT NULL DEFAULT 'DAY_OVERRIDES' CHECK (public_holiday_integration_mode IN ('DAY_OVERRIDES', 'EXTERNAL_CALENDAR'));

ALTER TABLE "attendance_settings" ADD COLUMN absent_deduction_enabled INTEGER NOT NULL DEFAULT 1 CHECK (absent_deduction_enabled IN (0, 1));

ALTER TABLE "attendance_settings" ADD COLUMN late_deduction_enabled INTEGER NOT NULL DEFAULT 0 CHECK (late_deduction_enabled IN (0, 1));

ALTER TABLE "attendance_settings" ADD COLUMN early_leave_deduction_enabled INTEGER NOT NULL DEFAULT 0 CHECK (early_leave_deduction_enabled IN (0, 1));

ALTER TABLE "shift_templates" ADD COLUMN expected_work_minutes INTEGER CHECK (expected_work_minutes IS NULL OR expected_work_minutes >= 0);

ALTER TABLE "shift_templates" ADD COLUMN default_worksite_location_id TEXT;

ALTER TABLE "shift_templates" ADD COLUMN department_id TEXT;

ALTER TABLE "shift_templates" ADD COLUMN badge_color TEXT;

ALTER TABLE "shift_templates" ADD COLUMN status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED'));

ALTER TABLE "shift_templates" ADD COLUMN is_day_off_template INTEGER NOT NULL DEFAULT 0 CHECK (is_day_off_template IN (0, 1));

ALTER TABLE "shift_templates" ADD COLUMN is_public_holiday_work_template INTEGER NOT NULL DEFAULT 0 CHECK (is_public_holiday_work_template IN (0, 1));

ALTER TABLE "shift_templates" ADD COLUMN payroll_impact_placeholder_json TEXT;

ALTER TABLE "shift_templates" ADD COLUMN created_by_user_id TEXT;

ALTER TABLE "shift_templates" ADD COLUMN updated_by_user_id TEXT;

ALTER TABLE "shift_templates" ADD COLUMN archived_by_user_id TEXT;

ALTER TABLE "shift_templates" ADD COLUMN archived_at TEXT;

ALTER TABLE "shift_templates" ADD COLUMN metadata_json TEXT;

ALTER TABLE "roster_settings" ADD COLUMN block_overlapping_shifts_by_default INTEGER NOT NULL DEFAULT 1 CHECK (block_overlapping_shifts_by_default IN (0, 1));

ALTER TABLE "roster_settings" ADD COLUMN allow_cross_worksite_assignment_with_permission INTEGER NOT NULL DEFAULT 1 CHECK (allow_cross_worksite_assignment_with_permission IN (0, 1));

ALTER TABLE "payroll_settings" ADD COLUMN module_enabled INTEGER NOT NULL DEFAULT 1 CHECK (module_enabled IN (0, 1));

-- Recreate missing indexes;

CREATE INDEX IF NOT EXISTS idx_shift_templates_status_sort ON shift_templates(status, sort_order);;

CREATE INDEX IF NOT EXISTS idx_shift_templates_location_department ON shift_templates(default_worksite_location_id, department_id);;

PRAGMA foreign_keys = ON;
