export interface ApprovalWorkflowSettings {
  id: string;
  approval_workflows_enabled: boolean;
  use_central_workflow_for_supported_modules: boolean;
  fallback_to_module_approval_if_no_workflow: boolean;
  allow_auto_approval: boolean;
  block_self_approval_by_default: boolean;
  allow_super_admin_self_approval_override: boolean;
  allow_delegation: boolean;
  allow_parallel_approvals: boolean;
  allow_any_one_approval_mode: boolean;
  allow_all_required_approval_mode: boolean;
  escalation_enabled: boolean;
  reminders_enabled: boolean;
  default_escalation_time_basis: "CALENDAR_DAYS" | "WORKING_DAYS";
  default_employee_visibility_mode: "STEP_NAMES_ONLY" | "STEP_NAMES_AND_APPROVER_ROLES" | "FULL_APPROVER_NAMES";
  notify_on_submission: boolean;
  notify_on_approval: boolean;
  notify_on_rejection: boolean;
  notify_on_send_back: boolean;
  notify_on_escalation: boolean;
  notify_on_overdue: boolean;
  require_reason_for_reject: boolean;
  require_reason_for_send_back: boolean;
  require_reason_for_override: boolean;
}

export interface ApprovalWorkflow {
  id: string;
  workflow_code: string;
  workflow_name: string;
  description: string | null;
  module_key: string;
  action_key: string;
  applies_to_entity_type: string;
  priority_number: number;
  is_default: boolean;
  is_enabled: boolean;
  fallback_behavior: string;
  status: string;
  effective_from: string | null;
  effective_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApprovalWorkflowCondition {
  id: string;
  workflow_id: string;
  condition_group: string;
  condition_order: number;
  field_key: string;
  operator: string;
  value: unknown;
}

export interface ApprovalWorkflowStep {
  id: string;
  workflow_id: string;
  step_number: number;
  step_name: string;
  step_description: string | null;
  step_mode: "SEQUENTIAL" | "PARALLEL";
  approval_mode: "ANY_ONE" | "ALL_REQUIRED";
  approver_type: string;
  approver_user_id: string | null;
  approver_role_id: string | null;
  approver_permission_key: string | null;
  allow_self_approval: boolean | null;
  skip_if_no_approver: boolean;
  is_required: boolean;
  is_enabled: boolean;
}

export interface ApprovalInstance {
  id: string;
  workflow_id: string | null;
  workflow_code_snapshot: string | null;
  workflow_name_snapshot: string | null;
  module_key: string;
  action_key: string;
  entity_type: string;
  entity_id: string;
  employee_id: string | null;
  request_title: string;
  request_summary?: Record<string, unknown>;
  status: string;
  current_step_number: number | null;
  submitted_by_user_id: string;
  submitted_at: string;
  completed_at: string | null;
  fallback_used: boolean;
  auto_approved: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApprovalInstanceStep {
  id: string;
  approval_instance_id: string;
  step_number: number;
  step_name: string;
  step_mode: string;
  approval_mode: string;
  status: string;
  required_approver_count: number;
  approved_count: number;
  due_at: string | null;
}

export interface ApprovalStepAssignee {
  id: string;
  approval_instance_step_id: string;
  approval_instance_id: string;
  assigned_user_id: string;
  assigned_user_name_snapshot: string;
  assigned_role_snapshot: string | null;
  assignment_type: string;
  status: string;
}

export interface ApprovalAction {
  id: string;
  approval_instance_id: string;
  action: string;
  actor_name_snapshot: string | null;
  previous_status: string | null;
  new_status: string | null;
  note: string | null;
  reason: string | null;
  created_at: string;
}

export interface ApprovalDelegationRule {
  id: string;
  delegator_user_id: string;
  delegate_user_id: string;
  delegator_name?: string | null;
  delegate_name?: string | null;
  module_key: string | null;
  action_key: string | null;
  start_at: string;
  end_at: string;
  reason: string;
  status: string;
}

export interface ApprovalNotificationTemplate {
  id: string;
  template_code: string;
  template_name: string;
  module_key: string | null;
  action_key: string | null;
  event_type: string;
  channel: string;
  subject_template: string | null;
  body_template: string;
  is_enabled: number | boolean;
}

export interface ApprovalPreview {
  matched_workflow: ApprovalWorkflow | null;
  conditions_matched?: unknown;
  steps: Array<ApprovalWorkflowStep & { approvers?: Array<{ user_id: string; name: string | null; role: string | null }>; warnings?: string[] }>;
  fallback_behavior: string;
  warnings: string[];
}
