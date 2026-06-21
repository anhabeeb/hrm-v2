export type AssetCategoryType = "ASSET" | "UNIFORM" | "OTHER";
export type AssetItemStatus = "AVAILABLE" | "ISSUED" | "DAMAGED" | "LOST" | "WRITTEN_OFF" | "ARCHIVED";
export type AssetAssignmentStatus = "ISSUED" | "RETURNED" | "DAMAGED" | "LOST" | "REPLACED" | "WRITTEN_OFF";
export type NoteVisibility = "GENERAL" | "HR_ONLY" | "RESTRICTED";

export interface AssetCategory {
  id: string;
  code: string;
  name: string;
  type?: AssetCategoryType;
  category_type: AssetCategoryType;
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
  variant?: string | null;
  size: string | null;
  color: string | null;
  condition_status: string;
  status: AssetItemStatus;
  purchase_date: string | null;
  purchase_cost: number | null;
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
  history: AssetAssignmentEvent[];
  counts?: Record<string, number>;
  summary?: Record<string, number>;
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
