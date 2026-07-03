import { Activity, Database, Gauge, RefreshCw, Server, TimerReset } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { InputField, MetricGrid, PageHeader, PageShell, PermissionDeniedState, SectionCard, SelectField, StandardTabs, StatCard, WarningPanel } from "../components/ui/page-shell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { TableSkeleton } from "../components/loading";
import { AdminHelpLink } from "../features/admin-help/AdminHelpLink";
import { useApiQuery } from "../hooks/useApiQuery";
import { useAuth } from "../hooks/useAuth";
import { api } from "../lib/api";

type MetricTab = "api" | "frontend" | "jobs" | "builds";

const VIEW_PERMISSIONS = ["performance.metrics.view", "performance.metrics.manage", "admin.system_health.view", "admin.system_health.manage"];
const MANAGE_PERMISSIONS = ["performance.metrics.manage", "admin.system_health.manage"];

function hasAny(user: ReturnType<typeof useAuth>["user"], permissions: string[]) {
  return Boolean(user?.is_owner || user?.permissions.some((permission) => permissions.includes(permission)));
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMs(value: unknown) {
  const ms = numberValue(value);
  if (!ms) return "0 ms";
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms)} ms`;
}

function formatKb(value: unknown) {
  const kb = numberValue(value);
  return `${Math.round(kb)} KB`;
}

function badgeTone(value: unknown): "neutral" | "success" | "warning" | "danger" | "info" {
  const text = String(value ?? "").toUpperCase();
  if (["PASS", "SUCCEEDED", "200", "201", "202"].includes(text)) return "success";
  if (["WARNING", "RETRYING", "QUEUED", "RUNNING"].includes(text)) return "warning";
  if (["FAIL", "FAILED", "DEAD_LETTERED", "ERROR", "CRITICAL"].includes(text) || Number(text) >= 500) return "danger";
  return "neutral";
}

function safeText(value: unknown, fallback = "-") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function getRowsPayload(data: unknown): { metrics: Record<string, unknown>[]; pagination?: Record<string, unknown> } {
  if (!data || typeof data !== "object") return { metrics: [] };
  const rows = (data as { metrics?: Record<string, unknown>[] }).metrics;
  return {
    metrics: Array.isArray(rows) ? rows : [],
    pagination: (data as { pagination?: Record<string, unknown> }).pagination
  };
}

function OverviewCard({ title, value, detail, icon, tone = "neutral" }: { title: string; value: string; detail: string; icon: ReactNode; tone?: "neutral" | "success" | "warning" | "danger" | "info" }) {
  return <StatCard label={title} value={value} trend={detail} icon={icon} tone={tone} />;
}

export function PerformanceDashboardPage() {
  const { token, user } = useAuth();
  const [tab, setTab] = useState<MetricTab>("api");
  const [filters, setFilters] = useState({ severity: "", date_from: "", date_to: "", route_key: "" });
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const canView = hasAny(user, VIEW_PERMISSIONS);
  const canManage = hasAny(user, MANAGE_PERMISSIONS);
  const queryFilters = useMemo(() => ({
    limit: 25,
    severity: filters.severity,
    date_from: filters.date_from,
    date_to: filters.date_to,
    route_key: tab === "api" || tab === "frontend" ? filters.route_key : "",
    job_type: tab === "jobs" ? filters.route_key : "",
    build_label: tab === "builds" ? filters.route_key : ""
  }), [filters, tab]);

  const overviewQuery = useApiQuery<Record<string, unknown>>({
    queryKey: ["performance", "overview", token],
    enabled: Boolean(token && canView),
    queryFn: ({ signal }) => api.getPerformanceOverview(token!, undefined, signal)
  });

  const listQuery = useApiQuery<{ metrics: Record<string, unknown>[]; pagination?: Record<string, unknown> }>({
    queryKey: ["performance", tab, queryFilters, token],
    enabled: Boolean(token && canView),
    queryFn: ({ signal }) => {
      if (tab === "frontend") return api.listPerformanceFrontendMetrics(token!, queryFilters, signal);
      if (tab === "jobs") return api.listPerformanceJobMetrics(token!, queryFilters, signal);
      if (tab === "builds") return api.listPerformanceBuildMetrics(token!, queryFilters, signal);
      return api.listPerformanceApiMetrics(token!, queryFilters, signal);
    },
    placeholderData: (previous) => previous
  });

  const warningsQuery = useApiQuery<{ warnings: Record<string, unknown>[] }>({
    queryKey: ["performance", "warnings", token],
    enabled: Boolean(token && canView),
    queryFn: ({ signal }) => api.listPerformanceWarnings(token!, undefined, signal)
  });

  const appEventHealthQuery = useApiQuery<{ app_events_health: Record<string, unknown> }>({
    queryKey: ["performance", "app-events-health", token],
    enabled: Boolean(token && canView),
    queryFn: ({ signal }) => api.getAppEventHealth(token!, signal)
  });

  if (!canView) return <PermissionDeniedState />;

  const overview = overviewQuery.data ?? {};
  const apiOverview = overview.api as Record<string, unknown> | undefined;
  const frontendOverview = overview.frontend as Record<string, unknown> | undefined;
  const jobOverview = overview.jobs as Record<string, unknown> | undefined;
  const buildOverview = overview.builds as Record<string, unknown> | undefined;
  const appEventHealth = appEventHealthQuery.data?.app_events_health ?? {};
  const rows = getRowsPayload(listQuery.data).metrics;
  const warnings = warningsQuery.data?.warnings ?? [];

  const cleanup = async () => {
    if (!token) return;
    setCleanupBusy(true);
    setCleanupMessage(null);
    try {
      const result = await api.cleanupPerformanceMetrics(token, { detail_retention_days: 30, build_retention_days: 180 });
      const deleted = result.cleanup?.deleted as Record<string, unknown> | undefined;
      setCleanupMessage(`Cleanup complete. API ${deleted?.api ?? 0}, frontend ${deleted?.frontend ?? 0}, jobs ${deleted?.jobs ?? 0}, builds ${deleted?.builds ?? 0}.`);
      await Promise.all([overviewQuery.refetch(), listQuery.refetch(), warningsQuery.refetch()]);
    } catch (error) {
      setCleanupMessage(error instanceof Error ? error.message : "Cleanup failed.");
    } finally {
      setCleanupBusy(false);
    }
  };

  return (
    <PageShell>
      <PageHeader
        title="Performance Observability"
        description="Admin-only speed telemetry for API, D1, frontend route, background job, upload/import/report, and build-budget signals. Metrics are sampled and sanitized."
        actions={
          <>
            <AdminHelpLink target="performance" label="Performance guide" />
            <Button variant="outline" size="sm" onClick={() => void Promise.all([overviewQuery.refetch(), listQuery.refetch(), warningsQuery.refetch(), appEventHealthQuery.refetch()])}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            {canManage ? (
              <Button variant="actionWarning" size="sm" loading={cleanupBusy} loadingLabel="Cleaning" onClick={() => void cleanup()}>
                Clean old metrics
              </Button>
            ) : null}
          </>
        }
      />

      <MetricGrid>
        <OverviewCard title="API requests" value={String(numberValue(apiOverview?.total_count))} detail={`${formatMs(apiOverview?.avg_duration_ms)} avg, ${numberValue(apiOverview?.slow_count)} slow`} icon={<Server className="h-4 w-4" />} tone={numberValue(apiOverview?.slow_count) ? "warning" : "info"} />
        <OverviewCard title="Frontend routes" value={String(numberValue(frontendOverview?.total_count))} detail={`${formatMs(frontendOverview?.avg_duration_ms)} avg, ${numberValue(frontendOverview?.slow_count)} slow`} icon={<Gauge className="h-4 w-4" />} tone={numberValue(frontendOverview?.slow_count) ? "warning" : "success"} />
        <OverviewCard title="Background jobs" value={String(numberValue(jobOverview?.total_count))} detail={`${formatMs(jobOverview?.avg_duration_ms)} avg, ${numberValue(jobOverview?.failed_count)} failed`} icon={<TimerReset className="h-4 w-4" />} tone={numberValue(jobOverview?.failed_count) ? "danger" : "info"} />
        <OverviewCard title="Build budget" value={formatKb(buildOverview?.largest_chunk_kb)} detail={`${numberValue(buildOverview?.budget_warning_count)} warnings, ${numberValue(buildOverview?.total_count)} builds`} icon={<Database className="h-4 w-4" />} tone={numberValue(buildOverview?.budget_warning_count) ? "warning" : "neutral"} />
      </MetricGrid>

      <SectionCard title="Live event stream health" description="Authenticated app-event delivery mode, reconnect configuration, recent event count, and D1 backlog. Event payloads and storage keys are never displayed.">
        {appEventHealthQuery.isLoading ? <TableSkeleton rows={2} columns={4} /> : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <OverviewCard title="Delivery mode" value={safeText(appEventHealth.active_mode, "polling_fallback")} detail={`Requested ${safeText(appEventHealth.requested_mode, "auto")}`} icon={<Activity className="h-4 w-4" />} tone={appEventHealth.stream_endpoint_enabled ? "success" : "warning"} />
            <OverviewCard title="Recent events" value={String(numberValue(appEventHealth.recent_event_count))} detail={`Last ${safeText(appEventHealth.last_event_at, "none")}`} icon={<Gauge className="h-4 w-4" />} tone="info" />
            <OverviewCard title="D1 event backlog" value={String(numberValue(appEventHealth.d1_event_backlog_count))} detail={`${safeText(appEventHealth.expired_app_event_cleanup_status, "cleanup scheduled")}`} icon={<Database className="h-4 w-4" />} tone={numberValue(appEventHealth.d1_event_backlog_count) > 5000 ? "warning" : "neutral"} />
            <OverviewCard title="Reconnect policy" value={`${safeText(appEventHealth.reconnect_base_ms, "2000")} ms`} detail={`Max ${safeText(appEventHealth.reconnect_max_ms, "30000")} ms`} icon={<RefreshCw className="h-4 w-4" />} tone="neutral" />
          </div>
        )}
      </SectionCard>

      {cleanupMessage ? <WarningPanel tone={cleanupMessage.includes("failed") ? "danger" : "success"}>{cleanupMessage}</WarningPanel> : null}

      <SectionCard title="Recent performance warnings" description="Slow endpoints, slow routes, slow jobs, payload warnings, and build-budget warnings. Raw request and response bodies are never stored.">
        {warningsQuery.isLoading ? <TableSkeleton rows={4} columns={4} /> : warnings.length ? (
          <div className="overflow-x-auto">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Route / item</TableHead>
                  <TableHead>Detail</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {warnings.map((warning, index) => (
                  <TableRow key={`${warning.source}-${warning.created_at}-${index}`}>
                    <TableCell><Badge tone={badgeTone(warning.source)}>{safeText(warning.source)}</Badge></TableCell>
                    <TableCell className="max-w-[320px] truncate" title={safeText(warning.route_key ?? warning.item)}>{safeText(warning.route_key ?? warning.item)}</TableCell>
                    <TableCell>{safeText(warning.detail)}</TableCell>
                    <TableCell>{formatMs(warning.duration_ms)}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{safeText(warning.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : <div className="rounded-md border bg-slate-50 px-4 py-6 text-sm text-muted-foreground">No recent warning metrics captured.</div>}
      </SectionCard>

      <SectionCard
        title="Metric explorer"
        description="Paginated server-side lists. Use filters to narrow the source without loading all metric history."
        actions={<Badge tone="info">Paginated</Badge>}
      >
        <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px_160px_160px]">
          <InputField label={tab === "jobs" ? "Job type" : tab === "builds" ? "Build label" : "Route contains"} value={filters.route_key} onChange={(event) => setFilters((current) => ({ ...current, route_key: event.target.value }))} placeholder="Filter route or item" />
          <InputField label="From" type="date" value={filters.date_from.slice(0, 10)} onChange={(event) => setFilters((current) => ({ ...current, date_from: event.target.value }))} />
          <InputField label="To" type="date" value={filters.date_to.slice(0, 10)} onChange={(event) => setFilters((current) => ({ ...current, date_to: event.target.value }))} />
          <SelectField label="Severity" value={filters.severity} onChange={(event) => setFilters((current) => ({ ...current, severity: event.target.value }))}>
            <option value="">All</option>
            <option value="WARNING">Warning</option>
            <option value="CRITICAL">Critical</option>
          </SelectField>
        </div>

        <StandardTabs
          active={tab}
          onChange={(key) => setTab(key as MetricTab)}
          label="Performance metric groups"
          items={[
            { key: "api", label: "Slow API endpoints", icon: <Server className="h-4 w-4" /> },
            { key: "frontend", label: "Frontend routes", icon: <Activity className="h-4 w-4" /> },
            { key: "jobs", label: "Background jobs", icon: <TimerReset className="h-4 w-4" /> },
            { key: "builds", label: "Build budgets", icon: <Database className="h-4 w-4" /> }
          ]}
        />

        <div className="mt-4">
          {listQuery.isLoading ? <TableSkeleton rows={8} columns={tab === "api" ? 8 : 6} /> : (
            <MetricRows tab={tab} rows={rows} />
          )}
        </div>
      </SectionCard>
    </PageShell>
  );
}

function MetricRows({ tab, rows }: { tab: MetricTab; rows: Record<string, unknown>[] }) {
  if (!rows.length) return <div className="rounded-md border bg-slate-50 px-4 py-6 text-sm text-muted-foreground">No metrics match the current filters.</div>;
  if (tab === "api") {
    return (
      <div className="overflow-x-auto">
        <Table className="min-w-[920px]">
          <TableHeader>
            <TableRow>
              <TableHead>Route</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>D1 queries</TableHead>
              <TableHead>D1 time</TableHead>
              <TableHead>Payload</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={safeText(row.id)}>
                <TableCell className="max-w-[320px] truncate" title={safeText(row.route_key)}>{safeText(row.route_key)}</TableCell>
                <TableCell>{safeText(row.method)}</TableCell>
                <TableCell><Badge tone={badgeTone(row.status_code)}>{safeText(row.status_code)}</Badge></TableCell>
                <TableCell>{formatMs(row.duration_ms)}</TableCell>
                <TableCell>{safeText(row.d1_query_count)}</TableCell>
                <TableCell>{formatMs(row.d1_duration_ms)}</TableCell>
                <TableCell>{formatKb(Number(row.payload_bytes) / 1024)}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{safeText(row.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }
  if (tab === "frontend") {
    return (
      <div className="overflow-x-auto">
        <Table className="min-w-[820px]">
          <TableHeader>
            <TableRow>
              <TableHead>Route</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Metadata</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={safeText(row.id)}>
                <TableCell className="max-w-[320px] truncate" title={safeText(row.route_key)}>{safeText(row.route_key)}</TableCell>
                <TableCell><Badge tone="info">{safeText(row.metric_type)}</Badge></TableCell>
                <TableCell>{formatMs(row.duration_ms)}</TableCell>
                <TableCell className="max-w-[320px] truncate" title={safeText(row.metadata_json)}>{safeText(row.metadata_json)}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{safeText(row.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }
  if (tab === "jobs") {
    return (
      <div className="overflow-x-auto">
        <Table className="min-w-[860px]">
          <TableHeader>
            <TableRow>
              <TableHead>Job type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Queue wait</TableHead>
              <TableHead>Run duration</TableHead>
              <TableHead>Attempts</TableHead>
              <TableHead>Processed</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={safeText(row.id)}>
                <TableCell className="max-w-[300px] truncate" title={safeText(row.job_type)}>{safeText(row.job_type)}</TableCell>
                <TableCell><Badge tone={badgeTone(row.status)}>{safeText(row.status)}</Badge></TableCell>
                <TableCell>{formatMs(row.queue_wait_ms)}</TableCell>
                <TableCell>{formatMs(row.run_duration_ms)}</TableCell>
                <TableCell>{safeText(row.attempt_count)}</TableCell>
                <TableCell>{safeText(row.processed_count)}</TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{safeText(row.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[780px]">
        <TableHeader>
          <TableRow>
            <TableHead>Build</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Main entry</TableHead>
            <TableHead>Initial JS</TableHead>
            <TableHead>CSS</TableHead>
            <TableHead>Largest chunk</TableHead>
            <TableHead>Chunks</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={safeText(row.id)}>
              <TableCell className="max-w-[240px] truncate" title={safeText(row.build_label)}>{safeText(row.build_label)}</TableCell>
              <TableCell><Badge tone={badgeTone(row.budget_status)}>{safeText(row.budget_status)}</Badge></TableCell>
              <TableCell>{formatKb(row.main_entry_kb)}</TableCell>
              <TableCell>{formatKb(row.initial_js_kb)}</TableCell>
              <TableCell>{formatKb(row.initial_css_kb)}</TableCell>
              <TableCell>{formatKb(row.largest_chunk_kb)}</TableCell>
              <TableCell>{safeText(row.chunk_count)}</TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">{safeText(row.created_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
