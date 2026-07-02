import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { backgroundJobsApi, type BackgroundJobListParams } from "../lib/backgroundJobsApi";
import { createQueryScope, queryKeys } from "../lib/queryKeys";
import type { BackgroundJob, BackgroundJobsResponse } from "../types/background-jobs";

const ACTIVE_STATUSES = new Set(["QUEUED", "RUNNING", "RETRYING"]);

export function hasActiveBackgroundJobs(jobs: BackgroundJob[] | undefined) {
  return Boolean(jobs?.some((job) => ACTIVE_STATUSES.has(job.status)));
}

export function useBackgroundJobs(params: BackgroundJobListParams = {}) {
  const { token, user } = useAuth();
  const scope = useMemo(() => createQueryScope(token, user), [token, user]);
  const limit = params.limit ?? 10;
  const queryKey = useMemo(() => queryKeys.backgroundJobs.list(scope, limit), [limit, scope]);

  return useQuery<BackgroundJobsResponse, Error>({
    queryKey,
    enabled: Boolean(token),
    staleTime: 5000,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => hasActiveBackgroundJobs(query.state.data?.jobs) ? 5000 : false,
    queryFn: ({ signal }) => backgroundJobsApi.list(token!, { ...params, limit }, signal)
  });
}
