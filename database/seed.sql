INSERT OR IGNORE INTO permissions (id, key, module, description, is_critical) VALUES
  ('perm_dashboard_view', 'dashboard.view', 'dashboard', 'View dashboard overview', 0),
  ('perm_users_view', 'users.view', 'users', 'View users and access records', 1),
  ('perm_users_create', 'users.create', 'users', 'Create user accounts', 1),
  ('perm_users_update', 'users.update', 'users', 'Update user accounts', 1),
  ('perm_users_disable', 'users.disable', 'users', 'Disable or lock user accounts', 1),
  ('perm_roles_view', 'roles.view', 'roles', 'View roles', 1),
  ('perm_roles_create', 'roles.create', 'roles', 'Create roles', 1),
  ('perm_roles_update', 'roles.update', 'roles', 'Update roles', 1),
  ('perm_roles_assign_permissions', 'roles.assign_permissions', 'roles', 'Assign permissions to roles', 1),
  ('perm_role_mappings_view', 'role_mappings.view', 'role_mappings', 'View role mapping rules and previews', 1),
  ('perm_role_mappings_manage', 'role_mappings.manage', 'role_mappings', 'Create and manage role mapping rules', 1),
  ('perm_role_mappings_apply', 'role_mappings.apply', 'role_mappings', 'Apply role mappings to employee-linked users', 1),
  ('perm_access_scopes_view', 'access_scopes.view', 'access_scopes', 'View role and user data access scopes', 1),
  ('perm_access_scopes_manage', 'access_scopes.manage', 'access_scopes', 'Create and manage role and user data access scopes', 1),
  ('perm_access_scopes_apply', 'access_scopes.apply', 'access_scopes', 'Apply data access scopes to users or access templates', 1),
  ('perm_settings_view', 'settings.view', 'settings', 'View system settings', 1),
  ('perm_settings_manage', 'settings.manage', 'settings', 'Manage system settings', 1),
  ('perm_organization_view', 'organization.view', 'organization', 'View organization master data', 0),
  ('perm_organization_manage', 'organization.manage', 'organization', 'Manage organization master data', 0),
  ('perm_employees_view', 'employees.view', 'employees', 'View employee records', 0),
  ('perm_employees_create', 'employees.create', 'employees', 'Create employee records', 0),
  ('perm_employees_update', 'employees.update', 'employees', 'Update employee records', 0),
  ('perm_employees_archive', 'employees.archive', 'employees', 'Archive employee records', 0),
  ('perm_employees_status_manage', 'employees.status.manage', 'employees', 'Manage employee statuses and status changes', 0),
  ('perm_employees_numbering_manage', 'employees.numbering.manage', 'employees', 'Manage employee numbering settings', 0),
  ('perm_employees_sensitive_view', 'employees.sensitive.view', 'employees', 'View sensitive employee fields', 0),
  ('perm_employees_sensitive_update', 'employees.sensitive.update', 'employees', 'Update sensitive employee fields', 0),
  ('perm_employees_job_history_view', 'employees.job_history.view', 'employees', 'View employee job history', 0),
  ('perm_employees_job_history_manage', 'employees.job_history.manage', 'employees', 'Manage employee job history', 0),
  ('perm_employees_contacts_view', 'employees.contacts.view', 'employees', 'View employee contacts', 0),
  ('perm_employees_contacts_manage', 'employees.contacts.manage', 'employees', 'Manage employee contacts', 0),
  ('perm_employees_onboarding_manage', 'employees.onboarding.manage', 'employees', 'Manage employee onboarding tasks', 0),
  ('perm_attendance_view', 'attendance.view', 'attendance', 'View attendance records', 0),
  ('perm_attendance_manage', 'attendance.manage', 'attendance', 'Manage attendance records', 0),
  ('perm_attendance_correct', 'attendance.correct', 'attendance', 'Request attendance corrections', 0),
  ('perm_attendance_approve_correction', 'attendance.approve_correction', 'attendance', 'Approve or reject attendance corrections', 0),
  ('perm_attendance_devices_manage', 'attendance.devices.manage', 'attendance', 'Manage attendance devices and raw imports', 0),
  ('perm_attendance_settings_manage', 'attendance.settings.manage', 'attendance', 'Manage attendance settings', 0),
  ('perm_attendance_reports_view', 'attendance.reports.view', 'attendance', 'View attendance reports', 0),
  ('perm_attendance_reports_export', 'attendance.reports.export', 'attendance', 'Export attendance reports', 0),
  ('perm_employees_attendance_view', 'employees.attendance.view', 'employees', 'View Employee 360 attendance information', 0),
  ('perm_leave_view', 'leave.view', 'leave', 'View leave records', 0),
  ('perm_leave_manage', 'leave.manage', 'leave', 'Manage leave records', 0),
  ('perm_leave_request', 'leave.request', 'leave', 'Create leave requests', 0),
  ('perm_leave_approve', 'leave.approve', 'leave', 'Approve or reject assigned leave requests', 0),
  ('perm_leave_cancel', 'leave.cancel', 'leave', 'Cancel leave requests', 0),
  ('perm_leave_settings_manage', 'leave.settings.manage', 'leave', 'Manage leave types and policies', 0),
  ('perm_leave_workflow_manage', 'leave.workflow.manage', 'leave', 'Manage leave approval workflows', 0),
  ('perm_leave_requests_create', 'leave.requests.create', 'leave', 'Create leave requests with granular leave permission', 0),
  ('perm_leave_requests_approve', 'leave.requests.approve', 'leave', 'Approve leave requests with granular leave permission', 0),
  ('perm_leave_requests_reject', 'leave.requests.reject', 'leave', 'Reject leave requests with granular leave permission', 0),
  ('perm_leave_requests_cancel', 'leave.requests.cancel', 'leave', 'Cancel leave requests with granular leave permission', 0),
  ('perm_leave_requests_manage', 'leave.requests.manage', 'leave', 'Manage leave requests with granular leave permission', 0),
  ('perm_leave_types_manage', 'leave.types.manage', 'leave', 'Manage leave types with granular leave permission', 0),
  ('perm_leave_policies_manage', 'leave.policies.manage', 'leave', 'Manage leave policies with granular leave permission', 0),
  ('perm_leave_approval_workflows_view', 'leave.approval_workflows.view', 'leave', 'View leave approval workflows', 0),
  ('perm_leave_approval_workflows_manage', 'leave.approval_workflows.manage', 'leave', 'Manage leave approval workflows', 0),
  ('perm_leave_balances_adjust', 'leave.balances.adjust', 'leave', 'Adjust leave balance cycles and ledger', 0),
  ('perm_leave_payroll_impact_view', 'leave.payroll_impact.view', 'leave', 'View leave payroll impact estimates', 0),
  ('perm_leave_payroll_impact_manage', 'leave.payroll_impact.manage', 'leave', 'Manage leave payroll impact records', 0),
  ('perm_leave_requests_waive_document', 'leave.requests.waive_document', 'leave', 'Waive leave supporting document requirements', 0),
  ('perm_leave_reports_view', 'leave.reports.view', 'leave', 'View leave reports', 0),
  ('perm_leave_reports_export', 'leave.reports.export', 'leave', 'Export leave reports', 0),
  ('perm_employees_leave_view', 'employees.leave.view', 'employees', 'View Employee 360 leave information', 0),
  ('perm_payroll_view', 'payroll.view', 'payroll', 'View payroll records', 0),
  ('perm_payroll_manage', 'payroll.manage', 'payroll', 'Manage payroll records', 0),
  ('perm_payroll_settings_manage', 'payroll.settings.manage', 'payroll', 'Manage payroll settings', 0),
  ('perm_payroll_approve', 'payroll.approve', 'payroll', 'Approve payroll runs and adjustments', 0),
  ('perm_payroll_pay', 'payroll.pay', 'payroll', 'Mark payroll runs and advances as paid', 0),
  ('perm_payroll_reports_view', 'payroll.reports.view', 'payroll', 'View payroll reports', 0),
  ('perm_payroll_reports_export', 'payroll.reports.export', 'payroll', 'Export payroll reports', 0),
  ('perm_payroll_advances_view', 'payroll.advances.view', 'payroll', 'View payroll advance payments', 0),
  ('perm_payroll_advances_manage', 'payroll.advances.manage', 'payroll', 'Manage payroll advance payments', 0),
  ('perm_payroll_advances_approve', 'payroll.advances.approve', 'payroll', 'Approve payroll advances in Payroll Core', 0),
  ('perm_payroll_advances_cancel', 'payroll.advances.cancel', 'payroll', 'Cancel payroll advances in Payroll Core', 0),
  ('perm_payroll_adjustments_manage', 'payroll.adjustments.manage', 'payroll', 'Manage payroll adjustments', 0),
  ('perm_payroll_adjustments_view', 'payroll.adjustments.view', 'payroll', 'View payroll adjustments', 0),
  ('perm_payroll_adjustments_approve_placeholder', 'payroll.adjustments.approve_placeholder', 'payroll', 'Approve payroll adjustments as Payroll Core placeholders', 0),
  ('perm_payroll_components_manage', 'payroll.components.manage', 'payroll', 'Manage payroll components', 0),
  ('perm_payroll_components_view', 'payroll.components.view', 'payroll', 'View payroll components', 0),
  ('perm_payroll_deductions_view', 'payroll.deductions.view', 'payroll', 'View payroll deductions', 0),
  ('perm_payroll_deductions_manage', 'payroll.deductions.manage', 'payroll', 'Manage payroll deductions', 0),
  ('perm_payroll_periods_view', 'payroll.periods.view', 'payroll', 'View payroll periods', 0),
  ('perm_payroll_periods_create', 'payroll.periods.create', 'payroll', 'Create payroll periods', 0),
  ('perm_payroll_periods_update', 'payroll.periods.update', 'payroll', 'Update payroll periods', 0),
  ('perm_payroll_periods_manage', 'payroll.periods.manage', 'payroll', 'Manage payroll periods', 0),
  ('perm_payroll_periods_calculate', 'payroll.periods.calculate', 'payroll', 'Calculate payroll periods', 0),
  ('perm_payroll_periods_recalculate', 'payroll.periods.recalculate', 'payroll', 'Recalculate payroll periods', 0),
  ('perm_payroll_periods_cancel', 'payroll.periods.cancel', 'payroll', 'Cancel payroll periods', 0),
  ('perm_payroll_periods_lock', 'payroll.periods.lock', 'payroll', 'Lock payroll periods', 0),
  ('perm_payroll_periods_unlock', 'payroll.periods.unlock', 'payroll', 'Unlock payroll periods', 0),
  ('perm_payroll_periods_approve_placeholder', 'payroll.periods.approve_placeholder', 'payroll', 'Approve payroll periods as placeholders', 0),
  ('perm_payroll_periods_finalize_placeholder', 'payroll.periods.finalize_placeholder', 'payroll', 'Finalize payroll periods as placeholders', 0),
  ('perm_payroll_runs_view', 'payroll.runs.view', 'payroll', 'View payroll runs', 0),
  ('perm_payroll_runs_manage', 'payroll.runs.manage', 'payroll', 'Manage payroll runs', 0),
  ('perm_payroll_runs_calculate', 'payroll.runs.calculate', 'payroll', 'Calculate payroll runs', 0),
  ('perm_payroll_runs_recalculate', 'payroll.runs.recalculate', 'payroll', 'Recalculate payroll runs', 0),
  ('perm_payroll_runs_cancel', 'payroll.runs.cancel', 'payroll', 'Cancel payroll runs', 0),
  ('perm_payroll_runs_approve_placeholder', 'payroll.runs.approve_placeholder', 'payroll', 'Approve payroll runs as placeholders', 0),
  ('perm_payroll_runs_finalize_placeholder', 'payroll.runs.finalize_placeholder', 'payroll', 'Finalize payroll runs as placeholders', 0),
  ('perm_payroll_results_view', 'payroll.results.view', 'payroll', 'View payroll results', 0),
  ('perm_payroll_results_detail_view', 'payroll.results.detail.view', 'payroll', 'View payroll result line details', 0),
  ('perm_payroll_results_sensitive_view', 'payroll.results.sensitive.view', 'payroll', 'View sensitive payroll result values', 0),
  ('perm_payroll_results_update', 'payroll.results.update', 'payroll', 'Update payroll result rows', 0),
  ('perm_payroll_approve_placeholder', 'payroll.approve_placeholder', 'payroll', 'Approve payroll placeholders', 0),
  ('perm_payroll_finalize_placeholder', 'payroll.finalize_placeholder', 'payroll', 'Finalize payroll placeholders', 0),
  ('perm_payroll_lock', 'payroll.lock', 'payroll', 'Lock payroll core periods', 0),
  ('perm_payroll_unlock', 'payroll.unlock', 'payroll', 'Unlock payroll core periods', 0),
  ('perm_payroll_cutoff_override', 'payroll.cutoff.override', 'payroll', 'Override payroll cutoff rules with reason', 0),
  ('perm_employees_payroll_view', 'employees.payroll.view', 'employees', 'View Employee 360 payroll information', 0),
  ('perm_employees_payroll_update', 'employees.payroll.update', 'employees', 'Update Employee 360 payroll profile', 0),
  ('perm_roster_view', 'roster.view', 'roster', 'View roster records', 0),
  ('perm_roster_manage', 'roster.manage', 'roster', 'Manage roster records', 0),
  ('perm_roster_publish', 'roster.publish', 'roster', 'Publish roster periods and manage published roster edits', 0),
  ('perm_roster_settings_view', 'roster.settings.view', 'roster', 'View roster settings', 0),
  ('perm_roster_settings_update', 'roster.settings.update', 'roster', 'Update roster settings', 0),
  ('perm_roster_settings_manage', 'roster.settings.manage', 'roster', 'Manage roster settings and shift templates', 0),
  ('perm_roster_shift_templates_view', 'roster.shift_templates.view', 'roster', 'View roster shift templates', 0),
  ('perm_roster_shift_templates_create', 'roster.shift_templates.create', 'roster', 'Create roster shift templates', 0),
  ('perm_roster_shift_templates_update', 'roster.shift_templates.update', 'roster', 'Update roster shift templates', 0),
  ('perm_roster_shift_templates_archive', 'roster.shift_templates.archive', 'roster', 'Archive roster shift templates', 0),
  ('perm_roster_shift_templates_restore', 'roster.shift_templates.restore', 'roster', 'Restore roster shift templates', 0),
  ('perm_roster_shift_templates_manage', 'roster.shift_templates.manage', 'roster', 'Manage roster shift templates', 0),
  ('perm_roster_periods_view', 'roster.periods.view', 'roster', 'View roster periods', 0),
  ('perm_roster_periods_create', 'roster.periods.create', 'roster', 'Create roster periods', 0),
  ('perm_roster_periods_update', 'roster.periods.update', 'roster', 'Update roster periods', 0),
  ('perm_roster_periods_publish', 'roster.periods.publish', 'roster', 'Publish roster periods', 0),
  ('perm_roster_periods_unpublish', 'roster.periods.unpublish', 'roster', 'Unpublish roster periods', 0),
  ('perm_roster_periods_lock', 'roster.periods.lock', 'roster', 'Lock roster periods', 0),
  ('perm_roster_periods_unlock', 'roster.periods.unlock', 'roster', 'Unlock roster periods', 0),
  ('perm_roster_periods_archive', 'roster.periods.archive', 'roster', 'Archive roster periods', 0),
  ('perm_roster_periods_manage', 'roster.periods.manage', 'roster', 'Manage roster periods', 0),
  ('perm_roster_assignments_view', 'roster.assignments.view', 'roster', 'View roster assignments', 0),
  ('perm_roster_assignments_create', 'roster.assignments.create', 'roster', 'Create roster assignments', 0),
  ('perm_roster_assignments_update', 'roster.assignments.update', 'roster', 'Update roster assignments', 0),
  ('perm_roster_assignments_cancel', 'roster.assignments.cancel', 'roster', 'Cancel roster assignments', 0),
  ('perm_roster_assignments_manage', 'roster.assignments.manage', 'roster', 'Manage roster assignments', 0),
  ('perm_roster_assignments_bulk_update', 'roster.assignments.bulk_update', 'roster', 'Bulk update roster assignments', 0),
  ('perm_roster_assignments_copy_week', 'roster.assignments.copy_week', 'roster', 'Copy weekly roster assignments', 0),
  ('perm_roster_assignments_edit_after_publish', 'roster.assignments.edit_after_publish', 'roster', 'Edit assignments after roster publish', 0),
  ('perm_roster_assignments_override_lock', 'roster.assignments.override_lock', 'roster', 'Override locked roster assignments', 0),
  ('perm_roster_assignments_cross_worksite', 'roster.assignments.cross_worksite', 'roster', 'Assign employees across worksites', 0),
  ('perm_roster_conflicts_view', 'roster.conflicts.view', 'roster', 'View roster assignment conflicts', 0),
  ('perm_roster_conflicts_override', 'roster.conflicts.override', 'roster', 'Override roster assignment conflicts', 0),
  ('perm_roster_team_view', 'roster.team.view', 'roster', 'View team roster within access scope', 0),
  ('perm_roster_all_locations_view', 'roster.all_locations.view', 'roster', 'View roster across allowed locations', 0),
  ('perm_roster_whole_company_view', 'roster.whole_company.view', 'roster', 'View company-wide roster with matching scope', 0),
  ('perm_roster_reports_view', 'roster.reports.view', 'roster', 'View roster reports', 0),
  ('perm_roster_reports_export', 'roster.reports.export', 'roster', 'Export roster reports', 0),
  ('perm_employees_roster_view', 'employees.roster.view', 'employees', 'View Employee 360 roster information', 0),
  ('perm_documents_view', 'documents.view', 'documents', 'View documents', 0),
  ('perm_documents_upload', 'documents.upload', 'documents', 'Upload documents', 0),
  ('perm_documents_download', 'documents.download', 'documents', 'Download documents', 0),
  ('perm_documents_archive', 'documents.archive', 'documents', 'Archive documents', 0),
  ('perm_documents_delete', 'documents.delete', 'documents', 'Delete documents', 0),
  ('perm_documents_sensitive_view', 'documents.sensitive.view', 'documents', 'View sensitive documents', 0),
  ('perm_documents_sensitive_download', 'documents.sensitive.download', 'documents', 'Download sensitive documents', 0),
  ('perm_documents_settings_manage', 'documents.settings.manage', 'documents', 'Manage document categories and types', 0),
  ('perm_documents_reports_view', 'documents.reports.view', 'documents', 'View document reports', 0),
  ('perm_documents_reports_export', 'documents.reports.export', 'documents', 'Export document reports', 0),
  ('perm_documents_registry_view', 'documents.registry.view', 'documents', 'View central document registry', 0),
  ('perm_documents_required_rules_manage', 'documents.required_rules.manage', 'documents', 'Manage required document rules', 0),
  ('perm_documents_permanent_delete', 'documents.permanent_delete', 'documents', 'Permanently delete document records and files', 0),
  ('perm_assets_view', 'assets.view', 'assets', 'View assets and uniforms', 0),
  ('perm_assets_manage', 'assets.manage', 'assets', 'Manage assets and uniforms', 0),
  ('perm_assets_settings_manage', 'assets.settings.manage', 'assets', 'Manage asset and uniform settings', 0),
  ('perm_assets_issue', 'assets.issue', 'assets', 'Issue assets and uniforms', 0),
  ('perm_assets_return', 'assets.return', 'assets', 'Return issued assets and uniforms', 0),
  ('perm_assets_damage', 'assets.damage', 'assets', 'Mark assets and uniforms damaged', 0),
  ('perm_assets_lost', 'assets.lost', 'assets', 'Mark assets and uniforms lost', 0),
  ('perm_assets_write_off', 'assets.write_off', 'assets', 'Write off assets and uniforms', 0),
  ('perm_assets_deductions_manage', 'assets.deductions.manage', 'assets', 'Manage asset recovery and deduction links', 0),
  ('perm_assets_reports_view', 'assets.reports.view', 'assets', 'View asset reports', 0),
  ('perm_assets_reports_export', 'assets.reports.export', 'assets', 'Export asset reports', 0),
  ('perm_employees_assets_view', 'employees.assets.view', 'employees', 'View Employee 360 assets and uniforms', 0),
  ('perm_employee_notes_view', 'employee_notes.view', 'employee_notes', 'View general employee notes', 0),
  ('perm_employee_notes_create', 'employee_notes.create', 'employee_notes', 'Create employee notes', 0),
  ('perm_employee_notes_update', 'employee_notes.update', 'employee_notes', 'Update employee notes', 0),
  ('perm_employee_notes_archive', 'employee_notes.archive', 'employee_notes', 'Archive employee notes', 0),
  ('perm_employee_notes_restricted_view', 'employee_notes.restricted.view', 'employee_notes', 'View restricted employee notes', 0),
  ('perm_employee_notes_restricted_manage', 'employee_notes.restricted.manage', 'employee_notes', 'Create or edit restricted employee notes', 0),
  ('perm_employee_notes_attachments_manage', 'employee_notes.attachments.manage', 'employee_notes', 'Manage employee note attachments', 0),
  ('perm_employees_audit_view', 'employees.audit.view', 'employees', 'View Employee 360 audit timeline', 0),
  ('perm_reports_view', 'reports.view', 'reports', 'View reports', 0),
  ('perm_reports_export', 'reports.export', 'reports', 'Export reports from the report center', 0),
  ('perm_self_service_view', 'self_service.view', 'self_service', 'Access employee self-service records linked to the current user', 0),
  ('perm_self_service_kyc_request', 'self_service.kyc_request', 'self_service', 'Submit KYC/profile update requests for own employee profile', 0),
  ('perm_self_service_leave_request', 'self_service.leave_request', 'self_service', 'Create leave requests from employee self-service', 0),
  ('perm_self_service_attendance_correction', 'self_service.attendance_correction', 'self_service', 'Request attendance corrections from employee self-service', 0),
  ('perm_attendance_logs_view', 'attendance.logs.view', 'attendance', 'View attendance logs', 0),
  ('perm_attendance_logs_manage', 'attendance.logs.manage', 'attendance', 'Manage attendance logs', 0),
  ('perm_attendance_manual_entries_manage', 'attendance.manual_entries.manage', 'attendance', 'Create manual attendance entries', 0),
  ('perm_attendance_daily_refresh', 'attendance.daily.refresh', 'attendance', 'Refresh daily attendance records', 0),
  ('perm_attendance_payroll_impact_view', 'attendance.payroll_impact.view', 'attendance', 'View attendance payroll impact', 0),
  ('perm_attendance_corrections_view', 'attendance.corrections.view', 'attendance', 'View attendance correction requests', 0),
  ('perm_attendance_corrections_create', 'attendance.corrections.create', 'attendance', 'Create attendance correction requests', 0),
  ('perm_attendance_corrections_review', 'attendance.corrections.review', 'attendance', 'Review attendance correction request details', 0),
  ('perm_attendance_corrections_approve', 'attendance.corrections.approve', 'attendance', 'Approve attendance correction requests', 0),
  ('perm_attendance_corrections_reject', 'attendance.corrections.reject', 'attendance', 'Reject attendance correction requests', 0),
  ('perm_attendance_corrections_cancel', 'attendance.corrections.cancel', 'attendance', 'Cancel attendance correction requests', 0),
  ('perm_attendance_corrections_manage', 'attendance.corrections.manage', 'attendance', 'Manage attendance correction requests', 0),
  ('perm_attendance_lock_override', 'attendance.lock.override', 'attendance', 'Override payroll-locked attendance records with audit reason', 0),
  ('perm_attendance_day_overrides_view', 'attendance.day_overrides.view', 'attendance', 'View attendance day overrides', 0),
  ('perm_attendance_day_overrides_manage', 'attendance.day_overrides.manage', 'attendance', 'Manage attendance day overrides', 0),
  ('perm_payroll_attendance_impacts_view', 'payroll.attendance_impacts.view', 'payroll', 'View payroll attendance impacts', 0),
  ('perm_payroll_attendance_impacts_manage', 'payroll.attendance_impacts.manage', 'payroll', 'Manage payroll attendance impacts', 0),
  ('perm_payroll_leave_deductions_view', 'payroll.leave_deductions.view', 'payroll', 'View leave deduction payroll impacts', 0),
  ('perm_payroll_leave_deductions_manage', 'payroll.leave_deductions.manage', 'payroll', 'Manage leave deduction payroll impacts', 0),
  ('perm_self_service_attendance_view', 'self_service.attendance.view', 'self_service', 'View own attendance in employee self-service', 0),
  ('perm_self_service_attendance_correction_request', 'self_service.attendance_correction.request', 'self_service', 'Request own attendance corrections from employee self-service', 0),
  ('perm_self_service_roster_view', 'self_service.roster.view', 'self_service', 'View own published roster in employee self-service', 0),
  ('perm_roster_self_view', 'roster.self.view', 'roster', 'View own published roster', 0),
  ('perm_attendance_roster_context_view', 'attendance.roster_context.view', 'attendance', 'Use roster schedule context in attendance views', 0),
  ('perm_leave_roster_context_view', 'leave.roster_context.view', 'leave', 'Use roster work requirement context in leave calculation', 0),
  ('perm_audit_view', 'audit.view', 'audit', 'View audit logs', 1),
  ('perm_audit_export', 'audit.export', 'audit', 'Export audit logs', 0);

INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Owner/Super Admin'
  AND r.is_protected = 1;

INSERT OR IGNORE INTO roles (id, name, description, is_system_role, is_protected, is_active) VALUES
  ('role_employee_self_service', 'Employee Self-Service', 'Recommended template for employee-linked self-service access.', 1, 0, 1),
  ('role_hr_staff', 'HR Staff', 'Recommended template for HR staff daily employee operations.', 1, 0, 1),
  ('role_senior_hr_staff', 'Senior HR Staff', 'Recommended template for senior HR staff with expanded document, leave, attendance, roster, asset, and report access.', 1, 0, 1),
  ('role_hr_manager', 'HR Manager', 'Recommended template for HR managers with sensitive HR operations access.', 1, 0, 1),
  ('role_hr_head_admin', 'HR Head / HR Admin', 'Recommended broad HR administration template. This is not the protected Owner/Super Admin role.', 1, 0, 1),
  ('role_finance_payroll_officer', 'Finance Payroll Officer', 'Recommended template for payroll advance and payroll report support.', 1, 0, 1),
  ('role_finance_payroll_manager', 'Finance Payroll Manager', 'Recommended template for payroll managers who approve and manage payroll operations.', 1, 0, 1),
  ('role_finance_head', 'Finance Head', 'Recommended template for finance heads with payroll settings and audit visibility.', 1, 0, 1),
  ('role_operations_roster_manager', 'Operations Roster Manager', 'Recommended template for roster operations managers.', 1, 0, 1),
  ('role_attendance_manager', 'Attendance Manager', 'Recommended template for attendance managers and correction approvers.', 1, 0, 1),
  ('role_store_outlet_manager', 'Store / Outlet Manager', 'Recommended template for outlet managers scoped by location.', 1, 0, 1),
  ('role_department_manager_approver', 'Department Manager / Approver', 'Recommended template for department managers who approve leave and view team operations.', 1, 0, 1);

WITH role_template_permissions(role_name, permission_key) AS (
  VALUES
  ('Employee Self-Service', 'self_service.view'), ('Employee Self-Service', 'self_service.kyc_request'), ('Employee Self-Service', 'self_service.leave_request'), ('Employee Self-Service', 'self_service.attendance.view'), ('Employee Self-Service', 'self_service.attendance_correction.request'), ('Employee Self-Service', 'self_service.attendance_correction'), ('Employee Self-Service', 'self_service.roster.view'),
  ('HR Staff', 'employees.view'), ('HR Staff', 'employees.create'), ('HR Staff', 'employees.update'), ('HR Staff', 'documents.view'), ('HR Staff', 'documents.upload'), ('HR Staff', 'documents.download'), ('HR Staff', 'leave.view'), ('HR Staff', 'attendance.view'), ('HR Staff', 'roster.view'), ('HR Staff', 'assets.view'), ('HR Staff', 'reports.view'),
  ('Senior HR Staff', 'employees.view'), ('Senior HR Staff', 'employees.create'), ('Senior HR Staff', 'employees.update'), ('Senior HR Staff', 'documents.view'), ('Senior HR Staff', 'documents.upload'), ('Senior HR Staff', 'documents.download'), ('Senior HR Staff', 'leave.view'), ('Senior HR Staff', 'attendance.view'), ('Senior HR Staff', 'roster.view'), ('Senior HR Staff', 'assets.view'), ('Senior HR Staff', 'reports.view'), ('Senior HR Staff', 'documents.archive'), ('Senior HR Staff', 'documents.registry.view'), ('Senior HR Staff', 'leave.manage'), ('Senior HR Staff', 'attendance.manage'), ('Senior HR Staff', 'attendance.correct'), ('Senior HR Staff', 'roster.manage'), ('Senior HR Staff', 'assets.manage'), ('Senior HR Staff', 'employee_notes.view'), ('Senior HR Staff', 'reports.export'),
  ('HR Manager', 'employees.view'), ('HR Manager', 'employees.create'), ('HR Manager', 'employees.update'), ('HR Manager', 'documents.view'), ('HR Manager', 'documents.upload'), ('HR Manager', 'documents.download'), ('HR Manager', 'leave.view'), ('HR Manager', 'attendance.view'), ('HR Manager', 'roster.view'), ('HR Manager', 'assets.view'), ('HR Manager', 'reports.view'), ('HR Manager', 'documents.archive'), ('HR Manager', 'documents.registry.view'), ('HR Manager', 'leave.manage'), ('HR Manager', 'attendance.manage'), ('HR Manager', 'attendance.correct'), ('HR Manager', 'roster.manage'), ('HR Manager', 'assets.manage'), ('HR Manager', 'employee_notes.view'), ('HR Manager', 'reports.export'), ('HR Manager', 'employees.archive'), ('HR Manager', 'employees.status.manage'), ('HR Manager', 'employees.sensitive.view'), ('HR Manager', 'employees.sensitive.update'), ('HR Manager', 'documents.sensitive.view'), ('HR Manager', 'documents.sensitive.download'), ('HR Manager', 'documents.settings.manage'), ('HR Manager', 'documents.required_rules.manage'), ('HR Manager', 'leave.settings.manage'), ('HR Manager', 'leave.workflow.manage'), ('HR Manager', 'leave.approve'), ('HR Manager', 'attendance.approve_correction'), ('HR Manager', 'roster.publish'), ('HR Manager', 'payroll.view'), ('HR Manager', 'employees.payroll.view'), ('HR Manager', 'assets.deductions.manage'), ('HR Manager', 'employee_notes.restricted.view'), ('HR Manager', 'audit.view'),
  ('HR Head / HR Admin', 'employees.view'), ('HR Head / HR Admin', 'employees.create'), ('HR Head / HR Admin', 'employees.update'), ('HR Head / HR Admin', 'employees.archive'), ('HR Head / HR Admin', 'employees.status.manage'), ('HR Head / HR Admin', 'employees.numbering.manage'), ('HR Head / HR Admin', 'employees.sensitive.view'), ('HR Head / HR Admin', 'employees.sensitive.update'), ('HR Head / HR Admin', 'employees.job_history.view'), ('HR Head / HR Admin', 'employees.job_history.manage'), ('HR Head / HR Admin', 'employees.contacts.view'), ('HR Head / HR Admin', 'employees.contacts.manage'), ('HR Head / HR Admin', 'employees.onboarding.manage'), ('HR Head / HR Admin', 'employees.audit.view'), ('HR Head / HR Admin', 'documents.view'), ('HR Head / HR Admin', 'documents.upload'), ('HR Head / HR Admin', 'documents.download'), ('HR Head / HR Admin', 'documents.archive'), ('HR Head / HR Admin', 'documents.delete'), ('HR Head / HR Admin', 'documents.sensitive.view'), ('HR Head / HR Admin', 'documents.sensitive.download'), ('HR Head / HR Admin', 'documents.settings.manage'), ('HR Head / HR Admin', 'documents.reports.view'), ('HR Head / HR Admin', 'documents.reports.export'), ('HR Head / HR Admin', 'documents.registry.view'), ('HR Head / HR Admin', 'documents.required_rules.manage'), ('HR Head / HR Admin', 'leave.view'), ('HR Head / HR Admin', 'leave.manage'), ('HR Head / HR Admin', 'leave.request'), ('HR Head / HR Admin', 'leave.approve'), ('HR Head / HR Admin', 'leave.cancel'), ('HR Head / HR Admin', 'leave.settings.manage'), ('HR Head / HR Admin', 'leave.workflow.manage'), ('HR Head / HR Admin', 'leave.reports.view'), ('HR Head / HR Admin', 'leave.reports.export'), ('HR Head / HR Admin', 'attendance.view'), ('HR Head / HR Admin', 'attendance.manage'), ('HR Head / HR Admin', 'attendance.correct'), ('HR Head / HR Admin', 'attendance.approve_correction'), ('HR Head / HR Admin', 'attendance.devices.manage'), ('HR Head / HR Admin', 'attendance.settings.manage'), ('HR Head / HR Admin', 'attendance.reports.view'), ('HR Head / HR Admin', 'attendance.reports.export'), ('HR Head / HR Admin', 'roster.view'), ('HR Head / HR Admin', 'roster.manage'), ('HR Head / HR Admin', 'roster.publish'), ('HR Head / HR Admin', 'roster.settings.manage'), ('HR Head / HR Admin', 'roster.reports.view'), ('HR Head / HR Admin', 'roster.reports.export'), ('HR Head / HR Admin', 'payroll.view'), ('HR Head / HR Admin', 'payroll.reports.view'), ('HR Head / HR Admin', 'employees.payroll.view'), ('HR Head / HR Admin', 'assets.view'), ('HR Head / HR Admin', 'assets.manage'), ('HR Head / HR Admin', 'assets.settings.manage'), ('HR Head / HR Admin', 'assets.issue'), ('HR Head / HR Admin', 'assets.return'), ('HR Head / HR Admin', 'assets.damage'), ('HR Head / HR Admin', 'assets.lost'), ('HR Head / HR Admin', 'assets.write_off'), ('HR Head / HR Admin', 'assets.deductions.manage'), ('HR Head / HR Admin', 'assets.reports.view'), ('HR Head / HR Admin', 'assets.reports.export'), ('HR Head / HR Admin', 'employee_notes.view'), ('HR Head / HR Admin', 'employee_notes.create'), ('HR Head / HR Admin', 'employee_notes.update'), ('HR Head / HR Admin', 'employee_notes.archive'), ('HR Head / HR Admin', 'employee_notes.restricted.view'), ('HR Head / HR Admin', 'employee_notes.restricted.manage'), ('HR Head / HR Admin', 'employee_notes.attachments.manage'), ('HR Head / HR Admin', 'reports.view'), ('HR Head / HR Admin', 'reports.export'), ('HR Head / HR Admin', 'audit.view'), ('HR Head / HR Admin', 'audit.export'), ('HR Head / HR Admin', 'organization.view'), ('HR Head / HR Admin', 'organization.manage'), ('HR Head / HR Admin', 'settings.view'), ('HR Head / HR Admin', 'role_mappings.view'), ('HR Head / HR Admin', 'access_scopes.view'),
  ('Finance Payroll Officer', 'payroll.view'), ('Finance Payroll Officer', 'payroll.advances.view'), ('Finance Payroll Officer', 'payroll.advances.manage'), ('Finance Payroll Officer', 'payroll.reports.view'), ('Finance Payroll Officer', 'employees.payroll.view'),
  ('Finance Payroll Manager', 'payroll.view'), ('Finance Payroll Manager', 'payroll.manage'), ('Finance Payroll Manager', 'payroll.approve'), ('Finance Payroll Manager', 'payroll.advances.view'), ('Finance Payroll Manager', 'payroll.advances.manage'), ('Finance Payroll Manager', 'payroll.adjustments.manage'), ('Finance Payroll Manager', 'payroll.reports.view'), ('Finance Payroll Manager', 'payroll.reports.export'), ('Finance Payroll Manager', 'employees.payroll.view'), ('Finance Payroll Manager', 'employees.payroll.update'),
  ('Finance Head', 'payroll.view'), ('Finance Head', 'payroll.manage'), ('Finance Head', 'payroll.approve'), ('Finance Head', 'payroll.advances.view'), ('Finance Head', 'payroll.advances.manage'), ('Finance Head', 'payroll.adjustments.manage'), ('Finance Head', 'payroll.reports.view'), ('Finance Head', 'payroll.reports.export'), ('Finance Head', 'employees.payroll.view'), ('Finance Head', 'employees.payroll.update'), ('Finance Head', 'payroll.settings.manage'), ('Finance Head', 'payroll.components.manage'), ('Finance Head', 'audit.view'),
  ('Operations Roster Manager', 'roster.view'), ('Operations Roster Manager', 'roster.manage'), ('Operations Roster Manager', 'roster.publish'), ('Operations Roster Manager', 'roster.settings.view'), ('Operations Roster Manager', 'roster.shift_templates.view'), ('Operations Roster Manager', 'roster.shift_templates.manage'), ('Operations Roster Manager', 'roster.periods.view'), ('Operations Roster Manager', 'roster.periods.create'), ('Operations Roster Manager', 'roster.periods.update'), ('Operations Roster Manager', 'roster.periods.publish'), ('Operations Roster Manager', 'roster.assignments.view'), ('Operations Roster Manager', 'roster.assignments.create'), ('Operations Roster Manager', 'roster.assignments.update'), ('Operations Roster Manager', 'roster.assignments.bulk_update'), ('Operations Roster Manager', 'roster.assignments.copy_week'), ('Operations Roster Manager', 'roster.reports.view'), ('Operations Roster Manager', 'attendance.view'), ('Operations Roster Manager', 'attendance.roster_context.view'), ('Operations Roster Manager', 'leave.roster_context.view'), ('Operations Roster Manager', 'employees.roster.view'),
  ('Attendance Manager', 'attendance.view'), ('Attendance Manager', 'attendance.manage'), ('Attendance Manager', 'attendance.correct'), ('Attendance Manager', 'attendance.approve_correction'), ('Attendance Manager', 'attendance.reports.view'), ('Attendance Manager', 'employees.attendance.view'),
  ('Store / Outlet Manager', 'employees.view'), ('Store / Outlet Manager', 'attendance.view'), ('Store / Outlet Manager', 'attendance.correct'), ('Store / Outlet Manager', 'roster.view'), ('Store / Outlet Manager', 'roster.manage'), ('Store / Outlet Manager', 'leave.view'), ('Store / Outlet Manager', 'leave.approve'), ('Store / Outlet Manager', 'reports.view'), ('Store / Outlet Manager', 'employees.attendance.view'), ('Store / Outlet Manager', 'employees.roster.view'), ('Store / Outlet Manager', 'employees.leave.view'),
  ('Department Manager / Approver', 'leave.view'), ('Department Manager / Approver', 'leave.approve'), ('Department Manager / Approver', 'attendance.view'), ('Department Manager / Approver', 'roster.view'), ('Department Manager / Approver', 'employees.view')
)
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM role_template_permissions rtp
INNER JOIN roles r ON r.name = rtp.role_name
INNER JOIN permissions p ON p.key = rtp.permission_key;

INSERT OR IGNORE INTO employee_statuses (
  id, key, name, description, is_protected, is_active, can_login,
  include_in_payroll, include_in_roster, show_in_active_lists,
  requires_exit_date, requires_exit_reason, requires_final_settlement,
  requires_document_clearance, requires_asset_clearance, sort_order
) VALUES
  ('emp_status_draft_onboarding', 'DRAFT_ONBOARDING', 'Draft / Onboarding', 'Employee record is being prepared before activation.', 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 10),
  ('emp_status_active', 'ACTIVE', 'Active', 'Active employee eligible for normal HR operations.', 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 20),
  ('emp_status_on_leave', 'ON_LEAVE', 'On Leave', 'Employee is active but currently on leave.', 1, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 30),
  ('emp_status_suspended', 'SUSPENDED', 'Suspended', 'Employee is suspended pending HR action.', 1, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 40),
  ('emp_status_resigned', 'RESIGNED', 'Resigned', 'Employee resigned from employment.', 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 50),
  ('emp_status_terminated', 'TERMINATED', 'Terminated', 'Employment was terminated.', 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 60),
  ('emp_status_end_of_contract', 'END_OF_CONTRACT', 'End of Contract', 'Contract ended without renewal.', 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 70),
  ('emp_status_absconded', 'ABSCONDED', 'Absconded', 'Employee absconded from work.', 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 80),
  ('emp_status_deceased', 'DECEASED', 'Deceased', 'Employee is deceased.', 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 90),
  ('emp_status_archived', 'ARCHIVED', 'Archived', 'Employee record is archived.', 1, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 100);

INSERT OR IGNORE INTO employee_number_settings (
  id, prefix, include_year, include_location_code, include_department_code,
  sequence_padding, next_sequence, allow_manual_override, separator
) VALUES (
  'employee_number_default', 'EMP', 0, 0, 0, 4, 1, 0, '-'
);

INSERT OR IGNORE INTO employee_profile_field_settings (
  id, field_key, label, section, is_required, is_hidden, is_sensitive,
  show_in_summary, hr_only_edit, allow_kyc_update_request, sort_order
) VALUES
  ('emp_field_full_name', 'full_name', 'Full name', 'personal', 1, 0, 0, 1, 1, 0, 10),
  ('emp_field_display_name', 'display_name', 'Display name', 'personal', 0, 0, 0, 1, 1, 0, 20),
  ('emp_field_gender', 'gender', 'Gender', 'personal', 0, 0, 1, 1, 1, 0, 30),
  ('emp_field_date_of_birth', 'date_of_birth', 'Date of birth', 'personal', 0, 0, 1, 1, 1, 0, 40),
  ('emp_field_nationality', 'nationality', 'Nationality', 'personal', 0, 0, 0, 1, 1, 0, 50),
  ('emp_field_employee_type', 'employee_type', 'Employee type', 'employment', 1, 0, 0, 1, 1, 0, 60),
  ('emp_field_employment_type', 'employment_type', 'Employment type', 'employment', 1, 0, 0, 1, 1, 0, 70),
  ('emp_field_joining_date', 'joining_date', 'Joining date', 'job', 0, 0, 0, 1, 1, 0, 80),
  ('emp_field_department', 'department', 'Department', 'job', 0, 0, 0, 1, 1, 0, 90),
  ('emp_field_position', 'position', 'Position', 'job', 0, 0, 0, 1, 1, 0, 100),
  ('emp_field_location', 'location', 'Location', 'job', 0, 0, 0, 1, 1, 0, 110),
  ('emp_field_reporting_manager', 'reporting_manager', 'Reporting manager', 'job', 0, 0, 0, 1, 1, 0, 120),
  ('emp_field_phone', 'phone', 'Phone', 'contact', 0, 0, 1, 1, 1, 1, 130),
  ('emp_field_email', 'email', 'Email', 'contact', 0, 0, 1, 1, 1, 1, 140),
  ('emp_field_emergency_contact', 'emergency_contact', 'Emergency contact', 'contact', 0, 0, 1, 1, 1, 1, 150);

INSERT OR IGNORE INTO document_categories (id, name, description, sort_order, is_active) VALUES
  ('doc_cat_identity', 'Identity', 'Identity and civil documents', 10, 1),
  ('doc_cat_immigration', 'Immigration', 'Visa, passport, and work permit documents', 20, 1),
  ('doc_cat_employment', 'Employment', 'Employment contracts and HR records', 30, 1),
  ('doc_cat_medical', 'Medical', 'Medical and health documents', 40, 1),
  ('doc_cat_payroll', 'Payroll', 'Payroll and compensation documents', 50, 1),
  ('doc_cat_training', 'Training', 'Training and certification documents', 60, 1),
  ('doc_cat_profile_photo', 'Profile Photo', 'Employee profile photo documents', 70, 1),
  ('doc_cat_other', 'Other', 'Other employee documents', 100, 1);

INSERT OR IGNORE INTO document_types (
  id, category_id, code, name, description, is_sensitive, is_active, expiring_soon_days,
  allowed_file_types_json, max_file_size_mb, allow_multiple_files,
  requires_expiry_date, requires_issue_date, requires_document_number, sort_order
) VALUES
  ('doc_type_passport', 'doc_cat_immigration', 'PASSPORT', 'Passport', 'Employee passport record', 1, 1, 180, '["application/pdf","image/jpeg","image/png"]', 10, 0, 1, 0, 1, 10),
  ('doc_type_work_permit', 'doc_cat_immigration', 'WORK_PERMIT', 'Work Permit', 'Work permit or labor approval', 1, 1, 60, '["application/pdf","image/jpeg","image/png"]', 10, 0, 1, 0, 1, 20),
  ('doc_type_visa', 'doc_cat_immigration', 'VISA', 'Visa', 'Visa document', 1, 1, 90, '["application/pdf","image/jpeg","image/png"]', 10, 0, 1, 0, 1, 30),
  ('doc_type_id_card', 'doc_cat_identity', 'ID_CARD', 'ID Card', 'National ID card or similar identity record', 1, 1, 60, '["application/pdf","image/jpeg","image/png"]', 10, 0, 1, 0, 1, 40),
  ('doc_type_employment_contract', 'doc_cat_employment', 'EMPLOYMENT_CONTRACT', 'Employment Contract', 'Signed employment contract', 1, 1, 30, '["application/pdf","image/jpeg","image/png"]', 10, 1, 0, 0, 0, 50),
  ('doc_type_medical', 'doc_cat_medical', 'MEDICAL_DOCUMENT', 'Medical Document', 'Medical certificate or health document', 1, 1, 30, '["application/pdf","image/jpeg","image/png"]', 10, 1, 1, 0, 0, 60),
  ('doc_type_police_report', 'doc_cat_identity', 'POLICE_REPORT', 'Police Report', 'Police clearance or report', 1, 1, 30, '["application/pdf","image/jpeg","image/png"]', 10, 1, 1, 0, 0, 70),
  ('doc_type_profile_photo', 'doc_cat_profile_photo', 'PROFILE_PHOTO', 'Profile Photo', 'Employee profile photo', 0, 1, 0, '["image/jpeg","image/png","image/webp"]', 5, 0, 0, 0, 0, 80),
  ('doc_type_payroll', 'doc_cat_payroll', 'PAYROLL_DOCUMENT', 'Payroll Document', 'Payroll related document', 1, 1, 0, '["application/pdf","image/jpeg","image/png"]', 10, 1, 0, 0, 0, 90),
  ('doc_type_training_certificate', 'doc_cat_training', 'TRAINING_CERTIFICATE', 'Training Certificate', 'Training certificate or completion record', 0, 1, 30, '["application/pdf","image/jpeg","image/png"]', 10, 1, 0, 0, 0, 100),
  ('doc_type_other', 'doc_cat_other', 'OTHER', 'Other', 'Other employee document', 0, 1, 30, '["application/pdf","image/jpeg","image/png"]', 10, 1, 0, 0, 0, 999);

INSERT OR IGNORE INTO leave_types (id, code, name, description, is_paid_default, is_statutory, is_active, sort_order) VALUES
  ('leave_type_annual', 'ANNUAL_LEAVE', 'Annual Leave', 'Paid annual leave entitlement.', 1, 1, 1, 10),
  ('leave_type_sick', 'SICK_LEAVE', 'Sick Leave', 'Medical and sick leave.', 1, 1, 1, 20),
  ('leave_type_frl', 'FRL', 'FRL', 'Flexible/requested leave foundation.', 1, 0, 1, 30),
  ('leave_type_unpaid', 'UNPAID_LEAVE', 'Unpaid Leave', 'Leave without pay.', 0, 0, 1, 40),
  ('leave_type_maternity', 'MATERNITY_LEAVE', 'Maternity Leave', 'Maternity leave foundation.', 1, 1, 1, 50),
  ('leave_type_paternity', 'PATERNITY_LEAVE', 'Paternity Leave', 'Paternity leave foundation.', 1, 1, 1, 60),
  ('leave_type_emergency', 'EMERGENCY_LEAVE', 'Emergency Leave', 'Emergency leave foundation.', 1, 0, 1, 70),
  ('leave_type_other', 'OTHER', 'Other Leave', 'Other leave request type.', 1, 0, 1, 100);

INSERT OR IGNORE INTO leave_policies (
  id, leave_type_id, name, annual_entitlement_days, allow_half_day,
  allow_carry_forward, carry_forward_limit_days, include_public_holidays,
  include_weekly_off_days, salary_deduction_mode, requires_document,
  document_required_after_consecutive_days, document_required_after_used_days,
  long_leave_threshold_days, is_active, priority
) VALUES
  ('leave_policy_annual_default', 'leave_type_annual', 'Default Annual Leave Policy', 30, 1, 1, 10, 0, 0, 'NONE', 0, NULL, NULL, NULL, 1, 100),
  ('leave_policy_sick_default', 'leave_type_sick', 'Default Sick Leave Policy', 15, 1, 0, NULL, 0, 0, 'NONE', 1, 2, 5, NULL, 1, 100),
  ('leave_policy_frl_default', 'leave_type_frl', 'Default FRL Policy', NULL, 1, 0, NULL, 0, 0, 'NONE', 0, 3, NULL, NULL, 1, 100),
  ('leave_policy_unpaid_default', 'leave_type_unpaid', 'Default Unpaid Leave Policy', NULL, 1, 0, NULL, 0, 0, 'FULL_DAY', 0, NULL, NULL, 1, 1, 100);

INSERT OR IGNORE INTO leave_policy_document_rules (
  id, leave_policy_id, document_type_id, requires_document, required_after_consecutive_days, required_after_used_days, notes
) VALUES
  ('leave_doc_rule_sick_default', 'leave_policy_sick_default', 'doc_type_medical', 1, 2, 5, 'Medical document required after configured sick leave thresholds.'),
  ('leave_doc_rule_frl_default', 'leave_policy_frl_default', NULL, 1, 3, NULL, 'Generic supporting document can be required for long FRL requests.');

INSERT OR IGNORE INTO leave_policy_deduction_rules (
  id, leave_policy_id, deduction_mode, deduction_pay_component, deduction_after_days, long_leave_threshold_days, custom_rule_json
) VALUES
  ('leave_deduction_unpaid_default', 'leave_policy_unpaid_default', 'FULL_DAY', 'BASIC_SALARY', 0, 1, '{"foundation":"payroll integration later"}');

UPDATE leave_policies
SET annual_entitlement_days = 30,
    salary_deduction_mode = 'DEDUCT_AFTER_ENTITLEMENT_EXHAUSTED',
    requires_document = 1,
    document_required_after_consecutive_days = 2,
    document_required_after_used_days = 15,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'leave_policy_sick_default';

UPDATE leave_policy_document_rules
SET required_after_consecutive_days = 2,
    required_after_used_days = 15,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'leave_doc_rule_sick_default';

UPDATE leave_policies
SET salary_deduction_mode = 'PAY_ONLY_WORKED_DAYS',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 'leave_policy_unpaid_default';

INSERT OR IGNORE INTO leave_approval_workflows (
  id, name, description, is_default, is_active, priority
) VALUES (
  'leave_workflow_default_hr', 'Default HR Leave Approval', 'Fallback HR approval workflow for leave requests.', 1, 1, 100
);

INSERT OR IGNORE INTO leave_approval_steps (
  id, workflow_id, step_order, step_name, approver_type, permission_key,
  is_required, skip_if_no_approver, allow_self_approval
) VALUES (
  'leave_step_default_hr', 'leave_workflow_default_hr', 1, 'HR approval', 'PERMISSION', 'leave.approve', 1, 0, 0
);

INSERT OR IGNORE INTO attendance_status_types (
  id, key, name, description, color_label, counts_as_present, counts_as_absent, affects_payroll, is_system, is_active, sort_order
) VALUES
  ('att_status_present', 'PRESENT', 'Present', 'Employee attended work.', 'success', 1, 0, 0, 1, 1, 10),
  ('att_status_absent', 'ABSENT', 'Absent', 'Employee was absent.', 'danger', 0, 1, 1, 1, 1, 20),
  ('att_status_leave', 'LEAVE', 'Leave', 'Approved leave day.', 'info', 0, 0, 0, 1, 1, 30),
  ('att_status_sick', 'SICK', 'Sick', 'Approved sick leave day.', 'warning', 0, 0, 0, 1, 1, 40),
  ('att_status_late', 'LATE', 'Late', 'Employee arrived after grace period.', 'warning', 1, 0, 1, 1, 1, 50),
  ('att_status_half_day', 'HALF_DAY', 'Half Day', 'Half-day attendance or leave.', 'info', 1, 0, 1, 1, 1, 60),
  ('att_status_off_day', 'OFF_DAY', 'Off Day', 'Weekly off day.', 'neutral', 0, 0, 0, 1, 1, 70),
  ('att_status_holiday', 'HOLIDAY', 'Holiday', 'Public holiday.', 'neutral', 0, 0, 0, 1, 1, 80),
  ('att_status_pending_correction', 'PENDING_CORRECTION', 'Pending Correction', 'Attendance correction is awaiting review.', 'warning', 0, 0, 1, 1, 1, 90);

INSERT OR IGNORE INTO attendance_settings (
  id, standard_work_minutes_per_day, default_shift_start_time, default_shift_end_time,
  late_grace_minutes, early_checkout_grace_minutes, weekly_off_days_json,
  mark_absent_if_no_punch, missed_punch_requires_correction, payroll_deduction_enabled
) VALUES (
  'attendance_settings_default', 480, '09:00', '18:00', 10, 10, '["FRIDAY"]', 1, 1, 0
);

INSERT OR IGNORE INTO shift_templates (
  id, code, name, description, start_time, end_time, break_minutes,
  total_work_minutes, color_label, is_overnight, is_active, sort_order
) VALUES
  ('shift_template_general', 'GENERAL', 'General', 'Standard day shift.', '09:00', '18:00', 60, 480, 'cyan', 0, 1, 10),
  ('shift_template_morning', 'MORNING', 'Morning', 'Morning operations shift.', '07:00', '15:00', 30, 450, 'emerald', 0, 1, 20),
  ('shift_template_evening', 'EVENING', 'Evening', 'Evening operations shift.', '15:00', '23:00', 30, 450, 'amber', 0, 1, 30),
  ('shift_template_night', 'NIGHT', 'Night', 'Overnight operations shift.', '23:00', '07:00', 30, 450, 'violet', 1, 1, 40),
  ('shift_template_off', 'OFF', 'Off Day', 'Rostered off day marker.', '00:00', '00:00', 0, 0, 'slate', 0, 1, 50);

INSERT OR IGNORE INTO roster_settings (
  id, module_enabled, default_week_start_day, roster_period_mode,
  allow_draft_roster_editing, require_publish_before_employee_visibility,
  allow_unpublish_before_lock, allow_changes_after_publish,
  require_reason_for_changes_after_publish, allow_roster_lock,
  lock_roster_after_attendance_payroll_placeholder,
  allow_shift_overlap_warnings, block_overlapping_shifts_by_default,
  allow_cross_worksite_assignment_with_permission,
  roster_aware_attendance_enabled, roster_aware_leave_counting_enabled,
  default_off_day_handling_mode, public_holiday_work_assignment_mode,
  employee_self_service_roster_visibility_enabled,
  manager_team_roster_visibility_enabled, copy_previous_week_enabled,
  bulk_assignment_enabled, default_break_minutes, default_expected_work_minutes,
  allow_published_roster_edits, require_reason_for_published_edits,
  show_leave_on_roster, show_attendance_on_roster, default_shift_template_id
) VALUES (
  'roster_settings_default', 1, 'MONDAY', 'WEEKLY',
  1, 1, 1, 1, 1, 1, 0,
  1, 1, 1, 1, 1,
  'EXPLICIT_ONLY', 'ALLOW_EXPLICIT_SHIFT',
  1, 1, 1, 1, 60, 480,
  1, 1, 1, 1, 'shift_template_general'
);

INSERT OR IGNORE INTO payroll_components (
  id, code, name, type, category, calculation_type,
  default_amount, default_percentage, applies_to_basic_salary,
  is_taxable, is_active, sort_order
) VALUES
  ('pay_comp_basic_salary', 'BASIC_SALARY', 'Basic Salary', 'BASIC_SALARY', 'BASIC', 'FIXED_AMOUNT', NULL, NULL, 1, 1, 1, 10),
  ('pay_comp_service_allowance', 'SERVICE_ALLOWANCE', 'Service Allowance', 'ALLOWANCE', 'ALLOWANCE', 'FIXED_AMOUNT', 0, NULL, 0, 1, 1, 20),
  ('pay_comp_food_allowance', 'FOOD_ALLOWANCE', 'Food Allowance', 'ALLOWANCE', 'ALLOWANCE', 'FIXED_AMOUNT', 0, NULL, 0, 1, 1, 30),
  ('pay_comp_accommodation_allowance', 'ACCOMMODATION_ALLOWANCE', 'Accommodation Allowance', 'ALLOWANCE', 'ALLOWANCE', 'FIXED_AMOUNT', 0, NULL, 0, 1, 1, 40),
  ('pay_comp_overtime_pay', 'OVERTIME_PAY', 'Overtime Pay', 'OVERTIME_PLACEHOLDER', 'OVERTIME', 'MANUAL', 0, NULL, 0, 1, 1, 50),
  ('pay_comp_benefit', 'BENEFIT', 'Benefit', 'BENEFIT_PLACEHOLDER', 'BENEFIT', 'MANUAL', 0, NULL, 0, 1, 1, 60),
  ('pay_comp_advance_deduction', 'ADVANCE_DEDUCTION', 'Advance Deduction', 'ADVANCE_DEDUCTION', 'ADVANCE', 'MANUAL', 0, NULL, 0, 0, 1, 110),
  ('pay_comp_absence_deduction', 'ABSENCE_DEDUCTION', 'Absence Deduction', 'ATTENDANCE_DEDUCTION', 'ATTENDANCE', 'DAILY_RATE', 0, NULL, 1, 0, 1, 120),
  ('pay_comp_late_deduction', 'LATE_DEDUCTION', 'Late Deduction', 'ATTENDANCE_DEDUCTION', 'ATTENDANCE', 'MANUAL', 0, NULL, 1, 0, 1, 130),
  ('pay_comp_leave_deduction', 'LEAVE_DEDUCTION', 'Leave Deduction', 'LEAVE_DEDUCTION', 'LEAVE', 'DAILY_RATE', 0, NULL, 1, 0, 1, 140),
  ('pay_comp_other_deduction', 'OTHER_DEDUCTION', 'Other Deduction', 'VARIABLE_DEDUCTION', 'OTHER', 'MANUAL', 0, NULL, 0, 0, 1, 150);

INSERT OR IGNORE INTO payroll_settings (
  id, default_currency, default_daily_rate_mode, allow_negative_net_salary,
  require_approval_before_paid, include_attendance_deductions,
  include_leave_deductions, include_advance_deductions,
  include_roster_scheduled_days, default_salary_payment_day
) VALUES (
  'payroll_settings_default', 'MVR', 'FIXED_30_DAYS', 0, 1, 1, 1, 1, 1, 28
);

INSERT OR IGNORE INTO asset_categories (
  id, code, name, type, description, is_active, sort_order
) VALUES
  ('asset_cat_uniform_shirt', 'UNIFORM_SHIRT', 'Uniform Shirt', 'UNIFORM', 'Employee uniform shirts by size and variant.', 1, 10),
  ('asset_cat_uniform_pants', 'UNIFORM_PANTS', 'Uniform Pants', 'UNIFORM', 'Employee uniform pants by size and variant.', 1, 20),
  ('asset_cat_shoes', 'SHOES', 'Shoes', 'UNIFORM', 'Work shoes and safety footwear.', 1, 30),
  ('asset_cat_name_badge', 'NAME_BADGE', 'Name Badge', 'UNIFORM', 'Name badges and ID badges.', 1, 40),
  ('asset_cat_access_card', 'ACCESS_CARD', 'Access Card', 'ASSET', 'Access cards and key cards.', 1, 50),
  ('asset_cat_locker_key', 'LOCKER_KEY', 'Locker Key', 'ASSET', 'Locker and cabinet keys.', 1, 60),
  ('asset_cat_device', 'DEVICE', 'Device', 'ASSET', 'Phones, tablets, laptops, and devices.', 1, 70),
  ('asset_cat_other', 'OTHER', 'Other', 'OTHER', 'Other asset and uniform items.', 1, 100);

INSERT OR IGNORE INTO employee_note_categories (
  id, code, name, description, default_visibility, is_active, sort_order
) VALUES
  ('note_cat_general', 'GENERAL', 'General', 'General employee note.', 'GENERAL', 1, 10),
  ('note_cat_hr_note', 'HR_NOTE', 'HR Note', 'HR-only employee note.', 'HR_ONLY', 1, 20),
  ('note_cat_performance', 'PERFORMANCE', 'Performance', 'Performance and coaching notes.', 'HR_ONLY', 1, 30),
  ('note_cat_disciplinary', 'DISCIPLINARY', 'Disciplinary', 'Restricted disciplinary notes.', 'RESTRICTED', 1, 40),
  ('note_cat_payroll', 'PAYROLL', 'Payroll', 'Payroll-related note.', 'HR_ONLY', 1, 50),
  ('note_cat_attendance', 'ATTENDANCE', 'Attendance', 'Attendance-related note.', 'HR_ONLY', 1, 60),
  ('note_cat_leave', 'LEAVE', 'Leave', 'Leave-related note.', 'HR_ONLY', 1, 70),
  ('note_cat_document', 'DOCUMENT', 'Document', 'Document-related note.', 'HR_ONLY', 1, 80),
  ('note_cat_asset', 'ASSET', 'Asset', 'Asset and uniform note.', 'HR_ONLY', 1, 90),
  ('note_cat_other', 'OTHER', 'Other', 'Other restricted note.', 'GENERAL', 1, 100);
