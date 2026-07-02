import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { backgroundJobsApi, type BackgroundJobListParams } from "../lib/backgroundJobsApi";
import { useLiveEventHealth } from "../lib/liveEventStatus";
import { createQueryScope, queryKeys } from "../lib/queryKeys";
import type { BackgroundJob, BackgroundJobsResponse } from "../types/background-jobs";

const ACTIVE_STATUSES = new Set(["QUEUED", "RUNNING", "RETRYING"]);

export function hasActiveBackgroundJobs(jobs: BackgroundJob[] | undefined) {
  return Boolean(jobs?.some((job) => ACTIVE_STATUSES.has(job.status)));
}

export function useBackgroundJobs(params: BackgroundJobListParams = {}) {
  const { token, user } = useAuth();
  const liveEvents = useLiveEventHealth();
  const scope = useMemo(() => createQueryScope(token, user), [token, user]);
  const limit = params.limit ?? 10;
  const queryKey = useMemo(() => queryKeys.backgroundJobs.list(scope, limit), [limit, scope]);

  return useQuery<BackgroundJobsResponse, Error>({
    queryKey,
    enabled: Boolean(token),
    staleTime: 5000,
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      if (!hasActiveBackgroundJobs(query.state.data?.jobs)) return false;
      return liveEvents.healthy ? 30000 : 5000;
    },
    queryFn: ({ signal }) => backgroundJobsApi.list(token!, { ...params, limit }, signal)
  });
}
