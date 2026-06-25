export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EARLY_LEAVE" | "HALF_DAY" | "LEAVE" | "SICK_LEAVE" | "LONG_LEAVE" | "DAY_OFF" | "PUBLIC_HOLIDAY" | "MISSING_PUNCH" | "PENDING_CORRECTION" | "CORRECTED" | "SICK" | "OFF_DAY" | "HOLIDAY";
export type AttendanceSource = "DEVICE" | "MANUAL" | "CORRECTION" | "LEAVE" | "ROSTER" | "SYSTEM";
export type DeviceStatus = "ACTIVE" | "INACTIVE" | "DISABLED" | "ARCHIVED";
export type DeviceType = "BIOMETRIC" | "MANUAL_IMPORT" | "API" | "BRIDGE" | "PUSH_ADMS" | "OTHER";
export type CorrectionStatus = "PENDING" | "SUBMITTED" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface AttendanceRecord {
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
  attendance_date: string;
  status: AttendanceStatus;
  calculated_status?: AttendanceStatus | null;
  final_status?: AttendanceStatus | null;
  first_clock_in: string | null;
  last_clock_out: string | null;
  total_work_minutes: number | null;
  late_minutes: number | null;
  early_checkout_minutes: number | null;
  missed_punch: number | boolean;
  missing_clock_in?: number | boolean;
  missing_clock_out?: number | boolean;
  is_absent?: number | boolean;
  is_late?: number | boolean;
  is_early_leave?: number | boolean;
  is_half_day?: number | boolean;
  is_leave_day?: number | boolean;
  is_public_holiday?: number | boolean;
  is_day_off?: number | boolean;
  source: AttendanceSource;
  payroll_impact_json: string | null;
  payroll_impact_status?: string | null;
  payroll_impact_minutes?: number | null;
  payroll_impact_days?: number | null;
  payroll_impact_reason?: string | null;
  leave_request_id: string | null;
  roster_assignment_id: string | null;
  roster_shift_id?: string | null;
  correction_status?: CorrectionStatus | null;
  locked_for_payroll?: number | boolean;
  generated_by?: string | null;
  generated_at?: string | null;
  metadata_json?: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceDevice {
  id: string;
  name: string;
  device_code: string;
  location_id: string | null;
  location_name?: string | null;
  vendor?: "ZKTECO" | "ZKTIME" | "ZKBIO_TIME" | "MANUAL_IMPORT" | "GENERIC_API" | "OTHER";
  model?: string | null;
  type: DeviceType;
  ip_address: string | null;
  port?: number | null;
  serial_number: string | null;
  timezone?: string | null;
  device_mode?: "CSV_IMPORT" | "LOCAL_BRIDGE" | "PUSH_ADMS" | "API_PLACEHOLDER" | "MANUAL";
  direction_mode?: "IN_OUT" | "AUTO_PAIR" | "PUNCH_STATE" | "UNKNOWN";
  external_device_id?: string | null;
  adms_device_key?: string | null;
  status: DeviceStatus;
  health_status?: "UNKNOWN" | "ONLINE" | "OFFLINE" | "WARNING" | "ERROR";
  sync_enabled?: number | boolean;
  allow_csv_import?: number | boolean;
  allow_bridge_import?: number | boolean;
  allow_push_adms?: number | boolean;
  last_sync_at: string | null;
  last_seen_at: string | null;
  last_error_at?: string | null;
  last_error_message?: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceRawLog {
  id: string;
  device_id: string | null;
  attendance_device_id?: string | null;
  import_batch_id?: string | null;
  device_name?: string | null;
  device_code?: string | null;
  employee_id: string | null;
  employee_no?: string | null;
  employee_name?: string | null;
  external_employee_code: string | null;
  biometric_user_id?: string | null;
  punch_time: string;
  punch_date?: string | null;
  punch_type: "IN" | "OUT" | "BREAK_IN" | "BREAK_OUT" | "UNKNOWN" | null;
  punch_state?: string | null;
  source: "DEVICE" | "MANUAL_IMPORT" | "CSV_IMPORT" | "API" | "BRIDGE" | "PUSH_ADMS";
  origin?: "CSV_IMPORT" | "LOCAL_BRIDGE" | "PUSH_ADMS" | "MANUAL" | "API" | "DEVICE";
  process_status?: "PENDING" | "MATCHED" | "UNMATCHED" | "DUPLICATE" | "ERROR" | "NORMALIZED" | "IGNORED" | "LOCKED_WARNING";
  duplicate_hash?: string | null;
  is_duplicate?: number | boolean;
  locked_day_warning_id?: string | null;
  error_message?: string | null;
  raw_payload_json: string | null;
  imported_at: string;
  created_at: string;
}

export interface AttendanceDeviceSettings {
  id: string;
  zkteco_csv_import_enabled: number | boolean;
  zkteco_local_bridge_enabled: number | boolean;
  zkteco_push_adms_enabled: number | boolean;
  auto_match_by_biometric_user_id: number | boolean;
  auto_match_by_employee_no: number | boolean;
  auto_normalize_after_import: number | boolean;
  prevent_locked_day_overwrite: number | boolean;
  duplicate_window_seconds: number;
  default_timezone: string | null;
  csv_allowed_extensions_json: string | null;
  max_import_rows: number;
  bridge_clock_skew_minutes: number;
}

export interface EmployeeBiometricMapping {
  id: string;
  employee_id: string;
  employee_no?: string | null;
  employee_name?: string | null;
  attendance_device_id: string | null;
  device_name?: string | null;
  device_code?: string | null;
  biometric_user_id: string;
  biometric_user_name: string | null;
  external_employee_code: string | null;
  mapping_source: string;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  is_primary: number | boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceImportBatch {
  id: string;
  batch_number: string;
  source: "ZKTECO_CSV" | "LOCAL_BRIDGE" | "PUSH_ADMS" | "MANUAL" | "API";
  attendance_device_id: string | null;
  device_name?: string | null;
  device_code?: string | null;
  file_name: string | null;
  status: string;
  total_rows: number;
  processed_rows: number;
  inserted_rows: number;
  duplicate_rows: number;
  unmatched_rows: number;
  error_rows: number;
  locked_warning_rows: number;
  uploaded_at: string;
  processed_at: string | null;
}

export interface AttendanceUnmatchedLog {
  id: string;
  raw_log_id: string;
  biometric_user_id: string | null;
  external_employee_code: string | null;
  punch_time: string | null;
  reason: string | null;
  status: "OPEN" | "RESOLVED" | "IGNORED";
  device_name?: string | null;
  device_code?: string | null;
  resolved_employee_id: string | null;
  resolved_employee_name?: string | null;
  created_at: string;
}

export interface AttendanceImportRowError {
  id: string;
  import_batch_id: string;
  batch_number?: string | null;
  row_number: number | null;
  error_code: string;
  error_message: string;
  status: "OPEN" | "RESOLVED" | "IGNORED";
  created_at: string;
}

export interface AttendanceLockedDayWarning {
  id: string;
  employee_id: string | null;
  employee_no?: string | null;
  employee_name?: string | null;
  attendance_date: string;
  warning_type: string;
  message: string;
  status: "OPEN" | "RESOLVED" | "DISMISSED";
  created_at: string;
}

export interface AttendanceVendorIntegration {
  id: string;
  vendor: string;
  integration_type: string;
  name: string;
  status: "ACTIVE" | "INACTIVE" | "DISABLED";
  last_test_at: string | null;
  last_test_status: string | null;
  last_test_message: string | null;
}

export interface AttendanceLog {
  id: string;
  employee_id: string | null;
  employee_no?: string | null;
  employee_name?: string | null;
  department_id?: string | null;
  department_name?: string | null;
  position_id?: string | null;
  position_title?: string | null;
  location_id?: string | null;
  location_name?: string | null;
  device_id: string | null;
  device_name?: string | null;
  device_code?: string | null;
  external_employee_code: string | null;
  log_time: string;
  log_type: "IN" | "OUT" | "BREAK_IN" | "BREAK_OUT" | "UNKNOWN";
  source: "DEVICE" | "MANUAL" | "MANUAL_IMPORT" | "API" | "BRIDGE";
  attendance_date: string;
  is_archived: number | boolean;
  notes: string | null;
  raw_payload_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceCorrection {
  id: string;
  employee_id: string;
  employee_no?: string;
  employee_name?: string;
  department_name?: string | null;
  position_title?: string | null;
  location_name?: string | null;
  attendance_date: string;
  current_record_id: string | null;
  request_type?: string | null;
  current_values_json?: string | null;
  requested_values_json?: string | null;
  requested_clock_in: string | null;
  requested_clock_out: string | null;
  requested_status: AttendanceStatus | null;
  reason: string;
  status: CorrectionStatus;
  requested_by_user_id: string;
  requested_by_name?: string | null;
  reviewed_by_user_id: string | null;
  reviewer_user_id?: string | null;
  reviewed_by_name?: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  reviewer_note?: string | null;
  metadata_json?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceSettings {
  id: string;
  module_enabled: number | boolean;
  default_workday_mode: "FIXED_SHIFT" | "ROSTER_BASED" | "FLEXIBLE";
  standard_work_minutes_per_day: number;
  default_shift_start_time: string | null;
  default_shift_end_time: string | null;
  late_grace_minutes: number;
  early_checkout_grace_minutes: number;
  weekly_off_days_json: string | null;
  mark_absent_if_no_punch: number | boolean;
  missed_punch_requires_correction: number | boolean;
  allow_manual_entries: number | boolean;
  require_reason_for_manual_entries: number | boolean;
  allow_employee_correction_requests: number | boolean;
  manual_entry_requires_approval: number | boolean;
  correction_requires_approval: number | boolean;
  payroll_impact_enabled: number | boolean;
  default_attendance_source: "DEVICE" | "MANUAL" | "MANUAL_IMPORT" | "API" | "BRIDGE";
  allow_manager_team_corrections: number | boolean;
  require_reason_for_correction_review: number | boolean;
  overtime_tracking_enabled: number | boolean;
  lock_after_payroll_finalized: number | boolean;
  monthly_attendance_lock_day: number | null;
  default_absent_status: AttendanceStatus;
  attendance_source_options_json: string | null;
  roster_integration_mode: "PLACEHOLDER" | "ROSTER_REQUIRED" | "ROSTER_OPTIONAL";
  public_holiday_integration_mode: "DAY_OVERRIDES" | "EXTERNAL_CALENDAR";
  absent_deduction_enabled: number | boolean;
  late_deduction_enabled: number | boolean;
  early_leave_deduction_enabled: number | boolean;
  payroll_deduction_enabled: number | boolean;
  created_at: string;
  updated_at: string;
}

export interface AttendancePayrollImpact {
  id: string;
  employee_id: string;
  employee_no?: string;
  employee_name?: string;
  attendance_date: string;
  status: AttendanceStatus;
  payroll_impact: Record<string, unknown>;
}

export interface AttendanceDayOverride {
  id: string;
  date: string | null;
  start_date: string;
  end_date: string;
  override_type: "PUBLIC_HOLIDAY" | "COMPANY_HOLIDAY" | "EMPLOYEE_OFF_DAY" | "ROSTERED_OFF_DAY" | "WEEKLY_OFF_DAY" | "SPECIAL_NON_WORKING_DAY";
  title: string;
  description: string | null;
  employee_id: string | null;
  employee_name?: string | null;
  department_id: string | null;
  department_name?: string | null;
  location_id: string | null;
  location_name?: string | null;
  applies_to_all: number | boolean;
  affects_leave_calculation: number | boolean;
  affects_payroll: number | boolean;
  is_active: number | boolean;
  created_at: string;
  updated_at: string;
}

export interface AttendanceDashboard {
  present_today: number;
  absent_today: number;
  late_today: number;
  missed_punch_today: number;
  pending_corrections: number;
  active_devices: number;
}
