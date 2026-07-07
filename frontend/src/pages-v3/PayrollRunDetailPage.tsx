import { useEffect, useMemo, useState } from "react";
import { Check, Circle, Clock } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { Button } from "../components/ui/button";
import { ExportMenu } from "../components/export/ExportMenu";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api } from "../lib/api";
import { humanizeTechnicalLabel } from "../lib/displayLabels";
import { cn } from "../lib/utils";
import type { PayrollApprovalEvent, PayrollRun, PayrollRunEmployee } from "../types/payroll";

function formatCurrency(value?: number | null) {
  if (value === undefined || value === null) return "MVR 0";
  return `MVR ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function monthLabel(run: PayrollRun) {
  if (!run.period_month || !run.period_year) return "Payroll run";
  return new Date(Date.UTC(run.period_year, run.period_month - 1, 1)).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}

const TIMELINE_STEPS = [
  { key: "PREPARED", label: "Prepared" },
  { key: "HR_REVIEW", label: "HR review" },
  { key: "FINANCE_APPROVAL", label: "Finance approval" },
  { key: "PAID", label: "Paid" }
] as const;

function stepIndexForStatus(status: string) {
  if (["PAID", "FINALIZED"].includes(status)) return 3;
  if (["APPROVED", "APPROVED_PLACEHOLDER"].includes(status)) return 2;
  if (["SUBMITTED_FOR_APPROVAL", "REVIEW"].includes(status)) return 1;
  return 0;
}

export function PayrollRunDetailPage() {
  const { runId } = useParams<{ runId: string }>();
  const { token, user } = useAuth();
  const alerts = useAlert();
  const [run, setRun] = useState<PayrollRun | null>(null);
  const [employees, setEmployees] = useState<PayrollRunEmployee[]>([]);
  const [approvals, setApprovals] = useState<PayrollApprovalEvent[]>([]);
  const [locationFilter, setLocationFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);

  const permissions = new Set(user?.permissions ?? []);
  const canSubmit = permissions.has("payroll.approvals.submit") || permissions.has("payroll.approvals.manage") || permissions.has("payroll.runs.manage") || permissions.has("payroll.manage");
  const canApprove = permissions.has("payroll.approvals.approve") || permissions.has("payroll.approvals.manage") || permissions.has("payroll.runs.approve_placeholder") || permissions.has("payroll.manage");
  const canFinalize = permissions.has("payroll.finalization.finalize") || permissions.has("payroll.finalization.manage") || permissions.has("payroll.manage");

  async function load() {
    if (!token || !runId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [runResult, employeesResult, approvalsResult] = await Promise.all([
        api.getPayrollRun(token, runId),
        api.listPayrollRunEmployees(token, runId, { limit: 500 }),
        api.listPayrollRunApprovals(token, runId).catch(() => ({ approvals: [] }))
      ]);
      setRun(runResult.run);
      setEmployees(employeesResult.employees);
      setApprovals(approvalsResult.approvals);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Unable to load this payroll run.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, runId]);

  const locations = useMemo(() => Array.from(new Set(employees.map((e) => e.location_name).filter(Boolean))) as string[], [employees]);
  const filteredEmployees = useMemo(() => employees.filter((e) => locationFilter === "all" || e.location_name === locationFilter), [employees, locationFilter]);
  const byLocation = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    for (const e of employees) {
      const key = e.location_name ?? "No location";
      const entry = map.get(key) ?? { total: 0, count: 0 };
      entry.total += e.net_salary ?? 0;
      entry.count += 1;
      map.set(key, entry);
    }
    return Array.from(map.entries()).map(([location, data]) => ({ location, ...data }));
  }, [employees]);

  async function submitForApproval() {
    if (!token || !runId) return;
    setActing(true);
    try {
      await api.submitPayrollRunForApproval(token, runId);
      alerts.showSuccess("Submitted for approval", "The payroll run was sent for review.");
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to submit run");
    } finally {
      setActing(false);
    }
  }

  async function approve() {
    if (!token || !runId) return;
    setActing(true);
    try {
      await api.approvePayrollRun(token, runId);
      alerts.showSuccess("Run approved", "The payroll run was approved.");
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to approve run");
    } finally {
      setActing(false);
    }
  }

  async function finalize() {
    if (!token || !runId) return;
    setActing(true);
    try {
      await api.finalizePayrollRun(token, runId);
      alerts.showSuccess("Run finalized", "The payroll run has been marked as paid.");
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to finalize run");
    } finally {
      setActing(false);
    }
  }

  if (loading) {
    return <PageShell><Panel className="h-64 animate-pulse" /></PageShell>;
  }

  if (loadError || !run) {
    return <PageShell><Panel><EmptyState title="Payroll run not found" description={loadError ?? "This payroll run is unavailable."} /></Panel></PageShell>;
  }

  const stepIndex = stepIndexForStatus(run.status);
  const primaryAction =
    run.status === "DRAFT" || run.status === "REVIEW" ? (canSubmit ? { label: "Submit for approval", onClick: submitForApproval } : null) :
    run.status === "SUBMITTED_FOR_APPROVAL" ? (canApprove ? { label: "Approve run", onClick: approve } : null) :
    (run.status === "APPROVED" || run.status === "APPROVED_PLACEHOLDER") ? (canFinalize ? { label: "Mark as paid", onClick: finalize } : null) :
    null;

  return (
    <PageShell constrained={false}>
      <div className="flex flex-col gap-3.5">
        <Link to="/v3-preview/payroll/runs" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-slate-900">&larr; Payroll / {monthLabel(run)}</Link>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-medium text-slate-950">{monthLabel(run)} payroll run</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{run.employee_count ?? employees.length} employees · {formatCurrency(run.net_salary_total)} total · {locations.length} locations</p>
          </div>
          <div className="flex items-center gap-2.5">
            <ExportMenu variant="plain" moduleName={`Payroll register ${monthLabel(run)}`} rows={filteredEmployees.map((e) => ({ employee: e.employee_name_snapshot, location: e.location_name, basic: e.basic_salary, earnings: e.total_earnings, deductions: e.total_deductions, net: e.net_salary }))} columns={["employee", "location", "basic", "earnings", "deductions", "net"]} />
            {primaryAction ? <Button size="sm" variant="outline" loading={acting} onClick={primaryAction.onClick}>{primaryAction.label}</Button> : null}
          </div>
        </div>

        {byLocation.length ? (
          <Panel className="p-4">
            <div className="mb-2.5 flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-950">Payroll by location</p>
              <span className="text-[9px] text-muted-foreground">For audit and reconciliation</span>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {byLocation.map((loc) => (
                <div key={loc.location} className="rounded-lg bg-[#F7F7FB] p-3">
                  <p className="text-[10px] text-muted-foreground">{loc.location}</p>
                  <p className="mt-1 text-sm font-medium text-slate-950">{formatCurrency(loc.total)}</p>
                  <p className="mt-0.5 text-[9px] text-muted-foreground">{loc.count} employees</p>
                </div>
              ))}
            </div>
          </Panel>
        ) : null}

        <Panel className="p-4">
          <p className="mb-3 text-xs font-semibold text-slate-950">Approval timeline</p>
          <div className="flex items-center">
            {TIMELINE_STEPS.map((step, i) => (
              <div key={step.key} className="contents">
                <div className="flex flex-1 flex-col items-center gap-1.5">
                  <div className={cn("grid h-[22px] w-[22px] place-items-center rounded-full", i < stepIndex ? "bg-primary" : i === stepIndex ? "bg-[#FAEEDA]" : "bg-[#F7F7FB]")}>
                    {i < stepIndex ? <Check className="h-3 w-3 text-white" /> : i === stepIndex ? <Clock className="h-3 w-3 text-[#854F0B]" /> : <Circle className="h-2.5 w-2.5 text-muted-foreground" />}
                  </div>
                  <span className={cn("text-[9px] font-medium", i <= stepIndex ? "text-slate-950" : "text-muted-foreground")}>{step.label}</span>
                </div>
                {i < TIMELINE_STEPS.length - 1 ? <div className={cn("mb-4 h-0.5 flex-[2]", i < stepIndex ? "bg-primary" : "bg-[#E7E7F1]")} /> : null}
              </div>
            ))}
          </div>
          {approvals.length ? (
            <div className="mt-3 flex flex-col gap-1 border-t pt-3 text-[10px] text-muted-foreground">
              {approvals.slice(0, 3).map((a) => <p key={a.id}>{a.actor_name_snapshot ?? "System"} — {humanizeTechnicalLabel(a.action)}{a.note ? `: ${a.note}` : ""}</p>)}
            </div>
          ) : null}
        </Panel>

        <Panel className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <p className="text-xs font-semibold text-slate-950">Employee payroll register</p>
            <div className="flex items-center gap-3">
              <select className="bg-transparent text-[10px] text-muted-foreground outline-none" value={locationFilter} onChange={(e) => setLocationFilter(e.target.value)}>
                <option value="all">All locations</option>
                {locations.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <span className="text-[10px] text-muted-foreground">{filteredEmployees.length} rows</span>
            </div>
          </div>
          <div className="themed-scroll overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-[#F7F7FB] text-left text-muted-foreground">
                  <th className="px-4 py-2 font-medium">Employee</th>
                  <th className="px-2.5 py-2 font-medium">Location</th>
                  <th className="px-2.5 py-2 text-right font-medium">Basic</th>
                  <th className="px-2.5 py-2 text-right font-medium">Allowances</th>
                  <th className="px-2.5 py-2 text-right font-medium">Deductions</th>
                  <th className="px-4 py-2 text-right font-medium">Net pay</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((e) => (
                  <tr key={e.id} className="border-t">
                    <td className="px-4 py-2.5 text-slate-950">{e.employee_name_snapshot}</td>
                    <td className="px-2.5 py-2.5 text-muted-foreground">{e.location_name ?? "—"}</td>
                    <td className="px-2.5 py-2.5 text-right text-slate-950">{e.basic_salary.toLocaleString()}</td>
                    <td className="px-2.5 py-2.5 text-right text-slate-950">{Math.max(0, e.total_earnings - e.basic_salary).toLocaleString()}</td>
                    <td className="px-2.5 py-2.5 text-right text-[#A32D2D]">-{e.total_deductions.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-slate-950">{e.net_salary.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filteredEmployees.length ? <p className="p-6 text-center text-xs text-muted-foreground">No employees in this run yet.</p> : null}
          </div>
        </Panel>
      </div>
    </PageShell>
  );
}
