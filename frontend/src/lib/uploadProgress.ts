import { API_BASE_URL } from "./api";
import { createApiRequestId, recordApiRequestTiming } from "./performance";

type UploadProgressOptions = {
  url: string;
  file: File;
  token?: string | null;
  headers?: Record<string, string>;
  method?: "POST" | "PUT";
  bodyMode?: "form" | "raw";
  includeRequestId?: boolean;
  metricPath?: string;
  onProgress?: (progress: { loaded: number; total: number; percent: number }) => void;
};

function absoluteUploadUrl(url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  return `${API_BASE_URL}${url.startsWith("/") ? url : `/${url}`}`;
}

function parseJsonResponse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function uploadWithProgress<T = unknown>(options: UploadProgressOptions) {
  const requestId = createApiRequestId();
  const startedAt = performance.now();
  const method = options.method ?? "POST";
  const metricPath = options.metricPath ?? options.url;
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, absoluteUploadUrl(options.url));
    if (options.includeRequestId !== false) xhr.setRequestHeader("X-Request-ID", requestId);
    if (options.token) xhr.setRequestHeader("Authorization", `Bearer ${options.token}`);
    for (const [key, value] of Object.entries(options.headers ?? {})) {
      if (!value || key.toLowerCase() === "authorization" || key.toLowerCase() === "x-request-id") continue;
      xhr.setRequestHeader(key, value);
    }
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const percent = event.total > 0 ? Math.round((event.loaded / event.total) * 100) : 0;
      options.onProgress?.({ loaded: event.loaded, total: event.total, percent });
    };
    xhr.onerror = () => {
      recordApiRequestTiming({ method, path: metricPath, status: null, durationMs: performance.now() - startedAt, requestId, cache: "network" });
      reject(new Error("Upload failed before the server could receive the file."));
    };
    xhr.onload = () => {
      recordApiRequestTiming({ method, path: metricPath, status: xhr.status, durationMs: performance.now() - startedAt, requestId, cache: "network" });
      const payload = parseJsonResponse<{ ok?: boolean; data?: T; error?: { message?: string; code?: string } }>(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300 && (options.bodyMode === "raw" || payload?.ok !== false)) {
        resolve((payload?.data ?? payload) as T);
        return;
      }
      reject(new Error(payload?.error?.message ?? `Upload failed with status ${xhr.status}.`));
    };
    if (options.bodyMode === "raw") {
      xhr.send(options.file);
      return;
    }
    const form = new FormData();
    form.set("file", options.file);
    xhr.send(form);
  });
}
