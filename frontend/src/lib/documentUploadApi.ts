import { apiClient } from "./apiClient";

export type PreparedDocumentUploadRow = {
  client_row_id: string;
  document_type_id: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  issue_date?: string | null;
  expiry_date?: string | null;
  document_number?: string | null;
  notes?: string | null;
  checksum?: string | null;
};

export type PreparedDocumentUpload = {
  client_row_id: string;
  upload_id: string;
  upload_mode: "worker_proxy" | "direct_r2";
  mode?: "worker_proxy" | "direct_r2";
  method?: "POST" | "PUT";
  upload_url: string;
  required_headers?: Record<string, string>;
  object_key_ref?: string;
  pending_object_reference?: string;
  expires_at: string;
  max_file_size: number;
  allowed_mime_types: string[];
  checksum_algorithm?: "SHA-256" | null;
};

export type PrepareDocumentUploadsResult = {
  batch_id: string;
  mode: "worker_proxy" | "direct_r2" | "auto";
  requested_mode?: "worker_proxy" | "direct_r2" | "auto";
  direct_r2_available: boolean;
  fallback_active?: boolean;
  uploads: PreparedDocumentUpload[];
};

export type CompleteDocumentUploadsResult = {
  completed_count: number;
  failed_count: number;
  documents: Array<Record<string, unknown>>;
  results: Array<Record<string, unknown>>;
  readiness_updating?: boolean;
  recalculation_status?: string;
  background_job_ids?: string[];
  targeted_workspace_slices?: string[];
  section_status_update?: {
    mode?: "shadow" | string;
    updated_sections?: Array<Record<string, unknown>>;
    stale_sections?: Array<Record<string, unknown>>;
    stale_section_keys?: string[];
    readiness?: Record<string, unknown>;
    sections?: Array<Record<string, unknown>>;
    warning?: string | null;
  } | null;
  shadow_readiness?: Record<string, unknown> | null;
  warning?: string | null;
};

async function requestJson<T>(path: string, token: string, body: Record<string, unknown>) {
  return apiClient.post<T>(path, body, {
    token,
    requestLabel: "onboarding.workspace.documents.upload",
    timeoutMs: 15000
  });
}

export function prepareOnboardingDocumentUploads(token: string, caseId: string, rows: PreparedDocumentUploadRow[]) {
  return requestJson<PrepareDocumentUploadsResult>(`/api/v1/onboarding/cases/${caseId}/documents/uploads/prepare`, token, { rows });
}

export function completeOnboardingDocumentUploads(token: string, caseId: string, uploadIds: string[]) {
  return requestJson<CompleteDocumentUploadsResult>(`/api/v1/onboarding/cases/${caseId}/documents/uploads/complete`, token, { upload_ids: uploadIds });
}
