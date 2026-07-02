import type { QueryKey } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useAuth } from "./useAuth";
import { useApiQuery } from "./useApiQuery";
import { createQueryScope } from "../lib/queryKeys";
import { recordWorkspaceQueryMetric } from "../lib/performance";

export function useWorkspaceQuery<TData>(input: {
  workspaceName?: string;
  queryKey: (scope: ReturnType<typeof createQueryScope>) => QueryKey;
  queryFn: (context: { token: string; signal: AbortSignal }) => Promise<TData>;
  enabled?: boolean;
  staleTime?: number;
  placeholderData?: (previousData: TData | undefined) => TData | undefined;
}) {
  const { token, user } = useAuth();
  const scope = useMemo(() => createQueryScope(token, user), [token, user]);
  const queryKey = useMemo(() => input.queryKey(scope), [input, scope]);
  const query = useApiQuery<TData>({
    queryKey,
    enabled: Boolean(token && (input.enabled ?? true)),
    staleTime: input.staleTime,
    placeholderData: input.placeholderData ?? ((previousData) => previousData),
    queryFn: ({ signal }) => input.queryFn({ token: token!, signal })
  });
  const workspaceName = input.workspaceName ?? String(queryKey[queryKey.length - 1] ?? "workspace");

  useEffect(() => {
    if (query.isLoading && !query.data) {
      recordWorkspaceQueryMetric({ workspace: workspaceName, queryKey, event: "first-load" });
    }
  }, [query.data, query.isLoading, queryKey, workspaceName]);

  useEffect(() => {
    if (query.isFetching && query.data) {
      recordWorkspaceQueryMetric({ workspace: workspaceName, queryKey, event: "background-refresh" });
    }
  }, [query.data, query.isFetching, queryKey, workspaceName]);

  useEffect(() => {
    if (query.data && !query.isFetching) {
      recordWorkspaceQueryMetric({ workspace: workspaceName, queryKey, event: "cache-hit" });
    }
  }, [query.data, query.dataUpdatedAt, query.isFetching, queryKey, workspaceName]);

  useEffect(() => {
    if (query.error) {
      recordWorkspaceQueryMetric({ workspace: workspaceName, queryKey, event: "error" });
    }
  }, [query.error, queryKey, workspaceName]);

  return {
    ...query,
    scope,
    queryKey,
    firstLoad: query.isLoading && !query.data,
    refreshing: query.isFetching && Boolean(query.data),
    reload: query.refetch
  };
}
