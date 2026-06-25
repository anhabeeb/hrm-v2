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
  ('perm_admin_help_view', 'admin.help.view', 'admin', 'View Super Admin HRM configuration guide', 1),
  ('perm_admin_help_manage', 'admin.help.manage', 'admin', 'Manage Super Admin HRM guide content', 1),
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
  ('perm_attendance_devices_settings_view', 'attendance.devices.settings.view', 'attendance', 'View attendance device integration settings', 0),
  ('perm_attendance_devices_settings_update', 'attendance.devices.settings.update', 'attendance', 'Update attendance device integration settings', 0),
  ('perm_attendance_devices_settings_manage', 'attendance.devices.settings.manage', 'attendance', 'Manage attendance device integration settings', 0),
  ('perm_attendance_devices_view', 'attendance.devices.view', 'attendance', 'View biometric attendance devices', 0),
  ('perm_attendance_devices_create', 'attendance.devices.create', 'attendance', 'Create biometric attendance devices', 0),
  ('perm_attendance_devices_update', 'attendance.devices.update', 'attendance', 'Update biometric attendance devices', 0),
  ('perm_attendance_devices_archive', 'attendance.devices.archive', 'attendance', 'Archive biometric attendance devices', 0),
  ('perm_attendance_devices_technical', 'attendance.devices.technical', 'attendance', 'View device diagnostics and technical fields', 0),
  ('perm_attendance_biometric_mappings_view', 'attendance.biometric_mappings.view', 'attendance', 'View biometric user mappings', 0),
  ('perm_attendance_biometric_mappings_manage', 'attendance.biometric_mappings.manage', 'attendance', 'Manage biometric user mappings', 0),
  ('perm_attendance_import_batches_view', 'attendance.import_batches.view', 'attendance', 'View attendance import batches', 0),
  ('perm_attendance_import_batches_upload', 'attendance.import_batches.upload', 'attendance', 'Upload attendance import batches', 0),
  ('perm_attendance_import_batches_process', 'attendance.import_batches.process', 'attendance', 'Process attendance import batches', 0),
  ('perm_attendance_import_batches_cancel', 'attendance.import_batches.cancel', 'attendance', 'Cancel attendance import batches', 0),
  ('perm_attendance_import_batches_manage', 'attendance.import_batches.manage', 'attendance', 'Manage attendance import batches', 0),
  ('perm_attendance_raw_logs_view', 'attendance.raw_logs.view', 'attendance', 'View attendance raw device logs', 0),
  ('perm_attendance_raw_logs_manage', 'attendance.raw_logs.manage', 'attendance', 'Manage attendance raw device logs', 0),
  ('perm_attendance_raw_logs_manual', 'attendance.raw_logs.manual', 'attendance', 'Create manual raw attendance logs', 0),
  ('perm_attendance_raw_logs_reprocess', 'attendance.raw_logs.reprocess', 'attendance', 'Reprocess raw attendance logs', 0),
  ('perm_attendance_unmatched_logs_view', 'attendance.unmatched_logs.view', 'attendance', 'View unmatched biometric attendance logs', 0),
  ('perm_attendance_unmatched_logs_resolve', 'attendance.unmatched_logs.resolve', 'attendance', 'Resolve unmatched biometric attendance logs', 0),
  ('perm_attendance_unmatched_logs_manage', 'attendance.unmatched_logs.manage', 'attendance', 'Manage unmatched biometric attendance logs', 0),
  ('perm_attendance_locked_warnings_view', 'attendance.locked_warnings.view', 'attendance', 'View payroll-locked attendance import warnings', 0),
  ('perm_attendance_locked_warnings_resolve', 'attendance.locked_warnings.resolve', 'attendance', 'Resolve payroll-locked attendance import warnings', 0),
  ('perm_attendance_locked_warnings_manage', 'attendance.locked_warnings.manage', 'attendance', 'Manage payroll-locked attendance import warnings', 0),
  ('perm_attendance_import_errors_view', 'attendance.import_errors.view', 'attendance', 'View attendance import row errors', 0),
  ('perm_attendance_import_errors_manage', 'attendance.import_errors.manage', 'attendance', 'Resolve attendance import row errors', 0),
  ('perm_attendance_device_diagnostics_view', 'attendance.device_diagnostics.view', 'attendance', 'View attendance device diagnostics', 0),
  ('perm_attendance_vendor_integrations_view', 'attendance.vendor_integrations.view', 'attendance', 'View attendance vendor integration placeholders', 0),
  ('perm_attendance_vendor_integrations_manage', 'attendance.vendor_integrations.manage', 'attendance', 'Manage attendance vendor integration placeholders', 0),
  ('perm_attendance_settings_manage', 'attendance.settings.manage', 'attendance', 'Manage attendance settings', 0),
  ('perm_attendance_reports_view', 'attendance.reports.view', 'attendance', 'View attendance reports', 0),
  ('perm_attendance_reports_export', 'attendance.reports.export', 'attendance', 'Export attendance reports', 0),
  ('perm_reports_attendance_devices_view', 'reports.attendance_devices.view', 'reports', 'View attendance device and import reports', 0),
  ('perm_reports_attendance_devices_sensitive_view', 'reports.attendance_devices.sensitive.view', 'reports', 'View sensitive attendance device report details', 0),
  ('perm_reports_attendance_devices_export', 'reports.attendance_devices.export', 'reports', 'Export attendance device and import reports', 0),
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
  ('perm_payroll_reports_sensitive_view', 'payroll.reports.sensitive.view', 'payroll', 'View sensitive payroll report values', 0),
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
  ('perm_payroll_approvals_view', 'payroll.approvals.view', 'payroll', 'View payroll approval history', 0),
  ('perm_payroll_approvals_submit', 'payroll.approvals.submit', 'payroll', 'Submit payroll runs for approval', 0),
  ('perm_payroll_approvals_approve', 'payroll.approvals.approve', 'payroll', 'Approve submitted payroll runs', 0),
  ('perm_payroll_approvals_reject', 'payroll.approvals.reject', 'payroll', 'Reject submitted payroll runs', 0),
  ('perm_payroll_approvals_send_back', 'payroll.approvals.send_back', 'payroll', 'Send submitted payroll runs back for changes', 0),
  ('perm_payroll_approvals_manage', 'payroll.approvals.manage', 'payroll', 'Manage payroll approvals', 0),
  ('perm_payroll_finalization_view', 'payroll.finalization.view', 'payroll', 'View payroll finalization status', 0),
  ('perm_payroll_finalization_finalize', 'payroll.finalization.finalize', 'payroll', 'Finalize approved payroll runs', 0),
  ('perm_payroll_finalization_unlock', 'payroll.finalization.unlock', 'payroll', 'Unlock finalized payroll runs with reason', 0),
  ('perm_payroll_finalization_manage', 'payroll.finalization.manage', 'payroll', 'Manage payroll finalization', 0),
  ('perm_payroll_override_finalized', 'payroll.override_finalized', 'payroll', 'Override finalized payroll restrictions', 1),
  ('perm_payroll_unlock_after_finalization', 'payroll.unlock_after_finalization', 'payroll', 'Unlock payroll after finalization', 1),
  ('perm_payroll_payslips_view', 'payroll.payslips.view', 'payroll', 'View payroll payslips', 0),
  ('perm_payroll_payslips_generate', 'payroll.payslips.generate', 'payroll', 'Generate payroll payslips', 0),
  ('perm_payroll_payslips_regenerate', 'payroll.payslips.regenerate', 'payroll', 'Regenerate payroll payslips', 0),
  ('perm_payroll_payslips_download', 'payroll.payslips.download', 'payroll', 'Download payroll payslips', 0),
  ('perm_payroll_payslips_cancel', 'payroll.payslips.cancel', 'payroll', 'Cancel payroll payslips', 0),
  ('perm_payroll_payslips_manage', 'payroll.payslips.manage', 'payroll', 'Manage payroll payslips', 0),
  ('perm_payroll_payment_register_view', 'payroll.payment_register.view', 'payroll', 'View payroll payment register', 0),
  ('perm_payroll_payment_register_prepare', 'payroll.payment_register.prepare', 'payroll', 'Prepare payroll payment register', 0),
  ('perm_payroll_payment_register_confirm_manual_paid', 'payroll.payment_register.confirm_manual_paid', 'payroll', 'Confirm payroll payments manually', 0),
  ('perm_payroll_payment_register_cancel', 'payroll.payment_register.cancel', 'payroll', 'Cancel payroll payment register entries', 0),
  ('perm_payroll_payment_register_manage', 'payroll.payment_register.manage', 'payroll', 'Manage payroll payment register', 0),
  ('perm_payroll_payment_register_sensitive_view', 'payroll.payment_register.sensitive.view', 'payroll', 'View sensitive payment register fields', 0),
  ('perm_payroll_history_view', 'payroll.history.view', 'payroll', 'View finalized payroll history', 0),
  ('perm_payroll_history_employee_view', 'payroll.history.employee.view', 'payroll', 'View employee payroll history', 0),
  ('perm_employees_payroll_view', 'employees.payroll.view', 'employees', 'View Employee 360 payroll information', 0),
  ('perm_employees_payroll_update', 'employees.payroll.update', 'employees', 'Update Employee 360 payroll profile', 0),
  ('perm_payroll_payment_institutions_view', 'payroll.payment_institutions.view', 'payroll', 'View configurable banks and payment institutions', 0),
  ('perm_payroll_payment_institutions_create', 'payroll.payment_institutions.create', 'payroll', 'Create configurable banks and payment institutions', 0),
  ('perm_payroll_payment_institutions_update', 'payroll.payment_institutions.update', 'payroll', 'Update configurable banks and payment institutions', 0),
  ('perm_payroll_payment_institutions_archive', 'payroll.payment_institutions.archive', 'payroll', 'Archive configurable banks and payment institutions', 0),
  ('perm_payroll_payment_institutions_manage', 'payroll.payment_institutions.manage', 'payroll', 'Manage configurable banks and payment institutions', 0),
  ('perm_employees_payment_methods_view', 'employees.payment_methods.view', 'employees', 'View employee payment methods', 0),
  ('perm_employees_payment_methods_sensitive_view', 'employees.payment_methods.sensitive.view', 'employees', 'View sensitive employee payment method details', 0),
  ('perm_employees_payment_methods_create', 'employees.payment_methods.create', 'employees', 'Create employee payment methods', 0),
  ('perm_employees_payment_methods_update', 'employees.payment_methods.update', 'employees', 'Update employee payment methods', 0),
  ('perm_employees_payment_methods_verify', 'employees.payment_methods.verify', 'employees', 'Verify employee payment methods', 0),
  ('perm_employees_payment_methods_archive', 'employees.payment_methods.archive', 'employees', 'Archive employee payment methods', 0),
  ('perm_employees_payment_methods_manage', 'employees.payment_methods.manage', 'employees', 'Manage employee payment methods', 0),
  ('perm_payroll_payment_methods_view', 'payroll.payment_methods.view', 'payroll', 'View payroll payment method data', 0),
  ('perm_payroll_payment_methods_manage', 'payroll.payment_methods.manage', 'payroll', 'Manage payroll payment methods', 0),
  ('perm_self_service_payment_methods_view', 'self_service.payment_methods.view', 'self_service', 'View own payment methods', 0),
  ('perm_payroll_bank_loans_view', 'payroll.bank_loans.view', 'payroll', 'View employee bank loans', 0),
  ('perm_payroll_bank_loans_sensitive_view', 'payroll.bank_loans.sensitive.view', 'payroll', 'View sensitive employee bank loan details', 0),
  ('perm_payroll_bank_loans_create', 'payroll.bank_loans.create', 'payroll', 'Create employee bank loans', 0),
  ('perm_payroll_bank_loans_update', 'payroll.bank_loans.update', 'payroll', 'Update employee bank loans', 0),
  ('perm_payroll_bank_loans_approve', 'payroll.bank_loans.approve', 'payroll', 'Approve employee bank loans', 0),
  ('perm_payroll_bank_loans_pause', 'payroll.bank_loans.pause', 'payroll', 'Pause employee bank loans', 0),
  ('perm_payroll_bank_loans_cancel', 'payroll.bank_loans.cancel', 'payroll', 'Cancel employee bank loans', 0),
  ('perm_payroll_bank_loans_manage', 'payroll.bank_loans.manage', 'payroll', 'Manage employee bank loans', 0),
  ('perm_payroll_bank_loan_payments_view', 'payroll.bank_loan_payments.view', 'payroll', 'View bank loan payroll payments', 0),
  ('perm_payroll_bank_loan_payments_confirm', 'payroll.bank_loan_payments.confirm', 'payroll', 'Confirm bank loan payments to bank manually', 0),
  ('perm_payroll_bank_loan_payments_manage', 'payroll.bank_loan_payments.manage', 'payroll', 'Manage bank loan payroll payments', 0),
  ('perm_payroll_bank_loan_remittance_view', 'payroll.bank_loan_remittance.view', 'payroll', 'View bank loan remittance batches', 0),
  ('perm_payroll_bank_loan_remittance_prepare', 'payroll.bank_loan_remittance.prepare', 'payroll', 'Prepare bank loan remittance batches', 0),
  ('perm_payroll_bank_loan_remittance_confirm', 'payroll.bank_loan_remittance.confirm', 'payroll', 'Confirm bank loan remittance manually', 0),
  ('perm_payroll_bank_loan_remittance_manage', 'payroll.bank_loan_remittance.manage', 'payroll', 'Manage bank loan remittance batches', 0),
  ('perm_payroll_bank_loan_remittance_sensitive_view', 'payroll.bank_loan_remittance.sensitive.view', 'payroll', 'View sensitive bank loan remittance details', 0),
  ('perm_self_service_bank_loans_view', 'self_service.bank_loans.view', 'self_service', 'View own bank loans', 0),
  ('perm_payroll_pension_schemes_view', 'payroll.pension_schemes.view', 'payroll', 'View pension schemes', 0),
  ('perm_payroll_pension_schemes_create', 'payroll.pension_schemes.create', 'payroll', 'Create pension schemes', 0),
  ('perm_payroll_pension_schemes_update', 'payroll.pension_schemes.update', 'payroll', 'Update pension schemes', 0),
  ('perm_payroll_pension_schemes_archive', 'payroll.pension_schemes.archive', 'payroll', 'Archive pension schemes', 0),
  ('perm_payroll_pension_schemes_manage', 'payroll.pension_schemes.manage', 'payroll', 'Manage pension schemes', 0),
  ('perm_employees_pension_profiles_view', 'employees.pension_profiles.view', 'employees', 'View employee pension profiles', 0),
  ('perm_employees_pension_profiles_sensitive_view', 'employees.pension_profiles.sensitive.view', 'employees', 'View sensitive employee pension profile details', 0),
  ('perm_employees_pension_profiles_update', 'employees.pension_profiles.update', 'employees', 'Update employee pension profiles', 0),
  ('perm_employees_pension_profiles_manage', 'employees.pension_profiles.manage', 'employees', 'Manage employee pension profiles', 0),
  ('perm_payroll_pension_contributions_view', 'payroll.pension_contributions.view', 'payroll', 'View payroll pension contributions', 0),
  ('perm_payroll_pension_contributions_manage', 'payroll.pension_contributions.manage', 'payroll', 'Manage payroll pension contributions', 0),
  ('perm_payroll_pension_remittance_view', 'payroll.pension_remittance.view', 'payroll', 'View pension remittance batches', 0),
  ('perm_payroll_pension_remittance_prepare', 'payroll.pension_remittance.prepare', 'payroll', 'Prepare pension remittance batches', 0),
  ('perm_payroll_pension_remittance_confirm', 'payroll.pension_remittance.confirm', 'payroll', 'Confirm pension remittance manually', 0),
  ('perm_payroll_pension_remittance_manage', 'payroll.pension_remittance.manage', 'payroll', 'Manage pension remittance batches', 0),
  ('perm_payroll_pension_remittance_sensitive_view', 'payroll.pension_remittance.sensitive.view', 'payroll', 'View sensitive pension remittance details', 0),
  ('perm_self_service_pension_view', 'self_service.pension.view', 'self_service', 'View own pension information', 0),
  ('perm_payroll_custom_deduction_templates_view', 'payroll.custom_deduction_templates.view', 'payroll', 'View custom deduction templates', 0),
  ('perm_payroll_custom_deduction_templates_create', 'payroll.custom_deduction_templates.create', 'payroll', 'Create custom deduction templates', 0),
  ('perm_payroll_custom_deduction_templates_update', 'payroll.custom_deduction_templates.update', 'payroll', 'Update custom deduction templates', 0),
  ('perm_payroll_custom_deduction_templates_archive', 'payroll.custom_deduction_templates.archive', 'payroll', 'Archive custom deduction templates', 0),
  ('perm_payroll_custom_deduction_templates_manage', 'payroll.custom_deduction_templates.manage', 'payroll', 'Manage custom deduction templates', 0),
  ('perm_payroll_employee_custom_deductions_view', 'payroll.employee_custom_deductions.view', 'payroll', 'View employee custom deductions', 0),
  ('perm_payroll_employee_custom_deductions_create', 'payroll.employee_custom_deductions.create', 'payroll', 'Assign custom deductions to employees', 0),
  ('perm_payroll_employee_custom_deductions_update', 'payroll.employee_custom_deductions.update', 'payroll', 'Update employee custom deductions', 0),
  ('perm_payroll_employee_custom_deductions_approve', 'payroll.employee_custom_deductions.approve', 'payroll', 'Approve employee custom deductions', 0),
  ('perm_payroll_employee_custom_deductions_reject', 'payroll.employee_custom_deductions.reject', 'payroll', 'Reject employee custom deductions', 0),
  ('perm_payroll_employee_custom_deductions_pause', 'payroll.employee_custom_deductions.pause', 'payroll', 'Pause employee custom deductions', 0),
  ('perm_payroll_employee_custom_deductions_resume', 'payroll.employee_custom_deductions.resume', 'payroll', 'Resume employee custom deductions', 0),
  ('perm_payroll_employee_custom_deductions_cancel', 'payroll.employee_custom_deductions.cancel', 'payroll', 'Cancel employee custom deductions', 0),
  ('perm_payroll_employee_custom_deductions_manage', 'payroll.employee_custom_deductions.manage', 'payroll', 'Manage employee custom deductions', 0),
  ('perm_payroll_custom_deduction_settings_view', 'payroll.custom_deduction_settings.view', 'payroll', 'View custom deduction settings', 0),
  ('perm_payroll_custom_deduction_settings_update', 'payroll.custom_deduction_settings.update', 'payroll', 'Update custom deduction settings', 0),
  ('perm_payroll_custom_deduction_settings_manage', 'payroll.custom_deduction_settings.manage', 'payroll', 'Manage custom deduction settings', 0),
  ('perm_payroll_custom_deduction_reports_view', 'payroll.custom_deduction_reports.view', 'payroll', 'View custom deduction reports', 0),
  ('perm_payroll_custom_deduction_reports_sensitive_view', 'payroll.custom_deduction_reports.sensitive.view', 'payroll', 'View sensitive custom deduction reports', 0),
  ('perm_employees_custom_deductions_view', 'employees.custom_deductions.view', 'employees', 'View Employee 360 custom deductions', 0),
  ('perm_employees_custom_deductions_manage', 'employees.custom_deductions.manage', 'employees', 'Manage Employee 360 custom deductions', 0),
  ('perm_self_service_custom_deductions_view', 'self_service.custom_deductions.view', 'self_service', 'View own custom deductions', 0),
  ('perm_final_settlement_view', 'final_settlement.view', 'final_settlement', 'View final settlement overview', 0),
  ('perm_final_settlement_manage', 'final_settlement.manage', 'final_settlement', 'Manage final settlement module records', 0),
  ('perm_final_settlement_settings_view', 'final_settlement.settings.view', 'final_settlement', 'View final settlement settings', 0),
  ('perm_final_settlement_settings_update', 'final_settlement.settings.update', 'final_settlement', 'Update final settlement settings', 0),
  ('perm_final_settlement_settings_manage', 'final_settlement.settings.manage', 'final_settlement', 'Manage final settlement settings', 0),
  ('perm_final_settlement_cases_view', 'final_settlement.cases.view', 'final_settlement', 'View final settlement cases', 0),
  ('perm_final_settlement_cases_create', 'final_settlement.cases.create', 'final_settlement', 'Create final settlement cases', 0),
  ('perm_final_settlement_cases_update', 'final_settlement.cases.update', 'final_settlement', 'Update final settlement cases', 0),
  ('perm_final_settlement_cases_cancel', 'final_settlement.cases.cancel', 'final_settlement', 'Cancel final settlement cases', 0),
  ('perm_final_settlement_cases_manage', 'final_settlement.cases.manage', 'final_settlement', 'Manage final settlement cases', 0),
  ('perm_final_settlement_calculate', 'final_settlement.calculate', 'final_settlement', 'Calculate final settlements', 0),
  ('perm_final_settlement_recalculate', 'final_settlement.recalculate', 'final_settlement', 'Recalculate final settlements', 0),
  ('perm_final_settlement_line_items_view', 'final_settlement.line_items.view', 'final_settlement', 'View final settlement line items', 0),
  ('perm_final_settlement_line_items_manage', 'final_settlement.line_items.manage', 'final_settlement', 'Manage final settlement line items', 0),
  ('perm_final_settlement_manual_adjustments_create', 'final_settlement.manual_adjustments.create', 'final_settlement', 'Create final settlement manual adjustments', 0),
  ('perm_final_settlement_manual_adjustments_cancel', 'final_settlement.manual_adjustments.cancel', 'final_settlement', 'Cancel final settlement manual adjustments', 0),
  ('perm_final_settlement_clearance_view', 'final_settlement.clearance.view', 'final_settlement', 'View final settlement clearance', 0),
  ('perm_final_settlement_clearance_update', 'final_settlement.clearance.update', 'final_settlement', 'Update final settlement clearance', 0),
  ('perm_final_settlement_clearance_waive', 'final_settlement.clearance.waive', 'final_settlement', 'Waive final settlement clearance items', 0),
  ('perm_final_settlement_approvals_view', 'final_settlement.approvals.view', 'final_settlement', 'View final settlement approvals', 0),
  ('perm_final_settlement_approvals_submit', 'final_settlement.approvals.submit', 'final_settlement', 'Submit final settlements for approval', 0),
  ('perm_final_settlement_approvals_approve', 'final_settlement.approvals.approve', 'final_settlement', 'Approve final settlements', 0),
  ('perm_final_settlement_approvals_reject', 'final_settlement.approvals.reject', 'final_settlement', 'Reject final settlements', 0),
  ('perm_final_settlement_approvals_send_back', 'final_settlement.approvals.send_back', 'final_settlement', 'Send final settlements back for changes', 0),
  ('perm_final_settlement_approvals_manage', 'final_settlement.approvals.manage', 'final_settlement', 'Manage final settlement approvals', 0),
  ('perm_final_settlement_finalization_finalize', 'final_settlement.finalization.finalize', 'final_settlement', 'Finalize approved final settlements', 0),
  ('perm_final_settlement_finalization_unlock', 'final_settlement.finalization.unlock', 'final_settlement', 'Unlock finalized final settlements', 0),
  ('perm_final_settlement_finalization_manage', 'final_settlement.finalization.manage', 'final_settlement', 'Manage final settlement finalization', 0),
  ('perm_final_settlement_override_finalized', 'final_settlement.override_finalized', 'final_settlement', 'Override finalized final settlement restrictions', 1),
  ('perm_final_settlement_payment_register_view', 'final_settlement.payment_register.view', 'final_settlement', 'View final settlement payment register', 0),
  ('perm_final_settlement_payment_register_prepare', 'final_settlement.payment_register.prepare', 'final_settlement', 'Prepare final settlement payment register', 0),
  ('perm_final_settlement_payment_register_confirm_manual_paid', 'final_settlement.payment_register.confirm_manual_paid', 'final_settlement', 'Confirm final settlement manual payment', 0),
  ('perm_final_settlement_payment_register_cancel', 'final_settlement.payment_register.cancel', 'final_settlement', 'Cancel final settlement payment register rows', 0),
  ('perm_final_settlement_payment_register_manage', 'final_settlement.payment_register.manage', 'final_settlement', 'Manage final settlement payment register', 0),
  ('perm_final_settlement_payment_register_sensitive_view', 'final_settlement.payment_register.sensitive.view', 'final_settlement', 'View sensitive final settlement payment details', 0),
  ('perm_final_settlement_reports_view', 'final_settlement.reports.view', 'final_settlement', 'View final settlement reports', 0),
  ('perm_final_settlement_reports_sensitive_view', 'final_settlement.reports.sensitive.view', 'final_settlement', 'View sensitive final settlement reports', 0),
  ('perm_final_settlement_history_view', 'final_settlement.history.view', 'final_settlement', 'View final settlement history', 0),
  ('perm_employees_final_settlement_view', 'employees.final_settlement.view', 'employees', 'View Employee 360 final settlement information', 0),
  ('perm_employees_final_settlement_sensitive_view', 'employees.final_settlement.sensitive.view', 'employees', 'View sensitive Employee 360 final settlement values', 0),
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
  ('perm_documents_compliance_view', 'documents.compliance.view', 'documents', 'View document compliance dashboards and scoped compliance status', 0),
  ('perm_documents_compliance_refresh', 'documents.compliance.refresh', 'documents', 'Refresh document compliance snapshots and alerts', 0),
  ('perm_documents_compliance_manage', 'documents.compliance.manage', 'documents', 'Manage document compliance operations', 0),
  ('perm_documents_compliance_settings_view', 'documents.compliance_settings.view', 'documents', 'View document compliance settings', 0),
  ('perm_documents_compliance_settings_update', 'documents.compliance_settings.update', 'documents', 'Update document compliance settings', 0),
  ('perm_documents_compliance_settings_manage', 'documents.compliance_settings.manage', 'documents', 'Manage document compliance settings', 0),
  ('perm_documents_types_compliance_view', 'documents.types.compliance.view', 'documents', 'View document type compliance rules', 0),
  ('perm_documents_types_compliance_update', 'documents.types.compliance.update', 'documents', 'Update document type compliance rules', 0),
  ('perm_documents_types_compliance_manage', 'documents.types.compliance.manage', 'documents', 'Manage document type compliance rules', 0),
  ('perm_documents_required_rules_view', 'documents.required_rules.view', 'documents', 'View required document rules', 0),
  ('perm_documents_required_rules_create', 'documents.required_rules.create', 'documents', 'Create required document rules', 0),
  ('perm_documents_required_rules_update', 'documents.required_rules.update', 'documents', 'Update required document rules', 0),
  ('perm_documents_required_rules_archive', 'documents.required_rules.archive', 'documents', 'Archive required document rules', 0),
  ('perm_documents_waivers_view', 'documents.waivers.view', 'documents', 'View document requirement waivers', 0),
  ('perm_documents_waivers_create', 'documents.waivers.create', 'documents', 'Create document requirement waivers', 0),
  ('perm_documents_waivers_cancel', 'documents.waivers.cancel', 'documents', 'Cancel document requirement waivers', 0),
  ('perm_documents_waivers_manage', 'documents.waivers.manage', 'documents', 'Manage document requirement waivers', 0),
  ('perm_documents_alerts_view', 'documents.alerts.view', 'documents', 'View document expiry and compliance alerts', 0),
  ('perm_documents_alerts_acknowledge', 'documents.alerts.acknowledge', 'documents', 'Acknowledge document alerts', 0),
  ('perm_documents_alerts_resolve', 'documents.alerts.resolve', 'documents', 'Resolve document alerts', 0),
  ('perm_documents_alerts_dismiss', 'documents.alerts.dismiss', 'documents', 'Dismiss document alerts', 0),
  ('perm_documents_alerts_manage', 'documents.alerts.manage', 'documents', 'Manage document alerts', 0),
  ('perm_documents_renewal_cases_view', 'documents.renewal_cases.view', 'documents', 'View document renewal cases', 0),
  ('perm_documents_renewal_cases_create', 'documents.renewal_cases.create', 'documents', 'Create document renewal cases', 0),
  ('perm_documents_renewal_cases_update', 'documents.renewal_cases.update', 'documents', 'Update document renewal cases', 0),
  ('perm_documents_renewal_cases_assign', 'documents.renewal_cases.assign', 'documents', 'Assign document renewal cases', 0),
  ('perm_documents_renewal_cases_complete', 'documents.renewal_cases.complete', 'documents', 'Complete document renewal cases', 0),
  ('perm_documents_renewal_cases_cancel', 'documents.renewal_cases.cancel', 'documents', 'Cancel document renewal cases', 0),
  ('perm_documents_renewal_cases_waive', 'documents.renewal_cases.waive', 'documents', 'Waive document renewal cases', 0),
  ('perm_documents_renewal_cases_manage', 'documents.renewal_cases.manage', 'documents', 'Manage document renewal cases', 0),
  ('perm_documents_registry_sensitive_view', 'documents.registry.sensitive.view', 'documents', 'View sensitive document registry compliance details', 0),
  ('perm_employees_documents_compliance_view', 'employees.documents.compliance.view', 'employees', 'View Employee 360 document compliance', 0),
  ('perm_employees_documents_compliance_manage', 'employees.documents.compliance.manage', 'employees', 'Manage Employee 360 document compliance actions', 0),
  ('perm_self_service_documents_compliance_view', 'self_service.documents.compliance.view', 'self_service', 'View own document compliance in self-service', 0),
  ('perm_reports_documents_view', 'reports.documents.view', 'reports', 'View document compliance reports', 0),
  ('perm_reports_documents_sensitive_view', 'reports.documents.sensitive.view', 'reports', 'View sensitive document compliance report values', 0),
  ('perm_reports_documents_export', 'reports.documents.export', 'reports', 'Export document compliance reports', 0),
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
  ('perm_reports_export_sensitive', 'reports.export.sensitive', 'reports', 'Export sensitive report values when permitted by module scope', 0),
  ('perm_reports_export_history_view', 'reports.export.history.view', 'reports', 'View report export history and audit logs', 0),
  ('perm_reports_payroll_view', 'reports.payroll.view', 'reports', 'View payroll summary reports', 0),
  ('perm_reports_pension_view', 'reports.pension.view', 'reports', 'View pension contribution and remittance reports', 0),
  ('perm_reports_bank_loans_view', 'reports.bank_loans.view', 'reports', 'View bank loan payroll reports', 0),
  ('perm_reports_custom_deductions_view', 'reports.custom_deductions.view', 'reports', 'View custom deduction reports', 0),
  ('perm_reports_final_settlement_view', 'reports.final_settlement.view', 'reports', 'View final settlement reports', 0),
  ('perm_reports_attendance_variance_view', 'reports.attendance_variance.view', 'reports', 'View attendance payroll variance reports', 0),
  ('perm_reports_leave_payroll_view', 'reports.leave_payroll.view', 'reports', 'View leave payroll impact reports', 0),
  ('perm_reports_roster_payroll_view', 'reports.roster_payroll.view', 'reports', 'View roster payroll impact reports', 0),
  ('perm_reports_payment_register_view', 'reports.payment_register.view', 'reports', 'View payment register reports', 0),
  ('perm_reports_compliance_view', 'reports.compliance.view', 'reports', 'View compliance report foundations', 0),
  ('perm_reports_manage', 'reports.manage', 'reports', 'Manage report settings and export history', 0),
  ('perm_contracts_view', 'contracts.view', 'contracts', 'View employee contracts', 0),
  ('perm_contracts_create', 'contracts.create', 'contracts', 'Create employee contracts', 0),
  ('perm_contracts_update', 'contracts.update', 'contracts', 'Update employee contracts', 0),
  ('perm_contracts_cancel', 'contracts.cancel', 'contracts', 'Cancel employee contracts', 0),
  ('perm_contracts_archive', 'contracts.archive', 'contracts', 'Archive employee contracts', 0),
  ('perm_contracts_manage', 'contracts.manage', 'contracts', 'Manage employee contracts', 0),
  ('perm_contracts_approve', 'contracts.approve', 'contracts', 'Approve employee contracts', 0),
  ('perm_contracts_reject', 'contracts.reject', 'contracts', 'Reject or send back employee contracts', 0),
  ('perm_contracts_renew', 'contracts.renew', 'contracts', 'Renew employee contracts', 0),
  ('perm_contracts_salary_terms_view', 'contracts.salary_terms.view', 'contracts', 'View contract salary terms', 0),
  ('perm_contracts_salary_terms_manage', 'contracts.salary_terms.manage', 'contracts', 'Manage contract salary terms', 0),
  ('perm_contracts_settings_view', 'contracts.settings.view', 'contracts', 'View contract settings', 0),
  ('perm_contracts_settings_update', 'contracts.settings.update', 'contracts', 'Update contract settings', 0),
  ('perm_contracts_settings_manage', 'contracts.settings.manage', 'contracts', 'Manage contract settings', 0),
  ('perm_contracts_types_view', 'contracts.types.view', 'contracts', 'View contract types', 0),
  ('perm_contracts_types_create', 'contracts.types.create', 'contracts', 'Create contract types', 0),
  ('perm_contracts_types_update', 'contracts.types.update', 'contracts', 'Update contract types', 0),
  ('perm_contracts_types_archive', 'contracts.types.archive', 'contracts', 'Archive contract types', 0),
  ('perm_contracts_types_manage', 'contracts.types.manage', 'contracts', 'Manage contract types', 0),
  ('perm_contracts_probation_view', 'contracts.probation.view', 'contracts', 'View probation tracking', 0),
  ('perm_contracts_probation_update', 'contracts.probation.update', 'contracts', 'Update probation tracking', 0),
  ('perm_contracts_probation_confirm', 'contracts.probation.confirm', 'contracts', 'Confirm probation completion', 0),
  ('perm_contracts_probation_extend', 'contracts.probation.extend', 'contracts', 'Extend probation with reason', 0),
  ('perm_contracts_probation_manage', 'contracts.probation.manage', 'contracts', 'Manage probation actions', 0),
  ('perm_contracts_renewals_view', 'contracts.renewals.view', 'contracts', 'View contract renewals', 0),
  ('perm_contracts_renewals_create', 'contracts.renewals.create', 'contracts', 'Create contract renewals', 0),
  ('perm_contracts_renewals_approve', 'contracts.renewals.approve', 'contracts', 'Approve contract renewals', 0),
  ('perm_contracts_renewals_activate', 'contracts.renewals.activate', 'contracts', 'Activate contract renewals', 0),
  ('perm_contracts_renewals_cancel', 'contracts.renewals.cancel', 'contracts', 'Cancel contract renewals', 0),
  ('perm_contracts_renewals_manage', 'contracts.renewals.manage', 'contracts', 'Manage contract renewals', 0),
  ('perm_contracts_alerts_view', 'contracts.alerts.view', 'contracts', 'View contract alerts', 0),
  ('perm_contracts_alerts_acknowledge', 'contracts.alerts.acknowledge', 'contracts', 'Acknowledge contract alerts', 0),
  ('perm_contracts_alerts_resolve', 'contracts.alerts.resolve', 'contracts', 'Resolve contract alerts', 0),
  ('perm_contracts_alerts_manage', 'contracts.alerts.manage', 'contracts', 'Manage contract alerts', 0),
  ('perm_employees_contracts_view', 'employees.contracts.view', 'employees', 'View Employee 360 contract information', 0),
  ('perm_employees_contracts_manage', 'employees.contracts.manage', 'employees', 'Manage Employee 360 contracts', 0),
  ('perm_reports_contracts_view', 'reports.contracts.view', 'reports', 'View contract reports', 0),
  ('perm_reports_contracts_sensitive_view', 'reports.contracts.sensitive.view', 'reports', 'View sensitive contract report values', 0),
  ('perm_self_service_contracts_view', 'self_service.contracts.view', 'self_service', 'View own contract summaries in self-service', 0),
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
  ('perm_self_service_payslips_view', 'self_service.payslips.view', 'self_service', 'View own payslips in self-service', 0),
  ('perm_self_service_payslips_download', 'self_service.payslips.download', 'self_service', 'Download own payslips in self-service', 0),
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

WITH contract_role_permissions(role_name, permission_key) AS (
  VALUES
  ('Employee Self-Service', 'self_service.contracts.view'),
  ('HR Staff', 'contracts.view'), ('HR Staff', 'contracts.create'), ('HR Staff', 'contracts.update'), ('HR Staff', 'employees.contracts.view'), ('HR Staff', 'reports.contracts.view'),
  ('Senior HR Staff', 'contracts.view'), ('Senior HR Staff', 'contracts.create'), ('Senior HR Staff', 'contracts.update'), ('Senior HR Staff', 'contracts.renew'), ('Senior HR Staff', 'contracts.probation.view'), ('Senior HR Staff', 'employees.contracts.view'), ('Senior HR Staff', 'reports.contracts.view'),
  ('HR Manager', 'contracts.view'), ('HR Manager', 'contracts.create'), ('HR Manager', 'contracts.update'), ('HR Manager', 'contracts.cancel'), ('HR Manager', 'contracts.archive'), ('HR Manager', 'contracts.approve'), ('HR Manager', 'contracts.reject'), ('HR Manager', 'contracts.renew'), ('HR Manager', 'contracts.salary_terms.view'), ('HR Manager', 'contracts.probation.manage'), ('HR Manager', 'contracts.renewals.manage'), ('HR Manager', 'contracts.alerts.manage'), ('HR Manager', 'employees.contracts.view'), ('HR Manager', 'employees.contracts.manage'), ('HR Manager', 'reports.contracts.view'),
  ('HR Head / HR Admin', 'contracts.view'), ('HR Head / HR Admin', 'contracts.create'), ('HR Head / HR Admin', 'contracts.update'), ('HR Head / HR Admin', 'contracts.cancel'), ('HR Head / HR Admin', 'contracts.archive'), ('HR Head / HR Admin', 'contracts.manage'), ('HR Head / HR Admin', 'contracts.approve'), ('HR Head / HR Admin', 'contracts.reject'), ('HR Head / HR Admin', 'contracts.renew'), ('HR Head / HR Admin', 'contracts.salary_terms.view'), ('HR Head / HR Admin', 'contracts.salary_terms.manage'), ('HR Head / HR Admin', 'contracts.settings.view'), ('HR Head / HR Admin', 'contracts.settings.manage'), ('HR Head / HR Admin', 'contracts.types.view'), ('HR Head / HR Admin', 'contracts.types.manage'), ('HR Head / HR Admin', 'contracts.probation.manage'), ('HR Head / HR Admin', 'contracts.renewals.manage'), ('HR Head / HR Admin', 'contracts.alerts.manage'), ('HR Head / HR Admin', 'employees.contracts.view'), ('HR Head / HR Admin', 'employees.contracts.manage'), ('HR Head / HR Admin', 'reports.contracts.view'), ('HR Head / HR Admin', 'reports.contracts.sensitive.view')
)
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM contract_role_permissions rp
INNER JOIN roles r ON r.name = rp.role_name
INNER JOIN permissions p ON p.key = rp.permission_key;

WITH document_compliance_role_permissions(role_name, permission_key) AS (
  VALUES
  ('Employee Self-Service', 'self_service.documents.compliance.view'),
  ('HR Staff', 'documents.compliance.view'),
  ('HR Staff', 'documents.alerts.view'),
  ('HR Staff', 'documents.renewal_cases.view'),
  ('HR Staff', 'documents.waivers.view'),
  ('HR Staff', 'employees.documents.compliance.view'),
  ('HR Staff', 'reports.documents.view'),
  ('Senior HR Staff', 'documents.compliance.view'),
  ('Senior HR Staff', 'documents.compliance.refresh'),
  ('Senior HR Staff', 'documents.alerts.view'),
  ('Senior HR Staff', 'documents.alerts.acknowledge'),
  ('Senior HR Staff', 'documents.renewal_cases.view'),
  ('Senior HR Staff', 'documents.renewal_cases.create'),
  ('Senior HR Staff', 'documents.renewal_cases.update'),
  ('Senior HR Staff', 'documents.waivers.view'),
  ('Senior HR Staff', 'documents.waivers.create'),
  ('Senior HR Staff', 'employees.documents.compliance.view'),
  ('Senior HR Staff', 'employees.documents.compliance.manage'),
  ('Senior HR Staff', 'reports.documents.view'),
  ('HR Manager', 'documents.compliance.view'),
  ('HR Manager', 'documents.compliance.refresh'),
  ('HR Manager', 'documents.compliance.manage'),
  ('HR Manager', 'documents.compliance_settings.view'),
  ('HR Manager', 'documents.types.compliance.view'),
  ('HR Manager', 'documents.types.compliance.update'),
  ('HR Manager', 'documents.alerts.view'),
  ('HR Manager', 'documents.alerts.manage'),
  ('HR Manager', 'documents.renewal_cases.view'),
  ('HR Manager', 'documents.renewal_cases.manage'),
  ('HR Manager', 'documents.waivers.view'),
  ('HR Manager', 'documents.waivers.manage'),
  ('HR Manager', 'documents.registry.sensitive.view'),
  ('HR Manager', 'employees.documents.compliance.view'),
  ('HR Manager', 'employees.documents.compliance.manage'),
  ('HR Manager', 'reports.documents.view'),
  ('HR Manager', 'reports.documents.export'),
  ('HR Head / HR Admin', 'documents.compliance.view'),
  ('HR Head / HR Admin', 'documents.compliance.refresh'),
  ('HR Head / HR Admin', 'documents.compliance.manage'),
  ('HR Head / HR Admin', 'documents.compliance_settings.view'),
  ('HR Head / HR Admin', 'documents.compliance_settings.update'),
  ('HR Head / HR Admin', 'documents.compliance_settings.manage'),
  ('HR Head / HR Admin', 'documents.types.compliance.view'),
  ('HR Head / HR Admin', 'documents.types.compliance.update'),
  ('HR Head / HR Admin', 'documents.types.compliance.manage'),
  ('HR Head / HR Admin', 'documents.required_rules.view'),
  ('HR Head / HR Admin', 'documents.required_rules.create'),
  ('HR Head / HR Admin', 'documents.required_rules.update'),
  ('HR Head / HR Admin', 'documents.required_rules.archive'),
  ('HR Head / HR Admin', 'documents.alerts.view'),
  ('HR Head / HR Admin', 'documents.alerts.manage'),
  ('HR Head / HR Admin', 'documents.renewal_cases.view'),
  ('HR Head / HR Admin', 'documents.renewal_cases.manage'),
  ('HR Head / HR Admin', 'documents.waivers.view'),
  ('HR Head / HR Admin', 'documents.waivers.manage'),
  ('HR Head / HR Admin', 'documents.registry.sensitive.view'),
  ('HR Head / HR Admin', 'employees.documents.compliance.view'),
  ('HR Head / HR Admin', 'employees.documents.compliance.manage'),
  ('HR Head / HR Admin', 'reports.documents.view'),
  ('HR Head / HR Admin', 'reports.documents.sensitive.view'),
  ('HR Head / HR Admin', 'reports.documents.export')
)
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM document_compliance_role_permissions rp
INNER JOIN roles r ON r.name = rp.role_name
INNER JOIN permissions p ON p.key = rp.permission_key;

INSERT OR IGNORE INTO contract_settings (
  id, contracts_enabled, require_contract_for_active_employee, auto_create_contract_task_on_onboarding,
  require_contract_approval_before_activation, allow_employee_without_contract_warning, contract_expiry_alerts_enabled,
  default_expiry_warning_days, default_probation_warning_days, default_renewal_warning_days, auto_mark_expired_contracts,
  auto_create_end_of_contract_settlement_case, require_reason_for_contract_change, allow_contract_salary_snapshot,
  allow_contract_salary_update_to_payroll_profile, require_approval_for_contract_salary_update, contract_document_required,
  contract_sensitive_salary_terms, metadata_json
) VALUES (
  'contract_settings_default', 1, 0, 1,
  0, 1, 1,
  30, 14, 30, 1,
  0, 1, 1,
  0, 1, 0,
  1, '{"source":"prompt14_default"}'
);

INSERT OR IGNORE INTO contract_types (
  id, code, name, description, category, default_duration_months, default_probation_months,
  requires_end_date, requires_probation, allows_renewal, allows_salary_terms, is_active, status, display_order
) VALUES
  ('contract_type_permanent', 'PERMANENT', 'Permanent', 'Open-ended employment contract foundation.', 'EMPLOYMENT', NULL, 3, 0, 1, 1, 1, 1, 'ACTIVE', 10),
  ('contract_type_fixed_term', 'FIXED_TERM', 'Fixed Term', 'Fixed-term employment contract with end date and renewal tracking.', 'EMPLOYMENT', 12, 3, 1, 1, 1, 1, 1, 'ACTIVE', 20),
  ('contract_type_temporary', 'TEMPORARY', 'Temporary', 'Short-term temporary employment contract.', 'TEMPORARY', 3, 0, 1, 0, 1, 1, 1, 'ACTIVE', 30),
  ('contract_type_probation', 'PROBATION', 'Probation', 'Probation-focused contract foundation.', 'PROBATION', 3, 3, 1, 1, 1, 1, 1, 'ACTIVE', 40),
  ('contract_type_renewal', 'RENEWAL', 'Renewal', 'Contract renewal record type.', 'RENEWAL', 12, 0, 1, 0, 1, 1, 1, 'ACTIVE', 50),
  ('contract_type_part_time_placeholder', 'PART_TIME_PLACEHOLDER', 'Part-Time Placeholder', 'Part-time contract placeholder template.', 'EMPLOYMENT', 12, 0, 1, 0, 1, 1, 1, 'ACTIVE', 60),
  ('contract_type_consultancy_placeholder', 'CONSULTANCY_PLACEHOLDER', 'Consultancy Placeholder', 'Consultancy placeholder for future non-employee contract handling.', 'CONSULTANCY_PLACEHOLDER', 6, 0, 1, 0, 1, 0, 1, 'ACTIVE', 70),
  ('contract_type_other', 'OTHER', 'Other', 'General contract type for special cases.', 'OTHER', NULL, NULL, 1, 0, 1, 1, 1, 'ACTIVE', 100);

WITH custom_deduction_role_permissions(role_name, permission_key) AS (
  VALUES
  ('Employee Self-Service', 'self_service.custom_deductions.view'),
  ('Finance Payroll Officer', 'payroll.custom_deduction_templates.view'),
  ('Finance Payroll Officer', 'payroll.employee_custom_deductions.view'),
  ('Finance Payroll Officer', 'payroll.custom_deduction_reports.view'),
  ('Finance Payroll Manager', 'payroll.custom_deduction_templates.manage'),
  ('Finance Payroll Manager', 'payroll.employee_custom_deductions.manage'),
  ('Finance Payroll Manager', 'payroll.custom_deduction_settings.manage'),
  ('Finance Payroll Manager', 'payroll.custom_deduction_reports.view'),
  ('Finance Head', 'payroll.custom_deduction_templates.manage'),
  ('Finance Head', 'payroll.employee_custom_deductions.manage'),
  ('Finance Head', 'payroll.custom_deduction_settings.manage'),
  ('Finance Head', 'payroll.custom_deduction_reports.view')
)
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM custom_deduction_role_permissions rp
INNER JOIN roles r ON r.name = rp.role_name
INNER JOIN permissions p ON p.key = rp.permission_key;

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

INSERT OR IGNORE INTO document_types (
  id, category_id, code, name, description, is_sensitive, is_active, expiring_soon_days,
  allowed_file_types_json, max_file_size_mb, allow_multiple_files,
  requires_expiry_date, requires_issue_date, requires_document_number, sort_order
) VALUES
  ('doc_type_insurance', 'doc_cat_medical', 'INSURANCE', 'Insurance Document', 'Employee insurance document or policy record', 1, 1, 30, '["application/pdf","image/jpeg","image/png"]', 10, 1, 1, 0, 0, 65),
  ('doc_type_driving_license', 'doc_cat_identity', 'DRIVING_LICENSE', 'Driving License', 'Driving license for driver or role-specific tracking', 1, 1, 60, '["application/pdf","image/jpeg","image/png"]', 10, 0, 1, 0, 1, 45),
  ('doc_type_education_certificate', 'doc_cat_training', 'EDUCATION_CERTIFICATE', 'Education Certificate', 'Education certificate or academic credential', 0, 1, 30, '["application/pdf","image/jpeg","image/png"]', 10, 1, 0, 0, 0, 105);

UPDATE document_types
SET expiry_required = requires_expiry_date,
    issue_date_required = requires_issue_date,
    document_number_required = requires_document_number,
    urgent_expiring_days = CASE code
      WHEN 'PASSPORT' THEN 30
      WHEN 'VISA' THEN 14
      WHEN 'WORK_PERMIT' THEN 14
      ELSE 7
    END,
    employee_summary_visible = 1,
    employee_download_allowed = 0,
    sensitivity_level = CASE WHEN is_sensitive = 1 THEN 'SENSITIVE' ELSE 'NORMAL' END,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE code IN ('PASSPORT', 'WORK_PERMIT', 'VISA', 'ID_CARD', 'EMPLOYMENT_CONTRACT', 'MEDICAL_DOCUMENT', 'POLICE_REPORT', 'INSURANCE', 'DRIVING_LICENSE', 'EDUCATION_CERTIFICATE', 'TRAINING_CERTIFICATE', 'PROFILE_PHOTO');

UPDATE document_types
SET expiring_soon_days = 180,
    expiry_required = 1,
    document_number_required = 1,
    renewal_case_auto_create = 1,
    creates_payroll_warning = 1,
    creates_final_settlement_warning = 1,
    blocks_employee_activation = 1,
    renewal_instructions = 'Track passport renewal before expiry; government submission integration is not implemented in HRM v2.',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE code = 'PASSPORT';

UPDATE document_types
SET expiring_soon_days = 90,
    expiry_required = 1,
    document_number_required = 1,
    renewal_case_auto_create = 1,
    creates_payroll_warning = 1,
    creates_final_settlement_warning = 1,
    blocks_employee_activation = 1,
    renewal_instructions = 'Track visa renewal before expiry; authority integration is not implemented in HRM v2.',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE code = 'VISA';

UPDATE document_types
SET expiring_soon_days = 60,
    expiry_required = 1,
    document_number_required = 1,
    renewal_case_auto_create = 1,
    creates_payroll_warning = 1,
    creates_final_settlement_warning = 1,
    blocks_employee_activation = 1,
    renewal_instructions = 'Track work permit renewal before expiry; authority integration is not implemented in HRM v2.',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE code = 'WORK_PERMIT';

UPDATE document_types
SET expiring_soon_days = 30,
    renewal_case_auto_create = 1,
    blocks_employee_activation = 1,
    creates_final_settlement_warning = 1,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE code = 'EMPLOYMENT_CONTRACT';

UPDATE document_types
SET expiring_soon_days = 30,
    expiry_required = 1,
    renewal_case_auto_create = 1,
    creates_payroll_warning = 1,
    creates_final_settlement_warning = 1,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE code IN ('MEDICAL_DOCUMENT', 'INSURANCE');

UPDATE document_types
SET expiring_soon_days = 60,
    expiry_required = 1,
    document_number_required = 1,
    renewal_case_auto_create = 1,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE code IN ('ID_CARD', 'DRIVING_LICENSE');

INSERT OR IGNORE INTO document_compliance_settings (
  id, document_compliance_enabled, expiry_alerts_enabled, missing_required_document_alerts_enabled,
  renewal_workflow_enabled, auto_create_renewal_case_for_expiring_document, auto_create_missing_document_case,
  default_expiring_soon_days, default_urgent_expiring_days, default_overdue_grace_days,
  require_reason_for_renewal_case_cancel, require_reason_for_document_waiver, allow_document_requirement_waiver,
  allow_employee_view_document_compliance, allow_employee_download_documents, employee_document_upload_request_placeholder_enabled,
  sensitive_document_view_audit_enabled, compliance_dashboard_enabled, metadata_json
) VALUES (
  'document_compliance_settings_default', 1, 1, 1,
  1, 0, 0,
  30, 7, 0,
  1, 1, 1,
  1, 0, 0,
  1, 1, '{"seeded_prompt":"15"}'
);

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

INSERT OR IGNORE INTO attendance_device_settings (
  id, zkteco_csv_import_enabled, zkteco_local_bridge_enabled, zkteco_push_adms_enabled,
  auto_match_by_biometric_user_id, auto_match_by_employee_no, auto_normalize_after_import,
  prevent_locked_day_overwrite, duplicate_window_seconds, default_timezone,
  csv_allowed_extensions_json, max_import_rows, bridge_clock_skew_minutes
) VALUES (
  'attendance_device_settings_default', 1, 0, 0, 1, 1, 1, 1, 60, 'Indian/Maldives', '["csv","txt"]', 20000, 15
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
  ('pay_comp_other_deduction', 'OTHER_DEDUCTION', 'Other Deduction', 'VARIABLE_DEDUCTION', 'OTHER', 'MANUAL', 0, NULL, 0, 0, 1, 150),
  ('pay_comp_bank_loan_deduction', 'BANK_LOAN_DEDUCTION', 'Bank Loan Deduction', 'VARIABLE_DEDUCTION', 'BANK_LOAN', 'MANUAL', 0, NULL, 0, 0, 1, 160),
  ('pay_comp_pension_employee', 'PENSION_EMPLOYEE_CONTRIBUTION', 'Pension Employee Contribution', 'FIXED_DEDUCTION', 'PENSION', 'PERCENTAGE_OF_BASIC', 0, 7, 1, 0, 1, 170),
  ('pay_comp_pension_employer', 'PENSION_EMPLOYER_CONTRIBUTION', 'Pension Employer Contribution', 'BENEFIT_PLACEHOLDER', 'PENSION', 'PERCENTAGE_OF_BASIC', 0, 7, 1, 0, 1, 180);

INSERT OR IGNORE INTO payroll_settings (
  id, default_currency, default_daily_rate_mode, allow_negative_net_salary,
  require_approval_before_paid, include_attendance_deductions,
  include_leave_deductions, include_advance_deductions,
  include_roster_scheduled_days, default_salary_payment_day
) VALUES (
  'payroll_settings_default', 'MVR', 'FIXED_30_DAYS', 0, 1, 1, 1, 1, 1, 28
);

INSERT OR IGNORE INTO custom_deduction_templates (
  id, code, name, description, category, deduction_type, amount_type,
  default_amount, default_currency, default_installment_count, default_recurrence_interval,
  default_priority_number, linked_module, require_approval, include_in_final_settlement,
  show_on_payslip, show_in_self_service, status, metadata_json
) VALUES
  ('custom_deduction_template_visa_fee', 'VISA_FEE', 'Visa Fee', 'Employee visa processing fee deduction template.', 'IMMIGRATION', 'INSTALLMENT', 'FIXED_AMOUNT', NULL, 'MVR', 3, 'PAYROLL_PERIOD', 3, 'DOCUMENTS', 1, 1, 1, 1, 'ACTIVE', '{"seeded_template":true}'),
  ('custom_deduction_template_medical_fee', 'MEDICAL_FEE', 'Medical Fee', 'Medical check or medical document fee deduction template.', 'MEDICAL', 'ONE_TIME', 'FIXED_AMOUNT', NULL, 'MVR', NULL, 'PAYROLL_PERIOD', 3, 'DOCUMENTS', 1, 1, 1, 1, 'ACTIVE', '{"seeded_template":true}'),
  ('custom_deduction_template_insurance_fee', 'INSURANCE_FEE', 'Insurance Fee', 'Employee insurance contribution or recovery deduction template.', 'INSURANCE', 'RECURRING', 'FIXED_AMOUNT', NULL, 'MVR', NULL, 'MONTHLY', 3, 'PAYROLL', 1, 1, 1, 1, 'ACTIVE', '{"seeded_template":true}'),
  ('custom_deduction_template_work_permit_fee', 'WORK_PERMIT_FEE', 'Work Permit Fee', 'Work permit processing fee deduction template.', 'IMMIGRATION', 'INSTALLMENT', 'FIXED_AMOUNT', NULL, 'MVR', 3, 'PAYROLL_PERIOD', 3, 'DOCUMENTS', 1, 1, 1, 1, 'ACTIVE', '{"seeded_template":true}'),
  ('custom_deduction_template_document_processing_fee', 'DOCUMENT_PROCESSING_FEE', 'Document Processing Fee', 'General document processing cost deduction template.', 'DOCUMENTS', 'ONE_TIME', 'FIXED_AMOUNT', NULL, 'MVR', NULL, 'PAYROLL_PERIOD', 3, 'DOCUMENTS', 1, 1, 1, 1, 'ACTIVE', '{"seeded_template":true}'),
  ('custom_deduction_template_accommodation', 'ACCOMMODATION', 'Accommodation', 'Accommodation recovery deduction template.', 'ACCOMMODATION', 'RECURRING', 'FIXED_AMOUNT', NULL, 'MVR', NULL, 'MONTHLY', 3, 'PAYROLL', 1, 1, 1, 1, 'ACTIVE', '{"seeded_template":true}'),
  ('custom_deduction_template_staff_meal', 'STAFF_MEAL', 'Staff Meal', 'Staff meal deduction template.', 'MEALS', 'RECURRING', 'FIXED_AMOUNT', NULL, 'MVR', NULL, 'MONTHLY', 3, 'PAYROLL', 1, 1, 1, 1, 'ACTIVE', '{"seeded_template":true}'),
  ('custom_deduction_template_transport', 'TRANSPORT', 'Transport', 'Transport deduction template.', 'TRANSPORT', 'RECURRING', 'FIXED_AMOUNT', NULL, 'MVR', NULL, 'MONTHLY', 3, 'PAYROLL', 1, 1, 1, 1, 'ACTIVE', '{"seeded_template":true}'),
  ('custom_deduction_template_uniform_deduction', 'UNIFORM_DEDUCTION', 'Uniform Deduction', 'Uniform issue or replacement recovery deduction template.', 'UNIFORMS', 'INSTALLMENT', 'FIXED_AMOUNT', NULL, 'MVR', 2, 'PAYROLL_PERIOD', 3, 'UNIFORMS', 1, 1, 1, 1, 'ACTIVE', '{"seeded_template":true}'),
  ('custom_deduction_template_asset_damage', 'ASSET_DAMAGE', 'Asset Damage', 'Asset damage recovery deduction template.', 'ASSETS', 'BALANCE_BASED', 'FIXED_AMOUNT', NULL, 'MVR', NULL, 'PAYROLL_PERIOD', 3, 'ASSETS', 1, 1, 1, 1, 'ACTIVE', '{"seeded_template":true}'),
  ('custom_deduction_template_property_damage', 'PROPERTY_DAMAGE', 'Property Damage', 'Property damage recovery deduction template.', 'ASSETS', 'BALANCE_BASED', 'FIXED_AMOUNT', NULL, 'MVR', NULL, 'PAYROLL_PERIOD', 3, 'ASSETS', 1, 1, 1, 1, 'ACTIVE', '{"seeded_template":true}'),
  ('custom_deduction_template_penalty', 'PENALTY_PLACEHOLDER', 'Penalty / Disciplinary Deduction', 'Disciplinary or penalty deduction placeholder template.', 'DISCIPLINARY', 'ONE_TIME', 'FIXED_AMOUNT', NULL, 'MVR', NULL, 'PAYROLL_PERIOD', 3, 'DISCIPLINARY_PLACEHOLDER', 1, 1, 1, 0, 'ACTIVE', '{"seeded_template":true,"sensitive_category":true}'),
  ('custom_deduction_template_other', 'OTHER_CUSTOM_DEDUCTION', 'Other Custom Deduction', 'General company-specific deduction template.', 'OTHER', 'ONE_TIME', 'FIXED_AMOUNT', NULL, 'MVR', NULL, 'PAYROLL_PERIOD', 3, 'OTHER', 1, 1, 1, 1, 'ACTIVE', '{"seeded_template":true}');

INSERT OR IGNORE INTO payment_institutions (
  id, code, name, type, country_code, is_active, status, display_order
) VALUES
  ('payment_inst_bml', 'BML', 'Bank of Maldives', 'BANK', 'MV', 1, 'ACTIVE', 10),
  ('payment_inst_mib', 'MIB', 'Maldives Islamic Bank', 'BANK', 'MV', 1, 'ACTIVE', 20),
  ('payment_inst_sbi', 'SBI', 'State Bank of India', 'BANK', 'MV', 1, 'ACTIVE', 30),
  ('payment_inst_boc', 'BOC', 'Bank of Ceylon', 'BANK', 'MV', 1, 'ACTIVE', 40),
  ('payment_inst_mcb', 'MCB', 'Mauritius Commercial Bank', 'BANK', 'MV', 1, 'ACTIVE', 50),
  ('payment_inst_hbl', 'HBL', 'Habib Bank Limited', 'BANK', 'MV', 1, 'ACTIVE', 60),
  ('payment_inst_cbm', 'CBM', 'Commercial Bank of Maldives', 'BANK', 'MV', 1, 'ACTIVE', 70),
  ('payment_inst_cash_main', 'CASH_MAIN', 'Main Cash Collection', 'CASH_LOCATION', 'MV', 1, 'ACTIVE', 90),
  ('payment_inst_other', 'OTHER', 'Other Payment Institution', 'OTHER', 'MV', 1, 'ACTIVE', 100);

INSERT OR IGNORE INTO bank_loan_eligibility_rules (
  id, payment_institution_id, loan_product_name, salary_routing_required,
  required_statement_months, required_salary_slip_months,
  employer_salary_undertaking_required, minimum_employment_months,
  bank_instruction_document_required, cash_salary_eligibility_rule,
  override_allowed, override_requires_reason, override_requires_document,
  status
) VALUES (
  'bank_loan_rule_default', NULL, 'Default salary deduction loan', 1,
  12, 6, 0, 6, 1, 'INELIGIBLE_BY_DEFAULT',
  1, 1, 1, 'ACTIVE'
);

INSERT OR IGNORE INTO pension_schemes (
  id, scheme_code, scheme_name, country_code,
  employee_contribution_percent, employer_contribution_percent,
  contribution_basis, include_allowances, min_employee_age, max_employee_age,
  local_employee_required, foreign_employee_allowed, foreign_employee_default_required,
  employer_can_pay_employee_share, effective_from, status, notes
) VALUES (
  'pension_scheme_mrps', 'MRPS', 'Maldives Retirement Pension Scheme', 'MV',
  7, 7, 'BASIC_SALARY_ONLY', 0, 16, 65,
  1, 1, 0, 1, '2026-01-01', 'ACTIVE',
  'Seeded default only. Percentages and basis are configurable and effective-dated.'
);

INSERT OR IGNORE INTO final_settlement_settings (
  id,
  module_enabled,
  final_settlement_enabled,
  allow_case_creation_from_exit_status,
  allow_settlement_case_creation_from_exit_status,
  auto_create_case_on_exit_status,
  auto_create_settlement_case_on_exit_status,
  require_approval_before_finalization,
  require_settlement_approval_before_finalization,
  require_clearance_before_finalization,
  require_document_checklist_before_finalization,
  require_document_checklist_before_finalization_placeholder,
  include_unpaid_salary,
  include_pending_payroll,
  include_unused_leave_payout,
  include_negative_leave_balance_deduction,
  include_unpaid_leave_deduction,
  include_attendance_deduction,
  include_bank_loan_deductions,
  include_bank_loan_shortfall_warnings,
  include_bank_loan_direct_collection_warnings,
  include_pension_contribution,
  include_pension_remittance_warnings,
  include_custom_deduction_remaining_balances,
  include_custom_deduction_shortfall_warnings,
  include_advance_balance_deduction,
  include_one_time_deductions,
  include_asset_deductions,
  include_uniform_deductions,
  include_notice_period_deduction,
  include_gratuity_placeholder,
  include_contract_end_placeholder,
  include_manual_earning_adjustments,
  include_manual_deduction_adjustments,
  settlement_payment_register_enabled,
  final_settlement_document_placeholder_enabled,
  final_settlement_document_pdf_placeholder_enabled,
  allow_recalculation_while_draft,
  allow_recalculation_after_approval,
  allow_unlock_after_finalization,
  require_reason_for_recalculation,
  require_reason_for_unlock,
  default_daily_rate_calculation_mode,
  default_unused_leave_payout_calculation_mode,
  default_notice_period_deduction_calculation_mode,
  default_settlement_currency
) VALUES (
  'final_settlement_settings_default',
  1, 1,
  1, 1,
  0, 0,
  1, 1, 1, 0, 0,
  1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1,
  0, 0, 0, 1, 1, 1, 1,
  1, 1, 0, 0, 1, 1,
  'FIXED_30_DAYS', 'DAILY_RATE', 'DAILY_RATE', 'MVR'
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

INSERT OR IGNORE INTO permissions (id, key, module, description, is_critical) VALUES
  ('perm_approvals_view', 'approvals.view', 'approvals', 'View central approval records and timelines', 0),
  ('perm_approvals_manage', 'approvals.manage', 'approvals', 'Manage central approval workflow foundation', 1),
  ('perm_approvals_settings_view', 'approvals.settings.view', 'approvals', 'View approval workflow settings', 0),
  ('perm_approvals_settings_update', 'approvals.settings.update', 'approvals', 'Update approval workflow settings', 1),
  ('perm_approvals_settings_manage', 'approvals.settings.manage', 'approvals', 'Manage approval workflow settings', 1),
  ('perm_approvals_workflows_view', 'approvals.workflows.view', 'approvals', 'View approval workflow definitions', 0),
  ('perm_approvals_workflows_create', 'approvals.workflows.create', 'approvals', 'Create approval workflow definitions', 1),
  ('perm_approvals_workflows_update', 'approvals.workflows.update', 'approvals', 'Update approval workflow definitions', 1),
  ('perm_approvals_workflows_archive', 'approvals.workflows.archive', 'approvals', 'Archive approval workflows', 1),
  ('perm_approvals_workflows_manage', 'approvals.workflows.manage', 'approvals', 'Manage approval workflows', 1),
  ('perm_approvals_conditions_view', 'approvals.conditions.view', 'approvals', 'View approval workflow conditions', 0),
  ('perm_approvals_conditions_manage', 'approvals.conditions.manage', 'approvals', 'Manage approval workflow conditions', 1),
  ('perm_approvals_steps_view', 'approvals.steps.view', 'approvals', 'View approval workflow steps', 0),
  ('perm_approvals_steps_manage', 'approvals.steps.manage', 'approvals', 'Manage approval workflow steps', 1),
  ('perm_approvals_instances_view', 'approvals.instances.view', 'approvals', 'View approval instances', 0),
  ('perm_approvals_instances_approve', 'approvals.instances.approve', 'approvals', 'Approve assigned approval instances', 0),
  ('perm_approvals_instances_reject', 'approvals.instances.reject', 'approvals', 'Reject assigned approval instances', 0),
  ('perm_approvals_instances_send_back', 'approvals.instances.send_back', 'approvals', 'Send back assigned approval instances', 0),
  ('perm_approvals_instances_cancel', 'approvals.instances.cancel', 'approvals', 'Cancel submitted approval instances', 0),
  ('perm_approvals_instances_override', 'approvals.instances.override', 'approvals', 'Override approval instances with reason', 1),
  ('perm_approvals_inbox_view', 'approvals.inbox.view', 'approvals', 'View approval inbox', 0),
  ('perm_approvals_overdue_view', 'approvals.overdue.view', 'approvals', 'View overdue approval dashboard', 0),
  ('perm_approvals_delegations_view', 'approvals.delegations.view', 'approvals', 'View approval delegations', 0),
  ('perm_approvals_delegations_create', 'approvals.delegations.create', 'approvals', 'Create approval delegation rules', 0),
  ('perm_approvals_delegations_cancel', 'approvals.delegations.cancel', 'approvals', 'Cancel approval delegation rules', 0),
  ('perm_approvals_delegations_manage', 'approvals.delegations.manage', 'approvals', 'Manage approval delegation rules', 1),
  ('perm_approvals_escalations_view', 'approvals.escalations.view', 'approvals', 'View approval escalation rules and overdue state', 0),
  ('perm_approvals_escalations_manage', 'approvals.escalations.manage', 'approvals', 'Manage approval escalation and reminder refresh', 1),
  ('perm_approvals_notification_templates_view', 'approvals.notification_templates.view', 'approvals', 'View approval notification templates', 0),
  ('perm_approvals_notification_templates_update', 'approvals.notification_templates.update', 'approvals', 'Update approval notification templates', 1),
  ('perm_approvals_notification_templates_manage', 'approvals.notification_templates.manage', 'approvals', 'Manage approval notification templates', 1),
  ('perm_approvals_preview_view', 'approvals.preview.view', 'approvals', 'Preview approval workflow matching and chain', 0),
  ('perm_approvals_timeline_view', 'approvals.timeline.view', 'approvals', 'View unified approval timelines', 0),
  ('perm_approvals_reports_view', 'approvals.reports.view', 'approvals', 'View approval reports', 0),
  ('perm_reports_approvals_view', 'reports.approvals.view', 'reports', 'View approval reports in report center', 0),
  ('perm_reports_approvals_sensitive_view', 'reports.approvals.sensitive.view', 'reports', 'View sensitive approval report values', 0),
  ('perm_self_service_approvals_view', 'self_service.approvals.view', 'self_service', 'View own submitted approvals in self-service', 0);

INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Owner/Super Admin'
  AND r.is_protected = 1;

WITH approval_role_permissions(role_name, permission_key) AS (
  VALUES
  ('Employee Self-Service', 'self_service.approvals.view'),
  ('HR Staff', 'approvals.view'), ('HR Staff', 'approvals.inbox.view'), ('HR Staff', 'approvals.instances.view'), ('HR Staff', 'approvals.timeline.view'), ('HR Staff', 'approvals.preview.view'),
  ('Senior HR Staff', 'approvals.view'), ('Senior HR Staff', 'approvals.inbox.view'), ('Senior HR Staff', 'approvals.instances.view'), ('Senior HR Staff', 'approvals.instances.approve'), ('Senior HR Staff', 'approvals.instances.reject'), ('Senior HR Staff', 'approvals.instances.send_back'), ('Senior HR Staff', 'approvals.timeline.view'), ('Senior HR Staff', 'approvals.preview.view'), ('Senior HR Staff', 'approvals.delegations.view'),
  ('HR Manager', 'approvals.view'), ('HR Manager', 'approvals.manage'), ('HR Manager', 'approvals.settings.view'), ('HR Manager', 'approvals.workflows.view'), ('HR Manager', 'approvals.workflows.create'), ('HR Manager', 'approvals.workflows.update'), ('HR Manager', 'approvals.conditions.manage'), ('HR Manager', 'approvals.steps.manage'), ('HR Manager', 'approvals.instances.view'), ('HR Manager', 'approvals.instances.approve'), ('HR Manager', 'approvals.instances.reject'), ('HR Manager', 'approvals.instances.send_back'), ('HR Manager', 'approvals.inbox.view'), ('HR Manager', 'approvals.overdue.view'), ('HR Manager', 'approvals.delegations.view'), ('HR Manager', 'approvals.delegations.create'), ('HR Manager', 'approvals.escalations.view'), ('HR Manager', 'approvals.notification_templates.view'), ('HR Manager', 'approvals.preview.view'), ('HR Manager', 'approvals.timeline.view'), ('HR Manager', 'approvals.reports.view'), ('HR Manager', 'reports.approvals.view'),
  ('HR Head / HR Admin', 'approvals.view'), ('HR Head / HR Admin', 'approvals.manage'), ('HR Head / HR Admin', 'approvals.settings.view'), ('HR Head / HR Admin', 'approvals.settings.update'), ('HR Head / HR Admin', 'approvals.settings.manage'), ('HR Head / HR Admin', 'approvals.workflows.view'), ('HR Head / HR Admin', 'approvals.workflows.create'), ('HR Head / HR Admin', 'approvals.workflows.update'), ('HR Head / HR Admin', 'approvals.workflows.archive'), ('HR Head / HR Admin', 'approvals.workflows.manage'), ('HR Head / HR Admin', 'approvals.conditions.view'), ('HR Head / HR Admin', 'approvals.conditions.manage'), ('HR Head / HR Admin', 'approvals.steps.view'), ('HR Head / HR Admin', 'approvals.steps.manage'), ('HR Head / HR Admin', 'approvals.instances.view'), ('HR Head / HR Admin', 'approvals.instances.approve'), ('HR Head / HR Admin', 'approvals.instances.reject'), ('HR Head / HR Admin', 'approvals.instances.send_back'), ('HR Head / HR Admin', 'approvals.instances.cancel'), ('HR Head / HR Admin', 'approvals.instances.override'), ('HR Head / HR Admin', 'approvals.inbox.view'), ('HR Head / HR Admin', 'approvals.overdue.view'), ('HR Head / HR Admin', 'approvals.delegations.view'), ('HR Head / HR Admin', 'approvals.delegations.create'), ('HR Head / HR Admin', 'approvals.delegations.cancel'), ('HR Head / HR Admin', 'approvals.delegations.manage'), ('HR Head / HR Admin', 'approvals.escalations.view'), ('HR Head / HR Admin', 'approvals.escalations.manage'), ('HR Head / HR Admin', 'approvals.notification_templates.view'), ('HR Head / HR Admin', 'approvals.notification_templates.update'), ('HR Head / HR Admin', 'approvals.notification_templates.manage'), ('HR Head / HR Admin', 'approvals.preview.view'), ('HR Head / HR Admin', 'approvals.timeline.view'), ('HR Head / HR Admin', 'approvals.reports.view'), ('HR Head / HR Admin', 'reports.approvals.view'), ('HR Head / HR Admin', 'reports.approvals.sensitive.view')
)
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM approval_role_permissions rp
INNER JOIN roles r ON r.name = rp.role_name
INNER JOIN permissions p ON p.key = rp.permission_key;

INSERT OR IGNORE INTO approval_workflow_settings (
  id, approval_workflows_enabled, use_central_workflow_for_supported_modules,
  fallback_to_module_approval_if_no_workflow, allow_auto_approval, block_self_approval_by_default,
  allow_super_admin_self_approval_override, allow_delegation, allow_parallel_approvals,
  allow_any_one_approval_mode, allow_all_required_approval_mode, escalation_enabled, reminders_enabled,
  default_escalation_time_basis, default_employee_visibility_mode, notify_on_submission, notify_on_approval,
  notify_on_rejection, notify_on_send_back, notify_on_escalation, notify_on_overdue,
  require_reason_for_reject, require_reason_for_send_back, require_reason_for_override, metadata_json
) VALUES (
  'approval_workflow_settings_default', 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  'CALENDAR_DAYS', 'STEP_NAMES_ONLY', 1, 1, 1, 1, 1, 1, 1, 1, 1,
  '{"seeded_prompt":"16","fallback_rule":"Module-specific approval remains fallback until central workflows are enabled and matched."}'
);

INSERT OR IGNORE INTO approval_notification_templates (
  id, template_code, template_name, event_type, channel, subject_template, body_template, is_enabled, metadata_json
) VALUES
  ('approval_tpl_submitted', 'APPROVAL_SUBMITTED_DEFAULT', 'Approval submitted', 'SUBMITTED', 'IN_APP', 'Approval submitted: {{request_title}}', '{{submitted_by}} submitted {{request_title}} for approval.', 1, '{"seeded_prompt":"16"}'),
  ('approval_tpl_approved', 'APPROVAL_APPROVED_DEFAULT', 'Approval approved', 'APPROVED', 'IN_APP', 'Approval approved: {{request_title}}', '{{approver_name}} approved {{request_title}}.', 1, '{"seeded_prompt":"16"}'),
  ('approval_tpl_rejected', 'APPROVAL_REJECTED_DEFAULT', 'Approval rejected', 'REJECTED', 'IN_APP', 'Approval rejected: {{request_title}}', '{{request_title}} was rejected. Status: {{status}}.', 1, '{"seeded_prompt":"16"}'),
  ('approval_tpl_sent_back', 'APPROVAL_SENT_BACK_DEFAULT', 'Approval sent back', 'SENT_BACK', 'IN_APP', 'Approval sent back: {{request_title}}', '{{request_title}} was sent back for updates.', 1, '{"seeded_prompt":"16"}'),
  ('approval_tpl_escalated', 'APPROVAL_ESCALATED_DEFAULT', 'Approval escalated', 'ESCALATED', 'IN_APP', 'Approval escalated: {{request_title}}', '{{request_title}} was escalated. Due date: {{due_date}}.', 1, '{"seeded_prompt":"16"}'),
  ('approval_tpl_overdue', 'APPROVAL_OVERDUE_DEFAULT', 'Approval overdue', 'OVERDUE', 'SYSTEM_ALERT', 'Approval overdue: {{request_title}}', '{{request_title}} is overdue and needs attention.', 1, '{"seeded_prompt":"16"}'),
  ('approval_tpl_delegated', 'APPROVAL_DELEGATED_DEFAULT', 'Approval delegated', 'DELEGATED', 'IN_APP', 'Approval delegated: {{request_title}}', '{{request_title}} was delegated to {{approver_name}}.', 1, '{"seeded_prompt":"16"}'),
  ('approval_tpl_reminder', 'APPROVAL_REMINDER_DEFAULT', 'Approval reminder', 'REMINDER', 'IN_APP', 'Approval reminder: {{request_title}}', '{{request_title}} is waiting for approval.', 1, '{"seeded_prompt":"16"}');

-- Prompt 17: Asset & Uniform Lifecycle Advanced Completion
INSERT OR IGNORE INTO permissions (id, key, module, description, is_critical) VALUES
  ('perm_assets_settings_view', 'assets.settings.view', 'assets', 'View asset and uniform settings', 0),
  ('perm_assets_settings_update', 'assets.settings.update', 'assets', 'Update asset and uniform settings', 0),
  ('perm_assets_categories_view', 'assets.categories.view', 'assets', 'View asset categories', 0),
  ('perm_assets_categories_create', 'assets.categories.create', 'assets', 'Create asset categories', 0),
  ('perm_assets_categories_update', 'assets.categories.update', 'assets', 'Update asset categories', 0),
  ('perm_assets_categories_archive', 'assets.categories.archive', 'assets', 'Archive asset categories', 0),
  ('perm_assets_categories_manage', 'assets.categories.manage', 'assets', 'Manage asset categories and clearance defaults', 0),
  ('perm_assets_items_view', 'assets.items.view', 'assets', 'View asset item registry', 0),
  ('perm_assets_items_create', 'assets.items.create', 'assets', 'Create asset items', 0),
  ('perm_assets_items_update', 'assets.items.update', 'assets', 'Update asset items', 0),
  ('perm_assets_items_archive', 'assets.items.archive', 'assets', 'Archive asset items', 0),
  ('perm_assets_items_manage', 'assets.items.manage', 'assets', 'Manage asset item registry', 0),
  ('perm_assets_assignments_view', 'assets.assignments.view', 'assets', 'View advanced asset assignments', 0),
  ('perm_assets_assignments_issue', 'assets.assignments.issue', 'assets', 'Issue assets through advanced lifecycle', 0),
  ('perm_assets_assignments_return', 'assets.assignments.return', 'assets', 'Return assets through advanced lifecycle', 0),
  ('perm_assets_assignments_transfer', 'assets.assignments.transfer', 'assets', 'Transfer assets between employees', 0),
  ('perm_assets_assignments_damage', 'assets.assignments.damage', 'assets', 'Mark advanced asset assignments damaged', 0),
  ('perm_assets_assignments_mark_damaged', 'assets.assignments.mark_damaged', 'assets', 'Mark advanced asset assignments damaged', 0),
  ('perm_assets_assignments_lost', 'assets.assignments.lost', 'assets', 'Mark advanced asset assignments lost', 0),
  ('perm_assets_assignments_mark_lost', 'assets.assignments.mark_lost', 'assets', 'Mark advanced asset assignments lost', 0),
  ('perm_assets_assignments_apply_deduction', 'assets.assignments.apply_deduction', 'assets', 'Apply deduction for asset assignments', 0),
  ('perm_assets_assignments_waive', 'assets.assignments.waive', 'assets', 'Waive deduction for asset assignments', 0),
  ('perm_assets_assignments_cancel', 'assets.assignments.cancel', 'assets', 'Cancel advanced asset assignments', 0),
  ('perm_assets_assignments_approve', 'assets.assignments.approve', 'assets', 'Approve advanced asset assignments', 0),
  ('perm_assets_deductions_apply', 'assets.deductions.apply', 'assets', 'Apply asset custom deductions', 0),
  ('perm_assets_deductions_waive', 'assets.deductions.waive', 'assets', 'Waive asset deductions and recovery', 0),
  ('perm_assets_clearance_view', 'assets.clearance.view', 'assets', 'View asset clearance status', 0),
  ('perm_assets_clearance_manage', 'assets.clearance.manage', 'assets', 'Manage asset clearance status', 0),
  ('perm_assets_documents_link', 'assets.documents.link', 'assets', 'Link employee documents to asset and uniform assignments', 0),
  ('perm_uniforms_view', 'uniforms.view', 'uniforms', 'View uniform types, stock, and assignments', 0),
  ('perm_uniforms_manage', 'uniforms.manage', 'uniforms', 'Manage uniform lifecycle', 0),
  ('perm_uniforms_settings_view', 'uniforms.settings.view', 'uniforms', 'View uniform settings', 0),
  ('perm_uniforms_settings_update', 'uniforms.settings.update', 'uniforms', 'Update uniform settings', 0),
  ('perm_uniforms_settings_manage', 'uniforms.settings.manage', 'uniforms', 'Manage uniform settings', 0),
  ('perm_uniforms_types_view', 'uniforms.types.view', 'uniforms', 'View uniform types', 0),
  ('perm_uniforms_types_manage', 'uniforms.types.manage', 'uniforms', 'Manage uniform types', 0),
  ('perm_uniforms_stock_view', 'uniforms.stock.view', 'uniforms', 'View uniform stock', 0),
  ('perm_uniforms_stock_update', 'uniforms.stock.update', 'uniforms', 'Update uniform stock', 0),
  ('perm_uniforms_stock_manage', 'uniforms.stock.manage', 'uniforms', 'Manage uniform stock', 0),
  ('perm_uniforms_issue', 'uniforms.issue', 'uniforms', 'Issue uniforms to employees', 0),
  ('perm_uniforms_return', 'uniforms.return', 'uniforms', 'Return issued uniforms', 0),
  ('perm_uniforms_damage', 'uniforms.damage', 'uniforms', 'Mark uniforms damaged', 0),
  ('perm_uniforms_lost', 'uniforms.lost', 'uniforms', 'Mark uniforms lost', 0),
  ('perm_uniforms_assignments_view', 'uniforms.assignments.view', 'uniforms', 'View employee uniform assignments', 0),
  ('perm_uniforms_assignments_issue', 'uniforms.assignments.issue', 'uniforms', 'Issue employee uniform assignments', 0),
  ('perm_uniforms_assignments_return', 'uniforms.assignments.return', 'uniforms', 'Return employee uniform assignments', 0),
  ('perm_uniforms_assignments_mark_damaged', 'uniforms.assignments.mark_damaged', 'uniforms', 'Mark employee uniform assignments damaged', 0),
  ('perm_uniforms_assignments_mark_lost', 'uniforms.assignments.mark_lost', 'uniforms', 'Mark employee uniform assignments lost', 0),
  ('perm_uniforms_assignments_apply_deduction', 'uniforms.assignments.apply_deduction', 'uniforms', 'Apply deduction for uniform assignments', 0),
  ('perm_uniforms_assignments_waive', 'uniforms.assignments.waive', 'uniforms', 'Waive deduction for uniform assignments', 0),
  ('perm_uniforms_assignments_cancel', 'uniforms.assignments.cancel', 'uniforms', 'Cancel employee uniform assignments', 0),
  ('perm_uniforms_assignments_manage', 'uniforms.assignments.manage', 'uniforms', 'Manage employee uniform assignments', 0),
  ('perm_uniforms_deductions_apply', 'uniforms.deductions.apply', 'uniforms', 'Apply uniform custom deductions', 0),
  ('perm_uniforms_deductions_waive', 'uniforms.deductions.waive', 'uniforms', 'Waive uniform deductions', 0),
  ('perm_uniforms_clearance_view', 'uniforms.clearance.view', 'uniforms', 'View uniform clearance status', 0),
  ('perm_uniforms_clearance_manage', 'uniforms.clearance.manage', 'uniforms', 'Manage uniform clearance status', 0),
  ('perm_uniforms_reports_view', 'uniforms.reports.view', 'uniforms', 'View uniform lifecycle reports', 0),
  ('perm_uniforms_reports_export', 'uniforms.reports.export', 'uniforms', 'Export uniform lifecycle reports', 0),
  ('perm_employees_assets_uniforms_view', 'employees.assets_uniforms.view', 'employees', 'View Employee 360 asset and uniform summary', 0),
  ('perm_employees_assets_uniforms_manage', 'employees.assets_uniforms.manage', 'employees', 'Manage Employee 360 asset and uniform actions', 0),
  ('perm_employees_uniforms_view', 'employees.uniforms.view', 'employees', 'View Employee 360 uniforms', 0),
  ('perm_reports_assets_view', 'reports.assets.view', 'reports', 'View asset lifecycle reports', 0),
  ('perm_reports_uniforms_view', 'reports.uniforms.view', 'reports', 'View uniform lifecycle reports', 0),
  ('perm_reports_assets_uniforms_sensitive_view', 'reports.assets_uniforms.sensitive.view', 'reports', 'View sensitive asset/uniform deduction report values', 0),
  ('perm_self_service_assets_view', 'self_service.assets.view', 'self_service', 'View own assets in self-service', 0),
  ('perm_self_service_uniforms_view', 'self_service.uniforms.view', 'self_service', 'View own uniforms in self-service', 0);

INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Owner/Super Admin'
  AND r.is_protected = 1;

WITH prompt17_role_permissions(role_name, permission_key) AS (
  VALUES
  ('Employee Self-Service', 'self_service.assets.view'),
  ('Employee Self-Service', 'self_service.uniforms.view'),
  ('HR Staff', 'assets.view'),
  ('HR Staff', 'assets.assignments.view'),
  ('HR Staff', 'uniforms.view'),
  ('HR Staff', 'uniforms.types.view'),
  ('HR Staff', 'uniforms.stock.view'),
  ('Senior HR Staff', 'assets.view'),
  ('Senior HR Staff', 'assets.manage'),
  ('Senior HR Staff', 'assets.assignments.view'),
  ('Senior HR Staff', 'assets.assignments.issue'),
  ('Senior HR Staff', 'assets.assignments.return'),
  ('Senior HR Staff', 'uniforms.view'),
  ('Senior HR Staff', 'uniforms.manage'),
  ('Senior HR Staff', 'uniforms.issue'),
  ('Senior HR Staff', 'uniforms.return'),
  ('HR Manager', 'assets.view'),
  ('HR Manager', 'assets.manage'),
  ('HR Manager', 'assets.settings.manage'),
  ('HR Manager', 'assets.assignments.transfer'),
  ('HR Manager', 'assets.deductions.apply'),
  ('HR Manager', 'assets.deductions.waive'),
  ('HR Manager', 'assets.clearance.manage'),
  ('HR Manager', 'uniforms.view'),
  ('HR Manager', 'uniforms.manage'),
  ('HR Manager', 'uniforms.settings.manage'),
  ('HR Manager', 'uniforms.deductions.apply'),
  ('HR Manager', 'uniforms.deductions.waive'),
  ('HR Manager', 'uniforms.clearance.manage'),
  ('HR Head / HR Admin', 'assets.categories.manage'),
  ('HR Head / HR Admin', 'assets.items.archive'),
  ('HR Head / HR Admin', 'assets.assignments.view'),
  ('HR Head / HR Admin', 'assets.assignments.issue'),
  ('HR Head / HR Admin', 'assets.assignments.return'),
  ('HR Head / HR Admin', 'assets.assignments.transfer'),
  ('HR Head / HR Admin', 'assets.assignments.damage'),
  ('HR Head / HR Admin', 'assets.assignments.mark_damaged'),
  ('HR Head / HR Admin', 'assets.assignments.lost'),
  ('HR Head / HR Admin', 'assets.assignments.mark_lost'),
  ('HR Head / HR Admin', 'assets.assignments.apply_deduction'),
  ('HR Head / HR Admin', 'assets.assignments.waive'),
  ('HR Head / HR Admin', 'assets.assignments.cancel'),
  ('HR Head / HR Admin', 'assets.assignments.approve'),
  ('HR Head / HR Admin', 'assets.deductions.apply'),
  ('HR Head / HR Admin', 'assets.deductions.waive'),
  ('HR Head / HR Admin', 'assets.clearance.view'),
  ('HR Head / HR Admin', 'assets.clearance.manage'),
  ('HR Head / HR Admin', 'assets.documents.link'),
  ('HR Head / HR Admin', 'uniforms.view'),
  ('HR Head / HR Admin', 'uniforms.manage'),
  ('HR Head / HR Admin', 'uniforms.settings.manage'),
  ('HR Head / HR Admin', 'uniforms.types.view'),
  ('HR Head / HR Admin', 'uniforms.types.manage'),
  ('HR Head / HR Admin', 'uniforms.stock.view'),
  ('HR Head / HR Admin', 'uniforms.stock.manage'),
  ('HR Head / HR Admin', 'uniforms.issue'),
  ('HR Head / HR Admin', 'uniforms.assignments.view'),
  ('HR Head / HR Admin', 'uniforms.assignments.issue'),
  ('HR Head / HR Admin', 'uniforms.return'),
  ('HR Head / HR Admin', 'uniforms.assignments.return'),
  ('HR Head / HR Admin', 'uniforms.damage'),
  ('HR Head / HR Admin', 'uniforms.assignments.mark_damaged'),
  ('HR Head / HR Admin', 'uniforms.lost'),
  ('HR Head / HR Admin', 'uniforms.assignments.mark_lost'),
  ('HR Head / HR Admin', 'uniforms.assignments.apply_deduction'),
  ('HR Head / HR Admin', 'uniforms.assignments.waive'),
  ('HR Head / HR Admin', 'uniforms.assignments.cancel'),
  ('HR Head / HR Admin', 'uniforms.assignments.manage'),
  ('HR Head / HR Admin', 'uniforms.deductions.apply'),
  ('HR Head / HR Admin', 'uniforms.deductions.waive'),
  ('HR Head / HR Admin', 'uniforms.clearance.view'),
  ('HR Head / HR Admin', 'uniforms.clearance.manage'),
  ('HR Head / HR Admin', 'uniforms.reports.view'),
  ('HR Head / HR Admin', 'uniforms.reports.export'),
  ('HR Head / HR Admin', 'employees.uniforms.view')
)
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM prompt17_role_permissions rp
INNER JOIN roles r ON r.name = rp.role_name
INNER JOIN permissions p ON p.key = rp.permission_key;

INSERT OR IGNORE INTO asset_uniform_settings (
  id, asset_module_enabled, uniform_module_enabled,
  require_approval_before_asset_issue, require_approval_before_asset_return,
  require_approval_before_asset_transfer, require_approval_before_damage_loss_deduction,
  require_approval_before_waiver, require_document_for_damage_loss,
  allow_payroll_deduction_for_lost_damaged_items, allow_final_settlement_deduction,
  default_asset_clearance_required_before_final_settlement,
  default_uniform_clearance_required_before_final_settlement,
  default_damage_deduction_mode, default_uniform_replacement_cycle_months,
  allow_employee_self_service_asset_view, allow_employee_self_service_uniform_view,
  require_reason_for_waiver, require_reason_for_deduction, require_reason_for_cancel,
  use_central_approval_workflow, metadata_json
) VALUES (
  'asset_uniform_settings_default', 1, 1, 0, 0, 0, 1, 1, 0, 1, 1,
  1, 1, 'FULL_REPLACEMENT_VALUE', 12, 1, 1, 1, 1, 1, 1,
  '{"seeded_prompt":"17","note":"Advanced asset and uniform lifecycle foundation."}'
);

INSERT OR IGNORE INTO asset_categories (
  id, code, name, type, category_type, description,
  default_clearance_required, default_deductible_if_lost, default_deductible_if_damaged,
  default_deduction_mode, expected_return_required, is_active, status, display_order, sort_order
) VALUES
  ('asset_cat_laptop', 'LAPTOP', 'Laptop', 'ASSET', 'ELECTRONICS', 'Laptop computers and assigned IT devices.', 1, 1, 1, 'CURRENT_VALUE', 1, 1, 'ACTIVE', 10, 10),
  ('asset_cat_mobile_phone', 'MOBILE_PHONE', 'Mobile Phone', 'ASSET', 'ELECTRONICS', 'Mobile phones assigned to employees.', 1, 1, 1, 'CURRENT_VALUE', 1, 1, 'ACTIVE', 20, 20),
  ('asset_cat_tablet', 'TABLET', 'Tablet', 'ASSET', 'ELECTRONICS', 'Tablets and handheld work devices.', 1, 1, 1, 'CURRENT_VALUE', 1, 1, 'ACTIVE', 30, 30),
  ('asset_cat_pos_device', 'POS_DEVICE', 'POS Device', 'ASSET', 'ELECTRONICS', 'POS terminals and outlet devices.', 1, 1, 1, 'CURRENT_VALUE', 1, 1, 'ACTIVE', 40, 40),
  ('asset_cat_biometric_device', 'BIOMETRIC_DEVICE', 'Biometric Device', 'ASSET', 'ELECTRONICS', 'Biometric and attendance devices.', 1, 1, 1, 'CURRENT_VALUE', 1, 1, 'ACTIVE', 50, 50),
  ('asset_cat_keys_access_cards', 'KEYS_ACCESS_CARDS', 'Keys & Access Cards', 'ASSET', 'ACCESS', 'Keys, ID cards, and access cards.', 1, 1, 1, 'MANUAL_AMOUNT', 1, 1, 'ACTIVE', 60, 60),
  ('asset_cat_tools_equipment', 'TOOLS_EQUIPMENT', 'Tools & Equipment', 'ASSET', 'EQUIPMENT', 'Work tools, small equipment, and operating equipment.', 1, 1, 1, 'CURRENT_VALUE', 1, 1, 'ACTIVE', 70, 70),
  ('asset_cat_furniture', 'FURNITURE', 'Furniture', 'ASSET', 'FURNITURE', 'Assigned accommodation or work furniture.', 1, 1, 1, 'CURRENT_VALUE', 1, 1, 'ACTIVE', 80, 80),
  ('asset_cat_accommodation_item', 'ACCOMMODATION_ITEM', 'Accommodation Item', 'ASSET', 'ACCOMMODATION', 'Employee accommodation items requiring clearance.', 1, 1, 1, 'CURRENT_VALUE', 1, 1, 'ACTIVE', 90, 90);

UPDATE asset_categories SET category_type = 'ACCESS', default_clearance_required = 1, default_deductible_if_lost = 1, default_deductible_if_damaged = 1, expected_return_required = 1 WHERE code IN ('ACCESS_CARD', 'LOCKER_KEY', 'KEYS_ACCESS_CARDS');
UPDATE asset_categories SET category_type = 'ELECTRONICS', default_clearance_required = 1, default_deductible_if_lost = 1, default_deductible_if_damaged = 1, expected_return_required = 1 WHERE code IN ('DEVICE', 'LAPTOP', 'MOBILE_PHONE', 'TABLET', 'POS_DEVICE', 'BIOMETRIC_DEVICE');
UPDATE asset_categories SET status = CASE WHEN is_active = 1 THEN 'ACTIVE' ELSE 'INACTIVE' END WHERE status IS NULL;

INSERT OR IGNORE INTO uniform_types (
  id, code, name, description, category,
  default_replacement_cycle_months, default_clearance_required,
  default_deductible_if_lost, default_deductible_if_damaged,
  default_deduction_amount, is_active, status, display_order, metadata_json
) VALUES
  ('uniform_type_shirt', 'SHIRT', 'Uniform Shirt', 'Standard employee uniform shirt.', 'SHIRT', 12, 1, 1, 1, NULL, 1, 'ACTIVE', 10, '{"seeded_prompt":"17"}'),
  ('uniform_type_trouser', 'TROUSER', 'Uniform Trouser', 'Standard employee uniform trouser.', 'TROUSER', 12, 1, 1, 1, NULL, 1, 'ACTIVE', 20, '{"seeded_prompt":"17"}'),
  ('uniform_type_apron', 'APRON', 'Apron', 'Outlet or kitchen apron.', 'APRON', 6, 1, 1, 1, NULL, 1, 'ACTIVE', 30, '{"seeded_prompt":"17"}'),
  ('uniform_type_cap', 'CAP', 'Cap', 'Employee cap or headwear.', 'CAP', 12, 1, 1, 1, NULL, 1, 'ACTIVE', 40, '{"seeded_prompt":"17"}'),
  ('uniform_type_shoes', 'SHOES', 'Shoes', 'Work shoes and safety footwear.', 'SHOES', 12, 1, 1, 1, NULL, 1, 'ACTIVE', 50, '{"seeded_prompt":"17"}'),
  ('uniform_type_name_badge', 'NAME_BADGE', 'Name Badge', 'Employee name badge.', 'NAME_BADGE', 24, 1, 1, 1, NULL, 1, 'ACTIVE', 60, '{"seeded_prompt":"17"}'),
  ('uniform_type_other', 'OTHER_UNIFORM', 'Other Uniform', 'Other uniform item.', 'OTHER', 12, 1, 1, 1, NULL, 1, 'ACTIVE', 100, '{"seeded_prompt":"17"}');

INSERT OR IGNORE INTO permissions (id, key, module, description, is_critical) VALUES
  ('perm_onboarding_settings_view', 'onboarding.settings.view', 'onboarding', 'View onboarding workflow settings', 0),
  ('perm_onboarding_settings_update', 'onboarding.settings.update', 'onboarding', 'Update onboarding workflow settings', 0),
  ('perm_onboarding_settings_manage', 'onboarding.settings.manage', 'onboarding', 'Manage onboarding workflow settings', 0),
  ('perm_onboarding_cases_view', 'onboarding.cases.view', 'onboarding', 'View onboarding cases', 0),
  ('perm_onboarding_cases_create', 'onboarding.cases.create', 'onboarding', 'Create onboarding cases', 0),
  ('perm_onboarding_cases_update', 'onboarding.cases.update', 'onboarding', 'Update onboarding cases', 0),
  ('perm_onboarding_cases_cancel', 'onboarding.cases.cancel', 'onboarding', 'Cancel onboarding cases', 0),
  ('perm_onboarding_cases_manage', 'onboarding.cases.manage', 'onboarding', 'Manage onboarding cases', 0),
  ('perm_onboarding_tasks_view', 'onboarding.tasks.view', 'onboarding', 'View onboarding tasks', 0),
  ('perm_onboarding_tasks_assign', 'onboarding.tasks.assign', 'onboarding', 'Assign onboarding tasks', 0),
  ('perm_onboarding_tasks_complete', 'onboarding.tasks.complete', 'onboarding', 'Complete onboarding tasks', 0),
  ('perm_onboarding_tasks_waive', 'onboarding.tasks.waive', 'onboarding', 'Waive onboarding tasks', 0),
  ('perm_onboarding_tasks_reopen', 'onboarding.tasks.reopen', 'onboarding', 'Reopen onboarding tasks', 0),
  ('perm_onboarding_tasks_manage', 'onboarding.tasks.manage', 'onboarding', 'Manage onboarding tasks', 0),
  ('perm_onboarding_activation_view', 'onboarding.activation.view', 'onboarding', 'View onboarding activation readiness', 0),
  ('perm_onboarding_activation_submit', 'onboarding.activation.submit', 'onboarding', 'Submit onboarding activation', 0),
  ('perm_onboarding_activation_approve', 'onboarding.activation.approve', 'onboarding', 'Approve onboarding activation', 0),
  ('perm_onboarding_activation_activate', 'onboarding.activation.activate', 'onboarding', 'Activate employees from onboarding', 0),
  ('perm_onboarding_activation_override', 'onboarding.activation.override', 'onboarding', 'Override onboarding activation blockers', 0),
  ('perm_onboarding_activation_manage', 'onboarding.activation.manage', 'onboarding', 'Manage onboarding activation', 0),
  ('perm_onboarding_dashboard_view', 'onboarding.dashboard.view', 'onboarding', 'View onboarding dashboard', 0),
  ('perm_onboarding_alerts_view', 'onboarding.alerts.view', 'onboarding', 'View onboarding alerts', 0),
  ('perm_onboarding_alerts_manage', 'onboarding.alerts.manage', 'onboarding', 'Manage onboarding alerts', 0),
  ('perm_offboarding_settings_view', 'offboarding.settings.view', 'offboarding', 'View offboarding workflow settings', 0),
  ('perm_offboarding_settings_update', 'offboarding.settings.update', 'offboarding', 'Update offboarding workflow settings', 0),
  ('perm_offboarding_settings_manage', 'offboarding.settings.manage', 'offboarding', 'Manage offboarding workflow settings', 0),
  ('perm_offboarding_cases_view', 'offboarding.cases.view', 'offboarding', 'View offboarding cases', 0),
  ('perm_offboarding_cases_create', 'offboarding.cases.create', 'offboarding', 'Create offboarding cases', 0),
  ('perm_offboarding_cases_update', 'offboarding.cases.update', 'offboarding', 'Update offboarding cases', 0),
  ('perm_offboarding_cases_cancel', 'offboarding.cases.cancel', 'offboarding', 'Cancel offboarding cases', 0),
  ('perm_offboarding_cases_manage', 'offboarding.cases.manage', 'offboarding', 'Manage offboarding cases', 0),
  ('perm_offboarding_tasks_view', 'offboarding.tasks.view', 'offboarding', 'View offboarding tasks', 0),
  ('perm_offboarding_tasks_assign', 'offboarding.tasks.assign', 'offboarding', 'Assign offboarding tasks', 0),
  ('perm_offboarding_tasks_complete', 'offboarding.tasks.complete', 'offboarding', 'Complete offboarding tasks', 0),
  ('perm_offboarding_tasks_waive', 'offboarding.tasks.waive', 'offboarding', 'Waive offboarding tasks', 0),
  ('perm_offboarding_tasks_reopen', 'offboarding.tasks.reopen', 'offboarding', 'Reopen offboarding tasks', 0),
  ('perm_offboarding_tasks_manage', 'offboarding.tasks.manage', 'offboarding', 'Manage offboarding tasks', 0),
  ('perm_offboarding_finalization_view', 'offboarding.finalization.view', 'offboarding', 'View offboarding finalization readiness', 0),
  ('perm_offboarding_finalization_submit', 'offboarding.finalization.submit', 'offboarding', 'Submit offboarding finalization', 0),
  ('perm_offboarding_finalization_approve', 'offboarding.finalization.approve', 'offboarding', 'Approve offboarding finalization', 0),
  ('perm_offboarding_finalization_finalize', 'offboarding.finalization.finalize', 'offboarding', 'Finalize employee exits', 0),
  ('perm_offboarding_finalization_override', 'offboarding.finalization.override', 'offboarding', 'Override offboarding finalization blockers', 0),
  ('perm_offboarding_finalization_manage', 'offboarding.finalization.manage', 'offboarding', 'Manage offboarding finalization', 0),
  ('perm_offboarding_dashboard_view', 'offboarding.dashboard.view', 'offboarding', 'View offboarding dashboard', 0),
  ('perm_lifecycle_events_view', 'lifecycle.events.view', 'lifecycle', 'View employee lifecycle events', 0),
  ('perm_lifecycle_events_sensitive_view', 'lifecycle.events.sensitive.view', 'lifecycle', 'View sensitive lifecycle events', 0),
  ('perm_employees_lifecycle_view', 'employees.lifecycle.view', 'employees', 'View Employee 360 lifecycle information', 0),
  ('perm_employees_lifecycle_manage', 'employees.lifecycle.manage', 'employees', 'Manage Employee 360 lifecycle actions', 0),
  ('perm_reports_onboarding_view', 'reports.onboarding.view', 'reports', 'View onboarding reports', 0),
  ('perm_reports_offboarding_view', 'reports.offboarding.view', 'reports', 'View offboarding reports', 0),
  ('perm_reports_lifecycle_view', 'reports.lifecycle.view', 'reports', 'View lifecycle reports', 0),
  ('perm_reports_lifecycle_sensitive_view', 'reports.lifecycle.sensitive.view', 'reports', 'View sensitive lifecycle report details', 0),
  ('perm_self_service_onboarding_view', 'self_service.onboarding.view', 'self_service', 'View own onboarding status', 0),
  ('perm_self_service_offboarding_view', 'self_service.offboarding.view', 'self_service', 'View own offboarding status', 0);

INSERT OR IGNORE INTO onboarding_settings (id, metadata_json) VALUES
  ('onboarding_settings_default', '{"seeded_prompt":"19","note":"Default onboarding workflow coordination settings."}');

INSERT OR IGNORE INTO offboarding_settings (id, metadata_json) VALUES
  ('offboarding_settings_default', '{"seeded_prompt":"19","note":"Default offboarding workflow coordination settings."}');

INSERT OR IGNORE INTO system_settings (key, value_json, is_protected) VALUES
  ('lifecycle_prompt19_seeded', '{"seeded_prompt":"19","note":"Onboarding and offboarding lifecycle workflow foundation."}', 0);

INSERT OR IGNORE INTO permissions (id, key, module, description, is_critical) VALUES
  ('perm_self_service_dashboard_view', 'self_service.dashboard.view', 'self_service', 'View own employee self-service dashboard', 0),
  ('perm_self_service_profile_view', 'self_service.profile.view', 'self_service', 'View own employee profile in self-service', 0),
  ('perm_self_service_profile_update_requests_view', 'self_service.profile_update_requests.view', 'self_service', 'View own profile update requests in self-service', 0),
  ('perm_self_service_profile_update_requests_create', 'self_service.profile_update_requests.create', 'self_service', 'Create own profile update requests in self-service', 0),
  ('perm_self_service_leave_view', 'self_service.leave.view', 'self_service', 'View own leave in self-service', 0),
  ('perm_self_service_leave_apply', 'self_service.leave.apply', 'self_service', 'Apply for own leave in self-service', 0),
  ('perm_self_service_leave_cancel', 'self_service.leave.cancel', 'self_service', 'Cancel own eligible leave requests in self-service', 0),
  ('perm_self_service_attendance_correction_view', 'self_service.attendance_correction.view', 'self_service', 'View own attendance correction requests in self-service', 0),
  ('perm_self_service_payslips_download_new', 'self_service.payslips.download', 'self_service', 'Download own payslips in self-service', 0),
  ('perm_self_service_payment_methods_view_new', 'self_service.payment_methods.view', 'self_service', 'View own payment methods in self-service', 0),
  ('perm_self_service_bank_loans_view_new', 'self_service.bank_loans.view', 'self_service', 'View own bank loans in self-service', 0),
  ('perm_self_service_pension_view_new', 'self_service.pension.view', 'self_service', 'View own pension in self-service', 0),
  ('perm_self_service_documents_compliance_view_new', 'self_service.documents.compliance.view', 'self_service', 'View own document compliance in self-service', 0),
  ('perm_self_service_assets_view_new', 'self_service.assets.view', 'self_service', 'View own assets in self-service', 0),
  ('perm_self_service_uniforms_view_new', 'self_service.uniforms.view', 'self_service', 'View own uniforms in self-service', 0),
  ('perm_self_service_approvals_view_new', 'self_service.approvals.view', 'self_service', 'View own approval and request status in self-service', 0),
  ('perm_self_service_onboarding_view_new', 'self_service.onboarding.view', 'self_service', 'View own onboarding in self-service', 0),
  ('perm_self_service_offboarding_view_new', 'self_service.offboarding.view', 'self_service', 'View own offboarding in self-service', 0),
  ('perm_self_service_notifications_view', 'self_service.notifications.view', 'self_service', 'View own self-service notifications', 0),
  ('perm_self_service_notifications_update', 'self_service.notifications.update', 'self_service', 'Mark own self-service notifications read', 0),
  ('perm_self_service_settings_view', 'self_service.settings.view', 'self_service', 'View employee self-service settings', 0),
  ('perm_self_service_settings_update', 'self_service.settings.update', 'self_service', 'Update employee self-service settings', 0),
  ('perm_self_service_settings_manage', 'self_service.settings.manage', 'self_service', 'Manage employee self-service settings', 0);

INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Owner/Super Admin'
  AND r.is_protected = 1;

WITH prompt20_self_service_role_permissions(role_name, permission_key) AS (
  VALUES
  ('Employee Self-Service', 'self_service.view'),
  ('Employee Self-Service', 'self_service.dashboard.view'),
  ('Employee Self-Service', 'self_service.profile.view'),
  ('Employee Self-Service', 'self_service.profile_update_requests.view'),
  ('Employee Self-Service', 'self_service.profile_update_requests.create'),
  ('Employee Self-Service', 'self_service.leave.view'),
  ('Employee Self-Service', 'self_service.leave_request'),
  ('Employee Self-Service', 'self_service.leave.apply'),
  ('Employee Self-Service', 'self_service.leave.cancel'),
  ('Employee Self-Service', 'self_service.attendance.view'),
  ('Employee Self-Service', 'self_service.attendance_correction.view'),
  ('Employee Self-Service', 'self_service.attendance_correction.request'),
  ('Employee Self-Service', 'self_service.roster.view'),
  ('Employee Self-Service', 'self_service.payroll.view'),
  ('Employee Self-Service', 'self_service.payslips.view'),
  ('Employee Self-Service', 'self_service.payslips.download'),
  ('Employee Self-Service', 'self_service.payment_methods.view'),
  ('Employee Self-Service', 'self_service.bank_loans.view'),
  ('Employee Self-Service', 'self_service.pension.view'),
  ('Employee Self-Service', 'self_service.documents.compliance.view'),
  ('Employee Self-Service', 'self_service.contracts.view'),
  ('Employee Self-Service', 'self_service.assets.view'),
  ('Employee Self-Service', 'self_service.uniforms.view'),
  ('Employee Self-Service', 'self_service.approvals.view'),
  ('Employee Self-Service', 'self_service.onboarding.view'),
  ('Employee Self-Service', 'self_service.offboarding.view'),
  ('Employee Self-Service', 'self_service.notifications.view')
)
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM prompt20_self_service_role_permissions rp
INNER JOIN roles r ON r.name = rp.role_name
INNER JOIN permissions p ON p.key = rp.permission_key;

INSERT OR IGNORE INTO self_service_settings (
  id, module_enabled, dashboard_enabled, profile_enabled, profile_update_requests_enabled,
  leave_enabled, attendance_enabled, roster_enabled, payroll_enabled, payslips_enabled,
  payment_methods_enabled, bank_loans_enabled, pension_enabled, documents_enabled,
  documents_compliance_enabled, contracts_enabled, assets_enabled, uniforms_enabled,
  approvals_enabled, onboarding_enabled, offboarding_enabled, notifications_enabled,
  show_sensitive_payroll_values, show_sensitive_bank_details, allow_profile_update_requests,
  allow_attendance_correction_requests, allow_leave_requests, allow_payslip_downloads
) VALUES (
  'self_service_settings_default', 1, 1, 1, 1,
  1, 1, 1, 1, 1,
  1, 1, 1, 1,
  1, 1, 1, 1,
  1, 1, 1, 1,
  1, 0, 1,
  1, 1, 1
);

INSERT OR IGNORE INTO permissions (id, key, module, description, is_critical) VALUES
  ('perm_admin_settings_hub_view', 'admin.settings_hub.view', 'admin', 'View the central admin settings hub', 1),
  ('perm_admin_settings_hub_manage', 'admin.settings_hub.manage', 'admin', 'Manage central admin settings hub controls', 1),
  ('perm_admin_modules_view', 'admin.modules.view', 'admin', 'View module control settings', 1),
  ('perm_admin_modules_update', 'admin.modules.update', 'admin', 'Update module enabled states', 1),
  ('perm_admin_modules_manage', 'admin.modules.manage', 'admin', 'Manage module controls and dependency warnings', 1),
  ('perm_admin_consistency_checks_view', 'admin.consistency_checks.view', 'admin', 'View system consistency checks', 1),
  ('perm_admin_consistency_checks_run', 'admin.consistency_checks.run', 'admin', 'Run system consistency checks', 1),
  ('perm_admin_audit_logs_view', 'admin.audit_logs.view', 'admin', 'View admin audit log viewer', 1),
  ('perm_admin_audit_logs_sensitive_view', 'admin.audit_logs.sensitive.view', 'admin', 'View sensitive audit log values', 1),
  ('perm_admin_audit_logs_export', 'admin.audit_logs.export', 'admin', 'Export admin audit logs', 1),
  ('perm_admin_security_events_view', 'admin.security_events.view', 'admin', 'View security event logs', 1),
  ('perm_admin_security_events_sensitive_view', 'admin.security_events.sensitive.view', 'admin', 'View sensitive security event metadata', 1),
  ('perm_admin_security_events_export', 'admin.security_events.export', 'admin', 'Export security event logs', 1),
  ('perm_admin_permission_risks_view', 'admin.permission_risks.view', 'admin', 'View permission risk findings', 1),
  ('perm_admin_permission_risks_run', 'admin.permission_risks.run', 'admin', 'Run permission sanity checks', 1),
  ('perm_admin_permission_risks_manage', 'admin.permission_risks.manage', 'admin', 'Manage permission risk finding status', 1),
  ('perm_admin_access_scope_review_view', 'admin.access_scope_review.view', 'admin', 'View access scope review', 1),
  ('perm_admin_access_scope_review_sensitive_view', 'admin.access_scope_review.sensitive.view', 'admin', 'View sensitive access scope review details', 1),
  ('perm_admin_security_settings_view', 'admin.security_settings.view', 'admin', 'View security settings', 1),
  ('perm_admin_security_settings_update', 'admin.security_settings.update', 'admin', 'Update security settings placeholders', 1),
  ('perm_admin_security_settings_manage', 'admin.security_settings.manage', 'admin', 'Manage security settings', 1),
  ('perm_admin_system_health_view', 'admin.system_health.view', 'admin', 'View system health', 1),
  ('perm_admin_system_health_refresh', 'admin.system_health.refresh', 'admin', 'Refresh system health snapshot', 1),
  ('perm_admin_production_readiness_view', 'admin.production_readiness.view', 'admin', 'View production readiness checklist', 1),
  ('perm_admin_production_readiness_run', 'admin.production_readiness.run', 'admin', 'Run production readiness checks', 1),
  ('perm_admin_environment_safety_view', 'admin.environment_safety.view', 'admin', 'View environment safety status', 1),
  ('perm_admin_environment_safety_run', 'admin.environment_safety.run', 'admin', 'Run environment safety checks', 1),
  ('perm_admin_data_retention_view', 'admin.data_retention.view', 'admin', 'View data retention settings', 1),
  ('perm_admin_data_retention_update', 'admin.data_retention.update', 'admin', 'Update data retention settings placeholders', 1),
  ('perm_admin_data_retention_manage', 'admin.data_retention.manage', 'admin', 'Manage data retention settings', 1),
  ('perm_admin_export_security_view', 'admin.export_security.view', 'admin', 'View export security settings', 1),
  ('perm_admin_export_security_update', 'admin.export_security.update', 'admin', 'Update export security settings', 1),
  ('perm_admin_export_security_manage', 'admin.export_security.manage', 'admin', 'Manage export security controls', 1),
  ('perm_admin_system_alerts_view', 'admin.system_alerts.view', 'admin', 'View admin system alerts', 1),
  ('perm_admin_system_alerts_acknowledge', 'admin.system_alerts.acknowledge', 'admin', 'Acknowledge admin system alerts', 1),
  ('perm_admin_system_alerts_resolve', 'admin.system_alerts.resolve', 'admin', 'Resolve admin system alerts', 1),
  ('perm_admin_system_alerts_dismiss', 'admin.system_alerts.dismiss', 'admin', 'Dismiss admin system alerts', 1),
  ('perm_admin_system_alerts_manage', 'admin.system_alerts.manage', 'admin', 'Manage admin system alerts', 1),
  ('perm_reports_admin_view', 'reports.admin.view', 'reports', 'View admin/system reports', 1),
  ('perm_reports_admin_sensitive_view', 'reports.admin.sensitive.view', 'reports', 'View sensitive admin/system reports', 1);

INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Owner/Super Admin'
  AND r.is_protected = 1;

INSERT OR IGNORE INTO module_control_settings (
  id, module_key, module_name, is_enabled, is_required, dependency_keys_json, impact_summary_json, status, metadata_json
) VALUES
  ('module_employees', 'employees', 'Employees', 1, 1, '[]', '{"summary":"Core employee master data."}', 'ACTIVE', '{"seeded_prompt":"21"}'),
  ('module_leave', 'leave', 'Leave', 1, 0, '["employees"]', '{"summary":"Leave requests, balances, and approvals."}', 'ACTIVE', '{"seeded_prompt":"21"}'),
  ('module_attendance', 'attendance', 'Attendance', 1, 0, '["employees"]', '{"summary":"Attendance records, corrections, and payroll impact."}', 'ACTIVE', '{"seeded_prompt":"21"}'),
  ('module_zkteco_attendance', 'zkteco_attendance', 'ZKTeco / Device Attendance', 1, 0, '["attendance"]', '{"summary":"Biometric device imports and mappings."}', 'ACTIVE', '{"seeded_prompt":"21"}'),
  ('module_roster', 'roster', 'Roster', 1, 0, '["employees"]', '{"summary":"Scheduling, shifts, and published rosters."}', 'ACTIVE', '{"seeded_prompt":"21"}'),
  ('module_payroll', 'payroll', 'Payroll', 1, 0, '["employees"]', '{"summary":"Payroll periods, runs, results, and approvals."}', 'ACTIVE', '{"seeded_prompt":"21"}'),
  ('module_payment_methods', 'payment_methods', 'Payment Methods', 1, 0, '["payroll"]', '{"summary":"Employee payment methods and institutions."}', 'ACTIVE', '{"seeded_prompt":"21"}'),
  ('module_bank_loans', 'bank_loans', 'Bank Loans', 1, 0, '["payroll","payment_methods"]', '{"summary":"Employee bank loans and remittance foundation."}', 'ACTIVE', '{"seeded_prompt":"21"}'),
  ('module_pension', 'pension', 'Pension', 1, 0, '["payroll"]', '{"summary":"Pension schemes, profiles, and contributions."}', 'ACTIVE', '{"seeded_prompt":"21"}'),
  ('module_custom_deductions', 'custom_deductions', 'Custom Deductions', 1, 0, '["payroll"]', '{"summary":"Custom deduction templates and assignments."}', 'ACTIVE', '{"seeded_prompt":"21"}'),
  ('module_final_settlement', 'final_settlement', 'Final Settlement', 1, 0, '["payroll","leave","payment_methods","assets_uniforms"]', '{"summary":"Exit payroll and final settlement workflow."}', 'ACTIVE', '{"seeded_prompt":"21"}'),
  ('module_contracts', 'contracts', 'Contracts', 1, 0, '["employees","documents"]', '{"summary":"Contracts, probation, renewals, and expiry tracking."}', 'ACTIVE', '{"seeded_prompt":"21"}'),
  ('module_documents', 'documents', 'Documents', 1, 0, '["employees"]', '{"summary":"Employee document registry and storage."}', 'ACTIVE', '{"seeded_prompt":"21"}'),
  ('module_document_compliance', 'document_compliance', 'Document Compliance', 1, 0, '["documents"]', '{"summary":"Expiry compliance and renewal workflow."}', 'ACTIVE', '{"seeded_prompt":"21"}'),
  ('module_assets_uniforms', 'assets_uniforms', 'Assets & Uniforms', 1, 0, '["employees"]', '{"summary":"Asset and uniform lifecycle management."}', 'ACTIVE', '{"seeded_prompt":"21"}'),
  ('module_approvals', 'approvals', 'Approvals', 1, 0, '["employees","notifications"]', '{"summary":"Central approval workflow, delegation, and escalation."}', 'ACTIVE', '{"seeded_prompt":"21"}'),
  ('module_onboarding', 'onboarding', 'Onboarding', 1, 0, '["employees","documents"]', '{"summary":"Employee onboarding workflow and tasks."}', 'ACTIVE', '{"seeded_prompt":"21"}'),
  ('module_offboarding', 'offboarding', 'Offboarding', 1, 0, '["employees","final_settlement"]', '{"summary":"Employee offboarding workflow and clearance."}', 'ACTIVE', '{"seeded_prompt":"21"}'),
  ('module_self_service', 'self_service', 'Self-Service', 1, 0, '["employees","users"]', '{"summary":"Employee self-service portal."}', 'ACTIVE', '{"seeded_prompt":"21"}'),
  ('module_reports_exports', 'reports_exports', 'Reports & Exports', 1, 0, '["employees"]', '{"summary":"Report center and export foundation."}', 'ACTIVE', '{"seeded_prompt":"21"}'),
  ('module_notifications', 'notifications', 'Notifications', 1, 0, '["users"]', '{"summary":"Notification center and system alerts."}', 'ACTIVE', '{"seeded_prompt":"21"}'),
  ('module_audit_security', 'audit_security', 'Audit & Security', 1, 1, '["users","roles"]', '{"summary":"Audit, security events, and production controls."}', 'ACTIVE', '{"seeded_prompt":"21"}');

INSERT OR IGNORE INTO security_settings (
  id, session_timeout_minutes, idle_timeout_enabled, idle_timeout_minutes, warn_before_logout_seconds,
  extend_session_on_activity, apply_idle_timeout_to_admin, apply_idle_timeout_to_self_service,
  stricter_timeout_for_sensitive_pages, sensitive_page_idle_timeout_minutes, audit_timeout_logout,
  password_policy_min_length,
  password_policy_require_number, password_policy_require_symbol, pbkdf2_iterations_expected,
  audit_failed_permission_checks, audit_sensitive_views, audit_sensitive_exports, metadata_json
) VALUES (
  'security_settings_default', 480, 1, 15, 60,
  1, 1, 1,
  1, 10, 1,
  8,
  0, 0, 100000,
  1, 1, 1, '{"seeded_prompt":"post-production-cache-timeout","mfa":"placeholder_only","cache_mode":"server_authoritative_indexeddb_assisted"}'
);

INSERT OR IGNORE INTO data_retention_settings (
  id, audit_log_retention_days, security_event_retention_days, report_export_log_retention_days,
  failed_import_log_retention_days, notification_retention_days, document_alert_retention_days,
  zkteco_import_error_retention_days, auto_delete_enabled, require_manual_review_before_delete, metadata_json
) VALUES (
  'data_retention_settings_default', 365, 365, 180,
  180, 180, 180,
  180, 0, 1, '{"seeded_prompt":"21","note":"No destructive automatic cleanup is active."}'
);

INSERT OR IGNORE INTO export_security_settings (
  id, csv_export_enabled, json_export_enabled, excel_export_placeholder_enabled, pdf_export_placeholder_enabled,
  sensitive_export_requires_permission, sensitive_export_requires_reason, sensitive_export_audit_enabled,
  max_export_rows, max_export_date_range_days, mask_sensitive_fields_by_default, metadata_json
) VALUES (
  'export_security_settings_default', 1, 1, 1, 1,
  1, 1, 1,
  5000, NULL, 1, '{"seeded_prompt":"21","note":"Official bank and pension files are outside Prompt 21."}'
);

INSERT OR IGNORE INTO permissions (id, key, module, description, is_critical) VALUES
  ('perm_data_import_view', 'data_import.view', 'data_import', 'View the central data import center', 1),
  ('perm_data_import_upload', 'data_import.upload', 'data_import', 'Upload data import files or CSV text', 1),
  ('perm_data_import_validate', 'data_import.validate', 'data_import', 'Validate data import batches', 1),
  ('perm_data_import_apply', 'data_import.apply', 'data_import', 'Apply validated data import batches', 1),
  ('perm_data_import_cancel', 'data_import.cancel', 'data_import', 'Cancel data import batches', 1),
  ('perm_data_import_sensitive', 'data_import.sensitive', 'data_import', 'Import sensitive HRM data when explicitly permitted', 1),
  ('perm_data_import_manage', 'data_import.manage', 'data_import', 'Manage data import settings and batches', 1),
  ('perm_data_export_view', 'data_export.view', 'data_export', 'View the central data export center', 1),
  ('perm_data_export_run', 'data_export.run', 'data_export', 'Run controlled data exports', 1),
  ('perm_data_export_sensitive', 'data_export.sensitive', 'data_export', 'Export sensitive HRM data when explicitly permitted', 1),
  ('perm_data_export_manage', 'data_export.manage', 'data_export', 'Manage central data exports', 1),
  ('perm_data_transfer_settings_view', 'data_transfer.settings.view', 'data_transfer', 'View import/export control settings', 1),
  ('perm_data_transfer_settings_update', 'data_transfer.settings.update', 'data_transfer', 'Update import/export control settings', 1),
  ('perm_data_transfer_settings_manage', 'data_transfer.settings.manage', 'data_transfer', 'Manage import/export control settings', 1),
  ('perm_backup_readiness_view', 'backup.readiness.view', 'backup', 'View backup readiness guidance and records', 1),
  ('perm_backup_readiness_update', 'backup.readiness.update', 'backup', 'Record manual backup readiness updates', 1),
  ('perm_backup_readiness_manage', 'backup.readiness.manage', 'backup', 'Manage backup readiness records', 1),
  ('perm_migration_readiness_view', 'migration.readiness.view', 'migration', 'View restore and migration readiness guidance', 1),
  ('perm_migration_readiness_update', 'migration.readiness.update', 'migration', 'Record migration checklist updates', 1),
  ('perm_migration_readiness_manage', 'migration.readiness.manage', 'migration', 'Manage migration readiness controls', 1),
  ('perm_deployment_readiness_view', 'deployment.readiness.view', 'deployment', 'View deployment readiness status', 1),
  ('perm_deployment_readiness_update', 'deployment.readiness.update', 'deployment', 'Record deployment readiness updates', 1),
  ('perm_deployment_readiness_manage', 'deployment.readiness.manage', 'deployment', 'Manage deployment readiness status', 1),
  ('perm_qa_checklist_view', 'qa.checklist.view', 'qa', 'View production QA test matrix', 1),
  ('perm_qa_checklist_update', 'qa.checklist.update', 'qa', 'Update production QA test matrix items', 1),
  ('perm_qa_checklist_manage', 'qa.checklist.manage', 'qa', 'Manage production QA test matrix defaults', 1),
  ('perm_qa_smoke_tests_view', 'qa.smoke_tests.view', 'qa', 'View smoke test run history', 1),
  ('perm_qa_smoke_tests_run', 'qa.smoke_tests.run', 'qa', 'Record safe smoke test run results', 1),
  ('perm_qa_smoke_tests_manage', 'qa.smoke_tests.manage', 'qa', 'Manage smoke test run records', 1);

INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'Owner/Super Admin'
  AND r.is_protected = 1;

INSERT OR IGNORE INTO module_control_settings (
  id, module_key, module_name, is_enabled, is_required, dependency_keys_json, impact_summary_json, status, metadata_json
) VALUES
  ('module_data_transfer', 'data_transfer', 'Data Import / Export', 1, 0, '["reports_exports","audit_security"]', '{"summary":"Controlled CSV import/export, backup readiness, QA, and deployment readiness guidance."}', 'ACTIVE', '{"seeded_prompt":"22"}');

INSERT OR IGNORE INTO data_transfer_settings (
  id, data_import_enabled, data_export_enabled, max_import_rows, max_export_rows,
  allowed_import_file_types_json, csv_import_enabled, csv_export_enabled,
  sensitive_import_requires_permission, sensitive_export_requires_permission,
  sensitive_import_requires_reason, sensitive_export_requires_reason,
  import_apply_requires_confirmation, export_audit_enabled, import_audit_enabled,
  rollback_placeholder_enabled, metadata_json
) VALUES (
  'data_transfer_settings_default', 1, 1, 5000, 5000,
  '["csv","text/csv","text/plain"]', 1, 1,
  1, 1,
  1, 1,
  1, 1, 1,
  1, '{"seeded_prompt":"22","rollback":"Automatic rollback is not available in this phase."}'
);

INSERT OR IGNORE INTO qa_test_matrix_items (id, test_key, test_name, category, description, expected_result, status, metadata_json) VALUES
  ('qa_login_bootstrap', 'login-bootstrap', 'Login / bootstrap', 'Access', 'Verify bootstrap status, login, logout, and auth/me.', 'Owner/Super Admin can log in and protected routes remain guarded.', 'NOT_TESTED', '{"seeded_prompt":"22"}'),
  ('qa_role_permissions', 'role-permissions', 'Role permissions', 'Access', 'Verify role permission assignment, protected Owner locks, and scope enforcement.', 'RBAC and scopes remain enforced server-side.', 'NOT_TESTED', '{"seeded_prompt":"22"}'),
  ('qa_employee_creation', 'employee-creation', 'Employee creation', 'Employees', 'Verify employee creation wizard, activation readiness, and document checklist.', 'Employee can be created without bypassing required checks.', 'NOT_TESTED', '{"seeded_prompt":"22"}'),
  ('qa_document_compliance', 'document-compliance', 'Document compliance', 'Documents', 'Verify document expiry, renewal, missing document, and sensitive metadata rules.', 'Document compliance views and restrictions behave correctly.', 'NOT_TESTED', '{"seeded_prompt":"22"}'),
  ('qa_contract_renewal', 'contract-renewal', 'Contract creation / renewal', 'Contracts', 'Verify contract create, probation, renewal, and expiry workflows.', 'Contract lifecycle flows are visible and auditable.', 'NOT_TESTED', '{"seeded_prompt":"22"}'),
  ('qa_leave_approval', 'leave-approval', 'Leave application / approval', 'Leave', 'Verify leave calculation, approval chain preview, balance ledger, and payroll impact.', 'Leave requests move through configured approval flow safely.', 'NOT_TESTED', '{"seeded_prompt":"22"}'),
  ('qa_attendance_import', 'attendance-import', 'Attendance import / correction', 'Attendance', 'Verify raw log import, unmatched logs, corrections, and payroll lock behavior.', 'Attendance data can be imported and corrected without scope leaks.', 'NOT_TESTED', '{"seeded_prompt":"22"}'),
  ('qa_roster_publish', 'roster-publish', 'Roster publish', 'Roster', 'Verify roster assignment, cross-worksite rules, publish, and change-after-publish behavior.', 'Roster publish flow preserves audit and payroll/leave integration.', 'NOT_TESTED', '{"seeded_prompt":"22"}'),
  ('qa_payroll_run', 'payroll-run', 'Payroll run', 'Payroll', 'Verify payroll period, run calculation, review, approval/finalization, payslip, and payment register.', 'Payroll core and Prompt 11/12 payroll extensions remain consistent.', 'NOT_TESTED', '{"seeded_prompt":"22"}'),
  ('qa_bank_loan_pension', 'bank-loan-pension', 'Bank loan and pension', 'Payroll', 'Verify bank-loan minimum net salary protection and pension contributions.', 'Skipped loan installments and pension records are correctly reported.', 'NOT_TESTED', '{"seeded_prompt":"22"}'),
  ('qa_custom_deductions', 'custom-deductions', 'Custom deductions', 'Payroll', 'Verify deduction templates and employee assignment lifecycle.', 'Custom deductions apply only through validated settings.', 'NOT_TESTED', '{"seeded_prompt":"22"}'),
  ('qa_final_settlement', 'final-settlement', 'Final settlement', 'Exit Payroll', 'Verify final settlement calculation, clearance, manual adjustments, and payment register.', 'Exit payroll can be reviewed and finalized safely.', 'NOT_TESTED', '{"seeded_prompt":"22"}'),
  ('qa_assets_uniforms', 'assets-uniforms', 'Asset / uniform clearance', 'Assets', 'Verify issue, return, damage/loss/write-off, and offboarding clearance.', 'Asset and uniform lifecycle remains auditable.', 'NOT_TESTED', '{"seeded_prompt":"22"}'),
  ('qa_self_service', 'self-service', 'Self-service dashboard', 'Self-Service', 'Verify employee self-service dashboard, profile, leave, attendance, payroll, documents, and notifications.', 'Self-service users can only access their own employee data.', 'NOT_TESTED', '{"seeded_prompt":"22"}'),
  ('qa_reports_export', 'reports-export', 'Reports / export', 'Reports', 'Verify report center exports, sensitive export reason, and audit logs.', 'Exports respect permissions, scopes, and audit requirements.', 'NOT_TESTED', '{"seeded_prompt":"22"}'),
  ('qa_admin_security', 'admin-settings-security', 'Admin settings / security', 'Admin', 'Verify module controls, consistency checks, security events, and production readiness.', 'Admin controls are available and non-destructive.', 'NOT_TESTED', '{"seeded_prompt":"22"}');

INSERT OR IGNORE INTO system_settings (key, value_json, is_protected) VALUES
  ('prompt22_data_transfer_seeded', '{"seeded_prompt":"22","note":"Data import/export, backup readiness, migration guidance, QA, smoke, and deployment readiness foundation."}', 0);
