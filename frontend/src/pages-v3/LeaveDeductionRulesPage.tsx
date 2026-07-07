import { useEffect, useState } from "react";
import { ArrowRight, Calculator } from "lucide-react";
import { Link } from "react-router-dom";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavRail } from "../components/ui/route-nav-rail";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { humanizeTechnicalLabel } from "../lib/displayLabels";
import { LEAVE_NAV_ITEMS } from "./leaveNav";
import type { DeductionMode, LeavePolicy } from "../types/leave";

interface DeductionRuleRow {
  id: string;
  leave_policy_id: string;
  deduction_mode: DeductionMode;
  deduction_pay_component: string | null;
  deduction_after_days: number | null;
  long_leave_threshold_days: number | null;
  is_active: number | boolean;
}

function ruleDescription(rule: DeductionRuleRow) {
  if (rule.deduction_mode === "NONE" || rule.deduction_mode === "NO_DEDUCTION") return "No payroll deduction applied.";
  const parts: string[] = [humanizeTechnicalLabel(rule.deduction_mode)];
  if (rule.deduction_pay_component) parts.push(`from ${humanizeTechnicalLabel(rule.deduction_pay_component)}`);
  if (rule.deduction_after_days) parts.push(`after ${rule.deduction_after_days} days`);
  if (rule.long_leave_threshold_days) parts.push(`long-leave threshold ${rule.long_leave_threshold_days} days`);
  return parts.join(" · ");
}

export function LeaveDeductionRulesPage() {
  const { token } = useAuth();
  const [policies, setPolicies] = useState<LeavePolicy[]>([]);
  const [rules, setRules] = useState<Array<DeductionRuleRow & { policy: LeavePolicy }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api.listLeavePolicies(token).then(async (res) => {
      const active = res.policies.filter((p) => p.is_active);
      setPolicies(active);
      const entries = await Promise.all(active.map((policy) => api.listLeavePolicyDeductionRules(token, policy.id).then((r) => (r.deduction_rules as unknown as DeductionRuleRow[]).map((rule) => ({ ...rule, policy })))));
      setRules(entries.flat().filter((rule) => rule.is_active));
    }).finally(() => setLoading(false));
  }, [token]);

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={LEAVE_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-slate-950">Deduction rules</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Reference view — how excess or unpaid leave impacts payroll</p>
            </div>
            <Link to="/leave/settings" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              Manage in Settings <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 2 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
          ) : rules.length ? (
            <div className="flex flex-col gap-2">
              {rules.map((rule) => (
                <Panel key={rule.id} className="flex items-center gap-3.5 p-3">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#FAEEDA]"><Calculator className="h-4 w-4 text-[#854F0B]" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-950">{rule.policy.leave_type_name ?? rule.policy.name} · {humanizeTechnicalLabel(rule.deduction_mode)}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{ruleDescription(rule)}</p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#EAF3DE] px-2.5 py-1 text-[10px] font-medium text-[#27500A]">Enforced</span>
                </Panel>
              ))}
            </div>
          ) : (
            <Panel><EmptyState title="No deduction rules configured" description={policies.length ? "Set up payroll deduction rules per policy in Settings." : "Configure leave policies first, then add deduction rules in Settings."} /></Panel>
          )}
        </div>
      </div>
    </PageShell>
  );
}
