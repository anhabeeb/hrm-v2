import { Bell, CheckCheck, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { Input } from "../components/ui/input";
import { FilterBar, LoadingSkeleton, PageHeader, PageShell, SelectField } from "../components/ui/page-shell";
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

      <FilterBar className="lg:grid-cols-6">
        <SelectField value={filters.read} onChange={(event) => setFilters({ ...filters, read: event.target.value })} aria-label="Read filter">
          <option value="">All read states</option>
          <option value="unread">Unread only</option>
          <option value="read">Read only</option>
        </SelectField>
        <Input placeholder="Module" value={filters.module} onChange={(event) => setFilters({ ...filters, module: event.target.value })} />
        <SelectField value={filters.severity} onChange={(event) => setFilters({ ...filters, severity: event.target.value })} aria-label="Severity filter">
          <option value="">All severities</option>
          {["INFO", "SUCCESS", "WARNING", "ERROR", "CRITICAL"].map((severity) => <option key={severity} value={severity}>{severity}</option>)}
        </SelectField>
        <Input type="date" value={filters.date_from} onChange={(event) => setFilters({ ...filters, date_from: event.target.value })} />
        <Input type="date" value={filters.date_to} onChange={(event) => setFilters({ ...filters, date_to: event.target.value })} />
        <Button variant="outline" onClick={() => void load()}>Apply filters</Button>
      </FilterBar>

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
