import { useCallback, useEffect, useMemo, useRef } from "react";
import { referenceDataCache } from "../lib/referenceDataCache";
import { REFERENCE_DATA_STALE_TIME_MS } from "../lib/queryClient";
import { createQueryScope, queryKeys } from "../lib/queryKeys";
import { useApiQuery } from "./useApiQuery";

export function useReferenceData<T>(input: {
  cacheKey: string;
  token?: string | null;
  enabled?: boolean;
  ttlMs?: number;
  load: () => Promise<T>;
  fallback: T;
}) {
  const { cacheKey, token, enabled = true, ttlMs, load, fallback } = input;
  const loadRef = useRef(load);
  const fallbackRef = useRef(fallback);
  const scope = useMemo(() => createQueryScope(token), [token]);
  const initialData = useMemo(() => referenceDataCache.get<T>(cacheKey, token) ?? undefined, [cacheKey, token]);

  useEffect(() => {
    loadRef.current = load;
    fallbackRef.current = fallback;
  }, [fallback, load]);

  const query = useApiQuery<T>({
    queryKey: queryKeys.reference.custom(scope, cacheKey),
    enabled: Boolean(token && enabled),
    staleTime: ttlMs ?? REFERENCE_DATA_STALE_TIME_MS,
    initialData,
    placeholderData: (previousData) => previousData ?? initialData ?? fallbackRef.current,
    queryFn: async () => {
      return referenceDataCache.getOrLoad(cacheKey, token, () => loadRef.current(), ttlMs ?? REFERENCE_DATA_STALE_TIME_MS);
    }
  });

  const refresh = useCallback(async () => {
    if (!token || !enabled) return fallbackRef.current;
    const result = await query.refetch();
    return result.data ?? fallbackRef.current;
  }, [enabled, query, token]);

  return {
    data: query.data ?? initialData ?? fallback,
    loading: query.isLoading && !query.data && !initialData,
    refreshing: query.isFetching && Boolean(query.data ?? initialData),
    error: query.error?.message ?? null,
    refresh
  };
}
