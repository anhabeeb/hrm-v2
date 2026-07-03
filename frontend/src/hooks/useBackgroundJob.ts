import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { backgroundJobsApi } from "../lib/backgroundJobsApi";
import { createQueryScope, queryKeys } from "../lib/queryKeys";
import type { BackgroundJobDetailResponse } from "../types/background-jobs";

const TERMINAL_STATUSES = new Set(["SUCCEEDED", "FAILED", "CANCELLED", "DEAD_LETTERED"]);

export function useBackgroundJob(jobId: string | null | undefined) {
  const { token, user } = useAuth();
  const scope = useMemo(() => createQueryScope(token, user), [token, user]);

  return useQuery<BackgroundJobDetailResponse, Error>({
    queryKey: queryKeys.backgroundJobs.detail(scope, jobId ?? "none"),
    enabled: Boolean(token && jobId),
    staleTime: 5000,
    refetchInterval: (query) => {
      const status = query.state.data?.job.status;
      return status && TERMINAL_STATUSES.has(status) ? false : 5000;
    },
    queryFn: ({ signal }) => backgroundJobsApi.detail(token!, jobId!, signal)
  });
}
