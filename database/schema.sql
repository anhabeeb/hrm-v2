PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  username TEXT UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED', 'LOCKED')),
  is_owner INTEGER NOT NULL DEFAULT 0 CHECK (is_owner IN (0, 1)),
  employee_id TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique ON users(username) WHERE username IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_owner_active ON users(is_owner, status);
CREATE INDEX IF NOT EXISTS idx_users_employee_id ON users(employee_id) WHERE employee_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_employee_unique ON users(employee_id) WHERE employee_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS employee_user_account_links (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'UNLINKED', 'DEACTIVATED')),
  linked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  linked_by_user_id TEXT,
  unlinked_at TEXT,
  unlinked_by_user_id TEXT,
  unlink_reason TEXT,
  deactivated_at TEXT,
  deactivated_by_user_id TEXT,
  deactivation_reason TEXT,
  self_service_enabled_snapshot INTEGER NOT NULL DEFAULT 0 CHECK (self_service_enabled_snapshot IN (0, 1)),
  invite_status TEXT NOT NULL DEFAULT 'PASSWORD_SET' CHECK (invite_status IN ('PASSWORD_SET', 'INVITE_RESET_PENDING', 'RESET_REQUIRED', 'DISABLED')),
  reset_required INTEGER NOT NULL DEFAULT 0 CHECK (reset_required IN (0, 1)),
  employee_email_used TEXT,
  account_email_created TEXT,
  email_source TEXT,
  email_override_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (linked_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (unlinked_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (deactivated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_user_account_links_active_employee ON employee_user_account_links(employee_id) WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_user_account_links_active_user ON employee_user_account_links(user_id) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_employee_user_account_links_employee ON employee_user_account_links(employee_id, linked_at);
CREATE INDEX IF NOT EXISTS idx_employee_user_account_links_user ON employee_user_account_links(user_id, linked_at);
CREATE INDEX IF NOT EXISTS idx_employee_user_account_links_invite ON employee_user_account_links(invite_status, reset_required);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_system_role INTEGER NOT NULL DEFAULT 0 CHECK (is_system_role IN (0, 1)),
  is_protected INTEGER NOT NULL DEFAULT 0 CHECK (is_protected IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_name_unique ON roles(name);
CREATE INDEX IF NOT EXISTS idx_roles_active ON roles(is_active);
CREATE INDEX IF NOT EXISTS idx_roles_protected ON roles(is_protected);

CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  module TEXT NOT NULL,
  description TEXT,
  is_critical INTEGER NOT NULL DEFAULT 0 CHECK (is_critical IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_permissions_key_unique ON permissions(key);
CREATE INDEX IF NOT EXISTS idx_permissions_module ON permissions(module);
CREATE INDEX IF NOT EXISTS idx_permissions_critical ON permissions(is_critical);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL,
  permission_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id);

CREATE TABLE IF NOT EXISTS role_mapping_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  default_role_id TEXT NOT NULL,
  employee_type TEXT,
  employment_type TEXT,
  department_id TEXT,
  position_id TEXT,
  location_id TEXT,
  job_level_id TEXT,
  default_scope_type TEXT NOT NULL DEFAULT 'SELF_ONLY' CHECK (default_scope_type IN ('SELF_ONLY', 'OWN_TEAM', 'OWN_DEPARTMENT', 'SELECTED_DEPARTMENTS', 'OWN_LOCATION', 'SELECTED_LOCATIONS', 'ALL_LOCATIONS', 'WHOLE_COMPANY')),
  allowed_department_ids_json TEXT,
  allowed_location_ids_json TEXT,
  include_sub_departments INTEGER NOT NULL DEFAULT 0 CHECK (include_sub_departments IN (0, 1)),
  include_reporting_chain INTEGER NOT NULL DEFAULT 0 CHECK (include_reporting_chain IN (0, 1)),
  can_view INTEGER NOT NULL DEFAULT 1 CHECK (can_view IN (0, 1)),
  can_manage INTEGER NOT NULL DEFAULT 0 CHECK (can_manage IN (0, 1)),
  priority INTEGER NOT NULL DEFAULT 100,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (default_role_id) REFERENCES roles(id),
  FOREIGN KEY (department_id) REFERENCES departments(id),
  FOREIGN KEY (position_id) REFERENCES positions(id),
  FOREIGN KEY (location_id) REFERENCES locations(id),
  FOREIGN KEY (job_level_id) REFERENCES job_levels(id)
);

CREATE INDEX IF NOT EXISTS idx_role_mapping_rules_active_priority ON role_mapping_rules(is_active, priority);
CREATE INDEX IF NOT EXISTS idx_role_mapping_rules_role ON role_mapping_rules(default_role_id);
CREATE INDEX IF NOT EXISTS idx_role_mapping_rules_criteria ON role_mapping_rules(employee_type, employment_type, department_id, position_id, location_id, job_level_id);

CREATE TABLE IF NOT EXISTS access_scope_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  scope_owner_type TEXT NOT NULL CHECK (scope_owner_type IN ('ROLE', 'USER', 'ROLE_MAPPING_RULE')),
  role_id TEXT,
  user_id TEXT,
  role_mapping_rule_id TEXT,
  module_key TEXT,
  scope_type TEXT NOT NULL DEFAULT 'OWN_DEPARTMENT' CHECK (scope_type IN ('SELF_ONLY', 'OWN_TEAM', 'OWN_DEPARTMENT', 'SELECTED_DEPARTMENTS', 'OWN_LOCATION', 'SELECTED_LOCATIONS', 'ALL_LOCATIONS', 'WHOLE_COMPANY')),
  allowed_department_ids_json TEXT,
  allowed_location_ids_json TEXT,
  include_sub_departments INTEGER NOT NULL DEFAULT 0 CHECK (include_sub_departments IN (0, 1)),
  include_reporting_chain INTEGER NOT NULL DEFAULT 0 CHECK (include_reporting_chain IN (0, 1)),
  can_view INTEGER NOT NULL DEFAULT 1 CHECK (can_view IN (0, 1)),
  can_manage INTEGER NOT NULL DEFAULT 0 CHECK (can_manage IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    (scope_owner_type = 'ROLE' AND role_id IS NOT NULL AND user_id IS NULL)
    OR (scope_owner_type = 'USER' AND user_id IS NOT NULL AND role_id IS NULL)
    OR (scope_owner_type = 'ROLE_MAPPING_RULE' AND role_mapping_rule_id IS NOT NULL AND role_id IS NULL AND user_id IS NULL)
  ),
  FOREIGN KEY (role_id) REFERENCES roles(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (role_mapping_rule_id) REFERENCES role_mapping_rules(id)
);

CREATE INDEX IF NOT EXISTS idx_access_scope_rules_owner ON access_scope_rules(scope_owner_type, role_id, user_id, role_mapping_rule_id);
CREATE INDEX IF NOT EXISTS idx_access_scope_rules_module ON access_scope_rules(module_key);
CREATE INDEX IF NOT EXISTS idx_access_scope_rules_active ON access_scope_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_access_scope_rules_scope_type ON access_scope_rules(scope_type);

CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  is_protected INTEGER NOT NULL DEFAULT 0 CHECK (is_protected IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS self_service_settings (
  id TEXT PRIMARY KEY,
  module_enabled INTEGER NOT NULL DEFAULT 1 CHECK (module_enabled IN (0, 1)),
  dashboard_enabled INTEGER NOT NULL DEFAULT 1 CHECK (dashboard_enabled IN (0, 1)),
  profile_enabled INTEGER NOT NULL DEFAULT 1 CHECK (profile_enabled IN (0, 1)),
  profile_update_requests_enabled INTEGER NOT NULL DEFAULT 1 CHECK (profile_update_requests_enabled IN (0, 1)),
  leave_enabled INTEGER NOT NULL DEFAULT 1 CHECK (leave_enabled IN (0, 1)),
  attendance_enabled INTEGER NOT NULL DEFAULT 1 CHECK (attendance_enabled IN (0, 1)),
  roster_enabled INTEGER NOT NULL DEFAULT 1 CHECK (roster_enabled IN (0, 1)),
  payroll_enabled INTEGER NOT NULL DEFAULT 1 CHECK (payroll_enabled IN (0, 1)),
  payslips_enabled INTEGER NOT NULL DEFAULT 1 CHECK (payslips_enabled IN (0, 1)),
  payment_methods_enabled INTEGER NOT NULL DEFAULT 1 CHECK (payment_methods_enabled IN (0, 1)),
  bank_loans_enabled INTEGER NOT NULL DEFAULT 1 CHECK (bank_loans_enabled IN (0, 1)),
  pension_enabled INTEGER NOT NULL DEFAULT 1 CHECK (pension_enabled IN (0, 1)),
  documents_enabled INTEGER NOT NULL DEFAULT 1 CHECK (documents_enabled IN (0, 1)),
  documents_compliance_enabled INTEGER NOT NULL DEFAULT 1 CHECK (documents_compliance_enabled IN (0, 1)),
  contracts_enabled INTEGER NOT NULL DEFAULT 1 CHECK (contracts_enabled IN (0, 1)),
  assets_enabled INTEGER NOT NULL DEFAULT 1 CHECK (assets_enabled IN (0, 1)),
  uniforms_enabled INTEGER NOT NULL DEFAULT 1 CHECK (uniforms_enabled IN (0, 1)),
  approvals_enabled INTEGER NOT NULL DEFAULT 1 CHECK (approvals_enabled IN (0, 1)),
  onboarding_enabled INTEGER NOT NULL DEFAULT 1 CHECK (onboarding_enabled IN (0, 1)),
  offboarding_enabled INTEGER NOT NULL DEFAULT 1 CHECK (offboarding_enabled IN (0, 1)),
  notifications_enabled INTEGER NOT NULL DEFAULT 1 CHECK (notifications_enabled IN (0, 1)),
  show_sensitive_payroll_values INTEGER NOT NULL DEFAULT 1 CHECK (show_sensitive_payroll_values IN (0, 1)),
  show_sensitive_bank_details INTEGER NOT NULL DEFAULT 0 CHECK (show_sensitive_bank_details IN (0, 1)),
  allow_profile_update_requests INTEGER NOT NULL DEFAULT 1 CHECK (allow_profile_update_requests IN (0, 1)),
  allow_attendance_correction_requests INTEGER NOT NULL DEFAULT 1 CHECK (allow_attendance_correction_requests IN (0, 1)),
  allow_leave_requests INTEGER NOT NULL DEFAULT 1 CHECK (allow_leave_requests IN (0, 1)),
  allow_payslip_downloads INTEGER NOT NULL DEFAULT 1 CHECK (allow_payslip_downloads IN (0, 1)),
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS module_control_settings (
  id TEXT PRIMARY KEY,
  module_key TEXT NOT NULL UNIQUE,
  module_name TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
  is_required INTEGER NOT NULL DEFAULT 0 CHECK (is_required IN (0, 1)),
  dependency_keys_json TEXT,
  impact_summary_json TEXT,
  last_checked_at TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED', 'WARNING', 'ERROR')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_module_control_settings_module_key ON module_control_settings(module_key);
CREATE INDEX IF NOT EXISTS idx_module_control_settings_status ON module_control_settings(status);

CREATE TABLE IF NOT EXISTS system_consistency_checks (
  id TEXT PRIMARY KEY,
  check_key TEXT NOT NULL UNIQUE,
  check_name TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'INFO' CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
  status TEXT NOT NULL DEFAULT 'SKIPPED' CHECK (status IN ('PASS', 'WARNING', 'FAIL', 'SKIPPED')),
  module_key TEXT,
  message TEXT NOT NULL,
  details_json TEXT,
  suggested_action TEXT,
  last_checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_system_consistency_checks_key ON system_consistency_checks(check_key);
CREATE INDEX IF NOT EXISTS idx_system_consistency_checks_module ON system_consistency_checks(module_key);
CREATE INDEX IF NOT EXISTS idx_system_consistency_checks_status ON system_consistency_checks(status);
CREATE INDEX IF NOT EXISTS idx_system_consistency_checks_severity ON system_consistency_checks(severity);

CREATE TABLE IF NOT EXISTS security_event_logs (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'INFO' CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
  actor_user_id TEXT,
  actor_email_snapshot TEXT,
  target_user_id TEXT,
  target_employee_id TEXT,
  module_key TEXT,
  action_key TEXT,
  entity_type TEXT,
  entity_id TEXT,
  result TEXT NOT NULL DEFAULT 'SUCCESS' CHECK (result IN ('SUCCESS', 'FAILURE', 'BLOCKED', 'WARNING')),
  ip_address_placeholder TEXT,
  user_agent_placeholder TEXT,
  reason TEXT,
  message TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (target_employee_id) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_security_event_logs_event_type ON security_event_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_security_event_logs_severity ON security_event_logs(severity);
CREATE INDEX IF NOT EXISTS idx_security_event_logs_actor ON security_event_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_security_event_logs_target_user ON security_event_logs(target_user_id);
CREATE INDEX IF NOT EXISTS idx_security_event_logs_target_employee ON security_event_logs(target_employee_id);
CREATE INDEX IF NOT EXISTS idx_security_event_logs_created_at ON security_event_logs(created_at);

CREATE TABLE IF NOT EXISTS permission_risk_findings (
  id TEXT PRIMARY KEY,
  finding_key TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'INFO' CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
  role_id TEXT,
  user_id TEXT,
  permission_key TEXT,
  scope_rule_id TEXT,
  message TEXT NOT NULL,
  details_json TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED')),
  detected_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  resolved_by_user_id TEXT,
  resolved_at TEXT,
  resolution_note TEXT,
  metadata_json TEXT,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (scope_rule_id) REFERENCES access_scope_rules(id) ON DELETE SET NULL,
  FOREIGN KEY (resolved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_permission_risk_findings_key ON permission_risk_findings(finding_key);
CREATE INDEX IF NOT EXISTS idx_permission_risk_findings_status ON permission_risk_findings(status);
CREATE INDEX IF NOT EXISTS idx_permission_risk_findings_severity ON permission_risk_findings(severity);
CREATE INDEX IF NOT EXISTS idx_permission_risk_findings_role ON permission_risk_findings(role_id);
CREATE INDEX IF NOT EXISTS idx_permission_risk_findings_user ON permission_risk_findings(user_id);

CREATE TABLE IF NOT EXISTS security_settings (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  session_timeout_minutes INTEGER NOT NULL DEFAULT 480 CHECK (session_timeout_minutes > 0),
  idle_timeout_enabled INTEGER NOT NULL DEFAULT 1 CHECK (idle_timeout_enabled IN (0, 1)),
  idle_timeout_minutes INTEGER NOT NULL DEFAULT 15 CHECK (idle_timeout_minutes > 0),
  warn_before_logout_seconds INTEGER NOT NULL DEFAULT 60 CHECK (warn_before_logout_seconds > 0),
  extend_session_on_activity INTEGER NOT NULL DEFAULT 1 CHECK (extend_session_on_activity IN (0, 1)),
  apply_idle_timeout_to_admin INTEGER NOT NULL DEFAULT 1 CHECK (apply_idle_timeout_to_admin IN (0, 1)),
  apply_idle_timeout_to_self_service INTEGER NOT NULL DEFAULT 1 CHECK (apply_idle_timeout_to_self_service IN (0, 1)),
  stricter_timeout_for_sensitive_pages INTEGER NOT NULL DEFAULT 1 CHECK (stricter_timeout_for_sensitive_pages IN (0, 1)),
  sensitive_page_idle_timeout_minutes INTEGER NOT NULL DEFAULT 10 CHECK (sensitive_page_idle_timeout_minutes > 0),
  audit_timeout_logout INTEGER NOT NULL DEFAULT 1 CHECK (audit_timeout_logout IN (0, 1)),
  password_policy_min_length INTEGER NOT NULL DEFAULT 8 CHECK (password_policy_min_length >= 8),
  password_policy_require_number INTEGER NOT NULL DEFAULT 0 CHECK (password_policy_require_number IN (0, 1)),
  password_policy_require_symbol INTEGER NOT NULL DEFAULT 0 CHECK (password_policy_require_symbol IN (0, 1)),
  pbkdf2_iterations_expected INTEGER NOT NULL DEFAULT 100000 CHECK (pbkdf2_iterations_expected = 100000),
  login_attempt_limit_placeholder INTEGER,
  account_lockout_minutes_placeholder INTEGER,
  require_password_change_placeholder INTEGER NOT NULL DEFAULT 0 CHECK (require_password_change_placeholder IN (0, 1)),
  force_logout_all_sessions_placeholder INTEGER NOT NULL DEFAULT 0 CHECK (force_logout_all_sessions_placeholder IN (0, 1)),
  protected_admin_mfa_placeholder_enabled INTEGER NOT NULL DEFAULT 0 CHECK (protected_admin_mfa_placeholder_enabled IN (0, 1)),
  audit_failed_permission_checks INTEGER NOT NULL DEFAULT 1 CHECK (audit_failed_permission_checks IN (0, 1)),
  audit_sensitive_views INTEGER NOT NULL DEFAULT 1 CHECK (audit_sensitive_views IN (0, 1)),
  audit_sensitive_exports INTEGER NOT NULL DEFAULT 1 CHECK (audit_sensitive_exports IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS system_health_snapshots (
  id TEXT PRIMARY KEY,
  checked_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'WARNING' CHECK (status IN ('HEALTHY', 'WARNING', 'ERROR')),
  d1_status TEXT NOT NULL,
  r2_status TEXT NOT NULL,
  schema_status TEXT NOT NULL,
  module_status TEXT NOT NULL,
  security_status TEXT NOT NULL,
  export_status TEXT NOT NULL,
  zkteco_status TEXT NOT NULL,
  details_json TEXT,
  created_by_user_id TEXT,
  metadata_json TEXT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_system_health_snapshots_checked_at ON system_health_snapshots(checked_at);
CREATE INDEX IF NOT EXISTS idx_system_health_snapshots_status ON system_health_snapshots(status);

CREATE TABLE IF NOT EXISTS sync_change_log (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL UNIQUE,
  table_name TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  row_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'ARCHIVE')),
  module_key TEXT,
  employee_id TEXT,
  company_id TEXT,
  worksite_id TEXT,
  department_id TEXT,
  changed_by_user_id TEXT,
  changed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_change_log_version ON sync_change_log(version);
CREATE INDEX IF NOT EXISTS idx_sync_change_log_module ON sync_change_log(module_key, version);
CREATE INDEX IF NOT EXISTS idx_sync_change_log_entity ON sync_change_log(entity_type, row_id);
CREATE INDEX IF NOT EXISTS idx_sync_change_log_employee ON sync_change_log(employee_id, version);

CREATE TABLE IF NOT EXISTS data_retention_settings (
  id TEXT PRIMARY KEY,
  audit_log_retention_days INTEGER CHECK (audit_log_retention_days IS NULL OR audit_log_retention_days >= 0),
  security_event_retention_days INTEGER CHECK (security_event_retention_days IS NULL OR security_event_retention_days >= 0),
  report_export_log_retention_days INTEGER CHECK (report_export_log_retention_days IS NULL OR report_export_log_retention_days >= 0),
  failed_import_log_retention_days INTEGER CHECK (failed_import_log_retention_days IS NULL OR failed_import_log_retention_days >= 0),
  notification_retention_days INTEGER CHECK (notification_retention_days IS NULL OR notification_retention_days >= 0),
  document_alert_retention_days INTEGER CHECK (document_alert_retention_days IS NULL OR document_alert_retention_days >= 0),
  zkteco_import_error_retention_days INTEGER CHECK (zkteco_import_error_retention_days IS NULL OR zkteco_import_error_retention_days >= 0),
  auto_delete_enabled INTEGER NOT NULL DEFAULT 0 CHECK (auto_delete_enabled IN (0, 1)),
  require_manual_review_before_delete INTEGER NOT NULL DEFAULT 1 CHECK (require_manual_review_before_delete IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT
);

CREATE TABLE IF NOT EXISTS export_security_settings (
  id TEXT PRIMARY KEY,
  csv_export_enabled INTEGER NOT NULL DEFAULT 1 CHECK (csv_export_enabled IN (0, 1)),
  json_export_enabled INTEGER NOT NULL DEFAULT 1 CHECK (json_export_enabled IN (0, 1)),
  excel_export_placeholder_enabled INTEGER NOT NULL DEFAULT 1 CHECK (excel_export_placeholder_enabled IN (0, 1)),
  pdf_export_placeholder_enabled INTEGER NOT NULL DEFAULT 1 CHECK (pdf_export_placeholder_enabled IN (0, 1)),
  sensitive_export_requires_permission INTEGER NOT NULL DEFAULT 1 CHECK (sensitive_export_requires_permission IN (0, 1)),
  sensitive_export_requires_reason INTEGER NOT NULL DEFAULT 1 CHECK (sensitive_export_requires_reason IN (0, 1)),
  sensitive_export_audit_enabled INTEGER NOT NULL DEFAULT 1 CHECK (sensitive_export_audit_enabled IN (0, 1)),
  max_export_rows INTEGER NOT NULL DEFAULT 5000 CHECK (max_export_rows > 0),
  max_export_date_range_days INTEGER CHECK (max_export_date_range_days IS NULL OR max_export_date_range_days > 0),
  mask_sensitive_fields_by_default INTEGER NOT NULL DEFAULT 1 CHECK (mask_sensitive_fields_by_default IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT
);

CREATE TABLE IF NOT EXISTS production_readiness_checks (
  id TEXT PRIMARY KEY,
  check_key TEXT NOT NULL UNIQUE,
  check_name TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SKIPPED' CHECK (status IN ('PASS', 'WARNING', 'FAIL', 'SKIPPED')),
  message TEXT NOT NULL,
  details_json TEXT,
  last_checked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_production_readiness_checks_key ON production_readiness_checks(check_key);
CREATE INDEX IF NOT EXISTS idx_production_readiness_checks_status ON production_readiness_checks(status);

CREATE TABLE IF NOT EXISTS admin_system_alerts (
  id TEXT PRIMARY KEY,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'INFO' CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
  module_key TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  source_entity_type TEXT,
  source_entity_id TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED')),
  assigned_to_user_id TEXT,
  acknowledged_by_user_id TEXT,
  acknowledged_at TEXT,
  resolved_by_user_id TEXT,
  resolved_at TEXT,
  dismissed_by_user_id TEXT,
  dismissed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (acknowledged_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (resolved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (dismissed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_system_alerts_type ON admin_system_alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_admin_system_alerts_status ON admin_system_alerts(status);
CREATE INDEX IF NOT EXISTS idx_admin_system_alerts_severity ON admin_system_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_admin_system_alerts_assigned ON admin_system_alerts(assigned_to_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_system_alerts_open_source ON admin_system_alerts(alert_type, source_entity_type, source_entity_id) WHERE status = 'OPEN';

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  recipient_user_id TEXT,
  recipient_employee_id TEXT,
  module_key TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  employee_id TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'INFO' CHECK (severity IN ('INFO', 'SUCCESS', 'WARNING', 'ERROR', 'CRITICAL')),
  notification_type TEXT NOT NULL DEFAULT 'GENERAL',
  route TEXT,
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (recipient_employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(recipient_user_id, is_read, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_employee_read ON notifications(recipient_employee_id, is_read, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_module ON notifications(module_key, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_entity ON notifications(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS notification_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  module_key TEXT NOT NULL,
  in_app_enabled INTEGER NOT NULL DEFAULT 1 CHECK (in_app_enabled IN (0, 1)),
  email_placeholder_enabled INTEGER NOT NULL DEFAULT 0 CHECK (email_placeholder_enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  UNIQUE (user_id, module_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notification_preferences_user ON notification_preferences(user_id, module_key);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  module TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  old_value_json TEXT,
  new_value_json TEXT,
  reason TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_module_action ON audit_logs(module, action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

CREATE TABLE IF NOT EXISTS report_export_logs (
  id TEXT PRIMARY KEY,
  report_key TEXT NOT NULL,
  report_name TEXT NOT NULL,
  export_format TEXT NOT NULL CHECK (export_format IN ('CSV', 'JSON', 'EXCEL', 'PDF')),
  filter_snapshot_json TEXT,
  row_count INTEGER NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  requested_by_user_id TEXT,
  requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'COMPLETED', 'FAILED', 'PLACEHOLDER')),
  file_name TEXT,
  file_reference TEXT,
  error_message TEXT,
  sensitive_export INTEGER NOT NULL DEFAULT 0 CHECK (sensitive_export IN (0, 1)),
  metadata_json TEXT,
  FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_report_export_logs_report_key ON report_export_logs(report_key, requested_at);
CREATE INDEX IF NOT EXISTS idx_report_export_logs_requested_by ON report_export_logs(requested_by_user_id, requested_at);
CREATE INDEX IF NOT EXISTS idx_report_export_logs_status ON report_export_logs(status, requested_at);

CREATE TABLE IF NOT EXISTS data_transfer_settings (
  id TEXT PRIMARY KEY,
  data_import_enabled INTEGER NOT NULL DEFAULT 1 CHECK (data_import_enabled IN (0, 1)),
  data_export_enabled INTEGER NOT NULL DEFAULT 1 CHECK (data_export_enabled IN (0, 1)),
  max_import_rows INTEGER NOT NULL DEFAULT 5000 CHECK (max_import_rows > 0),
  max_export_rows INTEGER NOT NULL DEFAULT 5000 CHECK (max_export_rows > 0),
  allowed_import_file_types_json TEXT,
  csv_import_enabled INTEGER NOT NULL DEFAULT 1 CHECK (csv_import_enabled IN (0, 1)),
  csv_export_enabled INTEGER NOT NULL DEFAULT 1 CHECK (csv_export_enabled IN (0, 1)),
  sensitive_import_requires_permission INTEGER NOT NULL DEFAULT 1 CHECK (sensitive_import_requires_permission IN (0, 1)),
  sensitive_export_requires_permission INTEGER NOT NULL DEFAULT 1 CHECK (sensitive_export_requires_permission IN (0, 1)),
  sensitive_import_requires_reason INTEGER NOT NULL DEFAULT 1 CHECK (sensitive_import_requires_reason IN (0, 1)),
  sensitive_export_requires_reason INTEGER NOT NULL DEFAULT 1 CHECK (sensitive_export_requires_reason IN (0, 1)),
  import_apply_requires_confirmation INTEGER NOT NULL DEFAULT 1 CHECK (import_apply_requires_confirmation IN (0, 1)),
  export_audit_enabled INTEGER NOT NULL DEFAULT 1 CHECK (export_audit_enabled IN (0, 1)),
  import_audit_enabled INTEGER NOT NULL DEFAULT 1 CHECK (import_audit_enabled IN (0, 1)),
  rollback_placeholder_enabled INTEGER NOT NULL DEFAULT 1 CHECK (rollback_placeholder_enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT
);

CREATE TABLE IF NOT EXISTS data_import_batches (
  id TEXT PRIMARY KEY,
  batch_number TEXT NOT NULL UNIQUE,
  import_type TEXT NOT NULL,
  import_mode TEXT NOT NULL DEFAULT 'VALIDATE_ONLY' CHECK (import_mode IN ('CREATE_ONLY', 'UPDATE_ONLY', 'UPSERT', 'VALIDATE_ONLY')),
  source_file_name TEXT,
  source_file_document_id TEXT,
  uploaded_by_user_id TEXT,
  uploaded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  validated_by_user_id TEXT,
  validated_at TEXT,
  applied_by_user_id TEXT,
  applied_at TEXT,
  cancelled_by_user_id TEXT,
  cancelled_at TEXT,
  cancellation_reason TEXT,
  row_count INTEGER NOT NULL DEFAULT 0 CHECK (row_count >= 0),
  valid_row_count INTEGER NOT NULL DEFAULT 0 CHECK (valid_row_count >= 0),
  invalid_row_count INTEGER NOT NULL DEFAULT 0 CHECK (invalid_row_count >= 0),
  warning_count INTEGER NOT NULL DEFAULT 0 CHECK (warning_count >= 0),
  duplicate_count INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_count >= 0),
  create_count INTEGER NOT NULL DEFAULT 0 CHECK (create_count >= 0),
  update_count INTEGER NOT NULL DEFAULT 0 CHECK (update_count >= 0),
  skipped_count INTEGER NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  error_count INTEGER NOT NULL DEFAULT 0 CHECK (error_count >= 0),
  status TEXT NOT NULL DEFAULT 'UPLOADED' CHECK (status IN ('UPLOADED', 'VALIDATING', 'VALIDATION_FAILED', 'READY_TO_APPLY', 'APPLYING', 'APPLIED', 'APPLIED_WITH_WARNINGS', 'FAILED', 'CANCELLED')),
  validation_summary_json TEXT,
  apply_summary_json TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (source_file_document_id) REFERENCES employee_documents(id) ON DELETE SET NULL,
  FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (validated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (applied_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (cancelled_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_data_import_batches_type ON data_import_batches(import_type);
CREATE INDEX IF NOT EXISTS idx_data_import_batches_number ON data_import_batches(batch_number);
CREATE INDEX IF NOT EXISTS idx_data_import_batches_status ON data_import_batches(status);
CREATE INDEX IF NOT EXISTS idx_data_import_batches_uploaded_by ON data_import_batches(uploaded_by_user_id);
CREATE INDEX IF NOT EXISTS idx_data_import_batches_applied_by ON data_import_batches(applied_by_user_id);
CREATE INDEX IF NOT EXISTS idx_data_import_batches_created_at ON data_import_batches(created_at);

CREATE TABLE IF NOT EXISTS data_import_rows (
  id TEXT PRIMARY KEY,
  import_batch_id TEXT NOT NULL,
  row_number INTEGER NOT NULL CHECK (row_number > 0),
  raw_row_json TEXT NOT NULL,
  normalized_row_json TEXT,
  target_entity_type TEXT,
  target_entity_id TEXT,
  action TEXT NOT NULL DEFAULT 'SKIP' CHECK (action IN ('CREATE', 'UPDATE', 'SKIP', 'ERROR', 'WARNING')),
  validation_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (validation_status IN ('PENDING', 'VALID', 'INVALID', 'WARNING', 'DUPLICATE')),
  apply_status TEXT NOT NULL DEFAULT 'NOT_APPLIED' CHECK (apply_status IN ('NOT_APPLIED', 'APPLIED', 'SKIPPED', 'FAILED')),
  error_code TEXT,
  error_message TEXT,
  warning_json TEXT,
  before_snapshot_json TEXT,
  after_snapshot_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  UNIQUE(import_batch_id, row_number),
  FOREIGN KEY (import_batch_id) REFERENCES data_import_batches(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_data_import_rows_batch ON data_import_rows(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_data_import_rows_row_number ON data_import_rows(row_number);
CREATE INDEX IF NOT EXISTS idx_data_import_rows_validation ON data_import_rows(validation_status);
CREATE INDEX IF NOT EXISTS idx_data_import_rows_apply ON data_import_rows(apply_status);
CREATE INDEX IF NOT EXISTS idx_data_import_rows_entity ON data_import_rows(target_entity_type, target_entity_id);

CREATE TABLE IF NOT EXISTS backup_readiness_records (
  id TEXT PRIMARY KEY,
  backup_type TEXT NOT NULL CHECK (backup_type IN ('D1_DATABASE', 'R2_DOCUMENTS', 'SCHEMA_SNAPSHOT', 'FULL_SYSTEM_PLACEHOLDER')),
  status TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK (status IN ('NOT_STARTED', 'PLANNED', 'COMPLETED', 'FAILED', 'SKIPPED')),
  recorded_by_user_id TEXT,
  recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  backup_reference TEXT,
  notes TEXT,
  checklist_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (recorded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_backup_readiness_records_type ON backup_readiness_records(backup_type);
CREATE INDEX IF NOT EXISTS idx_backup_readiness_records_status ON backup_readiness_records(status);
CREATE INDEX IF NOT EXISTS idx_backup_readiness_records_recorded_at ON backup_readiness_records(recorded_at);

CREATE TABLE IF NOT EXISTS qa_test_matrix_items (
  id TEXT PRIMARY KEY,
  test_key TEXT NOT NULL UNIQUE,
  test_name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  expected_result TEXT,
  status TEXT NOT NULL DEFAULT 'NOT_TESTED' CHECK (status IN ('NOT_TESTED', 'PASS', 'FAIL', 'BLOCKED', 'SKIPPED')),
  tester_user_id TEXT,
  tested_at TEXT,
  notes TEXT,
  evidence_reference TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (tester_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_qa_test_matrix_items_key ON qa_test_matrix_items(test_key);
CREATE INDEX IF NOT EXISTS idx_qa_test_matrix_items_status ON qa_test_matrix_items(status);
CREATE INDEX IF NOT EXISTS idx_qa_test_matrix_items_category ON qa_test_matrix_items(category);

CREATE TABLE IF NOT EXISTS smoke_test_runs (
  id TEXT PRIMARY KEY,
  run_by_user_id TEXT,
  run_source TEXT NOT NULL DEFAULT 'CLI' CHECK (run_source IN ('CLI', 'ADMIN_UI_PLACEHOLDER')),
  status TEXT NOT NULL CHECK (status IN ('PASS', 'WARNING', 'FAIL')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  summary_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (run_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_smoke_test_runs_status ON smoke_test_runs(status);
CREATE INDEX IF NOT EXISTS idx_smoke_test_runs_source ON smoke_test_runs(run_source);
CREATE INDEX IF NOT EXISTS idx_smoke_test_runs_started_at ON smoke_test_runs(started_at);

CREATE TABLE IF NOT EXISTS deployment_readiness_records (
  id TEXT PRIMARY KEY,
  environment_name TEXT NOT NULL,
  build_version_placeholder TEXT,
  deployment_status TEXT NOT NULL DEFAULT 'NOT_READY' CHECK (deployment_status IN ('NOT_READY', 'READY', 'DEPLOYED', 'FAILED', 'ROLLBACK_PLACEHOLDER')),
  d1_status TEXT,
  r2_status TEXT,
  schema_status TEXT,
  seed_status TEXT,
  production_readiness_status TEXT,
  smoke_test_status TEXT,
  known_blockers_json TEXT,
  last_deployment_note TEXT,
  recorded_by_user_id TEXT,
  recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (recorded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_deployment_readiness_records_environment ON deployment_readiness_records(environment_name);
CREATE INDEX IF NOT EXISTS idx_deployment_readiness_records_status ON deployment_readiness_records(deployment_status);
CREATE INDEX IF NOT EXISTS idx_deployment_readiness_records_recorded_at ON deployment_readiness_records(recorded_at);

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  legal_name TEXT,
  registration_no TEXT,
  tax_no TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  logo_document_id TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status);

CREATE TABLE IF NOT EXISTS locations (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'OUTLET' CHECK (type IN ('OUTLET', 'OFFICE', 'WAREHOUSE', 'OTHER')),
  island_city TEXT,
  address TEXT,
  phone TEXT,
  manager_employee_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  FOREIGN KEY (manager_employee_id) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_locations_active_code_unique ON locations(code COLLATE NOCASE) WHERE is_active = 1;
CREATE INDEX IF NOT EXISTS idx_locations_active ON locations(is_active);
CREATE INDEX IF NOT EXISTS idx_locations_type ON locations(type);
CREATE INDEX IF NOT EXISTS idx_locations_company ON locations(company_id);

CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  parent_department_id TEXT,
  head_employee_id TEXT,
  manager_employee_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (parent_department_id) REFERENCES departments(id) ON DELETE SET NULL,
  FOREIGN KEY (head_employee_id) REFERENCES employees(id) ON DELETE SET NULL,
  FOREIGN KEY (manager_employee_id) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_departments_active_code_unique ON departments(code COLLATE NOCASE) WHERE is_active = 1;
CREATE INDEX IF NOT EXISTS idx_departments_active ON departments(is_active);
CREATE INDEX IF NOT EXISTS idx_departments_parent ON departments(parent_department_id);

CREATE TABLE IF NOT EXISTS job_levels (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  rank_order INTEGER NOT NULL,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_levels_active_code_unique ON job_levels(code COLLATE NOCASE) WHERE is_active = 1;
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_levels_active_rank_unique ON job_levels(rank_order) WHERE is_active = 1;
CREATE INDEX IF NOT EXISTS idx_job_levels_active ON job_levels(is_active);

CREATE TABLE IF NOT EXISTS positions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  department_id TEXT,
  level_id TEXT,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  FOREIGN KEY (level_id) REFERENCES job_levels(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_positions_active_code_unique ON positions(code COLLATE NOCASE) WHERE is_active = 1;
CREATE INDEX IF NOT EXISTS idx_positions_active ON positions(is_active);
CREATE INDEX IF NOT EXISTS idx_positions_department ON positions(department_id);
CREATE INDEX IF NOT EXISTS idx_positions_level ON positions(level_id);

CREATE TABLE IF NOT EXISTS employee_statuses (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  is_protected INTEGER NOT NULL DEFAULT 0 CHECK (is_protected IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  can_login INTEGER NOT NULL DEFAULT 0 CHECK (can_login IN (0, 1)),
  include_in_payroll INTEGER NOT NULL DEFAULT 0 CHECK (include_in_payroll IN (0, 1)),
  include_in_roster INTEGER NOT NULL DEFAULT 0 CHECK (include_in_roster IN (0, 1)),
  show_in_active_lists INTEGER NOT NULL DEFAULT 0 CHECK (show_in_active_lists IN (0, 1)),
  requires_exit_date INTEGER NOT NULL DEFAULT 0 CHECK (requires_exit_date IN (0, 1)),
  requires_exit_reason INTEGER NOT NULL DEFAULT 0 CHECK (requires_exit_reason IN (0, 1)),
  requires_final_settlement INTEGER NOT NULL DEFAULT 0 CHECK (requires_final_settlement IN (0, 1)),
  requires_document_clearance INTEGER NOT NULL DEFAULT 0 CHECK (requires_document_clearance IN (0, 1)),
  requires_asset_clearance INTEGER NOT NULL DEFAULT 0 CHECK (requires_asset_clearance IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_statuses_key_unique ON employee_statuses(key);
CREATE INDEX IF NOT EXISTS idx_employee_statuses_active ON employee_statuses(is_active);
CREATE INDEX IF NOT EXISTS idx_employee_statuses_sort ON employee_statuses(sort_order);

CREATE TABLE IF NOT EXISTS employee_number_settings (
  id TEXT PRIMARY KEY,
  prefix TEXT NOT NULL DEFAULT 'EMP',
  include_year INTEGER NOT NULL DEFAULT 0 CHECK (include_year IN (0, 1)),
  include_location_code INTEGER NOT NULL DEFAULT 0 CHECK (include_location_code IN (0, 1)),
  include_department_code INTEGER NOT NULL DEFAULT 0 CHECK (include_department_code IN (0, 1)),
  sequence_padding INTEGER NOT NULL DEFAULT 4 CHECK (sequence_padding BETWEEN 1 AND 12),
  next_sequence INTEGER NOT NULL DEFAULT 1 CHECK (next_sequence >= 1),
  allow_manual_override INTEGER NOT NULL DEFAULT 0 CHECK (allow_manual_override IN (0, 1)),
  separator TEXT NOT NULL DEFAULT '-',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,
  employee_no TEXT NOT NULL UNIQUE COLLATE NOCASE,
  profile_photo_document_id TEXT,
  full_name TEXT NOT NULL,
  display_name TEXT,
  gender TEXT,
  date_of_birth TEXT,
  nationality TEXT,
  employee_type TEXT NOT NULL CHECK (employee_type IN ('LOCAL', 'FOREIGN', 'OTHER')),
  employment_type TEXT NOT NULL CHECK (employment_type IN ('FULL_TIME', 'PART_TIME', 'INTERN', 'TEMPORARY', 'CONTRACT')),
  status_id TEXT NOT NULL,
  primary_department_id TEXT,
  primary_position_id TEXT,
  primary_location_id TEXT,
  job_level_id TEXT,
  joining_date TEXT,
  confirmation_date TEXT,
  contract_start_date TEXT,
  contract_end_date TEXT,
  probation_end_date TEXT,
  reporting_manager_employee_id TEXT,
  payroll_included INTEGER NOT NULL DEFAULT 1 CHECK (payroll_included IN (0, 1)),
  roster_eligible INTEGER NOT NULL DEFAULT 1 CHECK (roster_eligible IN (0, 1)),
  user_id TEXT,
  exit_date TEXT,
  exit_reason TEXT,
  notes_summary TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  archived_at TEXT,
  FOREIGN KEY (status_id) REFERENCES employee_statuses(id),
  FOREIGN KEY (primary_department_id) REFERENCES departments(id) ON DELETE SET NULL,
  FOREIGN KEY (primary_position_id) REFERENCES positions(id) ON DELETE SET NULL,
  FOREIGN KEY (primary_location_id) REFERENCES locations(id) ON DELETE SET NULL,
  FOREIGN KEY (job_level_id) REFERENCES job_levels(id) ON DELETE SET NULL,
  FOREIGN KEY (reporting_manager_employee_id) REFERENCES employees(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_employee_no_unique ON employees(employee_no);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status_id);
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(primary_department_id);
CREATE INDEX IF NOT EXISTS idx_employees_position ON employees(primary_position_id);
CREATE INDEX IF NOT EXISTS idx_employees_location ON employees(primary_location_id);
CREATE INDEX IF NOT EXISTS idx_employees_job_level ON employees(job_level_id);
CREATE INDEX IF NOT EXISTS idx_employees_archived ON employees(archived_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_employees_user_unique ON employees(user_id) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS employee_job_history (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  previous_department_id TEXT,
  new_department_id TEXT,
  previous_position_id TEXT,
  new_position_id TEXT,
  previous_location_id TEXT,
  new_location_id TEXT,
  previous_job_level_id TEXT,
  new_job_level_id TEXT,
  previous_reporting_manager_employee_id TEXT,
  new_reporting_manager_employee_id TEXT,
  effective_date TEXT NOT NULL,
  reason TEXT,
  approved_by_user_id TEXT,
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (previous_department_id) REFERENCES departments(id) ON DELETE SET NULL,
  FOREIGN KEY (new_department_id) REFERENCES departments(id) ON DELETE SET NULL,
  FOREIGN KEY (previous_position_id) REFERENCES positions(id) ON DELETE SET NULL,
  FOREIGN KEY (new_position_id) REFERENCES positions(id) ON DELETE SET NULL,
  FOREIGN KEY (previous_location_id) REFERENCES locations(id) ON DELETE SET NULL,
  FOREIGN KEY (new_location_id) REFERENCES locations(id) ON DELETE SET NULL,
  FOREIGN KEY (previous_job_level_id) REFERENCES job_levels(id) ON DELETE SET NULL,
  FOREIGN KEY (new_job_level_id) REFERENCES job_levels(id) ON DELETE SET NULL,
  FOREIGN KEY (previous_reporting_manager_employee_id) REFERENCES employees(id) ON DELETE SET NULL,
  FOREIGN KEY (new_reporting_manager_employee_id) REFERENCES employees(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_employee_job_history_employee ON employee_job_history(employee_id, effective_date);

CREATE TABLE IF NOT EXISTS employee_contacts (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  contact_type TEXT NOT NULL CHECK (contact_type IN ('PERSONAL_PHONE', 'WORK_PHONE', 'PERSONAL_EMAIL', 'WORK_EMAIL', 'EMERGENCY', 'GUARDIAN', 'SPOUSE', 'PARENT', 'OTHER')),
  value TEXT NOT NULL,
  country_code TEXT,
  relationship TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  emergency_priority INTEGER,
  is_sensitive INTEGER NOT NULL DEFAULT 0 CHECK (is_sensitive IN (0, 1)),
  notes TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_employee_contacts_employee ON employee_contacts(employee_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_contacts_primary_type ON employee_contacts(employee_id, contact_type) WHERE is_primary = 1 AND archived_at IS NULL;

CREATE TABLE IF NOT EXISTS employee_addresses (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  address_type TEXT NOT NULL CHECK (address_type IN ('CURRENT', 'PERMANENT', 'TEMPORARY', 'OTHER')),
  address_line TEXT NOT NULL,
  island_city TEXT,
  country TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  is_sensitive INTEGER NOT NULL DEFAULT 0 CHECK (is_sensitive IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_employee_addresses_employee ON employee_addresses(employee_id);

CREATE TABLE IF NOT EXISTS employee_onboarding_tasks (
  id TEXT PRIMARY KEY,
  onboarding_case_id TEXT,
  employee_id TEXT NOT NULL,
  task_key TEXT NOT NULL,
  title TEXT NOT NULL,
  task_name TEXT,
  description TEXT,
  module TEXT NOT NULL,
  task_group TEXT DEFAULT 'OTHER' CHECK (task_group IS NULL OR task_group IN ('PERSONAL_INFO', 'CONTACT_INFO', 'JOB_ASSIGNMENT', 'DOCUMENTS', 'CONTRACT', 'PAYROLL_PROFILE', 'PAYMENT_METHOD', 'PENSION_PROFILE', 'USER_ACCESS', 'ROSTER_ELIGIBILITY', 'ATTENDANCE_BIOMETRIC', 'ASSETS_UNIFORMS', 'NOTES', 'ACTIVATION_APPROVAL', 'OTHER')),
  source_module TEXT,
  source_reference_type TEXT,
  source_reference_id TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'SKIPPED', 'BLOCKED')),
  task_status TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK (task_status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'WAIVED', 'BLOCKED', 'NOT_REQUIRED', 'CANCELLED')),
  required INTEGER NOT NULL DEFAULT 1 CHECK (required IN (0, 1)),
  is_required INTEGER NOT NULL DEFAULT 1 CHECK (is_required IN (0, 1)),
  assigned_to_user_id TEXT,
  assigned_role_id TEXT,
  due_date TEXT,
  completed_by_user_id TEXT,
  completed_at TEXT,
  waived_by_user_id TEXT,
  waived_at TEXT,
  waiver_reason TEXT,
  blocked_reason TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (onboarding_case_id) REFERENCES employee_onboarding_cases(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_role_id) REFERENCES roles(id) ON DELETE SET NULL,
  FOREIGN KEY (waived_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (completed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_onboarding_task_unique ON employee_onboarding_tasks(employee_id, task_key);
CREATE INDEX IF NOT EXISTS idx_employee_onboarding_employee ON employee_onboarding_tasks(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_employee_onboarding_case ON employee_onboarding_tasks(onboarding_case_id, task_status);
CREATE INDEX IF NOT EXISTS idx_employee_onboarding_task_group ON employee_onboarding_tasks(task_group, task_status);
CREATE INDEX IF NOT EXISTS idx_employee_onboarding_assignee ON employee_onboarding_tasks(assigned_to_user_id, due_date);

CREATE TABLE IF NOT EXISTS onboarding_settings (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  onboarding_enabled INTEGER NOT NULL DEFAULT 1 CHECK (onboarding_enabled IN (0, 1)),
  require_onboarding_before_activation INTEGER NOT NULL DEFAULT 1 CHECK (require_onboarding_before_activation IN (0, 1)),
  allow_draft_employee_records INTEGER NOT NULL DEFAULT 1 CHECK (allow_draft_employee_records IN (0, 1)),
  auto_create_onboarding_case_on_employee_create INTEGER NOT NULL DEFAULT 1 CHECK (auto_create_onboarding_case_on_employee_create IN (0, 1)),
  allow_partial_onboarding INTEGER NOT NULL DEFAULT 1 CHECK (allow_partial_onboarding IN (0, 1)),
  require_personal_info_before_activation INTEGER NOT NULL DEFAULT 1 CHECK (require_personal_info_before_activation IN (0, 1)),
  require_contact_info_before_activation INTEGER NOT NULL DEFAULT 0 CHECK (require_contact_info_before_activation IN (0, 1)),
  require_emergency_contact_before_activation INTEGER NOT NULL DEFAULT 0 CHECK (require_emergency_contact_before_activation IN (0, 1)),
  require_job_assignment_before_activation INTEGER NOT NULL DEFAULT 1 CHECK (require_job_assignment_before_activation IN (0, 1)),
  require_department_before_activation INTEGER NOT NULL DEFAULT 1 CHECK (require_department_before_activation IN (0, 1)),
  require_worksite_location_before_activation INTEGER NOT NULL DEFAULT 1 CHECK (require_worksite_location_before_activation IN (0, 1)),
  require_reporting_manager_before_activation INTEGER NOT NULL DEFAULT 0 CHECK (require_reporting_manager_before_activation IN (0, 1)),
  require_documents_before_activation INTEGER NOT NULL DEFAULT 1 CHECK (require_documents_before_activation IN (0, 1)),
  require_contract_before_activation INTEGER NOT NULL DEFAULT 0 CHECK (require_contract_before_activation IN (0, 1)),
  require_payroll_profile_before_activation INTEGER NOT NULL DEFAULT 1 CHECK (require_payroll_profile_before_activation IN (0, 1)),
  require_payment_method_before_activation INTEGER NOT NULL DEFAULT 0 CHECK (require_payment_method_before_activation IN (0, 1)),
  require_pension_profile_if_eligible_before_activation INTEGER NOT NULL DEFAULT 0 CHECK (require_pension_profile_if_eligible_before_activation IN (0, 1)),
  require_roster_eligibility_before_activation INTEGER NOT NULL DEFAULT 0 CHECK (require_roster_eligibility_before_activation IN (0, 1)),
  require_biometric_mapping_before_activation INTEGER NOT NULL DEFAULT 0 CHECK (require_biometric_mapping_before_activation IN (0, 1)),
  require_asset_uniform_issue_before_activation INTEGER NOT NULL DEFAULT 0 CHECK (require_asset_uniform_issue_before_activation IN (0, 1)),
  require_user_account_before_activation INTEGER NOT NULL DEFAULT 0 CHECK (require_user_account_before_activation IN (0, 1)),
  require_approval_before_activation INTEGER NOT NULL DEFAULT 1 CHECK (require_approval_before_activation IN (0, 1)),
  allow_activation_override_with_reason INTEGER NOT NULL DEFAULT 1 CHECK (allow_activation_override_with_reason IN (0, 1)),
  use_central_approval_workflow INTEGER NOT NULL DEFAULT 1 CHECK (use_central_approval_workflow IN (0, 1)),
  default_onboarding_due_days INTEGER NOT NULL DEFAULT 7 CHECK (default_onboarding_due_days >= 0),
  default_task_due_days INTEGER NOT NULL DEFAULT 3 CHECK (default_task_due_days >= 0),
  overdue_alerts_enabled INTEGER NOT NULL DEFAULT 1 CHECK (overdue_alerts_enabled IN (0, 1)),
  employee_self_service_onboarding_view_enabled INTEGER NOT NULL DEFAULT 1 CHECK (employee_self_service_onboarding_view_enabled IN (0, 1)),
  invite_email_placeholder_enabled INTEGER NOT NULL DEFAULT 0 CHECK (invite_email_placeholder_enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS employee_onboarding_cases (
  id TEXT PRIMARY KEY,
  case_number TEXT NOT NULL UNIQUE,
  employee_id TEXT NOT NULL,
  employee_number_snapshot TEXT,
  employee_name_snapshot TEXT,
  department_snapshot TEXT,
  worksite_snapshot TEXT,
  location_snapshot TEXT,
  position_snapshot TEXT,
  employment_type_snapshot TEXT,
  employee_type_snapshot TEXT,
  onboarding_status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (onboarding_status IN ('DRAFT', 'IN_PROGRESS', 'WAITING_FOR_DOCUMENTS', 'WAITING_FOR_CONTRACT', 'WAITING_FOR_PAYROLL', 'WAITING_FOR_ACCESS_SETUP', 'WAITING_FOR_ASSETS_UNIFORMS', 'READY_FOR_APPROVAL', 'PENDING_APPROVAL', 'APPROVED', 'ACTIVATED', 'BLOCKED', 'CANCELLED')),
  activation_status TEXT NOT NULL DEFAULT 'NOT_READY' CHECK (activation_status IN ('NOT_READY', 'READY', 'SUBMITTED', 'APPROVED', 'ACTIVATED', 'OVERRIDDEN')),
  assigned_owner_user_id TEXT,
  due_date TEXT,
  completed_at TEXT,
  activated_by_user_id TEXT,
  activated_at TEXT,
  cancelled_by_user_id TEXT,
  cancelled_at TEXT,
  cancellation_reason TEXT,
  approval_instance_id TEXT,
  checklist_summary_json TEXT,
  blockers_json TEXT,
  notes TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (activated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (cancelled_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_onboarding_cases_active_employee ON employee_onboarding_cases(employee_id) WHERE onboarding_status != 'CANCELLED' AND activation_status != 'ACTIVATED';
CREATE INDEX IF NOT EXISTS idx_onboarding_cases_status ON employee_onboarding_cases(onboarding_status, activation_status);
CREATE INDEX IF NOT EXISTS idx_onboarding_cases_employee ON employee_onboarding_cases(employee_id, created_at);
CREATE INDEX IF NOT EXISTS idx_onboarding_cases_owner_due ON employee_onboarding_cases(assigned_owner_user_id, due_date);

CREATE TABLE IF NOT EXISTS onboarding_alerts (
  id TEXT PRIMARY KEY,
  onboarding_case_id TEXT,
  employee_id TEXT,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('OVERDUE_TASK', 'MISSING_DOCUMENT', 'CONTRACT_PENDING', 'PAYROLL_MISSING', 'PAYMENT_METHOD_MISSING', 'BIOMETRIC_MAPPING_MISSING', 'USER_ACCESS_PENDING', 'ASSET_UNIFORM_PENDING', 'ACTIVATION_PENDING_APPROVAL', 'ONBOARDING_BLOCKED')),
  severity TEXT NOT NULL DEFAULT 'WARNING' CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED')),
  due_date TEXT,
  assigned_to_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (onboarding_case_id) REFERENCES employee_onboarding_cases(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_onboarding_alerts_open_unique ON onboarding_alerts(onboarding_case_id, alert_type) WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_onboarding_alerts_status ON onboarding_alerts(status, severity, due_date);

CREATE TABLE IF NOT EXISTS offboarding_settings (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  offboarding_enabled INTEGER NOT NULL DEFAULT 1 CHECK (offboarding_enabled IN (0, 1)),
  require_offboarding_case_before_exit INTEGER NOT NULL DEFAULT 1 CHECK (require_offboarding_case_before_exit IN (0, 1)),
  auto_create_offboarding_case_on_exit_status INTEGER NOT NULL DEFAULT 1 CHECK (auto_create_offboarding_case_on_exit_status IN (0, 1)),
  require_final_settlement_before_archive INTEGER NOT NULL DEFAULT 1 CHECK (require_final_settlement_before_archive IN (0, 1)),
  require_asset_uniform_clearance INTEGER NOT NULL DEFAULT 1 CHECK (require_asset_uniform_clearance IN (0, 1)),
  require_document_checklist INTEGER NOT NULL DEFAULT 0 CHECK (require_document_checklist IN (0, 1)),
  require_payroll_final_check INTEGER NOT NULL DEFAULT 1 CHECK (require_payroll_final_check IN (0, 1)),
  require_attendance_final_check INTEGER NOT NULL DEFAULT 1 CHECK (require_attendance_final_check IN (0, 1)),
  require_roster_future_assignment_check INTEGER NOT NULL DEFAULT 1 CHECK (require_roster_future_assignment_check IN (0, 1)),
  require_user_account_deactivation INTEGER NOT NULL DEFAULT 1 CHECK (require_user_account_deactivation IN (0, 1)),
  require_access_revocation INTEGER NOT NULL DEFAULT 1 CHECK (require_access_revocation IN (0, 1)),
  require_approval_before_exit_finalization INTEGER NOT NULL DEFAULT 1 CHECK (require_approval_before_exit_finalization IN (0, 1)),
  allow_offboarding_override_with_reason INTEGER NOT NULL DEFAULT 1 CHECK (allow_offboarding_override_with_reason IN (0, 1)),
  use_central_approval_workflow INTEGER NOT NULL DEFAULT 1 CHECK (use_central_approval_workflow IN (0, 1)),
  default_offboarding_due_days INTEGER NOT NULL DEFAULT 7 CHECK (default_offboarding_due_days >= 0),
  default_task_due_days INTEGER NOT NULL DEFAULT 3 CHECK (default_task_due_days >= 0),
  overdue_alerts_enabled INTEGER NOT NULL DEFAULT 1 CHECK (overdue_alerts_enabled IN (0, 1)),
  employee_self_service_offboarding_view_enabled INTEGER NOT NULL DEFAULT 1 CHECK (employee_self_service_offboarding_view_enabled IN (0, 1)),
  scheduled_access_deactivation_placeholder_enabled INTEGER NOT NULL DEFAULT 1 CHECK (scheduled_access_deactivation_placeholder_enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS employee_offboarding_cases (
  id TEXT PRIMARY KEY,
  case_number TEXT NOT NULL UNIQUE,
  employee_id TEXT NOT NULL,
  employee_number_snapshot TEXT,
  employee_name_snapshot TEXT,
  department_snapshot TEXT,
  worksite_snapshot TEXT,
  location_snapshot TEXT,
  position_snapshot TEXT,
  employment_type_snapshot TEXT,
  employee_type_snapshot TEXT,
  exit_type TEXT NOT NULL CHECK (exit_type IN ('RESIGNED', 'TERMINATED', 'END_OF_CONTRACT', 'ABSCONDED', 'RETIRED', 'DECEASED', 'OTHER')),
  exit_reason TEXT,
  exit_notice_date TEXT,
  last_working_day TEXT NOT NULL,
  offboarding_status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (offboarding_status IN ('DRAFT', 'IN_PROGRESS', 'WAITING_FOR_CLEARANCE', 'WAITING_FOR_PAYROLL', 'WAITING_FOR_FINAL_SETTLEMENT', 'WAITING_FOR_ACCESS_REVOCATION', 'READY_FOR_FINAL_APPROVAL', 'PENDING_APPROVAL', 'APPROVED', 'COMPLETED', 'CANCELLED')),
  finalization_status TEXT NOT NULL DEFAULT 'NOT_READY' CHECK (finalization_status IN ('NOT_READY', 'READY', 'SUBMITTED', 'APPROVED', 'FINALIZED', 'OVERRIDDEN')),
  assigned_owner_user_id TEXT,
  due_date TEXT,
  completed_at TEXT,
  finalized_by_user_id TEXT,
  finalized_at TEXT,
  cancelled_by_user_id TEXT,
  cancelled_at TEXT,
  cancellation_reason TEXT,
  approval_instance_id TEXT,
  checklist_summary_json TEXT,
  blockers_json TEXT,
  notes TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (finalized_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (cancelled_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_offboarding_cases_active_employee ON employee_offboarding_cases(employee_id) WHERE offboarding_status != 'CANCELLED' AND finalization_status != 'FINALIZED';
CREATE INDEX IF NOT EXISTS idx_offboarding_cases_status ON employee_offboarding_cases(offboarding_status, finalization_status);
CREATE INDEX IF NOT EXISTS idx_offboarding_cases_employee ON employee_offboarding_cases(employee_id, created_at);
CREATE INDEX IF NOT EXISTS idx_offboarding_cases_owner_due ON employee_offboarding_cases(assigned_owner_user_id, due_date);

CREATE TABLE IF NOT EXISTS employee_offboarding_tasks (
  id TEXT PRIMARY KEY,
  offboarding_case_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  task_key TEXT NOT NULL,
  task_name TEXT NOT NULL,
  task_group TEXT NOT NULL DEFAULT 'OTHER' CHECK (task_group IN ('FINAL_SETTLEMENT', 'LEAVE', 'PAYROLL', 'ATTENDANCE_BIOMETRIC', 'ROSTER', 'ASSETS_UNIFORMS', 'DOCUMENTS', 'USER_ACCESS', 'APPROVAL', 'OTHER')),
  source_module TEXT,
  source_reference_type TEXT,
  source_reference_id TEXT,
  is_required INTEGER NOT NULL DEFAULT 1 CHECK (is_required IN (0, 1)),
  task_status TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK (task_status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'WAIVED', 'BLOCKED', 'NOT_REQUIRED', 'CANCELLED')),
  assigned_to_user_id TEXT,
  assigned_role_id TEXT,
  due_date TEXT,
  completed_by_user_id TEXT,
  completed_at TEXT,
  waived_by_user_id TEXT,
  waived_at TEXT,
  waiver_reason TEXT,
  blocked_reason TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (offboarding_case_id) REFERENCES employee_offboarding_cases(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_role_id) REFERENCES roles(id) ON DELETE SET NULL,
  FOREIGN KEY (completed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (waived_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_offboarding_task_unique ON employee_offboarding_tasks(offboarding_case_id, task_key);
CREATE INDEX IF NOT EXISTS idx_employee_offboarding_employee ON employee_offboarding_tasks(employee_id, task_status);
CREATE INDEX IF NOT EXISTS idx_employee_offboarding_case ON employee_offboarding_tasks(offboarding_case_id, task_status);
CREATE INDEX IF NOT EXISTS idx_employee_offboarding_task_group ON employee_offboarding_tasks(task_group, task_status);
CREATE INDEX IF NOT EXISTS idx_employee_offboarding_assignee ON employee_offboarding_tasks(assigned_to_user_id, due_date);

CREATE TABLE IF NOT EXISTS employee_lifecycle_events (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  case_type TEXT NOT NULL CHECK (case_type IN ('ONBOARDING', 'OFFBOARDING')),
  case_id TEXT NOT NULL,
  action TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  actor_user_id TEXT,
  actor_name_snapshot TEXT,
  reason TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_lifecycle_events_employee ON employee_lifecycle_events(employee_id, created_at);
CREATE INDEX IF NOT EXISTS idx_lifecycle_events_case ON employee_lifecycle_events(case_type, case_id, created_at);
CREATE INDEX IF NOT EXISTS idx_lifecycle_events_action ON employee_lifecycle_events(action, created_at);

CREATE TABLE IF NOT EXISTS contract_settings (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  contracts_enabled INTEGER NOT NULL DEFAULT 1 CHECK (contracts_enabled IN (0, 1)),
  require_contract_for_active_employee INTEGER NOT NULL DEFAULT 0 CHECK (require_contract_for_active_employee IN (0, 1)),
  auto_create_contract_task_on_onboarding INTEGER NOT NULL DEFAULT 1 CHECK (auto_create_contract_task_on_onboarding IN (0, 1)),
  require_contract_approval_before_activation INTEGER NOT NULL DEFAULT 0 CHECK (require_contract_approval_before_activation IN (0, 1)),
  allow_employee_without_contract_warning INTEGER NOT NULL DEFAULT 1 CHECK (allow_employee_without_contract_warning IN (0, 1)),
  contract_expiry_alerts_enabled INTEGER NOT NULL DEFAULT 1 CHECK (contract_expiry_alerts_enabled IN (0, 1)),
  default_expiry_warning_days INTEGER NOT NULL DEFAULT 30 CHECK (default_expiry_warning_days >= 0),
  default_probation_warning_days INTEGER NOT NULL DEFAULT 14 CHECK (default_probation_warning_days >= 0),
  default_renewal_warning_days INTEGER NOT NULL DEFAULT 30 CHECK (default_renewal_warning_days >= 0),
  auto_mark_expired_contracts INTEGER NOT NULL DEFAULT 1 CHECK (auto_mark_expired_contracts IN (0, 1)),
  auto_create_end_of_contract_settlement_case INTEGER NOT NULL DEFAULT 0 CHECK (auto_create_end_of_contract_settlement_case IN (0, 1)),
  require_reason_for_contract_change INTEGER NOT NULL DEFAULT 1 CHECK (require_reason_for_contract_change IN (0, 1)),
  allow_contract_salary_snapshot INTEGER NOT NULL DEFAULT 1 CHECK (allow_contract_salary_snapshot IN (0, 1)),
  allow_contract_salary_update_to_payroll_profile INTEGER NOT NULL DEFAULT 0 CHECK (allow_contract_salary_update_to_payroll_profile IN (0, 1)),
  require_approval_for_contract_salary_update INTEGER NOT NULL DEFAULT 1 CHECK (require_approval_for_contract_salary_update IN (0, 1)),
  contract_document_required INTEGER NOT NULL DEFAULT 0 CHECK (contract_document_required IN (0, 1)),
  contract_sensitive_salary_terms INTEGER NOT NULL DEFAULT 1 CHECK (contract_sensitive_salary_terms IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_contract_settings_company ON contract_settings(company_id);

CREATE TABLE IF NOT EXISTS contract_types (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'EMPLOYMENT' CHECK (category IN ('EMPLOYMENT', 'RENEWAL', 'PROBATION', 'TEMPORARY', 'CONSULTANCY_PLACEHOLDER', 'OTHER')),
  default_duration_months INTEGER CHECK (default_duration_months IS NULL OR default_duration_months >= 0),
  default_probation_months INTEGER CHECK (default_probation_months IS NULL OR default_probation_months >= 0),
  requires_end_date INTEGER NOT NULL DEFAULT 1 CHECK (requires_end_date IN (0, 1)),
  requires_probation INTEGER NOT NULL DEFAULT 0 CHECK (requires_probation IN (0, 1)),
  allows_renewal INTEGER NOT NULL DEFAULT 1 CHECK (allows_renewal IN (0, 1)),
  allows_salary_terms INTEGER NOT NULL DEFAULT 1 CHECK (allows_salary_terms IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  display_order INTEGER NOT NULL DEFAULT 100,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  archived_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  archived_at TEXT,
  metadata_json TEXT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (archived_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_contract_types_status ON contract_types(status, is_active, display_order);

CREATE TABLE IF NOT EXISTS employee_contracts (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  contract_number TEXT NOT NULL UNIQUE COLLATE NOCASE,
  contract_type_id TEXT NOT NULL,
  contract_type_code_snapshot TEXT,
  contract_type_name_snapshot TEXT,
  contract_title TEXT NOT NULL,
  contract_version_number INTEGER NOT NULL DEFAULT 1 CHECK (contract_version_number >= 1),
  parent_contract_id TEXT,
  renewal_of_contract_id TEXT,
  previous_contract_id TEXT,
  document_id TEXT,
  contract_document_version_id TEXT,
  contract_start_date TEXT NOT NULL,
  contract_end_date TEXT,
  probation_start_date TEXT,
  probation_end_date TEXT,
  confirmation_due_date TEXT,
  confirmed_date TEXT,
  signed_date TEXT,
  effective_date TEXT NOT NULL,
  expiry_warning_date TEXT,
  renewal_due_date TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'RENEWED', 'TERMINATED', 'CANCELLED', 'ARCHIVED')),
  approval_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED' CHECK (approval_status IN ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED', 'SENT_BACK')),
  probation_status TEXT NOT NULL DEFAULT 'NOT_APPLICABLE' CHECK (probation_status IN ('NOT_APPLICABLE', 'IN_PROBATION', 'EXTENDED', 'CONFIRMED', 'FAILED', 'TERMINATED_DURING_PROBATION')),
  renewal_status TEXT NOT NULL DEFAULT 'NOT_APPLICABLE' CHECK (renewal_status IN ('NOT_APPLICABLE', 'NOT_DUE', 'DUE_SOON', 'PENDING_RENEWAL', 'RENEWED', 'NOT_RENEWED')),
  employee_number_snapshot TEXT,
  employee_name_snapshot TEXT,
  department_snapshot TEXT,
  worksite_snapshot TEXT,
  location_snapshot TEXT,
  position_snapshot TEXT,
  employment_type_snapshot TEXT,
  job_level_snapshot TEXT,
  basic_salary_snapshot REAL CHECK (basic_salary_snapshot IS NULL OR basic_salary_snapshot >= 0),
  salary_currency_snapshot TEXT,
  salary_terms_json TEXT,
  benefits_terms_json TEXT,
  working_terms_json TEXT,
  termination_notice_days INTEGER CHECK (termination_notice_days IS NULL OR termination_notice_days >= 0),
  renewal_notice_days INTEGER CHECK (renewal_notice_days IS NULL OR renewal_notice_days >= 0),
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  approved_by_user_id TEXT,
  approved_at TEXT,
  rejected_by_user_id TEXT,
  rejected_at TEXT,
  rejection_reason TEXT,
  cancelled_by_user_id TEXT,
  cancelled_at TEXT,
  cancellation_reason TEXT,
  archived_by_user_id TEXT,
  archived_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (contract_type_id) REFERENCES contract_types(id) ON DELETE RESTRICT,
  FOREIGN KEY (parent_contract_id) REFERENCES employee_contracts(id) ON DELETE SET NULL,
  FOREIGN KEY (renewal_of_contract_id) REFERENCES employee_contracts(id) ON DELETE SET NULL,
  FOREIGN KEY (previous_contract_id) REFERENCES employee_contracts(id) ON DELETE SET NULL,
  FOREIGN KEY (document_id) REFERENCES employee_documents(id) ON DELETE SET NULL,
  FOREIGN KEY (contract_document_version_id) REFERENCES employee_document_versions(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (rejected_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (cancelled_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (archived_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_employee_contracts_employee ON employee_contracts(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_employee_contracts_contract_number ON employee_contracts(contract_number);
CREATE INDEX IF NOT EXISTS idx_employee_contracts_type ON employee_contracts(contract_type_id);
CREATE INDEX IF NOT EXISTS idx_employee_contracts_status ON employee_contracts(status);
CREATE INDEX IF NOT EXISTS idx_employee_contracts_approval_status ON employee_contracts(approval_status);
CREATE INDEX IF NOT EXISTS idx_employee_contracts_probation_status ON employee_contracts(probation_status);
CREATE INDEX IF NOT EXISTS idx_employee_contracts_renewal_status ON employee_contracts(renewal_status);
CREATE INDEX IF NOT EXISTS idx_employee_contracts_start_date ON employee_contracts(contract_start_date);
CREATE INDEX IF NOT EXISTS idx_employee_contracts_end_date ON employee_contracts(contract_end_date);
CREATE INDEX IF NOT EXISTS idx_employee_contracts_confirmation_due ON employee_contracts(confirmation_due_date);
CREATE INDEX IF NOT EXISTS idx_employee_contracts_renewal_due ON employee_contracts(renewal_due_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_contracts_one_active ON employee_contracts(employee_id) WHERE status IN ('ACTIVE', 'EXPIRING_SOON');

CREATE TABLE IF NOT EXISTS employee_contract_events (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  action TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  actor_user_id TEXT,
  actor_name_snapshot TEXT,
  note TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (contract_id) REFERENCES employee_contracts(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_employee_contract_events_contract ON employee_contract_events(contract_id, created_at);
CREATE INDEX IF NOT EXISTS idx_employee_contract_events_employee ON employee_contract_events(employee_id, created_at);

CREATE TABLE IF NOT EXISTS employee_probation_events (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('STARTED', 'EXTENDED', 'CONFIRMED', 'FAILED', 'TERMINATED_DURING_PROBATION', 'NOT_APPLICABLE')),
  previous_probation_end_date TEXT,
  new_probation_end_date TEXT,
  confirmation_due_date TEXT,
  confirmed_date TEXT,
  reason TEXT,
  actor_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (contract_id) REFERENCES employee_contracts(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_employee_probation_events_contract ON employee_probation_events(contract_id, created_at);
CREATE INDEX IF NOT EXISTS idx_employee_probation_events_employee ON employee_probation_events(employee_id, created_at);

CREATE TABLE IF NOT EXISTS employee_contract_renewals (
  id TEXT PRIMARY KEY,
  original_contract_id TEXT NOT NULL,
  renewal_contract_id TEXT,
  employee_id TEXT NOT NULL,
  renewal_status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (renewal_status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ACTIVATED', 'REJECTED', 'NOT_RENEWED', 'CANCELLED')),
  previous_end_date TEXT,
  proposed_start_date TEXT NOT NULL,
  proposed_end_date TEXT,
  changes_summary_json TEXT,
  reason TEXT,
  created_by_user_id TEXT,
  approved_by_user_id TEXT,
  approved_at TEXT,
  activated_by_user_id TEXT,
  activated_at TEXT,
  cancelled_by_user_id TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (original_contract_id) REFERENCES employee_contracts(id) ON DELETE CASCADE,
  FOREIGN KEY (renewal_contract_id) REFERENCES employee_contracts(id) ON DELETE SET NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (activated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (cancelled_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_employee_contract_renewals_original ON employee_contract_renewals(original_contract_id);
CREATE INDEX IF NOT EXISTS idx_employee_contract_renewals_employee ON employee_contract_renewals(employee_id, renewal_status);
CREATE INDEX IF NOT EXISTS idx_employee_contract_renewals_status ON employee_contract_renewals(renewal_status, proposed_start_date);

CREATE TABLE IF NOT EXISTS contract_alerts (
  id TEXT PRIMARY KEY,
  contract_id TEXT,
  employee_id TEXT NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('CONTRACT_EXPIRING', 'CONTRACT_EXPIRED', 'RENEWAL_DUE', 'PROBATION_DUE', 'PROBATION_EXPIRED', 'CONTRACT_MISSING')),
  alert_date TEXT NOT NULL,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED')),
  severity TEXT NOT NULL DEFAULT 'WARNING' CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
  assigned_to_user_id TEXT,
  acknowledged_by_user_id TEXT,
  acknowledged_at TEXT,
  resolved_by_user_id TEXT,
  resolved_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (contract_id) REFERENCES employee_contracts(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (acknowledged_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (resolved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_contract_alerts_contract ON contract_alerts(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_alerts_employee ON contract_alerts(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_contract_alerts_type ON contract_alerts(alert_type, status);
CREATE INDEX IF NOT EXISTS idx_contract_alerts_alert_date ON contract_alerts(alert_date);
CREATE INDEX IF NOT EXISTS idx_contract_alerts_due_date ON contract_alerts(due_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_alerts_unique_open ON contract_alerts(employee_id, COALESCE(contract_id, ''), alert_type, due_date) WHERE status IN ('OPEN', 'ACKNOWLEDGED');

CREATE TABLE IF NOT EXISTS employee_profile_field_settings (
  id TEXT PRIMARY KEY,
  field_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  section TEXT NOT NULL,
  is_required INTEGER NOT NULL DEFAULT 0 CHECK (is_required IN (0, 1)),
  is_hidden INTEGER NOT NULL DEFAULT 0 CHECK (is_hidden IN (0, 1)),
  is_sensitive INTEGER NOT NULL DEFAULT 0 CHECK (is_sensitive IN (0, 1)),
  show_in_summary INTEGER NOT NULL DEFAULT 1 CHECK (show_in_summary IN (0, 1)),
  hr_only_edit INTEGER NOT NULL DEFAULT 1 CHECK (hr_only_edit IN (0, 1)),
  allow_kyc_update_request INTEGER NOT NULL DEFAULT 0 CHECK (allow_kyc_update_request IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_profile_field_settings_key ON employee_profile_field_settings(field_key);
CREATE INDEX IF NOT EXISTS idx_employee_profile_field_settings_section ON employee_profile_field_settings(section, sort_order);

CREATE TABLE IF NOT EXISTS document_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 100,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_document_categories_active_name_unique ON document_categories(name COLLATE NOCASE) WHERE is_active = 1;
CREATE INDEX IF NOT EXISTS idx_document_categories_active_sort ON document_categories(is_active, sort_order);

CREATE TABLE IF NOT EXISTS document_types (
  id TEXT PRIMARY KEY,
  category_id TEXT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  is_sensitive INTEGER NOT NULL DEFAULT 0 CHECK (is_sensitive IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  expiring_soon_days INTEGER NOT NULL DEFAULT 30 CHECK (expiring_soon_days >= 0),
  allowed_file_types_json TEXT NOT NULL DEFAULT '["application/pdf","image/jpeg","image/png"]',
  allowed_mime_types TEXT,
  max_file_size_mb REAL NOT NULL DEFAULT 10 CHECK (max_file_size_mb > 0),
  allow_multiple_files INTEGER NOT NULL DEFAULT 0 CHECK (allow_multiple_files IN (0, 1)),
  requires_expiry_date INTEGER NOT NULL DEFAULT 0 CHECK (requires_expiry_date IN (0, 1)),
  requires_issue_date INTEGER NOT NULL DEFAULT 0 CHECK (requires_issue_date IN (0, 1)),
  requires_document_number INTEGER NOT NULL DEFAULT 0 CHECK (requires_document_number IN (0, 1)),
  expiry_required INTEGER NOT NULL DEFAULT 0 CHECK (expiry_required IN (0, 1)),
  issue_date_required INTEGER NOT NULL DEFAULT 0 CHECK (issue_date_required IN (0, 1)),
  document_number_required INTEGER NOT NULL DEFAULT 0 CHECK (document_number_required IN (0, 1)),
  urgent_expiring_days INTEGER,
  renewal_case_auto_create INTEGER NOT NULL DEFAULT 0 CHECK (renewal_case_auto_create IN (0, 1)),
  employee_summary_visible INTEGER NOT NULL DEFAULT 1 CHECK (employee_summary_visible IN (0, 1)),
  employee_download_allowed INTEGER NOT NULL DEFAULT 0 CHECK (employee_download_allowed IN (0, 1)),
  blocks_employee_activation INTEGER NOT NULL DEFAULT 0 CHECK (blocks_employee_activation IN (0, 1)),
  creates_payroll_warning INTEGER NOT NULL DEFAULT 0 CHECK (creates_payroll_warning IN (0, 1)),
  creates_final_settlement_warning INTEGER NOT NULL DEFAULT 0 CHECK (creates_final_settlement_warning IN (0, 1)),
  compliance_weight INTEGER,
  sensitivity_level TEXT NOT NULL DEFAULT 'NORMAL' CHECK (sensitivity_level IN ('NORMAL', 'SENSITIVE', 'HIGHLY_SENSITIVE')),
  renewal_instructions TEXT,
  retention_rule_json TEXT,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (category_id) REFERENCES document_categories(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_document_types_code_unique ON document_types(code);
CREATE INDEX IF NOT EXISTS idx_document_types_category ON document_types(category_id);
CREATE INDEX IF NOT EXISTS idx_document_types_active ON document_types(is_active);

CREATE TABLE IF NOT EXISTS employee_documents (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  document_type_id TEXT NOT NULL,
  category_id TEXT,
  document_number TEXT,
  issue_date TEXT,
  expiry_date TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED', 'SOFT_DELETED')),
  current_version_id TEXT,
  is_sensitive INTEGER NOT NULL DEFAULT 0 CHECK (is_sensitive IN (0, 1)),
  notes TEXT,
  created_by_user_id TEXT NOT NULL,
  updated_by_user_id TEXT,
  archived_at TEXT,
  archived_by_user_id TEXT,
  archive_reason TEXT,
  restored_at TEXT,
  restored_by_user_id TEXT,
  restore_reason TEXT,
  soft_deleted_at TEXT,
  soft_deleted_by_user_id TEXT,
  soft_delete_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (document_type_id) REFERENCES document_types(id),
  FOREIGN KEY (category_id) REFERENCES document_categories(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (archived_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (restored_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (soft_deleted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_employee_documents_employee ON employee_documents(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_employee_documents_type ON employee_documents(document_type_id);
CREATE INDEX IF NOT EXISTS idx_employee_documents_expiry ON employee_documents(expiry_date);
CREATE INDEX IF NOT EXISTS idx_employee_documents_status ON employee_documents(status);

CREATE TABLE IF NOT EXISTS employee_document_versions (
  id TEXT PRIMARY KEY,
  employee_document_id TEXT NOT NULL,
  version_no INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  file_mime_type TEXT NOT NULL,
  file_size_bytes INTEGER NOT NULL,
  file_hash TEXT,
  uploaded_by_user_id TEXT NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  reason_for_replacement TEXT,
  is_current INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (employee_document_id) REFERENCES employee_documents(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_document_versions_unique ON employee_document_versions(employee_document_id, version_no);
CREATE INDEX IF NOT EXISTS idx_employee_document_versions_current ON employee_document_versions(employee_document_id, is_current);

CREATE TABLE IF NOT EXISTS document_required_rules (
  id TEXT PRIMARY KEY,
  document_type_id TEXT NOT NULL,
  employee_type TEXT CHECK (employee_type IN ('LOCAL', 'FOREIGN', 'OTHER') OR employee_type IS NULL),
  employment_type TEXT CHECK (employment_type IN ('FULL_TIME', 'PART_TIME', 'INTERN', 'TEMPORARY', 'CONTRACT') OR employment_type IS NULL),
  department_id TEXT,
  position_id TEXT,
  location_id TEXT,
  custom_condition_json TEXT,
  is_required INTEGER NOT NULL DEFAULT 1 CHECK (is_required IN (0, 1)),
  rule_priority INTEGER NOT NULL DEFAULT 100,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (document_type_id) REFERENCES document_types(id) ON DELETE CASCADE,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE SET NULL,
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_document_required_rules_type ON document_required_rules(document_type_id);
CREATE INDEX IF NOT EXISTS idx_document_required_rules_active ON document_required_rules(is_active, rule_priority);

CREATE TABLE IF NOT EXISTS document_retention_rules (
  id TEXT PRIMARY KEY,
  document_type_id TEXT NOT NULL,
  retention_mode TEXT NOT NULL DEFAULT 'FOREVER' CHECK (retention_mode IN ('FOREVER', 'YEARS_AFTER_UPLOAD', 'YEARS_AFTER_EXPIRY', 'YEARS_AFTER_EXIT', 'CUSTOM')),
  retention_years INTEGER,
  custom_rule_json TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (document_type_id) REFERENCES document_types(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_document_retention_rules_type ON document_retention_rules(document_type_id, is_active);

CREATE TABLE IF NOT EXISTS document_report_exports (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  report_key TEXT NOT NULL,
  filters_json TEXT,
  exported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS document_compliance_settings (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  document_compliance_enabled INTEGER NOT NULL DEFAULT 1 CHECK (document_compliance_enabled IN (0, 1)),
  expiry_alerts_enabled INTEGER NOT NULL DEFAULT 1 CHECK (expiry_alerts_enabled IN (0, 1)),
  missing_required_document_alerts_enabled INTEGER NOT NULL DEFAULT 1 CHECK (missing_required_document_alerts_enabled IN (0, 1)),
  renewal_workflow_enabled INTEGER NOT NULL DEFAULT 1 CHECK (renewal_workflow_enabled IN (0, 1)),
  auto_create_renewal_case_for_expiring_document INTEGER NOT NULL DEFAULT 0 CHECK (auto_create_renewal_case_for_expiring_document IN (0, 1)),
  auto_create_missing_document_case INTEGER NOT NULL DEFAULT 0 CHECK (auto_create_missing_document_case IN (0, 1)),
  default_expiring_soon_days INTEGER NOT NULL DEFAULT 30 CHECK (default_expiring_soon_days >= 0),
  default_urgent_expiring_days INTEGER NOT NULL DEFAULT 7 CHECK (default_urgent_expiring_days >= 0),
  default_overdue_grace_days INTEGER NOT NULL DEFAULT 0 CHECK (default_overdue_grace_days >= 0),
  require_reason_for_renewal_case_cancel INTEGER NOT NULL DEFAULT 1 CHECK (require_reason_for_renewal_case_cancel IN (0, 1)),
  require_reason_for_document_waiver INTEGER NOT NULL DEFAULT 1 CHECK (require_reason_for_document_waiver IN (0, 1)),
  allow_document_requirement_waiver INTEGER NOT NULL DEFAULT 1 CHECK (allow_document_requirement_waiver IN (0, 1)),
  allow_employee_view_document_compliance INTEGER NOT NULL DEFAULT 1 CHECK (allow_employee_view_document_compliance IN (0, 1)),
  allow_employee_download_documents INTEGER NOT NULL DEFAULT 0 CHECK (allow_employee_download_documents IN (0, 1)),
  employee_document_upload_request_placeholder_enabled INTEGER NOT NULL DEFAULT 0 CHECK (employee_document_upload_request_placeholder_enabled IN (0, 1)),
  sensitive_document_view_audit_enabled INTEGER NOT NULL DEFAULT 1 CHECK (sensitive_document_view_audit_enabled IN (0, 1)),
  compliance_dashboard_enabled INTEGER NOT NULL DEFAULT 1 CHECK (compliance_dashboard_enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_document_compliance_settings_company ON document_compliance_settings(company_id);

CREATE TABLE IF NOT EXISTS document_requirement_waivers (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  document_type_id TEXT NOT NULL,
  required_rule_id TEXT,
  waiver_reason TEXT NOT NULL,
  waiver_start_date TEXT NOT NULL DEFAULT (date('now')),
  waiver_end_date TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'CANCELLED')),
  approved_by_user_id TEXT,
  approved_at TEXT,
  cancelled_by_user_id TEXT,
  cancelled_at TEXT,
  cancellation_reason TEXT,
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (document_type_id) REFERENCES document_types(id) ON DELETE CASCADE,
  FOREIGN KEY (required_rule_id) REFERENCES document_required_rules(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (cancelled_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_document_requirement_waivers_employee ON document_requirement_waivers(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_document_requirement_waivers_type ON document_requirement_waivers(document_type_id, status);
CREATE INDEX IF NOT EXISTS idx_document_requirement_waivers_dates ON document_requirement_waivers(waiver_start_date, waiver_end_date);

CREATE TABLE IF NOT EXISTS employee_document_compliance_snapshots (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  snapshot_date TEXT NOT NULL DEFAULT (date('now')),
  total_required_documents INTEGER NOT NULL DEFAULT 0,
  submitted_required_documents INTEGER NOT NULL DEFAULT 0,
  missing_required_documents INTEGER NOT NULL DEFAULT 0,
  expiring_documents INTEGER NOT NULL DEFAULT 0,
  urgent_expiring_documents INTEGER NOT NULL DEFAULT 0,
  expired_documents INTEGER NOT NULL DEFAULT 0,
  waived_required_documents INTEGER NOT NULL DEFAULT 0,
  compliance_status TEXT NOT NULL DEFAULT 'NOT_APPLICABLE' CHECK (compliance_status IN ('COMPLIANT', 'MISSING_REQUIRED', 'EXPIRING_SOON', 'URGENT_EXPIRING', 'EXPIRED_DOCUMENTS', 'WAIVER_ACTIVE', 'NOT_APPLICABLE')),
  compliance_percent REAL NOT NULL DEFAULT 0,
  warning_summary_json TEXT,
  required_documents_json TEXT,
  expiring_documents_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_document_compliance_snapshot_unique ON employee_document_compliance_snapshots(employee_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_employee_document_compliance_snapshot_employee ON employee_document_compliance_snapshots(employee_id, created_at);
CREATE INDEX IF NOT EXISTS idx_employee_document_compliance_snapshot_status ON employee_document_compliance_snapshots(compliance_status);

CREATE TABLE IF NOT EXISTS document_expiry_alerts (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  document_id TEXT,
  document_type_id TEXT NOT NULL,
  document_version_id TEXT,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('MISSING_REQUIRED', 'EXPIRING_SOON', 'URGENT_EXPIRING', 'EXPIRED', 'RENEWAL_DUE', 'WAIVER_EXPIRING', 'DOCUMENT_REPLACED')),
  alert_date TEXT NOT NULL DEFAULT (date('now')),
  due_date TEXT,
  expiry_date TEXT,
  severity TEXT NOT NULL DEFAULT 'WARNING' CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED')),
  assigned_to_user_id TEXT,
  acknowledged_by_user_id TEXT,
  acknowledged_at TEXT,
  resolved_by_user_id TEXT,
  resolved_at TEXT,
  dismissed_by_user_id TEXT,
  dismissed_at TEXT,
  reason TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES employee_documents(id) ON DELETE SET NULL,
  FOREIGN KEY (document_type_id) REFERENCES document_types(id) ON DELETE CASCADE,
  FOREIGN KEY (document_version_id) REFERENCES employee_document_versions(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_document_expiry_alerts_employee ON document_expiry_alerts(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_document_expiry_alerts_document ON document_expiry_alerts(document_id);
CREATE INDEX IF NOT EXISTS idx_document_expiry_alerts_type ON document_expiry_alerts(document_type_id, alert_type);
CREATE INDEX IF NOT EXISTS idx_document_expiry_alerts_status ON document_expiry_alerts(status, severity);
CREATE INDEX IF NOT EXISTS idx_document_expiry_alerts_due_date ON document_expiry_alerts(due_date);
CREATE INDEX IF NOT EXISTS idx_document_expiry_alerts_assigned ON document_expiry_alerts(assigned_to_user_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_expiry_alerts_unique_open ON document_expiry_alerts(employee_id, document_type_id, alert_type, COALESCE(document_id, '')) WHERE status IN ('OPEN', 'ACKNOWLEDGED');

CREATE TABLE IF NOT EXISTS document_renewal_cases (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  document_id TEXT,
  document_type_id TEXT NOT NULL,
  current_document_version_id TEXT,
  renewal_case_number TEXT NOT NULL UNIQUE,
  case_type TEXT NOT NULL DEFAULT 'RENEWAL' CHECK (case_type IN ('NEW_REQUIRED_DOCUMENT', 'RENEWAL', 'REPLACEMENT', 'CORRECTION')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('DRAFT', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_EMPLOYEE', 'WAITING_FOR_HR', 'WAITING_FOR_EXTERNAL_AUTHORITY', 'DOCUMENT_RECEIVED', 'COMPLETED', 'CANCELLED', 'WAIVED')),
  priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  current_expiry_date TEXT,
  target_renewal_date TEXT,
  due_date TEXT,
  completed_document_id TEXT,
  completed_document_version_id TEXT,
  assigned_to_user_id TEXT,
  created_by_user_id TEXT NOT NULL,
  updated_by_user_id TEXT,
  completed_by_user_id TEXT,
  completed_at TEXT,
  cancelled_by_user_id TEXT,
  cancelled_at TEXT,
  cancellation_reason TEXT,
  waiver_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (document_id) REFERENCES employee_documents(id) ON DELETE SET NULL,
  FOREIGN KEY (document_type_id) REFERENCES document_types(id) ON DELETE CASCADE,
  FOREIGN KEY (current_document_version_id) REFERENCES employee_document_versions(id) ON DELETE SET NULL,
  FOREIGN KEY (completed_document_id) REFERENCES employee_documents(id) ON DELETE SET NULL,
  FOREIGN KEY (completed_document_version_id) REFERENCES employee_document_versions(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (completed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (cancelled_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (waiver_id) REFERENCES document_requirement_waivers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_document_renewal_cases_employee ON document_renewal_cases(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_document_renewal_cases_document ON document_renewal_cases(document_id);
CREATE INDEX IF NOT EXISTS idx_document_renewal_cases_type ON document_renewal_cases(document_type_id, status);
CREATE INDEX IF NOT EXISTS idx_document_renewal_cases_status ON document_renewal_cases(status, priority);
CREATE INDEX IF NOT EXISTS idx_document_renewal_cases_due_date ON document_renewal_cases(due_date);
CREATE INDEX IF NOT EXISTS idx_document_renewal_cases_assigned ON document_renewal_cases(assigned_to_user_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_renewal_cases_open_unique ON document_renewal_cases(employee_id, document_type_id, case_type, COALESCE(document_id, '')) WHERE status NOT IN ('COMPLETED', 'CANCELLED', 'WAIVED');

CREATE TABLE IF NOT EXISTS document_renewal_case_events (
  id TEXT PRIMARY KEY,
  renewal_case_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  action TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  actor_user_id TEXT NOT NULL,
  actor_name_snapshot TEXT,
  note TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (renewal_case_id) REFERENCES document_renewal_cases(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_document_renewal_case_events_case ON document_renewal_case_events(renewal_case_id, created_at);
CREATE INDEX IF NOT EXISTS idx_document_renewal_case_events_employee ON document_renewal_case_events(employee_id, created_at);

CREATE TABLE IF NOT EXISTS leave_types (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  is_paid_default INTEGER NOT NULL DEFAULT 1 CHECK (is_paid_default IN (0, 1)),
  is_statutory INTEGER NOT NULL DEFAULT 0 CHECK (is_statutory IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_leave_types_active ON leave_types(is_active, sort_order);

CREATE TABLE IF NOT EXISTS leave_policies (
  id TEXT PRIMARY KEY,
  leave_type_id TEXT NOT NULL,
  name TEXT NOT NULL,
  applies_to_employee_type TEXT CHECK (applies_to_employee_type IN ('LOCAL', 'FOREIGN', 'OTHER') OR applies_to_employee_type IS NULL),
  applies_to_employment_type TEXT CHECK (applies_to_employment_type IN ('FULL_TIME', 'PART_TIME', 'INTERN', 'TEMPORARY', 'CONTRACT') OR applies_to_employment_type IS NULL),
  department_id TEXT,
  position_id TEXT,
  location_id TEXT,
  annual_entitlement_days REAL,
  allow_half_day INTEGER NOT NULL DEFAULT 1 CHECK (allow_half_day IN (0, 1)),
  allow_carry_forward INTEGER NOT NULL DEFAULT 0 CHECK (allow_carry_forward IN (0, 1)),
  carry_forward_limit_days REAL,
  carry_forward_expiry_month INTEGER,
  include_public_holidays INTEGER NOT NULL DEFAULT 0 CHECK (include_public_holidays IN (0, 1)),
  include_weekly_off_days INTEGER NOT NULL DEFAULT 0 CHECK (include_weekly_off_days IN (0, 1)),
  salary_deduction_mode TEXT NOT NULL DEFAULT 'NONE' CHECK (salary_deduction_mode IN ('NONE', 'FULL_DAY', 'WORKED_DAYS_ONLY', 'CUSTOM', 'NO_DEDUCTION', 'DEDUCT_FROM_BASIC_SALARY', 'DEDUCT_FROM_GROSS_SALARY', 'DEDUCT_FROM_SELECTED_ALLOWANCE', 'FIXED_AMOUNT_PER_DAY', 'DAILY_RATE_FORMULA', 'DEDUCT_AFTER_ENTITLEMENT_EXHAUSTED', 'PAY_ONLY_WORKED_DAYS')),
  deduction_pay_component TEXT,
  requires_document INTEGER NOT NULL DEFAULT 0 CHECK (requires_document IN (0, 1)),
  document_required_after_consecutive_days REAL,
  document_required_after_used_days REAL,
  max_consecutive_days REAL,
  min_notice_days INTEGER,
  long_leave_threshold_days REAL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  priority INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE CASCADE,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE SET NULL,
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_leave_policies_match ON leave_policies(leave_type_id, is_active, priority);

CREATE TABLE IF NOT EXISTS leave_balances (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  leave_type_id TEXT NOT NULL,
  period_year INTEGER NOT NULL,
  opening_balance REAL NOT NULL DEFAULT 0,
  accrued_days REAL NOT NULL DEFAULT 0,
  used_days REAL NOT NULL DEFAULT 0,
  pending_days REAL NOT NULL DEFAULT 0,
  adjusted_days REAL NOT NULL DEFAULT 0,
  carried_forward_days REAL NOT NULL DEFAULT 0,
  expired_days REAL NOT NULL DEFAULT 0,
  closing_balance REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (employee_id, leave_type_id, period_year),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  leave_type_id TEXT NOT NULL,
  policy_id TEXT,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  total_days REAL NOT NULL,
  requested_days REAL NOT NULL,
  half_day_type TEXT DEFAULT 'NONE' CHECK (half_day_type IN ('FIRST_HALF', 'SECOND_HALF', 'NONE') OR half_day_type IS NULL),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED')),
  document_required INTEGER NOT NULL DEFAULT 0 CHECK (document_required IN (0, 1)),
  document_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED' CHECK (document_status IN ('NOT_REQUIRED', 'REQUIRED_PENDING', 'PROVIDED')),
  salary_deduction_mode TEXT CHECK (salary_deduction_mode IN ('NONE', 'FULL_DAY', 'WORKED_DAYS_ONLY', 'CUSTOM', 'NO_DEDUCTION', 'DEDUCT_FROM_BASIC_SALARY', 'DEDUCT_FROM_GROSS_SALARY', 'DEDUCT_FROM_SELECTED_ALLOWANCE', 'FIXED_AMOUNT_PER_DAY', 'DAILY_RATE_FORMULA', 'DEDUCT_AFTER_ENTITLEMENT_EXHAUSTED', 'PAY_ONLY_WORKED_DAYS') OR salary_deduction_mode IS NULL),
  salary_deduction_estimate_json TEXT,
  public_holiday_handling_json TEXT,
  submitted_by_user_id TEXT,
  submitted_at TEXT,
  approved_at TEXT,
  rejected_at TEXT,
  cancelled_at TEXT,
  cancellation_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE RESTRICT,
  FOREIGN KEY (policy_id) REFERENCES leave_policies(id) ON DELETE SET NULL,
  FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_employee_status ON leave_requests(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates ON leave_requests(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_type_status ON leave_requests(leave_type_id, status);

CREATE TABLE IF NOT EXISTS leave_request_days (
  id TEXT PRIMARY KEY,
  leave_request_id TEXT NOT NULL,
  leave_date TEXT NOT NULL,
  day_type TEXT NOT NULL CHECK (day_type IN ('FULL_DAY', 'HALF_DAY', 'PUBLIC_HOLIDAY', 'WEEKLY_OFF')),
  counted_as_leave INTEGER NOT NULL DEFAULT 1 CHECK (counted_as_leave IN (0, 1)),
  payroll_impact_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (leave_request_id, leave_date),
  FOREIGN KEY (leave_request_id) REFERENCES leave_requests(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS leave_approval_workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  applies_to_leave_type_id TEXT,
  applies_to_employee_type TEXT CHECK (applies_to_employee_type IN ('LOCAL', 'FOREIGN', 'OTHER') OR applies_to_employee_type IS NULL),
  applies_to_employment_type TEXT CHECK (applies_to_employment_type IN ('FULL_TIME', 'PART_TIME', 'INTERN', 'TEMPORARY', 'CONTRACT') OR applies_to_employment_type IS NULL),
  department_id TEXT,
  location_id TEXT,
  position_id TEXT,
  job_level_id TEXT,
  min_duration_days REAL,
  max_duration_days REAL,
  payroll_impact_only INTEGER NOT NULL DEFAULT 0 CHECK (payroll_impact_only IN (0, 1)),
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  priority INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (applies_to_leave_type_id) REFERENCES leave_types(id) ON DELETE SET NULL,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
  FOREIGN KEY (position_id) REFERENCES positions(id) ON DELETE SET NULL,
  FOREIGN KEY (job_level_id) REFERENCES job_levels(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_leave_workflows_match ON leave_approval_workflows(is_active, priority);

CREATE TABLE IF NOT EXISTS leave_approval_steps (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  approver_type TEXT NOT NULL CHECK (approver_type IN ('ROLE', 'USER', 'REPORTING_MANAGER', 'DEPARTMENT_MANAGER', 'DEPARTMENT_SENIOR', 'DIRECTOR', 'HR_ROLE', 'PERMISSION', 'DEPARTMENT_HEAD', 'LOCATION_MANAGER', 'HR_MANAGER', 'FINANCE_MANAGER', 'OWNER')),
  role_id TEXT,
  user_id TEXT,
  permission_key TEXT,
  is_required INTEGER NOT NULL DEFAULT 1 CHECK (is_required IN (0, 1)),
  skip_if_no_approver INTEGER NOT NULL DEFAULT 1 CHECK (skip_if_no_approver IN (0, 1)),
  allow_self_approval INTEGER NOT NULL DEFAULT 0 CHECK (allow_self_approval IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (workflow_id) REFERENCES leave_approval_workflows(id) ON DELETE CASCADE,
  FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_leave_steps_order ON leave_approval_steps(workflow_id, step_order);

CREATE TABLE IF NOT EXISTS leave_request_approvals (
  id TEXT PRIMARY KEY,
  leave_request_id TEXT NOT NULL,
  workflow_id TEXT,
  step_id TEXT,
  step_order INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  approver_user_id TEXT,
  approver_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'SKIPPED')),
  action_by_user_id TEXT,
  action_at TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (leave_request_id) REFERENCES leave_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (workflow_id) REFERENCES leave_approval_workflows(id) ON DELETE SET NULL,
  FOREIGN KEY (step_id) REFERENCES leave_approval_steps(id) ON DELETE SET NULL,
  FOREIGN KEY (approver_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (action_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_leave_approvals_request ON leave_request_approvals(leave_request_id, step_order);
CREATE INDEX IF NOT EXISTS idx_leave_approvals_user ON leave_request_approvals(approver_user_id, status);

CREATE TABLE IF NOT EXISTS leave_policy_document_rules (
  id TEXT PRIMARY KEY,
  leave_policy_id TEXT NOT NULL,
  document_type_id TEXT,
  requires_document INTEGER NOT NULL DEFAULT 1 CHECK (requires_document IN (0, 1)),
  required_after_consecutive_days REAL,
  required_after_used_days REAL,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (leave_policy_id) REFERENCES leave_policies(id) ON DELETE CASCADE,
  FOREIGN KEY (document_type_id) REFERENCES document_types(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS leave_policy_deduction_rules (
  id TEXT PRIMARY KEY,
  leave_policy_id TEXT NOT NULL,
  deduction_mode TEXT NOT NULL DEFAULT 'NONE' CHECK (deduction_mode IN ('NONE', 'FULL_DAY', 'WORKED_DAYS_ONLY', 'CUSTOM', 'NO_DEDUCTION', 'DEDUCT_FROM_BASIC_SALARY', 'DEDUCT_FROM_GROSS_SALARY', 'DEDUCT_FROM_SELECTED_ALLOWANCE', 'FIXED_AMOUNT_PER_DAY', 'DAILY_RATE_FORMULA', 'DEDUCT_AFTER_ENTITLEMENT_EXHAUSTED', 'PAY_ONLY_WORKED_DAYS')),
  deduction_pay_component TEXT,
  deduction_after_days REAL,
  long_leave_threshold_days REAL,
  custom_rule_json TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (leave_policy_id) REFERENCES leave_policies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS leave_request_documents (
  id TEXT PRIMARY KEY,
  leave_request_id TEXT NOT NULL,
  employee_document_id TEXT NOT NULL,
  document_type_id TEXT,
  attached_by_user_id TEXT,
  attached_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (leave_request_id, employee_document_id),
  FOREIGN KEY (leave_request_id) REFERENCES leave_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_document_id) REFERENCES employee_documents(id) ON DELETE CASCADE,
  FOREIGN KEY (document_type_id) REFERENCES document_types(id) ON DELETE SET NULL,
  FOREIGN KEY (attached_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS leave_balance_cycles (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  leave_type_id TEXT NOT NULL,
  cycle_year INTEGER NOT NULL,
  cycle_start_date TEXT NOT NULL,
  cycle_end_date TEXT NOT NULL,
  opening_balance REAL NOT NULL DEFAULT 0,
  accrued_days REAL NOT NULL DEFAULT 0,
  used_days REAL NOT NULL DEFAULT 0,
  pending_days REAL NOT NULL DEFAULT 0,
  adjusted_days REAL NOT NULL DEFAULT 0,
  carried_forward_days REAL NOT NULL DEFAULT 0,
  expired_days REAL NOT NULL DEFAULT 0,
  closing_balance REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (employee_id, leave_type_id, cycle_year),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_leave_balance_cycles_employee ON leave_balance_cycles(employee_id, cycle_year);

CREATE TABLE IF NOT EXISTS leave_balance_ledger_entries (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  leave_type_id TEXT NOT NULL,
  leave_request_id TEXT,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('OPENING', 'ACCRUAL', 'PENDING_HOLD', 'PENDING_RELEASE', 'USED', 'USED_REVERSAL', 'ADJUSTMENT', 'CARRY_FORWARD', 'EXPIRY')),
  days REAL NOT NULL,
  balance_before_json TEXT,
  balance_after_json TEXT,
  reason TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (cycle_id) REFERENCES leave_balance_cycles(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE CASCADE,
  FOREIGN KEY (leave_request_id) REFERENCES leave_requests(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_leave_ledger_employee ON leave_balance_ledger_entries(employee_id, created_at);
CREATE INDEX IF NOT EXISTS idx_leave_ledger_request ON leave_balance_ledger_entries(leave_request_id);

CREATE TABLE IF NOT EXISTS leave_payroll_impacts (
  id TEXT PRIMARY KEY,
  leave_request_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  leave_type_id TEXT NOT NULL,
  salary_deduction_mode TEXT NOT NULL CHECK (salary_deduction_mode IN ('NONE', 'FULL_DAY', 'WORKED_DAYS_ONLY', 'CUSTOM', 'NO_DEDUCTION', 'DEDUCT_FROM_BASIC_SALARY', 'DEDUCT_FROM_GROSS_SALARY', 'DEDUCT_FROM_SELECTED_ALLOWANCE', 'FIXED_AMOUNT_PER_DAY', 'DAILY_RATE_FORMULA', 'DEDUCT_AFTER_ENTITLEMENT_EXHAUSTED', 'PAY_ONLY_WORKED_DAYS')),
  chargeable_days REAL NOT NULL DEFAULT 0,
  estimated_amount REAL,
  impact_json TEXT,
  status TEXT NOT NULL DEFAULT 'ESTIMATED' CHECK (status IN ('ESTIMATED', 'APPLIED', 'IGNORED', 'REVERSED')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (leave_request_id) REFERENCES leave_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (leave_type_id) REFERENCES leave_types(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_leave_payroll_impacts_request ON leave_payroll_impacts(leave_request_id);

CREATE TABLE IF NOT EXISTS attendance_day_overrides (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  override_date TEXT NOT NULL,
  day_type TEXT NOT NULL CHECK (day_type IN ('WORKING_DAY', 'WEEKLY_OFF', 'PUBLIC_HOLIDAY', 'HALF_DAY', 'CUSTOM')),
  affects_leave_calculation INTEGER NOT NULL DEFAULT 1 CHECK (affects_leave_calculation IN (0, 1)),
  leave_count_multiplier REAL,
  reason TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (employee_id, override_date),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_attendance_day_overrides_employee_date ON attendance_day_overrides(employee_id, override_date);

CREATE TABLE IF NOT EXISTS leave_settings (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value_json TEXT,
  description TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS attendance_devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  device_code TEXT NOT NULL UNIQUE,
  location_id TEXT,
  vendor TEXT NOT NULL DEFAULT 'ZKTECO' CHECK (vendor IN ('ZKTECO', 'ZKTIME', 'ZKBIO_TIME', 'MANUAL_IMPORT', 'GENERIC_API', 'OTHER')),
  model TEXT,
  type TEXT NOT NULL DEFAULT 'BIOMETRIC' CHECK (type IN ('BIOMETRIC', 'MANUAL_IMPORT', 'API', 'BRIDGE', 'PUSH_ADMS', 'OTHER')),
  ip_address TEXT,
  port INTEGER,
  serial_number TEXT,
  timezone TEXT,
  device_mode TEXT NOT NULL DEFAULT 'CSV_IMPORT' CHECK (device_mode IN ('CSV_IMPORT', 'LOCAL_BRIDGE', 'PUSH_ADMS', 'API_PLACEHOLDER', 'MANUAL')),
  direction_mode TEXT NOT NULL DEFAULT 'IN_OUT' CHECK (direction_mode IN ('IN_OUT', 'AUTO_PAIR', 'PUNCH_STATE', 'UNKNOWN')),
  bridge_token_hash TEXT,
  adms_device_key TEXT,
  external_device_id TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'DISABLED', 'ARCHIVED')),
  health_status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (health_status IN ('UNKNOWN', 'ONLINE', 'OFFLINE', 'WARNING', 'ERROR')),
  last_sync_at TEXT,
  last_seen_at TEXT,
  last_error_at TEXT,
  last_error_message TEXT,
  sync_enabled INTEGER NOT NULL DEFAULT 0 CHECK (sync_enabled IN (0, 1)),
  allow_csv_import INTEGER NOT NULL DEFAULT 1 CHECK (allow_csv_import IN (0, 1)),
  allow_bridge_import INTEGER NOT NULL DEFAULT 0 CHECK (allow_bridge_import IN (0, 1)),
  allow_push_adms INTEGER NOT NULL DEFAULT 0 CHECK (allow_push_adms IN (0, 1)),
  notes TEXT,
  archived_at TEXT,
  archived_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
  FOREIGN KEY (archived_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_attendance_devices_status ON attendance_devices(status);
CREATE INDEX IF NOT EXISTS idx_attendance_devices_location ON attendance_devices(location_id);

CREATE TABLE IF NOT EXISTS attendance_status_types (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  color_label TEXT,
  counts_as_present INTEGER NOT NULL DEFAULT 0 CHECK (counts_as_present IN (0, 1)),
  counts_as_absent INTEGER NOT NULL DEFAULT 0 CHECK (counts_as_absent IN (0, 1)),
  affects_payroll INTEGER NOT NULL DEFAULT 0 CHECK (affects_payroll IN (0, 1)),
  is_system INTEGER NOT NULL DEFAULT 1 CHECK (is_system IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS attendance_raw_logs (
  id TEXT PRIMARY KEY,
  device_id TEXT,
  attendance_device_id TEXT,
  import_batch_id TEXT,
  employee_id TEXT,
  biometric_mapping_id TEXT,
  external_employee_code TEXT,
  biometric_user_id TEXT,
  punch_time TEXT NOT NULL,
  punch_date TEXT,
  punch_type TEXT DEFAULT 'UNKNOWN' CHECK (punch_type IN ('IN', 'OUT', 'BREAK_IN', 'BREAK_OUT', 'UNKNOWN') OR punch_type IS NULL),
  punch_state TEXT,
  source TEXT NOT NULL DEFAULT 'DEVICE' CHECK (source IN ('DEVICE', 'MANUAL_IMPORT', 'CSV_IMPORT', 'API', 'BRIDGE', 'PUSH_ADMS')),
  origin TEXT NOT NULL DEFAULT 'DEVICE' CHECK (origin IN ('CSV_IMPORT', 'LOCAL_BRIDGE', 'PUSH_ADMS', 'MANUAL', 'API', 'DEVICE')),
  process_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (process_status IN ('PENDING', 'MATCHED', 'UNMATCHED', 'DUPLICATE', 'ERROR', 'NORMALIZED', 'IGNORED', 'LOCKED_WARNING')),
  duplicate_hash TEXT,
  is_duplicate INTEGER NOT NULL DEFAULT 0 CHECK (is_duplicate IN (0, 1)),
  is_manual_entry INTEGER NOT NULL DEFAULT 0 CHECK (is_manual_entry IN (0, 1)),
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  locked_day_warning_id TEXT,
  error_message TEXT,
  normalized_at TEXT,
  raw_payload_json TEXT,
  imported_by_user_id TEXT,
  imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (device_id) REFERENCES attendance_devices(id) ON DELETE SET NULL,
  FOREIGN KEY (attendance_device_id) REFERENCES attendance_devices(id) ON DELETE SET NULL,
  FOREIGN KEY (import_batch_id) REFERENCES attendance_import_batches(id) ON DELETE SET NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL,
  FOREIGN KEY (biometric_mapping_id) REFERENCES employee_biometric_mappings(id) ON DELETE SET NULL,
  FOREIGN KEY (imported_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_raw_logs_dedupe ON attendance_raw_logs(COALESCE(device_id, ''), COALESCE(external_employee_code, ''), punch_time, COALESCE(punch_type, 'UNKNOWN'));
CREATE INDEX IF NOT EXISTS idx_attendance_raw_logs_employee_time ON attendance_raw_logs(employee_id, punch_time);
CREATE INDEX IF NOT EXISTS idx_attendance_raw_logs_device_time ON attendance_raw_logs(device_id, punch_time);
CREATE INDEX IF NOT EXISTS idx_attendance_raw_logs_batch ON attendance_raw_logs(import_batch_id, process_status);
CREATE INDEX IF NOT EXISTS idx_attendance_raw_logs_process ON attendance_raw_logs(process_status, punch_time);
CREATE INDEX IF NOT EXISTS idx_attendance_raw_logs_duplicate_hash ON attendance_raw_logs(duplicate_hash);

CREATE TABLE IF NOT EXISTS attendance_device_settings (
  id TEXT PRIMARY KEY,
  zkteco_csv_import_enabled INTEGER NOT NULL DEFAULT 1 CHECK (zkteco_csv_import_enabled IN (0, 1)),
  zkteco_local_bridge_enabled INTEGER NOT NULL DEFAULT 0 CHECK (zkteco_local_bridge_enabled IN (0, 1)),
  zkteco_push_adms_enabled INTEGER NOT NULL DEFAULT 0 CHECK (zkteco_push_adms_enabled IN (0, 1)),
  auto_match_by_biometric_user_id INTEGER NOT NULL DEFAULT 1 CHECK (auto_match_by_biometric_user_id IN (0, 1)),
  auto_match_by_employee_no INTEGER NOT NULL DEFAULT 1 CHECK (auto_match_by_employee_no IN (0, 1)),
  auto_normalize_after_import INTEGER NOT NULL DEFAULT 1 CHECK (auto_normalize_after_import IN (0, 1)),
  prevent_locked_day_overwrite INTEGER NOT NULL DEFAULT 1 CHECK (prevent_locked_day_overwrite IN (0, 1)),
  duplicate_window_seconds INTEGER NOT NULL DEFAULT 60 CHECK (duplicate_window_seconds >= 0),
  default_timezone TEXT,
  csv_allowed_extensions_json TEXT,
  max_import_rows INTEGER NOT NULL DEFAULT 20000 CHECK (max_import_rows > 0),
  bridge_clock_skew_minutes INTEGER NOT NULL DEFAULT 15 CHECK (bridge_clock_skew_minutes >= 0),
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS employee_biometric_mappings (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  attendance_device_id TEXT,
  biometric_user_id TEXT NOT NULL,
  biometric_user_name TEXT,
  external_employee_code TEXT,
  mapping_source TEXT NOT NULL DEFAULT 'MANUAL' CHECK (mapping_source IN ('MANUAL', 'CSV_IMPORT', 'LOCAL_BRIDGE', 'PUSH_ADMS', 'SYSTEM')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  notes TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  archived_at TEXT,
  archived_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (attendance_device_id) REFERENCES attendance_devices(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (archived_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_employee_biometric_mappings_employee ON employee_biometric_mappings(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_employee_biometric_mappings_device_user ON employee_biometric_mappings(attendance_device_id, biometric_user_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_biometric_mappings_active_unique ON employee_biometric_mappings(COALESCE(attendance_device_id, ''), biometric_user_id) WHERE status = 'ACTIVE';

CREATE TABLE IF NOT EXISTS attendance_import_batches (
  id TEXT PRIMARY KEY,
  batch_number TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL CHECK (source IN ('ZKTECO_CSV', 'LOCAL_BRIDGE', 'PUSH_ADMS', 'MANUAL', 'API')),
  attendance_device_id TEXT,
  file_name TEXT,
  file_hash TEXT,
  status TEXT NOT NULL DEFAULT 'UPLOADED' CHECK (status IN ('UPLOADED', 'VALIDATING', 'READY', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED')),
  total_rows INTEGER NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  processed_rows INTEGER NOT NULL DEFAULT 0 CHECK (processed_rows >= 0),
  inserted_rows INTEGER NOT NULL DEFAULT 0 CHECK (inserted_rows >= 0),
  duplicate_rows INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_rows >= 0),
  unmatched_rows INTEGER NOT NULL DEFAULT 0 CHECK (unmatched_rows >= 0),
  error_rows INTEGER NOT NULL DEFAULT 0 CHECK (error_rows >= 0),
  locked_warning_rows INTEGER NOT NULL DEFAULT 0 CHECK (locked_warning_rows >= 0),
  import_options_json TEXT,
  summary_json TEXT,
  uploaded_by_user_id TEXT,
  processed_by_user_id TEXT,
  uploaded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  processed_at TEXT,
  cancelled_at TEXT,
  cancel_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (attendance_device_id) REFERENCES attendance_devices(id) ON DELETE SET NULL,
  FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (processed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_attendance_import_batches_status ON attendance_import_batches(status, uploaded_at);
CREATE INDEX IF NOT EXISTS idx_attendance_import_batches_device ON attendance_import_batches(attendance_device_id, uploaded_at);

CREATE TABLE IF NOT EXISTS attendance_unmatched_logs (
  id TEXT PRIMARY KEY,
  raw_log_id TEXT NOT NULL,
  import_batch_id TEXT,
  attendance_device_id TEXT,
  biometric_user_id TEXT,
  external_employee_code TEXT,
  punch_time TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED', 'IGNORED')),
  resolved_employee_id TEXT,
  resolved_by_user_id TEXT,
  resolved_at TEXT,
  resolution_note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (raw_log_id) REFERENCES attendance_raw_logs(id) ON DELETE CASCADE,
  FOREIGN KEY (import_batch_id) REFERENCES attendance_import_batches(id) ON DELETE SET NULL,
  FOREIGN KEY (attendance_device_id) REFERENCES attendance_devices(id) ON DELETE SET NULL,
  FOREIGN KEY (resolved_employee_id) REFERENCES employees(id) ON DELETE SET NULL,
  FOREIGN KEY (resolved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_attendance_unmatched_logs_status ON attendance_unmatched_logs(status, created_at);

CREATE TABLE IF NOT EXISTS attendance_locked_day_import_warnings (
  id TEXT PRIMARY KEY,
  raw_log_id TEXT,
  import_batch_id TEXT,
  employee_id TEXT,
  attendance_date TEXT NOT NULL,
  warning_type TEXT NOT NULL DEFAULT 'LOCKED_FOR_PAYROLL' CHECK (warning_type IN ('LOCKED_FOR_PAYROLL', 'PAYROLL_FINALIZED', 'MANUAL_REVIEW_REQUIRED')),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED', 'DISMISSED')),
  resolution_note TEXT,
  resolved_by_user_id TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (raw_log_id) REFERENCES attendance_raw_logs(id) ON DELETE SET NULL,
  FOREIGN KEY (import_batch_id) REFERENCES attendance_import_batches(id) ON DELETE SET NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL,
  FOREIGN KEY (resolved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_attendance_locked_warnings_status ON attendance_locked_day_import_warnings(status, attendance_date);

CREATE TABLE IF NOT EXISTS attendance_import_row_errors (
  id TEXT PRIMARY KEY,
  import_batch_id TEXT NOT NULL,
  row_number INTEGER,
  error_code TEXT NOT NULL,
  error_message TEXT NOT NULL,
  row_payload_json TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED', 'IGNORED')),
  resolved_by_user_id TEXT,
  resolved_at TEXT,
  resolution_note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (import_batch_id) REFERENCES attendance_import_batches(id) ON DELETE CASCADE,
  FOREIGN KEY (resolved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_attendance_import_row_errors_batch ON attendance_import_row_errors(import_batch_id, status);

CREATE TABLE IF NOT EXISTS attendance_vendor_integrations (
  id TEXT PRIMARY KEY,
  vendor TEXT NOT NULL CHECK (vendor IN ('ZKTECO', 'ZKTIME', 'ZKBIO_TIME', 'OTHER')),
  integration_type TEXT NOT NULL CHECK (integration_type IN ('CSV_IMPORT', 'LOCAL_BRIDGE', 'PUSH_ADMS', 'API_PLACEHOLDER')),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'INACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'DISABLED')),
  config_json TEXT,
  last_test_at TEXT,
  last_test_status TEXT,
  last_test_message TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS attendance_logs (
  id TEXT PRIMARY KEY,
  employee_id TEXT,
  device_id TEXT,
  external_employee_code TEXT,
  log_time TEXT NOT NULL,
  log_type TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (log_type IN ('IN', 'OUT', 'BREAK_IN', 'BREAK_OUT', 'UNKNOWN')),
  source TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('DEVICE', 'MANUAL', 'MANUAL_IMPORT', 'API', 'BRIDGE')),
  attendance_date TEXT NOT NULL,
  notes TEXT,
  raw_payload_json TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  archived_by_user_id TEXT,
  archived_at TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL,
  FOREIGN KEY (device_id) REFERENCES attendance_devices(id) ON DELETE SET NULL,
  FOREIGN KEY (archived_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_attendance_logs_employee_date ON attendance_logs(employee_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_log_time ON attendance_logs(log_time);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_archived ON attendance_logs(is_archived, attendance_date);

CREATE TABLE IF NOT EXISTS attendance_daily_records (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  attendance_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PRESENT', 'ABSENT', 'LATE', 'EARLY_LEAVE', 'HALF_DAY', 'LEAVE', 'SICK_LEAVE', 'LONG_LEAVE', 'DAY_OFF', 'PUBLIC_HOLIDAY', 'MISSING_PUNCH', 'PENDING_CORRECTION', 'CORRECTED', 'SICK', 'OFF_DAY', 'HOLIDAY')),
  calculated_status TEXT CHECK (calculated_status IN ('PRESENT', 'ABSENT', 'LATE', 'EARLY_LEAVE', 'HALF_DAY', 'LEAVE', 'SICK_LEAVE', 'LONG_LEAVE', 'DAY_OFF', 'PUBLIC_HOLIDAY', 'MISSING_PUNCH', 'PENDING_CORRECTION', 'CORRECTED', 'SICK', 'OFF_DAY', 'HOLIDAY') OR calculated_status IS NULL),
  final_status TEXT CHECK (final_status IN ('PRESENT', 'ABSENT', 'LATE', 'EARLY_LEAVE', 'HALF_DAY', 'LEAVE', 'SICK_LEAVE', 'LONG_LEAVE', 'DAY_OFF', 'PUBLIC_HOLIDAY', 'MISSING_PUNCH', 'PENDING_CORRECTION', 'CORRECTED', 'SICK', 'OFF_DAY', 'HOLIDAY') OR final_status IS NULL),
  first_clock_in TEXT,
  last_clock_out TEXT,
  total_work_minutes INTEGER CHECK (total_work_minutes IS NULL OR total_work_minutes >= 0),
  late_minutes INTEGER CHECK (late_minutes IS NULL OR late_minutes >= 0),
  early_checkout_minutes INTEGER CHECK (early_checkout_minutes IS NULL OR early_checkout_minutes >= 0),
  missed_punch INTEGER NOT NULL DEFAULT 0 CHECK (missed_punch IN (0, 1)),
  missing_clock_in INTEGER NOT NULL DEFAULT 0 CHECK (missing_clock_in IN (0, 1)),
  missing_clock_out INTEGER NOT NULL DEFAULT 0 CHECK (missing_clock_out IN (0, 1)),
  is_absent INTEGER NOT NULL DEFAULT 0 CHECK (is_absent IN (0, 1)),
  is_late INTEGER NOT NULL DEFAULT 0 CHECK (is_late IN (0, 1)),
  is_early_leave INTEGER NOT NULL DEFAULT 0 CHECK (is_early_leave IN (0, 1)),
  is_half_day INTEGER NOT NULL DEFAULT 0 CHECK (is_half_day IN (0, 1)),
  is_leave_day INTEGER NOT NULL DEFAULT 0 CHECK (is_leave_day IN (0, 1)),
  is_public_holiday INTEGER NOT NULL DEFAULT 0 CHECK (is_public_holiday IN (0, 1)),
  is_day_off INTEGER NOT NULL DEFAULT 0 CHECK (is_day_off IN (0, 1)),
  source TEXT NOT NULL DEFAULT 'SYSTEM' CHECK (source IN ('DEVICE', 'MANUAL', 'CORRECTION', 'LEAVE', 'ROSTER', 'SYSTEM')),
  payroll_impact_json TEXT,
  payroll_impact_status TEXT,
  payroll_impact_minutes INTEGER,
  payroll_impact_days REAL,
  payroll_impact_reason TEXT,
  leave_request_id TEXT,
  roster_assignment_id TEXT,
  roster_shift_id TEXT,
  correction_status TEXT CHECK (correction_status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') OR correction_status IS NULL),
  locked_for_payroll INTEGER NOT NULL DEFAULT 0 CHECK (locked_for_payroll IN (0, 1)),
  generated_by TEXT,
  generated_at TEXT,
  metadata_json TEXT,
  notes TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (employee_id, attendance_date),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (leave_request_id) REFERENCES leave_requests(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_attendance_daily_employee_date ON attendance_daily_records(employee_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_daily_status_date ON attendance_daily_records(status, attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_daily_flags ON attendance_daily_records(missed_punch, late_minutes, early_checkout_minutes);

CREATE TABLE IF NOT EXISTS attendance_correction_requests (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  attendance_date TEXT NOT NULL,
  current_record_id TEXT,
  request_type TEXT NOT NULL DEFAULT 'OTHER',
  current_values_json TEXT,
  requested_values_json TEXT,
  requested_clock_in TEXT,
  requested_clock_out TEXT,
  requested_status TEXT CHECK (requested_status IN ('PRESENT', 'ABSENT', 'LATE', 'EARLY_LEAVE', 'HALF_DAY', 'LEAVE', 'SICK_LEAVE', 'LONG_LEAVE', 'DAY_OFF', 'PUBLIC_HOLIDAY', 'MISSING_PUNCH', 'PENDING_CORRECTION', 'CORRECTED', 'SICK', 'OFF_DAY', 'HOLIDAY') OR requested_status IS NULL),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED')),
  requested_by_user_id TEXT NOT NULL,
  reviewed_by_user_id TEXT,
  reviewer_user_id TEXT,
  reviewed_at TEXT,
  review_note TEXT,
  reviewer_note TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (current_record_id) REFERENCES attendance_daily_records(id) ON DELETE SET NULL,
  FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_attendance_corrections_employee_date ON attendance_correction_requests(employee_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_corrections_status ON attendance_correction_requests(status, created_at);

CREATE TABLE IF NOT EXISTS attendance_settings (
  id TEXT PRIMARY KEY,
  module_enabled INTEGER NOT NULL DEFAULT 1 CHECK (module_enabled IN (0, 1)),
  default_workday_mode TEXT NOT NULL DEFAULT 'FIXED_SHIFT' CHECK (default_workday_mode IN ('FIXED_SHIFT', 'ROSTER_BASED', 'FLEXIBLE')),
  standard_work_minutes_per_day INTEGER NOT NULL DEFAULT 480 CHECK (standard_work_minutes_per_day >= 0),
  default_shift_start_time TEXT,
  default_shift_end_time TEXT,
  late_grace_minutes INTEGER NOT NULL DEFAULT 10 CHECK (late_grace_minutes >= 0),
  early_checkout_grace_minutes INTEGER NOT NULL DEFAULT 10 CHECK (early_checkout_grace_minutes >= 0),
  weekly_off_days_json TEXT,
  mark_absent_if_no_punch INTEGER NOT NULL DEFAULT 1 CHECK (mark_absent_if_no_punch IN (0, 1)),
  missed_punch_requires_correction INTEGER NOT NULL DEFAULT 1 CHECK (missed_punch_requires_correction IN (0, 1)),
  allow_manual_entries INTEGER NOT NULL DEFAULT 1 CHECK (allow_manual_entries IN (0, 1)),
  require_reason_for_manual_entries INTEGER NOT NULL DEFAULT 1 CHECK (require_reason_for_manual_entries IN (0, 1)),
  allow_employee_correction_requests INTEGER NOT NULL DEFAULT 1 CHECK (allow_employee_correction_requests IN (0, 1)),
  manual_entry_requires_approval INTEGER NOT NULL DEFAULT 0 CHECK (manual_entry_requires_approval IN (0, 1)),
  correction_requires_approval INTEGER NOT NULL DEFAULT 1 CHECK (correction_requires_approval IN (0, 1)),
  payroll_impact_enabled INTEGER NOT NULL DEFAULT 0 CHECK (payroll_impact_enabled IN (0, 1)),
  default_attendance_source TEXT NOT NULL DEFAULT 'MANUAL' CHECK (default_attendance_source IN ('DEVICE', 'MANUAL', 'MANUAL_IMPORT', 'API', 'BRIDGE')),
  allow_manager_team_corrections INTEGER NOT NULL DEFAULT 1 CHECK (allow_manager_team_corrections IN (0, 1)),
  require_reason_for_correction_review INTEGER NOT NULL DEFAULT 1 CHECK (require_reason_for_correction_review IN (0, 1)),
  overtime_tracking_enabled INTEGER NOT NULL DEFAULT 0 CHECK (overtime_tracking_enabled IN (0, 1)),
  lock_after_payroll_finalized INTEGER NOT NULL DEFAULT 1 CHECK (lock_after_payroll_finalized IN (0, 1)),
  monthly_attendance_lock_day INTEGER CHECK (monthly_attendance_lock_day IS NULL OR (monthly_attendance_lock_day >= 1 AND monthly_attendance_lock_day <= 31)),
  default_absent_status TEXT NOT NULL DEFAULT 'ABSENT' CHECK (default_absent_status IN ('ABSENT', 'MISSING_PUNCH', 'PENDING_CORRECTION')),
  attendance_source_options_json TEXT,
  roster_integration_mode TEXT NOT NULL DEFAULT 'PLACEHOLDER' CHECK (roster_integration_mode IN ('PLACEHOLDER', 'ROSTER_REQUIRED', 'ROSTER_OPTIONAL')),
  public_holiday_integration_mode TEXT NOT NULL DEFAULT 'DAY_OVERRIDES' CHECK (public_holiday_integration_mode IN ('DAY_OVERRIDES', 'EXTERNAL_CALENDAR')),
  absent_deduction_enabled INTEGER NOT NULL DEFAULT 1 CHECK (absent_deduction_enabled IN (0, 1)),
  late_deduction_enabled INTEGER NOT NULL DEFAULT 0 CHECK (late_deduction_enabled IN (0, 1)),
  early_leave_deduction_enabled INTEGER NOT NULL DEFAULT 0 CHECK (early_leave_deduction_enabled IN (0, 1)),
  payroll_deduction_enabled INTEGER NOT NULL DEFAULT 0 CHECK (payroll_deduction_enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS attendance_report_exports (
  id TEXT PRIMARY KEY,
  report_type TEXT NOT NULL,
  filters_json TEXT,
  exported_by_user_id TEXT,
  exported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (exported_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS shift_templates (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  break_minutes INTEGER NOT NULL DEFAULT 0 CHECK (break_minutes >= 0),
  total_work_minutes INTEGER CHECK (total_work_minutes IS NULL OR total_work_minutes >= 0),
  expected_work_minutes INTEGER CHECK (expected_work_minutes IS NULL OR expected_work_minutes >= 0),
  default_worksite_location_id TEXT,
  department_id TEXT,
  color_label TEXT,
  badge_color TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  is_overnight INTEGER NOT NULL DEFAULT 0 CHECK (is_overnight IN (0, 1)),
  is_day_off_template INTEGER NOT NULL DEFAULT 0 CHECK (is_day_off_template IN (0, 1)),
  is_public_holiday_work_template INTEGER NOT NULL DEFAULT 0 CHECK (is_public_holiday_work_template IN (0, 1)),
  payroll_impact_placeholder_json TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  archived_by_user_id TEXT,
  archived_at TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (default_worksite_location_id) REFERENCES locations(id) ON DELETE SET NULL,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (archived_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_shift_templates_active_sort ON shift_templates(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_shift_templates_status_sort ON shift_templates(status, sort_order);
CREATE INDEX IF NOT EXISTS idx_shift_templates_location_department ON shift_templates(default_worksite_location_id, department_id);

CREATE TABLE IF NOT EXISTS roster_periods (
  id TEXT PRIMARY KEY,
  location_id TEXT,
  department_id TEXT,
  period_start_date TEXT,
  period_end_date TEXT,
  week_start_date TEXT NOT NULL,
  week_end_date TEXT NOT NULL,
  week_label TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'LOCKED', 'ARCHIVED')),
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  published_by_user_id TEXT,
  published_at TEXT,
  unpublished_by_user_id TEXT,
  unpublished_at TEXT,
  locked_by_user_id TEXT,
  locked_at TEXT,
  archived_by_user_id TEXT,
  archived_at TEXT,
  notes TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (published_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (unpublished_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (locked_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (archived_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_roster_periods_active_unique
ON roster_periods(week_start_date, COALESCE(location_id, ''), COALESCE(department_id, ''))
WHERE status IN ('DRAFT', 'PUBLISHED', 'LOCKED');
CREATE INDEX IF NOT EXISTS idx_roster_periods_week_status ON roster_periods(week_start_date, status);
CREATE INDEX IF NOT EXISTS idx_roster_periods_scope_status ON roster_periods(location_id, department_id, status);

CREATE TABLE IF NOT EXISTS roster_assignments (
  id TEXT PRIMARY KEY,
  roster_period_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  roster_date TEXT NOT NULL,
  assignment_date TEXT,
  shift_template_id TEXT,
  custom_start_time TEXT,
  custom_end_time TEXT,
  custom_break_minutes INTEGER CHECK (custom_break_minutes IS NULL OR custom_break_minutes >= 0),
  break_minutes INTEGER CHECK (break_minutes IS NULL OR break_minutes >= 0),
  expected_work_minutes INTEGER CHECK (expected_work_minutes IS NULL OR expected_work_minutes >= 0),
  location_id TEXT,
  department_id TEXT,
  status TEXT NOT NULL DEFAULT 'UNASSIGNED' CHECK (status IN ('SCHEDULED', 'OFF', 'LEAVE', 'ABSENT_PLACEHOLDER', 'UNASSIGNED', 'DRAFT', 'PUBLISHED', 'CHANGED_AFTER_PUBLISH', 'CANCELLED', 'DAY_OFF', 'SICK_LEAVE', 'LONG_LEAVE', 'PUBLIC_HOLIDAY', 'CONFLICT')),
  assignment_type TEXT NOT NULL DEFAULT 'SHIFT' CHECK (assignment_type IN ('SHIFT', 'DAY_OFF', 'LEAVE_PLACEHOLDER', 'PUBLIC_HOLIDAY_WORK', 'CUSTOM_SHIFT')),
  notes TEXT,
  conflict_status TEXT,
  conflict_reason TEXT,
  changed_after_publish INTEGER NOT NULL DEFAULT 0 CHECK (changed_after_publish IN (0, 1)),
  change_reason TEXT,
  published_snapshot_json TEXT,
  source TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'COPIED', 'LEAVE_SYNC', 'SYSTEM')),
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  cancelled_by_user_id TEXT,
  cancelled_at TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (employee_id, roster_date),
  FOREIGN KEY (roster_period_id) REFERENCES roster_periods(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (shift_template_id) REFERENCES shift_templates(id) ON DELETE SET NULL,
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (cancelled_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_roster_assignments_period ON roster_assignments(roster_period_id, roster_date);
CREATE INDEX IF NOT EXISTS idx_roster_assignments_employee_date ON roster_assignments(employee_id, roster_date);
CREATE INDEX IF NOT EXISTS idx_roster_assignments_status ON roster_assignments(status, roster_date);
CREATE INDEX IF NOT EXISTS idx_roster_assignments_scope ON roster_assignments(location_id, department_id, roster_date);
CREATE INDEX IF NOT EXISTS idx_roster_assignments_shift_template ON roster_assignments(shift_template_id);

CREATE TABLE IF NOT EXISTS roster_assignment_history (
  id TEXT PRIMARY KEY,
  roster_assignment_id TEXT,
  employee_id TEXT NOT NULL,
  roster_date TEXT NOT NULL,
  old_value_json TEXT,
  new_value_json TEXT,
  change_reason TEXT,
  changed_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (roster_assignment_id) REFERENCES roster_assignments(id) ON DELETE SET NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_roster_assignment_history_employee ON roster_assignment_history(employee_id, roster_date);

CREATE TABLE IF NOT EXISTS roster_settings (
  id TEXT PRIMARY KEY,
  module_enabled INTEGER NOT NULL DEFAULT 1 CHECK (module_enabled IN (0, 1)),
  default_week_start_day TEXT NOT NULL DEFAULT 'MONDAY' CHECK (default_week_start_day IN ('MONDAY', 'SUNDAY')),
  roster_period_mode TEXT NOT NULL DEFAULT 'WEEKLY' CHECK (roster_period_mode IN ('WEEKLY')),
  allow_draft_roster_editing INTEGER NOT NULL DEFAULT 1 CHECK (allow_draft_roster_editing IN (0, 1)),
  require_publish_before_employee_visibility INTEGER NOT NULL DEFAULT 1 CHECK (require_publish_before_employee_visibility IN (0, 1)),
  allow_unpublish_before_lock INTEGER NOT NULL DEFAULT 1 CHECK (allow_unpublish_before_lock IN (0, 1)),
  allow_changes_after_publish INTEGER NOT NULL DEFAULT 1 CHECK (allow_changes_after_publish IN (0, 1)),
  require_reason_for_changes_after_publish INTEGER NOT NULL DEFAULT 1 CHECK (require_reason_for_changes_after_publish IN (0, 1)),
  allow_roster_lock INTEGER NOT NULL DEFAULT 1 CHECK (allow_roster_lock IN (0, 1)),
  lock_roster_after_attendance_payroll_placeholder INTEGER NOT NULL DEFAULT 0 CHECK (lock_roster_after_attendance_payroll_placeholder IN (0, 1)),
  allow_shift_overlap_warnings INTEGER NOT NULL DEFAULT 1 CHECK (allow_shift_overlap_warnings IN (0, 1)),
  block_overlapping_shifts_by_default INTEGER NOT NULL DEFAULT 1 CHECK (block_overlapping_shifts_by_default IN (0, 1)),
  allow_cross_worksite_assignment_with_permission INTEGER NOT NULL DEFAULT 1 CHECK (allow_cross_worksite_assignment_with_permission IN (0, 1)),
  roster_aware_attendance_enabled INTEGER NOT NULL DEFAULT 1 CHECK (roster_aware_attendance_enabled IN (0, 1)),
  roster_aware_leave_counting_enabled INTEGER NOT NULL DEFAULT 1 CHECK (roster_aware_leave_counting_enabled IN (0, 1)),
  default_off_day_handling_mode TEXT NOT NULL DEFAULT 'EXPLICIT_ONLY',
  public_holiday_work_assignment_mode TEXT NOT NULL DEFAULT 'ALLOW_EXPLICIT_SHIFT',
  employee_self_service_roster_visibility_enabled INTEGER NOT NULL DEFAULT 1 CHECK (employee_self_service_roster_visibility_enabled IN (0, 1)),
  manager_team_roster_visibility_enabled INTEGER NOT NULL DEFAULT 1 CHECK (manager_team_roster_visibility_enabled IN (0, 1)),
  copy_previous_week_enabled INTEGER NOT NULL DEFAULT 1 CHECK (copy_previous_week_enabled IN (0, 1)),
  bulk_assignment_enabled INTEGER NOT NULL DEFAULT 1 CHECK (bulk_assignment_enabled IN (0, 1)),
  default_break_minutes INTEGER NOT NULL DEFAULT 60 CHECK (default_break_minutes >= 0),
  default_expected_work_minutes INTEGER NOT NULL DEFAULT 480 CHECK (default_expected_work_minutes >= 0),
  allow_published_roster_edits INTEGER NOT NULL DEFAULT 1 CHECK (allow_published_roster_edits IN (0, 1)),
  require_reason_for_published_edits INTEGER NOT NULL DEFAULT 1 CHECK (require_reason_for_published_edits IN (0, 1)),
  show_leave_on_roster INTEGER NOT NULL DEFAULT 1 CHECK (show_leave_on_roster IN (0, 1)),
  show_attendance_on_roster INTEGER NOT NULL DEFAULT 1 CHECK (show_attendance_on_roster IN (0, 1)),
  default_shift_template_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (default_shift_template_id) REFERENCES shift_templates(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS weekly_off_rules (
  id TEXT PRIMARY KEY,
  location_id TEXT,
  department_id TEXT,
  day_of_week TEXT NOT NULL CHECK (day_of_week IN ('SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_weekly_off_rules_scope ON weekly_off_rules(COALESCE(location_id, ''), COALESCE(department_id, ''), is_active);

CREATE TABLE IF NOT EXISTS roster_report_exports (
  id TEXT PRIMARY KEY,
  report_type TEXT NOT NULL,
  filters_json TEXT,
  exported_by_user_id TEXT,
  exported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (exported_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Payroll Core
CREATE TABLE IF NOT EXISTS payroll_components (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('EARNING', 'DEDUCTION', 'BASIC_SALARY', 'ALLOWANCE', 'FIXED_DEDUCTION', 'VARIABLE_DEDUCTION', 'ATTENDANCE_DEDUCTION', 'LEAVE_DEDUCTION', 'ADVANCE_DEDUCTION', 'ONE_TIME_DEDUCTION', 'OVERTIME_PLACEHOLDER', 'BENEFIT_PLACEHOLDER', 'ADJUSTMENT')),
  category TEXT CHECK (category IN ('BASIC', 'ALLOWANCE', 'BENEFIT', 'OVERTIME', 'ADVANCE', 'ATTENDANCE', 'LEAVE', 'OTHER', 'SALARY', 'DEDUCTION', 'ADJUSTMENT')),
  calculation_type TEXT NOT NULL CHECK (calculation_type IN ('FIXED', 'VARIABLE', 'PERCENTAGE', 'FIXED_AMOUNT', 'PERCENTAGE_OF_BASIC', 'PERCENTAGE_OF_GROSS', 'DAILY_RATE', 'HOURLY_RATE', 'FORMULA_PLACEHOLDER', 'MANUAL')),
  default_amount REAL,
  default_percentage REAL,
  applies_to_basic_salary INTEGER NOT NULL DEFAULT 0 CHECK (applies_to_basic_salary IN (0, 1)),
  is_taxable INTEGER CHECK (is_taxable IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (default_amount IS NULL OR default_amount >= 0),
  CHECK (default_percentage IS NULL OR default_percentage >= 0)
);

CREATE TABLE IF NOT EXISTS payroll_settings (
  id TEXT PRIMARY KEY,
  module_enabled INTEGER NOT NULL DEFAULT 1 CHECK (module_enabled IN (0, 1)),
  default_currency TEXT NOT NULL DEFAULT 'MVR',
  default_daily_rate_mode TEXT NOT NULL DEFAULT 'FIXED_30_DAYS' CHECK (default_daily_rate_mode IN ('CALENDAR_DAYS', 'WORKING_DAYS', 'FIXED_30_DAYS')),
  allow_negative_net_salary INTEGER NOT NULL DEFAULT 0 CHECK (allow_negative_net_salary IN (0, 1)),
  require_approval_before_paid INTEGER NOT NULL DEFAULT 1 CHECK (require_approval_before_paid IN (0, 1)),
  include_attendance_deductions INTEGER NOT NULL DEFAULT 1 CHECK (include_attendance_deductions IN (0, 1)),
  include_leave_deductions INTEGER NOT NULL DEFAULT 1 CHECK (include_leave_deductions IN (0, 1)),
  include_advance_deductions INTEGER NOT NULL DEFAULT 1 CHECK (include_advance_deductions IN (0, 1)),
  include_roster_scheduled_days INTEGER NOT NULL DEFAULT 1 CHECK (include_roster_scheduled_days IN (0, 1)),
  default_salary_payment_day INTEGER CHECK (default_salary_payment_day BETWEEN 1 AND 31),
  payslips_enabled INTEGER NOT NULL DEFAULT 1 CHECK (payslips_enabled IN (0, 1)),
  payment_register_enabled INTEGER NOT NULL DEFAULT 1 CHECK (payment_register_enabled IN (0, 1)),
  payment_methods_enabled INTEGER NOT NULL DEFAULT 1 CHECK (payment_methods_enabled IN (0, 1)),
  payment_institutions_enabled INTEGER NOT NULL DEFAULT 1 CHECK (payment_institutions_enabled IN (0, 1)),
  employee_advances_enabled INTEGER NOT NULL DEFAULT 1 CHECK (employee_advances_enabled IN (0, 1)),
  payroll_adjustments_enabled INTEGER NOT NULL DEFAULT 1 CHECK (payroll_adjustments_enabled IN (0, 1)),
  payroll_reports_enabled INTEGER NOT NULL DEFAULT 1 CHECK (payroll_reports_enabled IN (0, 1)),
  bank_loan_deductions_enabled INTEGER NOT NULL DEFAULT 1 CHECK (bank_loan_deductions_enabled IN (0, 1)),
  allow_multiple_bank_loans_per_employee INTEGER NOT NULL DEFAULT 1 CHECK (allow_multiple_bank_loans_per_employee IN (0, 1)),
  require_loan_approval_before_payroll_deduction INTEGER NOT NULL DEFAULT 1 CHECK (require_loan_approval_before_payroll_deduction IN (0, 1)),
  loan_deduction_priority INTEGER NOT NULL DEFAULT 2,
  allow_partial_loan_deduction INTEGER NOT NULL DEFAULT 1 CHECK (allow_partial_loan_deduction IN (0, 1)),
  block_payroll_if_loan_exceeds_net_salary INTEGER NOT NULL DEFAULT 0 CHECK (block_payroll_if_loan_exceeds_net_salary IN (0, 1)),
  show_loan_details_in_self_service INTEGER NOT NULL DEFAULT 1 CHECK (show_loan_details_in_self_service IN (0, 1)),
  show_loan_details_on_payslip INTEGER NOT NULL DEFAULT 1 CHECK (show_loan_details_on_payslip IN (0, 1)),
  bank_loan_requires_bank_salary_route_default INTEGER NOT NULL DEFAULT 1 CHECK (bank_loan_requires_bank_salary_route_default IN (0, 1)),
  bank_loan_cash_salary_default_ineligible INTEGER NOT NULL DEFAULT 1 CHECK (bank_loan_cash_salary_default_ineligible IN (0, 1)),
  bank_loan_statement_months_required_min INTEGER NOT NULL DEFAULT 6,
  bank_loan_statement_months_required_default INTEGER NOT NULL DEFAULT 12,
  bank_loan_salary_slips_months_required_default INTEGER NOT NULL DEFAULT 6,
  bank_loan_allow_cash_employee_override INTEGER NOT NULL DEFAULT 1 CHECK (bank_loan_allow_cash_employee_override IN (0, 1)),
  bank_loan_override_requires_reason INTEGER NOT NULL DEFAULT 1 CHECK (bank_loan_override_requires_reason IN (0, 1)),
  bank_loan_override_requires_document INTEGER NOT NULL DEFAULT 1 CHECK (bank_loan_override_requires_document IN (0, 1)),
  bank_loan_insufficient_salary_mode TEXT NOT NULL DEFAULT 'REQUIRE_OVERRIDE' CHECK (bank_loan_insufficient_salary_mode IN ('WARN_ONLY', 'PARTIAL_DEDUCTION', 'SKIP_AND_MARK_FAILED', 'BLOCK_PAYROLL', 'REQUIRE_OVERRIDE')),
  bank_loan_minimum_net_salary_protection_enabled INTEGER NOT NULL DEFAULT 0 CHECK (bank_loan_minimum_net_salary_protection_enabled IN (0, 1)),
  bank_loan_minimum_net_salary_threshold_type TEXT NOT NULL DEFAULT 'FIXED_AMOUNT' CHECK (bank_loan_minimum_net_salary_threshold_type IN ('PERCENTAGE_OF_NET_SALARY', 'FIXED_AMOUNT')),
  bank_loan_minimum_net_salary_threshold_percentage REAL NOT NULL DEFAULT 0 CHECK (bank_loan_minimum_net_salary_threshold_percentage >= 0),
  bank_loan_minimum_net_salary_threshold_amount REAL NOT NULL DEFAULT 0 CHECK (bank_loan_minimum_net_salary_threshold_amount >= 0),
  bank_loan_skip_if_below_threshold_enabled INTEGER NOT NULL DEFAULT 1 CHECK (bank_loan_skip_if_below_threshold_enabled IN (0, 1)),
  bank_loan_bank_notification_required_on_skip INTEGER NOT NULL DEFAULT 1 CHECK (bank_loan_bank_notification_required_on_skip IN (0, 1)),
  bank_loan_employee_direct_collection_status_enabled INTEGER NOT NULL DEFAULT 1 CHECK (bank_loan_employee_direct_collection_status_enabled IN (0, 1)),
  custom_deductions_enabled INTEGER NOT NULL DEFAULT 1 CHECK (custom_deductions_enabled IN (0, 1)),
  require_custom_deduction_approval INTEGER NOT NULL DEFAULT 1 CHECK (require_custom_deduction_approval IN (0, 1)),
  custom_deduction_show_on_payslip_default INTEGER NOT NULL DEFAULT 1 CHECK (custom_deduction_show_on_payslip_default IN (0, 1)),
  custom_deduction_show_in_self_service_default INTEGER NOT NULL DEFAULT 1 CHECK (custom_deduction_show_in_self_service_default IN (0, 1)),
  custom_deduction_include_in_final_settlement_default INTEGER NOT NULL DEFAULT 1 CHECK (custom_deduction_include_in_final_settlement_default IN (0, 1)),
  custom_deduction_insufficient_salary_mode TEXT NOT NULL DEFAULT 'WARN_ONLY' CHECK (custom_deduction_insufficient_salary_mode IN ('WARN_ONLY', 'PARTIAL_DEDUCTION', 'SKIP_AND_MARK_FAILED', 'BLOCK_PAYROLL', 'REQUIRE_OVERRIDE')),
  custom_deduction_allow_partial_deduction INTEGER NOT NULL DEFAULT 1 CHECK (custom_deduction_allow_partial_deduction IN (0, 1)),
  custom_deduction_shortfall_carry_forward_enabled INTEGER NOT NULL DEFAULT 0 CHECK (custom_deduction_shortfall_carry_forward_enabled IN (0, 1)),
  custom_deduction_priority_default INTEGER NOT NULL DEFAULT 3,
  custom_deduction_require_reason_for_cancel INTEGER NOT NULL DEFAULT 1 CHECK (custom_deduction_require_reason_for_cancel IN (0, 1)),
  custom_deduction_require_document_for_sensitive_categories INTEGER NOT NULL DEFAULT 0 CHECK (custom_deduction_require_document_for_sensitive_categories IN (0, 1)),
  pension_enabled INTEGER NOT NULL DEFAULT 1 CHECK (pension_enabled IN (0, 1)),
  default_pension_scheme_id TEXT,
  pension_auto_calculation_enabled INTEGER NOT NULL DEFAULT 1 CHECK (pension_auto_calculation_enabled IN (0, 1)),
  pension_employee_contribution_default_percent REAL NOT NULL DEFAULT 7 CHECK (pension_employee_contribution_default_percent >= 0),
  pension_employer_contribution_default_percent REAL NOT NULL DEFAULT 7 CHECK (pension_employer_contribution_default_percent >= 0),
  pension_basis_default TEXT NOT NULL DEFAULT 'BASIC_SALARY_ONLY' CHECK (pension_basis_default IN ('BASIC_SALARY_ONLY', 'GROSS_SALARY', 'CUSTOM_FORMULA_PLACEHOLDER')),
  pension_show_on_payslip INTEGER NOT NULL DEFAULT 1 CHECK (pension_show_on_payslip IN (0, 1)),
  pension_show_in_self_service INTEGER NOT NULL DEFAULT 1 CHECK (pension_show_in_self_service IN (0, 1)),
  pension_remittance_enabled INTEGER NOT NULL DEFAULT 1 CHECK (pension_remittance_enabled IN (0, 1)),
  pension_employer_can_pay_employee_share INTEGER NOT NULL DEFAULT 1 CHECK (pension_employer_can_pay_employee_share IN (0, 1)),
  foreign_employee_pension_default_enabled INTEGER NOT NULL DEFAULT 0 CHECK (foreign_employee_pension_default_enabled IN (0, 1)),
  foreign_employee_voluntary_enrollment_enabled INTEGER NOT NULL DEFAULT 1 CHECK (foreign_employee_voluntary_enrollment_enabled IN (0, 1)),
  payroll_deduction_priority_json TEXT NOT NULL DEFAULT '["PENSION_EMPLOYEE_CONTRIBUTION","BANK_LOAN_DEDUCTION","PAYROLL_DEDUCTION","ADVANCE_DEDUCTION","MANUAL_DEDUCTION"]',
  cash_salary_acknowledgement_enabled INTEGER NOT NULL DEFAULT 0 CHECK (cash_salary_acknowledgement_enabled IN (0, 1)),
  cash_salary_acknowledgement_required_before_finalize INTEGER NOT NULL DEFAULT 0 CHECK (cash_salary_acknowledgement_required_before_finalize IN (0, 1)),
  cash_salary_signature_capture_placeholder_enabled INTEGER NOT NULL DEFAULT 0 CHECK (cash_salary_signature_capture_placeholder_enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS employee_payroll_profiles (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL UNIQUE,
  basic_salary REAL NOT NULL DEFAULT 0 CHECK (basic_salary >= 0),
  currency TEXT NOT NULL DEFAULT 'MVR',
  payment_method TEXT NOT NULL DEFAULT 'CASH' CHECK (payment_method IN ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'OTHER')),
  bank_name TEXT,
  bank_account_no TEXT,
  bank_account_name TEXT,
  payroll_included INTEGER NOT NULL DEFAULT 1 CHECK (payroll_included IN (0, 1)),
  overtime_eligible INTEGER NOT NULL DEFAULT 0 CHECK (overtime_eligible IN (0, 1)),
  benefits_eligible INTEGER NOT NULL DEFAULT 0 CHECK (benefits_eligible IN (0, 1)),
  advance_eligible INTEGER NOT NULL DEFAULT 0 CHECK (advance_eligible IN (0, 1)),
  advance_limit_amount REAL CHECK (advance_limit_amount IS NULL OR advance_limit_amount >= 0),
  advance_limit_percent REAL CHECK (advance_limit_percent IS NULL OR advance_limit_percent >= 0),
  missed_day_deduction_enabled INTEGER NOT NULL DEFAULT 1 CHECK (missed_day_deduction_enabled IN (0, 1)),
  leave_deduction_enabled INTEGER NOT NULL DEFAULT 1 CHECK (leave_deduction_enabled IN (0, 1)),
  daily_rate_mode TEXT NOT NULL DEFAULT 'FIXED_30_DAYS' CHECK (daily_rate_mode IN ('CALENDAR_DAYS', 'WORKING_DAYS', 'FIXED_30_DAYS')),
  effective_from TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payment_institutions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'BANK' CHECK (type IN ('BANK', 'WALLET_PROVIDER', 'CASH_LOCATION', 'OTHER')),
  country_code TEXT,
  swift_code TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  display_order INTEGER NOT NULL DEFAULT 100,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  archived_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  archived_at TEXT,
  metadata_json TEXT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (archived_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_institutions_status ON payment_institutions(status, is_active, display_order);

CREATE TABLE IF NOT EXISTS employee_payment_methods (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  payment_method_type TEXT NOT NULL CHECK (payment_method_type IN ('BANK_TRANSFER', 'CASH', 'CHEQUE_PLACEHOLDER', 'MOBILE_WALLET_PLACEHOLDER', 'OTHER')),
  payment_institution_id TEXT,
  bank_name_snapshot TEXT,
  bank_account_name TEXT,
  bank_account_number_encrypted_or_plain_placeholder TEXT,
  bank_account_number_masked TEXT,
  iban_or_swift_placeholder TEXT,
  wallet_provider TEXT,
  wallet_number TEXT,
  cheque_payee_name TEXT,
  cash_collection_location_id TEXT,
  cash_collection_note TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  allocation_type TEXT NOT NULL DEFAULT 'FULL' CHECK (allocation_type IN ('FULL', 'PERCENTAGE', 'FIXED_AMOUNT')),
  allocation_percentage REAL CHECK (allocation_percentage IS NULL OR allocation_percentage >= 0),
  allocation_amount REAL CHECK (allocation_amount IS NULL OR allocation_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'MVR',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK (verification_status IN ('UNVERIFIED', 'VERIFIED', 'REJECTED')),
  effective_date TEXT,
  end_date TEXT,
  notes TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  verified_by_user_id TEXT,
  verified_at TEXT,
  archived_by_user_id TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (payment_institution_id) REFERENCES payment_institutions(id) ON DELETE SET NULL,
  FOREIGN KEY (cash_collection_location_id) REFERENCES locations(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (verified_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (archived_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_employee_payment_methods_employee ON employee_payment_methods(employee_id, status, is_primary);
CREATE INDEX IF NOT EXISTS idx_employee_payment_methods_institution ON employee_payment_methods(payment_institution_id, status);

CREATE TABLE IF NOT EXISTS bank_loan_eligibility_rules (
  id TEXT PRIMARY KEY,
  payment_institution_id TEXT,
  loan_product_name TEXT,
  salary_routing_required INTEGER NOT NULL DEFAULT 1 CHECK (salary_routing_required IN (0, 1)),
  required_statement_months INTEGER,
  required_salary_slip_months INTEGER,
  employer_salary_undertaking_required INTEGER NOT NULL DEFAULT 0 CHECK (employer_salary_undertaking_required IN (0, 1)),
  minimum_employment_months INTEGER,
  bank_instruction_document_required INTEGER NOT NULL DEFAULT 1 CHECK (bank_instruction_document_required IN (0, 1)),
  allowed_employee_types_json TEXT,
  cash_salary_eligibility_rule TEXT NOT NULL DEFAULT 'INELIGIBLE_BY_DEFAULT' CHECK (cash_salary_eligibility_rule IN ('INELIGIBLE_BY_DEFAULT', 'ALLOW_WITH_DOCUMENTS', 'ALLOW_WITH_BANK_CONFIRMATION', 'ALLOW_WITH_OVERRIDE')),
  override_allowed INTEGER NOT NULL DEFAULT 1 CHECK (override_allowed IN (0, 1)),
  override_requires_reason INTEGER NOT NULL DEFAULT 1 CHECK (override_requires_reason IN (0, 1)),
  override_requires_document INTEGER NOT NULL DEFAULT 1 CHECK (override_requires_document IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  effective_from TEXT,
  effective_to TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (payment_institution_id) REFERENCES payment_institutions(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_bank_loan_eligibility_rules_institution ON bank_loan_eligibility_rules(payment_institution_id, status);

CREATE TABLE IF NOT EXISTS employee_bank_loans (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  payment_institution_id TEXT NOT NULL,
  bank_name_snapshot TEXT NOT NULL,
  loan_reference_number TEXT NOT NULL,
  loan_type TEXT NOT NULL DEFAULT 'SALARY_DEDUCTION',
  original_loan_amount REAL CHECK (original_loan_amount IS NULL OR original_loan_amount >= 0),
  outstanding_balance REAL CHECK (outstanding_balance IS NULL OR outstanding_balance >= 0),
  monthly_installment_amount REAL NOT NULL CHECK (monthly_installment_amount >= 0),
  deduction_start_period_id TEXT,
  deduction_start_date TEXT,
  deduction_end_date TEXT,
  remaining_months INTEGER,
  bank_instruction_reference TEXT,
  bank_instruction_document_id TEXT,
  employer_undertaking_required INTEGER NOT NULL DEFAULT 0 CHECK (employer_undertaking_required IN (0, 1)),
  employer_undertaking_document_id TEXT,
  employer_undertaking_reference TEXT,
  employer_undertaking_start_date TEXT,
  employer_undertaking_end_date TEXT,
  employer_undertaking_status TEXT DEFAULT 'NOT_REQUIRED' CHECK (employer_undertaking_status IS NULL OR employer_undertaking_status IN ('NOT_REQUIRED', 'REQUIRED', 'PENDING_DOCUMENT', 'PROVIDED', 'ACTIVE', 'EXPIRED', 'CANCELLED')),
  employer_confirmation_note TEXT,
  salary_routing_commitment_institution_id TEXT,
  salary_routing_commitment_status TEXT DEFAULT 'NOT_REQUIRED' CHECK (salary_routing_commitment_status IS NULL OR salary_routing_commitment_status IN ('NOT_REQUIRED', 'REQUIRED', 'PENDING', 'CONFIRMED', 'WAIVED')),
  salary_routing_confirmed_by_user_id TEXT,
  salary_routing_confirmed_at TEXT,
  source TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'BANK_STATEMENT_IMPORT', 'BANK_INSTRUCTION', 'OTHER')),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED')),
  approval_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED')),
  priority_number INTEGER,
  partial_deduction_allowed INTEGER CHECK (partial_deduction_allowed IS NULL OR partial_deduction_allowed IN (0, 1)),
  salary_payment_method_snapshot TEXT,
  salary_routed_to_bank INTEGER NOT NULL DEFAULT 0 CHECK (salary_routed_to_bank IN (0, 1)),
  bank_statement_months_available INTEGER,
  salary_slips_months_available INTEGER,
  eligibility_status TEXT NOT NULL DEFAULT 'PENDING_DOCUMENTS' CHECK (eligibility_status IN ('ELIGIBLE', 'INELIGIBLE_CASH_SALARY', 'PENDING_DOCUMENTS', 'BANK_CONFIRMED', 'OVERRIDDEN')),
  eligibility_reason TEXT,
  eligibility_document_id TEXT,
  eligibility_checked_by_user_id TEXT,
  eligibility_checked_at TEXT,
  notes TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  approved_by_user_id TEXT,
  approved_at TEXT,
  paused_by_user_id TEXT,
  paused_at TEXT,
  completed_at TEXT,
  cancelled_by_user_id TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (payment_institution_id) REFERENCES payment_institutions(id) ON DELETE RESTRICT,
  FOREIGN KEY (deduction_start_period_id) REFERENCES payroll_periods(id) ON DELETE SET NULL,
  FOREIGN KEY (bank_instruction_document_id) REFERENCES employee_documents(id) ON DELETE SET NULL,
  FOREIGN KEY (employer_undertaking_document_id) REFERENCES employee_documents(id) ON DELETE SET NULL,
  FOREIGN KEY (salary_routing_commitment_institution_id) REFERENCES payment_institutions(id) ON DELETE SET NULL,
  FOREIGN KEY (salary_routing_confirmed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (eligibility_document_id) REFERENCES employee_documents(id) ON DELETE SET NULL,
  FOREIGN KEY (eligibility_checked_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (paused_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (cancelled_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_employee_bank_loans_employee ON employee_bank_loans(employee_id, status, approval_status);
CREATE INDEX IF NOT EXISTS idx_employee_bank_loans_institution ON employee_bank_loans(payment_institution_id, status);

CREATE TABLE IF NOT EXISTS employee_bank_loan_payments (
  id TEXT PRIMARY KEY,
  employee_bank_loan_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  payroll_period_id TEXT NOT NULL,
  payroll_run_id TEXT,
  payroll_employee_result_id TEXT,
  payment_institution_id TEXT NOT NULL,
  bank_name_snapshot TEXT NOT NULL,
  loan_reference_number_snapshot TEXT NOT NULL,
  scheduled_installment_amount REAL NOT NULL DEFAULT 0 CHECK (scheduled_installment_amount >= 0),
  deducted_amount REAL NOT NULL DEFAULT 0 CHECK (deducted_amount >= 0),
  shortfall_amount REAL NOT NULL DEFAULT 0 CHECK (shortfall_amount >= 0),
  carried_forward_amount REAL NOT NULL DEFAULT 0 CHECK (carried_forward_amount >= 0),
  payment_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'DEDUCTED_IN_PAYROLL', 'PREPARED_FOR_BANK', 'MANUALLY_CONFIRMED_PAID_TO_BANK', 'PARTIAL', 'FAILED', 'SKIPPED', 'PENDING_BANK_REVIEW', 'CARRIED_FORWARD', 'MANUALLY_ADJUSTED', 'CANCELLED', 'SKIPPED_MINIMUM_NET_PROTECTION', 'BANK_TO_COLLECT_DIRECTLY_FROM_EMPLOYEE', 'BANK_NOTIFIED', 'BANK_NOTIFICATION_PENDING')),
  minimum_net_salary_threshold_type TEXT CHECK (minimum_net_salary_threshold_type IS NULL OR minimum_net_salary_threshold_type IN ('PERCENTAGE_OF_NET_SALARY', 'FIXED_AMOUNT')),
  minimum_net_salary_threshold_value REAL CHECK (minimum_net_salary_threshold_value IS NULL OR minimum_net_salary_threshold_value >= 0),
  net_salary_before_loan REAL CHECK (net_salary_before_loan IS NULL OR net_salary_before_loan >= 0),
  net_salary_after_attempted_loan REAL,
  skipped_due_to_minimum_net_salary INTEGER NOT NULL DEFAULT 0 CHECK (skipped_due_to_minimum_net_salary IN (0, 1)),
  bank_direct_collection_required INTEGER NOT NULL DEFAULT 0 CHECK (bank_direct_collection_required IN (0, 1)),
  bank_notification_status TEXT CHECK (bank_notification_status IS NULL OR bank_notification_status IN ('BANK_TO_COLLECT_DIRECTLY_FROM_EMPLOYEE', 'BANK_NOTIFIED', 'BANK_NOTIFICATION_PENDING')),
  bank_notification_reference TEXT,
  bank_notification_note TEXT,
  bank_notified_by_user_id TEXT,
  bank_notified_at TEXT,
  remittance_batch_id TEXT,
  remittance_reference TEXT,
  confirmed_by_user_id TEXT,
  confirmed_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  UNIQUE (employee_bank_loan_id, payroll_period_id, payroll_employee_result_id),
  FOREIGN KEY (employee_bank_loan_id) REFERENCES employee_bank_loans(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
  FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE SET NULL,
  FOREIGN KEY (payroll_employee_result_id) REFERENCES payroll_employee_results(id) ON DELETE SET NULL,
  FOREIGN KEY (payment_institution_id) REFERENCES payment_institutions(id) ON DELETE RESTRICT,
  FOREIGN KEY (confirmed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (bank_notified_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_employee_bank_loan_payments_loan ON employee_bank_loan_payments(employee_bank_loan_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_employee_bank_loan_payments_period ON employee_bank_loan_payments(payroll_period_id, payment_institution_id, payment_status);

CREATE TABLE IF NOT EXISTS custom_deduction_templates (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'OTHER',
  deduction_type TEXT NOT NULL CHECK (deduction_type IN ('ONE_TIME', 'RECURRING', 'INSTALLMENT', 'BALANCE_BASED', 'FORMULA_PLACEHOLDER')),
  amount_type TEXT NOT NULL CHECK (amount_type IN ('FIXED_AMOUNT', 'PERCENTAGE_OF_BASIC', 'PERCENTAGE_OF_GROSS', 'CUSTOM_FORMULA_PLACEHOLDER')),
  default_amount REAL CHECK (default_amount IS NULL OR default_amount >= 0),
  default_percentage REAL CHECK (default_percentage IS NULL OR (default_percentage >= 0 AND default_percentage <= 100)),
  default_currency TEXT NOT NULL DEFAULT 'MVR',
  default_installment_count INTEGER CHECK (default_installment_count IS NULL OR default_installment_count > 0),
  default_recurrence_interval TEXT CHECK (default_recurrence_interval IS NULL OR default_recurrence_interval IN ('MONTHLY', 'PAYROLL_PERIOD', 'WEEKLY_PLACEHOLDER', 'CUSTOM_PLACEHOLDER')),
  default_priority_number INTEGER,
  affects_net_salary INTEGER NOT NULL DEFAULT 1 CHECK (affects_net_salary IN (0, 1)),
  show_on_payslip INTEGER NOT NULL DEFAULT 1 CHECK (show_on_payslip IN (0, 1)),
  show_in_self_service INTEGER NOT NULL DEFAULT 1 CHECK (show_in_self_service IN (0, 1)),
  require_employee_acknowledgement_placeholder INTEGER NOT NULL DEFAULT 0 CHECK (require_employee_acknowledgement_placeholder IN (0, 1)),
  require_approval INTEGER NOT NULL DEFAULT 1 CHECK (require_approval IN (0, 1)),
  require_document INTEGER NOT NULL DEFAULT 0 CHECK (require_document IN (0, 1)),
  allow_employee_override_amount INTEGER NOT NULL DEFAULT 1 CHECK (allow_employee_override_amount IN (0, 1)),
  allow_installment_override INTEGER NOT NULL DEFAULT 1 CHECK (allow_installment_override IN (0, 1)),
  allow_pause_resume INTEGER NOT NULL DEFAULT 1 CHECK (allow_pause_resume IN (0, 1)),
  include_in_final_settlement INTEGER NOT NULL DEFAULT 1 CHECK (include_in_final_settlement IN (0, 1)),
  linked_module TEXT NOT NULL DEFAULT 'PAYROLL' CHECK (linked_module IN ('PAYROLL', 'DOCUMENTS', 'ASSETS', 'UNIFORMS', 'DISCIPLINARY_PLACEHOLDER', 'OTHER')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  archived_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  archived_at TEXT,
  metadata_json TEXT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (archived_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_custom_deduction_templates_status_category ON custom_deduction_templates(status, category);

CREATE TABLE IF NOT EXISTS employee_custom_deductions (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  template_code_snapshot TEXT NOT NULL,
  template_name_snapshot TEXT NOT NULL,
  category_snapshot TEXT NOT NULL,
  deduction_type TEXT NOT NULL CHECK (deduction_type IN ('ONE_TIME', 'RECURRING', 'INSTALLMENT', 'BALANCE_BASED', 'FORMULA_PLACEHOLDER')),
  amount_type TEXT NOT NULL CHECK (amount_type IN ('FIXED_AMOUNT', 'PERCENTAGE_OF_BASIC', 'PERCENTAGE_OF_GROSS', 'CUSTOM_FORMULA_PLACEHOLDER')),
  assigned_amount REAL CHECK (assigned_amount IS NULL OR assigned_amount >= 0),
  assigned_percentage REAL CHECK (assigned_percentage IS NULL OR (assigned_percentage >= 0 AND assigned_percentage <= 100)),
  currency TEXT NOT NULL DEFAULT 'MVR',
  total_amount REAL CHECK (total_amount IS NULL OR total_amount >= 0),
  remaining_balance REAL CHECK (remaining_balance IS NULL OR remaining_balance >= 0),
  installment_count INTEGER CHECK (installment_count IS NULL OR installment_count > 0),
  installments_completed INTEGER NOT NULL DEFAULT 0 CHECK (installments_completed >= 0),
  installment_amount REAL CHECK (installment_amount IS NULL OR installment_amount >= 0),
  recurrence_interval TEXT CHECK (recurrence_interval IS NULL OR recurrence_interval IN ('MONTHLY', 'PAYROLL_PERIOD', 'WEEKLY_PLACEHOLDER', 'CUSTOM_PLACEHOLDER')),
  payroll_period_id_start TEXT,
  payroll_period_id_end TEXT,
  start_date TEXT,
  end_date TEXT,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  priority_number INTEGER,
  show_on_payslip INTEGER NOT NULL DEFAULT 1 CHECK (show_on_payslip IN (0, 1)),
  show_in_self_service INTEGER NOT NULL DEFAULT 1 CHECK (show_in_self_service IN (0, 1)),
  include_in_final_settlement INTEGER NOT NULL DEFAULT 1 CHECK (include_in_final_settlement IN (0, 1)),
  approval_status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (approval_status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED')),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED', 'ARCHIVED')),
  source TEXT NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'TEMPLATE', 'ASSET_DAMAGE', 'UNIFORM', 'DOCUMENT', 'DISCIPLINARY_PLACEHOLDER', 'OTHER')),
  source_reference_type TEXT,
  source_reference_id TEXT,
  supporting_document_id TEXT,
  reason TEXT,
  notes TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  approved_by_user_id TEXT,
  approved_at TEXT,
  paused_by_user_id TEXT,
  paused_at TEXT,
  resumed_by_user_id TEXT,
  resumed_at TEXT,
  cancelled_by_user_id TEXT,
  cancelled_at TEXT,
  cancellation_reason TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES custom_deduction_templates(id) ON DELETE RESTRICT,
  FOREIGN KEY (payroll_period_id_start) REFERENCES payroll_periods(id) ON DELETE SET NULL,
  FOREIGN KEY (payroll_period_id_end) REFERENCES payroll_periods(id) ON DELETE SET NULL,
  FOREIGN KEY (supporting_document_id) REFERENCES employee_documents(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (paused_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (resumed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (cancelled_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_employee_custom_deductions_employee ON employee_custom_deductions(employee_id, status, approval_status);
CREATE INDEX IF NOT EXISTS idx_employee_custom_deductions_template ON employee_custom_deductions(template_id, status);

CREATE TABLE IF NOT EXISTS employee_custom_deduction_applications (
  id TEXT PRIMARY KEY,
  employee_custom_deduction_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  payroll_period_id TEXT NOT NULL,
  payroll_run_id TEXT,
  payroll_employee_result_id TEXT,
  scheduled_amount REAL NOT NULL DEFAULT 0 CHECK (scheduled_amount >= 0),
  deducted_amount REAL NOT NULL DEFAULT 0 CHECK (deducted_amount >= 0),
  shortfall_amount REAL NOT NULL DEFAULT 0 CHECK (shortfall_amount >= 0),
  remaining_balance_before REAL CHECK (remaining_balance_before IS NULL OR remaining_balance_before >= 0),
  remaining_balance_after REAL CHECK (remaining_balance_after IS NULL OR remaining_balance_after >= 0),
  installment_number INTEGER,
  application_status TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (application_status IN ('SCHEDULED', 'APPLIED_IN_PAYROLL', 'PARTIAL', 'SKIPPED', 'FAILED', 'CANCELLED')),
  reason TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  UNIQUE (employee_custom_deduction_id, payroll_period_id, payroll_employee_result_id),
  FOREIGN KEY (employee_custom_deduction_id) REFERENCES employee_custom_deductions(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES custom_deduction_templates(id) ON DELETE RESTRICT,
  FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
  FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE SET NULL,
  FOREIGN KEY (payroll_employee_result_id) REFERENCES payroll_employee_results(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_employee_custom_deduction_apps_assignment ON employee_custom_deduction_applications(employee_custom_deduction_id, application_status);
CREATE INDEX IF NOT EXISTS idx_employee_custom_deduction_apps_period ON employee_custom_deduction_applications(payroll_period_id, application_status);
CREATE INDEX IF NOT EXISTS idx_employee_custom_deduction_apps_run ON employee_custom_deduction_applications(payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_employee_custom_deduction_apps_result ON employee_custom_deduction_applications(payroll_employee_result_id);

CREATE TABLE IF NOT EXISTS bank_loan_remittance_batches (
  id TEXT PRIMARY KEY,
  payroll_period_id TEXT NOT NULL,
  payment_institution_id TEXT NOT NULL,
  period_label TEXT NOT NULL,
  total_deducted_amount REAL NOT NULL DEFAULT 0,
  employee_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PREPARED', 'MANUALLY_CONFIRMED_PAID_TO_BANK', 'CANCELLED')),
  prepared_by_user_id TEXT,
  prepared_at TEXT,
  confirmed_by_user_id TEXT,
  confirmed_at TEXT,
  remittance_reference TEXT,
  confirmation_note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
  FOREIGN KEY (payment_institution_id) REFERENCES payment_institutions(id) ON DELETE RESTRICT,
  FOREIGN KEY (prepared_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (confirmed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS bank_loan_remittance_batch_items (
  id TEXT PRIMARY KEY,
  remittance_batch_id TEXT NOT NULL,
  employee_bank_loan_payment_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  deducted_amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PREPARED' CHECK (status IN ('PREPARED', 'CONFIRMED', 'CANCELLED')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  UNIQUE (remittance_batch_id, employee_bank_loan_payment_id),
  FOREIGN KEY (remittance_batch_id) REFERENCES bank_loan_remittance_batches(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_bank_loan_payment_id) REFERENCES employee_bank_loan_payments(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pension_schemes (
  id TEXT PRIMARY KEY,
  scheme_code TEXT NOT NULL UNIQUE,
  scheme_name TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'MV',
  employee_contribution_percent REAL NOT NULL DEFAULT 7 CHECK (employee_contribution_percent >= 0),
  employer_contribution_percent REAL NOT NULL DEFAULT 7 CHECK (employer_contribution_percent >= 0),
  contribution_basis TEXT NOT NULL DEFAULT 'BASIC_SALARY_ONLY' CHECK (contribution_basis IN ('BASIC_SALARY_ONLY', 'GROSS_SALARY', 'CUSTOM_FORMULA_PLACEHOLDER')),
  include_allowances INTEGER NOT NULL DEFAULT 0 CHECK (include_allowances IN (0, 1)),
  min_employee_age INTEGER,
  max_employee_age INTEGER,
  local_employee_required INTEGER NOT NULL DEFAULT 1 CHECK (local_employee_required IN (0, 1)),
  foreign_employee_allowed INTEGER NOT NULL DEFAULT 1 CHECK (foreign_employee_allowed IN (0, 1)),
  foreign_employee_default_required INTEGER NOT NULL DEFAULT 0 CHECK (foreign_employee_default_required IN (0, 1)),
  employer_can_pay_employee_share INTEGER NOT NULL DEFAULT 1 CHECK (employer_can_pay_employee_share IN (0, 1)),
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  notes TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pension_schemes_active ON pension_schemes(status, effective_from, effective_to);

CREATE TABLE IF NOT EXISTS employee_pension_profiles (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  pension_scheme_id TEXT,
  pension_member_id TEXT,
  registration_number TEXT,
  enrollment_status TEXT NOT NULL DEFAULT 'NOT_ENROLLED' CHECK (enrollment_status IN ('NOT_ENROLLED', 'ENROLLED', 'EXEMPTED', 'VOLUNTARY', 'SUSPENDED')),
  employee_contribution_percent_override REAL CHECK (employee_contribution_percent_override IS NULL OR employee_contribution_percent_override >= 0),
  employer_contribution_percent_override REAL CHECK (employer_contribution_percent_override IS NULL OR employer_contribution_percent_override >= 0),
  employer_pays_employee_share INTEGER NOT NULL DEFAULT 0 CHECK (employer_pays_employee_share IN (0, 1)),
  employee_extra_voluntary_contribution_amount REAL NOT NULL DEFAULT 0 CHECK (employee_extra_voluntary_contribution_amount >= 0),
  contribution_basis_override TEXT CHECK (contribution_basis_override IS NULL OR contribution_basis_override IN ('BASIC_SALARY_ONLY', 'GROSS_SALARY', 'CUSTOM_FORMULA_PLACEHOLDER')),
  effective_date TEXT NOT NULL,
  end_date TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  exemption_reason TEXT,
  supporting_document_id TEXT,
  notes TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (pension_scheme_id) REFERENCES pension_schemes(id) ON DELETE SET NULL,
  FOREIGN KEY (supporting_document_id) REFERENCES employee_documents(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_employee_pension_profiles_employee ON employee_pension_profiles(employee_id, status, effective_date);

CREATE TABLE IF NOT EXISTS payroll_pension_contributions (
  id TEXT PRIMARY KEY,
  payroll_period_id TEXT NOT NULL,
  payroll_run_id TEXT NOT NULL,
  payroll_employee_result_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  pension_scheme_id TEXT NOT NULL,
  pensionable_wage REAL NOT NULL DEFAULT 0 CHECK (pensionable_wage >= 0),
  employee_contribution_percent REAL NOT NULL DEFAULT 0 CHECK (employee_contribution_percent >= 0),
  employee_contribution_amount REAL NOT NULL DEFAULT 0 CHECK (employee_contribution_amount >= 0),
  employer_contribution_percent REAL NOT NULL DEFAULT 0 CHECK (employer_contribution_percent >= 0),
  employer_contribution_amount REAL NOT NULL DEFAULT 0 CHECK (employer_contribution_amount >= 0),
  total_contribution_amount REAL NOT NULL DEFAULT 0 CHECK (total_contribution_amount >= 0),
  employer_paid_employee_share_amount REAL NOT NULL DEFAULT 0 CHECK (employer_paid_employee_share_amount >= 0),
  employee_extra_voluntary_contribution_amount REAL NOT NULL DEFAULT 0 CHECK (employee_extra_voluntary_contribution_amount >= 0),
  contribution_status TEXT NOT NULL DEFAULT 'CALCULATED' CHECK (contribution_status IN ('CALCULATED', 'INCLUDED_IN_PAYROLL', 'PREPARED_FOR_REMITTANCE', 'MANUALLY_CONFIRMED_REMITTED', 'CANCELLED')),
  remittance_batch_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  UNIQUE (payroll_employee_result_id),
  FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
  FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (payroll_employee_result_id) REFERENCES payroll_employee_results(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (pension_scheme_id) REFERENCES pension_schemes(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_payroll_pension_contributions_period ON payroll_pension_contributions(payroll_period_id, pension_scheme_id, contribution_status);
CREATE INDEX IF NOT EXISTS idx_payroll_pension_contributions_employee ON payroll_pension_contributions(employee_id, payroll_period_id);

CREATE TABLE IF NOT EXISTS pension_remittance_batches (
  id TEXT PRIMARY KEY,
  payroll_period_id TEXT NOT NULL,
  scheme_id TEXT NOT NULL,
  period_label TEXT NOT NULL,
  employee_contribution_total REAL NOT NULL DEFAULT 0,
  employer_contribution_total REAL NOT NULL DEFAULT 0,
  employee_extra_voluntary_contribution_total REAL NOT NULL DEFAULT 0,
  total_remittance_amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PREPARED', 'MANUALLY_CONFIRMED_REMITTED', 'CANCELLED')),
  prepared_by_user_id TEXT,
  prepared_at TEXT,
  confirmed_by_user_id TEXT,
  confirmed_at TEXT,
  remittance_reference TEXT,
  confirmation_note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
  FOREIGN KEY (scheme_id) REFERENCES pension_schemes(id) ON DELETE RESTRICT,
  FOREIGN KEY (prepared_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (confirmed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pension_remittance_batches_period ON pension_remittance_batches(payroll_period_id, scheme_id, status);

CREATE TABLE IF NOT EXISTS employee_salary_history (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  old_basic_salary REAL,
  new_basic_salary REAL NOT NULL CHECK (new_basic_salary >= 0),
  effective_date TEXT NOT NULL,
  reason TEXT NOT NULL,
  approved_by_user_id TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_employee_salary_history_employee ON employee_salary_history(employee_id, effective_date);

CREATE TABLE IF NOT EXISTS employee_increments (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  increment_amount REAL NOT NULL,
  increment_percentage REAL CHECK (increment_percentage IS NULL OR increment_percentage >= 0),
  old_salary REAL NOT NULL CHECK (old_salary >= 0),
  new_salary REAL NOT NULL CHECK (new_salary >= 0),
  effective_date TEXT NOT NULL,
  reason TEXT NOT NULL,
  approved_by_user_id TEXT,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_employee_increments_employee ON employee_increments(employee_id, effective_date);

CREATE TABLE IF NOT EXISTS payroll_periods (
  id TEXT PRIMARY KEY,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_year INTEGER NOT NULL CHECK (period_year BETWEEN 2000 AND 2100),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  salary_payment_date TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'CALCULATING', 'READY_FOR_REVIEW', 'SUBMITTED_FOR_APPROVAL', 'APPROVED_PLACEHOLDER', 'FINALIZED_PLACEHOLDER', 'REJECTED', 'SENT_BACK', 'APPROVED', 'FINALIZED', 'LOCKED', 'CANCELLED', 'OPEN', 'PROCESSING', 'REVIEW', 'PAID', 'CLOSED')),
  created_by_user_id TEXT,
  approved_by_user_id TEXT,
  approved_at TEXT,
  paid_by_user_id TEXT,
  paid_at TEXT,
  closed_by_user_id TEXT,
  closed_at TEXT,
  finalized_by_user_id TEXT,
  finalized_at TEXT,
  locked_by_user_id TEXT,
  locked_at TEXT,
  finalization_note TEXT,
  finalization_snapshot_json TEXT,
  unlocked_by_user_id TEXT,
  unlocked_at TEXT,
  unlock_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (period_month, period_year),
  CHECK (end_date >= start_date),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (paid_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (closed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payroll_periods_status ON payroll_periods(period_year, period_month, status);

CREATE TABLE IF NOT EXISTS payroll_runs (
  id TEXT PRIMARY KEY,
  payroll_period_id TEXT NOT NULL,
  run_no INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'CALCULATING', 'READY_FOR_REVIEW', 'SUBMITTED_FOR_APPROVAL', 'APPROVED_PLACEHOLDER', 'FINALIZED_PLACEHOLDER', 'REJECTED', 'SENT_BACK', 'APPROVED', 'FINALIZED', 'LOCKED', 'CANCELLED', 'PROCESSING', 'REVIEW', 'PAID')),
  calculation_mode TEXT NOT NULL DEFAULT 'STANDARD' CHECK (calculation_mode IN ('STANDARD', 'RECALCULATION', 'FINAL_SETTLEMENT')),
  generated_by_user_id TEXT,
  generated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  approved_by_user_id TEXT,
  approved_at TEXT,
  paid_by_user_id TEXT,
  paid_at TEXT,
  rejected_by_user_id TEXT,
  rejected_at TEXT,
  rejection_reason TEXT,
  finalized_by_user_id TEXT,
  finalized_at TEXT,
  locked_by_user_id TEXT,
  locked_at TEXT,
  finalization_note TEXT,
  finalization_snapshot_json TEXT,
  unlocked_by_user_id TEXT,
  unlocked_at TEXT,
  unlock_reason TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (payroll_period_id, run_no),
  FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
  FOREIGN KEY (generated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (paid_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payroll_runs_period ON payroll_runs(payroll_period_id, status);

CREATE TABLE IF NOT EXISTS payroll_run_employees (
  id TEXT PRIMARY KEY,
  payroll_run_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  employee_no_snapshot TEXT NOT NULL,
  employee_name_snapshot TEXT NOT NULL,
  department_id TEXT,
  position_id TEXT,
  location_id TEXT,
  basic_salary REAL NOT NULL DEFAULT 0 CHECK (basic_salary >= 0),
  total_earnings REAL NOT NULL DEFAULT 0 CHECK (total_earnings >= 0),
  total_deductions REAL NOT NULL DEFAULT 0 CHECK (total_deductions >= 0),
  advance_deductions REAL NOT NULL DEFAULT 0 CHECK (advance_deductions >= 0),
  attendance_deductions REAL NOT NULL DEFAULT 0 CHECK (attendance_deductions >= 0),
  leave_deductions REAL NOT NULL DEFAULT 0 CHECK (leave_deductions >= 0),
  other_deductions REAL NOT NULL DEFAULT 0 CHECK (other_deductions >= 0),
  net_salary REAL NOT NULL DEFAULT 0,
  days_in_period INTEGER NOT NULL DEFAULT 0,
  scheduled_work_days INTEGER,
  days_worked INTEGER,
  absent_days INTEGER,
  leave_days INTEGER,
  unpaid_leave_days INTEGER,
  late_days INTEGER,
  missed_punch_days INTEGER,
  missed_date_ranges_json TEXT,
  calculation_json TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'READY_FOR_REVIEW', 'SUBMITTED_FOR_APPROVAL', 'APPROVED_PLACEHOLDER', 'FINALIZED_PLACEHOLDER', 'APPROVED', 'FINALIZED', 'HELD', 'EXCLUDED', 'CANCELLED', 'REVIEW', 'PAID')),
  hold_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (payroll_run_id, employee_id),
  FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payroll_run_employees_run ON payroll_run_employees(payroll_run_id, status);
CREATE INDEX IF NOT EXISTS idx_payroll_run_employees_employee ON payroll_run_employees(employee_id);

CREATE TABLE IF NOT EXISTS payroll_run_lines (
  id TEXT PRIMARY KEY,
  payroll_run_employee_id TEXT NOT NULL,
  payroll_component_id TEXT,
  line_type TEXT NOT NULL CHECK (line_type IN ('EARNING', 'DEDUCTION', 'INFO', 'EMPLOYER_COST')),
  category TEXT,
  description TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount >= 0),
  source TEXT NOT NULL CHECK (source IN ('PROFILE', 'ADVANCE', 'ATTENDANCE', 'LEAVE', 'ROSTER', 'MANUAL', 'SYSTEM')),
  source_entity_type TEXT,
  source_entity_id TEXT,
  calculation_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (payroll_run_employee_id) REFERENCES payroll_run_employees(id) ON DELETE CASCADE,
  FOREIGN KEY (payroll_component_id) REFERENCES payroll_components(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payroll_run_lines_employee ON payroll_run_lines(payroll_run_employee_id, line_type);

CREATE TABLE IF NOT EXISTS payroll_employee_results (
  id TEXT PRIMARY KEY,
  payroll_run_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  employee_no_snapshot TEXT NOT NULL,
  employee_name_snapshot TEXT NOT NULL,
  department_id TEXT,
  position_id TEXT,
  location_id TEXT,
  basic_salary REAL NOT NULL DEFAULT 0 CHECK (basic_salary >= 0),
  total_earnings REAL NOT NULL DEFAULT 0 CHECK (total_earnings >= 0),
  total_deductions REAL NOT NULL DEFAULT 0 CHECK (total_deductions >= 0),
  advance_deductions REAL NOT NULL DEFAULT 0 CHECK (advance_deductions >= 0),
  attendance_deductions REAL NOT NULL DEFAULT 0 CHECK (attendance_deductions >= 0),
  leave_deductions REAL NOT NULL DEFAULT 0 CHECK (leave_deductions >= 0),
  other_deductions REAL NOT NULL DEFAULT 0 CHECK (other_deductions >= 0),
  net_salary REAL NOT NULL DEFAULT 0,
  days_in_period INTEGER NOT NULL DEFAULT 0,
  scheduled_work_days INTEGER,
  days_worked INTEGER,
  absent_days INTEGER,
  leave_days INTEGER,
  unpaid_leave_days INTEGER,
  late_days INTEGER,
  missed_punch_days INTEGER,
  missed_date_ranges_json TEXT,
  calculation_json TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'READY_FOR_REVIEW', 'SUBMITTED_FOR_APPROVAL', 'APPROVED_PLACEHOLDER', 'FINALIZED_PLACEHOLDER', 'APPROVED', 'FINALIZED', 'HELD', 'EXCLUDED', 'CANCELLED')),
  hold_reason TEXT,
  finalized_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (payroll_run_id, employee_id),
  FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payroll_employee_results_run ON payroll_employee_results(payroll_run_id, status);
CREATE INDEX IF NOT EXISTS idx_payroll_employee_results_employee ON payroll_employee_results(employee_id);

CREATE TABLE IF NOT EXISTS payroll_result_line_items (
  id TEXT PRIMARY KEY,
  payroll_run_employee_id TEXT NOT NULL,
  payroll_component_id TEXT,
  line_type TEXT NOT NULL CHECK (line_type IN ('EARNING', 'DEDUCTION', 'INFO', 'EMPLOYER_COST')),
  category TEXT,
  description TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount >= 0),
  source TEXT NOT NULL CHECK (source IN ('PROFILE', 'ADVANCE', 'ATTENDANCE', 'LEAVE', 'ROSTER', 'MANUAL', 'SYSTEM')),
  source_entity_type TEXT,
  source_entity_id TEXT,
  calculation_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (payroll_run_employee_id) REFERENCES payroll_employee_results(id) ON DELETE CASCADE,
  FOREIGN KEY (payroll_component_id) REFERENCES payroll_components(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payroll_result_line_items_result ON payroll_result_line_items(payroll_run_employee_id, line_type);

CREATE TABLE IF NOT EXISTS payroll_approval_events (
  id TEXT PRIMARY KEY,
  payroll_period_id TEXT NOT NULL,
  payroll_run_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('SUBMITTED_FOR_APPROVAL', 'APPROVED', 'REJECTED', 'SENT_BACK', 'FINALIZED', 'UNLOCKED')),
  previous_status TEXT,
  new_status TEXT,
  actor_user_id TEXT,
  actor_name_snapshot TEXT,
  note TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
  FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payroll_approval_events_run ON payroll_approval_events(payroll_run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_payroll_approval_events_period ON payroll_approval_events(payroll_period_id, created_at);

CREATE TABLE IF NOT EXISTS payroll_payslips (
  id TEXT PRIMARY KEY,
  payslip_number TEXT NOT NULL UNIQUE,
  payroll_period_id TEXT NOT NULL,
  payroll_run_id TEXT NOT NULL,
  payroll_employee_result_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'GENERATED' CHECK (status IN ('DRAFT', 'GENERATED', 'REGENERATED', 'CANCELLED')),
  generated_by_user_id TEXT,
  generated_at TEXT,
  regenerated_by_user_id TEXT,
  regenerated_at TEXT,
  version_number INTEGER NOT NULL DEFAULT 1 CHECK (version_number >= 1),
  payslip_data_json TEXT NOT NULL,
  html_snapshot TEXT,
  pdf_object_key TEXT,
  download_count INTEGER NOT NULL DEFAULT 0 CHECK (download_count >= 0),
  last_downloaded_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  UNIQUE (payroll_employee_result_id),
  FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
  FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (payroll_employee_result_id) REFERENCES payroll_employee_results(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (generated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (regenerated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payroll_payslips_run ON payroll_payslips(payroll_run_id, status);
CREATE INDEX IF NOT EXISTS idx_payroll_payslips_employee ON payroll_payslips(employee_id, generated_at);
CREATE INDEX IF NOT EXISTS idx_payroll_payslips_period ON payroll_payslips(payroll_period_id, status);

CREATE TABLE IF NOT EXISTS payroll_payment_register (
  id TEXT PRIMARY KEY,
  payroll_period_id TEXT NOT NULL,
  payroll_run_id TEXT NOT NULL,
  payroll_employee_result_id TEXT NOT NULL UNIQUE,
  employee_id TEXT NOT NULL,
  employee_number_snapshot TEXT NOT NULL,
  employee_name_snapshot TEXT NOT NULL,
  payment_method_snapshot TEXT,
  bank_name_snapshot TEXT,
  bank_account_name_snapshot TEXT,
  bank_account_number_masked TEXT,
  net_salary_amount REAL NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'PREPARED', 'MANUALLY_CONFIRMED_PAID', 'FAILED_PLACEHOLDER', 'CANCELLED')),
  prepared_by_user_id TEXT,
  prepared_at TEXT,
  confirmed_paid_by_user_id TEXT,
  confirmed_paid_at TEXT,
  confirmation_reference TEXT,
  confirmation_note TEXT,
  failed_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE CASCADE,
  FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
  FOREIGN KEY (payroll_employee_result_id) REFERENCES payroll_employee_results(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (prepared_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (confirmed_paid_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payroll_payment_register_run ON payroll_payment_register(payroll_run_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_payroll_payment_register_employee ON payroll_payment_register(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_payment_register_period ON payroll_payment_register(payroll_period_id, payment_status);

CREATE TABLE IF NOT EXISTS payroll_advance_payments (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  payment_date TEXT NOT NULL,
  repayment_period_id TEXT,
  deduction_payroll_run_employee_id TEXT,
  status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK (status IN ('REQUESTED', 'APPROVED', 'PAID', 'DEDUCTED', 'CANCELLED')),
  notes TEXT,
  created_by_user_id TEXT,
  approved_by_user_id TEXT,
  approved_at TEXT,
  paid_by_user_id TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (repayment_period_id) REFERENCES payroll_periods(id) ON DELETE SET NULL,
  FOREIGN KEY (deduction_payroll_run_employee_id) REFERENCES payroll_run_employees(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (paid_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payroll_advances_employee ON payroll_advance_payments(employee_id, payment_date, status);

CREATE TABLE IF NOT EXISTS payroll_deductions (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  payroll_component_id TEXT,
  deduction_type TEXT NOT NULL CHECK (deduction_type IN ('FIXED', 'VARIABLE', 'ONE_TIME', 'RECURRING')),
  amount REAL NOT NULL CHECK (amount > 0),
  start_date TEXT,
  end_date TEXT,
  payroll_period_id TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'APPLIED', 'CANCELLED')),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (payroll_component_id) REFERENCES payroll_components(id) ON DELETE SET NULL,
  FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payroll_deductions_employee ON payroll_deductions(employee_id, status);

CREATE TABLE IF NOT EXISTS payroll_adjustments (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  payroll_period_id TEXT,
  payroll_run_employee_id TEXT,
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('EARNING', 'DEDUCTION')),
  amount REAL NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'APPROVED_PLACEHOLDER', 'APPROVED', 'APPLIED', 'CANCELLED')),
  created_by_user_id TEXT,
  approved_by_user_id TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE SET NULL,
  FOREIGN KEY (payroll_run_employee_id) REFERENCES payroll_run_employees(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_employee ON payroll_adjustments(employee_id, status);

CREATE TABLE IF NOT EXISTS final_settlements (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  payroll_period_id TEXT,
  final_salary_amount REAL,
  pending_advance_amount REAL,
  pending_deduction_amount REAL,
  leave_encashment_amount REAL,
  asset_recovery_amount REAL,
  net_settlement_amount REAL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'REVIEW', 'APPROVED', 'PAID', 'CANCELLED')),
  reason TEXT,
  created_by_user_id TEXT,
  approved_by_user_id TEXT,
  paid_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (payroll_period_id) REFERENCES payroll_periods(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (paid_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Prompt 12 Final Settlement / Exit Payroll
CREATE TABLE IF NOT EXISTS final_settlement_settings (
  id TEXT PRIMARY KEY DEFAULT 'final_settlement_settings_default',
  module_enabled INTEGER NOT NULL DEFAULT 1 CHECK (module_enabled IN (0, 1)),
  final_settlement_enabled INTEGER NOT NULL DEFAULT 1 CHECK (final_settlement_enabled IN (0, 1)),
  allow_case_creation_from_exit_status INTEGER NOT NULL DEFAULT 1 CHECK (allow_case_creation_from_exit_status IN (0, 1)),
  allow_settlement_case_creation_from_exit_status INTEGER NOT NULL DEFAULT 1 CHECK (allow_settlement_case_creation_from_exit_status IN (0, 1)),
  auto_create_case_on_exit_status INTEGER NOT NULL DEFAULT 0 CHECK (auto_create_case_on_exit_status IN (0, 1)),
  auto_create_settlement_case_on_exit_status INTEGER NOT NULL DEFAULT 0 CHECK (auto_create_settlement_case_on_exit_status IN (0, 1)),
  require_approval_before_finalization INTEGER NOT NULL DEFAULT 1 CHECK (require_approval_before_finalization IN (0, 1)),
  require_settlement_approval_before_finalization INTEGER NOT NULL DEFAULT 1 CHECK (require_settlement_approval_before_finalization IN (0, 1)),
  require_clearance_before_finalization INTEGER NOT NULL DEFAULT 1 CHECK (require_clearance_before_finalization IN (0, 1)),
  require_document_checklist_before_finalization INTEGER NOT NULL DEFAULT 0 CHECK (require_document_checklist_before_finalization IN (0, 1)),
  require_document_checklist_before_finalization_placeholder INTEGER NOT NULL DEFAULT 0 CHECK (require_document_checklist_before_finalization_placeholder IN (0, 1)),
  include_unpaid_salary INTEGER NOT NULL DEFAULT 1 CHECK (include_unpaid_salary IN (0, 1)),
  include_pending_payroll INTEGER NOT NULL DEFAULT 1 CHECK (include_pending_payroll IN (0, 1)),
  include_unused_leave_payout INTEGER NOT NULL DEFAULT 1 CHECK (include_unused_leave_payout IN (0, 1)),
  include_negative_leave_balance_deduction INTEGER NOT NULL DEFAULT 1 CHECK (include_negative_leave_balance_deduction IN (0, 1)),
  include_unpaid_leave_deduction INTEGER NOT NULL DEFAULT 1 CHECK (include_unpaid_leave_deduction IN (0, 1)),
  include_attendance_deduction INTEGER NOT NULL DEFAULT 1 CHECK (include_attendance_deduction IN (0, 1)),
  include_bank_loan_deductions INTEGER NOT NULL DEFAULT 1 CHECK (include_bank_loan_deductions IN (0, 1)),
  include_bank_loan_shortfall_warnings INTEGER NOT NULL DEFAULT 1 CHECK (include_bank_loan_shortfall_warnings IN (0, 1)),
  include_bank_loan_direct_collection_warnings INTEGER NOT NULL DEFAULT 1 CHECK (include_bank_loan_direct_collection_warnings IN (0, 1)),
  include_pension_contribution INTEGER NOT NULL DEFAULT 1 CHECK (include_pension_contribution IN (0, 1)),
  include_pension_remittance_warnings INTEGER NOT NULL DEFAULT 1 CHECK (include_pension_remittance_warnings IN (0, 1)),
  include_custom_deduction_remaining_balances INTEGER NOT NULL DEFAULT 1 CHECK (include_custom_deduction_remaining_balances IN (0, 1)),
  include_custom_deduction_shortfall_warnings INTEGER NOT NULL DEFAULT 1 CHECK (include_custom_deduction_shortfall_warnings IN (0, 1)),
  include_advance_balance_deduction INTEGER NOT NULL DEFAULT 1 CHECK (include_advance_balance_deduction IN (0, 1)),
  include_one_time_deductions INTEGER NOT NULL DEFAULT 1 CHECK (include_one_time_deductions IN (0, 1)),
  include_asset_deductions INTEGER NOT NULL DEFAULT 1 CHECK (include_asset_deductions IN (0, 1)),
  include_uniform_deductions INTEGER NOT NULL DEFAULT 1 CHECK (include_uniform_deductions IN (0, 1)),
  include_notice_period_deduction INTEGER NOT NULL DEFAULT 0 CHECK (include_notice_period_deduction IN (0, 1)),
  include_gratuity_placeholder INTEGER NOT NULL DEFAULT 0 CHECK (include_gratuity_placeholder IN (0, 1)),
  include_contract_end_placeholder INTEGER NOT NULL DEFAULT 0 CHECK (include_contract_end_placeholder IN (0, 1)),
  include_manual_earning_adjustments INTEGER NOT NULL DEFAULT 1 CHECK (include_manual_earning_adjustments IN (0, 1)),
  include_manual_deduction_adjustments INTEGER NOT NULL DEFAULT 1 CHECK (include_manual_deduction_adjustments IN (0, 1)),
  settlement_payment_register_enabled INTEGER NOT NULL DEFAULT 1 CHECK (settlement_payment_register_enabled IN (0, 1)),
  final_settlement_document_placeholder_enabled INTEGER NOT NULL DEFAULT 1 CHECK (final_settlement_document_placeholder_enabled IN (0, 1)),
  final_settlement_document_pdf_placeholder_enabled INTEGER NOT NULL DEFAULT 1 CHECK (final_settlement_document_pdf_placeholder_enabled IN (0, 1)),
  allow_recalculation_while_draft INTEGER NOT NULL DEFAULT 1 CHECK (allow_recalculation_while_draft IN (0, 1)),
  allow_recalculation_after_approval INTEGER NOT NULL DEFAULT 0 CHECK (allow_recalculation_after_approval IN (0, 1)),
  allow_unlock_after_finalization INTEGER NOT NULL DEFAULT 0 CHECK (allow_unlock_after_finalization IN (0, 1)),
  require_reason_for_recalculation INTEGER NOT NULL DEFAULT 1 CHECK (require_reason_for_recalculation IN (0, 1)),
  require_reason_for_unlock INTEGER NOT NULL DEFAULT 1 CHECK (require_reason_for_unlock IN (0, 1)),
  default_daily_rate_calculation_mode TEXT NOT NULL DEFAULT 'FIXED_30_DAYS' CHECK (default_daily_rate_calculation_mode IN ('CALENDAR_DAYS', 'WORKING_DAYS', 'FIXED_30_DAYS')),
  default_unused_leave_payout_calculation_mode TEXT NOT NULL DEFAULT 'DAILY_RATE' CHECK (default_unused_leave_payout_calculation_mode IN ('DAILY_RATE', 'FIXED_AMOUNT', 'MANUAL')),
  default_notice_period_deduction_calculation_mode TEXT NOT NULL DEFAULT 'DAILY_RATE' CHECK (default_notice_period_deduction_calculation_mode IN ('DAILY_RATE', 'FIXED_AMOUNT', 'MANUAL')),
  default_settlement_currency TEXT NOT NULL DEFAULT 'MVR',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS final_settlement_cases (
  id TEXT PRIMARY KEY,
  settlement_number TEXT NOT NULL UNIQUE,
  employee_id TEXT NOT NULL,
  employee_number_snapshot TEXT NOT NULL,
  employee_name_snapshot TEXT NOT NULL,
  department_id TEXT,
  department_snapshot TEXT,
  worksite_id TEXT,
  worksite_snapshot TEXT,
  location_snapshot TEXT,
  position_id TEXT,
  position_snapshot TEXT,
  employment_type_snapshot TEXT,
  exit_type TEXT NOT NULL CHECK (exit_type IN ('RESIGNED', 'TERMINATED', 'END_OF_CONTRACT', 'ABSCONDED', 'RETIRED', 'DECEASED', 'OTHER')),
  exit_status TEXT,
  exit_date TEXT NOT NULL,
  last_working_day TEXT NOT NULL,
  settlement_period_start_date TEXT,
  settlement_period_end_date TEXT,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'CALCULATING', 'READY_FOR_REVIEW', 'SUBMITTED_FOR_APPROVAL', 'APPROVED', 'REJECTED', 'SENT_BACK', 'FINALIZED', 'LOCKED', 'CANCELLED')),
  total_earnings REAL NOT NULL DEFAULT 0,
  total_deductions REAL NOT NULL DEFAULT 0,
  net_settlement_amount REAL NOT NULL DEFAULT 0,
  payment_direction TEXT NOT NULL DEFAULT 'ZERO_BALANCE' CHECK (payment_direction IN ('COMPANY_TO_EMPLOYEE', 'EMPLOYEE_TO_COMPANY', 'ZERO_BALANCE')),
  company_owes_employee_amount REAL NOT NULL DEFAULT 0,
  employee_owes_company_amount REAL NOT NULL DEFAULT 0,
  clearance_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (clearance_status IN ('PENDING', 'CLEARED', 'DEDUCTION_APPLIED', 'WAIVED', 'NOT_REQUIRED', 'BLOCKED')),
  approval_status TEXT NOT NULL DEFAULT 'NOT_SUBMITTED' CHECK (approval_status IN ('NOT_SUBMITTED', 'SUBMITTED_FOR_APPROVAL', 'APPROVED', 'REJECTED', 'SENT_BACK')),
  payment_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'PREPARED', 'MANUALLY_CONFIRMED_PAID', 'RECEIVED_FROM_EMPLOYEE_PLACEHOLDER', 'WAIVED', 'CANCELLED')),
  calculation_warnings_json TEXT,
  calculation_breakdown_json TEXT,
  calculated_by_user_id TEXT,
  calculated_at TEXT,
  created_by_user_id TEXT,
  submitted_by_user_id TEXT,
  submitted_at TEXT,
  approved_by_user_id TEXT,
  approved_at TEXT,
  rejected_by_user_id TEXT,
  rejected_at TEXT,
  rejection_reason TEXT,
  finalized_by_user_id TEXT,
  finalized_at TEXT,
  locked_by_user_id TEXT,
  locked_at TEXT,
  cancelled_by_user_id TEXT,
  cancelled_at TEXT,
  cancellation_reason TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  CHECK (last_working_day <= exit_date),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (rejected_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (finalized_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (locked_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (cancelled_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_final_settlement_cases_employee ON final_settlement_cases(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_final_settlement_cases_status ON final_settlement_cases(status, created_at);
CREATE INDEX IF NOT EXISTS idx_final_settlement_cases_exit ON final_settlement_cases(exit_type, exit_date, last_working_day);
CREATE INDEX IF NOT EXISTS idx_final_settlement_cases_scope ON final_settlement_cases(department_id, worksite_id, status);
CREATE INDEX IF NOT EXISTS idx_final_settlement_cases_finalized ON final_settlement_cases(finalized_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_final_settlement_cases_active_employee
ON final_settlement_cases(employee_id)
WHERE status NOT IN ('CANCELLED', 'FINALIZED', 'LOCKED');

CREATE TABLE IF NOT EXISTS final_settlement_line_items (
  id TEXT PRIMARY KEY,
  settlement_case_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  line_type TEXT NOT NULL CHECK (line_type IN ('EARNING', 'DEDUCTION', 'EMPLOYER_COST', 'WARNING', 'INFO')),
  component_code TEXT NOT NULL,
  component_name TEXT NOT NULL,
  component_source TEXT NOT NULL CHECK (component_source IN ('UNPAID_SALARY', 'PENDING_PAYROLL', 'UNUSED_LEAVE_PAYOUT', 'NEGATIVE_LEAVE_BALANCE_DEDUCTION', 'UNPAID_LEAVE_DEDUCTION', 'ATTENDANCE_DEDUCTION', 'ROSTER_WORK_REQUIREMENT', 'ADVANCE_BALANCE_DEDUCTION', 'BANK_LOAN_DEDUCTION', 'BANK_LOAN_SHORTFALL_WARNING', 'BANK_LOAN_DIRECT_COLLECTION_WARNING', 'PENSION_EMPLOYEE_CONTRIBUTION', 'PENSION_EMPLOYER_CONTRIBUTION', 'PENSION_REMITTANCE_WARNING', 'CUSTOM_DEDUCTION_BALANCE', 'CUSTOM_DEDUCTION_SHORTFALL_WARNING', 'ONE_TIME_DEDUCTION', 'ASSET_DEDUCTION', 'UNIFORM_DEDUCTION', 'NOTICE_PERIOD_DEDUCTION', 'GRATUITY_PLACEHOLDER', 'CONTRACT_END_PLACEHOLDER', 'MANUAL_EARNING_ADJUSTMENT', 'MANUAL_DEDUCTION_ADJUSTMENT', 'CLEARANCE_WARNING', 'DOCUMENT_WARNING')),
  amount REAL NOT NULL DEFAULT 0,
  quantity REAL,
  rate REAL,
  source_reference_type TEXT,
  source_reference_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (settlement_case_id) REFERENCES final_settlement_cases(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_final_settlement_line_items_case ON final_settlement_line_items(settlement_case_id, line_type);
CREATE INDEX IF NOT EXISTS idx_final_settlement_line_items_employee ON final_settlement_line_items(employee_id, component_source);

CREATE TABLE IF NOT EXISTS final_settlement_events (
  id TEXT PRIMARY KEY,
  settlement_case_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  action TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  actor_user_id TEXT,
  actor_name_snapshot TEXT,
  reason TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (settlement_case_id) REFERENCES final_settlement_cases(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_final_settlement_events_case ON final_settlement_events(settlement_case_id, created_at);
CREATE INDEX IF NOT EXISTS idx_final_settlement_events_employee ON final_settlement_events(employee_id, created_at);

CREATE TABLE IF NOT EXISTS final_settlement_clearance_items (
  id TEXT PRIMARY KEY,
  settlement_case_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  clearance_type TEXT NOT NULL CHECK (clearance_type IN ('ASSET', 'UNIFORM', 'DOCUMENT', 'PAYROLL', 'LEAVE', 'ATTENDANCE', 'ROSTER', 'OTHER')),
  source_reference_type TEXT,
  source_reference_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CLEARED', 'DEDUCTION_APPLIED', 'WAIVED', 'NOT_REQUIRED', 'BLOCKED')),
  deduction_amount REAL NOT NULL DEFAULT 0 CHECK (deduction_amount >= 0),
  reason TEXT,
  updated_by_user_id TEXT,
  updated_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (settlement_case_id) REFERENCES final_settlement_cases(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_final_settlement_clearance_case ON final_settlement_clearance_items(settlement_case_id, status);
CREATE INDEX IF NOT EXISTS idx_final_settlement_clearance_employee ON final_settlement_clearance_items(employee_id, clearance_type);

CREATE TABLE IF NOT EXISTS final_settlement_manual_adjustments (
  id TEXT PRIMARY KEY,
  settlement_case_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  line_item_id TEXT,
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('EARNING', 'DEDUCTION')),
  amount REAL NOT NULL CHECK (amount >= 0),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'CANCELLED')),
  created_by_user_id TEXT,
  cancelled_by_user_id TEXT,
  cancelled_at TEXT,
  cancellation_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (settlement_case_id) REFERENCES final_settlement_cases(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (line_item_id) REFERENCES final_settlement_line_items(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (cancelled_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_final_settlement_manual_adjustments_case ON final_settlement_manual_adjustments(settlement_case_id, status);

CREATE TABLE IF NOT EXISTS final_settlement_payment_register (
  id TEXT PRIMARY KEY,
  settlement_case_id TEXT NOT NULL UNIQUE,
  employee_id TEXT NOT NULL,
  employee_number_snapshot TEXT NOT NULL,
  employee_name_snapshot TEXT NOT NULL,
  payment_method_snapshot_json TEXT,
  payment_method_type_snapshot TEXT,
  payment_institution_snapshot TEXT,
  payment_method_snapshot TEXT,
  bank_name_snapshot TEXT,
  bank_account_name_snapshot TEXT,
  bank_account_number_masked TEXT,
  net_settlement_amount REAL NOT NULL DEFAULT 0,
  payment_direction TEXT NOT NULL CHECK (payment_direction IN ('COMPANY_TO_EMPLOYEE', 'EMPLOYEE_TO_COMPANY', 'ZERO_BALANCE')),
  payment_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'PREPARED', 'MANUALLY_CONFIRMED_PAID', 'RECEIVED_FROM_EMPLOYEE_PLACEHOLDER', 'WAIVED', 'CANCELLED')),
  prepared_by_user_id TEXT,
  prepared_at TEXT,
  confirmed_by_user_id TEXT,
  confirmed_at TEXT,
  confirmation_reference TEXT,
  confirmation_note TEXT,
  cancelled_by_user_id TEXT,
  cancelled_at TEXT,
  cancellation_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (settlement_case_id) REFERENCES final_settlement_cases(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (prepared_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (confirmed_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (cancelled_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_final_settlement_payment_status ON final_settlement_payment_register(payment_status, created_at);
CREATE INDEX IF NOT EXISTS idx_final_settlement_payment_employee ON final_settlement_payment_register(employee_id);

CREATE TABLE IF NOT EXISTS final_settlement_history_snapshots (
  id TEXT PRIMARY KEY,
  settlement_case_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('CALCULATION', 'APPROVAL', 'FINALIZATION', 'UNLOCK')),
  snapshot_json TEXT NOT NULL,
  created_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (settlement_case_id) REFERENCES final_settlement_cases(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_final_settlement_history_case ON final_settlement_history_snapshots(settlement_case_id, created_at);

CREATE TABLE IF NOT EXISTS payroll_report_exports (
  id TEXT PRIMARY KEY,
  report_type TEXT NOT NULL,
  filters_json TEXT,
  exported_by_user_id TEXT,
  exported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (exported_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Assets, Uniforms, Restricted Notes, and Audit Timeline
CREATE TABLE IF NOT EXISTS asset_categories (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('ASSET', 'UNIFORM', 'OTHER')),
  category_type TEXT DEFAULT 'OTHER' CHECK (category_type IS NULL OR category_type IN ('ELECTRONICS', 'ACCESS', 'EQUIPMENT', 'FURNITURE', 'ACCOMMODATION', 'OTHER')),
  description TEXT,
  default_clearance_required INTEGER NOT NULL DEFAULT 1 CHECK (default_clearance_required IN (0, 1)),
  default_deductible_if_lost INTEGER NOT NULL DEFAULT 1 CHECK (default_deductible_if_lost IN (0, 1)),
  default_deductible_if_damaged INTEGER NOT NULL DEFAULT 1 CHECK (default_deductible_if_damaged IN (0, 1)),
  default_deduction_mode TEXT CHECK (default_deduction_mode IS NULL OR default_deduction_mode IN ('FULL_REPLACEMENT_VALUE', 'CURRENT_VALUE', 'MANUAL_AMOUNT', 'CUSTOM_FORMULA_PLACEHOLDER')),
  expected_return_required INTEGER NOT NULL DEFAULT 0 CHECK (expected_return_required IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  display_order INTEGER NOT NULL DEFAULT 100,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  archived_by_user_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  archived_at TEXT,
  metadata_json TEXT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (archived_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS asset_items (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  asset_code TEXT,
  name TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  variant TEXT,
  size TEXT,
  serial_no TEXT,
  serial_number TEXT,
  purchase_date TEXT,
  purchase_value REAL CHECK (purchase_value IS NULL OR purchase_value >= 0),
  current_value REAL CHECK (current_value IS NULL OR current_value >= 0),
  currency TEXT,
  condition_status TEXT NOT NULL DEFAULT 'GOOD' CHECK (condition_status IN ('NEW', 'GOOD', 'FAIR', 'DAMAGED', 'LOST', 'WRITTEN_OFF')),
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'ISSUED', 'DAMAGED', 'LOST', 'WRITTEN_OFF', 'ARCHIVED')),
  lifecycle_status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (lifecycle_status IN ('AVAILABLE', 'ASSIGNED', 'RETURNED', 'DAMAGED', 'LOST', 'UNDER_REPAIR', 'RETIRED', 'ARCHIVED')),
  assigned_employee_id TEXT,
  assigned_worksite_id TEXT,
  assigned_location_id TEXT,
  expected_return_date TEXT,
  document_id TEXT,
  replacement_cost REAL CHECK (replacement_cost IS NULL OR replacement_cost >= 0),
  notes TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  archived_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  archived_at TEXT,
  metadata_json TEXT,
  FOREIGN KEY (category_id) REFERENCES asset_categories(id) ON DELETE RESTRICT,
  FOREIGN KEY (assigned_employee_id) REFERENCES employees(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_worksite_id) REFERENCES locations(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_location_id) REFERENCES locations(id) ON DELETE SET NULL,
  FOREIGN KEY (document_id) REFERENCES employee_documents(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (archived_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_asset_items_category ON asset_items(category_id, status, condition_status);
CREATE INDEX IF NOT EXISTS idx_asset_items_asset_code ON asset_items(code);
CREATE INDEX IF NOT EXISTS idx_asset_items_serial_number ON asset_items(serial_no, serial_number);
CREATE INDEX IF NOT EXISTS idx_asset_items_lifecycle ON asset_items(lifecycle_status, condition_status);
CREATE INDEX IF NOT EXISTS idx_asset_items_assigned_employee ON asset_items(assigned_employee_id);

CREATE TABLE IF NOT EXISTS employee_asset_assignments (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  asset_item_id TEXT NOT NULL,
  assignment_number TEXT,
  assigned_date TEXT,
  issued_date TEXT NOT NULL,
  issued_by_user_id TEXT NOT NULL,
  expected_return_date TEXT,
  returned_date TEXT,
  returned_to_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED', 'RETURNED', 'DAMAGED', 'LOST', 'REPLACED', 'WRITTEN_OFF')),
  assignment_status TEXT NOT NULL DEFAULT 'ASSIGNED' CHECK (assignment_status IN ('DRAFT', 'PENDING_APPROVAL', 'ASSIGNED', 'RETURN_PENDING', 'RETURNED', 'TRANSFERRED', 'DAMAGED', 'LOST', 'DEDUCTION_PENDING', 'DEDUCTION_APPLIED', 'WAIVED', 'CANCELLED')),
  clearance_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (clearance_status IN ('PENDING', 'CLEARED', 'RETURNED', 'DAMAGED', 'LOST', 'DEDUCTION_APPLIED', 'WAIVED', 'NOT_REQUIRED')),
  issued_condition_status TEXT,
  returned_condition_status TEXT,
  condition_on_issue TEXT,
  condition_on_return TEXT,
  approved_by_user_id TEXT,
  approved_at TEXT,
  damage_reported_by_user_id TEXT,
  damage_reported_at TEXT,
  lost_reported_by_user_id TEXT,
  lost_reported_at TEXT,
  waiver_by_user_id TEXT,
  waiver_at TEXT,
  waiver_reason TEXT,
  deduction_amount REAL CHECK (deduction_amount IS NULL OR deduction_amount >= 0),
  deduction_currency TEXT,
  deduction_status TEXT,
  custom_deduction_id TEXT,
  final_settlement_case_id TEXT,
  document_id TEXT,
  payroll_deduction_id TEXT,
  payroll_adjustment_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (asset_item_id) REFERENCES asset_items(id) ON DELETE RESTRICT,
  FOREIGN KEY (issued_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (returned_to_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (damage_reported_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (lost_reported_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (waiver_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (custom_deduction_id) REFERENCES employee_custom_deductions(id) ON DELETE SET NULL,
  FOREIGN KEY (final_settlement_case_id) REFERENCES final_settlement_cases(id) ON DELETE SET NULL,
  FOREIGN KEY (document_id) REFERENCES employee_documents(id) ON DELETE SET NULL,
  FOREIGN KEY (payroll_deduction_id) REFERENCES payroll_deductions(id) ON DELETE SET NULL,
  FOREIGN KEY (payroll_adjustment_id) REFERENCES payroll_adjustments(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_employee_asset_assignments_employee ON employee_asset_assignments(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_employee_asset_assignments_item ON employee_asset_assignments(asset_item_id, status);
CREATE INDEX IF NOT EXISTS idx_employee_asset_assignments_assignment_status ON employee_asset_assignments(assignment_status, clearance_status);
CREATE INDEX IF NOT EXISTS idx_employee_asset_assignments_custom_deduction ON employee_asset_assignments(custom_deduction_id);

CREATE TABLE IF NOT EXISTS employee_asset_assignment_events (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  asset_item_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('ISSUED', 'RETURNED', 'DAMAGED', 'LOST', 'REPLACED', 'WRITTEN_OFF', 'DEDUCTION_LINKED', 'NOTE_ADDED', 'ATTACHMENT_ADDED', 'ATTACHMENT_REMOVED')),
  old_value_json TEXT,
  new_value_json TEXT,
  reason TEXT,
  event_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (assignment_id) REFERENCES employee_asset_assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (asset_item_id) REFERENCES asset_items(id) ON DELETE CASCADE,
  FOREIGN KEY (event_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_asset_assignment_events_assignment ON employee_asset_assignment_events(assignment_id, created_at);

CREATE TABLE IF NOT EXISTS asset_deduction_rules (
  id TEXT PRIMARY KEY,
  category_id TEXT,
  condition_status TEXT,
  event_type TEXT,
  deduction_mode TEXT NOT NULL DEFAULT 'NONE' CHECK (deduction_mode IN ('NONE', 'FIXED_AMOUNT', 'REPLACEMENT_COST', 'PERCENTAGE_OF_COST', 'CUSTOM')),
  deduction_amount REAL CHECK (deduction_amount IS NULL OR deduction_amount >= 0),
  deduction_percent REAL CHECK (deduction_percent IS NULL OR deduction_percent >= 0),
  payroll_component_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (category_id) REFERENCES asset_categories(id) ON DELETE SET NULL,
  FOREIGN KEY (payroll_component_id) REFERENCES payroll_components(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS asset_assignment_attachments (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL,
  employee_document_id TEXT,
  document_type_id TEXT,
  description TEXT,
  attached_by_user_id TEXT NOT NULL,
  attached_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (assignment_id) REFERENCES employee_asset_assignments(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_document_id) REFERENCES employee_documents(id) ON DELETE SET NULL,
  FOREIGN KEY (document_type_id) REFERENCES document_types(id) ON DELETE SET NULL,
  FOREIGN KEY (attached_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS asset_uniform_settings (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  asset_module_enabled INTEGER NOT NULL DEFAULT 1 CHECK (asset_module_enabled IN (0, 1)),
  uniform_module_enabled INTEGER NOT NULL DEFAULT 1 CHECK (uniform_module_enabled IN (0, 1)),
  require_approval_before_asset_issue INTEGER NOT NULL DEFAULT 0 CHECK (require_approval_before_asset_issue IN (0, 1)),
  require_approval_before_asset_return INTEGER NOT NULL DEFAULT 0 CHECK (require_approval_before_asset_return IN (0, 1)),
  require_approval_before_asset_transfer INTEGER NOT NULL DEFAULT 0 CHECK (require_approval_before_asset_transfer IN (0, 1)),
  require_approval_before_damage_loss_deduction INTEGER NOT NULL DEFAULT 1 CHECK (require_approval_before_damage_loss_deduction IN (0, 1)),
  require_approval_before_waiver INTEGER NOT NULL DEFAULT 1 CHECK (require_approval_before_waiver IN (0, 1)),
  require_document_for_damage_loss INTEGER NOT NULL DEFAULT 0 CHECK (require_document_for_damage_loss IN (0, 1)),
  require_photo_proof_placeholder INTEGER NOT NULL DEFAULT 0 CHECK (require_photo_proof_placeholder IN (0, 1)),
  allow_payroll_deduction_for_lost_damaged_items INTEGER NOT NULL DEFAULT 1 CHECK (allow_payroll_deduction_for_lost_damaged_items IN (0, 1)),
  allow_final_settlement_deduction INTEGER NOT NULL DEFAULT 1 CHECK (allow_final_settlement_deduction IN (0, 1)),
  default_asset_clearance_required_before_final_settlement INTEGER NOT NULL DEFAULT 1 CHECK (default_asset_clearance_required_before_final_settlement IN (0, 1)),
  default_uniform_clearance_required_before_final_settlement INTEGER NOT NULL DEFAULT 1 CHECK (default_uniform_clearance_required_before_final_settlement IN (0, 1)),
  default_damage_deduction_mode TEXT NOT NULL DEFAULT 'FULL_REPLACEMENT_VALUE' CHECK (default_damage_deduction_mode IN ('FULL_REPLACEMENT_VALUE', 'CURRENT_VALUE', 'MANUAL_AMOUNT', 'CUSTOM_FORMULA_PLACEHOLDER')),
  default_uniform_replacement_cycle_months INTEGER,
  allow_employee_self_service_asset_view INTEGER NOT NULL DEFAULT 1 CHECK (allow_employee_self_service_asset_view IN (0, 1)),
  allow_employee_self_service_uniform_view INTEGER NOT NULL DEFAULT 1 CHECK (allow_employee_self_service_uniform_view IN (0, 1)),
  require_reason_for_waiver INTEGER NOT NULL DEFAULT 1 CHECK (require_reason_for_waiver IN (0, 1)),
  require_reason_for_deduction INTEGER NOT NULL DEFAULT 1 CHECK (require_reason_for_deduction IN (0, 1)),
  require_reason_for_cancel INTEGER NOT NULL DEFAULT 1 CHECK (require_reason_for_cancel IN (0, 1)),
  use_central_approval_workflow INTEGER NOT NULL DEFAULT 1 CHECK (use_central_approval_workflow IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS uniform_types (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'OTHER' CHECK (category IN ('SHIRT', 'TROUSER', 'APRON', 'CAP', 'SHOES', 'NAME_BADGE', 'OTHER')),
  default_replacement_cycle_months INTEGER,
  default_clearance_required INTEGER NOT NULL DEFAULT 1 CHECK (default_clearance_required IN (0, 1)),
  default_deductible_if_lost INTEGER NOT NULL DEFAULT 1 CHECK (default_deductible_if_lost IN (0, 1)),
  default_deductible_if_damaged INTEGER NOT NULL DEFAULT 1 CHECK (default_deductible_if_damaged IN (0, 1)),
  default_deduction_amount REAL CHECK (default_deduction_amount IS NULL OR default_deduction_amount >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  display_order INTEGER NOT NULL DEFAULT 100,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  archived_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  archived_at TEXT,
  metadata_json TEXT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (archived_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_uniform_types_status_category ON uniform_types(status, category, display_order);

CREATE TABLE IF NOT EXISTS uniform_stock_items (
  id TEXT PRIMARY KEY,
  uniform_type_id TEXT NOT NULL,
  size_label TEXT,
  worksite_id TEXT,
  location_id TEXT,
  total_quantity INTEGER NOT NULL DEFAULT 0 CHECK (total_quantity >= 0),
  available_quantity INTEGER NOT NULL DEFAULT 0 CHECK (available_quantity >= 0),
  issued_quantity INTEGER NOT NULL DEFAULT 0 CHECK (issued_quantity >= 0),
  damaged_quantity INTEGER NOT NULL DEFAULT 0 CHECK (damaged_quantity >= 0),
  lost_quantity INTEGER NOT NULL DEFAULT 0 CHECK (lost_quantity >= 0),
  retired_quantity INTEGER NOT NULL DEFAULT 0 CHECK (retired_quantity >= 0),
  reorder_level INTEGER,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (uniform_type_id) REFERENCES uniform_types(id) ON DELETE RESTRICT,
  FOREIGN KEY (worksite_id) REFERENCES locations(id) ON DELETE SET NULL,
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_uniform_stock_type ON uniform_stock_items(uniform_type_id, status);
CREATE INDEX IF NOT EXISTS idx_uniform_stock_location ON uniform_stock_items(worksite_id, location_id, status);

CREATE TABLE IF NOT EXISTS employee_uniform_assignments (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  uniform_stock_item_id TEXT NOT NULL,
  uniform_type_id TEXT NOT NULL,
  assignment_number TEXT,
  size_label TEXT,
  quantity_issued INTEGER NOT NULL CHECK (quantity_issued > 0),
  quantity_returned INTEGER NOT NULL DEFAULT 0 CHECK (quantity_returned >= 0),
  quantity_damaged INTEGER NOT NULL DEFAULT 0 CHECK (quantity_damaged >= 0),
  quantity_lost INTEGER NOT NULL DEFAULT 0 CHECK (quantity_lost >= 0),
  issued_date TEXT NOT NULL,
  expected_return_date TEXT,
  returned_date TEXT,
  issued_condition_status TEXT NOT NULL DEFAULT 'GOOD' CHECK (issued_condition_status IN ('NEW', 'GOOD', 'FAIR')),
  returned_condition_status TEXT,
  assignment_status TEXT NOT NULL DEFAULT 'ISSUED' CHECK (assignment_status IN ('DRAFT', 'PENDING_APPROVAL', 'ISSUED', 'RETURN_PENDING', 'RETURNED', 'PARTIALLY_RETURNED', 'DAMAGED', 'LOST', 'DEDUCTION_PENDING', 'DEDUCTION_APPLIED', 'WAIVED', 'CANCELLED')),
  clearance_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (clearance_status IN ('PENDING', 'CLEARED', 'RETURNED', 'DAMAGED', 'LOST', 'DEDUCTION_APPLIED', 'WAIVED', 'NOT_REQUIRED')),
  issued_by_user_id TEXT,
  returned_to_user_id TEXT,
  approved_by_user_id TEXT,
  approved_at TEXT,
  damage_reported_by_user_id TEXT,
  damage_reported_at TEXT,
  lost_reported_by_user_id TEXT,
  lost_reported_at TEXT,
  waiver_by_user_id TEXT,
  waiver_at TEXT,
  waiver_reason TEXT,
  deduction_amount REAL CHECK (deduction_amount IS NULL OR deduction_amount >= 0),
  deduction_currency TEXT,
  deduction_status TEXT,
  custom_deduction_id TEXT,
  final_settlement_case_id TEXT,
  document_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (uniform_stock_item_id) REFERENCES uniform_stock_items(id) ON DELETE RESTRICT,
  FOREIGN KEY (uniform_type_id) REFERENCES uniform_types(id) ON DELETE RESTRICT,
  FOREIGN KEY (issued_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (returned_to_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (approved_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (damage_reported_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (lost_reported_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (waiver_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (custom_deduction_id) REFERENCES employee_custom_deductions(id) ON DELETE SET NULL,
  FOREIGN KEY (final_settlement_case_id) REFERENCES final_settlement_cases(id) ON DELETE SET NULL,
  FOREIGN KEY (document_id) REFERENCES employee_documents(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_employee_uniform_assignments_employee ON employee_uniform_assignments(employee_id, assignment_status, clearance_status);
CREATE INDEX IF NOT EXISTS idx_employee_uniform_assignments_stock ON employee_uniform_assignments(uniform_stock_item_id, assignment_status);
CREATE INDEX IF NOT EXISTS idx_employee_uniform_assignments_type ON employee_uniform_assignments(uniform_type_id, assignment_status);
CREATE INDEX IF NOT EXISTS idx_employee_uniform_assignments_custom_deduction ON employee_uniform_assignments(custom_deduction_id);

CREATE TABLE IF NOT EXISTS asset_uniform_assignment_events (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('ASSET_ASSIGNMENT', 'UNIFORM_ASSIGNMENT')),
  assignment_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('CREATED', 'ISSUED', 'APPROVED', 'RETURNED', 'TRANSFERRED', 'MARKED_DAMAGED', 'MARKED_LOST', 'DEDUCTION_APPLIED', 'DEDUCTION_WAIVED', 'CANCELLED', 'CLEARANCE_UPDATED', 'DOCUMENT_LINKED')),
  previous_status TEXT,
  new_status TEXT,
  actor_user_id TEXT,
  actor_name_snapshot TEXT,
  reason TEXT,
  note TEXT,
  amount REAL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_asset_uniform_events_assignment ON asset_uniform_assignment_events(entity_type, assignment_id, created_at);
CREATE INDEX IF NOT EXISTS idx_asset_uniform_events_employee ON asset_uniform_assignment_events(employee_id, created_at);
CREATE INDEX IF NOT EXISTS idx_asset_uniform_events_action ON asset_uniform_assignment_events(action, created_at);

CREATE TABLE IF NOT EXISTS employee_note_categories (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  default_visibility TEXT NOT NULL DEFAULT 'GENERAL' CHECK (default_visibility IN ('GENERAL', 'HR_ONLY', 'RESTRICTED')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS employee_notes (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  title TEXT NOT NULL,
  note_body TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'GENERAL' CHECK (visibility IN ('GENERAL', 'HR_ONLY', 'RESTRICTED')),
  linked_module TEXT,
  linked_entity_id TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  created_by_user_id TEXT NOT NULL,
  updated_by_user_id TEXT,
  archived_by_user_id TEXT,
  archived_at TEXT,
  archive_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES employee_note_categories(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (archived_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_employee_notes_employee ON employee_notes(employee_id, is_archived, visibility);

CREATE TABLE IF NOT EXISTS employee_note_versions (
  id TEXT PRIMARY KEY,
  employee_note_id TEXT NOT NULL,
  version_no INTEGER NOT NULL,
  title TEXT NOT NULL,
  note_body TEXT NOT NULL,
  visibility TEXT NOT NULL,
  linked_module TEXT,
  linked_entity_id TEXT,
  edited_by_user_id TEXT NOT NULL,
  edit_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(employee_note_id, version_no),
  FOREIGN KEY (employee_note_id) REFERENCES employee_notes(id) ON DELETE CASCADE,
  FOREIGN KEY (edited_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS employee_note_attachments (
  id TEXT PRIMARY KEY,
  employee_note_id TEXT NOT NULL,
  employee_document_id TEXT,
  description TEXT,
  attached_by_user_id TEXT NOT NULL,
  attached_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (employee_note_id) REFERENCES employee_notes(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_document_id) REFERENCES employee_documents(id) ON DELETE SET NULL,
  FOREIGN KEY (attached_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS employee_audit_export_logs (
  id TEXT PRIMARY KEY,
  employee_id TEXT,
  filters_json TEXT,
  exported_by_user_id TEXT,
  exported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL,
  FOREIGN KEY (exported_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS employee_kyc_update_requests (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  requested_by_user_id TEXT NOT NULL,
  section TEXT NOT NULL,
  field_key TEXT,
  old_value_json TEXT,
  requested_value_json TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED', 'REVIEWED', 'APPROVED', 'REJECTED', 'CANCELLED')),
  reviewed_by_user_id TEXT,
  reviewed_at TEXT,
  review_note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_employee_kyc_requests_employee ON employee_kyc_update_requests(employee_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_employee_kyc_requests_status ON employee_kyc_update_requests(status, created_at);

CREATE TABLE IF NOT EXISTS approval_workflow_settings (
  id TEXT PRIMARY KEY,
  company_id TEXT,
  approval_workflows_enabled INTEGER NOT NULL DEFAULT 1 CHECK (approval_workflows_enabled IN (0, 1)),
  use_central_workflow_for_supported_modules INTEGER NOT NULL DEFAULT 0 CHECK (use_central_workflow_for_supported_modules IN (0, 1)),
  fallback_to_module_approval_if_no_workflow INTEGER NOT NULL DEFAULT 1 CHECK (fallback_to_module_approval_if_no_workflow IN (0, 1)),
  allow_auto_approval INTEGER NOT NULL DEFAULT 1 CHECK (allow_auto_approval IN (0, 1)),
  block_self_approval_by_default INTEGER NOT NULL DEFAULT 1 CHECK (block_self_approval_by_default IN (0, 1)),
  allow_super_admin_self_approval_override INTEGER NOT NULL DEFAULT 1 CHECK (allow_super_admin_self_approval_override IN (0, 1)),
  allow_delegation INTEGER NOT NULL DEFAULT 1 CHECK (allow_delegation IN (0, 1)),
  allow_parallel_approvals INTEGER NOT NULL DEFAULT 1 CHECK (allow_parallel_approvals IN (0, 1)),
  allow_any_one_approval_mode INTEGER NOT NULL DEFAULT 1 CHECK (allow_any_one_approval_mode IN (0, 1)),
  allow_all_required_approval_mode INTEGER NOT NULL DEFAULT 1 CHECK (allow_all_required_approval_mode IN (0, 1)),
  escalation_enabled INTEGER NOT NULL DEFAULT 1 CHECK (escalation_enabled IN (0, 1)),
  reminders_enabled INTEGER NOT NULL DEFAULT 1 CHECK (reminders_enabled IN (0, 1)),
  default_escalation_time_basis TEXT NOT NULL DEFAULT 'CALENDAR_DAYS' CHECK (default_escalation_time_basis IN ('CALENDAR_DAYS', 'WORKING_DAYS')),
  default_employee_visibility_mode TEXT NOT NULL DEFAULT 'STEP_NAMES_ONLY' CHECK (default_employee_visibility_mode IN ('STEP_NAMES_ONLY', 'STEP_NAMES_AND_APPROVER_ROLES', 'FULL_APPROVER_NAMES')),
  notify_on_submission INTEGER NOT NULL DEFAULT 1 CHECK (notify_on_submission IN (0, 1)),
  notify_on_approval INTEGER NOT NULL DEFAULT 1 CHECK (notify_on_approval IN (0, 1)),
  notify_on_rejection INTEGER NOT NULL DEFAULT 1 CHECK (notify_on_rejection IN (0, 1)),
  notify_on_send_back INTEGER NOT NULL DEFAULT 1 CHECK (notify_on_send_back IN (0, 1)),
  notify_on_escalation INTEGER NOT NULL DEFAULT 1 CHECK (notify_on_escalation IN (0, 1)),
  notify_on_overdue INTEGER NOT NULL DEFAULT 1 CHECK (notify_on_overdue IN (0, 1)),
  require_reason_for_reject INTEGER NOT NULL DEFAULT 1 CHECK (require_reason_for_reject IN (0, 1)),
  require_reason_for_send_back INTEGER NOT NULL DEFAULT 1 CHECK (require_reason_for_send_back IN (0, 1)),
  require_reason_for_override INTEGER NOT NULL DEFAULT 1 CHECK (require_reason_for_override IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS approval_workflows (
  id TEXT PRIMARY KEY,
  workflow_code TEXT NOT NULL UNIQUE,
  workflow_name TEXT NOT NULL,
  description TEXT,
  module_key TEXT NOT NULL,
  action_key TEXT NOT NULL,
  applies_to_entity_type TEXT NOT NULL,
  priority_number INTEGER NOT NULL DEFAULT 100,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
  fallback_behavior TEXT NOT NULL DEFAULT 'MODULE_DEFAULT' CHECK (fallback_behavior IN ('MODULE_DEFAULT', 'AUTO_APPROVE', 'BLOCK_IF_NO_MATCH', 'REQUIRE_MANUAL_APPROVER')),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED')),
  effective_from TEXT,
  effective_to TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  archived_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  archived_at TEXT,
  metadata_json TEXT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (archived_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_approval_workflows_module_action ON approval_workflows(module_key, action_key);
CREATE INDEX IF NOT EXISTS idx_approval_workflows_status_enabled ON approval_workflows(status, is_enabled);
CREATE INDEX IF NOT EXISTS idx_approval_workflows_priority ON approval_workflows(module_key, action_key, priority_number);

CREATE TABLE IF NOT EXISTS approval_workflow_conditions (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  condition_group TEXT NOT NULL DEFAULT 'default',
  condition_order INTEGER NOT NULL DEFAULT 1,
  field_key TEXT NOT NULL,
  operator TEXT NOT NULL CHECK (operator IN ('EQUALS', 'NOT_EQUALS', 'IN', 'NOT_IN', 'GREATER_THAN', 'GREATER_THAN_OR_EQUAL', 'LESS_THAN', 'LESS_THAN_OR_EQUAL', 'BETWEEN', 'EXISTS', 'NOT_EXISTS', 'CONTAINS')),
  value_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (workflow_id) REFERENCES approval_workflows(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_approval_workflow_conditions_workflow ON approval_workflow_conditions(workflow_id, condition_group, condition_order);

CREATE TABLE IF NOT EXISTS approval_workflow_steps (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  step_number INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  step_description TEXT,
  step_mode TEXT NOT NULL DEFAULT 'SEQUENTIAL' CHECK (step_mode IN ('SEQUENTIAL', 'PARALLEL')),
  approval_mode TEXT NOT NULL DEFAULT 'ANY_ONE' CHECK (approval_mode IN ('ANY_ONE', 'ALL_REQUIRED')),
  approver_type TEXT NOT NULL CHECK (approver_type IN ('SPECIFIC_USER', 'ROLE', 'PERMISSION', 'REPORTING_MANAGER', 'DEPARTMENT_MANAGER', 'DEPARTMENT_HEAD', 'WORKSITE_MANAGER', 'LOCATION_MANAGER', 'JOB_LEVEL_APPROVER', 'EMPLOYEE_ASSIGNED_APPROVER', 'PREVIOUS_STEP_APPROVER', 'SUPER_ADMIN_FALLBACK', 'REQUEST_CREATOR_MANAGER', 'CUSTOM_RESOLVER_PLACEHOLDER')),
  approver_user_id TEXT,
  approver_role_id TEXT,
  approver_permission_key TEXT,
  approver_scope_rule TEXT,
  minimum_job_level TEXT,
  allow_self_approval INTEGER CHECK (allow_self_approval IS NULL OR allow_self_approval IN (0, 1)),
  skip_if_no_approver INTEGER NOT NULL DEFAULT 0 CHECK (skip_if_no_approver IN (0, 1)),
  fallback_approver_type TEXT,
  fallback_user_id TEXT,
  fallback_role_id TEXT,
  reminder_after_hours INTEGER,
  escalation_after_hours INTEGER,
  escalation_target_type TEXT,
  escalation_user_id TEXT,
  escalation_role_id TEXT,
  is_required INTEGER NOT NULL DEFAULT 1 CHECK (is_required IN (0, 1)),
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  UNIQUE(workflow_id, step_number),
  FOREIGN KEY (workflow_id) REFERENCES approval_workflows(id) ON DELETE CASCADE,
  FOREIGN KEY (approver_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (approver_role_id) REFERENCES roles(id) ON DELETE SET NULL,
  FOREIGN KEY (fallback_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (fallback_role_id) REFERENCES roles(id) ON DELETE SET NULL,
  FOREIGN KEY (escalation_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (escalation_role_id) REFERENCES roles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_approval_workflow_steps_workflow ON approval_workflow_steps(workflow_id, step_number);
CREATE INDEX IF NOT EXISTS idx_approval_workflow_steps_enabled ON approval_workflow_steps(workflow_id, is_enabled);

CREATE TABLE IF NOT EXISTS approval_instances (
  id TEXT PRIMARY KEY,
  workflow_id TEXT,
  workflow_code_snapshot TEXT,
  workflow_name_snapshot TEXT,
  module_key TEXT NOT NULL,
  action_key TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  employee_id TEXT,
  request_title TEXT NOT NULL,
  request_summary_json TEXT,
  request_amount REAL,
  request_days REAL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PENDING', 'PARTIALLY_APPROVED', 'APPROVED', 'REJECTED', 'SENT_BACK', 'CANCELLED', 'EXPIRED', 'OVERRIDDEN')),
  current_step_number INTEGER,
  submitted_by_user_id TEXT NOT NULL,
  submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  completed_at TEXT,
  cancelled_by_user_id TEXT,
  cancelled_at TEXT,
  cancellation_reason TEXT,
  final_decision_by_user_id TEXT,
  final_decision_at TEXT,
  final_decision_reason TEXT,
  fallback_used INTEGER NOT NULL DEFAULT 0 CHECK (fallback_used IN (0, 1)),
  auto_approved INTEGER NOT NULL DEFAULT 0 CHECK (auto_approved IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (workflow_id) REFERENCES approval_workflows(id) ON DELETE SET NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL,
  FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (cancelled_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (final_decision_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_instances_active_entity ON approval_instances(module_key, action_key, entity_type, entity_id) WHERE status IN ('DRAFT', 'PENDING', 'PARTIALLY_APPROVED', 'SENT_BACK');
CREATE INDEX IF NOT EXISTS idx_approval_instances_module_action ON approval_instances(module_key, action_key);
CREATE INDEX IF NOT EXISTS idx_approval_instances_entity ON approval_instances(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_approval_instances_employee ON approval_instances(employee_id);
CREATE INDEX IF NOT EXISTS idx_approval_instances_status ON approval_instances(status, created_at);
CREATE INDEX IF NOT EXISTS idx_approval_instances_submitted_by ON approval_instances(submitted_by_user_id, created_at);

CREATE TABLE IF NOT EXISTS approval_instance_steps (
  id TEXT PRIMARY KEY,
  approval_instance_id TEXT NOT NULL,
  workflow_step_id TEXT,
  step_number INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  step_mode TEXT NOT NULL CHECK (step_mode IN ('SEQUENTIAL', 'PARALLEL')),
  approval_mode TEXT NOT NULL CHECK (approval_mode IN ('ANY_ONE', 'ALL_REQUIRED')),
  status TEXT NOT NULL DEFAULT 'WAITING' CHECK (status IN ('WAITING', 'PENDING', 'APPROVED', 'REJECTED', 'SENT_BACK', 'SKIPPED', 'ESCALATED', 'DELEGATED', 'CANCELLED')),
  required_approver_count INTEGER NOT NULL DEFAULT 0,
  approved_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  sent_back_count INTEGER NOT NULL DEFAULT 0,
  due_at TEXT,
  reminder_due_at TEXT,
  escalation_due_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (approval_instance_id) REFERENCES approval_instances(id) ON DELETE CASCADE,
  FOREIGN KEY (workflow_step_id) REFERENCES approval_workflow_steps(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_approval_instance_steps_instance ON approval_instance_steps(approval_instance_id, step_number);
CREATE INDEX IF NOT EXISTS idx_approval_instance_steps_status ON approval_instance_steps(status, due_at);

CREATE TABLE IF NOT EXISTS approval_step_assignees (
  id TEXT PRIMARY KEY,
  approval_instance_step_id TEXT NOT NULL,
  approval_instance_id TEXT NOT NULL,
  assigned_user_id TEXT NOT NULL,
  assigned_user_name_snapshot TEXT NOT NULL,
  assigned_role_snapshot TEXT,
  assignment_type TEXT NOT NULL DEFAULT 'DIRECT' CHECK (assignment_type IN ('DIRECT', 'ROLE_RESOLVED', 'MANAGER_RESOLVED', 'DELEGATED', 'ESCALATED', 'FALLBACK')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'SENT_BACK', 'SKIPPED', 'DELEGATED', 'ESCALATED', 'CANCELLED')),
  delegated_from_user_id TEXT,
  escalated_from_user_id TEXT,
  decision_at TEXT,
  decision_note TEXT,
  decision_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (approval_instance_step_id) REFERENCES approval_instance_steps(id) ON DELETE CASCADE,
  FOREIGN KEY (approval_instance_id) REFERENCES approval_instances(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (delegated_from_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (escalated_from_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_step_assignees_unique ON approval_step_assignees(approval_instance_step_id, assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_approval_step_assignees_user_status ON approval_step_assignees(assigned_user_id, status);
CREATE INDEX IF NOT EXISTS idx_approval_step_assignees_instance ON approval_step_assignees(approval_instance_id, status);

CREATE TABLE IF NOT EXISTS approval_actions (
  id TEXT PRIMARY KEY,
  approval_instance_id TEXT NOT NULL,
  approval_instance_step_id TEXT,
  assignee_id TEXT,
  module_key TEXT NOT NULL,
  action_key TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  employee_id TEXT,
  action TEXT NOT NULL CHECK (action IN ('SUBMITTED', 'APPROVED', 'REJECTED', 'SENT_BACK', 'CANCELLED', 'ESCALATED', 'DELEGATED', 'REMINDER_SENT', 'AUTO_APPROVED', 'OVERRIDDEN', 'SKIPPED', 'COMPLETED')),
  actor_user_id TEXT,
  actor_name_snapshot TEXT,
  previous_status TEXT,
  new_status TEXT,
  note TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (approval_instance_id) REFERENCES approval_instances(id) ON DELETE CASCADE,
  FOREIGN KEY (approval_instance_step_id) REFERENCES approval_instance_steps(id) ON DELETE SET NULL,
  FOREIGN KEY (assignee_id) REFERENCES approval_step_assignees(id) ON DELETE SET NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_approval_actions_instance ON approval_actions(approval_instance_id, created_at);
CREATE INDEX IF NOT EXISTS idx_approval_actions_entity ON approval_actions(entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_approval_actions_employee ON approval_actions(employee_id, created_at);

CREATE TABLE IF NOT EXISTS approval_delegation_rules (
  id TEXT PRIMARY KEY,
  delegator_user_id TEXT NOT NULL,
  delegate_user_id TEXT NOT NULL,
  module_key TEXT,
  action_key TEXT,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'EXPIRED', 'CANCELLED')),
  created_by_user_id TEXT NOT NULL,
  cancelled_by_user_id TEXT,
  cancelled_at TEXT,
  cancellation_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (delegator_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (delegate_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (cancelled_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_approval_delegation_delegator ON approval_delegation_rules(delegator_user_id, status, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_approval_delegation_delegate ON approval_delegation_rules(delegate_user_id, status, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_approval_delegation_module_action ON approval_delegation_rules(module_key, action_key, status);

CREATE TABLE IF NOT EXISTS approval_escalation_rules (
  id TEXT PRIMARY KEY,
  workflow_id TEXT,
  workflow_step_id TEXT,
  module_key TEXT,
  action_key TEXT,
  reminder_after_hours INTEGER,
  escalation_after_hours INTEGER,
  time_basis TEXT NOT NULL DEFAULT 'CALENDAR_DAYS' CHECK (time_basis IN ('CALENDAR_DAYS', 'WORKING_DAYS', 'WORKING_HOURS_PLACEHOLDER')),
  escalation_target_type TEXT CHECK (escalation_target_type IS NULL OR escalation_target_type IN ('SPECIFIC_USER', 'ROLE', 'REPORTING_MANAGER', 'DEPARTMENT_HEAD', 'SUPER_ADMIN_FALLBACK', 'PERMISSION')),
  escalation_user_id TEXT,
  escalation_role_id TEXT,
  escalation_permission_key TEXT,
  repeat_reminder_every_hours INTEGER,
  max_reminders INTEGER,
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (workflow_id) REFERENCES approval_workflows(id) ON DELETE CASCADE,
  FOREIGN KEY (workflow_step_id) REFERENCES approval_workflow_steps(id) ON DELETE CASCADE,
  FOREIGN KEY (escalation_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (escalation_role_id) REFERENCES roles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_approval_escalation_workflow ON approval_escalation_rules(workflow_id, workflow_step_id, is_enabled);
CREATE INDEX IF NOT EXISTS idx_approval_escalation_module_action ON approval_escalation_rules(module_key, action_key, is_enabled);

CREATE TABLE IF NOT EXISTS approval_notification_templates (
  id TEXT PRIMARY KEY,
  template_code TEXT NOT NULL UNIQUE,
  template_name TEXT NOT NULL,
  module_key TEXT,
  action_key TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('SUBMITTED', 'APPROVED', 'REJECTED', 'SENT_BACK', 'CANCELLED', 'ESCALATED', 'OVERDUE', 'DELEGATED', 'FINALIZED', 'REMINDER')),
  channel TEXT NOT NULL DEFAULT 'IN_APP' CHECK (channel IN ('IN_APP', 'SYSTEM_ALERT', 'EMAIL_PLACEHOLDER')),
  subject_template TEXT,
  body_template TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  metadata_json TEXT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_approval_notification_templates_module_action ON approval_notification_templates(module_key, action_key, event_type);
CREATE INDEX IF NOT EXISTS idx_approval_notification_templates_enabled ON approval_notification_templates(is_enabled, channel);

-- Post-production performance indexes: additive only, tuned for common scoped list/search filters.
CREATE INDEX IF NOT EXISTS idx_performance_notifications_user_created ON notifications(recipient_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_performance_employees_active_lookup ON employees(archived_at, primary_department_id, primary_location_id, status_id);
CREATE INDEX IF NOT EXISTS idx_performance_employee_documents_employee_type_status ON employee_documents(employee_id, document_type_id, status, expiry_date);
CREATE INDEX IF NOT EXISTS idx_performance_leave_requests_status_dates ON leave_requests(status, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_performance_attendance_daily_date_status ON attendance_daily_records(attendance_date, status, employee_id);
CREATE INDEX IF NOT EXISTS idx_performance_payroll_results_status_run_employee ON payroll_employee_results(status, payroll_run_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_performance_approval_instances_status_employee ON approval_instances(status, employee_id, created_at);
CREATE INDEX IF NOT EXISTS idx_performance_onboarding_status_created ON employee_onboarding_cases(onboarding_status, created_at);
CREATE INDEX IF NOT EXISTS idx_performance_offboarding_status_created ON employee_offboarding_cases(offboarding_status, created_at);
CREATE INDEX IF NOT EXISTS idx_performance_audit_logs_module_created ON audit_logs(module, created_at);
