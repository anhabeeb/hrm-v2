import { Bell, CheckCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { LoadingSkeleton } from "../ui/page-shell";
import { StatusBadge } from "../ui/status-badge";
import { useAuth } from "../../hooks/useAuth";
import { api, type HrmNotification } from "../../lib/api";
import { cn } from "../../lib/utils";

const NOTIFICATIONS_UNAVAILABLE_MESSAGE = "Notifications unavailable. Try again shortly.";
const NOTIFICATIONS_UPDATE_ERROR_MESSAGE = "Could not update notifications. Please try again.";
const NOTIFICATION_UNREAD_POLL_INTERVAL_MS = Number(import.meta.env.VITE_NOTIFICATION_POLL_INTERVAL_MS ?? 90000);
const NOTIFICATION_FAILURE_BACKOFF_MS = 30000;

function isInternalRoute(route: string | null | undefined) {
  return Boolean(route && route.startsWith("/") && !route.startsWith("//") && !/^\/?https?:/i.test(route));
}

function relativeTime(value: string) {
  const created = new Date(value).getTime();
  if (!Number.isFinite(created)) return "";
  const diff = Math.max(0, Date.now() - created);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotificationBell() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<HrmNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastNotificationFailureAtRef = useRef(0);

  function failureBackoffActive() {
    return Date.now() - lastNotificationFailureAtRef.current < NOTIFICATION_FAILURE_BACKOFF_MS;
  }

  async function loadUnreadCount() {
    if (!token || document.visibilityState === "hidden" || failureBackoffActive()) return;
    try {
      const result = await api.getUnreadNotificationCount(token);
      setUnreadCount(result.unread_count);
      lastNotificationFailureAtRef.current = 0;
    } catch {
      lastNotificationFailureAtRef.current = Date.now();
    }
  }

  async function loadNotifications(showLoading = false) {
    if (!token) return;
    if (!showLoading && failureBackoffActive()) return;
    if (showLoading) setLoading(true);
    setError(null);
    try {
      const result = await api.listNotifications(token, { limit: 8 });
      setNotifications(result.notifications);
      setUnreadCount(result.unread_count);
      lastNotificationFailureAtRef.current = 0;
    } catch {
      setNotifications([]);
      setUnreadCount(0);
      lastNotificationFailureAtRef.current = Date.now();
      setError(NOTIFICATIONS_UNAVAILABLE_MESSAGE);
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    void loadUnreadCount();
    const handle = window.setInterval(() => void loadUnreadCount(), NOTIFICATION_UNREAD_POLL_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void loadUnreadCount();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(handle);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [token]);

  useEffect(() => {
    if (open) void loadNotifications(true);
  }, [open]);

  async function openNotification(notification: HrmNotification) {
    if (token && !notification.is_read) {
      try {
      await api.markNotificationRead(token, notification.id);
      setNotifications((rows) => rows.map((row) => row.id === notification.id ? { ...row, is_read: true, read_at: new Date().toISOString() } : row));
      setUnreadCount((count) => Math.max(0, count - 1));
      void loadUnreadCount();
      } catch {
        // Navigation should still work even if the read marker cannot be saved.
      }
    }
    setOpen(false);
    if (isInternalRoute(notification.route)) navigate(notification.route!);
  }

  async function markAllRead() {
    if (!token) return;
    try {
      await api.markAllNotificationsRead(token);
      setNotifications((rows) => rows.map((row) => ({ ...row, is_read: true, read_at: row.read_at ?? new Date().toISOString() })));
      setUnreadCount(0);
      void loadUnreadCount();
    } catch {
      setError(NOTIFICATIONS_UPDATE_ERROR_MESSAGE);
    }
  }

  return (
    <div className="relative">
      <Button variant="outline" size="icon" title="Notifications" onClick={() => setOpen((value) => !value)} className="relative">
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border border-white bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </Button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(92vw,24rem)] overflow-hidden rounded-lg border bg-white shadow-xl">
          <div className="flex items-center justify-between border-b bg-slate-50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-slate-950">Notifications</p>
              <p className="text-xs text-muted-foreground">{unreadCount ? `${unreadCount} unread` : "All caught up"}</p>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => void markAllRead()} disabled={!unreadCount}>
                <CheckCheck className="h-4 w-4" /> Mark all read
              </Button>
            </div>
          </div>
          <div className="max-h-[28rem] overflow-y-auto p-2">
            {loading ? <LoadingSkeleton rows={3} /> : null}
            {error ? (
              <div className="m-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <div className="flex items-center justify-between gap-3">
                  <span>{error}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 text-amber-900 hover:bg-amber-100"
                    onClick={() => void loadNotifications(true)}
                  >
                    Retry
                  </Button>
                </div>
              </div>
            ) : null}
            {!loading && !error && notifications.length === 0 ? (
              <EmptyState title="No notifications" description="New approval, document, payroll, and system updates will appear here." />
            ) : null}
            {!loading && !error ? (
              <div className="space-y-1">
                {notifications.map((notification) => (
                  <Button
                    key={notification.id}
                    variant="ghost"
                    className={cn("h-auto w-full justify-start rounded-md px-3 py-2 text-left", !notification.is_read && "bg-primary/5")}
                    onClick={() => void openNotification(notification)}
                    title={notification.route ?? undefined}
                  >
                    <span className={cn("mr-2 mt-1 h-2 w-2 shrink-0 rounded-full", notification.is_read ? "bg-slate-300" : "bg-primary")} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{notification.title}</span>
                      <span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{notification.message}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        <Badge>{notification.module_key}</Badge>
                        <span>{relativeTime(notification.created_at)}</span>
                      </span>
                    </span>
                    <StatusBadge value={notification.severity} className="ml-2 shrink-0" />
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="border-t bg-slate-50 px-3 py-2">
            <Button variant="ghost" size="sm" className="w-full justify-center" onClick={() => {
              setOpen(false);
              navigate("/notifications");
            }}>
              View all notifications
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
