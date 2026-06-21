export type AttendanceStatus = "PRESENT" | "ABSENT" | "LEAVE" | "SICK" | "LATE" | "HALF_DAY" | "OFF_DAY" | "HOLIDAY" | "PENDING_CORRECTION";
export type AttendanceSource = "DEVICE" | "MANUAL" | "CORRECTION" | "LEAVE" | "ROSTER" | "SYSTEM";
export type DeviceStatus = "ACTIVE" | "INACTIVE" | "DISABLED";
export type DeviceType = "BIOMETRIC" | "MANUAL_IMPORT" | "API" | "BRIDGE" | "OTHER";
export type CorrectionStatus = "SUBMITTED" | "APPROVED" | "REJECTED" | "CANCELLED";

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
  first_clock_in: string | null;
  last_clock_out: string | null;
  total_work_minutes: number | null;
  late_minutes: number | null;
  early_checkout_minutes: number | null;
  missed_punch: number | boolean;
  source: AttendanceSource;
  payroll_impact_json: string | null;
  leave_request_id: string | null;
  roster_assignment_id: string | null;
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
  type: DeviceType;
  ip_address: string | null;
  serial_number: string | null;
  status: DeviceStatus;
  last_sync_at: string | null;
  last_seen_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceRawLog {
  id: string;
  device_id: string | null;
  device_name?: string | null;
  device_code?: string | null;
  employee_id: string | null;
  employee_no?: string | null;
  employee_name?: string | null;
  external_employee_code: string | null;
  punch_time: string;
  punch_type: "IN" | "OUT" | "BREAK_IN" | "BREAK_OUT" | "UNKNOWN" | null;
  source: "DEVICE" | "MANUAL_IMPORT" | "API" | "BRIDGE";
  raw_payload_json: string | null;
  imported_at: string;
  created_at: string;
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
  requested_clock_in: string | null;
  requested_clock_out: string | null;
  requested_status: AttendanceStatus | null;
  reason: string;
  status: CorrectionStatus;
  requested_by_user_id: string;
  requested_by_name?: string | null;
  reviewed_by_user_id: string | null;
  reviewed_by_name?: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceSettings {
  id: string;
  standard_work_minutes_per_day: number;
  default_shift_start_time: string | null;
  default_shift_end_time: string | null;
  late_grace_minutes: number;
  early_checkout_grace_minutes: number;
  weekly_off_days_json: string | null;
  mark_absent_if_no_punch: number | boolean;
  missed_punch_requires_correction: number | boolean;
  payroll_deduction_enabled: number | boolean;
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
