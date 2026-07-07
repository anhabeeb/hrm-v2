import { useEffect, useState } from "react";
import { ArrowRight, FileWarning } from "lucide-react";
import { Link } from "react-router-dom";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavRail } from "../components/ui/route-nav-rail";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";
import { LEAVE_NAV_ITEMS } from "./leaveNav";
import type { LeavePolicy } from "../types/leave";

interface DocumentRuleRow {
  id: string;
  leave_policy_id: string;
  document_type_name?: string | null;
  requires_document: number | boolean;
  required_after_consecutive_days: number | null;
  required_after_used_days: number | null;
  notes?: string | null;
  is_active: number | boolean;
}

export function LeaveDocumentRulesPage() {
  const { token } = useAuth();
  const [policies, setPolicies] = useState<LeavePolicy[]>([]);
  const [rules, setRules] = useState<Array<DocumentRuleRow & { policy: LeavePolicy }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api.listLeavePolicies(token).then(async (res) => {
      const active = res.policies.filter((p) => p.is_active);
      setPolicies(active);
      const entries = await Promise.all(active.map((policy) => api.listLeavePolicyDocumentRules(token, policy.id).then((r) => (r.document_rules as unknown as DocumentRuleRow[]).map((rule) => ({ ...rule, policy })))));
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
              <p className="text-lg font-medium text-slate-950">Document rules</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Reference view — supporting documents required per policy</p>
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
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#FCEBEB]"><FileWarning className="h-4 w-4 text-[#A32D2D]" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-950">{rule.policy.leave_type_name ?? rule.policy.name} · {rule.document_type_name ?? "supporting document"}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {rule.required_after_consecutive_days ? `Required when a request exceeds ${rule.required_after_consecutive_days} consecutive days` : rule.required_after_used_days ? `Required after ${rule.required_after_used_days} used days` : "Always required"}
                      {rule.notes ? ` · ${rule.notes}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: rule.requires_document ? "#EAF3DE" : "#F7F7FB", color: rule.requires_document ? "#27500A" : "#6B6F86" }}>{rule.requires_document ? "Enforced" : "Optional"}</span>
                </Panel>
              ))}
            </div>
          ) : (
            <Panel><EmptyState title="No document rules configured" description={policies.length ? "Set up document requirements per policy in Settings." : "Configure leave policies first, then add document rules in Settings."} /></Panel>
          )}
        </div>
      </div>
    </PageShell>
  );
}
