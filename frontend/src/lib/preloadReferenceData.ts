import type { QueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { queryClient as defaultQueryClient, REFERENCE_DATA_STALE_TIME_MS } from "./queryClient";
import { createQueryScope, queryKeys } from "./queryKeys";
import type { AuthUser } from "../types/auth";

function moduleEnabled(user: AuthUser, moduleKey: string) {
  return user.module_visibility?.[moduleKey] !== false;
}

async function quietPrefetch<T>(client: QueryClient, input: { queryKey: readonly unknown[]; queryFn: () => Promise<T>; enabled?: boolean }) {
  if (input.enabled === false) return;
  try {
    await client.prefetchQuery({
      queryKey: input.queryKey,
      queryFn: input.queryFn,
      staleTime: REFERENCE_DATA_STALE_TIME_MS
    });
  } catch {
    // Background reference preload must never block login or spam user alerts.
  }
}

export function preloadGlobalReferenceData(input: { token: string; user: AuthUser; client?: QueryClient }) {
  const client = input.client ?? defaultQueryClient;
  const scope = createQueryScope(input.token, input.user);
  void quietPrefetch(client, { queryKey: queryKeys.auth.currentUser(scope), queryFn: () => api.me(input.token) });
  void quietPrefetch(client, { queryKey: queryKeys.auth.sessionSettings(scope), queryFn: () => api.getAuthSessionSettings(input.token) });
  void quietPrefetch(client, { queryKey: queryKeys.moduleVisibility(scope), queryFn: () => api.getSyncBootstrap(input.token) });
  void quietPrefetch(client, {
    queryKey: queryKeys.reference.organization(scope),
    queryFn: async () => {
      const [departments, locations, positions, jobLevels] = await Promise.all([
        api.listDepartments(input.token),
        api.listLocations(input.token),
        api.listPositions(input.token),
        api.listJobLevels(input.token)
      ]);
      return {
        departments: departments.departments,
        locations: locations.locations,
        positions: positions.positions,
        jobLevels: jobLevels.job_levels
      };
    }
  });
  void quietPrefetch(client, { queryKey: queryKeys.reference.departments(scope), queryFn: () => api.listDepartments(input.token) });
  void quietPrefetch(client, { queryKey: queryKeys.reference.locations(scope), queryFn: () => api.listLocations(input.token) });
  void quietPrefetch(client, { queryKey: queryKeys.reference.positions(scope), queryFn: () => api.listPositions(input.token) });
  void quietPrefetch(client, { queryKey: queryKeys.reference.jobLevels(scope), queryFn: () => api.listJobLevels(input.token) });
  void quietPrefetch(client, { queryKey: queryKeys.reference.roles(scope), queryFn: () => api.listRoles(input.token) });
  void quietPrefetch(client, { queryKey: queryKeys.reference.permissions(scope), queryFn: () => api.listPermissions(input.token) });
  void quietPrefetch(client, { queryKey: queryKeys.reference.documentTypes(scope), queryFn: () => api.listDocumentTypes(input.token), enabled: moduleEnabled(input.user, "documents") });
  void quietPrefetch(client, { queryKey: queryKeys.reference.documentRequiredRules(scope), queryFn: () => api.listDocumentRequiredRules(input.token), enabled: moduleEnabled(input.user, "document_compliance") || moduleEnabled(input.user, "documents") });
  void quietPrefetch(client, { queryKey: queryKeys.reference.paymentInstitutions(scope), queryFn: () => api.listPaymentInstitutions(input.token), enabled: moduleEnabled(input.user, "payroll") });
  void quietPrefetch(client, { queryKey: queryKeys.reference.approvalWorkflows(scope), queryFn: () => api.listApprovalWorkflows(input.token), enabled: moduleEnabled(input.user, "approvals") });
  void quietPrefetch(client, { queryKey: queryKeys.reference.leaveTypes(scope), queryFn: () => api.listLeaveTypes(input.token), enabled: moduleEnabled(input.user, "leave") });
}
