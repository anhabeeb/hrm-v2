import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { RouteNavRail } from "../components/ui/route-nav-rail";
import { Button } from "../components/ui/button";
import { PermissionAdaptiveAction } from "../components/ui/permission-action";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";
import { humanizeTechnicalLabel } from "../lib/displayLabels";
import { PAYROLL_NAV_ITEMS } from "./payrollNav";
import type { FinalSettlementCase } from "../types/final-settlement";

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts[parts.length - 1][0] : ""}`.toUpperCase();
}

function statusTone(status: string) {
  if (status === "APPROVED" || status === "FINALIZED") return { bg: "#EAF3DE", text: "#27500A" };
  if (status === "REJECTED" || status === "CANCELLED") return { bg: "#FCEBEB", text: "#A32D2D" };
  return { bg: "#FAEEDA", text: "#854F0B" };
}

export function PayrollFinalSettlementPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const [cases, setCases] = useState<FinalSettlementCase[]>([]);
  const [loading, setLoading] = useState(true);

  const permissions = new Set(user?.permissions ?? []);
  const canApprove = permissions.has("final_settlement.approve") || permissions.has("final_settlement.manage");

  async function load() {
    if (!token) return;
    const result = await api.listFinalSettlementCases(token, {});
    setCases(result.cases ?? []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [token]);

  async function approve(id: string) {
    if (!token) return;
    try {
      await api.approveFinalSettlement(token, id);
      alerts.showSuccess("Settlement approved", "The final settlement was approved.");
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to approve settlement");
    }
  }

  return (
    <PageShell constrained={false}>
      <div className="flex gap-4">
        <RouteNavRail items={PAYROLL_NAV_ITEMS} className="hidden w-[172px] shrink-0 sm:flex" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-lg font-medium text-slate-950">Final settlement</p>
            <span className="text-xs text-muted-foreground">Triggered automatically when offboarding starts</span>
          </div>

          {loading ? (
            <div className="flex flex-col gap-2">{Array.from({ length: 2 }).map((_, i) => <Panel key={i} className="h-32 animate-pulse" />)}</div>
          ) : cases.length ? (
            <div className="flex flex-col gap-2">
              {cases.map((c) => {
                const name = c.employee_name ?? c.full_name ?? c.employee_name_snapshot ?? "Employee";
                return (
                  <Panel key={c.id} className="p-4">
                    <div className="mb-3 flex items-center gap-3">
                      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#FAEEDA] text-xs font-medium text-[#854F0B]">{initialsOf(name)}</div>
                      <div className="flex-1">
                        <p className="text-xs font-medium text-slate-950">{name}</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">Last working day {c.last_working_day} · {humanizeTechnicalLabel(c.exit_type)}</p>
                      </div>
                      <span className="rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: statusTone(c.status).bg, color: statusTone(c.status).text }}>{humanizeTechnicalLabel(c.status)}</span>
                    </div>
                    <div className="mb-3 grid grid-cols-2 gap-3 border-t pt-3 text-[11px] sm:grid-cols-3">
                      <div><p className="text-muted-foreground">Total earnings</p><p className="mt-0.5 font-medium text-slate-950">MVR {(c.total_earnings ?? 0).toLocaleString()}</p></div>
                      <div><p className="text-muted-foreground">Total deductions</p><p className="mt-0.5 font-medium text-[#A32D2D]">-MVR {(c.total_deductions ?? 0).toLocaleString()}</p></div>
                      <div><p className="text-muted-foreground">Net settlement</p><p className="mt-0.5 font-medium text-slate-950">MVR {(c.net_settlement_amount ?? 0).toLocaleString()}</p></div>
                    </div>
                    <div className="flex gap-2">
                      {c.status === "SUBMITTED_FOR_APPROVAL" ? (
                        <PermissionAdaptiveAction
                          hasAuthority={canApprove}
                          directLabel="Approve settlement"
                          onDirectAction={() => void approve(c.id)}
                          requestLabel="Request approval"
                          onRequestAction={() => void approve(c.id)}
                          size="sm"
                        />
                      ) : null}
                      <Link to={`/v3-preview/payroll/final-settlement?case=${c.id}`}><Button variant="outline" size="sm">Edit line items</Button></Link>
                    </div>
                  </Panel>
                );
              })}
            </div>
          ) : (
            <Panel><EmptyState title="No final settlements in progress" description="Cases appear here automatically when an employee's offboarding starts." /></Panel>
          )}
        </div>
      </div>
    </PageShell>
  );
}
