import { Loader2 } from "lucide-react";
import type { BackgroundJob } from "../../types/background-jobs";
import { StatusBadge } from "../ui/status-badge";
import { cn } from "../../lib/utils";
import { humanizeTechnicalLabel } from "../../lib/displayLabels";

function progressPercent(job: BackgroundJob) {
  if (!job.progress_total || job.progress_total <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((job.progress_current / job.progress_total) * 100)));
}

export function BackgroundJobProgress({ job, compact = false }: { job: BackgroundJob; compact?: boolean }) {
  const percent = progressPercent(job);
  const active = job.status === "QUEUED" || job.status === "RUNNING" || job.status === "RETRYING";

  return (
    <div className={cn("space-y-2", compact && "space-y-1.5")}>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className={cn("truncate font-medium text-slate-950", compact ? "text-xs" : "text-sm")}>{job.progress_message || job.job_type}</p>
          <p className="truncate text-xs text-muted-foreground">{humanizeTechnicalLabel(job.job_type, "Background job")}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {active ? <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> : null}
          <StatusBadge value={job.status} />
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            job.status === "FAILED" || job.status === "DEAD_LETTERED" ? "bg-red-500" : job.status === "CANCELLED" ? "bg-slate-400" : job.status === "SUCCEEDED" ? "bg-emerald-500" : "bg-primary",
            percent === null && active && "w-1/2 animate-pulse"
          )}
          style={percent === null ? undefined : { width: `${percent}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{job.progress_total ? `${job.progress_current}/${job.progress_total}` : active ? "Working..." : "Complete"}</span>
        {percent !== null ? <span>{percent}%</span> : null}
      </div>
    </div>
  );
}
