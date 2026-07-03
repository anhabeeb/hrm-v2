import { apiClient } from "./apiClient";

export const sessionApi = {
  getAuthSessionSettings(token: string) {
    return apiClient.get<{ settings: Record<string, unknown>; server_session_expiry_supported: boolean; current_version: number | string }>("/api/v1/auth/session-settings", {
      token,
      requestLabel: "auth.session-settings"
    });
  },
  recordSessionTimeout(token: string) {
    return apiClient.post<{ recorded: boolean }>("/api/v1/auth/session-timeout", undefined, {
      token,
      requestLabel: "auth.session-timeout"
    });
  }
};
