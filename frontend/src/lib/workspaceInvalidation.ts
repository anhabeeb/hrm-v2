import type { QueryClient } from "@tanstack/react-query";
import { queryClient as defaultQueryClient } from "./queryClient";
import { createQueryScope, queryKeys, type QueryScope } from "./queryKeys";
import type { AuthUser } from "../types/auth";
import type { BackgroundJob } from "../types/background-jobs";

export type WorkspaceSlice =
  | "employee-info"
  | "contacts"
  | "job-assignment"
  | "documents"
  | "document-checklist"
  | "employee-document-summary"
  | "readiness"
  | "contract"
  | "payroll"
  | "payment-methods"
  | "pension"
  | "attendance"
  | "assets"
  | "user-access";

export function workspaceScope(token?: string | null, user?: AuthUser | null) {
  return createQueryScope(token, user);
}

export function applyWorkspacePayload<T extends { workspace?: unknown }>(scope: QueryScope, caseId: string, data: T, client: QueryClient = defaultQueryClient) {
  if (data.workspace) client.setQueryData(queryKeys.onboarding.workspace(scope, caseId), data.workspace);
}

export function invalidateOnboardingWorkspaceSlices(input: {
  scope: QueryScope;
  caseId: string;
  slices: WorkspaceSlice[];
  client?: QueryClient;
}) {
  const client = input.client ?? defaultQueryClient;
  for (const slice of input.slices) void client.invalidateQueries({ queryKey: queryKeys.onboarding.workspaceSlice(input.scope, input.caseId, slice) });
  void client.invalidateQueries({ queryKey: queryKeys.onboarding.readiness(input.scope, input.caseId) });
}

export function invalidateEmployeeProfileSlices(input: {
  scope: QueryScope;
  employeeId: string;
  slices: string[];
  client?: QueryClient;
}) {
  const client = input.client ?? defaultQueryClient;
  for (const slice of input.slices) void client.invalidateQueries({ queryKey: queryKeys.employee.profileSlice(input.scope, input.employeeId, slice) });
  void client.invalidateQueries({ queryKey: queryKeys.employee.workspace(input.scope, input.employeeId) });
}

export function invalidateCommandCenterSummary(scope: QueryScope, client: QueryClient = defaultQueryClient) {
  void client.invalidateQueries({ queryKey: queryKeys.dashboard.commandCenter(scope) });
}

export function invalidateNotificationQueries(scope: QueryScope, client: QueryClient = defaultQueryClient) {
  void client.invalidateQueries({ queryKey: queryKeys.notifications.unreadCount(scope) });
  void client.invalidateQueries({ queryKey: queryKeys.notifications.list(scope) });
}

export function invalidateBackgroundJobTargets(scope: QueryScope, job: BackgroundJob, client: QueryClient = defaultQueryClient) {
  if (job.module_key === "onboarding" && job.entity_type === "onboarding_case" && job.entity_id) {
    invalidateOnboardingWorkspaceSlices({
      scope,
      caseId: job.entity_id,
      slices: ["documents", "document-checklist", "employee-document-summary", "readiness"],
      client
    });
    void client.invalidateQueries({ queryKey: queryKeys.onboarding.workspace(scope, job.entity_id) });
    return;
  }

  if (job.module_key === "documents") {
    void client.invalidateQueries({ queryKey: [...queryKeys.scope(scope), "documents"] });
    void client.invalidateQueries({ queryKey: queryKeys.reference.documentTypes(scope) });
    return;
  }

  if (job.module_key === "attendance") {
    void client.invalidateQueries({ queryKey: [...queryKeys.scope(scope), "attendance"] });
    return;
  }

  if (job.module_key === "reports" || job.module_key === "data_import" || job.module_key === "data_export") {
    void client.invalidateQueries({ queryKey: [...queryKeys.scope(scope), job.module_key] });
  }
}
