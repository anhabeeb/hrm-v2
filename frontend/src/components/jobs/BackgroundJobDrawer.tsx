import { RotateCcw, XCircle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";
import { AdminHelpLink } from "../../features/admin-help/AdminHelpLink";
import { BackgroundJobProgress } from "./BackgroundJobProgress";
import { backgroundJobsApi } from "../../lib/backgroundJobsApi";
import { queryKeys, type QueryScope } from "../../lib/queryKeys";
import type { BackgroundJob } from "../../types/background-jobs";

function relativeTime(value: string) {
  const created = new Date(value).getTime();
  if (!Number.isFinite(created)) return "";
  const diff = Math.max(0, Date.now() - created);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function BackgroundJobDrawer({
  open,
  onOpenChange,
  jobs,
  token,
  scope
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobs: BackgroundJob[];
  token: string;
  scope: QueryScope;
}) {
  const queryClient = useQueryClient();
  const listKey = queryKeys.backgroundJobs.list(scope, 10);
  const retryMutation = useMutation({
    mutationFn: (jobId: string) => backgroundJobsApi.retry(token, jobId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: listKey })
  });
  const cancelMutation = useMutation({
    mutationFn: (jobId: string) => backgroundJobsApi.cancel(token, jobId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: listKey })
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="max-w-lg">
        <SheetHeader>
          <div className="flex items-start justify-between gap-3">
            <SheetTitle>Background Jobs</SheetTitle>
            <AdminHelpLink target="backgroundJobs" label="Jobs guide" />
          </div>
          <SheetDescription>Track long-running document, onboarding, attendance, report, and import work without blocking the app.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!jobs.length ? (
            <EmptyState title="No recent jobs" description="Queued and completed background work will appear here." />
          ) : (
            <div className="space-y-3">
              {jobs.map((job) => {
                const canRetry = job.status === "FAILED" || job.status === "CANCELLED";
                const canCancel = job.status === "QUEUED" || job.status === "RETRYING";
                return (
                  <div key={job.id} className="rounded-lg border bg-white p-3 shadow-sm">
                    <BackgroundJobProgress job={job} />
                    <div className="mt-3 flex min-w-0 items-center justify-between gap-3 border-t pt-3">
                      <div className="min-w-0 text-xs text-muted-foreground">
                        <p className="truncate" title={job.id}>{job.entity_type && job.entity_id ? `${job.entity_type}: ${job.entity_id}` : "System task"}</p>
                        <p>{relativeTime(job.created_at)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {canRetry ? (
                          <Button size="sm" variant="outline" onClick={() => retryMutation.mutate(job.id)} disabled={retryMutation.isPending}>
                            <RotateCcw className="h-4 w-4" /> Retry
                          </Button>
                        ) : null}
                        {canCancel ? (
                          <Button size="sm" variant="outline" onClick={() => cancelMutation.mutate(job.id)} disabled={cancelMutation.isPending}>
                            <XCircle className="h-4 w-4" /> Cancel
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {job.last_error_message ? <p className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">{job.last_error_message}</p> : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
