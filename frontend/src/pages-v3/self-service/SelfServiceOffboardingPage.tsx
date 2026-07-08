import { useEffect, useState } from "react";
import { PageShell } from "../../components/ui/page-shell";
import { Panel } from "../../components/ui/panel";
import { Badge } from "../../components/ui/badge";
import { EmptyState } from "../../components/ui/empty-state";
import { useAuth } from "../../hooks/useAuth";
import { ApiError, api } from "../../lib/api";
import { humanizeTechnicalLabel } from "../../lib/displayLabels";

type Row = Record<string, unknown>;
function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}
function text(value: unknown, fallback = "—") {
  const s = value === null || value === undefined ? "" : String(value);
  return s && s !== "null" && s !== "undefined" ? s : fallback;
}
function statusTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (["COMPLETED", "DONE"].includes(status)) return "success";
  if (["IN_PROGRESS", "PENDING"].includes(status)) return "warning";
  if (["OVERDUE", "BLOCKED"].includes(status)) return "danger";
  return "neutral";
}

export function SelfServiceOffboardingPage() {
  const { token } = useAuth();
  const [current, setCurrent] = useState<Row | null>(null);
  const [tasks, setTasks] = useState<Row[]>([]);
  const [events, setEvents] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api.getSelfServiceOffboarding(token).then((result) => {
      if (cancelled) return;
      setCurrent((result.offboarding ?? null) as Row | null);
      setTasks(asRows(result.tasks));
      setEvents(asRows(result.events));
    }).catch((err) => { if (!cancelled) setError(err instanceof ApiError ? err.message : "Unable to load your offboarding case."); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <PageShell constrained={false}>
      <div className="space-y-3.5">
        <p className="text-lg font-medium text-slate-950">My offboarding</p>

        {loading ? (
          <div className="flex flex-col gap-2">{Array.from({ length: 2 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
        ) : error ? (
          <Panel className="p-4 text-xs text-[#A32D2D]">{error}</Panel>
        ) : (
          <>
            <Panel className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-950">Offboarding checklist</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">This view is read-only and shows tasks assigned to your offboarding case</p>
                </div>
                {current ? <Badge tone={statusTone(text(current.offboarding_status))}>{humanizeTechnicalLabel(text(current.offboarding_status))}</Badge> : null}
              </div>
              {current ? (
                <div className="mt-3.5 grid grid-cols-2 gap-3.5 rounded-md bg-[#F7F7FB] p-3 sm:grid-cols-3">
                  <div><p className="text-[9px] text-muted-foreground">Case</p><p className="mt-0.5 text-xs text-slate-950">{text(current.case_number)}</p></div>
                  <div><p className="text-[9px] text-muted-foreground">Readiness</p><p className="mt-0.5 text-xs text-slate-950">{humanizeTechnicalLabel(text(current.finalization_status))}</p></div>
                  <div><p className="text-[9px] text-muted-foreground">Due date</p><p className="mt-0.5 text-xs text-slate-950">{text(current.due_date)}</p></div>
                </div>
              ) : (
                <div className="mt-3.5"><EmptyState title="No offboarding case" description="There is no active offboarding case for your employee profile." /></div>
              )}
            </Panel>

            <Panel className="overflow-hidden">
              <div className="border-b px-4 py-3"><p className="text-xs font-medium text-slate-950">Checklist tasks</p></div>
              {tasks.length ? (
                <div className="flex flex-col">
                  {tasks.map((t, i) => (
                    <div key={String(t.id ?? i)} className="flex items-center gap-3.5 border-b border-[#F1F1F7] px-4 py-3 last:border-b-0">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-slate-950">{text(t.task_name ?? t.title ?? t.task_key)}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{text(t.task_group)}{t.due_date ? ` · Due ${text(t.due_date)}` : ""}</p>
                      </div>
                      <Badge tone={statusTone(text(t.task_status ?? t.status))}>{humanizeTechnicalLabel(text(t.task_status ?? t.status))}</Badge>
                    </div>
                  ))}
                </div>
              ) : <div className="p-4"><EmptyState title="No tasks yet" description="Checklist tasks will appear here." /></div>}
            </Panel>

            <Panel className="overflow-hidden">
              <div className="border-b px-4 py-3"><p className="text-xs font-medium text-slate-950">Recent lifecycle events</p></div>
              {events.length ? (
                <div className="flex flex-col">
                  {events.slice(0, 10).map((e, i) => (
                    <div key={String(e.id ?? i)} className="flex items-center gap-3.5 border-b border-[#F1F1F7] px-4 py-3 last:border-b-0">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-slate-950">{text(e.action)}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">{text(e.created_at)}</p>
                      </div>
                      <span className="shrink-0 text-[10px] text-muted-foreground">{text(e.new_status)}</span>
                    </div>
                  ))}
                </div>
              ) : <div className="p-4"><EmptyState title="No events yet" description="Lifecycle events will appear here." /></div>}
            </Panel>
          </>
        )}
      </div>
    </PageShell>
  );
}
