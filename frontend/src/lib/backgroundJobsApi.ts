import type { BackgroundJobDetailResponse, BackgroundJobsResponse } from "../types/background-jobs";
import { apiClient } from "./api";

export type BackgroundJobListParams = {
  status?: string;
  job_type?: string;
  limit?: number;
  offset?: number;
  scope?: "mine" | "all";
};

function query(params: BackgroundJobListParams = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export const backgroundJobsApi = {
  list(token: string, params: BackgroundJobListParams = {}, signal?: AbortSignal) {
    return apiClient.get<BackgroundJobsResponse>(`/api/v1/background-jobs${query(params)}`, { token, signal });
  },
  detail(token: string, jobId: string, signal?: AbortSignal) {
    return apiClient.get<BackgroundJobDetailResponse>(`/api/v1/background-jobs/${encodeURIComponent(jobId)}`, { token, signal });
  },
  retry(token: string, jobId: string) {
    return apiClient.post<{ job: BackgroundJobDetailResponse["job"] }>(`/api/v1/background-jobs/${encodeURIComponent(jobId)}/retry`, undefined, { token });
  },
  cancel(token: string, jobId: string) {
    return apiClient.post<{ job: BackgroundJobDetailResponse["job"] }>(`/api/v1/background-jobs/${encodeURIComponent(jobId)}/cancel`, undefined, { token });
  }
};
