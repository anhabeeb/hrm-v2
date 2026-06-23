import { Download, Eye, PlayCircle, RefreshCw, Search, XCircle } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { PayrollNav } from "../components/payroll/PayrollNav";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";
import type { PayrollRun } from "../types/payroll";

function money(value: number | null | undefined) {
  return `MVR ${Number(value ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function normalizeRunStatus(status: string) {
  if (status === "PROCESSING") return "CALCULATING";
  if (status === "REVIEW") return "READY_FOR_REVIEW";
  if (status === "APPROVED") return "APPROVED_PLACEHOLDER";
  if (status === "PAID") return "FINALIZED_PLACEHOLDER";
  return status;
}

function statusTone(status: string) {
  const normalized = normalizeRunStatus(status);
  if (normalized === "FINALIZED_PLACEHOLDER") return "success" as const;
  if (normalized === "CANCELLED") return "danger" as const;
  if (normalized === "CALCULATING" || normalized === "READY_FOR_REVIEW") return "warning" as const;
  return "neutral" as const;
}

export function PayrollRunsPage() {
  const { token, user } = useAuth();
  const [params] = useSearchParams();
  const permissions = new Set(user?.permissions ?? []);
  const canView = permissions.has("payroll.runs.view") || permissions.has("payroll.view");
  const canRecalculate = permissions.has("payroll.runs.recalculate") || permissions.has("payroll.periods.recalculate") || permissions.has("payroll.runs.manage") || permissions.has("payroll.periods.manage") || permissions.has("payroll.manage");
  const canApprove = permissions.has("payroll.runs.approve_placeholder") || permissions.has("payroll.periods.approve_placeholder") || permissions.has("payroll.approve_placeholder");
  const canCancel = permissions.has("payroll.runs.cancel") || permissions.has("payroll.runs.manage") || permissions.has("payroll.manage");
  const canExport = permissions.has("payroll.reports.export");
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<{ run: PayrollRun; name: "recalculate" | "approve" | "cancel" } | null>(null);
  const [reason, setReason] = useState("");
  const filters = useMemo(() => ({ status, search, period_id: params.get("period_id") ?? "" }), [status, search, params]);

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    setError(null);
    try {
      setRuns((await api.listPayrollRuns(token, filters)).runs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to load payroll runs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token, canView, filters]);

  async function confirmRunAction() {
    if (!token || !action) return;
    if (action.name === "cancel" && !reason.trim()) {
      setError("Cancellation reason is required.");
      return;
    }
    try {
      if (action.name === "recalculate") await api.recalculatePayrollRun(token, action.run.id);
      if (action.name === "approve") await api.approvePayrollRun(token, action.run.id);
      if (action.name === "cancel") await api.cancelPayrollRun(token, action.run.id, reason.trim());
      setAction(null);
      setReason("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to update payroll run.");
    }
  }

  async function exportRun(run: PayrollRun) {
    if (!token) return;
    try {
      const download = await api.exportPayrollRunCsv(token, run.id);
      const url = URL.createObjectURL(download.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = download.filename || `payroll-run-${run.run_no}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to export payroll run.");
    }
  }

  if (!canView) return <Panel><EmptyState title="Payroll runs unavailable" description="Your account needs payroll.view permission." /></Panel>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div><h1 className="text-lg font-semibold">Payroll Runs</h1><p className="text-sm text-muted-foreground">Review, approve as placeholder, finalize later, and export generated payroll runs.</p></div>
        <PayrollNav />
      </div>
      {error ? <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      <Panel className="overflow-hidden">
        <div className="grid gap-2 border-b p-3 md:grid-cols-4">
          <div className="relative md:col-span-2"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search run" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
          <select className="h-9 rounded-md border bg-white px-3 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{["DRAFT", "CALCULATING", "READY_FOR_REVIEW", "APPROVED_PLACEHOLDER", "FINALIZED_PLACEHOLDER", "LOCKED", "CANCELLED"].map((item) => <option key={item} value={item}>{item}</option>)}</select>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Run</TableHead><TableHead>Period</TableHead><TableHead>Status</TableHead><TableHead>Mode</TableHead><TableHead>Generated by</TableHead><TableHead>Generated</TableHead><TableHead>Approved</TableHead><TableHead>Paid</TableHead><TableHead>Employees</TableHead><TableHead>Earnings</TableHead><TableHead>Deductions</TableHead><TableHead>Net salary</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>{runs.map((run) => {
              const displayStatus = normalizeRunStatus(run.status);
              return <TableRow key={run.id}><TableCell className="font-medium">#{run.run_no}</TableCell><TableCell>{run.period_month ? `${run.period_month}/${run.period_year}` : run.payroll_period_id}</TableCell><TableCell><Badge tone={statusTone(run.status)}>{displayStatus}</Badge></TableCell><TableCell>{run.calculation_mode}</TableCell><TableCell>{run.generated_by_name ?? "-"}</TableCell><TableCell>{run.generated_at}</TableCell><TableCell>{run.approved_at ?? "-"}</TableCell><TableCell>{run.paid_at ?? "-"}</TableCell><TableCell>{run.employee_count ?? 0}</TableCell><TableCell>{money(run.total_earnings)}</TableCell><TableCell>{money(run.total_deductions)}</TableCell><TableCell>{money(run.net_salary_total)}</TableCell><TableCell><div className="flex justify-end gap-1"><Link to={`/payroll/runs/${run.id}`}><Button title="View details" variant="ghost" size="icon"><Eye className="h-4 w-4" /></Button></Link>{canRecalculate ? <Button title="Recalculate" variant="ghost" size="icon" onClick={() => setAction({ run, name: "recalculate" })}><RefreshCw className="h-4 w-4" /></Button> : null}{canApprove ? <Button title="Approve placeholder" variant="ghost" size="icon" onClick={() => setAction({ run, name: "approve" })}><PlayCircle className="h-4 w-4" /></Button> : null}{canExport ? <Button title="Export CSV" variant="ghost" size="icon" onClick={() => void exportRun(run)}><Download className="h-4 w-4" /></Button> : null}{canCancel && displayStatus !== "FINALIZED_PLACEHOLDER" && displayStatus !== "CANCELLED" ? <Button title="Cancel" variant="ghost" size="icon" onClick={() => setAction({ run, name: "cancel" })}><XCircle className="h-4 w-4" /></Button> : null}</div></TableCell></TableRow>;
            })}</TableBody>
          </Table>
        </div>
        {loading ? <EmptyState title="Loading payroll runs" description="Fetching generated runs." /> : runs.length === 0 ? <EmptyState title="No payroll runs" description="Generate a run from a payroll period." /> : null}
      </Panel>
      {action ? <RunActionModal action={action.name} run={action.run} reason={reason} onReason={setReason} onCancel={() => { setAction(null); setReason(""); }} onConfirm={() => void confirmRunAction()} /> : null}
    </div>
  );
}

function RunActionModal({ action, run, reason, onReason, onCancel, onConfirm }: { action: "recalculate" | "approve" | "cancel"; run: PayrollRun; reason: string; onReason: (value: string) => void; onCancel: () => void; onConfirm: () => void }) {
  const title = action === "recalculate" ? "Recalculate payroll run" : action === "approve" ? "Approve placeholder" : "Cancel payroll run";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-4">
      <div className="w-full max-w-md rounded-lg border bg-white shadow-xl">
        <div className="border-b px-4 py-3"><h2 className="text-sm font-semibold">{title}</h2><p className="text-xs text-muted-foreground">Run #{run.run_no}</p></div>
        <div className="space-y-3 p-4">
          <p className="text-sm text-slate-700">{action === "cancel" ? "Cancelling requires a reason." : "Confirm this Payroll Core action."}</p>
          {action === "cancel" ? <Input value={reason} onChange={(event) => onReason(event.target.value)} placeholder="Reason" /> : null}
        </div>
        <div className="flex justify-end gap-2 border-t px-4 py-3"><Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button><Button size="sm" onClick={onConfirm}>Confirm</Button></div>
      </div>
    </div>
  );
}
