import { Activity, CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../ui/button";
import { BackgroundJobDrawer } from "./BackgroundJobDrawer";
import { useAlert } from "../alerts/useAlert";
import { useAuth } from "../../hooks/useAuth";
import { hasActiveBackgroundJobs, useBackgroundJobs } from "../../hooks/useBackgroundJobs";
import { createQueryScope } from "../../lib/queryKeys";
import { invalidateBackgroundJobTargets } from "../../lib/workspaceInvalidation";
import type { BackgroundJob } from "../../types/background-jobs";
import { cn } from "../../lib/utils";

const TERMINAL_STATUSES = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);

function jobLabel(job: BackgroundJob) {
  return job.job_type.replace(/_/g, " ").toLowerCase();
}

export function BackgroundJobIndicator() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const initializedRef = useRef(false);
  const seenTerminalRef = useRef<Set<string>>(new Set());
  const scope = useMemo(() => createQueryScope(token, user), [token, user]);
  const jobsQuery = useBackgroundJobs({ limit: 10 });
  const jobs = jobsQuery.data?.jobs ?? [];
  const active = hasActiveBackgroundJobs(jobs);
  const activeCount = jobs.filter((job) => ["QUEUED", "RUNNING", "RETRYING"].includes(job.status)).length;
  const failedCount = jobs.filter((job) => job.status === "FAILED").length;

  useEffect(() => {
    if (!jobs.length) return;
    if (!initializedRef.current) {
      for (const job of jobs) {
        if (TERMINAL_STATUSES.has(job.status)) seenTerminalRef.current.add(job.id);
      }
      initializedRef.current = true;
      return;
    }

    for (const job of jobs) {
      if (!TERMINAL_STATUSES.has(job.status) || seenTerminalRef.current.has(job.id)) continue;
      seenTerminalRef.current.add(job.id);
      invalidateBackgroundJobTargets(scope, job, queryClient);
      if (job.status === "SUCCEEDED") {
        alerts.showSuccess("Background job completed", `${jobLabel(job)} finished. The affected workspace is refreshing.`);
      } else if (job.status === "FAILED") {
        alerts.showError("Background job failed", job.last_error_message ?? `${jobLabel(job)} failed. Open Background Jobs to retry.`);
      }
    }
  }, [alerts, jobs, queryClient, scope]);

  if (!token) return null;

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        title={active ? `${activeCount} background job${activeCount === 1 ? "" : "s"} running` : "Background jobs"}
        onClick={() => setOpen(true)}
        className={cn("relative", active && "border-primary/40 bg-primary/5 text-primary")}
      >
        {active ? <Loader2 className="h-4 w-4 animate-spin" /> : failedCount ? <Activity className="h-4 w-4 text-amber-600" /> : <CheckCircle2 className="h-4 w-4" />}
        {activeCount || failedCount ? (
          <span className={cn("absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border border-white px-1 text-[10px] font-semibold text-white", failedCount ? "bg-amber-600" : "bg-primary")}>
            {(activeCount || failedCount) > 99 ? "99+" : activeCount || failedCount}
          </span>
        ) : null}
      </Button>
      <BackgroundJobDrawer open={open} onOpenChange={setOpen} jobs={jobs} token={token} scope={scope} />
    </>
  );
}
