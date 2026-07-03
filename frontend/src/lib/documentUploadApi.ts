import { API_BASE_URL, ApiError } from "./apiClient";
import { createApiRequestId, recordApiRequestTiming } from "./performance";

type ApiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
    validation_errors?: Array<Record<string, unknown>>;
    field_errors?: Record<string, string[]>;
  };
};

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
};

async function requestJson<T>(path: string, token: string, body: Record<string, unknown>) {
  const requestId = createApiRequestId();
  const startedAt = performance.now();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "X-Request-ID": requestId
    },
    body: JSON.stringify(body)
  });
  recordApiRequestTiming({ method: "POST", path, status: response.status, durationMs: performance.now() - startedAt, requestId, cache: "network", serverTiming: response.headers.get("Server-Timing") });
  let envelope: ApiEnvelope<T>;
  try {
    envelope = (await response.json()) as ApiEnvelope<T>;
  } catch {
    envelope = { ok: false, error: { code: "INVALID_RESPONSE", message: "The server returned an invalid response." } };
  }
  if (!response.ok || !envelope.ok || !envelope.data) {
    throw new ApiError(envelope.error?.message ?? "Document upload request failed.", envelope.error?.code ?? "DOCUMENT_UPLOAD_REQUEST_FAILED", response.status, {
      validationErrors: envelope.error?.validation_errors ?? [],
      fieldErrors: envelope.error?.field_errors ?? {}
    });
  }
  return envelope.data;
}

export function prepareOnboardingDocumentUploads(token: string, caseId: string, rows: PreparedDocumentUploadRow[]) {
  return requestJson<PrepareDocumentUploadsResult>(`/api/v1/onboarding/cases/${caseId}/documents/uploads/prepare`, token, { rows });
}

export function completeOnboardingDocumentUploads(token: string, caseId: string, uploadIds: string[]) {
  return requestJson<CompleteDocumentUploadsResult>(`/api/v1/onboarding/cases/${caseId}/documents/uploads/complete`, token, { upload_ids: uploadIds });
}
