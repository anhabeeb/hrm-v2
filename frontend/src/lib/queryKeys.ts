import type { AuthUser } from "../types/auth";

export interface QueryScope {
  tenant: string;
  userId: string;
  session: string;
  permissionScope: string;
  employeeId: string;
}

function shortHash(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export function createQueryScope(token?: string | null, user?: AuthUser | null): QueryScope {
  return {
    tenant: "default-company",
    userId: user?.id ?? "anonymous",
    session: token ? shortHash(token.slice(0, 32)) : "anonymous",
    permissionScope: shortHash({
      roles: [...(user?.roles ?? [])].sort(),
      permissions: [...(user?.permissions ?? [])].sort(),
      module_visibility: user?.module_visibility ?? {},
      employee_id: user?.employee_id ?? null
    }),
    employeeId: user?.employee_id ?? "none"
  };
}

export function queryScopeSignature(token?: string | null, user?: AuthUser | null) {
  const scope = createQueryScope(token, user);
  return `${scope.tenant}:${scope.userId}:${scope.session}:${scope.permissionScope}:${scope.employeeId}`;
}

function scopedRoot(scope: QueryScope) {
  return ["hrm-v2", scope.tenant, scope.userId, scope.session, scope.permissionScope] as const;
}

function scopedReferenceRoot(scope: QueryScope) {
  return ["hrm-v2", "reference", scope.tenant, scope.userId, scope.session, scope.permissionScope] as const;
}

export const queryKeys = {
  scope: scopedRoot,
  auth: {
    currentUser: (scope: QueryScope) => [...scopedRoot(scope), "auth", "me"] as const,
    sessionSettings: (scope: QueryScope) => [...scopedRoot(scope), "auth", "session-settings"] as const
  },
  moduleVisibility: (scope: QueryScope) => [...scopedRoot(scope), "modules", "visibility"] as const,
  reference: {
    custom: (scope: QueryScope, key: string) => [...scopedReferenceRoot(scope), key] as const,
    organization: (scope: QueryScope) => [...scopedReferenceRoot(scope), "organization"] as const,
    departments: (scope: QueryScope) => [...scopedReferenceRoot(scope), "departments"] as const,
    locations: (scope: QueryScope) => [...scopedReferenceRoot(scope), "locations"] as const,
    positions: (scope: QueryScope) => [...scopedReferenceRoot(scope), "positions"] as const,
    jobLevels: (scope: QueryScope) => [...scopedReferenceRoot(scope), "job-levels"] as const,
    documentTypes: (scope: QueryScope) => [...scopedReferenceRoot(scope), "document-types"] as const,
    documentRequiredRules: (scope: QueryScope) => [...scopedReferenceRoot(scope), "document-required-rules"] as const,
    paymentInstitutions: (scope: QueryScope, includeArchived = false) => [...scopedReferenceRoot(scope), "payment-institutions", includeArchived ? "with-archived" : "active"] as const,
    approvalWorkflows: (scope: QueryScope) => [...scopedReferenceRoot(scope), "approval-workflows"] as const,
    leaveTypes: (scope: QueryScope) => [...scopedReferenceRoot(scope), "leave-types"] as const,
    roles: (scope: QueryScope) => [...scopedReferenceRoot(scope), "roles"] as const,
    permissions: (scope: QueryScope) => [...scopedReferenceRoot(scope), "permissions"] as const
  },
  onboarding: {
    workspace: (scope: QueryScope, caseId: string) => [...scopedRoot(scope), "onboarding", "workspace", caseId] as const,
    workspaceSlice: (scope: QueryScope, caseId: string, slice: string) => [...scopedRoot(scope), "onboarding", "workspace", caseId, "slice", slice] as const,
    readiness: (scope: QueryScope, caseId: string) => [...scopedRoot(scope), "onboarding", "readiness", caseId] as const
  },
  employee: {
    profile: (scope: QueryScope, employeeId: string) => [...scopedRoot(scope), "employee", employeeId, "profile"] as const,
    workspace: (scope: QueryScope, employeeId: string) => [...scopedRoot(scope), "employee", employeeId, "workspace"] as const,
    profileSlice: (scope: QueryScope, employeeId: string, slice: string) => [...scopedRoot(scope), "employee", employeeId, "workspace", "slice", slice] as const,
    contacts: (scope: QueryScope, employeeId: string) => [...scopedRoot(scope), "employee", employeeId, "contacts"] as const,
    payroll: (scope: QueryScope, employeeId: string) => [...scopedRoot(scope), "employee", employeeId, "payroll"] as const
  },
  dashboard: {
    commandCenter: (scope: QueryScope) => [...scopedRoot(scope), "dashboard", "command-center-summary"] as const
  },
  notifications: {
    unreadCount: (scope: QueryScope) => [...scopedRoot(scope), "notifications", "unread-count"] as const,
    list: (scope: QueryScope, limit = 8) => [...scopedRoot(scope), "notifications", "list", limit] as const
  },
  backgroundJobs: {
    list: (scope: QueryScope, limit = 10) => [...scopedRoot(scope), "background-jobs", "list", limit] as const,
    detail: (scope: QueryScope, jobId: string) => [...scopedRoot(scope), "background-jobs", "detail", jobId] as const
  },
  search: {
    global: (scope: QueryScope, query: string, limit: number) => [...scopedRoot(scope), "search", "global", query, limit] as const
  }
};
