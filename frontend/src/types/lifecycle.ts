export interface LifecycleSettings {
  id: string;
  [key: string]: unknown;
}

export interface OnboardingCase {
  id: string;
  case_number: string;
  employee_id: string;
  employee_no?: string | null;
  employee_name?: string | null;
  employee_number_snapshot?: string | null;
  employee_name_snapshot?: string | null;
  department_name?: string | null;
  location_name?: string | null;
  position_name?: string | null;
  job_level_name?: string | null;
  assigned_owner_name?: string | null;
  planned_start_date?: string | null;
  primary_department_id?: string | null;
  primary_location_id?: string | null;
  primary_position_id?: string | null;
  job_level_id?: string | null;
  onboarding_status: string;
  activation_status: string;
  due_date?: string | null;
  activated_at?: string | null;
  blockers_json?: string | null;
  blocker_types?: string[];
  setup_statuses?: Record<string, string>;
  has_started_setup?: boolean;
  ready_for_activation?: boolean;
  is_blocked?: boolean;
  is_overdue?: boolean;
  starting_this_week?: boolean;
  created_at: string;
}

export interface OffboardingCase {
  id: string;
  case_number: string;
  employee_id: string;
  employee_no?: string | null;
  employee_name?: string | null;
  employee_number_snapshot?: string | null;
  employee_name_snapshot?: string | null;
  department_name?: string | null;
  location_name?: string | null;
  position_name?: string | null;
  exit_type: string;
  last_working_day: string;
  offboarding_status: string;
  finalization_status: string;
  due_date?: string | null;
  finalized_at?: string | null;
  blockers_json?: string | null;
  created_at: string;
}

export interface LifecycleTask {
  id: string;
  task_key: string;
  task_name?: string | null;
  title?: string | null;
  task_group: string;
  task_status: string;
  status?: string | null;
  is_required?: number | boolean | null;
  required?: number | boolean | null;
  due_date?: string | null;
  waiver_reason?: string | null;
  blocked_reason?: string | null;
  notes?: string | null;
}

export interface LifecycleEvent {
  id: string;
  employee_id: string;
  case_type: "ONBOARDING" | "OFFBOARDING";
  case_id: string;
  action: string;
  previous_status?: string | null;
  new_status?: string | null;
  actor_name_snapshot?: string | null;
  reason?: string | null;
  note?: string | null;
  created_at: string;
}

export interface LifecycleSummary {
  employee?: Record<string, unknown>;
  onboarding?: OnboardingCase | null;
  onboarding_tasks: LifecycleTask[];
  offboarding?: OffboardingCase | null;
  offboarding_tasks: LifecycleTask[];
  events: LifecycleEvent[];
}
