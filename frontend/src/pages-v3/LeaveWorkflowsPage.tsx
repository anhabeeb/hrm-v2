import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavRail } from "../components/ui/route-nav-rail";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { humanizeTechnicalLabel } from "../lib/displayLabels";
import { LEAVE_NAV_ITEMS } from "./leaveNav";
import type { LeaveWorkflow, LeaveWorkflowStep } from "../types/leave";

function stepLabel(step: LeaveWorkflowStep) {
  if (step.role_name) return step.role_name;
  if (step.user_name) return step.user_name;
  if (step.approver_type === "PERMISSION" && step.permission_key) return humanizeTechnicalLabel(step.permission_key);
  return humanizeTechnicalLabel(step.approver_type);
}

export function LeaveWorkflowsPage() {
  const { token } = useAuth();
  const [workflows, setWorkflows] = useState<LeaveWorkflow[]>([]);
  const [stepsByWorkflow, setStepsByWorkflow] = useState<Record<string, LeaveWorkflowStep[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api.listLeaveWorkflows(token).then(async (res) => {
      const active = res.workflows.filter((w) => w.is_active);
      setWorkflows(active);
      const entries = await Promise.all(active.map((w) => api.listLeaveWorkflowSteps(token, w.id).then((r) => [w.id, r.steps.sort((a, b) => a.step_order - b.step_order)] as const).catch(() => [w.id, []] as const)));
      setStepsByWorkflow(Object.fromEntries(entries));
    }).finally(() => setLoading(false));
  }, [token]);

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={LEAVE_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-slate-950">Approval workflows</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Reference view — ordered approval steps per workflow</p>
            </div>
            <Link to="/leave/settings" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              Manage in Settings <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 2 }).map((_, i) => <Panel key={i} className="h-20 animate-pulse" />)}</div>
          ) : workflows.length ? (
            <div className="flex flex-col gap-3">
              {workflows.map((workflow) => {
                const steps = stepsByWorkflow[workflow.id] ?? [];
                return (
                  <Panel key={workflow.id} className="p-3.5">
                    <p className="mb-3 text-xs font-medium text-slate-950">
                      {workflow.name}
                      {workflow.leave_type_name ? <span className="font-normal text-muted-foreground"> · applies to {workflow.leave_type_name}</span> : workflow.is_default ? <span className="font-normal text-muted-foreground"> · default workflow</span> : null}
                    </p>
                    {steps.length ? (
                      <div className="flex flex-wrap items-center gap-2.5">
                        {steps.map((step, i) => (
                          <div key={step.id} className="flex items-center gap-2.5">
                            <div className="flex items-center gap-2 rounded-md bg-[#F7F7FB] px-3 py-2">
                              <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-primary text-[9px] font-medium text-white">{step.step_order}</span>
                              <span className="text-xs text-slate-950">{stepLabel(step)}</span>
                            </div>
                            {i < steps.length - 1 ? <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No steps configured for this workflow.</p>
                    )}
                  </Panel>
                );
              })}
            </div>
          ) : (
            <Panel><EmptyState title="No approval workflows configured" description="Set up leave approval workflows in Settings." /></Panel>
          )}
        </div>
      </div>
    </PageShell>
  );
}
