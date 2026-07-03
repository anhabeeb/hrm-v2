import type { AuthUser, BootstrapStatus } from "../types/auth";
import { apiClient } from "./apiClient";

export const authApi = {
  getBootstrapStatus() {
    return apiClient.get<BootstrapStatus>("/api/v1/bootstrap/status", { dedupe: false, requestLabel: "bootstrap.status" });
  },
  me(token: string) {
    return apiClient.get<{ user: AuthUser }>("/api/v1/auth/me", { token, dedupe: false, requestLabel: "auth.me" });
  },
  login(input: { email: string; password: string }) {
    return apiClient.post<{ token: string; user: AuthUser }>("/api/v1/auth/login", input, { requestLabel: "auth.login" });
  },
  createOwner(input: { name: string; email: string; password: string }) {
    return apiClient.post<{ token: string; user: AuthUser }>("/api/v1/bootstrap/owner", input, { requestLabel: "bootstrap.owner" });
  },
  logout(token: string) {
    return apiClient.post<{ logged_out: boolean }>("/api/v1/auth/logout", undefined, { token, requestLabel: "auth.logout" });
  }
};
