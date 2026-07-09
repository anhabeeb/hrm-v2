import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCheck, RefreshCw } from "lucide-react";
import { PageShell, SelectField } from "../components/ui/page-shell";
import { Panel } from "../components/ui/panel";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { EmptyState } from "../components/ui/empty-state";
import { useAuth } from "../hooks/useAuth";
import { useAlert } from "../components/alerts/useAlert";
import { api, type HrmNotification } from "../lib/api";

function isInternalRoute(route: string | null | undefined) {
  return Boolean(route && route.startsWith("/") && !route.startsWith("//") && !/^\/?https?:/i.test(route));
}

function formatTime(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function tone(severity: string) {
  if (severity === "CRITICAL" || severity === "ERROR") return { bg: "#FCEBEB", text: "#A32D2D" };
  if (severity === "WARNING") return { bg: "#FAEEDA", text: "#854F0B" };
  if (severity === "SUCCESS") return { bg: "#E7F6EF", text: "#1F7A54" };
  return { bg: "#F7F7FB", text: "#6B6F86" };
}

const PAGE_SIZE = 25;

export function NotificationCenterPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const alerts = useAlert();
  const [rows, setRows] = useState<HrmNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [module, setModule] = useState("");
  const [read, setRead] = useState("");
  const [severity, setSeverity] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const result = await api.listNotifications(token, {
        module: module || undefined,
        read: read || undefined,
        severity: severity || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE
      });
      setRows(result.notifications ?? []);
      setUnreadCount(Number(result.unread_count ?? 0));
      setHasMore(Boolean(result.pagination?.has_more));
    } catch (err) {
      alerts.showApiError(err, "Unable to load notifications.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token, page, module, read, severity, dateFrom, dateTo]);
  useEffect(() => { setPage(1); }, [module, read, severity, dateFrom, dateTo]);

  function resetFilters() {
    setModule("");
    setRead("");
    setSeverity("");
    setDateFrom("");
    setDateTo("");
  }

  async function markRead(notification: HrmNotification) {
    if (!token) return;
    try {
      await api.markNotificationRead(token, notification.id);
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to update notification.");
    }
  }

  async function markAllRead() {
    if (!token) return;
    try {
      await api.markAllNotificationsRead(token);
      alerts.showSuccess("Notifications updated", "All notifications were marked as read.");
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to update notifications.");
    }
  }

  async function openNotification(notification: HrmNotification) {
    if (!notification.is_read) await markRead(notification);
    if (isInternalRoute(notification.route)) navigate(notification.route!);
  }

  return (
    <PageShell constrained={false}>
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-lg font-medium text-slate-950">Notification Center</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Approval updates, document alerts, payroll notices, and system messages for your access scope</p>
            </div>
            <Badge>{unreadCount} unread</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4" /> Refresh</Button>
            <Button size="sm" onClick={() => void markAllRead()} disabled={!unreadCount}><CheckCheck className="h-4 w-4" /> Mark all read</Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input className="h-8 w-56 text-xs" placeholder="Filter module..." value={module} onChange={(e) => setModule(e.target.value)} />
          <SelectField value={read} onValueChange={setRead} className="h-8 w-40 text-xs">
            <option value="">All read states</option>
            <option value="unread">Unread only</option>
            <option value="read">Read only</option>
          </SelectField>
          <SelectField value={severity} onValueChange={setSeverity} className="h-8 w-40 text-xs">
            <option value="">All severities</option>
            {["INFO", "SUCCESS", "WARNING", "ERROR", "CRITICAL"].map((s) => <option key={s} value={s}>{s}</option>)}
          </SelectField>
          <Input type="date" className="h-8 w-36 text-xs" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" className="h-8 w-36 text-xs" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          {module || read || severity || dateFrom || dateTo ? <Button size="sm" variant="ghost" onClick={resetFilters}>Reset</Button> : null}
        </div>

        {loading ? (
          <div className="flex flex-col gap-2">{Array.from({ length: 4 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
        ) : rows.length ? (
          <Panel className="overflow-hidden">
            <div className="flex flex-col">
              {rows.map((notification) => (
                <div key={notification.id} className="flex items-center gap-3.5 border-b border-[#F1F1F7] px-4 py-3 last:border-b-0" style={notification.is_read ? undefined : { background: "rgba(91,79,233,0.04)" }}>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: notification.is_read ? "#CBD0DC" : "#5B4FE9" }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-xs font-medium text-slate-950">{notification.title}</p>
                      <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: tone(notification.severity).bg, color: tone(notification.severity).text }}>{notification.severity}</span>
                      <span className="shrink-0 rounded-full bg-[#F7F7FB] px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{notification.module_key}</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{notification.message}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">{formatTime(notification.created_at)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {!notification.is_read ? <Button variant="outline" size="sm" onClick={() => void markRead(notification)}>Mark read</Button> : null}
                    {isInternalRoute(notification.route) ? <Button size="sm" onClick={() => void openNotification(notification)}>Open</Button> : null}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        ) : (
          <Panel><EmptyState title="No notifications" description="There are no notifications matching your filters." /></Panel>
        )}

        {rows.length ? (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Page {page}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
              <Button size="sm" variant="outline" disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}
