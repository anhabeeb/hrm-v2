import { useQuery, type QueryKey, type UseQueryResult } from "@tanstack/react-query";
import { recordCacheEvent } from "../lib/performance";
import { DEFAULT_SERVER_STATE_STALE_TIME_MS } from "../lib/queryClient";

export function useApiQuery<TData>(input: {
  queryKey: QueryKey;
  queryFn: (context: { signal: AbortSignal }) => Promise<TData>;
  enabled?: boolean;
  staleTime?: number;
  gcTime?: number;
  initialData?: TData;
  placeholderData?: (previousData: TData | undefined) => TData | undefined;
  refetchOnWindowFocus?: boolean;
}): UseQueryResult<TData, Error> {
  return useQuery<TData, Error, TData, QueryKey>({
    queryKey: input.queryKey,
    enabled: input.enabled ?? true,
    staleTime: input.staleTime ?? DEFAULT_SERVER_STATE_STALE_TIME_MS,
    gcTime: input.gcTime,
    initialData: input.initialData,
    placeholderData: input.placeholderData ?? ((previousData) => {
      if (previousData !== undefined) {
        recordCacheEvent({ key: input.queryKey, disposition: "background-refresh", source: "placeholder-previous-data" });
        return previousData;
      }
      return input.initialData;
    }),
    refetchOnWindowFocus: input.refetchOnWindowFocus ?? false,
    queryFn: async ({ signal }) => input.queryFn({ signal })
  } as Parameters<typeof useQuery<TData, Error, TData, QueryKey>>[0]);
}
