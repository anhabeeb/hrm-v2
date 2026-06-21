export type RosterPeriodStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type RosterAssignmentStatus = "SCHEDULED" | "OFF" | "LEAVE" | "ABSENT_PLACEHOLDER" | "UNASSIGNED";

export interface ShiftTemplate {
  id: string;
  code: string;
  name: string;
  description: string | null;
  start_time: string;
  end_time: string;
  break_minutes: number;
  total_work_minutes: number | null;
  color_label: string | null;
  is_overnight: number | boolean;
  is_active: number | boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface RosterSettings {
  id: string;
  default_week_start_day: "MONDAY" | "SUNDAY";
  allow_published_roster_edits: number | boolean;
  require_reason_for_published_edits: number | boolean;
  show_leave_on_roster: number | boolean;
  show_attendance_on_roster: number | boolean;
  default_shift_template_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RosterPeriod {
  id: string;
  location_id: string | null;
  location_name?: string | null;
  department_id: string | null;
  department_name?: string | null;
  week_start_date: string;
  week_end_date: string;
  status: RosterPeriodStatus;
  published_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RosterAssignment {
  id?: string;
  roster_period_id?: string;
  period_status?: RosterPeriodStatus;
  week_start_date?: string;
  week_end_date?: string;
  employee_id: string;
  employee_no?: string;
  employee_name?: string;
  roster_date: string;
  shift_template_id: string | null;
  shift_code?: string | null;
  shift_name?: string | null;
  shift_start_time?: string | null;
  shift_end_time?: string | null;
  shift_color_label?: string | null;
  total_work_minutes?: number | null;
  custom_start_time: string | null;
  custom_end_time: string | null;
  break_minutes: number | null;
  status: RosterAssignmentStatus;
  notes: string | null;
  source: "MANUAL" | "COPIED" | "LEAVE_SYNC" | "SYSTEM";
  leave_indicator?: string | null;
  attendance_indicator?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface WeeklyOffRule {
  id: string;
  location_id: string | null;
  location_name?: string | null;
  department_id: string | null;
  department_name?: string | null;
  day_of_week: "SUNDAY" | "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY";
  is_active: number | boolean;
  created_at: string;
  updated_at: string;
}

export interface RosterEmployeeRow {
  employee_id: string;
  employee_no: string;
  full_name: string;
  department_name: string | null;
  position_title: string | null;
  location_name: string | null;
  job_level_name: string | null;
  roster_eligible: number | boolean;
}

export interface WeeklyRoster {
  roster_period?: RosterPeriod | null;
  period?: RosterPeriod | null;
  weekStart?: string;
  weekEnd?: string;
  weekStartDate?: string;
  week_start_date?: string;
  week_end_date?: string;
  days: Array<{ date: string; label: string }>;
  employees: RosterEmployeeRow[];
  assignments: RosterAssignment[];
  assignment_map: Record<string, RosterAssignment>;
  shift_templates: ShiftTemplate[];
}

export interface RosterDashboard {
  current_week_status?: string | null;
  employees_scheduled_this_week?: number;
  unassigned_assignments_this_week?: number;
  employees_on_leave_this_week?: number;
  off_day_count?: number;
  roster_conflicts?: number;
  recently_published_at?: string | null;
}
