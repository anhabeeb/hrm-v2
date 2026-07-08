import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { PageShell } from "../../components/ui/page-shell";
import { Panel } from "../../components/ui/panel";
import { Button } from "../../components/ui/button";
import { EmptyState } from "../../components/ui/empty-state";
import { useAuth } from "../../hooks/useAuth";
import { useAlert } from "../../components/alerts/useAlert";
import { api } from "../../lib/api";

type Row = Record<string, unknown>;
function asRows(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}
function text(value: unknown, fallback = "—") {
  const s = value === null || value === undefined ? "" : String(value);
  return s && s !== "null" && s !== "undefined" ? s : fallback;
}
function tone(severity: string) {
  if (severity === "CRITICAL") return { bg: "#FCEBEB", text: "#A32D2D" };
  if (severity === "WARNING") return { bg: "#FAEEDA", text: "#854F0B" };
  return { bg: "#F7F7FB", text: "#6B6F86" };
}

export function SelfServiceNotificationsPage() {
  const { token } = useAuth();
  const alerts = useAlert();
  const [notifications, setNotifications] = useState<Row[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const result = await api.getSelfServiceNotifications(token);
      setNotifications(asRows(result.notifications));
      setUnreadCount(Number(result.unread_count ?? 0));
    } catch (err) {
      alerts.showApiError(err, "Unable to load your notifications.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [token]);

  async function markAllRead() {
    if (!token) return;
    try {
      await api.markAllSelfServiceNotificationsRead(token);
      alerts.showSuccess("Notifications updated", "All notifications were marked as read.");
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to update notifications.");
    }
  }

  async function markRead(row: Row) {
    if (!token) return;
    try {
      await api.markSelfServiceNotificationRead(token, String(row.id));
      alerts.showSuccess("Notification updated", "Notification marked as read.");
      await load();
    } catch (err) {
      alerts.showApiError(err, "Unable to update notification.");
    }
  }

  return (
    <PageShell constrained={false}>
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-muted-foreground" />
            <p className="text-lg font-medium text-slate-950">Notifications</p>
            <span className="rounded-full bg-[#FAEEDA] px-2 py-0.5 text-[10px] font-medium text-[#854F0B]">{unreadCount} unread</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => void markAllRead()}>Mark all read</Button>
        </div>

        {loading ? (
          <div className="flex flex-col gap-2">{Array.from({ length: 3 }).map((_, i) => <Panel key={i} className="h-16 animate-pulse" />)}</div>
        ) : notifications.length ? (
          <Panel className="overflow-hidden">
            <div className="flex flex-col">
              {notifications.map((row, i) => (
                <div key={String(row.id ?? i)} className="flex items-center gap-3.5 border-b border-[#F1F1F7] px-4 py-3 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-950">{text(row.title)}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">{text(row.type)} · {text(row.created_at)}</p>
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium" style={{ background: tone(text(row.severity)).bg, color: tone(text(row.severity)).text }}>{text(row.severity)}</span>
                  <Button size="sm" variant="outline" onClick={() => void markRead(row)}>Mark read</Button>
                </div>
              ))}
            </div>
          </Panel>
        ) : (
          <Panel className="p-4"><EmptyState title="No notifications" description="You're all caught up." /></Panel>
        )}
      </div>
    </PageShell>
  );
}
