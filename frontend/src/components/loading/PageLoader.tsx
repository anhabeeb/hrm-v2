import { InlineSpinner } from "./InlineSpinner";
import { APP_BRANDING } from "../../config/branding";

export function PageLoader({
  title = "Loading workspace",
  description = `Preparing this ${APP_BRANDING.appName} page.`,
  compact = false
}: {
  title?: string;
  description?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={compact ? "rounded-lg border bg-white px-4 py-3 shadow-panel" : "min-h-[320px] rounded-lg border bg-white p-6 shadow-panel"}
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-primary/5 text-primary">
          <InlineSpinner />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-950">{title}</p>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
      {!compact ? (
        <div className="mt-6 grid gap-3">
          <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
        </div>
      ) : null}
    </div>
  );
}
