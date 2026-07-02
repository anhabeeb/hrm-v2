import { QueryCache, QueryClient } from "@tanstack/react-query";
import { recordCacheEvent } from "./performance";

export const DEFAULT_SERVER_STATE_STALE_TIME_MS = 60 * 1000;
export const REFERENCE_DATA_STALE_TIME_MS = 15 * 60 * 1000;
export const SERVER_STATE_GC_TIME_MS = 30 * 60 * 1000;

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (_error, query) => {
      recordCacheEvent({ key: query.queryKey, disposition: "cache-miss", source: "query-error" });
    }
  }),
  defaultOptions: {
    queries: {
      staleTime: DEFAULT_SERVER_STATE_STALE_TIME_MS,
      gcTime: SERVER_STATE_GC_TIME_MS,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: (failureCount, error) => {
        const status = typeof error === "object" && error !== null && "status" in error ? Number((error as { status?: number }).status) : 0;
        if (status === 401 || status === 403 || status === 404 || status === 409 || status >= 500) return false;
        return failureCount < 1;
      },
      placeholderData: (previousData: unknown) => previousData
    },
    mutations: {
      retry: false
    }
  }
});

queryClient.setQueryDefaults(["hrm-v2", "reference"], {
  staleTime: REFERENCE_DATA_STALE_TIME_MS,
  gcTime: SERVER_STATE_GC_TIME_MS,
  refetchOnWindowFocus: false
});

export function clearQueryCacheForSessionChange(reason: "logout" | "scope-change" | "permission-change" | "tenant-change") {
  void queryClient.cancelQueries();
  queryClient.clear();
  recordCacheEvent({ key: "hrm-v2", disposition: "cache-miss", source: `clear:${reason}` });
}

export function invalidateReferenceQueries(prefix?: string) {
  const target = prefix ? String(prefix) : null;
  void queryClient.invalidateQueries({
    predicate: (query) => target
      ? query.queryKey.some((part) => String(part).startsWith(target))
      : query.queryKey.includes("reference")
  });
}
