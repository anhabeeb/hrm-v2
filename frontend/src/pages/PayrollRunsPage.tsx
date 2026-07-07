import { Download, Eye, PlayCircle, RefreshCw, XCircle } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ExportMenu } from "../components/export/ExportMenu";
import { PayrollNav } from "../components/payroll/PayrollNav";
import { Button, RowActionButton } from "../components/ui/button";
import { ConfirmDialog } from "../components/ui/dialogs";
import {
  ActiveFilterChips,
  FilterResetButton,
  FilterSection,
  MoreFiltersSheet,
  StandardFilterBar,
  StandardSearchInput,
  StandardSelectFilter
} from "../components/filters";
import { AlertBanner, PageHeader, PageShell } from "../components/ui/page-shell";
import { DataTableShell } from "../components/ui/data-table-shell";
import { StatusBadge, humanizeStatus } from "../components/ui/status-badge";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { ApiError, api } from "../lib/api";
import { downloadBlob } from "../lib/export-utils";
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

function MetaChip({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <span style={{ fontSize: 12, color: "var(--v3-text-secondary)" }}>{children}</span>;
}

function Dot() {
  return <span style={{ color: "var(--v3-border-strong)" }}>&middot;</span>;
}

function RunCardRow({ run, displayStatus, canRecalculate, canApprove, canExport, canCancel, onRecalculate, onApprove, onExport, onCancel }: {
  run: PayrollRun;
  displayStatus: string;
  canRecalculate: boolean;
  canApprove: boolean;
  canExport: boolean;
  canCancel: boolean;
  onRecalculate: () => void;
  onApprove: () => void;
  onExport: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "0.9rem 1.1rem",
        background: "var(--v3-surface-2)",
        border: "0.5px solid var(--v3-border)",
        borderRadius: "var(--v3-radius-card)"
      }}
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">#{run.run_no} &middot; {run.period_month ? `${run.period_month}/${run.period_year}` : run.payroll_period_id}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <MetaChip>{run.calculation_mode}</MetaChip>
          <Dot /><MetaChip>By {run.generated_by_name ?? "-"}</MetaChip>
          <Dot /><MetaChip>Generated {run.generated_at}</MetaChip>
          {run.approved_at ? <><Dot /><MetaChip>Approved {run.approved_at}</MetaChip></> : null}
          {run.paid_at ? <><Dot /><MetaChip>Paid {run.paid_at}</MetaChip></> : null}
          <Dot /><MetaChip>{run.employee_count ?? 0} employees</MetaChip>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-4">
        <div className="flex gap-4 text-right">
          <div>
            <div className="text-[11px] text-muted-foreground">Earnings</div>
            <div className="text-sm font-semibold">{money(run.total_earnings)}</div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">Deductions</div>
            <div className="text-sm font-semibold">{money(run.total_deductions)}</div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">Net salary</div>
            <div className="text-sm font-semibold">{money(run.net_salary_total)}</div>
          </div>
        </div>
        <StatusBadge value={displayStatus} />
        <div className="flex gap-1">
          <Link to={`/payroll/runs/${run.id}`}><RowActionButton intent="view" title="View details"><Eye className="h-4 w-4" /></RowActionButton></Link>
          {canRecalculate ? <RowActionButton intent="calculate" title="Recalculate" onClick={onRecalculate}><RefreshCw className="h-4 w-4" /></RowActionButton> : null}
          {canApprove ? <RowActionButton intent="approve" title="Approve placeholder" onClick={onApprove}><PlayCircle className="h-4 w-4" /></RowActionButton> : null}
          {canExport ? <RowActionButton intent="download" title="Export CSV" onClick={onExport}><Download className="h-4 w-4" /></RowActionButton> : null}
          {canCancel && displayStatus !== "FINALIZED_PLACEHOLDER" && displayStatus !== "CANCELLED" ? <RowActionButton intent="delete" title="Cancel" onClick={onCancel}><XCircle className="h-4 w-4" /></RowActionButton> : null}
        </div>
      </div>
    </div>
  );
}

export function PayrollRunsPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const [params, setParams] = useSearchParams();
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
  const payrollRunStatuses = ["DRAFT", "CALCULATING", "READY_FOR_REVIEW", "APPROVED_PLACEHOLDER", "FINALIZED_PLACEHOLDER", "LOCKED", "CANCELLED"];

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
      const message = "Cancellation reason is required.";
      setError(message);
      alerts.showValidationError(message, "Reason required");
      return;
    }
    try {
      if (action.name === "recalculate") await api.recalculatePayrollRun(token, action.run.id);
      if (action.name === "approve") await api.approvePayrollRun(token, action.run.id);
      if (action.name === "cancel") await api.cancelPayrollRun(token, action.run.id, reason.trim());
      setAction(null);
      setReason("");
      alerts.showSuccess("Payroll run updated", `Payroll run ${action.name} completed.`);
      await load();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Unable to update payroll run.";
      setError(message);
      alerts.showApiError(err, "Unable to update payroll run.");
    }
  }

  async function exportRun(run: PayrollRun) {
    if (!token) return;
    try {
      const download = await api.exportPayrollRunCsv(token, run.id);
      downloadBlob(download.blob, download.filename || `payroll-run-${run.run_no}.csv`);
      alerts.showSuccess("Payroll run exported", "Payroll run CSV was downloaded.");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Unable to export payroll run.";
      setError(message);
      alerts.showApiError(err, "Unable to export payroll run.");
    }
  }

  function resetFilters() {
    setSearch("");
    setStatus("");
  }

  const activeChips = [
    search.trim() ? { key: "search", label: "Search", value: search.trim(), onRemove: () => setSearch("") } : null,
    status ? { key: "status", label: "Status", value: humanizeStatus(status), title: status, onRemove: () => setStatus("") } : null,
    params.get("period_id") ? { key: "period", label: "Payroll Period", value: "Linked period", title: params.get("period_id") ?? undefined, onRemove: () => setParams({}) } : null
  ].filter(Boolean) as Array<{ key: string; label: string; value: string; title?: string; onRemove: () => void }>;

  if (!canView) return <PageShell><AlertBanner tone="danger">Payroll runs are unavailable. Your account needs payroll.view permission.</AlertBanner></PageShell>;

  return (
    <PageShell>
      <PageHeader
        title="Payroll Runs"
        description="Review, approve as placeholder, finalize later, and export generated payroll runs."
        breadcrumbs={[{ label: "Payroll", href: "/payroll" }, { label: "Runs" }]}
        actions={canExport ? (
          <ExportMenu
            moduleName="Payroll Runs"
            rows={runs as unknown as Record<string, unknown>[]}
            columns={["run_no", "status", "calculation_mode", "employee_count", "total_earnings", "total_deductions", "net_salary_total", "generated_at", "approved_at"]}
            filterSummary={Object.entries(filters).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`)}
          />
        ) : null}
      />
      <PayrollNav />
      <StandardFilterBar
        search={<StandardSearchInput value={search} onDebouncedChange={setSearch} placeholder="Search payroll runs..." />}
        reset={<FilterResetButton onReset={resetFilters} />}
        moreFilters={
          <MoreFiltersSheet onReset={resetFilters}>
            <FilterSection title="Payroll">
              <StandardSelectFilter value={status} onValueChange={setStatus} allLabel="All statuses" width="status" options={payrollRunStatuses.map((item) => ({ value: item, label: humanizeStatus(item) }))} />
              <div className="rounded-md border bg-slate-50 px-3 py-2 text-xs text-muted-foreground">Payroll Period filters are preserved from linked period routes.</div>
            </FilterSection>
          </MoreFiltersSheet>
        }
      >
        <StandardSelectFilter value={status} onValueChange={setStatus} allLabel="All statuses" width="status" options={payrollRunStatuses.map((item) => ({ value: item, label: humanizeStatus(item) }))} />
      </StandardFilterBar>
      <ActiveFilterChips chips={activeChips} />
      <DataTableShell loading={loading} error={error} empty={!runs.length} emptyTitle="No payroll runs" emptyDescription="Generate a run from a payroll period." className="border-0 bg-transparent p-0 shadow-none">
          <div className="flex flex-col gap-2">
            {runs.map((run) => {
              const displayStatus = normalizeRunStatus(run.status);
              return (
                <RunCardRow
                  key={run.id}
                  run={run}
                  displayStatus={displayStatus}
                  canRecalculate={canRecalculate}
                  canApprove={canApprove}
                  canExport={canExport}
                  canCancel={canCancel}
                  onRecalculate={() => setAction({ run, name: "recalculate" })}
                  onApprove={() => setAction({ run, name: "approve" })}
                  onExport={() => void exportRun(run)}
                  onCancel={() => setAction({ run, name: "cancel" })}
                />
              );
            })}
          </div>
      </DataTableShell>
      {action ? (
        <ConfirmDialog
          open
          title={action.name === "recalculate" ? "Recalculate payroll run" : action.name === "approve" ? "Approve placeholder" : "Cancel payroll run"}
          description={`Run #${action.run.run_no}. ${action.name === "cancel" ? "Cancelling requires a reason." : "Confirm this Payroll Core action."}`}
          requireReason={action.name === "cancel"}
          reasonValue={reason}
          onReasonChange={setReason}
          onCancel={() => { setAction(null); setReason(""); }}
          onConfirm={() => void confirmRunAction()}
        />
      ) : null}
    </PageShell>
  );
}
