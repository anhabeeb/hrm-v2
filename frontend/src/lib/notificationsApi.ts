import { apiClient } from "./apiClient";

export interface HrmNotification {
  id: string;
  recipient_user_id?: string | null;
  recipient_employee_id?: string | null;
  employee_id?: string | null;
  module_key: string;
  entity_type?: string | null;
  entity_id?: string | null;
  title: string;
  message: string;
  severity: string;
  notification_type: string;
  route?: string | null;
  is_read: boolean;
  read_at?: string | null;
  created_at: string;
  metadata?: Record<string, unknown> | null;
}

export interface UnreadNotificationCountResponse {
  unread_count: number;
  unavailable?: boolean;
  reason?: string;
}

function query(params?: Record<string, string | number | boolean | null | undefined>) {
  if (!params) return "";
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") search.set(key, String(value));
  });
  const value = search.toString();
  return value ? `?${value}` : "";
}

export const notificationsApi = {
  getUnreadNotificationCount(token: string, signal?: AbortSignal) {
    return apiClient.get<UnreadNotificationCountResponse>("/api/v1/notifications/unread-count", { token, signal, requestLabel: "notifications.unread-count" });
  },
  listNotifications(token: string, params?: Record<string, string | number | boolean | null | undefined>, signal?: AbortSignal) {
    return apiClient.get<{ notifications: HrmNotification[]; unread_count: number; pagination?: Record<string, unknown> }>(`/api/v1/notifications${query(params)}`, { token, signal, requestLabel: "notifications.list" });
  },
  markNotificationRead(token: string, notificationId: string) {
    return apiClient.post<{ read: boolean }>(`/api/v1/notifications/${notificationId}/mark-read`, undefined, { token, requestLabel: "notifications.mark-read" });
  },
  markAllNotificationsRead(token: string) {
    return apiClient.post<{ read: boolean; count: number }>("/api/v1/notifications/mark-all-read", undefined, { token, requestLabel: "notifications.mark-all-read" });
  }
};
