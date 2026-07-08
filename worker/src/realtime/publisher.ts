import type { Env } from "../types";
import { emitQueryInvalidationEvent, eventQueryFamilies } from "../utils/app-events";

export type AccessRealtimeEvent =
  | "users.changed"
  | "roles.changed"
  | "permissions.changed"
  | "access.changed"
  | "employee.access.changed"
  | "users.roles.changed"
  | "organization.changed"
  | "locations.changed"
  | "departments.changed"
  | "positions.changed"
  | "job_levels.changed"
  | "employees.changed"
  | "employee.created"
  | "employee.updated"
  | "employee.status_changed"
  | "employee.archived"
  | "employee.onboarding_changed"
  | "documents.changed"
  | "document.uploaded"
  | "document.replaced"
  | "document.archived"
  | "document.restored"
  | "document.soft_deleted"
  | "document.permanently_deleted"
  | "document.expiry_alert_changed"
  | "document.required_missing_changed"
  | "employee.profile_photo_changed"
  | "leave.changed"
  | "leave.request.created"
  | "leave.request.submitted"
  | "leave.request.approved"
  | "leave.request.rejected"
  | "leave.request.cancelled"
  | "leave.approval.pending"
  | "leave.balance.updated"
  | "employee.leave.changed"
  | "attendance.changed"
  | "attendance.record.created"
  | "attendance.record.updated"
  | "attendance.raw_logs.imported"
  | "attendance.correction.created"
  | "attendance.correction.approved"
  | "attendance.correction.rejected"
  | "attendance.correction.cancelled"
  | "attendance.device.changed"
  | "employee.attendance.changed"
  | "dashboard.attendance.changed"
  | "dashboard.changed"
  | "dashboard.employees.changed"
  | "dashboard.documents.changed"
  | "dashboard.leave.changed"
  | "dashboard.roster.changed"
  | "dashboard.audit.changed"
  | "roster.changed"
  | "roster.period.created"
  | "roster.period.updated"
  | "roster.period.published"
  | "roster.period.archived"
  | "roster.assignment.created"
  | "roster.assignment.updated"
  | "roster.week.saved"
  | "roster.week.copied"
  | "roster.week.cleared"
  | "roster.weekly_off_rule.changed"
  | "employee.roster.changed"
  | "dashboard.roster.changed"
  | "payroll.changed"
  | "payroll.period.created"
  | "payroll.period.updated"
  | "payroll.run.generated"
  | "payroll.run.recalculated"
  | "payroll.run.approved"
  | "payroll.run.approved_placeholder"
  | "payroll.run.finalized_placeholder"
  | "payroll.run.cancelled"
  | "payroll.run.paid"
  | "payroll.advance.created"
  | "payroll.advance.updated"
  | "payroll.advance.approved"
  | "payroll.advance.paid"
  | "payroll.employee.changed"
  | "employee.payroll.changed"
  | "dashboard.payroll.changed"
  | "reports.changed"
  | "report.exported"
  | "contracts.changed"
  | "contract.created"
  | "contract.updated"
  | "contract.lifecycle_changed"
  | "contract.alert.changed"
  | "assets.changed"
  | "asset.item.created"
  | "asset.item.updated"
  | "asset.assignment.issued"
  | "asset.assignment.returned"
  | "asset.assignment.damaged"
  | "asset.assignment.lost"
  | "asset.assignment.written_off"
  | "employee.assets.changed"
  | "employee_notes.changed"
  | "employee_note.created"
  | "employee_note.updated"
  | "employee_note.archived"
  | "employee.audit.changed"
  | "dashboard.assets.changed"
  | "self_service.changed"
  | "kyc_request.submitted"
  | "kyc_request.reviewed"
  | "background_job.queued"
  | "background_job.updated"
  | "background_job.completed"
  | "background_job.failed"
  | "notification.created"
  | "notification.read"
  | "document.compliance.updated"
  | "onboarding.readiness.updated"
  | "payroll.payment_method.updated"
  | "attendance.summary.updated"
  | "payroll.summary.updated"
  | "report.artifact.ready"
  | "import.validation.completed"
  | "import.apply.completed"
  | "dashboard.summary.updated"
  | "module.visibility.updated";

export interface AccessRealtimePayload {
  actor_user_id?: string;
  employee_id?: string | null;
  user_id?: string | null;
  entity_type:
    | "user"
    | "role"
    | "permission"
    | "role_mapping_rule"
    | "access_scope"
    | "company"
    | "location"
    | "department"
    | "position"
    | "job_level"
    | "employee"
    | "employee_contact"
    | "employee_onboarding_task"
    | "employee_status"
    | "employee_numbering"
    | "document"
    | "document_category"
    | "document_type"
    | "document_required_rule"
    | "document_version"
    | "document_report"
    | "leave_type"
    | "leave_policy"
    | "leave_workflow"
    | "leave_workflow_step"
    | "leave_request"
    | "leave_balance"
    | "leave_report"
    | "attendance_device"
    | "attendance_device_settings"
    | "attendance_import_batch"
    | "attendance_import_error"
    | "attendance_locked_day_import_warning"
    | "attendance_unmatched_log"
    | "attendance_vendor_integration"
    | "employee_biometric_mapping"
    | "attendance_raw_log"
    | "attendance_record"
    | "attendance_correction"
    | "attendance_settings"
    | "attendance_report"
    | "shift_template"
    | "roster_period"
    | "roster_assignment"
    | "weekly_off_rule"
    | "roster_change_request"
    | "roster_settings"
    | "roster_report"
    | "payroll_component"
    | "payroll_settings"
    | "payroll_profile"
    | "salary_history"
    | "payroll_increment"
    | "payroll_period"
    | "payroll_run"
    | "payroll_run_employee"
    | "payroll_advance"
    | "payroll_deduction"
    | "payroll_adjustment"
    | "final_settlement"
    | "payroll_report"
    | "asset_category"
    | "asset_item"
    | "asset_assignment"
    | "asset_assignment_event"
    | "asset_deduction_rule"
    | "asset_attachment"
    | "asset_uniform_settings"
    | "asset_uniform_assignment_event"
    | "uniform_type"
    | "uniform_stock_item"
    | "uniform_assignment"
    | "employee_note_category"
    | "employee_note"
    | "employee_note_version"
    | "employee_note_attachment"
    | "audit_log"
    | "audit_export"
    | "report"
    | "report_artifact"
    | "background_job"
    | "import_batch"
    | "module_control_setting"
    | "contract"
    | "contract_alert"
    | "dashboard"
    | "kyc_request"
    | "self_service";
  entity_id?: string;
  action: string;
}

function moduleKeyFromEvent(event: string, payload: AccessRealtimePayload) {
  const prefix = event.split(".")[0] ?? "";
  if (event.includes("document")) return "documents";
  if (event.includes("onboarding")) return "onboarding";
  if (event.includes("payroll")) return "payroll";
  if (event.includes("attendance")) return "attendance";
  if (event.includes("roster")) return "roster";
  if (event.includes("leave")) return "leave";
  if (event.includes("asset")) return "assets_uniforms";
  if (event.includes("contract")) return "contracts";
  if (event.includes("report")) return "reports";
  if (event.includes("dashboard")) return "dashboard";
  if (event.includes("role") || event.includes("permission") || event.includes("access") || event.includes("user")) return "admin";
  if (payload.entity_type === "employee") return "employees";
  return prefix || "general";
}

function queryFamiliesForPublishedEvent(event: string, moduleKey: string, payload: AccessRealtimePayload) {
  const employeeId = payload.employee_id ?? (payload.entity_type === "employee" ? payload.entity_id : null);
  return eventQueryFamilies({
    eventType: event,
    moduleKey,
    entityType: payload.entity_type,
    entityId: payload.entity_id,
    payload: {
      action: payload.action,
      employee_id: employeeId,
      user_id: payload.user_id ?? null
    }
  });
}

export async function publishAccessEvent(env: Env, event: AccessRealtimeEvent, payload: AccessRealtimePayload) {
  const moduleKey = moduleKeyFromEvent(event, payload);
  const employeeId = payload.employee_id ?? (payload.entity_type === "employee" ? payload.entity_id : null);
  await emitQueryInvalidationEvent(env.DB, {
    eventType: event,
    moduleKey,
    entityType: payload.entity_type,
    entityId: payload.entity_id ?? employeeId ?? null,
    visibility: payload.user_id ? "USER" : "COMPANY",
    userScopeId: payload.user_id ?? null,
    createdByUserId: payload.actor_user_id ?? null,
    payload: {
      action: payload.action,
      employee_id: employeeId ?? null,
      user_id: payload.user_id ?? null,
      safe_label: event.replace(/[_.]/g, " ")
    },
    queryKeys: queryFamiliesForPublishedEvent(event, moduleKey, payload),
    dedupeKey: `publish:${event}:${payload.entity_type}:${payload.entity_id ?? employeeId ?? "none"}:${payload.action}`
  });
}
