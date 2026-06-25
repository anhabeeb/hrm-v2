export type AssetCategoryType = "ASSET" | "UNIFORM" | "OTHER";
export type AssetCategoryKind = "ELECTRONICS" | "ACCESS" | "EQUIPMENT" | "FURNITURE" | "ACCOMMODATION" | "OTHER";
export type AssetItemStatus = "AVAILABLE" | "ISSUED" | "DAMAGED" | "LOST" | "WRITTEN_OFF" | "ARCHIVED";
export type AssetAssignmentStatus = "ISSUED" | "RETURNED" | "DAMAGED" | "LOST" | "REPLACED" | "WRITTEN_OFF";
export type NoteVisibility = "GENERAL" | "HR_ONLY" | "RESTRICTED";

export interface AssetCategory {
  id: string;
  code: string;
  name: string;
  type?: AssetCategoryType;
  category_type: AssetCategoryKind | AssetCategoryType;
  description: string | null;
  default_replacement_cost: number | null;
  is_uniform: boolean | number;
  requires_return: boolean | number;
  is_protected: boolean | number;
  is_active: boolean | number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface AssetItem {
  id: string;
  category_id: string;
  category_name?: string | null;
  code: string;
  name: string;
  serial_number: string | null;
  serial_no?: string | null;
  asset_code?: string | null;
  brand?: string | null;
  model?: string | null;
  variant?: string | null;
  size: string | null;
  color: string | null;
  condition_status: string;
  status: AssetItemStatus;
  lifecycle_status?: string | null;
  assigned_employee_id?: string | null;
  assigned_location_id?: string | null;
  assigned_worksite_id?: string | null;
  purchase_date: string | null;
  purchase_cost: number | null;
  purchase_value?: number | null;
  current_value?: number | null;
  currency?: string | null;
  replacement_cost: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssetAssignment {
  id: string;
  employee_id: string;
  employee_no?: string | null;
  employee_name?: string | null;
  department_name?: string | null;
  location_name?: string | null;
  asset_item_id: string;
  asset_code?: string | null;
  asset_name?: string | null;
  category_name?: string | null;
  issued_at: string;
  issued_date?: string | null;
  expected_return_at: string | null;
  expected_return_date?: string | null;
  returned_at: string | null;
  returned_date?: string | null;
  status: AssetAssignmentStatus;
  assignment_status?: string | null;
  clearance_status?: string | null;
  custom_deduction_id?: string | null;
  deduction_status?: string | null;
  waiver_reason?: string | null;
  document_id?: string | null;
  condition_on_issue: string | null;
  condition_on_return: string | null;
  issue_notes: string | null;
  notes?: string | null;
  return_notes: string | null;
  replacement_cost_charged: number | null;
  deduction_amount?: number | null;
  payroll_deduction_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssetAssignmentEvent {
  id: string;
  assignment_id: string;
  event_type: string;
  reason: string | null;
  event_by_user_id: string | null;
  event_by_name?: string | null;
  created_at: string;
}

export interface AssetDeductionRule {
  id: string;
  category_id: string | null;
  category_name?: string | null;
  condition_status?: string | null;
  event_type?: string | null;
  deduction_mode: string;
  deduction_amount?: number | null;
  deduction_percent?: number | null;
  fixed_amount: number | null;
  percentage: number | null;
  payroll_component_id: string | null;
  payroll_component_code?: string | null;
  is_active: boolean | number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssetDashboard {
  total_items?: number;
  available_items?: number;
  issued_items?: number;
  damaged_items?: number;
  lost_items?: number;
  pending_returns?: number;
  pending_deductions?: number;
  [key: string]: unknown;
}

export interface EmployeeAssetSummary {
  current_assignments?: AssetAssignment[];
  assignments?: AssetAssignment[];
  assets?: AssetAssignment[];
  uniforms?: UniformAssignment[];
  history: AssetAssignmentEvent[];
  clearance?: AssetUniformClearanceSummary;
  counts?: Record<string, number>;
  summary?: Record<string, number>;
}

export interface AssetUniformSettings {
  id: string;
  asset_module_enabled: number | boolean;
  uniform_module_enabled: number | boolean;
  require_approval_before_asset_issue: number | boolean;
  require_approval_before_asset_return: number | boolean;
  require_approval_before_asset_transfer: number | boolean;
  require_approval_before_damage_loss_deduction: number | boolean;
  require_approval_before_waiver: number | boolean;
  require_document_for_damage_loss: number | boolean;
  require_photo_proof_placeholder: number | boolean;
  allow_payroll_deduction_for_lost_damaged_items: number | boolean;
  allow_final_settlement_deduction: number | boolean;
  default_asset_clearance_required_before_final_settlement: number | boolean;
  default_uniform_clearance_required_before_final_settlement: number | boolean;
  default_damage_deduction_mode: string;
  default_uniform_replacement_cycle_months: number | null;
  allow_employee_self_service_asset_view: number | boolean;
  allow_employee_self_service_uniform_view: number | boolean;
  require_reason_for_waiver: number | boolean;
  require_reason_for_deduction: number | boolean;
  require_reason_for_cancel: number | boolean;
  use_central_approval_workflow: number | boolean;
  updated_at: string;
}

export interface UniformType {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string;
  default_replacement_cycle_months: number | null;
  default_clearance_required: number | boolean;
  default_deductible_if_lost: number | boolean;
  default_deductible_if_damaged: number | boolean;
  default_deduction_amount: number | null;
  is_active: number | boolean;
  status: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface UniformStockItem {
  id: string;
  uniform_type_id: string;
  uniform_type_code?: string | null;
  uniform_type_name?: string | null;
  category?: string | null;
  size_label: string | null;
  worksite_id: string | null;
  location_id: string | null;
  location_name?: string | null;
  total_quantity: number;
  available_quantity: number;
  issued_quantity: number;
  damaged_quantity: number;
  lost_quantity: number;
  retired_quantity: number;
  reorder_level: number | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface UniformAssignment {
  id: string;
  employee_id: string;
  employee_no?: string | null;
  employee_name?: string | null;
  department_name?: string | null;
  location_name?: string | null;
  uniform_stock_item_id: string;
  uniform_type_id: string;
  uniform_type_code?: string | null;
  uniform_type_name?: string | null;
  size_label: string | null;
  quantity_issued: number;
  quantity_returned: number;
  quantity_damaged: number;
  quantity_lost: number;
  issued_date: string;
  expected_return_date: string | null;
  returned_date: string | null;
  assignment_status: string;
  clearance_status: string;
  deduction_amount: number | null;
  deduction_status: string | null;
  custom_deduction_id: string | null;
  waiver_reason: string | null;
  document_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssetUniformEvent {
  id: string;
  entity_type: string;
  assignment_id: string;
  employee_id: string;
  action: string;
  previous_status: string | null;
  new_status: string | null;
  actor_name_snapshot?: string | null;
  actor_name?: string | null;
  reason: string | null;
  note: string | null;
  amount: number | null;
  created_at: string;
}

export interface AssetUniformClearanceSummary {
  asset_clearance: {
    pending_count: number;
    pending_items: AssetAssignment[];
    estimated_deduction_amount: number;
    clearance_required: boolean;
  };
  uniform_clearance: {
    pending_count: number;
    pending_items: UniformAssignment[];
    estimated_deduction_amount: number;
    clearance_required: boolean;
  };
  pending_count: number;
  estimated_deduction_amount: number;
  clearance_required: boolean;
}

export interface EmployeeNoteCategory {
  id: string;
  key?: string;
  code?: string;
  name: string;
  description: string | null;
  default_visibility: NoteVisibility;
  is_protected: boolean | number;
  is_active: boolean | number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface EmployeeNote {
  id: string;
  employee_id: string;
  category_id: string | null;
  category_name?: string | null;
  title: string;
  note_body: string;
  visibility: NoteVisibility;
  linked_module: string | null;
  linked_entity_id: string | null;
  created_by_user_id: string;
  created_by_name?: string | null;
  is_archived: boolean | number;
  archive_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmployeeNoteVersion {
  id: string;
  employee_note_id: string;
  version_no: number;
  title: string;
  note_body: string;
  visibility: NoteVisibility;
  edited_by_name?: string | null;
  edit_reason: string | null;
  created_at: string;
}

export interface EmployeeNoteAttachment {
  id: string;
  employee_note_id: string;
  employee_document_id: string | null;
  document_number?: string | null;
  document_type_name?: string | null;
  original_filename?: string | null;
  attached_by_name?: string | null;
  is_sensitive?: boolean | number;
  restricted?: boolean;
  unavailable?: boolean;
  description: string | null;
  attached_at: string;
}

export interface AuditLogRow {
  id: string;
  actor_user_id: string | null;
  actor_name?: string | null;
  actor_email?: string | null;
  action: string;
  module: string;
  entity_type: string;
  entity_id: string | null;
  reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}
