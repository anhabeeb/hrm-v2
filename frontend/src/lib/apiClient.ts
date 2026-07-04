import type { ApiEnvelope } from "../types/auth";
import { createApiRequestId, recordApiRequestTiming } from "./performance";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const API_REQUEST_TIMEOUT_MS = 30000;
const inflightGetRequests = new Map<string, Promise<unknown>>();

export class ApiError extends Error {
  code: string;
  status: number;
  validationErrors: Array<Record<string, unknown>>;
  fieldErrors: Record<string, string[]>;
  actionErrors: string[];
  details?: Record<string, unknown>;

  constructor(message: string, code: string, status: number, options: { validationErrors?: Array<Record<string, unknown>>; fieldErrors?: Record<string, string[]>; actionErrors?: string[]; details?: Record<string, unknown> } = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.validationErrors = options.validationErrors ?? [];
    this.fieldErrors = options.fieldErrors ?? {};
    this.actionErrors = options.actionErrors ?? [];
    this.details = options.details;
  }
}

export function apiErrorFromEnvelope(envelope: ApiEnvelope<unknown>, status: number, fallback = "Request failed.") {
  return new ApiError(envelope.error?.message ?? fallback, envelope.error?.code ?? "REQUEST_FAILED", status, {
    validationErrors: envelope.error?.validation_errors ?? [],
    fieldErrors: envelope.error?.field_errors ?? {},
    actionErrors: envelope.error?.action_errors ?? [],
    details: envelope.error?.details
  });
}

export type ApiRequestInit = Omit<RequestInit, "signal"> & {
  token?: string | null;
  signal?: AbortSignal;
  timeoutMs?: number;
  dedupe?: boolean;
  requestLabel?: string;
};

function tokenScope(token?: string | null) {
  return token ? token.slice(0, 16) : "anonymous";
}

export function normalizeMethod(method?: string) {
  return String(method ?? "GET").toUpperCase();
}

function dedupeKey(method: string, path: string, token?: string | null) {
  return `${method}:${API_BASE_URL}${path}:scope:${tokenScope(token)}`;
}

function createRequestSignal(signal?: AbortSignal, timeoutMs = API_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const abortFromExternal = () => controller.abort(signal?.reason ?? new Error("Request cancelled."));
  if (signal?.aborted) abortFromExternal();
  signal?.addEventListener("abort", abortFromExternal, { once: true });
  if (timeoutMs > 0) {
    timeoutId = setTimeout(() => controller.abort(new Error("Request timed out.")), timeoutMs);
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      if (timeoutId) clearTimeout(timeoutId);
      signal?.removeEventListener("abort", abortFromExternal);
    }
  };
}

function dispatchApiEvent(name: string, detail: Record<string, unknown>) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
}

function buildHeaders(init: ApiRequestInit, token?: string | null) {
  const headers = new Headers(init.headers);
  const hasFormDataBody = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (init.body && !hasFormDataBody && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("X-Request-ID")) headers.set("X-Request-ID", createApiRequestId());
  return headers;
}

export async function parseEnvelope<T>(response: Response) {
  try {
    return (await response.json()) as ApiEnvelope<T>;
  } catch {
    return {
      ok: false,
      error: {
        code: "INVALID_RESPONSE",
        message: "The server returned an invalid response."
      }
    } as ApiEnvelope<T>;
  }
}

async function performRequest<T>(path: string, init: ApiRequestInit = {}) {
  const method = normalizeMethod(init.method);
  const token = init.token;
  const requestId = createApiRequestId();
  const headers = buildHeaders({ ...init, headers: init.headers }, token);
  headers.set("X-Request-ID", requestId);
  const shouldDedupe = method === "GET" && !init.body && init.dedupe !== false && !init.signal;
  const key = shouldDedupe ? dedupeKey(method, path, token) : null;
  if (key) {
    const existing = inflightGetRequests.get(key) as Promise<T> | undefined;
    if (existing) {
      recordApiRequestTiming({ method, path, status: null, durationMs: 0, requestId, cache: "deduped" });
      return existing;
    }
  }

  const startedAt = performance.now();
  const timeout = createRequestSignal(init.signal, init.timeoutMs);
  const promise = fetch(`${API_BASE_URL}${path}`, {
    ...init,
    method,
    cache: method === "GET" ? "no-store" : init.cache,
    headers,
    signal: timeout.signal
  })
    .then(async (response) => {
      const envelope = await parseEnvelope<T>(response);
      const durationMs = performance.now() - startedAt;
      recordApiRequestTiming({
        method,
        path,
        status: response.status,
        durationMs,
        requestId,
        cache: "network",
        serverTiming: response.headers.get("Server-Timing")
      });
      if (!response.ok || !envelope.ok || !envelope.data) {
        if (response.status === 401 && token) {
          dispatchApiEvent("hrm-v2-session-expired", { code: envelope.error?.code ?? "UNAUTHENTICATED", request_id: requestId });
        }
        if (response.status === 403) {
          dispatchApiEvent("hrm-v2-api-permission-error", { code: envelope.error?.code ?? "FORBIDDEN", request_id: requestId, path });
        }
        if (String(envelope.error?.code ?? "").includes("MODULE")) {
          dispatchApiEvent("hrm-v2-module-disabled", { code: envelope.error?.code, request_id: requestId, path });
        }
        throw apiErrorFromEnvelope(envelope as ApiEnvelope<unknown>, response.status);
      }
      return envelope.data;
    })
    .catch((error) => {
      if (error instanceof ApiError) throw error;
      const durationMs = performance.now() - startedAt;
      recordApiRequestTiming({ method, path, status: null, durationMs, requestId, cache: "network" });
      if (timeout.signal.aborted) throw new ApiError("Request was cancelled or timed out.", "REQUEST_ABORTED", 0);
      throw new ApiError(error instanceof Error ? error.message : "Request failed.", "NETWORK_ERROR", 0);
    })
    .finally(() => {
      timeout.cleanup();
      if (key) inflightGetRequests.delete(key);
    });

  if (key) inflightGetRequests.set(key, promise);
  return promise;
}

export const apiClient = {
  request: performRequest,
  get<T>(path: string, init: Omit<ApiRequestInit, "method" | "body"> = {}) {
    return performRequest<T>(path, { ...init, method: "GET" });
  },
  post<T>(path: string, body?: unknown, init: Omit<ApiRequestInit, "method" | "body"> = {}) {
    return performRequest<T>(path, { ...init, method: "POST", body: body === undefined ? undefined : JSON.stringify(body), dedupe: false });
  },
  patch<T>(path: string, body?: unknown, init: Omit<ApiRequestInit, "method" | "body"> = {}) {
    return performRequest<T>(path, { ...init, method: "PATCH", body: body === undefined ? undefined : JSON.stringify(body), dedupe: false });
  },
  delete<T>(path: string, init: Omit<ApiRequestInit, "method" | "body"> = {}) {
    return performRequest<T>(path, { ...init, method: "DELETE", dedupe: false });
  }
};

export async function request<T>(path: string, options: RequestInit & { timeoutMs?: number; dedupe?: boolean; requestLabel?: string } = {}, token?: string | null) {
  const { signal, ...rest } = options;
  return apiClient.request<T>(path, { ...rest, signal: signal ?? undefined, token });
}

export async function multipartRequest<T>(path: string, body: FormData, token?: string | null, options: { timeoutMs?: number; headers?: HeadersInit; requestLabel?: string } = {}) {
  const requestId = createApiRequestId();
  const startedAt = performance.now();
  const timeout = createRequestSignal(undefined, options.timeoutMs ?? API_REQUEST_TIMEOUT_MS);
  try {
    const headers = new Headers(options.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    headers.set("X-Request-ID", requestId);
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      body,
      headers,
      signal: timeout.signal
    });

    const envelope = await parseEnvelope<T>(response);
    recordApiRequestTiming({ method: "POST", path, status: response.status, durationMs: performance.now() - startedAt, requestId, cache: "network", serverTiming: response.headers.get("Server-Timing") });
    if (!response.ok || !envelope.ok || !envelope.data) {
      if (response.status === 401 && token && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("hrm-v2-session-expired", { detail: { code: envelope.error?.code ?? "UNAUTHENTICATED" } }));
      }
      throw apiErrorFromEnvelope(envelope as ApiEnvelope<unknown>, response.status);
    }

    return envelope.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    recordApiRequestTiming({ method: "POST", path, status: null, durationMs: performance.now() - startedAt, requestId, cache: "network" });
    if (timeout.signal.aborted) throw new ApiError("Request was cancelled or timed out.", "REQUEST_ABORTED", 0);
    throw new ApiError(error instanceof Error ? error.message : "Request failed.", "NETWORK_ERROR", 0);
  } finally {
    timeout.cleanup();
  }
}

export async function blobRequest(path: string, token: string, init: RequestInit = {}) {
  const requestId = createApiRequestId();
  const startedAt = performance.now();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Authorization: `Bearer ${token}`, "X-Request-ID": requestId },
    cache: "no-store"
  });
  recordApiRequestTiming({ method: normalizeMethod(init.method), path, status: response.status, durationMs: performance.now() - startedAt, requestId, cache: "network", serverTiming: response.headers.get("Server-Timing") });
  if (!response.ok) {
    let message = "Download failed.";
    let code = "REQUEST_FAILED";
    let structuredError: ApiError | null = null;
    try {
      const envelope = (await response.json()) as ApiEnvelope<unknown>;
      message = envelope.error?.message ?? message;
      code = envelope.error?.code ?? code;
      if (envelope.error) {
        structuredError = apiErrorFromEnvelope(envelope, response.status, message);
      }
    } catch {
      // The endpoint may return a plain response when the failure is not API-shaped.
    }
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("hrm-v2-session-expired", { detail: { code } }));
    }
    if (structuredError) throw structuredError;
    throw new ApiError(message, code, response.status);
  }
  return {
    blob: await response.blob(),
    filename: response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "download"
  };
}
