import { apiClient } from "./apiClient";

export interface GlobalSearchItem {
  id: string;
  type: string;
  title: string;
  subtitle?: string | null;
  module: string;
  status?: string | null;
  route: string;
  icon_key?: string | null;
}

export interface GlobalSearchGroup {
  module: string;
  items: GlobalSearchItem[];
}

export interface GlobalSearchWarning {
  module: string;
  message: string;
}

export interface GlobalSearchResponse {
  query: string;
  groups: GlobalSearchGroup[];
  warnings?: GlobalSearchWarning[];
  min_query_length: number;
  message?: string;
}

function query(params?: Record<string, string | number | boolean | null | undefined>) {
  if (!params) return "";
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") search.set(key, String(value));
  });
  const value = search.toString();
  return value ? `?${value}` : "";
}

export const globalSearchApi = {
  globalSearch(token: string, params: { q?: string; limit?: number }, signal?: AbortSignal) {
    return apiClient.get<GlobalSearchResponse>(`/api/v1/search/global${query(params)}`, { token, signal, dedupe: false, requestLabel: "search.global" });
  }
};
