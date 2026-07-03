import type { QueryKey } from "@tanstack/react-query";
import { useMemo } from "react";
import { ApiError } from "../lib/api";
import { createSectionRetryState } from "../lib/sectionRetryState";
import { createQueryScope } from "../lib/queryKeys";
import { useWorkspaceQuery } from "./useWorkspaceQuery";

export function useResilientWorkspaceQuery<TData>(input: {
  workspaceName: string;
  queryKey: (scope: ReturnType<typeof createQueryScope>) => QueryKey;
  queryFn: (context: { token: string; signal: AbortSignal; timeoutMs: number }) => Promise<TData>;
  enabled?: boolean;
  timeoutMs?: number;
  staleTime?: number;
  placeholderData?: (previousData: TData | undefined) => TData | undefined;
}) {
  const timeoutMs = input.timeoutMs ?? 12000;
  const query = useWorkspaceQuery<TData>({
    workspaceName: input.workspaceName,
    queryKey: input.queryKey,
    enabled: input.enabled,
    staleTime: input.staleTime,
    placeholderData: input.placeholderData,
    queryFn: ({ token, signal }) => input.queryFn({ token, signal, timeoutMs })
  });

  const hasCachedData = query.data !== undefined;
  const blockingError = query.error && !hasCachedData ? query.error : null;
  const backgroundError = query.error && hasCachedData ? query.error : null;
  const timedOut = query.error instanceof ApiError && query.error.code === "REQUEST_ABORTED";
  const sectionRetryState = useMemo(
    () => createSectionRetryState({ title: input.workspaceName, error: query.error ?? undefined, refreshing: query.refreshing }),
    [input.workspaceName, query.error, query.refreshing]
  );

  return {
    ...query,
    timeoutMs,
    hasCachedData,
    blockingError,
    backgroundError,
    timedOut,
    sectionRetryState
  };
}
