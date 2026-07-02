import { useEffect, useMemo, useRef } from "react";
import type { QueryKey, UseQueryResult } from "@tanstack/react-query";
import { useApiQuery } from "./useApiQuery";
import { tableQueryKeys } from "../lib/tableQueryKeys";
import {
  getTablePaginationRequest,
  trackTableQueryPerformance,
  type TablePaginationRequest
} from "../lib/tablePerformance";

export interface UsePaginatedQueryInput<TData> {
  scope?: string | null;
  tableName: string;
  page: number;
  pageSize: number;
  filters?: unknown;
  search?: string;
  sort?: unknown;
  enabled?: boolean;
  queryFn: (context: { signal: AbortSignal; pagination: TablePaginationRequest }) => Promise<TData>;
  getRowCount?: (data: TData | undefined) => number;
}

export type UsePaginatedQueryResult<TData> = UseQueryResult<TData, Error> & {
  queryKey: QueryKey;
  pagination: TablePaginationRequest;
  isInitialLoading: boolean;
  isRefreshing: boolean;
};

export function usePaginatedQuery<TData>(input: UsePaginatedQueryInput<TData>): UsePaginatedQueryResult<TData> {
  const { enabled, filters, getRowCount, page, pageSize, queryFn, scope, search, sort, tableName } = input;
  const pagination = useMemo(() => getTablePaginationRequest({ page, pageSize }), [page, pageSize]);
  const queryKey = useMemo(
    () => tableQueryKeys.list(scope, tableName, {
      page: pagination.page,
      pageSize: pagination.pageSize,
      filters,
      search,
      sort
    }),
    [scope, tableName, pagination.page, pagination.pageSize, filters, search, sort]
  );
  const startedAt = useRef<number | null>(null);

  const query = useApiQuery<TData>({
    queryKey,
    enabled,
    queryFn: ({ signal }) => {
      startedAt.current = performance.now();
      return queryFn({ signal, pagination });
    }
  });

  useEffect(() => {
    if (query.isFetching && query.data) {
      trackTableQueryPerformance({
        tableName,
        queryKey,
        pageSize: pagination.pageSize,
        rowCount: getRowCount?.(query.data),
        cacheState: "background-refresh"
      });
    }
  }, [getRowCount, pagination.pageSize, query.isFetching, query.data, queryKey, tableName]);

  useEffect(() => {
    if (query.isSuccess || query.isError) {
      const durationMs = startedAt.current == null ? undefined : performance.now() - startedAt.current;
      trackTableQueryPerformance({
        tableName,
        queryKey,
        durationMs,
        pageSize: pagination.pageSize,
        rowCount: getRowCount?.(query.data),
        cacheState: query.isError ? "error" : "settled"
      });
    }
  }, [getRowCount, pagination.pageSize, query.data, query.isError, query.isSuccess, queryKey, tableName]);

  return {
    ...query,
    queryKey,
    pagination,
    isInitialLoading: query.isLoading && !query.data,
    isRefreshing: query.isFetching && Boolean(query.data)
  };
}
