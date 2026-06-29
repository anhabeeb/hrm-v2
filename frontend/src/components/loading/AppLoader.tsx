import { ShieldCheck } from "lucide-react";

export function AppLoader({
  title = "Preparing HRM workspace...",
  description = "Loading your secure employee operations dashboard."
}: {
  title?: string;
  description?: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#f8fafc_0%,#eef6f6_100%)] px-4" aria-busy="true" aria-live="polite">
      <section className="w-full max-w-sm rounded-lg border bg-white p-5 shadow-panel">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-950">HRM v2</p>
            <p className="truncate text-xs text-muted-foreground">Enterprise people suite</p>
          </div>
        </div>
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full w-1/2 animate-[loader-slide_1.15s_ease-in-out_infinite] rounded-full bg-primary motion-reduce:animate-none" />
        </div>
        <div className="mt-4">
          <h1 className="text-sm font-semibold text-slate-950">{title}</h1>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
        </div>
      </section>
    </main>
  );
}
