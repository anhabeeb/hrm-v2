export interface Env {
  DB: D1Database;
  DOCUMENTS_BUCKET: R2Bucket;
  JWT_SECRET: string;
  CORS_ORIGIN?: string;
  ENVIRONMENT?: string;
}

export type UserStatus = "ACTIVE" | "DISABLED" | "LOCKED";

export interface DbUser {
  id: string;
  name: string;
  email: string;
  username: string | null;
  password_hash: string;
  status: UserStatus;
  is_owner: number;
  employee_id: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  username: string | null;
  status: UserStatus;
  is_owner: boolean;
  employee_id: string | null;
  employee_full_name?: string | null;
  employee_display_name?: string | null;
  employee_position_title?: string | null;
  employee_job_title?: string | null;
  employee_designation?: string | null;
  employee_role_title?: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuthUser extends SafeUser {
  roles: string[];
  permissions: string[];
  module_visibility?: Record<string, boolean>;
}

export interface JwtPayload {
  sub: string;
  email: string;
  iat: number;
  exp: number;
  jti: string;
}

export interface AppVariables {
  currentUser: AuthUser;
  routeTiming: {
    queryCount: number;
  };
}

export type AppBindings = {
  Bindings: Env;
  Variables: AppVariables;
};
