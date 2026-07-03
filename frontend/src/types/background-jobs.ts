export type BackgroundJobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "RETRYING" | "DEAD_LETTERED";

export interface BackgroundJob {
  id: string;
  job_type: string;
  status: BackgroundJobStatus;
  priority: number;
  dedupe_key?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
  module_key?: string | null;
  requested_by_user_id?: string | null;
  company_scope_id?: string | null;
  progress_current: number;
  progress_total?: number | null;
  progress_message?: string | null;
  attempt_count: number;
  max_attempts: number;
  scheduled_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  last_error_code?: string | null;
  last_error_message?: string | null;
  created_at: string;
  updated_at: string;
  payload_summary?: unknown;
}

export interface BackgroundJobEvent {
  id: string;
  job_id: string;
  event_type: string;
  message?: string | null;
  metadata?: unknown;
  created_at: string;
}

export interface BackgroundJobsResponse {
  jobs: BackgroundJob[];
  pagination?: {
    limit: number;
    offset: number;
    returned: number;
    has_more: boolean;
  };
}

export interface BackgroundJobDetailResponse {
  job: BackgroundJob;
  events: BackgroundJobEvent[];
}
