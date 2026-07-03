import { Archive, DatabaseBackup, FileCheck2, RefreshCw, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAlert } from "../components/alerts/useAlert";
import { CardSkeleton } from "../components/loading";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { ConfirmDialog } from "../components/ui/dialogs";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { PageHeader, PageShell } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { AdminHelpLink } from "../features/admin-help/AdminHelpLink";
import { useAuth } from "../hooks/useAuth";
import { ApiError, api } from "../lib/api";

type Row = Record<string, unknown>;

function text(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function bool(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function tone(value: unknown) {
  const status = String(value ?? "").toUpperCase();
  if (["READY", "COMPLETED", "SUCCEEDED", "PASS", "ACTIVE"].includes(status)) return "success" as const;
  if (["SKIPPED", "WARNING", "QUEUED", "RUNNING"].includes(status)) return "warning" as const;
  if (["ERROR", "FAILED", "BLOCKED", "DISABLED"].includes(status)) return "danger" as const;
  return "neutral" as const;
}

function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((item): item is Row => typeof item === "object" && item !== null) : [];
}

function SummaryCard({ label, value, icon: Icon }: { label: string; value: unknown; icon: typeof DatabaseBackup }) {
  return (
    <Panel className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase text-muted-foreground">{label}</p>
          <p className="mt-2 truncate text-lg font-semibold">{text(value)}</p>
        </div>
        <Icon className="h-5 w-5 shrink-0 text-primary" />
      </div>
    </Panel>
  );
}

function SimpleTable({ rows: tableRows, columns, empty }: { rows: Row[]; columns: string[]; empty: string }) {
  return (
    <Panel className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>{columns.map((column) => <TableHead key={column}>{column.replace(/_/g, " ")}</TableHead>)}</TableRow>
          </TableHeader>
          <TableBody>
            {tableRows.map((row, index) => (
              <TableRow key={String(row.id ?? row.policy_key ?? row.job_id ?? row.target ?? index)}>
                {columns.map((column) => (
                  <TableCell key={column} className="max-w-[360px] truncate" title={text(row[column])}>
                    {["status", "is_enabled", "dry_run"].includes(column) ? <Badge tone={tone(row[column])}>{text(row[column])}</Badge> : text(row[column])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!tableRows.length ? <EmptyState title={empty} description="No sensitive data is displayed in this operational view." /> : null}
      </div>
    </Panel>
  );
}

export function AdminBackupRetentionPage() {
  const { token, user } = useAuth();
  const alerts = useAlert();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<Row>({});
  const [backgroundProcessing, setBackgroundProcessing] = useState<Row>({});
  const [recentJobs, setRecentJobs] = useState<Row[]>([]);
  const [limit, setLimit] = useState("250");
  const [confirmCleanup, setConfirmCleanup] = useState(false);

  const permissions = useMemo(() => new Set(user?.permissions ?? []), [user]);
  const canView = Boolean(user?.is_owner || permissions.has("admin.backup_retention.view") || permissions.has("admin.data_retention.view"));
  const canCleanup = Boolean(user?.is_owner || permissions.has("admin.data_retention.cleanup") || permissions.has("admin.backup_retention.manage"));

  async function load() {
    if (!token || !canView) return;
    setLoading(true);
    try {
      const data = await api.getBackupRetentionStatus(token);
      const background = await api.getBackgroundProcessingStatus(token);
      setStatus(data.status ?? {});
      setBackgroundProcessing(background.background_processing ?? {});
      setRecentJobs(data.recent_cleanup_jobs ?? []);
    } catch (error) {
      alerts.showApiError(error, "Unable to load backup and retention status");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token, canView]);

  async function runCleanup(dryRun: boolean) {
    if (!token) return;
    try {
      const parsedLimit = Number(limit || 250);
      const result = await api.runDataRetentionCleanup(token, {
        dry_run: dryRun,
        confirm: dryRun ? undefined : "RUN_RETENTION_CLEANUP",
        limit: Number.isFinite(parsedLimit) ? parsedLimit : 250,
        reason: dryRun ? "Phase 16 data retention dry-run from admin page" : "Confirmed Phase 16 guarded cleanup from admin page"
      });
      alerts.showSuccess(dryRun ? "Retention dry-run queued" : "Guarded cleanup queued", `Background job ${result.job_id} is tracking the operation.`);
      await load();
    } catch (error) {
      alerts.showError("Retention cleanup did not start", error instanceof ApiError ? error.message : "The cleanup request failed.");
    } finally {
      setConfirmCleanup(false);
    }
  }

  if (!canView) {
    return (
      <PageShell>
        <Panel className="p-6">
          <EmptyState title="Backup and retention unavailable" description="Your account needs backup/retention or data-retention admin permission." />
        </Panel>
      </PageShell>
    );
  }

  const readiness = (status.backup_readiness ?? {}) as Row;
  const dryRun = (status.dry_run ?? {}) as Row;
  const dryRunResults = rows(dryRun.results);
  const policies = rows(status.policies);
  const tableCounts = status.table_counts && typeof status.table_counts === "object" ? Object.entries(status.table_counts as Record<string, unknown>).map(([table, count]) => ({ table, count })) : [];
  const runbookLinks = Array.isArray(status.runbook_links) ? status.runbook_links.map((link) => ({ path: link })) : [];
  const queue = (backgroundProcessing.queue ?? {}) as Row;
  const scheduledRunner = (backgroundProcessing.scheduled_runner ?? {}) as Row;
  const jobCounts = rows(backgroundProcessing.job_counts);
  const recentFailures = rows(backgroundProcessing.recent_failures);

  return (
    <PageShell>
      <PageHeader
        title="Backup & Retention"
        description="Admin-only backup readiness, restore dry-run, R2 inventory, retention policies, and guarded cleanup status. No direct browser restore is available."
        actions={
          <>
            <AdminHelpLink target="backupRetention" label="Backup runbook" />
            <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="h-4 w-4" /> Refresh</Button>
          </>
        }
      />

      {loading ? <Panel className="p-6"><CardSkeleton cards={6} label="Loading backup and retention status" /></Panel> : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="D1 backup script" value={readiness.d1_backup_script} icon={DatabaseBackup} />
        <SummaryCard label="R2 inventory script" value={readiness.r2_inventory_script} icon={Archive} />
        <SummaryCard label="Restore dry-run script" value={readiness.d1_restore_dry_run_script} icon={FileCheck2} />
        <SummaryCard label="Browser live restore" value={readiness.restore_from_browser ? "Enabled" : "Disabled"} icon={ShieldAlert} />
      </div>

      <Panel className="space-y-4 p-4">
        <div>
          <h2 className="text-sm font-semibold">Background processing</h2>
          <p className="text-xs text-muted-foreground">D1 remains the source of truth. Cloudflare Queues are optional and fall back to the D1 runner if unavailable.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Processing mode" value={backgroundProcessing.mode ?? "d1"} icon={RefreshCw} />
          <SummaryCard label="Queue producer" value={bool(queue.producer_enabled) ? "Enabled" : "Fallback"} icon={Archive} />
          <SummaryCard label="Queue consumer" value={bool(queue.consumer_enabled) ? "Enabled" : "Disabled"} icon={DatabaseBackup} />
          <SummaryCard label="Scheduled runner" value={bool(scheduledRunner.enabled) ? "Enabled" : "Disabled"} icon={FileCheck2} />
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Job status counts</h3>
            <SimpleTable rows={jobCounts} columns={["status", "count"]} empty="No background jobs found." />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Recent failures / dead letters</h3>
            <SimpleTable rows={recentFailures} columns={["job_type", "status", "last_error_code", "updated_at"]} empty="No recent failed jobs." />
          </div>
        </div>
      </Panel>

      <Panel className="space-y-4 p-4">
        <div>
          <h2 className="text-sm font-semibold">Cleanup dry-run</h2>
          <p className="text-xs text-muted-foreground">Dry-run is the default. Real cleanup requires admin permission and explicit confirmation, and never targets employee/payroll/business records or active employee documents.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm font-medium">
            Bounded limit
            <Input className="w-32" type="number" min="1" max="1000" value={limit} onChange={(event) => setLimit(event.target.value)} />
          </label>
          <Button size="sm" onClick={() => void runCleanup(true)} disabled={!canCleanup}>Run dry-run</Button>
          <Button size="sm" variant="actionDestructive" onClick={() => setConfirmCleanup(true)} disabled={!canCleanup}>Queue confirmed cleanup</Button>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <div>
            <h2 className="mb-2 text-sm font-semibold">Data retention policies</h2>
            <SimpleTable rows={policies} columns={["policy_key", "retention_days", "applies_to", "is_enabled", "description"]} empty="No retention policies configured." />
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold">Latest dry-run target summary</h2>
            <SimpleTable rows={dryRunResults} columns={["target", "status", "eligible_count", "affected_count", "retention_days", "message"]} empty="No dry-run results yet." />
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <h2 className="mb-2 text-sm font-semibold">Operational table counts</h2>
            <SimpleTable rows={tableCounts} columns={["table", "count"]} empty="No table counts available." />
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold">Recent cleanup jobs</h2>
            <SimpleTable rows={recentJobs} columns={["job_type", "status", "progress_message", "created_at", "completed_at"]} empty="No cleanup jobs queued." />
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold">Disaster recovery links</h2>
            <SimpleTable rows={runbookLinks} columns={["path"]} empty="No runbook links configured." />
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmCleanup}
        title="Queue guarded cleanup?"
        description="This runs only the Phase 16 safe cleanup targets and requires explicit confirmation. Employee records, payroll records, audit/security logs, and active employee documents are blocked by default."
        confirmLabel="Queue cleanup"
        cancelLabel="Cancel"
        onConfirm={() => void runCleanup(false)}
        onCancel={() => setConfirmCleanup(false)}
      />
    </PageShell>
  );
}
