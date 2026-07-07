import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavRail } from "../components/ui/route-nav-rail";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { LEAVE_NAV_ITEMS } from "./leaveNav";
import type { LeavePolicy } from "../types/leave";

const DOT_COLORS = ["#AFA9EC", "#F0997B", "#7FB8DE", "#8FCB9E", "#FAC775", "#E895B3"];

function policyDescription(policy: LeavePolicy) {
  const parts: string[] = [];
  parts.push(policy.annual_entitlement_days != null ? `${policy.annual_entitlement_days} days/year` : "No fixed entitlement");
  parts.push(policy.allow_carry_forward ? `Carries forward up to ${policy.carry_forward_limit_days ?? "—"} days` : "No carry forward");
  if (policy.requires_document) {
    const after = policy.document_required_after_consecutive_days ?? policy.document_required_after_used_days;
    parts.push(`Document required${after ? ` after ${after} consecutive days` : ""}`);
  }
  return parts.join(" · ");
}

export function LeaveTypesPoliciesPage() {
  const { token } = useAuth();
  const [policies, setPolicies] = useState<LeavePolicy[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api.listLeavePolicies(token).then((res) => setPolicies(res.policies)).finally(() => setLoading(false));
  }, [token]);

  const active = policies.filter((p) => p.is_active);

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={LEAVE_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-slate-950">Types & policies</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Reference view — leave type entitlements and rules</p>
            </div>
            <Link to="/leave/settings" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              Manage in Settings <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Panel key={i} className="h-14 animate-pulse" />)}</div>
          ) : active.length ? (
            <div className="flex flex-col gap-2">
              {active.map((policy, i) => (
                <Panel key={policy.id} className="flex items-center gap-3.5 p-3">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: DOT_COLORS[i % DOT_COLORS.length] }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-950">{policy.leave_type_name ?? policy.name}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{policyDescription(policy)}</p>
                  </div>
                  {policy.department_name || policy.location_name ? (
                    <span className="shrink-0 rounded-full bg-[#F7F7FB] px-2.5 py-1 text-[9px] text-muted-foreground">{policy.department_name ?? policy.location_name}</span>
                  ) : null}
                </Panel>
              ))}
            </div>
          ) : (
            <Panel><EmptyState title="No leave policies configured" description="Set up leave types and policies in Settings." /></Panel>
          )}
        </div>
      </div>
    </PageShell>
  );
}
