import { Bell, CheckCheck, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import {
  ActiveFilterChips,
  FilterResetButton,
  FilterSection,
  MoreFiltersSheet,
  StandardDateRangeFilter,
  StandardFilterBar,
  StandardSearchInput,
  StandardSelectFilter
} from "../components/filters";
import { LoadingSkeleton, PageHeader, PageShell } from "../components/ui/page-shell";
import { StatusBadge } from "../components/ui/status-badge";
import { useAuth } from "../hooks/useAuth";
import { api, type HrmNotification } from "../lib/api";
import { cn } from "../lib/utils";

function isInternalRoute(route: string | null | undefined) {
  return Boolean(route && route.startsWith("/") && !route.startsWith("//") && !/^\/?https?:/i.test(route));
}

function formatTime(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export function NotificationCenterPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<HrmNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({ read: "", module: "", severity: "", date_from: "", date_to: "" });
  const dateRange = { from: filters.date_from, to: filters.date_to };
  const activeChips = [
    filters.module ? { key: "module", label: "Module", value: filters.module, onRemove: () => setFilters((current) => ({ ...current, module: "" })) } : null,
    filters.read ? { key: "read", label: "Read", value: filters.read, onRemove: () => setFilters((current) => ({ ...current, read: "" })) } : null,
    filters.severity ? { key: "severity", label: "Severity", value: filters.severity, onRemove: () => setFilters((current) => ({ ...current, severity: "" })) } : null,
    filters.date_from || filters.date_to ? { key: "date", label: "Date", value: `${filters.date_from || "Any"} - ${filters.date_to || "Any"}`, onRemove: () => setFilters((current) => ({ ...current, date_from: "", date_to: "" })) } : null
  ].filter(Boolean) as Array<{ key: string; label: string; value: string; onRemove: () => void }>;

  function resetFilters() {
    setFilters({ read: "", module: "", severity: "", date_from: "", date_to: "" });
  }

  async function load() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.listNotifications(token, { ...filters, limit: 100 });
      setRows(result.notifications);
      setUnreadCount(result.unread_count);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : "Notifications are unavailable.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [token]);

  async function markRead(notification: HrmNotification) {
    if (!token) return;
    await api.markNotificationRead(token, notification.id);
    setRows((current) => current.map((row) => row.id === notification.id ? { ...row, is_read: true, read_at: row.read_at ?? new Date().toISOString() } : row));
    setUnreadCount((count) => Math.max(0, count - 1));
  }

  async function markAllRead() {
    if (!token) return;
    const result = await api.markAllNotificationsRead(token);
    setRows((current) => current.map((row) => ({ ...row, is_read: true, read_at: row.read_at ?? new Date().toISOString() })));
    setUnreadCount((count) => Math.max(0, count - result.count));
  }

  async function openNotification(notification: HrmNotification) {
    if (!notification.is_read) await markRead(notification);
    if (isInternalRoute(notification.route)) navigate(notification.route!);
  }

  return (
    <PageShell>
      <PageHeader
        title="Notification Center"
        description="Review HRM notifications, approval updates, document alerts, payroll notices, and system messages for your access scope."
        icon={<Bell className="h-5 w-5" />}
        actions={
          <>
            <Badge>{unreadCount} unread</Badge>
            <Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="h-4 w-4" /> Refresh</Button>
            <Button size="sm" onClick={() => void markAllRead()} disabled={!unreadCount}><CheckCheck className="h-4 w-4" /> Mark all read</Button>
          </>
        }
      />

      <StandardFilterBar
        search={<StandardSearchInput value={filters.module} onDebouncedChange={(module) => setFilters((current) => ({ ...current, module }))} placeholder="Filter module..." />}
        reset={<FilterResetButton onReset={resetFilters} />}
        actions={<Button variant="outline" onClick={() => void load()}>Apply filters</Button>}
        moreFilters={
          <MoreFiltersSheet onReset={resetFilters} onApply={() => void load()}>
            <FilterSection title="Notification date">
              <StandardDateRangeFilter value={dateRange} onChange={(range) => setFilters((current) => ({ ...current, date_from: range.from ?? "", date_to: range.to ?? "" }))} label="Created Date Range" />
            </FilterSection>
          </MoreFiltersSheet>
        }
      >
        <StandardSelectFilter value={filters.read} onValueChange={(read) => setFilters((current) => ({ ...current, read }))} allLabel="All read states" width="status" options={[{ value: "unread", label: "Unread only" }, { value: "read", label: "Read only" }]} />
        <StandardSelectFilter value={filters.severity} onValueChange={(severity) => setFilters((current) => ({ ...current, severity }))} allLabel="All severities" width="status" options={["INFO", "SUCCESS", "WARNING", "ERROR", "CRITICAL"].map((severity) => ({ value: severity, label: severity }))} />
      </StandardFilterBar>
      <ActiveFilterChips chips={activeChips} />

      {loading ? <LoadingSkeleton rows={6} /> : null}
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
      {!loading && !error && rows.length === 0 ? <EmptyState title="No notifications" description="There are no notifications matching your filters." /> : null}
      {!loading && !error && rows.length ? (
        <section className="overflow-hidden rounded-lg border bg-white shadow-panel">
          <div className="divide-y">
            {rows.map((notification) => (
              <div key={notification.id} className={cn("grid gap-3 px-4 py-3 lg:grid-cols-[1fr_auto]", !notification.is_read && "bg-primary/5")}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", notification.is_read ? "bg-slate-300" : "bg-primary")} />
                    <h2 className="truncate text-sm font-semibold text-slate-950">{notification.title}</h2>
                    <StatusBadge value={notification.severity} />
                    <Badge>{notification.module_key}</Badge>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{notification.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatTime(notification.created_at)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                  {!notification.is_read ? <Button variant="outline" size="sm" onClick={() => void markRead(notification)}>Mark read</Button> : null}
                  {isInternalRoute(notification.route) ? <Button size="sm" onClick={() => void openNotification(notification)}>Open</Button> : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </PageShell>
  );
}
