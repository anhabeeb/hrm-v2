export type UserStatus = "ACTIVE" | "DISABLED" | "LOCKED";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  username: string | null;
  status: UserStatus;
  is_owner: boolean;
  employee_id: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  roles: string[];
  role_ids?: string[];
  permissions: string[];
}

export interface AccessUser extends Omit<AuthUser, "permissions"> {
  role_ids: string[];
  employee_no?: string | null;
  employee_name?: string | null;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  is_system_role: boolean;
  is_protected: boolean;
  is_active: boolean;
  is_owner_role: boolean;
  permission_count: number;
  user_count: number;
  permissions: string[];
  created_at: string;
  updated_at: string;
}

export interface Permission {
  id: string;
  key: string;
  module: string;
  description: string | null;
  is_critical: boolean;
  created_at: string;
}

export type AccessScopeOwnerType = "ROLE" | "USER" | "ROLE_MAPPING_RULE";
export type AccessScopeType =
  | "SELF_ONLY"
  | "OWN_TEAM"
  | "OWN_DEPARTMENT"
  | "SELECTED_DEPARTMENTS"
  | "OWN_LOCATION"
  | "SELECTED_LOCATIONS"
  | "ALL_LOCATIONS"
  | "WHOLE_COMPANY";

export interface AccessScopeRule {
  id: string;
  name: string;
  description: string | null;
  scope_owner_type: AccessScopeOwnerType;
  role_id: string | null;
  role_name: string | null;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  role_mapping_rule_id: string | null;
  role_mapping_name: string | null;
  role_mapping_role_name: string | null;
  module_key: string | null;
  scope_type: AccessScopeType;
  allowed_department_ids: string[];
  allowed_location_ids: string[];
  include_sub_departments: boolean;
  include_reporting_chain: boolean;
  can_view: boolean;
  can_manage: boolean;
  is_active: boolean;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoleMappingRule {
  id: string;
  name: string;
  description: string | null;
  default_role_id: string;
  role_name: string | null;
  employee_type: string | null;
  employment_type: string | null;
  department_id: string | null;
  department_name: string | null;
  position_id: string | null;
  position_title: string | null;
  location_id: string | null;
  location_name: string | null;
  job_level_id: string | null;
  job_level_name: string | null;
  default_scope_type: AccessScopeType;
  allowed_department_ids: string[];
  allowed_location_ids: string[];
  include_sub_departments: boolean;
  include_reporting_chain: boolean;
  can_view: boolean;
  can_manage: boolean;
  priority: number;
  is_active: boolean;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmployeeUserAccessPreview {
  employee: Record<string, unknown>;
  linked_user: { id: string; email: string | null } | null;
  assigned_roles: Array<{ id: string; name: string }>;
  assigned_scopes: AccessScopeRule[];
  suggested_role_mapping: RoleMappingRule | null;
  suggested_role: { id: string; name: string } | null;
  suggested_scope: {
    scope_type: AccessScopeType;
    allowed_department_ids: string[];
    allowed_location_ids: string[];
    include_sub_departments: boolean;
    include_reporting_chain: boolean;
    can_view: boolean;
    can_manage: boolean;
  } | null;
}

export interface EmployeeUserAccount {
  employee: Record<string, unknown>;
  linked_user: {
    id: string;
    name: string;
    email: string;
    username: string | null;
    status: UserStatus;
    is_owner: boolean;
    employee_id: string | null;
    employee_no: string | null;
    employee_name: string | null;
    last_login_at: string | null;
    created_at: string;
    updated_at: string;
  } | null;
  account_status: string;
  invite_status: "PASSWORD_SET" | "INVITE_RESET_PENDING" | "RESET_REQUIRED" | "DISABLED" | null;
  reset_required: boolean;
  link: {
    id: string;
    status: "ACTIVE" | "UNLINKED" | "DEACTIVATED";
    linked_at: string;
    linked_by_user_id: string | null;
    linked_by_name: string | null;
    self_service_enabled_snapshot: boolean;
    invite_status: "PASSWORD_SET" | "INVITE_RESET_PENDING" | "RESET_REQUIRED" | "DISABLED";
    reset_required: boolean;
    employee_email_used: string | null;
    account_email_created: string | null;
    email_source: string | null;
    email_override_reason: string | null;
  } | null;
  link_history: Array<{
    id: string;
    status: "ACTIVE" | "UNLINKED" | "DEACTIVATED";
    user_id: string;
    linked_at: string;
    linked_by_name?: string | null;
    unlinked_at?: string | null;
    unlinked_by_name?: string | null;
    unlink_reason?: string | null;
    deactivated_at?: string | null;
    deactivated_by_name?: string | null;
    deactivation_reason?: string | null;
    invite_status?: string | null;
    account_email_created?: string | null;
  }>;
  roles: Array<{ id: string; name: string; is_active: boolean; is_protected: boolean }>;
  role_ids: string[];
  permissions: string[];
  scopes: AccessScopeRule[];
  access_scope_ids: string[];
  self_service_enabled: boolean;
  employee_email: {
    email: string | null;
    raw_email: string | null;
    is_valid: boolean;
    source: string;
    message: string;
    recommendation: "BLOCK_DUPLICATE_LINKED_EMPLOYEE" | "ALREADY_LINKED" | "LINK_EXISTING_USER" | "PROVISION_WITH_EMPLOYEE_EMAIL" | "ENTER_EMAIL";
    matching_user: {
      id: string;
      name: string;
      email: string;
      username: string | null;
      status: UserStatus;
      employee_id: string | null;
    } | null;
  };
  suggested_username: string | null;
  suggested: {
    suggested_role_mapping: RoleMappingRule | null;
    suggested_role: { id: string; name: string } | null;
    suggested_scope: EmployeeUserAccessPreview["suggested_scope"];
  } | null;
  available_users: Array<{
    id: string;
    name: string;
    email: string;
    username: string | null;
    status: UserStatus;
    employee_id: string | null;
    employee_no: string | null;
    employee_name: string | null;
  }>;
  available_access_scopes: AccessScopeRule[];
}

export interface BootstrapStatus {
  setup_required: boolean;
  setup_completed: boolean;
  owner_exists: boolean;
}

export interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    validation_errors?: Array<Record<string, unknown>>;
    field_errors?: Record<string, string[]>;
    action_errors?: string[];
    details?: Record<string, unknown>;
  };
}
