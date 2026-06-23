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
  employee_id TEXT NOT NULL,
  task_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  module TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'SKIPPED', 'BLOCKED')),
  required INTEGER NOT NULL DEFAULT 1 CHECK (required IN (0, 1)),
  completed_by_user_id TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (completed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_onboarding_task_unique ON employee_onboarding_tasks(employee_id, task_key);
CREATE INDEX IF NOT EXISTS idx_employee_onboarding_employee ON employee_onboarding_tasks(employee_id, status);

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
  max_file_size_mb REAL NOT NULL DEFAULT 10 CHECK (max_file_size_mb > 0),
  allow_multiple_files INTEGER NOT NULL DEFAULT 0 CHECK (allow_multiple_files IN (0, 1)),
  requires_expiry_date INTEGER NOT NULL DEFAULT 0 CHECK (requires_expiry_date IN (0, 1)),
  requires_issue_date INTEGER NOT NULL DEFAULT 0 CHECK (requires_issue_date IN (0, 1)),
  requires_document_number INTEGER NOT NULL DEFAULT 0 CHECK (requires_document_number IN (0, 1)),
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
  type TEXT NOT NULL DEFAULT 'BIOMETRIC' CHECK (type IN ('BIOMETRIC', 'MANUAL_IMPORT', 'API', 'BRIDGE', 'OTHER')),
  ip_address TEXT,
  serial_number TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'DISABLED')),
  last_sync_at TEXT,
  last_seen_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL
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
  employee_id TEXT,
  external_employee_code TEXT,
  punch_time TEXT NOT NULL,
  punch_type TEXT DEFAULT 'UNKNOWN' CHECK (punch_type IN ('IN', 'OUT', 'BREAK_IN', 'BREAK_OUT', 'UNKNOWN') OR punch_type IS NULL),
  source TEXT NOT NULL DEFAULT 'DEVICE' CHECK (source IN ('DEVICE', 'MANUAL_IMPORT', 'API', 'BRIDGE')),
  raw_payload_json TEXT,
  imported_by_user_id TEXT,
  imported_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (device_id) REFERENCES attendance_devices(id) ON DELETE SET NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL,
  FOREIGN KEY (imported_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_raw_logs_dedupe ON attendance_raw_logs(COALESCE(device_id, ''), COALESCE(external_employee_code, ''), punch_time, COALESCE(punch_type, 'UNKNOWN'));
CREATE INDEX IF NOT EXISTS idx_attendance_raw_logs_employee_time ON attendance_raw_logs(employee_id, punch_time);
CREATE INDEX IF NOT EXISTS idx_attendance_raw_logs_device_time ON attendance_raw_logs(device_id, punch_time);

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
  default_currency TEXT NOT NULL DEFAULT 'MVR',
  default_daily_rate_mode TEXT NOT NULL DEFAULT 'FIXED_30_DAYS' CHECK (default_daily_rate_mode IN ('CALENDAR_DAYS', 'WORKING_DAYS', 'FIXED_30_DAYS')),
  allow_negative_net_salary INTEGER NOT NULL DEFAULT 0 CHECK (allow_negative_net_salary IN (0, 1)),
  require_approval_before_paid INTEGER NOT NULL DEFAULT 1 CHECK (require_approval_before_paid IN (0, 1)),
  include_attendance_deductions INTEGER NOT NULL DEFAULT 1 CHECK (include_attendance_deductions IN (0, 1)),
  include_leave_deductions INTEGER NOT NULL DEFAULT 1 CHECK (include_leave_deductions IN (0, 1)),
  include_advance_deductions INTEGER NOT NULL DEFAULT 1 CHECK (include_advance_deductions IN (0, 1)),
  include_roster_scheduled_days INTEGER NOT NULL DEFAULT 1 CHECK (include_roster_scheduled_days IN (0, 1)),
  default_salary_payment_day INTEGER CHECK (default_salary_payment_day BETWEEN 1 AND 31),
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
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'CALCULATING', 'READY_FOR_REVIEW', 'APPROVED_PLACEHOLDER', 'FINALIZED_PLACEHOLDER', 'LOCKED', 'CANCELLED', 'OPEN', 'PROCESSING', 'REVIEW', 'APPROVED', 'PAID', 'CLOSED')),
  created_by_user_id TEXT,
  approved_by_user_id TEXT,
  approved_at TEXT,
  paid_by_user_id TEXT,
  paid_at TEXT,
  closed_by_user_id TEXT,
  closed_at TEXT,
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
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'CALCULATING', 'READY_FOR_REVIEW', 'APPROVED_PLACEHOLDER', 'FINALIZED_PLACEHOLDER', 'LOCKED', 'CANCELLED', 'PROCESSING', 'REVIEW', 'APPROVED', 'PAID')),
  calculation_mode TEXT NOT NULL DEFAULT 'STANDARD' CHECK (calculation_mode IN ('STANDARD', 'RECALCULATION', 'FINAL_SETTLEMENT')),
  generated_by_user_id TEXT,
  generated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  approved_by_user_id TEXT,
  approved_at TEXT,
  paid_by_user_id TEXT,
  paid_at TEXT,
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
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED_PLACEHOLDER', 'FINALIZED_PLACEHOLDER', 'HELD', 'EXCLUDED', 'CANCELLED', 'REVIEW', 'APPROVED', 'PAID')),
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
  line_type TEXT NOT NULL CHECK (line_type IN ('EARNING', 'DEDUCTION')),
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
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'READY_FOR_REVIEW', 'APPROVED_PLACEHOLDER', 'FINALIZED_PLACEHOLDER', 'HELD', 'EXCLUDED', 'CANCELLED')),
  hold_reason TEXT,
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
  line_type TEXT NOT NULL CHECK (line_type IN ('EARNING', 'DEDUCTION')),
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
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS asset_items (
  id TEXT PRIMARY KEY,
  category_id TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  variant TEXT,
  size TEXT,
  serial_no TEXT,
  condition_status TEXT NOT NULL DEFAULT 'GOOD' CHECK (condition_status IN ('NEW', 'GOOD', 'FAIR', 'DAMAGED', 'LOST', 'WRITTEN_OFF')),
  status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'ISSUED', 'DAMAGED', 'LOST', 'WRITTEN_OFF', 'ARCHIVED')),
  replacement_cost REAL CHECK (replacement_cost IS NULL OR replacement_cost >= 0),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (category_id) REFERENCES asset_categories(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_asset_items_category ON asset_items(category_id, status, condition_status);

CREATE TABLE IF NOT EXISTS employee_asset_assignments (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  asset_item_id TEXT NOT NULL,
  issued_date TEXT NOT NULL,
  issued_by_user_id TEXT NOT NULL,
  expected_return_date TEXT,
  returned_date TEXT,
  returned_to_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED', 'RETURNED', 'DAMAGED', 'LOST', 'REPLACED', 'WRITTEN_OFF')),
  condition_on_issue TEXT,
  condition_on_return TEXT,
  deduction_amount REAL CHECK (deduction_amount IS NULL OR deduction_amount >= 0),
  payroll_deduction_id TEXT,
  payroll_adjustment_id TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  FOREIGN KEY (asset_item_id) REFERENCES asset_items(id) ON DELETE RESTRICT,
  FOREIGN KEY (issued_by_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (returned_to_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (payroll_deduction_id) REFERENCES payroll_deductions(id) ON DELETE SET NULL,
  FOREIGN KEY (payroll_adjustment_id) REFERENCES payroll_adjustments(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_employee_asset_assignments_employee ON employee_asset_assignments(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_employee_asset_assignments_item ON employee_asset_assignments(asset_item_id, status);

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
