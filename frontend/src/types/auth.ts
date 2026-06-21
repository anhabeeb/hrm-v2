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
  };
}
