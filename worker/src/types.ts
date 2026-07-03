export interface Env {
  DB: D1Database;
  DOCUMENTS_BUCKET: R2Bucket;
  BACKGROUND_JOB_QUEUE?: Queue<BackgroundJobQueueMessage>;
  JWT_SECRET: string;
  CORS_ORIGIN?: string;
  ENVIRONMENT?: string;
  HRM_BACKGROUND_JOB_MODE?: "d1" | "queue" | "hybrid";
  HRM_QUEUE_ENABLED?: string;
  HRM_QUEUE_CONSUMER_ENABLED?: string;
  HRM_QUEUE_RETRY_LIMIT?: string;
  HRM_SCHEDULED_JOB_RUNNER_ENABLED?: string;
  HRM_DOCUMENT_UPLOAD_MODE?: "worker_proxy" | "direct_r2" | "auto" | string;
  HRM_R2_DIRECT_UPLOAD_ENABLED?: string;
  HRM_R2_PRESIGN_ENDPOINT?: string;
  HRM_R2_PRESIGN_ACCESS_KEY_ID?: string;
  HRM_R2_PRESIGN_SECRET_ACCESS_KEY?: string;
  HRM_R2_PRESIGN_BUCKET?: string;
  HRM_R2_PRESIGN_REGION?: string;
  HRM_R2_PRESIGN_URL_TTL_SECONDS?: string;
  HRM_R2_DIRECT_UPLOAD_MAX_BYTES?: string;
}

export interface BackgroundJobQueueMessage {
  job_id: string;
  job_type: string;
  module_key?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  request_id?: string | null;
  correlation_id?: string | null;
  enqueued_at: string;
  source: "background_jobs";
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
    d1DurationMs: number;
    d1Warnings: string[];
    requestId?: string;
  };
}

export type AppBindings = {
  Bindings: Env;
  Variables: AppVariables;
};
